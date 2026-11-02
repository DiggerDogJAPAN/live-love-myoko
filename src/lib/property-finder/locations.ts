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
    // Owner-requested directory area label; municipality/source records stay unchanged.
    ['Moguro', '葎生', 'Arai', 'Mogurou', '葎生字江端'],
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
// Preserve pre-existing option identifiers while extending visitor-facing labels.
const filterNames = new Map([...names].map(([municipality, map]) => [municipality, new Map(map)]));
export function filterNeighbourhood(municipality: string | null, value: string): string {
    return filterNames.get(locationMunicipality(municipality) || '')?.get(nameKey(value))?.name || value.trim();
}
for (const [name, japanese] of [
    ['Kubomatsubara', '窪松原'], ['Itsukaichi', '五日市'], ['Hiroshima', '広島'],
]) add('Myoko', { name, japanese, area: 'Arai' }, [japanese]);

// Japan Post romanized address register; see docs/property-finder-areas.md.
const joetsuDistricts: readonly (readonly [string, string])[] = [
    ['Mitsuyacho', '三ツ屋町'],
    ['Mitsuhashi', '三ツ橋'],
    ['Sandashinden', '三田新田'],
    ['Kamigokanno', '上五貫野'],
    ['Kamishowamachi', '上昭和町'],
    ['Shimogennyu', '下源入'],
    ['Shimonoda', '下野田'],
    ['Shimomonzen', '下門前'],
    ['Chuo', '中央'],
    ['Nakadahara', '中田原'],
    ['Nakahakoi', '中箱井'],
    ['Nakadorimachi', '中通町'],
    ['Nakamonzen', '中門前'],
    ['Gochi', '五智'],
    ['Gochishimmachi', '五智新町'],
    ['Nakamachi', '仲町'],
    ['Sumiyoshicho', '住吉町'],
    ['Sanaicho', '佐内町'],
    ['Kagacho', '加賀町'],
    ['Kitashirocho', '北城町'],
    ['Kitahoncho', '北本町'],
    ['Minamishirocho', '南城町'],
    ['Minamihoncho', '南本町'],
    ['Minamitakadamachi', '南高田町'],
    ['Shikasho', '四ケ所'],
    ['Kokufu', '国府'],
    ['Tsuchihashi', '土橋'],
    ['Yamato', '大和'],
    ['Daigakumae', '大学前'],
    ['Otemachi', '大手町'],
    ['Omachi', '大町'],
    ['Onuki', '大貫'],
    ['Koyasu', '子安'],
    ['Yasue', '安江'],
    ['Tomioka', '富岡'],
    ['Koizumi', '小泉'],
    ['Iwaki', '岩木'],
    ['Heiseicho', '平成町'],
    ['Saiwaicho', '幸町'],
    ['Gotenyamacho', '御殿山町'],
    ['Shinkocho', '新光町'],
    ['Kasugayamamachi', '春日山町'],
    ['Kasugashinden', '春日新田'],
    ['Kasugano', '春日野'],
    ['Showamachi', '昭和町'],
    ['Kijima', '木島'],
    ['Kida', '木田'],
    ['Higashinakajima', '東中島'],
    ['Higashishirocho', '東城町'],
    ['Higashihoncho', '東本町'],
    ['Touncho', '東雲町'],
    ['Takidera', '滝寺'],
    ['Ishibashi', '石橋'],
    ['Inada', '稲田'],
    ['Araya', '荒屋'],
    ['Fujizuka', '藤塚'],
    ['Fujimaki', '藤巻'],
    ['Fujishinden', '藤新田'],
    ['Nishishirocho', '西城町'],
    ['Nishihoncho', '西本町'],
    ['Nojiri', '野尻'],
    ['Kodocho', '高土町'],
    ['Takasakishinden', '高崎新田'],
    ['Kamojima', '鴨島'],
    ['Kuroi', '黒井'],
    ['Daizu', '大豆'],
    ['Yokozone', '横曽根'],
    // Keep qualified source areas distinct; do not invent a subarea reading.
    ['Tomioka / Southern redevelopment area', '富岡南部土地区画整理事業'],
    ['Yukojihama / Southern subarea', '遊光寺浜字南原'],
    // Postal readings differ by block; the source omits that distinction.
    ['Sakae district', '栄町'],
    ['Teramachi', '寺町'],
];
for (const [name, japanese] of joetsuDistricts) add('Joetsu', { name, japanese }, [japanese]);

export function reviewedLocation(municipality: string | null, value: string | null | undefined): ReviewedLocation | null {
    if (!value) return null;
    return names.get(locationMunicipality(municipality) || '')?.get(nameKey(value)) || null;
}
export function normalizedNeighbourhood(municipality: string | null, value: string): string {
    return reviewedLocation(municipality, value)?.name || value.trim();
}
