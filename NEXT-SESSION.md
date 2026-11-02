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
  Lessons 1.1, 1.2, 1.3, 1.4 and 1.5 have the status "ready".
- `academy/content/lessons/`:
  - `01-how-llms-produce-text.js`: lesson 1.1 and ticket T-001.
  - `02-tokens-and-bpe.js`: lesson 1.2 and ticket T-002. It uses the "bpe" interactive in `app.js`.
  - `03-embeddings-and-cosine.js`: lesson 1.3 and ticket T-003. `03-ix.js` adds the "cosine2d" interactive.
  - `04-attention-qkv.js`: lesson 1.4 and ticket T-004. `04-ix.js` adds the "l1-4-attention" interactive.
  - `05-transformer-block.js`: lesson 1.5 and ticket T-005. `05-ix.js` adds the "l1-5-block" interactive.
    The toy numbers of this interactive are also the fixture `data/block_toy.json` of T-005.
  - `index.html` loads each of these files.
- `academy/tools/generate.js`: writes the tickets and the handoff templates into `project/`.
  It wrote `project/tickets/T-001.md` to `T-005.md` and `project/handoffs/T-001-handoff.md` to `T-005-handoff.md`.
  It does not overwrite a handoff file that exists.
- `academy/tools/selftest.js`: 50 tests. All pass.
  Run it with `node academy/tools/selftest.js` from this folder.
- `README.md`, `PROGRESS.md` and the `project/` scaffold exist.

## What remains

- The user's final review of lessons 1.1 to 1.5 and tickets T-001 to T-005 is pending.
- The next lesson is 1.6, "Pretraining and post-training (SFT, RLHF, DPO)". Its status is "planned".
  Build it only when the user asks for it.
- The UI redesign is done (2026-11-02). The user's final review of it is pending. Report: `site-check/REDESIGN-REPORT.md`.

## Rules

- Do not commit. The user makes the commits.
- Never print secret values. Refer to env var names only.
- Never invent links, timestamps or facts. Keep every original topic. Label each addition with a reason.
- Do not copy content from `~/Documents/Latest Resume/interview-study/` or `work-records/` into this folder.
  Those folders hold details of office work.
- Write the text in ASD-STE100 Simplified Technical English.
