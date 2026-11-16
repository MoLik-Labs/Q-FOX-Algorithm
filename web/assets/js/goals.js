/**
 * Mục tiêu của từng họ bài, theo cách trình duyệt có thể kiểm tra.
 *
 * `scripts/gen_web_data.py` chứng minh mọi thuật toán được xuất bản đều
 * đạt đúng mục tiêu bằng bảng tọa độ của engine. Bài luyện tập cần câu
 * trả lời tương tự cho thuật toán *bạn* tự nhập, offline, nên mục tiêu được
 * diễn lại ở đây theo 54 dán — thứ duy nhất bản xuất mang đủ. Hai bên khớp
 * nhau theo cấu trúc: lớp cuối xác định hướng khi mọi dán mặt U đều màu U,
 * các góc đã giải khi 12 dán của chúng khớp với khối hoàn chỉnh, v.v.
 */

const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Các chỉ số dán của lớp cuối, chia thành góc và cạnh. */
export function lastLayerParts(model) {
  const geom = model.geom;
  const corners = [];
  const edges = [];
  for (let i = 0; i < 54; i++) {
    const [x, y, z] = geom.cells[i];
    if (y !== 1) continue;
    if (geom.dirs[i][1] === 1) continue;      // dán trên mặt U, xử lý ở dưới
    if (Math.abs(x) === 1 && Math.abs(z) === 1) corners.push(i);
    else edges.push(i);
  }
  // 4 dán góc trên mặt U thuộc về nhóm góc
  for (const i of [0, 2, 6, 8]) corners.push(i);
  for (const i of [1, 3, 5, 7]) edges.push(i);
  return { corners, edges };
}

export const GOAL_TEXT = {
  OLL: "mọi dán lớp cuối quay lên trên",
  PLL: "khối hoàn chỉnh",
  CLL: "góc đã giải, cạnh đã xác định hướng",
  COLL: "góc đã giải, cạnh đã xác định hướng",
  ELL: "khối hoàn chỉnh (góc đã ở nhà)",
};

/** 4 dán cạnh lớp trên nằm trên chính mặt U. */
const U_EDGE_TOP = [1, 3, 5, 7];

export function edgesOriented(state) {
  return U_EDGE_TOP.every((i) => state[i] === "U");
}

/**
 * Trạng thái `state` có đạt mục tiêu của họ `family` không?
 *
 * @param {string} family  OLL | PLL | CLL | COLL | ELL
 * @param {string} state   54 dán
 * @param {object} model   từ createModel()
 */
export function goalReached(family, state, model) {
  const solved = model.solved;
  if (family === "PLL") return state === solved;
  if (family === "OLL") return U_FACE.every((i) => state[i] === "U");
  const { corners, edges } = lastLayerParts(model);
  if (family === "CLL" || family === "COLL") {
    // mục tiêu của engine là (LL_CORNERS, EO_LL): góc về chỗ, và 4 cạnh trên
    // vẫn xác định hướng -- chính là ý nghĩa của "nằm trên mặt U" ở đây
    return corners.every((i) => state[i] === solved[i]) && edgesOriented(state);
  }
  if (family === "ELL") {
    return edges.every((i) => state[i] === solved[i]);
  }
  return model.isSolved(state);
}

/** Kiểm tra tương tự sau một cú xoay mặt U thêm -- "đúng, nhưng AUF sai". */
export function goalUpToAuf(family, state, model) {
  for (const auf of ["U", "U2", "U'"]) {
    if (goalReached(family, model.apply(state, auf), model)) return auf;
  }
  return null;
}
