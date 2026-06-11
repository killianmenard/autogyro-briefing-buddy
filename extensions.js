/* ============================================================
   AutogyroDash — extensions v0.8.25
   ------------------------------------------------------------
   Nouveau dans v0.6.34 (hotfix v0.6.5 — 4 correctifs ciblés) :
     A. Fusion overlays-carte + map en un seul bloc
        "Carte des aérodromes" avec un header + un chevron unique
     B. Chevrons toggle UNIFORMES : tous au même style et même
        position (extrême droite) pour tous les blocs pliables
        (y compris Trajet, Météo France, Notes pilote)
     C. Zones aériennes traversées : taille fixe + scroll interne
        + align-items:start pour ne pas étirer Notes pilote
     D. Fix du bloc "résumé du trajet" (cassé en v0.6.5 car le
        makeNativeBlockCollapsible ne gérait pas wrapper>card)

   Nouveau dans v0.6.5 (correctifs UI desktop demandés par K.) :
     1. Fiche ACFT : grille équilibrée (1 ligne pleine + 5×2 cols)
        - Transpondeur retire son col-span-2
        - Indicatif radio à côté du transpondeur (plus à côté immat)
     2. Brief : TOUS les blocs pliables avec chevron ▼/▲ explicite
        (sauf carte interactive Leaflet — invalidation casserait map)
     3. Brief : réorganisation selon croquis
        - Trajet pleine largeur EN HAUT
        - Météo générale | Météo Visuelle
        - AZBA/RTBA | NOTAM
        - Carte aérodromes pleine largeur
        - Zones aériennes traversées | Notes Pilote
     4. Satellite : toggle on/off à GAUCHE de [temp][vent][nuages]
        + visible aussi en mode plein écran météo France
        + cache automatiquement temp/vent/nuages quand ON
     5. Météo France : zoom auto sur l'itinéraire quand ≥2 AD remplis
        (sinon vue France entière par défaut)

   Garde tous les fixes v0.6.4 (navigation tabs, ACFT slots,
   lexique SOFIA, AZBA/NOTAM popup, etc.)
   ============================================================ */

(async function() {
  'use strict';

  function waitForAppReady() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof AERODROMES_ALL !== 'undefined'
            && typeof STATE !== 'undefined'
            && typeof computeTrip === 'function'
            && document.querySelector('.tab-btn[data-tab="sources"], .tab-btn[data-tab="resources"]')) resolve();
        else setTimeout(check, 150);
      };
      check();
    });
  }
  await waitForAppReady();

  console.log('[Extensions v0.6.34] Boot...');

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function hideAllTabs() {
    const ids = ['tab-plan', 'tab-acft', 'tab-sources', 'tab-resources', 'tab-params', 'tab-history'];
    ids.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => s.classList.add('hidden'));
  }
  function closeMobileMenu() {
    const pill = document.querySelector('.header-pill');
    const mobileBtn = document.getElementById('mobile-menu-toggle');
    if (pill && pill.classList.contains('menu-open')) {
      pill.classList.remove('menu-open');
      if (mobileBtn) {
        mobileBtn.classList.remove('open');
        mobileBtn.innerHTML = '<i data-lucide="menu" class="h-4 w-4"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  try {
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.8.25');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.8.25';
    });
  } catch (e) {}

  // ============================================================
  // SIGLES SOFIA
  // ============================================================
  const SIGLES_CACHE_KEY = 'autogyrodash_sigles_v1';
  const SIGLES_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  async function loadSigles() {
    try {
      const cached = localStorage.getItem(SIGLES_CACHE_KEY);
      const exp = parseInt(localStorage.getItem(SIGLES_CACHE_KEY + '_exp') || '0');
      if (cached && exp > Date.now()) return JSON.parse(cached);
    } catch (e) {}
    try {
      const r = await fetch('sigles.json', { cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      try {
        localStorage.setItem(SIGLES_CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(SIGLES_CACHE_KEY + '_exp', String(Date.now() + SIGLES_CACHE_TTL));
      } catch (e) {}
      return data;
    } catch (e) { console.warn('[Sigles] Load failed', e); return []; }
  }
  const SIGLES = await loadSigles();
  console.log(`[Sigles] ${SIGLES.length} sigles chargés`);

  // ============================================================
  // PAGE RESSOURCES (inchangée v0.6.4)
  // ============================================================
  function replaceSourcesWithResources() {
    let resourcesTab = document.querySelector('.tab-btn[data-tab="resources"]');
    let resourcesSection = document.getElementById('tab-resources');
    if (!resourcesTab) {
      resourcesTab = document.querySelector('.tab-btn[data-tab="sources"]');
      resourcesSection = document.getElementById('tab-sources');
      if (resourcesTab) { resourcesTab.textContent = 'ressources'; resourcesTab.dataset.tab = 'resources'; }
      if (resourcesSection) resourcesSection.id = 'tab-resources';
    }
    if (!resourcesTab || !resourcesSection) return;
    resourcesTab.textContent = 'ressources';
    resourcesSection.innerHTML = buildResourcesHtml();
    setupResourcesNav();
    resourcesTab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      resourcesTab.classList.add('active');
      hideAllTabs();
      resourcesSection.classList.remove('hidden');
      closeMobileMenu();
    });
  }
  function buildResourcesHtml() {
    return `
      <div class="card p-4 space-y-4">
        <h2 class="section-title text-sm">ressources</h2>
        <div class="flex gap-1 border-b border-thin -mx-4 px-4 pb-0 flex-wrap">
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="lexicon">📖 Sigles aéro</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="temsi">🌧 Symboles TEMSI</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="airspace">🛡️ Espaces aériens</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="azba">⚔️ AZBA / RTBA</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="sources">🔗 Sources</button>
        </div>
        <div class="res-subpage" data-sub="lexicon">${buildLexiconHtml()}</div>
        <div class="res-subpage hidden" data-sub="temsi">${buildTemsiHtml()}</div>
        <div class="res-subpage hidden" data-sub="airspace">${buildAirspaceLexiconHtml()}</div>
        <div class="res-subpage hidden" data-sub="azba">${buildAzbaInfoHtml()}</div>
        <div class="res-subpage hidden" data-sub="sources">${buildSourcesContentHtml()}</div>
      </div>
    `;
  }
  function buildLexiconHtml() {
    return `
      <p class="text-xs text-muted">Glossaire officiel des sigles aéronautiques (source : SOFIA, DGAC — ${SIGLES.length} sigles).</p>
      <div style="margin-top:12px;position:sticky;top:0;background:var(--card);padding:8px 0;z-index:5;">
        <input type="search" id="sigles-search" placeholder="🔍 Rechercher (ex: NOTAM, QNH, AZBA...)" class="ad-input w-full" style="width:100%;font-size:14px;" autocomplete="off" autocapitalize="characters" />
        <div id="sigles-count" class="text-xs text-muted mt-1">${SIGLES.length} sigles disponibles</div>
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead style="position:sticky;top:0;background:var(--muted);z-index:4;"><tr><th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);width:90px;">Sigle</th><th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);">Définition</th></tr></thead>
          <tbody id="sigles-tbody">${buildSiglesRows(SIGLES)}</tbody>
        </table>
      </div>
    `;
  }
  function buildSiglesRows(items) {
    if (!items.length) return `<tr><td colspan="2" style="padding:16px;text-align:center;color:var(--muted-foreground);">Aucun résultat.</td></tr>`;
    return items.map(it => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;font-weight:600;white-space:nowrap;vertical-align:top;font-family:ui-monospace,monospace;font-size:11px;">${escapeHtml(it.s)}</td><td style="padding:6px 8px;font-size:11px;line-height:1.45;">${escapeHtml(it.d)}</td></tr>`).join('');
  }
  function setupSiglesSearch() {
    const input = document.getElementById('sigles-search');
    const tbody = document.getElementById('sigles-tbody');
    const counter = document.getElementById('sigles-count');
    if (!input || !tbody) return;
    let debounce;
    input.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = (e.target.value || '').trim().toLowerCase();
        if (!q) { tbody.innerHTML = buildSiglesRows(SIGLES); if (counter) counter.textContent = `${SIGLES.length} sigles disponibles`; return; }
        const filtered = SIGLES.filter(it => it.s.toLowerCase().includes(q) || it.d.toLowerCase().includes(q));
        tbody.innerHTML = buildSiglesRows(filtered);
        if (counter) counter.textContent = filtered.length === 0 ? 'Aucun résultat' : `${filtered.length} sigle${filtered.length>1?'s':''} trouvé${filtered.length>1?'s':''}`;
      }, 120);
    });
  }
  function buildTemsiHtml() {
    const phenomenes = [['thunderstorm','Orages'],['mountain_wave','Ondes orographiques'],['squall_line','Ligne de grains'],['moderate_turb','Turbulence modérée'],['severe_turb','Turbulence forte'],['hail','Grêle'],['drizzle','Bruine'],['rain','Pluie'],['snow','Neige *'],['showers','Averses *'],['freezing_rain','Précipitation se congelant'],['freezing_fog','Brouillard givrant'],['moderate_icing','Givrage modéré'],['severe_icing','Givrage fort'],['blowing_snow','Chasse-neige étendue'],['volcanic','Volcan en activité'],['radioactive','Pollution nucléaire'],['widespread_fog','Brouillard étendu *'],['heavy_sand_haze','Forte brume de sable ou de poussière'],['sandstorm','Tempête de sable ou de poussière'],['dry_haze','Brume sèche de grande étendue'],['mist','Brume de grande étendue'],['smoke','Fumée de grande étendue']];
    const localisations = [['COT','Sur la côte'],['LAN',"À l'intérieur des terres"],['LOC','Localement'],['MAR','En mer'],['MON','Au-dessus des montagnes'],['SFC','En surface'],['VAL','Dans les vallées'],['CIT','À proximité des villes']];
    const phenHtml = phenomenes.map(([kind,label]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);"><div style="flex-shrink:0;width:44px;height:32px;display:flex;align-items:center;justify-content:center;">${temsiSvg(kind)}</div><div style="font-size:12px;line-height:1.3;">${escapeHtml(label)}</div></div>`).join('');
    const locHtml = localisations.map(([code,label]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);"><div style="flex-shrink:0;min-width:44px;text-align:center;"><span style="display:inline-block;padding:3px 8px;background:var(--accent);color:var(--accent-ink);border-radius:4px;font-weight:600;font-size:11px;font-family:ui-monospace,monospace;">${escapeHtml(code)}</span></div><div style="font-size:12px;line-height:1.3;">${escapeHtml(label)}</div></div>`).join('');
    return `
      <p class="text-xs text-muted">Symboles officiels des cartes TEMSI Météo France.</p>
      <h3 class="text-sm font-semibold mt-4 mb-2">⚡ Symboles du temps significatif</h3>
      <img src="data:image/jpeg;base64,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" alt="Planche des symboles TEMSI officiels Météo France" style="width:100%;max-width:600px;display:block;border:1px solid var(--border);border-radius:8px;background:#fff;padding:6px;box-sizing:border-box;" />
      <h3 class="text-sm font-semibold mt-5 mb-2">📍 Codes de localisation</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">${locHtml}</div>
    `;
  }
  function temsiSvg(kind) {
    const C='currentColor';
    const wrap=(inner)=>`<svg viewBox="0 0 36 24" width="36" height="24" xmlns="http://www.w3.org/2000/svg" style="color:var(--foreground);" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    switch(kind){
      // Orages — éclair fléché
      case 'thunderstorm': return wrap(`<path d="M21 3 L12 12 L17 12 L13 21"/><path d="M13 21 L12.5 16.8 M13 21 L16.4 18.8"/>`);
      // Ondes orographiques — lentille
      case 'mountain_wave': return wrap(`<ellipse cx="18" cy="12" rx="11" ry="3.6"/>`);
      // Ligne de grains — zigzag fléché
      case 'squall_line': return wrap(`<path d="M5 17 L12 8 L16 14 L23 6 L27 12"/><path d="M27 12 L23.3 11.4 M27 12 L26.6 8.2"/>`);
      // Turbulence modérée — chevron simple
      case 'moderate_turb': return wrap(`<path d="M7 15 L18 8 L29 15"/>`);
      // Turbulence forte — double chevron
      case 'severe_turb': return wrap(`<path d="M7 11 L18 5 L29 11"/><path d="M7 19 L18 13 L29 19"/>`);
      // Grêle — triangle
      case 'hail': return wrap(`<path d="M18 5 L28 19 L8 19 Z"/>`);
      // Bruine — virgule pleine
      case 'drizzle': return wrap(`<path d="M19 7 C22 7 23 11 21 14 C20 16 17 17 14 18 C17 15 19 14 18.5 11.5 C18.2 9.5 16.8 8 19 7 Z" fill="${C}" stroke="none"/>`);
      // Pluie — hachures diagonales
      case 'rain': return wrap(`<line x1="12" y1="15" x2="15" y2="8"/><line x1="18" y1="16" x2="21" y2="9"/><line x1="24" y1="15" x2="27" y2="8"/>`);
      // Neige — astérisque 6 branches
      case 'snow': return wrap(`<line x1="18" y1="5" x2="18" y2="19"/><line x1="12" y1="8.5" x2="24" y2="15.5"/><line x1="12" y1="15.5" x2="24" y2="8.5"/>`);
      // Averses — triangle inversé
      case 'showers': return wrap(`<path d="M9 6 L27 6 L18 19 Z"/>`);
      // Précipitation se congelant — onde + crochet
      case 'freezing_rain': return wrap(`<path d="M8 10 C11 6 14 6 16 10 C18 14 21 14 23 10"/><path d="M23 10 C25.5 10.5 26.5 13 25 15.5"/>`);
      // Brouillard givrant — lignes brume + crochet
      case 'freezing_fog': return wrap(`<line x1="7" y1="9" x2="29" y2="9"/><line x1="7" y1="13" x2="29" y2="13"/><line x1="7" y1="17" x2="29" y2="17"/><path d="M14 6.5 C16 4.5 19 5 19 7.5"/>`);
      // Givrage modéré — corne / arc
      case 'moderate_icing': return wrap(`<path d="M8 16 C8 9 28 9 28 16"/>`);
      // Givrage fort — double arc
      case 'severe_icing': return wrap(`<path d="M8 11 C8 5 28 5 28 11"/><path d="M8 20 C8 14 28 14 28 20"/>`);
      // Chasse-neige étendue — flèche montante + croix
      case 'blowing_snow': return wrap(`<line x1="11" y1="19" x2="26" y2="6"/><path d="M26 6 L20.2 7 M26 6 L25 11.8"/><line x1="6" y1="18" x2="12" y2="18"/><line x1="9" y1="15" x2="9" y2="21"/>`);
      // Volcan en activité — relief + panache
      case 'volcanic': return wrap(`<path d="M7 20 L14 9 L22 9 L29 20"/><path d="M16.5 9 C15.5 6 18.5 6 17.5 3"/><path d="M20 9 C19.2 6.5 21.5 6.5 21 4"/>`);
      // Pollution nucléaire — trèfle radioactif
      case 'radioactive': return wrap(`<circle cx="18" cy="12" r="9"/><circle cx="18" cy="12" r="1.7" fill="${C}" stroke="none"/><path d="M18 12 L13.5 4.2 A9 9 0 0 1 22.5 4.2 Z" fill="${C}" stroke="none"/><path d="M18 12 L25.8 16.5 A9 9 0 0 1 21.3 19.8 Z" fill="${C}" stroke="none"/><path d="M18 12 L14.7 19.8 A9 9 0 0 1 10.2 16.5 Z" fill="${C}" stroke="none"/>`);
      // Brouillard étendu — trois lignes
      case 'widespread_fog': return wrap(`<line x1="7" y1="8" x2="29" y2="8"/><line x1="7" y1="12" x2="29" y2="12"/><line x1="7" y1="16" x2="29" y2="16"/>`);
      // Forte brume de sable/poussière — S
      case 'heavy_sand_haze': return wrap(`<path d="M24 8 C24 5.5 19 4.5 16 6 C12 8 13 11 17 12 C21 13 22 16.5 18 18 C15 19 11 18 11 15.5"/>`);
      // Tempête de sable/poussière — S barré
      case 'sandstorm': return wrap(`<path d="M24 8 C24 5.5 19 4.5 16 6 C12 8 13 11 17 12 C21 13 22 16.5 18 18 C15 19 11 18 11 15.5"/><line x1="17.5" y1="3.5" x2="17.5" y2="20.5"/>`);
      // Brume sèche de grande étendue — infini (deux cercles)
      case 'dry_haze': return wrap(`<circle cx="13.5" cy="12" r="4.4"/><circle cx="22.5" cy="12" r="4.4"/>`);
      // Brume de grande étendue — deux lignes
      case 'mist': return wrap(`<line x1="8" y1="10" x2="28" y2="10"/><line x1="8" y1="14" x2="28" y2="14"/>`);
      // Fumée de grande étendue — onde horizontale
      case 'smoke': return wrap(`<path d="M7 14 C9 9 12 9 14 12 C16 15 19 15 21 12 C23 9 26 9 28 12"/>`);
      default: return wrap(`<text x="18" y="17" text-anchor="middle" font-size="13" fill="${C}" stroke="none">?</text>`);
    }
  }
  function buildAirspaceLexiconHtml() {
    const classes = [['A','IFR uniquement','Pas de VFR.'],['B','IFR + VFR','VFR avec clearance.'],['C','IFR + VFR','VFR avec clearance.'],['D','IFR + VFR','VFR avec clearance + info trafic.'],['E','IFR + VFR','VFR sans clearance, info trafic.'],['F','IFR conseil','Rare en France.'],['G','Non contrôlé','⭐ Standard VFR autogire sous 2500 ft AGL.']];
    const zones = [['CTR','Control Zone','Zone contrôlée AD.','#2563EB'],['TMA','Terminal Manoeuvring Area','Au-dessus CTR.','#2563EB'],['ATZ','Aerodrome Traffic Zone','AD non-contrôlé.','#7C3AED'],['ZRT','Zone Réglementée Temporaire','SUP AIP/NOTAM.','#DC2626'],['ZIT','Zone Interdite Temporaire','Pénétration interdite.','#991B1B'],['ZDT','Zone Dangereuse Temporaire','Activité dangereuse.','#EA580C'],['R','Restricted','Permanente.','#DC2626'],['D','Danger','Permanente.','#EA580C'],['P','Prohibited','Permanente.','#991B1B'],['TRA','Temporary Reserved Area','Militaire.','#B91C1C'],['TSA','Temporary Segregated Area','Ségrégation civ/mil.','#B91C1C']];
    return `
      <h3 class="text-sm font-semibold mb-2">Classes d'espaces aériens (OACI)</h3>
      <p class="text-xs text-muted mb-3"><strong>VFR autogire vole en classe G</strong> sous 2500 ft AGL.</p>
      <div style="overflow-x:auto;margin-bottom:16px;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--muted);"><th style="padding:6px 8px;">Classe</th><th style="padding:6px 8px;text-align:left;">Type</th><th style="padding:6px 8px;text-align:left;">Description</th></tr></thead><tbody>${classes.map(([c,n,d])=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;text-align:center;font-weight:600;font-family:ui-monospace,monospace;font-size:13px;">${c}</td><td style="padding:6px 8px;font-size:12px;font-weight:500;">${escapeHtml(n)}</td><td style="padding:6px 8px;font-size:12px;">${escapeHtml(d)}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="text-sm font-semibold mb-2">Types de zones aériennes</h3>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--muted);"><th style="padding:6px 8px;text-align:left;">Type</th><th style="padding:6px 8px;text-align:left;">Nom</th><th style="padding:6px 8px;text-align:left;">Description</th></tr></thead><tbody>${zones.map(([c,n,d,col])=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px 8px;"><span style="display:inline-block;background:${col};color:white;font-weight:600;font-size:10px;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;">${c}</span></td><td style="padding:6px 8px;font-size:12px;font-style:italic;font-weight:500;">${escapeHtml(n)}</td><td style="padding:6px 8px;font-size:12px;">${escapeHtml(d)}</td></tr>`).join('')}</tbody></table></div>
    `;
  }
  function buildAzbaInfoHtml() {
    return `
      <h3 class="text-sm font-semibold mb-2">⚔️ AZBA / RTBA</h3>
      <p class="text-xs text-muted">Le réseau <strong>RTBA</strong> est utilisé par l'armée pour les entraînements à basse altitude. Quand actif (<strong>AZBA</strong>), il est <strong>interdit aux VFR</strong>.</p>
      <div class="warn-box mt-3 text-xs"><strong>⚠️ Pas d'API publique gratuite</strong> en 2026 pour l'AZBA temps réel.</div>
      <h4 class="text-xs font-semibold uppercase tracking-wide mt-4 mb-2">Sources officielles</h4>
      <div class="space-y-2">
        <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100"><div class="font-medium text-sm">🇫🇷 SIA — Page AZBA officielle</div></a>
        <a href="https://supaip.fr/" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100"><div class="font-medium text-sm">🗺️ SUP AIP France</div></a>
        <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100"><div class="font-medium text-sm">🇫🇷 Aeroweb — Météo France aviation</div></a>
      </div>
    `;
  }
  function buildSourcesContentHtml() {
    const cat = (t) => `<h4 class="text-xs font-semibold uppercase tracking-wide mt-4 mb-2" style="color:var(--muted-foreground);">${t}</h4>`;
    return `
      <p class="text-xs text-muted mb-3">L'app agrège plusieurs sources officielles et open data, regroupées par catégorie.</p>

      ${cat('🛬 Aérodromes & terrains')}
      <div class="space-y-2 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">✈️ Aérodromes officiels (447)</h3><p class="text-xs">Source : <strong>DGAC</strong> via PIAF.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (764)</h3><p class="text-xs">Source : <strong>BASULM</strong> — FFPLUM.</p></div>
      </div>

      ${cat('🗺️ Cartes & espaces aériens')}
      <div class="space-y-2 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP / NOTAM</h3><p class="text-xs">Source : <strong>SIA</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3><p class="text-xs">Source : <strong>OpenAIP</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🗺️ Carte VFR CartaBossy</h3><p class="text-xs">Carte aéronautique VFR France. <a href="https://www.cartabossy.com/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">cartabossy.com</a></p></div>
      </div>

      ${cat('🌤️ Météo')}
      <div class="space-y-2 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3><p class="text-xs">METAR/TAF : <strong>aviationweather.gov</strong>. Vent : <strong>open-meteo.com</strong>. Visuel : <strong>metar-taf.com</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛰️ Imagerie satellite</h3><p class="text-xs">Source : <strong>NASA EOSDIS GIBS</strong> (MODIS, gratuit). Imagerie quotidienne.</p></div>
      </div>

      ${cat('📚 Documentation')}
      <div class="space-y-2 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📖 Sigles aéronautiques (670)</h3><p class="text-xs">Source : <strong>SOFIA</strong> — DGAC.</p></div>
      </div>

      <div class="text-xs text-muted text-center pt-4 mt-2 border-t border-thin">AutogyroDash v0.8.25</div>
    `;
  }
  function setupResourcesNav() {
    const section = document.getElementById('tab-resources');
    if (!section) return;
    const setActive = (sub) => {
      section.querySelectorAll('.res-subtab').forEach(b => {
        const active = b.dataset.sub === sub;
        // v0.8.19 — pilules Aero : accent (foncé si actif), texte accent-ink (flip jour/nuit auto)
        b.style.setProperty('background', active ? 'var(--accent-2)' : 'var(--accent)', 'important');
        b.style.setProperty('color', 'var(--accent-ink)', 'important');
        b.style.fontWeight = active ? '700' : '400';
        b.style.borderBottomColor = 'transparent';
      });
      section.querySelectorAll('.res-subpage').forEach(p => p.classList.toggle('hidden', p.dataset.sub !== sub));
      if (sub === 'lexicon') setTimeout(setupSiglesSearch, 50);
    };
    section.querySelectorAll('.res-subtab').forEach(b => b.addEventListener('click', () => setActive(b.dataset.sub)));
    setActive('lexicon');
  }
  replaceSourcesWithResources();

  // ============================================================
  // HOOK CLICK TABS (inchangé v0.6.4)
  // ============================================================
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', function() {
      const tab = this.dataset.tab;
      if (!tab) return;
      setTimeout(() => {
        hideAllTabs();
        document.getElementById('tab-' + tab)?.classList.remove('hidden');
        closeMobileMenu();
      }, 30);
    });
  });
  const tabObserver = new MutationObserver(() => {
    document.querySelectorAll('.tab-btn:not([data-extensions-hooked])').forEach(b => {
      b.dataset.extensionsHooked = '1';
      b.addEventListener('click', function() {
        const tab = this.dataset.tab;
        if (!tab) return;
        setTimeout(() => { hideAllTabs(); document.getElementById('tab-' + tab)?.classList.remove('hidden'); closeMobileMenu(); }, 30);
      });
    });
  });
  tabObserver.observe(document.body, { childList: true, subtree: true });

  // ============================================================
  // HISTORIQUE VOLS (inchangé v0.6.4)
  // ============================================================
  const HISTORY_KEY = 'autogyrodash_history_v1';
  function loadHistory() { try { const raw = localStorage.getItem(HISTORY_KEY); if (!raw) return []; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch(e) { return []; } }
  function saveHistory(items) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30))); } catch(e) {} }
  function pinCurrentFlight() {
    const trip = computeTrip();
    if (!trip || !trip.points || trip.points.length < 2) { if (typeof showToast === 'function') showToast('Aucun trajet à épingler', 'warn', 3000); return false; }
    const item = { id: Date.now(), pinnedAt: new Date().toISOString(), label: trip.points.map(p => p.icao).join(' → ') + (STATE.loop ? ' → boucle' : ''), points: trip.points.map(p => ({ icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, isBasulm: !!p.isBasulm, basulm: p.isBasulm ? p.basulm : undefined, metarStation: p.metarStation })), loop: !!STATE.loop, totalKm: trip.totalDist || 0, acftNickname: STATE.acft?.nickname || null };
    const history = loadHistory();
    const idx = history.findIndex(h => h.label === item.label && h.loop === item.loop);
    if (idx >= 0) history[idx] = { ...history[idx], pinnedAt: item.pinnedAt };
    else history.unshift(item);
    saveHistory(history);
    if (typeof showToast === 'function') showToast(`✓ Vol épinglé`, 'ok', 3000);
    renderHistoryList();
    return true;
  }
  function restoreFlight(item) {
    if (!item || !item.points || item.points.length < 2) return;
    document.getElementById('clear-trip')?.click();
    setTimeout(() => {
      // v0.6.34 — FIX restauration : computeTrip() rajoute le point de départ
      // en fin de liste quand c'est une boucle. On retire ce doublon avant le
      // mapping, sinon le vrai dernier AD tombe en "étape" et l'arrivée reste vide.
      // Mapping correct : 1er point = départ (slot 0), dernier = arrivée (slot 4),
      // intermédiaires = étapes (slots 1..3).
      let pts = item.points.slice();
      if (item.loop && pts.length >= 3 && pts[pts.length - 1].icao === pts[0].icao) {
        pts = pts.slice(0, -1);
      }
      const max = Math.min(pts.length, 5);
      for (let i = 0; i < max; i++) {
        const p = pts[i];
        let ad;
        if (p.isBasulm) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, isBasulm: true, basulm: p.basulm, metarStation: null };
        else { ad = AERODROMES_ALL.find(a => a.icao === p.icao); if (!ad) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, metarStation: p.metarStation }; }
        let slotIdx;
        if (i === 0) slotIdx = 0;
        else if (i === max - 1) slotIdx = 4;
        else slotIdx = i;
        if (slotIdx >= 2 && slotIdx <= 3) {
          const slotEl = document.querySelector(`[data-trip-slot="${slotIdx}"]`);
          if (slotEl) slotEl.classList.remove('hidden');
          if (slotIdx > STATE.visibleStops) STATE.visibleStops = slotIdx;
        }
        if (STATE.visibleStops >= 3) document.getElementById('add-step-btn')?.classList.add('hidden');
        const input = document.getElementById(`ad-input-${slotIdx}`);
        if (input) input.value = `${ad.icao} · ${ad.name}`;
        STATE.trip[slotIdx] = ad;
      }
      if (item.loop) { STATE.loop = true; const cb = document.getElementById('loop-checkbox'); if (cb) cb.checked = true; }
      if (typeof onTripChange === 'function') onTripChange();
      document.querySelector('.tab-btn[data-tab="plan"]')?.click();
    }, 200);
  }
  function deleteHistoryItem(id) { saveHistory(loadHistory().filter(h => h.id !== id)); renderHistoryList(); }
  function renderHistoryList() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    const history = loadHistory();
    if (history.length === 0) { listEl.innerHTML = `<div class="text-center text-sm text-muted p-6"><div style="font-size:32px;margin-bottom:8px;">📭</div><div>Aucun vol épinglé.</div></div>`; return; }
    listEl.innerHTML = history.map(h => { const d = new Date(h.pinnedAt); const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); const dist = h.totalKm ? Math.round(h.totalKm) + ' km' : ''; return `<div class="card p-3" style="margin-bottom:8px;"><div class="flex items-start justify-between gap-2 flex-wrap"><div style="flex:1;min-width:200px;"><div class="font-medium text-sm" style="font-family:ui-monospace,monospace;">${escapeHtml(h.label)}</div><div class="text-xs text-muted mt-1">${escapeHtml(dateStr)}${dist?' · '+dist:''}</div></div><div class="flex gap-1"><button class="h-restore px-3 py-1.5 rounded bg-black text-white" data-id="${h.id}" style="font-size:12px;">↻ Restaurer</button><button class="h-delete px-2 py-1.5 rounded border" data-id="${h.id}" style="border-color:#FCA5A5;color:#991B1B;font-size:12px;background:white;">🗑️</button></div></div></div>`; }).join('');
    listEl.querySelectorAll('.h-restore').forEach(b => b.addEventListener('click', () => { const item = loadHistory().find(h => h.id === parseInt(b.dataset.id)); if (item) restoreFlight(item); }));
    listEl.querySelectorAll('.h-delete').forEach(b => b.addEventListener('click', () => { if (confirm('Supprimer ?')) deleteHistoryItem(parseInt(b.dataset.id)); }));
  }
  function addHistoryTab() {
    const resourcesTab = document.querySelector('.tab-btn[data-tab="resources"]');
    if (!resourcesTab || document.querySelector('.tab-btn[data-tab="history"]')) return;
    const tab = document.createElement('span');
    tab.className = 'tab-btn'; tab.dataset.tab = 'history'; tab.textContent = 'historique';
    resourcesTab.parentNode.insertBefore(tab, resourcesTab);
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'tab-history'; section.className = 'hidden';
    section.innerHTML = `<div class="card p-4 space-y-3"><div class="flex items-center justify-between flex-wrap gap-2"><h2 class="section-title text-sm">historique des vols</h2><button id="history-clear-all" class="text-xs px-3 py-1.5 rounded border" style="border-color:#FCA5A5;color:#991B1B;background:white;">Vider</button></div><p class="text-xs text-muted">Vols épinglés.</p><div id="history-list"></div></div>`;
    main.appendChild(section);
    tab.addEventListener('click', () => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); tab.classList.add('active'); hideAllTabs(); section.classList.remove('hidden'); closeMobileMenu(); renderHistoryList(); });
    document.getElementById('history-clear-all')?.addEventListener('click', () => { if (confirm('Effacer TOUT ?')) { saveHistory([]); renderHistoryList(); } });
  }
  addHistoryTab();

  // ============================================================
  // BOUTON ÉPINGLER (inchangé v0.6.4)
  // ============================================================
  function addPinButton() {
    const pdfBtn = document.getElementById('pdf-btn');
    if (!pdfBtn || document.getElementById('pin-flight-btn')) return;
    const footer = pdfBtn.parentNode;
    if (!footer) return;
    pdfBtn.style.flex = '1';
    const pinBtn = document.createElement('button');
    pinBtn.id = 'pin-flight-btn'; pinBtn.title = 'Épingler';
    pinBtn.style.cssText = `flex-shrink:0;display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border:1.5px solid var(--border);border-radius:9999px;background:var(--card);color:var(--foreground);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;height:fit-content;align-self:center;`;
    pinBtn.innerHTML = `<span style="font-size:13px;">📌</span><span>épingler</span>`;
    pinBtn.addEventListener('click', () => pinCurrentFlight());
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:10px;align-items:center;';
    footer.insertBefore(wrapper, pdfBtn);
    wrapper.appendChild(pdfBtn);
    wrapper.appendChild(pinBtn);
  }
  addPinButton();

  // ============================================================
  // B2b-6 (v0.8.18) — MASQUER la barre du bas (PDF + epingler) tant qu'aucun trajet
  // n'est charge (epure la page avant saisie). Signal = classe .hidden sur #trip-summary
  // (posee/retiree par refreshTripSummary selon computeTrip()). On N'UTILISE PAS pdfBtn.disabled
  // (aussi togglé pendant la generation PDF -> ferait clignoter/disparaitre la barre en plein usage).
  // ============================================================
  function v0618ToggleFooterByTrip() {
    const pdfBtn = document.getElementById('pdf-btn');
    const summary = document.getElementById('trip-summary');
    if (!pdfBtn || !summary) return;
    const footer = pdfBtn.closest('footer');
    if (!footer) return;
    const apply = () => {
      const hasTrip = !summary.classList.contains('hidden');
      footer.style.display = hasTrip ? '' : 'none';
    };
    apply();
    try {
      new MutationObserver(apply).observe(summary, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* noop */ }
  }
  v0618ToggleFooterByTrip();
  setTimeout(v0618ToggleFooterByTrip, 600);
  setTimeout(v0618ToggleFooterByTrip, 1800);

  // ============================================================
  // 🔥 FIX #4 v0.6.5 — SATELLITE TOGGLE À GAUCHE (renforcé)
  // ============================================================
  function setupSatelliteToggleV065() {
    let attempts = 0;
    function tryInit() {
      attempts++;
      if (attempts > 60) { console.warn('[Satellite v0.6.5] Boutons introuvables après 60 tentatives'); return; }

      const allBtns = Array.from(document.querySelectorAll('button, .tab-btn, [role="tab"], .mode-btn'));
      // Mode buttons : ceux qui sont temp/vent/nuages (mais PAS satellite)
      const modeBtns = allBtns.filter(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return /\b(température|temperature|temp\b|nuages?|cloud|vent|wind)\b/i.test(txt)
            && !/satellite/i.test(txt)
            && txt.length < 30;
      });
      const satelliteBtn = document.getElementById('wf-satellite-toggle')
        || allBtns.find(b => /satellite/i.test((b.textContent || '').trim()) && (b.textContent || '').length < 25);

      if (!satelliteBtn || modeBtns.length < 2) {
        setTimeout(tryInit, 200);
        return;
      }
      if (satelliteBtn.dataset.satToggled === '1') return;
      satelliteBtn.dataset.satToggled = '1';

      // Trouver la ligne d'affichage (parent commun des mode-btns)
      let affichageLine = modeBtns[0].parentNode;
      if (affichageLine) affichageLine.classList.add('wf-mode-line');

      // Chercher le label "affichage"
      const affichageLabel = affichageLine
        ? Array.from(affichageLine.children).find(el => {
            const txt = (el.textContent || '').trim().toLowerCase();
            return txt === 'affichage :' || txt === 'affichage' || txt === 'mode :' || txt === 'mode';
          })
        : null;

      // Cacher le bouton satellite natif (on le pilote programmatiquement)
      satelliteBtn.style.display = 'none';

      // Supprimer un éventuel ancien toggle pour idempotence
      const oldToggle = document.getElementById('sat-toggle-pill');
      if (oldToggle) oldToggle.remove();

      // Créer le nouveau toggle pill
      const toggle = document.createElement('button');
      toggle.id = 'sat-toggle-pill';
      toggle.type = 'button';
      toggle.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border: 1.5px solid var(--border);
        border-radius: 9999px;
        background: var(--card);
        color: var(--foreground);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s;
        margin-right: 8px;
      `;
      toggle.innerHTML = `<span style="font-size:13px;">🛰️</span><span>satellite</span><span id="sat-state-badge" style="margin-left:4px;padding:1px 6px;border-radius:9999px;background:#374151;color:#9CA3AF;font-size:9px;font-weight:700;letter-spacing:0.05em;">OFF</span>`;

      // INSÉRER EN TÊTE de la ligne d'affichage (avant le label "affichage")
      let inserted = false;
      if (affichageLine && affichageLine.firstChild) {
        affichageLine.insertBefore(toggle, affichageLine.firstChild);
        inserted = true;
      } else if (affichageLabel && affichageLabel.parentNode) {
        affichageLabel.parentNode.insertBefore(toggle, affichageLabel);
        inserted = true;
      } else if (modeBtns[0] && modeBtns[0].parentNode) {
        modeBtns[0].parentNode.insertBefore(toggle, modeBtns[0]);
        inserted = true;
      }
      if (!inserted) return;

      console.log('[Satellite v0.6.34] Toggle inséré en première position ✓');

      let satOn = false;
      // 🔥 v0.6.34 : tracker explicitement l'état du satellite natif
      // pour pouvoir le synchroniser dans les 2 sens (activation + désactivation).
      // Bug v0.6.7 : on cliquait sur satelliteBtn pour activer mais JAMAIS
      // pour désactiver → l'iframe Windy restait collée à l'écran.
      let nativeSatActive = false;

      function clickSatelliteNative() {
        if (satelliteBtn._programmatic) return;
        satelliteBtn._programmatic = true;
        const origDisplay = satelliteBtn.style.display;
        satelliteBtn.style.display = '';
        satelliteBtn.click();
        satelliteBtn.style.display = origDisplay || 'none';
        setTimeout(() => { satelliteBtn._programmatic = false; }, 60);
        nativeSatActive = !nativeSatActive;
      }

      function applyState() {
        const badge = document.getElementById('sat-state-badge');
        if (satOn) {
          // Cacher mode buttons + label "affichage"
          modeBtns.forEach(b => {
            if (!b.dataset.origDisplay) b.dataset.origDisplay = b.style.display || '';
            b.style.display = 'none';
          });
          if (affichageLabel && !affichageLabel.dataset.origDisplay) {
            affichageLabel.dataset.origDisplay = affichageLabel.style.display || '';
          }
          if (affichageLabel) affichageLabel.style.display = 'none';

          // Synchroniser le satellite natif : activer s'il ne l'est pas déjà
          if (!nativeSatActive) clickSatelliteNative();

          toggle.style.background = '#15803D';
          toggle.style.borderColor = '#15803D';
          toggle.style.color = 'white';
          if (badge) { badge.textContent = 'ON'; badge.style.background = 'white'; badge.style.color = '#15803D'; }
        } else {
          // Réafficher mode buttons + label
          modeBtns.forEach(b => { b.style.display = b.dataset.origDisplay || ''; });
          if (affichageLabel) affichageLabel.style.display = affichageLabel.dataset.origDisplay || '';

          // 🔥 v0.6.34 : DÉSACTIVER explicitement le satellite natif
          if (nativeSatActive) clickSatelliteNative();

          // Reset mode au "temp" par défaut
          if (modeBtns[0] && !modeBtns[0]._programmatic) {
            modeBtns[0]._programmatic = true;
            modeBtns[0].click();
            setTimeout(() => { modeBtns[0]._programmatic = false; }, 60);
          }
          toggle.style.background = 'var(--card)';
          toggle.style.borderColor = 'var(--border)';
          toggle.style.color = 'var(--foreground)';
          if (badge) { badge.textContent = 'OFF'; badge.style.background = '#374151'; badge.style.color = '#9CA3AF'; }
        }
      }
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        satOn = !satOn;
        applyState();
      });
      modeBtns.forEach(b => {
        b.addEventListener('click', () => {
          if (b._programmatic) return;
          if (satOn) { satOn = false; applyState(); }
        });
      });
      applyState();
    }
    setTimeout(tryInit, 500);
  }
  setupSatelliteToggleV065();

  // ============================================================
  // 🔥 FIX #1 v0.6.5 — FICHE ACFT en grille équilibrée
  //   - retire sm:col-span-2 du transpondeur
  //   - ajoute "indicatif radio" à côté du transpondeur
  // ============================================================
  const ACFT_EXTRA_KEY = 'autogyrodash_acft_extras_v1';
  function loadAcftExtras() { try { return JSON.parse(localStorage.getItem(ACFT_EXTRA_KEY) || '{}'); } catch(e) { return {}; } }
  function saveAcftExtras(data) { try { localStorage.setItem(ACFT_EXTRA_KEY, JSON.stringify(data)); } catch(e) {} }
  function getCurrentAcftSlotId() {
    try {
      if (STATE.acft && STATE.acft.id !== undefined) return String(STATE.acft.id);
      if (STATE.currentAcftSlot !== undefined) return String(STATE.currentAcftSlot);
      if (typeof getActiveAcftIndex === 'function') return String(getActiveAcftIndex());
    } catch(e) {}
    return 'default';
  }

  function setupAcftLayoutV065() {
    const acftTab = document.getElementById('tab-acft');
    if (!acftTab) return;

    // 1. Nettoyer un ancien bloc v0.6.x (callsign à côté de l'immat)
    const oldCompact = acftTab.querySelector('.acft-callsign-compact');
    if (oldCompact) oldCompact.remove();

    // 2. Trouver le transpondeur
    const transpInput = acftTab.querySelector('#acft-transpondeur');
    if (!transpInput) return;
    const transpDiv = transpInput.closest('div.sm\\:col-span-2, div');
    if (!transpDiv) return;

    // 3. Retirer le col-span-2 (pour que la grille 2-cols s'applique)
    transpDiv.classList.remove('sm:col-span-2');

    // 4. Si l'indicatif radio existe déjà, ne pas re-créer
    if (acftTab.querySelector('#acft-callsign')) return;

    // 5. Créer le bloc indicatif radio à côté du transpondeur
    const callsignDiv = document.createElement('div');
    callsignDiv.innerHTML = `
      <label class="text-xs text-muted">indicatif radio (call sign à l'antenne)</label>
      <input type="text" id="acft-callsign" class="ad-input mt-1" placeholder="Ex: Foxtrot-Juliet-Alpha-Bravo-Charlie" maxlength="60" />
      <p class="text-xs text-muted mt-1" style="font-size:10px;">Prononcé en arrivant sur fréquence. Sauvegardé pour la fiche active.</p>
    `;
    // Insérer juste après le transpondeur dans la grille
    transpDiv.parentNode.insertBefore(callsignDiv, transpDiv.nextSibling);

    // 6. Charger l'éventuelle valeur sauvegardée
    const slotId = getCurrentAcftSlotId();
    const extras = loadAcftExtras();
    const slotData = extras[slotId] || {};
    const callInput = document.getElementById('acft-callsign');
    if (callInput && slotData.callsign) callInput.value = slotData.callsign;

    // 7. Persistance auto
    let debounce;
    function persist() {
      const cur = loadAcftExtras();
      const sid = getCurrentAcftSlotId();
      const immatField = acftTab.querySelector('#acft-immat');
      const immat = (immatField?.value || '').toUpperCase().trim();
      const callsign = (callInput?.value || '').trim();
      cur[sid] = { immat, callsign };
      saveAcftExtras(cur);
    }
    callInput?.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(persist, 400); });
    const immatField = acftTab.querySelector('#acft-immat');
    immatField?.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(persist, 400); });
  }
  setupAcftLayoutV065();
  setInterval(setupAcftLayoutV065, 2500);

  // Exposer pour le PDF (compat ancien hook)
  window.__getAcftExtras = function() {
    const slotId = getCurrentAcftSlotId();
    const all = loadAcftExtras();
    return all[slotId] || { immat: '', callsign: '' };
  };

  // ============================================================
  // 🔥 FIX #3 v0.6.5 — RÉORGANISATION DU BRIEF SELON CROQUIS
  // Layout cible (de haut en bas) :
  //   1. Trajet pleine largeur
  //   2. [Météo générale | Météo Visuelle]
  //   3. [AZBA/RTBA | NOTAM]
  //   4. Carte aérodromes (overlays + carte) pleine largeur
  //   5. [Zones aériennes traversées | Notes Pilote]
  // ============================================================
  function injectBriefBlocksV065() {
    // B1 (v0.8.0) — DÉSACTIVÉ : les blocs AZBA/NOTAM/metar-taf sont désormais
    // statiques dans index.html (grille 12 colonnes). Le wiring des boutons est
    // repris par wireBriefButtonsV08(). Cette fonction reste définie mais ne fait
    // plus rien (le code ci-dessous est mort, conservé pour historique).
    return;
    const planTab = document.getElementById('tab-plan');
    if (!planTab) return;
    if (document.getElementById('vfr-checks-wrapper-v065')) return;

    // Wrapper principal qui contiendra les rangées
    const wrapper = document.createElement('div');
    wrapper.id = 'vfr-checks-wrapper-v065';
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    wrapper.innerHTML = `
      <!-- Rangée Météo native | Windy -->
      <div id="wf-row-weather" class="vfr-row-2cols">
        <div id="weather-native-anchor" style="display:contents;"></div>
        <div class="card vfr-block-temsi collapsible-block" data-collapse-key="metartaf" style="padding:14px 16px;border-left:4px solid #0891B2;">
          <div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#0891B2;">🛰</span><span>Météo visuelle (metar-taf.com)</span></h2>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="collapse-chevron unified-chevron" type="button" title="plier / déplier">▼</button>
            </div>
          </div>
          <div class="collapsible-content">
            <p class="text-xs text-muted" style="margin:0 0 10px;">Carte mondiale METAR/TAF interactive : vent, plafonds, composantes de vent traversier par piste. Clique sur un terrain pour le détail.</p>
            <button id="metartaf-open-btn" type="button" style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#0891B2;color:#fff;border:none;padding:11px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">
              <span>🗺️</span><span>ouvrir metar-taf.com</span>
            </button>
            <p class="text-xs text-muted italic" style="margin-top:8px;">Fenêtre dédiée (popup centré sur Mac / nouvel onglet sur iPhone). Gratuit, sans embed payant. TEMSI officielle → Aeroweb.</p>
            <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:4px;font-size:11px;color:#0891B2;text-decoration:underline;">→ TEMSI officielle Aeroweb</a>
          </div>
        </div>
      </div>

      <!-- Rangée AZBA | NOTAM -->
      <div id="wf-row-azba-notam" class="vfr-row-2cols">
        <div class="card vfr-block-azba collapsible-block" data-collapse-key="azba" style="padding:14px 16px;border-left:4px solid #DC2626;">
          <div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#DC2626;">⚔️</span><span>AZBA / RTBA</span></h2>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;background:#DC2626;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
              <button class="collapse-chevron unified-chevron" type="button" title="plier / déplier">▼</button>
            </div>
          </div>
          <div class="collapsible-content">
            <div style="background:var(--muted);border-radius:6px;padding:14px;text-align:center;margin-bottom:10px;border:1px dashed var(--border);">
              <div style="font-size:34px;line-height:1;margin-bottom:6px;">🗺️</div>
              <div style="font-size:12px;font-weight:600;margin-bottom:3px;">Carte AZBA temps réel</div>
              <div style="font-size:11px;color:var(--muted-foreground);line-height:1.4;">Le SIA bloque l'iframe. Bouton ci-dessous = fenêtre dédiée.</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:6px;">
              <button class="open-azba-sia" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#DC2626;border:none;border-radius:6px;color:white;cursor:pointer;font-size:13px;font-weight:500;">
                <span style="font-size:16px;">🇫🇷</span><span style="flex:1;text-align:left;"><strong>AZBA officielle SIA</strong></span><span>→</span>
              </button>
              <button class="open-supaip" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--foreground);cursor:pointer;font-size:13px;">
                <span style="font-size:16px;">🗺️</span><span style="flex:1;text-align:left;"><strong>SUP AIP France</strong></span><span style="color:var(--muted-foreground);">→</span>
              </button>
            </div>
          </div>
        </div>

        <div class="card vfr-block-notam collapsible-block" data-collapse-key="notam" style="padding:14px 16px;border-left:4px solid #2563EB;">
          <div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#2563EB;">📋</span><span>NOTAM</span></h2>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;background:#2563EB;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
              <button class="collapse-chevron unified-chevron" type="button" title="plier / déplier">▼</button>
            </div>
          </div>
          <div class="collapsible-content">
            <div style="background:var(--muted);border-radius:6px;padding:14px;text-align:center;margin-bottom:10px;border:1px dashed var(--border);">
              <div style="font-size:34px;line-height:1;margin-bottom:6px;">📋</div>
              <div style="font-size:12px;font-weight:600;margin-bottom:3px;">Visualisateur AIP / NOTAM</div>
              <div style="font-size:11px;color:var(--muted-foreground);line-height:1.4;">Carte officielle SIA, fenêtre dédiée.</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:6px;">
              <button class="open-vaip" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#2563EB;border:none;border-radius:6px;color:white;cursor:pointer;font-size:13px;font-weight:500;">
                <span style="font-size:16px;">🇫🇷</span><span style="flex:1;text-align:left;"><strong>Visualisateur AIP/NOTAM SIA</strong></span><span>→</span>
              </button>
              <button class="open-aeroweb" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--foreground);cursor:pointer;font-size:13px;">
                <span style="font-size:16px;">📡</span><span style="flex:1;text-align:left;"><strong>Aeroweb — NOTAM + TEMSI</strong></span><span style="color:var(--muted-foreground);">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Stratégie d'insertion : on insère le wrapper APRÈS le bloc trajet
    // Le bloc trajet est le premier <details> ou .card avec input ad-input-0
    const tripBlock = planTab.querySelector('details') || planTab.querySelector('.card');
    if (tripBlock && tripBlock.parentNode) {
      tripBlock.parentNode.insertBefore(wrapper, tripBlock.nextSibling);
    } else {
      planTab.insertBefore(wrapper, planTab.firstChild);
    }

    // Relocaliser la météo native dans le slot dédié
    function relocateNativeWeather() {
      const allDetails = planTab.querySelectorAll('details, .card');
      let nativeWeather = null;
      allDetails.forEach(c => {
        if (c === wrapper) return;
        if (c.contains(wrapper)) return;
        if (c.querySelector('#weather-france-map') !== null) {
          nativeWeather = c;
        }
      });
      if (nativeWeather) {
        const anchor = document.getElementById('weather-native-anchor');
        if (anchor && nativeWeather.parentNode !== anchor) {
          anchor.appendChild(nativeWeather);
          nativeWeather.style.gridColumn = 'auto';
        }
      }
    }
    relocateNativeWeather();
    setInterval(relocateNativeWeather, 2000);

    // Bindings boutons popup
    function openCenteredPopup(url, title) {
      const w = Math.min(1280, Math.floor(window.screen.width * 0.95));
      const h = Math.min(900, Math.floor(window.screen.height * 0.9));
      const left = Math.floor((window.screen.width - w) / 2);
      const top = Math.floor((window.screen.height - h) / 2);
      const win = window.open(url, title, `width=${w},height=${h},left=${left},top=${top},toolbar=yes,scrollbars=yes,resizable=yes,location=yes`);
      if (!win) window.open(url, '_blank', 'noopener,noreferrer');
    }
    wrapper.querySelector('.open-azba-sia')?.addEventListener('click', () => openCenteredPopup('https://www.sia.aviation-civile.gouv.fr/schedules', 'AZBA SIA'));
    wrapper.querySelector('.open-supaip')?.addEventListener('click', () => openCenteredPopup('https://supaip.fr/', 'SUP AIP France'));
    wrapper.querySelector('.open-vaip')?.addEventListener('click', () => openCenteredPopup('https://www.sia.aviation-civile.gouv.fr/vaip', 'Visualisateur AIP SIA'));
    wrapper.querySelector('.open-aeroweb')?.addEventListener('click', () => openCenteredPopup('https://aviation.meteo.fr/login.php', 'Aeroweb'));

    // v0.6.34 — bouton metar-taf.com en popup centré (remplace l'iframe Windy
    // payante en embed). URL fournie par Killian, centrée sur LFMO par défaut.
    const metartafBtn = document.getElementById('metartaf-open-btn');
    metartafBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = 'https://metar-taf.com/?c=514675.221704.6&hl=LFMO';
      const w = 1280, h = 900;
      const left = (window.screen.width - w) / 2;
      const top = (window.screen.height - h) / 2;
      const win = window.open(url, 'metar-taf', `width=${w},height=${h},left=${left},top=${top},toolbar=yes,scrollbars=yes,resizable=yes,location=yes`);
      if (!win) window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Binding collapsibles
    wireCollapsibles();

    // FIX #3 suite : réorganiser l'ordre DOM
    reorderBriefDOM();
  }

  // ============================================================
  // FIX #2 v0.6.5 — COLLAPSIBLE GÉNÉRIQUE
  // ============================================================
  const COLLAPSE_PREF_KEY = 'autogyrodash_collapse_v1';
  function loadCollapsePrefs() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_PREF_KEY) || '{}'); }
    catch(e) { return {}; }
  }
  function saveCollapsePref(key, collapsed) {
    const cur = loadCollapsePrefs();
    cur[key] = collapsed;
    try { localStorage.setItem(COLLAPSE_PREF_KEY, JSON.stringify(cur)); } catch(e) {}
  }

  function wireCollapsibles() {
    const blocks = document.querySelectorAll('.collapsible-block:not([data-collapse-wired])');
    blocks.forEach(block => {
      block.dataset.collapseWired = '1';
      const chevron = block.querySelector('.collapse-chevron');
      const content = block.querySelector('.collapsible-content');
      if (!chevron || !content) return;

      const key = block.dataset.collapseKey || 'default';
      const prefs = loadCollapsePrefs();
      // État initial : déplié par défaut (sauf si l'utilisateur a explicitement plié avant)
      let collapsed = prefs[key] === true;

      function apply() {
        if (collapsed) {
          content.style.display = 'none';
          chevron.classList.add('collapsed');
        } else {
          content.style.display = '';
          chevron.classList.remove('collapsed');
        }
      }
      apply();

      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        collapsed = !collapsed;
        saveCollapsePref(key, collapsed);
        apply();
      });
      // Rendre le titre cliquable aussi (sauf sur boutons internes)
      const header = block.querySelector('.collapsible-header h2, .collapsible-header h3');
      if (header) {
        header.style.cursor = 'pointer';
        header.addEventListener('click', (e) => {
          if (e.target.closest('button')) return; // ne pas intercepter les autres boutons
          collapsed = !collapsed;
          saveCollapsePref(key, collapsed);
          apply();
        });
      }
    });
  }

  // ============================================================
  // FIX #3 suite — REORDER DOM tab-plan selon croquis
  //   Ordre attendu :
  //     1. Trajet (premier <details>)
  //     2. wf-row-weather (Météo native | Windy)
  //     3. wf-row-azba-notam (AZBA | NOTAM)
  //     4. #map-controls (overlays carte)
  //     5. #map-container (carte interactive — NON pliable)
  //     6. #airspaces-section + Notes Pilote en row 2 cols
  //     7. #trip-summary (pleine largeur après)
  //     8. #ad-cards (pleine largeur)
  // ============================================================
  function reorderBriefDOM() {
    return; // B1 (v0.8.0) — moteur de réorganisation retiré (structure statique 12 col)
    const planTab = document.getElementById('tab-plan');
    if (!planTab) return;

    const wfRowWeather = document.getElementById('wf-row-weather');
    const wfRowAzbaNotam = document.getElementById('wf-row-azba-notam');
    if (!wfRowWeather || !wfRowAzbaNotam) return;

    // Localiser les blocs
    const allChildren = Array.from(planTab.children);
    let trajetBlock = null;
    let mapControls = document.getElementById('map-controls');
    let mapContainer = document.getElementById('map-container');
    let airspacesSection = document.getElementById('airspaces-section');
    let tripSummary = document.getElementById('trip-summary');
    let adCards = document.getElementById('ad-cards');
    let notesBlock = null;

    // Identifier Trajet : details contenant ad-input-0
    allChildren.forEach(el => {
      if (!trajetBlock && el.querySelector?.('#ad-input-0')) trajetBlock = el;
      // Identifier Notes Pilote : details contenant notes-textarea
      if (!notesBlock && el.querySelector?.('#notes-textarea')) notesBlock = el;
      // Wrapper natif <div class="grid grid-cols-1 lg:grid-cols-2 gap-4"> qui contient les 2 <details>
      // Si oui, on le démantèle pour séparer Trajet et Météo France
      if (el.classList?.contains('grid') && el.querySelectorAll('details').length >= 2) {
        // Ce wrapper contient Trajet + Météo native, on déplace ses enfants au niveau planTab
        Array.from(el.children).forEach(child => {
          planTab.insertBefore(child, el);
        });
        el.remove();
      }
    });

    // Re-localiser après déballage
    if (!trajetBlock) {
      trajetBlock = Array.from(planTab.children).find(el => el.querySelector?.('#ad-input-0'));
    }
    if (!notesBlock) {
      notesBlock = Array.from(planTab.children).find(el => el.querySelector?.('#notes-textarea'));
    }

    // Créer un wrapper pour Zones aériennes | Notes Pilote
    let wfRowZonesNotes = document.getElementById('wf-row-zones-notes');
    if (!wfRowZonesNotes && airspacesSection && notesBlock) {
      wfRowZonesNotes = document.createElement('div');
      wfRowZonesNotes.id = 'wf-row-zones-notes';
      wfRowZonesNotes.className = 'vfr-row-2cols';
      planTab.appendChild(wfRowZonesNotes);
      wfRowZonesNotes.appendChild(airspacesSection);
      wfRowZonesNotes.appendChild(notesBlock);
    }

    // Ordre final souhaité (v0.6.34 — AZBA/NOTAM passe après zones aériennes)
    //   1. Trajet
    //   2. wfRowWeather (Météo générale | Windy)
    //   3. mapControls + mapContainer (fusionnés via mergeMapBlocksIntoOneCard)
    //   4. wfRowZonesNotes (Zones aériennes traversées | Notes pilote)
    //   5. wfRowAzbaNotam (AZBA | NOTAM) — masqué tant que pas de trajet validé
    //   6. tripSummary
    //   7. adCards
    const orderedNodes = [
      trajetBlock,
      wfRowWeather,
      mapControls,
      mapContainer,
      wfRowZonesNotes,
      wfRowAzbaNotam,
      tripSummary,
      adCards
    ].filter(Boolean);

    // Appliquer l'ordre en réinsérant à la suite
    orderedNodes.forEach(node => {
      planTab.appendChild(node);
    });

    // 🔥 v0.6.34 : masquer wf-row-azba-notam tant que pas de trajet validé
    // (similaire au comportement natif de #airspaces-section et #trip-summary)
    if (wfRowAzbaNotam) {
      const trip = (typeof computeTrip === 'function') ? computeTrip() : null;
      const hasValidTrip = trip && trip.points && trip.points.length >= 2;
      if (!hasValidTrip) {
        wfRowAzbaNotam.classList.add('hidden');
      } else {
        wfRowAzbaNotam.classList.remove('hidden');
      }
    }

    // 🔥 v0.6.34 : DÉSACTIVÉ — makeNativeBlockCollapsible cassait l'affichage
    // de #airspaces-section et #trip-summary (wrap natif + content invisible).
    // Remplacé par addAbsoluteChevronToCard() qui pose juste un chevron en
    // position absolute sans toucher au DOM natif.
    // makeNativeBlockCollapsible(airspacesSection, 'zones-aer', 'zones aériennes traversées');
    // makeNativeBlockCollapsible(tripSummary, 'resume-trajet', 'résumé du trajet');
    // Note : on NE plie PAS #map-container (Leaflet casserait)

    // 🔥 FIX #A v0.6.34 : Fusion overlays-carte + map-container en "Carte des aérodromes"
    mergeMapBlocksIntoOneCard();

    // 🔥 FIX #B v0.6.34 : Harmoniser les chevrons des <details> natifs
    harmonizeDetailsChevrons();

    // Réinvalider les cartes Leaflet après reorganisation (display:flex peut perturber)
    setTimeout(() => {
      try { if (typeof map !== 'undefined' && map?.invalidateSize) map.invalidateSize(); } catch(e) {}
      try { if (typeof weatherFranceMap !== 'undefined' && weatherFranceMap?.invalidateSize) weatherFranceMap.invalidateSize(); } catch(e) {}
    }, 200);
  }

  // ============================================================
  // 🔥 FIX #A v0.6.34 — FUSION overlays-carte + map-container
  // En un seul bloc "Carte des aérodromes" avec UN header + UN chevron
  // ============================================================
  function mergeMapBlocksIntoOneCard() {
    return; // B1 (v0.8.0) — fusion overlays+carte désormais faite en statique (index.html)
    const planTab = document.getElementById('tab-plan');
    if (!planTab) return;
    if (document.getElementById('aerodromes-merged-wrapper')) return;

    const mapControls = document.getElementById('map-controls');
    const mapContainer = document.getElementById('map-container');
    if (!mapControls || !mapContainer) return;

    // Position d'insertion : juste avant map-controls
    const insertBefore = mapControls;

    // Créer le wrapper unifié
    const wrapper = document.createElement('div');
    wrapper.id = 'aerodromes-merged-wrapper';
    wrapper.className = 'card';
    wrapper.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:12px;';

    // Header avec titre + chevron
    const header = document.createElement('div');
    header.className = 'aerodromes-merged-header';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;';
    header.innerHTML = `
      <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;">
        <span style="font-size:15px;">🗺️</span>
        <span>Carte des aérodromes</span>
      </h2>
      <button class="aerodromes-merged-chevron unified-chevron" type="button" title="plier / déplier">▼</button>
    `;
    wrapper.appendChild(header);

    // Content wrapper qui contient map-controls et map-container
    const content = document.createElement('div');
    content.className = 'aerodromes-merged-content';
    content.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    wrapper.appendChild(content);

    // Insérer le wrapper dans le DOM
    insertBefore.parentNode.insertBefore(wrapper, insertBefore);

    // Déplacer map-controls et map-container dans content
    // En retirant le visuel .card des deux pour éviter le double encadrement
    mapControls.classList.remove('card');
    mapControls.style.padding = '0';
    mapControls.style.border = 'none';
    mapControls.style.background = 'transparent';
    content.appendChild(mapControls);

    mapContainer.classList.remove('card');
    mapContainer.style.padding = '0';
    mapContainer.style.border = 'none';
    mapContainer.style.background = 'transparent';
    content.appendChild(mapContainer);

    // Wire le chevron
    const chevron = header.querySelector('.aerodromes-merged-chevron');
    const prefs = loadCollapsePrefs();
    let collapsed = prefs['aerodromes-merged'] === true;

    function apply() {
      if (collapsed) {
        content.style.display = 'none';
        chevron.classList.add('collapsed');
      } else {
        content.style.display = 'flex';
        chevron.classList.remove('collapsed');
        // Réinvalider la map au dépliage
        setTimeout(() => {
          try { if (typeof map !== 'undefined' && map?.invalidateSize) map.invalidateSize(); } catch(e) {}
        }, 50);
      }
    }
    apply();

    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      saveCollapsePref('aerodromes-merged', collapsed);
      apply();
    });

    console.log('[v0.6.34] Carte aérodromes fusionnée ✓');
  }

  // ============================================================
  // 🔥 FIX #B v0.6.34 — HARMONISATION DES CHEVRONS NATIFS
  // Remplace les <i lucide chevron-down> et .accordion-icon
  // par un chevron uniforme au même style que les autres
  // ============================================================
  function harmonizeDetailsChevrons() {
    document.querySelectorAll('details:not([data-chevron-harmonized])').forEach(det => {
      const summary = det.querySelector('summary');
      if (!summary) return;

      // 🔥 FIX v0.6.34 : skip les sous-<details> imbriqués pour ne pas
      // doubler avec leurs chevrons natifs (légende BASULM, logistique fiches AD)
      if (det.parentElement?.closest('details')) return;
      if (det.closest('#map-controls, #map-container, #ad-cards, #aerodromes-merged-wrapper #map-controls')) return;
      // Skip si le summary contient déjà un caractère chevron visible (légendes BASULM)
      const summaryText = (summary.textContent || '').trim();
      if (/^[▶▼►◀]/.test(summaryText)) return;

      det.dataset.chevronHarmonized = '1';

      // Cacher tous les chevrons existants
      summary.querySelectorAll('.toggle-chevron, .accordion-icon, [data-lucide="chevron-down"]').forEach(el => {
        el.style.display = 'none';
      });

      // Si chevron unifié déjà présent, skip
      if (summary.querySelector('.unified-chevron')) return;

      // Créer chevron unifié
      const ch = document.createElement('span');
      ch.className = 'unified-chevron details-chevron';
      ch.innerHTML = '▼';
      if (!det.open) ch.classList.add('collapsed');

      // Stratégie d'insertion :
      // Si le summary a un wrapper flex à droite (cas Météo générale), insérer dedans
      // Sinon, append directement au summary
      const rightWrapper = Array.from(summary.children).find(c => {
        const cs = window.getComputedStyle(c);
        return cs.display === 'flex' && c !== summary.firstElementChild;
      });
      if (rightWrapper) {
        rightWrapper.appendChild(ch);
      } else {
        summary.appendChild(ch);
      }

      // Hook toggle event natif de <details>
      det.addEventListener('toggle', () => {
        if (det.open) ch.classList.remove('collapsed');
        else ch.classList.add('collapsed');
      });
    });
  }

  function makeNativeBlockCollapsible(el, key, _label) {
    if (!el) return;

    // 🔥 v0.6.34 : si `el` contient une seule .card enfant direct,
    // opérer sur cette .card au lieu de `el` (cas #trip-summary et #airspaces-section)
    let target = el;
    if (el.children.length === 1 && el.firstElementChild?.classList?.contains('card')) {
      target = el.firstElementChild;
    }

    // 🔥 NETTOYAGE IDEMPOTENT v0.6.34 :
    // Avant toute redécoration, on vire toute trace de décoration précédente
    // pour garantir l'absence de doublons même si la fonction est appelée
    // plusieurs fois sur le même bloc.

    // 1. Retirer tous les .unified-chevron déjà présents dans la card
    target.querySelectorAll('.unified-chevron').forEach(c => c.remove());

    // 2. Si un .native-collapsible-content existe, le déballer
    //    (remettre ses enfants au niveau de target avant de re-wrapper)
    const existingContent = target.querySelector(':scope > .native-collapsible-content');
    if (existingContent) {
      while (existingContent.firstChild) target.appendChild(existingContent.firstChild);
      existingContent.remove();
    }

    // 3. Retirer aussi le styling flex inline qu'on a peut-être posé sur un h2
    //    (cas trip-summary où headerWrapper = h2 lui-même)
    target.querySelectorAll('h2[data-v068-flexified], h3[data-v068-flexified]').forEach(h => {
      // Conserver leur display original
      h.style.display = '';
      h.removeAttribute('data-v068-flexified');
    });

    // Maintenant on (re)décore proprement

    // Trouver l'en-tête : premier h2 / h3 / .text-sm.font-medium
    const header = target.querySelector('h2, h3, .text-sm.font-medium, .section-title');
    if (!header) return;

    // Le headerWrapper est l'élément enfant direct de `target` qui contient le header
    let headerWrapper = header;
    while (headerWrapper.parentNode !== target && headerWrapper.parentNode) {
      headerWrapper = headerWrapper.parentNode;
    }
    if (headerWrapper.parentNode !== target) return; // anomalie, abort

    // Créer le contenu wrapper : tous les enfants directs de `target` SAUF headerWrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'native-collapsible-content';
    const others = Array.from(target.children).filter(c => c !== headerWrapper);
    if (others.length === 0) return; // rien à wrapper, anomalie
    others.forEach(c => contentWrapper.appendChild(c));
    target.appendChild(contentWrapper);

    // Créer chevron unifié
    const chevron = document.createElement('button');
    chevron.className = 'collapse-chevron-native unified-chevron';
    chevron.type = 'button';
    chevron.title = 'plier / déplier';
    chevron.innerHTML = '▼';

    // S'assurer que headerWrapper est un flex container
    const cs = window.getComputedStyle(headerWrapper);
    if (cs.display !== 'flex' && cs.display !== 'grid') {
      headerWrapper.style.display = 'flex';
      headerWrapper.style.alignItems = 'center';
      headerWrapper.style.justifyContent = 'space-between';
      headerWrapper.style.flexWrap = 'wrap';
      headerWrapper.style.gap = '6px';
      headerWrapper.setAttribute('data-v068-flexified', '1');
    }
    headerWrapper.appendChild(chevron);

    el.dataset.nativeCollapse = '1';

    // État initial (persisté)
    const prefs = loadCollapsePrefs();
    let collapsed = prefs[key] === true;

    function apply() {
      if (collapsed) {
        contentWrapper.style.display = 'none';
        chevron.classList.add('collapsed');
      } else {
        contentWrapper.style.display = '';
        chevron.classList.remove('collapsed');
      }
    }
    apply();

    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      saveCollapsePref(key, collapsed);
      apply();
    });
  }

  // B1 (v0.8.0) — moteur de réorganisation retiré : la structure de l'écran plan
  // est désormais statique dans index.html (grille 12 colonnes). On n'attache plus
  // que les boutons AZBA/NOTAM/metar-taf (popups). Idempotent via data-wired-v08.
  function wireBriefButtonsV08() {
    function openCentered(url, title) {
      const w = Math.min(1280, Math.floor(window.screen.width * 0.95));
      const h = Math.min(900, Math.floor(window.screen.height * 0.9));
      const left = Math.floor((window.screen.width - w) / 2);
      const top = Math.floor((window.screen.height - h) / 2);
      const win = window.open(url, title, `width=${w},height=${h},left=${left},top=${top},toolbar=yes,scrollbars=yes,resizable=yes,location=yes`);
      if (!win) window.open(url, '_blank', 'noopener,noreferrer');
    }
    [
      ['.open-azba-sia', 'https://www.sia.aviation-civile.gouv.fr/schedules', 'AZBA SIA'],
      ['.open-supaip', 'https://supaip.fr/', 'SUP AIP France'],
      ['.open-vaip', 'https://www.sia.aviation-civile.gouv.fr/vaip', 'Visualisateur AIP SIA'],
      ['.open-aeroweb', 'https://aviation.meteo.fr/login.php', 'Aeroweb']
    ].forEach(([sel, url, title]) => {
      const btn = document.querySelector(sel);
      if (btn && btn.dataset.wiredV08 !== '1') {
        btn.dataset.wiredV08 = '1';
        btn.addEventListener('click', () => openCentered(url, title));
      }
    });
    const mt = document.getElementById('metartaf-open-btn');
    if (mt && mt.dataset.wiredV08 !== '1') {
      mt.dataset.wiredV08 = '1';
      mt.addEventListener('click', (e) => {
        e.stopPropagation();
        openCentered('https://metar-taf.com/?c=514675.221704.6&hl=LFMO', 'metar-taf');
      });
    }
  }
  wireBriefButtonsV08();
  setInterval(wireBriefButtonsV08, 3000);
  // Filet de sécurité : recaler les cartes Leaflet après la mise en page grille
  setTimeout(() => {
    try { if (typeof map !== 'undefined' && map && map.invalidateSize) map.invalidateSize(); } catch (e) {}
    try { if (typeof weatherFranceMap !== 'undefined' && weatherFranceMap && weatherFranceMap.invalidateSize) weatherFranceMap.invalidateSize(); } catch (e) {}
  }, 500);

  // ============================================================
  // 🔥 FIX #5 v0.6.5 — MÉTÉO FRANCE : zoom auto sur trajet
  // ============================================================
  // FRANCE entière par défaut, fitBounds quand ≥2 AD valides
  function updateWeatherFranceZoom() {
    if (typeof weatherFranceMap === 'undefined' || !weatherFranceMap) return;
    const validPoints = (STATE.trip || []).filter(p => p && p.lat && p.lon);
    if (validPoints.length < 2) {
      // Pas de trajet → vue France entière
      // Ne pas re-setter à chaque fois pour éviter spam, vérifier si déjà
      try {
        const c = weatherFranceMap.getCenter();
        const z = weatherFranceMap.getZoom();
        if (!(Math.abs(c.lat - 46.3) < 0.5 && Math.abs(c.lng - 2.5) < 0.5 && z <= 6)) {
          weatherFranceMap.setView([46.3, 2.5], 6, { animate: false });
        }
      } catch(e) {
        try { weatherFranceMap.setView([46.3, 2.5], 6, { animate: false }); } catch(e2) {}
      }
      return;
    }
    // Zoom sur trajet
    try {
      const latlngs = validPoints.map(p => [p.lat, p.lon]);
      const bounds = L.latLngBounds(latlngs);
      weatherFranceMap.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 9 });
    } catch(e) {
      console.warn('[Météo France zoom] fitBounds échec:', e);
    }
  }

  // 🔥 v0.6.34 : VISIBILITÉ DÉFENSIVE des blocs zones aériennes + AZBA/NOTAM
  // ----------------------------------------------------------------------
  // v0.6.17 ne masquait pas réellement les blocs. Triple protection ici :
  // 1. style.display = 'none' (inline, max priorité)
  // 2. classList.add('hidden')
  // 3. MutationObserver qui réapplique si quelqu'un retire .hidden
  // 4. setInterval qui revérifie toutes les 1.5s (anti-régression)
  // 5. Multi-stratégie de détection des inputs trajet
  // ----------------------------------------------------------------------
  let v0618Applying = false;

  function v0618FindTripInputs() {
    // Stratégie 1: par id^="ad-input" (pattern principal)
    let inputs = Array.from(document.querySelectorAll('input[id^="ad-input"]'));
    if (inputs.length > 0) return inputs;

    // Stratégie 2: depuis la card TRAJET (par titre)
    const titles = Array.from(document.querySelectorAll('.section-title, h2, h3'));
    const trajetTitle = titles.find(t => {
      const txt = (t.textContent || '').trim().toUpperCase();
      return txt.startsWith('TRAJET') || txt === 'TRAJET';
    });
    if (trajetTitle) {
      const trajetCard = trajetTitle.closest('.card, div[class*="rounded"], section');
      if (trajetCard) {
        inputs = Array.from(trajetCard.querySelectorAll('input[type="text"]'))
          .filter(i => !i.disabled && i.offsetParent !== null);
      }
    }
    if (inputs.length > 0) return inputs;

    // Stratégie 3: par placeholder OACI typique
    inputs = Array.from(document.querySelectorAll(
      'input[placeholder*="LFLQ"], input[placeholder*="LFHO"], input[placeholder*="LFLU"], input[placeholder*="LFML"], input[placeholder*="LFMP"], input[placeholder*="Montélimar"]'
    ));
    return inputs;
  }

  function v0618CountFilledTripInputs() {
    const inputs = v0618FindTripInputs();
    let n = 0;
    inputs.forEach(inp => {
      const v = (inp.value || '').trim();
      if (v.length >= 2) n++;
    });
    return { count: n, total: inputs.length };
  }

  function v0618ApplyVisibility() {
    if (v0618Applying) return;
    v0618Applying = true;
    try {
      const { count, total } = v0618CountFilledTripInputs();
      const hasValidTrip = count >= 2;

      const sec = document.getElementById('airspaces-section');
      if (sec) {
        if (hasValidTrip) {
          sec.style.removeProperty('display');
          sec.classList.remove('hidden');
        } else {
          sec.style.setProperty('display', 'none', 'important');
          sec.classList.add('hidden');
        }
      }

      const wfRow = document.getElementById('wf-row-azba-notam');
      if (wfRow) {
        if (hasValidTrip) {
          wfRow.style.removeProperty('display');
          wfRow.classList.remove('hidden');
        } else {
          wfRow.style.setProperty('display', 'none', 'important');
          wfRow.classList.add('hidden');
        }
      }
    } finally {
      setTimeout(() => { v0618Applying = false; }, 50);
    }
  }

  // Compatibilité retro pour l'ancien code qui appelle ces noms
  function updateAirspacesVisibility() { v0618ApplyVisibility(); }
  function updateAzbaNotamVisibility() { v0618ApplyVisibility(); }
  // Anciens helpers v0617 préservés pour compat
  function v0617CountFilledAdInputs() { return v0618CountFilledTripInputs().count; }

  function v0618WireInputListeners() {
    const inputs = v0618FindTripInputs();
    inputs.forEach(inp => {
      if (inp.dataset.v0618Wired === '1') return;
      inp.dataset.v0618Wired = '1';
      ['input', 'change', 'blur', 'keyup'].forEach(evt => {
        inp.addEventListener(evt, v0618ApplyVisibility);
      });
    });
    v0618ApplyVisibility();
  }

  // Boot : retries au cas où le DOM n'est pas prêt
  setTimeout(v0618WireInputListeners, 100);
  setTimeout(v0618WireInputListeners, 500);
  setTimeout(v0618WireInputListeners, 1500);
  setTimeout(v0618WireInputListeners, 3000);
  // Filet de sécurité : revérifie toutes les 1.5s
  setInterval(v0618ApplyVisibility, 1500);
  setInterval(v0618WireInputListeners, 5000);

  // MutationObserver : si quelqu'un retire .hidden ou change le style, on réapplique
  setTimeout(() => {
    const observerTargets = [
      document.getElementById('airspaces-section'),
      document.getElementById('wf-row-azba-notam')
    ].filter(Boolean);
    if (observerTargets.length === 0) return;
    const obs = new MutationObserver(() => {
      if (!v0618Applying) v0618ApplyVisibility();
    });
    observerTargets.forEach(t => {
      obs.observe(t, { attributes: true, attributeFilter: ['class', 'style'] });
    });
  }, 1500);

  // 🔥 v0.6.34 — DIAGNOSTIC console (à invoquer manuellement)
  // Tape dans la console : window.__diagBriefing()
  window.__diagBriefing = function() {
    const { count, total } = v0618CountFilledTripInputs();
    const inputs = v0618FindTripInputs();
    const sec = document.getElementById('airspaces-section');
    const wfRow = document.getElementById('wf-row-azba-notam');
    const report = {
      version: 'v0.8.25',
      inputs: {
        detected: total,
        filled: count,
        list: inputs.map(i => ({ id: i.id, value: i.value, placeholder: i.placeholder }))
      },
      airspacesSection: sec ? {
        hasHiddenClass: sec.classList.contains('hidden'),
        styleDisplay: sec.style.display,
        computedDisplay: getComputedStyle(sec).display
      } : 'NOT_FOUND',
      wfRowAzbaNotam: wfRow ? {
        hasHiddenClass: wfRow.classList.contains('hidden'),
        styleDisplay: wfRow.style.display,
        computedDisplay: getComputedStyle(wfRow).display
      } : 'NOT_FOUND'
    };
    console.log('=== DIAG v0.6.34 ===', report);
    return report;
  };

  // 🔥 v0.6.34 — DIAGNOSTIC SPACING (mesure les vrais gaps visuels)
  // Tape dans la console : window.__diagSpacing()
  window.__diagSpacing = function() {
    const tabPlan = document.getElementById('tab-plan');
    if (!tabPlan) {
      console.log('=== DIAG SPACING ===', 'tab-plan introuvable');
      return;
    }
    const tabCs = getComputedStyle(tabPlan);
    console.log('=== #tab-plan ===', {
      display: tabCs.display,
      flexDirection: tabCs.flexDirection,
      gap: tabCs.gap,
      rowGap: tabCs.rowGap,
      paddingTop: tabCs.paddingTop,
      paddingBottom: tabCs.paddingBottom,
      childrenCount: tabPlan.children.length
    });
    const children = Array.from(tabPlan.children).filter(c => {
      return getComputedStyle(c).display !== 'none';
    });
    console.log(`Enfants VISIBLES : ${children.length}`);
    children.forEach((c, i) => {
      const ccs = getComputedStyle(c);
      const rect = c.getBoundingClientRect();
      const next = children[i + 1];
      const visualGap = next ?
        next.getBoundingClientRect().top - rect.bottom :
        'N/A (dernier)';
      console.log(`[${i}] ${c.id || c.tagName.toLowerCase() + '.' + c.className.slice(0, 30)}:`, {
        offsetHeight: c.offsetHeight,
        paddingTop: ccs.paddingTop,
        paddingBottom: ccs.paddingBottom,
        marginTop: ccs.marginTop,
        marginBottom: ccs.marginBottom,
        gapAuSuivant: typeof visualGap === 'number' ? visualGap + 'px' : visualGap
      });
    });
  };

  // 🔥 v0.6.34 — HIDE EMPTY FLEX CHILDREN
  // ----------------------------------------------------------------
  // DIAG révélé : #tab-plan a des enfants avec offsetHeight 0 mais
  // sans display:none. En flex layout, ils prennent un gap (22px) chacun
  // entre leurs voisins, créant un gap fantôme cumulé.
  //
  // Exemple : si entre [0] TRAJET et [3] wf-row-weather il y a 2 wrappers
  // vides ([1] et [2]), le gap visible est 22 + 0 + 22 + 0 + 22 = 66px
  // au lieu de 22px.
  //
  // Fix : forcer display:none sur les enfants flex VRAIMENT vides
  // (offsetHeight 0 ET pas d'enfants ET pas de texte significatif).
  // ----------------------------------------------------------------
  function v0622HideEmptyFlexChildren() {
    const tabPlan = document.getElementById('tab-plan');
    if (!tabPlan) return;
    Array.from(tabPlan.children).forEach(c => {
      if (c.dataset.v0622AutoHide === '1') {
        // Déjà caché par moi : on vérifie si on doit le ré-afficher
        // (offsetHeight d'un display:none = 0, donc on retire le hide
        //  temporairement pour mesurer)
        c.style.removeProperty('display');
        const stillEmpty = c.offsetHeight === 0 && c.children.length === 0 &&
                           (c.textContent || '').trim() === '';
        if (stillEmpty) {
          c.style.setProperty('display', 'none', 'important');
        } else {
          delete c.dataset.v0622AutoHide;
        }
        return;
      }
      // Skip if classed hidden by other logic
      if (c.classList.contains('hidden')) return;
      const cs = getComputedStyle(c);
      if (cs.display === 'none') return;
      // Vraiment vide ?
      const isReallyEmpty = c.offsetHeight === 0 && c.children.length === 0 &&
                            (c.textContent || '').trim() === '';
      if (isReallyEmpty) {
        c.dataset.v0622AutoHide = '1';
        c.style.setProperty('display', 'none', 'important');
        console.log(`[v0.6.34] Wrapper vide caché (gap fantôme évité) : ${c.id || c.tagName.toLowerCase() + '.' + c.className.slice(0, 30)}`);
      }
    });
  }
  // Boot + periodic
  setTimeout(v0622HideEmptyFlexChildren, 500);
  setTimeout(v0622HideEmptyFlexChildren, 1500);
  setTimeout(v0622HideEmptyFlexChildren, 3000);
  setInterval(v0622HideEmptyFlexChildren, 2500);

  window.__diagChevrons = function() {
    const sec = document.getElementById('airspaces-section');
    if (!sec) return console.log('=== DIAG CHEVRONS ===', 'airspaces-section introuvable');
    const chevRegex = /[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡⮟⮝]/;
    const found = [];
    sec.querySelectorAll('*').forEach(el => {
      if (el.children.length > 0) return;
      const txt = (el.textContent || '').trim();
      if (txt.length === 0 || txt.length > 3) return;
      if (chevRegex.test(txt)) {
        found.push({
          tag: el.tagName.toLowerCase(),
          char: txt,
          classes: el.className || '(no class)',
          id: el.id || '(no id)',
          parent: el.parentElement?.tagName.toLowerCase() + '.' + (el.parentElement?.className || '').slice(0, 30),
          outerHtml: el.outerHTML.slice(0, 150)
        });
      }
    });
    console.log('=== DIAG CHEVRONS dans #airspaces-section ===', found);
    return found;
  };

  // Hook dans onTripChange : on chaîne sans casser les hooks existants
  if (typeof window.__originalOnTripChange === 'undefined') {
    window.__originalOnTripChange = window.onTripChange;
  }
  const _prevOnTripChange = window.onTripChange;
  window.onTripChange = function() {
    if (typeof _prevOnTripChange === 'function') {
      _prevOnTripChange.apply(this, arguments);
    }
    // Petit délai pour laisser Leaflet s'initialiser au premier appel
    setTimeout(updateWeatherFranceZoom, 100);
    // Masquer/afficher AZBA/NOTAM selon le trajet
    setTimeout(updateAzbaNotamVisibility, 50);
    // Masquer/afficher Zones aériennes selon le trajet
    setTimeout(updateAirspacesVisibility, 50);
  };
  // Appel initial différé pour s'assurer que weatherFranceMap est prête
  setTimeout(updateWeatherFranceZoom, 1500);
  setTimeout(updateAzbaNotamVisibility, 1500);
  setTimeout(updateAirspacesVisibility, 1500);
  setTimeout(updateAirspacesVisibility, 3000);

  // ============================================================
  // 🔥 v0.6.34 — FOOTER TEXTE BASCULÉ SOUS BLOC HISTORIQUE
  // ----------------------------------------------------------
  // Le natif a un texte "Aérodromes : DGAC..." + "Données indicatives..."
  // positionné hors des tabs (dans <main> ou <footer> selon scénario).
  // Sur l'onglet historique, il apparait BIZARREMENT au-dessus de la card
  // historique (parce que la card historique est ajoutée dynamiquement à
  // la fin de <main>, et le texte natif vient avant).
  //
  // Solution :
  // 1. Quand l'onglet historique est actif → cacher les natifs
  // 2. Sur les autres onglets → restaurer les natifs (display d'origine)
  // 3. Injecter ma propre version du texte INSIDE #tab-history (à la fin)
  // ============================================================
  function v0618HandleHistoriqueFooter() {
    // 🔥 v0.6.34 — APPROCHE SIMPLE : cacher TOUJOURS et PARTOUT le texte
    // natif "Aérodromes : DGAC / Données indicatives" (hors tabs et hors mon
    // footer custom). Plus de toggle, plus de flash.
    // Et injecte mon footer custom dans #tab-history.

    const tabHistory = document.getElementById('tab-history');

    // 1. Cacher PARTOUT et TOUJOURS le texte natif
    const toHide = new Set();

    document.querySelectorAll('p, div, span, small').forEach(el => {
      if (el.classList.contains('v0618-hist-footer-text')) return;
      if (el.closest('.v0618-hist-footer-text')) return;
      if (el.closest('[id^="tab-"]')) return;
      const txt = (el.textContent || '').trim();
      const isFooter = (txt.startsWith('Aérodromes :') && txt.includes('DGAC')) ||
                       (txt.startsWith('Données indicatives') && txt.includes('pilote'));
      if (isFooter && txt.length < 600) {
        toHide.add(el);
      }
    });

    document.querySelectorAll('footer').forEach(footer => {
      if (footer.closest('[id^="tab-"]')) return;
      const txt = (footer.textContent || '').trim();
      if (txt.includes('Aérodromes :') && txt.includes('DGAC') &&
          txt.includes('Données indicatives') && txt.length < 1000) {
        toHide.add(footer);
      }
    });

    document.querySelectorAll('main > div, body > div, main > section, body > section, main > aside').forEach(el => {
      if (el.id && el.id.startsWith('tab-')) return;
      if (el.classList.contains('v0618-hist-footer-text')) return;
      if (el.children.length > 8) return;
      const txt = (el.textContent || '').trim();
      if (txt.includes('Aérodromes :') && txt.includes('DGAC') &&
          txt.includes('Données indicatives') && txt.length < 600) {
        toHide.add(el);
      }
    });

    // Apply hide (jamais restaure)
    toHide.forEach(el => {
      if (el.dataset.v0625HiddenAlways !== '1') {
        el.dataset.v0625HiddenAlways = '1';
        el.style.setProperty('display', 'none', 'important');
      }
    });

    // 2. Garantir la présence de mon footer inside #tab-history
    if (tabHistory && !tabHistory.querySelector('.v0618-hist-footer-text')) {
      const footerEl = document.createElement('div');
      footerEl.className = 'v0618-hist-footer-text';
      footerEl.style.cssText = 'padding: 24px 16px 16px; color: #4b5563; font-size: 0.78rem; line-height: 1.6; text-align: center;';
      footerEl.innerHTML = '<p>Aérodromes : <strong>DGAC</strong>. Plateformes ULM : <strong>BASULM / FFPLUM</strong>. Météo : aviationweather.gov, open-meteo.com. Espaces aériens : OpenAIP. Voir l\'onglet <a href="javascript:void(0)" class="v0618-link-sources" style="color: #2563eb; text-decoration: underline;">sources</a> pour le détail.</p><p style="margin-top: 6px;">Données indicatives — le pilote reste seul responsable de la vérification SIA / METAR / TAF / NOTAM / AZBA avant chaque vol.</p>';
      tabHistory.appendChild(footerEl);

      const link = footerEl.querySelector('.v0618-link-sources');
      if (link) {
        link.addEventListener('click', e => {
          e.preventDefault();
          const resTab = document.querySelector('[data-tab="resources"]');
          if (resTab) resTab.click();
        });
      }
    }
  }
  // Boot: lancer ASAP pour éviter le flash, puis périodique
  setTimeout(v0618HandleHistoriqueFooter, 50);
  setTimeout(v0618HandleHistoriqueFooter, 200);
  setTimeout(v0618HandleHistoriqueFooter, 800);
  setTimeout(v0618HandleHistoriqueFooter, 2000);
  setInterval(v0618HandleHistoriqueFooter, 1000);

  // 🔥 v0.6.34 — MutationObserver pour cacher INSTANTANÉMENT le texte natif
  // (évite le flash quand on change d'onglet ou que le natif re-render)
  setTimeout(() => {
    const obs = new MutationObserver(() => {
      v0618HandleHistoriqueFooter();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }, 100);

  // ============================================================
  // RENAME OPENAIP OVERLAY (inchangé v0.6.4)
  // ============================================================
  function renameOpenaipOverlay() {
    const all = Array.from(document.querySelectorAll('span, label, div, button, h3, h4'));
    all.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (/overlay\s+a[ée]ro/i.test(txt) && txt.length < 50) {
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && /overlay\s+a[ée]ro/i.test(node.textContent)) {
            node.textContent = node.textContent.replace(/overlay\s+a[ée]ro(\s+OpenAIP)?/i, 'Afficher/masquer zones aéro');
          }
        }
      }
    });
  }
  renameOpenaipOverlay();
  setInterval(renameOpenaipOverlay, 2000);

  // ============================================================
  // NOTAM FICHES AD (v0.7.0 — 13 webcams RETIRÉES : liens morts + aucun backend
  //   pour surveiller leur santé. Décision tracée au Decision Log.)
  // ============================================================
  if (typeof refreshAdCards === 'function') {
    const _prevRefresh = refreshAdCards;
    refreshAdCards = function() { _prevRefresh.apply(this, arguments); setTimeout(addNotamAndWebcamToCards, 100); };
  }
  function addNotamAndWebcamToCards() {
    const trip = computeTrip();
    if (!trip) return;
    const seen = new Set(); const uniquePoints = [];
    trip.points.forEach(p => { if (!seen.has(p.icao)) { uniquePoints.push(p); seen.add(p.icao); } });
    uniquePoints.forEach((ad, i) => {
      const cardEl = document.querySelector(`[data-ad-card="${ad.icao}-${i}"]`);
      if (!cardEl || cardEl.querySelector('.notam-section')) return;
      const section = document.createElement('div');
      section.className = 'notam-section';
      section.style.cssText = 'border-top:1px solid var(--border);padding:12px 16px;font-size:12px;';
      const isBasulm = !!ad.isBasulm;
      let html = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">📡 Vérifications par aérodrome</h4>`;
      if (isBasulm) {
        html += `<div class="info-box mb-2 text-xs">ℹ️ Plateforme BASULM : pas de NOTAM officiel.</div>`;
      } else {
        html += `<div class="space-y-1">
          <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);"><span style="font-size:14px;">📋</span><span style="flex:1;"><strong>NOTAM ${escapeHtml(ad.icao)}</strong> — SIA</span><span style="color:var(--muted-foreground);">→</span></a>
          <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);"><span style="font-size:14px;">📡</span><span style="flex:1;">NOTAM + TEMSI Aeroweb</span><span style="color:var(--muted-foreground);">→</span></a>
        </div>`;
      }
      section.innerHTML = html;
      cardEl.appendChild(section);
    });
  }
  setTimeout(addNotamAndWebcamToCards, 300);

  // ============================================================
  // 🔥 CSS GLOBAL v0.6.5
  // ============================================================
  const v065Css = document.createElement('style');
  v065Css.id = 'extensions-v0_6_5-css';
  v065Css.textContent = `
/* === B1 (v0.8.0) — Dashboard Aero Glass : conteneur large + grille 12 colonnes === */
body > main,
body main {
  max-width: 1440px !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body > header, body header { max-width: 100% !important; }

/* Écran plan en 3 zones : gauche (météo+zones) | centre (trajet+carte) | droite (AZBA/NOTAM+fiches+notes) */
#plan-grid {
  display: grid;
  grid-template-columns: minmax(0, 3.4fr) minmax(0, 5.2fr) minmax(0, 3.4fr);
  gap: 18px;
  align-items: start;
}
#plan-grid > .plan-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
/* Placement explicite : l'ordre DOM est centre→gauche→droite (empilage mobile logique),
   mais à l'écran on affiche gauche | centre | droite. */
.plan-col-left   { grid-column: 1; grid-row: 1; }
.plan-col-center { grid-column: 2; grid-row: 1; }
.plan-col-right  { grid-column: 3; grid-row: 1; }
/* Repli « jour J » (tablette/mobile) : une seule colonne empilée */
@media (max-width: 1024px) {
  #plan-grid { grid-template-columns: 1fr; }
  .plan-col-left, .plan-col-center, .plan-col-right { grid-column: 1; grid-row: auto; }
}

/* B1.1 (v0.8.1) — Fiches AD détaillées en pleine largeur sous la grille (grille responsive 2-3/ligne).
   #ad-cards est wrappé dans #ad-cards-band (enfant direct de #tab-plan ayant toujours 1 enfant)
   pour le soustraire à v0622HideEmptyFlexChildren (qui ne cache que les enfants VRAIMENT vides). */
#ad-cards-band { width: 100%; }
#ad-cards.plan-adcards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 18px;
  align-items: start;
  margin-top: 18px;
}
#ad-cards.plan-adcards-grid:empty { margin-top: 0; }
@media (max-width: 1024px) {
  #ad-cards.plan-adcards-grid { grid-template-columns: 1fr; }
}

/* B1.2 (v0.8.2) — Trajet en bandeau pleine largeur (au-dessus de la grille) + inputs route en grille responsive */
#trajet-band { width: 100%; margin-bottom: 18px; }
#trajet-band .trajet-inputs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
/* B1.2 (v0.8.2) — Zones traversées : liste plafonnée + scroll interne (la colonne n'explose plus en hauteur) */
#airspaces-list { max-height: 340px; overflow-y: auto; }
@media (max-width: 1024px) {
  #trajet-band .trajet-inputs-grid { grid-template-columns: 1fr; }
}

/* B2a (v0.8.3) — VERRE sur les panneaux du dashboard. Conversion CIBLÉE via #tab-plan :
   on NE touche PAS la classe .card (les .closest('.card') / .querySelector('.card') du JS restent valides).
   Spécificité #tab-plan .card:not(.no-glass) = (1,2,0) > .dark .card (0,2,0) → gagne aussi en mode nuit ;
   les couleurs flippent via les tokens (--ag-card / --card-bd, pilotés par data-theme). */
#tab-plan .card:not(.no-glass) {
  background: var(--ag-card) !important; /* v0.8.10 — bat la règle jour html:not(.dark) .card{background:#fff!important} qui tuait le verre */
  -webkit-backdrop-filter: blur(var(--blur-c)) saturate(140%);
  backdrop-filter: blur(var(--blur-c)) saturate(140%);
  border: 1px solid var(--card-bd);
  border-radius: var(--r-lg);
  box-shadow: inset 0 1px 0 var(--hi), 0 8px 24px var(--shadow);
  transition: background-color var(--t-theme) var(--ease), border-color var(--t-theme) var(--ease), box-shadow .3s var(--ease), transform .3s var(--ease);
}
#tab-plan .card:not(.no-glass):hover {
  border-color: var(--accent-bd);
  box-shadow: inset 0 1px 0 var(--hi), 0 0 22px var(--accent-soft), 0 14px 40px var(--shadow);
}
/* INTANGIBLE : la carte Leaflet vivante ne reçoit JAMAIS de backdrop-filter (jank au pan + html2canvas ne capture pas le flou).
   Le panneau carte porte .no-glass → fond solide (palette via --bg-1), sans flou. */
#tab-plan .card.no-glass {
  background: var(--bg-1) !important; /* v0.8.10 — idem : bat la règle opaque jour */
  border: 1px solid var(--card-bd);
  border-radius: var(--r-lg);
  box-shadow: 0 8px 24px var(--shadow);
}

/* ============================================================
   B2b-1 (v0.8.12) — BARRE DU HAUT EN VERRE AERO (sobre).
   La surface visible est la PILULE centrée (.header-pill) ; le <header> reste
   transparent (jour ET nuit) — fix v0.6.34 anti « feuille blanche » pleine largeur.
   Couleurs jour/nuit via tokens (--panel : .55 jour, .07 nuit). Tailles inchangées.
   ⚠️ Les boutons de barre sont AUSSI exclus de v0630RecolorBlackButtons (sinon un fond
   transparent = brightness 0 < 60 → recolorés en sky). Le retrait de v0630 = B2b-2. */
.header-pill {
  background: var(--panel) !important;
  border: 1px solid var(--panel-bd) !important;
  -webkit-backdrop-filter: blur(var(--blur-c)) saturate(140%);
  backdrop-filter: blur(var(--blur-c)) saturate(140%);
  box-shadow: inset 0 1px 0 var(--hi), 0 10px 30px var(--shadow) !important;
  transition: background-color var(--t-theme) var(--ease), border-color var(--t-theme) var(--ease);
}
.header-pill .divider { background: var(--panel-bd) !important; }
/* Boutons de barre = chips sobres : discrets au repos, accent au survol/actif.
   #reset-all EXCLU → garde son rouge inline. */
.header-action-btn:not(#reset-all), .header-unit-btn {
  background: transparent !important;
  border: 1px solid var(--card-bd) !important;
  color: var(--foreground) !important;
  transition: all .15s var(--ease);
}
.header-action-btn:not(#reset-all):hover, .header-unit-btn:hover {
  background: var(--accent-soft) !important;
  border-color: var(--accent-bd) !important;
  color: var(--accent) !important;
}
/* Onglets : accent au survol + soulignement accent quand actif (taille/padding inchangés). */
.tab-btn { transition: color .15s var(--ease), border-color .15s var(--ease); }
.tab-btn:hover { color: var(--accent) !important; }
.tab-btn.active { border-bottom-color: var(--accent) !important; color: var(--accent) !important; }

/* B2b-3 (v0.8.14) — MENU MOBILE deplie : animation bounce d'agrandissement + onglets en
   chips accent (override du noir/gris herite). Couleurs via tokens (accent jour/nuit). */
@keyframes ag-menu-bounce {
  0%   { opacity: 0; transform: translateY(-10px) scaleY(.94); }
  55%  { opacity: 1; transform: translateY(3px)  scaleY(1.03); }
  78%  {              transform: translateY(-1px) scaleY(.99); }
  100% { opacity: 1; transform: translateY(0)    scaleY(1); }
}
@media (max-width: 768px) {
  .header-pill.menu-open .header-pill-extras {
    animation: ag-menu-bounce .42s cubic-bezier(.34, 1.56, .64, 1) both;
    transform-origin: top center;
  }
  .header-pill.menu-open .tab-btn {
    background: var(--accent-soft) !important;
    color: var(--accent) !important;
    border: 1px solid var(--accent-bd) !important;
    border-radius: 10px !important;
    padding: 10px 14px !important;
    text-align: center !important;
    font-weight: 500 !important;
  }
  .header-pill.menu-open .tab-btn.active {
    background: var(--accent) !important;
    color: var(--accent-ink) !important;
    border-color: transparent !important;
    font-weight: 600 !important;
  }
}

/* B1 (v0.8.0) — rangées 2 colonnes (.vfr-row-2cols, #wf-row-weather) retirées :
   remplacées par la grille #plan-grid ci-dessus. */
/* 🔥 v0.6.34 — Sous-onglets ressources en pilules (texte blanc, gras si actif) */
.res-subtab {
  border: none !important;
  border-radius: 9999px !important;
  background: var(--accent);
  color: var(--accent-ink) !important;
  margin: 3px 3px 6px 0;
}
.res-subtab:hover { background: var(--accent-2); }
/* B1 (v0.8.0) — #wf-row-zones-notes et le breakpoint 900px retirés
   (zones et notes vivent désormais dans des colonnes distinctes de #plan-grid ;
   le repli responsive est géré par le @media 1024px plus haut). */

/* === B1 (v0.8.0) — tab-plan en bloc : la grille #plan-grid gère toute la mise en page === */
#tab-plan:not(.hidden) {
  display: block !important;
}
/* Sécurité : les autres tabs gardent leur display original quand cachés */
#tab-acft.hidden, #tab-history.hidden, #tab-resources.hidden, #tab-params.hidden, #tab-sources.hidden {
  display: none !important;
}
#tab-plan.hidden {
  display: none !important;
}

/* === Pas de gradient en mode nuit === */
html.dark .vfr-block-azba,
html.dark .vfr-block-notam,
html.dark .vfr-block-temsi {
  background: var(--card) !important;
}
.vfr-block-azba, .vfr-block-notam, .vfr-block-temsi { background: var(--card); }

/* ============================================================
   🔥 v0.6.34 — MODE NUIT "ASTRO CALM"
   Fond gradient noir profond → bleu marine, étoiles SVG inline,
   cards bleu marine, header pilule semi-transparent backdrop-blur.
   ============================================================ */

/* v0.7.0 AERO GLASS — Astro Calm (gradient nuit + étoiles SVG) RETIRÉ.
   Le fond atmosphérique (jour ET nuit) est désormais posé dans index.html via
   html::before, piloté par les tokens data-theme. Les overrides nuit ci-dessous
   (body transparent, header/footer marine, cartes) sont CONSERVÉS jusqu'à la
   migration verre des surfaces (Lot B/C). */

html.dark body {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  color: #E8EBF2;
  /* NO position: relative — laisse le natif sticky/fixed fonctionner ! */
}

/* 🔥 v0.6.34 FIX SYMÉTRIE — header transparent (pilule flotte), footer
   AVEC bandeau marine (équivalent au bandeau blanc du mode jour).
   Killian : "garde les formes, dispositions et elements du mode jour
   et applique les au mode nuit. Seul doit changer les couleurs." */

/* Header : transparent (la pilule à l'intérieur a son propre fond) */
html.dark body > header,
html.dark header.sticky,
html.dark header[class*="sticky"],
html.dark header[class*="bg-"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  border: none !important;
  border-top: none !important;
  border-bottom: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Footer : BANDEAU MARINE semi-transparent + backdrop-blur (équivalent
   au bandeau blanc bg-white/95 du mode jour, mais en couleurs nuit) */
html.dark body > footer,
html.dark footer.fixed,
html.dark footer[class*="fixed"],
html.dark footer[class*="bg-"] {
  /* B2b-4 (v0.8.15) — bandeau footer RETIRE (nuit) : transparent, pas de bordure/blur/ombre.
     Les boutons (verre) flottent sur le fond Aero nuit. */
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  border: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Cards bleu marine opaques avec border subtile */
html.dark .card {
  background-color: #162647 !important;
  border: 1px solid #243B6B !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3) !important;
  color: #E8EBF2;
}

/* Header pilule : 🔥 v0.6.34 — NEUTRALISER mon ancien override qui créait une
   2e pilule bleu marine PAR-DESSUS la pilule noire native (Killian voyait 2 pilules
   imbriquées sur image 1). On laisse maintenant la pilule native s'afficher seule. */
html.dark body > header > div {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* ============================================================
   🔥 v0.6.34 — CHARTE GRAPHIQUE (couleurs liens, boutons, etc.)
   ============================================================ */

/* === MODE JOUR === */
html:not(.dark) a:not([class*="bg-"]):not([class*="btn"]):not(.tab-btn) {
  color: #1E40AF;
}
html:not(.dark) a:not([class*="bg-"]):not([class*="btn"]):not(.tab-btn):hover {
  color: #1E3A8A;
}

/* === MODE NUIT === */
html.dark a:not([class*="bg-"]):not([class*="btn"]):not(.tab-btn) {
  color: #5A8FCC !important;
}
html.dark a:not([class*="bg-"]):not([class*="btn"]):not(.tab-btn):hover {
  color: #7BA8E0 !important;
}

/* Inputs en mode nuit */
html.dark input[type="text"],
html.dark input[type="number"],
html.dark textarea,
html.dark select {
  background-color: rgba(10, 24, 56, 0.6) !important;
  border: 1px solid #2A3F6B !important;
  color: #E8EBF2 !important;
  border-radius: 8px !important;
}
html.dark input[type="text"]::placeholder,
html.dark textarea::placeholder {
  color: rgba(168, 179, 204, 0.55) !important;
}
html.dark input[type="text"]:focus,
html.dark textarea:focus,
html.dark input[type="number"]:focus {
  outline: none !important;
  border-color: #5A8FCC !important;
  box-shadow: 0 0 0 2px rgba(90, 143, 204, 0.2) !important;
}

/* Toast container — fond bleu marine */
html.dark #toast-container > * {
  background-color: #1B2A4E !important;
  color: #E8EBF2 !important;
  border: 1px solid #3A5F9E !important;
}

/* Texte secondaire en mode nuit */
html.dark .text-muted,
html.dark .text-xs.text-muted {
  color: #A8B3CC !important;
}

/* Boutons blanc/gris natifs en mode nuit → bleu marine */
html.dark button.bg-white,
html.dark button.bg-gray-100,
html.dark button.bg-slate-100,
html.dark button.bg-gray-50 {
  background-color: rgba(27, 42, 78, 0.8) !important;
  color: #E8EBF2 !important;
  border: 1px solid #3A5F9E !important;
}

/* 🔥 v0.6.34 — BOUTONS NOIR "SÉLECTIONNÉS" → COULEUR DU THÈME
   Le natif utilise bg-black/bg-gray-900 pour l'état actif (toggle kt/km,
   thème clair/sombre, Enregistrer, etc.). Killian veut bleu thème.
   Mode jour : #4DC2F1 sky / Mode nuit : #3A5F9E steel.
   Exclure les actions destructives (red). */
/* B2b-2 (v0.8.13) — CTA sombres (bg-black/gray-900/neutral-900/zinc-900) → ACCENT AERO,
   piloté par tokens (jour : cyan assombri --accent ; nuit : cyan vif). Remplace la
   recoloration sky/steel/creme heritee v0.6.30 ET la fonction JS v0630 (neutralisee plus bas).
   Pas de --accent/jour-nuit en dur : un seul bloc, les tokens flippent via data-theme. */
button.bg-black,
button.bg-gray-900,
button.bg-neutral-900,
button.bg-zinc-900 {
  background: var(--accent) !important;
  background-color: var(--accent) !important;
  color: var(--accent-ink) !important;
  border-color: transparent !important;
  transition: background-color .15s var(--ease), box-shadow .15s var(--ease) !important;
}
button.bg-black:hover,
button.bg-gray-900:hover,
button.bg-neutral-900:hover,
button.bg-zinc-900:hover {
  background: var(--accent-2) !important;
  background-color: var(--accent-2) !important;
  box-shadow: 0 0 16px var(--accent-soft) !important;
}

/* Boutons preset (0-2500 ft, tout 0-50000) en pilule */
html:not(.dark) button[class*="rounded"][class*="border"] {
  border-radius: 9999px !important;
}
html.dark button[class*="rounded"][class*="border"] {
  border-radius: 9999px !important;
  background-color: rgba(27, 42, 78, 0.6) !important;
  border-color: #3A5F9E !important;
  color: #E8EBF2 !important;
}

/* ============================================================
   🔥 v0.6.34 — BOUTON "GÉNÉRER LE PDF" EN PILULE
   Mode jour : bleu ciel #4DC2F1 (couleur du thème jour)
   Mode nuit : bleu acier #3A5F9E (N1)
   Note : pas de padding override pour respecter le natif et garder
   exactement la même forme/taille que mode jour
   ============================================================ */
/* B2b-4 (v0.8.16) — bouton PDF EXACTEMENT comme la pilule header (memes parametres) :
   fond --panel, bordure --panel-bd, meme blur + inset highlight + ombre. Texte force en
   --foreground (override du text-white natif, sinon invisible sur le verre clair en jour).
   Le footer est transparent (v0.8.15) donc le bouton flotte sur le fond Aero, comme la pilule. */
#pdf-btn {
  border-radius: 9999px !important;
  font-weight: 600 !important;
  background: var(--panel) !important;
  -webkit-backdrop-filter: blur(var(--blur-c)) saturate(140%);
  backdrop-filter: blur(var(--blur-c)) saturate(140%);
  border: 1px solid var(--panel-bd) !important;
  color: var(--foreground) !important;
  box-shadow: inset 0 1px 0 var(--hi), 0 10px 30px var(--shadow) !important;
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease), transform 0.12s var(--ease) !important;
  cursor: pointer;
}
#pdf-btn:hover {
  transform: translateY(-1px) !important;
  box-shadow: inset 0 1px 0 var(--hi), 0 14px 40px var(--shadow) !important;
}
#pdf-btn:active { transform: translateY(0) !important; }

/* B2b-5 (v0.8.17) — bouton "epingler" aligne EXACTEMENT sur la pilule header (memes params que #pdf-btn).
   Override des styles inline (bg --card opaque + bordure --border) -> verre --panel. Jour/nuit via tokens. */
#pin-flight-btn {
  border-radius: 9999px !important;
  background: var(--panel) !important;
  background-color: var(--panel) !important;
  border: 1px solid var(--panel-bd) !important;
  color: var(--foreground) !important;
  -webkit-backdrop-filter: blur(var(--blur-c)) saturate(140%) !important;
  backdrop-filter: blur(var(--blur-c)) saturate(140%) !important;
  box-shadow: inset 0 1px 0 var(--hi), 0 10px 30px var(--shadow) !important;
}

/* === 🔥 v0.6.34 — RETIRE TOUS LES TOGGLES DES BLOCS DYNAMIQUES === */
/* Killian : plus de soucis avec les toggles, ces blocs sont
   dépliés en permanence. */
#airspaces-section .unified-chevron,
#airspaces-section .collapse-chevron,
#airspaces-section .v0623-abs,
#airspaces-section .v0614-chev,
#airspaces-section .block-chev,
#airspaces-section .collapse-chevron-native,
#trip-summary .unified-chevron,
#trip-summary .collapse-chevron,
#trip-summary .v0623-abs,
#trip-summary .v0614-chev,
#trip-summary .block-chev,
.vfr-block-azba .unified-chevron,
.vfr-block-azba .collapse-chevron,
.vfr-block-azba .v0623-abs,
.vfr-block-azba .v0614-chev,
.vfr-block-notam .unified-chevron,
.vfr-block-notam .collapse-chevron,
.vfr-block-notam .v0623-abs,
.vfr-block-notam .v0614-chev,
.ad-card .unified-chevron,
.ad-card .collapse-chevron,
.ad-card .v0623-abs,
.ad-card .v0614-chev,
[data-ad-card] .unified-chevron,
[data-ad-card] .collapse-chevron,
[data-ad-card] .v0623-abs,
#ad-cards .unified-chevron,
#ad-cards .collapse-chevron,
#ad-cards .v0623-abs,
#wf-row-azba-notam .unified-chevron,
#wf-row-azba-notam .v0623-abs,
#wf-row-zones-notes .unified-chevron,
#wf-row-zones-notes .v0623-abs {
  display: none !important;
  visibility: hidden !important;
}
/* Force le contenu collapsible à toujours être visible */
#airspaces-section .collapsible-content,
#trip-summary .collapsible-content,
.vfr-block-azba .collapsible-content,
.vfr-block-notam .collapsible-content,
.ad-card .collapsible-content,
[data-ad-card] .collapsible-content,
#ad-cards .collapsible-content {
  display: block !important;
  max-height: none !important;
  height: auto !important;
  overflow: visible !important;
}
/* Et neutraliser les <details> natifs résiduels (déplier toujours) */
#airspaces-section details,
#trip-summary details,
.vfr-block-azba details,
.vfr-block-notam details,
.ad-card details:not(#map-container details):not(#map-controls details),
[data-ad-card] details {
  /* details devient un simple block toujours ouvert (forcé via JS aussi) */
}
/* v0.6.34 : NE PAS cacher les <summary> car ils peuvent contenir le titre
   du bloc (ex: "notes pilote"). On les laisse visibles mais sans toggle
   (le JS de v0624 transmute en div.v0625-ex-summary). */
#airspaces-section details > summary,
#trip-summary details > summary,
.vfr-block-azba details > summary,
.vfr-block-notam details > summary,
.ad-card details > summary,
[data-ad-card] details > summary {
  list-style: none !important;
  cursor: default !important;
}
#airspaces-section details > summary::-webkit-details-marker,
#trip-summary details > summary::-webkit-details-marker,
.vfr-block-azba details > summary::-webkit-details-marker,
.vfr-block-notam details > summary::-webkit-details-marker,
.ad-card details > summary::-webkit-details-marker,
[data-ad-card] details > summary::-webkit-details-marker {
  display: none !important;
}

/* === ACFT callsign === */
.acft-callsign-compact label { font-weight: 500; }

/* === Satellite toggle === */
#sat-toggle-pill:hover { filter: brightness(1.05); }

/* === Plein écran météo France : ligne d'affichage flotte top-left === */
.map-fullscreen-wf .wf-mode-line,
body[data-fullscreen-active] .wf-mode-line {
  position: fixed !important;
  top: 70px !important;
  left: 12px !important;
  right: auto !important;
  z-index: 100000 !important;
  background: rgba(255, 255, 255, 0.97) !important;
  padding: 10px 14px !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
  border: 1.5px solid var(--border) !important;
  flex-wrap: wrap !important;
  max-width: calc(100vw - 24px) !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}
html.dark .map-fullscreen-wf .wf-mode-line,
html.dark body[data-fullscreen-active] .wf-mode-line {
  background: rgba(20, 20, 22, 0.95) !important;
  color: var(--foreground) !important;
}

/* === 🔥 CHEVRON UNIFIÉ v0.6.34 ===
   Tous les chevrons (blocs custom + blocs natifs + <details>)
   utilisent la même classe .unified-chevron pour un rendu identique */
.unified-chevron {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 13px;
  line-height: 1;
  color: #ffffff !important;
  background: #0EA5E9 !important;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.15s;
  margin-left: auto !important;
  flex-shrink: 0;
  user-select: none;
  padding: 0;
  /* 🔥 v0.6.34 : visibilité renforcée */
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 2;
}
/* En dark mode : on garde le cercle bleu, glyphe blanc */
html.dark .unified-chevron {
  color: #ffffff !important;
  background: #0EA5E9 !important;
}
.unified-chevron:hover {
  background: #0284C7 !important;
}
html.dark .unified-chevron:hover {
  background: #0284C7 !important;
}
.unified-chevron.collapsed {
  transform: rotate(-90deg);
}
/* Cache complètement les chevrons natifs qu'on remplace */
details[data-chevron-harmonized] summary .toggle-chevron,
details[data-chevron-harmonized] summary .accordion-icon,
details[data-chevron-harmonized] summary > .flex > [data-lucide="chevron-down"] {
  display: none !important;
}

/* === 🔥 FIX #C v0.6.34 — Zones aériennes scroll interne ===
   On NE met PAS max-height sur la .card complète (ça forçait le <p>
   d'avertissement final à déborder visuellement).
   Le scroll interne se fait uniquement sur la liste #airspaces-list. */
#airspaces-section .card,
#airspaces-section > div.card {
  display: flex !important;
  flex-direction: column;
}
#airspaces-list {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
}
#airspaces-list::-webkit-scrollbar {
  width: 6px;
}
#airspaces-list::-webkit-scrollbar-track {
  background: var(--muted);
  border-radius: 3px;
}
#airspaces-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
#airspaces-list::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}

/* === Container map-container pleine largeur === */
#map-container { width: 100% !important; }

/* === Carte aérodromes fusionnée (v0.6.34) ===
   On supprime le .card sur les enfants pour éviter double encadrement */
#aerodromes-merged-wrapper #map-controls,
#aerodromes-merged-wrapper #map-container {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
}
/* Les contenus internes restent stylés normalement */
#aerodromes-merged-wrapper #map-controls > * {
  /* rien à changer, le contenu interne garde son style */
}

/* === native-collapsible-content : prefs persistées === */
.native-collapsible-content {
  transition: opacity 0.15s;
}
  `;
  document.head.appendChild(v065Css);

  // ============================================================
  // 🔥 v0.6.34 — FIX METAR : cleanup cache pollué + timeout wrapper
  // L'override v0.6.8 stockait au format {data, ts} alors que le natif
  // attend le METAR directement. On nettoie/répare au boot.
  // En plus, on wrap fetchMetar avec un timeout global de 12s pour
  // éviter les freezes infinis si tous les proxies sont down.
  // ============================================================
  (function cleanupMetarCacheV0612() {
    try {
      const keysToFix = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('autogyrodash_metar_')) keysToFix.push(k);
      }
      let fixed = 0, removed = 0;
      keysToFix.forEach(k => {
        try {
          const v = localStorage.getItem(k);
          const parsed = JSON.parse(v);
          if (parsed && typeof parsed === 'object' && parsed.data && parsed.ts && Object.keys(parsed).length <= 3) {
            localStorage.setItem(k, JSON.stringify(parsed.data));
            fixed++;
          }
        } catch (e) {
          localStorage.removeItem(k);
          removed++;
        }
      });
      if (fixed > 0 || removed > 0) {
        console.log(`[v0.6.34] METAR cache cleanup : ${fixed} repaired, ${removed} removed ✓`);
      }
    } catch (e) {}
  })();

  (function patchMetarTimeoutV0612() {
    function _tryPatch() {
      if (typeof window.fetchMetar !== 'function') {
        setTimeout(_tryPatch, 200);
        return;
      }
      if (window.__metarTimeoutPatchedV0612) return;
      window.__metarTimeoutPatchedV0612 = true;
      const orig = window.fetchMetar;
      window.fetchMetar = async function fetchMetarWrapped(station) {
        try {
          const result = await Promise.race([
            orig.call(this, station),
            new Promise((resolve) => setTimeout(() => resolve(null), 12000))
          ]);
          return result;
        } catch (e) {
          return null;
        }
      };
      console.log('[METAR v0.6.34] timeout-wrapped (12s max) ✓');
    }
    _tryPatch();
  })();

  /* Ancien code v0.6.8 désactivé (conservé pour archive) :
  (function patchFetchMetar() {
    function _tryPatch() {
      if (typeof window.fetchMetar !== 'function') {
        setTimeout(_tryPatch, 300);
        return;
      }
      if (window.__fetchMetarPatchedV068) return;
      window.__fetchMetarPatchedV068 = true;

      const METAR_PROXIES_V068 = (apiUrl) => [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      ];

      // fetchWithTimeout est fourni par le code natif ; sinon fallback
      const _ftw = (typeof fetchWithTimeout === 'function')
        ? fetchWithTimeout
        : async (url, opts, ms) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), ms);
            try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
            finally { clearTimeout(t); }
          };

      async function tryProxyOnce(proxyUrl) {
        const r = await _ftw(proxyUrl, {}, 5000); // 5s timeout
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const text = await r.text();
        if (!text || text.trim().startsWith('<')) throw new Error('non-JSON');
        let json;
        try { json = JSON.parse(text); } catch (e) { throw new Error('parse: ' + e.message); }
        if (!Array.isArray(json) || json.length === 0) throw new Error('vide');
        return json[0];
      }

      async function refreshInBackground(station, apiUrl, cacheKey, expiryKey) {
        try {
          const proxies = METAR_PROXIES_V068(apiUrl);
          const data = await Promise.any(proxies.map(tryProxyOnce));
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
            localStorage.setItem(expiryKey, String(Date.now() + 60 * 60 * 1000));
          } catch (e) {}
        } catch (e) {
          // silencieux : on a déjà retourné le cache stale à l'utilisateur
        }
      }

      window.fetchMetar = async function fetchMetarFast(station) {
        const cacheKey = `autogyrodash_metar_${station}`;
        const expiryKey = `${cacheKey}__exp`;
        const now = Date.now();
        const apiUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(station)}&format=json&taf=true&hours=2`;

        // Lire cache (peut être stale)
        let cached = null;
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            cached = parsed?.data || parsed; // compat ancien format
          }
        } catch (e) {}

        const expiry = parseInt(localStorage.getItem(expiryKey) || '0', 10);
        const isFresh = cached && expiry > now;

        // Cas 1 : cache frais → retourner direct, pas de fetch
        if (isFresh) {
          return cached;
        }

        // Cas 2 : cache stale → retourner stale immédiatement + refresh en background
        if (cached) {
          refreshInBackground(station, apiUrl, cacheKey, expiryKey);
          return cached;
        }

        // Cas 3 : pas de cache → race entre les 3 proxies (Promise.any)
        try {
          const proxies = METAR_PROXIES_V068(apiUrl);
          const data = await Promise.any(proxies.map(tryProxyOnce));
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ data, ts: now }));
            localStorage.setItem(expiryKey, String(now + 60 * 60 * 1000));
          } catch (e) {}
          return data;
        } catch (e) {
          // Tous les proxies ont échoué et pas de cache
          if (typeof showToast === 'function') {
            showToast(`METAR ${station} indisponible`, 'err', 3000);
          }
          return null;
        }
      };

      console.log('[METAR v0.6.34] fetchMetar patché : Promise.any + 5s + stale-while-revalidate ✓');
    }
    _tryPatch();
  })();
  */
  // Fin de l'ancien patch METAR désactivé.

  // ============================================================
  // 🌤️ FOND CIEL + NUAGES v0.6.34 (mode jour uniquement)
  // SVG inline en data URL = 0 fichier à héberger, vectoriel, ~1 KB.
  // Les .card restent opaques pour passer par-dessus avec un léger
  // box-shadow pour les faire "flotter". Mode nuit inchangé.
  // ============================================================
  const skyBgCss = document.createElement('style');
  skyBgCss.id = 'extensions-v0_6_10-sky-bg';
  skyBgCss.textContent = `
html:not(.dark) body {
  background: transparent !important;  /* v0.8.11 — ciel cartoon v0.6.10 RETIRÉ : le fond Aero (html::before gris-lavande + lueur sunset, piloté par les tokens) réapparait. Supprime aussi background-attachment:fixed qui cassait le backdrop-filter (verre) sur iOS Safari → cartes verre visibles sur mobile. */
}

/* 🔥 v0.6.34 : FORCE TRANSPARENCE ULTRA-AGRESSIVE sur tous les conteneurs
   potentiels qui pourraient porter un fond blanc (Tailwind utilities,
   #app, main, sections). Seuls les éléments avec classe .card et les
   blocs custom .vfr-block-* gardent leur fond opaque. */
html:not(.dark) body > main,
html:not(.dark) body main,
html:not(.dark) main,
html:not(.dark) #app,
html:not(.dark) #root,
html:not(.dark) .container,
html:not(.dark) [class*="max-w-"],
html:not(.dark) [id^="tab-"],
html:not(.dark) [id^="page-"],
html:not(.dark) body > section,
html:not(.dark) section.tab-content,
html:not(.dark) .tab-content {
  background: transparent !important;
  background-color: transparent !important;
}

/* 🔥 v0.6.34 : Si un wrapper invisible enveloppe le contenu et a un fond
   blanc, on le rend transparent. Mais on garde les .card visibles. */
html:not(.dark) body > div:not(.card):not([id]):not(.v0610-footer-pill) {
  background: transparent !important;
  background-color: transparent !important;
}

/* v0.8.7 — RETRAIT de la règle jour-only "margin-bottom:0" sur les enfants de #tab-plan.
   #tab-plan est en display:block ; les écarts viennent des marges des enfants
   (#trajet-band margin-bottom 18px, #ad-cards margin-top 18px) + des gaps de grille (18px).
   En jour, ce margin-bottom:0 collait le bandeau Trajet aux colonnes (0px) alors que le
   nuit gardait 18px. Sans cette règle, jour = nuit = 18px partout (écarts égaux). */

/* Les cards passent au-dessus du ciel : opaques + ombrage doux */
html:not(.dark) .card {
  background-color: #ffffff !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* 🔥 v0.6.34 : Header pilule SANS flou, MAIS sans rectangle blanc moche.
   On retire juste le backdrop-filter. Le natif gère sa pilule centrée
   avec son propre fond. PAS de fond blanc forcé sur tous les enfants
   (ce qui créait la "feuille blanche" pleine largeur en v0.6.10). */
html:not(.dark) body > header {
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Sécurité : les éléments .vfr-block-* restent lisibles */
html:not(.dark) .vfr-block-azba,
html:not(.dark) .vfr-block-notam,
html:not(.dark) .vfr-block-temsi {
  background-color: #ffffff !important;
}

/* Le wrapper de carte fusionnée reste opaque */
html:not(.dark) #aerodromes-merged-wrapper {
  background-color: #ffffff !important;
}

/* 🔥 v0.6.34 : footer (Sources / Données indicatives) - style ciblé
   sur le footer natif <footer> directement, sans wrapper pilule
   (qui causait le bug du fond blanc sur toute la page).
   Le footer natif est <footer class="fixed bottom-0 left-0 right-0 ...">. */
html:not(.dark) body > footer p,
html:not(.dark) body > footer .text-xs.text-muted {
  /* Le footer natif a déjà son fond, on ne le change pas */
}
/* B2b-4 (v0.8.15) — bandeau footer blanc RETIRE (jour) : override du bg-white/95 + backdrop-blur natif.
   Footer transparent, pas de bordure haute ni d'ombre. Les boutons PDF (verre) + epingler (verre)
   flottent sur le fond Aero jour. */
html:not(.dark) body > footer {
  background: transparent !important;
  background-color: transparent !important;
  border-top: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* Si ancien wrapper erroné existe encore, le neutraliser visuellement */
html:not(.dark) .v0610-footer-pill {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  max-width: none !important;
  border-radius: 0 !important;
}
  `;
  document.head.appendChild(skyBgCss);

  // ============================================================
  // 🔥 v0.6.34 — FIX #1 : Légende météo France décalée à droite
  // des contrôles Leaflet (+/- et plein écran)
  // ============================================================
  const fixLegendCss = document.createElement('style');
  fixLegendCss.id = 'extensions-v0_6_10-legend';
  fixLegendCss.textContent = `
.map-fullscreen-wf .wf-mode-line,
body[data-fullscreen-active] .wf-mode-line {
  position: fixed !important;
  top: 70px !important;
  left: 70px !important;  /* décalé pour passer à droite des +/- et plein écran */
  right: auto !important;
  z-index: 100000 !important;
}
/* Légende en mode normal (carte intégrée) : décalée aussi */
.weather-france-section .wf-mode-line,
#weather-france-section .wf-mode-line {
  margin-left: 60px;
}
  `;
  document.head.appendChild(fixLegendCss);

  // ============================================================
  // 🔥 v0.6.34 — FIX #2 : RECONSTRUCTION RADICALE des sections
  // #airspaces-section et #trip-summary pour éliminer DÉFINITIVEMENT
  // les doublons de titre. On wipe la card et on reconstruit avec :
  //   - UN seul header custom (titre + badge + chevron unifié à droite)
  //   - Un .v0610-content qui contient le reste, pliable
  // Les éléments natifs (airspaces-list, airspaces-count, filtres...)
  // sont PRÉSERVÉS (move pas clone) → les références getElementById
  // du code natif restent valides.
  // ============================================================
  function rebuildAirspacesSectionV0610() {
    const section = document.getElementById('airspaces-section');
    if (!section) return;
    let card = section.querySelector(':scope > .card');
    if (!card) return;
    if (card.dataset.v0610Rebuilt === '1') return; // 1 seule fois

    // Snapshot des éléments à préserver
    const airspacesCount = card.querySelector('#airspaces-count');
    const airspacesLoading = card.querySelector('#airspaces-loading');
    const airspacesList = card.querySelector('#airspaces-list');
    // Le filtre altitude : div.muted-bg avec les inputs
    const altFilterDiv = card.querySelector('.muted-bg') || card.querySelector('div:has(input[type="number"])');
    // L'avertissement final
    const advisoryP = card.querySelector('p.text-xs.text-muted, p.text-muted');

    // Wipe complètement la card
    while (card.firstChild) card.removeChild(card.firstChild);
    card.dataset.v0610Rebuilt = '1';

    // Header unifié
    const header = document.createElement('div');
    header.className = 'v0610-unified-header';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;';
    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;color:var(--foreground);';
    titleEl.innerHTML = '<i data-lucide="shield-alert" class="inline h-4 w-4"></i> <span>zones aériennes traversées</span>';
    header.appendChild(titleEl);

    const rightWrap = document.createElement('div');
    rightWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    if (airspacesCount) rightWrap.appendChild(airspacesCount);
    const chevron = document.createElement('button');
    chevron.className = 'unified-chevron v0610-aspc-chev';
    chevron.type = 'button';
    chevron.title = 'plier / déplier';
    chevron.innerHTML = '▼';
    rightWrap.appendChild(chevron);
    header.appendChild(rightWrap);

    card.appendChild(header);

    // Content wrapper pliable
    const content = document.createElement('div');
    content.className = 'v0610-content';
    content.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:10px;';
    if (altFilterDiv) content.appendChild(altFilterDiv);
    if (airspacesLoading) content.appendChild(airspacesLoading);
    if (airspacesList) content.appendChild(airspacesList);
    if (advisoryP) content.appendChild(advisoryP);
    card.appendChild(content);

    // Re-render lucide icon
    if (window.lucide?.createIcons) {
      try { window.lucide.createIcons(); } catch(e) {}
    }

    // Wire toggle (persisté)
    const prefs = loadCollapsePrefs();
    let collapsed = prefs['zones-aer'] === true;
    function apply() {
      if (collapsed) {
        content.style.display = 'none';
        chevron.classList.add('collapsed');
      } else {
        content.style.display = 'flex';
        chevron.classList.remove('collapsed');
      }
    }
    apply();
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      saveCollapsePref('zones-aer', collapsed);
      apply();
    });

    console.log('[v0.6.34] airspaces-section rebuild ✓');
  }

  function rebuildTripSummaryV0610() {
    const section = document.getElementById('trip-summary');
    if (!section) return;
    let card = section.querySelector(':scope > .card');
    if (!card) return;
    if (card.dataset.v0610Rebuilt === '1') return;

    // Préserver les éléments avec id
    const tripSegments = card.querySelector('#trip-segments');
    const totalsRow = card.querySelector('.border-t, .grid-cols-3') || card.querySelector('div.grid');
    const fuelWarning = card.querySelector('#fuel-warning');

    // Wipe
    while (card.firstChild) card.removeChild(card.firstChild);
    card.dataset.v0610Rebuilt = '1';

    // Header
    const header = document.createElement('div');
    header.className = 'v0610-unified-header';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;';
    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;color:var(--foreground);';
    titleEl.textContent = 'résumé du trajet';
    header.appendChild(titleEl);
    const chevron = document.createElement('button');
    chevron.className = 'unified-chevron v0610-tsum-chev';
    chevron.type = 'button';
    chevron.title = 'plier / déplier';
    chevron.innerHTML = '▼';
    header.appendChild(chevron);
    card.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'v0610-content';
    content.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:10px;';
    if (tripSegments) content.appendChild(tripSegments);
    if (totalsRow) content.appendChild(totalsRow);
    if (fuelWarning) content.appendChild(fuelWarning);
    card.appendChild(content);

    // Wire toggle
    const prefs = loadCollapsePrefs();
    let collapsed = prefs['resume-trajet'] === true;
    function apply() {
      if (collapsed) {
        content.style.display = 'none';
        chevron.classList.add('collapsed');
      } else {
        content.style.display = 'flex';
        chevron.classList.remove('collapsed');
      }
    }
    apply();
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      saveCollapsePref('resume-trajet', collapsed);
      apply();
    });

    console.log('[v0.6.34] trip-summary rebuild ✓');
  }

  // 🔥 v0.6.34 : APPROCHE NUCLÉAIRE pour le doublon de titre.
  // On cherche le h2 natif PAR ICÔNE (shield-alert pour airspaces),
  // on trouve sa card englobante, on APLATIT toute card imbriquée AU-DESSUS,
  // on supprime les h2 dupliqués sans icon, et on pose un chevron inline.

  function v0613FlattenAndChevron(section, key, iconLucide, titleRegex) {
    if (!section) return;

    // 🔥 v0.6.34 : TRANSMUTATION RADICALE.
    // Le DOM observé montre que la .card est devenue un <details> avec un
    // <summary> qui CONTIENT le titre dupliqué + le marker ▾. C'est l'origine
    // du doublon. Solution : convertir le <details> en <div> et supprimer
    // le <summary>.
    section.querySelectorAll('details').forEach(det => {
      // Reset les markers persistants
      delete det.dataset.wrapped;
      delete det.dataset.chevronHarmonized;
      delete det.dataset.v0613Done;
      // Supprimer le summary (doublon de titre)
      const sum = det.querySelector(':scope > summary');
      if (sum) {
        console.log(`[v0.6.34] Removed <summary> doublon dans #${section.id}`);
        sum.remove();
      }
      // Transmuter le <details> en <div> : créer un nouveau <div>,
      // y move tous les enfants, copier les classes, remplacer
      const newDiv = document.createElement('div');
      // Copier les attributs (sauf 'open')
      Array.from(det.attributes).forEach(attr => {
        if (attr.name === 'open') return;
        newDiv.setAttribute(attr.name, attr.value);
      });
      // Move tous les enfants
      while (det.firstChild) newDiv.appendChild(det.firstChild);
      // Remplacer dans le parent
      det.parentNode.replaceChild(newDiv, det);
      console.log(`[v0.6.34] Transmuté <details> en <div> dans #${section.id} ✓`);
    });

    // 1. Trouver le h2 natif (priorité : celui avec l'icône)
    let nativeH2 = null;
    if (iconLucide) {
      nativeH2 = Array.from(section.querySelectorAll('h2, h3')).find(h => {
        return h.querySelector(`[data-lucide="${iconLucide}"], svg.lucide-${iconLucide}, i.lucide-${iconLucide}`);
      });
    }
    if (!nativeH2) {
      // Fallback : premier h2 qui matche le texte attendu
      nativeH2 = Array.from(section.querySelectorAll('h2, h3')).find(h => {
        return titleRegex.test(h.textContent || '');
      });
    }
    if (!nativeH2) nativeH2 = section.querySelector('h2, h3');
    if (!nativeH2) return;

    // 2. Trouver la card qui contient ce h2 (peut maintenant être un .card div)
    const nativeCard = nativeH2.closest('.card');
    if (!nativeCard) return;

    // 3. SUPPRIMER tous les autres h2/h3 dans la section qui matchent le titre
    //    (les doublons sans icône — au cas où il en resterait)
    Array.from(section.querySelectorAll('h2, h3, span.section-title')).forEach(h => {
      if (h === nativeH2) return;
      const txt = h.textContent || '';
      const hasIcon = h.querySelector('i, svg, img');
      if (titleRegex.test(txt) && !hasIcon) {
        let toRemove = h;
        while (toRemove.parentElement && toRemove.parentElement !== section && toRemove.parentElement !== nativeCard) {
          if (toRemove.parentElement.children.length === 1) {
            toRemove = toRemove.parentElement;
          } else {
            break;
          }
        }
        if (toRemove.parentElement && toRemove !== nativeCard) {
          toRemove.remove();
          console.log(`[v0.6.34] Suppression doublon titre sans icon dans #${section.id}`);
        }
      }
    });

    // 4. Supprimer aussi les .block-chev résiduels (marker du details transmuté)
    section.querySelectorAll('.block-chev').forEach(c => c.remove());

    // 5. Déballer toute trace de wrapper ancien dans nativeCard
    ['native-collapsible-content', 'v0610-content'].forEach(cls => {
      const w = nativeCard.querySelector(`:scope > .${cls}`);
      if (w) {
        while (w.firstChild) nativeCard.appendChild(w.firstChild);
        w.remove();
      }
    });

    // 🔥 v0.6.34 — CLEANUP IDEMPOTENT (toujours, AVANT le check v0614Done)
    // ----------------------------------------------------------------
    // V0.6.19 bug : on retirait TOUS les chevrons (step 6) AVANT le check
    // v0614Done. Le check trouvait donc TOUJOURS null → boucle infinie
    // (100+ "Chevron inline ajouté" dans la console).
    //
    // Fix : on cherche le header EXISTANT (s'il existe), et on cleanup
    // SEULEMENT ce qui est hors header. Le chevron du header survit.
    // ----------------------------------------------------------------
    const existingHeader = nativeCard.querySelector('.v0614-header');
    const safeChev = existingHeader?.querySelector('.unified-chevron.v0614-chev');

    // Cleanup unified-chevron orphelins (hors du header)
    nativeCard.querySelectorAll('.unified-chevron').forEach(c => {
      if (existingHeader && existingHeader.contains(c)) return;
      c.remove();
    });
    // <summary> résiduels
    nativeCard.querySelectorAll('summary').forEach(s => s.remove());
    // Caractères chevron-like orphelins (TRIANGLES UNIQUEMENT — pas +/- pour
    // éviter de retirer badges natifs légitimes des zones)
    nativeCard.querySelectorAll('button, span, div, a, i, p, small, em, li, h6, label').forEach(el => {
      if (existingHeader && existingHeader.contains(el)) return;
      if (el.children.length > 0) return;
      const txt = (el.textContent || '').trim();
      if (txt.length === 0 || txt.length > 2) return;
      // Triangles chevron seulement
      if (/^[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡˅˄﹀⮟⮝]$/.test(txt)) {
        el.remove();
      }
    });

    // Reset display flex inline posé par anciennes versions
    nativeCard.querySelectorAll('h2, h3').forEach(h => {
      if (h.dataset.v068Flexified) {
        h.style.display = '';
        h.style.alignItems = '';
        h.style.justifyContent = '';
        h.style.flexWrap = '';
        h.style.gap = '';
        delete h.dataset.v068Flexified;
      }
    });

    if (nativeCard.dataset.v0614Done === '1') {
      // 🔥 v0.6.34 : Check basé sur le chev absolute (v0623-abs)
      // Si présent dans nativeCard → tout est bon, on sort proprement.
      const absChev = nativeCard.querySelector(':scope > .v0623-abs');
      if (absChev) {
        return; // Tout est OK, on ne refait rien
      }
      delete nativeCard.dataset.v0614Done;
      // continue execution to re-add chevron
    }
    nativeCard.dataset.v0614Done = '1';

    // 7. Identifier ou créer le header flex contenant nativeH2
    let header = nativeH2.closest('.flex');
    if (!header || header.parentNode !== nativeCard) {
      // Si nativeH2 est enfant direct de nativeCard, le wrapper dans un flex
      if (nativeH2.parentNode === nativeCard) {
        header = document.createElement('div');
        header.className = 'v0614-header';
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;';
        nativeH2.parentNode.insertBefore(header, nativeH2);
        header.appendChild(nativeH2);
      } else {
        // chercher le parent enfant direct de nativeCard
        let walker = nativeH2.parentNode;
        while (walker && walker.parentNode !== nativeCard) walker = walker.parentNode;
        header = walker;
      }
    }
    if (!header) return;

    // 🔥 v0.6.34 BUG FIX CRITIQUE : TOUJOURS ajouter la classe .v0614-header
    // au header CHOISI (même si on a réutilisé une flex row du natif).
    header.classList.add('v0614-header');

    // 🔥 v0.6.34 — CHEV EN ABSOLUTE POSITIONING (garanti top-right)
    // ----------------------------------------------------------------
    // L'approche inline (header.appendChild) ne donnait pas un résultat
    // visible chez Killian (peut-être un wrap dû à un badge "10 / 54 zones"
    // qui prend toute la place, ou autre conflit flex).
    //
    // Position absolute top-right de nativeCard = bullet-proof.
    // ----------------------------------------------------------------
    // S'assurer que nativeCard est position: relative pour ancrer l'absolute
    if (getComputedStyle(nativeCard).position === 'static') {
      nativeCard.style.position = 'relative';
    }
    // Réserver de la place dans le header pour le chev (padding-right) pour
    // éviter qu'il chevauche le badge
    header.style.paddingRight = '40px';

    // 8. Ajouter le chevron en position ABSOLUTE top-right de nativeCard
    const chev = document.createElement('button');
    chev.className = 'unified-chevron v0614-chev v0623-abs';
    chev.type = 'button';
    chev.title = 'plier / déplier';
    chev.innerHTML = '▼';
    chev.style.cssText = 'position: absolute !important; top: 12px !important; right: 14px !important; z-index: 10 !important;';
    nativeCard.appendChild(chev); // appendé à nativeCard, PAS au header

    // 🔥 v0.6.34 : Cleanup ciblé UNIQUEMENT sur triangles chevron
    // (PAS de "+", "-", "−", "–", "—", "─", "━" qui matchaient des badges
    //  natifs légitimes — causaient les zones non chargées en v0.6.21)
    nativeCard.querySelectorAll('.unified-chevron, .block-chev').forEach(c => {
      if (c !== chev) {
        c.remove();
        console.log(`[v0.6.34] Chevron .unified-chevron/.block-chev parasite retiré dans #${section.id}`);
      }
    });
    // Tout élément feuille avec UN seul caractère triangulaire chevron, sauf le mien
    nativeCard.querySelectorAll('*').forEach(el => {
      if (el === chev) return;
      if (el.children.length > 0) return; // pas les conteneurs
      const skipTags = ['INPUT', 'TEXTAREA', 'SVG', 'PATH', 'STYLE', 'SCRIPT', 'LINK', 'META', 'OPTION'];
      if (skipTags.includes(el.tagName)) return;
      const txt = (el.textContent || '').trim();
      if (txt.length === 0 || txt.length > 2) return;
      // SEULS triangles chevron (sans "+" ni tirets pour éviter de casser zones)
      if (/^[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡˅˄﹀⮟⮝]$/.test(txt)) {
        console.log(`[v0.6.34] Élément <${el.tagName.toLowerCase()}> "${txt}" retiré dans #${section.id}`);
        el.remove();
      }
    });
    // Cleanup <summary> résiduels
    nativeCard.querySelectorAll('summary').forEach(s => s.remove());

    // 9. Wire toggle
    function getContent() {
      return Array.from(nativeCard.children).filter(el => el !== header && el !== chev);
    }
    const prefs = loadCollapsePrefs();
    let collapsed = prefs[key] === true;
    function apply() {
      const els = getContent();
      els.forEach(el => {
        if (collapsed) {
          if (!el.dataset.v0614Orig) el.dataset.v0614Orig = el.style.display || '';
          el.style.display = 'none';
        } else {
          el.style.display = el.dataset.v0614Orig || '';
        }
      });
      if (collapsed) chev.classList.add('collapsed');
      else chev.classList.remove('collapsed');
    }
    apply();
    chev.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      saveCollapsePref(key, collapsed);
      apply();
    });
    console.log(`[v0.6.34] Chevron absolute ajouté à #${section.id} ✓`);
  }

  function v0613NuclearFixAll() {
    // 🔥 v0.6.34 — DÉSACTIVÉ : Killian veut plus AUCUN toggle sur les blocs
    // apparaissant après remplissage du trajet (airspaces, trip-summary, etc.)
    // La fonction v0624RemoveAllDynamicToggles ci-dessous gère le cleanup.
    return;
  }
  setTimeout(v0613NuclearFixAll, 400);
  setTimeout(v0613NuclearFixAll, 1200);
  setTimeout(v0613NuclearFixAll, 2500);
  setTimeout(v0613NuclearFixAll, 4500);
  setTimeout(v0613NuclearFixAll, 7000);
  // 🔥 v0.6.34 : Le setInterval reste mais la fonction est no-op
  setInterval(v0613NuclearFixAll, 3000);

  // ============================================================
  // 🔥 v0.6.34 — RETIRE TOUS LES TOGGLES DES BLOCS DYNAMIQUES
  // ----------------------------------------------------------------
  // Killian : "retire les toggles pour les éléments apparaissant
  //  seulement après avoir populé le trajet. Au moins plus de soucis"
  //
  // Blocs concernés : ZONES AÉRIENNES, notes pilote, AZBA, NOTAM,
  // RÉSUMÉ DU TRAJET, fiches AD (DÉPART/ARRIVÉE), logistique.
  //
  // Stratégie : retire les chev/toggles + force le contenu à rester
  // visible (plus de collapse natif). Plus simple, plus robuste.
  // ============================================================
  function v0624RemoveAllDynamicToggles() {
    // Identifier les blocs concernés
    const dynamicBlocks = [];
    // Directs par ID
    ['airspaces-section', 'trip-summary', 'ad-cards', 'wf-row-azba-notam', 'wf-row-zones-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) dynamicBlocks.push(el);
    });
    // Par classe
    document.querySelectorAll('.vfr-block-azba, .vfr-block-notam, .ad-card, [data-ad-card]').forEach(el => {
      dynamicBlocks.push(el);
    });
    // Bloc notes pilote (le card qui contient #notes-textarea)
    const notesTextarea = document.getElementById('notes-textarea');
    if (notesTextarea) {
      const notesCard = notesTextarea.closest('.card');
      if (notesCard) dynamicBlocks.push(notesCard);
    }

    dynamicBlocks.forEach(block => {
      // 1. Retirer tous les chevrons explicites
      block.querySelectorAll('.unified-chevron, .collapse-chevron, .v0623-abs, .v0614-chev, .block-chev, .collapse-chevron-native, .aerodromes-merged-chevron').forEach(c => c.remove());

      // 2. Retirer les caractères triangle orphelins (▼ ▶ etc.)
      block.querySelectorAll('*').forEach(el => {
        if (el.children.length > 0) return;
        const skipTags = ['INPUT', 'TEXTAREA', 'SVG', 'PATH', 'STYLE', 'SCRIPT', 'LINK', 'META', 'OPTION'];
        if (skipTags.includes(el.tagName)) return;
        const txt = (el.textContent || '').trim();
        if (txt.length === 0 || txt.length > 2) return;
        if (/^[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡˅˄﹀⮟⮝]$/.test(txt)) {
          el.remove();
        }
      });

      // 3. Transmuter <details> → <div> en PRÉSERVANT le contenu du <summary>
      //    (sinon le titre "notes pilote" disparait !)
      Array.from(block.querySelectorAll('details')).forEach(det => {
        // Ne PAS toucher #map-container ou ad-cards complexe
        if (det.closest('#map-controls, #map-container')) return;
        const div = document.createElement('div');
        Array.from(det.attributes).forEach(a => {
          if (a.name !== 'open') div.setAttribute(a.name, a.value);
        });
        while (det.firstChild) {
          if (det.firstChild.tagName === 'SUMMARY') {
            // 🔥 v0.6.34 : EXTRAIRE le contenu du summary (le titre)
            // pour le préserver comme titre du nouveau div.
            const summary = det.firstChild;
            // Retirer chevrons internes du summary
            summary.querySelectorAll('.unified-chevron, .collapse-chevron, .v0623-abs, .v0614-chev, .block-chev').forEach(c => c.remove());
            // Retirer caractères chevron orphelins du summary
            summary.querySelectorAll('*').forEach(el => {
              if (el.children.length > 0) return;
              const txt = (el.textContent || '').trim();
              if (txt.length === 0 || txt.length > 2) return;
              if (/^[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡˅˄﹀⮟⮝]$/.test(txt)) {
                el.remove();
              }
            });
            // Wrapper le contenu du summary dans un <div> qui devient le "titre"
            const titleDiv = document.createElement('div');
            titleDiv.className = 'v0625-ex-summary';
            // v0.8.10 — FIX LOGO LOGISTIQUE : ce summary transmuté perdait son px-4 → l'icône
            // carburant débordait à gauche vs le contenu (CARBURANTS… à 16px). On restaure le
            // retrait UNIQUEMENT sur l'en-tête logistique des fiches AD (pas le sous-titre TAF).
            if (det.closest('[data-ad-card]') && /logistique/i.test(summary.textContent || '')) {
              titleDiv.className += ' px-4 py-3';
            }
            titleDiv.style.cssText = 'display:block;cursor:default;user-select:text;';
            while (summary.firstChild) {
              titleDiv.appendChild(summary.firstChild);
            }
            summary.remove();
            div.appendChild(titleDiv);
          } else {
            div.appendChild(det.firstChild);
          }
        }
        det.parentNode.replaceChild(div, det);
      });

      // 4. Forcer le contenu collapsible à être visible
      block.querySelectorAll('.collapsible-content, .collapse-content, .native-collapsible-content').forEach(c => {
        c.style.setProperty('display', 'block', 'important');
        c.style.setProperty('max-height', 'none', 'important');
        c.style.setProperty('height', 'auto', 'important');
        c.style.setProperty('overflow', 'visible', 'important');
      });

      // 5. Retirer la classe .collapsible-block (qui signale un toggle)
      // sur les blocs concernés pour neutraliser tout listener natif
      if (block.classList.contains('collapsible-block')) {
        // On garde la classe mais on retire le data-collapse-key
        // qui signale au natif que c'est collapsible
        block.removeAttribute('data-collapse-key');
      }
    });
  }
  // Run au boot et périodiquement (au cas où le natif re-render)
  setTimeout(v0624RemoveAllDynamicToggles, 200);
  setTimeout(v0624RemoveAllDynamicToggles, 800);
  setTimeout(v0624RemoveAllDynamicToggles, 2000);
  setTimeout(v0624RemoveAllDynamicToggles, 4000);
  setInterval(v0624RemoveAllDynamicToggles, 2500);

  // ============================================================
  // 🔥 v0.6.34 — TITRE "notes pilote" stylisé comme "CARTE DES AÉRODROMES"
  // Format : H2 uppercase 13px font-weight 700 + emoji 📝
  // ============================================================
  function v0626StyleNotesPiloteTitle() {
    const notesTextarea = document.getElementById('notes-textarea');
    if (!notesTextarea) return;
    const notesCard = notesTextarea.closest('.card');
    if (!notesCard) return;

    // 🔥 v0.6.34 : Forcer padding 14px 16px sur la card (match CARTE DES AÉRODROMES)
    // pour que le titre ne soit pas collé au coin haut-gauche
    if (notesCard.dataset.v0627Padded !== '1') {
      notesCard.dataset.v0627Padded = '1';
      notesCard.style.setProperty('padding', '14px 16px', 'important');
    }

    // Si déjà stylé, skip
    if (notesCard.querySelector('.v0626-notes-title')) return;

    // Chercher l'élément titre actuel ("notes pilote" en minuscules) à remplacer
    let titleEl = null;
    const titleCandidates = notesCard.querySelectorAll('h2, h3, .v0625-ex-summary, summary, .section-title, [class*="title"]');
    for (const el of titleCandidates) {
      const txt = (el.textContent || '').trim().toLowerCase();
      if ((txt === 'notes pilote' || txt.startsWith('notes pilote')) && txt.length < 50) {
        titleEl = el;
        break;
      }
    }

    // Construire le nouveau titre (même style que "🗺️ CARTE DES AÉRODROMES")
    const newTitle = document.createElement('h2');
    newTitle.className = 'v0626-notes-title section-title';
    newTitle.style.cssText = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 12px 0;display:flex;align-items:center;gap:6px;';
    newTitle.innerHTML = '<span style="font-size:15px;">📝</span><span>Notes pilote</span>';

    if (titleEl) {
      titleEl.parentNode.replaceChild(newTitle, titleEl);
    } else {
      notesCard.insertBefore(newTitle, notesCard.firstChild);
    }
  }
  setTimeout(v0626StyleNotesPiloteTitle, 300);
  setTimeout(v0626StyleNotesPiloteTitle, 1200);
  setTimeout(v0626StyleNotesPiloteTitle, 3000);
  setInterval(v0626StyleNotesPiloteTitle, 2000);

  // ============================================================
  // 🔥 v0.6.34 — DÉDUPLICATION des titres de section
  // #trip-summary et #airspaces-section affichaient 2 fois leur titre.
  // On garde un seul titre par section (celui qui porte une icône/badge
  // s'il existe, sinon le premier) et on retire les doublons.
  // ============================================================
  function v0633DedupSectionTitles() {
    [['trip-summary', 'résumé du trajet'], ['airspaces-section', 'zones aériennes traversées']].forEach(([id, phrase]) => {
      const sec = document.getElementById(id);
      if (!sec) return;
      const titles = Array.from(sec.querySelectorAll('h2, h3, .section-title')).filter(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === phrase || t.startsWith(phrase);
      });
      if (titles.length <= 1) return;
      // Garder en priorité le titre informatif (icône/svg ou badge de comptage à côté)
      const keep = titles.find(el =>
        el.querySelector('[data-lucide], svg') ||
        el.parentElement?.querySelector('#airspaces-count')
      ) || titles[0];
      titles.forEach(el => { if (el !== keep) el.remove(); });
    });
  }
  setTimeout(v0633DedupSectionTitles, 600);
  setTimeout(v0633DedupSectionTitles, 1600);
  setTimeout(v0633DedupSectionTitles, 3500);
  setInterval(v0633DedupSectionTitles, 3000);

  // ============================================================
  // 🔥 v0.6.34 — RECOLORATION DYNAMIQUE DES BOUTONS NOIRS
  // Mon CSS html:not(.dark) button.bg-black ne match pas car le natif
  // utilise apparemment un autre mécanisme (inline style ou classe custom).
  // On détecte par computed style (brightness < 60) et on applique inline.
  //
  // Couleurs cibles :
  // - Mode jour  : #4DC2F1 (sky du thème) + texte blanc
  // - Mode nuit  : #F0EBD9 (blanc cassé warm) + texte marine deep
  // ============================================================
  function v0630RecolorBlackButtons() {
    return; /* B2b-2 (v0.8.13) — RECOLORATION JS RETIREE : remplacee par le CSS token-driven
               (button.bg-black -> var(--accent)). Corps conserve en historique mais inerte ;
               call-sites/observer/interval restent valides (no-op). */
    const isDark = document.documentElement.classList.contains('dark');
    const accentJour = '#4DC2F1';
    const accentNuit = '#F0EBD9'; // blanc cassé warm
    const textJour = 'white';
    const textNuit = '#0A1838'; // marine deep pour contraste
    const accent = isDark ? accentNuit : accentJour;
    const txt = isDark ? textNuit : textJour;

    // Parse hex → RGB pour le check "already recolored"
    const ar = parseInt(accent.slice(1, 3), 16);
    const ag = parseInt(accent.slice(3, 5), 16);
    const ab = parseInt(accent.slice(5, 7), 16);

    document.querySelectorAll('button').forEach(btn => {
      // Skip boutons spécifiques qu'on ne touche pas
      if (btn.closest('.leaflet-container')) return; // Leaflet zoom/fullscreen
      if (btn.classList.contains('tab-btn')) return; // Tabs onglets
      if (btn.classList.contains('header-action-btn') || btn.classList.contains('header-unit-btn') || btn.classList.contains('header-mobile-toggle')) return; // B2b-1 — barre du haut gérée par le CSS Aero (chips) ; pas de recoloration noir
      // v0.6.34 — les boutons de la page paramètres sont gérés par refreshParamsState
      // (avec !important) : ne pas les recolorer ici sinon conflit de désélection.
      if (btn.classList.contains('p-speed-btn') || btn.classList.contains('p-dist-btn') || btn.classList.contains('p-theme-btn')) return;
      if (btn.id === 'pdf-btn' || btn.id === 'pin-flight-btn') return;
      if (btn.classList.contains('v0626-notes-title')) return;
      // Skip boutons rouges (destructive : "Tout réinitialiser")
      if (btn.classList.contains('text-red-600') ||
          btn.className.includes('bg-red') ||
          btn.className.includes('text-red')) return;

      const computed = window.getComputedStyle(btn);
      const bg = computed.backgroundColor;
      const rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!rgbMatch) return;
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      const brightness = r + g + b;

      // Très sombre (noir ou quasi-noir) → c'est l'état "sélectionné"
      if (brightness < 60) {
        btn.style.setProperty('background-color', accent, 'important');
        btn.style.setProperty('color', txt, 'important');
        btn.style.setProperty('border-color', 'transparent', 'important');
        btn.dataset.v0630Recolored = '1';
      } else if (btn.dataset.v0630Recolored === '1') {
        // Check si déjà recoloré correctement
        const isOurColor = (r === ar && g === ag && b === ab);
        if (!isOurColor) {
          // L'état a changé (deselect) → on retire nos overrides
          btn.style.removeProperty('background-color');
          btn.style.removeProperty('color');
          btn.style.removeProperty('border-color');
          delete btn.dataset.v0630Recolored;
        }
      }
    });
  }

  // Runs : initial + theme change + click events + periodic safety net
  v0630RecolorBlackButtons();
  setTimeout(v0630RecolorBlackButtons, 300);
  setTimeout(v0630RecolorBlackButtons, 1200);

  // Observer sur changement de classe (toggle jour/nuit)
  try {
    const themeObs = new MutationObserver(() => {
      // Reset les recolorations pour qu'elles se recalculent à la nouvelle teinte
      document.querySelectorAll('button[data-v0630-recolored="1"]').forEach(btn => {
        btn.style.removeProperty('background-color');
        btn.style.removeProperty('color');
        btn.style.removeProperty('border-color');
        delete btn.dataset.v0630Recolored;
      });
      setTimeout(v0630RecolorBlackButtons, 50);
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  } catch (e) { /* noop */ }

  // Click sur n'importe quel bouton → re-check après que le natif ait toggle state
  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
      setTimeout(v0630RecolorBlackButtons, 50);
      setTimeout(v0630RecolorBlackButtons, 250);
    }
  }, true);

  // Périodique safety net (capture changements dynamiques type rebuild de la liste)
  setInterval(v0630RecolorBlackButtons, 2000);

  // Compat alias pour le setInterval existant
  function applyV0612() { v0613NuclearFixAll(); }
  function applyChevronsV0611() { v0613NuclearFixAll(); }

  // ============================================================
  // 🔥 v0.6.34 — FIX #3 : PRÉSERVATION DU SCROLL dans #airspaces-list
  // Quand le code natif rebuild la liste (updateAirspacesOnRoute),
  // le scrollTop revient à 0. On capture la position de scroll en live
  // et on la restaure quand un mutation se produit.
  // ============================================================
  function setupAirspacesScrollPreservation() {
    const list = document.getElementById('airspaces-list');
    if (!list || list.dataset.v0610ScrollHook === '1') return;
    list.dataset.v0610ScrollHook = '1';

    let savedScroll = 0;
    list.addEventListener('scroll', () => {
      if (list.scrollTop > 0) savedScroll = list.scrollTop;
    }, { passive: true });

    const obs = new MutationObserver(() => {
      if (savedScroll > 0 && list.scrollTop === 0) {
        // Le DOM vient de changer et le scroll est reset → restaurer
        requestAnimationFrame(() => {
          list.scrollTop = savedScroll;
        });
      }
    });
    obs.observe(list, { childList: true, subtree: false });
    console.log('[v0.6.34] airspaces-list scroll preservation ✓');
  }
  setTimeout(setupAirspacesScrollPreservation, 800);
  setTimeout(setupAirspacesScrollPreservation, 2500);

  // ============================================================
  // 🔥 v0.6.34 — FIX BLOC BLANC : déballer le wrapper .v0610-footer-pill
  // ----------------------------------------------------------------
  // Bug v0.6.10 : ma fonction wrapFooterTextsInPill avait wrappé le
  // <main> entier dans une pilule blanche (parent commun des 2 textes
  // "Aérodromes : DGAC" et "Données indicatives"). Catastrophique :
  // toute la page se retrouvait sur fond blanc opaque.
  //
  // FIX : déballer ce wrapper erroné au boot, désactiver la fonction.
  // À la place, on applique un fond opaque directement sur les <p> du
  // footer via CSS, sans wrapper englobant.
  // ============================================================
  function v0616UnwrapBrokenFooterPill() {
    document.querySelectorAll('.v0610-footer-pill').forEach(pill => {
      const parent = pill.parentNode;
      if (!parent) return;
      // Move tous les enfants au parent (déballer)
      while (pill.firstChild) {
        parent.insertBefore(pill.firstChild, pill);
      }
      pill.remove();
      console.log('[v0.6.34] Déballé .v0610-footer-pill erroné ✓');
    });
  }
  setTimeout(v0616UnwrapBrokenFooterPill, 100);
  setTimeout(v0616UnwrapBrokenFooterPill, 800);
  setTimeout(v0616UnwrapBrokenFooterPill, 2000);

  // wrapFooterTextsInPill : NO-OP désormais (fonction conservée pour
  // compat avec les anciens setTimeout, mais ne wrap plus rien)
  function wrapFooterTextsInPill() { /* no-op v0.6.34 */ }

  // ============================================================
  // 🔥 v0.6.34 — FIX #8 : ANIMATIONS AU CHANGEMENT DE TAB
  // Mini overlay avion qui glisse de bas-gauche en diagonale + 
  // fade-slide-in du contenu du tab. Style "Apple smooth".
  // ============================================================
  // ============================================================
  // 🔥 v0.6.34 — ANIMATIONS DÉSACTIVÉES
  // Killian a demandé le retrait pour l'instant. CSS + JS neutralisés.
  // ============================================================
  // Pas d'injection de keyframes ni de classes v0610-*.
  // showPlaneOverlay et setupTabAnimationsV0611 sont définis vides
  // au cas où du code restant les appellerait.
  function showPlaneOverlay() { /* no-op v0.6.34 */ }
  function setupTabAnimationsV0611() { /* no-op v0.6.34 */ return true; }

  // ============================================================
  // 🔥 v0.6.34 — FIX #9 : Étendre le filtre harmonizeDetailsChevrons
  // pour ignorer les <details> dans les fiches AD (DÉPART/ARRIVÉE/ÉTAPE)
  // qui ne devraient pas recevoir mon chevron unifié.
  // On override la fonction existante pour ajouter ces exclusions.
  // ============================================================
  if (typeof harmonizeDetailsChevrons === 'function') {
    const _origHarmonize = harmonizeDetailsChevrons;
    window.harmonizeDetailsChevrons = function() {
      document.querySelectorAll('details:not([data-chevron-harmonized])').forEach(det => {
        const summary = det.querySelector('summary');
        if (!summary) return;

        // Skip si imbriqué dans un autre <details>
        if (det.parentElement?.closest('details')) {
          det.dataset.chevronHarmonized = '1';
          return;
        }
        // Skip si dans des sous-blocs où le natif gère déjà
        if (det.closest('#map-controls, #map-container, #ad-cards, #aerodromes-merged-wrapper, .ad-card, [data-ad-card]')) {
          det.dataset.chevronHarmonized = '1';
          return;
        }
        // Skip si le summary contient un lien VAC SIA ou texte "carte vac"
        if (summary.querySelector('a[href*="VAC"], a[href*="vac"], a[href*="sia"]')) {
          det.dataset.chevronHarmonized = '1';
          return;
        }
        const summaryText = (summary.textContent || '').trim().toLowerCase();
        if (/^[▶▼►◀]/.test(summary.textContent.trim())) {
          det.dataset.chevronHarmonized = '1';
          return;
        }
        if (summaryText.includes('carte vac') ||
            summaryText.includes('départ ') || summaryText.includes('depart ') ||
            summaryText.includes('arrivée ') || summaryText.includes('arrivee ') ||
            summaryText.includes('étape ') || summaryText.includes('etape ')) {
          det.dataset.chevronHarmonized = '1';
          return;
        }

        // Sinon, comportement normal (réutilise la logique existante via marquage manuel)
        det.dataset.chevronHarmonized = '1';

        summary.querySelectorAll('.toggle-chevron, .accordion-icon, [data-lucide="chevron-down"]').forEach(el => {
          el.style.display = 'none';
        });

        if (summary.querySelector('.unified-chevron')) return;

        const ch = document.createElement('span');
        ch.className = 'unified-chevron details-chevron';
        ch.innerHTML = '▼';
        if (!det.open) ch.classList.add('collapsed');

        const rightWrapper = Array.from(summary.children).find(c => {
          const cs = window.getComputedStyle(c);
          return cs.display === 'flex' && c !== summary.firstElementChild;
        });
        if (rightWrapper) {
          rightWrapper.appendChild(ch);
        } else {
          summary.appendChild(ch);
        }

        det.addEventListener('toggle', () => {
          if (det.open) ch.classList.remove('collapsed');
          else ch.classList.add('collapsed');
        });
      });
    };
    // Cleanup parasites déjà ajoutés sur fiches AD
    document.querySelectorAll('#ad-cards details .unified-chevron, .ad-card .unified-chevron').forEach(c => c.remove());
    // Re-run avec le nouveau filtre
    window.harmonizeDetailsChevrons();
  }

  // ============================================================
  // BOOT
  // ============================================================
  if (typeof showToast === 'function') {
    showToast('✓ v0.8.25 chargé', 'ok', 3000);
  }
  console.log('[Extensions v0.6.34] Intégration terminée');
})();
