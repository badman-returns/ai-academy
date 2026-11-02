/*
 * Lesson 2.5 - Tool schemas and schema-enforced output.
 * Ticket T-014 - Schema-enforced triage with one source for the schema.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
 * Tool use system prompt (tool use overview page, checked on 2026-11-02):
 *   286 tokens with tool_choice auto on Opus 5.5, Sonnet 5.5 and Haiku 5.5.
 *   406 tokens with a forced tool_choice on Haiku 5.5. Opus 5.5 and Sonnet 5.5 reject a forced tool_choice.
 *   286 x $4 / 1M x 1,000 = $1.144 per 1,000 requests on Opus 5.5. 286 x $0.10 / 1M x 1,000 = $0.0286 on Haiku 5.5.
 * Worked example (made-up token counts, Opus 5.5 prices):
 *   Prompt-only request: 700 input, 90 output -> $0.0046.
 *   Enforced request: the schema moves into the tool (same size), plus 286 -> 986 input, 90 output -> $0.005744.
 *   Difference: $0.001144 per request, $1.144 per 1,000 requests.
 *   One prompt-only retry: 900 input, 90 output -> $0.0054. Break-even share of retries: 0.001144 / 0.0054 = 21.2%.
 *   Prompt-only with 10% retries: $0.00514. With 30% retries: $0.00622.
 *   Haiku 5.5 (faded step): $0.000115 and $0.0001436, difference $0.0286 per 1,000 requests.
 * T-014 milestone 4 estimate: 40 to 120 calls x (1,000 input x $0.10 + 150 output x $0.50) / 1M = $0.007 to $0.021.
 * The interactive for this lesson is in 14-ix.js (id "l2-5-schema").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["2.5"] = {
  id: "2.5",
  topic: "t2",
  title: "Tool schemas and schema-enforced output",
  objective: "Build a tool definition from one Pydantic model, make the API enforce the JSON Schema with strict tool use or structured outputs, read the result by block type and validate it, and explain with measurements which errors enforcement removes and which errors your code must still catch.",
  prerequisites: [
    "Lesson 2.4: a Pydantic model for the triage result, validation, and a retry with the error text.",
    "Lesson 1.1: the generation loop, sampling, stop_reason and the cost formula.",
    "Lessons 2.1 and 2.2 help: the messages list, the system prompt and the triage prompt."
  ],
  covers: ["t2-structured"],
  whyItMatters: `
    <p>In lesson 2.4, the prompt asked for JSON, and your code checked every response. Sometimes the model wrote text around the JSON, left out a field, used a wrong type or wrote a value that is not in the enum. Each error cost a retry: more tokens, more time and more code.</p>
    <p>The Claude API can <strong>enforce the schema</strong> for you. You send the JSON Schema in the request, and the API makes the output follow it. In production, this removes most format errors and most retries.
    But it does not make the values correct. The category can still be wrong, the response can be a refusal, and the output can stop at <code>max_tokens</code>.
    In an interview, "how do you get reliable structured output from an LLM?" is a common question. A good answer names both parts: enforcement of the shape by the API, and validation and measurement of the values by your code.</p>`,
  concepts: [
    { id: "l2-5-c-tooldef", name: "A tool definition: name, description, input_schema, and a tool_use block in the response" },
    { id: "l2-5-c-source", name: "One source for the schema: build the tool from the Pydantic model with one function" },
    { id: "l2-5-c-strict", name: "Strict tool use: \"strict\": true makes the tool input follow input_schema" },
    { id: "l2-5-c-choice", name: "tool_choice: auto, any, tool and none, and which models accept a forced tool" },
    { id: "l2-5-c-output", name: "Structured outputs: output_config.format and messages.parse" },
    { id: "l2-5-c-grammar", name: "How enforcement works: grammar-constrained sampling and its limits" },
    { id: "l2-5-c-remaining", name: "What enforcement cannot fix: wrong values, refusal, max_tokens, no tool call" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "A form with fixed boxes, not a blank page",
      blocks: [
        { type: "html", html: `
          <p>A <strong>tool</strong> is a function that you describe to the model. You give it a name, a description and an <strong>input schema</strong>: a JSON Schema that says which fields the input has, their types, and which fields are required.
          When the model decides to use the tool, the response contains a <strong><code>tool_use</code> block</strong> with an <code>input</code> object for that schema.</p>
          <p>In topic 4, your code will run real tools and send the results back. This lesson uses a different idea: the tool is only a <strong>form for the output</strong>. The triage tool <code>record_triage</code> does nothing. Its input <em>is</em> the triage result. Your code reads the input and stops.</p>
          <p>With <code>"strict": true</code> on the tool, the API makes the tool input follow the schema. A second feature, <strong>structured outputs</strong>, does the same for the text of the answer. Both features take the schema from the request, not from the prompt.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a paper form with boxes", html: `
          <p>Ask a person to "write your order on this blank page, as JSON". Most people do it, but some add a greeting, forget the delivery date or write "two" in place of 2. A paper form with boxes prevents most of that.</p>
          <ul>
            <li><strong>The input schema is the form.</strong> Each box has a label, a type (a date, a number, a check box) and a "required" mark.</li>
            <li><strong>A list of check boxes is an enum.</strong> The person can only mark one of the printed options.</li>
            <li><strong>The prompt-only method is the blank page.</strong> You must read every page and send it back when it is wrong. That is the retry of lesson 2.4.</li>
          </ul>` },
        { type: "diagram", caption: "One source for the schema. The Pydantic model gives the JSON Schema. The schema goes into the tool definition. The API returns a tool_use block, and the same model validates its input.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Top row, left to right: the Pydantic model TriageResult, its JSON Schema from model_json_schema, and the tool definition with strict true. An arrow goes down to the Claude API, which makes the output follow the schema. Bottom row, right to left: the API returns a tool_use block with an input object, and the same model validates the input into a TriageResult object.">
            <defs><marker id="l25a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="14" y="20" width="180" height="56" rx="8" class="d-box"/><text x="104" y="44" text-anchor="middle" class="d-bold">TriageResult</text><text x="104" y="62" text-anchor="middle" class="d-small">Pydantic model, one source</text>
            <line x1="194" y1="48" x2="228" y2="48" class="d-line" marker-end="url(#l25a1)"/>
            <rect x="230" y="20" width="180" height="56" rx="8" class="d-box"/><text x="320" y="44" text-anchor="middle" class="d-bold">JSON Schema</text><text x="320" y="62" text-anchor="middle" class="d-small">model_json_schema()</text>
            <line x1="410" y1="48" x2="444" y2="48" class="d-line" marker-end="url(#l25a1)"/>
            <rect x="446" y="20" width="180" height="56" rx="8" class="d-box-info"/><text x="536" y="44" text-anchor="middle" class="d-bold">Tool definition</text><text x="536" y="62" text-anchor="middle" class="d-small">input_schema, strict: true</text>
            <line x1="536" y1="76" x2="536" y2="118" class="d-line" marker-end="url(#l25a1)"/>
            <rect x="446" y="120" width="180" height="56" rx="8" class="d-box-info"/><text x="536" y="144" text-anchor="middle" class="d-bold">Claude API</text><text x="536" y="162" text-anchor="middle" class="d-small">output follows the schema</text>
            <line x1="446" y1="148" x2="412" y2="148" class="d-line" marker-end="url(#l25a1)"/>
            <rect x="230" y="120" width="180" height="56" rx="8" class="d-box"/><text x="320" y="144" text-anchor="middle" class="d-bold">tool_use block</text><text x="320" y="162" text-anchor="middle" class="d-small">input: a JSON object</text>
            <line x1="230" y1="148" x2="196" y2="148" class="d-line" marker-end="url(#l25a1)"/>
            <rect x="14" y="120" width="180" height="56" rx="8" class="d-box-good"/><text x="104" y="144" text-anchor="middle" class="d-bold">TriageResult</text><text x="104" y="162" text-anchor="middle" class="d-small">model_validate(input)</text>
            <path d="M104,76 L104,104" class="d-line-accent" fill="none" stroke-dasharray="4 4"/>
            <text x="320" y="208" text-anchor="middle" class="d-small">The same model makes the schema and checks the result, so the two cannot disagree.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>A correct form can hold a wrong answer.</strong> The box "category" accepts "HR" for a VPN problem. The shape is valid, and the value is wrong.</li>
            <li><strong>The model can decide not to use the form.</strong> With <code>tool_choice</code> <code>auto</code>, the model can answer with text only. Your code must check that a <code>tool_use</code> block came back.</li>
            <li><strong>Some responses stop early.</strong> A refusal or a stop at <code>max_tokens</code> can give output that does not match the schema.</li>
          </ul>` },
        { type: "interactive", id: "l2-5-schema" },
        { type: "html", html: `
          <h3>Two ways to enforce the schema</h3>
          <div class="table-wrap"><table>
            <tr><th></th><th>Strict tool use</th><th>Structured outputs</th></tr>
            <tr><td>Where the schema goes</td><td><code>tools[0].input_schema</code>, with <code>"strict": true</code></td><td><code>output_config.format</code>, with <code>"type": "json_schema"</code></td></tr>
            <tr><td>Where the result is</td><td>The <code>input</code> of a <code>tool_use</code> block</td><td>The text block of the answer, as JSON</td></tr>
            <tr><td>Can the model skip it?</td><td>Yes, with <code>tool_choice</code> <code>auto</code></td><td>No. The answer itself has the shape</td></tr>
            <tr><td>Extra input tokens</td><td>The tool use system prompt (286 tokens on the current models) and the tool definition</td><td>The schema. The docs give no fixed number. Read <code>usage.input_tokens</code></td></tr>
            <tr><td>Use it when</td><td>The output is one of several actions, or you also give the model real tools</td><td>You always want one JSON object as the answer</td></tr>
          </table></div>
          <p>The ticket of this lesson uses strict tool use, as the plan for topic 2 says, and compares it with the prompt-only method of lesson 2.4 (the <code>json</code> mode of T-013). Structured outputs is a stretch goal of the ticket.</p>` }
      ],
      checks: [
        { id: "l2-5-L1-a", type: "mcq",
          q: "In the triage ticket, what does the record_triage tool do?",
          options: [
            "It saves the triage result in a database.",
            "Nothing. Its input is the triage result, so the tool is only a form for the output.",
            "It sends the message to the correct team.",
            "It calls a second model that checks the category."
          ],
          correct: 1,
          explain: "The code never runs the tool. It reads the input of the tool_use block, validates it with TriageResult, and stops. Topic 4 teaches tools that run and return results." },
        { id: "l2-5-L1-b", type: "mcq",
          q: "Strict tool use is on. Which error can still happen?",
          options: [
            "The tool input has text before the JSON.",
            "A required field is missing from the tool input.",
            "The category is \"HR\" for a VPN problem.",
            "needs_human is the string \"no\" in place of a boolean."
          ],
          correct: 2,
          explain: "Enforcement controls the shape: the fields, the types and the enum values. \"HR\" is a valid enum value, so the shape is correct and the value is wrong. Only an eval on labeled messages finds this kind of error." },
        { id: "l2-5-L1-c", type: "recall",
          q: "Name the three parts of a tool definition that the model uses, and the property that turns on enforcement.",
          answer: "name, description and input_schema (a JSON Schema). \"strict\": true, at the top level of the tool definition, makes the tool input follow input_schema." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Build the tool from the model, send it, read it, validate it",
      blocks: [
        { type: "html", html: `
          <h3>The tool definition</h3>
          <ul>
            <li><strong><code>name</code></strong> must match <code>^[a-zA-Z0-9_-]{1,128}$</code>: letters, digits, <code>_</code> and <code>-</code>, no spaces.</li>
            <li><strong><code>description</code></strong> tells the model when to use the tool and what each field means. The docs say to aim for at least 3 to 4 sentences for each tool.</li>
            <li><strong><code>input_schema</code></strong> is a JSON Schema object. For strict tool use, set <code>"additionalProperties": false</code> on every object.</li>
            <li><strong><code>strict</code></strong> is a top-level property, next to <code>name</code>. It is not inside the schema.</li>
          </ul>
          <p>Do not write this JSON by hand. In lesson 2.4, the model <code>TriageResult</code> was the one description of the result. If you also write the schema by hand, you have two descriptions, and one day they disagree. Build the tool from the model with one function.</p>` },
        { type: "code", lang: "python", code: `# assistant/schema_tool.py - pure functions, no API calls
import copy
from pydantic import BaseModel
from assistant.structured import TriageResult  # the model of lesson 2.4 (T-013)

TOOL_NAME = "record_triage"
TOOL_DESCRIPTION = (
    "Record the triage result of one employee helpdesk message. "
    "Call this tool one time for each message. "
    "Set category to the team that must act, and priority to how fast that team must act. "
    "Write summary as one plain sentence. Set needs_human to true when the message is unclear or sensitive."
)

def close_objects(schema: dict) -> dict:
    """Set additionalProperties to false on the root object and on each object in $defs."""
    if schema.get("type") == "object":
        schema["additionalProperties"] = False
    for sub in schema.get("$defs", {}).values():
        close_objects(sub)
    return schema

def build_schema(model: type[BaseModel]) -> dict:
    return close_objects(copy.deepcopy(model.model_json_schema()))

def build_tool(model: type[BaseModel], name: str, description: str) -> dict:
    return {"name": name, "description": description,
            "input_schema": build_schema(model), "strict": True}

def build_triage_tool() -> dict:
    return build_tool(TriageResult, TOOL_NAME, TOOL_DESCRIPTION)` },
        { type: "note", kind: "fact", title: "What model_json_schema writes", html: `
          <ul>
            <li><code>BaseModel.model_json_schema()</code> returns the JSON Schema of the model as a dictionary.</li>
            <li>The <code>TriageResult</code> of lesson 2.4 uses <code>Literal</code> fields. Lesson 2.4 shows their schema: an <code>"enum"</code> list in the property itself.</li>
            <li>A field with an <code>Enum</code> class type goes into <code>"$defs"</code>, and the property refers to it with <code>"$ref"</code>. Strict tool use and structured outputs accept <code>$ref</code> and <code>$defs</code>.</li>
            <li>In the examples of the docs, a field with a default value is not in <code>"required"</code>.</li>
            <li>The Pydantic setting <code>extra="forbid"</code> rejects extra fields during validation. Lesson 2.4 shows that it also writes <code>additionalProperties: false</code> on the model object. A nested model without this setting does not get it. So <code>close_objects</code> sets it on every object, and a test checks it.</li>
          </ul>
          <p class="muted">Source: Pydantic docs, "JSON Schema" and "Configuration" pages; Claude API docs, "Structured outputs" (supported schema features). Checked on 2026-11-02.</p>` },
        { type: "html", html: `
          <h3>Send the tool and read the result</h3>
          <p>Send the tool with <code>tool_choice={"type": "auto"}</code> and tell the model in the system prompt to call it. Then find the <code>tool_use</code> block <strong>by its type and name</strong>, never by its position: with <code>auto</code>, a text block can come first.</p>` },
        { type: "code", lang: "python", code: `# In llm.py (the only module that calls the API), with the injected client of T-001:
response = client.messages.create(
    model=model,
    max_tokens=1024,
    system=RULES + " Always call the record_triage tool with your result.",  # RULES of T-012
    tools=[build_triage_tool()],
    tool_choice={"type": "auto"},
    messages=[{"role": "user", "content": message}],
)

# In the triage code: check the stop reason, find the block by type, then validate with the same model.
def find_tool_use(blocks, name: str):
    for block in blocks:
        if block.type == "tool_use" and block.name == name:
            return block  # block.input is the tool input; block.id goes into a tool_result
    return None  # no tool call: count it as invalid and retry

if response.stop_reason in ("refusal", "max_tokens"):
    raise TriageError(response.stop_reason)  # the error of T-013: report it, do not retry
block = find_tool_use(response.content, TOOL_NAME)
result = TriageResult.model_validate(block.input) if block is not None else None` },
        { type: "note", kind: "warn", title: "The retry turn after a tool call", html: `
          <p>The retry of lesson 2.4 adds the reply and then a user turn with the errors. After a <code>tool_use</code> block, that user turn must start with a <code>tool_result</code> block for the same <code>tool_use_id</code>. A user turn with text only gives error 400.</p>
          <ul>
            <li><strong>The tool input fails validation:</strong> send <code>{"type": "tool_result", "tool_use_id": block.id, "is_error": true, "content": errors}</code>. The docs say that the model then tries the tool again.</li>
            <li><strong>No tool call:</strong> the reply has text only, so a plain user turn is correct: "Call the record_triage tool with your result."</li>
          </ul>
          <p class="muted">Source: Claude API docs, "Handle tool calls" (formatting requirements and errors with is_error). Checked on 2026-11-02.</p>` },
        { type: "note", kind: "fact", title: "Forced tool_choice on the current models", html: `
          <p><code>tool_choice</code> has four options: <code>auto</code> (the model decides; the default when you give tools), <code>any</code> (it must use one of the tools), <code>tool</code> (it must use the named tool) and <code>none</code>.</p>
          <div class="table-wrap"><table>
            <tr><th>Model</th><th><code>auto</code></th><th><code>any</code> or <code>tool</code></th><th>Tool use system prompt</th></tr>
            <tr><td>Claude Opus 5.5</td><td>Yes</td><td>Error 400</td><td>286 tokens (auto)</td></tr>
            <tr><td>Claude Sonnet 5.5</td><td>Yes</td><td>Error 400</td><td>286 tokens (auto)</td></tr>
            <tr><td>Claude Haiku 5.5</td><td>Yes</td><td>Yes, but the model does not think before the call</td><td>286 (auto), 406 (any or tool)</td></tr>
          </table></div>
          <p>For the models that reject a forced tool, the docs say to use <code>auto</code> with strict tool use, or structured outputs when you need a fixed JSON shape. With a forced tool, the response has no text before the <code>tool_use</code> block. A change of <code>tool_choice</code> invalidates the cached message blocks (lesson 2.6).</p>
          <p class="muted">Source: Claude API docs, "Define tools" (forcing tool use) and "Tool use with Claude" (pricing table). Checked on 2026-11-02.</p>` },
        { type: "html", html: `
          <h3>The second method: structured outputs</h3>
          <p>With structured outputs, the schema goes into <code>output_config.format</code>, and the answer text is the JSON. The Python SDK has a helper: pass the Pydantic model as <code>output_format</code> to <code>client.messages.parse()</code>.
          The SDK transforms the schema, sends it as <code>output_config.format</code>, validates the response and returns the model in <code>response.parsed_output</code>.</p>` },
        { type: "code", lang: "python", code: `# With the SDK helper:
response = client.messages.parse(
    model=model,
    max_tokens=1024,
    system=RULES,
    messages=[{"role": "user", "content": message}],
    output_format=TriageResult,
)
result = response.parsed_output  # a TriageResult

# Without the helper, with the same single source:
response = client.messages.create(
    model=model, max_tokens=1024, system=RULES,
    messages=[{"role": "user", "content": message}],
    output_config={"format": {"type": "json_schema", "schema": build_schema(TriageResult)}},
)` },
        { type: "note", kind: "warn", title: "Schema features that the API does not enforce", html: `
          <p>Strict tool use and structured outputs share the same limits. The API returns error 400 for a schema with a feature that it does not support. Not supported: recursive schemas, numerical constraints (<code>minimum</code>, <code>maximum</code>, <code>multipleOf</code>), string constraints (<code>minLength</code>, <code>maxLength</code>), array constraints beyond <code>minItems</code> 0 or 1, and <code>additionalProperties</code> other than <code>false</code>.</p>
          <p>The SDK helpers remove such constraints from the schema that they send and check them in your process after the response. If you build the schema yourself, do not put these constraints in it. Check them with Pydantic after the response.</p>
          <p class="muted">Source: Claude API docs, "Structured outputs" (JSON Schema limitations). Checked on 2026-11-02.</p>` },
        { type: "worked", title: "Worked example: what enforcement costs per request",
          intro: "Your prompt-only triage request has 700 input tokens and 90 output tokens on Opus 5.5 ($4 and $20 per million). The enforced request moves the schema from the prompt into the tool definition. Suppose the schema has the same number of tokens in both places (measure it). The tool use system prompt adds 286 input tokens.",
          steps: [
            { html: "Prompt-only request: 700 × $4 / 1,000,000 + 90 × $20 / 1,000,000 = $0.0028 + $0.0018 = <strong>$0.0046</strong>." },
            { html: "Enforced request: 700 + 286 = 986 input tokens. 986 × $4 / 1,000,000 + $0.0018 = <strong>$0.005744</strong>. The difference is $0.001144 per request, or $1.144 per 1,000 requests." },
            { html: "A prompt-only retry resends the history with the error text: 900 input and 90 output tokens = $0.0036 + $0.0018 = <strong>$0.0054</strong>. The extra cost of enforcement equals the retry cost when 0.001144 / 0.0054 = <strong>21%</strong> of the requests need a retry. Below 21%, prompt-only is cheaper in tokens. Enforcement still removes the wait of the retries and a part of your code." },
            { faded: true, html: "Compute the difference per 1,000 requests on Haiku 5.5 ($0.10 and $0.50 per million), with the same token counts.",
              answer: "Prompt-only: 700 × 0.10 / 1M + 90 × 0.50 / 1M = $0.000115. Enforced: 986 × 0.10 / 1M + $0.000045 = $0.0001436. The difference is $0.0000286 per request, or about $0.029 per 1,000 requests." }
          ] }
      ],
      checks: [
        { id: "l2-5-L2-a", type: "mcq",
          q: "Your code reads response.content[0].input for the triage result. It crashes on some requests. Why?",
          options: [
            "The tool input is a string, not a dictionary.",
            "With tool_choice auto, a text block can come before the tool_use block, and sometimes there is no tool_use block at all.",
            "Strict tool use puts the input in response.parsed_output.",
            "The API sorts the blocks by size."
          ],
          correct: 1,
          explain: "Find the block by its type and name. With auto, the model can write text first, or answer with text only. Then the code must count the response as invalid and retry." },
        { id: "l2-5-L2-b", type: "mcq",
          q: "You send tool_choice={\"type\": \"tool\", \"name\": \"record_triage\"} to claude-opus-5-5. What happens?",
          options: [
            "The model always calls the tool, and the input follows the schema.",
            "The API ignores tool_choice and uses auto.",
            "The API returns error 400, because Opus 5.5 does not support a forced tool_choice.",
            "The model calls the tool, but it does not think first."
          ],
          correct: 2,
          explain: "Opus 5.5 and Sonnet 5.5 reject any and tool with error 400. Use auto with strict tool use and an instruction in the system prompt, or structured outputs. Haiku 5.5 accepts a forced tool, and then it does not think before the call." },
        { id: "l2-5-L2-c", type: "recall",
          q: "Why does build_tool set additionalProperties to false itself, and not trust extra=\"forbid\" in the model?",
          answer: "Strict tool use and structured outputs need additionalProperties false on every object. extra=\"forbid\" writes it only on a model that has this setting, so a nested model without it stays open. The builder sets it on the root and on each object in $defs, and a test checks it." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "How enforcement works, and what it cannot fix",
      blocks: [
        { type: "html", html: `
          <h3>Grammar-constrained sampling</h3>
          <p>Lesson 1.1 showed how the model picks each token: it computes a probability for every token in the vocabulary, and the sampler picks one. Enforcement changes only the last step.
          The API compiles your JSON Schema into a <strong>grammar</strong>. Before each pick, the sampler removes every token that cannot continue a valid output. It picks from the tokens that remain.</p>
          <p>So the model cannot write text around the JSON, leave out a required field before the object closes, or write a string where the schema says boolean. The model still decides <em>which</em> valid value to write. That is why a valid shape can hold a wrong value.</p>` },
        { type: "diagram", caption: "One step of grammar-constrained sampling. The output so far is {\"category\": \". The grammar allows only tokens that continue one of the enum values. The sampler picks from the allowed tokens.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="The output so far is the start of the category value. Five candidate tokens are allowed because they continue an enum value: IT, HR, facilities, finance and other. Three candidates are removed: Network, a closing brace and the word Sure, because they cannot continue a valid output.">
            <rect x="14" y="16" width="612" height="40" rx="8" class="d-box"/><text x="320" y="41" text-anchor="middle" class="d-bold">Output so far:  {"category": "</text>
            <text x="20" y="84" class="d-small">Allowed by the grammar (an enum value can start here)</text>
            <rect x="14" y="94" width="110" height="34" rx="6" class="d-box-good"/><text x="69" y="116" text-anchor="middle">IT</text>
            <rect x="134" y="94" width="110" height="34" rx="6" class="d-box-good"/><text x="189" y="116" text-anchor="middle">HR</text>
            <rect x="254" y="94" width="120" height="34" rx="6" class="d-box-good"/><text x="314" y="116" text-anchor="middle">facilities</text>
            <rect x="384" y="94" width="110" height="34" rx="6" class="d-box-good"/><text x="439" y="116" text-anchor="middle">finance</text>
            <rect x="504" y="94" width="110" height="34" rx="6" class="d-box-good"/><text x="559" y="116" text-anchor="middle">other</text>
            <text x="20" y="154" class="d-small">Removed before the pick (no valid output continues with them)</text>
            <rect x="14" y="164" width="130" height="34" rx="6" class="d-box"/><text x="79" y="186" text-anchor="middle">Network</text><line x1="24" y1="181" x2="134" y2="181" class="d-line"/>
            <rect x="154" y="164" width="130" height="34" rx="6" class="d-box"/><text x="219" y="186" text-anchor="middle">}</text><line x1="164" y1="181" x2="274" y2="181" class="d-line"/>
            <rect x="294" y="164" width="130" height="34" rx="6" class="d-box"/><text x="359" y="186" text-anchor="middle">Sure,</text><line x1="304" y1="181" x2="414" y2="181" class="d-line"/>
          </svg>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>The diagram shows whole words. Real tokens are often parts of words (lesson 1.2), so the grammar works on prefixes: after "fac", only tokens that continue "facilities" stay. The docs do not describe how the API builds the grammar. The idea of a mask on the next token is enough to reason about what enforcement can and cannot do.</p>` },
        { type: "note", kind: "fact", title: "Cost of the grammar and the cache", html: `
          <ul>
            <li>The first request with a new schema takes longer, because the API compiles the grammar. The API caches compiled grammars for 24 hours from the last use.</li>
            <li>The API caches the schema for up to 24 hours. Do not put personal data in property names, enum values or descriptions.</li>
            <li>The docs say that structured outputs do not guarantee the capitalization of string enum and const values. Validate the values with the same Pydantic model.</li>
            <li>Structured outputs cannot be used with citations or with a prefilled assistant message.</li>
          </ul>
          <p class="muted">Source: Claude API docs, "Structured outputs" (performance, data handling, feature compatibility). Checked on 2026-11-02.</p>` },
        { type: "html", html: `
          <h3>What enforcement removes, and what it cannot remove</h3>
          <div class="table-wrap"><table>
            <tr><th>Failure</th><th>Prompt-only (lesson 2.4)</th><th>Enforced (strict tool, auto)</th><th>What your code does</th></tr>
            <tr><td>Text around the JSON</td><td>Possible</td><td>Removed</td><td>Nothing</td></tr>
            <tr><td>Missing required field</td><td>Possible</td><td>Removed</td><td>Validate anyway (it is cheap)</td></tr>
            <tr><td>Wrong type ("2" for 2, "no" for false)</td><td>Possible</td><td>Removed</td><td>Validate anyway</td></tr>
            <tr><td>Value outside the enum</td><td>Possible</td><td>Removed (capitalization not guaranteed)</td><td>Validate with the model</td></tr>
            <tr><td>No tool call</td><td>Not applicable</td><td>Possible with <code>auto</code></td><td>Count as invalid, retry with a reminder</td></tr>
            <tr><td>A tool input that fails your validation</td><td>Not applicable</td><td>Possible (for example a summary that is too long)</td><td>Send a <code>tool_result</code> with <code>"is_error": true</code> and the errors</td></tr>
            <tr><td>min, max, minLength, maxLength</td><td>Possible</td><td>Not enforced</td><td>Validate with Pydantic</td></tr>
            <tr><td>Refusal (<code>stop_reason</code> "refusal")</td><td>Possible</td><td>Possible; the output may not match</td><td>Report it; do not retry the same request</td></tr>
            <tr><td>Stop at <code>max_tokens</code></td><td>Possible</td><td>Possible; the output may be incomplete</td><td>Report it; raise max_tokens</td></tr>
            <tr><td>A valid but wrong value</td><td>Possible</td><td>Possible</td><td>Measure accuracy on the labeled sample set</td></tr>
          </table></div>
          <p>So enforcement turns the format problem into a <strong>quality problem</strong>. You cannot see a quality problem in one response. You see it only when you compare many responses with labels, as in the sample set of lesson 2.2. The ticket measures both: the invalid-output count and the accuracy of each method.</p>` },
        { type: "html", html: `
          <h3>The same idea in TypeScript with Zod</h3>
          <p>Zod plays the role of Pydantic in TypeScript: one schema object gives the type, the JSON Schema and the validation. The TypeScript SDK has a helper, <code>zodOutputFormat</code>, for structured outputs.</p>` },
        { type: "code", lang: "typescript", code: `import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const TriageResult = z.object({
  category: z.enum(["IT", "HR", "facilities", "finance", "other"]),
  priority: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  needs_human: z.boolean(),
});

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const response = await client.messages.parse({
  model: "claude-opus-5-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: message }],
  output_config: { format: zodOutputFormat(TriageResult) },
});
const result = response.parsed_output; // typed as the schema` },
        { type: "html", html: `
          <h3>Design choices for production</h3>
          <ul>
            <li><strong>Keep the validation.</strong> It costs microseconds, it catches the capitalization and range cases, and it protects you when a model or a setting changes.</li>
            <li><strong>Keep the schema small and flat.</strong> Every field is input tokens on every request, and every enum value is a choice that the model can get wrong. Put the meaning of each field in the tool description.</li>
            <li><strong>Version the schema with the prompt.</strong> A change of a field name changes the tool definition, which invalidates the prompt cache (lesson 2.6), and the output that later code reads. Test each change (lesson 2.7).</li>
            <li><strong>Measure, do not assume.</strong> Count the invalid outputs and the retries of each method on the sample set, and compare the accuracy. Enforcement is better only if it improves the numbers that matter to you.</li>
          </ul>
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>Sampling (lesson 1.1).</strong> Enforcement is a mask on the next-token pick. Temperature and the model's probabilities still choose among the allowed tokens.</li>
            <li><strong>Reasoning models (lesson 1.9).</strong> A forced tool on Haiku 5.5 skips the thinking. With <code>auto</code>, the model can think and then call the tool.</li>
            <li><strong>JSON output: validate and retry (lesson 2.4).</strong> The same Pydantic model is the source of the schema and the validator.</li>
            <li><strong>Prompt caching (lesson 2.6).</strong> The cache prefix starts with the tools, then the system prompt, then the messages. A change to a tool definition invalidates the whole cache, so keep the schema stable.</li>
            <li><strong>Agents and tools (topic 4).</strong> The same tool definition, with code that runs the tool and sends a result back.</li>
          </ul>` }
      ],
      checks: [
        { id: "l2-5-L3-a", type: "mcq",
          q: "How does the API make the tool input follow the schema?",
          options: [
            "It checks the output after generation and retries until it is valid.",
            "It compiles the schema into a grammar and removes, at each step, the tokens that cannot continue a valid output.",
            "It fine-tunes the model on your schema for 24 hours.",
            "It adds the schema to the system prompt with a stronger instruction."
          ],
          correct: 1,
          explain: "This is grammar-constrained sampling. The model computes its probabilities as usual, and the sampler picks only from the tokens that the grammar allows. The compiled grammar is cached for 24 hours from the last use." },
        { id: "l2-5-L3-b", type: "mcq",
          q: "Your schema has \"minimum\": 1 on a field. What happens with structured outputs?",
          options: [
            "The API enforces the minimum in the grammar.",
            "The API ignores the keyword without an error.",
            "The API does not support numerical constraints. A schema with them returns error 400; the SDK helpers remove them and check them in your process.",
            "The model rounds the value up to 1."
          ],
          correct: 2,
          explain: "Numerical and string constraints are not supported. Leave them out of the schema that you send, and check them with Pydantic after the response, as the SDK helpers do." },
        { id: "l2-5-L3-c", type: "recall",
          q: "Name four failures that enforcement does not remove.",
          answer: "A valid but wrong value (for example the wrong category). A refusal. A stop at max_tokens. No tool call with tool_choice auto. Also: constraints such as minimum or maxLength, and the capitalization of enum values." }
      ]
    }
  ],

  debugging: [
    { id: "l2-5-dbg-1", title: "Every enforced request fails with error 400",
      symptom: "You copy a tool example from an old blog post that forces the tool. Every triage request to claude-opus-5-5 fails before the model runs.",
      evidence: "anthropic.BadRequestError: Error code: 400   request: tool_choice={\"type\": \"tool\", \"name\": \"record_triage\"}  model=claude-opus-5-5",
      hints: [
        "Which tool_choice options does Opus 5.5 accept?",
        "What does the docs page say to use when you need a guaranteed shape on this model?"
      ],
      answer: "Opus 5.5 and Sonnet 5.5 do not support a forced tool_choice (any or tool). Use tool_choice auto with \"strict\": true and an instruction in the system prompt, check that a tool_use block came back, and retry with a reminder if not. Or use structured outputs. Add a test that the request has tool_choice {\"type\": \"auto\"}." },
    { id: "l2-5-dbg-2", title: "The schema and the validator disagree",
      symptom: "After a colleague adds the category \"security\" to TriageResult, the triage marks many valid responses as invalid. The model never returns \"security\".",
      evidence: "pydantic ValidationError: category: Input should be 'IT', 'HR', 'facilities', 'finance', 'other' or 'security'   tools[0].input_schema.$defs.Category.enum: [\"IT\", \"HR\", \"facilities\", \"finance\", \"other\"]",
      hints: [
        "Where does the enum list of the tool come from?",
        "How many descriptions of the result does the code have?"
      ],
      answer: "The tool schema is a hand-written dictionary that still has the old enum list, and the model has the new one. There are two sources. Fix: build the tool from TriageResult with build_triage_tool, delete the hand-written schema, and add a test that compares the enum of the tool with the values of the Category enum." },
    { id: "l2-5-dbg-3", title: "Some responses have no triage result",
      symptom: "With strict tool use, about one message in thirty gives \"no result\". The log shows no validation error.",
      evidence: "stop_reason=end_turn  content=[text: \"Could you tell me which building you are in?\"]  tool_use blocks: 0",
      hints: [
        "Which tool_choice does the request use?",
        "Does strict tool use make the model call the tool?"
      ],
      answer: "With tool_choice auto, the model decides whether it calls the tool. Here it asked a question in text. Strict guarantees the shape of the input only when there is a call. Fix: count a response with no tool_use block as invalid, retry one time with a user turn that says \"Call the record_triage tool with your result.\", make the instruction in the system prompt clear, and count these cases in the comparison script." }
  ],

  recall: [
    { id: "l2-5-r1", q: "What is a tool definition, and what comes back when the model uses the tool?", a: "A name, a description and an input_schema (a JSON Schema), optionally with \"strict\": true. The response has stop_reason \"tool_use\" and a tool_use block with an id, the name and an input object." },
    { id: "l2-5-r2", q: "What does \"strict\": true guarantee, and what does it not guarantee?", a: "The tool input follows input_schema, and the tool name is valid. It does not guarantee that the model calls the tool (with auto), that the values are correct, or a result after a refusal or a max_tokens stop." },
    { id: "l2-5-r3", q: "Which models accept tool_choice any or tool?", a: "Claude Haiku 5.5 accepts them, and then the model does not think before the call. Claude Opus 5.5 and Sonnet 5.5 return error 400. Use auto with strict, or structured outputs." },
    { id: "l2-5-r4", q: "Why build the tool definition from the Pydantic model?", a: "One source for the schema. The same model makes the schema and validates the result, so they cannot disagree when a field changes." },
    { id: "l2-5-r5", q: "How do you use structured outputs from Python?", a: "client.messages.parse(..., output_format=TriageResult) and read response.parsed_output. Without the helper: output_config={\"format\": {\"type\": \"json_schema\", \"schema\": ...}} with additionalProperties false on every object." },
    { id: "l2-5-r6", q: "Which JSON Schema features does the API not enforce?", a: "Recursive schemas, minimum, maximum, multipleOf, minLength, maxLength, array constraints beyond minItems 0 or 1, and additionalProperties other than false. Check them with Pydantic after the response." },
    { id: "l2-5-r7", q: "How does grammar-constrained sampling work?", a: "The API compiles the schema into a grammar. At each token, the sampler removes the tokens that cannot continue a valid output and picks from the rest. The first request with a new schema is slower; the grammar is cached for 24 hours from the last use." }
  ],

  interview: [
    { q: "How do you get reliable structured output from an LLM API?",
      outline: "Define the result once (Pydantic or Zod). Send the schema to the API with enforcement: strict tool use or structured outputs. Read the result by block type, check stop_reason (refusal, max_tokens), and validate with the same model. Keep a small retry for a missing tool call. Measure invalid outputs, retries and accuracy on a labeled set. Enforcement fixes the shape, not the values." },
    { q: "When do you use a tool as the output format, and when structured outputs?",
      outline: "Structured outputs when the answer is always one JSON object. A tool when the output is one of several actions, or when the request also has real tools. On models without a forced tool_choice, a tool with auto can be skipped, so structured outputs gives the stronger guarantee for a fixed shape." },
    { q: "Your schema has constraints such as a minimum and a maximum length. What do you do?",
      outline: "The API does not enforce numerical or string constraints, and a schema with them returns error 400. Send a schema without them (the SDK helpers do this and put the constraint in the description), and check them in your code after the response. Treat a failed check like any validation error." },
    { q: "Enforcement removed all format errors, but the users still complain about the triage. Why, and what do you do?",
      outline: "The shape is valid, but the values are wrong: wrong category, wrong priority, a weak summary. Measure accuracy on a labeled set, look at the confusion between categories, improve the descriptions of the fields and the examples in the prompt, and consider a needs_human path for unclear messages. Track the accuracy as a regression test." },
    { q: "What does enforcement cost?",
      outline: "Input tokens: the tool use system prompt (286 tokens on the current Claude models with auto) and the schema. Latency on the first request with a new schema (grammar compilation; cached for 24 hours from the last use). It can save retries: compare the extra cost per request with the retry rate times the retry cost. In the lesson example, the break-even is 21% retries." }
  ],

  misconceptions: [
    { wrong: "With strict tool use, the triage result is always correct.", right: "The shape is correct. The values can still be wrong, so measure accuracy on labeled messages." },
    { wrong: "With enforcement, I can delete the validation code.", right: "Keep it. It catches refusals, max_tokens stops, missing tool calls, capitalization and constraints that the API does not enforce." },
    { wrong: "tool_choice {\"type\": \"tool\"} works on every model.", right: "Claude Opus 5.5 and Sonnet 5.5 return error 400 for any and tool. Use auto with strict, or structured outputs." },
    { wrong: "Strict tool use makes the model call the tool.", right: "With auto, the model decides. strict controls the shape of the input when there is a call." },
    { wrong: "I can put any JSON Schema keyword in the schema.", right: "Some keywords are not supported (minimum, maxLength, recursion and more). The API returns error 400 for them." },
    { wrong: "A hand-written schema next to the Pydantic model is fine.", right: "Two sources disagree after the first change. Build the schema from the model with one function and test it." },
    { wrong: "Enforcement is free.", right: "It adds input tokens (the tool use system prompt and the schema) and a slower first request for a new schema. It can save retries. Measure both." }
  ],

  resources: [
    { title: "Define tools", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools",
      when: "Read after level 1, before level 2.",
      why: "The fields of a tool definition, how to write a good description, and the table of tool_choice options per model.",
      watchFor: [
        "What does the page say about the length of a tool description?",
        "Which models reject tool_choice any and tool, and what does the page say to use in place of them?",
        "What happens to the text before the tool call when you force a tool?"
      ] },
    { title: "Strict tool use", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use",
      when: "Read with level 2.",
      why: "Where to put \"strict\": true, what it guarantees, and an example of the errors that it prevents.",
      watchFor: [
        "Which two things does the page say strict tool use guarantees?",
        "Which errors in a tool input does the page show for a request without strict?"
      ] },
    { title: "Structured outputs", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/structured-outputs",
      when: "Read with level 2 and again with level 3.",
      why: "output_config.format, the SDK helpers for Pydantic and Zod, the supported JSON Schema features, and the limits: refusal, max_tokens and grammar caching.",
      watchFor: [
        "Which JSON Schema features are not supported, and what do the SDK helpers do with them?",
        "What does the page say about refusals and about stops at max_tokens?",
        "How long does the API cache a compiled grammar?"
      ] },
    { title: "Tool use with Claude", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview",
      when: "Optional, after level 2. Read the pricing section.",
      why: "How tool use is billed: the tool use system prompt for each model and tool_choice, and the tool definitions as input tokens.",
      watchFor: [
        "How many system prompt tokens does tool use add on your model with auto?",
        "Which parts of a tool request count as input tokens?"
      ] },
    { title: "JSON Schema", by: "Pydantic (docs)", kind: "Docs", url: "https://pydantic.dev/docs/validation/latest/concepts/json_schema/",
      when: "Read with level 2, before milestone 1 of the ticket.",
      why: "What model_json_schema writes for each field type, how enums go into $defs, and the validation and serialization modes.",
      watchFor: [
        "Where does an Enum field go in the schema, and how does the property refer to it?",
        "Which fields are in the required list in the examples?"
      ] }
  ],

  summary: `
    <ul>
      <li>A tool definition has a name, a description and an input_schema. The model returns a tool_use block with an input object.</li>
      <li>Here the tool is only a form for the output: the input is the triage result, and the code runs nothing.</li>
      <li>"strict": true makes the tool input follow the schema. Structured outputs (output_config.format) does the same for the answer text.</li>
      <li>Opus 5.5 and Sonnet 5.5 reject a forced tool_choice. Use auto with strict and check that a tool_use block came back, or use structured outputs.</li>
      <li>Build the tool from the Pydantic model with one function, set additionalProperties false, and validate the input with the same model.</li>
      <li>Enforcement is grammar-constrained sampling. It fixes the shape, not the values, and not refusals, max_tokens stops or missing calls.</li>
      <li>Measure invalid outputs, retries and accuracy of each method on the labeled sample set.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer how strict tool use makes the triage output follow the schema, and why the code still validates the result. Use the numbers of the lesson: 286 extra input tokens, $1.144 per 1,000 requests on Opus 5.5, and the 21% retry rate where the two methods cost the same. Then name four failures that enforcement does not remove. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-014"]
};

/* ====================================================================== T-014 */
window.ACADEMY.tickets["T-014"] = {
  id: "T-014",
  title: "Schema-enforced triage with one source for the schema",
  lesson: "2.5",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. Milestone 4 makes 40 to 120 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Make the API enforce the triage schema. Add a fifth mode, <code>tool</code>, to the triage CLI. Build the tool definition from the <code>TriageResult</code> model of T-013 with one function, send it with <code>"strict": true</code>, find the tool call by block type and validate its input with the same model.
      Then run the labeled sample set in the <code>json</code> mode of T-013 and in the <code>tool</code> mode, and compare the valid replies, the retries, the accuracy and the cost.</p>
      <p><strong>Real-world problem.</strong> Teams that parse JSON from a prompt spend tokens and time on retries, and they keep two descriptions of the result that drift apart.
      Teams that turn on enforcement often delete their validation and then miss refusals, missing tool calls and wrong values. This ticket gives the assistant enforcement with one source for the schema, keeps the validation, and measures what changed.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". It continues the helpdesk triage of topic 2. All work stays in the CLI. The FastAPI service starts in topic 3.</p>
      <p>This ticket builds on these earlier tickets:</p>
      <ul>
        <li>T-001: the client in <code>assistant/llm.py</code> (the only module that calls the API), the price table in <code>assistant/pricing.py</code>, the measurement line and the fake client of the tests.</li>
        <li>T-009: <code>check_answer(stop_reason, blocks)</code> in <code>assistant/thinking.py</code>, with the statuses <code>ok</code>, <code>incomplete</code>, <code>no_answer</code> and <code>refusal</code>.</li>
        <li>T-010: the call function of <code>llm.py</code> has the optional <code>messages</code> parameter.</li>
        <li>T-011: <code>assistant/triage.py</code> with <code>CATEGORIES</code>, <code>PRIORITIES</code>, <code>Label</code> and <code>build_request</code>, the examples in <code>samples/triage_examples.jsonl</code>, the sample set in <code>samples/helpdesk.jsonl</code> and <code>scripts/triage_eval.py</code>.</li>
        <li>T-012: the <code>--mode</code> option, <code>RULES</code> and <code>LABEL_FORMAT</code> in <code>triage.py</code>, and the <code>--modes</code> option of <code>scripts/triage_eval.py</code>.</li>
        <li>T-013: <code>assistant/structured.py</code> with <code>TriageResult</code>, <code>TriageError</code>, <code>retry_message</code> and <code>triage_with_retry</code>; the <code>json</code> mode with <code>--max-retries</code> and <code>--print-json</code>; the measurement fields <code>retries</code> and <code>valid</code>; and <code>tests/fixtures/triage_replies.json</code>.</li>
      </ul>
      <p>This ticket adds a fifth mode, <code>tool</code>. The default mode stays <code>labels</code>, so the earlier modes and their tests do not change.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 2.5, levels 1 and 2 complete. Level 3 helps for milestone 4 and the questions.</li>
        <li>T-001, T-009, T-010, T-011, T-012 and T-013 done, and their tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestones 1 and 4 only.</li>
        <li>No new package. Use the <code>anthropic</code> SDK, <code>pydantic</code> and pytest from the earlier tickets.</li>
        <li>Read the docs pages "Define tools", "Strict tool use" and "Structured outputs" (links in the lesson resources), and the section "Handling errors with is_error" of the page "Handle tool calls".</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.triage --mode tool "message text"</code> uses strict tool use. It prints the four fields of the validated result, one on each line, as the <code>json</code> mode does. <code>--print-json</code> and <code>--max-retries N</code> work as in T-013.</li>
        <li>In the tool mode, the measurement line has the fields of T-013 with <code>mode=tool</code>. The token and cost fields show the sum over all calls of the triage. Example: <code>mode=tool answer=ok retries=0 valid=yes</code>.</li>
        <li>When a reply has no <code>record_triage</code> tool call, or the tool input fails validation, the code counts the reply as invalid and retries with the limit of T-013 (default 2).</li>
        <li>When <code>stop_reason</code> is <code>refusal</code> or <code>max_tokens</code>, the code does not retry. The CLI prints one line that names the status (<code>refusal</code> or <code>incomplete</code>, the names of T-009), prints the measurement line, and exits with a code that is not 0. It prints no stack trace.</li>
        <li><code>python scripts/triage_eval.py --modes json,tool</code> runs every message of <code>samples/helpdesk.jsonl</code> in both modes on <code>claude-haiku-5-5</code>. The tool row has the same columns as the json row of T-013. In the tool mode, "valid at once" counts the first replies with a valid tool call. A failed triage counts as a wrong answer.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>A new pure module <code>assistant/schema_tool.py</code> holds <code>TOOL_NAME</code>, <code>TOOL_DESCRIPTION</code>, <code>close_objects</code>, <code>build_schema</code>, <code>build_tool</code>, <code>build_triage_tool</code>, <code>find_tool_use</code>, <code>tool_retry_turn</code> and <code>triage_with_tool</code>. It does not import the SDK, makes no network call and prints nothing.</li>
        <li>The tool definition comes only from <code>build_triage_tool()</code>. No file contains a hand-written copy of the schema.</li>
        <li><code>build_schema</code> starts from a copy of <code>TriageResult.model_json_schema()</code> and sets <code>"additionalProperties": false</code> on the root object and on each object in <code>$defs</code>. The tool has <code>"strict": true</code> at the top level.</li>
        <li>The request uses <code>tool_choice={"type": "auto"}</code>. Never send <code>{"type": "any"}</code> or <code>{"type": "tool"}</code>: the default model <code>claude-opus-5-5</code> rejects them with error 400.</li>
        <li>The system prompt of the tool mode is <code>RULES</code> of T-012, then one line that tells the model to call <code>record_triage</code>, then the 3 examples of T-011 in <code>&lt;example&gt;</code> tags inside <code>&lt;examples&gt;</code> tags. Each example has the message in <code>&lt;message&gt;</code> tags and the <code>model_dump_json()</code> text of its <code>TriageResult</code>. The prompt does not contain <code>LABEL_FORMAT</code> or the schema text: the tool carries the schema. The messages list has one user turn, the new message in <code>&lt;message&gt;</code> tags. An example assistant turn with text would teach a text reply.</li>
        <li><code>find_tool_use(blocks, name)</code> returns the first <code>tool_use</code> block with that name, or <code>None</code>. It never reads a block by its position.</li>
        <li><code>triage_with_tool(send, messages, max_retries=2)</code> has the contract of <code>triage_with_retry</code> of T-013: it returns the result and the list of responses, makes at most <code>max_retries + 1</code> calls, and does not change the list that the caller passed in.</li>
        <li>For each response, it checks <code>stop_reason</code> first. <code>refusal</code> and <code>max_tokens</code> raise <code>TriageError</code> at once with the status <code>refusal</code> or <code>incomplete</code>. Do not use <code>check_answer</code> here: it reads only the text blocks, and the result is in a <code>tool_use</code> block.</li>
        <li>It validates the tool input with <code>TriageResult.model_validate</code>, the same model as the json mode. For a retry, it adds the response content unchanged as an assistant turn, then the user turn from <code>tool_retry_turn(block, error)</code>.</li>
        <li><code>tool_retry_turn</code> gives one of two user turns. After a tool call that fails validation, the first block is <code>{"type": "tool_result", "tool_use_id": block.id, "is_error": true, "content": retry_message(error)}</code>: a user turn with text only after a <code>tool_use</code> block gives error 400. After a reply with no tool call, the turn is the text "Call the record_triage tool with your result."</li>
        <li>The call function of <code>llm.py</code> gets the optional parameters <code>tools</code> and <code>tool_choice</code>. Without them, the request is the same as before. <code>llm.py</code> stays the only module that calls the API. The cost comes from <code>usage.input_tokens</code> and <code>usage.output_tokens</code> with the T-001 price table.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given <code>build_triage_tool()</code>, the result has the keys <code>name</code>, <code>description</code>, <code>input_schema</code> and <code>strict</code>; <code>strict</code> is <code>True</code>; the name matches <code>^[a-zA-Z0-9_-]{1,128}$</code>; and every object in the schema (the root and each object in <code>$defs</code>) has <code>additionalProperties</code> <code>false</code>.</li>
        <li>Given the schema of the tool, its <code>required</code> list has the four fields of <code>TriageResult</code>, and the enum values of <code>category</code> and <code>priority</code> are equal to <code>CATEGORIES</code> and <code>PRIORITIES</code> of T-011, in the same order and case.</li>
        <li>Given a fake response with the content [text block, <code>tool_use</code> block with a valid input], <code>triage_with_tool</code> returns the result after 1 call. With the CLI, the measurement line shows <code>mode=tool answer=ok retries=0 valid=yes</code>.</li>
        <li>Given the fake replies [text block only, valid tool call], it returns the result after 2 calls. The second request has 3 messages: the first user turn, the first reply content unchanged, and a user turn with text that names <code>record_triage</code>.</li>
        <li>Given the fake replies [tool call with the input of the <code>type</code> reply of <code>tests/fixtures/triage_replies.json</code>, valid tool call], it returns the result after 2 calls. The third message of the second request is a user turn whose first block is a <code>tool_result</code> with the same <code>tool_use_id</code>, <code>is_error</code> true, and content that contains <code>needs_human</code>.</li>
        <li>Given three invalid tool calls and <code>max_retries=2</code>, it raises <code>TriageError</code> after exactly 3 calls. The error text says "after 2 retries".</li>
        <li>Given a fake response with <code>stop_reason="refusal"</code>, it raises <code>TriageError</code> after exactly 1 call, and the CLI prints the refusal line with no stack trace. With <code>"max_tokens"</code>, the status is <code>incomplete</code>, also after 1 call.</li>
        <li>Given <code>--mode tool</code>, the request has <code>tool_choice={"type": "auto"}</code>, one tool with <code>"strict": true</code>, a system prompt that contains <code>RULES</code> and <code>record_triage</code> and does not contain <code>LABEL_FORMAT</code>, and one user turn. The other modes send the same requests as before, and the tests of T-001 and T-009 to T-013 pass without a change.</li>
        <li>Given 986 input and 90 output tokens at the Opus 5.5 prices of the T-001 table ($4 and $20 per million), the cost is 0.005744 (tolerance 1e-9). This is the enforced request of the lesson example.</li>
        <li>With a real key, <code>scripts/triage_eval.py --modes json,tool</code> runs one time on <code>claude-haiku-5-5</code>. The handoff records the two rows.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Look at the schema and one real response (guided).</strong> In a scratch script, print <code>TriageResult.model_json_schema()</code> and find the <code>enum</code> lists, <code>required</code>, <code>additionalProperties</code> and the <code>title</code> keys.
        Then send one request with <code>build_triage_tool()</code> to <code>claude-haiku-5-5</code>. Print the type of each block, <code>stop_reason</code> and <code>usage</code>. If the API returns error 400, read the message and fix the builder (for example, a keyword that the API does not support). Do not keep this script.</li>
        <li><strong>The builder (guided).</strong> Write the tests for criteria 1 and 2 first. Then write the builder functions of <code>schema_tool.py</code>.</li>
        <li><strong>The tool mode (independent).</strong> Write the tests for criteria 3 to 9 with the fake client. Then write <code>find_tool_use</code>, <code>tool_retry_turn</code>, <code>triage_with_tool</code>, the system prompt of the tool mode, the two parameters of <code>llm.py</code> and the <code>tool</code> mode of the CLI.</li>
        <li><strong>The comparison and the handoff (independent).</strong> Add the tool mode to <code>scripts/triage_eval.py</code>. Run <code>--modes json,tool</code> one time. Fill in <code>handoffs/T-014-handoff.md</code> with the two rows and your answers to the questions, and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost of milestone 4: 20 messages × 2 modes = 40 calls, and at most 120 calls if every message needs two retries. If each call uses 1,000 input and 150 output tokens, the cost at the Haiku 5.5 prices of the T-001 table is 40 × (1,000 × $0.10 + 150 × $0.50) / 1,000,000 = about $0.007, and about $0.021 for 120 calls. The script prints the real total.</p>
      <p class="muted">Stretch, optional: add a mode <code>output</code>, which sends <code>output_config={"format": {"type": "json_schema", "schema": build_schema(TriageResult)}}</code> and validates the text with <code>TriageResult.model_validate_json</code>. Add it as a third row of the eval.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                   # from T-001 and T-010: the optional tools and tool_choice
    pricing.py               # from T-001 (no change)
    thinking.py              # from T-009 (no change)
    structured.py            # from T-013 (no change): TriageResult, TriageError, retry_message
    schema_tool.py           # TOOL_NAME, TOOL_DESCRIPTION, close_objects, build_schema, build_tool,
                             # build_triage_tool, find_tool_use, tool_retry_turn, triage_with_tool
    triage.py                # from T-011 to T-013: --mode tool and its system prompt
  samples/
    helpdesk.jsonl           # from T-011 (no change)
    triage_examples.jsonl    # from T-013 (no change)
  scripts/
    triage_eval.py           # from T-011 to T-013: the tool mode
  tests/
    fixtures/
      triage_replies.json    # from T-013 (no change)
    test_schema_tool.py      # the builder: strict, names, additionalProperties, one source
    test_tool_mode.py        # the loop, the retry turns, the request and the CLI
  tickets/
    T-014.md                 # this ticket (generated)
  handoffs/
    T-014-handoff.md         # your handoff (template generated)</code></pre>
      <p>The fake responses of the tests need only the fields that the code reads. Example of a fake <code>tool_use</code> block, as a small object:</p>
      <pre><code>{"type": "tool_use", "id": "toolu_test_1", "name": "record_triage",
 "input": {"category": "IT", "priority": "medium",
           "summary": "The laptop does not connect to the VPN.", "needs_human": false}}</code></pre>
      <p>For criterion 5, use <code>json.loads</code> on the <code>reply</code> text of the <code>type</code> fixture as the tool input. Do not change <code>structured.py</code>, <code>pricing.py</code> or <code>samples/helpdesk.jsonl</code> for this ticket.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_tool_is_strict_and_has_a_valid_name</code></td><td><code>build_triage_tool()</code></td><td><code>strict</code> is <code>True</code>; the name matches the regex</td></tr>
        <tr><td><code>test_every_object_in_the_schema_forbids_extra_fields</code></td><td>The tool schema</td><td>The root and each object in <code>$defs</code> have <code>additionalProperties</code> <code>false</code></td></tr>
        <tr><td><code>test_schema_values_are_the_t011_labels</code></td><td>The tool schema</td><td>The four required fields; the enum values equal <code>CATEGORIES</code> and <code>PRIORITIES</code></td></tr>
        <tr><td><code>test_builder_does_not_change_the_model_schema</code></td><td>Two calls of <code>build_triage_tool()</code></td><td>Equal results; <code>model_json_schema()</code> unchanged</td></tr>
        <tr><td><code>test_tool_call_is_found_by_type_not_position</code></td><td>[text, tool_use] and [tool_use]</td><td>The same block for both</td></tr>
        <tr><td><code>test_valid_tool_call_makes_one_call</code></td><td>[text, valid tool_use]</td><td>1 call, 0 retries, <code>valid=yes</code></td></tr>
        <tr><td><code>test_missing_tool_call_is_retried_with_a_reminder</code></td><td>[text only], then [valid tool_use]</td><td>2 calls; the last user turn names the tool</td></tr>
        <tr><td><code>test_invalid_tool_input_is_retried_with_a_tool_result</code></td><td>[tool_use with the <code>type</code> fixture input], then valid</td><td>2 calls; a <code>tool_result</code> with the same id, <code>is_error</code> true, first in the user turn</td></tr>
        <tr><td><code>test_loop_stops_after_the_last_retry</code></td><td>3 invalid tool calls, <code>max_retries=2</code></td><td><code>TriageError</code> after 3 calls</td></tr>
        <tr><td><code>test_refusal_is_not_retried</code></td><td><code>stop_reason="refusal"</code></td><td>Status <code>refusal</code>, <code>TriageError</code> after 1 call</td></tr>
        <tr><td><code>test_max_tokens_stop_is_not_retried</code></td><td><code>stop_reason="max_tokens"</code></td><td>Status <code>incomplete</code>, <code>TriageError</code> after 1 call</td></tr>
        <tr><td><code>test_request_never_forces_the_tool</code></td><td><code>--mode tool</code></td><td><code>tool_choice={"type": "auto"}</code></td></tr>
        <tr><td><code>test_tool_prompt_has_rules_and_examples_and_no_label_format</code></td><td>The system prompt of the tool mode</td><td>Contains <code>RULES</code>, <code>record_triage</code> and 3 examples; not <code>LABEL_FORMAT</code></td></tr>
        <tr><td><code>test_caller_message_list_is_not_changed</code></td><td>[text only], then valid</td><td>The list that the test passed in still has 1 message</td></tr>
        <tr><td><code>test_enforced_request_cost_matches_lesson_example</code></td><td>986 in, 90 out, Opus 5.5 prices</td><td>0.005744</td></tr>
        <tr><td><code>test_cli_failure_has_no_stack_trace</code></td><td>3 invalid tool calls</td><td>One error line, measurement line with <code>valid=no</code>, exit code not 0</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table. Build the fake blocks as small objects with a <code>type</code> field. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests and for the eval run. The retry limit caps the calls for each message at 3. The script prints its total cost. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> never show a refusal, a <code>max_tokens</code> stop or a missing tool call as a triage result. Every such case is visible in the measurement line or the eval row.</li>
        <li><strong>Latency:</strong> the first request with a new schema is slower, because the API compiles the grammar. Record the time of the first call and of a later call in the handoff.</li>
        <li><strong>Security:</strong> the key comes only from the environment. The API caches the schema for up to 24 hours, so put no personal data in property names, enum values or the tool description.</li>
      </ul>`,
    questions: `
      <ol>
        <li>In milestone 1, which keys did <code>model_json_schema()</code> write that you did not expect? Did the API accept the schema on the first try?</li>
        <li>Give your two eval rows. Which errors did the tool mode remove? Which errors did it not remove?</li>
        <li>Compare the accuracy of the two modes. Did enforcement change it? Why can the accuracy stay the same when every reply is valid?</li>
        <li>Use your numbers: the mean input tokens of each mode, and the retries of the json mode. Which mode costs less per correct answer?</li>
        <li>Your default model rejects a forced tool. Which other way gives a fixed JSON shape, and when would you use it?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, two measurement lines, the two eval rows).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001 and T-009 to T-013 did not change.</li>
        <li>No file holds a hand-written copy of the schema.</li>
        <li>You can explain each line of <code>schema_tool.py</code> without notes, why <code>find_tool_use</code> never reads a block by its position, and why a retry after a tool call starts with a <code>tool_result</code>.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the schema has one source; the tool is strict and every object forbids extra fields; the request never forces the tool on the default model;
      the tool call is found by block type and validated with the same model; a retry after a tool call starts with a <code>tool_result</code>; refusal and max_tokens are reported and not retried; the tests are named after properties and run with the network off; and how well your answers use your own measurements.</p>`
  }
};
