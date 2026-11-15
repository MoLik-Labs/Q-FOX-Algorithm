/**
 * Methods: the thirteen ways this engine can solve a cube, stage by stage.
 *
 * Nothing here is hand-written prose about how to cube — every row is the
 * stage list the method actually runs, with the goal, the move mask and the
 * heuristics the search was given, exported from `qfox/methods`.
 */
import { data, bench } from "../data.js";
import { el, mount, chip, num, int, duration } from "../util.js";

export function render(params = {}) {
  const view = el("div");
  const name = params.name || null;

  const rows = data.methodsList.slice().sort((a, b) => {
    const ba = bench(a.name), bb = bench(b.name);
    if (!ba || !bb) return 0;
    return ba.htm.mean - bb.htm.mean;
  });

  if (name) return detail(name);

  /* -------------------------------------------------------------- overview */
  const cards = el("div", { class: "grid grid--2" });
  for (const m of rows) {
    const b = bench(m.name);
    cards.append(el("a", { class: "card card--plain", href: `#/methods/${encodeURIComponent(m.name)}` },
      el("div", { class: "card__body" },
        el("div", { class: "row row--tight" },
          el("span", { class: "card__name", style: { fontSize: "1.06rem" } }, m.name),
          el("span", { class: "spacer" }),
          b ? chip(`${num(b.htm.mean, 1)} htm`, "mint") : null,
          b ? chip(`${num(b.seconds.mean, 2)} s`, "sky") : null,
          chip(`${m.stages.length} stages`)),
        el("div", { class: "card__sub" }, m.family),
        el("p", { class: "small" }, m.description),
        el("code", { class: "tiny muted" }, m.path),
        el("div", { class: "card__foot" },
          ...Object.entries(m.algs_by_tier || {}).map(([tier, n]) =>
            chip(`${tier}: ${n} algs`, tier === "easy" ? "mint" : tier === "full" ? "fox" : ""))),
        el("span", { class: "tiny muted" }, "Open for the stage-by-stage breakdown →"))));
  }

  const compare = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Side by side"),
      el("span", { class: "spacer" }),
      el("span", { class: "tiny muted" },
        `${(data.benchmark.meta || {}).scrambles || 0} scrambles each, every solution replayed`)),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Method"), el("th", { class: "num" }, "Stages"),
          el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "qtm"),
          el("th", { class: "num" }, "Seconds"), el("th", {}, "Solved"))),
        el("tbody", {}, rows.map((m) => {
          const b = bench(m.name);
          return el("tr", {},
            el("td", { class: "name" },
              el("a", { href: `#/methods/${encodeURIComponent(m.name)}` }, m.name)),
            el("td", { class: "num" }, String(m.stages.length)),
            el("td", { class: "num" }, b ? num(b.htm.mean, 2) : "—"),
            el("td", { class: "num" }, b ? num(b.qtm.mean, 2) : "—"),
            el("td", { class: "num" }, b ? num(b.seconds.mean, 3) : "—"),
            el("td", {}, b ? `${b.solved}/${b.scrambles}` : "—"));
        })))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Thirteen methods, one format"),
        el("p", { class: "panel__note" },
          "A method here is nothing but an ordered list of stages, and a stage is a goal, the moves allowed, and what must stay solved. CFOP, Roux, ZZ, Petrus, LBL and the Q-FOX tiers are all the same six lines of data.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${data.methodsList.length} methods`, "fox"),
        chip(`${int(data.methodsList.reduce((n, m) => n + m.stages.length, 0))} stages total`, "sky"))),
    compare,
    el("div", { class: "section-head" }, el("h2", {}, "The roster")),
    cards);

  return { node: view };
}

/* ----------------------------------------------------------------- detail */

function detail(name) {
  const m = data.methods.methods[name];
  const view = el("div");
  if (!m) {
    mount(view, el("div", { class: "empty" }, el("h3", {}, "No such method")));
    return { node: view };
  }
  const b = bench(name);

  const stages = el("div", { class: "table-wrap" },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", { class: "num" }, "#"), el("th", {}, "Stage"), el("th", {}, "Goal"),
        el("th", {}, "Moves allowed"), el("th", {}, "Heuristics"),
        el("th", { class: "num" }, "Alternatives"),
        el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "ms"),
        el("th", {}, "Answered by"))),
      el("tbody", {}, m.stages.map((s, i) => {
        const bs = (b && b.stages && b.stages[s.name]) || null;
        return el("tr", {},
          el("td", { class: "num" }, String(i + 1)),
          el("td", { class: "name" }, el("code", {}, s.name),
            el("div", { class: "tiny muted" }, s.note || "")),
          el("td", {}, (s.goal || []).map((g) => el("code", { class: "tiny" }, g)),
            s.align_centres ? chip("centres aligned", "gold") : null),
          el("td", { class: "tiny" }, s.mask),
          el("td", {}, (s.heuristics || []).length
            ? (s.heuristics || []).map((h) => el("code", { class: "tiny" }, h))
            : el("span", { class: "tiny muted" }, "goal table only")),
          el("td", { class: "num" }, String(s.alternatives || 1)),
          el("td", { class: "num" }, bs ? num(bs.htm_mean, 2) : "—"),
          el("td", { class: "num" }, bs ? num(bs.seconds_mean * 1000, 1) : "—"),
          el("td", {}, bs ? Object.entries(bs.via).map(([via, n]) => chip(`${via} ×${n}`, "sky")) : null));
      }))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("a", { class: "tiny muted", href: "#/methods" }, "← all methods"),
        el("h1", {}, m.name),
        el("p", { class: "panel__note" }, m.family)),
      el("span", { class: "spacer" }),
      b ? el("div", { class: "row row--tight" },
        chip(`${num(b.htm.mean, 2)} htm mean`, "mint"),
        chip(`${num(b.seconds.mean, 3)} s mean`, "sky"),
        chip(`${b.solved}/${b.scrambles} solved`, "fox")) : null),
    el("div", { class: "split" },
      el("div", { class: "stack" },
        el("div", { class: "panel" },
          el("p", {}, m.description),
          m.reference ? el("p", { class: "tiny muted" }, "Reference: ", m.reference) : null,
          el("p", { class: "small" }, el("b", {}, "Path: "), el("code", {}, m.path))),
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Stages")),
          stages)),
      el("div", { class: "stack" },
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Memorisation load")),
          el("p", { class: "tiny muted" }, "How many algorithms each Q-FOX tier asks for if you solve this way."),
          el("div", { class: "stack", style: { gap: "8px" } },
            ...Object.entries(m.algs_by_tier || {}).map(([tier, n]) => el("div", { class: "bar-row" },
              el("span", { class: "bar-row__label" }, tier),
              el("div", { class: "bar-track" },
                el("div", { class: "bar-fill", style: { width: `${Math.min(100, (n / 160) * 100)}%` } })),
              el("span", { class: "bar-row__val" }, String(n)))))),
        b ? el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Benchmark")),
          el("div", { class: "stats" },
            statEl(num(b.htm.mean, 2), "htm mean", `min ${b.htm.min} · max ${b.htm.max}`),
            statEl(num(b.qtm.mean, 2), "qtm mean", `min ${b.qtm.min} · max ${b.qtm.max}`),
            statEl(num(b.stm.mean, 2), "stm mean", ""),
            statEl(num(b.etm.mean, 2), "etm mean", ""),
            statEl(duration(b.seconds.mean), "solve time", `worst ${duration(b.seconds.max)}`),
            statEl(duration(b.table_seconds), "tables", "built once, shared")),
          el("p", { class: "tiny muted", style: { marginTop: "10px" } },
            `${b.solved}/${b.scrambles} scrambles solved and verified by replay.`)) : null,
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Try it")),
          el("p", { class: "small muted" }, "The engine runs on a server, not in this page — but every move it uses is here."),
          el("div", { class: "row" },
            el("a", { class: "btn btn--sm", href: "#/engine" }, "Open the move playground"),
            el("a", { class: "btn btn--sm", href: "#/benchmark" }, "See the full benchmark"))))));

  return { node: view };
}

function statEl(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
