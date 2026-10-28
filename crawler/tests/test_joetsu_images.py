from dataclasses import replace
from unittest import TestCase
from pathlib import Path
from unittest.mock import patch
from myoko_property_crawler.adapters.joetsu_akiya_bank import document,single,parse_detail,parse_index,INDEX_URL
from myoko_property_crawler.joetsu_images import select_photo,public_photo
from myoko_property_crawler.customer import customer_property
from tests.test_joetsu import card,index,detail
from tests.helpers import DAY_ONE

BASE='https://joetsu-akiyabank.jp/wp-content/uploads/2026/10/'
def figure(name,caption):return '<figure><img src="'+BASE+name+'"><figcaption>'+caption+'</figcaption></figure>'
def body(markup):return single(document('<html><body><div class="p-article__body">'+markup+'</div></body></html>'),cls='p-article__body')

class JoetsuImageTests(TestCase):
    def test_exterior_priority_and_original_thumbnail_variant(self):
        html=figure('inside.jpg','居間')+figure('outside.jpg','母屋外観')
        photo=select_photo(body(html),BASE+'outside-300x225.jpg')
        self.assertEqual(photo['photo_selected_url'],BASE+'outside-300x225.jpg')
        self.assertEqual(photo['photo_caption_ja'],'母屋外観')

    def test_use_captioned_detail_photo_when_card_reference_unverified(self):
        p=select_photo(body(figure('outside.jpg','外観')),BASE+'unknown.png')
        self.assertEqual(p['photo_selected_url'],BASE+'outside.jpg')
        self.assertEqual(select_photo(body(figure('inside.jpg','1階：和室')),None)['photo_selected_url'],BASE+'inside.jpg')

    def test_graphics_plans_ambiguous_and_external_refs_stay_placeholder(self):
        for name,label in [('seiyaku.png','外観'),('floorplan.jpg','居間'),('a.jpg','間取り図'),('a.jpg','外観・配置図'),('a.jpg','写真'),('a.jpg','')]:
            self.assertIsNone(select_photo(body(figure(name,label))))
        self.assertIsNone(select_photo(body('<figure><img src="'+BASE+'a.jpg"></figure>')))
        self.assertIsNone(select_photo(body(figure('a.jpg','外観').replace(BASE,'https://evil.invalid/'))))

    def test_daily_detail_populates_permission_and_public_photo_without_requests(self):
        c=parse_index(index([card('13-05')]),INDEX_URL).cards[0]
        html=detail('13-05').replace('<p>Original synthetic prose</p>',figure('outside.jpg','外観'))
        with patch('socket.create_connection',side_effect=AssertionError('No media requests')):
            p=parse_detail(c,html,DAY_ONE)
        self.assertEqual(p.main_image_url,BASE+'outside.jpg')
        self.assertEqual(p.image_permission.value,'permitted')
        self.assertEqual(customer_property(p)['thumbnail_url'],p.main_image_url)
        self.assertIn('direct hotlink',p.content_rights_basis)
        self.assertIsNone(public_photo(replace(p,source_facts={})))
        self.assertIsNone(public_photo(replace(p,main_image_url='https://evil.invalid/a.jpg')))

    def test_unavailable_or_conflicting_details_never_select_photo(self):
        for id,kwargs in [('13-05',{'message':'交渉中'}),('13-05',{'message':'この物件は成約済です'}),('5-34',{'transaction':'賃貸'})]:
            c=parse_index(index([card(id)]),INDEX_URL).cards[0]
            html=detail(id,**kwargs).replace('<p>Original synthetic prose</p>',figure('outside.jpg','外観'))
            self.assertIsNone(parse_detail(c,html,DAY_ONE).main_image_url)

    def test_minimal_migration_keeps_security_and_private_descriptions(self):
        from pglast import parse_sql
        sql=Path('sql/migrations/005_joetsu_thumbnails.sql').read_text()
        parse_sql(sql)
        self.assertIn('security_invoker=true,security_barrier=true',sql)
        self.assertIn("photo_verification'='source_figure_caption_v1'",sql)
        self.assertIn('description_ja IS NULL AND description_en IS NULL',sql)
        self.assertNotIn('GRANT ',sql)
        self.assertNotIn('UPDATE ',sql)
