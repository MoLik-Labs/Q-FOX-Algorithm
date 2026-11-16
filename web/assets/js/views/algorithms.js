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
    el("div", { class: "panel__head" }, el("h3", {}, "Đọc một thẻ bài và thuộc nó nhanh")),
    el("div", { class: "row", style: { alignItems: "flex-start", gap: "18px" } },
      topLayer(data.cases.find((c) => c.names[0] === "Sune")?.state || data.model.solved, { size: 118 }),
      el("div", { class: "small" },
        el("p", {}, "Sơ đồ là lớp cuối nhìn từ trên xuống: mặt trên, và vành các dán bên quanh nó. Đó là tất cả bạn nhìn khi nhận dạng một bài."),
        el("p", {}, "Các ", el("b", {}, "màu"), " là dán của chính engine — U trắng, R đỏ, F xanh lá, D vàng, L cam, B xanh dương — theo thứ tự mặt của engine U R F D L B."),
        el("p", {}, "Thẻ bài hiển thị ", el("b", {}, "trước"), " thuật toán. Bấm ", el("kbd", {}, "Chơi"), " trong thẻ để xem nó đi tới đích, hoặc ", el("kbd", {}, "Đặt từ khối hoàn chỉnh"), " để dựng bài trên khối hoàn chỉnh và tự chạy."),
        el("p", {}, "Một badge ", el("b", {}, "quen thuộc"), " nghĩa là engine nhận ra bài, lấy thuật toán chuẩn cho nó, và kiểm chứng từ đó đối chiếu với mục tiêu bằng chính các bảng của nó. Thẻ hiển thị từ đó, vì nó là thứ đáng thuộc, và giữ từ ngắn nhất của engine bên cạnh — bấm ", el("kbd", {}, "W"), " trong cửa sổ bài để đổi."),
        el("h4", { style: { margin: "14px 0 4px" } }, "Thuộc nó theo từng cụm, không thuộc từng chữ"),
        el("p", {}, "Không bao giờ đọc thuật toán như một dãy ký hiệu dài. Chia nó thành các ", el("b", {}, "cụm"), " — mỗi cụm hai hoặc ba động tác liên tiếp mà bạn có thể nhớ cùng lúc. Thuộc từng cụm, rồi nối chúng lại. Phương pháp này giúp thuộc nhanh hơn nhiều và nhớ lâu hơn, vì bộ nhớ của bạn giữ các cụm có nghĩa, không phải các ký hiệu riêng lẻ."),
        el("p", {}, "Cửa sổ bài có làm việc này cho bạn: nó chia thuật toán thành các cụm (chọn ", el("kbd", {}, "2"), " hoặc ", el("kbd", {}, "3"), " động tác một cụm), đánh dấu cụm bạn đang ở, và cho bạn nhảy tới đầu bất kỳ cụm nào. Chạy từng cụm trên khối, thuộc nó, rồi chạy cụm tiếp theo."),
        el("p", {}, "Một mẹo của người phá kỷ lục: ", el("b", {}, "xây từng cụm từ khối hoàn chỉnh"), ". Đặt khối hoàn chỉnh, chạy cụm 1, nhận diện điều nó tạo ra, rồi chạy cụm 2. Khi cả cụm nối lại thành bài, bạn không chỉ nhớ ký hiệu — bạn nhớ hình ảnh của chúng trên khối."),
        el("p", { class: "tiny muted" }, "Đếm động tác theo ", el("b", {}, "stm"), ": một cú slice là một động tác, đúng cách ký hiệu speedcubing đếm. htm của engine tính một cú slice là hai, nên hai con số chỉ khác ở các thuật toán dùng slice M."))));

  const reference = recognitionTable();

/**
 * Hướng dẫn nhận dạng theo họ: dạy hệ thống nhận dạng của từng họ, không
 * chỉ từng bài riêng lẻ. Mỗi họ có một bộ câu hỏi nhận dạng bạn tự trả lời
 * khi nhìn khối -- đi qua các câu hỏi này là bạn phân loại được bài.
 * Đây là kỹ năng cốt lõi: nhận ra bài trước, rồi mới nhớ thuật toán.
 */
const FAMILY_RECOGNISE = {
  OLL: [
    ["Có cạnh nào xác định hướng chưa?", "Đếm và xem hình dáng các cạnh đã xác định hướng: không cạnh nào (đốm), một dòng (hai đối diện), một chữ L (hai kề nhau), hay cả bốn (cross)."],
    ["Có bao nhiêu góc xác định hướng?", "Đếm góc đã xác định hướng: 0, 1, 2 kề, 2 đối diện (đèn pha), 3, hay 4. Hình dáng góc thường là dấu hiệu mạnh nhất."],
    ["Combination quyết định bài", "Combo cạnh + góc cho một trong 57 bài OLL. Nhớ hình combo -- không cần nhớ từng bài riêng."],
  ],
  PLL: [
    ["Hướng đã đúng -- chỉ còn hoán vị", "OLL đã xong, mọi dán lớp cuối đúng hướng. Giờ chỉ là hoán vị: cạnh và góc đổi chỗ."],
    ["Nhìn các cạnh đã giải", "Đếm và xem vị trí các cạnh đã đúng: tạo hình đối xứng gì (sọc, cột, X, L, Block)."],
    ["Nhìn các góc đã giải", "Xem góc nào đã về chỗ, tạo hình gì. Combine cạnh + góc -> xác định PLL, rồi AUF để xếp."],
    ["AUF trước và sau", "PLL luôn có một cú xoay mặt trên tự do trước và sau. Thuật toán giữ lại phép xoay mặt trên ở đầu -- xếp AUF trước khi chạy."],
  ],
  CLL: [
    ["Các góc đã giải -- cạnh mới xác định hướng", "Góc lớp cuối đã xong. Cạnh lớp cuối đã xác định hướng nhưng chưa về chỗ."],
    ["Đếm góc xác định hướng trước khi giải", "Bài CLL được định nghĩa bởi hướng góc ban đầu: 0, 1, 2 kề, 2 đối, hay 4 góc xác định hướng."],
    ["Nhìn hình cạnh đã xác định hướng", "Combine hướng góc + hình dáng cạnh -> xác định bài trong 42 bài CLL."],
  ],
  COLL: [
    ["Góc đã giải, cạnh xác định hướng -- từ hình khác", "Mục tiêu giống CLL, nhưng tiếp cận từ hình dạng ban đầu khác: hướng của các góc là thứ định nghĩa bài."],
    ["Hướng góc là thứ đầu tiên bạn thấy", "Đếm hướng góc lớp cuối. Mỗi hướng góc ban đầu tương ứng một tập bài COLL."],
    ["Nhìn cạnh đã xác định hướng", "Combine hướng góc + hình cạnh -> xác định bài. COLL và CLL cùng mục tiêu, khác cách đi vào."],
  ],
  ELL: [
    ["Các góc đã xong -- chỉ 4 cạnh đổi", "Góc lớp cuối đã hoàn chỉnh. Chỉ 4 cạnh lớp cuối thay đổi vị trí và/hoặc hướng."],
    ["Đếm cạnh xác định hướng", "Đếm cạnh đã xác định hướng: không cạnh nào (đốm), dòng (2 đối), L (2 kề), hay cả 4 (cross)."],
    ["Nhìn hoán vị cạnh", "Combine hướng cạnh + hoán vị -> xác định bài trong 29 bài ELL. Chỉ một cú xoay toàn khối để chọn giữa các bài."],
  ],
};

function familyRecognise() {
  const sections = data.families.map((f) => {
    const guide = FAMILY_RECOGNISE[f.key] || [];
    const steps = guide.map(([q, a]) =>
      el("div", { class: "step" },
        el("div", { class: "step__t" }, q),
        el("div", { class: "step__d" }, a)));
    return el("div", { class: "panel" },
      el("div", { class: "panel__head" },
        el("h3", {}, `${f.label} — nhận dạng`),
        el("span", { class: "spacer" }),
        chip(`${f.non_trivial} bài`, "fox")),
      el("div", { class: "timeline" }, steps));
  });
  return el("section", { class: "stack" },
    el("div", { class: "section-head" },
      el("div", {},
        el("h2", {}, "Hướng dẫn nhận dạng theo họ"),
        el("p", { class: "panel__note" },
          "Nhận dạng là bước đầu tiên và quan trọng nhất của giải nhanh. Mỗi họ có một bộ câu hỏi nhận dạng bạn tự trả lời khi nhìn khối. Đi qua các câu hỏi, bạn phân loại được bài -- và chỉ khi biết bạn đang giải bài nào, thuật toán mới có ý nghĩa."))),
    ...sections);
}

/**
 * Bảng nhận dạng tham chiếu: mọi bài có tên quen thuộc, với nhận dạng của
 * nó và thuật toán. Một công cụ học nhận dạng nhanh -- lướt bảng, nhớ
 * hình, rồi kiểm tra trên khối. Sắp xếp theo họ rồi độ dài.
 */
function recognitionTable() {
  const named = data.cases
    .filter((c) => c.names.length)
    .sort((a, b) => a.family.localeCompare(b.family) || a.count - b.count);
  if (!named.length) return el("div");

  const head = el("thead", {}, el("tr", {},
    el("th", {}, "Họ"),
    el("th", {}, "Tên"),
    el("th", {}, "Nhận dạng"),
    el("th", { class: "num" }, "Động tác"),
    el("th", {}, "Thuật toán")));

  const body = el("tbody", {}, named.map((r) => {
    const nameCell = el("td", { class: "name" },
      el("b", {}, r.names[0]),
      el("div", { class: "tiny muted" }, r.desc.pattern));
    const recogCell = el("td", {},
      r.teach ? r.teach.recognise : r.desc.permutation,
      el("div", { class: "tiny muted" }, r.desc.pattern));
    const algCell = el("td", {}, el("code", { class: "tiny" }, r.text || "—"));
    const tr = el("tr", { class: "is-named", style: { cursor: "pointer" } },
      el("td", { class: "name" }, r.familyLabel || r.family),
      nameCell, recogCell,
      el("td", { class: "num" }, String(r.count)),
      algCell);
    tr.addEventListener("click", () => openCase(r));
    return tr;
  }));

  const table = el("table", { class: "table" }, head, body);
  const wrap = el("div", { class: "table-wrap" }, table);
  const panelHead = el("div", { class: "panel__head" },
    el("h3", {}, "Bảng nhận dạng tham chiếu"),
    el("span", { class: "spacer" }),
    chip(`${named.length} bài có tên`, "gold"),
    chip("nhận dạng trước, thuộc sau", "sky"));
  const intro = el("p", { class: "small muted", style: { maxWidth: "78ch" } },
    "Lướt bảng này để học nhận dạng. Mỗi hàng là một bài: tên, nhận dạng bạn thấy trên khối, và thuật toán. Nhớ hình nhận dạng trước -- nhận ra bài là bước đầu tiên của việc giải nhanh.");
  return el("section", { class: "panel" }, panelHead, intro, wrap);
}

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
    familyRecognise(),
    reference,
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
