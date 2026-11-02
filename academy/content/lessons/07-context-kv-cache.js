/*
 * Lesson 1.7 - Context window and KV cache.
 * Ticket T-007 - A KV cache by hand, and a context budget for the chat history.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Worked examples:
 *   Cached decode: the toy Q, K, V of lesson 1.4. The step for "sat" with "The" and "cat"
 *   in the cache gives the weights [0.248, 0.503, 0.248] and the output [0.497, 0.752].
 *   Cache size: 32 blocks, 32 KV heads of size 128, 2 bytes (the shape of LLaMA 7B,
 *   Touvron et al., 2023) -> 524,288 bytes per token, 2,147,483,648 bytes for 4,096 tokens.
 *   Block weights of that shape: 12 x 4096^2 x 32 = 6,442,450,944 (formula of lesson 1.5).
 *   Chat history: system 1,000 tokens, each turn 200 + 300 tokens -> request 10 has
 *   5,700 input tokens, and 10 requests have 34,500 input tokens in total.
 * The interactive for this lesson is in 07-ix.js (id "l1-7-kvcache").
 * Ticket T-007 reuses the fixture data/block_toy.json of ticket T-005.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.7"] = {
  id: "1.7",
  topic: "t1",
  title: "Context window and KV cache",
  objective: "Explain what the context window limits and what counts against it, explain how the KV cache removes repeated work during decode and why it gives the same result, compute the cache size of a model, and use these facts to explain why long prompts and long chats are slow and expensive.",
  prerequisites: [
    "Lesson 1.1: the generation loop, prefill compared to decode, and time to first token (TTFT).",
    "Lesson 1.4: query, key and value, and the causal mask.",
    "Lesson 1.5: the transformer block, per-token layer norm, and the parameter count of 12 × d_model² per block.",
    "You can multiply large numbers with a calculator. No new mathematics is necessary."
  ],
  covers: ["t1-context"],
  whyItMatters: `
    <p>Lesson 1.1 said that the model makes one token for each step, and that the server keeps a <strong>KV cache</strong>. This lesson explains that cache.
    It also explains the <strong>context window</strong>: the limit on the tokens of one request.</p>
    <p>For an application engineer, these two ideas explain things that you see every day. A long prompt makes the first token arrive later. A long chat costs more for each turn, because your application sends the full history again with each request.
    A provider can serve fewer long requests at the same time, because each request needs its own cache in GPU memory.
    In an interview, "what is the KV cache, and how large is it?" is a common question. A good answer gives the formula, a number and the trade-offs.</p>`,
  concepts: [
    { id: "l1-7-c-window", name: "The context window: one limit on input plus output tokens for one request" },
    { id: "l1-7-c-kvcache", name: "The KV cache: keep the keys and values of earlier tokens, and compute them only for the new token" },
    { id: "l1-7-c-exact", name: "Why the cache gives the same result: the causal mask and the per-token parts of the block" },
    { id: "l1-7-c-size", name: "Cache size = 2 × blocks × KV heads × head size × bytes × tokens" },
    { id: "l1-7-c-decode", name: "Each decode step reads all the weights and the whole cache" },
    { id: "l1-7-c-history", name: "The API is stateless: each chat request sends the full history, so total input grows with the square of the turns" },
    { id: "l1-7-c-smaller", name: "Ways to make the cache smaller: fewer KV heads, fewer bytes, paged memory" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Keep the notes, do not read the whole page again",
      blocks: [
        { type: "html", html: `
          <p>Lesson 1.1 showed the generation loop. The model reads all the tokens, makes one new token, adds it to the text, and does the loop again.
          In each loop, the new token uses attention to look at all earlier tokens (lesson 1.4). For this, it needs the <strong>key</strong> and the <strong>value</strong> of each earlier token, in each block.</p>
          <p>A simple loop computes the keys and values of all tokens again at each step. But the key and value of an earlier token do not change when a new token arrives.
          So the server computes them one time and keeps them in memory. This memory is the <strong>KV cache</strong>. At each step, the server computes the key and value of the new token only, adds them to the cache, and reads the others from the cache.</p>
          <p>The <strong>context window</strong> is the maximum number of tokens in one request: the input and the output together. It is counted in tokens, not in words or characters (lesson 1.2).</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a reader with index cards", html: `
          <p>Think of a reader who must write the next word of a long report.</p>
          <ul>
            <li><strong>Without a cache</strong>, the reader reads the whole report again from the start before each new word. A report twice as long takes twice as long for each word, and most of the reading is repeated.</li>
            <li><strong>With a cache</strong>, the reader writes one index card for each word: what to look for (the key) and what it says (the value). For a new word, the reader writes one new card and looks through the cards that exist.</li>
            <li><strong>The context window</strong> is the size of the box of cards. When the box is full, the reader cannot take more words.</li>
          </ul>` },
        { type: "diagram", caption: "One decode step, for the fifth token. Without a cache, the step computes the key and value (K, V) of all five tokens. With a cache, it computes K, V only for the new token and reads the other four from memory.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Two rows of five token boxes. In the top row, without a cache, four boxes are computed again and one is new. In the bottom row, with a KV cache, four boxes are read from the cache and one is new.">
            <text x="14" y="20" class="d-bold">Without a cache</text>
            <rect x="14" y="32" width="80" height="40" rx="8" class="d-box-warn"/><text x="54" y="50" text-anchor="middle" class="d-text">The</text><text x="54" y="65" text-anchor="middle" class="d-small">again</text>
            <rect x="106" y="32" width="80" height="40" rx="8" class="d-box-warn"/><text x="146" y="50" text-anchor="middle" class="d-text">cat</text><text x="146" y="65" text-anchor="middle" class="d-small">again</text>
            <rect x="198" y="32" width="80" height="40" rx="8" class="d-box-warn"/><text x="238" y="50" text-anchor="middle" class="d-text">sat</text><text x="238" y="65" text-anchor="middle" class="d-small">again</text>
            <rect x="290" y="32" width="80" height="40" rx="8" class="d-box-warn"/><text x="330" y="50" text-anchor="middle" class="d-text">on</text><text x="330" y="65" text-anchor="middle" class="d-small">again</text>
            <rect x="382" y="32" width="80" height="40" rx="8" class="d-box-accent"/><text x="422" y="50" text-anchor="middle" class="d-text">the</text><text x="422" y="65" text-anchor="middle" class="d-small">new</text>
            <text x="480" y="50" class="d-small">K, V computed</text><text x="480" y="65" class="d-bold">for 5 tokens</text>
            <text x="14" y="120" class="d-bold">With a KV cache</text>
            <rect x="14" y="132" width="80" height="40" rx="8" class="d-box-info"/><text x="54" y="150" text-anchor="middle" class="d-text">The</text><text x="54" y="165" text-anchor="middle" class="d-small">cached</text>
            <rect x="106" y="132" width="80" height="40" rx="8" class="d-box-info"/><text x="146" y="150" text-anchor="middle" class="d-text">cat</text><text x="146" y="165" text-anchor="middle" class="d-small">cached</text>
            <rect x="198" y="132" width="80" height="40" rx="8" class="d-box-info"/><text x="238" y="150" text-anchor="middle" class="d-text">sat</text><text x="238" y="165" text-anchor="middle" class="d-small">cached</text>
            <rect x="290" y="132" width="80" height="40" rx="8" class="d-box-info"/><text x="330" y="150" text-anchor="middle" class="d-text">on</text><text x="330" y="165" text-anchor="middle" class="d-small">cached</text>
            <rect x="382" y="132" width="80" height="40" rx="8" class="d-box-accent"/><text x="422" y="150" text-anchor="middle" class="d-text">the</text><text x="422" y="165" text-anchor="middle" class="d-small">new</text>
            <text x="480" y="150" class="d-small">K, V computed</text><text x="480" y="165" class="d-bold">for 1 token</text>
            <line x1="14" y1="190" x2="462" y2="190" class="d-line"/>
            <text x="238" y="210" text-anchor="middle" class="d-small">the query of the new token still reads all five keys and values</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>There is one set of cards for each block.</strong> Each block has its own attention, so each block keeps its own keys and values (lesson 1.5).</li>
            <li><strong>The cards are vectors, not words.</strong> Each key and each value is a list of numbers.</li>
            <li><strong>The cards do not stay after the request.</strong> The KV cache holds the tokens of the current request. The model does not remember your earlier requests. Your application sends the history again.</li>
          </ul>` },
        { type: "interactive", id: "l1-7-kvcache" },
        { type: "html", html: `
          <h3>What you see as a user of the API</h3>
          <ul>
            <li><strong>A long prompt makes the first token late.</strong> Before the first output token, the server must process all input tokens and fill the cache (prefill, lesson 1.1).</li>
            <li><strong>A long context makes each output token a little slower.</strong> Each new token reads the whole cache.</li>
            <li><strong>A long chat costs more for each turn.</strong> The API is stateless. Each request sends the system prompt, all earlier messages and the new question. You pay for all these input tokens again in each request.</li>
            <li><strong>The context window is a hard limit.</strong> The input and the output together must fit in it. When the input is too long, the request fails with an error. Check the window of your model on the models overview page.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-7-L1-a", type: "mcq",
          q: "What does the KV cache hold?",
          options: [
            "The answers to your earlier requests, so that the model remembers the conversation.",
            "The key and value vectors of the earlier tokens of the current request, for each block.",
            "The attention weights of all pairs of tokens.",
            "A copy of the model weights for each user."
          ],
          correct: 1,
          explain: "The cache holds the keys and values of the tokens that the server already processed in this request, one set for each block. It does not hold earlier requests: the API is stateless, and your application sends the history again. The attention weights are computed again for each new token, because each new query is different." },
        { id: "l1-7-L1-b", type: "mcq",
          q: "A chat application sends the full history with each request. Turn 30 is slower to the first token and costs more than turn 1. What is the main reason?",
          options: [
            "The model gets tired after many turns.",
            "The KV cache from turn 1 is full.",
            "The input of turn 30 contains all earlier turns. So the prefill processes many more tokens, and each input token is billed again.",
            "The model uses a higher temperature in long chats."
          ],
          correct: 2,
          explain: "The API is stateless, so each request carries the whole history. More input tokens mean a longer prefill (later first token) and a larger bill. The cache of a request does not carry over to the next request. Prompt caching (Topic 2) is a separate feature that can reuse work for a prefix that repeats." },
        { id: "l1-7-L1-c", type: "recall",
          q: "What is the context window, and what counts against it?",
          answer: "The context window is the maximum number of tokens in one request. Everything that you send counts: the system prompt, all messages of the history, tool definitions and documents. The output also counts, so the input plus the output must fit. It is counted in tokens of that model, not in words." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Decode with a cache, size it, and budget the chat history",
      blocks: [
        { type: "html", html: `
          <h3>The decode loop with a cache</h3>
          <p>The generation loop of lesson 1.1, with the cache made visible:</p>
          <pre class="code-block" data-lang="formula"><code>cache = one empty cache for each block
# Prefill: the K, V of all prompt tokens go into the cache.
logits = model(prompt_tokens, cache)
loop:
    token = sample(logits of the last position)
    stop if token is the end token, or the output has max_tokens tokens
    # Decode: one token. Each block adds one K, V and reads its cache.
    logits = model([token], cache)</code></pre>
          <ul>
            <li>The prefill processes all prompt tokens in one parallel pass, and fills the cache.</li>
            <li>Each decode step sends <strong>one token</strong> through the blocks. In each block, the token computes its query, key and value. The block adds the key and value to its cache. The query compares with all keys in the cache.</li>
            <li>The other parts of the block (layer norm, feed-forward layer, residual connections) work on each token alone (lesson 1.5). So the step does not need to run them on earlier tokens again.</li>
          </ul>
          <p>A software comparison: the cache is like memoization. The keys and values of a token depend only on that token and the tokens before it. So you compute them one time and store the result.</p>` },
        { type: "worked", title: "Worked example: one decode step with the numbers of lesson 1.4",
          intro: "Use the toy vectors of lesson 1.4: The has q = [1, 0], k = [1, 0], v = [1, 0]. cat has q = [0, 1], k = [1, 1], v = [0, 1]. sat has q = [1, 1], k = [0, 1], v = [1, 1]. d<sub>k</sub> = 2. Suppose the prompt is \"The cat\", and the model then made \"sat\". The next pass processes \"sat\".",
          steps: [
            { html: "After the prefill, the cache holds the keys [1, 0] and [1, 1], and the values [1, 0] and [0, 1]." },
            { html: "The step computes q, k and v for \"sat\" only, and adds k = [0, 1] and v = [1, 1] to the cache. The cache now has <strong>3</strong> entries." },
            { html: "Scores: q · k / √2 for the 3 cached keys = 1 / 1.414, 2 / 1.414, 1 / 1.414 = <strong>0.707, 1.414, 0.707</strong>. Softmax: e<sup>0.707</sup> = 2.028 and e<sup>1.414</sup> = 4.113, the sum is 8.169, and the weights are <strong>0.248, 0.503, 0.248</strong>." },
            { html: "Output: 0.248 × [1, 0] + 0.503 × [0, 1] + 0.248 × [1, 1] = <strong>[0.497, 0.752]</strong>. This is the same output as the full pass of lesson 1.4. The cache gave the same result with less work." },
            { faded: true, html: "Your turn. Do the step for \"cat\", with only \"The\" in the cache. Compare the result with the causal row for \"cat\" in lesson 1.4.",
              answer: "Add k = [1, 1] and v = [0, 1] to the cache. Scores: [0, 1] · [1, 0] / √2 = 0 and [0, 1] · [1, 1] / √2 = 0.707. Weights: 1.000 / 3.028 = 0.330 and 2.028 / 3.028 = 0.670. Output: 0.330 × [1, 0] + 0.670 × [0, 1] = [0.330, 0.670]. This is the causal row of lesson 1.4." },
            { faded: true, html: "Your turn. Without a cache, how many keys and values does the pass for \"sat\" compute? How many with the cache?",
              answer: "Without a cache, the pass runs on all 3 tokens and computes 3 keys and 3 values. With the cache, it computes 1 key and 1 value. The number of attention scores is 3 in both cases: the cache does not remove the comparison with earlier keys." }
          ] },
        { type: "html", html: `
          <h3>How large is the cache?</h3>
          <p>For each token, each block stores one key and one value for each KV head. Each key and each value has d<sub>head</sub> numbers. So:</p>
          <pre class="code-block" data-lang="formula"><code>cache bytes = 2 × blocks × KV heads × d_head × bytes per number × tokens</code></pre>
          <ul>
            <li>The 2 is for the key and the value.</li>
            <li>In the multi-head attention of lesson 1.4, each head has its own key and value, and heads × d<sub>head</sub> = d<sub>model</sub>. Then the formula is 2 × blocks × d<sub>model</sub> × bytes × tokens.</li>
            <li>The size grows <strong>linearly</strong> with the number of tokens. It does not depend on the number of parameters directly. Two models of the same size can have very different caches (level 3).</li>
          </ul>` },
        { type: "worked", title: "Worked example: the cache of a 7-billion-parameter model shape",
          intro: "Use the shape of LLaMA 7B (Touvron et al., 2023): 32 blocks, d<sub>model</sub> = 4096, 32 heads of size 128. Each head has its own key and value. Each number uses 2 bytes (16-bit). Sizes use 1 GB = 1,000,000,000 bytes.",
          steps: [
            { html: "One token in one block: 2 × 32 heads × 128 = <strong>8,192</strong> numbers." },
            { html: "One token in all 32 blocks: 8,192 × 32 = 262,144 numbers. At 2 bytes: <strong>524,288 bytes</strong>, about 0.52 MB for each token." },
            { html: "A request with 4,096 tokens: 524,288 × 4,096 = <strong>2,147,483,648 bytes</strong>, about 2.1 GB, for one request." },
            { html: "Compare with the weights. Lesson 1.5 gives 12 × d<sub>model</sub>² for each block: 12 × 4096² × 32 = 6,442,450,944 weights. At 2 bytes, that is about <strong>12.9 GB</strong>. The embedding table adds more, but this example leaves it out." },
            { faded: true, html: "Your turn. Compute the cache for one request with 100,000 tokens. Compare it with the 12.9 GB of the weights.",
              answer: "524,288 × 100,000 = 52,428,800,000 bytes, about 52.4 GB. That is about 4 times the block weights, for one request only. In the interactive, set the context length to 131,072 tokens to see a similar case." },
            { faded: true, html: "Your turn. Suppose the model uses 8 KV heads instead of 32, and the query heads share them (level 3). What is the cache for 100,000 tokens?",
              answer: "Per token: 2 × 32 × 8 × 128 × 2 = 131,072 bytes. For 100,000 tokens: 13,107,200,000 bytes, about 13.1 GB. That is 4 times smaller, because there are 4 times fewer KV heads." }
          ] },
        { type: "html", html: `
          <h3>Why long prompts are slow</h3>
          <ul>
            <li><strong>Time to first token.</strong> The prefill must process every input token before the first output token. Lesson 1.5 counted about 12 × d<sub>model</sub>² multiply-adds for each token in each block, plus an attention part that grows with the position. So TTFT grows with the input length, and faster than linearly for very long inputs.</li>
            <li><strong>Time for each output token.</strong> A decode step does little computation, but it must read all the weights and the whole cache from GPU memory. A longer context means a larger cache to read for each new token.</li>
            <li><strong>Memory.</strong> The cache of a request stays in GPU memory until the request ends. Long requests leave less memory for other requests (level 3).</li>
          </ul>` },
        { type: "worked", title: "Worked example: what a 10-turn chat costs in input tokens",
          intro: "A support chat has a system prompt of 1,000 tokens. In each turn, the user writes 200 tokens and the answer has 300 tokens. The API is stateless, so each request sends the system prompt, all earlier turns and the new question. The token counts are made up. Measure yours with count_tokens.",
          steps: [
            { html: "Request 1: 1,000 + 200 = <strong>1,200</strong> input tokens." },
            { html: "Each earlier turn adds 200 + 300 = 500 tokens. Request k has 1,200 + 500 × (k − 1) input tokens. Request 10 has 1,200 + 4,500 = <strong>5,700</strong>." },
            { html: "Total input over the 10 requests: 1,200 + 1,700 + … + 5,700 = <strong>34,500</strong> tokens. The conversation itself is only 1,000 + 10 × 500 = 6,000 tokens. At the Opus 5.5 price of lesson 1.1 ($4 per million input tokens at the time that lesson was written), the input costs 34,500 × 4 / 1,000,000 = <strong>$0.138</strong>." },
            { faded: true, html: "Your turn. Compute the input tokens of request 20 and the total input for 20 turns. How many times larger is the total than for 10 turns?",
              answer: "Request 20: 1,200 + 500 × 19 = 10,700. Total: 20 × 1,200 + 500 × (0 + 1 + … + 19) = 24,000 + 95,000 = 119,000 tokens. That is about 3.4 times the total for 10 turns. Twice the turns gives much more than twice the input, because the total grows with the square of the number of turns." }
          ] },
        { type: "note", kind: "fact", title: "Keep a chat inside the window and the budget", html: `
          <p>Before each request, check: input tokens + max_tokens ≤ context window. Count the input with the token counting endpoint (lesson 1.1). When the check fails, or the cost is too high, use one of these methods:</p>
          <ul>
            <li><strong>Trim.</strong> Remove the oldest turns. This is simple, but the assistant forgets what they said.</li>
            <li><strong>Summarize.</strong> Replace old turns with a short summary. This needs one more model call, and a summary can lose details.</li>
            <li><strong>Retrieve.</strong> Keep the history or the documents outside the prompt, and send only the relevant parts. Lesson 1.8 (Hallucination and grounding) and Topic 3 (RAG) build on this.</li>
            <li><strong>Cache the prefix.</strong> Prompt caching (Topic 2) can make a prefix that repeats cheaper and faster. The tokens still count against the window.</li>
          </ul>
          <p>Ticket T-007 asks you to write the check and the trim method, with tests.</p>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>This level counts the cache for one request with all numbers at the same size. Real servers also use memory for the activations of the current step and for other work, and some store the cache with fewer bytes. So the cache sizes here are a lower limit for the memory of a request, not an exact number.</p>` }
      ],
      checks: [
        { id: "l1-7-L2-a", type: "mcq",
          q: "A model has 24 blocks and 16 KV heads of size 64. It stores the cache at 2 bytes for each number. What is the cache size for one token?",
          options: ["49,152 bytes", "98,304 bytes", "196,608 bytes", "1,572,864 bytes"],
          correct: 1,
          explain: "2 (key and value) × 24 blocks × 16 KV heads × 64 × 2 bytes = 98,304 bytes. The first option forgets the factor 2 for the key and the value. The last option multiplies by the heads two times." },
        { id: "l1-7-L2-b", type: "mcq",
          q: "A chat has a system prompt of 2,000 tokens. In each turn, the user writes 100 tokens and the answer has 400 tokens. How many input tokens does request 5 send?",
          options: ["2,100", "2,500", "4,100", "4,500"],
          correct: 2,
          explain: "System prompt 2,000 + 4 earlier turns × 500 + the new question 100 = 4,100. The answer of turn 5 is output, not input. The last option adds that answer by mistake." },
        { id: "l1-7-L2-c", type: "recall",
          q: "A request has a system prompt of 1,500 tokens, a history of 9,000 tokens, a question of 300 tokens and max_tokens = 2,000. The context window is 12,000 tokens. Does it fit? If not, what can you do?",
          answer: "Input: 1,500 + 9,000 + 300 = 10,800. With max_tokens: 12,800, which is 800 more than 12,000. It does not fit. Remove at least 800 tokens of the oldest history (trim or summarize), or set max_tokens to 1,200 or less if a short answer is enough. Check the result again with the counted tokens, not with an estimate." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why the cache is exact, why decode is memory-bound, and how to make the cache smaller",
      blocks: [
        { type: "html", html: `
          <h3>Why the cache gives the same result</h3>
          <p>The cache is not an approximation. It gives the same numbers as the full pass, apart from small differences in floating-point rounding. Three properties of the block make this true:</p>
          <ul>
            <li><strong>The causal mask (lesson 1.4).</strong> A token never attends to later tokens. So the vector of an earlier token in each block does not depend on the new token. Its key and value stay the same.</li>
            <li><strong>Per-token parts (lesson 1.5).</strong> Layer norm, the feed-forward layer and the residual connections work on each token alone. A layer norm that mixes tokens would break the cache. The third debugging exercise of lesson 1.5 shows this bug.</li>
            <li><strong>Fixed positions.</strong> With learned or fixed position vectors, the position enters at the input of the first block and does not change later. With RoPE, the key is rotated by the angle of its own position, and that position does not change. So the server stores the key after the rotation.</li>
          </ul>
          <p>The prefill can use the same causal attention for all prompt tokens in one parallel pass. Its result for the last position is the same as one step for each token. This is why the server can fill the cache for a long prompt quickly.</p>` },
        { type: "html", html: `
          <h3>Decode is limited by memory reads</h3>
          <p>Each decode step reads all the weights from GPU memory, and does about one multiply-add for each weight (lesson 1.5). It also reads the whole cache of the request. GPUs can do many more multiply-adds each second than they can read numbers from memory. So the speed of a decode step depends mostly on the bytes that it reads, not on the computation.</p>
          <p>Compare the bytes for one step, with 2 bytes for each number and one key and value for each head:</p>
          <ul>
            <li>Weights: 12 × d<sub>model</sub>² × blocks × 2 bytes.</li>
            <li>Cache at n tokens: 2 × blocks × d<sub>model</sub> × 2 bytes × n.</li>
            <li>The ratio is n / (6 × d<sub>model</sub>). The cache read is larger than the weight read when <strong>n &gt; 6 × d<sub>model</sub></strong>. This is the same limit as the compute limit in level 3 of lesson 1.5.</li>
          </ul>
          <p>Servers <strong>batch</strong> requests: one read of the weights serves all requests in the batch. But each request has its own cache, so the cache reads do not share. When the requests are long, the cache reads are most of the work, and fewer requests fit in GPU memory at the same time.
          This makes long requests expensive to serve. Some price lists charge more for each token above a length, as the Haiku 5.5 example of lesson 1.1 shows. Providers do not publish their cost models, so do not assume that this is the only reason.</p>` },
        { type: "worked", title: "Worked example: the cache part of the reads for each output token",
          intro: "Use the shape of level 2: 32 blocks, d<sub>model</sub> = 4096, 32 KV heads, 2 bytes. The block weights are 12.9 GB. 6 × d<sub>model</sub> = 24,576 tokens.",
          steps: [
            { html: "At 8,192 tokens, the cache is 524,288 × 8,192 bytes, about <strong>4.3 GB</strong>. The ratio is 8,192 / 24,576 = 1/3. So the cache is <strong>25%</strong> of the bytes that each step reads (4.3 of 17.2 GB)." },
            { html: "At 24,576 tokens, the cache is as large as the weights. Each step reads two times the weights." },
            { faded: true, html: "Your turn. At 100,000 tokens, what part of the reads for each step is the cache? What is the part with 8 KV heads instead of 32?",
              answer: "32 KV heads: 52.4 GB of cache and 12.9 GB of weights, so the cache is 52.4 / 65.3 = about 80% of the reads. 8 KV heads: 13.1 GB of cache, about the same as the weights, so the cache is about 50% of the reads. The interactive shows both cases." }
          ] },
        { type: "html", html: `
          <h3>Ways to make the cache smaller</h3>
          <ul>
            <li><strong>Multi-query attention</strong> (Shazeer, 2019). All query heads share one key head and one value head. The cache becomes as many times smaller as there are heads.</li>
            <li><strong>Grouped-query attention</strong> (Ainslie et al., 2023). The query heads are put into groups, and each group shares one key and value head. For example, 32 query heads with 8 KV heads give a cache 4 times smaller. The paper reports quality close to multi-head attention at a speed close to multi-query attention. Many newer open models use it.</li>
            <li><strong>Fewer bytes.</strong> Some servers store the cache with 8-bit numbers instead of 16-bit numbers. This halves the cache. It can change the results a little, so it needs an eval.</li>
            <li><strong>Paged memory.</strong> The vLLM paper (Kwon et al., 2023) stores the cache in fixed-size pages, like the virtual memory of an operating system. This wastes less memory, so more requests fit. Requests with the same prefix can also share pages.</li>
            <li><strong>Reuse across requests.</strong> When many requests start with the same text, a server can keep the computed state of that prefix and reuse it. Prompt caching in the Claude API (Topic 2) gives you this as a feature. You mark the prefix, and the usage of the response shows the cached tokens.</li>
          </ul>` },
        { type: "code", lang: "python", code:
`import math

def softmax(xs):
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    s = sum(e)
    return [x / s for x in e]

def attend(q, keys, values):
    d = len(q)
    scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(d) for k in keys]
    w = softmax(scores)
    n_out = len(values[0])
    return [sum(wj * v[c] for wj, v in zip(w, values)) for c in range(n_out)]

# The toy vectors of lesson 1.4: The, cat, sat.
Q = [[1, 0], [0, 1], [1, 1]]
K = [[1, 0], [1, 1], [0, 1]]
V = [[1, 0], [0, 1], [1, 1]]

# Full causal pass: token i attends to tokens 0 to i.
full = [attend(Q[i], K[:i + 1], V[:i + 1]) for i in range(3)]

# Decode with a cache: add one key and one value at each step, then attend.
cache_k, cache_v, cached = [], [], []
for i in range(3):
    cache_k.append(K[i]); cache_v.append(V[i])
    cached.append(attend(Q[i], cache_k, cache_v))

print([round(x, 3) for x in cached[2]])  # [0.497, 0.752]
print(full == cached)                    # True` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This code uses one head and one block, and the toy vectors are given directly, without the W<sub>Q</sub>, W<sub>K</sub> and W<sub>V</sub> projections. Ticket T-007 asks you to add the cache to your full block from T-005 and to prove with tests that it gives the same outputs.</p>` },
        { type: "html", html: `
          <h3>A large window is not the same as good use of the window</h3>
          <p>Lesson 1.4 said that a model can attend to all tokens in its window, but it does not always use all of them equally well. Lesson 1.5 said that a model can be weak at positions that it did not see in training.
          A larger window lets you send more text. It does not tell you how well the model uses that text for your task. Measure it with an eval (Topic 5), and put the important text where your eval shows that it works best.</p>` },
        { type: "html", html: `
          <h3>Connections to the next lessons</h3>
          <ul>
            <li><strong>Pretraining and post-training (lesson 1.6).</strong> The model learns with sequences of a fixed maximum length. This training length is one of the things that sets a useful context window.</li>
            <li><strong>Hallucination and grounding (lesson 1.8).</strong> Grounding puts source text into the prompt. That text uses the context window and the input budget, so you must choose which parts to send.</li>
            <li><strong>Reasoning models and thinking tokens (lesson 1.9).</strong> Thinking tokens are output tokens (lesson 1.1). Each one passes through the decode loop, adds to the cache and counts against max_tokens.</li>
            <li><strong>Prompt caching (Topic 2) and system design (Topic 8).</strong> Prompt caching reuses work for a prefix that repeats. Topic 8 uses TTFT, cost per request and caching in system designs.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-7-L3-a", type: "mcq",
          q: "Why is a request with a very long context more expensive for a provider to serve than its token count alone suggests?",
          options: [
            "The model weights become larger for long requests.",
            "Its cache uses GPU memory for the whole request, and each output step reads the whole cache. Weight reads are shared in a batch, but cache reads are not, so fewer requests fit at the same time.",
            "Long requests always use a higher temperature.",
            "The causal mask stops working for long requests."
          ],
          correct: 1,
          explain: "One read of the weights serves every request in a batch, but each request reads its own cache. A long cache takes memory and read time that other requests cannot share. The weights do not change with the request length." },
        { id: "l1-7-L3-b", type: "mcq",
          q: "A model has d_model = 4096, one key and value for each head, and 2 bytes for weights and cache. From which context length does each decode step read more bytes from the cache than from the block weights?",
          options: ["4,096 tokens", "12,288 tokens", "24,576 tokens", "131,072 tokens"],
          correct: 2,
          explain: "The ratio of cache bytes to weight bytes is n / (6 × d_model). It is larger than 1 when n > 6 × 4096 = 24,576. The interactive shows the same number for 32 KV heads and 2 bytes." },
        { id: "l1-7-L3-c", type: "recall",
          q: "Explain why the KV cache gives the same outputs as running the full pass again.",
          answer: "Because of the causal mask, an earlier token never attends to later tokens, so its vectors in each block do not depend on new tokens. Layer norm, the feed-forward layer and the residual connections work on each token alone, so they do not mix tokens either. The position of an earlier token does not change. So the keys and values of earlier tokens stay the same, and the server can store them. The only differences come from the order of floating-point operations." }
      ]
    }
  ],

  debugging: [
    { id: "l1-7-dbg-1", title: "The cached output differs from the full pass",
      symptom: "Your test compares the outputs of the cached decode with the outputs of the full block from T-005. The first token matches. Every later token differs.",
      evidence: "AssertionError: token 1: cached [-0.366, 2.655, 0.500, 0.500] != full [-0.961, 3.617, -0.726, 1.510]",
      hints: [
        "In your decode step, when do you add the new key and value to the cache: before or after the attention?",
        "In the full causal pass, can a token attend to itself?"
      ],
      answer: "The step computes attention first and adds the new key and value to the cache after it. So the new token does not attend to itself, but in the full pass it does (the causal mask keeps the diagonal). The first token matches only by chance, because the code has a special case for an empty cache. Fix: add the new key and value to the cache, then compute attention over all cached entries. Keep the test that compares every token with the full pass." },
    { id: "l1-7-dbg-2", title: "The second request gives a different answer from the first",
      symptom: "You call run_with_cache two times with the same fixture. The first call matches the full pass. The second call gives different outputs, and the cache is longer than the prompt.",
      evidence: "AssertionError: len(cache) == 6, expected 3 (second call with the 3-token fixture)",
      hints: [
        "Where does the cache object come from at the start of each call?",
        "In Python, when does a default argument such as cache=KVCache() get its value?"
      ],
      answer: "The function uses a default argument cache=KVCache() (or a module-level cache). Python creates that object one time, when it defines the function, so the second call adds to the cache of the first call. The tokens of the second request attend to the tokens of the first request. On a server this mixes the data of two users. Fix: create a new cache inside the function for each call, and pass it explicitly to decode_step. Add a test that calls the function two times and expects the same result." },
    { id: "l1-7-dbg-3", title: "The chat endpoint fails after many turns",
      symptom: "You test the chat with the numbers of the lesson: a system prompt of 1,000 tokens, and 200 + 300 tokens for each turn. You set a test window of 20,000 tokens and max_tokens 1,024. The answers get slower with each turn. At turn 37, your context check stops the request.",
      evidence: "ContextBudgetError: input 19,200 tokens + max_tokens 1,024 > context window 20,000",
      hints: [
        "What does each request send to the API?",
        "How does the input of a request change from one turn to the next?"
      ],
      answer: "The API is stateless, so the application sends the full history with each request. The input grows by one turn in each request, so TTFT grows, the cost of each turn grows, and at last the input does not fit in the window. Fix: call trim_history (or a summary method) before each request, so that input + max_tokens stays below the window. Log the input tokens of each request so that you see the growth before it fails. Prompt caching (Topic 2) can reduce the cost of the part that repeats, but it does not change the window." }
  ],

  recall: [
    { id: "l1-7-r1", q: "What does the KV cache store, and why is it possible?", a: "The key and value vectors of every earlier token of the request, for each block and each KV head. It is possible because the causal mask stops earlier tokens from attending to later tokens, and the other parts of the block work per token, so earlier keys and values never change." },
    { id: "l1-7-r2", q: "Give the formula for the KV cache size.", a: "2 × blocks × KV heads × d_head × bytes per number × tokens. With one key and value for each head, KV heads × d_head = d_model, so it is 2 × blocks × d_model × bytes × tokens." },
    { id: "l1-7-r3", q: "What is the cache per token for 32 blocks, 32 KV heads of size 128, at 2 bytes?", a: "2 × 32 × 32 × 128 × 2 = 524,288 bytes, about 0.52 MB per token. For 4,096 tokens: about 2.1 GB. For 100,000 tokens: about 52.4 GB." },
    { id: "l1-7-r4", q: "What counts against the context window?", a: "All input (system prompt, all messages, tool definitions, documents) and the output. Input tokens + max_tokens must fit in the window. The count is in tokens of that model." },
    { id: "l1-7-r5", q: "Why are long prompts slow?", a: "The prefill must process every input token before the first output token, so TTFT grows with the input. Each decode step reads the whole cache, so a longer context makes each output token slower. The cache also uses GPU memory, so fewer requests fit at the same time." },
    { id: "l1-7-r6", q: "Why does the total input of a chat grow faster than the number of turns?", a: "The API is stateless. Each request sends the system prompt and all earlier turns again. Request k has about (k − 1) turns of history, so the total over n turns grows with n². In the lesson example, 10 turns send 34,500 input tokens and 20 turns send 119,000." },
    { id: "l1-7-r7", q: "Name three ways to make the KV cache smaller or cheaper.", a: "Fewer KV heads (multi-query or grouped-query attention), fewer bytes for each cached number (for example 8-bit), and paged memory that wastes less space (vLLM). Across requests, prompt caching reuses the work for a prefix that repeats." }
  ],

  interview: [
    { q: "What is the KV cache, and why does an LLM server need it?",
      outline: "During decode, each new token needs the keys and values of all earlier tokens in each block. Because of the causal mask and the per-token parts, those keys and values never change, so the server stores them. Each step then computes Q, K, V for one token, appends K and V, and attends over the cache. Without it, each step would run the full pass on the whole sequence again. The cost: GPU memory that grows linearly with the context, and a full read of the cache at each step." },
    { q: "Estimate the KV cache memory of a model for a given context length.",
      outline: "2 × blocks × KV heads × d_head × bytes × tokens. Example: 32 blocks, 32 heads of 128, 2 bytes gives 524,288 bytes per token, about 2.1 GB at 4,096 tokens and about 52.4 GB at 100,000 tokens. Compare with the weights (about 12 × d_model² × blocks, at 12.9 GB here). Mention that grouped-query attention with 8 KV heads makes it 4 times smaller, and that real servers need memory for more than the cache." },
    { q: "Why are long prompts slow and expensive?",
      outline: "Billing: every input token is billed, on every request. TTFT: the prefill processes all input tokens, with an attention part that grows faster than linearly for very long inputs. Decode: each step reads all weights plus the whole cache, so output tokens get slower as the context grows. Serving: weight reads are shared in a batch, cache reads are not, and the cache takes memory, so fewer long requests fit on a GPU." },
    { q: "A chat product gets slower and more expensive as conversations grow. What do you do?",
      outline: "Measure input tokens per request and TTFT per turn first. The API is stateless, so history is resent and total input grows with the square of the turns. Options: a context budget check before each call, trim the oldest turns, summarize old turns, retrieve only relevant history or documents, cap max_tokens, and prompt caching for the stable prefix (system prompt, tools). Evaluate that answer quality does not drop after trimming." },
    { q: "How do multi-query and grouped-query attention reduce the cache, and what is the trade-off?",
      outline: "They keep many query heads but fewer key and value heads, which groups of query heads share. The cache shrinks by heads / KV heads, decode reads fewer bytes, and more requests fit in memory. The trade-off is less freedom in the keys and values, which can reduce quality. The GQA paper reports quality close to multi-head attention at a speed close to multi-query attention. Measure on your task." }
  ],

  misconceptions: [
    { wrong: "The KV cache lets the model remember earlier conversations.", right: "It holds the keys and values of the current request only. The API is stateless, and your application sends the history again with each request." },
    { wrong: "The KV cache is an approximation that changes the answer a little.", right: "It gives the same outputs as the full pass, apart from floating-point rounding. The causal mask and the per-token parts of the block make this true." },
    { wrong: "With a KV cache, attention costs nothing during decode.", right: "The cache removes the repeated computation of keys and values. Each new token still compares its query with every cached key and reads every cached value." },
    { wrong: "The context window limits only the input.", right: "It limits the input and the output together. Input tokens + max_tokens must fit." },
    { wrong: "If a prompt fits in the window, its length only changes the bill.", right: "A longer prompt also increases TTFT, makes each output token slower and uses more GPU memory on the server." },
    { wrong: "The cache size depends on the number of parameters.", right: "It depends on the blocks, the KV heads, the head size, the bytes per number and the tokens. Two models with the same parameter count can have very different caches." },
    { wrong: "The cost of a chat grows linearly with the number of turns.", right: "Each request resends the whole history, so the total input grows with the square of the number of turns." }
  ],

  resources: [
    { title: "Context windows", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/context-windows",
      when: "Read after level 1.",
      why: "The official description of the context window of Claude models: what counts against it, and how it relates to max_tokens and thinking.",
      watchFor: [
        "What does the page say counts against the context window?",
        "What does the page say happens when the input and max_tokens together are larger than the window?"
      ] },
    { title: "Token counting", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/token-counting",
      when: "Read before ticket T-007, if you did not read it for T-001.",
      why: "The endpoint that counts the input tokens of a request before you send it. Your context budget check needs these counts.",
      watchFor: [
        "Which parts of a request does the endpoint count?",
        "Is the count from the endpoint exact or an estimate, according to the page?"
      ] },
    { title: "Prompt caching", by: "Anthropic docs", kind: "Docs, optional", url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
      when: "Optional, after level 3. Topic 2 covers it in full.",
      why: "The API feature that reuses work for a prefix that repeats across requests. It connects the KV cache idea of this lesson to cost and latency in your application.",
      watchFor: [
        "Which parts of a request can you cache, and how do you mark the end of the cached prefix?",
        "Which fields of the response usage show cache writes and cache reads?"
      ] },
    { title: "Let's build GPT: from scratch, in code, spelled out", by: "Andrej Karpathy", kind: "Video, long, optional", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
      when: "Optional, after level 2, if you watched it for lesson 1.5.",
      why: "The video writes a generate function for a small GPT. Look at it with the decode loop of this lesson in mind.",
      note: "Use the chapter list on YouTube to find the generate function. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "Does the generate function keep a KV cache, or does it run the model on all tokens again for each new token?",
        "What does the function do when the text is longer than the block size of the model?"
      ] },
    { title: "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints", by: "Ainslie et al. (2023)", kind: "Paper, optional", url: "https://arxiv.org/abs/2305.13245",
      when: "Optional, after level 3. Read the introduction and the method section.",
      why: "The paper that defines grouped-query attention, which makes the KV cache smaller.",
      watchFor: [
        "How do the query heads share the key and value heads in grouped-query attention?",
        "What does the paper compare between multi-head, multi-query and grouped-query attention?"
      ] }
  ],

  summary: `
    <ul>
      <li>The context window limits the tokens of one request: the input and the output together, counted in tokens of that model.</li>
      <li>The KV cache stores the keys and values of earlier tokens in each block. Each decode step computes them only for the new token.</li>
      <li>The cache gives the same result as the full pass, because of the causal mask and the per-token parts of the block.</li>
      <li>Cache size = 2 × blocks × KV heads × d_head × bytes × tokens. For the LLaMA 7B shape it is 524,288 bytes per token.</li>
      <li>Each decode step reads all the weights and the whole cache. Above about 6 × d_model tokens, the cache read is larger than the weight read.</li>
      <li>Long prompts increase TTFT, make each output token slower and use GPU memory. The API is stateless, so a chat resends its history, and the total input grows with the square of the turns.</li>
      <li>Grouped-query attention, fewer bytes, paged memory and prompt caching reduce the cost of the cache.</li>
    </ul>`,

  teachBack: "Explain the KV cache to a backend engineer in two minutes. Say what it stores, why the stored values never change, and what it costs. Compute the cache for 32 blocks, 32 KV heads of size 128, 2 bytes and 4,096 tokens. Then explain why turn 20 of a chat costs more than turn 1. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-007"]
};

/* ====================================================================== T-007 */
window.ACADEMY.tickets["T-007"] = {
  id: "T-007",
  title: "A KV cache by hand, and a context budget for the chat history",
  lesson: "1.7",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. The optional stretch needs a second, short session.",
  fields: {
    objective: `
      <p>Add a KV cache to your transformer block from T-005, in <code>assistant/kv_cache.py</code>, and prove with tests that the cached decode gives the same outputs as the full pass.
      Add a function that computes the cache size of a model. Then write <code>assistant/context_budget.py</code>: a check that a request fits in the context window, and a function that trims the oldest chat turns until it fits.</p>
      <p><strong>Real-world problem.</strong> Chat features often get slower and more expensive with each turn, and then fail with an error when the history is too long.
      Teams also choose a context length or a model without an estimate of the memory that it needs. A cache that you wrote and tested, a size formula, and a budget check before each call give you the tools to explain and prevent these problems.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      The cache module is a learning tool and a test bed: Claude runs on the server and keeps its own cache. The context budget module is production code.
      In phase 2, the FastAPI chat endpoint will call <code>trim_history</code> before each call to Claude. This ticket adds no endpoint.</p>
      <p>This ticket depends on T-001 (the project, pytest, the client in <code>assistant/llm.py</code> and token counting), on T-004 (<code>assistant/attention.py</code>) and on T-005 (<code>assistant/block.py</code> and <code>data/block_toy.json</code>). It adds new files only.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.7, levels 1 and 2 complete. Level 3 helps for milestones 3 and 4.</li>
        <li>T-005 done: <code>assistant/block.py</code> has <code>layer_norm</code>, <code>feed_forward</code>, <code>BlockParams</code> and <code>transformer_block</code>, and its tests pass.</li>
        <li>No new package. Use only the Python standard library (<code>math</code>, <code>json</code>, <code>dataclasses</code>). Do not add numpy for this ticket.</li>
        <li>The stretch only: <code>ANTHROPIC_API_KEY</code> in the environment, and the T-001 client in <code>assistant/llm.py</code>.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>KVCache</code> is a dataclass with <code>keys: list[list[float]]</code> and <code>values: list[list[float]]</code>. <code>len(cache)</code> returns the number of cached tokens. It holds one block and one head, as in T-005.</li>
        <li><code>decode_step(x, params, cache) -&gt; list[float]</code> runs the pre-LN block of T-005 for one new token vector <code>x</code>: layer norm 1, then q, k and v. It adds k and v to the cache, then attends with q over all cached keys and values, then multiplies by <code>w_o</code> and adds the residual. Then it runs layer norm 2, the feed-forward layer and the second residual. It returns the output vector.</li>
        <li><code>run_with_cache(xs, params) -&gt; tuple[list[list[float]], KVCache]</code> creates a new cache, calls <code>decode_step</code> for each token in order, and returns the outputs and the cache.</li>
        <li><code>kv_cache_bytes(n_tokens, n_blocks, n_kv_heads, d_head, bytes_per_value=2) -&gt; int</code> returns 2 × n_blocks × n_kv_heads × d_head × bytes_per_value × n_tokens.</li>
        <li>In <code>assistant/context_budget.py</code>: <code>fits_context(input_tokens, max_tokens, context_window) -&gt; bool</code>; <code>history_input_tokens(system_tokens, turns) -&gt; list[int]</code>, which returns the input tokens of each request in a chat; and <code>trim_history(messages, system_tokens, max_tokens, context_window) -&gt; list[Message]</code>.</li>
        <li><code>python -m assistant.kv_cache</code> loads <code>data/block_toy.json</code>, prints the cached output and the full-pass output of each token at 3 decimals and the largest difference, prints the cache length after each step, and prints the cache size for the lesson shape (32 blocks, 32 and 8 KV heads, head size 128, 2 bytes) at 4,096 and 100,000 tokens.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Import <code>layer_norm</code>, <code>feed_forward</code> and <code>BlockParams</code> from T-005, and the attention function from T-004. Do not copy them. For the attention of one new token, call the T-004 function with one query row and the cached keys and values, with the causal mask off: the cache holds only earlier tokens and the token itself.</li>
        <li><code>decode_step</code> changes only the cache that it receives. It does not change <code>x</code> or <code>params</code>. No global state, and no default argument that holds a cache.</li>
        <li><code>Message</code> is a dataclass with <code>role</code> (<code>"user"</code> or <code>"assistant"</code>) and <code>tokens</code> (an int). The caller gets the counts from the token counting endpoint of T-001. The budget functions make no API call.</li>
        <li><code>trim_history</code> removes the oldest messages in whole pairs (one user message and the answer after it), so the history still starts with a user message. It never removes the last message (the new question). It keeps the order. When the request does not fit even with no history, it raises <code>ContextBudgetError</code> with a message that gives the input tokens, max_tokens and the window.</li>
        <li><code>fits_context</code> returns True when input_tokens + max_tokens ≤ context_window. Negative numbers raise <code>ValueError</code>.</li>
        <li>Type hints on every public function. A docstring on <code>decode_step</code> that states which parts run on the new token only, and why the result equals the full pass.</li>
        <li>The tests make no network call and need no API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given <code>data/block_toy.json</code>, the outputs of <code>run_with_cache</code> equal the outputs of <code>transformer_block(xs, params, causal=True)</code> for every token (tolerance 1e-12). The output for "sat" is [1.236, 0.829, -0.310, 2.958].</li>
        <li>After the 3 tokens, <code>len(cache)</code> is 3, and cached key i equals layer norm 1 of token i times <code>w_k</code>.</li>
        <li>Two calls of <code>run_with_cache</code> with the same input give the same outputs and caches of the same length.</li>
        <li><code>kv_cache_bytes(1, 32, 32, 128)</code> is 524,288. <code>kv_cache_bytes(4096, 32, 32, 128)</code> is 2,147,483,648. With 8 KV heads, the second value is 536,870,912.</li>
        <li><code>history_input_tokens(1000, [(200, 300)] * 10)</code> returns 10 values from 1,200 to 5,700, and their sum is 34,500.</li>
        <li><code>fits_context(4976, 1024, 6000)</code> is True and <code>fits_context(4977, 1024, 6000)</code> is False.</li>
        <li>Given a system prompt of 1,000 tokens, 10 earlier pairs of 200 and 300 tokens, a new question of 200 tokens, max_tokens 1,024 and a window of 6,000, <code>trim_history</code> keeps the newest 7 pairs and the new question (15 messages, input 4,700 tokens). With a new question of 5,000 tokens, it raises <code>ContextBudgetError</code>.</li>
        <li><code>pytest</code> passes with the network off. <code>python -m assistant.kv_cache</code> prints a largest difference of 0.000 and the sizes of criterion 4.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>The cache step (guided).</strong> Write the test of criterion 1 first. It fails because <code>run_with_cache</code> does not exist. Write <code>KVCache</code> and <code>decode_step</code>. Before you run the code, predict the cache length after each token.</li>
        <li><strong>Properties of the cache (guided).</strong> Add the tests of criteria 2 and 3. On purpose, add k and v to the cache after the attention, and see which test fails. Then fix it. Do the same with a default argument <code>cache=KVCache()</code>.</li>
        <li><strong>Size and budget (independent).</strong> Write <code>kv_cache_bytes</code>, <code>fits_context</code>, <code>history_input_tokens</code> and <code>trim_history</code> test first, with the numbers of criteria 4 to 7. Test the boundary where input + max_tokens equals the window.</li>
        <li><strong>Demo and handoff (independent).</strong> Add the <code>__main__</code> block. Compare its sizes with the interactive of lesson 1.7. Fill in <code>handoffs/T-007-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional (a second session, about 2 cents of API cost at the Haiku 5.5 price of lesson 1.1): measure how the input length changes the time to first token. Write <code>scripts/measure_ttft.py</code>.
      It builds three prompts of about 1,000, 10,000 and 50,000 input tokens from a repeated Northwind policy text, counts each one with the token counting endpoint, and sends each one three times to <code>claude-haiku-5-5</code> with the T-001 client and <code>max_tokens</code> 16.
      Put a different run number at the start of each prompt, so that no two requests send the same text. Do not add <code>cache_control</code>. Print the counted tokens, the TTFT of each run and the median for each size.
      Record the results in the handoff. Say what you measured, and do not draw a general conclusion from a few runs.</p>`,
    files: `
      <pre><code>project/
  assistant/
    attention.py            # from T-004 (do not change it for this ticket)
    block.py                # from T-005 (do not change it for this ticket)
    kv_cache.py             # KVCache, decode_step, run_with_cache, kv_cache_bytes, __main__ demo
    context_budget.py       # Message, ContextBudgetError, fits_context,
                            # history_input_tokens, trim_history
  data/
    block_toy.json          # from T-005 (reuse it, do not change it)
  tests/
    test_kv_cache.py        # the cache equals the full pass, cache size
    test_context_budget.py  # the window check, the chat growth, trimming
  scripts/
    measure_ttft.py         # stretch only
  tickets/
    T-007.md                # this ticket (generated)
  handoffs/
    T-007-handoff.md        # your handoff (template generated)</code></pre>
      <p>Do not change <code>assistant/attention.py</code>, <code>assistant/block.py</code> or <code>assistant/llm.py</code> for this ticket. The new modules and the stretch script only import them.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_cached_decode_matches_the_full_pass</code></td><td><code>data/block_toy.json</code></td><td>Every output row equals <code>transformer_block</code> (tolerance 1e-12); "sat" is [1.236, 0.829, -0.310, 2.958]</td></tr>
        <tr><td><code>test_cache_grows_by_one_entry_for_each_token</code></td><td>The fixture, one token at a time</td><td><code>len(cache)</code> is 1, 2, 3</td></tr>
        <tr><td><code>test_cached_keys_are_the_projected_layer_norm_of_each_token</code></td><td>The fixture</td><td>Key i equals layer_norm(x_i) · w_k</td></tr>
        <tr><td><code>test_two_runs_do_not_share_a_cache</code></td><td>The fixture, two calls</td><td>The same outputs; each cache has 3 entries</td></tr>
        <tr><td><code>test_decode_step_does_not_change_its_inputs</code></td><td>The fixture</td><td><code>x</code> and <code>params</code> are equal before and after the call</td></tr>
        <tr><td><code>test_cache_bytes_match_the_lesson_shape</code></td><td>32 blocks, 32 or 8 KV heads, head size 128, 2 bytes</td><td>524,288 per token; 2,147,483,648 and 536,870,912 for 4,096 tokens</td></tr>
        <tr><td><code>test_fits_context_includes_max_tokens_at_the_boundary</code></td><td>4,976 and 4,977 input, max_tokens 1,024, window 6,000</td><td>True, then False</td></tr>
        <tr><td><code>test_chat_input_grows_with_each_turn</code></td><td>System 1,000, ten turns of 200 + 300</td><td>1,200 to 5,700; total 34,500</td></tr>
        <tr><td><code>test_trim_history_keeps_the_newest_pairs_that_fit</code></td><td>The example of criterion 7</td><td>The newest 7 pairs and the new question, in order</td></tr>
        <tr><td><code>test_trim_history_never_removes_the_new_question</code></td><td>A history where only the question fits</td><td>The result is the question alone</td></tr>
        <tr><td><code>test_request_that_cannot_fit_raises_context_budget_error</code></td><td>A question of 5,000 tokens, window 6,000</td><td><code>ContextBudgetError</code> that gives the three numbers</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table.</p>`,
    nfr: `
      <ul>
        <li><strong>Correctness first:</strong> readable loops are fine. Speed does not matter for 3 to 10 tokens.</li>
        <li><strong>Isolation:</strong> each request gets its own cache. No state is shared between calls.</li>
        <li><strong>No new dependencies:</strong> standard library only, so the tests run anywhere T-001 runs.</li>
        <li><strong>Security and cost:</strong> the unit tests make no API calls. The stretch reads the key only from <code>ANTHROPIC_API_KEY</code>, uses <code>claude-haiku-5-5</code>, and prints the cost line from T-001 for each call. Never print the key.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Your cached decode matches the full pass. Name the two properties of the block that make this true, and say which T-005 test protects each one.</li>
        <li>Compute the cache size for 32 blocks, 8 KV heads of size 128, 2 bytes and 32,768 tokens. Compare it with the 12.9 GB of block weights of the lesson shape.</li>
        <li>For the chat example of the lesson, what is the total input for 20 turns? Name two changes that reduce it, and say what each change costs.</li>
        <li><code>trim_history</code> removes the oldest turns. Give one example of a conversation where this gives a wrong answer, and one method that avoids it.</li>
        <li>Stretch only: how did the median TTFT change from 1,000 to 50,000 input tokens? How many runs did you do, and what else can change TTFT between runs?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, demo output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>You predicted the cache length after each token before you ran the code, and the prediction matched.</li>
        <li>You can explain each line of <code>decode_step</code> without notes, including the order of "add to the cache" and "attend".</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the cached decode reuses the T-004 and T-005 functions and matches the full pass for every token;
      each call gets a new cache; the size formula has the factor 2 for keys and values; the budget check includes max_tokens; trimming removes whole pairs and never the new question;
      tests are named after properties and include the lesson numbers; no new dependency; and how well your answers to the questions show understanding.</p>`
  }
};
