"""Generate reviewed SQL locally. Never connects to or executes against a database."""

import hashlib
from pathlib import Path

from pglast import ast, parse_sql
from .validation_manifest import load_supabase_validation_order


def build_rehearsal():
    plan = load_supabase_validation_order()
    schema = Path(plan['schema'][0]['path']).read_text(encoding='utf-8')
    checks = Path(plan['checks'][0]['path']).read_text(encoding='utf-8')
    creation, validation = parse_sql(schema), parse_sql(checks)
    for statements, final_kind in ((creation, 'TRANS_STMT_COMMIT'), (validation, 'TRANS_STMT_ROLLBACK')):
        if (not isinstance(statements[0].stmt, ast.TransactionStmt)
                or statements[0].stmt.kind.name != 'TRANS_STMT_BEGIN'
                or not isinstance(statements[-1].stmt, ast.TransactionStmt)
                or statements[-1].stmt.kind.name != final_kind
                or any(isinstance(x.stmt, ast.TransactionStmt) for x in statements[1:-1])):
            raise ValueError('Expected exactly one explicit transaction in each reviewed file')
    # Discard only the schema COMMIT and the tests BEGIN, using parsed locations.
    # The schema BEGIN now encloses role/schema creation AND all synthetic checks.
    rehearsal = ('-- APPROVAL REQUIRED. Whole rehearsal rolls back schemas, roles, grants and fictional rows.\n'
                 + schema[:creation[-1].stmt_location]
                 + '\n-- Synthetic checks continue in the same transaction.\n'
                 + checks[validation[0].stmt_location + validation[0].stmt_len + 1:])
    statements = parse_sql(rehearsal)
    if [x.stmt.kind.name for x in statements if isinstance(x.stmt, ast.TransactionStmt)] != [
            'TRANS_STMT_BEGIN', 'TRANS_STMT_ROLLBACK']:
        raise ValueError('Rehearsal must have no commit or nested transaction')
    return rehearsal


def main():
    sql = build_rehearsal()
    digest = hashlib.sha256(sql.encode()).hexdigest()
    Path('data').mkdir(exist_ok=True)
    path = Path('data') / ('supabase-rollback-rehearsal-' + digest[:12] + '.sql')
    if path.exists() or path.is_symlink():
        raise ValueError('Rehearsal artifact already exists; review the existing file')
    with path.open('x', encoding='utf-8') as output:
        output.write(sql)
    print(str(path) + '\nSHA-256: ' + digest + '\nGenerated locally; NOT EXECUTED.')


if __name__ == '__main__':
    main()
