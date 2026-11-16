/**
 * Sơ đồ bài phẳng.
 *
 * Một lưới bài không thể mang 58 khối 3-D đang hoạt hình, và cũng không cần:
 * để nhận dạng một bài bạn nhìn mặt trên và vành các dán bên quanh nó. Đây
 * chính là thứ được vẽ, dưới dạng SVG nội tuyến, thẳng từ trạng thái
 * 54 dán engine đã xuất bản -- vị trí tính từ cùng tọa độ ô/hướng mà khối
 * 3-D dùng, nên hai cách xem không bao giờ bất đồng.
 */
import { FACE_COLOUR, NET, geometry, key3 } from "./model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const GEOM = geometry(NET);

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** 21 dán lớp trên, dưới dạng { index, cell, dir }. */
export const TOP_LAYER = (() => {
  const out = [];
  for (let i = 0; i < 54; i++) {
    if (GEOM.cells[i][1] === 1) out.push({ index: i, cell: GEOM.cells[i], dir: GEOM.dirs[i] });
  }
  return out;
})();

/**
 * Lớp cuối nhìn từ trên xuống: mặt U với các dán bên hiển thị phía trên
 * các mặt F, R, B và L.
 *
 * @param {string} state  54 dán theo thứ tự engine (U R F D L B)
 * @param {object} opts   { size, skirt, marks }
 */
export function topLayer(state, opts = {}) {
  const size = opts.size || 104;
  const skirt = opts.skirt !== false;
  const grid = skirt ? 5 : 3;
  const cell = size / grid;
  const pad = Math.max(0.75, cell * 0.08);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${size} ${size}`, width: size, height: size,
    class: "diagram", role: "img",
  });
  svg.append(svgEl("rect", {
    x: 0, y: 0, width: size, height: size, rx: cell * 0.3, class: "diagram__plate",
  }));

  // Trong lưới 5x5 nhìn từ trên, mặt U chiếm hàng và cột 1..3, với phía
  // trước của khối ở dưới: col = x + 2, row = z + 2. Không có vành thì
  // mặt U chiếm trọn ô 3x3.
  const base = skirt ? 2 : 1;
  for (const f of TOP_LAYER) {
    const [x, , z] = f.cell;
    const [dx, dy, dz] = f.dir;
    let col, row;
    if (dy === 1) {                 // trên chính mặt U
      col = x + base;
      row = z + base;
    } else if (!skirt) {
      continue;
    } else if (dz === 1) {          // hiện trên F, vẽ dưới mặt U
      col = x + 2; row = 4;
    } else if (dz === -1) {         // hiện trên B, vẽ trên
      col = x + 2; row = 0;
    } else if (dx === 1) {          // hiện trên R, vẽ bên phải
      col = 4; row = z + 2;
    } else {                        // hiện trên L, vẽ bên trái
      col = 0; row = z + 2;
    }
    const px = col * cell;
    const py = row * cell;
    svg.append(svgEl("rect", {
      x: px + pad, y: py + pad,
      width: cell - pad * 2, height: cell - pad * 2,
      rx: cell * 0.2,
      fill: FACE_COLOUR[state[f.index]] || "#333",
      class: `diagram__st diagram__st--${dy === 1 ? "top" : "side"}`,
    }));
  }
  return svg;
}

/** Toàn bộ khối mở ra, trình bày như engine.json trình bày lưới. */
export function netDiagram(state, opts = {}) {
  const cell = opts.cell || 17;
  const gap = opts.gap === undefined ? cell * 0.18 : opts.gap;
  const step = cell + gap;
  const origin = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const w = 4 * step - gap;
  const h = 3 * step - gap;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: "diagram diagram--net",
    role: "img",
  });
  for (const face of "URFDLB") {
    const [ox, oy] = origin[face];
    NET[face].forEach((row, r) => row.forEach((idx, c) => {
      svg.append(svgEl("rect", {
        x: ox * step + c * step, y: oy * step + r * step,
        width: cell, height: cell, rx: cell * 0.18,
        fill: FACE_COLOUR[state[idx]] || "#333",
        class: "diagram__st",
      }));
    }));
  }
  return svg;
}

/** Một mặt riêng, cho bộ trợ ký hiệu. */
export function faceDiagram(state, face, opts = {}) {
  const cell = opts.cell || 22;
  const gap = cell * 0.14;
  const size = 3 * cell;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "diagram",
    "aria-hidden": "true",
  });
  NET[face].forEach((row, r) => row.forEach((idx, c) => {
    svg.append(svgEl("rect", {
      x: c * cell + gap / 2, y: r * cell + gap / 2,
      width: cell - gap, height: cell - gap, rx: cell * 0.16,
      fill: FACE_COLOUR[state[idx]] || "#333",
    }));
  }));
  return svg;
}

export const cellKey = key3;
