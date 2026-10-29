import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { enquiryMailto, finderMunicipalities, propertyArea, propertyLocation, propertyTitle, type FinderProperty } from '../src/lib/property-finder/model';
import { initialFilters, locationOptions, searchProperties } from '../src/lib/property-finder/search';

function property(name: string, sourceName = 'SUUMO', municipality = 'Myoko', areaJa: string | null = null): FinderProperty {
    return { title: 'Original source title', municipality, neighbourhood: name, area: name, areaJa,
        regionEn: null, regionJa: null, askingPriceJpy: 5000000, propertyType: 'House', availability: 'Available',
        sourceName, originalListingUrl: 'https://example.com/property/location-test', thumbnail: null,
        listedAt: null, purchaseConditionsJa: null };
}
const reviewedMyoko = [
    ['石塚町', 'Ishizukacho', 'Arai'], ['経塚町', 'Kyozukacho', 'Arai'],
    ['白山町', 'Hakusancho', 'Arai'], ['小出雲', 'Oizumo', 'Arai'],
    ['美守', 'Hidanomori', 'Arai'], ['栗原', 'Kurihara', 'Arai'],
    ['学校町', 'Gakkocho', 'Arai'], ['上馬場', 'Kamibaba', 'Arai'],
    ['籠町', 'Kagomachi', 'Arai'], ['朝日町', 'Asahicho', 'Arai'],
    ['中央町', 'Chuocho', 'Arai'], ['雪森', 'Yukimori', 'Arai'],
    ['月岡', 'Tsukioka', 'Arai'], ['関川', 'Sekigawa', 'Myoko Kogen'],
    ['杉野沢', 'Suginosawa', 'Myoko Kogen'], ['田口', 'Taguchi', 'Myoko Kogen'],
    ['上百々', 'Kamidodo', 'Arai'], ['吉木', 'Yoshiki', 'Arai'],
    ['姫川原', 'Himegawara', 'Arai'], ['東雲町', 'Shinonomecho', 'Arai'],
    ['柳井田町', 'Yanaidacho', 'Arai'], ['栄町', 'Sakaecho', 'Arai'],
    ['田切', 'Tagiri', 'Myoko Kogen'], ['錦町', 'Nishikicho', 'Arai'],
    ['長森', 'Nagamori', 'Arai'], ['高柳', 'Takayanagi', 'Arai'],
    ['葎生字江端', 'Moguro', 'Myoko'],
] as const;

test('Every audited Myoko locality normalizes to reviewed English geography for municipal, SUUMO and Rakusumu records', () => {
    for (const [ja, en, area] of reviewedMyoko) {
        for (const source of ['Myoko Akiya Bank', 'SUUMO', 'Rakusumu']) {
            for (const name of [ja, en]) {
                const p = property(name, source, 'Myoko', ja), before = JSON.stringify(p);
                assert.equal(propertyLocation(p), `${area} (${en})`);
                assert.equal(propertyTitle(p), `Property in ${area} (${en})`);
                assert.equal(propertyArea(p), `Myoko (${en})`);
                assert.equal(JSON.stringify(p), before, 'normalization never rewrites source fields');
            }
        }
    }
    const options = locationOptions(reviewedMyoko.map(([ja]) => property(ja)), 'Myoko');
    assert.equal(options.length, 27);
    assert(options.every(o => !/[\u3040-\u30ff\u3400-\u9fff]/.test(o.label)));
    assert.deepEqual(options.filter(o => o.label.startsWith('Myoko (')), [{ value: 'Myoko (Moguro)', label: 'Myoko (Moguro)' }], 'only the verified former-village area uses Myoko');
});

test('Japanese, English, chome, full-width and reviewed romanization variants deduplicate and filter across sources', () => {
    for (const [ja, en, area] of reviewedMyoko) {
        const properties = [property(en, 'Myoko Akiya Bank'), property(ja, 'SUUMO'), property(ja, 'Rakusumu')];
        assert.deepEqual(locationOptions(properties), [{ value: `Myoko (${en})`, label: `${area} (${en})` }]);
        for (const selection of [`Myoko (${en})`, `Myoko (${ja})`, `${area} (${en})`, `${area} (${ja})`]) assert.equal(searchProperties(properties, { ...initialFilters, area: selection }).length, 3);
        for (const keyword of [en, ja === '葎生字江端' ? '葎生' : ja]) assert.equal(searchProperties(properties, { ...initialFilters, keyword }).length, 3);
    }
    const aliases = ['Kamidodo', '上百々', '大字上百々', '上百々２丁目', 'kamidōdō', 'Kamidoudou'].map(name => property(name));
    assert.deepEqual(locationOptions(aliases), [{ value: 'Myoko (Kamidodo)', label: 'Arai (Kamidodo)' }]);
    assert.equal(searchProperties(aliases, { ...initialFilters, area: 'Arai (上百々)' }).length, aliases.length);
    assert.equal(propertyLocation(property('Himekawara')), 'Arai (Himegawara)');
    assert.equal(propertyLocation(property('Shinonome-cho')), 'Arai (Shinonomecho)');
});

test('Sekigawa, Suginosawa, Taguchi and Tagiri stay in Myoko Kogen; Moguro/Sekiyama never become Arai', () => {
    for (const [ja, en] of [['関川', 'Sekigawa'], ['杉野沢', 'Suginosawa'], ['田口', 'Taguchi'], ['田切', 'Tagiri']]) {
        const p = { ...property(ja), regionEn: 'Arai', regionJa: '新井' };
        assert.equal(propertyLocation(p), `Myoko Kogen (${en})`, 'verified locality cannot inherit an unrelated source district');
    }
    assert.equal(propertyLocation(property('葎生')), 'Myoko (Moguro)');
    assert.equal(propertyLocation(property('関山')), 'Myoko (Sekiyama)');
    assert.equal(propertyLocation(property('未確認地区')), 'Myoko (未確認地区)', 'unknown readings are never invented');
    const p = property('Sekigawa', 'SUUMO', 'Myoko', '中央町');
    assert.equal(propertyLocation(p), 'Myoko (Sekigawa)', 'conflicting actual locality names are not silently reclassified');
});

test('All six sources share municipality-scoped normalization without merging different towns or the Yamakuwa subarea', () => {
    const properties = [
        property('Taguchi', 'Myoko Akiya Bank'), property('田口', 'Rakusumu'), property('田口', 'SUUMO'),
        property('Nojiri', 'Shinano Town Akiya Bank', 'Shinano Town'), property('野尻', 'SUUMO', 'Shinano Town'),
        property('野尻山桑', 'SUUMO', 'Shinano Town'),
        property('Takada', 'Joetsu City Akiya Bank', 'Joetsu'), property('高田区', 'Joetsu City Akiya Bank', 'Joetsu'),
        property('Kurai', 'Iizuna Town Akiya Bank', 'Iizuna Town'), property('倉井', 'Rakuen Shinshu Akiya Bank (Iizuna)', 'Iizuna Town'),
    ];
    assert.deepEqual(finderMunicipalities, ['Myoko', 'Shinano', 'Joetsu', 'Iizuna Town']);
    for (const [municipality, selection, count] of [
        ['Myoko', 'Myoko (Taguchi)', 3], ['Shinano', 'Shinano (Nojiri)', 2],
        ['Joetsu', 'Joetsu (Takada)', 2], ['Iizuna Town', 'Iizuna (Kurai)', 2],
    ] as const) {
        assert.equal(searchProperties(properties, { ...initialFilters, municipality, area: selection }).length, count);
    }
    assert.deepEqual(locationOptions(properties, 'Shinano'), [{ value: 'Shinano (Nojiri / Yamakuwa)', label: 'Shinano (Nojiri / Yamakuwa)' }, { value: 'Shinano (Nojiri)', label: 'Shinano (Nojiri)' }].sort((a,b) => a.label.localeCompare(b.label)));
    assert.equal(searchProperties(properties, { ...initialFilters, municipality: 'Joetsu', area: 'Myoko (Taguchi)' }).length, 0);
    const myokoCity = property('上百々', 'SUUMO', 'Myoko City');
    assert.equal(searchProperties([myokoCity], { ...initialFilters, municipality: 'Myoko', area: 'Arai (Kamidodo)' }).length, 1);
    assert.equal(myokoCity.municipality, 'Myoko City');
});

let Card: ComponentType<{ property: FinderProperty }>;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    Card = (await import('../src/components/property-finder/PropertyFinderCard')).default;
});
test('Cards and enquiries use the same canonical label while original links, Japanese disclosures, price and source remain intact', () => {
    const p = { ...property('姫川原', 'Rakusumu', 'Myoko', '姫川原'), purchaseConditionsJa: '原文を保持' };
    const html = renderToStaticMarkup(createElement(Card, { property: p }));
    assert(html.includes('Arai · Himegawara')); assert(html.includes('Property in Arai (Himegawara)'));
    for (const text of ['¥5,000,000', 'Rakusumu', '原文を保持', p.originalListingUrl!]) assert(html.includes(text));
    const enquiry = new URL(enquiryMailto(p)).searchParams.get('body')!;
    assert(enquiry.includes('Area: Arai (Himegawara)') && enquiry.includes('原文を保持'));
});
