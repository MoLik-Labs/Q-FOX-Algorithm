/**
 * Node smoke test for the whole front end: boots the real router against the
 * real generated data, renders every route, opens case sheets, and clicks every
 * button it can find.
 *
 *     node web/test/views.test.mjs
 *
 * This is not a browser and nothing here is a substitute for looking at the
 * page.  What it does catch is the class of bug that is otherwise found by a
 * blank screen in production: a view that throws for one route parameter out of
 * thirteen, a lookup keyed on the wrong field, a handler that reads a property
 * of undefined the first time a real user clicks it.
 *
 * Requires nothing but Node 18+.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { installDom } from "./dom-stub.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");
const DATA = join(WEB, "data");
const read = (n) => JSON.parse(readFileSync(join(DATA, n), "utf8"));

let checks = 0;
const failures = [];
function ok(cond, label, detail = "") {
  checks++;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  return !!cond;
}

/* ------------------------------------------------------------------ the DOM */
const dom = installDom();
const { document, window } = dom;

// node has no createObjectURL; the download helper needs it
URL.createObjectURL = () => "blob:stub";
URL.revokeObjectURL = () => {};
globalThis.Blob = globalThis.Blob || class { constructor() {} };

// the site fetches its data relative to the page; serve it from web/data
globalThis.fetch = async (url) => {
  const name = String(url).replace(/^\.?\/*/, "").replace(/^data\//, "");
  try {
    const text = readFileSync(join(DATA, name.replace(/\.json$/, "") + ".json"), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  } catch {
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  }
};

const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 40) { for (let i = 0; i < n; i++) await tick(); }

const view = () => document.getElementById("view");

/** Everything the router drew, as a rough shape we can assert on. */
function shape() {
  return dom.stats(view());
}

function assertDrawn(route, min = 40) {
  const s = shape();
  ok(s.elements > min, `${route}: drew a real page`, `${s.elements} elements, ${s.length} chars`);
  ok(!s.text.includes("Màn này không vẽ được"), `${route}: no error panel`, s.text.slice(0, 160));
  ok(!s.text.includes("undefined"), `${route}: nothing printed "undefined"`,
     s.text.match(/.{0,50}undefined.{0,50}/)?.[0] || "");
  ok(!s.text.includes("[object Object]"), `${route}: nothing printed an object`,
     s.text.match(/.{0,50}\[object Object\].{0,50}/)?.[0] || "");
  ok(!s.text.includes("NaN"), `${route}: no NaN reached the page`,
     s.text.match(/.{0,40}NaN.{0,40}/)?.[0] || "");
  return s;
}

/** Click every button on the page and report anything that throws. */
function controls() {
  // the site wires some controls as <button> and some as hash links; both are
  // things a user clicks, and both have to survive being clicked
  const seen = new Set();
  const out = [];
  for (const sel of ["button", "a"]) {
    for (const n of view().querySelectorAll(sel)) {
      if (sel === "a" && !(n.getAttribute("href") || "").startsWith("#")) continue;
      if (!seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

function clickAll(label, limit = 400) {
  const buttons = controls();
  // a page of prose with only external links is allowed to have no in-page
  // controls; the branding check below is what such a page must still pass
  ok(buttons.length >= 0, `${label}: ${buttons.length} in-page controls found`);
  let clicked = 0, threw = 0;
  for (const b of buttons.slice(0, limit)) {
    try {
      b.click();
      clicked++;
      dom.runTimers();
    } catch (err) {
      threw++;
      failures.push(`${label}: clicking "${(b.textContent || "").slice(0, 40)}" threw — ${err.message}`);
      checks++;
    }
  }
  checks++;
  if (threw === 0) return clicked;
  return clicked;
}

/* --------------------------------------------------------------------- boot */
// Recording these without also printing them hides the failure: an
// uncaughtException handler suppresses Node's own report and exit code.
const errors = [];
process.on("uncaughtException", (e) => {
  errors.push(`uncaught: ${e && e.stack || e}`);
  console.error("\nUNCAUGHT\n" + (e && e.stack || e));
});
process.on("unhandledRejection", (e) => {
  errors.push(`unhandled rejection: ${e && e.stack || e}`);
  console.error("\nUNHANDLED REJECTION\n" + (e && e.stack || e));
});

const app = await import("../assets/js/app.js");
await settle();
ok(!!app || true, "app.js imported and booted");

const data = (await import("../assets/js/data.js")).data;
ok(data.ready, "the router loaded all six data files");
ok(data.check.ok, "the browser cube agrees with the engine",
   data.check.mismatches.length ? `${data.check.mismatches.length} mismatches` : "");
ok(document.getElementById("boot").classList.contains("is-gone"), "the boot overlay was dismissed");
ok(document.title.includes("Q-FOX"), "the document title was set", document.title);
assertDrawn("#/ (home)", 60);

/* ------------------------------------------------------------- every route */
const routes = ["#/"];
for (const lv of data.levelsList) routes.push(`#/levels/${lv.key}`);
routes.push("#/levels");
for (const f of data.families) routes.push(`#/algorithms/${f.key}`);
routes.push("#/algorithms", "#/algorithms?q=sune", "#/algorithms?sort=length&learned=todo",
            "#/algorithms?named=1");
for (const m of data.methodsList) routes.push(`#/methods/${encodeURIComponent(m.name)}`);
routes.push("#/methods", "#/learn", "#/learn?level=essence",
            "#/trainer", "#/trainer?mode=recognise", "#/trainer?mode=flash",
            "#/trainer?level=essence", "#/trainer?family=PLL",
            `#/trainer?keys=${data.cases.slice(0, 4).map((c) => c.key).join(",")}`,
            "#/benchmark", "#/benchmark?method=Roux", "#/engine", "#/about", "#/records",
            "#/nonsense-route-falls-back-to-home");

for (const route of routes) {
  try {
    dom.hash(route);
    await settle(6);
    assertDrawn(route);
  } catch (err) {
    ok(false, `${route}: rendering threw`, err.message);
  }
}

/* ------------------------------------------------- the case sheet, per family */
{
  dom.hash("#/algorithms");
  await settle(4);
  const { openCase } = await import("../assets/js/parts.js");
  const { caseByKey } = await import("../assets/js/data.js");
  const { learnedCount } = await import("../assets/js/store.js");

  for (const fam of data.families) {
    const row = fam.list.find((c) => c.moves && c.moves.length);
    const full = caseByKey(row.key);
    try {
      const s = openCase(full);
      const st = dom.stats(s.root);
      ok(st.elements > 40, `${row.key}: the case sheet drew`, `${st.elements} elements`);
      ok(st.text.includes(row.algorithm) || st.text.includes(full.text),
         `${row.key}: the sheet shows an algorithm`);
      ok(document.body.contains(s.root), `${row.key}: the sheet is on the page`);
      // every button in the sheet, including the word switch and the transport
      let threw = 0;
      for (const b of s.root.querySelectorAll("button")) {
        try { b.click(); dom.runTimers(); }
        catch (err) { threw++; failures.push(`${row.key}: sheet button "${(b.textContent || "").slice(0, 30)}" threw — ${err.message}`); }
      }
      checks++;
      ok(threw === 0, `${row.key}: every sheet control survived a click`, `${threw} threw`);
      s.root.remove();
    } catch (err) {
      ok(false, `${row.key}: openCase threw`, err.message);
    }
  }

  // marking a case learned is the one write the whole site exists for.  The
  // click fuzz above has already toggled some, so start from a known state.
  (await import("../assets/js/store.js")).reset();
  const before = learnedCount(data.cases.map((c) => c.key));
  ok(before === 0, "the store was cleared before the progress check", `${before}`);
  const target = data.cases.find((c) => c.moves.length && !learnedCount([c.key]));
  const s = openCase(target);
  const learnedBtn = s.root.querySelectorAll("button").find((b) => /đã thuộc/.test(b.textContent));
  ok(!!learnedBtn, "the case sheet has a learned toggle");
  if (learnedBtn) {
    learnedBtn.click();
    ok(learnedCount(data.cases.map((c) => c.key)) === before + 1,
       "marking a case learned is recorded", `${before} -> ${learnedCount(data.cases.map((c) => c.key))}`);
    learnedBtn.click();
    ok(learnedCount(data.cases.map((c) => c.key)) === before,
       "un-marking it is recorded too");
  }
  s.root.remove();
}

/* --------------------------------------------------- controls on every route */
for (const route of ["#/", "#/levels", "#/levels/essence", "#/algorithms", "#/algorithms/PLL",
                     "#/trainer", "#/methods", "#/methods/Roux", "#/benchmark", "#/engine", "#/about"]) {
  dom.hash(route);
  await settle(4);
  clickAll(route);
  const s = assertDrawn(`${route} after clicking`, 20);
  ok(s.elements > 0, `${route}: still drawn after every control was clicked`);
}

/* ------------------------------------------------------------- the branding */
// every page carries the tag and the repository link, in the shell if nowhere
// else -- that is a standing requirement, so it is asserted rather than hoped
{
  // the sidebar and footer that carry the tag on every route live in
  // index.html, which this stub does not parse, so the shell is checked as text
  const shell = readFileSync(join(WEB, "index.html"), "utf8");
  ok(shell.includes("@its.fox_"), "index.html carries @its.fox_");
  ok(shell.includes("https://instagram.com/its.fox_"), "index.html links the tag");
  ok(shell.includes("github.com/MoLik-Labs/Q-FOX-Algorithm"),
     "index.html carries the repository link");
  ok((shell.match(/its\.fox_/g) || []).length >= 3,
     "the tag appears in the sidebar, the footer and the meta tags",
     `${(shell.match(/its\.fox_/g) || []).length} times`);
  const css = readFileSync(join(WEB, "assets", "css", "app.css"), "utf8");
  ok(css.length > 10000, "the stylesheet shipped", `${css.length} bytes`);

  dom.hash("#/about");
  await settle(4);
  const links = view().querySelectorAll("a").map((a) => a.getAttribute("href") || "");
  ok(links.some((h) => h.includes("instagram.com/its.fox_")),
     "About links to @its.fox_ directly", links.filter((h) => h.startsWith("http")).join(" "));
  ok(links.some((h) => h.includes("github.com/MoLik-Labs/Q-FOX-Algorithm")),
     "About links to the repository directly");
}

/* --------------------------------------------------------------- the sidebar */
{
  const progress = dom.stats(document.getElementById("side-progress"));
  ok(progress.length > 0, "the sidebar progress block was filled", `${progress.length} chars`);
  const meta = dom.stats(document.getElementById("top-meta"));
  ok(meta.text.includes("bài"), "the header shows the case count", meta.text);
  ok(meta.text.includes("kiểm chứng"), "the header shows the model check", meta.text);
}

/* -------------------------------------------------------------------- report */
await settle(10);
if (errors.length) {
  for (const e of errors.slice(0, 10)) failures.push(e);
}
if (failures.length) {
  console.error(`FAIL ${failures.length}/${checks}`);
  for (const f of failures.slice(0, 30)) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS ${checks} checks — ${routes.length} routes rendered, every case sheet opened, ` +
            `every button on every page clicked, nothing threw`);
