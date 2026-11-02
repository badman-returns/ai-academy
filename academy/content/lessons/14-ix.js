/*
 * Interactive for lesson 2.5: "l2-5-schema".
 * The learner edits a small data model: the tool name, and for each field the name, the type,
 * "required" and the enum values. The page shows the JSON Schema, the tool definition, the request
 * body and a sample response. It checks the sample response against the schema in the browser.
 *
 * Facts and their sources (Claude API docs, checked on 2026-11-02):
 *   - Tool fields name, description, input_schema; the name must match ^[a-zA-Z0-9_-]{1,128}$.
 *     Forced tool_choice ("any" or "tool") returns error 400 on Claude Opus 5.5 and Sonnet 5.5.
 *     Claude Haiku 5.5 accepts it. With a forced tool, the response has no text before tool_use.
 *     Source: platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
 *   - Tool use system prompt: 286 tokens with tool_choice auto on Opus 5.5, Sonnet 5.5 and
 *     Haiku 5.5; 406 tokens with any or tool on Haiku 5.5.
 *     Source: platform.claude.com/docs/en/agents-and-tools/tool-use/overview
 *   - "strict": true is a top-level property of the tool definition.
 *     Source: platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
 *   - output_config.format = { type: "json_schema", schema }, and objects need
 *     additionalProperties: false.
 *     Source: platform.claude.com/docs/en/build-with-claude/structured-outputs
 * The sample values, the tool id and the "prompt-only" errors are made up for teaching.
 * The schema is a minimal hand-built schema. Pydantic writes more keys (titles, $defs); see the lesson.
 * The prices come from the price table in app.js (A.logic.MODELS), the same table as lesson 1.1.
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l2-5-schema"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  const TYPES = ["string", "integer", "boolean", "enum"];
  const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  // A field name must also be a Python name, so that it can be a Pydantic field.
  const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const MAX_FIELDS = 8;
  /* Tool use system prompt tokens per model. forced: null means forced tool_choice returns error 400. */
  const TOOL_SYSTEM = {
    "claude-opus-5-5": { auto: 286, forced: null },
    "claude-sonnet-5-5": { auto: 286, forced: null },
    "claude-haiku-5-5": { auto: 286, forced: 406 }
  };
  const TRIAGE_FIELDS = [
    { name: "category", type: "enum", required: true, values: ["IT", "HR", "facilities", "finance", "other"] },
    { name: "priority", type: "enum", required: true, values: ["low", "medium", "high"] },
    { name: "summary", type: "string", required: true, values: [] },
    { name: "needs_human", type: "boolean", required: true, values: [] }
  ];
  const DESCRIPTION = "Record the triage result of one employee helpdesk message. Call this tool one time for each message. " +
    "Set category to the team that must act, and priority to how fast that team must act. " +
    "Write summary as one plain sentence. Set needs_human to true when the message is unclear or sensitive.";
  const MESSAGE = "My laptop does not connect to the VPN since this morning.";
  /* Made-up sample values for the triage fields. Other fields get a generic value. */
  const SAMPLE = { category: "IT", priority: "medium", summary: "The laptop of the user does not connect to the VPN.", needs_human: false };
  /* The same prices as A.logic.MODELS in app.js (USD per million tokens). */
  const FALLBACK_MODELS = [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", in: 4, out: 20 },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", in: 2, out: 10 },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", in: 0.10, out: 0.50, longIn: 0.50, longOut: 2.50, longAbove: 100000 }
  ];
  /* app.js loads after this file, so read the table when it is used, not at load time. */
  function models() {
    const L = window.ACADEMY.logic;
    return (L && L.MODELS) || FALLBACK_MODELS;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const usd = (x) => "$" + String(+x.toFixed(4));
  const copyFields = (fs) => fs.map((f) => ({ name: f.name, type: f.type, required: f.required, values: f.values.slice() }));
  /* "IT, HR, ,other" -> ["IT", "HR", "", "other"]. Empty entries stay, so that the check can report them. */
  const parseValues = (s) => (String(s).trim() === "" ? [] : String(s).split(",").map((v) => v.trim()));

  /* Problems that make the request invalid. Each problem is one sentence. */
  function checkModel(toolName, fields) {
    const out = [];
    if (!TOOL_NAME_RE.test(toolName)) out.push(`The tool name "${toolName}" does not match ^[a-zA-Z0-9_-]{1,128}$. The API returns error 400.`);
    if (!fields.length) out.push("The model has no fields.");
    const seen = {};
    fields.forEach((f, i) => {
      const at = `Field ${i + 1}`;
      if (!FIELD_NAME_RE.test(f.name)) out.push(`${at}: "${f.name}" is not a valid field name. Use letters, digits and _, and do not start with a digit.`);
      else if (seen[f.name]) out.push(`${at}: the name "${f.name}" is used two times. A JSON object cannot hold two keys with the same name.`);
      seen[f.name] = true;
      if (f.type === "enum") {
        if (!f.values.length) out.push(`${at}: an enum needs at least one value.`);
        if (f.values.some((v) => v === "")) out.push(`${at}: one enum value is empty. Remove the extra comma.`);
        if (new Set(f.values).size !== f.values.length) out.push(`${at}: an enum value is in the list two times.`);
      }
    });
    return out;
  }

  function fieldSchema(f) {
    if (f.type === "enum") return { type: "string", enum: f.values.slice() };
    return { type: f.type };
  }
  /* The minimal JSON Schema of the model. Every object gets additionalProperties: false. */
  function buildSchema(fields) {
    const properties = {};
    fields.forEach((f) => { properties[f.name] = fieldSchema(f); });
    return { type: "object", properties, required: fields.filter((f) => f.required).map((f) => f.name), additionalProperties: false };
  }
  function buildTool(toolName, fields) {
    return { name: toolName, description: DESCRIPTION, input_schema: buildSchema(fields), strict: true };
  }
  /* method: "tool" (strict tool use) or "output" (structured outputs). forced: a forced tool_choice. */
  function buildRequest(o) {
    const req = { model: o.modelId, max_tokens: 1024 };
    if (o.method === "output") {
      req.system = "You triage employee helpdesk messages for Northwind Tools.";
      req.output_config = { format: { type: "json_schema", schema: buildSchema(o.fields) } };
    } else {
      req.system = `You triage employee helpdesk messages for Northwind Tools. Always call the ${o.toolName} tool with your result.`;
      req.tools = [buildTool(o.toolName, o.fields)];
      req.tool_choice = o.forced ? { type: "tool", name: o.toolName } : { type: "auto" };
    }
    req.messages = [{ role: "user", content: MESSAGE }];
    return req;
  }

  /* What the API does with this method, tool_choice and model. */
  function apiStatus(o) {
    if (o.method === "output") return { http: 200, systemTokens: null, note: "No tools in the request, so there is no tool use system prompt." };
    const t = TOOL_SYSTEM[o.modelId] || { auto: 286, forced: null };
    if (!o.forced) return { http: 200, systemTokens: t.auto, note: "tool_choice auto: the model decides if it calls the tool. Check that a tool_use block came back." };
    if (t.forced === null) return { http: 400, systemTokens: null, note: "This model does not support a forced tool_choice. The API returns error 400 before the model runs." };
    return { http: 200, systemTokens: t.forced, note: "A forced tool: the response has no text before the tool_use block, and the model does not think first." };
  }

  function sampleValue(f) {
    if (f.name in SAMPLE && (f.type !== "enum" ? typeof SAMPLE[f.name] === (f.type === "integer" ? "number" : f.type) : f.values.includes(SAMPLE[f.name]))) return SAMPLE[f.name];
    if (f.type === "enum") return f.values[0];
    if (f.type === "integer") return 2;
    if (f.type === "boolean") return false;
    return "example text";
  }
  /*
   * A sample tool input. broken = true gives errors that are possible without enforcement:
   * the first required string field is missing, integers and booleans come as strings,
   * and the first enum value has a different capitalization (or is outside the list).
   */
  function sampleInput(fields, broken) {
    const input = {};
    let dropped = false, enumDone = false;
    fields.forEach((f) => {
      let v = sampleValue(f);
      if (broken) {
        if (f.required && f.type === "string" && !dropped) { dropped = true; return; }
        if (f.type === "integer") v = String(v);
        if (f.type === "boolean") v = v ? "yes" : "no";
        if (f.type === "enum" && !enumDone && typeof v === "string") {
          enumDone = true;
          const alt = v === v.toLowerCase() ? v.charAt(0).toUpperCase() + v.slice(1) : v.toLowerCase();
          v = f.values.includes(alt) ? v + "s" : alt;
        }
      }
      input[f.name] = v;
    });
    return input;
  }

  const typeOk = (spec, v) => {
    if (spec.enum) return typeof v === "string" && spec.enum.includes(v);
    if (spec.type === "integer") return Number.isInteger(v);
    if (spec.type === "boolean") return typeof v === "boolean";
    if (spec.type === "string") return typeof v === "string";
    return true;
  };
  /* Checks an object against the minimal schema. Returns a list of { field, error }. */
  function validate(schema, input) {
    const errs = [];
    if (!input || typeof input !== "object" || Array.isArray(input)) return [{ field: "", error: "the input is not a JSON object" }];
    (schema.required || []).forEach((k) => { if (!(k in input)) errs.push({ field: k, error: "required field is missing" }); });
    Object.keys(input).forEach((k) => {
      const spec = schema.properties[k];
      if (!spec) { if (schema.additionalProperties === false) errs.push({ field: k, error: "field is not in the schema" }); return; }
      if (!typeOk(spec, input[k])) {
        errs.push({ field: k, error: spec.enum ? `value ${JSON.stringify(input[k])} is not one of the enum values` : `expected ${spec.type}, got ${JSON.stringify(input[k])}` });
      }
    });
    return errs;
  }

  /* Everything that the page shows, from one state. Pure: the self-test calls it. */
  function compute(st) {
    const o = Object.assign({ toolName: "record_triage", fields: TRIAGE_FIELDS, method: "tool", forced: false, model: 0, sample: "enforced" }, st || {});
    const m = models()[o.model];
    const ro = { modelId: m.id, method: o.method, forced: o.method === "tool" && o.forced, toolName: o.toolName, fields: o.fields };
    const problems = checkModel(o.toolName, o.fields);
    const schema = buildSchema(o.fields);
    const tool = buildTool(o.toolName, o.fields);
    const request = buildRequest(ro);
    const status = apiStatus(ro);
    if (problems.length) Object.assign(status, { http: 400, systemTokens: null, note: "The request is not valid, so the API returns error 400 before the model runs." });
    const input = sampleInput(o.fields, o.sample === "prompt");
    let response = null;
    if (status.http === 200) {
      if (o.method === "output") response = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(input) }] };
      else {
        const content = ro.forced ? [] : [{ type: "text", text: "I will record the triage result." }];
        content.push({ type: "tool_use", id: "toolu_example_01", name: o.toolName, input });
        response = { stop_reason: "tool_use", content };
      }
    }
    const errors = response ? validate(schema, input) : [];
    const per1000 = status.systemTokens ? status.systemTokens * m.in / 1e6 * 1000 : 0;
    return { opts: o, model: m, problems, schema, tool, request, status, input, response, errors,
      toolChars: JSON.stringify(tool).length, systemCostPer1000: per1000 };
  }

  /* JSON for display. A key in "short" shows a short text in place of its value. */
  function shown(obj, short) {
    const marks = {};
    let n = 0;
    const json = JSON.stringify(obj, (k, v) => {
      if (short && k in short && typeof v === "object") { const t = "@@" + (n++) + "@@"; marks[t] = short[k]; return t; }
      return v;
    }, 2);
    let out = esc(json);
    /* esc() may turn the quotes into &quot;, so match both forms. */
    Object.keys(marks).forEach((t) => { out = out.replace(new RegExp(`(?:"|&quot;|&#34;)${t}(?:"|&quot;|&#34;)`), `<span class="muted">${esc(marks[t])}</span>`); });
    return out;
  }

  function mount(el) {
    let toolName = "record_triage", fields = copyFields(TRIAGE_FIELDS), method = "tool", forced = false, model = 0, sample = "enforced";
    const uid = "l25-" + (++mountCount);

    function fieldsHtml() {
      return fields.map((f, i) => `<div class="ix-form${i ? " ix-sub" : ""}" role="group" aria-label="Field ${i + 1}" style="margin-top:${i ? "var(--sp-3)" : "0"}">
          <div class="ix-field"><label for="${uid}-n${i}">Field ${i + 1} name</label><input id="${uid}-n${i}" type="text" spellcheck="false" autocomplete="off" value="${esc(f.name)}" data-ix-opt="fname" data-i="${i}"></div>
          <div class="ix-field"><label for="${uid}-t${i}">Type</label><select id="${uid}-t${i}" data-ix-opt="ftype" data-i="${i}">${TYPES.map((t) => `<option value="${t}"${t === f.type ? " selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="ix-field"><label for="${uid}-v${i}">Enum values, with commas</label><input id="${uid}-v${i}" type="text" spellcheck="false" autocomplete="off" value="${esc(f.values.join(", "))}" data-ix-opt="fvalues" data-i="${i}"${f.type === "enum" ? "" : " disabled"}></div>
          <div class="ix-field"><label class="ix-check"><input type="checkbox" data-ix-opt="freq" data-i="${i}"${f.required ? " checked" : ""}><span>Required</span></label>
            <button type="button" data-ix-act="remove" data-i="${i}"${fields.length < 2 ? " disabled" : ""}>Remove field ${i + 1}</button></div>
        </div>`).join("");
    }

    function resultHtml() {
      const r = compute({ toolName, fields, method, forced, model, sample });
      let verdict;
      if (r.problems.length) verdict = `<p><b>The API rejects this request with error 400.</b> Fix these problems:</p><ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
      else if (r.status.http === 400) verdict = `<p><b>Error 400.</b> ${esc(r.status.note)} Use tool_choice auto with strict, or structured outputs.</p>`;
      else if (r.errors.length) verdict = `<p><b>The response does not match the schema: ${r.errors.length} error${r.errors.length > 1 ? "s" : ""}.</b> Without enforcement, this can happen. Your validator must catch it and retry.</p>`;
      else verdict = `<p><b>The response matches the schema.</b> The shape is correct. The values can still be wrong (for example the wrong category), so your code still validates them and checks them with the sample set.</p>`;

      const isTool = method === "tool";
      const def = isTool ? shown(r.tool, { input_schema: "{ the JSON Schema of step 1 }" }) : shown(r.request.output_config, { schema: "{ the JSON Schema of step 1 }" });
      const body = shown(r.request, isTool ? { tools: "[ the tool definition of step 2 ]" } : { output_config: "{ the output_config of step 2 }" });
      const resp = r.response ? `<pre><code>${shown(r.response)}</code></pre>` :
        `<p class="muted">No response. The request fails before the model runs.</p>`;
      const errList = r.response ? (r.errors.length
        ? `<div class="table-wrap"><table><tr><th>Field</th><th>Check result</th></tr>${r.errors.map((e) => `<tr><td><code>${esc(e.field)}</code></td><td>${esc(e.error)}</td></tr>`).join("")}</table></div>`
        : `<p class="muted">The browser check of the sample against the schema finds 0 errors.</p>`) : "";
      const sys = r.status.systemTokens === null ? (method === "output" ? "none (no tools)" : "none: error 400") : r.status.systemTokens.toLocaleString("en-US") + " tokens";

      return `<div data-part="verdict">${verdict}</div>
        <div class="kv">
          <div>HTTP status<b>${r.problems.length ? 400 : r.status.http}</b></div>
          <div>Tool use system prompt<b>${esc(sys)}</b></div>
          <div>Its input cost per 1,000 requests<b>${r.systemCostPer1000 ? usd(r.systemCostPer1000) : "$0"}</b></div>
          <div>Tool definition size<b>${r.toolChars.toLocaleString("en-US")} characters</b></div>
        </div>
        <p class="muted">${esc(r.status.note)} The tool definition is input tokens too. Read the real count in usage.input_tokens.</p>
        <p class="ix-group">Step 1. The JSON Schema of the model</p>
        <pre><code>${shown(r.schema)}</code></pre>
        <p class="ix-group">Step 2. ${isTool ? "The tool definition (strict)" : "The output_config of structured outputs"}</p>
        <pre><code>${def}</code></pre>
        <p class="ix-group">Step 3. The request body</p>
        <pre><code>${body}</code></pre>
        <p class="ix-group">Step 4. A sample response (${sample === "enforced" ? "with enforcement" : "prompt only, without enforcement"})</p>
        ${resp}
        ${errList}`;
    }

    function syncButtons() {
      const set = (act, cur) => el.querySelectorAll(`[data-ix-act="${act}"]`).forEach((b) => {
        const on = b.dataset.v === String(cur);
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      set("method", method); set("choice", forced ? "tool" : "auto"); set("model", model); set("sample", sample);
      el.querySelectorAll('[data-ix-act="choice"]').forEach((b) => { b.disabled = method !== "tool"; });
      const add = el.querySelector('[data-ix-act="add"]');
      if (add) add.disabled = fields.length >= MAX_FIELDS;
    }
    function update() { syncButtons(); el.querySelector(".ix-result").innerHTML = resultHtml(); }
    function redrawFields() { el.querySelector('[data-part="fields"]').innerHTML = fieldsHtml(); update(); }

    const btn = (act, v, label) => `<button type="button" data-ix-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
    el.innerHTML = `<div class="ix-title">Schema to tool <span class="tag accent">real request shapes, sample response</span></div>
      <p class="ix-lead">Edit the triage model. The page builds the JSON Schema from it, puts the schema in a tool definition or in output_config, and shows the request and a sample response. Then it checks the sample against the schema.</p>
      <div class="ix-controls">
        <div class="ix-form"><div class="ix-field ix-wide"><label for="${uid}-tool">Tool name</label><input id="${uid}-tool" type="text" spellcheck="false" autocomplete="off" value="${esc(toolName)}" data-ix-opt="tool"></div></div>
        <div data-part="fields" style="margin-top:var(--sp-3)"></div>
        <div class="row" style="margin-top:var(--sp-3)">${btn("add", "add", "Add a field")}${btn("reset", "reset", "Reset to the triage model")}</div>
        <div class="row" role="group" aria-label="Method"><span>Method:</span>${btn("method", "tool", "Strict tool use")}${btn("method", "output", "Structured outputs")}</div>
        <div class="row" role="group" aria-label="tool_choice"><span>tool_choice:</span>${btn("choice", "auto", "auto")}${btn("choice", "tool", "force the tool")}</div>
        <div class="row" role="group" aria-label="Model"><span>Model:</span>${models().map((x, i) => btn("model", i, x.name.replace("Claude ", ""))).join("")}</div>
        <div class="row" role="group" aria-label="Sample response"><span>Sample:</span>${btn("sample", "enforced", "with enforcement")}${btn("sample", "prompt", "prompt only")}</div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select "prompt only" and read the errors. Then select "force the tool" on Opus 5.5, and then on Haiku 5.5.
      Change the type of a field, add an integer field, or type a tool name with a space. The schema here is a minimal schema. Pydantic writes more keys (titles and $defs).
      Sample values, the tool id and the prompt-only errors are made up for teaching. Token counts: the tool use docs. Prices: the price table of lesson 1.1.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a) || a.disabled) return;
      const act = a.dataset.ixAct, v = a.dataset.v;
      if (act === "method") method = v;
      else if (act === "choice") forced = v === "tool";
      else if (act === "model") model = +v;
      else if (act === "sample") sample = v;
      else if (act === "add" && fields.length < MAX_FIELDS) {
        let k = fields.length + 1;
        while (fields.some((f) => f.name === "field_" + k)) k++;
        fields.push({ name: "field_" + k, type: "integer", required: false, values: [] });
        redrawFields(); return;
      } else if (act === "remove" && fields.length > 1) { fields.splice(+a.dataset.i, 1); redrawFields(); return; }
      else if (act === "reset") { toolName = "record_triage"; fields = copyFields(TRIAGE_FIELDS); el.querySelector('[data-ix-opt="tool"]').value = toolName; redrawFields(); return; }
      else return;
      update();
    };
    const onInput = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt, f = fields[+o.dataset.i];
      if (k === "tool") toolName = o.value;
      else if (k === "fname") f.name = o.value;
      else if (k === "fvalues") f.values = parseValues(o.value);
      else return;
      update();
    };
    const onChange = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt, f = fields[+o.dataset.i];
      if (k === "freq") { f.required = o.checked; update(); }
      else if (k === "ftype") {
        f.type = o.value;
        if (f.type === "enum" && !f.values.length) f.values = ["a", "b"];
        redrawFields();
      }
    };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l25Unbind === "function") el._l25Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l25Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    redrawFields();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.checkModel = checkModel;
  mount.buildSchema = buildSchema;
  mount.buildTool = buildTool;
  mount.buildRequest = buildRequest;
  mount.sampleInput = sampleInput;
  mount.validate = validate;
  mount.parseValues = parseValues;
  mount.TRIAGE_FIELDS = TRIAGE_FIELDS;
  mount.TOOL_SYSTEM = TOOL_SYSTEM;
  window.ACADEMY.ix["l2-5-schema"] = mount;
})();
