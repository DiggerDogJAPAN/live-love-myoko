"""Focused thumbnail association, reviewed-name and upgrade contracts (offline)."""

from dataclasses import replace
from pathlib import Path
import unittest
from unittest.mock import patch

from myoko_property_crawler.adapters.myoko_akiya_bank import MyokoAkiyaBankAdapter
from myoko_property_crawler.customer import customer_property
from myoko_property_crawler.database import prepare_sync
from myoko_property_crawler.changes import State
from myoko_property_crawler.locations import english_location, reviewed_location, LOCATION_DISPLAY_FIELDS
from myoko_property_crawler.models import ContentPermission
from .helpers import FIXTURES, DAY_ONE


class ThumbnailLocationTests(unittest.TestCase):
    def setUp(self):
        self.html=(FIXTURES/'myoko_akiya_bank/initial.html').read_text()
        self.adapter=MyokoAkiyaBankAdapter()

    def parse(self,html):
        with patch('socket.socket',side_effect=AssertionError('Media/network access forbidden')):
            return self.adapter.parse_html(html,DAY_ONE,complete=True).batch.properties

    def test_verified_neighbourhoods_are_used_by_actual_card_extraction(self):
        expected={'石塚町':'Ishizukacho','経塚町':'Kyozukacho','白山町':'Hakusancho','小出雲':'Oizumo',
            '美守':'Hidanomori','栗原':'Kurihara','学校町':'Gakkocho','上馬場':'Kamibaba','籠町':'Kagomachi',
            '関川':'Sekigawa','朝日町':'Asahicho','杉野沢':'Suginosawa','中央町':'Chuocho','雪森':'Yukimori',
            '月岡':'Tsukioka','田口':'Taguchi'}
        for japanese,english in expected.items():
            with self.subTest(japanese=japanese):
                prop=self.parse(self.html.replace('架空地区甲',japanese))[0]
                self.assertEqual((prop.area,prop.area_en),(japanese,english))
                self.assertEqual(prop.unmapped_locations,())
                self.assertEqual(customer_property(prop)['location_display'],english)

    def test_unknown_or_ambiguous_name_is_not_guessed(self):
        for name in ('田口付近','美守周辺','未確認地区'):
            self.assertIsNone(english_location(name))
            prop=self.parse(self.html.replace('架空地区甲',name))[0]
            self.assertEqual(prop.unmapped_locations,(name,))
            self.assertEqual(customer_property(prop)['location_display'],name)

    def test_enrichment_changes_only_derived_fields_and_retains_other_review_flags(self):
        original=replace(self.parse(self.html)[0],area='美守',unmapped_locations=('美守','別の要確認項目'))
        enriched=reviewed_location(original)
        self.assertEqual(enriched.area_en,'Hidanomori')
        self.assertEqual(enriched.unmapped_locations,('別の要確認項目',))
        for key,value in original.to_dict().items():
            if key not in LOCATION_DISPLAY_FIELDS:
                self.assertEqual(enriched.to_dict()[key],value,key)
        self.assertEqual(reviewed_location(enriched),enriched)

    def test_archived_state_sync_uses_dictionary_without_changing_observation_time(self):
        prop=replace(self.parse(self.html)[0],area='石塚町',source_property_id='501',
            original_listing_url='https://www.city.myoko.niigata.jp/fs/offline-test/501.pdf',
            unmapped_locations=('石塚町',))
        state=State((prop,),(),{'myoko_akiya_bank':DAY_ONE})
        properties,_,checkpoint,digest=prepare_sync(state)
        self.assertEqual(properties[0].area_en,'Ishizukacho')
        self.assertEqual((properties[0].first_discovered_at,properties[0].last_checked_at,checkpoint),(DAY_ONE,DAY_ONE,DAY_ONE))
        self.assertEqual(digest,prepare_sync(state)[3])
        self.assertIsNone(state.properties[0].area_en)

    def test_generic_image_filename_stays_associated_with_its_own_card(self):
        props=self.parse(self.html.replace('900001.jpg','______photo.jpg'))
        self.assertTrue(props[0].main_image_url.endswith('/______photo.jpg'))
        self.assertTrue(props[1].main_image_url.endswith('/900002.png'))
        self.assertTrue(props[0].original_listing_url.endswith('/900001.pdf'))

    def test_missing_image_preserves_listing_eligibility_and_other_card_images(self):
        html=self.html.replace('<img src="/fs/fixture-only/_/900001.jpg" alt="架空画像への参照、ファイルは存在しません" />','')
        props=self.parse(html)
        self.assertIsNone(customer_property(props[0])['thumbnail_url'])
        self.assertTrue(props[1].main_image_url.endswith('/900002.png'))

    def test_customer_projection_masks_unpermitted_images(self):
        prop=replace(self.parse(self.html)[0],image_permission=ContentPermission.SYNTHETIC)
        self.assertIsNone(customer_property(prop)['thumbnail_url'])

    def test_upgrade_keeps_view_contract_and_adds_only_read_only_input_grant(self):
        try:
            from pglast import ast,parse_sql
        except ImportError:
            self.skipTest('Optional SQL parser not installed')
        from tools.schema_checks import names,parse_future_tests
        path=Path('sql/migrations/002_thumbnails_english_locations.sql')
        nodes=[x.stmt for x in parse_sql(path.read_text())]
        self.assertEqual(parse_future_tests(path),(5,0))
        grants=[x for x in nodes if isinstance(x,ast.GrantStmt)]
        self.assertEqual(len(grants),1)
        grant=grants[0]
        self.assertEqual([r.rolename for r in grant.grantees],['crawler_customer_reader'])
        self.assertEqual(grant.privileges[0].priv_name,'select')
        self.assertEqual(names(grant.privileges[0].cols),('image_permission',))
        view=next(x for x in nodes if isinstance(x,ast.ViewStmt))
        self.assertTrue(view.replace)
        self.assertEqual({x.defname:x.arg.sval for x in view.options},{'security_invoker':'true','security_barrier':'true'})
        thumbnail=next(x for x in view.query.targetList if x.name=='thumbnail_url')
        self.assertIsInstance(thumbnail.val,ast.CaseExpr)
        self.assertTrue(thumbnail.val.defresult.isnull)
        self.assertEqual(view.query.whereClause.boolop.name,'AND_EXPR')
