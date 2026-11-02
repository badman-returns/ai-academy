/*
 * Interactive for lesson 2.6: "l2-6-cache", the cache prefix simulator.
 * It shows one triage request as five blocks, in the order that the API reads them:
 * tools, system prompt, examples, history and the new message.
 * The learner puts the cache breakpoint after one block, selects the block that changes
 * between two calls, the time between the calls, the cache lifetime and the model.
 * The page shows, for call 1 and call 2, which blocks are a cache write, a cache read or
 * normal input, the three usage fields, and the cost.
 * The token counts are made up for teaching. The cache rules and the prices are real:
 *   - Base prices: the price table in app.js (A.logic.MODELS), the same table as lesson 1.1.
 *   - Multipliers, minimum length and lifetimes: the Claude API docs pages "Pricing" and
 *     "Prompt caching", checked on 2026-11-02. Check them again before you use them.
 * Simplifications: a call is a cache hit only when every block before the breakpoint is the
 * same as in the call before. The gap is measured from the start of one call to the start of
 * the next. In the toy, the history does not grow between the calls.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l2-6-cache"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  /* The request, in the order that the API reads it: tools, then system, then messages. */
  const BLOCKS = [
    { id: "tools", name: "Tools", detail: "The tool definition of the triage result", tokens: 400 },
    { id: "system", name: "System prompt", detail: "Role, categories, priority rules", tokens: 1600 },
    { id: "examples", name: "Examples", detail: "Three labeled helpdesk messages", tokens: 2400 },
    { id: "history", name: "History", detail: "Earlier turns of the conversation", tokens: 1000 },
    { id: "question", name: "New message", detail: "The employee message to triage", tokens: 100 }
  ];
  /* The triage result. Caching does not change the output. */
  const OUTPUT_TOKENS = 150;
  /* breakpoint = the number of blocks before the cache breakpoint (0 = no breakpoint). */
  const BREAKPOINTS = ["No breakpoint", "After the tools", "After the system prompt", "After the examples", "After the history", "After the new message"];
  /* Short button labels for the breakpoint and the gap. */
  const BP_SHORT = ["None", "Tools", "System prompt", "Examples", "History", "New message"];
  const GAP_NAMES = ["1 minute", "10 minutes", "2 hours"];
  /* change = the index of the first block that is different in call 2. The new message always changes. */
  const CHANGES = [
    { block: 4, name: "Only the new message" },
    { block: 3, name: "Edit an earlier turn" },
    { block: 2, name: "Edit one example" },
    { block: 1, name: "Timestamp in the system prompt" },
    { block: 0, name: "Change the tool order" }
  ];
  /* Minutes from the start of call 1 to the start of call 2. */
  const GAPS = [1, 10, 120];
  /* The sample set of the ticket has about 20 messages. */
  const N_CALLS = 20;
  /*
   * Source: the Claude API docs pages "Pricing" and "Prompt caching", checked on 2026-11-02.
   * Write: 1.25 x the base input price for the 5-minute lifetime, 2 x for the 1-hour lifetime.
   * Read: 0.05 x on Opus 5.5 and Sonnet 5.5, 0.1 x on the other models (Haiku 5.5 included).
   * Minimum cacheable prefix: 512 tokens on Opus 5.5, Sonnet 5.5 and Haiku 5.5.
   */
  const CACHE = {
    write5m: 1.25, write1h: 2,
    read: { "claude-opus-5-5": 0.05, "claude-sonnet-5-5": 0.05 }, readDefault: 0.1,
    minTokens: 512, ttl5m: 5, ttl1h: 60, checked: "2026-11-02"
  };
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
  // Small costs need more decimals, so that they do not round to $0.0000.
  // Show the exact value up to 6 decimals, with at least 2 decimals, so that $0.00828 does not round to $0.0083.
  const usd = (x) => "$" + x.toFixed(6).replace(/0+$/, "").replace(/\.(\d)?$/, (m, d) => "." + (d || "0") + "0");
  // A price per million tokens: "$4" for a whole number, else at least 2 decimals ("$0.20", "$0.125").
  const price = (x) => (Number.isInteger(+x.toFixed(6)) ? "$" + Math.round(x) : usd(x));
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);

  /* USD per million tokens for each kind of input token, and for output. */
  function rates(m, longTtl, promptTokens) {
    // On Haiku 5.5, a prompt above the threshold pays the long prices. Cache reads and writes count.
    const long = !!(m.longAbove && promptTokens > m.longAbove);
    const base = long ? m.longIn : m.in;
    const read = CACHE.read[m.id] !== undefined ? CACHE.read[m.id] : CACHE.readDefault;
    return { input: base, write: base * (longTtl ? CACHE.write1h : CACHE.write5m), read: base * read,
      output: long ? m.longOut : m.out, long };
  }

  /*
   * Two calls of the same request. opts: { model (0 to 2), breakpoint (0 to 5),
   * change (the index of the first block that changes, 0 to 4), gap (0 to 2), longTtl }.
   */
  function compute(opts) {
    const o = Object.assign({ model: 0, breakpoint: 3, change: 4, gap: 0, longTtl: false }, opts || {});
    const m = models()[o.model];
    const total = sum(BLOCKS.map((b) => b.tokens));
    const prefix = sum(BLOCKS.slice(0, o.breakpoint).map((b) => b.tokens));
    const belowMin = o.breakpoint > 0 && prefix < CACHE.minTokens;
    const cacheOn = o.breakpoint > 0 && !belowMin;
    const ttl = o.longTtl ? CACHE.ttl1h : CACHE.ttl5m;
    const gapMin = GAPS[o.gap];
    const sameprefix = Math.min(o.change, 4) >= o.breakpoint;
    const expired = gapMin >= ttl;
    const hit = cacheOn && sameprefix && !expired;
    const reason = o.breakpoint === 0 ? "no_breakpoint" : belowMin ? "below_minimum" : !sameprefix ? "prefix_changed" : expired ? "expired" : "hit";
    const r = rates(m, o.longTtl, total);

    function call(read) {
      const usage = {
        input_tokens: total - (cacheOn ? prefix : 0),
        cache_creation_input_tokens: cacheOn && !read ? prefix : 0,
        cache_read_input_tokens: cacheOn && read ? prefix : 0
      };
      const parts = {
        input: usage.input_tokens * r.input / 1e6,
        write: usage.cache_creation_input_tokens * r.write / 1e6,
        read: usage.cache_read_input_tokens * r.read / 1e6,
        output: OUTPUT_TOKENS * r.output / 1e6
      };
      const states = BLOCKS.map((b, i) => (cacheOn && i < o.breakpoint ? (read ? "read" : "write") : "input"));
      // The model computes keys and values for every token that is not a cache read (lesson 1.7).
      const computed = usage.input_tokens + usage.cache_creation_input_tokens;
      return { usage, parts, states, computed, cost: parts.input + parts.write + parts.read + parts.output };
    }
    const call1 = call(false), call2 = call(hit);
    const noCache = { cost: (total * r.input + OUTPUT_TOKENS * r.output) / 1e6, computed: total };
    // Every later call sees the entry of the call before, so it behaves like call 2.
    const runs = { n: N_CALLS, cached: call1.cost + (N_CALLS - 1) * call2.cost, uncached: N_CALLS * noCache.cost };
    runs.saving = 1 - runs.cached / runs.uncached;
    return { opts: o, model: m, rates: r, total, prefix, belowMin, cacheOn, ttl, gapMin, hit, reason,
      call1, call2, noCache, runs, outputTokens: OUTPUT_TOKENS };
  }

  function mount(el) {
    let model = 0, bp = 3, change = 4, gap = 0, longTtl = false;
    // Short labels keep the three columns inside a phone screen. The lead text names them in full.
    const LABEL = { read: "read", write: "write", input: "input" };
    const TAG = { read: "tag ok", write: "tag warn", input: "tag" };

    function resultHtml() {
      const r = compute({ model, breakpoint: bp, change, gap, longTtl });
      const rows = BLOCKS.map((b, i) => {
        const changed = i >= Math.min(change, 4) ? ", changes" : "";
        return `<tr><td><b>${esc(b.name)}</b><br><span class="muted">${fmt(b.tokens)} tokens${changed}</span></td>` +
          `<td><span class="${TAG[r.call1.states[i]]}">${LABEL[r.call1.states[i]]}</span></td>` +
          `<td><span class="${TAG[r.call2.states[i]]}">${LABEL[r.call2.states[i]]}</span></td></tr>` +
          (i === bp - 1 ? `<tr><td colspan="3"><span class="tag accent">cache breakpoint</span> <span class="muted">The cached prefix ends here: ${fmt(r.prefix)} tokens.</span></td></tr>` : "");
      }).join("");

      const ttlName = longTtl ? "1 hour" : "5 minutes";
      const verdicts = {
        no_breakpoint: `<b>No cache.</b> The request has no breakpoint, so every call pays the full input price for all ${fmt(r.total)} tokens.`,
        below_minimum: `<b>No cache, and no error.</b> The prefix has only ${fmt(r.prefix)} tokens. The minimum is ${fmt(CACHE.minTokens)} tokens, so the API does not cache it. <code>cache_creation_input_tokens</code> is 0.`,
        prefix_changed: `<b>Call 2 misses the cache.</b> A block before the breakpoint changed, so the prefix is not the same. Call 2 writes the prefix again and pays the write price again.` +
          (bp === 5 ? " The breakpoint is after the new message, and the new message changes on every call. So no call can ever read the cache." : ""),
        expired: `<b>Call 2 misses the cache.</b> The calls start ${fmt(r.gapMin)} minutes apart, and the cache lifetime is ${ttlName}. The entry expired, so call 2 writes it again.`,
        hit: `<b>Call 2 reads the cache.</b> All blocks before the breakpoint are the same, and call 2 starts within the lifetime (${ttlName}). The read also starts the lifetime again.`
      };
      const pct = Math.round(Math.abs(r.runs.saving) * 100);
      const runLine = r.runs.saving > 0.0005
        ? `With the cache, ${r.runs.n} calls cost <b>${usd(r.runs.cached)}</b> instead of ${usd(r.runs.uncached)}: ${pct}% less.`
        : r.runs.saving < -0.0005
          ? `With this breakpoint, ${r.runs.n} calls cost <b>${usd(r.runs.cached)}</b> instead of ${usd(r.runs.uncached)}: ${pct}% <b>more</b> than with no cache. Every call pays the write price.`
          : `${r.runs.n} calls cost ${usd(r.runs.uncached)}, the same as with no cache.`;
      const usageKv = (c) => `<div>input_tokens<b>${fmt(c.usage.input_tokens)}</b></div>
          <div>cache_creation_<wbr>input_tokens<b>${fmt(c.usage.cache_creation_input_tokens)}</b></div>
          <div>cache_read_<wbr>input_tokens<b>${fmt(c.usage.cache_read_input_tokens)}</b></div>`;

      return `<div class="table-wrap"><table>
          <tr><th>Block (API order)</th><th>Call 1</th><th>Call 2</th></tr>
          ${rows}
        </table></div>
        <p data-part="verdict">${verdicts[r.reason]}</p>
        <p class="ix-group">Call 1 (the cache is empty)</p>
        <div class="kv">${usageKv(r.call1)}<div>Cost<b>${usd(r.call1.cost)}</b></div></div>
        <p class="ix-group">Call 2 (${fmt(r.gapMin)} minute${r.gapMin === 1 ? "" : "s"} later)</p>
        <div class="kv">${usageKv(r.call2)}<div>Cost<b>${usd(r.call2.cost)}</b></div>
          <div>Tokens to compute before the first output token<b>${fmt(r.call2.computed)} of ${fmt(r.total)}</b></div></div>
        <p>${runLine}</p>
        <p class="muted">Prices for ${esc(r.model.name)} in USD per million tokens: input ${price(r.rates.input)}, cache write ${price(r.rates.write)} (${longTtl ? "2" : "1.25"} × input),
          cache read ${price(r.rates.read)}, output ${price(r.rates.output)}. Each call also has ${fmt(r.outputTokens)} output tokens. Caching does not change the output.</p>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="change"]').forEach((b) => {
        const on = +b.dataset.i === change;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="model"]').forEach((b) => {
        const on = +b.dataset.i === model;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="bp"]').forEach((b) => {
        const on = +b.dataset.i === bp;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="gap"]').forEach((b) => {
        const on = +b.dataset.i === gap;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const changeBtns = CHANGES.map((x) => `<button type="button" data-ix-act="change" data-i="${x.block}">${esc(x.name)}</button>`).join("");
    const bpBtns = BP_SHORT.map((x, i) => `<button type="button" data-ix-act="bp" data-i="${i}">${esc(x)}</button>`).join("");
    const gapBtns = GAP_NAMES.map((x, i) => `<button type="button" data-ix-act="gap" data-i="${i}">${esc(x)}</button>`).join("");
    const modelBtns = models().map((x, i) => `<button type="button" data-ix-act="model" data-i="${i}">${esc(x.name.replace("Claude ", ""))}</button>`).join("");
    // The ids must be unique on the page, so they include a counter.
    const uid = "l26-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">Cache prefix simulator <span class="tag accent">toy token counts, real cache prices</span></div>
      <p class="ix-lead">The same triage request is sent two times. Put the cache breakpoint after a block, and select what changes in call 2. Each block is a <span class="tag warn">cache write</span>, a <span class="tag ok">cache read</span> or normal <span class="tag">input</span>.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Cache breakpoint after"><span>Cache breakpoint after:</span>${bpBtns}</div>
        <div class="row" role="group" aria-label="What changes in call 2"><span>What changes in call 2:</span>${changeBtns}</div>
        <div class="row" role="group" aria-label="Time from call 1 to call 2"><span>Time to call 2:</span>${gapBtns}</div>
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="ttl" ${longTtl ? "checked" : ""}><span>Use the 1-hour cache lifetime (the default is 5 minutes)</span></label></div>
        <div class="row" role="group" aria-label="Model"><span>Model:</span>${modelBtns}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select "Timestamp in the system prompt" and see call 2 miss. Move the breakpoint after the new message.
      Move it after the tools only (400 tokens, below the minimum). Set the time to 10 minutes, then turn on the 1-hour lifetime.
      The token counts are made up for teaching. The multipliers and the minimum come from the Claude API docs, checked on ${CACHE.checked}.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "change") { change = +a.dataset.i; update(); }
      if (a.dataset.ixAct === "model") { model = +a.dataset.i; update(); }
      if (a.dataset.ixAct === "bp") { bp = +a.dataset.i; update(); }
      if (a.dataset.ixAct === "gap") { gap = +a.dataset.i; update(); }
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt;
      if (k === "ttl") longTtl = o.checked;
      update();
    };
    // The check box updates on "change".
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l26Unbind === "function") el._l26Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el._l26Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.BLOCKS = BLOCKS;
  mount.CHANGES = CHANGES;
  mount.BREAKPOINTS = BREAKPOINTS;
  mount.GAPS = GAPS;
  mount.CACHE = CACHE;
  mount.OUTPUT_TOKENS = OUTPUT_TOKENS;
  window.ACADEMY.ix["l2-6-cache"] = mount;
})();
