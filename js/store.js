/* =========================================================
   store.js — Gestion centralisée des données de Carto'Eau
   (partagée entre la carte publique et l'interface d'administration)

   - Charge le jeu de données fictif de référence (DATASET, js/data.js)
   - Surcharge avec les modifications enregistrées par l'admin (localStorage)
   - Notifie les applications abonnées à chaque changement
   ========================================================= */
(function () {
  "use strict";

  const LS_KEY = "cartoeau_overrides_v1";
  const SESSION_AUTH = "cartoeau_admin_auth";

  /* ---------------- Utilitaires ---------------- */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid(prefix) {
    let max = 0;
    Object.values(STORE.data).forEach((arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((it) => {
        const m = /(\d+)$/.exec(it.id || "");
        if (m) max = Math.max(max, +m[1]);
      });
    });
    return prefix + "-" + String(max + 1).padStart(2, "0");
  }

  /* ---------------- État : données de référence + surcharges ---------------- */
  const overrides = (() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  })();

  const STORE = {
    data: deepClone(DATASET), // version affichée (référence + overrides)
    defaults: DATASET,        // jeu fictif d'origine (pour réinitialiser)

    isDirty() { return Object.keys(overrides).length > 0; },

    save() {
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
      notify();
    },

    /* ---- Accès aux collections ---- */
    list(kind) { return this.data[kind]; },
    get(kind, id) { return this.data[kind].find((x) => x.id === id); },

    /* ---- Création (no code : ajouts d'ouvrages ou secteurs) ---- */
    create(kind, obj) {
      if (!obj.id) obj.id = uid(KIND_PREFIX[kind] || "NEW");
      this.data[kind].push(deepClone(obj));
      (overrides[kind] = overrides[kind] || {})[obj.id] = obj;
      this.save();
      return obj.id;
    },

    /* ---- Modification champ à champ ---- */
    update(kind, id, field, value) {
      const item = this.get(kind, id);
      if (!item) return false;
      item[field] = value;
      (overrides[kind] = overrides[kind] || {})[id] = deepClone(item);
      this.save();
      return true;
    },

    /* ---- Suppression ---- */
    remove(kind, id) {
      this.data[kind] = this.data[kind].filter((x) => x.id !== id);
      if (overrides[kind]) delete overrides[kind][id];
      this.save();
    },

    /* ---- Réinitialisation complète au jeu fictif d'origine ---- */
    resetAll() {
      localStorage.removeItem(LS_KEY);
      Object.keys(overrides).forEach((k) => delete overrides[k]); // vide les surcharges en mémoire
      this.data = deepClone(DATASET);
      notify();
    },

    /* ---- Export / Import JSON (sauvegarde métier) ---- */
    exportJSON() { return JSON.stringify(this.data, null, 2); },

    importJSON(text) {
      const parsed = JSON.parse(text); // erreur si JSON invalide
      ["secteurs", "reservoirs", "stations", "compteurs", "canalisations"].forEach((k) => {
        if (Array.isArray(parsed[k])) this.data[k] = parsed[k];
      });
      if (parsed.center) this.data.center = parsed.center;
      if (parsed.zoom) this.data.zoom = parsed.zoom;
      // reconstruit les surcharges complètes à partir du dataset importé
      Object.keys(overrides).forEach((k) => delete overrides[k]);
      ["secteurs", "reservoirs", "stations", "compteurs"].forEach((kind) => {
        const base = new Set(DATASET[kind].map((x) => x.id));
        overrides[kind] = {};
        this.data[kind].forEach((x) => {
          const orig = DATASET[kind].find((y) => y.id === x.id);
          if (!orig || JSON.stringify(orig) !== JSON.stringify(x)) overrides[kind][x.id] = x;
        });
        if (!Object.keys(overrides[kind]).length) delete overrides[kind];
      });
      this.save();
    },

    /* ---- Abonnements (re-render de la carte quand l'admin modifie) ---- */
    _subs: [],
    subscribe(fn) { this._subs.push(fn); },
  };

  const KIND_PREFIX = { secteurs: "SEC", reservoirs: "RES", stations: "STA", compteurs: "CPT" };

  function notify() { STORE._subs.forEach((fn) => { try { fn(STORE.data); } catch (e) { console.error(e); } }); }

  /* ---------------- Application des surcharges sur le jeu affiché ---------------- */
  ["secteurs", "reservoirs", "stations", "compteurs"].forEach((kind) => {
    const ov = overrides[kind];
    if (!ov) return;
    Object.entries(ov).forEach(([id, val]) => {
      const idx = STORE.data[kind].findIndex((x) => x.id === id);
      if (idx >= 0) STORE.data[kind][idx] = val; else STORE.data[kind].push(val);
    });
  });

  /* ---------------- Authentification (démo no-code) ----------------
     Compte admin par défaut : admin / admin.
     L'admin peut changer le mot de passe depuis l'interface (hash simple,
     suffisant pour une démo locale — NE PAS utiliser en production).   */
  function simpleHash(str) {
    // FNV-1a 32 bits
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  const AUTH = {
    defaultUser: "admin",
    defaultPass: "admin",

    creds() {
      try { return JSON.parse(localStorage.getItem("cartoeau_creds")) || null; }
      catch (e) { return null; }
    },
    passHash() { const c = this.creds(); return c ? c.hash : simpleHash(this.defaultPass); },
    user() { const c = this.creds(); return c ? c.user : this.defaultUser; },

    check(user, pass) {
      return user.trim().toLowerCase() === this.user().toLowerCase() && simpleHash(pass) === this.passHash();
    },
    setPassword(newPass) {
      localStorage.setItem("cartoeau_creds", JSON.stringify({ user: this.user(), hash: simpleHash(newPass) }));
    },
    loginSession() { sessionStorage.setItem(SESSION_AUTH, "1"); },
    logout() { sessionStorage.removeItem(SESSION_AUTH); },
    isLoggedIn() { return sessionStorage.getItem(SESSION_AUTH) === "1"; },
  };

  window.STORE = STORE;
  window.AUTH = AUTH;
})();
