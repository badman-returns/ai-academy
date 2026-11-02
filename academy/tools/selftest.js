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
  if (/<[a-z]+[ >]/i.test(md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""))) throw new Error("HTML tags left outside code");
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

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
