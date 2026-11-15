/**
 * Q-FOX cube model — pure logic, no DOM, no engine, nothing to install.
 *
 * The engine (`engine/qfox.c`) stays the source of truth: every move the site
 * can play comes from `data/engine.json`, which carries the 54 facelet
 * permutations the C engine itself reports.  This module adds only the two
 * things a browser needs on top of that and that JSON cannot carry:
 *
 *   1. **where a facelet sits** — the cell of the 3×3×3 grid it belongs to and
 *      the direction it faces, so the cube can be drawn as 26 cubies instead
 *      of a flat string;
 *   2. **how a turn moves those cells** — the axis, the cells taken and the
 *      sense, so a layer can be animated instead of teleported.
 *
 * Both are cross-checked against the engine's own permutations, here at runtime
 * (`selfCheck()`) and in `web/test/model.test.mjs` under node.  If the two ever
 * disagree the site says so instead of quietly drawing a wrong cube.
 */

export const FACES = "URFDLB";

/** face -> outward normal, the direction rows run in, the direction columns run in */
export const FACE_AXES = {
  U: { n: [0, 1, 0], row: [0, 0, 1], col: [1, 0, 0] },   // rows towards F, cols towards R
  F: { n: [0, 0, 1], row: [0, -1, 0], col: [1, 0, 0] },  // rows towards D, cols towards R
  R: { n: [1, 0, 0], row: [0, -1, 0], col: [0, 0, -1] }, // cols towards B
  B: { n: [0, 0, -1], row: [0, -1, 0], col: [-1, 0, 0] },// cols towards L
  L: { n: [-1, 0, 0], row: [0, -1, 0], col: [0, 0, 1] }, // cols towards F
  D: { n: [0, -1, 0], row: [0, 0, -1], col: [1, 0, 0] }, // rows towards B, cols towards R
};

/** The unfolded net, facelet ids per face, row by row.  engine.json carries the
 *  same table; this copy only exists so the model can be tested standalone. */
export const NET = {
  U: [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
  L: [[36, 37, 38], [39, 40, 41], [42, 43, 44]],
  F: [[18, 19, 20], [21, 22, 23], [24, 25, 26]],
  R: [[9, 10, 11], [12, 13, 14], [15, 16, 17]],
  B: [[45, 46, 47], [48, 49, 50], [51, 52, 53]],
  D: [[27, 28, 29], [30, 31, 32], [33, 34, 35]],
};

/**
 * family -> { axis, cells, sense }
 *
 * `cells` are the layers taken, by their coordinate on `axis`
 * (x = R-L, y = U-D, z = F-B).  `sense` is sin(theta): -1 for the clockwise
 * quarter turn seen from the positive end of the axis, which is what every
 * face turn means, and what M/E/S and the wide turns inherit from L/D/F.
 */
export const FAMILY_TURNS = {
  U: { axis: "y", cells: [1], sense: -1 },
  D: { axis: "y", cells: [-1], sense: 1 },
  R: { axis: "x", cells: [1], sense: -1 },
  L: { axis: "x", cells: [-1], sense: 1 },
  F: { axis: "z", cells: [1], sense: -1 },
  B: { axis: "z", cells: [-1], sense: 1 },
  M: { axis: "x", cells: [0], sense: 1 },      // follows L
  E: { axis: "y", cells: [0], sense: 1 },      // follows D
  S: { axis: "z", cells: [0], sense: -1 },     // follows F
  u: { axis: "y", cells: [1, 0], sense: -1 },
  d: { axis: "y", cells: [-1, 0], sense: 1 },
  r: { axis: "x", cells: [1, 0], sense: -1 },
  l: { axis: "x", cells: [-1, 0], sense: 1 },
  f: { axis: "z", cells: [1, 0], sense: -1 },
  b: { axis: "z", cells: [-1, 0], sense: 1 },
  x: { axis: "x", cells: [1, 0, -1], sense: -1 },
  y: { axis: "y", cells: [1, 0, -1], sense: -1 },
  z: { axis: "z", cells: [1, 0, -1], sense: -1 },
};

export const AXIS_INDEX = { x: 0, y: 1, z: 2 };

/** how many quarter turns a suffix means */
export const POWERS = { "": 1, "2": 2, "'": 3 };

/** Colour per face.  Standard scheme, and the one the engine's face order
 *  (U R F D L B) is written against. */
export const FACE_COLOUR = {
  U: "#f4f6fb", R: "#e0362f", F: "#1fa45c", D: "#ffd23f", L: "#f08a1d", B: "#2159c4",
};

const CELLS = (() => {
  const out = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x || y || z) out.push([x, y, z]);
      }
    }
  }
  return out;
})();

/** the 26 cubie cells, x = R-L, y = U-D, z = F-B */
export const CUBIE_CELLS = CELLS;

export const key3 = (v) => `${v[0]},${v[1]},${v[2]}`;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/**
 * Facelet geometry: for each of the 54 facelets, the cubie cell it belongs to
 * and the direction it faces.
 */
export function geometry(net = NET) {
  const cells = new Array(54);
  const dirs = new Array(54);
  for (const face of FACES) {
    const { n, row, col } = FACE_AXES[face];
    net[face].forEach((ids, r) => ids.forEach((idx, c) => {
      cells[idx] = add(add(scale(row, r - 1), scale(col, c - 1)), n);
      dirs[idx] = n;
    }));
  }
  if (cells.some((v) => !v)) throw new Error("net does not cover all 54 facelets");
  const at = new Map();
  for (let i = 0; i < 54; i++) at.set(`${key3(cells[i])}|${key3(dirs[i])}`, i);
  return { cells, dirs, at, net };
}

/** Right-handed rotation of `v` by `theta` about `axis` ("x" | "y" | "z"). */
export function rotate(axis, theta, v) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const [x, y, z] = v;
  if (axis === "x") return [x, c * y - s * z, s * y + c * z];
  if (axis === "y") return [c * x + s * z, y, -s * x + c * z];
  return [c * x - s * y, s * x + c * y, z];
}

/** Snap a rotated cell back to integers (they are always exact multiples). */
const snap = (v) => v.map((n) => Math.round(n));

/**
 * The facelet permutation a move implies, from the cubie model alone, in the
 * engine's SOURCE-map form: `next[j] = prev[perm[j]]`.
 */
export function modelPerm(name, geom) {
  const turn = turnOf(name);
  if (!turn) throw new Error(`unknown move ${JSON.stringify(name)}`);
  const { axis, cells, sense, quarters } = turn;
  const ai = AXIS_INDEX[axis];
  const theta = (sense * Math.PI) / 2 * quarters;

  const byCell = new Map();
  for (let i = 0; i < 54; i++) {
    const k = key3(geom.cells[i]);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(i);
  }

  const perm = Array.from({ length: 54 }, (_, i) => i);
  for (const [k, idxs] of byCell) {
    const cell = k.split(",").map(Number);
    if (!cells.includes(cell[ai])) continue;
    const dest = byCell.get(key3(snap(rotate(axis, theta, cell))));
    for (const i of idxs) {
      const want = key3(snap(rotate(axis, theta, geom.dirs[i])));
      const target = dest.find((j) => key3(geom.dirs[j]) === want);
      perm[target] = i;
    }
  }
  return perm;
}

/**
 * Everything the site needs to animate one token: which axis, which cells,
 * which way, and how many quarter turns.
 */
export function turnOf(name) {
  const m = /^([URFDLBMES])(2|')?$|^([urfdlbxyz])(2|')?$/.exec(name);
  if (!m) return null;
  const family = m[1] || m[3];
  const suffix = m[2] || m[4] || "";
  const spec = FAMILY_TURNS[family];
  if (!spec) return null;
  return { family, axis: spec.axis, cells: spec.cells, sense: spec.sense,
           quarters: POWERS[suffix] };
}

/** Tokenise notation.  Accepts "R", "R'", "R2", "Rw", "M'", "y2", "u". */
/** The modifier a token carries, with the typographic apostrophe normalised. */
const MOD = (s) => (s || "").replace("’", "'");

/** "Rw'" and friends: the engine spells wide turns in lower case. */
const WIDE_TOKEN = /^([URFDLB])[wW](2|'|’)?$/;
/** Every letter the engine names a move with, upper or lower case. */
const PLAIN_TOKEN = /^([URFDLBMESurfdlbxyz])(2|'|’)?$/;

export function tokenize(text) {
  const out = [];
  for (const raw of String(text || "").split(/[\s,]+/)) {
    if (!raw) continue;
    const bare = raw.replace(/[()]/g, "");
    if (!bare) continue;
    const wide = WIDE_TOKEN.exec(bare);
    if (wide) { out.push(wide[1].toLowerCase() + MOD(wide[2])); continue; }
    const plain = PLAIN_TOKEN.exec(bare);
    if (!plain) throw new Error(`"${raw}" is not a move`);
    out.push(plain[1] + MOD(plain[2]));
  }
  return out;
}

/** A scramble that follows the WCA rules: no two turns of the same face in a
 *  row, and never three in a row on the same axis. */
export function scramble(length = 25, rng = Math.random, moves = null) {
  const outer = moves || ["U", "U2", "U'", "R", "R2", "R'", "F", "F2", "F'",
                          "D", "D2", "D'", "L", "L2", "L'", "B", "B2", "B'"];
  const axisOf = (t) => FAMILY_TURNS[t[0]].axis;
  const out = [];
  while (out.length < length) {
    const t = outer[Math.floor(rng() * outer.length)];
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    if (prev && t[0] === prev[0]) continue;
    if (prev && prev2 && axisOf(t) === axisOf(prev) && axisOf(prev) === axisOf(prev2)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Build the model around the engine's own move table.
 *
 * @param {object} engine  parsed `data/engine.json`
 */
export function createModel(engine) {
  const geom = geometry(engine.net || NET);
  const moves = engine.moves.map((m) => ({ ...m, turn: turnOf(m.name) }));
  const byName = new Map(moves.map((m) => [m.name, m]));
  const byId = new Map(moves.map((m) => [m.id, m]));
  const solved = engine.solved
    ? engine.solved.map((c) => FACES[c]).join("")
    : "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

  /** names the site accepts on top of the engine's own: "Rw" -> "r" */
  const alias = new Map(byName);
  for (const m of moves) {
    if (/^[urfdlb]$/.test(m.name)) alias.set(m.name.toUpperCase() + "w", m);
  }

  function move(name) {
    const m = alias.get(name);
    if (!m) throw new Error(`unknown move "${name}"`);
    return m;
  }

  /** `next[j] = prev[perm[j]]` — the engine's own source map. */
  function apply(state, name) {
    const { perm } = move(name);
    let out = "";
    for (let j = 0; j < 54; j++) out += state[perm[j]];
    return out;
  }

  function applyIds(state, ids) {
    for (const id of ids) {
      const { perm } = byId.get(id) || move(id);
      let out = "";
      for (let j = 0; j < 54; j++) out += state[perm[j]];
      state = out;
    }
    return state;
  }

  function parse(text) {
    return tokenize(text).map((t) => move(t));
  }

  function applySeq(state, text) {
    for (const m of parse(text)) state = apply(state, m.name);
    return state;
  }

  /** Notation for a sequence given as engine ids, move objects, or names. */
  function format(seq) {
    return seq.map((m) => nameOf(m)).join(" ");
  }

  function nameOf(m) {
    if (typeof m === "string") return m;
    if (typeof m === "number") return byId.get(m).name;
    return m.name;
  }

  function invert(seq) {
    const names = seq.map((m) => nameOf(m));
    return names.slice().reverse().map((n) => (n.endsWith("2") ? n : n.endsWith("'") ? n.slice(0, -1) : n + "'"));
  }

  /** Is every facelet its own face colour, centres included? */
  function isSolved(state) {
    return state === solved;
  }

  /** How many of the last-layer stickers are already home. */
  function lastLayerProgress(state) {
    let oriented = 0;
    for (const i of geom.net.U.flat()) if (state[i] === "U") oriented++;
    for (const face of ["F", "R", "B", "L"]) {
      if (state[geom.net[face][0][1]] === face) oriented++;
    }
    return oriented / 13;
  }

  /** Cross-check the drawing model against the engine's permutations. */
  function selfCheck() {
    const bad = [];
    for (const m of moves) {
      const mine = modelPerm(m.name, geom);
      for (let j = 0; j < 54; j++) {
        if (mine[j] !== m.perm[j]) {
          bad.push({ move: m.name, facelet: j, model: mine[j], engine: m.perm[j] });
          break;
        }
      }
    }
    return { checked: moves.length, mismatches: bad, ok: bad.length === 0 };
  }

  return {
    engine, geom, moves, byName, byId, solved,
    move, nameOf, apply, applyIds, applySeq, parse, format, invert, isSolved,
    lastLayerProgress, selfCheck,
    facelets: geom,
  };
}
