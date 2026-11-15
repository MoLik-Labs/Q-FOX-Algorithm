/**
 * Shared UI parts: the cube panel with its transport, the case card, and the
 * case detail sheet.  Every screen that shows a cube or an algorithm goes
 * through here, so behaviour is identical wherever you meet it.
 */
import { data, METRIC_HINT } from "./data.js";
import { CubeView } from "./cube-view.js";
import { topLayer, netDiagram } from "./diagram.js";
import { el, mount, moveChips, chip, toast, copyText, sheet, progressBar, num } from "./util.js";
import { settings, setSetting, isLearned, toggleLearned, card as srsCard } from "./store.js";

/* ------------------------------------------------------------------ cube UI */

/**
 * A cube with the controls a learner actually uses.
 *
 * @param {object} opts { state, size, view, highlight, transport, title, scramble }
 * @returns {{ node: HTMLElement, cube: CubeView }}
 */
export function cubePanel(opts = {}) {
  const st = settings();
  const size = opts.size || 250;
  const host = el("div", { class: "cube-host" });
  const cube = new CubeView(host, {
    model: data.model,
    state: opts.state || data.model.solved,
    size,
    view: opts.view || st.view,
    highlight: opts.highlight === undefined ? "ll" : opts.highlight,
    interactive: opts.interactive !== false,
    speed: opts.speed === undefined ? st.speed : opts.speed,
    yaw: st.yaw,
    pitch: st.pitch,
  });
  cube.onViewChange = (yaw, pitch) => {
    setSetting("yaw", Math.round(yaw));
    setSetting("pitch", Math.round(pitch));
  };

  const wrap = el("div", { class: "stack", style: { alignItems: "center" } }, host);
  const tools = el("div", { class: "cube-tools" });
  wrap.append(tools);

  /** Add a tool button; returns it so callers can re-label or disable it. */
  function add(label, fn, title = label, cls = "btn btn--sm") {
    const b = el("button", { class: cls, type: "button", title, onClick: fn }, label);
    tools.append(b);
    return b;
  }

  if (opts.viewToggle !== false) {
    const btn = add(cube.view === "net" ? "3D view" : "Flat net", () => {
      const next = cube.view === "net" ? "3d" : "net";
      cube.setView(next);
      setSetting("view", next);
      btn.textContent = next === "net" ? "3D view" : "Flat net";
    }, "Switch between the 3-D cube and the flat net");
  }
  if (opts.reset !== false) {
    add("Reset", () => { cube.reset(); if (opts.onReset) opts.onReset(); },
        "Back to the solved cube");
  }
  if (opts.restore) add("Case", opts.restore, "Back to the case position");
  if (opts.scramble) add("Scramble", opts.scramble, "Apply a random scramble");

  return { node: wrap, cube, tools, add };
}

/* --------------------------------------------------------------- case card */

/**
 * One algorithm card: the top-layer diagram you recognise, the name if the
 * engine matched a textbook one, and the algorithm itself.
 */
export function caseCard(row, opts = {}) {
  const learned = isLearned(row.key);
  const name = (row.names && row.names[0]) || null;
  const card = el("div", {
    class: `card ${learned ? "is-learned" : ""}`,
    role: "button", tabindex: "0", dataset: { key: row.key },
    attrs: { "aria-label": `${row.familyLabel || row.family} case ${name || row.desc.pattern}` },
    onClick: () => opts.onOpen ? opts.onOpen(row) : openCase(row),
    onKeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
    },
  },
    el("div", { class: "card__top" },
      topLayer(row.state, { size: opts.diagram || 96 }),
      el("div", { class: "card__body" },
        el("div", { class: "card__name" }, name || row.desc.pattern.split(" / ")[0]),
        el("div", { class: "card__sub" }, name ? row.desc.pattern : row.desc.permutation),
        el("div", { class: "card__alg", title: row.alt
              ? `${row.primary.label} at ${row.primary.count} moves. The other verified word is ${row.alt.label.toLowerCase()} at ${row.alt.count} — press W in the case view to run it.`
              : "The engine's own shortest verified word for this case." },
          row.text || "already there — no algorithm"),
        el("div", { class: "card__foot" },
          chip(row.familyLabel || row.family, "fox"),
          chip(`${row.count} moves`, row.count <= 8 ? "mint" : row.count <= 11 ? "" : "gold"),
          row.source === "textbook" ? chip("familiar", "gold") : null,
          row.auf ? chip(`AUF ${row.auf_text}`, "sky") : null,
          opts.extraChip ? opts.extraChip(row) : null)),
    ));
  return card;
}

/* -------------------------------------------------------------- case sheet */

/**
 * The full case view: cube, transport, metrics, and what to do with it.
 */
export function openCase(row, ctx = {}) {
  const M = data.model;

  // Two words may exist for one case: the familiar algorithm people learn, and
  // the engine's own shortest.  Both are verified against the goal by the
  // generator, so the choice is about what you want to memorise, not about
  // which one is right.
  const words = (row.words && row.words.length ? row.words : [{
    key: "engine", text: row.algorithm || "", moves: row.moves || [],
    count: row.stm || 0, label: "Engine's shortest verified word",
  }]).map((x, i) => ({ ...x, key: x.kind || `w${i}` }));
  let w = 0;
  let word = words[0];
  let moves = word.moves;
  // every position from the case to the goal, so scrubbing is instant
  let states = [row.state];
  for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));

  let k = 0;
  const panel = cubePanel({
    state: row.state, size: 288, highlight: "ll",
    viewToggle: true, reset: false,
  });
  const cube = panel.cube;

  const chipsHost = el("div", { class: "row" });
  let chips = el("div");

  function drawChips() {
    chips = moveChips(word.text, (i) => { goto(i + 1); },
                      { title: "Jump to after move" });
    mount(chipsHost, chips);
    paintChips();
  }

  const playBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "▶ Play");
  const backBtn = el("button", { class: "btn btn--sm", type: "button", title: "One move back (←)" }, "⟲ Back");
  const stepBtn = el("button", { class: "btn btn--sm", type: "button", title: "One move (→)" }, "Step ⟳");
  const caseBtn = el("button", { class: "btn btn--sm", type: "button", title: "Back to the case position" }, "Case");
  const solvedBtn = el("button", { class: "btn btn--sm", type: "button", title: "Show the goal position" }, "Goal");
  const setupBtn = el("button", { class: "btn btn--sm", type: "button", title: "Set this case up from a solved cube (applies the inverse)" }, "Set up from solved");
  const speed = el("input", { type: "range", min: "40", max: "600", step: "20", value: String(cube.speed),
                              attrs: { "aria-label": "Turn speed" },
                              onInput: (e) => { cube.speed = Number(e.target.value); setSetting("speed", cube.speed); speedOut.textContent = `${cube.speed} ms`; } });
  const speedOut = el("span", {}, `${cube.speed} ms`);

  const transport = el("div", { class: "cube-tools" },
    playBtn, backBtn, stepBtn, caseBtn, solvedBtn,
    el("span", { class: "speed" }, "slow", speed, "fast", speedOut));

  function paintChips() {
    [...chips.children].forEach((node, i) => {
      node.classList.toggle("is-done", i < k);
      node.classList.toggle("is-now", i === k - 1);
    });
  }

  function goto(i, animate = false) {
    i = Math.max(0, Math.min(moves.length, i));
    if (animate && i === k + 1) {
      cube.turn(M.byId.get(moves[k]).name).then(() => { k = i; afterMove(); });
      return;
    }
    k = i;
    cube.setState(states[k]);
    afterMove();
  }

  function afterMove() {
    paintChips();
    posOut.textContent = `${k} / ${moves.length}`;
    solvedChip.style.display = M.isSolved(cube.getState()) ? "" : "none";
    if (ctx.onStep) ctx.onStep(k, moves.length);
  }

  const posOut = el("span", { class: "badge" }, `0 / ${moves.length}`);
  const solvedChip = chip("solved", "mint");
  solvedChip.style.display = "none";

  async function play() {
    if (cube.isPlaying) { cube.stop(); playBtn.textContent = "▶ Play"; return; }
    if (k >= moves.length) goto(0);
    playBtn.textContent = "❚❚ Pause";
    for (let i = k; i < moves.length; i++) {
      if (!cube.isPlaying && playBtn.textContent !== "❚❚ Pause") break;
      k = i;
      await cube.turn(M.byId.get(moves[i]).name);
      k = i + 1;
      afterMove();
      if (playBtn.textContent !== "❚❚ Pause") break;
    }
    playBtn.textContent = "▶ Play";
    afterMove();
  }

  playBtn.onclick = play;
  backBtn.onclick = () => goto(k - 1);
  stepBtn.onclick = () => goto(k + 1, true);
  caseBtn.onclick = () => goto(0);
  solvedBtn.onclick = () => goto(moves.length);
  setupBtn.onclick = () => {
    const inv = M.invert(moves);
    cube.setState(M.solved);
    k = 0;
    afterMove();
    toast("Solved cube → apply the inverse, then run the algorithm yourself", "info");
    setTimeout(async () => {
      for (const name of inv) await cube.turn(name, Math.min(cube.speed, 130));
      k = 0;
      afterMove();
    }, 260);
  };

  const learnedBtn = el("button", {
    class: `btn ${isLearned(row.key) ? "btn--on" : ""}`, type: "button",
  }, isLearned(row.key) ? "✓ Learned" : "Mark as learned");
  learnedBtn.onclick = () => {
    const on = toggleLearned(row.key);
    learnedBtn.classList.toggle("btn--on", on);
    learnedBtn.textContent = on ? "✓ Learned" : "Mark as learned";
    document.dispatchEvent(new CustomEvent("qfox:progress", { detail: { key: row.key, on } }));
  };

  const copyBtn = el("button", { class: "btn", type: "button" }, "Copy");
  copyBtn.onclick = async () => {
    const ok = await copyText(word.text || "");
    toast(ok ? `Copied: ${word.text}` : "Copy failed — select the text instead", ok ? "ok" : "err");
  };

  const algOut = el("div", { class: `alg alg--lg ${word.text ? "" : "alg--empty"}` },
    word.text || "No algorithm: this case is already at the goal.");

  const wordTabs = words.length > 1
    ? el("div", { class: "pill-tabs" }, ...words.map((wd, i) => el("button", {
        class: `pill-tab ${i === w ? "is-on" : ""}`, type: "button",
        title: `${wd.text} — ${wd.count} moves`,
        onClick: () => {
          w = i; word = words[i]; moves = word.moves;
          states = [row.state];
          for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));
          k = 0;
          cube.stop();
          playBtn.textContent = "▶ Play";
          cube.setState(states[0]);
          drawChips();
          mount(algOut, document.createTextNode(word.text));
          [...wordTabs.children].forEach((b, j) => b.classList.toggle("is-on", j === i));
          countOut.textContent = String(word.count);
          afterMove();
        },
      }, wd.label)))
    : null;

  const sets = data.levelsList.flatMap((lv) => (lv.curriculum || [])
    .filter((it) => it.cases.some((c) => c.key === row.key))
    .map((it) => chip(`${lv.title.split(" - ")[0]} · ${it.title.replace(/^Step \d+ - /, "")}`, "sky")));

  const srs = srsCard(row.key);

  const countOut = el("div", { class: "metric__v" }, String(word.count));

  const body = el("div", { class: "detail" },
    el("div", { class: "detail__cube" },
      panel.node,
      transport,
      el("div", { class: "row row--tight", style: { justifyContent: "center" } }, posOut, solvedChip),
      el("p", { class: "tiny muted", style: { textAlign: "center" } },
        "Drag the cube to turn your view. The flat net and the 3-D cube are the same state.")),
    el("div", { class: "detail__steps" },
      el("div", { class: "row row--tight" },
        chip(row.familyLabel || row.family, "fox"),
        ...(row.names || []).map((n) => chip(n, "gold")),
        chip(`element ${row.element}`, "muted"),
        chip(`orbit ${row.orbit}`, "muted")),
      wordTabs,
      algOut,
      row.auf_text ? el("div", { class: "hint hint--fox" },
        `Turn the top face first: ${row.auf_text} — then the algorithm below finishes the case.`) : null,
      chipsHost,
      el("div", { class: "metrics" },
        el("div", { class: "metric", title: METRIC_HINT },
          el("div", { class: "metric__k" }, "moves"), countOut),
        metric("htm", row.htm), metric("qtm", row.qtm),
        metric("stm", row.stm), metric("etm", row.etm),
        metric("found by", row.via === "scan" ? "book scan" : row.via),
        metric("optimal ≤", row.optimal_within)),
      row.alt ? el("div", { class: "hint" },
        row.source === "textbook"
          ? [`This is the familiar ${word.name} at ${word.count} moves. The engine's own shortest for this case is `,
             el("code", {}, row.alt.text), ` at ${row.alt.count} moves.`]
          : [`This is the engine's own shortest at ${word.count} moves. The familiar ${row.alt.name} is `,
             el("code", {}, row.alt.text), ` at ${row.alt.count} moves.`],
        " Both are replayed against the goal by the engine — press ",
        el("kbd", {}, "W"), " to switch and watch the other one run.") : null,
      el("dl", { class: "kv" },
        el("dt", {}, "Goal"), el("dd", {}, data.algorithms.families[row.family].goal),
        el("dt", {}, "Edges"), el("dd", {}, row.desc.edges),
        el("dt", {}, "Corners"), el("dd", {}, row.desc.corners),
        el("dt", {}, "Permutation"), el("dd", {}, row.desc.permutation),
        el("dt", {}, "Verified"),
        el("dd", {}, row.verified
          ? "replayed against the goal by the engine"
          : "NOT verified — do not trust this card"),
        el("dt", {}, "Review box"),
        el("dd", { class: "row row--tight" }, boxDots(srs.box),
            el("span", { class: "tiny muted" }, srs.seen
              ? `${srs.seen} reviews, ${Math.round((100 * (srs.right || 0)) / Math.max(1, srs.seen))}% correct`
              : "not drilled yet"))),
      sets.length ? el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted" }, "Appears in:"), ...sets) : null,
      el("div", { class: "row" }, learnedBtn, copyBtn, setupBtn,
        el("a", { class: "btn", href: `#/trainer?family=${encodeURIComponent(row.family)}&key=${encodeURIComponent(row.key)}` }, "Drill this case"))));

  const famName = row.familyLabel || row.family;
  const title = (row.teach && row.teach.name)
    ? `${row.teach.name} — ${famName}`
    : (row.names && row.names[0])
      ? `${row.names[0]} — ${famName}`
      : `${famName} case ${row.i + 1}`;
  const s = sheet(title, body, {
    wide: true,
    subtitle: `${row.desc.pattern} · ${word.count} moves · ${row.desc.permutation}`,
  });

  drawChips();
  afterMove();

  const onKey = (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepBtn.click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); backBtn.click(); }
    else if (e.key === " ") { e.preventDefault(); playBtn.click(); }
    else if (e.key.toLowerCase() === "c") caseBtn.click();
    else if (e.key.toLowerCase() === "l") learnedBtn.click();
    else if (e.key.toLowerCase() === "w" && wordTabs) {
      wordTabs.children[(w + 1) % words.length].click();
    }
  };
  document.addEventListener("keydown", onKey);
  s.root.addEventListener("remove", () => document.removeEventListener("keydown", onKey));
  const obs = new MutationObserver(() => {
    if (!document.body.contains(s.root)) {
      document.removeEventListener("keydown", onKey);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  return s;
}

function metric(k, v) {
  return el("div", { class: "metric" },
    el("div", { class: "metric__k" }, k),
    el("div", { class: "metric__v" }, String(v)));
}

export function boxDots(box) {
  const wrap = el("span", { class: "box-dots", title: `Review box ${box} of 5` });
  for (let i = 0; i <= 5; i++) {
    wrap.append(el("span", { class: `box-dot ${i <= box ? "is-on" : ""}` }));
  }
  return wrap;
}

/* -------------------------------------------------------------- case grids */

export function caseGrid(rows, opts = {}) {
  const grid = el("div", { class: "grid grid--cases" });
  for (const row of rows) grid.append(caseCard(row, opts));
  return grid;
}

export function learnedSummary(rows) {
  const done = rows.filter((r) => isLearned(r.key)).length;
  return el("div", { class: "row" },
    progressBar(done, rows.length, `${done}/${rows.length} learned`));
}

export { netDiagram, num };
