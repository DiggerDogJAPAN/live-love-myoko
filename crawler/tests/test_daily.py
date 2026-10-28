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
            with self.assertRaises(PreflightError):
                apply_live(Mock(), State())
            apply.assert_not_called()

    def test_dedicated_pooler_login_accepts_verified_tls(self):
        settings = settings_from_values({'MYOKO_DATABASE_URL':'postgresql://myoko_crawler.'+'a'*20+':synthetic@aws-0-test.pooler.supabase.com:5432/postgres', 'MYOKO_SUPABASE_PROJECT_REF':'a'*20, 'MYOKO_SUPABASE_PROJECT_NAME':'Myoko Property Finder'})
        self.assertEqual(settings.connection_mode, 'session_pooler')

    def test_temporarily_closed_viewings_stay_published_but_excluded(self):
        from pathlib import Path
        from myoko_property_crawler.adapters.myoko_akiya_bank import MyokoAkiyaBankAdapter
        from myoko_property_crawler.customer import is_customer_eligible
        from .helpers import DAY_ONE
        html = (Path(__file__).parent/'fixtures/myoko_akiya_bank/initial.html').read_text()
        html = html.replace('>NEW<', '>内覧受付一時中止 Applications Temporarily Closed<')
        prop = MyokoAkiyaBankAdapter().parse_html(html, DAY_ONE, complete=True).batch.properties[0]
        self.assertEqual(prop.listing_status.value, 'active')
        self.assertEqual(prop.availability_status.value, 'viewings_closed')
        self.assertEqual(prop.source_status_ja, '内覧受付一時中止')
        self.assertFalse(is_customer_eligible(prop))
