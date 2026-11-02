/*
 * Lesson 2.1 - Message roles and the stateless API.
 * Ticket T-010 - A chat loop that keeps the conversation history.
 *
 * Every number in this file was computed with a Node script before it was written here.
 * Prices: the price table in app.js (A.logic.MODELS), USD per million tokens:
 *   Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
 * Worked example (toy token counts of the interactive, a support chat of 4 turns):
 *   System prompt 400 tokens. Questions 30, 10, 15, 15 tokens. Answers 120, 80, 90, 60 tokens.
 *   With history, the input tokens of the 4 requests are 430, 560, 655, 760 (total 2,405).
 *   Output 350 tokens. Opus 5.5: 2,405 x $4 / 1M + 350 x $20 / 1M = $0.00962 + $0.007 = $0.01662.
 *   Haiku 5.5: 2,405 x $0.10 / 1M + 350 x $0.50 / 1M = $0.0004155.
 *   Without history (the bug): input 430, 410, 415, 415 (total 1,670), output 185 tokens
 *   (the answers ask again for the order number), Opus 5.5 $0.01038.
 * Ticket T-010 reuses the numbers of T-007 criterion 7: system 1,000, 10 pairs of 200 + 300,
 *   a new question of 200, max_tokens 1,024, input limit 4,976 -> keep 7 pairs (15 messages, 4,700 tokens).
 * API facts and their sources:
 *   https://platform.claude.com/docs/en/build-with-claude/working-with-messages
 *     (stateless; synthetic assistant messages; prefill not supported on Claude 4.6 and later, 400 error;
 *      mid-conversation system messages on the current models, never as the first entry)
 *   https://platform.claude.com/docs/en/api/messages/create
 *     (alternating user and assistant turns; consecutive same-role turns are combined;
 *      a final assistant message is prefill; the top-level system parameter)
 *   https://platform.claude.com/docs/en/build-with-claude/thinking
 *     (thinking blocks: required back unmodified in a tool-use turn, recommended across turns;
 *      from Claude Fable 5.1, a block is valid only while everything before it is unchanged)
 * The interactive for this lesson is in 10-ix.js (id "l2-1-conversation").
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.lessons["2.1"] = {
  id: "2.1",
  topic: "t2",
  title: "Message roles and the stateless API",
  objective: "Explain the three message roles (system, user, assistant) and why the Messages API keeps no memory between requests, build a correct messages list in Python, keep the history safe when a call fails, and find the bugs that come from a wrong turn order, a lost history or an old prefill example.",
  prerequisites: [
    "Lesson 1.1: the generation loop, max_tokens, stop_reason and the cost formula.",
    "Lesson 1.7: the context window, and why the input of a chat grows with each turn.",
    "Lesson 1.9 helps: thinking blocks in the response.",
    "You can write a small Python class with a list in it."
  ],
  covers: ["t2-roles"],
  whyItMatters: `
    <p>Every chat product looks like it remembers you. The model does not. The Claude Messages API is <strong>stateless</strong>: it keeps nothing between two requests.
    The application sends the full conversation again in each request, as a list of messages with roles. So the memory of a chat is code that you write, and a bug in that code makes the assistant forget.</p>
    <p>For an application engineer, this gives daily work. You build the messages list, you put the instructions in the correct place, you keep the turn order correct, and you decide where the history is stored and when it gets too long.
    In an interview, "how does a chatbot remember the conversation?" and "why does a long chat cost more?" are common questions. A good answer says that the client sends the history each time, and gives the cost of that with numbers.</p>`,
  concepts: [
    { id: "l2-1-c-roles", name: "The three roles: system, user and assistant" },
    { id: "l2-1-c-system", name: "The top-level system field, and system messages in the middle of a conversation" },
    { id: "l2-1-c-stateless", name: "The API is stateless: the code sends the full history in each request" },
    { id: "l2-1-c-turns", name: "Turn order: start with user, alternate, and know that consecutive same-role turns are combined" },
    { id: "l2-1-c-synthetic", name: "Assistant messages that you write: synthetic history, and why prefill returns error 400 on current models" },
    { id: "l2-1-c-owner", name: "The application owns the memory: storage, safe updates, trimming and the forget-history bug" },
    { id: "l2-1-c-blocks", name: "Content blocks in the history: send the assistant content back unchanged" }
  ],

  levels: [
    /* ---------------------------------------------------------------- LEVEL 1 */
    {
      n: 1, name: "Intuitive", tagline: "A new support agent on every call, with a case file",
      blocks: [
        { type: "html", html: `
          <p>Lesson 1.1 sent one question and got one answer. A chat has more than one turn. To send a turn, your code calls the Messages API with two main parts:</p>
          <ul>
            <li><strong>The system prompt</strong>, in the top-level <code>system</code> field. It holds the instructions for the whole conversation, for example "You are the support assistant of Northwind Tools".</li>
            <li><strong>The messages list</strong>, in the <code>messages</code> field. Each message has a <strong>role</strong> and a <strong>content</strong>. The role <code>user</code> is the person (or your application). The role <code>assistant</code> is the model.</li>
          </ul>
          <p>The model reads the system prompt and the full list, and then it writes the next assistant message. The API returns that message to your code. Then the API forgets everything.
          For the next turn, your code must send the system prompt, all earlier messages, the answer that it just got, and the new question.</p>` },
        { type: "note", kind: "analogy", title: "Analogy: a new support agent on every call", html: `
          <p>You call a support line. Each time, a different agent answers, and the agent has never seen you. To get help, you give the agent a case file at the start of each call:</p>
          <ul>
            <li><strong>The rules sheet of the company</strong> is the system prompt. It is the same on every call.</li>
            <li><strong>The transcript of all earlier calls</strong> is the messages list. It gets longer after each call.</li>
            <li><strong>Your new question</strong> is the last user message.</li>
          </ul>
          <p>If you forget the transcript, the agent asks you again for your order number. The agent is not careless. The agent did not get the information.</p>` },
        { type: "diagram", caption: "Two turns of one chat. Request 2 repeats all of request 1, plus the answer and the new question. The API keeps nothing between the two requests.",
          svg: `<svg viewBox="0 0 640 200" role="img" aria-label="Request 1 contains the system prompt and user message 1. Claude returns assistant message 1. Request 2 contains the system prompt, user message 1, assistant message 1 and user message 2. Claude returns assistant message 2. A dashed line shows that the code adds assistant message 1 to the list for request 2.">
            <defs><marker id="l21a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
            <text x="20" y="28" class="d-bold">Request 1</text>
            <rect x="20" y="36" width="80" height="36" rx="6" class="d-box-info"/><text x="60" y="59" text-anchor="middle" class="d-small">system</text>
            <rect x="110" y="36" width="80" height="36" rx="6" class="d-box"/><text x="150" y="59" text-anchor="middle" class="d-small">user 1</text>
            <line x1="190" y1="54" x2="420" y2="54" class="d-line" marker-end="url(#l21a1)"/>
            <rect x="422" y="36" width="80" height="36" rx="6" class="d-box"/><text x="462" y="59" text-anchor="middle" class="d-bold">Claude</text>
            <line x1="502" y1="54" x2="540" y2="54" class="d-line" marker-end="url(#l21a1)"/>
            <rect x="542" y="36" width="80" height="36" rx="6" class="d-box-good"/><text x="582" y="59" text-anchor="middle" class="d-small">assistant 1</text>
            <path d="M582,72 L582,94 L240,94 L240,114" class="d-line-accent" fill="none" stroke-dasharray="4 3" marker-end="url(#l21a1)"/>
            <text x="411" y="88" text-anchor="middle" class="d-small">your code adds the answer to the list</text>
            <text x="20" y="108" class="d-bold">Request 2</text>
            <rect x="20" y="116" width="80" height="36" rx="6" class="d-box-info"/><text x="60" y="139" text-anchor="middle" class="d-small">system</text>
            <rect x="110" y="116" width="80" height="36" rx="6" class="d-box"/><text x="150" y="139" text-anchor="middle" class="d-small">user 1</text>
            <rect x="200" y="116" width="80" height="36" rx="6" class="d-box"/><text x="240" y="139" text-anchor="middle" class="d-small">assistant 1</text>
            <rect x="290" y="116" width="80" height="36" rx="6" class="d-box"/><text x="330" y="139" text-anchor="middle" class="d-small">user 2</text>
            <line x1="370" y1="134" x2="420" y2="134" class="d-line" marker-end="url(#l21a1)"/>
            <rect x="422" y="116" width="80" height="36" rx="6" class="d-box"/><text x="462" y="139" text-anchor="middle" class="d-bold">Claude</text>
            <line x1="502" y1="134" x2="540" y2="134" class="d-line" marker-end="url(#l21a1)"/>
            <rect x="542" y="116" width="80" height="36" rx="6" class="d-box-good"/><text x="582" y="139" text-anchor="middle" class="d-small">assistant 2</text>
            <text x="320" y="184" text-anchor="middle" class="d-small">The model sees only what is in the request. Your code keeps the history and sends it again.</text>
          </svg>` },
        { type: "note", kind: "limit", title: "Where the analogy stops", html: `
          <ul>
            <li><strong>The case file costs money.</strong> The model reads the full file on every turn, and you pay for each input token each time. A long chat gets more expensive with each turn (lesson 1.7).</li>
            <li><strong>You can change the file.</strong> A real agent would see that a page was changed. The model cannot see it. Your code can remove old turns or write an assistant message that the model never wrote. Level 2 shows when this is useful.</li>
            <li><strong>The file has a size limit.</strong> The full request must fit in the context window (lesson 1.7).</li>
          </ul>` },
        { type: "interactive", id: "l2-1-conversation" },
        { type: "html", html: `
          <h3>What "stateless" means for your code</h3>
          <ol>
            <li><strong>Your code is the memory.</strong> If your code does not send a fact again, the model does not know it. The "Forget history" bug in the interactive is a real and common bug.</li>
            <li><strong>Each turn costs more than the turn before.</strong> Each request contains all earlier messages. In the interactive, the input grows from 430 to 760 tokens in four turns.</li>
            <li><strong>Your code has full control.</strong> The model sees only the list that you send. You can remove turns that are too old, and you can add turns for tests and examples.</li>
          </ol>` }
      ],
      checks: [
        { id: "l2-1-L1-a", type: "mcq",
          q: "Your chat app sends turn 3 of a conversation. What must the request contain?",
          options: [
            "Only the new question. The API remembers turns 1 and 2.",
            "The new question and a conversation id that the API gave in turn 1.",
            "The system prompt, the two earlier questions, the two earlier answers and the new question.",
            "The system prompt and the new question. The model remembers the earlier answers because it wrote them."
          ],
          correct: 2,
          explain: "The Messages API is stateless. It keeps nothing between requests and gives no conversation id. The model knows only what the request contains, so the code sends the full history each time." },
        { id: "l2-1-L1-b", type: "mcq",
          q: "Where do you put the instructions that apply to the whole conversation, for example \"You are the support assistant of Northwind Tools\"?",
          options: [
            "In the top-level system field.",
            "In an assistant message at the start of the list.",
            "In a system message as the first entry of the messages list.",
            "In the user message of every turn."
          ],
          correct: 0,
          explain: "Use the top-level system field for instructions that apply from the start. The docs say that a system message cannot be the first entry in messages. Repeating the instructions in each user message adds input tokens and mixes the instructions with the user's text." },
        { id: "l2-1-L1-c", type: "recall",
          q: "In the interactive, why does the answer with \"Forget history\" lose the order number at turn 2?",
          answer: "The request holds only the new question, \"I bought it 12 days ago\". The order number is in turn 1, which the code did not send. The API keeps nothing between requests, so the model cannot know it." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 2 */
    {
      n: 2, name: "Software engineering", tagline: "Build the messages list correctly and keep it safe",
      blocks: [
        { type: "html", html: `
          <p>In Python, one chat turn is one call to <code>client.messages.create</code>. The <code>system</code> argument is a string. The <code>messages</code> argument is a list of dictionaries. Each dictionary has a <code>role</code> and a <code>content</code>.
          The content is a string, or a list of content blocks (text, image, tool result and more).</p>
          <p>The class below keeps the history for one conversation. Look at two details. First, it builds the new list as a copy, and it stores the list only after the call succeeds. Second, it stores the full content of the response, not only the text.</p>` },
        { type: "code", lang: "python", code:
`import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment


class Conversation:
    def __init__(self, system: str, model: str = "claude-opus-5-5"):
        self.system = system        # the top-level system field, the same on every turn
        self.model = model
        self.messages: list[dict] = []  # user and assistant messages, in order

    def ask(self, text: str) -> str:
        # Build the request as a copy. Do not change self.messages yet.
        request = self.messages + [{"role": "user", "content": text}]
        response = client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=self.system,     # instructions: a top-level field, not a message
            messages=request,       # the full history and the new question, every time
        )
        if response.stop_reason != "end_turn":
            # No complete answer (for example "max_tokens" or "refusal"). Keep the old history.
            raise RuntimeError("no complete answer: " + response.stop_reason)
        # The call succeeded. Store the question and the full answer content together.
        # Keep all blocks unchanged, also thinking blocks (lesson 1.9).
        self.messages = request + [{"role": "assistant", "content": response.content}]
        return "".join(b.text for b in response.content if b.type == "text")


chat = Conversation("You are the support assistant of Northwind Tools.")
print(chat.ask("My order NW-4471 arrived with a broken drill. What can I do?"))
print(chat.ask("Send the replacement to the address on that order."))  # turn 2 sends 3 messages` },
        { type: "note", kind: "fact", title: "The rules for the messages list", html: `
          <ul>
            <li><strong>Stateless.</strong> "The Messages API is stateless, which means that you always send the full conversational history to the API."</li>
            <li><strong>Alternate the roles.</strong> The models are trained on alternating user and assistant turns. Consecutive user turns, or consecutive assistant turns, in a request are combined into a single turn. The API does not tell you that it combined them.</li>
            <li><strong>Start with a user message.</strong> This course always starts the list with a user message, and the rest of the list alternates.</li>
            <li><strong>Do not end with an assistant message on current models.</strong> A final assistant message is called <em>prefill</em>: the model continues from its text. Prefill is not supported on Claude 4.6 and later models. On these models, a request with prefill returns error 400.</li>
            <li><strong>System instructions.</strong> Use the top-level <code>system</code> field for instructions that apply from the start. The current models also accept a message with the role <code>system</code> later in the list, after a user turn. It cannot be the first entry.</li>
            <li><strong>Synthetic turns are allowed.</strong> Earlier assistant turns do not have to come from Claude. You can write them yourself.</li>
          </ul>
          <p class="muted">Source: Claude API docs, "Working with the Messages API" and "Create a Message" (API reference), in the resources of this lesson.</p>` },
        { type: "worked", title: "Worked example: what four turns cost",
          intro: "The support chat of the interactive. System prompt 400 tokens. Questions of 30, 10, 15 and 15 tokens. Answers of 120, 80, 90 and 60 tokens. Claude Opus 5.5: $4 per million input tokens and $20 per million output tokens (the price table of lesson 1.1). The token counts are toy numbers.",
          steps: [
            { html: "Turn 1 sends the system prompt and question 1: 400 + 30 = <strong>430</strong> input tokens." },
            { html: "Turn 2 adds answer 1 and question 2: 430 + 120 + 10 = <strong>560</strong>. Turn 3 adds answer 2 and question 3: 560 + 80 + 15 = <strong>655</strong>. Turn 4 adds answer 3 and question 4: 655 + 90 + 15 = <strong>760</strong>." },
            { html: "Total input: 430 + 560 + 655 + 760 = 2,405 tokens. Total output: 120 + 80 + 90 + 60 = 350 tokens. Cost: 2,405 × $4 / 1,000,000 + 350 × $20 / 1,000,000 = $0.00962 + $0.007 = <strong>$0.01662</strong>." },
            { html: "With the forget-history bug, the inputs are 430, 410, 415 and 415 tokens, and the answers are shorter because they only ask again for the order number. The chat costs $0.01038. It is cheaper, and it is wrong." },
            { faded: true, html: "Your turn. Compute the cost of the same four turns with history on Claude Haiku 5.5 ($0.10 per million input tokens and $0.50 per million output tokens).",
              answer: "2,405 × $0.10 / 1,000,000 + 350 × $0.50 / 1,000,000 = $0.0002405 + $0.000175 = $0.0004155. That is 40 times less than on Opus 5.5 for the same history." }
          ] },
        { type: "worked", title: "Worked example: a failed call breaks the turn order",
          intro: "A first version of the class appends the question to self.messages before the call. The history has 2 messages: question 1 and answer 1. Then the user asks question 2, and the call fails with a timeout.",
          steps: [
            { html: "The code already appended question 2. The history now has 3 messages: user, assistant, user. No answer was stored." },
            { html: "The user types question 2 again. The code appends it, and the request has 4 messages: user, assistant, user, user." },
            { html: "The API combines the two consecutive user messages into one turn. The model sees question 2 twice in one turn, and the answer can repeat itself or answer two questions. There is no error, so the bug stays hidden." },
            { faded: true, html: "Your turn. Name the change in the code that prevents this bug, and the test that proves it.",
              answer: "Build the request as a copy (history plus the new question) and store it in self.messages only after the call succeeds, together with the answer. Test: a fake client raises a timeout on turn 2. Then the history still has 2 messages, and the next call sends 3 messages that alternate." }
          ] },
        { type: "note", kind: "warn", title: "Old prefill examples return error 400", html: `
          <p>Older guides end the messages list with an assistant message, for example <code>{"role": "assistant", "content": "{"}</code>, so that the model continues with JSON. On Claude 4.6 and later models, this returns error 400.
          Use structured outputs (lessons 2.4 and 2.5) or an instruction in the system prompt instead. Add a test that the last message of every request has the role <code>user</code>.</p>
          <p class="muted">Source: Claude API docs, "Working with the Messages API".</p>` }
      ],
      checks: [
        { id: "l2-1-L2-a", type: "mcq",
          q: "You send a request to claude-opus-5-5 whose messages list ends with {\"role\": \"assistant\", \"content\": \"{\"}. What happens?",
          options: [
            "The model continues the JSON from the \"{\".",
            "The API returns error 400, because prefill is not supported on Claude 4.6 and later models.",
            "The API removes the last message and answers normally.",
            "The model starts a new assistant message after the \"{\"."
          ],
          correct: 1,
          explain: "A final assistant message is prefill. The docs say that prefill is not supported on Claude 4.6 and later models, and such a request returns a 400 error. Use structured outputs or system prompt instructions." },
        { id: "l2-1-L2-b", type: "mcq",
          q: "A request has the messages user, assistant, user, user. What does the API do?",
          options: [
            "It returns error 400 for the two user messages.",
            "It answers only the last user message and ignores the one before it.",
            "It combines the two consecutive user messages into a single user turn.",
            "It inserts an empty assistant message between them."
          ],
          correct: 2,
          explain: "The API reference says that consecutive user or assistant turns are combined into a single turn. There is no error, so a broken history can go unnoticed. Test the turn order in your own code." },
        { id: "l2-1-L2-c", type: "recall",
          q: "Why does the Conversation class build the request as a copy and store it only after the call succeeds?",
          answer: "If the call fails or gives no complete answer, the history stays as it was before the turn. Otherwise a stored question with no answer gives two user messages in a row on the next turn, and the API silently combines them." }
      ]
    },

    /* ---------------------------------------------------------------- LEVEL 3 */
    {
      n: 3, name: "Advanced", tagline: "What the model sees, and who owns the memory",
      blocks: [
        { type: "html", html: `
          <h3>Why roles work</h3>
          <p>Inside, the model reads one sequence of tokens. The API puts the system field and the messages into that sequence, with markers that show where each role starts. Anthropic does not publish the exact format.
          The model then predicts the tokens of the next assistant turn, with the same loop as in lesson 1.1.</p>
          <p>The roles have an effect because of training. After pretraining, the model is trained on many conversations in this format (lesson 1.6). It learns to write the assistant part, to follow the system instructions and to answer the user.
          So a role is not a security wall. It is a signal that the model learned to respect, most of the time.</p>` },
        { type: "note", kind: "simplification", title: "Simplification: the KV cache and prompt caching", html: `
          <p>Lesson 1.7 showed the KV cache inside one request. Prompt caching (lesson 2.6) can also reuse the processed start of a request in a later request, which saves cost and time.
          This does not give the model a memory. The request must still contain the full history. The cache only makes it cheaper to read the same start again.</p>` },
        { type: "html", html: `
          <h3>The application owns the memory</h3>
          <p>Because the API is stateless, the design of the memory is a decision in your application. These are the main parts:</p>
          <ul>
            <li><strong>Storage.</strong> A command-line tool can keep the list in memory. A web service keeps one history for each conversation id, on the server (phase 2 of the project).</li>
            <li><strong>Safe updates.</strong> Store a question and its answer together, only after a successful call. Then the list always alternates.</li>
            <li><strong>Size.</strong> Each turn adds input tokens, and the total grows with the square of the number of turns (lesson 1.7). Trim the oldest turns in whole pairs, so that the list still starts with a user message (ticket T-007 has <code>trim_history</code>). Or replace old turns with a short summary. Both methods remove information, so a fact from turn 1 can get lost.</li>
            <li><strong>Edits.</strong> Because you send the list, you can change it: a "regenerate" button removes the last answer and sends again, and an "edit" button changes an earlier question and removes all later turns.</li>
            <li><strong>Synthetic turns.</strong> You can write assistant turns that the model never wrote. Tests use them to start the model in a known state, and few-shot examples use them to show the model the answer format (lesson 2.2).</li>
          </ul>` },
        { type: "note", kind: "warn", title: "Never trust a history that comes from the browser", html: `
          <p>A simple web chat sends the full history from the browser to the server on each turn. Then a user can change the list: add a false assistant turn such as "I already approved your refund", or add instructions.
          The model cannot see that the turn is false. Keep the history on the server. Accept only the new user message from the browser, and add it to the stored list.</p>` },
        { type: "html", html: `
          <h3>Content blocks in the history</h3>
          <p>An assistant message can contain more than text. With thinking (lesson 1.9), it starts with a thinking block. With tool use (Topic 4), it contains tool calls, and the next user message contains the tool results.
          Store the assistant content exactly as you got it, and send it back unchanged. Do not keep only the text, and do not edit the blocks. The class in level 2 stores <code>response.content</code> for this reason.</p>
          <p>The "Thinking" docs page gives the rules for thinking blocks. In a tool-use turn, you must send them back, complete and unmodified. Across turns, the page recommends that you send everything back, and the API decides which earlier thinking blocks the model sees.
          Starting with Claude Fable 5.1, a thinking block also stays valid only while the system prompt, the tools and the messages before it are unchanged. So an edit or a trim of old turns can make the thinking blocks after it invalid. Lesson 1.9 and Topic 4 give the details.</p>` },
        { type: "worked", title: "Worked example: check a messages list",
          intro: "A pull request sends this list to claude-opus-5-5, with the system prompt in the top-level field: [1] system \"Answer in English.\", [2] user \"Where is my order?\", [3] assistant \"Which order?\", [4] user \"NW-4471.\", [5] user \"Please hurry.\", [6] assistant \"Order NW-4471 is\".",
          steps: [
            { html: "Entry 1 is a system message as the first entry of the list. A system message with content cannot be the first entry. Move \"Answer in English.\" into the top-level system field." },
            { html: "Entries 4 and 5 are two user messages in a row. The API combines them into one turn. Find the code that stored a question without an answer, or join the two texts on purpose." },
            { faded: true, html: "Your turn. What is wrong with entry 6, and what do you do instead?",
              answer: "The list ends with an assistant message. That is prefill, and on Claude Opus 5.5 it returns error 400. Remove entry 6. If the goal is a fixed answer format, use structured outputs or an instruction in the system prompt." }
          ] },
        { type: "html", html: `
          <h3>Connections to the other lessons</h3>
          <ul>
            <li><strong>The generation loop and cost (lesson 1.1).</strong> Each turn is one request. Its cost comes from usage.input_tokens and usage.output_tokens, and the input contains the full history.</li>
            <li><strong>Context window and KV cache (lesson 1.7).</strong> The history must fit in the context window, and its total input grows with the square of the number of turns. Ticket T-007 trims it in pairs.</li>
            <li><strong>Reasoning models (lesson 1.9).</strong> Thinking blocks stay in the history, unchanged.</li>
            <li><strong>System prompts and few-shot examples (lesson 2.2).</strong> What to write in the system field, and how synthetic turns show examples.</li>
            <li><strong>JSON output, tool schemas and prompt caching (lessons 2.4 to 2.6).</strong> The replacements for prefill, and the method that makes a long, repeated history cheaper.</li>
          </ul>` }
      ],
      checks: [
        { id: "l2-1-L3-a", type: "mcq",
          q: "A web chat sends the full history from the browser on each turn. What is the main risk?",
          options: [
            "The requests get slower because the browser is slow.",
            "A user can add false assistant turns or instructions to the history, and the model cannot tell that they are false.",
            "The API rejects histories that come from a browser.",
            "The model forgets the system prompt."
          ],
          correct: 1,
          explain: "Earlier turns do not have to come from Claude, so the model accepts any assistant turn in the list. Keep the history on the server and accept only the new user message from the browser." },
        { id: "l2-1-L3-b", type: "mcq",
          q: "You turn on prompt caching for a long chat. Which statement is correct?",
          options: [
            "You can now send only the new question, because the server cached the history.",
            "The request must still contain the full history. The cache makes the repeated start cheaper and faster to process.",
            "The cache stores the model's memory of the user between chats.",
            "Prompt caching removes the need for the system field."
          ],
          correct: 1,
          explain: "The API stays stateless. Caching reuses the processing of a start of the request that is the same as before. The model still sees only what the request contains." },
        { id: "l2-1-L3-c", type: "recall",
          q: "Why does a model follow the system prompt and answer as the assistant, if it only predicts the next token?",
          answer: "The API puts the roles into one token sequence with markers. In training, the model learned from many conversations in this format to write the assistant part and to follow the system instructions. A role is a learned signal, not a security wall." }
      ]
    }
  ],

  debugging: [
    { id: "l2-1-dbg-1", title: "The assistant forgets the order number",
      symptom: "In the chat, the user gives the order number in turn 1. In turn 2, the assistant asks for the order number again. The logs show no errors.",
      evidence: "turn=1 input_tokens=430   turn=2 input_tokens=410   turn=3 input_tokens=415   turn=4 input_tokens=415",
      hints: [
        "What must happen to the input tokens from turn to turn if the code sends the history?",
        "Which messages does the code put in the messages argument?"
      ],
      answer: "The input tokens do not grow, so each request holds only the new question. The code builds messages=[{\"role\": \"user\", \"content\": question}] and does not store the answers. The API is stateless, so the model never sees turn 1. Fix: keep the history and send all earlier messages and the new question. Add a test with a fake client: call k sends 2k − 1 messages." },
    { id: "l2-1-dbg-2", title: "An old JSON example returns error 400",
      symptom: "You copy an example that makes the model answer in JSON. Every request to claude-opus-5-5 fails before the model starts.",
      evidence: "anthropic.BadRequestError: Error code: 400 ...   last message: {\"role\": \"assistant\", \"content\": \"{\"}",
      hints: [
        "What is the role of the last message in the list?",
        "What do the docs say about prefill on Claude 4.6 and later models?"
      ],
      answer: "The example uses prefill: the list ends with an assistant message, so that the model continues from \"{\". Prefill is not supported on Claude 4.6 and later models, and these requests return error 400. Fix: remove the final assistant message, and use structured outputs or an instruction in the system prompt. Add a test that the last message of each request has the role user." },
    { id: "l2-1-dbg-3", title: "After a timeout, the answer repeats itself",
      symptom: "A call times out. The user types the same question again. The next answer is strange: it answers the question twice, or it says \"as you asked twice\".",
      evidence: "history before the call: user, assistant, user, user   (no error from the API)",
      hints: [
        "When did the code add the first copy of the question to the history?",
        "What does the API do with two consecutive user messages?"
      ],
      answer: "The code appended the question before the call. The call failed, so no answer followed, and the second copy made two user messages in a row. The API combines consecutive same-role messages into one turn, so the model saw the question twice. Fix: build the request as a copy and store the question and the answer together only after a successful call. Add a test where the fake client raises a timeout, and check that the history did not change." }
  ],

  recall: [
    { id: "l2-1-r1", q: "What does \"the Messages API is stateless\" mean?", a: "The API keeps nothing between requests. Your code sends the system prompt and the full conversation history in each request. The model knows only what the request contains." },
    { id: "l2-1-r2", q: "Name the three roles and where each one goes in the request.", a: "System: the top-level system field (instructions for the whole conversation). User: messages from the person or the application. Assistant: messages from the model, which the code sends back in later turns." },
    { id: "l2-1-r3", q: "What happens to two consecutive user messages in a request?", a: "The API combines them into a single user turn, with no error. So a broken history can stay hidden. Keep the list alternating, and test it." },
    { id: "l2-1-r4", q: "What is prefill, and what does it do on Claude Opus 5.5?", a: "Prefill is a final assistant message that the model continues from. Prefill is not supported on Claude 4.6 and later models: the request returns error 400. Use structured outputs or system prompt instructions." },
    { id: "l2-1-r5", q: "How do you update the history safely after a turn?", a: "Build the request as a copy (history plus the new question). After a successful call with a complete answer, store the question and the full answer content together. On a failure, keep the old history." },
    { id: "l2-1-r6", q: "Why do you store response.content and not only the answer text?", a: "The assistant content can contain thinking blocks and tool calls. In a tool-use turn, the thinking blocks must go back complete and unmodified, and the docs recommend that you send everything back in later turns too. If you keep only the text, later requests can fail or lose information." },
    { id: "l2-1-r7", q: "Why must a web chat keep the history on the server?", a: "The model accepts any assistant turn in the list, also turns that it never wrote. If the browser sends the history, a user can add false turns or instructions. Accept only the new user message." }
  ],

  interview: [
    { q: "How does a chatbot that uses an LLM API remember the conversation?",
      outline: "It does not, on the model side. The Messages API is stateless. The application stores the history (in memory or in a database per conversation id) and sends the system prompt and all messages in each request. The model reads the full list each time. Consequences: cost and latency grow with each turn, the history must fit in the context window, and the application decides what to keep." },
    { q: "Why does a long chat cost more per message than a short chat?",
      outline: "Each request contains all earlier messages, so the input of turn n contains about n − 1 earlier pairs. The total input grows with the square of the number of turns. Example: 4 turns of a toy chat have 430, 560, 655 and 760 input tokens. Fixes: trim old turns in pairs, summarize old turns, prompt caching for the repeated start, and a smaller model for simple turns." },
    { q: "What is the difference between the system prompt and a user message?",
      outline: "The system prompt is a top-level field with instructions for the whole conversation: role, rules, format. The model is trained to give it priority. User messages are the input of the person in each turn. Do not put user data into the system prompt without care, and do not repeat instructions in each user message. A role is a learned signal, not a security boundary." },
    { q: "A user reports that the assistant answered a question that the user never asked. How do you investigate?",
      outline: "Log the exact request of that turn: the system field and the messages list. Check the turn order: two user messages in a row are combined into one turn with no error. Look for a failed call that left a question without an answer, a retry that added the question again, or a history that the client can change. Fix with atomic history updates and a turn-order check in tests." },
    { q: "How do you design the conversation storage for a chat API in production?",
      outline: "Store the history on the server for each conversation id, never trust a history from the client. Store each question and answer together after a successful call. Store the full content blocks (thinking, tool use). Count the tokens before each call and trim the oldest pairs or summarize when the budget is reached. Log usage per turn. Think about retention and personal data in the stored history." }
  ],

  misconceptions: [
    { wrong: "The API remembers the earlier turns of my chat.", right: "The Messages API is stateless. Your code sends the full history in each request." },
    { wrong: "The model remembers the answers that it wrote.", right: "It sees its earlier answers only when your code sends them back as assistant messages." },
    { wrong: "Two user messages in a row return an error, so I will see the bug.", right: "The API combines consecutive same-role messages into one turn, with no error. Test the turn order yourself." },
    { wrong: "I can make the model start its answer with \"{\" by ending the list with an assistant message.", right: "That is prefill. On Claude 4.6 and later models, it returns error 400. Use structured outputs or system prompt instructions." },
    { wrong: "The system prompt goes into the messages list as the first message.", right: "Use the top-level system field. A system message with content cannot be the first entry in messages." },
    { wrong: "Every assistant message in the history must come from Claude.", right: "You can write synthetic assistant turns. This is useful for tests and examples, and it is a risk if users can change the history." },
    { wrong: "With prompt caching, I can send only the new question.", right: "The request must still contain the full history. Caching only makes the repeated start cheaper and faster." }
  ],

  resources: [
    { title: "Working with the Messages API", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/working-with-messages",
      when: "Read after level 1, before level 2.",
      why: "The basic request patterns: one turn, a multi-turn conversation, synthetic assistant turns, and the notes on prefill and system messages.",
      watchFor: [
        "How does the usage of the example change when the history gets longer?",
        "What does the page say about prefill on Claude 4.6 and later models, and what does it suggest instead?"
      ] },
    { title: "Create a Message (API reference)", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/api/messages/create",
      when: "Read with level 2.",
      why: "The exact description of the system and messages parameters, and the rules for the turn order.",
      watchFor: [
        "What does the reference say about consecutive user or assistant turns?",
        "What does a final assistant message do, and what happens on models that do not support it?"
      ] },
    { title: "Context windows", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/context-windows",
      when: "Read after level 2.",
      why: "How a multi-turn conversation fills the context window, turn by turn.",
      watchFor: [
        "Which parts of earlier turns stay in the context window, and which parts can the API remove?",
        "What happens when a request is larger than the context window?"
      ] },
    { title: "Thinking", by: "Anthropic (Claude API docs)", kind: "Docs", url: "https://platform.claude.com/docs/en/build-with-claude/thinking",
      when: "Read with level 3.",
      why: "How thinking blocks behave in a multi-turn conversation and in tool use.",
      watchFor: [
        "What must you do with thinking blocks when you send the conversation back?",
        "Which models keep the thinking blocks of all earlier turns in the context, and how does that change the input tokens of a long chat?"
      ] },
    { title: "Training language models to follow instructions with human feedback", by: "Ouyang et al. (2022)", kind: "Paper, optional", url: "https://arxiv.org/abs/2203.02155",
      when: "Optional, after level 3. Read the abstract and the introduction.",
      why: "An early public description of how a pretrained model is trained to follow instructions and answer as an assistant.",
      watchFor: [
        "Which kinds of data does the training use after pretraining?",
        "How does the paper compare a small trained model with a much larger model that was not trained this way?"
      ] }
  ],

  summary: `
    <ul>
      <li>A request has a top-level system field and a messages list. Each message has the role user or assistant and a content.</li>
      <li>The Messages API is stateless. Your code sends the full history in each request, and the model knows only what the request contains.</li>
      <li>Each turn adds the last answer and the new question, so each request costs more than the one before.</li>
      <li>Start with a user message and alternate. The API combines consecutive same-role turns into one turn, with no error.</li>
      <li>A final assistant message is prefill. On Claude 4.6 and later models, it returns error 400.</li>
      <li>Store the question and the full answer content together, only after a successful call. Send content blocks back unchanged.</li>
      <li>The application owns the memory: keep it on the server, trim it in whole pairs, and never trust a history from the client.</li>
    </ul>`,

  teachBack: "Explain to a backend engineer how a chat assistant remembers the conversation when the API is stateless. Use the support chat of the interactive: 430, 560, 655 and 760 input tokens in four turns, $0.01662 on Opus 5.5, and the forget-history bug that is cheaper and wrong. Then explain why the code stores a question and its answer only after a successful call. Record it or write it, then paste it into Claude and ask for gaps and errors.",

  tickets: ["T-010"]
};

/* ====================================================================== T-010 */
window.ACADEMY.tickets["T-010"] = {
  id: "T-010",
  title: "A chat loop that keeps the conversation history",
  lesson: "2.1",
  phase: 1,
  mode: "Guided first (milestones 1 and 2), then independent (milestones 3 and 4)",
  estimate: "One sitting. Most people need 2 to 3 hours. Milestones 1 and 4 make at most 10 paid calls to the smallest model.",
  fields: {
    objective: `
      <p>Add <code>python -m assistant.chat</code>, an interactive chat on top of the T-001 client. A new module, <code>assistant/chat.py</code>, holds a <code>Conversation</code> class that owns the history:
      the system prompt in the top-level <code>system</code> field, and the list of user and assistant messages. Each turn sends the full history through <code>llm.py</code>.
      The measurement line shows the turn number and the number of messages sent, so you can see the history grow. When the history gets too large, the conversation removes the oldest pairs with <code>trim_history</code> from T-007.</p>
      <p><strong>Real-world problem.</strong> Chat features often fail in three ways. The assistant forgets what the user said two turns before, because the code sent only the new question.
      A failed call leaves a question with no answer, and the next request has two user messages in a row. Or the history grows until each request is too expensive or too large for the context window.
      This ticket gives the assistant a history that is correct, safe after a failure and limited in size, and tests that prove it.</p>`,
    context: `
      <p>This ticket is part of phase 1 of the <strong>Company AI Assistant</strong> for the fictional company "Northwind Tools".
      In phase 2, the FastAPI chat endpoint keeps one <code>Conversation</code> for each conversation id on the server, and calls the same code. This ticket adds no endpoint.</p>
      <p>This ticket depends on T-001 (the client in <code>assistant/llm.py</code>, the price table, the measurement line and the fake client of the tests),
      T-002 (<code>count_input_tokens</code> and the input limit <code>--max-input-tokens</code>), T-007 (<code>Message</code>, <code>trim_history</code> and <code>ContextBudgetError</code> in <code>assistant/context_budget.py</code>)
      and T-009 (<code>check_answer</code> in <code>assistant/thinking.py</code>). Reuse these functions. Do not write a second version of them. The system prompt stays one fixed text in this ticket. T-011, "System prompts and few-shot examples", changes it.</p>`,
    prerequisites: `
      <ul>
        <li>Lesson 2.1, levels 1 and 2 complete. Level 3 helps for milestone 3.</li>
        <li>T-001, T-002, T-007 and T-009 done, and their tests pass.</li>
        <li>An Anthropic API key in the environment variable <code>ANTHROPIC_API_KEY</code>, for milestones 1 and 4 only.</li>
        <li>No new package. Use the <code>anthropic</code> SDK of T-001 and the Python standard library.</li>
        <li>Read the docs pages "Working with the Messages API" and "Create a Message" (links in the lesson resources).</li>
      </ul>`,
    requirements: `
      <p><strong>Functional</strong></p>
      <ol>
        <li><code>python -m assistant.chat</code> starts a chat. It reads one line from the user, sends the turn, streams the answer and prints the measurement line. Then it waits for the next line. An empty line or <code>/quit</code> ends the chat. <code>/reset</code> removes the history and keeps the system prompt.</li>
        <li>The chat accepts the T-001 options <code>--model</code>, <code>--max-tokens</code> and <code>--system</code>, and the T-002 option <code>--max-input-tokens</code> (default from <code>ASSISTANT_MAX_INPUT_TOKENS</code>). The input limit is the history budget.</li>
        <li>The measurement line of T-001 gets three new fields: <code>turn</code> (1, 2, 3 ...), <code>messages</code> (the number of messages sent) and <code>trimmed</code> (the number of messages removed before this turn). Example: <code>turn=4 messages=7 trimmed=0</code>.</li>
        <li>When a call fails, the chat prints the T-001 error message, and the history stays as it was before the turn. The user can type the question again.</li>
        <li>When the answer check of T-009 does not give the status <code>ok</code> (for example <code>no_answer</code>), the chat prints the status, does not store the turn, and the history stays as it was before the turn.</li>
      </ol>
      <p><strong>Technical</strong></p>
      <ol>
        <li><code>llm.py</code> stays the only module that calls the API. Its call function gets an optional parameter <code>messages: list[dict] | None = None</code>. Without it, the request is the same as in T-001.</li>
        <li><code>assistant/chat.py</code> contains <code>Conversation(system, model, max_tokens, max_input_tokens=None)</code> with the methods <code>send(client, text)</code> and <code>reset()</code>, a read-only property <code>messages</code>, and a pure function <code>check_turn_order(messages)</code>.</li>
        <li><code>check_turn_order</code> raises <code>ValueError</code> when the list is empty, does not start with <code>user</code>, has two messages with the same role in a row, has a message with the role <code>system</code>, or ends with <code>assistant</code>. <code>send</code> calls it on each request before the API call.</li>
        <li>The system prompt goes only into the top-level <code>system</code> argument. The messages list never contains the system prompt.</li>
        <li><code>send</code> builds the request as a new list (history plus the new user message). It replaces the stored history only after a successful call, with the request and the assistant message together.</li>
        <li>The stored assistant message contains <code>response.content</code> unchanged, with all its blocks (thinking blocks too). The answer text comes from <code>check_answer</code> of T-009, never from <code>content[0]</code>.</li>
        <li>History budget: when <code>max_input_tokens</code> is set, each stored message keeps a token count. For a user message, count it one time with <code>count_input_tokens</code> of T-002. For an assistant message, use <code>usage.output_tokens</code> of its response. Before the call, convert the history to T-007 <code>Message</code> objects and call <code>trim_history(messages, system_tokens, max_tokens, context_window=max_input_tokens + max_tokens)</code>. Then count the trimmed request with <code>count_input_tokens</code>. The exact count decides: if it is still above the limit, remove one more pair and count again. If only the new question is left and it does not fit, print the T-002 limit message and make no call.</li>
        <li>The tests make no network call and need no API key. Reuse the fake client of T-001. It records the arguments of each call.</li>
      </ol>`,
    acceptance: `
      <ol>
        <li>Given four turns with the fake client, the four recorded calls have 1, 3, 5 and 7 messages, and each call starts with all messages of the call before it, in the same order.</li>
        <li>In every recorded call, the <code>system</code> argument is the system prompt, and no message in the list has the role <code>system</code>.</li>
        <li><code>check_turn_order</code> accepts [user], and [user, assistant, user]. It raises <code>ValueError</code> for [], [assistant, user], [user, user], [user, assistant] and [system, user].</li>
        <li>Given a fake client that raises a timeout on turn 3, the history after the failed turn has the same 4 messages as before it, and the next successful turn sends 5 messages.</li>
        <li>Given a fake response with a thinking block and a text block, the stored assistant content has both blocks unchanged, and the next recorded call sends them back.</li>
        <li>Given a system prompt of 1,000 tokens, 10 earlier pairs of 200 and 300 tokens, a new question of 200 tokens, <code>max_tokens</code> 1,024 and <code>max_input_tokens</code> 4,976, the request keeps the newest 7 pairs and the new question (15 messages, 4,700 input tokens), and the measurement line shows <code>trimmed=6</code>. These are the numbers of T-007 criterion 7.</li>
        <li>Given a fake response with status <code>no_answer</code>, the history does not change, and the chat prints the status.</li>
        <li>With a real key, a chat of the four questions of the lesson on <code>claude-haiku-5-5</code> prints four measurement lines with growing input tokens, and the answer to turn 4 names the order number NW-4471. The handoff records the four lines.</li>
        <li><code>pytest</code> passes with the network off. The key value appears in no file and in no log line.</li>
      </ol>`,
    milestones: `
      <ol>
        <li><strong>See the stateless API (guided).</strong> In a scratch script, call <code>claude-haiku-5-5</code> with the first question of the lesson, "My order NW-4471 arrived with a broken drill. What can I do?". Then send only the fourth question, "Send it to the address on that order.", in a new request.
        Then continue the first conversation: send questions 2 and 3 with the history, and then the fourth question with the full history. Print the answer and <code>usage.input_tokens</code> of each request, and compare them with the toy numbers of the lesson (430 to 760 input tokens). At the end, send a list that ends with an assistant message and write down the error. Do not keep this script.</li>
        <li><strong>The conversation and the turn order (guided).</strong> Write the tests for criteria 1, 2 and 3 first, with the fake client. Then write <code>check_turn_order</code> and the <code>Conversation</code> class, and add the <code>messages</code> parameter to <code>llm.py</code>.</li>
        <li><strong>Safe updates and the budget (independent).</strong> Add the tests for criteria 4 to 7. Then make <code>send</code> update the history only after a successful turn, and add the history budget with <code>trim_history</code> and <code>count_input_tokens</code>.</li>
        <li><strong>The chat and the handoff (independent).</strong> Write <code>assistant/chat.py</code> as a module that runs with <code>python -m assistant.chat</code>, with the three new fields in the measurement line. Run the four questions of the lesson one time with a real key. Fill in <code>handoffs/T-010-handoff.md</code> and bring it back to the classroom.</li>
      </ol>
      <p class="muted">Cost: milestone 1 makes 6 calls and milestone 4 makes 4 calls, 10 calls in total. If each call uses at most 1,000 input and 200 output tokens, one call costs at most (1,000 × $0.10 + 200 × $0.50) / 1,000,000 = $0.0002 at the Haiku 5.5 prices of the T-001 table, so all 10 calls together cost at most $0.002. The token count calls of the budget are separate requests to the count endpoint.</p>
      <p class="muted">Stretch, optional: add <code>/history</code>, which prints the role and the token count of each stored message. Then add a <code>--save</code> option that writes the history to a JSON file and a <code>--load</code> option that reads it, and test that a loaded history passes <code>check_turn_order</code>.</p>`,
    files: `
      <pre><code>project/
  assistant/
    llm.py                  # from T-001: add the messages parameter (no change without it)
    pricing.py              # from T-001 (no change)
    context_budget.py       # from T-007: Message, trim_history (no change)
    thinking.py             # from T-009: check_answer (no change)
    chat.py                 # Conversation, check_turn_order, the chat loop (python -m assistant.chat)
  tests/
    test_chat.py            # turn order, full history, failure safety, budget
    test_llm.py             # from T-001: add the messages parameter test
  tickets/
    T-010.md                # this ticket (generated)
  handoffs/
    T-010-handoff.md        # your handoff (template generated)</code></pre>
      <p>Do not change <code>pricing.py</code>, <code>context_budget.py</code> or <code>thinking.py</code> for this ticket. Change <code>llm.py</code> only as the requirements say.</p>`,
    tests: `
      <div class="table-wrap"><table>
        <tr><th>Test</th><th>Input</th><th>Expected behavior</th></tr>
        <tr><td><code>test_each_call_sends_the_full_history</code></td><td>Four turns, fake client</td><td>The calls have 1, 3, 5 and 7 messages; each call starts with the messages of the call before it</td></tr>
        <tr><td><code>test_system_prompt_is_only_the_top_level_field</code></td><td>Four turns, fake client</td><td><code>system</code> is the prompt in each call; no message has the role <code>system</code></td></tr>
        <tr><td><code>test_history_starts_with_user_and_alternates</code></td><td>The lists of criterion 3</td><td>Accepts the good lists; <code>ValueError</code> for the bad lists</td></tr>
        <tr><td><code>test_last_message_is_never_assistant</code></td><td>[user, assistant]</td><td><code>ValueError</code>; the fake client records 0 calls</td></tr>
        <tr><td><code>test_failed_call_leaves_history_unchanged</code></td><td>Fake timeout on turn 3</td><td>Still 4 messages; the next turn sends 5</td></tr>
        <tr><td><code>test_assistant_content_is_stored_unchanged</code></td><td>Fake response [thinking, text]</td><td>The next call sends both blocks, unchanged</td></tr>
        <tr><td><code>test_turn_without_answer_is_not_stored</code></td><td>Fake response with status <code>no_answer</code></td><td>The history does not change</td></tr>
        <tr><td><code>test_trim_keeps_the_newest_pairs_that_fit</code></td><td>The numbers of criterion 6</td><td>15 messages, 4,700 input tokens, <code>trimmed=6</code></td></tr>
        <tr><td><code>test_trim_removes_whole_pairs_only</code></td><td>Budgets from 4,000 to 6,000 in steps of 100</td><td>Every request starts with <code>user</code> and passes <code>check_turn_order</code></td></tr>
        <tr><td><code>test_question_that_cannot_fit_makes_no_call</code></td><td>A question of 5,000 tokens, limit 4,976</td><td>The T-002 limit message; 0 generation calls</td></tr>
        <tr><td><code>test_reset_keeps_the_system_prompt</code></td><td>Two turns, then <code>/reset</code>, then one turn</td><td>The last call has 1 message and the same <code>system</code></td></tr>
        <tr><td><code>test_measurement_line_shows_turn_and_messages</code></td><td>Turn 4 of four, fake client</td><td>The line contains <code>turn=4 messages=7 trimmed=0</code></td></tr>
      </table></div>
      <p class="muted">In the fake client, give each message a fixed token count, so that the budget tests need no real count. Name each test after the property it proves, as in the table. Do not fake the whole SDK.</p>`,
    nfr: `
      <ul>
        <li><strong>Cost:</strong> use <code>claude-haiku-5-5</code> for all manual tests. Each turn sends the full history, so the input cost of a chat grows with the square of the number of turns (lesson 1.7). The measurement line shows the cost of each turn. The unit tests make no paid calls.</li>
        <li><strong>Reliability:</strong> the stored history always passes <code>check_turn_order</code>, also after a failure, a timeout or a turn with no answer. A request that cannot fit is stopped before the call.</li>
        <li><strong>Latency:</strong> the time to the first token grows with the input. Record the TTFT of each turn in milestone 4 and compare turn 1 with turn 4.</li>
        <li><strong>Security:</strong> the key comes only from the environment. The history contains user data, so the chat never writes it to a log file. Only <code>--save</code> (stretch) writes it, to a file that the user names.</li>
      </ul>`,
    questions: `
      <ol>
        <li>In milestone 1, what did the answer to the fourth question say without the history, and with the history? Give <code>usage.input_tokens</code> of both requests.</li>
        <li>What error did the list that ends with an assistant message give? Copy the status code and the first part of the message.</li>
        <li>Give your four measurement lines from milestone 4. How much did the input tokens grow from turn to turn, and why is the growth not the same each time?</li>
        <li><code>trim_history</code> removes the oldest pairs. In the chat of the lesson, what goes wrong if the budget removes turn 1? Describe one method that keeps the order number.</li>
        <li>In phase 2, the history is stored on the server for each conversation id. Why must the endpoint not accept the full history from the browser?</li>
      </ol>`,
    checklist: `
      <ul>
        <li>All acceptance criteria pass, with evidence in the handoff (test output and four measurement lines).</li>
        <li><code>pytest</code> passes with the network off, and the T-001, T-002, T-007 and T-009 tests did not change.</li>
        <li>No module other than <code>llm.py</code> calls the API, and no code reads <code>content[0]</code> for the answer.</li>
        <li>You can explain why <code>send</code> stores the question and the answer together, without notes.</li>
        <li>The handoff file is complete, including "what is still unclear".</li>
      </ul>
      <p><strong>Review criteria (what the review in the classroom checks):</strong> the system prompt is only in the top-level field; every request starts with <code>user</code>, alternates and ends with <code>user</code>;
      the history changes only after a successful turn; the assistant content is stored unchanged; the budget reuses <code>trim_history</code> and <code>count_input_tokens</code> and trims in whole pairs; the tests are named after properties and run with the network off; and how well your answers to the questions use your own measurements.</p>`
  }
};
