/*
 * Curriculum data for the AI Engineering Learning Academy.
 *
 * Source of truth: interview-study/ai-engineer-study-topics.md (11 sections).
 * Every original topic and subtopic is kept in the original order.
 * Each subtopic has source "original" or "addition".
 * An addition always has a "why" note.
 *
 * The lesson plan per topic is a proposal. Only lessons with status "ready"
 * have content. Add a lesson: create content/lessons/<id>.js, add a
 * <script> tag in index.html and set the lesson status to "ready" here.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };

window.ACADEMY.curriculum = [
  {
    id: "t1", n: 1, title: "How an LLM works (concepts)",
    goal: "Know each term well enough to explain it in two minutes with a diagram.",
    subtopics: [
      { id: "t1-tokens", text: "Tokens and tokenization (BPE). Why token count sets cost and limits.", source: "original" },
      { id: "t1-embeddings", text: "Embeddings. A vector that holds the meaning of text. Cosine similarity.", source: "original" },
      { id: "t1-attention", text: "Attention and self-attention. Query, key and value. Why attention cost grows with context length.", source: "original" },
      { id: "t1-block", text: "The transformer block: attention, feed-forward layer, residual connection, layer norm.", source: "original" },
      { id: "t1-pretraining", text: "Pretraining (self-supervised: predict the next token).", source: "original" },
      { id: "t1-posttraining", text: "Post-training: supervised fine-tuning (SFT), RLHF and DPO. Why a base model and a chat model behave differently.", source: "original" },
      { id: "t1-context", text: "Context window, KV cache, and why long prompts are slow and expensive.", source: "original" },
      { id: "t1-sampling", text: "Sampling: temperature, top-p, max tokens. Why the same prompt gives different answers.", source: "original" },
      { id: "t1-hallucination", text: "Hallucination: why it occurs and how grounding (RAG) reduces it.", source: "original" },
      { id: "t1-reasoning", text: "Reasoning models (\"thinking\" tokens). When they help and what they cost.", source: "original" },
      { id: "t1-loop", text: "The generation loop: prefill, decode, one token at a time, stop reasons.", source: "addition",
        why: "This is the frame that connects all other Topic 1 terms. It also explains time to first token, which Topic 8 uses." }
    ],
    lessons: [
      { id: "1.1", title: "How Large Language Models Work: the big picture", status: "ready", covers: ["t1-loop", "t1-tokens", "t1-sampling"] },
      { id: "1.2", title: "Tokens and BPE in depth", status: "ready", covers: ["t1-tokens"] },
      { id: "1.3", title: "Embeddings and cosine similarity", status: "ready", covers: ["t1-embeddings"] },
      { id: "1.4", title: "Attention: query, key and value", status: "ready", covers: ["t1-attention"] },
      { id: "1.5", title: "The transformer block", status: "ready", covers: ["t1-block"] },
      { id: "1.6", title: "Pretraining and post-training (SFT, RLHF, DPO)", status: "ready", covers: ["t1-pretraining", "t1-posttraining"] },
      { id: "1.7", title: "Context window and KV cache", status: "ready", covers: ["t1-context"] },
      { id: "1.8", title: "Hallucination and grounding", status: "ready", covers: ["t1-hallucination"] },
      { id: "1.9", title: "Reasoning models and thinking tokens", status: "ready", covers: ["t1-reasoning"] }
    ],
    resources: [
      { title: "Large Language Models explained briefly (8 min)", by: "3Blue1Brown", url: "https://www.youtube.com/watch?v=LPZh9BOjkQs" },
      { title: "Transformers, the tech behind LLMs (Chapter 5)", by: "3Blue1Brown", url: "https://www.youtube.com/watch?v=wjZofJX0v4M" },
      { title: "Attention in transformers, step-by-step (Chapter 6)", by: "3Blue1Brown", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc" },
      { title: "How might LLMs store facts (Chapter 7)", by: "3Blue1Brown", url: "https://www.youtube.com/watch?v=9-Jl0dxWQs8" },
      { title: "[1hr Talk] Intro to Large Language Models", by: "Andrej Karpathy", url: "https://www.youtube.com/watch?v=zjkBMFhNj_g" },
      { title: "Deep Dive into LLMs like ChatGPT (3.5 h)", by: "Andrej Karpathy", url: "https://www.youtube.com/watch?v=7xTGNNLPyMI" },
      { title: "Let's build the GPT Tokenizer", by: "Andrej Karpathy", url: "https://www.youtube.com/watch?v=zduSFxRajkE" },
      { title: "Optional: Let's build GPT: from scratch, in code", by: "Andrej Karpathy", url: "https://www.youtube.com/watch?v=kCc8FmEb1nY" },
      { title: "The Illustrated Transformer", by: "Jay Alammar", url: "https://jalammar.github.io/illustrated-transformer/" }
    ]
  },
  {
    id: "t2", n: 2, title: "Prompting and structured output",
    subtopics: [
      { id: "t2-system", text: "System prompt, few-shot examples, chain of thought.", source: "original" },
      { id: "t2-structured", text: "Structured output: JSON schema, tool schemas, validation with Pydantic or Zod, retry on invalid output.", source: "original" },
      { id: "t2-caching", text: "Prompt caching: what is cached, and how it cuts cost and latency.", source: "original" },
      { id: "t2-versioning", text: "Prompt versioning: keep prompts in code and test each change (see section 5).", source: "original" },
      { id: "t2-roles", text: "Message roles (system, user, assistant) and why the API is stateless.", source: "addition",
        why: "The master prompt lists message roles. The source list implies them under system prompt." }
    ],
    lessons: [
      { id: "2.1", title: "Message roles and the stateless API", status: "ready", covers: ["t2-roles"] },
      { id: "2.2", title: "System prompts and few-shot examples", status: "ready", covers: ["t2-system"] },
      { id: "2.3", title: "Chain of thought: reason before you answer", status: "ready", covers: ["t2-system"] },
      { id: "2.4", title: "JSON output: validate and retry", status: "ready", covers: ["t2-structured"] },
      { id: "2.5", title: "Tool schemas and schema-enforced output", status: "ready", covers: ["t2-structured"] },
      { id: "2.6", title: "Prompt caching", status: "ready", covers: ["t2-caching"] },
      { id: "2.7", title: "Prompt versioning and prompt tests", status: "ready", covers: ["t2-versioning"] }
    ],
    resources: [
      { title: "How I use LLMs", by: "Andrej Karpathy", url: "https://www.youtube.com/watch?v=EWvNQjAaOHw" },
      { title: "Anthropic courses (prompt engineering, tool use)", by: "Anthropic", url: "https://github.com/anthropics/courses" },
      { title: "DeepLearning.AI short courses", by: "DeepLearning.AI", url: "https://www.deeplearning.ai/short-courses/" }
    ]
  },
  {
    id: "t3", n: 3, title: "RAG (retrieval-augmented generation)",
    subtopics: [
      { id: "t3-pipeline", text: "The pipeline: load → parse → chunk → embed → store → retrieve → rerank → generate with citations.", source: "original" },
      { id: "t3-chunking", text: "Chunking: fixed size, by section, overlap. How chunk size changes answers.", source: "original" },
      { id: "t3-vector", text: "Vector search: pgvector, HNSW and IVF indexes, approximate nearest neighbour.", source: "original" },
      { id: "t3-hybrid", text: "Hybrid search: BM25 keyword search plus vector search, then merge (reciprocal rank fusion).", source: "original" },
      { id: "t3-rerank", text: "Reranking with a cross-encoder.", source: "original" },
      { id: "t3-query", text: "Query rewriting, multi-query, and contextual retrieval.", source: "original" },
      { id: "t3-metrics", text: "Retrieval metrics: recall@k, precision@k, MRR, nDCG.", source: "original" },
      { id: "t3-failures", text: "When RAG fails: bad chunks, wrong embedding model, stale index, missing metadata filters.", source: "original" }
    ],
    lessons: [
      { id: "3.1", title: "The RAG pipeline: build the index", status: "planned", covers: ["t3-pipeline"] },
      { id: "3.2", title: "Retrieve and answer with citations", status: "planned", covers: ["t3-pipeline"] },
      { id: "3.3", title: "Retrieval metrics: recall@k, precision@k, MRR, nDCG", status: "planned", covers: ["t3-metrics"] },
      { id: "3.4", title: "Chunking: size, sections and overlap", status: "planned", covers: ["t3-chunking"] },
      { id: "3.5", title: "Vector search: pgvector, HNSW and IVF", status: "planned", covers: ["t3-vector"] },
      { id: "3.6", title: "Hybrid search: BM25 and reciprocal rank fusion", status: "planned", covers: ["t3-hybrid"] },
      { id: "3.7", title: "Reranking with a cross-encoder", status: "planned", covers: ["t3-rerank"] },
      { id: "3.8", title: "Query rewriting and multi-query", status: "planned", covers: ["t3-query"] },
      { id: "3.9", title: "Contextual retrieval", status: "planned", covers: ["t3-query"] },
      { id: "3.10", title: "When RAG fails: find the cause and add guards", status: "planned", covers: ["t3-failures"] }
    ],
    resources: [
      { title: "Introducing Contextual Retrieval", by: "Anthropic", url: "https://www.anthropic.com/news/contextual-retrieval" },
      { title: "Vector Databases; Building and Evaluating Advanced RAG", by: "DeepLearning.AI", url: "https://www.deeplearning.ai/short-courses/" }
    ]
  },
  {
    id: "t4", n: 4, title: "Agents, tools and MCP",
    subtopics: [
      { id: "t4-tools", text: "Tool calling: the model asks for a tool, your code runs it, the result goes back to the model.", source: "original" },
      { id: "t4-loop", text: "The agent loop (ReAct): think, act, observe, repeat. Stop conditions and step limits.", source: "original" },
      { id: "t4-workflows", text: "Workflows compared to agents: prompt chaining, routing, parallel calls, orchestrator and workers, evaluator and optimizer.", source: "original" },
      { id: "t4-mcp", text: "Model Context Protocol (MCP): servers, tools, resources, prompts, transports.", source: "original" },
      { id: "t4-memory", text: "Memory: short-term (conversation) and long-term (stored facts).", source: "original" },
      { id: "t4-approval", text: "Human approval steps and guardrails for actions that change data.", source: "original" }
    ],
    lessons: [
      { id: "4.1", title: "Tool calling: the full round trip", status: "planned", covers: ["t4-tools"] },
      { id: "4.2", title: "The agent loop: think, act, observe", status: "planned", covers: ["t4-loop"] },
      { id: "4.3", title: "Workflows: chaining, routing and parallel calls", status: "planned", covers: ["t4-workflows"] },
      { id: "4.4", title: "Orchestrator, workers and evaluator", status: "planned", covers: ["t4-workflows"] },
      { id: "4.5", title: "Agent memory: short-term and long-term", status: "planned", covers: ["t4-memory"] },
      { id: "4.6", title: "Human approval and guardrails for actions", status: "planned", covers: ["t4-approval"] },
      { id: "4.7", title: "MCP servers: tools, resources and prompts", status: "planned", covers: ["t4-mcp"] },
      { id: "4.8", title: "MCP clients and transports", status: "planned", covers: ["t4-mcp"] }
    ],
    resources: [
      { title: "Building effective agents (read twice)", by: "Anthropic", url: "https://www.anthropic.com/engineering/building-effective-agents" },
      { title: "Model Context Protocol documentation", by: "MCP", url: "https://modelcontextprotocol.io/" },
      { title: "Agents Course", by: "Hugging Face", url: "https://huggingface.co/learn/agents-course" }
    ]
  },
  {
    id: "t5", n: 5, title: "Evals and observability",
    goal: "Interviewers ask about this the most. Know how to prove that a change made the product better.",
    subtopics: [
      { id: "t5-golden", text: "Golden datasets: real questions with expected answers.", source: "original" },
      { id: "t5-judge", text: "Code checks compared to LLM-as-judge. How to make a judge reliable (clear rubric, compare with human labels).", source: "original" },
      { id: "t5-metrics", text: "Metrics: faithfulness, answer relevance, citation accuracy, task success.", source: "original" },
      { id: "t5-ci", text: "Regression evals in CI on every prompt or model change.", source: "original" },
      { id: "t5-tracing", text: "Tracing each request: prompt, tool calls, tokens, latency, cost (tools such as Langfuse or LangSmith).", source: "original" },
      { id: "t5-errors", text: "Error analysis: read real failures, group them, fix the largest group first.", source: "original" }
    ],
    lessons: [
      { id: "5.1", title: "Trace each request: spans, tokens, latency and cost", status: "planned", covers: ["t5-tracing"] },
      { id: "5.2", title: "Golden datasets from real questions", status: "planned", covers: ["t5-golden"] },
      { id: "5.3", title: "Error analysis: read, group and fix the largest group", status: "planned", covers: ["t5-errors"] },
      { id: "5.4", title: "Code checks: citation accuracy and task success", status: "planned", covers: ["t5-judge", "t5-metrics"] },
      { id: "5.5", title: "LLM-as-judge: faithfulness and answer relevance", status: "planned", covers: ["t5-judge", "t5-metrics"] },
      { id: "5.6", title: "Make the judge reliable: compare with human labels", status: "planned", covers: ["t5-judge"] },
      { id: "5.7", title: "Compare two runs: prove that a change is better", status: "planned", covers: ["t5-metrics"] },
      { id: "5.8", title: "Regression evals in CI", status: "planned", covers: ["t5-ci"] }
    ],
    resources: [
      { title: "Your AI Product Needs Evals", by: "Hamel Husain", url: "https://hamel.dev/blog/posts/evals/" },
      { title: "Patterns for Building LLM-based Systems and Products", by: "Eugene Yan", url: "https://eugeneyan.com/writing/llm-patterns/" }
    ]
  },
  {
    id: "t6", n: 6, title: "Fine-tuning and model choice",
    subtopics: [
      { id: "t6-when", text: "When to use prompting, RAG or fine-tuning. Interviewers like this question.", source: "original" },
      { id: "t6-lora", text: "LoRA and QLoRA: train a small number of weights.", source: "original" },
      { id: "t6-distill", text: "Distillation: a large model teaches a small model.", source: "original" },
      { id: "t6-open", text: "Open models (Llama, Qwen, Mistral) compared to API models: cost, privacy, quality.", source: "original" },
      { id: "t6-serving", text: "Serving: vLLM, batching, quantization (8-bit and 4-bit).", source: "original" },
      { id: "t6-routing", text: "Model routing: send easy tasks to a small model.", source: "original" }
    ],
    lessons: [
      { id: "6.1", title: "Prompting, RAG or fine-tuning: match the fix to the failure", status: "planned", covers: ["t6-when"] },
      { id: "6.2", title: "Open models and API models: cost, privacy and quality", status: "planned", covers: ["t6-open"] },
      { id: "6.3", title: "Model routing: send easy requests to a small model", status: "planned", covers: ["t6-routing"] },
      { id: "6.4", title: "Distillation: a large model teaches a small model", status: "planned", covers: ["t6-distill"] },
      { id: "6.5", title: "LoRA and QLoRA: train a small number of weights", status: "planned", covers: ["t6-lora"] },
      { id: "6.6", title: "Serving open models: batching and quantization", status: "planned", covers: ["t6-serving"] }
    ],
    resources: [
      { title: "Finetuning Large Language Models", by: "DeepLearning.AI", url: "https://www.deeplearning.ai/short-courses/" },
      { title: "LLM Course (fine-tuning chapters)", by: "Hugging Face", url: "https://huggingface.co/learn/llm-course" }
    ]
  },
  {
    id: "t7", n: 7, title: "Safety and security",
    subtopics: [
      { id: "t7-injection", text: "Prompt injection, direct and indirect (through documents or tool results).", source: "original" },
      { id: "t7-leaks", text: "Data leaks: PII in prompts and logs, tenant isolation in RAG.", source: "original" },
      { id: "t7-output", text: "Output checks: schema validation, allow-lists for tool actions, content filters.", source: "original" }
    ],
    lessons: [
      { id: "7.1", title: "Prompt injection: attack your own assistant", status: "planned", covers: ["t7-injection"] },
      { id: "7.2", title: "Defend against injection: keep data apart from instructions", status: "planned", covers: ["t7-injection"] },
      { id: "7.3", title: "Allow-lists for tool actions", status: "planned", covers: ["t7-output"] },
      { id: "7.4", title: "Output checks: schema, links and content filters", status: "planned", covers: ["t7-output"] },
      { id: "7.5", title: "PII in prompts and logs", status: "planned", covers: ["t7-leaks"] },
      { id: "7.6", title: "Tenant isolation in retrieval", status: "planned", covers: ["t7-leaks"] }
    ],
    resources: [
      { title: "Prompt injection series", by: "Simon Willison", url: "https://simonwillison.net/series/prompt-injection/" }
    ]
  },
  {
    id: "t8", n: 8, title: "AI system design",
    goal: "Practise these as 45-minute designs. Use your full-stack knowledge for the API, data and scale parts.",
    subtopics: [
      { id: "t8-q1", text: "Design a chatbot that answers questions from company documents (RAG).", source: "original" },
      { id: "t8-q2", text: "Design a customer support copilot with human handoff.", source: "original" },
      { id: "t8-q3", text: "Design an agent that can act in other systems (tools, approvals, audit log).", source: "original" },
      { id: "t8-q4", text: "Design an eval and monitoring system for an LLM product.", source: "original" },
      { id: "t8-q5", text: "Design an AI feature for 1 million users with a fixed LLM budget.", source: "original" },
      { id: "t8-p1", text: "Cover: requirements (latency target, cost per request, accuracy target, data privacy).", source: "original" },
      { id: "t8-p2", text: "Cover: data flow, ingestion and indexing (offline) compared to the query path (online).", source: "original" },
      { id: "t8-p3", text: "Cover: model choice and routing; fallback when a provider fails or rate-limits.", source: "original" },
      { id: "t8-p4", text: "Cover: caching (prompt cache, semantic cache, result cache).", source: "original" },
      { id: "t8-p5", text: "Cover: streaming to the user; time to first token.", source: "original" },
      { id: "t8-p6", text: "Cover: evals before release and monitoring after release.", source: "original" },
      { id: "t8-p7", text: "Cover: cost estimate (tokens per request × requests per day × price).", source: "original" }
    ],
    lessons: [], resources: [
      { title: "Building A Generative AI Platform", by: "Chip Huyen", url: "https://huyenchip.com/2024/07/25/genai-platform.html" },
      { title: "Book: AI Engineering (O'Reilly, 2025). No link: buy or borrow it.", by: "Chip Huyen", url: "" },
      { title: "General system design refresh", by: "ByteByteGo", url: "https://bytebytego.com/" }
    ]
  },
  {
    id: "t9", n: 9, title: "SQL (practise in parallel)",
    subtopics: [
      { id: "t9-joins", text: "Joins (inner, left, self join, anti-join with NOT EXISTS).", source: "original" },
      { id: "t9-group", text: "GROUP BY and HAVING, conditional aggregates (SUM(CASE WHEN ...)).", source: "original" },
      { id: "t9-window", text: "Window functions: ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, running totals, moving averages.", source: "original" },
      { id: "t9-cte", text: "CTEs and recursive CTEs.", source: "original" },
      { id: "t9-index", text: "Indexes and EXPLAIN ANALYZE.", source: "original" },
      { id: "t9-pg", text: "PostgreSQL extras: JSONB queries, and pgvector similarity queries (ORDER BY embedding <=> query LIMIT k).", source: "original" }
    ],
    lessons: [], resources: [
      { title: "SQL 50 study plan", by: "LeetCode", url: "https://leetcode.com/studyplan/top-sql-50/" },
      { title: "SQL interview questions", by: "DataLemur", url: "https://datalemur.com/" },
      { title: "PostgreSQL window functions tutorial", by: "PostgreSQL Tutorial", url: "https://www.postgresqltutorial.com/postgresql-window-function/" }
    ]
  },
  {
    id: "t10", n: 10, title: "Python (practise in parallel)",
    goal: "You know JavaScript. Learn the Python parts that differ.",
    subtopics: [
      { id: "t10-data", text: "Lists, dicts, sets, tuples, comprehensions, slicing.", source: "original" },
      { id: "t10-func", text: "Functions: *args and **kwargs, default arguments, closures, decorators.", source: "original" },
      { id: "t10-gen", text: "Generators and yield (streaming LLM output uses them).", source: "original" },
      { id: "t10-ctx", text: "Context managers (with).", source: "original" },
      { id: "t10-types", text: "Type hints, dataclasses and Pydantic models.", source: "original" },
      { id: "t10-async", text: "async and await with asyncio: gather, semaphores for rate limits.", source: "original" },
      { id: "t10-retry", text: "Errors, retries with backoff.", source: "original" },
      { id: "t10-fastapi", text: "FastAPI: routes, request models, streaming responses.", source: "original" },
      { id: "t10-pytest", text: "pytest: fixtures and parametrize.", source: "original" },
      { id: "t10-numpy", text: "Basic NumPy: vectors, dot product, cosine similarity by hand.", source: "original" },
      { id: "t10-tooling", text: "Python project setup: virtual environment (venv), pyproject.toml, environment variables.", source: "addition",
        why: "Ticket T-001 needs it on day one. JavaScript developers know npm, not venv." }
    ],
    lessons: [], resources: [
      { title: "LeetCode easy and medium in Python (arrays, hash maps, strings, two pointers, sliding window)", by: "LeetCode", url: "https://leetcode.com/" },
      { title: "FastAPI tutorial", by: "FastAPI", url: "https://fastapi.tiangolo.com/tutorial/" }
    ]
  },
  {
    id: "t11", n: 11, title: "ML basics (some interviews ask)",
    subtopics: [
      { id: "t11-split", text: "Train, validation and test sets. Overfitting and underfitting.", source: "original" },
      { id: "t11-prf", text: "Precision, recall, F1. Which one matters for a given product.", source: "original" },
      { id: "t11-softmax", text: "Softmax, loss, gradient descent (intuition only).", source: "original" },
      { id: "t11-classreg", text: "Classification compared to regression.", source: "original" }
    ],
    lessons: [], resources: [
      { title: "StatQuest with Josh Starmer (search the topic name)", by: "StatQuest", url: "https://www.youtube.com/@statquest" }
    ]
  }
];

/*
 * concepts-ai.html (same folder as the study list) explains the AI terms on
 * the resume. It is a revision source, not a separate topic. Each term maps
 * to the topic that teaches it. Voice, on-device vision and health-record
 * terms are resume-specific and stay in concepts-ai.html.
 */
window.ACADEMY.resumeConceptMap = [
  { term: "Large language model, tokens, context window, stop reasons", topic: "t1" },
  { term: "Prompt caching, structured AI output, JSON Schema from Zod", topic: "t2" },
  { term: "LLM cost and token tracking", topic: "t5" },
  { term: "Embeddings, cosine similarity, RAG", topic: "t3" },
  { term: "Byte pair encoding (BPE)", topic: "t1" },
  { term: "Tool calling, agents, MCP, Claude Code workflows", topic: "t4" },
  { term: "Model routing and small language models, edits as a fine-tuning signal", topic: "t6" },
  { term: "Server-Sent Events, WebSockets, interrupts", topic: "t8" }
];
