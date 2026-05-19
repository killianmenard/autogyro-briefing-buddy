/* ============================================================
   AutogyroDash — extensions v0.6.22
   ------------------------------------------------------------
   Nouveau dans v0.6.22 (hotfix v0.6.5 — 4 correctifs ciblés) :
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
   webcams fiches AD, lexique SOFIA, AZBA/NOTAM popup, etc.)
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

  console.log('[Extensions v0.6.22] Boot...');

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
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.6.22');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.6.22';
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
    const phenomenes = [['rain','Pluie'],['drizzle','Bruine'],['freezing_rain','Pluie se congelant'],['snow','Neige *'],['showers','Averses *'],['hail','Grêle'],['freezing_fog','Brouillard givrant'],['moderate_icing','Givrage modéré'],['severe_icing','Givrage fort'],['mist','Brume'],['widespread_fog','Brouillard étendu *'],['smoke','Fumée de grande étendue'],['heavy_sand_haze','Forte brume de sable'],['radioactive','Pollutions radioactives'],['volcanic','Éruption volcanique'],['sandstorm','Tempête de sable'],['dry_haze','Brume sèche'],['moderate_turb','Turbulence modérée'],['severe_turb','Turbulence forte'],['squall_line','Ligne de grains forts'],['thunderstorm','Orages'],['mountain_wave','Ondes orographiques'],['tropical_cyclone','Cyclone tropical'],['blowing_snow','Chasse-neige élevé'],['mountain_obscured','Obscurcissement montagnes']];
    const localisations = [['COT','Sur la côte'],['LAN',"À l'intérieur des terres"],['LOC','Localement'],['MAR','En mer'],['MON','Au-dessus des montagnes'],['SFC','En surface'],['VAL','Dans les vallées'],['CIT','À proximité des villes']];
    const phenHtml = phenomenes.map(([kind,label]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);"><div style="flex-shrink:0;width:44px;height:32px;display:flex;align-items:center;justify-content:center;">${temsiSvg(kind)}</div><div style="font-size:12px;line-height:1.3;">${escapeHtml(label)}</div></div>`).join('');
    const locHtml = localisations.map(([code,label]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);"><div style="flex-shrink:0;min-width:44px;text-align:center;"><span style="display:inline-block;padding:3px 8px;background:#1E40AF;color:white;border-radius:4px;font-weight:600;font-size:11px;font-family:ui-monospace,monospace;">${escapeHtml(code)}</span></div><div style="font-size:12px;line-height:1.3;">${escapeHtml(label)}</div></div>`).join('');
    return `
      <p class="text-xs text-muted">Symboles officiels des cartes TEMSI Météo France.</p>
      <h3 class="text-sm font-semibold mt-4 mb-2">⚡ Symboles du temps significatif</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">${phenHtml}</div>
      <p class="text-xs text-muted mt-2 italic">* Symboles non utilisés pour les cartes haute altitude.</p>
      <h3 class="text-sm font-semibold mt-5 mb-2">📍 Codes de localisation</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">${locHtml}</div>
    `;
  }
  function temsiSvg(kind) {
    const C='currentColor';
    const wrap=(inner)=>`<svg viewBox="0 0 36 24" width="36" height="24" xmlns="http://www.w3.org/2000/svg" style="color:var(--foreground);" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    switch(kind){
      case 'rain': return wrap(`<line x1="8" y1="6" x2="4" y2="18"/><line x1="16" y1="6" x2="12" y2="18"/><line x1="24" y1="6" x2="20" y2="18"/>`);
      case 'drizzle': return wrap(`<circle cx="12" cy="12" r="1.5" fill="${C}"/><circle cx="20" cy="14" r="1.5" fill="${C}"/>`);
      case 'freezing_rain': return wrap(`<circle cx="10" cy="10" r="2.5"/><path d="M14 13 Q18 17 22 13"/><line x1="22" y1="13" x2="26" y2="6"/>`);
      case 'snow': return wrap(`<line x1="18" y1="4" x2="18" y2="20"/><line x1="11" y1="8" x2="25" y2="16"/><line x1="11" y1="16" x2="25" y2="8"/>`);
      case 'showers': return wrap(`<path d="M10 16 L18 4 L26 16 Z"/>`);
      case 'hail': return wrap(`<path d="M10 14 L18 4 L26 14 Z"/><line x1="12" y1="18" x2="24" y2="18"/>`);
      case 'freezing_fog': return wrap(`<line x1="6" y1="6" x2="30" y2="6"/><line x1="6" y1="10" x2="30" y2="10"/><line x1="6" y1="14" x2="30" y2="14"/><line x1="14" y1="18" x2="22" y2="22"/><line x1="14" y1="22" x2="22" y2="18"/>`);
      case 'moderate_icing': return wrap(`<path d="M10 12 Q14 6 18 12 Q22 18 26 12"/>`);
      case 'severe_icing': return wrap(`<path d="M10 8 Q14 2 18 8 Q22 14 26 8"/><path d="M10 18 Q14 12 18 18 Q22 24 26 18"/>`);
      case 'mist': return wrap(`<line x1="6" y1="10" x2="30" y2="10"/><line x1="6" y1="14" x2="30" y2="14"/>`);
      case 'widespread_fog': return wrap(`<line x1="6" y1="7" x2="30" y2="7"/><line x1="6" y1="11" x2="30" y2="11"/><line x1="6" y1="15" x2="30" y2="15"/><line x1="6" y1="19" x2="30" y2="19"/>`);
      case 'smoke': return wrap(`<path d="M14 18 Q14 14 18 12 Q22 10 22 6"/><path d="M18 18 Q18 14 22 12 Q26 10 26 6"/>`);
      case 'heavy_sand_haze': return wrap(`<path d="M10 8 Q14 4 18 8 Q22 12 26 8 Q22 14 18 12 Q14 14 10 12 Z"/>`);
      case 'radioactive': return wrap(`<circle cx="18" cy="12" r="3" fill="${C}"/><path d="M18 9 L18 4 M21 13 L26 16 M15 13 L10 16"/>`);
      case 'volcanic': return wrap(`<path d="M8 20 L14 8 L18 14 L22 8 L28 20 Z"/><line x1="14" y1="6" x2="14" y2="2"/><line x1="22" y1="6" x2="22" y2="2"/>`);
      case 'sandstorm': return wrap(`<line x1="6" y1="20" x2="14" y2="6"/><line x1="14" y1="20" x2="22" y2="6"/><line x1="22" y1="20" x2="30" y2="6"/>`);
      case 'dry_haze': return wrap(`<path d="M6 12 Q10 8 14 12 Q18 16 22 12 Q26 8 30 12"/>`);
      case 'moderate_turb': return wrap(`<path d="M8 14 Q12 8 16 14 Q20 20 24 14 Q26 12 28 14"/>`);
      case 'severe_turb': return wrap(`<path d="M6 14 Q10 6 14 14 Q18 22 22 14 Q26 6 30 14" stroke-width="2"/>`);
      case 'squall_line': return wrap(`<line x1="6" y1="12" x2="30" y2="12"/><path d="M10 12 L13 8 L13 16 Z" fill="${C}"/><path d="M20 12 L23 8 L23 16 Z" fill="${C}"/>`);
      case 'thunderstorm': return wrap(`<path d="M14 4 L8 14 L14 14 L10 20 L22 10 L16 10 L20 4 Z" fill="${C}"/>`);
      case 'mountain_wave': return wrap(`<path d="M6 16 Q12 8 18 16 Q24 24 30 16"/>`);
      case 'tropical_cyclone': return wrap(`<path d="M18 6 Q24 6 24 12 Q24 18 18 18 Q12 18 12 12 Q12 6 18 6 Z M18 6 Q22 12 18 18 M18 6 Q14 12 18 18"/>`);
      case 'blowing_snow': return wrap(`<line x1="18" y1="14" x2="18" y2="22"/><line x1="14" y1="16" x2="22" y2="20"/><line x1="14" y1="20" x2="22" y2="16"/><path d="M6 8 Q12 4 18 8 Q24 12 30 8"/>`);
      case 'mountain_obscured': return wrap(`<path d="M4 20 L12 10 L20 16 L28 8 L34 20 Z" fill="${C}"/>`);
      default: return wrap(`<text x="18" y="18" text-anchor="middle" font-size="14" fill="${C}">?</text>`);
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
    return `
      <p class="text-xs text-muted mb-3">L'app agrège plusieurs sources officielles et open data.</p>
      <div class="space-y-3 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">✈️ Aérodromes officiels (447)</h3><p class="text-xs">Source : <strong>DGAC</strong> via PIAF.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (764)</h3><p class="text-xs">Source : <strong>BASULM</strong> — FFPLUM.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP / NOTAM</h3><p class="text-xs">Source : <strong>SIA</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📖 Sigles aéronautiques (670)</h3><p class="text-xs">Source : <strong>SOFIA</strong> — DGAC.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3><p class="text-xs">METAR/TAF : <strong>aviationweather.gov</strong>. Visuel : <strong>Windy.com</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3><p class="text-xs">Source : <strong>OpenAIP</strong>.</p></div>
      </div>
      <div class="text-xs text-muted text-center pt-2">AutogyroDash v0.6.22</div>
    `;
  }
  function setupResourcesNav() {
    const section = document.getElementById('tab-resources');
    if (!section) return;
    const setActive = (sub) => {
      section.querySelectorAll('.res-subtab').forEach(b => {
        const active = b.dataset.sub === sub;
        b.style.borderBottomColor = active ? 'var(--foreground)' : 'transparent';
        b.style.fontWeight = active ? '600' : '400';
        b.style.color = active ? 'var(--foreground)' : 'var(--muted-foreground)';
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
      const pts = item.points;
      const max = Math.min(pts.length, 5);
      for (let i = 0; i < max; i++) {
        const p = pts[i];
        let ad;
        if (p.isBasulm) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, isBasulm: true, basulm: p.basulm, metarStation: null };
        else { ad = AERODROMES_ALL.find(a => a.icao === p.icao); if (!ad) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, metarStation: p.metarStation }; }
        let slotIdx;
        if (i === 0) slotIdx = 0;
        else if (i === pts.length - 1 && !item.loop) slotIdx = 4;
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

      console.log('[Satellite v0.6.22] Toggle inséré en première position ✓');

      let satOn = false;
      // 🔥 v0.6.22 : tracker explicitement l'état du satellite natif
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

          // 🔥 v0.6.22 : DÉSACTIVER explicitement le satellite natif
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
        <div class="card vfr-block-temsi collapsible-block" data-collapse-key="windy" style="padding:14px 16px;border-left:4px solid #0891B2;">
          <div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#0891B2;">🌧</span><span>Météo visuelle (Windy)</span></h2>
            <div style="display:flex;align-items:center;gap:6px;">
              <button id="windy-layer-toggle" style="font-size:10px;background:#0891B2;color:white;border:none;padding:4px 10px;border-radius:9999px;cursor:pointer;font-weight:600;">CLOUDS</button>
              <button class="collapse-chevron unified-chevron" type="button" title="plier / déplier">▼</button>
            </div>
          </div>
          <div class="collapsible-content">
            <div style="position:relative;overflow:hidden;border-radius:6px;border:1px solid var(--border);background:var(--muted);">
              <iframe id="windy-iframe" src="https://embed.windy.com/embed2.html?lat=46.5&lon=2.5&detailLat=46.5&detailLon=2.5&width=650&height=380&zoom=5&level=surface&overlay=clouds&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=°C&radarRange=-1" frameborder="0" style="width:100%;height:380px;display:block;border:0;"></iframe>
            </div>
            <p class="text-xs text-muted mt-2 italic">Windy.com (gratuit). TEMSI officielle → Aeroweb.</p>
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

    // Toggle Windy layer
    const layerToggle = document.getElementById('windy-layer-toggle');
    const iframe = document.getElementById('windy-iframe');
    const layers = ['clouds', 'satellite', 'thunder', 'rain', 'wind'];
    let layerIdx = 0;
    layerToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      layerIdx = (layerIdx + 1) % layers.length;
      const layer = layers[layerIdx];
      layerToggle.textContent = layer.toUpperCase();
      if (iframe) {
        iframe.src = `https://embed.windy.com/embed2.html?lat=46.5&lon=2.5&detailLat=46.5&detailLon=2.5&width=650&height=380&zoom=5&level=surface&overlay=${layer}&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=°C&radarRange=-1`;
      }
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

    // Ordre final souhaité (v0.6.22 — AZBA/NOTAM passe après zones aériennes)
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

    // 🔥 v0.6.22 : masquer wf-row-azba-notam tant que pas de trajet validé
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

    // 🔥 v0.6.22 : DÉSACTIVÉ — makeNativeBlockCollapsible cassait l'affichage
    // de #airspaces-section et #trip-summary (wrap natif + content invisible).
    // Remplacé par addAbsoluteChevronToCard() qui pose juste un chevron en
    // position absolute sans toucher au DOM natif.
    // makeNativeBlockCollapsible(airspacesSection, 'zones-aer', 'zones aériennes traversées');
    // makeNativeBlockCollapsible(tripSummary, 'resume-trajet', 'résumé du trajet');
    // Note : on NE plie PAS #map-container (Leaflet casserait)

    // 🔥 FIX #A v0.6.22 : Fusion overlays-carte + map-container en "Carte des aérodromes"
    mergeMapBlocksIntoOneCard();

    // 🔥 FIX #B v0.6.22 : Harmoniser les chevrons des <details> natifs
    harmonizeDetailsChevrons();

    // Réinvalider les cartes Leaflet après reorganisation (display:flex peut perturber)
    setTimeout(() => {
      try { if (typeof map !== 'undefined' && map?.invalidateSize) map.invalidateSize(); } catch(e) {}
      try { if (typeof weatherFranceMap !== 'undefined' && weatherFranceMap?.invalidateSize) weatherFranceMap.invalidateSize(); } catch(e) {}
    }, 200);
  }

  // ============================================================
  // 🔥 FIX #A v0.6.22 — FUSION overlays-carte + map-container
  // En un seul bloc "Carte des aérodromes" avec UN header + UN chevron
  // ============================================================
  function mergeMapBlocksIntoOneCard() {
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

    console.log('[v0.6.22] Carte aérodromes fusionnée ✓');
  }

  // ============================================================
  // 🔥 FIX #B v0.6.22 — HARMONISATION DES CHEVRONS NATIFS
  // Remplace les <i lucide chevron-down> et .accordion-icon
  // par un chevron uniforme au même style que les autres
  // ============================================================
  function harmonizeDetailsChevrons() {
    document.querySelectorAll('details:not([data-chevron-harmonized])').forEach(det => {
      const summary = det.querySelector('summary');
      if (!summary) return;

      // 🔥 FIX v0.6.22 : skip les sous-<details> imbriqués pour ne pas
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

    // 🔥 v0.6.22 : si `el` contient une seule .card enfant direct,
    // opérer sur cette .card au lieu de `el` (cas #trip-summary et #airspaces-section)
    let target = el;
    if (el.children.length === 1 && el.firstElementChild?.classList?.contains('card')) {
      target = el.firstElementChild;
    }

    // 🔥 NETTOYAGE IDEMPOTENT v0.6.22 :
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

  injectBriefBlocksV065();
  setInterval(() => {
    if (!document.getElementById('vfr-checks-wrapper-v065')) {
      injectBriefBlocksV065();
    } else {
      // 🔥 v0.6.22 : appels makeNativeBlockCollapsible désactivés (cassaient l'affichage)
      // Remplacés par addAbsoluteChevronToCard via applyChevronsV0611 (non-destructif)
      if (typeof applyChevronsV0611 === 'function') {
        try { applyChevronsV0611(); } catch (e) {}
      }
      // Re-tenter fusion map au cas où le DOM aurait été modifié
      if (!document.getElementById('aerodromes-merged-wrapper')) {
        mergeMapBlocksIntoOneCard();
      }
      wireCollapsibles();
      harmonizeDetailsChevrons();
    }
  }, 3000);

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

  // 🔥 v0.6.22 : VISIBILITÉ DÉFENSIVE des blocs zones aériennes + AZBA/NOTAM
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

  // 🔥 v0.6.22 — DIAGNOSTIC console (à invoquer manuellement)
  // Tape dans la console : window.__diagBriefing()
  window.__diagBriefing = function() {
    const { count, total } = v0618CountFilledTripInputs();
    const inputs = v0618FindTripInputs();
    const sec = document.getElementById('airspaces-section');
    const wfRow = document.getElementById('wf-row-azba-notam');
    const report = {
      version: 'v0.6.22',
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
    console.log('=== DIAG v0.6.22 ===', report);
    return report;
  };

  // 🔥 v0.6.22 — DIAGNOSTIC SPACING (mesure les vrais gaps visuels)
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

  // 🔥 v0.6.22 — HIDE EMPTY FLEX CHILDREN
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
        console.log(`[v0.6.22] Wrapper vide caché (gap fantôme évité) : ${c.id || c.tagName.toLowerCase() + '.' + c.className.slice(0, 30)}`);
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
  // 🔥 v0.6.22 — FOOTER TEXTE BASCULÉ SOUS BLOC HISTORIQUE
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
    const tabHistory = document.getElementById('tab-history');
    if (!tabHistory) return;

    // 1. Détecter si l'onglet historique est actuellement visible
    const isHistoryVisible = !tabHistory.classList.contains('hidden') &&
                             getComputedStyle(tabHistory).display !== 'none';

    // 2. Construire la liste des éléments natifs "Aérodromes/Données indicatives" à cacher
    // 🔥 v0.6.22 : approche élargie — on couvre <p>, <div>, <span>, <small>, ET le
    // <footer> parent (si le natif les a regroupés dans un <footer>).
    const toToggle = new Set();

    // Paragraphes/divs/spans/small qui matchent directement le texte
    document.querySelectorAll('p, div, span, small').forEach(el => {
      if (el.classList.contains('v0618-hist-footer-text')) return;
      if (el.closest('.v0618-hist-footer-text')) return;
      if (el.closest('[id^="tab-"]')) return; // dans une tab → laisser
      const txt = (el.textContent || '').trim();
      const isFooter = (txt.startsWith('Aérodromes :') && txt.includes('DGAC')) ||
                       (txt.startsWith('Données indicatives') && txt.includes('pilote'));
      if (isFooter && txt.length < 600) {
        toToggle.add(el);
      }
    });

    // <footer> qui contient ces textes (même indirect)
    document.querySelectorAll('footer').forEach(footer => {
      if (footer.closest('[id^="tab-"]')) return;
      const txt = (footer.textContent || '').trim();
      if (txt.includes('Aérodromes :') && txt.includes('DGAC') &&
          txt.includes('Données indicatives') && txt.length < 1000) {
        toToggle.add(footer);
      }
    });

    // <main> ou autre conteneur direct ayant CES DEUX phrases et peu d'enfants
    document.querySelectorAll('main > div, body > div, main > section, body > section, main > aside').forEach(el => {
      if (el.id && el.id.startsWith('tab-')) return;
      if (el.classList.contains('v0618-hist-footer-text')) return;
      if (el.children.length > 8) return;
      const txt = (el.textContent || '').trim();
      if (txt.includes('Aérodromes :') && txt.includes('DGAC') &&
          txt.includes('Données indicatives') && txt.length < 600) {
        toToggle.add(el);
      }
    });

    // 3. Apply hide/show
    toToggle.forEach(el => {
      if (isHistoryVisible) {
        if (el.dataset.v0618FooterHidden !== '1') {
          el.dataset.v0618FooterOrigDisplay = el.style.display || '__empty__';
          el.style.setProperty('display', 'none', 'important');
          el.dataset.v0618FooterHidden = '1';
        }
      } else {
        if (el.dataset.v0618FooterHidden === '1') {
          const orig = el.dataset.v0618FooterOrigDisplay;
          if (orig === '__empty__') el.style.removeProperty('display');
          else el.style.display = orig;
          delete el.dataset.v0618FooterHidden;
          delete el.dataset.v0618FooterOrigDisplay;
        }
      }
    });

    // 4. Garantir la présence de mon footer inside #tab-history
    if (!tabHistory.querySelector('.v0618-hist-footer-text')) {
      const footerEl = document.createElement('div');
      footerEl.className = 'v0618-hist-footer-text';
      footerEl.style.cssText = 'padding: 24px 16px 16px; color: #4b5563; font-size: 0.78rem; line-height: 1.6; text-align: center;';
      footerEl.innerHTML = '<p>Aérodromes : <strong>DGAC</strong>. Plateformes ULM : <strong>BASULM / FFPLUM</strong>. Météo : aviationweather.gov, open-meteo.com. Espaces aériens : OpenAIP. Voir l\'onglet <a href="javascript:void(0)" class="v0618-link-sources" style="color: #2563eb; text-decoration: underline;">sources</a> pour le détail.</p><p style="margin-top: 6px;">Données indicatives — le pilote reste seul responsable de la vérification SIA / METAR / TAF / NOTAM / AZBA avant chaque vol.</p>';
      tabHistory.appendChild(footerEl);

      // Wire le lien "sources" → switch sur l'onglet ressources
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
  setTimeout(v0618HandleHistoriqueFooter, 300);
  setTimeout(v0618HandleHistoriqueFooter, 1500);
  setTimeout(v0618HandleHistoriqueFooter, 3000);
  setInterval(v0618HandleHistoriqueFooter, 1500);

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
  // NOTAM/WEBCAMS FICHES AD (inchangé v0.6.4)
  // ============================================================
  const WEBCAMS = {
    'LFLB': { url: 'https://www.aeroport-chambery.com/webcam/', label: 'Webcam Chambéry-Aix', source: 'Aéroport Chambéry' },
    'LFLI': { url: 'https://www.annemasse-aeroport.com/', label: 'Webcam Annemasse', source: 'AC Annemasse' },
    'LFLU': { url: 'https://www.aerodrome-valence.com/', label: 'Webcam Valence Chabeuil', source: 'AC Valence' },
    'LFNA': { url: 'https://www.aerogap.com/webcam/', label: 'Webcam Gap-Tallard', source: 'Aérogap' },
    'LFMD': { url: 'https://www.cannes.aeroport.fr/', label: 'Webcam Cannes Mandelieu', source: 'CCI Cannes' },
    'LFMN': { url: 'https://www.nice.aeroport.fr/', label: 'Webcam Nice Côte d\'Azur', source: 'Aéroport Nice' },
    'LFKJ': { url: 'https://www.2a.cci.fr/aeroport-ajaccio/', label: 'Webcam Ajaccio', source: 'CCI 2A' },
    'LFLP': { url: 'https://www.annecy.aeroport.fr/', label: 'Webcam Annecy Meythet', source: 'Aéroport Annecy' },
    'LFLY': { url: 'https://www.lyonaeroports.com/', label: 'Webcam Lyon Bron', source: 'Lyon Aéroports' },
    'LFMP': { url: 'https://www.aeroport-perpignan.com/', label: 'Webcam Perpignan', source: 'CCI Perpignan' },
    'LFMV': { url: 'https://www.avignon.aeroport.fr/', label: 'Webcam Avignon Caumont', source: 'CCI Vaucluse' },
    'LFKC': { url: 'https://www.2b.cci.fr/Aeroport-Calvi-Sainte-Catherine.html', label: 'Webcam Calvi', source: 'CCI 2B' },
    'LFMH': { url: 'https://www.saint-etienne.aeroport.fr/', label: 'Webcam Saint-Étienne', source: 'Aéroport Saint-Étienne' }
  };
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
      const webcam = WEBCAMS[ad.icao];
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
      if (webcam) {
        html += `<div class="mt-2 pt-2 border-t border-thin"><a href="${webcam.url}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#FEF3C7;border-radius:4px;text-decoration:none;color:#92400E;"><span style="font-size:14px;">📹</span><span style="flex:1;"><strong>${escapeHtml(webcam.label)}</strong></span><span>→</span></a></div>`;
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
/* === Dashboard 90vw === */
body > main,
body main {
  max-width: 90vw !important;
  width: 90vw !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body > header, body header { max-width: 100% !important; }

/* === Grid 2 colonnes pour les rangées du brief === */
.vfr-row-2cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: stretch;
}
/* 🔥 FIX #C v0.6.22 : sur la row Zones aériennes | Notes Pilote,
   ne pas étirer les blocs à la même hauteur — la liste a son propre scroll */
/* 🔥 v0.6.22 : Sur la row Zones aériennes | Notes Pilote,
   on remet stretch pour que les 2 blocs aient des proportions harmonisées.
   Le scroll interne de la liste reste actif. */
#wf-row-zones-notes {
  align-items: stretch !important;
}
#wf-row-zones-notes > * {
  display: flex;
  flex-direction: column;
}
@media (max-width: 900px) {
  .vfr-row-2cols { grid-template-columns: 1fr; }
}

/* === tab-plan en flex column UNIQUEMENT quand visible === */
#tab-plan:not(.hidden) {
  display: flex !important;
  flex-direction: column !important;
  gap: 22px !important;
}
/* 🔥 v0.6.22 : wrapper interne vfr-checks-wrapper-v065 doit avoir le MÊME gap
   que #tab-plan, sinon les gaps internes (14px inline) diffèrent des externes (22px) */
#vfr-checks-wrapper-v065 {
  gap: 22px !important;
}
#tab-plan > * {
  width: 100% !important;
  max-width: 100% !important;
}
/* Bloc trajet pleine largeur */
#tab-plan .card:has(input[id^="ad-input"]),
#tab-plan .card:has(#clear-trip),
#tab-plan .card:has(#loop-checkbox) {
  width: 100% !important;
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

/* === 🔥 CHEVRON UNIFIÉ v0.6.22 ===
   Tous les chevrons (blocs custom + blocs natifs + <details>)
   utilisent la même classe .unified-chevron pour un rendu identique */
.unified-chevron {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 14px;
  line-height: 1;
  color: var(--foreground);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.15s;
  margin-left: auto !important;
  flex-shrink: 0;
  user-select: none;
  padding: 0;
  /* 🔥 v0.6.22 : visibilité renforcée */
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 2;
}
/* En dark mode, force le blanc (sans s'appuyer sur --foreground qui pourrait être noir) */
html.dark .unified-chevron {
  color: #ffffff !important;
}
.unified-chevron:hover {
  background: rgba(0, 0, 0, 0.06);
}
html.dark .unified-chevron:hover {
  background: rgba(255, 255, 255, 0.08);
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

/* === 🔥 FIX #C v0.6.22 — Zones aériennes scroll interne ===
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

/* === Carte aérodromes fusionnée (v0.6.22) ===
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
  // 🔥 v0.6.22 — FIX METAR : cleanup cache pollué + timeout wrapper
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
        console.log(`[v0.6.22] METAR cache cleanup : ${fixed} repaired, ${removed} removed ✓`);
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
      console.log('[METAR v0.6.22] timeout-wrapped (12s max) ✓');
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

      console.log('[METAR v0.6.22] fetchMetar patché : Promise.any + 5s + stale-while-revalidate ✓');
    }
    _tryPatch();
  })();
  */
  // Fin de l'ancien patch METAR désactivé.

  // ============================================================
  // 🌤️ FOND CIEL + NUAGES v0.6.22 (mode jour uniquement)
  // SVG inline en data URL = 0 fichier à héberger, vectoriel, ~1 KB.
  // Les .card restent opaques pour passer par-dessus avec un léger
  // box-shadow pour les faire "flotter". Mode nuit inchangé.
  // ============================================================
  const skyBgCss = document.createElement('style');
  skyBgCss.id = 'extensions-v0_6_10-sky-bg';
  skyBgCss.textContent = `
html:not(.dark) body {
  background-color: #71CCEE;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 170' width='280' height='170'><g fill='white'><ellipse cx='50' cy='45' rx='20' ry='6'/><circle cx='42' cy='42' r='7'/><circle cx='52' cy='38' r='9'/><circle cx='62' cy='42' r='7'/><ellipse cx='210' cy='45' rx='20' ry='6'/><circle cx='202' cy='42' r='7'/><circle cx='212' cy='38' r='9'/><circle cx='222' cy='42' r='7'/><ellipse cx='130' cy='125' rx='20' ry='6'/><circle cx='122' cy='122' r='7'/><circle cx='132' cy='118' r='9'/><circle cx='142' cy='122' r='7'/><ellipse cx='-10' cy='125' rx='20' ry='6'/><circle cx='-18' cy='122' r='7'/><circle cx='-8' cy='118' r='9'/><circle cx='2' cy='122' r='7'/><ellipse cx='290' cy='125' rx='20' ry='6'/><circle cx='282' cy='122' r='7'/><circle cx='292' cy='118' r='9'/><circle cx='302' cy='122' r='7'/></g></svg>");
  background-size: 280px 170px;
  background-repeat: repeat;
  background-attachment: fixed;
}

/* 🔥 v0.6.22 : FORCE TRANSPARENCE ULTRA-AGRESSIVE sur tous les conteneurs
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

/* 🔥 v0.6.22 : Si un wrapper invisible enveloppe le contenu et a un fond
   blanc, on le rend transparent. Mais on garde les .card visibles. */
html:not(.dark) body > div:not(.card):not([id]):not(.v0610-footer-pill) {
  background: transparent !important;
  background-color: transparent !important;
}

/* 🔥 v0.6.22 : Le gap entre blocs est géré UNIQUEMENT par le gap flex
   de #tab-plan (14px, défini ligne 1495). On ne rajoute PAS de margin-bottom
   ici, sinon ça s'additionne (28px effectif → gap TRAJET trop grand). */
html:not(.dark) #tab-plan > * {
  margin-bottom: 0;
}
html:not(.dark) #tab-plan > *:last-child {
  margin-bottom: 0;
}

/* Les cards passent au-dessus du ciel : opaques + ombrage doux */
html:not(.dark) .card {
  background-color: #ffffff !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* 🔥 v0.6.22 : Header pilule SANS flou, MAIS sans rectangle blanc moche.
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

/* 🔥 v0.6.22 : footer (Sources / Données indicatives) - style ciblé
   sur le footer natif <footer> directement, sans wrapper pilule
   (qui causait le bug du fond blanc sur toute la page).
   Le footer natif est <footer class="fixed bottom-0 left-0 right-0 ...">. */
html:not(.dark) body > footer p,
html:not(.dark) body > footer .text-xs.text-muted {
  /* Le footer natif a déjà son fond, on ne le change pas */
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
  // 🔥 v0.6.22 — FIX #1 : Légende météo France décalée à droite
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
  // 🔥 v0.6.22 — FIX #2 : RECONSTRUCTION RADICALE des sections
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

    console.log('[v0.6.22] airspaces-section rebuild ✓');
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

    console.log('[v0.6.22] trip-summary rebuild ✓');
  }

  // 🔥 v0.6.22 : APPROCHE NUCLÉAIRE pour le doublon de titre.
  // On cherche le h2 natif PAR ICÔNE (shield-alert pour airspaces),
  // on trouve sa card englobante, on APLATIT toute card imbriquée AU-DESSUS,
  // on supprime les h2 dupliqués sans icon, et on pose un chevron inline.

  function v0613FlattenAndChevron(section, key, iconLucide, titleRegex) {
    if (!section) return;

    // 🔥 v0.6.22 : TRANSMUTATION RADICALE.
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
        console.log(`[v0.6.22] Removed <summary> doublon dans #${section.id}`);
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
      console.log(`[v0.6.22] Transmuté <details> en <div> dans #${section.id} ✓`);
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
          console.log(`[v0.6.22] Suppression doublon titre sans icon dans #${section.id}`);
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

    // 🔥 v0.6.22 — CLEANUP IDEMPOTENT (toujours, AVANT le check v0614Done)
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
      // 🔥 v0.6.22 : Check basé sur le chevron sécurisé (préservé par cleanup)
      // Si présent → tout est bon, on sort proprement (PAS de boucle).
      // Si absent → on continue pour ré-installer.
      if (safeChev && existingHeader && existingHeader.contains(safeChev)) {
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

    // 🔥 v0.6.22 BUG FIX CRITIQUE : TOUJOURS ajouter la classe .v0614-header
    // au header CHOISI (même si on a réutilisé une flex row du natif).
    // Sans cette classe, l'itération suivante du cleanup ne peut pas identifier
    // le header → retire MON chevron → re-crée → cycle infini (100+ logs).
    header.classList.add('v0614-header');

    // 8. Ajouter le chevron à la fin du header (style NOTAM inline)
    const chev = document.createElement('button');
    chev.className = 'unified-chevron v0614-chev';
    chev.type = 'button';
    chev.title = 'plier / déplier';
    chev.innerHTML = '▼';
    header.appendChild(chev);

    // 🔥 v0.6.22 : Cleanup ciblé UNIQUEMENT sur triangles chevron
    // (PAS de "+", "-", "−", "–", "—", "─", "━" qui matchaient des badges
    //  natifs légitimes — causaient les zones non chargées en v0.6.21)
    nativeCard.querySelectorAll('.unified-chevron, .block-chev').forEach(c => {
      if (c !== chev && !header.contains(c)) {
        c.remove();
        console.log(`[v0.6.22] Chevron .unified-chevron/.block-chev parasite retiré dans #${section.id}`);
      }
    });
    // Tout élément feuille avec UN seul caractère triangulaire chevron hors header
    nativeCard.querySelectorAll('*').forEach(el => {
      if (header.contains(el)) return;
      if (el.children.length > 0) return; // pas les conteneurs
      const skipTags = ['INPUT', 'TEXTAREA', 'SVG', 'PATH', 'STYLE', 'SCRIPT', 'LINK', 'META', 'OPTION'];
      if (skipTags.includes(el.tagName)) return;
      const txt = (el.textContent || '').trim();
      if (txt.length === 0 || txt.length > 2) return;
      // SEULS triangles chevron (sans "+" ni tirets pour éviter de casser zones)
      if (/^[▼▾▽▿⌃⌄⏷⏶▲▴△▵⏵⏴▶◀▸◂➤➡˅˄﹀⮟⮝]$/.test(txt)) {
        console.log(`[v0.6.22] Élément <${el.tagName.toLowerCase()}> "${txt}" retiré dans #${section.id}`);
        el.remove();
      }
    });
    // Cleanup <summary> résiduels
    nativeCard.querySelectorAll('summary').forEach(s => s.remove());

    // 9. Wire toggle
    function getContent() {
      return Array.from(nativeCard.children).filter(el => el !== header);
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
    console.log(`[v0.6.22] Chevron inline ajouté à #${section.id} ✓`);
  }

  function v0613NuclearFixAll() {
    const ass = document.getElementById('airspaces-section');
    if (ass) v0613FlattenAndChevron(ass, 'zones-aer', 'shield-alert', /zones.*aériennes.*traversées/i);
    const ts = document.getElementById('trip-summary');
    if (ts) v0613FlattenAndChevron(ts, 'resume-trajet', null, /résumé.*du.*trajet/i);
  }
  setTimeout(v0613NuclearFixAll, 400);
  setTimeout(v0613NuclearFixAll, 1200);
  setTimeout(v0613NuclearFixAll, 2500);
  setTimeout(v0613NuclearFixAll, 4500);
  setTimeout(v0613NuclearFixAll, 7000);
  // 🔥 v0.6.22 : Surveillance permanente : si le natif re-render et vire
  // mon chevron, on le ré-installe automatiquement
  setInterval(v0613NuclearFixAll, 3000);

  // Compat alias pour le setInterval existant
  function applyV0612() { v0613NuclearFixAll(); }
  function applyChevronsV0611() { v0613NuclearFixAll(); }

  // ============================================================
  // 🔥 v0.6.22 — FIX #3 : PRÉSERVATION DU SCROLL dans #airspaces-list
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
    console.log('[v0.6.22] airspaces-list scroll preservation ✓');
  }
  setTimeout(setupAirspacesScrollPreservation, 800);
  setTimeout(setupAirspacesScrollPreservation, 2500);

  // ============================================================
  // 🔥 v0.6.22 — FIX BLOC BLANC : déballer le wrapper .v0610-footer-pill
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
      console.log('[v0.6.22] Déballé .v0610-footer-pill erroné ✓');
    });
  }
  setTimeout(v0616UnwrapBrokenFooterPill, 100);
  setTimeout(v0616UnwrapBrokenFooterPill, 800);
  setTimeout(v0616UnwrapBrokenFooterPill, 2000);

  // wrapFooterTextsInPill : NO-OP désormais (fonction conservée pour
  // compat avec les anciens setTimeout, mais ne wrap plus rien)
  function wrapFooterTextsInPill() { /* no-op v0.6.22 */ }

  // ============================================================
  // 🔥 v0.6.22 — FIX #8 : ANIMATIONS AU CHANGEMENT DE TAB
  // Mini overlay avion qui glisse de bas-gauche en diagonale + 
  // fade-slide-in du contenu du tab. Style "Apple smooth".
  // ============================================================
  // ============================================================
  // 🔥 v0.6.22 — ANIMATIONS DÉSACTIVÉES
  // Killian a demandé le retrait pour l'instant. CSS + JS neutralisés.
  // ============================================================
  // Pas d'injection de keyframes ni de classes v0610-*.
  // showPlaneOverlay et setupTabAnimationsV0611 sont définis vides
  // au cas où du code restant les appellerait.
  function showPlaneOverlay() { /* no-op v0.6.22 */ }
  function setupTabAnimationsV0611() { /* no-op v0.6.22 */ return true; }

  // ============================================================
  // 🔥 v0.6.22 — FIX #9 : Étendre le filtre harmonizeDetailsChevrons
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
    showToast('✓ v0.6.22 chargé', 'ok', 3000);
  }
  console.log('[Extensions v0.6.22] Intégration terminée');
})();
