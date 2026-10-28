"""Offline Phase 4A report. No SQL executor, database driver or network client."""

import argparse
import hashlib
import json
from pathlib import Path

from myoko_property_crawler.customer import is_customer_eligible
from myoko_property_crawler.storage import load_state
from .schema_checks import SchemaDesign


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=Path("data/myoko-akiya-state.json"))
    args = parser.parse_args()
    design = SchemaDesign()
    report = design.report()
    if args.state.exists():
        before = args.state.read_bytes()
        state = load_state(args.state)
        records = [p for p in state.properties if p.source_key == "myoko_akiya_bank"]
        sql_eligible = [p for p in records if design.eligible(p.listing_status.value, p.availability_status.value, p.source_status_ja)]
        python_eligible = [p for p in records if is_customer_eligible(p)]
        if sql_eligible != python_eligible:
            raise ValueError("Proposed eligibility contract differs from current Python output")
        if before != args.state.read_bytes():
            raise ValueError("State file changed during read-only validation")
        report.update({"internal_records": len(records), "eligible_records": len(sql_eligible),
                       "state_unchanged": True, "state_sha256": hashlib.sha256(before).hexdigest()})
    else:
        report["snapshot_check"] = "not performed: state file absent"
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
