/*
 * Lesson 1.9 - Reasoning models and thinking tokens.
 * Ticket T-009 - Effort control and a safe answer check for responses with thinking.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
 * Worked examples (toy token counts of the interactive, Opus 5.5 prices):
 *   Refund task, 900 input tokens, 250 answer tokens:
 *     low (300 thinking) $0.0146, medium (1,200) $0.0326, high (2,800) $0.0646.
 *     max effort (9,000 thinking) with max_tokens 4,096: no answer, $0.0855.
 *   Classify task, 300 input, 20 answer: low (0 thinking) $0.0016, max (1,800) $0.0376.
 *   Cost per correct answer (made-up eval of 100 refund questions):
 *     low: 600 output tokens each, $1.56 total, 62 correct -> $0.0252 per correct answer.
 *     high: 3,100 output tokens each, $6.56 total, 91 correct -> $0.0721 per correct answer.
 *     With $0.50 per wrong answer: low $20.56, high $11.06.
 * The interactive for this lesson is in 09-ix.js (id "l1-9-thinking").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.9"] = {
  id: "1.9",
  topic: "t1",
  title: "Reasoning models and thinking tokens",
  objective: "Explain what thinking tokens are and why they can make answers better, control them with effort and max_tokens, compute what they cost, read a response that contains thinking blocks, and decide with measurements when extra thinking helps a task and when it only adds cost and time.",
  prerequisites: [
    "Lesson 1.1: the generation loop, max_tokens, stop_reason, the cost formula and the effort setting.",
    "Lesson 1.5 helps: each new token is one pass through all the blocks of the model.",
    "You can multiply and divide small numbers. No machine learning course is necessary."
  ],
  covers: ["t1-reasoning"],
  whyItMatters: `
    <p>Current models can <strong>think before they answer</strong>. The model writes tokens that work through the problem, and then it writes the answer. On hard, multi-step tasks, this can give much better answers.
    But each thinking token is an output token. You pay for it, you wait for it, and it uses a part of <code>max_tokens</code>.</p>
    <p>For an application engineer, this gives three daily decisions. The first is how much thinking each kind of request gets: a ticket classifier and a refund calculator need different settings.
    The second is how large <code>max_tokens</code> must be, so that thinking does not use all of it and leave no answer. The third is how to read the response safely, because it now contains more than one kind of content block.
    In an interview, "when do you use a reasoning model, and what does it cost?" is a common question. A good answer uses numbers: cost per correct answer, not cost per request.</p>`,
  concepts: [
    { id: "l1-9-c-thinking", name: "Thinking tokens: output tokens that the model writes before its answer" },
    { id: "l1-9-c-compute", name: "Why thinking helps: more tokens give more computation and a place for intermediate results" },
    { id: "l1-9-c-effort", name: "Effort and adaptive thinking: how you control the amount of thinking" },
    { id: "l1-9-c-budget", name: "Thinking counts against max_tokens and is billed as output tokens" },
    { id: "l1-9-c-blocks", name: "Thinking blocks in the response: display, safe answer extraction and multi-turn use" },
    { id: "l1-9-c-when", name: "When thinking helps (multi-step tasks) and when it does not (lookup, classification, format)" },
    { id: "l1-9-c-measure", name: "Choose the effort with an eval: cost per correct answer and the cost of a wrong answer" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "Work on scratch paper before you answer",
      blocks: [
        { type: "html", html: `
          <p>Lesson 1.1 showed the loop: the model predicts one token, adds it to the text, and predicts the next token. A model without thinking starts to write the answer immediately.</p>
          <p>A <strong>reasoning model</strong> adds one step. Before the answer, it writes <strong>thinking tokens</strong>. In these tokens, it can split the problem into steps, try an approach, check a result and correct a mistake.
          Then it writes the answer. The answer can use everything that the thinking wrote, because the thinking is now a part of the context.</p>
          <p>The thinking tokens come from the same loop as all other tokens. They are not a different machine. They are more output tokens, and the model learned in training how to use them well.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: scratch paper in an exam", html: `
          <p>Compute 17 × 24 in your head, in one step, with no paper. Most people make mistakes. With scratch paper, you write 17 × 20 = 340, then 17 × 4 = 68, then 340 + 68 = 408. Each step is easy, and the paper keeps the intermediate results.</p>
          <ul>
            <li><strong>The thinking tokens are the scratch paper.</strong> Each step is small, and the result of each step stays written down.</li>
            <li><strong>For an easy question, the paper is a waste of time.</strong> "What is the capital of France?" does not get a better answer if you write three lines first.</li>
            <li><strong>The paper costs time and money.</strong> In an exam, you pay with minutes. With a model, you pay for each thinking token as an output token.</li>
          </ul>` },
        { type: "diagram", caption: "One request to a reasoning model. The thinking block comes first and the text block second. Both are output tokens, and both count against max_tokens.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="The request goes to the model. The model writes a thinking block, then a text block with the answer. A bracket above both blocks shows that max_tokens limits all output tokens. A note below says that if the thinking uses all of max_tokens, no text block follows.">
            <defs><marker id="l19a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <rect x="14" y="80" width="130" height="56" rx="8" class="d-box"/><text x="79" y="104" text-anchor="middle" class="d-bold">Your request</text><text x="79" y="122" text-anchor="middle" class="d-small">input tokens</text>
            <line x1="144" y1="108" x2="186" y2="108" class="d-line" marker-end="url(#l19a1)"/>
            <rect x="188" y="80" width="230" height="56" rx="8" class="d-box-info"/><text x="303" y="104" text-anchor="middle" class="d-bold">Thinking block</text><text x="303" y="122" text-anchor="middle" class="d-small">steps, checks, corrections</text>
            <line x1="418" y1="108" x2="446" y2="108" class="d-line" marker-end="url(#l19a1)"/>
            <rect x="448" y="80" width="140" height="56" rx="8" class="d-box-good"/><text x="518" y="104" text-anchor="middle" class="d-bold">Text block</text><text x="518" y="122" text-anchor="middle" class="d-small">the answer</text>
            <path d="M188,60 L188,48 L588,48 L588,60" class="d-line-accent" fill="none"/>
            <text x="388" y="36" text-anchor="middle" class="d-small">max_tokens limits all output tokens · billed at the output price</text>
            <text x="320" y="170" text-anchor="middle" class="d-small">If the thinking uses all of max_tokens, the response stops with stop_reason "max_tokens"</text>
            <text x="320" y="188" text-anchor="middle" class="d-small">and has no text block. You still pay for the thinking.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>You may not see the paper.</strong> On the current Claude models, the API returns a summary of the thinking or an empty field. You never get the full thinking text. You pay for all of it.</li>
            <li><strong>The paper is not a true record.</strong> The thinking text can leave out reasons that affected the answer (level 3). Do not use it as proof of how the model got the answer.</li>
            <li><strong>More paper is not always better.</strong> After some point, more thinking gives little or no improvement, and it can make the answer worse on simple tasks.</li>
          </ul>` },
        { type: "interactive", id: "l1-9-thinking" },
        { type: "html", html: `
          <h3>What thinking costs</h3>
          <p>Thinking has three costs. You can see all three in the interactive.</p>
          <ol>
            <li><strong>Money.</strong> Thinking tokens are billed as output tokens. In the price table of lesson 1.1, the output price is 5 times the input price for all three models. So on a request with a short prompt, the thinking is often most of the cost.</li>
            <li><strong>Time.</strong> The model writes thinking tokens one at a time, the same as the answer. More thinking means a longer wait before the first word of the answer.</li>
            <li><strong>Space in max_tokens.</strong> The thinking comes first. If it uses all of <code>max_tokens</code>, there is no answer.</li>
          </ol>
          <p>So the question is not "is thinking good?". The question is "for this kind of request, how much thinking gives the best result for the cost?". Level 3 shows how to answer it with measurements.</p>` }
      ],
      checks: [
        { id: "l1-9-L1-a", type: "mcq",
          q: "What are thinking tokens?",
          options: [
            "Tokens in your prompt that tell the model to think carefully.",
            "Output tokens that the model writes before its answer, to work through the problem. You pay for them at the output price.",
            "Free tokens that the server uses inside the model and never bills.",
            "Tokens that the model removes from the context to save space."
          ],
          correct: 1,
          explain: "Thinking tokens come from the normal generation loop. The model writes them before the answer, and the answer can use them as context. They are billed as output tokens, and they count against max_tokens." },
        { id: "l1-9-L1-b", type: "mcq",
          q: "Which request gets the largest improvement from more thinking?",
          options: [
            "Classify a support ticket into one of six labels.",
            "Return the date of an order from a JSON record in the prompt.",
            "Compute a refund from four rules that you must apply in the correct order.",
            "Translate one short sentence into French."
          ],
          correct: 2,
          explain: "The refund needs several steps, and each step depends on the result of an earlier step. Thinking helps most on such multi-step work. Lookup, classification with clear labels and short translation need few steps, so extra thinking adds cost and time but little quality." },
        { id: "l1-9-L1-c", type: "recall",
          q: "Name the three costs of thinking tokens.",
          answer: "Money: they are billed as output tokens, and output costs 5 times input in the lesson 1.1 price table. Time: the model writes them before the answer, so the answer starts later. Space: they count against max_tokens, and if they use all of it, there is no answer." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Set the effort, size max_tokens and read the response safely",
      blocks: [
        { type: "html", html: `
          <h3>The controls in the API</h3>
          <p>On the current Claude models, the model decides how much to think for each request. This is called <strong>adaptive thinking</strong>. On a simple request, the model can decide not to think. Then the response has no thinking block. You give it a guide with the <strong>effort</strong> setting:
          <code>low</code>, <code>medium</code>, <code>high</code>, <code>xhigh</code> or <code>max</code>. Effort controls the total token spend: the thinking, the length of the text, and the number of tool calls in agent work.</p>
          <p><code>max_tokens</code> is different. It is a hard limit on all output tokens, the thinking included. When the output reaches the limit, the API stops the response.</p>` },
        { type: "code", lang: "python", code:
`import anthropic

# The client reads ANTHROPIC_API_KEY from the environment.
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    # Optional: return a summary of the thinking.
    thinking={"type": "adaptive", "display": "summarized"},
    # low | medium | high | xhigh | max
    output_config={"effort": "high"},
    messages=[{"role": "user", "content": "Compute the refund: ..."}],
)

# content is a list of blocks. Check .type before you read a field.
for block in response.content:
    if block.type == "thinking":
        print("Thinking summary:", block.thinking)
    elif block.type == "text":
        print("Answer:", block.text)

# output_tokens includes the thinking tokens.
print(response.stop_reason, response.usage.output_tokens)` },
        { type: "note", kind: "fact", title: "The thinking settings of the current models", html: `
          <div class="table-wrap"><table>
            <tr><th>Model</th><th>Thinking</th><th>Default effort</th><th>Turn thinking off</th></tr>
            <tr><td>Claude Opus 5.5</td><td>Always on</td><td>medium</td><td>Not possible. <code>{"type": "disabled"}</code> returns error 400.</td></tr>
            <tr><td>Claude Sonnet 5.5</td><td>On by default</td><td>high</td><td><code>{"type": "between_tools"}</code>, only at effort high or lower</td></tr>
            <tr><td>Claude Haiku 5.5</td><td>On by default</td><td>medium</td><td><code>{"type": "disabled"}</code>, only at effort high or lower</td></tr>
          </table></div>
          <ul>
            <li>Older models used <code>thinking={"type": "enabled", "budget_tokens": N}</code>. The three models above reject <code>budget_tokens</code> with error 400. Use effort.</li>
            <li>The <code>display</code> field controls only what you see: <code>"omitted"</code> (the default) gives an empty thinking field, and <code>"summarized"</code> gives a readable summary. You never get the full thinking text. The billed tokens are the same for both settings.</li>
          </ul>
          <p class="muted">Source: the Claude API docs pages "Thinking", "Troubleshooting thinking" and "Effort" (in the resources), checked on 2026-11-02. Check them again before you rely on these details. They can change with a new model.</p>` },
        { type: "worked", title: "Worked example: the cost of thinking on one request",
          intro: "The refund task of the interactive: 900 input tokens and an answer of 250 tokens. Claude Opus 5.5: $4 per million input tokens and $20 per million output tokens (the price table of lesson 1.1). The thinking counts are toy numbers.",
          steps: [
            { html: "Input cost: 900 × $4 / 1,000,000 = <strong>$0.0036</strong>. This part does not change with the effort." },
            { html: "Effort low, 300 thinking tokens: output = 300 + 250 = 550 tokens, 550 × $20 / 1,000,000 = $0.011. Total <strong>$0.0146</strong>." },
            { html: "Effort high, 2,800 thinking tokens: output = 2,800 + 250 = 3,050 tokens, 3,050 × $20 / 1,000,000 = $0.061. Total <strong>$0.0646</strong>, about 4.4 times the low effort." },
            { faded: true, html: "Your turn. The classify task has 300 input tokens and an answer of 20 tokens. Compute the cost at effort low (0 thinking tokens) and at effort max (1,800 thinking tokens) on Opus 5.5. In the toy, both meet the quality bar.",
              answer: "Input: 300 × $4 / 1,000,000 = $0.0012. Low: 20 output tokens = $0.0004, total $0.0016. Max: 1,820 output tokens = $0.0364, total $0.0376. The max effort costs about 23 times more and gives no better label. The interactive shows the same numbers." }
          ] },
        { type: "worked", title: "Worked example: when thinking uses all of max_tokens",
          intro: "The refund task at effort max. The model wants 9,000 thinking tokens. You set max_tokens = 4,096.",
          steps: [
            { html: "The thinking comes first. After 4,096 thinking tokens, the output reaches the limit, and the API stops the response with <code>stop_reason = \"max_tokens\"</code>." },
            { html: "The content has one thinking block and <strong>no text block</strong>. Code that reads <code>response.content[0].text</code> fails, because block 0 is a thinking block." },
            { html: "You still pay: 900 × $4 / 1,000,000 + 4,096 × $20 / 1,000,000 = $0.0036 + $0.08192 = <strong>$0.0855</strong> for no answer." },
            { faded: true, html: "Your turn. Name two changes that give an answer for this task, and say what each change costs.",
              answer: "1. Raise max_tokens above the planned output, for example to 16,000. Then 9,000 + 250 tokens fit, and the cost is $0.1886. 2. Lower the effort to high: 2,800 + 250 = 3,050 tokens fit in 4,096, and the cost is $0.0646. In the toy, high already meets the quality bar, so the second change is better. Always check stop_reason, and find the text block by its type." }
          ] },
        { type: "html", html: `
          <h3>Read a response with thinking safely</h3>
          <ol>
            <li><strong>Find the answer by block type.</strong> Join the <code>text</code> of the blocks with <code>type == "text"</code>. Never read <code>content[0].text</code>.</li>
            <li><strong>Check <code>stop_reason</code> first.</strong> <code>"max_tokens"</code> with no text block means "no answer". With a text block, it means "the answer is cut off". Do not show either as a complete answer.</li>
            <li><strong>Compute the cost from <code>usage.output_tokens</code>.</strong> This number includes the thinking tokens, also when you see only a summary or nothing. If you count the tokens of the visible answer, your cost estimate is too low.</li>
            <li><strong>Do not use the thinking text in your program logic.</strong> It is a summary, it can change between runs, and it can be empty. Use the text block for the answer.</li>
            <li><strong>Send thinking blocks back unchanged.</strong> In a conversation with more than one turn (and in tool use, Topic 4), the next request contains the earlier assistant content. Keep the thinking blocks in it exactly as you got them. If you change or remove them, the API can return an error.</li>
          </ol>
          <p>Streaming (lesson 1.1): with the default display <code>"omitted"</code>, the thinking block streams with empty text. The model still thinks during that time, so a chat window shows a pause before the first word. Show a "thinking" indicator, or set <code>display</code> to <code>"summarized"</code> and show the summary. The "Thinking" docs page says that <code>"omitted"</code> starts the answer text sooner than <code>"summarized"</code>, because the server does not stream the thinking.</p>` },
        { type: "note", kind: "warn", title: "Do not set max_tokens from the answer length", html: `
          <p>A <code>max_tokens</code> value that worked well for a model without thinking can be much too small for a model with thinking. Set it from measurements: log <code>usage.output_tokens</code> for real requests at your effort level, and set the limit well above the largest value that you saw.
          Then alert when <code>stop_reason == "max_tokens"</code>. For very large output, the API needs streaming.</p>` }
      ],
      checks: [
        { id: "l1-9-L2-a", type: "mcq",
          q: "You call Claude Opus 5.5 with max_tokens = 4,096 at effort xhigh. The model wants 5,000 thinking tokens. What do you get?",
          options: [
            "An error 400, because the effort is too high for max_tokens.",
            "A short answer, because the model reduces its thinking to fit.",
            "stop_reason \"max_tokens\", one thinking block and no text block, and a bill for 4,096 output tokens.",
            "A complete answer, because thinking tokens do not count against max_tokens."
          ],
          correct: 2,
          explain: "Thinking counts against max_tokens. In this toy, the model wants 5,000 thinking tokens, so the response stops after 4,096 output tokens, all of them thinking. On Opus 5.5 with 900 input tokens, that costs $0.0855 for no answer. The interactive shows this case." },
        { id: "l1-9-L2-b", type: "mcq",
          q: "On Claude Opus 5.5, how do you ask for less thinking on a simple request?",
          options: [
            "Set output_config={\"effort\": \"low\"}.",
            "Set thinking={\"type\": \"disabled\"}.",
            "Set thinking={\"type\": \"enabled\", \"budget_tokens\": 1024}.",
            "Set temperature=0."
          ],
          correct: 0,
          explain: "Effort is the only control on Opus 5.5. Thinking is always on there: \"disabled\" and budget_tokens return error 400. Lesson 1.1 says that the current models reject temperature." },
        { id: "l1-9-L2-c", type: "recall",
          q: "Write the cost formula for one request with thinking, and say where each number comes from.",
          answer: "cost = input_tokens × input price + output_tokens × output price. Both token counts come from response.usage. usage.output_tokens includes the thinking tokens and the answer tokens, also when the thinking text is a summary or empty. The prices come from the pricing page (in the course, the price table of lesson 1.1)." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "Why thinking works, how models learn it, and how to choose the effort with data",
      blocks: [
        { type: "html", html: `
          <h3>Why more tokens can give a better answer</h3>
          <p>Lesson 1.5 showed that one new token is one pass through all the blocks. The work for one token is fixed by the model size. It does not change because the question is hard.</p>
          <ul>
            <li>Some problems need more steps than one pass can do. A multi-step calculation is an example: step 3 needs the result of step 2.</li>
            <li>Each thinking token gives the model one more pass. So more thinking tokens give more computation for the same answer. This is often called <strong>test-time compute</strong>: compute that you spend when you use the model, not when you train it.</li>
            <li>The thinking tokens also keep the intermediate results in the context. Attention (lesson 1.4) can read them at the next step. Without them, the model must hold all intermediate results inside its vectors during one pass.</li>
          </ul>
          <p>An early result: the chain-of-thought paper (Wei et al., 2022) put examples with written steps in the prompt. Large models then wrote steps too, and their results on math word problems improved. Reasoning models do this on their own, without examples in the prompt.</p>` },
        { type: "html", html: `
          <h3>How a model learns to think</h3>
          <p>A model learns to use thinking tokens in <strong>post-training</strong>, after pretraining (lesson 1.6, "Pretraining and post-training (SFT, RLHF, DPO)"). One published method is reinforcement learning on tasks where a program can check the final answer, for example math problems with known answers and code with tests.
          The model writes thinking and an answer. A correct answer gives a reward. Training then makes the thinking that led to correct answers more probable. The DeepSeek-R1 paper (2025, in the resources) describes such a method in detail.</p>
          <p>This explains two facts that you see in production:</p>
          <ul>
            <li><strong>Thinking helps most on tasks like the training tasks:</strong> math, code, logic and plans with clear steps. It helps less on tasks with no clear steps, such as a short reply in a chat.</li>
            <li><strong>Training rewards the answer, not true thinking text.</strong> So the thinking text is not a guaranteed record of the real reasons. A 2025 study (Chen et al., "Reasoning Models Don't Always Say What They Think", in the resources) found that reasoning models often did not mention a hint in the prompt that they used for their answer.</li>
          </ul>` },
        { type: "note", kind: "limit", title: "Diminishing returns and overthinking", html: `
          <p>The effort documentation says this for Claude Opus 4.7: on most workloads, the max level adds much cost for a relatively small quality gain, and on some tasks it can lead to overthinking. For Claude Sonnet 5.5 and Claude Haiku 5.5, it says: use xhigh or max only where your evals show a quality gain. More thinking costs more on every request, but it improves the result only up to some point.
          The point is different for each task and each model. Find it with an eval, not with a guess.</p>` },
        { type: "html", html: `
          <h3>Choose the effort with an eval</h3>
          <p>Cost per request is the wrong number. A cheap request that gives a wrong answer is not cheap. Use these steps (Topic 5 covers evals in depth):</p>
          <ol>
            <li>Collect real requests of one kind with a known correct answer, or a clear grading rule.</li>
            <li>Run the set at two or three effort levels. Record correct or wrong, <code>usage.output_tokens</code>, the time, and <code>stop_reason</code>.</li>
            <li>For each level, compute the <strong>cost per correct answer</strong>: total cost / number of correct answers.</li>
            <li>Add the <strong>cost of a wrong answer</strong> in your product: a support agent who must fix it, a refund that was wrong, a user who leaves.</li>
            <li>Select the level with the lowest total cost that meets your quality bar and your time limit. Route different kinds of requests to different levels (Topic 6 covers routing).</li>
          </ol>` },
        { type: "worked", title: "Worked example: cost per correct answer",
          intro: "A made-up eval of 100 refund questions on Claude Opus 5.5. Each question has 900 input tokens. Effort low: 600 output tokens on average, 62 correct. Effort high: 3,100 output tokens on average, 91 correct. These results are made up for teaching.",
          steps: [
            { html: "Low: one request costs 900 × $4 / 1,000,000 + 600 × $20 / 1,000,000 = $0.0036 + $0.012 = $0.0156. 100 requests cost <strong>$1.56</strong>. $1.56 / 62 = <strong>$0.0252</strong> per correct answer." },
            { html: "High: one request costs $0.0036 + 3,100 × $20 / 1,000,000 = $0.0656. 100 requests cost <strong>$6.56</strong>. $6.56 / 91 = <strong>$0.0721</strong> per correct answer." },
            { html: "High costs about 2.9 times more per correct answer, but it gives 29 more correct answers. The model cost alone does not decide. The cost of a wrong answer decides." },
            { faded: true, html: "Your turn. A support agent must fix each wrong refund. This costs $0.50 of work. Compute the total cost of 100 refunds at each effort level. Which level is cheaper?",
              answer: "Low: $1.56 + 38 wrong × $0.50 = $1.56 + $19.00 = $20.56. High: $6.56 + 9 wrong × $0.50 = $6.56 + $4.50 = $11.06. The high effort is cheaper overall, although its model cost is 4.2 times higher. For the classify task, the result is the opposite: low already meets the bar, so high only adds cost." }
          ] },
        { type: "code", lang: "python", code:
`from dataclasses import dataclass

@dataclass
class Run:
    correct: bool
    # From usage.input_tokens and usage.output_tokens.
    cost_usd: float

def cost_per_correct(runs: list[Run]) -> float | None:
    """Total cost / correct answers. None if no answer is correct."""
    n = sum(1 for r in runs if r.correct)
    return sum(r.cost_usd for r in runs) / n if n else None

def total_cost(runs: list[Run], cost_of_wrong_usd: float) -> float:
    wrong = sum(1 for r in runs if not r.correct)
    return sum(r.cost_usd for r in runs) + cost_of_wrong_usd * wrong

low = [Run(i < 62, 0.0156) for i in range(100)]
high = [Run(i < 91, 0.0656) for i in range(100)]
# Prints 0.0252 0.0721
print(round(cost_per_correct(low), 4), round(cost_per_correct(high), 4))
# Prints 20.56 11.06
print(round(total_cost(low, 0.50), 2), round(total_cost(high, 0.50), 2))` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>A real eval also needs enough questions to trust the difference, a check of the time limit (p95, not only the mean), and a second run, because the outputs can change between runs. Ticket T-009 asks you to run a small version and to say what you can and cannot conclude from it.</p>` },
        { type: "html", html: `
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>Pretraining and post-training (lesson 1.6).</strong> Post-training with rewards is where a model learns to use its thinking tokens.</li>
            <li><strong>Context window and KV cache (lesson 1.7).</strong> Thinking tokens are tokens in the context while the model writes the answer. The KV cache stores their keys and values, so long thinking uses context space and memory.</li>
            <li><strong>Hallucination and grounding (lesson 1.8).</strong> Thinking can help the model check a claim against the documents in the prompt. It does not give the model facts that are not in the prompt or in its training data.</li>
            <li><strong>Evals and routing (Topics 5 and 6).</strong> Choose the effort per kind of request with an eval, and route each kind to its level.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-9-L3-a", type: "mcq",
          q: "Why can thinking tokens improve the answer to a multi-step problem?",
          options: [
            "They switch the model to a larger set of weights.",
            "Each token is one fixed pass through the model. More tokens give more passes, and the intermediate results stay in the context, where attention can read them.",
            "They give the model access to the internet.",
            "They make the model's sampling deterministic."
          ],
          correct: 1,
          explain: "The work per token is fixed by the model size. Thinking adds tokens, so it adds computation, and it writes the intermediate results down where later steps can read them. The model and its weights stay the same." },
        { id: "l1-9-L3-b", type: "mcq",
          q: "100 questions at effort low cost $1.56 in total, and 62 answers are correct. What is the cost per correct answer?",
          options: ["$0.0156", "$0.0252", "$0.0656", "$0.0721"],
          correct: 1,
          explain: "$1.56 / 62 = $0.0252. $0.0156 is the cost of one request. $0.0721 is the cost per correct answer at effort high in the worked example." },
        { id: "l1-9-L3-c", type: "recall",
          q: "Why is the thinking text not a reliable record of how the model got its answer?",
          answer: "Training rewards correct answers, not true descriptions of the reasons. Research found that reasoning models often did not mention a hint that they used. Also, the API returns only a summary or an empty field. So use the thinking text to debug and to learn, not as proof or as input to program logic." }
      ]
    }
  ],

  debugging: [
    { id: "l1-9-dbg-1", title: "The answer code crashes on some requests",
      symptom: "After you set the effort to high, about one request in twenty crashes in the code that prints the answer. The other requests work.",
      evidence: "AttributeError: 'ThinkingBlock' object has no attribute 'text'  (stop_reason=max_tokens, output_tokens=1024)",
      hints: [
        "What is the type of the first block in response.content when the model thinks?",
        "What does output_tokens = 1024 tell you about max_tokens?"
      ],
      answer: "The code reads response.content[0].text, but block 0 is now a thinking block. On the failing requests, the thinking used all 1,024 tokens of max_tokens, so there is no text block at all. Fix: find the answer by block type, check stop_reason first and report \"no answer\" for max_tokens, and raise max_tokens from measured usage.output_tokens. Add a test with a fake response that has only a thinking block." },
    { id: "l1-9-dbg-2", title: "The cost dashboard is much lower than the bill",
      symptom: "Your dashboard estimates the output cost from the length of the answer text. After the switch to a reasoning setup, the bill is about ten times the dashboard.",
      evidence: "estimated output tokens (from the answer text): 180    usage.output_tokens: 2,940",
      hints: [
        "Which tokens does usage.output_tokens contain that the answer text does not?",
        "Does display \"omitted\" change what you pay?"
      ],
      answer: "The dashboard counts only the visible answer. usage.output_tokens also contains the thinking tokens, and you pay for them under every display setting. Fix: compute the cost from usage.input_tokens and usage.output_tokens of each response, as in T-001. Add a test that a response with a short answer and many output tokens gives the higher cost." },
    { id: "l1-9-dbg-3", title: "An old example returns error 400",
      symptom: "You copy an extended thinking example from an old blog post. Every request to claude-opus-5-5 now fails before the model starts.",
      evidence: "anthropic.BadRequestError: Error code: 400 ... \"thinking.type.enabled\" is not supported for this model. Use \"thinking.type.adaptive\" and \"output_config.effort\" to control thinking behavior.   request: thinking={\"type\": \"enabled\", \"budget_tokens\": 8000}",
      hints: [
        "Which thinking control does the old example use?",
        "Which control does Opus 5.5 accept for the amount of thinking?"
      ],
      answer: "budget_tokens is the control of older models. Claude Opus 5.5 rejects it, and thinking is always on there. Fix: remove the thinking budget and set output_config={\"effort\": ...} instead. Check the model's page in the docs before you copy an example, and add a test that the request has no budget_tokens field." }
  ],

  recall: [
    { id: "l1-9-r1", q: "What are thinking tokens, and how are they billed?", a: "Output tokens that the model writes before its answer to work through the problem. They are billed at the output price and count against max_tokens, also when the API shows only a summary or nothing." },
    { id: "l1-9-r2", q: "Why can thinking improve answers on multi-step tasks?", a: "Each token is one fixed pass through the model. More tokens give more computation (test-time compute), and the intermediate results stay in the context, where attention can read them." },
    { id: "l1-9-r3", q: "How do you control the amount of thinking on Claude Opus 5.5?", a: "With output_config={\"effort\": ...}: low, medium, high, xhigh or max. The default is medium. Thinking is always on: \"disabled\" and budget_tokens return error 400." },
    { id: "l1-9-r4", q: "What happens when the thinking uses all of max_tokens?", a: "The response stops with stop_reason \"max_tokens\". It has a thinking block and no text block. You pay for all the output tokens. Raise max_tokens or lower the effort." },
    { id: "l1-9-r5", q: "How do you read the answer from a response that has thinking?", a: "Check stop_reason first. Join the text of the blocks with type \"text\". Never read content[0].text. Do not use the thinking text in program logic. Send thinking blocks back unchanged in later turns." },
    { id: "l1-9-r6", q: "Which number do you use to compare effort levels?", a: "The cost per correct answer on an eval (total cost / correct answers), plus the cost of each wrong answer in your product. Cost per request alone is misleading." },
    { id: "l1-9-r7", q: "When does extra thinking not help?", a: "On tasks with few steps: lookup, classification with clear labels, a format change, a short chat reply. Also above some effort level, where the returns get smaller and the model can overthink. Measure to find the point." }
  ],

  interview: [
    { q: "When do you use a reasoning model or a high effort level, and when not?",
      outline: "Use it for multi-step work: calculations, plans, code, logic, agent tasks with many tools. Not for lookup, classification, extraction or short chat. Thinking costs output tokens (5 times the input price for Claude), time to the first word, and max_tokens space. Decide per request kind with an eval: cost per correct answer plus the cost of a wrong answer. Route kinds to effort levels." },
    { q: "Why do thinking tokens improve accuracy?",
      outline: "Fixed compute per token (one pass through all blocks). More tokens give more serial computation (test-time compute). The intermediate results stay in the context for attention. Chain-of-thought prompting showed the effect; reasoning models learn it in post-training with rewards on checkable answers. Returns get smaller at high effort." },
    { q: "Your LLM cost went up three times after you enabled thinking. How do you find out why and fix it?",
      outline: "Compute the cost from usage, not from the visible text. Split output tokens into thinking and answer per request kind. Find the kinds where thinking does not improve the result (eval at two effort levels). Lower the effort or route those kinds to a cheaper model. Check max_tokens truncations that cost money with no answer. Watch the latency at p95." },
    { q: "How do you handle a response from a model with thinking in production code?",
      outline: "Check stop_reason (end_turn, max_tokens, refusal). Extract text blocks by type. Treat max_tokens with no text as no answer, with an alert. Log usage.output_tokens and the effort. Do not parse or show the thinking text as the reason. In multi-turn and tool use, pass thinking blocks back unchanged. Streaming: show a thinking indicator, because omitted thinking streams as empty text." },
    { q: "Is the visible thinking a good explanation of the model's decision for an audit?",
      outline: "No. On current Claude models, you get a summary or nothing, never the full text. Training rewards answers, not true descriptions. Research found that models often leave out hints that they used. For an audit, log the inputs, the outputs, the retrieved documents and the tool calls, and test behavior with evals." }
  ],

  misconceptions: [
    { wrong: "Thinking tokens are free, because I do not see them.", right: "They are billed as output tokens under every display setting. usage.output_tokens includes them." },
    { wrong: "Thinking tokens do not count against max_tokens.", right: "They do. If the thinking uses all of max_tokens, the response has no text block." },
    { wrong: "More effort always gives a better answer.", right: "It helps multi-step tasks up to some point. On simple tasks it adds cost and time with little gain. The effort docs say: use xhigh or max only where your evals show a quality gain." },
    { wrong: "The thinking text shows exactly why the model gave its answer.", right: "It is a summary or empty, and research shows that the thinking can leave out reasons that the model used. Do not use it as proof." },
    { wrong: "A reasoning model is a different kind of machine.", right: "It is the same next-token loop. Post-training taught it to write useful thinking tokens before the answer." },
    { wrong: "budget_tokens is the way to control thinking on every Claude model.", right: "On the current models, use the effort setting. Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5 reject budget_tokens with error 400." },
    { wrong: "The cheapest effort per request is the cheapest choice.", right: "Compare the cost per correct answer and add the cost of a wrong answer. A higher effort can be cheaper overall." }
  ],

  resources: [
    { title: "Thinking", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/thinking",
      when: "Read after level 1, before level 2.",
      why: "The reference for how to set the thinking field on each model, the display field, streaming, billing, and how to send thinking blocks back in tool use and in multi-turn conversations.",
      watchFor: [
        "What does each current model do when you omit the thinking field?",
        "How does the page say you are billed when you see only a summary or an empty field?",
        "What must you do with thinking blocks when you send the conversation back to the API?"
      ] },
    { title: "Effort", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/effort",
      when: "Read with level 2.",
      why: "The levels, the default level of each model, and what effort changes besides the thinking.",
      watchFor: [
        "Which level does the page recommend for coding and agent work, and which for simple tasks?",
        "What does the page say about the max level?"
      ] },
    { title: "Troubleshooting thinking", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting",
      when: "Read after level 2, with the debugging cases.",
      why: "A table of the thinking values that each model rejects with error 400, the exact error messages, and the fixes for an empty thinking field and a stop at max_tokens.",
      watchFor: [
        "Which thinking values does each current model reject with error 400?",
        "What does the page say to do when the response stops with stop_reason \"max_tokens\"?"
      ] },
    { title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", by: "Wei et al. (2022)", kind: "Paper, optional", url: "https://arxiv.org/abs/2201.11903",
      when: "Optional, after level 3. Read the abstract and look at the first figure.",
      why: "The early result that written steps improve large models on multi-step problems.",
      watchFor: [
        "What does a chain-of-thought example in the prompt look like?",
        "Does the effect appear in small models too, or only in large models?"
      ] },
    { title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", by: "DeepSeek-AI (2025)", kind: "Paper, optional", url: "https://arxiv.org/abs/2501.12948",
      when: "Optional, after level 3. Read the abstract and the introduction.",
      why: "A detailed public description of how reinforcement learning on checkable answers teaches a model to think.",
      watchFor: [
        "Which kinds of tasks give the rewards, and how is the answer checked?",
        "What does the paper say about how the length of the thinking changes during training?"
      ] },
    { title: "Reasoning Models Don't Always Say What They Think", by: "Chen et al. (2025)", kind: "Paper, optional", url: "https://arxiv.org/abs/2505.05410",
      when: "Optional, after level 3. Read the abstract.",
      why: "The study behind the level 3 statement that the thinking text often does not mention a hint that the model used.",
      watchFor: [
        "How did the authors find out that a model used a hint?",
        "How often did the models mention a hint that they used?"
      ] }
  ],

  summary: `
    <ul>
      <li>A reasoning model writes thinking tokens before its answer. They come from the same next-token loop.</li>
      <li>Thinking helps on multi-step tasks: more tokens give more computation, and the intermediate results stay in the context.</li>
      <li>Thinking tokens are billed as output tokens and count against max_tokens. If they use all of it, there is no answer.</li>
      <li>On the current Claude models, effort (low to max) controls the thinking. Opus 5.5 always thinks. budget_tokens returns error 400.</li>
      <li>Read the answer by block type, check stop_reason first, and compute the cost from usage.output_tokens.</li>
      <li>The thinking text is a summary or empty, and it is not a reliable record of the model's reasons.</li>
      <li>Choose the effort per kind of request with an eval: cost per correct answer plus the cost of a wrong answer.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer why a model gets better at a refund calculation when it thinks first, and what that costs. Use the numbers of the refund task: $0.0146 at low and $0.0646 at high on Opus 5.5, and the max_tokens case that costs $0.0855 for no answer. Then explain why the cost per correct answer decides, not the cost per request. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-009"]
};

/* ====================================================================== T-009 */
window.ACADEMY.tickets["T-009"] = {
  id: "T-009",
  title: "Effort control and a safe answer check for responses with thinking",
  lesson: "1.9",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 1.5 to 2.5 hours. Milestone 4 makes about 20 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Add effort control to the T-001 client and CLI. Make the answer check safe for responses that contain thinking blocks or that stop at <code>max_tokens</code>.
      Put the logic in a new pure module, <code>assistant/thinking.py</code>, and prove it with tests that are named after the properties they check.
      Then write a small effort sweep that measures the cost per correct answer of two effort levels on your own eval set.</p>
      <p><strong>Real-world problem.</strong> Teams turn on a higher effort to fix a few hard requests. Then the bill goes up on every request, some requests return no answer because the thinking used all of <code>max_tokens</code>, and code that reads the first block crashes.
      This ticket gives the assistant the controls and the checks to prevent these failures, and a measurement to choose the effort with data.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      Phase 2 puts the assistant behind a FastAPI service. Each endpoint then needs an effort setting for its kind of request, and this ticket prepares that decision. This ticket adds no endpoint.</p>
      <p>This ticket depends on T-001 only: the project, the virtual environment, pytest, the client in <code>assistant/llm.py</code>, the price table in <code>assistant/pricing.py</code>, the measurement line and the fake client of the T-001 tests.
      It extends <code>llm.py</code> and <code>cli.py</code> and adds new files. The behavior of T-001 without the new options does not change.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.9, levels 1 and 2 complete. Level 3 helps for milestone 4.</li>
        <li>T-001 done: <code>ask</code> streams an answer and prints the measurement line, and its tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestones 1 and 4 only.</li>
        <li>No new package. Use the <code>anthropic</code> SDK of T-001 and the Python standard library.</li>
        <li>Read the docs pages "Thinking" and "Effort" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>ask --effort high "question"</code> sends the effort to the model. The allowed values are <code>low</code>, <code>medium</code>, <code>high</code>, <code>xhigh</code> and <code>max</code>. Without <code>--effort</code>, the request is the same as in T-001.</li>
        <li><code>ask --show-thinking "question"</code> asks for a thinking summary and prints it under the header "Thinking summary", before the answer. Without this option, the CLI prints no thinking text.</li>
        <li>The measurement line of T-001 gets two new fields: <code>effort</code> (the effort level, or <code>default</code>) and <code>answer</code> (<code>ok</code>, <code>incomplete</code>, <code>no_answer</code> or <code>refusal</code>). Example: <code>effort=high answer=ok</code>.</li>
        <li>When the response has no text block and <code>stop_reason</code> is <code>max_tokens</code>, the CLI prints one clear line that names max_tokens and the output tokens used, suggests a larger <code>--max-tokens</code> or a lower <code>--effort</code>, and exits with a code that is not 0.</li>
        <li><code>python scripts/effort_sweep.py</code> runs every question of <code>data/reasoning_eval.json</code> at two effort levels (default: <code>low</code> and <code>high</code>) on <code>claude-haiku-5-5</code>, and prints one table row for each question kind and effort: correct answers, mean output tokens, median total time, total cost and cost per correct answer.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>llm.py</code> stays the only module that calls the API. Its call function gets two optional parameters: <code>effort: str | None = None</code> and <code>show_thinking: bool = False</code>.</li>
        <li>With an effort, the request contains <code>output_config={"effort": effort}</code>. With <code>show_thinking</code>, it contains <code>thinking={"type": "adaptive", "display": "summarized"}</code>. Never send <code>budget_tokens</code>, <code>{"type": "disabled"}</code> or <code>temperature</code>.</li>
        <li><code>assistant/thinking.py</code> contains pure functions only: <code>EFFORT_LEVELS</code>, <code>validate_effort</code>, <code>check_answer</code>, <code>cost_per_correct</code> and <code>choose_effort</code>. No API calls, no printing, no global state.</li>
        <li><code>validate_effort</code> raises <code>ValueError</code> with a message that lists the five allowed values. The CLI calls it before any API call.</li>
        <li><code>check_answer(stop_reason, blocks)</code> returns a dataclass with <code>status</code>, <code>text</code> (joined from the blocks with type "text" only) and <code>thinking_summary</code>. It never reads a block by its position.</li>
        <li>The cost comes from <code>usage.input_tokens</code> and <code>usage.output_tokens</code> with the T-001 price table. Do not count the tokens of the answer text yourself.</li>
        <li>The streamed answer shows text only. Thinking deltas never appear in the answer.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given <code>effort="high"</code>, when the call function runs with the fake client, then the request arguments contain <code>output_config={"effort": "high"}</code> and contain no <code>budget_tokens</code>.</li>
        <li>Given no effort and <code>show_thinking=False</code>, the request arguments are equal to the T-001 request, and all T-001 tests pass without a change.</li>
        <li>Given <code>--effort extreme</code>, the CLI prints an error that lists the five allowed values, exits with a code that is not 0, and the fake client records 0 calls.</li>
        <li>Given the content [thinking block, text block "100"] and <code>stop_reason="end_turn"</code>, <code>check_answer</code> returns status <code>ok</code> and text "100". The thinking text is not in <code>text</code>.</li>
        <li>Given the content [thinking block only] and <code>stop_reason="max_tokens"</code>, <code>check_answer</code> returns status <code>no_answer</code>, and the CLI prints the max_tokens line with no stack trace.</li>
        <li>Given usage of 900 input and 3,050 output tokens at the Opus 5.5 prices of the T-001 table ($4 and $20 per million), the cost is 0.0646 (tolerance 1e-9). This is the effort-high example of the lesson.</li>
        <li>Given 100 runs that cost $1.56 in total with 62 correct answers, <code>cost_per_correct</code> returns 0.02516 (tolerance 1e-5). Given 0 correct answers, it returns <code>None</code>.</li>
        <li>With a real key, <code>ask --model claude-haiku-5-5 --effort low</code> and <code>--effort high</code> on the refund question of the eval set both print a measurement line. The handoff records both lines.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>Look at a real response (guided).</strong> In a scratch script, call <code>claude-haiku-5-5</code> with <code>effort="high"</code> and <code>display="summarized"</code> on the refund question. Print the type of each block, <code>stop_reason</code> and <code>usage</code>.
        Then set <code>max_tokens</code> to 300 and call again. Write down what the content contains and what <code>usage.output_tokens</code> shows. Do not keep this script.</li>
        <li><strong>The safe answer check (guided).</strong> Write the tests for criteria 4 and 5 first, with fake blocks. Then write <code>check_answer</code> in <code>thinking.py</code> and use it in the CLI.</li>
        <li><strong>Effort control (independent).</strong> Add <code>validate_effort</code>, the two parameters in <code>llm.py</code> and the two CLI options. Add the tests for criteria 1, 2, 3 and 6. Add the two fields to the measurement line.</li>
        <li><strong>The effort sweep and the handoff (independent).</strong> Write 10 questions in <code>data/reasoning_eval.json</code>: 5 of kind <code>classify</code> and 5 of kind <code>multi_step</code>, each with an answer that you computed yourself. Write <code>cost_per_correct</code> with the test of criterion 7, then <code>scripts/effort_sweep.py</code>. Run it one time. Fill in <code>handoffs/T-009-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost of milestone 4: 10 questions × 2 levels = 20 calls. If each call uses 500 input and 4,000 output tokens, the cost at the Haiku 5.5 prices of the T-001 table is 20 × (500 × $0.10 + 4,000 × $0.50) / 1,000,000 = about $0.04. The script prints the real total.</p>
      <p class="muted">Stretch, optional: add <code>choose_effort(kind, table)</code>, which returns the effort for a question kind from a table in your config, with <code>medium</code> for an unknown kind. Fill the table from your sweep results, and explain the choice in the handoff.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                  # from T-001: add effort and show_thinking (no change without them)
    pricing.py              # from T-001 (no change)
    cli.py                  # from T-001: add --effort and --show-thinking, new measurement fields
    thinking.py             # EFFORT_LEVELS, validate_effort, check_answer, cost_per_correct,
                            # choose_effort (stretch)
  data/
    reasoning_eval.json     # 10 questions with your own answers (format below)
  scripts/
    effort_sweep.py         # milestone 4: paid calls to claude-haiku-5-5
  tests/
    test_thinking.py        # check_answer, validate_effort, cost_per_correct
    test_llm.py             # from T-001: add the effort and request tests
  tickets/
    T-009.md                # this ticket (generated)
  handoffs/
    T-009-handoff.md        # your handoff (template generated)</code></pre>
      <p>Format of <code>data/reasoning_eval.json</code>, with two example questions. The script adds an instruction to end the answer with a line that starts with "ANSWER:" and the value, for example "ANSWER: 100". It grades the value by an exact match.</p>
      <pre><code>[
  {"id": "classify-1", "kind": "classify",
   "question": "Labels: billing, shipping, account, product, refund, other. Ticket: 'I was charged twice for order 5521.' Reply with one label.",
   "expected": "billing"},
  {"id": "refund-1", "kind": "multi_step",
   "question": "Rules: (1) An item returned within 30 days gets a full refund. (2) An item returned after 30 days and within 60 days gets 50%. (3) Shipping is refunded only if an item was damaged. (4) Subtract the coupon share of each item, in proportion to its price, before you apply rule 1 or 2. Order: item A $80, returned on day 20, damaged. Item B $40, returned on day 45, not damaged. Shipping $10. Coupon $12 on the order. What is the refund in USD? Give a number.",
   "expected": "100"}
]</code></pre>
      <p>Check the example: the coupon shares are $8 for A and $4 for B. A: $80 − $8 = $72, full refund. B: ($40 − $4) × 50% = $18. Shipping: A was damaged, so $10. Total: $72 + $18 + $10 = $100.</p>
      <p>Do not change <code>assistant/pricing.py</code> for this ticket. Change <code>llm.py</code> and <code>cli.py</code> only as the requirements say.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_effort_is_sent_in_output_config</code></td><td><code>effort="high"</code>, fake client</td><td>Request has <code>output_config={"effort": "high"}</code></td></tr>
        <tr><td><code>test_request_never_contains_a_thinking_budget</code></td><td>Each of the five effort levels, with and without <code>show_thinking</code></td><td>No <code>budget_tokens</code>, no <code>"disabled"</code>, no <code>temperature</code></td></tr>
        <tr><td><code>test_default_request_is_unchanged_from_t001</code></td><td>No effort, <code>show_thinking=False</code></td><td>The same request arguments as T-001</td></tr>
        <tr><td><code>test_show_thinking_asks_for_a_summary</code></td><td><code>show_thinking=True</code></td><td>Request has <code>thinking={"type": "adaptive", "display": "summarized"}</code></td></tr>
        <tr><td><code>test_unknown_effort_raises_before_any_call</code></td><td><code>"extreme"</code></td><td><code>ValueError</code> that lists the five values; the fake client has 0 calls</td></tr>
        <tr><td><code>test_answer_text_comes_only_from_text_blocks</code></td><td>[thinking "step 1...", text "100"]</td><td>Status <code>ok</code>, text "100"</td></tr>
        <tr><td><code>test_answer_check_does_not_depend_on_block_order</code></td><td>[text "100"] and [thinking, text "100"]</td><td>The same text for both</td></tr>
        <tr><td><code>test_only_thinking_at_max_tokens_is_no_answer</code></td><td>[thinking], <code>"max_tokens"</code></td><td>Status <code>no_answer</code>, text ""</td></tr>
        <tr><td><code>test_text_at_max_tokens_is_incomplete</code></td><td>[thinking, text "The refund is"], <code>"max_tokens"</code></td><td>Status <code>incomplete</code></td></tr>
        <tr><td><code>test_refusal_is_not_shown_as_an_answer</code></td><td><code>"refusal"</code></td><td>Status <code>refusal</code></td></tr>
        <tr><td><code>test_cost_counts_thinking_as_output</code></td><td>900 in, 3,050 out, Opus 5.5 prices</td><td>0.0646</td></tr>
        <tr><td><code>test_cost_per_correct_matches_lesson_example</code></td><td>100 runs, $1.56 total, 62 correct</td><td>0.02516 (tolerance 1e-5)</td></tr>
        <tr><td><code>test_cost_per_correct_with_no_correct_answer_is_none</code></td><td>10 runs, 0 correct</td><td><code>None</code>, no division error</td></tr>
        <tr><td><code>test_cli_prints_no_thinking_without_the_option</code></td><td>Fake response with a thinking summary, no <code>--show-thinking</code></td><td>The summary text is not in the output</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table. Build the fake blocks as small objects with a <code>type</code> field. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests and for the sweep. The sweep prints its total cost. Run it one time, then read the results. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> never show an incomplete or empty response as a complete answer. Every <code>max_tokens</code> stop is visible in the measurement line.</li>
        <li><strong>Latency:</strong> record the total time of each call in the sweep. A higher effort gives a longer time before the first answer word. Report the median, and say that 10 questions are too few for a p95.</li>
        <li><strong>Security:</strong> the key comes only from the environment. The thinking summary can contain user data from the prompt, so the CLI prints it only with <code>--show-thinking</code> and never writes it to a log.</li>
      </ul>`,
    questions: `
      <ol>
        <li>In milestone 1, what did the content contain with <code>max_tokens=300</code>? What did <code>usage.output_tokens</code> show, and what did that request cost?</li>
        <li>Give your sweep table. For each question kind, which effort would you select, and why?</li>
        <li>Suppose a wrong refund answer costs $0.50 of support work. Use your numbers: which effort is cheaper overall for the <code>multi_step</code> kind?</li>
        <li>Why must the cost come from <code>usage.output_tokens</code> and not from the length of the visible answer?</li>
        <li>Your eval has 10 questions and one run. What can you conclude from it, and what can you not conclude? What would you change before you use the result in production?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, two measurement lines, the sweep table).</li>
        <li><code>pytest</code> passes with the network off, and the T-001 tests did not change.</li>
        <li>You computed the expected answer of each eval question yourself before you ran the sweep.</li>
        <li>You can explain each line of <code>thinking.py</code> without notes, and why <code>check_answer</code> never reads a block by its position.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> <code>llm.py</code> is still the only module that calls the API; the request never contains a thinking budget, "disabled" or a sampling setting;
      the answer is found by block type and <code>stop_reason</code> is checked first; the cost comes from <code>usage</code>; the tests are named after properties and run with the network off; the sweep reports the cost per correct answer; and how well your answers to the questions use your own measurements.</p>`
  }
};
