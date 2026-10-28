"""Standard-library checksum checks only; never connects or executes SQL."""

from pathlib import Path
import hashlib
import json


def _load_order(path, target, phases):
    plan = json.loads(path.read_text(encoding="utf-8"))
    if plan.get("version") != 1 or plan.get("target") != target:
        raise ValueError("Unexpected validation plan target")
    seen = set()
    root = Path.cwd().resolve()
    for phase in phases:
        entries = plan.get(phase)
        if not isinstance(entries, list) or not entries:
            raise ValueError("Missing validation phase: " + phase)
        for entry in entries:
            filename = entry["path"]
            relative = Path(filename)
            if relative.is_absolute() or ".." in relative.parts or filename in seen:
                raise ValueError("Unsafe or duplicate validation path")
            candidate = (root / relative).resolve()
            if root not in candidate.parents or candidate.suffix != ".sql":
                raise ValueError("Validation paths must be SQL files inside the project")
            if hashlib.sha256(candidate.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("Validation file checksum mismatch: " + filename)
            seen.add(filename)
    return plan


def load_validation_order(path=Path("sql/validation-order.json")):
    """Read/check the local manifest only. There is deliberately no SQL runner."""
    return _load_order(path, "disposable_local_cluster", ("local_setup", "schema", "checks"))


def load_supabase_validation_order(path=Path("sql/supabase/validation-order.json")):
    plan = _load_order(path, "supabase_project", ("schema", "checks"))
    if (plan.get("local_setup") or plan.get("approval_required") is not True
            or plan.get("readonly_preflight_required") is not True
            or plan.get("project_name") != "Myoko Property Finder"
            or plan.get("real_property_import") is not False):
        raise ValueError("Supabase plan must require approval, exclude local bootstrap and prohibit real imports")
    if any(entry["path"].startswith("sql/local/") for phase in ("schema", "checks") for entry in plan[phase]):
        raise ValueError("Local superuser bootstrap must never be part of the Supabase plan")
    return plan
