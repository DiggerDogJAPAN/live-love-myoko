"""Original synthetic fixtures, never copied portal HTML or photographs."""
from unittest import TestCase
from unittest.mock import Mock,patch
from dataclasses import replace
from datetime import datetime,timezone,timedelta
from decimal import Decimal
from myoko_property_crawler.adapters import suumo,rakusumu
from myoko_property_crawler.adapters.portal_common import Card,price,area,location,photo,availability
from myoko_property_crawler.portal_live import crawl_portal,PortalClient
from myoko_property_crawler.duplicate_review import candidates,annotate
from myoko_property_crawler.changes import State,reconcile
from myoko_property_crawler.adapters.base import CrawlBatch
from myoko_property_crawler.customer import customer_properties,is_customer_eligible,customer_property
from myoko_property_crawler.database import prepare_sync
from myoko_property_crawler.models import Property
from myoko_property_crawler.sources import valid_property_number
D=datetime(2026,10,29,tzinfo=timezone.utc)


def detail(adapter,identifier='90000001',status='',price='100万円',address='新潟県妙高市月岡2-1',**changes):
    values={'所在地':address,'物件所在地':address,'価格':price,'販売価格':price,'物件コード':identifier,'物件種別':'中古一戸建て','建物面積':'123.45m<sup>2</sup>','土地面積':'234.56㎡','築年月':'1980年2月','間取り':'4LDK','構造':'木造','物件名':'架空住宅','備考':'農地法許可要確認。','販売状況':status}
    values.update(changes)
    rows=''.join('<tr><th>'+k+'</th><td>'+v+'</td></tr>' for k,v in values.items())
    url=('https://suumo.jp/chukoikkodate/niigata/sc_myoko/nc_'+identifier+'/' if adapter is suumo else 'https://www.rakusumu.com/sale/detail/'+identifier)
    image=('https://img01.suumo.com/jj/resizeImage?src=gazo%2Fbukken%2F040%2FN010000%2Fimg%2F001%2F'+identifier+'%2F'+identifier+'_0001.jpg&amp;w=192&amp;h=144' if adapter is suumo else 'https://www.rakusumu.com/images/'+identifier[:5]+'/'+identifier+'/img_'+identifier+'_G_0_smd.JPG')
    return '<html><head><link rel="canonical" href="'+url+'"></head><body><h1>架空住宅</h1><img alt="現地外観写真" rel="'+image+'"><table>'+rows+'</table></body></html>'


def card(adapter,identifier=None):
    identifier=identifier or ('90000001' if adapter is suumo else '99999-900001')
    url=('https://suumo.jp/chukoikkodate/niigata/sc_myoko/nc_'+identifier+'/' if adapter is suumo else 'https://www.rakusumu.com/sale/detail/'+identifier)
    return Card(identifier,url,'架空住宅',1000000)


def index(adapter,identifiers,total=None,pages=(1,2)):
    total=total if total is not None else len(identifiers)
    if adapter is suumo:
        cards=''.join('<div class="property_unit"><h2 class="property_unit-title"><a href="'+card(adapter,i).url+'">架空住宅</a></h2><dl><dt>販売価格</dt><dd>100万円</dd></dl></div>' for i in identifiers)
        links=''.join('<a href="'+adapter.INDEXES[0]+'?page='+str(p)+'">'+str(p)+'</a>' for p in pages)
        return '<html><body><div class="pagination_set-hit">'+str(total)+'件</div><div class="pagination">'+links+'</div>'+'<div id="js-bukkenList">'+cards+'</div></body></html>'
    cards=''.join('<tbody class="over"><tr><td><h3>架空住宅</h3><a href="'+card(adapter,i).url+'">詳細</a><strong class="price">1,000,000</strong></td></tr></tbody>' for i in identifiers)
    links=''.join('<a href="/sale/area/list/3/'+str((p-1)*20)+'">'+str(p)+'</a>' for p in pages if p>1)
    return '<html><body><h1>妙高市、上越市の新築一戸建て一覧</h1><div class="pageNavi"><div class="num">'+str(total)+'件該当しました。</div>'+links+'</div><table>'+cards+'</table></body></html>'

class PortalTests(TestCase):
    def setUp(self):
        p=patch('socket.create_connection',side_effect=AssertionError('No network in fixture tests'));p.start();self.addCleanup(p.stop)
    def property(self,adapter=suumo,**kw):
        c=card(adapter);return adapter.parse_detail(c,detail(adapter,c.identifier,**kw),D)
    def test_source_scoped_ids_and_normalized_facts(self):
        for a in (suumo,rakusumu):
            p=self.property(a)
            self.assertEqual(p.asking_price_jpy,1000000);self.assertEqual(p.building_area_sqm,Decimal('123.45'))
            self.assertEqual(p.land_area_sqm,Decimal('234.56'));self.assertEqual(p.construction_date,'1980-02')
            self.assertEqual(p.area_en,'Tsukioka');self.assertEqual(p.source_property_id,card(a).identifier)
            self.assertTrue(valid_property_number(a.SOURCE,p.source_property_id));self.assertEqual(Property.from_dict(p.to_dict()),p)
            self.assertIsNone(p.description_ja);self.assertIn('農地法',p.source_facts['備考'])
            self.assertNotIn('agency_original_ja',customer_property(p))
    def test_only_covered_residential_sales(self):
        for a in (suumo,rakusumu):
            self.assertIsNone(self.property(a,address='新潟県長岡市月岡1'))
            for kind in ('売土地','賃貸一戸建て','店舗付住宅','収益物件','ペンション'):
                self.assertFalse(is_customer_eligible(self.property(a,物件種別=kind)))
            self.assertFalse(is_customer_eligible(self.property(a,建物面積='',構造='',間取り='')))
    def test_missing_or_range_price_is_null_never_zero(self):
        for raw in ('未定','価格応相談','100万円～200万円','相談','-'):self.assertIsNone(price(raw))
        self.assertEqual(price('0円'),0);self.assertEqual(price('１，２００万円'),12000000)
        self.assertEqual(area('123.45m 2 （登記）'),Decimal('123.45'))
        self.assertIsNone(area('100m2～120m2'))
    def test_restricted_and_unknown_statuses_fail_closed(self):
        for label in ('商談中','交渉中','成約済','売約済','掲載終了','内覧受付終了','独自の制限'):
            for a in (suumo,rakusumu):self.assertFalse(is_customer_eligible(self.property(a,status=label)),label)
        for label in ('','販売中','公開中'):
            self.assertTrue(is_customer_eligible(self.property(status=label)))
    def test_agency_office_never_replaces_property_address(self):
        p=self.property(rakusumu,所在地='新潟県長岡市事務所1')
        self.assertEqual(p.address,'新潟県妙高市月岡2-1');self.assertEqual(p.municipality,'Myoko')
    def test_occupancy_is_not_sale_status(self):
        self.assertTrue(is_customer_eligible(self.property(現況='居住中')))
    def test_images_match_source_and_listing(self):
        p=self.property();self.assertIsNotNone(p.main_image_url)
        self.assertIsNone(photo('suumo','90000002',p.main_image_url))
        self.assertIsNone(photo('suumo',p.source_property_id,p.main_image_url.replace('img01.suumo.com','evil.example')))
        self.assertIsNone(photo('suumo',p.source_property_id,p.main_image_url+'&redirect=https://evil.example'))
        r='https://www.rakusumu.com/images/99999/99999-900001/img_99999-900001_G_0_smd.JPG?u=123'
        self.assertEqual(photo('rakusumu','99999-900001',r),r)
        self.assertIsNone(photo('rakusumu','99999-900001',r.replace('_G_','_M_')))
        self.assertIsNone(photo('rakusumu','99999-900002',r))
        self.assertIsNone(customer_property(replace(p,main_image_url=None))['thumbnail_url'])
    def test_original_card_restriction_cannot_be_erased_by_detail(self):
        c=replace(card(suumo),label='交渉中')
        p=suumo.parse_detail(c,detail(suumo,c.identifier),D)
        self.assertFalse(is_customer_eligible(p))
    def test_identity_price_and_truncation_conflicts_abort(self):
        c=card(suumo)
        with self.assertRaises(ValueError):suumo.parse_detail(c,detail(suumo,'90000002'),D)
        with self.assertRaises(ValueError):suumo.parse_detail(c,detail(suumo,c.identifier,price='200万円'),D)
        with self.assertRaises(ValueError):suumo.parse_index(index(suumo,['90000001'])[:-7],suumo.INDEXES[0])
        with self.assertRaises(ValueError):rakusumu.parse_detail(card(rakusumu),detail(rakusumu,'99999-900002'),D)
    def test_multi_page_acquisition_is_atomic(self):
        a=suumo;base=a.INDEXES[0]
        client=Mock();client.fetch.side_effect=lambda u:index(a,['90000002'] if 'page=2' in u else ['90000001'],2)
        client.detail.side_effect=lambda c:detail(a,c.identifier)
        with patch.object(a,'INDEXES',(base,)):
            result=crawl_portal(State(),source='suumo',client=client)
        self.assertEqual(len(result.reconciliation.state.properties),2)
        self.assertEqual(len(customer_properties(result.reconciliation.state.properties)),2)
        self.assertEqual(client.detail.call_count,2)
    def test_pagination_scope_and_duplicate_rejection(self):
        with self.assertRaises(ValueError):suumo.index_page('https://suumo.jp/jj/bukken/ichiran/JJ010FJ001/')
        with self.assertRaises(ValueError):rakusumu.index_page('https://www.rakusumu.com/sale/area/list/4')
        with self.assertRaises(ValueError):suumo.parse_index(index(suumo,['90000001','90000001']),suumo.INDEXES[0])
        with self.assertRaises(ValueError):rakusumu.parse_index(index(rakusumu,['99999-900001','99999-900001']),rakusumu.INDEXES[0])
    def test_partial_or_failed_crawl_preserves_state_and_other_sources(self):
        old=self.property();other=replace(old,source_key='myoko_akiya_bank',source_agency_name='Myoko Akiya Bank',source_property_id='999',original_listing_url='https://www.city.myoko.niigata.jp/fs/example.pdf')
        state=State((old,other));client=Mock();client.fetch.side_effect=ValueError('Request failed')
        with self.assertRaises(ValueError):crawl_portal(state,source='suumo',client=client)
        self.assertEqual(state.properties,(old,other))
        c=Mock();c.fetch.return_value=index(suumo,['90000001'],2,pages=(1,));
        with patch.object(suumo,'INDEXES',(suumo.INDEXES[0],)):
            with self.assertRaises(ValueError):crawl_portal(state,source='suumo',client=c)
        c.detail.assert_not_called()
    def test_repeat_price_missing_price_and_reactivation(self):
        p=self.property();s=reconcile(State(),CrawlBatch('suumo',D,(p,),True)).state
        self.assertEqual(reconcile(s,CrawlBatch('suumo',D,(p,),True)).state,s)
        later=D+timedelta(days=1);q=replace(p,last_checked_at=later,asking_price_jpy=900000,availability_status='under_negotiation',source_status_ja='交渉中')
        s2=reconcile(s,CrawlBatch('suumo',later,(q,),True)).state
        self.assertEqual(len(s2.price_changes),1);self.assertFalse(customer_properties(s2.properties))
        q=replace(q,last_checked_at=later+timedelta(days=1),asking_price_jpy=None,availability_status='sold',listing_status='sold',source_status_ja='成約済')
        s3=reconcile(s2,CrawlBatch('suumo',q.last_checked_at,(q,),True)).state;self.assertEqual(len(s3.price_changes),1)
        q=replace(p,last_checked_at=later+timedelta(days=2));s4=reconcile(s3,CrawlBatch('suumo',q.last_checked_at,(q,),True)).state
        self.assertEqual(len(customer_properties(s4.properties)),1)
    def test_duplicate_review_never_merges_locality_and_price_only(self):
        p=self.property();old=replace(p,source_key='rakusumu',source_property_id='99999-900001',original_listing_url='https://www.rakusumu.com/sale/detail/99999-900001')
        self.assertEqual(len(candidates(p,(old,))),1)
        weak=replace(old,address='妙高市月岡',building_area_sqm=None)
        self.assertFalse(candidates(p,(weak,)))
        two=annotate((p,old),());self.assertEqual(len(two),2);self.assertEqual(two[0].identity,p.identity)
        self.assertIn('review_required',two[0].source_facts['duplicate_candidates'])
        self.assertEqual(two[0].source_facts['duplicate_review_pending'],'false')
        self.assertEqual(two[1].source_facts['duplicate_review_pending'],'true')
        self.assertTrue(is_customer_eligible(two[0]));self.assertFalse(is_customer_eligible(two[1]))
        municipal=replace(old,source_key='myoko_akiya_bank')
        withheld=annotate((p,),(municipal,))[0]
        self.assertFalse(is_customer_eligible(withheld))
    def test_geography_is_anchored_to_property_address(self):
        from myoko_property_crawler.adapters.portal_common import geographic_scope
        self.assertEqual(geographic_scope('新潟県長岡市妙高市への案内')[1],'outside_coverage')
        self.assertEqual(geographic_scope('所在地不詳・妙高市近郊')[1],'unverified')
        with self.assertRaises(ValueError):self.property(address='所在地未確認')
        self.assertFalse(is_customer_eligible(replace(self.property(),municipality='Joetsu')))
        self.assertEqual(geographic_scope('長野県上水内郡飯綱町倉井100')[0],'Iizuna Town')
    def test_recommendations_are_not_inventory(self):
        markup=index(suumo,['90000001'],pages=(1,))
        recommendation='<div class="property_unit"><h2 class="property_unit-title"><a href="https://suumo.jp/chukoikkodate/niigata/sc_joetsu/nc_99999999/">Related property</a></h2></div>'
        markup=markup.replace('</body>',recommendation+'</body>')
        page=suumo.parse_index(markup,suumo.INDEXES[0])
        self.assertEqual([c.identifier for c in page.cards],['90000001'])
    def test_unknown_locations_are_preserved_for_review(self):
        p=self.property(address='長野県上水内郡信濃町大字未確認123')
        self.assertIsNone(p.area_en);self.assertEqual(p.area,'未確認');self.assertEqual(p.unmapped_locations,('未確認',))
        self.assertEqual(location('長野県上水内郡飯綱町倉井100')[2],'Kurai')
    def test_complete_snapshot_required_for_sync(self):
        p=annotate((self.property(),),())[0];self.assertEqual(len(prepare_sync(State((p,),(),{'suumo':D}),'suumo')[0]),1)
        with self.assertRaises(ValueError):prepare_sync(State((replace(p,source_facts={}),),(),{'suumo':D}),'suumo')
    def test_live_permission_gate_precedes_requests(self):
        with patch('myoko_property_crawler.portal_live.ACCESS_APPROVED',{'suumo':False,'rakusumu':False}):
            for source in ('suumo','rakusumu'):
                c=PortalClient(source)
                with patch.object(c,'_read') as read:
                    with self.assertRaises(ValueError):c.start()
                    read.assert_not_called()

    def test_portal_customer_scope_is_myoko_shinano_only(self):
        for a in (suumo,rakusumu):
            self.assertTrue(is_customer_eligible(self.property(a,address='新潟県妙高市月岡2-1')))
            self.assertTrue(is_customer_eligible(self.property(a,address='長野県上水内郡信濃町野尻100')))
            for address in ('新潟県上越市高田区1','長野県上水内郡飯綱町倉井100'):
                self.assertFalse(is_customer_eligible(self.property(a,address=address)))
        with self.assertRaises(ValueError):rakusumu.index_page('https://www.rakusumu.com/sale/area/list/4?area%5B%5D=15222&sort=NEW')
        self.assertTrue(all('sc_joetsu' not in u for u in suumo.INDEXES))

    def test_narrower_crawl_preserves_out_of_scope_records_exactly(self):
        from myoko_property_crawler.adapters.portal_common import Page
        from myoko_property_crawler.portal_live import ADAPTERS
        base=self.property();archived=tuple(replace(base,source_property_id=str(91000000+i),original_listing_url='https://suumo.jp/chukoikkodate/niigata/sc_joetsu/nc_'+str(91000000+i)+'/',municipality='Joetsu',address='新潟県上越市高田区'+str(i)) for i in range(20))
        state=State((base,)+archived)
        cards=(replace(card(suumo),address='新潟県妙高市月岡2-1'),replace(card(suumo,'90000002'),address='長野県上水内郡飯綱町倉井100'))
        page=Page(cards,2,(1,));client=Mock();client.fetch.return_value='mock HTML';client.detail.return_value='mock detail'
        with patch.object(suumo,'INDEXES',(suumo.INDEXES[0],)),patch.object(suumo,'parse_index',return_value=page),patch.object(suumo,'parse_detail',side_effect=lambda c,h,d:replace(base,last_checked_at=d)):
            result=crawl_portal(state,source='suumo',client=client)
        self.assertEqual(client.detail.call_count,1)
        current=result.reconciliation.state.properties
        self.assertEqual(len(current),21)
        self.assertEqual(tuple(p for p in current if p.municipality=='Joetsu'),archived)
        self.assertEqual(result.reconciliation.marked_not_found,0)
