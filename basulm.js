/* ============================================================
   AutogyroDash — BASULM integration v0.5.0
   ------------------------------------------------------------
   Charge les ~764 plateformes ULM (BASULM/FFPLUM) et étend
   l'app sans modifier le code existant :
     - Markers orange/violet/cyan sur la carte
     - Toggle "afficher plateformes ULM"
     - Auto-complétion mélangée DGAC + BASULM
     - Section "PLATEFORME ULM" dans la fiche AD
     - Stations METAR alternatives 50km
     - Copyright BASULM (footer app)
   ============================================================ */

(async function() {
  'use strict';

  // ===== 0. CACHE & LOAD =====================================
  const CACHE_KEY = 'autogyrodash_basulm_v1';
  const CACHE_EXP = CACHE_KEY + '_exp';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
  const VISIBLE_KEY = 'autogyrodash_basulm_visible';

  async function loadBasulmData() {
    // Try fresh cache first
    try {
      const exp = parseInt(localStorage.getItem(CACHE_EXP) || '0');
      if (exp > Date.now()) {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {}

    // Fetch fresh
    try {
      const r = await fetch('basulm.json', { cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_EXP, String(Date.now() + CACHE_TTL));
      } catch (e) { /* quota plein, on continue sans cacher */ }
      return data;
    } catch (e) {
      console.warn('[BASULM] Fetch échec, tentative cache expiré', e);
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e2) {}
      return null;
    }
  }

  // ===== 1. WAIT FOR APP INIT ================================
  function waitForAppReady() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof AERODROMES_ALL !== 'undefined'
            && typeof map !== 'undefined' && map
            && typeof STATE !== 'undefined'
            && typeof addAdToTrip === 'function'
            && document.getElementById('map-controls')) {
          resolve();
        } else {
          setTimeout(check, 120);
        }
      };
      check();
    });
  }

  await waitForAppReady();

  const data = await loadBasulmData();
  if (!data || !data.platforms || !Array.isArray(data.platforms)) {
    if (typeof showToast === 'function') {
      showToast('Plateformes ULM (BASULM) indisponibles', 'warn', 4000);
    }
    console.warn('[BASULM] Aucune donnée, app continue sans plateformes ULM');
    return;
  }

  // Adapter au format attendu par addAdToTrip / makeAdCardHtml
  const PLATFORMS = data.platforms.map(p => ({
    icao: p.c,              // code BASULM (LF0123, etc.)
    name: p.n,
    lat: p.p[0],
    lon: p.p[1],
    isBasulm: true,
    basulm: p,
    metarStation: null      // pas de METAR direct
  }));

  console.log('[BASULM v0.5.0] ' + PLATFORMS.length + ' plateformes ULM chargées');

  // ===== 2. BUMP VERSION DOM =================================
  try {
    document.title = document.title.replace('v0.4.4', 'v0.5.0');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (s.textContent.trim() === 'v0.4.4') s.textContent = 'v0.5.0';
    });
  } catch (e) {}

  // ===== 3. STYLES PAR CATÉGORIE =============================
  const CAT_STYLE = {
    baseulm:      { color: '#EA580C', fill: '#FB923C', icon: '🛩️', label: 'Base ULM' },
    aerodrome:    { color: '#7C3AED', fill: '#A78BFA', icon: '✈️', label: 'AD privé' },
    altisurface:  { color: '#A21CAF', fill: '#D946EF', icon: '⛰️', label: 'Altisurface' },
    hydrosurface: { color: '#0E7490', fill: '#22D3EE', icon: '💧', label: 'Hydrosurface' },
    paramoteur:   { color: '#15803D', fill: '#4ADE80', icon: '🪂', label: 'Paramoteur' },
    autre:        { color: '#525252', fill: '#A3A3A3', icon: '📍', label: 'Autre' }
  };
  function getStyle(cat) { return CAT_STYLE[cat] || CAT_STYLE.autre; }

  // ===== 4. MARKERS SUR LA CARTE =============================
  const basulmLayer = L.layerGroup();
  let basulmVisible = (localStorage.getItem(VISIBLE_KEY) || '1') === '1';

  PLATFORMS.forEach(p => {
    const st = getStyle(p.basulm.t);
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 3.5,
      color: st.color,
      weight: 1.2,
      fillColor: st.fill,
      fillOpacity: 0.72
    });
    const authBadge = p.basulm.auth
      ? '<br><span style="color:#B91C1C;font-weight:600;">⚠ autorisation obligatoire</span>'
      : '';
    m.bindTooltip(
      `<strong>${st.icon} ${p.icao}</strong><br>${p.name}<br><em>${st.label}</em>${authBadge}`,
      { direction: 'top' }
    );
    m.on('click', () => addAdToTrip(p));
    basulmLayer.addLayer(m);
  });

  if (basulmVisible) basulmLayer.addTo(map);

  // ===== 5. TOGGLE UI dans le panneau "overlays carte" =======
  const mapControls = document.getElementById('map-controls');
  if (mapControls) {
    const toggleBlock = document.createElement('div');
    toggleBlock.style.cssText = 'border-top:1px solid var(--border);padding-top:8px;margin-top:8px;';
    toggleBlock.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-2 flex-wrap">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FB923C;border:1.5px solid #EA580C;"></span>
          <span class="font-medium">Plateformes ULM (BASULM)</span>
          <span class="text-muted">— ${PLATFORMS.length} points</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="basulm-toggle" ${basulmVisible ? 'checked' : ''} />
          <span>afficher sur la carte</span>
        </label>
      </div>
      <div class="text-xs text-muted mt-1">
        Bases ULM, aérodromes privés, altisurfaces, hydrosurfaces, plateformes paramoteur.
        Source : <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">BASULM / FFPLUM</a>.
      </div>
    `;
    mapControls.appendChild(toggleBlock);

    document.getElementById('basulm-toggle').addEventListener('change', e => {
      basulmVisible = e.target.checked;
      localStorage.setItem(VISIBLE_KEY, basulmVisible ? '1' : '0');
      if (basulmVisible) basulmLayer.addTo(map);
      else map.removeLayer(basulmLayer);
    });
  }

  // ===== 6. AUTO-COMPLÉTION MÉLANGÉE =========================
  // On garde le listener input d'origine (qui affiche les DGAC) et on
  // ajoute le nôtre qui ajoute les BASULM à la suite, sans casser l'existant.
  for (let idx = 0; idx < 5; idx++) {
    const input = document.getElementById('ad-input-' + idx);
    const suggBox = document.getElementById('ad-suggestions-' + idx);
    if (!input || !suggBox) continue;

    input.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;

      // L'original a déjà rempli suggBox avec les DGAC. On laisse le tour
      // de boucle se finir, puis on append les BASULM matches.
      requestAnimationFrame(() => {
        const basulmMatches = PLATFORMS.filter(p =>
          p.icao.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
        ).slice(0, 5);

        if (basulmMatches.length === 0) return;

        // Limiter le total visible
        const existingCount = suggBox.querySelectorAll('.ad-suggestion').length;
        const space = Math.max(0, 8 - existingCount);
        if (space === 0) return;
        const toShow = basulmMatches.slice(0, space);

        // Séparateur visuel si DGAC déjà présents
        if (existingCount > 0) {
          const sep = document.createElement('div');
          sep.style.cssText = 'border-top:1px dashed var(--border);padding:4px 12px;font-size:10px;color:var(--muted-foreground);background:var(--muted);';
          sep.textContent = '— plateformes ULM (BASULM) —';
          suggBox.appendChild(sep);
        }

        toShow.forEach(p => {
          const st = getStyle(p.basulm.t);
          const div = document.createElement('div');
          div.className = 'ad-suggestion';
          div.dataset.basulmCode = p.icao;
          div.innerHTML = `
            <span style="display:inline-block;padding:1px 5px;border-radius:9999px;background:${st.fill};color:white;font-size:9px;font-weight:600;margin-right:4px;">${st.icon} ULM</span>
            <span class="pre-mono">${p.icao}</span> · ${p.name}
            ${p.basulm.auth ? '<span style="color:#B91C1C;font-size:10px;margin-left:4px;">⚠ auth.</span>' : ''}
          `;
          div.addEventListener('click', () => {
            input.value = p.icao + ' · ' + p.name;
            STATE.trip[idx] = p;
            suggBox.classList.add('hidden');
            onTripChange();
          });
          suggBox.appendChild(div);
        });

        suggBox.classList.remove('hidden');
      });
    });
  }

  // ===== 7. SECTION "PLATEFORME ULM" DANS LA FICHE AD ========
  // refreshAdCards() est appelé chaque fois que le trajet change.
  // Après son rendu standard, on transforme les cards pour les points BASULM.
  const _originalRefresh = refreshAdCards;
  refreshAdCards = function() {
    _originalRefresh.apply(this, arguments);
    // Laisser le DOM se peindre avant de remplacer
    setTimeout(enhanceBasulmCards, 50);
  };

  function fmtDistKm(km) {
    if (typeof formatDist === 'function') return formatDist(km);
    return Math.round(km) + ' km';
  }

  function enhanceBasulmCards() {
    const trip = computeTrip();
    if (!trip) return;

    const uniquePoints = [];
    const seen = new Set();
    trip.points.forEach(p => {
      if (!seen.has(p.icao)) { uniquePoints.push(p); seen.add(p.icao); }
    });

    uniquePoints.forEach((ad, i) => {
      if (!ad.isBasulm) return;
      const cardEl = document.querySelector(`[data-ad-card="${ad.icao}-${i}"]`);
      if (!cardEl) return;

      const b = ad.basulm;
      const st = getStyle(b.t);
      const role = i === 0
        ? 'depart'
        : (i === uniquePoints.length - 1 && !STATE.loop ? 'arrivee' : 'etape');
      const roleLabel = role === 'depart' ? 'départ' : role === 'arrivee' ? 'arrivée' : 'étape';
      const roleColor = role === 'depart' ? 'green' : role === 'arrivee' ? 'red' : 'blue';

      // --- HEADER (remplacer) ---
      const headerEl = cardEl.querySelector('.border-b');
      if (headerEl) {
        headerEl.innerHTML = `
          <div class="flex items-center gap-2 flex-wrap">
            <span class="dot dot-${roleColor}"></span>
            <span class="text-xs uppercase tracking-wide text-muted">${roleLabel}</span>
            <span style="display:inline-block;padding:2px 6px;border-radius:9999px;background:${st.fill};color:white;font-size:10px;font-weight:600;">${st.icon} PLATEFORME ULM</span>
            <span class="pre-mono font-medium">${ad.icao}</span>
            <span class="text-sm">${ad.name}</span>
          </div>
        `;
      }

      // --- CORPS (remplacer METAR/wind par INFOS PLATEFORME + MÉTÉO RÉFÉRENCE) ---
      const bodyEl = cardEl.querySelector('.p-4.grid');
      if (bodyEl) {
        // Colonne 1 : INFOS PLATEFORME
        let infoHtml = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">infos plateforme</h4>`;
        infoHtml += `<div class="text-xs space-y-1">`;
        infoHtml += `<div><strong>Type :</strong> ${escapeHtml(b.tf || st.label)}</div>`;
        if (b.alt) infoHtml += `<div><strong>Altitude :</strong> ${escapeHtml(b.alt)}</div>`;
        if (b.rad) infoHtml += `<div><strong>Radio :</strong> ${escapeHtml(b.rad)} MHz</div>`;
        if (b.gest) infoHtml += `<div><strong>Gestionnaire :</strong> ${escapeHtml(b.gest)}</div>`;
        if (b.tel) {
          const telClean = b.tel.replace(/[^\d+]/g, '');
          infoHtml += `<div><strong>Téléphone :</strong> <a href="tel:${telClean}" class="text-blue-600 hover:underline">${escapeHtml(b.tel)}</a></div>`;
        }
        if (b.em) {
          infoHtml += `<div><strong>Email :</strong> <a href="mailto:${escapeHtml(b.em)}" class="text-blue-600 hover:underline">${escapeHtml(b.em)}</a></div>`;
        }
        if (b.fac) infoHtml += `<div><strong>Facilités :</strong> ${escapeHtml(b.fac)}</div>`;
        if (b.carb) infoHtml += `<div><strong>Carburant :</strong> ${escapeHtml(b.carb)}</div>`;

        // Pistes
        if (b.pst && b.pst.length) {
          infoHtml += `<div class="mt-2"><strong>Piste${b.pst.length>1?'s':''} :</strong></div><ul class="ml-3 list-disc">`;
          b.pst.forEach(p => {
            const parts = [];
            if (p.ax) parts.push('axe ' + p.ax);
            else if (p.or) parts.push('orient. ' + p.or);
            if (p.lg) parts.push(p.lg + ' m');
            if (p.la) parts.push('larg. ' + p.la + ' m');
            if (p.nat) parts.push(p.nat);
            infoHtml += `<li>${escapeHtml(parts.join(' · '))}</li>`;
          });
          infoHtml += `</ul>`;
        }
        infoHtml += `</div>`;

        // Warning autorisation
        if (b.auth) {
          infoHtml += `<div class="warn-box mt-3 text-xs"><strong>⚠️ AUTORISATION OBLIGATOIRE</strong><br>Contacter le gestionnaire avant toute utilisation.</div>`;
        }

        // Consignes
        if (b.cs) {
          infoHtml += `<div class="mt-2"><h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-1">consignes</h4><div class="text-xs muted-bg p-2 rounded">${escapeHtml(b.cs).replace(/\n/g, '<br>')}</div></div>`;
        }

        // Infos complémentaires (collapsable)
        if (b.info) {
          infoHtml += `<details class="mt-2"><summary class="text-xs cursor-pointer text-muted">+ infos complémentaires</summary><div class="text-xs mt-1 muted-bg p-2 rounded">${escapeHtml(b.info).replace(/\n/g, '<br>')}</div></details>`;
        }

        // Colonne 2 : MÉTÉO DE RÉFÉRENCE
        let meteoHtml = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">météo de référence</h4>`;
        let alternatives = [];
        try {
          if (typeof findNearbyMetarStations === 'function') {
            alternatives = findNearbyMetarStations(ad.lat, ad.lon, ad.icao, 50, 3);
          }
        } catch (e) {}

        if (alternatives.length > 0) {
          meteoHtml += `<div class="text-xs text-muted mb-2">Pas de METAR sur la plateforme. Stations les plus proches dans 50 km :</div>`;
          meteoHtml += `<ul class="text-xs space-y-1">`;
          alternatives.forEach(s => {
            meteoHtml += `<li class="flex items-center justify-between gap-2">
              <a href="https://aviationweather.gov/data/metar/?ids=${s.icao}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">
                <span class="pre-mono">${s.icao}</span> ${escapeHtml(s.name)}
              </a>
              <span class="text-muted">${fmtDistKm(s.distKm)}</span>
            </li>`;
          });
          meteoHtml += `</ul>`;
          meteoHtml += `<div class="text-xs text-muted mt-2 italic">Tape une de ces stations dans le trajet pour récupérer son METAR/vent.</div>`;
        } else {
          meteoHtml += `<div class="text-xs text-muted">Aucune station METAR officielle dans un rayon de 50 km. Consulter open-meteo pour le vent local.</div>`;
        }

        bodyEl.innerHTML = `<div>${infoHtml}</div><div>${meteoHtml}</div>`;
      }

      // --- LOGISTIQUE DGAC : retirer (n'a pas de sens pour BASULM) ---
      const details = cardEl.querySelector('details');
      if (details) details.remove();
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // Helper escape HTML pour éviter XSS si les données BASULM contiennent du HTML
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== 8. COPYRIGHT FOOTER (visible app) ===================
  const mainEl = document.querySelector('main');
  if (mainEl) {
    const credit = document.createElement('div');
    credit.id = 'basulm-credit';
    credit.style.cssText = 'text-align:center;font-size:10px;color:var(--muted-foreground);padding:12px 8px 24px 8px;border-top:1px solid var(--border);margin-top:24px;';
    credit.innerHTML = `
      Aérodromes officiels : <strong>DGAC</strong> (PIAF). 
      Plateformes ULM : <strong>BASULM</strong> — <a href="https://www.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">Fédération Française d'ULM (FFPLUM)</a>. 
      Météo : aviationweather.gov, open-meteo.com. Espaces aériens : OpenAIP.
      <br>
      <span class="text-muted">Données indicatives — le pilote reste seul responsable de la vérification SIA / METAR / TAF / NOTAM / AZBA avant chaque vol.</span>
    `;
    mainEl.appendChild(credit);
  }

  // ===== 9. SUCCESS TOAST AT BOOT ============================
  if (typeof showToast === 'function') {
    showToast(`✓ ${PLATFORMS.length} plateformes ULM chargées (BASULM)`, 'ok', 3000);
  }

  console.log('[BASULM v0.5.0] Intégration terminée');
})();
