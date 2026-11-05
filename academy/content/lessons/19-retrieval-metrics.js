/*
 * Lesson 3.3 - Retrieval metrics: recall@k, precision@k, MRR, nDCG.
 * Ticket T-019 - The retrieval eval: labeled questions, four metrics, a baseline and a gate.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * The script loads 17-ix.js and 19-ix.js (id "l3-3-metrics") and calls evaluate(size), detail(...) and compare(...).
 * The Python code of level 2 was also run on the same lists, and it gave the same numbers.
 * Index: the T-017 fixture with the fake keyword embedder; 20-word chunks (11 chunks) unless the text says otherwise.
 * The ranked list of each question is the top 10 of retrieve_question(question, index, embedder, k=10, min_score=0).
 * Rules: a result is relevant when one of its sections has a grade of 1 or more; its gain is the highest grade
 * of its sections; recall counts labeled sections; precision divides by k; RR is 0 with no relevant result in the
 * top k; DCG = sum of gain / log2(rank + 1); the ideal list sorts the gains of all chunks in the index.
 *   q02 "What do I do if a tool arrives damaged?" labels damaged-items 2, how-to-claim 1.
 *       ranked gains 2, 1, 1, 2, 0, ... ; ideal 2, 2, 1, 1, 0, ...
 *       k = 3: recall 2/2 = 1.000, precision 3/3 = 1.000, RR 1/1 = 1.000,
 *       DCG 2 + 0.631 + 0.500 = 3.131, IDCG 2 + 1.262 + 0.500 = 3.762, nDCG 0.832. k = 1: recall 0.500.
 *       With how-to-claim at grade 2: nDCG@3 = 1.000.
 *   q06 "What is the hotel limit for each night of a trip?" The first chunk is travel-expenses:1 "the trip." (1.000).
 *       k = 1: recall 0, precision 0, RR 0, nDCG 0. k = 3: recall 1.000, precision 0.333, RR 0.500, nDCG 0.631.
 *   Hand case: ranked [a], [b], [c], [d]; labels b = 2, d = 1. recall@2 0.500, precision@2 0.500, RR@4 0.500,
 *       DCG@4 1.262 + 0.431 = 1.693, IDCG@4 2 + 0.631 = 2.631, nDCG@4 0.643.
 *   Eval at 20 words (mean over 6 labeled questions):
 *       k=1 recall 0.750 precision 0.833 mrr 0.833 ndcg 0.833; k=3 1.000 0.611 0.917 0.911;
 *       k=5 1.000 0.400 0.917 0.931; k=10 1.000 0.200 0.917 0.931. Skipped: q07 best 0.927, q08 best 0.447.
 *   Candidate at 10 words (17 chunks): k=3 recall 0.917 precision 0.778 mrr 1.000 ndcg 0.956 (q02 misses
 *       warranty-claims#how-to-claim). Gate: FAIL, "recall@3 went down: 1.000 -> 0.917", fixed [], broken [].
 *   Candidate at 40 words (6 chunks): k=3 recall 1.000 precision 0.444 mrr 1.000 ndcg 0.978. Gate: PASS.
 * Facts and their sources (checked on 2026-11-05):
 *   - Reciprocal rank is the inverse of the rank of the first correct answer; with no correct result it is 0.
 *     Source: https://en.wikipedia.org/wiki/Mean_reciprocal_rank
 *   - DCG = sum of rel_i / log2(i + 1); a second common form uses 2^rel_i - 1; nDCG = DCG / IDCG.
 *     Source: https://en.wikipedia.org/wiki/Discounted_cumulative_gain
 *   - Precision at k and recall. Source: https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval)
 *   - The Anthropic contextual retrieval article uses "1 minus recall@20" as its evaluation metric.
 *     Source: https://www.anthropic.com/news/contextual-retrieval
 * The interactive for this lesson is in 19-ix.js (id "l3-3-metrics").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["3.3"] = {
  id: "3.3",
  topic: "t3",
  title: "Retrieval metrics: recall@k, precision@k, MRR, nDCG",
  objective: "Measure retrieval apart from the answer: label each question with the document sections that hold the answer, compute recall@k, precision@k, MRR and nDCG on the ranked list of the RAG service, explain what each metric can and cannot show, and protect the retrieval with a baseline and a gate.",
  prerequisites: [
    "Lesson 3.2: the query path and retrieve_question (ticket T-018).",
    "Lesson 2.2 helps: a labeled sample set and accuracy (ticket T-011).",
    "Lesson 2.7 helps: the baseline and the regression gate (ticket T-016)."
  ],
  covers: ["t3-metrics"],
  whyItMatters: `
    <p>Lessons 3.4 to 3.9 change the retrieval: the chunks, the vector store, hybrid search, a reranker, query rewriting and contextual chunks. Each change can make the answers better or worse. Without a number, you decide by reading a few answers, and you remember the good ones. This lesson builds the number first.</p>
    <p>Retrieval needs its own measurement. When an answer is wrong, the cause is in one of two places: the retrieval did not find the right text, or the model did not use it. Answer metrics mix the two. Retrieval metrics need no model call, cost nothing to run, and run in seconds. In an interview, "how do you evaluate your RAG system?" is one of the most common questions. A good answer starts with labeled questions and recall@k, before any judge model.</p>`,
  concepts: [
    { id: "l3-3-c-labels", name: "A labeled question set: the relevant sections of each question, with a grade" },
    { id: "l3-3-c-recall", name: "recall@k and precision@k: what the top k found, and how much of it is useful" },
    { id: "l3-3-c-mrr", name: "MRR: how high the first relevant result is" },
    { id: "l3-3-c-ndcg", name: "nDCG: graded relevance with a discount for each lower rank" },
    { id: "l3-3-c-eval", name: "The eval script: one retrieval function, one row for each k, a cache of query vectors" },
    { id: "l3-3-c-gate", name: "A retrieval baseline and a gate in the T-016 pattern" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Grade the search before you grade the answer",
      blocks: [
        { type: "html", html: `
          <p>A retrieval metric needs two things: the ranked list that the search returns for a question, and a <strong>label</strong> that says which text holds the answer. The label is written by a person, one time, before any measurement.</p>
          <p>The four metrics answer four different questions about the top <em>k</em> results:</p>
          <ul>
            <li><strong>recall@k</strong>: of the sections that hold the answer, how many are in the top k?</li>
            <li><strong>precision@k</strong>: of the top k results, how many are relevant?</li>
            <li><strong>MRR</strong> (mean reciprocal rank): how high is the first relevant result? 1 for rank 1, 1/2 for rank 2, 0 for none in the top k. The mean is over all the questions.</li>
            <li><strong>nDCG@k</strong> (normalized discounted cumulative gain): are the best results at the top? It uses grades, so a result that holds the answer counts more than a result that is only related.</li>
          </ul>` },
        { type: "note", kind: "analogy", title: "Analogy: the books on the desk", html: `
          <p>You ask a librarian for books about a question, and three books come to your desk.</p>
          <ul>
            <li><strong>Recall:</strong> the library has two useful books. Both are on the desk. Recall is 2 of 2.</li>
            <li><strong>Precision:</strong> of the three books on the desk, two are useful. Precision is 2 of 3.</li>
            <li><strong>Reciprocal rank:</strong> the first useful book is the top book of the pile. The value is 1. If it were the second book, the value would be 1/2.</li>
            <li><strong>nDCG:</strong> one book answers the question, and one book only helps. nDCG is highest when the book with the answer is on top.</li>
          </ul>` },
        { type: "diagram", caption: "The first 5 results of \"What do I do if a tool arrives damaged?\" at 20-word chunks. The section damaged-items has the grade 2, and how-to-claim has the grade 1. The metrics use the top 3.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Five ranked chunks with their gains: refund-policy:2 gain 2, warranty-claims:0 gain 1, warranty-claims:1 gain 1, refund-policy:1 gain 2, delivery-times:1 gain 0. The top 3 are inside a box. At k = 3, recall is 1.000, precision is 1.000, reciprocal rank is 1.000 and nDCG is 0.832.">
            <defs><marker id="l33a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="10" y="12" width="310" height="140" rx="10" class="d-box-info"/>
            <text x="22" y="32" class="d-small">top k = 3</text>
            <rect x="22" y="40" width="286" height="30" rx="6" class="d-box-good"/><text x="34" y="60" class="d-bold">1  refund-policy:2</text><text x="296" y="60" text-anchor="end" class="d-small">gain 2</text>
            <rect x="22" y="76" width="286" height="30" rx="6" class="d-box"/><text x="34" y="96" class="d-bold">2  warranty-claims:0</text><text x="296" y="96" text-anchor="end" class="d-small">gain 1</text>
            <rect x="22" y="112" width="286" height="30" rx="6" class="d-box"/><text x="34" y="132" class="d-bold">3  warranty-claims:1</text><text x="296" y="132" text-anchor="end" class="d-small">gain 1</text>
            <rect x="22" y="164" width="286" height="30" rx="6" class="d-box-good"/><text x="34" y="184" class="d-bold">4  refund-policy:1</text><text x="296" y="184" text-anchor="end" class="d-small">gain 2</text>
            <rect x="22" y="200" width="286" height="30" rx="6" class="d-box"/><text x="34" y="220" class="d-bold">5  delivery-times:1</text><text x="296" y="220" text-anchor="end" class="d-small">gain 0</text>
            <line x1="322" y1="82" x2="366" y2="82" class="d-line" marker-end="url(#l33a1)"/>
            <rect x="368" y="12" width="262" height="140" rx="10" class="d-box"/>
            <text x="382" y="38" class="d-bold">recall@3 = 2 / 2 = 1.000</text>
            <text x="382" y="64" class="d-bold">precision@3 = 3 / 3 = 1.000</text>
            <text x="382" y="90" class="d-bold">RR@3 = 1 / 1 = 1.000</text>
            <text x="382" y="116" class="d-bold">nDCG@3 = 3.131 / 3.762 = 0.832</text>
            <text x="382" y="140" class="d-small">the gain-2 chunk at rank 4 is not in the top 3</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The labels name sections, and the results are chunks.</strong> A book is one thing. A section can be in two chunks, and a chunk can hold two sections. The rules below say how to count.</li>
            <li><strong>Relevant is not the same as correct.</strong> These metrics say if the search found the right text. They do not say if the model then used it well. That is the work of topic 5.</li>
          </ul>` },
        { type: "interactive", id: "l3-3-metrics" },
        { type: "html", html: `
          <h3>What the question set shows</h3>
          <p>The eval runs 8 questions on the index of lesson 3.1 (20-word chunks). Six questions have labels. Two questions have no answer in the documents, so they have no relevant section. The eval skips them in the metrics.</p>
          <div class="table-wrap"><table>
            <tr><th>k</th><th>recall@k</th><th>precision@k</th><th>MRR@k</th><th>nDCG@k</th></tr>
            <tr><td>1</td><td>0.750</td><td>0.833</td><td>0.833</td><td>0.833</td></tr>
            <tr><td>3</td><td>1.000</td><td>0.611</td><td>0.917</td><td>0.911</td></tr>
            <tr><td>5</td><td>1.000</td><td>0.400</td><td>0.917</td><td>0.931</td></tr>
            <tr><td>10</td><td>1.000</td><td>0.200</td><td>0.917</td><td>0.931</td></tr>
          </table></div>
          <p>Read the rows from top to bottom. Recall goes up with k, because more results can only find more. Precision goes down, because each extra result is more often unrelated. At k = 3, the default of the service, every labeled section is found. MRR is below 1 because of one question: for "What is the hotel limit for each night of a trip?", the first chunk is "the trip.", a fragment with a score of 1.000. The chunk with the answer is second, so the reciprocal rank is 1/2.</p>
          <p class="muted">The documents, the questions and the labels are fictional. The search is a real computation on the index of lesson 3.1 with the fake embedder of the tests. A real model gives other numbers.</p>` }
      ],
      checks: [
        { id: "l3-3-L1-a", type: "mcq",
          q: "You change k from 3 to 10. What happens to recall@k and precision@k?",
          options: [
            "Both go up.",
            "Recall stays the same or goes up. Precision usually goes down.",
            "Recall goes down. Precision goes up.",
            "Nothing changes, because the ranking is the same."
          ],
          correct: 1,
          explain: "More results can only find more of the labeled sections, so recall cannot go down. Each extra result is often unrelated, so precision usually goes down: 0.611 at k = 3 and 0.200 at k = 10 in the question set." },
        { id: "l3-3-L1-b", type: "mcq",
          q: "The first relevant result of a question is at rank 2. What is its reciprocal rank at k = 1 and at k = 3?",
          options: ["1 and 1", "0 and 0.5", "0.5 and 0.5", "0 and 0.333"],
          correct: 1,
          explain: "At k = 1 no relevant result is in the top k, so the value is 0. At k = 3 the first relevant result is at rank 2, so the value is 1/2. This is the hotel-limit question." },
        { id: "l3-3-L1-c", type: "recall",
          q: "Say in one sentence each what recall@k, precision@k, MRR and nDCG measure.",
          answer: "recall@k: the share of the relevant sections that the top k found. precision@k: the share of the top k results that are relevant. MRR: the mean of 1 / rank of the first relevant result. nDCG@k: how near the ranking is to the ideal order of the graded results, with less weight for lower ranks." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Labels, a pure metrics module, an eval script and a gate",
      blocks: [
        { type: "html", html: `
          <h3>The labels name sections, not chunk ids</h3>
          <p>Write the questions and the labels in <code>samples/rag_questions.jsonl</code>, one JSON line for each question. The label names the <strong>section</strong> that holds the answer, with a grade: 2 if the section holds the answer, 1 if it is related and helps. Do not name chunk ids. Lesson 3.4 changes the chunks, so every chunk id changes. The sections stay the same, so the labels stay correct and the eval can compare two chunkings.</p>` },
        { type: "code", lang: "json", code: `{"id": "q02", "question": "What do I do if a tool arrives damaged?", "relevant": {"refund-policy#damaged-items": 2, "warranty-claims#how-to-claim": 1}, "must_pass": true}
{"id": "q06", "question": "What is the hotel limit for each night of a trip?", "relevant": {"travel-expenses#hotel-limit": 2}, "must_pass": false}
{"id": "q08", "question": "How many vacation days do new employees get?", "relevant": {}, "must_pass": false}` },
        { type: "html", html: `
          <p>Because the labels are sections and the results are chunks, four rules make the counting exact:</p>
          <ol>
            <li>A result is <strong>relevant</strong> when one of its sections has a grade of 1 or more.</li>
            <li>The <strong>gain</strong> of a result is the highest grade of its sections.</li>
            <li><strong>Recall</strong> counts labeled sections, not chunks. Two chunks of the same section find it one time.</li>
            <li>The <strong>ideal list</strong> for nDCG sorts the gains of all chunks in the index, so nDCG is never above 1.</li>
          </ol>` },
        { type: "code", lang: "python", code: `# assistant/retrieval_metrics.py - pure functions, no I/O, no model
import math

# ranked: the section ids of each result, in rank order, e.g. [["refund-policy#damaged-items"], ...]
# labels: {section_id: grade}, grade 1 or 2

def relevant(labels: dict[str, int]) -> set[str]:
    return {s for s, g in labels.items() if g >= 1}

def gain(sections: list[str], labels: dict[str, int]) -> int:
    return max((labels.get(s, 0) for s in sections), default=0)

def recall_at_k(ranked, labels, k) -> float:
    want = relevant(labels)
    if not want:
        raise ValueError("no relevant section")
    found = {s for sections in ranked[:k] for s in sections}
    return len(want & found) / len(want)

def precision_at_k(ranked, labels, k) -> float:
    return sum(1 for sections in ranked[:k] if gain(sections, labels) >= 1) / k

def reciprocal_rank(ranked, labels, k) -> float:
    for rank, sections in enumerate(ranked[:k], start=1):
        if gain(sections, labels) >= 1:
            return 1 / rank
    return 0.0

def dcg(gains: list[int], k: int) -> float:
    return sum(g / math.log2(rank + 1) for rank, g in enumerate(gains[:k], start=1))

def ndcg_at_k(gains: list[int], ideal: list[int], k: int) -> float:
    best = dcg(sorted(ideal, reverse=True), k)
    return dcg(gains, k) / best if best else 0.0` },
        { type: "note", kind: "fact", title: "The definitions (checked on 2026-11-05)", html: `
          <ul>
            <li>The reciprocal rank is the inverse of the rank of the first correct answer. If no result is correct, it is 0. MRR is the mean over the questions.</li>
            <li>DCG adds <code>rel_i / log2(i + 1)</code> over the positions. A second common form uses <code>2^rel_i − 1</code> as the gain, which gives more weight to the highest grade. nDCG divides DCG by the DCG of the ideal order. This course uses the first form. Say which form you use when you report a number.</li>
          </ul>
          <p class="muted">Sources: the Wikipedia pages "Mean reciprocal rank", "Discounted cumulative gain" and "Evaluation measures (information retrieval)", checked on 2026-11-05.</p>` },
        { type: "worked", title: "Worked example: nDCG@3 of the damaged-tool question",
          intro: "The labels are damaged-items = 2 and how-to-claim = 1. The ranked chunks are refund-policy:2 (damaged-items), warranty-claims:0 (warranty-length, how-to-claim), warranty-claims:1 (how-to-claim), refund-policy:1 (return-window, damaged-items), then chunks with no labeled section.",
          steps: [
            { html: "Gains of the ranked list: 2, 1, 1, 2, 0, … Each chunk gets the highest grade of its sections." },
            { html: "DCG@3 = 2 / log2(2) + 1 / log2(3) + 1 / log2(4) = 2 + 0.631 + 0.500 = <strong>3.131</strong>." },
            { html: "The ideal list sorts the gains of all 11 chunks: 2, 2, 1, 1, 0, … (refund-policy:1 and refund-policy:2 both hold damaged-items)." },
            { html: "IDCG@3 = 2 / log2(2) + 2 / log2(3) + 1 / log2(4) = 2 + 1.262 + 0.500 = <strong>3.762</strong>. nDCG@3 = 3.131 / 3.762 = <strong>0.832</strong>." },
            { faded: true, html: "Recall@3 and precision@3 are both 1.000 here. Why is nDCG@3 lower? What would make it 1.000 with the same ranking?",
              answer: "Recall and precision ignore the grades and the order inside the top 3. nDCG sees that a chunk with grade 2 (refund-policy:1) is at rank 4, while two chunks with grade 1 are at ranks 2 and 3. With the same ranking, nDCG@3 is 1.000 only if the labels change: give how-to-claim the grade 2, and the top 3 gains are 2, 2, 2, equal to the ideal list. Do not change a label to get a better number. Change it only when the label was wrong." }
          ] },
        { type: "html", html: `
          <h3>The eval script</h3>
          <p><code>scripts/retrieval_eval.py</code> loads the index and the questions, sends each question through <code>retrieve_question</code> of T-018 with k = 10 and the minimum 0, and prints one row for each k. It uses the same function as <code>POST /ask</code>. So when lesson 3.6 adds hybrid search to that function, the eval measures exactly what the users get.</p>
          <p>A file caches the query vectors. The key is the model id and the question text. A second run makes no embedding call, and a different model never reads the vectors of another model.</p>` },
        { type: "code", lang: "text", code: `$ python scripts/retrieval_eval.py --embedder fake
retrieval_eval questions=8 labeled=6 skipped=2 embedder=fake-keyword-v1 chunker=fixed-words/20 chunks=11 embed_calls=8
k   recall  precision  mrr    ndcg
1   0.750   0.833      0.833  0.833
3   1.000   0.611      0.917  0.911
5   1.000   0.400      0.917  0.931
10  1.000   0.200      0.917  0.931
skipped (no relevant section): q07 best=0.927, q08 best=0.447
misses at k=3: none

$ python scripts/retrieval_eval.py --embedder fake      # the second run
retrieval_eval questions=8 labeled=6 skipped=2 ... embed_calls=0` },
        { type: "html", html: `
          <h3>The baseline and the gate</h3>
          <p>The gate follows T-016. <code>--update-baseline</code> saves the run in <code>samples/retrieval_baseline.json</code>, and only after a pass. Later runs compare with it at k = 3, the default of the service. The gate fails when:</p>
          <ul>
            <li>recall@3 is lower than the baseline, or</li>
            <li>a must-pass question is not a <strong>hit</strong>: every section with grade 2 must be in the top 3, or</li>
            <li>the question file changed. Then the numbers are not comparable. Review the labels and save a new baseline.</li>
          </ul>
          <p>Use the gate with the chunk sizes of lesson 3.1. With the 20-word index as the baseline, a 10-word index fails: recall@3 goes from 1.000 to 0.917, because the damaged-tool question loses the section how-to-claim. A 40-word index passes: recall@3 stays at 1.000, and MRR@3 goes up to 1.000. But precision@3 goes down to 0.444, and each chunk is twice as long. The gate protects the minimum. A person still decides with all the numbers.</p>` }
      ],
      checks: [
        { id: "l3-3-L2-a", type: "mcq",
          q: "Why do the labels name sections and not chunk ids?",
          options: [
            "Section ids are shorter.",
            "Lesson 3.4 changes the chunks, so the chunk ids change. Section labels stay correct and let the eval compare two chunkings.",
            "The embedder cannot read chunk ids.",
            "Chunk ids are secret."
          ],
          correct: 1,
          explain: "A label set must outlive the index. With chunk ids, every new chunking needs new labels, and two chunkings cannot be compared with the same labels." },
        { id: "l3-3-L2-b", type: "mcq",
          q: "Two chunks of the ranked top 3 both hold the only labeled section. What is recall@3?",
          options: ["2.000", "1.000", "0.500", "It depends on the scores."],
          correct: 1,
          explain: "Recall counts labeled sections, not chunks. One labeled section is found, so recall is 1 / 1. Precision@3 counts both chunks as relevant: 2 / 3." },
        { id: "l3-3-L2-c", type: "recall",
          q: "Name the three reasons for which the retrieval gate fails.",
          answer: "recall@3 is lower than the baseline; a must-pass question is not a hit (a grade-2 section is not in the top 3); the question file changed, so the numbers are not comparable." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Choose the metric for the decision, and distrust small sets",
      blocks: [
        { type: "html", html: `
          <h3>Which metric for which decision</h3>
          <div class="table-wrap"><table>
            <tr><th>Decision</th><th>Metric</th><th>Why</th></tr>
            <tr><td>Can the model answer at all?</td><td>recall@k at the k of the service</td><td>A section that is not in the prompt cannot be in the answer.</td></tr>
            <tr><td>How many tokens of noise does the prompt get?</td><td>precision@k</td><td>Each unrelated chunk costs input tokens and can distract the model.</td></tr>
            <tr><td>Does the top result answer the question?</td><td>MRR</td><td>Important when the interface shows one result, or when the answer uses the first chunk most.</td></tr>
            <tr><td>Is a reranker worth it?</td><td>nDCG@k</td><td>A reranker changes the order inside the top k. Recall@k at the same k does not see that.</td></tr>
          </table></div>
          <p>For RAG, recall@k is usually the first metric. A generator can ignore an unrelated chunk, but it cannot use a chunk that is not in the prompt. The Anthropic article on contextual retrieval reports its results as "1 minus recall@20", a failure rate of retrieval.</p>
          <h3>A small set gives large steps</h3>
          <p>With six labeled questions, one question moves recall@3 by 1/6 of its range. The 10-word index lost 0.083 (1.000 to 0.917) because of one section of one question. Report the misses by id, not only the mean, and read them. Grow the set from real questions: each bad answer in production that was a retrieval miss becomes a new labeled line. Lesson 5.2 builds the larger golden set.</p>
          <h3>Labels can be wrong</h3>
          <p>A person writes the labels, and documents change. If a document gets a new section that also answers a question, the label misses it, and precision goes down for a correct result. Check the label file in each change of the documents. The eval stops when a label names a section that does not exist in the index. That catches a typo and a renamed heading.</p>` },
        { type: "note", kind: "warn", title: "Do not tune on the test set without a check", html: `
          <p>Lessons 3.4 to 3.9 change the retrieval and measure it on these questions. After many changes, the settings fit these questions, and not the questions of real users. Keep a few questions apart that you do not look at while you tune, and run them before you ship a large change.</p>` },
        { type: "html", html: `
          <h3>What the questions with no answer are for</h3>
          <p>Questions q07 and q08 have no relevant section, so recall is not defined for them. The eval prints their best score: 0.927 and 0.447. The vacation question is far below the minimum score 0.5, and the return-delivery question is far above it, although the documents do not answer it. A minimum score alone cannot catch the second case. Lesson 3.7 uses these questions to set the minimum on the reranker score.</p>` }
      ],
      checks: [
        { id: "l3-3-L3-a", type: "mcq",
          q: "A reranker changes the order of the top 10, and k stays 10. Which metric can show the change?",
          options: ["recall@10", "precision@10", "nDCG@10 or MRR", "None of them"],
          correct: 2,
          explain: "recall@10 and precision@10 count what is in the top 10, not the order inside it. nDCG and MRR depend on the rank." },
        { id: "l3-3-L3-b", type: "mcq",
          q: "A chunking change moves recall@3 from 1.000 to 0.917 on 6 questions. What do you do first?",
          options: [
            "Ship it, because the change is small.",
            "Read the misses by id: which question lost which section, and why.",
            "Remove the question that fails from the set.",
            "Change the labels until the number is 1.000."
          ],
          correct: 1,
          explain: "On a small set, one question is the whole change. The miss list names it (q02 lost warranty-claims#how-to-claim). Then decide with the cause, not with the mean." },
        { id: "l3-3-L3-c", type: "recall",
          q: "Why can the minimum score not stop the return-delivery question, and where does the course fix this?",
          answer: "Its best score is 0.927, far above 0.5, because its words match the refund chunks, but no chunk answers it. A score of nearness cannot see that the answer is missing. Lesson 3.7 sets the minimum on the reranker score, measured on such questions, and the model can still abstain." }
      ]
    }
  ],

  debugging: [
    { id: "l3-3-dbg-1", title: "Every label is a miss after the new chunking",
      symptom: "After a change of the chunking, recall@k is 0.000 for every question and every k.",
      evidence: "{\"id\": \"q01\", \"relevant\": {\"refund-policy:0\": 2}}\nranked sections of q01: [\"refund-policy#return-window\"], ...",
      hints: [
        "What kind of id does the label use?",
        "What kind of id does the ranked list give to the metrics?"
      ],
      answer: "The labels name chunk ids, and the metrics compare them with section ids. Nothing ever matches. Write the labels as sections (refund-policy#return-window). Also make the eval stop when a label names a section that is not in the index, so this mistake fails at once with a clear message." },
    { id: "l3-3-dbg-2", title: "nDCG is above 1",
      symptom: "test_ndcg_is_never_above_one fails for the damaged-tool question.",
      evidence: "ndcg_at_k(gains=[2, 1, 1], ideal=[2, 1], k=3) = 1.190",
      hints: [
        "Which items does the ideal list hold?",
        "How many chunks have a gain above 0 in the index?"
      ],
      answer: "The ideal list was built from the labeled sections (2 and 1), one item for each section. But two chunks can hold one section, so the ranked list has more gains than the ideal list. Build the ideal list from the gains of all chunks in the index: 2, 2, 1, 1. Then nDCG@3 is 0.832." },
    { id: "l3-3-dbg-3", title: "The eval is slow and costs money on every run",
      symptom: "With the real embedder, each run of retrieval_eval.py takes a long time, and the measurement line says embed_calls=8 on every run.",
      evidence: "retrieval_eval ... embedder=BAAI/bge-small-en-v1.5 ... embed_calls=8\n.cache/query_vectors.json: {}",
      hints: [
        "Does the script save the cache after the run?",
        "Which key does it use to read the cache?"
      ],
      answer: "The script fills the cache in memory but never writes the file, or it reads with a different key than it writes. Save the cache at the end of the run, and use one key function for read and write: the short hash of the model id and the question text. A test with a counting embedder shows 8 calls on the first run and 0 on the second." }
  ],

  recall: [
    { id: "l3-3-r1", q: "What is recall@k?", a: "The number of labeled sections found in the top k, divided by the number of labeled sections." },
    { id: "l3-3-r2", q: "What is precision@k?", a: "The number of relevant results in the top k, divided by k." },
    { id: "l3-3-r3", q: "What is the reciprocal rank when no relevant result is in the top k?", a: "0." },
    { id: "l3-3-r4", q: "How is DCG@k computed in this course?", a: "The sum over the top k of gain / log2(rank + 1). nDCG divides it by the DCG of the ideal list, which sorts the gains of all chunks in the index." },
    { id: "l3-3-r5", q: "Why do the labels name sections?", a: "So that they stay correct when the chunks change, and the eval can compare two chunkings with the same labels." },
    { id: "l3-3-r6", q: "When does the retrieval gate fail?", a: "When recall@3 goes down, when a must-pass question is not a hit, or when the question file changed." }
  ],

  interview: [
    { q: "How do you evaluate the retrieval of a RAG system?",
      outline: "Label questions with the sections that hold the answer, with grades. Run them through the same retrieve function as production. Report recall@k at the k of the service first, then precision@k, MRR and nDCG. Read the misses by id. Cache the query vectors. A baseline and a gate stop regressions." },
    { q: "What is the difference between MRR and nDCG?",
      outline: "MRR looks only at the first relevant result, with binary relevance. nDCG uses graded relevance and every position in the top k, with a log discount, normalized by the ideal order. Use MRR when one result matters; use nDCG to compare rankers." },
    { q: "Your recall@5 is 0.95, but users say answers are often wrong. What do you check?",
      outline: "Retrieval looks good, so check generation: is the right chunk used, are there conflicts, is the prompt too long. Check that the eval uses the production retrieve path and k. Check that the question set is like real questions, and add the failing ones." },
    { q: "Why not label chunk ids?",
      outline: "Chunk ids change with every chunking. Section labels survive, and let you compare chunkers. Map each chunk to its sections in the eval, and define how a section in two chunks counts." }
  ],

  misconceptions: [
    { wrong: "A high precision@k means the retrieval is good.", right: "Precision can be high while a needed section is missing. For RAG, check recall@k at the k of the service first." },
    { wrong: "Recall@k goes down when k goes up.", right: "Recall@k can only stay the same or go up with k. Precision usually goes down." },
    { wrong: "MRR uses all the relevant results.", right: "MRR uses only the rank of the first relevant result." },
    { wrong: "nDCG uses one fixed gain formula.", right: "Two forms are common: rel_i and 2^rel_i − 1. Say which one you use." },
    { wrong: "A mean on six questions is a stable number.", right: "One question moves it by a large step. Report the misses by id and grow the set." },
    { wrong: "The eval can use its own simple search.", right: "It must call the retrieve function of the service, or it measures a different system." }
  ],

  resources: [
    { title: "Evaluation measures (information retrieval)", by: "Wikipedia", kind: "Reference", url: "https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval)",
      when: "Read with level 1.",
      why: "Precision, recall, precision at k and the other common measures in one place.",
      watchFor: [
        "How is precision at k different from precision of the full result list?"
      ] },
    { title: "Discounted cumulative gain", by: "Wikipedia", kind: "Reference", url: "https://en.wikipedia.org/wiki/Discounted_cumulative_gain",
      when: "Read with the worked example of level 2.",
      why: "The two common forms of DCG and the definition of nDCG with the ideal order.",
      watchFor: [
        "Which form gives more weight to the highest grade?",
        "How is the ideal DCG built?"
      ] },
    { title: "Mean reciprocal rank", by: "Wikipedia", kind: "Reference", url: "https://en.wikipedia.org/wiki/Mean_reciprocal_rank",
      when: "Read with level 1.",
      why: "A short definition with a worked table.",
      watchFor: [
        "What is the value when no result is correct?"
      ] },
    { title: "Introducing Contextual Retrieval", by: "Anthropic", kind: "Article", url: "https://www.anthropic.com/news/contextual-retrieval",
      when: "Optional, after level 3. Lesson 3.9 uses it again.",
      why: "A real report of retrieval changes, measured with one metric of this lesson.",
      watchFor: [
        "Which metric does the article use, and at which k?"
      ] }
  ],

  summary: `
    <ul>
      <li>Measure retrieval apart from the answer, with labeled questions and no model call.</li>
      <li>The labels name sections with a grade, so they stay correct when the chunks change.</li>
      <li>recall@k counts the labeled sections in the top k. precision@k counts the relevant results in the top k, divided by k.</li>
      <li>MRR is the mean of 1 / rank of the first relevant result. nDCG compares the graded ranking with the ideal order.</li>
      <li>The eval calls the retrieve function of the service, prints one row for each k, and caches the query vectors.</li>
      <li>A baseline and a gate at k = 3 stop a lower recall and a missed must-pass question. A person still reads the misses.</li>
    </ul>`,

  teachBack: "Explain the four metrics to a teammate with the damaged-tool question in the interactive: why recall@3 and precision@3 are 1.000 and nDCG@3 is 0.832. Then explain why the hotel-limit question has a reciprocal rank of 0.5, and why the 10-word index fails the gate. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-019"]
};

/* ====================================================================== T-019 */
window.ACADEMY.tickets["T-019"] = {
  id: "T-019",
  title: "The retrieval eval: labeled questions, four metrics, a baseline and a gate",
  lesson: "3.3",
  phase: 2,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 2 to 3 hours. No Claude call. The real embedder runs locally.",
  fields: {
    objective: `
      <p>Build the retrieval eval of the assistant. Write a labeled question set whose labels name document sections. Write a pure module with recall@k, precision@k, the reciprocal rank and nDCG. Write <code>scripts/retrieval_eval.py</code>, which sends each question through <code>retrieve_question</code> of T-018, prints one row for each k and caches the query vectors. Add a retrieval baseline and a gate in the T-016 pattern.</p>
      <p><strong>Real-world problem.</strong> Teams tune RAG systems by reading a few answers. A change that helps one question breaks another, and nobody sees it until users complain. This ticket gives every later retrieval change a number, measured on the production retrieval path, with a gate that stops a regression.</p>`,
    context: `
      <p>This ticket continues phase 2 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". T-018 built the query path. This ticket measures it. Tickets T-020 to T-025 (lessons 3.4 to 3.9) change the retrieval and run this eval for each change.</p>
      <p>This ticket builds on these earlier tickets:</p>
      <ul>
        <li>T-018: <code>retrieve_question(question, index, embedder, k, min_score)</code> and <code>load_index</code> in <code>assistant/rag.py</code>. The eval uses them. Do not write a second search.</li>
        <li>T-017: the index files, the chunk record with its <code>sections</code>, the manifest, <code>--chunk-words</code> and <code>--out</code> of the ingest, and the fake embedder.</li>
        <li>T-016: <code>GateResult</code> and <code>compare</code> in <code>assistant/gate.py</code>, <code>short_hash</code> in <code>assistant/prompts.py</code>, and the rule "update the baseline only after a pass".</li>
        <li>T-011: a labeled sample set in <code>samples/</code>, written by hand before any measurement.</li>
      </ul>`,
    prerequisites: `
      <ul>
        <li>Lesson 3.3, levels 1 and 2 complete. Level 3 helps for milestone 4 and the questions.</li>
        <li>T-018 done, and its tests pass. T-016 done.</li>
        <li>Milestone 4 only: the real index from <code>python -m assistant.ingest docs/</code>. No API key is needed.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>samples/rag_questions.jsonl</code> holds the 8 fictional questions of the lesson, one JSON object on each line: <code>id</code>, <code>question</code>, <code>relevant</code> (a map from a section id to the grade 1 or 2) and <code>must_pass</code>. Two questions have no answer in the documents and an empty <code>relevant</code>.</li>
        <li><code>python scripts/retrieval_eval.py</code> prints one summary line, one row for each k in 1, 3, 5 and 10 with recall, precision, MRR and nDCG at 3 decimals (the mean over the labeled questions), the skipped questions with their best score, and the misses at k = 3: each question with recall@3 below 1 and its missing sections. Options: <code>--embedder local|fake</code>, <code>--index DIR</code>, <code>--update-baseline</code>.</li>
        <li>When <code>samples/retrieval_baseline.json</code> exists, the script also prints the baseline line, the candidate line, the fixed and broken ids, and <code>verdict: PASS</code> or <code>verdict: FAIL</code> with one line for each reason. The exit code is 0 for a pass and 1 for a fail.</li>
        <li><code>--update-baseline</code> writes the run only after a pass, or when no baseline exists. After a fail, it writes nothing and says so.</li>
        <li>The script stops with an error that names the question and the section when a label names a section that is not in the index.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>A new pure module <code>assistant/retrieval_metrics.py</code> holds <code>relevant</code>, <code>gain</code>, <code>recall_at_k</code>, <code>precision_at_k</code>, <code>reciprocal_rank</code>, <code>dcg</code> and <code>ndcg_at_k</code> with the rules of the lesson. It has no I/O and imports no model or web library.</li>
        <li>The rules: a result is relevant when one of its sections has a grade of 1 or more; its gain is the highest grade of its sections; recall counts labeled sections and raises <code>ValueError</code> when there is none; precision divides by k; the reciprocal rank is 0 with no relevant result in the top k; DCG is the sum of gain / log2(rank + 1); the ideal list sorts the gains of all chunks in the index.</li>
        <li>The script gets the ranked list from <code>retrieve_question(question, index, embedder, k=10, min_score=0)</code> and maps each result to the <code>sections</code> of its chunk.</li>
        <li><code>CachedEmbedder(inner, path)</code> wraps an embedder with the same interface. Its <code>embed_query</code> reads and writes <code>.cache/query_vectors.json</code>, with the key <code>short_hash(model + "\\n" + text)</code>. The script saves the cache at the end and prints <code>embed_calls</code>, the number of calls to the inner embedder. Add <code>.cache/</code> to <code>.gitignore</code>.</li>
        <li><code>compare_retrieval(baseline, run)</code> in <code>assistant/gate.py</code> returns a <code>GateResult</code> of T-016. It fails when <code>questions_hash</code> differs, when recall@3 (rounded to 3 decimals) is lower than the baseline, or when a must-pass question is not a hit. A question is a hit when every section with grade 2 is in the top 3. <code>fixed</code> and <code>broken</code> list the questions whose hit changed.</li>
        <li>The baseline file has the keys <code>questions_hash</code> (the <code>short_hash</code> of the question file), <code>embedder</code>, <code>chunker</code>, <code>chunks</code>, <code>k</code> (3), <code>rows</code>, <code>must_pass</code> and <code>cases</code>. Each case has <code>id</code>, <code>hit</code>, <code>first_rank</code> and <code>recall</code> (at k = 3). A change of the embedder or the chunker is a normal candidate, not a reason to fail.</li>
        <li>The tests make no network call. They build the T-017 fixture index with the fake embedder under <code>tmp_path</code>, at 20, 10 and 40 words.</li>
      </ol>`,
    acceptance: `
      <p>Criteria 2 to 9 use the T-017 fixture, the fake embedder and the questions of the lesson. The index has 20-word chunks unless the criterion says otherwise.</p>
      <ol>
        <li>Given the ranked list [a], [b], [c], [d] and the labels b = 2 and d = 1, recall@2 is 0.500, precision@2 is 0.500, the reciprocal rank at k = 4 is 0.500, and nDCG@4 with the ideal gains 2, 1 is 0.643. Given labels with no section, <code>recall_at_k</code> raises <code>ValueError</code>.</li>
        <li>Given q02 "What do I do if a tool arrives damaged?", the gains of the ranked list start 2, 1, 1, 2, 0, and the ideal list starts 2, 2, 1, 1, 0. At k = 3: recall 1.000, precision 1.000, reciprocal rank 1.000, DCG 3.131, IDCG 3.762 and nDCG 0.832. At k = 1: recall 0.500.</li>
        <li>Given q06 "What is the hotel limit for each night of a trip?", the first result is travel-expenses:1 ("the trip."). At k = 1: recall, precision, reciprocal rank and nDCG are 0. At k = 3: recall 1.000, precision 0.333, reciprocal rank 0.500 and nDCG 0.631.</li>
        <li>Given the 20-word index, the rows are: k = 1: 0.750, 0.833, 0.833, 0.833; k = 3: 1.000, 0.611, 0.917, 0.911; k = 5: 1.000, 0.400, 0.917, 0.931; k = 10: 1.000, 0.200, 0.917, 0.931 (recall, precision, MRR, nDCG). The skipped questions are q07 with the best score 0.927 and q08 with 0.447. The misses at k = 3 are none.</li>
        <li>Given two runs with a counting fake embedder, the first run makes 8 embedding calls and the second run makes 0.</li>
        <li>Given the 20-word baseline and the 10-word index (17 chunks), the candidate row at k = 3 is 0.917, 0.778, 1.000, 0.956, the miss at k = 3 is q02 with warranty-claims#how-to-claim, and the gate fails with exactly one reason: "recall@3 went down: 1.000 -> 0.917". <code>fixed</code> and <code>broken</code> are empty.</li>
        <li>Given the 20-word baseline and the 40-word index (6 chunks), the candidate row at k = 3 is 1.000, 0.444, 1.000, 0.978, and the gate passes.</li>
        <li>Given a fake run in which q01 is not a hit and recall@3 is equal to the baseline, the gate fails with one reason that names q01, and <code>broken</code> is ["q01"]. Given a baseline with another <code>questions_hash</code>, the gate fails with a reason that names the question file.</li>
        <li>Given a label with the section refund-policy#returns, the script stops and names q01 and that section.</li>
        <li>Given <code>--update-baseline</code> and a failed gate, the baseline file does not change.</li>
        <li>With the real embedder, milestone 4 records the rows, the skipped questions with their best scores, the misses and the first verdict in the handoff.</li>
        <li><code>pytest</code> passes with the network off. The tests of T-001 to T-018 pass without a change.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>The labels (guided).</strong> Write the 8 questions of the lesson in <code>samples/rag_questions.jsonl</code>. Label each question yourself before you run any search. Write a test that every label names a section of the fixture index.</li>
        <li><strong>The metrics (guided).</strong> Write <code>assistant/retrieval_metrics.py</code>. Write the tests for criteria 1, 2 and 3 first, and check the numbers on paper.</li>
        <li><strong>The eval and the gate (independent).</strong> Write <code>CachedEmbedder</code>, <code>scripts/retrieval_eval.py</code> and <code>compare_retrieval</code>. Write the tests for criteria 4 to 10. Build the 10-word and the 40-word index with <code>python -m assistant.ingest docs/ --embedder fake --chunk-words 10 --out DIR</code>.</li>
        <li><strong>The real run (independent).</strong> Run the eval on the real index with the local embedder. Save the first baseline with <code>--update-baseline</code>. Then build a real 40-word index and run the gate against it. Record both runs and your decision in <code>handoffs/T-019-handoff.md</code>.</li>
      </ol>
      <p class="muted">Cost: no Claude call. The real embedder runs locally and embeds 8 questions on the first run, and 0 on a run with the cache.</p>
      <p class="muted">Stretch, optional: add 4 questions of your own with labels, one of them with no answer in the documents. Which metric moves the most on the real index?</p>`,
    files: `
      <pre><code>project/
  assistant/
    rag.py                   # from T-018 (no change): load_index, retrieve_question
    gate.py                  # from T-016: add compare_retrieval (compare does not change)
    retrieval_metrics.py     # relevant, gain, recall_at_k, precision_at_k, reciprocal_rank, dcg, ndcg_at_k
    embedder.py              # from T-017: add CachedEmbedder
  scripts/
    retrieval_eval.py        # the eval, the gate and --update-baseline
  samples/
    rag_questions.jsonl      # the 8 questions with section labels
    retrieval_baseline.json  # the saved baseline run (milestone 4)
  .cache/
    query_vectors.json       # not in git
  tests/
    test_retrieval_metrics.py
    test_retrieval_eval.py   # the eval and the gate on the fixture index (fake)
  tickets/
    T-019.md                 # this ticket (generated)
  handoffs/
    T-019-handoff.md         # your handoff (template generated)</code></pre>
      <p>The question set. All questions are fictional.</p>
      <pre><code>{"id": "q01", "question": "How many days do I have to return an unused tool?", "relevant": {"refund-policy#return-window": 2}, "must_pass": true}
{"id": "q02", "question": "What do I do if a tool arrives damaged?", "relevant": {"refund-policy#damaged-items": 2, "warranty-claims#how-to-claim": 1}, "must_pass": true}
{"id": "q03", "question": "How fast is express delivery?", "relevant": {"delivery-times#express-delivery": 2}, "must_pass": false}
{"id": "q04", "question": "How long is the warranty on power tools?", "relevant": {"warranty-claims#warranty-length": 2}, "must_pass": false}
{"id": "q05", "question": "The VPN app does not connect on my laptop. What do I do?", "relevant": {"vpn-setup#connection-problems": 2, "vpn-setup#install-the-app": 1}, "must_pass": false}
{"id": "q06", "question": "What is the hotel limit for each night of a trip?", "relevant": {"travel-expenses#hotel-limit": 2}, "must_pass": false}
{"id": "q07", "question": "Do I pay for the delivery when I return a tool?", "relevant": {}, "must_pass": false}
{"id": "q08", "question": "How many vacation days do new employees get?", "relevant": {}, "must_pass": false}</code></pre>
      <p>The output of the gate for the 10-word candidate, with the fake embedder:</p>
      <pre><code>baseline:  chunker=fixed-words/20 chunks=11 recall@3=1.000 precision@3=0.611 mrr@3=0.917 ndcg@3=0.911
candidate: chunker=fixed-words/10 chunks=17 recall@3=0.917 precision@3=0.778 mrr@3=1.000 ndcg@3=0.956
misses at k=3: q02 warranty-claims#how-to-claim
fixed: []
broken: []
verdict: FAIL
- recall@3 went down: 1.000 -> 0.917</code></pre>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_metrics_match_the_hand_case</code></td><td>[a], [b], [c], [d]; b = 2, d = 1</td><td>0.500, 0.500, 0.500, nDCG@4 0.643</td></tr>
        <tr><td><code>test_recall_needs_a_relevant_section</code></td><td>Empty labels</td><td><code>ValueError</code></td></tr>
        <tr><td><code>test_ndcg_is_never_above_one</code></td><td>q02 at k = 1, 3, 5, 10</td><td>Every value ≤ 1; 0.832 at k = 3</td></tr>
        <tr><td><code>test_section_in_two_chunks_counts_once_for_recall</code></td><td>q01 at k = 3</td><td>recall 1.000, precision 0.667</td></tr>
        <tr><td><code>test_fragment_first_gives_half_reciprocal_rank</code></td><td>q06 at k = 1 and 3</td><td>0 and 0.500</td></tr>
        <tr><td><code>test_eval_rows_of_the_fixture</code></td><td>20-word index</td><td>The four rows of criterion 4</td></tr>
        <tr><td><code>test_questions_with_no_answer_are_skipped</code></td><td>q07, q08</td><td>Not in the means; best 0.927 and 0.447</td></tr>
        <tr><td><code>test_second_run_makes_no_embedding_call</code></td><td>Two runs, counting embedder</td><td>8, then 0</td></tr>
        <tr><td><code>test_cache_key_includes_the_model</code></td><td>Same question, two model names</td><td>Two cache entries</td></tr>
        <tr><td><code>test_gate_fails_lower_recall</code></td><td>Baseline 20, candidate 10 words</td><td>FAIL with one reason</td></tr>
        <tr><td><code>test_gate_passes_the_40_word_index</code></td><td>Baseline 20, candidate 40 words</td><td>PASS</td></tr>
        <tr><td><code>test_gate_fails_a_must_pass_miss</code></td><td>Fake run, q01 not a hit</td><td>FAIL; reason names q01; broken ["q01"]</td></tr>
        <tr><td><code>test_gate_fails_a_changed_question_file</code></td><td>Other <code>questions_hash</code></td><td>FAIL; reason names the file</td></tr>
        <tr><td><code>test_unknown_label_section_stops_the_eval</code></td><td>refund-policy#returns</td><td>Error names q01 and the section</td></tr>
        <tr><td><code>test_failed_gate_does_not_update_the_baseline</code></td><td><code>--update-baseline</code>, FAIL</td><td>The file does not change</td></tr>
      </table></div>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> no Claude call. The cache makes a second run free of embedding calls.</li>
        <li><strong>Speed:</strong> the fixture eval runs in less than one second, so it can run in every test run.</li>
        <li><strong>Validity:</strong> the eval uses the retrieval function of the service, and the labels survive a change of the chunks.</li>
        <li><strong>Reproducibility:</strong> the baseline names the question file hash, the embedder and the chunker.</li>
        <li><strong>Testability:</strong> the metrics are pure functions with hand-checked cases.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Compare the rows of the real index with the rows of the fixture. Which metric differs most, and why?</li>
        <li>Which questions are misses at k = 3 with the real embedder? Read the chunks: is it the chunk boundary, the embedder or the label?</li>
        <li>What are the best scores of q07 and q08 with the real embedder? What does this say about the minimum score of T-018?</li>
        <li>Is recall@3 the right number for the gate of this assistant? When would you gate on nDCG instead?</li>
        <li>How many questions do you need before a drop of one question is not the whole change? What would you add first?</li>
        <li>A new document adds a section that also answers q04. What happens to the metrics, and what must you change?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, the fixture rows, the real rows, the gate verdict).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001 to T-018 did not change.</li>
        <li>The eval calls <code>retrieve_question</code>. There is no second search.</li>
        <li>You can explain the four metrics, the counting rules for sections and chunks, and the three gate reasons.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the labels name sections and were written before the first run; the metrics are pure and match the hand cases; the eval uses the retrieval function of the service; the cache key includes the model; the gate follows T-016 and updates the baseline only after a pass; and how well your answers use your own measurements.</p>`
  }
};
