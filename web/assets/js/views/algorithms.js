/**
 * Thuật toán: mọi bài engine đã xuất bản, lọc theo cách người chơi rubik
 * nghĩ -- theo họ, theo độ dài, theo có tên hay không, theo đã thuộc hay
 * chưa, và theo văn bản.
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

/** Trạng thái lọc nằm trong URL, nên một danh sách đã lọc có thể chia sẻ hoặc đánh dấu. */
const state = {
  family: "OLL",
  q: "",
  sort: "case",
  learned: "all",       // all | todo | done
  named: false,
  maxLen: 0,            // 0 = không giới hạn
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

  /* ------------------------------------------------------------ tab họ */
  const tabs = el("div", { class: "pill-tabs" });
  const familyTab = (key, label, title, n) => {
    const b = el("button", {
      class: "pill-tab", type: "button", title,
      onClick: () => { state.family = key; draw(); syncTabs(); },
    }, key === "*" ? `Tất cả (${int(data.cases.length)})` : `${label} (${n})`);
    b.dataset.family = key;
    return b;
  };
  tabs.append(familyTab("*", "Tất cả", "Mọi họ", data.cases.length));
  for (const f of data.families) {
    tabs.append(familyTab(f.key, f.label, f.title, f.cases));
  }

  /* --------------------------------------------------------------- lọc */
  const searchInput = el("input", {
    type: "search", value: state.q, placeholder: "Lọc họ này: tên, thuật toán, hình…",
    attrs: { "aria-label": "Lọc bài" },
    onInput: debounce((e) => { state.q = e.target.value; draw(); }, 140),
  });
  const sortSelect = el("select", {
    attrs: { "aria-label": "Sắp xếp" },
    onChange: (e) => { state.sort = e.target.value; draw(); },
  }, ...Object.entries({
    case: "Theo thứ bài", length: "Ngắn nhất trước", longest: "Dài nhất trước",
    name: "Có tên trước", orbit: "Quỹ đạo lớn trước",
  }).map(([k, label]) => el("option", { value: k, selected: k === state.sort }, label)));

  const learnedSelect = el("select", {
    attrs: { "aria-label": "Lọc tiến độ" },
    onChange: (e) => { state.learned = e.target.value; draw(); },
  }, ...[["all", "Tất cả bài"], ["todo", "Chưa thuộc"], ["done", "Đã thuộc"]]
    .map(([k, label]) => el("option", { value: k, selected: k === state.learned }, label)));

  const namedBtn = el("button", {
    class: `pill-tab ${state.named ? "is-on" : ""}`, type: "button",
    onClick: () => { state.named = !state.named; namedBtn.classList.toggle("is-on", state.named); draw(); },
  }, "Chỉ có tên");

  const maxField = el("div", { class: "field" },
    el("label", { for: "maxlen", title: METRIC_HINT }, "Tối đa động tác"),
    el("input", {
      id: "maxlen", type: "number", min: "0", max: "20", step: "1",
      value: String(state.maxLen || ""), placeholder: "bất kỳ", style: { width: "74px" },
      onInput: (e) => { state.maxLen = Number(e.target.value || 0); draw(); },
    }));

  const filters = el("div", { class: "filters panel panel--tight" },
    el("div", { class: "field", style: { flex: "1 1 260px" } },
      el("label", { for: "q" }, "Tìm"), searchInput),
    el("div", { class: "field" }, el("label", { for: "sort" }, "Sắp xếp"), sortSelect),
    el("div", { class: "field" }, el("label", { for: "learned" }, "Tiến độ"), learnedSelect),
    maxField,
    namedBtn,
    el("span", { class: "spacer" }),
    count);
  searchInput.id = "q"; sortSelect.id = "sort"; learnedSelect.id = "learned";

  /* ------------------------------------------------------------ đầu họ */
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
        miniStat(String(fam.non_trivial), "cần học"),
        miniStat(num(fam.mean, 2), "động tác trung bình"),
        miniStat(`${fam.longest}`, "dài nhất"),
        miniStat(String(fam.with_textbook || 0), "quen thuộc"),
        miniStat(fam.symmetry, "đối xứng")))
      : el("div", { class: "section-head" },
        el("div", {}, el("h1", {}, "Tất cả các họ"),
          el("p", { class: "panel__note" },
            `${int(data.cases.length)} bài đã kiểm chứng trên ${data.families.length} họ.`))));

    mount(grid, list.length
      ? list.map((r) => caseCard(r, { onOpen: openCase }))
      : emptyState("Không có bài nào khớp", "Nới lỏng điều kiện lọc, hoặc bỏ trống ô tìm."));

    const learned = learnedCount(list.map((r) => r.key));
    count.textContent = `${int(list.length)} bài`;
    mount(summary,
      progressBar(learned, list.length, `${learned}/${list.length} đã thuộc`),
      el("span", { class: "tiny muted" },
        `trung bình ${num(list.length ? list.reduce((s, r) => s + r.count, 0) / list.length : 0, 2)} động tác trong danh sách này`),
      el("span", { class: "spacer" }),
      el("button", {
        class: "btn btn--sm", type: "button",
        onClick: () => {
          const keys = list.map((r) => r.key).join(",");
          location.hash = `#/trainer?keys=${encodeURIComponent(keys)}`;
        },
      }, `Luyện ${list.length} bài này`));
  }

  /* ------------------------------------------------------------ hướng dẫn nhận dạng */
  const recognition = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Đọc một thẻ bài")),
    el("div", { class: "row", style: { alignItems: "flex-start", gap: "18px" } },
      topLayer(data.cases.find((c) => c.names[0] === "Sune")?.state || data.model.solved, { size: 118 }),
      el("div", { class: "small" },
        el("p", {}, "Sơ đồ là lớp cuối nhìn từ trên xuống: mặt trên, và vành các dán bên quanh nó. Đó là tất cả bạn nhìn khi nhận dạng một bài."),
        el("p", {}, "Các ", el("b", {}, "màu"), " là dán của chính engine — U trắng, R đỏ, F xanh lá, D vàng, L cam, B xanh dương — theo thứ tự mặt của engine U R F D L B."),
        el("p", {}, "Thẻ bài hiển thị ", el("b", {}, "trước"), " thuật toán. Bấm ", el("kbd", {}, "Chơi"), " trong thẻ để xem nó đi tới đích, hoặc ", el("kbd", {}, "Đặt từ khối hoàn chỉnh"), " để dựng bài trên khối hoàn chỉnh và tự chạy."),
        el("p", {}, "Một badge ", el("b", {}, "quen thuộc"), " nghĩa là engine nhận ra bài, lấy thuật toán chuẩn cho nó, và kiểm chứng từ đó đối chiếu với mục tiêu bằng chính các bảng của nó. Thẻ hiển thị từ đó, vì nó là thứ đáng thuộc, và giữ từ ngắn nhất của engine bên cạnh — bấm ", el("kbd", {}, "W"), " trong cửa sổ bài để đổi."),
        el("p", { class: "tiny muted" }, "Đếm động tác theo ", el("b", {}, "stm"), ": một cú slice là một động tác, đúng cách ký hiệu speedcubing đếm. htm của engine tính một cú slice là hai, nên hai con số chỉ khác ở các thuật toán dùng slice M."))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Sách thuật toán"),
        el("p", { class: "panel__note" },
          `${int(data.algorithms.cases)} bài, ${int(data.algorithms.to_learn)} bài có thuật toán, mỗi bài đều được engine chạy lại đối chiếu với mục tiêu.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`sách quét tới ${data.book.swept}`, "sky"),
        chip(`chính xác tới ${data.book.reachable_by}`, "mint"))),
    tabs,
    filters,
    head,
    summary,
    grid,
    recognition);

  syncTabs();
  draw();

  // giữ lưới đồng bộ với "đánh dấu đã thuộc" từ cửa sổ bài
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
