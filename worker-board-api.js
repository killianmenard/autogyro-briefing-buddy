/**
 * board-api — Worker Cloudflare pour board.monplandevol.fr
 * ---------------------------------------------------------
 * Proxy lecture/écriture vers les bases Notion du board.
 * Le token Notion vit ici (secret NOTION_TOKEN), JAMAIS dans le HTML.
 *
 * Routes (à monter sur board.monplandevol.fr/api/* — ainsi Cloudflare
 * Access protège aussi l'API, aucune écriture publique possible) :
 *   GET  /api/board            → JSON consolidé des 6 bases + journal (cache edge 5 min)
 *   GET  /api/board?fresh=1    → contourne le cache
 *   GET  /api/health           → tests RÉELS des services (app, vitrine, météo, METAR), cache 60 s
 *   GET  /api/health?fresh=1   → contourne le cache
 *   POST /api/action           → { op: "done"|"undone"|"defer7"|"pin"|"unpin"|"note"|"status", id, value? }
 *   POST /api/create           → { type: "echeance", titre, date, domaine?, code?, note?, vigilance? }
 *
 * Secret à configurer (Worker → Settings → Variables) :
 *   NOTION_TOKEN = secret d'une intégration interne Notion (notion.so/my-integrations)
 *                  ⚠️ partager la page « Board — board.monplandevol.fr » ET la page
 *                  « Decision Log » avec cette intégration (menu ··· → Connexions).
 *
 * Version : board-api v1.1 — 31/07/2026 (ajout /api/health). Copie versionnée : repo + doc projet.
 */

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// IDs des bases (databases, pas data sources — API classique v1)
const DB = {
  echeances:  '75392667-11bd-4a5a-9ed5-a55c84743e62',
  chantiers:  '36079404-8cfe-4216-abc3-6a3481e63b1e',
  sources:    '0d1399b9-2c6d-47b8-8bfb-9e8adb160948',
  conformite: '9089f2e2-3618-4ba8-9bd0-e61c9f7bf743',
  consoles:   '859f7665-3ff5-43d2-bca8-943a9dc19ca1',
  gardefous:  '8025699e-7294-4da6-b6fc-be78589e1267',
  journal:    'e5fbae46-2944-4447-95a8-171e1065330e', // Decision Log DB existante
};

const CACHE_TTL = 300; // 5 min
const ALLOWED_ORIGINS = ['https://board.monplandevol.fr'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname.endsWith('/api/board') && request.method === 'GET') {
        return await getBoard(request, env, ctx, url, cors);
      }
      if (url.pathname.endsWith('/api/health') && request.method === 'GET') {
        return await getHealth(request, ctx, url, cors);
      }
      if (url.pathname.endsWith('/api/action') && request.method === 'POST') {
        const res = await doAction(await request.json(), env);
        ctx.waitUntil(purgeCache(request));
        return json(res, cors);
      }
      if (url.pathname.endsWith('/api/create') && request.method === 'POST') {
        const res = await doCreate(await request.json(), env);
        ctx.waitUntil(purgeCache(request));
        return json(res, cors);
      }
      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, cors, 500);
    }
  },
};

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function cacheKey(request) {
  const u = new URL(request.url);
  return new Request(u.origin + '/api/board', { method: 'GET' });
}

async function purgeCache(request) {
  try { await caches.default.delete(cacheKey(request)); } catch (_) {}
}

async function getBoard(request, env, ctx, url, cors) {
  const cache = caches.default;
  const key = cacheKey(request);
  if (!url.searchParams.has('fresh')) {
    const hit = await cache.match(key);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cors } });
    }
  }

  const [echeances, chantiers, sources, conformite, consoles, gardefous, journal] =
    await Promise.all([
      queryDb(env, DB.echeances, { page_size: 100 }),
      queryDb(env, DB.chantiers, { page_size: 100 }),
      queryDb(env, DB.sources, { page_size: 100 }),
      queryDb(env, DB.conformite, { page_size: 100 }),
      queryDb(env, DB.consoles, { page_size: 100 }),
      queryDb(env, DB.gardefous, { page_size: 100 }),
      queryDb(env, DB.journal, {
        page_size: 15,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }),
    ]);

  const payload = JSON.stringify({
    generated_at: new Date().toISOString(),
    echeances, chantiers, sources, conformite, consoles, gardefous, journal,
  });

  const resp = new Response(payload, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache': 'MISS',
      ...cors,
    },
  });
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}


// ---------- Health checks réels (v1.1) ----------

const HEALTH_TTL = 60; // secondes
const HEALTH_TARGETS = [
  { id: 'app',     nom: 'Application',        url: 'https://app.monplandevol.fr/',
    action: "L'app ne répond pas — dash Cloudflare → Workers & Pages → monplandevol, vérifier le dernier déploiement." },
  { id: 'vitrine', nom: 'Vitrine',            url: 'https://monplandevol.fr/',
    action: 'La vitrine ne répond pas — dash Cloudflare → monplandevol-site, vérifier le dernier déploiement.' },
  { id: 'meteo',   nom: 'Carte météo France', url: 'https://meteo.monplandevol.fr/france-cities?part=1',
    action: "Worker meteo-proxy en panne — l'éditer dans le dash Cloudflare. L'app garde son cache 30 min." },
  { id: 'metar',   nom: 'METAR/TAF',          url: 'https://metar.monplandevol.fr/metar?icao=LFLC',
    action: "Worker mpdv-metar muet — l'app bascule seule sur les 7 proxies publics (repli v2.03). Vérifier dans le dash Cloudflare." },
];

function healthKey(request) {
  const u = new URL(request.url);
  return new Request(u.origin + '/api/health', { method: 'GET' });
}

async function checkOne(t) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(t.url, { signal: ctl.signal, cf: { cacheTtl: 0 }, headers: { 'User-Agent': 'mpdv-board-health/1.1' } });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    // Vivant si la réponse arrive et n'est pas une erreur serveur.
    // (Un 4xx = le service répond ; seul le format d'appel diffère.)
    const ok = r.status < 500;
    let version = null;
    if (t.id === 'app' && ok) {
      const html = (await r.text()).slice(0, 2000);
      const m = html.match(/v\d+\.\d+/);
      if (m) version = m[0];
    }
    return { id: t.id, nom: t.nom, ok, status: r.status, ms, version, action: ok ? null : t.action };
  } catch (e) {
    return { id: t.id, nom: t.nom, ok: false, status: 0, ms: Date.now() - t0, version: null,
             action: t.action, erreur: String(e && e.name === 'AbortError' ? 'timeout 6 s' : e && e.message || e) };
  }
}

async function getHealth(request, ctx, url, cors) {
  const cache = caches.default;
  const key = healthKey(request);
  if (!url.searchParams.has('fresh')) {
    const hit = await cache.match(key);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cors } });
    }
  }
  const checks = await Promise.all(HEALTH_TARGETS.map(checkOne));
  const payload = JSON.stringify({ generated_at: new Date().toISOString(), checks });
  const resp = new Response(payload, {
    headers: { 'Content-Type': 'application/json; charset=utf-8',
               'Cache-Control': `public, max-age=${HEALTH_TTL}`, 'X-Cache': 'MISS', ...cors },
  });
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

async function notionFetch(env, path, init = {}) {
  const r = await fetch(NOTION + path, {
    ...init,
    headers: {
      'Authorization': `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function queryDb(env, dbId, body) {
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
  return (data.results || []).map(normalizePage);
}

/** Aplatis une page Notion en objet simple { id, url, <propriété>: valeur } */
function normalizePage(page) {
  const out = { id: page.id, notion_url: page.url, created_time: page.created_time };
  for (const [name, prop] of Object.entries(page.properties || {})) {
    out[name] = propValue(prop);
  }
  return out;
}

function propValue(p) {
  switch (p.type) {
    case 'title':     return (p.title || []).map(t => t.plain_text).join('');
    case 'rich_text': return (p.rich_text || []).map(t => t.plain_text).join('');
    case 'select':    return p.select ? p.select.name : null;
    case 'date':      return p.date ? p.date.start : null;
    case 'checkbox':  return !!p.checkbox;
    case 'url':       return p.url || null;
    case 'number':    return p.number;
    case 'created_time': return p.created_time;
    default:          return null;
  }
}

// ---------- Écritures ----------

async function doAction(body, env) {
  const { op, id, value } = body || {};
  if (!op || !id) throw new Error('op et id requis');
  const props = {};

  if (op === 'done')   props['Statut'] = { select: { name: 'fait' } };
  else if (op === 'undone') props['Statut'] = { select: { name: 'à traiter' } };
  else if (op === 'defer7') {
    if (!value) throw new Error('value (nouvelle date ISO) requise pour defer7');
    props['Échéance'] = { date: { start: value } };
    props['Statut'] = { select: { name: 'reporté' } };
  }
  else if (op === 'pin')   props['Épinglé'] = { checkbox: true };
  else if (op === 'unpin') props['Épinglé'] = { checkbox: false };
  else if (op === 'note')  props['Note'] = { rich_text: [{ text: { content: String(value || '').slice(0, 1800) } }] };
  else if (op === 'status') props['Statut'] = { select: { name: String(value) } };
  else throw new Error('op inconnue: ' + op);

  await notionFetch(env, `/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
  return { ok: true };
}

async function doCreate(body, env) {
  const { type } = body || {};
  if (type !== 'echeance') throw new Error('type non géré: ' + type);
  if (!body.titre || !body.date) throw new Error('titre et date requis');

  const props = {
    'Titre': { title: [{ text: { content: body.titre } }] },
    'Échéance': { date: { start: body.date } },
    'Statut': { select: { name: 'à traiter' } },
  };
  if (body.domaine) props['Domaine'] = { select: { name: body.domaine } };
  if (body.code)    props['Code'] = { rich_text: [{ text: { content: body.code } }] };
  if (body.note)    props['Note'] = { rich_text: [{ text: { content: body.note } }] };
  if (body.vigilance) props['Vigilance'] = { checkbox: true };

  const page = await notionFetch(env, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: DB.echeances }, properties: props }),
  });
  return { ok: true, id: page.id };
}
