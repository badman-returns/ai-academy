# Next session: AI Engineering Academy

Read this file first. It tells you the state of the work and the tasks that remain.

## Source of the task

- The master prompt is `/Users/tsgoswami/Downloads/AI_Engineering_Learning_Academy_Master_Prompt.md`.
- You are the user's AI engineering tutor.
- The user's decisions:
  - Location: `~/Documents/ai-academy`.
  - Project stack: Python with FastAPI, and the Claude API.
  - No daily schedule. Organize by topic. The user sets the pace.

## What is done

- `academy/index.html`, `academy/styles.css`, `academy/app.js`, `academy/markdown.js`.
- `academy/content/curriculum.js`: 11 topics, 75 original subtopics, 3 labeled additions.
  Lessons 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 and 2.7 have the status "ready".
- `academy/content/lessons/`:
  - `01-how-llms-produce-text.js`: lesson 1.1 and ticket T-001.
  - `02-tokens-and-bpe.js`: lesson 1.2 and ticket T-002. It uses the "bpe" interactive in `app.js`.
  - `03-embeddings-and-cosine.js`: lesson 1.3 and ticket T-003. `03-ix.js` adds the "cosine2d" interactive.
  - `04-attention-qkv.js`: lesson 1.4 and ticket T-004. `04-ix.js` adds the "l1-4-attention" interactive.
  - `05-transformer-block.js`: lesson 1.5 and ticket T-005. `05-ix.js` adds the "l1-5-block" interactive.
    The toy numbers of this interactive are also the fixture `data/block_toy.json` of T-005.
  - `06-pretraining-posttraining.js`: lesson 1.6 and ticket T-006. `06-ix.js` adds the "l1-6-training" interactive.
    The toy numbers of this interactive are also the fixture `data/training_toy.json` of T-006.
  - `07-context-kv-cache.js`: lesson 1.7 and ticket T-007. `07-ix.js` adds the "l1-7-kvcache" interactive.
    T-007 reuses the fixture `data/block_toy.json` of T-005.
  - `08-hallucination-grounding.js`: lesson 1.8 and ticket T-008. `08-ix.js` adds the "l1-8-grounding" interactive.
    Its documents and questions are also the fixture `data/grounding_faq.json` of T-008.
  - `09-reasoning-models.js`: lesson 1.9 and ticket T-009. `09-ix.js` adds the "l1-9-thinking" interactive.
    Its toy cost numbers are also the acceptance numbers of T-009.
  - `10-roles-stateless.js`: lesson 2.1 and ticket T-010. `10-ix.js` adds the "l2-1-conversation" interactive.
    Its toy token counts (430 to 760 input tokens in four turns) are also numbers in T-010.
  - `11-system-few-shot.js`: lesson 2.2 and ticket T-011. `11-ix.js` adds the "l2-2-request" interactive.
    Its toy costs per 1,000 calls are also numbers in the lesson text.
  - `12-chain-of-thought.js`: lesson 2.3 and ticket T-012. `12-ix.js` adds the "l2-3-cot" interactive.
    Its example cost numbers are also the acceptance numbers of T-012.
  - `13-json-validate-retry.js`: lesson 2.4 and ticket T-013. `13-ix.js` adds the "l2-4-validate" interactive.
    Its validator gives the same errors as Pydantic 2.13.5 strict mode. Its sample replies are also the fixture of T-013.
  - `14-tool-schemas.js`: lesson 2.5 and ticket T-014. `14-ix.js` adds the "l2-5-schema" interactive.
    Its tool costs per 1,000 requests are also numbers in the lesson text. T-014 adds the `tool` mode to the T-013 triage.
  - `15-prompt-caching.js`: lesson 2.6 and ticket T-015. `15-ix.js` adds the "l2-6-cache" interactive.
    Its toy costs are also the acceptance numbers of T-015. T-015 adds prompt caching to the T-014 tool mode and the T-010 chat.
  - `16-prompt-versioning.js`: lesson 2.7 and ticket T-016. `16-ix.js` adds the "l2-7-regression" interactive.
    Its toy gate numbers (16 of 20 baseline, changes A to D) are also the acceptance numbers of T-016.
  - `index.html` loads each of these files.
- `academy/tools/generate.js`: writes the tickets and the handoff templates into `project/`.
  It wrote `project/tickets/T-001.md` to `T-016.md` and `project/handoffs/T-001-handoff.md` to `T-016-handoff.md`.
  It does not overwrite a handoff file that exists.
- `academy/tools/selftest.js`: 208 tests. All pass.
  Run it with `node academy/tools/selftest.js` from this folder.
- `README.md`, `PROGRESS.md` and the `project/` scaffold exist.

## What remains

- The user's final review of lessons 1.1 to 1.9, lesson 2.1, tickets T-001 to T-009 and ticket T-010 is pending.
- The user's final review of lesson 2.2 and ticket T-011 is pending.
- The user's review of lesson 2.3 and ticket T-012 is pending.
- The user's review of lesson 2.4 and ticket T-013 is pending.
- The user's review of lesson 2.5 and ticket T-014 is pending.
- The user's review of lesson 2.6 and ticket T-015 is pending.
- The user's review of lesson 2.7 and ticket T-016 is pending.
- Topic 2 is complete. All planned lessons (1.1 to 1.9 and 2.1 to 2.7) are "ready". No lesson is "planned".
- The next work is lesson 3.1, the first lesson that is not "ready". Build a lesson only when the user asks for it.
- The UI redesign is done (2026-11-02). The user's final review of it is pending. Report: `site-check/REDESIGN-REPORT.md`.
- The topic 2 lesson plan (lessons 2.1 to 2.7) is in `curriculum.js`. All seven lessons are "ready". The user approved the plan on 2026-11-02.
- FastAPI start: topic 3 (the user decided).
- The topic 3 lesson plan (lessons 3.1 to 3.10) is in `curriculum.js`. All ten lessons are "planned". The user approved the plan on 2026-11-05.
- The topic 4 lesson plan (lessons 4.1 to 4.8) is in `curriculum.js`. All eight lessons are "planned". The user approved the plan on 2026-11-05.
- The topic 5 lesson plan (lessons 5.1 to 5.8) is in `curriculum.js`. All eight lessons are "planned". The user approved the plan on 2026-11-05.
- The topic 6 lesson plan (lessons 6.1 to 6.6) is proposed in `curriculum.js`. All six lessons are "planned". The plan waits for the user's review.
- The topic 7 lesson plan (lessons 7.1 to 7.6) is proposed in `curriculum.js`. All six lessons are "planned". The plan waits for the user's review.
- Setup decisions for topics 3 to 5 (the user decided on 2026-11-05): local embedding model (for example fastembed) and a local cross-encoder reranker, no paid embedding API; pgvector in Docker Compose for 3.5; GitHub Actions for the 5.8 eval gate; a local trace store for 5.1, with Langfuse or LangSmith optional.

## Rules

- Do not commit. The user makes the commits.
- Never print secret values. Refer to env var names only.
- Never invent links, timestamps or facts. Keep every original topic. Label each addition with a reason.
- Do not copy content from `~/Documents/Latest Resume/interview-study/` or `work-records/` into this folder.
  Those folders hold details of office work.
- Write the text in ASD-STE100 Simplified Technical English.
