/*
 * Lesson 2.4 - JSON output: validate and retry.
 * Ticket T-013 - A validated triage result with a limited retry loop.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
 * Toy token counts of the interactive: 800 input tokens for the first call (system prompt with
 * the schema + the employee message), 50 tokens for each reply, 60 tokens for each retry message.
 * So call k (k = 1, 2, 3) has 800 + (k - 1) x 110 input tokens and 50 output tokens.
 *   Haiku 5.5: call 1 $0.000105, call 2 $0.000116, call 3 $0.000127.
 *     Valid after 1 retry: $0.000221 (2.10 times one call). Failed after 2 retries: $0.000348 (3.31 times).
 *   Opus 5.5: one call $0.0042. Failed after 2 retries: $0.01392.
 *   Made-up month of 100,000 messages on Haiku 5.5: 95,000 valid at once, 4,000 valid after 1 retry,
 *     1,000 failed after 2 retries: $11.207, compared to $10.50 with no retries (6.73% more).
 *     With a retry limit of 1, the 1,000 failures stop after 2 calls: $11.08.
 * Error messages: Pydantic 2.13.5 with ConfigDict(extra="forbid", strict=True), run locally.
 *   The validator in 13-ix.js gives the same type, location and message on a corpus of 104 replies.
 * The interactive for this lesson is in 13-ix.js (id "l2-4-validate").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["2.4"] = {
  id: "2.4",
  topic: "t2",
  title: "JSON output: validate and retry",
  objective: "Explain why a prompt that asks for JSON is not enough for code that reads the reply, define the shape once as a Pydantic model, validate every reply against it, send the validation errors back to the model for a limited number of retries, and compute what the retries cost.",
  prerequisites: [
    "Lesson 1.1: stop_reason, max_tokens and the cost formula.",
    "Lesson 1.9: read the answer by block type, and send thinking blocks back unchanged.",
    "Lessons 2.1 and 2.2: the API keeps no memory, so each call sends the full message list. The system prompt holds the task and the output format.",
    "You can read a small Python class. No Pydantic experience is necessary."
  ],
  covers: ["t2-structured"],
  whyItMatters: `
    <p>A person can read a reply that is almost correct. Code cannot. When the triage code reads <code>result["priority"]</code>, the reply must be JSON, the key must be there, and the value must be "low", "medium" or "high".
    A prompt that asks for JSON gets the correct shape most of the time. But "most of the time" is not a contract. At 100,000 messages each month, a failure rate of 1% is 1,000 crashes or 1,000 wrong records.</p>
    <p>This lesson gives the standard pattern for the gap: define the shape once, check every reply against it, and when a reply fails, tell the model what is wrong and ask again, a limited number of times.
    In an interview, "how do you get reliable structured output from an LLM?" is a common question. A good answer names the failure kinds, the validation step, the retry limit, what a retry costs, and what validation cannot catch.</p>`,
  concepts: [
    { id: "l2-4-c-shape", name: "Code needs a fixed shape: a prompt that asks for JSON usually works, but not always" },
    { id: "l2-4-c-failures", name: "The failure kinds: text around the JSON, a missing field, a wrong type, a value outside the enum, a cut-off reply" },
    { id: "l2-4-c-pydantic", name: "One Pydantic model as the one source: model_json_schema for the prompt, model_validate_json for the check" },
    { id: "l2-4-c-strict", name: "Strict mode and extra=\"forbid\": reject values that lax mode would convert" },
    { id: "l2-4-c-retry", name: "The retry loop: the reply and the errors go back as two more turns, with a fixed limit" },
    { id: "l2-4-c-stop", name: "Check stop_reason before you validate: do not retry a reply that stopped at max_tokens or a refusal" },
    { id: "l2-4-c-cost", name: "What retries cost: each retry sends the full history again, so measure the retry rate" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "A form with required fields, and a clerk who sends it back",
      blocks: [
        { type: "html", html: `
          <p>The helpdesk triage of lesson 2.2 reads an employee message and gives a category and a priority. A person reads that answer. Now code must read it: the code puts the message into a queue, sets the priority and sends a notice when a human must act.</p>
          <p>Code needs a <strong>fixed shape</strong>. For the triage, the shape is a JSON object with four fields:</p>
          <pre><code>{"category": "IT", "priority": "medium", "summary": "Laptop does not start after the update.", "needs_human": false}</code></pre>
          <p>You can describe this shape in the system prompt and ask for "only the JSON object". The model then gives the correct shape on most requests. But the model writes one token at a time (lesson 1.1), and nothing in that loop forces the shape. The prompt makes the correct shape probable. It does not make it certain.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a form with required fields", html: `
          <p>An office uses a paper form. The form has four boxes, and each box has a rule: "Category: one of IT, HR, facilities, finance, other". Most people fill it in correctly. Some people write a letter on the back, leave a box empty, or write "very urgent" in the box for low, medium or high.</p>
          <ul>
            <li><strong>The form is the schema.</strong> It says which boxes exist and what each box can hold.</li>
            <li><strong>The clerk is the validator.</strong> The clerk checks each box against its rule before the form goes into the system.</li>
            <li><strong>A rejected form goes back with a note.</strong> The note says which box is wrong and why: "Priority: write low, medium or high". This is the retry message.</li>
            <li><strong>The clerk does not send the form back forever.</strong> After two returns, the form goes to a person. This is the retry limit.</li>
          </ul>` },
        { type: "diagram", caption: "The retry loop. The code checks stop_reason, then validates the reply. A valid reply goes to the program. An invalid reply goes back to the model with the errors, until the retry limit stops the loop.",
          svg: `<svg viewBox="0 44 640 226" role="img" aria-label="Flow: call the model, check stop_reason, then validate the reply. If valid, return the result. If invalid and a retry is left, add the reply and the error message to the messages and call the model again. If no retry is left, raise an error. If stop_reason is max_tokens or refusal, raise an error at once.">
            <defs><marker id="l24a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="14" y="60" width="120" height="52" rx="8" class="d-box"/><text x="74" y="82" text-anchor="middle" class="d-bold">Call the model</text><text x="74" y="99" text-anchor="middle" class="d-small">full message list</text>
            <line x1="134" y1="86" x2="168" y2="86" class="d-line" marker-end="url(#l24a1)"/>
            <rect x="170" y="60" width="120" height="52" rx="8" class="d-box-info"/><text x="230" y="82" text-anchor="middle" class="d-bold">stop_reason</text><text x="230" y="99" text-anchor="middle" class="d-small">end_turn?</text>
            <line x1="290" y1="86" x2="324" y2="86" class="d-line" marker-end="url(#l24a1)"/>
            <rect x="326" y="60" width="130" height="52" rx="8" class="d-box-info"/><text x="391" y="82" text-anchor="middle" class="d-bold">Validate</text><text x="391" y="99" text-anchor="middle" class="d-small">parse + every rule</text>
            <line x1="456" y1="86" x2="490" y2="86" class="d-line" marker-end="url(#l24a1)"/>
            <rect x="492" y="60" width="134" height="52" rx="8" class="d-box-good"/><text x="559" y="82" text-anchor="middle" class="d-bold">Valid result</text><text x="559" y="99" text-anchor="middle" class="d-small">to the program</text>
            <line x1="230" y1="112" x2="230" y2="168" class="d-line" marker-end="url(#l24a1)"/>
            <rect x="160" y="170" width="140" height="44" rx="8" class="d-box-bad"/><text x="230" y="190" text-anchor="middle" class="d-bold">Raise an error</text><text x="230" y="205" text-anchor="middle" class="d-small">max_tokens, refusal</text>
            <line x1="391" y1="112" x2="391" y2="168" class="d-line" marker-end="url(#l24a1)"/>
            <rect x="326" y="170" width="300" height="44" rx="8" class="d-box-warn"/><text x="476" y="190" text-anchor="middle" class="d-bold">Invalid: a retry is left?</text><text x="476" y="205" text-anchor="middle" class="d-small">no: raise an error · yes: add reply + errors</text>
            <path d="M476,214 L476,240 L74,240 L74,114" class="d-line-accent" fill="none" marker-end="url(#l24a1)"/>
            <text x="86" y="258" class="d-small">retry: add 2 turns to the message list and call again</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>A clerk checks the form, not the truth.</strong> A valid reply can still have the wrong category. Validation checks the shape. The sample set of lesson 2.2 checks the answers.</li>
            <li><strong>Each return costs more than the last one.</strong> The API keeps no memory (lesson 2.1). A retry sends the full history again: the first request, the bad reply and the error message. So each retry has more input tokens than the call before it.</li>
            <li><strong>Some forms are not worth a return.</strong> A reply that stopped at <code>max_tokens</code> is cut off. A second request with the same limit is cut off again. The code must stop at once.</li>
          </ul>` },
        { type: "interactive", id: "l2-4-validate" },
        { type: "html", html: `
          <h3>The common failure kinds</h3>
          <p>The interactive shows the five kinds that you see most. Each one gives a different error from the validator:</p>
          <div class="table-wrap"><table>
            <tr><th>Failure</th><th>Example</th><th>Pydantic error type</th></tr>
            <tr><td>Text around the JSON</td><td>"Here is the triage result:" before the object, or a Markdown code fence</td><td><code>json_invalid</code></td></tr>
            <tr><td>A missing field</td><td>No <code>needs_human</code> key</td><td><code>missing</code></td></tr>
            <tr><td>A wrong type</td><td><code>"needs_human": "yes"</code> (a string, not a boolean)</td><td><code>bool_type</code></td></tr>
            <tr><td>A value outside the enum</td><td><code>"category": "laptop"</code></td><td><code>literal_error</code></td></tr>
            <tr><td>A cut-off reply</td><td>The JSON stops in the middle of a string, with <code>stop_reason</code> "max_tokens"</td><td><code>json_invalid</code> (but check <code>stop_reason</code> first)</td></tr>
          </table></div>
          <p>The first four kinds are format errors. The model can fix them when it gets a clear error message. The fifth kind is a size problem. A retry with the same <code>max_tokens</code> does not fix it.</p>` }
      ],
      checks: [
        { id: "l2-4-L1-a", type: "mcq",
          q: "The system prompt says \"Reply with only the JSON object\". Why must the code still validate every reply?",
          options: [
            "Because the API returns JSON as bytes, and the code must decode them.",
            "Because the prompt makes the correct shape probable, not certain. Some replies have extra text, a missing field, a wrong type or a value outside the enum.",
            "Because the model always adds text before the JSON, and the validator removes it.",
            "It does not need to. A clear prompt guarantees the format."
          ],
          correct: 1,
          explain: "The model writes one token at a time, and nothing in that loop forces the shape. A clear prompt gives the correct shape on most requests. At high volume, the rest are real failures, so the code checks each reply before it uses it." },
        { id: "l2-4-L1-b", type: "mcq",
          q: "A reply has stop_reason \"max_tokens\", and its JSON stops in the middle of the summary. What must the code do?",
          options: [
            "Retry two times with the same request and the same max_tokens.",
            "Add the missing closing characters and parse the result.",
            "Stop without a retry and report that the reply is cut off. Then raise max_tokens or ask for a shorter summary.",
            "Use the fields that are complete and set the others to default values."
          ],
          correct: 2,
          explain: "The reply is not malformed. It is cut off. A retry with the same limit is cut off again and costs a full call each time. Repairing the JSON gives a summary that the model did not finish. Check stop_reason before you validate." },
        { id: "l2-4-L1-c", type: "recall",
          q: "Name the five common failure kinds of JSON output, and say which one a retry does not fix.",
          answer: "Text around the JSON (or a code fence), a missing field, a wrong type, a value outside the enum, and a reply cut off at max_tokens. A retry does not fix the cut-off reply, because the limit stays the same. Check stop_reason first and stop." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "One Pydantic model, a strict check and a limited retry loop",
      blocks: [
        { type: "html", html: `
          <h3>Define the shape once</h3>
          <p>Pydantic is a Python library for data validation. A Pydantic model is a class with typed fields. You use one model for two jobs:</p>
          <ul>
            <li><code>model_json_schema()</code> returns the JSON Schema of the model as a dictionary. You put it into the system prompt, so the model sees the exact shape.</li>
            <li><code>model_validate_json(text)</code> parses the text as JSON and checks every field rule in one step. It returns a model object, or it raises a <code>ValidationError</code> that lists every error.</li>
          </ul>
          <p>Because both jobs use the same class, the prompt and the check cannot disagree. If you add a category, you change one line.</p>` },
        { type: "code", lang: "python", code:
`import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class TriageResult(BaseModel):
    # strict: "yes" is not a boolean. forbid: no keys that are not in the model.
    model_config = ConfigDict(extra="forbid", strict=True)

    category: Literal["IT", "HR", "facilities", "finance", "other"]
    priority: Literal["low", "medium", "high"]
    summary: str = Field(min_length=1, max_length=200)
    needs_human: bool


# The schema goes into the system prompt.
schema_text = json.dumps(TriageResult.model_json_schema())

reply = '{"category": "laptop", "priority": 2, "summary": "Laptop is dead."}'
try:
    result = TriageResult.model_validate_json(reply)
except ValidationError as e:
    # Prints 3, then one line for each error.
    print(e.error_count())
    for err in e.errors(include_url=False):
        print(err["type"], err["loc"], err["msg"])
# literal_error ('category',) Input should be 'IT', 'HR', 'facilities', 'finance' or 'other'
# literal_error ('priority',) Input should be 'low', 'medium' or 'high'
# missing ('needs_human',) Field required` },
        { type: "note", kind: "fact", title: "What the schema and the errors contain", html: `
          <ul>
            <li>For this model, <code>model_json_schema()</code> gives an object with <code>"enum": ["IT", "HR", "facilities", "finance", "other"]</code> for the category, <code>"enum": ["low", "medium", "high"]</code> for the priority, <code>"minLength"</code> and <code>"maxLength"</code> for the summary, a <code>"required"</code> list with all four fields, and <code>"additionalProperties": false</code> from <code>extra="forbid"</code>.</li>
            <li><code>e.errors()</code> returns a list of dictionaries. Each one has a <code>type</code> (a short machine name, such as <code>missing</code>), a <code>loc</code> (the path to the field), a <code>msg</code> (a sentence for people) and the <code>input</code> value. <code>include_url=False</code> removes the link to the docs.</li>
            <li>The error messages in this lesson and in the interactive come from Pydantic 2.13.5. Other versions can use different words. Do not compare a message text in a test. Compare the <code>type</code> and the <code>loc</code>.</li>
          </ul>
          <p class="muted">Source: the Pydantic docs pages "Models", "JSON Schema", "Error Handling" and "Validation Errors" (links in the resources), and a local run of Pydantic 2.13.5 on 2026-11-02.</p>` },
        { type: "html", html: `
          <h3>The retry loop</h3>
          <p>When the reply fails, the code adds two turns to the message list and calls the model again (lesson 2.1):</p>
          <ol>
            <li>An <strong>assistant</strong> turn with the reply, exactly as the API returned it. Use <code>response.content</code> unchanged. If the model wrote thinking blocks, they stay in it (lesson 1.9).</li>
            <li>A <strong>user</strong> turn with the retry message: which fields are wrong, why, and the rule again.</li>
          </ol>
          <p>The model now sees its bad reply and the exact errors. The retry message uses the <code>loc</code> and the <code>msg</code> of each error. It does not use the <code>input</code> value, because the model can see its own reply.</p>` },
        { type: "code", lang: "python", code:
`class TriageError(Exception):
    """The triage did not give a valid result."""


def retry_message(error: ValidationError) -> str:
    lines = [f"- {'.'.join(map(str, e['loc'])) or 'reply'}: {e['msg']}"
             for e in error.errors(include_url=False)]
    return ("Your last reply did not match the schema.\\n" + "\\n".join(lines)
            + "\\nReply again with only the JSON object. Do not add text before or after it.")


def triage(send, messages, max_retries=2):
    """send(messages) calls the model through llm.py and returns the response."""
    for attempt in range(max_retries + 1):
        response = send(messages)
        # 1. A cut-off reply or a refusal is not a format error. Do not retry.
        if response.stop_reason in ("max_tokens", "refusal"):
            raise TriageError(f"no complete reply: stop_reason={response.stop_reason}")
        # 2. Join the text blocks. Never read content[0].text (lesson 1.9).
        text = "".join(b.text for b in response.content if b.type == "text")
        try:
            return TriageResult.model_validate_json(text), attempt
        except ValidationError as e:
            if attempt == max_retries:
                raise TriageError(
                    f"reply invalid after {attempt} retries, error count {e.error_count()}") from e
            # 3. The reply unchanged, then the errors as a new user turn.
            messages = messages + [
                {"role": "assistant", "content": response.content},
                {"role": "user", "content": retry_message(e)},
            ]` },
        { type: "note", kind: "warn", title: "Two different kinds of retry", html: `
          <p>The SDK client of T-001 already retries some failed requests: connection errors, 408, 409, 429 and errors 500 and above. The default is 2 retries, and <code>max_retries</code> on the client sets it. These retries send the same request again, because the request did not get a reply.</p>
          <p>The loop in this lesson is different. The request got a complete reply, but the reply has the wrong shape. The loop sends a <strong>new</strong> request with two more turns. Keep the two limits separate in the code and in the measurement line.</p>
          <p class="muted">Source: the Python SDK section of the Claude API reference at the time of writing (2026-10).</p>` },
        { type: "worked", title: "Worked example: what a retry costs",
          intro: "The toy numbers of the interactive on Claude Haiku 5.5 ($0.10 per million input tokens and $0.50 per million output tokens, the price table of lesson 1.1). The first call has 800 input tokens: the system prompt with the schema and the employee message. Each reply has 50 tokens. Each retry message has 60 tokens.",
          steps: [
            { html: "One call: 800 × $0.10 / 1,000,000 + 50 × $0.50 / 1,000,000 = $0.00008 + $0.000025 = <strong>$0.000105</strong>." },
            { html: "The reply misses a field. The second call sends the first request, the bad reply and the retry message: 800 + 50 + 60 = 910 input tokens. 910 × $0.10 / 1,000,000 + $0.000025 = $0.000116." },
            { html: "The second reply is valid. The total is $0.000105 + $0.000116 = <strong>$0.000221</strong>, about 2.1 times one call. The cost more than doubles, because the second call is larger than the first." },
            { faded: true, html: "Your turn. The model makes the same error again on each retry, and the retry limit is 2. How many calls does the loop make, how many input tokens does the third call have, and what is the total cost?",
              answer: "Three calls. The third call has 910 + 50 + 60 = 1,020 input tokens and costs 1,020 × $0.10 / 1,000,000 + $0.000025 = $0.000127. Total: $0.000105 + $0.000116 + $0.000127 = $0.000348, about 3.3 times one call. Then the loop raises an error, so you pay $0.000348 for no result. On Opus 5.5 the same failure costs $0.01392. The interactive shows both numbers." }
          ] },
        { type: "html", html: `
          <h3>Rules for the loop</h3>
          <ol>
            <li><strong>Check <code>stop_reason</code> before you validate.</strong> <code>"max_tokens"</code> and <code>"refusal"</code> stop the loop at once with a clear error.</li>
            <li><strong>Set a small, explicit limit.</strong> Two retries is a common choice. If two clear error messages do not fix the reply, a third one rarely helps, and each one costs more than the last.</li>
            <li><strong>Raise a clear, typed error after the last try.</strong> The caller decides what to do. For the triage, a failed message goes to a human queue. Never return a half-valid object.</li>
            <li><strong>Record the number of retries for each request.</strong> The retry rate tells you if the prompt or the model changed. A rate that goes up is a warning before the bill goes up.</li>
            <li><strong>Keep the check in one function.</strong> The CLI, the scripts and the future service all call the same <code>triage</code> function. Then a test of that function covers all of them.</li>
          </ol>` }
      ],
      checks: [
        { id: "l2-4-L2-a", type: "mcq",
          q: "The first reply misses a field. The retry gives a valid reply. With the toy numbers of the lesson on Haiku 5.5, what is the total cost?",
          options: ["$0.000105", "$0.000210", "$0.000221", "$0.000348"],
          correct: 2,
          explain: "Call 1: 800 input and 50 output tokens, $0.000105. Call 2 sends the history again: 910 input tokens, $0.000116. Total $0.000221. $0.000210 is two calls of the first size, which forgets that the history grows. $0.000348 is three calls." },
        { id: "l2-4-L2-b", type: "mcq",
          q: "Which message list is correct for the first retry?",
          options: [
            "[user: request, user: retry message]",
            "[user: retry message]",
            "[user: request, assistant: the reply exactly as returned, user: retry message]",
            "[user: request, assistant: the reply without its thinking blocks, user: retry message]"
          ],
          correct: 2,
          explain: "The API keeps no memory, so the list has the full history. The model must see its bad reply to fix it. Send the reply content unchanged: lesson 1.9 says that changed or removed thinking blocks can cause an API error." },
        { id: "l2-4-L2-c", type: "recall",
          q: "What are the two jobs of the TriageResult model, and why is one model better than a schema in the prompt and a separate check in the code?",
          answer: "model_json_schema() gives the JSON Schema for the system prompt. model_validate_json() parses the reply and checks every rule. One class is the one source for both, so the prompt and the check cannot disagree. A new field or category is a change in one place." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Strict or lax, the cost of retries at volume, and what validation cannot catch",
      blocks: [
        { type: "html", html: `
          <h3>Strict mode or lax mode</h3>
          <p>By default, Pydantic uses <strong>lax mode</strong>. It converts some values to the field type. For a <code>bool</code> field, lax mode accepts the strings <code>"true"</code> and <code>"yes"</code> and the number <code>1</code>, and gives <code>True</code>.
          <strong>Strict mode</strong> rejects all three with <code>bool_type</code>: "Input should be a valid boolean".</p>
          <p>Which one is correct for model output?</p>
          <ul>
            <li><strong>Lax mode</strong> accepts more replies, so you get fewer retries. But it hides a change in the model output. If the model starts to write <code>"yes"</code>, you do not see it.</li>
            <li><strong>Strict mode</strong> makes the model follow the schema exactly. A drift becomes a retry that you can count. The cost is some retries that lax mode would avoid.</li>
          </ul>
          <p>This lesson and T-013 use strict mode with <code>extra="forbid"</code>. The retry count then measures how well the model follows the schema. A <code>Literal</code> field compares the exact text in both modes, so <code>"it"</code> is not <code>"IT"</code>. One detail: the Pydantic docs say that strict mode is looser when it validates from JSON. For example, a date field accepts a date string. The triage model has no such field.</p>` },
        { type: "html", html: `
          <h3>The cost of retries at volume</h3>
          <p>The cost of one retry is small. The question for a product is the cost of the retry rate over a month, and the cost of the messages that still fail.</p>` },
        { type: "worked", title: "Worked example: one month of triage",
          intro: "A made-up month of 100,000 employee messages on Claude Haiku 5.5, with the toy token counts of the interactive. 95,000 replies are valid at once. 4,000 are valid after 1 retry. 1,000 still fail after 2 retries. These rates are made up for teaching.",
          steps: [
            { html: "With no failures, 100,000 × $0.000105 = <strong>$10.50</strong>." },
            { html: "With the retries: 95,000 × $0.000105 + 4,000 × $0.000221 + 1,000 × $0.000348 = $9.975 + $0.884 + $0.348 = <strong>$11.207</strong>. That is 6.73% more." },
            { html: "The model cost is not the large cost. 1,000 messages need a person. If a person needs 2 minutes for each one, that is more than 33 hours of work. Reduce the failure rate first: a better prompt, a clearer schema, or the schema enforcement of lesson 2.5." },
            { faded: true, html: "Your turn. Set the retry limit to 1. The 1,000 messages that fail now stop after 2 calls instead of 3. Assume the other rates stay the same. What is the cost of the month?",
              answer: "95,000 × $0.000105 + 4,000 × $0.000221 + 1,000 × $0.000221 = $9.975 + $0.884 + $0.221 = $11.08. It saves $0.127. The saving is small, because few messages reach the last retry. Choose the limit from the retry counts in your measurement lines: if retry 2 almost never fixes a reply, a limit of 1 is enough." }
          ] },
        { type: "html", html: `
          <h3>What validation cannot catch</h3>
          <ul>
            <li><strong>A wrong answer in the correct shape.</strong> <code>{"category": "hr", ...}</code> for a broken laptop is valid. Only the sample set (lesson 2.2) and evals (Topic 5) measure if the answers are correct.</li>
            <li><strong>A summary that is not true.</strong> The length rule checks 1 to 200 characters. It does not check that the summary agrees with the message (lesson 1.8).</li>
            <li><strong>Rules between fields.</strong> For example, "a high priority needs a human". Pydantic can check this with a model validator in your code. The JSON Schema in the prompt cannot express it, so the model sees it only in the prompt text and in the retry message.</li>
          </ul>` },
        { type: "note", kind: "fact", title: "What the API can enforce (lesson 2.5)", html: `
          <ul>
            <li>The Claude API has a <strong>structured outputs</strong> feature. With <code>output_config={"format": {"type": "json_schema", "schema": ...}}</code>, the API constrains the response to the schema. The structured outputs page lists the problems that it removes: malformed JSON, missing required fields, inconsistent data types and schema violations.</li>
            <li>The same page lists limits. A reply that stops at <code>max_tokens</code> or with a refusal can still fail to match the schema. Some JSON Schema rules are not supported, for example <code>minimum</code>, <code>maximum</code>, <code>minLength</code> and <code>maxLength</code>. So your own validation still checks the summary length.</li>
            <li>An older method put the first characters of the reply, such as <code>{</code>, into an assistant turn at the end of the request (prefill). On Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5, a request with prefill returns error 400.</li>
          </ul>
          <p>Lesson 2.5 teaches the enforced method. This lesson comes first because the validation and the retry loop stay in the code after you add it.</p>
          <p class="muted">Source: the Claude API docs page "Structured outputs" (in the resources) and the Claude API reference at the time of writing (2026-10).</p>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>The token counts in this lesson are toy numbers. Real counts depend on the prompt, the schema and the message. Real retry rates depend on the model, the prompt and the kind of message, and they can change between runs. Ticket T-013 asks you to measure them on your own sample set and to say what 20 samples can and cannot show.</p>` },
        { type: "html", html: `
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>The generation loop (lesson 1.1).</strong> The model writes one token at a time, and nothing in the loop forces a shape. That is why prompt-only JSON can fail.</li>
            <li><strong>Reasoning models (lesson 1.9).</strong> Read the text blocks by type, check <code>stop_reason</code> first, and send thinking blocks back unchanged in the retry.</li>
            <li><strong>Message roles (lesson 2.1).</strong> A retry is two more turns, and each call sends the full history. So each retry costs more than the call before it.</li>
            <li><strong>System prompts (lesson 2.2).</strong> The schema goes into the system prompt. The sample set measures if the answers are correct, which validation cannot do.</li>
            <li><strong>Schema enforcement (lesson 2.5).</strong> The API can constrain the shape. Your validation still checks the rules that the API does not support.</li>
          </ul>` }
      ],
      checks: [
        { id: "l2-4-L3-a", type: "mcq",
          q: "TriageResult uses strict mode. The model writes \"needs_human\": \"yes\". What happens, and what would lax mode do?",
          options: [
            "Strict mode accepts it as True. Lax mode rejects it.",
            "Strict mode rejects it with bool_type. Lax mode converts it to True and accepts it.",
            "Both modes reject it.",
            "Both modes accept it as the string \"yes\"."
          ],
          correct: 1,
          explain: "Lax mode converts some strings, such as \"yes\" and \"true\", to a boolean. Strict mode needs a JSON true or false and gives bool_type: \"Input should be a valid boolean\". Strict mode turns this drift into a retry that you can count." },
        { id: "l2-4-L3-b", type: "mcq",
          q: "In the made-up month, 95,000 messages need 1 call, 4,000 need 2 calls and 1,000 fail after 3 calls. With the toy costs on Haiku 5.5 ($0.000105, $0.000221 and $0.000348), what does the month cost?",
          options: ["$10.50", "$11.08", "$11.21", "$13.90"],
          correct: 2,
          explain: "95,000 × $0.000105 + 4,000 × $0.000221 + 1,000 × $0.000348 = $9.975 + $0.884 + $0.348 = $11.207. $10.50 is the month with no retries. $11.08 is the month with a retry limit of 1." },
        { id: "l2-4-L3-c", type: "recall",
          q: "Name three problems that a valid TriageResult can still have.",
          answer: "The category or priority can be wrong for the message. The summary can say something that the message does not say. A rule between fields, such as \"a high priority needs a human\", is not in the schema. The sample set and evals measure the first two. A model validator in the code can check the third." }
      ]
    }
  ],

  debugging: [
    { id: "l2-4-dbg-1", title: "Every reply fails at line 1 column 1",
      symptom: "After a prompt change, every triage call uses all its retries and fails. The replies look like correct JSON when you print them.",
      evidence: "type=json_invalid loc=() msg=Invalid JSON: expected value at line 1 column 1   reply starts with: ```json",
      hints: [
        "What is the first character of the reply?",
        "Is a Markdown code fence part of JSON?"
      ],
      answer: "The model wraps the JSON in a Markdown code fence. The first character is a backtick, so the parser fails at line 1 column 1. Fix: say in the system prompt that the reply is only the JSON object, with no code fence. If you also decide to remove one fence in code, make it a named, tested step, and count how often it runs. Add the fenced reply to the test fixtures." },
    { id: "l2-4-dbg-2", title: "The triage cost is three times the estimate",
      symptom: "The monthly cost of the triage is much higher than the estimate. Most results are correct.",
      evidence: "retries=2 on 31% of the measurement lines   last error: type=literal_error loc=('category',) msg=Input should be 'IT', 'HR', 'facilities', 'finance' or 'other'   reply: \"category\": \"it\"",
      hints: [
        "Which value does the model write, and which values does the enum allow?",
        "Where does the model see the allowed values?"
      ],
      answer: "The prompt text has a hand-written list in lowercase, \"it, hr, facilities, finance\", but the enum allows \"IT\" and \"HR\" in capitals. A Literal field compares the exact text. The parser of lesson 2.2 accepted any case, so the list did not cause errors before. The model follows the prompt text, fails, and needs retries. Fix: take the allowed values from the schema, not from a hand-written list, and show one valid example in the prompt. Then check the retry rate again on the sample set. Alert when the retry rate goes up." },
    { id: "l2-4-dbg-3", title: "Long messages cost three calls and still fail",
      symptom: "For long employee messages, the triage makes three calls and then raises an error. Short messages work.",
      evidence: "call 1: stop_reason=max_tokens  json_invalid: EOF while parsing a string   call 2: stop_reason=max_tokens   call 3: stop_reason=max_tokens   retries=2",
      hints: [
        "Is the reply malformed, or is it cut off?",
        "Does a retry change max_tokens?"
      ],
      answer: "The replies are cut off at max_tokens, not malformed. The code validates before it checks stop_reason, so it retries a problem that a retry cannot fix, and pays for three calls. Fix: check stop_reason first and raise at once for max_tokens. Then set max_tokens from measured usage.output_tokens, with a margin, and keep the summary limit short. Add a test where the fake client returns max_tokens: the loop makes 1 call." }
  ],

  recall: [
    { id: "l2-4-r1", q: "Why is a prompt that asks for JSON not enough?", a: "The model writes one token at a time, and nothing forces the shape. The prompt makes the correct shape probable, not certain. At high volume, the failures are real crashes or bad records, so the code validates every reply." },
    { id: "l2-4-r2", q: "Which two Pydantic methods does the triage use, and for what?", a: "model_json_schema() gives the JSON Schema for the system prompt. model_validate_json(text) parses the text and checks every rule in one step, and raises ValidationError with a list of errors." },
    { id: "l2-4-r3", q: "What does a retry add to the message list?", a: "An assistant turn with the reply content exactly as returned (thinking blocks included), then a user turn with the retry message: the location and the message of each error, and the rule again." },
    { id: "l2-4-r4", q: "When does the loop stop without a retry?", a: "When stop_reason is max_tokens or refusal. A cut-off reply is cut off again with the same limit, and a refusal is not a format error. Raise a clear error." },
    { id: "l2-4-r5", q: "Why does a retry cost more than the first call?", a: "The API keeps no memory, so the retry sends the full history: the first request, the bad reply and the retry message. With the toy numbers on Haiku 5.5: $0.000105, then $0.000116, so $0.000221 in total." },
    { id: "l2-4-r6", q: "What does strict mode change, and why use it for model output?", a: "Lax mode converts \"yes\" to True. Strict mode rejects it with bool_type. Strict mode makes a drift in the model output visible as a retry that you can count, instead of a silent conversion." },
    { id: "l2-4-r7", q: "What can validation not catch?", a: "A wrong answer in the correct shape, a summary that is not true, and rules between fields that are not in the schema. The sample set and evals measure correctness. A model validator can check rules between fields." }
  ],

  interview: [
    { q: "How do you get reliable structured output from an LLM?",
      outline: "Define the shape once (a Pydantic model). Put its JSON Schema in the prompt, or use the API's schema enforcement. Validate every reply in code. On an error, send the reply and the errors back as two more turns, with a small limit. Check stop_reason first. Raise a typed error after the last try and route the item to a person. Log the retry count and the error types. Measure correctness separately with a sample set." },
    { q: "Why not retry until the reply is valid?",
      outline: "Each retry sends the full history, so each call costs more than the last. If two clear error messages do not fix a reply, more rarely help. Some failures (max_tokens, refusal) are not fixed by a retry. An unbounded loop can multiply the cost of a bad prompt or a model change. Set a limit from the measured retry counts." },
    { q: "The model sometimes writes \"needs_human\": \"yes\" instead of true. Do you accept it?",
      outline: "Lax mode would convert it and hide the drift. Strict mode rejects it, and the retry fixes it, at a cost. I use strict mode for model output and count the retries, so I see when the model or the prompt changes. If the cost matters, I fix the prompt or use schema enforcement, not a silent conversion." },
    { q: "If the API can enforce a JSON Schema, why validate in code?",
      outline: "The enforcement does not support all rules (for example minimum, maximum, minLength and maxLength on the Claude structured outputs page). A reply that stops at max_tokens or a refusal can still fail to match. Rules between fields and business rules are not in the schema. And validation is a cheap guard if the request configuration changes. Keep one model for both." },
    { q: "How do you monitor a structured-output feature in production?",
      outline: "Per request: the retry count, the error types and locations, stop_reason, tokens and cost over all calls. Dashboards: the retry rate and the failure rate by error type, and the cost per valid result. Alert when the rates go up after a prompt or model change. Run the sample set before each prompt change (lesson 2.7, Topic 5)." }
  ],

  misconceptions: [
    { wrong: "A clear prompt guarantees valid JSON.", right: "It makes valid JSON probable. The model writes one token at a time, and nothing forces the shape. Validate every reply." },
    { wrong: "A retry costs the same as the first call.", right: "A retry sends the full history: the first request, the bad reply and the error message. Each retry costs more than the call before it." },
    { wrong: "If the JSON is cut off, retry it.", right: "Check stop_reason first. A reply that stopped at max_tokens is cut off again with the same limit. Stop, then raise max_tokens or shorten the output." },
    { wrong: "A valid result is a correct result.", right: "Validation checks the shape. A valid reply can have the wrong category or a false summary. Measure correctness with the sample set." },
    { wrong: "The SDK max_retries setting covers invalid JSON.", right: "The SDK retries requests that did not get a reply (connection errors, 429, 5xx). A reply with the wrong shape needs your own loop with a new request." },
    { wrong: "Lax mode is safer because it accepts more replies.", right: "Lax mode hides drift: \"yes\" becomes True with no sign. Strict mode makes the drift visible as a retry that you can count." },
    { wrong: "With schema enforcement in the API, validation in code is not necessary.", right: "Some rules (minimum, maximum, minLength, maxLength) are not supported, and max_tokens or a refusal can still give a reply that does not match. Keep the validation." }
  ],

  resources: [
    { title: "Models", by: "Pydantic (docs)", kind: "Docs", url: "https://pydantic.dev/docs/validation/latest/concepts/models/",
      when: "Read after level 1, before level 2.",
      why: "How to define a model, how model_validate_json works, and what extra=\"forbid\" does.",
      watchFor: [
        "What is the difference between model_validate and model_validate_json?",
        "What does the page say happens to extra data with each setting of extra?"
      ] },
    { title: "JSON Schema", by: "Pydantic (docs)", kind: "Docs", url: "https://pydantic.dev/docs/validation/latest/concepts/json_schema/",
      when: "Read with level 2.",
      why: "What model_json_schema returns, and how field constraints appear in the schema.",
      watchFor: [
        "What is the difference between the validation mode and the serialization mode of the schema?",
        "Where do the field constraints, such as ge and le, appear in the schema?"
      ] },
    { title: "Error Handling", by: "Pydantic (docs)", kind: "Docs", url: "https://pydantic.dev/docs/validation/latest/errors/errors/",
      when: "Read with level 2. Look at the list of validation error types after it.",
      why: "The fields of each error in errors(), which you use to write the retry message.",
      watchFor: [
        "Which keys does each error dictionary have?",
        "What does error_count() return?"
      ] },
    { title: "Strict Mode", by: "Pydantic (docs)", kind: "Docs", url: "https://pydantic.dev/docs/validation/latest/concepts/strict_mode/",
      when: "Read with level 3.",
      why: "What lax mode converts, what strict mode rejects, and the ways to turn strict mode on.",
      watchFor: [
        "Which example does the page give of a value that lax mode converts?",
        "In which way is strict mode looser when it validates from JSON?"
      ] },
    { title: "Structured outputs", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs",
      when: "Read after level 3. Lesson 2.5 uses it in full.",
      why: "What the API can enforce, which models support it, and which JSON Schema rules it does not support.",
      watchFor: [
        "Which problems does the page say you have without structured outputs?",
        "Which JSON Schema constraints does the page list as not supported, and what does it say your code must still do?"
      ] }
  ],

  summary: `
    <ul>
      <li>A prompt that asks for JSON makes the correct shape probable, not certain. Code must validate every reply.</li>
      <li>The common failures: text around the JSON, a missing field, a wrong type, a value outside the enum, a cut-off reply.</li>
      <li>One Pydantic model is the one source: model_json_schema for the prompt, model_validate_json for the check.</li>
      <li>Strict mode and extra="forbid" make drift visible as a retry, not a silent conversion.</li>
      <li>A retry adds the reply (unchanged) and the errors as two more turns. Check stop_reason first, and do not retry max_tokens or a refusal.</li>
      <li>Each retry sends the full history, so it costs more than the call before it. Set a small limit and log the retry count.</li>
      <li>Validation checks the shape, not the truth. The sample set and evals measure correctness.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer why the triage code validates every reply although the prompt asks for JSON. Name the five failure kinds, and say which one a retry cannot fix. Then explain the retry loop and its cost with the toy numbers on Haiku 5.5: $0.000105 for one call, $0.000221 for a success after 1 retry, $0.000348 for a failure after 2 retries. End with what validation cannot catch. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-013"]
};

/* ====================================================================== T-013 */
window.ACADEMY.tickets["T-013"] = {
  id: "T-013",
  title: "A validated triage result with a limited retry loop",
  lesson: "2.4",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. Milestone 4 makes at most 60 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Make the result of the helpdesk triage a validated <code>TriageResult</code> object. The triage prompt asks for JSON that matches the schema of the model.
      The code validates every reply, sends the errors back to the model for at most two retries, and then raises a clear error. The measurement line records the number of retries.
      The new <code>json</code> mode of the triage CLI uses them, and the earlier modes do not change.
      Put the model and the loop in a new module, <code>assistant/structured.py</code>, and prove them with tests that are named after the properties they check.</p>
      <p><strong>Real-world problem.</strong> A triage that prints text is enough for a person. A queue, a notice and a dashboard need fields that are always there and always have the correct type.
      Teams that parse model output without validation get crashes on a small part of the traffic, or silent bad records. This ticket gives the triage a contract, a bounded repair loop and a number that shows when the contract starts to fail.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      Phase 2 puts the assistant behind a FastAPI service. An endpoint can then return the <code>TriageResult</code> object directly, and a failed triage can go to a human queue. This ticket adds no endpoint.</p>
      <p>This ticket builds on these earlier tickets:</p>
      <ul>
        <li>T-001: the client in <code>assistant/llm.py</code> (the only module that calls the API), the price table in <code>assistant/pricing.py</code>, the measurement line, the typed errors and the fake client of the tests.</li>
        <li>T-009 ("Effort control and a safe answer check for responses with thinking"): <code>check_answer(stop_reason, blocks)</code> in <code>assistant/thinking.py</code>, with the statuses <code>ok</code>, <code>incomplete</code>, <code>no_answer</code> and <code>refusal</code>.</li>
        <li>T-010 ("A chat loop that keeps the conversation history"): the call function of <code>llm.py</code> has the optional <code>messages</code> parameter.</li>
        <li>T-011 ("Helpdesk triage with a system prompt and few-shot examples"): <code>assistant/triage.py</code> with <code>CATEGORIES</code>, <code>PRIORITIES</code>, <code>Label</code>, <code>build_request</code>, <code>parse_triage</code> and <code>accuracy</code>, the examples in <code>samples/triage_examples.jsonl</code>, the sample set in <code>samples/helpdesk.jsonl</code> and <code>scripts/triage_eval.py</code>.</li>
        <li>T-012 ("A reason-first mode for the helpdesk triage"): the <code>--mode</code> option with the values <code>labels</code>, <code>direct</code> and <code>reason</code>, <code>RULES</code> and <code>LABEL_FORMAT</code> in <code>triage.py</code>, and the <code>--modes</code> option of <code>scripts/triage_eval.py</code>.</li>
      </ul>
      <p>This ticket adds a fourth mode, <code>json</code>. The default mode stays <code>labels</code>, so the earlier modes and their tests do not change.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 2.4, levels 1 and 2 complete. Level 3 helps for milestone 4 and the questions.</li>
        <li>T-001, T-009, T-010, T-011 and T-012 done, and their tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestone 4 only.</li>
        <li>One new direct dependency: <code>pydantic</code> version 2. Add it to the dependency file of the project with a version range, for example <code>pydantic&gt;=2,&lt;3</code>.</li>
        <li>Read the Pydantic docs pages "Models" and "Error Handling" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.triage --mode json "message text"</code> prints the four fields of the validated result, one on each line: <code>category: ...</code>, <code>priority: ...</code>, <code>summary: ...</code> and <code>needs_human: ...</code>. The first two lines are the same as in the <code>labels</code> mode.</li>
        <li>In the json mode, <code>--print-json</code> prints the validated result as one JSON line instead, from <code>model_dump_json()</code>.</li>
        <li>In the json mode, the measurement line has the fields <code>mode=json</code> (T-012) and <code>answer</code> (T-009), and two new fields: <code>retries</code> (0 to the limit) and <code>valid</code> (<code>yes</code> or <code>no</code>). The token and cost fields show the sum over all calls of the triage. Example: <code>mode=json answer=ok retries=1 valid=yes</code>.</li>
        <li>When the triage fails, the CLI prints one line that names the reason (the status of <code>check_answer</code>, or the number of errors after the last retry), prints the measurement line, and exits with a code that is not 0. It prints no stack trace.</li>
        <li><code>--max-retries N</code> sets the retry limit of the json mode. The default is 2. Allowed values: 0 to 3. Another value gives an error before any API call.</li>
        <li><code>python scripts/triage_eval.py --modes json</code> runs every message of <code>samples/helpdesk.jsonl</code> in the json mode, with the 3 examples of T-011. Its row has the columns of T-012 and two more: the number of replies that were valid at once, and the total number of retries. A failed triage counts as a wrong answer, as a reply of <code>None</code> does in T-011.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>llm.py</code> stays the only module that calls the API.</li>
        <li><code>assistant/structured.py</code> contains <code>TriageResult</code>, <code>TriageError</code>, <code>retry_message</code> and <code>triage_with_retry</code>. It does not import the SDK, makes no network call and prints nothing.</li>
        <li><code>TriageResult</code> uses <code>ConfigDict(extra="forbid", strict=True)</code>. Fields: <code>category</code> (<code>Literal["IT", "HR", "facilities", "finance", "other"]</code>), <code>priority</code> (<code>Literal["low", "medium", "high"]</code>), <code>summary</code> (string, 1 to 200 characters) and <code>needs_human</code> (boolean). The two <code>Literal</code> types have the values of <code>CATEGORIES</code> and <code>PRIORITIES</code> of T-011, in the same case. Then <code>Label(result.category, result.priority)</code> compares directly with the labels of the sample set.</li>
        <li>The system prompt of the json mode is <code>RULES</code> of T-012, then one line that asks for only one JSON object that matches the schema, then <code>json.dumps(TriageResult.model_json_schema())</code>. It does not contain <code>LABEL_FORMAT</code>, and it does not repeat the allowed values in a hand-written list. The prompts of the other modes do not change.</li>
        <li><code>build_request</code> of T-011 gets an optional parameter <code>json_examples: bool = False</code>. When it is true, each example assistant turn is the <code>model_dump_json()</code> text of a <code>TriageResult</code> for that example. Add the keys <code>summary</code> and <code>needs_human</code> to each line of <code>samples/triage_examples.jsonl</code>. Without the parameter, the request is the same as before.</li>
        <li><code>triage_with_retry(send, messages, max_retries=2)</code> takes a function <code>send</code> that calls the model through <code>llm.py</code>. It returns the result and the list of responses of all calls. It makes at most <code>max_retries + 1</code> calls.</li>
        <li>For each response, it calls <code>check_answer</code> of T-009 first. When the status is not <code>ok</code>, it raises <code>TriageError</code> at once with the status, with no retry. It validates the <code>text</code> of the <code>check_answer</code> result, so it never reads a block by its position.</li>
        <li>On a <code>ValidationError</code>, it adds the response content unchanged as an assistant turn, then <code>retry_message(error)</code> as a user turn. It does not change the list that the caller passed in.</li>
        <li>The request never ends with an assistant turn. Do not prefill <code>{</code>: the current models return error 400 for a prefill. Do not send <code>temperature</code>, <code>top_p</code> or <code>top_k</code>.</li>
        <li>The SDK retries of T-001 (<code>max_retries</code> on the client) stay as they are. The two limits have different names in the code.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given each reply in <code>tests/fixtures/triage_replies.json</code>, <code>TriageResult.model_validate_json</code> gives the result in its <code>expect</code> field: <code>valid</code>, or a <code>ValidationError</code> whose first error has that <code>type</code>.</li>
        <li>The <code>Literal</code> values of <code>category</code> and <code>priority</code> are equal to <code>CATEGORIES</code> and <code>PRIORITIES</code> of T-011, in the same order and case.</li>
        <li>Given the fake replies [missing field, valid], <code>triage_with_retry</code> returns the result after 2 calls. The second request has 3 messages: the first user turn, the first reply content unchanged, and a user turn that contains <code>needs_human</code> and "Field required".</li>
        <li>Given the fake replies [wrong type, wrong type, wrong type] and <code>max_retries=2</code>, it raises <code>TriageError</code> after exactly 3 calls. The error text says "after 2 retries".</li>
        <li>Given a fake reply with <code>stop_reason="max_tokens"</code> and a cut-off text, <code>check_answer</code> gives <code>incomplete</code>, and <code>triage_with_retry</code> raises <code>TriageError</code> after exactly 1 call. The error text names the status.</li>
        <li>Given <code>max_retries=0</code> and an invalid reply, it raises after exactly 1 call.</li>
        <li>Given usage of 800 input and 50 output tokens for call 1, and 910 and 50 for call 2, at the Haiku 5.5 prices of the T-001 table ($0.10 and $0.50 per million), the measurement line shows <code>retries=1 valid=yes</code> and the cost 0.000221 (tolerance 1e-9).</li>
        <li>The system prompt of the json mode contains <code>RULES</code> and the JSON text of <code>TriageResult.model_json_schema()</code>, and does not contain <code>LABEL_FORMAT</code>. With <code>json_examples=True</code>, each example assistant turn validates as a <code>TriageResult</code>.</li>
        <li>With a real key, <code>scripts/triage_eval.py --modes json</code> runs once on <code>claude-haiku-5-5</code>. The handoff records the row, with the valid-at-once count and the total retries.</li>
        <li><code>pytest</code> passes with the network off. The tests of T-001, T-009, T-010, T-011 and T-012 pass without a change. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Look at the errors (guided).</strong> In a Python shell, write <code>TriageResult</code>. Print <code>model_json_schema()</code>. Then validate each reply of the fixture file and print <code>e.errors(include_url=False)</code>. Write down the <code>type</code>, <code>loc</code> and <code>msg</code> of each error. Validate the <code>type</code> reply in strict mode and in lax mode, and compare.</li>
        <li><strong>The model and the retry message (guided).</strong> Write the tests for criteria 1 and 2 and the tests for <code>retry_message</code> first. Then write <code>TriageResult</code> and <code>retry_message</code> in <code>structured.py</code>.</li>
        <li><strong>The retry loop and the json mode (independent).</strong> Write the tests for criteria 3 to 8 with the fake client. Then write <code>triage_with_retry</code>, the json system prompt, <code>json_examples</code> and the json mode of the CLI with the new fields of the measurement line.</li>
        <li><strong>The sample set and the handoff (independent).</strong> Add the json mode and the two columns to <code>scripts/triage_eval.py</code>. Run <code>--modes json</code> one time. Compare the accuracy with the 3-example row of your T-011 handoff. Fill in <code>handoffs/T-013-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost of milestone 4: 20 messages, at most 3 calls each, so at most 60 calls. If each call uses 1,500 input and 100 output tokens, the cost at the Haiku 5.5 prices of the T-001 table is at most 60 × (1,500 × $0.10 + 100 × $0.50) / 1,000,000 = $0.012. The script prints the real total.</p>
      <p class="muted">Stretch, optional: add a model validator that requires <code>needs_human</code> to be true when the priority is <code>high</code>. Add a fixture reply that breaks the rule, and say in the handoff how the retry message shows this error.</p>`,
    files: String.raw`
      <pre><code>project/
  assistant/
    llm.py                   # from T-001 and T-010 (no change)
    pricing.py               # from T-001 (no change)
    thinking.py              # from T-009 (no change): check_answer
    reasoning.py             # from T-012 (no change)
    structured.py            # TriageResult, TriageError, retry_message, triage_with_retry
    triage.py                # from T-011 and T-012: --mode json, json_examples in build_request,
                             # --max-retries, --print-json, the new measurement fields
  samples/
    helpdesk.jsonl           # from T-011 and T-012 (no change)
    triage_examples.jsonl    # from T-011: add summary and needs_human to each line
  scripts/
    triage_eval.py           # from T-011 and T-012: the json mode and two more columns
  tests/
    fixtures/
      triage_replies.json    # the replies below, and your own
    test_structured.py       # the model, retry_message and the retry loop
  tickets/
    T-013.md                 # this ticket (generated)
  handoffs/
    T-013-handoff.md         # your handoff (template generated)</code></pre>
      <p>Start <code>tests/fixtures/triage_replies.json</code> with these replies. Add each new failure that you see in milestone 4.</p>
      <pre><code>[
  {"id": "valid", "expect": "valid",
   "reply": "{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false}"},
  {"id": "prose", "expect": "json_invalid",
   "reply": "Here is the triage result:\n{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false}"},
  {"id": "fence", "expect": "json_invalid",
   "reply": "` + "```" + String.raw`json\n{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false}\n` + "```" + String.raw`"},
  {"id": "missing", "expect": "missing",
   "reply": "{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\"}"},
  {"id": "type", "expect": "bool_type",
   "reply": "{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": \"yes\"}"},
  {"id": "case", "expect": "literal_error",
   "reply": "{\"category\": \"it\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false}"},
  {"id": "enum", "expect": "literal_error",
   "reply": "{\"category\": \"laptop\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false}"},
  {"id": "extra", "expect": "extra_forbidden",
   "reply": "{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"Laptop does not start after the update.\", \"needs_human\": false, \"confidence\": 0.9}"},
  {"id": "empty", "expect": "string_too_short",
   "reply": "{\"category\": \"IT\", \"priority\": \"medium\", \"summary\": \"\", \"needs_human\": false}"}
]</code></pre>
      <p>The <code>expect</code> values are the error types of Pydantic 2. The <code>type</code> reply is valid in lax mode, which converts <code>"yes"</code> to <code>True</code>, so it proves that strict mode is on.
      The <code>case</code> reply is valid for <code>parse_triage</code> of T-011, which accepts any case. A <code>Literal</code> field compares the exact text, so the json mode rejects it.
      Do not change <code>llm.py</code>, <code>pricing.py</code>, <code>thinking.py</code> or <code>reasoning.py</code> for this ticket.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_each_fixture_reply_gives_its_expected_error_type</code></td><td>Each reply of the fixture file</td><td>Valid, or the first error has the <code>expect</code> type</td></tr>
        <tr><td><code>test_strict_mode_rejects_a_string_for_a_boolean</code></td><td><code>"needs_human": "true"</code></td><td><code>bool_type</code>, not <code>True</code></td></tr>
        <tr><td><code>test_schema_values_are_the_t011_labels</code></td><td>The <code>Literal</code> values of <code>category</code> and <code>priority</code></td><td>Equal to <code>CATEGORIES</code> and <code>PRIORITIES</code> of T-011</td></tr>
        <tr><td><code>test_schema_lists_every_category_and_forbids_extra_keys</code></td><td><code>model_json_schema()</code></td><td>The five categories, the three priorities, the four required fields, <code>additionalProperties</code> false</td></tr>
        <tr><td><code>test_retry_message_names_each_field_and_error</code></td><td>A reply with 3 errors</td><td>One line for each error, with its location and message</td></tr>
        <tr><td><code>test_retry_message_names_the_reply_for_invalid_json</code></td><td>The prose reply</td><td>A line that starts with "- reply:"</td></tr>
        <tr><td><code>test_valid_first_reply_makes_one_call</code></td><td>[valid]</td><td>1 call, 0 retries</td></tr>
        <tr><td><code>test_second_try_success_returns_after_two_calls</code></td><td>[missing, valid]</td><td>2 calls, 1 retry, the result</td></tr>
        <tr><td><code>test_retry_sends_the_reply_unchanged_then_the_errors</code></td><td>[missing, valid]</td><td>Second request: user, assistant (same content object), user (errors)</td></tr>
        <tr><td><code>test_loop_stops_after_the_last_retry</code></td><td>[type, type, type], <code>max_retries=2</code></td><td><code>TriageError</code> after 3 calls</td></tr>
        <tr><td><code>test_max_tokens_stop_is_not_retried</code></td><td>Cut-off reply, <code>"max_tokens"</code></td><td>Status <code>incomplete</code>, <code>TriageError</code> after 1 call</td></tr>
        <tr><td><code>test_refusal_is_not_retried</code></td><td><code>"refusal"</code></td><td><code>TriageError</code> after 1 call</td></tr>
        <tr><td><code>test_caller_message_list_is_not_changed</code></td><td>[missing, valid]</td><td>The list that the test passed in still has 1 message</td></tr>
        <tr><td><code>test_cost_is_the_sum_over_all_calls</code></td><td>(800, 50) and (910, 50), Haiku 5.5 prices</td><td>0.000221 (tolerance 1e-9)</td></tr>
        <tr><td><code>test_json_prompt_has_the_schema_and_no_label_format</code></td><td>The json mode system prompt</td><td>Contains <code>RULES</code> and the schema JSON, not <code>LABEL_FORMAT</code></td></tr>
        <tr><td><code>test_json_example_turns_are_valid_results</code></td><td><code>build_request</code> with <code>json_examples=True</code></td><td>Each example assistant turn validates as a <code>TriageResult</code></td></tr>
        <tr><td><code>test_cli_failure_has_no_stack_trace</code></td><td>[type, type, type]</td><td>One error line, measurement line with <code>valid=no</code>, exit code not 0</td></tr>
      </table></div>
      <p class="muted">Compare the error <code>type</code> and <code>loc</code> in tests, not the <code>msg</code> text: a new Pydantic version can change the words. Use <code>pytest.approx</code> for float comparisons. Build the fake responses as small objects with <code>stop_reason</code>, <code>content</code> and <code>usage</code>. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests and for the eval run. The retry limit caps the calls for each message at 3. The script prints its total cost. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> the triage never returns a half-valid result. Every failure is a <code>TriageError</code> with a reason, and every retry is visible in the measurement line.</li>
        <li><strong>Latency:</strong> each retry adds a full call. Record the total time over all calls, and report the time of the messages that needed a retry separately in the handoff.</li>
        <li><strong>Security:</strong> the key comes only from the environment. The replies contain text from employee messages, so the CLI does not write full replies to a log. The retry message contains only field names and error messages, not the input values.</li>
      </ul>`,
    questions: `
      <ol>
        <li>In milestone 1, which reply gave more than one error? In which order did Pydantic list them?</li>
        <li>Give your eval row for the json mode. How many replies were valid at once, and how many retries did the run need? Which error types did you see?</li>
        <li>Use your token counts: what did one retry cost, compared to the first call? Why is it larger?</li>
        <li>Your run has about 20 samples and one run. Can you conclude that the retry rate in production is 0%? What would you measure before you decide the retry limit for production?</li>
        <li>Name one error that a valid <code>TriageResult</code> can still have. Which measurement of T-011 catches it?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, two measurement lines, the eval row).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001, T-009, T-010, T-011 and T-012 did not change.</li>
        <li>The schema has one source: the prompt and the check both use <code>TriageResult</code>.</li>
        <li>You can explain each line of <code>triage_with_retry</code> without notes, and why it calls <code>check_answer</code> before it validates.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> <code>llm.py</code> is still the only module that calls the API; the schema has one source; strict mode and <code>extra="forbid"</code> are on;
      <code>check_answer</code> runs before the validation; the default mode did not change; the retry sends the reply unchanged and has a fixed limit; the cost and the retries cover all calls; the tests are named after properties and run with the network off; and how well your answers to the questions use your own measurements.</p>`
  }
};
