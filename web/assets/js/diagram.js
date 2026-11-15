/**
 * Flat case diagrams.
 *
 * A card grid cannot carry 58 animated 3-D cubes, and does not need to: to
 * recognise a case you look at the top face and the skirt of side stickers
 * around it.  That is what this draws, as inline SVG, straight from the
 * 54-facelet state the engine published — positioned from the same cell and
 * direction geometry the 3-D cube uses, so the two views can never disagree.
 */
import { FACE_COLOUR, NET, geometry, key3 } from "./model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const GEOM = geometry(NET);

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** The 21 top-layer facelets, as { index, cell, dir }. */
export const TOP_LAYER = (() => {
  const out = [];
  for (let i = 0; i < 54; i++) {
    if (GEOM.cells[i][1] === 1) out.push({ index: i, cell: GEOM.cells[i], dir: GEOM.dirs[i] });
  }
  return out;
})();

/**
 * The last layer seen from above: the U face with the side stickers that show
 * above the F, R, B and L faces.
 *
 * @param {string} state  54 facelets in engine order (U R F D L B)
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

  // In the 5x5 top view the U face fills rows and columns 1..3, with the front
  // of the cube at the bottom: col = x + 2, row = z + 2.  Without the skirt the
  // U face fills the whole 3x3 box instead.
  const base = skirt ? 2 : 1;
  for (const f of TOP_LAYER) {
    const [x, , z] = f.cell;
    const [dx, dy, dz] = f.dir;
    let col, row;
    if (dy === 1) {                 // on the U face itself
      col = x + base;
      row = z + base;
    } else if (!skirt) {
      continue;
    } else if (dz === 1) {          // shows on F, drawn below the U face
      col = x + 2; row = 4;
    } else if (dz === -1) {         // shows on B, drawn above
      col = x + 2; row = 0;
    } else if (dx === 1) {          // shows on R, drawn to the right
      col = 4; row = z + 2;
    } else {                        // shows on L, drawn to the left
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

/** The whole cube unfolded, laid out the way engine.json lays the net out. */
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

/** One face on its own, for the notation helper. */
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
