/*
 * Lesson 1.3 - Embeddings and cosine similarity.
 * Ticket T-003 - Offline FAQ search with toy vectors.
 *
 * Block and check types: see the header of 01-how-llms-produce-text.js.
 * The interactive "cosine2d" is in 03-ix.js and registers on window.ACADEMY.ix.
 *
 * All vectors in this file are toy vectors. They are made by hand so that you can do the
 * arithmetic on paper. Real embedding models make vectors with hundreds or thousands of numbers,
 * and no single number has a name such as "money".
 * Every value below was computed and rounded to 3 decimals (4 where the step needs it).
 * The fact about Anthropic and embeddings comes from the Anthropic docs page "Embeddings".
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.3"] = {
  id: "1.3",
  topic: "t1",
  title: "Embeddings and cosine similarity",
  objective: "Explain what an embedding is, compute cosine similarity by hand for small vectors, and use it correctly in code: same model for both sides, no zero vectors, normalize once, and rank instead of trusting a fixed threshold.",
  prerequisites: [
    "Lesson 1.1 (tokens and the generation loop).",
    "You can add and multiply decimal numbers and take a square root with a calculator.",
    "No linear algebra course is necessary. This lesson teaches the vector arithmetic that you need."
  ],
  covers: ["t1-embeddings"],
  whyItMatters: `
    <p>An LLM cannot read your whole company wiki for each question. Search must first find the few passages that matter.
    Keyword search fails when the user writes "get my money back" and the document says "refund policy".
    <strong>Embeddings</strong> solve this problem: they change text into a list of numbers, so that texts with a similar meaning get similar lists.
    <strong>Cosine similarity</strong> is the usual way to compare two of these lists.</p>
    <p>This is the base of retrieval-augmented generation (RAG, Topic 3), semantic search, duplicate detection and recommendations.
    Interviewers often ask you to explain cosine similarity, and to say why a search system with good code can still return bad results.</p>`,
  concepts: [
    { id: "l1-3-c-embedding", name: "Embedding: a vector that holds the meaning of a text" },
    { id: "l1-3-c-dot-norm", name: "Dot product and vector length (norm)" },
    { id: "l1-3-c-cosine", name: "Cosine similarity: the angle, not the length" },
    { id: "l1-3-c-normalize", name: "Normalization: for unit vectors, dot product equals cosine" },
    { id: "l1-3-c-same-model", name: "One embedding model for queries and documents" },
    { id: "l1-3-c-distance", name: "Cosine compared to Euclidean distance, and the cost of exact search" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Meaning as a direction",
      blocks: [
        { type: "html", html: `
          <p>An <strong>embedding</strong> is a list of numbers that an embedding model makes from a text. We call the list a <strong>vector</strong>.
          The model learned to put texts with a similar meaning at points that are near each other, or in a similar direction.</p>
          <p>Look at a toy example with only two numbers. Imagine that number 1 means "about money" and number 2 means "about IT".</p>
          <div class="table-wrap"><table>
            <tr><th>Text</th><th>Toy vector</th></tr>
            <tr><td>"How do I get a refund?"</td><td>(0.9, 0.1)</td></tr>
            <tr><td>"Can I return a broken drill?"</td><td>(0.8, 0.3)</td></tr>
            <tr><td>"Reset my VPN password"</td><td>(0.1, 0.9)</td></tr>
          </table></div>
          <p>Draw each vector as an arrow from the point (0, 0). The two money questions point in almost the same direction.
          The VPN question points in a very different direction. The two money texts have no word in common, but their arrows are close.
          This is why embeddings find "get my money back" when the document says "refund".</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a compass bearing for meaning", html: `
          <p>Think of each text as a direction on a compass. Two texts about the same subject point in almost the same direction, for example north and north-north-east.
          Two texts about unrelated subjects point at about a right angle. To compare two texts, you compare their directions. You do not compare how far each one walked.</p>` },
        { type: "interactive", id: "cosine2d" },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>Many more dimensions.</strong> Real embeddings have hundreds or thousands of numbers, not 2. You cannot draw them, but the arithmetic is the same.</li>
            <li><strong>No named axes.</strong> In a real model, no single number means "money". The meaning is spread across all the numbers. The labels in this lesson are only for teaching.</li>
            <li><strong>Similar is not the same as correct.</strong> "I want a refund" and "I do not want a refund" can point in almost the same direction, because they talk about the same subject. An embedding measures "about the same thing", not "says the same thing".</li>
          </ul>` },
        { type: "html", html: `
          <p>One number tells how similar two directions are: the <strong>cosine similarity</strong>. It is the cosine of the angle between the two arrows.</p>
          <ul>
            <li>Same direction (angle 0°): cosine = <strong>1</strong>.</li>
            <li>At a right angle (90°): cosine = <strong>0</strong>. The texts share nothing in these dimensions.</li>
            <li>Opposite directions (180°): cosine = <strong>−1</strong>.</li>
          </ul>
          <p>For the toy vectors above, "refund" and "return a broken drill" give cosine = <strong>0.969</strong>. "Refund" and "VPN password" give cosine = <strong>0.220</strong>. Level 2 shows how to compute these numbers.</p>` },
        { type: "diagram", caption: "Toy 2-D embeddings. The two money questions point in almost the same direction (small angle, cosine 0.969). The VPN question is at a large angle (cosine 0.220).",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Three toy embedding vectors drawn as arrows from the origin">
            <defs>
              <marker id="l13ah1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker>
              <marker id="l13ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow-accent"/></marker>
            </defs>
            <line x1="60" y1="230" x2="380" y2="230" class="d-line" marker-end="url(#l13ah1)"/>
            <line x1="60" y1="230" x2="60" y2="20" class="d-line" marker-end="url(#l13ah1)"/>
            <text x="380" y="250" text-anchor="end" class="d-small">number 1: "about money"</text>
            <text x="70" y="22" class="d-small">number 2: "about IT"</text>
            <line x1="60" y1="230" x2="240" y2="210" class="d-line-accent" marker-end="url(#l13ah2)"/>
            <text x="246" y="212" class="d-text">refund (0.9, 0.1)</text>
            <line x1="60" y1="230" x2="220" y2="170" class="d-line-accent" marker-end="url(#l13ah2)"/>
            <text x="226" y="168" class="d-text">return drill (0.8, 0.3)</text>
            <line x1="60" y1="230" x2="80" y2="50" class="d-line" marker-end="url(#l13ah1)"/>
            <text x="88" y="56" class="d-text">VPN password (0.1, 0.9)</text>
            <rect x="430" y="60" width="200" height="56" rx="8" class="d-box-good"/>
            <text x="530" y="84" text-anchor="middle" class="d-bold">refund vs return drill</text>
            <text x="530" y="102" text-anchor="middle" class="d-small">small angle, cosine 0.969</text>
            <rect x="430" y="140" width="200" height="56" rx="8" class="d-box-warn"/>
            <text x="530" y="164" text-anchor="middle" class="d-bold">refund vs VPN password</text>
            <text x="530" y="182" text-anchor="middle" class="d-small">large angle, cosine 0.220</text>
          </svg>` },
        { type: "html", html: `<p><strong>Summary of level 1.</strong> An embedding model changes a text into a vector. Similar meaning gives a similar direction. Cosine similarity measures the direction: 1 is the same direction, 0 is a right angle, −1 is the opposite direction.</p>` }
      ],
      checks: [
        { id: "l1-3-L1-a", type: "mcq",
          q: "A user types \"get my money back\". The help center has no page with these words, but it has a page titled \"Refund policy\". Why can embedding search still find that page?",
          options: [
            "The embedding model has a list of synonyms for every word.",
            "The two texts get vectors that point in a similar direction, because their meanings are similar.",
            "Embedding search uses keyword search with spelling correction.",
            "The LLM reads every page in the help center for each question."
          ],
          correct: 1,
          explain: "An embedding model puts texts with similar meaning in a similar direction. No synonym list and no shared words are necessary. Cosine similarity then finds the page whose vector is closest in direction to the query vector." },
        { id: "l1-3-L1-b", type: "recall",
          q: "In one or two sentences: what does a cosine similarity of 1, of 0 and of −1 tell you about two vectors?",
          answer: "1: the two vectors point in the same direction (angle 0°). 0: they are at a right angle (90°), so they share nothing in these dimensions. −1: they point in opposite directions (180°). Cosine measures only the direction, not the length." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Compute it, store it, use it correctly",
      blocks: [
        { type: "html", html: `
          <h3>Three small operations</h3>
          <p>You need only three operations on vectors <em>a</em> and <em>b</em> of the same length <em>n</em>:</p>
          <ul>
            <li><strong>Dot product:</strong> a · b = a<sub>1</sub>×b<sub>1</sub> + a<sub>2</sub>×b<sub>2</sub> + … + a<sub>n</sub>×b<sub>n</sub>. Multiply the pairs, then add.</li>
            <li><strong>Norm (length):</strong> |a| = √(a · a). This is the length of the arrow (Pythagoras).</li>
            <li><strong>Cosine similarity:</strong> cos(a, b) = (a · b) / (|a| × |b|). The division removes the effect of the two lengths, so only the direction is left.</li>
          </ul>` },
        { type: "worked", title: "Worked example: cosine similarity by hand",
          intro: "Compute the cosine similarity of a = (3, 4) and b = (4, 3). Show every step.",
          steps: [
            { html: "Dot product: a · b = 3×4 + 4×3 = 12 + 12 = <strong>24</strong>." },
            { html: "Norms: |a| = √(3² + 4²) = √25 = <strong>5</strong>. |b| = √(4² + 3²) = √25 = <strong>5</strong>." },
            { html: "Cosine: 24 / (5 × 5) = 24 / 25 = <strong>0.960</strong>. The angle is about 16.3°. The vectors point in almost the same direction." },
            { faded: true, html: "Your turn. Compute the cosine similarity of a = (1, 2, 2) and b = (2, 1, 2). Give 3 decimals.",
              answer: "Dot product: 1×2 + 2×1 + 2×2 = 2 + 2 + 4 = 8. Norms: |a| = √(1 + 4 + 4) = √9 = 3. |b| = √(4 + 1 + 4) = √9 = 3. Cosine: 8 / (3 × 3) = 8 / 9 = 0.889." },
            { faded: true, html: "Your turn. Compute the cosine similarity of a = (3, 4) and c = (30, 40). What does the result tell you about length?",
              answer: "Dot product: 3×30 + 4×40 = 90 + 160 = 250. Norms: |a| = 5, |c| = √(900 + 1600) = √2500 = 50. Cosine: 250 / (5 × 50) = 250 / 250 = 1.000. The vector c is 10 times longer but points in the same direction, so the cosine is 1. Cosine ignores length." }
          ] },
        { type: "stop", text: "Stop. Before you continue, compute the cosine of (1, 0) and (0, 1) without a calculator. Then compute the cosine of (1, 2) and (−1, −2)." },
        { type: "html", html: `
          <h3>Search: rank documents by cosine</h3>
          <p>Here is a tiny FAQ with toy 3-D vectors. The three numbers mean "money", "IT" and "shipping". The query is "Can I get my money back?" with the vector q = (0.9, 0.1, 0.2), so |q| = √0.86 = 0.9274.</p>
          <div class="table-wrap"><table>
            <tr><th>Document</th><th>Vector</th><th>q · d</th><th>|d|</th><th>Cosine</th></tr>
            <tr><td>Refund policy</td><td>(0.8, 0.0, 0.3)</td><td>0.72 + 0 + 0.06 = 0.780</td><td>√0.73 = 0.8544</td><td><strong>0.984</strong></td></tr>
            <tr><td>Warranty claims</td><td>(0.6, 0.1, 0.4)</td><td>0.54 + 0.01 + 0.08 = 0.630</td><td>√0.53 = 0.7280</td><td><strong>0.933</strong></td></tr>
            <tr><td>Delivery times</td><td>(0.2, 0.0, 0.9)</td><td>0.18 + 0 + 0.18 = 0.360</td><td>√0.85 = 0.9220</td><td>0.421</td></tr>
            <tr><td>VPN setup</td><td>(0.1, 0.9, 0.0)</td><td>0.09 + 0.09 + 0 = 0.180</td><td>√0.82 = 0.9055</td><td>0.214</td></tr>
          </table></div>
          <p>Example for the first row: 0.780 / (0.9274 × 0.8544) = 0.780 / 0.7924 = 0.984. The search returns the documents in order of cosine, highest first.
          For the top 2, it returns "Refund policy" and "Warranty claims". Ticket T-003 builds exactly this search, with these numbers as test values.</p>` },
        { type: "code", lang: "python", code:
`import math

def dot(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        raise ValueError(f"length mismatch: {len(a)} != {len(b)}")
    return sum(x * y for x, y in zip(a, b))

def norm(a: list[float]) -> float:
    return math.sqrt(dot(a, a))

def cosine(a: list[float], b: list[float]) -> float:
    na, nb = norm(a), norm(b)
    if na == 0 or nb == 0:
        raise ValueError("cosine is not defined for a zero vector")
    return dot(a, b) / (na * nb)

print(round(cosine([3, 4], [4, 3]), 3))   # 0.96` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>Pure Python is clear but slow for many vectors. Production code uses NumPy or a vector database. The arithmetic does not change. Ticket T-003 uses pure Python so that you see every step.</p>` },
        { type: "html", html: `
          <h3>Normalize once, then use the dot product</h3>
          <p>If you divide a vector by its norm, its length becomes 1. We call it a <strong>unit vector</strong>. For two unit vectors, |a| × |b| = 1, so <strong>cosine = dot product</strong>.
          Example: (3, 4) / 5 = (0.6, 0.8) and (4, 3) / 5 = (0.8, 0.6). Dot product: 0.6×0.8 + 0.8×0.6 = 0.48 + 0.48 = 0.960. This is the same value as the worked example.</p>
          <p>So a search system normalizes each document vector one time, when it stores the vector. At query time, it normalizes the query once and computes only dot products. This saves two square roots per comparison.</p>
          <h3>Rules for engineers</h3>
          <ol>
            <li><strong>Use the same model for queries and documents.</strong> Vectors from two different models are not comparable, even when they have the same length. The numbers do not mean the same thing.</li>
            <li><strong>Store the model name with each vector.</strong> When you change the model, embed all documents again. Do not mix old and new vectors in one index.</li>
            <li><strong>Reject a zero vector and a length mismatch.</strong> A zero vector has no direction, so the cosine is not defined (division by zero). A length mismatch means a bug, often two models.</li>
            <li><strong>Do not trust a fixed threshold from another system.</strong> Cosine is not a probability. A "good" score with one model can be an average score with another model. Rank the results. If you need a threshold, choose it from your own labeled examples.</li>
            <li><strong>Check, do not assume.</strong> Some providers return unit vectors. Compute the norm of a few vectors to confirm it before you replace cosine with a dot product.</li>
          </ol>` },
        { type: "note", kind: "fact", title: "Fact: Anthropic and embeddings", html: `
          <p>Anthropic does not offer its own embedding model. The Anthropic docs page "Embeddings" names Voyage AI as one embeddings provider and shows how to use it.
          It says that Voyage AI embeddings are normalized to length 1, so cosine similarity and dot product give the same value, and cosine and Euclidean distance give the same ranking.
          It also tells you to mark each input as a query or a document with the <code>input_type</code> parameter.</p>
          <p class="muted">Source: <a href="https://platform.claude.com/docs/en/build-with-claude/embeddings" target="_blank" rel="noopener">Embeddings (Anthropic docs)</a>. A real provider needs its own API key in an environment variable (the docs use <code>VOYAGE_API_KEY</code>). Ticket T-003 does not use any provider.</p>` }
      ],
      checks: [
        { id: "l1-3-L2-a", type: "mcq",
          q: "What is the cosine similarity of a = (2, 0) and b = (1, 1)?",
          options: ["0.500", "0.707", "1.000", "1.414"],
          correct: 1,
          explain: "Dot product: 2×1 + 0×1 = 2. Norms: |a| = 2, |b| = √2 = 1.4142. Cosine: 2 / (2 × 1.4142) = 1 / 1.4142 = 0.707. The angle is 45°." },
        { id: "l1-3-L2-b", type: "mcq",
          q: "Your team stored document vectors from embedding model A last year. The new code embeds queries with model B. Both models return vectors of the same length. What happens?",
          options: [
            "Search works as before, because the lengths match.",
            "Search works but is a little slower.",
            "The results are close to random, because the two models use the numbers in different ways. Embed all documents again with model B.",
            "The code raises a length-mismatch error."
          ],
          correct: 2,
          explain: "A vector has meaning only inside the model that made it. The same length does not make two models comparable. No error appears, so this bug is silent. Store the model name with each vector, and embed everything again when you change the model." },
        { id: "l1-3-L2-c", type: "recall",
          q: "Why do search systems often normalize document vectors when they store them?",
          answer: "For unit vectors (length 1), cosine similarity equals the dot product. If you normalize each vector once at storage time, each comparison at query time is only a dot product, with no square roots or division. The ranking stays the same." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Distance, scale and the limits of similarity",
      blocks: [
        { type: "html", html: `
          <h3>Cosine and Euclidean distance agree on unit vectors</h3>
          <p>Euclidean distance is the straight-line distance between the tips of two arrows: |a − b|. For unit vectors there is an exact relation:</p>
          <p class="ix-text">|a − b|² = |a|² + |b|² − 2(a · b) = 1 + 1 − 2 cos(a, b) = 2 − 2 cos(a, b)</p>
          <p>So when cosine goes up, distance goes down. On unit vectors, "highest cosine" and "smallest distance" give the same ranking.
          On vectors that are not normalized, they can give different rankings, because distance also measures length.</p>` },
        { type: "worked", title: "Worked example: check the relation with numbers",
          intro: "Use the unit vectors a = (0.6, 0.8) and b = (0.8, 0.6).",
          steps: [
            { html: "Cosine: 0.6×0.8 + 0.8×0.6 = <strong>0.960</strong> (both norms are 1)." },
            { html: "a − b = (−0.2, 0.2). |a − b|² = 0.04 + 0.04 = <strong>0.080</strong>, so |a − b| = √0.08 = <strong>0.283</strong>." },
            { html: "Check: 2 − 2 × 0.960 = 2 − 1.920 = <strong>0.080</strong>. The two methods agree." },
            { faded: true, html: "Your turn. Use a = (0.6, 0.8) and c = (1, 0). Compute the cosine, the squared distance and the distance. Then check the relation.",
              answer: "Cosine: 0.6×1 + 0.8×0 = 0.600. a − c = (−0.4, 0.8). Squared distance: 0.16 + 0.64 = 0.800. Distance: √0.8 = 0.894. Check: 2 − 2 × 0.600 = 0.800. The relation holds." },
            { faded: true, html: "Your turn. Use the vectors that are not normalized: a = (3, 4) and c = (30, 40). Compare the cosine and the Euclidean distance. Which one says these vectors are \"the same\"?",
              answer: "Cosine: 1.000 (worked example in level 2). Distance: c − a = (27, 36), so |c − a| = √(729 + 1296) = √2025 = 45. The cosine says \"same direction\". The distance says \"far apart\", because it also measures length. For meaning, embedding systems normally compare direction." }
          ] },
        { type: "html", html: `
          <h3>The cost of exact search</h3>
          <p>Exact search compares the query with every stored vector. With <em>N</em> documents and <em>d</em> numbers per vector, one query needs about <em>N</em> × <em>d</em> multiplications.</p>
          <ul>
            <li>10,000 chunks with 1,024 numbers each: 10,000 × 1,024 = 10,240,000 multiplications per query. One CPU core does this quickly.</li>
            <li>100,000,000 chunks with 1,024 numbers each: about 1.0 × 10<sup>11</sup> multiplications per query. This is too slow for an interactive product on one machine.</li>
            <li>Memory: one float32 number uses 4 bytes. 1,024 numbers use 4,096 bytes. One million such vectors use 4,096,000,000 bytes, about 4.1 GB.</li>
          </ul>
          <p>For large collections, vector databases use <strong>approximate nearest neighbor</strong> (ANN) indexes such as HNSW. They check only a small part of the vectors, and they can miss a true best match.
          Topic 3 covers this, together with pgvector.</p>` },
        { type: "note", kind: "warn", title: "Limits of similarity search", html: `
          <ul>
            <li><strong>Negation and small details.</strong> Texts that differ by "not", by a number or by a product code can get a very high cosine. Do not use cosine alone to decide whether two texts say the same thing.</li>
            <li><strong>Scores are not calibrated.</strong> With many models, unrelated texts still get a cosine well above 0. Read scores only relative to other scores from the same model and the same index.</li>
            <li><strong>Queries and documents are different.</strong> A short question and a long answer passage are different kinds of text. Some providers ask you to mark each input as a query or a document. Follow the docs of your provider.</li>
            <li><strong>Float rounding.</strong> In Python, <code>cosine([1, 2], [-1, -2])</code> can return −0.9999999999999998, not exactly −1. Compare with a tolerance in tests. Clamp the value to the range −1 to 1 before you call <code>math.acos</code>.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Where embeddings come from, in one paragraph</h3>
          <p>An embedding model is a neural network, often a transformer like the models in lesson 1.4. It reads the tokens of the text and gives one vector for the whole text.
          It is trained on pairs of texts: pairs that belong together (a question and its answer) get a high similarity, and random pairs get a low similarity.
          This training is the reason that "similar meaning" becomes "similar direction". The details of training are outside the scope of this lesson.</p>` }
      ],
      checks: [
        { id: "l1-3-L3-a", type: "mcq",
          q: "Two unit vectors have a cosine similarity of 0.750. What is the Euclidean distance between them?",
          options: ["0.250", "0.500", "0.707", "1.500"],
          correct: 2,
          explain: "For unit vectors, |a − b|² = 2 − 2 cos = 2 − 1.500 = 0.500. The distance is √0.5 = 0.707." },
        { id: "l1-3-L3-b", type: "recall",
          q: "Your FAQ search returns \"How to cancel an order\" for the query \"How not to cancel my order by mistake\", with cosine 0.93. Explain why, and name one way to reduce the problem.",
          answer: "Embeddings measure \"about the same subject\". Both texts are about cancelling an order, so the vectors point in almost the same direction, even though the meaning differs. Ways to reduce the problem: retrieve several candidates and let a reranker or the LLM read the full text before it answers; add keyword or metadata filters; test the search with labeled examples that include negations." }
      ]
    }
  ],

  debugging: [
    { id: "l1-3-dbg-1", title: "The search results look random after a deploy",
      symptom: "Yesterday the FAQ search returned good results. After today's deploy, the top results have nothing to do with the question. No error appears, and all tests pass.",
      evidence: "Startup log: index loaded, 4,812 vectors, model=embed-model-a. Query log: query embedded with model=embed-model-b, top cosine=0.31",
      hints: [
        "Compare the two model names in the log lines.",
        "Can a vector from one model be compared with a vector from another model?"
      ],
      answer: "The documents were embedded with model A, but the new code embeds queries with model B. The vectors have the same length, so no error appears, but the numbers do not mean the same thing. Fix: use one model for both sides. Store the model name with the index, and refuse to search when the query model and the index model differ. To change the model, embed all documents again." },
    { id: "l1-3-dbg-2", title: "The ranking crashes on one document",
      symptom: "The search crashes for every query since a new FAQ import. The old FAQ worked.",
      evidence: "ZeroDivisionError: float division by zero, in cosine(), document id=faq-0173, text=\"\"",
      hints: [
        "What is the norm of the vector for an empty text in a local count-based vectorizer?",
        "Where is the best place to stop this problem: at import time or at query time?"
      ],
      answer: "The import created a document with empty text. Its vector has only zeros, so its norm is 0, and the cosine divides by 0. Fix: validate at import time (reject or skip empty chunks and log them). In the vector code, raise a clear ValueError for a zero vector, so that the error names the problem and the document." },
    { id: "l1-3-dbg-3", title: "Long documents always win",
      symptom: "A prototype search uses simple word-count vectors and ranks with the dot product. The longest FAQ pages are always at the top, even for unrelated questions.",
      evidence: "Top result for \"vpn password\": \"Employee handbook (full text)\", score=212. The page \"VPN setup\" has score=9.",
      hints: [
        "What happens to the length of a word-count vector when the text is longer?",
        "Which part of the cosine formula removes length?"
      ],
      answer: "The dot product grows with the length of both vectors. A long page has large word counts, so it gets a large dot product with almost any query. Fix: use cosine similarity (divide by both norms), or normalize all vectors to unit length before the dot product. Then only the direction counts." }
  ],

  recall: [
    { id: "l1-3-r1", q: "What is an embedding, in one sentence?", a: "A vector (a list of numbers) that an embedding model makes from a text, so that texts with similar meaning get vectors that point in a similar direction." },
    { id: "l1-3-r2", q: "Write the formula for cosine similarity.", a: "cos(a, b) = (a · b) / (|a| × |b|): the dot product divided by the product of the two norms." },
    { id: "l1-3-r3", q: "What is the cosine similarity of (3, 4) and (4, 3)?", a: "Dot product 24, norms 5 and 5, so 24 / 25 = 0.960." },
    { id: "l1-3-r4", q: "For unit vectors, how are cosine similarity and the dot product related?", a: "They are equal, because both norms are 1. So you normalize once at storage time and use the dot product at query time." },
    { id: "l1-3-r5", q: "Why must queries and documents use the same embedding model?", a: "A vector has meaning only inside the model that made it. Vectors from two models are not comparable, even with the same length, and the bug gives no error." },
    { id: "l1-3-r6", q: "Why is cosine similarity not defined for a zero vector?", a: "The norm of a zero vector is 0, so the formula divides by 0. A zero vector also has no direction." },
    { id: "l1-3-r7", q: "For unit vectors, give the relation between Euclidean distance and cosine.", a: "|a − b|² = 2 − 2 cos(a, b). Higher cosine means smaller distance, so both give the same ranking." }
  ],

  interview: [
    { q: "Explain cosine similarity to a backend engineer, and say why search systems use it for embeddings.",
      outline: "An embedding is a vector that holds meaning. Cosine = dot product divided by both norms = cosine of the angle. It compares direction and ignores length. Range −1 to 1. Example (3, 4) and (4, 3) gives 0.960. Normalize at storage time so that the query needs only dot products." },
    { q: "Your semantic search returns bad results, but the code has no errors. Where do you look?",
      outline: "Same model and version for queries and documents? Model name stored with the index? Query and document input types? Chunking (too large, too small, empty chunks)? Normalization? A threshold copied from another model? Build a small labeled set of queries with expected documents and measure the hit rate before and after each change." },
    { q: "When do you need a vector database instead of a NumPy array?",
      outline: "Exact search costs about N × d multiplications per query and N × d × 4 bytes for float32. For thousands of chunks, an array in memory is fine. For millions, add an ANN index (HNSW), persistence, filters and updates; accept that ANN can miss a true best match. Measure recall against exact search." },
    { q: "Cosine similarity, dot product or Euclidean distance: which one do you choose?",
      outline: "For unit vectors all three give the same ranking (|a − b|² = 2 − 2 cos), and the dot product is fastest. For vectors that are not normalized, cosine ignores length, while the dot product and distance do not. Follow the recommendation of the model provider, and check whether its vectors are normalized." }
  ],

  misconceptions: [
    { id: "l1-3-mis-1", wrong: "A cosine of 0.8 means the texts are 80% similar.", right: "Cosine is not a percentage or a probability. Its scale depends on the model. Compare scores only with other scores from the same model, and choose thresholds from your own labeled data." },
    { id: "l1-3-mis-2", wrong: "Vectors with the same length from two models can be compared.", right: "A vector has meaning only inside the model that made it. Use one model for queries and documents." },
    { id: "l1-3-mis-3", wrong: "A high cosine means the two texts say the same thing.", right: "A high cosine means they are about the same subject. \"Refund\" and \"no refund\" can score high." },
    { id: "l1-3-mis-4", wrong: "Each number in an embedding has a meaning, such as \"money\".", right: "In real models the meaning is spread across all the numbers. Named axes exist only in toy examples." },
    { id: "l1-3-mis-5", wrong: "The dot product and cosine always give the same ranking.", right: "Only for vectors with the same length, for example unit vectors. Otherwise the dot product prefers long vectors." },
    { id: "l1-3-mis-6", wrong: "Claude has an embeddings endpoint in the Anthropic API.", right: "Anthropic does not offer its own embedding model. Its docs name Voyage AI as one provider." }
  ],

  resources: [
    { title: "Embeddings", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/embeddings",
      when: "Read after level 2.",
      why: "How to get embeddings when you build with Claude, and the FAQ on similarity functions and input types.",
      watchFor: [
        "Does Anthropic offer its own embedding model?",
        "Why can you use the dot product instead of cosine with the vectors in this guide?",
        "What does input_type do, and why does it matter for retrieval?"
      ] },
    { title: "Transformers, the tech behind LLMs (Deep Learning, Chapter 5)", by: "3Blue1Brown", kind: "Video", url: "https://www.youtube.com/watch?v=wjZofJX0v4M",
      when: "Watch after level 1.",
      why: "A visual explanation of word embeddings as directions in a high-dimensional space, and of the dot product as a measure of alignment.",
      note: "This video shows embeddings of single tokens inside a transformer. This lesson uses embeddings of whole texts. The geometry is the same idea.",
      watchFor: [
        "What does a direction in the embedding space represent in the examples of the video?",
        "What does the dot product of two vectors tell you about their directions?"
      ] },
    { title: "Vector Similarity Explained", by: "Pinecone", kind: "Article", url: "https://www.pinecone.io/learn/vector-similarity/",
      when: "Read after level 3.",
      why: "The Anthropic embeddings page links to this guide. It compares Euclidean distance, dot product and cosine similarity.",
      watchFor: ["When do the three measures give different rankings?"] },
    { title: "Introducing Contextual Retrieval", by: "Anthropic", kind: "Article", url: "https://www.anthropic.com/news/contextual-retrieval",
      when: "Optional preview. Topic 3 uses it.",
      why: "Shows how embedding search is used in a real retrieval system, and where it fails.",
      watchFor: ["Why can a chunk lose its meaning when it is embedded alone?"] }
  ],

  summary: `
    <ul>
      <li>An embedding is a vector that an embedding model makes from a text. Similar meaning gives a similar direction.</li>
      <li>Cosine similarity = (a · b) / (|a| × |b|). It measures direction and ignores length. Range −1 to 1.</li>
      <li>(3, 4) and (4, 3) give 24 / 25 = 0.960. (3, 4) and (30, 40) give 1.000.</li>
      <li>For unit vectors, cosine = dot product, and |a − b|² = 2 − 2 cos. Normalize once at storage time.</li>
      <li>Use one model for queries and documents. Reject zero vectors and length mismatches. Do not trust a fixed threshold.</li>
      <li>High cosine means "about the same subject", not "says the same thing".</li>
      <li>Anthropic does not offer its own embedding model. Its docs name Voyage AI as one provider.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer how a search finds \"Refund policy\" for the question \"Can I get my money back?\". Compute one cosine similarity by hand on a toy example and show each step. Then name three ways a real system can return bad results with no error. Write it or record it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-003"]
};

/* ====================================================================== T-003 */
window.ACADEMY.tickets["T-003"] = {
  id: "T-003",
  title: "Offline FAQ search with toy vectors",
  lesson: "1.3",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 to 5)",
  estimate: "One focused session.",
  fields: {
    objective: `
      <p>Build a small vector module and a command, <code>faq_search</code>, that ranks a fictional FAQ by cosine similarity to a query vector.
      All vectors are toy vectors in a JSON file. The ticket uses no API key, no network and no paid service.</p>
      <p><strong>Real-world problem.</strong> Before a team adds a vector database, it must trust the basic arithmetic and its edge cases:
      zero vectors, length mismatches, normalization and ranking order. Bugs here give no error. They only give bad answers.
      This ticket makes the arithmetic visible and tested, so that Phase 2 (RAG) can build on it.</p>`,
    context: `
      <p>This ticket continues the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      T-001 created the project layout, the <code>assistant</code> package and the test setup. T-003 adds the vector arithmetic that the document search in Phase 2 will use.
      In Phase 2, real embeddings replace the toy vectors. The functions and tests in this ticket stay the same.</p>
      <p>T-003 depends only on T-001. It adds new files and changes no file from T-001 or T-002, so you can do it before or after T-002.</p>`,
    prerequisites: `
      <ul>
        <li>T-001 complete: the project folder, the virtual environment, <code>pyproject.toml</code>, the <code>assistant</code> package and <code>pytest</code>.</li>
        <li>Lesson 1.3, levels 1 and 2 complete (level 3 helps for the questions).</li>
        <li>No API key is necessary. Do not import <code>anthropic</code> in this ticket.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.faq_search money-back</code> loads the fixture, finds the query with the id <code>money-back</code>, and prints the documents ranked by cosine similarity, highest first, one line each: score (3 decimals), document id, title.</li>
        <li>Option <code>--k N</code> prints only the top N results (default 3). When N is larger than the number of documents, it prints all documents.</li>
        <li>Option <code>--vector "0.9,0.1,0.2"</code> uses that vector instead of a query id.</li>
        <li>An unknown query id, a vector with the wrong length, or a zero vector gives one clear error line and an exit code that is not 0. No stack trace.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>assistant/vectors.py</code> has <code>dot</code>, <code>norm</code>, <code>normalize</code>, <code>cosine</code> and <code>top_k</code>, with type hints. Use pure Python (<code>math</code> only). Add no dependency.</li>
        <li><code>dot</code> and <code>cosine</code> raise <code>ValueError</code> for a length mismatch. <code>normalize</code> and <code>cosine</code> raise <code>ValueError</code> for a zero vector. The messages say what is wrong.</li>
        <li><code>top_k(query, docs, k)</code> takes a list of (id, vector) pairs and returns a list of (id, score) pairs, sorted by score, highest first. When two scores are equal, keep the input order.</li>
        <li><code>top_k</code> normalizes the query once. The fixture loader normalizes each document vector once at load time. The scores must equal the cosine values.</li>
        <li>The fixture loader checks that every vector has the length that the fixture declares, and fails with a clear message when one does not.</li>
        <li>The CLI does no arithmetic itself. It calls <code>vectors.py</code>.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given the fixture, when you run <code>python -m assistant.faq_search money-back</code>, then the output is, in this order: refund-policy 0.984, warranty-claims 0.933, delivery-times 0.421.</li>
        <li>Given <code>--k 10</code>, the output lists all 4 documents, and the last one is vpn-setup 0.214.</li>
        <li>Given <code>where-is-my-order</code>, the first line is delivery-times 0.993. Given <code>vpn-broken</code>, the first line is vpn-setup 0.989.</li>
        <li>Given <code>--vector "0,0,0"</code>, the command prints one error line that names the zero vector, and the exit code is not 0.</li>
        <li>Given <code>--vector "1,0"</code>, the command prints one error line that names the length mismatch (2 compared to 3), and the exit code is not 0.</li>
        <li><code>pytest</code> passes with the network off and with no <code>ANTHROPIC_API_KEY</code> in the environment.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>By hand first (guided).</strong> On paper, compute the cosine of (3, 4) and (4, 3), and the cosine of the query <code>money-back</code> and <code>refund-policy</code>. Write the steps in your handoff. Then write <code>dot</code> and <code>norm</code> and a test that gives your paper result.</li>
        <li><strong>Cosine and its errors (guided).</strong> Write <code>cosine</code> with the two <code>ValueError</code> cases. Write the tests for the known pair, length, orthogonal, opposite, zero vector and length mismatch.</li>
        <li><strong>Normalize and rank (independent).</strong> Write <code>normalize</code> and <code>top_k</code>. Prove with a test that the ranking with normalized dot products equals the ranking with <code>cosine</code>.</li>
        <li><strong>Fixture and command (independent).</strong> Create <code>data/faq_vectors.json</code> from the listing in "Likely files". Write the loader and the command. Run the acceptance commands and save the output for the handoff.</li>
        <li><strong>Tests and handoff (independent).</strong> Complete the test list. Fill in <code>handoffs/T-003-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional and still offline: write a word-count vectorizer for the FAQ titles and rank with the plain dot product, then with cosine. Show in the handoff how the plain dot product prefers long texts.</p>`,
    files: `
      <pre><code>project/
  assistant/
    vectors.py          # dot, norm, normalize, cosine, top_k
    faq_search.py       # fixture loader and command (python -m assistant.faq_search)
  data/
    faq_vectors.json    # toy fixture, fictional data (below)
  tests/
    test_vectors.py
    test_faq_search.py
  handoffs/
    T-003-handoff.md    # your handoff (generated template)</code></pre>
      <p>Fixture <code>data/faq_vectors.json</code>. The three dimensions are labels for teaching only. All data is fictional.</p>
      <pre><code>{
  "dimensions": ["money", "it", "shipping"],
  "documents": [
    {"id": "refund-policy",   "title": "Refund policy",   "vector": [0.8, 0.0, 0.3]},
    {"id": "warranty-claims", "title": "Warranty claims", "vector": [0.6, 0.1, 0.4]},
    {"id": "vpn-setup",       "title": "VPN setup",       "vector": [0.1, 0.9, 0.0]},
    {"id": "delivery-times",  "title": "Delivery times",  "vector": [0.2, 0.0, 0.9]}
  ],
  "queries": [
    {"id": "money-back",        "text": "Can I get my money back?",   "vector": [0.9, 0.1, 0.2]},
    {"id": "vpn-broken",        "text": "My VPN does not connect",     "vector": [0.0, 1.0, 0.1]},
    {"id": "where-is-my-order", "text": "Where is my order?",          "vector": [0.1, 0.0, 1.0]}
  ]
}</code></pre>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_cosine_known_pair</code></td><td>(3, 4) and (4, 3)</td><td>0.960 (compare with a tolerance of 0.001)</td></tr>
        <tr><td><code>test_cosine_ignores_length</code></td><td>(3, 4) and (30, 40)</td><td>1.000</td></tr>
        <tr><td><code>test_cosine_orthogonal_is_zero</code></td><td>(1, 0) and (0, 1)</td><td>0.000</td></tr>
        <tr><td><code>test_cosine_opposite_is_minus_one</code></td><td>(1, 2) and (−1, −2)</td><td>−1.000 (the float result can be −0.9999999999999998)</td></tr>
        <tr><td><code>test_zero_vector_raises</code></td><td>(0, 0) and (1, 2)</td><td>ValueError that names the zero vector</td></tr>
        <tr><td><code>test_length_mismatch_raises</code></td><td>(1, 0) and (1, 0, 0)</td><td>ValueError that names both lengths</td></tr>
        <tr><td><code>test_normalize_gives_unit_length</code></td><td>(3, 4)</td><td>(0.6, 0.8), and its norm is 1.000</td></tr>
        <tr><td><code>test_normalized_dot_equals_cosine</code></td><td>Every query and document pair in the fixture</td><td>The same value to 3 decimals</td></tr>
        <tr><td><code>test_top_k_money_back_order</code></td><td>Query money-back, k = 4</td><td>refund-policy 0.984, warranty-claims 0.933, delivery-times 0.421, vpn-setup 0.214</td></tr>
        <tr><td><code>test_top_k_larger_than_corpus</code></td><td>k = 10</td><td>All 4 documents, no error</td></tr>
        <tr><td><code>test_top_k_ties_keep_input_order</code></td><td>Two documents with the same vector</td><td>The first one in the input comes first</td></tr>
        <tr><td><code>test_fixture_rejects_wrong_length</code></td><td>A fixture with one vector of length 2</td><td>Clear error that names the document id</td></tr>
        <tr><td><code>test_cli_unknown_query_exits_non_zero</code></td><td>Query id "nope"</td><td>One error line, exit code not 0</td></tr>
      </table></div>
      <p class="muted">Design hint: let the loader take a path argument. Then a test can write a small broken fixture to a temporary folder (<code>tmp_path</code> in pytest).</p>`,
    nfr: `
      <ul>
        <li><strong>Security:</strong> no network calls and no secrets. The ticket needs no environment variable. Do not add a key for an embedding provider to the repository.</li>
        <li><strong>Reliability:</strong> validate input at the edges (fixture load, command arguments). Fail with a clear message. Never return a silent 0 for a zero vector.</li>
        <li><strong>Performance:</strong> exact search costs about N × d multiplications per query. Normalize documents once at load time, not for each query. Write in the handoff at what size you would change to NumPy or a vector index.</li>
        <li><strong>Cost:</strong> zero. No paid call, no new dependency.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Why is the score of <code>warranty-claims</code> for <code>money-back</code> high (0.933), although its "money" number (0.6) is lower than that of <code>refund-policy</code> (0.8)? What does this tell you about cosine?</li>
        <li>Why does normalization at load time give the same ranking as <code>cosine</code>, but with less work per query?</li>
        <li>In Phase 2 the vectors come from a real embedding model. Which two pieces of information must you store with each vector, and why?</li>
        <li>A colleague proposes "show a document only when its cosine is above 0.8". What is wrong with this rule, and what would you do instead?</li>
        <li>Your test for (1, 2) and (−1, −2) failed with an exact comparison. Why, and what is the correct way to compare floats in a test?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (terminal output and pytest output).</li>
        <li><code>pytest</code> passes with the network off and with no API key in the environment.</li>
        <li>Your paper calculation from milestone 1 is in the handoff and matches the code.</li>
        <li>You can explain each function in <code>vectors.py</code> without notes, including the two error cases.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> correct arithmetic; clear errors for zero vectors and length mismatches;
      normalization done once; a stable ranking; float comparisons with a tolerance; no network and no secrets; and how well your answers to the questions show understanding.</p>`
  }
};
