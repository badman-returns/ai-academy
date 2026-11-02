/*
 * Lesson 1.8 - Hallucination and grounding.
 * Ticket T-008 - Grounded answers: a FastAPI endpoint that cites its sources or says "I don't know".
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Worked examples (toy vectors with the dimensions money, it, shipping, people):
 *   Retrieval: question [0.9, 0.1, 0.2, 0] and refund-policy [0.8, 0, 0.3, 0] -> cosine 0.984.
 *   Retrieval miss: question [0.7, 0, 0.35, 0] -> refund-policy 0.995, warranty-claims 0.983.
 *   Toy answer model: softmax of the logits [1, 2, 0, 0.5, -1] -> 20.7%, 56.3%, 7.6%, 12.6%, 2.8%.
 *   With the source (+5 on "45 days"): [1, 2, 5, 0.5, -1] -> "45 days" 92.4%.
 *   At temperature 0.25 without the source: "30 days" 97.9%.
 * All facts about "Northwind Tools" are fictional. The prior logits are made up for teaching.
 * The interactive for this lesson is in 08-ix.js (id "l1-8-grounding"). Its documents and
 * question vectors are also the fixture of ticket T-008.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.8"] = {
  id: "1.8",
  topic: "t1",
  title: "Hallucination and grounding",
  objective: "Explain why a language model gives fluent answers that are not true, show how grounding (RAG) puts the facts into the prompt, build a grounded prompt with citations and an \"I don't know\" path, and name the ways a grounded system can still be wrong.",
  prerequisites: [
    "Lesson 1.1: the model predicts the next token from probabilities, and temperature changes these probabilities.",
    "Lesson 1.3: embeddings and cosine similarity. Retrieval in this lesson uses them.",
    "Lesson 1.4 helps: attention lets a token collect information from the earlier tokens in the prompt."
  ],
  covers: ["t1-hallucination"],
  whyItMatters: `
    <p>A language model always gives an answer in a fluent style. The style is the same when the answer is true and when it is not true.
    When the model states something that is not supported by facts or by the given sources, we call it a <strong>hallucination</strong>.</p>
    <p>For an application engineer, this is the most common reason why users stop trusting an AI feature. A support assistant that invents a refund rule, or a coding assistant that invents a function name, causes real cost.
    You cannot remove hallucination with a better prompt alone. You reduce it with system design: you give the model the right sources (<strong>grounding</strong>), you let it say "I don't know", and your code checks the citations.</p>
    <p>In an interview, "why do LLMs hallucinate, and how do you reduce it?" is a very common question. A good answer explains the cause from next-token prediction, then gives concrete design steps, and then says what grounding does not fix.</p>`,
  concepts: [
    { id: "l1-8-c-define", name: "Hallucination: a fluent answer that the facts or the given sources do not support" },
    { id: "l1-8-c-cause", name: "Why it occurs: the model predicts a likely continuation, not a checked fact" },
    { id: "l1-8-c-weights", name: "Knowledge in the weights: compressed, with a cutoff, and without your private data" },
    { id: "l1-8-c-grounding", name: "Grounding (RAG): retrieve the sources, put them in the prompt, then generate" },
    { id: "l1-8-c-abstain", name: "The \"I don't know\" path: an instruction to abstain and a minimum retrieval score" },
    { id: "l1-8-c-citations", name: "Citations: each claim names its source, and code checks the source ids" },
    { id: "l1-8-c-limits", name: "Grounding reduces hallucination but does not remove it: misses, stale sources, unfaithful use" },
    { id: "l1-8-c-temperature", name: "Low temperature makes answers consistent, not correct" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "The model always answers. Grounding gives it the page to read",
      blocks: [
        { type: "html", html: `
          <p>In lesson 1.1, you saw that a model makes text one token at a time. At each step, it computes a probability for each possible next token and picks one. The model does not look up a fact in a database. It continues the text in the most likely way.</p>
          <p>Most of the time, the most likely continuation is also true, because the training text had the fact many times. But sometimes the model does not have the fact:</p>
          <ul>
            <li>The fact is about your company, so it was never in the training text.</li>
            <li>The fact changed after the training data was collected.</li>
            <li>The fact was in the training text only a few times, so the model did not learn it well.</li>
          </ul>
          <p>In these cases, the model still continues the text. It gives the answer that <em>sounds</em> right: the typical number, the typical name, the typical function. This is a <strong>hallucination</strong>. The model does not lie on purpose. It has no separate signal that says "this is a guess".</p>
          <p><strong>Grounding</strong> changes the input, not the model. Before the model answers, your code finds the documents that have the answer and puts them into the prompt. Then the model can copy the fact from the prompt (attention, lesson 1.4) and name the source. This method is called <strong>retrieval-augmented generation (RAG)</strong>: retrieve first, then generate.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a closed-book exam and an open-book exam", html: `
          <p>Think of a student in an exam who must write an answer to every question.</p>
          <ul>
            <li><strong>Closed book (no grounding).</strong> The student does not remember the refund rule of a small company. A blank answer gets zero points, so the student writes "30 days", because many companies use 30 days. The handwriting looks just as sure as for a correct answer.</li>
            <li><strong>Open book (grounding).</strong> The teacher gives the student the right page. The student copies "45 days" and writes the page number next to it.</li>
            <li><strong>Permission to abstain.</strong> The teacher says: "If the answer is not on the page, write 'not on the page'. This answer gets points." Now the student does not need to guess.</li>
          </ul>` },
        { type: "diagram", caption: "A grounded request. Code retrieves the sources first. When no source has a good score, the service says \"I don't know\" and does not call the model. Code checks the citations of each answer.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="The question goes to retrieval. If the best score is below the minimum, the answer is I don't know and the model is not called. Otherwise the prompt gets the rules, the sources and the question. The model answers with source ids. Code checks the citations, then shows the answer with its sources.">
            <defs><marker id="l18a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="14" y="20" width="110" height="44" rx="8" class="d-box"/><text x="69" y="47" text-anchor="middle" class="d-bold">Question</text>
            <line x1="124" y1="42" x2="150" y2="42" class="d-line" marker-end="url(#l18a1)"/>
            <rect x="152" y="20" width="130" height="44" rx="8" class="d-box-info"/><text x="217" y="38" text-anchor="middle" class="d-bold">Retrieve top k</text><text x="217" y="55" text-anchor="middle" class="d-small">cosine (lesson 1.3)</text>
            <line x1="282" y1="42" x2="310" y2="42" class="d-line" marker-end="url(#l18a1)"/>
            <rect x="312" y="20" width="130" height="44" rx="8" class="d-box-warn"/><text x="377" y="38" text-anchor="middle" class="d-bold">Best score</text><text x="377" y="55" text-anchor="middle" class="d-small">at least the minimum?</text>
            <line x1="442" y1="42" x2="470" y2="42" class="d-line" marker-end="url(#l18a1)"/><text x="456" y="34" text-anchor="middle" class="d-small">yes</text>
            <rect x="472" y="20" width="154" height="44" rx="8" class="d-box-accent"/><text x="549" y="38" text-anchor="middle" class="d-bold">Prompt</text><text x="549" y="55" text-anchor="middle" class="d-small">rules + sources + question</text>
            <line x1="377" y1="64" x2="377" y2="108" class="d-line" marker-end="url(#l18a1)"/><text x="385" y="90" class="d-small">no</text>
            <rect x="312" y="110" width="130" height="44" rx="8" class="d-box-muted"/><text x="377" y="128" text-anchor="middle" class="d-bold">"I don't know"</text><text x="377" y="145" text-anchor="middle" class="d-small">no model call</text>
            <line x1="549" y1="64" x2="549" y2="108" class="d-line" marker-end="url(#l18a1)"/>
            <rect x="472" y="110" width="154" height="44" rx="8" class="d-box-info"/><text x="549" y="128" text-anchor="middle" class="d-bold">Model</text><text x="549" y="145" text-anchor="middle" class="d-small">answer + [source id]</text>
            <line x1="549" y1="154" x2="549" y2="198" class="d-line" marker-end="url(#l18a1)"/>
            <rect x="472" y="200" width="154" height="44" rx="8" class="d-box-good"/><text x="549" y="218" text-anchor="middle" class="d-bold">Check citations</text><text x="549" y="235" text-anchor="middle" class="d-small">ids must be retrieved</text>
            <line x1="472" y1="222" x2="444" y2="222" class="d-line" marker-end="url(#l18a1)"/>
            <rect x="312" y="200" width="130" height="44" rx="8" class="d-box"/><text x="377" y="218" text-anchor="middle" class="d-bold">Answer</text><text x="377" y="235" text-anchor="middle" class="d-small">with its sources</text>
            <text x="296" y="216" text-anchor="end" class="d-small">An id that was not retrieved:</text>
            <text x="296" y="232" text-anchor="end" class="d-small">mark the answer as unsupported.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The model does not know that it guesses.</strong> A student often feels unsure. A model has no reliable internal flag for "I made this up". Its fluent style does not change.</li>
            <li><strong>The page can be the wrong page.</strong> Retrieval can give the model an old or an unrelated document. Then the model copies a wrong fact and adds a citation. The answer looks even more trustworthy.</li>
            <li><strong>The model does not always copy.</strong> Even with the right page, a model can mix the page with what it learned in training, or state more than the page says.</li>
          </ul>` },
        { type: "interactive", id: "l1-8-grounding" },
        { type: "html", html: `
          <h3>What a hallucination looks like in an application</h3>
          <ul>
            <li><strong>An invented fact.</strong> A support assistant states a refund window, a price or a policy that no document contains.</li>
            <li><strong>An invented reference.</strong> A link, a paper title, a function name or a command option that does not exist, but has the right shape.</li>
            <li><strong>A wrong citation.</strong> The answer names a source, but the source does not say what the answer says.</li>
            <li><strong>A wrong summary.</strong> A summary of a document adds a detail that is not in the document, or changes a number.</li>
          </ul>
          <p>All four have the same cause: the model gives the most likely text, and nothing in the system checks it against a source. Levels 2 and 3 show the checks.</p>` }
      ],
      checks: [
        { id: "l1-8-L1-a", type: "mcq",
          q: "A model states a refund window of 30 days for a company whose policy says 45 days. The policy was never in its training data. What is the best explanation?",
          options: [
            "The model has a bug in its tokenizer.",
            "The model looked up the policy in a database, and the database was wrong.",
            "The model continued the text with a likely answer, because many policies use 30 days. It had no fact to copy and no signal that it guessed.",
            "The model knew the correct answer but chose a wrong one on purpose."
          ],
          correct: 2,
          explain: "A model predicts likely tokens. It has no database. When the fact is not in its weights and not in the prompt, the most likely continuation is the typical answer. In the interactive, \"30 days\" has 56.3% without grounding." },
        { id: "l1-8-L1-b", type: "mcq",
          q: "What does grounding (RAG) change?",
          options: [
            "It retrains the model on the company documents.",
            "It puts the relevant documents into the prompt before the model answers, so the model can copy the facts and name the source.",
            "It sets the temperature to 0, so the model cannot make mistakes.",
            "It removes the tokens that are not true from the answer."
          ],
          correct: 1,
          explain: "Grounding changes the input, not the weights. Code retrieves the documents and puts them into the prompt. Retraining is fine-tuning (lesson 1.6). Temperature 0 makes the answer consistent, not correct." },
        { id: "l1-8-L1-c", type: "recall",
          q: "Explain to a product manager in three sentences why an AI assistant sometimes invents facts, and what the team can do about it.",
          answer: "The model predicts the most likely next words, so when it does not have a fact, it still gives a fluent and typical answer. It has no reliable signal that tells it that it guessed. The team can retrieve the right documents and put them into the prompt, let the model say \"I don't know\", and check in code that each answer cites a retrieved source." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Build the grounded request and check it in code",
      blocks: [
        { type: "html", html: `
          <h3>The parts of a grounded request</h3>
          <p>A grounded request has four parts. Your code builds all of them. The model only reads them.</p>
          <ol>
            <li><strong>Retrieval.</strong> Compute the cosine of the question vector and each document vector (lesson 1.3). Keep the top k documents with a score of at least a minimum score.</li>
            <li><strong>An "I don't know" path in code.</strong> When no document passes the filter, return "I don't know" and do not call the model. This costs nothing and cannot hallucinate.</li>
            <li><strong>The prompt.</strong> A system prompt with the rules, then each source in a tag with its id, then the question. Put the sources before the question. Anthropic's guidance for long prompts gives the same advice.</li>
            <li><strong>A citation check in code.</strong> Find each source id in the answer. Each id must be one of the retrieved ids. An answer with no citation, or with an unknown id, is <em>unsupported</em>.</li>
          </ol>` },
        { type: "code", lang: "text", code:
`System: Answer only from the sources. Cite the source id in square brackets.
        If the sources do not contain the answer, say "I don't know".

User:   <source id="refund-policy">
        You can return an unused tool within 45 days of delivery for a full refund.
        </source>
        Question: How many days do I have to return a tool?

Model:  You can return an unused tool within 45 days [refund-policy].` },
        { type: "html", html: `
          <p>A software comparison: the model is like a function that formats an answer. Retrieval is the database query, and the citation check is the validation of the output. You do not trust an unvalidated output from any other service, so do not trust it from a model.</p>` },
        { type: "worked", title: "Worked example: retrieval with the toy vectors",
          intro: "The toy vectors have four dimensions: money, it, shipping and people. The question \"How many days do I have to return a tool?\" has the vector q = [0.9, 0.1, 0.2, 0]. The document refund-policy has d = [0.8, 0, 0.3, 0]. All data is fictional.",
          steps: [
            { html: "Dot product: 0.9 × 0.8 + 0.1 × 0 + 0.2 × 0.3 + 0 × 0 = 0.72 + 0.06 = <strong>0.78</strong>." },
            { html: "Lengths: |q| = √(0.81 + 0.01 + 0.04) = √0.86 = 0.927. |d| = √(0.64 + 0.09) = √0.73 = 0.854." },
            { html: "Cosine: 0.78 / (0.927 × 0.854) = <strong>0.984</strong>. This is above a minimum score of 0.5, and it is the highest score, so with k = 1 the prompt gets refund-policy." },
            { faded: true, html: "Your turn. The question \"How long is the warranty on power tools?\" has q = [0.7, 0, 0.35, 0]. Compute its cosine with refund-policy [0.8, 0, 0.3, 0] and with warranty-claims [0.6, 0.1, 0.4, 0]. Which document does k = 1 retrieve?",
              answer: "|q| = √0.6125 = 0.783. Refund-policy: 0.665 / (0.783 × 0.854) = 0.995. Warranty-claims: 0.56 / (0.783 × 0.728) = 0.983. So k = 1 retrieves refund-policy, the wrong document. The answer is not in the prompt. In the interactive, set k = 2 and the warranty answer gets 97.6%. A retrieval miss is one of the main causes of wrong answers in a RAG system." }
          ] },
        { type: "worked", title: "Worked example: what the source does to the probabilities",
          intro: "The interactive uses a toy model. For the refund question, the made-up logits of the answers \"14 days\", \"30 days\", \"45 days\", \"60 days\" and \"I don't know\" are [1, 2, 0, 0.5, −1]. They stand for what the weights \"remember\": many companies use 30 days. A source in the prompt that states an answer adds 5 to the logit of that answer.",
          steps: [
            { html: "Without grounding: softmax([1, 2, 0, 0.5, −1]) = <strong>[20.7%, 56.3%, 7.6%, 12.6%, 2.8%]</strong>. The most likely answer is \"30 days\". It is wrong, and the correct answer has only 7.6%." },
            { html: "With the source: the logit of \"45 days\" becomes 0 + 5 = 5. softmax([1, 2, 5, 0.5, −1]) gives \"45 days\" <strong>92.4%</strong>. The model can copy the fact and cite refund-policy." },
            { faded: true, html: "Your turn. Without grounding, set the temperature to 0.25. The logits are divided by 0.25 before the softmax. What is the probability of \"30 days\" now? Did the hallucination go away?",
              answer: "The logits become [4, 8, 0, 2, −4], and \"30 days\" gets 97.9%. The model now gives the wrong answer almost every time, with the same fluent style. Low temperature makes the answer consistent. It does not make it correct." }
          ] },
        { type: "note", kind: "fact", title: "Grounding features in the Claude API", html: `
          <ul>
            <li><strong>Citations.</strong> The Claude API can take documents as document content blocks with citations switched on. Then the response gives citation objects that point to the exact text in the document that supports each claim. See "Citations" in the resources.</li>
            <li><strong>Prompt guidance.</strong> Anthropic's page "Reduce hallucinations" lists methods such as: allow the model to say "I don't know", ask for direct quotes first for long documents, and verify each claim with a citation. See the resources.</li>
            <li>This lesson and ticket T-008 use plain text tags and your own citation check. Then you can see each step. The API feature does the same job with less code.</li>
          </ul>` },
        { type: "worked", title: "Worked example: a citation check",
          intro: "Retrieval gave the ids refund-policy and warranty-claims. The model answered: \"You can return an unused tool within 45 days [refund-policy]. Express delivery takes 1 working day [delivery-times].\"",
          steps: [
            { html: "Find the ids in square brackets: <strong>refund-policy</strong> and <strong>delivery-times</strong>." },
            { html: "Compare with the retrieved ids. refund-policy is retrieved. delivery-times is <strong>not</strong> retrieved. The model did not see that document in this prompt, so the second sentence is not grounded, even if it happens to be true." },
            { html: "Result: mark the answer as unsupported. Your code can remove the sentence, ask the model again, or show the answer with a warning. Log it in all cases." },
            { faded: true, html: "Your turn. The model answers \"You can return an unused tool within 45 days.\" with no citation, and the source refund-policy is in the prompt. Is this answer grounded? What must your code do?",
              answer: "The fact matches the source, but the code cannot prove it: the answer has no citation. A simple and safe rule is: no citation means unsupported. The service can ask the model once more with the citation rule, or return the answer with the status \"unsupported\". A stronger check compares the claim with the source text (level 3)." }
          ] },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>The toy model adds a fixed bonus of 5 when a source states an answer. A real model copies facts from the prompt through attention (lesson 1.4), and the effect is strong but not fixed. A real model can also ignore a source or mix it with what it learned in training. Level 3 shows how to measure this.</p>` }
      ],
      checks: [
        { id: "l1-8-L2-a", type: "mcq",
          q: "Retrieval returned the ids refund-policy and vpn-setup. The answer cites [refund-policy] and [warranty-claims]. What must the citation check do?",
          options: [
            "Accept the answer, because both ids are real document ids in the index.",
            "Mark the answer as unsupported, because warranty-claims was not in the prompt, so the model could not read it.",
            "Accept the answer, because at least one citation is correct.",
            "Delete refund-policy from the index."
          ],
          correct: 1,
          explain: "A citation is valid only when the id was retrieved for this request. warranty-claims exists in the index, but the model did not see it in this prompt. So the claim with that citation comes from the weights, not from a source." },
        { id: "l1-8-L2-b", type: "mcq",
          q: "No document has a cosine score above the minimum score for a question. What is the best behavior of the service?",
          options: [
            "Call the model without sources and return its answer.",
            "Lower the minimum score until a document passes.",
            "Return \"I don't know\" without a model call, and log the question so the team can add a document.",
            "Retry the same request three times."
          ],
          correct: 2,
          explain: "Without a source, the model can only answer from its weights, which is where hallucination comes from. The code path costs nothing and cannot invent a fact. The log shows which documents are missing." },
        { id: "l1-8-L2-c", type: "recall",
          q: "Why must the citation check run in code and not only in the prompt?",
          answer: "The prompt rule \"cite your sources\" makes citations likely, not certain. The model can still invent an id, cite a document that was not retrieved, or give no citation. Only code can compare each cited id with the retrieved ids every time, and mark or block an unsupported answer." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why training causes hallucination, and where grounding still fails",
      blocks: [
        { type: "html", html: `
          <h3>Why training produces hallucination</h3>
          <ul>
            <li><strong>Pretraining rewards a likely continuation.</strong> The training task is "predict the next token" (lesson 1.6, "Pretraining and post-training"). For a fact that is in the text many times, the likely continuation is the fact. For a fact that is in the text only once or twice, the model learns the <em>shape</em> of the answer ("a date", "a number of days") better than the value.</li>
            <li><strong>Tests reward a guess.</strong> Research (Kalai et al., 2025, "Why Language Models Hallucinate") argues two points. First, some errors in pretraining are expected for facts that appear rarely. Second, many benchmarks give the same score (zero) to "I don't know" and to a wrong answer. A model that is trained and tested on such benchmarks learns that a guess is better than an abstention.</li>
            <li><strong>Knowledge has a cutoff.</strong> The weights hold what was in the training data. Facts that changed later, and your private data, are not there.</li>
            <li><strong>Sampling adds variation.</strong> With a flat distribution, as in the vacation question of the interactive, each run can give a different invented number. This is a useful symptom: if repeated runs disagree, the model probably does not know.</li>
          </ul>
          <p>Researchers often separate two kinds. An answer that <strong>contradicts</strong> the given source is one kind. An answer that adds a claim that the source <strong>does not contain</strong> is the other kind. Grounding helps with the second kind only when the right source is in the prompt. Both kinds need a check against the source.</p>` },
        { type: "html", html: `
          <h3>Where a grounded system still fails</h3>
          <div class="table-wrap"><table>
            <tr><th>Failure</th><th>Symptom</th><th>Check</th></tr>
            <tr><td>Retrieval miss</td><td>The right document exists, but it is not in the top k.</td><td>Recall@k on a set of questions with known documents (Topic 3).</td></tr>
            <tr><td>Stale index</td><td>The answer cites a source, but the source is an old version.</td><td>Store a version or an update date for each chunk. Re-index when a document changes.</td></tr>
            <tr><td>Unfaithful use</td><td>The source is in the prompt, but the answer contradicts it or adds to it.</td><td>Faithfulness: check each claim against the cited text (Topic 5).</td></tr>
            <tr><td>Too many sources</td><td>The right source is in the prompt, among many others, and the model does not use it.</td><td>Measure answers with k = 3, 5, 10. Rerank and keep fewer, better sources.</td></tr>
            <tr><td>Conflicting sources</td><td>Two sources say different things.</td><td>Tell the model to name the conflict. Prefer the newer source in code.</td></tr>
          </table></div>
          <p>For "too many sources": research (Liu et al., 2023, "Lost in the Middle") found that models used information at the start or the end of a long context better than information in the middle. Lesson 1.7, "Context window and KV cache", explains what a long context costs.</p>` },
        { type: "worked", title: "Worked example: measure the \"I don't know\" trade-off",
          intro: "A small test set has 10 questions: 7 questions with an answer in the documents and 3 questions without one. The counts below are made up for this example. They show the method, not a real result.",
          steps: [
            { html: "With a minimum score of 0.5: 6 of the 7 answerable questions get a correct, cited answer, and 1 gets a wrong answer. Of the 3 unanswerable questions, 2 get \"I don't know\" and 1 gets an invented answer. Wrong or invented answers: <strong>2 of 10</strong>." },
            { html: "With a minimum score of 0.8: 5 of the 7 answerable questions get a correct answer, 0 get a wrong answer, and 2 get \"I don't know\". All 3 unanswerable questions get \"I don't know\". Wrong or invented answers: <strong>0 of 10</strong>, but 2 answerable questions get no answer." },
            { faded: true, html: "Your turn. For each setting, compute the answer rate on the answerable questions and the abstain rate on the unanswerable questions. Which setting is better for a refund assistant, and which is better for a brainstorming tool?",
              answer: "Minimum 0.5: answer rate 7 / 7 = 100% (6 correct, 1 wrong), abstain rate 2 / 3 = 67%. Minimum 0.8: answer rate 5 / 7 = 71%, abstain rate 3 / 3 = 100%. A refund assistant needs few wrong answers, so 0.8 is better there: a wrong refund rule costs more than \"I don't know\". A brainstorming tool can accept more risk for more answers. Always report both numbers, not one." }
          ] },
        { type: "code", lang: "python", code:
`import re

IDK = "I don't know"
CITATION = re.compile(r"\\[([a-z0-9-]+)\\]")

def grounded_answer(question, sources, ask, min_score=0.5):
    """sources: list of (doc_id, score, text), highest score first.
    ask(system, user) returns the model text. Tests pass a fake ask."""
    kept = [s for s in sources if s[1] >= min_score]
    if not kept:  # no model call: this path cannot hallucinate
        return {"status": "no_sources", "answer": IDK, "citations": []}
    system = ("Answer only from the sources. "
              "Cite the source id in square brackets. "
              f'If the sources do not contain the answer, say "{IDK}".')
    user = "".join(f'<source id="{i}">\\n{t}\\n</source>\\n'
                   for i, _, t in kept)
    user += f"Question: {question}"
    answer = ask(system, user)
    cited = CITATION.findall(answer)
    if IDK.lower() in answer.lower() and not cited:
        return {"status": "abstained", "answer": answer, "citations": []}
    known = {i for i, _, _ in kept}
    ok = bool(cited) and all(c in known for c in cited)
    status = "answered" if ok else "unsupported"
    return {"status": status, "answer": answer, "citations": cited}

fake = lambda system, user: "Within 45 days [refund-policy]."
refund = [("refund-policy", 0.984, "45 days.")]
vacation = [("refund-policy", 0.093, "45 days.")]
print(grounded_answer("How many days?", refund, fake)["status"])    # answered
print(grounded_answer("Vacation days?", vacation, fake)["status"])  # no_sources` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This code shows the order of the checks. It has no retry, no logging, no limit on the prompt size, and it treats "no citation" as unsupported. Ticket T-008 asks you to build a complete version behind a FastAPI endpoint, with tests and a fake model.</p>` },
        { type: "html", html: `
          <h3>Other ways to reduce hallucination</h3>
          <ul>
            <li><strong>Tools.</strong> For live data (an order status, a stock level), a tool call that reads the database is grounding too. Topic 4 covers tool calling.</li>
            <li><strong>Quotes first.</strong> For a long document, ask the model to copy the exact sentences that answer the question, then to answer from these quotes only. Code can check that each quote is in the document.</li>
            <li><strong>Self-consistency.</strong> Ask the same question several times. If the answers disagree, treat the answer as uncertain. This costs one call for each run.</li>
            <li><strong>Evals.</strong> Measure faithfulness, citation accuracy and the abstain rate on a fixed set of questions after each prompt or model change (Topic 5).</li>
            <li><strong>Reasoning.</strong> Lesson 1.9, "Reasoning models and thinking tokens", looks at when extra thinking helps and what it costs. Thinking does not add facts that are not in the weights or in the prompt.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-8-L3-a", type: "mcq",
          q: "A team sets the temperature to 0 and says: \"Now the model cannot hallucinate.\" What is wrong with this statement?",
          options: [
            "Nothing. Temperature 0 removes all hallucinations.",
            "Temperature 0 picks the most likely answer every time. If the most likely answer is wrong, the model gives the same wrong answer every time.",
            "Temperature 0 makes the model slower, so it has less time to check facts.",
            "Temperature 0 removes the sources from the prompt."
          ],
          correct: 1,
          explain: "Temperature changes how the model picks from the probabilities. It does not add facts. In the interactive, without grounding at temperature 0.25, the wrong \"30 days\" gets 97.9%. Consistent is not the same as correct." },
        { id: "l1-8-L3-b", type: "mcq",
          q: "You raise the minimum retrieval score from 0.5 to 0.8. What do you expect, and how do you check it?",
          options: [
            "Fewer invented answers and more \"I don't know\" answers, also for some questions that have an answer. Measure the answer rate and the abstain rate on a test set.",
            "More correct answers on every question, with no cost.",
            "No change, because the minimum score only affects speed.",
            "More hallucinations, because the model gets fewer sources."
          ],
          correct: 0,
          explain: "A higher minimum score sends fewer weak sources, so the service abstains more often. This removes some invented answers but also blocks some answerable questions. Only a test set with both kinds of questions shows if the trade is good for your product." },
        { id: "l1-8-L3-c", type: "recall",
          q: "Name four ways a grounded system can still give a wrong answer, and one check for each.",
          answer: "Retrieval miss: measure recall@k on questions with known documents. Stale index: store a version or update date and re-index on change. Unfaithful use: check each claim against the cited text (faithfulness). Too many or conflicting sources: measure with different k, rerank, and tell the model to name conflicts. Also: an invented citation, which the citation check in code catches." }
      ]
    }
  ],

  debugging: [
    { id: "l1-8-dbg-1", title: "The assistant cites a document that it did not retrieve",
      symptom: "The citation check marks about one answer in ten as unsupported. All of them cite the same id.",
      evidence: "WARN unsupported answer: cited ['vpn-setup'], retrieved ['refund-policy', 'warranty-claims']",
      hints: [
        "Where else in the prompt does the text \"vpn-setup\" appear?",
        "Look at the example answer in your system prompt."
      ],
      answer: "The system prompt has an example answer that cites [vpn-setup]. The model copies the id from the example. Fix: use a placeholder id that can never be a real id in examples, for example [example-id], or remove the example. Keep the citation check in code: it found this problem." },
    { id: "l1-8-dbg-2", title: "The assistant says \"I don't know\" to questions that the FAQ answers",
      symptom: "After a change last week, most questions get \"I don't know\". The FAQ documents did not change.",
      evidence: "INFO no_sources: best score 0.21 (minimum 0.50) for 'How many days do I have to return a tool?'",
      hints: [
        "Which part of the request changed last week: the questions, the documents, or the model that makes the vectors?",
        "Lesson 1.3: can you compare vectors from two different embedding models?"
      ],
      answer: "The service now makes the question vectors with a new embedding model, but the index still has document vectors from the old model. Cosine scores between the two spaces have no meaning, so they are low. Fix: re-embed all documents with the same model as the questions, and store the model id with the index. Add a start-up check that the two ids are equal." },
    { id: "l1-8-dbg-3", title: "The answer cites the right document but states an old rule",
      symptom: "Users report that the assistant says 30 days for refunds. The refund policy page says 45 days. The answer cites [refund-policy].",
      evidence: "answer: 'You can return an unused tool within 30 days [refund-policy].'  index chunk refund-policy: '... within 30 days of delivery ...'",
      hints: [
        "Compare the text in the index with the text on the current policy page.",
        "When was the index built, and what happens when a document changes?"
      ],
      answer: "The index was built before the policy changed and was not rebuilt. The model copied the stale chunk correctly, so the citation check passed. Fix: re-index when a document changes, store a version or update date for each chunk, and add a test that compares the indexed text with the source. Switch on the stale index option in the interactive to see this case." }
  ],

  recall: [
    { id: "l1-8-r1", q: "What is a hallucination?", a: "A fluent answer that the facts or the given sources do not support: an invented fact, reference, citation or detail. It has the same style as a correct answer." },
    { id: "l1-8-r2", q: "Why do language models hallucinate?", a: "They predict a likely continuation, not a checked fact. When the fact is not in the weights or in the prompt, the likely continuation is a typical answer. Training and many tests reward a guess more than \"I don't know\". The weights also have a cutoff and no private data." },
    { id: "l1-8-r3", q: "What is grounding, and what does RAG stand for?", a: "Grounding puts the relevant sources into the prompt, so the model can copy facts and cite them. RAG is retrieval-augmented generation: retrieve the documents first, then generate the answer from them." },
    { id: "l1-8-r4", q: "Name the four parts of a grounded request.", a: "Retrieval (top k with a minimum score), an \"I don't know\" path in code when nothing passes, a prompt with rules, tagged sources and the question, and a citation check in code that each cited id was retrieved." },
    { id: "l1-8-r5", q: "Does temperature 0 stop hallucination?", a: "No. It picks the most likely answer every time. If that answer is wrong, it is wrong every time. Low temperature makes answers consistent, not correct." },
    { id: "l1-8-r6", q: "Name four ways a grounded system can still be wrong.", a: "Retrieval miss, stale index, unfaithful use of the source (contradiction or addition), too many or conflicting sources. Also an invented citation." },
    { id: "l1-8-r7", q: "What does a higher minimum retrieval score change?", a: "Fewer weak sources reach the model, so the service abstains more often. This reduces invented answers but also blocks some answerable questions. Measure the answer rate and the abstain rate on a test set." }
  ],

  interview: [
    { q: "Why do LLMs hallucinate?",
      outline: "Next-token prediction gives the likely continuation, not a verified fact. For facts that are rare in the training data, absent (private data) or newer than the cutoff, the model produces the typical shape of an answer. Training and benchmarks often score \"I don't know\" like a wrong answer, so models learn to guess. No reliable internal confidence signal; the style does not change. Sampling adds variation, and repeated runs that disagree are a symptom." },
    { q: "How do you reduce hallucinations in a production assistant?",
      outline: "Grounding: retrieve with a minimum score and put tagged sources before the question. Allow and instruct \"I don't know\", and return it in code without a model call when nothing is retrieved. Require citations and validate them in code against the retrieved ids. Use tools for live data. Quotes first for long documents. Measure faithfulness, citation accuracy and abstain rate in evals on every change. Show sources to the user." },
    { q: "Does RAG solve hallucination?",
      outline: "No, it reduces it. Failure modes: retrieval miss (measure recall@k), stale index (versioning, re-index), unfaithful use (faithfulness checks), too many or conflicting sources (rerank, fewer sources, name conflicts), invented citations (validate in code). A citation can make a wrong answer look more trustworthy." },
    { q: "How would you measure whether a change reduced hallucinations?",
      outline: "A fixed test set with answerable and unanswerable questions and known source documents. Metrics: correct and cited answers, wrong answers, abstain rate on unanswerable questions, answer rate on answerable ones, citation accuracy, faithfulness of each claim. Code checks where possible, a calibrated LLM judge for faithfulness. Compare before and after; report the trade-off, not one number." },
    { q: "Your RAG assistant now says \"I don't know\" to most questions. How do you debug it?",
      outline: "Look at the logged retrieval scores. Low scores for all questions point to a vector mismatch: query and document embeddings from different models or versions, or a changed normalization. Check the index build date and model id. Check the minimum score and the k. Then run recall@k on known questions. Fix the root cause, then add a start-up check for the embedding model id." }
  ],

  misconceptions: [
    { wrong: "A model hallucinates only when it is broken or badly trained.", right: "Hallucination follows from next-token prediction. Every model can give a likely but false answer when it does not have the fact." },
    { wrong: "The model knows when it guesses, so it will say so if you ask.", right: "A model has no reliable internal signal for a guess. Its style is the same. Give it permission to abstain, and check its claims in code." },
    { wrong: "Temperature 0 removes hallucinations.", right: "Temperature 0 makes the answer consistent. A wrong most-likely answer then comes back every time." },
    { wrong: "RAG removes hallucinations.", right: "RAG reduces them. Retrieval misses, stale sources, unfaithful use and invented citations still occur and need checks." },
    { wrong: "An answer with a citation is correct.", right: "A citation can point to a stale source, or to a source that does not say what the answer says. Check that the id was retrieved, and measure faithfulness." },
    { wrong: "More retrieved documents always give better answers.", right: "Weak or many sources can distract the model and cost more tokens. Measure with different k, and rerank." },
    { wrong: "Fine-tuning on company documents is the best way to add company facts.", right: "Fine-tuning changes behavior and style well, but it does not store facts reliably and cannot cite them. For facts that change, retrieval is easier to update and to check." }
  ],

  resources: [
    { title: "Deep Dive into LLMs like ChatGPT", by: "Andrej Karpathy", kind: "Video, long", url: "https://www.youtube.com/watch?v=7xTGNNLPyMI",
      when: "Watch the part on hallucinations after level 1.",
      why: "Explains how hallucinations come from training on text, and how training data with \"I don't know\" answers and with tool use (web search) reduces them.",
      note: "Use the chapter list on YouTube to find the part on hallucinations. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "How does the video explain why the model invents an answer about a person it does not know?",
        "Which two methods does the video show to reduce hallucinations?",
        "How does the video describe the difference between knowledge in the weights and information in the context window?"
      ] },
    { title: "Reduce hallucinations", by: "Anthropic (Claude Platform Docs)", kind: "Documentation", url: "https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
      when: "Read after level 2.",
      why: "Anthropic's list of prompt and system methods to reduce hallucinations with Claude.",
      watchFor: [
        "Which methods on the page match the four parts of a grounded request in level 2?",
        "What does the page say about direct quotes for long documents?",
        "Which method on the page uses more than one model call?"
      ] },
    { title: "Citations", by: "Anthropic (Claude Platform Docs)", kind: "Documentation", url: "https://platform.claude.com/docs/en/build-with-claude/citations",
      when: "Read after level 2, before ticket T-008.",
      why: "The API feature that returns citations to the exact text of the documents that you send.",
      watchFor: [
        "How do you send a document with citations switched on?",
        "What does a citation object in the response contain?",
        "How does the API feature compare with the citation check that you write in T-008?"
      ] },
    { title: "Introducing Contextual Retrieval", by: "Anthropic", kind: "Article", url: "https://www.anthropic.com/news/contextual-retrieval",
      when: "Read after level 3. Topic 3 uses it again.",
      why: "Shows why retrieval misses occur when a chunk loses its context, and one method to reduce them.",
      watchFor: [
        "What information does a chunk lose when it is cut from its document?",
        "Which two search methods does the article combine?",
        "How does the article measure retrieval failures?"
      ] },
    { title: "Why Language Models Hallucinate", by: "Kalai et al. (2025)", kind: "Paper, optional", url: "https://arxiv.org/abs/2509.04664",
      when: "Optional, after level 3. Read the abstract and the introduction.",
      why: "A statistical explanation of why pretraining produces some errors, and why tests that score \"I don't know\" as zero reward a guess.",
      watchFor: [
        "Which kind of facts does the paper link to errors in pretraining?",
        "What change to evaluation does the paper suggest?"
      ] },
    { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", by: "Lewis et al. (2020)", kind: "Paper, optional", url: "https://arxiv.org/abs/2005.11401",
      when: "Optional, after level 3. Read the abstract and the introduction.",
      why: "The paper that named retrieval-augmented generation.",
      watchFor: [
        "Which two kinds of memory does the paper combine?",
        "What reasons does the introduction give for adding retrieval to a language model?"
      ] }
  ],

  summary: `
    <ul>
      <li>A hallucination is a fluent answer that the facts or the given sources do not support. It has the same style as a correct answer.</li>
      <li>It occurs because the model predicts a likely continuation. Without the fact in the weights or the prompt, the likely answer is a typical guess.</li>
      <li>Grounding (RAG) retrieves the relevant documents and puts them into the prompt, so the model can copy facts and cite them.</li>
      <li>A grounded request has four parts: retrieval with a minimum score, an "I don't know" path in code, a prompt with rules and tagged sources, and a citation check in code.</li>
      <li>Low temperature makes answers consistent, not correct.</li>
      <li>Grounding reduces hallucination but does not remove it: retrieval misses, stale sources, unfaithful use and invented citations need their own checks.</li>
      <li>Measure the answer rate and the abstain rate together on a test set with answerable and unanswerable questions.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer why an LLM invents facts, using next-token probabilities. Then draw the grounded request: retrieval, the \"I don't know\" path, the prompt, the citation check. Name three ways it can still fail. Compute the cosine 0.984 of the refund question by hand. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-008"]
};

/* ====================================================================== T-008 */
window.ACADEMY.tickets["T-008"] = {
  id: "T-008",
  title: "Grounded answers: a FastAPI endpoint that cites its sources or says \"I don't know\"",
  lesson: "1.8",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "Two sittings. Most people need 2 to 3 hours. The optional stretch needs a third, short session.",
  fields: {
    objective: `
      <p>Write a grounding module, <code>assistant/grounding.py</code>, and the first FastAPI endpoint of the assistant, <code>POST /ask</code> in <code>assistant/api.py</code>.
      The endpoint retrieves FAQ documents with your T-003 vector functions, returns "I don't know" without a model call when no document passes the minimum score, sends a grounded prompt to Claude with the T-001 client, and checks each citation in the answer.
      Prove each behavior with tests that use a fake model and are named after the properties they check.</p>
      <p><strong>Real-world problem.</strong> An internal assistant that invents a refund rule or a policy causes real cost, and users stop trusting it.
      Teams that ship assistants make each answer traceable to a source and make "I don't know" a normal, tested result. This ticket builds that pattern in a small form that you can test offline.</p>`,
    context: `
      <p>This ticket continues the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". It is a first, small step toward phase 2: it adds the first FastAPI endpoint and a small, offline form of document search.
      Phase 2 replaces the toy vectors with a real embedding model and a vector store. This ticket keeps the toy vectors, so the tests need no embedding service.</p>
      <p>This ticket depends on T-001 (the project, pytest, and the Claude client in <code>assistant/llm.py</code>) and on T-003 (<code>assistant/vectors.py</code> with <code>cosine</code> and <code>top_k</code>).
      It does not need T-004 or T-005. It does not need the tickets of lessons 1.6, 1.7 or 1.9.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.8, levels 1 and 2 complete. Level 3 helps for milestones 3 and 4.</li>
        <li>T-001 done: <code>assistant/llm.py</code> can send a system prompt and one user message and return the text and the token counts.</li>
        <li>T-003 done: <code>assistant/vectors.py</code> has <code>cosine</code> and <code>top_k</code>, and its tests pass.</li>
        <li>New packages: <code>fastapi</code>, <code>uvicorn</code> (to run the server) and <code>httpx</code> (for the FastAPI <code>TestClient</code>). Add them to <code>pyproject.toml</code>.</li>
        <li>The live call and the stretch only: <code>ANTHROPIC_API_KEY</code> in the environment.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>load_corpus(path) -&gt; Corpus</code> loads <code>data/grounding_faq.json</code> and checks that every vector has the length of <code>dimensions</code>.</li>
        <li><code>retrieve(corpus, vector, k=2, min_score=0.5) -&gt; list[Source]</code> uses <code>top_k</code> from T-003 and keeps only the sources with a score of at least <code>min_score</code>. A <code>Source</code> has <code>id</code>, <code>title</code>, <code>text</code> and <code>score</code>.</li>
        <li><code>build_prompt(question, sources) -&gt; tuple[str, str]</code> returns the system prompt and the user message. The system prompt states three rules: answer only from the sources, cite each source id in square brackets, say "I don't know" when the sources do not contain the answer. The user message has each source in a <code>source</code> tag with an <code>id</code> attribute, then the question.</li>
        <li><code>parse_citations(answer) -&gt; list[str]</code> returns the ids in square brackets, in order, without duplicates.</li>
        <li><code>grounded_answer(question, vector, corpus, ask, k=2, min_score=0.5) -&gt; GroundedAnswer</code> returns one of four statuses:
          <code>no_sources</code> (nothing retrieved, no model call), <code>abstained</code> (the model said "I don't know"), <code>answered</code> (at least one citation, and every cited id was retrieved) or <code>unsupported</code> (no citation, or an id that was not retrieved).</li>
        <li><code>POST /ask</code> takes <code>{"question": str, "vector": list[float], "k": int = 2, "min_score": float = 0.5}</code> and returns <code>{"status", "answer", "citations", "sources": [{"id", "score"}]}</code> with the scores at 3 decimals. <code>GET /health</code> returns <code>{"status": "ok"}</code>.</li>
        <li><code>python -m assistant.grounding refund-window</code> loads the fixture, finds the query with that id, prints the retrieved sources with their scores, and prints the prompt. With <code>--live</code>, it also sends the prompt to Claude and prints the status and the answer.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>grounding.py</code> does not import <code>anthropic</code> or <code>fastapi</code>. It gets the model as a function <code>ask(system: str, user: str) -&gt; str</code>.</li>
        <li><code>api.py</code> builds <code>ask</code> from the T-001 client in <code>assistant/llm.py</code> through a FastAPI dependency. Tests replace this dependency with a fake (<code>app.dependency_overrides</code>).</li>
        <li>Pydantic models for the request and the response. A vector of the wrong length gives HTTP 422 with a message that names both lengths. <code>k</code> must be 1 to 10 and <code>min_score</code> must be 0 to 1.</li>
        <li>The corpus loads once at start-up, not on each request.</li>
        <li>Log one line for each request: status, retrieved ids with scores, cited ids, and the input and output tokens when the model was called. Never log the API key.</li>
        <li>Type hints on every public function. A docstring on <code>grounded_answer</code> that names the four statuses.</li>
        <li>The tests make no network call and need no API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given the fixture and the <code>refund-window</code> vector, <code>retrieve</code> with k = 2 and min_score = 0.5 returns refund-policy 0.984 and warranty-claims 0.933, in this order.</li>
        <li>Given the <code>warranty-length</code> vector, <code>retrieve</code> with k = 1 returns only refund-policy (0.995). With k = 2 it also returns warranty-claims (0.983).</li>
        <li>Given the <code>vacation-days</code> vector, <code>grounded_answer</code> returns the status <code>no_sources</code> and the answer "I don't know", and the fake model is not called.</li>
        <li>Given one source, the user message from <code>build_prompt</code> has the <code>source</code> tag with <code>id="refund-policy"</code> before the line that starts with <code>Question:</code>, and the system prompt contains "I don't know".</li>
        <li>Given the answer "Within 45 days [refund-policy]. Express takes 1 day [delivery-times]." and the retrieved ids refund-policy and warranty-claims, the status is <code>unsupported</code>, and the citations are ["refund-policy", "delivery-times"].</li>
        <li><code>POST /ask</code> with the <code>refund-window</code> vector and a fake model that returns "You can return an unused tool within 45 days [refund-policy]." gives HTTP 200, the status <code>answered</code> and the citations ["refund-policy"].</li>
        <li><code>POST /ask</code> with a vector of length 3 gives HTTP 422, and the message names 3 and 4.</li>
        <li><code>pytest</code> passes with the network off. <code>uvicorn assistant.api:app</code> starts, and <code>GET /health</code> returns <code>{"status": "ok"}</code>.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Retrieval and the prompt (guided).</strong> Write the tests first: criteria 1, 2 and 4. Compute the cosine of the refund question and refund-policy on paper before you run the code. Then write <code>load_corpus</code>, <code>retrieve</code> and <code>build_prompt</code>.</li>
        <li><strong>The four statuses (guided).</strong> Write <code>parse_citations</code> and <code>grounded_answer</code> with a fake <code>ask</code>. Write one test for each status, and the test that the fake is not called for <code>no_sources</code>.</li>
        <li><strong>The endpoint (independent).</strong> Write <code>api.py</code> with the Pydantic models, the dependency for <code>ask</code>, and <code>/health</code>. Test it with <code>TestClient</code> and a dependency override. Run the server once and call it with <code>curl</code>.</li>
        <li><strong>Live check and handoff (independent).</strong> Run <code>python -m assistant.grounding refund-window --live</code> and the same for <code>vacation-days</code>. Record the status, the answer and the token counts. Fill in <code>handoffs/T-008-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional (a third session, a few cents of API cost): measure hallucination yourself. Write <code>scripts/hallucination_probe.py</code>. It sends the vacation question to <code>claude-haiku-5-5</code> 5 times without sources and 5 times through <code>grounded_answer</code> with min_score = 0, so the prompt has two unrelated sources.
      It counts the answers that state a number of days and the answers that say "I don't know". Record the counts in the handoff. Say what you measured, and do not draw a general conclusion from 10 runs.</p>`,
    files: `
      <pre><code>project/
  pyproject.toml            # add fastapi, uvicorn, httpx
  assistant/
    llm.py                  # from T-001 (do not change its behavior)
    vectors.py              # from T-003 (do not change it for this ticket)
    grounding.py            # load_corpus, retrieve, build_prompt, parse_citations,
                            # grounded_answer, __main__ demo
    api.py                  # FastAPI app: POST /ask, GET /health
  data/
    grounding_faq.json      # toy fixture (below)
  tests/
    test_grounding.py       # retrieval, prompt, citations, the four statuses
    test_api.py             # TestClient with a fake model
  scripts/
    hallucination_probe.py  # stretch only
  tickets/
    T-008.md                # this ticket (generated)
  handoffs/
    T-008-handoff.md        # your handoff (template generated)</code></pre>
      <p>Fixture <code>data/grounding_faq.json</code>. These are the documents and questions of the lesson's interactive. All data is fictional. The vectors are toy vectors with the labels money, it, shipping and people. They are the T-003 vectors with a fourth dimension.</p>
      <pre><code>{
  "dimensions": ["money", "it", "shipping", "people"],
  "documents": [
    {"id": "refund-policy", "title": "Refund policy", "text": "You can return an unused tool within 45 days of delivery for a full refund.", "vector": [0.8, 0, 0.3, 0]},
    {"id": "warranty-claims", "title": "Warranty claims", "text": "Power tools have a 2-year warranty. Send the claim form with a photo of the serial number.", "vector": [0.6, 0.1, 0.4, 0]},
    {"id": "vpn-setup", "title": "VPN setup", "text": "Install the NWConnect app and sign in with your company account.", "vector": [0.1, 0.9, 0, 0]},
    {"id": "delivery-times", "title": "Delivery times", "text": "Standard delivery takes 3 to 5 working days. Express delivery takes 1 working day.", "vector": [0.2, 0, 0.9, 0]}
  ],
  "queries": [
    {"id": "refund-window", "text": "How many days do I have to return a tool?", "vector": [0.9, 0.1, 0.2, 0]},
    {"id": "warranty-length", "text": "How long is the warranty on power tools?", "vector": [0.7, 0, 0.35, 0]},
    {"id": "vacation-days", "text": "How many vacation days do new employees get?", "vector": [0.1, 0, 0, 1]}
  ]
}</code></pre>
      <p>Do not change <code>assistant/vectors.py</code> for this ticket. If your T-001 function in <code>llm.py</code> cannot take a system prompt, add an optional parameter and keep its other behavior.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_retrieve_ranks_refund_policy_first_for_the_refund_question</code></td><td><code>refund-window</code>, k = 2, min 0.5</td><td>refund-policy 0.984, warranty-claims 0.933</td></tr>
        <tr><td><code>test_top_1_misses_the_warranty_document</code></td><td><code>warranty-length</code>, k = 1, then k = 2</td><td>Only refund-policy (0.995), then also warranty-claims (0.983)</td></tr>
        <tr><td><code>test_min_score_removes_unrelated_documents</code></td><td><code>vacation-days</code>, k = 4, min 0.5</td><td>An empty list</td></tr>
        <tr><td><code>test_prompt_puts_sources_before_the_question</code></td><td>One source</td><td>The source tag comes before <code>Question:</code></td></tr>
        <tr><td><code>test_system_prompt_allows_i_dont_know_and_asks_for_citations</code></td><td>Any sources</td><td>Contains "I don't know" and "square brackets"</td></tr>
        <tr><td><code>test_parse_citations_keeps_order_and_removes_duplicates</code></td><td>"a [x] b [y] c [x]"</td><td>["x", "y"]</td></tr>
        <tr><td><code>test_no_sources_returns_i_dont_know_without_a_model_call</code></td><td><code>vacation-days</code>, a fake that fails when called</td><td>Status <code>no_sources</code></td></tr>
        <tr><td><code>test_cited_retrieved_source_is_answered</code></td><td>Fake answer with [refund-policy]</td><td>Status <code>answered</code></td></tr>
        <tr><td><code>test_citation_of_an_unretrieved_document_is_unsupported</code></td><td>Fake answer with [delivery-times]</td><td>Status <code>unsupported</code></td></tr>
        <tr><td><code>test_answer_without_citation_is_unsupported</code></td><td>Fake answer "Within 45 days."</td><td>Status <code>unsupported</code></td></tr>
        <tr><td><code>test_model_i_dont_know_is_abstained</code></td><td>Fake answer "I don't know."</td><td>Status <code>abstained</code></td></tr>
        <tr><td><code>test_api_ask_returns_answered_with_citations</code></td><td><code>POST /ask</code>, fake dependency</td><td>HTTP 200, status <code>answered</code>, citations ["refund-policy"]</td></tr>
        <tr><td><code>test_api_rejects_a_vector_of_the_wrong_length</code></td><td>A vector of length 3</td><td>HTTP 422, the message names 3 and 4</td></tr>
        <tr><td><code>test_api_health_is_ok</code></td><td><code>GET /health</code></td><td>HTTP 200, <code>{"status": "ok"}</code></td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for the scores. Name each test after the property it proves, as in the table.</p>`,
    nfr: `
      <ul>
        <li><strong>Reliability:</strong> "I don't know" is a normal result with a status, not an error. The service never returns an unsupported answer without its status.</li>
        <li><strong>Cost:</strong> the <code>no_sources</code> path makes no model call. The log line shows the token counts of each call.</li>
        <li><strong>Security:</strong> the key comes only from <code>ANTHROPIC_API_KEY</code>. Never log or return it. The document text goes into the prompt inside tags, and the system prompt says to answer only from the sources. Topic 7 covers prompt injection in documents.</li>
        <li><strong>Testability:</strong> the unit tests and the API tests need no network and no key. The model is a function that the tests replace.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Your <code>no_sources</code> test passes. Explain in two sentences why this path cannot hallucinate and why it costs nothing.</li>
        <li>With k = 1, the warranty question retrieves the wrong document. What did the live model answer, and what was the status? What does this tell you about the choice of k?</li>
        <li>What did the live model answer for <code>vacation-days</code> with the default min_score, and with min_score = 0?</li>
        <li>Your citation check passes for an answer that cites a stale document. Which check from lesson 1.8 level 3 catches this case, and where would you add it?</li>
        <li>Stretch only: how many of your runs without sources stated a number of days, how many runs did you do, and what does this teach you about answers from the weights?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, the <code>curl</code> call, the live output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>You computed the cosine 0.984 on paper before you ran the code, and the numbers match.</li>
        <li>You can explain each status and the path through the code that gives it, without notes.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> retrieval reuses the T-003 functions; the <code>no_sources</code> path makes no model call; the citation check compares with the retrieved ids, not with all ids in the index;
      <code>grounding.py</code> has no import of <code>anthropic</code> or <code>fastapi</code>; the API tests use a dependency override; tests are named after properties; the key is never logged; and how well your answers to the questions show understanding.</p>`
  }
};
