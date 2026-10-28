"""Parse SQL and inspect its design without executing it or connecting anywhere.

The tiny expression interpreter below is a Python contract check of the parsed
eligibility expression. It is NOT a PostgreSQL executor or proof of runtime RLS.
"""

from pathlib import Path
import re
import unicodedata

from pglast import ast, parse_plpgsql, parse_sql
from .validation_manifest import load_validation_order, load_supabase_validation_order


def names(values):
    return tuple(value.sval for value in values or ())


class SchemaDesign:
    def __init__(self, path=Path("sql/001_proposed_schema.sql")):
        self.statements = tuple(item.stmt for item in parse_sql(path.read_text(encoding="utf-8")))
        self.tables = {node.relation.relname: node for node in self.statements if isinstance(node, ast.CreateStmt)}
        self.views = {node.view.relname: node for node in self.statements if isinstance(node, ast.ViewStmt)}
        self.functions = {names(node.funcname): node for node in self.statements if isinstance(node, ast.CreateFunctionStmt)}
        self.policies = {node.policy_name: node for node in self.statements if isinstance(node, ast.CreatePolicyStmt)}
        self.grants = tuple(node for node in self.statements if isinstance(node, ast.GrantStmt))

    def columns(self, table):
        return {node.colname: node for node in self.tables[table].tableElts if isinstance(node, ast.ColumnDef)}

    def constraints(self, table):
        result = []
        for node in self.tables[table].tableElts:
            result.extend(node.constraints or () if isinstance(node, ast.ColumnDef) else ())
            if isinstance(node, ast.Constraint):
                result.append(node)
        return result

    def eligible(self, publication, availability, label):
        function = self.functions[("crawler", "customer_eligible")]
        context = {"publication": publication, "availability": availability, "status_label": label}
        return bool(_expression(function.sql_body.returnval, context))

    def report(self):
        test_statements, test_bodies = parse_future_tests()
        plan = load_validation_order()
        setup_statements, setup_bodies = parse_future_tests(Path(plan["local_setup"][0]["path"]))
        remote_plan = load_supabase_validation_order()
        remote_statements, remote_bodies = parse_future_tests(Path(remote_plan['checks'][0]['path']))
        return {"validation": "static parsing and Python contract simulation only",
                "statements": len(self.statements), "tables": sorted(self.tables),
                "views": sorted(self.views), "prepared_sql_test_statements": test_statements,
                "parsed_plpgsql_test_bodies": test_bodies,
                "local_setup_statements": setup_statements, "local_setup_plpgsql_bodies": setup_bodies,
                "supabase_test_statements": remote_statements, "supabase_test_plpgsql_bodies": remote_bodies,
                "validated_file_order": [entry["path"] for phase in ("local_setup", "schema", "checks") for entry in plan[phase]],
                "sql_executed": False, "database_connected": False}


def parse_future_tests(path=None):
    paths = [path] if path is not None else sorted(Path("sql/tests").glob("*.sql"))
    statements = tuple(statement for filename in paths for statement in parse_sql(filename.read_text(encoding="utf-8")))
    bodies = 0
    for statement in statements:
        if isinstance(statement.stmt, ast.DoStmt):
            body = next(arg.arg.sval for arg in statement.stmt.args if arg.defname == "as")
            parse_plpgsql("CREATE FUNCTION contract_case() RETURNS void AS $contract$" + body + "$contract$ LANGUAGE plpgsql;")
            bodies += 1
    return len(statements), bodies



def _expression(node, context):
    if isinstance(node, ast.A_Const):
        if node.isnull:
            return None
        for field in ("sval", "boolval", "ival"):
            if hasattr(node.val, field):
                return getattr(node.val, field)
    elif isinstance(node, ast.ColumnRef):
        return context[names(node.fields)[0]]
    elif isinstance(node, ast.CoalesceExpr):
        for arg in node.args:
            value = _expression(arg, context)
            if value is not None:
                return value
        return None
    elif isinstance(node, ast.BoolExpr):
        if node.boolop.name != "AND_EXPR":
            raise ValueError("Unsupported SQL boolean expression in contract check")
        values = [_expression(arg, context) for arg in node.args]
        if False in values:
            return False
        return None if None in values else all(values)
    elif isinstance(node, ast.FuncCall):
        if names(node.funcname) != ("pg_catalog", "normalize"):
            raise ValueError("Unsupported SQL function in contract check")
        value, normalization = (_expression(arg, context) for arg in node.args)
        return unicodedata.normalize(normalization, value)
    elif isinstance(node, ast.A_Expr):
        left, right = _expression(node.lexpr, context), _expression(node.rexpr, context)
        if left is None or right is None:
            return None
        operator = names(node.name)
        if operator == ("=",):
            return left == right
        if operator == ("~*",):
            # Only this declared POSIX class is supported by the contract model.
            pattern = right.replace("[[:space:]]", r"\s")
            return re.search(pattern, left, re.IGNORECASE) is not None
    raise ValueError("Unsupported SQL AST node: " + type(node).__name__)
