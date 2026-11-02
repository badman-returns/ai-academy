/*
 * Interactive for lesson 1.9: "l1-9-thinking".
 * It shows how effort, max_tokens and the model change the thinking tokens, the answer,
 * the stop reason and the cost of one request.
 * The learner selects a task, an effort level, a model and max_tokens.
 * The token counts and the "quality bar" rule are made up for teaching. They are not
 * measurements of a real model. In this toy, the model changes only the price.
 * The prices come from the price table in app.js (A.logic.MODELS), the same table as
 * lesson 1.1. Check the pricing page before you use them.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-9-thinking"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
  /*
   * Toy tasks. thinking[i] is the number of thinking tokens at EFFORTS[i].
   * needs is the smallest number of thinking tokens that meets the quality bar (toy rule).
   */
  const TASKS = [
    { id: "classify", name: "Classify a ticket", detail: "Select one label from a fixed list of 6 labels.",
      input: 300, answer: 20, thinking: [0, 150, 400, 900, 1800], needs: 0 },
    { id: "policy", name: "Answer a policy question", detail: "Combine two short policy documents into one answer.",
      input: 3000, answer: 200, thinking: [150, 600, 1400, 2600, 4800], needs: 500 },
    { id: "refund", name: "Compute a refund", detail: "Apply 4 refund rules in the correct order to one order history.",
      input: 900, answer: 250, thinking: [300, 1200, 2800, 5000, 9000], needs: 2500 }
  ];
  const MAX_TOKENS = [1024, 2048, 4096, 8192, 16000, 32000];
  /* The same prices as A.logic.MODELS in app.js (USD per million tokens). */
  const FALLBACK_MODELS = [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", in: 4, out: 20 },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", in: 2, out: 10 },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", in: 0.10, out: 0.50, longIn: 0.50, longOut: 2.50, longAbove: 100000 }
  ];
  /* app.js loads after this file, so read the table when it is used, not at load time. */
  function models() {
    const L = window.ACADEMY.logic;
    return (L && L.MODELS) || FALLBACK_MODELS;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmt = (n) => n.toLocaleString("en-US");
  // Below $1, show four significant decimals, so a small cost does not round to $0.00.
  const usd = (x) => (x < 1 ? "$" + x.toFixed(4) : "$" + x.toFixed(2));

  /*
   * One request. opts: { task (0 to 2), effort (0 to 4), model (0 to 2), maxTokens }.
   * Thinking comes first and uses max_tokens first. The answer gets what is left.
   * Thinking tokens are billed as output tokens.
   */
  function compute(opts) {
    const o = Object.assign({ task: 2, effort: 1, model: 0, maxTokens: 4096 }, opts || {});
    const t = TASKS[o.task];
    const m = models()[o.model];
    const planned = t.thinking[o.effort];
    const thinking = Math.min(planned, o.maxTokens);
    const answer = Math.min(t.answer, o.maxTokens - thinking);
    const stop = planned + t.answer > o.maxTokens ? "max_tokens" : "end_turn";
    const answerState = answer === t.answer ? "complete" : answer > 0 ? "cut off" : "none";
    const output = thinking + answer;
    const long = m.longAbove && t.input > m.longAbove;
    const pin = long ? m.longIn : m.in, pout = long ? m.longOut : m.out;
    const cost = { input: t.input * pin / 1e6, output: output * pout / 1e6 };
    cost.total = cost.input + cost.output;
    const outcome = stop === "max_tokens" ? "no usable answer" : planned >= t.needs ? "meets the bar" : "below the bar";
    return { opts: o, task: t, model: m, effort: EFFORTS[o.effort], planned, thinking, answer, answerState,
      stop, output, inputTokens: t.input, cost, outcome };
  }

  /* All five effort levels for the same task, model and max_tokens. */
  function sweep(opts) {
    const rows = EFFORTS.map((_, i) => compute(Object.assign({}, opts, { effort: i })));
    let best = -1;
    rows.forEach((r, i) => { if (r.outcome === "meets the bar" && (best < 0 || r.cost.total < rows[best].cost.total)) best = i; });
    return { rows, cheapest: best };
  }

  function mount(el) {
    let task = 2, effort = 1, model = 0, maxAt = 2, summarized = false;

    function resultHtml() {
      const opts = { task, effort, model, maxTokens: MAX_TOKENS[maxAt] };
      const r = compute(opts);
      const s = sweep(opts);
      const max = r.opts.maxTokens;
      const pct = (n) => ((n / max) * 100).toFixed(1);
      // "muted" gives a grey bar without the line-through of the "cut" class (inline, so no CSS change).
      const bar = (label, n, cls, val, muted) =>
        `<div class="bar-row ${cls}"><span class="lbl">${esc(label)}</span><span class="track"><i style="width:${pct(n)}%${muted ? ";background:var(--text-muted);opacity:.45" : ""}"></i></span><span class="val">${esc(val)}</span></div>`;
      const bars = bar("Thinking", r.thinking, "", fmt(r.thinking)) +
        bar("Answer", r.answer, r.answerState === "complete" ? "chosen" : "cut", fmt(r.answer)) +
        bar("Left over", max - r.output, "", fmt(max - r.output), true);

      let verdict;
      if (r.stop === "max_tokens" && r.answerState === "none") verdict = `<b>No answer.</b> Thinking used all ${fmt(max)} tokens of max_tokens. The response has a thinking block and no text block. You pay for the thinking.`;
      else if (r.stop === "max_tokens") verdict = `<b>The answer is cut off.</b> Thinking used ${fmt(r.thinking)} tokens, so only ${fmt(r.answer)} of ${fmt(r.task.answer)} answer tokens fit. Raise max_tokens or lower the effort.`;
      else if (r.outcome === "below the bar") verdict = `<b>The answer is complete, but below the quality bar</b> (toy rule: this task needs at least ${fmt(r.task.needs)} thinking tokens). Try a higher effort.`;
      else verdict = `<b>The answer is complete and meets the quality bar</b> (toy rule).` + (s.cheapest >= 0 && s.cheapest < effort ? ` Effort "${EFFORTS[s.cheapest]}" also meets it at a lower cost.` : "");

      const vis = summarized ? "a summary of the thinking (display: \"summarized\")" : "an empty string (display: \"omitted\", the default)";
      const sRows = s.rows.map((x, i) => {
        const cls = i === effort ? ' class="chosen"' : "";
        const mark = i === s.cheapest ? " <b>(cheapest)</b>" : "";
        const outcome = x.stop === "max_tokens" ? `no answer: <code>max_tokens</code>` : esc(x.outcome);
        return `<tr${cls}><td>${esc(EFFORTS[i])}${i === effort ? " (selected)" : ""}<br><span class="muted">${fmt(x.thinking)} thinking</span></td><td>${outcome}${mark}</td><td>${usd(x.cost.total)}</td></tr>`;
      }).join("");

      return `<p class="ix-group">One request: ${esc(r.task.name)}, effort "${esc(r.effort)}", ${esc(r.model.name)}</p>
        <div class="bars">${bars}</div>
        <p data-part="verdict">${verdict}</p>
        <div class="kv">
          <div>stop_reason<b><code>${r.stop}</code></b></div>
          <div>usage.<wbr>output_tokens<b>${fmt(r.output)}</b></div>
          <div>Cost of one request<b>${usd(r.cost.total)}</b></div>
          <div>Share of the cost from output<b>${Math.round((r.cost.output / r.cost.total) * 100)}%</b></div>
          <div>Cost of 1,000 requests<b>${usd(r.cost.total * 1000)}</b></div>
        </div>
        <p class="muted">The thinking field of the thinking block contains ${vis}. The billed thinking tokens are the same for both display settings.</p>
        <p class="ix-group">All effort levels for this task, model and max_tokens</p>
        <p class="muted">"(cheapest)" marks the effort with the lowest cost that meets the quality bar.</p>
        <div class="table-wrap"><table>
          <tr><th>Effort</th><th>Toy outcome</th><th>Cost</th></tr>
          ${sRows}
        </table></div>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="task"]').forEach((b) => {
        const on = +b.dataset.i === task;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="model"]').forEach((b) => {
        const on = +b.dataset.i === model;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      const t = TASKS[task];
      el.querySelector('[data-out="task"]').textContent = t.detail + " Input: " + fmt(t.input) + " tokens. Full answer: " + fmt(t.answer) + " tokens.";
      el.querySelector('[data-out="effort"]').textContent = EFFORTS[effort];
      el.querySelector('[data-out="max"]').textContent = fmt(MAX_TOKENS[maxAt]);
      el.querySelector('[data-ix-opt="effort"]').setAttribute("aria-valuetext", EFFORTS[effort]);
      el.querySelector('[data-ix-opt="max"]').setAttribute("aria-valuetext", fmt(MAX_TOKENS[maxAt]) + " tokens");
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const taskBtns = TASKS.map((x, i) => `<button type="button" data-ix-act="task" data-i="${i}">${esc(x.name)}</button>`).join("");
    const modelBtns = models().map((x, i) => `<button type="button" data-ix-act="model" data-i="${i}">${esc(x.name.replace("Claude ", ""))}</button>`).join("");
    // The ids must be unique on the page, so they include a counter.
    const uid = "l19-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">Thinking tokens, max_tokens and cost <span class="tag accent">toy token counts, real price table</span></div>
      <p class="ix-lead">Select a task and an effort level. The model thinks first, then writes the answer. Both parts count against max_tokens, and both are billed as output tokens.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Task"><span>Task:</span>${taskBtns}</div>
        <p class="muted" data-out="task"></p>
        <div class="slider-row"><label for="${uid}-effort">Effort</label><input id="${uid}-effort" type="range" min="0" max="${EFFORTS.length - 1}" step="1" value="${effort}" data-ix-opt="effort"><b data-out="effort"></b></div>
        <div class="slider-row"><label for="${uid}-max">max_tokens</label><input id="${uid}-max" type="range" min="0" max="${MAX_TOKENS.length - 1}" step="1" value="${maxAt}" data-ix-opt="max"><b data-out="max"></b></div>
        <div class="row" role="group" aria-label="Model"><span>Model:</span>${modelBtns}</div>
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="display" ${summarized ? "checked" : ""}><span>Show a thinking summary (display: "summarized")</span></label></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select "Compute a refund" and move the effort from low to max. Then raise max_tokens.
      Select "Classify a ticket" and compare the cost at low and at max. Switch the model and see that only the cost changes in this toy.
      The token counts and the quality rule are made up for teaching. Prices: the price table of lesson 1.1, in USD per million tokens.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "task") { task = +a.dataset.i; update(); }
      if (a.dataset.ixAct === "model") { model = +a.dataset.i; update(); }
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt;
      if (k === "effort") effort = +o.value;
      else if (k === "max") maxAt = +o.value;
      else if (k === "display") summarized = o.checked;
      update();
    };
    // Sliders update on "input" (live while you drag). The check box updates on "change".
    const onInput = (ev) => { if (ev.target.type === "range") onOpt(ev); };
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l19Unbind === "function") el._l19Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l19Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.sweep = sweep;
  mount.TASKS = TASKS;
  mount.EFFORTS = EFFORTS;
  mount.MAX_TOKENS = MAX_TOKENS;
  window.ACADEMY.ix["l1-9-thinking"] = mount;
})();
