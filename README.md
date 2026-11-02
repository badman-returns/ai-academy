# AI Engineering Academy

This folder holds two parts:

- **The academy.** A static web page that teaches the topics, tracks your progress and gives you tickets.
- **The project.** The "Company AI Assistant" that you build in VS Code with Claude Code (Python, FastAPI and the Claude API).

The academy teaches. The project is where you build.

## Open the academy

1. Open the file `academy/index.html` in a browser.
   - On macOS: `open academy/index.html`
   - Or drag the file into a browser window.
2. You do not need a server, a build step or an internet connection for the pages.
   The links to external documentation need an internet connection.

## Folder layout

```text
ai-academy/
  README.md               # this file
  PROGRESS.md             # portable progress record (template; replace it with an export)
  NEXT-SESSION.md         # notes for the next tutor session
  academy/
    index.html            # the academy page; open this file
    styles.css            # styles, light and dark mode
    app.js                # routes, progress store, interactives, logic
    markdown.js           # Markdown for tickets, handoffs and PROGRESS.md
    content/
      curriculum.js       # topics and subtopics
      lessons/            # one file per lesson, with its tickets
    tools/
      generate.js         # writes ticket and handoff files into project/
      selftest.js         # tests for the logic and the content
  project/
    README.md             # how to start the project
    CLAUDE.md             # tutor rules for Claude Code
    .env.example          # names of the environment variables, no values
    .gitignore
    tickets/              # generated ticket files (do not edit)
    handoffs/             # your handoff notes, one per ticket
```

## Run the tools

Run these commands from this folder (`~/Documents/ai-academy`). They need Node.js and no packages.

Generate the ticket and handoff files:

```sh
node academy/tools/generate.js
```

- It writes `project/tickets/<id>.md` every time. Do not edit these files. Edit the lesson source instead.
- It writes `project/handoffs/<id>-handoff.md` only when that file does not exist. It never overwrites your notes.

Run the self-test:

```sh
node academy/tools/selftest.js
```

Each test name states the property that it checks. The last line shows the number of tests that passed and failed.

## Privacy

- Your progress stays in this browser only (local storage). No data goes to a server.
- A browser data clear deletes your progress. A private window does not keep it.
- Export your progress often. Go to **Progress and backup** in the academy:
  - **Export** saves a JSON backup that you can import again.
  - **Download PROGRESS.md** saves a portable record. Put it in this folder to replace the template.
- Keep your API key only in `project/.env`. Git ignores that file.
