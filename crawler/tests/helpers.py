from datetime import datetime, timezone
from pathlib import Path

from myoko_property_crawler.adapters.example import ExampleFixtureAdapter

FIXTURES = Path(__file__).parent / "fixtures"
DAY_ONE = datetime(2026, 10, 27, 0, 0, tzinfo=timezone.utc)
DAY_TWO = datetime(2026, 10, 28, 0, 0, tzinfo=timezone.utc)


def initial_batch():
    return ExampleFixtureAdapter().crawl(FIXTURES / "initial.html", DAY_ONE, complete=True)


def updated_batch(complete=True):
    return ExampleFixtureAdapter().crawl(FIXTURES / "updated.html", DAY_TWO, complete=complete)
