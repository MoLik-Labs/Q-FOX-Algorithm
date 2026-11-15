/**
 * Loads the six generated JSON files and indexes them for the views.
 *
 * Nothing is derived here that `scripts/gen_web_data.py` did not already
 * compute: this module only reshapes the export so a view can ask for
 * "every PLL case whose name contains 'perm'" without walking the tree.
 */
import { createModel } from "./model.js";

const FILES = ["engine", "algorithms", "methods", "levels", "book", "benchmark"];

export const FAMILY_ORDER = ["OLL", "PLL", "CLL", "COLL", "ELL"];

export const data = {
  ready: false,
  engine: null, algorithms: null, methods: null, levels: null, book: null,
  benchmark: null, model: null,
  cases: [], casesByKey: new Map(), families: [], levelsList: [], methodsList: [],
  benchByMethod: new Map(), check: null,
};

export async function loadAll(base = "data") {
  const found = {};
  await Promise.all(FILES.map(async (name) => {
    const res = await fetch(`${base}/${name}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${name}.json -> HTTP ${res.status}`);
    found[name] = await res.json();
  }));
  return hydrate(found);
}

export function hydrate(found) {
  Object.assign(data, found);
  data.model = createModel(found.engine);
  data.check = data.model.selfCheck();

  data.families = FAMILY_ORDER
    .filter((f) => found.algorithms.families[f])
    .map((f) => found.algorithms.families[f]);

  data.cases = [];
  for (const fam of data.families) {
    for (const c of fam.list) {
      // `family` is the KEY -- "CLL", the one every lookup is indexed by
      // (algorithms.families, GOAL_TEXT, goalReached, casesOf, the URL).
      // `familyLabel` is what a human reads -- "CLL / CMLL".  Conflating the two
      // sends goalReached() down its fall-through branch and grades a correct
      // answer as wrong, so they stay separate fields.
      const row = { ...c, family: fam.key, familyLabel: fam.label,
                    familyTitle: fam.title, level: fam.level };
      // Up to two words exist for a case, and both are verified against the
      // goal by the generator: the engine's own shortest, and the familiar
      // algorithm when the engine recognised the case.  The card shows the
      // shorter one and keeps the other a keystroke away, because "shortest"
      // and "the one everyone learns" are not always the same word -- the
      // H-perm is 7 moves with the M slice and 10 without it.
      // Lengths are stm, where a slice turn is one move: that is how
      // speedcubing notation counts, so the number matches what people quote.
      const cand = [];
      if (row.moves && row.moves.length) {
        cand.push({ kind: "engine", text: row.algorithm, moves: row.moves,
                    count: row.stm, label: "Engine's shortest" });
      }
      if (row.teach) {
        cand.push({ kind: "textbook", text: row.teach.algorithm, moves: row.teach.moves,
                    count: row.teach.stm, label: `Familiar — ${row.teach.name}`,
                    name: row.teach.name });
      }
      cand.sort((a, b) => a.count - b.count || a.moves.length - b.moves.length);
      row.words = cand;
      row.primary = cand[0] || null;
      row.alt = cand[1] || null;
      row.text = row.primary ? row.primary.text : "";
      row.tokens = row.primary ? row.primary.moves : [];
      row.count = row.primary ? row.primary.count : 0;
      row.source = row.primary ? row.primary.kind : "none";
      data.cases.push(row);
      data.casesByKey.set(row.key, row);
    }
  }

  data.levelsList = found.levels.levels;
  data.methodsList = Object.values(found.methods.methods);
  data.benchByMethod = new Map(
    (found.benchmark.results || []).map((r) => [r.method, r]));

  data.ready = true;
  return data;
}

/* ------------------------------------------------------------------- lookup */

export const caseByKey = (key) => data.casesByKey.get(key);

export const family = (label) => data.algorithms.families[label];

export function casesOf(label) {
  const f = data.algorithms.families[label];
  return f ? f.list.map((c) => data.casesByKey.get(c.key)) : [];
}

export const level = (key) => data.levelsList.find((l) => l.key === key);
export const method = (name) => data.methods.methods[name];
export const bench = (name) => data.benchByMethod.get(name);

/** Every case key a level's curriculum asks for, in curriculum order. */
export function levelKeys(key) {
  const lv = level(key);
  if (!lv) return [];
  return (lv.curriculum || []).flatMap((item) => item.cases.map((c) => c.key));
}

/** All curriculum items of all levels that contain a case key. */
export function setsContaining(key) {
  const out = [];
  for (const lv of data.levelsList) {
    for (const item of lv.curriculum || []) {
      if (item.cases.some((c) => c.key === key)) out.push({ level: lv, item });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- search */

function haystack(c) {
  const d = c.desc || {};
  return [
    c.family, c.familyLabel, c.familyTitle, ...(c.names || []), c.algorithm || "",
    (c.teach && c.teach.name) || "", (c.teach && c.teach.algorithm) || "",
    d.pattern || "", d.permutation || "", d.edges || "", d.corners || "",
    d.edge_cycles || "", d.corner_cycles || "", `element ${c.element}`,
    `case ${c.i}`, c.htm, c.stm, c.count, c.via,
  ].join(" ").toLowerCase();
}

let searchIndex = null;
export function search(q, cases = data.cases) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return cases;
  if (!searchIndex) {
    searchIndex = new Map(data.cases.map((c) => [c.key, haystack(c)]));
  }
  const words = query.split(/\s+/);
  return cases.filter((c) => {
    const hay = searchIndex.get(c.key) || haystack(c);
    return words.every((w) => hay.includes(w));
  });
}

/* ------------------------------------------------------------------- totals */

export function totals() {
  const a = data.algorithms;
  const b = data.book;
  const benchRows = data.benchmark.results || [];
  const solvedAll = benchRows.filter((r) => r.solved === r.scrambles).length;
  const fastest = benchRows.slice().sort((x, y) => x.seconds.mean - y.seconds.mean)[0];
  const shortest = benchRows.slice().sort((x, y) => x.htm.mean - y.htm.mean)[0];
  return {
    cases: a.cases,
    toLearn: a.to_learn,
    named: a.named,
    families: data.families.length,
    methods: data.methodsList.length,
    levels: data.levelsList.length,
    moves: data.engine.moves.length,
    elements: b.elements,
    swept: b.swept,
    coverage: b.coverage,
    exactTo: b.reachable_by,
    scrambles: (data.benchmark.meta || {}).scrambles || 0,
    methodsSolvedAll: solvedAll,
    fastest, shortest,
  };
}

/* ------------------------------------------------------------- the word itself */

/** The algorithm a card shows: the familiar word when the engine verified one. */
export const word = (row) => (row && row.text) || "";

/** Its tokens, as engine move ids. */
export const wordTokens = (row) => (row && row.tokens) || [];

/** Its length in the metric people quote: a slice turn counts as one move. */
export const wordCount = (row) => (row && row.count) || 0;

export const METRIC = "moves";
export const METRIC_HINT =
  "Counted the way speedcubing notation counts: every turn of a layer, slice " +
  "included, is one move (the engine calls this stm). Its own htm charges a " +
  "slice turn two, which is why the two numbers differ on M-slice algorithms.";
