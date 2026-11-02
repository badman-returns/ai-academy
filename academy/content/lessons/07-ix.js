/*
 * Interactive for lesson 1.7: "l1-7-kvcache".
 * Part 1 shows the decode loop on a small grid. Each row is one forward pass and each
 * column is one token position. The learner sets the prompt length and the output length
 * and switches the KV cache on or off. The grid and the counters show the work that the
 * cache removes and the work that it does not remove.
 * Part 2 computes the size of the KV cache for one request on a real model shape:
 * 32 blocks, d_model = 4096, 32 heads of size 128. This is the shape of LLaMA 7B
 * (Touvron et al., 2023). The learner sets the context length, the number of KV heads
 * and the bytes per number, and compares the cache with the block weights.
 * The block weight count uses the formula of lesson 1.5: 12 × d_model² for each block.
 * Sizes use decimal units: 1 GB = 1,000,000,000 bytes.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-7-kvcache"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const SHAPE = { blocks: 32, dModel: 4096, heads: 32, dHead: 128 };
  const LENGTHS = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];
  const KV_HEADS = [32, 8, 1];
  const BYTES = [2, 1];
  /* The weights stay at 2 bytes each. Part 2 changes only the bytes of the cache. */
  const WEIGHT_BYTES = 2;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /*
   * Part 1. The decode loop for `prompt` prompt tokens and `output` output tokens.
   * Pass 1 is the prefill: it processes all prompt tokens and gives output token 1.
   * Pass k (k >= 2) processes the token that pass k - 1 made, at position prompt + k - 2.
   * The last output token is never processed, so the grid has prompt + output - 1 columns.
   * Cell states: "new" (K and V computed for the first time), "cached" (K and V read from
   * the cache), "again" (K and V computed again, because there is no cache), "" (no token yet).
   * kv counts the K and V computations for one block and one head.
   * scores counts the query-key dot products for one block and one head.
   * Without a cache, each pass runs the full causal pass on all its tokens again.
   */
  function steps(opts) {
    const o = Object.assign({ prompt: 4, output: 4, cache: true }, opts || {});
    const P = o.prompt, O = o.output, cols = P + O - 1;
    const rows = [];
    let kv = 0, scores = 0;
    for (let k = 1; k <= O; k++) {
      const T = P + k - 1; // tokens that this pass can see, its own token included
      const cells = [];
      for (let c = 0; c < cols; c++) {
        if (c >= T) cells.push("");
        else if (k === 1) cells.push("new");
        else if (c === T - 1) cells.push("new");
        else cells.push(o.cache ? "cached" : "again");
      }
      if (o.cache) {
        kv += k === 1 ? P : 1;
        scores += k === 1 ? (P * (P + 1)) / 2 : T;
      } else {
        kv += T;
        scores += (T * (T + 1)) / 2;
      }
      rows.push({ pass: k, label: k === 1 ? "Prefill" : "Step " + (k - 1), cells, out: k });
    }
    return { opts: o, cols, rows, kv, scores, cacheEntries: o.cache ? cols : 0 };
  }

  /*
   * Part 2. KV cache size for one request.
   * Bytes per token = 2 (K and V) × blocks × KV heads × head size × bytes per number.
   * Block weights = 12 × d_model² × blocks (lesson 1.5), at 2 bytes each.
   * Each decode step reads all the weights and the whole cache once, so cacheShare is
   * the part of the bytes read per output token that comes from the cache.
   */
  function memory(opts) {
    const o = Object.assign({ tokens: 4096, kvHeads: 32, bytes: 2 }, opts || {});
    const perToken = 2 * SHAPE.blocks * o.kvHeads * SHAPE.dHead * o.bytes;
    const cache = perToken * o.tokens;
    const weightCount = 12 * SHAPE.dModel * SHAPE.dModel * SHAPE.blocks;
    const weights = weightCount * WEIGHT_BYTES;
    return {
      opts: o,
      perToken,
      cache,
      weightCount,
      weights,
      ratio: cache / weights,
      cacheShare: cache / (cache + weights),
      equalAt: weights / perToken
    };
  }

  const nf = (x) => Math.round(x).toLocaleString("en-US");
  const gb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : nf(b / 1e3) + " KB");
  const pct = (x) => Math.round(x * 100) + "%";

  /*
   * The grid as inline SVG. Each cell has a letter, so the state does not depend on color only.
   * The grid can shrink to 80% of its size. On a narrow screen, a wider grid scrolls inside
   * its .table-wrap box, so the letters stay large enough to read.
   */
  const CELL = { new: ["d-box-accent", "N"], cached: ["d-box-info", "C"], again: ["d-box-warn", "R"] };
  function gridSvg(r) {
    const S = 30, G = 3, LEFT = 66, TOP = 34, RIGHT = 54;
    const w = LEFT + r.cols * (S + G) + RIGHT, h = TOP + r.rows.length * (S + G) + 4;
    const P = r.opts.prompt;
    let out = `<svg viewBox="0 0 ${w} ${h}" width="${w}" style="width:100%;max-width:${w}px;min-width:${Math.round(w * 0.8)}px;height:auto;display:block" role="img" aria-label="Grid of forward passes. Rows are passes, columns are token positions. ${esc(r.opts.cache ? "With the cache, each step computes K and V for one new token and reads the others from the cache." : "Without the cache, each step computes K and V for all tokens again.")}">`;
    for (let c = 0; c < r.cols; c++) {
      const x = LEFT + c * (S + G) + S / 2;
      out += `<text x="${x}" y="12" text-anchor="middle" class="d-small">${c < P ? "p" : "o"}</text>`;
      out += `<text x="${x}" y="27" text-anchor="middle" class="d-small">${c + 1}</text>`;
    }
    r.rows.forEach((row, i) => {
      const y = TOP + i * (S + G);
      out += `<text x="0" y="${y + S / 2 + 4}" class="d-small">${esc(row.label)}</text>`;
      row.cells.forEach((st, c) => {
        const x = LEFT + c * (S + G);
        if (!st) { out += `<rect x="${x + 0.75}" y="${y + 0.75}" width="${S - 1.5}" height="${S - 1.5}" rx="5" class="d-box-muted" opacity="0.35"/>`; return; }
        out += `<rect x="${x + 0.75}" y="${y + 0.75}" width="${S - 1.5}" height="${S - 1.5}" rx="5" class="${CELL[st][0]}"/>`;
        out += `<text x="${x + S / 2}" y="${y + S / 2 + 4}" text-anchor="middle" class="d-mono">${CELL[st][1]}</text>`;
      });
      out += `<text x="${w - RIGHT + 8}" y="${y + S / 2 + 4}" class="d-small">→ out ${row.out}</text>`;
    });
    return out + `</svg>`;
  }

  function mount(el) {
    let prompt = 4, output = 4, cache = true, lenAt = 2, kvAt = 0, byteAt = 0;

    function stepsHtml() {
      const r = steps({ prompt, output, cache });
      const other = steps({ prompt, output, cache: !cache });
      const saved = cache ? other.kv - r.kv : r.kv - other.kv;
      return `<div class="table-wrap">${gridSvg(r)}</div>
        <p class="muted">p = prompt token, o = output token. <b>N</b>: K and V computed for the first time. <b>C</b>: K and V read from the cache. <b>R</b>: K and V computed again.</p>
        <div class="kv"><div>K, V computations (one block, one head)<b>${nf(r.kv)}</b></div><div>Attention scores (one block, one head)<b>${nf(r.scores)}</b></div><div>Entries in the cache at the end<b>${nf(r.cacheEntries)}</b></div></div>
        <p class="muted">${cache
          ? `The cache saves ${nf(saved)} K, V computations here. Each step still computes one attention score for each earlier token, so a later step does more attention work than an earlier step.`
          : `Without the cache, this run does ${nf(saved)} more K, V computations than with the cache. Each step runs the full pass on all earlier tokens again.`}</p>`;
    }

    function memoryHtml() {
      const m = memory({ tokens: LENGTHS[lenAt], kvHeads: KV_HEADS[kvAt], bytes: BYTES[byteAt] });
      const max = Math.max(m.cache, m.weights);
      const bar = (lbl, v, cls) => `<div class="bar-row ${cls}"><span class="lbl">${lbl}</span><span class="track"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></span><span class="val">${gb(v)}</span></div>`;
      return `<div class="kv"><div>Cache per token<b>${gb(m.perToken)}</b></div><div>Cache for ${nf(m.opts.tokens)} tokens<b>${gb(m.cache)}</b></div><div>Block weights (2 bytes each)<b>${gb(m.weights)}</b></div><div class="ix-key">Cache share of reads per output token<b>${pct(m.cacheShare)}</b></div></div>
        <p class="ix-group">GPU memory for one request</p>
        <div class="bars">${bar("Weights", m.weights, "")}${bar("KV cache", m.cache, "chosen")}</div>
        <p class="muted">With these settings, the cache of one request is as large as the block weights at ${nf(m.equalAt)} tokens. The weights are shared by all requests on the server. Each request has its own cache.</p>`;
    }

    function update() {
      el.querySelector('[data-out="prompt"]').textContent = String(prompt);
      el.querySelector('[data-out="output"]').textContent = String(output);
      el.querySelector('[data-out="len"]').textContent = LENGTHS[lenAt] / 1024 + "K";
      el.querySelector('[data-ix-opt="prompt"]').setAttribute("aria-valuetext", prompt + " prompt tokens");
      el.querySelector('[data-ix-opt="output"]').setAttribute("aria-valuetext", output + " output tokens");
      el.querySelector('[data-ix-opt="len"]').setAttribute("aria-valuetext", nf(LENGTHS[lenAt]) + " tokens");
      el.querySelectorAll('[data-ix-act="kv"]').forEach((b) => {
        const on = +b.dataset.i === kvAt; b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="bytes"]').forEach((b) => {
        const on = +b.dataset.i === byteAt; b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelector('[data-part="steps"]').innerHTML = stepsHtml();
      el.querySelector('[data-part="memory"]').innerHTML = memoryHtml();
    }

    const uid = "l17-" + (++mountCount);
    const kvLabels = ["32: one K, V per head", "8: grouped-query", "1: multi-query"];
    const byteLabels = ["2 bytes (16-bit)", "1 byte (8-bit)"];
    el.innerHTML = `<div class="ix-title">The KV cache, step by step <span class="tag accent">computed live</span></div>
      <p class="ix-lead">Part 1: each row is one forward pass, and each column is one token position. Switch the cache off and compare the work.</p>
      <div class="ix-controls">
        <div class="slider-row"><label for="${uid}-p">Prompt tokens</label><input id="${uid}-p" type="range" min="1" max="8" step="1" value="${prompt}" data-ix-opt="prompt"><b data-out="prompt"></b></div>
        <div class="slider-row"><label for="${uid}-o">Output tokens</label><input id="${uid}-o" type="range" min="1" max="8" step="1" value="${output}" data-ix-opt="output"><b data-out="output"></b></div>
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="cache" ${cache ? "checked" : ""}><span>Use the KV cache</span></label></div>
      </div>
      <div class="ix-result" data-part="steps" aria-live="polite"></div>
      <p class="ix-lead">Part 2: the cache size for one request on a model with 32 blocks, d<sub>model</sub> = 4096 and 32 heads of size 128 (the shape of LLaMA 7B). The slider shows the context length in K, and 1K = 1,024 tokens.</p>
      <div class="ix-controls">
        <div class="slider-row"><label for="${uid}-len">Context length</label><input id="${uid}-len" type="range" min="0" max="${LENGTHS.length - 1}" step="1" value="${lenAt}" data-ix-opt="len"><b data-out="len"></b></div>
        <div class="row" role="group" aria-label="KV heads"><span>KV heads:</span>${kvLabels.map((t, i) => `<button type="button" data-ix-act="kv" data-i="${i}">${esc(t)}</button>`).join("")}</div>
        <div class="row" role="group" aria-label="Bytes per cached number"><span>Cache numbers:</span>${byteLabels.map((t, i) => `<button type="button" data-ix-act="bytes" data-i="${i}">${esc(t)}</button>`).join("")}</div>
      </div>
      <div class="ix-result" data-part="memory" aria-live="polite"></div>
      <p class="muted">Try these. In part 1, set 8 prompt tokens and 8 output tokens, then switch the cache off. In part 2, move the context length to 131,072 tokens, then select 8 KV heads.
      The model shape is real. The grouped-query and multi-query settings are "what if" settings for this shape. Real servers also need memory for other work, so these numbers are a lower limit.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "kv") kvAt = +a.dataset.i;
      else if (a.dataset.ixAct === "bytes") byteAt = +a.dataset.i;
      else return;
      update();
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt;
      if (k === "prompt") prompt = +o.value;
      else if (k === "output") output = +o.value;
      else if (k === "len") lenAt = +o.value;
      else if (k === "cache") cache = o.checked;
      update();
    };
    // Sliders update on "input" (live while you drag). The check box updates on "change".
    const onInput = (ev) => { if (ev.target.type === "range") onOpt(ev); };
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l17Unbind === "function") el._l17Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l17Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.steps = steps;
  mount.memory = memory;
  mount.SHAPE = SHAPE;
  window.ACADEMY.ix["l1-7-kvcache"] = mount;
})();
