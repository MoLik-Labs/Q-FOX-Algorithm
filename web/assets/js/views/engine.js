/**
 * Notation and engine: the 54 moves this project counts with, a playground
 * cube you can drive by hand, and the numbers behind the last-layer book.
 */
import { data, totals } from "../data.js";
import { el, mount, chip, num, int, toast, copyText } from "../util.js";
import { cubePanel } from "../parts.js";
import { scramble as makeScramble, tokenize, FACE_COLOUR } from "../model.js";
import { netDiagram } from "../diagram.js";
import { download } from "../util.js";

const METRICS = ["htm", "qtm", "stm", "etm"];
// Straight from the engine's own per-move cost table, not a guess:
//   outer quarter/half   1  1|2  1  1
//   wide, slice, rotation 2  2|4  1  1|2
const METRIC_NOTE = {
  htm: "outer turns cost 1 whether quarter or half; a wide, slice or rotation turn costs 2",
  qtm: "quarter turns cost 1 and half turns 2; wide, slice and rotation turns cost double that",
  stm: "every turn counts 1 — a slice turn is one move, which is how speedcubing notation counts, so this is the number the case cards quote",
  etm: "like stm for outer and wide turns; a slice turn counts 2 because two layers move",
};

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;
  const t = totals();

  /* ------------------------------------------------------------- playground */
  const panel = cubePanel({ size: 300, highlight: "none", reset: true });
  const cube = panel.cube;
  const history = [];
  const seqOut = el("div", { class: "alg alg--lg", style: { minHeight: "48px" } }, "—");
  const costOut = el("div", { class: "metrics" });

  function refresh() {
    const text = history.join(" ");
    mount(seqOut, text ? document.createTextNode(text) : document.createTextNode("—"));
    const ids = history.map((n) => M.byName.get(n).id);
    mount(costOut, METRICS.map((m, i) => el("div", { class: "metric", title: METRIC_NOTE[m] },
      el("div", { class: "metric__k" }, m),
      el("div", { class: "metric__v" }, String(cost(i, ids))))));
  }

  /** The engine's own move costs, summed — no re-implementation. */
  function cost(metric, ids) {
    return ids.reduce((s, id) => s + M.byId.get(id).cost[metric], 0);
  }

  async function run(text) {
    let tokens;
    try { tokens = tokenize(text); }
    catch (err) { toast(err.message, "err"); return; }
    for (const tok of tokens) {
      if (!M.byName.has(tok)) { toast(`"${tok}" is not one of the engine's 54 moves`, "err"); return; }
    }
    for (const tok of tokens) {
      await cube.turn(tok, Math.min(cube.speed, 160));
      history.push(tok);
    }
    refresh();
  }

  const input = el("input", {
    class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: "Type a sequence and press Apply — R U R' U', M2, y2, r U r'…",
    attrs: { "aria-label": "Move sequence" },
    onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); run(input.value); input.value = ""; } },
  });

  const pad = el("div", { class: "row row--tight" },
    ...["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2",
        "L", "L'", "L2", "B", "B'", "B2", "M", "M'", "E", "S", "r", "l", "u", "d",
        "x", "y", "z"].map((name) => el("button", {
      class: "move", type: "button", title: `Apply ${name}`,
      onClick: async () => { await cube.turn(name, Math.min(cube.speed, 160)); history.push(name); refresh(); },
    }, name)));

  const playground = el("div", { class: "split" },
    el("div", { class: "panel stack" },
      el("div", { class: "panel__head" }, el("h3", {}, "Playground"),
        el("span", { class: "spacer" }),
        chip(data.check.ok ? "model == engine" : "model mismatch", data.check.ok ? "mint" : "rose")),
      el("div", { style: { display: "grid", placeItems: "center" } }, panel.node),
      input,
      el("div", { class: "row" },
        el("button", { class: "btn btn--primary", type: "button", onClick: () => { run(input.value); input.value = ""; } }, "Apply"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          const one = history.pop();
          if (one) { await cube.turn(M.invert([one])[0], Math.min(cube.speed, 160)); refresh(); }
        } }, "Undo"),
        el("button", { class: "btn", type: "button", onClick: () => { history.length = 0; cube.reset(); refresh(); } }, "Clear"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          const s = makeScramble(25, Math.random, null);
          history.length = 0; cube.reset();
          await run(s.join(" "));
        } }, "Scramble"),
        el("button", { class: "btn btn--ghost", type: "button", onClick: async () => {
          const ok = await copyText(history.join(" "));
          toast(ok ? "Sequence copied" : "Nothing to copy", ok ? "ok" : "warn");
        } }, "Copy")),
      el("div", {}, el("div", { class: "tiny muted", style: { marginBottom: "4px" } }, "This session"), seqOut),
      costOut,
      el("div", { class: "hint" },
        "Every turn above is applied with the engine's own facelet permutation, and the cost row is the engine's own per-move cost table. Drag the cube to look at it from another side; “Flat net” shows the same state unfolded.")),
    el("div", { class: "stack" },
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Face order and colours")),
        el("p", { class: "small muted" },
          "The engine numbers faces U R F D L B and facelets 0-53 in that order. ",
          "Every state on this site is those 54 letters."),
        netDiagram(M.solved, { cell: 20 }),
        el("div", { class: "row row--tight", style: { marginTop: "10px" } },
          ..."URFDLB".split("").map((f) => el("span", { class: "chip" },
            el("span", { style: { width: "10px", height: "10px", borderRadius: "3px",
                                  background: FACE_COLOUR[f], display: "inline-block" } }), f)))),
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "The last-layer book")),
        el("div", { class: "stats" },
          stat(int(t.elements), "elements", "corner perm × corner twist × edge perm × edge flip, parity matched"),
          stat(int(data.book.found), "reached", `${num(t.coverage, 2)}% of the space`),
          stat(String(t.swept), "swept depth", "complete enumeration from solved"),
          stat(String(t.exactTo), "exact out to", "two halves of the ball, meet in the middle")),
        el("p", { class: "small", style: { marginTop: "10px" } }, data.book.note),
        el("div", { class: "stack", style: { gap: "4px", marginTop: "10px" } },
          ...Object.entries(data.book.histogram).map(([len, n]) => {
            const max = Math.max(...Object.values(data.book.histogram));
            return el("div", { class: "bar-row" },
              el("span", { class: "bar-row__label" }, `${len} moves`),
              el("div", { class: "bar-track" },
                el("div", { class: "bar-fill bar-fill--mint", style: { width: `${(n / max) * 100}%` } })),
              el("span", { class: "bar-row__val" }, int(n)));
          })))));

  /* ------------------------------------------------------------ move table */
  const moveTable = el("div", { class: "table-wrap" },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", { class: "num" }, "id"), el("th", {}, "Move"), el("th", {}, "Family"),
        el("th", {}, "Axis"), el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "qtm"),
        el("th", { class: "num" }, "stm"), el("th", { class: "num" }, "etm"), el("th", {}, "Try it"))),
      el("tbody", {}, data.engine.moves.map((m) => el("tr", {},
        el("td", { class: "num muted" }, String(m.id)),
        el("td", { class: "name" }, el("code", {}, m.name)),
        el("td", {}, m.family),
        el("td", {}, ["U/D", "R/L", "F/B"][m.axis] || String(m.axis)),
        ...m.cost.map((c) => el("td", { class: "num" }, String(c))),
        el("td", {}, el("button", {
          class: "btn btn--sm", type: "button",
          onClick: async () => {
            playground.scrollIntoView({ behavior: "smooth", block: "center" });
            await run(m.name);
          },
        }, "Apply")))))));

  const masks = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Move masks")),
    el("p", { class: "small muted" },
      "A stage says which moves it may use. The engine keeps one 54-bit mask per stage; ",
      "Roux's last six edges, for example, only ever needs the M slice and the U face."),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {}, el("th", {}, "Mask"), el("th", {}, "Bits"), el("th", {}, "What it allows"))),
        el("tbody", {},
          maskRow("outer", data.engine.masks.outer, "the 18 outer-face turns — what almost every stage uses"),
          maskRow("mu", data.engine.masks.mu, "<M, U>: the Roux LSE move set, six edges and the centres"),
          maskRow("ulr", data.engine.masks.ulr, "<U, R, L>: ZZ's last layer and LBL's middle layer, no F/B/D")))));

  const abi = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "What the browser checked")),
    el("p", { class: "small muted" },
      "This page draws its own cube. Before it draws anything it re-derives all 54 facelet ",
      "permutations from the cell and direction geometry and compares them with the engine's, ",
      "so a wrong picture is impossible to ship silently."),
    el("div", { class: "hint " + (data.check.ok ? "hint--mint" : "") },
      data.check.ok
        ? `All ${data.check.checked} engine permutations reproduced exactly by the browser model.`
        : `${data.check.mismatches.length} of ${data.check.checked} moves disagree — do not trust the cube on this page.`),
    el("p", { class: "tiny muted", style: { marginTop: "10px" } },
      "The same check runs in node: ", el("code", {}, "node web/test/model.test.mjs"),
      ", and on the engine side ", el("code", {}, "python3 scripts/validate_web_data.py"), "."));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Notation & engine"),
        el("p", { class: "panel__note" },
          `${t.moves} moves, four ways of counting them, and the book that makes the last layer a lookup.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(data.engine.engine || "engine", "fox"),
        el("button", { class: "btn btn--sm", type: "button",
                       onClick: () => download("qfox-engine.json", JSON.stringify(data.engine, null, 1)) },
                     "Download engine.json"))),
    playground,
    el("div", { class: "section-head" }, el("h2", {}, "All 54 moves"),
      el("span", { class: "panel__note" }, "id = family × 3 + power, the engine's internal numbering")),
    moveTable,
    el("div", { class: "section-head" }, el("h2", {}, "Counting and masks")),
    el("div", { class: "grid grid--2" }, masks, abi));

  refresh();
  return { node: view, destroy: () => cube.stop() };
}

function maskRow(name, bits, note) {
  return el("tr", {},
    el("td", { class: "name" }, el("code", {}, name)),
    el("td", { class: "num mono tiny" }, `0x${Number(bits).toString(16)}`),
    el("td", { class: "small" }, note));
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
