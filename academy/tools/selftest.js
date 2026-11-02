#!/usr/bin/env node
/*
 * Self-test for the academy logic and content. No dependencies.
 * Run from the ai-academy folder:  node academy/tools/selftest.js
 * Each test name states the property that it checks.
 */
const fs = require("fs");
const path = require("path");
globalThis.window = globalThis;
const base = path.join(__dirname, "..");
require(path.join(base, "content", "curriculum.js"));
fs.readdirSync(path.join(base, "content", "lessons")).filter((f) => f.endsWith(".js")).sort()
  .forEach((f) => require(path.join(base, "content", "lessons", f)));
require(path.join(base, "markdown.js"));
require(path.join(base, "app.js"));
const A = globalThis.ACADEMY;
const L = A.logic;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("PASS " + name); }
  catch (e) { fail++; console.log("FAIL " + name + "\n     " + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || "") + " expected ~" + b + ", got " + a); }
const r3 = (x) => Math.round(x * 1000) / 1000;
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

/* Spaced repetition */
test("review cards answered Good every time return on Day 1, 2, 4, 7, 14, then 44", () => {
  const start = "2026-11-02";
  let c = L.newCard(start);
  const days = [daysBetween(start, c.due)];
  for (let i = 0; i < 5; i++) { c = L.schedule(c, "good", c.due); days.push(daysBetween(start, c.due)); }
  eq(days, [1, 2, 4, 7, 14, 44]);
});
test("Again sends a card back to Day 1 from any step", () => {
  let c = { step: 3, due: "2026-11-09", history: [] };
  c = L.schedule(c, "again", "2026-11-09");
  eq([c.step, c.due], [0, "2026-11-10"]);
});
test("Hard keeps the step and repeats the same interval", () => {
  let c = { step: 2, due: "2026-11-06", history: [] }; // Day 4 step, interval 2
  c = L.schedule(c, "hard", "2026-11-06");
  eq([c.step, c.due], [2, "2026-11-08"]);
});
test("schedule records every rating in the card history", () => {
  let c = L.newCard("2026-11-02");
  c = L.schedule(c, "hard", "2026-11-03"); c = L.schedule(c, "good", "2026-11-04");
  eq(c.history.map((h) => h.rating), ["hard", "good"]);
});
test("review dates stay correct across a month end and a DST change", () => {
  eq(L.addDays("2026-10-31", 1), "2026-11-01");
  eq(L.addDays("2026-03-28", 2), "2026-03-30");
});

/* Sampling */
test("softmax of 2.0, 1.0, 0.1 at T=1 gives 0.659, 0.242, 0.099 (lesson worked example)", () => {
  eq(L.softmax([2, 1, 0.1], 1).map(r3), [0.659, 0.242, 0.099]);
});
test("softmax at T=0.5 gives 0.864, 0.117, 0.019 (lesson faded step answer)", () => {
  eq(L.softmax([2, 1, 0.1], 0.5).map(r3), [0.864, 0.117, 0.019]);
});
test("softmax probabilities add up to 1 at every temperature", () => {
  [0.05, 0.3, 1, 2].forEach((t) => near(L.softmax([2, 1, 0.4, 0.1, -0.6], t).reduce((a, b) => a + b, 0), 1, 1e-9, "T=" + t));
});
test("top-p 0.9 keeps exactly the two most likely tokens in the worked example", () => {
  eq(L.topP(L.softmax([2, 1, 0.1], 1), 0.9), [0, 1]);
});
test("top-p 1.0 keeps every token", () => {
  eq(L.topP(L.softmax([2, 1, 0.4, 0.1, -0.6], 1), 1).length, 5);
});
test("the seeded sampler gives the same draws for the same seed", () => {
  const p = L.softmax([2, 1, 0.4, 0.1, -0.6], 1), k = L.topP(p, 1);
  const draw = (seed) => { const r = L.mulberry32(seed); return Array.from({ length: 20 }, () => L.sampleIndex(p, k, r)); };
  eq(draw(42), draw(42));
  if (JSON.stringify(draw(42)) === JSON.stringify(draw(7))) throw new Error("different seeds gave identical draws");
});
test("the sampler never picks a token that top-p removed", () => {
  const p = L.softmax([2, 1, 0.4, 0.1, -0.6], 1), k = L.topP(p, 0.7), r = L.mulberry32(1);
  for (let i = 0; i < 2000; i++) if (!k.includes(L.sampleIndex(p, k, r))) throw new Error("picked a removed token");
});

/* BPE */
test("BPE on the lesson corpus merges l+o first, then lo+w", () => {
  let s = L.bpeInit("low low low lower lowest newer newest");
  s = L.bpeStep(s); s = L.bpeStep(s);
  eq(s.merges.map((m) => m.a + "+" + m.b), ["l+o", "lo+w"]);
});
test("each BPE merge reduces the token count of the corpus", () => {
  let s = L.bpeInit("low low low lower lowest newer newest");
  let prev = L.bpeTokenCount(s), n;
  while ((n = L.bpeStep(s))) { const c = L.bpeTokenCount(n); if (c >= prev) throw new Error("count did not fall"); prev = c; s = n; }
});
test("BPE applies learned merges to an unseen word", () => {
  let s = L.bpeInit("low low low lower lowest newer newest");
  s = L.bpeStep(s); s = L.bpeStep(s);
  eq(L.bpeApply("lowness", s.merges), ["low", "n", "e", "s", "s"]);
});

/* Cost */
test("Opus 5.5 cost for 1,200 in and 300 out is $0.0108 (lesson worked example)", () => {
  near(L.cost(L.MODELS[0], 1200, 300).total, 0.0108, 1e-12);
});
test("Haiku 5.5 cost for the same request is $0.00027 (lesson faded step answer)", () => {
  near(L.cost(L.MODELS[2], 1200, 300).total, 0.00027, 1e-12);
});
test("Haiku 5.5 uses the long-prompt price above 100K input tokens", () => {
  const c = L.cost(L.MODELS[2], 150000, 1000);
  if (!c.long) throw new Error("long price not applied");
  near(c.total, 150000 * 0.5 / 1e6 + 1000 * 2.5 / 1e6, 1e-12);
});

/* Content integrity */
test("every curriculum lesson marked ready has a lesson file", () => {
  A.curriculum.forEach((t) => t.lessons.filter((l) => l.status === "ready").forEach((l) => { if (!A.lessons[l.id]) throw new Error(l.id + " missing"); }));
});
test("every addition in the curriculum states a reason", () => {
  A.curriculum.forEach((t) => t.subtopics.filter((s) => s.source === "addition").forEach((s) => { if (!s.why) throw new Error(s.id + " has no why"); }));
});
test("every lesson has three levels and every level ends with checks", () => {
  Object.values(A.lessons).forEach((l) => {
    eq(l.levels.length, 3, l.id);
    l.levels.forEach((lv) => { if (!lv.checks.length) throw new Error(l.id + " level " + lv.n + " has no checks"); });
  });
});
test("every multiple-choice check has a valid correct answer and an explanation", () => {
  Object.values(A.lessons).forEach((l) => l.levels.flatMap((lv) => lv.checks).filter((c) => c.type === "mcq").forEach((c) => {
    if (!(c.correct >= 0 && c.correct < c.options.length)) throw new Error(c.id + " correct index out of range");
    if (!c.explain) throw new Error(c.id + " has no explanation");
  }));
});
test("check ids and recall ids are unique", () => {
  const ids = Object.values(A.lessons).flatMap((l) => l.levels.flatMap((lv) => lv.checks.map((c) => c.id)).concat((l.recall || []).map((r) => r.id)));
  eq(ids.length, new Set(ids).size);
});
test("every interactive named in a lesson exists in the app", () => {
  // Built-in interactives in app.js, plus the interactives that lesson files add to A.ix.
  const known = ["genloop", "bpe", "sampler", "cost"]
    .concat(Object.keys(A.ix || {}).filter((k) => typeof A.ix[k] === "function"));
  Object.values(A.lessons).forEach((l) => l.levels.flatMap((lv) => lv.blocks).filter((b) => b.type === "interactive")
    .forEach((b) => { if (!known.includes(b.id)) throw new Error("unknown interactive " + b.id); }));
});
test("every resource link is https, and a resource without a link says so in its title", () => {
  const res = Object.values(A.lessons).flatMap((l) => l.resources || [])
    .concat(A.curriculum.flatMap((t) => t.resources || []));
  res.forEach((r) => {
    if (!r.url) { if (!/No link/.test(r.title)) throw new Error("empty link without a reason: " + r.title); return; }
    if (!/^https:\/\//.test(r.url)) throw new Error("not https: " + r.url);
  });
});
test("every ticket linked from a lesson exists and has all 11 body fields", () => {
  const need = ["objective", "context", "prerequisites", "requirements", "acceptance", "milestones", "files", "tests", "nfr", "questions", "checklist"];
  Object.values(A.lessons).forEach((l) => (l.tickets || []).forEach((id) => {
    const t = A.tickets[id]; if (!t) throw new Error(id + " missing");
    need.forEach((f) => { if (!t.fields[f]) throw new Error(id + " has no " + f); });
  }));
});

/* Markdown */
test("the ticket Markdown has the title and numbered sections 2 to 12", () => {
  const md = A.md.ticket(A.tickets["T-001"]);
  if (!md.startsWith("# T-001: ")) throw new Error("bad title line");
  for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
  if (/(^|[^\\])<[a-z]+[ >]/im.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
});
test("the handoff template has all seven sections and the review prompt", () => {
  const md = A.md.handoffTemplate(A.tickets["T-001"]);
  A.md.HANDOFF_SECTIONS.forEach((s) => { if (!md.includes("## " + s[1])) throw new Error(s[1] + " missing"); });
  if (!md.includes("## Review request")) throw new Error("review prompt missing");
});
test("PROGRESS.md for an empty state lists lesson 1.1 as not completed", () => {
  const md = A.md.progress({ lessons: {}, concepts: {}, reviews: {}, tickets: {}, journal: [], misconceptions: [] });
  if (!/\| 1\.1 \| .* \| 1 of 3 \| no \|/.test(md)) throw new Error("lesson row missing");
});

/* Wiring of lesson files */
const lessonDir = path.join(base, "content", "lessons");
const lessonFiles = fs.readdirSync(lessonDir).filter((f) => f.endsWith(".js")).sort();
test("the self-test loads the interactives that lesson files register in A.ix", () => {
  ["cosine2d", "l1-4-attention", "l1-5-block"].forEach((k) => { if (typeof (A.ix || {})[k] !== "function") throw new Error(k + " is not loaded"); });
});
test("index.html loads every lesson file in content/lessons, before app.js", () => {
  const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  const appAt = srcs.indexOf("app.js");
  if (appAt < 0) throw new Error("app.js script tag missing");
  lessonFiles.forEach((f) => {
    const at = srcs.indexOf("content/lessons/" + f);
    if (at < 0) throw new Error(f + " has no script tag");
    if (at > appAt) throw new Error(f + " loads after app.js");
  });
});
test("lesson, concept, check, recall, misconception and ticket ids are unique across all lessons", () => {
  const ids = [];
  Object.values(A.lessons).forEach((l) => {
    ids.push(l.id);
    (l.concepts || []).forEach((c) => ids.push(c.id));
    l.levels.forEach((lv) => lv.checks.forEach((c) => ids.push(c.id)));
    (l.recall || []).forEach((r) => ids.push(r.id));
    (l.misconceptions || []).filter((m) => m.id).forEach((m) => ids.push(m.id));
  });
  Object.keys(A.tickets).forEach((id) => ids.push(id));
  const seen = new Set(), dup = new Set();
  ids.forEach((id) => { if (!id) throw new Error("an item has an empty id"); if (seen.has(id)) dup.add(id); seen.add(id); });
  if (dup.size) throw new Error("duplicate ids: " + [...dup].join(", "));
  // A second file that sets the same lesson or ticket key replaces the first one silently. Count the assignments in the source.
  const keys = {};
  lessonFiles.forEach((f) => {
    const src = fs.readFileSync(path.join(lessonDir, f), "utf8");
    [...src.matchAll(/ACADEMY\.(lessons|tickets)\[\s*"([^"]+)"\s*\]\s*=/g)].forEach((m) => {
      const k = m[1] + " " + m[2]; keys[k] = (keys[k] || 0) + 1;
    });
  });
  const twice = Object.keys(keys).filter((k) => keys[k] > 1);
  if (twice.length) throw new Error("set in more than one place: " + twice.join(", "));
});
test("every ready lesson in curriculum.js has a lesson object with the same id", () => {
  let n = 0;
  A.curriculum.forEach((t) => t.lessons.filter((l) => l.status === "ready").forEach((l) => {
    const o = A.lessons[l.id];
    if (!o) throw new Error(l.id + " has no lesson object");
    if (o.id !== l.id) throw new Error(l.id + " lesson object has id " + o.id);
    n++;
  }));
  if (n < 5) throw new Error("expected at least 5 ready lessons, found " + n);
});
["T-002", "T-003", "T-004", "T-005"].forEach((id) => {
  test("ticket " + id + " converts to Markdown with the title, sections 2 to 12 and no HTML outside code", () => {
    const t = A.tickets[id];
    if (!t) throw new Error(id + " missing");
    const md = A.md.ticket(t);
    if (!md.startsWith("# " + id + ": ")) throw new Error("bad title line");
    for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
    if (/(^|[^\\])<[a-z]+[ >]/im.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
  });
});

/* Angle brackets in ticket text. The content is HTML, so the source writes a literal < as &lt;. */
const angleTicket = Object.assign({}, A.tickets["T-001"], { fields: Object.assign({}, A.tickets["T-001"].fields, {
  objective: "<p>Call the API with <code>effort=&lt;value&gt;</code> and put each document in <code>&lt;source&gt;</code> tags.</p>",
  requirements: "<ul><li>Replace &lt;value&gt; with low, medium or high.</li></ul>",
  tests: "<pre><code>prompt = \"&lt;source&gt;\" + text + \"&lt;/source&gt;\"</code></pre>",
  files: "<div class=\"table-wrap\"><table><tr><th>Flag</th><th>Value</th></tr><tr><td><code>--effort</code></td><td><code>&lt;value&gt;</code></td></tr></table></div>",
  nfr: "<p>The text &lt;b&gt;not bold&lt;/b&gt; and &amp;lt;i&amp;gt; is escaped text, not HTML.</p>"
}) });
test("ticket text with angle brackets survives in generated Markdown (code spans, code blocks, tables and prose)", () => {
  const md = A.md.ticket(angleTicket);
  ["`effort=<value>`", "`<source>`", "- Replace \\<value> with", "prompt = \"<source>\" + text + \"</source>\"", "| `--effort` | `<value>` |"]
    .forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
});
test("escaped HTML in ticket text stays text in generated Markdown and never becomes a raw tag", () => {
  const md = A.md.ticket(angleTicket);
  if (!md.includes("The text \\<b>not bold\\</b> and")) throw new Error("escaped <b> text lost");
  if (/(^|[^\\])<\/?[a-z]/im.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("raw HTML tag outside code");
});

/* Lesson 1.5: the transformer block interactive and the lesson numbers */
const blk = (A.ix || {})["l1-5-block"];
const runBlock = (o) => blk.compute(Object.assign({ token: 2, attn: true, ffn: true, res: true, ln: true, scale: 1, blocks: 1 }, o));
const len = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
test("block toy: the attention weights of \"sat\" add up to 1 and are 0.665, 0.214, 0.121", () => {
  const w = runBlock({}).first.weights[2];
  near(w.reduce((s, x) => s + x, 0), 1, 1e-9, "sum");
  eq(w.map(r3), [0.665, 0.214, 0.121]);
});
test("block toy: the causal mask gives \"The\" the weights 1, 0, 0", () => {
  eq(runBlock({ token: 0 }).first.weights[0].map(r3), [1, 0, 0]);
});
test("block toy: the output of \"sat\" is 1.236, 0.829, -0.310, 2.958 (ticket T-005 criterion 4)", () => {
  eq(runBlock({}).out.map(r3), [1.236, 0.829, -0.31, 2.958]);
});
test("block toy: with attention and feed-forward off, the residual block returns its input exactly", () => {
  [0, 1, 2].forEach((t) => { const r = runBlock({ token: t, attn: false, ffn: false }); eq(r.out, r.input[t], "token " + t); });
});
test("block toy: with layer norm, input scales 0.25 to 4 give the same attention weights within 0.001 (eps causes the small difference)", () => {
  const a = runBlock({ scale: 1 }).first.weights[2];
  [0.25, 4].forEach((sc) => runBlock({ scale: sc }).first.weights[2].forEach((x, i) => near(x, a[i], 1e-3, "scale " + sc + " weight " + i)));
});
test("block toy: without layer norm, a larger input scale makes the attention weights sharper", () => {
  const w = runBlock({ ln: false, scale: 4 }).first.weights[2];
  if (!(w[0] > 0.95)) throw new Error("expected the first weight above 0.95, got " + w[0]);
});
test("block toy: without residual connections, \"sat\" loses its input (cosine -0.113)", () => {
  near(runBlock({}).keep, 0.98, 0.005, "with residual");
  near(runBlock({ res: false }).keep, -0.113, 0.001, "without residual");
});
test("block toy: over 12 blocks the vector length stays below 20 with layer norm and grows above 10,000 without it", () => {
  const withLn = runBlock({ blocks: 12 }).stack, noLn = runBlock({ blocks: 12, ln: false }).stack;
  eq(withLn.length, 12, "stack size");
  if (!(withLn[11].length < 20)) throw new Error("with layer norm: " + withLn[11].length);
  if (!(noLn[11].length > 10000)) throw new Error("without layer norm: " + noLn[11].length);
});
test("ticket T-005 fixture data/block_toy.json equals the numbers of the lesson interactive", () => {
  const html = A.tickets["T-005"].fields.files;
  const m = html.match(/block_toy\.json<\/code>[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("fixture block not found in the files field");
  eq(JSON.parse(m[1]), blk.TOY);
});
test("lesson 1.5 numbers: layer norm of 2, 4, 6, 8 is -1.342, -0.447, 0.447, 1.342, and the scale does not matter", () => {
  eq(blk.layerNorm([2, 4, 6, 8]).map(r3), [-1.342, -0.447, 0.447, 1.342]);
  eq(blk.layerNorm([20, 40, 60, 80]).map(r3), [-1.342, -0.447, 0.447, 1.342]);
  eq(blk.layerNorm([1, 1, 0, 2]).map(r3), [0, 0, -1.414, 1.414]);
  eq(blk.layerNorm([3, 3, 3, 3]), [0, 0, 0, 0]);
});
test("lesson 1.5 numbers: the feed-forward example gives 0.5, -1.0 with ReLU and -1.5, -3.0 without it", () => {
  const W1 = [[1, -1, 0, 1], [0, 1, -1, 1]], W2 = [[0.5, 0], [0, 0.5], [1, 1], [0, -0.5]];
  const mv = (v, W) => W[0].map((_, c) => v.reduce((s, x, r) => s + x * W[r][c], 0));
  const h = mv([1, 2], W1);
  eq(h, [1, 1, -2, 3], "hidden");
  eq(mv(h.map((x) => Math.max(0, x)), W2), [0.5, -1], "with ReLU");
  eq(mv(h, W2), [-1.5, -3], "without ReLU");
});
test("lesson 1.5 numbers: one block has 3,145,728 weights for 512 and 2048, 3,152,384 with biases and layer norm", () => {
  const d = 512, f = 2048, w = 4 * d * d + 2 * d * f;
  eq(w, 3145728);
  eq(w + 4 * d + (f + d) + 2 * 2 * d, 3152384);
  eq(4 * 1024 * 1024 + 2 * 1024 * 4096, 12582912, "check l1-5-L2-b");
  eq(6 * 2048, 12288, "check l1-5-L3-b");
});
test("lesson 1.5 numbers: the T-005 Markdown contains the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-005.md"), "utf8");
  ["block_toy.json", "[1.236, 0.829, -0.310, 2.958]", "3,145,728", "3,152,384"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
});

/* Lesson 1.6: the training interactive, the T-006 fixture and the lesson numbers */
const trn = (A.ix || {})["l1-6-training"];
const runTrain = (o) => trn.compute(Object.assign({ stage: "pref", steps: 10, beta: 1, flaw: false }, o));
test("interactive l1-6-training is loaded as a function", () => {
  if (typeof trn !== "function") throw new Error("l1-6-training is not loaded");
});
test("training toy: the base model gives the FAQ list the highest probability, 0.694, 0.094, 0.155, 0.057", () => {
  const r = runTrain({ stage: "base" });
  eq(r.probs.map(r3), [0.694, 0.094, 0.155, 0.057]);
  eq(r.top, 0, "top reply");
  near(r.humanScore, -1.18, 0.001, "human rating");
});
test("training toy: 10 SFT steps give 0.099, 0.811, 0.060, 0.031 and a loss of 0.210 (ticket T-006 criterion 6)", () => {
  const r = runTrain({ stage: "sft" });
  eq(r.probs.map(r3), [0.099, 0.811, 0.06, 0.031]);
  near(r.demoLoss, 0.21, 0.001, "SFT loss");
  near(r.humanScore, 1.423, 0.001, "human rating");
});
test("training toy: 0 SFT steps leave the base model unchanged, and more SFT steps always lower the SFT loss", () => {
  eq(runTrain({ stage: "sft", steps: 0 }).probs, runTrain({ stage: "base" }).probs);
  let last = Infinity;
  for (let s = 0; s <= 30; s++) { const l = runTrain({ stage: "sft", steps: s }).demoLoss; if (!(l < last)) throw new Error("loss did not go down at step " + s); last = l; }
});
test("training toy: every stage gives probabilities that add up to 1 for every beta, with and without the flaw", () => {
  trn.BETAS.forEach((beta) => [false, true].forEach((flaw) => ["base", "sft", "pref"].forEach((stage) => {
    near(runTrain({ stage, beta, flaw }).probs.reduce((a, b) => a + b, 0), 1, 1e-9, stage + " beta " + beta + " flaw " + flaw);
  })));
});
test("training toy: with the true reward model and beta 1, Helpful gets 0.980 and the KL from the SFT model is 0.151", () => {
  const r = runTrain({});
  eq(r.probs.map(r3), [0.002, 0.98, 0.016, 0.002]);
  near(r.klFromSft, 0.151, 0.001, "KL");
});
test("training toy: a larger beta always keeps the tuned model nearer to the SFT model (smaller KL)", () => {
  [false, true].forEach((flaw) => {
    const k = trn.BETAS.map((beta) => runTrain({ beta, flaw }).klFromSft);
    for (let i = 1; i < k.length; i++) if (!(k[i] < k[i - 1])) throw new Error("flaw " + flaw + ": KL did not fall at beta " + trn.BETAS[i]);
  });
});
test("training toy: the flawed reward model with beta 0.25 gives Padded 0.995, the reward score goes up to 3.991 and the human rating falls to 0.507", () => {
  const r = runTrain({ beta: 0.25, flaw: true });
  near(r.probs[2], 0.995, 0.001, "Padded");
  eq(r.top, 2, "top reply");
  near(r.rewardScore, 3.991, 0.001, "reward score");
  near(r.humanScore, 0.507, 0.001, "human rating");
  if (!(r.humanScore < runTrain({ stage: "sft" }).humanScore)) throw new Error("human rating is not below the SFT model");
});
test("training toy: the flawed reward model with beta 1 still keeps Helpful on top at 0.646", () => {
  const r = runTrain({ beta: 1, flaw: true });
  near(r.probs[1], 0.646, 0.001, "Helpful");
  eq(r.top, 1, "top reply");
});
test("training toy: preferencePolicy does not overflow at beta 0.001 and puts all probability on the highest reward", () => {
  const p = trn.preferencePolicy([0.25, 0.25, 0.25, 0.25], [-2, 2, 4, -1], 0.001);
  p.forEach((x, i) => { if (!Number.isFinite(x)) throw new Error("value " + i + " is not finite"); });
  eq(p.map(r3), [0, 0, 1, 0]);
});
test("ticket T-006 fixture data/training_toy.json equals the numbers of the lesson interactive", () => {
  const html = A.tickets["T-006"].fields.files;
  const m = html.match(/training_toy\.json<\/code>[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("fixture block not found in the files field");
  eq(JSON.parse(m[1]), trn.TOY);
});
test("ticket T-006 converts to Markdown with the title, sections 2 to 12 and no HTML outside code", () => {
  const t = A.tickets["T-006"];
  if (!t) throw new Error("T-006 missing");
  const md = A.md.ticket(t);
  if (!md.startsWith("# T-006: ")) throw new Error("bad title line");
  for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
  if (/(^|[^\\])<[a-z]+[ >]/im.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
});
const nll = (p) => -Math.log(p);
const sig = (x) => 1 / (1 + Math.exp(-x));
test("lesson 1.6 numbers: the pretraining loss of 0.2, 0.5, 0.8 is 0.842 with perplexity 2.321, and a uniform guess over 50,000 tokens gives 10.82", () => {
  const m = [0.2, 0.5, 0.8].map(nll).reduce((a, b) => a + b, 0) / 3;
  near(m, 0.842, 0.0005, "mean loss");
  near(Math.exp(m), 2.321, 0.0005, "perplexity");
  near(Math.log(50000), 10.82, 0.005, "uniform");
  near(nll(0.01), 4.605, 0.0005, "p = 0.01");
  near(nll(0.25), 1.386, 0.0005, "check l1-6-L2-a");
});
test("lesson 1.6 numbers: the masked SFT loss is 0.602, the wrong denominator gives 0.301, and no mask gives 0.335", () => {
  const p = [0.9, 0.95, 0.99, 0.9, 0.5, 0.25, 0.8, 0.9], mask = [0, 0, 0, 0, 1, 1, 1, 1];
  const sum = p.reduce((s, x, i) => s + mask[i] * nll(x), 0);
  near(sum / 4, 0.602, 0.0005, "masked");
  near(sum / 8, 0.301, 0.0005, "debugging case 1");
  near(p.map(nll).reduce((a, b) => a + b, 0) / 8, 0.335, 0.0005, "no mask");
});
test("lesson 1.6 numbers: the reward model, the KL optimum and the DPO loss match the worked examples", () => {
  near(sig(1), 0.731, 0.0005, "sigma(1)");
  near(nll(sig(1)), 0.313, 0.0005, "reward model loss");
  near(nll(sig(-1)), 1.313, 0.0005, "swapped loss");
  near(sig(2), 0.881, 0.0005, "check l1-6-L2-b");
  eq(trn.preferencePolicy([0.5, 0.5], [1, 0], 1).map(r3), [0.731, 0.269], "beta 1");
  eq(trn.preferencePolicy([0.5, 0.5], [1, 0], 0.5).map(r3), [0.881, 0.119], "beta 0.5");
  eq(trn.preferencePolicy([0.5, 0.5], [1, 0], 10).map(r3), [0.525, 0.475], "beta 10");
  near(nll(sig(0.1 * ((-10 + 12) - (-15 + 14)))), 0.554, 0.0005, "DPO loss");
  near(nll(sig(0)), 0.693, 0.0005, "DPO loss at the start");
});
test("lesson 1.6 numbers: the T-006 Markdown contains the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-006.md"), "utf8");
  ["training_toy.json", "0.842", "2.321", "0.602", "0.313", "1.313", "[0.731, 0.269]", "0.554", "0.693", "[0.099, 0.811, 0.060, 0.031]", "0.995", "0.507"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
});

/* Lesson 1.7: the KV cache interactive, the lesson numbers and ticket T-007 */
const kvc = (A.ix || {})["l1-7-kvcache"];
test("lesson 1.7: the interactive l1-7-kvcache is loaded and lesson 1.7 shows it", () => {
  if (typeof kvc !== "function") throw new Error("l1-7-kvcache is not loaded");
  const l = A.lessons["1.7"];
  if (!l) throw new Error("lesson 1.7 missing");
  const ids = l.levels.flatMap((lv) => lv.blocks.filter((b) => b.type === "interactive").map((b) => b.id));
  if (!ids.includes("l1-7-kvcache")) throw new Error("lesson 1.7 does not show l1-7-kvcache");
  eq(l.tickets, ["T-007"]);
});
test("lesson 1.7 steps: with the cache, 4 prompt and 4 output tokens need 7 K, V computations and 28 scores; without it 22 and 74", () => {
  const on = kvc.steps({ prompt: 4, output: 4, cache: true }), off = kvc.steps({ prompt: 4, output: 4, cache: false });
  eq([on.kv, on.scores, on.cacheEntries, on.cols, on.rows.length], [7, 28, 7, 7, 4]);
  eq([off.kv, off.scores, off.cacheEntries], [22, 74, 0]);
  eq(on.rows[2].cells, ["cached", "cached", "cached", "cached", "cached", "new", ""], "step 2 with the cache");
  eq(off.rows[2].cells, ["again", "again", "again", "again", "again", "new", ""], "step 2 without the cache");
  eq(kvc.steps({ prompt: 8, output: 8, cache: true }).kv, 15);
  eq(kvc.steps({ prompt: 8, output: 8, cache: false }).scores, 596);
});
test("lesson 1.7 steps: for 1,000 prompt and 500 output tokens the cache cuts K, V work from 624,750 to 1,499", () => {
  const on = kvc.steps({ prompt: 1000, output: 500, cache: true }), off = kvc.steps({ prompt: 1000, output: 500, cache: false });
  eq([on.kv, off.kv, on.scores, off.scores], [1499, 624750, 1124250, 395833250]);
});
test("lesson 1.7 memory: 524,288 bytes per token, 2,147,483,648 for 4,096 tokens, 536,870,912 with 8 KV heads", () => {
  eq(kvc.memory({ tokens: 1, kvHeads: 32, bytes: 2 }).cache, 524288);
  eq(kvc.memory({ tokens: 4096, kvHeads: 32, bytes: 2 }).cache, 2147483648);
  eq(kvc.memory({ tokens: 4096, kvHeads: 8, bytes: 2 }).cache, 536870912);
  eq(kvc.memory({ tokens: 1, kvHeads: 1, bytes: 2 }).perToken, 16384);
  eq(kvc.memory({ tokens: 4096, kvHeads: 32, bytes: 1 }).cache, 1073741824, "8-bit halves the cache");
  eq(kvc.memory({ tokens: 100000, kvHeads: 32, bytes: 2 }).cache, 52428800000);
  eq(kvc.memory({ tokens: 100000, kvHeads: 8, bytes: 2 }).cache, 13107200000);
});
test("lesson 1.7 memory: block weights are 6,442,450,944 and the cache equals them at 24,576 = 6 x 4096 tokens", () => {
  const m = kvc.memory({ tokens: 8192, kvHeads: 32, bytes: 2 });
  eq(m.weightCount, 6442450944);
  eq(m.equalAt, 24576);
  eq(6 * 4096, 24576, "check l1-7-L3-b");
  near(m.ratio, 1 / 3, 1e-12, "ratio at 8,192");
  near(m.cacheShare, 0.25, 1e-12, "share at 8,192");
  eq(Math.round(kvc.memory({ tokens: 100000, kvHeads: 32, bytes: 2 }).cacheShare * 100), 80);
  eq(Math.round(kvc.memory({ tokens: 100000, kvHeads: 8, bytes: 2 }).cacheShare * 100), 50);
  eq(2 * 24 * 16 * 64 * 2, 98304, "check l1-7-L2-a");
});
test("lesson 1.7 numbers: a cached decode of the 1.4 toy gives 0.330, 0.670 for cat and 0.497, 0.752 for sat", () => {
  const Q = [[1, 0], [0, 1], [1, 1]], K = [[1, 0], [1, 1], [0, 1]], V = [[1, 0], [0, 1], [1, 1]];
  const attend = (q, ks, vs) => {
    const s = ks.map((k) => (q[0] * k[0] + q[1] * k[1]) / Math.SQRT2), m = Math.max(...s);
    const e = s.map((x) => Math.exp(x - m)), t = e.reduce((a, b) => a + b, 0), w = e.map((x) => x / t);
    return { w, out: [0, 1].map((c) => w.reduce((acc, wj, j) => acc + wj * vs[j][c], 0)) };
  };
  const ck = [], cv = [], outs = [];
  for (let i = 0; i < 3; i++) { ck.push(K[i]); cv.push(V[i]); outs.push(attend(Q[i], ck, cv)); }
  eq(outs[1].out.map(r3), [0.33, 0.67]);
  eq(outs[2].w.map(r3), [0.248, 0.503, 0.248]);
  eq(outs[2].out.map(r3), [0.497, 0.752]);
});
test("lesson 1.7 numbers: a cached decode of the 1.5 block toy equals the full causal pass for every token", () => {
  const T = blk.TOY, D = 4;
  const mul = (v, W) => W[0].map((_, c) => v.reduce((s, x, r) => s + x * W[r][c], 0));
  const cache = { k: [], v: [] }, outs = [];
  T.x.forEach((x) => {
    const a = blk.layerNorm(x), q = mul(a, T.w_q);
    cache.k.push(mul(a, T.w_k)); cache.v.push(mul(a, T.w_v));
    const s = cache.k.map((k) => q.reduce((acc, qi, i) => acc + qi * k[i], 0) / Math.sqrt(D)), m = Math.max(...s);
    const e = s.map((z) => Math.exp(z - m)), t = e.reduce((p, z) => p + z, 0);
    const att = mul([0, 1, 2, 3].map((c) => e.reduce((acc, ej, j) => acc + (ej / t) * cache.v[j][c], 0)), T.w_o);
    const h = x.map((xi, i) => xi + att[i]);
    const ff = mul(mul(blk.layerNorm(h), T.w_1).map((z) => Math.max(0, z)), T.w_2);
    outs.push(h.map((hi, i) => hi + ff[i]));
  });
  const full = runBlock({}).first.y;
  outs.forEach((o, i) => o.forEach((z, c) => near(z, full[i][c], 1e-12, "token " + i + " feature " + c)));
  eq(outs[2].map(r3), [1.236, 0.829, -0.31, 2.958]);
  eq(cache.k.length, 3);
});
test("lesson 1.7 debugging: adding k, v after attention changes token 1 to -0.366, 2.655, 0.500, 0.500; the full pass gives -0.961, 3.617, -0.726, 1.510", () => {
  const T = blk.TOY;
  const mul = (v, W) => W[0].map((_, c) => v.reduce((s, x, r) => s + x * W[r][c], 0));
  // The bug: attend first, then add k and v. An empty cache falls back to the token itself.
  const ck = [], cv = [], outs = [];
  T.x.forEach((x) => {
    const a = blk.layerNorm(x), q = mul(a, T.w_q), k = mul(a, T.w_k), v = mul(a, T.w_v);
    const keys = ck.length ? ck : [k], vals = cv.length ? cv : [v];
    const s = keys.map((kk) => q.reduce((p, qi, i) => p + qi * kk[i], 0) / 2), m = Math.max(...s);
    const e = s.map((z) => Math.exp(z - m)), t = e.reduce((p, z) => p + z, 0);
    const att = mul([0, 1, 2, 3].map((c) => e.reduce((p, ej, j) => p + (ej / t) * vals[j][c], 0)), T.w_o);
    ck.push(k); cv.push(v);
    const h = x.map((xi, i) => xi + att[i]);
    const ff = mul(mul(blk.layerNorm(h), T.w_1).map((z) => Math.max(0, z)), T.w_2);
    outs.push(h.map((hi, i) => hi + ff[i]));
  });
  const full = runBlock({}).first.y;
  eq(outs[0].map(r3), full[0].map(r3), "token 0 matches");
  eq(outs[1].map(r3), [-0.366, 2.655, 0.5, 0.5]);
  eq(full[1].map(r3), [-0.961, 3.617, -0.726, 1.51]);
});
test("lesson 1.7 debugging: with a 20,000-token window and max_tokens 1,024, the lesson chat first fails at turn 37 with 19,200 input tokens", () => {
  let k = 1;
  while (1200 + 500 * (k - 1) + 1024 <= 20000) k++;
  eq([k, 1200 + 500 * (k - 1)], [37, 19200]);
});
test("lesson 1.7 numbers: a 10-turn chat sends 1,200 to 5,700 input tokens, 34,500 in total; 20 turns send 119,000", () => {
  const reqs = (n) => Array.from({ length: n }, (_, k) => 1000 + 200 + 500 * k);
  const r10 = reqs(10), r20 = reqs(20), sum = (a) => a.reduce((s, x) => s + x, 0);
  eq([r10[0], r10[9], sum(r10)], [1200, 5700, 34500]);
  eq([r20[19], sum(r20)], [10700, 119000]);
  near(sum(r10) * 4 / 1e6, 0.138, 1e-12, "Opus input cost");
  eq(2000 + 4 * 500 + 100, 4100, "check l1-7-L2-b");
});
test("lesson 1.7 numbers: the T-007 trim example keeps the newest 7 pairs (15 messages, 4,700 input tokens)", () => {
  // Keep the largest number of newest pairs with 1,000 + 500 x pairs + 200 + 1,024 <= 6,000.
  let pairs = 10;
  while (pairs > 0 && 1000 + 500 * pairs + 200 + 1024 > 6000) pairs--;
  eq([pairs, 2 * pairs + 1, 1000 + 500 * pairs + 200], [7, 15, 4700]);
  eq([4976 + 1024 <= 6000, 4977 + 1024 <= 6000], [true, false]);
  if (1000 + 5000 + 1024 <= 6000) throw new Error("the 5,000-token question must not fit");
});
test("ticket T-007 converts to Markdown with the title, sections 2 to 12 and no HTML outside code", () => {
  const t = A.tickets["T-007"];
  if (!t) throw new Error("T-007 missing");
  eq([t.lesson, t.phase], ["1.7", 1]);
  const md = A.md.ticket(t);
  if (!md.startsWith("# T-007: ")) throw new Error("bad title line");
  for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
  if (/<[a-z]+[ >]/i.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
});
test("lesson 1.7 numbers: the T-007 Markdown file contains the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-007.md"), "utf8");
  ["block_toy.json", "[1.236, 0.829, -0.310, 2.958]", "524,288", "2,147,483,648", "536,870,912", "34,500", "4,700", "ContextBudgetError"]
    .forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
  if (!fs.existsSync(path.join(base, "..", "project", "handoffs", "T-007-handoff.md"))) throw new Error("T-007 handoff template missing");
});
test("lesson 1.7: index.html loads 07-context-kv-cache.js and 07-ix.js", () => {
  const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
  ["content/lessons/07-context-kv-cache.js", "content/lessons/07-ix.js"].forEach((s) => { if (!html.includes('src="' + s + '"')) throw new Error(s + " missing"); });
});

/* Lesson 1.8: the grounding interactive, the lesson numbers and ticket T-008 */
const grd = (A.ix || {})["l1-8-grounding"];
const runGround = (o) => grd.compute(Object.assign({ q: "refund-window", ground: false, k: 1, minScore: 0.5, instruct: false, stale: false, temp: 1 }, o));
const probs = (r) => r.candidates.map((c) => r3(c.p));
const scores = (r) => r.ranked.map((x) => x.doc.id + " " + r3(x.score));
test("the self-test loads the lesson 1.8 interactive l1-8-grounding", () => {
  if (typeof grd !== "function") throw new Error("l1-8-grounding is not loaded");
  if (typeof grd.compute !== "function") throw new Error("compute is not exported");
});
test("grounding toy: retrieval ranks the refund question 0.984, 0.933, 0.421, 0.214 (lesson worked example and T-008 criterion 1)", () => {
  eq(scores(runGround({})), ["refund-policy 0.984", "warranty-claims 0.933", "delivery-times 0.421", "vpn-setup 0.214"]);
});
test("grounding toy: without sources the refund question answers the wrong 30 days with 0.563, and the correct 45 days has 0.076", () => {
  const r = runGround({});
  eq(probs(r), [0.207, 0.563, 0.076, 0.126, 0.028]);
  eq(r.top.answer, "30 days");
  eq(r.verdict, "unsupported");
});
test("grounding toy: with the refund-policy source, 45 days gets 0.924 and the verdict is grounded", () => {
  const r = runGround({ ground: true });
  eq(r.top.answer, "45 days");
  near(r.top.p, 0.924, 0.0005, "45 days");
  eq(r.verdict, "grounded");
});
test("grounding toy: a stale index gives a cited but wrong 30 days (verdict stale)", () => {
  const r = runGround({ ground: true, stale: true });
  eq(r.top.answer, "30 days");
  eq(r.verdict, "stale");
  if (!(r.pWrong > 0.99)) throw new Error("expected pWrong above 0.99, got " + r.pWrong);
});
test("grounding toy: temperature 0.25 without sources makes the wrong answer more certain (30 days 0.979), not correct", () => {
  const r = runGround({ temp: 0.25 });
  eq(r.top.answer, "30 days");
  near(r.top.p, 0.979, 0.0005, "30 days");
  if (!(r.pCorrect < 0.001)) throw new Error("expected pCorrect below 0.001, got " + r.pCorrect);
});
test("grounding toy: k = 1 misses the warranty document (refund-policy 0.995 is above warranty-claims 0.983), and k = 2 finds it", () => {
  eq(scores(runGround({ q: "warranty-length" })).slice(0, 2), ["refund-policy 0.995", "warranty-claims 0.983"]);
  eq(runGround({ q: "warranty-length", ground: true, k: 1 }).sources.map((d) => d.id), ["refund-policy"]);
  const k2 = runGround({ q: "warranty-length", ground: true, k: 2 });
  eq(k2.top.answer, "2 years");
  near(k2.top.p, 0.976, 0.0005, "2 years");
});
test("grounding toy: no document passes the minimum score for the vacation question, and the abstain instruction makes I don't know 0.667", () => {
  const r = runGround({ q: "vacation-days", ground: true, k: 4, instruct: true });
  eq(r.sources.length, 0, "sources");
  eq(r.top.answer, "I don't know");
  near(r.top.p, 0.667, 0.0005, "I don't know");
  eq(r.verdict, "abstain-right");
});
test("grounding toy: the answer probabilities add up to 1 for every question and setting", () => {
  ["refund-window", "warranty-length", "vacation-days"].forEach((q) => [0.25, 1, 2].forEach((temp) => [false, true].forEach((g) => {
    const r = runGround({ q, temp, ground: g, instruct: g, k: 2 });
    near(r.candidates.reduce((s, c) => s + c.p, 0), 1, 1e-9, q + " T=" + temp);
    near(r.pCorrect + r.pAbstain + r.pWrong, 1, 1e-9, q + " parts");
  })));
});
test("ticket T-008 fixture data/grounding_faq.json equals the documents and questions of the lesson interactive", () => {
  const html = A.tickets["T-008"].fields.files;
  const m = html.match(/grounding_faq\.json<\/code>\.[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("fixture block not found in the files field");
  eq(JSON.parse(m[1]), {
    dimensions: grd.TOY.dimensions,
    documents: grd.TOY.documents.map((d) => ({ id: d.id, title: d.title, text: d.text, vector: d.vector })),
    queries: grd.TOY.questions.map((q) => ({ id: q.id, text: q.text, vector: q.vector }))
  });
});
test("ticket T-008 converts to Markdown with the title, sections 2 to 12 and no HTML outside code", () => {
  const md = A.md.ticket(A.tickets["T-008"]);
  if (!md.startsWith("# T-008: ")) throw new Error("bad title line");
  for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
  if (/<[a-z]+[ >]/i.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
  if (/``/.test(md.replace(/```/g, ""))) throw new Error("an empty code span: a tag inside <code> was lost");
});
test("lesson 1.8 numbers: the T-008 Markdown contains the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-008.md"), "utf8");
  ["grounding_faq.json", "refund-policy 0.984", "warranty-claims 0.933", "(0.995)", "(0.983)", "no_sources", "HTTP 422"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
});

/* Lesson 1.9: the thinking tokens interactive and the lesson numbers */
const thk = (A.ix || {})["l1-9-thinking"];
const runThink = (o) => thk.compute(Object.assign({ task: 2, effort: 1, model: 0, maxTokens: 16000 }, o));
test("thinking toy: the interactive uses the price table of app.js", () => {
  eq(runThink({}).model, L.MODELS[0]);
  eq(runThink({ model: 2 }).model, L.MODELS[2]);
});
test("thinking toy: thinking tokens are billed as output (refund: low $0.0146, medium $0.0326, high $0.0646 on Opus 5.5)", () => {
  near(runThink({ effort: 0 }).cost.total, 0.0146, 1e-9, "low");
  near(runThink({ effort: 1 }).cost.total, 0.0326, 1e-9, "medium");
  const hi = runThink({ effort: 2 });
  eq([hi.output, hi.stop, hi.outcome], [3050, "end_turn", "meets the bar"]);
  near(hi.cost.total, 0.0646, 1e-9, "high (ticket T-009 criterion 6)");
});
test("thinking toy: thinking that fills max_tokens leaves no answer and still costs $0.0855", () => {
  const r = runThink({ effort: 4, maxTokens: 4096 });
  eq([r.thinking, r.answer, r.answerState, r.stop, r.outcome], [4096, 0, "none", "max_tokens", "no usable answer"]);
  near(r.cost.total, 0.08552, 1e-9, "cost");
  eq(runThink({ effort: 3, maxTokens: 4096 }).stop, "max_tokens", "xhigh (check l1-9-L2-a)");
});
test("thinking toy: when a short answer does not fit after the thinking, the answer is cut off", () => {
  const r = runThink({ effort: 1, maxTokens: 1024 });
  eq([r.thinking, r.answer, r.answerState, r.stop], [1024, 0, "none", "max_tokens"]);
  const p = thk.compute({ task: 1, effort: 2, model: 0, maxTokens: 1500 });
  eq([p.thinking, p.answer, p.answerState, p.stop], [1400, 100, "cut off", "max_tokens"]);
});
test("thinking toy: on the classify task, max effort costs 23.5 times low effort and gives no better outcome", () => {
  const lo = runThink({ task: 0, effort: 0 }), hi = runThink({ task: 0, effort: 4 });
  near(lo.cost.total, 0.0016, 1e-9, "low");
  near(hi.cost.total, 0.0376, 1e-9, "max");
  eq([lo.outcome, hi.outcome], ["meets the bar", "meets the bar"]);
  eq(r3(hi.cost.total / lo.cost.total), 23.5);
});
test("thinking toy: the sweep marks the cheapest effort that meets the bar (refund high, policy medium, classify low)", () => {
  eq(thk.sweep({ task: 2, model: 0, maxTokens: 4096 }).cheapest, 2, "refund");
  eq(thk.sweep({ task: 1, model: 0, maxTokens: 16000 }).cheapest, 1, "policy");
  eq(thk.sweep({ task: 0, model: 0, maxTokens: 16000 }).cheapest, 0, "classify");
});
test("thinking toy: more thinking never lowers the cost, for every task, model and max_tokens", () => {
  [0, 1, 2].forEach((t) => [0, 1, 2].forEach((m) => thk.MAX_TOKENS.forEach((mx) => {
    const rows = thk.sweep({ task: t, model: m, maxTokens: mx }).rows;
    rows.forEach((r, i) => {
      eq(r.thinking + r.answer, r.output, "output sum");
      if (r.output > mx) throw new Error("output above max_tokens: task " + t + " max " + mx);
      if (i && r.cost.total < rows[i - 1].cost.total) throw new Error("cost went down: task " + t + " model " + m + " max " + mx);
    });
  })));
});
test("lesson 1.9 numbers: the cost per correct answer is $0.0252 at low and $0.0721 at high, and the total with $0.50 per wrong answer is $20.56 and $11.06", () => {
  const one = (out) => 900 * 4 / 1e6 + out * 20 / 1e6;
  near(one(600), 0.0156, 1e-12, "low request");
  near(one(3100), 0.0656, 1e-12, "high request");
  near(100 * one(600) / 62, 0.02516, 1e-5, "low per correct (ticket T-009 criterion 7)");
  near(100 * one(3100) / 91, 0.07209, 1e-5, "high per correct");
  near(100 * one(600) + 38 * 0.5, 20.56, 1e-9, "low total");
  near(100 * one(3100) + 9 * 0.5, 11.06, 1e-9, "high total");
  near(L.cost(L.MODELS[0], 900, 3050).total, 0.0646, 1e-9, "T-009 criterion 6 with the app cost function");
});
test("lesson 1.9 numbers: the refund example of ticket T-009 gives $100", () => {
  const share = (p) => 12 * p / (80 + 40);
  eq(share(80) + share(40), 12, "coupon shares");
  eq((80 - share(80)) + (40 - share(40)) * 0.5 + 10, 100);
});
test("lesson 1.9 numbers: the milestone 4 cost estimate is about $0.04 at the Haiku 5.5 prices", () => {
  near(20 * (500 * L.MODELS[2].in + 4000 * L.MODELS[2].out) / 1e6, 0.041, 1e-9);
});
test("lesson 1.9 numbers: the T-009 Markdown contains the tests, the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-009.md"), "utf8");
  ["thinking.py", "reasoning_eval.json", "0.0646", "0.02516", "test_only_thinking_at_max_tokens_is_no_answer", "budget_tokens"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
  const m = A.tickets["T-009"].fields.files.match(/reasoning_eval\.json<\/code>, with two example questions[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("fixture block not found in the files field");
  eq(JSON.parse(m[1]).map((q) => [q.kind, q.expected]), [["classify", "billing"], ["multi_step", "100"]]);
});

/* Lesson 2.1: the conversation replay interactive, the lesson numbers and ticket T-010 */
const conv = (A.ix || {})["l2-1-conversation"];
const runConv = (o) => conv.compute(Object.assign({ turn: 4, forget: false, model: 0 }, o));
test("conversation toy: the interactive uses the price table of app.js", () => {
  eq(runConv({}).model, L.MODELS[0]);
  eq(runConv({ model: 2 }).model, L.MODELS[2]);
});
test("conversation toy: with history, turn 4 sends the system prompt as the top-level field and all 7 messages", () => {
  const r = runConv({});
  eq(r.system.tokens, 400, "system tokens");
  if (r.messages.some((m) => m.role === "system")) throw new Error("the system prompt is in the messages list");
  eq(r.messages.map((m) => m.role), ["user", "assistant", "user", "assistant", "user", "assistant", "user"]);
});
test("conversation toy: every messages list starts with user, alternates roles and ends with user (no prefill), in both modes", () => {
  [false, true].forEach((forget) => [1, 2, 3, 4].forEach((turn) => {
    const roles = runConv({ turn, forget }).messages.map((m) => m.role);
    if (roles[0] !== "user") throw new Error("turn " + turn + " starts with " + roles[0]);
    if (roles[roles.length - 1] !== "user") throw new Error("turn " + turn + " ends with " + roles[roles.length - 1]);
    roles.forEach((r, i) => { if (i && r === roles[i - 1]) throw new Error("two " + r + " turns in a row at turn " + turn); });
  }));
});
test("conversation toy: input tokens per turn are 430, 560, 655, 760 with history and 430, 410, 415, 415 without", () => {
  eq([1, 2, 3, 4].map((turn) => runConv({ turn }).inputTokens), [430, 560, 655, 760]);
  eq([1, 2, 3, 4].map((turn) => runConv({ turn, forget: true }).inputTokens), [430, 410, 415, 415]);
});
test("conversation toy: without history, the request at turn 4 holds one message and the answer loses the order number", () => {
  const f = runConv({ forget: true }), h = runConv({});
  eq(f.messages.length, 1);
  eq([h.answer.knowsContext, f.answer.knowsContext], [true, false]);
  if (!/NW-4471/.test(h.answer.text)) throw new Error("the answer with history does not name the order");
  if (/NW-4471/.test(f.answer.text)) throw new Error("the answer without history names the order");
});
test("conversation toy: four turns on Opus 5.5 cost $0.01662 with history and $0.01038 without", () => {
  const h = conv.replay({ forget: false, model: 0 }), f = conv.replay({ forget: true, model: 0 });
  eq([h.totals.input, h.totals.output], [2405, 350]);
  eq([f.totals.input, f.totals.output], [1670, 185]);
  near(h.totals.cost, 0.01662, 1e-12, "with history");
  near(f.totals.cost, 0.01038, 1e-12, "without history");
  near(conv.replay({ forget: false, model: 2 }).totals.cost, 0.0004155, 1e-12, "Haiku 5.5");
});
test("conversation toy: small costs keep four significant digits, so a Haiku request does not round to $0.0001", () => {
  eq(conv.usd(0.0000535), "$0.0000535");
  eq(conv.usd(0.0004155), "$0.0004155");
  eq(conv.usd(0.01662), "$0.01662");
  eq(conv.usd(1.5), "$1.50");
});
test("conversation toy: with history, each request adds exactly the previous answer and the new question", () => {
  [2, 3, 4].forEach((turn) => {
    const prev = runConv({ turn: turn - 1 }), cur = runConv({ turn });
    eq(cur.messages.length, prev.messages.length + 2, "message count at turn " + turn);
    eq(cur.inputTokens - prev.inputTokens, prev.answer.tokens + cur.messages[cur.messages.length - 1].tokens, "growth at turn " + turn);
  });
});
test("lesson 2.1 is ready, covers t2-roles, links ticket T-010 and uses the conversation replay", () => {
  const entry = A.curriculum.find((t) => t.id === "t2").lessons.find((l) => l.id === "2.1");
  eq(entry.status, "ready");
  const l = A.lessons["2.1"];
  eq([l.topic, l.covers, l.tickets], ["t2", ["t2-roles"], ["T-010"]]);
  const ix = l.levels.flatMap((lv) => lv.blocks).filter((b) => b.type === "interactive").map((b) => b.id);
  eq(ix, ["l2-1-conversation"]);
  eq([l.debugging.length, l.recall.length, l.interview.length, l.misconceptions.length, l.resources.length], [3, 7, 5, 7, 5]);
});
test("lesson 2.1 cites the Messages API pages for the stateless rule, prefill and the combined turns", () => {
  const all = JSON.stringify(A.lessons["2.1"]);
  ["platform.claude.com/docs/en/build-with-claude/working-with-messages", "platform.claude.com/docs/en/api/messages/create"]
    .forEach((s) => { if (!all.includes(s)) throw new Error("missing source " + s); });
  ["stateless", "400", "combined"].forEach((s) => { if (!all.includes(s)) throw new Error("missing " + s); });
});
test("lesson 2.1 numbers: the T-010 Markdown contains the chat command, the reuse of trim_history and the turn numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-010.md"), "utf8");
  ["# T-010: ", "python -m assistant.chat", "chat.py", "trim_history", "count_input_tokens", "430", "760",
    "test_each_call_sends_the_full_history", "test_history_starts_with_user_and_alternates", "test_last_message_is_never_assistant"]
    .forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
  eq([A.tickets["T-010"].lesson, A.tickets["T-010"].phase], ["2.1", 1]);
});

/* Lesson 2.2: the request builder interactive, the lesson numbers and ticket T-011 */
const rb = (A.ix || {})["l2-2-request"];
const build = (o) => rb.compute(o || {});
const roles = (r) => r.body.messages.map((m) => m.role);
const codes = (r) => r.flags.map((f) => f.code);
test("request builder: the interactive is registered and uses the price table of app.js", () => {
  if (typeof rb !== "function" || rb.mount !== rb) throw new Error("l2-2-request is not a mount function");
  eq(build().model, L.MODELS[2], "default model is Haiku 5.5");
  eq(build({ model: 0 }).model, L.MODELS[0]);
});
test("request builder: the default request has the instructions in system, 3 example pairs, and the message as the last user turn", () => {
  const r = build();
  eq(r.status, "ok");
  eq(roles(r), ["user", "assistant", "user", "assistant", "user", "assistant", "user"]);
  if (typeof r.body.system !== "string" || !r.body.system.includes("<instructions>")) throw new Error("system has no tagged instructions");
  eq([r.tokens.input, r.tokens.stablePrefix], [280, 245]);
});
test("request builder: instructions in a user turn before example turns give two user turns in a row, and no system field", () => {
  const r = build({ instr: "user" });
  eq(roles(r).slice(0, 3), ["user", "user", "assistant"]);
  eq(r.status, "warn");
  if (!codes(r).includes("consecutive")) throw new Error("no consecutive-turn flag");
  if ("system" in r.body) throw new Error("body has a system field with nothing in it");
});
test("request builder: a last assistant turn (prefill) is flagged as error 400", () => {
  const r = build({ prefill: true });
  eq(roles(r).slice(-1), ["assistant"]);
  eq(r.status, "error");
  const f = r.flags.find((x) => x.code === "prefill");
  if (!f || f.level !== "error" || !f.text.includes("400")) throw new Error("no error flag that names 400");
});
test("request builder: a date at the start of the system prompt makes the stable prefix 0 tokens", () => {
  const r = build({ date: true });
  eq([r.tokens.input, r.tokens.stablePrefix], [290, 0]);
  if (!codes(r).includes("date")) throw new Error("no date flag");
});
test("request builder: examples in the system prompt are wrapped in example tags, and untagged examples are flagged", () => {
  const t = build({ exPlace: "system" });
  eq((t.body.system.match(/<example>/g) || []).length, 3);
  if (!t.body.system.includes("<examples>")) throw new Error("no <examples> wrapper");
  eq(roles(t), ["user"]);
  eq(t.tokens.input, 285);
  const u = build({ exPlace: "system", tags: false });
  if (u.body.system.includes("<example>")) throw new Error("tags off still has tags");
  if (!codes(u).includes("untagged")) throw new Error("no untagged flag");
  eq(u.tokens.input, 270);
});
test("request builder: a new employee message changes only the last turn, so the request prefix stays the same", () => {
  const a = build({ msg: 0 }), b = build({ msg: 1 });
  eq(a.body.system, b.body.system, "system");
  eq(a.body.messages.slice(0, -1), b.body.messages.slice(0, -1), "earlier turns");
  if (JSON.stringify(a.body.messages.slice(-1)) === JSON.stringify(b.body.messages.slice(-1))) throw new Error("the last turn did not change");
});
test("request builder: zero examples cost $0.021 and three examples $0.033 per 1,000 calls on Haiku 5.5 ($0.84 and $1.32 on Opus 5.5)", () => {
  near(build({ examples: 0 }).cost.total * 1000, 0.021, 1e-9, "Haiku 0");
  near(build({ examples: 3 }).cost.total * 1000, 0.033, 1e-9, "Haiku 3");
  near(build({ examples: 0, model: 0 }).cost.total * 1000, 0.84, 1e-9, "Opus 0");
  near(build({ examples: 3, model: 0 }).cost.total * 1000, 1.32, 1e-9, "Opus 3");
  if (!codes(build({ examples: 1 })).includes("few")) throw new Error("one example is not flagged as fewer than 3");
});
test("request builder: for every setting, the token sum matches the parts, the prefix is not larger than the input, and only a prefill gives an error", () => {
  let n = 0;
  ["system", "user"].forEach((instr) => [0, 1, 3].forEach((examples) => ["system", "turns"].forEach((exPlace) =>
    [true, false].forEach((tags) => [true, false].forEach((date) => [true, false].forEach((prefill) => [0, 1, 2].forEach((msg) => {
      const r = build({ instr, examples, exPlace, tags, date, prefill, msg });
      n++;
      eq(r.parts.reduce((s, p) => s + p.tokens, 0), r.tokens.input, "token sum");
      if (r.tokens.stablePrefix > r.tokens.input) throw new Error("prefix larger than input");
      eq(r.status === "error", prefill, "error only with prefill");
      eq(roles(r)[0], "user", "first message");
      eq(roles(r).slice(-1)[0], prefill ? "assistant" : "user", "last message");
      if (!r.parts.find((p) => p.key === "message").changes) throw new Error("message not marked as changing");
    })))))));
  eq(n, 288);
});
test("lesson 2.2 is ready, covers t2-system, shows the request builder and links ticket T-011", () => {
  const c = A.curriculum.find((t) => t.id === "t2").lessons.find((l) => l.id === "2.2");
  eq([c.status, c.covers], ["ready", ["t2-system"]]);
  const les = A.lessons["2.2"];
  eq(les.tickets, ["T-011"]);
  const ix = les.levels.flatMap((lv) => lv.blocks).filter((b) => b.type === "interactive").map((b) => b.id);
  eq(ix, ["l2-2-request"]);
});
test("ticket T-011 is phase 1, builds on T-010 and T-001, and needs no later ticket", () => {
  const t = A.tickets["T-011"];
  eq([t.lesson, t.phase], ["2.2", 1]);
  const all = Object.values(t.fields).join(" ");
  ["T-010", "T-001"].forEach((s) => { if (!all.includes(s)) throw new Error("does not name " + s); });
  ["T-012", "T-013", "T-014", "T-015", "T-016"].forEach((s) => { if (all.includes(s)) throw new Error("names a later ticket " + s); });
});
test("lesson 2.2 numbers: the T-011 sample format lines parse as JSON with an allowed category and priority", () => {
  const m = A.tickets["T-011"].fields.files.match(/helpdesk\.jsonl<\/code>, with three example lines[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("sample block not found in the files field");
  const rows = m[1].trim().split("\n").map((s) => JSON.parse(s));
  eq(rows.length, 3);
  rows.forEach((x) => {
    if (!["IT", "HR", "facilities", "finance", "other"].includes(x.category)) throw new Error("bad category " + x.category);
    if (!["low", "medium", "high"].includes(x.priority)) throw new Error("bad priority " + x.priority);
  });
});
test("lesson 2.2 numbers: the eval run of 60 calls costs about $0.02 at the Haiku 5.5 prices", () => {
  near(60 * (400 * L.MODELS[2].in + 500 * L.MODELS[2].out) / 1e6, 0.0174, 1e-9);
});
test("ticket T-011 converts to Markdown with the title, sections 2 to 12 and no HTML outside code", () => {
  const md = A.md.ticket(A.tickets["T-011"]);
  if (!md.startsWith("# T-011: ")) throw new Error("bad title line");
  for (let i = 2; i <= 12; i++) if (!new RegExp("^## " + i + "\\. ", "m").test(md)) throw new Error("section " + i + " missing");
  if (/(^|[^\\])<[a-z]+[ >]/im.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
});
test("lesson 2.2 numbers: the T-011 Markdown contains the files, the tests and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-011.md"), "utf8");
  ["assistant/triage.py", "helpdesk.jsonl", "triage_examples.jsonl", "scripts/triage_eval.py", "test_examples_alternate_user_and_assistant_turns",
    "test_request_never_ends_with_an_assistant_turn", "0.65", "category: <one of"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
});
test("lesson 2.2 files never address a person by a title", () => {
  ["11-system-few-shot.js", "11-ix.js"].forEach((f) => {
    const s = fs.readFileSync(path.join(base, "content", "lessons", f), "utf8");
    if (/captain/i.test(s)) throw new Error(f + " contains a direct address");
  });
});

/* Lesson 2.3: the "reason, then answer" interactive, the answer extraction and the lesson numbers */
const cot = (A.ix || {})["l2-3-cot"];
const runCot = (o) => cot.compute(Object.assign({ reason: false, shape: "ok", perDay: 2000 }, o));
test("reason toy: the interactive uses the Haiku 5.5 row of the app.js price table", () => {
  eq(runCot({}).model, L.MODELS[2]);
  eq(cot.MODEL_ID, "claude-haiku-5-5");
});
test("reason toy: direct mode costs $0.000142 and reason mode $0.000199 per message, 1.40 times more", () => {
  const d = runCot({ reason: false }), r = runCot({ reason: true });
  eq([d.inputTokens, d.outputTokens, r.inputTokens, r.outputTokens], [1180, 48, 1240, 150]);
  near(d.cost.total, 0.000142, 1e-12, "direct");
  near(r.cost.total, 0.000199, 1e-12, "reason");
  near(d.cost.total, L.cost(L.MODELS[2], 1180, 48).total, 1e-15, "same as the lesson 1.1 cost function");
  eq(Math.round(r.cost.total / d.cost.total * 100) / 100, 1.4);
});
test("reason toy: at 2,000 messages a day, direct costs $0.284 and reason $0.398", () => {
  near(runCot({ reason: false }).daily, 0.284, 1e-9, "direct");
  near(runCot({ reason: true }).daily, 0.398, 1e-9, "reason");
  near(runCot({ reason: true, perDay: 20000 }).daily, 3.98, 1e-9, "reason at 20,000");
});
test("reason toy: a response that the code rejects is still billed at the full cost", () => {
  ["none", "two"].forEach((shape) => [false, true].forEach((reason) => {
    const x = runCot({ reason, shape });
    eq(x.view.ok, false, shape + " gives an error");
    near(x.cost.total, runCot({ reason }).cost.total, 1e-15, shape + " cost");
  }));
});
test("answer extraction: the employee sees only the text inside one pair of answer tags", () => {
  eq(cot.extractAnswer("<reasoning>step 1</reasoning>\n<answer>\n category: IT \n</answer>"), { ok: true, text: "category: IT" });
  eq(cot.extractAnswer("Note first.\n<answer>a\nb</answer>\nmore text").text, "a\nb");
});
test("answer extraction: no answer tags, two answer sections or an empty answer section is an error", () => {
  eq(cot.extractAnswer("category: IT").ok, false, "no tags");
  eq(cot.extractAnswer("<answer>IT</answer><answer>HR</answer>").ok, false, "two sections");
  eq(cot.extractAnswer("<answer>  \n </answer>").ok, false, "empty");
  eq(cot.extractAnswer("<answer>IT").ok, false, "no closing tag");
  if (!/found 2/.test(cot.extractAnswer("<answer>IT</answer><answer>HR</answer>").error)) throw new Error("the error must name the count");
});
test("reason toy: the reasoning text never reaches the employee, in every mode and response shape", () => {
  cot.SHAPES.forEach((shape) => [false, true].forEach((reason) => {
    const x = runCot({ reason, shape });
    const shown = x.view.ok ? x.view.text : "";
    if (/<reasoning>|<\/reasoning>|access groups belong/i.test(shown)) throw new Error("reasoning shown: " + shape + " " + reason);
    if (x.view.ok && /<answer>/.test(shown)) throw new Error("tag shown");
  }));
});
test("reason toy: the direct answer routes the hard message wrong and the reasoned answer routes it right", () => {
  const d = runCot({ reason: false }), r = runCot({ reason: true });
  eq([d.view.ok, d.correct, r.view.ok, r.correct], [true, false, true, true]);
  if (!/category: IT/.test(r.view.text) || !/priority: high/.test(r.view.text)) throw new Error("reasoned answer");
});
test("lesson 2.3 numbers: on 20 sample messages, the cost per correct answer is $0.0001775 direct and $0.000221 with reasoning, and the break-even cost of a wrong route is $0.00057", () => {
  const d = 20 * L.cost(L.MODELS[2], 1180, 48).total, r = 20 * L.cost(L.MODELS[2], 1240, 150).total;
  near(d, 0.00284, 1e-12, "direct set");
  near(r, 0.00398, 1e-12, "reason set");
  near(d / 16, 0.0001775, 1e-12, "direct per correct");
  near(r / 18, 0.000221, 1e-6, "reason per correct");
  near((r - d) / (18 - 16), 0.00057, 1e-12, "extra cost per extra correct answer");
});
test("lesson 2.3 numbers: the T-012 Markdown contains the module, the tests and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-012.md"), "utf8");
  ["--mode reason", "reasoning.py", "extract_answer", "parse_triage", "answer_tags", "scripts/triage_eval.py", "AnswerFormatError", "test_missing_answer_tags_is_an_error",
    "test_reasoning_never_reaches_the_employee", "0.000142", "0.000199", "claude-haiku-5-5", "Project phase: 1",
    "<answer>", "reasoning_extraction"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
  if (/captain/i.test(md)) throw new Error("the ticket addresses a person");
});
test("lesson 2.3 is ready, covers t2-system and links ticket T-012", () => {
  const l = A.lessons["2.3"];
  eq([l.topic, l.covers, l.tickets, A.tickets["T-012"].lesson, A.tickets["T-012"].phase], ["t2", ["t2-system"], ["T-012"], "2.3", 1]);
  const ids = JSON.stringify(l);
  if (!ids.includes('"l2-3-cot"')) throw new Error("the lesson does not place the interactive");
});

/* Lesson 2.4: the validator and retry interactive, the lesson numbers and ticket T-013 */
const vr = (A.ix || {})["l2-4-validate"];
const runRetry = (o) => vr.run(Object.assign({ text: vr.OUTPUTS[2].text, stop: "end_turn", behavior: 0, maxRetries: 2, model: 2 }, o));
const firstError = (t) => { const v = vr.validate(t); return v.ok ? "valid" : v.errors[0].type; };
test("validator toy: each sample reply gives the error type of Pydantic 2 strict mode", () => {
  eq(vr.OUTPUTS.map((o) => [o.id, firstError(o.text)]),
    [["valid", "valid"], ["prose", "json_invalid"], ["missing", "missing"], ["type", "bool_type"], ["enum", "literal_error"], ["cut", "json_invalid"]]);
  eq(vr.validate(vr.OUTPUTS[2].text).errors[0], { type: "missing", loc: ["needs_human"], msg: "Field required" });
});
test("validator toy: strict mode rejects a string for a boolean, a label in the wrong case and extra keys", () => {
  ["\"true\"", "\"yes\"", "1"].forEach((x) => eq(firstError(vr.VALID.replace("false}", x + "}")), "bool_type", x));
  eq(firstError(vr.VALID.replace("\"IT\"", "\"it\"")), "literal_error");
  eq(firstError(vr.VALID.replace("\"medium\"", "2")), "literal_error");
  eq(firstError(vr.VALID.replace("}", ", \"confidence\": 0.9}")), "extra_forbidden");
  eq(firstError(vr.VALID.replace("Laptop does not start after the update.", "")), "string_too_short");
});
test("ticket T-013: the schema values are the category and priority labels of ticket T-011", () => {
  const t11 = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-011.md"), "utf8");
  const cat = t11.match(/^category: <one of (.+)>$/m), pri = t11.match(/^priority: <one of (.+)>$/m);
  if (!cat || !pri) throw new Error("format lines not found in T-011.md");
  const vals = (m) => m[1].split(/, /).map((x) => "'" + x + "'");
  const lit = (f) => vr.validate(vr.VALID.replace(f === "category" ? "\"IT\"" : "\"medium\"", "\"x\"")).errors[0].msg;
  eq(lit("category"), "Input should be " + vals(cat).slice(0, -1).join(", ") + " or " + vals(cat).slice(-1)[0]);
  eq(lit("priority"), "Input should be " + vals(pri).slice(0, -1).join(", ") + " or " + vals(pri).slice(-1)[0]);
  const t13 = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-013.md"), "utf8");
  ["Literal[\"" + cat[1].split(", ").join("\", \"") + "\"]", "Literal[\"" + pri[1].split(", ").join("\", \"") + "\"]",
   "scripts/triage_eval.py --modes json", "--mode json", "check_answer", "LABEL_FORMAT", "RULES"].forEach((x) => { if (!t13.includes(x)) throw new Error("T-013 misses: " + x); });
  if (/run_samples/.test(t13)) throw new Error("T-013 names a script that T-011 does not have");
});
test("validator toy: the retry message names each field and uses \"reply\" for invalid JSON", () => {
  eq(vr.retryMessage(vr.validate(vr.OUTPUTS[2].text).errors),
    "Your last reply did not match the schema.\n- needs_human: Field required\nReply again with only the JSON object. Do not add text before or after it.");
  if (!/^- reply: Invalid JSON: expected value at line 1 column 1$/m.test(vr.retryMessage(vr.validate(vr.OUTPUTS[1].text).errors))) throw new Error("no reply line");
});
test("retry toy: the interactive uses the price table of app.js", () => {
  eq(runRetry({}).model, L.MODELS[2]);
  eq(runRetry({ model: 0 }).model, L.MODELS[0]);
});
test("retry toy: success on the first retry makes 2 calls and costs $0.000221 on Haiku 5.5 (2.10 times one call)", () => {
  const r = runRetry({});
  eq([r.status, r.calls, r.retries, r.inputTokens], ["valid", 2, 1, 1710]);
  eq(r.attempts.map((a) => a.inputTokens), [800, 910]);
  near(r.oneCall, 0.000105, 1e-12, "one call");
  near(r.cost, 0.000221, 1e-12, "total (ticket T-013 criterion 6)");
  eq(Math.round(r.ratio * 100) / 100, 2.1);
});
test("retry toy: the loop stops after the last retry (3 calls, $0.000348 on Haiku 5.5, $0.01392 on Opus 5.5)", () => {
  const r = runRetry({ behavior: 2 });
  eq([r.status, r.calls, r.retries], ["failed", 3, 2]);
  eq(r.attempts.map((a) => a.inputTokens), [800, 910, 1020]);
  near(r.cost, 0.000348, 1e-12, "Haiku");
  near(runRetry({ behavior: 2, model: 0 }).cost, 0.01392, 1e-12, "Opus");
  eq(runRetry({ behavior: 2, maxRetries: 0 }).calls, 1, "limit 0");
  eq(runRetry({ behavior: 2, maxRetries: 3 }).calls, 4, "limit 3");
});
test("retry toy: a reply cut off at max_tokens is not retried", () => {
  const r = runRetry({ text: vr.OUTPUTS[5].text, stop: "max_tokens", behavior: 2 });
  eq([r.status, r.calls, r.retries], ["cut_off", 1, 0]);
});
test("retry toy: each retry has more input tokens than the call before it, for every model and limit", () => {
  [0, 1, 2].forEach((m) => [0, 1, 2, 3].forEach((mx) => {
    const a = runRetry({ behavior: 2, model: m, maxRetries: mx }).attempts;
    for (let i = 1; i < a.length; i++) if (!(a[i].inputTokens > a[i - 1].inputTokens && a[i].cost > a[i - 1].cost)) throw new Error("model " + m + " limit " + mx + " call " + (i + 1));
  }));
});
test("lesson 2.4 numbers: the made-up month costs $11.207, or $11.08 with a retry limit of 1, compared to $10.50", () => {
  const one = runRetry({ text: vr.VALID }).cost, two = runRetry({}).cost, three = runRetry({ behavior: 2 }).cost;
  near(100000 * one, 10.5, 1e-9, "no retries");
  near(95000 * one + 4000 * two + 1000 * three, 11.207, 1e-9, "limit 2");
  near(95000 * one + 4000 * two + 1000 * two, 11.08, 1e-9, "limit 1");
  near(60 * L.cost(L.MODELS[2], 1500, 100).total, 0.012, 1e-12, "T-013 milestone 4 cap");
});
test("ticket T-013: the fixture replies parse as JSON and give their expected error types", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-013.md"), "utf8");
  const m = md.match(/\n(\[\n  \{"id": "valid"[\s\S]*?\n\])\n/);
  if (!m) throw new Error("fixture JSON not found in T-013.md");
  const fx = JSON.parse(m[1]);
  eq(fx.length, 9);
  fx.forEach((c) => eq(firstError(c.reply), c.expect, c.id));
  ["retries=1 valid=yes", "test_max_tokens_stop_is_not_retried", "pydantic>=2,<3"].forEach((s) => { if (!md.includes(s)) throw new Error("missing: " + s); });
});

/* Lesson 2.5: the schema to tool interactive and the lesson numbers */
const sch = (A.ix || {})["l2-5-schema"];
const runSchema = (o) => sch.compute(Object.assign({}, o));
const schemaObjects = (s) => [s].concat(Object.values(s.$defs || {})).filter((o) => o.type === "object");
test("schema toy: the interactive uses the price table of app.js", () => {
  eq(runSchema({}).model, L.MODELS[0]);
  eq(runSchema({ model: 2 }).model, L.MODELS[2]);
});
test("schema toy: the default tool is strict, has a valid name and forbids extra fields", () => {
  const r = runSchema({});
  eq(r.tool.strict, true);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(r.tool.name)) throw new Error("tool name does not match the regex: " + r.tool.name);
  schemaObjects(r.tool.input_schema).forEach((o) => eq(o.additionalProperties, false, "additionalProperties"));
  eq(r.problems, []);
});
test("schema toy: the schema required list and enums come from the field list (one source)", () => {
  const r = runSchema({});
  eq(r.schema.required, sch.TRIAGE_FIELDS.filter((f) => f.required).map((f) => f.name));
  eq(r.schema.properties.category.enum, ["IT", "HR", "facilities", "finance", "other"]);
  eq(r.tool.input_schema, r.schema);
});
test("schema toy: the tool request uses tool_choice auto and the system prompt names the tool", () => {
  const req = runSchema({}).request;
  eq(req.tool_choice, { type: "auto" });
  eq(req.tools.length, 1);
  if (!req.system.includes("record_triage")) throw new Error("the system prompt does not name the tool");
  eq("output_config" in req, false);
});
test("schema toy: the structured outputs request has output_config.format and no tools", () => {
  const r = runSchema({ method: "output" });
  eq(r.request.output_config.format.type, "json_schema");
  eq(r.request.output_config.format.schema, r.schema);
  eq(["tools" in r.request, "tool_choice" in r.request], [false, false]);
  eq([r.status.http, r.status.systemTokens], [200, null]);
});
test("schema toy: a forced tool gives error 400 on Opus 5.5 and Sonnet 5.5, and 406 system tokens on Haiku 5.5", () => {
  eq(runSchema({ forced: true, model: 0 }).status.http, 400);
  eq(runSchema({ forced: true, model: 1 }).status.http, 400);
  eq(runSchema({ forced: true, model: 0 }).response, null);
  const h = runSchema({ forced: true, model: 2 });
  eq([h.status.http, h.status.systemTokens, h.request.tool_choice], [200, 406, { type: "tool", name: "record_triage" }]);
  eq(h.response.content.map((b) => b.type), ["tool_use"]);
});
test("schema toy: tool_choice auto adds 286 system tokens on every model ($1.144 per 1,000 requests on Opus 5.5)", () => {
  [0, 1, 2].forEach((m) => eq(runSchema({ model: m }).status.systemTokens, 286, "model " + m));
  near(runSchema({ model: 0 }).systemCostPer1000, 1.144, 1e-9, "Opus 5.5");
  near(runSchema({ model: 2 }).systemCostPer1000, 0.0286, 1e-9, "Haiku 5.5");
});
test("schema toy: with auto, a text block comes before the tool_use block, so code must find the block by type", () => {
  const c = runSchema({}).response.content;
  eq(c.map((b) => b.type), ["text", "tool_use"]);
  eq(c.find((b) => b.type === "tool_use").name, "record_triage");
});
test("schema toy: the enforced sample is valid, and the prompt-only sample has a missing field, a wrong enum case and a string boolean", () => {
  eq(runSchema({}).errors, []);
  const p = runSchema({ sample: "prompt" });
  eq(p.errors.map((e) => e.field).sort(), ["category", "needs_human", "summary"]);
  eq([p.input.category, p.input.needs_human, "summary" in p.input], ["it", "no", false]);
});
test("schema toy: an added integer field is sent as a string in the prompt-only sample and is caught", () => {
  const fields = sch.TRIAGE_FIELDS.concat([{ name: "minutes", type: "integer", values: [], required: true }]);
  const p = runSchema({ fields, sample: "prompt" });
  eq(typeof p.input.minutes, "string");
  if (!p.errors.some((e) => e.field === "minutes")) throw new Error("the string integer is not caught");
  eq(runSchema({ fields }).errors, []);
});
test("schema toy: a tool name with a space breaks the name rule, gives error 400 and costs no tool tokens", () => {
  const r = runSchema({ toolName: "record triage" });
  if (!r.problems.length) throw new Error("no problem reported");
  eq([r.status.http, r.status.systemTokens, r.systemCostPer1000, r.response], [400, null, 0, null]);
});
test("schema toy: validate rejects a field that is not in the schema", () => {
  const r = runSchema({});
  eq(sch.validate(r.schema, Object.assign({ extra: 1 }, r.input)), [{ field: "extra", error: "field is not in the schema" }]);
});
test("lesson 2.5 numbers: the enforced request costs $0.005744 and the prompt-only request $0.0046 on Opus 5.5", () => {
  near(L.cost(L.MODELS[0], 700, 90).total, 0.0046, 1e-12, "prompt-only");
  near(L.cost(L.MODELS[0], 700 + 286, 90).total, 0.005744, 1e-12, "enforced (ticket T-014 criterion 7)");
  near((L.cost(L.MODELS[0], 986, 90).total - L.cost(L.MODELS[0], 700, 90).total) * 1000, 1.144, 1e-9, "per 1,000");
});
test("lesson 2.5 numbers: the break-even retry share is about 21%", () => {
  const retry = L.cost(L.MODELS[0], 900, 90).total;
  near(retry, 0.0054, 1e-12, "retry");
  const share = (L.cost(L.MODELS[0], 986, 90).total - L.cost(L.MODELS[0], 700, 90).total) / retry;
  eq(Math.round(share * 100), 21);
});
test("lesson 2.5 numbers: the Haiku 5.5 faded step gives about $0.029 per 1,000 requests", () => {
  near(L.cost(L.MODELS[2], 700, 90).total, 0.000115, 1e-12);
  near(L.cost(L.MODELS[2], 986, 90).total, 0.0001436, 1e-12);
  near((L.cost(L.MODELS[2], 986, 90).total - L.cost(L.MODELS[2], 700, 90).total) * 1000, 0.0286, 1e-9);
});
test("lesson 2.5 numbers: the milestone 4 cost estimate is about $0.007 for 40 calls and $0.021 for 120 calls", () => {
  near(40 * L.cost(L.MODELS[2], 1000, 150).total, 0.007, 1e-12);
  near(120 * L.cost(L.MODELS[2], 1000, 150).total, 0.021, 1e-12);
});
test("lesson 2.5 numbers: the T-014 Markdown contains the tests, the fixture and the acceptance numbers", () => {
  const md = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-014.md"), "utf8");
  ["schema_tool.py", "triage_eval.py --modes json,tool", "mode=tool answer=ok retries=0 valid=yes", "tool_result", "0.005744", "test_request_never_forces_the_tool", "test_every_object_in_the_schema_forbids_extra_fields", "additionalProperties"].forEach((s) => { if (!md.includes(s)) throw new Error("missing " + s); });
  const m = A.tickets["T-014"].fields.files.match(/as a small object:<\/p>\s*<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) throw new Error("fixture block not found in the files field");
  const block = JSON.parse(m[1]);
  eq([block.type, block.name], ["tool_use", "record_triage"]);
  eq(sch.validate(runSchema({}).schema, block.input), []);
});
test("lesson 2.5 content: the interactive and the T-014 example use the category and priority values of T-013", () => {
  const t13 = fs.readFileSync(path.join(base, "..", "project", "tickets", "T-013.md"), "utf8");
  const lit = (field) => JSON.parse("[" + t13.match(new RegExp("`" + field + "` \\(`Literal\\[([^\\]]+)\\]"))[1] + "]");
  const r = runSchema({});
  eq(r.schema.properties.category.enum, lit("category"));
  eq(r.schema.properties.priority.enum, lit("priority"));
  const m = A.tickets["T-014"].fields.files.match(/as a small object:<\/p>\s*<pre><code>([\s\S]*?)<\/code><\/pre>/);
  const input = JSON.parse(m[1]).input;
  if (!lit("priority").includes(input.priority)) throw new Error("T-014 example priority " + input.priority);
});
test("lesson 2.5 content: the T-014 requirements use tool_choice auto and forbid any and tool", () => {
  const req = A.tickets["T-014"].fields.requirements;
  if (!req.includes('tool_choice={"type": "auto"}')) throw new Error("the request rule does not name tool_choice auto");
  if (!/Never send <code>\{"type": "any"\}<\/code> or <code>\{"type": "tool"\}<\/code>/.test(req)) throw new Error("the rule does not forbid any and tool");
  eq(A.lessons["2.5"].tickets, ["T-014"]);
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
