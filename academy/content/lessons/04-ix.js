/*
 * Interactive for lesson 1.4: "l1-4-attention".
 * It computes scaled dot-product attention live for the 3-token toy example of the lesson.
 * The learner selects the query token, the causal mask and the division by sqrt(d_k).
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-4-attention"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const TOKENS = ["The", "cat", "sat"];
  const Q = [[1, 0], [0, 1], [1, 1]];
  const K = [[1, 0], [1, 1], [0, 1]];
  const V = [[1, 0], [0, 1], [1, 1]];
  const DK = 2;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const f3 = (x) => (x === -Infinity ? "masked" : x.toFixed(3));
  const vec = (v) => "[" + v.join(", ") + "]";

  /* Stable softmax. -Infinity gives a weight of exactly 0. */
  function softmax(row) {
    const m = Math.max(...row);
    const ex = row.map((x) => (x === -Infinity ? 0 : Math.exp(x - m)));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map((e) => e / s);
  }

  function compute(qi, causal, scale) {
    const q = Q[qi];
    const raw = K.map((k) => q[0] * k[0] + q[1] * k[1]);
    const div = scale ? Math.sqrt(DK) : 1;
    const scaled = raw.map((r, j) => (causal && j > qi ? -Infinity : r / div));
    const exps = scaled.map((x) => (x === -Infinity ? 0 : Math.exp(x)));
    const w = softmax(scaled);
    const out = [0, 1].map((c) => w.reduce((a, wj, j) => a + wj * V[j][c], 0));
    return { raw, scaled, exps, w, out, sum: w.reduce((a, b) => a + b, 0) };
  }

  function mount(el) {
    let qi = 2, causal = false, scale = true;

    function draw() {
      const r = compute(qi, causal, scale);
      const best = r.w.indexOf(Math.max(...r.w));
      const rows = TOKENS.map((t, j) => {
        const masked = r.scaled[j] === -Infinity;
        return `<tr><td><b>${esc(t)}</b> <span class="muted">k = ${vec(K[j])}</span></td><td>${r.raw[j]}</td><td>${f3(r.scaled[j])}</td><td>${masked ? "0" : r.exps[j].toFixed(3)}</td><td>${r.w[j].toFixed(3)}</td></tr>`;
      }).join("");
      const barRows = TOKENS.map((t, j) => {
        const cls = r.scaled[j] === -Infinity ? "cut" : (j === best ? "chosen" : "");
        return `<div class="bar-row ${cls}"><span class="lbl" title="${esc(t)}">${esc(t)}</span><span class="track"><i style="width:${(r.w[j] * 100).toFixed(1)}%"></i></span><span class="val">${r.w[j].toFixed(3)}</span></div>`;
      }).join("");
      const btns = TOKENS.map((t, i) =>
        `<button type="button" data-ix-act="q" data-i="${i}" class="${i === qi ? "primary" : ""}" aria-pressed="${i === qi}">${esc(t)}</button>`).join("");

      el.innerHTML = `<div class="ix-title">Attention for one query <span class="tag accent">toy numbers, computed live</span></div>
        <p class="ix-lead">Queries: The ${vec(Q[0])}, cat ${vec(Q[1])}, sat ${vec(Q[2])}. Values: The ${vec(V[0])}, cat ${vec(V[1])}, sat ${vec(V[2])}. d<sub>k</sub> = 2.</p>
        <div class="ix-controls">
          <div class="row" role="group" aria-label="Query token"><span>Query token:</span>${btns}</div>
          <div class="row">
            <label class="ix-check"><input type="checkbox" data-ix-opt="causal" ${causal ? "checked" : ""}><span>Causal mask (no attention to later tokens)</span></label>
            <label class="ix-check"><input type="checkbox" data-ix-opt="scale" ${scale ? "checked" : ""}><span>Divide by √d<sub>k</sub> (√2 = 1.414)</span></label>
          </div>
        </div>
        <div class="ix-result">
        <div class="table-wrap"><table>
          <tr><th>Key</th><th>q · k</th><th>${scale ? "Scaled" : "Not scaled"}</th><th>e<sup>x</sup></th><th>Weight</th></tr>
          ${rows}
        </table></div>
        <div class="bars">${barRows}</div>
        <div class="kv"><div>Query<b>${esc(TOKENS[qi])} ${vec(Q[qi])}</b></div><div>Output vector<b>[${r.out[0].toFixed(3)}, ${r.out[1].toFixed(3)}]</b></div><div>Sum of weights<b>${r.sum.toFixed(3)}</b></div></div>
        </div>
        <p class="muted">The output is the weighted sum of the values. Try "cat" with the causal mask: "sat" is masked and the weights become 0.330 and 0.670.
        Remove the division by √d<sub>k</sub> and see that the largest weight gets bigger.</p>`;
    }

    // draw() replaces the controls. Put the keyboard focus back on the control that the user changed.
    function refocus(sel) {
      if (el.contains(document.activeElement) && document.activeElement !== document.body) return;
      const t = el.querySelector(sel); if (t) t.focus({ preventScroll: true });
    }

    if (!el.dataset.l14Bound) {
      el.dataset.l14Bound = "1";
      el.addEventListener("click", (ev) => {
        const a = ev.target.closest("[data-ix-act]");
        if (!a || !el.contains(a)) return;
        if (a.dataset.ixAct === "q") { qi = +a.dataset.i; draw(); refocus('[data-ix-act="q"][data-i="' + qi + '"]'); }
      });
      el.addEventListener("change", (ev) => {
        const o = ev.target.closest("[data-ix-opt]");
        if (!o) return;
        if (o.dataset.ixOpt === "causal") causal = o.checked;
        if (o.dataset.ixOpt === "scale") scale = o.checked;
        draw(); refocus('[data-ix-opt="' + o.dataset.ixOpt + '"]');
      });
    }
    draw();
  }

  mount.mount = mount;
  mount.compute = compute;
  window.ACADEMY.ix["l1-4-attention"] = mount;
})();
