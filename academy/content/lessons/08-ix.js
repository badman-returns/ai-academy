/*
 * Interactive for lesson 1.8: "l1-8-grounding".
 * It shows why a model without sources gives a fluent guess, and how retrieved
 * sources (grounding, RAG) change the answer.
 * The learner selects a question, switches grounding on or off, sets the number of
 * passages (k) and the minimum cosine score, switches the "I don't know" instruction,
 * uses a stale index, and changes the temperature.
 * Retrieval is computed live: cosine similarity of toy vectors (lesson 1.3).
 * The answer is a toy model, not a real LLM. Its rules are visible and simple:
 *   - Each candidate answer has a made-up prior logit: what the weights "remember".
 *   - A retrieved passage that states a candidate adds COPY to that logit.
 *   - With the instruction on, "I don't know" gets ABSTAIN when no passage in the
 *     prompt states an answer.
 *   - Softmax with temperature gives the probabilities (lesson 1.1).
 * All facts about "Northwind Tools" are fictional. The same numbers are in the
 * fixture of ticket T-008 (data/grounding_faq.json).
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-8-grounding"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const IDK = "I don't know";
  const COPY = 5;
  const ABSTAIN = 4;
  /* Toy fixture. Vector dimensions: money, it, shipping, people. */
  const TOY = {
    dimensions: ["money", "it", "shipping", "people"],
    documents: [
      { id: "refund-policy", title: "Refund policy", vector: [0.8, 0, 0.3, 0],
        text: "You can return an unused tool within 45 days of delivery for a full refund.",
        answers: { "refund-window": "45 days" } },
      { id: "warranty-claims", title: "Warranty claims", vector: [0.6, 0.1, 0.4, 0],
        text: "Power tools have a 2-year warranty. Send the claim form with a photo of the serial number.",
        answers: { "warranty-length": "2 years" } },
      { id: "vpn-setup", title: "VPN setup", vector: [0.1, 0.9, 0, 0],
        text: "Install the NWConnect app and sign in with your company account.",
        answers: {} },
      { id: "delivery-times", title: "Delivery times", vector: [0.2, 0, 0.9, 0],
        text: "Standard delivery takes 3 to 5 working days. Express delivery takes 1 working day.",
        answers: {} }
    ],
    /* The old version of the refund policy. The "stale index" option uses it instead of the current version. */
    stale: { id: "refund-policy", text: "You can return an unused tool within 30 days of delivery for a full refund.",
      answers: { "refund-window": "30 days" } },
    questions: [
      { id: "refund-window", text: "How many days do I have to return a tool?", vector: [0.9, 0.1, 0.2, 0],
        truth: "45 days",
        prior: { "14 days": 1.0, "30 days": 2.0, "45 days": 0.0, "60 days": 0.5, [IDK]: -1.0 } },
      { id: "warranty-length", text: "How long is the warranty on power tools?", vector: [0.7, 0, 0.35, 0],
        truth: "2 years",
        prior: { "1 year": 1.8, "2 years": 1.0, "3 years": 0.6, "5 years": 0.4, [IDK]: -1.0 } },
      { id: "vacation-days", text: "How many vacation days do new employees get?", vector: [0.1, 0, 0, 1.0],
        truth: null,
        prior: { "20 days": 1.5, "25 days": 1.2, "30 days": 0.8, [IDK]: -1.0 } }
    ]
  };
  const SHORT = { "refund-policy": "refund", "warranty-claims": "warranty", "vpn-setup": "vpn", "delivery-times": "delivery" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const len = (a) => Math.sqrt(dot(a, a));
  const cosine = (a, b) => { const n = len(a) * len(b); return n ? dot(a, b) / n : 0; };

  /* Softmax with temperature. Subtract the maximum first, so exp() does not overflow. */
  function softmax(logits, t) {
    const z = logits.map((x) => x / t);
    const m = Math.max(...z);
    const ex = z.map((x) => Math.exp(x - m));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map((e) => e / s);
  }

  /*
   * Retrieval: rank all documents by cosine, highest first (ties keep the input order),
   * then keep the first k documents with a score of at least minScore.
   */
  function retrieve(question, k, minScore, stale) {
    const docs = TOY.documents.map((d) => (stale && d.id === TOY.stale.id ? Object.assign({}, d, { text: TOY.stale.text, answers: TOY.stale.answers }) : d));
    const ranked = docs.map((d, i) => ({ doc: d, i, score: cosine(question.vector, d.vector) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    ranked.forEach((r, rank) => { r.rank = rank + 1; r.kept = rank < k && r.score >= minScore; });
    return ranked;
  }

  /*
   * The full computation that the interactive shows.
   * opts: { q (question id), ground, k (1 to 4), minScore (0 to 0.9), instruct, stale, temp }.
   */
  function compute(opts) {
    const o = Object.assign({ q: "refund-window", ground: false, k: 1, minScore: 0.5, instruct: false, stale: false, temp: 1 }, opts || {});
    const question = TOY.questions.find((x) => x.id === o.q) || TOY.questions[0];
    const ranked = retrieve(question, o.k, o.minScore, o.stale);
    const sources = o.ground ? ranked.filter((r) => r.kept).map((r) => r.doc) : [];
    const names = Object.keys(question.prior);
    const support = {};
    sources.forEach((d) => { const a = d.answers[question.id]; if (a) (support[a] = support[a] || []).push(d.id); });
    const answered = Object.keys(support).length > 0;
    const logits = names.map((n) => question.prior[n] + (support[n] ? COPY : 0) + (n === IDK && o.instruct && !answered ? ABSTAIN : 0));
    const probs = softmax(logits, o.temp);
    const candidates = names.map((n, i) => ({
      answer: n,
      logit: logits[i],
      p: probs[i],
      sources: support[n] || [],
      outcome: n === IDK ? (question.truth === null ? "correct" : "abstain") : (n === question.truth ? "correct" : "wrong")
    }));
    const top = candidates.reduce((b, c) => (c.p > b.p ? c : b), candidates[0]);
    const sum = (kind) => candidates.filter((c) => c.outcome === kind).reduce((a, c) => a + c.p, 0);
    let verdict;
    if (top.answer === IDK) verdict = question.truth === null ? "abstain-right" : "abstain-miss";
    else if (!top.sources.length) verdict = "unsupported";
    else verdict = top.answer === question.truth ? "grounded" : "stale";
    return {
      opts: o, question, ranked, sources, answered, candidates, top, verdict,
      pCorrect: sum("correct"), pAbstain: question.truth === null ? 0 : sum("abstain"), pWrong: sum("wrong")
    };
  }

  const pct = (p) => (Math.round(p * 1000) / 10).toFixed(1) + "%";
  const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
  const VERDICT = {
    "grounded": ["ok", "Grounded", "The most likely answer comes from a retrieved source, and the model can cite it."],
    "unsupported": ["bad", "Hallucination risk", "The most likely answer is not in any source in the prompt. It comes from the weights only, and it can be wrong with no warning."],
    "stale": ["bad", "Wrong source", "The answer has a citation, but the source is out of date. Grounding is only as good as the index."],
    "abstain-miss": ["warn", "Abstains", "The model says it does not know. This is safe, but the answer was in the documents: retrieval did not find it."],
    "abstain-right": ["ok", "Abstains correctly", "No document has the answer, so \"I don't know\" is the correct answer."]
  };

  function mount(el) {
    let q = "refund-window", ground = false, k = 1, minAt = 5, instruct = false, stale = false, tempAt = 3;
    const TEMPS = [0.25, 0.5, 0.75, 1, 1.5, 2];

    /* The result part. It changes on every input. The controls stay in place, so a slider keeps the pointer while you drag it. */
    function resultHtml() {
      const r = compute({ q, ground, k, minScore: minAt / 10, instruct, stale, temp: TEMPS[tempAt] });
      const docRows = r.ranked.map((x) => {
        const cls = ground ? (x.kept ? "chosen" : "cut") : "cut";
        return `<div class="bar-row ${cls}"><span class="lbl" title="${esc(x.doc.id)}">${esc(SHORT[x.doc.id])}</span><span class="track"><i style="width:${(Math.max(0, x.score) * 100).toFixed(1)}%"></i></span><span class="val">${x.score.toFixed(3)}</span></div>`;
      }).join("");
      const sys = instruct
        ? "Answer only from the sources. Cite the source id in square brackets. If the sources do not contain the answer, say \"I don't know\"."
        : "You are the Northwind Tools assistant. Answer the question.";
      const srcRows = r.sources.length
        ? r.sources.map((d) => `<tr><td><b>Source: ${esc(d.id)}</b><br><code>${esc(d.text)}</code></td></tr>`).join("")
        : `<tr><td><b>Sources</b><br><span style="color: var(--text-secondary)">${ground ? "No document passed the k and minimum score filters." : "Grounding is off. The prompt has no sources."}</span></td></tr>`;
      // Two inline styles keep the lesson CSS unchanged: the lesson CSS keeps ".muted" text in a result cell on one line,
      // and it keeps a bar label on one line. On a phone, "I don't know" must wrap, and the long source notes must wrap.
      const ansRows = r.candidates.map((c) =>
        `<div class="bar-row ${c === r.top ? "chosen" : ""}"><span class="lbl" style="white-space: normal" title="${esc(c.answer)}">${esc(c.answer)}</span><span class="track"><i style="width:${(c.p * 100).toFixed(1)}%"></i></span><span class="val">${pct(c.p)}</span></div>`).join("");
      const v = VERDICT[r.verdict];
      const cite = r.top.sources.length ? " [" + r.top.sources.join(", ") + "]" : "";
      const abstainBox = r.question.truth === null ? "" : `<div>Says "I don't know"<b>${pct(r.pAbstain)}</b></div>`;
      return `<p class="ix-group">1. Retrieval: cosine of the question and each document</p>
          <div class="bars">${docRows}</div>
          <p class="muted">${ground ? `Green rows go into the prompt: the top ${k} with a score of at least ${f2(minAt / 10)}.` : "Grounding is off, so no document goes into the prompt."}</p>
          <p class="ix-group">2. The prompt that the model gets</p>
          <div class="table-wrap"><table>
            <tr><th>Message part</th></tr>
            <tr><td><b>System</b><br><code>${esc(sys)}</code></td></tr>
            ${srcRows}
            <tr><td><b>Question</b><br><code>${esc(r.question.text)}</code></td></tr>
          </table></div>
          <p class="ix-group">3. Probability of each answer (toy model, temperature ${TEMPS[tempAt]})</p>
          <div class="bars">${ansRows}</div>
          <div class="kv"><div class="ix-key">Most likely answer<b>${esc(r.top.answer + cite)}</b></div><div>Correct<b>${pct(r.pCorrect)}</b></div>${abstainBox}<div>Wrong<b>${pct(r.pWrong)}</b></div></div>
          <p><span class="tag ${v[0]}">${esc(v[1])}</span> ${esc(v[2])}</p>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="q"]').forEach((b) => {
        const on = b.dataset.q === q;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelector('[data-out="k"]').textContent = String(k);
      el.querySelector('[data-out="min"]').textContent = f2(minAt / 10);
      el.querySelector('[data-out="temp"]').textContent = String(TEMPS[tempAt]);
      el.querySelector('[data-ix-opt="k"]').setAttribute("aria-valuetext", k + (k > 1 ? " passages" : " passage"));
      el.querySelector('[data-ix-opt="min"]').setAttribute("aria-valuetext", "minimum score " + f2(minAt / 10));
      el.querySelector('[data-ix-opt="temp"]').setAttribute("aria-valuetext", "temperature " + TEMPS[tempAt]);
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const qBtns = TOY.questions.map((x) =>
      `<button type="button" data-ix-act="q" data-q="${esc(x.id)}">${esc(x.text)}</button>`).join("");
    const box = (opt, on, label) => `<label class="ix-check"><input type="checkbox" data-ix-opt="${opt}" ${on ? "checked" : ""}><span>${label}</span></label>`;
    // The ids must be unique on the page, so they include a counter.
    const uid = "l18-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">Grounding: from a guess to a cited answer <span class="tag accent">toy model, computed live</span></div>
      <p class="ix-lead">A fictional company, Northwind Tools, has four help documents. The model never saw them in training.
      Ask a question, then put the retrieved documents into the prompt and see how the answer changes. The answer part is a toy model with made-up numbers, not a real LLM.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Question"><span>Question:</span>${qBtns}</div>
        <div class="row">${box("ground", ground, "Grounding (RAG): put the retrieved documents in the prompt")}${box("instruct", instruct, "Instruction: say \"I don't know\" when the sources do not contain the answer")}${box("stale", stale, "Stale index: it has the old refund policy")}</div>
        <div class="slider-row"><label for="${uid}-k">Passages to retrieve (k)</label><input id="${uid}-k" type="range" min="1" max="4" step="1" value="${k}" data-ix-opt="k"><b data-out="k"></b></div>
        <div class="slider-row"><label for="${uid}-min">Minimum cosine score</label><input id="${uid}-min" type="range" min="0" max="9" step="1" value="${minAt}" data-ix-opt="min"><b data-out="min"></b></div>
        <div class="slider-row"><label for="${uid}-temp">Temperature</label><input id="${uid}-temp" type="range" min="0" max="${TEMPS.length - 1}" step="1" value="${tempAt}" data-ix-opt="temp"><b data-out="temp"></b></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. With grounding off, look at the most likely refund answer. Then switch grounding on.
      Select the warranty question with k = 1, then set k = 2. Switch on the instruction and select the vacation question.
      Switch on the stale index with the refund question. Change the temperature and look at the share of wrong answers.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "q") { q = a.dataset.q; update(); }
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const key = o.dataset.ixOpt;
      if (key === "k") k = +o.value;
      else if (key === "min") minAt = +o.value;
      else if (key === "temp") tempAt = +o.value;
      else if (key === "ground") ground = o.checked;
      else if (key === "instruct") instruct = o.checked;
      else if (key === "stale") stale = o.checked;
      update();
    };
    // Sliders update on "input" (live while you drag). Check boxes update on "change".
    const onInput = (ev) => { if (ev.target.type === "range") onOpt(ev); };
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l18Unbind === "function") el._l18Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l18Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.cosine = cosine;
  mount.softmax = softmax;
  mount.TOY = TOY;
  mount.COPY = COPY;
  mount.ABSTAIN = ABSTAIN;
  window.ACADEMY.ix["l1-8-grounding"] = mount;
})();
