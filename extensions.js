/* ============================================================
   AutogyroDash — extensions v0.6.1 (Sprint 2 polish)
   ------------------------------------------------------------
   Nouveau dans v0.6.1 :
     - Lexique sigles SOFIA (670 entrées) + barre recherche
     - Symboles TEMSI Météo France (légende complète)
     - Bouton "épingler" en pilule compacte
     - Mode satellite : cache nuages/vent/temp auto
     - Fiche ACFT : immat F-XXXX + indicatif radio (persistés)
     - Blocs AZBA + NOTAM en haut du brief pré-vol
     - Bouton raccourci supaip.fr
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

  console.log('[Extensions v0.6.1] Boot...');

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function hideAllTabs() {
    document.getElementById('tab-plan')?.classList.add('hidden');
    document.getElementById('tab-acft')?.classList.add('hidden');
    document.getElementById('tab-sources')?.classList.add('hidden');
    document.getElementById('tab-params')?.classList.add('hidden');
    document.getElementById('tab-resources')?.classList.add('hidden');
    document.getElementById('tab-history')?.classList.add('hidden');
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

  // Bump version DOM
  try {
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.6.1');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.6.1';
    });
  } catch (e) {}

  // ============================================================
  // CHARGEMENT DES SIGLES SOFIA (670 entrées)
  // ============================================================
  const SIGLES_CACHE_KEY = 'autogyrodash_sigles_v1';
  const SIGLES_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 jours

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
    } catch (e) {
      console.warn('[Sigles] Load failed, using fallback', e);
      // Fallback : sigles essentiels seulement
      return [
        {s:'METAR', d:"Message d'observation météorologique régulière pour l'aviation"},
        {s:'TAF', d:"Terminal Aerodrome Forecast — prévision météo locale"},
        {s:'NOTAM', d:"Avis aux navigateurs aériens"},
        {s:'VFR', d:"Règles de vol à vue"},
        {s:'QNH', d:"Calage altimétrique pour lire l'altitude au-dessus du niveau de la mer"}
      ];
    }
  }
  const SIGLES = await loadSigles();
  console.log(`[Sigles] ${SIGLES.length} sigles chargés`);

  // ============================================================
  // 1. PAGE RESSOURCES REFONDUE (5 sous-onglets)
  // ============================================================
  function replaceSourcesWithResources() {
    // Repérage du tab existant : peut être déjà "resources" (v0.6.0) ou "sources" (versions < v0.6.0)
    let resourcesTab = document.querySelector('.tab-btn[data-tab="resources"]');
    let resourcesSection = document.getElementById('tab-resources');
    if (!resourcesTab) {
      // Fallback : reprendre l'ancien "sources"
      resourcesTab = document.querySelector('.tab-btn[data-tab="sources"]');
      resourcesSection = document.getElementById('tab-sources');
      if (resourcesTab) {
        resourcesTab.textContent = 'ressources';
        resourcesTab.dataset.tab = 'resources';
      }
      if (resourcesSection) resourcesSection.id = 'tab-resources';
    }
    if (!resourcesTab || !resourcesSection) return;
    resourcesTab.textContent = 'ressources';

    resourcesSection.innerHTML = buildResourcesHtml();
    setupResourcesNav();
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
    // Génère le HTML avec une barre de recherche + table filtrable
    return `
      <p class="text-xs text-muted">Glossaire officiel des sigles aéronautiques (source : SOFIA, DGAC — ${SIGLES.length} sigles). Indispensable pour décoder METAR, NOTAM, VAC, AIP.</p>
      <div style="margin-top:12px;position:sticky;top:0;background:var(--card);padding:8px 0;z-index:5;">
        <input type="search" id="sigles-search" placeholder="🔍 Rechercher un sigle (ex: NOTAM, QNH, AZBA...)"
               class="ad-input w-full" style="width:100%;font-size:14px;"
               autocomplete="off" autocapitalize="characters" />
        <div id="sigles-count" class="text-xs text-muted mt-1">${SIGLES.length} sigles disponibles</div>
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead style="position:sticky;top:0;background:var(--muted);z-index:4;">
            <tr>
              <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);width:90px;">Sigle</th>
              <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);">Définition (FR / EN)</th>
            </tr>
          </thead>
          <tbody id="sigles-tbody">
            ${buildSiglesRows(SIGLES)}
          </tbody>
        </table>
      </div>
    `;
  }

  function buildSiglesRows(items) {
    if (!items.length) {
      return `<tr><td colspan="2" style="padding:16px;text-align:center;color:var(--muted-foreground);font-size:12px;">Aucun sigle ne correspond à ta recherche.</td></tr>`;
    }
    return items.map(it => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;font-weight:600;white-space:nowrap;vertical-align:top;font-family:ui-monospace,monospace;font-size:11px;">${escapeHtml(it.s)}</td>
        <td style="padding:6px 8px;font-size:11px;line-height:1.45;">${escapeHtml(it.d)}</td>
      </tr>
    `).join('');
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
        if (!q) {
          tbody.innerHTML = buildSiglesRows(SIGLES);
          if (counter) counter.textContent = `${SIGLES.length} sigles disponibles`;
          return;
        }
        const filtered = SIGLES.filter(it =>
          it.s.toLowerCase().includes(q) || it.d.toLowerCase().includes(q)
        );
        tbody.innerHTML = buildSiglesRows(filtered);
        if (counter) counter.textContent = filtered.length === 0
          ? 'Aucun résultat'
          : `${filtered.length} sigle${filtered.length>1?'s':''} ${q ? 'trouvé'+(filtered.length>1?'s':'') : 'disponibles'}`;
      }, 120);
    });
  }

  // ============================================================
  // 2. SYMBOLES TEMSI — Légende officielle Météo France
  // ============================================================
  function buildTemsiHtml() {
    // Symboles SVG inline reprenant la légende officielle TEMSI Météo France
    // Source : carte de l'image fournie + manuel TEMSI MF
    const phenomenes = [
      { svg: temsiSvg('rain'), label: 'Pluie' },
      { svg: temsiSvg('drizzle'), label: 'Bruine' },
      { svg: temsiSvg('freezing_rain'), label: 'Pluie se congelant' },
      { svg: temsiSvg('snow'), label: 'Neige *' },
      { svg: temsiSvg('showers'), label: 'Averses *' },
      { svg: temsiSvg('hail'), label: 'Grêle' },
      { svg: temsiSvg('freezing_fog'), label: 'Brouillard givrant' },
      { svg: temsiSvg('moderate_icing'), label: 'Givrage modéré' },
      { svg: temsiSvg('severe_icing'), label: 'Givrage fort' },
      { svg: temsiSvg('mist'), label: 'Brume' },
      { svg: temsiSvg('widespread_fog'), label: 'Brouillard étendu *' },
      { svg: temsiSvg('smoke'), label: 'Fumée de grande étendue' },
      { svg: temsiSvg('heavy_sand_haze'), label: 'Forte brume de sable' },
      { svg: temsiSvg('radioactive'), label: 'Pollutions radioactives' },
      { svg: temsiSvg('volcanic'), label: 'Éruption volcanique' },
      { svg: temsiSvg('sandstorm'), label: 'Tempête de sable ou de poussière' },
      { svg: temsiSvg('dry_haze'), label: 'Brume sèche de grande étendue' },
      { svg: temsiSvg('moderate_turb'), label: 'Turbulence modérée' },
      { svg: temsiSvg('severe_turb'), label: 'Turbulence forte' },
      { svg: temsiSvg('squall_line'), label: 'Ligne de grains forts' },
      { svg: temsiSvg('thunderstorm'), label: 'Orages' },
      { svg: temsiSvg('mountain_wave'), label: 'Ondes orographiques' },
      { svg: temsiSvg('tropical_cyclone'), label: 'Cyclone tropical' },
      { svg: temsiSvg('blowing_snow'), label: 'Chasse-neige élevé' },
      { svg: temsiSvg('mountain_obscured'), label: 'Obscurcissement des montagnes' }
    ];

    const localisations = [
      { code: 'COT', label: 'Sur la côte' },
      { code: 'LAN', label: 'À l\'intérieur des terres' },
      { code: 'LOC', label: 'Localement' },
      { code: 'MAR', label: 'En mer' },
      { code: 'MON', label: 'Au-dessus des montagnes' },
      { code: 'SFC', label: 'En surface' },
      { code: 'VAL', label: 'Dans les vallées' },
      { code: 'CIT', label: 'À proximité ou au-dessus des villes' }
    ];

    const phenHtml = phenomenes.map(p => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);">
        <div style="flex-shrink:0;width:44px;height:32px;display:flex;align-items:center;justify-content:center;">${p.svg}</div>
        <div style="font-size:12px;line-height:1.3;">${escapeHtml(p.label)}</div>
      </div>
    `).join('');

    const locHtml = localisations.map(l => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card);">
        <div style="flex-shrink:0;min-width:44px;text-align:center;">
          <span style="display:inline-block;padding:3px 8px;background:#1E40AF;color:white;border-radius:4px;font-weight:600;font-size:11px;font-family:ui-monospace,monospace;">${escapeHtml(l.code)}</span>
        </div>
        <div style="font-size:12px;line-height:1.3;">${escapeHtml(l.label)}</div>
      </div>
    `).join('');

    return `
      <p class="text-xs text-muted">Symboles officiels utilisés sur les cartes TEMSI (TEMps SIgnificatif) de Météo France. Indispensables pour décoder les bulletins météo aviation publiés sur Aeroweb.</p>

      <h3 class="text-sm font-semibold mt-4 mb-2">⚡ Symboles du temps significatif</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">
        ${phenHtml}
      </div>
      <p class="text-xs text-muted mt-2 italic">* Symboles non utilisés pour les cartes destinées aux vols haute altitude.</p>

      <h3 class="text-sm font-semibold mt-5 mb-2">📍 Codes de localisation</h3>
      <p class="text-xs text-muted mb-2">Codes accompagnant les phénomènes pour préciser leur localisation.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">
        ${locHtml}
      </div>

      <div class="info-box mt-4 text-xs">
        <strong>💡 Lecture d'une carte TEMSI</strong><br>
        Combinaison symbole + code (ex: "givrage modéré <strong>MON</strong>" = givrage modéré au-dessus des montagnes). Les cartes officielles sont disponibles sur <a href="https://aviation.meteo.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">Aeroweb Météo France</a> (compte gratuit).
      </div>
    `;
  }

  // Symboles TEMSI en SVG inline (style officiel simplifié)
  function temsiSvg(kind) {
    const C = 'currentColor';
    const wrap = (inner) => `<svg viewBox="0 0 36 24" width="36" height="24" xmlns="http://www.w3.org/2000/svg" style="color:var(--foreground);" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    switch (kind) {
      case 'rain': return wrap(`<line x1="8" y1="6" x2="4" y2="18"/><line x1="16" y1="6" x2="12" y2="18"/><line x1="24" y1="6" x2="20" y2="18"/>`);
      case 'drizzle': return wrap(`<circle cx="12" cy="12" r="1.5" fill="${C}"/><circle cx="20" cy="14" r="1.5" fill="${C}"/>`);
      case 'freezing_rain': return wrap(`<circle cx="10" cy="10" r="2.5"/><path d="M14 13 Q18 17 22 13" stroke="${C}"/><line x1="22" y1="13" x2="26" y2="6"/>`);
      case 'snow': return wrap(`<line x1="18" y1="4" x2="18" y2="20"/><line x1="11" y1="8" x2="25" y2="16"/><line x1="11" y1="16" x2="25" y2="8"/>`);
      case 'showers': return wrap(`<path d="M10 16 L18 4 L26 16 Z" stroke="${C}"/>`);
      case 'hail': return wrap(`<path d="M10 14 L18 4 L26 14 Z" stroke="${C}"/><line x1="12" y1="18" x2="24" y2="18"/>`);
      case 'freezing_fog': return wrap(`<line x1="6" y1="6" x2="30" y2="6"/><line x1="6" y1="10" x2="30" y2="10"/><line x1="6" y1="14" x2="30" y2="14"/><line x1="14" y1="18" x2="22" y2="22"/><line x1="14" y1="22" x2="22" y2="18"/>`);
      case 'moderate_icing': return wrap(`<path d="M10 12 Q14 6 18 12 Q22 18 26 12"/>`);
      case 'severe_icing': return wrap(`<path d="M10 8 Q14 2 18 8 Q22 14 26 8"/><path d="M10 18 Q14 12 18 18 Q22 24 26 18"/>`);
      case 'mist': return wrap(`<line x1="6" y1="10" x2="30" y2="10"/><line x1="6" y1="14" x2="30" y2="14"/>`);
      case 'widespread_fog': return wrap(`<line x1="6" y1="7" x2="30" y2="7"/><line x1="6" y1="11" x2="30" y2="11"/><line x1="6" y1="15" x2="30" y2="15"/><line x1="6" y1="19" x2="30" y2="19"/>`);
      case 'smoke': return wrap(`<path d="M14 18 Q14 14 18 12 Q22 10 22 6"/><path d="M18 18 Q18 14 22 12 Q26 10 26 6"/>`);
      case 'heavy_sand_haze': return wrap(`<path d="M10 8 Q14 4 18 8 Q22 12 26 8 Q22 14 18 12 Q14 14 10 12 Z" stroke="${C}"/>`);
      case 'radioactive': return wrap(`<circle cx="18" cy="12" r="3" fill="${C}"/><path d="M18 9 L18 4 M21 13 L26 16 M15 13 L10 16"/>`);
      case 'volcanic': return wrap(`<path d="M8 20 L14 8 L18 14 L22 8 L28 20 Z" stroke="${C}"/><line x1="14" y1="6" x2="14" y2="2"/><line x1="22" y1="6" x2="22" y2="2"/>`);
      case 'sandstorm': return wrap(`<line x1="6" y1="20" x2="14" y2="6"/><line x1="14" y1="20" x2="22" y2="6"/><line x1="22" y1="20" x2="30" y2="6"/><circle cx="10" cy="10" r="1.5" fill="${C}"/>`);
      case 'dry_haze': return wrap(`<path d="M6 12 Q10 8 14 12 Q18 16 22 12 Q26 8 30 12"/>`);
      case 'moderate_turb': return wrap(`<path d="M8 14 Q12 8 16 14 Q20 20 24 14 Q26 12 28 14" stroke="${C}"/>`);
      case 'severe_turb': return wrap(`<path d="M6 14 Q10 6 14 14 Q18 22 22 14 Q26 6 30 14" stroke="${C}" stroke-width="2"/>`);
      case 'squall_line': return wrap(`<line x1="6" y1="12" x2="30" y2="12"/><path d="M10 12 L13 8 L13 16 Z" fill="${C}"/><path d="M20 12 L23 8 L23 16 Z" fill="${C}"/>`);
      case 'thunderstorm': return wrap(`<path d="M14 4 L8 14 L14 14 L10 20 L22 10 L16 10 L20 4 Z" fill="${C}"/>`);
      case 'mountain_wave': return wrap(`<path d="M6 16 Q12 8 18 16 Q24 24 30 16" stroke="${C}"/>`);
      case 'tropical_cyclone': return wrap(`<path d="M18 6 Q24 6 24 12 Q24 18 18 18 Q12 18 12 12 Q12 6 18 6 Z M18 6 Q22 12 18 18 M18 6 Q14 12 18 18" stroke="${C}"/>`);
      case 'blowing_snow': return wrap(`<line x1="18" y1="14" x2="18" y2="22"/><line x1="14" y1="16" x2="22" y2="20"/><line x1="14" y1="20" x2="22" y2="16"/><path d="M6 8 Q12 4 18 8 Q24 12 30 8"/>`);
      case 'mountain_obscured': return wrap(`<path d="M4 20 L12 10 L20 16 L28 8 L34 20 Z" fill="${C}"/>`);
      default: return wrap(`<text x="18" y="18" text-anchor="middle" font-size="14" fill="${C}">?</text>`);
    }
  }

  function buildAirspaceLexiconHtml() {
    const classes = [
      ['A', 'IFR uniquement', 'Pas de VFR autorisé. Espace contrôlé haute altitude.'],
      ['B', 'IFR + VFR (séparation)', 'VFR autorisé avec clearance. ATC sépare tous les vols.'],
      ['C', 'IFR + VFR', 'VFR autorisé avec clearance. Standard pour CTR en France.'],
      ['D', 'IFR + VFR', 'VFR autorisé avec clearance, info trafic. Standard TMA/CTR FR.'],
      ['E', 'IFR + VFR (info trafic)', 'VFR sans clearance mais info trafic disponible.'],
      ['F', 'IFR conseil', 'Rare. VFR sans contraintes spécifiques.'],
      ['G', 'Espace non contrôlé', '⭐ Le plus utilisé en VFR autogire. "Voir et éviter" total. Pas de clearance requise.']
    ];
    const zones = [
      ['CTR', 'Control Zone', 'Zone contrôlée autour d\'un AD. Du sol au plafond TMA.', '#2563EB'],
      ['TMA', 'Terminal Manoeuvring Area', 'Volume contrôlé au-dessus de la CTR.', '#2563EB'],
      ['ATZ', 'AeroDrome Traffic Zone', 'AD non-contrôlé. Cercle ~3 NM. Auto-information radio.', '#7C3AED'],
      ['ZRT', 'Zone Réglementée Temporaire', 'Créée par SUP AIP/NOTAM (temporaire).', '#DC2626'],
      ['ZIT', 'Zone Interdite Temporaire', 'Pénétration interdite (feux, événement).', '#991B1B'],
      ['ZDT', 'Zone Dangereuse Temporaire', 'Activités dangereuses ponctuelles.', '#EA580C'],
      ['R', 'Restricted', 'Zone réglementée permanente.', '#DC2626'],
      ['D', 'Danger', 'Zone dangereuse permanente.', '#EA580C'],
      ['P', 'Prohibited', 'Zone interdite permanente.', '#991B1B'],
      ['TRA', 'Temporary Reserved Area', 'Réservée temporairement à l\'aviation militaire.', '#B91C1C'],
      ['TSA', 'Temporary Segregated Area', 'Variation de TRA avec ségrégation.', '#B91C1C']
    ];
    const classesRows = classes.map(([c, name, desc]) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;font-weight:600;font-family:ui-monospace,monospace;font-size:13px;text-align:center;">${c}</td>
        <td style="padding:6px 8px;font-weight:500;font-size:12px;">${escapeHtml(name)}</td>
        <td style="padding:6px 8px;font-size:12px;">${escapeHtml(desc)}</td>
      </tr>
    `).join('');
    const zonesRows = zones.map(([code, name, desc, color]) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;"><span style="display:inline-block;background:${color};color:white;font-weight:600;font-size:10px;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;">${code}</span></td>
        <td style="padding:6px 8px;font-weight:500;font-size:12px;font-style:italic;">${escapeHtml(name)}</td>
        <td style="padding:6px 8px;font-size:12px;">${escapeHtml(desc)}</td>
      </tr>
    `).join('');
    return `
      <h3 class="text-sm font-semibold mb-2">Classes d'espaces aériens (OACI)</h3>
      <p class="text-xs text-muted mb-3"><strong>VFR autogire vole majoritairement en classe G</strong> sous 2500 ft AGL.</p>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--muted);"><th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Classe</th><th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Type</th><th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Description</th></tr></thead>
          <tbody>${classesRows}</tbody>
        </table>
      </div>
      <h3 class="text-sm font-semibold mb-2">Types de zones aériennes</h3>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--muted);"><th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Type</th><th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Nom</th><th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Description</th></tr></thead>
          <tbody>${zonesRows}</tbody>
        </table>
      </div>
    `;
  }

  function buildAzbaInfoHtml() {
    return `
      <h3 class="text-sm font-semibold mb-2">⚔️ AZBA / RTBA</h3>
      <p class="text-xs text-muted">Le réseau <strong>RTBA</strong> est utilisé par l'armée pour les entraînements à basse altitude. Quand actif (<strong>AZBA</strong>), il est <strong>interdit aux VFR</strong>.</p>
      <div class="warn-box mt-3 text-xs">
        <strong>⚠️ Pas d'API publique gratuite</strong> en 2026 pour récupérer l'AZBA temps réel programmatiquement. Les sources officielles ci-dessous sont à consulter avant chaque vol.
      </div>
      <h4 class="text-xs font-semibold uppercase tracking-wide mt-4 mb-2">Sources officielles</h4>
      <div class="space-y-2">
        <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🇫🇷 SIA — Page AZBA officielle</div>
          <div class="text-xs text-muted mt-1">Carte interactive temps réel. Référence DGAC.</div>
          <div class="text-xs text-blue-600 mt-1">sia.aviation-civile.gouv.fr/schedules</div>
        </a>
        <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🇫🇷 Aeroweb — Météo France aviation</div>
          <div class="text-xs text-muted mt-1">NOTAM AZBA + cartes RTBA + TEMSI.</div>
        </a>
        <a href="https://supaip.fr/" target="_blank" rel="noreferrer" class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🗺️ SUP AIP France (tiers, gratuit)</div>
          <div class="text-xs text-muted mt-1">Carte interactive AZBA + ZRT/ZIT/ZDT + NOTAM agrégés.</div>
        </a>
      </div>
    `;
  }

  function buildSourcesContentHtml() {
    return `
      <p class="text-xs text-muted mb-3">L'app agrège plusieurs sources officielles et open data pour offrir un briefing pré-vol complet.</p>
      <div class="space-y-3 text-sm">
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">✈️ Aérodromes officiels (447)</h3><p class="text-xs">Source : <strong>DGAC</strong> via PIAF.</p><a href="https://piaf.stac.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">piaf.stac.aviation-civile.gouv.fr</a></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (764)</h3><p class="text-xs">Source : <strong>BASULM</strong> — FFPLUM.</p><a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">basulm.ffplum.fr</a></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP / NOTAM</h3><p class="text-xs">Source : <strong>SIA</strong>. Liens VAC construits selon cycle AIRAC.</p><a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">sia.aviation-civile.gouv.fr</a></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📖 Sigles aéronautiques (670)</h3><p class="text-xs">Source : <strong>SOFIA</strong> — DGAC. PDF officiel des abréviations utilisées en aéronautique.</p><a href="https://sofia-briefing.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">sofia-briefing.aviation-civile.gouv.fr</a></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3><p class="text-xs">METAR/TAF : <strong>aviationweather.gov</strong> (NOAA). Vent : <strong>Open-Meteo</strong>.</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">📡 TEMSI + Aeroweb</h3><p class="text-xs">Source : <strong>Aeroweb</strong> de Météo France (compte gratuit).</p><a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviation.meteo.fr</a></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3><p class="text-xs">Source : <strong>OpenAIP</strong> (clé API gratuite).</p></div>
        <div class="muted-bg p-3 rounded"><h3 class="font-semibold text-sm mb-1">⚔️ AZBA / RTBA</h3><p class="text-xs">Sources : <strong>SIA</strong> page schedules + <strong>SUP AIP France</strong> (agrégateur tiers gratuit).</p></div>
      </div>
      <div class="border-t border-thin pt-3 mt-4">
        <p class="text-xs text-muted">AutogyroDash est un outil d'aide à la planification VFR. <strong>Le pilote reste seul responsable de toutes les vérifications officielles avant chaque vol</strong>. Aucune donnée pilote n'est envoyée à un serveur.</p>
      </div>
      <div class="text-xs text-muted text-center pt-2">AutogyroDash v0.6.1 · <a href="https://github.com/killianmenard/autogyro-briefing-buddy" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">code source GitHub</a></div>
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
      section.querySelectorAll('.res-subpage').forEach(p => {
        p.classList.toggle('hidden', p.dataset.sub !== sub);
      });
      if (sub === 'lexicon') setTimeout(setupSiglesSearch, 50);
    };
    section.querySelectorAll('.res-subtab').forEach(b => {
      b.addEventListener('click', () => setActive(b.dataset.sub));
    });
    setActive('lexicon');
  }

  replaceSourcesWithResources();

  // ============================================================
  // 2bis. HISTORIQUE VOLS (inchangé v0.6.0)
  // ============================================================
  const HISTORY_KEY = 'autogyrodash_history_v1';
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveHistory(items) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30))); }
    catch (e) { console.warn('[History] save failed', e); }
  }
  function pinCurrentFlight() {
    const trip = computeTrip();
    if (!trip || !trip.points || trip.points.length < 2) {
      if (typeof showToast === 'function') showToast('Aucun trajet à épingler (min 2 points)', 'warn', 3000);
      return false;
    }
    const item = {
      id: Date.now(),
      pinnedAt: new Date().toISOString(),
      label: trip.points.map(p => p.icao).join(' → ') + (STATE.loop ? ' → boucle' : ''),
      points: trip.points.map(p => ({
        icao: p.icao, name: p.name, lat: p.lat, lon: p.lon,
        isBasulm: !!p.isBasulm,
        basulm: p.isBasulm ? p.basulm : undefined,
        metarStation: p.metarStation
      })),
      loop: !!STATE.loop,
      totalKm: trip.totalDist || 0,
      acftNickname: STATE.acft?.nickname || null
    };
    const history = loadHistory();
    const idx = history.findIndex(h => h.label === item.label && h.loop === item.loop);
    if (idx >= 0) history[idx] = { ...history[idx], pinnedAt: item.pinnedAt };
    else history.unshift(item);
    saveHistory(history);
    if (typeof showToast === 'function') showToast(`✓ Vol épinglé : ${item.label}`, 'ok', 3000);
    renderHistoryList();
    return true;
  }
  function restoreFlight(item) {
    if (!item || !item.points || item.points.length < 2) return;
    const clearBtn = document.getElementById('clear-trip');
    if (clearBtn) clearBtn.click();
    setTimeout(() => {
      const pts = item.points;
      const max = Math.min(pts.length, 5);
      for (let i = 0; i < max; i++) {
        const p = pts[i];
        let ad;
        if (p.isBasulm) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, isBasulm: true, basulm: p.basulm, metarStation: null };
        else {
          ad = AERODROMES_ALL.find(a => a.icao === p.icao);
          if (!ad) ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, metarStation: p.metarStation };
        }
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
      if (item.loop) {
        STATE.loop = true;
        const cb = document.getElementById('loop-checkbox');
        if (cb) cb.checked = true;
      }
      if (typeof onTripChange === 'function') onTripChange();
      document.querySelector('.tab-btn[data-tab="plan"]')?.click();
      if (typeof showToast === 'function') showToast(`✓ Vol restauré : ${item.label}`, 'ok', 3000);
    }, 200);
  }
  function deleteHistoryItem(id) {
    saveHistory(loadHistory().filter(h => h.id !== id));
    renderHistoryList();
  }
  function renderHistoryList() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    const history = loadHistory();
    if (history.length === 0) {
      listEl.innerHTML = `<div class="text-center text-sm text-muted p-6"><div style="font-size:32px;margin-bottom:8px;">📭</div><div>Aucun vol épinglé.</div><div class="text-xs mt-2">Bouton <strong>📌</strong> à côté du PDF pour épingler le trajet courant.</div></div>`;
      return;
    }
    listEl.innerHTML = history.map(h => {
      const d = new Date(h.pinnedAt);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dist = h.totalKm ? Math.round(h.totalKm) + ' km' : '';
      return `<div class="card p-3" style="margin-bottom:8px;"><div class="flex items-start justify-between gap-2 flex-wrap"><div style="flex:1;min-width:200px;"><div class="font-medium text-sm" style="font-family:ui-monospace,monospace;">${escapeHtml(h.label)}</div><div class="text-xs text-muted mt-1">Épinglé ${escapeHtml(dateStr)}${dist?' · '+dist:''}${h.acftNickname?' · '+escapeHtml(h.acftNickname):''}</div></div><div class="flex gap-1 flex-shrink-0"><button class="h-restore px-3 py-1.5 rounded bg-black text-white" data-id="${h.id}" style="font-size:12px;">↻ Restaurer</button><button class="h-delete px-2 py-1.5 rounded border" data-id="${h.id}" style="border-color:#FCA5A5;color:#991B1B;font-size:12px;background:white;" title="Supprimer">🗑️</button></div></div></div>`;
    }).join('');
    listEl.querySelectorAll('.h-restore').forEach(b => b.addEventListener('click', () => {
      const item = loadHistory().find(h => h.id === parseInt(b.dataset.id));
      if (item) restoreFlight(item);
    }));
    listEl.querySelectorAll('.h-delete').forEach(b => b.addEventListener('click', () => {
      if (confirm('Supprimer ce vol ?')) deleteHistoryItem(parseInt(b.dataset.id));
    }));
  }
  function addHistoryTab() {
    const resourcesTab = document.querySelector('.tab-btn[data-tab="resources"]');
    if (!resourcesTab || document.querySelector('.tab-btn[data-tab="history"]')) return;
    const tab = document.createElement('span');
    tab.className = 'tab-btn';
    tab.dataset.tab = 'history';
    tab.textContent = 'historique';
    resourcesTab.parentNode.insertBefore(tab, resourcesTab);
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'tab-history';
    section.className = 'hidden';
    section.innerHTML = `<div class="card p-4 space-y-3"><div class="flex items-center justify-between flex-wrap gap-2"><h2 class="section-title text-sm">historique des vols</h2><button id="history-clear-all" class="text-xs px-3 py-1.5 rounded border" style="border-color:#FCA5A5;color:#991B1B;background:white;">Vider l'historique</button></div><p class="text-xs text-muted">Vols épinglés. "Restaurer" recharge le trajet dans le brief.</p><div id="history-list"></div></div>`;
    main.appendChild(section);
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      hideAllTabs();
      section.classList.remove('hidden');
      closeMobileMenu();
      renderHistoryList();
    });
    document.querySelectorAll('.tab-btn[data-tab="plan"], .tab-btn[data-tab="acft"], .tab-btn[data-tab="resources"], .tab-btn[data-tab="params"]').forEach(b => b.addEventListener('click', () => section.classList.add('hidden')));
    document.getElementById('history-clear-all')?.addEventListener('click', () => {
      if (confirm('Effacer TOUT l\'historique ?')) { saveHistory([]); renderHistoryList(); }
    });
  }
  addHistoryTab();

  // ============================================================
  // 3. BOUTON "ÉPINGLER" EN PILULE COMPACTE
  // ============================================================
  function addPinButton() {
    const pdfBtn = document.getElementById('pdf-btn');
    if (!pdfBtn || document.getElementById('pin-flight-btn')) return;
    const footer = pdfBtn.parentNode;
    if (!footer) return;
    pdfBtn.style.flex = '1';

    const pinBtn = document.createElement('button');
    pinBtn.id = 'pin-flight-btn';
    pinBtn.title = 'Épingler ce vol à mon historique';
    // PILULE COMPACTE : juste icône + texte court, petite taille
    pinBtn.style.cssText = `
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid var(--border);
      border-radius: 9999px;
      background: var(--card);
      color: var(--foreground);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      height: fit-content;
      align-self: center;
    `;
    pinBtn.innerHTML = `<span style="font-size:13px;">📌</span><span>épingler</span>`;
    pinBtn.addEventListener('mouseenter', () => { pinBtn.style.background = 'var(--muted)'; });
    pinBtn.addEventListener('mouseleave', () => { pinBtn.style.background = 'var(--card)'; });
    pinBtn.addEventListener('click', () => pinCurrentFlight());

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:10px;align-items:center;';
    footer.insertBefore(wrapper, pdfBtn);
    wrapper.appendChild(pdfBtn);
    wrapper.appendChild(pinBtn);
  }
  addPinButton();

  // ============================================================
  // 4. SATELLITE MODE : cache nuages/vent/temp quand actif
  // ============================================================
  function setupSatelliteExclusivity() {
    // L'app v0.5.3 a un onglet "satellite" et 3 modes carto (temp/vent/nuages)
    // Stratégie : observer le DOM, et quand le satellite est activé, on cache
    // les boutons de mode CartoDB Positron.

    // Recherche tolérante des éléments concernés
    function findElement(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function findModeButtons() {
      // Plusieurs heuristiques pour repérer les boutons "nuages", "vent", "température"
      const all = Array.from(document.querySelectorAll('button, .tab-btn, [role="tab"], .mode-btn'));
      const targets = all.filter(b => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return /\b(nuages?|cloud|wind|vent|temp\u00e9rature|temperature|temp\b)\b/i.test(txt)
            && txt.length < 25;
      });
      return targets;
    }

    function findSatelliteButton() {
      const all = Array.from(document.querySelectorAll('button, .tab-btn, [role="tab"]'));
      return all.find(b => /satellite/i.test((b.textContent || '').trim()) && b.textContent.length < 20);
    }

    let satelliteActive = false;
    let cachedModeButtons = [];

    function applyState() {
      if (satelliteActive) {
        // Cache les boutons mode
        cachedModeButtons.forEach(b => {
          if (b && b.style) { b.dataset.originalDisplay = b.style.display || ''; b.style.display = 'none'; }
        });
      } else {
        // Restaure
        cachedModeButtons.forEach(b => {
          if (b && b.style) b.style.display = b.dataset.originalDisplay || '';
        });
      }
    }

    // Click delegation : écoute toute interaction qui pourrait activer/désactiver satellite
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('button, .tab-btn, [role="tab"]');
      if (!btn) return;
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (/satellite/.test(txt) && txt.length < 25) {
        // Toggle naïf : si on clique sur satellite, on l'active. Si on est déjà dessus,
        // l'utilisateur peut le désactiver via un autre onglet météo.
        setTimeout(() => {
          // Réévalue la liste des boutons modes (DOM dynamique)
          cachedModeButtons = findModeButtons();
          satelliteActive = true;
          applyState();
        }, 80);
      } else if (/\b(nuages?|cloud|wind|vent|temp\u00e9rature|temperature)\b/i.test(txt) && txt.length < 25) {
        // Si l'utilisateur clique sur un autre mode, on quitte le mode satellite
        setTimeout(() => {
          if (satelliteActive) {
            satelliteActive = false;
            applyState();
          }
        }, 80);
      }
    });
  }
  setupSatelliteExclusivity();

  // ============================================================
  // 5. FICHE ACFT : champs immat (F-XXXX) + indicatif radio
  // ============================================================
  const ACFT_EXTRA_KEY = 'autogyrodash_acft_extras_v1';

  function loadAcftExtras() {
    try { return JSON.parse(localStorage.getItem(ACFT_EXTRA_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveAcftExtras(data) {
    try { localStorage.setItem(ACFT_EXTRA_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('[ACFT extras] save failed', e); }
  }

  function getCurrentAcftSlotId() {
    // L'app gère 3 slots ACFT (multi-machines). On essaie de récupérer
    // le slot actif depuis STATE, sinon "default".
    try {
      if (STATE.acft && STATE.acft.id !== undefined) return String(STATE.acft.id);
      if (STATE.currentAcftSlot !== undefined) return String(STATE.currentAcftSlot);
    } catch (e) {}
    return 'default';
  }

  function injectAcftFields() {
    const acftTab = document.getElementById('tab-acft');
    if (!acftTab) return;
    if (acftTab.querySelector('.acft-extras-block')) return;

    // Recherche d'un endroit pertinent : la première carte ou section
    const target = acftTab.querySelector('.card') || acftTab.querySelector('section') || acftTab;

    const block = document.createElement('div');
    block.className = 'acft-extras-block muted-bg p-3 rounded';
    block.style.cssText = 'margin-top:12px;';
    block.innerHTML = `
      <h3 class="text-sm font-semibold mb-2">📡 Identification radio</h3>
      <p class="text-xs text-muted mb-3">Ces 2 champs sont sauvegardés pour ton appareil et apparaîtront sur ton PDF de briefing.</p>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;">
        <div>
          <label class="text-xs text-muted block mb-1">Immatriculation aéronef</label>
          <input type="text" id="acft-immat" class="ad-input" placeholder="Ex: F-JABC"
                 pattern="F-[A-Z0-9]{1,5}" maxlength="8" autocapitalize="characters"
                 style="text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:0.05em;" />
          <div class="text-xs text-muted mt-1" id="acft-immat-hint">Format : F-XXXXX (lettres et/ou chiffres)</div>
        </div>
        <div>
          <label class="text-xs text-muted block mb-1">Indicatif radio (call sign à l'antenne)</label>
          <input type="text" id="acft-callsign" class="ad-input" placeholder="Ex: Foxtrot-Juliet-Alpha-Bravo-Charlie"
                 maxlength="60" />
          <div class="text-xs text-muted mt-1">Indicatif que tu prononces en arrivant sur fréquence (épelé phonétique ou abrégé).</div>
        </div>
      </div>
      <div id="acft-extras-status" class="text-xs mt-2"></div>
    `;
    target.appendChild(block);

    const slotId = getCurrentAcftSlotId();
    const extras = loadAcftExtras();
    const slotData = extras[slotId] || {};

    const immatInput = document.getElementById('acft-immat');
    const callInput = document.getElementById('acft-callsign');
    const status = document.getElementById('acft-extras-status');
    const hint = document.getElementById('acft-immat-hint');

    if (immatInput) immatInput.value = slotData.immat || '';
    if (callInput) callInput.value = slotData.callsign || '';

    const validateImmat = (val) => {
      if (!val) return true;
      // Pattern souple : F-XXXX(X), accepte lettres et chiffres
      return /^F-[A-Z0-9]{1,5}$/i.test(val);
    };

    function persist() {
      const cur = loadAcftExtras();
      const sid = getCurrentAcftSlotId();
      const immat = (immatInput?.value || '').toUpperCase().trim();
      const callsign = (callInput?.value || '').trim();
      cur[sid] = { immat, callsign };
      saveAcftExtras(cur);
      if (status) {
        status.innerHTML = '<span style="color:#15803D;">✓ Enregistré pour cet appareil.</span>';
        setTimeout(() => { if (status) status.innerHTML = ''; }, 2000);
      }
    }

    let debounce;
    function onChange() {
      const val = (immatInput?.value || '').toUpperCase().trim();
      if (val && !validateImmat(val)) {
        if (hint) { hint.style.color = '#B91C1C'; hint.textContent = '⚠ Format invalide. Attendu : F-XXXXX'; }
      } else {
        if (hint) { hint.style.color = ''; hint.textContent = 'Format : F-XXXXX (lettres et/ou chiffres)'; }
      }
      clearTimeout(debounce);
      debounce = setTimeout(persist, 400);
    }

    immatInput?.addEventListener('input', onChange);
    callInput?.addEventListener('input', onChange);

    // Force majuscules immat
    immatInput?.addEventListener('blur', () => {
      if (immatInput.value) immatInput.value = immatInput.value.toUpperCase().trim();
    });
  }
  injectAcftFields();
  // Réinjecte si le tab ACFT est re-rendu (multi-slots)
  setInterval(injectAcftFields, 2000);

  // Expose globalement pour le PDF (cf. hook plus bas)
  window.__getAcftExtras = function() {
    const slotId = getCurrentAcftSlotId();
    const all = loadAcftExtras();
    return all[slotId] || { immat: '', callsign: '' };
  };

  // ============================================================
  // 6. BLOCS AZBA + NOTAM EN HAUT DU BRIEF
  // ============================================================
  function injectAzbaNotamBlocks() {
    const planTab = document.getElementById('tab-plan');
    if (!planTab) return;
    if (document.getElementById('azba-block') || document.getElementById('notam-block')) return;

    // Insérer en haut du brief, sous l'éventuel premier élément (titre, intro, contrôles)
    // Stratégie : insérer juste avant le 2e card (le 1er étant souvent le sélecteur de trajet)
    const cards = planTab.querySelectorAll('.card');
    let anchor = null;
    if (cards.length >= 1) anchor = cards[0];

    const azbaBlock = document.createElement('div');
    azbaBlock.id = 'azba-block';
    azbaBlock.className = 'card';
    azbaBlock.style.cssText = 'padding:14px 16px;border-left:4px solid #DC2626;background:linear-gradient(to right, #FEF2F2 0%, var(--card) 30%);margin-bottom:12px;';
    azbaBlock.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;">
          <span style="color:#DC2626;">⚔️</span>
          <span>AZBA / RTBA — Zones militaires</span>
        </h2>
        <span style="font-size:10px;background:#DC2626;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
      </div>
      <p class="text-xs text-muted mt-2">Si le réseau RTBA est actif sur ton trajet : <strong>interdiction VFR</strong>. Vérifie systématiquement avant chaque vol.</p>
      <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px;">
        <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer"
           style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--foreground);font-size:13px;">
          <span style="font-size:16px;">🇫🇷</span>
          <span style="flex:1;"><strong>SIA — Carte AZBA officielle</strong><br><span style="font-size:10px;color:var(--muted-foreground);">Temps réel · Référence DGAC</span></span>
          <span style="font-size:12px;color:var(--muted-foreground);">→</span>
        </a>
        <a href="https://supaip.fr/" target="_blank" rel="noreferrer"
           style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--foreground);font-size:13px;">
          <span style="font-size:16px;">🗺️</span>
          <span style="flex:1;"><strong>SUP AIP France — Carte interactive</strong><br><span style="font-size:10px;color:var(--muted-foreground);">AZBA + ZRT/ZIT/ZDT visualisées · gratuit · agrégateur tiers</span></span>
          <span style="font-size:12px;color:var(--muted-foreground);">→</span>
        </a>
        <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer"
           style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--foreground);font-size:13px;">
          <span style="font-size:16px;">📡</span>
          <span style="flex:1;"><strong>Aeroweb — NOTAM AZBA + TEMSI</strong><br><span style="font-size:10px;color:var(--muted-foreground);">Météo France · compte gratuit</span></span>
          <span style="font-size:12px;color:var(--muted-foreground);">→</span>
        </a>
      </div>
    `;

    const notamBlock = document.createElement('div');
    notamBlock.id = 'notam-block';
    notamBlock.className = 'card';
    notamBlock.style.cssText = 'padding:14px 16px;border-left:4px solid #2563EB;background:linear-gradient(to right, #EFF6FF 0%, var(--card) 30%);margin-bottom:12px;';
    notamBlock.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin:0;display:flex;align-items:center;gap:6px;">
          <span style="color:#2563EB;">📋</span>
          <span>NOTAM — Avis aux navigants</span>
        </h2>
        <span style="font-size:10px;background:#2563EB;color:white;padding:2px 8px;border-radius:9999px;font-weight:600;">À VÉRIFIER</span>
      </div>
      <p class="text-xs text-muted mt-2">Avertissements officiels par aérodrome (piste fermée, balise HS, zone activée, etc.). Détails par AD dans les fiches ci-dessous.</p>
      <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px;">
        <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer"
           style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--foreground);font-size:13px;">
          <span style="font-size:16px;">🇫🇷</span>
          <span style="flex:1;"><strong>SIA Olivia / SOFIA — NOTAM officiels</strong><br><span style="font-size:10px;color:var(--muted-foreground);">Outil officiel DGAC · compte gratuit pour briefings persos</span></span>
          <span style="font-size:12px;color:var(--muted-foreground);">→</span>
        </a>
        <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer"
           style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--foreground);font-size:13px;">
          <span style="font-size:16px;">📡</span>
          <span style="flex:1;"><strong>Aeroweb — NOTAM + carte TEMSI</strong><br><span style="font-size:10px;color:var(--muted-foreground);">Météo France · vue intégrée NOTAM + météo</span></span>
          <span style="font-size:12px;color:var(--muted-foreground);">→</span>
        </a>
      </div>
      <p class="text-xs text-muted mt-2 italic">⚠️ Pas d'API publique gratuite pour afficher les NOTAM directement dans l'app. Vérifie systématiquement via les liens officiels avant chaque vol.</p>
    `;

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(azbaBlock, anchor);
      anchor.parentNode.insertBefore(notamBlock, anchor);
    } else {
      planTab.insertBefore(notamBlock, planTab.firstChild);
      planTab.insertBefore(azbaBlock, planTab.firstChild);
    }
  }
  injectAzbaNotamBlocks();
  // Réinjection si le tab plan est rerendu
  setInterval(() => {
    if (!document.getElementById('azba-block')) injectAzbaNotamBlocks();
  }, 3000);

  // ============================================================
  // 7. NOTAM/AZBA/WEBCAMS DANS FICHES AD (inchangé v0.6.0)
  // ============================================================
  const WEBCAMS = {
    'LFLB': { url: 'https://www.aeroport-chambery.com/webcam/', label: 'Webcam Chambéry-Aix Les Bains', source: 'Aéroport Chambéry' },
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
    'LFMH': { url: 'https://www.saint-etienne.aeroport.fr/', label: 'Webcam Saint-Étienne Boutheon', source: 'Aéroport Saint-Étienne' }
  };

  if (typeof refreshAdCards === 'function') {
    const _prevRefresh = refreshAdCards;
    refreshAdCards = function() {
      _prevRefresh.apply(this, arguments);
      setTimeout(addNotamAndAzbaToCards, 100);
    };
  }

  function addNotamAndAzbaToCards() {
    const trip = computeTrip();
    if (!trip) return;
    const seen = new Set(); const uniquePoints = [];
    trip.points.forEach(p => { if (!seen.has(p.icao)) { uniquePoints.push(p); seen.add(p.icao); } });

    uniquePoints.forEach((ad, i) => {
      const cardEl = document.querySelector(`[data-ad-card="${ad.icao}-${i}"]`);
      if (!cardEl) return;
      if (cardEl.querySelector('.notam-section')) return;

      const section = document.createElement('div');
      section.className = 'notam-section';
      section.style.cssText = 'border-top:1px solid var(--border);padding:12px 16px;font-size:12px;';

      const webcam = WEBCAMS[ad.icao];
      const isBasulm = !!ad.isBasulm;

      let html = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">📡 vérifications par aérodrome</h4>`;
      if (isBasulm) {
        html += `<div class="info-box mb-2 text-xs">ℹ️ Plateforme BASULM : <strong>pas de NOTAM officiel publié</strong>. Vérifier auprès du gestionnaire (téléphone dans la fiche).</div>`;
      } else {
        html += `
          <div class="space-y-1">
            <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">📋</span><span style="flex:1;"><strong>NOTAM ${escapeHtml(ad.icao)}</strong> — SIA Olivia / SOFIA</span><span style="font-size:10px;color:var(--muted-foreground);">→</span>
            </a>
            <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">📡</span><span style="flex:1;">NOTAM + TEMSI sur Aeroweb</span><span style="font-size:10px;color:var(--muted-foreground);">→</span>
            </a>
          </div>
        `;
      }
      if (webcam) {
        html += `<div class="mt-2 pt-2 border-t border-thin">
          <a href="${webcam.url}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#FEF3C7;border-radius:4px;text-decoration:none;color:#92400E;">
            <span style="font-size:14px;">📹</span><span style="flex:1;"><strong>${escapeHtml(webcam.label)}</strong></span><span style="font-size:10px;">→</span>
          </a>
          <p class="text-xs text-muted mt-1 italic">Visuel temps réel · ${escapeHtml(webcam.source)}</p>
        </div>`;
      }
      section.innerHTML = html;
      cardEl.appendChild(section);
    });
  }
  setTimeout(addNotamAndAzbaToCards, 300);

  // ============================================================
  // BOOT FINAL
  // ============================================================
  if (typeof showToast === 'function') {
    showToast(`✓ v0.6.1 chargé · ${SIGLES.length} sigles + TEMSI + AZBA`, 'ok', 3500);
  }
  console.log('[Extensions v0.6.1] Intégration terminée');
})();
