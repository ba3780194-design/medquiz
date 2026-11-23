// MedQuiz extras : examen blanc, mode hors ligne, parrainage, générateur de QCM.
// Chargé par <script type="module" src="medquiz-extras.js"></script>, s'appuie sur window.MQ (voir index.html).
const ready = () => new Promise((res) => (window.MQ ? res(window.MQ) : window.addEventListener("medquiz:ready", () => res(window.MQ), { once: true })));
const MQ = await ready();
const { supabase, el } = MQ;

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fullExplanation = (q) => MQ.getPremium().actif ? q.explication : String(q.explication || "").split(/(?<=[.!?])\s/)[0] + " 🔒 Explication complète avec Premium.";

// ---------- Styles ----------
const css = document.createElement("style");
css.textContent = `
#mqxBar{position:fixed;left:0;right:0;top:0;z-index:9999;background:#7a4b00;color:#fff;text-align:center;padding:6px 12px;font-size:.85rem;display:none}
#mqxBar.on{display:block}
#mqxFab{position:fixed;left:16px;bottom:16px;z-index:900}
#mqxFab>button{border-radius:999px;padding:12px 18px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
#mqxMenu{display:none;margin-bottom:8px;flex-direction:column;gap:6px;background:var(--card,#fff);color:inherit;border:1px solid rgba(128,128,128,.3);border-radius:14px;padding:8px}
#mqxMenu.on{display:flex}
#mqxMenu button{text-align:left}
.mqx-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:14px 0}
.mqx-field{display:flex;flex-direction:column;gap:4px;font-size:.9rem}
.mqx-field select,.mqx-field input,.mqx-field textarea{padding:10px;border-radius:10px;border:1px solid rgba(128,128,128,.4);font:inherit;background:transparent;color:inherit}
.mqx-field textarea{min-height:180px;resize:vertical}
.mqx-top{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;background:var(--bg,Canvas)}
.mqx-timer{font-variant-numeric:tabular-nums;font-weight:700}
.mqx-timer.urgent{color:#c0392b}
.mqx-dots{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.mqx-dots button{width:34px;height:34px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer}
.mqx-dots button.done{background:rgba(46,125,50,.25)}
.mqx-dots button.flag{outline:2px solid #e0a800}
.mqx-dots button.cur{border-width:2px;font-weight:700}
.mqx-opt{display:block;width:100%;text-align:left;margin:6px 0;padding:12px;border-radius:12px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer;font:inherit}
.mqx-opt.sel{border-color:#2e7d32;background:rgba(46,125,50,.15)}
.mqx-ok{border-left:4px solid #2e7d32;padding-left:10px;margin:12px 0}
.mqx-ko{border-left:4px solid #c0392b;padding-left:10px;margin:12px 0}
.mqx-bar{height:8px;border-radius:4px;background:rgba(128,128,128,.25);overflow:hidden}.mqx-bar i{display:block;height:100%;background:#2e7d32}
.mqx-code{font-size:1.6rem;font-weight:800;letter-spacing:.15em}
`;
document.head.append(css);

// ---------- Pages ----------
const main = document.querySelector("main");
const addPage = (id, eyebrow, titre, sous) => {
  const s = el("section", "page"); s.id = id;
  const h = el("div", "section-heading");
  h.append(el("span", "eyebrow", eyebrow), el("h2", "", titre), el("p", "", sous));
  const body = el("div"); body.id = id + "Body";
  s.append(h, body); main.append(s); return body;
};
const exBody = addPage("examen", "✦ MODE EXAMEN", "Examen blanc", "Conditions réelles : chronomètre global, correction à la fin, aucune aide pendant l'épreuve.");
// L'Examen blanc est accessible uniquement depuis la rubrique Quiz.
// Délégation d'événement : le clic reste fonctionnel même si le bouton est recréé.
document.addEventListener("click", (event) => {
  const bouton = event.target.closest("#ouvrirExamenBlanc");
  if (!bouton) return;
  event.preventDefault();
  MQ.afficherPage("examen");
  renderExamConfig();
});

// ====================== HORS LIGNE ======================
const bar = el("div"); bar.id = "mqxBar"; bar.setAttribute("role", "status"); document.body.prepend(bar);
const OUTBOX = "mqx_outbox_v1";
MQ.queueHistory = (row) => {
  // Conserve le résultat localement avant toute tentative réseau.
  const q = lsGet(OUTBOX, []);
  q.push({ ...row, _t: Date.now(), _local_id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  const saved = lsSet(OUTBOX, q);
  majBar();
  if (saved && navigator.onLine) flushOutbox();
  return saved;
};
function majBar() {
  const n = lsGet(OUTBOX, []).length;
  const off = !navigator.onLine;
  bar.classList.toggle("on", off || n > 0);
  bar.textContent = off
    ? `Hors ligne — les quiz restent disponibles${n ? ` · ${n} résultat(s) en attente de synchronisation` : ""}.`
    : `${n} résultat(s) en attente de synchronisation…`;
}
let flushing = false;
async function flushOutbox() {
  const user = MQ.getUser();
  if (flushing || !navigator.onLine || !user) return;
  flushing = true;
  try {
    const q = lsGet(OUTBOX, []);
    const restants = [];
    for (const item of q) {
      // Ne jamais envoyer l'historique d'un autre compte.
      if (item.user_id !== user.id) { restants.push(item); continue; }
      const { _t, _local_id, ...row } = item;
      try {
        let { error } = await supabase.from("quiz_history").insert(row);
        if (error) {
          ({ error } = await supabase.from("quiz_history").insert({
            user_id: row.user_id,
            score: row.score,
            nombre_questions: row.nombre_questions
          }));
        }
        if (error) restants.push(item);
      } catch {
        // Une coupure réseau ou une erreur temporaire garde le résultat en attente.
        restants.push(item);
      }
      if (!navigator.onLine) {
        const index = q.indexOf(item);
        restants.push(...q.slice(index + 1).filter((x) => !restants.includes(x)));
        break;
      }
    }
    lsSet(OUTBOX, restants);
  } finally {
    flushing = false;
    majBar();
  }
}
window.addEventListener("online", () => { majBar(); flushOutbox(); });
window.addEventListener("offline", majBar);
majBar(); flushOutbox();

// ====================== EXAMEN BLANC ======================
const EXAMS = "mqx_exams_v1";
function renderExamConfig() {
  exBody.replaceChildren();
  const bank = MQ.getQuestions();
  const cats = [...new Set(bank.map((q) => q.categorie).filter(Boolean))].sort();
  const field = (label, node) => { const f = el("label", "mqx-field", label); f.append(node); return f; };
  const sel = (opts) => { const s = el("select"); opts.forEach(([v, t]) => { const o = el("option", "", t); o.value = v; s.append(o); }); return s; };
  const nb = sel([["20", "20 questions"], ["40", "40 questions"], ["60", "60 questions"]]);
  const cat = sel([["", "Toutes les catégories"], ...cats.map((c) => [c, c])]);
  const niv = sel([["", "Tous niveaux"], ["facile", "Facile"], ["moyen", "Moyen"], ["difficile", "Difficile"]]);
  const sec = sel([["60", "60 s / question"], ["45", "45 s / question"], ["90", "90 s / question"]]);
  const grid = el("div", "mqx-grid"); grid.append(field("Nombre", nb), field("Catégorie", cat), field("Niveau", niv), field("Rythme", sec));
  const info = el("p", "muted");
  const go1 = el("button", "btn btn-primary", "Commencer l'examen"); go1.type = "button";
  go1.addEventListener("click", () => {
    let pool = bank.filter((q) => (!cat.value || q.categorie === cat.value) && (!niv.value || q.niveau === niv.value));
    const n = Math.min(+nb.value, pool.length);
    if (n < 5) { info.textContent = "Pas assez de questions avec ces filtres."; return; }
    startExam(shuffle(pool).slice(0, n), n * +sec.value, `${cat.value || "Toutes catégories"} · ${niv.value || "tous niveaux"}`);
  });
  exBody.append(grid, go1, info);
  const hist = lsGet(EXAMS, []);
  if (hist.length) {
    const h = el("div"); h.style.marginTop = "24px"; h.append(el("h3", "", "Mes derniers examens"));
    hist.slice(-8).reverse().forEach((e) => {
      const row = el("div"); row.style.margin = "10px 0";
      row.append(el("div", "", `${new Date(e.date).toLocaleDateString("fr-FR")} — ${e.note}/20 (${e.bonnes}/${e.total}) · ${e.label}`));
      const b = el("div", "mqx-bar"); const i = el("i"); i.style.width = `${e.note * 5}%`; b.append(i); row.append(b); h.append(row);
    });
    exBody.append(h);
  }
}

function startExam(qs, totalSec, label) {
  const items = qs.map((q) => ({ q, choix: shuffle(q.choix), rep: null, flag: false }));
  let cur = 0, reste = totalSec, fini = false;
  const timer = setInterval(() => { if (fini) return; reste--; majTimer(); if (reste <= 0) terminer(true); }, 1000);
  const timerEl = el("span", "mqx-timer");
  const majTimer = () => { timerEl.textContent = `⏱ ${fmt(Math.max(0, reste))}`; timerEl.classList.toggle("urgent", reste <= 60); };

  function draw() {
    exBody.replaceChildren();
    const top = el("div", "mqx-top");
    top.append(el("span", "", `Question ${cur + 1} / ${items.length}`), timerEl);
    const it = items[cur];
    exBody.append(top, el("p", "", it.q.question));
    it.choix.forEach((c) => {
      const b = el("button", "mqx-opt" + (it.rep === c ? " sel" : ""), c); b.type = "button";
      b.addEventListener("click", () => { it.rep = it.rep === c ? null : c; draw(); });
      exBody.append(b);
    });
    const nav = el("div", "actions"); nav.style.margin = "12px 0";
    const mk = (t, cls, fn, dis) => { const b = el("button", "btn " + cls, t); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); nav.append(b); };
    mk("← Précédente", "btn-secondary", () => { cur--; draw(); }, cur === 0);
    mk(it.flag ? "🚩 Retirer le repère" : "🚩 Marquer", "btn-secondary", () => { it.flag = !it.flag; draw(); });
    mk("Suivante →", "btn-secondary", () => { cur++; draw(); }, cur === items.length - 1);
    exBody.append(nav);
    const dots = el("div", "mqx-dots");
    items.forEach((x, i) => { const d = el("button", (x.rep ? "done " : "") + (x.flag ? "flag " : "") + (i === cur ? "cur" : ""), String(i + 1)); d.type = "button"; d.addEventListener("click", () => { cur = i; draw(); }); dots.append(d); });
    const fin = el("button", "btn btn-primary", "Rendre ma copie"); fin.type = "button";
    fin.addEventListener("click", () => {
      const vides = items.filter((x) => !x.rep).length;
      if (!vides || confirm(`${vides} question(s) sans réponse. Rendre quand même ?`)) terminer(false);
    });
    exBody.append(dots, fin);
  }

  function terminer(tempsEcoule) {
    fini = true; clearInterval(timer);
    const bonnes = items.filter((x) => x.rep === x.q.reponse).length;
    const note = Math.round((bonnes / items.length) * 200) / 10;
    const hist = lsGet(EXAMS, []); hist.push({ date: Date.now(), note, bonnes, total: items.length, label }); lsSet(EXAMS, hist.slice(-30));
    exBody.replaceChildren(el("h3", "", tempsEcoule ? "⏰ Temps écoulé" : "Copie rendue"));
    const big = el("p", "", `${note} / 20 — ${bonnes} bonne(s) réponse(s) sur ${items.length}`); big.style.cssText = "font-size:1.3rem;font-weight:700;margin:8px 0";
    exBody.append(big, el("p", "muted", `Temps utilisé : ${fmt(totalSec - Math.max(0, reste))}. Les examens blancs ne comptent pas dans le classement.`));
    const themes = {};
    items.forEach((x) => { const t = x.q.theme || x.q.categorie || "Autre"; (themes[t] ||= [0, 0]); themes[t][1]++; if (x.rep === x.q.reponse) themes[t][0]++; });
    const faibles = Object.entries(themes).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 5);
    exBody.append(el("h3", "", "Par thème (du plus faible au plus fort)"));
    faibles.forEach(([t, [ok, n]]) => { const r = el("div"); r.style.margin = "8px 0"; r.append(el("div", "", `${t} : ${ok}/${n}`)); const b = el("div", "mqx-bar"), i = el("i"); i.style.width = `${ok / n * 100}%`; b.append(i); r.append(b); exBody.append(r); });
    exBody.append(el("h3", "", "Correction"));
    items.forEach((x, i) => {
      const ok = x.rep === x.q.reponse;
      const d = el("div", ok ? "mqx-ok" : "mqx-ko");
      d.append(el("strong", "", `${i + 1}. ${x.q.question}`), el("div", "", `Ta réponse : ${x.rep ?? "— (aucune)"}`));
      if (!ok) d.append(el("div", "", `Bonne réponse : ${x.q.reponse}`));
      d.append(el("div", "muted", fullExplanation(x.q)));
      exBody.append(d);
    });
    const again = el("button", "btn btn-primary", "Nouvel examen"); again.type = "button"; again.addEventListener("click", renderExamConfig);
    if (MQ.boutonCarte) exBody.insertBefore(MQ.boutonCarte({ score: bonnes, max: items.length, bonnes, total: items.length, titre: "Examen blanc · " + note + "/20" }), exBody.children[3] || null);
    exBody.append(again); window.scrollTo({ top: 0 });
  }
  majTimer(); draw();
}

// ====================== GÉNÉRATEUR DE QCM ======================
const DECKS = "mqx_decks_v1";
const MAX_FILE = 5 * 1024 * 1024;
async function lireFichier(f) {
  if (f.size > MAX_FILE) throw new Error("Fichier trop volumineux (5 Mo max).");
  if (/\.pdf$/i.test(f.name)) {
    if (!navigator.onLine) {
      throw new Error("La lecture des PDF nécessite actuellement Internet. Pour travailler hors ligne, utilise un fichier TXT ou MD, ou colle directement ton cours.");
    }
    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    let t = "";
    for (let p = 1; p <= Math.min(pdf.numPages, 40) && t.length < 20000; p++) t += (await (await pdf.getPage(p)).getTextContent()).items.map((i) => i.str).join(" ") + "\n";
    return t;
  }
  if (/\.(txt|md|csv)$/i.test(f.name) || f.type.startsWith("text/")) return await f.text();
  throw new Error("Format non pris en charge : utilise un PDF, .txt ou .md, ou colle le texte.");
}
function validQ(q) {
  return q && typeof q.question === "string" && Array.isArray(q.choix) && q.choix.length === 4 && q.choix.every((c) => typeof c === "string") && q.choix.includes(q.reponse);
}
function renderGenerator() {
  gnBody.replaceChildren();
  const user = MQ.getUser();
  if (!user) { gnBody.append(el("p", "notice", "Connecte-toi pour générer des QCM depuis tes cours.")); const b = el("button", "btn btn-primary", "Me connecter"); b.type = "button"; b.addEventListener("click", () => MQ.afficherPage("compte")); gnBody.append(b); }
  else {
    const f = (l, n) => { const x = el("label", "mqx-field", l); x.append(n); return x; };
    const titre = el("input"); titre.placeholder = "Ex. Cardiologie – insuffisance cardiaque"; titre.maxLength = 60;
    const txt = el("textarea"); txt.placeholder = "Colle ici ton cours (min. 200 caractères, 12 000 utilisés au maximum)…";
    const file = el("input"); file.type = "file"; file.accept = ".pdf,.txt,.md,text/plain,application/pdf";
    const nb = el("select"); [5, 10, 15].forEach((n) => { const o = el("option", "", `${n} questions`); o.value = n; if (n === 10) o.selected = true; nb.append(o); });
    const niv = el("select"); ["facile", "moyen", "difficile"].forEach((n) => { const o = el("option", "", n); o.value = n; if (n === "moyen") o.selected = true; niv.append(o); });
    const info = el("p", "muted");
    const privacy = el("p", "muted", "🔒 Le texte de ton cours est envoyé à un service d'IA pour générer les questions. N'y mets pas de données de patients ni de contenu que tu n'as pas le droit de partager.");
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      info.textContent = "Lecture du fichier…";
      try { txt.value = (await lireFichier(file.files[0])).replace(/[ \t]+/g, " ").trim().slice(0, 12000); info.textContent = `${txt.value.length} caractères importés.`; if (!titre.value) titre.value = file.files[0].name.replace(/\.[^.]+$/, "").slice(0, 60); }
      catch (e) { info.textContent = e.message; }
    });
    const gen = el("button", "btn btn-primary", "Générer mes QCM"); gen.type = "button";
    gen.addEventListener("click", async () => {
      if (!navigator.onLine) { info.textContent = "Tu es hors ligne : la génération nécessite une connexion."; return; }
      if (txt.value.trim().length < 200) { info.textContent = "Ajoute au moins 200 caractères de cours."; return; }
      gen.disabled = true; info.textContent = "Génération en cours (10 à 30 s)…";
      let data = null, error = null;
      try {
        ({ data, error } = await supabase.functions.invoke("generate-qcm", {
          body: { text: txt.value, count: +nb.value, niveau: niv.value, titre: titre.value || "Mon cours" }
        }));
      } catch (e) {
        error = e;
      } finally {
        gen.disabled = false;
      }
      let code = data?.error;
      if (error && !code) { try { code = (await error.context?.json?.())?.error; } catch { /* ignore */ } }
      if (code === "quota_exceeded") { info.textContent = "Limite quotidienne atteinte. Reviens demain, ou passe Premium pour plus de générations."; return; }
      if (error || code || !Array.isArray(data?.questions)) { info.textContent = "La génération a échoué. Réessaie avec un texte plus clair."; return; }
      const qs = data.questions.filter(validQ);
      if (!qs.length) { info.textContent = "Aucune question exploitable n'a été produite."; return; }
      const decks = lsGet(DECKS, []); decks.unshift({ id: Date.now(), titre: titre.value || "Mon cours", date: Date.now(), questions: qs });
      lsSet(DECKS, decks.slice(0, 20)); info.textContent = `${qs.length} question(s) créée(s) ✓`; renderGenerator();
    });
    gnBody.append(f("Titre du cours", titre), f("Importer un fichier (PDF, TXT, MD)", file), f("Ou colle ton texte", txt));
    const g = el("div", "mqx-grid"); g.append(f("Nombre", nb), f("Niveau", niv)); gnBody.append(g, gen, info, privacy);
  }
  const decks = lsGet(DECKS, []);
  if (decks.length) {
    const h = el("div"); h.style.marginTop = "24px"; h.append(el("h3", "", "Mes quiz (enregistrés sur cet appareil, disponibles hors ligne)"));
    decks.forEach((d) => {
      const row = el("div", "actions"); row.style.cssText = "align-items:center;margin:8px 0";
      row.append(el("span", "", `${d.titre} — ${d.questions.length} q. · ${new Date(d.date).toLocaleDateString("fr-FR")}`));
      const play = el("button", "btn btn-primary", "Jouer"); play.type = "button";
      play.addEventListener("click", () => MQ.lancerQuiz({
        mode: "partie", titre: d.titre, chrono: 0, selection: shuffle(d.questions).map((q) => ({ ...q, niveau: q.niveau || "moyen" })),
        surFin: async (score, zone) => { zone.append(el("p", "notice", "Quiz personnel : il ne rapporte pas de points au classement.")); },
      }));
      const del = el("button", "btn btn-secondary", "Supprimer"); del.type = "button";
      del.addEventListener("click", () => { if (confirm("Supprimer ce quiz ?")) { lsSet(DECKS, lsGet(DECKS, []).filter((x) => x.id !== d.id)); renderGenerator(); } });
      row.append(play, del); h.append(row);
    });
    gnBody.append(h);
  }
}

// ====================== PARRAINAGE ======================
const REF_KEY = "mqx_ref_pending";
try { const r = new URLSearchParams(location.search).get("ref"); if (r && /^[A-Za-z0-9]{4,16}$/.test(r)) localStorage.setItem(REF_KEY, r.toUpperCase()); } catch { /* ignore */ }
async function claimPending() {
  if (!navigator.onLine || !MQ.getUser()) return;
  let code; try { code = localStorage.getItem(REF_KEY); } catch { return; }
  if (!code) return;
  const { data, error } = await supabase.rpc("claim_referral", { p_code: code });
  if (!error) { try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ } }
  return data;
}
async function chargerBonus() {
  if (!navigator.onLine || !MQ.getUser()) { if (!MQ.getUser()) window.MQ_bonusFin = null; return null; }
  const { data, error } = await supabase.rpc("my_referral");
  if (error) return null;
  const r = Array.isArray(data) ? data[0] : data;
  const avant = window.MQ_bonusFin;
  window.MQ_bonusFin = r?.bonus_until || null;
  if (avant !== window.MQ_bonusFin) MQ.refreshPremium();
  return r;
}
async function renderReferral() {
  prBody.replaceChildren();
  if (!MQ.getUser()) { prBody.append(el("p", "notice", "Connecte-toi pour obtenir ton lien de parrainage.")); const b = el("button", "btn btn-primary", "Me connecter"); b.type = "button"; b.addEventListener("click", () => MQ.afficherPage("compte")); prBody.append(b); return; }
  prBody.append(el("p", "muted", "Chargement…"));
  if (!navigator.onLine) {
    prBody.replaceChildren(el("p", "notice", "Le parrainage nécessite une connexion Internet. Tes autres fonctions hors ligne restent disponibles."));
    return;
  }
  await claimPending();
  const r = await chargerBonus();
  prBody.replaceChildren();
  if (!r) { prBody.append(el("p", "notice", "Parrainage indisponible pour le moment (le script supabase/extras.sql a-t-il été exécuté ?).")); return; }
  const lien = `${location.origin}${location.pathname}?ref=${r.code}`;
  prBody.append(el("p", "", "Ton code :"), el("div", "mqx-code", r.code));
  const msg = `Je révise avec MedQuiz 🩺 Inscris-toi avec mon lien, on gagne tous les deux 7 jours d'explications complètes : ${lien}`;
  const acts = el("div", "actions"); acts.style.margin = "14px 0";
  const wa = el("a", "btn btn-gold", "Partager sur WhatsApp"); wa.href = "https://wa.me/?text=" + encodeURIComponent(msg); wa.target = "_blank"; wa.rel = "noopener";
  const cp = el("button", "btn btn-secondary", "Copier mon lien"); cp.type = "button";
  cp.addEventListener("click", async () => { try { await navigator.clipboard.writeText(lien); cp.textContent = "Copié ✓"; } catch { prompt("Copie ton lien :", lien); } });
  acts.append(wa, cp); prBody.append(acts);
  prBody.append(el("p", "", `Amis inscrits : ${r.invited} · Récompensés : ${r.rewarded}`));
  prBody.append(el("p", "muted", r.bonus_until ? `🎁 Bonus actif jusqu'au ${new Date(r.bonus_until).toLocaleDateString("fr-FR")}` : "Aucun bonus actif pour l'instant."));
  prBody.append(el("p", "muted", "Règles : l'ami doit s'inscrire via ton lien, puis terminer 3 quiz dans ses 7 premiers jours. Maximum 8 récompenses par parrain."));
  const form = el("div", "mqx-field"); form.style.marginTop = "18px";
  const inp = el("input"); inp.placeholder = "Code d'un ami (si tu t'es inscrit récemment)"; inp.maxLength = 16;
  const ok = el("button", "btn btn-secondary", "Valider le code"); ok.type = "button"; const msg2 = el("p", "muted");
  ok.addEventListener("click", async () => {
    const { data } = await supabase.rpc("claim_referral", { p_code: inp.value });
    msg2.textContent = { ok: "Code enregistré ✓ Termine 3 quiz pour débloquer ton bonus.", invalid_code: "Code inconnu.", self: "Tu ne peux pas utiliser ton propre code.", already_referred: "Un parrain est déjà enregistré.", too_late: "Trop tard : le code doit être saisi dans les 7 jours suivant l'inscription." }[data] || "Impossible de valider ce code.";
  });
  form.append(inp, ok, msg2); prBody.append(form);
}
supabase.auth.onAuthStateChange((_e, session) => { setTimeout(async () => { if (session?.user) { await claimPending(); await chargerBonus(); flushOutbox(); } else window.MQ_bonusFin = null; }, 0); });
if (MQ.getUser()) { claimPending().then(chargerBonus); flushOutbox(); }
