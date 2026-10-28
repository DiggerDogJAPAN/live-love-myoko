"""Versioned local JSON state, atomically replaced; one writer per state file."""

from datetime import datetime
import json
import os
from pathlib import Path
import tempfile
from contextlib import contextmanager
import fcntl

from .changes import PriceChange, State, deduplicate
from .models import Property, utc_datetime


def load_state(path: Path) -> State:
    if not path.exists():
        return State()
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("State must be a JSON object")
    if data.get("version") != 1:
        raise ValueError("Unsupported state version")
    if not isinstance(data.get("properties"), list) or not isinstance(data.get("price_changes"), list):
        raise ValueError("State properties and price changes must be arrays")
    if not isinstance(data.get("source_checked_at"), dict):
        raise ValueError("State source timestamps must be an object")
    properties = tuple(Property.from_dict(item) for item in data["properties"])
    _, duplicates = deduplicate(properties)
    if duplicates:
        raise ValueError("Corrupt state: duplicate properties")
    prices = []
    for item in data["price_changes"]:
        values = dict(item)
        values["detected_at"] = utc_datetime(datetime.fromisoformat(values["detected_at"]))
        for key in ("old_price_jpy", "new_price_jpy"):
            if type(values[key]) is not int or values[key] < 0:
                raise ValueError("Corrupt state: invalid price history")
        prices.append(PriceChange(**values))
    watermarks = {key: utc_datetime(datetime.fromisoformat(value))
                  for key, value in data["source_checked_at"].items()}
    return State(properties, tuple(prices), watermarks)


def save_state(path: Path, state: State) -> None:
    payload = {"version": 1, "properties": [p.to_dict() for p in state.properties],
               "price_changes": [p.to_dict() for p in state.price_changes],
               "source_checked_at": {key: value.isoformat() for key, value in state.source_checked_at.items()}}
    save_json(path, payload)


def save_json(path: Path, payload) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix="." + path.name, suffix=".tmp", delete=False) as handle:
            temp_path = Path(handle.name)
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@contextmanager
def state_lock(path: Path):
    """Serialize cooperating CLI writers on macOS/Linux without blocking."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_name(path.name + ".lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError("Another crawler is writing this state file") from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
