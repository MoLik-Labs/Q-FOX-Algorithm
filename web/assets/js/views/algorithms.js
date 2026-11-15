/**
 * Algorithms: every case the engine published, filterable the way a cuber
 * thinks — by family, by how long it takes, by whether it is named, by whether
 * you have learned it yet, and by text.
 */
import { data, casesOf, search, METRIC_HINT } from "../data.js";
import { el, mount, chip, num, int, emptyState, debounce, progressBar } from "../util.js";
import { caseCard, openCase } from "../parts.js";
import { isLearned, learnedCount } from "../store.js";
import { topLayer } from "../diagram.js";

const SORTS = {
  length: (a, b) => a.count - b.count || a.i - b.i,
  longest: (a, b) => b.count - a.count || a.i - b.i,
  name: (a, b) => (a.names[0] || "zz").localeCompare(b.names[0] || "zz") || a.i - b.i,
  case: (a, b) => a.i - b.i,
  orbit: (a, b) => b.orbit - a.orbit || a.i - b.i,
};

/** Filter state lives in the URL so a filtered list can be shared or bookmarked. */
const state = {
  family: "OLL",
  q: "",
  sort: "case",
  learned: "all",       // all | todo | done
  named: false,
  maxLen: 0,            // 0 = no limit
};

export function render(params = {}, query = {}) {
  Object.assign(state, {
    family: params.family || state.family,
    q: query.q || "",
    sort: query.sort || state.sort,
    learned: query.learned || state.learned,
    named: query.named === "1",
    maxLen: Number(query.max || 0),
  });

  const view = el("div");
  const grid = el("div", { class: "grid grid--cases" });
  const count = el("span", { class: "panel__note" });
  const summary = el("div", { class: "row" });

  /* ------------------------------------------------------------ family tabs */
  const tabs = el("div", { class: "pill-tabs" });
  const familyTab = (key, label, title, n) => {
    const b = el("button", {
      class: "pill-tab", type: "button", title,
      onClick: () => { state.family = key; draw(); syncTabs(); },
    }, key === "*" ? `All (${int(data.cases.length)})` : `${label} (${n})`);
    b.dataset.family = key;
    return b;
  };
  tabs.append(familyTab("*", "All", "Every family", data.cases.length));
  for (const f of data.families) {
    tabs.append(familyTab(f.key, f.label, f.title, f.cases));
  }

  /* --------------------------------------------------------------- filters */
  const searchInput = el("input", {
    type: "search", value: state.q, placeholder: "Filter this family: name, algorithm, pattern…",
    attrs: { "aria-label": "Filter cases" },
    onInput: debounce((e) => { state.q = e.target.value; draw(); }, 140),
  });
  const sortSelect = el("select", {
    attrs: { "aria-label": "Sort" },
    onChange: (e) => { state.sort = e.target.value; draw(); },
  }, ...Object.entries({
    case: "Case order", length: "Shortest first", longest: "Longest first",
    name: "Named first", orbit: "Biggest orbit first",
  }).map(([k, label]) => el("option", { value: k, selected: k === state.sort }, label)));

  const learnedSelect = el("select", {
    attrs: { "aria-label": "Progress filter" },
    onChange: (e) => { state.learned = e.target.value; draw(); },
  }, ...[["all", "All cases"], ["todo", "Not learned yet"], ["done", "Learned"]]
    .map(([k, label]) => el("option", { value: k, selected: k === state.learned }, label)));

  const namedBtn = el("button", {
    class: `pill-tab ${state.named ? "is-on" : ""}`, type: "button",
    onClick: () => { state.named = !state.named; namedBtn.classList.toggle("is-on", state.named); draw(); },
  }, "Named only");

  const maxField = el("div", { class: "field" },
    el("label", { for: "maxlen", title: METRIC_HINT }, "Max moves"),
    el("input", {
      id: "maxlen", type: "number", min: "0", max: "20", step: "1",
      value: String(state.maxLen || ""), placeholder: "any", style: { width: "74px" },
      onInput: (e) => { state.maxLen = Number(e.target.value || 0); draw(); },
    }));

  const filters = el("div", { class: "filters panel panel--tight" },
    el("div", { class: "field", style: { flex: "1 1 260px" } },
      el("label", { for: "q" }, "Search"), searchInput),
    el("div", { class: "field" }, el("label", { for: "sort" }, "Sort"), sortSelect),
    el("div", { class: "field" }, el("label", { for: "learned" }, "Progress"), learnedSelect),
    maxField,
    namedBtn,
    el("span", { class: "spacer" }),
    count);
  searchInput.id = "q"; sortSelect.id = "sort"; learnedSelect.id = "learned";

  /* ------------------------------------------------------------ family head */
  const head = el("div", {});

  function syncTabs() {
    [...tabs.children].forEach((b) => b.classList.toggle("is-on", b.dataset.family === state.family));
  }

  function rows() {
    const base = state.family === "*" ? data.cases : casesOf(state.family);
    let out = search(state.q, base);
    if (state.named) out = out.filter((r) => r.names.length);
    if (state.maxLen) out = out.filter((r) => r.count <= state.maxLen);
    if (state.learned === "todo") out = out.filter((r) => !isLearned(r.key));
    if (state.learned === "done") out = out.filter((r) => isLearned(r.key));
    return out.slice().sort(SORTS[state.sort] || SORTS.case);
  }

  function draw() {
    const list = rows();
    const fam = state.family === "*" ? null : data.algorithms.families[state.family];

    mount(head, fam ? el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, `${fam.label} — ${fam.title.toLowerCase()}`),
        el("p", { class: "panel__note", style: { maxWidth: "72ch" } }, fam.blurb)),
      el("span", { class: "spacer" }),
      el("div", { class: "stats", style: { gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))", minWidth: "330px" } },
        miniStat(String(fam.non_trivial), "to learn"),
        miniStat(num(fam.mean, 2), "mean moves"),
        miniStat(`${fam.longest}`, "longest"),
        miniStat(String(fam.with_textbook || 0), "familiar"),
        miniStat(fam.symmetry, "symmetry")))
      : el("div", { class: "section-head" },
        el("div", {}, el("h1", {}, "All families"),
          el("p", { class: "panel__note" },
            `${int(data.cases.length)} verified cases across ${data.families.length} families.`))));

    mount(grid, list.length
      ? list.map((r) => caseCard(r, { onOpen: openCase }))
      : emptyState("Nothing matches", "Loosen the filter, or clear the search box."));

    const learned = learnedCount(list.map((r) => r.key));
    count.textContent = `${int(list.length)} cases`;
    mount(summary,
      progressBar(learned, list.length, `${learned}/${list.length} learned`),
      el("span", { class: "tiny muted" },
        `mean ${num(list.length ? list.reduce((s, r) => s + r.count, 0) / list.length : 0, 2)} moves in this view`),
      el("span", { class: "spacer" }),
      el("button", {
        class: "btn btn--sm", type: "button",
        onClick: () => {
          const keys = list.map((r) => r.key).join(",");
          location.hash = `#/trainer?keys=${encodeURIComponent(keys)}`;
        },
      }, `Drill these ${list.length}`));
  }

  /* ------------------------------------------------------------- recognition */
  const recognition = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Reading a card")),
    el("div", { class: "row", style: { alignItems: "flex-start", gap: "18px" } },
      topLayer(data.cases.find((c) => c.names[0] === "Sune")?.state || data.model.solved, { size: 118 }),
      el("div", { class: "small" },
        el("p", {}, "The diagram is the last layer from above: the top face, and the skirt of side stickers around it. That is all you look at when recognising a case."),
        el("p", {}, "The ", el("b", {}, "colours"), " are the engine's own facelets — U white, R red, F green, D yellow, L orange, B blue — in the engine's face order U R F D L B."),
        el("p", {}, "Cards are shown ", el("b", {}, "before"), " the algorithm. Press ", el("kbd", {}, "Play"), " in the card to watch it reach the goal, or ", el("kbd", {}, "Set up from solved"), " to build the case on a solved cube and run it yourself."),
        el("p", {}, "A ", el("b", {}, "familiar"), " badge means the engine recognised the case, took the standard algorithm for it, and verified that word against the goal with its own tables. The card shows that word, because it is the one worth memorising, and keeps the engine's own shortest alongside it — press ", el("kbd", {}, "W"), " in the card to switch."),
        el("p", { class: "tiny muted" }, "Move counts are ", el("b", {}, "stm"), ": a slice turn is one move, which is how speedcubing notation counts. The engine's own htm charges a slice turn two, so the two differ only on M-slice algorithms."))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Algorithm book"),
        el("p", { class: "panel__note" },
          `${int(data.algorithms.cases)} cases, ${int(data.algorithms.to_learn)} with an algorithm, every one replayed against its goal by the engine.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`book swept to ${data.book.swept}`, "sky"),
        chip(`exact out to ${data.book.reachable_by}`, "mint"))),
    tabs,
    filters,
    head,
    summary,
    grid,
    recognition);

  syncTabs();
  draw();

  // keep the grid in step with "mark as learned" from a card sheet
  const onProgress = () => draw();
  document.addEventListener("qfox:progress", onProgress);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      document.removeEventListener("qfox:progress", onProgress);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return { node: view, focus: searchInput };
}

function miniStat(v, k) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v", style: { fontSize: "1.1rem" } }, v));
}
