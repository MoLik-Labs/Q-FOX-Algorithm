/**
 * Levels: the four tiers from "never solved one" to "fewest moves possible",
 * each with the method behind it, the study sets it asks for, and your progress.
 */
import { data, levelKeys, caseByKey, METRIC_HINT } from "../data.js";
import { el, mount, chip, num, int, progressBar, emptyState } from "../util.js";
import { caseCard, openCase } from "../parts.js";
import { learnedCount, isLearned } from "../store.js";

export function render(params = {}) {
  const key = params.key || null;
  if (key) return detail(key);
  return overview();
}

/* --------------------------------------------------------------- overview */

function overview() {
  const view = el("div");
  const cards = el("div", { class: "stack" });

  for (const lv of data.levelsList) {
    const keys = levelKeys(lv.key);
    const done = learnedCount(keys);
    const rows = keys.map(caseByKey).filter(Boolean);
    const toLearn = rows.filter((r) => r.moves.length).length;

    cards.append(el("article", { class: "panel level-card" },
      el("span", { class: "level-card__n" }, String(lv.title.split(" ")[1] || "")),
      el("div", { class: "panel__head" },
        el("h2", {}, lv.title),
        el("span", { class: "spacer" }),
        chip(lv.algs + " engine algorithms", "fox"),
        chip(`${toLearn} to memorise`, "gold"),
        lv.benchmark ? chip(`${num(lv.benchmark.htm, 1)} htm · ${num(lv.benchmark.seconds, 2)} s`, "mint") : null),
      el("div", { class: "split" },
        el("div", {},
          el("p", {}, el("b", {}, "Who it is for: "), lv.who),
          el("p", {}, el("b", {}, "What you get: "), lv.promise),
          el("p", { class: "small muted" }, lv.method),
          el("div", { class: "row row--tight" },
            el("span", { class: "tiny muted" }, "Path:"),
            el("code", { class: "tiny" }, lv.path)),
          el("div", { style: { marginTop: "12px" } }, progressBar(done, keys.length, `${done}/${keys.length} learned`)),
          el("div", { class: "row", style: { marginTop: "14px" } },
            el("a", { class: "btn btn--primary btn--sm", href: `#/levels/${lv.key}` }, "Open this level"),
            el("a", { class: "btn btn--sm", href: `#/trainer?level=${lv.key}` }, `Drill ${toLearn} cards`))),
        el("div", {},
          el("h3", {}, "Study sets"),
          el("div", { class: "stack" }, (lv.curriculum || []).map((item) =>
            el("div", { class: "set-item" },
              el("div", { class: "set-item__head" },
                el("span", { class: "set-item__title" }, item.title),
                el("span", { class: "spacer" }),
                chip(item.family, "fox"),
                chip(`${item.to_learn} algorithms`),
                chip(`${num(item.mean_moves, 1)} moves mean`, "mint")),
              el("p", { class: "tiny muted", style: { marginTop: "6px" } }, item.why))))),
      )));
  }

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Four levels"),
        el("p", { class: "panel__note" },
          "Same cube, four different amounts of memorisation. Start where you are, ",
          "move up when the level below it feels slow.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${int(data.cases.length)} cases in the export`, "sky"),
        chip(`${int(data.levelsList.reduce((n, l) => n + l.distinct_algorithms, 0))} algorithms across the four levels`, "gold"))),
    cards,
    compare());

  return { node: view };
}

/** The level-to-level comparison that answers "is the next level worth it?". */
function compare() {
  const rows = data.levelsList.map((lv) => {
    const keys = levelKeys(lv.key);
    const rowsForLevel = keys.map(caseByKey).filter(Boolean).filter((r) => r.tokens.length);
    const mean = rowsForLevel.length
      ? rowsForLevel.reduce((s, r) => s + r.count, 0) / rowsForLevel.length : 0;
    return { lv, count: rowsForLevel.length, mean, distinct: lv.distinct_algorithms };
  });
  return el("section", { class: "panel", style: { marginTop: "20px" } },
    el("div", { class: "panel__head" }, el("h3", {}, "What each level costs, and what it returns")),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Level"),
          el("th", { class: "num" }, "Distinct algorithms"),
          el("th", { class: "num", title: METRIC_HINT }, "Mean moves per case"),
          el("th", { class: "num" }, "Solve length (benchmark)"),
          el("th", { class: "num" }, "Solve time"),
          el("th", {}, "Method"))),
        el("tbody", {}, rows.map(({ lv, distinct, mean }) => el("tr", {},
          el("td", { class: "name" },
            el("a", { href: `#/levels/${lv.key}` }, lv.title)),
          el("td", { class: "num" }, String(distinct)),
          el("td", { class: "num" }, num(mean, 2)),
          el("td", { class: "num" }, lv.benchmark ? num(lv.benchmark.htm, 2) : "—"),
          el("td", { class: "num" }, lv.benchmark ? `${num(lv.benchmark.seconds, 2)} s` : "—"),
          el("td", {}, el("code", { class: "tiny" }, lv.path))))))),
    el("p", { class: "tiny muted", style: { marginTop: "10px" } },
      "Solve length and time come from ", el("code", {}, "scripts/bench.py"),
      " over the same ", String((data.benchmark.meta || {}).scrambles || 0),
      " WCA-style scrambles for every method, with every solution replayed and verified."));
}

/* ----------------------------------------------------------------- detail */

function detail(key) {
  const lv = data.levelsList.find((l) => l.key === key);
  const view = el("div");
  if (!lv) {
    mount(view, emptyState("No such level", "Pick one from the Levels page."));
    return { node: view };
  }
  const keys = levelKeys(key);
  const rows = keys.map(caseByKey).filter(Boolean);

  const sets = el("div", { class: "stack" });
  for (const item of lv.curriculum || []) {
    const itemRows = item.cases.map((c) => caseByKey(c.key)).filter(Boolean);
    const learned = itemRows.filter((r) => isLearned(r.key)).length;
    const body = el("div", { class: "grid grid--cases" },
      itemRows.map((r) => caseCard(r, { onOpen: openCase })));

    sets.append(el("section", { class: "panel" },
      el("div", { class: "panel__head" },
        el("h3", {}, item.title),
        el("span", { class: "spacer" }),
        chip(item.family, "fox"),
        chip(`${item.to_learn} to learn`),
        chip(`${num(item.mean_moves, 2)} moves mean`, "mint"),
        el("a", { class: "btn btn--sm", href: `#/trainer?level=${key}&set=${item.id}` }, "Drill this set")),
      el("p", { class: "small muted" }, item.why),
      el("p", { class: "tiny muted" },
        "Goal: ", el("code", {}, item.goal), " · ",
        String(item.selected), " cases in this set, ", String(learned), " marked learned"),
      progressBar(learned, itemRows.length, `${learned}/${itemRows.length} learned`),
      body));
  }

  const stages = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "How the engine solves it"),
      el("span", { class: "spacer" }),
      el("code", { class: "tiny" }, lv.path)),
    el("p", { class: "small muted" }, lv.method),
    el("div", { class: "timeline" }, (lv.stages || []).map((s, i) =>
      el("div", { class: "step" },
        el("div", { class: "step__n" }, String(i + 1)),
        el("div", {},
          el("div", { class: "step__t" }, el("code", {}, s.name),
            s.algs ? chip(`${s.algs} algorithms`, "fox") : chip("searched", "sky"),
            s.intuitive ? chip("intuitive", "mint") : null),
          el("div", { class: "step__d" }, s.note))))),
    lv.benchmark ? el("div", { class: "stats", style: { marginTop: "14px" } },
      stat(num(lv.benchmark.htm, 2), "mean htm", `over ${lv.benchmark.scrambles} scrambles`),
      stat(num(lv.benchmark.qtm, 2), "mean qtm", "quarter-turn metric"),
      stat(`${num(lv.benchmark.seconds, 2)} s`, "mean solve time", "engine, warm tables"),
      stat(`${lv.benchmark.solved}/${lv.benchmark.scrambles}`, "solved", "replayed and verified")) : null);

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("a", { class: "tiny muted", href: "#/levels" }, "← all levels"),
        el("h1", {}, lv.title),
        el("p", { class: "panel__note" }, lv.promise)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(lv.who, "sky"),
        chip(`${rows.length} cards in this level`, "gold"),
        el("a", { class: "btn btn--sm btn--primary", href: `#/trainer?level=${key}` }, "Start drilling"))),
    stages,
    el("div", { class: "section-head" }, el("h2", {}, "The algorithms")),
    sets);

  return { node: view };
}

function stat(value, key, sub = "") {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, key),
    el("div", { class: "stat__v" }, value),
    sub ? el("div", { class: "stat__s" }, sub) : null);
}
