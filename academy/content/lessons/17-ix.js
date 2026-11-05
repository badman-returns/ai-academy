/*
 * Interactive for lesson 3.1: "l3-1-pipeline".
 * It shows the five steps of the index path of a RAG pipeline on a small, fixed corpus:
 * load the Markdown files, parse the headings into sections, cut fixed-size chunks,
 * embed each chunk, and store the chunks with a manifest.
 * The learner selects a step and a chunk size (10, 20, 40 or 80 words). A probe question
 * shows which chunk the index returns first for each chunk size.
 *
 * The corpus is fictional ("Northwind Tools"). It is the fixture of ticket T-017
 * (docs/ in the project). The four FAQ facts of T-003 and T-008 are in it with the same words.
 * The embedder is the fake keyword embedder of T-017: it counts the words of six word lists
 * and normalizes the counts to length 1. It is a teaching toy and a test double, not a model.
 * A real model (T-017 uses BAAI/bge-small-en-v1.5 through fastembed) gives 384 dimensions.
 *
 * The content hashes are the first 12 hexadecimal characters of the SHA-256 of each file
 * (UTF-8, the text below plus one final newline). The page cannot compute SHA-256 at once
 * from file://, so the values are computed with Node and stored in HASHES. The Node self-test
 * computes them again and compares.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l3-1-pipeline"] is a function mount(el). It also has
 * a .mount property that points to the same function, and pure helpers that lesson 3.2 uses.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  /* The fixture corpus of T-017, in sorted path order (the order of the ingest).
     Each file ends with one newline in the project. */
  const CORPUS = [
    { path: "customer/delivery-times.md", text: [
      "# Delivery times", "",
      "## Standard delivery",
      "Standard delivery takes 3 to 5 working days.", "",
      "## Express delivery",
      "Express delivery takes 1 working day. Order before 14:00 for delivery on the next working day."].join("\n") },
    { path: "customer/refund-policy.md", text: [
      "# Refund policy", "",
      "## Return window",
      "You can return an unused tool within 45 days of delivery for a full refund. Keep the receipt. The refund goes back to the card that paid for the order.", "",
      "## Damaged items",
      "If a tool arrives damaged, send a photo within 7 days. We send a new tool at no cost."].join("\n") },
    { path: "customer/warranty-claims.md", text: [
      "# Warranty claims", "",
      "## Warranty length",
      "Power tools have a 2-year warranty. Hand tools have a lifetime warranty.", "",
      "## How to claim",
      "Send the claim form with a photo of the serial number. We reply within 5 working days."].join("\n") },
    { path: "hr/travel-expenses.md", text: [
      "# Travel expenses", "",
      "## Hotel limit",
      "The hotel limit is 150 euros for each night.", "",
      "## How to claim expenses",
      "Send the receipts in the expense tool within 30 days of the trip."].join("\n") },
    { path: "it/vpn-setup.md", text: [
      "# VPN setup", "",
      "## Install the app",
      "Install the NWConnect app and sign in with your company account.", "",
      "## Connection problems",
      "If the app does not connect, restart your laptop and try again. Then contact the IT helpdesk."].join("\n") }
  ];
  /* SHA-256 of (text + "\n"), first 12 hex characters. Computed with Node; the self-test checks them. */
  const HASHES = {
    "customer/refund-policy.md": "f99d434e4406",
    "customer/warranty-claims.md": "ebb7bc0aeef4",
    "customer/delivery-times.md": "5ce7ea20baf3",
    "it/vpn-setup.md": "18e41fc04c47",
    "hr/travel-expenses.md": "30388078eede"
  };
  /* The fake keyword embedder of T-017: one dimension for each word list. */
  const EMBEDDER = { model: "fake-keyword-v1", dim: 6 };
  const DIMS = ["returns", "warranty", "delivery", "it", "expenses", "hr"];
  const WORDS = {
    returns: ["return", "returns", "refund", "unused", "receipt", "card", "paid", "order"],
    warranty: ["warranty", "damaged", "serial", "power", "hand", "lifetime", "tool", "tools", "photo"],
    delivery: ["delivery", "express", "standard", "arrives", "day", "days", "working"],
    it: ["app", "nwconnect", "vpn", "laptop", "account", "connect", "helpdesk", "install", "restart"],
    expenses: ["hotel", "euros", "night", "expense", "expenses", "trip", "receipts", "travel"],
    hr: ["vacation", "employees", "employee", "salary", "holiday", "leave"]
  };
  const REAL = { model: "BAAI/bge-small-en-v1.5", dim: 384, maxTokens: 512 };
  const SIZES = [10, 20, 40, 80];
  const DEFAULT_SIZE = 20;
  const PROBE = "How many days do I have to return an unused tool?";
  const STEPS = [
    { id: "load", label: "Load" }, { id: "parse", label: "Parse" }, { id: "chunk", label: "Chunk" },
    { id: "embed", label: "Embed" }, { id: "store", label: "Store" }
  ];

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const docId = (path) => path.replace(/^.*\//, "").replace(/\.md$/, "");
  const words = (s) => s.trim().split(/\s+/).filter(Boolean);
  /* The embedder tokens: lowercase runs of letters and digits. Python: re.findall(r"[a-z0-9]+", text.lower()). */
  const tokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  /* Parse one Markdown file: the "# " line is the title, each "## " line starts a section.
     Text before the first "## " goes into the section "intro". Pure. */
  function parse(file) {
    const id = docId(file.path);
    let title = id, cur = null;
    const sections = [];
    const used = {};
    const open = (heading) => {
      let s = slug(heading) || "section";
      used[s] = (used[s] || 0) + 1;
      if (used[s] > 1) s += "-" + used[s];
      cur = { id: id + "#" + s, heading, words: [] };
      sections.push(cur);
    };
    file.text.split("\n").forEach((line) => {
      if (line.startsWith("# ")) title = line.slice(2).trim();
      else if (line.startsWith("## ")) open(line.slice(3).trim());
      else if (line.trim()) {
        if (!cur) open("intro");
        cur.words.push(...words(line));
      }
    });
    return { id, path: file.path, title, sections, words: sections.reduce((n, s) => n + s.words.length, 0) };
  }

  /* Fixed-size chunks of one document: windows of `size` words, no overlap.
     A chunk keeps every section that its words come from. Pure. */
  function chunkDoc(doc, size) {
    const all = [];
    doc.sections.forEach((s) => s.words.forEach((w) => all.push({ w, s: s.id })));
    const out = [];
    for (let i = 0, n = 0; i < all.length; i += size, n++) {
      const part = all.slice(i, i + size);
      const secs = [];
      part.forEach((p) => { if (!secs.includes(p.s)) secs.push(p.s); });
      out.push({ id: doc.id + ":" + n, doc: doc.path, title: doc.title, sections: secs,
        text: part.map((p) => p.w).join(" "), words: part.length });
    }
    return out;
  }

  function counts(text) {
    const v = DIMS.map(() => 0);
    tokens(text).forEach((t) => DIMS.forEach((d, i) => { if (WORDS[d].includes(t)) v[i] += 1; }));
    return v;
  }
  /* The fake embedder: word-list counts, normalized to length 1. A text with no listed word
     has no direction, so the fake raises an error, as normalize of T-003 does. Pure. */
  function embed(text) {
    const c = counts(text);
    const n = Math.sqrt(c.reduce((s, x) => s + x * x, 0));
    if (!n) throw new Error("zero vector: the text has no word from the word lists");
    return c.map((x) => x / n);
  }
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

  /* The whole index path for one chunk size. Pure: the self-test and lesson 3.2 call it. */
  function buildIndex(size) {
    const sz = SIZES.includes(size) ? size : DEFAULT_SIZE;
    const docs = CORPUS.map(parse);
    const chunks = docs.flatMap((d) => chunkDoc(d, sz)).map((c) => Object.assign(c, { counts: counts(c.text), vector: embed(c.text) }));
    const manifest = {
      embedder: { model: EMBEDDER.model, dim: EMBEDDER.dim },
      chunker: { kind: "fixed-words", chunk_words: sz },
      documents: {},
      chunks: chunks.length
    };
    docs.forEach((d) => { manifest.documents[d.path] = { sha256: HASHES[d.path], chunks: chunks.filter((c) => c.doc === d.path).length }; });
    const sections = docs.reduce((n, d) => n + d.sections.length, 0);
    const totalWords = docs.reduce((n, d) => n + d.words, 0);
    return {
      size: sz, docs, chunks, manifest, sections, words: totalWords,
      crossing: chunks.filter((c) => c.sections.length > 1).map((c) => c.id),
      longest: Math.max.apply(null, chunks.map((c) => c.words)),
      line: `ingest docs=${docs.length} sections=${sections} chunks=${chunks.length} words=${totalWords} chunk_words=${sz} embedder=${EMBEDDER.model} dim=${EMBEDDER.dim} cost_usd=0`
    };
  }

  /* Exact search: cosine of unit vectors is the dot product. Equal scores keep the index order (T-003). */
  function search(index, question, k) {
    const q = embed(question);
    return index.chunks.map((c, i) => ({ chunk: c, score: dot(q, c.vector), i }))
      .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, k || index.chunks.length);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const vec = (v) => "[" + v.map((x) => x.toFixed(3)).join(", ") + "]";
  const short = (sec) => sec.replace(/^.*#/, "#");

  function mount(el) {
    let step = "load", size = DEFAULT_SIZE;

    function stepHtml(ix) {
      if (step === "load") {
        return `<p>The loader reads every <code>.md</code> file under <code>docs/</code>. It keeps the path, because the citation of lesson 3.2 names it.</p>
          <div class="table-wrap"><table><tr><th>File</th><th>Words</th><th>SHA-256 (first 12)</th></tr>
          ${ix.docs.map((d) => `<tr><td><code>${esc(d.path)}</code></td><td>${d.words}</td><td><code>${esc(HASHES[d.path])}</code></td></tr>`).join("")}
          </table></div>
          <p class="muted">${ix.docs.length} files, ${ix.words} words. The hash changes when one byte of the file changes, so a later run can see which files changed.</p>`;
      }
      if (step === "parse") {
        return `<p>The parser reads the headings. The <code>#</code> line is the title. Each <code>##</code> line starts a section. The section id is the document id, <code>#</code>, and the heading in lowercase with hyphens.</p>
          <div class="table-wrap"><table><tr><th>Section id</th><th>Heading</th><th>Words</th></tr>
          ${ix.docs.flatMap((d) => d.sections).map((s) => `<tr><td><code style="white-space:normal;overflow-wrap:anywhere">${esc(s.id)}</code></td><td>${esc(s.heading)}</td><td>${s.words.length}</td></tr>`).join("")}
          </table></div>
          <p class="muted">${ix.sections} sections. Lesson 3.3 labels the questions with these section ids, not with chunk ids. A new chunk size changes the chunks but not the sections.</p>`;
      }
      if (step === "chunk") {
        return `<p>The chunker cuts the words of each document into windows of <b>${ix.size} words</b>, with no overlap. A chunk keeps every section that its words come from.</p>
          <div class="table-wrap"><table><tr><th>Chunk id</th><th>Sections</th><th>Words</th><th>Text</th></tr>
          ${ix.chunks.map((c) => `<tr><td><code>${esc(c.id)}</code></td><td>${c.sections.map((s) => `<code>${esc(short(s))}</code>`).join(" ")}${c.sections.length > 1 ? ' <span class="tag warn">2 sections</span>' : ""}</td><td>${c.words}</td><td>${esc(c.text)}</td></tr>`).join("")}
          </table></div>
          <p class="muted">${ix.chunks.length} chunks. ${ix.crossing.length} of them mix two sections. The longest chunk has ${ix.longest} words.</p>`;
      }
      if (step === "embed") {
        return `<p>The embedder turns each chunk text into a vector of length 1. Here it is the fake keyword embedder of the tests: one dimension for each word list (${DIMS.join(", ")}). The real model, <code>${REAL.model}</code>, gives ${REAL.dim} dimensions that it learned from data.</p>
          <div class="table-wrap"><table><tr><th>Chunk id</th><th>Word-list counts</th><th>Vector (length 1)</th></tr>
          ${ix.chunks.map((c) => `<tr><td><code>${esc(c.id)}</code></td><td><code>${c.counts.join(", ")}</code></td><td><code style="white-space:normal;overflow-wrap:anywhere">${vec(c.vector)}</code></td></tr>`).join("")}
          </table></div>
          <p class="muted">The same embedder must embed the questions in lesson 3.2. A vector of one model cannot be compared with a vector of another model.</p>`;
      }
      const first = ix.chunks[0];
      const jsonLine = JSON.stringify({ id: first.id, doc: first.doc, title: first.title, sections: first.sections, text: first.text,
        vector: first.vector.map((x) => +x.toFixed(6)) });
      return `<p>The store writes two files. <code>index/chunks.jsonl</code> has one line for each chunk. <code>index/manifest.json</code> says how the index was made.</p>
        <p class="ix-group">First line of index/chunks.jsonl</p>
        <pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${esc(jsonLine)}</code></pre>
        <p class="ix-group">index/manifest.json</p>
        <pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${esc(JSON.stringify(ix.manifest, null, 2))}</code></pre>
        <p class="ix-group">Measurement line</p>
        <pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${esc(ix.line)}</code></pre>
        <p class="muted">The manifest has no date, so two runs on the same files give the same bytes. A local model costs $0 for each call, so the cost is 0.</p>`;
    }

    function resultHtml() {
      const ix = buildIndex(size);
      const top = search(ix, PROBE, 3);
      const bars = top.map((x, i) => `<div class="bar-row${i === 0 ? " chosen" : ""}"><span class="lbl" title="${esc(x.chunk.id)}">${esc(x.chunk.id)}</span><span class="track"><i style="width:${(Math.max(0, x.score) * 100).toFixed(1)}%"></i></span><span class="val">${x.score.toFixed(3)}</span></div>`).join("");
      return `<div class="kv">
          <div class="ix-key">Chunks<b>${ix.chunks.length}</b></div>
          <div>Mix two sections<b>${ix.crossing.length}</b></div>
          <div>Longest chunk<b>${ix.longest} words</b></div>
          <div>Documents / sections<b>${ix.docs.length} / ${ix.sections}</b></div>
        </div>
        <p class="ix-group">Step: ${esc(STEPS.find((s) => s.id === step).label)}</p>
        ${stepHtml(ix)}
        <p class="ix-group">Probe: which chunk comes first?</p>
        <p>Question: "${esc(PROBE)}"</p>
        <div class="bars">${bars}</div>
        <p class="muted">First chunk: "${esc(top[0].chunk.text)}"</p>`;
    }

    function sync() {
      el.querySelectorAll('[data-ix-act="step"]').forEach((b) => {
        const on = b.dataset.v === step;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      el.querySelectorAll('[data-ix-act="size"]').forEach((b) => {
        const on = +b.dataset.v === size;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
    }
    function update() { sync(); el.querySelector(".ix-result").innerHTML = resultHtml(); }

    el.innerHTML = `<div class="ix-title">Build the index, one step at a time <span class="tag accent">real parse and chunks, fake embedder</span></div>
      <p class="ix-lead">Select a step of the index path. Then change the chunk size and watch the number of chunks, the chunks that mix two sections, and the first chunk for the probe question.</p>
      <div class="ix-controls">
        <p class="ix-group">Step</p>
        <div class="row" role="group" aria-label="Step">${STEPS.map((s, i) => `<button type="button" data-ix-act="step" data-v="${s.id}">${i + 1}. ${esc(s.label)}</button>`).join("")}</div>
        <p class="ix-group">Chunk size</p>
        <div class="row" role="group" aria-label="Chunk size">${SIZES.map((n) => `<button type="button" data-ix-act="size" data-v="${n}">${n} words</button>`).join("")}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select 10 words and read the first chunk of the refund policy: the answer "45 days" is in it, but "refund" is not. Select 40 words: the refund chunk now also holds the damaged-items rule.
      The parse, the chunks and the hashes are real computations on the fixture files of ticket T-017. The vectors come from the fake keyword embedder, not from a trained model.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a) || a.disabled) return;
      if (a.dataset.ixAct === "step") step = a.dataset.v;
      else if (a.dataset.ixAct === "size") size = +a.dataset.v;
      else return;
      update();
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l31Unbind === "function") el._l31Unbind();
    el.addEventListener("click", onClick);
    el._l31Unbind = () => el.removeEventListener("click", onClick);
    update();
  }
  mount.mount = mount;
  mount.parse = parse;
  mount.chunkDoc = chunkDoc;
  mount.counts = counts;
  mount.embed = embed;
  mount.tokens = tokens;
  mount.dot = dot;
  mount.buildIndex = buildIndex;
  mount.search = search;
  mount.CORPUS = CORPUS;
  mount.HASHES = HASHES;
  mount.EMBEDDER = EMBEDDER;
  mount.DIMS = DIMS;
  mount.WORDS = WORDS;
  mount.REAL = REAL;
  mount.SIZES = SIZES;
  mount.DEFAULT_SIZE = DEFAULT_SIZE;
  mount.PROBE = PROBE;
  window.ACADEMY.ix["l3-1-pipeline"] = mount;
})();
