/**
 * Khởi động và điều hướng.
 *
 * Chỉ dùng route bằng hash, nên trang là một tập file tĩnh hoạt động trên
 * Cloudflare Pages, `python3 -m http.server`, hay bất kỳ thứ gì phục vụ
 * một thư mục — không rewrite, không build, không render phía máy chủ.
 */
import { loadAll, data, totals } from "./data.js";
import { el, mount, chip, toast, debounce } from "./util.js";
import { learnedCount, onChange as onStoreChange, settings, setSetting, exportAll, importAll } from "./store.js";
import { download } from "./util.js";
import { refresh as refreshMotion } from "../css/taste/motion.js";

import * as home from "./views/home.js";
import * as levels from "./views/levels.js";
import * as algorithms from "./views/algorithms.js";
import * as trainer from "./views/trainer.js";
import * as records from "./views/records.js";
import * as methods from "./views/methods.js";
import * as benchmark from "./views/benchmark.js";
import * as engine from "./views/engine.js";
import * as about from "./views/about.js";

const ROUTES = {
  home: { mod: home, title: "Trang chủ" },
  levels: { mod: levels, title: "Cấp độ" },
  algorithms: { mod: algorithms, title: "Thuật toán" },
  trainer: { mod: trainer, title: "Luyện tập" },
  records: { mod: records, title: "Kỷ lục" },
  methods: { mod: methods, title: "Phương pháp" },
  benchmark: { mod: benchmark, title: "Benchmark" },
  engine: { mod: engine, title: "Ký hiệu & engine" },
  about: { mod: about, title: "Giới thiệu" },
};

const viewHost = document.getElementById("view");
const boot = document.getElementById("boot");
const nav = document.getElementById("nav");
const searchInput = document.getElementById("search");
const topMeta = document.getElementById("top-meta");
const sideProgress = document.getElementById("side-progress");

let current = null;

/* ---------------------------------------------------------------- điều hướng */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  const query = {};
  for (const pair of (queryPart || "").split("&")) {
    if (!pair) continue;
    const [k, v] = pair.split("=");
    query[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
  }
  const name = parts[0] || "home";
  return { name: ROUTES[name] ? name : "home", params: { key: parts[1], name: parts[1], family: parts[1] }, query };
}

function navigate() {
  const { name, params, query } = parseHash();
  const route = ROUTES[name];

  if (current && current.destroy) { try { current.destroy(); } catch { /* view đã bị xoá */ } }
  document.body.classList.remove("nav-open");
  document.getElementById("menu").setAttribute("aria-expanded", "false");

  [...nav.children].forEach((a) => a.classList.toggle("is-active", a.dataset.route === name));

  mount(viewHost, el("div", { class: "spinner-wrap" }, el("div", { class: "spinner" }), el("p", {}, "Đang vẽ…")));

  let out;
  try {
    out = route.mod.render(params, query) || {};
  } catch (err) {
    console.error(err);
    out = { node: el("div", { class: "panel" },
      el("h2", {}, "Màn này không vẽ được"),
      el("pre", { class: "code" }, String(err && err.stack || err)),
      el("p", { class: "small muted" }, "Dữ liệu ổn — đây là lỗi của trang. Làm lại, nếu vẫn vậy hãy báo lỗi bằng văn bản trên.")) };
  }
  const node = out.node || out;
  mount(viewHost, node);
  current = out;

  document.title = `${route.title} · Q-FOX Algorithm`;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (out.focus) setTimeout(() => out.focus.focus(), 60);
  drawSideProgress();
  try { refreshMotion(); } catch { /* motion layer optional */ }
}

/* --------------------------------------------------- giao diện và trạng thái */

function drawSideProgress() {
  if (!data.ready) return;
  const keys = data.cases.map((c) => c.key);
  const done = learnedCount(keys);
  mount(sideProgress,
    el("div", { class: "tiny", style: { marginBottom: "4px" } },
      `${done} / ${keys.length} thuật toán đã thuộc`),
    el("div", { class: "progress", style: { height: "8px" } },
      el("div", { class: "progress__bar", style: { width: `${(100 * done) / Math.max(1, keys.length)}%` } })),
    el("div", { class: "row row--tight", style: { marginTop: "8px" } },
      el("button", { class: "btn btn--sm btn--ghost", type: "button",
                     onClick: () => download("qfox-progress.json", exportAll()) }, "Xuất"),
      el("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: pickImport }, "Nhập")));
}

function pickImport() {
  const input = el("input", { type: "file", accept: "application/json", style: { display: "none" } });
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const counts = importAll(await file.text());
      toast(`Đã nhập: ${counts.learned} bài thuộc, ${counts.reviewed} bài luyện`, "ok");
      navigate();
    } catch (err) {
      toast(`Nhập thất bại: ${err.message}`, "err");
    }
    input.remove();
  };
  document.body.append(input);
  input.click();
}

function drawTopMeta() {
  const t = totals();
  mount(topMeta,
    el("span", { class: "dot", title: "đã tải dữ liệu" }),
    el("span", {}, `${t.cases} bài`),
    el("span", { class: "tiny" }, "·"),
    el("span", {}, `${t.methods} phương pháp`),
    el("span", { class: "tiny" }, "·"),
    chip(data.check.ok ? "đã kiểm chứng" : "mô hình bất đồng", data.check.ok ? "mint" : "rose"));
}

/* --------------------------------------------------------------- phím tắt */

document.addEventListener("keydown", (e) => {
  const typing = e.target.matches("input, textarea, select");
  if (e.key === "/" && !typing) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  } else if (e.key === "Escape" && document.activeElement === searchInput) {
    searchInput.blur();
  } else if (e.key.toLowerCase() === "g" && !typing) {
    // g rồi một chữ, theo thói quen của công cụ thiên về bàn phím
    pendingG = Date.now();
  } else if (pendingG && Date.now() - pendingG < 1200 && !typing) {
    const jumps = { l: "#/levels", a: "#/algorithms", t: "#/trainer", r: "#/records",
                    m: "#/methods", b: "#/benchmark", e: "#/engine", h: "#/", o: "#/about" };
    const to = jumps[e.key.toLowerCase()];
    pendingG = 0;
    if (to) { e.preventDefault(); location.hash = to; }
  }
});
let pendingG = 0;

/* ------------------------------------------------------------------- tìm */

searchInput.addEventListener("input", debounce(() => {
  const q = searchInput.value.trim();
  if (!q) return;
  location.hash = `#/algorithms?q=${encodeURIComponent(q)}`;
}, 320));

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const q = searchInput.value.trim();
    location.hash = `#/algorithms?q=${encodeURIComponent(q)}`;
    if (parseHash().name === "algorithms") navigate();
  }
});

document.getElementById("menu").addEventListener("click", (e) => {
  const open = document.body.classList.toggle("nav-open");
  e.currentTarget.setAttribute("aria-expanded", String(open));
});

/* -------------------------------------------------------------------- khởi động */

onStoreChange((what) => {
  if (what === "progress" || what === "srs" || what === "reset" || what === "import" ||
      what === "records") drawSideProgress();
});
document.addEventListener("qfox:progress", drawSideProgress);

async function main() {
  const st = settings();
  if (st.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setSetting("speed", 0);
  }
  try {
    await loadAll("data");
  } catch (err) {
    mount(boot, el("div", { class: "boot__inner" },
      el("h2", { class: "boot__err" }, "Không tải được dữ liệu engine"),
      el("p", {}, String(err.message || err)),
      el("p", { class: "small" },
        "Trang này đọc web/data/*.json qua HTTP. Nếu bạn mở index.html thẳng từ ổ đĩa, hãy phục vụ thư mục này trước:"),
      el("pre", { class: "code" }, "cd web && python3 -m http.server 8080"),
      el("p", { class: "tiny muted" },
        "Sau đó tải lại http://localhost:8080.")));
    return;
  }

  drawTopMeta();
  if (!data.check.ok) {
    console.warn("mô hình khối bất đồng với engine", data.check.mismatches);
  }
  boot.classList.add("is-gone");
  setTimeout(() => boot.remove(), 400);

  window.addEventListener("hashchange", navigate);
  navigate();

  console.info(
    "%cQ-FOX%c %s · %d bài · %d phương pháp · kiểm tra mô hình %s · @its.fox_",
    "background:#ff7a1a;color:#150b03;font-weight:700;padding:2px 6px;border-radius:4px",
    "color:#8d99b0", data.engine.engine, data.cases.length, data.methodsList.length,
    data.check.ok ? "đạt" : "THẤT BẠI");
}

main();
