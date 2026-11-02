/*
 * Interactive "cosine2d" for lesson 1.3 (embeddings and cosine similarity).
 * It shows two 2-D vectors A and B as arrows. The learner moves the arrow tips (drag, sliders
 * or preset buttons) and sees the dot product, both norms, the cosine, the angle and the
 * Euclidean distance, with the arithmetic shown.
 *
 * Registration: window.ACADEMY.ix.cosine2d. The value is a function f(el) that also has
 * f.mount(el), so the mount code can call it either way.
 * This file does not touch the DOM when it loads. It is safe to load in Node (selftest.js).
 * It uses classes from styles.css and the tool classes (ix-lead, ix-stage, ix-controls, ix-result)
 * from css/pages-lesson.css.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const SIZE = 320, MID = 160, UNIT = 30, MAX = 5;
  let uid = 0;

  const r1 = (x) => Math.round(x * 10) / 10;
  const f3 = (x) => (Math.abs(x) < 0.0005 ? 0 : x).toFixed(3);
  const f1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1);
  const num = (x) => { const s = f1(x); return x < 0 && s !== "0.0" ? "(" + s + ")" : s; };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  function svgEl(name, attrs) {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }
  function htmlEl(name, attrs, text) {
    const n = document.createElement(name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    if (text != null) n.textContent = text;
    return n;
  }
  const toPx = (x, y) => [MID + x * UNIT, MID - y * UNIT];

  function cosine2d(el) {
    const id = "ix-cos-" + (++uid);
    const v = { A: [3, 4], B: [4, 3] };

    el.textContent = "";
    el.appendChild(htmlEl("div", { class: "ix-title" }, "Try it: move the two arrows and watch the cosine"));
    el.appendChild(htmlEl("p", { class: "ix-lead" },
      "Drag the tip of arrow A or arrow B, or use the sliders. Cosine measures only the angle. Make A half as long or twice as long, and look at what changes and what stays the same."));

    /* ---- SVG plane */
    const svg = svgEl("svg", { viewBox: "0 0 " + SIZE + " " + SIZE, role: "img",
      "aria-label": "Two vectors A and B drawn as arrows from the origin on a grid from -5 to 5",
      style: "width:100%;max-width:340px;display:block;margin:8px auto;touch-action:none;user-select:none" });
    const defs = svgEl("defs");
    [["a", "d-arrow-accent"], ["b", "d-arrow"]].forEach(([k, cls]) => {
      const m = svgEl("marker", { id: id + "-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5",
        markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
      m.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: cls }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);
    for (let i = -MAX; i <= MAX; i++) {
      const p = MID + i * UNIT, axis = i === 0;
      const o = axis ? "0.45" : "0.2";
      svg.appendChild(svgEl("line", { x1: p, y1: 10, x2: p, y2: SIZE - 10, class: "d-line", "stroke-opacity": o, "stroke-width": axis ? 1.5 : 1 }));
      svg.appendChild(svgEl("line", { x1: 10, y1: p, x2: SIZE - 10, y2: p, class: "d-line", "stroke-opacity": o, "stroke-width": axis ? 1.5 : 1 }));
    }
    const lineB = svgEl("line", { x1: MID, y1: MID, class: "d-line", "stroke-width": "2.5", "marker-end": "url(#" + id + "-b)" });
    const lineA = svgEl("line", { x1: MID, y1: MID, class: "d-line-accent", "stroke-width": "2.5", "marker-end": "url(#" + id + "-a)" });
    const diff = svgEl("line", { x1: MID, y1: MID, class: "d-line", "stroke-dasharray": "4 4" });
    const labA = svgEl("text", { class: "d-bold" }); labA.textContent = "A";
    const labB = svgEl("text", { class: "d-bold" }); labB.textContent = "B";
    const hitA = svgEl("circle", { r: "14", fill: "transparent", style: "cursor:grab" });
    const hitB = svgEl("circle", { r: "14", fill: "transparent", style: "cursor:grab" });
    [diff, lineB, lineA, labA, labB, hitB, hitA].forEach((n) => svg.appendChild(n));
    // The plane and the controls sit side by side on a wide screen and one above the other on a phone.
    const stage = htmlEl("div", { class: "ix-stage" });
    const controls = htmlEl("div", { class: "ix-controls" });
    stage.appendChild(svg); stage.appendChild(controls);
    el.appendChild(stage);

    /* ---- sliders */
    const sliders = {};
    [["A", 0, "A, number 1"], ["A", 1, "A, number 2"], ["B", 0, "B, number 1"], ["B", 1, "B, number 2"]].forEach(([k, i, label]) => {
      const row = htmlEl("div", { class: "slider-row" });
      const sid = id + "-" + k + i;
      row.appendChild(htmlEl("label", { for: sid }, label));
      const input = htmlEl("input", { id: sid, type: "range", min: String(-MAX), max: String(MAX), step: "0.1" });
      const out = htmlEl("span");
      input.addEventListener("input", () => { v[k][i] = r1(Number(input.value)); update(); });
      row.appendChild(input); row.appendChild(out);
      controls.appendChild(row);
      sliders[k + i] = { input, out };
    });

    /* ---- preset buttons */
    const presets = [
      ["(3, 4) and (4, 3)", [3, 4], [4, 3]],
      ["Same direction", [3, 4], [1.5, 2]],
      ["Right angle", [3, 0], [0, 2]],
      ["Opposite", [1, 2], [-2, -4]]
    ];
    const row = htmlEl("div", { class: "row ix-presets", role: "group", "aria-label": "Preset vectors" });
    presets.forEach(([label, a, b]) => {
      const btn = htmlEl("button", { type: "button" }, label);
      btn.addEventListener("click", () => { v.A = a.slice(); v.B = b.slice(); update(); });
      row.appendChild(btn);
    });
    const twice = htmlEl("button", { type: "button" }, "Make A twice as long");
    twice.addEventListener("click", () => { v.A = [r1(v.A[0] * 2), r1(v.A[1] * 2)]; update(); });
    const half = htmlEl("button", { type: "button" }, "Make A half as long");
    half.addEventListener("click", () => { v.A = [v.A[0] / 2, v.A[1] / 2]; update(); });
    row.appendChild(half);
    row.appendChild(twice);
    controls.appendChild(row);

    /* ---- results */
    const kv = htmlEl("div", { class: "kv" });
    const cells = {};
    [["dot", "A · B (dot product)"], ["na", "|A| (length)"], ["nb", "|B| (length)"],
     ["cos", "Cosine similarity"], ["ang", "Angle"], ["dist", "Distance |A − B|"]].forEach(([k, label]) => {
      const d = htmlEl("div"); d.appendChild(document.createTextNode(label));
      const b = htmlEl("b"); d.appendChild(b); kv.appendChild(d); cells[k] = b;
    });
    const result = htmlEl("div", { class: "ix-result" });
    result.appendChild(kv);
    el.appendChild(result);
    const verdict = htmlEl("div", { class: "row" });
    const tag = htmlEl("span", { class: "tag" });
    verdict.appendChild(tag);
    result.appendChild(verdict);
    const work = htmlEl("div", { class: "ix-text", "aria-live": "polite" });
    result.appendChild(work);

    function update() {
      const [ax, ay] = v.A, [bx, by] = v.B;
      const dot = ax * bx + ay * by;
      const na = Math.sqrt(ax * ax + ay * ay), nb = Math.sqrt(bx * bx + by * by);
      const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

      const pa = toPx(ax, ay), pb = toPx(bx, by);
      lineA.setAttribute("x2", pa[0]); lineA.setAttribute("y2", pa[1]);
      lineB.setAttribute("x2", pb[0]); lineB.setAttribute("y2", pb[1]);
      diff.setAttribute("x1", pa[0]); diff.setAttribute("y1", pa[1]);
      diff.setAttribute("x2", pb[0]); diff.setAttribute("y2", pb[1]);
      hitA.setAttribute("cx", pa[0]); hitA.setAttribute("cy", pa[1]);
      hitB.setAttribute("cx", pb[0]); hitB.setAttribute("cy", pb[1]);
      const lab = (t, p, x, y) => {
        const n = Math.hypot(x, y) || 1;
        t.setAttribute("x", clamp(p[0] + (x / n) * 14 - 4, 4, SIZE - 14));
        t.setAttribute("y", clamp(p[1] - (y / n) * 14 + 5, 14, SIZE - 4));
      };
      lab(labA, pa, ax, ay); lab(labB, pb, bx, by);
      lineA.style.visibility = na ? "" : "hidden";
      lineB.style.visibility = nb ? "" : "hidden";

      Object.keys(sliders).forEach((k) => {
        const val = v[k[0]][Number(k[1])];
        sliders[k].input.value = String(val); sliders[k].out.textContent = f1(val);
      });
      const fits = Math.abs(ax * 2) <= MAX && Math.abs(ay * 2) <= MAX && na > 0;
      twice.disabled = !fits;
      twice.title = fits ? "" : "A twice as long does not fit on the grid";
      // Halve only when the result stays on the 0.1 grid of the sliders.
      const onGrid = (x) => Math.abs(r1(x / 2) - x / 2) < 1e-9;
      half.disabled = !(na > 0 && onGrid(ax) && onGrid(ay));
      half.title = half.disabled ? "Half of A is not on the 0.1 grid of the sliders" : "";

      cells.dot.textContent = f3(dot);
      cells.na.textContent = f3(na);
      cells.nb.textContent = f3(nb);
      cells.dist.textContent = f3(dist);
      const line1 = "A · B = " + num(ax) + "×" + num(bx) + " + " + num(ay) + "×" + num(by) + " = " + f3(dot);
      const line2 = "|A| = √(" + num(ax) + "² + " + num(ay) + "²) = " + f3(na) + "    |B| = √(" + num(bx) + "² + " + num(by) + "²) = " + f3(nb);
      if (na === 0 || nb === 0) {
        cells.cos.textContent = "not defined";
        cells.ang.textContent = "not defined";
        tag.className = "tag bad";
        tag.textContent = "A zero vector has no direction. Cosine is not defined (division by 0).";
        work.textContent = line1 + "\n" + line2 + "\ncos = " + f3(dot) + " / 0  →  not defined";
      } else {
        const c = clamp(dot / (na * nb), -1, 1);
        const deg = Math.acos(c) * 180 / Math.PI;
        cells.cos.textContent = f3(c);
        cells.ang.textContent = f1(deg) + "°";
        let cls, msg;
        if (c >= 0.999) { cls = "tag ok"; msg = "Same direction: cosine 1. Length has no effect."; }
        else if (c >= 0.7) { cls = "tag ok"; msg = "Almost the same direction: high cosine."; }
        else if (c > 0.3) { cls = "tag accent"; msg = "Partly the same direction."; }
        else if (c >= -0.3) { cls = "tag warn"; msg = Math.abs(c) < 0.0005 ? "Right angle: cosine 0." : "Almost a right angle: cosine near 0."; }
        else if (c > -0.999) { cls = "tag bad"; msg = "Mostly opposite directions: negative cosine."; }
        else { cls = "tag bad"; msg = "Opposite directions: cosine −1."; }
        tag.className = cls; tag.textContent = msg;
        work.textContent = line1 + "\n" + line2 + "\ncos = " + f3(dot) + " / (" + f3(na) + " × " + f3(nb) + ") = " + f3(c);
      }
      work.style.whiteSpace = "pre-wrap";
    }

    /* ---- drag the tips */
    let dragging = null;
    function fromEvent(ev) {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * SIZE / r.width, sy = (ev.clientY - r.top) * SIZE / r.height;
      return [clamp(r1((sx - MID) / UNIT), -MAX, MAX), clamp(r1((MID - sy) / UNIT), -MAX, MAX)];
    }
    [[hitA, "A"], [hitB, "B"]].forEach(([h, k]) => {
      h.addEventListener("pointerdown", (ev) => { dragging = k; h.setPointerCapture(ev.pointerId); ev.preventDefault(); });
      h.addEventListener("pointermove", (ev) => { if (dragging !== k) return; v[k] = fromEvent(ev); update(); });
      const stop = () => { dragging = null; };
      h.addEventListener("pointerup", stop); h.addEventListener("pointercancel", stop);
    });

    update();
  }

  cosine2d.mount = cosine2d;
  window.ACADEMY.ix.cosine2d = cosine2d;
})();
