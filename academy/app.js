/*
 * AI Engineering Academy - application script.
 *
 * Plain JavaScript, no framework, no network. Works from file://.
 * Content comes from content/*.js (window.ACADEMY). Progress lives in
 * localStorage under the key "aiacademy.v1". Export it from "Progress and backup".
 *
 * Part 1: pure logic (also loaded by tools/selftest.js in node).
 * Part 2: store.
 * Part 3: pages and router (browser only).
 * Part 4: interactives (browser only).
 */
(function (root) {
  "use strict";
  const A = root.ACADEMY = root.ACADEMY || { lessons: {}, tickets: {} };

  /* ===================================================== PART 1: PURE LOGIC */

  // Spaced repetition. Offsets are days after the lesson is complete.
  // Good moves to the next offset, Hard repeats the same interval, Again restarts.
  // Addition (not in the master prompt): after Day 14, a card "graduates" to a 30-day check.
  const SR_OFFSETS = [1, 2, 4, 7, 14];
  const SR_GRADUATED = 30;

  function addDays(isoDate, n) {
    const d = new Date(isoDate + "T12:00:00");
    d.setDate(d.getDate() + n);
    return localIso(d);
  }
  function localIso(d) {
    const p = (x) => String(x).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function gap(step) {
    if (step <= 0) return SR_OFFSETS[0];
    if (step >= SR_OFFSETS.length) return SR_GRADUATED;
    return SR_OFFSETS[step] - SR_OFFSETS[step - 1];
  }
  function newCard(completedOn) {
    return { step: 0, due: addDays(completedOn, SR_OFFSETS[0]), history: [] };
  }
  function schedule(card, rating, today) {
    const c = { step: card.step, due: card.due, history: (card.history || []).concat([{ date: today, rating: rating, step: card.step }]) };
    if (rating === "again") { c.step = 0; c.due = addDays(today, 1); }
    else if (rating === "hard") { c.due = addDays(today, gap(c.step)); }
    else if (rating === "good") {
      if (c.step < SR_OFFSETS.length - 1) { c.step += 1; c.due = addDays(today, gap(c.step)); }
      else { c.step = SR_OFFSETS.length; c.due = addDays(today, SR_GRADUATED); }
    }
    return c;
  }
  function stepLabel(step) {
    return step >= SR_OFFSETS.length ? "Graduated (30-day check)" : "Day " + SR_OFFSETS[step];
  }

  // Sampling.
  function softmax(logits, T) {
    const t = Math.max(T, 1e-6);
    const z = logits.map((x) => x / t);
    const m = Math.max.apply(null, z);
    const e = z.map((x) => Math.exp(x - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
  }
  // Returns the indexes kept by top-p (nucleus) filtering.
  function topP(probs, p) {
    const order = probs.map((x, i) => i).sort((a, b) => probs[b] - probs[a]);
    const keep = [];
    let cum = 0;
    for (const i of order) { keep.push(i); cum += probs[i]; if (cum >= p - 1e-12) break; }
    return keep;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sampleIndex(probs, keep, rnd) {
    const total = keep.reduce((s, i) => s + probs[i], 0);
    let r = rnd() * total;
    for (const i of keep) { r -= probs[i]; if (r <= 0) return i; }
    return keep[keep.length - 1];
  }

  // Byte pair encoding on characters (a real, small implementation).
  function bpeInit(corpus) {
    const freq = new Map();
    corpus.trim().split(/\s+/).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    return { words: Array.from(freq.entries()).map(([w, n]) => ({ word: w, n: n, syms: w.split("") })), merges: [] };
  }
  function bpePairCounts(state) {
    const counts = new Map();
    state.words.forEach((w) => {
      for (let i = 0; i < w.syms.length - 1; i++) {
        const k = w.syms[i] + "\u0000" + w.syms[i + 1];
        counts.set(k, (counts.get(k) || 0) + w.n);
      }
    });
    return counts;
  }
  // One merge step. Ties go to the pair seen first in the corpus.
  function bpeStep(state) {
    const counts = bpePairCounts(state);
    let best = null, bestN = 0;
    counts.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
    if (!best || bestN < 2) return null;
    const [a, b] = best.split("\u0000");
    const words = state.words.map((w) => ({ word: w.word, n: w.n, syms: mergeSyms(w.syms, a, b) }));
    return { words: words, merges: state.merges.concat([{ a: a, b: b, count: bestN }]) };
  }
  function mergeSyms(syms, a, b) {
    const out = [];
    for (let i = 0; i < syms.length; i++) {
      if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; }
      else out.push(syms[i]);
    }
    return out;
  }
  function bpeApply(word, merges) {
    let syms = word.split("");
    merges.forEach((m) => { syms = mergeSyms(syms, m.a, m.b); });
    return syms;
  }
  function bpeTokenCount(state) { return state.words.reduce((s, w) => s + w.syms.length * w.n, 0); }

  // Cost. Prices are USD per million tokens.
  // Source: Claude API reference at the time of writing (2026-11). Check the pricing page.
  const MODELS = [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", in: 4, out: 20 },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", in: 2, out: 10 },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", in: 0.10, out: 0.50, longIn: 0.50, longOut: 2.50, longAbove: 100000, tokenFactor: 1.3 }
  ];
  function cost(model, inTok, outTok) {
    const long = model.longAbove && inTok > model.longAbove;
    const pin = long ? model.longIn : model.in;
    const pout = long ? model.longOut : model.out;
    const i = inTok * pin / 1e6, o = outTok * pout / 1e6;
    return { input: i, output: o, total: i + o, long: !!long };
  }

  A.logic = { SR_OFFSETS, SR_GRADUATED, addDays, newCard, schedule, gap, stepLabel, softmax, topP, mulberry32, sampleIndex,
    bpeInit, bpeStep, bpeApply, bpeTokenCount, MODELS, cost, localIso };

  if (typeof document === "undefined") return; // node: logic only

  /* =========================================================== PART 2: STORE */

  const KEY = "aiacademy.v1";
  const today = () => localIso(new Date());
  const nowIso = () => new Date().toISOString();
  let storageOk = true;

  function fresh() {
    return { version: 1, lessons: {}, concepts: {}, reviews: {}, tickets: {}, journal: [], misconceptions: [] };
  }
  function normalize(s) {
    const f = fresh();
    Object.keys(f).forEach((k) => { if (s[k] === undefined) s[k] = f[k]; });
    return s;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return normalize(s); }
    } catch (e) { storageOk = false; }
    return fresh();
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
    updateBadge();
  }
  function lessonState(id) {
    if (!S.lessons[id]) S.lessons[id] = { levelUnlocked: 1, checks: {}, completedAt: null, teachBack: "" };
    return S.lessons[id];
  }
  function conceptState(id) {
    if (!S.concepts[id]) S.concepts[id] = { level: 0, evidence: [] };
    return S.concepts[id];
  }
  function ticketState(id) {
    if (!S.tickets[id]) S.tickets[id] = { status: "not started", handoff: {}, startedAt: null, doneAt: null };
    return S.tickets[id];
  }
  function raiseConcept(id, level, note) {
    const c = conceptState(id);
    if (c.level >= level) return false;
    c.level = level;
    c.evidence.push({ level: level, note: note, date: nowIso() });
    return true;
  }
  function dueCards() {
    const t = today();
    return Object.keys(S.reviews).filter((k) => S.reviews[k].due <= t).sort((a, b) => S.reviews[a].due.localeCompare(S.reviews[b].due));
  }
  function findRecall(cardId) {
    for (const lid of Object.keys(A.lessons)) {
      const r = (A.lessons[lid].recall || []).find((x) => x.id === cardId);
      if (r) return Object.assign({ lesson: lid }, r);
    }
    return null;
  }

  /* ================================================== PART 3: PAGES, ROUTER */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const view = $("#view");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "");
  const LEVELS = [
    { n: 1, name: "Introduced", how: "You finished level 1 of a lesson and its checks. Set by the app." },
    { n: 2, name: "Understood", how: "You answered all checks of the lesson. Set by the app." },
    { n: 3, name: "Visualized", how: "You drew the main diagram from memory, without notes. Claim it with a note." },
    { n: 4, name: "Applied", how: "You finished a ticket that uses the concept, and its review passed. Claim it with a note." },
    { n: 5, name: "Analyzed", how: "You solved the debugging scenarios and can compare trade-offs. Claim it with a note." },
    { n: 6, name: "Can teach", how: "Your teach-back was reviewed and had no important gaps. Claim it with a note." }
  ];

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function copyText(text, what) {
    const done = () => toast((what || "Text") + " copied.");
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      ok ? done() : toast("Copy failed. Use the download button.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function updateBadge() {
    const b = $("#due-badge"); if (!b) return;
    const n = dueCards().length;
    b.hidden = n === 0; b.textContent = n + " due";
  }
  function allLessonsMeta() {
    const out = [];
    (A.curriculum || []).forEach((t) => t.lessons.forEach((l) => out.push(Object.assign({ topic: t }, l))));
    return out;
  }
  function storageBanner() {
    return storageOk ? "" : `<div class="note warn"><div class="note-title">Progress is not saved</div><p>This browser blocks local storage here (for example, a private window). Export your progress before you close the page.</p></div>`;
  }

  /* ---------------------------------------------------------- dashboard */
  // Helpers for the Home, Curriculum and Progress pages.
  // Every value they show comes from the saved state S or from the content files. They do not change S.

  // Returns "new", "started" or "done" for a lesson. "started" means the lesson page was opened.
  function coreLessonStatus(id) {
    const st = S.lessons[id];
    if (!st) return "new";
    return st.completedAt ? "done" : "started";
  }
  // Concepts of the built lessons, with the lesson and the topic of each.
  function coreConcepts() {
    return Object.values(A.lessons).flatMap((L) => (L.concepts || []).map((c) => ({ id: c.id, name: c.name, lesson: L.id, topic: L.topic })));
  }
  function coreConceptName(id) {
    const c = coreConcepts().find((x) => x.id === id);
    return c ? c.name : id;
  }
  // Recorded activity, newest first. Only events with a saved date are used.
  function coreActivity() {
    const out = [];
    Object.keys(S.lessons).forEach((id) => {
      const st = S.lessons[id];
      if (st && st.completedAt) out.push({ date: st.completedAt, kind: "lesson", text: "Completed lesson " + id + (A.lessons[id] ? ": " + A.lessons[id].title : ""), href: "#/lesson/" + id });
    });
    Object.keys(S.tickets).forEach((id) => {
      const st = S.tickets[id] || {};
      const title = A.tickets[id] ? ": " + A.tickets[id].title : "";
      if (st.startedAt) out.push({ date: st.startedAt, kind: "ticket", text: "Started ticket " + id + title, href: "#/ticket/" + id });
      if (st.doneAt) out.push({ date: st.doneAt, kind: "ticket", text: "Finished ticket " + id + title, href: "#/ticket/" + id });
    });
    (S.journal || []).forEach((j) => {
      if (!j || !j.date) return;
      const what = j.kind === "teach-back" ? "Saved a teach-back" : "Wrote a journal note";
      out.push({ date: j.date, kind: "journal", text: what + (j.lesson ? " for lesson " + j.lesson : ""), href: "#/journal" });
    });
    // Concept evidence: one line for each day and level, because one lesson check can raise several concepts at once.
    const ev = {};
    Object.keys(S.concepts).forEach((cid) => (S.concepts[cid].evidence || []).forEach((e) => {
      if (!e || !e.date) return;
      const k = fmtDate(e.date) + "|" + e.level;
      if (!ev[k]) ev[k] = { date: e.date, level: e.level, ids: [] };
      if (e.date > ev[k].date) ev[k].date = e.date;
      ev[k].ids.push(cid);
    }));
    Object.values(ev).forEach((g) => {
      const name = (A.md && A.md.LEVEL_NAMES && A.md.LEVEL_NAMES[g.level]) || "";
      const who = g.ids.length === 1 ? "Concept “" + coreConceptName(g.ids[0]) + "” reached" : g.ids.length + " concepts reached";
      out.push({ date: g.date, kind: "mastery", text: who + " level " + g.level + (name ? " (" + name + ")" : ""), href: "#/mastery" });
    });
    // Review ratings have a date only. One line for each day.
    const rv = {};
    Object.keys(S.reviews).forEach((k) => (S.reviews[k].history || []).forEach((h) => { if (h && h.date) rv[h.date] = (rv[h.date] || 0) + 1; }));
    Object.keys(rv).forEach((d) => out.push({ date: d, kind: "review", text: "Reviewed " + rv[d] + " recall card" + (rv[d] > 1 ? "s" : ""), href: "#/review" }));
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  function coreTicketTag(status) {
    const s = status || "not started";
    const cls = s === "done" ? "ok" : s === "in review" ? "warn" : s === "in progress" ? "accent" : "";
    return `<span class="tag ${cls}">${esc(s.charAt(0).toUpperCase() + s.slice(1))}</span>`;
  }
  function coreBar(pct, label, ok) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    return `<div class="progress${ok ? " ok" : ""}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></div>`;
  }
  function coreRecallLine(k) {
    const r = findRecall(k), c = S.reviews[k];
    return `<li><span class="home-q">${esc(r ? r.q : k)}</span><span class="meta-text">${r ? "Lesson " + esc(r.lesson) + " · " : ""}${esc(stepLabel(c.step))} · due <time datetime="${esc(c.due)}">${esc(c.due)}</time></span></li>`;
  }

  function pageDashboard() {
    const metas = allLessonsMeta();
    const ready = metas.filter((l) => l.status === "ready");
    const completed = ready.filter((l) => (S.lessons[l.id] || {}).completedAt);
    const dueList = dueCards();
    const due = dueList.length;
    const t0 = today();
    const overdue = dueList.filter((k) => S.reviews[k].due < t0).length;
    const allCards = Object.keys(S.reviews);
    const concepts = coreConcepts();
    const applied = concepts.filter((c) => (S.concepts[c.id] || {}).level >= 4).length;
    const tickets = Object.keys(A.tickets);
    const tDone = tickets.filter((id) => (S.tickets[id] || {}).status === "done").length;
    const noLessonTopics = (A.curriculum || []).filter((t) => !t.lessons.length).length;
    const activity = coreActivity();

    /* Welcome. */
    const welcome = `<header class="home-welcome">
        <h1>${activity.length || Object.keys(S.lessons).length ? "Welcome back." : "Welcome."}</h1>
        <p class="home-sub">Continue building your AI engineering foundations.</p>
        <p class="meta-text">${completed.length} of ${metas.length} planned lessons complete${activity.length ? ` · Last recorded activity <time datetime="${esc(fmtDate(activity[0].date))}">${esc(fmtDate(activity[0].date))}</time>` : " · No activity recorded yet"}</p>
      </header>`;

    /* Today's learning: the most prominent block. */
    const firstOpen = ready.find((l) => !(S.lessons[l.id] || {}).completedAt);
    const dueNote = due ? `<div class="home-due" role="note"><span class="status-dot warn" aria-hidden="true"></span>
        <p><strong>${due} review card${due > 1 ? "s" : ""} due${overdue ? ` (${overdue} overdue)` : ""}.</strong> Do the reviews first. They take a few minutes and protect what you learned.</p>
        <a class="btn secondary sm" href="#/review">Start the review</a></div>` : "";
    let todayBody;
    if (firstOpen) {
      const L = A.lessons[firstOpen.id];
      const ls = S.lessons[firstOpen.id];
      // levelDone() reads lessonState(), which creates a record. Call it only for a lesson that has a record.
      const levels = L ? L.levels : [];
      const doneN = ls && L ? levels.filter((lv) => levelDone(L, lv)).length : 0;
      const steps = levels.map((lv) => {
        const done = !!ls && levelDone(L, lv);
        const cur = !!ls && !done && lv.n === ls.levelUnlocked;
        return `<li class="${done ? "done" : cur ? "current" : ""}">Level ${lv.n}: ${esc(lv.name)}<span class="sr-only">${done ? " (done)" : cur ? " (current)" : ""}</span></li>`;
      }).join("");
      const status = ls ? `<span class="tag accent">In progress</span><span class="meta-text">${doneN} of ${levels.length} levels done · level ${esc(ls.levelUnlocked)} open</span>`
        : `<span class="tag">Not started</span>`;
      todayBody = `<p class="home-eyebrow">Topic ${esc(firstOpen.topic.n)} · Lesson ${esc(firstOpen.id)}</p>
        <h3 class="home-lesson-title"><a href="#/lesson/${esc(firstOpen.id)}">${esc(firstOpen.title)}</a></h3>
        ${L && L.objective ? `<p class="home-objective"><span class="home-label">Objective.</span> ${esc(L.objective)}</p>` : ""}
        <div class="home-status">${status}</div>
        ${steps ? `<ol class="stepper home-steps" aria-label="Lesson levels">${steps}</ol>` : ""}
        <div class="row home-actions"><a class="btn primary lg" href="#/lesson/${esc(firstOpen.id)}">${ls ? "Continue learning" : "Start learning"}</a>
          <a class="btn tertiary" href="#/curriculum">See the curriculum</a></div>`;
    } else {
      const openT = tickets.find((id) => (S.tickets[id] || {}).status !== "done");
      todayBody = `<h3 class="home-lesson-title">All ready lessons are complete</h3>
        ${openT ? `<p>Work on ticket <strong>${esc(openT)}</strong>: ${esc(A.tickets[openT].title)}.</p><div class="row home-actions"><a class="btn primary lg" href="#/ticket/${esc(openT)}">Open the ticket</a></div>`
          : `<p>All ready lessons and tickets are complete. Ask for the next lesson to be built.</p>`}`;
    }
    const todayCard = `<section class="card home-today" aria-labelledby="home-today-h"><h2 id="home-today-h">Today's learning</h2>${dueNote}${todayBody}</section>`;

    /* Progress overview. */
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const metrics = `<section class="home-metrics" aria-labelledby="home-metrics-h"><h2 id="home-metrics-h" class="sr-only">Progress overview</h2>
      <div class="home-metric"><span class="home-metric-label">Curriculum</span>
        <b>${completed.length}<small> / ${metas.length}</small></b>${coreBar(pct(completed.length, metas.length), "Lessons complete", completed.length && completed.length === metas.length)}
        <span class="meta-text">Lessons complete. ${ready.length} are ready to study.${noLessonTopics ? " " + noLessonTopics + " topics have no lessons yet." : ""}</span></div>
      <div class="home-metric"><span class="home-metric-label">Concepts mastered</span>
        <b>${applied}<small> / ${concepts.length}</small></b>${coreBar(pct(applied, concepts.length), "Concepts at level 4 or higher")}
        <span class="meta-text">At level 4 (Applied) or higher.</span></div>
      <div class="home-metric"><span class="home-metric-label">Review cards due</span>
        <b>${due}<small> / ${allCards.length}</small></b>
        <span class="home-metric-status"><span class="status-dot ${due ? "warn" : allCards.length ? "ok" : ""}" aria-hidden="true"></span>${due ? (overdue ? overdue + " overdue" : "Due today") : allCards.length ? "Nothing due" : "No cards yet"}</span>
        <span class="meta-text">${allCards.length ? "Cards in the queue: " + allCards.length + "." : "Complete a lesson to add its cards."}</span></div>
      <div class="home-metric"><span class="home-metric-label">Tickets completed</span>
        <b>${tDone}<small> / ${tickets.length}</small></b>${coreBar(pct(tDone, tickets.length), "Tickets done", tDone && tDone === tickets.length)}
        <span class="meta-text">Implementation tickets set to done.</span></div>
    </section>`;

    /* Continue building. */
    const inWork = tickets.find((id) => ["in progress", "in review"].includes((S.tickets[id] || {}).status));
    const curT = inWork || tickets.find((id) => (S.tickets[id] || {}).status !== "done");
    const lastDone = tickets.filter((id) => (S.tickets[id] || {}).doneAt).sort((a, b) => S.tickets[b].doneAt.localeCompare(S.tickets[a].doneAt))[0];
    let build;
    if (curT) {
      const T = A.tickets[curT], st = S.tickets[curT] || {};
      const status = st.status || "not started";
      const lessonDone = coreLessonStatus(T.lesson) === "done";
      const nextAction = status === "in progress" ? "Continue with the next milestone in VS Code. Then fill in the handoff on the ticket page."
        : status === "in review" ? "Copy the handoff and the review prompt into Claude. Fix what you agree with. Then set the status to done."
        : lessonDone ? "Open the ticket. Read the acceptance criteria. Start milestone 1 in VS Code."
        : "Finish lesson " + T.lesson + " first. Then open the ticket and read milestone 1.";
      build = `<p class="home-eyebrow">Current ticket</p>
        <h3 class="home-ticket-title"><a href="#/ticket/${esc(curT)}"><span class="home-mono">${esc(curT)}</span> ${esc(T.title)}</a></h3>
        <dl class="home-facts">
          <div><dt>Status</dt><dd>${coreTicketTag(status)}</dd></div>
          <div><dt>Lesson</dt><dd>${esc(T.lesson)} · Phase ${esc(T.phase)}</dd></div>
          <div><dt>Last completed</dt><dd>${lastDone ? `<a href="#/ticket/${esc(lastDone)}">${esc(lastDone)}</a> on <time datetime="${esc(fmtDate(S.tickets[lastDone].doneAt))}">${esc(fmtDate(S.tickets[lastDone].doneAt))}</time>` : "No ticket is done yet"}</dd></div>
        </dl>
        <p class="home-next"><span class="home-label">Next action.</span> ${esc(nextAction)}</p>
        <div class="row"><a class="btn secondary" href="#/ticket/${esc(curT)}">Open ${esc(curT)}</a><a class="btn tertiary" href="#/workflow">VS Code workflow</a></div>`;
    } else {
      build = tickets.length ? `<p>All ${tickets.length} tickets are done.${lastDone ? ` The last one was <a href="#/ticket/${esc(lastDone)}">${esc(lastDone)}</a>.` : ""}</p><div class="row"><a class="btn secondary" href="#/tickets">See all tickets</a></div>`
        : `<p class="muted">No tickets yet.</p>`;
    }
    const buildCard = `<section class="card home-build" aria-labelledby="home-build-h"><h2 id="home-build-h">Continue building</h2>
      <p class="home-project">Company AI Assistant · Northwind Tools <span class="meta-text">(fictional company)</span></p>${build}</section>`;

    /* Review. */
    const upcoming = allCards.filter((k) => S.reviews[k].due > t0).sort((a, b) => S.reviews[a].due.localeCompare(S.reviews[b].due));
    const reviewCard = `<section class="card home-review" aria-labelledby="home-review-h"><h2 id="home-review-h">Review</h2>
      ${!allCards.length ? `<p class="muted">No recall cards yet. Complete a lesson to add its cards. They return on Day 1, 2, 4, 7 and 14.</p>`
        : `${due ? `<h3 class="home-sub-h">Due now (${due})</h3><ul class="home-cards">${dueList.slice(0, 3).map(coreRecallLine).join("")}</ul>${due > 3 ? `<p class="meta-text">And ${due - 3} more.</p>` : ""}` : `<p><span class="status-dot ok" aria-hidden="true"></span> Nothing is due today.</p>`}
          ${upcoming.length ? `<h3 class="home-sub-h">Coming up</h3><ul class="home-cards">${upcoming.slice(0, 3).map(coreRecallLine).join("")}</ul>` : ""}
          <div class="row"><a class="btn ${due ? "secondary" : "tertiary"}" href="#/review">${due ? "Start the review" : "See the schedule"}</a></div>`}
      </section>`;

    /* Recent activity. */
    const recent = activity.slice(0, 6).map((a) => `<li class="home-act-${esc(a.kind)}"><time datetime="${esc(fmtDate(a.date))}">${esc(fmtDate(a.date))}</time><a href="${esc(a.href)}">${esc(a.text)}</a></li>`).join("");
    const activityCard = `<section class="card home-activity" aria-labelledby="home-activity-h"><h2 id="home-activity-h">Recent activity</h2>
      ${recent ? `<ol class="home-act-list">${recent}</ol>` : `<p class="muted">No activity yet. Completed lessons, ticket changes, reviews, mastery levels and journal notes show here.</p>`}</section>`;

    return `${storageBanner()}
      ${welcome}
      ${todayCard}
      ${metrics}
      <div class="home-split">${buildCard}${reviewCard}</div>
      ${activityCard}
      <details class="home-how"><summary>How each lesson works</summary>
        <ol>
          <li><strong>Learn in three levels.</strong> Intuitive, then software engineering, then advanced. Each level ends with checks. The next level opens when you finish them.</li>
          <li><strong>Watch or read the resources</strong> at the time the lesson says, with the questions to watch for.</li>
          <li><strong>Practise.</strong> Worked examples (the last steps are yours), debugging scenarios, recall questions.</li>
          <li><strong>Build.</strong> The lesson's ticket goes to VS Code. Claude Code helps you in the mode you choose. It does not write the feature for you.</li>
          <li><strong>Come back.</strong> Fill in the handoff, get a review, record evidence on the Mastery page.</li>
          <li><strong>Remember.</strong> Recall cards return on Day 1, 2, 4, 7 and 14 after you complete the lesson.</li>
        </ol>
        <p class="muted">This academy has no AI inside it. For a review, it gives you Markdown to paste into Claude.</p>
      </details>`;
  }

  /* --------------------------------------------------------- curriculum */
  function pageCurriculum() {
    const cur = A.curriculum || [];
    const nOrig = cur.reduce((s, t) => s + t.subtopics.filter((x) => x.source === "original").length, 0);
    const nAdd = cur.reduce((s, t) => s + t.subtopics.filter((x) => x.source === "addition").length, 0);
    const metas = allLessonsMeta();
    const nReady = metas.filter((l) => l.status === "ready").length;
    const nDone = metas.filter((l) => coreLessonStatus(l.id) === "done").length;
    // The next lesson to study: the first ready lesson that is not complete.
    const nextOpen = metas.find((l) => l.status === "ready" && coreLessonStatus(l.id) !== "done");
    const concepts = coreConcepts();
    const STATE = {
      done: ["ok", "Complete"], current: ["accent", "Studying now"], upcoming: ["", "Up next"], later: ["", "Not started"], practice: ["info", "Practice topic"]
    };
    let seenCurrent = false, seenUpcoming = false;
    const used = new Set();

    const topics = cur.map((t) => {
      const total = t.lessons.length;
      const done = t.lessons.filter((l) => coreLessonStatus(l.id) === "done").length;
      const readyN = t.lessons.filter((l) => l.status === "ready").length;
      const started = t.lessons.some((l) => coreLessonStatus(l.id) !== "new");
      let state;
      if (!total) state = "practice";
      else if (done === total) state = "done";
      else if (started || (nextOpen && nextOpen.topic.id === t.id)) state = "current";
      else if (!seenCurrent && !seenUpcoming) state = "upcoming";
      else state = "later";
      if (state === "current") seenCurrent = true;
      if (state === "upcoming") seenUpcoming = true;
      if (state === "later" && !seenUpcoming && seenCurrent) { state = "upcoming"; seenUpcoming = true; }
      const tc = concepts.filter((c) => c.topic === t.id);
      const tcApplied = tc.filter((c) => (S.concepts[c.id] || {}).level >= 4).length;
      const tcStarted = tc.filter((c) => (S.concepts[c.id] || {}).level >= 1).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const nSubs = t.subtopics.length;
      const nAddT = t.subtopics.filter((s) => s.source === "addition").length;

      const meta = [
        nSubs + " subtopic" + (nSubs > 1 ? "s" : "") + (nAddT ? " (" + nAddT + " addition" + (nAddT > 1 ? "s" : "") + ")" : ""),
        total ? done + " of " + total + " lessons complete" + (readyN < total ? " · " + readyN + " ready" : "") : "No lessons",
        tc.length ? "Mastery: " + tcApplied + " of " + tc.length + " concepts applied" + (tcStarted > tcApplied ? ", " + tcStarted + " started" : "") : ""
      ].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join("");

      const subs = t.subtopics.map((s) => `<li${s.source === "addition" ? ` class="cur-add"` : ""}>${esc(s.text)}${s.source === "addition"
        ? ` <span class="tag add">addition</span><small class="cur-why">Why: ${esc(s.why)}</small>` : ""}</li>`).join("");
      const lessons = total ? `<h3 class="cur-h">Lessons</h3><ol class="cur-lessons">${t.lessons.map((l) => {
        const ls = coreLessonStatus(l.id);
        const isNext = nextOpen && nextOpen.id === l.id;
        const tag = l.status !== "ready" ? `<span class="tag">Planned</span>`
          : ls === "done" ? `<span class="tag ok">Complete</span>`
          : ls === "started" ? `<span class="tag accent">In progress</span>`
          : `<span class="tag accent">Ready</span>`;
        const title = l.status === "ready" ? `<a href="#/lesson/${esc(l.id)}">${esc(l.title)}</a>` : `<span>${esc(l.title)}</span>`;
        const st = S.lessons[l.id];
        const sub = ls === "started" && st ? `<span class="meta-text">Level ${esc(st.levelUnlocked)} of 3 open</span>`
          : ls === "done" && st ? `<span class="meta-text">Completed <time datetime="${esc(fmtDate(st.completedAt))}">${esc(fmtDate(st.completedAt))}</time></span>` : "";
        return `<li class="cur-lesson is-${l.status === "ready" ? ls : "planned"}${isNext ? " is-next" : ""}"><span class="cur-lid">${esc(l.id)}</span>
          <span class="cur-ltitle">${title}${sub}</span><span class="cur-ltag">${isNext ? `<span class="tag accent cur-nexttag">Next</span>` : ""}${tag}</span></li>`;
      }).join("")}</ol>` : `<p class="muted cur-practice">Practice topic. Use the resources below; no lessons are planned.</p>`;
      const res = (t.resources || []).length ? `<details class="cur-res"><summary>Resources from your study list (${t.resources.length})</summary><ul>${t.resources.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>${r.by ? " <span class='muted'>(" + esc(r.by) + ")</span>" : ""}</li>`).join("")}</ul></details>` : "";
      const [cls, label] = STATE[state];
      used.add(state);
      const open = state === "current" || (!nextOpen && t === cur[0]);
      return `<details class="cur-topic is-${state}" id="topic-${esc(t.id)}"${open ? " open" : ""}>
        <summary class="cur-sum">
          <span class="cur-num" aria-hidden="true">${String(t.n).padStart(2, "0")}</span>
          <h2 class="cur-title"><span class="sr-only">Topic ${t.n}: </span>${esc(t.title)}</h2>
          ${t.goal ? `<span class="cur-desc">${esc(t.goal)}</span>` : ""}
          <span class="cur-meta">${meta}</span>
          <span class="cur-side"><span class="tag ${cls}">${state === "done" ? "✓ " : ""}${esc(label)}</span>
            ${total ? coreBar(pct, "Topic " + t.n + " lessons complete", state === "done") : ""}</span>
        </summary>
        <div class="cur-body">
          ${lessons}
          <h3 class="cur-h">Subtopics (${nSubs})</h3><ul class="cur-subs">${subs}</ul>
          ${res}
        </div>
      </details>`;
    }).join("");
    const map = (A.resumeConceptMap || []).map((m) => {
      const t = cur.find((x) => x.id === m.topic);
      return `<tr><td>${esc(m.term)}</td><td>${t ? `<a href="#/curriculum" data-act="jump" data-target="topic-${esc(t.id)}">Topic ${t.n}</a>` : esc(m.topic)}</td></tr>`;
    }).join("");
    return `<header class="cur-head"><h1>Curriculum</h1>
        <p class="cur-intro">${cur.length} topics from your study list, in the same order. ${nOrig} original subtopics are kept. ${nAdd} additions are marked <span class="tag add">addition</span>, each with a reason. Go at your own pace; there is no schedule.</p>
        <dl class="cur-stats">
          <div><dt>Topics</dt><dd>${cur.length}</dd></div>
          <div><dt>Subtopics</dt><dd>${nOrig + nAdd}</dd></div>
          <div><dt>Lessons ready</dt><dd>${nReady}<small> / ${metas.length} planned</small></dd></div>
          <div><dt>Lessons complete</dt><dd>${nDone}<small> / ${nReady}</small></dd></div>
        </dl>
        <p class="cur-legend meta-text">${Object.keys(STATE).filter((k) => used.has(k)).map((k) => `<span class="tag ${STATE[k][0]}">${esc(STATE[k][1])}</span>`).join(" ")}
          Select a topic to open or close it.</p>
      </header>
      <div class="cur-list">${topics}</div>
      <section class="card cur-terms"><h2>Terms from your resume</h2><p>Your <code>concepts-ai.html</code> explains the AI terms on your resume. Each term maps to the topic that teaches it.</p>
      <div class="table-wrap"><table><tr><th>Term</th><th>Topic</th></tr>${map}</table></div></section>`;
  }

  /* ------------------------------------------------------------- lesson */
  function renderBlock(b) {
    switch (b.type) {
      case "html": return b.html;
      case "note": return `<div class="note ${esc(b.kind)}">${b.title ? `<div class="note-title">${esc(b.title)}</div>` : ""}${b.html}</div>`;
      case "diagram": return `<figure class="diagram">${b.svg}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
      case "interactive": return `<div class="interactive" data-ix="${esc(b.id)}"></div>`;
      case "code": return `<pre class="code-block"${b.lang ? ` data-lang="${esc(b.lang)}"` : ""}><code class="lang-${esc(b.lang || "")}">${esc(b.code)}</code></pre>`;
      case "stop": return `<p class="stop-here">${esc(b.text || "Stop here")}</p>`;
      case "worked": return `<div class="worked"><p class="worked-kind">Worked example</p><h3>${esc(b.title)}</h3>${b.intro ? `<p>${b.intro}</p>` : ""}<ol class="worked-steps">${b.steps.map((s) => s.faded
        ? `<li class="faded"><span class="tag accent">Your turn</span> ${s.html}<textarea rows="2" aria-label="Your working for this step" placeholder="Write your working here first."></textarea><details><summary>Show the answer</summary><p>${s.answer}</p></details></li>`
        : `<li>${s.html}</li>`).join("")}</ol></div>`;
      default: return "";
    }
  }
  function renderCheck(lessonId, c) {
    const st = lessonState(lessonId).checks[c.id] || {};
    if (c.type === "mcq") {
      const done = st.result === "right";
      return `<div class="check" data-check="${esc(c.id)}"><p class="check-q"><strong class="check-kind">Check</strong> ${esc(c.q)}</p><div class="opts">${c.options.map((o, i) =>
        `<button type="button" data-act="mcq" data-lesson="${esc(lessonId)}" data-check="${esc(c.id)}" data-opt="${i}" class="${done && i === c.correct ? "right" : ""}">${esc(o)}</button>`).join("")}</div>
        <div class="feedback ${done ? "good" : ""}" aria-live="polite">${done ? "Correct. " + esc(c.explain) : ""}</div></div>`;
    }
    const rated = st.result;
    return `<div class="check recall" data-check="${esc(c.id)}"><p class="check-q"><strong class="check-kind">Recall</strong> ${esc(c.q)}</p>
      <textarea rows="3" aria-label="Your answer" placeholder="Type your answer before you look.">${esc(st.typed || "")}</textarea>
      <div class="row"><button type="button" data-act="recall-show" data-lesson="${esc(lessonId)}" data-check="${esc(c.id)}">Show the model answer</button></div>
      <div class="answer" ${rated ? "" : "hidden"}>${esc(c.answer)}
        <div class="row answer-rate"><span>Your answer had the main points?</span>
        <button type="button" data-act="recall-rate" data-r="good" data-lesson="${esc(lessonId)}" data-check="${esc(c.id)}">Yes</button>
        <button type="button" data-act="recall-rate" data-r="partial" data-lesson="${esc(lessonId)}" data-check="${esc(c.id)}">Partly or no</button></div></div>
      <div class="feedback ${rated ? "good" : ""}" aria-live="polite">${rated ? (rated === "good" ? "Recorded: you had it." : "Recorded. Read the level again later; the recall card will return in review.") : ""}</div></div>`;
  }
  function checkDone(lessonId, c) {
    const st = lessonState(lessonId).checks[c.id];
    return !!st && (c.type === "mcq" ? st.result === "right" : !!st.result);
  }
  function levelDone(lesson, lv) { return lv.checks.every((c) => checkDone(lesson.id, c)); }

  // The lesson header: status, check count and the level steps. afterCheck() refreshes them in place.
  function lessonStatusHtml(L, st) {
    const all = L.levels.flatMap((lv) => lv.checks);
    const n = all.filter((c) => checkDone(L.id, c)).length;
    const pct = all.length ? Math.round((n / all.length) * 100) : 0;
    const tag = st.completedAt ? `<span class="tag ok">Complete ${esc(fmtDate(st.completedAt))}</span>`
      : n ? `<span class="tag accent">In progress</span>` : `<span class="tag">Not started</span>`;
    // Mastery is the lowest level that all concepts of the lesson have reached.
    const cs = L.concepts || [];
    const low = cs.length ? Math.min(...cs.map((c) => (S.concepts[c.id] || {}).level || 0)) : 0;
    const lvl = LEVELS.find((x) => x.n === low);
    return `${tag}<span class="lesson-count">${n} of ${all.length} checks done</span>
      <a class="lesson-mastery" href="#/mastery" title="The lowest mastery level of the ${cs.length} concepts in this lesson">Mastery: ${lvl ? esc(lvl.name) : "not started"}</a>
      <div class="progress${n === all.length ? " ok" : ""}" role="progressbar" aria-label="Checks done in this lesson" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${n}"><i style="width:${pct}%"></i></div>`;
  }
  function lessonStepsHtml(L, st) {
    const cur = L.levels.find((lv) => lv.n <= st.levelUnlocked && !levelDone(L, lv));
    return L.levels.map((lv) => {
      const locked = lv.n > st.levelUnlocked, done = !locked && levelDone(L, lv);
      const state = locked ? "locked" : done ? "done" : "open";
      return `<li class="${state}"${cur === lv ? ` aria-current="step"` : ""}><a href="#/lesson/${esc(L.id)}" data-act="jump" data-target="sec-l${lv.n}">
        <span class="step-num" aria-hidden="true">${done ? "✓" : lv.n}</span><span class="step-text"><span class="step-name">Level ${lv.n}: ${esc(lv.name)}</span>
        <span class="step-state">${done ? "Done" : locked ? "Locked" : "Open"}</span></span></a></li>`;
    }).join("");
  }
  function updateLessonProgress(L) {
    const box = document.getElementById("lesson-status");
    if (!box || box.dataset.lesson !== L.id) return;
    const st = lessonState(L.id);
    box.innerHTML = lessonStatusHtml(L, st);
    const steps = document.getElementById("lesson-steps");
    if (steps) steps.innerHTML = lessonStepsHtml(L, st);
  }

  function pageLesson(id) {
    const L = A.lessons[id];
    if (!L) return `<h1>Lesson not found</h1><p>Lesson ${esc(id)} is not built yet. <a href="#/curriculum">Back to the curriculum</a>.</p>`;
    const st = lessonState(id); save();
    const topic = (A.curriculum || []).find((t) => t.id === L.topic);
    const nLevels = L.levels.length;
    const allDone = L.levels.every((lv) => levelDone(L, lv));
    const jump = (target, text, cls) => `<a href="#/lesson/${esc(id)}" data-act="jump" data-target="${target}"${cls ? ` class="${cls}"` : ""}>${text}</a>`;
    const toc = [["sec-why", "Why it matters"], ["sec-debug", "Debugging"], ["sec-recall", "Recall"], ["sec-mis", "Misconceptions"],
      ["sec-interview", "Interview"], ["sec-res", "Resources"], ["sec-summary", "Summary"], ["sec-teach", "Teach-back"], ["sec-ticket", "Build it"], ["sec-complete", "Complete"]]
      .map((x) => jump(x[0], esc(x[1]))).join("");

    const levels = L.levels.map((lv) => {
      const locked = lv.n > st.levelUnlocked;
      const done = !locked && levelDone(L, lv);
      const nextLv = L.levels.find((x) => x.n === lv.n + 1);
      let next = "";
      if (!locked && done && lv.n === st.levelUnlocked && nextLv) {
        next = `<div class="level-next"><p><strong>Level ${lv.n} is done.</strong> Next: level ${nextLv.n}, ${esc(nextLv.name)}.</p>
          <button type="button" class="primary" data-act="unlock" data-lesson="${esc(id)}" data-level="${nextLv.n}">Open level ${nextLv.n}</button></div>`;
      } else if (!nextLv && allDone && !st.completedAt) {
        next = `<div class="level-next"><p><strong>All checks are done.</strong> Complete the lesson to put its recall cards into the review queue.</p>
          ${jump("sec-complete", "Go to Complete the lesson", "btn primary")}</div>`;
      }
      const state = done ? ["ok", "Done"] : locked ? ["", "Locked"] : ["accent", "Open"];
      return `<section class="level section${locked ? " locked" : ""}${done ? " done" : ""}" id="sec-l${lv.n}" tabindex="-1" aria-labelledby="sec-l${lv.n}-h">
        <header><div class="level-title"><p class="level-kicker">Level ${lv.n} of ${nLevels}</p><h2 id="sec-l${lv.n}-h">${esc(lv.name)}</h2>
          ${lv.tagline ? `<p class="level-tagline">${esc(lv.tagline)}</p>` : ""}</div><span class="tag ${state[0]}">${state[1]}</span></header>
        ${locked ? `<div class="locked-msg"><p>Finish the checks of level ${lv.n - 1} to open this level.</p><button type="button" data-act="unlock" data-lesson="${esc(id)}" data-level="${lv.n}">I know this already: open it</button></div>` : ""}
        <div class="body">${lv.blocks.map(renderBlock).join("")}
          <p class="stop-here">Check yourself before you continue</p>
          <div class="level-checks">${lv.checks.map((c) => renderCheck(id, c)).join("")}</div>${next}</div></section>`;
    }).join("");

    const debug = (L.debugging || []).map((d, i) => `<div class="debug-case"><p class="debug-kind">Case ${i + 1}</p><h3>${esc(d.title)}</h3>
      <p class="debug-symptom"><strong>Symptom.</strong> ${esc(d.symptom)}</p>
      ${d.evidence ? `<pre class="code-block" data-lang="evidence"><code>${esc(d.evidence)}</code></pre>` : ""}
      <div class="debug-hints">${d.hints.map((h, k) => `<details><summary>Hint ${k + 1}</summary><p>${esc(h)}</p></details>`).join("")}</div>
      <textarea rows="2" aria-label="Your diagnosis for ${esc(d.title)}" placeholder="Your diagnosis, before you open the answer."></textarea>
      <details class="debug-answer"><summary>Show the explanation</summary><p>${esc(d.answer)}</p></details></div>`).join("");

    const recall = (L.recall || []).map((r) => `<li>${esc(r.q)}</li>`).join("");
    const mis = (L.misconceptions || []).map((m) => `<tr><td>${esc(m.wrong)}</td><td>${esc(m.right)}</td></tr>`).join("");
    const iv = (L.interview || []).map((q) => `<details><summary>${esc(q.q)}</summary><p><strong>Answer outline.</strong> ${esc(q.outline)}</p></details>`).join("");
    const res = (L.resources || []).map((r) => `<li class="resource"><h3>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</h3>
      <p class="resource-meta">${esc(r.by)}${r.kind ? ` · ${esc(r.kind)}` : ""}</p>
      <dl class="resource-facts">${r.when ? `<div><dt>When</dt><dd>${esc(r.when)}</dd></div>` : ""}${r.why ? `<div><dt>Why</dt><dd>${esc(r.why)}</dd></div>` : ""}</dl>
      ${r.note ? `<div class="note simplification"><p>${esc(r.note)}</p></div>` : ""}
      ${(r.watchFor || []).length ? `<p class="resource-watch">Questions to answer while you watch or read:</p><ul>${r.watchFor.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</li>`).join("");
    const tickets = (L.tickets || []).map((tid) => {
      const t = A.tickets[tid]; if (!t) return "";
      return `<div class="ticket-link"><div><h3>${esc(t.id)}: ${esc(t.title)}</h3><p>${esc(t.mode)}</p></div><a class="btn primary" href="#/ticket/${esc(t.id)}">Open the ticket</a></div>`;
    }).join("");

    // Previous and next lesson, in curriculum order, for the lessons that are built.
    const built = allLessonsMeta().filter((m) => A.lessons[m.id]);
    const at = built.findIndex((m) => m.id === id);
    const prev = at > 0 ? built[at - 1] : null, nextL = at >= 0 ? built[at + 1] : null;
    const pager = `<nav class="lesson-pager" aria-label="Other lessons">
      ${prev ? `<a class="pager-prev" href="#/lesson/${esc(prev.id)}"><span class="pager-dir">Previous lesson</span><span class="pager-title">${esc(prev.id)} ${esc(prev.title)}</span></a>` : `<span></span>`}
      ${nextL ? `<a class="pager-next" href="#/lesson/${esc(nextL.id)}"><span class="pager-dir">Next lesson</span><span class="pager-title">${esc(nextL.id)} ${esc(nextL.title)}</span></a>`
        : `<a class="pager-next" href="#/curriculum"><span class="pager-dir">Next</span><span class="pager-title">Back to the curriculum</span></a>`}</nav>`;

    return `${storageBanner()}
      <header class="lesson-head">
        <p class="lesson-eyebrow">${topic ? `Topic ${esc(topic.n)}: ${esc(topic.title)} · ` : ""}Lesson ${esc(L.id)}</p>
        <h1>${esc(L.title)}</h1>
        <p class="lesson-objective"><strong>Objective.</strong> ${esc(L.objective)}</p>
        <div class="lesson-status" id="lesson-status" data-lesson="${esc(id)}">${lessonStatusHtml(L, st)}</div>
        ${(L.prerequisites || []).length ? `<details class="lesson-prereq"><summary>Prerequisites</summary><ul>${L.prerequisites.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></details>` : ""}
        <ol class="lesson-steps" id="lesson-steps" aria-label="Levels">${lessonStepsHtml(L, st)}</ol>
        <nav class="toc lesson-toc" aria-label="Lesson sections"><span class="toc-label">On this page</span>${toc}</nav>
      </header>
      <section class="section lesson-part" id="sec-why" tabindex="-1"><h2>Why it matters</h2>${L.whyItMatters}
        <p class="concepts-label">Concepts in this lesson</p><ul class="concept-chips">${L.concepts.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul></section>
      ${levels}
      <p class="lesson-divider">Practise and review</p>
      <section class="section lesson-part" id="sec-debug" tabindex="-1"><h2>Debugging scenarios</h2><p class="part-lead">Diagnose first. Open one hint at a time.</p>${debug}</section>
      <section class="section lesson-part" id="sec-recall" tabindex="-1"><h2>Recall cards</h2><p class="part-lead">These questions go into your review queue when you complete the lesson. They return on Day 1, 2, 4, 7 and 14.</p><ol class="recall-list">${recall}</ol></section>
      <section class="section lesson-part" id="sec-mis" tabindex="-1"><h2>Common misconceptions</h2><div class="table-wrap"><table><tr><th>Wrong idea</th><th>Better idea</th></tr>${mis}</table></div></section>
      <section class="section lesson-part" id="sec-interview" tabindex="-1"><h2>Interview questions</h2><p class="part-lead">Answer out loud first, in about two minutes. Then open the outline.</p>${iv}</section>
      <section class="section lesson-part" id="sec-res" tabindex="-1"><h2>Resources</h2><p class="part-lead">Every link was checked when this lesson was written. Timestamps are given only when they were checked.</p><ul class="resource-list">${res}</ul></section>
      <p class="lesson-divider">Finish the lesson</p>
      <section class="section lesson-part" id="sec-summary" tabindex="-1"><h2>Summary</h2>${L.summary}</section>
      <section class="section lesson-part" id="sec-teach" tabindex="-1"><h2>Teach-back</h2><p>${esc(L.teachBack)}</p>
        <textarea rows="6" data-save="teach" data-lesson="${esc(id)}" aria-label="Your teach-back" placeholder="Write your explanation here.">${esc(st.teachBack || "")}</textarea>
        <div class="row"><button type="button" data-act="teach-journal" data-lesson="${esc(id)}">Save to the journal</button>
        <button type="button" data-act="teach-copy" data-lesson="${esc(id)}">Copy with a review prompt</button></div></section>
      <section class="section lesson-part" id="sec-ticket" tabindex="-1"><h2>Build it</h2>${tickets}</section>
      <section class="section lesson-complete${st.completedAt ? " is-complete" : allDone ? " is-ready" : ""}" id="sec-complete" tabindex="-1"><h2>Complete the lesson</h2>
        ${st.completedAt ? `<p>You completed this lesson on ${esc(fmtDate(st.completedAt))}. Your recall cards are in the review queue.</p>`
          : `<p>${allDone ? "All checks are done." : `Finish all checks of the ${nLevels} levels first.`} When you complete the lesson, its recall cards go into the review queue.</p>
             <button type="button" class="primary" data-act="complete" data-lesson="${esc(id)}" ${allDone ? "" : "disabled"}>Complete lesson ${esc(id)}</button>`}</section>
      ${pager}`;
  }

  /* ------------------------------------------------------------- review */
  let reviewReveal = false;
  // The text in #review-typed. The reveal step renders the page again, so keep the text here.
  let reviewTyped = "";
  // Helpers for the review, ticket, mastery, journal, interview and workflow pages.
  function lessonName(id) {
    if (A.lessons[id]) return A.lessons[id].title;
    const m = allLessonsMeta().find((l) => l.id === id);
    return m ? m.title : "";
  }
  function plainText(html) {
    return String(html || "").replace(/<\/?(p|div|li|ul|ol|br|h[1-6]|pre|table|tr|td|th)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  }
  function firstSentence(text) {
    const m = text.match(/^.+?[.!?](?=\s|$)/);
    return m ? m[0] : text;
  }
  function pageReview() {
    const due = dueCards();
    const t = today();
    const all = Object.keys(S.reviews).sort((a, b) => S.reviews[a].due.localeCompare(S.reviews[b].due) || a.localeCompare(b));
    const overdue = due.filter((k) => S.reviews[k].due < t).length;
    const upcoming = all.filter((k) => S.reviews[k].due > t);
    const nextDue = upcoming.length ? S.reviews[upcoming[0]].due : "";
    const dueTag = (c) => c.due < t ? `<span class="rv-due is-overdue"><span class="status-dot warn"></span>Overdue since ${esc(c.due)}</span>`
      : c.due === t ? `<span class="rv-due is-today"><span class="status-dot accent"></span>Due today</span>`
      : `<span class="rv-due"><span class="status-dot"></span>Due ${esc(c.due)}</span>`;

    // The schedule: one group for each due date. Overdue and today come first.
    const groups = [];
    all.forEach((k) => {
      const d = S.reviews[k].due;
      const key = d < t ? "overdue" : d;
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key: key, items: [] }; groups.push(g); }
      g.items.push(k);
    });
    const groupTitle = (g) => g.key === "overdue" ? "Overdue" : g.key === t ? "Due today" : g.key;
    const sched = groups.map((g) => `<li class="rv-group${g.key === "overdue" ? " is-overdue" : g.key === t ? " is-today" : ""}">
      <h3 class="rv-group-title">${esc(groupTitle(g))} <span class="rv-count">${g.items.length} ${g.items.length === 1 ? "card" : "cards"}</span></h3>
      <ul class="rv-items">${g.items.map((k) => {
        const r = findRecall(k), c = S.reviews[k];
        return `<li><span class="rv-item-q">${esc(r ? r.q : k)}</span>
          <span class="rv-item-meta">${r ? "Lesson " + esc(r.lesson) + " · " : ""}${esc(stepLabel(c.step))}${g.key === "overdue" ? " · was due " + esc(c.due) : ""}</span></li>`;
      }).join("")}</ul></li>`).join("");

    let card;
    if (due.length) {
      const k = due[0], r = findRecall(k), c = S.reviews[k];
      const rates = [
        ["again", "Needs another review", "Again: start from Day 1."],
        ["hard", "Struggled", "Hard: repeat the same interval."],
        ["good", "Remembered", "Good: go to the next interval."]
      ];
      card = `<section class="flash rv-card" aria-labelledby="rv-q">
        <div class="rv-meta">${dueTag(c)}<span class="tag">${esc(stepLabel(c.step))}</span>
          ${r ? `<a class="rv-topic" href="#/lesson/${esc(r.lesson)}">Lesson ${esc(r.lesson)}: ${esc(lessonName(r.lesson))}</a>` : ""}</div>
        <p class="rv-kicker">Recall question</p>
        <h2 class="q" id="rv-q">${esc(r ? r.q : k)}</h2>
        <label for="review-typed">Your answer</label>
        <textarea rows="4" id="review-typed" placeholder="Type your answer first. It makes the memory stronger.">${esc(reviewTyped)}</textarea>
        ${reviewReveal ? `<div class="answer rv-answer" id="rv-answer" tabindex="-1"><p class="rv-kicker">Answer</p><p>${esc(r ? r.a : "")}</p></div>
          <fieldset class="rv-rate"><legend>How well did you remember?</legend>
            <div class="rv-rate-grid">${rates.map((x) => `<button type="button" class="rv-rate-btn${x[0] === "good" ? " primary" : ""}" data-act="rate" data-card="${esc(k)}" data-r="${x[0]}">
              <span class="rv-rate-name">${esc(x[1])}</span><span class="rv-rate-sub">${esc(x[2])} Next: ${esc(schedule(c, x[0], t).due)}.</span></button>`).join("")}</div>
          </fieldset>`
          : `<div class="row rv-actions"><button type="button" class="primary lg" data-act="reveal">Show the answer</button>
            <span class="rv-hint">Try to answer before you look.</span></div>`}
      </section>`;
    } else if (all.length) {
      card = `<div class="empty-state rv-empty"><h2>Nothing is due today</h2><p>You are up to date. The next card is due on ${esc(nextDue)}.</p></div>`;
    } else {
      card = `<div class="empty-state rv-empty"><h2>No review cards yet</h2><p>Complete a lesson to add its recall cards to this queue.</p>
        <a class="btn" href="#/curriculum">Go to the curriculum</a></div>`;
    }
    const stat = (n, label, cls) => `<li class="${cls || ""}"><b>${n}</b><span>${label}</span></li>`;
    return `${storageBanner()}<header class="rv-head"><h1>Review</h1>
      <p class="rv-lead">Answer one recall card at a time. Then say how well you remembered. The app sets the next date.</p></header>
      ${all.length ? `<ul class="rv-stats" aria-label="Review summary">
        ${stat(due.length, due.length === 1 ? "card due now" : "cards due now", due.length ? "is-due" : "")}
        ${overdue ? stat(overdue, "overdue", "is-overdue") : ""}
        ${stat(all.length, all.length === 1 ? "card in total" : "cards in total")}
        ${nextDue ? stat(`<time datetime="${esc(nextDue)}">${esc(nextDue)}</time>`, "next upcoming date") : ""}</ul>` : ""}
      ${card}
      ${all.length ? `<section class="rv-schedule" aria-labelledby="rv-sched-h"><h2 id="rv-sched-h">Schedule</h2><ol class="rv-groups">${sched}</ol></section>` : ""}
      <section class="rv-how" aria-labelledby="rv-how-h"><h2 id="rv-how-h">How the schedule works</h2>
        <ol class="rv-steps" aria-label="Review intervals">${SR_OFFSETS.map((d) => `<li>Day ${d}</li>`).join("")}<li>Every 30 days</li></ol>
        <p>Recall cards return on Day 1, 2, 4, 7 and 14 after you complete a lesson. <strong>Good</strong> moves the card to the next day. <strong>Hard</strong> repeats the same interval. <strong>Again</strong> starts from Day 1.
        After Day 14, a card returns once every 30 days <span class="tag add">addition</span> <small class="muted">so that old topics do not disappear.</small></p></section>`;
  }

  /* ------------------------------------------------------------ tickets */
  const TICKET_STATUS_TAG = { "not started": "", "in progress": "accent", "in review": "warn", "done": "ok" };
  function ticketStatusTag(status) {
    const s = status || "not started";
    return `<span class="tag tk-status ${TICKET_STATUS_TAG[s] || ""}">${s === "done" ? "✓ " : ""}${esc(s)}</span>`;
  }
  function pageTickets() {
    const list = Object.values(A.tickets).sort((a, b) => a.id.localeCompare(b.id));
    const statusOf = (t) => (S.tickets[t.id] || {}).status || "not started";
    const done = list.filter((t) => statusOf(t) === "done").length;
    const next = list.find((t) => statusOf(t) === "in progress" || statusOf(t) === "in review") || list.find((t) => statusOf(t) !== "done");
    const rows = list.map((t) => {
      const s = statusOf(t);
      return `<li class="tk-item${t === next ? " is-next" : ""}${s === "done" ? " is-done" : ""}">
        <div class="tk-item-main">
          <p class="tk-item-top"><span class="tk-id">${esc(t.id)}</span>${ticketStatusTag(s)}${t === next ? `<span class="tk-next-label">Next up</span>` : ""}</p>
          <h2 class="tk-item-title"><a href="#/ticket/${esc(t.id)}">${esc(t.title)}</a></h2>
          <p class="tk-item-obj">${esc(firstSentence(plainText(t.fields && t.fields.objective)))}</p>
          <p class="tk-item-meta"><a href="#/lesson/${esc(t.lesson)}">Lesson ${esc(t.lesson)}: ${esc(lessonName(t.lesson))}</a><span>Project phase ${esc(t.phase)}</span></p>
        </div>
        <a class="btn${t === next ? " primary" : ""} tk-open" href="#/ticket/${esc(t.id)}" aria-label="Open ticket ${esc(t.id)}">${s === "done" ? "View" : s === "not started" ? "Open" : "Continue"}</a>
      </li>`;
    }).join("");
    return `<header class="tk-head"><h1>Tickets</h1>
      <p class="tk-lead">Each ticket is a real piece of the <strong>Company AI Assistant</strong>. You build it in VS Code with Claude Code. See <a href="#/workflow">VS Code workflow</a>.</p></header>
      ${list.length ? `<div class="tk-summary"><span>${done} of ${list.length} done</span><div class="progress ok" aria-hidden="true"><i style="width:${(done / list.length) * 100}%"></i></div></div>
      <ul class="tk-list">${rows}</ul>`
        : `<div class="empty-state"><h2>No tickets yet</h2><p>Tickets appear here when their lessons are built.</p></div>`}
      <div class="card tk-phases"><h2>Project phases</h2><ol>
        <li>Command-line tool and LLM client layer (Topic 1, 2).</li><li>FastAPI service, document ingestion, pgvector search, answers with citations (Topic 3, 9, 10).</li>
        <li>Tools, agent loop, MCP, human approval (Topic 4).</li><li>Evals and tracing (Topic 5).</li>
        <li>Security: prompt injection, PII, tenant isolation (Topic 7).</li><li>Model routing, fallback, caching, cost control, deployment (Topic 6, 8).</li></ol>
        <p class="muted">The project uses a fictional company and fictional documents. Do not put real company data into it.</p></div>`;
  }
  const TICKET_FIELDS = [["objective", "Objective and real-world problem"], ["context", "Context in the project"], ["prerequisites", "Prerequisites"],
    ["requirements", "Functional and technical requirements"], ["acceptance", "Acceptance criteria"], ["milestones", "Milestones"], ["files", "Likely files"],
    ["tests", "Test cases and expected behavior"], ["nfr", "Security, reliability, performance and cost"], ["questions", "Questions to answer after the ticket"],
    ["checklist", "Completion checklist and review criteria"]];
  // The ticket fields keep their Markdown section numbers (2 to 12). The groups put them into four areas.
  const TICKET_GROUPS = [
    ["tk-g-understand", "Understand the task", ["objective", "context", "prerequisites"]],
    ["tk-g-build", "What to build", ["requirements", "acceptance", "milestones", "files"]],
    ["tk-g-test", "Test and check", ["tests", "nfr"]],
    ["tk-g-finish", "Finish", ["questions", "checklist"]]
  ];
  function pageTicket(id) {
    const t = A.tickets[id];
    if (!t) return `<div class="empty-state"><h1>Ticket not found</h1><p>No ticket has the ID ${esc(id || "")}.</p><a class="btn" href="#/tickets">Back to the tickets</a></div>`;
    const st = ticketState(id);
    const fieldHtml = (key) => {
      const i = TICKET_FIELDS.findIndex((f) => f[0] === key);
      return `<section class="ticket-field tk-field tk-f-${key}" aria-labelledby="tk-f-${key}"><h3 id="tk-f-${key}"><span class="num">${i + 2}</span>${esc(TICKET_FIELDS[i][1])}</h3>
        <div class="tk-field-body">${t.fields[key]}</div></section>`;
    };
    const groups = TICKET_GROUPS.map((g) => `<section class="tk-group" id="${g[0]}" aria-labelledby="${g[0]}-h"><h2 id="${g[0]}-h">${esc(g[1])}</h2>
      ${g[2].map(fieldHtml).join("")}</section>`).join("");
    const statuses = ["not started", "in progress", "in review", "done"];
    const handoff = A.md.HANDOFF_SECTIONS.map((s) => `<div class="tk-h-field"><label for="h-${s[0]}">${esc(s[1])}<small>${esc(s[2])}</small></label>
      <textarea id="h-${s[0]}" rows="${s[0] === "code" || s[0] === "tests" ? 6 : 3}" data-save="handoff" data-ticket="${esc(id)}" data-field="${s[0]}">${esc(st.handoff[s[0]] || "")}</textarea></div>`).join("");
    const jump = (target, text) => `<a href="#/ticket/${esc(id)}" data-act="jump" data-target="${target}">${esc(text)}</a>`;
    return `${storageBanner()}
      <p class="tk-back"><a href="#/tickets">← All tickets</a></p>
      <header class="tk-ticket-head">
        <p class="tk-item-top"><span class="tk-id">${esc(t.id)}</span><span class="mode-chip">${esc(t.mode)}</span></p>
        <h1>${esc(t.title)}</h1>
        <p class="tk-item-meta"><a href="#/lesson/${esc(t.lesson)}">Lesson ${esc(t.lesson)}: ${esc(lessonName(t.lesson))}</a><span>Project phase ${esc(t.phase)}</span>${t.estimate ? `<span>${esc(t.estimate)}</span>` : ""}</p>
      </header>
      <section class="tk-panel" aria-label="Your work on this ticket">
        <div class="tk-panel-status"><label for="t-status">Status</label><select id="t-status" data-save="tstatus" data-ticket="${esc(id)}">${statuses.map((s) => `<option ${s === st.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="tk-panel-actions">
          <button type="button" class="primary" data-act="ticket-copy" data-ticket="${esc(id)}">Copy the ticket as Markdown</button>
          <a class="btn" href="#/ticket/${esc(id)}" data-act="jump" data-target="handoff">Go to the handoff</a></div>
        <p class="tk-panel-note">Paste the ticket into Claude Code, or open <code>project/tickets/${esc(id)}.md</code>. It is the same text.</p>
      </section>
      <nav class="toc tk-toc" aria-label="Ticket sections">${TICKET_GROUPS.map((g) => jump(g[0], g[1])).join("")}${jump("handoff", "Handoff")}</nav>
      ${groups}
      <section class="tk-handoff" id="handoff" aria-labelledby="tk-handoff-h"><h2 id="tk-handoff-h">Return to the classroom: handoff</h2>
        <p>Fill this in here, or in <code>project/handoffs/${esc(id)}-handoff.md</code> in VS Code and import it. It saves while you type.</p>
        ${handoff}
        <div class="row tk-handoff-actions">
          <button type="button" class="primary" data-act="handoff-copy" data-ticket="${esc(id)}">Copy the handoff and review prompt</button>
          <button type="button" data-act="handoff-download" data-ticket="${esc(id)}">Download as .md</button>
          <input type="file" id="handoff-file" class="sr-only" accept=".md,text/markdown,text/plain" data-ticket="${esc(id)}"><label class="btn" for="handoff-file">Import a handoff .md</label>
        </div>
        <div class="note fact"><div class="note-title">How the review works</div><p>Paste the copied text into a Claude chat (or ask Claude Code in review mode). The prompt asks Claude to check your work against the acceptance criteria, ask you three questions and suggest a mastery level. Then record the result on the <a href="#/mastery">Mastery</a> page.</p></div>
      </section>`;
  }
  function parseHandoffMd(text) {
    const out = {};
    const parts = text.split(/^## /m).slice(1);
    parts.forEach((p) => {
      const nl = p.indexOf("\n");
      const title = p.slice(0, nl).trim();
      const body = p.slice(nl + 1).replace(/<!--[\s\S]*?-->/g, "").trim();
      const sec = A.md.HANDOFF_SECTIONS.find((s) => s[1].toLowerCase() === title.toLowerCase());
      if (sec && body && body !== "_(empty)_") out[sec[0]] = body;
    });
    return out;
  }

  /* ------------------------------------------------------------ mastery */
  function pageMastery() {
    const recentFrom = addDays(today(), -7);
    const lessons = Object.values(A.lessons).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const dueByLesson = {};
    dueCards().forEach((k) => { const r = findRecall(k); if (r) dueByLesson[r.lesson] = (dueByLesson[r.lesson] || 0) + 1; });
    const info = (c) => {
      const m = S.concepts[c.id] || { level: 0, evidence: [] };
      const last = m.evidence.length ? fmtDate(m.evidence[m.evidence.length - 1].date) : "";
      return { m: m, recent: !!last && last >= recentFrom };
    };
    // States come only from saved data. A finished lesson gives at most level 2.
    const states = (x) => {
      const out = [];
      if (x.m.level === 0) out.push(["", "Not started"]);
      if (x.recent) out.push(["info", "Recently learned"]);
      if (x.m.level === 4) out.push(["accent", "Applied in code"]);
      if (x.m.level >= 5) out.push(["ok", "Strongly understood"]);
      return out;
    };
    const meter = (lvl) => `<span class="ms-meter" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map((n) => `<i class="${n <= lvl ? "on" : ""}"></i>`).join("")}</span>`;
    const concept = (c) => {
      const x = info(c), m = x.m;
      const ev = m.evidence.slice().reverse().map((e) => `<li><time datetime="${esc(fmtDate(e.date))}">${fmtDate(e.date)}</time> · level ${e.level} (${esc(A.md.LEVEL_NAMES[e.level] || "")}). ${esc(e.note)}</li>`).join("");
      return `<li class="ms-concept lvl-${m.level}">
        <div class="ms-c-head"><span class="ms-c-name">${esc(c.name)}</span>
          <span class="ms-c-level">${meter(m.level)}<span>Level ${m.level} · ${esc(A.md.LEVEL_NAMES[m.level])}</span></span></div>
        ${states(x).length ? `<p class="ms-c-states">${states(x).map((s) => `<span class="tag ${s[0]}">${esc(s[1])}</span>`).join("")}</p>` : ""}
        <div class="ms-c-more">
          ${ev ? `<details class="ms-ev"><summary>Evidence (${m.evidence.length})</summary><ul>${ev}</ul></details>` : ""}
          <details class="ms-claim"><summary>Record new evidence</summary>
            <div class="ms-claim-row">
              <div><label for="cl-l-${esc(c.id)}">Level</label><select id="cl-l-${esc(c.id)}" data-claim-level="${esc(c.id)}">${LEVELS.map((l) => `<option value="${l.n}" ${l.n === Math.min(6, m.level + 1) ? "selected" : ""}>${l.n}. ${esc(l.name)}</option>`).join("")}</select></div>
              <div class="ms-claim-note"><label for="cl-n-${esc(c.id)}">Evidence (required)</label><input type="text" id="cl-n-${esc(c.id)}" data-claim-note="${esc(c.id)}" placeholder="What did you do?"></div>
              <button type="button" data-act="claim" data-concept="${esc(c.id)}">Record</button></div></details>
        </div></li>`;
    };
    const all = lessons.flatMap((L) => L.concepts.map(info));
    const count = (fn) => all.filter(fn).length;
    const summary = [
      ["", "Not started", count((x) => x.m.level === 0)],
      ["info", "Recently learned (7 days)", count((x) => x.recent)],
      ["accent", "Applied in code", count((x) => x.m.level === 4)],
      ["warn", "Lessons ready for revision", Object.keys(dueByLesson).length],
      ["ok", "Strongly understood", count((x) => x.m.level >= 5)]
    ];
    const topics = (A.curriculum || []).map((tp, ti) => ({ tp: tp, n: tp.n || ti + 1, ls: lessons.filter((L) => L.topic === tp.id) }));
    const built = topics.filter((x) => x.ls.length);
    const topicHtml = built.map((x) => {
      const cs = x.ls.flatMap((L) => L.concepts.map(info));
      const dist = [0, 1, 2, 3, 4, 5, 6].map((n) => cs.filter((c) => c.m.level === n).length);
      return `<section class="ms-topic" aria-labelledby="ms-t-${esc(x.tp.id)}"><h2 id="ms-t-${esc(x.tp.id)}">Topic ${x.n}: ${esc(x.tp.title)}</h2>
        <ol class="ms-dist" aria-label="Concepts at each level">${dist.map((v, n) => `<li class="${v ? "has" : ""}"><b>${v}</b><span>${n} · ${esc(A.md.LEVEL_NAMES[n])}</span></li>`).join("")}</ol>
        ${x.ls.map((L) => `<section class="ms-lesson" aria-labelledby="ms-l-${esc(L.id).replace(/\./g, "-")}">
          <div class="ms-lesson-head"><h3 id="ms-l-${esc(L.id).replace(/\./g, "-")}"><a href="#/lesson/${esc(L.id)}">Lesson ${esc(L.id)}: ${esc(L.title)}</a></h3>
            ${dueByLesson[L.id] ? `<a class="tag warn" href="#/review">Ready for revision: ${dueByLesson[L.id]} due</a>` : ""}</div>
          <ul class="ms-concepts">${L.concepts.map(concept).join("")}</ul></section>`).join("")}</section>`;
    }).join("");
    const later = topics.length - built.length;
    return `${storageBanner()}<header class="ms-head"><h1>Mastery</h1>
      <p class="ms-lead">A level counts only with evidence. Levels 1 and 2 come from your checks. For levels 3 to 6, write what you did, for example "Drew the request lifecycle from memory on 3 Nov" or "T-001 review passed, link to notes".</p></header>
      <ul class="ms-summary" aria-label="Concept summary">${summary.map((s) => `<li class="ms-sum-${s[0] || "none"}"><b>${s[2]}</b><span>${esc(s[1])}</span></li>`).join("")}</ul>
      <details class="ms-scale-box"><summary>The seven levels and the evidence that counts</summary>
        <ol class="ms-scale" start="0"><li><span class="ms-n">0</span><span><strong>${esc(A.md.LEVEL_NAMES[0])}</strong>No evidence yet.</span></li>
        ${LEVELS.map((l) => `<li><span class="ms-n">${l.n}</span><span><strong>${esc(l.name)}</strong>${esc(l.how)}</span></li>`).join("")}</ol></details>
      ${topicHtml || `<div class="empty-state"><h2>No concepts yet</h2><p>Concepts appear here when their lessons are built.</p></div>`}
      ${later > 0 ? `<p class="muted ms-later">${later} more ${later === 1 ? "topic has" : "topics have"} no lessons yet. Their concepts appear here when the lessons are built.</p>` : ""}`;
  }

  /* ------------------------------------------------- journal, misconceptions */
  function pageJournal() {
    const ids = Object.keys(A.lessons).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const lessonOpts = ids.map((id) => `<option value="${esc(id)}">Lesson ${esc(id)}: ${esc(lessonName(id))}</option>`).join("");
    const kindName = (k) => k === "teach-back" ? "Teach-back" : k;
    const lessonLink = (id) => id ? `<a href="#/lesson/${esc(id)}">Lesson ${esc(id)}</a>` : "";
    const entries = S.journal.slice().reverse().map((j) => `<article class="jn-entry">
      <header class="jn-entry-meta"><time datetime="${esc(fmtDate(j.date))}">${fmtDate(j.date)}</time>${lessonLink(j.lesson)}${j.kind ? `<span class="tag accent">${esc(kindName(j.kind))}</span>` : ""}</header>
      <p class="jn-entry-text">${esc(j.text)}</p>
      <button type="button" class="tertiary sm jn-del" data-act="journal-del" data-id="${esc(j.id)}">Delete<span class="sr-only"> the entry from ${fmtDate(j.date)}</span></button></article>`).join("");
    const misItem = (m) => `<li class="jn-mis${m.resolved ? " is-resolved" : ""}">
      <p class="jn-mis-text">${esc(m.text)}</p>
      <p class="jn-mis-meta">${m.resolved ? `<span class="tag ok">✓ Resolved</span>` : `<span class="tag warn">Open</span>`}<time datetime="${esc(fmtDate(m.date))}">${fmtDate(m.date)}</time>${lessonLink(m.lesson)}</p>
      <div class="jn-mis-actions"><button type="button" class="sm" data-act="mis-toggle" data-id="${esc(m.id)}">${m.resolved ? "Mark open" : "Mark resolved"}</button>
      <button type="button" class="tertiary sm" data-act="mis-del" data-id="${esc(m.id)}">Delete</button></div></li>`;
    const all = S.misconceptions.slice().reverse();
    const open = all.filter((m) => !m.resolved), done = all.filter((m) => m.resolved);
    return `${storageBanner()}<header class="jn-head"><h1>Journal</h1>
      <p class="jn-lead">Your engineering notebook. Write in your own words. Only you see it.</p></header>
      <section class="jn-write" aria-labelledby="jn-new-h"><h2 id="jn-new-h">New entry</h2>
        <p class="jn-prompts">Ideas: what I learned · what confused me · a mistake I made · an implementation insight · a question for later · a personal note.</p>
        <label for="j-lesson">Lesson (optional)</label><select id="j-lesson"><option value="">No lesson</option>${lessonOpts}</select>
        <label for="j-text">Entry</label><textarea id="j-text" rows="8" placeholder="Today I learned that ..."></textarea>
        <div class="row jn-write-actions"><button type="button" class="primary" data-act="journal-add">Add entry</button></div></section>
      <section class="jn-list" aria-labelledby="jn-list-h"><h2 id="jn-list-h">Entries <span class="jn-count">${S.journal.length}</span></h2>
        ${entries || `<div class="empty-state"><h3>No entries yet</h3><p>Your first entry appears here. A teach-back that you save from a lesson also appears here.</p></div>`}</section>
      <section class="jn-misbox" aria-labelledby="misconceptions"><h2 id="misconceptions">My misconceptions</h2>
        <p>A wrong answer in a check is added here automatically. Add your own too. Resolve an item when you can explain why the wrong idea is wrong.</p>
        <div class="jn-mis-add"><label for="m-text">A wrong idea I had</label><textarea id="m-text" rows="2" placeholder="For example: a token is always one word."></textarea>
          <div class="row"><button type="button" data-act="mis-add">Add</button></div></div>
        ${all.length ? `<h3 class="jn-sub">Open <span class="jn-count">${open.length}</span></h3>
          ${open.length ? `<ul class="jn-mis-list">${open.map(misItem).join("")}</ul>` : `<p class="muted">No open misconceptions.</p>`}
          ${done.length ? `<h3 class="jn-sub">Resolved <span class="jn-count">${done.length}</span></h3><ul class="jn-mis-list">${done.map(misItem).join("")}</ul>` : ""}`
          : `<p class="muted">None yet.</p>`}</section>`;
  }

  /* ---------------------------------------------------------- interview */
  function pageInterview() {
    const lessons = Object.values(A.lessons).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const sid = (L) => "iv-" + String(L.id).replace(/\./g, "-");
    const nQ = lessons.reduce((s, L) => s + (L.interview || []).length, 0);
    const nD = lessons.reduce((s, L) => s + (L.debugging || []).length, 0);
    const question = (q, i) => `<li class="iv-q"><p class="iv-q-text">${esc(q.q)}</p>
      <details class="iv-reveal"><summary>Show the answer outline<span class="sr-only"> for question ${i + 1}</span></summary><p>${esc(q.outline)}</p></details></li>`;
    const scenario = (d) => `<article class="iv-debug"><h4>${esc(d.title)}</h4>
      <p><strong>Symptom.</strong> ${esc(d.symptom)}</p>
      ${d.evidence ? `<pre><code>${esc(d.evidence)}</code></pre>` : ""}
      ${(d.hints || []).map((h, i) => `<details class="iv-hint"><summary>Hint ${i + 1}</summary><p>${esc(h)}</p></details>`).join("")}
      <details class="iv-reveal"><summary>Show the explanation</summary><p>${esc(d.answer)}</p></details></article>`;
    const blocks = lessons.map((L) => `<section class="iv-lesson" id="${sid(L)}" aria-labelledby="${sid(L)}-h">
      <h2 id="${sid(L)}-h"><span class="iv-lesson-id">Lesson ${esc(L.id)}</span> ${esc(L.title)}</h2>
      ${(L.interview || []).length ? `<h3 class="iv-sub">Interview questions</h3><ol class="iv-qs">${L.interview.map(question).join("")}</ol>` : ""}
      ${(L.debugging || []).length ? `<h3 class="iv-sub">Debugging scenarios</h3><div class="iv-debugs">${L.debugging.map(scenario).join("")}</div>` : ""}
      ${L.teachBack ? `<div class="iv-teach"><h3 class="iv-sub">Teach-back</h3><p>${esc(L.teachBack)}</p>
        <p class="iv-teach-link"><a href="#/lesson/${esc(L.id)}">Write the teach-back in lesson ${esc(L.id)}</a></p></div>` : ""}</section>`).join("");
    return `<header class="iv-head"><h1>Interview prep</h1>
      <p class="iv-lead">Practise how you explain each concept. ${nQ} questions and ${nD} debugging scenarios from ${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}.</p></header>
      <div class="note fact iv-method"><div class="note-title">Method</div><ol><li>Read the question. Answer out loud for two minutes, or write it.</li><li>Open the outline. Mark what you missed.</li><li>Add each gap to your <a href="#/journal">journal</a> or misconceptions.</li><li>For design questions (Topic 8), draw the diagram first.</li></ol></div>
      ${lessons.length > 1 ? `<nav class="toc iv-toc" aria-label="Lessons on this page">${lessons.map((L) => `<a href="#/interview" data-act="jump" data-target="${sid(L)}">Lesson ${esc(L.id)}</a>`).join("")}</nav>` : ""}
      ${blocks || `<div class="empty-state"><h2>No questions yet</h2><p>Questions appear here when lessons are built.</p></div>`}
      <p class="muted iv-later">Questions from planned lessons appear here when the lessons are built.</p>`;
  }

  /* ----------------------------------------------------------- workflow */
  function pageWorkflow() {
    const modes = [
      ["Guided", "You are new to the concept.", "Explains the next step, gives a hint or a small example, and waits. You write the code.", "Mode: guided. I am on T-001 milestone 2. Explain what the response object contains and what I should print. Do not write llm.py for me."],
      ["Independent", "You know the concept and want to try alone.", "Answers only the questions you ask. No code unless you ask for a short snippet.", "Mode: independent. Only answer my questions. Question: how do I get the time of the first text delta from client.messages.stream?"],
      ["Debugging", "Something fails and you want to find out why.", "Asks for the error and the code, then asks questions that lead you to the cause. It does not fix it for you.", "Mode: debugging. My test test_max_tokens_marks_incomplete fails. Here is the output. Help me find the cause with questions."],
      ["Review", "You finished a milestone or the ticket.", "Reads your code against the ticket's acceptance and review criteria and lists findings. It does not change files.", "Mode: review. Review assistant/llm.py against tickets/T-001.md acceptance criteria 1 to 7. List findings by severity. Do not edit files."],
      ["Teach-back", "You want to prove you understand.", "You explain; it asks follow-up questions like an interviewer and names the gaps.", "Mode: teach-back. I will explain how streaming and TTFT work in my CLI. Ask me questions like an interviewer."]
    ];
    const steps = [
      ["Learn the concept", "In the academy, finish the lesson levels that the ticket needs."],
      ["Get the ticket", "Open the ticket page. Read the objective, the requirements and the acceptance criteria."],
      ["Open VS Code", "In a terminal: <code>code ~/Documents/ai-academy/project</code>. This opens the project in VS Code."],
      ["Start Claude Code", "In the VS Code terminal, start Claude Code: <code>claude</code>. Tell it the mode, the ticket and the milestone, for example: <code>Mode: guided. Ticket tickets/T-001.md, milestone 1.</code>"],
      ["Implement", "Write the code yourself. Change mode when you need to (for example, to debugging)."],
      ["Test", "Run the tests: <code>pytest</code>. When the ticket is done, ask for a review: <code>Mode: review. Ticket T-001.</code> Fix what you agree with."],
      ["Complete the handoff", "Fill in <code>handoffs/T-001-handoff.md</code> (in VS Code or on the ticket page). Copy it with the review prompt and paste it into a Claude chat."],
      ["Return for review", "Back in the academy: set the ticket status to done, record mastery evidence, and add journal notes."]
    ];
    return `<header class="wf-head"><h1>VS Code workflow</h1>
      <p class="wf-lead">The academy teaches. VS Code is where you build. Claude Code is your pair programmer, in a mode you choose. The file <code>project/CLAUDE.md</code> tells Claude Code these rules, so you do not have to repeat them.</p></header>
      <section class="wf-loop" aria-labelledby="wf-loop-h"><h2 id="wf-loop-h">The loop for one ticket</h2>
        <ol class="wf-flow">${steps.map((x, i) => `<li class="wf-step"><span class="wf-n" aria-hidden="true">${i + 1}</span><div><h3>${esc(x[0])}</h3><p>${x[1]}</p></div></li>`).join("")}</ol>
        <p class="wf-links"><a class="btn primary" href="#/tickets">Open the tickets</a> <a class="btn" href="#/review">Go to review</a></p></section>
      <section class="wf-modes" aria-labelledby="wf-modes-h"><h2 id="wf-modes-h">The five modes</h2>
        <ul class="wf-mode-grid">${modes.map((m) => `<li class="wf-mode"><h3>${esc(m[0])}</h3>
          <dl><dt>Use it when</dt><dd>${esc(m[1])}</dd><dt>Claude Code</dt><dd>${esc(m[2])}</dd><dt>Example prompt</dt><dd><pre class="wf-prompt"><code>${esc(m[3])}</code></pre></dd></dl></li>`).join("")}</ul></section>
      <div class="note warn"><div class="note-title">Rule for every mode</div><p>Claude Code does not silently write a whole feature. If you want it to write code for you, say so explicitly ("write this function"), and then read every line of it before you continue. The goal is that you can explain all of the code in an interview.</p></div>
      <section class="card wf-safety" aria-labelledby="wf-safety-h"><h2 id="wf-safety-h">Safety in the project</h2><ul>
        <li>Put the API key only in the environment variable <code>ANTHROPIC_API_KEY</code>, for example in <code>project/.env</code>. <code>.gitignore</code> already excludes <code>.env</code>.</li>
        <li>Use <code>claude-haiku-5-5</code> for repeated manual tests. Unit tests make no paid calls.</li>
        <li>Use only the fictional company data in the project. Never copy real work data into it.</li>
        <li>You decide when to commit. Claude Code commits only when you ask.</li></ul></section>`;
  }

  /* ----------------------------------------------------------- progress */
  let resetArmed = false;
  // A backup file that the user chose but did not confirm yet: { state, name }.
  let pendingImport = null;
  // Counts of each kind of saved data. The import confirm step shows them.
  function stateCounts(x) {
    const ids = Object.keys(x.lessons || {});
    return [
      ["Lessons complete", ids.filter((id) => (x.lessons[id] || {}).completedAt).length],
      ["Recall cards", Object.keys(x.reviews || {}).length],
      ["Tickets with a status", Object.keys(x.tickets || {}).length],
      ["Concepts with a level", Object.keys(x.concepts || {}).length],
      ["Journal entries", (x.journal || []).length],
      ["Misconceptions", (x.misconceptions || []).length]
    ];
  }
  function importConfirmHtml() {
    if (!pendingImport) return "";
    const now = stateCounts(S), file = stateCounts(pendingImport.state);
    return `<div class="note warn prog-confirm" role="group" aria-labelledby="prog-confirm-h">
        <div class="note-title" id="prog-confirm-h">Replace all progress with ${esc(pendingImport.name)}?</div>
        <p>The file replaces everything in this browser. The data in the column "Now in this browser" goes away. You cannot undo it.</p>
        <div class="table-wrap"><table><thead><tr><th scope="col">Data</th><th scope="col">Now in this browser</th><th scope="col">In the file</th></tr></thead>
          <tbody>${now.map((r, i) => `<tr><th scope="row">${esc(r[0])}</th><td>${r[1]}</td><td>${file[i][1]}</td></tr>`).join("")}</tbody></table></div>
        <div class="row"><button type="button" class="danger solid" data-act="import-confirm">Replace my progress</button>
          <button type="button" data-act="import-cancel">Cancel</button></div></div>`;
  }
  // Size of the saved state in bytes, from the same JSON text that save() writes.
  function coreSavedSize() {
    let n = 0;
    try { n = new TextEncoder().encode(JSON.stringify(S)).length; } catch (e) { n = JSON.stringify(S).length; }
    return n < 1024 ? n + " bytes" : (n / 1024).toFixed(1) + " KB";
  }
  function pageProgress() {
    const lessonIds = Object.keys(S.lessons);
    const lDone = lessonIds.filter((id) => (S.lessons[id] || {}).completedAt).length;
    const cards = Object.keys(S.reviews).length;
    const tStarted = Object.keys(S.tickets).filter((id) => ((S.tickets[id] || {}).status || "not started") !== "not started").length;
    const tDone = Object.keys(S.tickets).filter((id) => (S.tickets[id] || {}).status === "done").length;
    const cIds = Object.keys(S.concepts);
    const evidence = cIds.reduce((s, id) => s + ((S.concepts[id] || {}).evidence || []).length, 0);
    const journal = (S.journal || []).length;
    const mis = (S.misconceptions || []).length;
    const misOpen = (S.misconceptions || []).filter((m) => !m.resolved).length;
    const activity = coreActivity();
    const last = activity[0];
    const empty = !lessonIds.length && !cards && !Object.keys(S.tickets).length && !cIds.length && !journal && !mis;
    const row = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;

    const status = `<section class="card prog-status" aria-labelledby="prog-status-h">
        <h2 id="prog-status-h">What is saved in this browser</h2>
        <p class="prog-save"><span class="status-dot ${storageOk ? "ok" : "bad"}" aria-hidden="true"></span>
          ${storageOk ? "Saving works. Each change is saved in this browser at once." : "Saving does not work in this browser. Export a backup before you close the page."}</p>
        ${empty ? `<p class="muted">Nothing is saved yet. Open a lesson to start.</p>` : `<dl class="prog-facts">
          ${row("Lessons", lDone + " complete · " + lessonIds.length + " opened")}
          ${row("Recall cards", String(cards))}
          ${row("Tickets", tDone + " done · " + tStarted + " started")}
          ${row("Concepts", cIds.length + " with a level · " + evidence + " evidence " + (evidence === 1 ? "entry" : "entries"))}
          ${row("Journal", journal + (journal === 1 ? " entry" : " entries"))}
          ${row("Misconceptions", mis + " recorded · " + misOpen + " open")}
        </dl>`}
        <p class="meta-text">Saved data: ${esc(coreSavedSize())}${last ? ` · Last recorded activity <time datetime="${esc(fmtDate(last.date))}">${esc(fmtDate(last.date))}</time>` : ""}</p>
      </section>`;

    return `${storageBanner()}
      <header class="prog-head"><h1>Progress and backup</h1>
        <p class="prog-local"><span class="tag info">Local only</span> Your progress lives only in this browser, in local storage under the key <code>aiacademy.v1</code>. Nothing goes to a server. Clearing the browser data removes it, so export often.</p>
      </header>
      ${status}
      <section class="card prog-export" aria-labelledby="prog-export-h"><h2 id="prog-export-h">Export a backup</h2>
        <p>The backup is a <code>.json</code> file named with today's date. The academy does not record when you last exported, so check the date of your newest backup file.</p>
        <div class="row">
          <button type="button" class="primary" data-act="export-json">Download a backup (.json)</button>
          <button type="button" data-act="progress-copy">Copy PROGRESS.md</button>
          <button type="button" data-act="progress-download">Download PROGRESS.md</button></div>
        <p class="muted">Save <code>PROGRESS.md</code> in <code>~/Documents/ai-academy/</code> to replace the template. Paste it into Claude when you want a review of your overall progress.</p>
      </section>
      <section class="card prog-import" aria-labelledby="prog-import-h"><h2 id="prog-import-h">Restore from a backup</h2>
        <div class="note warn"><div class="note-title">This replaces all progress in this browser</div>
          <p>When you choose a file, the academy shows what the file holds. Nothing changes until you confirm. The import replaces everything that is saved here now. You cannot undo it. Export a backup of the current progress first.</p></div>
        <div class="row"><input type="file" id="import-file" class="sr-only" accept=".json,application/json"><label class="btn" for="import-file">Choose a backup .json</label></div>
        ${importConfirmHtml()}
      </section>
      <section class="card prog-danger" aria-labelledby="prog-danger-h"><h2 id="prog-danger-h">Delete all progress</h2>
        <p>This deletes all lessons, cards, tickets, mastery evidence, journal entries and misconceptions in this browser. You cannot undo it. Export first.</p>
        <div class="row"><button type="button" class="danger${resetArmed ? " solid" : ""}" data-act="reset">${resetArmed ? "Click again to delete everything" : "Reset all progress"}</button>
          ${resetArmed ? `<span class="prog-armed" role="alert">Click the button again within 5 seconds to delete everything. Wait to cancel.</span>` : ""}</div>
      </section>
      <details class="prog-preview"><summary>Preview of PROGRESS.md</summary><pre><code>${esc(A.md.progress(S))}</code></pre></details>`;
  }

  /* ------------------------------------------------------------- router */
  const ROUTES = { "": pageDashboard, curriculum: pageCurriculum, lesson: pageLesson, review: pageReview, tickets: pageTickets, ticket: pageTicket,
    mastery: pageMastery, journal: pageJournal, interview: pageInterview, workflow: pageWorkflow, progress: pageProgress };
  const TITLES = { "": "Home", curriculum: "Curriculum", lesson: "Lesson", review: "Review", tickets: "Implementation Tickets", ticket: "Ticket", mastery: "Mastery",
    journal: "Learning Journal", interview: "Interview Practice", workflow: "VS Code Workflow", progress: "Progress & Backup" };
  // Each nav link is active for its own route. The "ticket" route also makes "tickets" active.
  const NAV_ALIAS = { ticket: "tickets" };
  // The "Lessons" link opens the current lesson, else the first open ready lesson, else the curriculum.
  function lessonsHref(r) {
    if (r.name === "lesson" && A.lessons[r.arg]) return "#/lesson/" + encodeURIComponent(r.arg);
    const ready = allLessonsMeta().filter((l) => l.status === "ready" && A.lessons[l.id]);
    const next = ready.find((l) => !(S.lessons[l.id] || {}).completedAt) || ready[0];
    return next ? "#/lesson/" + encodeURIComponent(next.id) : "#/curriculum";
  }

  function parseRoute() {
    const h = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = h.split("/").map(decodeURIComponent);
    return { name: parts[0] || "", arg: parts[1] };
  }
  function render(keepScroll) {
    const r = parseRoute();
    const fn = ROUTES[r.name] || pageDashboard;
    const y = window.scrollY;
    view.innerHTML = fn(r.arg);
    view.dataset.route = ROUTES[r.name] ? r.name || "home" : "home";
    const navRoute = ROUTES[r.name] ? NAV_ALIAS[r.name] || r.name : "";
    $$("#nav a").forEach((a) => {
      const on = a.dataset.route === navRoute;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const navLessons = $("#nav-lessons");
    if (navLessons) navLessons.setAttribute("href", lessonsHref(r));
    $("#topbar-title").textContent = TITLES[r.name] || "AI Engineering Academy";
    document.title = (r.name === "lesson" && A.lessons[r.arg] ? "Lesson " + r.arg : TITLES[r.name] || "Home") + " · AI Engineering Academy";
    mountInteractives(view);
    updateBadge();
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ actions */
  const ACT = {
    jump(el, ev) {
      ev.preventDefault(); const t = document.getElementById(el.dataset.target); if (!t) return;
      // A closed <details> hides the target. Open it before the scroll.
      const box = t.tagName === "DETAILS" ? t : t.closest("details");
      if (box && !box.open) box.open = true;
      // Do not animate the scroll when the user asks for reduced motion. Move the focus to the section for keyboard users.
      const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      t.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      if (t.hasAttribute("tabindex")) t.focus({ preventScroll: true });
      else if (t.tagName === "DETAILS" && t.querySelector("summary")) t.querySelector("summary").focus({ preventScroll: true });
    },
    mcq(el) {
      const L = A.lessons[el.dataset.lesson];
      const c = L.levels.flatMap((lv) => lv.checks).find((x) => x.id === el.dataset.check);
      const ls = lessonState(L.id);
      const prev = ls.checks[c.id] || { tries: 0 };
      if (prev.result === "right") return;
      const i = +el.dataset.opt;
      const st = { result: i === c.correct ? "right" : "wrong", tries: (prev.tries || 0) + 1 };
      ls.checks[c.id] = st;
      const box = el.closest(".check");
      $$(".opts button", box).forEach((b) => b.classList.remove("wrong"));
      el.classList.add(st.result === "right" ? "right" : "wrong");
      const fb = $(".feedback", box);
      if (st.result === "right") { fb.className = "feedback good"; fb.textContent = "Correct. " + c.explain; }
      else {
        fb.className = "feedback bad"; fb.textContent = "Not this one. Think about it again and try another option.";
        S.misconceptions.push({ id: "m" + Date.now(), date: nowIso(), lesson: L.id, resolved: false, text: "Lesson " + L.id + ": for \"" + c.q + "\" I chose \"" + c.options[i] + "\"." });
      }
      afterCheck(L);
    },
    "recall-show"(el) {
      const box = el.closest(".check");
      const ls = lessonState(el.dataset.lesson);
      const prev = ls.checks[el.dataset.check] || {};
      ls.checks[el.dataset.check] = Object.assign(prev, { typed: $("textarea", box).value });
      save();
      $(".answer", box).hidden = false;
    },
    "recall-rate"(el) {
      const L = A.lessons[el.dataset.lesson];
      const ls = lessonState(L.id);
      const box = el.closest(".check");
      ls.checks[el.dataset.check] = { result: el.dataset.r, typed: $("textarea", box).value };
      const fb = $(".feedback", box);
      fb.className = "feedback good";
      fb.textContent = el.dataset.r === "good" ? "Recorded: you had it." : "Recorded. Read the level again later; the recall card will return in review.";
      afterCheck(L);
    },
    unlock(el) {
      const ls = lessonState(el.dataset.lesson);
      ls.levelUnlocked = Math.max(ls.levelUnlocked, +el.dataset.level);
      save(); render(true);
      const t = document.getElementById("sec-l" + el.dataset.level); if (t) { t.scrollIntoView({ block: "start" }); if (t.hasAttribute("tabindex")) t.focus({ preventScroll: true }); }
    },
    complete(el) {
      const L = A.lessons[el.dataset.lesson];
      const ls = lessonState(L.id);
      ls.completedAt = nowIso();
      (L.recall || []).forEach((r) => { if (!S.reviews[r.id]) S.reviews[r.id] = newCard(today()); });
      save(); render(true); toast("Lesson complete. " + (L.recall || []).length + " recall cards are in the review queue.");
    },
    "teach-journal"(el) {
      const ls = lessonState(el.dataset.lesson);
      if (!(ls.teachBack || "").trim()) return toast("Write the teach-back first.");
      S.journal.push({ id: "j" + Date.now(), date: nowIso(), lesson: el.dataset.lesson, kind: "teach-back", text: ls.teachBack });
      save(); toast("Saved to the journal.");
    },
    "teach-copy"(el) {
      const L = A.lessons[el.dataset.lesson]; const ls = lessonState(L.id);
      copyText("You are my AI engineering tutor. Here is my teach-back for the lesson \"" + L.title + "\".\nTask: " + L.teachBack +
        "\n\nCheck it for factual errors and important gaps. Ask me three follow-up questions like an interviewer. Do not rewrite it for me.\n\n---\n\n" + (ls.teachBack || ""), "Teach-back");
    },
    reveal() {
      const ta = $("#review-typed"); reviewTyped = ta ? ta.value : "";
      reviewReveal = true; render(true);
      // The pressed button is gone after the render. Move the focus to the answer.
      const a = $("#rv-answer"); if (a) a.focus({ preventScroll: true });
    },
    rate(el) {
      const k = el.dataset.card;
      S.reviews[k] = schedule(S.reviews[k], el.dataset.r, today());
      reviewReveal = false; reviewTyped = ""; save(); render(true);
      toast("Next review: " + S.reviews[k].due + ".");
    },
    "ticket-copy"(el) { copyText(A.md.ticket(A.tickets[el.dataset.ticket]), "Ticket"); },
    "handoff-copy"(el) { const t = A.tickets[el.dataset.ticket]; copyText(A.md.handoffFilled(t, ticketState(t.id).handoff), "Handoff"); },
    "handoff-download"(el) { const t = A.tickets[el.dataset.ticket]; download(t.id + "-handoff.md", A.md.handoffFilled(t, ticketState(t.id).handoff)); },
    claim(el) {
      const id = el.dataset.concept;
      const lvl = +$(`[data-claim-level="${id}"]`).value;
      const note = $(`[data-claim-note="${id}"]`).value.trim();
      if (!note) return toast("Write the evidence first.");
      const c = conceptState(id);
      c.level = lvl; c.evidence.push({ level: lvl, note: note, date: nowIso() });
      save(); render(true); toast("Recorded.");
    },
    "journal-add"() {
      const text = $("#j-text").value.trim(); if (!text) return toast("Write something first.");
      S.journal.push({ id: "j" + Date.now(), date: nowIso(), lesson: $("#j-lesson").value || null, text: text });
      save(); render(true);
    },
    "journal-del"(el) { S.journal = S.journal.filter((j) => j.id !== el.dataset.id); save(); render(true); },
    "mis-add"() {
      const text = $("#m-text").value.trim(); if (!text) return;
      S.misconceptions.push({ id: "m" + Date.now(), date: nowIso(), resolved: false, text: text }); save(); render(true);
    },
    "mis-toggle"(el) { const m = S.misconceptions.find((x) => x.id === el.dataset.id); if (m) m.resolved = !m.resolved; save(); render(true); },
    "mis-del"(el) { S.misconceptions = S.misconceptions.filter((x) => x.id !== el.dataset.id); save(); render(true); },
    "export-json"() { download("ai-academy-progress-" + today() + ".json", JSON.stringify(S, null, 2), "application/json"); },
    "progress-copy"() { copyText(A.md.progress(S), "PROGRESS.md"); },
    "progress-download"() { download("PROGRESS.md", A.md.progress(S)); },
    reset() {
      // The render replaces the button. Put the focus back on the new button.
      const refocus = () => { const b = $('#view [data-act="reset"]'); if (b) b.focus({ preventScroll: true }); };
      if (!resetArmed) {
        resetArmed = true; render(true); refocus();
        setTimeout(() => {
          if (!resetArmed) return;
          resetArmed = false;
          if (parseRoute().name !== "progress") return;
          const had = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.act === "reset";
          render(true); if (had) refocus();
        }, 5000);
        return;
      }
      resetArmed = false; S = fresh(); save(); render(true); refocus(); toast("All progress deleted.");
    },
    "import-confirm"() {
      if (!pendingImport) return;
      S = pendingImport.state; pendingImport = null; save(); render(); toast("Progress imported.");
    },
    "import-cancel"() {
      pendingImport = null; render(true);
      const inp = $("#import-file"); if (inp) inp.focus({ preventScroll: true });
      toast("Import cancelled. Nothing changed.");
    }
  };
  function afterCheck(L) {
    L.levels.forEach((lv) => {
      if (levelDone(L, lv) && lv.n === 1) L.concepts.forEach((c) => raiseConcept(c.id, 1, "Finished level 1 checks of lesson " + L.id + "."));
    });
    if (L.levels.every((lv) => levelDone(L, lv))) L.concepts.forEach((c) => raiseConcept(c.id, 2, "Answered all checks of lesson " + L.id + "."));
    save();
    const ls = lessonState(L.id);
    const cur = L.levels.find((lv) => lv.n === ls.levelUnlocked);
    if (cur && levelDone(L, cur)) {
      render(true);
      // The pressed button is gone after the render. Put the focus on the next step of the lesson.
      const nb = document.querySelector("#sec-l" + cur.n + " .level-next .primary"); if (nb) nb.focus({ preventScroll: true });
    } else updateLessonProgress(L);
  }

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, ev);
  });
  let saveTimer;
  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.save === "teach") { lessonState(el.dataset.lesson).teachBack = el.value; }
    else if (el.dataset.save === "handoff") { const st = ticketState(el.dataset.ticket); st.handoff[el.dataset.field] = el.value; }
    else return;
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset.save === "tstatus") {
      const st = ticketState(el.dataset.ticket);
      st.status = el.value;
      if (el.value !== "not started" && !st.startedAt) st.startedAt = nowIso();
      st.doneAt = el.value === "done" ? nowIso() : null;
      save(); toast("Status: " + el.value + ".");
    } else if (el.id === "import-file" && el.files[0]) {
      const file = el.files[0];
      file.text().then((txt) => {
        try {
          const s = JSON.parse(txt);
          if (!s || s.version !== 1) throw new Error("not an academy backup");
          // Do not replace the progress yet. Show what the file holds and ask the user to confirm.
          pendingImport = { state: normalize(s), name: file.name };
          render(true);
          const b = $('#view [data-act="import-confirm"]'); if (b) b.focus({ preventScroll: true });
        } catch (e) { toast("Import failed: " + e.message); }
        el.value = "";
      });
    } else if (el.id === "handoff-file" && el.files[0]) {
      el.files[0].text().then((txt) => {
        const h = parseHandoffMd(txt);
        const n = Object.keys(h).length;
        if (!n) return toast("No handoff sections found in that file.");
        Object.assign(ticketState(el.dataset.ticket).handoff, h); save(); render(true); toast(n + " sections imported.");
      });
    }
  });

  // Theme: auto -> light -> dark -> auto.
  function themeLabel() {
    const t = document.documentElement.getAttribute("data-theme");
    $("#theme-btn").textContent = "Theme: " + (t || "auto");
  }
  $("#theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === null ? "light" : cur === "light" ? "dark" : null;
    if (next) document.documentElement.setAttribute("data-theme", next); else document.documentElement.removeAttribute("data-theme");
    try { next ? localStorage.setItem("aiacademy.theme", next) : localStorage.removeItem("aiacademy.theme"); } catch (e) {}
    themeLabel();
  });
  themeLabel();

  // Mobile drawer.
  function drawer(open) {
    const wasOpen = $("#sidebar").classList.contains("open");
    $("#sidebar").classList.toggle("open", open); $("#scrim").classList.toggle("show", open);
    document.body.classList.toggle("drawer-open", open);
    $("#menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
    // Move the focus into the drawer when it opens, and back to the menu button when it closes.
    if (open && !wasOpen) { const first = $("#sidebar a"); if (first) first.focus(); }
    if (!open && wasOpen && $("#sidebar").contains(document.activeElement)) $("#menu-btn").focus();
  }
  $("#menu-btn").addEventListener("click", () => drawer(true));
  $("#scrim").addEventListener("click", () => drawer(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#sidebar").classList.contains("open")) drawer(false); });
  window.addEventListener("hashchange", () => { drawer(false); reviewReveal = false; reviewTyped = ""; pendingImport = null; render(); });

  /* ======================================================= PART 4: INTERACTIVES */

  const fmtP = (p) => (p * 100).toFixed(1) + "%";
  const showTok = (t) => t.replace(/ /g, "␣").replace(/\n/g, "\\n");
  function bars(rows) {
    return `<div class="bars">${rows.map((r) => `<div class="bar-row ${r.cls || ""}"><span class="lbl" title="${esc(r.label)}">${esc(r.label)}</span><span class="track"><i style="width:${(r.p * 100).toFixed(1)}%"></i></span><span class="val">${fmtP(r.p)}</span></div>`).join("")}</div>`;
  }

  const IX = {};

  // Each tool uses the same parts: .ix-title, .ix-lead, .ix-controls or .ix-actions, then .ix-result.
  // redrawKeepFocus() draws the tool again. If the focus was in the tool, it goes back to the same control.
  // If that control is now disabled, the focus goes to the "Start again" button.
  function redrawKeepFocus(el, draw, act) {
    const a = document.activeElement;
    const inside = a && a !== el && el.contains(a);
    const id = inside ? a.id : "";
    draw();
    if (!inside) return;
    let t = id ? el.querySelector("#" + id) : act ? el.querySelector(`[data-ix-act="${act}"]`) : null;
    if (!t || t.disabled) t = el.querySelector('[data-ix-act="reset"]');
    if (t) t.focus({ preventScroll: true });
  }

  IX.genloop = function (el) {
    const prompt = "The capital of France is";
    const steps = [
      { cands: [[" Paris", .86], [" a", .05], [" located", .03], [" the", .02], ["(all other tokens)", .04]] },
      { cands: [[".", .71], [",", .18], [" and", .06], ["(all other tokens)", .05]] },
      { cands: [["<end of turn>", .64], [" It", .22], ["\n", .09], ["(all other tokens)", .05]] }
    ];
    let k = 0;
    // A token chip. The leading space stays outside the chip, so the text of .gen is the plain output text.
    const chip = (t, last) => (t.startsWith(" ") ? " " : "") + `<span class="gtok${last ? " new" : ""}">${esc(t.replace(/^ /, ""))}</span>`;
    function draw() {
      const picked = steps.slice(0, k).map((s) => s.cands[0]);
      const finished = k === steps.length;
      const shown = picked.filter((c) => c[0] !== "<end of turn>");
      const cur = steps[Math.min(k, steps.length - 1)];
      el.innerHTML = `<div class="ix-title">Step through the generation loop <span class="tag">numbers are illustrative</span></div>
        <p class="ix-lead">Each step adds one token to the text. Then the model reads the longer text again. The loop stops at an end token, at max_tokens, or at a stop sequence.</p>
        <div class="ix-actions"><button type="button" class="primary" data-ix-act="next" ${finished ? "disabled" : ""}>Pick a token and add it</button><button type="button" data-ix-act="reset">Start again</button>
          <span class="ix-status" aria-live="polite">Output tokens: ${k}</span></div>
        <div class="ix-result">
          <div class="ix-text"><span class="prompt">${esc(prompt)}</span><span class="gen">${shown.map((c, i) => chip(c[0], i === shown.length - 1 && !finished)).join("")}</span>${finished ? "" : `<span class="caret" aria-hidden="true">▍</span>`}</div>
          ${picked.length ? `<ol class="ix-steps" aria-label="Tokens picked so far">${picked.map((c, i) => `<li><span class="ix-step-n">Step ${i + 1}</span> <code>${esc(showTok(c[0]))}</code> <span class="muted">${fmtP(c[1])}</span></li>`).join("")}</ol>` : ""}
          ${finished ? `<p class="ix-outcome"><strong>Stopped.</strong> The model picked the end-of-turn token. The API reports <code>stop_reason: "end_turn"</code> and <code>output_tokens</code> = ${steps.length}.</p>`
            : `<p class="ix-explain">Step ${k + 1}. The model reads all the text above and gives a probability to every token in its vocabulary. The top candidates:</p>
               ${bars(cur.cands.map((c, i) => ({ label: showTok(c[0]), p: c[1], cls: i === 0 ? "chosen" : "" })))}
               <p class="muted">Here the most likely token is picked. With sampling, a less likely token is sometimes picked, and the rest of the answer changes.</p>`}
        </div>`;
    }
    el.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-ix-act]"); if (!a) return;
      if (a.dataset.ixAct === "next" && k < steps.length) k++;
      if (a.dataset.ixAct === "reset") k = 0;
      redrawKeepFocus(el, draw, a.dataset.ixAct);
    });
    draw();
  };

  IX.bpe = function (el) {
    const corpus = "low low low lower lowest newer newest";
    let st = bpeInit(corpus);
    const start = bpeTokenCount(st);
    let tryWord = "lowness";
    // The result for the typed word. Typing changes only this part, so the focus and the caret stay in the input.
    function tryHtml() {
      const parts = bpeApply(tryWord, st.merges);
      return `${parts.map((s) => `<span class="tok">${esc(s)}</span>`).join("")} <small class="muted">${parts.length} tokens</small>`;
    }
    function draw() {
      const counts = bpePairCounts(st);
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const next = bpeStep(st);
      el.innerHTML = `<div class="ix-title">Byte pair encoding on a tiny corpus <span class="tag ok">real algorithm</span></div>
        <p class="ix-lead">Training text: <code>${esc(corpus)}</code>. Each word starts as single characters. Each step joins the most frequent neighbouring pair everywhere.</p>
        <div class="ix-actions"><button type="button" class="primary" data-ix-act="step" ${next ? "" : "disabled"}>Merge the top pair</button><button type="button" data-ix-act="reset">Start again</button></div>
        <div class="ix-result">
          <div class="ix-text">${st.words.map((w) => `<span class="ix-word">${w.syms.map((s) => `<span class="tok">${esc(s)}</span>`).join("")} <small class="muted">×${w.n}</small></span>`).join(" ")}</div>
          <div class="kv"><div>Merges learned<b>${st.merges.length}</b></div><div>Tokens for the whole text<b>${bpeTokenCount(st)} <small class="muted">(start ${start})</small></b></div>
            <div>Next merge<b>${next ? esc(next.merges[next.merges.length - 1].a + " + " + next.merges[next.merges.length - 1].b) : "none"}</b></div></div>
          ${top.length ? `<p class="muted">Most frequent pairs now: ${top.map(([k, n]) => esc(k.replace("\u0000", " + ")) + " (" + n + ")").join(", ")}</p>` : ""}
          ${st.merges.length ? `<p class="ix-group">Merge rules, in order</p><ol class="ix-merges">${st.merges.map((m) => `<li><code>${esc(m.a)}+${esc(m.b)}→${esc(m.a + m.b)}</code></li>`).join("")}</ol>` : ""}
        </div>
        <div class="ix-sub">
          <div class="slider-row"><label for="bpe-try">Tokenize a new word</label><input type="text" id="bpe-try" value="${esc(tryWord)}" maxlength="30" autocomplete="off" spellcheck="false"><span></span></div>
          <div class="ix-text" data-part="try" aria-live="polite">${tryHtml()}</div>
          <p class="muted">A word that the training text did not contain still works. It only uses more tokens. This is why rare words, names and code cost more.</p>
        </div>`;
      const inp = $("#bpe-try", el);
      inp.addEventListener("input", () => { tryWord = inp.value; $('[data-part="try"]', el).innerHTML = tryHtml(); });
    }
    el.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-ix-act]"); if (!a) return;
      if (a.dataset.ixAct === "step") { const n = bpeStep(st); if (n) st = n; }
      if (a.dataset.ixAct === "reset") st = bpeInit(corpus);
      redrawKeepFocus(el, draw, a.dataset.ixAct);
    });
    draw();
  };

  IX.sampler = function (el) {
    const toks = [" Paris", " Lyon", " Marseille", " the", " a"];
    const logits = [2.0, 1.0, 0.4, 0.1, -0.6];
    let T = 1.0, P = 1.0, seed = 42, counts = null;
    // The controls are drawn one time. A slider change updates only the values and the result,
    // so a mouse drag on a slider continues without a break.
    el.innerHTML = `<div class="ix-title">Temperature and top-p <span class="tag">made-up logits</span></div>
      <p class="ix-lead">Prompt: <code>The capital of France is</code>. Logits: ${toks.map((t, i) => `<code>${esc(showTok(t))}</code> ${logits[i]}`).join(", ")}.</p>
      <div class="ix-controls">
        <div class="slider-row"><label for="s-t">Temperature</label><input id="s-t" type="range" min="0.05" max="2" step="0.05" value="${T}"><b data-part="t"></b></div>
        <div class="slider-row"><label for="s-p">Top-p</label><input id="s-p" type="range" min="0.05" max="1" step="0.05" value="${P}"><b data-part="p"></b></div>
        <div class="ix-field"><label for="s-seed">Seed</label><input id="s-seed" type="number" value="${seed}"></div>
      </div>
      <div class="ix-actions"><button type="button" class="primary" data-ix-act="sample">Sample 100 times</button><button type="button" data-ix-act="reset">Start again</button></div>
      <div class="ix-result" data-part="out" aria-live="polite"></div>
      <div class="note warn"><p>Current Claude models (Opus 5.5, Sonnet 5.5, Haiku 5.5) do not accept <code>temperature</code>, <code>top_p</code> or <code>top_k</code>. This simulator teaches the concept, which other models and interviews still use.</p></div>`;
    function update() {
      const probs = softmax(logits, T);
      const keep = topP(probs, P);
      const kept = keep.reduce((s, i) => s + probs[i], 0);
      $('[data-part="t"]', el).textContent = T.toFixed(2);
      $('[data-part="p"]', el).textContent = P.toFixed(2);
      $('[data-part="out"]', el).innerHTML = `${bars(toks.map((t, i) => ({ label: showTok(t), p: probs[i], cls: keep.includes(i) ? "" : "cut" })))}
        <p class="muted">Grey bars are removed by top-p. The kept tokens hold ${fmtP(kept)} of the probability and are sampled after they are scaled up to 100%.</p>
        ${counts ? `<p class="ix-outcome">Result of 100 samples with seed ${seed}: ${toks.map((t, i) => `<code>${esc(showTok(t))}</code> ${counts[i]}`).join(", ")}. The same seed gives the same result; another seed gives a different result.</p>` : ""}`;
    }
    $("#s-t", el).addEventListener("input", (e) => { T = +e.target.value; counts = null; update(); });
    $("#s-p", el).addEventListener("input", (e) => { P = +e.target.value; counts = null; update(); });
    $("#s-seed", el).addEventListener("change", (e) => { seed = parseInt(e.target.value, 10) || 0; counts = null; update(); });
    el.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-ix-act]"); if (!a) return;
      if (a.dataset.ixAct === "reset") {
        T = 1.0; P = 1.0; seed = 42; counts = null;
        $("#s-t", el).value = T; $("#s-p", el).value = P; $("#s-seed", el).value = seed;
        update(); return;
      }
      if (a.dataset.ixAct !== "sample") return;
      const probs = softmax(logits, T), keep = topP(probs, P), rnd = mulberry32(seed);
      counts = toks.map(() => 0);
      for (let i = 0; i < 100; i++) counts[sampleIndex(probs, keep, rnd)]++;
      update();
    });
    update();
  };

  IX.cost = function (el) {
    const START = { m: 0, inTok: 1200, outTok: 300, req: 50000, adjust: false };
    let { m, inTok, outTok, req, adjust } = START;
    // Below $1, show six decimals, so a per-request cost such as $0.0108 does not round to $0.01.
    const usd = (x) => x < 1 ? "$" + x.toFixed(6) : "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // The controls are drawn one time. A change updates only the result, so the focus stays where the user put it.
    el.innerHTML = `<div class="ix-title">Cost calculator <span class="tag">check prices on the pricing page</span></div>
      <p class="ix-lead">Select a model and type the token counts of one request. The result shows the cost of one request and the totals for your traffic.</p>
      <div class="ix-controls ix-form">
        <div class="ix-field ix-wide"><label for="c-m">Model</label><select id="c-m">${MODELS.map((x, k) => `<option value="${k}" ${k === m ? "selected" : ""}>${esc(x.name)} ($${x.in} in / $${x.out} out per MTok)</option>`).join("")}</select></div>
        <div class="ix-field"><label for="c-i">Input tokens</label><input id="c-i" type="number" min="0" inputmode="numeric" value="${inTok}"></div>
        <div class="ix-field"><label for="c-o">Output tokens</label><input id="c-o" type="number" min="0" inputmode="numeric" value="${outTok}"></div>
        <div class="ix-field"><label for="c-r">Requests per day</label><input id="c-r" type="number" min="0" inputmode="numeric" value="${req}"></div>
        <label class="ix-check ix-wide" data-part="adj"><input type="checkbox" id="c-adj"><span>The same text gives about 30% more tokens on this model (estimate). Use counted tokens when you have them.</span></label>
      </div>
      <div class="ix-actions"><button type="button" data-ix-act="reset">Start again</button></div>
      <div class="ix-result" data-part="out" aria-live="polite"></div>
      <p class="muted">Not included: retries, prompt caching discounts, batch discounts, tool definitions and thinking tokens (billed as output).</p>`;
    function update() {
      const model = MODELS[m];
      const f = adjust && model.tokenFactor ? model.tokenFactor : 1;
      const i = Math.round(inTok * f), o = Math.round(outTok * f);
      const c = cost(model, i, o);
      // The token estimate applies only to a model with a token factor.
      $('[data-part="adj"]', el).hidden = !model.tokenFactor;
      $("#c-adj", el).checked = adjust;
      $('[data-part="out"]', el).innerHTML = `<p class="ix-group">Per request</p>
        <div class="kv"><div>Input per request<b>${usd(c.input)}</b></div><div>Output per request<b>${usd(c.output)}</b></div><div class="ix-key">Per request<b>${usd(c.total)}</b></div></div>
        <p class="ix-group">Totals</p>
        <div class="kv"><div>Per day<b>${usd(c.total * req)}</b></div><div class="ix-key">Per 30 days<b>${usd(c.total * req * 30)}</b></div><div>Output share of cost<b>${c.total ? Math.round((c.output / c.total) * 100) : 0}%</b></div></div>
        ${c.long ? `<p class="muted">The prompt is above ${model.longAbove.toLocaleString()} tokens, so the higher long-prompt price applies.</p>` : ""}
        ${f !== 1 ? `<p class="muted">Counted as ${i.toLocaleString()} input and ${o.toLocaleString()} output tokens.</p>` : ""}`;
    }
    $("#c-m", el).addEventListener("change", (e) => { m = +e.target.value; update(); });
    [["#c-i", (v) => (inTok = v)], ["#c-o", (v) => (outTok = v)], ["#c-r", (v) => (req = v)]].forEach(([sel, set]) => {
      $(sel, el).addEventListener("change", (e) => { set(Math.max(0, +e.target.value || 0)); update(); });
    });
    $("#c-adj", el).addEventListener("change", (e) => { adjust = e.target.checked; update(); });
    el.addEventListener("click", (ev) => {
      if (!ev.target.closest('[data-ix-act="reset"]')) return;
      ({ m, inTok, outTok, req, adjust } = START);
      $("#c-m", el).value = String(m); $("#c-i", el).value = inTok; $("#c-o", el).value = outTok; $("#c-r", el).value = req;
      update();
    });
    update();
  };

  function mountInteractives(scope) {
    // Built-in interactives come first. A lesson file can add more in window.ACADEMY.ix.
    $$("[data-ix]", scope).forEach((el) => { const f = IX[el.dataset.ix] || (A.ix && A.ix[el.dataset.ix]); if (f) f(el); else el.textContent = "Interactive not found: " + el.dataset.ix; });
  }

  render();
})(typeof window !== "undefined" ? window : globalThis);
