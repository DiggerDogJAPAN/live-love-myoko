/** Reviewed geographic names, never property records or a source-specific filter.
 * Evidence and the former Myoko-village exception: docs/property-finder-areas.md.
 */
export interface ReviewedLocation { name: string; japanese: string; area?: string }
const myoko: readonly (readonly [string, string, string, ...string[]])[] = [
    ['Ishizukacho', '石塚町', 'Arai'], ['Kyozukacho', '経塚町', 'Arai'],
    ['Hakusancho', '白山町', 'Arai'], ['Oizumo', '小出雲', 'Arai'],
    ['Hidanomori', '美守', 'Arai'], ['Kurihara', '栗原', 'Arai'],
    ['Gakkocho', '学校町', 'Arai'], ['Kamibaba', '上馬場', 'Arai'],
    ['Kagomachi', '籠町', 'Arai'], ['Asahicho', '朝日町', 'Arai'],
    ['Chuocho', '中央町', 'Arai'], ['Yukimori', '雪森', 'Arai'],
    ['Tsukioka', '月岡', 'Arai'], ['Sekigawa', '関川', 'Myoko Kogen'],
    ['Suginosawa', '杉野沢', 'Myoko Kogen'], ['Taguchi', '田口', 'Myoko Kogen'],
    ['Kamidodo', '上百々', 'Arai', 'Kamidoudou'], ['Yoshiki', '吉木', 'Arai'],
    ['Himegawara', '姫川原', 'Arai', 'Himekawara'], ['Shinonomecho', '東雲町', 'Arai'],
    ['Yanaidacho', '柳井田町', 'Arai'], ['Sakaecho', '栄町', 'Arai'],
    ['Tagiri', '田切', 'Myoko Kogen'], ['Nishikicho', '錦町', 'Arai'],
    ['Nagamori', '長森', 'Arai'], ['Takayanagi', '高柳', 'Arai'],
    // These belong to the separate former Myoko village, not Arai/Myoko Kogen.
    ['Moguro', '葎生', 'Myoko', 'Mogurou', '葎生字江端'],
    ['Sekiyama', '関山', 'Myoko'],
];
const otherMunicipalities: Record<string, readonly (readonly [string, string, ...string[]])[]> = {
    Shinano: [
        ['Nojiri', '野尻'], ['Furuma', '古間'], ['Tomino', '富濃'],
        ['Kashiwabara', '柏原'], ['Honami', '穂波'],
        // Keep the named Yamakuwa subarea distinct; it is not just another spelling of Nojiri.
        ['Nojiri / Yamakuwa', '野尻山桑', '野尻字山桑', 'Nojiri Yamakuwa', 'Nojiri (Yamakuwa)'],
    ],
    Iizuna: [
        ['Kurai', '倉井'], ['Sakaguchi', '坂口'], ['Kodama', '小玉'], ['Kawakami', '川上'],
        ['Fukoji', '普光寺'], ['Imogawa', '芋川'], ['Toyono', '豊野'], ['Kosaka', '高坂'],
    ],
    Joetsu: [
        ['Sanwa', '三和区'], ['Yachiho', '八千浦区'], ['Yoshikawa', '吉川区'],
        ['Nadachi', '名立区'], ['Wada', '和田区'], ['Oshima', '大島区'], ['Ogata', '大潟区'],
        ['Yasuzuka', '安塚区'], ['Kasuga', '春日区'], ['Arita', '有田区'], ['Itakura', '板倉区'],
        ['Kakizaki', '柿崎区'], ['Tsuari', '津有区'], ['Uragawara', '浦川原区'],
        ['Kiyosato', '清里区'], ['Naoetsu', '直江津区'], ['Tanihama / Kuwadori', '谷浜・桑取区'],
        ['Kanaya', '金谷区'], ['Kubiki', '頸城区'], ['Takada', '高田区'], ['Nakago', '中郷区'],
    ],
};

/** Municipality identity remains independent of Arai/Myoko Kogen display areas. */
export function locationMunicipality(value: string | null): string | null {
    const name = value?.trim() || null;
    return name === 'Myoko City' ? 'Myoko' : name === 'Shinano Town' ? 'Shinano' : name === 'Iizuna Town' ? 'Iizuna' : name;
}

function nameKey(value: string): string {
    return value.normalize('NFKC').trim().replace(/^大字\s*/, '').replace(/^oaza\s+/i, '')
        .replace(/[0-9一二三四五六七八九十]+丁目$/, '')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s\-‐‑–—]/g, '');
}
const names = new Map<string, Map<string, ReviewedLocation>>();
function add(municipality: string, location: ReviewedLocation, aliases: readonly string[]) {
    let map = names.get(municipality);
    if (!map) { map = new Map(); names.set(municipality, map); }
    for (const alias of [location.name, ...aliases]) map.set(nameKey(alias), location);
}
for (const [name, ja, area, ...aliases] of myoko) add('Myoko', { name, japanese: ja, area }, [ja, ...aliases]);
for (const [municipality, entries] of Object.entries(otherMunicipalities)) {
    for (const [name, ja, ...aliases] of entries) add(municipality, { name, japanese: ja }, [ja, ...(municipality === 'Joetsu' ? [ja.replace(/区$/, '')] : []), ...aliases]);
}
export function reviewedLocation(municipality: string | null, value: string | null | undefined): ReviewedLocation | null {
    if (!value) return null;
    return names.get(locationMunicipality(municipality) || '')?.get(nameKey(value)) || null;
}
export function normalizedNeighbourhood(municipality: string | null, value: string): string {
    return reviewedLocation(municipality, value)?.name || value.trim();
}
