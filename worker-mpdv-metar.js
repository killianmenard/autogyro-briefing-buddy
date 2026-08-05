/**
 * mpdv-metar — Worker Cloudflare : relais METAR/TAF pour app.monplandevol.fr
 * v2.03 — 30/07/2026
 *
 * POURQUOI CE WORKER
 * aviationweather.gov (NOAA) n'autorise pas le CORS. Jusqu'en v2.02, l'app passait donc par
 * une grappe de proxies CORS publics gratuits (codetabs, allorigins, cors.lol, thingproxy...).
 * Deux problèmes : (1) l'adresse IP de l'utilisateur est transmise à des tiers non contractés,
 * difficilement défendable avec un abonnement payant (même raison qui a fait quitter Open-Meteo
 * en v2.01/v2.02) ; (2) ces proxies tombent sans préavis (panne du 15/07/2026).
 * Ce Worker devient la source primaire. Les proxies publics restent en repli côté client :
 * le METAR est une donnée de sécurité, elle ne doit jamais dépendre d'une source unique.
 *
 * CE N'EST PAS UN PROXY OUVERT
 * L'URL amont est construite ici, jamais fournie par l'appelant. Seuls des codes OACI
 * ([A-Z0-9]{3,4}) sont acceptés, 12 au maximum. Toute autre entrée est rejetée en 400.
 *
 * ROLLBACK
 * Retirer le domaine personnalisé metar.monplandevol.fr : le client retombe automatiquement
 * sur les proxies publics (comportement v2.02 à l'identique), sans redéployer l'app.
 *
 * SAUVEGARDE : repo killianmenard/autogyro-briefing-buddy (racine) — worker-mpdv-metar.js.
 */

const UPSTREAM = 'https://aviationweather.gov/api/data/metar';

// Origines autorisées à appeler ce Worker.
const ALLOWED_ORIGINS = new Set([
  'https://app.monplandevol.fr',
  'https://monplandevol.fr',
  'https://www.monplandevol.fr',
]);

// Durée de cache edge. Un METAR est émis toutes les 30 min (SPECI hors cycle) ;
// 5 min garantit une fraîcheur bien supérieure au besoin sans marteler la NOAA.
const EDGE_TTL_S = 300;

const ICAO_RE = /^[A-Z0-9]{3,4}$/;
const MAX_IDS = 12;

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Robots-Tag': 'noindex',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405, origin);
    }

    // Une seule route utile ; tout le reste renvoie 404 (pas de proxy générique).
    if (url.pathname !== '/metar' && url.pathname !== '/metar/') {
      return json({ error: 'not_found' }, 404, origin);
    }

    // --- Validation stricte des codes OACI ---------------------------------
    const rawIds = (url.searchParams.get('ids') || '').toUpperCase().trim();
    if (!rawIds) return json({ error: 'missing_ids' }, 400, origin);

    const ids = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0 || ids.length > MAX_IDS) {
      return json({ error: 'bad_ids_count', max: MAX_IDS }, 400, origin);
    }
    if (!ids.every(id => ICAO_RE.test(id))) {
      return json({ error: 'bad_icao' }, 400, origin);
    }

    // hours borné : évite qu'un appelant demande un historique démesuré à la NOAA.
    let hours = parseInt(url.searchParams.get('hours') || '8', 10);
    if (!Number.isFinite(hours) || hours < 1) hours = 8;
    if (hours > 12) hours = 12;

    // --- Appel amont ------------------------------------------------------
    // Paramètres réordonnés de façon déterministe : deux requêtes équivalentes
    // partagent la même clé de cache edge.
    const upstreamUrl = `${UPSTREAM}?ids=${encodeURIComponent(ids.join(','))}&format=json&taf=true&hours=${hours}`;

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'monplandevol.fr (contact@monplandevol.fr)',
        },
        cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true },
      });
    } catch (e) {
      return json({ error: 'upstream_unreachable' }, 502, origin);
    }

    if (!upstream.ok) {
      return json({ error: 'upstream_error', status: upstream.status }, 502, origin);
    }

    const text = await upstream.text();

    // Cas frequent en France, verifie le 30/07/2026 sur LFLQ et sur un code inexistant :
    // quand AUCUNE des stations demandees n'a de donnees, l'API NOAA repond 200 avec un corps
    // VIDE — pas "[]". Ce n'est pas une panne, c'est "pas de METAR pour ce terrain".
    // On normalise en tableau vide : le client sait deja interpreter [] et enchaine sur son
    // repli "station la plus proche <= 50 km". Sans cette normalisation, LFLQ (terrain du
    // testeur) renverrait une erreur et forcerait le repli sur les proxies publics a chaque
    // briefing — exactement ce que ce Worker est cense eviter.
    if (!text || !text.trim()) {
      return new Response('[]', {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${EDGE_TTL_S}`,
          ...corsHeaders(origin),
        },
      });
    }

    // L'API renvoie parfois une page HTML d'erreur avec un statut 200 : on refuse,
    // le client basculera sur ses sources de repli plutot que d'afficher n'importe quoi.
    if (text.trim().startsWith('<')) {
      return json({ error: 'upstream_not_json' }, 502, origin);
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return json({ error: 'upstream_unexpected' }, 502, origin);
    } catch (e) {
      return json({ error: 'upstream_not_json' }, 502, origin);
    }

    // Reponse transmise telle quelle : format identique a aviationweather.gov,
    // le client n'a aucune logique de parsing specifique au Worker a maintenir.
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${EDGE_TTL_S}`,
        ...corsHeaders(origin),
      },
    });
  },
};
