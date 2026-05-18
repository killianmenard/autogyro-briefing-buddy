/* ============================================================
   AutogyroDash — extensions v0.6.0 (Sprint 2)
   ------------------------------------------------------------
   Ajoute par-dessus l'app v0.5.3 + basulm.js v0.5.3 :
     - Onglet "ressources" (fusion sources + lexique aéro complet)
     - Historique vols (bouton "épingler" + restauration 1-click)
     - NOTAM v1 par AD (deeplinks SIA Olivia + Aeroweb)
     - AZBA pragmatique (deeplinks officiels + supaip.fr fallback)
     - Webcams aérodromes (annuaire JSON inline curé)

   Architecture : injecté dans la page après basulm.js.
   Aucune modification de basulm.js requise — extension pure
   par hook et DOM manipulation.

   Mandat 0€ respecté : aucune dépendance externe payante,
   aucune API key requise.
   ============================================================ */

(async function() {
  'use strict';

  function waitForAppReady() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof AERODROMES_ALL !== 'undefined'
            && typeof STATE !== 'undefined'
            && typeof computeTrip === 'function'
            && document.querySelector('.tab-btn[data-tab="sources"]')) resolve();
        else setTimeout(check, 150);
      };
      check();
    });
  }
  await waitForAppReady();

  console.log('[Extensions v0.6.0] Boot...');

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // Helpers communs aux sections
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
    document.title = document.title.replace(/v0\.\d+\.\d+/, 'v0.6.0');
    document.querySelectorAll('span.text-xs.pre-mono').forEach(s => {
      if (/^v0\.\d+\.\d+$/.test(s.textContent.trim())) s.textContent = 'v0.6.0';
    });
  } catch (e) {}

  // ============================================================
  // 1. RESSOURCES (fusion sources + lexique aéro)
  // ============================================================
  // Remplace le contenu de l'onglet "sources" existant et le renomme
  // en "ressources", en y intégrant un lexique aéro complet.

  function replaceSourcesWithResources() {
    const sourcesTab = document.querySelector('.tab-btn[data-tab="sources"]');
    const sourcesSection = document.getElementById('tab-sources');
    if (!sourcesTab || !sourcesSection) return;

    // Renommer le tab existant
    sourcesTab.textContent = 'ressources';
    sourcesTab.dataset.tab = 'resources';
    sourcesSection.id = 'tab-resources';

    // Remplacer le contenu
    sourcesSection.innerHTML = buildResourcesHtml();

    // Brancher la navigation interne (sous-tabs lexique/sources)
    setupResourcesNav();
  }

  function buildResourcesHtml() {
    return `
      <div class="card p-4 space-y-4">
        <h2 class="section-title text-sm">ressources</h2>

        <!-- Sous-tabs internes -->
        <div class="flex gap-1 border-b border-thin -mx-4 px-4 pb-0">
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="lexicon">📖 Lexique aéro</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="sources">🔗 Sources &amp; liens</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="airspace">🛡️ Espaces aériens</button>
          <button class="res-subtab px-3 py-2 text-sm border-b-2 border-transparent" data-sub="azba">⚔️ AZBA / RTBA</button>
        </div>

        <!-- Sous-page : Lexique aéro -->
        <div class="res-subpage" data-sub="lexicon">
          ${buildLexiconHtml()}
        </div>

        <!-- Sous-page : Sources -->
        <div class="res-subpage hidden" data-sub="sources">
          ${buildSourcesContentHtml()}
        </div>

        <!-- Sous-page : Espaces aériens -->
        <div class="res-subpage hidden" data-sub="airspace">
          ${buildAirspaceLexiconHtml()}
        </div>

        <!-- Sous-page : AZBA / RTBA -->
        <div class="res-subpage hidden" data-sub="azba">
          ${buildAzbaInfoHtml()}
        </div>

      </div>
    `;
  }

  function buildLexiconHtml() {
    // Lexique complet des sigles aéro VFR français.
    // Sources : SIA, OACI, ADP.
    const sigles = [
      ['METAR', 'METeorological Aerodrome Report', 'Message d\'observation météo temps réel sur un AD. Format codé toutes les 30 min ou 1 h. Indique vent, visibilité, nuages, température, QNH.'],
      ['TAF', 'Terminal Aerodrome Forecast', 'Prévision météo locale d\'un AD pour 9 à 30 h. Publié 4 fois par jour. Aide à la planification.'],
      ['SPECI', 'SPECIal report', 'METAR spécial publié hors cycle quand les conditions changent significativement.'],
      ['SIGMET', 'SIGnificant METeorological information', 'Avertissement de phénomène dangereux (orages, turbulence, givrage, cendres volcaniques).'],
      ['AIRMET', 'AIRman\'s METeorological information', 'Avertissement météo moins sévère que SIGMET (vent fort, plafond bas, vis réduite).'],
      ['QNH', 'Question Niveau Hauteur', 'Pression atmosphérique ramenée au niveau de la mer. Réglage altimétrique pour lire l\'altitude vraie (en ft MSL).'],
      ['QFE', 'Question Field Elevation', 'Pression au niveau de l\'AD. Altimètre indique 0 ft au sol.'],
      ['QFU', 'Question Field Use', 'Orientation magnétique de la piste en service (deux chiffres, ex: 21 = 210°).'],
      ['CAVOK', 'Ceiling And Visibility OK', 'Visibilité ≥ 10 km, pas de nuages signifs sous 5000 ft, pas de phénomène significatif.'],
      ['VFR', 'Visual Flight Rules', 'Règles de vol à vue. Visibilité et nuages doivent respecter des minimas légaux.'],
      ['IFR', 'Instrument Flight Rules', 'Vol aux instruments. Nécessite une qualification + équipement.'],
      ['MVFR', 'Marginal VFR', 'Conditions VFR limites : visibilité 3-5 SM ou plafond 1000-3000 ft.'],
      ['LIFR', 'Low IFR', 'IFR avec visibilité < 1 SM ou plafond < 500 ft.'],
      ['VAC', 'Visual Approach Chart', 'Carte d\'approche à vue d\'un AD. Publiée par le SIA, mise à jour tous les 28 jours (cycle AIRAC).'],
      ['AIP', 'Aeronautical Information Publication', 'Manuel d\'information aéronautique officiel d\'un pays. Contient tous les AD, espaces, procédures.'],
      ['SUP AIP', 'Supplément AIP', 'Modification temporaire à l\'AIP (durée semaines à mois). Ex : meeting aérien.'],
      ['AIC', 'Aeronautical Information Circular', 'Circulaire d\'information à caractère explicatif ou administratif (pas une règle).'],
      ['eAIP', 'electronic AIP', 'Version électronique de l\'AIP publiée par le SIA, accessible en ligne.'],
      ['NOTAM', 'NOTice to AirMen', 'Avis aux navigants : modification temporaire d\'une info aéronautique (piste fermée, balise HS, zone activée).'],
      ['AZBA', 'Activité des Zones de Basse Altitude', 'Carte temps réel des zones militaires actives (RTBA) en basse altitude.'],
      ['RTBA', 'Réseau Très Basse Altitude', 'Réseau de zones militaires où l\'armée vole en TBA. À éviter quand actif.'],
      ['ZRT', 'Zone Réglementée Temporaire', 'Zone créée temporairement par SUP AIP/NOTAM. Restrictions de pénétration.'],
      ['ZIT', 'Zone Interdite Temporaire', 'Zone interdite ponctuellement (ex : feux de forêt, événement).'],
      ['ZDT', 'Zone Dangereuse Temporaire', 'Zone dangereuse créée temporairement.'],
      ['TEMSI', 'Temps Significatif', 'Carte des phénomènes météo significatifs prévus (fronts, orages, nuages dangereux).'],
      ['ATIS', 'Automatic Terminal Information Service', 'Diffusion radio automatique des infos d\'un AD (piste, QNH, vent, conditions).'],
      ['AFIS', 'AeroDrome Flight Information Service', 'Service d\'info de vol sur AD non-contrôlé. Donne infos mais pas clearances.'],
      ['TWR', 'Tower', 'Tour de contrôle (donne clearances de roulage, décollage, atterrissage).'],
      ['APP', 'Approach', 'Service d\'approche radar.'],
      ['SIV', 'Service d\'Information de Vol', 'Service en classe G/E délivrant infos de vol (en France).'],
      ['CTR', 'Control Zone', 'Zone contrôlée autour d\'un AD jusqu\'à une altitude donnée.'],
      ['TMA', 'Terminal Manoeuvring Area', 'Région de contrôle terminale (gros volume au-dessus de la CTR).'],
      ['CTA', 'Control Area', 'Région de contrôle plus large que la TMA.'],
      ['ATZ', 'AeroDrome Traffic Zone', 'Zone de circulation d\'AD non contrôlé.'],
      ['SIV', 'Service d\'Information de Vol', 'Service radar en classe G.'],
      ['FIR', 'Flight Information Region', 'Région d\'information de vol (très grande échelle, ex: FIR Paris).'],
      ['UIR', 'Upper Information Region', 'FIR supérieure (haute altitude).'],
      ['AGL', 'Above Ground Level', 'Hauteur au-dessus du sol (typique en VFR autogire).'],
      ['MSL', 'Mean Sea Level', 'Altitude au-dessus du niveau moyen de la mer.'],
      ['FL', 'Flight Level', 'Niveau de vol (FL050 = 5000 ft sous QNH standard 1013).'],
      ['GND', 'Ground', 'Sol (limite basse d\'une zone).'],
      ['SFC', 'Surface', 'Synonyme GND.'],
      ['UNL', 'Unlimited', 'Pas de limite supérieure.'],
      ['kt', 'knots / nœuds', 'Unité de vitesse aéronautique standard (1 kt = 1.852 km/h).'],
      ['NM', 'Nautical Miles', 'Unité de distance aéronautique (1 NM = 1.852 km).'],
      ['ft', 'feet / pieds', 'Unité d\'altitude (1 ft = 0.3048 m).'],
      ['hPa', 'hectoPascal', 'Unité de pression. Standard atmosphérique = 1013.25 hPa.'],
      ['UTC', 'Universal Time Coordinated', 'Heure universelle utilisée en aéronautique (été FR = UTC+2, hiver = UTC+1).'],
      ['LSAS', 'Local Standard Aviation Service', 'Référence horaire locale de l\'AD.'],
      ['OACI', 'Organisation de l\'Aviation Civile Internationale (ICAO)', 'Organisme onusien régulant l\'aviation civile mondiale. Code OACI = code 4 lettres d\'un AD.'],
      ['DGAC', 'Direction Générale de l\'Aviation Civile', 'Administration française de l\'aviation civile.'],
      ['SIA', 'Service de l\'Information Aéronautique', 'Service de la DGAC qui publie cartes VAC, NOTAM, AZBA, AIP.'],
      ['DSAC', 'Direction de la Sécurité de l\'Aviation Civile', 'Branche de la DGAC en charge de la sécurité.'],
      ['ULM', 'Ultra-Léger Motorisé', 'Catégorie aéronef léger en France (5 classes dont autogire).'],
      ['MTOW', 'Maximum Take-Off Weight', 'Masse maximale au décollage. Limite légale.'],
      ['CDG', 'Centre de gravité', 'Position du barycentre de l\'aéronef. Doit rester dans des limites.'],
      ['QDM', 'Question Direction Magnétique', 'Cap magnétique à prendre pour rejoindre une station radio.'],
      ['QDR', 'Question Direction Relative', 'Relèvement magnétique depuis une station radio.'],
      ['VOR', 'VHF Omnidirectional Range', 'Aide radionavigation : indique l\'azimut depuis la station.'],
      ['DME', 'Distance Measuring Equipment', 'Mesure la distance entre l\'aéronef et une station.'],
      ['NDB', 'Non-Directional Beacon', 'Balise omnidirectionnelle, antique (le récepteur indique la direction de la balise).'],
      ['ILS', 'Instrument Landing System', 'Système d\'atterrissage aux instruments.'],
      ['GPS', 'Global Positioning System', 'Position satellite.'],
      ['ETA', 'Estimated Time of Arrival', 'Heure estimée d\'arrivée.'],
      ['ETD', 'Estimated Time of Departure', 'Heure estimée de départ.'],
      ['POB', 'Persons On Board', 'Nombre de personnes à bord.'],
      ['SAR', 'Search And Rescue', 'Service de recherche et sauvetage.'],
      ['VFR-N', 'VFR de Nuit', 'Vol à vue de nuit. Nécessite qualification.'],
      ['VAC', 'Visual Approach Chart', 'Carte d\'approche à vue d\'un AD.'],
      ['PPR', 'Prior Permission Required', 'Autorisation préalable obligatoire (typique des plateformes ULM).']
    ];

    const rows = sigles.map(([sigle, full, def]) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;font-weight:600;white-space:nowrap;vertical-align:top;font-family:ui-monospace,monospace;font-size:11px;">${escapeHtml(sigle)}</td>
        <td style="padding:6px 8px;color:var(--muted-foreground);font-style:italic;font-size:11px;vertical-align:top;white-space:nowrap;">${escapeHtml(full)}</td>
        <td style="padding:6px 8px;font-size:12px;line-height:1.4;">${escapeHtml(def)}</td>
      </tr>
    `).join('');

    return `
      <p class="text-xs text-muted">Glossaire des principaux sigles aéronautiques VFR français. Indispensable pour décoder METAR, NOTAM, VAC et autres documents officiels.</p>
      <div style="overflow-x:auto;margin-top:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--muted);">
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);">Sigle</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);">Signification</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted-foreground);">Définition</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function buildAirspaceLexiconHtml() {
    const classes = [
      ['A', 'IFR uniquement', 'Pas de VFR autorisé. Espace contrôlé haute altitude.'],
      ['B', 'IFR + VFR (séparation)', 'VFR autorisé avec clearance. ATC sépare tous les vols.'],
      ['C', 'IFR + VFR (séparation IFR/IFR et IFR/VFR)', 'VFR autorisé avec clearance. Standard pour CTR en France.'],
      ['D', 'IFR + VFR (séparation IFR/IFR)', 'VFR autorisé avec clearance, info trafic donné. Standard TMA/CTR FR.'],
      ['E', 'IFR + VFR (info trafic)', 'VFR sans clearance mais info trafic disponible. Souvent au-dessus du SIV.'],
      ['F', 'IFR conseil', 'Rare. VFR sans contraintes spécifiques.'],
      ['G', 'Espace non contrôlé', 'Le plus utilisé en VFR autogire. "Voir et éviter" total. Pas de clearance requise.']
    ];

    const zones = [
      ['CTR', 'Control Zone', 'Zone contrôlée autour d\'un AD. Du sol au plafond TMA. Classe C/D/E typiquement. Clearance souvent requise.', '#2563EB'],
      ['TMA', 'Terminal Manoeuvring Area', 'Volume contrôlé au-dessus de la CTR pour gérer les arrivées/départs IFR. Classe C/D/E.', '#2563EB'],
      ['ATZ', 'AeroDrome Traffic Zone', 'Zone de circulation d\'AD non-contrôlé. Cercle ~3 NM autour de l\'AD, AGL au plafond. Auto-information radio.', '#7C3AED'],
      ['ZRT', 'Zone Réglementée Temporaire', 'Zone créée par SUP AIP/NOTAM (temporaire). Conditions de pénétration spécifiées.', '#DC2626'],
      ['ZIT', 'Zone Interdite Temporaire', 'Pénétration interdite (feux, événement public).', '#991B1B'],
      ['ZDT', 'Zone Dangereuse Temporaire', 'Activités dangereuses ponctuelles.', '#EA580C'],
      ['R', 'Restricted', 'Zone réglementée permanente. Pénétration soumise à conditions.', '#DC2626'],
      ['D', 'Danger', 'Zone dangereuse permanente. Pas d\'interdiction mais risque connu.', '#EA580C'],
      ['P', 'Prohibited', 'Zone interdite permanente (centrales nucléaires, présidentielle, etc.).', '#991B1B'],
      ['TRA', 'Temporary Reserved Area', 'Zone réservée temporairement à l\'aviation militaire.', '#B91C1C'],
      ['TSA', 'Temporary Segregated Area', 'Variation de TRA avec ségrégation civile/militaire.', '#B91C1C'],
      ['LF-R', 'LF Restricted', 'Préfixe France des zones réglementées (R) numérotées.', '#DC2626'],
      ['LF-D', 'LF Danger', 'Préfixe France des zones dangereuses (D) numérotées.', '#EA580C'],
      ['LF-P', 'LF Prohibited', 'Préfixe France des zones interdites (P) numérotées.', '#991B1B']
    ];

    const classesRows = classes.map(([c, name, desc]) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;font-weight:600;font-family:ui-monospace,monospace;font-size:13px;text-align:center;vertical-align:top;">${c}</td>
        <td style="padding:6px 8px;font-weight:500;font-size:12px;vertical-align:top;">${escapeHtml(name)}</td>
        <td style="padding:6px 8px;font-size:12px;line-height:1.4;">${escapeHtml(desc)}</td>
      </tr>
    `).join('');

    const zonesRows = zones.map(([code, name, desc, color]) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px 8px;vertical-align:top;">
          <span style="display:inline-block;background:${color};color:white;font-weight:600;font-size:10px;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;">${code}</span>
        </td>
        <td style="padding:6px 8px;font-weight:500;font-size:12px;vertical-align:top;font-style:italic;">${escapeHtml(name)}</td>
        <td style="padding:6px 8px;font-size:12px;line-height:1.4;">${escapeHtml(desc)}</td>
      </tr>
    `).join('');

    return `
      <h3 class="text-sm font-semibold mb-2">Classes d'espaces aériens (OACI)</h3>
      <p class="text-xs text-muted mb-3">Les classes définissent les règles de séparation et les services rendus aux aéronefs. <strong>VFR autogire vole majoritairement en classe G</strong> sous 2500 ft AGL.</p>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--muted);">
              <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Classe</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Type</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Description</th>
            </tr>
          </thead>
          <tbody>${classesRows}</tbody>
        </table>
      </div>

      <h3 class="text-sm font-semibold mb-2">Types de zones aériennes</h3>
      <p class="text-xs text-muted mb-3">Les couleurs reprennent celles utilisées sur la carte de l'app et sur les cartes VAC officielles.</p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--muted);">
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Type</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Nom</th>
              <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted-foreground);">Description</th>
            </tr>
          </thead>
          <tbody>${zonesRows}</tbody>
        </table>
      </div>

      <div class="info-box mt-4 text-xs">
        <strong>💡 Pour rappel</strong> — En autogire VFR, tu opères principalement en classe G (espace non contrôlé) sous 2500 ft AGL. Ton plafond opérationnel évite la plupart des TMA. Reste vigilant aux <strong>CTR, ATZ, R, D, P</strong> et zones <strong>AZBA actives</strong>.
      </div>
    `;
  }

  function buildAzbaInfoHtml() {
    return `
      <h3 class="text-sm font-semibold mb-2">⚔️ AZBA / RTBA — Zones militaires basse altitude</h3>
      <p class="text-xs text-muted">Le réseau <strong>RTBA</strong> est utilisé par l'armée pour les entraînements à basse altitude. Quand actif (<strong>AZBA</strong>), il est <strong>interdit aux VFR</strong>. À vérifier OBLIGATOIREMENT avant chaque vol.</p>

      <div class="warn-box mt-3 text-xs">
        <strong>⚠️ Important</strong> — En 2026, il n'existe pas d'API publique gratuite pour récupérer l'AZBA temps réel programmatiquement. Les sources officielles ci-dessous sont à consulter manuellement avant chaque vol.
      </div>

      <h4 class="text-xs font-semibold uppercase tracking-wide mt-4 mb-2">Sources officielles AZBA</h4>
      <div class="space-y-2">
        <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer"
           class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🇫🇷 SIA — Page AZBA officielle</div>
          <div class="text-xs text-muted mt-1">Carte interactive temps réel des zones RTBA. Référence officielle DGAC.</div>
          <div class="text-xs text-blue-600 mt-1">sia.aviation-civile.gouv.fr/schedules</div>
        </a>

        <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer"
           class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🇫🇷 Aeroweb — Météo France aviation</div>
          <div class="text-xs text-muted mt-1">NOTAM AZBA + cartes RTBA + TEMSI. Compte gratuit requis.</div>
          <div class="text-xs text-blue-600 mt-1">aviation.meteo.fr</div>
        </a>

        <a href="https://supaip.fr/" target="_blank" rel="noreferrer"
           class="block muted-bg p-3 rounded hover:bg-gray-100">
          <div class="font-medium text-sm">🗺️ SUP AIP France (tiers, gratuit)</div>
          <div class="text-xs text-muted mt-1">Carte interactive AZBA + ZRT/ZIT/ZDT + NOTAM, agrégée depuis sources DGAC. Vue d'ensemble pratique.</div>
          <div class="text-xs text-blue-600 mt-1">supaip.fr</div>
        </a>
      </div>

      <div class="alert-box mt-4 text-xs">
        <strong>💡 Workflow recommandé pré-vol</strong><br>
        1. Veille au soir : consulte SUP AIP France pour un coup d'œil global<br>
        2. Le matin du vol : confirme sur SIA officiel + Aeroweb<br>
        3. Si zone RTBA sur ton trajet : adapte la route ou l'horaire<br>
        4. En vol : "voir et éviter" reste la règle (classe G)
      </div>
    `;
  }

  function buildSourcesContentHtml() {
    return `
      <p class="text-xs text-muted mb-3">L'app agrège plusieurs sources officielles et open data pour offrir un briefing pré-vol complet, sans avoir besoin de créer un compte sur chaque service.</p>
      <div class="space-y-3 text-sm">
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">✈️ Aérodromes officiels (447)</h3>
          <p class="text-xs">Source : <strong>DGAC</strong> via PIAF.</p>
          <a href="https://piaf.stac.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">piaf.stac.aviation-civile.gouv.fr</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">🛩 Plateformes ULM (764)</h3>
          <p class="text-xs">Source : <strong>BASULM</strong> — FFPLUM.</p>
          <a href="https://basulm.ffplum.fr" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">basulm.ffplum.fr</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">📋 Cartes VAC / AIP / NOTAM</h3>
          <p class="text-xs">Source : <strong>SIA</strong> (Service d'Information Aéronautique). Liens VAC construits selon cycle AIRAC. NOTAM consultables via SOFIA ou Aeroweb.</p>
          <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">sia.aviation-civile.gouv.fr</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">🌤️ Météo aviation</h3>
          <p class="text-xs">METAR/TAF : <strong>aviationweather.gov</strong> (NOAA, gratuit).<br>Vent multi-niveaux : <strong>Open-Meteo</strong> (ECMWF).</p>
          <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviationweather.gov</a> ·
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">open-meteo.com</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">📡 TEMSI + Aeroweb</h3>
          <p class="text-xs">Source : <strong>Aeroweb</strong> de Météo France (compte gratuit).</p>
          <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">aviation.meteo.fr</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">🛡️ Espaces aériens</h3>
          <p class="text-xs">Source : <strong>OpenAIP</strong> (clé API gratuite).</p>
          <a href="https://www.openaip.net/" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline text-xs">openaip.net</a>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">⚔️ AZBA / RTBA</h3>
          <p class="text-xs">Source : <strong>SIA</strong> page schedules (interactif) + <strong>SUP AIP France</strong> (agrégateur tiers gratuit).</p>
        </div>
        <div class="muted-bg p-3 rounded">
          <h3 class="font-semibold text-sm mb-1">🗺️ Fonds de carte</h3>
          <p class="text-xs">OpenStreetMap · CartoDB Positron · Windy (satellite iframe).</p>
        </div>
      </div>
      <div class="border-t border-thin pt-3 mt-4">
        <h3 class="font-semibold text-sm mb-2">⚠️ Avertissement</h3>
        <p class="text-xs text-muted">AutogyroDash est un outil d'aide à la planification VFR. <strong>Le pilote reste seul responsable de la vérification de toutes les informations officielles avant chaque vol</strong>.</p>
        <p class="text-xs text-muted mt-2">Aucune donnée pilote n'est envoyée à un serveur. Tout est stocké localement dans le navigateur.</p>
      </div>
      <div class="text-xs text-muted text-center pt-2">
        AutogyroDash v0.6.0 · <a href="https://github.com/killianmenard/autogyro-briefing-buddy" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">code source GitHub</a>
      </div>
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
    };
    section.querySelectorAll('.res-subtab').forEach(b => {
      b.addEventListener('click', () => setActive(b.dataset.sub));
    });
    setActive('lexicon'); // Lexique ouvert par défaut
  }

  replaceSourcesWithResources();

  // ============================================================
  // 2. ONGLET HISTORIQUE VOLS
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
    try {
      // Garde max 30 vols pour pas exploser le localStorage
      const trimmed = items.slice(0, 30);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[History] save failed', e);
    }
  }

  function pinCurrentFlight() {
    const trip = computeTrip();
    if (!trip || !trip.points || trip.points.length < 2) {
      if (typeof showToast === 'function') showToast('Aucun trajet à épingler (minimum 2 points)', 'warn', 3000);
      return false;
    }

    // Sérialiser le trajet minimal
    const item = {
      id: Date.now(),
      pinnedAt: new Date().toISOString(),
      label: trip.points.map(p => p.icao).join(' → ') + (STATE.loop ? ' → boucle' : ''),
      points: trip.points.map(p => ({
        icao: p.icao,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        isBasulm: !!p.isBasulm,
        // Si BASULM, on garde toutes les data, sinon juste les essentielles
        basulm: p.isBasulm ? p.basulm : undefined,
        metarStation: p.metarStation
      })),
      loop: !!STATE.loop,
      totalKm: trip.totalDist || 0,
      acftNickname: STATE.acft?.nickname || null
    };

    const history = loadHistory();
    // Dédup par label (même trajet réépinglé = on update la date)
    const idx = history.findIndex(h => h.label === item.label && h.loop === item.loop);
    if (idx >= 0) {
      history[idx] = { ...history[idx], pinnedAt: item.pinnedAt };
    } else {
      history.unshift(item);
    }
    saveHistory(history);
    if (typeof showToast === 'function') showToast(`✓ Vol épinglé : ${item.label}`, 'ok', 3000);
    return true;
  }

  function restoreFlight(item) {
    if (!item || !item.points || item.points.length < 2) return;

    // 1. Vider le trajet courant via le bouton existant (réinit propre)
    const clearBtn = document.getElementById('clear-trip');
    if (clearBtn) clearBtn.click();

    // 2. Re-remplir slot par slot
    setTimeout(() => {
      const pts = item.points;
      const max = Math.min(pts.length, 5);
      for (let i = 0; i < max; i++) {
        const p = pts[i];
        // Reconstruire l'objet AD : si BASULM, on a tout ; sinon on cherche dans AERODROMES_ALL
        let ad;
        if (p.isBasulm) {
          ad = {
            icao: p.icao, name: p.name, lat: p.lat, lon: p.lon,
            isBasulm: true, basulm: p.basulm, metarStation: null
          };
        } else {
          ad = AERODROMES_ALL.find(a => a.icao === p.icao);
          if (!ad) {
            // AD inconnu (suppression DGAC entre temps ?) → on reconstruit le minimum
            ad = { icao: p.icao, name: p.name, lat: p.lat, lon: p.lon, metarStation: p.metarStation };
          }
        }

        // Mapping slot : 0=départ, 1-2-3=étapes, 4=arrivée
        let slotIdx;
        if (i === 0) slotIdx = 0;
        else if (i === pts.length - 1 && !item.loop) slotIdx = 4;
        else slotIdx = i; // étape 1, 2, 3

        // Si étape > 1, révéler le slot
        if (slotIdx >= 2 && slotIdx <= 3) {
          const slotEl = document.querySelector(`[data-trip-slot="${slotIdx}"]`);
          if (slotEl) slotEl.classList.remove('hidden');
          if (slotIdx > STATE.visibleStops) STATE.visibleStops = slotIdx;
        }
        if (STATE.visibleStops >= 3) {
          document.getElementById('add-step-btn')?.classList.add('hidden');
        }

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

      // Naviguer vers le brief
      document.querySelector('.tab-btn[data-tab="plan"]')?.click();
      if (typeof showToast === 'function') showToast(`✓ Vol restauré : ${item.label}`, 'ok', 3000);
    }, 200);
  }

  function deleteHistoryItem(id) {
    const history = loadHistory();
    const filtered = history.filter(h => h.id !== id);
    saveHistory(filtered);
    renderHistoryList();
    if (typeof showToast === 'function') showToast('Vol supprimé de l\'historique', 'info', 2500);
  }

  function renderHistoryList() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    const history = loadHistory();
    if (history.length === 0) {
      listEl.innerHTML = `
        <div class="text-center text-sm text-muted p-6">
          <div style="font-size:32px;margin-bottom:8px;">📭</div>
          <div>Aucun vol épinglé pour le moment.</div>
          <div class="text-xs mt-2">Pour épingler un vol : planifie un trajet (au moins 2 AD), puis utilise le bouton <strong>📌 Épingler ce vol</strong> à côté du bouton PDF.</div>
        </div>
      `;
      return;
    }
    listEl.innerHTML = history.map(h => {
      const date = new Date(h.pinnedAt);
      const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dist = h.totalKm ? Math.round(h.totalKm) + ' km' : '';
      return `
        <div class="card p-3" style="margin-bottom:8px;">
          <div class="flex items-start justify-between gap-2 flex-wrap">
            <div style="flex:1;min-width:200px;">
              <div class="font-medium text-sm" style="font-family:ui-monospace,monospace;">${escapeHtml(h.label)}</div>
              <div class="text-xs text-muted mt-1">
                Épinglé ${escapeHtml(dateStr)}
                ${dist ? ' · ' + dist : ''}
                ${h.acftNickname ? ' · ' + escapeHtml(h.acftNickname) : ''}
              </div>
            </div>
            <div class="flex gap-1 flex-shrink-0">
              <button class="h-restore px-3 py-1.5 rounded bg-black text-white" data-id="${h.id}" style="font-size:12px;">↻ Restaurer</button>
              <button class="h-delete px-2 py-1.5 rounded border" data-id="${h.id}" style="border-color:#FCA5A5;color:#991B1B;font-size:12px;background:white;" title="Supprimer">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Brancher actions
    listEl.querySelectorAll('.h-restore').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const item = loadHistory().find(h => h.id === id);
        if (item) restoreFlight(item);
      });
    });
    listEl.querySelectorAll('.h-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (confirm('Supprimer ce vol de l\'historique ?')) {
          deleteHistoryItem(id);
        }
      });
    });
  }

  function addHistoryTab() {
    // Insertion AVANT "ressources" (qui était sources renommé)
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
    section.innerHTML = `
      <div class="card p-4 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="section-title text-sm">historique des vols</h2>
          <button id="history-clear-all" class="text-xs px-3 py-1.5 rounded border" style="border-color:#FCA5A5;color:#991B1B;background:white;">
            Vider l'historique
          </button>
        </div>
        <p class="text-xs text-muted">Vols que tu as épinglés. Cliquez sur "Restaurer" pour reprendre un vol passé comme nouveau brief.</p>
        <div id="history-list"></div>
      </div>
    `;
    main.appendChild(section);

    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      hideAllTabs();
      section.classList.remove('hidden');
      closeMobileMenu();
      renderHistoryList();
    });
    document.querySelectorAll('.tab-btn[data-tab="plan"], .tab-btn[data-tab="acft"], .tab-btn[data-tab="resources"], .tab-btn[data-tab="params"]').forEach(b => {
      b.addEventListener('click', () => section.classList.add('hidden'));
    });

    document.getElementById('history-clear-all')?.addEventListener('click', () => {
      if (confirm('Effacer TOUT l\'historique des vols ? Cette action est irréversible.')) {
        saveHistory([]);
        renderHistoryList();
        if (typeof showToast === 'function') showToast('Historique vidé', 'info', 2500);
      }
    });
  }
  addHistoryTab();

  // ============================================================
  // 3. BOUTON "ÉPINGLER" À CÔTÉ DU PDF
  // ============================================================
  function addPinButton() {
    const pdfBtn = document.getElementById('pdf-btn');
    if (!pdfBtn || document.getElementById('pin-flight-btn')) return;
    // Wrapper grid 2 colonnes pour [Épingler | PDF]
    const footer = pdfBtn.parentNode;
    if (!footer) return;

    // Container flex
    pdfBtn.style.flex = '1';
    const pinBtn = document.createElement('button');
    pinBtn.id = 'pin-flight-btn';
    pinBtn.className = pdfBtn.className.replace('bg-black', 'bg-white').replace('text-white', 'text-foreground');
    pinBtn.style.cssText = 'flex-shrink:0;min-width:130px;background:var(--card);color:var(--foreground);border:1.5px solid var(--border);';
    pinBtn.innerHTML = `<span style="font-size:14px;">📌</span><span>épingler</span>`;
    pinBtn.title = 'Épingler ce vol à mon historique';
    pinBtn.addEventListener('click', () => pinCurrentFlight());

    // Wrap les 2 boutons dans un flex
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:8px;align-items:stretch;';
    footer.insertBefore(wrapper, pdfBtn);
    wrapper.appendChild(pinBtn);
    wrapper.appendChild(pdfBtn);
  }
  addPinButton();

  // ============================================================
  // 4. NOTAM v1 + AZBA + WEBCAMS dans les fiches AD
  // ============================================================

  // Annuaire webcams curé. Données vérifiables sur les sites des AD ou
  // viewsurf.com. Liste courte volontairement (qualité > quantité).
  // Format : ICAO → { url, label, source }
  const WEBCAMS = {
    'LFLB': { url: 'https://www.aeroport-chambery.com/webcam/', label: 'Webcam Chambéry-Aix Les Bains', source: 'Aéroport Chambéry' },
    'LFLI': { url: 'https://www.annemasse-aeroport.com/', label: 'Webcam Annemasse', source: 'AC Annemasse' },
    'LFLU': { url: 'https://www.aerodrome-valence.com/', label: 'Webcam Valence Chabeuil', source: 'AC Valence' },
    'LFNA': { url: 'https://www.aerogap.com/webcam/', label: 'Webcam Gap-Tallard', source: 'Aérogap' },
    'LFMD': { url: 'https://www.cannes.aeroport.fr/', label: 'Webcam Cannes Mandelieu', source: 'CCI Cannes' },
    'LFMN': { url: 'https://www.nice.aeroport.fr/', label: 'Webcam Nice Côte d\'Azur', source: 'Aéroport Nice' },
    'LFKJ': { url: 'https://www.2a.cci.fr/aeroport-ajaccio/', label: 'Webcam Ajaccio Napoléon Bonaparte', source: 'CCI 2A' },
    'LFLP': { url: 'https://www.annecy.aeroport.fr/', label: 'Webcam Annecy Meythet', source: 'Aéroport Annecy' },
    'LFLY': { url: 'https://www.lyonaeroports.com/', label: 'Webcam Lyon Bron', source: 'Lyon Aéroports' },
    'LFMP': { url: 'https://www.aeroport-perpignan.com/', label: 'Webcam Perpignan Rivesaltes', source: 'CCI Perpignan' },
    'LFMV': { url: 'https://www.avignon.aeroport.fr/', label: 'Webcam Avignon Caumont', source: 'CCI Vaucluse' },
    'LFKC': { url: 'https://www.2b.cci.fr/Aeroport-Calvi-Sainte-Catherine.html', label: 'Webcam Calvi Sainte-Catherine', source: 'CCI 2B' },
    'LFMH': { url: 'https://www.saint-etienne.aeroport.fr/', label: 'Webcam Saint-Étienne Boutheon', source: 'Aéroport Saint-Étienne' }
  };

  // Hook le refresh des cards AD pour ajouter NOTAM/AZBA/Webcam
  // basulm.js hook déjà refreshAdCards. On ré-hook par-dessus.
  if (typeof refreshAdCards === 'function') {
    const _prevRefresh = refreshAdCards;
    refreshAdCards = function() {
      _prevRefresh.apply(this, arguments);
      // Le timeout doit être > 50 (timeout de basulm.js) pour passer après lui
      setTimeout(addNotamAndAzbaToCards, 100);
    };
  }

  function addNotamAndAzbaToCards() {
    const trip = computeTrip();
    if (!trip) return;
    const seen = new Set(); const uniquePoints = [];
    trip.points.forEach(p => { if (!seen.has(p.icao)) { uniquePoints.push(p); seen.add(p.icao); } });

    uniquePoints.forEach((ad, i) => {
      // Pour les BASULM : pas de NOTAM officiel (mentionné déjà dans la fiche), mais on peut
      // mettre quand même un lien général AZBA. Pour les DGAC : NOTAM officiel pertinent.
      // Le sélecteur diffère selon le wrapping de la card.
      const cardEl = document.querySelector(`[data-ad-card="${ad.icao}-${i}"]`);
      if (!cardEl) return;
      // Évite duplication si déjà inséré
      if (cardEl.querySelector('.notam-section')) return;

      const section = document.createElement('div');
      section.className = 'notam-section';
      section.style.cssText = 'border-top:1px solid var(--border);padding:12px 16px;font-size:12px;';

      const webcam = WEBCAMS[ad.icao];
      const isBasulm = !!ad.isBasulm;

      let html = `<h4 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">📡 informations officielles complémentaires</h4>`;

      if (isBasulm) {
        html += `
          <div class="info-box mb-2 text-xs">
            ℹ️ Plateforme BASULM non publiée par la DGAC : <strong>pas de NOTAM officiel</strong>. Vérifier la disponibilité auprès du gestionnaire (téléphone dans la fiche).
          </div>
        `;
        // Lien AZBA général (le trajet peut traverser une zone)
        html += `
          <div class="space-y-1">
            <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer"
               style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">⚔️</span>
              <span style="flex:1;">Vérifier AZBA / RTBA actif sur le trajet</span>
              <span style="font-size:10px;color:var(--muted-foreground);">SIA →</span>
            </a>
          </div>
        `;
      } else {
        // AD officiel DGAC
        html += `
          <div class="space-y-1">
            <a href="https://www.sia.aviation-civile.gouv.fr/" target="_blank" rel="noreferrer"
               style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">📋</span>
              <span style="flex:1;"><strong>NOTAM ${escapeHtml(ad.icao)}</strong> — SIA Olivia / SOFIA</span>
              <span style="font-size:10px;color:var(--muted-foreground);">officiel →</span>
            </a>
            <a href="https://aviation.meteo.fr/login.php" target="_blank" rel="noreferrer"
               style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">📡</span>
              <span style="flex:1;">NOTAM + TEMSI sur Aeroweb (Météo France)</span>
              <span style="font-size:10px;color:var(--muted-foreground);">→</span>
            </a>
            <a href="https://www.sia.aviation-civile.gouv.fr/schedules" target="_blank" rel="noreferrer"
               style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--muted);border-radius:4px;text-decoration:none;color:var(--foreground);">
              <span style="font-size:14px;">⚔️</span>
              <span style="flex:1;">AZBA / RTBA temps réel</span>
              <span style="font-size:10px;color:var(--muted-foreground);">SIA →</span>
            </a>
          </div>
        `;
        html += `<p class="text-xs text-muted mt-2 italic">Les NOTAM ne sont pas affichés directement dans l'app (pas d'API publique gratuite). Consulter les liens officiels avant chaque vol.</p>`;
      }

      // Webcam si disponible
      if (webcam) {
        html += `
          <div class="mt-2 pt-2 border-t border-thin">
            <a href="${webcam.url}" target="_blank" rel="noreferrer"
               style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#FEF3C7;border-radius:4px;text-decoration:none;color:#92400E;">
              <span style="font-size:14px;">📹</span>
              <span style="flex:1;"><strong>${escapeHtml(webcam.label)}</strong></span>
              <span style="font-size:10px;">→</span>
            </a>
            <p class="text-xs text-muted mt-1 italic">Visuel temps réel · ${escapeHtml(webcam.source)}</p>
          </div>
        `;
      }

      cardEl.appendChild(section);
    });
  }

  // Trigger initial pour les cards déjà rendues
  setTimeout(addNotamAndAzbaToCards, 300);

  // ============================================================
  // BOOT FINAL
  // ============================================================
  if (typeof showToast === 'function') {
    showToast('✓ Sprint 2 chargé · v0.6.0', 'ok', 3000);
  }
  console.log('[Extensions v0.6.0] Intégration terminée');
})();
