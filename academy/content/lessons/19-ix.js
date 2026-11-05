/*
 * Interactive for lesson 3.3: "l3-3-metrics".
 * It measures retrieval on the index of lesson 3.1 (20-word chunks, fake embedder).
 * The learner selects a labeled question and k, and marks the relevant sections with a grade
 * (0 = not relevant, 1 = related, 2 = holds the answer). The interactive shows the ranked list of
 * the first 10 chunks and the four metrics at k, with the formula and the numbers:
 *   recall@k     labeled sections found in the top k / labeled sections
 *   precision@k  relevant results in the top k / k
 *   RR@k         1 / rank of the first relevant result (0 when no relevant result is in the top k)
 *   nDCG@k       DCG@k / IDCG@k, with DCG@k = sum of gain / log2(rank + 1) over the top k
 * A result (a chunk) is relevant when one of its sections has a grade of 1 or more.
 * Its gain is the highest grade of its sections.
 * The ideal list for IDCG sorts the gains of all chunks in the index.
 * The labels name sections, not chunk ids, so the same labels measure an index with other chunks.
 *
 * The interactive also shows the output of the eval script (one row for each k, the mean over
 * the questions with labels) and the gate at k = 3 against a candidate index of 10 or 40 words.
 * The gate follows T-016: it fails when recall@3 goes down or a must-pass question is not a hit.
 * A question is a hit when every section with grade 2 is in the top 3.
 * The questions, the labels and every number are the fixtures of ticket T-019.
 * The index, the fake embedder and the search come from 17-ix.js ("l3-1-pipeline").
 * This file reads them when a function runs, not when the file loads.
 * All facts about "Northwind Tools" are fictional.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l3-3-metrics"] is a function mount(el). It also has
 * a .mount property that points to the same function, and the pure functions below.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const KS = [1, 3, 5, 10];
  const GATE_K = 3;
  const SIZE = 20;
  const CANDIDATES = [10, 40];
  const LIST = 10;
  const DEFAULT = { q: "q02", k: 3, cand: 10 };
  /* The lines of samples/rag_questions.jsonl. */
  const QUESTIONS = [
    { id: "q01", label: "Return window", text: "How many days do I have to return an unused tool?",
      relevant: { "refund-policy#return-window": 2 }, must_pass: true },
    { id: "q02", label: "Damaged tool", text: "What do I do if a tool arrives damaged?",
      relevant: { "refund-policy#damaged-items": 2, "warranty-claims#how-to-claim": 1 }, must_pass: true },
    { id: "q03", label: "Express delivery", text: "How fast is express delivery?",
      relevant: { "delivery-times#express-delivery": 2 }, must_pass: false },
    { id: "q04", label: "Warranty length", text: "How long is the warranty on power tools?",
      relevant: { "warranty-claims#warranty-length": 2 }, must_pass: false },
    { id: "q05", label: "VPN problem", text: "The VPN app does not connect on my laptop. What do I do?",
      relevant: { "vpn-setup#connection-problems": 2, "vpn-setup#install-the-app": 1 }, must_pass: false },
    { id: "q06", label: "Hotel limit", text: "What is the hotel limit for each night of a trip?",
      relevant: { "travel-expenses#hotel-limit": 2 }, must_pass: false },
    { id: "q07", label: "Return delivery cost", text: "Do I pay for the delivery when I return a tool?",
      relevant: {}, must_pass: false },
    { id: "q08", label: "Vacation days", text: "How many vacation days do new employees get?",
      relevant: {}, must_pass: false }
  ];

  const pipe = () => (window.ACADEMY.ix || {})["l3-1-pipeline"];
  const indexes = {};
  function index(size) {
    if (!indexes[size]) indexes[size] = pipe().buildIndex(size);
    return indexes[size];
  }
  /* The section ids of the corpus, in the order of the chunks. */
  function sections() {
    const out = [];
    index(SIZE).chunks.forEach((c) => c.sections.forEach((s) => { if (!out.includes(s)) out.push(s); }));
    return out;
  }

  /* ---- The pure metric functions. assistant/retrieval_metrics.py has the same rules. ---- */
  /* ranked: a list with the section ids of each result, in rank order. labels: {section: grade}. */
  const relevantSet = (labels) => Object.keys(labels).filter((s) => labels[s] >= 1);
  const gain = (secs, labels) => secs.reduce((g, s) => Math.max(g, labels[s] || 0), 0);
  function recallAtK(ranked, labels, k) {
    const want = relevantSet(labels);
    if (!want.length) throw new Error("no relevant section");
    const found = new Set([].concat.apply([], ranked.slice(0, k)));
    return want.filter((s) => found.has(s)).length / want.length;
  }
  function precisionAtK(ranked, labels, k) {
    return ranked.slice(0, k).filter((secs) => gain(secs, labels) >= 1).length / k;
  }
  function reciprocalRank(ranked, labels, k) {
    const i = ranked.slice(0, k).findIndex((secs) => gain(secs, labels) >= 1);
    return i < 0 ? 0 : 1 / (i + 1);
  }
  function dcgTerms(gains, k) { return gains.slice(0, k).map((g, i) => g / Math.log2(i + 2)); }
  function dcg(gains, k) { return dcgTerms(gains, k).reduce((a, b) => a + b, 0); }
  function ndcgAtK(gains, ideal, k) {
    const best = dcg(ideal.slice().sort((a, b) => b - a), k);
    return best === 0 ? 0 : dcg(gains, k) / best;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;

  /* One question on one index: the first 10 results and the numbers at k. */
  function detail(q, labels, k, size) {
    const ix = index(size || SIZE);
    const hits = pipe().search(ix, q.text, LIST);
    const ranked = hits.map((h) => h.chunk.sections);
    const gains = ranked.map((secs) => gain(secs, labels));
    const ideal = ix.chunks.map((c) => gain(c.sections, labels)).sort((a, b) => b - a);
    const want = relevantSet(labels);
    const results = hits.map((h, i) => ({ rank: i + 1, id: h.chunk.id, sections: h.chunk.sections, score: h.score, gain: gains[i], inTop: i < k }));
    const best = hits.length ? hits[0].score : 0;
    if (!want.length) return { q, k, labels, results, gains, ideal, labeled: 0, best };
    const found = new Set([].concat.apply([], ranked.slice(0, k)));
    const first = ranked.findIndex((secs) => gain(secs, labels) >= 1);
    const relevantInTop = ranked.slice(0, k).filter((secs) => gain(secs, labels) >= 1).length;
    const grade2 = want.filter((s) => labels[s] === 2);
    const top3 = new Set([].concat.apply([], ranked.slice(0, GATE_K)));
    return {
      q, k, labels, results, gains, ideal, best,
      labeled: want.length, found: want.filter((s) => found.has(s)), relevantInTop,
      firstRank: first < 0 ? null : first + 1,
      recall: recallAtK(ranked, labels, k), precision: precisionAtK(ranked, labels, k),
      rr: reciprocalRank(ranked, labels, k), ndcg: ndcgAtK(gains, ideal, k),
      dcgTerms: dcgTerms(gains, k), idcgTerms: dcgTerms(ideal, k),
      hit: grade2.every((s) => top3.has(s))
    };
  }

  /* The eval of the question set: one row for each k, and one case for each question with labels. */
  function evaluate(size) {
    const s = size || SIZE;
    const ix = index(s);
    const labeled = QUESTIONS.filter((q) => relevantSet(q.relevant).length);
    const rows = KS.map((k) => {
      const ds = labeled.map((q) => detail(q, q.relevant, k, s));
      const mean = (f) => r3(ds.reduce((a, d) => a + d[f], 0) / ds.length);
      return { k, recall: mean("recall"), precision: mean("precision"), mrr: mean("rr"), ndcg: mean("ndcg") };
    });
    const cases = labeled.map((q) => {
      const d = detail(q, q.relevant, GATE_K, s);
      return { id: q.id, hit: d.hit, first_rank: d.firstRank, recall: r3(d.recall) };
    });
    const skipped = QUESTIONS.filter((q) => !relevantSet(q.relevant).length)
      .map((q) => ({ id: q.id, best: r3(detail(q, q.relevant, GATE_K, s).best) }));
    return { words: s, chunks: ix.chunks.length, embedder: ix.manifest.embedder.model, k: GATE_K,
      rows, cases, skipped, must_pass: QUESTIONS.filter((q) => q.must_pass).map((q) => q.id) };
  }

  /* The gate. It follows compare() of T-016. */
  function compare(baseline, run) {
    const reasons = [];
    const at = (r) => r.rows.find((x) => x.k === baseline.k).recall;
    const before = {}, after = {};
    baseline.cases.forEach((c) => { before[c.id] = c.hit; });
    run.cases.forEach((c) => { after[c.id] = c.hit; });
    const qb = Object.keys(before).sort().join(","), qr = Object.keys(after).sort().join(",");
    if (qb !== qr) reasons.push("the question set differs from the baseline");
    if (at(run) < at(baseline)) reasons.push("recall@" + baseline.k + " went down: " + at(baseline).toFixed(3) + " -> " + at(run).toFixed(3));
    baseline.must_pass.forEach((id) => { if (!after[id]) reasons.push("must-pass question " + id + " is not a hit at k = " + baseline.k); });
    const fixed = Object.keys(after).filter((id) => after[id] && before[id] === false).sort();
    const broken = Object.keys(after).filter((id) => !after[id] && before[id] === true).sort();
    return { passed: reasons.length === 0, reasons, fixed, broken };
  }

  /* The full state of the interactive. labels: the labels of the selected question (the learner can change them). */
  function compute(state) {
    const st = Object.assign({}, DEFAULT, state || {});
    const q = QUESTIONS.find((x) => x.id === st.q) || QUESTIONS[1];
    const k = KS.includes(st.k) ? st.k : DEFAULT.k;
    const cand = CANDIDATES.includes(st.cand) ? st.cand : DEFAULT.cand;
    const labels = st.labels || q.relevant;
    const base = evaluate(SIZE), run = evaluate(cand);
    return { q, k, cand, labels, changed: JSON.stringify(labels) !== JSON.stringify(q.relevant),
      detail: detail(q, labels, k, SIZE), base, run, gate: compare(base, run) };
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const f3 = (x) => x.toFixed(3);
  const GRADE_TAG = { 0: "", 1: "info", 2: "ok" };
  const terms = (gs, k) => gs.slice(0, k).map((g, i) => g + "/log2(" + (i + 2) + ")").join(" + ");

  function mount(el) {
    let state = Object.assign({}, DEFAULT);
    const labelsOf = () => state.labels || (QUESTIONS.find((x) => x.id === state.q) || QUESTIONS[1]).relevant;

    function metricsHtml(r) {
      const d = r.detail;
      if (!d.labeled) {
        return `<p><span class="tag warn">no relevant section</span> This question has no label with a grade of 1 or more. The eval does not use it in the metrics. It prints its best score, ${f3(d.best)}, for the "I don't know" check of lesson 3.7.</p>`;
      }
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      return `<div class="kv">
          <div>recall@${r.k}<b>${f3(d.recall)}</b></div>
          <div>precision@${r.k}<b>${f3(d.precision)}</b></div>
          <div>RR@${r.k}<b>${f3(d.rr)}</b></div>
          <div>nDCG@${r.k}<b>${f3(d.ndcg)}</b></div>
        </div>
        <ul>
          <li><strong>recall@${r.k}</strong> = labeled sections found in the top ${r.k} / labeled sections = ${d.found.length} / ${d.labeled} = <strong>${f3(d.recall)}</strong>${d.found.length < d.labeled ? ` (missing: ${relevantSet(d.labels).filter((s) => !d.found.includes(s)).map((s) => "<code>" + esc(s) + "</code>").join(", ")})` : ""}</li>
          <li><strong>precision@${r.k}</strong> = relevant results in the top ${r.k} / ${r.k} = ${d.relevantInTop} / ${r.k} = <strong>${f3(d.precision)}</strong></li>
          <li><strong>RR@${r.k}</strong> = 1 / rank of the first relevant result = ${d.firstRank && d.firstRank <= r.k ? "1 / " + d.firstRank : "0 (no relevant result in the top " + r.k + ")"} = <strong>${f3(d.rr)}</strong></li>
          <li><strong>nDCG@${r.k}</strong> = DCG / IDCG. DCG = ${terms(d.gains, r.k)} = ${f3(sum(d.dcgTerms))}. IDCG (ideal gains ${d.ideal.slice(0, r.k).join(", ")}) = ${terms(d.ideal, r.k)} = ${f3(sum(d.idcgTerms))}. nDCG = <strong>${f3(d.ndcg)}</strong></li>
        </ul>`;
    }

    function resultHtml() {
      const r = compute(state);
      const d = r.detail;
      const rows = d.results.map((x) => `<tr><td>${x.rank}</td><td><code>${esc(x.id)}</code></td><td>${x.sections.map((s) => {
        const g = d.labels[s] || 0;
        return `<code style="overflow-wrap:anywhere">${esc(s.replace(/^.*#/, "#"))}</code>${g ? ` <span class="tag ${GRADE_TAG[g]}">${g}</span>` : ""}`;
      }).join("<br>")}</td><td>${f3(x.score)}</td><td>${x.gain}</td><td>${x.inTop ? '<span class="tag accent">top ' + r.k + "</span>" : ""}</td></tr>`).join("");
      const secRows = sections().map((s) => {
        const g = d.labels[s] || 0;
        return `<tr><td><code style="overflow-wrap:anywhere">${esc(s)}</code></td><td><div class="row" style="flex-wrap:nowrap" role="group" aria-label="Grade of ${esc(s)}">${[0, 1, 2].map((n) => `<button type="button" data-ix-act="grade" data-s="${esc(s)}" data-v="${n}" class="${n === g ? "primary" : ""}" aria-pressed="${n === g}">${n}</button>`).join("")}</div></td></tr>`;
      }).join("");
      const setRows = r.base.rows.map((x) => `<tr><td>${x.k}</td><td>${f3(x.recall)}</td><td>${f3(x.precision)}</td><td>${f3(x.mrr)}</td><td>${f3(x.ndcg)}</td></tr>`).join("");
      const at = (ev) => ev.rows.find((x) => x.k === GATE_K);
      const g = r.gate;
      return `<p class="ix-group">1. The four metrics for "${esc(r.q.text)}" at k = ${r.k}</p>
        ${metricsHtml(r)}
        <p class="ix-group">2. The ranked list (the first ${d.results.length} of ${index(SIZE).chunks.length} chunks)</p>
        <div class="table-wrap"><table><tr><th>Rank</th><th>Chunk</th><th>Sections (grade)</th><th>Score</th><th>Gain</th><th>In top k</th></tr>${rows}</table></div>
        <p class="muted">A result is relevant when one of its sections has a grade of 1 or more. Its gain is the highest grade of its sections. The ideal list for IDCG sorts the gains of all ${index(SIZE).chunks.length} chunks.</p>
        <p class="ix-group">3. The labels: mark the relevant sections</p>
        <div class="table-wrap"><table><tr><th>Section</th><th>Grade</th></tr>${secRows}</table></div>
        <p>${r.changed ? '<span class="tag warn">changed</span> These are your labels, not the labels of the file. ' : ""}<button type="button" data-ix-act="reset"${r.changed ? "" : " disabled"}>Reset to the labels of the file</button></p>
        <p class="ix-group">4. The question set: the output of retrieval_eval.py (${r.base.words}-word chunks, labels of the file)</p>
        <div class="table-wrap"><table><tr><th>k</th><th>recall@k</th><th>precision@k</th><th>MRR@k</th><th>nDCG@k</th></tr>${setRows}</table></div>
        <p class="muted">The mean over the ${r.base.cases.length} questions with labels. Skipped (no relevant section): ${r.base.skipped.map((x) => x.id + ", best score " + f3(x.best)).join("; ")}.</p>
        <p class="ix-group">5. The gate at k = ${GATE_K}: the ${r.base.words}-word baseline against a candidate index</p>
        <div class="row" role="group" aria-label="Candidate index">${CANDIDATES.map((n) => `<button type="button" data-ix-act="cand" data-v="${n}">${n}-word chunks</button>`).join("")}</div>
        <div class="table-wrap"><table><tr><th>Index</th><th>Chunks</th><th>recall@3</th><th>precision@3</th><th>MRR@3</th><th>nDCG@3</th></tr>
          <tr><td>baseline, ${r.base.words} words</td><td>${r.base.chunks}</td><td>${f3(at(r.base).recall)}</td><td>${f3(at(r.base).precision)}</td><td>${f3(at(r.base).mrr)}</td><td>${f3(at(r.base).ndcg)}</td></tr>
          <tr><td>candidate, ${r.run.words} words</td><td>${r.run.chunks}</td><td>${f3(at(r.run).recall)}</td><td>${f3(at(r.run).precision)}</td><td>${f3(at(r.run).mrr)}</td><td>${f3(at(r.run).ndcg)}</td></tr></table></div>
        <p><span class="tag ${g.passed ? "ok" : "bad"}">verdict: ${g.passed ? "PASS" : "FAIL"}</span> must-pass: ${r.base.must_pass.join(", ")}. fixed: [${g.fixed.join(", ")}]. broken: [${g.broken.join(", ")}].</p>
        ${g.reasons.length ? `<ul>${g.reasons.map((x) => "<li>" + esc(x) + "</li>").join("")}</ul>` : ""}`;
    }

    function sync() {
      el.querySelectorAll(".ix-controls [data-ix-act], [data-ix-act='cand']").forEach((b) => {
        const a = b.dataset.ixAct, v = b.dataset.v;
        const on = (a === "q" && v === state.q) || (a === "k" && +v === state.k) || (a === "cand" && +v === state.cand);
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
    }
    function update() { el.querySelector(".ix-result").innerHTML = resultHtml(); sync(); }

    el.innerHTML = `<div class="ix-title">Measure the retrieval <span class="tag accent">real search, your labels</span></div>
      <p class="ix-lead">Select a question and k. Then change the grade of a section and watch the four metrics change, with the formula and the numbers.</p>
      <div class="ix-controls">
        <p class="ix-group">Question</p>
        <div class="row" role="group" aria-label="Question">${QUESTIONS.map((q) => `<button type="button" data-ix-act="q" data-v="${q.id}" title="${esc(q.text)}">${esc(q.label)}</button>`).join("")}</div>
        <p class="ix-group">k (results that count)</p>
        <div class="row" role="group" aria-label="k">${KS.map((n) => `<button type="button" data-ix-act="k" data-v="${n}">k = ${n}</button>`).join("")}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. "Hotel limit" at k = 1: the first chunk is "the trip.", so recall@1 and RR@1 are 0. "Damaged tool" at k = 3: recall is 1.000, but nDCG is 0.832, because two chunks with grade 1 come before the second chunk with grade 2. Set a grade of 2 on #how-to-claim and watch the ideal list change.
      The search is real on the index of lesson 3.1. The embedder is the fake of the tests. The questions and the labels are the fixture of ticket T-019.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a) || a.disabled) return;
      const act = a.dataset.ixAct, v = a.dataset.v;
      if (act === "q") { state.q = v; state.labels = null; }
      else if (act === "k") state.k = +v;
      else if (act === "cand") state.cand = +v;
      else if (act === "reset") state.labels = null;
      else if (act === "grade") {
        const next = Object.assign({}, labelsOf());
        if (+v === 0) delete next[a.dataset.s]; else next[a.dataset.s] = +v;
        state.labels = next;
      } else return;
      update();
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l33Unbind === "function") el._l33Unbind();
    el.addEventListener("click", onClick);
    el._l33Unbind = () => el.removeEventListener("click", onClick);
    update();
  }
  mount.mount = mount;
  mount.compute = compute;
  mount.detail = detail;
  mount.evaluate = evaluate;
  mount.compare = compare;
  mount.recallAtK = recallAtK;
  mount.precisionAtK = precisionAtK;
  mount.reciprocalRank = reciprocalRank;
  mount.ndcgAtK = ndcgAtK;
  mount.dcg = dcg;
  mount.sections = sections;
  mount.QUESTIONS = QUESTIONS;
  mount.KS = KS;
  mount.GATE_K = GATE_K;
  mount.SIZE = SIZE;
  mount.CANDIDATES = CANDIDATES;
  mount.DEFAULT = DEFAULT;
  window.ACADEMY.ix["l3-3-metrics"] = mount;
})();
