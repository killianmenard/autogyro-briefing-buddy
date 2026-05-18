/* ============================================================
   AutogyroDash — BASULM integration v0.5.1
   ------------------------------------------------------------
   v0.5.0 baseline (markers + toggle + autocomplete + fiche)
   v0.5.1 ajouts :
     - Légende couleurs sous toggle BASULM
     - Click marker → popup détails (avec bouton ajouter)
     - Tous les blocs (carte, zones, résumé, fiches) en toggle
     - Onglet "sources" dans le menu
     - Dropdown unités (kt/kmh + NM/km)
     - Thème icône seule + sync iOS (matchMedia)
     - Mention "pas de carte VAC officielle" pour BASULM
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
            && document.getElementById('map-controls')) {
          resolve();
        } else setTimeout(check, 120);
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

  console.log('[BASULM v0.5.1] ' + PLATFORMS.length + ' plateformes ULM chargées');

  // Bump version DOM
  try {
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.5.1');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.5.1';
    });
  } catch (e) {}

  const CAT_STYLE = {
    baseulm:      { color: '#EA580C', fill: '#FB923C', icon: '🛩️', label: 'Base ULM' },
    aerodrome:    { color: '#7C3AED', fill: '#A78BFA', icon: '✈️', label: 'Aérodrome privé' },
    altisurface:  { color: '#A21CAF', fill: '#D946EF', icon: '⛰️', label: 'Altisurface' },
    hydrosurface: { color: '#0E7490', fill: '#22D3EE', icon: '💧', label: 'Hydrosurface' },
    paramoteur:   { color: '#15803D', fill: '#4ADE80', icon: '🪂', label: 'Paramoteur' },
    autre:        { color: '#525252', fill: '#A3A3A3', icon: '📍', label: 'Autre' }
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
    const t = p.basulm.t;
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // =========== MARKERS + POPUP =================================
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

  // =========== TOGGLE BASULM + LÉGENDE =========================
  const mapControls = document.getElementById('map-controls');
  if (mapControls) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'border-top:1px solid var(--border);padding-top:8px;margin-top:8px;';

    const toggleBlock = document.createElement('div');
    toggleBlock.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div class="flex items-center gap-2 flex-wrap">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FB923C;border:1.5px solid #EA580C;"></span>
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

    const legend = document.createElement('details');
    legend.style.cssText = 'margin-top:8px;';
    legend.innerHTML = `
      <summary style="cursor:pointer;font-size:11px;color:var(--muted-foreground);list-style:none;display:flex;align-items:center;gap:4px;">
        <span class="bl-chev" style="display:inline-block;transition:transform 0.2s;">▶</span>
        <span>légende des couleurs (${legendItems.length} types)</span>
      </summary>
      <div style="margin-top:6px;padding-left:14px;">${legendHtml}</div>
    `;
    legend.addEventListener('toggle', () => {
      const chev = legend.querySelector('.bl-chev');
      if (chev) chev.style.transform = legend.open ? 'rotate(90deg)' : 'rotate(0deg)';
    });
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

  // =========== AUTOCOMPLETE MÉLANGÉE ===========================
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

  // =========== HOOK REFRESH AD CARDS ===========================
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

  // =========== TOUS LES BLOCS EN TOGGLE ========================
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
    const mapContainer = document.getElementById('map-container');
    if (mapContainer && mapContainer.dataset.wrapped !== '1') {
      const d = wrapInDetails(mapContainer, 'Carte interactive', true);
      if (d) {
        d.addEventListener('toggle', () => {
          if (d.open && typeof map !== 'undefined' && map) {
            setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 100);
          }
        });
      }
    }
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

  // =========== ONGLET "SOURCES" ================================
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
      document.getElementById('tab-plan')?.classList.add('hidden');
      document.getElementById('tab-acft')?.classList.add('hidden');
      section.classList.remove('hidden');
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
            <p class="text-xs">Source : <strong>DGAC</strong> via PIAF (Portail d'Information Aéronautique Français).</p>
            <a href="https://piaf.stac.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">piaf.stac.aviation-civile.gouv.fr</a>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (${PLATFORMS.length})</h3>
            <p class="text-xs">Source : <strong>BASULM</strong> — Fédération Française d'ULM (FFPLUM).</p>
            <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">basulm.ffplum.fr</a>
            <p class="text-xs text-muted mt-1">Bases ULM, aérodromes privés, altisurfaces, hydrosurfaces, plateformes paramoteur.</p>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP</h3>
            <p class="text-xs">Source : <strong>SIA</strong> (Service de l'Information Aéronautique). Liens directs construits selon le cycle AIRAC en cours.</p>
            <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">sia.aviation-civile.gouv.fr</a>
            <p class="text-xs text-muted mt-1">⚠️ Pas de carte VAC officielle pour les plateformes BASULM (non publiées par la DGAC).</p>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3>
            <p class="text-xs">METAR / TAF : <strong>aviationweather.gov</strong> (NOAA, gratuit, via proxy CORS).<br>
            Vent multi-niveaux : <strong>Open-Meteo</strong> (modèle ECMWF, gratuit).</p>
            <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviationweather.gov</a> · 
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">open-meteo.com</a>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📡 TEMSI (phénomènes significatifs)</h3>
            <p class="text-xs">Source : <strong>Aeroweb</strong> de Météo France (compte gratuit requis).</p>
            <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviation.meteo.fr</a>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3>
            <p class="text-xs">Source : <strong>OpenAIP</strong> (clé API gratuite). Détection automatique des zones traversées (TMA, CTR, R, D, P, ATZ...).</p>
            <a href="https://www.openaip.net/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">openaip.net</a>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">🗺️ Fonds de carte</h3>
            <p class="text-xs">OpenStreetMap (carte aéronautique) · CartoDB Positron (météo France).</p>
            <a href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">openstreetmap.org</a>
          </div>

          <div class="muted-bg p-3 rounded">
            <h3 class="font-semibold text-sm mb-1">📡 Vue satellite</h3>
            <p class="text-xs">Source : <strong>Windy.com</strong> (iframe embed, gratuit).</p>
            <a href="https://www.windy.com/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">windy.com</a>
          </div>
        </div>

        <div class="border-t border-thin pt-3 mt-4">
          <h3 class="font-semibold text-sm mb-2">⚠️ Avertissement</h3>
          <p class="text-xs text-muted">
            AutogyroDash est un outil d'aide à la planification VFR. Les données affichées sont indicatives et peuvent contenir des erreurs ou des informations obsolètes. 
            <strong>Le pilote reste seul responsable de la vérification de toutes les informations officielles avant chaque vol</strong> (cartes VAC à jour, NOTAM, AZBA, METAR/TAF, état des plateformes...).
          </p>
          <p class="text-xs text-muted mt-2">Aucune donnée pilote n'est envoyée à un serveur. Tout est stocké localement dans le navigateur (localStorage).</p>
        </div>

        <div class="text-xs text-muted text-center pt-2">
          AutogyroDash v0.5.1 · <a href="https://github.com/killianmenard/autogyro-briefing-buddy" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">code source GitHub</a>
        </div>
      </div>
    `;
  }
  addSourcesTab();

  // =========== DROPDOWN UNITÉS =================================
  function setupUnitsDropdown() {
    const speedBtn = document.getElementById('unit-speed-toggle');
    const distBtn = document.getElementById('unit-dist-toggle');
    if (!speedBtn || !distBtn) return;
    speedBtn.style.display = 'none';
    distBtn.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-block;';
    const btn = document.createElement('button');
    btn.id = 'units-dropdown-btn';
    btn.className = 'header-unit-btn';
    btn.title = 'Changer les unités';
    btn.style.minWidth = '95px';
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      <span id="units-dropdown-label">kt · NM</span>
    `;
    wrapper.appendChild(btn);

    const panel = document.createElement('div');
    panel.style.cssText = `display:none;position:absolute;top:calc(100% + 6px);right:0;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px;min-width:180px;z-index:1500;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
    panel.innerHTML = `
      <div style="margin-bottom:8px;">
        <div style="font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Vitesse</div>
        <div style="display:flex;gap:4px;">
          <button class="u-opt" data-kind="speed" data-val="kt" style="flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--foreground);">kt</button>
          <button class="u-opt" data-kind="speed" data-val="kmh" style="flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--foreground);">km/h</button>
        </div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Distance</div>
        <div style="display:flex;gap:4px;">
          <button class="u-opt" data-kind="dist" data-val="nm" style="flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--foreground);">NM</button>
          <button class="u-opt" data-kind="dist" data-val="km" style="flex:1;padding:5px 8px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--foreground);">km</button>
        </div>
      </div>
    `;
    wrapper.appendChild(panel);
    speedBtn.parentNode.insertBefore(wrapper, speedBtn);

    function updateLabel() {
      const lbl = document.getElementById('units-dropdown-label');
      if (!lbl) return;
      const s = (typeof SPEED_UNIT !== 'undefined') ? (SPEED_UNIT === 'kmh' ? 'km/h' : 'kt') : 'kt';
      const d = (typeof DIST_UNIT !== 'undefined') ? (DIST_UNIT === 'km' ? 'km' : 'NM') : 'NM';
      lbl.textContent = `${s} · ${d}`;
      panel.querySelectorAll('.u-opt').forEach(b => {
        const kind = b.dataset.kind, val = b.dataset.val;
        const active = (kind === 'speed' && val === (typeof SPEED_UNIT !== 'undefined' ? SPEED_UNIT : 'kt'))
                    || (kind === 'dist' && val === (typeof DIST_UNIT !== 'undefined' ? DIST_UNIT : 'nm'));
        b.style.background = active ? 'var(--foreground)' : 'var(--card)';
        b.style.color = active ? 'var(--bg)' : 'var(--foreground)';
        b.style.fontWeight = active ? '600' : '400';
      });
    }
    updateLabel();

    btn.addEventListener('click', e => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) panel.style.display = 'none';
    });
    panel.querySelectorAll('.u-opt').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        const kind = opt.dataset.kind, val = opt.dataset.val;
        if (kind === 'speed' && typeof SPEED_UNIT !== 'undefined' && SPEED_UNIT !== val) {
          if (typeof toggleSpeedUnit === 'function') toggleSpeedUnit();
        } else if (kind === 'dist' && typeof DIST_UNIT !== 'undefined' && DIST_UNIT !== val) {
          if (typeof toggleDistUnit === 'function') toggleDistUnit();
        }
        updateLabel();
      });
    });
  }
  setupUnitsDropdown();

  // =========== THÈME ICÔNE SEULE + SYNC iOS ====================
  function setupThemeIconAndSync() {
    const themeBtn = document.getElementById('theme-toggle');
    if (!themeBtn) return;
    const label = document.getElementById('theme-label');
    if (label) label.style.display = 'none';
    themeBtn.style.minWidth = '36px';
    themeBtn.style.width = '36px';
    themeBtn.style.padding = '0';

    // Wrap toggleTheme pour marquer l'override manuel
    if (typeof toggleTheme === 'function') {
      const _orig = toggleTheme;
      window.toggleTheme = function() {
        localStorage.setItem(THEME_MANUAL_KEY, '1');
        _orig();
      };
      // Re-bind click via clone (le listener original pointe vers l'ancien toggleTheme)
      const newBtn = themeBtn.cloneNode(true);
      themeBtn.parentNode.replaceChild(newBtn, themeBtn);
      newBtn.addEventListener('click', () => window.toggleTheme());
    }

    // Sync système si pas d'override manuel
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applySys() {
      if (localStorage.getItem(THEME_MANUAL_KEY) === '1') return;
      const target = mq.matches ? 'dark' : 'light';
      const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      if (target !== cur && typeof applyTheme === 'function') applyTheme(target);
    }
    applySys();
    if (mq.addEventListener) mq.addEventListener('change', applySys);
    else if (mq.addListener) mq.addListener(applySys); // iOS < 14
  }
  setupThemeIconAndSync();

  // =========== COPYRIGHT FOOTER ================================
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

  // =========== TOAST BOOT ======================================
  if (typeof showToast === 'function') {
    showToast(`✓ ${PLATFORMS.length} plateformes ULM · v0.5.1`, 'ok', 3000);
  }
  console.log('[BASULM v0.5.1] Intégration terminée');
})();
