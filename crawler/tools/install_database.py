"""Explicit fresh development installation. No import and no API configuration changes."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

from myoko_property_crawler.db_connection import connect_database, load_settings, PreflightError
from .validation_manifest import load_supabase_validation_order


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    args = parser.parse_args(argv)
    connection = None
    stage = 'configuration'
    try:
        plan = load_supabase_validation_order()
        path = Path(plan['schema'][0]['path'])
        sql = path.read_text(encoding='utf-8')
        settings = load_settings()
        connection = connect_database(settings, application_name='myoko-development-schema-install')
        stage = 'fresh-install check'
        with connection.transaction():
            connection.execute('SET TRANSACTION READ ONLY')
            identity = connection.execute("""SELECT current_database() AS db, current_user AS actor,
                current_setting('server_version_num')::int AS version""").fetchone()
            if identity['db'] != 'postgres' or identity['actor'] != 'postgres' or identity['version'] < 170000:
                raise PreflightError('Expected the verified PostgreSQL 17+ development target and postgres actor')
            conflicts = connection.execute("""SELECT nspname AS name FROM pg_namespace WHERE nspname IN ('crawler','property_api')
                UNION ALL SELECT rolname FROM pg_roles WHERE rolname IN ('crawler_writer','crawler_customer_reader')
                UNION ALL SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p','f','m','v','S')""").fetchall()
            if conflicts:
                raise PreflightError('Fresh-install conflicts found; nothing applied. Use sync-db if already installed')
        stage = 'atomic schema installation'
        try:
            connection.execute(sql, prepare=False)
        except Exception:
            connection.execute('ROLLBACK')
            raise
        report = {'installed': True, 'project_name': 'Myoko Property Finder', 'project_ref': settings.project_ref,
            'schema_file': str(path), 'schema_sha256': hashlib.sha256(sql.encode()).hexdigest(),
            'tables': ['sources','properties','crawl_runs','price_changes','status_changes','translations'],
            'schemas': ['crawler','property_api'], 'tls_mode': 'verify-full', 'data_api_configuration_changed': False}
        Path('data').mkdir(exist_ok=True)
        Path('data/phase5-installation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
        return 0
    except Exception as error:
        code = getattr(error, 'sqlstate', None)
        suffix = (' SQLSTATE ' + code) if code and len(code)==5 and code.isalnum() else ''
        message = str(error) if isinstance(error, PreflightError) else 'Database operation failed; raw details suppressed'
        print('Installation stopped during '+stage+': '+message+suffix, file=sys.stderr)
        return 2
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


if __name__ == '__main__':
    raise SystemExit(main())
