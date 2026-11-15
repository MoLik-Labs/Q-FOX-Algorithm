/** About: what the system is, how to reproduce every number, and who made it. */
import { data, totals } from "../data.js";
import { el, mount, chip, int, num } from "../util.js";

const REPO = "https://github.com/MoLik-Labs/Q-FOX-Algorithm";
const TAG = "https://instagram.com/its.fox_";

export function render() {
  const t = totals();
  const view = el("div");

  const map = [
    ["engine/qfox.c, engine/qfox.h", "The cube. Facelets, 54 moves, coordinate encodings, BFS table building, IDA*, the last-layer book sweep, and a 1000-line self-test that runs on every build."],
    ["engine/build.sh", "Rebuilds build/libqfox.so and build/qfox. Read its output: a failed build leaves the previous binary in place."],
    ["qfox/native.py", "ctypes binding. Every struct width is checked against qf_abi() at import, so a mismatched build fails loudly instead of corrupting the heap."],
    ["qfox/coords.py", "The coordinate catalogue: EO, CO, corner and edge permutations, cross, blocks, Roux LSE, ZZ EOLine, Kociemba's phase tables, and the last-layer coordinates."],
    ["qfox/methods/", "base.py (Goal, Stage, Method, SolveTrace) plus classic.py (CFOP, Roux, ZZ, Petrus, LBL) and qfox.py (the four tiers and the opening variants)."],
    ["qfox/alggen/", "cases.py derives the case families by symmetry; book.py bridges a case to the engine's last-layer book; llsolve.py meets in the middle for anything past the sweep."],
    ["qfox/benchmark/, scripts/bench.py", "WCA-style scrambles, one shared table cache, replay verification of every solution, per-stage statistics."],
    ["scripts/gen_ll_book.py", "The resumable sweep that produced data/llbook.bin."],
    ["scripts/gen_web_data.py", "Asks the engine for every case, keeps the shortest verified word, and writes web/data/*.json — the only input this site has."],
    ["scripts/validate_web_data.py", "Replays all " + int(t.cases) + " algorithms against their goals and re-derives this site's cube geometry from the engine's permutations."],
    ["web/", "This site. Static files, no build step, no dependencies, deployable as-is on Cloudflare Pages."],
  ];

  const commands = [
    ["bash engine/build.sh", "compile the engine and run its self-test"],
    ["./build/qfox \"R U R' U' D F2 B' L U2\"", "solve a scramble from the command line"],
    ["python3 scripts/gen_ll_book.py --depth 13", "sweep the last-layer book (resumable)"],
    ["python3 scripts/bench.py --all --scrambles 20 --stages --traces", "benchmark every method"],
    ["python3 scripts/gen_web_data.py", "regenerate web/data/*.json"],
    ["python3 scripts/validate_web_data.py", "prove the export agrees with the engine"],
    ["node web/test/model.test.mjs", "prove the browser cube agrees with the export"],
  ];

  const guarantees = [
    [`${int(t.cases)} algorithms, replayed`, "Every case card was produced by applying its own algorithm to its own state and testing the family goal with the engine's coordinate tables — not by trusting the book's index."],
    ["Shortest the engine can prove", "Answers come from a complete sweep of the last-layer group out to depth " + t.swept + ", so anything it reaches is optimal; beyond that, two halves of the ball are combined, which stays exact out to " + t.exactTo + " moves."],
    ["Centres are not ignored", "A slice move can satisfy a stage goal and still leave two centres swapped. Every method re-checks centre alignment, which is why Roux solves 20/20 here and not 0/20."],
    ["Symmetry is derived, not assumed", "Case families are built by applying the symmetry group and counting orbits: 216 OLL states → 58, 288 PLL → 22, 648 CMLL → 43, 96 ELL → 30 — the published counts."],
    ["The browser cannot drift", "web/test/model.test.mjs and the in-page check both rebuild all 54 permutations from the drawing geometry and compare them with the engine's."],
  ];

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "About Q-FOX"),
        el("p", { class: "panel__note" },
          "A self-contained Rubik's cube solver and algorithm generator: its own C engine, its own coordinate catalogue, its own last-layer book, and a site that publishes only what the engine proves.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        el("a", { class: "btn btn--sm btn--primary", href: TAG, target: "_blank", rel: "noopener noreferrer me" }, "@its.fox_"),
        el("a", { class: "btn btn--sm", href: REPO, target: "_blank", rel: "noopener noreferrer" }, "Repository ↗"))),

    el("div", { class: "grid grid--2" },
      el("div", { class: "panel" },
        el("h3", {}, "What it guarantees"),
        el("div", { class: "stack" }, guarantees.map(([title, body]) =>
          el("div", {}, el("b", {}, title), el("p", { class: "small muted", style: { margin: "2px 0 0" } }, body))))),
      el("div", { class: "panel" },
        el("h3", {}, "The numbers"),
        el("div", { class: "stats" },
          stat(int(t.elements), "last-layer elements"),
          stat(`${num(t.coverage, 2)}%`, "swept exactly"),
          stat(int(t.cases), "cases published"),
          stat(String(t.methods), "methods"),
          stat(String(t.levels), "levels"),
          stat(String(t.moves), "moves"),
          stat(`${t.methodsSolvedAll}/${t.methods}`, "methods solving every scramble"),
          stat(String(data.book.reachable_by), "exact answers out to")))),

    el("div", { class: "section-head" }, el("h2", {}, "Reproduce everything")),
    el("div", { class: "panel" },
      el("p", { class: "small muted" },
        "From a clean checkout. The engine needs a C compiler; the site needs nothing at all — the JSON is committed."),
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("tbody", {}, commands.map(([cmd, why]) => el("tr", {},
            el("td", {}, el("code", { class: "tiny" }, cmd)),
            el("td", { class: "small muted" }, why))))))),

    el("div", { class: "section-head" }, el("h2", {}, "Where things live")),
    el("div", { class: "panel" },
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("tbody", {}, map.map(([path, why]) => el("tr", {},
            el("td", { class: "name" }, el("code", { class: "tiny" }, path)),
            el("td", { class: "small muted", style: { whiteSpace: "normal", minWidth: "320px" } }, why))))))),

    el("div", { class: "section-head" }, el("h2", {}, "Deploying this site")),
    el("div", { class: "grid grid--2" },
      el("div", { class: "panel" },
        el("h3", {}, "Cloudflare Pages"),
        el("ol", { class: "small" },
          el("li", {}, "Push this repository to GitHub."),
          el("li", {}, "Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git."),
          el("li", {}, "Build command: ", el("b", {}, "leave empty"), ". Output directory: ", el("code", {}, "web"), "."),
          el("li", {}, "Deploy. The six JSON files in ", el("code", {}, "web/data"), " are committed, so there is nothing to build."),
          el("li", {}, "To refresh the numbers later: run ", el("code", {}, "scripts/gen_web_data.py"), " locally, commit, and Pages redeploys.")),
        el("p", { class: "tiny muted" },
          "web/_headers sets caching for the data files; web/manifest.webmanifest makes it installable.")),
      el("div", { class: "panel" },
        el("h3", {}, "Anywhere else"),
        el("p", { class: "small" }, "It is a folder of static files. Any of these work:"),
        el("pre", { class: "code" },
`cd web && python3 -m http.server 8080
npx serve web
wrangler pages deploy web`),
        el("p", { class: "tiny muted" },
          "Opening index.html straight from disk will not work: browsers block fetch() of local JSON. Serve the folder over HTTP."))),

    el("div", { class: "panel", style: { marginTop: "20px" } },
      el("h3", {}, "Credit"),
      el("p", {},
        "Built by ", el("a", { href: TAG, target: "_blank", rel: "noopener noreferrer me" }, el("b", {}, "@its.fox_")),
        " · source at ", el("a", { href: REPO, target: "_blank", rel: "noopener noreferrer" }, "github.com/MoLik-Labs/Q-FOX-Algorithm"), "."),
      el("p", { class: "small muted" },
        "Move names and case names (Sune, T-perm, Ja-perm…) follow standard speedcubing notation. ",
        "Algorithms are generated independently by the engine; where a textbook algorithm exists and is verified to reach the same goal, the card is labelled with its familiar name and whichever word is shorter is the one shown."),
      el("div", { class: "row row--tight", style: { marginTop: "10px" } },
        chip("no external libraries", "mint"),
        chip("no tracking", "mint"),
        chip("works offline once loaded", "sky"),
        chip(`${data.engine.engine}`, "fox"))));

  return { node: view };
}

function stat(v, k) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v));
}
