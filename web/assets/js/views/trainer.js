/**
 * Trainer: the reason to open this site daily.
 *
 * Three ways to be asked, one schedule underneath:
 *
 *   recall     type the algorithm.  Graded two ways — did it reach the goal
 *              (checked on the cube, not by string compare), and is it as short
 *              as the engine's?
 *   recognise  pick the right algorithm out of four.
 *   flash      look at the case, say it out loud, reveal, and grade yourself.
 *
 * Ordering comes from a six-box review schedule in localStorage, so what you
 * missed ten minutes ago comes back before what you knew last week.
 */
import { data, casesOf, caseByKey, levelKeys, search } from "../data.js";
import { el, mount, chip, num, toast, progressBar, emptyState, download } from "../util.js";
import { cubePanel, boxDots, openCase } from "../parts.js";
import { schedule, review, stats, logSession, card as srsCard, exportAll } from "../store.js";
import { goalReached, goalUpToAuf, GOAL_TEXT } from "../goals.js";
import { tokenize, scramble as makeScramble } from "../model.js";
import { topLayer } from "../diagram.js";

const MODES = {
  recall: "Type it",
  recognise: "Pick it",
  flash: "Say it",
};

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;

  /* ---------------------------------------------------------- which cards? */
  const setOptions = [];
  setOptions.push({ id: "*", label: `Everything (${data.cases.length})`, keys: data.cases.map((c) => c.key) });
  for (const f of data.families) {
    setOptions.push({ id: f.key, label: `${f.label} (${f.cases})`, keys: casesOf(f.key).map((c) => c.key) });
  }
  for (const lv of data.levelsList) {
    setOptions.push({ id: `level:${lv.key}`, label: `${lv.title} (${levelKeys(lv.key).length})`, keys: levelKeys(lv.key) });
    for (const item of lv.curriculum || []) {
      setOptions.push({
        id: `set:${lv.key}:${item.id}`,
        label: `↳ ${item.title} (${item.cases.length})`,
        keys: item.cases.map((c) => c.key),
        indent: true,
      });
    }
  }

  let keys = [];
  if (query.keys) {
    keys = String(query.keys).split(",").filter((k) => caseByKey(k));
  } else if (query.level && query.set) {
    const opt = setOptions.find((o) => o.id === `set:${query.level}:${query.set}`);
    keys = opt ? opt.keys : [];
  } else if (query.level) {
    keys = levelKeys(query.level);
  } else if (query.family) {
    keys = casesOf(query.family).map((c) => c.key);
    if (query.key && keys.includes(query.key)) keys = [query.key, ...keys.filter((k) => k !== query.key)];
  } else {
    keys = setOptions[0].keys;
  }

  const chosen = query.keys ? "custom"
    : query.level && query.set ? `set:${query.level}:${query.set}`
    : query.level ? `level:${query.level}`
    : query.family || "*";

  let mode = query.mode || "recall";
  let queue = schedule(keys).map((r) => r.key);
  let index = 0;
  let session = { total: 0, right: 0, near: 0, wrong: 0, startedAt: Date.now(), ms: 0 };

  /* ---------------------------------------------------------------- chrome */
  const setSelect = el("select", {
    attrs: { "aria-label": "Which cards" },
    onChange: (e) => {
      const opt = setOptions.find((o) => o.id === e.target.value);
      if (!opt) return;
      keys = opt.keys;
      queue = schedule(keys).map((r) => r.key);
      index = 0;
      next();
    },
  }, ...setOptions.map((o) => el("option", {
    value: o.id, selected: o.id === chosen, style: o.indent ? { paddingLeft: "16px" } : null,
  }, o.label)));

  const modeTabs = el("div", { class: "pill-tabs" },
    ...Object.entries(MODES).map(([k, label]) => el("button", {
      class: `pill-tab ${k === mode ? "is-on" : ""}`, type: "button", dataset: { mode: k },
      onClick: () => {
        mode = k;
        [...modeTabs.children].forEach((b) => b.classList.toggle("is-on", b.dataset.mode === k));
        next();
      },
    }, label)));

  const shuffleBtn = el("button", {
    class: "btn btn--sm", type: "button", title: "Random order, ignore the schedule",
    onClick: () => {
      queue = keys.slice().sort(() => Math.random() - 0.5);
      index = 0;
      next();
    },
  }, "Shuffle");

  const dueOnly = el("button", {
    class: "btn btn--sm", type: "button", title: "Only cards the schedule says are due",
    onClick: () => {
      const now = Date.now();
      queue = schedule(keys).filter((r) => r.overdue || r.fresh).map((r) => r.key);
      index = 0;
      toast(queue.length ? `${queue.length} cards due` : "Nothing due — you are up to date", queue.length ? "info" : "ok");
      next();
    },
  }, "Due now");

  /* ----------------------------------------------------------------- stage */
  const panel = cubePanel({ size: 268, highlight: "ll", reset: false, viewToggle: true });
  const diagram = el("div", {});
  const question = el("div", { class: "stack" });
  const verdict = el("div");
  const statsBar = el("div", { class: "stats" });
  const progress = el("div", {});

  const stage = el("div", { class: "trainer" },
    el("div", { class: "trainer__stage panel" },
      el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted", id: "trainer-pos" }, ""),
        el("span", { class: "spacer" }),
        el("span", { class: "tiny muted" }, "drag to rotate")),
      panel.node,
      diagram,
      el("div", { class: "cube-tools" },
        el("button", { class: "btn btn--sm", type: "button", id: "t-hint" }, "Show a hint"),
        el("button", { class: "btn btn--sm", type: "button", id: "t-replay" }, "Play the answer"),
        el("button", { class: "btn btn--sm", type: "button", id: "t-again" }, "Show the case again"))),
    el("div", { class: "panel stack" },
      progress,
      question,
      verdict,
      statsBar));

  /* ------------------------------------------------------------- the card */
  let current = null;
  let answered = false;
  let askedAt = 0;

  function draw() {
    if (index >= queue.length) return finish();
    const row = caseByKey(queue[index]);
    if (!row) { index++; return draw(); }
    current = row;
    answered = false;
    askedAt = Date.now();

    panel.cube.stop();
    panel.cube.setState(row.state);
    mount(diagram, el("div", { style: { display: "grid", placeItems: "center", marginTop: "8px" } },
      topLayer(row.state, { size: 108 })));

    const c = srsCard(row.key);
    mount(progress,
      el("div", { class: "row row--tight" },
        chip(`${index + 1} / ${queue.length}`, "fox"),
        chip(row.familyLabel || row.family),
        ...(row.names || []).map((n) => chip(n, "gold")),
        el("span", { class: "spacer" }),
        boxDots(c.box),
        el("span", { class: "tiny muted" }, c.seen ? `${c.seen} reviews` : "new")),
      progressBar(index, queue.length, `${Math.round((100 * index) / Math.max(1, queue.length))}% of this queue`));

    mount(question, askFor(row));
    mount(verdict);
    drawStats();
  }

  function askFor(row) {
    const goal = GOAL_TEXT[row.family] || data.algorithms.families[row.family].goal;
    const head = el("div", {},
      el("h3", {}, mode === "recognise" ? "Which algorithm is this?" : "What is this case?"),
      el("p", { class: "small muted" },
        `Goal: ${goal}. `,
        row.desc.pattern, " · ", row.desc.permutation,
        row.auf_text ? el("span", {}, ` · pre-AUF ${row.auf_text}`) : null));

    if (mode === "recall") {
      const input = el("input", {
        class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
        placeholder: "Type it, e.g. R U R' U' R' F R F'",
        attrs: { "aria-label": "Your algorithm" },
        onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); check(input.value); } },
      });
      return el("div", { class: "stack" }, head, input,
        el("div", { class: "row" },
          el("button", { class: "btn btn--primary", type: "button", onClick: () => check(input.value) }, "Check"),
          el("button", { class: "btn", type: "button", onClick: () => reveal(row) }, "Give up — show me"),
          el("span", { class: "tiny muted" }, "Enter to check · graded on whether it solves the case")));
    }

    if (mode === "recognise") {
      const options = distractors(row);
      return el("div", { class: "stack" }, head,
        el("div", { class: "grid", style: { gap: "8px" } }, options.map((opt, i) =>
          el("button", {
            class: "btn", type: "button", style: { justifyContent: "flex-start", fontFamily: "var(--mono)" },
            onClick: (e) => pick(e.currentTarget, opt, row),
          }, el("b", {}, `${i + 1}.`), ` ${opt || "(no algorithm needed)"}`))),
        el("p", { class: "tiny muted" }, "Press 1-4 to answer."));
    }

    // flash
    return el("div", { class: "stack" }, head,
      el("div", { class: "hint" }, "Say the algorithm out loud, or run it in your head, then reveal it and grade yourself honestly."),
      el("div", { class: "row" },
        el("button", { class: "btn btn--primary", type: "button", onClick: () => reveal(row) }, "Reveal"),
        el("span", { class: "tiny muted" }, "Space to reveal")));
  }

  function distractors(row) {
    const pool = casesOf(row.family).filter((c) => c.key !== row.key && c.text && c.text !== row.text);
    const picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].text);
    }
    const opts = [...picks, row.text];
    return opts.sort(() => Math.random() - 0.5);
  }

  function pick(node, text, row) {
    if (answered) return;
    const right = text === row.text;
    [...question.querySelectorAll("button.btn")].forEach((b) => {
      const isThis = b.textContent.includes(text || "(no algorithm");
      b.classList.toggle("btn--on", isThis && right);
      if (isThis && !right) b.style.borderColor = "var(--rose)";
    });
    grade(row, right ? 2 : 0, right ? "Correct." : `Not that one.`, text);
  }

  function normalise(text) {
    try { return M.format(M.parse(text)); } catch { return String(text || "").trim(); }
  }

  function check(typed) {
    if (answered || !current) return;
    const row = current;
    const mine = normalise(typed);
    const want = normalise(row.text);

    if (!mine) { reveal(row); return; }

    // does it actually work?  the same question the engine answers, asked on
    // the facelets the engine published
    let after = row.state;
    let legal = true;
    try {
      for (const tok of tokenize(typed)) after = M.apply(after, tok);
    } catch {
      legal = false;
    }
    const reaches = legal && goalReached(row.family, after, M);
    const auf = legal && !reaches ? goalUpToAuf(row.family, after, M) : null;
    const sameWord = mine === want;
    const myLen = legal ? tokenize(typed).length : 0;

    if (sameWord || (reaches && myLen <= row.count)) {
      grade(row, 2, sameWord ? "Exactly the algorithm on the card." :
        `It works, and at ${myLen} moves it is ${myLen === row.count ? "as short as" : "shorter than"} the card's ${row.count}.`, mine);
    } else if (reaches) {
      grade(row, 1, `It solves the case, but the card does it in ${row.count} moves and yours takes ${myLen}.`, mine);
    } else if (auf) {
      grade(row, 1, `Almost — that leaves it one ${auf} short of the goal.`, mine);
    } else {
      grade(row, 0, legal ? "That does not reach the goal." : "That is not notation I can read.", mine);
    }
  }

  function reveal(row) {
    answered = true;
    panel.cube.setState(row.state);
    mount(question,
      el("div", { class: "stack" },
        el("h3", {}, (row.teach && row.teach.name) || (row.names && row.names[0]) || `${row.familyLabel || row.family} case ${row.i + 1}`),
        el("div", { class: "alg alg--lg" }, row.text || "No algorithm — this case is already at the goal."),
        row.auf_text ? el("div", { class: "hint hint--fox" }, `Pre-AUF: ${row.auf_text}`) : null,
        el("div", { class: "row row--tight" },
          chip(`${row.count} moves`, "mint"),
          chip(row.source === "textbook" ? `familiar ${row.teach.name}` : "engine's own", "gold"),
          chip(row.via === "scan" ? "book scan" : row.via, "sky"),
          chip(row.desc.pattern, "muted")),
        row.alt
          ? el("p", { class: "tiny muted" }, `${row.alt.label}: `, el("code", {}, row.alt.text),
              ` (${row.alt.count} moves — open the full card and press W to run it)`)
          : null));
    playAnswer(row);
    if (mode === "flash") {
      mount(verdict,
        el("div", { class: "grade" },
          gradeBtn("Knew it", 2, "verdict--right"),
          gradeBtn("Hesitated", 1, "verdict--near"),
          gradeBtn("Missed", 0, "verdict--wrong")),
        el("p", { class: "tiny muted", style: { marginTop: "8px" } }, "Keys: 1 knew · 2 hesitated · 3 missed · n next"));
    }
  }

  function gradeBtn(label, g, cls) {
    return el("button", {
      class: `btn ${cls === "verdict--right" ? "btn--on" : ""}`, type: "button",
      onClick: () => grade(current, g, label),
    }, label);
  }

  async function playAnswer(row) {
    for (const id of row.tokens) {
      if (!document.body.contains(stage)) return;
      await panel.cube.turn(M.byId.get(id).name, Math.min(panel.cube.speed, 170));
    }
  }

  function grade(row, g, message, mine = null) {
    answered = true;
    session.total++;
    if (g === 2) session.right++;
    else if (g === 1) session.near++;
    else session.wrong++;
    const c = review(row.key, g);
    session.ms += Date.now() - askedAt;

    mount(verdict,
      el("div", { class: `verdict ${g === 2 ? "verdict--right" : g === 1 ? "verdict--near" : "verdict--wrong"}` },
        el("b", {}, message),
        mine ? el("div", { class: "mono small", style: { marginTop: "6px" } }, "yours: ", mine) : null,
        mine && mine !== normalise(row.text) ? el("div", { class: "mono small" }, "card:  ", row.text) : null,
        el("div", { class: "tiny muted", style: { marginTop: "8px" } },
          `Box ${c.box}/5 · next review ${c.due ? new Date(c.due).toLocaleString() : "now"}`)),
      el("div", { class: "row", style: { marginTop: "12px" } },
        el("button", { class: "btn btn--primary", type: "button", onClick: next }, "Next card (n)"),
        el("button", { class: "btn btn--sm", type: "button", onClick: () => playAnswer(row) }, "Play it again"),
        el("button", { class: "btn btn--sm", type: "button", onClick: () => openCaseSheet(row) }, "Open the full card")));

    if (mode === "flash") {
      mount(question,
        el("div", { class: "stack" },
          el("h3", {}, (row.teach && row.teach.name) || (row.names && row.names[0]) || `${row.familyLabel || row.family} case ${row.i + 1}`),
          el("div", { class: "alg alg--lg" }, row.text || "No algorithm — already at the goal."),
          el("div", { class: "row row--tight" }, chip(`${row.count} moves`), chip(row.desc.pattern, "muted"))));
    }
    drawStats();
  }

  function next() {
    index++;
    if (index >= queue.length) return finish();
    draw();
    const input = question.querySelector("input");
    if (input) input.focus();
  }

  function drawStats() {
    const s = stats(keys);
    mount(statsBar,
      statEl(String(session.right), "correct", `of ${session.total} asked`),
      statEl(String(session.near), "close", "worked, not the book's"),
      statEl(String(session.wrong), "missed", ""),
      statEl(s.accuracy === null ? "—" : `${Math.round(s.accuracy * 100)}%`, "all-time accuracy", `${s.seen} reviews`),
      statEl(String(s.mature), "mature cards", "box 3 or higher"),
      statEl(queue.length - index - 1 > 0 ? String(queue.length - index - 1) : "0", "left in queue", ""));
  }

  function finish() {
    const secs = (Date.now() - session.startedAt) / 1000;
    logSession({ total: session.total, right: session.right, near: session.near,
                 wrong: session.wrong, seconds: Math.round(secs), set: chosen, mode });
    mount(stage,
      el("div", { class: "panel", style: { gridColumn: "1 / -1" } },
        el("h2", {}, session.total ? "Queue done" : "Nothing to do"),
        el("p", {}, session.total
          ? `${session.right} correct, ${session.near} close, ${session.wrong} missed in ${Math.round(secs)} s.`
          : "Pick a set, or press “Due now” when the schedule has something for you."),
        el("div", { class: "row" },
          el("button", { class: "btn btn--primary", type: "button", onClick: () => { queue = schedule(keys).map((r) => r.key); index = 0; session = { total: 0, right: 0, near: 0, wrong: 0, startedAt: Date.now(), ms: 0 }; draw(); } }, "Run this set again"),
          el("a", { class: "btn", href: "#/levels" }, "Back to the levels"),
          el("button", { class: "btn btn--ghost", type: "button", onClick: () => download("qfox-progress.json", exportAll()) }, "Export progress"))));
  }

  function openCaseSheet(row) {
    openCase(row);
  }

  /* ------------------------------------------------------------- shortcuts */
  function onKey(e) {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "n") { e.preventDefault(); if (answered) next(); }
    else if (e.key === " ") {
      e.preventDefault();
      if (!answered && mode === "flash") reveal(current);
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      if (!answered && mode === "recognise") {
        const btns = [...question.querySelectorAll("button.btn")];
        const b = btns[Number(e.key) - 1];
        if (b) b.click();
      } else if (answered && mode === "flash") {
        const g = { 1: 2, 2: 1, 3: 0 }[e.key];
        if (g !== undefined) grade(current, g, ["", "Knew it", "Hesitated", "Missed"][Number(e.key)]);
      }
    }
  }
  document.addEventListener("keydown", onKey);

  const hintBtn = stage.querySelector("#t-hint");
  const replayBtn = stage.querySelector("#t-replay");
  const againBtn = stage.querySelector("#t-again");
  hintBtn.onclick = () => {
    if (!current) return;
    const first = (current.text || "").split(" ")[0] || "—";
    toast(`It starts with ${first} · ${current.count} moves · ${current.desc.pattern}`, "info", 4200);
  };
  replayBtn.onclick = () => { if (current) { panel.cube.setState(current.state); playAnswer(current); } };
  againBtn.onclick = () => { if (current) { panel.cube.setState(current.state); mount(diagram, topLayer(current.state, { size: 108 })); } };

  const head = el("div", { class: "section-head" },
    el("div", {},
      el("h1", {}, "Trainer"),
      el("p", { class: "panel__note" },
        "Asked in review order, graded by whether your algorithm actually reaches the goal, and remembered in this browser.")),
    el("span", { class: "spacer" }),
    el("div", { class: "row row--tight" }, setSelect, modeTabs, shuffleBtn, dueOnly));

  mount(view, head, stage);
  draw();

  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      document.removeEventListener("keydown", onKey);
      panel.cube.stop();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return { node: view };
}

function statEl(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
