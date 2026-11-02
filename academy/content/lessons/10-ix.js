/*
 * Interactive for lesson 2.1: "l2-1-conversation" (conversation replay).
 * It replays a short support chat of four turns. For each turn, it shows the request
 * that the code sends: the top-level system field and the full messages list.
 * A "forget history" switch shows a common bug: the code sends only the new question.
 * Then the answer loses the earlier context.
 * The texts and the token counts are made up for teaching. They are not measurements
 * of a real model. The answers in the toy are fixed. A real model writes new text.
 * The prices come from the price table in app.js (A.logic.MODELS), the same table as
 * lesson 1.1. Check the pricing page before you use them.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l2-1-conversation"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  /* The top-level system field. It is the same in every request. Toy token count. */
  const SYSTEM = {
    text: "You are the support assistant of Northwind Tools. Answer questions about orders, returns and replacements. Use only the policy text below. [The policy text follows here.]",
    tokens: 400
  };
  /*
   * The four turns. user and answer are the messages when the code keeps the history.
   * forget is the answer when the code sends only the new question (the bug).
   * knows tells if the answer uses the earlier turns correctly.
   */
  const TURNS = [
    { user: { text: "My order NW-4471 arrived with a broken drill. What can I do?", tokens: 30 },
      answer: { text: "I am sorry that the drill arrived broken. For order NW-4471, you can return the drill within 30 days of purchase for a refund, or you can ask for a replacement. When did you buy it?", tokens: 120 },
      forget: { text: "I am sorry that the drill arrived broken. For order NW-4471, you can return the drill within 30 days of purchase for a refund, or you can ask for a replacement. When did you buy it?", tokens: 120 } },
    { user: { text: "I bought it 12 days ago.", tokens: 10 },
      answer: { text: "Then order NW-4471 is inside the 30-day window. You can get a refund or a replacement drill. Which one do you want?", tokens: 80 },
      forget: { text: "Thank you. What did you buy, and how can I help you?", tokens: 25 } },
    { user: { text: "Please send a replacement, not a refund.", tokens: 15 },
      answer: { text: "I opened a replacement request for the drill on order NW-4471. Where do you want the new drill sent?", tokens: 90 },
      forget: { text: "Which product do you want to replace? Please give the order number.", tokens: 20 } },
    { user: { text: "Send it to the address on that order.", tokens: 15 },
      answer: { text: "The replacement drill goes to the delivery address of order NW-4471. You get an email when it ships.", tokens: 60 },
      forget: { text: "Which order do you mean? Please give the order number.", tokens: 20 } }
  ];
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
  // Below $1, show four significant digits (at least four decimals), so a small Haiku cost
  // such as $0.0000535 does not round to $0.0001. Remove the zeros at the end.
  function usd(x) {
    if (x >= 1) return "$" + x.toFixed(2);
    if (x <= 0) return "$0.0000";
    const d = Math.min(10, Math.max(4, 3 - Math.floor(Math.log10(x))));
    return "$" + x.toFixed(d).replace(/(\.\d{4}\d*?)0+$/, "$1");
  }
  // Haiku 5.5 has a higher price above 100K input tokens. The toy stays far below it.
  function price(m, input, output) {
    const long = m.longAbove && input > m.longAbove;
    const c = { input: input * (long ? m.longIn : m.in) / 1e6, output: output * (long ? m.longOut : m.out) / 1e6 };
    c.total = c.input + c.output;
    return c;
  }

  /*
   * One request. opts: { turn (1 to 4), forget (true or false), model (0 to 2) }.
   * With history: the messages list holds all earlier user and assistant messages, then the new question.
   * Without history (the bug): the messages list holds only the new question.
   * The input tokens are the system tokens plus the tokens of all messages in the list.
   */
  function compute(opts) {
    const o = Object.assign({ turn: 1, forget: false, model: 0 }, opts || {});
    const m = models()[o.model];
    const messages = [];
    if (!o.forget) {
      for (let i = 0; i < o.turn - 1; i++) {
        messages.push({ role: "user", text: TURNS[i].user.text, tokens: TURNS[i].user.tokens });
        messages.push({ role: "assistant", text: TURNS[i].answer.text, tokens: TURNS[i].answer.tokens });
      }
    }
    const t = TURNS[o.turn - 1];
    messages.push({ role: "user", text: t.user.text, tokens: t.user.tokens });
    const a = o.forget ? t.forget : t.answer;
    const answer = { text: a.text, tokens: a.tokens, knowsContext: /NW-4471/.test(a.text) };
    const inputTokens = SYSTEM.tokens + messages.reduce((s, x) => s + x.tokens, 0);
    return { opts: o, model: m, system: SYSTEM, messages, inputTokens, outputTokens: answer.tokens, answer,
      cost: price(m, inputTokens, answer.tokens) };
  }

  /* All four turns in one mode, with the totals. */
  function replay(opts) {
    const turns = TURNS.map((_, i) => compute(Object.assign({}, opts, { turn: i + 1 })));
    const totals = turns.reduce((s, r) => ({ input: s.input + r.inputTokens, output: s.output + r.outputTokens, cost: s.cost + r.cost.total }),
      { input: 0, output: 0, cost: 0 });
    return { turns, totals };
  }

  function mount(el) {
    let turn = 1, forget = false, model = 0;

    function resultHtml() {
      const r = compute({ turn, forget, model });
      const roleTag = (role) => `<span class="tag ${role === "user" ? "info" : "accent"}">${role}</span>`;
      const lines = r.messages.map((x, i) => {
        const isNew = i === r.messages.length - 1;
        return `<div>messages[${i}] ${roleTag(x.role)} ${isNew ? "<b>" : ""}${esc(x.text)}${isNew ? "</b>" : ""} <span class="muted">(${fmt(x.tokens)} tokens${isNew ? ", new" : ""})</span></div>`;
      }).join("");
      const request = `<div class="ix-text" data-part="request">
          <div><b>system</b> <span class="muted">(top-level field, ${fmt(r.system.tokens)} tokens)</span> ${esc(r.system.text)}</div>
          ${lines}
        </div>`;

      // One scale for both modes: the largest request with history.
      const scale = compute({ turn: TURNS.length, forget: false, model }).inputTokens;
      const bars = TURNS.slice(0, turn).map((_, i) => {
        const x = compute({ turn: i + 1, forget, model });
        const cls = i + 1 === turn ? "chosen" : "";
        return `<div class="bar-row ${cls}"><span class="lbl">Turn ${i + 1}</span><span class="track"><i style="width:${((x.inputTokens / scale) * 100).toFixed(1)}%"></i></span><span class="val">${fmt(x.inputTokens)}</span></div>`;
      }).join("");

      let total = 0;
      for (let i = 1; i <= turn; i++) total += compute({ turn: i, forget, model }).cost.total;

      const verdict = r.answer.knowsContext
        ? `<b>The answer uses the earlier turns.</b> The model sees the order number because your code sent it again in this request.`
        : `<b>The answer lost the context.</b> The request holds only the new question. The model has no memory of the earlier turns, so it cannot know the order number.`;

      return `<p class="ix-group">Request ${turn}: what your code sends</p>
        ${request}
        <p class="ix-group">Response ${turn}</p>
        <div class="ix-text" data-part="answer">${roleTag("assistant")} ${esc(r.answer.text)} <span class="muted">(${fmt(r.answer.tokens)} tokens)</span></div>
        <p class="ix-outcome" data-part="verdict">${verdict}</p>
        <p class="ix-group">Input tokens of each request so far</p>
        <div class="bars">${bars}</div>
        <div class="kv">
          <div>Messages in this request<b>${r.messages.length}</b></div>
          <div>usage.<wbr>input_tokens<b>${fmt(r.inputTokens)}</b></div>
          <div>Cost of this request<b>${usd(r.cost.total)}</b></div>
          <div>Cost of turns 1 to ${turn}<b>${usd(total)}</b></div>
        </div>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="turn"]').forEach((b) => {
        const on = +b.dataset.i === turn;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="model"]').forEach((b) => {
        const on = +b.dataset.i === model;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelector('[data-ix-act="prev"]').disabled = turn === 1;
      el.querySelector('[data-ix-act="next"]').disabled = turn === TURNS.length;
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const turnBtns = TURNS.map((_, i) => `<button type="button" data-ix-act="turn" data-i="${i + 1}">${i + 1}</button>`).join("");
    const modelBtns = models().map((x, i) => `<button type="button" data-ix-act="model" data-i="${i}">${esc(x.name.replace("Claude ", ""))}</button>`).join("");
    el.innerHTML = `<div class="ix-title">Conversation replay <span class="tag accent">toy texts and token counts, real price table</span></div>
      <p class="ix-lead">Step through a support chat of four turns. Each turn is one new API request. The API keeps nothing between requests, so your code sends the system prompt and the full messages list each time.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Turn"><span>Turn:</span><button type="button" data-ix-act="prev">Previous</button>${turnBtns}<button type="button" data-ix-act="next">Next</button></div>
        <div class="row" role="group" aria-label="Model"><span>Model:</span>${modelBtns}</div>
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="forget"><span>Forget history (a bug: the code sends only the new question)</span></label></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Go from turn 1 to turn 4 and see the messages list and the input tokens grow. Then set "Forget history" and step again.
      The requests get smaller and cheaper, but at turn 2 the answer already lost the order number.
      The texts and the token counts are made up for teaching. Prices: the price table of lesson 1.1, in USD per million tokens.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      const k = a.dataset.ixAct;
      if (k === "turn") turn = +a.dataset.i;
      else if (k === "prev") turn = Math.max(1, turn - 1);
      else if (k === "next") turn = Math.min(TURNS.length, turn + 1);
      else if (k === "model") model = +a.dataset.i;
      else return;
      update();
    };
    const onChange = (ev) => {
      const o = ev.target.closest('[data-ix-opt="forget"]');
      if (!o || !el.contains(o)) return;
      forget = o.checked;
      update();
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l21Unbind === "function") el._l21Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el._l21Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
    };
    update();
  }

  mount.mount = mount;
  mount.compute = compute;
  mount.replay = replay;
  mount.TURNS = TURNS;
  mount.SYSTEM = SYSTEM;
  mount.usd = usd;
  window.ACADEMY.ix["l2-1-conversation"] = mount;
})();
