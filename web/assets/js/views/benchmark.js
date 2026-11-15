/**
 * Benchmark: what the engine actually achieved, over the same scrambles for
 * every method, with every solution replayed before it was counted.
 */
import { data, bench } from "../data.js";
import { el, mount, chip, num, int, duration, emptyState } from "../util.js";

const COLUMNS = [
  { key: "method", label: "Method", get: (r) => r.method, name: true },
  { key: "solved", label: "Solved", get: (r) => r.solved, num: true },
  { key: "htm", label: "htm", get: (r) => r.htm.mean, num: true, best: "min" },
  { key: "qtm", label: "qtm", get: (r) => r.qtm.mean, num: true, best: "min" },
  { key: "stm", label: "stm", get: (r) => r.stm.mean, num: true, best: "min" },
  { key: "etm", label: "etm", get: (r) => r.etm.mean, num: true, best: "min" },
  { key: "seconds", label: "Seconds", get: (r) => r.seconds.mean, num: true, best: "min" },
  { key: "worst", label: "Worst solve", get: (r) => r.seconds.max, num: true, best: "min" },
  { key: "stages", label: "Stages", get: (r) => Object.keys(r.stages || {}).length, num: true },
];

let sortKey = "htm";
let sortDir = 1;

export function render(params = {}, query = {}) {
  const view = el("div");
  const rows = (data.benchmark.results || []).slice();
  const meta = data.benchmark.meta || {};

  if (!rows.length) {
    mount(view, emptyState("No benchmark yet",
      "Run scripts/bench.py --all --scrambles 20 and then scripts/gen_web_data.py."));
    return { node: view };
  }

  /* ------------------------------------------------------------------ meta */
  const solvedAll = rows.filter((r) => r.solved === r.scrambles).length;
  const totalSeconds = rows.reduce((s, r) => s + r.seconds.mean * r.scrambles, 0);
  const metaPanel = el("div", { class: "panel" },
    el("div", { class: "panel__head" },
      el("h3", {}, "How this was measured"),
      el("span", { class: "spacer" }),
      chip(data.benchmark.engine || "engine", "fox"),
      chip(new Date(data.benchmark.generated || Date.now()).toUTCString().slice(0, 22), "muted")),
    el("div", { class: "stats" },
      stat(int(meta.scrambles || rows[0].scrambles), "scrambles per method", `seed ${meta.seed}, length ${meta.scramble_length}`),
      stat(String(rows.length), "methods", "every one of them, same scrambles"),
      stat(`${solvedAll}/${rows.length}`, "solved every scramble", "verified by replay, centres included"),
      stat(duration(meta.table_seconds), "coordinate tables", "built once, shared by all methods"),
      stat(duration(totalSeconds), "total solving time", "sum over every solve"),
      stat(`${meta.book_swept || 0}`, "book depth", `${int(meta.book_found || 0)} last-layer elements known exactly`)),
    el("p", { class: "small muted", style: { marginTop: "12px" } },
      "The four counts are the engine's own metrics. ",
      "htm: an outer turn costs 1 whether quarter or half, a wide/slice/rotation turn costs 2. ",
      "qtm: quarter turns 1, half turns 2, wide/slice/rotation double. ",
      "stm: every turn costs 1, which is how speedcubing notation counts. ",
      "etm: like stm, but a slice turn costs 2. ",
      "Whole solves here use outer turns only, so htm and stm agree. ",
      "Solve time is engine time on this machine with warm tables — it is not a human TPS figure."));

  /* ----------------------------------------------------------------- table */
  const tableWrap = el("div", { class: "table-wrap" });

  function draw() {
    const col = COLUMNS.find((c) => c.key === sortKey);
    const sorted = rows.slice().sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * ((va ?? 1e9) - (vb ?? 1e9));
    });
    const best = {};
    for (const c of COLUMNS) {
      if (!c.best) continue;
      const vals = rows.map(c.get).filter((v) => typeof v === "number");
      best[c.key] = c.best === "min" ? Math.min(...vals) : Math.max(...vals);
    }
    mount(tableWrap, el("table", { class: "table" },
      el("thead", {}, el("tr", {}, COLUMNS.map((c) => el("th", {
        class: `${c.num ? "num " : ""}is-sortable`,
        title: "Sort by this column",
        onClick: () => {
          if (sortKey === c.key) sortDir *= -1;
          else { sortKey = c.key; sortDir = c.key === "method" ? 1 : 1; }
          draw();
          drawBars();
        },
      }, c.label, sortKey === c.key ? (sortDir === 1 ? " ▲" : " ▼") : "")))),
      el("tbody", {}, sorted.map((r) => el("tr", {
        class: best.htm !== undefined && Math.abs(r.htm.mean - best.htm) < 1e-9 ? "is-best" : "",
      }, COLUMNS.map((c) => {
        const v = c.get(r);
        const isBest = c.best && typeof v === "number" && Math.abs(v - best[c.key]) < 1e-9;
        if (c.name) {
          return el("td", { class: "name" },
            el("a", { href: `#/methods/${encodeURIComponent(r.method)}` }, r.method));
        }
        if (c.key === "solved") {
          return el("td", { class: "num" },
            r.solved === r.scrambles
              ? chip(`${r.solved}/${r.scrambles}`, "mint")
              : chip(`${r.solved}/${r.scrambles}`, "rose"));
        }
        return el("td", { class: "num" },
          isBest ? el("b", { style: { color: "var(--fox-soft)" } }, fmt(c.key, v)) : fmt(c.key, v));
      }))))));
  }

  function fmt(key, v) {
    if (v === null || v === undefined) return "—";
    if (key === "seconds" || key === "worst") return num(v, 3);
    if (typeof v === "number") return num(v, 2);
    return String(v);
  }

  /* ------------------------------------------------------------------ bars */
  const bars = el("div", { class: "panel" });
  function drawBars() {
    const metric = sortKey === "seconds" || sortKey === "worst" ? "seconds" : "htm";
    const get = metric === "seconds" ? (r) => r.seconds.mean : (r) => r.htm.mean;
    const sorted = rows.slice().sort((a, b) => get(a) - get(b));
    const max = Math.max(...sorted.map(get));
    mount(bars,
      el("div", { class: "panel__head" },
        el("h3", {}, metric === "seconds" ? "Engine seconds per solve" : "Move count per solve (htm)"),
        el("span", { class: "spacer" }),
        el("div", { class: "pill-tabs" },
          el("button", { class: `pill-tab ${metric === "htm" ? "is-on" : ""}`, type: "button",
                         onClick: () => { sortKey = "htm"; draw(); drawBars(); } }, "Moves"),
          el("button", { class: `pill-tab ${metric === "seconds" ? "is-on" : ""}`, type: "button",
                         onClick: () => { sortKey = "seconds"; draw(); drawBars(); } }, "Time"))),
      ...sorted.map((r) => el("div", { class: "bar-row" },
        el("span", { class: "bar-row__label" }, r.method),
        el("div", { class: "bar-track" },
          el("div", { class: `bar-fill ${metric === "seconds" ? "bar-fill--sky" : ""}`,
                      style: { width: `${Math.max(2, (get(r) / max) * 100)}%` } })),
        el("span", { class: "bar-row__val" }, metric === "seconds" ? `${num(get(r), 2)} s` : num(get(r), 2)))));
  }

  /* -------------------------------------------------------------- stages */
  const stagePanel = el("div", { class: "panel" });
  function drawStages(name) {
    const r = bench(name);
    if (!r || !r.stages) {
      mount(stagePanel, emptyState("No stage detail", "Re-run bench.py with --stages."));
      return;
    }
    const entries = Object.entries(r.stages);
    const maxHtm = Math.max(...entries.map(([, d]) => d.htm_mean), 1);
    mount(stagePanel,
      el("div", { class: "panel__head" }, el("h3", {}, `Where the moves go — ${name}`),
        el("span", { class: "spacer" }),
        el("select", {
          attrs: { "aria-label": "Method" },
          onChange: (e) => drawStages(e.target.value),
        }, ...rows.map((x) => el("option", { value: x.method, selected: x.method === name }, x.method)))),
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Stage"), el("th", { class: "num" }, "htm mean"),
            el("th", {}, ""), el("th", { class: "num" }, "ms mean"),
            el("th", { class: "num" }, "nodes mean"), el("th", {}, "Answered by"))),
          el("tbody", {}, entries.map(([stage, d]) => el("tr", {},
            el("td", { class: "name" }, el("code", {}, stage)),
            el("td", { class: "num" }, num(d.htm_mean, 2)),
            el("td", {}, el("div", { class: "bar-track", style: { minWidth: "90px" } },
              el("div", { class: "bar-fill", style: { width: `${(d.htm_mean / maxHtm) * 100}%` } }))),
            el("td", { class: "num" }, num(d.seconds_mean * 1000, 1)),
            el("td", { class: "num" }, int(Math.round(d.nodes_mean))),
            el("td", {}, Object.entries(d.via || {}).map(([via, n]) => chip(`${via} ×${n}`, "sky")))))))),
      el("p", { class: "tiny muted", style: { marginTop: "10px" } },
        "“book:scan” means the answer came straight out of the last-layer book — no search at all. ",
        "“ida” is the engine's IDA* with the stage's heuristic tables. ",
        "“centres” means the stage enumerated centre-aligned candidates because a slice move can leave the centres swapped."));
  }

  const first = rows.slice().sort((a, b) => a.htm.mean - b.htm.mean)[0].method;
  draw();
  drawBars();
  drawStages(query.method || first);

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Benchmark"),
        el("p", { class: "panel__note" },
          `${rows.length} methods × ${int(meta.scrambles || rows[0].scrambles)} scrambles, every solution replayed on the cube before it was counted. Click a column to sort.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${solvedAll}/${rows.length} perfect`, "mint"),
        chip(`tables ${duration(meta.table_seconds)}`, "sky"))),
    metaPanel,
    el("div", { class: "section-head" }, el("h2", {}, "Results")),
    tableWrap,
    el("div", { class: "section-head" }, el("h2", {}, "Ranking")),
    bars,
    el("div", { class: "section-head" }, el("h2", {}, "Stage by stage")),
    stagePanel);

  return { node: view };
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
