/*
 * Interactive for lesson 2.3: "l2-3-cot" ("Reason, then answer").
 * It shows one hard helpdesk message and the response of the triage in two modes:
 *   direct: the model writes only the answer, in <answer> tags.
 *   reason: the model writes its reasoning in <reasoning> tags, then the answer in <answer> tags.
 * The learner turns the reasoning on and off, selects what came back from the model, and
 * sets the number of messages per day. The page shows the raw response, what the employee
 * sees after the code takes out the answer, and the cost of both modes with the cost
 * formula of lesson 1.1.
 * The message, the responses and the token counts are made up for teaching. They are not
 * measurements of a real model.
 * The model is fixed to Claude Haiku 5.5: lesson 2.3 explains why the prompted reasoning
 * mode uses Haiku 5.5 with thinking off. The prices come from the price table in app.js
 * (A.logic.MODELS), the same table as lesson 1.1. Check the pricing page before you use them.
 * Computed numbers (Node, before they were written):
 *   direct: 1,180 in, 48 out  -> $0.000118 + $0.000024 = $0.000142 per message
 *   reason: 1,240 in, 150 out -> $0.000124 + $0.000075 = $0.000199 per message (1.40 times)
 *   2,000 messages a day: direct $0.284, reason $0.398.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l2-3-cot"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const MODEL_ID = "claude-haiku-5-5";
  /* The same prices as the Haiku 5.5 row of A.logic.MODELS in app.js (USD per million tokens). */
  const FALLBACK_MODEL = { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", in: 0.10, out: 0.50, longIn: 0.50, longOut: 2.50, longAbove: 100000 };
  /* app.js loads after this file, so read the table when it is used, not at load time. */
  function model() {
    const L = window.ACADEMY.logic;
    const list = (L && L.MODELS) || [];
    return list.find((m) => m.id === MODEL_ID) || FALLBACK_MODEL;
  }

  const MESSAGE = "Since the move to floor 3 on Monday, my badge does not open the lab door. Facilities checked the reader and says the cause is my access group. We have a safety audit in the lab on Friday at 9:00. Also, do I still get the parking allowance at the new site?";
  const EXPECTED = { category: "IT", priority: "high" };
  /* Example token counts for each mode (made up for teaching). The input of the reason mode is larger by the extra prompt paragraph. */
  const MODES = {
    direct: { name: "Direct", input: 1180, output: 48 },
    reason: { name: "Reason first", input: 1240, output: 150 }
  };
  const SHAPES = ["ok", "none", "two"];
  const SHAPE_NAMES = { ok: "One answer section", none: "No answer tags", two: "Two answer sections" };

  const REASONING = "The badge itself works, and facilities says the cause is the access group. Access groups belong to IT.\n" +
    "The safety audit is on Friday, and the employee cannot work in the lab until then: priority high.\n" +
    "The parking question is a second request with no deadline. It does not change the category.";
  const ANSWER_DIRECT = "category: facilities\npriority: medium";
  const ANSWER_REASON = "category: IT\npriority: high";
  /* The raw text that comes back, for each mode and each shape. */
  const RESPONSES = {
    direct: {
      ok: "<answer>\n" + ANSWER_DIRECT + "\n</answer>",
      none: "Category: facilities. Priority: medium. The badge does not open the lab door after the move.",
      two: "<answer>\ncategory: facilities\npriority: medium\n</answer>\n<answer>\ncategory: IT\npriority: medium\n</answer>"
    },
    reason: {
      ok: "<reasoning>\n" + REASONING + "\n</reasoning>\n<answer>\n" + ANSWER_REASON + "\n</answer>",
      none: "<reasoning>\n" + REASONING + "\n</reasoning>\ncategory: IT\npriority: high",
      two: "<reasoning>\nA badge problem is often facilities: <answer>facilities</answer>. But facilities says the cause is the access group. Access groups belong to IT.\n</reasoning>\n<answer>\n" + ANSWER_REASON + "\n</answer>"
    }
  };

  /*
   * The same rule as extract_answer() in the Python code of lesson 2.3 and ticket T-012:
   * exactly one <answer>...</answer> section, not empty after trimming. Everything else is an error.
   */
  function extractAnswer(text) {
    const found = [];
    const re = /<answer>([\s\S]*?)<\/answer>/g;
    let m;
    while ((m = re.exec(String(text))) !== null) found.push(m[1]);
    if (found.length !== 1) return { ok: false, error: "AnswerFormatError: expected 1 answer section, found " + found.length };
    const answer = found[0].trim();
    if (!answer) return { ok: false, error: "AnswerFormatError: the answer section is empty" };
    return { ok: true, text: answer };
  }

  function field(text, name) {
    const m = new RegExp("^" + name + ":\\s*(.+)$", "m").exec(text);
    return m ? m[1].trim() : null;
  }

  function costOf(mode) {
    const m = model();
    const t = MODES[mode];
    const long = m.longAbove && t.input > m.longAbove;
    const pin = long ? m.longIn : m.in, pout = long ? m.longOut : m.out;
    const cost = { input: t.input * pin / 1e6, output: t.output * pout / 1e6 };
    cost.total = cost.input + cost.output;
    return { inputTokens: t.input, outputTokens: t.output, cost, pin, pout };
  }

  /* opts: { reason: boolean, shape: "ok" | "none" | "two", perDay: messages per day }. */
  function compute(opts) {
    const o = Object.assign({ reason: false, shape: "ok", perDay: 2000 }, opts || {});
    const mode = o.reason ? "reason" : "direct";
    const raw = RESPONSES[mode][o.shape];
    const view = extractAnswer(raw);
    const c = costOf(mode);
    const correct = view.ok && field(view.text, "category") === EXPECTED.category && field(view.text, "priority") === EXPECTED.priority;
    return { opts: o, mode, model: model(), raw, view, correct,
      inputTokens: c.inputTokens, outputTokens: c.outputTokens, cost: c.cost, pin: c.pin, pout: c.pout,
      daily: c.cost.total * o.perDay };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmt = (n) => n.toLocaleString("en-US");
  // The cost of one message is very small, so show six decimals below one cent.
  // Below $1, remove trailing zeros so that the numbers match the lesson text ($0.284, not $0.2840).
  const trim = (t) => t.replace(/(\.\d*?[1-9])0+$/, "$1");
  const usd = (x) => (x < 0.01 ? "$" + trim(x.toFixed(6)) : x < 1 ? "$" + trim(x.toFixed(4)) : "$" + x.toFixed(2));
  /* The two pre blocks and the message use inline styles (wrap long lines, a left border), so no CSS file changes. */
  /* Mark the tags and the reasoning in the raw response, so the learner sees what the code removes. */
  function markRaw(raw) {
    return esc(raw)
      .replace(/&lt;reasoning&gt;([\s\S]*?)&lt;\/reasoning&gt;/g, '<span class="muted">&lt;reasoning&gt;$1&lt;/reasoning&gt;</span>')
      .replace(/&lt;(\/?)answer&gt;/g, "<b>&lt;$1answer&gt;</b>");
  }

  function mount(el) {
    let reason = false, shape = "ok", perDay = 2000;

    function resultHtml() {
      const r = compute({ reason, shape, perDay });
      const d = compute({ reason: false, shape, perDay }), q = compute({ reason: true, shape, perDay });
      const max = Math.max(d.outputTokens, q.outputTokens);
      const pct = (n) => ((n / max) * 100).toFixed(1);
      const bar = (label, x, on) =>
        `<div class="bar-row${on ? " chosen" : ""}"><span class="lbl">${esc(label)}</span><span class="track"><i style="width:${pct(x.outputTokens)}%"></i></span><span class="val">${fmt(x.outputTokens)}</span></div>`;

      let seen;
      if (!r.view.ok) seen = `<p data-part="seen"><b>The code raises an error.</b> <code>${esc(r.view.error)}</code><br>The employee sees a "could not classify, sent to the helpdesk queue" message. The log gets the error and the request id. You pay for this response.</p>`;
      else seen = `<pre data-part="seen" style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${esc(r.view.text)}</code></pre>
        <p>${r.correct ? `<b>Correct route.</b> The sample set label is ${EXPECTED.category}, priority ${EXPECTED.priority}.` : `<b>Wrong route.</b> The sample set label is ${EXPECTED.category}, priority ${EXPECTED.priority}. This answer sends the employee to the wrong team.`}</p>`;

      const row = (x, on) => `<tr${on ? ' class="chosen"' : ""}><td>${esc(MODES[x.mode].name)}${on ? " (selected)" : ""}</td><td>${fmt(x.inputTokens)} / ${fmt(x.outputTokens)}</td><td>${usd(x.cost.total)} a message<br><span class="muted">${usd(x.daily)} a day</span></td></tr>`;

      return `<p class="ix-group">What came back from the model (raw text)</p>
        <pre data-part="raw" style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${markRaw(r.raw)}</code></pre>
        <p class="ix-group">What the employee sees</p>
        ${seen}
        <p class="ix-group">Output tokens of one message in each mode</p>
        <div class="bars">${bar("Direct", d, !reason)}${bar("Reason", q, reason)}</div>
        <div class="kv">
          <div>Input cost<b>${fmt(r.inputTokens)} × $${r.pin.toFixed(2)} / 1M = ${usd(r.cost.input)}</b></div>
          <div>Output cost<b>${fmt(r.outputTokens)} × $${r.pout.toFixed(2)} / 1M = ${usd(r.cost.output)}</b></div>
          <div>Cost of one message<b>${usd(r.cost.total)}</b></div>
          <div>Cost of ${fmt(perDay)} messages a day<b>${usd(r.daily)}</b></div>
        </div>
        <div class="table-wrap"><table>
          <tr><th>Mode</th><th>Tokens in / out</th><th>Cost</th></tr>
          ${row(d, !reason)}${row(q, reason)}
        </table></div>
        <p class="muted">Reason first costs ${(q.cost.total / d.cost.total).toFixed(2)} times the direct mode on this message. The reasoning is output text, and output costs 5 times input on Haiku 5.5. A response that the code rejects costs the same as a good one.</p>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="shape"]').forEach((b) => {
        const on = b.dataset.v === shape;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelector('[data-ix-opt="reason"]').checked = reason;
      el.querySelector('[data-out="day"]').textContent = fmt(perDay);
      el.querySelector('[data-ix-opt="day"]').setAttribute("aria-valuetext", fmt(perDay) + " messages a day");
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const shapeBtns = SHAPES.map((s) => `<button type="button" data-ix-act="shape" data-v="${s}">${esc(SHAPE_NAMES[s])}</button>`).join("");
    // The ids must be unique on the page, so they include a counter.
    const uid = "l23-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">Reason, then answer <span class="tag accent">made-up responses, real price table</span></div>
      <p class="ix-lead">One hard message for the helpdesk triage on Claude Haiku 5.5 with thinking off. Turn the reasoning on and off. Your code shows the employee only the text inside the answer tags.</p>
      <p data-part="message" style="border-left:3px solid var(--border-strong);padding:.2em 0 .2em .8em">${esc(MESSAGE)}</p>
      <div class="ix-controls">
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="reason"><span>Reason first: the prompt asks for &lt;reasoning&gt;, then &lt;answer&gt;</span></label></div>
        <div class="row" role="group" aria-label="What came back"><span>What came back:</span>${shapeBtns}</div>
        <div class="slider-row"><label for="${uid}-day">Messages per day</label><input id="${uid}-day" type="range" min="100" max="20000" step="100" value="${perDay}" data-ix-opt="day"><b data-out="day"></b></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Turn the reasoning on and compare the route and the cost. Then select "No answer tags" and "Two answer sections" in both modes, and see what the code does.
      The message, the responses and the token counts are made up for teaching. Prices: the Haiku 5.5 row of the lesson 1.1 price table, in USD per million tokens.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "shape") { shape = a.dataset.v; update(); }
    };
    // The slider updates on "input" (live while you drag). The check box updates on "change".
    const onInput = (ev) => {
      if (ev.target.dataset && ev.target.dataset.ixOpt === "day" && el.contains(ev.target)) { perDay = +ev.target.value; update(); }
    };
    const onChange = (ev) => {
      if (ev.target.dataset && ev.target.dataset.ixOpt === "reason" && el.contains(ev.target)) { reason = ev.target.checked; update(); }
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l23Unbind === "function") el._l23Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l23Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.extractAnswer = extractAnswer;
  mount.MODEL_ID = MODEL_ID;
  mount.MODES = MODES;
  mount.SHAPES = SHAPES;
  mount.MESSAGE = MESSAGE;
  window.ACADEMY.ix["l2-3-cot"] = mount;
})();
