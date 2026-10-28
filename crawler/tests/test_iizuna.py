"""Original synthetic components for the two Iizuna feeds; no network or DB writes."""
from dataclasses import replace
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock,patch
from myoko_property_crawler.adapters.iizuna_akiya_bank import (
 SOURCE,MUNICIPAL_INDEX,RAKUEN_INDEX,Card,parse_municipal_index,parse_rakuen_index,parse_detail,deduplicate_feeds,normalized_address)
from myoko_property_crawler.iizuna_live import crawl_iizuna,IizunaClient,stable_identities
from myoko_property_crawler.changes import State
from myoko_property_crawler.customer import is_customer_eligible,customer_property
from myoko_property_crawler.database import prepare_sync,SyncError
from myoko_property_crawler.daily import apply_live
from myoko_property_crawler.db_connection import PreflightError
from myoko_property_crawler.models import Property
from .helpers import DAY_ONE,DAY_TWO


def municipal_card(reg=1,number=900001):
 return f'<a class="property-box" href="/ijuportal/live/sale/{number}.html"><h3 class="title">登録番号{reg:03}/受付番号999 倉井</h3><table class="info-list"><tr><td><script>document.write(Number(100).toLocaleString());</script>万円</td></tr></table></a>'


def municipal_index(cards=None):
 cards=cards if cards is not None else [municipal_card()]
 return '<html><body><span>物件登録数 '+str(len(cards))+' 件</span>'+''.join(cards)+'</body></html>'


def municipal_detail(reg=1,price='100',address='長野県上水内郡飯綱町大字倉井100',message='',**extra):
 values={'所在地':address,'エリア':'三水地区 倉井区','構造':'木造','間取り':'4LDK','建物面積':'50㎡','土地面積':'100㎡','建築年':'1980年','備考':'未登記建物あり。','補修の要否':'修繕必要'}
 values.update(extra)
 table=''.join('<tr><th>'+k+'</th><td>'+v+'</td></tr>' for k,v in values.items())
 return f'<html><body><h2>登録番号{reg:03}/受付番号999</h2><span class="status">{message}</span><div class="property-info"><div class="caption">Private original description</div><table><tr><th>価格</th><td><script>document.write(Number({price}).toLocaleString());</script>万円</td></tr>{table}</table></div></body></html>'


def rakuen_card(number,kind='house',price='100'):
 labels={'house':'中古住宅','land':'住宅用土地','rent':'貸家'}
 return f'<div class="boxStyleE"><h2>{labels[kind]}</h2><h3><a href="/bukken/{number}/">上水内郡飯綱町大字倉井100</a></h3><span class="price">{price}</span></div>'


def rakuen_index(cards,page=1,total=None):
 total=len(cards) if total is None else total
 links='<a href="?pg=1&amp;vender_jiscode[]=20590">1</a>' + ('<a href="?pg=2&amp;vender_jiscode[]=20590">2</a>' if total>50 else '')
 return '<html><body><div class="searchControl">検索結果 全 '+str(total)+' 件 '+links+'</div>'+''.join(cards)+'</body></html>'


def rakuen_detail(number,reg=1,price='100万円',address='上水内郡飯綱町大字倉井100',message='',**extra):
 values={'物件番号':str(number),'管理番号':f'登録番号{reg}/受付番号999' if reg is not None else '', '所在地':address,'構造':'木造','間取':'4LDK','土地面積':'100m<sup>2</sup>／30坪','建物面積':'50m<sup>2</sup>／15坪','完成年月':'1980年1月','価格':price,'備考／防災情報':'農地の条件あり。'}
 values.update(extra)
 table=''.join('<tr><th>'+k+'</th><td>'+v+'</td></tr>' for k,v in values.items())
 return '<html><body><h1>中古住宅'+address+'</h1><span class="status">'+message+'</span><table>'+table+'</table></body></html>'


def client_fixture():
 data={MUNICIPAL_INDEX:municipal_index(), 'https://www.town.iizuna.nagano.jp/ijuportal/live/sale/900001.html':municipal_detail(),RAKUEN_INDEX:rakuen_index([rakuen_card(990000+i,'house' if i<13 else 'rent' if i<16 else 'land') for i in range(50)],1,64),
 'https://rakuen-akiya.jp/housesearch/area/?pg=2&vender_jiscode%5B%5D=20590':rakuen_index([rakuen_card(990000+i,'land') for i in range(50,64)],2,64)}
 data.update({f'https://rakuen-akiya.jp/bukken/{990000+i}/':rakuen_detail(990000+i,reg=i+1,address='上水内郡飯綱町大字倉井'+str(100+i)) for i in range(13)})
 client=Mock();client.fetch.side_effect=lambda u:data[u]
 return client,data

class IizunaTests(TestCase):
 def setUp(self):
  p=patch('socket.create_connection',side_effect=AssertionError('Network forbidden'));p.start();self.addCleanup(p.stop)

 def crawl(self,state=State(),client=None,day=DAY_ONE):
  with patch('myoko_property_crawler.iizuna_live.datetime') as d:
   d.now.return_value=day;return crawl_iizuna(state,client=client or client_fixture()[0])

 def test_two_pages_dedup_and_private_content(self):
  client,data=client_fixture();result=self.crawl(client=client);props=result.reconciliation.state.properties
  self.assertEqual(len(props),13);self.assertEqual(sum(map(is_customer_eligible,props)),13)
  p=next(p for p in props if p.source_property_id=='reg-001')
  self.assertEqual(p.original_listing_url,'https://www.town.iizuna.nagano.jp/ijuportal/live/sale/900001.html')
  self.assertIn('rakuen',p.source_facts['provider_urls']);self.assertIn('municipal',p.source_facts['provider_urls'])
  self.assertIn('Private original description',p.source_facts['description_original_ja'])
  self.assertNotIn('Private original description',str(customer_property(p)))
  self.assertTrue(all(p.main_image_url is None and p.description_ja is None for p in props))
  self.assertEqual(prepare_sync(result.reconciliation.state,SOURCE)[0],list(props))
  self.assertEqual(Property.from_dict(p.to_dict()),p)

 def test_initial_literals_missing_prices_and_unexecuted_scripts(self):
  c=parse_municipal_index(municipal_index()).cards[0]
  self.assertEqual(parse_detail(c,municipal_detail(),DAY_ONE).asking_price_jpy,1000000)
  for literal in ['','unknown()','"100"']:
   self.assertIsNone(parse_detail(c,municipal_detail(price=literal),DAY_ONE).asking_price_jpy)
  with self.assertRaises(ValueError):parse_detail(c,municipal_detail(price='200'),DAY_ONE)
  missing=replace(c,price=None)
  self.assertEqual(parse_detail(missing,municipal_detail(price='0'),DAY_ONE).asking_price_jpy,0)

 def test_registration_zeros_and_precise_address_normalization(self):
  c=parse_municipal_index(municipal_index()).cards[0];p=parse_detail(c,municipal_detail(),DAY_ONE)
  secondary=parse_detail(Card('rakuen','https://rakuen-akiya.jp/bukken/990000/','house','house'),rakuen_detail(990000,reg=1),DAY_ONE)
  self.assertEqual(secondary.source_property_id,p.source_property_id)
  for a,b in [('長野県上水内郡飯綱町大字高坂1300‐13','上水内郡飯綱町大字高坂1300-13'),('飯綱町川上2755ｰ921','飯綱町川上2755‐921'),('飯綱町普光寺字塩ノ入342番地','飯綱町普光寺342')]:self.assertEqual(normalized_address(a),normalized_address(b))
  merged,n=deduplicate_feeds((p,),(replace(secondary,address='飯綱町倉井101'),))
  self.assertEqual(n,1);self.assertFalse(is_customer_eligible(merged[0]))

 def test_secondary_only_additions_and_no_speculative_merge(self):
  client,data=client_fixture();result=self.crawl(client=client)
  p=next(p for p in result.reconciliation.state.properties if p.source_property_id=='reg-002')
  self.assertTrue(p.original_listing_url.startswith('https://rakuen-akiya.jp/'))
  self.assertEqual(customer_property(p)['source_attribution'],'Source: Rakuen Shinshu Akiya Bank (Iizuna)')
  first=next(p for p in result.reconciliation.state.properties if p.source_property_id=='reg-001')
  wrong=replace(p,address=first.address,asking_price_jpy=first.asking_price_jpy)
  self.assertEqual(len(deduplicate_feeds((first,),(wrong,))[0]),2)

 def test_fallback_identity_requires_exact_address_and_both_areas(self):
  client,_=client_fixture();props=self.crawl(client=client).reconciliation.state.properties
  primary=next(p for p in props if p.source_property_id=='reg-001')
  unknown=replace(primary,source_property_id='rakuen-999',original_listing_url='https://rakuen-akiya.jp/bukken/999/',source_facts={'provider':'rakuen','provider_urls':'{"rakuen":"https://rakuen-akiya.jp/bukken/999/"}'})
  self.assertEqual(len(deduplicate_feeds((primary,),(unknown,))[0]),1)
  self.assertEqual(len(deduplicate_feeds((primary,),(replace(unknown,land_area_sqm=None),))[0]),2)

 def test_statuses_override_active_primary_and_occupancy_is_separate(self):
  c=parse_municipal_index(municipal_index()).cards[0];primary=parse_detail(c,municipal_detail(),DAY_ONE)
  for message,want in [('交渉中','under_negotiation'),('成約済','sold'),('内覧受付終了','viewings_closed'),('取下げ','withdrawn'),('要確認','unknown')]:
   p=parse_detail(c,municipal_detail(message=message),DAY_ONE)
   self.assertEqual(p.availability_status.value,want);self.assertFalse(is_customer_eligible(p))
  occupied=parse_detail(c,municipal_detail(現況='居住中'),DAY_ONE);self.assertTrue(is_customer_eligible(occupied))
  secondary=replace(primary,source_facts={'provider':'rakuen','provider_urls':'{}'},availability_status='under_negotiation',source_status_ja='交渉中')
  self.assertFalse(is_customer_eligible(deduplicate_feeds((primary,),(secondary,))[0][0]))

 def test_pagination_gaps_duplicates_and_source_failures_never_apply(self):
  for mutate in [lambda d:d.pop('https://rakuen-akiya.jp/housesearch/area/?pg=2&vender_jiscode%5B%5D=20590'),lambda d:d.pop('https://rakuen-akiya.jp/bukken/990001/'),lambda d:d.update({RAKUEN_INDEX:rakuen_index([rakuen_card(990000)]*50,1,64)}),lambda d:d.update({MUNICIPAL_INDEX:municipal_index().replace('物件登録数 1','物件登録数 2')})]:
   client,data=client_fixture();mutate(data)
   with patch('myoko_property_crawler.daily._apply') as apply:
    with self.assertRaises((KeyError,PreflightError)):apply_live(Mock(),State(),client=client,source_key=SOURCE)
    apply.assert_not_called()

 def test_repeated_crawls_price_changes_and_old_sources_unchanged(self):
  client,data=client_fixture();first=self.crawl(client=client)
  other=replace(first.reconciliation.state.properties[0],source_key='myoko_akiya_bank',source_property_id='537')
  state=replace(first.reconciliation.state,properties=first.reconciliation.state.properties+(other,))
  second=self.crawl(state,client,DAY_TWO)
  self.assertEqual(second.reconciliation.discovered,0);self.assertEqual(second.reconciliation.updated,0)
  self.assertEqual(next(p for p in second.reconciliation.state.properties if p.source_key!='iizuna_akiya_bank'),other)
  data[MUNICIPAL_INDEX]=data[MUNICIPAL_INDEX].replace('Number(100)','Number(90)')
  data['https://www.town.iizuna.nagano.jp/ijuportal/live/sale/900001.html']=municipal_detail(price='90')
  third=self.crawl(state,client,DAY_TWO)
  self.assertEqual(len(third.reconciliation.price_changes),1)
  replay=self.crawl(third.reconciliation.state,client,DAY_TWO);self.assertEqual(len(replay.reconciliation.state.price_changes),1)

 def test_partial_previews_cannot_sync(self):
  props=self.crawl().reconciliation.state.properties
  p=replace(props[0],source_facts={k:v for k,v in props[0].source_facts.items() if k!='inventory_complete'})
  with self.assertRaises(SyncError):prepare_sync(State((p,),(),{SOURCE:DAY_ONE}),SOURCE)

 def test_transport_denies_images_other_towns_and_permission_bypass(self):
  client=IizunaClient()
  for url in ['https://rakuen-akiya.jp/housesearch/area/?vender_jiscode[]=20201','https://rakuen-akiya.jp/img/a.jpg','https://www.town.iizuna.nagano.jp/fs/a.pdf','https://evil.invalid/bukken/1/']:
   self.assertFalse(client._allowed(url))
  with patch('myoko_property_crawler.iizuna_live.MUNICIPAL_FACTS_APPROVED',False):
   with self.assertRaisesRegex(ValueError,'permission'):client.fetch(MUNICIPAL_INDEX)

 def test_missing_optional_fields_and_translation_review(self):
  c=parse_municipal_index(municipal_index()).cards[0]
  p=parse_detail(c,municipal_detail(address='飯綱町大字未確認100',建物面積='',土地面積='',建築年='不明'),DAY_ONE)
  self.assertIsNone(p.area_en);self.assertEqual(p.unmapped_locations,('未確認',))
  self.assertIsNone(p.building_area_sqm);self.assertIsNone(p.land_area_sqm);self.assertIsNone(p.construction_date)

 def test_canonical_upgrade_keeps_prior_internal_identity(self):
  props=self.crawl().reconciliation.state.properties;p=next(p for p in props if p.source_property_id=='reg-001')
  old=replace(p,source_property_id='rakuen-990000',original_listing_url='https://rakuen-akiya.jp/bukken/990000/',source_facts={'provider':'rakuen','provider_urls':'{"rakuen":"https://rakuen-akiya.jp/bukken/990000/"}'})
  upgraded=stable_identities((p,),State((old,)))
  self.assertEqual(upgraded[0].source_property_id,'rakuen-990000');self.assertEqual(upgraded[0].original_listing_url,p.original_listing_url)

 def test_vanished_primary_does_not_reactivate_from_stale_secondary(self):
  props=self.crawl().reconciliation.state.properties
  old=next(p for p in props if p.source_property_id=='reg-001')
  secondary=replace(old,original_listing_url='https://rakuen-akiya.jp/bukken/990000/',source_facts={'provider':'rakuen','provider_urls':'{"rakuen":"https://rakuen-akiya.jp/bukken/990000/"}'})
  result=stable_identities((secondary,),State((old,)))[0]
  self.assertEqual(result.listing_status.value,'not_found');self.assertFalse(is_customer_eligible(result))
  self.assertEqual(result.original_listing_url,old.original_listing_url)
  restored=stable_identities((old,),State((result,)))[0];self.assertTrue(is_customer_eligible(restored))

 def test_no_iizuna_photos_or_protected_text_in_customer_export(self):
  prop=self.crawl().reconciliation.state.properties[0]
  image=replace(prop,main_image_url='https://rakuen-akiya.jp/img/bukken/1/a.jpg',image_permission='permitted',content_rights_basis='Synthetic test')
  self.assertIsNone(customer_property(image)['thumbnail_url'])
  self.assertNotIn('source_facts',customer_property(image))

 def test_only_confirmed_municipal_card_photographs_are_public(self):
  from myoko_property_crawler import iizuna_images
  c=parse_municipal_index(municipal_index()).cards[0]
  url='https://www.town.iizuna.nagano.jp/fs/1/2/_/original.jpg'
  p=parse_detail(replace(c,thumbnail=url),municipal_detail(),DAY_ONE)
  self.assertEqual(p.main_image_url,url);self.assertEqual(customer_property(p)['thumbnail_url'],url)
  with patch('myoko_property_crawler.iizuna_images.MUNICIPAL_IMAGES_APPROVED',False):
   self.assertIsNone(parse_detail(replace(c,thumbnail=url),municipal_detail(),DAY_ONE).main_image_url)
  for bad in ['https://rakuen-akiya.jp/img/photo.jpg','https://evil.invalid/fs/a.jpg',url+'?x=1','https://www.town.iizuna.nagano.jp/fs/floorplan.jpg']:
   self.assertIsNone(iizuna_images.municipal_photo_url(bad))
  secondary=Card('rakuen','https://rakuen-akiya.jp/bukken/990000/','house','house',thumbnail=url)
  self.assertIsNone(parse_detail(secondary,rakuen_detail(990000),DAY_ONE).main_image_url)

 def test_schema_static_security_and_workflow(self):
  from pglast import parse_sql
  sql=Path('sql/migrations/006_iizuna_source.sql').read_text();parse_sql(sql)
  self.assertIn('security_invoker=true,security_barrier=true',sql);self.assertNotIn('GRANT ',sql.split('BEGIN;')[1])
  self.assertIn("kind='house'",sql);self.assertIn("inventory_complete'='true'",sql)
  self.assertIn("municipal_primary_card_v1",sql)
  workflow=Path('../.github/workflows/myoko-crawler.yml').read_text()
  self.assertIn('iizuna_akiya_bank',workflow);self.assertIn("cron: '17 21 * * *'",workflow)
