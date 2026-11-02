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
  if (/<[a-z]+[ >]/i.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
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
    if (/<[a-z]+[ >]/i.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
  });
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

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
