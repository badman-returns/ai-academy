/*
 * Lesson 1.6 - Pretraining and post-training (SFT, RLHF, DPO).
 * Ticket T-006 - Training objectives by hand: losses, SFT records and preference pairs.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Worked examples:
 *   Pretraining loss: target probabilities 0.2, 0.5, 0.8 -> losses 1.609, 0.693, 0.223,
 *   mean 0.842, perplexity 2.321. Uniform over 50,000 tokens -> ln 50,000 = 10.82.
 *   SFT loss with a mask: probabilities 0.9, 0.95, 0.99, 0.9 (prompt, mask 0) and
 *   0.5, 0.25, 0.8, 0.9 (reply, mask 1) -> 2.408 / 4 = 0.602. Without the mask: 0.335.
 *   Reward model (Bradley-Terry): r = 1.5 and 0.5 -> sigmoid(1) = 0.731, loss 0.313.
 *   KL-regularized optimum: reference [0.5, 0.5], rewards [1, 0], beta 1 -> [0.731, 0.269].
 *   DPO: beta 0.1, log-ratios +2 and -1 -> margin 0.3, loss 0.554. Equal policies -> ln 2 = 0.693.
 * The interactive for this lesson is in 06-ix.js (id "l1-6-training"). Its toy numbers are
 * also the fixture of ticket T-006.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["1.6"] = {
  id: "1.6",
  topic: "t1",
  title: "Pretraining and post-training (SFT, RLHF, DPO)",
  objective: "Explain how pretraining sets the weights of a model with next-token prediction, how post-training (SFT, then RLHF or DPO) changes a base model into a chat model, compute each training loss by hand on small numbers, and say what each stage means for an application engineer.",
  prerequisites: [
    "Lesson 1.1: logits, softmax and next-token prediction.",
    "Lesson 1.5: the transformer block and its weights. This lesson explains how those weights get their values.",
    "You can use the natural logarithm (ln) and the exponential function (exp) on a calculator. No calculus course is necessary."
  ],
  covers: ["t1-pretraining", "t1-posttraining"],
  whyItMatters: `
    <p>Lessons 1.1 to 1.5 showed what the model computes. All the weights in those lessons start as random numbers. <strong>Training</strong> gives them their values. Training has two large stages, and each stage gives the model different behavior.</p>
    <p>For an application engineer, this explains many things that you see in production. The knowledge of a model and its knowledge cutoff come from <strong>pretraining</strong>. The habit of following instructions, the answer format, the tone and the refusals come from <strong>post-training</strong>.
    It also explains why a model can sound sure and still be wrong: pretraining rewards text that is probable, not text that is true.
    In an interview, "explain RLHF" and "what is the difference between a base model and a chat model" are common questions. A good answer names the data and the loss of each stage.</p>`,
  concepts: [
    { id: "l1-6-c-pretrain", name: "Pretraining: self-supervised next-token prediction with the cross-entropy loss" },
    { id: "l1-6-c-base", name: "A base model continues documents. A chat model follows instructions" },
    { id: "l1-6-c-sft", name: "SFT: the same loss on demonstration replies, with a loss mask on the prompt" },
    { id: "l1-6-c-rm", name: "Preference pairs and the reward model (Bradley-Terry)" },
    { id: "l1-6-c-rlhf", name: "RLHF: maximize the reward with a KL penalty to the reference model" },
    { id: "l1-6-c-dpo", name: "DPO: learn from preference pairs without a separate reward model" },
    { id: "l1-6-c-hacking", name: "Reward hacking, and why β keeps the model near the reference" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "First read everything, then learn to be an assistant",
      blocks: [
        { type: "html", html: `
          <p>A new model has random weights. It gives nonsense. Training changes the weights in many small steps. A modern chat model gets its weights in two large stages.</p>
          <ol>
            <li><strong>Pretraining.</strong> The model reads a very large amount of text. At each position, it predicts the next token, and then it sees the true next token. Each wrong guess changes the weights a little. Nobody writes labels for this data: the text itself gives the correct answer. This is why it is called <strong>self-supervised</strong>.</li>
            <li><strong>Post-training.</strong> The model learns to be an assistant. It has two common steps:
              <ul>
                <li><strong>Supervised fine-tuning (SFT).</strong> People write examples of a prompt and a good reply. The model learns to predict the tokens of these replies.</li>
                <li><strong>Preference tuning.</strong> People compare two replies to the same prompt and say which one is better. The model learns to give more probability to the better kind of reply. <strong>RLHF</strong> (reinforcement learning from human feedback) and <strong>DPO</strong> (direct preference optimization) are two methods for this step.</li>
              </ul>
            </li>
          </ol>
          <p>After pretraining, you have a <strong>base model</strong>. After post-training, you have a <strong>chat model</strong> (also called an instruct model or an assistant model). Both have the same blocks of lesson 1.5. Only the values of the weights are different.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a new support engineer", html: `
          <p>Think of a new support engineer at Northwind Tools.</p>
          <ul>
            <li><strong>Pretraining is years of reading.</strong> The engineer reads every manual, forum and ticket that exists. They know a lot, but nobody has told them what their job is.</li>
            <li><strong>SFT is shadowing.</strong> A senior engineer shows many examples: "When a customer asks this, you reply like this." The new engineer copies the style.</li>
            <li><strong>Preference tuning is feedback.</strong> A lead reads two draft replies and says, "This one is better." Over time, the engineer learns what the lead prefers, also for questions that nobody showed them.</li>
          </ul>` },
        { type: "diagram", caption: "The two stages of training. The top row shows the model after each step. The bottom row shows the data and the goal of each step.",
          svg: `<svg viewBox="0 0 640 190" role="img" aria-label="Four model boxes from left to right: random weights, base model, SFT model, chat model. Under the arrows: pretraining on a very large text corpus with next-token prediction, SFT on prompts with good replies, and preference tuning on chosen and rejected replies with RLHF or DPO.">
            <defs><marker id="l16a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker>
            <marker id="l16a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow-accent"/></marker></defs>
            <rect x="8" y="20" width="132" height="44" rx="8" class="d-box-muted"/><text x="74" y="47" text-anchor="middle" class="d-text">Random weights</text>
            <rect x="172" y="20" width="132" height="44" rx="8" class="d-box"/><text x="238" y="47" text-anchor="middle" class="d-bold">Base model</text>
            <rect x="336" y="20" width="132" height="44" rx="8" class="d-box"/><text x="402" y="47" text-anchor="middle" class="d-bold">SFT model</text>
            <rect x="500" y="20" width="132" height="44" rx="8" class="d-box-accent"/><text x="566" y="47" text-anchor="middle" class="d-bold">Chat model</text>
            <line x1="140" y1="42" x2="170" y2="42" class="d-line-accent" marker-end="url(#l16a2)"/>
            <line x1="304" y1="42" x2="334" y2="42" class="d-line-accent" marker-end="url(#l16a2)"/>
            <line x1="468" y1="42" x2="498" y2="42" class="d-line-accent" marker-end="url(#l16a2)"/>
            <line x1="156" y1="108" x2="156" y2="50" class="d-line" marker-end="url(#l16a1)"/>
            <line x1="320" y1="108" x2="320" y2="50" class="d-line" marker-end="url(#l16a1)"/>
            <line x1="484" y1="108" x2="484" y2="50" class="d-line" marker-end="url(#l16a1)"/>
            <rect x="84" y="110" width="144" height="66" rx="8" class="d-box-info"/><text x="156" y="132" text-anchor="middle" class="d-bold">Pretraining</text><text x="156" y="149" text-anchor="middle" class="d-small">very large text corpus</text><text x="156" y="165" text-anchor="middle" class="d-small">predict the next token</text>
            <rect x="248" y="110" width="144" height="66" rx="8" class="d-box-good"/><text x="320" y="132" text-anchor="middle" class="d-bold">SFT</text><text x="320" y="149" text-anchor="middle" class="d-small">prompt + good reply</text><text x="320" y="165" text-anchor="middle" class="d-small">loss on reply tokens</text>
            <rect x="412" y="110" width="144" height="66" rx="8" class="d-box-warn"/><text x="484" y="132" text-anchor="middle" class="d-bold">Preference tuning</text><text x="484" y="149" text-anchor="middle" class="d-small">chosen and rejected</text><text x="484" y="165" text-anchor="middle" class="d-small">RLHF or DPO</text>
          </svg>` },
        { type: "html", html: `
          <h3>Why a base model and a chat model behave differently</h3>
          <p>A base model learned one thing: continue a document in a probable way. So it treats your prompt as the start of a document.
          Suppose the prompt is "Can I get my money back?". On the web, a question like this is often one line of a FAQ page. So a probable continuation is <em>more questions</em>, not an answer.</p>
          <p>A chat model saw many examples of a question followed by a helpful reply. So it answers. The text below is an illustration of the two behaviors, not the output of a real model:</p>
          <div class="table-wrap"><table>
            <tr><th>Model</th><th>Prompt: "Can I get my money back?"</th></tr>
            <tr><td>Base model</td><td>"Can I change my order? Can I pay by invoice? Can I track my parcel?"</td></tr>
            <tr><td>Chat model</td><td>"Yes. Open Orders, select the order and select Refund."</td></tr>
          </table></div>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The model does not remember the documents.</strong> Training changes the weights. It does not store the text in a list. Some text can stay in the weights almost word for word, but the model has no index of what it read.</li>
            <li><strong>Post-training does not add a new part.</strong> The new engineer learns new rules. A chat model has the same blocks as the base model. Only the numbers in the weights changed, and most of the knowledge comes from pretraining.</li>
            <li><strong>The feedback is about replies, not about facts.</strong> A lead who prefers a reply that sounds sure can teach the model to sound sure. That is not the same as being correct.</li>
          </ul>` },
        { type: "interactive", id: "l1-6-training" }
      ],
      checks: [
        { id: "l1-6-L1-a", type: "mcq",
          q: "You send \"Can I get my money back?\" to a base model with no other text. Why can it reply with more questions?",
          options: [
            "The base model has a bug in its tokenizer.",
            "The base model learned only to continue documents in a probable way, and on a FAQ page a question is often followed by more questions.",
            "The base model refuses all questions about money.",
            "The base model has no attention layer, so it cannot read the question."
          ],
          correct: 1,
          explain: "Pretraining teaches one task: predict the next token of a document. The base model has the same blocks as a chat model. It only did not learn the habit \"a question gets an answer\". In the interactive, select \"Base model\": the FAQ list has the highest probability." },
        { id: "l1-6-L1-b", type: "mcq",
          q: "Why is pretraining called self-supervised?",
          options: [
            "The model chooses its own training data.",
            "People check each prediction of the model.",
            "The correct answer for each position is the next token of the same text, so nobody writes labels.",
            "The model trains without a loss function."
          ],
          correct: 2,
          explain: "The text gives the labels: the target at position t is the token at position t + 1. So any text can be training data without extra work. SFT and preference tuning need data that people (or models) wrote or rated for the task." },
        { id: "l1-6-L1-c", type: "recall",
          q: "Name the stages that change a model with random weights into a chat model. For each stage, say what data it uses.",
          answer: "Pretraining uses a very large amount of ordinary text and predicts the next token. It gives a base model. SFT uses examples of a prompt and a good reply. Preference tuning (RLHF or DPO) uses pairs of replies to the same prompt where a person said which reply is better. The last two stages together are post-training, and they give a chat model." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Compute each training loss by hand",
      blocks: [
        { type: "html", html: `
          <h3>Pretraining as code</h3>
          <p>Take a token sequence. The input is the sequence without its last token. The target is the sequence without its first token. So the target at each position is the next token:</p>
          <pre class="code-block" data-lang="text"><code>tokens:  The   cat   sat   .
input:   The   cat   sat
target:  cat   sat   .</code></pre>
          <p>The model gives a probability to each token of the vocabulary at each position (lesson 1.1). The loss looks only at the probability of the target token:</p>
          <pre class="code-block" data-lang="formula"><code>loss = mean over positions of  −ln p(target token)</code></pre>
          <ul>
            <li>This is the <strong>cross-entropy loss</strong>. When p is 1, the loss is 0. When p is small, the loss is large.</li>
            <li>Training computes the gradient of this loss for every weight and moves each weight a little against its gradient. This is <strong>gradient descent</strong>.</li>
            <li>The causal mask of lesson 1.4 lets one forward pass compute the predictions for all positions at the same time. No position can see its own target. This is why the training of a transformer runs in parallel over the positions.</li>
          </ul>` },
        { type: "worked", title: "Worked example: the pretraining loss of one short text",
          intro: "The model reads \"The cat sat .\". It gives these probabilities to the true next tokens: p(cat | The) = 0.2, p(sat | The cat) = 0.5, p(. | The cat sat) = 0.8.",
          steps: [
            { html: "Loss at each position: −ln 0.2 = <strong>1.609</strong>, −ln 0.5 = <strong>0.693</strong>, −ln 0.8 = <strong>0.223</strong>. The worst guess has the largest loss." },
            { html: "Mean loss: (1.609 + 0.693 + 0.223) / 3 = <strong>0.842</strong>." },
            { html: "<strong>Perplexity</strong> is exp(mean loss) = exp(0.842) = <strong>2.321</strong>. You can read it as \"the model was about as unsure as a choice between 2.3 equally probable tokens\"." },
            { faded: true, html: "Your turn. A model with random weights gives the same probability to each token of a vocabulary of 50,000 tokens. What is its loss at each position? What is the loss of a position where a trained model gives p = 0.01 to the true token?",
              answer: "Uniform: p = 1 / 50,000, so the loss is ln 50,000 = 10.82, and the perplexity is 50,000. With p = 0.01, the loss is −ln 0.01 = 4.605. One very wrong prediction costs much more than one good prediction saves, so the loss punishes a model that is sure and wrong." }
          ] },
        { type: "html", html: `
          <h3>A base model compared to a chat model, for your prompts</h3>
          <div class="table-wrap"><table>
            <tr><th></th><th>Base model</th><th>Chat model</th></tr>
            <tr><td>What it learned</td><td>Continue any document</td><td>Reply to a user as an assistant</td></tr>
            <tr><td>How you prompt it</td><td>Write the start of a document that has the answer next, for example a FAQ page with a few questions and answers, and then your question</td><td>Send messages with roles (system, user, assistant)</td></tr>
            <tr><td>Where it stops</td><td>Often it does not stop at the end of an answer. It writes more of the document</td><td>It learned to end its turn after the reply</td></tr>
          </table></div>
          <p>The Claude models in the API are post-trained chat models. You send a list of messages with roles. The API changes the messages into one token sequence in a chat format that the model saw in post-training. The exact format is not public, and you do not write it yourself:</p>
          <pre class="code-block" data-lang="python"><code>reply = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=300,
    system="You are the support assistant of Northwind Tools.",
    messages=[{"role": "user", "content": "Can I get my money back?"}],
)</code></pre>
          <p>A few examples in the prompt (few-shot prompting) also work with a chat model. That skill comes from pretraining: the model learned to continue a pattern that it sees in the document.</p>` },
        { type: "html", html: `
          <h3>Supervised fine-tuning (SFT)</h3>
          <p>SFT uses the <strong>same loss</strong> as pretraining. Only the data is different: each example is a conversation in the chat format, with a prompt and a good reply.</p>
          <ul>
            <li>A <strong>loss mask</strong> gives each token the value 1 (count its loss) or 0 (ignore it). The prompt tokens get 0. The reply tokens get 1.</li>
            <li>So the model learns to write replies. It does not learn to write the user's questions.</li>
            <li>The loss is the sum of the counted losses divided by the number of counted tokens.</li>
          </ul>` },
        { type: "worked", title: "Worked example: the SFT loss with a loss mask",
          intro: "One example has 8 tokens: 4 prompt tokens and 4 reply tokens. The model gives these probabilities to the true tokens. Prompt: 0.9, 0.95, 0.99, 0.9 (mask 0). Reply: 0.5, 0.25, 0.8, 0.9 (mask 1).",
          steps: [
            { html: "Losses of the reply tokens: −ln 0.5 = 0.693, −ln 0.25 = 1.386, −ln 0.8 = 0.223, −ln 0.9 = 0.105. Sum: <strong>2.408</strong>." },
            { html: "The mask has 4 tokens with the value 1. SFT loss: 2.408 / 4 = <strong>0.602</strong>. The prompt tokens do not change the loss." },
            { faded: true, html: "Your turn. Compute the loss without a mask, over all 8 tokens. Why is this number not what you want?",
              answer: "The prompt losses are 0.105, 0.051, 0.010 and 0.105, with a sum of 0.272. Without a mask: (0.272 + 2.408) / 8 = 0.335. The number looks better, but it mixes in tokens that the model does not have to write. Training on it would also teach the model to write user questions." }
          ] },
        { type: "html", html: `
          <h3>Preference data and the reward model</h3>
          <p>Good replies are hard to write, but easy to compare. So preference tuning uses <strong>preference pairs</strong>: one prompt, a <em>chosen</em> reply and a <em>rejected</em> reply.</p>
          <pre class="code-block" data-lang="json"><code>{"prompt": "Can I get my money back?",
 "chosen": "Yes. Open Orders, select the order and select Refund.",
 "rejected": "Yes, of course! Great question! Northwind Tools cares about..."}</code></pre>
          <p>RLHF trains a <strong>reward model</strong> on these pairs first. A reward model reads a prompt and a reply and gives one number, the reward r. It uses the <strong>Bradley-Terry</strong> model of a comparison:</p>
          <pre class="code-block" data-lang="formula"><code>P(chosen is better) = σ(r_chosen − r_rejected)        σ(x) = 1 / (1 + e^(−x))
loss = −ln σ(r_chosen − r_rejected)</code></pre>
          <p>Only the difference of the two rewards matters. A reward has no unit. It is useful only to compare replies to the same prompt.</p>` },
        { type: "worked", title: "Worked example: the reward model loss of one pair",
          intro: "The reward model gives r = 1.5 to the chosen reply and r = 0.5 to the rejected reply.",
          steps: [
            { html: "Difference: 1.5 − 0.5 = 1. P(chosen is better) = σ(1) = 1 / (1 + e<sup>−1</sup>) = <strong>0.731</strong>." },
            { html: "Loss: −ln 0.731 = <strong>0.313</strong>. Training makes the difference larger, so the loss goes down." },
            { faded: true, html: "Your turn. Suppose the reward model gives the two replies the opposite rewards: 0.5 to the chosen reply and 1.5 to the rejected reply. Compute P and the loss.",
              answer: "Difference −1. σ(−1) = 0.269. Loss −ln 0.269 = 1.313. The reward model disagrees with the person, so the loss is large, and the gradient changes the rewards toward the person's choice." }
          ] },
        { type: "note", kind: "fact", title: "What each stage means for you", html: `
          <ul>
            <li><strong>Knowledge and the knowledge cutoff come from pretraining.</strong> The model knows only what was in its training text. A prompt can give it new facts for one request (Topic 3, RAG). Post-training adds little new knowledge.</li>
            <li><strong>Behavior comes from post-training.</strong> The use of the system prompt, the answer format, the length, the tone and the refusals are habits that SFT and preference tuning made. So two models with similar knowledge can behave very differently.</li>
            <li><strong>Pretraining rewards probable text, not true text.</strong> The loss is low when the model writes what usually comes next. Lesson 1.8 (Hallucination and grounding) builds on this.</li>
            <li><strong>Your own fine-tuning is more SFT.</strong> When a team fine-tunes a model on its own examples, it runs the SFT step of this lesson on new data. Topic 6 compares this with prompting and RAG.</li>
          </ul>` },
        { type: "note", kind: "simplification", title: "Simplification", html: `
          <p>Real training has more parts: the data is filtered and mixed, the learning rate changes during training, and post-training can have several rounds of SFT and preference tuning. The labs do not publish all of their recipes.
          The order "pretraining, then SFT, then preference tuning" is the common pattern. The exact recipe of a given model can be different.</p>` }
      ],
      checks: [
        { id: "l1-6-L2-a", type: "mcq",
          q: "At one position, the model gives the probability 0.25 to the true next token. What is the cross-entropy loss at this position?",
          options: ["0.25", "1.386", "0.602", "4"],
          correct: 1,
          explain: "The loss is −ln p = −ln 0.25 = ln 4 = 1.386. The value 4 is the perplexity of this single position, exp(1.386). The value 0.602 is the SFT loss of the worked example." },
        { id: "l1-6-L2-b", type: "mcq",
          q: "A reward model gives r = 3 to the chosen reply and r = 1 to the rejected reply. Which probability does the Bradley-Terry model give to \"the chosen reply is better\"?",
          options: ["0.667", "0.750", "0.881", "0.953"],
          correct: 2,
          explain: "P = σ(3 − 1) = σ(2) = 1 / (1 + e^(−2)) = 0.881. Only the difference counts. The value 0.750 is 3 / (3 + 1), which divides the rewards instead of using σ of their difference." },
        { id: "l1-6-L2-c", type: "recall",
          q: "Your team asks why the assistant needs a system prompt and messages with roles, and why it does not continue the text of the prompt. Explain it with the two training stages.",
          answer: "Pretraining made a base model that continues documents. Post-training (SFT and preference tuning) trained it on conversations in a chat format with roles, with the loss only on the assistant's replies. So the chat model learned that a user turn gets an assistant reply that then stops. The API changes our messages into that format. A base model would treat the prompt as the start of a document and continue it." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "The RLHF objective, its exact optimum, and DPO",
      blocks: [
        { type: "html", html: `
          <h3>RLHF in three steps</h3>
          <p>The InstructGPT paper (Ouyang et al., 2022) describes the RLHF recipe that many later models follow:</p>
          <ol>
            <li><strong>SFT</strong> on demonstrations. The result is the reference policy π<sub>ref</sub>. ("Policy" is the reinforcement learning word for the model: it chooses the next token.)</li>
            <li><strong>Reward model.</strong> Train r(x, y) on preference pairs with the Bradley-Terry loss of level 2. Here x is the prompt and y is the reply.</li>
            <li><strong>Reinforcement learning.</strong> The policy writes replies, the reward model scores them, and an RL algorithm (PPO, Schulman et al., 2017, in InstructGPT) changes the policy to get a higher reward.</li>
          </ol>
          <p>Step 3 does not maximize the reward alone. It maximizes the reward minus a penalty for moving away from π<sub>ref</sub>:</p>
          <pre class="code-block" data-lang="formula"><code>maximize   E[ r(x, y) ]  −  β · KL( π(y | x) ‖ π_ref(y | x) )</code></pre>
          <ul>
            <li>KL (the Kullback-Leibler divergence) measures how different two probability distributions are. It is 0 when they are equal.</li>
            <li>β sets the strength of the penalty. Think of it as a leash: a large β keeps the policy near the SFT model, and a small β lets it go far for a higher reward.</li>
            <li>The InstructGPT paper reports that people preferred the replies of its 1.3B-parameter InstructGPT model to the replies of the 175B-parameter GPT-3 base model. Post-training changed the behavior more than a 100 times larger size did.</li>
          </ul>` },
        { type: "html", html: `
          <h3>The exact optimum of the RLHF objective</h3>
          <p>For one prompt, the objective above has an exact solution. This result is the starting point of the DPO paper (Rafailov et al., 2023):</p>
          <pre class="code-block" data-lang="formula"><code>π*(y) = π_ref(y) · exp( r(y) / β ) / Z        Z makes the probabilities add up to 1</code></pre>
          <ul>
            <li>Each reply keeps its reference probability and gets a factor exp(r / β). A higher reward gives a larger factor.</li>
            <li>A large β makes all factors close to each other, so π* stays close to π<sub>ref</sub>.</li>
            <li>A small β makes the factors very different, so almost all probability goes to the reply with the highest reward. The stage "After preference tuning" of the interactive computes this formula.</li>
          </ul>` },
        { type: "worked", title: "Worked example: the effect of β",
          intro: "Two replies. The reference model gives each one the probability 0.5. The rewards are 1 and 0.",
          steps: [
            { html: "With β = 1: the factors are e<sup>1</sup> = 2.718 and e<sup>0</sup> = 1. π* = [0.5 × 2.718, 0.5 × 1] / Z = <strong>[0.731, 0.269]</strong>." },
            { html: "This is σ(1) again. With two replies and equal reference probabilities, π*(reply 1) = σ((r<sub>1</sub> − r<sub>2</sub>) / β), the same form as the Bradley-Terry model." },
            { faded: true, html: "Your turn. Compute π* for β = 0.5 and for β = 10. What happens when β becomes very small?",
              answer: "β = 0.5: σ(2) = 0.881, so π* = [0.881, 0.119]. β = 10: σ(0.1) = 0.525, so π* = [0.525, 0.475], close to the reference. When β goes to 0, π* puts all probability on the reply with the highest reward, whatever the reference model said." }
          ] },
        { type: "html", html: `
          <h3>DPO: preference tuning without a reward model</h3>
          <p>The DPO paper turns the formula around: if π* is known, the reward is r(y) = β · ln(π*(y) / π<sub>ref</sub>(y)) + β · ln Z. Put this into the Bradley-Terry loss. Z is the same for both replies, so it cancels. The result is a loss on the policy itself:</p>
          <pre class="code-block" data-lang="formula"><code>margin = β · [ ln π(y_w) − ln π_ref(y_w) − ( ln π(y_l) − ln π_ref(y_l) ) ]
loss   = −ln σ(margin)</code></pre>
          <ul>
            <li>y<sub>w</sub> is the chosen reply and y<sub>l</sub> is the rejected reply. ln π(y) is the sum of the token log-probabilities of the reply.</li>
            <li>DPO needs no reward model and no RL loop. It needs only the policy, a frozen copy of π<sub>ref</sub>, and the pairs. It trains like SFT: a fixed dataset and a loss.</li>
            <li>Trade-off: RLHF can score new replies that the policy writes during training. DPO learns only from the fixed pairs.</li>
          </ul>` },
        { type: "worked", title: "Worked example: the DPO loss of one pair",
          intro: "β = 0.1. The policy gives ln π(y<sub>w</sub>) = −10 and ln π(y<sub>l</sub>) = −15. The reference gives ln π<sub>ref</sub>(y<sub>w</sub>) = −12 and ln π<sub>ref</sub>(y<sub>l</sub>) = −14.",
          steps: [
            { html: "Log-ratio of the chosen reply: −10 − (−12) = <strong>+2</strong>. The policy likes it more than the reference does." },
            { html: "Log-ratio of the rejected reply: −15 − (−14) = <strong>−1</strong>. The policy likes it less than the reference does." },
            { html: "Margin: 0.1 × (2 − (−1)) = 0.3. Loss: −ln σ(0.3) = −ln 0.574 = <strong>0.554</strong>." },
            { faded: true, html: "Your turn. At the start of DPO, the policy is a copy of π<sub>ref</sub>. What is the loss of every pair then?",
              answer: "Both log-ratios are 0, so the margin is 0. σ(0) = 0.5, and the loss is −ln 0.5 = ln 2 = 0.693 for every pair. Your ticket test can use this as a fixed point." }
          ] },
        { type: "code", lang: "python", code:
`import math

def neg_log_sigmoid(x):
    """-ln(sigmoid(x)) without overflow for large positive or negative x."""
    return math.log1p(math.exp(-x)) if x >= 0 else -x + math.log1p(math.exp(x))

def preference_policy(ref, rewards, beta):
    """pi*(y) = pi_ref(y) * exp(r(y) / beta) / Z, computed in log space."""
    logs = [math.log(p) + r / beta for p, r in zip(ref, rewards)]
    top = max(logs)
    ex = [math.exp(v - top) for v in logs]
    return [e / sum(ex) for e in ex]

def dpo_loss(pol_w, pol_l, ref_w, ref_l, beta=0.1):
    margin = beta * ((pol_w - ref_w) - (pol_l - ref_l))
    return neg_log_sigmoid(margin)

print(preference_policy([0.5, 0.5], [1, 0], 1.0))   # [0.731, 0.269]
print(dpo_loss(-10, -15, -12, -14))                   # 0.554
print(dpo_loss(-12, -14, -12, -14))                   # 0.693 = ln 2` },
        { type: "note", kind: "simplification", title: "Simplification", html: `<p>This code works on whole replies with known log-probabilities. A real implementation sums the token log-probabilities of each reply from the model, uses batches, and computes the gradient with a framework such as PyTorch. Ticket T-006 asks you to write and test these functions with the lesson numbers.</p>` },
        { type: "html", html: `
          <h3>Reward hacking and the KL leash</h3>
          <p>A reward model is a model. It has errors. RL finds the errors, because a reply that gets a high reward for the wrong reason still gets a high reward. This is <strong>reward hacking</strong> (also called over-optimization).</p>
          <ul>
            <li>In the interactive, switch on the flawed reward model. It gives the "Padded" reply the reward 4, but people rate it 0.5. With β = 1, the "Helpful" reply still has the probability 0.646. With β = 0.25, the "Padded" reply gets 0.995. The reward model score goes up to 3.99, and the human rating goes down to 0.51, below the 1.42 of the SFT model.</li>
            <li>The KL penalty is the main guard: it keeps the policy near the SFT model, where the reward model was trained and is more accurate.</li>
            <li>Other guards: more and more varied preference data, a new reward model from replies of the new policy, and evals with people (Topic 5). Long, sure, flattering replies are a known risk, because raters can prefer them.</li>
          </ul>` },
        { type: "html", html: `
          <h3>Variants that you will hear about</h3>
          <ul>
            <li><strong>RLAIF and Constitutional AI.</strong> A model writes the preference labels instead of people, guided by a written list of principles. Anthropic described this method in the Constitutional AI paper (Bai et al., 2022).</li>
            <li><strong>Calibration.</strong> The GPT-4 technical report (OpenAI, 2023) shows that the pretrained model was well calibrated on a multiple-choice test: its probabilities matched how often it was right. After post-training, the calibration was worse. So do not read the confidence of a chat model as a probability.</li>
            <li><strong>Less variety.</strong> Preference tuning moves probability toward the preferred kind of reply. So a chat model often gives less varied replies than its base model. In the interactive, compare the bars of "Base model" and "After preference tuning".</li>
          </ul>` },
        { type: "html", html: `
          <h3>Connections to the next lessons</h3>
          <ul>
            <li><strong>Context window and KV cache (lesson 1.7).</strong> Pretraining runs on sequences of a fixed maximum length. Lesson 1.5 showed that a model can be weak at positions that it did not see in training. Lesson 1.7 explains the context window and what a long context costs.</li>
            <li><strong>Hallucination and grounding (lesson 1.8).</strong> The pretraining loss rewards probable text, and preference tuning can reward replies that sound sure. Both help to explain why a model writes wrong facts with confidence.</li>
            <li><strong>Reasoning models and thinking tokens (lesson 1.9).</strong> Reasoning models get more post-training with reinforcement learning. Lesson 1.9 explains them.</li>
            <li><strong>Fine-tuning and model choice (Topic 6).</strong> LoRA, distillation and your own SFT data build on the SFT step of this lesson.</li>
          </ul>` }
      ],
      checks: [
        { id: "l1-6-L3-a", type: "mcq",
          q: "In the RLHF objective E[r] − β · KL(π ‖ π_ref), what happens when you make β very small?",
          options: [
            "The policy stays a copy of the reference model.",
            "The policy puts almost all probability on the replies with the highest reward, also when the reward model is wrong about them.",
            "The KL divergence becomes negative.",
            "The reward model is trained again on new pairs."
          ],
          correct: 1,
          explain: "π* = π_ref · exp(r / β) / Z. A small β makes the factor exp(r / β) very large for the highest reward. So the policy follows the reward model, errors included. In the interactive, the flawed reward model with β = 0.1 gives \"Padded\" a probability of 1.00." },
        { id: "l1-6-L3-b", type: "mcq",
          q: "At the start of DPO, the policy is an exact copy of the reference model. What is the DPO loss of each pair?",
          options: ["0", "0.554", "0.693", "1"],
          correct: 2,
          explain: "Both log-ratios are 0, so the margin is 0 and σ(0) = 0.5. The loss is −ln 0.5 = ln 2 = 0.693. 0.554 is the loss of the worked example after the policy moved." },
        { id: "l1-6-L3-c", type: "recall",
          q: "Why does RLHF add a KL penalty to the reward, and what does DPO change in the RLHF recipe?",
          answer: "The reward model has errors. Without a penalty, RL moves the policy to replies that exploit those errors (reward hacking), far from the SFT model where the reward model is accurate. The KL penalty, with strength β, keeps the policy near π_ref. DPO uses the exact optimum π* = π_ref · exp(r / β) / Z to express the reward through the policy. So it trains the policy directly on the preference pairs with −ln σ(margin), with no reward model and no RL loop." }
      ]
    }
  ],

  debugging: [
    { id: "l1-6-dbg-1", title: "The SFT loss is half of the expected value",
      symptom: "Your sft_loss test with the lesson's 8 tokens and the mask [0, 0, 0, 0, 1, 1, 1, 1] fails. The value is too low by a factor of 2.",
      evidence: "AssertionError: assert 0.301 == 0.602 ± 1.0e-03",
      hints: [
        "Which tokens does the numerator of your mean include? Which tokens does the denominator count?",
        "How many tokens have the mask value 1?"
      ],
      answer: "The function multiplies each loss by the mask, which is correct, but it divides the sum by all 8 tokens. The correct denominator is the number of tokens with mask 1: 2.408 / 4 = 0.602. Fix: divide by sum(mask), and raise ValueError when sum(mask) is 0. Add a test where the prompt is much longer than the reply, so this mistake gives a very different number." },
    { id: "l1-6-dbg-2", title: "preference_policy crashes with a small beta",
      symptom: "preference_policy works for β = 1 and β = 0.25. A test for β = 0.001 crashes before it returns.",
      evidence: "OverflowError: math range error  (in preference_policy: math.exp(r / beta))",
      hints: [
        "What is r / β for r = 4 and β = 0.001? What is the largest number that math.exp can return?",
        "Softmax had the same problem in lesson 1.1. Which trick fixed it there?"
      ],
      answer: "r / β = 4000, and math.exp(4000) is larger than the largest float, so Python raises OverflowError. Fix: work in log space. Compute ln π_ref(y) + r(y) / β for each reply, subtract the largest value, then take exp and normalize. The result is the same and no value overflows. Use the same idea for the DPO loss: compute −ln σ(x) with log1p, not as −log(1 / (1 + exp(−x)))." },
    { id: "l1-6-dbg-3", title: "The collector saves the wrong reply as chosen",
      symptom: "The preference collector shows the two replies in a random order. Sometimes the saved pair has your choice as \"rejected\". The test with a fake client passes with one seed and fails with another.",
      evidence: "AssertionError: chosen == 'reply from system prompt A'  (seed=2, display order [B, A], typed '1')",
      hints: [
        "With display order [B, A], which reply does the user see as number 1?",
        "Does your code use the display order or the original list to find the chosen reply?"
      ],
      answer: "The code shuffles the replies for the display, but it then reads replies[choice - 1] from the list in the original order. With the order [B, A], the user picked B, and the code saved A. Fix: keep the shuffled list (or the permutation) and look up the choice in it. Test every display order: for each seed, the reply shown as 1 must be the chosen reply when the input is 1. The random order itself is correct: it prevents a position bias in your choices." }
  ],

  recall: [
    { id: "l1-6-r1", q: "What is the pretraining objective, and why is it self-supervised?", a: "Predict the next token at each position, with the cross-entropy loss −ln p(true next token), averaged over the positions. The labels are the next tokens of the same text, so nobody writes labels." },
    { id: "l1-6-r2", q: "What is perplexity?", a: "exp(mean cross-entropy loss). For example, a mean loss of 0.842 gives a perplexity of 2.321. A uniform guess over V tokens gives a loss of ln V and a perplexity of V." },
    { id: "l1-6-r3", q: "How is the SFT loss different from the pretraining loss?", a: "It is the same loss on different data: conversations with a prompt and a good reply. A loss mask counts only the reply tokens, and the sum is divided by the number of counted tokens." },
    { id: "l1-6-r4", q: "What does a reward model learn, and with which loss?", a: "One number r(x, y) for a prompt and a reply. Bradley-Terry: P(chosen is better) = σ(r_chosen − r_rejected), loss = −ln of that probability. Only the difference of the rewards counts." },
    { id: "l1-6-r5", q: "Write the RLHF objective and its exact optimum.", a: "Maximize E[r(x, y)] − β · KL(π ‖ π_ref). Optimum: π*(y) = π_ref(y) · exp(r(y) / β) / Z. A small β follows the reward, and a large β stays near π_ref." },
    { id: "l1-6-r6", q: "Write the DPO loss of one pair.", a: "margin = β · [(ln π(y_w) − ln π_ref(y_w)) − (ln π(y_l) − ln π_ref(y_l))], loss = −ln σ(margin). With π = π_ref the loss is ln 2 = 0.693." },
    { id: "l1-6-r7", q: "Which properties of a chat model come from pretraining, and which from post-training?", a: "Pretraining: the knowledge, the knowledge cutoff, the languages and the skill to continue a pattern (few-shot). Post-training: following instructions, the chat format and roles, the answer style and length, the refusals, and stopping at the end of a reply." }
  ],

  interview: [
    { q: "What is the difference between a base model and a chat model?",
      outline: "Same architecture, different weights. Base: pretraining only, next-token prediction on a large corpus, continues documents, needs a document-style or few-shot prompt, may not stop. Chat: base plus SFT on conversations in a chat format (loss on assistant tokens) plus preference tuning (RLHF or DPO). Follows instructions, uses roles, ends its turn. Knowledge mostly from pretraining, behavior from post-training." },
    { q: "Walk me through RLHF.",
      outline: "Three steps (InstructGPT): SFT on demonstrations gives π_ref. Train a reward model on preference pairs with the Bradley-Terry loss −ln σ(r_w − r_l). RL (PPO) on prompts: the policy writes replies, the reward model scores them, maximize E[r] − β · KL(π ‖ π_ref). The KL penalty limits reward hacking and keeps the language quality of the SFT model." },
    { q: "How does DPO differ from RLHF, and when would you choose each?",
      outline: "DPO uses the exact optimum π* = π_ref · exp(r / β) / Z to write the reward through the policy, so the Bradley-Terry loss becomes a loss on the policy: −ln σ(β · difference of log-ratios). No reward model, no sampling, no RL loop; trains like SFT, simpler and more stable. RLHF can score new on-policy samples and reuse a reward model, at the cost of more parts and tuning." },
    { q: "What is reward hacking, and how do you limit it?",
      outline: "The policy finds replies that the reward model scores high for the wrong reason (for example length or flattery), so the reward goes up while the true quality goes down. Limits: the KL penalty (β), better and more varied preference data, a new reward model on samples of the new policy, and human evals that do not use the reward model." },
    { q: "A product team wants the assistant to answer in the company's support style. Do they need to fine-tune?",
      outline: "First try prompting: a system prompt and a few examples use the skills that post-training already made. Fine-tuning is more SFT on the team's own demonstrations, with a loss mask on the prompt. It needs good examples, an eval, and a check that other behaviors did not get worse. Facts that change belong in RAG, not in the weights. Topic 6 compares these options." }
  ],

  misconceptions: [
    { wrong: "A chat model has a different architecture from a base model.", right: "It has the same blocks. Post-training changes only the values of the weights." },
    { wrong: "Pretraining needs people to label the data.", right: "Pretraining is self-supervised: the next token of the text is the label." },
    { wrong: "Post-training teaches the model most of its knowledge.", right: "Most knowledge comes from pretraining. Post-training mainly changes the behavior: format, style, instructions and refusals." },
    { wrong: "The SFT loss counts every token of the conversation.", right: "A loss mask usually counts only the reply tokens, so the model learns to write replies, not user questions." },
    { wrong: "RLHF makes the model maximize the reward.", right: "RLHF maximizes the reward minus β times the KL divergence from the SFT model. Without that penalty, the model exploits the errors of the reward model." },
    { wrong: "DPO needs a trained reward model.", right: "DPO trains the policy directly on the preference pairs. The reward is only implicit in the ratio π / π_ref." },
    { wrong: "When a chat model sounds sure, it is probably right.", right: "Pretraining rewards probable text, and preference tuning can reward replies that sound sure. Confidence in the wording is not a measured probability." }
  ],

  resources: [
    { title: "Large Language Models explained briefly", by: "3Blue1Brown", kind: "Video, 8 min", url: "https://www.youtube.com/watch?v=LPZh9BOjkQs",
      when: "Watch after level 1. You saw it in lesson 1.1. This time, look at the part about training.",
      why: "A short visual of pretraining on large text and of the second stage that makes an assistant.",
      watchFor: [
        "What does the video say the model predicts during pretraining?",
        "What name does the video give to the training step where people flag replies, and what does that step change?"
      ] },
    { title: "[1hr Talk] Intro to Large Language Models", by: "Andrej Karpathy", kind: "Video, about 1 h", url: "https://www.youtube.com/watch?v=zjkBMFhNj_g",
      when: "Watch the parts on training after level 2. You saw the first part in lesson 1.1.",
      why: "Explains pretraining, fine-tuning into an assistant, and comparisons as a third stage, with the data that each stage uses.",
      note: "Use the chapter list on YouTube to find the parts. Exact timestamps are not given here because they were not checked.",
      watchFor: [
        "How does the talk describe the difference in data between pretraining and fine-tuning: amount and quality?",
        "Why does the talk say that comparing two answers is easier than writing one?"
      ] },
    { title: "Illustrating Reinforcement Learning from Human Feedback (RLHF)", by: "Hugging Face", kind: "Article", url: "https://huggingface.co/blog/rlhf",
      when: "Read after level 2, before level 3.",
      why: "Pictures of the three RLHF steps: the pretrained model, the reward model, and the RL fine-tuning with the KL penalty.",
      watchFor: [
        "Where in the pictures does the KL penalty appear, and which two models does it compare?",
        "What does the article say the reward model outputs for one prompt and reply?"
      ] },
    { title: "Training language models to follow instructions with human feedback (InstructGPT)", by: "Ouyang et al. (2022)", kind: "Paper, optional", url: "https://arxiv.org/abs/2203.02155",
      when: "Optional, after level 3. Read the abstract and the figure with the three steps.",
      why: "The RLHF recipe of level 3, and the result that people preferred a small post-trained model to a large base model.",
      watchFor: [
        "What are the three steps in the overview figure, and what data does each step use?",
        "Which two model sizes does the abstract compare?"
      ] },
    { title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", by: "Rafailov et al. (2023)", kind: "Paper, optional", url: "https://arxiv.org/abs/2305.18290",
      when: "Optional, after level 3. Read the abstract and the section that derives the DPO objective.",
      why: "The derivation of the DPO loss from the exact optimum of the RLHF objective.",
      watchFor: [
        "Find the formula for the optimal policy. Compare it with π* in level 3.",
        "Which parts of the RLHF pipeline does the abstract say DPO removes?"
      ] }
  ],

  summary: `
    <ul>
      <li>Pretraining sets the weights with one self-supervised task: predict the next token. The loss is −ln p(true next token), and perplexity is exp(mean loss).</li>
      <li>The result is a base model. It continues documents. It does not follow instructions.</li>
      <li>SFT uses the same loss on conversations with good replies. A loss mask counts only the reply tokens.</li>
      <li>Preference tuning uses pairs of a chosen and a rejected reply. A reward model learns σ(r_chosen − r_rejected).</li>
      <li>RLHF maximizes the reward minus β · KL from the SFT model. The optimum is π_ref · exp(r / β) / Z.</li>
      <li>DPO trains the policy directly on the pairs with −ln σ(margin). It needs no reward model and no RL loop.</li>
      <li>Knowledge comes mostly from pretraining. Behavior comes from post-training. A reward model with errors can be hacked, and β limits that.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer why the same model architecture can continue a FAQ page or answer a customer. Name the data and the loss of pretraining, SFT and preference tuning. Compute the pretraining loss for the probabilities 0.2, 0.5 and 0.8, and π* for the reference [0.5, 0.5], the rewards [1, 0] and β = 1. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-006"]
};

/* ====================================================================== T-006 */
window.ACADEMY.tickets["T-006"] = {
  id: "T-006",
  title: "Training objectives by hand: losses, SFT records and preference pairs",
  lesson: "1.6",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 2 to 3 hours. The optional stretch needs a second, short session.",
  fields: {
    objective: `
      <p>Write a small, pure Python module, <code>assistant/training.py</code>, with the losses of lesson 1.6: the next-token loss, perplexity, the masked SFT loss, the reward model loss, the KL-regularized preference policy and the DPO loss.
      Write <code>assistant/datasets.py</code> with checked record types for SFT examples and preference pairs. Then write a script that collects real preference pairs from Claude replies, with your own choices.
      Prove each part with tests that are named after the properties they check, and with the hand-computed numbers from lesson 1.6.</p>
      <p><strong>Real-world problem.</strong> Teams that plan to fine-tune a model often start with bad data: the loss counts the prompt, the pairs have chosen and rejected mixed up, or one reply style always wins for a wrong reason.
      They also cannot explain what RLHF or DPO does to the model. Losses that you wrote and tested yourself, and pairs that you collected yourself, give you a correct model of both.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      This ticket trains no model. It builds the data formats and the math that training uses, so that the fine-tuning work of Topic 6 starts from a correct base.
      Phase 2 puts the assistant behind a FastAPI service. This ticket adds no endpoint.</p>
      <p>This ticket depends on T-001 (the project, pytest and the client in <code>assistant/llm.py</code> with the cost line). The collector reuses that client. It adds new files only.
      T-003 helps: the fictional FAQ topics (refund policy, warranty claims, VPN setup, delivery times) are good prompts.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 1.6, levels 1 and 2 complete. Level 3 is necessary for milestone 3.</li>
        <li>T-001 done: <code>assistant/llm.py</code> sends a request, returns a result with the text and the usage, and prints the cost line. Its tests pass with a fake client.</li>
        <li>No new package. Use only the Python standard library (<code>math</code>, <code>json</code>, <code>random</code>, <code>dataclasses</code>) and the <code>anthropic</code> package from T-001.</li>
        <li>Milestone 4 and the stretch: <code>ANTHROPIC_API_KEY</code> in the environment. The collector makes 2 calls for each prompt.</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>next_token_loss(target_probs) -&gt; float</code> returns the mean of −ln p. <code>perplexity(mean_loss) -&gt; float</code> returns exp of it.</li>
        <li><code>sft_loss(target_probs, loss_mask) -&gt; float</code> returns the sum of −ln p over the tokens with mask 1, divided by the number of those tokens.</li>
        <li><code>reward_model_loss(r_chosen, r_rejected) -&gt; float</code> returns −ln σ(r_chosen − r_rejected). <code>reward_model_probability</code> returns σ of the difference.</li>
        <li><code>preference_policy(ref_probs, rewards, beta) -&gt; list[float]</code> returns π_ref · exp(r / β) / Z. <code>kl_divergence(p, q) -&gt; float</code> returns KL(p ‖ q) in nats.</li>
        <li><code>dpo_loss(policy_chosen_logp, policy_rejected_logp, ref_chosen_logp, ref_rejected_logp, beta=0.1) -&gt; float</code> returns −ln σ(margin) as in the lesson.</li>
        <li><code>sft_steps(logits, demo_index, steps, learning_rate) -&gt; list[float]</code> runs gradient descent on −ln softmax(logits)[demo_index], as the interactive does.</li>
        <li><code>python -m assistant.training</code> loads <code>data/training_toy.json</code> and prints one row for each stage at 3 decimals: the base model, SFT after 10 steps, preference tuning with β = 1, and the flawed reward model with β = 0.25. Each row has the 4 probabilities, the KL from the SFT model, the reward model score and the human rating.</li>
        <li><code>assistant/datasets.py</code> has the dataclasses <code>SftExample</code> (a list of messages with roles) and <code>PreferencePair</code> (prompt, chosen, rejected, meta), with <code>validate()</code>, and <code>load_jsonl</code> and <code>append_jsonl</code> functions.</li>
        <li><code>python scripts/collect_preferences.py --model claude-haiku-5-5 --seed 1</code> reads <code>data/prompts.txt</code>. For each prompt, it gets two replies with two different system prompts, shows them as 1 and 2 in a random order, reads 1, 2 or s (skip), and appends a <code>PreferencePair</code> to <code>data/preferences.jsonl</code>.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li>Pure functions in <code>training.py</code>: no global state, no printing inside the functions, no change to the input lists.</li>
        <li>Numerical safety: <code>preference_policy</code> works in log space and subtracts the largest value before exp. The losses compute −ln σ(x) with <code>math.log1p</code>, so a margin of ±1000 gives a finite result.</li>
        <li>Input checks raise <code>ValueError</code> with a clear message: lists of different lengths, a mask with no 1, a probability outside (0, 1], and β ≤ 0.</li>
        <li><code>SftExample.validate()</code> checks that the roles alternate between user and assistant, that the last message is from the assistant, and that no content is empty. <code>PreferencePair.validate()</code> checks that chosen and rejected are not empty and not equal.</li>
        <li>The collector reuses the T-001 client and prints the T-001 cost line for each call. Its meta field stores the model id, both system prompts, the display order and the token usage. It never stores or prints the API key.</li>
        <li>Type hints on every public function. A docstring on <code>dpo_loss</code> that states the formula.</li>
        <li>The tests make no network call and need no API key. The collector test uses a fake client and a fake input function.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given [0.2, 0.5, 0.8], <code>next_token_loss</code> returns 0.842 and <code>perplexity</code> of that loss returns 2.321 (tolerance 0.001).</li>
        <li>Given the probabilities [0.9, 0.95, 0.99, 0.9, 0.5, 0.25, 0.8, 0.9] and the mask [0, 0, 0, 0, 1, 1, 1, 1], <code>sft_loss</code> returns 0.602. A mask with no 1 raises <code>ValueError</code>.</li>
        <li><code>reward_model_loss(1.5, 0.5)</code> returns 0.313, and <code>reward_model_loss(0.5, 1.5)</code> returns 1.313.</li>
        <li><code>preference_policy([0.5, 0.5], [1, 0], 1.0)</code> returns [0.731, 0.269], and with β = 0.5 it returns [0.881, 0.119]. With β = 0.001 it returns [1.0, 0.0] and raises no error.</li>
        <li><code>dpo_loss(-10, -15, -12, -14, beta=0.1)</code> returns 0.554. When the policy and the reference values are equal, it returns 0.693. A margin of −1000 gives a finite loss.</li>
        <li>Given the fixture, 10 SFT steps give the probabilities [0.099, 0.811, 0.060, 0.031]. With the flawed reward model and β = 0.25, the "padded" reply gets 0.995, and the human rating falls from 1.423 (SFT) to 0.507. The lesson's interactive shows the same numbers at 2 or 3 decimals.</li>
        <li>For every display order, the collector saves the reply that it showed as 1 as <code>chosen</code> when the input is 1. The input s saves nothing.</li>
        <li><code>pytest</code> passes with the network off. <code>python -m assistant.training</code> prints the numbers of criterion 6.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>The pretraining and SFT losses (guided).</strong> Write the tests first: the [0.2, 0.5, 0.8] example, perplexity, a perfect prediction gives a loss of 0, the masked SFT example, and the input checks. Compute the SFT example on paper before you run the code.</li>
        <li><strong>The records (guided).</strong> Write <code>SftExample</code> and <code>PreferencePair</code> with <code>validate()</code> and the JSONL functions. Write 3 fictional Northwind SFT examples into <code>data/sft_examples.jsonl</code> by hand, and a test that loads and validates them.</li>
        <li><strong>Preference math (independent).</strong> Add <code>reward_model_loss</code>, <code>preference_policy</code>, <code>kl_divergence</code>, <code>dpo_loss</code> and <code>sft_steps</code>. Write the fixture test of criterion 6. On purpose, compute exp(r / β) directly once, run the β = 0.001 test, and read the error. Then fix it.</li>
        <li><strong>Collect pairs and hand off (independent).</strong> Write the collector and its fake-client test (criterion 7). Write 5 fictional questions into <code>data/prompts.txt</code>, run the collector once on <code>claude-haiku-5-5</code>, and keep the pairs. Fill in <code>handoffs/T-006-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Stretch, optional (a second session, a few cents of API cost): a model as the judge (the RLAIF idea of level 3). Write <code>scripts/judge_preferences.py</code>. For each saved pair, it asks <code>claude-haiku-5-5</code> with the T-001 client which reply is better. It asks two times: once with chosen first and once with rejected first.
      It prints how often the judge agreed with your choice, and how many verdicts changed when only the order changed. Record the counts in the handoff. Say what you measured and do not draw a general conclusion from a few pairs.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                  # from T-001 (import only; do not change it)
    training.py             # losses, preference_policy, kl_divergence, dpo_loss,
                            # sft_steps, __main__ demo
    datasets.py             # SftExample, PreferencePair, validate, JSONL functions
  data/
    training_toy.json       # toy fixture (below)
    sft_examples.jsonl      # 3 fictional examples that you write
    prompts.txt             # 5 fictional user questions that you write
    preferences.jsonl       # written by the collector
  scripts/
    collect_preferences.py
    judge_preferences.py    # stretch only
  tests/
    test_training.py        # the lesson numbers and the numerical safety
    test_datasets.py        # record checks and JSONL round trip
    test_collect_preferences.py   # fake client, fake input, every display order
  tickets/
    T-006.md                # this ticket (generated)
  handoffs/
    T-006-handoff.md        # your handoff (template generated)</code></pre>
      <p>Fixture <code>data/training_toy.json</code>. These are the toy numbers of the lesson's interactive. They are made up for teaching. The replies are fictional.</p>
      <pre><code>{
  "prompt": "Can I get my money back?",
  "replies": [
    {"id": "faq-list", "label": "FAQ list", "text": "Can I change my order? Can I pay by invoice? Can I track my parcel?"},
    {"id": "helpful", "label": "Helpful", "text": "Yes. Open Orders, select the order and select Refund. The refund policy page gives the time limits."},
    {"id": "padded", "label": "Padded", "text": "Yes, of course! Great question! Northwind Tools cares about every customer, and refunds are part of our long history of good service, so..."},
    {"id": "refuses", "label": "Refuses", "text": "I cannot answer questions about money."}
  ],
  "base_logits": [2.0, 0.0, 0.5, -0.5],
  "demonstration": 1,
  "learning_rate": 0.5,
  "human_rating": [-2, 2, 0.5, -1],
  "reward_model": [-2, 2, 0.5, -1],
  "flawed_reward_model": [-2, 2, 4, -1]
}</code></pre>
      <p>Example records. One line of <code>data/sft_examples.jsonl</code>:</p>
      <pre><code>{"messages": [{"role": "user", "content": "How do I set up the VPN?"}, {"role": "assistant", "content": "Open the IT portal, download the VPN profile and import it."}]}</code></pre>
      <p>One line of <code>data/preferences.jsonl</code> (shortened):</p>
      <pre><code>{"prompt": "Can I get my money back?", "chosen": "...", "rejected": "...", "meta": {"model": "claude-haiku-5-5", "display_order": ["B", "A"], "system_prompts": {"A": "...", "B": "..."}}}</code></pre>
      <p>Do not change <code>assistant/llm.py</code> for this ticket. The collector and the stretch script only import it.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_next_token_loss_matches_lesson_example</code></td><td>[0.2, 0.5, 0.8]</td><td>0.842, perplexity 2.321</td></tr>
        <tr><td><code>test_perfect_prediction_has_zero_loss</code></td><td>[1.0, 1.0, 1.0]</td><td>0.0</td></tr>
        <tr><td><code>test_uniform_guess_has_loss_ln_vocabulary_size</code></td><td>p = 1 / 50,000 at 3 positions</td><td>ln 50,000 = 10.82, perplexity 50,000</td></tr>
        <tr><td><code>test_sft_loss_counts_only_masked_tokens</code></td><td>The lesson's 8 tokens and mask</td><td>0.602</td></tr>
        <tr><td><code>test_sft_loss_with_no_counted_token_raises</code></td><td>Mask of zeros</td><td><code>ValueError</code></td></tr>
        <tr><td><code>test_reward_model_loss_matches_lesson_example</code></td><td>(1.5, 0.5) and (0.5, 1.5)</td><td>0.313 and 1.313</td></tr>
        <tr><td><code>test_preference_policy_matches_lesson_example</code></td><td>[0.5, 0.5], [1, 0], β = 1 and 0.5</td><td>[0.731, 0.269] and [0.881, 0.119]</td></tr>
        <tr><td><code>test_preference_policy_with_large_beta_stays_near_reference</code></td><td>β = 1000</td><td>Each value within 0.001 of the reference</td></tr>
        <tr><td><code>test_preference_policy_with_tiny_beta_does_not_overflow</code></td><td>β = 0.001, rewards up to 4</td><td>All probability on the highest reward, no error</td></tr>
        <tr><td><code>test_kl_divergence_is_zero_for_equal_distributions</code></td><td>p = q</td><td>0.0, and a positive value for p ≠ q</td></tr>
        <tr><td><code>test_dpo_loss_matches_lesson_example</code></td><td>(-10, -15, -12, -14), β = 0.1</td><td>0.554</td></tr>
        <tr><td><code>test_dpo_loss_is_ln2_when_policy_equals_reference</code></td><td>Equal values</td><td>0.693</td></tr>
        <tr><td><code>test_dpo_loss_is_finite_for_extreme_margins</code></td><td>Margins of +1000 and −1000</td><td>Finite values, no error</td></tr>
        <tr><td><code>test_fixture_matches_the_lesson_interactive</code></td><td><code>data/training_toy.json</code></td><td>The numbers of criterion 6</td></tr>
        <tr><td><code>test_sft_example_with_wrong_role_order_is_invalid</code></td><td>Two user messages in a row, or a last message from the user</td><td><code>ValueError</code></td></tr>
        <tr><td><code>test_preference_pair_with_equal_replies_is_invalid</code></td><td>chosen == rejected</td><td><code>ValueError</code></td></tr>
        <tr><td><code>test_collector_saves_the_reply_shown_as_1_as_chosen</code></td><td>Fake client, input 1, seeds for both display orders</td><td>The chosen reply is the reply that was shown as 1</td></tr>
      </table></div>
      <p class="muted">Use <code>pytest.approx</code> for float comparisons. Name each test after the property it proves, as in the table.</p>`,
    nfr: `
      <ul>
        <li><strong>Correctness first:</strong> readable loops are fine. Speed does not matter for a few values.</li>
        <li><strong>Numerical safety:</strong> no overflow in exp, no log of 0, and stable −ln σ(x) for large margins.</li>
        <li><strong>No new dependencies:</strong> standard library and the <code>anthropic</code> package of T-001 only.</li>
        <li><strong>Data:</strong> use only fictional Northwind questions and replies. Do not put real customer or work data into the JSONL files.</li>
        <li><strong>Security and cost:</strong> the unit tests make no API calls. The collector reads the key only from <code>ANTHROPIC_API_KEY</code>, uses <code>claude-haiku-5-5</code> by default, and prints the T-001 cost line for each call. Never print or store the key.</li>
      </ul>`,
    questions: `
      <ol>
        <li>Why does <code>sft_loss</code> count only the reply tokens? What would a model learn if the loss counted the prompt tokens too?</li>
        <li>In the output of <code>python -m assistant.training</code>, the reward model score went up and the human rating went down for the flawed reward model at β = 0.25. Explain this with the formula of <code>preference_policy</code>, and say what a larger β changes.</li>
        <li>Your <code>dpo_loss</code> returns 0.693 when the policy equals the reference. Why is it exactly ln 2?</li>
        <li>Look at your 5 saved pairs. Which property of a reply decided most of your choices: length, format, tone or correctness? Would a reward model trained only on your pairs learn a shortcut?</li>
        <li>Stretch only: how often did the judge agree with you, over how many pairs, and how many verdicts changed when only the order changed?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output, demo output, one saved pair).</li>
        <li><code>pytest</code> passes with the network off.</li>
        <li>You computed the SFT example and one DPO loss on paper before you ran the code, and the numbers match.</li>
        <li>You can explain each function of <code>training.py</code> without notes, including why it works in log space.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the SFT loss divides by the counted tokens; the preference policy and the losses are numerically safe; the records are checked before they are saved;
      the collector saves the correct reply as chosen for every display order and reuses the T-001 client; tests are named after properties and include the hand-computed examples; no new dependency; and how well your answers to the questions show understanding.</p>`
  }
};
