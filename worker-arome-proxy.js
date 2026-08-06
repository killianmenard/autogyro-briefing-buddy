/**
 * arome-proxy — Worker Cloudflare pour arome.monplandevol.fr
 * ----------------------------------------------------------
 * Vent en altitude AROME (Météo-France) pour app.monplandevol.fr.
 * La clé API vit ici (secret AROME_APIKEY), JAMAIS côté client.
 *
 * Route :
 *   GET /wind?lat=44.5766&lon=4.7331[&t=2026-08-06T15:00:00Z]
 *     → { ok, source, run, time, lat, lon, levels:[{m, ft, dirDeg, dirCard, kt, kmh}], … }
 *
 * Secret (Worker → Settings → Variables) :
 *   AROME_APIKEY = clé « API Key » générée sur portail-api.meteofrance.fr
 *                  (abonnement API AROME v1.0, durée -1 = n'expire pas)
 *
 * Licence des données : Licence Ouverte 2.0 — réutilisation commerciale autorisée.
 * ⚠️ Attribution « Météo-France — modèle AROME » OBLIGATOIRE à l'écran.
 *
 * Version : arome-proxy v1.1 — 06/08/2026.
 *
 * CHANGELOG
 *  v1.1 · Concurrence bornée + une nouvelle tentative sur erreur transitoire.
 *         Constaté en production le 06/08 : appelé seul, le Worker rend ses 5 niveaux ;
 *         appelé par l'app sur un trajet de 3 terrains, un niveau manquait. L'app lance
 *         un appel par terrain EN PARALLÈLE et chaque appel lançait 10 sous-requêtes
 *         simultanées → une trentaine d'appels d'un coup chez Météo-France, pour un
 *         quota de 50/min PARTAGÉ entre tous les utilisateurs. Quelques-uns tombaient
 *         en 429. On plafonne donc à 4 sous-requêtes concurrentes et on réessaie une
 *         fois les erreurs transitoires. ⚠️ Une erreur d'ÉCHO n'est jamais réessayée :
 *         ce n'est pas un aléa réseau, c'est une réponse fausse.
 *  v1.0 · version initiale.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ ÉTABLI EMPIRIQUEMENT LE 06/08 (ne pas « simplifier » sans relire)
 *
 *  1. 🔴 `subset=height=500` renvoie le niveau 50 m avec un HTTP 200 et AUCUNE
 *     erreur (100 → 10, 500 → 50 : le dernier chiffre est rogné, et le niveau
 *     obtenu existe dans la grille). Seule `height(500)` est correcte.
 *     → d'où la VÉRIFICATION D'ÉCHO ci-dessous, qui est une exigence de
 *       sécurité, pas une coquetterie : la réponse ré-affiche le temps et la
 *       hauteur réellement servis, on refuse tout écart.
 *  2. Les 4 axes (long, lat, time, height) doivent être figés. Laisser un axe
 *     libre → 404. Pas d'intervalle : `height(10,750)` → erreur.
 *  3. Sur un point, la réponse est du GML/XML avec la valeur dans
 *     <gml:tupleList> — malgré `format=image/tiff`. Aucun binaire à décoder.
 *  4. Authentification : en-tête `apikey`. URL avec `/1.0`.
 *  5. Unité : m/s. Grille 0,025°, origine long -12 / lat 55,4.
 *  6. Runs toutes les 3 h, 52 échéances horaires (0 à +51 h).
 * ────────────────────────────────────────────────────────────────────────────
 */

const VERSION = 'arome-proxy v1.1';

const BASE = 'https://public-api.meteofrance.fr/public/arome/1.0/wcs/'
           + 'MF-NWP-HIGHRES-AROME-0025-FRANCE-WCS/GetCoverage';

const FIELD_U = 'U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND';
const FIELD_V = 'V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND';

// Niveaux retenus : hauteur-sol, calés sur le domaine de vol VFR autogire
// (plafond 2500 ft AGL ≈ 762 m → le niveau 750 m est la dernière ligne utile).
// Chaque niveau coûte 2 requêtes (U + V) : ne pas allonger sans raison.
const LEVELS_M = [10, 100, 250, 500, 750];

// Grille AROME 0.025 (cf. DescribeCoverage)
const GRID_STEP = 0.025;
const GRID_LON0 = -12;      // coin ouest
const GRID_LAT0 = 55.4;     // coin nord (pas négatif sur l'axe lat)
const BBOX = { lonMin: -12, lonMax: 16, latMin: 37.5, latMax: 55.4 };

const RUN_STEP_H = 3;       // runs à 00,03,…,21 UTC
const RUN_LAG_H = 4;        // marge de publication ; on ne demande pas un run trop frais
const RUN_FALLBACKS = 3;    // si le run le plus récent échoue, on remonte
const MAX_LEAD_H = 51;      // dernière échéance disponible
const FETCH_TIMEOUT_MS = 6000;
const CONCURRENCY = 4;        // sous-requêtes simultanées vers Météo-France (v1.1)
const RETRY_DELAY_MS = 400;   // pause avant l'unique nouvelle tentative
const CACHE_TTL_S = 3 * 3600;   // un run vaut 3 h : au-delà, il y en a un nouveau

const ALLOWED_ORIGINS = ['https://app.monplandevol.fr'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!url.pathname.endsWith('/wind')) return json({ ok: false, error: 'not found' }, cors, 404);

    try {
      return await handleWind(request, env, ctx, url, cors);
    } catch (e) {
      // Fail-soft : l'app affiche son message de repli WINTEM/AEROWEB.
      return json({ ok: false, error: String((e && e.message) || e) }, cors, 200);
    }
  },
};

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, cors, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  });
}

/** Accroche une coordonnée au point de grille AROME le plus proche. */
function snapLon(lon) { return +(GRID_LON0 + Math.round((lon - GRID_LON0) / GRID_STEP) * GRID_STEP).toFixed(3); }
function snapLat(lat) { return +(GRID_LAT0 - Math.round((GRID_LAT0 - lat) / GRID_STEP) * GRID_STEP).toFixed(3); }

/** Horodatage au format des coverageid : 2026-08-06T12.00.00Z (points, pas deux-points). */
function runId(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}.00.00Z`;
}
/** Horodatage ISO classique, pour le paramètre subset=time(...). */
function isoZ(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00:00Z`;
}

/** Runs candidats, du plus récent au plus ancien. */
function candidateRuns(now) {
  const out = [];
  const base = new Date(now.getTime() - RUN_LAG_H * 3600e3);
  base.setUTCMinutes(0, 0, 0);
  base.setUTCHours(Math.floor(base.getUTCHours() / RUN_STEP_H) * RUN_STEP_H);
  for (let i = 0; i < RUN_FALLBACKS; i++) out.push(new Date(base.getTime() - i * RUN_STEP_H * 3600e3));
  return out;
}

/** Exécute fn sur items avec au plus `limit` promesses en vol. Préserve l'ordre. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * v1.1 — une seule nouvelle tentative sur erreur TRANSITOIRE (429 quota, 5xx, timeout).
 * Les erreurs d'écho hauteur/temps ne sont volontairement PAS réessayées : elles ne
 * traduisent pas un aléa réseau mais une réponse au mauvais niveau, qu'il faut refuser.
 */
async function fetchPoint(env, coverageId, lon, lat, timeIso, heightM) {
  try {
    return await fetchPointOnce(env, coverageId, lon, lat, timeIso, heightM);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/HTTP (429|5\d\d)|timeout|abort/i.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return await fetchPointOnce(env, coverageId, lon, lat, timeIso, heightM);
  }
}

/** Une requête = une valeur. Renvoie { value, height, time } ou lève. */
async function fetchPointOnce(env, coverageId, lon, lat, timeIso, heightM) {
  const qs = [
    'service=WCS',
    'version=2.0.1',
    'coverageid=' + encodeURIComponent(coverageId),
    // ⚠️ parenthèses obligatoires — `height=500` renvoie 50 m en silence (cf. en-tête).
    'subset=' + encodeURIComponent(`long(${lon})`),
    'subset=' + encodeURIComponent(`lat(${lat})`),
    'subset=' + encodeURIComponent(`time(${timeIso})`),
    'subset=' + encodeURIComponent(`height(${heightM})`),
    'format=' + encodeURIComponent('image/tiff'),
  ].join('&');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE}?${qs}`, { headers: { apikey: env.AROME_APIKEY }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${heightM} m`);

  const xml = await r.text();
  if (xml.indexOf('ExceptionReport') !== -1) throw new Error(`exception WCS sur ${heightM} m`);

  const flat = xml.replace(/\n/g, ' ');
  const mVal = flat.match(/<gml:tupleList>\s*([-0-9.eE+]+)\s*<\/gml:tupleList>/);
  if (!mVal) throw new Error(`valeur absente sur ${heightM} m`);
  const value = parseFloat(mVal[1]);
  if (!isFinite(value)) throw new Error(`valeur non numérique sur ${heightM} m`);

  // 🔴 VÉRIFICATION D'ÉCHO — cf. en-tête, point 1. Une réponse qui ne confirme pas
  // le niveau et l'échéance demandés est REJETÉE : mieux vaut pas de vent qu'un
  // vent affiché au mauvais niveau.
  const echoH = namedValue(flat, 'height');
  const echoT = namedValue(flat, 'time');
  if (echoH === null || Math.abs(parseFloat(echoH) - heightM) > 0.5) {
    throw new Error(`écho hauteur ${echoH} ≠ ${heightM} demandé`);
  }
  if (echoT && echoT.slice(0, 13) !== timeIso.slice(0, 13)) {
    throw new Error(`écho échéance ${echoT} ≠ ${timeIso} demandé`);
  }
  return { value, height: parseFloat(echoH), time: echoT };
}

function namedValue(flatXml, title) {
  const re = new RegExp('title="' + title + '"\\s*/>\\s*<om:value>([^<]*)</om:value>');
  const m = flatXml.match(re);
  return m ? m[1].trim() : null;
}

const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

/** U/V (m/s) → direction météo (d'où vient le vent) + force. */
function uvToWind(u, v) {
  const speedMs = Math.sqrt(u * u + v * v);
  let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  dir = (dir + 360) % 360;
  return {
    dirDeg: Math.round(dir),
    dirCard: CARD[Math.round(dir / 22.5) % 16],
    kt: Math.round(speedMs * 1.94384),
    kmh: Math.round(speedMs * 3.6),
  };
}

async function handleWind(request, env, ctx, url, cors) {
  if (!env.AROME_APIKEY) return json({ ok: false, error: 'AROME_APIKEY absent' }, cors);

  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  if (!isFinite(lat) || !isFinite(lon)) return json({ ok: false, error: 'lat/lon requis' }, cors);
  if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) {
    return json({ ok: false, error: 'hors emprise AROME France' }, cors);
  }

  const gLon = snapLon(lon), gLat = snapLat(lat);
  const now = new Date();

  // Échéance : l'heure ronde demandée, sinon la prochaine heure ronde.
  let target = url.searchParams.get('t')
    ? new Date(url.searchParams.get('t'))
    : new Date(Math.ceil(now.getTime() / 3600e3) * 3600e3);
  if (isNaN(target.getTime())) return json({ ok: false, error: 't invalide' }, cors);
  target.setUTCMinutes(0, 0, 0);
  const timeIso = isoZ(target);

  // Cache : clé par CELLULE DE GRILLE (pas par coordonnée exacte) — deux terrains
  // proches partagent l'entrée. C'est ce qui tient le quota de 50 req/min, partagé
  // entre TOUS les utilisateurs : 10 requêtes amont, puis gratuit jusqu'au run suivant.
  const cache = caches.default;
  const cacheKey = new Request(
    `${url.origin}/wind-cache?lat=${gLat}&lon=${gLon}&t=${encodeURIComponent(timeIso)}`,
    { method: 'GET' }
  );
  if (!url.searchParams.has('fresh')) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cors },
      });
    }
  }

  const errors = [];
  for (const run of candidateRuns(now)) {
    const lead = (target.getTime() - run.getTime()) / 3600e3;
    if (lead < 0 || lead > MAX_LEAD_H) { errors.push(`run ${runId(run)} : échéance hors plage`); continue; }

    const rid = runId(run);
    const cidU = `${FIELD_U}___${rid}`;
    const cidV = `${FIELD_V}___${rid}`;

    // v1.1 — 10 sous-requêtes (5 niveaux × U et V), mais au plus CONCURRENCY en vol.
    // Voir le CHANGELOG : la rafale simultanée provoquait des 429 sur un trajet à
    // plusieurs terrains, et donc des niveaux manquants à l'écran.
    const jobs = [];
    for (const m of LEVELS_M) {
      jobs.push({ m, cid: cidU, comp: 'u' });
      jobs.push({ m, cid: cidV, comp: 'v' });
    }
    const raw = await mapLimit(jobs, CONCURRENCY, async (j) => {
      try {
        return { ...j, res: await fetchPoint(env, j.cid, gLon, gLat, timeIso, j.m) };
      } catch (e) {
        return { ...j, error: String((e && e.message) || e) };
      }
    });

    const byLevel = new Map();
    for (const x of raw) {
      if (!byLevel.has(x.m)) byLevel.set(x.m, {});
      byLevel.get(x.m)[x.comp] = x;
    }
    // Un niveau n'est retenu que si SES DEUX composantes sont valides : une direction
    // calculée sur un U sans son V n'aurait aucun sens.
    const settled = LEVELS_M.map((m) => {
      const p = byLevel.get(m) || {};
      if (!p.u || !p.v || p.u.error || p.v.error) {
        return { m, error: (p.u && p.u.error) || (p.v && p.v.error) || 'composante manquante' };
      }
      return { m, ft: Math.round(m * 3.28084), ...uvToWind(p.u.res.value, p.v.res.value) };
    });

    const levels = settled.filter((l) => !l.error);
    if (!levels.length) {
      errors.push(`run ${rid} : ${settled[0] && settled[0].error}`);
      continue; // run probablement pas encore publié → on remonte au précédent
    }

    const payload = JSON.stringify({
      ok: true,
      version: VERSION,
      source: 'Météo-France — modèle AROME 0.025 (Licence Ouverte 2.0)',
      run: rid,
      time: timeIso,
      leadHours: lead,
      lat: gLat,
      lon: gLon,
      requested: { lat, lon },
      levels,
      partial: levels.length !== LEVELS_M.length,
      dropped: settled.filter((l) => l.error),
    });

    const resp = new Response(payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_S}`,
        'X-Cache': 'MISS',
        ...cors,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  }

  return json({ ok: false, error: 'aucun run exploitable', details: errors }, cors);
}
