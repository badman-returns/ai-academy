#!/usr/bin/env node
/*
 * Generate the project ticket and handoff files from the academy content.
 * Run from the ai-academy folder:  node academy/tools/generate.js
 * It writes project/tickets/<id>.md always.
 * It writes project/handoffs/<id>-handoff.md only when that file does not exist,
 * so it never overwrites your own handoff notes.
 */
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const base = path.join(__dirname, "..");
require(path.join(base, "content", "curriculum.js"));
fs.readdirSync(path.join(base, "content", "lessons")).filter(f => f.endsWith(".js")).sort()
  .forEach(f => require(path.join(base, "content", "lessons", f)));
require(path.join(base, "markdown.js"));

const A = globalThis.ACADEMY;
const projectDir = path.join(base, "..", "project");
for (const id of Object.keys(A.tickets)) {
  const t = A.tickets[id];
  const tp = path.join(projectDir, "tickets", id + ".md");
  fs.writeFileSync(tp, A.md.ticket(t));
  console.log("wrote " + path.relative(process.cwd(), tp));
  const hp = path.join(projectDir, "handoffs", id + "-handoff.md");
  if (fs.existsSync(hp)) {
    console.log("kept  " + path.relative(process.cwd(), hp) + " (exists)");
  } else {
    fs.writeFileSync(hp, A.md.handoffTemplate(t));
    console.log("wrote " + path.relative(process.cwd(), hp));
  }
}
