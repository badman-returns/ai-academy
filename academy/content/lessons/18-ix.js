/*
 * Interactive for lesson 3.2: "l3-2-ask".
 * It shows the query path of a RAG service on the index of lesson 3.1 (20-word chunks):
 * embed the question, rank the chunks, keep the top k with a score of at least the minimum,
 * build the prompt with source tags, call the model, check the citations, and return the
 * JSON of POST /ask.
 * The learner selects a question, k (1 to 5) and the minimum score (0.3, 0.5 or 0.7).
 *
 * The index, the fake embedder and the search come from 17-ix.js ("l3-1-pipeline").
 * This file reads them when a function runs, not when the file loads.
 * The model is a toy with visible rules, not a real LLM:
 *   - For each question, a list of facts names the chunk that states the fact.
 *     The toy model says each fact whose chunk is in the prompt, with that chunk id in square brackets.
 *   - One question also has an invented claim with an invented chunk id. The toy model always adds it.
 *     This is how a real model can hallucinate a citation.
 *   - With no fact and no invented claim, the toy model says "I don't know."
 * The status rules are the four statuses of T-008: no_sources (no model call), abstained,
 * answered and unsupported. The same questions and replies are the fixtures of ticket T-018.
 * All facts about "Northwind Tools" are fictional.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l3-2-ask"] is a function mount(el). It also has
 * a .mount property that points to the same function, and the pure function compute(state).
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const IDK = "I don't know";
  const PROMPT = "rag-answer-v1";
  /* The body of assistant/prompts/rag_answer.txt (after the line "version: rag-answer-v1" and one empty line). */
  const SYSTEM_LINES = [
    "Answer the question only from the sources.",
    "Each source is in a source tag with an id, for example refund-policy:0.",
    "Cite the id of each source that you use in square brackets, for example [refund-policy:0].",
    "If the sources do not contain the answer, say \"I don't know\"."
  ];
  const KS = [1, 2, 3, 4, 5];
  const MINS = [0.3, 0.5, 0.7];
  const DEFAULT = { q: "refund-window", k: 3, min: 0.5 };
  const QUESTIONS = [
    { id: "refund-window", label: "Return window", text: "How many days do I have to return an unused tool?",
      facts: [{ chunk: "refund-policy:0", say: "You can return an unused tool within 45 days of delivery for a full refund." }] },
    { id: "damaged", label: "Damaged tool", text: "What do I do if a tool arrives damaged?",
      facts: [{ chunk: "refund-policy:1", say: "Send a photo within 7 days." },
        { chunk: "refund-policy:2", say: "We send a new tool at no cost." }] },
    { id: "express", label: "Express delivery", text: "How fast is express delivery?",
      facts: [{ chunk: "delivery-times:0", say: "Express delivery takes 1 working day." }],
      invented: { chunk: "delivery-times:2", say: "Express delivery costs 9 euros." } },
    { id: "return-delivery", label: "Return delivery cost", text: "Do I pay for the delivery when I return a tool?", facts: [] },
    { id: "vacation-days", label: "Vacation days", text: "How many vacation days do new employees get?", facts: [] }
  ];
  const CITATION = /\[([a-z0-9-]+(?::[0-9]+)?)\]/g;

  const pipe = () => (window.ACADEMY.ix || {})["l3-1-pipeline"];
  let cachedIndex = null;
  /* The service loads the index one time. The toy does the same. */
  function index() {
    if (!cachedIndex) cachedIndex = pipe().buildIndex(20);
    return cachedIndex;
  }

  function parseCitations(answer) {
    const out = [];
    let m;
    CITATION.lastIndex = 0;
    while ((m = CITATION.exec(answer)) !== null) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }

  function toyReply(q, inPrompt) {
    const parts = q.facts.filter((f) => inPrompt.includes(f.chunk)).map((f) => f.say.replace(/\.$/, "") + " [" + f.chunk + "].");
    if (q.invented) parts.push(q.invented.say.replace(/\.$/, "") + " [" + q.invented.chunk + "].");
    return parts.length ? parts.join(" ") : IDK + ".";
  }

  function buildUser(question, sources) {
    return sources.map((s) => '<source id="' + s.id + '">\n' + s.text + "\n</source>\n").join("") + "Question: " + question;
  }

  function compute(state) {
    const st = Object.assign({}, DEFAULT, state || {});
    const P = pipe();
    const ix = index();
    const q = QUESTIONS.find((x) => x.id === st.q) || QUESTIONS[0];
    const k = KS.includes(st.k) ? st.k : DEFAULT.k;
    const min = MINS.includes(st.min) ? st.min : DEFAULT.min;
    const ranked = P.search(ix, q.text).map((h, i) => {
      const reason = i >= k ? "after k" : h.score < min ? "below " + min : "";
      return { rank: i + 1, id: h.chunk.id, doc: h.chunk.doc, sections: h.chunk.sections, text: h.chunk.text, score: h.score, kept: !reason, reason };
    });
    const sources = ranked.filter((r) => r.kept);
    const ids = sources.map((s) => s.id);
    const byId = {};
    ix.chunks.forEach((c) => { byId[c.id] = c; });
    let status, answer, cited = [], called = false;
    const system = SYSTEM_LINES.join("\n");
    const user = sources.length ? buildUser(q.text, sources) : "";
    if (!sources.length) {
      status = "no_sources"; answer = IDK;
    } else {
      called = true;
      answer = toyReply(q, ids);
      cited = parseCitations(answer);
      if (answer.toLowerCase().includes(IDK.toLowerCase()) && !cited.length) status = "abstained";
      else status = cited.length && cited.every((c) => ids.includes(c)) ? "answered" : "unsupported";
    }
    const citations = cited.map((c) => ({ id: c, doc: byId[c] && ids.includes(c) ? byId[c].doc : null,
      sections: byId[c] && ids.includes(c) ? byId[c].sections.slice() : [] }));
    const response = { status, answer, citations, sources: sources.map((s) => ({ id: s.id, score: +s.score.toFixed(3) })) };
    const health = { status: "ok", embedder: ix.manifest.embedder.model, dim: ix.manifest.embedder.dim, chunks: ix.manifest.chunks, prompt: PROMPT };
    return { question: q, k, min, counts: P.counts(q.text), vector: P.embed(q.text), ranked, sources, called, system, user,
      answer, cited, status, citations, response, health };
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const vec = (v) => "[" + v.map((x) => x.toFixed(3)).join(", ") + "]";
  const STATUS_TAG = { answered: "ok", abstained: "info", no_sources: "warn", unsupported: "bad" };
  const STATUS_TEXT = {
    answered: "Every cited id was retrieved. The answer is supported by the sources in the prompt.",
    abstained: "The model said \"I don't know\" and cited nothing. The sources did not contain the answer.",
    no_sources: "No chunk passed the filter, so the code returned \"I don't know\" and did not call the model. This costs nothing.",
    unsupported: "The answer cites an id that was not retrieved. The service must not show it as a supported answer."
  };

  function mount(el) {
    let state = Object.assign({}, DEFAULT);

    function resultHtml() {
      const r = compute(state);
      const P = pipe();
      const rows = r.ranked.slice(0, 6).map((x) => `<tr><td>${x.rank}</td><td><code>${esc(x.id)}</code></td><td>${x.score.toFixed(3)}</td><td>${x.kept ? '<span class="tag ok">in the prompt</span>' : `<span class="tag">${esc(x.reason)}</span>`}</td></tr>`).join("");
      const checks = r.cited.map((c) => {
        const ok = r.sources.some((s) => s.id === c);
        return `<tr><td><code>${esc(c)}</code></td><td>${ok ? '<span class="tag ok">retrieved</span>' : '<span class="tag bad">not retrieved</span>'}</td></tr>`;
      }).join("");
      return `<div class="kv">
          <div>Status<b>${esc(r.status)}</b></div>
          <div>In the prompt<b>${r.sources.length} of ${r.ranked.length}</b></div>
          <div>Model call<b>${r.called ? "yes" : "no"}</b></div>
          <div>Best score<b>${r.ranked[0].score.toFixed(3)}</b></div>
        </div>
        <p class="ix-group">1. Embed the question (same embedder as the index)</p>
        <p>Word-list counts (${P.DIMS.join(", ")}): <code>${r.counts.join(", ")}</code>. Vector: <code style="white-space:normal;overflow-wrap:anywhere">${vec(r.vector)}</code></p>
        <p class="ix-group">2. Rank the chunks, then keep the top ${r.k} with a score of at least ${r.min}</p>
        <div class="table-wrap"><table><tr><th>Rank</th><th>Chunk</th><th>Score</th><th>Result</th></tr>${rows}</table></div>
        <p class="muted">The table shows the first 6 of ${r.ranked.length} chunks. Cosine of two unit vectors is their dot product.</p>
        <p class="ix-group">3. The prompt (${esc(PROMPT)})</p>
        ${r.called ? `<pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>System: ${esc(r.system)}\n\nUser: ${esc(r.user)}</code></pre>`
          : `<p>No prompt. No chunk passed the filter, so the model is not called.</p>`}
        <p class="ix-group">4. The answer and the citation check</p>
        <p>${r.called ? "Toy model: " : "Code: "}"${esc(r.answer)}"</p>
        ${r.cited.length ? `<div class="table-wrap"><table><tr><th>Cited id</th><th>Check</th></tr>${checks}</table></div>` : ""}
        <p><span class="tag ${STATUS_TAG[r.status]}">${esc(r.status)}</span> ${esc(STATUS_TEXT[r.status])}</p>
        <p class="ix-group">5. The response of POST /ask</p>
        <pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${esc(JSON.stringify(r.response, null, 2))}</code></pre>
        <p class="muted">GET /health: <code style="white-space:normal;overflow-wrap:anywhere">${esc(JSON.stringify(r.health))}</code></p>`;
    }

    function sync() {
      el.querySelectorAll("[data-ix-act]").forEach((b) => {
        const a = b.dataset.ixAct, v = b.dataset.v;
        const on = (a === "q" && v === state.q) || (a === "k" && +v === state.k) || (a === "min" && +v === state.min);
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
    }
    function update() { sync(); el.querySelector(".ix-result").innerHTML = resultHtml(); }

    el.innerHTML = `<div class="ix-title">Ask the index <span class="tag accent">real search, fake embedder, toy model</span></div>
      <p class="ix-lead">Select a question. Then change k and the minimum score, and watch which chunks go into the prompt, what the model cites and which of the four statuses the code returns.</p>
      <div class="ix-controls">
        <p class="ix-group">Question</p>
        <div class="row" role="group" aria-label="Question">${QUESTIONS.map((q) => `<button type="button" data-ix-act="q" data-v="${q.id}" title="${esc(q.text)}">${esc(q.label)}</button>`).join("")}</div>
        <p class="ix-group">k (chunks in the prompt)</p>
        <div class="row" role="group" aria-label="k">${KS.map((n) => `<button type="button" data-ix-act="k" data-v="${n}">k = ${n}</button>`).join("")}</div>
        <p class="ix-group">Minimum score</p>
        <div class="row" role="group" aria-label="Minimum score">${MINS.map((n) => `<button type="button" data-ix-act="min" data-v="${n}">${n}</button>`).join("")}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. "Damaged tool" at k = 3 is answered, but the photo rule is missing: refund-policy:1 is fourth. Select k = 4. "Express delivery" at k = 1 gets only "the next working day.". "Vacation days" at the minimum 0.3 calls the model for nothing.
      The search is real on the index of lesson 3.1. The embedder is the fake of the tests, and the model is a toy with visible rules.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a) || a.disabled) return;
      const act = a.dataset.ixAct, v = a.dataset.v;
      if (act === "q") state.q = v;
      else if (act === "k") state.k = +v;
      else if (act === "min") state.min = +v;
      else return;
      update();
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l32Unbind === "function") el._l32Unbind();
    el.addEventListener("click", onClick);
    el._l32Unbind = () => el.removeEventListener("click", onClick);
    update();
  }
  mount.mount = mount;
  mount.compute = compute;
  mount.parseCitations = parseCitations;
  mount.QUESTIONS = QUESTIONS;
  mount.SYSTEM_LINES = SYSTEM_LINES;
  mount.PROMPT = PROMPT;
  mount.KS = KS;
  mount.MINS = MINS;
  mount.DEFAULT = DEFAULT;
  mount.IDK = IDK;
  window.ACADEMY.ix["l3-2-ask"] = mount;
})();
