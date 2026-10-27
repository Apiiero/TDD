/* =========================================================
   defauts-page.js — Page « Défauts & anomalies »
   - Liste filtrable de tous les défauts (détection auto + signalements)
   - Acquêtement avec workflow et traçabilité par défaut
   - Historique global des évènements (journal)
   Accès réservé (session admin — mêmes identifiants que l'interface d'admin)
   ========================================================= */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 2600);
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const gravLabel = (g) => (DEFAUTS.GRAVITES.find((x) => x[0] === g) || [g, g])[1];
const gravColor = (g) => (DEFAUTS.GRAVITES.find((x) => x[0] === g) || [, , "#95a5a6"])[2];
const typeLabel = (t) => (DEFAUTS.TYPES_DEFAUT.find((x) => x[0] === t) || [t, t])[1];

/* =========================================================
   Authentification (partagée avec l'admin)
   ========================================================= */
function showLogin() { $("#login-screen").hidden = false; $("#app").hidden = true; }
function showApp() { $("#login-screen").hidden = true; $("#app").hidden = false; refreshAll(); }

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = AUTH.check($("#login-user").value, $("#login-pass").value);
  $("#login-error").hidden = ok;
  if (ok) { AUTH.loginSession(); showApp(); }
});
$("#btn-logout").addEventListener("click", () => { AUTH.logout(); showLogin(); });

/* =========================================================
   Filtres
   ========================================================= */
const filtres = { q: "", statut: "", gravite: "", type: "", source: "" };

function defautsFiltres() {
  const q = filtres.q.trim().toLowerCase();
  return DEFAUTS.lister().filter((d) => {
    if (filtres.statut === "actifs" && (d.statut === "resolu" || d.statut === "sanssuite")) return false;
    if (["ouvert", "encours", "resolu", "sanssuite"].includes(filtres.statut) && d.statut !== filtres.statut) return false;
    if (filtres.gravite && d.gravite !== filtres.gravite) return false;
    if (filtres.type && d.type !== filtres.type) return false;
    if (filtres.source && d.source !== filtres.source) return false;
    if (q) {
      const hay = `${d.ref} ${d.titre} ${d.elementNom} ${d.elementId} ${d.commune} ${d.secteur} ${d.description} ${d.responsable}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

["f-q", "f-statut", "f-gravite", "f-type", "f-source"].forEach((id) => {
  $("#" + id).addEventListener("input", () => {
    filtres[id.split("-")[1]] = $("#" + id).value;
    renderListe();
  });
});
$("#btn-clear-filters").addEventListener("click", () => {
  Object.keys(filtres).forEach((k) => (filtres[k] = ""));
  ["f-q", "f-statut", "f-gravite", "f-type", "f-source"].forEach((id) => ($("#" + id).value = ""));
  renderListe();
});

/* =========================================================
   KPI de synthèse
   ========================================================= */
function renderKpis() {
  const s = DEFAUTS.stats();
  const taux = s.total ? Math.round(((s.resolu + s.sanssuite) / s.total) * 100) : 0;
  $("#def-kpis").innerHTML = [
    ["🔍", s.total, "Défauts au registre"],
    ["🔴", s.ouvert, "Ouverts"],
    ["🟠", s.encours, "En cours"],
    ["🟢", s.resolu, "Acquittés (résolus)"],
    ["⚪", s.sanssuite, "Sans suite"],
    ["🚨", s.critique, "Critiques actifs"],
    ["📈", taux + " %", "Taux de traitement"],
    ["🕘", DEFAUTS.journal.length, "Évènements historisés"],
  ].map(([ic, v, l]) => `
    <div class="def-kpi"><span class="def-kpi-ic">${ic}</span>
      <span class="def-kpi-val">${v}</span><span class="def-kpi-lbl">${l}</span></div>`).join("");
}

/* =========================================================
   Liste des défauts
   ========================================================= */
function badge(d) {
  const st = DEFAUTS.STATUTS[d.statut];
  return `<span class="def-badge ${st.cls}">${st.ic} ${st.label}</span>`;
}
function sourceTag(d) {
  return d.source === "auto"
    ? '<span class="src-tag src-auto" title="Généré par analyse automatique des données réseau">⚙ auto</span>'
    : '<span class="src-tag src-man" title="Saisi manuellement via le formulaire de signalement">✎ manuel</span>';
}

function renderListe() {
  const items = defautsFiltres();
  $("#liste-titre").textContent = `Registre des défauts & anomalies (${items.length})`;
  const wrap = $("#def-liste");
  wrap.innerHTML = items.map((d) => `
    <article class="def-card ${d.statut === "resolu" || d.statut === "sanssuite" ? "is-closed" : ""}" data-ref="${esc(d.ref)}" tabindex="0" role="button" aria-label="Ouvrir la fiche du défaut ${esc(d.ref)}">
      <header class="def-head">
        <span class="def-gv" style="--gv:${gravColor(d.gravite)}">${gravLabel(d.gravite)}</span>
        <span class="def-ref">${esc(d.ref)}</span>
        ${badge(d)}
        ${sourceTag(d)}
        <span class="def-open-btn">Ouvrir &amp; acquitter →</span>
      </header>
      <h4 class="def-titre">${esc(d.titre)}</h4>
      <p class="def-desc">${esc(d.description)}</p>
      <footer class="def-meta">
        <span>🏷 ${esc(typeLabel(d.type))}</span>
        <span>🗂 ${esc(d.categorie)}</span>
        ${d.elementNom ? `<span>📍 ${esc(d.elementNom)}${d.elementId ? ` (${esc(d.elementId)})` : ""}</span>` : ""}
        ${d.commune ? `<span>🏘 ${esc(d.commune)}</span>` : ""}
        ${d.secteur ? `<span>🎨 ${esc(d.secteur)}</span>` : ""}
        <span>🕒 Détecté le ${esc(d.date_detection)}</span>
        ${d.responsable ? `<span>👤 ${esc(d.responsable)}</span>` : ""}
        ${d.acquitte_le ? `<span>✅ Acquittée le ${esc(d.acquitte_le)}</span>` : ""}
      </footer>
    </article>`).join("");
  $("#aucun").hidden = items.length > 0;

  $$(".def-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.ref));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter") openDetail(card.dataset.ref); });
  });
}

/* =========================================================
   Fiche détail + acquêtement
   ========================================================= */
let currentRef = null;

function openDetail(ref) {
  const d = DEFAUTS.lister().find((x) => x.ref === ref);
  if (!d) return;
  currentRef = ref;
  $("#view-liste").hidden = true;
  $("#view-detail").hidden = false;
  $("#detail-ref").innerHTML = `${esc(d.ref)} — ${esc(d.titre)}`;

  const isClosed = d.statut === "resolu" || d.statut === "sanssuite";

  $("#detail-body").innerHTML = `
    <div class="det-grid">
      <!-- ---- Colonne gauche : fiche ---- -->
      <div class="adm-card det-fiche">
        <h3>📋 Fiche du défaut</h3>
        <dl class="det-dl">
          <dt>Référence</dt><dd>${esc(d.ref)} ${sourceTag(d)}</dd>
          <dt>Gravité</dt><dd><span class="def-gv sm" style="--gv:${gravColor(d.gravite)}">${gravLabel(d.gravite)}</span></dd>
          <dt>Type</dt><dd>${esc(typeLabel(d.type))}</dd>
          <dt>Catégorie</dt><dd>${esc(d.categorie)}</dd>
          <dt>Ouvrage concerné</dt><dd>${esc(d.elementNom || "—")}${d.elementId ? ` <code>${esc(d.elementId)}</code>` : ""}</dd>
          <dt>Secteur</dt><dd>${esc(d.secteur || "—")}</dd>
          <dt>Commune</dt><dd>${esc(d.commune || "—")}</dd>
          <dt>Détecté / signalé le</dt><dd>${esc(d.date_detection)}</dd>
          ${d.acquitte_le ? `<dt>Acquittée le</dt><dd>${esc(d.acquitte_le)}</dd>` : ""}
          <dt>Statut</dt><dd>${badge(d)}</dd>
        </dl>
        <h4>Constat</h4>
        <p class="det-desc">${esc(d.description || "—")}</p>
        ${d.coord ? `<h4>Localisation</h4>
          <a class="btn-secondary btn-map" href="index.html?lat=${d.coord[0]}&lng=${d.coord[1]}&zoom=17" target="_blank" rel="noopener">🗺 Voir sur la carte</a>` : ""}
      </div>

      <!-- ---- Colonne droite : acquêtement ---- -->
      <div class="adm-card det-acquit ${isClosed ? "closed" : ""}">
        <h3>${isClosed ? "✅ Défaut acquittée" : "🛠 Acquêtement du défaut"}</h3>
        ${isClosed
          ? `<p class="muted">Cette intervention est close (${DEFAUTS.STATUTS[d.statut].label}).
             Vous pouvez la réouvrir si nécessaire.</p>
             <button id="btn-reopen" class="btn-secondary">↩ Réouvrir le défaut</button>`
          : `
          <div class="wf-steps">
            ${["ouvert", "encours", "resolu"].map((st) => `
              <span class="wf-step ${st === d.statut ? "active" : ""}">${DEFAUTS.STATUTS[st].ic} ${DEFAUTS.STATUTS[st].label}</span>`).join('<span class="wf-arrow">→</span>')}
          </div>
          <form id="form-acquit" novalidate>
            <label class="field"><span>Action réalisée</span>
              <select name="nouveau">
                <option value="encours">🟠 Passer en « En cours » (prise en charge)</option>
                <option value="resolu">🟢 Acquitter : défaut résolu</option>
                <option value="sanssuite">⚪ Classer sans suite (faux positif)</option>
              </select></label>
            <label class="field"><span>Responsable / intervenant</span>
              <input name="responsable" value="${esc(d.responsable)}" placeholder="Ex. Équipe travaux — M. Chevalier" /></label>
            <label class="field"><span>Commentaire d'intervention <em class="req">*</em></span>
              <textarea name="commentaire" rows="3" placeholder="Travaux réalisés, matériaux, PV d'essai, constat de clôture…"></textarea></label>
            <label class="field"><span>Pièces jointes / références documents</span>
              <input name="pieces" placeholder="Ex. Photos chantier, PV essai pression, rapport repérage…" /></label>
            <div class="acq-actions">
              <button type="submit" class="btn-primary">💾 Enregistrer l'acquêtement</button>
            </div>
            <p class="muted small">Chaque acquêtement est <strong>horodaté et tracé</strong> : il alimente automatiquement
            l'historique des évènements ci-dessous (journal non modifiable).</p>
          </form>`}
      </div>
    </div>

    <!-- ---- Traçabilité du défaut ---- -->
    <div class="adm-card det-trace">
      <h3>🧾 Traçabilité — actions sur ce défaut (${d.actions.length})</h3>
      ${d.actions.length ? `<ol class="trace-list">${d.actions.slice().reverse().map((a) => `
        <li class="trace-item">
          <span class="trace-date">${esc(a.date)}</span>
          <span class="trace-move">${esc(a.du)} → <strong>${esc(a.vers)}</strong></span>
          <span class="trace-actor">👤 ${esc(a.acteur)}</span>
          ${a.commentaire ? `<p class="trace-msg">${esc(a.commentaire)}</p>` : ""}
          ${a.pieces ? `<p class="trace-doc">📎 ${esc(a.pieces)}</p>` : ""}
        </li>`).join("")}</ol>`
      : '<p class="muted">Aucune action enregistrée pour le moment.</p>'}
    </div>`;

  const form = $("#form-acquit");
  if (form) form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const commentaire = String(fd.get("commentaire") || "").trim();
    if (!commentaire) { toast("⚠ Un commentaire d'intervention est obligatoire pour acquitter."); return; }
    const r = DEFAUTS.changerStatut(currentRef, fd.get("nouveau"), {
      commentaire,
      responsable: String(fd.get("responsable") || "").trim(),
      pieces: String(fd.get("pieces") || "").trim(),
      acteur: AUTH.user(),
    });
    toast(r.ok ? r.msg : "⚠ " + r.msg);
    if (r.ok) openDetail(currentRef);
  });

  const reopen = $("#btn-reopen");
  if (reopen) reopen.addEventListener("click", () => {
    const commentaire = prompt("Motif de la réouverture (obligatoire) :");
    if (!commentaire || !commentaire.trim()) { toast("⚠ Réouverture annulée — motif requis."); return; }
    const r = DEFAUTS.reouvrir(currentRef, { commentaire: commentaire.trim(), acteur: AUTH.user() });
    toast(r.ok ? r.msg : "⚠ " + r.msg);
    if (r.ok) openDetail(currentRef);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#btn-back").addEventListener("click", () => {
  currentRef = null;
  $("#view-detail").hidden = true;
  $("#view-liste").hidden = false;
  refreshAll();
});

/* =========================================================
   Signalement manuel (no code)
   ========================================================= */
function initFormNew() {
  const f = $("#form-new-defaut");
  f.gravite.innerHTML = DEFAUTS.GRAVITES.map(([v, l]) => `<option value="${v}"${v === "majeur" ? " selected" : ""}>${l}</option>`).join("");
  f.type.innerHTML = DEFAUTS.TYPES_DEFAUT.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  f.secteur.innerHTML = '<option value="">— Non précisé —</option>' +
    STORE.data.secteurs.map((s) => `<option value="${esc(s.nom)}">${esc(s.nom)}</option>`).join("");
}
$("#btn-new-defaut").addEventListener("click", () => {
  const c = $("#new-defaut-card");
  c.hidden = !c.hidden;
  if (!c.hidden) c.querySelector("[name=titre]").focus();
});
$("#btn-cancel-new").addEventListener("click", () => ($("#new-defaut-card").hidden = true));

$("#form-new-defaut").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!f.titre.value.trim()) { toast("⚠ L'intitulé du défaut est obligatoire."); return; }
  const ref = DEFAUTS.creerManuel({
    titre: f.titre.value.trim(),
    gravite: f.gravite.value,
    type: f.type.value,
    categorie: f.categorie.value,
    elementNom: f.elementNom.value.trim(),
    secteur: f.secteur.value,
    commune: f.commune.value.trim(),
    responsable: f.responsable.value.trim(),
    description: f.description.value.trim(),
  }, { acteur: AUTH.user() });
  f.reset(); initFormNew();
  $("#new-defaut-card").hidden = true;
  toast(`Défaut ${ref} enregistré au registre 📝`);
  refreshAll();
});

/* =========================================================
   Historique global (journal)
   ========================================================= */
let histoQ = "", histoType = "";
$("#histo-q").addEventListener("input", (e) => { histoQ = e.target.value.toLowerCase(); renderHisto(); });
$("#histo-type").addEventListener("change", (e) => { histoType = e.target.value; renderHisto(); });

function renderHisto() {
  const rows = DEFAUTS.journal.filter((ev) => {
    if (histoType && ev.type !== histoType) return false;
    if (histoQ && !`${ev.defaut} ${ev.message} ${ev.acteur} ${ev.type}`.toLowerCase().includes(histoQ)) return false;
    return true;
  });
  $("#histo-body").innerHTML = rows.map((ev) => `
    <tr>
      <td class="mono">${esc(ev.date)}</td>
      <td class="mono">${esc(ev.defaut)}</td>
      <td><span class="ht ht-${esc(ev.type)}">${esc(ev.type)}</span></td>
      <td>${esc(ev.message)}</td>
      <td>${esc(ev.acteur)}</td>
    </tr>`).join("") ||
    '<tr><td colspan="5" class="muted center">Aucun évènement pour ce filtre.</td></tr>';
}

/* =========================================================
   Actions registre (export, reset, impression)
   ========================================================= */
$("#btn-export-registre").addEventListener("click", () => {
  download("cartoeau-registre-defauts.csv", DEFAUTS.exportRegistreCSV());
  toast("Registre exporté (CSV) ⬇");
});
$("#btn-export-histo").addEventListener("click", () => {
  download("cartoeau-historique-evènements.csv", DEFAUTS.exportHistoriqueCSV());
  toast("Historique exporté (CSV) ⬇");
});
$("#btn-reset-demo").addEventListener("click", () => {
  if (confirm("Réinitialiser le registre des défauts et tout l'historique au jeu de démonstration ?")) {
    DEFAUTS.resetDemo(AUTH.user());
    toast("Registre réinitialisé ♻");
    refreshAll();
  }
});
$("#btn-print").addEventListener("click", () => window.print());

/* =========================================================
   Rafraîchissement global + temps réel (modifs admin / autre onglet)
   ========================================================= */
function refreshAll() {
  renderKpis();
  renderListe();
  renderHisto();
  initFormNew();
}
DEFAUTS.subscribe(() => { if (!$("#app").hidden) refreshAll(); });
// Filet de sécurité : toute mutation du registre (interne ou publique) rafraîchit la page
["changerStatut", "reouvrir", "creerManuel", "supprimerManuel", "resetDemo"].forEach((k) => {
  const fn = DEFAUTS[k];
  DEFAUTS[k] = (...args) => { const r = fn(...args); DEFAUTS._notify(); return r; };
});
window.addEventListener("storage", (e) => {
  if (!$("#app").hidden && /cartoeau_(defauts|overrides)/.test(e.key || "")) refreshAll();
});

/* =========================================================
   Démarrage
   ========================================================= */
AUTH.isLoggedIn() ? showApp() : showLogin();
