from unittest import TestCase
from unittest.mock import Mock, patch
from types import SimpleNamespace
from myoko_property_crawler.daily import apply_live
from myoko_property_crawler.db_connection import PreflightError, settings_from_values
from myoko_property_crawler.changes import State

class DailyTests(TestCase):
    def test_partial_never_calls_database_apply(self):
        with patch('myoko_property_crawler.daily.crawl_live', return_value=SimpleNamespace(complete=False)), patch('myoko_property_crawler.daily._apply') as apply:
            with self.assertRaises(PreflightError):
                apply_live(Mock(), State())
            apply.assert_not_called()

    def test_failed_fetch_never_calls_database_apply(self):
        with patch('myoko_property_crawler.daily.crawl_live', side_effect=ValueError('bad source')), patch('myoko_property_crawler.daily._apply') as apply:
            with self.assertRaises(ValueError):
                apply_live(Mock(), State())
            apply.assert_not_called()

    def test_dedicated_pooler_login_accepts_verified_tls(self):
        settings = settings_from_values({'MYOKO_DATABASE_URL':'postgresql://myoko_crawler.'+'a'*20+':synthetic@aws-0-test.pooler.supabase.com:5432/postgres', 'MYOKO_SUPABASE_PROJECT_REF':'a'*20, 'MYOKO_SUPABASE_PROJECT_NAME':'Myoko Property Finder'})
        self.assertEqual(settings.connection_mode, 'session_pooler')
