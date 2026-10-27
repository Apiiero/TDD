/* =========================================================
   admin.js — Interface d'administration no-code de Carto'Eau
   Connexion (admin/admin par défaut), édition des secteurs,
   réservoirs, stations et compteurs via des formulaires.
   Toutes les modifications sont enregistrées automatiquement
   dans le STORE partagé avec la carte (localStorage).
   ========================================================= */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- Formatage & échappement ---------------- */
function fmt(n, d = 0) {
  return n == null || Number.isNaN(Number(n)) ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let toastTimer;
function toast(msg) {
  $("#toast-text").textContent = msg;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 2400);
}

/* ---------------- Schémas de formulaires (no code : tout est piloté ici) ----------------
   types : text | textarea | number | select | color | point (lat,lng) | coord (polygone) | auto
*/
const STATUT_OPTS = [["ok", "Conforme"], ["warn", "À surveiller"], ["bad", "Anomalie"]];
const labelStatut = (st) => (STATUT_OPTS.find((o) => o[0] === st) || ["—"])[0];
const optsSecteurs = () => STORE.data.secteurs.map((s) => [s.id, s.nom]);
const firstSecteur = () => { const s = STORE.data.secteurs[0]; return s ? s.id : ""; };
const round1 = (v) => Math.round(Number(v) * 10) / 10;

const SCHEMAS = {
  secteurs: {
    title: "Secteur",
    fields: [
      { key: "nom", label: "Nom du secteur", type: "text", required: true },
      { key: "code", label: "Code court (ex. CEN)", type: "text" },
      { key: "commune", label: "Communes couvertes", type: "text" },
      { key: "couleur", label: "Couleur affichée sur la carte", type: "color" },
      { key: "linéaire_km", label: "Linéaire de réseau (km)", type: "number" },
      { key: "volume_m3j", label: "Volume distribué (m³/j)", type: "number" },
      { key: "debit_m3h", label: "Débit moyen (m³/h)", type: "number" },
      { key: "abonnés", label: "Abonnés desservis", type: "number" },
      { key: "pression_bar", label: "Pression moyenne (bar)", type: "number" },
      { key: "rendement_pct", label: "Rendement réseau (%)", type: "number" },
      { key: "fuites_24h", label: "Fuites détectées (24 h)", type: "number" },
      { key: "responsable", label: "Responsable secteur", type: "text" },
      { key: "teleinfo", label: "Télérelève (texte libre)", type: "textarea" },
      { key: "poly", label: "Contour du secteur (lat,lng — un sommet par ligne)", type: "coord" },
    ],
    summary: (s) => `${fmt(s.linéaire_km, 1)} km · ${fmt(s.volume_m3j)} m³/j · rendement ${fmt(s.rendement_pct, 1)} %`,
    blank: () => ({
      nom: "", code: "", commune: "", couleur: "#1d7fd6",
      linéaire_km: 0, volume_m3j: 0, debit_m3h: 0, abonnés: 0, pression_bar: 0,
      rendement_pct: 80, fuites_24h: 0, responsable: "", teleinfo: "",
      poly: [[46.675, 5.545], [46.680, 5.560], [46.668, 5.565], [46.663, 5.548]],
    }),
  },

  reservoirs: {
    title: "Réservoir",
    fields: [
      { key: "nom", label: "Nom", type: "text", required: true },
      { key: "secteur", label: "Secteur de rattachement", type: "select", options: optsSecteurs },
      { key: "commune", label: "Commune", type: "text" },
      { key: "coord", label: "Position sur la carte", type: "point" },
      { key: "capacite_m3", label: "Capacité (m³)", type: "number" },
      { key: "niveau_pct", label: "Niveau actuel (%)", type: "number" },
      { key: "remplissage_m3", label: "Volume stocké (m³)", type: "auto", formula: (it) => round1((it.capacite_m3 || 0) * (it.niveau_pct || 0) / 100) },
      { key: "cote_alt_m", label: "Cote altimétrique (m NGF)", type: "number" },
      { key: "materiau", label: "Matériau", type: "select", options: () => ["Béton enterré", "Béton semi-enterré", "Composite polyester", "Maçonnerie", "Acier inoxydable"].map((v) => [v, v]) },
      { key: "mise_en_service", label: "Mise en service (année)", type: "text" },
      { key: "dernier_entretien", label: "Dernier entretien (jj/mm/aaaa)", type: "text" },
      { key: "prochain_vide_sanitaire", label: "Prochain vide sanitaire", type: "text" },
      { key: "statut", label: "Statut d'exploitation", type: "select", options: () => STATUT_OPTS },
      { key: "notes", label: "Notes / qualité de l'eau", type: "textarea" },
    ],
    summary: (r) => `${fmt(r.capacite_m3)} m³ · niveau ${fmt(r.niveau_pct)} % · ${labelStatut(r.statut)}`,
    blank: () => ({
      nom: "", secteur: firstSecteur(), commune: "", coord: [46.676, 5.552],
      capacite_m3: 500, niveau_pct: 50, remplissage_m3: 250, cote_alt_m: 300,
      mise_en_service: String(new Date().getFullYear()), materiau: "Béton enterré",
      dernier_entretien: "", prochain_vide_sanitaire: "", statut: "ok", notes: "", photo: "",
    }),
  },

  stations: {
    title: "Station",
    fields: [
      { key: "nom", label: "Nom", type: "text", required: true },
      { key: "secteur", label: "Secteur de rattachement", type: "select", options: optsSecteurs },
      { key: "commune", label: "Commune", type: "text" },
      { key: "coord", label: "Position sur la carte", type: "point" },
      { key: "type", label: "Type de station", type: "select", options: () => [["Traitement", "Traitement"], ["Pompage", "Pompage"], ["Surpression", "Surpression"], ["Reprise", "Point de reprise"]] },
      { key: "capacite_m3j", label: "Capacité nominale (m³/j)", type: "number" },
      { key: "debit_prod_m3h", label: "Débit de production (m³/h)", type: "number" },
      { key: "energie_kwh_m3", label: "Énergie spécifique (kWh/m³)", type: "number" },
      { key: "technologie", label: "Procédé / équipement", type: "textarea" },
      { key: "mise_en_service", label: "Mise en service (année)", type: "text" },
      { key: "dernier_entretien", label: "Dernier entretien (jj/mm/aaaa)", type: "text" },
      { key: "mode_exploitation", label: "Mode d'exploitation", type: "text" },
      { key: "effectif", label: "Personnel", type: "text" },
      { key: "statut", label: "Statut d'exploitation", type: "select", options: () => STATUT_OPTS },
    ],
    summary: (s) => `${s.type} · ${fmt(s.capacite_m3j)} m³/j · ${labelStatut(s.statut)}`,
    blank: () => ({
      nom: "", secteur: firstSecteur(), commune: "", coord: [46.676, 5.552],
      type: "Pompage", capacite_m3j: 1000, debit_prod_m3h: 40, energie_kwh_m3: 0.4,
      technologie: "", mise_en_service: String(new Date().getFullYear()),
      dernier_entretien: "", mode_exploitation: "Télé-conduite", effectif: "Télé-conduite",
      statut: "ok", photo: "",
    }),
  },

  compteurs: {
    title: "Compteur de sectorisation",
    fields: [
      { key: "nom", label: "Nom du point de comptage", type: "text", required: true },
      { key: "identifiant", label: "Identifiant télérelève (ex. QMA-1234-CEN)", type: "text" },
      { key: "secteur", label: "Secteur de rattachement", type: "select", options: optsSecteurs },
      { key: "commune", label: "Commune", type: "text" },
      { key: "coord", label: "Position sur la carte", type: "point" },
      { key: "type_compteur", label: "Technologie", type: "select", options: () => ["Magnétique QMA", "Vortex ultrasons", "Ultra-sons", "Mécanique classé"].map((v) => [v, v]) },
      { key: "diametre_mm", label: "Diamètre (DN mm)", type: "number" },
      { key: "index_m3", label: "Index cumulé (m³)", type: "number" },
      { key: "index_precedent_m3", label: "Index précédent (m³)", type: "number" },
      { key: "debit_moyen_m3h", label: "Débit moyen (m³/h)", type: "number" },
      { key: "qmin_nocturne_m3h", label: "QMn — débit minimum nocturne (m³/h)", type: "number", nullable: true },
      { key: "qmax_jour_m3h", label: "Débit de pointe jour (m³/h)", type: "number" },
      { key: "derniere_releve", label: "Dernière relève", type: "text" },
      { key: "frequence_releve", label: "Fréquence de relève", type: "text" },
      { key: "batterie_pct", label: "Batterie télécom (%)", type: "number" },
      { key: "statut", label: "Statut", type: "select", options: () => STATUT_OPTS },
      { key: "alerte", label: "Alerte (laisser vide si aucune)", type: "textarea" },
    ],
    summary: (c) => `${c.identifiant} · QMn ${c.qmin_nocturne_m3h == null ? "—" : fmt(c.qmin_nocturne_m3h, 1) + " m³/h"} · ${labelStatut(c.statut)}`,
    blank: () => ({
      nom: "", identifiant: "", secteur: firstSecteur(), commune: "",
      coord: [46.676, 5.552], type_compteur: "Magnétique QMA", diametre_mm: 80,
      index_m3: 0, index_precedent_m3: 0, debit_moyen_m3h: 0, qmin_nocturne_m3h: 0, qmax_jour_m3h: 0,
      derniere_releve: "", frequence_releve: "1 point / 15 min", batterie_pct: 100, statut: "ok", alerte: "",
    }),
  },
};

/* =========================================================
   Authentification
   ========================================================= */
function showLogin() { $("#login-screen").hidden = false; $("#admin-app").hidden = true; }
function showApp() { $("#login-screen").hidden = true; $("#admin-app").hidden = false; renderTab(currentTab); }

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = AUTH.check($("#login-user").value, $("#login-pass").value);
  $("#login-error").hidden = ok;
  if (ok) { AUTH.loginSession(); showApp(); }
});

$("#btn-logout").addEventListener("click", () => { AUTH.logout(); showLogin(); });

/* =========================================================
   Navigation par onglets
   ========================================================= */
let currentTab = "tableau";

$("#admin-nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b === btn));
  currentTab = btn.dataset.tab;
  renderTab(currentTab);
});

function renderTab(tab) {
  $$(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + tab));
  $("#dirty-note").hidden = !STORE.isDirty();
  if (tab === "tableau") renderDashboard();
  else if (SCHEMAS[tab]) { renderList(tab); closeEditor(tab); }
  else if (tab === "parametres") $("#cur-user").textContent = AUTH.user();
}

/* =========================================================
   Tableau de bord admin
   ========================================================= */
function renderDashboard() {
  const d = STORE.data;
  const totLen = d.secteurs.reduce((a, s) => a + (Number(s.linéaire_km) || 0), 0);
  const totVol = d.secteurs.reduce((a, s) => a + (Number(s.volume_m3j) || 0), 0);
  const totAbo = d.secteurs.reduce((a, s) => a + (Number(s.abonnés) || 0), 0);
  const totRes = d.reservoirs.reduce((a, r) => a + (Number(r.capacite_m3) || 0), 0);
  const all = [...d.reservoirs, ...d.stations, ...d.compteurs];
  const anomalies = all.filter((x) => x.statut === "bad").length;
  const surveillance = all.filter((x) => x.statut === "warn").length;

  $("#adm-kpis").innerHTML = [
    ["🎨", "Secteurs", d.secteurs.length, ""],
    ["🛢", "Réservoirs", d.reservoirs.length, fmt(totRes) + " m³ stockables"],
    ["⚙", "Stations", d.stations.length, ""],
    ["◉", "Compteurs FDI", d.compteurs.length, ""],
    ["📏", "Linéaire total", fmt(totLen, 1) + " km", ""],
    ["💧", "Volume / jour", fmt(totVol) + " m³", fmt(totAbo) + " abonnés"],
    ["🔴", "Anomalies", anomalies, ""],
    ["🟠", "À surveiller", surveillance, ""],
  ].map(([ic, lbl, val, sub]) => `
    <div class="adm-kpi"><span class="adm-kpi-ic">${ic}</span>
      <span class="adm-kpi-val">${val}</span><span class="adm-kpi-lbl">${lbl}</span>
      ${sub ? `<span class="adm-kpi-sub">${sub}</span>` : ""}</div>`).join("");

  // Alertes consolidées
  const alerts = [];
  d.reservoirs.filter((r) => r.statut !== "ok").forEach((r) =>
    alerts.push({ cls: r.statut, txt: `Réservoir « ${esc(r.nom)} » — ${esc(r.notes || labelStatut(r.statut))}` }));
  d.compteurs.filter((c) => c.statut !== "ok").forEach((c) =>
    alerts.push({ cls: c.statut, txt: `Compteur ${esc(c.identifiant || c.nom)} — ${esc(c.alerte || labelStatut(c.statut))}` }));
  d.stations.filter((s) => s.statut !== "ok").forEach((s) =>
    alerts.push({ cls: s.statut, txt: `Station « ${esc(s.nom)} » — ${labelStatut(s.statut)}` }));
  d.secteurs.filter((s) => Number(s.fuites_24h) > 0).forEach((s) =>
    alerts.push({ cls: "warn", txt: `${esc(s.nom)} : ${s.fuites_24h} fuite(s) détectée(s) ces dernières 24 h` }));

  $("#adm-alerts").innerHTML = alerts.length
    ? alerts.map((a) => `<li class="al-${a.cls}">${a.txt}</li>`).join("")
    : '<li class="al-ok">Aucune alerte — réseau conforme ✔</li>';

  // Suivi maintenance
  const maint = [
    ...d.reservoirs.map((r) => ({ nom: r.nom, date: r.dernier_entretien, type: "Réservoir" })),
    ...d.stations.map((s) => ({ nom: s.nom, date: s.dernier_entretien, type: "Station" })),
  ].filter((m) => m.date);
  $("#adm-maintenance").innerHTML = maint.length
    ? maint.map((m) => `<li><strong>${esc(m.nom)}</strong><span>${m.type} · entretien : ${esc(m.date)}</span></li>`).join("")
    : '<li class="al-ok">Aucune intervention renseignée.</li>';
}

/* =========================================================
   Listes d'éléments + éditeur formulaire
   ========================================================= */
document.querySelectorAll("[data-add]").forEach((btn) =>
  btn.addEventListener("click", () => openEditor(btn.dataset.add, null)));

function renderList(kind) {
  const wrap = $("#list-" + kind);
  wrap.innerHTML = "";
  STORE.list(kind).forEach((item) => {
    const card = document.createElement("button");
    card.className = "item-card";
    const colorDot = item.couleur ? `<i class="dot-color" style="background:${esc(item.couleur)}"></i>` : "";
    card.innerHTML = `
      <span class="item-id">${esc(item.id)}</span>
      <span class="item-nom">${colorDot}${esc(item.nom)}</span>
      <span class="item-meta">${SCHEMAS[kind].summary(item)}</span>`;
    card.addEventListener("click", () => openEditor(kind, item.id));
    wrap.appendChild(card);
  });
}

function closeEditor(kind) {
  const ed = $("#editor-" + kind);
  ed.hidden = true; ed.innerHTML = "";
}

function openEditor(kind, id) {
  const schema = SCHEMAS[kind];
  const isNew = id == null;
  const item = isNew ? schema.blank() : JSON.parse(JSON.stringify(STORE.get(kind, id)));
  const ed = $("#editor-" + kind);

  ed.innerHTML = `
    <div class="editor-head">
      <h3>${isNew ? "➕ Nouveau " + schema.title.toLowerCase() : "✏️ Modifier " + schema.title.toLowerCase()}${isNew ? "" : ` <code>${esc(item.id)}</code>`}</h3>
      <div class="editor-actions">
        ${isNew ? "" : '<button class="btn-danger" data-del>🗑 Supprimer</button>'}
        <button class="btn-secondary" data-cancel>Fermer</button>
      </div>
    </div>
    ${isNew ? '<p class="editor-tip">Renseignez au moins le <strong>nom</strong> : l\'élément sera créé puis chaque champ modifié sera enregistré automatiquement.</p>' : ""}
    <form class="editor-grid" novalidate></form>`;

  const form = ed.querySelector("form");

  /* Enregistrement : création à la première saisie valide, sinon mise à jour du champ */
  const persist = (fieldKey, value) => {
    if (isNew && !item.id) {
      if (fieldKey !== "nom" || !String(value).trim()) return; // attend un nom
      item.id = STORE.create(kind, JSON.parse(JSON.stringify(item)));
      toast(`${schema.title} « ${item.nom} » ajouté ✅`);
      renderList(kind);
    } else if (item.id) {
      STORE.update(kind, item.id, fieldKey, value);
      toast(`${schema.title} « ${item.nom || item.id} » — champ enregistré ✅`);
      renderList(kind);
    }
  };

  schema.fields.forEach((f) => form.appendChild(buildField(f, item, schema, persist)));

  ed.hidden = false;
  ed.scrollIntoView({ behavior: "smooth", block: "start" });

  ed.querySelector("[data-cancel]").addEventListener("click", () => closeEditor(kind));
  const del = ed.querySelector("[data-del]");
  if (del) del.addEventListener("click", () => {
    if (confirm(`Supprimer définitivement « ${item.nom || item.id} » ?`)) {
      STORE.remove(kind, item.id);
      closeEditor(kind);
      renderList(kind);
      toast("Élément supprimé 🗑");
    }
  });
}

/* ---- Construit un champ de formulaire selon son type ---- */
function buildField(f, item, schema, persist) {
  const wrap = document.createElement("div");
  wrap.className = "fld fld-" + f.type;
  wrap.dataset.key = f.key;
  const val = item[f.key];

  const labelEl = document.createElement("span");
  labelEl.className = "fld-label";
  labelEl.innerHTML = `${f.label}${f.required ? ' <em class="req">*</em>' : ""}`;
  wrap.appendChild(labelEl);

  /* recalculs automatiques (ex. volume stocké = capacité × niveau) */
  const recalcAuto = () => {
    schema.fields.forEach((g) => {
      if (g.type === "auto" && g.formula) {
        item[g.key] = g.formula(item);
        const out = wrap.parentElement.querySelector(`[data-key="${g.key}"] .auto-val`);
        if (out) out.textContent = fmt(item[g.key]);
      }
    });
  };

  const commit = (v) => {
    item[f.key] = v;
    recalcAuto();
    if (f.required && (v === "" || v == null)) { wrap.classList.add("invalid"); return; }
    wrap.classList.remove("invalid");
    persist(f.key, v);
  };

  if (f.type === "auto") {
    const out = document.createElement("output");
    out.className = "auto-val";
    out.textContent = fmt(val);
    const hint = document.createElement("span");
    hint.className = "fld-hint";
    hint.textContent = "calculé automatiquement";
    wrap.appendChild(out);
    wrap.appendChild(hint);
    return wrap;
  }

  let input;
  if (f.type === "textarea" || f.type === "coord") {
    input = document.createElement("textarea");
    input.rows = f.type === "coord" ? 6 : 3;
    if (f.type === "coord") {
      input.value = (val || []).map((p) => p.join(",")).join("\n");
      input.placeholder = "46.6845,5.5405\n46.6872,5.5560\n…";
      input.addEventListener("change", () => {
        const pts = input.value.split("\n")
          .map((l) => l.split(",").map((x) => parseFloat(x.trim())))
          .filter((p) => p.length === 2 && p.every((n) => !Number.isNaN(n)));
        if (pts.length >= 3) commit(pts);
        else { wrap.classList.add("invalid"); toast("⚠ Il faut au moins 3 sommets valides « lat,lng »"); }
      });
    } else {
      input.value = val ?? "";
      input.addEventListener("change", () => commit(input.value.trim()));
    }
  } else if (f.type === "select") {
    input = document.createElement("select");
    (typeof f.options === "function" ? f.options() : f.options).forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l;
      if (String(v) === String(val ?? "")) o.selected = true;
      input.appendChild(o);
    });
    input.addEventListener("change", () => commit(input.value));
  } else if (f.type === "color") {
    wrap.classList.add("fld-split");
    input = document.createElement("input");
    input.type = "color";
    input.value = /^#[0-9a-f]{6}$/i.test(val || "") ? val : "#1d7fd6";
    const hex = document.createElement("input");
    hex.type = "text";
    hex.value = val || "#1d7fd6";
    hex.spellcheck = false;
    input.addEventListener("input", () => { hex.value = input.value; commit(input.value); });
    hex.addEventListener("change", () => {
      if (/^#[0-9a-f]{6}$/i.test(hex.value.trim())) { input.value = hex.value.trim(); commit(hex.value.trim()); }
      else { wrap.classList.add("invalid"); toast("⚠ Code couleur invalide (format #rrggbb)"); }
    });
    wrap.appendChild(input);
    wrap.appendChild(hex);
    return wrap;
  } else if (f.type === "number") {
    input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = val ?? "";
    input.addEventListener("change", () => {
      let v = input.value === "" ? null : Number(input.value);
      if (v != null && Number.isNaN(v)) v = null;
      if (v == null && !f.nullable) { wrap.classList.add("invalid"); return; }
      commit(v);
    });
  } else if (f.type === "point") {
    // position [lat, lng] → deux champs côte à côte
    wrap.classList.add("fld-split");
    const mkSub = (subLabel, idx, cur) => {
      const w = document.createElement("label");
      w.className = "subfld";
      const s = document.createElement("span");
      s.textContent = subLabel;
      const i = document.createElement("input");
      i.type = "number"; i.step = "0.0001"; i.value = cur;
      i.addEventListener("change", () => {
        const arr = [...(item[f.key] || [0, 0])];
        arr[idx] = Number(i.value) || 0;
        commit(arr);
      });
      w.appendChild(s); w.appendChild(i);
      return w;
    };
    wrap.appendChild(mkSub("Latitude", 0, (val || [0, 0])[0]));
    wrap.appendChild(mkSub("Longitude", 1, (val || [0, 0])[1]));
    return wrap;
  } else { // text
    input = document.createElement("input");
    input.type = "text";
    input.value = val ?? "";
    input.addEventListener("change", () => commit(input.value.trim()));
  }

  wrap.appendChild(input);
  return wrap;
}

/* =========================================================
   Paramètres : mot de passe, export/import, reset
   ========================================================= */
$("#btn-change-pass").addEventListener("click", () => {
  const p1 = $("#new-pass").value, p2 = $("#new-pass2").value;
  const msg = $("#pass-msg");
  msg.hidden = false;
  if (p1.length < 4) { msg.className = "inline-msg err"; msg.textContent = "Mot de passe trop court (4 caractères minimum)."; return; }
  if (p1 !== p2) { msg.className = "inline-msg err"; msg.textContent = "La confirmation ne correspond pas."; return; }
  AUTH.setPassword(p1);
  msg.className = "inline-msg ok"; msg.textContent = "✅ Mot de passe mis à jour. Reconnectez-vous avec le nouveau mot de passe.";
  $("#new-pass").value = ""; $("#new-pass2").value = "";
});

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([STORE.exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cartoeau-reseau.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Export JSON téléchargé 💾");
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const msg = $("#io-msg");
  if (!file) return;
  try {
    STORE.importJSON(await file.text());
    msg.hidden = false; msg.className = "inline-msg ok";
    msg.textContent = "✅ Données importées avec succès.";
    renderTab(currentTab);
  } catch (err) {
    msg.hidden = false; msg.className = "inline-msg err";
    msg.textContent = "⚠ Fichier invalide : " + err.message;
  }
  e.target.value = "";
});

$("#btn-reset").addEventListener("click", () => {
  if (confirm("Réinitialiser TOUTES les données au jeu fictif d'origine ?\nVos modifications locales seront perdues.")) {
    STORE.resetAll();
    renderTab(currentTab);
    toast("Données réinitialisées ♻");
  }
});

/* =========================================================
   Démarrage
   ========================================================= */
AUTH.isLoggedIn() ? showApp() : showLogin();
