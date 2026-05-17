/**
 * AutogyroDash — Service Worker v0.4.0
 *
 * Stratégie de cache :
 * - Cache-first (CACHE_STATIC) : HTML, manifest, icônes, libs CDN. Met l'app en cache pour
 *   ouverture offline. Si en cache, on sert le cache ; sinon on tente le réseau puis on cache.
 * - Network-first (CACHE_TILES) : tiles cartes Leaflet / OpenAIP / CartoDB. On essaie le réseau,
 *   on retombe sur le cache si dispo (pour panner une carte déjà vue offline).
 * - Pass-through (no-cache) : appels API live (METAR, vent, météo). Toujours réseau.
 *   Le cache de fraîcheur des données est géré dans l'app via localStorage (TTL court).
 */
const VERSION = 'v0.4.2';
const CACHE_STATIC = `autogyrodash-static-${VERSION}`;
const CACHE_TILES = `autogyrodash-tiles-${VERSION}`;

// Ressources à précharger à l'installation
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-maskable-512.png',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
];

// URLs identifiées comme tiles cartes (network-first avec fallback cache)
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'basemaps.cartocdn.com',
  'api.tiles.openaip.net',
];

// URLs API live (pass-through, jamais cachées par SW)
const API_HOSTS = [
  'aviationweather.gov',
  'api.open-meteo.com',
  'api.core.openaip.net',
  'api.codetabs.com',
  'corsproxy.io',
  'api.allorigins.win',
  'embed.windy.com',
  'aeroweb.meteo.fr',
];

function isTileRequest(url) {
  return TILE_HOSTS.some(h => url.hostname.includes(h));
}

function isApiRequest(url) {
  return API_HOSTS.some(h => url.hostname.includes(h));
}

// Installation : précache des ressources statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      // addAll échoue à la première 404 → on ajoute en parallèle avec catch individuel
      return Promise.all(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Précache échoué :', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== CACHE_STATIC && k !== CACHE_TILES)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch : routage selon le type de ressource
self.addEventListener('fetch', (event) => {
  // On ignore les requêtes non-GET et les schémas non-http(s)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  // 1. API live : pass-through (pas d'interception)
  if (isApiRequest(url)) {
    return; // laisse le navigateur gérer
  }

  // 2. Tiles cartes : network-first + fallback cache
  if (isTileRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_TILES).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(c => c || new Response('', { status: 504 })))
    );
    return;
  }

  // 3. Tout le reste (HTML, libs CDN, icônes) : cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline et pas en cache → fallback minimal pour HTML
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504 });
      });
    })
  );
});

// Messages depuis l'app (force update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
