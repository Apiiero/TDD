/* =========================================================
   store.js — Gestion centralisée des données de Carto'Eau
   (partagée entre la carte publique, l'admin et le registre des défauts)

   Architecture « base de données GeoJSON » :
     - Les données de référence sont stockées dans des fichiers GeoJSON
       du répertoire  data/  (secteurs, reservoirs, stations, compteurs,
       canalisations, defauts, journal).
     - Si l'application est servie par  server.py  (python3 server.py),
       le STORE lit et écrit directement dans cette base via l'API REST :
         GET|POST /api/geojson/<collection>
         PATCH|PUT|DELETE /api/geojson/<collection>/<id>
       → les modifications sont persistées SUR LE DISQUE (data/*.geojson),
         visibles pour tous les postes connectés au serveur.
     - Sinon (ouverture en file:// ou hébergement statique), le STORE
       retombe automatiquement sur le stockage local du navigateur
       (localStorage) + le jeu fictif embarqué js/data.js : mode dégradé.
     - L'API du STORE reste identique (list/get/create/update/remove/…)
       afin que la carte, l'admin et les défauts fonctionnent à l'identique
       dans les deux modes.
   ========================================================= */
(function () {
  "use strict";

  const LS_KEY = "cartoeau_overrides_v1";
  const SESSION_AUTH = "cartoeau_admin_auth";
  const API_BASE = "/api/geojson/";

  /* Collections « métier » éditables via le STORE */
  const KINDS = ["secteurs", "reservoirs", "stations", "compteurs", "canalisations"];

  /* ---------------- Utilitaires ---------------- */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- Adaptateur GeoJSON <-> objets applicatifs ----------------
     Un fichier GeoJSON est une FeatureCollection (RFC 7946, coordonnées
     [lon, lat]). Ces fonctions ramènent chaque entité au format utilisé par
     l'application (coordonnées [lat, lng] sous « coord », « poly », « a/b »). */
  function featureToItem(kind, f) {
    const p = Object.assign({}, f.properties || {});
    const g = f.geometry;
    if (!p.id && f.id != null) p.id = f.id;
    if (kind === "secteurs" && g && g.type === "Polygon") {
      p.poly = g.coordinates[0].slice(0, -1).map((c) => [c[1], c[0]]);
    } else if (kind === "canalisations" && g && g.type === "LineString") {
      p.a = [g.coordinates[0][1], g.coordinates[0][0]];
      p.b = [g.coordinates[1][1], g.coordinates[1][0]];
    } else if (g && g.type === "Point") {
      p.coord = [g.coordinates[1], g.coordinates[0]];
    }
    return p;
  }

  function itemToFeature(kind, it) {
    const p = Object.assign({}, it);
    const id = p.id;
    delete p.id;
    let geometry = null;
    if (kind === "secteurs") {
      const ring = (p.poly || []).map((c) => [c[1], c[0]]);
      if (ring.length >= 3) { ring.push([ring[0][0], ring[0][1]]); geometry = { type: "Polygon", coordinates: [ring] }; }
      delete p.poly;
    } else if (kind === "canalisations") {
      if (p.a && p.b) geometry = { type: "LineString", coordinates: [[p.a[1], p.a[0]], [p.b[1], p.b[0]]] };
      delete p.a; delete p.b;
    } else if (p.coord) {
      geometry = { type: "Point", coordinates: [p.coord[1], p.coord[0]] };
      delete p.coord;
    }
    const feat = { type: "Feature", properties: p };
    if (id != null) feat.id = id;
    feat.geometry = geometry;
    return feat;
  }

  /* ---------------- État interne ---------------- */
  let backendOk = false;                       // true si l'API GeoJSON (server.py) répond
  const overrides = (() => {                   // surcharges locales (mode sans serveur)
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  })();

  const STORE = {
    data: deepClone(DATASET),                  // version affichée (appli)
    defaults: DATASET,                         // jeu fictif d'origine (réinitialisation)
    geojson: {},                               // collections GeoJSON brutes (mode serveur)
    backend: "local",                          // "server" | "local"
    ready: Promise.resolve(),

    /* ============ Démarrage asynchrone : chargement de la base ============ */
    init() {
      this.ready = this._load();
      return this.ready;
    },

    async _load() {
      try {
        const fcList = await Promise.all(KINDS.map(async (k) => {
          const r = await fetch(API_BASE + k, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status + " pour " + k);
          return r.json();
        }));
        this.geojson = {};
        KINDS.forEach((k, i) => { this.geojson[k] = fcList[i]; });
        const merged = { center: DATASET.center, zoom: DATASET.zoom };
        KINDS.forEach((k) => { merged[k] = this.geojson[k].features.map((f) => featureToItem(k, f)); });
        this.data = merged;
        this.backend = "server";
        backendOk = true;
        console.info("[STORE] Base GeoJSON du serveur chargée (data/*.geojson).");
      } catch (e) {
        this.backend = "local";
        backendOk = false;
        console.info("[STORE] Serveur GeoJSON indisponible → mode local (localStorage).", e.message || "");
        this._applyLocalOverrides();
      }
      notify();
    },

    /* ---- Accès aux collections ---- */
    list(kind) { return this.data[kind]; },
    get(kind, id) { return this.data[kind].find((x) => x.id === id); },

    isDirty() { return this.backend === "local" ? Object.keys(overrides).length > 0 : false; },
    storageLabel() {
      return this.backend === "server"
        ? "Base GeoJSON sur disque : répertoire data/ (via l'API /api/geojson)"
        : "Stockage local du navigateur (lancez « python3 server.py » pour persister dans data/*.geojson)";
    },

    save() { notify(); }, // conservé pour compatibilité ; la persistance est faite par create/update/remove

    /* ---- Création ---- */
    create(kind, obj) {
      if (!obj.id) obj.id = uid(KIND_PREFIX[kind] || "NEW");
      this.data[kind].push(deepClone(obj));
      if (backendOk) {
        postFeature(kind, itemToFeature(kind, obj));
      } else {
        (overrides[kind] = overrides[kind] || {})[obj.id] = obj;
        persistLocal();
      }
      this.save();
      return obj.id;
    },

    /* ---- Modification champ à champ ---- */
    update(kind, id, field, value) {
      const item = this.get(kind, id);
      if (!item) return false;
      item[field] = value;
      if (backendOk) {
        patchFeature(kind, id, { [field]: value });
      } else {
        (overrides[kind] = overrides[kind] || {})[id] = deepClone(item);
        persistLocal();
      }
      this.save();
      return true;
    },

    /* ---- Suppression ---- */
    remove(kind, id) {
      this.data[kind] = this.data[kind].filter((x) => x.id !== id);
      if (backendOk) {
        deleteFeature(kind, id);
      } else {
        if (overrides[kind]) delete overrides[kind][id];
        persistLocal();
      }
      this.save();
    },

    /* ---- Réinitialisation complète au jeu fictif d'origine ---- */
    resetAll() {
      localStorage.removeItem(LS_KEY);
      Object.keys(overrides).forEach((k) => delete overrides[k]);
      this.data = deepClone(DATASET);
      if (backendOk) {
        // Reconstruit la base GeoJSON : suppression des entités absentes du jeu
        // d'origine, réécriture (PUT) de toutes les entités de référence.
        KINDS.forEach(async (kind) => {
          try {
            const fc = await (await fetch(API_BASE + kind, { cache: "no-store" })).json();
            const refIds = new Set((DATASET[kind] || []).map((x) => x.id));
            for (const f of fc.features || []) {
              const fid = (f.properties && f.properties.id) || f.id;
              if (!refIds.has(fid)) await fetch(API_BASE + kind + "/" + encodeURIComponent(fid), { method: "DELETE" });
            }
            for (const it of DATASET[kind] || []) {
              await fetch(API_BASE + kind + "/" + encodeURIComponent(it.id), {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(itemToFeature(kind, it)),
              });
            }
          } catch (e) { console.error("Réinitialisation GeoJSON impossible pour " + kind, e); }
        });
      }
      notify();
    },

    /* ---- Export / Import JSON (sauvegarde métier) ---- */
    exportJSON() { return JSON.stringify(this.data, null, 2); },

    importJSON(text) {
      const parsed = JSON.parse(text); // erreur si JSON invalide
      KINDS.forEach((k) => { if (Array.isArray(parsed[k])) this.data[k] = parsed[k]; });
      if (parsed.center) this.data.center = parsed.center;
      if (parsed.zoom) this.data.zoom = parsed.zoom;
      if (backendOk) {
        // Reconstruction complète de la base : purge puis recréation
        KINDS.forEach(async (kind) => {
          try {
            const fc = await (await fetch(API_BASE + kind, { cache: "no-store" })).json();
            for (const f of fc.features || []) {
              const fid = (f.properties && f.properties.id) || f.id;
              await fetch(API_BASE + kind + "/" + encodeURIComponent(fid), { method: "DELETE" });
            }
            for (const it of this.data[kind] || []) await postFeature(kind, it);
          } catch (e) { console.error("Import GeoJSON impossible pour " + kind, e); }
        });
      } else {
        Object.keys(overrides).forEach((k) => delete overrides[k]);
        KINDS.forEach((kind) => {
          const base = new Set(DATASET[kind].map((x) => x.id));
          overrides[kind] = {};
          this.data[kind].forEach((x) => {
            const orig = DATASET[kind].find((y) => y.id === x.id);
            if (!orig || JSON.stringify(orig) !== JSON.stringify(x)) overrides[kind][x.id] = x;
          });
          if (!Object.keys(overrides[kind]).length) delete overrides[kind];
        });
        persistLocal();
      }
      this.save();
    },

    /* ---- Abonnements (re-render quand les données changent) ---- */
    _subs: [],
    subscribe(fn) { this._subs.push(fn); },
  };

  const KIND_PREFIX = { secteurs: "SEC", reservoirs: "RES", stations: "STA", compteurs: "CPT", canalisations: "CAN" };

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

  function notify() { STORE._subs.forEach((fn) => { try { fn(STORE.data); } catch (e) { console.error(e); } }); }

  /* ---------------- Écritures vers l'API GeoJSON ---------------- */
  async function postFeature(kind, it) {
    try {
      const r = await fetch(API_BASE + kind, {
        method: "POST", headers: { "Content-Type": "application/geo+json" },
        body: JSON.stringify(it),
      });
      if (!r.ok) console.error("POST refusé :", await r.text());
    } catch (e) { console.error("Écriture GeoJSON impossible (création)", e); }
  }
  async function patchFeature(kind, id, changes) {
    try {
      const r = await fetch(API_BASE + kind + "/" + encodeURIComponent(id), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!r.ok) console.error("PATCH refusé :", await r.text());
    } catch (e) { console.error("Écriture GeoJSON impossible (modification)", e); }
  }
  async function deleteFeature(kind, id) {
    try {
      const r = await fetch(API_BASE + kind + "/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) console.error("DELETE refusé :", await r.text());
    } catch (e) { console.error("Écriture GeoJSON impossible (suppression)", e); }
  }

  /* ---------------- Mode local : application des surcharges ---------------- */
  function persistLocal() { localStorage.setItem(LS_KEY, JSON.stringify(overrides)); }

  function applyOverrides(target) {
    KINDS.forEach((kind) => {
      const ov = overrides[kind];
      if (!ov) return;
      Object.entries(ov).forEach(([id, val]) => {
        const idx = target[kind].findIndex((x) => x.id === id);
        if (idx >= 0) target[kind][idx] = val; else target[kind].push(val);
      });
    });
  }
  STORE._applyLocalOverrides = function () { applyOverrides(this.data); };

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
