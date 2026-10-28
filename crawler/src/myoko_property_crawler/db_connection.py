"""Private database configuration shared by admin tools and the crawler sync.

No shell evaluation or credential logging; verified TLS is mandatory.
"""

from dataclasses import dataclass, field
import os
from pathlib import Path
import re
import stat
from urllib.parse import parse_qs, unquote, urlsplit

ENV_KEYS = {"MYOKO_DATABASE_URL", "MYOKO_SUPABASE_PROJECT_REF", "MYOKO_SUPABASE_PROJECT_NAME", "MYOKO_DB_SSLROOTCERT"}
PROJECT_NAME = "Myoko Property Finder"



class PreflightError(ValueError):
    """A message safe to print: never wrap/echo an untrusted exception string."""


@dataclass(frozen=True)
class Settings:
    dsn: str = field(repr=False)
    project_ref: str
    connection_mode: str
    sslrootcert: str = field(repr=False)


def read_private_env(path):
    if not path.exists():
        return {}
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise PreflightError("Private environment file must be a regular file, not a symlink")
    if info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise PreflightError("Private environment file must be owner-only; use chmod 600")
    result = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise PreflightError("Invalid environment file format; use KEY=value without shell commands")
        key, value = (part.strip() for part in line.split("=", 1))
        if key not in ENV_KEYS or key in result:
            raise PreflightError("Unknown or duplicate environment setting")
        if value[:1] in {"'", '"'}:
            if len(value) < 2 or value[-1] != value[0]:
                raise PreflightError("Unclosed environment value quotation")
            value = value[1:-1]
        result[key] = value
    return result


def settings_from_values(values):
    ref = values.get("MYOKO_SUPABASE_PROJECT_REF", "").strip()
    if not re.fullmatch(r"[a-z0-9]{20}", ref):
        raise PreflightError("Set the expected 20-character project reference independently from the dashboard")
    if values.get("MYOKO_SUPABASE_PROJECT_NAME", "").strip() != PROJECT_NAME:
        raise PreflightError("Expected project name must be Myoko Property Finder; confirm its dashboard reference")
    dsn = values.get("MYOKO_DATABASE_URL", "").strip()
    if not dsn:
        raise PreflightError("Set MYOKO_DATABASE_URL in the private environment file; do not paste it into chat")
    try:
        uri = urlsplit(dsn)
        port = uri.port or 5432
        user = unquote(uri.username or "")
        password = unquote(uri.password or "")
        query = parse_qs(uri.query, keep_blank_values=True, strict_parsing=True) if uri.query else {}
    except (ValueError, UnicodeError):
        raise PreflightError("Invalid PostgreSQL URI; percent-encode password characters") from None
    if uri.scheme not in {"postgres", "postgresql"} or not password or uri.fragment or unquote(uri.path) != "/postgres":
        raise PreflightError("Expected the project's PostgreSQL URI for database postgres with an encoded password")
    if any(char in dsn for char in ("\n", "\r", "\x00")):
        raise PreflightError("Invalid control characters in connection settings")
    if port != 5432:
        raise PreflightError("Use direct or session-pooler port 5432; transaction pooling is unsuitable for admin validation")
    if uri.hostname == "db." + ref + ".supabase.co" and user in {"postgres", "myoko_crawler"}:
        mode = "direct"
    elif re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", uri.hostname or "") and user in {"postgres." + ref, "myoko_crawler." + ref}:
        mode = "session_pooler"
    else:
        raise PreflightError("Connection host/user does not match the independently expected Supabase project reference")
    if set(query) - {"sslmode", "sslrootcert"} or any(len(v) != 1 for v in query.values()):
        raise PreflightError("Unsupported URI options; use only sslmode/sslrootcert and no alternate hosts or services")
    if query.get("sslmode", ["verify-full"])[0] not in {"require", "verify-ca", "verify-full"}:
        raise PreflightError("TLS cannot be disabled; the preflight always enforces verify-full")
    root = values.get("MYOKO_DB_SSLROOTCERT", "").strip() or query.get("sslrootcert", ["system"])[0]
    if root != "system":
        certificate = Path(root)
        if not certificate.is_absolute() or not certificate.is_file():
            raise PreflightError("TLS root certificate must be system or an existing absolute CA file path")
    return Settings(dsn, ref, mode, root)


def load_settings(path=Path(".env.supabase.local"), environ=None):
    values = read_private_env(path)
    process = os.environ if environ is None else environ
    if any(process.get(key) for key in ("PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS")):
        raise PreflightError("Unset ambient PostgreSQL service/routing/options variables before using the dedicated project configuration")
    values.update({key: process[key] for key in ENV_KEYS if key in process})
    return settings_from_values(values)


def connect_database(settings, *, application_name="myoko-crawler-sync"):
    """Administrative CLI transport; never put this configuration in a browser."""
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        raise PreflightError("Install the optional database client from requirements-database.txt") from None
    try:
        connection = psycopg.connect(settings.dsn, sslmode="verify-full", sslrootcert=settings.sslrootcert,
            connect_timeout=10, application_name=application_name, autocommit=True,
            prepare_threshold=None, row_factory=dict_row)
    except psycopg.Error:
        raise PreflightError("Verified database connection failed; check network, trusted CA and private credentials") from None
    if not connection.pgconn.ssl_in_use:
        connection.close()
        raise PreflightError("Verified TLS was not established")
    if "myoko_crawler" in settings.dsn.split("@", 1)[0]:
        connection.execute("SET ROLE crawler_writer")
    return connection
