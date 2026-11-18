/**
 * Khối trong trình duyệt: 26 khối nhỏ bằng CSS 3-D, hoạt hình từng cú xoay,
 * kèm bản xem phẳng cho các bài bạn muốn đọc hơn là cầm.
 *
 * Màu luôn đến từ trạng thái 54 dán, và trạng thái luôn di chuyển theo
 * hoán vị của chính engine (`data/engine.json`). Cú quay bạn *nhìn thấy* được
 * tính từ cùng tọa độ ô/hướng mà bộ kiểm tra Python đối chiếu với tất cả 54
 * hoán vị engine, nên hình và trạng thái không thể bất đồng.
 */
import { AXIS_INDEX, FACE_COLOUR, key3, rotate, turnOf, CUBIE_CELLS } from "./model.js";
import { el, mount } from "./util.js";

/** Thế giới (x phải, y lên, z ra trước) -> CSS (x phải, y xuống, z ra trước). */
const S = [1, -1, 1];

function rotationMatrix(axis, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (axis === "x") return [[1, 0, 0], [0, c, -s], [0, s, c]];
  if (axis === "y") return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

/** Chuỗi CSS `matrix3d(...)` cho một phép quay trong thế giới. */
export function cssMatrix(R) {
  const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => S[i] * R[i][j] * S[j]));
  return `matrix3d(${m[0][0]},${m[1][0]},${m[2][0]},0,` +
                 `${m[0][1]},${m[1][1]},${m[2][1]},0,` +
                 `${m[0][2]},${m[1][2]},${m[2][2]},0,0,0,0,1)`;
}

/** Các hướng, đặt tên theo cách stylesheet đặt tên các phần tử dán. */
const DIRS = [
  { d: [0, 1, 0], cls: "y" },    // U
  { d: [0, -1, 0], cls: "ny" },  // D
  { d: [1, 0, 0], cls: "x" },    // R
  { d: [-1, 0, 0], cls: "nx" },  // L
  { d: [0, 0, 1], cls: "z" },    // F
  { d: [0, 0, -1], cls: "nz" },  // B
];

const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export class CubeView {
  /**
   * @param {HTMLElement} host  phần tử vẽ vào
   * @param {object} opts      { model, state, size, view, highlight, interactive, speed, onTurn }
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.model = opts.model;
    this.geom = opts.model.geom;
    this.state = opts.state || opts.model.solved;
    this.size = opts.size || 240;
    this.view = opts.view || "3d";
    this.highlight = opts.highlight || "none";
    this.interactive = opts.interactive !== false;
    this.speed = opts.speed === undefined ? 220 : opts.speed;
    this.onTurn = opts.onTurn || null;
    this.yaw = opts.yaw === undefined ? -34 : opts.yaw;
    this.pitch = opts.pitch === undefined ? -24 : opts.pitch;
    this.queue = [];
    this.running = false;
    this.cancelled = false;
    this.busy = false;

    this.root = el("div", { class: "cube" });
    mount(host, this.root);
    this.build();
    this.render();
  }

  /* ------------------------------------------------------------- cấu trúc */

  build() {
    const cs = Math.round(this.size / 3.35);
    this.cell = cs;
    this.root.style.setProperty("--cs", `${cs}px`);
    this.root.style.width = `${this.size}px`;
    this.root.style.height = `${this.size}px`;

    if (this.view === "net") {
      this.buildNet();
      return;
    }

    this.stage = el("div", { class: "cube__stage" });
    this.scene = el("div", { class: "cube__scene" });
    this.stage.append(this.scene);
    mount(this.root, this.stage);

    // một phần tử trên mỗi ô khối nhỏ, sáu mặt dán mỗi khối
    this.cubies = CUBIE_CELLS.map((cell) => {
      const stickers = {};
      const node = el("div", { class: "cubie", dataset: { cell: key3(cell) } });
      for (const { d, cls } of DIRS) {
        const face = el("i", { class: `st st--${cls}` });
        stickers[key3(d)] = face;
        node.append(face);
      }
      this.scene.append(node);
      return { cell, node, stickers };
    });
    this.byCell = new Map(this.cubies.map((c) => [key3(c.cell), c]));
    this.applyView();

    if (this.interactive) this.bindDrag();
  }

  buildNet() {
    const net = this.geom.net;
    const areas = [[".", "U", ".", "."], ["L", "F", "R", "B"], [".", "D", ".", "."]];
    const grid = el("div", { class: "net" });
    grid.style.gridTemplateAreas = areas
      .map((row) => `"${row.join(" ")}"`)
      .join(" ");
    this.netFaces = {};
    for (const face of "URFDLB") {
      const box = el("div", { class: `net__face net__face--${face}`,
                              style: { gridArea: face } });
      const cells = [];
      net[face].forEach((row) => row.forEach((idx) => {
        const st = el("i", { class: "net__st" });
        box.append(st);
        cells.push({ idx, node: st });
      }));
      this.netFaces[face] = cells;
      grid.append(box);
    }
    mount(this.root, grid);
  }

  bindDrag() {
    let drag = null;
    const stage = this.stage;
    stage.classList.add("is-draggable");
    stage.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("is-dragging");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.yaw = drag.yaw + (e.clientX - drag.x) * 0.5;
      this.pitch = Math.max(-89, Math.min(89, drag.pitch - (e.clientY - drag.y) * 0.5));
      this.applyView();
    });
    const end = (e) => {
      if (!drag) return;
      drag = null;
      stage.classList.remove("is-dragging");
      try { stage.releasePointerCapture(e.pointerId); } catch { /* đã thả */ }
      if (this.onViewChange) this.onViewChange(this.yaw, this.pitch);
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
  }

  applyView() {
    if (!this.scene) return;
    this.scene.style.transform = `rotateX(${this.pitch}deg) rotateY(${this.yaw}deg)`;
  }

  setOrientation(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.applyView();
  }

  /* ---------------------------------------------------------------- tô */

  /** Tô lại mọi dán từ trạng thái 54 dán hiện tại. */
  render() {
    if (this.view === "net") {
      for (const face of "URFDLB") {
        for (const { idx, node } of this.netFaces[face]) {
          node.style.setProperty("--c", FACE_COLOUR[this.state[idx]]);
          node.classList.toggle("is-dim", this.dimmed(idx));
        }
      }
      return;
    }
    for (const cubie of this.cubies) {
      const ck = key3(cubie.cell);
      for (const { d, cls } of DIRS) {
        const node = cubie.stickers[key3(d)];
        const idx = this.geom.at.get(`${ck}|${key3(d)}`);
        if (idx === undefined) {
          node.className = `st st--${cls} st--inner`;
          node.style.removeProperty("--c");
          continue;
        }
        node.className = `st st--${cls}`;
        node.style.setProperty("--c", FACE_COLOUR[this.state[idx]]);
        node.classList.toggle("is-dim", this.dimmed(idx));
      }
      cubie.node.style.transform = this.baseTransform(cubie.cell);
    }
  }

  /** Những dán bị chế độ highlight hiện tại để mờ đi. */
  dimmed(idx) {
    if (this.highlight !== "ll") return false;
    const net = this.geom.net;
    if (net.U.flat().includes(idx)) return false;
    for (const face of ["F", "R", "B", "L"]) if (net[face][0].includes(idx)) return false;
    return true;
  }

  baseTransform(cell) {
    const s = this.cell;
    return `translate3d(${cell[0] * s}px, ${-cell[1] * s}px, ${cell[2] * s}px)`;
  }

  /* ---------------------------------------------------------------- trạng thái */

  setState(state, opts = {}) {
    this.state = state;
    if (!opts.keepTransform) this.render();
    return this;
  }

  getState() {
    return this.state;
  }

  setView(view) {
    if (view === this.view) return;
    this.view = view;
    this.build();
    this.render();
  }

  setSize(size) {
    this.size = size;
    this.build();
    this.render();
  }

  reset() {
    this.stop();
    this.setState(this.model.solved);
  }

  /* ---------------------------------------------------------------- xoay */

  /** Một cú xoay, có hoạt hình. Hoàn tất khi các khối nhỏ đã yên. */
  turn(name, ms = this.speed) {
    const spec = turnOf(name);
    if (!spec) return Promise.reject(new Error(`không rõ động tác ${name}`));
    const nextState = this.model.apply(this.state, name);
    if (!this.scene || ms <= 0 || this.model.engine.reducedMotion) {
      this.state = nextState;
      this.render();
      if (this.onTurn) this.onTurn(name, this.state);
      return Promise.resolve();
    }
    const ai = AXIS_INDEX[spec.axis];
    const moving = this.cubies.filter((c) => spec.cells.includes(c.cell[ai]));
    // cú prime đi đường ngắn: 270 độ một chiều là 90 độ chiều kia
    const steps = spec.quarters === 3 ? -1 : spec.quarters;
    const total = spec.sense * steps * (Math.PI / 2);
    const start = performance.now();
    this.busy = true;

    return new Promise((resolve) => {
      const frame = (now) => {
        if (this.cancelled) {
          this.state = nextState;
          this.busy = false;
          this.render();
          resolve();
          return;
        }
        const u = Math.min(1, (now - start) / Math.max(1, ms));
        const theta = total * easeInOut(u);
        const mat = cssMatrix(rotationMatrix(spec.axis, theta));
        for (const c of moving) {
          c.node.style.transform = `${mat} ${this.baseTransform(c.cell)}`;
        }
        if (u < 1) {
          requestAnimationFrame(frame);
          return;
        }
        this.state = nextState;
        this.busy = false;
        this.render();
        if (this.onTurn) this.onTurn(name, this.state);
        resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  /** Chơi một chuỗi, từng cú xoay một. `tokens` có thể là tên hoặc id engine. */
  async play(tokens, opts = {}) {
    const names = tokens.map((t) => (typeof t === "number" ? this.model.byId.get(t).name : t));
    const ms = opts.ms === undefined ? this.speed : opts.ms;
    this.cancelled = false;
    this.running = true;
    let i = 0;
    for (const name of names) {
      if (!this.running) break;
      await this.turn(name, ms);
      i++;
      if (opts.onStep) opts.onStep(i, name, names.length);
    }
    this.running = false;
    return i;
  }

  stop() {
    this.running = false;
    this.cancelled = true;
  }

  get isPlaying() {
    return this.running;
  }
}
