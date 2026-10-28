import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from contextlib import nullcontext
from http.client import HTTPException

from .adapters.example import ExampleFixtureAdapter
from .adapters.myoko_akiya_bank import MyokoAkiyaBankAdapter
from .changes import reconcile
from .storage import load_state, save_json, save_state, state_lock
from .translation import DisabledTranslator, translate_property
from .adapters.base import CrawlBatch
from .customer import customer_properties
from .live import HTMLClient, USER_AGENT, crawl_live


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="HTML-only Myoko property crawler and local fixture tools")
    commands = parser.add_subparsers(dest="command", required=True)
    crawl = commands.add_parser("crawl-fixture", help="Parse invented HTML and reconcile local state")
    crawl.add_argument("fixture", type=Path)
    crawl.add_argument("--source", choices=("example", "myoko_akiya_bank"), default="example",
                       help="Adapter; Myoko accepts HTML or a legacy synthetic index manifest")
    crawl.add_argument("--state", type=Path, default=Path(os.getenv("MYOKO_DATA_DIR", "data")) / "state.json")
    crawl.add_argument("--checked-at", help="Timezone-aware ISO 8601 timestamp (default: UTC now)")
    crawl.add_argument("--complete", action="store_true", help="Confirm this fixture represents the entire source")
    crawl.add_argument("--dry-run", action="store_true", help="Report changes without writing state")
    live = commands.add_parser("crawl-live", help="Fetch only Myoko robots.txt and the sale-card HTML index")
    live.add_argument("--state", type=Path, default=Path(os.getenv("MYOKO_DATA_DIR", "data")) / "myoko-akiya-state.json")
    live.add_argument("--dry-run", action="store_true")
    live.add_argument("--timeout", type=float, default=20)
    live.add_argument("--user-agent", default=os.getenv("MYOKO_USER_AGENT", USER_AGENT))
    export = commands.add_parser("export-customer", help="Export Myoko display fields without listing IDs")
    export.add_argument("--state", type=Path, default=Path(os.getenv("MYOKO_DATA_DIR", "data")) / "myoko-akiya-state.json")
    export.add_argument("--output", type=Path, help="Atomic JSON output; default: stdout")
    sync = commands.add_parser('sync-db', help='Atomically sync saved real Myoko inventory to the private development database')
    sync.add_argument('--state', type=Path, default=Path(os.getenv('MYOKO_DATA_DIR', 'data')) / 'myoko-akiya-state.json')
    sync.add_argument('--env-file', type=Path, default=Path('.env.supabase.local'))
    args = parser.parse_args(argv)
    try:
        if args.command == 'sync-db':
            from .database import sync_database
            if not args.state.is_file():
                raise ValueError('State file does not exist; nothing synchronized')
            result = sync_database(args.state, args.env_file)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        if os.getenv("MYOKO_TRANSLATION_PROVIDER", "disabled") != "disabled":
            raise ValueError("CLI translation must remain disabled; mock is available in Python tests")
        if args.command == "export-customer":
            if args.output and args.output.resolve() == args.state.resolve():
                raise ValueError("Customer output must not overwrite internal state")
            if not args.state.exists():
                raise ValueError("State file does not exist; run the crawler first")
            records = customer_properties(load_state(args.state).properties)
            if args.output:
                save_json(args.output, records)
            else:
                print(json.dumps(records, ensure_ascii=False, indent=2))
            return 0
        if args.command == "crawl-live":
            with nullcontext() if args.dry_run else state_lock(args.state):
                result = crawl_live(load_state(args.state), client=HTMLClient(timeout=args.timeout, user_agent=args.user_agent))
                if not args.dry_run:
                    save_state(args.state, result.reconciliation.state)
            summary = result.reconciliation.summary()
            summary.update({"output_audience": "internal", "dry_run": args.dry_run,
                            "complete_snapshot": result.complete, "warnings": list(result.warnings),
                            "unmapped_locations": sorted({name for p in result.reconciliation.state.properties
                                                          if p.source_key == "myoko_akiya_bank" for name in p.unmapped_locations}),
                            "state_path": str(args.state)})
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 0
        timestamp = args.checked_at
        if timestamp and timestamp.endswith("Z"):
            timestamp = timestamp[:-1] + "+00:00"
        checked_at = datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
        observations = None
        if args.source == "myoko_akiya_bank":
            inspection = MyokoAkiyaBankAdapter().inspect_fixture(args.fixture, checked_at, complete=args.complete)
            batch, observations = inspection.batch, inspection.observations
        else:
            batch = ExampleFixtureAdapter().crawl(args.fixture, checked_at, complete=args.complete)
        translator = DisabledTranslator()
        batch = CrawlBatch(batch.source_key, batch.checked_at,
                           tuple(translate_property(p, translator) for p in batch.properties), batch.complete)
        with nullcontext() if args.dry_run else state_lock(args.state):
            result = reconcile(load_state(args.state), batch)
            if not args.dry_run:
                save_state(args.state, result.state)
        summary = result.summary()
        summary.update({"dry_run": args.dry_run, "complete_snapshot": batch.complete, "state_path": str(args.state)})
        if observations is not None:
            summary.update({"fixture_only": True, "source_observations": list(observations)})
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, LookupError, TypeError, HTTPException) as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 2
