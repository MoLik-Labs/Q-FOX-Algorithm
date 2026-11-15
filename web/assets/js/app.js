/**
 * Boot and routing.
 *
 * Hash routes only, so the site is a folder of static files that works on
 * Cloudflare Pages, `python3 -m http.server`, or anything else that can serve
 * a directory — no rewrites, no build step, no server-side rendering.
 */
import { loadAll, data, totals } from "./data.js";
import { el, mount, chip, toast, debounce } from "./util.js";
import { learnedCount, onChange as onStoreChange, settings, setSetting, exportAll, importAll, reset } from "./store.js";
import { download } from "./util.js";

import * as home from "./views/home.js";
import * as levels from "./views/levels.js";
import * as algorithms from "./views/algorithms.js";
import * as trainer from "./views/trainer.js";
import * as methods from "./views/methods.js";
import * as benchmark from "./views/benchmark.js";
import * as engine from "./views/engine.js";
import * as about from "./views/about.js";

const ROUTES = {
  home: { mod: home, title: "Overview" },
  levels: { mod: levels, title: "Levels" },
  algorithms: { mod: algorithms, title: "Algorithms" },
  trainer: { mod: trainer, title: "Trainer" },
  methods: { mod: methods, title: "Methods" },
  benchmark: { mod: benchmark, title: "Benchmark" },
  engine: { mod: engine, title: "Notation & engine" },
  about: { mod: about, title: "About" },
};

const viewHost = document.getElementById("view");
const boot = document.getElementById("boot");
const nav = document.getElementById("nav");
const searchInput = document.getElementById("search");
const topMeta = document.getElementById("top-meta");
const sideProgress = document.getElementById("side-progress");

let current = null;

/* ---------------------------------------------------------------- routing */

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

  if (current && current.destroy) { try { current.destroy(); } catch { /* view already gone */ } }
  document.body.classList.remove("nav-open");
  document.getElementById("menu").setAttribute("aria-expanded", "false");

  [...nav.children].forEach((a) => a.classList.toggle("is-active", a.dataset.route === name));

  mount(viewHost, el("div", { class: "spinner-wrap" }, el("div", { class: "spinner" }), el("p", {}, "Drawing…")));

  let out;
  try {
    out = route.mod.render(params, query) || {};
  } catch (err) {
    console.error(err);
    out = { node: el("div", { class: "panel" },
      el("h2", {}, "This view failed to draw"),
      el("pre", { class: "code" }, String(err && err.stack || err)),
      el("p", { class: "small muted" }, "The data is fine — this is a bug in the page. Reload, and if it persists, report it with the text above.")) };
  }
  const node = out.node || out;
  mount(viewHost, node);
  current = out;

  document.title = `${route.title} · Q-FOX Algorithm`;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (out.focus) setTimeout(() => out.focus.focus(), 60);
  drawSideProgress();
}

/* ------------------------------------------------------- chrome and status */

function drawSideProgress() {
  if (!data.ready) return;
  const keys = data.cases.map((c) => c.key);
  const done = learnedCount(keys);
  mount(sideProgress,
    el("div", { class: "tiny", style: { marginBottom: "4px" } },
      `${done} / ${keys.length} algorithms learned`),
    el("div", { class: "progress", style: { height: "8px" } },
      el("div", { class: "progress__bar", style: { width: `${(100 * done) / Math.max(1, keys.length)}%` } })),
    el("div", { class: "row row--tight", style: { marginTop: "8px" } },
      el("button", { class: "btn btn--sm btn--ghost", type: "button",
                     onClick: () => download("qfox-progress.json", exportAll()) }, "Export"),
      el("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: pickImport }, "Import")));
}

function pickImport() {
  const input = el("input", { type: "file", accept: "application/json", style: { display: "none" } });
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const counts = importAll(await file.text());
      toast(`Imported: ${counts.learned} learned, ${counts.reviewed} drilled`, "ok");
      navigate();
    } catch (err) {
      toast(`Import failed: ${err.message}`, "err");
    }
    input.remove();
  };
  document.body.append(input);
  input.click();
}

function drawTopMeta() {
  const t = totals();
  mount(topMeta,
    el("span", { class: "dot", title: "data loaded" }),
    el("span", {}, `${t.cases} cases`),
    el("span", { class: "tiny" }, "·"),
    el("span", {}, `${t.methods} methods`),
    el("span", { class: "tiny" }, "·"),
    chip(data.check.ok ? "verified" : "model mismatch", data.check.ok ? "mint" : "rose"));
}

/* --------------------------------------------------------------- shortcuts */

document.addEventListener("keydown", (e) => {
  const typing = e.target.matches("input, textarea, select");
  if (e.key === "/" && !typing) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  } else if (e.key === "Escape" && document.activeElement === searchInput) {
    searchInput.blur();
  } else if (e.key.toLowerCase() === "g" && !typing) {
    // g then a letter, the way people expect from a keyboard-first tool
    pendingG = Date.now();
  } else if (pendingG && Date.now() - pendingG < 1200 && !typing) {
    const jumps = { l: "#/levels", a: "#/algorithms", t: "#/trainer", m: "#/methods",
                    b: "#/benchmark", e: "#/engine", h: "#/", o: "#/about" };
    const to = jumps[e.key.toLowerCase()];
    pendingG = 0;
    if (to) { e.preventDefault(); location.hash = to; }
  }
});
let pendingG = 0;

/* ------------------------------------------------------------------ search */

searchInput.addEventListener("input", debounce(() => {
  const q = searchInput.value.trim();
  if (!q) return;
  const { name } = parseHash();
  if (name !== "algorithms") location.hash = `#/algorithms?q=${encodeURIComponent(q)}`;
  else {
    const url = new URL(location.href);
    location.hash = `#/algorithms?q=${encodeURIComponent(q)}`;
    navigate();
  }
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

/* -------------------------------------------------------------------- boot */

onStoreChange((what) => {
  if (what === "progress" || what === "srs" || what === "reset" || what === "import") drawSideProgress();
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
      el("h2", { class: "boot__err" }, "Could not load the engine data"),
      el("p", {}, String(err.message || err)),
      el("p", { class: "small" },
        "This site reads web/data/*.json over HTTP. If you opened index.html straight from disk, serve the folder instead:"),
      el("pre", { class: "code" }, "cd web && python3 -m http.server 8080"),
      el("p", { class: "tiny muted" }, "Then reload http://localhost:8080.")));
    return;
  }

  drawTopMeta();
  if (!data.check.ok) {
    console.warn("cube model disagrees with the engine", data.check.mismatches);
  }
  boot.classList.add("is-gone");
  setTimeout(() => boot.remove(), 400);

  window.addEventListener("hashchange", navigate);
  navigate();

  console.info(
    "%cQ-FOX%c %s · %d cases · %d methods · model check %s · @its.fox_",
    "background:#ff7a1a;color:#150b03;font-weight:700;padding:2px 6px;border-radius:4px",
    "color:#8d99b0", data.engine.engine, data.cases.length, data.methodsList.length,
    data.check.ok ? "passed" : "FAILED");
}

main();
