/* ============================================================
   AutogyroDash — extensions v0.6.3
   ------------------------------------------------------------
   Nouveau dans v0.6.3 :
     - Toggle satellite REFAIT : pilule à gauche du label
       "affichage" dans la barre météo. ON cache temp/vent/nuages,
       OFF les restaure.
     - Plein écran météo : overlay top-left avec tous les boutons
       modes visibles et tappables.
     - Brief pré-vol restructuré :
         [AZBA] [NOTAM]    (2 colonnes desktop)
         [Météo] [Windy]   (2 colonnes desktop)
         [Trajet]          (pleine largeur)
     - Dashboard max-width 90vw.
     - Fiche ACFT : suppression redondance immat,
       indicatif radio dans l'espace vide à côté.
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

  console.log('[Extensions v0.6.3] Boot...');

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
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.6.3');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.6.3';
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
  // PAGE RESSOURCES
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
      <div class="text-xs text-muted text-center pt-2">AutogyroDash v0.6.3</div>
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
  // HOOK CLICK TABS
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
  // HISTORIQUE VOLS
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
  // BOUTON ÉPINGLER
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
  // 🔥 FIX #1 — SATELLITE TOGGLE DANS PILULE AFFICHAGE
  // ============================================================
  function setupSatelliteToggleV063() {
    let attempts = 0;
    function tryInit() {
      attempts++;
      if (attempts > 40) { console.warn('[Satellite v0.6.3] Boutons introuvables'); return; }

      const allBtns = Array.from(document.querySelectorAll('button, .tab-btn, [role="tab"], .mode-btn'));
      const modeBtns = allBtns.filter(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return /\b(température|temperature|temp\b|nuages?|cloud|vent|wind)\b/i.test(txt) && txt.length < 30;
      });
      const satelliteBtn = allBtns.find(b => /satellite/i.test((b.textContent || '').trim()) && (b.textContent || '').length < 25);

      if (!satelliteBtn || modeBtns.length < 2) {
        setTimeout(tryInit, 200);
        return;
      }
      if (satelliteBtn.dataset.satToggled === '1') return;
      satelliteBtn.dataset.satToggled = '1';

      // Recherche label "affichage"
      const allTextNodes = Array.from(document.querySelectorAll('span, label, div'));
      const affichageLabel = allTextNodes.find(el => {
        const txt = (el.textContent || '').trim().toLowerCase();
        return (txt === 'affichage' || txt === 'affichage :' || txt === 'mode' || txt === 'mode :') && el.childElementCount === 0;
      });

      // Cache satellite natif
      satelliteBtn.style.display = 'none';

      // Crée toggle
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

      // Insert AVANT le label "affichage"
      let inserted = false;
      if (affichageLabel && affichageLabel.parentNode) {
        affichageLabel.parentNode.insertBefore(toggle, affichageLabel);
        inserted = true;
      } else if (modeBtns[0] && modeBtns[0].parentNode) {
        modeBtns[0].parentNode.insertBefore(toggle, modeBtns[0]);
        inserted = true;
      }
      if (!inserted) return;

      console.log('[Satellite v0.6.3] Toggle inséré');

      let satOn = false;
      function applyState() {
        const badge = document.getElementById('sat-state-badge');
        if (satOn) {
          modeBtns.forEach(b => {
            if (!b.dataset.origDisplay) b.dataset.origDisplay = b.style.display || '';
            b.style.display = 'none';
          });
          if (!satelliteBtn._programmatic) {
            satelliteBtn._programmatic = true;
            satelliteBtn.style.display = '';
            satelliteBtn.click();
            satelliteBtn.style.display = 'none';
            setTimeout(() => { satelliteBtn._programmatic = false; }, 50);
          }
          toggle.style.background = '#15803D';
          toggle.style.borderColor = '#15803D';
          toggle.style.color = 'white';
          if (badge) { badge.textContent = 'ON'; badge.style.background = 'white'; badge.style.color = '#15803D'; }
        } else {
          modeBtns.forEach(b => { b.style.display = b.dataset.origDisplay || ''; });
          if (modeBtns[0] && !modeBtns[0]._programmatic) {
            modeBtns[0]._programmatic = true;
            modeBtns[0].click();
            setTimeout(() => { modeBtns[0]._programmatic = false; }, 50);
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
  setupSatelliteToggleV063();

  // ============================================================
  // FICHE ACFT — Indicatif radio compact (FIX #5)
  // ============================================================
  const ACFT_EXTRA_KEY = 'autogyrodash_acft_extras_v1';
  function loadAcftExtras() { try { return JSON.parse(localStorage.getItem(ACFT_EXTRA_KEY) || '{}'); } catch(e) { return {}; } }
  function saveAcftExtras(data) { try { localStorage.setItem(ACFT_EXTRA_KEY, JSON.stringify(data)); } catch(e) {} }
  function getCurrentAcftSlotId() {
    try {
      if (STATE.acft && STATE.acft.id !== undefined) return String(STATE.acft.id);
      if (STATE.currentAcftSlot !== undefined) return String(STATE.currentAcftSlot);
    } catch(e) {}
    return 'default';
  }

  function injectAcftFields() {
    const acftTab = document.getElementById('tab-acft');
    if (!acftTab) return;
    let immatField = acftTab.querySelector('input[id*="immat" i], input[id*="registr" i], input[placeholder*="JUBA" i]');
    if (!immatField) {
      const labels = Array.from(acftTab.querySelectorAll('label, .text-xs, span, div'));
      const immatLabel = labels.find(el => /^immatriculation/i.test((el.textContent || '').trim()) && (el.textContent || '').length < 30);
      if (immatLabel) {
        const next = immatLabel.parentNode?.querySelector('input');
        if (next) immatField = next;
      }
    }
    if (!immatField) return;

    const immatWrapper = immatField.closest('div');
    if (!immatWrapper) return;
    const parentRow = immatWrapper.parentNode;
    if (!parentRow) return;

    // Supprimer ancien bloc radio v0.6.2 s'il existe
    const oldBlock = acftTab.querySelector('.acft-radio-id-block, .acft-extras-block');
    if (oldBlock) oldBlock.remove();

    if (acftTab.querySelector('.acft-callsign-compact')) return;

    const callsignBlock = document.createElement('div');
    callsignBlock.className = 'acft-callsign-compact';
    callsignBlock.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
    callsignBlock.innerHTML = `
      <label class="text-xs text-muted" style="display:block;">Indicatif radio (call sign à l'antenne)</label>
      <input type="text" id="acft-callsign" class="ad-input" placeholder="Ex: Foxtrot-Juliet-Alpha-Bravo-Charlie" maxlength="60" style="width:100%;" />
      <div class="text-xs text-muted" style="font-size:10px;">Prononcé en arrivant sur fréquence. Sauvegardé pour la fiche active.</div>
    `;

    const parentStyle = window.getComputedStyle(parentRow);
    const isGrid = parentStyle.display === 'grid' || parentStyle.display === 'flex';
    if (isGrid) {
      parentRow.appendChild(callsignBlock);
    } else {
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px;';
      parentRow.insertBefore(grid, immatWrapper);
      grid.appendChild(immatWrapper);
      grid.appendChild(callsignBlock);
    }

    const slotId = getCurrentAcftSlotId();
    const extras = loadAcftExtras();
    const slotData = extras[slotId] || {};
    const callInput = document.getElementById('acft-callsign');
    if (callInput && slotData.callsign) callInput.value = slotData.callsign;

    let debounce;
    function persistBoth() {
      const cur = loadAcftExtras();
      const sid = getCurrentAcftSlotId();
      const immat = (immatField.value || '').toUpperCase().trim();
      const callsign = (callInput?.value || '').trim();
      cur[sid] = { immat, callsign };
      saveAcftExtras(cur);
    }
    callInput?.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(persistBoth, 400); });
    immatField.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(persistBoth, 400); });
  }
  injectAcftFields();
  setInterval(injectAcftFields, 2500);

  window.__getAcftExtras = function() {
    const slotId = getCurrentAcftSlotId();
    const all = loadAcftExtras();
    return all[slotId] || { immat: '', callsign: '' };
  };

  // ============================================================
  // BRIEF — Layout grille (FIX #3)
  // ============================================================
  function injectBriefBlocks() {
    const planTab = document.getElementById('tab-plan');
    if (!planTab) return;
    if (document.getElementById('vfr-checks-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'vfr-checks-wrapper';
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin-bottom:14px;';

    wrapper.innerHTML = `
      <div class="vfr-row-2cols">
        <div class="card vfr-block-azba" style="padding:14px 16px;border-left:4px solid #DC2626;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#DC2626;">⚔️</span><span>AZBA / RTBA</span></h2>
            <span style="font-size:10px;background:#DC2626;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
          </div>
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

        <div class="card vfr-block-notam" style="padding:14px 16px;border-left:4px solid #2563EB;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#2563EB;">📋</span><span>NOTAM</span></h2>
            <span style="font-size:10px;background:#2563EB;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
          </div>
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

      <div id="weather-row" class="vfr-row-2cols">
        <div id="weather-native-anchor" style="display:contents;"></div>
        <div class="card vfr-block-temsi" style="padding:14px 16px;border-left:4px solid #0891B2;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;"><span style="color:#0891B2;">🌧</span><span>Météo visuelle (Windy)</span></h2>
            <button id="windy-layer-toggle" style="font-size:10px;background:#0891B2;color:white;border:none;padding:4px 10px;border-radius:9999px;cursor:pointer;font-weight:600;">CLOUDS</button>
          </div>
          <div style="position:relative;overflow:hidden;border-radius:6px;border:1px solid var(--border);background:var(--muted);">
            <iframe id="windy-iframe" src="https://embed.windy.com/embed2.html?lat=46.5&lon=2.5&detailLat=46.5&detailLon=2.5&width=650&height=380&zoom=5&level=surface&overlay=clouds&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=°C&radarRange=-1" frameborder="0" style="width:100%;height:380px;display:block;border:0;"></iframe>
          </div>
          <p class="text-xs text-muted mt-2 italic">Windy.com (gratuit). TEMSI officielle → Aeroweb.</p>
          <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:4px;font-size:11px;color:#0891B2;text-decoration:underline;">→ TEMSI officielle Aeroweb</a>
        </div>
      </div>
    `;

    const cards = planTab.querySelectorAll('.card');
    const firstCard = cards[0];
    if (firstCard && firstCard.parentNode) {
      firstCard.parentNode.insertBefore(wrapper, firstCard);
    } else {
      planTab.insertBefore(wrapper, planTab.firstChild);
    }

    function relocateNativeWeather() {
      const allCards = planTab.querySelectorAll('.card');
      let nativeWeather = null;
      allCards.forEach(c => {
        if (c === wrapper) return;
        if (c.contains(wrapper)) return;
        const txt = (c.textContent || '').toLowerCase();
        if (/m[ée]t[ée]o g[ée]n[ée]rale/i.test(txt) && c.querySelector('iframe, .leaflet-container, [class*="leaflet"]') !== null) {
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

    const layerToggle = document.getElementById('windy-layer-toggle');
    const iframe = document.getElementById('windy-iframe');
    const layers = ['clouds', 'satellite', 'thunder', 'rain', 'wind'];
    let layerIdx = 0;
    layerToggle?.addEventListener('click', () => {
      layerIdx = (layerIdx + 1) % layers.length;
      const layer = layers[layerIdx];
      layerToggle.textContent = layer.toUpperCase();
      if (iframe) {
        iframe.src = `https://embed.windy.com/embed2.html?lat=46.5&lon=2.5&detailLat=46.5&detailLon=2.5&width=650&height=380&zoom=5&level=surface&overlay=${layer}&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=°C&radarRange=-1`;
      }
    });
  }
  injectBriefBlocks();
  setInterval(() => { if (!document.getElementById('vfr-checks-wrapper')) injectBriefBlocks(); }, 3000);

  // ============================================================
  // RENAME OPENAIP OVERLAY
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
  // NOTAM/WEBCAMS FICHES AD
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
  // 🔥 CSS GLOBAL v0.6.3
  // ============================================================
  const v063Css = document.createElement('style');
  v063Css.id = 'extensions-v0_6_3-css';
  v063Css.textContent = `
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
@media (max-width: 900px) {
  .vfr-row-2cols { grid-template-columns: 1fr; }
}

/* === Bloc Trajet en pleine largeur === */
#tab-plan {
  display: block !important;
}
#tab-plan > * {
  width: 100%;
}
/* Le bloc trajet (qui contient les inputs ad-input ou clear-trip) prend toute la largeur */
#tab-plan .card:has(input[id^="ad-input"]),
#tab-plan .card:has(#clear-trip),
#tab-plan .card:has(#loop-checkbox) {
  width: 100% !important;
  grid-column: 1 / -1 !important;
}

/* === Pas de gradient en mode nuit === */
html.dark .vfr-block-azba,
html.dark .vfr-block-notam,
html.dark .vfr-block-temsi {
  background: var(--card) !important;
}
.vfr-block-azba, .vfr-block-notam, .vfr-block-temsi { background: var(--card); }

/* === ACFT callsign compact === */
.acft-callsign-compact label { font-weight: 500; }

/* === Plein écran météo : satellite toggle flotte === */
body[data-fullscreen-active] #sat-toggle-pill,
.weather-fullscreen #sat-toggle-pill,
.map-fullscreen-wf #sat-toggle-pill {
  position: fixed !important;
  top: 70px !important;
  left: 12px !important;
  z-index: 100000 !important;
  background: rgba(255,255,255,0.95) !important;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
}
html.dark body[data-fullscreen-active] #sat-toggle-pill,
html.dark .weather-fullscreen #sat-toggle-pill,
html.dark .map-fullscreen-wf #sat-toggle-pill {
  background: rgba(0,0,0,0.85) !important;
  color: white !important;
}

#sat-toggle-pill:hover { filter: brightness(1.05); }
  `;
  document.head.appendChild(v063Css);

  // ============================================================
  // BOOT
  // ============================================================
  if (typeof showToast === 'function') {
    showToast('✓ v0.6.3 chargé', 'ok', 3000);
  }
  console.log('[Extensions v0.6.3] Intégration terminée');
})();
