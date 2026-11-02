/*
 * Interactive for lesson 2.4: "l2-4-validate".
 * It validates one model reply against the TriageResult schema of ticket T-013, shows the errors
 * and the retry message that the code sends back, and runs the retry loop with a retry limit.
 * The learner selects or edits the reply, selects what the model does on a retry, the retry
 * limit and the model.
 * The validator copies the rules of this Pydantic 2 model (strict mode, extra fields forbidden):
 *   category: Literal["IT", "HR", "facilities", "finance", "other"]  (CATEGORIES of ticket T-011)
 *   priority: Literal["low", "medium", "high"]                    (PRIORITIES of ticket T-011)
 *   summary: str, 1 to 200 characters
 *   needs_human: bool
 * The error types and messages are the ones that Pydantic 2.13.5 gave for this model in a local
 * run (2026-11-02). The JSON parse messages copy the format of the Pydantic JSON parser. A
 * reply that this small parser cannot classify gets a general message.
 * The token counts are made up for teaching. The prices come from the price table in app.js
 * (A.logic.MODELS), the same table as lesson 1.1. Check the pricing page before you use them.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l2-4-validate"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const CATEGORIES = ["IT", "HR", "facilities", "finance", "other"];
  const PRIORITIES = ["low", "medium", "high"];
  const FIELDS = ["category", "priority", "summary", "needs_human"];
  const VALID = '{"category": "IT", "priority": "medium", "summary": "Laptop does not start after the update.", "needs_human": false}';
  /* The six replies that the learner can select. stop is the stop_reason of the reply. */
  const OUTPUTS = [
    { id: "valid", name: "Valid JSON", stop: "end_turn", text: VALID },
    { id: "prose", name: "JSON inside prose", stop: "end_turn", text: "Here is the triage result:\n" + VALID },
    { id: "missing", name: "A missing field", stop: "end_turn",
      text: '{"category": "IT", "priority": "medium", "summary": "Laptop does not start after the update."}' },
    { id: "type", name: "A wrong type", stop: "end_turn",
      text: '{"category": "IT", "priority": "medium", "summary": "Laptop does not start after the update.", "needs_human": "yes"}' },
    { id: "enum", name: "A value outside the enum", stop: "end_turn",
      text: '{"category": "laptop", "priority": "medium", "summary": "Laptop does not start after the update.", "needs_human": false}' },
    { id: "cut", name: "Cut off at max_tokens", stop: "max_tokens",
      text: '{"category": "IT", "priority": "medium", "summary": "Laptop does not start' }
  ];
  /* What the model does on a retry. after: the retry that gives a valid reply. */
  const BEHAVIORS = [
    { id: "fix1", name: "Fixes it on retry 1", after: 1 },
    { id: "fix2", name: "Fixes it on retry 2", after: 2 },
    { id: "never", name: "Makes the same error again", after: Infinity }
  ];
  /* Toy token counts: system prompt with the schema + the employee message, each reply, each retry message. */
  const TOKENS = { base: 800, reply: 50, retry: 60 };
  const MAX_RETRIES = 3;
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
  function price(model, inTok, outTok) {
    const L = window.ACADEMY.logic;
    if (L && L.cost) return L.cost(model, inTok, outTok).total;
    const long = model.longAbove && inTok > model.longAbove;
    return inTok * (long ? model.longIn : model.in) / 1e6 + outTok * (long ? model.longOut : model.out) / 1e6;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmt = (n) => n.toLocaleString("en-US");
  // Below $1, show six decimals, so a small cost does not round to $0.00.
  const usd = (x) => (x < 1 ? "$" + x.toFixed(6) : "$" + x.toFixed(2));

  /*
   * A small JSON parser. It returns a tree of nodes with the JSON type of each value, so the
   * validator can tell the string "true" from the boolean true, as strict Pydantic does.
   * On an error it throws { msg, line, col } in the format of the Pydantic JSON parser.
   */
  function parseJson(text) {
    const n = text.length;
    let i = 0;
    function where(at) {
      // at = index of the bad character, or -1 for the end of the text. The position is the
      // place after that character, as in the Pydantic parser: a bad newline gives column 0.
      const read = text.slice(0, at < 0 ? n : at + 1);
      const lines = read.split("\n");
      return { line: lines.length, col: lines[lines.length - 1].length };
    }
    function fail(msg, at) { const p = where(at); throw { msg, line: p.line, col: p.col }; }
    function ws() { while (i < n && " \t\n\r".includes(text[i])) i++; }
    function value() {
      ws();
      if (i >= n) fail("EOF while parsing a value", -1);
      const c = text[i];
      if (c === "{") return object();
      if (c === "[") return array();
      if (c === '"') return { t: "str", v: string() };
      if (c === "-" || (c >= "0" && c <= "9")) return number();
      for (const [word, node] of [["true", { t: "bool", v: true }], ["false", { t: "bool", v: false }], ["null", { t: "null" }]]) {
        if (c === word[0]) {
          for (let k = 0; k < word.length; k++) {
            if (i + k >= n) fail("EOF while parsing a value", -1);
            if (text[i + k] !== word[k]) fail("expected ident", i + k);
          }
          i += word.length;
          return node;
        }
      }
      fail("expected value", i);
    }
    function string() {
      i++;
      let s = "";
      while (true) {
        if (i >= n) fail("EOF while parsing a string", -1);
        const c = text[i];
        if (c === '"') { i++; return s; }
        if (c < " ") fail("control character (\\u0000-\\u001F) found while parsing a string", i);
        if (c === "\\") {
          if (i + 1 >= n) fail("EOF while parsing a string", -1);
          const e = text[i + 1];
          const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (e in map) { s += map[e]; i += 2; continue; }
          if (e === "u") {
            for (let k = i + 2; k < i + 6; k++) {
              if (k >= n) fail("EOF while parsing a string", -1);
              if (!/[0-9a-fA-F]/.test(text[k])) fail("invalid escape", k);
            }
            s += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue;
          }
          fail("invalid escape", i + 1);
        }
        s += c; i++;
      }
    }
    function number() {
      const start = i;
      let isInt = true;
      if (text[i] === "-") i++;
      if (i >= n) fail("EOF while parsing a value", -1);
      if (text[i] === "0") { i++; if (text[i] >= "0" && text[i] <= "9") fail("invalid number", i); }
      else if (text[i] >= "1" && text[i] <= "9") { while (i < n && text[i] >= "0" && text[i] <= "9") i++; }
      else fail("invalid number", i);
      if (text[i] === ".") {
        isInt = false; i++;
        if (i >= n) fail("EOF while parsing a value", -1);
        if (!(text[i] >= "0" && text[i] <= "9")) fail("invalid number", i);
        while (i < n && text[i] >= "0" && text[i] <= "9") i++;
      }
      if (text[i] === "e" || text[i] === "E") {
        isInt = false; i++;
        if (text[i] === "+" || text[i] === "-") i++;
        if (i >= n) fail("EOF while parsing a value", -1);
        if (!(text[i] >= "0" && text[i] <= "9")) fail("invalid number", i);
        while (i < n && text[i] >= "0" && text[i] <= "9") i++;
      }
      return { t: "num", v: Number(text.slice(start, i)), int: isInt };
    }
    function object() {
      i++;
      const entries = [];
      ws();
      if (i >= n) fail("EOF while parsing an object", -1);
      if (text[i] === "}") { i++; return { t: "obj", entries }; }
      while (true) {
        ws();
        if (i >= n) fail("EOF while parsing a value", -1);
        if (text[i] !== '"') fail("key must be a string", i);
        const key = string();
        ws();
        if (i >= n) fail("EOF while parsing an object", -1);
        if (text[i] !== ":") fail("expected `:`", i);
        i++;
        entries.push([key, value()]);
        ws();
        if (i >= n) fail("EOF while parsing an object", -1);
        if (text[i] === "}") { i++; return { t: "obj", entries }; }
        if (text[i] !== ",") fail("expected `,` or `}`", i);
        i++;
        ws();
        if (text[i] === "}") fail("trailing comma", i);
      }
    }
    function array() {
      i++;
      const items = [];
      ws();
      if (i >= n) fail("EOF while parsing a list", -1);
      if (text[i] === "]") { i++; return { t: "arr", items }; }
      while (true) {
        items.push(value());
        ws();
        if (i >= n) fail("EOF while parsing a list", -1);
        if (text[i] === "]") { i++; return { t: "arr", items }; }
        if (text[i] !== ",") fail("expected `,` or `]`", i);
        i++;
        ws();
        if (text[i] === "]") fail("trailing comma", i);
      }
    }
    const root = value();
    ws();
    if (i < n) fail("trailing characters", i);
    return root;
  }

  /*
   * Validate one reply like TriageResult.model_validate_json(text) in strict mode.
   * Returns { ok, value, errors: [{ type, loc, msg }] }. loc is a list of field names.
   */
  function validate(text) {
    let root;
    try { root = parseJson(String(text)); }
    catch (e) {
      if (!e || typeof e.msg !== "string") throw e;
      const m = e.msg + " at line " + e.line + " column " + e.col;
      return { ok: false, errors: [{ type: "json_invalid", loc: [], msg: "Invalid JSON: " + m }] };
    }
    if (root.t !== "obj") return { ok: false, errors: [{ type: "model_type", loc: [], msg: "Input should be an object" }] };
    // A key that appears twice keeps its last value, as in Pydantic.
    const map = new Map();
    root.entries.forEach(([k, v]) => { map.delete(k); map.set(k, v); });
    const errors = [];
    const err = (type, loc, msg) => errors.push({ type, loc: [loc], msg });
    // A Literal field compares the exact text, in strict mode and in lax mode.
    const literalMsg = (vals) => "Input should be " + vals.slice(0, -1).map((c) => "'" + c + "'").join(", ") + " or '" + vals[vals.length - 1] + "'";
    // Pydantic lists the extra fields first, in the order of the reply, then the model fields.
    map.forEach((_, k) => { if (!FIELDS.includes(k)) err("extra_forbidden", k, "Extra inputs are not permitted"); });
    const value = {};
    FIELDS.forEach((f) => {
      if (!map.has(f)) return err("missing", f, "Field required");
      const v = map.get(f);
      if (f === "category") {
        if (v.t !== "str" || !CATEGORIES.includes(v.v)) return err("literal_error", f, literalMsg(CATEGORIES));
      } else if (f === "priority") {
        if (v.t !== "str" || !PRIORITIES.includes(v.v)) return err("literal_error", f, literalMsg(PRIORITIES));
      } else if (f === "summary") {
        if (v.t !== "str") return err("string_type", f, "Input should be a valid string");
        const len = Array.from(v.v).length;
        if (len < 1) return err("string_too_short", f, "String should have at least 1 character");
        if (len > 200) return err("string_too_long", f, "String should have at most 200 characters");
      } else if (f === "needs_human") {
        if (v.t !== "bool") return err("bool_type", f, "Input should be a valid boolean");
      }
      value[f] = v.v;
    });
    return errors.length ? { ok: false, errors } : { ok: true, value, errors: [] };
  }

  /* The retry message of ticket T-013: one line for each error, then the instruction. */
  function retryMessage(errors) {
    return "Your last reply did not match the schema.\n" +
      errors.map((e) => "- " + (e.loc.length ? e.loc.join(".") : "reply") + ": " + e.msg).join("\n") +
      "\nReply again with only the JSON object. Do not add text before or after it.";
  }

  /*
   * The retry loop. opts: { text, stop, behavior (0 to 2), maxRetries (0 to 3), model (0 to 2) }.
   * Attempt k (k = 0 is the first call) resends the history: the first request, then one reply
   * and one retry message for each earlier attempt. So its input is base + k × (reply + retry).
   * The code checks stop_reason first. A reply cut off at max_tokens is not retried.
   */
  function run(opts) {
    const o = Object.assign({ text: OUTPUTS[2].text, stop: "end_turn", behavior: 0, maxRetries: 2, model: 2 }, opts || {});
    const m = models()[o.model];
    const after = BEHAVIORS[o.behavior].after;
    const attempts = [];
    let status = "failed";
    for (let k = 0; k <= o.maxRetries; k++) {
      const fixed = k >= after;
      const reply = fixed ? { text: VALID, stop: "end_turn" } : { text: o.text, stop: o.stop };
      const inputTokens = TOKENS.base + k * (TOKENS.reply + TOKENS.retry);
      const a = { n: k + 1, text: reply.text, stop: reply.stop, inputTokens, outputTokens: TOKENS.reply,
        cost: price(m, inputTokens, TOKENS.reply) };
      attempts.push(a);
      if (reply.stop === "max_tokens") { a.result = "cut off"; status = "cut_off"; break; }
      const v = validate(reply.text);
      a.errors = v.errors;
      if (v.ok) { a.result = "valid"; a.value = v.value; status = "valid"; break; }
      a.result = "invalid";
      if (k < o.maxRetries) a.retryMessage = retryMessage(v.errors);
    }
    const sum = (key) => attempts.reduce((s, a) => s + a[key], 0);
    const total = sum("cost");
    const oneCall = price(m, TOKENS.base, TOKENS.reply);
    return { opts: o, model: m, attempts, status, calls: attempts.length, retries: attempts.length - 1,
      inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), cost: total, oneCall, ratio: total / oneCall };
  }

  function mount(el) {
    let sample = 2, text = OUTPUTS[2].text, stop = OUTPUTS[2].stop, behavior = 0, maxRetries = 2, model = 2;

    function errorTable(errors) {
      // Two columns, so the table fits a phone screen: loc and type in one cell, msg in the other.
      const rows = errors.map((e) => `<tr><td>${e.loc.length ? `<code>${esc(e.loc.join("."))}</code>` : "(whole reply)"}<br><code data-part="type">${esc(e.type)}</code></td><td>${esc(e.msg)}</td></tr>`).join("");
      return `<div class="table-wrap"><table><tr><th>loc and type</th><th>msg</th></tr>${rows}</table></div>`;
    }

    function resultHtml() {
      const r = run({ text, stop, behavior, maxRetries, model });
      const first = r.attempts[0];
      let check;
      if (first.result === "cut off") {
        check = `<p><b>The code does not validate this reply.</b> <code>stop_reason</code> is <code>max_tokens</code>, so the JSON is cut off. A retry with the same <code>max_tokens</code> is cut off again. The code raises an error that names <code>max_tokens</code>.</p>`;
      } else if (first.result === "valid") {
        const v = first.value;
        check = `<p><b>Valid.</b> The code gets a <code>TriageResult</code>: category <code>${esc(v.category)}</code>, priority <code>${esc(v.priority)}</code>, needs_human <code>${esc(v.needs_human)}</code>.</p>`;
      } else {
        check = `<p><b>Not valid: ${first.errors.length} error${first.errors.length > 1 ? "s" : ""}.</b> These are the entries of <code>ValidationError.errors()</code>.</p>` + errorTable(first.errors);
      }
      const retryBlock = first.result === "invalid"
        ? `<p class="ix-group">The retry message (one more user turn)</p>` + (first.retryMessage
          ? `<pre style="white-space: pre-wrap; overflow-wrap: anywhere"><code>${esc(first.retryMessage)}</code></pre>`
          : `<p class="muted">The retry limit is 0, so the code sends no retry message. It raises the error at once.</p>`)
        : "";

      const rows = r.attempts.map((a) => {
        const res = a.result === "valid" ? "valid" : a.result === "cut off" ? "cut off: no retry" : `${a.errors.length} error${a.errors.length > 1 ? "s" : ""}<br><code>${esc(a.errors[0].type)}</code>`;
        return `<tr${a.result === "valid" ? ' class="chosen"' : ""}><td>${a.n === 1 ? "1" : a.n + "<br>retry " + (a.n - 1)}</td><td>${fmt(a.inputTokens)}<br>${usd(a.cost)}</td><td>${res}</td></tr>`;
      }).join("");

      let verdict;
      if (r.status === "valid" && r.retries === 0) verdict = `<b>Valid on the first call.</b> No retry. This is the cost of one call.`;
      else if (r.status === "valid") verdict = `<b>Valid after ${r.retries} retr${r.retries > 1 ? "ies" : "y"}.</b> Each retry resent the history, so each retry has more input tokens than the call before it.`;
      else if (r.status === "cut_off") verdict = `<b>Stopped: cut off.</b> The loop checks <code>stop_reason</code> before it validates. It raises a clear error and does not retry. Raise <code>max_tokens</code> or make the output shorter.`;
      else verdict = `<b>Stopped by the retry limit.</b> ${r.calls} call${r.calls > 1 ? "s" : ""} gave no valid reply. The code raises <code>TriageError</code> with the last errors. It does not loop again.`;

      return `<p class="ix-group">Step 1: validate the reply</p>
        ${check}
        ${retryBlock}
        <p class="ix-group">Step 2: the retry loop</p>
        <div class="table-wrap"><table>
          <tr><th>Call</th><th>Input tokens<br>and cost</th><th>Result</th></tr>
          ${rows}
        </table></div>
        <p data-part="verdict">${verdict}</p>
        <div class="kv">
          <div class="ix-key">Retries used<b data-part="counter">${r.retries} of ${maxRetries}</b></div>
          <div>Calls<b>${r.calls}</b></div>
          <div>Total input tokens<b>${fmt(r.inputTokens)}</b></div>
          <div>Total cost<b>${usd(r.cost)}</b></div>
          <div>Compared to one call<b>${r.ratio.toFixed(2)}×</b></div>
        </div>`;
    }

    function update() {
      const press = (act, cur) => el.querySelectorAll(`[data-ix-act="${act}"]`).forEach((b) => {
        const on = +b.dataset.i === cur;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      press("sample", sample); press("behavior", behavior); press("model", model);
      el.querySelector('[data-out="stop"]').textContent = stop;
      el.querySelector('[data-out="edited"]').textContent = sample < 0 ? " (edited)" : "";
      el.querySelector('[data-out="max"]').textContent = String(maxRetries);
      el.querySelector('[data-ix-opt="max"]').setAttribute("aria-valuetext", maxRetries + " retries");
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const sampleBtns = OUTPUTS.map((x, i) => `<button type="button" data-ix-act="sample" data-i="${i}">${esc(x.name)}</button>`).join("");
    const behaviorBtns = BEHAVIORS.map((x, i) => `<button type="button" data-ix-act="behavior" data-i="${i}">${esc(x.name)}</button>`).join("");
    const modelBtns = models().map((x, i) => `<button type="button" data-ix-act="model" data-i="${i}">${esc(x.name.replace("Claude ", ""))}</button>`).join("");
    // The ids must be unique on the page, so they include a counter.
    const uid = "l24-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">Validator and retry <span class="tag accent">Pydantic rules, toy token counts</span></div>
      <p class="ix-lead">Select a reply from the model, or edit it. The page checks it against the <code>TriageResult</code> schema, shows the errors and the retry message, and runs the retry loop until the reply is valid or the retry limit stops it.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Model reply"><span>Reply:</span>${sampleBtns}</div>
        <label for="${uid}-text">The reply of the model<span data-out="edited"></span>. You can edit it.</label>
        <textarea id="${uid}-text" data-ix-opt="text" spellcheck="false" style="font-family:var(--mono);font-size:13px;min-height:88px"></textarea>
        <p class="muted">stop_reason of this reply: <code data-out="stop"></code></p>
        <div class="row" role="group" aria-label="On a retry"><span>On a retry, the model:</span>${behaviorBtns}</div>
        <div class="slider-row"><label for="${uid}-max">Retry limit</label><input id="${uid}-max" type="range" min="0" max="${MAX_RETRIES}" step="1" value="${maxRetries}" data-ix-opt="max"><b data-out="max"></b></div>
        <div class="row" role="group" aria-label="Model"><span>Model:</span>${modelBtns}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select "JSON inside prose" and read the error: one character of prose makes the whole reply invalid. Select "A missing field" and set the retry limit to 0, then to 2.
      Select "Makes the same error again" and see the limit stop the loop. Edit the reply: change <code>false</code> to <code>"true"</code> (strict mode does not accept a string for a boolean), or change <code>"IT"</code> to <code>"it"</code> (a <code>Literal</code> compares the exact case).
      Token counts are made up for teaching: ${fmt(TOKENS.base)} input tokens for the first call, ${fmt(TOKENS.reply)} tokens for each reply and ${fmt(TOKENS.retry)} tokens for each retry message. Prices: the price table of lesson 1.1, in USD per million tokens.</p>`;
    el.querySelector('[data-ix-opt="text"]').value = text;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      const k = a.dataset.ixAct, i = +a.dataset.i;
      if (k === "sample") {
        sample = i; text = OUTPUTS[i].text; stop = OUTPUTS[i].stop;
        el.querySelector('[data-ix-opt="text"]').value = text;
      }
      if (k === "behavior") behavior = i;
      if (k === "model") model = i;
      update();
    };
    // The text box and the slider update on "input" (live while you type or drag).
    const onInput = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      if (o.dataset.ixOpt === "text") {
        text = o.value;
        // An edited reply keeps the stop_reason of the reply that it came from.
        if (sample >= 0 && text !== OUTPUTS[sample].text) sample = -1;
      }
      if (o.dataset.ixOpt === "max") maxRetries = +o.value;
      update();
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l24Unbind === "function") el._l24Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el._l24Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.parseJson = parseJson;
  mount.validate = validate;
  mount.retryMessage = retryMessage;
  mount.run = run;
  mount.OUTPUTS = OUTPUTS;
  mount.BEHAVIORS = BEHAVIORS;
  mount.TOKENS = TOKENS;
  mount.VALID = VALID;
  window.ACADEMY.ix["l2-4-validate"] = mount;
})();
