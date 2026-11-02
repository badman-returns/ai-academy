/*
 * Lesson 1.4 - Attention: query, key and value.
 * Ticket T-004 - Attention by hand: a tested attention function.
 *
 * The toy example uses 3 tokens and d_k = 2. Every number in this file was
 * computed with a Node script before it was written here (3 decimals).
 * Toy vectors:
 *   Q: The = [1, 0], cat = [0, 1], sat = [1, 1]
 *   K: The = [1, 0], cat = [1, 1], sat = [0, 1]
 *   V: The = [1, 0], cat = [0, 1], sat = [1, 1]
 * The interactive for this lesson is in 04-ix.js (id "l1-4-attention").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.4"] = {
  id: "1.4",
  topic: "t1",
  title: "Attention: query, key and value",
  objective: "Explain how one token collects information from the other tokens with scaled dot-product attention, compute it by hand for 3 tokens, and connect it to context cost, the causal mask and the placement of text in a prompt.",
  prerequisites: [
    "Lesson 1.1: the generation loop, softmax and prefill compared to decode.",
    "Lesson 1.3 helps: a token becomes a vector (an embedding), and the dot product measures how similar two vectors are.",
    "You can multiply and add small numbers. No linear algebra course is necessary."
  ],
  covers: ["t1-attention"],
  whyItMatters: `
    <p>An embedding gives each token a vector, but the vector for "bank" is the same in "river bank" and "bank account".
    <strong>Attention</strong> is the step that lets each token take information from the other tokens in the context, so its vector can change with the context.</p>
    <p>For an application engineer, attention explains three things that you see in production: why long prompts are slow and why context windows have a limit (the work grows with the square of the length),
    why the model never "sees" tokens that come after the current position (the causal mask), and why the position of important text in a long prompt can change the answer.
    In an interview, "explain self-attention" is a very common question. A good answer uses one small example with numbers.</p>`,
  concepts: [
    { id: "l1-4-c-qkv", name: "Query, key and value vectors as learned projections" },
    { id: "l1-4-c-scores", name: "Attention scores: dot products of a query with every key" },
    { id: "l1-4-c-weights", name: "Softmax weights and the weighted sum of values" },
    { id: "l1-4-c-causal", name: "The causal mask (no attention to future tokens)" },
    { id: "l1-4-c-cost", name: "Quadratic cost in context length" },
    { id: "l1-4-c-scale", name: "Why the scores are divided by the square root of d_k" },
    { id: "l1-4-c-multihead", name: "Multi-head attention (high level)" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Each token asks the other tokens a question",
      blocks: [
        { type: "html", html: `
          <p>Read this sentence: <em>"The cat sat on the mat because it was tired."</em> To understand "it", you must look back and find "cat".
          To understand "sat", you must know who sat. A model has the same problem. Each token needs information from other tokens.</p>
          <p><strong>Attention</strong> solves this problem. For each token, the model does three things:</p>
          <ol>
            <li>It makes a <strong>query</strong>: "what information do I need?"</li>
            <li>It compares the query with the <strong>key</strong> of every token: "what information do I have?" A good match gives a high score.</li>
            <li>It takes a mix of the <strong>values</strong> of all tokens: "this is my information". Tokens with a high score give more to the mix.</li>
          </ol>
          <p>The result is a new vector for the token. This new vector contains information from the tokens it matched.
          When every token in a text does this with the other tokens of the same text, it is called <strong>self-attention</strong>.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a soft lookup in a dictionary", html: `
          <p>A Python dictionary does a hard lookup. You give a key, it finds the one entry with exactly that key, and it returns that value.</p>
          <p>Attention does a <em>soft</em> lookup. The query is compared with <em>all</em> keys. Each entry gets a weight from 0 to 1, and the weights add up to 1.
          The result is a weighted mix of <em>all</em> values. A close match gives a large part of the mix. A bad match gives a small part, but not zero.</p>` },
        { type: "diagram", caption: "The token \"sat\" attends to the three tokens of the toy sentence. The weights come from lesson level 2 and add up to 1. The thick arrow shows the largest weight.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="The query of sat is compared with the keys of The, cat and sat. The weights are 0.248, 0.503 and 0.248.">
            <defs><marker id="l14a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker>
            <marker id="l14a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow-accent"/></marker></defs>
            <rect x="10" y="90" width="130" height="56" rx="8" class="d-box-accent"/>
            <text x="75" y="114" text-anchor="middle" class="d-bold">Query of "sat"</text>
            <text x="75" y="132" text-anchor="middle" class="d-small">what do I need?</text>
            <rect x="250" y="16" width="150" height="48" rx="8" class="d-box"/>
            <text x="325" y="36" text-anchor="middle" class="d-bold">Key of "The"</text>
            <text x="325" y="54" text-anchor="middle" class="d-small">weight 0.248</text>
            <rect x="250" y="94" width="150" height="48" rx="8" class="d-box-good"/>
            <text x="325" y="114" text-anchor="middle" class="d-bold">Key of "cat"</text>
            <text x="325" y="132" text-anchor="middle" class="d-small">weight 0.503</text>
            <rect x="250" y="172" width="150" height="48" rx="8" class="d-box"/>
            <text x="325" y="192" text-anchor="middle" class="d-bold">Key of "sat"</text>
            <text x="325" y="210" text-anchor="middle" class="d-small">weight 0.248</text>
            <line x1="140" y1="110" x2="248" y2="44" class="d-line" marker-end="url(#l14a1)"/>
            <line x1="140" y1="118" x2="248" y2="118" class="d-line-accent" stroke-width="4" marker-end="url(#l14a2)"/>
            <line x1="140" y1="126" x2="248" y2="192" class="d-line" marker-end="url(#l14a1)"/>
            <rect x="470" y="90" width="160" height="56" rx="8" class="d-box-accent"/>
            <text x="550" y="114" text-anchor="middle" class="d-bold">New vector for "sat"</text>
            <text x="550" y="132" text-anchor="middle" class="d-small">weighted mix of values</text>
            <line x1="400" y1="118" x2="468" y2="118" class="d-line" marker-end="url(#l14a1)"/>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The keys are not words.</strong> Queries, keys and values are vectors of numbers that the model learned in training. Nobody wrote the rule "a verb looks for its subject".</li>
            <li><strong>Every token is both a question and an answer.</strong> In a dictionary, one side asks and one side stores. In self-attention, each token makes a query, a key and a value at the same time.</li>
            <li><strong>It happens many times.</strong> A model has many layers, and each layer has many attention heads (level 3). One lookup does not explain an answer.</li>
          </ul>` },
        { type: "interactive", id: "l1-4-attention" },
        { type: "html", html: `
          <h3>Two rules that matter in an application</h3>
          <ul>
            <li><strong>A token cannot look forward.</strong> When the model writes text, each token can attend only to itself and to the tokens before it. This rule is called the <strong>causal mask</strong>.</li>
            <li><strong>Every token looks at every earlier token.</strong> With twice as many tokens, each token compares with twice as many keys, and there are twice as many tokens. The work for attention grows about four times.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-4-L1-a", type: "mcq",
          q: "In attention, what do the query and the key do?",
          options: [
            "The query stores the information of a token, and the key is its position.",
            "The query says what a token needs. The key says what a token can give. Their match sets how much of that token's value is used.",
            "The query is the user prompt, and the key is the API key.",
            "The query selects one token exactly, as a dictionary lookup does."
          ],
          correct: 1,
          explain: "The query of one token is compared with the key of every token. A good match gives a high weight, and the result uses more of that token's value. It is a soft lookup: every token gets some weight." },
        { id: "l1-4-L1-b", type: "mcq",
          q: "The weights for one query are 0.248, 0.503 and 0.248. What is true?",
          options: [
            "Only the second token is used.",
            "All three tokens are used. The second token gives about half of the result.",
            "The weights are wrong, because they must all be equal.",
            "The weights show the probability of the next token."
          ],
          correct: 1,
          explain: "The weights add up to 1 (0.248 + 0.503 + 0.248 = 0.999 after rounding). Each value is used in proportion to its weight. These weights are not next-token probabilities; those come from the last layer (lesson 1.1)." },
        { id: "l1-4-L1-c", type: "recall",
          q: "In your own words: what problem does attention solve that an embedding alone cannot solve?",
          answer: "An embedding gives a token the same vector in every context. Attention lets each token take information from the other tokens in the context, so the vector for a token such as \"bank\" or \"it\" can change with the words around it." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Compute it by hand, then connect it to your prompts",
      blocks: [
        { type: "html", html: `
          <h3>Where Q, K and V come from</h3>
          <p>Each token arrives as a vector <code>x</code> (its embedding plus position information, lessons 1.3 and 1.5). The layer has three learned matrices:
          <code>W<sub>Q</sub></code>, <code>W<sub>K</sub></code> and <code>W<sub>V</sub></code>. For each token it computes:</p>
          <ul>
            <li><code>q = x · W<sub>Q</sub></code> (the query),</li>
            <li><code>k = x · W<sub>K</sub></code> (the key),</li>
            <li><code>v = x · W<sub>V</sub></code> (the value).</li>
          </ul>
          <p>These are three different <strong>projections</strong> of the same token vector, not three different inputs. Training sets the numbers in the matrices.
          The query and key have the same length, called <code>d<sub>k</sub></code>, because the next step takes their dot product.</p>
          <h3>The four steps for one query</h3>
          <ol>
            <li><strong>Score.</strong> Take the dot product of the query with each key: <code>score<sub>j</sub> = q · k<sub>j</sub></code>.</li>
            <li><strong>Scale.</strong> Divide each score by <code>√d<sub>k</sub></code> (level 3 says why).</li>
            <li><strong>Softmax.</strong> Change the scaled scores into weights from 0 to 1 that add up to 1 (the same softmax as in lesson 1.1).</li>
            <li><strong>Mix.</strong> Multiply each value by its weight and add the results: <code>output = Σ<sub>j</sub> weight<sub>j</sub> · v<sub>j</sub></code>.</li>
          </ol>` },
        { type: "worked", title: "Worked example: attention for \"sat\" by hand",
          intro: "Three tokens: \"The\", \"cat\", \"sat\". We skip the projections and give the vectors directly, with d<sub>k</sub> = 2. Queries: The = [1, 0], cat = [0, 1], sat = [1, 1]. Keys: The = [1, 0], cat = [1, 1], sat = [0, 1]. Values: The = [1, 0], cat = [0, 1], sat = [1, 1]. These numbers are made up so that the arithmetic is easy.",
          steps: [
            { html: "Scores for the query of \"sat\", q = [1, 1]. With \"The\": 1×1 + 1×0 = <strong>1</strong>. With \"cat\": 1×1 + 1×1 = <strong>2</strong>. With \"sat\": 1×0 + 1×1 = <strong>1</strong>." },
            { html: "Scale: √2 = 1.414. 1 / 1.414 = <strong>0.707</strong>, 2 / 1.414 = <strong>1.414</strong>, 1 / 1.414 = <strong>0.707</strong>." },
            { html: "Softmax: e<sup>0.707</sup> = 2.028, e<sup>1.414</sup> = 4.113, e<sup>0.707</sup> = 2.028. The sum is 8.169. The weights are 2.028 / 8.169 = <strong>0.248</strong>, 4.113 / 8.169 = <strong>0.503</strong> and <strong>0.248</strong>. \"sat\" attends most to \"cat\"." },
            { html: "Mix: 0.248 × [1, 0] + 0.503 × [0, 1] + 0.248 × [1, 1] = [0.248 + 0.248, 0.503 + 0.248] = <strong>[0.497, 0.752]</strong>. (The rounded weights give [0.496, 0.751]. The unrounded weights 0.2483 and 0.5035 give [0.497, 0.752]. Small differences like this come from rounding.)" },
            { faded: true, html: "Your turn. Compute the weights and the output for the query of \"The\", q = [1, 0], with the same keys and values. No mask.",
              answer: "Scores: 1, 1, 0. Scaled: 0.707, 0.707, 0.000. e^x: 2.028, 2.028, 1.000. Sum: 5.056. Weights: 0.401, 0.401, 0.198. Output: 0.401 × [1, 0] + 0.401 × [0, 1] + 0.198 × [1, 1] = [0.599, 0.599]." },
            { faded: true, html: "Your turn. Do the \"sat\" row again without the division by √2. Are the weights sharper or flatter?",
              answer: "Scores 1, 2, 1. e^x: 2.718, 7.389, 2.718. Sum: 12.826. Weights: 0.212, 0.576, 0.212. They are sharper: the top weight goes from 0.503 to 0.576. With a large d_k the difference is much bigger (level 3)." }
          ] },
        { type: "html", html: `
          <h3>The causal mask: no looking ahead</h3>
          <p>An LLM writes text from left to right. In training, it must predict each next token without seeing it. So each token may attend only to itself and to earlier tokens.
          The <strong>causal mask</strong> does this. Before the softmax, it sets every score for a later token to <code>−∞</code>. Because e<sup>−∞</sup> = 0, those tokens get a weight of exactly 0,
          and the other weights still add up to 1.</p>` },
        { type: "diagram", caption: "Causal attention weights for the toy example. Each row is one query. Grey cells are masked (later tokens). Each row adds up to 1.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="A 3 by 3 grid of causal attention weights. Row The: 1.000, masked, masked. Row cat: 0.330, 0.670, masked. Row sat: 0.248, 0.503, 0.248.">
            <text x="250" y="22" text-anchor="middle" class="d-small">key: The</text>
            <text x="380" y="22" text-anchor="middle" class="d-small">key: cat</text>
            <text x="510" y="22" text-anchor="middle" class="d-small">key: sat</text>
            <text x="150" y="62" text-anchor="end" class="d-bold">query: The</text>
            <text x="150" y="122" text-anchor="end" class="d-bold">query: cat</text>
            <text x="150" y="182" text-anchor="end" class="d-bold">query: sat</text>
            <rect x="190" y="35" width="120" height="44" rx="6" class="d-box-good"/><text x="250" y="62" text-anchor="middle" class="d-text">1.000</text>
            <rect x="320" y="35" width="120" height="44" rx="6" class="d-box-warn"/><text x="380" y="62" text-anchor="middle" class="d-small">masked</text>
            <rect x="450" y="35" width="120" height="44" rx="6" class="d-box-warn"/><text x="510" y="62" text-anchor="middle" class="d-small">masked</text>
            <rect x="190" y="95" width="120" height="44" rx="6" class="d-box"/><text x="250" y="122" text-anchor="middle" class="d-text">0.330</text>
            <rect x="320" y="95" width="120" height="44" rx="6" class="d-box-good"/><text x="380" y="122" text-anchor="middle" class="d-text">0.670</text>
            <rect x="450" y="95" width="120" height="44" rx="6" class="d-box-warn"/><text x="510" y="122" text-anchor="middle" class="d-small">masked</text>
            <rect x="190" y="155" width="120" height="44" rx="6" class="d-box"/><text x="250" y="182" text-anchor="middle" class="d-text">0.248</text>
            <rect x="320" y="155" width="120" height="44" rx="6" class="d-box-good"/><text x="380" y="182" text-anchor="middle" class="d-text">0.503</text>
            <rect x="450" y="155" width="120" height="44" rx="6" class="d-box"/><text x="510" y="182" text-anchor="middle" class="d-text">0.248</text>
          </svg>` },
        { type: "worked", title: "Worked example: the causal row for \"cat\"",
          intro: "Use the same vectors. The query of \"cat\" is q = [0, 1]. \"sat\" comes after \"cat\", so the mask removes it.",
          steps: [
            { html: "Scores: with \"The\" 0×1 + 1×0 = 0, with \"cat\" 0×1 + 1×1 = 1, with \"sat\" 0×0 + 1×1 = 1. Scaled: 0.000, 0.707, 0.707." },
            { html: "Mask: the score for \"sat\" becomes −∞. e<sup>x</sup>: 1.000, 2.028, 0. The sum is 3.028." },
            { faded: true, html: "Your turn. What are the weights and the output vector for \"cat\"?",
              answer: "Weights: 1.000 / 3.028 = 0.330 and 2.028 / 3.028 = 0.670, and 0 for \"sat\". Output: 0.330 × [1, 0] + 0.670 × [0, 1] = [0.330, 0.670]. Without the mask, the weights were 0.198, 0.401, 0.401." }
          ] },
        { type: "note", kind: "fact", title: "Why attention cost grows with the square of the context", html: `
          <p>With <code>n</code> tokens, each of the <code>n</code> queries is compared with up to <code>n</code> keys. That is <code>n × n</code> scores in each attention head of each layer.
          The causal mask removes about half of them (<code>n(n+1)/2</code>), but the growth is still quadratic.</p>
          <div class="table-wrap"><table>
            <tr><th>Tokens (n)</th><th>Scores per head per layer (n × n)</th></tr>
            <tr><td>1,000</td><td>1,000,000</td></tr>
            <tr><td>2,000</td><td>4,000,000</td></tr>
            <tr><td>10,000</td><td>100,000,000</td></tr>
            <tr><td>100,000</td><td>10,000,000,000</td></tr>
          </table></div>
          <p>Ten times more tokens gives one hundred times more scores. What this means for you:</p>
          <ul>
            <li><strong>Your bill grows linearly.</strong> The API charges per token, not per score.</li>
            <li><strong>Prefill time grows faster on very long prompts.</strong> The time to first token (TTFT) of a very long prompt is high. Attention is one of the reasons.</li>
            <li><strong>Context windows have a limit</strong>, and long context is expensive for the provider to serve. Optimized implementations do not store the full score table at one time, but the number of scores still grows as n².</li>
            <li><strong>During decode</strong>, each new token computes one new row of scores against all earlier keys. The cost per new token grows linearly with the context, so long chats also make each output token a little slower.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Attention and the place of text in your prompt</h3>
          <p>The model <em>can</em> attend to every earlier token in the context window. It does not follow that it <em>uses</em> all of them equally well.
          Research on earlier models found that facts in the middle of a very long context were used less reliably than facts at the start or the end.
          Newer models are better at this, but you cannot assume it for your prompt. Measure it on your model and your data.</p>
          <p>Practical rules that follow:</p>
          <ul>
            <li>Put long documents first and the question and instructions last. Anthropic's prompt engineering guidance recommends this order for long inputs.</li>
            <li>Put stable rules in the system prompt, not between two documents.</li>
            <li>Mark the parts of a long prompt with clear tags (for example <code>&lt;document&gt;</code>), so the model can find them.</li>
            <li>Send less text. Retrieval (Topic 3) sends only the relevant chunks. This also reduces cost and TTFT.</li>
            <li>When placement matters for your product, test it with an eval (Topic 5). The stretch part of ticket T-004 is a small first test.</li>
          </ul>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>"Softmax weights add up to 1, so more tokens means less weight for each token" is a useful picture, but it is not the full explanation.
          A real model has many layers and heads, and one head can still put almost all its weight on one token. Use the picture to make a hypothesis, then test it.</p>` }
      ],
      checks: [
        { id: "l1-4-L2-a", type: "mcq",
          q: "A query is [2, 0]. The keys are [1, 0] and [0, 1]. d_k = 2. What are the scaled scores before the softmax?",
          options: ["2 and 0", "1.414 and 0.000", "1.000 and 0.000", "0.707 and 0.707"],
          correct: 1,
          explain: "The dot products are 2×1 + 0×0 = 2 and 2×0 + 0×1 = 0. Divide by √2 = 1.414: 2 / 1.414 = 1.414 and 0 / 1.414 = 0.000." },
        { id: "l1-4-L2-b", type: "mcq",
          q: "Your prompt grows from 5,000 to 20,000 tokens. About how many more attention scores does the model compute during prefill?",
          options: ["The same number.", "4 times more.", "16 times more.", "The number depends only on max_tokens."],
          correct: 2,
          explain: "The count grows with n². 20,000 / 5,000 = 4, and 4² = 16. Your bill grows only 4 times, because the API charges per token." },
        { id: "l1-4-L2-c", type: "recall",
          q: "Why does the causal mask set future scores to minus infinity before the softmax, and not set the weights to 0 after it?",
          answer: "e to the minus infinity is 0, so the future tokens get weight 0 and the softmax divides only by the allowed terms. The remaining weights add up to 1. If you set weights to 0 after the softmax, the remaining weights add up to less than 1 (for \"cat\" in the toy example: 0.198 + 0.401 = 0.599), and the output is too small." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "The formula, the scale factor and multi-head attention",
      blocks: [
        { type: "html", html: `
          <h3>The formula in matrix form</h3>
          <p>Put the queries of all <code>n</code> tokens in the rows of a matrix <code>Q</code> (n × d<sub>k</sub>), the keys in <code>K</code> (n × d<sub>k</sub>) and the values in <code>V</code> (n × d<sub>v</sub>). Then:</p>
          <p><code>Attention(Q, K, V) = softmax(Q K<sup>T</sup> / √d<sub>k</sub>) V</code></p>
          <ul>
            <li><code>Q K<sup>T</sup></code> is the n × n table of all scores. Row i, column j is <code>q<sub>i</sub> · k<sub>j</sub></code>. This table is the n² of level 2.</li>
            <li>The softmax works on each row separately. Each row of weights adds up to 1.</li>
            <li>The causal mask adds <code>−∞</code> above the diagonal of the score table, before the softmax.</li>
            <li>Multiplying the weights (n × n) by <code>V</code> (n × d<sub>v</sub>) gives one output vector per token (n × d<sub>v</sub>).</li>
          </ul>
          <p>This is the same computation as the worked examples. The matrix form computes all rows at the same time, which is why prefill runs in parallel on a GPU.</p>` },
        { type: "code", lang: "python", code:
`import math

def softmax(row):
    m = max(row)                                # subtract the max: no overflow
    exps = [math.exp(x - m) if x != -math.inf else 0.0 for x in row]
    total = sum(exps)
    return [e / total for e in exps]

def attention(Q, K, V, causal=False):
    d_k = len(K[0])
    out = []
    for i, q in enumerate(Q):
        scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(d_k) for k in K]
        if causal:
            scores = [s if j <= i else -math.inf for j, s in enumerate(scores)]
        w = softmax(scores)
        out.append([sum(w[j] * V[j][c] for j in range(len(V))) for c in range(len(V[0]))])
    return out

Q = [[1, 0], [0, 1], [1, 1]]
K = [[1, 0], [1, 1], [0, 1]]
V = [[1, 0], [0, 1], [1, 1]]
print(attention(Q, K, V, causal=True))   # rows: [1.0, 0.0], [0.330, 0.670], [0.497, 0.752]` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This code shows the idea and checks the hand numbers. It is slow and has no input checks. Ticket T-004 asks you to write your own version with tests. Real models use matrix libraries on a GPU.</p>` },
        { type: "html", html: `
          <h3>Why divide by √d<sub>k</sub>?</h3>
          <p>Suppose the numbers in q and k are random, with mean 0 and variance 1. Then the dot product q · k is a sum of d<sub>k</sub> products, and its variance is d<sub>k</sub>.
          The typical size of a score grows like √d<sub>k</sub>. With large scores, the softmax gives almost all the weight to one token.
          In training, such a softmax has very small gradients, so the model learns slowly. Division by √d<sub>k</sub> brings the variance of the scores back to about 1.
          The original transformer paper gives this reason.</p>` },
        { type: "worked", title: "Worked example: the effect of the scale factor at d_k = 64",
          intro: "With d<sub>k</sub> = 64, √d<sub>k</sub> = 8. Suppose one query has the raw scores 8, 0 and −8 with three keys.",
          steps: [
            { html: "Without the scale: e<sup>8</sup> = 2980.958, e<sup>0</sup> = 1, e<sup>−8</sup> = 0.00034. The weights are <strong>0.99966, 0.00034, 0.00000</strong> (5 decimals, because at 3 decimals they show as 1.000, 0.000, 0.000). Almost all the weight is on one token." },
            { html: "With the scale: the scores become 8 / 8 = 1, 0 / 8 = 0, −8 / 8 = −1. e<sup>x</sup>: 2.718, 1.000, 0.368. The sum is 4.086." },
            { faded: true, html: "Your turn. What are the scaled weights? Is the distribution sharper or flatter than without the scale?",
              answer: "2.718 / 4.086 = 0.665, 1.000 / 4.086 = 0.245, 0.368 / 4.086 = 0.090. The distribution is much flatter, so all three tokens still contribute and the gradients stay useful in training." }
          ] },
        { type: "html", html: `
          <h3>Multi-head attention</h3>
          <p>One attention computation gives each token one weighted mix. But a token often needs several kinds of information at the same time, for example its subject and the token just before it.
          <strong>Multi-head attention</strong> runs several attention computations, called <strong>heads</strong>, in parallel in the same layer:</p>
          <ol>
            <li>Each head has its own <code>W<sub>Q</sub></code>, <code>W<sub>K</sub></code> and <code>W<sub>V</sub></code>. They project the token vector to a smaller size, usually d<sub>model</sub> / h for h heads.</li>
            <li>Each head computes its own attention, with its own weights.</li>
            <li>The outputs of all heads are joined end to end (concatenated) and multiplied by one more learned matrix, <code>W<sub>O</sub></code>.</li>
          </ol>
          <p>Because each head is smaller, h heads cost about the same as one large head. In the original transformer paper, d<sub>model</sub> = 512 with h = 8 heads, so each head uses d<sub>k</sub> = 64.
          Researchers have found heads with clear patterns, for example heads that look at the previous token. Many other heads have no simple description.</p>` },
        { type: "diagram", caption: "Multi-head attention. Each head has its own projections and its own weights. The outputs are joined and projected back to the model size.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Token vectors go to h heads in parallel. The head outputs are concatenated and multiplied by W_O.">
            <defs><marker id="l14a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="10" y="82" width="120" height="56" rx="8" class="d-box"/>
            <text x="70" y="106" text-anchor="middle" class="d-bold">Token vectors</text>
            <text x="70" y="124" text-anchor="middle" class="d-small">n × d_model</text>
            <rect x="200" y="14" width="150" height="44" rx="8" class="d-box-accent"/>
            <text x="275" y="41" text-anchor="middle" class="d-text">Head 1: own Q, K, V</text>
            <rect x="200" y="88" width="150" height="44" rx="8" class="d-box-accent"/>
            <text x="275" y="115" text-anchor="middle" class="d-text">Head 2: own Q, K, V</text>
            <rect x="200" y="162" width="150" height="44" rx="8" class="d-box-accent"/>
            <text x="275" y="189" text-anchor="middle" class="d-text">Head h: own Q, K, V</text>
            <text x="275" y="152" text-anchor="middle" class="d-small">...</text>
            <line x1="130" y1="104" x2="198" y2="38" class="d-line" marker-end="url(#l14a3)"/>
            <line x1="130" y1="110" x2="198" y2="110" class="d-line" marker-end="url(#l14a3)"/>
            <line x1="130" y1="116" x2="198" y2="182" class="d-line" marker-end="url(#l14a3)"/>
            <rect x="410" y="82" width="100" height="56" rx="8" class="d-box"/>
            <text x="460" y="106" text-anchor="middle" class="d-bold">Concat</text>
            <text x="460" y="124" text-anchor="middle" class="d-small">join outputs</text>
            <line x1="350" y1="38" x2="408" y2="104" class="d-line" marker-end="url(#l14a3)"/>
            <line x1="350" y1="110" x2="408" y2="110" class="d-line" marker-end="url(#l14a3)"/>
            <line x1="350" y1="182" x2="408" y2="116" class="d-line" marker-end="url(#l14a3)"/>
            <rect x="540" y="82" width="90" height="56" rx="8" class="d-box-good"/>
            <text x="585" y="106" text-anchor="middle" class="d-bold">× W_O</text>
            <text x="585" y="124" text-anchor="middle" class="d-small">n × d_model</text>
            <line x1="510" y1="110" x2="538" y2="110" class="d-line" marker-end="url(#l14a3)"/>
          </svg>` },
        { type: "html", html: `
          <h3>Connections to the next lessons</h3>
          <ul>
            <li><strong>The transformer block (lesson 1.5).</strong> Attention is one half of a block. The other half is a feed-forward network that works on each token separately. Residual connections and normalization hold the block together.</li>
            <li><strong>The KV cache (lesson 1.7).</strong> Because of the causal mask, a token never attends to later tokens. So the key and value of an earlier token never change when new tokens arrive.
            During decode, the server keeps them in memory and computes only the new token's query, key and value. This cache grows with the context length and uses GPU memory.</li>
            <li><strong>Self-attention compared to cross-attention.</strong> In a decoder-only LLM, Q, K and V all come from the same token sequence (self-attention). In the original encoder-decoder transformer, the decoder also had cross-attention: queries from the decoder, keys and values from the encoder.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-4-L3-a", type: "mcq",
          q: "Why does the transformer divide the scores by √d_k?",
          options: [
            "To make the output vectors shorter.",
            "Because the scores of random vectors grow like √d_k. Large scores make the softmax almost one-hot, and training then gets very small gradients.",
            "To make the weights add up to 1.",
            "To hide the future tokens."
          ],
          correct: 1,
          explain: "The variance of a dot product of d_k random components is d_k, so its typical size is √d_k. Division by √d_k keeps the softmax away from the flat-gradient region. The softmax makes the weights add up to 1, and the causal mask hides the future." },
        { id: "l1-4-L3-b", type: "mcq",
          q: "A layer has d_model = 512 and 8 heads. What is the usual size of the query vector in each head?",
          options: ["512", "64", "8", "4,096"],
          correct: 1,
          explain: "Each head projects to d_model / h = 512 / 8 = 64. The 8 head outputs of size 64 are concatenated back to 512 and multiplied by W_O." },
        { id: "l1-4-L3-c", type: "recall",
          q: "Explain why the causal mask makes a KV cache possible.",
          answer: "With the causal mask, a token attends only to itself and earlier tokens, so its key and value depend only on earlier text. When new tokens arrive, the keys and values of the earlier tokens stay the same. The server can store them and compute only the new token's query, key and value at each decode step." }
      ]
    }
  ],

  debugging: [
    { id: "l1-4-dbg-1", title: "The weights do not add up to 1",
      symptom: "Your attention function has a causal option. The test that checks that each row of weights adds up to 1 passes without the mask and fails with the mask.",
      evidence: "FAILED test_weights_rows_sum_to_one[causal] - row 1: sum(weights) = 0.599, expected 1.000",
      hints: [
        "In which order does your code apply the softmax and the mask?",
        "Compute the \"cat\" row from the lesson without the mask, then set the last weight to 0. What is the sum?"
      ],
      answer: "The code computes the softmax first and then sets the future weights to 0. For the \"cat\" row the full weights are 0.198, 0.401, 0.401; with the last one set to 0 the sum is 0.599. Fix: apply the mask to the scores (set them to minus infinity) before the softmax. Then the row is 0.330, 0.670, 0.000 and adds up to 1." },
    { id: "l1-4-dbg-2", title: "OverflowError on large scores",
      symptom: "Your pure Python softmax works on the toy example. A test with the scores 1000, 999 and 0 crashes.",
      evidence: "OverflowError: math range error  (in math.exp)",
      hints: [
        "What is e to the power of 1000? Can a float hold it?",
        "Does the softmax change if you subtract the same number from every score?"
      ],
      answer: "math.exp(1000) is too large for a float, so Python raises OverflowError (numpy returns inf, and inf / inf gives NaN). The softmax does not change when you subtract the same number from every score, so subtract the row maximum first: the scores become 0, −1 and −1000, and the weights are 0.731, 0.269, 0.000. Every real implementation does this." },
    { id: "l1-4-dbg-3", title: "The assistant ignores a rule in a long prompt",
      symptom: "The Northwind assistant gets a prompt of about 40 pages: three policy documents, then a rule \"Answer only from the documents\", then two more documents, then the question. On some questions the answer uses general knowledge and ignores the rule.",
      evidence: "The rule is in the middle of the prompt. When the rule is moved to the system prompt in a small test, the problem does not appear on the same questions.",
      hints: [
        "Where is the rule, compared to the question and the long documents?",
        "Can every token attend to the rule? Does that mean the model uses it reliably?"
      ],
      answer: "Every token can attend to the rule, but a model does not always use text in the middle of a very long context reliably. Fix: put stable rules in the system prompt, put the documents first and the question last, mark the documents with tags, and send fewer documents (retrieval, Topic 3). Then confirm the fix with an eval on a set of questions, not with one example (Topic 5)." }
  ],

  recall: [
    { id: "l1-4-r1", q: "Write the scaled dot-product attention formula.", a: "Attention(Q, K, V) = softmax(Q K^T / √d_k) V. The softmax works on each row of the score table." },
    { id: "l1-4-r2", q: "What are Q, K and V in self-attention, and where do they come from?", a: "Queries, keys and values. They are three learned linear projections (W_Q, W_K, W_V) of the same token vectors. The query says what a token needs, the key says what it can give, and the value is what it gives." },
    { id: "l1-4-r3", q: "How does the causal mask work?", a: "Before the softmax, it sets the score of every later token to minus infinity. e to the minus infinity is 0, so later tokens get weight 0 and the remaining weights still add up to 1." },
    { id: "l1-4-r4", q: "Why does attention cost grow with the square of the context length?", a: "Each of the n queries is compared with up to n keys, so there are n × n scores per head per layer. Ten times more tokens gives one hundred times more scores. The API bill is per token, so it grows linearly." },
    { id: "l1-4-r5", q: "Why divide the scores by √d_k?", a: "Dot products of random vectors with d_k components have variance d_k. Large scores make the softmax almost one-hot, which gives very small gradients in training. Division by √d_k keeps the variance near 1." },
    { id: "l1-4-r6", q: "What is multi-head attention, in one sentence?", a: "Several smaller attention computations (heads) run in parallel in one layer, each with its own Q, K and V projections; their outputs are concatenated and multiplied by W_O." },
    { id: "l1-4-r7", q: "How do you make a softmax safe from overflow?", a: "Subtract the largest score in the row from every score before the exponential. The result does not change, and the largest exponent becomes e^0 = 1." }
  ],

  interview: [
    { q: "Explain self-attention to a backend engineer in two minutes.",
      outline: "Problem: a token needs context (\"it\" needs \"cat\"). Each token makes a query, a key and a value with learned projections. Score = query · key for every token, divide by √d_k, softmax to weights, output = weighted sum of values. A soft lookup over the whole context. Causal mask for generation. Many heads and layers. Give the 3-token example with numbers if there is a whiteboard." },
    { q: "Why is a long context expensive? What do you do about it in an application?",
      outline: "Attention computes n × n scores per head per layer, so prefill work grows quadratically; decode cost per token grows linearly, and the KV cache grows linearly in memory. The bill is per token. Actions: send less text (retrieval, summaries), prompt caching for stable prefixes (Topic 2), measure TTFT against prompt length, choose a model by need (Topic 6)." },
    { q: "What does the causal mask do, and how is it related to the KV cache?",
      outline: "It stops each token from attending to later tokens, by setting those scores to minus infinity before the softmax. It is needed in training (no look at the answer) and in generation. Because earlier tokens never see later ones, their keys and values never change, so the server caches them and computes only the new token at each decode step (lesson 1.7)." },
    { q: "Why scaled dot-product, and why multiple heads?",
      outline: "Scale: dot products grow like √d_k; large scores saturate the softmax and kill gradients; dividing keeps variance about 1. Heads: several smaller attention patterns in parallel (for example one for the previous token, one for the subject), for about the cost of one large head; concat and W_O combine them." },
    { q: "Do attention weights explain why the model gave an answer?",
      outline: "Only partly. One head in one layer shows how that head mixed the values. There are many heads and layers, the values are transformed again after attention, and research disagrees about how much the weights explain. Use them as a hint, and test hypotheses with changes to the input." }
  ],

  misconceptions: [
    { wrong: "Q, K and V are three different inputs to the model.", right: "In self-attention they are three learned projections of the same token vectors." },
    { wrong: "Attention picks the one most relevant token.", right: "It is a soft lookup. Every allowed token gets a weight from 0 to 1, and the output is a weighted mix of all values." },
    { wrong: "The causal mask is only for generation; training sees the whole text.", right: "Training uses the same mask. Without it, the model could see the token it must predict." },
    { wrong: "A model with a large context window uses all of the context equally well.", right: "It can attend to all of it, but use of facts in long contexts can be less reliable. Place important text well and measure on your model." },
    { wrong: "Attention cost and the API bill both grow quadratically with prompt length.", right: "The attention computation grows about quadratically. The bill is per token, so it grows linearly. Latency on very long prompts shows the quadratic part." },
    { wrong: "Multi-head attention means several models vote.", right: "It is one layer with several smaller attention computations in parallel. Their outputs are joined and projected." },
    { wrong: "Attention weights show why the model answered as it did.", right: "They show how one head mixed values in one layer. They are a hint, not an explanation." }
  ],

  resources: [
    { title: "Attention in transformers, step-by-step (Chapter 6)", by: "3Blue1Brown", kind: "Video", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc",
      when: "Watch after level 1, before level 2.",
      why: "A visual of queries, keys and values, the score grid and the causal mask, with the same ideas as this lesson.",
      watchFor: [
        "In the video, what question does a query ask, and what do keys answer?",
        "Where does the video apply the mask: to the scores before the softmax, or to the weights after it?",
        "What does the video say about the size of the score grid when the context grows?"
      ] },
    { title: "The Illustrated Transformer", by: "Jay Alammar", kind: "Article", url: "https://jalammar.github.io/illustrated-transformer/",
      when: "Read the self-attention and multi-head parts after level 2.",
      why: "Step-by-step pictures of the Q, K and V projections and of the multi-head concatenation.",
      watchFor: [
        "Which matrices create Q, K and V from the input vectors?",
        "How are the outputs of the heads combined into one vector per token?"
      ] },
    { title: "Let's build GPT: from scratch, in code, spelled out", by: "Andrej Karpathy", kind: "Video, long, optional", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
      when: "Optional, after level 3, if you want to see attention in PyTorch code.",
      why: "Builds a small GPT and writes self-attention, the causal mask and multi-head attention step by step.",
      note: "Use the chapter list on YouTube to find the self-attention part. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "How does the code build the causal mask, and what value does it put in the masked positions?",
        "Where does the code divide by the square root of the head size?"
      ] },
    { title: "Attention Is All You Need", by: "Vaswani et al. (2017)", kind: "Paper, optional", url: "https://arxiv.org/abs/1706.03762",
      when: "Optional, after level 3. Read section 3.2 only.",
      why: "The original definition of scaled dot-product attention and multi-head attention.",
      watchFor: [
        "What reason does the paper give for the 1 / √d_k factor?",
        "What values of d_model, h and d_k does the base model use?"
      ] }
  ],

  summary: `
    <ul>
      <li>Attention lets each token take information from other tokens, so its vector changes with the context.</li>
      <li>Each token has a query, a key and a value: three learned projections of the same token vector.</li>
      <li>Scaled dot-product attention: softmax(Q K<sup>T</sup> / √d<sub>k</sub>) V. Score, scale, softmax, then a weighted sum of values.</li>
      <li>The causal mask sets future scores to −∞ before the softmax. This also makes the KV cache possible (lesson 1.7).</li>
      <li>There are n × n scores per head per layer, so attention work grows with the square of the context. The bill is per token.</li>
      <li>Multi-head attention runs several smaller heads in parallel and joins their outputs.</li>
      <li>The model can attend to all of the context, but placement still matters. Put documents first and the question last, and measure.</li>
    </ul>`,

  teachBack: "Explain self-attention to a backend engineer with the 3-token example \"The cat sat\". Compute one row of weights on paper, show the causal mask, and say why a prompt that is 10 times longer gives about 100 times more attention scores but only a 10 times larger bill. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-004"]
};

/* ====================================================================== T-004 */
window.ACADEMY.tickets["T-004"] = {
  id: "T-004",
  title: "Attention by hand: a tested attention function",
  lesson: "1.4",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1 to 2 hours. The optional stretch needs a second, short session.",
  fields: {
    objective: `
      <p>Write a small, pure Python module, <code>assistant/attention.py</code>, with a stable <code>softmax</code> and a <code>scaled_dot_product_attention</code> function that supports the causal mask.
      Prove it with tests that are named after the properties they check, and with the hand-computed numbers from lesson 1.4.</p>
      <p><strong>Real-world problem.</strong> Engineers who build on LLMs often talk about "context" and "attention" without a working model of them.
      Then they cannot reason about long-prompt latency, prompt placement or KV cache memory. A 40-line implementation that you wrote and tested yourself gives you that model.
      It also gives you a correct answer for the common interview task "implement attention".</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      The assistant does not call this function in production: Claude runs attention on the server. The module is a learning tool and a test bed.
      The optional stretch uses the client from T-001 to measure one effect of attention in the real product: does the place of a fact in a long prompt change the answer?</p>
      <p>This ticket depends only on T-001 (the project, the virtual environment and pytest exist). It adds new files only, so it does not conflict with T-002 or T-003. You can do it before or after them.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.4, levels 1 and 2 complete. Level 3 helps for milestone 3.</li>
        <li>T-001 done: <code>project/</code> has a virtual environment, <code>pyproject.toml</code> and a passing <code>pytest</code>.</li>
        <li>No new package. Use only the Python standard library (<code>math</code>). Do not add numpy for this ticket.</li>
        <li>The stretch only: <code>ANTHROPIC_API_KEY</code> in the environment, and the T-001 client in <code>assistant/llm.py</code>.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>softmax(scores: list[float]) -&gt; list[float]</code> returns weights from 0 to 1 that add up to 1. It accepts <code>-math.inf</code> for masked positions and gives them weight 0.</li>
        <li><code>scaled_dot_product_attention(q, k, v, causal=False)</code> takes three matrices as lists of rows and returns a pair <code>(output, weights)</code>: the n × d<sub>v</sub> output and the n × n weight table.</li>
        <li>The function divides the scores by <code>√d_k</code>, where d<sub>k</sub> is the length of each query and key row.</li>
        <li>With <code>causal=True</code>, row i gives weight 0 to every column j &gt; i. The mask is applied to the scores, before the softmax.</li>
        <li><code>python -m assistant.attention</code> prints the lesson's toy example ("The", "cat", "sat") as a weight table and an output table, with and without the mask, at 3 decimals.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Pure functions: no global state, no printing inside the functions, no change to the input lists.</li>
        <li>The softmax subtracts the row maximum before <code>math.exp</code>, so large scores do not overflow.</li>
        <li>Wrong shapes raise <code>ValueError</code> with a clear message: rows of q and k with different lengths, k and v with a different number of rows, an empty input. With <code>causal=True</code>, q and k must have the same number of rows.</li>
        <li>Type hints on every public function. A docstring on <code>scaled_dot_product_attention</code> that states the formula.</li>
        <li>The tests make no network call and need no API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given the lesson's Q, K and V with <code>causal=False</code>, when you call the function, then the weights for "sat" are 0.248, 0.503 and 0.248, and its output is [0.497, 0.752] (tolerance 0.001).</li>
        <li>Given the same input with <code>causal=True</code>, then the weight rows are [1.000, 0, 0], [0.330, 0.670, 0] and [0.248, 0.503, 0.248], and the outputs are [1.000, 0.000], [0.330, 0.670] and [0.497, 0.752].</li>
        <li>Given any valid input, each row of weights adds up to 1 (tolerance 1e-9), with and without the mask.</li>
        <li>Given the scores 1000, 999 and 0, <code>softmax</code> returns about 0.731, 0.269 and 0.000 and raises no error.</li>
        <li>Given a q row of length 2 and a k row of length 3, the function raises <code>ValueError</code>.</li>
        <li><code>pytest</code> passes with the network off. <code>python -m assistant.attention</code> prints the tables of criterion 1 and 2.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Softmax (guided).</strong> Write <code>softmax</code> and its tests first: rows add up to 1, equal scores give equal weights, <code>-math.inf</code> gives 0, and the 1000 / 999 / 0 case does not overflow. Before you add the max subtraction, run the last test and read the error.</li>
        <li><strong>Attention without the mask (guided).</strong> Write the score, scale, softmax and mix steps. Write the hand-computed test for the "sat" row. Compute the "The" row on paper first, then compare with your function.</li>
        <li><strong>The causal mask and the checks (independent).</strong> Add <code>causal=True</code>, the shape checks and the remaining tests. On purpose, apply the mask after the softmax once, and see which test fails. Then fix it.</li>
        <li><strong>Demo and handoff (independent).</strong> Add the <code>__main__</code> block that prints the toy tables. Fill in <code>handoffs/T-004-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional (a second session, a few cents of API cost): a context-placement experiment. Write <code>scripts/placement_experiment.py</code> that uses the T-001 client with <code>claude-haiku-5-5</code>.
      Build a long prompt from filler paragraphs, and put one fact (for example "The Northwind return window for drills is 47 days.") at the start, in the middle or at the end.
      Ask the same question for each position, a few times each, and record whether the answer contains "47" and the input tokens and TTFT of each call.
      Write the results as a table in the handoff. Do not draw a general conclusion from a few runs: say what you measured and what you would need to measure to be sure.</p>`,
    files: `
      <pre><code>project/
  assistant/
    attention.py            # softmax, scaled_dot_product_attention, __main__ demo
  tests/
    test_attention.py       # property tests and the hand-computed example
  scripts/
    placement_experiment.py # stretch only
  tickets/
    T-004.md                # this ticket (generated)
  handoffs/
    T-004-handoff.md        # your handoff (template generated)</code></pre>
      <p>Do not change <code>assistant/llm.py</code> for this ticket. The stretch script only imports it.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_softmax_rows_sum_to_one</code></td><td>Several score lists, including negative numbers</td><td>The sum is 1 (tolerance 1e-9); every weight is from 0 to 1</td></tr>
        <tr><td><code>test_softmax_is_stable_for_large_scores</code></td><td>1000, 999, 0</td><td>No error; about 0.731, 0.269, 0.000</td></tr>
        <tr><td><code>test_softmax_gives_zero_weight_to_minus_infinity</code></td><td>0.0, 0.707, -inf</td><td>About 0.330, 0.670, exactly 0</td></tr>
        <tr><td><code>test_equal_keys_give_equal_weights</code></td><td>Three identical key rows</td><td>Each weight is 1/3</td></tr>
        <tr><td><code>test_matches_lesson_hand_computed_example</code></td><td>The lesson's Q, K, V, no mask</td><td>"sat" weights 0.248, 0.503, 0.248; output [0.497, 0.752]</td></tr>
        <tr><td><code>test_causal_mask_gives_zero_weight_to_future_tokens</code></td><td>The lesson's Q, K, V, causal</td><td>Every weight above the diagonal is exactly 0</td></tr>
        <tr><td><code>test_causal_weights_rows_sum_to_one</code></td><td>The lesson's Q, K, V, causal</td><td>Each row adds up to 1, for example [0.330, 0.670, 0]</td></tr>
        <tr><td><code>test_first_token_attends_only_to_itself_when_causal</code></td><td>Any input, causal</td><td>Row 0 of the weights is [1, 0, 0, ...]</td></tr>
        <tr><td><code>test_output_is_inside_the_range_of_values</code></td><td>Random small matrices (fixed seed)</td><td>Each output number is between the minimum and maximum of that value column</td></tr>
        <tr><td><code>test_shape_mismatch_raises_value_error</code></td><td>q rows of length 2, k rows of length 3</td><td><code>ValueError</code> with a message that names both lengths</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table.</p>`,
    nfr: `
      <ul>
        <li><strong>Correctness first:</strong> readable loops are fine. Speed does not matter for 3 to 10 tokens.</li>
        <li><strong>Numerical safety:</strong> no overflow for large scores; no division by zero when every allowed score is very negative.</li>
        <li><strong>No new dependencies:</strong> standard library only, so the tests run anywhere T-001 runs.</li>
        <li><strong>Security and cost:</strong> the unit tests make no API calls. The stretch reads the key only from <code>ANTHROPIC_API_KEY</code>, uses <code>claude-haiku-5-5</code>, and prints the cost line from T-001 for each call. Never print the key.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Why must the mask be applied before the softmax? Use the numbers from your failing test in milestone 3.</li>
        <li>Your function makes n × n scores. For a prompt of 20,000 tokens, how many scores is that per head per layer? Why does the API bill not grow in the same way?</li>
        <li>Why does subtracting the row maximum not change the result of the softmax? Show it in one line of algebra.</li>
        <li>With the causal mask, which rows of the weight table stay the same when you add a fourth token? What does this tell you about the KV cache?</li>
        <li>Stretch only: what did the placement experiment show, how many runs was it based on, and what would make you trust the result more?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, demo output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>You computed one row on paper before you ran the code, and the numbers match.</li>
        <li>You can explain each line of <code>attention.py</code> without notes, including the max subtraction and the mask.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the mask is applied before the softmax; the softmax is stable;
      shape errors are clear; tests are named after properties and include the hand-computed example; no new dependency; and how well your answers to the questions show understanding.</p>`
  }
};
