"""Synthetic Joetsu components only. All tests forbid network access."""
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, MagicMock, patch

from myoko_property_crawler.adapters.joetsu_akiya_bank import (
    SOURCE, INDEX_URL, parse_index, parse_detail, listing_id, page_number)
from myoko_property_crawler.joetsu_live import crawl_joetsu, JoetsuClient
from myoko_property_crawler.changes import State
from myoko_property_crawler.customer import customer_properties, customer_property, is_customer_eligible
from myoko_property_crawler.database import prepare_sync, _apply, SyncError
from myoko_property_crawler.daily import apply_live, database_state
from myoko_property_crawler.db_connection import PreflightError
from myoko_property_crawler.locations import JOETSU_AREAS
from myoko_property_crawler.models import Property
from myoko_property_crawler.sources import SOURCES, valid_property_number
from .helpers import DAY_ONE, DAY_TWO


def url(identifier):
    return f'https://joetsu-akiyabank.jp/archives/realestate/{identifier}-synthetic/'


def card(identifier, price='450万円', location='上越市合成町'):
    return f'''<div class="c-card__item"><a class="c-card__link" href="{url(identifier)}">
    <span class="c-card__badge">合成町</span><figure><img src="https://joetsu-akiyabank.jp/wp-content/uploads/synthetic/{identifier}.jpg"></figure>
    <table><tr><th>所在地</th><td>{location}</td></tr><tr><th>価格</th><td>{price}</td></tr><tr><th>土地面積</th><td>330㎡</td></tr></table></a></div>'''


def index(cards, current=1, last=1):
    pages = {1, current, last}
    links = ''.join(f'<a href="{INDEX_URL}'+('' if p==1 else f'page/{p}/')+'">'+str(p)+'</a>' for p in sorted(pages))
    return '<html><body>'+''.join(cards)+links+'</body></html>'


def detail(identifier, price='450万円', message=None, transaction='売買', redacted=False, conditions='', area='敷地：330.71㎡（100坪） 建築： 延床：127.83㎡', **overrides):
    fields = {'建物構造':'木造','間取り':'4LDK','詳細間取り':'居間・寝室', '面積':area,
              '築年月':'2000年1月','現状':'空き家','付帯物件':'無し','駐車場':'屋外3台','その他':conditions,
              '不動産会社 < 問い合わせ先>':'PRIVATE AGENT CONTACT'}
    fields.update(overrides)
    table = ''.join(f'<tr><th>{k}</th><td>{v}</td></tr>' for k,v in fields.items())
    facts = f'''<div class="p-realestateInfo__cat">{transaction}</div><div class="p-realestateInfo__number">物件番号：{identifier}</div>
    <p class="p-realestateDetail__title">物件詳細情報</p><div class="p-realestateDetail__district">権利関係：{transaction}</div>
    <p class="p-realestateDetail__price">価格：{price}</p><p>Original synthetic prose</p><table>{table}</table>'''
    msg = f'<p class="p-article__text">{message}</p>' if message else ''
    return f'<html><body><h1>{identifier} 合成町</h1><div class="p-article__body">'+msg+('' if redacted else facts)+'</div></body></html>'


def fixture_client():
    # Original synthetic baseline matching the investigated counts, not real properties.
    represented = [1,2,3,5,6,7,8,10,11,12,13,14,16,17,19,21,23,24,25,28]
    ids = ['13-05'] + [f'{represented[i%20]}-{900000+i}' for i in range(1,73)] + ['5-34'] + [f'14-{900000+i}' for i in range(74,156)]
    data = {}
    for page in range(1,14):
        cards = [card(pid, '-' if i>=74 else '450万円', '-' if i>=74 else '上越市合成町') for i,pid in enumerate(ids) if (page-1)*12<=i<page*12]
        data[INDEX_URL if page==1 else INDEX_URL+f'page/{page}/'] = index(cards,page,13)
    for i,pid in enumerate(ids):
        data[url(pid)] = detail(pid, transaction='賃貸' if pid=='5-34' else '売買',
            message='この物件は成約済です' if i>=74 else None, redacted=i>=74)
    client = Mock(); client.fetch.side_effect = lambda target: data[target]
    return client, data, ids


class JoetsuTests(TestCase):
    def setUp(self):
        self.network = patch('socket.create_connection', side_effect=AssertionError('Network forbidden'))
        self.network.start(); self.addCleanup(self.network.stop)

    def crawl(self, state=State(), client=None, day=DAY_ONE):
        client = client or fixture_client()[0]
        with patch('myoko_property_crawler.joetsu_live.datetime') as clock:
            clock.now.return_value=day
            return crawl_joetsu(state,client=client)

    def prop(self, identifier='13-05', **kwargs):
        c=parse_index(index([card(identifier)]),INDEX_URL).cards[0]
        return parse_detail(c,detail(identifier,**kwargs),DAY_ONE)

    def test_thirteen_pages_baseline_and_private_images(self):
        client,data,ids=fixture_client();result=self.crawl(client=client);props=result.reconciliation.state.properties
        self.assertEqual(len(props),156)
        self.assertEqual(sum(p.listing_status.value=='sold' for p in props),82)
        self.assertEqual(sum(map(is_customer_eligible,props)),73)
        self.assertEqual(len({p.area_en for p in props if is_customer_eligible(p)}),20)
        self.assertEqual(result.records_extracted,156)
        self.assertEqual(len(client.fetch.call_args_list),170)
        self.assertEqual(set(ids),{p.source_property_id for p in props})
        for p in props:
            self.assertIsNone(p.main_image_url)
            self.assertEqual(p.image_permission.value,'unknown')
            self.assertIn(p.source_property_id,p.source_facts['thumbnail_candidate_url'])
        feed=customer_properties(props)
        self.assertTrue(all(p['thumbnail_url'] is None for p in feed))
        self.assertTrue(all(p['source_attribution']=='Source: Joetsu City Akiya Bank' for p in feed))
        prepare_sync(result.reconciliation.state,SOURCE)

    def test_stable_zero_padded_identifiers_and_serialization(self):
        p=self.prop();self.assertEqual(p.source_property_id,'13-05')
        self.assertEqual(p.identity,(SOURCE,'id:13-05'))
        self.assertEqual(Property.from_dict(p.to_dict()),p)
        self.assertTrue(valid_property_number(SOURCE,'13-05'))
        for bad in ['13-05x','0-1','29-1','13','１３-０５',None]:self.assertFalse(valid_property_number(SOURCE,bad))
        self.assertTrue(valid_property_number('myoko_akiya_bank','537'))
        self.assertFalse(valid_property_number('shinano_akiya_bank','13-05'))

    def test_statuses_and_unknown_messages(self):
        for label,publication,availability in [('この物件は成約済です','sold','sold'),('交渉中','active','under_negotiation'),('商談中','active','under_negotiation'),('内覧受付終了','active','viewings_closed'),('取り下げ','withdrawn','withdrawn')]:
            p=self.prop(message=label,redacted=True)
            self.assertEqual((p.listing_status.value,p.availability_status.value),(publication,availability))
            self.assertEqual(p.source_status_ja,label);self.assertFalse(is_customer_eligible(p))
        for label in ['受付要確認','成約済 / 交渉中']:
            with self.assertRaises(ValueError):
                # Separate messages must not silently resolve conflicting badges.
                html=detail('13-05',message=label)
                if '/' in label:html=html.replace(label,'成約済</p><p class="p-article__text">交渉中')
                parse_detail(parse_index(index([card('13-05')]),INDEX_URL).cards[0],html,DAY_ONE)

    def test_sale_rental_conflict_and_explicit_blocklist(self):
        p=self.prop('5-34',transaction='賃貸')
        self.assertEqual(p.transaction_type,'rent');self.assertEqual(p.availability_status.value,'unknown')
        self.assertFalse(is_customer_eligible(p))
        self.assertFalse(is_customer_eligible(replace(p,transaction_type='sale',availability_status='active',source_status_ja=None)))
        self.assertEqual(self.prop('5-34').availability_status.value,'unknown')

    def test_published_number_overrides_known_source_slug_typos(self):
        for slug,published,area in [('4-23','14-23','Takada'),('6-6','16-6','Kanaya')]:
            c=parse_index(index([card(slug)]),INDEX_URL).cards[0]
            p=parse_detail(c,detail(published),DAY_ONE)
            self.assertEqual(p.source_property_id,published)
            self.assertEqual(p.area_en,area)
            self.assertEqual(p.source_facts['url_number_discrepancy'],slug)
        client,data,ids=fixture_client()
        data[url(ids[1])]=detail(ids[0])
        with self.assertRaisesRegex(ValueError,'Duplicate published'):
            self.crawl(client=client)

    def test_missing_optional_facts_and_building_evidence(self):
        p=self.prop(area='敷地：90坪 建築： 延床：',築年月='年月不明',駐車場='')
        self.assertIsNone(p.land_area_sqm);self.assertIsNone(p.building_area_sqm);self.assertIsNone(p.construction_date);self.assertIsNone(p.parking)
        self.assertTrue(is_customer_eligible(p))
        p=self.prop(建物構造='',間取り='',area='敷地：300㎡')
        self.assertFalse(is_customer_eligible(p));self.assertEqual(p.property_type.value,'unknown')
        p=self.prop(築年月='1931年月日不明');self.assertEqual(p.construction_date,'1931')
        self.assertEqual(self.prop().building_area_sqm,Decimal('127.83'))

    def test_conditions_occupancy_and_protected_metadata(self):
        condition='心理的瑕疵があります。借地料5,000円／年。農地法の許可が必要。再建築制限。買主調査費88,000円。'
        p=self.prop(conditions=condition,現状='居住中（退去予定2027.4頃）',付帯物件='未登記の車庫')
        self.assertTrue(is_customer_eligible(p))
        self.assertEqual(p.source_facts['その他'],condition)
        self.assertIn('未登記の車庫',p.purchase_conditions_ja)
        self.assertIn('居住中',p.purchase_conditions_ja)
        public=customer_property(p)
        self.assertIn(condition,public['purchase_conditions_ja'])
        self.assertNotIn('PRIVATE AGENT',str(public));self.assertNotIn('Original synthetic prose',str(public))
        self.assertIsNone(p.description_ja)
        self.assertEqual(p.source_facts['original_description_ja'],'物件詳細情報\n価格：450万円\nOriginal synthetic prose')

    def test_verified_areas_and_unknown_fallback(self):
        self.assertEqual(len(JOETSU_AREAS),28)
        for region,(ja,en) in JOETSU_AREAS.items():
            p=self.prop(region+'-900001');self.assertEqual((p.municipality,p.area,p.area_en),('Joetsu',ja,en))
        with patch.dict(JOETSU_AREAS,{},clear=True):
            p=self.prop();self.assertIsNone(p.area_en);self.assertEqual(p.area,'上越市合成町');self.assertEqual(p.unmapped_locations,('上越市合成町',))

    def test_price_replay_redaction_and_reactivation(self):
        client,data,ids=fixture_client();first=self.crawl(client=client)
        repeated=self.crawl(first.reconciliation.state,client,DAY_TWO)
        self.assertEqual(repeated.reconciliation.discovered,0);self.assertEqual(repeated.reconciliation.updated,0)
        data[INDEX_URL]=data[INDEX_URL].replace('450万円','400万円',1)
        data[url('13-05')]=detail('13-05',price='400万円')
        changed=self.crawl(first.reconciliation.state,client,DAY_TWO)
        self.assertEqual(len(changed.reconciliation.price_changes),1)
        replay=self.crawl(changed.reconciliation.state,client,DAY_TWO)
        self.assertEqual(len(replay.reconciliation.state.price_changes),1)
        data[INDEX_URL]=data[INDEX_URL].replace('400万円','-',1)
        data[url('13-05')]=detail('13-05',message='この物件は成約済です',redacted=True)
        closed=self.crawl(first.reconciliation.state,client,DAY_TWO)
        p=next(p for p in closed.reconciliation.state.properties if p.source_property_id=='13-05')
        self.assertEqual(p.asking_price_jpy,4500000);self.assertEqual(p.floor_plan,'4LDK')
        self.assertFalse(closed.reconciliation.price_changes);self.assertFalse(is_customer_eligible(p))
        data[INDEX_URL]=data[INDEX_URL].replace('価格</th><td>-','価格</th><td>450万円',1)
        data[url('13-05')]=detail('13-05')
        active=self.crawl(closed.reconciliation.state,client,DAY_TWO)
        self.assertTrue(is_customer_eligible(next(p for p in active.reconciliation.state.properties if p.source_property_id=='13-05')))

    def test_source_isolation_missing_and_recovery(self):
        client,data,ids=fixture_client();first=self.crawl(client=client)
        seed=first.reconciliation.state.properties[0]
        others=tuple(replace(seed,source_key=k,source_property_id='123') for k in ['myoko_akiya_bank','shinano_akiya_bank'])
        state=replace(first.reconciliation.state,properties=first.reconciliation.state.properties+others)
        last=INDEX_URL+'page/13/'
        data[last]=index([card(pid,'-','-') for pid in ids[-12:-1]],13,13)
        missing=self.crawl(state,client,DAY_TWO)
        self.assertEqual(others,tuple(p for p in missing.reconciliation.state.properties if p.source_key!=SOURCE))
        gone=next(p for p in missing.reconciliation.state.properties if p.source_property_id==ids[-1])
        self.assertEqual(gone.listing_status.value,'sold')  # Explicit sold state is not replaced by absence.
        data.pop(url(ids[0]))
        with patch('myoko_property_crawler.daily._apply') as apply:
            with self.assertRaises(KeyError):apply_live(Mock(),state,client=client,source_key=SOURCE)
            apply.assert_not_called()
        data[url(ids[0])]=detail(ids[0])
        self.crawl(state,client,DAY_TWO)

    def test_pagination_duplicates_failed_details_and_snapshot_drift(self):
        for mutate in [lambda d,ids:d.pop(INDEX_URL+'page/2/'),
                       lambda d,ids:d.update({INDEX_URL:index([card(ids[0])]*12,1,13)}),
                       lambda d,ids:d.update({INDEX_URL+'page/2/':index([card(ids[12])],2,13)}),
                       lambda d,ids:d.update({url(ids[0]):'<html><body>Error</body></html>'}),
                       lambda d,ids:d.update({INDEX_URL+'page/2/':index([card(pid) for pid in ids[12:24]],2,14)})]:
            client,data,ids=fixture_client();mutate(data,ids)
            with patch('myoko_property_crawler.daily._apply') as apply:
                with self.assertRaises((ValueError,KeyError,PreflightError)):apply_live(Mock(),State(),client=client,source_key=SOURCE)
                apply.assert_not_called()
        client,data,ids=fixture_client();calls=0
        def fetch(target):
            nonlocal calls
            if target==INDEX_URL:
                calls+=1
                if calls==2:return data[target].replace('450万円','400万円',1)
            return data[target]
        client.fetch.side_effect=fetch
        with self.assertRaises(ValueError):self.crawl(client=client)

    def test_identity_price_unknown_css_and_truncation(self):
        c=parse_index(index([card('13-05')]),INDEX_URL).cards[0]
        for html in [detail('13-05').replace('物件番号：13-05','物件番号：13-06'),detail('13-05',price='400万円'),detail('13-05')[:-7],detail('13-05').replace('p-article__body','p-article__body status-mystery')]:
            with self.assertRaises(ValueError):parse_detail(c,html,DAY_ONE)
        with self.assertRaises(ValueError):parse_index(index([card('13-05')])[:-7],INDEX_URL)

    def test_missing_active_listing_is_not_found_after_complete_inventory(self):
        client,data,ids=fixture_client();last=INDEX_URL+'page/13/'
        data[last]=index([card(pid,'450万円' if pid==ids[-1] else '-', '-' if pid!=ids[-1] else '上越市合成町') for pid in ids[-12:]],13,13)
        data[url(ids[-1])]=detail(ids[-1])
        first=self.crawl(client=client)
        data[last]=index([card(pid,'-','-') for pid in ids[-12:-1]],13,13)
        second=self.crawl(first.reconciliation.state,client,DAY_TWO)
        gone=next(p for p in second.reconciliation.state.properties if p.source_property_id==ids[-1])
        self.assertEqual(gone.listing_status.value,'not_found')
        self.assertEqual(gone.availability_status.value,'unknown')
        self.assertFalse(is_customer_eligible(gone))
        self.assertEqual(second.reconciliation.marked_not_found,1)

    def test_contact_in_conditions_is_private_and_unknown_status_fails_closed(self):
        p=self.prop(conditions='借地条件の照会は example@example.invalid TEL 000-0000')
        self.assertNotIn('example@',customer_property(p)['purchase_conditions_ja'])
        self.assertIn('example@',p.source_facts['その他'])
        self.assertEqual(p.source_facts['condition_notice_needs_review'],'true')
        c=parse_index(index([card('13-05')]),INDEX_URL).cards[0]
        for message in ['成約済ではありません','成約済 交渉中']:
            with self.assertRaises(ValueError):parse_detail(c,detail('13-05',message=message),DAY_ONE)
        with self.assertRaises(ValueError):
            parse_detail(c,detail('13-05').replace('p-article__body','p-article__body p-realestateInfo__status'),DAY_ONE)

    def test_transport_robots_pacing_and_media_denial(self):
        from urllib.robotparser import RobotFileParser
        client=JoetsuClient();client.rules=RobotFileParser();client.rules.parse(['User-agent: *','Disallow: /archives/realestate/']);client.delay=1
        for target in ['https://other.example/','https://joetsu-akiyabank.jp/wp-content/uploads/a.jpg',INDEX_URL+'page/26/',INDEX_URL+'?type=rent','https://joetsu-akiyabank.jp/a.pdf']:
            self.assertFalse(client._allowed(target))
        with self.assertRaises(ValueError):client.fetch(url('13-05'))
        with patch.object(client,'_read',return_value='User-agent: *\nDisallow: /wp-admin/\nCrawl-delay: 2'):
            client.start();self.assertEqual(client.delay,2)
        with patch('myoko_property_crawler.joetsu_live.time.sleep') as sleep,patch.object(client,'_read',return_value='html'):
            self.assertEqual(client.fetch(INDEX_URL),'html');sleep.assert_called_once_with(2)

    def test_sync_rejects_source_id_and_source_mixing(self):
        p=self.prop();state=State((replace(p,source_property_id='13x05'),),(),{SOURCE:DAY_ONE})
        with self.assertRaises(SyncError):prepare_sync(state,SOURCE)
        with self.assertRaises(SyncError):_apply(Mock(),(p,),(),DAY_ONE,'0'*64,source_key='myoko_akiya_bank')

    def test_joetsu_database_snapshot_replay_is_noop(self):
        state=self.crawl().reconciliation.state
        props,events,checked,snapshot=prepare_sync(state,SOURCE)
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
            elif 'AS internal_properties' in sql:
                self.assertEqual(parameters,(SOURCE,SOURCE))
                result.fetchone.return_value={'internal_properties':156,'customer_properties':73}
            return result
        connection.execute.side_effect=execute
        result=_apply(connection,props,events,checked,snapshot,complete=True,source_key=SOURCE)
        self.assertTrue(result['already_applied'])
        self.assertFalse(any(c.args[0].lstrip().startswith(('INSERT','UPDATE','DELETE')) for c in connection.execute.call_args_list))

    def test_large_inventory_loss_never_applies(self):
        first=self.crawl();client=Mock()
        client.fetch.side_effect=lambda target:index([card('13-05')]) if target==INDEX_URL else detail('13-05')
        with patch('myoko_property_crawler.daily._apply') as apply:
            with self.assertRaisesRegex(PreflightError,'25%'):
                apply_live(Mock(),first.reconciliation.state,client=client,source_key=SOURCE)
            apply.assert_not_called()

    def test_disabled_source_and_scoped_empty_bootstrap(self):
        c=Mock();profile=SOURCES[SOURCE]
        c.execute.return_value.fetchone.return_value=dict(agency_name=profile.agency,website=profile.website,synthetic=False,enabled=False,last_successful_check_at=None,crawl_config={'allow_initial_empty':True})
        c.execute.return_value.fetchall.return_value=[]
        with self.assertRaises(PreflightError):database_state(c,SOURCE)
        c.execute.return_value.fetchone.return_value['enabled']=True
        self.assertEqual(database_state(c,SOURCE),State())

    def test_public_projection_masks_even_accidentally_permitted_joetsu_image(self):
        p=replace(self.prop(),main_image_url='https://joetsu-akiyabank.jp/wp-content/uploads/a.jpg',image_permission='permitted',content_rights_basis='synthetic test only')
        self.assertIsNone(customer_property(p)['thumbnail_url'])

    def test_migration_permissions_additivity_and_static_sql(self):
        from pglast import parse_sql,ast
        from tools.schema_checks import parse_future_tests
        sql=Path('sql/migrations/004_joetsu_source.sql').read_text();nodes=[s.stmt for s in parse_sql(sql)]
        self.assertFalse(any(isinstance(n,(ast.UpdateStmt,ast.DeleteStmt,ast.DropStmt)) for n in nodes))
        self.assertIn('security_invoker=true,security_barrier=true',sql)
        self.assertNotIn('SECURITY DEFINER',sql)
        self.assertNotIn('GRANT USAGE ON SCHEMA crawler',sql)
        self.assertNotIn('GRANT SELECT(source_facts)',sql)
        self.assertIn('joetsu_conflicting_listing',sql)
        self.assertIn("source_property_id <> '5-34'",sql)
        self.assertIn('ADD COLUMN IF NOT EXISTS purchase_conditions_ja text',sql)
        self.assertIn("false,false",sql)
        self.assertGreater(parse_future_tests(Path('sql/tests/004_joetsu_checks.sql'))[1],0)
        parse_future_tests(Path('sql/migrations/004_joetsu_source.sql'))

    def test_workflow_preserves_approved_three_sources_and_schedule(self):
        workflow=Path('../.github/workflows/myoko-crawler.yml').read_text()
        active='\n'.join(line for line in workflow.splitlines() if not line.lstrip().startswith('#'))
        self.assertIn('["myoko_akiya_bank","shinano_akiya_bank","joetsu_akiya_bank","iizuna_akiya_bank"]',active)
        self.assertIn("cron: '17 21 * * *'",active)
