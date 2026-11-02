/*
 * Lesson 2.3 - Chain of thought: reason before you answer.
 * Ticket T-012 - A "reason first" mode for the helpdesk triage.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Haiku 5.5 $0.10 in / $0.50 out (Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10).
 * Example token counts (made up for teaching, the same as the interactive in 12-ix.js):
 *   direct mode: 1,180 input, 48 output   -> $0.000118 + $0.000024 = $0.000142 per message.
 *   reason mode: 1,240 input, 150 output  -> $0.000124 + $0.000075 = $0.000199 per message.
 *   Ratio 1.40. 2,000 messages a day: direct $0.284, reason $0.398 (difference $0.114).
 *   Made-up sample set of 20 messages: direct 16 correct, reason 18 correct.
 *     Set cost: direct $0.00284, reason $0.00398.
 *     Cost per correct answer: direct $0.0001775, reason $0.000221.
 *     Extra cost per extra correct answer: ($0.00398 - $0.00284) / 2 = $0.00057.
 *   Milestone 4 of T-012: 40 calls of about 1,300 input and 200 output tokens -> $0.0092.
 * Published numbers (with the source in the lesson text):
 *   Kojima et al. (2022), arXiv 2205.11916: "Let's think step by step" raised the accuracy of
 *   text-davinci-002 on MultiArith from 17.7% to 78.7% and on GSM8K from 10.4% to 40.7%.
 * The interactive for this lesson is in 12-ix.js (id "l2-3-cot").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["2.3"] = {
  id: "2.3",
  topic: "t2",
  title: "Chain of thought: reason before you answer",
  objective: "Explain why reasoning that the model writes before its answer can make the answer more accurate, add a reason-first mode with answer tags to a prompt, take out only the answer in code, compute what the mode costs, select the correct model setting for it, and decide with a sample set when the mode is worth its cost.",
  prerequisites: [
    "Lesson 1.1: the generation loop (one token at a time), output tokens and the cost formula.",
    "Lesson 1.9: thinking tokens, effort, and the cost per correct answer. This lesson links to it and does not repeat it.",
    "Lesson 2.2: the system prompt, few-shot examples and the labeled sample set of the helpdesk triage."
  ],
  covers: ["t2-system"],
  whyItMatters: `
    <p>Some requests are hard because the correct answer needs more than one step. A helpdesk message can name one team but need another team. It can have a deadline that changes the priority, and a second question in the last sentence.
    A model that writes the answer immediately can miss these points. A model that first writes its reasoning, and then the answer, often gets them right.</p>
    <p>For an application engineer, "ask for the reasoning first" is a prompt change of a few lines. But it has consequences in the code. The reasoning is text in the response, so your code must remove it before a user sees it. The response can come back in the wrong format.
    The reasoning costs output tokens and time on every request. And on the largest current models, a prompt that asks for a reasoning section can be declined, and you pay for the refusal.
    In an interview, "how do you make a model reason, and what does it cost you?" is a common question. A good answer names the two methods (prompted reasoning and thinking), the parsing rule, and a measurement.</p>`,
  concepts: [
    { id: "l2-3-c-order", name: "Reasoning before the answer: the answer tokens can use the reasoning tokens" },
    { id: "l2-3-c-prompted", name: "Prompted chain of thought: reasoning as visible text in the response" },
    { id: "l2-3-c-tags", name: "Answer tags and extraction: show only the answer, and treat a bad format as an error" },
    { id: "l2-3-c-thinking", name: "Prompted reasoning compared to thinking: where the reasoning goes, and what each model allows" },
    { id: "l2-3-c-cost", name: "The cost of the reasoning: output tokens and time" },
    { id: "l2-3-c-faithful", name: "The reasoning text is not a reliable record of how the model decided" },
    { id: "l2-3-c-measure", name: "When the mode is worth its cost: compare both modes on a sample set" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Show your work, then circle the answer",
      blocks: [
        { type: "html", html: `
          <p>Lesson 1.1 showed the loop: the model writes one token at a time, and each new token can use all the tokens before it. The order of the output is therefore important.</p>
          <ul>
            <li>If the first tokens of the output are the answer, the model selects the answer before it has written anything about the problem.</li>
            <li>If the model first writes its reasoning, the answer comes after the reasoning. The answer tokens can then use every step that the reasoning wrote.</li>
          </ul>
          <p>This is <strong>chain of thought</strong>: the model writes the steps before the answer. Lesson 1.9 showed one way to get it: <strong>thinking</strong>, where the model writes the steps in a separate block that the API controls.
          This lesson shows the other way: you <strong>ask for the reasoning in the prompt</strong>, and the model writes it as normal text in its response, before the answer. This is called <strong>prompted chain of thought</strong>.</p>
          <p>The prompt also tells the model where to put each part. The reasoning goes in <code>&lt;reasoning&gt;</code> tags, and the final answer goes in <code>&lt;answer&gt;</code> tags. Then your code can take out the answer and remove all the other text.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: show your work, then circle the answer", html: `
          <p>In a school exam, the teacher says: "Show your work, then circle the answer." You write the steps on the page. Then you circle the final result. The person who grades the exam reads only the circled answer.</p>
          <ul>
            <li><strong>The work on the page is the reasoning.</strong> You write it first, so the circled answer can use it.</li>
            <li><strong>The circle is the answer tags.</strong> The grader (your code) reads only what is inside them.</li>
            <li><strong>No circle, or two circles, is a problem.</strong> The grader cannot know which answer you mean. Your code must treat this as an error, and not guess.</li>
          </ul>` },
        { type: "diagram", caption: "Two responses to the same helpdesk message. In the direct mode, the answer comes first. In the reason-first mode, the reasoning comes first, and the answer can use it. The code shows the employee only the text inside the answer tags.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Top row: the prompt goes to the model, and the model writes only an answer in answer tags: facilities, medium. Bottom row: the prompt goes to the model, and the model writes reasoning in reasoning tags, then an answer in answer tags: IT, high. An arrow from the reasoning to the answer shows that the answer reads the reasoning. A bracket below the two answers says that the code shows only this part to the employee.">
            <defs><marker id="l23a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <text x="14" y="22" class="d-small">Direct mode</text>
            <rect x="14" y="32" width="120" height="50" rx="8" class="d-box"/><text x="74" y="62" text-anchor="middle" class="d-bold">Prompt</text>
            <line x1="134" y1="57" x2="456" y2="57" class="d-line" marker-end="url(#l23a1)"/>
            <rect x="458" y="32" width="168" height="50" rx="8" class="d-box-info"/><text x="542" y="53" text-anchor="middle" class="d-bold">&lt;answer&gt;</text><text x="542" y="71" text-anchor="middle" class="d-small">facilities, medium</text>
            <text x="14" y="112" class="d-small">Reason-first mode</text>
            <rect x="14" y="122" width="120" height="50" rx="8" class="d-box"/><text x="74" y="152" text-anchor="middle" class="d-bold">Prompt</text>
            <line x1="134" y1="147" x2="168" y2="147" class="d-line" marker-end="url(#l23a1)"/>
            <rect x="170" y="122" width="250" height="50" rx="8" class="d-box"/><text x="295" y="143" text-anchor="middle" class="d-bold">&lt;reasoning&gt;</text><text x="295" y="161" text-anchor="middle" class="d-small">access group = IT, audit Friday</text>
            <line x1="420" y1="147" x2="456" y2="147" class="d-line-accent" marker-end="url(#l23a1)"/>
            <rect x="458" y="122" width="168" height="50" rx="8" class="d-box-good"/><text x="542" y="143" text-anchor="middle" class="d-bold">&lt;answer&gt;</text><text x="542" y="161" text-anchor="middle" class="d-small">IT, high</text>
            <path d="M458,186 L458,196 L626,196 L626,186" class="d-line-accent" fill="none"/>
            <text x="542" y="214" text-anchor="middle" class="d-small">the employee sees only this</text>
            <text x="295" y="196" text-anchor="middle" class="d-small">the code removes this text</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The work on the page is not a true record.</strong> In an exam, your work shows how you got the answer. The reasoning of a model can leave out the real cause of its answer (level 3). Do not show it to a user as the reason.</li>
            <li><strong>Each line of work costs money.</strong> The reasoning is output text. You pay for each token at the output price.</li>
            <li><strong>Easy questions do not need it.</strong> "Reset my password" is IT on the first token. Reasoning adds cost and time there, and no accuracy.</li>
          </ul>` },
        { type: "interactive", id: "l2-3-cot" },
        { type: "html", html: `
          <h3>What the reason-first mode costs</h3>
          <ol>
            <li><strong>Output tokens.</strong> In the interactive, the reasoning raises the output from 48 to 150 tokens. On Haiku 5.5, output costs 5 times input. So one message costs $0.000199 in place of $0.000142, 1.40 times more.</li>
            <li><strong>Time.</strong> The model writes the reasoning one token at a time, before the answer. The employee waits for all of it, also when your code then removes it.</li>
            <li><strong>A format that can fail.</strong> The response is now text with parts. Sometimes the tags are missing, or there are two answers. Your code must find these cases and handle them as errors.</li>
          </ol>
          <p>So the question is not "does reasoning help?". The question is "for this kind of message, does the extra accuracy pay for the extra cost?". Level 3 shows how to answer it with a sample set.</p>` }
      ],
      checks: [
        { id: "l2-3-L1-a", type: "mcq",
          q: "Why can reasoning that comes before the answer make the answer more accurate?",
          options: [
            "The reasoning makes the model use a larger set of weights.",
            "The model writes one token at a time. When the reasoning comes first, the answer tokens can use the steps that the reasoning wrote.",
            "The reasoning tells the server to check the answer against a database.",
            "The answer tags make the model more careful."
          ],
          correct: 1,
          explain: "Each new token can use all the tokens before it. When the reasoning comes first, the answer can use the intermediate steps. When the answer comes first, the model selects it before any step is written. The weights and the model stay the same." },
        { id: "l2-3-L1-b", type: "mcq",
          q: "The response is <reasoning>…</reasoning> followed by <answer>category: IT</answer>. What must the employee see?",
          options: [
            "The full response, so that the employee can check the reasoning.",
            "The reasoning only, because it explains the decision.",
            "Only the text inside the answer tags: category: IT.",
            "Nothing. The code must ask the model again without reasoning."
          ],
          correct: 2,
          explain: "The code takes out the text inside the one pair of answer tags and shows only that. The reasoning is a working step. It is not a reliable explanation, and it can contain details that the employee does not need to see." },
        { id: "l2-3-L1-c", type: "recall",
          q: "Name the three costs of the reason-first mode.",
          answer: "Output tokens: the reasoning is output text and is billed at the output price. Time: the model writes the reasoning before the answer, so the answer comes later. Format risk: the response can have no answer tags or two answer sections, and the code must handle this as an error." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Ask for the reasoning, take out the answer, and use the correct model setting",
      blocks: [
        { type: "html", html: `
          <h3>The prompt</h3>
          <p>Start from the triage prompt of lesson 2.2. Its last lines give the output format: two lines, category and priority. Both modes of this lesson put these two lines inside answer tags. The direct mode stops there. The reason-first mode adds one paragraph to the system prompt. The rest of the prompt, the examples and the user message stay the same, so you compare only one change.</p>
          <p>The examples must show the same format as the instruction. In both modes, each assistant turn of the examples puts its two label lines inside answer tags.</p>` },
        { type: "code", lang: "python", code:
`# RULES: the role, the task and the rules of the lesson 2.2 prompt.
# LABEL_FORMAT: its two format lines, "category: <one of ...>" and
# "priority: <one of ...>".
ANSWER_INSTRUCTION = (
    "Write the two label lines inside <answer></answer> tags, "
    "in this format:"
)
REASON_INSTRUCTION = (
    "Before the answer, think through the message inside "
    "<reasoning></reasoning> tags: which team owns the cause, "
    "how urgent the message is, and whether it asks more than "
    "one thing. Then write the answer."
)

def system_prompt(rules: str, label_format: str, reason: bool) -> str:
    parts = [rules, ANSWER_INSTRUCTION + "\\n" + label_format]
    if reason:
        parts.append(REASON_INSTRUCTION)
    return "\\n\\n".join(parts)` },
        { type: "code", lang: "python", code:
`import anthropic

# The client reads ANTHROPIC_API_KEY from the environment.
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=1024,
    system=system_prompt(RULES, LABEL_FORMAT, reason=True),
    # Haiku 5.5 thinks by default when the request has no thinking field.
    # Turn thinking off, so the only reasoning is the prompted text.
    # Haiku 5.5 accepts this at effort low, medium or high only.
    thinking={"type": "disabled"},
    # The example turns of lesson 2.2 come first. This sample sends
    # only the new message, in <message> tags.
    messages=[{"role": "user",
               "content": f"<message>{message_text}</message>"}],
)` },
        { type: "html", html: `
          <h3>Take out the answer</h3>
          <p>Your code must never show the raw response text. It takes out the text inside the answer tags and checks the format. The rule is strict: <strong>exactly one</strong> answer section, and it must not be empty. A response with no answer section, or with two, is an error. The code does not guess which answer the model meant.</p>` },
        { type: "code", lang: "python", code:
`import re

ANSWER_RE = re.compile(r"<answer>(.*?)</answer>", re.DOTALL)

class AnswerFormatError(ValueError):
    """The response text has no single, non-empty answer section."""

def extract_answer(text: str) -> str:
    found = ANSWER_RE.findall(text)
    if len(found) != 1:
        raise AnswerFormatError(
            f"expected 1 answer section, found {len(found)}")
    answer = found[0].strip()
    if not answer:
        raise AnswerFormatError("the answer section is empty")
    return answer` },
        { type: "html", html: `
          <p>Use the steps of lesson 1.9 first, then the new step:</p>
          <ol>
            <li><strong>Check <code>stop_reason</code>.</strong> <code>"refusal"</code> and <code>"max_tokens"</code> are not answers. Report them, and do not parse the text. (Ticket T-009 gives you <code>check_answer</code> for this.)</li>
            <li><strong>Join the text blocks by type.</strong> Never read <code>content[0].text</code>.</li>
            <li><strong>Call <code>extract_answer</code></strong> on the joined text. Then parse the answer lines with the parser of lesson 2.2.</li>
            <li><strong>On an error, fail clearly.</strong> Show the employee a neutral message, for example "We could not classify your message. It is in the helpdesk queue." Log the error type and the request id, not the raw text.</li>
          </ol>` },
        { type: "note", kind: "fact", title: "Prompted reasoning or thinking: what the current models allow", html: `
          <div class="table-wrap"><table>
            <tr><th>Model</th><th>Turn thinking off</th><th>A prompt that asks for a reasoning section</th></tr>
            <tr><td>Claude Opus 5.5</td><td>Not possible. <code>{"type": "disabled"}</code> returns error 400.</td><td>Can be declined. Use thinking and effort instead.</td></tr>
            <tr><td>Claude Sonnet 5.5</td><td>Not with <code>"disabled"</code> (error 400). <code>{"type": "between_tools"}</code> turns off up-front thinking at effort high or lower.</td><td>Can be declined. Use thinking and effort instead.</td></tr>
            <tr><td>Claude Haiku 5.5</td><td><code>{"type": "disabled"}</code>, at effort low, medium or high only.</td><td>The documented fallback when thinking is off: reasoning first, the answer in <code>&lt;answer&gt;</code> tags.</td></tr>
          </table></div>
          <ul>
            <li>The prompting guide says that a prompt that asks the model to write out its reasoning "may be declined" on Claude Fable 5.1, Fable 5, Opus 5.5, Opus 5 and Sonnet 5.5. Rely on thinking there.</li>
            <li>The refusal has <code>stop_reason: "refusal"</code> and the category <code>reasoning_extraction</code>. A common trigger is a <code>&lt;thinking&gt;</code>, <code>&lt;reasoning&gt;</code> or scratchpad section that the model fills in before it answers. The response has no content, and <strong>you pay for the request</strong>.</li>
            <li>You can still ask these models for a short explanation of the answer, or for the evidence behind it, after the answer.</li>
          </ul>
          <p class="muted">Source: Claude API docs, pages "Prompting best practices", "Refusals and fallback", "Thinking" and "Prompting Claude Haiku 5.5", read on 2026-11-02 (links in the resources). These rules can change with a new model. Check them before you rely on them.</p>` },
        { type: "html", html: `
          <h3>Prompted reasoning compared to thinking</h3>
          <div class="table-wrap"><table>
            <tr><th></th><th>Prompted reasoning (this lesson)</th><th>Thinking (lesson 1.9)</th></tr>
            <tr><td>Where it is</td><td>Text in the text block, inside tags that you selected</td><td>A separate thinking block</td></tr>
            <tr><td>What you see</td><td>All of it</td><td>A summary, or an empty field (the default on the current models)</td></tr>
            <tr><td>Billing</td><td>Output tokens</td><td>Output tokens, the same for every display setting</td></tr>
            <tr><td>How you keep it from the user</td><td>Your code takes out the answer tags</td><td>Your code reads only the blocks with type "text"</td></tr>
            <tr><td>Format risk</td><td>Tags can be missing or doubled</td><td>The block types are fixed by the API</td></tr>
            <tr><td>How you control the amount</td><td>Only with the prompt text</td><td>With effort and <code>max_tokens</code></td></tr>
          </table></div>
          <p>On the large current models, use thinking. Use prompted reasoning where thinking is off, for example on Haiku 5.5 when you need a short, cheap and predictable request. In both cases, measure the result.</p>` },
        { type: "worked", title: "Worked example: the cost of the reason-first mode",
          intro: "The hard message of the interactive on Claude Haiku 5.5: $0.10 per million input tokens and $0.50 per million output tokens (the price table of lesson 1.1). The token counts are example numbers. Measure your own with usage.",
          steps: [
            { html: "Direct mode, 1,180 input and 48 output tokens: 1,180 × $0.10 / 1,000,000 = $0.000118. 48 × $0.50 / 1,000,000 = $0.000024. Total <strong>$0.000142</strong>." },
            { html: "Reason-first mode, 1,240 input and 150 output tokens. The input is 60 tokens larger because of the extra prompt paragraph: $0.000124 + $0.000075 = <strong>$0.000199</strong>." },
            { html: "The ratio is $0.000199 / $0.000142 = <strong>1.40</strong>. Most of the difference comes from the output: the 102 extra output tokens cost $0.000051, and the 60 extra input tokens cost $0.000006." },
            { faded: true, html: "Your turn. The helpdesk gets 2,000 messages a day. Compute the daily cost of each mode and the difference.",
              answer: "Direct: 2,000 × $0.000142 = $0.284. Reason first: 2,000 × $0.000199 = $0.398. The difference is $0.114 a day. The interactive shows the same numbers. Level 3 compares this with the cost of a wrong route." }
          ] },
        { type: "worked", title: "Worked example: what the code does with each response",
          intro: "Four responses come back from the reason-first mode. Apply extract_answer to each one.",
          steps: [
            { html: "<code>&lt;reasoning&gt;…&lt;/reasoning&gt; &lt;answer&gt;category: IT …&lt;/answer&gt;</code>: one section. The employee sees <code>category: IT …</code> only." },
            { html: "<code>&lt;reasoning&gt;…&lt;/reasoning&gt;</code> and then <code>category: IT</code> with no answer tags: <code>AnswerFormatError</code>, found 0. The answer looks correct, but the code does not guess. It reports the error." },
            { html: "<code>stop_reason = \"max_tokens\"</code>, and the text stops inside the reasoning: the stop reason check comes first and reports an incomplete response. extract_answer does not run." },
            { faded: true, html: "Your turn. The reasoning says \"A badge problem is often facilities: &lt;answer&gt;facilities&lt;/answer&gt;. But the cause is the access group…\", and then the final &lt;answer&gt; says IT. What does extract_answer do, and why is that correct?",
              answer: "It raises AnswerFormatError: expected 1 answer section, found 2. The code cannot know which section is the final answer. A rule such as \"take the last one\" works here, but it can also show a draft answer as the result. Count these errors on the sample set. If they occur often, change the prompt (for example: \"use the answer tags only one time\"). Do not loosen the parser." }
          ] },
        { type: "note", kind: "warn", title: "Two traps on the current models", html: `
          <ul>
            <li><strong>No thinking field does not mean no thinking.</strong> On Haiku 5.5, a request without a thinking field uses adaptive thinking. The Haiku 5.5 prompting guide says that an instruction in the prompt to answer directly did not stop the thinking. So your "direct" mode can contain thinking tokens that you pay for. Send <code>thinking={"type": "disabled"}</code> in both modes, so that you compare only the prompted reasoning.</li>
            <li><strong>Do not prefill the answer tag.</strong> An old method put <code>&lt;answer&gt;</code> at the start of an assistant turn, so that the model continued from it. On the current models, a prefilled assistant turn returns error 400. Put the format rule in the system prompt, and check the result in code.</li>
          </ul>
          <p>Also, the Haiku 5.5 guide says that with thinking off, the model sometimes writes reasoning-like text in the reply. extract_answer removes all text outside the answer section, so this text never reaches the employee.</p>` }
      ],
      checks: [
        { id: "l2-3-L2-a", type: "mcq",
          q: "You add \"Write your reasoning in <reasoning> tags, then the answer in <answer> tags\" to a prompt on Claude Opus 5.5. What can happen?",
          options: [
            "Nothing special. Opus 5.5 always follows a format instruction.",
            "The request returns error 400 because the prompt contains tags.",
            "The model can decline the request: stop_reason \"refusal\" with the category reasoning_extraction, no content, and you pay for the request.",
            "The model puts the reasoning in a thinking block and leaves the answer tags out, at no cost."
          ],
          correct: 2,
          explain: "The docs list a reasoning section that the model fills in before it answers as a common trigger of the reasoning_extraction refusal on the large current models. The refusal is billed. On Opus 5.5, use thinking and effort instead, and ask for a short explanation after the answer if you need one." },
        { id: "l2-3-L2-b", type: "mcq",
          q: "The text of a response is: \"category: IT\\npriority: high\" with no tags. What does extract_answer do?",
          options: [
            "It returns the full text, because the content is correct.",
            "It raises AnswerFormatError: expected 1 answer section, found 0.",
            "It returns an empty string.",
            "It asks the model again."
          ],
          correct: 1,
          explain: "The rule is exactly one non-empty answer section. The code does not guess, also when the text looks correct. The caller decides what to do with the error: a neutral message to the employee, a log line, and maybe one retry (lesson 2.4 covers retries)." },
        { id: "l2-3-L2-c", type: "recall",
          q: "Give three differences between prompted reasoning and thinking.",
          answer: "1. Place: prompted reasoning is text in the text block, inside your tags; thinking is a separate thinking block. 2. Visibility: you see all of the prompted reasoning; you see a summary or nothing of the thinking. 3. How you keep it from the user: your code takes out the answer tags, compared to reading only the text blocks. Also: the tags can be missing (format risk), and effort controls thinking but not prompted reasoning. Both are billed as output tokens." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why it works, why the text is not the reason, and when to pay for it",
      blocks: [
        { type: "html", html: `
          <h3>Why reasoning first works</h3>
          <p>Lesson 1.9, level 3, gives the mechanism. Each token is one fixed pass through the model, so more tokens give more computation. The intermediate results stay in the context, and attention can read them at the next step. Prompted reasoning uses the same mechanism. The only difference is that you start it with the prompt, and the text is in the visible response.</p>
          <p>Two early results:</p>
          <ul>
            <li><strong>Few-shot chain of thought</strong> (Wei et al., 2022, in the resources of lesson 1.9): examples with written steps in the prompt made large models write steps too, and their results on math word problems improved.</li>
            <li><strong>Zero-shot chain of thought</strong> (Kojima et al., 2022): no examples, only the words "Let's think step by step" before the answer. On the model text-davinci-002, the accuracy on MultiArith went from 17.7% to 78.7%, and on GSM8K from 10.4% to 40.7%.</li>
          </ul>
          <p>These numbers come from older models and math tasks. Current models are trained to reason, and many think by default. The gain on your helpdesk messages can be large, small or zero. Measure it on your sample set.</p>` },
        { type: "html", html: `
          <h3>The reasoning text is not the reason</h3>
          <p>It is tempting to show the reasoning as "why the model decided". Research shows that this is not safe.</p>
          <ul>
            <li>Lanham et al. (2023) changed the reasoning of models in tests: they cut it short, added mistakes or wrote it in other words. Then they checked if the answer changed. How much the answer depended on the reasoning was very different from task to task. On most of the tasks, larger and more capable models gave reasoning that was <strong>less</strong> faithful.</li>
            <li>Chen et al. (2025), in the resources of lesson 1.9, give a second result: reasoning models often did not mention a hint in the prompt that they used for their answer.</li>
          </ul>
          <p>So the reasoning text is a tool that can make the answer better. It is not an explanation that you can trust. Do not show it to the employee as the reason, do not use it in program logic, and do not use it as proof in an audit. For an audit, log the inputs, the answer and the version of the prompt (lesson 2.7).</p>` },
        { type: "html", html: `
          <h3>When the mode is worth its cost</h3>
          <p>Use the method of lesson 1.9: compare the cost per correct answer, and add the cost of a wrong answer in your product. For the triage, a wrong answer is a <strong>wrong route</strong>. The message goes to the wrong team, a person must send it on, and the employee waits longer.</p>
          <p>A short rule: the mode pays for itself when</p>
          <p><code>extra cost per message / extra share of correct answers &lt; cost of one wrong route</code></p>
          <p>The left side is the extra cost of one extra correct answer.</p>` },
        { type: "worked", title: "Worked example: a sample set of 20 messages",
          intro: "A made-up run of the 20 messages of the lesson 2.2 sample set on Haiku 5.5, with the token counts of the interactive for every message. Direct: 16 correct. Reason first: 18 correct. These results are made up for teaching.",
          steps: [
            { html: "Cost of the set: direct 20 × $0.000142 = <strong>$0.00284</strong>. Reason first 20 × $0.000199 = <strong>$0.00398</strong>." },
            { html: "Cost per correct answer: direct $0.00284 / 16 = <strong>$0.0001775</strong>. Reason first $0.00398 / 18 = <strong>$0.000221</strong>. The reason-first mode costs more per correct answer." },
            { html: "Extra cost per extra correct answer: ($0.00398 − $0.00284) / (18 − 16) = $0.00114 / 2 = <strong>$0.00057</strong>. If one wrong route costs more than $0.00057 of work, the mode pays for itself. A person who reads and forwards one message costs much more than that." },
            { faded: true, html: "Your turn. Before you turn the mode on for all messages, what can you conclude from this run, and what can you not conclude?",
              answer: "You can conclude that the mode costs about 1.4 times more per message and that it did not break the format on this set. You cannot conclude that it is more accurate: 2 messages of 20 is a small difference, and a second run can give a different result. Look at the 2 messages that changed (and at any message that the mode made wrong). Add more hard messages, run both modes again, and check the time. If the gain stays only on hard messages, use the mode only for them, or route them (Topic 6)." }
          ] },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>The worked example uses the same token counts for every message. Real counts change from message to message, so compute the cost from <code>usage</code> of each response. Also measure the time: the reasoning tokens come before the answer, so the median time of the reason-first mode is longer. In the ticket stretch with thinking on, the input can be a little larger too, because the API adds a system prompt for thinking.</p>` },
        { type: "html", html: `
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>Reasoning models (lesson 1.9).</strong> Thinking is the API form of the same idea. On the large current models, it is the correct choice.</li>
            <li><strong>System prompts and examples (lesson 2.2).</strong> The reason-first mode is one more paragraph in the system prompt, measured on the same sample set. An example with reasoning in it is few-shot chain of thought.</li>
            <li><strong>Structured output (lessons 2.4 and 2.5).</strong> The answer tags are a simple format contract. Lessons 2.4 and 2.5 replace the answer lines with a validated object. Do not add a reasoning field to a JSON object or a tool input: the refusals page lists such a field as a common trigger of the reasoning_extraction refusal.</li>
            <li><strong>Prompt tests (lesson 2.7) and evals (Topic 5).</strong> Run the sample set in both modes after each prompt change, and count the format errors as failures.</li>
          </ul>` }
      ],
      checks: [
        { id: "l2-3-L3-a", type: "mcq",
          q: "20 messages cost $0.00398 in the reason-first mode, and 18 answers are correct. What is the cost per correct answer?",
          options: ["$0.000199", "$0.000221", "$0.0001775", "$0.00057"],
          correct: 1,
          explain: "$0.00398 / 18 = $0.000221. $0.000199 is the cost of one message. $0.0001775 is the cost per correct answer of the direct mode. $0.00057 is the extra cost per extra correct answer." },
        { id: "l2-3-L3-b", type: "mcq",
          q: "What did Lanham et al. (2023) find about the faithfulness of chain-of-thought reasoning?",
          options: [
            "The reasoning is always a faithful record of how the model decided.",
            "How much the answer depends on the reasoning changes a lot from task to task, and on most tasks larger models gave less faithful reasoning.",
            "Reasoning has no effect on the answer.",
            "Only small models write unfaithful reasoning."
          ],
          correct: 1,
          explain: "The authors changed the reasoning (cut it short, added mistakes, wrote it in other words) and checked if the answer changed. The dependence was very different per task, and on most tasks larger, more capable models gave less faithful reasoning." },
        { id: "l2-3-L3-c", type: "recall",
          q: "Write the rule that tells you when the reason-first mode pays for itself.",
          answer: "Extra cost per message divided by the extra share of correct answers, compared with the cost of one wrong route. If the extra cost per extra correct answer is lower than the cost of a wrong route, the mode pays for itself. In the example: $0.000057 / 0.10 = $0.00057 per extra correct answer. Measure the gain on a sample set that is large enough, and check the time too." }
      ]
    }
  ],

  debugging: [
    { id: "l2-3-dbg-1", title: "Employees see the reasoning",
      symptom: "After you turn on the reason-first mode, employees report triage replies that start with \"The badge itself works, and facilities says…\". Some replies show the text \"<reasoning>\".",
      evidence: "cli.py: print(response.content[0].text)   # the full text of the first block",
      hints: [
        "Which part of the response text is meant for the employee?",
        "What does the code do with the text outside the answer tags?"
      ],
      answer: "The code prints the full response text, so the reasoning reaches the employee. Fix: check stop_reason, join the text blocks by type, call extract_answer, and print only its result. Add the test test_reasoning_never_reaches_the_employee: a fake response with a reasoning section, and an assertion that the reasoning text is not in the CLI output." },
    { id: "l2-3-dbg-2", title: "The reason-first mode returns no answer on Opus 5.5",
      symptom: "A colleague switches the triage to claude-opus-5-5 to get better answers. In the reason-first mode, every request now returns no answer, and the bill still goes up.",
      evidence: "stop_reason=refusal  stop_details.category=reasoning_extraction  content=[]  (usage shows input tokens)",
      hints: [
        "Which part of the prompt asks the model to write out its reasoning?",
        "What do the docs advise for reasoning on Opus 5.5?"
      ],
      answer: "On Opus 5.5, a prompt that asks for a reasoning section before the answer can be declined with the category reasoning_extraction, and the refusal is billed. Also, thinking={\"type\": \"disabled\"} returns error 400 on Opus 5.5. Fix: on Opus 5.5, remove the reasoning instruction and use thinking with effort (lesson 1.9); ask for a short explanation after the answer if you need one. Keep the prompted mode on Haiku 5.5 only, and reject other models before the call, as ticket T-012 does." },
    { id: "l2-3-dbg-3", title: "The direct mode costs more than the sample numbers",
      symptom: "On Haiku 5.5, the direct mode of the triage uses many more output tokens than you expected. The answer itself is short.",
      evidence: "request: no thinking field   response content types: [\"thinking\", \"text\"]   usage.output_tokens: 600 (example)",
      hints: [
        "What does Haiku 5.5 do when the request has no thinking field?",
        "Does a prompt instruction \"answer directly\" stop it?"
      ],
      answer: "On Haiku 5.5, a request without a thinking field uses adaptive thinking, and the thinking tokens are billed as output. The guide says that an instruction to answer directly did not stop it. Fix: send thinking={\"type\": \"disabled\"} in both modes (at effort low, medium or high). Add a test that checks the thinking field in the request of each mode." }
  ],

  recall: [
    { id: "l2-3-r1", q: "What is prompted chain of thought?", a: "You ask the model in the prompt to write its reasoning before the answer. The reasoning is visible text in the response, usually in tags such as <reasoning>, and the answer goes in <answer> tags." },
    { id: "l2-3-r2", q: "Why can reasoning before the answer improve the answer?", a: "The model writes one token at a time. When the reasoning comes first, the answer tokens can use the intermediate steps in the context, and more tokens give more computation (lesson 1.9)." },
    { id: "l2-3-r3", q: "What is the rule of extract_answer?", a: "Exactly one <answer> section that is not empty after trimming. No section, two sections or an empty section raise AnswerFormatError. The code never guesses and never shows text outside the section." },
    { id: "l2-3-r4", q: "Why does the prompted reasoning mode of the ticket use Haiku 5.5 with thinking off?", a: "On Opus 5.5 and Sonnet 5.5, thinking={\"type\": \"disabled\"} returns error 400, and a prompt that asks for a reasoning section can be declined (reasoning_extraction, billed). On Haiku 5.5, thinking can be turned off at effort low, medium or high, and the docs give prompted reasoning with answer tags as the fallback." },
    { id: "l2-3-r5", q: "How is the reasoning billed?", a: "Prompted reasoning is output text, billed at the output price. Thinking tokens are also billed as output tokens. On Haiku 5.5 and the lesson 1.1 table, output costs 5 times input." },
    { id: "l2-3-r6", q: "Can you show the reasoning to a user as the reason for the answer?", a: "No. Research found that the reasoning can leave out the real cause of the answer, and that larger models gave less faithful reasoning on most tasks studied. Show only the answer, and log the inputs and the answer for audits." },
    { id: "l2-3-r7", q: "When is the reason-first mode worth its cost?", a: "When the extra cost per extra correct answer (extra cost per message / extra share of correct answers) is lower than the cost of a wrong answer in the product, measured on a sample set that is large enough, and when the extra time is acceptable." }
  ],

  interview: [
    { q: "How do you make an LLM reason before it answers, and what does it cost?",
      outline: "Two methods: thinking (an API feature, separate blocks, controlled with effort) and prompted chain of thought (reasoning as text, then answer tags). Both are billed as output tokens and add time before the answer. On large current models, use thinking: a reasoning section in the prompt can be declined (reasoning_extraction, billed). Measure the gain on a sample set: cost per correct answer plus the cost of a wrong answer." },
    { q: "How do you parse a response that contains reasoning and an answer?",
      outline: "Check stop_reason first (refusal, max_tokens). Join text blocks by type. Take out exactly one answer section with a strict rule; zero, two or empty sections are errors, not guesses. Never show the raw text. Log the error type, not the text. Test each failure shape with a fake response." },
    { q: "A product manager wants to show the model's reasoning to users as an explanation. What do you say?",
      outline: "The reasoning is a tool for accuracy, not a reliable explanation. Research (Lanham et al. 2023, and Chen et al. 2025 on hints) found that it can leave out the real cause. It can also contain data and drafts. Offer a short explanation that the model writes after the answer, or the evidence (documents, rules) that the code can check." },
    { q: "Your triage accuracy went from 80% to 90% with chain of thought on 20 messages. Do you ship it?",
      outline: "Not on this evidence alone. 2 of 20 is noise-level. Look at the changed messages, add more hard messages, run again. Compute the cost per correct answer and compare the extra cost per extra correct answer with the cost of a wrong route. Check the time at the median and p95. Consider the mode only for hard messages." },
    { q: "Why can't you just set temperature to 0 to make the reasoning more stable?",
      outline: "On the current Claude models, non-default temperature, top_p and top_k return error 400 (the \"Thinking\" docs page in the resources). Stability comes from the prompt, the format check, and measurement on a sample set over repeated runs, not from sampling settings." }
  ],

  misconceptions: [
    { wrong: "The reasoning text explains why the model decided.", right: "It can leave out the real cause. Use it to improve accuracy, not as an explanation or as proof." },
    { wrong: "If the reasoning is hidden from the user, it is free.", right: "Prompted reasoning is output text and is billed at the output price, also when your code removes it." },
    { wrong: "Asking for <reasoning> before the answer works the same on every model.", right: "On Opus 5.5, Sonnet 5.5 and Fable 5.1, such a prompt can be declined with reasoning_extraction, and the refusal is billed. Use thinking there." },
    { wrong: "If the answer tags are missing, the code can take the last line.", right: "A missing or doubled answer section is an error. A guess can show a draft or the reasoning to the user." },
    { wrong: "A request with no thinking field has no thinking.", right: "On Haiku 5.5, no thinking field means adaptive thinking. Send {\"type\": \"disabled\"} when you want it off." },
    { wrong: "Chain of thought always makes answers better.", right: "It helps on multi-step messages. On easy messages it adds cost and time with no gain. Measure it per kind of message." },
    { wrong: "You can prefill \"<answer>\" in an assistant turn to force the format.", right: "On the current models, a prefilled assistant turn returns error 400. Put the format in the system prompt and check it in code." }
  ],

  resources: [
    { title: "Prompting best practices", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices",
      when: "Read after level 1, before level 2.",
      why: "The current advice on reasoning: thinking on the large models, and manual chain of thought with answer tags as the fallback when thinking is off.",
      watchFor: [
        "On which models does the page say a prompt that asks for written-out reasoning may be declined?",
        "What does the page say about prefill on the current models?"
      ] },
    { title: "Refusals and fallback", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback",
      when: "Read with level 2.",
      why: "The reasoning_extraction refusal, its common triggers, and how a refusal is billed. Read the section \"Keep reasoning in thinking blocks\".",
      watchFor: [
        "Which three kinds of request does the page list as common triggers of reasoning_extraction?",
        "What can you still ask the model to explain?"
      ] },
    { title: "Prompting Claude Haiku 5.5", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5",
      when: "Read with level 2, before ticket T-012.",
      why: "The thinking default of Haiku 5.5, when you can turn thinking off, and reasoning-like text in replies.",
      watchFor: [
        "At which effort levels does thinking={\"type\": \"disabled\"} work?",
        "What does the page advise when reasoning-like text appears in the reply?"
      ] },
    { title: "Thinking", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/thinking",
      when: "Read after level 2, with lesson 1.9 open.",
      why: "The thinking settings of each current model in one table. Use it when you compare prompted reasoning with thinking.",
      watchFor: [
        "Which models return error 400 for {\"type\": \"disabled\"}?",
        "What is the default display setting on the current models?"
      ] },
    { title: "Large Language Models are Zero-Shot Reasoners", by: "Kojima et al. (2022)", kind: "Paper, optional", url: "https://arxiv.org/abs/2205.11916",
      when: "Optional, after level 3. Read the abstract.",
      why: "The result that one sentence, \"Let's think step by step\", improved older models on reasoning tasks with no examples.",
      watchFor: [
        "Where in the prompt does the sentence go?",
        "Which model and which tasks give the numbers in the abstract?"
      ] },
    { title: "Measuring Faithfulness in Chain-of-Thought Reasoning", by: "Lanham et al. (2023)", kind: "Paper, optional", url: "https://arxiv.org/abs/2307.13702",
      when: "Optional, after level 3. Read the abstract.",
      why: "Tests that change the reasoning and check if the answer changes. The reason that you must not use the reasoning as an explanation.",
      watchFor: [
        "Which changes to the reasoning do the authors make?",
        "What do they find about larger models?"
      ] }
  ],

  summary: `
    <ul>
      <li>The model writes one token at a time. When the reasoning comes first, the answer can use it. This can make answers more accurate on multi-step messages.</li>
      <li>Prompted chain of thought puts the reasoning in the response text, in <code>&lt;reasoning&gt;</code> tags, and the answer in <code>&lt;answer&gt;</code> tags.</li>
      <li>Your code takes out exactly one non-empty answer section and shows only that. No section or two sections is an error, not a guess.</li>
      <li>The reasoning is billed as output tokens and adds time. In the example, it makes one message 1.40 times more expensive.</li>
      <li>On Opus 5.5 and Sonnet 5.5, use thinking: a reasoning section in the prompt can be declined and billed. Prompted reasoning fits Haiku 5.5 with thinking turned off explicitly.</li>
      <li>The reasoning text is not a reliable record of how the model decided. Do not show it as the reason.</li>
      <li>Turn the mode on only when the extra cost per extra correct answer is lower than the cost of a wrong route, measured on a sample set.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer what changes when the triage prompt asks for reasoning before the answer: why the answer can improve, what the code must do with the response (one answer section, everything else removed or an error), and what it costs. Use the numbers: $0.000142 direct and $0.000199 with reasoning on Haiku 5.5, and $0.00057 per extra correct answer on the sample set. Then explain why the same prompt is a bad idea on Opus 5.5. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-012"]
};

/* ====================================================================== T-012 */
window.ACADEMY.tickets["T-012"] = {
  id: "T-012",
  title: "A reason-first mode for the helpdesk triage",
  lesson: "2.3",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. Milestone 4 makes about 40 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Add a <code>--mode</code> option to the triage command of T-011, with two new modes. <code>python -m assistant.triage --mode direct "message text"</code> asks for the two label lines in <code>&lt;answer&gt;</code> tags. <code>--mode reason</code> also asks the model to reason in <code>&lt;reasoning&gt;</code> tags before the answer.
      The code takes out only the answer and never shows the reasoning to the employee. A response without exactly one answer section is an error.
      Put the logic in a new pure module, <code>assistant/reasoning.py</code>, and prove it with tests that are named after the properties they check.
      Then run the sample set of T-011 in both modes, and compare the accuracy, the output tokens and the cost.</p>
      <p><strong>Real-world problem.</strong> Teams add "think step by step" to a prompt to fix a few hard requests. Then the reasoning leaks into the replies that users see, the parser breaks when the tags are missing, the bill goes up on every request, and on a large model the prompt is declined and still billed.
      This ticket adds the mode with the checks that prevent these failures, and a measurement that shows if the mode is worth its cost.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools". Topic 2 builds an internal helpdesk triage: an employee message comes in, and the assistant gives a category (IT, HR, facilities, finance or other) and a priority (low, medium or high).
      The project stays in the CLI. This ticket adds no service and no endpoint.</p>
      <p>This ticket depends on:</p>
      <ul>
        <li><strong>T-001:</strong> <code>assistant/llm.py</code> (the only module that calls the API), <code>assistant/pricing.py</code>, the measurement line and the fake client of the tests.</li>
        <li><strong>T-009 (lesson 1.9):</strong> <code>check_answer</code> and <code>cost_per_correct</code> in <code>assistant/thinking.py</code>.</li>
        <li><strong>T-011 (lesson 2.2, helpdesk triage with a system prompt and few-shot examples):</strong> <code>python -m assistant.triage</code> and the pure functions of <code>assistant/triage.py</code>: <code>SYSTEM_PROMPT</code>, <code>build_request</code>, <code>parse_triage</code> and <code>accuracy</code>. Also the sample set <code>samples/helpdesk.jsonl</code> (20 messages), the examples in <code>samples/triage_examples.jsonl</code> and the script <code>scripts/triage_eval.py</code>. T-011 sends its example turns through the <code>messages</code> parameter that T-010 (lesson 2.1, a chat loop that keeps the conversation history) adds to the call function of <code>llm.py</code>.</li>
      </ul>
      <p>The T-011 reply is two label lines, <code>category: ...</code> and <code>priority: ...</code>, with no tags. This ticket keeps that command as it is: without the new option <code>--mode</code>, the output, the measurement line and the T-011 tests do not change. The two new modes put the same two lines inside answer tags.</p>
      <p><strong>A change to a T-009 rule.</strong> T-009 says "never send <code>{"type": "disabled"}</code>". This ticket sends it for the triage only, on <code>claude-haiku-5-5</code> only. The reason: on Haiku 5.5, a request without a thinking field uses adaptive thinking, so the two modes would not differ only in the prompted reasoning. The <code>ask</code> command of T-001 and T-009 keeps the old rule, and its tests do not change.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 2.3, levels 1 and 2 complete. Level 3 helps for milestone 4.</li>
        <li>T-001, T-009 and T-011 done, and their tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestones 1 and 4 only.</li>
        <li>No new package. Use the <code>anthropic</code> SDK of T-001 and the Python standard library.</li>
        <li>Read the docs pages "Prompting Claude Haiku 5.5" and "Refusals and fallback" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>--mode</code> takes <code>labels</code>, <code>direct</code> or <code>reason</code>. The default is <code>labels</code>: the T-011 command with no change. <code>--mode direct</code> asks for the two label lines inside <code>&lt;answer&gt;</code> tags. <code>--mode reason</code> adds the instruction to reason inside <code>&lt;reasoning&gt;</code> tags first. In both new modes, the CLI prints only the two label lines, as T-011 does.</li>
        <li>The CLI never prints the reasoning text or any other text outside the answer section.</li>
        <li>When the response has no answer section, two or more answer sections, or an empty answer section, the CLI prints one clear line, for example <code>could not read the triage answer: expected 1 answer section, found 0</code>, and exits with a code that is not 0. It prints no stack trace.</li>
        <li>When <code>stop_reason</code> is <code>refusal</code> or <code>max_tokens</code>, the CLI reports the status of T-009 <code>check_answer</code>, does not parse the text, and exits with a code that is not 0.</li>
        <li>In the two new modes, the measurement line of T-001 gets two fields: <code>mode</code> (<code>direct</code> or <code>reason</code>) and <code>answer</code> (<code>ok</code>, <code>incomplete</code>, <code>no_answer</code>, <code>refusal</code> or <code>format_error</code>). Example: <code>mode=reason answer=ok</code>.</li>
        <li><code>python scripts/triage_eval.py --modes direct,reason</code> runs every message of <code>samples/helpdesk.jsonl</code> in each mode, with the 3 examples of T-011. It prints one table row per mode: correct answers, accuracy, format errors (answer-tag errors and <code>parse_triage</code> failures), mean input tokens, mean output tokens, median time, total cost and cost per correct answer. Then it lists each wrong message of each mode, as T-011 does. Without <code>--modes</code>, the script works as in T-011.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>llm.py</code> stays the only module that calls the API.</li>
        <li><code>assistant/reasoning.py</code> contains pure code only: <code>MODES</code>, <code>ANSWER_INSTRUCTION</code>, <code>REASON_INSTRUCTION</code>, <code>AnswerFormatError</code>, <code>extract_answer</code>, <code>system_prompt</code> and <code>request_options</code>. No API calls, no printing, no global state.</li>
        <li><code>extract_answer(text)</code> uses one regular expression, <code>&lt;answer&gt;(.*?)&lt;/answer&gt;</code> with <code>re.DOTALL</code>. It returns the trimmed text of exactly one non-empty section. In all other cases, it raises <code>AnswerFormatError</code> with a message that gives the number of sections found.</li>
        <li><code>system_prompt(rules, label_format, reason)</code> joins the rules of the T-011 prompt, <code>ANSWER_INSTRUCTION</code> followed by the T-011 format lines, and, in the reason mode, <code>REASON_INSTRUCTION</code>. In <code>triage.py</code>, split <code>SYSTEM_PROMPT</code> into <code>RULES</code> and <code>LABEL_FORMAT</code> (the two format lines), and build <code>SYSTEM_PROMPT</code> from them with the same text as before. Then the prompt has one source, and the T-011 tests do not change.</li>
        <li><code>build_request</code> of T-011 gets an optional parameter <code>answer_tags: bool = False</code>. When it is true, each example assistant turn has its two label lines inside <code>&lt;answer&gt;</code> tags. The examples have no reasoning section.</li>
        <li><code>request_options(mode, model)</code> returns the extra request arguments. Both modes use <code>claude-haiku-5-5</code> and send <code>thinking={"type": "disabled"}</code>. For any other model, it raises <code>ValueError</code> before any API call. The message says why: Opus 5.5 and Sonnet 5.5 reject <code>"disabled"</code> with error 400, and they can decline a prompt that asks for a reasoning section (<code>reasoning_extraction</code>).</li>
        <li>The triage sends no effort above <code>high</code>, because Haiku 5.5 accepts <code>"disabled"</code> only at effort low, medium or high.</li>
        <li>The CLI calls <code>check_answer</code> first, then <code>extract_answer</code> on the joined text, then <code>parse_triage</code> of T-011 on the answer. When <code>parse_triage</code> returns <code>None</code>, the CLI prints the T-011 error line, and the measurement line has <code>answer=format_error</code>.</li>
        <li>Never prefill an assistant turn with <code>&lt;answer&gt;</code>: the current models return error 400. Never send <code>temperature</code>, <code>top_p</code> or <code>top_k</code>.</li>
        <li>The cost comes from <code>usage.input_tokens</code> and <code>usage.output_tokens</code> with the T-001 price table. The cost per correct answer uses <code>cost_per_correct</code> of T-009.</li>
        <li>The raw response text never goes to a log, because it contains the employee message and the reasoning. Log the error type and the request id.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given mode <code>reason</code> and the fake client, the request arguments contain <code>model="claude-haiku-5-5"</code>, <code>thinking={"type": "disabled"}</code>, and a system prompt that contains <code>REASON_INSTRUCTION</code>. Given mode <code>direct</code>, the system prompt does not contain <code>REASON_INSTRUCTION</code>. In both modes, the system prompt contains <code>ANSWER_INSTRUCTION</code> and the T-011 format lines, and each example assistant turn has its two label lines inside answer tags.</li>
        <li>Given <code>--mode reason</code> with <code>--model claude-opus-5-5</code>, the CLI prints the error of <code>request_options</code>, exits with a code that is not 0, and the fake client records 0 calls.</li>
        <li>Given the response text <code>&lt;reasoning&gt;Access groups belong to IT.&lt;/reasoning&gt;</code> followed by an answer section with <code>category: IT</code> and <code>priority: high</code>, the CLI output contains <code>category: IT</code> and does not contain "Access groups belong to IT" or <code>&lt;reasoning&gt;</code>.</li>
        <li>Given the text <code>category: IT</code> with no tags, <code>extract_answer</code> raises <code>AnswerFormatError</code> with "found 0", the CLI exits with a code that is not 0, the measurement line has <code>answer=format_error</code>, and there is no stack trace.</li>
        <li>Given reasoning that contains a draft <code>&lt;answer&gt;facilities&lt;/answer&gt;</code>, followed by a final answer section, <code>extract_answer</code> raises <code>AnswerFormatError</code> with "found 2".</li>
        <li>Given <code>stop_reason="refusal"</code> and empty content, the status is <code>refusal</code>, and <code>extract_answer</code> is not called.</li>
        <li>Given usage of 1,180 input and 48 output tokens at the Haiku 5.5 prices of the T-001 table ($0.10 and $0.50 per million), the cost is 0.000142. Given 1,240 and 150, it is 0.000199 (tolerance 1e-12 for both). These are the examples of the lesson.</li>
        <li>Given 20 runs that cost $0.00398 in total with 18 correct answers, <code>cost_per_correct</code> returns 0.000221 (tolerance 1e-6).</li>
        <li>With a real key, <code>scripts/triage_eval.py --modes direct,reason</code> runs the sample set in both modes. The handoff records the table.</li>
        <li><code>pytest</code> passes with the network off. The tests of T-001, T-009 and T-011 pass without a change. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Look at real responses (guided).</strong> In a scratch script, send the hard message of the lesson to <code>claude-haiku-5-5</code> three times: the direct prompt with no thinking field, the direct prompt with <code>thinking={"type": "disabled"}</code>, and the reason prompt with <code>"disabled"</code>. For each, print the type of each block, the raw text, <code>stop_reason</code> and <code>usage</code>. Write down the output tokens. Do not keep this script.</li>
        <li><strong>The answer extraction (guided).</strong> Write the tests of criteria 3, 4 and 5 first, with fake responses. Then write <code>extract_answer</code> and <code>AnswerFormatError</code> in <code>reasoning.py</code>, and use them in the triage CLI after <code>check_answer</code>.</li>
        <li><strong>The reason-first mode (independent).</strong> Add <code>system_prompt</code>, <code>request_options</code>, the <code>answer_tags</code> parameter of <code>build_request</code>, the <code>--mode</code> option and the two fields of the measurement line. Add the tests of criteria 1, 2, 6 and 7.</li>
        <li><strong>Measure both modes and write the handoff (independent).</strong> Add <code>--modes</code> to <code>scripts/triage_eval.py</code>. Make sure that the sample set has at least 5 hard messages: a message that names the wrong team, a deadline that changes the priority, or two requests in one message. If it has fewer, replace easy messages with hard ones and label them yourself. Keep 20 lines, because a T-011 test checks the count, and keep the example texts out of the set. Run the script one time. Fill in <code>handoffs/T-012-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost of milestone 4: 20 messages × 2 modes = 40 calls. If each call uses 1,300 input and 200 output tokens, the cost at the Haiku 5.5 prices of the T-001 table is 40 × (1,300 × $0.10 + 200 × $0.50) / 1,000,000 = about $0.0092. The script prints the real total.</p>
      <p class="muted">Stretch, optional, on top of T-009: add a third mode, <code>think</code>. It uses the direct prompt with <code>thinking={"type": "adaptive"}</code> and the default display (<code>"omitted"</code>), so the thinking is never shown. Run the same sample set in three modes. In the handoff, compare the output tokens, the cost and the accuracy, and say which mode you would use. The input of the think mode can be a little larger, because the API adds a system prompt for thinking. Read it from <code>usage</code>.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                  # from T-001 and T-010 (only pass the arguments of request_options)
    pricing.py              # from T-001 (no change)
    thinking.py             # from T-009 (no change): check_answer, cost_per_correct
    triage.py               # from T-011: RULES and LABEL_FORMAT (same SYSTEM_PROMPT text),
                            # answer_tags in build_request, --mode, the new measurement fields
    reasoning.py            # MODES, ANSWER_INSTRUCTION, REASON_INSTRUCTION, AnswerFormatError,
                            # extract_answer, system_prompt, request_options
  samples/
    helpdesk.jsonl          # from T-011: keep 20 lines; replace easy messages with hard ones
    triage_examples.jsonl   # from T-011 (no change)
  scripts/
    triage_eval.py          # from T-011: add --modes and the new columns
  tests/
    test_reasoning.py       # new
    test_triage.py          # from T-011 (no change)
  tickets/
    T-012.md                # this ticket (generated)
  handoffs/
    T-012-handoff.md        # your handoff (template generated)</code></pre>
      <p>An example of a response in the reason-first mode. This is the shape that <code>extract_answer</code> expects:</p>
      <pre><code>&lt;reasoning&gt;
The badge itself works, and facilities says the cause is the access group. Access groups belong to IT.
The safety audit is on Friday, and the employee cannot work in the lab until then: priority high.
&lt;/reasoning&gt;
&lt;answer&gt;
category: IT
priority: high
&lt;/answer&gt;</code></pre>
      <p>Do not change <code>assistant/pricing.py</code> or <code>assistant/thinking.py</code> for this ticket. Change <code>llm.py</code> only to pass the arguments of <code>request_options</code>.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_answer_is_taken_only_from_answer_tags</code></td><td>Reasoning section, then one answer section, with text around them</td><td>Only the trimmed text of the answer section</td></tr>
        <tr><td><code>test_missing_answer_tags_is_an_error</code></td><td><code>"category: IT\\npriority: high"</code></td><td><code>AnswerFormatError</code>, "found 0"</td></tr>
        <tr><td><code>test_two_answer_sections_is_an_error</code></td><td>A draft answer inside the reasoning and a final answer</td><td><code>AnswerFormatError</code>, "found 2"</td></tr>
        <tr><td><code>test_empty_answer_section_is_an_error</code></td><td>An answer section with only spaces and new lines</td><td><code>AnswerFormatError</code>, "empty"</td></tr>
        <tr><td><code>test_reasoning_never_reaches_the_employee</code></td><td>Fake response with a reasoning section, CLI run</td><td>The reasoning text and the tags are not in the output</td></tr>
        <tr><td><code>test_both_modes_turn_thinking_off_on_haiku</code></td><td>Mode <code>direct</code> and mode <code>reason</code>, fake client</td><td>Both requests have <code>thinking={"type": "disabled"}</code> and the Haiku 5.5 model</td></tr>
        <tr><td><code>test_examples_use_answer_tags_in_both_new_modes</code></td><td>Modes <code>direct</code> and <code>reason</code>, 3 examples</td><td>7 messages; each example assistant turn has its two label lines inside answer tags</td></tr>
        <tr><td><code>test_reason_instruction_only_in_reason_mode</code></td><td>Both modes</td><td><code>REASON_INSTRUCTION</code> in the reason prompt only</td></tr>
        <tr><td><code>test_reason_mode_rejected_on_models_that_cannot_turn_thinking_off</code></td><td><code>claude-opus-5-5</code> and <code>claude-sonnet-5-5</code></td><td><code>ValueError</code>; the fake client has 0 calls</td></tr>
        <tr><td><code>test_refusal_is_reported_not_parsed</code></td><td><code>stop_reason="refusal"</code>, empty content</td><td>Status <code>refusal</code>; <code>extract_answer</code> not called</td></tr>
        <tr><td><code>test_format_error_is_in_the_measurement_line</code></td><td>Text with no tags, CLI run</td><td><code>answer=format_error</code>, exit code not 0, no stack trace</td></tr>
        <tr><td><code>test_cost_of_both_modes_matches_lesson_example</code></td><td>1,180 / 48 and 1,240 / 150 tokens, Haiku 5.5 prices</td><td>0.000142 and 0.000199</td></tr>
        <tr><td><code>test_cost_per_correct_of_reason_mode_matches_lesson_example</code></td><td>20 runs, $0.00398 total, 18 correct</td><td>0.000221 (tolerance 1e-6)</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table. Build the fake text blocks as small objects with a <code>type</code> field and a <code>text</code> field. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests and for the eval. The eval prints its total cost. Run it one time, then read the results. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> never show a response with a format error, a refusal or a <code>max_tokens</code> stop as a triage result. Every such case is visible in the measurement line.</li>
        <li><strong>Latency:</strong> record the total time of each call in the eval. The reasoning comes before the answer, so the reason-first mode is slower. Report the median per mode, and say that 20 messages are too few for a p95.</li>
        <li><strong>Privacy:</strong> the reasoning repeats details of the employee message. The CLI never prints it, and no log contains the raw text.</li>
      </ul>`,
    questions: `
      <ol>
        <li>In milestone 1, how many output tokens did each of the three requests use? Which block types came back from the request with no thinking field?</li>
        <li>Give your eval table. Which mode has the lower cost per correct answer?</li>
        <li>Which messages did the reason-first mode fix, and did it make any message wrong? What do the fixed messages have in common?</li>
        <li>Compute the extra cost per extra correct answer from your numbers. Estimate the cost of one wrong route at Northwind Tools. Is the mode worth its cost, and for which kind of message?</li>
        <li>Your sample set has about 20 messages and one run per mode. What can you conclude, and what can you not conclude? What would you change before you turn the mode on for all employees?</li>
        <li>Why does this ticket reject the reason-first mode on <code>claude-opus-5-5</code>? What would you use on that model to get reasoning?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, two measurement lines, the eval table).</li>
        <li><code>pytest</code> passes with the network off, and the tests of T-001, T-009 and T-011 did not change.</li>
        <li>You labeled each new hard message yourself before you ran the eval.</li>
        <li>You can explain each line of <code>reasoning.py</code> without notes, and why <code>extract_answer</code> does not take the last answer section.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> <code>llm.py</code> is still the only module that calls the API; the employee never sees text outside the answer section; a missing or doubled answer section is an error;
      <code>stop_reason</code> is checked before the text is parsed; both modes send <code>"disabled"</code> on Haiku 5.5 and other models are rejected before the call; the cost comes from <code>usage</code>; the tests are named after properties and run with the network off; the eval reports the cost per correct answer; and how well your answers to the questions use your own measurements.</p>`
  }
};
