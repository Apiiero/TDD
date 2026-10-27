/* =========================================================
   Carto'Eau — Application cartographique du réseau d'eau potable
   ECLA Lons Agglo — données fictives de démonstration
   Les données proviennent de STORE (js/store.js) : elles incluent
   d'éventuelles modifications réalisées via l'interface d'administration.
   ========================================================= */
"use strict";

/* ---------------- Utilitaires ---------------- */
const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 0) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

const STATUT_LABEL = { ok: ["Conforme", "st-ok"], warn: ["À surveiller", "st-warn"], bad: ["Anomalie", "st-bad"] };
const secteurById = (id) => STORE.data.secteurs.find((s) => s.id === id);

/* ---------------- Initialisation de la carte ---------------- */
const map = L.map("map", { zoomControl: true, minZoom: 11, maxZoom: 19 }).setView(STORE.data.center, STORE.data.zoom);

// Fond de plan OpenStreetMap classique (aucune clé API requise)
const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// Calques regroupés par type (pour les filtres)
const layers = {
  secteur:    L.layerGroup().addTo(map),
  canalis:    L.layerGroup().addTo(map),
  reservoir:  L.layerGroup().addTo(map),
  station:    L.layerGroup().addTo(map),
  compteur:   L.layerGroup().addTo(map),
};

let registry = []; // index pour la recherche {type, nom, obj}

/* ---------------- Aides popup ---------------- */
function row(k, v) { return `<tr><td>${k}</td><td>${v}</td></tr>`; }
function statutPill(st) {
  const [lbl, cls] = STATUT_LABEL[st] || ["—", "st-ok"];
  return `<span class="status-pill ${cls}">${lbl}</span>`;
}
function gauge(pct) {
  return `<div class="gauge"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}
function foot(id, secteurId) {
  const s = secteurById(secteurId);
  return `<div class="popup-foot">${id}${s ? " · " + s.nom : ""}</div>`;
}

/* ---------------- Rendu des couches (ré-exécuté à chaque modif admin) ---------------- */
function renderAll() {
  Object.values(layers).forEach((g) => g.clearLayers());
  registry = [];

  /* ---- Secteurs (polygones) ---- */
  STORE.data.secteurs.forEach((sec) => {
    const poly = L.polygon(sec.poly, {
      color: sec.couleur, weight: 2.5, fillColor: sec.couleur, fillOpacity: 0.16, opacity: 0.9,
    });

    poly.on("mouseover", () => {
      poly.setStyle({ fillOpacity: 0.34, weight: 4 });
      setStatus(`Secteur : ${sec.nom} — ${sec.linéaire_km} km · ${fmt(sec.volume_m3j)} m³/j`);
    });
    poly.on("mouseout", () => poly.setStyle({ fillOpacity: 0.16, weight: 2.5 }));

    const rendementCls = sec.rendement_pct >= 85 ? "st-ok" : sec.rendement_pct >= 80 ? "st-warn" : "st-bad";
    poly.bindPopup(`<div class="popup">
        <div class="popup-head"><span class="popup-badge">Secteur ${sec.code}</span></div>
        <h3>${sec.nom}</h3>
        <div class="pop-commune">${sec.commune}</div>
        <table>
          ${row("Identifiant", sec.id)}
          ${row("Linéaire réseau", fmt(sec.linéaire_km, 1) + " km")}
          ${row("Volume distribué", fmt(sec.volume_m3j) + " m³/j")}
          ${row("Débit moyen", fmt(sec.debit_m3h) + " m³/h")}
          ${row("Abonnés desservis", fmt(sec.abonnés))}
          ${row("Pression moyenne", fmt(sec.pression_bar, 1) + " bar")}
          ${row("Rendement réseau", `<span class="status-pill ${rendementCls}">${fmt(sec.rendement_pct, 1)} %</span>`)}
          ${row("Fuites détectées (24 h)", sec.fuites_24h + " alerte(s)")}
          ${row("Responsable secteur", sec.responsable)}
          ${row("Télérelève", sec.teleinfo)}
        </table>
        ${foot(sec.id)}
      </div>`, { maxWidth: 340 });

    poly.addTo(layers.secteur);
    registry.push({ type: "Secteur", nom: sec.nom, obj: poly });
  });

  /* ---- Canalisations ---- */
  STORE.data.canalisations.forEach((c) => {
    const line = L.polyline([c.a, c.b], c.type === "principale"
      ? { color: "#1d7fd6", weight: 3.5, opacity: 0.85 }
      : { color: "#6aa9dd", weight: 2.5, opacity: 0.8, dashArray: "7 6" });

    line.bindTooltip(`${c.libelle} — ${c.dn}`, { sticky: true });
    line.on("mouseover", () => setStatus(`Canalisation : ${c.libelle} (${c.dn})`));
    line.addTo(layers.canalis);
  });

  /* ---- Réservoirs ---- */
  STORE.data.reservoirs.forEach((r) => {
    const sec = secteurById(r.secteur);
    const m = L.marker(r.coord, { icon: makeIcon("mk-reservoir", "🛢", r.statut === "bad") });

    m.bindPopup(`<div class="popup">
        <div class="popup-head"><span class="popup-badge res">Réservoir</span>${statutPill(r.statut)}</div>
        <h3>${r.nom}</h3>
        <div class="pop-commune">${r.commune}</div>
        <img class="popup-img" src="${fakePhotoSVG("reservoir", r.nom)}" alt="Illustration ${r.nom}" />
        <table>
          ${row("Capacité", fmt(r.capacite_m3) + " m³")}
          ${row("Niveau actuel", `<div>${fmt(r.niveau_pct)} % · ${fmt(r.remplissage_m3)} m³${gauge(r.niveau_pct)}</div>`)}
          ${row("Cote altimétrique", fmt(r.cote_alt_m) + " m NGF")}
          ${row("Matériau", r.materiau)}
          ${row("Mise en service", r.mise_en_service)}
          ${row("Dernier entretien", r.dernier_entretien)}
          ${row("Prochain vide sanitaire", r.prochain_vide_sanitaire)}
          ${row("Qualité de l'eau", r.notes)}
        </table>
        ${foot(r.id, r.secteur)}
      </div>`, { maxWidth: 360 });

    m.on("mouseover", () => setStatus(`Réservoir : ${r.nom} — niveau ${r.niveau_pct} %`));
    if (sec) m.on("click", () => highlightSectorChip(sec.id));
    m.addTo(layers.reservoir);
    registry.push({ type: "Réservoir", nom: r.nom, obj: m });
  });

  /* ---- Stations ---- */
  STORE.data.stations.forEach((s) => {
    const m = L.marker(s.coord, { icon: makeIcon("mk-station", "⚙", s.statut === "warn") });

    m.bindPopup(`<div class="popup">
        <div class="popup-head"><span class="popup-badge sta">Station ${s.type.toLowerCase()}</span>${statutPill(s.statut)}</div>
        <h3>${s.nom}</h3>
        <div class="pop-commune">${s.commune}</div>
        <img class="popup-img" src="${fakePhotoSVG("station", s.nom)}" alt="Illustration ${s.nom}" />
        <table>
          ${row("Type d'ouvrage", s.type)}
          ${row("Capacité nominale", fmt(s.capacite_m3j) + " m³/j")}
          ${row("Débit de production", fmt(s.debit_prod_m3h) + " m³/h")}
          ${row("Énergie spécifique", fmt(s.energie_kwh_m3, 2) + " kWh/m³")}
          ${row("Procédé / équipement", s.technologie)}
          ${row("Mise en service", s.mise_en_service)}
          ${row("Dernier entretien", s.dernier_entretien)}
          ${row("Mode d'exploitation", s.mode_exploitation)}
          ${row("Personnel", s.effectif)}
        </table>
        ${foot(s.id, s.secteur)}
      </div>`, { maxWidth: 360 });

    m.on("mouseover", () => setStatus(`Station : ${s.nom} (${s.type})`));
    m.addTo(layers.station);
    registry.push({ type: "Station", nom: s.nom, obj: m });
  });

  /* ---- Compteurs de sectorisation ---- */
  STORE.data.compteurs.forEach((c) => {
    const sec = secteurById(c.secteur);
    const m = L.marker(c.coord, { icon: makeIcon("mk-compteur", "◉", c.statut !== "ok") });

    const delta = c.index_m3 - c.index_precedent_m3;
    const qmn = c.qmin_nocturne_m3h == null ? "Non pertinent (transfert)" : fmt(c.qmin_nocturne_m3h, 1) + " m³/h";
    const alerteHtml = c.alerte
      ? `<tr><td colspan="2" style="color:var(--bad);text-align:left;padding-top:8px">⚠ ${c.alerte}</td></tr>` : "";

    m.bindPopup(`<div class="popup">
        <div class="popup-head"><span class="popup-badge cpt">Compteur sectorisation</span>${statutPill(c.statut)}</div>
        <h3>${c.nom}</h3>
        <div class="pop-commune">${c.commune}${sec ? " — " + sec.nom : ""}</div>
        <table>
          ${row("Identifiant", `<code>${c.identifiant}</code>`)}
          ${row("Type", c.type_compteur)}
          ${row("Diamètre", "DN " + c.diametre_mm)}
          ${row("Index cumulé", `<div>${fmt(c.index_m3)} m³<div style="font-weight:400;color:var(--muted);font-size:.72rem">précédent : ${fmt(c.index_precedent_m3)} m³ (+${fmt(delta)} m³)</div></div>`)}
          ${row("Débit moyen", fmt(c.debit_moyen_m3h) + " m³/h")}
          ${row("QMn (débit nocturne)", qmn)}
          ${row("Débit de pointe jour", fmt(c.qmax_jour_m3h) + " m³/h")}
          ${row("Dernière relève", c.derniere_releve)}
          ${row("Fréquence", c.frequence_releve)}
          ${row("Batterie télécom", `${fmt(c.batterie_pct)} %${gauge(c.batterie_pct)}`)}
          ${alerteHtml}
        </table>
        ${foot(c.id, c.secteur)}
      </div>`, { maxWidth: 360 });

    m.on("mouseover", () => setStatus(`Compteur : ${c.identifiant} — QMn ${qmn}`));
    m.addTo(layers.compteur);
    registry.push({ type: "Compteur", nom: c.nom + " (" + c.identifiant + ")", obj: m });
  });

  buildDashboard();
  applyLayerFilters();
}

/* ---------------- Bandeau de statut ---------------- */
const statusEl = $("#status-hover");
const defaultStatus = "Survolez un élément… cliquez pour ouvrir sa fiche.";
statusEl.textContent = defaultStatus;
function setStatus(t) { statusEl.textContent = t; }
map.on("mousemove", (e) => {
  $("#coords").textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
});
map.on("mouseout", () => setStatus(defaultStatus));

/* ---------------- Marqueurs génériques ---------------- */
function makeIcon(cls, glyph, pulse) {
  return L.divIcon({
    className: "", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
    html: `<div class="mk ${cls}${pulse ? " mk-pulse" : ""}">${glyph}</div>`,
  });
}

/* ---------------- Tableau de bord latéral ---------------- */
function buildDashboard() {
  const totLen = STORE.data.secteurs.reduce((a, s) => a + s.linéaire_km, 0);
  const totVol = STORE.data.secteurs.reduce((a, s) => a + s.volume_m3j, 0);
  const totAbo = STORE.data.secteurs.reduce((a, s) => a + s.abonnés, 0);
  const totRes = STORE.data.reservoirs.reduce((a, r) => a + r.capacite_m3, 0);

  $("#kpi-len").textContent = fmt(totLen, 1) + " km";
  $("#kpi-vol").textContent = fmt(totVol) + " m³";
  $("#kpi-abo").textContent = fmt(totAbo);
  $("#kpi-res").textContent = fmt(totRes / 1000, 1) + "k m³";

  const ul = $("#sector-list");
  ul.innerHTML = "";
  STORE.data.secteurs.forEach((s) => {
    const li = document.createElement("li");
    li.className = "sector-item";
    li.dataset.sector = s.id;
    li.innerHTML = `
      <span class="sector-chip" style="background:${s.couleur}"></span>
      <span class="sector-name">${s.nom}</span>
      <span class="sector-meta">${fmt(s.volume_m3j)} m³/j · ${Number(s.rendement_pct).toFixed(0)} %</span>`;
    li.addEventListener("click", () => {
      const layer = registry.find((r) => r.nom === s.nom);
      if (layer) {
        map.fitBounds(layer.obj.getBounds ? layer.obj.getBounds() : layer.obj.getLatLng(), { padding: [40, 40] });
        layer.obj.openPopup();
      }
      highlightSectorChip(s.id);
    });
    ul.appendChild(li);
  });
}
function highlightSectorChip(id) {
  document.querySelectorAll(".sector-item").forEach((el) =>
    el.classList.toggle("active", el.dataset.sector === id));
}

/* ---------------- Filtres ---------------- */
function applyLayerFilters() {
  ["secteur", "canalis", "reservoir", "station", "compteur"].forEach((k) => {
    const cb = $("#flt-" + k);
    cb.checked ? map.addLayer(layers[k]) : map.removeLayer(layers[k]);
  });
}
["secteur", "canalis", "reservoir", "station", "compteur"].forEach((k) => {
  $("#flt-" + k).addEventListener("change", applyLayerFilters);
});

/* ---------------- Recherche ---------------- */
const searchInput = $("#search-input");
const searchSelect = $("#search-select");
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  searchSelect.innerHTML = "";
  if (q.length < 2) { searchSelect.hidden = true; return; }
  const hits = registry.filter((r) => r.nom.toLowerCase().includes(q)).slice(0, 12);
  hits.forEach((h, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = `[${h.type}] ${h.nom}`;
    o.dataset.ref = registry.indexOf(h);
    searchSelect.appendChild(o);
  });
  searchSelect.hidden = hits.length === 0;
  if (!hits.length) {
    const o = document.createElement("option");
    o.disabled = true; o.textContent = "Aucun résultat";
    searchSelect.appendChild(o); searchSelect.hidden = false;
  }
});
searchSelect.addEventListener("change", () => {
  const opt = searchSelect.selectedOptions[0];
  if (!opt || opt.dataset.ref == null) return; // option "Aucun résultat" (disabled)
  const h = registry[+opt.dataset.ref];
  if (!h) return;
  const b = h.obj.getBounds ? h.obj.getBounds() : L.latLngBounds(h.obj.getLatLng(), h.obj.getLatLng());
  map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
  // La popup ne peut s'ouvrir que si le calque de l'objet est visible sur la carte
  if (!map.hasLayer(h.obj)) map.addLayer(h.obj);
  setTimeout(() => h.obj.openPopup(), 350);
  searchSelect.hidden = true; searchInput.value = "";
});

/* ---------------- En-tête : actions ---------------- */
$("#btn-about").addEventListener("click", () => ($("#modal-about").hidden = false));
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => ($("#modal-about").hidden = true)));
$("#modal-about").addEventListener("click", (e) => { if (e.target.id === "modal-about") $("#modal-about").hidden = true; });

$("#btn-print").addEventListener("click", () => window.print());
$("#btn-fullscreen").addEventListener("click", () => {
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

/* ---------------- Panneau mobile ---------------- */
$("#panel-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

/* Cacher le panneau mobile quand on clique la carte */
map.on("click", () => $("#sidebar").classList.remove("open"));

/* ---------------- Rendu initial + réactivité aux modifications admin ---------------- */
renderAll();
STORE.subscribe(() => renderAll());

// Si l'admin a modifié les données dans un autre onglet, rafraîchir aussi
window.addEventListener("storage", (e) => { if (e.key === "cartoeau_overrides_v1") location.reload(); });
