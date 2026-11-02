/*
 * Lesson 2.6 - Prompt caching.
 * Ticket T-015 - Prompt caching for the triage and the chat.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Base prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
 * Cache prices (Claude API docs "Pricing" and "Prompt caching", checked on 2026-11-02):
 *   5-minute write = 1.25 x input, 1-hour write = 2 x input.
 *   Read = 0.05 x input on Opus 5.5 and Sonnet 5.5, 0.1 x input on Haiku 5.5.
 *   Opus 5.5: write $5 (5m), $8 (1h), read $0.20. Sonnet 5.5: $2.50, $4, $0.10. Haiku 5.5: $0.125, $0.20, $0.01.
 *   Minimum cacheable prefix: 512 tokens on Opus 5.5, Sonnet 5.5 and Haiku 5.5. At most 4 breakpoints.
 * Simulator default (15-ix.js, Opus 5.5, toy counts: prefix 4,400, after the breakpoint 1,100, output 150):
 *   Call 1: 1,100 x 4 + 4,400 x 5 + 150 x 20 = $0.0294. Call 2: 1,100 x 4 + 4,400 x 0.20 + 150 x 20 = $0.00828.
 *   No cache: 5,500 x 4 + 150 x 20 = $0.025. 20 calls: $0.18672 with the cache, $0.50 without (63% less).
 *   1-hour write: $0.0426. Extra cost of a write: $0.0044 (5m), $0.0176 (1h). Saving of one read: $0.01672.
 * Worked example (Haiku 5.5, made-up counts: prefix 900, message 100, output 150):
 *   No cache $0.000175 per call, 20 calls $0.0035. Call 1 $0.0001975, later calls $0.000094.
 *   20 calls with the cache: $0.0019835 (43% less). Input part only: $0.002 -> $0.0004835 (76% less).
 * T-015 milestone 4 estimate: 40 to 120 calls x (1,000 input x $0.10 + 150 output x $0.50) / 1M = $0.007 to $0.021,
 *   without the cache. The cache makes the real cost lower.
 * The interactive for this lesson is in 15-ix.js (id "l2-6-cache").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["2.6"] = {
  id: "2.6",
  topic: "t2",
  title: "Prompt caching",
  objective: "Put a cache breakpoint after the part of the request that stays the same, keep that prefix byte-identical on every call, read the three usage fields, compute the cost of a cache write and a cache read, and explain with measurements when the cache saves money and time and when it costs more.",
  prerequisites: [
    "Lesson 2.5: the tool definition and the system prompt of the triage tool mode.",
    "Lesson 1.7: the KV cache inside one request, and why each chat request sends the full history.",
    "Lessons 1.1, 2.1 and 2.2 help: time to first token (TTFT), the messages list and the fixed system prompt."
  ],
  covers: ["t2-caching"],
  whyItMatters: `
    <p>Each triage call of lesson 2.5 sends the same tool definition, the same rules and the same three examples. Only the employee message at the end changes. The API is stateless (lesson 2.1), so the model reads all of these tokens again on every call, and you pay the full input price for them every time.</p>
    <p><strong>Prompt caching</strong> lets the API keep the work for the part that does not change. A later call that starts with exactly the same tokens reads that part from the cache. A cache read costs a small part of the normal input price, and the model starts to answer sooner.
    But the cache has rules. One changed character in the prefix, a breakpoint in the wrong place, or a long pause between calls makes every call a cache miss, and then each call costs <em>more</em> than with no cache.
    In an interview, "how do you cut the cost of an LLM feature?" is a common question. Prompt caching is often the first answer, and a good answer also says how you check that it works.</p>`,
  concepts: [
    { id: "l2-6-c-prefix", name: "The cached prefix: tools, then system, then messages, up to the cache breakpoint" },
    { id: "l2-6-c-exact", name: "An exact match: one changed byte before the breakpoint gives a cache miss" },
    { id: "l2-6-c-usage", name: "The usage fields: cache_creation_input_tokens, cache_read_input_tokens and input_tokens" },
    { id: "l2-6-c-price", name: "Cache prices: a write costs 1.25 or 2 times the input price, a read 0.05 or 0.1 times" },
    { id: "l2-6-c-rules", name: "The rules: at least 512 tokens, at most 4 breakpoints, a lifetime of 5 minutes or 1 hour" },
    { id: "l2-6-c-auto", name: "Automatic caching for a chat: the breakpoint moves forward with the history" },
    { id: "l2-6-c-kv", name: "What the cache keeps: the keys and values of the prefix, so the time to first token can go down" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Prepare the fixed part one time, use it again on each call",
      blocks: [
        { type: "html", html: `
          <p>Before the model writes the first output token, it reads all input tokens. Lesson 1.1 called this step the <strong>prefill</strong>. It is most of the time to first token (TTFT) for a long prompt.</p>
          <p>A triage request has two parts. The first part is the same on every call: the tool, the rules and the examples. The second part changes: the new message. With prompt caching, you mark the end of the first part with a <strong>cache breakpoint</strong>. The API keeps the result of the prefill for everything before the breakpoint: the <strong>cached prefix</strong>.</p>
          <ul>
            <li><strong>Call 1</strong> finds no entry. The API computes the prefix and stores it. This is a <strong>cache write</strong>, and it costs a bit more than normal input.</li>
            <li><strong>Call 2</strong> starts with exactly the same prefix. The API reads it from the cache. This is a <strong>cache read</strong>, and it costs a small part of the normal input price.</li>
            <li>The tokens after the breakpoint are normal input on both calls.</li>
          </ul>` },
        { type: "note", kind: "analogy", title: "Analogy: a sauce base in a restaurant kitchen", html: `
          <p>A kitchen makes the same sauce base for many dishes. The cook makes it one time in the morning and uses it for each order. Each order only adds its own last steps.</p>
          <ul>
            <li><strong>The sauce base is the cached prefix.</strong> The first batch takes more work (the cache write). Each later order uses the batch that is ready (the cache read).</li>
            <li><strong>The recipe must be exactly the same.</strong> If the cook changes one ingredient, the old batch is not correct for the new recipe. The cook must make a new batch.</li>
            <li><strong>The batch goes bad.</strong> If nobody uses it for some time, the cook must throw it away. Each use keeps it fresh for a longer time.</li>
          </ul>` },
        { type: "diagram", caption: "Two calls of the triage request with a breakpoint after the examples. Call 1 writes the prefix to the cache. Call 2 has a different message, but the same prefix, so it reads the prefix from the cache.",
          svg: `<svg viewBox="0 0 640 236" role="img" aria-label="Two rows of four blocks: tools, system prompt, examples and the new message. A dashed line after the examples marks the cache breakpoint. In call 1, the first three blocks are a cache write and the new message is normal input. In call 2, the first three blocks are a cache read and the new message is normal input with a different text.">
            <text x="14" y="22" class="d-bold">Call 1: the cache is empty</text>
            <rect x="14" y="32" width="130" height="48" rx="8" class="d-box-warn"/><text x="79" y="53" text-anchor="middle" class="d-bold">Tools</text><text x="79" y="70" text-anchor="middle" class="d-small">cache write</text>
            <rect x="154" y="32" width="160" height="48" rx="8" class="d-box-warn"/><text x="234" y="53" text-anchor="middle" class="d-bold">System prompt</text><text x="234" y="70" text-anchor="middle" class="d-small">cache write</text>
            <rect x="324" y="32" width="150" height="48" rx="8" class="d-box-warn"/><text x="399" y="53" text-anchor="middle" class="d-bold">Examples</text><text x="399" y="70" text-anchor="middle" class="d-small">cache write</text>
            <rect x="508" y="32" width="118" height="48" rx="8" class="d-box"/><text x="567" y="53" text-anchor="middle" class="d-bold">Message A</text><text x="567" y="70" text-anchor="middle" class="d-small">input</text>
            <text x="14" y="116" class="d-bold">Call 2: a different message, the same prefix</text>
            <rect x="14" y="126" width="130" height="48" rx="8" class="d-box-good"/><text x="79" y="147" text-anchor="middle" class="d-bold">Tools</text><text x="79" y="164" text-anchor="middle" class="d-small">cache read</text>
            <rect x="154" y="126" width="160" height="48" rx="8" class="d-box-good"/><text x="234" y="147" text-anchor="middle" class="d-bold">System prompt</text><text x="234" y="164" text-anchor="middle" class="d-small">cache read</text>
            <rect x="324" y="126" width="150" height="48" rx="8" class="d-box-good"/><text x="399" y="147" text-anchor="middle" class="d-bold">Examples</text><text x="399" y="164" text-anchor="middle" class="d-small">cache read</text>
            <rect x="508" y="126" width="118" height="48" rx="8" class="d-box"/><text x="567" y="147" text-anchor="middle" class="d-bold">Message B</text><text x="567" y="164" text-anchor="middle" class="d-small">input</text>
            <line x1="491" y1="26" x2="491" y2="184" class="d-line-accent" stroke-dasharray="5 4"/>
            <text x="491" y="202" text-anchor="middle" class="d-small">cache breakpoint</text>
            <text x="320" y="226" text-anchor="middle" class="d-small">The prefix is everything before the breakpoint, in the order tools, system, messages.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The cache keeps computed numbers, not text.</strong> It keeps the keys and values of the prefix tokens (lesson 1.7). Level 3 explains why this needs an exact match from the first token.</li>
            <li><strong>The answer does not change.</strong> The docs say that the response is the same as without the cache. Only the cost and the time change.</li>
            <li><strong>A miss is not an error.</strong> The API gives no warning. You see a miss only in the usage fields of the response.</li>
          </ul>` },
        { type: "interactive", id: "l2-6-cache" },
        { type: "html", html: `
          <h3>The three usage fields</h3>
          <p>The response tells you what the cache did. The input tokens of one request are split into three fields:</p>
          <div class="table-wrap"><table>
            <tr><th>Field</th><th>What it counts</th><th>Price</th></tr>
            <tr><td><code>cache_creation_input_tokens</code></td><td>Prefix tokens that this request wrote to the cache</td><td>More than normal input</td></tr>
            <tr><td><code>cache_read_input_tokens</code></td><td>Prefix tokens that this request read from the cache</td><td>Much less than normal input</td></tr>
            <tr><td><code>input_tokens</code></td><td>Only the tokens after the last breakpoint</td><td>Normal input</td></tr>
          </table></div>
          <p>The total input of the request is the sum of the three fields. Code from lesson 1.1 that reads only <code>input_tokens</code> now counts too few tokens and computes a wrong cost.</p>` }
      ],
      checks: [
        { id: "l2-6-L1-a", type: "mcq",
          q: "Call 1 and call 2 have the same tools and examples, but call 2 has a new message. The breakpoint is after the examples. What does call 2 do?",
          options: [
            "It writes the whole request to the cache again, because the message is new.",
            "It reads the tools and the examples from the cache, and the new message is normal input.",
            "It reads the whole request from the cache, so it costs almost nothing.",
            "It returns the answer of call 1 from the cache."
          ],
          correct: 1,
          explain: "Only the prefix before the breakpoint can come from the cache. The new message is after the breakpoint, so it is normal input. The answer is always new: the cache does not keep answers." },
        { id: "l2-6-L1-b", type: "mcq",
          q: "You add the current time to the start of the system prompt. What happens to the cache?",
          options: [
            "Nothing. The cache ignores small changes.",
            "Every call misses the cache and pays the write price, so each call costs more than with no cache.",
            "The API returns an error that the prefix changed.",
            "Only the tools are read from the cache, because the time is in the system prompt."
          ],
          correct: 1,
          explain: "The time changes on every call, so the prefix is never the same. Every call writes a new entry and pays the higher write price. The API gives no error. In the simulator, select \"Timestamp in the system prompt\" to see it. (A separate breakpoint after the tools could still read the tools. The lesson request has only one breakpoint.)" },
        { id: "l2-6-L1-c", type: "recall",
          q: "Name the three usage fields that show what the cache did, and say which tokens each one counts.",
          answer: "cache_creation_input_tokens: prefix tokens written to the cache. cache_read_input_tokens: prefix tokens read from the cache. input_tokens: only the tokens after the last breakpoint. The total input is the sum of the three." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Put the breakpoint, keep the prefix stable, read the usage",
      blocks: [
        { type: "html", html: `
          <h3>Put the breakpoint after the fixed part</h3>
          <p>A breakpoint is a <code>cache_control</code> field on a content block. The prefix is everything up to and including that block, in this order: <code>tools</code>, then <code>system</code>, then <code>messages</code>. In the triage tool mode of lesson 2.5, the rules and the three examples are in the system prompt. So one breakpoint on the system block caches the tool, the rules and the examples together.</p>
          <p>To put <code>cache_control</code> on the system prompt, send <code>system</code> as a list of text blocks, not as a string.</p>` },
        { type: "code", lang: "python", code: `# assistant/caching.py - pure functions, no API calls
def cached_system(text: str) -> list[dict]:
    """The system prompt as one text block with a cache breakpoint at its end."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]

# assistant/triage.py - the request of the tool mode (lesson 2.5), now with one breakpoint
def tool_request(message: str, cache: bool = False) -> dict:
    system = tool_system_prompt()  # the T-014 prompt: RULES, the tool line and the 3 examples
    return {
        "tools": [build_triage_tool()],                         # 1. the prefix starts with the tools
        "tool_choice": {"type": "auto"},
        "system": cached_system(system) if cache else system,  # 2. the breakpoint is at the end of the system prompt
        "messages": [{"role": "user", "content": f"<message>{message}</message>"}],  # 3. after the breakpoint
    }

# After the call (in llm.py, the only module that calls the API):
u = response.usage
write = u.cache_creation_input_tokens or 0
read = u.cache_read_input_tokens or 0
total_input = u.input_tokens + write + read  # input_tokens counts only the tokens after the breakpoint` },
        { type: "note", kind: "fact", title: "Cache prices and rules", html: `
          <div class="table-wrap"><table>
            <tr><th>Model</th><th>Input</th><th>5-minute write</th><th>1-hour write</th><th>Cache read</th><th>Output</th></tr>
            <tr><td>Claude Opus 5.5</td><td>$4</td><td>$5</td><td>$8</td><td>$0.20</td><td>$20</td></tr>
            <tr><td>Claude Sonnet 5.5</td><td>$2</td><td>$2.50</td><td>$4</td><td>$0.10</td><td>$10</td></tr>
            <tr><td>Claude Haiku 5.5 (prompt up to 100,000 tokens)</td><td>$0.10</td><td>$0.125</td><td>$0.20</td><td>$0.01</td><td>$0.50</td></tr>
          </table></div>
          <p>Prices are in USD per million tokens. A 5-minute write costs 1.25 times the input price, and a 1-hour write 2 times. A read costs 0.05 times the input price on Opus 5.5 and Sonnet 5.5, and 0.1 times on Haiku 5.5. For the long-prompt price of Haiku 5.5, the prompt length includes the cache reads and writes.</p>
          <ul>
            <li>The minimum prefix is 512 tokens on these three models. A shorter prefix is not cached, and the API gives no error.</li>
            <li>A request can have at most 4 breakpoints.</li>
            <li>The default lifetime is 5 minutes. Each read starts the lifetime again, at no cost. <code>"cache_control": {"type": "ephemeral", "ttl": "1h"}</code> gives 1 hour.</li>
            <li>Caching has no effect on the output tokens or on the response.</li>
          </ul>
          <p class="muted">Source: Claude API docs, "Pricing" and "Prompt caching". Checked on 2026-11-02. The prices change; check the pages again before you use them.</p>` },
        { type: "html", html: `
          <h3>Keep the prefix byte-identical</h3>
          <p>The docs say that a cache hit needs prompt segments that are 100 percent identical. Most cache problems come from code that changes the prefix without a visible change in the prompt. Look for these causes:</p>
          <ul>
            <li><strong>A time or a date</strong>, for example <code>datetime.now()</code>, in the system prompt. Lesson 2.2 already said: the system prompt contains no date.</li>
            <li><strong>An id</strong>, for example a request id or a <code>uuid</code>, before the breakpoint.</li>
            <li><strong>User data</strong>, for example the name of the employee, in the system prompt. Put it after the breakpoint.</li>
            <li><strong>An order that changes</strong>, for example a list built from a Python <code>set</code>. The order of a set of strings can change from one process to the next.</li>
            <li><strong>A tool definition that changes</strong>, for example a description with a version number, or tools in a different order.</li>
          </ul>
          <p>Do not trust a review of the prompt text. Write a test that builds the request for two different messages and compares the bytes of the prefix.</p>` },
        { type: "code", lang: "python", code: `# tests/test_cache_prefix.py - no network, no API key
import json
from assistant.triage import tool_request

def prefix_bytes(request: dict) -> bytes:
    return json.dumps([request["tools"], request["system"]]).encode()

def test_prefix_is_byte_identical_for_two_messages():
    a = tool_request("The VPN does not connect from home.", cache=True)
    b = tool_request("My expense claim for March is not paid.", cache=True)
    assert prefix_bytes(a) == prefix_bytes(b)
    assert a["messages"] != b["messages"]  # only the part after the breakpoint changes` },
        { type: "worked", title: "Worked example: the cache on the triage sample set",
          intro: "A triage request in the tool mode on Haiku 5.5 ($0.10 input, $0.50 output per million) has 1,000 input tokens: a prefix of 900 tokens (tool, rules, examples) and a message of 100 tokens. Each answer has 150 output tokens. The sample set has 20 messages, and the calls come less than 5 minutes apart. These token counts are made up. Measure your own.",
          steps: [
            { html: "No cache: 1,000 × $0.10 / 1,000,000 + 150 × $0.50 / 1,000,000 = $0.0001 + $0.000075 = <strong>$0.000175</strong> per call, and <strong>$0.0035</strong> for 20 calls." },
            { html: "Call 1 writes the prefix: 100 × $0.10 + 900 × $0.125 + 150 × $0.50 = 10 + 112.5 + 75 = 197.5 per million, so <strong>$0.0001975</strong>. This is more than with no cache." },
            { html: "Calls 2 to 20 read the prefix: 100 × $0.10 + 900 × $0.01 + 150 × $0.50 = 10 + 9 + 75 = 94 per million, so <strong>$0.000094</strong>. All 20 calls: $0.0001975 + 19 × $0.000094 = <strong>$0.0019835</strong>, which is 43% less than $0.0035." },
            { faded: true, html: "The input cost alone goes down by much more than 43%. Compute the input cost of the 20 calls without and with the cache. Why is the total saving smaller?",
              answer: "Without the cache: 20 × 1,000 × $0.10 / 1M = $0.002. With the cache: (100 × 0.10 + 900 × 0.125) / 1M + 19 × (100 × 0.10 + 900 × 0.01) / 1M = $0.0001225 + $0.000361 = $0.0004835, which is 76% less. The output tokens cost the same with and without the cache ($0.0015 for 20 calls), so the total saving is smaller." }
          ] },
        { type: "note", kind: "warn", title: "Changes that invalidate the cache", html: `
          <p>The prefix has three parts. A change in one part invalidates that part and every part after it.</p>
          <div class="table-wrap"><table>
            <tr><th>What changes</th><th>Tools cache</th><th>System cache</th><th>Messages cache</th></tr>
            <tr><td>Tool definitions (name, description, schema)</td><td>Invalid</td><td>Invalid</td><td>Invalid</td></tr>
            <tr><td>Web search, citations or speed setting</td><td>Valid</td><td>Invalid</td><td>Invalid</td></tr>
            <tr><td><code>tool_choice</code></td><td>Valid</td><td>Valid</td><td>Invalid</td></tr>
            <tr><td>Images</td><td>Valid</td><td>Valid</td><td>Invalid</td></tr>
            <tr><td>Thinking or effort settings</td><td>Depends on the model</td><td>Depends on the model</td><td>Invalid</td></tr>
          </table></div>
          <p>So the schema of the triage tool (lesson 2.5) must stay the same on every call. A new field in <code>TriageResult</code> invalidates the whole cache one time, and then the new prefix is cached. That is correct. A field that changes on each call breaks every call.</p>
          <p class="muted">Source: Claude API docs, "Prompt caching" (what invalidates the cache). Checked on 2026-11-02.</p>` }
      ],
      checks: [
        { id: "l2-6-L2-a", type: "mcq",
          q: "Your triage logs show cache_creation_input_tokens = 0 and cache_read_input_tokens = 0 on every call. The request has a breakpoint on the system prompt. What is the most likely cause?",
          options: [
            "The prefix is shorter than the minimum of 512 tokens, so the API does not cache it.",
            "The API key does not have the cache permission.",
            "The calls are too fast.",
            "The model is Haiku 5.5, which does not support caching."
          ],
          correct: 0,
          explain: "A prefix below the minimum is not cached, and the API gives no error. Both cache fields are 0. If the prefix changes on every call, cache_creation_input_tokens is above 0 on every call, and cache_read_input_tokens stays 0." },
        { id: "l2-6-L2-b", type: "mcq",
          q: "Your cost code reads only usage.input_tokens and usage.output_tokens. You turn on caching. What happens to the computed cost?",
          options: [
            "It stays correct, because input_tokens includes the cached tokens.",
            "It is too low, because input_tokens counts only the tokens after the last breakpoint. The cache write and read tokens are not counted.",
            "It is too high, because the cached tokens are counted two times.",
            "The API returns the cost in the usage object, so the code is not used."
          ],
          correct: 1,
          explain: "With caching, the input is split into three fields. Compute input_tokens × input price + cache_creation_input_tokens × write price + cache_read_input_tokens × read price + output." },
        { id: "l2-6-L2-c", type: "recall",
          q: "Name four code patterns that change the prefix without a visible change in the prompt text.",
          answer: "A time or date (datetime.now()) in the system prompt. An id such as a uuid before the breakpoint. User data in the system prompt. A list built from a set, whose order can change between processes. Also: a tool definition that changes, or tools in a different order." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why only a prefix, chat history, and when the cache pays",
      blocks: [
        { type: "html", html: `
          <h3>Why the cache works only for a prefix</h3>
          <p>Lesson 1.7 showed the KV cache inside one request: for each token, each attention layer keeps a key and a value, so the model does not compute them again for the next token. Prompt caching keeps these keys and values <strong>between requests</strong>. The docs call the stored data "KV cache representations".</p>
          <p>Lesson 1.7 also showed the causal mask: the key and the value of a token in a layer depend on that token and on <strong>all tokens before it</strong>. So a change at position <em>i</em> changes the keys and values of every later token. The stored keys and values are correct only for a request that has exactly the same tokens from position 1. That is why the cache keeps a prefix, why the order is tools, system, messages, and why one changed byte near the start breaks the cache for everything after it.</p>
          <p>It also explains the speed. On a cache read, the prefill computes only the tokens after the breakpoint. The docs say that you generally see a better time to first token for long documents. For a short prefix, the gain can be small. Measure it.</p>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>The docs do not say how the API stores or finds the entries, or on which machines. The picture of "stored keys and values for an exact prefix" is enough to predict a hit or a miss. The docs give one more rule: for each breakpoint, the API checks at most 20 earlier block positions for an entry, the breakpoint included.</p>` },
        { type: "html", html: `
          <h3>Caching a chat history</h3>
          <p>In the chat of lesson 2.1, each request sends the full history. The history of turn 3 starts with the history of turn 2. So the earlier turns are a prefix that grows. A fixed breakpoint cannot follow it.</p>
          <p><strong>Automatic caching</strong> solves this. Add one <code>cache_control</code> field at the top level of the request. The API puts the breakpoint on the last cacheable block and moves it forward when the conversation grows. Each request reads the earlier turns and writes only the newest turns.</p>` },
        { type: "code", lang: "python", code: `# assistant/chat.py (lesson 2.1) - one turn with two breakpoints
response = client.messages.create(
    model=model,
    max_tokens=max_tokens,
    system=cached_system(SYSTEM_PROMPT),   # breakpoint 1: the fixed system prompt
    messages=history + [{"role": "user", "content": text}],
    cache_control={"type": "ephemeral"},   # breakpoint 2: automatic, on the last block, moves each turn
)` },
        { type: "note", kind: "fact", title: "Rules for automatic caching and shared use", html: `
          <ul>
            <li>Automatic caching can be used together with explicit breakpoints. The automatic breakpoint uses one of the 4 breakpoint slots.</li>
            <li>An entry becomes available only after the first response starts. If you send 20 requests in parallel, all 20 can miss. Send one request first, then the others.</li>
            <li>Different organizations never share caches. On the Claude API, caches are also isolated for each workspace.</li>
          </ul>
          <p class="muted">Source: Claude API docs, "Prompt caching" (automatic caching, concurrent requests, cache isolation). Checked on 2026-11-02.</p>` },
        { type: "note", kind: "limit", title: "The history budget breaks the history cache", html: `
          <p>The chat of lesson 2.1 removes the oldest pairs with <code>trim_history</code> when the history is too large. After a removal, the messages start with a different turn, so the messages part of the prefix is new. That turn writes the history again. The breakpoint on the system prompt still reads the tools and the system prompt. Remove several pairs at a time, not one pair on every turn, so that most turns can read the cache.</p>` },
        { type: "worked", title: "Worked example: when does a write pay for itself?",
          intro: "Use the default of the simulator: Opus 5.5, a prefix of 4,400 tokens. The input price is $4, a 5-minute write $5, a 1-hour write $8 and a read $0.20 per million tokens.",
          steps: [
            { html: "Extra cost of a 5-minute write, compared with normal input: 4,400 × ($5 − $4) / 1,000,000 = <strong>$0.0044</strong>." },
            { html: "Saving of one read, compared with normal input: 4,400 × ($4 − $0.20) / 1,000,000 = <strong>$0.01672</strong>. One read pays for the write more than three times. So a 5-minute cache pays off when at least one call reads it." },
            { faded: true, html: "Your calls come every 10 minutes, so the 5-minute entry always expires. Compute the extra cost of a 1-hour write. How many reads must follow it before it pays for itself?",
              answer: "4,400 × ($8 − $4) / 1,000,000 = $0.0176. One read saves $0.01672, which is a bit less. So the 1-hour write pays for itself after 2 reads. At one call every 10 minutes, one entry gets many reads in an hour, and each read starts the hour again." }
          ] },
        { type: "html", html: `
          <h3>Design choices for production</h3>
          <ul>
            <li><strong>Order the request from stable to changing.</strong> Tools, then the fixed system prompt, then the examples, then the history, then the new message. Put the breakpoint after the last block that is the same on every call.</li>
            <li><strong>Never put the breakpoint on the new message.</strong> It changes on every call, so every call writes and none reads.</li>
            <li><strong>Watch the cache in production.</strong> Log the three usage fields of every call. Track the share of input tokens that are cache reads. A sudden drop means that a deploy changed the prefix.</li>
            <li><strong>Test the prefix.</strong> A test that compares the prefix bytes for two messages, and in two processes, finds most silent invalidators before a deploy.</li>
            <li><strong>Choose the lifetime from the traffic.</strong> Calls less than 5 minutes apart: the default. Calls between 5 minutes and 1 hour apart: the 1-hour lifetime. Rare calls: maybe no cache.</li>
          </ul>
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>How LLMs produce text (lesson 1.1).</strong> The prefill is most of the TTFT for a long prompt. A cache read skips the prefill of the prefix.</li>
            <li><strong>The context window and the KV cache (lesson 1.7).</strong> The same keys and values, kept between requests in place of inside one request. The causal mask is why only a prefix can be reused.</li>
            <li><strong>Message roles and the stateless API (lesson 2.1).</strong> The full history is sent on every turn. Automatic caching makes the repeated part cheap.</li>
            <li><strong>System prompts and few-shot examples (lesson 2.2).</strong> A fixed system prompt with no date is also a cacheable prefix.</li>
            <li><strong>Tool schemas (lesson 2.5).</strong> The tool definition is the first part of the prefix. A change to it invalidates the whole cache.</li>
            <li><strong>Prompt versioning (lesson 2.7).</strong> Each new prompt version is a new prefix, with one cache write.</li>
          </ul>` }
      ],
      checks: [
        { id: "l2-6-L3-a", type: "mcq",
          q: "Why can the API reuse the cached keys and values only for an exact prefix, and not for the same text in the middle of a different request?",
          options: [
            "Because the cache is stored as text, and text search is slow.",
            "Because the key and the value of a token depend on all earlier tokens (the causal mask), so different earlier tokens give different keys and values.",
            "Because the API deletes the middle of each request.",
            "Because the tokenizer gives different tokens in the middle of a request."
          ],
          correct: 1,
          explain: "In each layer, attention mixes in all earlier tokens. The same text after a different start has different keys and values. So only a request that is the same from the first token can use them." },
        { id: "l2-6-L3-b", type: "mcq",
          q: "Your batch job sends 50 triage requests at the same time, with the same prefix. The logs show 50 cache writes and no reads. What is the fix?",
          options: [
            "Add a breakpoint to each message.",
            "Use the 1-hour lifetime.",
            "Send one request first and wait until its response starts. Then send the other 49.",
            "Make the prefix shorter."
          ],
          correct: 2,
          explain: "An entry becomes available only after the first response starts. Requests sent at the same time all miss. Warm the cache with one request, then send the rest." },
        { id: "l2-6-L3-c", type: "recall",
          q: "How does automatic caching work in a chat, and what breaks it when the history is trimmed?",
          answer: "One top-level cache_control field. The API puts the breakpoint on the last cacheable block and moves it forward each turn, so each turn reads the earlier turns and writes the new ones. When trim_history removes the oldest pairs, the messages start with a different turn, so that turn writes the history again. A separate breakpoint on the system prompt still reads the tools and the system prompt." }
      ]
    }
  ],

  debugging: [
    { id: "l2-6-dbg-1", title: "Caching is on, but the cost went up",
      symptom: "After you add a cache breakpoint, the triage cost per day goes up by about 18%. The answers are the same.",
      evidence: "call 1: cache_creation_input_tokens=4400 cache_read_input_tokens=0   call 2: cache_creation_input_tokens=4400 cache_read_input_tokens=0   system[0].text starts with \"Today is 2026-11-02 14:03:51.\"",
      hints: [
        "Is the prefix the same on two calls?",
        "What does a write cost, compared with normal input?"
      ],
      answer: "The system prompt starts with the current time, so the prefix changes on every call. Every call writes the prefix at 1.25 times the input price, and no call reads it. Remove the time from the system prompt, or put it in the user turn after the breakpoint. Add a test that compares the prefix bytes for two calls." },
    { id: "l2-6-dbg-2", title: "The cache never writes",
      symptom: "You add cache_control to a short system prompt. There is no error, and nothing changes in the cost.",
      evidence: "usage: input_tokens=420 cache_creation_input_tokens=0 cache_read_input_tokens=0   (every call)",
      hints: [
        "How many tokens are before the breakpoint?",
        "What does the API do with a prefix that is too short?"
      ],
      answer: "The prefix has fewer than 512 tokens, the minimum on the current models. The API does not cache it and gives no error. Do not add text only to reach the minimum. Accept that this request is too short to cache, or move the breakpoint after a longer fixed part, such as the examples." },
    { id: "l2-6-dbg-3", title: "The prefix test passes, but production misses the cache",
      symptom: "The unit test that compares the prefix of two requests passes. In production, about half of the calls miss the cache. Each server process has its own pattern.",
      evidence: "process A: tools[0].input_schema.properties.category.enum = [\"HR\", \"IT\", ...]   process B: [\"finance\", \"other\", ...]   the enum is built with list(set(CATEGORIES))",
      hints: [
        "Is the order of a Python set of strings the same in every process?",
        "What does the unit test compare?"
      ],
      answer: "The tool schema is built from a set. The order of a set of strings can change from one process to the next, so each process sends a different tool definition. The unit test builds both requests in one process, so it cannot see this. Build the list in a fixed order (the order of CATEGORIES), and add a test that builds the prefix in two processes with different PYTHONHASHSEED values and compares the bytes." }
  ],

  recall: [
    { id: "l2-6-r1", q: "What is the cached prefix, and in which order does the API read it?", a: "Everything up to and including the block with the cache breakpoint. The order is tools, then system, then messages." },
    { id: "l2-6-r2", q: "What does a cache write and a cache read cost on Opus 5.5?", a: "A 5-minute write $5 and a 1-hour write $8 per million tokens (1.25 and 2 times the $4 input price). A read $0.20 per million (0.05 times). Source: the Pricing page of the Claude API docs, checked on 2026-11-02." },
    { id: "l2-6-r3", q: "Which usage fields show what the cache did, and how do you get the total input?", a: "cache_creation_input_tokens (written), cache_read_input_tokens (read) and input_tokens (after the last breakpoint). The total input is the sum of the three." },
    { id: "l2-6-r4", q: "Give three rules of prompt caching.", a: "The prefix must have at least 512 tokens on the current models (no error below it). At most 4 breakpoints. The lifetime is 5 minutes by default, or 1 hour with ttl \"1h\", and each read starts it again." },
    { id: "l2-6-r5", q: "Why does one changed character near the start of the prompt break the cache?", a: "The cache keeps the keys and values of the prefix tokens. Because of the causal mask, each token's keys and values depend on all earlier tokens, so a change at one position changes everything after it. A hit needs an identical prefix." },
    { id: "l2-6-r6", q: "How do you cache a chat history that grows each turn?", a: "Automatic caching: one top-level cache_control field. The API puts the breakpoint on the last cacheable block and moves it forward each turn." },
    { id: "l2-6-r7", q: "Does prompt caching change the answer or the output cost?", a: "No. The docs say caching has no effect on output token generation, and the response is the same. Only the input cost and the time to first token change." }
  ],

  interview: [
    { q: "How do you cut the cost of an LLM feature that sends the same long instructions on every call?",
      outline: "Prompt caching. Order the request from stable to changing, put a breakpoint after the fixed part, and keep the prefix byte-identical (no time, ids or user data before the breakpoint). Check the usage fields for reads, compute the cost from all three input fields, and measure the saving on real traffic. Then consider a smaller model or shorter prompts." },
    { q: "Caching is on, but the bill did not go down. How do you find the cause?",
      outline: "Read the usage fields. Writes on every call mean the prefix changes: diff the request bytes of two calls (time, ids, set order, tool definitions). Both fields at 0 mean the prefix is below the minimum. Reads only sometimes mean the lifetime expires between calls, or parallel requests miss. Add a prefix test and a cache read ratio metric." },
    { q: "How does prompt caching relate to the KV cache inside the model?",
      outline: "Inside one request, the model keeps the keys and values of earlier tokens so that each new token needs only its own computation. Prompt caching keeps these keys and values between requests, for an exact prefix. Because of the causal mask, keys and values depend on all earlier tokens, so only an identical prefix can be reused. A read skips that part of the prefill, which can lower the time to first token." },
    { q: "When does caching cost more than no caching?",
      outline: "When the writes are not followed by reads: the prefix changes on every call, the breakpoint is on a block that changes, the calls are further apart than the lifetime, or the traffic is too low. Each write costs 1.25 times (5 minutes) or 2 times (1 hour) the input price. On Opus 5.5, one read pays back a 5-minute write; a 1-hour write needs two reads." },
    { q: "How do you cache a multi-turn chat with a history budget?",
      outline: "A fixed breakpoint on the system prompt and automatic caching for the messages. Each turn reads the earlier turns and writes the new ones. Trimming the oldest turns changes the start of the messages, so the next turn writes again. Trim several pairs at a time, or summarize, so that most turns can read the cache. Watch the cache read ratio per conversation." }
  ],

  misconceptions: [
    { wrong: "The cache stores the answer, so the same question gets the same answer without a model call.", right: "The cache stores the computed prefix. The model always generates a new answer. Caching has no effect on the output." },
    { wrong: "A cache write is free; only the read costs money.", right: "A write costs 1.25 times (5 minutes) or 2 times (1 hour) the input price. Without reads, caching costs more than no caching." },
    { wrong: "The API tells me when the cache misses.", right: "A miss is not an error. You see it only in the usage fields: no read tokens, and write tokens on every call." },
    { wrong: "usage.input_tokens is the full input of the request.", right: "With caching, it counts only the tokens after the last breakpoint. Add cache_creation_input_tokens and cache_read_input_tokens." },
    { wrong: "The cache matches the same text anywhere in the request.", right: "It matches only an identical prefix, from the tools, through the system prompt, to the breakpoint." },
    { wrong: "Any prompt can be cached.", right: "The prefix must have at least 512 tokens on the current models. A shorter prefix is not cached, with no error." },
    { wrong: "The cache makes every call faster.", right: "It skips the prefill of the prefix on a read. A write is not faster, and for a short prefix the gain is small. Measure the time to first token." }
  ],

  resources: [
    { title: "Prompt caching", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
      when: "Read after level 1, and again with level 3.",
      why: "How breakpoints and the prefix work, the minimum length, the lifetimes, automatic caching, the usage fields and the table of changes that invalidate the cache.",
      watchFor: [
        "In which order does the API read tools, system and messages for the prefix?",
        "What is the minimum cacheable prefix for your model, and what happens below it?",
        "Which changes invalidate only the messages cache, and which invalidate everything?",
        "When does a cache entry become available for a second request?"
      ] },
    { title: "Pricing", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/about-claude/pricing",
      when: "Read with level 2, before milestone 2 of the ticket.",
      why: "The write and read prices for each model, and how the multipliers combine with the other price changes.",
      watchFor: [
        "What are the 5-minute write, 1-hour write and read prices of your model?",
        "What is the read multiplier on Opus 5.5 and Sonnet 5.5, and on Haiku 5.5?",
        "For the long-prompt price of Haiku 5.5, do the cache tokens count?"
      ] },
    { title: "Create a Message (API reference)", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/api/messages/create",
      when: "Optional, with level 2.",
      why: "The exact request and response fields: system as a list of text blocks, and the usage object.",
      watchFor: [
        "Which fields does the usage object of the response have?",
        "Which forms can the system field take?"
      ] }
  ],

  summary: `
    <ul>
      <li>A cache breakpoint marks the end of the cached prefix. The prefix is everything before it, in the order tools, system, messages.</li>
      <li>Call 1 writes the prefix (1.25 or 2 times the input price). Later calls with an identical prefix read it (0.05 or 0.1 times).</li>
      <li>The usage fields show what happened: cache_creation_input_tokens, cache_read_input_tokens and input_tokens. The total input is their sum.</li>
      <li>One changed byte before the breakpoint, a prefix below 512 tokens or an expired entry gives a miss, with no error.</li>
      <li>The cache keeps the keys and values of the prefix (lesson 1.7). The causal mask is why only an exact prefix can be reused.</li>
      <li>Automatic caching moves the breakpoint forward in a chat. Trimming the history makes the next turn write again.</li>
      <li>Test the prefix bytes, log the three fields, and measure the cost and the time to first token with and without the cache.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer how prompt caching cuts the cost of the triage. Use the numbers of the lesson: a write costs 1.25 times the input price and a read 0.05 times on Opus 5.5; in the simulator, 20 calls cost $0.18672 in place of $0.50. Then explain why the prefix must be identical from the first token (the KV cache and the causal mask), and name three code patterns that break the cache with no error. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-015"]
};

/* ====================================================================== T-015 */
window.ACADEMY.tickets["T-015"] = {
  id: "T-015",
  title: "Prompt caching for the triage and the chat",
  lesson: "2.6",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. Milestones 1 and 4 make 44 to 124 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Add prompt caching to the triage tool mode of T-014 and to the chat of T-010. In the tool mode, put one cache breakpoint at the end of the system prompt, so that the tool, the rules and the three examples are one cached prefix. In the chat, use automatic caching for the history.
      Add the cache prices to the T-001 price table, show the cache write and read tokens in the measurement line, and prove with tests that the prefix is byte-identical for every message. Then run the sample set with and without the cache, and compare the cost and the time to first token.</p>
      <p><strong>Real-world problem.</strong> Teams turn on prompt caching and assume that it works. Then a timestamp, an id or a changed tool order makes every call a cache miss, and the bill goes up, because each miss pays the write price. The API gives no error. Other teams compute the cost from <code>input_tokens</code> only and report a saving that is not real.
      This ticket adds caching with tests that catch a changing prefix, a cost function that counts all input fields, and a measurement that shows the real saving.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". It continues the helpdesk triage and the chat of topic 2. All work stays in the CLI. The FastAPI service starts in topic 3.</p>
      <p>This ticket builds on these earlier tickets:</p>
      <ul>
        <li>T-001: the client in <code>assistant/llm.py</code> (the only module that calls the API), the price table and the cost function in <code>assistant/pricing.py</code>, the measurement line with TTFT and the fake client of the tests.</li>
        <li>T-002: <code>count_input_tokens</code>, to measure the length of the prefix.</li>
        <li>T-010: <code>assistant/chat.py</code> with <code>Conversation</code>, the history budget with <code>trim_history</code>, and the measurement fields <code>turn</code>, <code>messages</code> and <code>trimmed</code>.</li>
        <li>T-011: the sample set in <code>samples/helpdesk.jsonl</code> and <code>scripts/triage_eval.py</code>.</li>
        <li>T-012 and T-013: the <code>--modes</code> option of the eval script, its columns, and the measurement fields <code>mode</code>, <code>answer</code>, <code>retries</code> and <code>valid</code>.</li>
        <li>T-014: the <code>tool</code> mode in <code>assistant/triage.py</code>, <code>build_triage_tool</code> and <code>triage_with_tool</code> in <code>assistant/schema_tool.py</code>, and the tool-mode system prompt with <code>RULES</code> and the 3 examples.</li>
      </ul>
      <p>The cache changes the cost and the time, not the answer. So the tests of T-001 and T-010 to T-014 must pass without a change. Without the new options, the other modes send the same requests as before.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 2.6, levels 1 and 2 complete. Level 3 helps for milestone 3 (the chat) and the questions.</li>
        <li>T-001, T-002, T-010, T-011, T-012, T-013 and T-014 done, and their tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestones 1 and 4 only.</li>
        <li>No new package. Use the <code>anthropic</code> SDK, <code>pydantic</code> and pytest from the earlier tickets.</li>
        <li>Read the docs pages "Prompt caching" and "Pricing" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.triage --mode tool --cache "message text"</code> sends the T-014 request with one cache breakpoint at the end of the system prompt. Without <code>--cache</code>, the tool mode sends the T-014 request with no change. The other modes do not change.</li>
        <li>The measurement line gets two fields in every mode: <code>cache_write</code> (<code>usage.cache_creation_input_tokens</code>) and <code>cache_read</code> (<code>usage.cache_read_input_tokens</code>). They are 0 when the request has no breakpoint. After a retry, they show the sum over all calls of the triage, as the token fields of T-014 do. Example: <code>mode=tool answer=ok retries=0 valid=yes cache_write=0 cache_read=900</code>. The input token field of T-001 still shows <code>usage.input_tokens</code>. The cost field uses all three input fields.</li>
        <li><code>python scripts/triage_eval.py --modes tool --cache off,on</code> runs every message of <code>samples/helpdesk.jsonl</code> in the tool mode on <code>claude-haiku-5-5</code>, first without and then with the cache. It prints one row for each run, with the columns of T-014 and three more: mean cache write tokens, mean cache read tokens and median TTFT. Without <code>--cache</code>, the script works as in T-014.</li>
        <li><code>python -m assistant.chat --cache</code> uses a breakpoint on the system prompt and automatic caching for the history. The measurement line of each turn has the T-010 fields and <code>cache_write</code> and <code>cache_read</code>. Without <code>--cache</code>, the chat sends the T-010 requests with no change.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>llm.py</code> stays the only module that calls the API. Its call function accepts <code>system</code> as a string or as a list of text blocks, and gets the optional parameter <code>cache_control</code> (the top-level field of automatic caching). Without them, the request is the same as before.</li>
        <li>A new pure module <code>assistant/caching.py</code> holds <code>MIN_CACHE_TOKENS</code> (512), <code>MAX_BREAKPOINTS</code> (4), <code>cached_system(text)</code>, <code>count_breakpoints(request)</code>, <code>prefix_bytes(request)</code> and <code>cache_tokens(usage)</code>. It does not import the SDK, makes no network call and prints nothing.</li>
        <li><code>cached_system(text)</code> returns one text block with <code>"cache_control": {"type": "ephemeral"}</code>. <code>count_breakpoints</code> counts the <code>cache_control</code> fields in the tools, the system blocks and the message blocks, plus 1 for a top-level <code>cache_control</code>. <code>prefix_bytes</code> returns <code>json.dumps([request["tools"], request["system"]]).encode()</code>, with the request keys of the tool mode. <code>cache_tokens(usage)</code> returns the write and read counts, and gives 0 for a field that is missing or <code>None</code>.</li>
        <li><code>triage.py</code> gets a pure function <code>tool_request(message, cache=False)</code>. It returns the fields of the tool-mode request: <code>tools</code>, <code>tool_choice</code>, <code>system</code> and <code>messages</code>. The tool mode and its retries send these fields. With <code>cache=False</code> (the default), the fields are equal to the T-014 request.</li>
        <li>The tool-mode request has exactly one breakpoint, on the last system block. No message block has <code>cache_control</code>: the new message changes on every call.</li>
        <li>The prefix (the tool and the system prompt) contains no time, no date, no id, no user data and no value built from a <code>set</code> or a dictionary with a changing order. The tool comes only from <code>build_triage_tool()</code> of T-014, which must give the same bytes on every call and in every process.</li>
        <li>A retry of <code>triage_with_tool</code> adds turns after the breakpoint and keeps the same tool and system prompt, so a retry reads the prefix.</li>
        <li>In <code>pricing.py</code>, add the cache multipliers with a comment that names the date you checked the Pricing page: a write costs 1.25 times the input price (5 minutes) or 2 times (1 hour). A read costs 0.05 times on Opus 5.5 and Sonnet 5.5, and 0.1 times on Haiku 5.5. The cost function gets the optional parameters <code>cache_write_tokens=0</code>, <code>cache_read_tokens=0</code> and <code>ttl="5m"</code>. Without them, the result is the same as in T-001. If your table has the long-prompt prices of Haiku 5.5, the prompt length for that rule includes the cache read and write tokens.</li>
        <li><code>Conversation</code> gets the optional parameter <code>cache=False</code>. With <code>cache=True</code>, the chat sends <code>system=cached_system(SYSTEM_PROMPT)</code> and <code>cache_control={"type": "ephemeral"}</code> on each turn. <code>count_breakpoints</code> of each chat request is at most <code>MAX_BREAKPOINTS</code>. The history budget of T-010 does not change.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001. The fake usage has the three input fields.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given the Opus 5.5 prices of the T-001 table ($4 input, $20 output), 1,100 input tokens, 4,400 cache write tokens and 150 output tokens, the cost is 0.0294. With 4,400 cache read tokens in place of the write, it is 0.00828. With a 1-hour write, it is 0.0426. These are the numbers of the lesson simulator (tolerance 1e-9).</li>
        <li>Given the Haiku 5.5 prices ($0.10 input, $0.50 output), 100 input tokens, 900 cache write tokens and 150 output tokens, the cost is 0.0001975. With 900 cache read tokens, it is 0.000094. These are the numbers of the lesson worked example (tolerance 1e-12).</li>
        <li>Given 1,200 input and 300 output tokens on Opus 5.5 and no cache arguments, the cost is 0.0108, as in T-001.</li>
        <li>Given two different messages, the two tool-mode requests have equal <code>prefix_bytes</code>, and only their messages differ.</li>
        <li>Given two Python processes with different <code>PYTHONHASHSEED</code> values, <code>prefix_bytes</code> of the tool-mode request is equal.</li>
        <li>Given <code>--mode tool --cache</code>, <code>count_breakpoints</code> of the request is 1, and the breakpoint is on the last system block. Given <code>--mode tool</code> without <code>--cache</code>, the request is equal to the T-014 request.</li>
        <li>Given a fake response with an invalid tool input and then a valid one, the second request of <code>triage_with_tool</code> has the same <code>prefix_bytes</code> as the first.</li>
        <li>Given a fake usage with <code>cache_creation_input_tokens</code> 900 and <code>cache_read_input_tokens</code> 0, the measurement line contains <code>cache_write=900 cache_read=0</code>. Given a fake usage without the two fields, it contains <code>cache_write=0 cache_read=0</code>.</li>
        <li>Given three chat turns with the fake client and <code>cache=True</code>, each request has the top-level <code>cache_control={"type": "ephemeral"}</code>, a system block with a breakpoint, and at most 4 breakpoints. The tests of T-010 pass without a change.</li>
        <li>With a real key, two tool-mode calls with different messages, less than 5 minutes apart, on <code>claude-haiku-5-5</code>: call 1 has <code>cache_write</code> above 0, and call 2 has <code>cache_read</code> equal to that number. The handoff records the two measurement lines. If both fields are 0 on both calls, the handoff gives the prefix length from <code>count_input_tokens</code> and says that it is below the minimum.</li>
        <li>With a real key, <code>scripts/triage_eval.py --modes tool --cache off,on</code> runs one time. The handoff records the two rows.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>See a write, a read and a miss (guided).</strong> In a scratch script, build the tool-mode request of T-014 with <code>cached_system</code>. Send it two times with two different messages to <code>claude-haiku-5-5</code>, less than 5 minutes apart. Print the three input fields of <code>usage</code> after each call.
        Then put the current time at the start of the system prompt and send two more calls. Write down the four lines. Measure the prefix with <code>count_input_tokens</code> of T-002. Do not keep this script.</li>
        <li><strong>The cache prices (guided).</strong> Write the tests for criteria 1 to 3 first. Then add the multipliers and the three optional parameters to <code>pricing.py</code>.</li>
        <li><strong>The breakpoints and the prefix tests (independent).</strong> Write the tests for criteria 4 to 9 with the fake client. Then write <code>caching.py</code>, the changes to <code>llm.py</code>, the breakpoint and <code>--cache</code> of the tool mode, the two measurement fields, and automatic caching in the chat.</li>
        <li><strong>The comparison and the handoff (independent).</strong> Add <code>--cache off,on</code> to <code>scripts/triage_eval.py</code>. Run it one time. Then run a chat of at least 6 turns with a small <code>--max-input-tokens</code>, so that the history budget removes a pair. Fill in <code>handoffs/T-015-handoff.md</code> with the measurement lines, the two rows and your answers to the questions, and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost: milestone 1 makes 4 calls. Milestone 4 makes 20 messages × 2 runs = 40 calls, and at most 120 calls if every message needs two retries, plus the chat turns. If each call uses 1,000 input and 150 output tokens, the cost at the Haiku 5.5 prices of the T-001 table without the cache is 40 × (1,000 × $0.10 + 150 × $0.50) / 1,000,000 = about $0.007, and about $0.021 for 120 calls. The run with the cache costs less. The script prints the real total.</p>
      <p class="muted">Stretch, optional: add <code>--cache-ttl 1h</code> to the eval script, and run the sample set with 6 minutes between the calls, one time with the default lifetime and one time with 1 hour. Compare the reads and the cost.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                   # from T-001, T-010 and T-014: system as blocks, the optional cache_control
    pricing.py               # from T-001: the cache multipliers and the optional cache parameters
    caching.py               # MIN_CACHE_TOKENS, MAX_BREAKPOINTS, cached_system, count_breakpoints,
                             # prefix_bytes, cache_tokens
    schema_tool.py           # from T-014 (no change): build_triage_tool, triage_with_tool
    triage.py                # from T-011 to T-014: the breakpoint of the tool mode, --cache,
                             # cache_write and cache_read in the measurement line
    chat.py                  # from T-010: the system breakpoint and automatic caching, --cache
  samples/
    helpdesk.jsonl           # from T-011 (no change)
  scripts/
    triage_eval.py           # from T-011 to T-014: --cache off,on and the three new columns
  tests/
    test_cache_pricing.py    # the cache prices, and the T-001 cost without the cache
    test_cache_prefix.py     # byte-identical prefix, two processes, one breakpoint, the retry
    test_cache_usage.py      # the measurement fields, missing fields count as 0
    test_chat_cache.py       # automatic caching and at most 4 breakpoints in the chat
  tickets/
    T-015.md                 # this ticket (generated)
  handoffs/
    T-015-handoff.md         # your handoff (template generated)</code></pre>
      <p>For criterion 5, start a small Python process from the test with <code>subprocess.run</code>, one time with <code>PYTHONHASHSEED=1</code> and one time with <code>PYTHONHASHSEED=2</code> in its environment. The process prints <code>prefix_bytes(tool_request("test", cache=True)).hex()</code>. Compare the two outputs.</p>
      <p>Example of a fake usage, as a small object with only the fields that the code reads:</p>
      <pre><code>{"input_tokens": 100, "output_tokens": 150,
 "cache_creation_input_tokens": 900, "cache_read_input_tokens": 0}</code></pre>
      <p>Do not change <code>schema_tool.py</code>, <code>structured.py</code> or <code>samples/helpdesk.jsonl</code> for this ticket.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_cache_write_costs_1_25_times_input</code></td><td>1,100 in, 4,400 write, 150 out, Opus 5.5</td><td>0.0294</td></tr>
        <tr><td><code>test_cache_read_costs_5_percent_of_input_on_opus</code></td><td>1,100 in, 4,400 read, 150 out, Opus 5.5</td><td>0.00828</td></tr>
        <tr><td><code>test_one_hour_write_costs_2_times_input</code></td><td>1,100 in, 4,400 write (1h), 150 out, Opus 5.5</td><td>0.0426</td></tr>
        <tr><td><code>test_haiku_cache_prices_match_lesson_example</code></td><td>100 in, 900 write or read, 150 out, Haiku 5.5</td><td>0.0001975 and 0.000094</td></tr>
        <tr><td><code>test_cost_without_cache_is_unchanged</code></td><td>1,200 in, 300 out, Opus 5.5</td><td>0.0108, as in T-001</td></tr>
        <tr><td><code>test_prefix_is_byte_identical_for_two_messages</code></td><td>Two tool-mode requests</td><td>Equal <code>prefix_bytes</code>; different messages</td></tr>
        <tr><td><code>test_prefix_is_identical_across_processes</code></td><td>Two processes, <code>PYTHONHASHSEED</code> 1 and 2</td><td>Equal output</td></tr>
        <tr><td><code>test_tool_request_has_one_breakpoint_at_end_of_system</code></td><td><code>--mode tool</code></td><td>1 breakpoint, on the last system block; none on a message</td></tr>
        <tr><td><code>test_request_without_cache_option_is_unchanged</code></td><td><code>--mode tool</code> without <code>--cache</code></td><td>The request equals the T-014 request</td></tr>
        <tr><td><code>test_retry_keeps_the_cached_prefix</code></td><td>[invalid tool input], then valid</td><td>Both requests have equal <code>prefix_bytes</code></td></tr>
        <tr><td><code>test_measurement_line_shows_cache_tokens</code></td><td>Fake usage, 900 write, 0 read</td><td>Contains <code>cache_write=900 cache_read=0</code></td></tr>
        <tr><td><code>test_missing_cache_fields_count_as_zero</code></td><td>Fake usage without the two fields</td><td>Contains <code>cache_write=0 cache_read=0</code></td></tr>
        <tr><td><code>test_chat_uses_automatic_caching</code></td><td>Three chat turns, fake client, <code>cache=True</code></td><td>Top-level <code>cache_control</code> and a system breakpoint in each request</td></tr>
        <tr><td><code>test_chat_never_exceeds_four_breakpoints</code></td><td>Three chat turns, fake client</td><td><code>count_breakpoints</code> is at most 4</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table. Build the fake usage as a small object. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests and for the eval run. Each run of the eval sends its first call alone, so that the later calls can read the cache. The script prints its total cost from all three input fields. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> a cache miss is not an error, and the code must never fail because of it. The answer is the same with and without the cache, so the accuracy of the two eval rows must be equal within the normal variation of the model.</li>
        <li><strong>Latency:</strong> record the median TTFT of both eval rows. The docs say that you generally see a better TTFT for long documents. The triage prefix is short, so the gain can be small. Report what you measured.</li>
        <li><strong>Security:</strong> the key comes only from the environment. The prefix holds no user data: employee data goes only into the user turn, after the breakpoint. Caches are isolated for each workspace on the Claude API.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Give your four lines from milestone 1. What did the time in the system prompt change? How long was the prefix?</li>
        <li>Give your two eval rows. How much did the cache save on the total cost, and on the input cost? Why is the saving smaller than the 63% of the lesson simulator?</li>
        <li>Compare the median TTFT of the two rows. Did the cache change it? Use lesson 1.1 to explain the size of the change.</li>
        <li>In the chat, what did the measurement line show on the turn after the history budget removed a pair? Which part of the request was still read from the cache?</li>
        <li>Name one change in a later ticket that will invalidate the cache of the triage (for example a new field in <code>TriageResult</code>). How would you see it in production, and why is one write after a deploy not a problem?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, the measurement lines of milestone 1, the two eval rows and the chat lines).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001 and T-010 to T-014 did not change.</li>
        <li>No time, id or user data is in the prefix, and a test proves it for two messages and two processes.</li>
        <li>You can explain each line of <code>caching.py</code> without notes, why <code>input_tokens</code> alone gives a wrong cost, and why the breakpoint is not on the new message.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the breakpoint is after the last stable block and never on the new message; the prefix is byte-identical across messages, retries and processes; the cost uses all three input fields and the correct multipliers for the model; a miss is visible in the measurement line and never an error;
      the chat uses at most 4 breakpoints; the tests are named after properties and run with the network off; and how well your answers use your own measurements.</p>`
  }
};
