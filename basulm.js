/* ============================================================
   AutogyroDash — BASULM integration v0.5.3
   ------------------------------------------------------------
   v0.5.0/0.5.1/0.5.2 : voir historique GitHub
   v0.5.3 fixes :
     - METAR/TAF brut : white-space pre-wrap pour wrap mobile
     - OpenAIP : refresh forcé au boot + bouton recharger
     - Pilule épurée : cache unités/thème/actions sur desktop
       (tout est dans Paramètres) + centre les 4 tabs
     - Mobile fullscreen carte : 1 seul bouton "quitter"
     - Mobile tabs en colonne (sélecteur :has(.tab-btn))
     - Heure UTC temps réel (setInterval 1s)
   ============================================================ */

(async function() {
  'use strict';

  const CACHE_KEY = 'autogyrodash_basulm_v1';
  const CACHE_EXP = CACHE_KEY + '_exp';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const VISIBLE_KEY = 'autogyrodash_basulm_visible';
  const THEME_MANUAL_KEY = 'autogyrodash_theme_manual';

  async function loadBasulmData() {
    try {
      const exp = parseInt(localStorage.getItem(CACHE_EXP) || '0');
      if (exp > Date.now()) {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {}
    try {
      const r = await fetch('basulm.json', { cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(d));
        localStorage.setItem(CACHE_EXP, String(Date.now() + CACHE_TTL));
      } catch (e) {}
      return d;
    } catch (e) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e2) {}
      return null;
    }
  }

  function waitForAppReady() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof AERODROMES_ALL !== 'undefined'
            && typeof map !== 'undefined' && map
            && typeof STATE !== 'undefined'
            && typeof addAdToTrip === 'function'
            && document.getElementById('map-controls')) resolve();
        else setTimeout(check, 120);
      };
      check();
    });
  }

  await waitForAppReady();

  const data = await loadBasulmData();
  if (!data || !data.platforms || !Array.isArray(data.platforms)) {
    if (typeof showToast === 'function') showToast('Plateformes ULM (BASULM) indisponibles', 'warn', 4000);
    return;
  }

  const PLATFORMS = data.platforms.map(p => ({
    icao: p.c, name: p.n, lat: p.p[0], lon: p.p[1],
    isBasulm: true, basulm: p, metarStation: null
  }));

  console.log('[BASULM v0.5.3] ' + PLATFORMS.length + ' plateformes ULM chargées');

  try {
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.5.3');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.5.3';
    });
  } catch (e) {}

  const CAT_STYLE = {
    baseulm:      { color: '#EA580C', fill: '#FB923C', icon: '🛩️', label: 'Base ULM' },
    aerodrome:    { color: '#7C3AED', fill: '#A78BFA', icon: '✈️', label: 'Aérodrome privé' },
    altisurface:  { color: '#A21CAF', fill: '#D946EF', icon: '⛰️', label: 'Altisurface' },
    hydrosurface: { color: '#0E7490', fill: '#22D3EE', icon: '💧', label: 'Hydrosurface' },
    paramoteur:   { color: '#15803D', fill: '#4ADE80', icon: '🪂', label: 'Paramoteur' },
    autre:        { color: '#CA8A04', fill: '#FACC15', icon: '📌', label: 'Divers / spécifique' }
  };
  const getStyle = (cat) => CAT_STYLE[cat] || CAT_STYLE.autre;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtDistKm(km) {
    if (typeof formatDist === 'function') return formatDist(km);
    return Math.round(km) + ' km';
  }

  const COUNTS = PLATFORMS.reduce((acc, p) => {
    const t = p.basulm.t; acc[t] = (acc[t] || 0) + 1; return acc;
  }, {});

  // ============ HORLOGE UTC TEMPS RÉEL =========================
  // v0.5.3 : remplace l'heure FR statique par UTC qui s'actualise toutes les secondes
  function updateUtcClock() {
    const el = document.getElementById('briefing-time');
    if (!el) return;
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}Z`;
  }
  updateUtcClock();
  setInterval(updateUtcClock, 1000);

  // ============ MARKERS + POPUP ===============================
  const basulmLayer = L.layerGroup();
  let basulmVisible = (localStorage.getItem(VISIBLE_KEY) || '1') === '1';

  function buildPopupHtml(p) {
    const b = p.basulm;
    const st = getStyle(b.t);
    const telClean = b.tel ? b.tel.replace(/[^\d+]/g, '') : '';
    const mapsUrl = `https://www.google.com/maps?q=${p.lat},${p.lon}&z=14`;
    let h = `<div style="min-width:220px;max-width:280px;font-size:12px;line-height:1.4;">`;
    h += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
      <span style="display:inline-block;padding:2px 6px;border-radius:9999px;background:${st.fill};color:white;font-size:10px;font-weight:600;">${st.icon} ${escapeHtml(st.label)}</span>
    </div>`;
    h += `<div style="font-weight:600;font-size:13px;margin-bottom:2px;">${escapeHtml(p.icao)} · ${escapeHtml(p.name)}</div>`;
    h += `<div style="color:#666;font-size:11px;margin-bottom:8px;">${escapeHtml(b.tf || st.label)}</div>`;
    if (b.auth) h += `<div style="background:#FEF2F2;color:#B91C1C;padding:4px 6px;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:6px;">⚠ Autorisation gestionnaire OBLIGATOIRE</div>`;
    if (b.alt) h += `<div><strong>Altitude :</strong> ${escapeHtml(b.alt)}</div>`;
    if (b.rad) h += `<div><strong>Radio :</strong> ${escapeHtml(b.rad)} MHz</div>`;
    if (b.gest) h += `<div><strong>Gestionnaire :</strong> ${escapeHtml(b.gest)}</div>`;
    if (b.tel) h += `<div><strong>Tél :</strong> <a href="tel:${telClean}" style="color:#2563EB;text-decoration:underline;">${escapeHtml(b.tel)}</a></div>`;
    if (b.em) h += `<div><strong>Email :</strong> <a href="mailto:${escapeHtml(b.em)}" style="color:#2563EB;text-decoration:underline;">${escapeHtml(b.em)}</a></div>`;
    if (b.pst && b.pst.length) {
      const piste = b.pst[0];
      const parts = [];
      if (piste.ax) parts.push('axe ' + piste.ax);
      else if (piste.or) parts.push('orient. ' + piste.or);
      if (piste.lg) parts.push(piste.lg + ' m');
      if (piste.nat) parts.push(piste.nat);
      if (parts.length) h += `<div><strong>Piste :</strong> ${escapeHtml(parts.join(' · '))}</div>`;
    }
    h += `<div style="background:#FEF3C7;color:#92400E;padding:4px 6px;border-radius:4px;font-size:10px;margin-top:6px;">ℹ️ Pas de carte VAC officielle (plateforme BASULM, non publiée par la DGAC)</div>`;
    h += `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
      <a href="${mapsUrl}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;padding:6px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:4px;font-size:11px;color:#1F2937;text-decoration:none;">📍 Google Maps</a>
      <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" style="flex:1;text-align:center;padding:6px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:4px;font-size:11px;color:#1F2937;text-decoration:none;">🛩 Fiche BASULM</a>
    </div>`;
    h += `<button class="basulm-popup-add" data-code="${escapeHtml(p.icao)}" style="margin-top:6px;width:100%;padding:8px;background:#000;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">+ Ajouter au trajet</button>`;
    h += `</div>`;
    return h;
  }

  PLATFORMS.forEach(p => {
    const st = getStyle(p.basulm.t);
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 3.5, color: st.color, weight: 1.2,
      fillColor: st.fill, fillOpacity: 0.72
    });
    const authBadge = p.basulm.auth ? '<br><span style="color:#B91C1C;font-weight:600;">⚠ autorisation requise</span>' : '';
    m.bindTooltip(
      `<strong>${st.icon} ${escapeHtml(p.icao)}</strong><br>${escapeHtml(p.name)}<br><em>${escapeHtml(st.label)}</em>${authBadge}`,
      { direction: 'top' }
    );
    m.bindPopup(buildPopupHtml(p), { maxWidth: 300, autoPan: true });
    m.on('popupopen', e => {
      const btn = e.popup._contentNode.querySelector('.basulm-popup-add');
      if (btn) {
        btn.addEventListener('click', () => {
          addAdToTrip(p);
          map.closePopup();
          if (typeof showToast === 'function') showToast(`✓ ${p.icao} ajouté au trajet`, 'ok', 2500);
        });
      }
    });
    basulmLayer.addLayer(m);
  });
  if (basulmVisible) basulmLayer.addTo(map);

  // ============ FORCE OPENAIP RE-INIT (v0.5.3) =================
  // Workaround : sur certains devices iOS, refreshOpenaipLayers()
  // appelé par initMap() ne monte pas l'overlay. On force un retry
  // ici, après basulm.json chargé et DOM stable.
  function forceOpenaipReload() {
    try {
      if (typeof getOpenaipKey === 'function' && getOpenaipKey()
          && typeof refreshOpenaipLayers === 'function') {
        refreshOpenaipLayers();
        if (typeof map !== 'undefined' && map) {
          setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
        }
        console.log('[BASULM v0.5.3] OpenAIP overlay force-reloaded');
      }
    } catch (e) {
      console.warn('[BASULM v0.5.3] forceOpenaipReload error', e);
    }
  }
  setTimeout(forceOpenaipReload, 400);

  // ============ TOGGLE BASULM + LÉGENDE ========================
  const mapControls = document.getElementById('map-controls');
  if (mapControls) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding-top:8px;margin-top:8px;';

    const toggleBlock = document.createElement('div');
    toggleBlock.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">Plateformes ULM (BASULM)</span>
          <span class="text-muted">— ${PLATFORMS.length} points</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="basulm-toggle" ${basulmVisible ? 'checked' : ''} />
          <span>afficher</span>
        </label>
      </div>
    `;
    wrapper.appendChild(toggleBlock);

    const legendItems = [
      { key: 'baseulm', count: COUNTS.baseulm || 0 },
      { key: 'aerodrome', count: COUNTS.aerodrome || 0 },
      { key: 'altisurface', count: COUNTS.altisurface || 0 },
      { key: 'paramoteur', count: COUNTS.paramoteur || 0 },
      { key: 'hydrosurface', count: COUNTS.hydrosurface || 0 },
      { key: 'autre', count: COUNTS.autre || 0 }
    ].filter(it => it.count > 0);

    const legendHtml = legendItems.map(it => {
      const st = getStyle(it.key);
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${st.fill};border:1.5px solid ${st.color};flex-shrink:0;"></span>
        <span>${st.icon} ${escapeHtml(st.label)}</span>
        <span class="text-muted" style="margin-left:auto;">${it.count}</span>
      </div>`;
    }).join('');

    // B1.2 (v0.8.2) — légende toujours visible (chevron repliable retiré).
    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top:8px;';
    legend.innerHTML = `
      <div style="font-size:11px;color:var(--muted-foreground);margin-bottom:4px;">légende des couleurs (${legendItems.length} types)</div>
      <div style="padding-left:2px;">${legendHtml}</div>
    `;
    wrapper.appendChild(legend);

    const srcNote = document.createElement('div');
    srcNote.className = 'text-xs text-muted';
    srcNote.style.cssText = 'margin-top:6px;';
    srcNote.innerHTML = `Click sur un marqueur pour les détails. Source : <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">BASULM / FFPLUM</a>.`;
    wrapper.appendChild(srcNote);

    mapControls.appendChild(wrapper);

    document.getElementById('basulm-toggle').addEventListener('change', e => {
      basulmVisible = e.target.checked;
      localStorage.setItem(VISIBLE_KEY, basulmVisible ? '1' : '0');
      if (basulmVisible) basulmLayer.addTo(map);
      else map.removeLayer(basulmLayer);
    });
  }

  // ============ AUTOCOMPLETE MÉLANGÉE ==========================
  for (let idx = 0; idx < 5; idx++) {
    const input = document.getElementById('ad-input-' + idx);
    const suggBox = document.getElementById('ad-suggestions-' + idx);
    if (!input || !suggBox) continue;
    input.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;
      requestAnimationFrame(() => {
        const m = PLATFORMS.filter(p => p.icao.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 5);
        if (m.length === 0) return;
        const existing = suggBox.querySelectorAll('.ad-suggestion').length;
        const space = Math.max(0, 8 - existing);
        if (space === 0) return;
        const toShow = m.slice(0, space);
        if (existing > 0) {
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
            <span class="pre-mono">${escapeHtml(p.icao)}</span> · ${escapeHtml(p.name)}
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

  // ============ HOOK REFRESH AD CARDS ==========================
  const _origRefresh = refreshAdCards;
  refreshAdCards = function() {
    _origRefresh.apply(this, arguments);
    setTimeout(() => {
      enhanceBasulmCards();
      makeAdCardsToggleable();
    }, 50);
  };

  function enhanceBasulmCards() {
    const trip = computeTrip();
    if (!trip) return;
    const seen = new Set(); const uniquePoints = [];
    trip.points.forEach(p => { if (!seen.has(p.icao)) { uniquePoints.push(p); seen.add(p.icao); } });
    uniquePoints.forEach((ad, i) => {
      if (!ad.isBasulm) return;
      const cardEl = document.querySelector(`[data-ad-card="${ad.icao}-${i}"]`);
      if (!cardEl) return;
      const b = ad.basulm;
      const st = getStyle(b.t);
      const role = i === 0 ? 'depart' : (i === uniquePoints.length - 1 && !STATE.loop ? 'arrivee' : 'etape');
      const roleLabel = role === 'depart' ? 'départ' : role === 'arrivee' ? 'arrivée' : 'étape';
      const roleColor = role === 'depart' ? 'green' : role === 'arrivee' ? 'red' : 'blue';
      const headerEl = cardEl.querySelector('.border-b');
      if (headerEl) {
        headerEl.innerHTML = `
          <div class="flex items-center gap-2 flex-wrap">
            <span class="dot dot-${roleColor}"></span>
            <span class="text-xs uppercase tracking-wide text-muted">${roleLabel}</span>
            <span style="display:inline-block;padding:2px 6px;border-radius:9999px;background:${st.fill};color:white;font-size:10px;font-weight:600;">${st.icon} PLATEFORME ULM</span>
            <span class="pre-mono font-medium">${escapeHtml(ad.icao)}</span>
            <span class="text-sm">${escapeHtml(ad.name)}</span>
          </div>
        `;
      }
      const bodyEl = cardEl.querySelector('.p-4.grid');
      if (bodyEl) {
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
        if (b.em) infoHtml += `<div><strong>Email :</strong> <a href="mailto:${escapeHtml(b.em)}" class="text-blue-600 hover:underline">${escapeHtml(b.em)}</a></div>`;
        if (b.fac) infoHtml += `<div><strong>Facilités :</strong> ${escapeHtml(b.fac)}</div>`;
        if (b.carb) infoHtml += `<div><strong>Carburant :</strong> ${escapeHtml(b.carb)}</div>`;
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
        if (b.auth) infoHtml += `<div class="warn-box mt-3 text-xs"><strong>⚠️ AUTORISATION OBLIGATOIRE</strong><br>Contacter le gestionnaire avant toute utilisation.</div>`;
        infoHtml += `<div style="background:#FEF3C7;color:#92400E;padding:6px 8px;border-radius:4px;font-size:11px;margin-top:8px;">
          ℹ️ <strong>Pas de carte VAC officielle</strong> — Cette plateforme BASULM n'est pas publiée par la DGAC. Voir la fiche détaillée sur <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">BASULM</a>.
        </div>`;
        if (b.cs) infoHtml += `<div class="mt-2"><h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-1">consignes</h4><div class="text-xs muted-bg p-2 rounded">${escapeHtml(b.cs).replace(/\n/g, '<br>')}</div></div>`;
        if (b.info) infoHtml += `<details class="mt-2"><summary class="text-xs cursor-pointer text-muted">+ infos complémentaires</summary><div class="text-xs mt-1 muted-bg p-2 rounded">${escapeHtml(b.info).replace(/\n/g, '<br>')}</div></details>`;

        let meteoHtml = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">météo de référence</h4>`;
        let alt = [];
        try { if (typeof findNearbyMetarStations === 'function') alt = findNearbyMetarStations(ad.lat, ad.lon, ad.icao, 50, 3); } catch (e) {}
        if (alt.length > 0) {
          meteoHtml += `<div class="text-xs text-muted mb-2">Pas de METAR sur la plateforme. Stations les plus proches dans 50 km :</div>`;
          meteoHtml += `<ul class="text-xs space-y-1">`;
          alt.forEach(s => {
            meteoHtml += `<li class="flex items-center justify-between gap-2">
              <a href="https://aviationweather.gov/data/metar/?ids=${s.icao}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">
                <span class="pre-mono">${escapeHtml(s.icao)}</span> ${escapeHtml(s.name)}
              </a>
              <span class="text-muted">${fmtDistKm(s.distKm)}</span>
            </li>`;
          });
          meteoHtml += `</ul>`;
          meteoHtml += `<div class="text-xs text-muted mt-2 italic">Tape une de ces stations dans le trajet pour récupérer son METAR/vent.</div>`;
        } else {
          meteoHtml += `<div class="text-xs text-muted">Aucune station METAR officielle dans un rayon de 50 km.</div>`;
        }
        bodyEl.innerHTML = `<div>${infoHtml}</div><div>${meteoHtml}</div>`;
      }
      const det = cardEl.querySelector('details');
      if (det) det.remove();
    });
    if (window.lucide) window.lucide.createIcons();
  }

  // ============ WRAP DETAILS POUR LES BLOCS ===================
  function wrapInDetails(el, title, open = true) {
    if (!el || el.dataset.wrapped === '1') return null;
    const details = document.createElement('details');
    details.className = el.className;
    if (open) details.setAttribute('open', '');
    details.dataset.wrapped = '1';
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;padding:0;margin:0;';
    summary.innerHTML = `
      <span class="section-title text-sm" style="text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">${escapeHtml(title)}</span>
      <span class="block-chev" style="font-size:16px;transition:transform 0.2s;color:var(--muted-foreground);">▾</span>
    `;
    details.appendChild(summary);
    const inner = document.createElement('div');
    inner.style.cssText = 'margin-top:12px;';
    while (el.firstChild) inner.appendChild(el.firstChild);
    details.appendChild(inner);
    details.addEventListener('toggle', () => {
      const c = details.querySelector('.block-chev');
      if (c) c.style.transform = details.open ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    el.parentNode.replaceChild(details, el);
    return details;
  }

  function makeBlocksToggleable() {
    const airspaces = document.getElementById('airspaces-section');
    if (airspaces && airspaces.dataset.wrapped !== '1') {
      const inner = airspaces.querySelector('.card');
      if (inner) { wrapInDetails(inner, 'Zones aériennes traversées', true); airspaces.dataset.wrapped = '1'; }
    }
    const tripSummary = document.getElementById('trip-summary');
    if (tripSummary && tripSummary.dataset.wrapped !== '1') {
      const inner = tripSummary.querySelector('.card');
      if (inner) { wrapInDetails(inner, 'Résumé du trajet', true); tripSummary.dataset.wrapped = '1'; }
    }
  }

  function makeAdCardsToggleable() {
    document.querySelectorAll('[data-ad-card]').forEach(card => {
      if (card.dataset.wrapped === '1') return;
      const header = card.querySelector('.border-b');
      if (!header) return;
      const details = document.createElement('details');
      details.className = card.className;
      details.setAttribute('open', '');
      details.dataset.adCard = card.dataset.adCard;
      details.dataset.wrapped = '1';
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-right:12px;';
      const headerClone = header.cloneNode(true);
      headerClone.classList.remove('border-b');
      headerClone.style.flex = '1';
      headerClone.style.borderBottom = 'none';
      const chev = document.createElement('span');
      chev.style.cssText = 'font-size:16px;transition:transform 0.2s;flex-shrink:0;';
      chev.className = 'ad-card-chev';
      chev.textContent = '▾';
      summary.appendChild(headerClone);
      summary.appendChild(chev);
      const body = document.createElement('div');
      Array.from(card.children).forEach(c => { if (c !== header) body.appendChild(c); });
      details.appendChild(summary);
      details.appendChild(body);
      details.addEventListener('toggle', () => {
        chev.style.transform = details.open ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
      card.parentNode.replaceChild(details, card);
    });
  }

  makeBlocksToggleable();

  // ============ LAYOUT 2 COLONNES DESKTOP ======================
  function reflow2ColLayout() {
    const airspaces = document.getElementById('airspaces-section');
    const tripSummary = document.getElementById('trip-summary');
    if (!airspaces || !tripSummary) return;
    if (airspaces.parentNode !== tripSummary.parentNode) return;
    if (airspaces.parentNode.dataset.reflowed === '1') return;
    const wrapper = document.createElement('div');
    wrapper.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3';
    airspaces.parentNode.insertBefore(wrapper, airspaces);
    airspaces.classList.remove('mt-3');
    tripSummary.classList.remove('mt-3');
    wrapper.appendChild(airspaces);
    wrapper.appendChild(tripSummary);
    wrapper.parentNode.dataset.reflowed = '1';
  }
  reflow2ColLayout();

  // ============ ONGLET "SOURCES" ===============================
  function hideAllTabs() {
    document.getElementById('tab-plan')?.classList.add('hidden');
    document.getElementById('tab-acft')?.classList.add('hidden');
    document.getElementById('tab-sources')?.classList.add('hidden');
    document.getElementById('tab-params')?.classList.add('hidden');
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

  function addSourcesTab() {
    const acftTab = document.querySelector('.tab-btn[data-tab="acft"]');
    if (!acftTab || document.querySelector('.tab-btn[data-tab="sources"]')) return;
    const tab = document.createElement('span');
    tab.className = 'tab-btn';
    tab.dataset.tab = 'sources';
    tab.textContent = 'sources';
    acftTab.parentNode.insertBefore(tab, acftTab.nextSibling);
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'tab-sources';
    section.className = 'hidden';
    section.innerHTML = buildSourcesHtml();
    main.appendChild(section);
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      hideAllTabs();
      section.classList.remove('hidden');
      closeMobileMenu();
    });
    document.querySelectorAll('.tab-btn[data-tab="plan"], .tab-btn[data-tab="acft"]').forEach(b => {
      b.addEventListener('click', () => section.classList.add('hidden'));
    });
  }

  function buildSourcesHtml() {
    return `
      <div class="card p-4 space-y-4">
        <h2 class="section-title text-sm">sources &amp; liens utilisés</h2>
        <p class="text-xs text-muted">L'app agrège plusieurs sources officielles et open data pour offrir un briefing pré-vol complet, sans avoir besoin de créer un compte sur chaque service.</p>
        <div class="space-y-3 text-sm">
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">✈️ Aérodromes officiels (447)</h3>
            <p class="text-xs">Source : <strong>DGAC</strong> via PIAF.</p>
            <a href="https://piaf.stac.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">piaf.stac.aviation-civile.gouv.fr</a>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (${PLATFORMS.length})</h3>
            <p class="text-xs">Source : <strong>BASULM</strong> — FFPLUM.</p>
            <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">basulm.ffplum.fr</a>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP</h3>
            <p class="text-xs">Source : <strong>SIA</strong>. Liens construits selon cycle AIRAC.</p>
            <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">sia.aviation-civile.gouv.fr</a>
            <p class="text-xs text-muted mt-1">⚠️ Pas de carte VAC pour les plateformes BASULM (non publiées par DGAC).</p>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3>
            <p class="text-xs">METAR/TAF : <strong>aviationweather.gov</strong> (NOAA, gratuit).<br>Vent multi-niveaux : <strong>Open-Meteo</strong> (ECMWF, gratuit).</p>
            <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviationweather.gov</a> · 
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">open-meteo.com</a>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📡 TEMSI</h3>
            <p class="text-xs">Source : <strong>Aeroweb</strong> de Météo France (compte gratuit).</p>
            <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviation.meteo.fr</a>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3>
            <p class="text-xs">Source : <strong>OpenAIP</strong> (clé API gratuite).</p>
            <a href="https://www.openaip.net/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">openaip.net</a>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🗺️ Fonds de carte</h3>
            <p class="text-xs">OpenStreetMap · CartoDB Positron.</p>
          </div>
          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📡 Vue satellite</h3>
            <p class="text-xs">Source : <strong>Windy.com</strong> (iframe gratuit).</p>
          </div>
        </div>
        <div class="border-t border-thin pt-3 mt-4">
          <h3 class="font-semibold text-sm mb-2">⚠️ Avertissement</h3>
          <p class="text-xs text-muted">AutogyroDash est un outil d'aide à la planification VFR. <strong>Le pilote reste seul responsable de la vérification de toutes les informations officielles avant chaque vol</strong> (cartes VAC à jour, NOTAM, AZBA, METAR/TAF...).</p>
          <p class="text-xs text-muted mt-2">Aucune donnée pilote n'est envoyée à un serveur. Tout est stocké localement dans le navigateur.</p>
        </div>
        <div class="text-xs text-muted text-center pt-2">
          AutogyroDash v0.5.3 · <a href="https://github.com/killianmenard/autogyro-briefing-buddy" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">code source GitHub</a>
        </div>
      </div>
    `;
  }
  addSourcesTab();

  // ============ ONGLET "PARAMÈTRES" ============================
  function addParamsTab() {
    const sourcesTab = document.querySelector('.tab-btn[data-tab="sources"]');
    if (!sourcesTab || document.querySelector('.tab-btn[data-tab="params"]')) return;
    const tab = document.createElement('span');
    tab.className = 'tab-btn';
    tab.dataset.tab = 'params';
    tab.textContent = 'paramètres';
    sourcesTab.parentNode.insertBefore(tab, sourcesTab.nextSibling);

    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'tab-params';
    section.className = 'hidden';
    section.innerHTML = buildParamsHtml();
    main.appendChild(section);

    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      hideAllTabs();
      section.classList.remove('hidden');
      closeMobileMenu();
      refreshParamsState();
    });
    document.querySelectorAll('.tab-btn[data-tab="plan"], .tab-btn[data-tab="acft"], .tab-btn[data-tab="sources"]').forEach(b => {
      b.addEventListener('click', () => section.classList.add('hidden'));
    });
    setupParamsHandlers();
  }

  function buildParamsHtml() {
    return `
      <div class="card p-4 space-y-5">
        <h2 class="section-title text-sm">paramètres de l'interface</h2>
        <p class="text-xs text-muted">Toutes les options de personnalisation et actions sont regroupées ici.</p>

        <div class="muted-bg p-3 rounded">
          <h3 class="text-sm font-semibold mb-2">📏 Unités d'affichage</h3>
          <div class="space-y-2">
            <div>
              <div class="text-xs text-muted mb-1">Vitesse</div>
              <div class="flex gap-2">
                <button class="p-speed-btn flex-1 px-3 py-2 rounded border" data-val="kt" style="border-color:var(--border);font-size:13px;">kt (nœuds)</button>
                <button class="p-speed-btn flex-1 px-3 py-2 rounded border" data-val="kmh" style="border-color:var(--border);font-size:13px;">km/h</button>
              </div>
            </div>
            <div>
              <div class="text-xs text-muted mb-1">Distance</div>
              <div class="flex gap-2">
                <button class="p-dist-btn flex-1 px-3 py-2 rounded border" data-val="nm" style="border-color:var(--border);font-size:13px;">NM (nautiques)</button>
                <button class="p-dist-btn flex-1 px-3 py-2 rounded border" data-val="km" style="border-color:var(--border);font-size:13px;">km</button>
              </div>
            </div>
          </div>
        </div>

        <div class="muted-bg p-3 rounded">
          <h3 class="text-sm font-semibold mb-2">🎨 Thème</h3>
          <div class="flex gap-2 mb-2">
            <button class="p-theme-btn flex-1 px-3 py-2 rounded border" data-val="auto" style="border-color:var(--border);font-size:13px;">📱 Auto (système)</button>
            <button class="p-theme-btn flex-1 px-3 py-2 rounded border" data-val="light" style="border-color:var(--border);font-size:13px;">☀️ Clair</button>
            <button class="p-theme-btn flex-1 px-3 py-2 rounded border" data-val="dark" style="border-color:var(--border);font-size:13px;">🌙 Sombre</button>
          </div>
          <p class="text-xs text-muted">En mode auto, l'app suit le réglage clair/sombre de ton appareil.</p>
        </div>

        <div class="muted-bg p-3 rounded">
          <h3 class="text-sm font-semibold mb-2">🛡️ Clé API OpenAIP</h3>
          <p class="text-xs text-muted mb-2">Permet d'afficher les espaces aériens sur la carte. <a href="https://app.openaip.net/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">Profile → API Clients</a>.</p>
          <div class="flex gap-2 flex-wrap">
            <input type="text" id="p-openaip-input" class="ad-input flex-1" style="min-width:200px;" placeholder="Colle ta clé OpenAIP..." />
            <button id="p-openaip-save" class="px-3 py-2 rounded bg-black text-white" style="font-size:13px;">Enregistrer</button>
            <button id="p-openaip-clear" class="px-3 py-2 rounded border" style="border-color:var(--border);font-size:13px;">Effacer</button>
          </div>
          <div id="p-openaip-status" class="text-xs mt-2"></div>
          <button id="p-openaip-reload" class="mt-2 w-full px-3 py-2 rounded border bg-white hover:bg-gray-50" style="border-color:var(--border);font-size:13px;color:var(--foreground);">
            🔄 Recharger l'overlay des espaces aériens
          </button>
          <p class="text-xs text-muted mt-1">Si les zones (TMA, CTR, etc.) ne s'affichent pas, force le rechargement ici.</p>
        </div>

        <div class="muted-bg p-3 rounded">
          <h3 class="text-sm font-semibold mb-2">⚡ Actions rapides</h3>
          <div class="space-y-2">
            <button id="p-refresh" class="w-full px-3 py-2 rounded border bg-white hover:bg-gray-50 flex items-center justify-center gap-2" style="border-color:var(--border);font-size:13px;color:var(--foreground);">
              🔄 Rafraîchir la météo
            </button>
            <button id="p-clear" class="w-full px-3 py-2 rounded border bg-white hover:bg-gray-50 flex items-center justify-center gap-2" style="border-color:var(--border);font-size:13px;color:var(--foreground);">
              ✕ Vider le trajet
            </button>
            <button id="p-reset" class="w-full px-3 py-2 rounded border flex items-center justify-center gap-2" style="border-color:#FCA5A5;color:#991B1B;font-size:13px;background:white;">
              🗑️ Tout réinitialiser (sauf clé OpenAIP)
            </button>
          </div>
        </div>

        <div class="text-xs text-muted text-center pt-2 border-t border-thin">
          Version v0.8.11 · <a href="#" id="p-link-sources" class="text-blue-600 hover:underline">voir les sources</a>
        </div>
      </div>
    `;
  }

  function refreshParamsState() {
    // v0.6.31 — l'état actif prend directement la couleur du thème (bleu ciel le
    // jour, blanc cassé la nuit) au lieu de var(--foreground) (= noir le jour).
    // Plus de flash noir→bleu : la bonne couleur est posée dès le 1er rendu.
    const _isDark = document.documentElement.classList.contains('dark');
    const _accent = _isDark ? '#F0EBD9' : '#4DC2F1';
    const _accentTxt = _isDark ? '#0A1838' : '#ffffff';
    // v0.6.32 — !important sur actif ET inactif : garantit la deselection
    // (sinon un residu !important d'un ancien recolor laisse 2 boutons bleus).
    const _paint = (b, active) => {
      b.style.setProperty('background-color', active ? _accent : 'var(--card)', 'important');
      b.style.setProperty('color', active ? _accentTxt : 'var(--foreground)', 'important');
      b.style.fontWeight = active ? '600' : '400';
    };
    document.querySelectorAll('.p-speed-btn').forEach(b => {
      _paint(b, b.dataset.val === (typeof SPEED_UNIT !== 'undefined' ? SPEED_UNIT : 'kt'));
    });
    document.querySelectorAll('.p-dist-btn').forEach(b => {
      _paint(b, b.dataset.val === (typeof DIST_UNIT !== 'undefined' ? DIST_UNIT : 'nm'));
    });
    const isManual = localStorage.getItem(THEME_MANUAL_KEY) === '1';
    const isDark = _isDark;
    let activeTheme = 'auto';
    if (isManual) activeTheme = isDark ? 'dark' : 'light';
    document.querySelectorAll('.p-theme-btn').forEach(b => {
      _paint(b, b.dataset.val === activeTheme);
    });
    const key = (typeof getOpenaipKey === 'function') ? getOpenaipKey() : '';
    const inp = document.getElementById('p-openaip-input');
    const status = document.getElementById('p-openaip-status');
    if (inp) inp.value = key || '';
    if (status) {
      if (key) {
        status.innerHTML = '<span style="color:#15803D;">✓ Clé enregistrée — espaces aériens affichés.</span>';
      } else {
        status.innerHTML = '<span style="color:#92400E;">⚠ Aucune clé — les espaces aériens ne s\'affichent pas.</span>';
      }
    }
  }

  function setupParamsHandlers() {
    document.body.addEventListener('click', e => {
      const speedBtn = e.target.closest('.p-speed-btn');
      if (speedBtn) {
        const val = speedBtn.dataset.val;
        if (typeof SPEED_UNIT !== 'undefined' && SPEED_UNIT !== val && typeof toggleSpeedUnit === 'function') toggleSpeedUnit();
        refreshParamsState();
        return;
      }
      const distBtn = e.target.closest('.p-dist-btn');
      if (distBtn) {
        const val = distBtn.dataset.val;
        if (typeof DIST_UNIT !== 'undefined' && DIST_UNIT !== val && typeof toggleDistUnit === 'function') toggleDistUnit();
        refreshParamsState();
        return;
      }
      const themeBtn = e.target.closest('.p-theme-btn');
      if (themeBtn) {
        const val = themeBtn.dataset.val;
        if (val === 'auto') {
          localStorage.removeItem(THEME_MANUAL_KEY);
          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          if (typeof applyTheme === 'function') applyTheme(mq.matches ? 'dark' : 'light');
          if (typeof showToast === 'function') showToast('Thème : sync système activé', 'ok', 2500);
        } else {
          localStorage.setItem(THEME_MANUAL_KEY, '1');
          if (typeof applyTheme === 'function') applyTheme(val);
        }
        refreshParamsState();
        return;
      }
    });
    document.body.addEventListener('click', e => {
      if (e.target.id === 'p-openaip-save') {
        const inp = document.getElementById('p-openaip-input');
        const k = (inp?.value || '').trim();
        if (!k) {
          if (typeof showToast === 'function') showToast('Saisis une clé OpenAIP', 'warn', 3000);
          return;
        }
        if (typeof setOpenaipKey === 'function') setOpenaipKey(k);
        if (typeof refreshOpenaipLayers === 'function') refreshOpenaipLayers();
        if (typeof showToast === 'function') showToast('Clé OpenAIP enregistrée', 'ok', 2500);
        refreshParamsState();
      }
      if (e.target.id === 'p-openaip-clear') {
        if (confirm('Effacer la clé OpenAIP ?')) {
          if (typeof setOpenaipKey === 'function') setOpenaipKey('');
          if (typeof refreshOpenaipLayers === 'function') refreshOpenaipLayers();
          refreshParamsState();
        }
      }
      // NOUVEAU v0.5.3 : bouton recharger overlay
      if (e.target.id === 'p-openaip-reload') {
        forceOpenaipReload();
        if (typeof showToast === 'function') showToast('Overlay OpenAIP rechargé', 'ok', 2500);
      }
      if (e.target.id === 'p-refresh') {
        if (typeof refreshWeather === 'function') refreshWeather();
      }
      if (e.target.id === 'p-clear') {
        document.getElementById('clear-trip')?.click();
      }
      if (e.target.id === 'p-reset') {
        if (typeof resetAll === 'function') resetAll();
      }
      if (e.target.id === 'p-link-sources') {
        e.preventDefault();
        document.querySelector('.tab-btn[data-tab="sources"]')?.click();
      }
    });
  }
  addParamsTab();

  // ============ FERMETURE MENU MOBILE SUR TAB ==================
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => closeMobileMenu());
  });

  // ============ THÈME ICÔNE + SYNC iOS =========================
  function setupThemeIconAndSync() {
    const themeBtn = document.getElementById('theme-toggle');
    if (!themeBtn) return;
    const label = document.getElementById('theme-label');
    if (label) label.style.display = 'none';
    themeBtn.style.minWidth = '36px';
    themeBtn.style.width = '36px';
    themeBtn.style.padding = '0';
    if (typeof toggleTheme === 'function') {
      const _orig = toggleTheme;
      window.toggleTheme = function() {
        localStorage.setItem(THEME_MANUAL_KEY, '1');
        _orig();
        if (typeof refreshParamsState === 'function') refreshParamsState();
      };
      const newBtn = themeBtn.cloneNode(true);
      themeBtn.parentNode.replaceChild(newBtn, themeBtn);
      newBtn.addEventListener('click', () => window.toggleTheme());
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applySys() {
      if (localStorage.getItem(THEME_MANUAL_KEY) === '1') return;
      const target = mq.matches ? 'dark' : 'light';
      const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      if (target !== cur && typeof applyTheme === 'function') applyTheme(target);
    }
    applySys();
    if (mq.addEventListener) mq.addEventListener('change', applySys);
    else if (mq.addListener) mq.addListener(applySys);
  }
  setupThemeIconAndSync();

  // ============ CSS INJECTION GLOBALE v0.5.3 ===================
  const v053Css = document.createElement('style');
  v053Css.id = 'basulm-v0_5_3-css';
  v053Css.textContent = `
/* === Wrap METAR/TAF brut (mobile + desktop) === */
pre.pre-mono,
pre {
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  overflow-x: hidden !important;
}

/* === Épure pilule desktop : cache unités/thème/actions (tout est dans Paramètres) === */
@media (min-width: 769px) {
  .header-pill .header-unit-btn,
  .header-pill .header-action-btn,
  .header-pill #theme-toggle,
  .header-pill [data-units-wrapper] {
    display: none !important;
  }
  /* Cacher tous les dividers (plus rien à séparer) */
  .header-pill > .divider,
  .header-pill-extras > .divider {
    display: none !important;
  }
  /* Centrer les 4 tabs */
  .header-pill {
    justify-content: center !important;
  }
  .header-pill-extras {
    justify-content: center !important;
    flex: 1 !important;
  }
  /* Espacement plus généreux entre les tabs */
  .header-pill-extras > div:first-of-type {
    gap: 16px !important;
  }
}

/* === Mobile : pilule simplifiée + tabs en colonne === */
@media (max-width: 768px) {
  /* Cacher tous les contrôles non-tabs */
  .header-pill-extras .header-unit-btn,
  .header-pill-extras .header-action-btn,
  .header-pill-extras #theme-toggle,
  .header-pill-extras [data-units-wrapper] {
    display: none !important;
  }
  /* Cacher tous les dividers sauf le premier (séparation brand/tabs) */
  .header-pill-extras > .divider:nth-of-type(n+2) {
    display: none !important;
  }
  /* TABS EN COLONNE : nouveau sélecteur :has() (Safari 15.4+) */
  .header-pill.menu-open .header-pill-extras > div:has(.tab-btn) {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 4px !important;
    width: 100% !important;
  }
  /* Fallback si :has() non supporté : on cible le 2e div */
  .header-pill.menu-open .header-pill-extras > div:nth-of-type(2) {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 4px !important;
    width: 100% !important;
  }
  /* Style des tabs en mode menu mobile */
  .header-pill.menu-open .tab-btn {
    padding: 12px 16px !important;
    border-radius: 6px !important;
    background: var(--muted) !important;
    text-align: center !important;
    font-size: 14px !important;
    border-bottom: none !important;
  }
  .header-pill.menu-open .tab-btn.active {
    background: var(--foreground) !important;
    color: var(--bg) !important;
    font-weight: 600 !important;
  }
  /* Heure visible mais discrète sous les tabs */
  .header-pill.menu-open #briefing-time {
    text-align: center !important;
    margin-top: 4px !important;
    padding: 4px !important;
    font-size: 11px !important;
    opacity: 0.7;
  }
}

/* === Carte plein écran : 1 SEUL bouton "quitter" (cacher le top-right redondant) === */
.map-fullscreen #map-exit-fs-btn,
.map-fullscreen-wf #wf-exit-fs-btn {
  display: none !important;
}
/* S'assurer que le bouton "quitter" top-left soit bien visible et tappable mobile */
.map-fullscreen .map-fs-close {
  min-height: 44px !important;
  padding: 10px 18px !important;
  font-size: 15px !important;
}
  `;
  document.head.appendChild(v053Css);

  // ============ COPYRIGHT FOOTER ================================
  const mainEl = document.querySelector('main');
  if (mainEl && !document.getElementById('basulm-credit')) {
    const credit = document.createElement('div');
    credit.id = 'basulm-credit';
    credit.style.cssText = 'text-align:center;font-size:10px;color:var(--muted-foreground);padding:12px 8px 24px 8px;border-top:1px solid var(--border);margin-top:24px;';
    credit.innerHTML = `
      Aérodromes : <strong>DGAC</strong>. Plateformes ULM : <strong>BASULM / FFPLUM</strong>. 
      Météo : aviationweather.gov, open-meteo.com. Espaces aériens : OpenAIP. 
      Voir l'onglet <a href="#" onclick="document.querySelector('.tab-btn[data-tab=sources]')?.click();return false;" class="text-blue-600 hover:underline"><strong>sources</strong></a> pour le détail.
      <br>
      <span class="text-muted">Données indicatives — le pilote reste seul responsable de la vérification SIA / METAR / TAF / NOTAM / AZBA avant chaque vol.</span>
    `;
    mainEl.appendChild(credit);
  }

  // ============ TOAST BOOT ======================================
  if (typeof showToast === 'function') {
    showToast(`✓ ${PLATFORMS.length} plateformes ULM · v0.5.3`, 'ok', 3000);
  }
  console.log('[BASULM v0.5.3] Intégration terminée');
})();
