/*
 * Lesson 1.1 - How Large Language Models Work: the big picture.
 * Ticket T-001 - First call: a measured Claude CLI.
 *
 * Block types that app.js renders:
 *   html, note (kind: analogy | limit | fact | simplification | warn),
 *   diagram (svg + caption), interactive (id), worked (steps, faded steps),
 *   code (lang + code), stop (a pause point).
 * Check types: mcq (options + correct index), recall (typed answer, then self-rating).
 *
 * Facts about the Claude API in this file come from the Anthropic docs and the
 * official Python SDK. Prices change. Check them against the pricing page.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.1"] = {
  id: "1.1",
  topic: "t1",
  title: "How Large Language Models Work: the big picture",
  objective: "Explain how an LLM turns a prompt into an answer, one token at a time, and connect each step to cost, latency, limits and nondeterminism in an API call.",
  prerequisites: [
    "You can call an HTTP API and read JSON.",
    "You know what a probability is (a number from 0 to 1; all options add up to 1).",
    "No machine learning knowledge is necessary."
  ],
  covers: ["t1-loop", "t1-tokens", "t1-sampling"],
  whyItMatters: `
    <p>Every decision in an AI product goes back to one mechanism: the model makes one token, adds it to the text, and does this again.
    This one loop sets the bill (you pay per token), the wait (each output token is one more step), the limits (the context window counts tokens)
    and the surprise (each step is a weighted random choice).</p>
    <p>In an interview, "how does an LLM work?" is often the first question. A good answer is short, uses a diagram, and connects the mechanism to engineering choices.</p>`,
  concepts: [
    { id: "c-next-token", name: "Next-token prediction and the generation loop" },
    { id: "c-tokens", name: "Tokens and tokenization (BPE)" },
    { id: "c-io-tokens", name: "Input tokens compared to output tokens (cost and latency)" },
    { id: "c-stop", name: "max_tokens and stop reasons" },
    { id: "c-sampling", name: "Logits, softmax, temperature and top-p" },
    { id: "c-prefill-decode", name: "Prefill compared to decode (time to first token)" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "What happens, in plain words",
      blocks: [
        { type: "html", html: `
          <p>A large language model (LLM) does one thing: it reads some text and gives a score to every possible next piece of text.
          Then a piece is picked, added to the end, and the model reads the longer text again. It repeats this until it stops.</p>
          <p>The pieces are called <strong>tokens</strong>. A token is often a part of a word, a whole short word, a space plus a word, or a punctuation mark.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: autocomplete at a very large scale", html: `
          <p>Your phone keyboard suggests the next word. An LLM is a much stronger version of the same idea.
          It learned from a very large amount of text, so its "next piece" scores include grammar, facts, style and the steps of an argument.</p>` },
        { type: "interactive", id: "genloop" },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>No lookup.</strong> The model does not search a database for "the capital of France". The answer comes from patterns in its weights. This is why it can be fluent and wrong (hallucination, lesson 1.8).</li>
            <li><strong>No memory between requests.</strong> The API is stateless. A chat app sends the whole conversation again with every request. A longer chat costs more per message.</li>
            <li><strong>It plans more than a keyboard does.</strong> Large models can hold a plan for later tokens. "Only the next word" describes the output step, not all the internal computation.</li>
          </ul>` },
        { type: "diagram", caption: "The generation loop. The model runs once per output token. The loop stops at an end token, at max_tokens, or at a stop sequence.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Generation loop diagram">
            <defs><marker id="ah1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="10" y="80" width="130" height="56" rx="8" class="d-box"/>
            <text x="75" y="104" text-anchor="middle" class="d-bold">Text so far</text>
            <text x="75" y="122" text-anchor="middle" class="d-small">prompt + new tokens</text>
            <rect x="180" y="80" width="120" height="56" rx="8" class="d-box-accent"/>
            <text x="240" y="104" text-anchor="middle" class="d-bold">Model</text>
            <text x="240" y="122" text-anchor="middle" class="d-small">one forward pass</text>
            <rect x="340" y="80" width="120" height="56" rx="8" class="d-box"/>
            <text x="400" y="104" text-anchor="middle" class="d-bold">Scores</text>
            <text x="400" y="122" text-anchor="middle" class="d-small">one per vocab token</text>
            <rect x="500" y="80" width="130" height="56" rx="8" class="d-box-good"/>
            <text x="565" y="104" text-anchor="middle" class="d-bold">Pick one token</text>
            <text x="565" y="122" text-anchor="middle" class="d-small">sampling</text>
            <line x1="140" y1="108" x2="178" y2="108" class="d-line" marker-end="url(#ah1)"/>
            <line x1="300" y1="108" x2="338" y2="108" class="d-line" marker-end="url(#ah1)"/>
            <line x1="460" y1="108" x2="498" y2="108" class="d-line" marker-end="url(#ah1)"/>
            <path d="M565,136 L565,180 L75,180 L75,138" class="d-line" marker-end="url(#ah1)"/>
            <text x="320" y="200" text-anchor="middle" class="d-small">add the token to the end, then run again</text>
            <rect x="500" y="10" width="130" height="44" rx="8" class="d-box-warn"/>
            <text x="565" y="30" text-anchor="middle" class="d-bold">Stop?</text>
            <text x="565" y="46" text-anchor="middle" class="d-small">end token / max_tokens</text>
            <line x1="565" y1="80" x2="565" y2="56" class="d-line" marker-end="url(#ah1)"/>
          </svg>` },
        { type: "html", html: `<p><strong>Summary of level 1.</strong> Text goes in. The model scores every possible next token. One token is picked and added. This repeats. The answer you read is the list of picked tokens.</p>` }
      ],
      checks: [
        { id: "1.1-L1-a", type: "mcq",
          q: "A chat app shows a 20-message conversation. You send message 21. What does the app send to the model API?",
          options: [
            "Only message 21. The model remembers the earlier messages.",
            "Message 21 and a conversation ID. The server loads the history from the model's memory.",
            "All 21 messages (or a summary of the old ones), because the API is stateless.",
            "Only the last 5 messages. The model cannot read more."
          ],
          correct: 2,
          explain: "The Messages API is stateless. Your code sends the conversation each time. This is why long chats cost more per message and why context limits matter." },
        { id: "1.1-L1-b", type: "recall",
          q: "In one or two sentences: how does an LLM make a 50-token answer?",
          answer: "It runs the generation loop about 50 times. Each time it scores every possible next token for the text so far, one token is picked, and the token is added to the text. It stops at an end token, at max_tokens or at a stop sequence." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "What it means for your API calls",
      blocks: [
        { type: "html", html: `<p>Now look at the same loop from the side of the code that calls the model. One API request goes through these stages:</p>` },
        { type: "diagram", caption: "One request to the Messages API. Input tokens are processed together (prefill). Output tokens come one at a time (decode). Streaming sends each token to you when it is ready.",
          svg: `<svg viewBox="0 0 680 250" role="img" aria-label="Request lifecycle diagram">
            <defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="10" y="30" width="120" height="70" rx="8" class="d-box"/>
            <text x="70" y="56" text-anchor="middle" class="d-bold">Your code</text>
            <text x="70" y="74" text-anchor="middle" class="d-small">system + messages</text>
            <text x="70" y="90" text-anchor="middle" class="d-small">model, max_tokens</text>
            <rect x="170" y="30" width="110" height="70" rx="8" class="d-box"/>
            <text x="225" y="56" text-anchor="middle" class="d-bold">Tokenizer</text>
            <text x="225" y="74" text-anchor="middle" class="d-small">text → token IDs</text>
            <text x="225" y="90" text-anchor="middle" class="d-small">= input_tokens</text>
            <rect x="320" y="30" width="140" height="70" rx="8" class="d-box-accent"/>
            <text x="390" y="56" text-anchor="middle" class="d-bold">Prefill</text>
            <text x="390" y="74" text-anchor="middle" class="d-small">all input tokens</text>
            <text x="390" y="90" text-anchor="middle" class="d-small">in parallel</text>
            <rect x="500" y="30" width="170" height="70" rx="8" class="d-box-accent"/>
            <text x="585" y="56" text-anchor="middle" class="d-bold">Decode loop</text>
            <text x="585" y="74" text-anchor="middle" class="d-small">one token per step</text>
            <text x="585" y="90" text-anchor="middle" class="d-small">= output_tokens</text>
            <line x1="130" y1="65" x2="168" y2="65" class="d-line" marker-end="url(#ah2)"/>
            <line x1="280" y1="65" x2="318" y2="65" class="d-line" marker-end="url(#ah2)"/>
            <line x1="460" y1="65" x2="498" y2="65" class="d-line" marker-end="url(#ah2)"/>
            <path d="M585,100 L585,170 L130,170" class="d-line-accent" marker-end="url(#ah2)"/>
            <text x="360" y="162" text-anchor="middle" class="d-small">stream: text deltas, one after another</text>
            <rect x="10" y="140" width="120" height="96" rx="8" class="d-box-good"/>
            <text x="70" y="164" text-anchor="middle" class="d-bold">Response</text>
            <text x="70" y="182" text-anchor="middle" class="d-small">content</text>
            <text x="70" y="198" text-anchor="middle" class="d-small">stop_reason</text>
            <text x="70" y="214" text-anchor="middle" class="d-small">usage.input_tokens</text>
            <text x="70" y="230" text-anchor="middle" class="d-small">usage.output_tokens</text>
            <text x="390" y="125" text-anchor="middle" class="d-small">sets time to first token (TTFT)</text>
            <text x="585" y="125" text-anchor="middle" class="d-small">sets most of the total time</text>
          </svg>` },
        { type: "html", html: `
          <h3>Tokens are the unit of everything</h3>
          <p>The model never sees characters. A tokenizer cuts the text into tokens from a fixed vocabulary.
          Most modern tokenizers use <strong>byte pair encoding (BPE)</strong>: start with single bytes, then repeatedly join the pair that occurs most often in a training text, until the vocabulary has the planned size.
          Common words become one token. Rare words, names, code and many non-English scripts become several tokens.</p>` },
        { type: "interactive", id: "bpe" },
        { type: "note", kind: "fact", title: "Engineering facts to remember", html: `
          <ul>
            <li><strong>Price is per token</strong>, and output tokens cost more than input tokens (for example, 5 times more on the current Claude models). Check the current prices on the <a href="https://platform.claude.com/docs/en/about-claude/pricing" target="_blank" rel="noopener">pricing page</a>.</li>
            <li><strong>Count tokens with the model's own tokenizer.</strong> Different models can count the same text differently. With Claude, use the token counting endpoint (<code>client.messages.count_tokens(...)</code>). A tokenizer from another vendor gives wrong numbers.</li>
            <li><strong>The context window</strong> is the maximum number of tokens (input plus output) for one request.</li>
            <li><strong><code>max_tokens</code></strong> is the maximum number of output tokens. When the model reaches it, the answer is cut off and <code>stop_reason</code> is <code>"max_tokens"</code>.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Why did it stop? Read <code>stop_reason</code></h3>
          <div class="table-wrap"><table>
            <tr><th>stop_reason</th><th>Meaning</th><th>What your code does</th></tr>
            <tr><td><code>end_turn</code></td><td>The model finished normally.</td><td>Use the answer.</td></tr>
            <tr><td><code>max_tokens</code></td><td>The output limit was reached. The answer is incomplete.</td><td>Do not show it as complete. Raise the limit, ask for a shorter answer, or continue.</td></tr>
            <tr><td><code>stop_sequence</code></td><td>One of your stop strings appeared.</td><td>Use the text before it.</td></tr>
            <tr><td><code>tool_use</code></td><td>The model asks your code to run a tool.</td><td>Run the tool and send the result (Topic 4).</td></tr>
            <tr><td><code>pause_turn</code></td><td>A long server-side turn paused.</td><td>Send the response back to continue.</td></tr>
            <tr><td><code>refusal</code></td><td>The model or a safety classifier declined.</td><td>Show a clear message. Do not read <code>content[0]</code> without a check.</td></tr>
          </table></div>
          <p class="muted">Source: <a href="https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons" target="_blank" rel="noopener">Handling stop reasons</a>.</p>
          <h3>Streaming changes how slow it feels, not how slow it is</h3>
          <p>Without streaming, the user waits for the complete answer. With streaming, the first words arrive after the <strong>time to first token (TTFT)</strong>.
          The total time is almost the same. For a chat interface, TTFT is the number users notice. Streaming also protects long requests from HTTP timeouts.</p>` },
        { type: "code", lang: "python", code:
`import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment

with client.messages.stream(
    model="claude-haiku-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain tokens in two sentences."}],
) as stream:
    for text in stream.text_stream:      # each text delta, when it arrives
        print(text, end="", flush=True)
    message = stream.get_final_message()  # the complete message at the end

print()
print(message.stop_reason, message.usage.input_tokens, message.usage.output_tokens)` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This example leaves out error handling and timing. Ticket T-001 adds both. Read it to see the shape of a streaming call, not as finished code.</p>` },
        { type: "worked", title: "Worked example: what does one request cost?",
          intro: "A support bot sends about 1,200 input tokens (system prompt, history, question) and gets about 300 output tokens. It handles 50,000 requests per day. Prices for Claude Opus 5.5 at the time of writing: $4 per million input tokens, $20 per million output tokens.",
          steps: [
            { html: "Input cost per request = 1,200 × $4 / 1,000,000 = <strong>$0.0048</strong>." },
            { html: "Output cost per request = 300 × $20 / 1,000,000 = <strong>$0.0060</strong>. The output is only 20% of the tokens but more than half of the cost." },
            { html: "Cost per request = $0.0048 + $0.0060 = <strong>$0.0108</strong>. Per day: $0.0108 × 50,000 = <strong>$540</strong>." },
            { faded: true, html: "Your turn. Claude Haiku 5.5 costs $0.10 per million input tokens and $0.50 per million output tokens (for prompts of 100K tokens or fewer). Use the same token counts. What is the cost per day?",
              answer: "Input: 1,200 × 0.10 / 1,000,000 = $0.00012. Output: 300 × 0.50 / 1,000,000 = $0.00015. Per request: $0.00027. Per day: × 50,000 = $13.50. That is 40 times cheaper. Topic 6 (model routing) asks when the quality difference is worth it. Before you decide, count the tokens again with count_tokens for each model, because token counts can differ between models." },
            { faded: true, html: "Your turn. The product team wants answers twice as long (600 output tokens) on Opus 5.5. What is the new cost per day, and which part of the bill grows?",
              answer: "Output per request becomes 600 × 20 / 1,000,000 = $0.012. Per request: $0.0048 + $0.012 = $0.0168. Per day: $840. Only the output part grows, and it was already the larger part. Longer answers also increase latency, because each output token is one decode step." }
          ] },
        { type: "interactive", id: "cost" }
      ],
      checks: [
        { id: "1.1-L2-a", type: "mcq",
          q: "Your summaries sometimes end in the middle of a sentence. The logs show stop_reason = \"max_tokens\". What is the best first fix?",
          options: [
            "Lower the temperature.",
            "Raise max_tokens, or ask for a shorter summary, and never show a max_tokens answer as complete.",
            "Switch to a model with a larger context window.",
            "Retry the same request until it ends with a full stop."
          ],
          correct: 1,
          explain: "max_tokens limits the output length. The context window is a different limit. Temperature does not change length limits. A retry with the same limit fails the same way." },
        { id: "1.1-L2-b", type: "mcq",
          q: "Which change most reduces time to first token (TTFT) for a chat request?",
          options: [
            "A lower max_tokens.",
            "A shorter prompt (fewer input tokens), or a cached prompt prefix.",
            "Asking for a shorter answer.",
            "A higher temperature."
          ],
          correct: 1,
          explain: "TTFT includes the prefill of all input tokens. A shorter or cached input reduces it. Output length changes the total time, not the time to the first token." },
        { id: "1.1-L2-c", type: "recall",
          q: "Why should you never count Claude tokens with another vendor's tokenizer?",
          answer: "Each model family has its own tokenizer and vocabulary, so the same text gives a different token count. Use the model's own count (client.messages.count_tokens for Claude), or read usage from the response." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Logits, sampling, prefill and decode",
      blocks: [
        { type: "html", html: `
          <h3>From scores to a token: logits, softmax and sampling</h3>
          <p>The model's last layer gives one raw score per vocabulary token. These scores are called <strong>logits</strong>.
          The <strong>softmax</strong> function changes logits into probabilities: p<sub>i</sub> = e<sup>z<sub>i</sub>/T</sup> / Σ<sub>j</sub> e<sup>z<sub>j</sub>/T</sup>, where T is the <strong>temperature</strong>.</p>
          <ul>
            <li><strong>T below 1</strong> makes the distribution sharper. The top token gets more probability.</li>
            <li><strong>T above 1</strong> makes it flatter. Unlikely tokens get picked more often.</li>
            <li><strong>Greedy decoding</strong> always picks the top token. It is the limit as T goes to 0.</li>
            <li><strong>Top-p (nucleus) sampling</strong> keeps the smallest set of top tokens whose probabilities add up to at least p, then samples only from that set.</li>
            <li><strong>Top-k</strong> keeps only the k most likely tokens.</li>
          </ul>` },
        { type: "worked", title: "Worked example: softmax and top-p by hand",
          intro: "Three candidate tokens have the logits \" Paris\" = 2.0, \" Lyon\" = 1.0, \" the\" = 0.1. These numbers are made up for the example.",
          steps: [
            { html: "At T = 1: e<sup>2.0</sup> = 7.389, e<sup>1.0</sup> = 2.718, e<sup>0.1</sup> = 1.105. The sum is 11.212." },
            { html: "Divide each by the sum: \" Paris\" = <strong>0.659</strong>, \" Lyon\" = <strong>0.242</strong>, \" the\" = <strong>0.099</strong>. They add up to 1." },
            { html: "Top-p with p = 0.9: sort from high to low and add. 0.659 is below 0.9. 0.659 + 0.242 = 0.901 is at least 0.9. Keep the first two tokens. \" the\" can never be picked." },
            { faded: true, html: "Your turn. At T = 0.5, divide each logit by 0.5 first (4.0, 2.0, 0.2). What are the new probabilities? Is \" the\" more or less likely than at T = 1?",
              answer: "e^4.0 = 54.598, e^2.0 = 7.389, e^0.2 = 1.221. Sum = 63.209. Probabilities: 0.864, 0.117, 0.019. \" the\" is much less likely (0.019 compared to 0.099). Low temperature makes the top choice dominate." }
          ] },
        { type: "interactive", id: "sampler" },
        { type: "note", kind: "warn", title: "Important: current Claude models do not accept these parameters", html: `
          <p>On the current Claude models (Claude Opus 5.5, Sonnet 5.5, Haiku 5.5), the API rejects non-default <code>temperature</code>, <code>top_p</code> and <code>top_k</code>.
          On API version 2026-10-21 it rejects any value. Older models and other providers still accept them, and interviewers still ask about them.
          Learn the concept. Do not put these parameters in T-001.</p>
          <p>For repeatable tests, do not depend on sampling settings. Test properties of the output (format, required facts), or mock the client (see the debugging exercise below).</p>` },
        { type: "html", html: `
          <h3>Prefill compared to decode</h3>
          <p><strong>Prefill</strong> processes all input tokens in one large parallel pass. The GPU is used well. Its time grows with input length, and it sets most of the TTFT.</p>
          <p><strong>Decode</strong> makes output tokens one at a time, because each token depends on the token before it. Each step is small, so the GPU often waits for memory, not for computation.
          Total time ≈ TTFT + (output tokens × time per output token).</p>
          <p>To avoid the computation of attention for all earlier tokens at every step, the server keeps the <strong>KV cache</strong>: the key and value vectors of tokens it already processed.
          The KV cache grows with context length and uses GPU memory. Lesson 1.7 covers it, and prompt caching (Topic 2) builds on the same idea across requests.</p>
          <h3>Thinking tokens are output tokens</h3>
          <p>Reasoning models can write "thinking" before the answer. On Claude Opus 5.5, thinking is always on, and you control how much with <code>output_config={"effort": ...}</code> (low, medium, high, xhigh, max; the default is medium).
          Thinking tokens count against <code>max_tokens</code> and are billed as output tokens. A very small <code>max_tokens</code> can stop the request before any answer text appears. Lesson 1.9 covers when thinking helps.</p>
          <p class="muted">Sources: <a href="https://platform.claude.com/docs/en/build-with-claude/effort" target="_blank" rel="noopener">Effort</a>, <a href="https://platform.claude.com/docs/en/about-claude/models/overview" target="_blank" rel="noopener">Models overview</a>.</p>` }
      ],
      checks: [
        { id: "1.1-L3-a", type: "mcq",
          q: "With p = 0.9, the sorted probabilities are 0.50, 0.30, 0.15, 0.05. Which tokens can top-p sampling pick?",
          options: ["Only the first.", "The first two.", "The first three.", "All four."],
          correct: 2,
          explain: "0.50 + 0.30 = 0.80 is below 0.9. 0.80 + 0.15 = 0.95 reaches 0.9. Keep three tokens." },
        { id: "1.1-L3-b", type: "recall",
          q: "Why is decoding slower per token than prefill, and what does this mean for a product with long answers?",
          answer: "Decode makes one token per step because each token depends on the previous one, so the steps cannot run in parallel and each step is limited by memory bandwidth. Prefill processes all input tokens in parallel. Long answers therefore increase total latency almost linearly, so stream the answer, keep answers as short as the task allows, and route easy tasks to faster models." }
      ]
    }
  ],

  debugging: [
    { id: "dbg-1", title: "The answer is cut off",
      symptom: "A CLI that summarizes meeting notes prints a summary that ends in the middle of a sentence. It happens only for long meetings. Nothing crashes.",
      evidence: "Log line: stop_reason=max_tokens input_tokens=18240 output_tokens=512",
      hints: [
        "Which number in the log line equals a value you set in the code?",
        "What does the code do with stop_reason today?"
      ],
      answer: "The output reached max_tokens = 512. Long meetings need longer summaries, so they hit the limit. Fix: check stop_reason; when it is max_tokens, do not print the result as complete; raise max_tokens or ask for a bounded format (for example, at most 8 bullets). On a thinking model, remember that thinking tokens also use the max_tokens budget." },
    { id: "dbg-2", title: "The test passes on my computer and fails in CI",
      symptom: "A test calls the real API and asserts that the answer equals \"Paris is the capital of France.\" It passes sometimes and fails sometimes.",
      evidence: "Failed output: \"The capital of France is Paris.\"",
      hints: [
        "Is the output of a sampled generation guaranteed to be the same each time?",
        "What is the test really trying to prove?"
      ],
      answer: "Generation is sampled, so the exact text can change between runs. Also, unit tests that call a paid, networked API are slow, cost money and depend on the network. Fix: in unit tests, mock the client and test your code (parsing, logging, error handling). For model behavior, write a separate eval that checks properties (the answer contains \"Paris\", the format is valid) over many examples (Topic 5)." }
  ],

  recall: [
    { id: "1.1-r1", q: "What does an LLM compute in one step of generation?", a: "A score (logit) for every token in its vocabulary, for the next position. Softmax changes the scores to probabilities, and one token is picked." },
    { id: "1.1-r2", q: "Name the three common reasons a generation stops.", a: "The model makes an end token (end_turn), the output reaches max_tokens, or a stop sequence appears (stop_sequence). With tools, also tool_use; with safety, refusal." },
    { id: "1.1-r3", q: "Why do output tokens set most of the latency?", a: "Each output token needs one decode step, and the steps run one after another. Input tokens are processed in parallel during prefill." },
    { id: "1.1-r4", q: "What is BPE, in one sentence?", a: "Byte pair encoding builds a vocabulary by starting from bytes and repeatedly joining the most frequent adjacent pair, so common strings become single tokens." },
    { id: "1.1-r5", q: "What does temperature do to the probability distribution?", a: "It divides the logits before softmax. Below 1 the distribution becomes sharper (top token more likely); above 1 it becomes flatter (more variety)." },
    { id: "1.1-r6", q: "Why does a long chat cost more per message than a short one?", a: "The API is stateless, so every request sends the whole conversation again. More history means more input tokens per request." },
    { id: "1.1-r7", q: "On Claude Opus 5.5, why can a small max_tokens give an empty answer?", a: "Thinking is always on, and thinking tokens count against max_tokens. The budget can run out before any answer text is written." }
  ],

  interview: [
    { q: "Explain how an LLM generates text to a backend engineer, in two minutes.",
      outline: "Tokenize the input. One forward pass gives logits for the next token. Softmax and sampling pick one token. Append it and repeat (decode loop) until an end token, max_tokens or a stop sequence. Connect: cost per token, TTFT from prefill, total latency from output length, nondeterminism from sampling, statelessness of the API." },
    { q: "Why can the same prompt give different answers? How do you test an LLM feature anyway?",
      outline: "Sampling picks from a distribution. Even with low temperature, infrastructure details can change results. Test your own code with a mocked client. Test model behavior with evals that check properties over a dataset, and track the pass rate over versions (Topic 5)." },
    { q: "Your LLM feature is too slow. Where do you look first?",
      outline: "Measure TTFT and total time separately. High TTFT: long input, no prompt caching, queueing, large model. High total time: long output; shorten the answers, stream, use a faster model for easy cases. Check thinking or effort settings, because thinking tokens are output tokens." },
    { q: "Estimate the daily cost of an LLM feature.",
      outline: "Tokens in and out per request × requests per day × price per token, input and output separately. Note which part dominates (often output). Add retries, caching discounts and growth. Count tokens with the model's own tokenizer." }
  ],

  misconceptions: [
    { wrong: "The model looks up facts in a database.", right: "It predicts tokens from patterns in its weights. Grounding (RAG) gives it source text to use (Topic 3)." },
    { wrong: "A token is a word.", right: "A token is a vocabulary piece: often part of a word, sometimes a word with its leading space, a number piece or punctuation." },
    { wrong: "The model remembers my earlier requests.", right: "The API is stateless. Your code sends the history each time." },
    { wrong: "max_tokens is the context window.", right: "max_tokens limits the output only. The context window limits input plus output." },
    { wrong: "Temperature 0 makes the API fully deterministic, so exact-match tests are fine.", right: "Do not depend on it. Current Claude models do not accept the parameter, and exact-match tests on model text are brittle. Mock the client and use property-based evals." },
    { wrong: "Streaming makes generation faster.", right: "Streaming makes the first words arrive sooner. The total time stays about the same." }
  ],

  resources: [
    { title: "Large Language Models explained briefly", by: "3Blue1Brown", kind: "Video, 8 min", url: "https://www.youtube.com/watch?v=LPZh9BOjkQs",
      when: "Watch after level 1, before level 2.",
      why: "A visual of the same next-token loop, with the idea of training on large text.",
      watchFor: [
        "What does the model output at each step: one word, or a probability for each possible next token?",
        "Why does the same prompt give different answers on different runs?"
      ] },
    { title: "[1hr Talk] Intro to Large Language Models", by: "Andrej Karpathy", kind: "Video, about 1 h", url: "https://www.youtube.com/watch?v=zjkBMFhNj_g",
      when: "Watch after level 2. For this lesson, the first part (what an LLM is and how it runs) is enough.",
      why: "Explains the model as a file of weights plus a small program that runs it, and how pretraining differs from fine-tuning.",
      note: "Use the chapter list on YouTube to find the parts. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "What two files does Karpathy say an LLM consists of?",
        "How is the 'document generator' different from the assistant you chat with?"
      ] },
    { title: "Let's build the GPT Tokenizer", by: "Andrej Karpathy", kind: "Video, long, optional", url: "https://www.youtube.com/watch?v=zduSFxRajkE",
      when: "Optional, after level 2, if you want BPE in code. Lesson 1.2 uses it more.",
      why: "Builds a BPE tokenizer from zero.",
      watchFor: ["Why do numbers and non-English text often use more tokens?"] },
    { title: "Streaming Messages", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/streaming",
      when: "Read before T-001.", why: "The event types in a stream and the SDK helpers.",
      watchFor: ["Which event carries the text deltas? Where is the final usage?"] },
    { title: "Token counting", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/token-counting",
      when: "Read before T-001.", why: "How to count input tokens before you send a request.",
      watchFor: ["Is token counting billed? Does it count system prompts and tools?"] },
    { title: "Handling stop reasons", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons",
      when: "Read before T-001.", why: "All stop_reason values and what to do for each.",
      watchFor: ["What should code do on a refusal before it reads content?"] },
    { title: "Errors", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/api/errors",
      when: "Read during T-001.", why: "HTTP error codes and which ones are worth a retry.",
      watchFor: ["Which status codes mean 'retry later' and which mean 'fix your request'?"] },
    { title: "Pricing", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/about-claude/pricing",
      when: "Read during T-001.", why: "The current price table for your cost estimate.",
      watchFor: ["What is the price ratio between output and input tokens for the model you use?"] },
    { title: "The Illustrated Transformer", by: "Jay Alammar", kind: "Article", url: "https://jalammar.github.io/illustrated-transformer/",
      when: "Optional preview. Lessons 1.4 and 1.5 use it.", why: "The clearest picture of what happens inside one forward pass.",
      watchFor: ["Which part of the transformer lets each token look at the other tokens?"] }
  ],

  summary: `
    <ul>
      <li>An LLM makes text one token at a time: score all next tokens, pick one, append, repeat.</li>
      <li>Tokens set cost, context limits and latency. Count them with the model's own tokenizer.</li>
      <li>Input is processed in parallel (prefill → TTFT). Output is made one token per step (decode → total time).</li>
      <li>Read <code>stop_reason</code> on every response. <code>max_tokens</code> means the answer is incomplete.</li>
      <li>Sampling (temperature, top-p) explains why answers vary. Current Claude models do not accept these parameters.</li>
      <li>The API is stateless. Your code sends the history each time.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer who has never used an LLM API: what happens between your HTTP request and the last streamed token. Use a diagram. Name three ways this affects the design of a product. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-001"]
};

/* ====================================================================== T-001 */
window.ACADEMY.tickets["T-001"] = {
  id: "T-001",
  title: "First call: a measured Claude CLI",
  lesson: "1.1",
  phase: 1,
  mode: "Guided first (milestones 1 to 3), then independent (milestones 4 to 6)",
  estimate: "Your pace. Most people need 2 to 4 focused sessions.",
  fields: {
    objective: `
      <p>Build a small command-line tool, <code>ask</code>, that sends one question to Claude, streams the answer, and prints a measurement line:
      input tokens, output tokens, stop reason, time to first token, total time and estimated cost.</p>
      <p><strong>Real-world problem.</strong> Teams that add an LLM feature often cannot answer "how much does one request cost, and why is it slow?".
      This tool makes those numbers visible from the first day. Every later part of the project reuses its client wrapper and its measurements.</p>`,
    context: `
      <p>This is the first ticket of the <strong>Company AI Assistant</strong>, a fictional internal assistant for a fictional company ("Northwind Tools").
      Phase 1 creates the LLM client layer. Phase 2 puts it behind a FastAPI service and adds document search (RAG).
      Phase 3 adds tools and an agent loop. Later phases add evals, security, routing and cost control.</p>
      <p>Decisions in this ticket that later tickets depend on: one module owns all calls to the model; every call is measured; secrets come only from the environment.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.1, levels 1 and 2 complete (level 3 helps for milestone 5).</li>
        <li>Python 3.11 or later, VS Code, Claude Code.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>. Never put the key in a file that git tracks.</li>
        <li>Read the docs pages "Streaming Messages", "Token counting" and "Handling stop reasons" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.cli "your question"</code> streams the answer to the terminal as it arrives.</li>
        <li>Before the call, the tool counts the input tokens with the token counting endpoint and prints the count.</li>
        <li>After the call, it prints one measurement line: model, input tokens, output tokens, stop reason, TTFT in ms, total time in ms, estimated cost in USD.</li>
        <li>Options: <code>--model</code> (default from the environment variable <code>ASSISTANT_MODEL</code>, else <code>claude-opus-5-5</code>), <code>--max-tokens</code> (default 1024), <code>--system</code> (optional system prompt).</li>
        <li>When <code>stop_reason</code> is <code>max_tokens</code>, print a clear warning that the answer is incomplete.</li>
        <li>When <code>stop_reason</code> is <code>refusal</code>, print a clear message and do not print partial text as an answer.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Use the official <code>anthropic</code> Python SDK. Do not call the HTTP API by hand. Do not use another vendor's tokenizer.</li>
        <li>One module (<code>assistant/llm.py</code>) owns the client and the call. The CLI does not import <code>anthropic</code> directly.</li>
        <li>The function in <code>llm.py</code> returns a typed result (a dataclass or a Pydantic model) with the text and the measurements.</li>
        <li>Prices live in one table (<code>assistant/pricing.py</code>) with a comment that names the date you checked the pricing page.</li>
        <li>Handle these errors with a clear message and an exit code that is not 0: authentication, permission, rate limit (show the retry-after value when present), bad request, connection error, timeout, other API status errors.</li>
        <li>Use the SDK's built-in retries. Set <code>max_retries</code> explicitly so that the behavior is visible in the code.</li>
        <li>Tests run without network access and without an API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given a valid key, when you run <code>ask "What is a token?"</code>, then text appears before the full answer is complete, and the measurement line shows non-zero input and output tokens and <code>stop_reason=end_turn</code>.</li>
        <li>The printed input-token count from the count step equals <code>usage.input_tokens</code> of the response, or you can explain the difference in your handoff.</li>
        <li>Given <code>--max-tokens 20</code> and a question that needs a long answer, the tool prints the incomplete-answer warning and <code>stop_reason=max_tokens</code>.</li>
        <li>Given no <code>ANTHROPIC_API_KEY</code> (or an invalid one), the tool prints one clear error line, no stack trace, and exits with a code that is not 0.</li>
        <li>The estimated cost equals input_tokens × input price + output_tokens × output price, and a unit test proves it.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file in the repository and in no log line.</li>
        <li>TTFT is smaller than the total time in every successful run.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Setup (guided).</strong> Open <code>ai-academy/project/</code> in VS Code. Run <code>git init</code>. Create a virtual environment and <code>pyproject.toml</code>. Read the existing <code>.env.example</code> and <code>.gitignore</code> and say why each line is there. Install <code>anthropic</code> and <code>pytest</code>. Confirm that <code>python -c "import anthropic"</code> works.</li>
        <li><strong>One plain call (guided).</strong> In <code>llm.py</code>, send one non-streaming request and print <code>content</code>, <code>stop_reason</code> and <code>usage</code>. Look at the response object. Do not add options yet.</li>
        <li><strong>Streaming and timing (guided).</strong> Change to <code>client.messages.stream(...)</code>. Record the time of the first text delta and the end time. Return a result object.</li>
        <li><strong>Token count and cost (independent).</strong> Count tokens before the call. Add <code>pricing.py</code> and the cost function. Print the measurement line.</li>
        <li><strong>Stop reasons and errors (independent).</strong> Handle <code>max_tokens</code> and <code>refusal</code>. Handle the error types. Reproduce a <code>max_tokens</code> stop on purpose. Before you run it, write down what you predict for <code>--max-tokens 20</code> on <code>claude-opus-5-5</code> and on <code>claude-haiku-5-5</code>, then compare.</li>
        <li><strong>Tests and handoff (independent).</strong> Write the tests in the test list with a fake client. Fill in <code>handoffs/T-001-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional: read the docs page <a href="https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback" target="_blank" rel="noopener">Refusals and fallback</a>, then decide whether the tool should use the server-side fallback option for Opus 5.5. Write your decision and reason in the handoff. Haiku 5.5 has no server-side fallback.</p>`,
    files: `
      <p>The folder <code>ai-academy/project/</code> is the root of the Company AI Assistant repository.</p>
      <pre><code>project/
  CLAUDE.md             # tutor rules for Claude Code (already there)
  .env.example          # ANTHROPIC_API_KEY=   (name only, already there)
  .gitignore            # .env, .venv/, __pycache__/ (already there)
  pyproject.toml
  assistant/
    __init__.py
    llm.py              # client, stream call, result dataclass, error mapping
    pricing.py          # price table + cost function
    cli.py              # argument parsing, printing
  tests/
    test_pricing.py
    test_llm.py         # fake client: stream, stop reasons, errors
  tickets/
    T-001.md            # this ticket (generated, already there)
  handoffs/
    T-001-handoff.md    # your handoff (template already there)</code></pre>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_cost_is_input_plus_output</code></td><td>1,200 in, 300 out, Opus 5.5 prices</td><td>0.0108 (compare floats with a tolerance)</td></tr>
        <tr><td><code>test_unknown_model_price_is_reported</code></td><td>A model not in the table</td><td>A clear error or "unknown cost", never a silent 0</td></tr>
        <tr><td><code>test_stream_collects_text_and_usage</code></td><td>Fake stream with 3 text deltas</td><td>Result text is the joined deltas; tokens come from the final message</td></tr>
        <tr><td><code>test_ttft_not_greater_than_total</code></td><td>Fake stream with a controlled clock</td><td>ttft_ms ≤ total_ms</td></tr>
        <tr><td><code>test_max_tokens_marks_incomplete</code></td><td>Final message with stop_reason "max_tokens"</td><td>Result says incomplete; CLI prints the warning</td></tr>
        <tr><td><code>test_refusal_does_not_return_text_as_answer</code></td><td>stop_reason "refusal"</td><td>Refusal result; no partial text shown as an answer</td></tr>
        <tr><td><code>test_rate_limit_error_message</code></td><td>Fake client raises a rate-limit error</td><td>Clear message, retry-after shown when present, exit code not 0</td></tr>
        <tr><td><code>test_auth_error_has_no_stack_trace</code></td><td>Fake client raises an authentication error</td><td>One-line message; exit code not 0</td></tr>
      </table></div>
      <p class="muted">Design hint: give <code>llm.py</code> a function that takes the client as an argument (dependency injection). Then a test can pass a fake client. Do not write the fake for the whole SDK; fake only the methods you call.</p>`,
    nfr: `
      <ul>
        <li><strong>Security:</strong> the key comes only from the environment. <code>.env</code> is in <code>.gitignore</code>. Never log the request headers or the key. Print the environment variable name in error messages, never its value.</li>
        <li><strong>Reliability:</strong> explicit timeout and <code>max_retries</code>. Distinguish "retry later" errors (429, 5xx, connection) from "fix the request" errors (400, 401, 403, 404).</li>
        <li><strong>Performance:</strong> stream by default. Measure TTFT and total time with a monotonic clock (<code>time.perf_counter</code>).</li>
        <li><strong>Cost:</strong> show the cost of every call. Use <code>claude-haiku-5-5</code> for repeated manual tests. Unit tests make no paid calls.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Why is TTFT on a long prompt larger than on a short prompt, while total time depends more on the answer length?</li>
        <li>What happened with <code>--max-tokens 20</code> on each model? Did your prediction match? Explain any empty answer.</li>
        <li>Did the counted input tokens match <code>usage.input_tokens</code>? If not, why?</li>
        <li>Which errors should your tool retry, and which should it never retry? Where does the SDK already do this for you?</li>
        <li>Your cost line uses a price table in code. What can go wrong with that in six months, and how would you detect it?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (terminal output, test output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>No secret in the repository: <code>git grep</code> for the key prefix returns nothing.</li>
        <li>You can explain every line of <code>llm.py</code> without notes.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> correct stop-reason handling; errors mapped by type, not by message text;
      measurements taken at the right moments; a client that tests can replace; no secrets; clear names; and how well your answers to the questions show understanding.</p>`
  }
};
