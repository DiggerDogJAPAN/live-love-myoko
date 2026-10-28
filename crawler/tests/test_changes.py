from dataclasses import replace
from datetime import timedelta
import unittest

from myoko_property_crawler.adapters.base import CrawlBatch
from myoko_property_crawler.changes import DuplicateConflict, State, reconcile
from myoko_property_crawler.models import ListingStatus
from .helpers import DAY_ONE, DAY_TWO, initial_batch, updated_batch


class ChangeTests(unittest.TestCase):
    def setUp(self):
        self.initial = initial_batch()
        self.state = reconcile(State(), self.initial).state

    def test_price_change_and_complete_absence(self):
        result = reconcile(self.state, updated_batch())
        self.assertEqual(len(result.price_changes), 1)
        change = result.price_changes[0]
        self.assertEqual((change.old_price_jpy, change.new_price_jpy), (12000000, 11000000))
        self.assertEqual(result.marked_not_found, 1)
        indexed = {p.source_property_id: p for p in result.state.properties}
        self.assertEqual(indexed["JO-002"].listing_status, ListingStatus.NOT_FOUND)
        self.assertEqual(indexed["MY-001"].first_discovered_at, DAY_ONE)
        self.assertEqual(indexed["MY-001"].last_checked_at, DAY_TWO)
        self.assertEqual(len(result.state.price_changes), 1)

    def test_partial_batch_does_not_mark_absent(self):
        result = reconcile(self.state, updated_batch(complete=False))
        self.assertEqual(result.marked_not_found, 0)
        land = next(p for p in result.state.properties if p.source_property_id == "JO-002")
        self.assertEqual(land.last_checked_at, DAY_ONE)
        self.assertEqual(land.listing_status, ListingStatus.ACTIVE)

    def test_replay_is_idempotent(self):
        first = reconcile(self.state, updated_batch())
        second = reconcile(first.state, updated_batch())
        self.assertEqual(second.price_changes, ())
        self.assertEqual(second.state, first.state)
        self.assertEqual(second.discovered, 0)
        self.assertEqual(second.updated, 0)

    def test_exact_duplicates_are_collapsed(self):
        batch = replace(self.initial, properties=self.initial.properties + (self.initial.properties[0],))
        result = reconcile(State(), batch)
        self.assertEqual(result.discovered, 3)
        self.assertEqual(result.duplicates_ignored, 1)

    def test_conflicting_duplicate_is_rejected_without_mutation(self):
        prop = replace(self.initial.properties[0], asking_price_jpy=1)
        batch = replace(self.initial, properties=self.initial.properties + (prop,))
        with self.assertRaises(DuplicateConflict):
            reconcile(self.state, batch)
        self.assertEqual(self.state.properties[1].asking_price_jpy, 12000000)

    def test_same_url_different_ids_and_identity_drift_are_rejected(self):
        prop = replace(self.initial.properties[0], source_property_id="DIFFERENT")
        with self.assertRaises(DuplicateConflict):
            reconcile(State(), replace(self.initial, properties=(self.initial.properties[0], prop)))
        with self.assertRaises(DuplicateConflict):
            reconcile(self.state, replace(self.initial, properties=(prop,)))

    def test_same_id_different_urls_is_a_conflict_within_batch(self):
        prop = replace(self.initial.properties[0], original_listing_url="https://example.invalid/another")
        with self.assertRaises(DuplicateConflict):
            reconcile(State(), replace(self.initial, properties=(self.initial.properties[0], prop)))

    def test_cross_source_properties_are_not_auto_merged_or_marked_missing(self):
        other = replace(self.initial.properties[0], source_key="other")
        state = reconcile(State(), CrawlBatch("other", DAY_ONE, (other,))).state
        result = reconcile(state, self.initial)
        self.assertEqual(len(result.state.properties), 4)
        self.assertEqual(next(p for p in result.state.properties if p.source_key == "other"), other)

    def test_unknown_price_is_not_a_zero_price_change(self):
        for old_price, new_price in ((12000000, None), (None, 12000000)):
            old = replace(self.initial.properties[0], asking_price_jpy=old_price)
            new = replace(old, asking_price_jpy=new_price, last_checked_at=DAY_TWO)
            state = reconcile(State(), CrawlBatch("example", DAY_ONE, (old,))).state
            self.assertEqual(reconcile(state, CrawlBatch("example", DAY_TWO, (new,))).price_changes, ())

    def test_older_batches_are_rejected_including_empty_batches(self):
        state = reconcile(self.state, updated_batch()).state
        with self.assertRaises(ValueError):
            reconcile(state, self.initial)
        with self.assertRaises(ValueError):
            reconcile(state, CrawlBatch("example", DAY_ONE, (), complete=True))

    def test_source_and_timestamp_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            CrawlBatch("another", DAY_ONE, self.initial.properties)
        with self.assertRaises(ValueError):
            CrawlBatch("example", DAY_TWO, self.initial.properties)

    def test_reappearance_is_active_and_preserves_first_discovery(self):
        state = reconcile(self.state, updated_batch()).state
        day_three = DAY_TWO + timedelta(days=1)
        returned = replace(self.initial.properties[1], last_checked_at=day_three)
        result = reconcile(state, CrawlBatch("example", day_three, (returned,)))
        prop = next(p for p in result.state.properties if p.source_property_id == "JO-002")
        self.assertEqual(prop.listing_status, ListingStatus.ACTIVE)
        self.assertEqual(prop.first_discovered_at, DAY_ONE)
        self.assertEqual(result.status_changes, 1)

    def test_explicit_sold_state_not_rewritten_by_absence(self):
        sold = replace(self.initial.properties[0], listing_status=ListingStatus.SOLD)
        state = reconcile(State(), CrawlBatch("example", DAY_ONE, (sold,))).state
        result = reconcile(state, CrawlBatch("example", DAY_TWO, (), complete=True))
        self.assertEqual(result.state.properties[0].listing_status, ListingStatus.SOLD)

    def test_translation_is_preserved_or_invalidated_by_source_change(self):
        old = replace(self.initial.properties[0], title_en="Mock title")
        state = reconcile(State(), CrawlBatch("example", DAY_ONE, (old,))).state
        new = replace(old, title_en=None, last_checked_at=DAY_TWO)
        result = reconcile(state, CrawlBatch("example", DAY_TWO, (new,)))
        self.assertEqual(result.state.properties[0].title_en, "Mock title")
        changed = replace(new, title_ja="変更した架空のタイトル")
        result = reconcile(state, CrawlBatch("example", DAY_TWO, (changed,)))
        self.assertIsNone(result.state.properties[0].title_en)
