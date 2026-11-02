# Progress

Exported from the academy on 2026-11-02.

## Lessons

| Lesson | Title | Highest level open | Completed |
| --- | --- | --- | --- |
| 1.1 | How Large Language Models Work: the big picture | 1 of 3 | no |
| 1.2 | Tokens and BPE in depth | 1 of 3 | no |
| 1.3 | Embeddings and cosine similarity | 1 of 3 | no |
| 1.4 | Attention: query, key and value | 1 of 3 | no |
| 1.5 | The transformer block | 1 of 3 | no |
| 1.6 | Pretraining and post-training (SFT, RLHF, DPO) | 1 of 3 | no |
| 1.7 | Context window and KV cache | 1 of 3 | no |
| 1.8 | Hallucination and grounding | 1 of 3 | no |
| 1.9 | Reasoning models and thinking tokens | 1 of 3 | no |
| 2.1 | Message roles and the stateless API | 1 of 3 | no |
| 2.2 | System prompts and few-shot examples | 1 of 3 | no |
| 2.3 | Chain of thought: reason before you answer | 1 of 3 | no |

## Mastery

| Concept | Level | Latest evidence |
| --- | --- | --- |
| Next-token prediction and the generation loop | 0 (Not started) |  |
| Tokens and tokenization (BPE) | 0 (Not started) |  |
| Input tokens compared to output tokens (cost and latency) | 0 (Not started) |  |
| max_tokens and stop reasons | 0 (Not started) |  |
| Logits, softmax, temperature and top-p | 0 (Not started) |  |
| Prefill compared to decode (time to first token) | 0 (Not started) |  |
| Characters, code points and UTF-8 bytes | 0 (Not started) |  |
| BPE training: learn merges from pair counts | 0 (Not started) |  |
| BPE encoding: apply the merges to new text | 0 (Not started) |  |
| Token counts are model-specific (count with the same model id) | 0 (Not started) |  |
| Which inputs use more tokens, and what that costs | 0 (Not started) |  |
| Vocabulary size trade-offs and tokenization artifacts | 0 (Not started) |  |
| Embedding: a vector that holds the meaning of a text | 0 (Not started) |  |
| Dot product and vector length (norm) | 0 (Not started) |  |
| Cosine similarity: the angle, not the length | 0 (Not started) |  |
| Normalization: for unit vectors, dot product equals cosine | 0 (Not started) |  |
| One embedding model for queries and documents | 0 (Not started) |  |
| Cosine compared to Euclidean distance, and the cost of exact search | 0 (Not started) |  |
| Query, key and value vectors as learned projections | 0 (Not started) |  |
| Attention scores: dot products of a query with every key | 0 (Not started) |  |
| Softmax weights and the weighted sum of values | 0 (Not started) |  |
| The causal mask (no attention to future tokens) | 0 (Not started) |  |
| Quadratic cost in context length | 0 (Not started) |  |
| Why the scores are divided by the square root of d_k | 0 (Not started) |  |
| Multi-head attention (high level) | 0 (Not started) |  |
| A block maps n vectors of size d_model to n vectors of the same size, so blocks stack | 0 (Not started) |  |
| The feed-forward layer: a per-token MLP with a non-linear activation | 0 (Not started) |  |
| Residual connections: each part adds to the vector, it does not replace it | 0 (Not started) |  |
| Layer norm: mean 0 and variance 1 over the features of one token | 0 (Not started) |  |
| Pre-LN compared to post-LN, and the final layer norm | 0 (Not started) |  |
| Parameters per block: about 12 × d_model² when d_ff = 4 × d_model | 0 (Not started) |  |
| Where position information enters the model | 0 (Not started) |  |
| Pretraining: self-supervised next-token prediction with the cross-entropy loss | 0 (Not started) |  |
| A base model continues documents. A chat model follows instructions | 0 (Not started) |  |
| SFT: the same loss on demonstration replies, with a loss mask on the prompt | 0 (Not started) |  |
| Preference pairs and the reward model (Bradley-Terry) | 0 (Not started) |  |
| RLHF: maximize the reward with a KL penalty to the reference model | 0 (Not started) |  |
| DPO: learn from preference pairs without a separate reward model | 0 (Not started) |  |
| Reward hacking, and why β keeps the model near the reference | 0 (Not started) |  |
| The context window: one limit on input plus output tokens for one request | 0 (Not started) |  |
| The KV cache: keep the keys and values of earlier tokens, and compute them only for the new token | 0 (Not started) |  |
| Why the cache gives the same result: the causal mask and the per-token parts of the block | 0 (Not started) |  |
| Cache size = 2 × blocks × KV heads × head size × bytes × tokens | 0 (Not started) |  |
| Each decode step reads all the weights and the whole cache | 0 (Not started) |  |
| The API is stateless: each chat request sends the full history, so total input grows with the square of the turns | 0 (Not started) |  |
| Ways to make the cache smaller: fewer KV heads, fewer bytes, paged memory | 0 (Not started) |  |
| Hallucination: a fluent answer that the facts or the given sources do not support | 0 (Not started) |  |
| Why it occurs: the model predicts a likely continuation, not a checked fact | 0 (Not started) |  |
| Knowledge in the weights: compressed, with a cutoff, and without your private data | 0 (Not started) |  |
| Grounding (RAG): retrieve the sources, put them in the prompt, then generate | 0 (Not started) |  |
| The "I don't know" path: an instruction to abstain and a minimum retrieval score | 0 (Not started) |  |
| Citations: each claim names its source, and code checks the source ids | 0 (Not started) |  |
| Grounding reduces hallucination but does not remove it: misses, stale sources, unfaithful use | 0 (Not started) |  |
| Low temperature makes answers consistent, not correct | 0 (Not started) |  |
| Thinking tokens: output tokens that the model writes before its answer | 0 (Not started) |  |
| Why thinking helps: more tokens give more computation and a place for intermediate results | 0 (Not started) |  |
| Effort and adaptive thinking: how you control the amount of thinking | 0 (Not started) |  |
| Thinking counts against max_tokens and is billed as output tokens | 0 (Not started) |  |
| Thinking blocks in the response: display, safe answer extraction and multi-turn use | 0 (Not started) |  |
| When thinking helps (multi-step tasks) and when it does not (lookup, classification, format) | 0 (Not started) |  |
| Choose the effort with an eval: cost per correct answer and the cost of a wrong answer | 0 (Not started) |  |
| The three roles: system, user and assistant | 0 (Not started) |  |
| The top-level system field, and system messages in the middle of a conversation | 0 (Not started) |  |
| The API is stateless: the code sends the full history in each request | 0 (Not started) |  |
| Turn order: start with user, alternate, and know that consecutive same-role turns are combined | 0 (Not started) |  |
| Assistant messages that you write: synthetic history, and why prefill returns error 400 on current models | 0 (Not started) |  |
| The application owns the memory: storage, safe updates, trimming and the forget-history bug | 0 (Not started) |  |
| Content blocks in the history: send the assistant content back unchanged | 0 (Not started) |  |
| The system prompt: role, task, rules and output format for every call | 0 (Not started) |  |
| Few-shot examples: show the task with labeled inputs and outputs | 0 (Not started) |  |
| Where examples go: in the system prompt or as user and assistant turns | 0 (Not started) |  |
| XML tags separate instructions, examples and the input | 0 (Not started) |  |
| Turn rules: consecutive turns are combined, and a last assistant turn returns error 400 | 0 (Not started) |  |
| Parts that stay the same come first, the part that changes comes last | 0 (Not started) |  |
| Measure each prompt change on a labeled sample set, with no example in the set | 0 (Not started) |  |
| Reasoning before the answer: the answer tokens can use the reasoning tokens | 0 (Not started) |  |
| Prompted chain of thought: reasoning as visible text in the response | 0 (Not started) |  |
| Answer tags and extraction: show only the answer, and treat a bad format as an error | 0 (Not started) |  |
| Prompted reasoning compared to thinking: where the reasoning goes, and what each model allows | 0 (Not started) |  |
| The cost of the reasoning: output tokens and time | 0 (Not started) |  |
| The reasoning text is not a reliable record of how the model decided | 0 (Not started) |  |
| When the mode is worth its cost: compare both modes on a sample set | 0 (Not started) |  |

## Tickets

| Ticket | Status | Started | Done |
| --- | --- | --- | --- |
| T-001 | not started |  |  |
| T-002 | not started |  |  |
| T-003 | not started |  |  |
| T-004 | not started |  |  |
| T-005 | not started |  |  |
| T-006 | not started |  |  |
| T-007 | not started |  |  |
| T-008 | not started |  |  |
| T-009 | not started |  |  |
| T-010 | not started |  |  |
| T-011 | not started |  |  |
| T-012 | not started |  |  |

## Review

Cards due today or earlier: 0.

## Misconceptions I found

_(none recorded)_

## Journal

_(no entries)_
