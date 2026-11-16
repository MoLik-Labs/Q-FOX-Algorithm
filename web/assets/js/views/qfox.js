/**
 * Q-FOX: toàn bộ phương pháp trên một khối, chia theo cấp độ easy → full.
 *
 * Đây là góc nhìn tổng hợp của Q-FOX: bốn cấp độ từ mới làm quen đến
 * full (không cần nhớ, tra sách), tất cả hướng vào một mục tiêu chung --
 * tối đa hóa tốc độ giải hết. Mỗi cấp hiển thị con số engine thực nghiệm
 * (htm, qtm, stm, thời gian giải) để bạn thấy bước nhảy tốc độ ở mỗi
 * nấc, và trực tiếp nhảy vào luyện tập cấp đó.
 */
import { data, level, levelKeys, caseByKey, totals } from "../data.js";
import { el, mount, chip, num, int } from "../util.js";
import { learnedCount, isLearned } from "../store.js";

const TIER_TONE = { easy: "sky", medium: "mint", hard: "gold", full: "fox" };
const TIER_TAG = { easy: "easy", medium: "medium", hard: "hard", full: "full" };

export function render(params = {}) {
  const view = el("div");
  const t = totals();
  const levels = data.levelsList; // easy, medium, hard, full -- đúng thứ tự
  const speedOrder = levels.slice().sort(
    (a, b) => (a.benchmark ? a.benchmark.htm : 999) - (b.benchmark ? b.benchmark.htm : 999));

  /* ------------------------------------------------------- báo cáo tốc độ */
  const speedCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Con số tốc độ của engine"),
      el("span", { class: "spacer" }),
      chip("cùng 20 cú trộn, bảng đã warm", "sky")),
    el("p", { class: "small muted" },
      "Mỗi cấp độ được engine giải lại trên 20 cú trộn giống nhau. htm là tổng cú xoay mặt (quarter/half tính 1), ",
      "qtm tính quarter là 1, stm là cách đếm speedcubing (mỗi cú xoay 1). Thời gian giải là engine thực tế, ",
      "không phải ước lượng. Cấp càng cao, tổng động tác càng giảm -- đó là tốc độ bạn có thể hướng tới."),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Cấp độ"), el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "qtm"),
          el("th", { class: "num" }, "stm"), el("th", { class: "num" }, "thời gian"),
          el("th", { class: "num" }, "thuật toán"))),
        el("tbody", {}, speedOrder.map((lv) => {
          const b = lv.benchmark;
          const b2 = speedOrder;
          return el("tr", {},
            el("td", { class: "name" },
              el("a", { href: `#/levels/${lv.key}` }, lv.title),
              el("div", { class: "tiny muted" }, lv.how)),
            el("td", { class: "num" }, num(b.htm, 2)),
            el("td", { class: "num" }, num(b.qtm, 2)),
            el("td", { class: "num" }, num(b.stm, 2)),
            el("td", { class: "num" }, `${num(b.seconds, 2)} s`),
            el("td", { class: "num muted" }, int(lv.distinct_algorithms)));
        })))),
    el("p", { class: "tiny muted", style: { marginTop: "8px" } },
      `${int(data.book.found)} / ${int(t.elements)} trạng thái đã có trong sách -- cấp full dùng chính sách này, `,
      "không cần nhớ: hai khối, rồi tra tên bài để lấy bước ngắn nhất có chứng minh."));

  /* ------------------------------------------------------- từng nấc cấp độ */
  const ladder = el("div", { class: "stack" });
  for (const lv of levels) {
    const keys = levelKeys(lv.key);
    const rows = keys.map(caseByKey).filter(Boolean);
    const learned = learnedCount(keys);
    const pct = rows.length ? Math.round((learned / rows.length) * 100) : 0;
    const b = lv.benchmark;
    const tone = TIER_TONE[lv.key] || "fox";

    const stageNodes = (lv.stages || []).map((s, i) => {
      const head = el("div", { class: "step__t" }, el("code", {}, s.name),
        s.algs ? chip(`${s.algs} thuật toán`, "fox") : chip("tìm kiếm", "sky"),
        s.intuitive ? chip("cảm tính", "mint") : null);
      const desc = el("div", { class: "step__d" }, s.note || "");
      const num = el("div", { class: "step__n" }, String(i + 1));
      const inner = el("div", {}, head, desc);
      return el("div", { class: "step" }, num, inner);
    });
    const steps = el("div", { class: "timeline" }, stageNodes);

    const curriculum = (lv.curriculum || []).map((item) => {
      const itemRows = item.cases.map(caseByKey).filter(Boolean);
      const itemLearned = itemRows.filter((r) => isLearned(r.key)).length;
      return el("div", { class: "panel", style: { padding: "12px 14px" } },
        el("div", { class: "panel__head", style: { marginBottom: "4px" } },
          el("h3", { style: { fontSize: "15px" } }, item.title),
          el("span", { class: "spacer" }),
          chip(item.family, "fox"),
          chip(`${item.to_learn} bài`, "sky"),
          chip(`${num(item.mean_moves, 2)} động tác`, "mint")),
        el("p", { class: "small muted" }, item.why),
        progressBar(itemLearned, itemRows.length, `${itemLearned}/${itemRows.length} đã thuộc`));
    });

    const card = el("div", { class: "panel level-card" },
      el("div", { class: "panel__head" },
        el("span", { class: "level-card__n" }, String(levels.indexOf(lv) + 1)),
        el("h3", {}, lv.title),
        el("span", { class: "spacer" }),
        chip(TIER_TAG[lv.key], tone)),
      el("div", { class: "row row--tight", style: { marginBottom: "8px" } },
        el("p", { class: "small" }, lv.promise),
        el("span", { class: "spacer" }),
        chip(`${rows.length} thẻ`, "gold"),
        chip(`${learned} đã thuộc`, learned ? "mint" : null)),
      el("p", { class: "tiny muted", style: { marginBottom: "8px" } }, lv.method),
      b ? el("div", { class: "stats", style: { marginBottom: "10px" } },
        stat(num(b.htm, 2), "htm", "tổng xoay mặt"),
        stat(num(b.qtm, 2), "qtm", "quarter-turn"),
        stat(num(b.stm, 2), "stm", "cú xoay speedcubing"),
        stat(`${num(b.seconds, 2)} s`, "giải", "trên 20 cú trộn")) : null,
      progressBar(learned, rows.length, `${pct}% của cấp này`),
      el("div", { class: "row row--tight", style: { marginTop: "10px" } },
        el("a", { class: "btn btn--sm btn--primary", href: `#/levels/${lv.key}` }, "Mở cấp này"),
        el("a", { class: "btn btn--sm", href: `#/trainer?level=${lv.key}` }, `Luyện ${learned ? rows.length - learned : rows.length} thẻ`)),
      el("div", { class: "section-head", style: { marginTop: "12px" } },
        el("h2", { style: { fontSize: "15px" } }, "Các bài học trong cấp")),
      el("div", { class: "stack" }, ...curriculum));

    ladder.append(card);
  }

  /* -------------------------------------------------------------- kết luận */
  const fastest = speedOrder[0];
  const summary = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Tối đa hóa tốc độ giải hết"),
      el("span", { class: "spacer" }),
      chip(`cấp nhanh nhất: ${fastest.title}`, "mint")),
    el("p", { class: "small muted" },
      `Toàn bộ Q-FOX là một đường leo dốc: từ ${int(levels[0].distinct_algorithms)} thuật toán ở cấp easy, `,
      `lên ${int(levels[1].distinct_algorithms)} ở medium, ${int(levels[2].distinct_algorithms)} ở hard, và cuối cùng là cấp full -- `,
      `không cần nhớ, chỉ cần tra sách. Mỗi nấc giảm số động tác phải thực hiện, và con số ${num(fastest.benchmark.htm, 2)} htm `,
      "của cấp nhanh nhất là mức bạn có thể hướng tới khi thuộc hết lộ trình."),
    el("div", { class: "row row--tight", style: { marginTop: "10px" } },
      el("a", { class: "btn btn--primary", href: `#/trainer?level=${fastest.key}` }, "Luyện cấp nhanh nhất"),
      el("a", { class: "btn", href: `#/levels/${fastest.key}` }, "Xem cấp đó"),
      el("a", { class: "btn btn--ghost", href: "#/builder" }, "Tạo công thức của riêng bạn")));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Q-FOX · toàn bộ khối"),
        el("p", { class: "panel__note" },
          "Toàn bộ phương pháp Q-FOX trên khối rubik đầy đủ, chia bốn cấp độ easy → full. ",
          "Mọi cấp đều hướng vào một mục tiêu: tối đa hóa tốc độ giải hết.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${levels.length} cấp độ`, "fox"),
        chip("easy → full", "gold"),
        chip(`${int(t.cases)} bài`, "sky"))),
    speedCard,
    el("div", { class: "section-head" }, el("h2", {}, "Thang leo cấp độ"),
      el("span", { class: "panel__note" }, "đi từ dễ đến khó, mỗi nấc đều có con số tốc độ thực tế")),
    ladder,
    el("div", { class: "section-head" }, el("h2", {}, "Hướng tối đa tốc độ")),
    summary);

  return { node: view };
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}

function progressBar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el("div", { class: "progress" },
    el("div", { class: "progress__track" },
      el("div", { class: "progress__fill", style: { width: `${pct}%` } })),
    el("span", { class: "progress__label" }, label));
}
