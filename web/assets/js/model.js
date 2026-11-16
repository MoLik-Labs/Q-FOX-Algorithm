/**
 * Mô hình khối Q-FOX -- logic thuần, không DOM, không engine, không cài đặt gì.
 *
 * Engine (`engine/qfox.c`) vẫn là nguồn chân lý: mọi động tác trang có thể
 * thực hiện đều đến từ `data/engine.json`, mang 54 hoán vị dán do chính
 * engine C báo cáo. Module này chỉ bổ sung hai thứ trình duyệt cần mà JSON
 * không thể chứa:
 *
 *   1. **mỗi dán ở đâu** -- ô của lưới 3×3×3 mà nó thuộc và hướng nó
 *      hướng, để khối được vẽ thành 26 khối nhỏ thay vì một chuỗi phẳng;
 *   2. **một cú xoay di chuyển các ô đó thế nào** -- trục, các ô bị lấy
 *      và chiều xoay, để một lớp có thể được hoạt hình thay vì dịch vị trí.
 *
 * Cả hai đều được đối chiếu với hoán vị của chính engine: ở đây tại thời
 * điểm chạy (`selfCheck()`) và trong `web/test/model.test.mjs` dưới node.
 * Nếu hai bên không khớp, trang sẽ nói rõ thay vì im lặng vẽ sai khối.
 */

export const FACES = "URFDLB";

/** mặt -> pháp tuyến hướng ra, chiều hàng chạy, chiều cột chạy */
export const FACE_AXES = {
  U: { n: [0, 1, 0], row: [0, 0, 1], col: [1, 0, 0] },   // hàng về F, cột về R
  F: { n: [0, 0, 1], row: [0, -1, 0], col: [1, 0, 0] },  // hàng về D, cột về R
  R: { n: [1, 0, 0], row: [0, -1, 0], col: [0, 0, -1] }, // cột về B
  B: { n: [0, 0, -1], row: [0, -1, 0], col: [-1, 0, 0] },// cột về L
  L: { n: [-1, 0, 0], row: [0, -1, 0], col: [0, 0, 1] }, // cột về F
  D: { n: [0, -1, 0], row: [0, 0, -1], col: [1, 0, 0] }, // hàng về B, cột về R
};

/** Lưới mở ra, các chỉ số dán theo từng mặt, hàng theo hàng. engine.json
 * mang bảng tương tự; bản sao này chỉ để mô hình có thể test độc lập. */
export const NET = {
  U: [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
  L: [[36, 37, 38], [39, 40, 41], [42, 43, 44]],
  F: [[18, 19, 20], [21, 22, 23], [24, 25, 26]],
  R: [[9, 10, 11], [12, 13, 14], [15, 16, 17]],
  B: [[45, 46, 47], [48, 49, 50], [51, 52, 53]],
  D: [[27, 28, 29], [30, 31, 32], [33, 34, 35]],
};

/**
 * họ động tác -> { axis, cells, sense }
 *
 * `cells` là các lớp bị lấy, theo tọa độ trên `axis`
 * (x = R-L, y = U-D, z = F-B). `sense` là sin(theta): -1 cho cú quay
 * 90° theo chiều kim đồng hồ nhìn từ đầu dương của trục, chính là ý nghĩa
 * của mọi cú xoay mặt, và M/E/S hay các cú wide kế thừa từ L/D/F.
 */
export const FAMILY_TURNS = {
  U: { axis: "y", cells: [1], sense: -1 },
  D: { axis: "y", cells: [-1], sense: 1 },
  R: { axis: "x", cells: [1], sense: -1 },
  L: { axis: "x", cells: [-1], sense: 1 },
  F: { axis: "z", cells: [1], sense: -1 },
  B: { axis: "z", cells: [-1], sense: 1 },
  M: { axis: "x", cells: [0], sense: 1 },      // theo L
  E: { axis: "y", cells: [0], sense: 1 },      // theo D
  S: { axis: "z", cells: [0], sense: -1 },     // theo F
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

/** mỗi hậu tố nghĩa là bao nhiêu bước quarter-turn */
export const POWERS = { "": 1, "2": 2, "'": 3 };

/** Màu theo mặt. Chuẩn rubik, và thứ tự mặt engine dùng
 * (U R F D L B) được viết dựa trên đó. */
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

/** 26 ô khối nhỏ, x = R-L, y = U-D, z = F-B */
export const CUBIE_CELLS = CELLS;

export const key3 = (v) => `${v[0]},${v[1]},${v[2]}`;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/**
 * Tịa trị dán: với mỗi trong 54 dán, ô khối nhỏ nó thuộc và hướng nó hướng.
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
  if (cells.some((v) => !v)) throw new Error("net không phủ đủ 54 dán");
  const at = new Map();
  for (let i = 0; i < 54; i++) at.set(`${key3(cells[i])}|${key3(dirs[i])}`, i);
  return { cells, dirs, at, net };
}

/** Quay tay phải vector `v` góc `theta` quanh `axis` ("x" | "y" | "z"). */
export function rotate(axis, theta, v) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const [x, y, z] = v;
  if (axis === "x") return [x, c * y - s * z, s * y + c * z];
  if (axis === "y") return [c * x + s * z, y, -s * x + c * z];
  return [c * x - s * y, s * x + c * y, z];
}

/** Nén một ô đã quay về số nguyên (luôn là bội số chính xác). */
const snap = (v) => v.map((n) => Math.round(n));

/**
 * Hoán vị dán do một động tác ngụ ý, từ mô hình khối nhỏ thuần, ở dạng
 * SOURCE-map của engine: `next[j] = prev[perm[j]]`.
 */
export function modelPerm(name, geom) {
  const turn = turnOf(name);
  if (!turn) throw new Error(`động tác không rõ ${JSON.stringify(name)}`);
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
 * Mọi thứ trang cần để hoạt hình một token: trục nào, lớp nào, chiều nào,
 * và bao nhiêu bước quarter-turn.
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

/** Tách ký hiệu động tác. Nhận "R", "R'", "R2", "Rw", "M'", "y2", "u". */
/** Hậu tố của một token, với dấu nháy dạng in được chuẩn hóa. */
const MOD = (s) => (s || "").replace("’", "'");

/** "Rw'" và tương tự: engine viết cú wide ở chữ thường. */
const WIDE_TOKEN = /^([URFDLB])[wW](2|'|’)?$/;
/** Mọi chữ cái engine dùng để đặt tên động tác, in hoa hoặc thường. */
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
    if (!plain) throw new Error(`"${raw}" không phải một động tác`);
    out.push(plain[1] + MOD(plain[2]));
  }
  return out;
}

/** Một cú trộn theo luật WCA: không có hai cú xoay mặt giống nhau liền
 * nhau, và không có ba cú liên tiếp trên cùng một trục. */
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
 * Xây mô hình trên bảng động tác của chính engine.
 *
 * @param {object} engine  engine.json đã parse
 */
export function createModel(engine) {
  const geom = geometry(engine.net || NET);
  const moves = engine.moves.map((m) => ({ ...m, turn: turnOf(m.name) }));
  const byName = new Map(moves.map((m) => [m.name, m]));
  const byId = new Map(moves.map((m) => [m.id, m]));
  const solved = engine.solved
    ? engine.solved.map((c) => FACES[c]).join("")
    : "U".repeat(9) + "R".repeat(9) + "F".repeat(9) + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

  /** các tên trang chấp nhận ngoài tên engine: "Rw" -> "r" */
  const alias = new Map(byName);
  for (const m of moves) {
    if (/^[urfdlb]$/.test(m.name)) alias.set(m.name.toUpperCase() + "w", m);
  }

  function move(name) {
    const m = alias.get(name);
    if (!m) throw new Error(`không rõ động tác "${name}"`);
    return m;
  }

  /** `next[j] = prev[perm[j]]` — bản đồ nguồn của chính engine. */
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

  /** Ký hiệu cho một chuỗi dưới dạng id engine, object động tác, hoặc tên. */
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

  /** Mọi dán đều là màu mặt của nó, kể cả trung tâm? */
  function isSolved(state) {
    return state === solved;
  }

  /** Có bao nhiêu dán lớp cuối đã ở nhà. */
  function lastLayerProgress(state) {
    let oriented = 0;
    for (const i of geom.net.U.flat()) if (state[i] === "U") oriented++;
    for (const face of ["F", "R", "B", "L"]) {
      if (state[geom.net[face][0][1]] === face) oriented++;
    }
    return oriented / 13;
  }

  /** Đối chiếu mô hình vẽ với hoán vị của engine. */
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
