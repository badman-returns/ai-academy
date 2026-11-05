/*
 * Lesson 3.1 - The RAG pipeline: build the index.
 * Ticket T-017 - The document index: load, parse, chunk, embed and store.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * The script loads 17-ix.js (id "l3-1-pipeline") and calls its pure functions.
 * Toy corpus: the 5 fixture files of T-017 (docs/ in the project), 152 words in 10 sections.
 *   Words per file: delivery-times 24 (8 + 16), refund-policy 49 (30 + 19), warranty-claims 29 (12 + 17),
 *   travel-expenses 22 (9 + 13), vpn-setup 28 (11 + 17).
 *   SHA-256 of each file (text + one final newline), first 12 hex characters:
 *   delivery-times 5ce7ea20baf3, refund-policy f99d434e4406, warranty-claims ebb7bc0aeef4,
 *   travel-expenses 30388078eede, vpn-setup 18e41fc04c47.
 *   refund-policy with "45 days" changed to "30 days": 28945264e281.
 * Fixed chunks with no overlap:
 *   10 words: 17 chunks, 4 mix two sections, longest 10 words.
 *   20 words: 11 chunks, 5 mix two sections (delivery-times:0, refund-policy:1, warranty-claims:0,
 *     travel-expenses:0, vpn-setup:0), longest 20 words.
 *   40 words: 6 chunks, 5 mix two sections, longest 40. 80 words: 5 chunks, 5 mix, longest 49.
 * Fake keyword embedder "fake-keyword-v1", 6 dimensions (returns, warranty, delivery, it, expenses, hr):
 *   refund-policy:0 (20 words) counts 5,1,2,0,0,0 -> [0.913, 0.183, 0.365, 0, 0, 0] (norm sqrt(30)).
 *   Probe "How many days do I have to return an unused tool?" counts 2,1,1,0,0,0 -> [0.816, 0.408, 0.408, 0, 0, 0].
 *   Probe top 3 at 20 words: refund-policy:0 0.969 (13 / sqrt(180)), refund-policy:1 0.937 (10 / sqrt(114)),
 *   refund-policy:2 0.577. At 10 words: refund-policy:0 1.000. At 40: 0.995. At 80: 0.996.
 *   delivery-times:0 (20 words) counts 1,0,9 -> [0.110, 0, 0.994, 0, 0, 0].
 * Measurement line of the fake run at 20 words:
 *   ingest docs=5 sections=10 chunks=11 words=152 chunk_words=20 embedder=fake-keyword-v1 dim=6 cost_usd=0
 * Facts and their sources (all checked on 2026-11-05):
 *   - fastembed: install with "pip install fastembed"; it uses ONNX Runtime and needs no GPU;
 *     the default text model is BAAI/bge-small-en-v1.5; TextEmbedding(model_name=...) has embed,
 *     query_embed and passage_embed, which return an iterable of NumPy arrays; the model downloads
 *     on the first use. Sources: https://github.com/qdrant/fastembed (README) and the file
 *     fastembed/text/text_embedding.py in that repository.
 *   - BAAI/bge-small-en-v1.5: 384 dimensions, a maximum sequence length of 512 tokens, MIT license,
 *     and an optional query instruction "Represent this sentence for searching relevant passages:".
 *     Source: https://huggingface.co/BAAI/bge-small-en-v1.5 (model card).
 *   - "Anthropic does not offer its own embedding model." The page names Voyage AI as one provider.
 *     Source: https://platform.claude.com/docs/en/build-with-claude/embeddings.
 *   - Traditional RAG chunking can remove context: the example chunk "The company's revenue grew by 3%
 *     over the previous quarter." names no company and no period. Chunks are "usually no more than a few
 *     hundred tokens". Source: https://www.anthropic.com/news/contextual-retrieval.
 *   - The RAG paper (Lewis and 11 others, 2020): the parametric memory is a pre-trained seq2seq model,
 *     and the non-parametric memory is a dense vector index of Wikipedia. Source: arXiv 2005.11401 abstract.
 * Not checked, so not claimed: whether fastembed normalizes its output, where it caches the model,
 * the download size, and what it does with a text longer than 512 tokens.
 * The interactive for this lesson is in 17-ix.js (id "l3-1-pipeline").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["3.1"] = {
  id: "3.1",
  topic: "t3",
  title: "The RAG pipeline: build the index",
  objective: "Build the index path of a RAG system: load Markdown documents, parse their headings into sections, cut fixed-size chunks, embed each chunk through an Embedder interface, and store the chunks with a manifest that records the model, the dimension, the chunker and a content hash for each document.",
  prerequisites: [
    "Lesson 1.3: embeddings, cosine similarity and the T-003 functions normalize and top_k.",
    "Lesson 1.8: grounding, the corpus record of T-008 (id, title, text, vector) and the four citation statuses.",
    "Lesson 2.7 helps: the content hash with SHA-256 and the habit of a version for every input."
  ],
  covers: ["t3-pipeline"],
  whyItMatters: `
    <p>In lesson 1.8, the assistant answered from four short FAQ texts with toy vectors that you typed by hand. A real company has hundreds of documents, and each document is too long to be one vector. Somebody must turn the documents into vectors before the first question comes. That work is the <strong>index path</strong> of a RAG system.</p>
    <p>RAG means retrieval-augmented generation: the system retrieves text from your documents and gives it to the model with the question. The answer can only be as good as the retrieved text. Most bad RAG answers start in the index: a chunk lost its heading, a table broke in the middle, the documents changed and nobody rebuilt the index, or the index and the questions used two different embedding models.
    This lesson builds the index path in small, testable steps, with a record of how each index was made. In an interview, "walk me through your RAG pipeline" is a common question. A good answer starts with the index, not with the prompt.</p>`,
  concepts: [
    { id: "l3-1-c-halves", name: "RAG has two halves: the index path runs before any question, the query path runs for each question" },
    { id: "l3-1-c-parse", name: "Parse keeps the structure: the title and the sections of each document" },
    { id: "l3-1-c-chunk", name: "Fixed-size chunks: the size decides what one chunk can hold" },
    { id: "l3-1-c-embedder", name: "The Embedder interface: a fake for the tests, one local model for real runs" },
    { id: "l3-1-c-record", name: "The chunk record: id, document, title, sections, text and vector" },
    { id: "l3-1-c-manifest", name: "The manifest: the model, the dimension, the chunker and a content hash for each document" },
    { id: "l3-1-c-same-model", name: "The questions must use the same model as the index" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "A library that makes its catalog before the first reader comes",
      blocks: [
        { type: "html", html: `
          <p>A RAG system has two halves:</p>
          <ul>
            <li><strong>The index path</strong> runs before any question, and again when the documents change. It has five steps: <strong>load</strong> the files, <strong>parse</strong> them into a title and sections, <strong>chunk</strong> the text into small parts, <strong>embed</strong> each chunk into a vector, and <strong>store</strong> the chunks with their vectors.</li>
            <li><strong>The query path</strong> runs for each question. It embeds the question with the same model, finds the chunks with the highest scores and sends them to the model with the question. Lesson 3.2 builds it.</li>
          </ul>
          <p>Each stored chunk keeps four things: its text, the document and the sections that it comes from, and its vector. The index also keeps a <strong>manifest</strong>: a small file that says which model made the vectors, how long the vectors are, how the text was cut, and a fingerprint of each document.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a library catalog", html: `
          <p>A library does not read every book when a reader asks a question. It makes a catalog first.</p>
          <ul>
            <li><strong>Load and parse</strong> are the librarian who takes each new book and writes down its title and its chapters.</li>
            <li><strong>Chunk and embed</strong> are the index cards: one card for each small part of a book, filed by subject, so that the cards for "returns" are near each other.</li>
            <li><strong>Store</strong> is the card cabinet. The note on the front of the cabinet says which filing system the cards use. That note is the manifest.</li>
            <li><strong>The query path</strong> is a reader at the desk. The librarian files the question with the same system and pulls the nearest cards.</li>
          </ul>` },
        { type: "diagram", caption: "The two halves of RAG. The top row runs before any question and writes the index. The bottom row runs for each question and reads the index. Both rows use the same embedding model.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Top row, the index path, left to right: load the Markdown files, parse the title and sections, chunk into windows of words, embed each chunk, store chunks.jsonl and manifest.json. Bottom row, the query path, right to left from the store: the question, embed with the same model, find the top chunks, answer with citations in lesson 3.2. An arrow goes from the store down to the search.">
            <defs><marker id="l31a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <text x="14" y="16" class="d-small">Index path: before any question</text>
            <rect x="14" y="26" width="104" height="56" rx="8" class="d-box"/><text x="66" y="50" text-anchor="middle" class="d-bold">Load</text><text x="66" y="68" text-anchor="middle" class="d-small">.md files</text>
            <line x1="118" y1="54" x2="140" y2="54" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="142" y="26" width="104" height="56" rx="8" class="d-box"/><text x="194" y="50" text-anchor="middle" class="d-bold">Parse</text><text x="194" y="68" text-anchor="middle" class="d-small">title, sections</text>
            <line x1="246" y1="54" x2="268" y2="54" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="270" y="26" width="104" height="56" rx="8" class="d-box"/><text x="322" y="50" text-anchor="middle" class="d-bold">Chunk</text><text x="322" y="68" text-anchor="middle" class="d-small">20 words each</text>
            <line x1="374" y1="54" x2="396" y2="54" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="398" y="26" width="104" height="56" rx="8" class="d-box-info"/><text x="450" y="50" text-anchor="middle" class="d-bold">Embed</text><text x="450" y="68" text-anchor="middle" class="d-small">one vector each</text>
            <line x1="502" y1="54" x2="524" y2="54" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="526" y="26" width="104" height="56" rx="8" class="d-box-good"/><text x="578" y="50" text-anchor="middle" class="d-bold">Store</text><text x="578" y="68" text-anchor="middle" class="d-small">chunks, manifest</text>
            <line x1="578" y1="82" x2="578" y2="148" class="d-line" marker-end="url(#l31a1)"/>
            <text x="14" y="140" class="d-small">Query path: for each question (lesson 3.2)</text>
            <rect x="14" y="150" width="104" height="56" rx="8" class="d-box"/><text x="66" y="174" text-anchor="middle" class="d-bold">Question</text><text x="66" y="192" text-anchor="middle" class="d-small">from the user</text>
            <line x1="118" y1="178" x2="140" y2="178" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="142" y="150" width="104" height="56" rx="8" class="d-box-info"/><text x="194" y="174" text-anchor="middle" class="d-bold">Embed</text><text x="194" y="192" text-anchor="middle" class="d-small">same model</text>
            <line x1="246" y1="178" x2="268" y2="178" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="270" y="150" width="232" height="56" rx="8" class="d-box"/><text x="386" y="174" text-anchor="middle" class="d-bold">Find the top chunks</text><text x="386" y="192" text-anchor="middle" class="d-small">then answer with citations</text>
            <line x1="526" y1="178" x2="504" y2="178" class="d-line" marker-end="url(#l31a1)"/>
            <rect x="526" y="150" width="104" height="56" rx="8" class="d-box-good"/><text x="578" y="174" text-anchor="middle" class="d-bold">Index</text><text x="578" y="192" text-anchor="middle" class="d-small">read only</text>
            <text x="320" y="236" text-anchor="middle" class="d-small">If the two embed boxes use different models, the scores have no meaning.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>A librarian files a card by a subject name. An embedder files a chunk by a list of numbers.</strong> Nobody chose the meaning of each number. The model learned it from data.</li>
            <li><strong>A card says what the chapter is about. A chunk is a cut of the text itself.</strong> A cut in the wrong place can split one rule into two chunks, and each half is weaker. Lesson 3.4 measures this.</li>
            <li><strong>A library catalog stays correct when a new book comes.</strong> An index goes stale when a document changes. The content hash in the manifest shows which documents changed.</li>
          </ul>` },
        { type: "interactive", id: "l3-1-pipeline" },
        { type: "html", html: `
          <h3>What the chunk sizes teach</h3>
          <div class="table-wrap"><table>
            <tr><th>Chunk size</th><th>Chunks</th><th>Mix two sections</th><th>Longest chunk</th><th>Probe: first chunk and score</th></tr>
            <tr><td>10 words</td><td>17</td><td>4</td><td>10 words</td><td>refund-policy:0, 1.000</td></tr>
            <tr><td>20 words</td><td>11</td><td>5</td><td>20 words</td><td>refund-policy:0, 0.969</td></tr>
            <tr><td>40 words</td><td>6</td><td>5</td><td>40 words</td><td>refund-policy:0, 0.995</td></tr>
            <tr><td>80 words</td><td>5</td><td>5</td><td>49 words</td><td>refund-policy:0, 0.996</td></tr>
          </table></div>
          <p>The score is not the full story. At 10 words, the first chunk is "You can return an unused tool within 45 days of". It holds the answer, but not the words "full refund" or the receipt rule. At 80 words, each document is one chunk: the refund chunk holds the answer and also the rule for damaged items, so the model gets more text to read. At 20 words, five of the 11 chunks mix two sections. A citation of such a chunk must name both sections.</p>
          <p>The table does not say which size is best. Lesson 3.3 builds the measurement, and lesson 3.4 uses it to choose the size, the cut and the overlap.</p>
          <p class="muted">The documents are fictional and small, made up for teaching. The parse, the chunks and the hashes are real computations on the fixture files of ticket T-017. The vectors come from the fake keyword embedder of the tests, not from a trained model.</p>` }
      ],
      checks: [
        { id: "l3-1-L1-a", type: "mcq",
          q: "Which step runs again for each new question?",
          options: [
            "Parse the documents into sections.",
            "Cut the documents into chunks.",
            "Embed the question with the same model as the index.",
            "Write the manifest."
          ],
          correct: 2,
          explain: "Load, parse, chunk, embed the chunks and store are the index path. They run before any question. Only the question is new, so the query path embeds it and searches the stored vectors." },
        { id: "l3-1-L1-b", type: "mcq",
          q: "Why does each chunk keep the document path and its sections, and not only its text and vector?",
          options: [
            "The vector needs them to have the correct length.",
            "The answer cites them, and a person can open the source to check the answer.",
            "They make the search faster.",
            "The model cannot read text without a path."
          ],
          correct: 1,
          explain: "A citation must point to a place that a person can open. The section ids also let lesson 3.3 label the questions in a way that stays correct when the chunks change." },
        { id: "l3-1-L1-c", type: "recall",
          q: "Name the five steps of the index path, in order.",
          answer: "Load the files, parse them into a title and sections, chunk the text, embed each chunk, store the chunks with their vectors and the manifest." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Pure parse and chunk functions, an Embedder interface and a manifest",
      blocks: [
        { type: "html", html: `
          <h3>The documents</h3>
          <p>The corpus is a folder of Markdown files under <code>docs/</code>. Each file has one <code>#</code> title and some <code>##</code> sections. The ticket gives five fixture files. Four of them hold the FAQ facts of T-003 and T-008 with the same words, for example "You can return an unused tool within 45 days of delivery for a full refund."</p>` },
        { type: "code", lang: "text", code: `--- docs/customer/refund-policy.md ---
# Refund policy

## Return window
You can return an unused tool within 45 days of delivery for a full refund. Keep the receipt. The refund goes back to the card that paid for the order.

## Damaged items
If a tool arrives damaged, send a photo within 7 days. We send a new tool at no cost.` },
        { type: "html", html: `
          <h3>Parse and chunk: pure functions</h3>
          <p>Keep the parse and the chunker pure: text in, records out, no files and no model. Then the tests can check every rule with small strings. The section id is the document id, <code>#</code> and the heading in lowercase with hyphens. The chunk id is the document id, <code>:</code> and the chunk number.</p>` },
        { type: "code", lang: "python", code: `# assistant/ingest.py - the pure part
import re
from dataclasses import dataclass, field

@dataclass
class Section:
    id: str            # "refund-policy#return-window"
    heading: str       # "Return window"
    words: list[str] = field(default_factory=list)

@dataclass
class Doc:
    id: str            # "refund-policy"
    path: str          # "customer/refund-policy.md", relative to docs/
    title: str         # "Refund policy"
    sections: list[Section]

def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"

def parse(path: str, text: str) -> Doc:
    doc_id = path.rsplit("/", 1)[-1].removesuffix(".md")
    title, sections, used = doc_id, [], {}
    def start(heading: str) -> None:
        s = slug(heading)
        used[s] = used.get(s, 0) + 1
        if used[s] > 1:
            s = f"{s}-{used[s]}"
        sections.append(Section(f"{doc_id}#{s}", heading))
    for line in text.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
        elif line.startswith("## "):
            start(line[3:].strip())
        elif line.strip():
            if not sections:
                start("intro")
            sections[-1].words.extend(line.split())
    return Doc(doc_id, path, title, sections)

def chunk(doc: Doc, size: int) -> list[dict]:
    """Windows of size words, no overlap. A chunk never crosses two documents."""
    pairs = [(w, s.id) for s in doc.sections for w in s.words]
    out = []
    for n, i in enumerate(range(0, len(pairs), size)):
        part = pairs[i:i + size]
        out.append({"id": f"{doc.id}:{n}", "doc": doc.path, "title": doc.title,
                    "sections": list(dict.fromkeys(s for _, s in part)),
                    "text": " ".join(w for w, _ in part)})
    return out` },
        { type: "html", html: `
          <h3>The Embedder interface</h3>
          <p>The code that builds the index must not know which model makes the vectors. An <strong>Embedder</strong> interface has a model id, a dimension and two methods: one for the chunks and one for the question. The tests use a fake that counts words from six word lists. Real runs use a local model. Both return vectors of length 1, made with <code>normalize</code> of T-003.</p>` },
        { type: "code", lang: "python", code: `# assistant/embedder.py
import re
from typing import Protocol
from assistant.vectors import normalize        # T-003: raises ValueError for a zero vector

class Embedder(Protocol):
    model: str
    dim: int
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...

class FastEmbedder:
    """A local model through fastembed. No API key. The model downloads on the first use."""
    model = "BAAI/bge-small-en-v1.5"
    dim = 384
    def __init__(self) -> None:
        from fastembed import TextEmbedding     # import here, so the tests do not need it
        self._m = TextEmbedding(model_name=self.model)
    def embed_documents(self, texts):
        return [normalize([float(x) for x in v]) for v in self._m.passage_embed(texts)]
    def embed_query(self, text):
        return normalize([float(x) for x in next(iter(self._m.query_embed(text)))])

class KeywordEmbedder:
    """The fake of the tests: word-list counts, normalized. Not a model."""
    model = "fake-keyword-v1"
    dim = 6
    WORDS = {"returns": [...], "warranty": [...], "delivery": [...],
             "it": [...], "expenses": [...], "hr": [...]}   # the lists are in the ticket
    def _vector(self, text):
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        return normalize([float(sum(t in words for t in tokens)) for words in self.WORDS.values()])
    def embed_documents(self, texts):
        return [self._vector(t) for t in texts]
    def embed_query(self, text):
        return self._vector(text)` },
        { type: "note", kind: "fact", title: "The local model (checked on 2026-11-05)", html: `
          <ul>
            <li><strong>fastembed</strong> is a Python library from Qdrant. Install it with <code>pip install fastembed</code>. It runs the model with ONNX Runtime on the CPU and needs no GPU. The model downloads one time, on the first use.</li>
            <li>Its default text model is <code>BAAI/bge-small-en-v1.5</code>. The model card gives <strong>384 dimensions</strong> and a maximum sequence length of <strong>512 tokens</strong>, under the MIT license.</li>
            <li><code>TextEmbedding</code> has <code>embed</code>, <code>passage_embed</code> and <code>query_embed</code>. Each returns an iterable of NumPy arrays, so convert each array to a list of floats before you store it in JSON.</li>
            <li>Anthropic does not offer its own embedding model. The Claude docs name Voyage AI as one hosted provider. This course uses a local model, so the index costs no API money and the documents stay on your computer.</li>
          </ul>
          <p class="muted">Sources: github.com/qdrant/fastembed (README and fastembed/text/text_embedding.py), huggingface.co/BAAI/bge-small-en-v1.5, platform.claude.com/docs/en/build-with-claude/embeddings. Checked on 2026-11-05. Model lists change: check them again before you start the ticket.</p>` },
        { type: "html", html: `
          <h3>Store: two files and a measurement line</h3>
          <p><code>index/chunks.jsonl</code> has one JSON line for each chunk: <code>id</code>, <code>doc</code>, <code>title</code>, <code>sections</code>, <code>text</code> and <code>vector</code>. <code>index/manifest.json</code> says how the index was made. It answers question 3 of T-003: store the model id and the dimension with the vectors.</p>` },
        { type: "code", lang: "text", code: `$ python -m assistant.ingest docs/ --embedder fake
ingest docs=5 sections=10 chunks=11 words=152 chunk_words=20 embedder=fake-keyword-v1 dim=6 cost_usd=0

$ cat index/manifest.json
{
  "embedder": {"model": "fake-keyword-v1", "dim": 6},
  "chunker": {"kind": "fixed-words", "chunk_words": 20},
  "documents": {
    "customer/delivery-times.md": {"sha256": "5ce7ea20baf3", "chunks": 2},
    "customer/refund-policy.md": {"sha256": "f99d434e4406", "chunks": 3},
    "customer/warranty-claims.md": {"sha256": "ebb7bc0aeef4", "chunks": 2},
    "hr/travel-expenses.md": {"sha256": "30388078eede", "chunks": 2},
    "it/vpn-setup.md": {"sha256": "18e41fc04c47", "chunks": 2}
  },
  "chunks": 11
}` },
        { type: "worked", title: "Worked example: the score of the first chunk",
          intro: "Use the fake embedder at 20 words. The chunk refund-policy:0 is \"You can return an unused tool within 45 days of delivery for a full refund. Keep the receipt. The refund\". The probe question is \"How many days do I have to return an unused tool?\".",
          steps: [
            { html: "Count the words of each list in the chunk. returns: return, unused, refund, receipt, refund = 5. warranty: tool = 1. delivery: days, delivery = 2. The other lists: 0. The counts are (5, 1, 2, 0, 0, 0)." },
            { html: "Normalize. The length is √(25 + 1 + 4) = √30 = 5.477. The vector is (0.913, 0.183, 0.365, 0, 0, 0)." },
            { html: "Do the same for the question. returns: return, unused = 2. warranty: tool = 1. delivery: days = 1. The length is √6 = 2.449, and the vector is (0.816, 0.408, 0.408, 0, 0, 0)." },
            { html: "Both vectors have length 1, so the cosine is the dot product: (5 × 2 + 1 × 1 + 2 × 1) / (√30 × √6) = 13 / √180 = <strong>0.969</strong>. This is the first bar of the probe in the interactive." },
            { faded: true, html: "Now compute the score of refund-policy:1: \"goes back to the card that paid for the order. If a tool arrives damaged, send a photo within 7\".",
              answer: "returns: card, paid, order = 3. warranty: tool, damaged, photo = 3. delivery: arrives = 1. The counts are (3, 3, 1, 0, 0, 0), with length √19. The score is (3 × 2 + 3 × 1 + 1 × 1) / (√19 × √6) = 10 / √114 = 0.937. It is the second bar. The chunk mixes two sections: the end of the return window and the damaged-items rule." }
          ] },
        { type: "note", kind: "warn", title: "One model for the index and the questions", html: `
          <p>A vector of one model cannot be compared with a vector of another model. If the index has 6 dimensions and the question has 384, <code>dot</code> of T-003 raises <code>ValueError</code>, and you find the error at once. If the two models both have 384 dimensions, nothing raises. The scores are numbers with no meaning, and the answers get worse with no error. So the query path must read the model id from the manifest and refuse a different embedder. Lesson 3.2 adds this check to the service start-up.</p>` }
      ],
      checks: [
        { id: "l3-1-L2-a", type: "mcq",
          q: "Why does the manifest store the model id, and not only the dimension?",
          options: [
            "The dimension is not known before the first run.",
            "Two different models can have the same dimension. Only the model id shows that the questions use the same model as the index.",
            "The model id makes the vectors shorter.",
            "fastembed needs the manifest to download the model."
          ],
          correct: 1,
          explain: "A dimension check catches only some mistakes. Two 384-dimension models give vectors of the same length in different spaces, and the dot product of the two has no meaning." },
        { id: "l3-1-L2-b", type: "mcq",
          q: "Which embedder do the tests of the ingest use?",
          options: [
            "FastEmbedder, because the tests must use the real model.",
            "The fake KeywordEmbedder, so the tests need no download and no network, and the numbers are known.",
            "A hosted embedding API with a test key.",
            "No embedder. The tests skip the embed step."
          ],
          correct: 1,
          explain: "The tests check the parse, the chunks, the records and the manifest. The fake gives fixed, hand-checkable vectors. One separate test for FastEmbedder runs only when you allow the network." },
        { id: "l3-1-L2-c", type: "recall",
          q: "Name the six keys of one line of index/chunks.jsonl.",
          answer: "id (for example refund-policy:0), doc (the path under docs/), title, sections (a list of section ids), text and vector." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Deterministic builds, content hashes, model pinning and lost context",
      blocks: [
        { type: "html", html: `
          <h3>A deterministic build</h3>
          <p>Two runs of the ingest on the same files with the same settings must write the same bytes. Then a diff of <code>index/manifest.json</code> shows only real changes, and a test can compare two runs. Three things break this:</p>
          <ul>
            <li><strong>The file order.</strong> The order of a directory listing depends on the file system. Sort the paths.</li>
            <li><strong>A timestamp.</strong> A "built at" field changes on every run. The manifest of this lesson has none. Put the time in a log line if you need it.</li>
            <li><strong>Unordered collections.</strong> A Python <code>set</code> of section ids has no fixed order. Keep a list in the order of the text.</li>
          </ul>
          <p>A real model can give floats that differ in the last digits on another CPU or another library version. So compare real vectors with a tolerance, and compare the fake runs byte for byte.</p>
          <h3>Content hashes</h3>
          <p>The manifest stores the first 12 hexadecimal characters of the SHA-256 of each file. Change "45 days" to "30 days" in the refund policy, and its hash goes from <code>f99d434e4406</code> to <code>28945264e281</code>. The other four hashes stay the same. Lesson 3.10 uses this to embed only the changed documents and to show a stale index on <code>GET /health</code>. This lesson only records the hashes, and a full rebuild is the update.</p>
          <h3>Pin the model</h3>
          <p>A change of the embedding model is a change of every vector. You cannot embed only the new documents with the new model. Rebuild the whole index and write the new model id in the manifest. Treat the model id like the prompt version of lesson 2.7: it goes into the manifest, into the measurement line and, from lesson 3.2, into <code>GET /health</code>.</p>` },
        { type: "note", kind: "simplification", title: "Simplification: words are not tokens", html: `
          <p>The chunker counts words, split at spaces. The embedding model counts tokens with its own tokenizer, which is not the Claude tokenizer of T-002. So <code>count_tokens</code> of T-002 does not measure what the embedder reads. The model card of <code>BAAI/bge-small-en-v1.5</code> gives a maximum of 512 tokens for one input. The chunks of this lesson are at most 49 words, far below the limit. Do not depend on what the library does with a longer text: keep every chunk well below the limit. Lesson 3.4 measures chunks in tokens for the answer cost.</p>
          <p class="muted">Source: huggingface.co/BAAI/bge-small-en-v1.5, checked on 2026-11-05.</p>` },
        { type: "html", html: `
          <h3>A chunk loses its context</h3>
          <p>A chunk is a cut of a longer text. Out of the document, it can lose the facts that made it clear. The Anthropic article on contextual retrieval gives the example chunk "The company's revenue grew by 3% over the previous quarter." The chunk names no company and no period, so a question about one company and one quarter cannot find it with certainty. In the toy index, the chunk <code>refund-policy:2</code> is "days. We send a new tool at no cost." Without its heading "Damaged items", nobody knows when the new tool is free.</p>
          <p>That is why each record keeps the title and the sections. Lesson 3.4 cuts at the section boundaries, and lesson 3.9 adds the context back into the text that is embedded. Both need the structure that the parse step keeps now.</p>
          <h3>Query and passage are two methods</h3>
          <p>fastembed has <code>passage_embed</code> for the documents and <code>query_embed</code> for the questions. Some models are trained with a short instruction before the query. The model card of <code>bge-small-en-v1.5</code> gives the optional query instruction "Represent this sentence for searching relevant passages:". Use the two methods as the interface says, and read what <code>query_embed</code> does in your installed version before you add any text yourself. The ticket asks you to record what you find.</p>` },
        { type: "note", kind: "fact", title: "Where this goes next", html: `
          <p>Lesson 3.2 builds the query path and the FastAPI service on this index. Lesson 3.3 labels questions with the section ids of this lesson and measures retrieval. Lesson 3.4 changes the chunker, lesson 3.5 moves the vectors into Postgres with pgvector, and lesson 3.10 uses the manifest to find a stale index and a wrong model.</p>` }
      ],
      checks: [
        { id: "l3-1-L3-a", type: "mcq",
          q: "You change the embedder from one 384-dimension model to another 384-dimension model, and you rebuild only the new documents. What happens?",
          options: [
            "dot raises ValueError at the first question.",
            "Nothing bad. The dimension is the same, so the vectors are compatible.",
            "No error comes, but the old and new vectors are in different spaces, so the scores have no meaning. Rebuild the whole index and check the model id.",
            "fastembed converts the old vectors."
          ],
          correct: 2,
          explain: "The same length does not mean the same space. Only a full rebuild with one model gives comparable vectors, and only a model id check catches the mistake." },
        { id: "l3-1-L3-b", type: "mcq",
          q: "A teammate adds \"built_at\": the current time to the manifest. What is the problem?",
          options: [
            "JSON cannot store a time.",
            "The manifest changes on every run, so two runs on the same files are no longer byte-identical and a diff shows a change that is not real.",
            "The hash of each document changes.",
            "The embedder gets slower."
          ],
          correct: 1,
          explain: "A deterministic build lets a test and a person see real changes only. Write the time in a log line, not in the manifest." },
        { id: "l3-1-L3-c", type: "recall",
          q: "What does the content hash of each document let a later version of the ingest do?",
          answer: "Find the documents that changed since the last build: embed only those again, remove the chunks of deleted documents, and show a stale index. With a new model, the hashes do not help: rebuild everything." }
      ]
    }
  ],

  debugging: [
    { id: "l3-1-dbg-1", title: "The first question fails after you switch to the real model",
      symptom: "You built the index with --embedder fake for a test. Then you start a search with FastEmbedder. The first question fails.",
      evidence: "ValueError: length mismatch: 384 and 6\n  in dot(query_vector, chunk[\"vector\"])\nindex/manifest.json: \"embedder\": {\"model\": \"fake-keyword-v1\", \"dim\": 6}",
      hints: [
        "Which model made the vectors in the index?",
        "Which model made the vector of the question?"
      ],
      answer: "The index has 6-dimension fake vectors, and the question has a 384-dimension real vector. T-003 dot raises for a length mismatch, so the error is fast and clear. Rebuild the index with the real embedder. Then add a check that compares the embedder model and dimension with the manifest before any search, so that the error names the model and not only the lengths." },
    { id: "l3-1-dbg-2", title: "Two runs on the same files give a different manifest",
      symptom: "test_second_run_writes_the_same_bytes fails on the CI computer but passes on your laptop.",
      evidence: "- \"documents\": {\"customer/delivery-times.md\": ..., \"customer/refund-policy.md\": ...\n+ \"documents\": {\"customer/refund-policy.md\": ..., \"customer/delivery-times.md\": ...\nload_docs: for p in folder.rglob(\"*.md\"): ...",
      hints: [
        "In which order does rglob return the files?",
        "Does the order of the documents change the chunk order in chunks.jsonl too?"
      ],
      answer: "rglob returns the files in the order of the file system, and that order is different on two computers. Sort the paths: sorted(folder.rglob(\"*.md\")), and use the relative path with \"/\" as the key. The chunk order in chunks.jsonl then also stays the same, and so does the order of equal scores in top_k." },
    { id: "l3-1-dbg-3", title: "The ingest stops on a new document",
      symptom: "You add docs/it/printer.md with one section \"## Contact\" and the text \"Call 555-0100 for printer help.\". The fake ingest stops.",
      evidence: "ValueError: zero vector\n  in normalize\n  in KeywordEmbedder._vector",
      hints: [
        "Which word lists of the fake contain a word of this text?",
        "Which chunk caused the error? Does the message say?"
      ],
      answer: "No word of the text is in a word list of the fake, so the counts are all 0, and T-003 normalize raises for a zero vector. The fake is correct to fail: a zero vector has no direction. Two fixes: the ingest must catch the error and name the chunk id and the path (printer:0 in it/printer.md), and the fixture or the test must use words that the fake knows. The real model gives a vector for this text, so the error is a property of the fake, but the clear error message helps with any embedder." }
  ],

  recall: [
    { id: "l3-1-r1", q: "What are the two halves of a RAG system?", a: "The index path (load, parse, chunk, embed, store) runs before any question. The query path (embed the question, find the top chunks, answer with citations) runs for each question." },
    { id: "l3-1-r2", q: "What does one chunk record hold?", a: "The chunk id, the document path, the title, the list of section ids, the text and the vector." },
    { id: "l3-1-r3", q: "What does the manifest hold, and why?", a: "The embedder model id and dimension, the chunker settings, and for each document a content hash and its number of chunks. It shows how the index was made, lets the query path refuse a different model, and shows which documents changed." },
    { id: "l3-1-r4", q: "Which local embedding model does T-017 use, and what is its dimension?", a: "BAAI/bge-small-en-v1.5 through fastembed, 384 dimensions, a maximum of 512 tokens for one input (checked on 2026-11-05)." },
    { id: "l3-1-r5", q: "Why must two runs of the ingest give the same bytes?", a: "Then a diff shows only real changes and a test can compare two runs. Sort the files, keep lists in text order, and put no timestamp in the manifest." },
    { id: "l3-1-r6", q: "Why must the questions use the same model as the index?", a: "Each model has its own vector space. With a different dimension, dot raises an error. With the same dimension, nothing raises, and the scores have no meaning." }
  ],

  interview: [
    { q: "Walk me through the RAG pipeline that you built.",
      outline: "Two halves. The index path: load the documents, parse them into a title and sections, cut chunks, embed each chunk with one pinned model, store the chunks with the document, sections, text and vector, and a manifest with the model id, the dimension, the chunker settings and a content hash for each document. The query path: embed the question with the same model, find the top k by cosine, send the chunks in source tags, and check each citation. Then name how you measure retrieval." },
    { q: "How do you keep the index up to date when the documents change?",
      outline: "Store a content hash for each document in the manifest. On each run, compare the hashes: embed only the changed and new documents, remove the chunks of deleted documents, and write the new manifest. Show stale documents on a health endpoint. A change of the embedding model or the chunker is not an update: rebuild everything." },
    { q: "Why do you need an interface for the embedder?",
      outline: "The index code must not depend on one model. The interface (model id, dimension, embed_documents, embed_query) lets the tests use a fake with known vectors and no network, and lets you change the real model in one place. The model id from the interface goes into the manifest, so the query path can refuse a different model." },
    { q: "Hosted embedding API or a local model?",
      outline: "A hosted API needs a key, costs money per token and sends the documents to a third party, but it needs no download and no CPU. A local model needs a one-time download and CPU time, and the documents stay on your computer. Both need the same interface, the same manifest and the same evaluation. Choose on the retrieval metrics of your own questions, not on a leaderboard." }
  ],

  misconceptions: [
    { wrong: "RAG is a prompt with some documents in it.", right: "RAG is a pipeline. Most of the quality comes from the index path: the parse, the chunks and the embedding model decide what the prompt can contain." },
    { wrong: "Each document can be one vector.", right: "A long document has many topics, and one vector cannot hold them all. Cut it into chunks, and keep the document and the sections of each chunk." },
    { wrong: "If the dimensions match, the vectors are compatible.", right: "Two models with the same dimension have different vector spaces. Check the model id in the manifest." },
    { wrong: "The fake embedder is a bad shortcut.", right: "The fake gives known vectors with no network, so the tests check the parse, the chunks and the records exactly. One separate test covers the real model." },
    { wrong: "A word count is a token count.", right: "The embedding model has its own tokenizer, and the Claude tokenizer is different again. Keep the chunks well below the model limit of 512 tokens." },
    { wrong: "The manifest needs a build time.", right: "A timestamp makes every run different. Keep the manifest deterministic, and write the time in a log line." }
  ],

  resources: [
    { title: "FastEmbed", by: "Qdrant (GitHub)", kind: "Docs", url: "https://github.com/qdrant/fastembed",
      when: "Read with level 2, before milestone 4 of the ticket.",
      why: "The install command, the default model, and the methods embed, passage_embed and query_embed that FastEmbedder calls.",
      watchFor: [
        "Which model is the default, and how do you name another model?",
        "What type does each embed method return?"
      ] },
    { title: "BAAI/bge-small-en-v1.5 model card", by: "BAAI (Hugging Face)", kind: "Docs", url: "https://huggingface.co/BAAI/bge-small-en-v1.5",
      when: "Read with level 3.",
      why: "The facts that the manifest must record and the limits that the chunker must respect: the dimension, the maximum sequence length and the query instruction.",
      watchFor: [
        "What is the dimension and the maximum sequence length?",
        "When does the card say that you need the query instruction?"
      ] },
    { title: "Introducing Contextual Retrieval", by: "Anthropic", kind: "Article", url: "https://www.anthropic.com/news/contextual-retrieval",
      when: "Optional, after level 3. Lessons 3.4 and 3.9 use it again.",
      why: "Why a chunk loses its context, with the example of a revenue figure that names no company, and how much retrieval improves when the context goes back into the chunk.",
      watchFor: [
        "How large is a chunk usually, in the article?",
        "Which two retrieval methods does the article combine?"
      ] },
    { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", by: "Patrick Lewis and others (arXiv)", kind: "Paper", url: "https://arxiv.org/abs/2005.11401",
      when: "Optional, after level 1.",
      why: "The paper that named RAG. Read the abstract for the two kinds of memory: the knowledge in the model weights and a dense vector index of documents.",
      watchFor: [
        "What does the abstract call the parametric and the non-parametric memory?",
        "Which index does the paper use?"
      ] }
  ],

  summary: `
    <ul>
      <li>RAG has two halves. The index path runs before any question. The query path runs for each question.</li>
      <li>The index path has five steps: load, parse, chunk, embed and store.</li>
      <li>Parse keeps the structure: the title and the sections. Each chunk record keeps its id, document, title, sections, text and vector.</li>
      <li>The chunk size decides what one chunk can hold. Small chunks lose context, large chunks mix topics. Lesson 3.4 measures this.</li>
      <li>An Embedder interface hides the model: a fake for the tests, BAAI/bge-small-en-v1.5 through fastembed (384 dimensions) for real runs.</li>
      <li>The manifest records the model, the dimension, the chunker and a content hash for each document, and it has no timestamp.</li>
      <li>The questions must use the same model as the index. A same-size vector from another model gives scores with no meaning and no error.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer how the assistant builds its document index. Use the interactive: the five steps, why the chunk refund-policy:1 has two sections, why 10-word chunks give the probe a score of 1.000 but still miss the full refund rule, and what the manifest records. Then explain why a new embedding model means a full rebuild. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-017"]
};

/* ====================================================================== T-017 */
window.ACADEMY.tickets["T-017"] = {
  id: "T-017",
  title: "The document index: load, parse, chunk, embed and store",
  lesson: "3.1",
  phase: 2,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 2 to 3 hours. Milestone 4 downloads the local model one time. The ticket makes no Claude call.",
  fields: {
    objective: `
      <p>Build the index path of the RAG service. <code>python -m assistant.ingest docs/</code> reads a folder of Markdown files, parses each file into a title and sections, cuts fixed-size chunks, embeds each chunk through an <code>Embedder</code> interface and writes <code>index/chunks.jsonl</code> and <code>index/manifest.json</code>. The manifest records the embedding model, the dimension, the chunker settings and a content hash for each document.</p>
      <p><strong>Real-world problem.</strong> Many RAG systems fail before the first question: the chunks lost their headings, the index was built with another model, or the documents changed and nobody knew. This ticket builds an index that names its sources, records how it was made, and gives the same bytes for the same inputs.</p>`,
    context: `
      <p>This ticket starts phase 2 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools": search in the company documents. Real documents and a real local embedding model replace the toy vectors of T-003 and T-008. Lesson 3.2 builds the query path and the FastAPI service on this index. This ticket does not change the service.</p>
      <p>This ticket builds on these earlier tickets:</p>
      <ul>
        <li>T-001: the project layout, <code>pyproject.toml</code>, the CLI pattern with a measurement line, and the test setup.</li>
        <li>T-002: token counts with <code>count_tokens</code>. They count Claude tokens. The embedding model has its own tokenizer, so this ticket counts words.</li>
        <li>T-003: <code>dot</code>, <code>normalize</code> and <code>top_k</code> in <code>assistant/vectors.py</code>. <code>normalize</code> raises <code>ValueError</code> for a zero vector, <code>dot</code> raises it for a length mismatch, and <code>top_k</code> keeps the input order for equal scores. Do not change this file.</li>
        <li>T-008: the corpus record (id, title, text, vector), <code>grounding.py</code> and <code>api.py</code>. The chunk record of this ticket extends that record. Do not change these files in this ticket.</li>
        <li>T-016: <code>short_hash</code> in <code>assistant/prompts.py</code> (SHA-256, first 12 hexadecimal characters). Reuse it for the content hashes.</li>
      </ul>`,
    prerequisites: `
      <ul>
        <li>Lesson 3.1, levels 1 and 2 complete. Level 3 helps for milestone 3 and the questions.</li>
        <li>T-001, T-003, T-008 and T-016 done, and their tests pass.</li>
        <li>For milestone 4 only: <code>pip install fastembed</code> and a network connection for the first model download. No API key.</li>
        <li>Read the fastembed README (link in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.ingest docs/</code> reads every <code>.md</code> file under the folder, in sorted order of the relative path with <code>/</code>. It writes <code>index/chunks.jsonl</code> and <code>index/manifest.json</code> and prints one measurement line.</li>
        <li>Options: <code>--chunk-words N</code> (default 20), <code>--embedder local|fake</code> (default <code>local</code>) and <code>--out DIR</code> (default <code>index/</code>).</li>
        <li>The measurement line has the fields <code>docs</code>, <code>sections</code>, <code>chunks</code>, <code>words</code>, <code>chunk_words</code>, <code>embedder</code>, <code>dim</code> and <code>cost_usd</code>, in this order. With the fixture and the fake: <code>ingest docs=5 sections=10 chunks=11 words=152 chunk_words=20 embedder=fake-keyword-v1 dim=6 cost_usd=0</code>.</li>
        <li>A folder with no <code>.md</code> file prints an error, writes no file and exits with code 1.</li>
        <li>When the embedder fails on a chunk, the error names the chunk id and the path, no file is written, and the exit code is 1.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>assistant/ingest.py</code> holds the pure functions <code>slug</code>, <code>parse(path, text)</code>, <code>chunk(doc, size)</code> and <code>build_index(files, embedder, size)</code>, plus <code>load_docs(folder)</code>, <code>write_index(index, out)</code> and the <code>__main__</code> code. Only <code>load_docs</code> and <code>write_index</code> touch files.</li>
        <li>Parse rules: a line that starts with <code># </code> is the title. A line that starts with <code>## </code> starts a section. Text before the first section goes into the section <code>intro</code>. Words are the text split at whitespace. The document id is the file name without <code>.md</code>.</li>
        <li>The section id is <code>&lt;document id&gt;#&lt;slug&gt;</code>. The slug is the heading in lowercase, with each run of other characters than <code>a-z</code> and <code>0-9</code> replaced by one <code>-</code>, and no <code>-</code> at the start or the end. A second section with the same slug gets <code>-2</code>, a third <code>-3</code>.</li>
        <li>The chunker cuts the words of one document into windows of <code>N</code> words with no overlap. A chunk never holds words of two documents. The chunk id is <code>&lt;document id&gt;:&lt;n&gt;</code>, from 0. A chunk keeps every section that its words come from, in text order, with no duplicates.</li>
        <li>Each line of <code>chunks.jsonl</code> is one JSON object with the keys <code>id</code>, <code>doc</code> (the path relative to the folder), <code>title</code>, <code>sections</code>, <code>text</code> and <code>vector</code>.</li>
        <li><code>manifest.json</code> has the keys <code>embedder</code> (<code>model</code>, <code>dim</code>), <code>chunker</code> (<code>kind</code> = <code>"fixed-words"</code>, <code>chunk_words</code>), <code>documents</code> (for each path, in sorted order: <code>sha256</code> and <code>chunks</code>) and <code>chunks</code> (the total). <code>sha256</code> is <code>short_hash</code> of T-016 on the file bytes. The manifest has no date and no time.</li>
        <li><code>assistant/embedder.py</code> holds the <code>Embedder</code> protocol (<code>model</code>, <code>dim</code>, <code>embed_documents(texts)</code>, <code>embed_query(text)</code>), <code>FastEmbedder</code> and <code>KeywordEmbedder</code>. Every returned vector is a list of <code>dim</code> floats with length 1, made with <code>normalize</code> of T-003.</li>
        <li><code>FastEmbedder</code> uses <code>TextEmbedding(model_name="BAAI/bge-small-en-v1.5")</code> of fastembed, <code>passage_embed</code> for the chunks and <code>query_embed</code> for a question. It imports fastembed inside the class, so the tests and the fake runs do not need the package. <code>model</code> is <code>"BAAI/bge-small-en-v1.5"</code> and <code>dim</code> is 384.</li>
        <li><code>KeywordEmbedder</code> has <code>model</code> <code>"fake-keyword-v1"</code> and <code>dim</code> 6. Its tokens are <code>re.findall(r"[a-z0-9]+", text.lower())</code>. Each dimension counts the tokens that are in one word list (below), in the order returns, warranty, delivery, it, expenses, hr. A text with no listed token raises <code>ValueError</code> through <code>normalize</code>.</li>
        <li>The tests make no network call. One test of <code>FastEmbedder</code> is marked <code>network</code> and is skipped unless you allow it.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given the fixture and the fake at 20 words, the measurement line is exactly <code>ingest docs=5 sections=10 chunks=11 words=152 chunk_words=20 embedder=fake-keyword-v1 dim=6 cost_usd=0</code>.</li>
        <li>Given the fixture, <code>parse</code> gives 10 sections in total, two for each file. The ids for the refund policy are <code>refund-policy#return-window</code> (30 words) and <code>refund-policy#damaged-items</code> (19 words).</li>
        <li>Given the chunk sizes 10, 20, 40 and 80, the fixture gives 17, 11, 6 and 5 chunks. The longest chunk has 10, 20, 40 and 49 words.</li>
        <li>Given 20 words, <code>refund-policy:1</code> has the sections <code>["refund-policy#return-window", "refund-policy#damaged-items"]</code>, and exactly five chunks have two sections: <code>delivery-times:0</code>, <code>refund-policy:1</code>, <code>warranty-claims:0</code>, <code>travel-expenses:0</code> and <code>vpn-setup:0</code>.</li>
        <li>Given the fake at 20 words, the vector of <code>refund-policy:0</code> is (0.913, 0.183, 0.365, 0, 0, 0) with a tolerance of 0.001, and every vector has length 1.000.</li>
        <li>Given the fake at 20 words and the probe "How many days do I have to return an unused tool?", <code>top_k</code> of T-003 on the stored vectors returns <code>refund-policy:0</code> 0.969, <code>refund-policy:1</code> 0.937 and <code>refund-policy:2</code> 0.577.</li>
        <li>Given the fixture, the manifest has the hashes delivery-times <code>5ce7ea20baf3</code>, refund-policy <code>f99d434e4406</code>, warranty-claims <code>ebb7bc0aeef4</code>, travel-expenses <code>30388078eede</code> and vpn-setup <code>18e41fc04c47</code>.</li>
        <li>Given two runs with the fake on the same files, <code>chunks.jsonl</code> and <code>manifest.json</code> are byte-identical.</li>
        <li>Given a copy of the fixture with "45 days" changed to "30 days", only the refund-policy hash changes, to <code>28945264e281</code>.</li>
        <li>Given a document with the text "Call 555-0100 for printer help." and the fake, the ingest exits with code 1, the error names the chunk id, and the output folder has no new file.</li>
        <li>Given a folder with no <code>.md</code> file, the ingest exits with code 1 and writes no file.</li>
        <li>With the network allowed, <code>FastEmbedder().embed_query("test")</code> returns 384 floats with length 1.000, and a real run prints <code>chunks=11</code>, <code>embedder=BAAI/bge-small-en-v1.5</code> and <code>dim=384</code>.</li>
        <li><code>pytest</code> passes with the network off. The tests of T-001 to T-016 pass without a change.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>The fixture and the parse (guided).</strong> Create the five files under <code>docs/</code> exactly as below, with one newline at the end of each file. Write the hash test first (criterion 7): if a hash differs, your file differs from the fixture. Then write <code>slug</code> and <code>parse</code> with the tests for criterion 2 and for the <code>intro</code> section and a duplicate heading.</li>
        <li><strong>The chunks and the fake (guided).</strong> Write <code>chunk</code> with the tests for criteria 3 and 4. Then write <code>KeywordEmbedder</code> and the tests for criteria 5 and 6. Compute the vector of <code>refund-policy:0</code> on paper first, as in the worked example.</li>
        <li><strong>Store and the CLI (independent).</strong> Write <code>build_index</code>, <code>load_docs</code>, <code>write_index</code> and the <code>__main__</code> code. Build the whole index in memory before you write any file. Write the tests for criteria 1 and 8 to 11 with <code>tmp_path</code>.</li>
        <li><strong>The real model (independent).</strong> Install fastembed, write <code>FastEmbedder</code> and its <code>network</code> test (criterion 12), and run <code>python -m assistant.ingest docs/</code>. Record the measurement line, the time of the run, and the top 3 of the probe with the real model in <code>handoffs/T-017-handoff.md</code>. Compare them with the fake top 3.</li>
      </ol>
      <p class="muted">Cost: the local model costs $0 for each call, so <code>cost_usd=0</code>. The first run downloads the model one time and uses CPU time. This ticket makes no Claude call.</p>
      <p class="muted">Stretch, optional: add <code>--chunk-words 40</code> to the real run. Which chunk comes first for the probe now, and with which score?</p>`,
    files: `
      <pre><code>project/
  pyproject.toml             # add fastembed (milestone 4)
  .gitignore                 # add index/ (a build output)
  assistant/
    vectors.py               # from T-003 (no change)
    prompts.py               # from T-016 (no change): short_hash
    grounding.py             # from T-008 (no change in this ticket)
    api.py                   # from T-008 (no change in this ticket; lesson 3.2 changes it)
    embedder.py              # Embedder, FastEmbedder, KeywordEmbedder
    ingest.py                # slug, parse, chunk, build_index, load_docs, write_index, __main__
  docs/                      # the fixture corpus (below)
    customer/
      delivery-times.md
      refund-policy.md
      warranty-claims.md
    hr/
      travel-expenses.md
    it/
      vpn-setup.md
  index/                     # written by the ingest
    chunks.jsonl
    manifest.json
  tests/
    test_ingest.py           # parse, chunk, records, manifest, CLI
    test_embedder.py         # the fake; the network test of FastEmbedder
  tickets/
    T-017.md                 # this ticket (generated)
  handoffs/
    T-017-handoff.md         # your handoff (template generated)</code></pre>
      <p>The fixture files. All data is fictional. Each file ends with one newline.</p>
      <pre><code>--- docs/customer/delivery-times.md ---
# Delivery times

## Standard delivery
Standard delivery takes 3 to 5 working days.

## Express delivery
Express delivery takes 1 working day. Order before 14:00 for delivery on the next working day.

--- docs/customer/refund-policy.md ---
# Refund policy

## Return window
You can return an unused tool within 45 days of delivery for a full refund. Keep the receipt. The refund goes back to the card that paid for the order.

## Damaged items
If a tool arrives damaged, send a photo within 7 days. We send a new tool at no cost.

--- docs/customer/warranty-claims.md ---
# Warranty claims

## Warranty length
Power tools have a 2-year warranty. Hand tools have a lifetime warranty.

## How to claim
Send the claim form with a photo of the serial number. We reply within 5 working days.

--- docs/hr/travel-expenses.md ---
# Travel expenses

## Hotel limit
The hotel limit is 150 euros for each night.

## How to claim expenses
Send the receipts in the expense tool within 30 days of the trip.

--- docs/it/vpn-setup.md ---
# VPN setup

## Install the app
Install the NWConnect app and sign in with your company account.

## Connection problems
If the app does not connect, restart your laptop and try again. Then contact the IT helpdesk.</code></pre>
      <p>The line with <code>---</code> before each file gives its path. It is not a part of the file. The word lists of <code>KeywordEmbedder</code>:</p>
      <pre><code>returns:  return returns refund unused receipt card paid order
warranty: warranty damaged serial power hand lifetime tool tools photo
delivery: delivery express standard arrives day days working
it:       app nwconnect vpn laptop account connect helpdesk install restart
expenses: hotel euros night expense expenses trip receipts travel
hr:       vacation employees employee salary holiday leave</code></pre>
      <p>The first line of <code>index/chunks.jsonl</code> with the fake (the vector is shortened here):</p>
      <pre><code>{"id": "delivery-times:0", "doc": "customer/delivery-times.md", "title": "Delivery times",
 "sections": ["delivery-times#standard-delivery", "delivery-times#express-delivery"],
 "text": "Standard delivery takes 3 to 5 working days. Express delivery takes 1 working day. Order before 14:00 for delivery on",
 "vector": [0.110, 0.0, 0.994, 0.0, 0.0, 0.0]}</code></pre>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_fixture_files_have_the_expected_hashes</code></td><td>The five files</td><td>The five hashes of criterion 7</td></tr>
        <tr><td><code>test_parse_reads_the_title_and_the_sections</code></td><td><code>refund-policy.md</code></td><td>Title "Refund policy"; two sections with 30 and 19 words</td></tr>
        <tr><td><code>test_text_before_the_first_heading_goes_into_intro</code></td><td>"Hello.\\n## A\\nText."</td><td>Sections <code>x#intro</code> and <code>x#a</code></td></tr>
        <tr><td><code>test_duplicate_headings_get_a_number</code></td><td>Two "## Notes" sections</td><td><code>x#notes</code> and <code>x#notes-2</code></td></tr>
        <tr><td><code>test_chunk_count_for_each_size</code></td><td>Sizes 10, 20, 40, 80</td><td>17, 11, 6, 5 chunks</td></tr>
        <tr><td><code>test_chunk_keeps_both_sections_at_a_boundary</code></td><td>20 words</td><td><code>refund-policy:1</code> has two sections; five chunks in total have two</td></tr>
        <tr><td><code>test_chunk_never_crosses_two_documents</code></td><td>Every size</td><td>Every chunk has one <code>doc</code></td></tr>
        <tr><td><code>test_fake_vector_of_the_first_refund_chunk</code></td><td><code>refund-policy:0</code></td><td>(0.913, 0.183, 0.365, 0, 0, 0)</td></tr>
        <tr><td><code>test_every_vector_has_length_one</code></td><td>All chunks, fake</td><td>Length 1.000</td></tr>
        <tr><td><code>test_probe_ranks_the_return_window_first</code></td><td>The probe, <code>top_k</code>, k = 3</td><td>0.969, 0.937, 0.577</td></tr>
        <tr><td><code>test_measurement_line_of_the_fake_run</code></td><td>The fixture, fake, 20 words</td><td>The exact line of criterion 1</td></tr>
        <tr><td><code>test_second_run_writes_the_same_bytes</code></td><td>Two runs, <code>tmp_path</code></td><td>Byte-identical files</td></tr>
        <tr><td><code>test_edit_changes_only_that_hash</code></td><td>"45 days" to "30 days"</td><td>Only refund-policy changes, to <code>28945264e281</code></td></tr>
        <tr><td><code>test_zero_vector_chunk_stops_the_ingest</code></td><td>The printer document</td><td>Exit 1; the error names <code>printer:0</code>; no file</td></tr>
        <tr><td><code>test_empty_folder_writes_nothing</code></td><td>An empty folder</td><td>Exit 1; no file</td></tr>
        <tr><td><code>test_fastembedder_returns_384_unit_floats</code></td><td>"test" (marked <code>network</code>)</td><td>384 floats; length 1.000</td></tr>
      </table></div>
      <p class="muted">Name each test after the property it proves, as in the table. Use <code>tmp_path</code> for every file that a test writes.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> no Claude call and no paid API. The measurement line shows <code>cost_usd=0</code>.</li>
        <li><strong>Reproducibility:</strong> the same files and settings give the same bytes with the fake. The manifest names the model, the dimension and the chunker.</li>
        <li><strong>Privacy:</strong> the local model runs on your computer, so the document text does not go to a third party.</li>
        <li><strong>Testability:</strong> the parse and the chunker are pure, and the tests run with the network off.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Give the top 3 of the probe with the fake and with the real model. Do they agree? Which chunk do you expect to hold the full answer?</li>
        <li>Which chunks have two sections at 20 words? What must a citation of such a chunk say in lesson 3.2?</li>
        <li>Read <code>query_embed</code> and <code>passage_embed</code> in your installed fastembed version. What does each do with the text before the model reads it?</li>
        <li>Question 3 of T-003 asked which two facts to store with each vector. Where does your design store them, and which code reads them?</li>
        <li>You change the model to another model with 384 dimensions. Which files change, and how does your design stop a search with the old index?</li>
        <li>The longest chunk at 80 words has 49 words. Is it near the limit of 512 tokens of the model? How would you check the token count of the embedder?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, the fake and the real measurement lines, the manifest of the real run).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001 to T-016 did not change.</li>
        <li>The parse and the chunker are pure functions. Only <code>load_docs</code> and <code>write_index</code> touch files.</li>
        <li>You can explain the two halves of RAG, the chunk record, the manifest, and why a new model means a full rebuild.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the index path is in small pure steps; each chunk keeps its document and sections; the manifest records the model, the dimension, the chunker and the hashes, with no timestamp; two runs give the same bytes; the errors name the chunk and the file; the tests use the fake and run with the network off; and how well your answers use your own measurements.</p>`
  }
};
