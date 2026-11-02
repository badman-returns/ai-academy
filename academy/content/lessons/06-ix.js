/*
 * Interactive for lesson 1.6: "l1-6-training".
 * It shows how training changes the answer of one toy model to one prompt.
 * The toy model gives a probability to 4 complete replies. It does not work token by token.
 * Stage 1 is the base model after pretraining. Stage 2 runs SFT: gradient descent on the
 * cross-entropy loss of the demonstration reply. Stage 3 is preference tuning: the policy
 * that RLHF and DPO aim for, pi(y) = pi_ref(y) * exp(r(y) / beta) / Z, with the SFT model as pi_ref.
 * The learner selects the stage, the number of SFT steps, beta, and a flaw in the reward model.
 * All numbers are made up for teaching. A real model changes billions of weights, not 4 logits.
 * The same numbers are in the fixture of ticket T-006 (data/training_toy.json).
 * This file does not touch the document at load time, so the Node self-test can load it.
 * Registration: window.ACADEMY.ix["l1-6-training"] is a function mount(el). It also has
 * a .mount property that points to the same function.
 */
window.ACADEMY = window.ACADEMY || { lessons: {}, tickets: {} };
window.ACADEMY.ix = window.ACADEMY.ix || {};

(function () {
  /* Toy data. The reward model scores and the human ratings are the same, unless the flaw is on. */
  const TOY = {
    prompt: "Can I get my money back?",
    replies: [
      { id: "faq-list", label: "FAQ list", text: "Can I change my order? Can I pay by invoice? Can I track my parcel?" },
      { id: "helpful", label: "Helpful", text: "Yes. Open Orders, select the order and select Refund. The refund policy page gives the time limits." },
      { id: "padded", label: "Padded", text: "Yes, of course! Great question! Northwind Tools cares about every customer, and refunds are part of our long history of good service, so..." },
      { id: "refuses", label: "Refuses", text: "I cannot answer questions about money." }
    ],
    base_logits: [2.0, 0.0, 0.5, -0.5],
    demonstration: 1,
    learning_rate: 0.5,
    human_rating: [-2, 2, 0.5, -1],
    reward_model: [-2, 2, 0.5, -1],
    flawed_reward_model: [-2, 2, 4, -1]
  };
  const BETAS = [0.1, 0.25, 0.5, 1, 2, 5];
  const STAGES = [["base", "Base model"], ["sft", "After SFT"], ["pref", "After preference tuning"]];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  /* Stable softmax: subtract the largest logit before exp. */
  function softmax(logits) {
    const m = Math.max(...logits);
    const ex = logits.map((x) => Math.exp(x - m));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map((e) => e / s);
  }
  /*
   * SFT on one demonstration. The loss is -ln p(demo). Its gradient for logit i is p_i - 1 for
   * the demonstration and p_i for the others. Each step subtracts learning_rate times the gradient.
   */
  function sftLogits(logits, demo, steps, lr) {
    let z = logits.slice();
    for (let s = 0; s < steps; s++) {
      const p = softmax(z);
      z = z.map((x, i) => x - lr * (p[i] - (i === demo ? 1 : 0)));
    }
    return z;
  }
  /*
   * The KL-regularized optimum: pi(y) = pi_ref(y) * exp(r(y) / beta) / Z.
   * It works in log space and subtracts the largest value, so a small beta does not overflow.
   */
  function preferencePolicy(ref, rewards, beta) {
    const logs = ref.map((p, i) => Math.log(p) + rewards[i] / beta);
    const m = Math.max(...logs);
    const ex = logs.map((x) => Math.exp(x - m));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map((e) => e / s);
  }
  /* KL(p || q) in nats. A term with p_i = 0 adds 0. */
  function kl(p, q) {
    return p.reduce((s, pi, i) => (pi > 0 ? s + pi * Math.log(pi / q[i]) : s), 0);
  }
  const expect = (p, v) => p.reduce((s, pi, i) => s + pi * v[i], 0);

  /*
   * The full computation that the interactive shows.
   * opts: { stage ("base", "sft" or "pref"), steps (0 to 30), beta, flaw (boolean) }.
   */
  function compute(opts) {
    const o = Object.assign({ stage: "pref", steps: 10, beta: 1, flaw: false }, opts || {});
    const base = softmax(TOY.base_logits);
    const sft = softmax(sftLogits(TOY.base_logits, TOY.demonstration, o.steps, TOY.learning_rate));
    const rewards = o.flaw ? TOY.flawed_reward_model : TOY.reward_model;
    const pref = preferencePolicy(sft, rewards, o.beta);
    const byStage = { base, sft, pref };
    const probs = byStage[o.stage];
    const top = probs.indexOf(Math.max(...probs));
    return {
      opts: o,
      base, sft, pref, probs, rewards, top,
      demoLoss: -Math.log(probs[TOY.demonstration]),
      klFromSft: kl(probs, sft),
      klFromBase: kl(probs, base),
      rewardScore: expect(probs, rewards),
      humanScore: expect(probs, TOY.human_rating)
    };
  }

  const f2 = (x) => {
    const r = Math.round(x * 100) / 100;
    return (Object.is(r, -0) ? 0 : r).toFixed(2);
  };

  function mount(el) {
    let stage = "pref", steps = 10, betaAt = 3, flaw = false;

    /* The result part. It changes on every input. The controls stay in place, so a slider keeps the pointer while you drag it. */
    function resultHtml() {
      const beta = BETAS[betaAt];
      const r = compute({ stage, steps, beta, flaw });
      const name = STAGES.find((s) => s[0] === stage)[1];
      const bars = TOY.replies.map((rep, i) => {
        const cls = i === r.top ? "chosen" : "";
        return `<div class="bar-row ${cls}"><span class="lbl" title="${esc(rep.label)}">${esc(rep.label)}</span><span class="track"><i style="width:${(r.probs[i] * 100).toFixed(1)}%"></i></span><span class="val">${r.probs[i].toFixed(3)}</span></div>`;
      }).join("");
      /* One column: the label and the reply on the first lines, the numbers below. Many columns are too narrow on a phone.
         The shared CSS changes a ".muted" span in a result table cell (no wrap, and a block on a phone).
         So the cells use <small>, which has the same color, and the numbers use two short lines. */
      const rows = TOY.replies.map((rep, i) => `<tr><td><b>${esc(rep.label)}</b>${i === TOY.demonstration ? ` <small>· the SFT demonstration</small>` : ""}<br>
        <span>"${esc(rep.text)}"</span><br>
        <small>base ${f2(r.base[i])} · SFT ${f2(r.sft[i])} · tuned ${f2(r.pref[i])}</small><br>
        <small>reward ${f2(r.rewards[i])} · human ${f2(TOY.human_rating[i])}</small></td></tr>`).join("");
      return `<p class="ix-group">${esc(name)}: probability of each reply</p>
          <div class="bars">${bars}</div>
          <div class="kv"><div>Most likely reply<b>${esc(TOY.replies[r.top].label)}</b></div><div>SFT loss, −ln p(Helpful)<b>${f2(r.demoLoss)}</b></div><div>KL from the SFT model<b>${f2(r.klFromSft)}</b></div><div>Reward model score<b>${f2(r.rewardScore)}</b></div><div>Human rating<b>${f2(r.humanScore)}</b></div></div>
          <div class="table-wrap"><table>
            <tr><th>Reply, and its probability at each stage</th></tr>
            ${rows}
          </table></div>`;
    }

    function update() {
      el.querySelectorAll('[data-ix-act="stage"]').forEach((b) => {
        const on = b.dataset.stage === stage;
        b.classList.toggle("primary", on); b.setAttribute("aria-pressed", String(on));
      });
      const beta = BETAS[betaAt];
      el.querySelector('[data-out="steps"]').textContent = String(steps);
      el.querySelector('[data-out="beta"]').textContent = String(beta);
      el.querySelector('[data-ix-opt="steps"]').setAttribute("aria-valuetext", steps + (steps === 1 ? " step" : " steps"));
      el.querySelector('[data-ix-opt="beta"]').setAttribute("aria-valuetext", "beta " + beta);
      el.querySelector(".ix-result").innerHTML = resultHtml();
    }

    const stageBtns = STAGES.map((s) =>
      `<button type="button" data-ix-act="stage" data-stage="${s[0]}">${esc(s[1])}</button>`).join("");
    // The ids must be unique on the page, so they include a counter.
    const uid = "l16-" + (++mountCount);
    el.innerHTML = `<div class="ix-title">From base model to chat model <span class="tag accent">toy numbers, computed live</span></div>
      <p class="ix-lead">One prompt: "${esc(TOY.prompt)}". The toy model gives a probability to four complete replies. SFT trains on the "Helpful" reply. Preference tuning starts from the SFT model and moves toward the replies with a high reward.</p>
      <div class="ix-controls">
        <div class="row" role="group" aria-label="Training stage"><span>Stage:</span>${stageBtns}</div>
        <div class="slider-row"><label for="${uid}-steps">SFT steps</label><input id="${uid}-steps" type="range" min="0" max="30" step="1" value="${steps}" data-ix-opt="steps"><b data-out="steps"></b></div>
        <div class="slider-row"><label for="${uid}-beta">β (KL leash)</label><input id="${uid}-beta" type="range" min="0" max="${BETAS.length - 1}" step="1" value="${betaAt}" data-ix-opt="beta"><b data-out="beta"></b></div>
        <div class="row"><label class="ix-check"><input type="checkbox" data-ix-opt="flaw" ${flaw ? "checked" : ""}><span>Flawed reward model: it gives long replies a high score</span></label></div>
      </div>
      <div class="ix-result" aria-live="polite"></div>
      <p class="muted">Try these. Select "Base model": the most likely reply continues the list of questions, as a web page would.
      Select "After SFT" and move the SFT steps from 0 to 30. Then select "After preference tuning", switch on the flawed reward model, and move β down to 0.1.
      Look at the reward model score and the human rating.</p>`;

    const onClick = (ev) => {
      const a = ev.target.closest("[data-ix-act]");
      if (!a || !el.contains(a)) return;
      if (a.dataset.ixAct === "stage") { stage = a.dataset.stage; update(); }
    };
    const onOpt = (ev) => {
      const o = ev.target.closest("[data-ix-opt]");
      if (!o || !el.contains(o)) return;
      const k = o.dataset.ixOpt;
      if (k === "steps") steps = +o.value;
      else if (k === "beta") betaAt = +o.value;
      else if (k === "flaw") flaw = o.checked;
      update();
    };
    // Sliders update on "input" (live while you drag). The check box updates on "change".
    const onInput = (ev) => { if (ev.target.type === "range") onOpt(ev); };
    const onChange = (ev) => { if (ev.target.type === "checkbox") onOpt(ev); };
    // A second mount on the same element removes the listeners of the first mount.
    if (typeof el._l16Unbind === "function") el._l16Unbind();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el._l16Unbind = () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
    };
    update();
  }
  let mountCount = 0;

  mount.mount = mount;
  mount.compute = compute;
  mount.softmax = softmax;
  mount.sftLogits = sftLogits;
  mount.preferencePolicy = preferencePolicy;
  mount.kl = kl;
  mount.BETAS = BETAS;
  mount.TOY = TOY;
  window.ACADEMY.ix["l1-6-training"] = mount;
})();
