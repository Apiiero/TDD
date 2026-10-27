/* =========================================================
   defauts.js — Registre des défauts & anomalies du réseau
   - Détection automatique depuis les données (STORE) + signalement manuel
   - Acquêtement (workflow : Ouvert → En cours → Résolu / Classé sans suite)
   - Historisation complète des évènements (journal immuable, persisté)
   - Partagé entre la page "Défauts & anomalies" et l'admin
   ========================================================= */
"use strict";

const DEFAUTS = (() => {
  const LS_KEY = "cartoeau_defauts_v1";
  const LOG_KEY = "cartoeau_defauts_log_v1";

  /* ---------- Utilitaires dates (format fr jj/mm/aaaa hh:mm) ---------- */
  function nowStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // Convertit "jj/mm/aaaa" ou ISO "aaaa-mm-jj" en Date ; null si non parseable
  function parseFrDate(s) {
    if (!s) return null;
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s).trim());
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  function daysSince(s) {
    const d = parseFrDate(s);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /* ---------- Référentiels ---------- */
  const GRAVITES = [
    ["critique", "Critique", "#c0392b"],
    ["majeur", "Majeur", "#e67e22"],
    ["mineur", "Mineur", "#f1c40f"],
    ["info", "Information", "#5dade2"],
  ];
  const TYPES_DEFAUT = [
    ["fuite", "Fuite / perte d'eau"],
    ["ouvrage", "Dégradation d'ouvrage"],
    ["qualite", "Qualité de l'eau"],
    ["hydraulique", "Anomalie hydraulique (pression, niveau…)"],
    ["teleinfo", "Télérelève / compteur"],
    ["maintenance", "Entretien hors délai"],
    ["autre", "Autre"],
  ];
  const STATUTS = {
    ouvert:    { label: "Ouvert",             cls: "st-ouvert",    ic: "🔴" },
    encours:   { label: "En cours",           cls: "st-encours",   ic: "🟠" },
    resolu:    { label: "Résolu (acquitté)",  cls: "st-resolu",    ic: "🟢" },
    sanssuite: { label: "Classé sans suite",  cls: "st-sanssuite", ic: "⚪" },
  };

  /* ---------- État persisté ---------- */
  let state = { manuels: [], suivi: {} }; // suivi : { refAuto: { statut, gravite, responsable, actions[] } }
  let journal = [];                       // historique global immuable des évènements

  function readLS() {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && s.suivi) state = s; } catch (e) { /* ignore */ }
    try { const j = JSON.parse(localStorage.getItem(LOG_KEY)); if (Array.isArray(j)) journal = j; } catch (e) { /* ignore */ }
  }
  readLS(); // recharge les modifications enregistrées lors de la dernière session
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    localStorage.setItem(LOG_KEY, JSON.stringify(journal));
  }

  /* ---------- Journalisation ---------- */
  function logEvent(defRef, type, message, actor) {
    journal.unshift({
      eid: "EVT-" + String(journal.length + 1).padStart(4, "0"),
      date: nowStr(),
      defaut: defRef || "—",
      type,
      message,
      acteur: actor || "admin",
    });
    save();
  }

  /* ---------- Détection automatique depuis les données réseau ---------- */
  // Retourne une liste de "défauts détectés" avec une référence stable (refAuto).
  // Règle : un seul défaut canonique par ouvrage/secteur (les signaux secondaires
  // — niveau critique, batterie faible… — sont fusionnés dans la description).
  function detecter() {
    const out = [];
    const d = STORE.data;
    const secteurNom = (id) => { const s = d.secteurs.find((x) => x.id === id); return s ? s.nom : id; };

    const add = (o) => { out.push(o); return o; };
    const byRef = (ref) => out.find((x) => x.refAuto === ref);
    const appendSignal = (target, txt) => {
      if (!target) return;
      target.description += ` Signaux additionnels : ${txt}`;
      if (/critique|bad/i.test(txt) && target.gravite !== "critique") target.gravite = "critique";
    };

    // 1. Ouvrages en anomalie / à surveiller (référence = id de l'ouvrage)
    const ouvrages = [
      ...d.reservoirs.map((r) => ({ ...r, _cat: "Réservoir", _detail: r.notes })),
      ...d.stations.map((s) => ({ ...s, _cat: "Station", _detail: s.mode_exploitation })),
      ...d.compteurs.map((c) => ({ ...c, _cat: "Compteur", _detail: c.alerte })),
    ];
    ouvrages.forEach((o) => {
      if (o.statut === "bad" || o.statut === "warn") {
        add({
          refAuto: `AUTO-${o.id}`,
          source: "auto",
          categorie: o._cat, elementId: o.id, elementNom: o.nom,
          secteur: secteurNom(o.secteur), commune: o.commune, coord: o.coord,
          type: o.statut === "bad" ? "ouvrage" : "hydraulique",
          titre: o.statut === "bad"
            ? `Anomalie signalée sur ${o._cat.toLowerCase()} « ${o.nom} »`
            : `${o._cat} « ${o.nom} » à surveiller`,
          description: o._detail && String(o._detail).trim()
            ? o._detail
            : (o.statut === "bad" ? "Statut « Anomalie » saisi dans la fiche ouvrage." : "Statut « À surveiller » saisi dans la fiche ouvrage."),
          gravite: o.statut === "bad" ? "critique" : "majeur",
        });
      }
    });

    // 2. Niveaux critiques de réservoirs → fusionnés dans le défaut du réservoir
    d.reservoirs.forEach((r) => {
      if (Number(r.niveau_pct) <= 15) {
        appendSignal(byRef(`AUTO-${r.id}`),
          `niveau critique ${r.niveau_pct} % (${r.remplissage_m3} m³ sur ${r.capacite_m3} m³) — risque de rupture d'alimentation du secteur`);
      }
    });

    // 3. Batteries faibles sur compteurs → fusionnés si défaut de télérelève déjà créé,
    //    sinon défaut « téléinfo » à part entière
    d.compteurs.forEach((c) => {
      if (Number(c.batterie_pct) < 40) {
        const existing = byRef(`AUTO-${c.id}`);
        if (existing) {
          appendSignal(existing, `batterie télécom à ${c.batterie_pct} % (< 40 %) — remplacement à prévoir`);
        } else {
          add({
            refAuto: `AUTO-${c.id}-BATTERIE`,
            source: "auto",
            categorie: "Compteur", elementId: c.id, elementNom: c.nom,
            secteur: secteurNom(c.secteur), commune: c.commune, coord: c.coord,
            type: "teleinfo",
            titre: `Batterie faible — compteur ${c.identifiant || c.nom}`,
            description: `Niveau de batterie télécom : ${c.batterie_pct} % (< 40 %). Remplacement à prévoir pour ne pas perdre la télérelève.`,
            gravite: Number(c.batterie_pct) < 20 ? "majeur" : "mineur",
          });
        }
      }
    });

    // 4. Entretiens hors délai (> 540 jours) → défaut propre si l'ouvrage est sinon conforme
    [...d.reservoirs, ...d.stations].forEach((o) => {
      const j = daysSince(o.dernier_entretien);
      if (j != null && j > 540) {
        const existing = byRef(`AUTO-${o.id}`);
        if (existing) {
          appendSignal(existing, `dernier entretien le ${o.dernier_entretien} (${j} jours) — périodicité dépassée`);
        } else {
          add({
            refAuto: `AUTO-${o.id}-ENTRETIEN`,
            source: "auto",
            categorie: o.capacite_m3 != null ? "Réservoir" : "Station",
            elementId: o.id, elementNom: o.nom,
            secteur: secteurNom(o.secteur), commune: o.commune, coord: o.coord,
            type: "maintenance",
            titre: `Entretien hors délai — « ${o.nom} »`,
            description: `Dernier entretien le ${o.dernier_entretien} (${j} jours). La périodicité réglementaire (vide sanitaire / maintenance) est dépassée.`,
            gravite: j > 720 ? "majeur" : "mineur",
          });
        }
      }
    });

    // 5. Fuites détectées dans les secteurs
    d.secteurs.forEach((s) => {
      if (Number(s.fuites_24h) > 0) {
        add({
          refAuto: `AUTO-${s.id}-FUITES`,
          source: "auto",
          categorie: "Secteur", elementId: s.id, elementNom: s.nom,
          secteur: s.nom, commune: s.commune, coord: s.poly ? s.poly[0] : null,
          type: "fuite",
          titre: `${s.fuites_24h} fuite(s) détectée(s) sous 24 h — ${s.nom}`,
          description: `Sectorisation ${s.code || s.id} : ${s.fuites_24h} fuite(s) localisée(s) par la télérelève. Rendement réseau actuel : ${s.rendement_pct} %.`,
          gravite: Number(s.fuites_24h) >= 3 ? "majeur" : "mineur",
        });
      }
    });

    return out;
  }

  /* ---------- Fusion détection + saisies manuelles + suivi ---------- */
  // Chaque défaut retourné porte : fields (référence), statut effectif, actions (historique local)
  function lister() {
    const items = [];
    detecter().forEach((det) => {
      const su = state.suivi[det.refAuto] || {};
      items.push(assemble(det.refAuto, "auto", det, su));
    });
    state.manuels.forEach((man) => {
      if (man.supprime) return;
      const su = state.suivi[man.ref] || {};
      items.push(assemble(man.ref, "manuel", stripSuivi(man), su));
    });
    // Tri : actifs d'abord (gravité puis ancienneté), puis acquittés
    const ordreGrav = { critique: 0, majeur: 1, mineur: 2, info: 3 };
    items.sort((a, b) => {
      const actifA = a.statut === "resolu" || a.statut === "sanssuite";
      const actifB = b.statut === "resolu" || b.statut === "sanssuite";
      if (actifA !== actifB) return actifA ? 1 : -1;
      if (ordreGrav[a.gravite] !== ordreGrav[b.gravite]) return ordreGrav[a.gravite] - ordreGrav[b.gravite];
      return String(a.date_detection).localeCompare(String(b.date_detection));
    });
    return items;
  }

  function assemble(ref, source, det, su) {
    return {
      ref, source, ...det,
      gravite: su.gravite || det.gravite,
      statut: su.statut || "ouvert",
      responsable: su.responsable || "",
      commentaire: su.commentaire || "",
      actions: su.actions || [],
      date_detection: su.date_detection || det.date_detection || nowStr(),
      acquitte_le: su.acquitte_le || null,
    };
  }
  function stripSuivi(m) {
    const { suivi, ...rest } = m; return rest;
  }

  /* ---------- Acquêtement (workflow) ---------- */
  // retour = { ok, msg }
  function changerStatut(ref, nouveau, opts = {}) {
    const item = lister().find((x) => x.ref === ref);
    if (!item) return { ok: false, msg: "Défaut introuvable." };
    if ((item.statut === "resolu" || item.statut === "sanssuite") && !opts.reouvrir) {
      return { ok: false, msg: "Défaut déjà acquitté — réouvrez-le d'abord pour le modifier." };
    }
    const su = state.suivi[ref] = state.suivi[ref] || { actions: [] };
    su.actions = su.actions || [];
    const ancien = su.statut || "ouvert";
    const libellePre = item.titre || item.ref;
    if (ancien === nouveau && !opts.force) return { ok: false, msg: "Changement de statut ignoré (statut identique)." };

    // Références stables : si le suivi ne porte aucune action (défaut apparu après
    // la dernière écriture du registre), on crée l'évènement « détection automatique ».
    if (!su.actions || !su.actions.length) {
      const dd = nowStr();
      su.date_detection = dd;
      su.actions = [{ date: dd, du: "—", vers: "Ouvert", acteur: "Système (détection auto)",
                      commentaire: `Détection automatique : ${item.titre}` }];
      logEvent(ref, "creation", `Détection automatique : ${libellePre}`, "Système (détection auto)");
    }
    su.statut = nouveau;
    if (opts.commentaire) su.commentaire = opts.commentaire;
    if (opts.responsable) su.responsable = opts.responsable;

    const action = {
      date: nowStr(),
      du: STATUTS[ancien].label,
      vers: STATUTS[nouveau].label,
      acteur: opts.acteur || "admin",
      commentaire: opts.commentaire || "",
      pieces: opts.pieces || "",
    };
    if (ancien !== nouveau || opts.force) su.actions.push(action);

    if (nouveau === "resolu" || nouveau === "sanssuite") su.acquitte_le = action.date;
    else su.acquitte_le = null;

    const libelleDefaut = item.titre || item.ref;
    logEvent(ref, "statut",
      `${libelleDefaut} — statut : ${STATUTS[ancien].label} → ${STATUTS[nouveau].label}` +
      (action.commentaire ? ` · « ${action.commentaire} »` : ""), action.acteur);

    save();
    return { ok: true, msg: `Défaut ${nouveau === "resolu" ? "acquitté" : nouveau === "sanssuite" ? "classé sans suite ⚪" : "mis à jour 🔄"} ✅.` };
  }

  /* ---------- Réouverture d'un défaut acquitté ---------- */
  function reouvrir(ref, opts = {}) {
    const item = lister().find((x) => x.ref === ref);
    if (!item) return { ok: false, msg: "Défaut introuvable." };
    if (item.statut !== "resolu" && item.statut !== "sanssuite") {
      return { ok: false, msg: "Ce défaut n'est pas clos — rien à réouvrir." };
    }
    if (!String(opts.commentaire || "").trim()) {
      return { ok: false, msg: "Un motif de réouverture est obligatoire." };
    }
    return changerStatut(ref, "ouvert", { ...opts, reouvrir: true });
  }

  /* ---------- Signalement manuel (no code) ---------- */
  function creerManuel(fields, opts = {}) {
    const ref = "DEF-" + String(nextNum()).padStart(4, "0");
    const item = {
      ref,
      source: "manuel",
      categorie: fields.categorie || "Réseau",
      elementId: fields.elementId || "",
      elementNom: fields.elementNom || "",
      secteur: fields.secteur || "",
      commune: fields.commune || "",
      coord: fields.coord || null,
      type: fields.type || "autre",
      titre: fields.titre || "Défaut signalé",
      description: fields.description || "",
      gravite: fields.gravite || "mineur",
      date_detection: nowStr(),
    };
    state.manuels.push(item);
    state.suivi[ref] = {
      statut: "ouvert",
      responsable: fields.responsable || "",
      actions: [{
        date: nowStr(), du: "—", vers: "Ouvert",
        acteur: opts.acteur || "admin",
        commentaire: "Défaut enregistré via le formulaire de signalement.",
      }],
    };
    logEvent(ref, "creation", `Signalement manuel : ${item.titre} (gravité ${item.gravite})`, opts.acteur || "admin");
    save();
    return ref;
  }

  function supprimerManuel(ref, opts = {}) {
    const idx = state.manuels.findIndex((m) => m.ref === ref);
    if (idx < 0) return { ok: false, msg: "Impossible de supprimer un défaut détecté automatiquement (modifiable uniquement)." };
    const nom = state.manuels[idx].titre;
    state.manuels.splice(idx, 1);
    delete state.suivi[ref];
    logEvent(ref, "suppression", `Défaut supprimé du registre : ${nom}`, opts.acteur || "admin");
    save();
    return { ok: true, msg: "Défaut retiré du registre." };
  }

  function nextNum() {
    let max = 0;
    state.manuels.forEach((m) => { const mm = /DEF-(\d+)/.exec(m.ref); if (mm) max = Math.max(max, +mm[1]); });
    Object.keys(state.suivi).forEach((r) => { const mm = /DEF-(\d+)/.exec(r); if (mm) max = Math.max(max, +mm[1]); });
    journal.forEach((e) => { const mm = /DEF-(\d+)/.exec(e.defaut); if (mm) max = Math.max(max, +mm[1]); });
    return max + 1;
  }

  /* ---------- Statistiques ---------- */
  function stats(items) {
    items = items || lister();
    const s = { total: items.length, ouvert: 0, encours: 0, resolu: 0, sanssuite: 0, critique: 0, majeures: 0, actifs: 0 };
    items.forEach((i) => {
      s[i.statut] = (s[i.statut] || 0) + 1;
      if (i.statut === "resolu" || i.statut === "sanssuite") return;
      s.actifs++;
      if (i.gravite === "critique") s.critique++;
      if (i.gravite === "majeur") s.majeures++;
    });
    return s;
  }

  /* ---------- Export CSV (registre + historique) ---------- */
  function csvCell(v) {
    v = String(v ?? "").replace(/[\r\n]+/g, " ");
    return /[",;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportRegistreCSV() {
    const head = ["Référence", "Source", "Statut", "Gravité", "Type", "Catégorie", "Ouvrage", "Secteur", "Commune", "Titre", "Description", "Responsable", "Détecté le", "Acquitté le"];
    const rows = lister().map((i) => [i.ref, i.source, STATUTS[i.statut].label, i.gravite, i.type, i.categorie, i.elementNom || i.elementId, i.secteur, i.commune, i.titre, i.description, i.responsable, i.date_detection, i.acquitte_le || ""]);
    return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
  }
  function exportHistoriqueCSV() {
    const head = ["ID évènement", "Date", "Défaut", "Type d'évènement", "Message", "Acteur"];
    const rows = journal.map((e) => [e.eid, e.date, e.defaut, e.type, e.message, e.acteur]);
    return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
  }

  /* ---------- Réinitialisation au jeu de démonstration ---------- */
  function resetDemo(actor) {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LOG_KEY);

    // État de démonstration (défauts + suivi d'acquêtement fictif)
    state = { manuels: DEMO_MANUELS(), suivi: DEMO_SUIVI() };
    journal = [];

    // Journal d'historique reconstitué à partir des actions de la démo
    const seed = [
      { date: "03/08/2026 14:40", defaut: "DEF-0002", type: "creation", message: "Signalement manuel : bouche d'incendie BI n°128 — chapeau manquant (gravité mineur)", acteur: "Agent BIC" },
      ...DEMO_JOURNAL(),
    ];
    seed.sort((a, b) => cmpDates(b.date, a.date));
    seed.forEach((e, i) => { e.eid = "EVT-D" + String(i + 1).padStart(3, "0"); });
    journal = seed;
    logEvent("—", "systeme", "Registre réinitialisé au jeu de démonstration.", actor || "admin");
  }

  // Données fictives de départ (met en scène l'acquêtement + l'historisation)
  function DEMO_MANUELS() {
    return [
      {
        ref: "DEF-0001", source: "manuel", categorie: "Canalisation",
        elementId: "", elementNom: "Conduite DN80 rue des Croisilles",
        secteur: "Secteur Centre-Ville", commune: "Lons-le-Saunier",
        coord: [46.6802, 5.5462], type: "fuite",
        titre: "Affaissement de chaussée et suintement constatés",
        description: "Signalement agent voirie du 12/09/2026 : affaissement de 15 cm sur DN80 fonte, suintement permanent. Repérage acoustique positif.",
        gravite: "majeur", date_detection: "12/09/2026 08:15",
      },
      {
        ref: "DEF-0002", source: "manuel", categorie: "Réseau",
        elementId: "", elementNom: "Bouche d'incendie BI n°128 — place de la Liberté",
        secteur: "Secteur Nord — Juvigny / Vernot", commune: "Lons-le-Saunier",
        coord: [46.6912, 5.5572], type: "ouvrage",
        titre: "Chapeau de BI manquant, filet de raccordement endommagé",
        description: "Constat lors de la campagne annuelle d' vérification des BIC (03/08/2026). Mise en danger potentielle, remplacement du chapeau nécessaire.",
        gravite: "mineur", date_detection: "03/08/2026 14:40",
      },
    ];
  }
  function DEMO_SUIVI() {
    return {
      "DEF-0001": {
        statut: "resolu", responsable: "Équipe travaux — M. Chevalier",
        commentaire: "Fuite colmatée par manchon serré, chaussée réparée, remise en service effectuée.",
        acquitte_le: "02/10/2026 17:05",
        actions: [
          { date: "12/09/2026 08:15", du: "—", vers: "Ouvert", acteur: "M. Girard", commentaire: "Création du dossier après signalement voirie." },
          { date: "15/09/2026 09:02", du: "Ouvert", vers: "En cours", acteur: "M. Chevalier", commentaire: "REP + DP autorisées, intervention planifiée S39." },
          { date: "01/10/2026 15:30", du: "En cours", vers: "En cours", acteur: "M. Chevalier", commentaire: "Colmatement réalisé, essai pression OK. Remise en état chaussée le 02/10." },
          { date: "02/10/2026 17:05", du: "En cours", vers: "Résolu (acquitté)", acteur: "admin", commentaire: "Acquittement après contrôle visuel et retour compteur QMA-3821-CEN (QMn revenu à la normale).", pieces: "Photos chantier + PV d'essai" },
        ],
      },
      "AUTO-RES-05": {
        statut: "encours", responsable: "Équipe exploitation — Mme Perrot",
        commentaire: "Recherche de fuite sur by-pass en cours (corrélation acoustique programmée).",
        actions: [
          { date: "20/10/2026 07:12", du: "—", vers: "Ouvert", acteur: "Système (détection auto)", commentaire: "Détection automatique : statut Anomalie sur le réservoir (remplissage 12 %)." },
          { date: "21/10/2026 10:45", du: "Ouvert", vers: "En cours", acteur: "Mme Perrot", commentaire: "Visite sur site : suspicion by-pass interne. Campagne de corrélation planifiée nuit du 24 au 25/10." },
        ],
      },
      "AUTO-cpt-EST": {
        statut: "encours", responsable: "Service télérelève",
        commentaire: "Piles de rechange commandées, remplacement prévu lors de la tournée du 05/11.",
        actions: [
          { date: "18/10/2026 06:30", du: "—", vers: "Ouvert", acteur: "Système (détection auto)", commentaire: "Détection automatique : batterie 34 % (< 40 %)." },
          { date: "19/10/2026 11:02", du: "Ouvert", vers: "En cours", acteur: "Technicien télérelève", commentaire: "Commande piles lithium passée (réf. com BL-2041)." },
        ],
      },
      "AUTO-SEC-04-FUITES": {
        statut: "resolu", responsable: "Mme Berthier",
        commentaire: "Deux fuites réparées sur antenne DN60 Perrigny ; les deux autres étaient des doublons de repérage.",
        acquitte_le: "22/10/2026 16:20",
        actions: [
          { date: "17/10/2026 08:00", du: "—", vers: "Ouvert", acteur: "Système (détection auto)", commentaire: "Détection automatique : 4 fuites signalées sous 24 h sur le secteur EST." },
          { date: "18/10/2026 09:15", du: "Ouvert", vers: "En cours", acteur: "Mme Berthier", commentaire: "Repérage terrain sur 4 points suspects." },
          { date: "22/10/2026 16:20", du: "En cours", vers: "Résolu (acquitté)", acteur: "admin", commentaire: "Acquittement partiel justifié : 2 fuites réparées, 2 doublons écartés. Rendement secteur remonté à 81,2 %.", pieces: "Rapport repérage 21/10" },
        ],
      },
    };
  }
  function DEMO_JOURNAL() {
    const j = [];
    const seen = new Set();
    const pushOnce = (e) => {
      const key = `${e.date}|${e.defaut}|${e.message}`;
      if (seen.has(key)) return;
      seen.add(key); j.push(e);
    };
    Object.entries(state.suivi).forEach(([ref, su]) => {
      (su.actions || []).forEach((a) => {
        pushOnce({
          date: a.date, defaut: ref, type: "statut",
          message: `${a.vers === "Ouvert" && a.du === "—" ? "Création" : "Changement de statut"} : ${a.du} → ${a.vers}${a.commentaire ? " · « " + a.commentaire + " »" : ""}`,
          acteur: a.acteur,
        });
      });
    });
    pushOnce({ date: "12/09/2026 08:15", defaut: "DEF-0001", type: "creation", message: "Signalement manuel : affaissement de chaussée rue des Croisilles (gravité majeur)", acteur: "M. Girard" });
    pushOnce({ date: "03/08/2026 14:40", defaut: "DEF-0002", type: "creation", message: "Signalement manuel : bouche d'incendie BI n°128 — chapeau manquant (gravité mineur)", acteur: "Agent BIC" });
    j.sort((a, b) => cmpDates(b.date, a.date));
    j.forEach((e, i) => { e.eid = "EVT-" + String(i + 1).padStart(4, "0"); });
    return j;
  }
  function cmpDates(a, b) {
    const pa = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(a) || [];
    const pb = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(b) || [];
    const da = pa.length ? Date.UTC(+pa[3], +pa[2] - 1, +pa[1], +pa[4], +pa[5]) : 0;
    const db = pb.length ? Date.UTC(+pb[3], +pb[2] - 1, +pb[1], +pb[4], +pb[5]) : 0;
    return da - db;
  }

  // Premier lancement : on pré-charge le jeu de démonstration (si rien de sauvegardé)
  if (!localStorage.getItem(LS_KEY)) resetDemo("système");

  /* ---------- API publique ---------- */
  return {
    GRAVITES, TYPES_DEFAUT, STATUTS,
    detecter, lister, stats,
    changerStatut, reouvrir, creerManuel, supprimerManuel,
    get journal() { return journal.slice(); },
    exportRegistreCSV, exportHistoriqueCSV,
    resetDemo,
    subscribe(fn) { this._subs = this._subs || []; this._subs.push(fn); },
    _notify() { (this._subs || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); },
    nowStr,
  };
})();

// Toute modification STORE (admin) ou DEFAUTS doit rafraîchir les abonnés
(function () {
  // hook : notifie les abonnés après chaque mutation publique du registre
  ["changerStatut", "reouvrir", "creerManuel", "supprimerManuel", "resetDemo"].forEach((k) => {
    const fn = DEFAUTS[k];
    DEFAUTS[k] = (...args) => { const r = fn(...args); DEFAUTS._notify(); return r; };
  });
  if (window.STORE) STORE.subscribe(() => DEFAUTS._notify());
})();
