/*
 * Interactive for lesson 1.5: "l1-5-block".
 * It runs one pre-LN transformer block live on 3 toy tokens with d_model = 4.
 * The learner selects the token, switches each part of the block on or off,
 * changes the scale of the input vectors, and stacks the same block up to 12 times.
 * The toy numbers are made up for teaching. A real model learns its weights in training,
 * and each block of a real model has its own weights.
 * The same numbers are in the fixture of ticket T-005 (data/block_toy.json).
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-5-block"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const TOKENS = ["The", "cat", "sat"];
  const D = 4;
  const EPS = 1e-5;
  /* Toy parameters. Rows are inputs, columns are outputs: out = vector · W. */
  const TOY = {
    tokens: TOKENS,
    x: [[1, 0, 1, 0], [0, 2, 0, 1], [1, 1, 0, 2]],
    w_q: [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5]],
    w_k: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]],
    w_v: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
    w_o: [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5]],
    w_1: [[1, -1, 0, 0, 1, 0, 0, -1], [0, 1, -1, 0, 0, 1, 0, 0], [0, 0, 1, -1, 0, 0, 1, 0], [-1, 0, 0, 1, 0, 0, 0, 1]],
    w_2: [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5], [0, 0, 0, -0.5], [-0.5, 0, 0, 0], [0, -0.5, 0, 0], [0, 0, -0.5, 0]]
  };
  const SCALES = [0.25, 0.5, 1, 2, 4];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const len = (a) => Math.sqrt(dot(a, a));
  const cosine = (a, b) => { const n = len(a) * len(b); return n ? dot(a, b) / n : 0; };
  /* Vector times matrix: out[c] = sum over r of v[r] * W[r][c]. */
  const mul = (v, W) => W[0].map((_, c) => v.reduce((s, vr, r) => s + vr * W[r][c], 0));

  /* Layer norm over the features of one token. gamma = 1 and beta = 0 in this toy. */
  function layerNorm(v) {
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const variance = v.reduce((a, x) => a + (x - mean) * (x - mean), 0) / v.length;
    return v.map((x) => (x - mean) / Math.sqrt(variance + EPS));
  }
  /* Stable softmax. -Infinity gives a weight of exactly 0. */
  function softmax(row) {
    const m = Math.max(...row);
    const ex = row.map((x) => (x === -Infinity ? 0 : Math.exp(x - m)));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map((e) => e / s);
  }

  /*
   * One block for all tokens. opts: { attn, ffn, res, ln } (booleans).
   * A part that is off passes its input through unchanged.
   * Pre-LN order: h = x + Attention(LN1(x)) · W_O, then y = h + FFN(LN2(h)).
   */
  function block(xs, opts) {
    const norm = (v) => (opts.ln ? layerNorm(v) : v.slice());
    const a = xs.map(norm);
    let weights = xs.map(() => null), att = xs.map(() => null), h = xs.map((x) => x.slice());
    if (opts.attn) {
      const q = a.map((v) => mul(v, TOY.w_q)), k = a.map((v) => mul(v, TOY.w_k)), v = a.map((u) => mul(u, TOY.w_v));
      weights = q.map((qi, i) => softmax(k.map((kj, j) => (j <= i ? dot(qi, kj) / Math.sqrt(D) : -Infinity))));
      att = weights.map((wi) => mul(wi.reduce((acc, wij, j) => add(acc, v[j].map((x) => x * wij)), new Array(D).fill(0)), TOY.w_o));
      h = xs.map((x, i) => (opts.res ? add(x, att[i]) : att[i]));
    }
    const b = h.map(norm);
    let hidden = xs.map(() => null), ff = xs.map(() => null), y = h.map((x) => x.slice());
    if (opts.ffn) {
      hidden = b.map((u) => mul(u, TOY.w_1).map((z) => Math.max(0, z)));
      ff = hidden.map((u) => mul(u, TOY.w_2));
      y = h.map((x, i) => (opts.res ? add(x, ff[i]) : ff[i]));
    }
    return { a, weights, att, h, b, hidden, ff, y };
  }

  /*
   * The full computation that the interactive shows.
   * opts: { token (0 to 2), attn, ffn, res, ln, scale, blocks (1 to 12) }.
   */
  function compute(opts) {
    const o = Object.assign({ token: 2, attn: true, ffn: true, res: true, ln: true, scale: 1, blocks: 1 }, opts || {});
    const x0 = TOY.x.map((v) => v.map((n) => n * o.scale));
    const first = block(x0, o);
    const stack = [];
    let xs = x0;
    for (let n = 1; n <= o.blocks; n++) {
      xs = block(xs, o).y;
      stack.push({ n, length: len(xs[o.token]) });
    }
    const t = o.token;
    return {
      opts: o,
      input: x0,
      first,
      token: t,
      out: first.y[t],
      outLength: len(first.y[t]),
      keep: cosine(first.y[t], x0[t]),
      stack,
      last: xs
    };
  }

  const f2 = (x) => {
    const r = Math.round(x * 100) / 100;
    return (Object.is(r, -0) ? 0 : r).toFixed(2);
  };
  const vec = (v) => (v ? "[" + v.map(f2).join(", ") + "]" : "skipped");
  const big = (x) => (x >= 1e5 ? x.toExponential(1) : x >= 1000 ? String(Math.round(x)) : x.toFixed(2));

  function mount(el) {
    let token = 2, attn = true, ffn = true, res = true, ln = true, scaleAt = 2, blocks = 1;

    /* The result part. It changes on every input. The controls stay in place, so a slider keeps the pointer while you drag it. */
    function resultHtml() {
      const scale = SCALES[scaleAt];
      const r = compute({ token, attn, ffn, res, ln, scale, blocks });
      const f = r.first, t = token;
      const lnOff = ln ? "" : " (off)";
      const stages = [
        ["Input x", r.input[t], ""],
        ["Layer norm 1" + lnOff, attn ? f.a[t] : null, "the input that attention reads"],
        ["Attention · W_O", attn ? f.att[t] : null, "information from the other tokens"],
        [res ? "x + attention" : "Attention only", f.h[t], res ? "residual connection 1" : "no residual: x is replaced"],
        ["Layer norm 2" + lnOff, ffn ? f.b[t] : null, "the input that the feed-forward layer reads"],
        ["Feed-forward", ffn ? f.ff[t] : null, "work on this token only"],
        [res ? "Output: h + feed-forward" : "Output", f.y[t], res ? "residual connection 2" : "no residual: h is replaced"]
      ];
      /* One column: the name and the note on the first line, the vector and its length on the second line. Two columns are too narrow on a phone. */
      const rows = stages.map((s) => `<tr><td><b>${esc(s[0])}</b>${s[2] ? ` <span class="muted">· ${esc(s[2])}</span>` : ""}<br>
        <code>${vec(s[1])}</code>${s[1] ? ` <span class="muted">length ${f2(len(s[1]))}</span>` : ""}</td></tr>`).join("");

      const w = f.weights[t];
      const best = w ? w.indexOf(Math.max(...w)) : -1;
      const wRows = w ? TOKENS.map((name, j) => {
        const cls = j > t ? "cut" : (j === best ? "chosen" : "");
        return `<div class="bar-row ${cls}"><span class="lbl" title="${esc(name)}">${esc(name)}</span><span class="track"><i style="width:${(w[j] * 100).toFixed(1)}%"></i></span><span class="val">${w[j].toFixed(3)}</span></div>`;
      }).join("") : `<p class="muted">Attention is off, so this token takes no information from other tokens.</p>`;

      const maxLen = Math.max(...r.stack.map((s) => s.length)) || 1;
      const sRows = r.stack.map((s) =>
        `<div class="bar-row"><span class="lbl">Block ${s.n}</span><span class="track"><i style="width:${((s.length / maxLen) * 100).toFixed(1)}%"></i></span><span class="val">${big(s.length)}</span></div>`).join("");

      return `<p class="ix-group">Block 1, token "${esc(TOKENS[t])}"</p>
          <div class="table-wrap"><table>
            <tr><th>Stage and vector</th></tr>
            ${rows}
          </table></div>
          <p class="ix-group">Attention weights of "${esc(TOKENS[t])}" in block 1</p>
          <div class="bars">${wRows}</div>
          <div class="kv"><div>Output length, block 1<b>${f2(r.outLength)}</b></div><div>Cosine of output and input<b>${f2(r.keep)}</b></div><div>Length after ${blocks} block${blocks > 1 ? "s" : ""}<b>${big(r.stack[r.stack.length - 1].length)}</b></div></div>
          <p class="ix-group">Length of the "${esc(TOKENS[t])}" vector after each block</p>
          <div class="bars">${sRows}</div>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="tok"]').forEach((b) => {
        const on = +b.dataset.i === token;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      const scale = SCALES[scaleAt];
      const sOut = el.querySelector('[data-out="scale"]'), bOut = el.querySelector('[data-out="blocks"]');
      sOut.textContent = "× " + scale; bOut.textContent = String(blocks);
      el.querySelector('[data-ix-opt="scale"]').setAttribute("aria-valuetext", scale + " times");
      el.querySelector('[data-ix-opt="blocks"]').setAttribute("aria-valuetext", blocks + (blocks > 1 ? " blocks" : " block"));
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const tokBtns = TOKENS.map((name, i) =>
      `<button type="button" data-ix-act="tok" data-i="${i}">${esc(name)}</button>`).join("");
    const box = (opt, on, label) => `<label class="ix-check"><input type="checkbox" data-ix-opt="${opt}" ${on ? "checked" : ""}><span>${label}</span></label>`;
    // The ids must be unique on the page, so they include a counter.
    const uid = "l15-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">One transformer block, step by step <span class="tag accent">toy numbers, computed live</span></div>
      <p class="ix-lead">Three tokens with d<sub>model</sub> = 4: The [1, 0, 1, 0], cat [0, 2, 0, 1], sat [1, 1, 0, 2]. One attention head, causal mask, and a feed-forward layer 4 → 8 → 4 with ReLU. Layer norm comes before each part (pre-LN).</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Token to follow"><span>Follow token:</span>${tokBtns}</div>
        <div class="row">${box("attn", attn, "Attention")}${box("ffn", ffn, "Feed-forward layer")}${box("res", res, "Residual connections")}${box("ln", ln, "Layer norm")}</div>
        <div class="slider-row"><label for="${uid}-scale">Input scale</label><input id="${uid}-scale" type="range" min="0" max="${SCALES.length - 1}" step="1" value="${scaleAt}" data-ix-opt="scale"><b data-out="scale"></b></div>
        <div class="slider-row"><label for="${uid}-blocks">Blocks in the stack</label><input id="${uid}-blocks" type="range" min="1" max="12" step="1" value="${blocks}" data-ix-opt="blocks"><b data-out="blocks"></b></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Switch off the residual connections and look at the cosine of output and input.
      Change the input scale with layer norm on, then with layer norm off, and look at the attention weights.
      Set 12 blocks and switch off layer norm. The stack repeats the same toy block. A real model has different weights in each block.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "tok") { token = +a.dataset.i; update(); }
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt;
      if (k === "scale") scaleAt = +o.value;
      else if (k === "blocks") blocks = +o.value;
      else if (k === "attn") attn = o.checked;
      else if (k === "ffn") ffn = o.checked;
      else if (k === "res") res = o.checked;
      else if (k === "ln") ln = o.checked;
      update();
    };
    // Sliders update on "input" (live while you drag). Check boxes update on "change".
    const onInput = (ev) => { if (ev.target.type === "range") onOpt(ev); };
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l15Unbind === "function") el._l15Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l15Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.layerNorm = layerNorm;
  mount.TOY = TOY;
  window.ACADEMY.ix["l1-5-block"] = mount;
})();
