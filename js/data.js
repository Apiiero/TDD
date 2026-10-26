/* =========================================================
   Données fictives — Réseau d'eau potable ECLA Lons Agglo
   Zone : Lons-le-Saunier et communes voisines (Jura, 39)
   ========================================================= */

const DATASET = {
  center: [46.6758, 5.5515],
  zoom: 13,

  /* ---------- SECTEURS DE DISTRIBUTION (polygones) ---------- */
  secteurs: [
    {
      id: "SEC-01", nom: "Secteur Centre-Ville", code: "CEN",
      couleur: "#1d7fd6", commune: "Lons-le-Saunier",
      linéaire_km: 28.4, volume_m3j: 1850, debit_m3h: 142,
      abonnés: 2310, pression_bar: 3.4, rendement_pct: 88.2,
      fuites_24h: 2, responsable: "M. Girard",
      teleinfo: "Télérelève journalière — dernière synchro 05:42",
      poly: [[46.6845,5.5405],[46.6872,5.5560],[46.6790,5.5665],[46.6680,5.5620],
             [46.6652,5.5470],[46.6720,5.5385]]
    },
    {
      id: "SEC-02", nom: "Secteur Nord — Juvigny / Vernot", code: "NOR",
      couleur: "#35b8e8", commune: "Lons-le-Saunier (Nord)",
      linéaire_km: 41.7, volume_m3j: 1120, debit_m3h: 86,
      abonnés: 980, pression_bar: 2.9, rendement_pct: 82.5,
      fuites_24h: 3, responsable: "Mme Lacroix",
      teleinfo: "Télérelève journalière — dernière synchro 05:40",
      poly: [[46.6872,5.5560],[46.6905,5.5405],[46.7050,5.5360],[46.7120,5.5580],
             [46.7040,5.5810],[46.6880,5.5790],[46.6790,5.5665]]
    },
    {
      id: "SEC-03", nom: "Secteur Sud — Conliège / Revigny", code: "SUD",
      couleur: "#2e9e6b", commune: "Conliège, Revigny",
      linéaire_km: 36.2, volume_m3j: 780, debit_m3h: 61,
      abonnés: 640, pression_bar: 3.1, rendement_pct: 85.9,
      fuites_24h: 1, responsable: "M. Petit",
      teleinfo: "Télérelève journalière — dernière synchro 05:38",
      poly: [[46.6652,5.5470],[46.6680,5.5620],[46.6600,5.5760],[46.6430,5.5700],
             [46.6395,5.5450],[46.6520,5.5350]]
    },
    {
      id: "SEC-04", nom: "Secteur Est — Perrigny / Montmorot", code: "EST",
      couleur: "#e0a12c", commune: "Perrigny, Montmorot",
      linéaire_km: 45.9, volume_m3j: 960, debit_m3h: 74,
      abonnés: 815, pression_bar: 2.7, rendement_pct: 79.4,
      fuites_24h: 4, responsable: "Mme Berthier",
      teleinfo: "Télérelève journalière — dernière synchro 05:44",
      poly: [[46.6790,5.5665],[46.6880,5.5790],[46.7040,5.5810],[46.7000,5.6060],
             [46.6760,5.6130],[46.6580,5.5980],[46.6600,5.5760],[46.6680,5.5620]]
    },
    {
      id: "SEC-05", nom: "Secteur Ouest — Macornay / Geruge", code: "OUE",
      couleur: "#8e44ad", commune: "Macornay, Cernon",
      linéaire_km: 33.8, volume_m3j: 540, debit_m3h: 43,
      abonnés: 470, pression_bar: 3.0, rendement_pct: 86.7,
      fuites_24h: 0, responsable: "M. Roux",
      teleinfo: "Télérelève journalière — dernière synchro 05:41",
      poly: [[46.6720,5.5385],[46.6652,5.5470],[46.6520,5.5350],[46.6480,5.5080],
             [46.6640,5.4930],[46.6830,5.4980],[46.6905,5.5405],[46.6872,5.5560]]
    }
  ],

  /* ---------- RÉSERVOIRS ---------- */
  reservoirs: [
    {
      id: "RES-01", nom: "Réservoir des Croisilles", secteur: "SEC-01",
      commune: "Lons-le-Saunier", coord: [46.6810, 5.5480],
      capacite_m3: 3000, niveau_pct: 72, remplissage_m3: 2160,
      cote_alt_m: 305, mise_en_service: "1987", materiau: "Béton enterré",
      dernier_entretien: "12/03/2026", prochain_vide_sanitaire: "Novembre 2026",
      statut: "ok", photo: "reservoir-croisilles",
      notes: "Chlore résiduel : 0,32 mg/L — Analyses conformes (02/10/2026)"
    },
    {
      id: "RES-02", nom: "Réservoir de Montciel", secteur: "SEC-02",
      commune: "Lons-le-Saunier", coord: [46.6985, 5.5565],
      capacite_m3: 1500, niveau_pct: 58, remplissage_m3: 870,
      cote_alt_m: 322, mise_en_service: "1994", materiau: "Béton semi-enterré",
      dernier_entretien: "28/06/2026", prochain_vide_sanitaire: "Mars 2027",
      statut: "ok", photo: "reservoir-montciel",
      notes: "Flotteur de sécurité remplacé en juin 2026"
    },
    {
      id: "RES-03", nom: "Réservoir de la Combe", secteur: "SEC-03",
      commune: "Conliège", coord: [46.6520, 5.5560],
      capacite_m3: 800, niveau_pct: 34, remplissage_m3: 272,
      cote_alt_m: 341, mise_en_service: "1975", materiau: "Béton enterré",
      dernier_entretien: "05/02/2025", prochain_vide_sanitaire: "Urgent — reporté",
      statut: "warn", photo: "reservoir-combe",
      notes: "⚠ Niveau bas récurrent en été — curage à programmer en priorité"
    },
    {
      id: "RES-04", nom: "Réservoir de Perrigny", secteur: "SEC-04",
      commune: "Perrigny", coord: [46.6830, 5.5950],
      capacite_m3: 1200, niveau_pct: 81, remplissage_m3: 972,
      cote_alt_m: 298, mise_en_service: "2003", materiau: "Composite polyester",
      dernier_entretien: "17/09/2026", prochain_vide_sanitaire: "Septembre 2027",
      statut: "ok", photo: "reservoir-perrigny",
      notes: "Détection de fuite intégrée (compteur principal + analyse nocturne)"
    },
    {
      id: "RES-05", nom: "Réservoir du Bois de Ratilly", secteur: "SEC-05",
      commune: "Macornay", coord: [46.6720, 5.5080],
      capacite_m3: 600, niveau_pct: 12, remplissage_m3: 72,
      cote_alt_m: 318, mise_en_service: "1969", materiau: "Maçonnerie",
      dernier_entretien: "22/11/2023", prochain_vide_sanitaire: "Hors délai",
      statut: "bad", photo: "reservoir-ratilly",
      notes: "🔴 Remplissage anormal — suspicion de fuite sur by-pass. Intervention équipe exploitation demandée."
    }
  ],

  /* ---------- STATIONS (traitement / pompage / surpression) ---------- */
  stations: [
    {
      id: "STA-01", nom: "Usine de traitement de l'Ain", secteur: "SEC-05",
      commune: "Montreal", coord: [46.6585, 5.4975],
      type: "Traitement", capacite_m3j: 8500,
      debit_prod_m3h: 210, energie_kwh_m3: 0.42,
      mise_en_service: "1998", technologie: "Filtration sur charbon actif + désinfection UV/chlore",
      dernier_entretien: "08/08/2026", statut: "ok", photo: "station-traitement",
      mode_exploitation: "Automatique — supervision S²Eau",
      effectif: "2 agents / astreinte 7j/7"
    },
    {
      id: "STA-02", nom: "Station de pompage Saint-Jean", secteur: "SEC-01",
      commune: "Lons-le-Saunier", coord: [46.6735, 5.5545],
      type: "Pompage", capacite_m3j: 4200,
      debit_prod_m3h: 120, energie_kwh_m3: 0.31,
      mise_en_service: "2011", technologie: "2 pompes immergées 30 kW (1 travail + 1 secours), variateurs",
      dernier_entretien: "15/05/2026", statut: "ok", photo: "station-pompage",
      mode_exploitation: "Asservie au niveau réservoir Croisilles",
      effectif: "Télé-conduite"
    },
    {
      id: "STA-03", nom: "Surpression des Grands Boismuriens", secteur: "SEC-04",
      commune: "Montmorot", coord: [46.6680, 5.6020],
      type: "Surpression", capacite_m3j: 1600,
      debit_prod_m3h: 55, energie_kwh_m3: 0.55,
      mise_en_service: "1990", technologie: "Station de surpression volumétrique, 3 pompes",
      dernier_entretien: "30/01/2025", statut: "warn", photo: "station-surpression",
      mode_exploitation: "Automatique — pressostat 3,2 bar",
      effectif: "Télé-conduite"
    },
    {
      id: "STA-04", nom: "Point de reprise AEP Revigny", secteur: "SEC-03",
      commune: "Revigny", coord: [46.6455, 5.5620],
      type: "Pompage", capacite_m3j: 900,
      debit_prod_m3h: 30, energie_kwh_m3: 0.48,
      mise_en_service: "1983", technologie: "Relèvement vers réservoir de la Combe, 1 pompe 15 kW",
      dernier_entretien: "19/09/2025", statut: "ok", photo: "station-revigny",
      mode_exploitation: "Horaires pleins délestage heures creuses",
      effectif: "Télé-conduite"
    }
  ],

  /* ---------- COMPTEURS DE SECTORISATION (FDI) ---------- */
  compteurs: [
    {
      id: "cpt-CEN", nom: "Compteur général Centre", identifiant: "QMA-3821-CEN",
      secteur: "SEC-01", commune: "Lons-le-Saunier", coord: [46.6760, 5.5450],
      diametre_mm: 110, type_compteur: "Magnétique QMA",
      index_m3: 4128750, index_precedent_m3: 4111020,
      debit_moyen_m3h: 77, qmin_nocturne_m3h: 9.4, qmax_jour_m3h: 168,
      derniere_releve: "25/10/2026 06:00", frequence_releve: "1 point / 10 min",
      statut: "ok", batterie_pct: 91
    },
    {
      id: "cpt-NOR", nom: "Compteur secteur Nord", identifiant: "QMC-1044-NOR",
      secteur: "SEC-02", commune: "Lons-le-Saunier", coord: [46.6900, 5.5600],
      diametre_mm: 80, type_compteur: "Vortex ultrasons",
      index_m3: 2015330, index_precedent_m3: 2004610,
      debit_moyen_m3h: 46, qmin_nocturne_m3h: 6.1, qmax_jour_m3h: 102,
      derniere_releve: "25/10/2026 05:58", frequence_releve: "1 point / 15 min",
      statut: "ok", batterie_pct: 87
    },
    {
      id: "cpt-SUD", nom: "Compteur secteur Sud", identifiant: "QMA-2260-SUD",
      secteur: "SEC-03", commune: "Conliège", coord: [46.6560, 5.5500],
      diametre_mm: 80, type_compteur: "Magnétique QMA",
      index_m3: 1330890, index_precedent_m3: 1324310,
      debit_moyen_m3h: 32, qmin_nocturne_m3h: 4.8, qmax_jour_m3h: 71,
      derniere_releve: "25/10/2026 06:02", frequence_releve: "1 point / 15 min",
      statut: "ok", batterie_pct: 76
    },
    {
      id: "cpt-EST", nom: "Compteur secteur Est", identifiant: "VOR-9917-EST",
      secteur: "SEC-04", commune: "Perrigny", coord: [46.6780, 5.5830],
      diametre_mm: 100, type_compteur: "Vortex ultrasons",
      index_m3: 1762045, index_precedent_m3: 1753215,
      debit_moyen_m3h: 40, qmin_nocturne_m3h: 11.2, qmax_jour_m3h: 94,
      derniere_releve: "25/10/2026 06:01", frequence_releve: "1 point / 10 min",
      statut: "warn", batterie_pct: 34,
      alerte: "QMn en hausse (+38 % vs moyenne 30 j) — suspicion de fuite cachée"
    },
    {
      id: "cpt-OUE", nom: "Compteur secteur Ouest", identifiant: "QMA-5533-OUE",
      secteur: "SEC-05", commune: "Macornay", coord: [46.6690, 5.5230],
      diametre_mm: 60, type_compteur: "Magnétique QMA",
      index_m3: 986420, index_precedent_m3: 981760,
      debit_moyen_m3h: 22, qmin_nocturne_m3h: 3.1, qmax_jour_m3h: 51,
      derniere_releve: "25/10/2026 05:57", frequence_releve: "1 point / 15 min",
      statut: "ok", batterie_pct: 95
    },
    {
      id: "cpt-DIT", nom: "Compteur de transfert Usine → Ville", identifiant: "ULS-7702-DIT",
      secteur: "SEC-05", commune: "Montreal", coord: [46.6620, 5.5160],
      diametre_mm: 150, type_compteur: "Ultra-sons DN150",
      index_m3: 12405680, index_precedent_m3: 12397180,
      debit_moyen_m3h: 210, qmin_nocturne_m3h: null, qmax_jour_m3h: 262,
      derniere_releve: "25/10/2026 06:03", frequence_releve: "1 point / 5 min",
      statut: "ok", batterie_pct: 88
    }
  ],

  /* ---------- CANALISATIONS PRINCIPALES (traits entre ouvrages) ---------- */
  canalisations: [
    // [coordA, coordB, type] — "principale" (plein) ou "antenne" (pointillé)
    { a: [46.6585, 5.4975], b: [46.6620, 5.5160], type: "principale", dn: "DN150", libelle: "Transfert usine → ville" },
    { a: [46.6620, 5.5160], b: [46.6720, 5.5080], type: "antenne",     dn: "DN80",  libelle: "Alimentation réservoir Ratilly" },
    { a: [46.6620, 5.5160], b: [46.6760, 5.5450], type: "principale", dn: "DN150", libelle: "Aménée vers compteur Centre" },
    { a: [46.6760, 5.5450], b: [46.6810, 5.5480], type: "principale", dn: "DN110", libelle: "Alimentation réservoir Croisilles" },
    { a: [46.6810, 5.5480], b: [46.6735, 5.5545], type: "principale", dn: "DN100", libelle: "Refoulement pompage Saint-Jean" },
    { a: [46.6760, 5.5450], b: [46.6900, 5.5600], type: "principale", dn: "DN80",  libelle: "Distribution Nord" },
    { a: [46.6900, 5.5600], b: [46.6985, 5.5565], type: "principale", dn: "DN80",  libelle: "Alimentation réservoir Montciel" },
    { a: [46.6760, 5.5450], b: [46.6560, 5.5500], type: "principale", dn: "DN80",  libelle: "Descente vers secteur Sud" },
    { a: [46.6560, 5.5500], b: [46.6520, 5.5560], type: "principale", dn: "DN60",  libelle: "Remplissage réservoir de la Combe" },
    { a: [46.6520, 5.5560], b: [46.6455, 5.5620], type: "antenne",    dn: "DN50",  libelle: "Reprise Revigny" },
    { a: [46.6760, 5.5450], b: [46.6780, 5.5830], type: "principale", dn: "DN100", libelle: "Antenne Est — Perrigny" },
    { a: [46.6780, 5.5830], b: [46.6830, 5.5950], type: "principale", dn: "DN100", libelle: "Alimentation réservoir Perrigny" },
    { a: [46.6780, 5.5830], b: [46.6680, 5.6020], type: "antenne",    dn: "DN60",  libelle: "Surpression Montmorot" },
    { a: [46.6680, 5.6020], b: [46.6830, 5.5950], type: "antenne",    dn: "DN50",  libelle: "Équilibre Grands Boismuriens" },
    { a: [46.6900, 5.5600], b: [46.6780, 5.5830], type: "antenne",    dn: "DN60",  libelle: "Bouclage Nord–Est" },
    { a: [46.6560, 5.5500], b: [46.6690, 5.5230], type: "antenne",    dn: "DN60",  libelle: "Bouclage Sud–Ouest" },
    { a: [46.6690, 5.5230], b: [46.6720, 5.5080], type: "antenne",    dn: "DN60",  libelle: "Alimentation Macornay" }
  ]
};

/* Génère une "photo" SVG factice pour les fiches (aucune ressource externe) */
function fakePhotoSVG(kind, label) {
  const scenes = {
    reservoir: `<rect width='400' height='220' fill='#bcdcf2'/>
      <circle cx='330' cy='45' r='26' fill='#ffe27a'/>
      <rect y='150' width='400' height='70' fill='#7fb069'/>
      <rect x='120' y='85' width='160' height='95' rx='8' fill='#d8dde3' stroke='#8a94a3'/>
      <rect x='120' y='85' width='160' height='18' rx='8' fill='#aab4bf'/>
      <rect x='185' y='60' width='30' height='28' fill='#c3ccd6' stroke='#8a94a3'/>
      <line x1='150' y1='180' x2='150' y2='150' stroke='#5f6b78' stroke-width='6'/>
      <line x1='250' y1='180' x2='250' y2='150' stroke='#5f6b78' stroke-width='6'/>`,
    station: `<rect width='400' height='220' fill='#cfe6f5'/>
      <rect y='160' width='400' height='60' fill='#8fae7e'/>
      <rect x='70' y='70' width='150' height='95' rx='6' fill='#eef1f4' stroke='#8a94a3'/>
      <polygon points='70,70 145,38 220,70' fill='#b3413a'/>
      <rect x='240' y='95' width='60' height='70' fill='#9aa7b5' stroke='#6c7885'/>
      <circle cx='270' cy='118' r='12' fill='#35b8e8'/>
      <rect x='310' y='60' width='14' height='105' fill='#7c8894'/>
      <ellipse cx='317' cy='58' rx='26' ry='7' fill='#aeb9c4'/>
      <rect x='95' y='105' width='34' height='60' fill='#5c7892'/>`,
    default: `<rect width='400' height='220' fill='#dceaf6'/><rect y='150' width='400' height='70' fill='#7fb069'/>`
  };
  const body = scenes[kind] || scenes.default;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 220'>${body}` +
    `<rect x='0' y='192' width='400' height='28' fill='rgba(11,37,69,.72)'/>` +
    `<text x='10' y='211' font-family='Arial' font-size='13' fill='#ffffff'>${label} · vue d'illustration</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
