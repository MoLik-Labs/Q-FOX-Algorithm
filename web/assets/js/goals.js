/**
 * The family goals, as the browser can check them.
 *
 * `scripts/gen_web_data.py` proves every published algorithm reaches its goal
 * using the engine's own coordinate tables.  The trainer needs the same answer
 * for an algorithm *you* typed, offline, so the goal is restated here in terms
 * of the 54 facelets — the one thing the export carries in full.  The two
 * agree by construction: a last layer is oriented exactly when every U-face
 * facelet shows the U colour, corners are solved exactly when their twelve
 * stickers match the solved cube, and so on.
 */

const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Facelet indices of the last layer, split into corners and edges. */
export function lastLayerParts(model) {
  const geom = model.geom;
  const corners = [];
  const edges = [];
  for (let i = 0; i < 54; i++) {
    const [x, y, z] = geom.cells[i];
    if (y !== 1) continue;
    if (geom.dirs[i][1] === 1) continue;      // the U-face sticker, handled below
    if (Math.abs(x) === 1 && Math.abs(z) === 1) corners.push(i);
    else edges.push(i);
  }
  // the four U-face corner stickers belong with the corners
  for (const i of [0, 2, 6, 8]) corners.push(i);
  for (const i of [1, 3, 5, 7]) edges.push(i);
  return { corners, edges };
}

export const GOAL_TEXT = {
  OLL: "every last-layer sticker facing up",
  PLL: "the whole cube solved",
  CLL: "corners solved, edges oriented",
  COLL: "corners solved, edges oriented",
  ELL: "the whole cube solved (corners are already home)",
};

/** The four U-layer edge stickers that sit on the U face itself. */
const U_EDGE_TOP = [1, 3, 5, 7];

export function edgesOriented(state) {
  return U_EDGE_TOP.every((i) => state[i] === "U");
}

/**
 * Does `state` satisfy the goal of `family`?
 *
 * @param {string} family  OLL | PLL | CLL | COLL | ELL
 * @param {string} state   54 facelets
 * @param {object} model   from createModel()
 */
export function goalReached(family, state, model) {
  const solved = model.solved;
  if (family === "PLL") return state === solved;
  if (family === "OLL") return U_FACE.every((i) => state[i] === "U");
  const { corners, edges } = lastLayerParts(model);
  if (family === "CLL" || family === "COLL") {
    // the engine's goal is (LL_CORNERS, EO_LL): corners home, and the four
    // top edges still oriented -- which is what "on the U face" means here
    return corners.every((i) => state[i] === solved[i]) && edgesOriented(state);
  }
  if (family === "ELL") {
    return edges.every((i) => state[i] === solved[i]);
  }
  return model.isSolved(state);
}

/** The same test after one extra turn of the U face — "right answer, wrong AUF". */
export function goalUpToAuf(family, state, model) {
  for (const auf of ["U", "U2", "U'"]) {
    if (goalReached(family, model.apply(state, auf), model)) return auf;
  }
  return null;
}
