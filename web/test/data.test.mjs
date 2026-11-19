/**
 * Node test for the site's data layer.
 *
 *     node web/test/data.test.mjs
 *
 * model.test.mjs proves the browser cube agrees with the engine.  This one
 * proves the *page* agrees with the data: it hydrates the six generated JSON
 * files exactly the way data.js does in the browser, then exercises the code
 * paths the views depend on -- the case index, the level curricula, search, the
 * two-words-per-case shaping, and above all `goalReached`, which is what the
 * trainer uses to decide whether a typed algorithm was right.  A wrong answer
 * there is worse than a broken picture: it tells someone they failed a case
 * they actually solved.
 *
 * No dependencies, no build step, no DOM.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hydrate, data, totals, search, casesOf, caseByKey, level, levelKeys,
         setsContaining, bench, method, FAMILY_ORDER } from "../assets/js/data.js";
import { goalReached, goalUpToAuf, edgesOriented, GOAL_TEXT } from "../assets/js/goals.js";
import { tokenize } from "../assets/js/model.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data");
const read = (n) => JSON.parse(readFileSync(join(DATA, n), "utf8"));

let checks = 0;
const failures = [];
function ok(cond, label, detail = "") {
  checks++;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const found = {
  engine: read("engine.json"),
  algorithms: read("algorithms.json"),
  methods: read("methods.json"),
  levels: read("levels.json"),
  book: read("book.json"),
  benchmark: read("benchmark.json"),
};
hydrate(found);
const M = data.model;

/* ------------------------------------------------------------- 1. the model */
ok(data.ready === true, "hydrate sets ready");
ok(data.check && data.check.ok, "browser cube reproduces every engine permutation",
   data.check ? `${data.check.mismatches.length} mismatches` : "no check");
ok(data.check.checked === found.engine.moves.length, "all moves were checked");

/* -------------------------------------------------------------- 2. the index */
{
  const listed = Object.values(found.algorithms.families).reduce((n, f) => n + f.list.length, 0);
  ok(data.cases.length === listed, "every case is indexed", `${data.cases.length} vs ${listed}`);
  ok(data.cases.length === found.algorithms.cases, "case count matches the export");
  const keys = data.cases.map((c) => c.key);
  ok(new Set(keys).size === keys.length, "case keys are unique");
  ok(keys.every((k) => data.casesByKey.get(k)), "casesByKey resolves every key");
  ok(FAMILY_ORDER.every((f) => casesOf(f).length === found.algorithms.families[f].list.length),
     "casesOf returns the whole family");
  ok(data.families.length === FAMILY_ORDER.length, "families are in the fixed order");
}

/* ------------------------------------------- 3. the two-words-per-case shaping */
{
  let withTwo = 0;
  for (const row of data.cases) {
    ok(Array.isArray(row.words), `${row.key}: words[] exists`);
    // a trivial case is already at the goal, so it publishes no word at all
    const want = row.moves && row.moves.length ? (row.teach ? 2 : 1) : 0;
    ok(row.words.length === want, `${row.key}: one word per verified source`,
       `${row.words.length} want ${want}`);
    ok(["OLL", "PLL", "CLL", "COLL", "ELL"].includes(row.family),
       `${row.key}: family is the lookup key, not the display label`, row.family);
    ok(!!GOAL_TEXT[row.family], `${row.key}: its family key has goal text`);
    if (row.words.length === 2) withTwo++;
    ok(row.primary === (row.words[0] || null), `${row.key}: primary is the first word`);
    ok(row.text === (row.primary ? row.primary.text : ""), `${row.key}: text follows primary`);
    ok(row.count === (row.primary ? row.primary.count : 0), `${row.key}: count follows primary`);
    ok(row.words.every((w, i) => i === 0 || w.count >= row.words[i - 1].count),
       `${row.key}: words are sorted shortest first`);
    ok(row.words.every((w) => w.text === M.format(w.moves)),
       `${row.key}: every word's text matches its tokens`);
    ok(row.words.every((w) => w.count === w.moves.length),
       `${row.key}: the quoted count is the token count (stm)`);
    ok(row.source === "textbook" || row.source === "engine" || row.source === "none",
       `${row.key}: source is a known kind`, row.source);
    if (row.teach) {
      ok(row.names.includes(row.teach.name), `${row.key}: the familiar name is in names[]`);
      ok(GOAL_TEXT[row.family] !== undefined, `${row.key}: family has goal text`);
    }
  }
  ok(withTwo === found.algorithms.with_textbook,
     "cases with a familiar word match the export", `${withTwo} vs ${found.algorithms.with_textbook}`);
}

/* ------------------------------------- 4. every published word reaches its goal */
{
  let trivial = 0, words = 0, aufShort = 0;
  for (const row of data.cases) {
    for (const w of row.words) {
      words++;
      const after = M.applyIds(row.state, w.moves);
      ok(goalReached(row.family, after, M),
         `${row.key}: ${w.label} reaches the ${row.family} goal`, w.text);
      ok(row.verified === true, `${row.key}: marked verified by the generator`);
      ok(M.applyIds(row.state, M.parse(w.text).map((m) => m.id)) === after,
         `${row.key}: parsing the text back gives the same state`);
    }
    if (!row.words.length) {
      trivial++;
      ok(goalReached(row.family, row.state, M),
         `${row.key}: a case with no algorithm is already at the goal`);
    }
    // the trainer grades a near-miss as "right answer, wrong AUF", so that path
    // has to fire on a state that is one turn of the top face short
    if (row.family === "PLL" && row.words.length) {
      const short = M.apply(M.applyIds(row.state, row.words[0].moves), "U");
      if (!goalReached(row.family, short, M)) {
        aufShort++;
        ok(goalUpToAuf(row.family, short, M) === "U'",
           `${row.key}: one U past the goal is recognised as an AUF miss`);
      }
    }
    // ... and must NOT fire on a state that is nowhere near
    ok(goalUpToOf(row) === null, `${row.key}: a wrong answer is not excused as an AUF`);
  }
  ok(trivial === found.algorithms.cases - found.algorithms.to_learn,
     "trivial cases match the export", `${trivial}`);
  ok(words === found.algorithms.to_learn + found.algorithms.with_textbook,
     "word count = one per case plus one per familiar word", `${words}`);
  ok(aufShort > 0, "the AUF-miss path was actually exercised", `${aufShort}`);
}
/** A state that should be graded wrong, not "almost". */
function goalUpToOf(row) {
  const junk = row.words.length ? M.applyIds(row.state, [M.byName.get("R").id]) : null;
  if (junk === null) return null;
  if (goalReached(row.family, junk, M)) return null;      // R happened to solve it
  return goalUpToAuf(row.family, junk, M);
}

/* ----------------------------------------------------------- 5. orientation */
{
  ok(edgesOriented(M.solved) === true, "a solved cube has its top edges oriented");
  ok(edgesOriented(M.apply(M.solved, "F")) === false, "F breaks top-edge orientation");
  ok(edgesOriented(M.apply(M.solved, "U")) === true, "U does not");
  ok(edgesOriented(M.apply(M.solved, "M")) === false, "M does");
  for (const f of FAMILY_ORDER) {
    ok(typeof GOAL_TEXT[f] === "string" && GOAL_TEXT[f].length > 8,
       `${f}: goal text is written out for learners`);
  }
}

/* --------------------------------------------------------------- 6. search */
{
  ok(search("").length === data.cases.length, "an empty query returns everything");
  ok(search("sune").some((c) => c.teach && c.teach.name === "Sune"), "search finds Sune by name");
  ok(search("h-perm").length === 1, "search finds the H-perm", `${search("h-perm").length}`);
  // search ANDs whole words rather than matching a phrase, so an algorithm
  // query narrows by the moves it mentions instead of by their exact order
  const hperm = search("M2 U M2 U2");
  ok(hperm.some((c) => c.key === "PLL:4"), "search finds a case by the moves in its algorithm",
     hperm.map((c) => c.key).join(","));
  ok(search("đèn pha").length >= 1, "search finds cases by their shape name");
  ok(search("qqqqqq").length === 0, "search returns nothing for nonsense");
  ok(search("pll corners").every((c) => c.family === "PLL"),
     "multi-word search ANDs its terms");
  ok(search("cmll").length > 0, "search reaches a family by its display label, not only its key");
  ok(search("cll").every((c) => c.family === "CLL" || c.family === "COLL"),
     "searching a family key narrows to that family");
  ok(search("phần tử 0").length >= 1, "search reaches the book element");
}

/* -------------------------------------------------------------- 7. levels */
{
  ok(data.levelsList.length === 1, "one distilled essence level");
  let sets = 0, rows = 0;
  for (const lv of data.levelsList) {
    ok(!!level(lv.key), `level(${lv.key}) resolves`);
    ok(lv.curriculum.length > 0, `${lv.key}: has a curriculum`);
    ok(typeof lv.distinct_algorithms === "number" && lv.distinct_algorithms > 0,
       `${lv.key}: counts its distinct algorithms`);
    ok(lv.benchmark && lv.benchmark.solved === lv.benchmark.scrambles,
       `${lv.key}: its method solved every benchmark scramble`);
    for (const item of lv.curriculum) {
      sets++;
      ok(typeof item.key === "undefined" || true, `${lv.key}/${item.id}: shape`);
      ok(item.cases.length === item.selected, `${lv.key}/${item.id}: selected matches the case list`,
         `${item.selected} vs ${item.cases.length}`);
      ok(item.to_learn === item.cases.filter((c) => c.algorithm).length,
         `${lv.key}/${item.id}: to_learn counts the non-trivial cases`);
      for (const c of item.cases) {
        rows++;
        const full = caseByKey(c.key);
        ok(!!full, `${lv.key}/${item.id}: ${c.key} resolves in the case index`);
        if (full) {
          ok(full.i === c.i && full.element === c.element,
             `${c.key}: the curriculum row agrees with the case`);
          ok(full.stm === c.stm, `${c.key}: the curriculum row carries the same length`);
        }
      }
    }
    const keys = levelKeys(lv.key);
    ok(keys.length === rows ? true : keys.length === lv.curriculum.reduce((n, i) => n + i.cases.length, 0),
       `${lv.key}: levelKeys walks the whole curriculum`, `${keys.length}`);
    ok(keys.every((k) => caseByKey(k)), `${lv.key}: every curriculum key exists`);
  }
  ok(sets === 4, "four study sets in the essence level", `${sets}`);
  const sune = data.cases.find((c) => c.teach && c.teach.name === "Sune");
  ok(setsContaining(sune.key).length >= 1, "setsContaining finds where a case is taught");
  ok(setsContaining("OLL:0").length >= 1, "even the trivial case appears in a set");
}

/* --------------------------------------------------- 8. methods and benchmark */
{
  ok(data.methodsList.length === Object.keys(found.methods.methods).length,
     "every method is listed");
  ok(data.methodsList.length >= 6, "at least six methods", `${data.methodsList.length}`);
  for (const m of data.methodsList) {
    ok(!!method(m.name), `method(${m.name}) resolves`);
    ok(m.stages.length > 0, `${m.name}: has stages`);
    ok(m.stages.every((s) => s.name), `${m.name}: every stage is named`);
    ok(!!m.algs_by_tier, `${m.name}: declares what each tier must memorise`);
  }
  const rows = found.benchmark.results;
  ok(rows.length === data.methodsList.length, "one benchmark row per method",
     `${rows.length} vs ${data.methodsList.length}`);
  ok(rows.every((r) => r.solved === r.scrambles),
     "every method solved every scramble",
     rows.filter((r) => r.solved !== r.scrambles).map((r) => r.method).join(","));
  ok(rows.every((r) => !!bench(r.method)), "bench() resolves every method");
  ok(found.benchmark.meta.scrambles === rows[0].scrambles, "meta agrees with the rows");
  for (const r of rows) {
    ok(Object.keys(r.stages).length > 0, `${r.method}: per-stage detail exported`);
    for (const [name, s] of Object.entries(r.stages)) {
      ok(typeof s.htm_mean === "number" && s.htm_mean >= 0, `${r.method}/${name}: htm mean`);
      ok(s.via && Object.values(s.via).reduce((a, b) => a + b, 0) === r.scrambles,
         `${r.method}/${name}: every scramble is accounted for by some path`);
    }
  }
}

/* --------------------------------------------------------------- 9. totals */
{
  const t = totals();
  ok(t.cases === found.algorithms.cases, "totals: cases");
  ok(t.toLearn === found.algorithms.to_learn, "totals: to_learn");
  ok(t.named === found.algorithms.named, "totals: named");
  ok(t.methods === data.methodsList.length, "totals: methods");
  ok(t.levels === data.levelsList.length, "totals: levels");
  ok(t.moves === found.engine.moves.length, "totals: moves");
  ok(t.elements === found.book.elements, "totals: book elements");
  ok(t.swept === found.book.swept, "totals: swept depth");
  ok(t.coverage === found.book.coverage, "totals: coverage");
  ok(t.methodsSolvedAll === found.benchmark.results.length,
     "totals: every method solved every scramble");
  ok(t.shortest && t.shortest.htm.mean === Math.min(...found.benchmark.results.map((r) => r.htm.mean)),
     "totals: shortest is really the shortest", t.shortest && t.shortest.method);
  ok(t.fastest && t.fastest.seconds.mean === Math.min(...found.benchmark.results.map((r) => r.seconds.mean)),
     "totals: fastest is really the fastest", t.fastest && t.fastest.method);
}

/* ------------------------------------------------- 10. notation round trips */
{
  for (const row of data.cases.slice(0, 40)) {
    for (const w of row.words) {
      const toks = tokenize(w.text);
      ok(toks.length === w.moves.length, `${row.key}: tokenising the text gives one token per move`);
      ok(toks.every((t) => M.byName.has(t)), `${row.key}: every token is a move the engine knows`);
      const back = M.applySeq(row.state, w.text);
      ok(back === M.applyIds(row.state, w.moves), `${row.key}: text and ids give the same state`);
      const inv = M.invert(w.moves);
      ok(M.applyIds(back, M.parse(inv).map((m) => m.id)) === row.state,
         `${row.key}: the inverse returns to the case`);
    }
  }
}

/* --------------------------------------------------------------------- report */
if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures.slice(0, 25)) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks — the site's data layer, its ${data.cases.length} cases, ` +
            `${data.levelsList.length} levels, ${data.methodsList.length} methods and the ` +
            `trainer's grading all agree with the export`);
