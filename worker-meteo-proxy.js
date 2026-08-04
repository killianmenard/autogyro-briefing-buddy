// ============================================================
// Worker Cloudflare — proxy météo MET Norway pour monplandevol.fr
// Endpoint : GET /france-cities?part=1|2|3 (3 parts de ~34 villes :
// limite de 50 sous-requêtes par invocation sur le plan Workers gratuit)
// Renvoie un tableau JSON au format Open-Meteo (compatible front v2.01) :
// [ { latitude, longitude, current: { temperature_2m, cloud_cover,
//     wind_speed_10m, wind_direction_10m, wind_gusts_10m, weather_code } }, ... ]
// Vents en nœuds (kt). weather_code = code WMO reconstruit depuis symbol_code MET.
// Source : api.met.no Locationforecast 2.0 (licence CC BY 4.0 — attribution obligatoire).
// Cache edge : 30 min → ~101 requêtes MET / 30 min quel que soit le nombre d'utilisateurs.
// ============================================================

const ALLOWED_ORIGINS = ['https://app.monplandevol.fr'];
const USER_AGENT = 'monplandevol.fr weather-proxy/1.0 contact@monplandevol.fr';
const CACHE_TTL_S = 1800; // 30 min (MET met à jour ~1x/heure)
// 'complete' obligatoire : les rafales (wind_speed_of_gust) sont absentes de l'endpoint 'compact'
const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const MS_TO_KT = 1.943844;
const PART_SIZE = 34; // 101 villes -> parts de 34/34/33 (< 50 sous-requêtes)

// ⚠️ ORDRE IDENTIQUE à FRANCE_CITIES dans index.html (le front associe par index)
const CITIES = [
["Paris", 48.8566, 2.3522],
["Marseille", 43.2965, 5.3698],
["Lyon", 45.764, 4.8357],
["Toulouse", 43.6047, 1.4442],
["Nice", 43.7102, 7.262],
["Nantes", 47.2184, -1.5536],
["Montpellier", 43.6108, 3.8767],
["Strasbourg", 48.5734, 7.7521],
["Bordeaux", 44.8378, -0.5792],
["Lille", 50.6292, 3.0573],
["Rennes", 48.1173, -1.6778],
["Reims", 49.2583, 4.0317],
["Le Havre", 49.4944, 0.1079],
["Saint-Étienne", 45.4397, 4.3872],
["Toulon", 43.1242, 5.928],
["Grenoble", 45.1885, 5.7245],
["Dijon", 47.322, 5.0415],
["Angers", 47.4784, -0.5632],
["Nîmes", 43.8367, 4.3601],
["Aix-en-Provence", 43.5297, 5.4474],
["Le Mans", 48.0061, 0.1996],
["Clermont-Ferrand", 45.7772, 3.087],
["Brest", 48.3905, -4.486],
["Limoges", 45.8336, 1.2611],
["Tours", 47.3941, 0.6848],
["Amiens", 49.8941, 2.2958],
["Annecy", 45.8992, 6.1294],
["Perpignan", 42.6886, 2.8946],
["Metz", 49.1193, 6.1757],
["Besançon", 47.2378, 6.0241],
["Orléans", 47.9029, 1.9039],
["Rouen", 49.4432, 1.0993],
["Mulhouse", 47.7508, 7.3359],
["Caen", 49.1829, -0.3707],
["Nancy", 48.6921, 6.1844],
["Tourcoing", 50.7235, 3.1612],
["Roubaix", 50.6943, 3.1747],
["Avignon", 43.9493, 4.8055],
["Dunkerque", 51.0344, 2.3768],
["Poitiers", 46.5802, 0.3404],
["Versailles", 48.8049, 2.1204],
["Cherbourg", 49.6333, -1.6167],
["Pau", 43.2951, -0.3708],
["La Rochelle", 46.1591, -1.1521],
["Béziers", 43.345, 3.2154],
["Antibes", 43.581, 7.1251],
["Cannes", 43.5528, 7.0174],
["Calais", 50.9513, 1.8587],
["Mérignac", 44.8328, -0.6442],
["Ajaccio", 41.9192, 8.7386],
["Saint-Nazaire", 47.2733, -2.2138],
["Quimper", 47.9971, -4.0975],
["Valence", 44.9333, 4.8919],
["La Seyne-sur-Mer", 43.1019, 5.88],
["Troyes", 48.2973, 4.0744],
["Chambéry", 45.5646, 5.9178],
["Lorient", 47.7482, -3.3702],
["Niort", 46.3232, -0.4633],
["Saint-Quentin", 49.8479, 3.2876],
["Hyères", 43.1199, 6.128],
["Beauvais", 49.4297, 2.0808],
["Meaux", 48.9606, 2.8782],
["Bastia", 42.7028, 9.4509],
["Bourges", 47.081, 2.3989],
["Bayonne", 43.4929, -1.4748],
["La Roche-sur-Yon", 46.6705, -1.4267],
["Albi", 43.9298, 2.1481],
["Vannes", 47.6582, -2.76],
["Châteauroux", 46.8104, 1.6912],
["Châlons-en-Champagne", 48.9576, 4.3636],
["Belfort", 47.6379, 6.8629],
["Évreux", 49.0274, 1.15],
["Cholet", 47.0589, -0.8786],
["Saint-Brieuc", 48.5136, -2.7659],
["Chartres", 48.4467, 1.4895],
["Saint-Malo", 48.6492, -2.026],
["Bourg-en-Bresse", 46.2057, 5.2257],
["Laval", 48.0698, -0.7669],
["Roanne", 46.0367, 4.0689],
["Arles", 43.6766, 4.6278],
["Montauban", 44.0181, 1.3556],
["Tarbes", 43.2329, 0.0782],
["Agen", 44.2026, 0.6178],
["Saint-Lô", 49.1158, -1.0892],
["Périgueux", 45.1839, 0.7218],
["Auxerre", 47.798, 3.574],
["Vienne", 45.5266, 4.8744],
["Compiègne", 49.418, 2.826],
["Angoulême", 45.65, 0.1564],
["Saintes", 45.7466, -0.6346],
["Cahors", 44.4475, 1.4408],
["Béthune", 50.5302, 2.6336],
["Annemasse", 46.1953, 6.2364],
["Carcassonne", 43.213, 2.3491],
["Cannes", 43.5528, 7.0174],
["Brive", 45.1591, 1.5337],
["Évian", 46.4007, 6.5905],
["Biarritz", 43.4832, -1.5586],
["Châteaudun", 48.0699, 1.3318],
["Briançon", 44.902, 6.6406],
["Verdun", 49.1599, 5.3838]
];

// symbol_code MET (base, sans _day/_night) → code WMO équivalent Open-Meteo.
// Les averses de neige sont mappées en 71-75 (le front ne gère pas 85/86).
const SYMBOL_TO_WMO = {
clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
lightrain: 61, rain: 63, heavyrain: 65,
lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
lightsleet: 66, sleet: 67, heavysleet: 67,
lightsleetshowers: 80, sleetshowers: 81, heavysleetshowers: 82,
lightsnow: 71, snow: 73, heavysnow: 75,
lightsnowshowers: 71, snowshowers: 73, heavysnowshowers: 75
};

function symbolToWmo(symbol) {
if (!symbol) return null;
const base = symbol.split('_')[0];
if (base.includes('thunder')) return 95;
return (base in SYMBOL_TO_WMO) ? SYMBOL_TO_WMO[base] : 2;
}

function corsHeaders(request) {
const origin = request.headers.get('Origin');
return {
'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
'Access-Control-Allow-Methods': 'GET, OPTIONS',
'Vary': 'Origin'
};
}

async function fetchCity(name, lat, lon) {
// MET exige max 4 décimales sur lat/lon
const url = `${MET_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
try {
const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const data = await r.json();
const ts = data?.properties?.timeseries?.[0];
const d = ts?.data?.instant?.details;
if (!d) throw new Error('timeseries vide');
const symbol = ts.data?.next_1_hours?.summary?.symbol_code || ts.data?.next_6_hours?.summary?.symbol_code || null;
const kt = v => (v === undefined || v === null) ? null : Math.round(v * MS_TO_KT * 10) / 10;
return {
latitude: lat, longitude: lon,
current: {
temperature_2m: d.air_temperature ?? null,
cloud_cover: (d.cloud_area_fraction === undefined) ? null : Math.round(d.cloud_area_fraction),
wind_speed_10m: kt(d.wind_speed),
wind_direction_10m: (d.wind_from_direction === undefined) ? null : Math.round(d.wind_from_direction),
wind_gusts_10m: kt(d.wind_speed_of_gust),
weather_code: symbolToWmo(symbol)
}
};
} catch (e) {
// Ville en échec → current:null ; le front l'ignore proprement (if (!w || !w.current) return)
return { latitude: lat, longitude: lon, current: null, error: String(e.message || e) };
}
}

async function buildPayload(cities) {
const results = new Array(cities.length);
const CONCURRENCY = 10;
let idx = 0;
async function workerLoop() {
while (idx < cities.length) {
const i = idx++;
const [name, lat, lon] = cities[i];
results[i] = await fetchCity(name, lat, lon);
}
}
await Promise.all(Array.from({ length: CONCURRENCY }, workerLoop));
return results;
}

export default {
async fetch(request, env, ctx) {
const url = new URL(request.url);

if (request.method === 'OPTIONS') {
return new Response(null, { status: 204, headers: corsHeaders(request) });
}
if (request.method !== 'GET' || url.pathname !== '/france-cities') {
return new Response('Not found', { status: 404, headers: corsHeaders(request) });
}
const part = parseInt(url.searchParams.get('part') || '0', 10);
if (part < 1 || part > 3) {
return new Response('Param part=1|2|3 requis', { status: 400, headers: corsHeaders(request) });
}
const start = (part - 1) * PART_SIZE;
const slice = CITIES.slice(start, part === 3 ? CITIES.length : start + PART_SIZE);

const cache = caches.default;
const cacheKey = new Request('https://meteo.monplandevol.fr/france-cities?part=' + part);
let response = await cache.match(cacheKey);
if (response) {
response = new Response(response.body, response);
for (const [k, v] of Object.entries(corsHeaders(request))) response.headers.set(k, v);
response.headers.set('X-Cache', 'HIT');
return response;
}

const payload = await buildPayload(slice);
const ok = payload.filter(p => p.current).length;
// Si MET est massivement en échec, ne pas mettre en cache (le front basculera sur SON cache stale)
const cacheable = ok >= slice.length / 2;

response = new Response(JSON.stringify(payload), {
status: cacheable ? 200 : 503,
headers: {
'Content-Type': 'application/json; charset=utf-8',
'Cache-Control': `public, s-maxage=${CACHE_TTL_S}, max-age=600`,
'X-Cache': 'MISS',
'X-Cities-Ok': String(ok),
...corsHeaders(request)
}
});
if (cacheable) ctx.waitUntil(cache.put(cacheKey, response.clone()));
return response;
}
};
