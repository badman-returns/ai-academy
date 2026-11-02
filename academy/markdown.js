/*
 * Markdown generators shared by the browser app and by node.
 *
 * The same functions make:
 *   - the ticket file (project/tickets/<id>.md),
 *   - the empty handoff template (project/handoffs/<id>-handoff.md),
 *   - the filled handoff that the app copies for a review,
 *   - the PROGRESS.md export.
 * One source of data, so the files and the app cannot disagree.
 *
 * Node use:  node academy/tools/generate.js
 */
(function (root) {
  root.ACADEMY = root.ACADEMY || { lessons: {}, tickets: {} };

  /*
   * Convert the small HTML subset that the content files use into Markdown.
   * The text stays escaped (&lt;) while the tags are converted and removed.
   * finish() decodes the entities one time, at the end. Thus an escaped
   * angle bracket is text, and a tag remover never sees it as a tag.
   * CODE_START and CODE_END mark code text, which keeps literal brackets.
   */
  const CODE_START = "\u0001", CODE_END = "\u0002";

  function htmlToMd(html) {
    if (!html) return "";
    let s = String(html);
    s = s.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, function (_, code) {
      return "\n```\n" + CODE_START + code.replace(/^\n+|\s+$/g, "") + CODE_END + "\n```\n";
    });
    // Tables: one row per <tr>, cells split by |.
    s = s.replace(/<div class="table-wrap">|<\/div>/g, "");
    s = s.replace(/<table>([\s\S]*?)<\/table>/g, function (_, body) {
      const rows = body.match(/<tr>[\s\S]*?<\/tr>/g) || [];
      const out = rows.map(function (r, i) {
        const cells = (r.match(/<t[hd]>[\s\S]*?<\/t[hd]>/g) || []).map(function (c) {
          return inline(c.replace(/<\/?t[hd]>/g, "")).trim().replace(/\|/g, "\\|");
        });
        let line = "| " + cells.join(" | ") + " |";
        if (i === 0) line += "\n|" + cells.map(function () { return " --- "; }).join("|") + "|";
        return line;
      });
      return "\n" + out.join("\n") + "\n";
    });
    // Ordered lists get numbers, unordered lists get dashes.
    s = s.replace(/<ol>([\s\S]*?)<\/ol>/g, function (_, body) {
      let n = 0;
      return "\n" + body.replace(/<li>([\s\S]*?)<\/li>/g, function (_, li) { n += 1; return n + ". " + inline(li).trim() + "\n"; }).replace(/^\s+/gm, "") + "\n";
    });
    s = s.replace(/<ul>([\s\S]*?)<\/ul>/g, function (_, body) {
      return "\n" + body.replace(/<li>([\s\S]*?)<\/li>/g, function (_, li) { return "- " + inline(li).trim() + "\n"; }).replace(/^\s+/gm, "") + "\n";
    });
    s = s.replace(/<h3>([\s\S]*?)<\/h3>/g, function (_, h) { return "\n### " + inline(h) + "\n"; });
    s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, function (_, p) { return "\n" + inline(p).replace(/\s*\n\s*/g, " ").trim() + "\n"; });
    s = finish(inline(s));
    // Remove the indentation that the HTML source leaves on empty lines.
    return s.replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Convert inline tags and remove all other tags. The text stays escaped.
  function inline(s) {
    return String(s)
      .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
      .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
      .replace(/<code>([\s\S]*?)<\/code>/g, "`" + CODE_START + "$1" + CODE_END + "`")
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
      .replace(/<sub>([\s\S]*?)<\/sub>/g, "_$1")
      .replace(/<sup>([\s\S]*?)<\/sup>/g, "^$1")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "");
  }

  // Decode the entities one time. Code text gets a literal "<". Other text
  // gets "\<", so that a Markdown viewer shows "<" and does not read a tag.
  function finish(s) {
    return s.split(/\u0001([\s\S]*?)\u0002/).map(function (part, i) { return decode(part, i % 2 === 0); }).join("");
  }

  function decode(s, prose) {
    return s.replace(/&lt;/g, prose ? "\\<" : "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }

  const FIELDS = [
    ["objective", "Objective and real-world problem"],
    ["context", "Context in the project"],
    ["prerequisites", "Prerequisites"],
    ["requirements", "Functional and technical requirements"],
    ["acceptance", "Acceptance criteria"],
    ["milestones", "Milestones"],
    ["files", "Likely files"],
    ["tests", "Test cases and expected behavior"],
    ["nfr", "Security, reliability, performance and cost"],
    ["questions", "Questions to answer after the ticket"],
    ["checklist", "Completion checklist and review criteria"]
  ];

  function ticket(t) {
    const L = [];
    L.push("# " + t.id + ": " + t.title, "");
    L.push("> Generated from `academy/content/lessons/` by `academy/tools/generate.js`. Edit the source, not this file.", "");
    L.push("- Lesson: " + t.lesson);
    L.push("- Project phase: " + t.phase);
    L.push("- Mode: " + t.mode);
    if (t.estimate) L.push("- Pace: " + t.estimate);
    L.push("");
    FIELDS.forEach(function (f, i) {
      L.push("## " + (i + 2) + ". " + f[1], "", htmlToMd(t.fields[f[0]]), "");
    });
    L.push("---", "", "When you finish, fill in `handoffs/" + t.id + "-handoff.md` and paste it into the academy (Tickets page) or into a Claude review chat.", "");
    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  const HANDOFF_SECTIONS = [
    ["implemented", "What I implemented", "Describe the result in your own words. Which milestones are complete?"],
    ["code", "Code or diff", "Paste the important parts, or the output of `git diff --stat` and the key functions."],
    ["tests", "Tests and results", "Paste the `pytest` output and the terminal output for each acceptance criterion."],
    ["problems", "Problems and how I solved them", "Error messages, wrong ideas, what you tried, what worked."],
    ["confident", "What I can explain confidently", "Concepts and code you can explain without notes."],
    ["unclear", "What is still unclear", "Be honest. This is the most useful section for the review."],
    ["answers", "Answers to the ticket questions", "Answer each question from section 11 of the ticket."]
  ];

  function handoffTemplate(t) {
    const L = ["# Handoff: " + t.id + " " + t.title, "", "- Date:", "- Time spent:", "- Claude Code mode used (guided, independent, debugging, review, teach-back):", ""];
    HANDOFF_SECTIONS.forEach(function (s) {
      L.push("## " + s[1], "", "<!-- " + s[2] + " -->", "", "");
    });
    L.push("## Review request", "", reviewPrompt(t), "");
    return L.join("\n");
  }

  function handoffFilled(t, h) {
    h = h || {};
    const L = ["# Handoff: " + t.id + " " + t.title, ""];
    HANDOFF_SECTIONS.forEach(function (s) {
      L.push("## " + s[1], "", (h[s[0]] || "").trim() || "_(empty)_", "");
    });
    L.push("## Review request", "", reviewPrompt(t), "");
    return L.join("\n");
  }

  function reviewPrompt(t) {
    return "You are my AI engineering tutor. Review this handoff for ticket " + t.id + " (\"" + t.title + "\"). " +
      "Check it against the ticket's acceptance criteria and review criteria. " +
      "Do not rewrite my code. List what is correct, what is wrong or risky, and what I seem to misunderstand. " +
      "Then ask me three questions that test whether I understand the code. Then suggest which mastery level (1 to 6) the evidence supports for each concept of lesson " + t.lesson + ".";
  }

  const LEVEL_NAMES = ["Not started", "Introduced", "Understood", "Visualized", "Applied", "Analyzed", "Can teach"];

  function progress(state, data) {
    data = data || root.ACADEMY;
    state = state || {};
    const L = ["# Progress", "", "Exported from the academy on " + new Date().toISOString().slice(0, 10) + ".", ""];
    L.push("## Lessons", "");
    L.push("| Lesson | Title | Highest level open | Completed |", "| --- | --- | --- | --- |");
    (data.curriculum || []).forEach(function (topic) {
      topic.lessons.forEach(function (l) {
        if (l.status !== "ready") return;
        const p = (state.lessons || {})[l.id] || {};
        L.push("| " + l.id + " | " + l.title + " | " + (p.levelUnlocked || 1) + " of 3 | " + (p.completedAt ? p.completedAt.slice(0, 10) : "no") + " |");
      });
    });
    L.push("", "## Mastery", "");
    L.push("| Concept | Level | Latest evidence |", "| --- | --- | --- |");
    Object.keys(data.lessons || {}).forEach(function (lid) {
      (data.lessons[lid].concepts || []).forEach(function (c) {
        const m = (state.concepts || {})[c.id] || { level: 0, evidence: [] };
        const ev = m.evidence && m.evidence.length ? m.evidence[m.evidence.length - 1] : null;
        L.push("| " + c.name + " | " + m.level + " (" + LEVEL_NAMES[m.level] + ") | " + (ev ? ev.date.slice(0, 10) + ": " + ev.note.replace(/\|/g, "/") : "") + " |");
      });
    });
    L.push("", "## Tickets", "");
    L.push("| Ticket | Status | Started | Done |", "| --- | --- | --- | --- |");
    Object.keys(data.tickets || {}).forEach(function (tid) {
      const p = (state.tickets || {})[tid] || {};
      L.push("| " + tid + " | " + (p.status || "not started") + " | " + (p.startedAt || "").slice(0, 10) + " | " + (p.doneAt || "").slice(0, 10) + " |");
    });
    const due = Object.keys(state.reviews || {}).filter(function (k) { return state.reviews[k].due <= new Date().toISOString().slice(0, 10); }).length;
    L.push("", "## Review", "", "Cards due today or earlier: " + due + ".", "");
    L.push("## Misconceptions I found", "");
    (state.misconceptions || []).forEach(function (m) { L.push("- " + m.date.slice(0, 10) + ": " + m.text); });
    if (!(state.misconceptions || []).length) L.push("_(none recorded)_");
    L.push("", "## Journal", "");
    (state.journal || []).forEach(function (j) { L.push("### " + j.date.slice(0, 10) + (j.lesson ? " (lesson " + j.lesson + ")" : ""), "", j.text, ""); });
    if (!(state.journal || []).length) L.push("_(no entries)_");
    return L.join("\n") + "\n";
  }

  root.ACADEMY.md = { htmlToMd: htmlToMd, ticket: ticket, handoffTemplate: handoffTemplate, handoffFilled: handoffFilled, progress: progress, reviewPrompt: reviewPrompt, LEVEL_NAMES: LEVEL_NAMES, HANDOFF_SECTIONS: HANDOFF_SECTIONS };
})(typeof window !== "undefined" ? window : globalThis);
