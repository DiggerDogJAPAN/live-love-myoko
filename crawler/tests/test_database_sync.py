"""Small offline regressions for sync identity/history; no database fixtures."""

from dataclasses import replace
from datetime import timedelta
import unittest
from unittest.mock import patch

from myoko_property_crawler.changes import PriceChange, State
from myoko_property_crawler.database import SOURCE, SyncError, prepare_sync, history_covers_transition
from myoko_property_crawler.db_connection import Settings, PreflightError, connect_database
from myoko_property_crawler.models import ContentPermission
from .helpers import DAY_ONE, initial_batch


def prop(number='501'):
    return replace(initial_batch().properties[0], source_key=SOURCE,
        source_agency_name='Myoko Akiya Bank', source_property_id=number,
        original_listing_url='https://www.city.myoko.niigata.jp/fs/offline-test/'+number+'.pdf',
        description_ja=None, description_en=None, main_image_url=None,
        description_permission=ContentPermission.UNKNOWN, image_permission=ContentPermission.UNKNOWN)


class DatabaseSyncTests(unittest.TestCase):
    def test_snapshot_identity_is_repeatable_and_independent_of_record_order(self):
        a,b=prop(),prop('502')
        first=State((a,b),(),{SOURCE:DAY_ONE})
        second=State((b,a),(),{SOURCE:DAY_ONE})
        self.assertEqual(prepare_sync(first)[3],prepare_sync(second)[3])
        changed=State((replace(a,asking_price_jpy=1),b),(),{SOURCE:DAY_ONE})
        self.assertNotEqual(prepare_sync(first)[3],prepare_sync(changed)[3])

    def test_synthetic_or_uncheckpointed_inventory_is_rejected(self):
        good=prop()
        fixture=replace(good,original_listing_url='https://www.city.myoko.niigata.jp/fs/fixture-only/501.pdf')
        for state in (State((fixture,),(),{SOURCE:DAY_ONE}),State((good,)),State()):
            with self.subTest(state=state),self.assertRaises(SyncError):
                prepare_sync(state)

    def test_local_price_chain_avoids_duplicate_database_summary_event(self):
        p=replace(prop(),asking_price_jpy=80,last_checked_at=DAY_ONE+timedelta(days=2))
        old={'asking_price_jpy':100,'last_checked_at':DAY_ONE}
        events=[PriceChange(SOURCE,p.identity[1],p.original_listing_url,100,90,DAY_ONE+timedelta(days=1)),
                PriceChange(SOURCE,p.identity[1],p.original_listing_url,90,80,p.last_checked_at)]
        self.assertTrue(history_covers_transition(old,p,events))
        self.assertFalse(history_covers_transition(old,p,events[1:]))

    def test_client_failure_never_exposes_connection_credentials(self):
        try:
            import psycopg
        except ImportError:
            self.skipTest('Optional database client not installed')
        secret='SYNTHETIC_DATABASE_PASSWORD'
        with patch('psycopg.connect',side_effect=psycopg.OperationalError(secret)):
            with self.assertRaises(PreflightError) as caught:
                connect_database(Settings(secret,'a'*20,'session_pooler','system'))
        self.assertNotIn(secret,str(caught.exception))
