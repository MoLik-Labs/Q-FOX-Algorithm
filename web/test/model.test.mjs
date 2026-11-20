/**
 * Node test for the browser cube model.
 *
 *     node web/test/model.test.mjs
 *
 * The site draws 26 cubies and animates layer turns; the engine publishes 54
 * facelet permutations.  This test refuses to let the two drift apart, and
 * replays every algorithm the site publishes against the state it was derived
 * from.  No dependencies, no build step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createModel, modelPerm, geometry, turnOf, tokenize, scramble, FAMILY_TURNS,
} from "../assets/js/model.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data");
const read = (n) => JSON.parse(readFileSync(join(DATA, n), "utf8"));

let checks = 0;
const failures = [];
function ok(cond, label, detail = "") {
  checks++;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const engine = read("engine.json");
const algorithms = read("algorithms.json");
const M = createModel(engine);

/* ---------------------------------------------------------------- 1. geometry */
{
  const g = geometry(engine.net);
  ok(g.cells.every((c) => c.every((v) => Math.abs(v) <= 1)), "cells stay inside the 3x3x3");
  const seen = new Set(g.cells.map((c) => c.join(",")));
  ok(seen.size === 26, "54 facelets land on exactly 26 cubies", `got ${seen.size}`);
  const perCell = new Map();
  g.cells.forEach((c, i) => perCell.set(c.join(","), (perCell.get(c.join(",")) || 0) + 1));
  const counts = [...perCell.values()].sort().join(",");
  // 6 centres x 1 + 12 edges x 2 + 8 corners x 3 = 54 stickers over 26 cubies
  const want = [...Array(6).fill(1), ...Array(12).fill(2), ...Array(8).fill(3)]
    .sort((a, b) => a - b).join(",");
  ok(counts === want, "8 corners carry 3 stickers, 12 edges 2, 6 centres 1", counts);
  ok(g.at.size === 54, "every (cell, direction) pair maps to one facelet");
}

/* ------------------------------------------------------- 2. model == engine */
{
  const r = M.selfCheck();
  ok(r.checked === 54, "all 54 moves checked", `${r.checked}`);
  ok(r.ok, "the drawing model reproduces every engine permutation",
     r.mismatches.slice(0, 4).map((m) => `${m.move}@${m.facelet}`).join(" "));

  // and the reverse direction: the engine perm applied to a state must equal
  // what the geometric model does to the same state
  const state = M.applySeq(M.solved, "R U F2 L' D B M E S r y x");
  const g = geometry(engine.net);
  for (const m of engine.moves) {
    const viaEngine = M.apply(state, m.name);
    const perm = modelPerm(m.name, g);
    let viaModel = "";
    for (let j = 0; j < 54; j++) viaModel += state[perm[j]];
    if (viaEngine !== viaModel) {
      ok(false, `state agreement for ${m.name}`);
      break;
    }
  }
  ok(true, "engine perm and model perm agree on a scrambled state");
}

/* ------------------------------------------------------------ 3. turn specs */
{
  for (const m of engine.moves) {
    const t = turnOf(m.name);
    ok(!!t, `turn spec for ${m.name}`);
    if (!t) continue;
    ok([1, 2, 3].includes(t.quarters), `${m.name} has a sane power`, `${t.quarters}`);
    ok(t.cells.length >= 1 && t.cells.length <= 3, `${m.name} takes 1-3 layers`);
  }
  ok(Object.keys(FAMILY_TURNS).length === 18, "18 move families");
  // a move applied four times is the identity
  for (const m of engine.moves) {
    let s = M.solved;
    for (let k = 0; k < 4; k++) s = M.apply(s, m.name);
    ok(s === M.solved, `${m.name} four times is the identity`);
  }
  // inverses
  for (const m of engine.moves) {
    const inv = M.invert([m.name])[0];
    ok(M.apply(M.apply(M.solved, m.name), inv) === M.solved,
       `${m.name} then ${inv} is the identity`);
  }
}

/* --------------------------------------------------------------- 4. notation */
{
  ok(tokenize("R U R' U'").join(" ") === "R U R' U'", "tokenize plain");
  ok(tokenize("Rw2 U' y").join(" ") === "r2 U' y", "tokenize wide + rotation");
  ok(tokenize("M2  E'  S").join(" ") === "M2 E' S", "tokenize slices");
  ok(tokenize("").length === 0, "tokenize empty");
  let threw = false;
  try { tokenize("Q"); } catch { threw = true; }
  ok(threw, "tokenize rejects a move that does not exist");
  ok(M.format(M.parse("R U' F2 Lw")) === "R U' F2 l", "parse then format is canonical");
}

/* -------------------------------------------------------------- 5. scrambles */
{
  for (let trial = 0; trial < 40; trial++) {
    const s = scramble(25);
    ok(s.length === 25, "scramble length");
    ok(s.every((t) => /^[URFDLB](2|')?$/.test(t)), "scramble uses outer turns only");
    ok(s.every((t, i) => i === 0 || t[0] !== s[i - 1][0]), "scramble never repeats a face");
    ok(s.every((t, i) => i < 2 ||
      !(FAMILY_TURNS[t[0]].axis === FAMILY_TURNS[s[i - 1][0]].axis &&
        FAMILY_TURNS[s[i - 1][0]].axis === FAMILY_TURNS[s[i - 2][0]].axis)),
       "scramble never runs three turns on one axis");
    // a scramble undone by its own inverse is the solved cube
    let st = M.solved;
    for (const t of s) st = M.apply(st, t);
    for (const t of M.invert(s)) st = M.apply(st, t);
    ok(st === M.solved, "scramble + inverse returns to solved");
    if (failures.length) break;
  }
}

/* --------------------------------------------------- 6. every published case */
{
  let cases = 0;
  const goalOf = {
    OLL: (s) => M.geom.net.U.flat().every((i) => s[i] === "U"),
    PLL: (s) => M.isSolved(s),
    CLL: (s) => cornerState(s) === cornerState(M.solved),
    COLL: (s) => cornerState(s) === cornerState(M.solved),
    ELL: (s) => edgeState(s) === edgeState(M.solved),
  };
  const cornerState = (s) => {
    const g = M.geom;
    const out = [];
    for (const face of "URFDLB") {
      for (const i of [g.net[face][0][0], g.net[face][0][2], g.net[face][2][0], g.net[face][2][2]]) {
        out.push(s[i]);
      }
    }
    return out.join("");
  };
  const edgeState = (s) => {
    const g = M.geom;
    const out = [];
    for (const face of "URFDLB") {
      for (const i of [g.net[face][0][1], g.net[face][1][0], g.net[face][1][2], g.net[face][2][1]]) {
        out.push(s[i]);
      }
    }
    return out.join("");
  };

  for (const [family, block] of Object.entries(algorithms.families)) {
    for (const c of block.list) {
      cases++;
      ok(typeof c.state === "string" && c.state.length === 54,
         `${family} ${c.i} has a 54-facelet state`);
      const ids = c.moves || [];
      ok(ids.every((id) => M.byId.has(id)), `${family} ${c.i} moves are engine ids`);
      ok(M.format(ids) === (c.algorithm || ""), `${family} ${c.i} algorithm text matches moves[]`);
      const after = M.applyIds(c.state, ids);
      if (c.algorithm) {
        ok(goalOf[family](after), `${family} ${c.i} "${c.algorithm}" reaches the goal`);
        ok(!goalOf[family](c.state), `${family} ${c.i} is not already solved`);
      } else {
        ok(goalOf[family](c.state), `${family} ${c.i} empty algorithm means the case is the goal`);
      }
      // centres must survive: the site draws them, so a case that quietly
      // swapped two centres would look wrong and teach a wrong recognition
      const centres = [4, 13, 22, 31, 40, 49].map((i) => after[i]).join("");
      ok(centres === "URFDLB", `${family} ${c.i} leaves the centres aligned`, centres);
      // metrics
      const htm = ids.length;
      ok(c.htm === htm, `${family} ${c.i} htm == move count`, `${c.htm} vs ${htm}`);
      ok(c.qtm >= htm && c.etm >= htm, `${family} ${c.i} qtm/etm are >= htm`);
    }
  }
  ok(cases === algorithms.cases, "case count matches the family total",
     `${cases} vs ${algorithms.cases}`);
}

/* --------------------------------------------------------- 7. levels + methods */
{
  const levels = read("levels.json");
  const methods = read("methods.json");
  const book = read("book.json");
  const bench = read("benchmark.json");

  ok(levels.levels.map((l) => l.key).join(",") === "essence,easy,medium,tiny,low,flow",
     "the essence level and the five human tiers are exported");
  for (const lv of levels.levels) {
    ok(Array.isArray(lv.curriculum) && lv.curriculum.length > 0, `${lv.key} has a curriculum`);
    for (const item of lv.curriculum || []) {
      const block = algorithms.families[item.family];
      ok(!!block, `${lv.key}/${item.id} names a real family`);
      const byKey = new Map(block.list.map((c) => [c.key, c]));
      ok(item.cases.every((c) => byKey.has(c.key)),
         `${lv.key}/${item.id} only lists cases from its family`);
      ok(item.cases.every((c) => byKey.get(c.key).algorithm === c.algorithm &&
                                 byKey.get(c.key).element === c.element),
         `${lv.key}/${item.id} carries the same algorithm as the family export`);
    }
  }
  ok(Object.keys(methods.methods).length >= 6, "at least six methods exported");
  ok(book.elements === 62208, "the book covers 62208 last-layer elements");
  ok(book.found > 0 && book.found <= book.elements, "book coverage is sane");
  const rows = bench.results || [];
  ok(rows.length >= 6, "benchmark has a row per method", `${rows.length}`);
  ok(rows.every((r) => r.solved === r.scrambles),
     "every benchmark row solved every scramble",
     rows.filter((r) => r.solved !== r.scrambles).map((r) => r.method).join(","));
}

/* --------------------------------------------------------------------- report */
if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures.slice(0, 25)) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks — browser model, notation and all ` +
            `${algorithms.cases} published algorithms agree with the engine`);
