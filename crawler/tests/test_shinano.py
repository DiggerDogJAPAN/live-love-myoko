"""Original synthetic components; never fetch property pages, PDFs or images."""
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

from myoko_property_crawler.adapters.shinano_akiya_bank import parse_index, parse_detail, INDEX_URL, SOURCE, page_number
from myoko_property_crawler.shinano_live import crawl_shinano, ShinanoClient
from myoko_property_crawler.changes import State
from myoko_property_crawler.customer import is_customer_eligible
from myoko_property_crawler.database import prepare_sync, _apply, SyncError
from myoko_property_crawler.daily import apply_live, database_state
from .helpers import DAY_ONE, initial_batch


def card(number, status='', title='中古住宅 柏原', area='柏原', price='450万円'):
    return f'''<li class="akiya-list-item"><a class="list-link {status}" href="https://shinanomachi-iju.jp/akiya/{number}/">
    <span class="img"><img src="https://shinanomachi-iju.jp/shinanomachi/wordpress/wp-content/uploads/fixture-only/{number}.jpg"/>
    <span class="property-type">中古住宅</span></span><h2 class="title">{title}【No.{number}】</h2><span class="area">{area}</span>
    <div class="price">{price}</div></a></li>'''


def index(cards, total, pages=(1,2)):
    links=''.join(f'<a class="page-numbers" href="https://shinanomachi-iju.jp/akiya/'+('' if p==1 else f'page/{p}/')+'?property_type=used">'+str(p)+'</a>' for p in pages)
    return f'<html><body><p>中古住宅({total})</p><ul>'+''.join(cards)+'</ul>'+links+'</body></html><!-- synthetic cache footer -->'


def detail(number, title='中古住宅 柏原', area='柏原', price='450万円'):
    values={'価格':price,'所在地':'上水内郡信濃町大字'+area,'土地面積':'1053m2(公簿)／318.53坪','建物面積':'119.64m2／36.19坪',
            '間取り':'３DK','建築年月':'1995年','管理番号':str(number)}
    fields=''.join(f'<li class="list-item"><span class="label">{k}</span><span class="value">{v}</span></li>' for k,v in values.items())
    return f'<html><body><a href="{INDEX_URL}" class="post-category">中古住宅</a><span>管理番号：{number}</span><h1 class="post-title">{title}【No.{number}】</h1><ul class="detail-content-list">{fields}</ul></body></html>'


def fixture_client(count=15):
    cards=[card(900001+i,'status-progress' if 8<=i<13 else 'status-closed' if i>=13 else '',
                title='売ペンション 野尻' if i==0 else '中古住宅 柏原') for i in range(count)]
    data={INDEX_URL:index(cards[:12],count), 'https://shinanomachi-iju.jp/akiya/page/2/?property_type=used':index(cards[12:],count)}
    data.update({f'https://shinanomachi-iju.jp/akiya/{900001+i}/':detail(900001+i,title='売ペンション 野尻' if i==0 else '中古住宅 柏原') for i in range(count)})
    client=Mock();client.fetch.side_effect=lambda url:data[url]
    return client,data


class ShinanoTests(TestCase):
    def test_two_pages_baseline_and_thumbnails(self):
        client,_=fixture_client()
        result=crawl_shinano(State(),client=client)
        props=result.reconciliation.state.properties
        self.assertEqual(len(props),15)
        self.assertEqual(sum(map(is_customer_eligible,props)),8)
        self.assertEqual(sum(p.availability_status.value=='under_negotiation' for p in props),5)
        self.assertEqual(sum(p.listing_status.value=='sold' for p in props),2)
        for prop in props:
            self.assertEqual(prop.source_key,SOURCE)
            self.assertIn(prop.source_property_id,prop.main_image_url)
            self.assertTrue(prop.original_listing_url.endswith('/'+prop.source_property_id+'/'))
            self.assertEqual(prop.land_area_sqm,Decimal('1053'))
            self.assertEqual(prop.building_area_sqm,Decimal('119.64'))
            self.assertEqual(prop.construction_details,'1995年')
            self.assertEqual(prop.construction_date,'1995')
        self.assertEqual(props[0].property_type.value,'lodge')
        unknown_region=replace(parse_index(index([card(900001)],1,(1,)),INDEX_URL).cards[0],region='未確認地域')
        self.assertEqual(parse_detail(unknown_region,detail(900001),DAY_ONE).unmapped_locations,('未確認地域',))
        from myoko_property_crawler.models import Property
        self.assertEqual(Property.from_dict(props[0].to_dict()),props[0])
        self.assertEqual(prepare_sync(result.reconciliation.state,SOURCE)[2],props[0].last_checked_at)

    def test_verified_locations_and_unknown_originals(self):
        for ja,en in [('野尻','Nojiri'),('柏原','Kashiwabara'),('古間','Furuma'),('古海','Furumi'),('富濃','Tomino'),('穂波','Honami'),('富士里','Fujisato'),('黒姫','Kurohime'),('未確認','')]:
            c=parse_index(index([card(900001)],1,(1,)),INDEX_URL).cards[0]
            p=parse_detail(c,detail(900001,area=ja),DAY_ONE)
            self.assertEqual(p.area,ja)
            self.assertEqual(p.area_en,en or None)
            self.assertEqual(p.unmapped_locations,(ja,) if not en else ())

    def test_unknown_or_conflicting_status_fails_closed(self):
        for status in ['status-pending','status-closed status-progress']:
            with self.assertRaises(ValueError):parse_index(index([card(900001,status)],1),INDEX_URL)

    def test_detail_identity_price_and_partial_failure(self):
        c=parse_index(index([card(900001)],1),INDEX_URL).cards[0]
        for html in [detail(900002),detail(900001,price='400万円'),detail(900001)[:-7], detail(900001).replace('class="post-category">中古住宅','class="post-category">貸家'), '<html>error</html>']:
            with self.assertRaises(ValueError):parse_detail(c,html,DAY_ONE)
        client,data=fixture_client();del data['https://shinanomachi-iju.jp/akiya/900003/']
        with patch('myoko_property_crawler.daily._apply') as apply:
            with self.assertRaises(KeyError):apply_live(Mock(),State(),client=client,source_key=SOURCE)
            apply.assert_not_called()

    def test_duplicate_gap_missing_page_and_inconsistent_total(self):
        for mutate in [lambda d:d.pop('https://shinanomachi-iju.jp/akiya/page/2/?property_type=used'),
                       lambda d:d.update({INDEX_URL:index([card(900001),card(900001)],15)}),
                       lambda d:d.update({INDEX_URL:index([card(900001)],999)})]:
            client,data=fixture_client();mutate(data)
            with self.assertRaises((ValueError,KeyError)):crawl_shinano(State(),client=client)

    def test_replay_price_restriction_and_reactivation(self):
        client,data=fixture_client();first=crawl_shinano(State(),client=client)
        second=crawl_shinano(first.reconciliation.state,client=client)
        self.assertEqual(second.reconciliation.discovered,0)
        self.assertEqual(second.reconciliation.updated,0)
        data[INDEX_URL]=data[INDEX_URL].replace('450万円','400万円',1).replace('list-link ', 'list-link status-progress ',1)
        data['https://shinanomachi-iju.jp/akiya/900001/']=detail(900001,title='売ペンション 野尻',price='400万円')
        third=crawl_shinano(second.reconciliation.state,client=client)
        self.assertEqual(len(third.reconciliation.price_changes),1)
        self.assertFalse(is_customer_eligible(third.reconciliation.state.properties[0]))
        data[INDEX_URL]=data[INDEX_URL].replace('list-link status-progress ', 'list-link ',1)
        fourth=crawl_shinano(third.reconciliation.state,client=client)
        self.assertTrue(is_customer_eligible(fourth.reconciliation.state.properties[0]))

    def test_missing_is_not_sold_and_source_isolation(self):
        client,data=fixture_client();first=crawl_shinano(State(initial_batch().properties),client=client)
        before=tuple(p for p in first.reconciliation.state.properties if p.source_key!=SOURCE)
        data[INDEX_URL]=index([card(900001+i,title='売ペンション 野尻' if i==0 else '中古住宅 柏原') for i in range(12) if i!=7],14)
        data['https://shinanomachi-iju.jp/akiya/page/2/?property_type=used']=index([card(900013),card(900014),card(900015)],14)
        final=crawl_shinano(first.reconciliation.state,client=client)
        missing=next(p for p in final.reconciliation.state.properties if p.source_key==SOURCE and p.source_property_id=='900008')
        self.assertEqual(missing.listing_status.value,'not_found')
        self.assertEqual(final.records_extracted,14)
        self.assertEqual(before,tuple(p for p in final.reconciliation.state.properties if p.source_key!=SOURCE))
        with self.assertRaises(SyncError):_apply(Mock(),initial_batch().properties,(),DAY_ONE,'0'*64,source_key=SOURCE)

    def test_rental_land_and_media_transport_are_rejected(self):
        c=parse_index(index([card(900001)],1),INDEX_URL).cards[0]
        p=parse_detail(c,detail(900001),DAY_ONE)
        self.assertFalse(is_customer_eligible(replace(p,transaction_type='rent')))
        self.assertFalse(is_customer_eligible(replace(p,property_type='land')))
        for u in ['https://shinanomachi-iju.jp/wp-json/','https://shinanomachi-iju.jp/akiya/?property_type=rent','https://shinanomachi-iju.jp/x.jpg','https://other.example/akiya/1/']:
            self.assertFalse(ShinanoClient()._allowed(u))
        with self.assertRaises(ValueError):parse_index(index([card(900001).replace('中古住宅</span>','土地</span>')],1),INDEX_URL)

    def test_migration_additive_and_customer_security_contract(self):
        from pglast import parse_sql,ast
        sql=Path('sql/migrations/003_shinano_source.sql').read_text()
        nodes=[x.stmt for x in parse_sql(sql)]
        self.assertFalse(any(isinstance(n,(ast.UpdateStmt,ast.DeleteStmt,ast.DropStmt)) for n in nodes))
        self.assertIn('security_invoker=true,security_barrier=true',sql)
        self.assertIn("transaction='sale'",sql)
        self.assertIn('ALTER POLICY properties_customer_read',sql)
        self.assertNotIn('GRANT USAGE ON SCHEMA crawler',sql)
        from tools.schema_checks import parse_future_tests
        statements,bodies=parse_future_tests(Path('sql/tests/003_shinano_checks.sql'))
        self.assertGreater(statements,0)
        self.assertGreater(bodies,0)

    def test_applied_snapshot_replay_performs_no_property_writes(self):
        from unittest.mock import MagicMock
        from myoko_property_crawler.sources import SOURCES
        client,_=fixture_client();state=crawl_shinano(State(),client=client).reconciliation.state
        properties,events,checked,snapshot=prepare_sync(state,SOURCE)
        connection=MagicMock()
        def execute(sql,parameters=None):
            result=Mock()
            if 'current_database()' in sql:result.fetchone.return_value={'db':'postgres','actor':'crawler_writer'}
            elif 'FROM crawler.sources WHERE' in sql:
                self.assertEqual(parameters,(SOURCE,))
                result.fetchone.return_value={'agency_name':SOURCES[SOURCE].agency,'website':INDEX_URL,'synthetic':False}
            elif 'FROM crawler.crawl_runs WHERE' in sql:
                self.assertEqual(parameters[0],SOURCE)
                result.fetchone.return_value={'status':'complete'}
            elif 'AS internal_properties' in sql:result.fetchone.return_value={'internal_properties':15,'customer_properties':8}
            return result
        connection.execute.side_effect=execute
        result=_apply(connection,properties,events,checked,snapshot,complete=True,source_key=SOURCE)
        self.assertTrue(result['already_applied'])
        self.assertFalse(any(c.args[0].lstrip().startswith(('INSERT','UPDATE','DELETE')) for c in connection.execute.call_args_list))

    def test_empty_bootstrap_allowed_only_for_new_configured_shinano(self):
        from myoko_property_crawler.db_connection import PreflightError
        from myoko_property_crawler.sources import SOURCES
        for source in ['myoko_akiya_bank',SOURCE]:
            connection=Mock()
            connection.execute.return_value.fetchone.return_value={'agency_name':SOURCES[source].agency,'website':SOURCES[source].website,
                'synthetic':False,'last_successful_check_at':None,'crawl_config':{'allow_initial_empty':True}}
            connection.execute.return_value.fetchall.return_value=[]
            if source==SOURCE:self.assertEqual(database_state(connection,source),State())
            else:
                with self.assertRaises(PreflightError):database_state(connection,source)

    def test_multi_parcel_area_is_preserved_without_inventing_a_total(self):
        c=parse_index(index([card(900001)],1,(1,)),INDEX_URL).cards[0]
        raw='宅地2筆：796.25m2(公簿)／240.86坪、42.89m2(公簿)／12.97坪'
        html=detail(900001).replace('1053m2(公簿)／318.53坪',raw)
        p=parse_detail(c,html,DAY_ONE)
        self.assertIsNone(p.land_area_sqm)
        self.assertEqual(p.source_facts['土地面積'],raw)
