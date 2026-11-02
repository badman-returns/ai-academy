/*
 * Lesson 1.5 - The transformer block.
 * Ticket T-005 - One transformer block by hand: a tested forward pass.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Worked examples:
 *   Residual: the "sat" numbers of lesson 1.4, x = [1, 1], attention output [0.497, 0.752].
 *   Layer norm: [2, 4, 6, 8] -> [-1.342, -0.447, 0.447, 1.342] (eps = 1e-5).
 *   Feed-forward: z = [1, 2], W1 (2 x 4), ReLU, W2 (4 x 2) -> [0.5, -1.0].
 *   Parameter count: d_model = 512 and d_ff = 2048 (the base model of the original
 *   transformer paper) -> 3,145,728 weights in one block, without biases.
 * The interactive for this lesson is in 05-ix.js (id "l1-5-block"). Its toy numbers are
 * also the fixture of ticket T-005.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.5"] = {
  id: "1.5",
  topic: "t1",
  title: "The transformer block",
  objective: "Explain how one transformer block combines attention, the feed-forward layer, the residual connections and layer norm, say why each part is necessary, compute each part by hand on small numbers, and connect the block to model size, compute cost and the next lessons.",
  prerequisites: [
    "Lesson 1.4: attention with query, key and value, the softmax weights and the causal mask.",
    "Lesson 1.3 helps: vectors, the dot product, vector length and cosine similarity.",
    "You can add, multiply and take a square root of small numbers. No linear algebra course is necessary."
  ],
  covers: ["t1-block"],
  whyItMatters: `
    <p>Lesson 1.4 showed attention. But attention is only one part of a transformer. A model such as Claude is a <strong>stack of identical blocks</strong>.
    Each block has the same four parts: attention, a feed-forward layer, residual connections and layer norm. When you know one block, you know the shape of the whole model.</p>
    <p>For an application engineer, the block explains three things that you see in production. The first is model size: most of the parameters are in the blocks, and you can estimate them from two numbers.
    The second is compute cost: each parameter does about one multiply-add for each token, so short prompts cost compute in proportion to the token count.
    The third is why "the model" is not one place that stores one fact: each block adds a small change to each token's vector.
    In an interview, "draw a transformer block and explain each part" is a common question. A good answer says why each part is necessary, not only what it is.</p>`,
  concepts: [
    { id: "l1-5-c-shape", name: "A block maps n vectors of size d_model to n vectors of the same size, so blocks stack" },
    { id: "l1-5-c-ffn", name: "The feed-forward layer: a per-token MLP with a non-linear activation" },
    { id: "l1-5-c-residual", name: "Residual connections: each part adds to the vector, it does not replace it" },
    { id: "l1-5-c-layernorm", name: "Layer norm: mean 0 and variance 1 over the features of one token" },
    { id: "l1-5-c-preln", name: "Pre-LN compared to post-LN, and the final layer norm" },
    { id: "l1-5-c-params", name: "Parameters per block: about 12 × d_model² when d_ff = 4 × d_model" },
    { id: "l1-5-c-position", name: "Where position information enters the model" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Tokens talk, then each token thinks alone",
      blocks: [
        { type: "html", html: `
          <p>In lesson 1.4, each token used attention to collect information from the other tokens. That is one step. A transformer repeats a larger unit many times. This unit is the <strong>transformer block</strong>.</p>
          <p>One block has two main parts. Each part has a helper before it and a connection around it:</p>
          <ol>
            <li><strong>Attention.</strong> The tokens exchange information. "it" can collect information from "cat". (Lesson 1.4.)</li>
            <li><strong>Feed-forward layer.</strong> Each token works alone on what it has now. The same small neural network runs on each token separately. It does not look at the other tokens.</li>
            <li><strong>Residual connection.</strong> Each part <em>adds</em> its result to the token's vector. It does not replace the vector. So the information that came in is not lost.</li>
            <li><strong>Layer norm.</strong> Before each part reads a vector, layer norm brings the numbers of that vector to a standard range. So each part always gets input of a similar size.</li>
          </ol>
          <p>The output of a block has the same shape as its input: one vector of the same size for each token. So the output of block 1 can go into block 2, then block 3, and so on.
          A large model has many blocks in a stack.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a meeting, then desk work, with a shared notebook", html: `
          <p>Think of each token as one engineer with one notebook.</p>
          <ul>
            <li><strong>Attention is the meeting.</strong> Each engineer listens to the others and writes a short note about what they heard.</li>
            <li><strong>The feed-forward layer is the desk work.</strong> Each engineer goes back to the desk, reads the notebook and adds a note from what they know. Nobody talks at the desk.</li>
            <li><strong>The residual connection is the notebook.</strong> Each step adds a note. Nobody tears out the old pages.</li>
            <li><strong>Layer norm is a fixed reading speed.</strong> Before the meeting and before the desk work, each engineer reads the notebook in the same way, no matter how much is written in it.</li>
          </ul>
          <p>One block is one meeting and one session of desk work. A model repeats this many times.</p>` },
        { type: "diagram", caption: "One transformer block in the pre-LN order. The horizontal line is the residual path: each part reads from it and adds its result back to it.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="The input x goes along a horizontal residual path. The first branch goes through layer norm and attention and is added back to the path. The second branch goes through layer norm and the feed-forward layer and is added back. The result goes to the next block.">
            <defs><marker id="l15a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker>
            <marker id="l15a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow-accent"/></marker></defs>
            <text x="14" y="30" class="d-small">x (one vector per token)</text>
            <line x1="14" y1="50" x2="283" y2="50" class="d-line-accent" marker-end="url(#l15a2)"/>
            <circle cx="300" cy="50" r="16" class="d-box-accent"/><text x="300" y="55" text-anchor="middle" class="d-bold">+</text>
            <line x1="316" y1="50" x2="563" y2="50" class="d-line-accent" marker-end="url(#l15a2)"/>
            <circle cx="580" cy="50" r="16" class="d-box-accent"/><text x="580" y="55" text-anchor="middle" class="d-bold">+</text>
            <line x1="596" y1="50" x2="630" y2="50" class="d-line-accent" marker-end="url(#l15a2)"/>
            <text x="630" y="30" text-anchor="end" class="d-small">to the next block</text>
            <line x1="40" y1="50" x2="40" y2="108" class="d-line" marker-end="url(#l15a1)"/>
            <rect x="14" y="110" width="96" height="44" rx="8" class="d-box"/><text x="62" y="137" text-anchor="middle" class="d-text">Layer norm</text>
            <line x1="110" y1="132" x2="138" y2="132" class="d-line" marker-end="url(#l15a1)"/>
            <rect x="140" y="110" width="120" height="44" rx="8" class="d-box-info"/><text x="200" y="131" text-anchor="middle" class="d-bold">Attention</text><text x="200" y="147" text-anchor="middle" class="d-small">tokens exchange</text>
            <path d="M260,132 L300,132 L300,68" class="d-line" marker-end="url(#l15a1)"/>
            <line x1="330" y1="50" x2="330" y2="108" class="d-line" marker-end="url(#l15a1)"/>
            <rect x="320" y="110" width="96" height="44" rx="8" class="d-box"/><text x="368" y="137" text-anchor="middle" class="d-text">Layer norm</text>
            <line x1="416" y1="132" x2="438" y2="132" class="d-line" marker-end="url(#l15a1)"/>
            <rect x="440" y="110" width="120" height="44" rx="8" class="d-box-good"/><text x="500" y="131" text-anchor="middle" class="d-bold">Feed-forward</text><text x="500" y="147" text-anchor="middle" class="d-small">each token alone</text>
            <path d="M560,132 L580,132 L580,68" class="d-line" marker-end="url(#l15a1)"/>
            <text x="300" y="186" text-anchor="middle" class="d-small">residual connection 1</text>
            <text x="580" y="186" text-anchor="end" class="d-small">residual connection 2</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>There are no notes in words.</strong> Each "note" is a vector of numbers that is added to the token's vector. Training sets what the numbers mean. Nobody wrote the rules.</li>
            <li><strong>The engineers are not separate people.</strong> All tokens use the same attention weights and the same feed-forward weights in one block. Only the vectors are different.</li>
            <li><strong>The blocks are not copies.</strong> All blocks have the same parts and shapes, but each block has its own learned weights.</li>
          </ul>` },
        { type: "interactive", id: "l1-5-block" },
        { type: "html", html: `
          <h3>From one block to a whole model</h3>
          <p>A decoder-only LLM puts the blocks between the input and the output that you know from lessons 1.1 to 1.3:</p>
          <ol>
            <li>The text becomes tokens (lesson 1.2).</li>
            <li>Each token becomes a vector: its embedding plus position information (lesson 1.3 and level 2 of this lesson).</li>
            <li>The vectors go through block 1, block 2, and so on, to the last block.</li>
            <li>A last layer norm and an output layer change the vector of the last token into one logit for each token in the vocabulary. Softmax and sampling choose the next token (lesson 1.1).</li>
          </ol>
          <p>The number of blocks, the vector size d<sub>model</sub> and the size of the feed-forward layer set most of the parameters of a model. Level 2 shows how to count them.</p>` }
      ],
      checks: [
        { id: "l1-5-L1-a", type: "mcq",
          q: "What does the feed-forward layer do that attention does not do?",
          options: [
            "It moves information from one token to another token.",
            "It works on each token's vector alone, with the same weights for every token, and changes what that vector contains.",
            "It chooses the next token from the vocabulary.",
            "It removes the tokens that are not important."
          ],
          correct: 1,
          explain: "Attention moves information between tokens. The feed-forward layer runs the same small network on each token separately and does not look at the other tokens. The output layer after the last block gives the logits for the next token." },
        { id: "l1-5-L1-b", type: "mcq",
          q: "A block adds the attention result to the token's vector, and does not replace the vector with it. What is this called, and what does it keep?",
          options: [
            "Layer norm. It keeps the length of the vector at 1.",
            "The causal mask. It keeps later tokens hidden.",
            "A residual connection. It keeps the information that came into the block, and the part adds only a change.",
            "Multi-head attention. It keeps one copy for each head."
          ],
          correct: 2,
          explain: "The residual connection computes x + part(x). The input x passes through unchanged, and the part adds a change. In the interactive, switch off the residual connections: the output of \"sat\" then has a cosine of -0.11 with its input, so the token's own information is lost." },
        { id: "l1-5-L1-c", type: "recall",
          q: "Name the four parts of a transformer block and give the job of each part in one sentence.",
          answer: "Attention lets each token collect information from earlier tokens. The feed-forward layer changes each token's vector alone, with the same weights for all tokens. The residual connections add each part's result to the vector, so the input is not lost. Layer norm brings each vector to a standard range before a part reads it." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Compute each part by hand, then count the parameters",
      blocks: [
        { type: "html", html: `
          <h3>The block as two lines of code</h3>
          <p>Most current decoder LLMs use the <strong>pre-LN</strong> order (level 3 compares it with the original order). For the vectors <code>x</code> of all tokens:</p>
          <pre class="code-block" data-lang="formula"><code>h = x + Attention(LayerNorm1(x))
y = h + FeedForward(LayerNorm2(h))</code></pre>
          <ul>
            <li><code>x</code> is an n × d<sub>model</sub> matrix: one row of size d<sub>model</sub> for each of the n tokens.</li>
            <li><code>Attention</code> is the multi-head attention of lesson 1.4, with the output matrix <code>W<sub>O</sub></code>. It returns n × d<sub>model</sub>.</li>
            <li><code>FeedForward</code> works on each row alone and returns n × d<sub>model</sub>.</li>
            <li>So <code>h</code> and <code>y</code> are also n × d<sub>model</sub>. The shape does not change. This is why you can stack blocks: each block is a function from one shape to the same shape.</li>
          </ul>
          <p>A software comparison: a block is like a middleware in a web framework. Each middleware takes a request and returns a request of the same type, so you can chain as many as you need.</p>` },
        { type: "worked", title: "Worked example: the residual connection with the numbers of lesson 1.4",
          intro: "In lesson 1.4, the toy values were The = [1, 0], cat = [0, 1], sat = [1, 1], and attention gave the output [0.497, 0.752] for \"sat\". Here, suppose the vector that enters the block for \"sat\" is x = [1, 1], and W<sub>O</sub> does not change the attention output. This example skips layer norm to keep the arithmetic short.",
          steps: [
            { html: "Without a residual connection, the new vector is only the attention output: <strong>[0.497, 0.752]</strong>. The vector [1, 1] that came in is gone. Only a mix of the values is left." },
            { html: "With a residual connection, the new vector is h = x + attention = [1 + 0.497, 1 + 0.752] = <strong>[1.497, 1.752]</strong>. The input is still there, and attention added a change of [0.497, 0.752]." },
            { faded: true, html: "Your turn. Suppose a badly trained part returns [0, 0] for every input. What is h with a residual connection, and what is h without one?",
              answer: "With a residual connection: h = [1, 1] + [0, 0] = [1, 1]. The block passes the input through unchanged. Without one: h = [0, 0], and all information is lost. This is why a deep stack with residual connections can start from a safe point: a part that does nothing useful does no damage." }
          ] },
        { type: "html", html: `
          <h3>Layer norm</h3>
          <p>Layer norm works on <strong>one token's vector</strong> at a time, over its d<sub>model</sub> numbers (its features). It does not mix tokens. It has three steps:</p>
          <ol>
            <li>Compute the mean μ of the numbers in the vector.</li>
            <li>Compute the variance σ² (the mean of the squared differences from μ).</li>
            <li>Compute <code>(x<sub>i</sub> − μ) / √(σ² + ε)</code> for each number. ε is a small number, for example 10<sup>−5</sup>, that prevents a division by zero.</li>
          </ol>
          <p>The result has mean 0 and variance 1. Then layer norm multiplies each feature by a learned scale γ and adds a learned shift β (level 3). In the examples, γ = 1 and β = 0.</p>` },
        { type: "worked", title: "Worked example: layer norm by hand",
          intro: "One token vector with 4 features: x = [2, 4, 6, 8]. ε = 10<sup>−5</sup> is too small to change the 3 decimals.",
          steps: [
            { html: "Mean: (2 + 4 + 6 + 8) / 4 = <strong>5</strong>. Differences from the mean: −3, −1, 1, 3." },
            { html: "Variance: (9 + 1 + 1 + 9) / 4 = <strong>5</strong>. √5 = 2.236." },
            { html: "Divide: −3 / 2.236 = <strong>−1.342</strong>, −1 / 2.236 = <strong>−0.447</strong>, 0.447, 1.342. The result [−1.342, −0.447, 0.447, 1.342] has mean 0 and variance 1." },
            { faded: true, html: "Your turn. Compute layer norm for [20, 40, 60, 80]. Compare the result with the result for [2, 4, 6, 8].",
              answer: "Mean 50, differences −30, −10, 10, 30, variance 500, √500 = 22.361. The result is [−1.342, −0.447, 0.447, 1.342], the same as before. Layer norm removes the scale of the input. In the interactive, change the input scale with layer norm on: the attention weights do not change." },
            { faded: true, html: "Your turn. The vector of \"sat\" in the interactive is [1, 1, 0, 2]. Compute its layer norm. Then compute the layer norm of [3, 3, 3, 3].",
              answer: "For [1, 1, 0, 2]: mean 1, differences 0, 0, −1, 1, variance 0.5, √0.5 = 0.707. The result is [0, 0, −1.414, 1.414]. The interactive shows the same row for layer norm 1. For [3, 3, 3, 3]: mean 3, all differences 0, variance 0. Without ε the division is 0 / 0. With ε the result is [0, 0, 0, 0]." }
          ] },
        { type: "html", html: `
          <h3>The feed-forward layer</h3>
          <p>The feed-forward layer is a small neural network with one hidden layer, also called an MLP (multi-layer perceptron). For one token vector <code>z</code>:</p>
          <pre class="code-block" data-lang="formula"><code>FeedForward(z) = activation(z · W1 + b1) · W2 + b2</code></pre>
          <ul>
            <li><code>W1</code> is d<sub>model</sub> × d<sub>ff</sub>. It makes the vector larger. The original transformer paper uses d<sub>ff</sub> = 4 × d<sub>model</sub> (2048 and 512).</li>
            <li>The activation is a non-linear function. The original paper uses ReLU: <code>max(0, value)</code>. GPT-2 uses a smooth version called GELU.</li>
            <li><code>W2</code> is d<sub>ff</sub> × d<sub>model</sub>. It makes the vector small again, so the result can be added to the residual path.</li>
          </ul>` },
        { type: "worked", title: "Worked example: a feed-forward layer by hand",
          intro: "A toy with d<sub>model</sub> = 2 and d<sub>ff</sub> = 4. The biases are 0. The input is z = [1, 2]. W1 has the rows [1, −1, 0, 1] and [0, 1, −1, 1]. W2 has the rows [0.5, 0], [0, 0.5], [1, 1] and [0, −0.5].",
          steps: [
            { html: "Hidden layer: z · W1 = 1 × [1, −1, 0, 1] + 2 × [0, 1, −1, 1] = <strong>[1, 1, −2, 3]</strong>." },
            { html: "ReLU sets the negative numbers to 0: <strong>[1, 1, 0, 3]</strong>. The third hidden unit is off for this input." },
            { html: "Output: 1 × [0.5, 0] + 1 × [0, 0.5] + 0 × [1, 1] + 3 × [0, −0.5] = <strong>[0.5, −1.0]</strong>. The block adds this vector to the residual path." },
            { faded: true, html: "Your turn. Do the same computation without ReLU. Then compute the single matrix M = W1 · W2 and compute z · M. What do you see?",
              answer: "Without ReLU: 1 × [0.5, 0] + 1 × [0, 0.5] − 2 × [1, 1] + 3 × [0, −0.5] = [−1.5, −3.0]. M has the rows [0.5, −1.0] and [−1, −1], and z · M = [0.5 − 2, −1 − 2] = [−1.5, −3.0], the same. Without an activation, two matrices act like one matrix. The non-linear activation is what lets the layer compute more than a linear map." }
          ] },
        { type: "note", kind: "fact", title: "Count the parameters of one block", html: `
          <p>Count the weights of one block with d<sub>model</sub> = d and d<sub>ff</sub> = 4d. Biases and layer norm add only a few numbers per feature, so this count leaves them out.</p>
          <ul>
            <li>Attention: W<sub>Q</sub>, W<sub>K</sub>, W<sub>V</sub> and W<sub>O</sub>, each d × d. In total <strong>4d²</strong>. The number of heads does not change this, because the heads divide d between them (lesson 1.4).</li>
            <li>Feed-forward: W1 is d × 4d and W2 is 4d × d. In total <strong>8d²</strong>.</li>
            <li>One block: <strong>12d²</strong>. The feed-forward layer has two thirds of the weights.</li>
          </ul>
          <p>Example with the base model of the original transformer paper, d<sub>model</sub> = 512 and d<sub>ff</sub> = 2048:</p>
          <div class="table-wrap"><table>
            <tr><th>Part</th><th>Formula</th><th>Weights</th></tr>
            <tr><td>Attention</td><td>4 × 512 × 512</td><td>1,048,576</td></tr>
            <tr><td>Feed-forward</td><td>2 × 512 × 2048</td><td>2,097,152</td></tr>
            <tr><td>One block</td><td>12 × 512²</td><td>3,145,728</td></tr>
          </table></div>
          <p>What this means for you:</p>
          <ul>
            <li><strong>Model size is mostly blocks.</strong> The parameter count is about the number of blocks × 12d², plus the embedding table (vocabulary size × d).</li>
            <li><strong>Each weight is used once for each token.</strong> One token through one block needs about 12d² multiply-adds. So the main compute of a prompt grows in proportion to its token count. Level 3 adds the part of attention that grows faster.</li>
            <li><strong>Memory comes first.</strong> To serve a model, the server must hold all the weights in GPU memory. This is one reason why larger models cost more per token.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Where the order of the tokens comes from</h3>
          <p>An attention score compares the content of a query and a key. Nothing in that dot product says how far apart the two tokens are.
          The feed-forward layer and layer norm work on one token at a time, so they do not see the order either. The model must get position information in some other way. Three common methods:</p>
          <ul>
            <li><strong>Fixed position vectors.</strong> The original transformer paper adds a sine and cosine pattern for each position to the token embeddings, before block 1.</li>
            <li><strong>Learned position vectors.</strong> GPT-2 learns one vector for each position and adds it to the token embedding.</li>
            <li><strong>Rotary position embedding (RoPE).</strong> Many newer open models rotate the query and the key in each attention layer by an angle that depends on the position. Then the score of two tokens depends on their distance.</li>
          </ul>
          <p>You do not choose this as an API user. It explains one fact: a model can be weak at positions that it did not see in training, for example lengths beyond its training context.</p>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>"Attention moves information and the feed-forward layer stores knowledge" is a useful first picture. Research supports a part of it: some feed-forward units act like stored key-value pairs (level 3).
          But real models spread information over many blocks and parts. Use the picture to ask good questions, not as an exact map.</p>` }
      ],
      checks: [
        { id: "l1-5-L2-a", type: "mcq",
          q: "What is the layer norm of the vector [1, 3]? Use γ = 1, β = 0, and ignore ε.",
          options: ["[−1, 1]", "[0.25, 0.75]", "[1, 3]", "[−0.5, 0.5]"],
          correct: 0,
          explain: "Mean 2, differences −1 and 1, variance (1 + 1) / 2 = 1, √1 = 1. The result is [−1, 1]. When a vector has only 2 features and they are different, layer norm always gives −1 and 1. So a real model needs many more features." },
        { id: "l1-5-L2-b", type: "mcq",
          q: "One block has d_model = 1024 and d_ff = 4096. About how many weights does it have, without biases and layer norm?",
          options: ["4,194,304", "8,388,608", "12,582,912", "1,048,576"],
          correct: 2,
          explain: "Attention: 4 × 1024² = 4,194,304. Feed-forward: 2 × 1024 × 4096 = 8,388,608. Total: 12,582,912, which is 12 × 1024². The first two options are the parts, not the total." },
        { id: "l1-5-L2-c", type: "recall",
          q: "Why must the feed-forward layer have a non-linear activation such as ReLU?",
          answer: "Without it, z · W1 · W2 equals z · M with the single matrix M = W1 · W2. Two linear layers act like one linear layer, so the extra size gives no extra power. The activation makes the result depend on the input in a non-linear way, so the layer can compute more than a linear map. In the worked example, ReLU switched off one hidden unit and changed the output from [−1.5, −3.0] to [0.5, −1.0]." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why each part is necessary, pre-LN, and the cost per token",
      blocks: [
        { type: "html", html: `
          <h3>Why residual connections make deep stacks trainable</h3>
          <p>Training changes each weight by its gradient: how much the loss changes when the weight changes. The gradient for an early block must pass back through all the later blocks.</p>
          <ul>
            <li>Without residual connections, each block is y = F(x). The gradient is multiplied by the derivative of F in each block. Many factors smaller than 1 make the gradient very small. Many factors larger than 1 make it very large. Both problems stop the training of deep networks.</li>
            <li>With residual connections, each block is y = x + F(x). The derivative is 1 + F′(x). The "1" gives the gradient a direct path back to every block.</li>
          </ul>
          <p>Residual connections come from image models: the ResNet paper (He et al., 2015) used them to train much deeper networks. The transformer uses the same idea.
          A second effect: at the start of training, a block with small weights is almost the identity function. The stack starts from "do nothing" and each block learns a small change.</p>
          <p>Interpretability research calls the path through the residual connections the <strong>residual stream</strong>. Each block reads from the stream and writes a change back to it. So a later block can use what any earlier block wrote.</p>` },
        { type: "html", html: `
          <h3>Layer norm in detail</h3>
          <p><code>LayerNorm(x)<sub>i</sub> = γ<sub>i</sub> · (x<sub>i</sub> − μ) / √(σ² + ε) + β<sub>i</sub></code>, where μ and σ² are the mean and variance over the d<sub>model</sub> features of one token.</p>
          <ul>
            <li>γ and β are learned vectors of size d<sub>model</sub>. They let the model choose the scale and shift of each feature again after the normalization.</li>
            <li>The statistics come from one token only. So the output for a token does not depend on the other tokens, on the other requests in a batch, or on the batch size. This is different from batch norm, which is common in image models.</li>
            <li>Why it is necessary: without it, the size of the vectors can grow or shrink from block to block. Then the attention scores (dot products) become too sharp or too flat, and training becomes unstable. In the interactive, switch off layer norm and set 12 blocks: the length of the toy vector grows from 3.3 to more than 35,000. With layer norm on, it grows only to 14.9.</li>
            <li>Some newer open models, for example LLaMA (Touvron et al., 2023), use RMSNorm. RMSNorm divides by the root mean square and does not subtract the mean.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Pre-LN compared to post-LN</h3>
          <ul>
            <li><strong>Post-LN</strong>, used in the original transformer paper (2017). One sublayer:<br><code>x = LayerNorm(x + Sublayer(x))</code></li>
            <li><strong>Pre-LN</strong>, used in GPT-2 and many later decoder models. One sublayer:<br><code>x = x + Sublayer(LayerNorm(x))</code></li>
          </ul>
          <ul>
            <li>In post-LN, the residual path goes through a layer norm in every block. In pre-LN, the residual path has no layer norm, so the direct gradient path of the residual connection stays clean.</li>
            <li>Research (Xiong et al., 2020) found that pre-LN transformers train more stably, and can train without the learning rate warm-up that post-LN needs.</li>
            <li>In pre-LN, the residual stream itself is not normalized. So the model needs <strong>one final layer norm</strong> after the last block, before the output layer. The GPT-2 paper adds it.</li>
          </ul>` },
        { type: "code", lang: "python", code:
`import math

def layer_norm(x, eps=1e-5):
    mean = sum(x) / len(x)
    var = sum((xi - mean) ** 2 for xi in x) / len(x)
    return [(xi - mean) / math.sqrt(var + eps) for xi in x]

def matvec(v, W):                       # v (length r) times W (r rows, c columns)
    return [sum(v[r] * W[r][c] for r in range(len(v))) for c in range(len(W[0]))]

def feed_forward(z, W1, W2):
    hidden = [max(0.0, h) for h in matvec(z, W1)]   # ReLU
    return matvec(hidden, W2)

def block(xs, attention, W1, W2):
    """Pre-LN block. attention(rows) returns one row for each input row."""
    att = attention([layer_norm(x) for x in xs])
    hs = [[a + b for a, b in zip(x, at)] for x, at in zip(xs, att)]       # residual 1
    return [[a + b for a, b in zip(h, feed_forward(layer_norm(h), W1, W2))]
            for h in hs]                                                  # residual 2

print(layer_norm([2, 4, 6, 8]))                 # [-1.342, -0.447, 0.447, 1.342]
W1 = [[1, -1, 0, 1], [0, 1, -1, 1]]
W2 = [[0.5, 0], [0, 0.5], [1, 1], [0, -0.5]]
print(feed_forward([1, 2], W1, W2))             # [0.5, -1.0]` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This code shows the order of the operations and checks the hand numbers. It has no biases, no γ and β, and no input checks. Ticket T-005 asks you to write a complete version with tests, and to use your attention function from T-004.</p>` },
        { type: "html", html: `
          <h3>What the feed-forward layer seems to do</h3>
          <p>Research (Geva et al., 2021) describes the feed-forward layer as a key-value memory. Each column of W1 acts like a key: it detects a pattern in the input vector.
          The matching row of W2 acts like a value: when the pattern is present, the hidden unit is active, and its row of W2 is added to the residual stream.
          The 3Blue1Brown video "How might LLMs store facts" (Chapter 7, in the resources) shows this idea with a visual example. It is a hypothesis that fits some measurements, not a complete explanation.</p>
          <p>Some newer open models use a gated feed-forward layer, for example SwiGLU in LLaMA. It has three matrices instead of two. The parameter count changes, but the idea of a per-token MLP stays the same.</p>` },
        { type: "worked", title: "Worked example: when does attention cost more than the weights?",
          intro: "Count multiply-adds for one new token at position n in one block, with d<sub>model</sub> = d. This is a rough count: it ignores softmax, layer norm, biases and the activation.",
          steps: [
            { html: "Weights: each of the 12d² weights does one multiply-add for the token. That is <strong>12d²</strong>, and it does not depend on n." },
            { html: "Attention scores and mix: the query does a dot product of size d with n keys (n × d), and the weights mix n values of size d (n × d). That is <strong>2nd</strong>, and it grows with n. (Over all heads, the head sizes add up to d.)" },
            { html: "The attention part is larger when 2nd > 12d², so when <strong>n > 6d</strong>. For d = 512 (the original base model), that is n > 3,072 tokens." },
            { faded: true, html: "Your turn. Use d = 512. Compute the weight part and the attention part for n = 1,000 and for n = 10,000. Which part is larger in each case?",
              answer: "Weight part: 12 × 512² = 3,145,728 for both. Attention part: 2 × 1,000 × 512 = 1,024,000 for n = 1,000 (the weights are larger), and 2 × 10,000 × 512 = 10,240,000 for n = 10,000 (attention is larger). This is why short prompts cost compute about in proportion to the token count, and very long prompts cost more than that." }
          ] },
        { type: "html", html: `
          <h3>Connections to the next lessons</h3>
          <ul>
            <li><strong>Pretraining and post-training (lesson 1.6).</strong> All the weights in this lesson (W<sub>Q</sub>, W<sub>K</sub>, W<sub>V</sub>, W<sub>O</sub>, W1, W2, γ, β, and the embeddings) start as random numbers. Pretraining sets them with one task: predict the next token on a very large amount of text. Post-training changes them again so that the model follows instructions. Lesson 1.6 explains both steps.</li>
            <li><strong>The KV cache (lesson 1.7).</strong> Each block has its own attention, so each block stores its own keys and values for each earlier token. The cache size grows with the number of blocks and with the context length.</li>
            <li><strong>Model choice (Topic 6).</strong> When you compare models, the number of parameters tells you about memory and compute per token. It does not tell you the quality on your task. Measure that with an eval (Topic 5).</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-5-L3-a", type: "mcq",
          q: "In a pre-LN transformer, where is layer norm applied?",
          options: [
            "Only once, on the token embeddings before block 1.",
            "At the input of each sublayer (attention and feed-forward), and one more time after the last block, before the output layer. The residual path itself is not normalized.",
            "After each residual addition, as in the original transformer paper.",
            "Only on the attention weights, after the softmax."
          ],
          correct: 1,
          explain: "Pre-LN computes x + Sublayer(LayerNorm(x)). The residual path stays clean, so the model needs a final layer norm before the output layer. The third option describes post-LN." },
        { id: "l1-5-L3-b", type: "mcq",
          q: "Use the rough count of this lesson for a model with d_model = 2048. From which context length is the attention part of the work per new token larger than the weight part?",
          options: ["2,048 tokens", "12,288 tokens", "24,576 tokens", "4,194,304 tokens"],
          correct: 1,
          explain: "The attention part is larger when 2nd > 12d², so when n > 6d = 6 × 2048 = 12,288. This count ignores softmax, layer norm and other small costs, so treat it as an estimate." },
        { id: "l1-5-L3-c", type: "recall",
          q: "Explain why residual connections help a deep stack of blocks to train.",
          answer: "With y = x + F(x), the derivative is 1 + F'(x). The 1 gives the gradient a direct path back to every early block, so the gradient does not become very small or very large after many blocks. Also, a block with small weights is almost the identity, so a new stack starts from \"do nothing\" and each block learns a small change." }
      ]
    }
  ],

  debugging: [
    { id: "l1-5-dbg-1", title: "The residual addition fails with a length error",
      symptom: "Your block function works for attention. The first test that runs the feed-forward part crashes at the second residual addition.",
      evidence: "ValueError: residual add needs equal lengths, got 4 and 8",
      hints: [
        "What is the length of the vector after W1 and the activation?",
        "Which matrix brings the vector back to d_model?"
      ],
      answer: "The function returns the hidden layer (length d_ff = 8) and does not multiply it by W2. The residual path has length d_model = 4, so the addition fails. Fix: multiply the activated hidden vector by W2 (d_ff × d_model). Add a test that checks that the block output has the same shape as its input." },
    { id: "l1-5-dbg-2", title: "Layer norm crashes on a padding vector",
      symptom: "The block test passes on the toy tokens. A new test with a padding token whose vector is all zeros crashes.",
      evidence: "ZeroDivisionError: float division by zero  (in layer_norm)",
      hints: [
        "What is the variance of [0, 0, 0, 0]?",
        "What is the job of ε in the formula?"
      ],
      answer: "All numbers are equal, so the variance is 0 and the code divides by √0. The code left out ε. Fix: divide by √(variance + ε), with ε = 1e-5. Then [0, 0, 0, 0] gives [0, 0, 0, 0], and [3, 3, 3, 3] also gives [0, 0, 0, 0]. Add a test for a constant vector." },
    { id: "l1-5-dbg-3", title: "Earlier outputs change when a token is added",
      symptom: "With the causal mask on, your test adds a fourth token and checks that the outputs of the first three tokens do not change. The test fails, even though the attention test from T-004 passes.",
      evidence: "AssertionError: output of token 0 changed after a fourth token was appended (rows 1 and 2 also changed)",
      hints: [
        "With the causal mask, which tokens can token 0 see? Which other part of the block could still see token 3?",
        "Over which numbers does your layer norm compute the mean: the features of one token, or one feature over all tokens?"
      ],
      answer: "The layer norm computes the mean and variance over the tokens (a column of the matrix), not over the features of one token (a row). So a new token changes the normalization of every earlier token, and the causal property breaks. Fix: normalize each row separately. Then the earlier outputs stay the same, and this is also what makes the KV cache of lesson 1.7 correct." }
  ],

  recall: [
    { id: "l1-5-r1", q: "Write the two lines of a pre-LN transformer block.", a: "h = x + Attention(LayerNorm1(x)); y = h + FeedForward(LayerNorm2(h)). Each line is a residual connection around one sublayer, with layer norm at the input of the sublayer." },
    { id: "l1-5-r2", q: "What does the feed-forward layer compute, and what is the usual size of its hidden layer?", a: "FFN(z) = activation(z · W1 + b1) · W2 + b2, on each token separately with the same weights. The original paper uses d_ff = 4 × d_model (2048 for d_model = 512) and ReLU." },
    { id: "l1-5-r3", q: "What does layer norm do, and over which numbers?", a: "Over the d_model features of one token, it subtracts the mean, divides by √(variance + ε), then multiplies by the learned γ and adds the learned β. It does not mix tokens." },
    { id: "l1-5-r4", q: "Why are residual connections necessary?", a: "They give the gradient a direct path back to early blocks (derivative 1 + F'), so deep stacks can train. They keep the input information, and each block only adds a change. A block with small weights starts close to the identity." },
    { id: "l1-5-r5", q: "About how many weights does one block have when d_ff = 4 × d_model?", a: "About 12 × d_model²: 4d² for W_Q, W_K, W_V and W_O, and 8d² for W1 and W2. For d_model = 512 that is 3,145,728. Biases and layer norm add little." },
    { id: "l1-5-r6", q: "What is the difference between pre-LN and post-LN?", a: "Post-LN (original paper): LayerNorm(x + Sublayer(x)). Pre-LN (GPT-2 and many later models): x + Sublayer(LayerNorm(x)), plus a final layer norm before the output layer. Pre-LN trains more stably." },
    { id: "l1-5-r7", q: "Why does the model need position information, and where can it enter?", a: "Attention scores compare only content, and the feed-forward layer and layer norm work per token, so nothing sees the order. Fixed or learned position vectors are added to the embeddings, or RoPE rotates the queries and keys inside attention." }
  ],

  interview: [
    { q: "Draw a transformer block and explain why each part is there.",
      outline: "Residual path with two branches. Branch 1: layer norm, multi-head attention, add back: tokens exchange information. Branch 2: layer norm, feed-forward MLP (d_ff about 4 × d_model, non-linear activation), add back: each token is transformed alone. Residuals: gradient path and no loss of input. Layer norm: keeps the input scale of each sublayer stable. Shape in = shape out, so blocks stack. Mention pre-LN and the final layer norm." },
    { q: "Where are most of the parameters of a transformer, and how do you estimate them?",
      outline: "In the blocks: about 12 × d_model² per block with d_ff = 4 × d_model (4d² attention, 8d² feed-forward), times the number of blocks, plus the embedding table (vocabulary × d_model). The feed-forward layers hold about two thirds of the block weights. Each weight is used once per token, so the compute per token is about one multiply-add per parameter, plus the attention part that grows with the context." },
    { q: "Why does a deep network need residual connections and normalization?",
      outline: "Without residuals, the gradient is a product of many per-block factors and vanishes or explodes. y = x + F(x) gives derivative 1 + F', a direct path. Without normalization, the vector scale drifts from block to block, attention scores become too sharp or flat, and training becomes unstable. Layer norm per token: mean 0, variance 1, then γ and β. Pre-LN keeps the residual path clean." },
    { q: "Layer norm compared to batch norm: why does the transformer use layer norm?",
      outline: "Layer norm normalizes over the features of one token, so the result does not depend on other tokens or on the batch. Batch norm normalizes one feature over a batch, which depends on batch size and on other examples, a bad fit for variable-length text, for causal generation one token at a time, and for a server that batches unrelated requests." },
    { q: "If attention moves information between tokens, why does the model need a feed-forward layer at all?",
      outline: "Attention output is a weighted average of value vectors, a mostly linear mix. The feed-forward layer applies a non-linear function to each token, with most of the parameters. Research reads it as a key-value memory that adds stored patterns to the residual stream. Without the activation, W1 · W2 would collapse into one matrix." }
  ],

  misconceptions: [
    { wrong: "A transformer block is the same thing as attention.", right: "Attention is one of the two sublayers. The other is the feed-forward layer, and the block also has residual connections and layer norm." },
    { wrong: "The feed-forward layer connects all tokens to each other.", right: "It works on each token separately, with the same weights for every token. Only attention moves information between tokens." },
    { wrong: "A residual connection replaces the vector with the output of the sublayer.", right: "It adds the output to the vector: x + Sublayer(x). The input information stays." },
    { wrong: "Layer norm normalizes each feature over all the tokens in the prompt.", right: "It normalizes over the features of one token. A token's result does not depend on the other tokens." },
    { wrong: "All blocks in a model share the same weights.", right: "All blocks have the same structure, but each block has its own learned weights." },
    { wrong: "Most of the parameters of a transformer are in attention.", right: "With d_ff = 4 × d_model, the feed-forward layers hold about two thirds of the block weights." },
    { wrong: "The attention dot product knows the order of the tokens.", right: "It compares only content. Position information must enter through position vectors or through RoPE." }
  ],

  resources: [
    { title: "Transformers, the tech behind LLMs (Chapter 5)", by: "3Blue1Brown", kind: "Video", url: "https://www.youtube.com/watch?v=wjZofJX0v4M",
      when: "Watch after level 1, before level 2.",
      why: "A visual tour of the whole model: embeddings, the blocks with attention and MLP parts, and the output layer.",
      watchFor: [
        "Which two kinds of blocks does the video name, and how many times do they repeat?",
        "What does the video show at the end of the model, to change a vector into a probability for each token?"
      ] },
    { title: "How might LLMs store facts (Chapter 7)", by: "3Blue1Brown", kind: "Video", url: "https://www.youtube.com/watch?v=9-Jl0dxWQs8",
      when: "Watch after level 2. It explains the feed-forward layer (MLP) in depth.",
      why: "A visual explanation of the feed-forward layer: the up projection, the activation, the down projection, and how the result is added to the vector.",
      watchFor: [
        "How does the video describe a row of the first matrix and a column of the second matrix?",
        "What does the video say about the share of the parameters that are in the MLP parts?",
        "How does the video add the MLP output back to the vector, and what is that step called?"
      ] },
    { title: "The Illustrated Transformer", by: "Jay Alammar", kind: "Article", url: "https://jalammar.github.io/illustrated-transformer/",
      when: "Read the parts on the encoder block and the residual connections after level 2.",
      why: "Pictures of one block with its feed-forward layer, residual connections and layer norm, in the original order.",
      watchFor: [
        "In the pictures, is the layer norm before or after the residual addition? Which order of level 3 is that?",
        "How does the article add position information to the input vectors?"
      ] },
    { title: "Let's build GPT: from scratch, in code, spelled out", by: "Andrej Karpathy", kind: "Video, long, optional", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
      when: "Optional, after level 3, if you want to see a block in PyTorch code.",
      why: "Builds a small GPT and adds the feed-forward layer, residual connections and layer norm to the attention step by step, and shows the effect on the loss.",
      note: "Use the chapter list on YouTube to find the parts on residual connections and layer norm. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "Where does the code put the layer norm: before or after each sublayer?",
        "What happens to the training loss when the video adds the residual connections?"
      ] },
    { title: "Attention Is All You Need", by: "Vaswani et al. (2017)", kind: "Paper, optional", url: "https://arxiv.org/abs/1706.03762",
      when: "Optional, after level 3. Read sections 3.1, 3.3 and 3.5 only.",
      why: "The original definition of the block, the position-wise feed-forward network and the position encoding.",
      watchFor: [
        "Which formula does section 3.1 give for the output of each sublayer? Is it pre-LN or post-LN?",
        "What values of d_model and d_ff does section 3.3 give, and which activation does it use?"
      ] }
  ],

  summary: `
    <ul>
      <li>A transformer is a stack of blocks. Each block has attention, a feed-forward layer, two residual connections and layer norm.</li>
      <li>Pre-LN block: h = x + Attention(LN(x)), then y = h + FFN(LN(h)). The output has the same shape as the input, so blocks stack.</li>
      <li>Attention moves information between tokens. The feed-forward layer changes each token alone, with a non-linear activation.</li>
      <li>Residual connections add each change to the vector. They keep the input and give the gradient a direct path in training.</li>
      <li>Layer norm gives each token vector mean 0 and variance 1 over its features, so each sublayer gets input of a stable size.</li>
      <li>One block has about 12 × d_model² weights when d_ff = 4 × d_model. The feed-forward layer has two thirds of them.</li>
      <li>Attention alone does not see the order of tokens. Position vectors or RoPE add it.</li>
    </ul>`,

  teachBack: "Draw one pre-LN transformer block on paper for a backend engineer. Say what each of the four parts does and what goes wrong without it. Compute the layer norm of [2, 4, 6, 8] and the parameter count for d_model = 512. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-005"]
};

/* ====================================================================== T-005 */
window.ACADEMY.tickets["T-005"] = {
  id: "T-005",
  title: "One transformer block by hand: a tested forward pass",
  lesson: "1.5",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. The optional stretch needs a second, short session.",
  fields: {
    objective: `
      <p>Write a small, pure Python module, <code>assistant/block.py</code>, with <code>layer_norm</code>, <code>feed_forward</code>, a pre-LN <code>transformer_block</code> and <code>count_block_parameters</code>.
      The block uses your attention function from T-004. Prove each part with tests that are named after the properties they check, and with the hand-computed numbers from lesson 1.5.</p>
      <p><strong>Real-world problem.</strong> Engineers often read "a 7B model" or "32 layers" and cannot connect the numbers to memory, compute or latency.
      They also cannot say why a model has residual connections or layer norm. A block that you wrote, traced and tested yourself gives you that model.
      It also gives you a correct answer for the common interview task "implement a transformer block".</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      The assistant does not call this module in production: Claude runs on the server. The module is a learning tool and a test bed.
      Phase 2 puts the assistant behind a FastAPI service. This ticket adds no endpoint.</p>
      <p>This ticket depends on T-001 (the project, the virtual environment and pytest) and on T-004 (<code>assistant/attention.py</code>). It adds new files only.
      The optional stretch uses the client from T-001 to ask Claude about your block trace, and then checks the answer against your own numbers.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.5, levels 1 and 2 complete. Level 3 helps for milestones 3 and 4.</li>
        <li>T-004 done: <code>assistant/attention.py</code> has <code>softmax</code> and <code>scaled_dot_product_attention</code> with the causal mask, and its tests pass.</li>
        <li>No new package. Use only the Python standard library (<code>math</code>, <code>json</code>, <code>dataclasses</code>). Do not add numpy for this ticket.</li>
        <li>The stretch only: <code>ANTHROPIC_API_KEY</code> in the environment, and the T-001 client in <code>assistant/llm.py</code>.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>layer_norm(x, eps=1e-5, gamma=None, beta=None) -&gt; list[float]</code> normalizes one vector over its features. Without gamma and beta, it uses 1 and 0.</li>
        <li><code>feed_forward(z, w1, w2, b1=None, b2=None) -&gt; list[float]</code> computes <code>relu(z · w1 + b1) · w2 + b2</code> for one vector.</li>
        <li><code>transformer_block(xs, params, causal=True) -&gt; list[list[float]]</code> computes the pre-LN block for all tokens: <code>h = x + attention(LN(x)) · w_o</code>, then <code>y = h + feed_forward(LN(h))</code>. It uses one attention head with <code>w_q</code>, <code>w_k</code>, <code>w_v</code>, <code>w_o</code>, and it calls your T-004 attention function.</li>
        <li><code>count_block_parameters(d_model, d_ff, bias=True) -&gt; dict</code> returns the counts for <code>attention</code>, <code>feed_forward</code>, <code>layer_norm</code> and <code>total</code>.</li>
        <li><code>python -m assistant.block</code> loads <code>data/block_toy.json</code>, runs one block, and prints a trace for each token at 3 decimals: input, layer norm 1, attention · w_o, h, layer norm 2, feed-forward, output. It also prints the parameter counts for d_model = 512 and d_ff = 2048.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Pure functions: no global state, no printing inside the functions, no change to the input lists.</li>
        <li>A <code>BlockParams</code> dataclass holds the six matrices. Its constructor or a <code>validate()</code> method checks the shapes and raises <code>ValueError</code> with a message that names the matrix and both sizes.</li>
        <li>The matrices use the convention of the lesson: rows are inputs and columns are outputs, so <code>out = vector · W</code>.</li>
        <li>Layer norm divides by <code>√(variance + eps)</code>. A constant vector gives zeros and no error.</li>
        <li>Type hints on every public function. A docstring on <code>transformer_block</code> that states the two lines of the pre-LN block.</li>
        <li>The tests make no network call and need no API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given [2, 4, 6, 8], when you call <code>layer_norm</code>, then the result is [-1.342, -0.447, 0.447, 1.342] (tolerance 0.001). Given [20, 40, 60, 80], the result is the same.</li>
        <li>Given [3, 3, 3, 3], <code>layer_norm</code> returns [0, 0, 0, 0] and raises no error.</li>
        <li>Given z = [1, 2] and the W1 and W2 of the lesson's worked example, <code>feed_forward</code> returns [0.5, -1.0].</li>
        <li>Given the fixture, the output of the block for "sat" is [1.236, 0.829, -0.310, 2.958] (tolerance 0.001). The lesson's interactive shows the same numbers at 2 decimals.</li>
        <li>Given <code>w_o</code> and <code>w_2</code> full of zeros, the block returns its input exactly (the residual property).</li>
        <li>Given the fixture with a fourth token added and <code>causal=True</code>, the outputs of the first three tokens do not change (tolerance 1e-12).</li>
        <li><code>count_block_parameters(512, 2048, bias=False)["total"]</code> is 3,145,728, and with <code>bias=True</code> it is 3,152,384.</li>
        <li><code>pytest</code> passes with the network off. <code>python -m assistant.block</code> prints the trace of criterion 4.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Layer norm and the feed-forward layer (guided).</strong> Write the tests first: the [2, 4, 6, 8] example, scale invariance, mean 0 and variance 1, the constant vector, and the feed-forward example. Compute the layer norm of the "sat" vector [1, 1, 0, 2] on paper before you run the code.</li>
        <li><strong>The block (guided).</strong> Write <code>BlockParams</code> and <code>transformer_block</code>. Reuse your T-004 attention function on the normalized rows, then multiply by <code>w_o</code>. Write the fixture test of criterion 4 and the identity test of criterion 5.</li>
        <li><strong>Properties and the parameter count (independent).</strong> Add the causal test of criterion 6, the shape checks and <code>count_block_parameters</code>. On purpose, normalize over the tokens instead of the features once, and see which test fails. Then fix it.</li>
        <li><strong>Demo and handoff (independent).</strong> Add the <code>__main__</code> block that prints the trace. Compare your trace for each token with the lesson's interactive. Fill in <code>handoffs/T-005-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional (a second session, a few cents of API cost): check a model's explanation against your numbers. Write <code>scripts/explain_trace.py</code>. It runs your block on the fixture, sends the trace for "sat" to <code>claude-haiku-5-5</code> with the T-001 client, and asks two questions:
      "Which stage changed the vector the most?" and "What is the cosine of the output and the input?". Then the script computes the true answers from your numbers and prints both side by side.
      Run it a few times. Record in the handoff how often the model was right on each question. Say what you measured and do not draw a general conclusion from a few runs.</p>`,
    files: `
      <pre><code>project/
  assistant/
    attention.py            # from T-004 (do not change it for this ticket)
    block.py                # layer_norm, feed_forward, BlockParams, transformer_block,
                            # count_block_parameters, __main__ trace
  data/
    block_toy.json          # toy fixture (below)
  tests/
    test_block.py           # property tests and the hand-computed examples
  scripts/
    explain_trace.py        # stretch only
  tickets/
    T-005.md                # this ticket (generated)
  handoffs/
    T-005-handoff.md        # your handoff (template generated)</code></pre>
      <p>Fixture <code>data/block_toy.json</code>. These are the toy numbers of the lesson's interactive. They are made up for teaching.</p>
      <pre><code>{
  "tokens": ["The", "cat", "sat"],
  "x":   [[1, 0, 1, 0], [0, 2, 0, 1], [1, 1, 0, 2]],
  "w_q": [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5]],
  "w_k": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]],
  "w_v": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
  "w_o": [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5]],
  "w_1": [[1, -1, 0, 0, 1, 0, 0, -1], [0, 1, -1, 0, 0, 1, 0, 0], [0, 0, 1, -1, 0, 0, 1, 0], [-1, 0, 0, 1, 0, 0, 0, 1]],
  "w_2": [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5], [0, 0, 0, -0.5], [-0.5, 0, 0, 0], [0, -0.5, 0, 0], [0, 0, -0.5, 0]]
}</code></pre>
      <p>Do not change <code>assistant/attention.py</code> or <code>assistant/llm.py</code> for this ticket. The block and the stretch script only import them.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_layer_norm_matches_lesson_example</code></td><td>[2, 4, 6, 8]</td><td>[-1.342, -0.447, 0.447, 1.342]</td></tr>
        <tr><td><code>test_layer_norm_gives_mean_zero_and_variance_one</code></td><td>Several vectors with different numbers</td><td>Mean 0 and variance 1 (tolerance 1e-4)</td></tr>
        <tr><td><code>test_layer_norm_ignores_the_scale_of_the_input</code></td><td>[2, 4, 6, 8] and [20, 40, 60, 80]</td><td>The same result</td></tr>
        <tr><td><code>test_layer_norm_of_a_constant_vector_is_zero_and_finite</code></td><td>[3, 3, 3, 3] and [0, 0, 0, 0]</td><td>[0, 0, 0, 0], no error</td></tr>
        <tr><td><code>test_feed_forward_matches_lesson_example</code></td><td>z = [1, 2], the lesson's W1 and W2</td><td>[0.5, -1.0]</td></tr>
        <tr><td><code>test_relu_sets_negative_hidden_values_to_zero</code></td><td>The same input</td><td>The hidden layer is [1, 1, 0, 3]</td></tr>
        <tr><td><code>test_block_matches_the_fixture_trace</code></td><td><code>data/block_toy.json</code></td><td>"sat" output [1.236, 0.829, -0.310, 2.958]</td></tr>
        <tr><td><code>test_block_keeps_the_shape_of_its_input</code></td><td>The fixture, and 1 to 5 random tokens (fixed seed)</td><td>n rows of length d_model</td></tr>
        <tr><td><code>test_zero_sublayers_make_the_block_the_identity</code></td><td><code>w_o</code> and <code>w_2</code> full of zeros</td><td>The output equals the input exactly</td></tr>
        <tr><td><code>test_earlier_outputs_do_not_change_when_a_token_is_appended</code></td><td>The fixture plus a fourth token, causal</td><td>Rows 0 to 2 are unchanged</td></tr>
        <tr><td><code>test_block_does_not_change_its_inputs</code></td><td>The fixture</td><td>The input lists are equal before and after the call</td></tr>
        <tr><td><code>test_parameter_count_matches_the_paper_base_model</code></td><td>d_model = 512, d_ff = 2048</td><td>3,145,728 without biases; 3,152,384 with biases</td></tr>
        <tr><td><code>test_wrong_matrix_shape_raises_value_error</code></td><td><code>w_1</code> with 3 rows for d_model = 4</td><td><code>ValueError</code> that names <code>w_1</code> and both sizes</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table.</p>`,
    nfr: `
      <ul>
        <li><strong>Correctness first:</strong> readable loops are fine. Speed does not matter for 3 to 10 tokens.</li>
        <li><strong>Numerical safety:</strong> no division by zero in layer norm; the softmax from T-004 stays stable.</li>
        <li><strong>No new dependencies:</strong> standard library only, so the tests run anywhere T-001 runs.</li>
        <li><strong>Security and cost:</strong> the unit tests make no API calls. The stretch reads the key only from <code>ANTHROPIC_API_KEY</code>, uses <code>claude-haiku-5-5</code>, and prints the cost line from T-001 for each call. Never print the key.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Your identity test (criterion 5) passes. Explain in two sentences why this property matters at the start of training.</li>
        <li>Which test failed when you normalized over the tokens instead of the features? Why does that mistake break the causal property, and what would it break in a KV cache?</li>
        <li>Compute the parameter count of one block for d_model = 4096 and d_ff = 16384 without biases. How much GPU memory do these weights use at 2 bytes per weight?</li>
        <li>In the trace for "sat", which stage changed the vector the most? Use the cosine and the length to support your answer.</li>
        <li>Stretch only: how often was the model right about your trace, how many runs did you do, and what does this teach you about numbers in model answers?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, trace output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>You computed the layer norm of [1, 1, 0, 2] on paper before you ran the code, and the numbers match.</li>
        <li>You can explain each line of <code>block.py</code> without notes, including the order of layer norm and the residual additions.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the block uses the pre-LN order; layer norm works over the features of one token and handles a constant vector;
      the feed-forward layer returns d_model numbers; the T-004 attention function is reused, not copied; tests are named after properties and include the hand-computed examples; no new dependency; and how well your answers to the questions show understanding.</p>`
  }
};
