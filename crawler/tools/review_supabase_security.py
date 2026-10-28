"""Read-only helper review; raw definitions stay private and are never printed.

No function is invoked, no role is changed, and no SQL migration is executed.
"""

import hashlib
import json
import os
from pathlib import Path
import sys

from .supabase_preflight import PreflightError, inspect_database, load_settings
from .validation_manifest import load_supabase_validation_order


def review_helpers(inventory, baseline):
    """Require exact reviewed definitions AND ACLs, never just familiar names."""
    actual = {}
    for row in inventory['helper_definitions']:
        identity = row['schema'] + '.' + row['name'] + '(' + row['arguments'] + ')'
        actual[identity] = {**{key: row[key] for key in ('owner', 'privileges', 'search_path')},
                            'definition_sha256': hashlib.sha256(row['definition'].encode()).hexdigest()}
    expected = baseline['helpers']
    drift = sorted(key for key in set(actual) | set(expected) if actual.get(key) != expected.get(key))
    known = {(row['schema'], row['name']) for row in inventory['helper_definitions']}
    # Do not suppress unexpected application functions merely because the
    # reviewed helpers happen to match.
    from .supabase_preflight import assess_inventory
    unreviewed = [row for row in assess_inventory(inventory)['application_function_candidates']
                  if (row['schema'], row['name']) not in known]
    return {'helper_drift': drift, 'unreviewed_function_candidates': unreviewed,
            'event_trigger_drift': inventory['event_triggers'] != baseline['event_triggers'],
            'reviewed_helpers_match': not drift and not unreviewed
                and inventory['event_triggers'] == baseline['event_triggers'],
            'data_api_dashboard_confirmation_required': True, 'migration_approved': False}


def safe_summary(inventory):
    helpers = []
    for row in inventory['helper_definitions']:
        # Explicit metadata allowlist: neither source bodies nor arbitrary
        # function configuration values may appear in console output.
        helpers.append({**{key: row[key] for key in ('schema', 'name', 'result_type', 'owner', 'security_definer', 'search_path')},
                        'definition_sha256': hashlib.sha256(row['definition'].encode()).hexdigest()})
    return {'identity': inventory['identity'], 'helpers': helpers,
            **{key: inventory[key] for key in ('event_triggers', 'schema_effective_access',
                'helper_effective_execute', 'api_session_settings', 'api_role_settings', 'publications',
                'role_creation_defaults')},
            'database_changed': False}


def main():
    try:
        load_supabase_validation_order()
        settings = load_settings()
        inventory = inspect_database(settings, review_security=True)
        baseline = json.loads(Path('sql/supabase/reviewed-helpers.json').read_text(encoding='utf-8'))
        # A fresh exclusive file prevents following an existing output symlink.
        directory = Path('data')
        directory.mkdir(exist_ok=True)
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='supabase-security-',
                                         suffix='.json', dir=directory, delete=False) as output:
            os.chmod(output.name, 0o600)
            json.dump(inventory, output, indent=2)
            name = output.name
        summary = safe_summary(inventory)
        summary['review'] = review_helpers(inventory, baseline)
        summary['private_inventory_file'] = name
        print(json.dumps(summary, indent=2))
        return 0
    except (PreflightError, OSError, ValueError, KeyError):
        error = sys.exc_info()[1]
        message = str(error) if isinstance(error, PreflightError) else 'Local review configuration/artifact failure; details suppressed'
        print('Security review stopped: ' + message, file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
