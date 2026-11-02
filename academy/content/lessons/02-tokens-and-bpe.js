/*
 * Lesson 1.2 - Tokens and BPE in depth.
 * Ticket T-002 - Token meter: count before you send.
 *
 * Same schema as lesson 1.1 (see 01-how-llms-produce-text.js for the block types).
 * All ids in this file start with "l1-2-" so that they stay unique across the site.
 *
 * Facts in this file:
 *   - UTF-8 byte counts were computed with TextEncoder (JavaScript) and match
 *     Python len(text.encode("utf-8")).
 *   - The BPE merge steps were computed with the bpeInit / bpeStep / bpeApply
 *     functions in app.js on the lesson corpus.
 *   - Token counts for real models are not given. The lesson and the ticket tell
 *     the learner to measure them with the token counting endpoint.
 *   - Toy numbers are marked as made up.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.2"] = {
  id: "1.2",
  topic: "t1",
  title: "Tokens and BPE in depth",
  objective: "Explain how a byte-level BPE tokenizer learns its vocabulary and splits new text, and use that knowledge to measure, predict and control the token count (and so the cost) of real requests.",
  prerequisites: [
    "Lesson 1.1 complete (the generation loop, tokens, cost per token).",
    "You can read a short Python program.",
    "You know that a computer stores text as numbers. Lesson level 1 explains the rest."
  ],
  covers: ["t1-tokens"],
  whyItMatters: `
    <p>Lesson 1.1 showed that the token is the unit of cost, of latency and of the context limit.
    This lesson shows where tokens come from. When you know that, you can predict which inputs are expensive before the bill arrives:
    non-English text, source code, long numbers, IDs and emoji often need more tokens than plain English text of the same length.</p>
    <p>Tokenization also explains some model behavior that looks strange: the model can fail to count the letters in a word, or make mistakes with digits.
    In an interview, "what is a token, and why is it not a word?" is a common follow-up question to "how does an LLM work?".</p>`,
  concepts: [
    { id: "l1-2-c-bytes", name: "Characters, code points and UTF-8 bytes" },
    { id: "l1-2-c-bpe-train", name: "BPE training: learn merges from pair counts" },
    { id: "l1-2-c-bpe-encode", name: "BPE encoding: apply the merges to new text" },
    { id: "l1-2-c-model-specific", name: "Token counts are model-specific (count with the same model id)" },
    { id: "l1-2-c-token-cost", name: "Which inputs use more tokens, and what that costs" },
    { id: "l1-2-c-vocab-size", name: "Vocabulary size trade-offs and tokenization artifacts" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Where tokens come from",
      blocks: [
        { type: "html", html: `
          <p>The model cannot read letters. It reads a list of integers. The <strong>tokenizer</strong> changes your text into that list, and changes the model's output list back into text.</p>
          <p>The tokenizer does this in three steps:</p>
          <ol>
            <li>It changes the text into <strong>bytes</strong> (UTF-8). Each byte is a number from 0 to 255.</li>
            <li>It joins bytes into larger pieces with a list of <strong>merge rules</strong> that it learned before. A piece is a <strong>token</strong>.</li>
            <li>It changes each token into its <strong>token ID</strong>: the position of the token in the fixed vocabulary.</li>
          </ol>
          <p>The merge rules come from statistics, not from grammar. A tokenizer learns them from a large training text: pieces that occur together often become one token.</p>` },
        { type: "diagram", caption: "From text to token IDs. The same steps run in reverse to change the model's output IDs back into text.",
          svg: `<svg viewBox="0 0 680 190" role="img" aria-label="Diagram: text, then UTF-8 bytes, then merges, then token IDs, then the model">
            <defs><marker id="l12a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="10" y="40" width="110" height="70" rx="8" class="d-box"/>
            <text x="65" y="66" text-anchor="middle" class="d-bold">Text</text>
            <text x="65" y="86" text-anchor="middle" class="d-small">"café"</text>
            <rect x="150" y="40" width="120" height="70" rx="8" class="d-box"/>
            <text x="210" y="66" text-anchor="middle" class="d-bold">UTF-8 bytes</text>
            <text x="210" y="86" text-anchor="middle" class="d-small">63 61 66 c3 a9</text>
            <rect x="300" y="40" width="110" height="70" rx="8" class="d-box-accent"/>
            <text x="355" y="66" text-anchor="middle" class="d-bold">Merges</text>
            <text x="355" y="86" text-anchor="middle" class="d-small">join learned pairs</text>
            <rect x="440" y="40" width="110" height="70" rx="8" class="d-box"/>
            <text x="495" y="66" text-anchor="middle" class="d-bold">Token IDs</text>
            <text x="495" y="86" text-anchor="middle" class="d-small">one integer each</text>
            <rect x="580" y="40" width="90" height="70" rx="8" class="d-box-good"/>
            <text x="625" y="66" text-anchor="middle" class="d-bold">Model</text>
            <text x="625" y="86" text-anchor="middle" class="d-small">reads IDs</text>
            <line x1="120" y1="75" x2="148" y2="75" class="d-line" marker-end="url(#l12a1)"/>
            <line x1="270" y1="75" x2="298" y2="75" class="d-line" marker-end="url(#l12a1)"/>
            <line x1="410" y1="75" x2="438" y2="75" class="d-line" marker-end="url(#l12a1)"/>
            <line x1="550" y1="75" x2="578" y2="75" class="d-line" marker-end="url(#l12a1)"/>
            <text x="340" y="150" text-anchor="middle" class="d-small">5 bytes. The tokenizer can never need more tokens than this (byte-level BPE, special tokens not counted).</text>
            <text x="340" y="170" text-anchor="middle" class="d-small">How many tokens it really uses depends on the merges it learned.</text>
          </svg>` },
        { type: "note", kind: "analogy", title: "Analogy: a phrasebook for travelers", html: `
          <p>A phrasebook has one entry for each common phrase, such as "thank you". For a rare street name, you must spell it letter by letter.
          A tokenizer is the same: a common string is one token, and a rare string is many small tokens. Many small tokens cost more.</p>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>No meaning.</strong> A phrasebook groups words by meaning. A tokenizer groups bytes by frequency only. A token boundary can fall in the middle of a word part.</li>
            <li><strong>No unknown words.</strong> A byte-level tokenizer can always fall back to single bytes, so every input can be encoded. Nothing is "not in the dictionary". It only costs more tokens.</li>
            <li><strong>Small changes matter.</strong> In many BPE tokenizers, a word with a space before it, a word without a space, and the same word with a capital letter are three different tokens.</li>
          </ul>` },
        { type: "html", html: `<p>Use the tool below. It learns merges from a tiny training text. Click "Merge the top pair" a few times. Then type a new word, for example <code>slow</code> or <code>owl</code>, and see how many tokens it needs.</p>` },
        { type: "interactive", id: "bpe" },
        { type: "html", html: `<p><strong>Summary of level 1.</strong> Text becomes bytes. Learned merge rules join bytes into tokens. Each token has an ID. Strings that were common in the training text use few tokens. Rare strings use many tokens.</p>` }
      ],
      checks: [
        { id: "l1-2-L1-a", type: "mcq",
          q: "A product name, \"Zyntrovax\", uses many more tokens than the word \"table\". What is the best explanation?",
          options: [
            "The tokenizer splits text into syllables, and \"Zyntrovax\" has more syllables.",
            "The string was rare or absent in the tokenizer's training text, so no merge rules join its bytes into large pieces.",
            "The model does not know the word, so it adds extra tokens to explain it.",
            "Capital letters always use two tokens."
          ],
          correct: 1,
          explain: "Merge rules come from frequency in the training text. A common word like \"table\" was merged into one or a few tokens. A rare name stays split into small pieces. The tokenizer does not use syllables or meaning." },
        { id: "l1-2-L1-b", type: "recall",
          q: "In two or three sentences: what does a tokenizer do with the text \"café\" before the model sees it?",
          answer: "It changes the text into UTF-8 bytes (5 bytes, because é uses 2). It joins the bytes into tokens with its learned merge rules. It changes each token into its ID in the vocabulary, and the model reads the list of IDs." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Measure tokens, do not guess them",
      blocks: [
        { type: "html", html: `
          <h3>Characters, code points and bytes are different numbers</h3>
          <p>A tokenizer starts from bytes, so first learn to count bytes. UTF-8 uses 1 to 4 bytes for each Unicode code point:</p>
          <div class="table-wrap"><table>
            <tr><th>Text</th><th>Code points (Python <code>len</code>)</th><th>UTF-8 bytes</th><th>Why</th></tr>
            <tr><td><code>cat</code></td><td>3</td><td>3</td><td>ASCII letters use 1 byte each.</td></tr>
            <tr><td><code>café</code></td><td>4</td><td>5</td><td>é uses 2 bytes.</td></tr>
            <tr><td><code>日本</code></td><td>2</td><td>6</td><td>Most CJK characters use 3 bytes.</td></tr>
            <tr><td><code>नमस्ते</code> (Hindi)</td><td>6</td><td>18</td><td>Devanagari code points use 3 bytes. A reader sees fewer "letters", because vowel signs and the virama are separate code points.</td></tr>
            <tr><td><code>নমস্কার</code> (Bengali)</td><td>7</td><td>21</td><td>Bengali code points also use 3 bytes.</td></tr>
            <tr><td><code>👍</code></td><td>1</td><td>4</td><td>Most emoji use 4 bytes. Some emoji are several code points joined together.</td></tr>
          </table></div>
          <p class="muted">Check these numbers yourself in Python: <code>len(text)</code> and <code>len(text.encode("utf-8"))</code>.</p>` },
        { type: "note", kind: "fact", title: "Which inputs use more tokens", html: `
          <ul>
            <li><strong>Scripts that were rare in the tokenizer's training text.</strong> They start with more bytes for each character, and they get fewer merges. Many non-Latin scripts are in this group for many tokenizers.</li>
            <li><strong>Source code with unusual names</strong>, long identifiers, and files with a lot of indentation.</li>
            <li><strong>Numbers, IDs, hashes, UUIDs and base64.</strong> These strings have no repeated patterns, so few merges apply. Tokenizers also split long numbers in different ways.</li>
            <li><strong>Emoji and other symbols</strong>, because each starts as 4 bytes.</li>
          </ul>
          <p>The amount is different for each tokenizer. Do not guess it. Measure it on your own data.</p>` },
        { type: "html", html: `
          <h3>Each model family has its own tokenizer</h3>
          <p>The same text can give different token counts on different models. A count is only correct for the model that made it.
          With Claude, count with the token counting endpoint and give it the <strong>same model id</strong> that the real request uses.
          A tokenizer from another vendor, or a rule of thumb such as "N characters per token", gives wrong numbers. These rules come from English text and one tokenizer.</p>` },
        { type: "code", lang: "python", code:
`import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment

texts = {
    "english": "Where is my order?",
    "hindi": "मेरा ऑर्डर कहाँ है?",
}

for model in ["claude-opus-5-5", "claude-haiku-5-5"]:
    for name, text in texts.items():
        result = client.messages.count_tokens(
            model=model,  # the same model id as the real request
            messages=[{"role": "user", "content": text}],
        )
        print(model, name, len(text), len(text.encode("utf-8")), result.input_tokens)` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>The count includes the tokens of the message format, not only your text. Thus one short word can give a count larger than 1.
          To compare two texts, send them in the same message shape to the same model.
          The system prompt, tool definitions, images and documents also count. Give them to <code>count_tokens</code> in the same way as to the real request.
          The docs say that the count is an estimate, and the real <code>usage.input_tokens</code> can be a little different.</p>` },
        { type: "worked", title: "Worked example: the worst case from bytes",
          intro: "A byte-level BPE tokenizer starts with one token for each byte, and each merge makes the list shorter. So the number of bytes is the maximum number of tokens for that text (special tokens and the message format not counted).",
          steps: [
            { html: "\"cat\" is 3 bytes. It can never need more than <strong>3</strong> tokens. In practice a common English word is often 1 token." },
            { html: "\"नमस्ते\" is 6 code points × 3 bytes = <strong>18</strong> bytes. Without merges for Devanagari, it can need up to 18 tokens." },
            { html: "The real number is between 1 and the byte count. It depends on how much text of that script the tokenizer saw in training. Only a measurement gives the real number." },
            { faded: true, html: "Your turn. \"নমস্কার\" has 7 code points, and each is a Bengali code point. What is the maximum token count?",
              answer: "Each Bengali code point uses 3 bytes in UTF-8. 7 × 3 = 21 bytes, so at most 21 tokens. Check it: len(\"নমস্কার\".encode(\"utf-8\")) is 21." },
            { faded: true, html: "Your turn. A message is 100 emoji, each 1 code point. What is the maximum token count? Why is a limit of \"500 characters\" in your UI not a good token limit?",
              answer: "Each emoji is 4 bytes, so 400 bytes and at most 400 tokens. A character limit does not control the token count, because the number of bytes and tokens for each character changes a lot between scripts and symbols. If cost or the context limit matters, count tokens." }
          ] },
        { type: "worked", title: "Worked example: what does a language difference cost?",
          intro: "The token counts in this example are made up. Measure your own with count_tokens. A help desk gets 100,000 questions per month on Claude Opus 5.5 ($4 per million input tokens, $20 per million output tokens at the time of writing). Assume each question is 40 tokens in English and 100 tokens in another language with the same meaning.",
          steps: [
            { html: "English input: 40 × 100,000 = 4,000,000 tokens. 4 × $4 = <strong>$16</strong> per month." },
            { html: "Other language input: 100 × 100,000 = 10,000,000 tokens. 10 × $4 = <strong>$40</strong> per month. The same questions cost 2.5 times more." },
            { faded: true, html: "Your turn. The answers are 200 tokens in English and 500 tokens in the other language (also made up). What is the output cost per month for each language? What else becomes 2.5 times larger?",
              answer: "English: 200 × 100,000 = 20,000,000 tokens × $20 / 1,000,000 = $400. Other language: 50,000,000 tokens × $20 / 1,000,000 = $1,000. The output part of the bill grows the most. The total answer time also grows, because each output token is one decode step (lesson 1.1). A fixed max_tokens also cuts off the longer answers sooner." }
          ] },
        { type: "interactive", id: "cost" },
        { type: "note", kind: "warn", title: "Do not hard-code token counts", html: `
          <p>Do not put an exact count of a real model in a test, a budget or a price forecast without the model id next to it.
          A new model version can use a new tokenizer. When you change the model, measure again.</p>` }
      ],
      checks: [
        { id: "l1-2-L2-a", type: "mcq",
          q: "Your service blocks a request when len(text) is above a character limit. Some short messages in Bengali still go above your token budget. What is the best fix?",
          options: [
            "Lower the character limit for all users.",
            "Count tokens with count_tokens and the same model id as the request, and compare the count with the token budget.",
            "Count tokens with a free tokenizer from another vendor, because it is faster.",
            "Divide the character count by a fixed number to get tokens."
          ],
          correct: 1,
          explain: "Characters do not map to tokens with a fixed ratio. The ratio changes by script and by tokenizer. Only the model's own count is correct, and it is correct only for that model id." },
        { id: "l1-2-L2-b", type: "mcq",
          q: "You count a prompt with claude-haiku-5-5. Then you send it to claude-opus-5-5. What can you say about usage.input_tokens?",
          options: [
            "It is the same number, because the text is the same.",
            "It can be different. Count again with claude-opus-5-5 if the number matters.",
            "It is always smaller on the larger model.",
            "It is always the count plus 1."
          ],
          correct: 1,
          explain: "Token counts are specific to the model's tokenizer. Different models can count the same text differently. Do not assume a fixed relation between them." },
        { id: "l1-2-L2-c", type: "recall",
          q: "Why is the UTF-8 byte count of a text a useful number for a byte-level BPE tokenizer?",
          answer: "The tokenizer starts with one token for each byte, and each merge reduces the count. So the byte count is the maximum number of tokens for the text (special tokens and message format not counted). The real count is lower when the tokenizer learned merges for that kind of text." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "BPE training, encoding and vocabulary size",
      blocks: [
        { type: "html", html: `
          <h3>Two different jobs: training and encoding</h3>
          <p><strong>Training</strong> runs once, before the model is trained. It reads a large text, counts every pair of neighboring symbols, joins the most frequent pair everywhere, records that merge, and does this again.
          It stops when the vocabulary has the planned size. The output is an ordered <strong>merge list</strong> and a vocabulary.</p>
          <p><strong>Encoding</strong> runs on every request. It does not count anything. It splits the new text into bytes and applies the learned merges in the order they were learned.
          The merge list never changes after training, because the model's weights were trained on those token IDs.</p>` },
        { type: "diagram", caption: "Training makes the merge list once. Encoding uses the same list, in the same order, for every new text.",
          svg: `<svg viewBox="0 0 680 250" role="img" aria-label="Diagram: BPE training makes an ordered merge list, and encoding applies it to new text">
            <defs><marker id="l12a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <text x="10" y="26" class="d-bold">Training: once, before the model is trained</text>
            <rect x="10" y="40" width="120" height="56" rx="8" class="d-box"/>
            <text x="70" y="64" text-anchor="middle" class="d-bold">Large text</text>
            <text x="70" y="82" text-anchor="middle" class="d-small">as bytes</text>
            <rect x="170" y="40" width="130" height="56" rx="8" class="d-box"/>
            <text x="235" y="64" text-anchor="middle" class="d-bold">Count pairs</text>
            <text x="235" y="82" text-anchor="middle" class="d-small">neighbors × frequency</text>
            <rect x="340" y="40" width="130" height="56" rx="8" class="d-box-accent"/>
            <text x="405" y="64" text-anchor="middle" class="d-bold">Join top pair</text>
            <text x="405" y="82" text-anchor="middle" class="d-small">everywhere</text>
            <rect x="530" y="40" width="140" height="56" rx="8" class="d-box-good"/>
            <text x="600" y="64" text-anchor="middle" class="d-bold">Merge list</text>
            <text x="600" y="82" text-anchor="middle" class="d-small">ordered, then fixed</text>
            <line x1="130" y1="68" x2="168" y2="68" class="d-line" marker-end="url(#l12a2)"/>
            <line x1="300" y1="68" x2="338" y2="68" class="d-line" marker-end="url(#l12a2)"/>
            <line x1="470" y1="68" x2="528" y2="68" class="d-line" marker-end="url(#l12a2)"/>
            <path d="M405,96 L405,118 L235,118 L235,98" class="d-line" marker-end="url(#l12a2)"/>
            <text x="320" y="136" text-anchor="middle" class="d-small">repeat until the vocabulary has the planned size</text>
            <path d="M600,96 L600,152 L395,152 L395,178" class="d-line-accent" marker-end="url(#l12a2)"/>
            <text x="10" y="172" class="d-bold">Encoding: every request</text>
            <rect x="10" y="180" width="120" height="56" rx="8" class="d-box"/>
            <text x="70" y="204" text-anchor="middle" class="d-bold">New text</text>
            <text x="70" y="222" text-anchor="middle" class="d-small">your prompt</text>
            <rect x="160" y="180" width="110" height="56" rx="8" class="d-box"/>
            <text x="215" y="204" text-anchor="middle" class="d-bold">Bytes</text>
            <text x="215" y="222" text-anchor="middle" class="d-small">UTF-8</text>
            <rect x="310" y="180" width="170" height="56" rx="8" class="d-box-accent"/>
            <text x="395" y="204" text-anchor="middle" class="d-bold">Apply merges</text>
            <text x="395" y="222" text-anchor="middle" class="d-small">in the learned order</text>
            <rect x="520" y="180" width="150" height="56" rx="8" class="d-box-good"/>
            <text x="595" y="204" text-anchor="middle" class="d-bold">Token IDs</text>
            <text x="595" y="222" text-anchor="middle" class="d-small">to the model</text>
            <line x1="130" y1="208" x2="158" y2="208" class="d-line" marker-end="url(#l12a2)"/>
            <line x1="270" y1="208" x2="308" y2="208" class="d-line" marker-end="url(#l12a2)"/>
            <line x1="480" y1="208" x2="518" y2="208" class="d-line" marker-end="url(#l12a2)"/>
          </svg>` },
        { type: "worked", title: "Worked example: BPE training by hand",
          intro: "Use the training text from the tool in level 1: \"low low low lower lowest newer newest\". The words are low (3 times), lower, lowest, newer and newest (1 time each). This toy works on characters, not bytes, so that you can read it. Ties go to the pair that appears first in the text.",
          steps: [
            { html: "Start: every character is a token. low = 3 tokens × 3 = 9, lower = 5, lowest = 6, newer = 5, newest = 6. Total = <strong>31</strong> tokens." },
            { html: "Count the pairs, and multiply by how often each word occurs: l+o = 5 (low ×3, lower, lowest), o+w = 5, w+e = 4 (lower, lowest, newer, newest), and e+r, e+s, s+t, n+e, e+w = 2 each." },
            { html: "Merge 1: l+o and o+w both have 5. l+o appears first, so join it. Each join removes one token: 31 − 5 = <strong>26</strong> tokens." },
            { html: "Count again. The counts change after each merge. Now lo+w = 5, so merge 2 is lo+w: 26 − 5 = <strong>21</strong> tokens. Note that w+e falls from 4 to 2, because the w in lower and lowest is now inside the token \"low\"." },
            { html: "Merge 3: all remaining pairs have 2. The first one in the text is low+e (in lower). 21 − 2 = <strong>19</strong> tokens. Now lower = lowe + r." },
            { faded: true, html: "Your turn. Use the three merges l+o, lo+w and low+e on the new word \"lowest\". Apply them in order. How many tokens does it need?",
              answer: "l o w e s t → (l+o) lo w e s t → (lo+w) low e s t → (low+e) lowe s t. 3 tokens: lowe, s, t." },
            { faded: true, html: "Your turn. After merge 3 the words are low ×3, lowe·r, lowe·s·t, n·e·w·e·r and n·e·w·e·s·t. Which pair is merge 4, and what is the new total?",
              answer: "The pairs with count 2 are s+t (lowest, newest), n+e, e+w and w+e (newer, newest). s+t appears first in the text (in lowest), so merge 4 is s+t. 19 − 2 = 17 tokens. Check it with the tool in level 1: click the merge button 4 times." }
          ] },
        { type: "note", kind: "simplification", title: "What real tokenizers add", html: `
          <ul>
            <li><strong>Bytes, not characters.</strong> The start vocabulary is the 256 byte values, so every input can be encoded.</li>
            <li><strong>Pre-splitting.</strong> Many tokenizers first split the text into chunks (words, numbers, punctuation, spaces) with a pattern, and merges never cross a chunk boundary. This is why a space is often part of the next word's token.</li>
            <li><strong>Special tokens.</strong> The vocabulary also has tokens that text cannot make, for example for the end of the text or for message roles.</li>
            <li><strong>Other algorithms.</strong> WordPiece (used by BERT) and Unigram (in the SentencePiece library) also build subword vocabularies, with different rules.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Vocabulary size is a trade-off</h3>
          <p>A larger vocabulary has more merges, so the same text needs fewer tokens: more text fits in the context window, and an answer needs fewer decode steps.
          But each token needs one row in the embedding table, and the output layer gives one score for each token (lesson 1.1).</p>
          <p>Toy arithmetic (made-up sizes): a vocabulary of 50,000 tokens and a model width of 4,096 numbers need 50,000 × 4,096 = <strong>204,800,000</strong> numbers in the embedding table.
          Double the vocabulary, and the table doubles to 409,600,000 numbers. The output layer grows in the same way, unless the model shares it with the embedding table.
          Rare tokens also get few training examples, so the model learns them badly.</p>
          <h3>Artifacts that come from tokenization</h3>
          <ul>
            <li><strong>Letter counting.</strong> "How many r letters are in strawberry?" is hard for a model, because it sees tokens, not letters.</li>
            <li><strong>Digits.</strong> A long number is split into pieces that do not align with place value, so digit arithmetic and digit reversal are less reliable.</li>
            <li><strong>Leading spaces and case.</strong> " Paris", "Paris" and "PARIS" can be different tokens with different learned behavior.</li>
            <li><strong>Glitch tokens.</strong> A string that was frequent in the tokenizer's training text but rare in the model's training text can become a token that the model almost never saw. Such tokens caused strange outputs in some older public models.</li>
          </ul>
          <p>For an engineer the lesson is the same: when a task needs exact characters or digits, do not depend on the model. Do the exact step in code, or give the model a tool (Topic 4).</p>` }
      ],
      checks: [
        { id: "l1-2-L3-a", type: "mcq",
          q: "During BPE encoding of a new text, what decides which merges the tokenizer applies first?",
          options: [
            "The pair that is most frequent in the new text.",
            "The order in which the merges were learned during training.",
            "The longest token in the vocabulary that fits.",
            "A random choice, which is why counts change between runs."
          ],
          correct: 1,
          explain: "Encoding does not count pairs in the new text. It applies the fixed merge list in the order of training. This is why the same text always gives the same tokens on the same tokenizer." },
        { id: "l1-2-L3-b", type: "recall",
          q: "Give one advantage and two costs of a larger vocabulary.",
          answer: "Advantage: the same text needs fewer tokens, so more fits in the context window and answers need fewer decode steps. Costs: the embedding table and the output layer grow with the vocabulary size (more parameters and more computation for the scores at each step), and rare tokens get few training examples, so the model learns them badly." }
      ]
    }
  ],

  debugging: [
    { id: "l1-2-dbg-1", title: "The budget check says yes, the bill says no",
      symptom: "A team limits each request to a token budget before it calls the model. The check estimates tokens from the length of the text. For English questions the estimate is close. For questions in Hindi, usage.input_tokens is much larger than the estimate, and the cost per request is above the plan.",
      evidence: "Log line (values from this fictional system): lang=hi chars=1180 estimate=295 budget_ok=true usage.input_tokens=1012",
      hints: [
        "How was the estimate made? Which number did it use, and which number does the bill use?",
        "How many UTF-8 bytes does one Devanagari code point use?"
      ],
      answer: "The estimate divides characters by a fixed number that came from English text. Devanagari code points use 3 bytes each and get fewer merges, so the real count is much larger. Fix: count with count_tokens and the same model id as the request, including the system prompt and tools; compare that count with the budget; and record the model id with every count. If the count call is too slow for every request, measure a per-language ratio on your own data for each model, add a safety margin, and check it again when the model changes." },
    { id: "l1-2-dbg-2", title: "A test breaks after a model change",
      symptom: "A unit test asserts that the prompt template has exactly 412 input tokens. The team changes ASSISTANT_MODEL to a different model. The test fails. Nobody changed the template.",
      evidence: "AssertionError: expected 412, got 431 (numbers from this fictional system)",
      hints: [
        "Is a token count a property of the text alone?",
        "What does a unit test of your own code need to prove?"
      ],
      answer: "A token count belongs to a text and a tokenizer together. A different model can have a different tokenizer, so the count changed. Also, a unit test that calls the real count endpoint needs the network and a key. Fix: in unit tests, use a fake client that returns a fixed count, and test your logic (budget check, cost, output). Keep real counts as measured data with the model id next to them, and measure again when the model changes." }
  ],

  recall: [
    { id: "l1-2-r1", q: "What are the three steps from text to token IDs?", a: "Change the text into UTF-8 bytes. Join bytes into tokens with the learned merge rules. Look up the ID of each token in the vocabulary." },
    { id: "l1-2-r2", q: "How many UTF-8 bytes do \"cat\", \"café\", \"नमस्ते\" and \"👍\" use?", a: "3, 5, 18 and 4. ASCII is 1 byte, é is 2, each Devanagari code point is 3, and most emoji are 4." },
    { id: "l1-2-r3", q: "What is the difference between BPE training and BPE encoding?", a: "Training counts pairs in a large text and learns an ordered merge list, once. Encoding applies that fixed list, in order, to each new text, and counts nothing." },
    { id: "l1-2-r4", q: "Why must you count tokens with the same model id as the real request?", a: "Each model family has its own tokenizer, so the same text can give a different count on a different model." },
    { id: "l1-2-r5", q: "Name four kinds of input that often use more tokens than plain English text of the same length.", a: "Scripts that were rare in the tokenizer's training text (often non-Latin scripts), source code with unusual names, numbers and IDs (hashes, UUIDs, base64), and emoji." },
    { id: "l1-2-r6", q: "Why can a byte-level BPE tokenizer encode any input?", a: "Its start vocabulary has all 256 byte values. Any text is a list of bytes, so in the worst case each byte is one token." },
    { id: "l1-2-r7", q: "Why does a model have difficulty counting the letters in a word?", a: "It reads tokens, not letters. A word can be one token, so the letters are not separate inputs." }
  ],

  interview: [
    { q: "What is a token, and why is it not the same as a word?",
      outline: "A token is a piece from a fixed vocabulary that a tokenizer learned from frequency, usually with BPE on bytes. Common words are one token, often with their leading space. Rare words, names, code, numbers and many non-Latin scripts become several tokens. The model reads token IDs. Cost, latency and context limits count tokens." },
    { q: "Explain how BPE builds a vocabulary.",
      outline: "Start from the 256 bytes. Count all neighboring pairs in a large training text. Join the most frequent pair everywhere and record the merge. Repeat until the vocabulary has the planned size. Encoding applies the merges in the learned order. Mention pre-splitting and special tokens, and that WordPiece and Unigram are alternatives." },
    { q: "Users in India say the product costs more for them. How would you investigate?",
      outline: "Measure tokens per message by language with the model's own count (count_tokens, same model id), for input and output. Explain with UTF-8 bytes and fewer merges for those scripts. Options: shorter system prompts, prompt caching for the shared part, shorter answers, a cheaper model for simple questions, and budgets per language. Re-measure when the model changes." },
    { q: "How does vocabulary size affect a model?",
      outline: "Larger: fewer tokens per text (more fits in context, fewer decode steps), but a larger embedding table and output layer, and rare tokens with few training examples. Smaller: longer sequences and more steps. It is a trade-off set before training and fixed afterwards." }
  ],

  misconceptions: [
    { wrong: "A token is about one word.", right: "A token is a learned piece of bytes. The ratio of tokens to words changes with the language, the content and the tokenizer." },
    { wrong: "One character is one byte.", right: "In UTF-8 a code point uses 1 to 4 bytes. é uses 2, Devanagari and Bengali use 3, most emoji use 4." },
    { wrong: "A tokenizer from another vendor gives a close enough count for Claude.", right: "Each model family has its own tokenizer. Use count_tokens with the same model id as the request." },
    { wrong: "The tokenizer splits words by syllables or meaning.", right: "BPE splits by frequency in its training text. Boundaries can fall anywhere." },
    { wrong: "During encoding, BPE joins the most frequent pair in your text.", right: "Encoding applies the fixed merge list from training, in its learned order." },
    { wrong: "A character limit in the UI controls the token count.", right: "Tokens per character change a lot between scripts, code and symbols. Count tokens when cost or limits matter." }
  ],

  resources: [
    { title: "Let's build the GPT Tokenizer", by: "Andrej Karpathy", kind: "Video, long", url: "https://www.youtube.com/watch?v=zduSFxRajkE",
      when: "Watch after level 2, before level 3. Lesson 1.1 listed it as optional. For this lesson it is the main resource.",
      why: "Builds a byte-level BPE tokenizer in Python from zero, with the same training loop as the worked example in level 3.",
      note: "Use the chapter list on YouTube to find the parts. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "Why does the start vocabulary have 256 entries?",
        "Why do numbers and non-English text often use more tokens?",
        "What is the difference between training the tokenizer and encoding a new text?"
      ] },
    { title: "minbpe", by: "Andrej Karpathy (GitHub)", kind: "Code", url: "https://github.com/karpathy/minbpe",
      when: "Optional, after level 3.", why: "Short, readable BPE code that goes with the video.",
      watchFor: ["Find the function that applies merges during encoding. In which order does it apply them?"] },
    { title: "Neural Machine Translation of Rare Words with Subword Units", by: "Sennrich, Haddow and Birch (arXiv)", kind: "Paper", url: "https://arxiv.org/abs/1508.07909",
      when: "Optional, after level 3.", why: "The paper that brought byte pair encoding to neural language processing.",
      watchFor: ["Which problem with rare words does the paper want to solve?"] },
    { title: "Token counting", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/token-counting",
      when: "Read before T-002.", why: "The endpoint that gives the real input token count for a Claude model.",
      watchFor: [
        "Which parts of a request does the count include (system prompt, tools, images, documents)?",
        "Is the count exact or an estimate? Does it have its own rate limits?"
      ] },
    { title: "Pricing", by: "Anthropic docs", kind: "Docs", url: "https://platform.claude.com/docs/en/about-claude/pricing",
      when: "Read during T-002.", why: "The prices for the cost column of the token meter.",
      watchFor: ["Is the price for each token the same for all languages? (It is. What changes is the number of tokens.)"] },
    { title: "Unicode HOWTO", by: "Python docs", kind: "Docs", url: "https://docs.python.org/3/howto/unicode.html",
      when: "Read during level 2 if bytes and code points are new to you.", why: "Explains code points, encodings and UTF-8 in Python.",
      watchFor: ["What is the difference between len(text) and len(text.encode(\"utf-8\"))?"] },
    { title: "SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing", by: "Kudo and Richardson (arXiv)", kind: "Paper", url: "https://arxiv.org/abs/1808.06226",
      when: "Optional, for interviews.", why: "An alternative approach that works on raw text without pre-splitting into words.",
      watchFor: ["Why does it treat the space as a normal symbol?"] }
  ],

  summary: `
    <ul>
      <li>A tokenizer changes text into UTF-8 bytes, joins them with learned merges, and gives each token an ID.</li>
      <li>BPE training learns an ordered merge list once. Encoding applies that list, in order, to every new text.</li>
      <li>The UTF-8 byte count is the maximum token count for a byte-level BPE tokenizer. Rare scripts, code, numbers, IDs and emoji use more tokens.</li>
      <li>Token counts are model-specific. Count with <code>count_tokens</code> and the same model id as the request. Measure again when the model changes.</li>
      <li>A larger vocabulary means fewer tokens per text but a larger embedding table and output layer.</li>
      <li>Letter counting and digit errors come from tokenization. Do exact character work in code.</li>
    </ul>`,

  teachBack: "Explain to a product manager why the same question costs more in Hindi or Bengali than in English. Start from bytes, then BPE merges, then the bill. Use the worked example with your own measured numbers from T-002. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-002"]
};

/* ====================================================================== T-002 */
window.ACADEMY.tickets["T-002"] = {
  id: "T-002",
  title: "Token meter: count before you send",
  lesson: "1.2",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 to 5)",
  estimate: "Your pace. Most people need 1 focused session.",
  fields: {
    objective: `
      <p>Add a token meter to the T-001 project. A new command, <code>python -m assistant.count</code>, measures a text for one or more models:
      characters, UTF-8 bytes, input tokens, tokens for each 100 characters and the estimated input cost.
      The T-001 command, <code>python -m assistant.cli</code>, gets an optional input token limit. It checks the limit before it sends the paid request.</p>
      <p><strong>Real-world problem.</strong> Teams often forecast cost with a "characters per token" rule. The forecast is wrong for other languages, code and IDs, and the team learns this from the bill.
      This ticket replaces the guess with a measurement, and stops oversized requests before they cost money.</p>`,
    context: `
      <p>This is the second ticket of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". It builds on T-001.
      T-001 decided that one module (<code>assistant/llm.py</code>) owns all calls to the model, that every call is measured, and that secrets come only from the environment. T-002 keeps all three decisions.</p>
      <p>Later tickets use the token meter: the FastAPI service (Phase 2) needs a request size limit, and cost control (later phases) needs real token counts for each model.</p>`,
    prerequisites: `
      <ul>
        <li>T-001 complete: <code>llm.py</code>, <code>pricing.py</code>, <code>cli.py</code> and their tests pass.</li>
        <li>Lesson 1.2, levels 1 and 2 complete (level 3 helps for question 3).</li>
        <li>The environment variable <code>ANTHROPIC_API_KEY</code> is set. <code>ASSISTANT_MODEL</code> is optional, as in T-001.</li>
        <li>Read the docs page "Token counting" (link in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.count --file samples/en.txt</code> prints one row for each model: model, characters, UTF-8 bytes, input tokens, tokens for each 100 characters, estimated input cost in USD.</li>
        <li>The text comes from <code>--file</code> or from a positional argument. <code>--models</code> takes a comma-separated list of model ids. The default is the value of <code>ASSISTANT_MODEL</code>, else <code>claude-opus-5-5</code>.</li>
        <li>The count command only counts. It never sends a request that generates text.</li>
        <li><code>assistant.cli</code> gets the option <code>--max-input-tokens</code>. The default comes from the environment variable <code>ASSISTANT_MAX_INPUT_TOKENS</code>. When neither is set, there is no limit.</li>
        <li>When a limit is set and the counted input is above it, <code>assistant.cli</code> prints the count and the limit in one clear line, does not send the request, and exits with a code that is not 0.</li>
        <li>A <code>samples/</code> folder holds at least five short texts that you write: English, the same text in a non-Latin script that you know (for example Hindi or Bengali), source code, a list of numbers or IDs, and text with emoji. No customer data and no secrets.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Token counts come only from <code>client.messages.count_tokens</code>, through one function in <code>llm.py</code> (for example <code>count_input_tokens(client, model, messages, system=None)</code>). If T-001 already has this function, reuse it. Do not write a second one.</li>
        <li><code>count.py</code> and <code>cli.py</code> do not import <code>anthropic</code>. Do not use another vendor's tokenizer.</li>
        <li><code>assistant/tokens.py</code> holds pure functions with no network: <code>text_stats(text)</code> returns characters (code points) and UTF-8 bytes, and <code>tokens_per_100_chars(tokens, chars)</code> returns a float.</li>
        <li>Count with the same model id as the request. For each model, send one count request. Send the requests one after another.</li>
        <li>Count errors use the T-001 error mapping: the same messages and the same exit codes.</li>
        <li>When a limit is set and the count fails, <code>assistant.cli</code> stops with the error. It never sends a request that it could not check.</li>
        <li>The cost column uses <code>pricing.py</code> and its header says "input only".</li>
        <li>Tests run without network access and without an API key.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given <code>samples/en.txt</code> and two models, when you run the count command, then it prints two rows with input tokens above 0, and the characters and bytes match <code>len(text)</code> and <code>len(text.encode("utf-8"))</code>.</li>
        <li>Given the text <code>नमस्ते</code>, when <code>text_stats</code> runs, then it returns 6 characters and 18 bytes. Given <code>café</code>, it returns 4 and 5. Given <code>👍</code>, it returns 1 and 4.</li>
        <li>Given a limit lower than the counted input, when you run <code>assistant.cli</code>, then it prints the count and the limit, exits with a code that is not 0, and the fake client in the test records zero stream calls.</li>
        <li>Given a limit equal to the counted input, when you run <code>assistant.cli</code>, then the request is sent.</li>
        <li>Given an empty text, when you run the count command, then it prints a clear error and does not divide by zero.</li>
        <li>The handoff contains your prediction table (written before the first run) and your measured table for all samples on two models.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file in the repository and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Bytes and characters (guided).</strong> Write <code>text_stats</code> in <code>tokens.py</code>. Test it with the values from the lesson table (cat, café, नमस्ते, 👍). Explain to Claude Code why <code>len</code> and the byte count are different.</li>
        <li><strong>One real count (guided).</strong> Add or reuse <code>count_input_tokens</code> in <code>llm.py</code>. Count <code>samples/en.txt</code> on <code>claude-haiku-5-5</code>. Then count the same text with a short system prompt. Write down how much the system prompt added.</li>
        <li><strong>Predict, then measure (independent).</strong> Write the five samples. Before you run anything, write a table in the handoff: which sample has the most tokens for each 100 characters, and do you expect the two models to agree? Then build <code>count.py</code> and run it with <code>--models claude-opus-5-5,claude-haiku-5-5</code>. Compare.</li>
        <li><strong>The limit in the CLI (independent).</strong> Add <code>--max-input-tokens</code> and <code>ASSISTANT_MAX_INPUT_TOKENS</code>. The CLI already counts before the call (T-001). Compare that count with the limit before the stream starts. Add the count time in milliseconds to the T-001 measurement line.</li>
        <li><strong>Tests and handoff (independent).</strong> Write the tests in the test list with a fake client. The ticket file is already in <code>tickets/</code>. Fill in <code>handoffs/T-002-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional: add a <code>--json</code> option to the count command, so that a later cost-control ticket can read the measurements.</p>`,
    files: `
      <p>Changes to the T-001 repository in <code>ai-academy/project/</code>.</p>
      <pre><code>project/
  assistant/
    llm.py              # + count_input_tokens(...) (or reuse the T-001 one)
    tokens.py           # new: text_stats, tokens_per_100_chars (pure, no network)
    count.py            # new: python -m assistant.count
    cli.py              # + --max-input-tokens, checked before the stream
  samples/
    en.txt              # your English text
    hi.txt              # the same text in a non-Latin script (any name)
    code.txt            # a short piece of source code
    numbers.txt         # numbers or IDs
    emoji.txt           # text with emoji
  tests/
    test_tokens.py
    test_count.py
    test_limit.py
  tickets/
    T-002.md            # this ticket (generated)
  handoffs/
    T-002-handoff.md    # your handoff (template generated)</code></pre>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_text_stats_counts_code_points_and_bytes</code></td><td>cat, café, नमस्ते, 👍</td><td>(3, 3), (4, 5), (6, 18), (1, 4)</td></tr>
        <tr><td><code>test_tokens_per_100_chars</code></td><td>30 tokens, 120 characters</td><td>25.0</td></tr>
        <tr><td><code>test_empty_text_is_an_error</code></td><td>Empty string</td><td>A clear error, no division by zero</td></tr>
        <tr><td><code>test_count_uses_each_model_id_once</code></td><td>Fake client, two model ids</td><td>Two count calls, each with its own model id; no generation call</td></tr>
        <tr><td><code>test_count_cost_uses_input_price</code></td><td>Fake count of 1,000,000 tokens on Opus 5.5 prices</td><td>4.0 (compare floats with a tolerance)</td></tr>
        <tr><td><code>test_limit_blocks_before_paid_call</code></td><td>Fake count 5,000, limit 4,000</td><td>Exit code not 0; zero stream calls; message shows 5000 and 4000</td></tr>
        <tr><td><code>test_limit_allows_equal_count</code></td><td>Fake count 4,000, limit 4,000</td><td>One stream call</td></tr>
        <tr><td><code>test_limit_count_error_stops_request</code></td><td>Limit set; fake count raises a rate-limit error</td><td>T-001 error message; zero stream calls</td></tr>
        <tr><td><code>test_no_limit_keeps_t001_behavior</code></td><td>No option and no environment variable</td><td>The request is sent; behavior equals T-001</td></tr>
      </table></div>
      <p class="muted">Design hint: keep the decision "is this request allowed?" in a small pure function that takes the count and the limit. Then most tests need no fake client at all.</p>`,
    nfr: `
      <ul>
        <li><strong>Security:</strong> the key comes only from the environment, as in T-001. The samples contain no customer data and no secrets. Do not log the full prompt text; log its counts.</li>
        <li><strong>Reliability:</strong> the limit check never lets an unchecked request through. A count error stops the request with a clear message.</li>
        <li><strong>Performance:</strong> the count is one more network round trip before each request. Measure it with <code>time.perf_counter</code> and show it, so that you can decide if it is worth it.</li>
        <li><strong>Cost:</strong> the count command never generates text. Use <code>claude-haiku-5-5</code> for repeated manual tests of <code>assistant.cli</code>. Unit tests make no network calls.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Which sample had the most tokens for each 100 characters? Explain it with UTF-8 bytes and BPE merges. Did your prediction match?</li>
        <li>Did the two models give the same count for the same text? What does your answer mean for <code>pricing.py</code>, for the limit, and for tests?</li>
        <li>Why does a one-word message give a count larger than 1? How much did a short system prompt add?</li>
        <li>The limit check adds one round trip. When is that worth it? When is a measured ratio for each language plus a safety margin enough?</li>
        <li>An answer in your non-Latin sample language also needs more output tokens. Which T-001 measurements does that change, and why?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (terminal output, test output).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>No secret in the repository: <code>git grep</code> for the key prefix returns nothing.</li>
        <li>The prediction table and the measured table are both in the handoff.</li>
        <li>You can explain, without notes, why the byte count is the maximum token count for a byte-level BPE tokenizer.</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> counts made only with the model's own endpoint and the same model id;
      one count function, reused; a limit check that cannot be bypassed by an error; pure functions for statistics and decisions; no secrets;
      and how well your answers connect bytes, merges and cost.</p>`
  }
};
