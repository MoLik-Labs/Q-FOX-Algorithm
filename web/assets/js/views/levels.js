/**
 * Cấp độ: bốn tầng từ "chưa giải được lần nào" đến "ít động tác nhất có
 * thể", mỗi tầng có phương pháp đằng sau, các bài học yêu cầu, và tiến
 * trình của bạn.
 */
import { data, levelKeys, caseByKey, METRIC_HINT } from "../data.js";
import { el, mount, chip, num, int, progressBar, emptyState } from "../util.js";
import { caseCard, openCase } from "../parts.js";
import { learnedCount, isLearned } from "../store.js";

export function render(params = {}) {
  const key = params.key || null;
  if (key) return detail(key);
  return overview();
}

/* --------------------------------------------------------------- tổng quan */

function overview() {
  const view = el("div");
  const cards = el("div", { class: "stack" });

  for (const lv of data.levelsList) {
    const keys = levelKeys(lv.key);
    const done = learnedCount(keys);
    const rows = keys.map(caseByKey).filter(Boolean);
    const toLearn = rows.filter((r) => r.moves.length).length;

    const head = el("div", { class: "panel__head" },
      el("h2", {}, lv.title),
      el("span", { class: "spacer" }),
      chip(lv.algs + " thuật toán của engine", "fox"),
      chip(`${toLearn} bài cần thuộc`, "gold"),
      lv.benchmark ? chip(`${num(lv.benchmark.htm, 1)} htm · ${num(lv.benchmark.seconds, 2)} s`, "mint") : null);

    const left = el("div", {},
      el("p", {}, el("b", {}, "Dành cho: "), lv.who),
      el("p", {}, el("b", {}, "Bạn được gì: "), lv.promise),
      el("p", { class: "small muted" }, lv.method),
      el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted" }, "Lộ trình:"),
        el("code", { class: "tiny" }, lv.path)),
      el("div", { style: { marginTop: "12px" } }, progressBar(done, keys.length, `${done}/${keys.length} đã thuộc`)),
      el("div", { class: "row", style: { marginTop: "14px" } },
        el("a", { class: "btn btn--primary btn--sm", href: `#/levels/${lv.key}` }, "Mở cấp này"),
        el("a", { class: "btn btn--sm", href: `#/trainer?level=${lv.key}` }, `Luyện ${toLearn} thẻ`)));

    const curriculum = el("div", { class: "stack" },
      (lv.curriculum || []).map((item) => {
        const itemHead = el("div", { class: "set-item__head" },
          el("span", { class: "set-item__title" }, item.title),
          el("span", { class: "spacer" }),
          chip(item.family, "fox"),
          chip(`${item.to_learn} thuật toán`),
          chip(`${num(item.mean_moves, 1)} động tác trung bình`, "mint"));
        return el("div", { class: "set-item" }, itemHead,
          el("p", { class: "tiny muted", style: { marginTop: "6px" } }, item.why));
      }));

    cards.append(el("article", { class: "panel level-card" },
      el("span", { class: "level-card__n" }, String(lv.title.split(" ")[1] || "")),
      head,
      el("div", { class: "split" }, left,
        el("div", {},
          el("h3", {}, "Các bài học"),
          curriculum))));
  }


  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Bốn cấp độ"),
        el("p", { class: "panel__note" },
          "Cùng một khối, bốn mức độ thuộc lòng khác nhau. Bắt đầu từ nơi bạn đang đứng, ",
          "vào cấp trên khi cấp dưới cảm thấy chậm.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${int(data.cases.length)} bài trong bản xuất`, "sky"),
        chip(`${int(data.levelsList.reduce((n, l) => n + l.distinct_algorithms, 0))} thuật toán trên bốn cấp`, "gold"))),
    cards,
    methodPanel(),
    compare());

  return { node: view };
}

/** Phương pháp học chung: kỹ thuật thuộc thuật toán nhanh và nhớ lâu. */
function methodPanel() {
  const steps = [
    { n: "1", t: "Nhận dạng trước, thuộc sau", d: "Nhìn sơ đồ lớp trên, gọi tên bài trước khi mở thẻ. Nhận dạng là phần bạn thực sự dùng khi giải nhanh — thuộc thuật toán mà không nhận ra bài thì vô dụng." },
    { n: "2", t: "Chia thành cụm", d: "Không đọc thuật toán như một dãy dài. Chia thành cụm hai hoặc ba động tác. Cửa sổ bài tự làm việc này — chọn 2 hoặc 3 động tác một cụm." },
    { n: "3", t: "Xây từng cụm trên khối", d: "Đặt khối hoàn chỉnh, chạy cụm 1, nhận diện điều nó tạo ra, rồi chạy cụm 2. Thuộc hình ảnh của cụm trên khối, không chỉ ký hiệu." },
    { n: "4", t: "Hé đáp án, tự hoàn thành", d: "Trong bài luyện, bấm Hiện cụm để hé đáp án từng nhóm, rồi tự nêu cụm còn lại trong đầu trước khi nhìn tiếp. Kỹ thuật này ghi nhớ mạnh hơn đọc cả hàng một lần." },
    { n: "5", t: "Nhập và đạt đích", d: "Nhập toàn bộ thuật toán. Đánh giá không phải bằng so chuỗi, mà bằng việc thuật toán của bạn thực sự đưa khối tới đích trên chính bảng của engine." },
    { n: "6", t: "Ngắn nhất trước", d: "Khi thuộc xong, học từ ngắn nhất của engine bên cạnh thuật toán quen thuộc. Bấm W trong cửa sổ bài để đổi và xem cả hai chạy." },
  ];
  return el("section", { class: "panel", style: { marginTop: "20px" } },
    el("div", { class: "panel__head" }, el("h3", {}, "Phương pháp học — thuộc nhanh, nhớ lâu")),
    el("p", { class: "small muted", style: { maxWidth: "80ch" } },
      "Cả bốn cấp độ đều dùng cùng một cách học. Làm theo sáu bước này với mỗi bài, bạn thuộc thuật toán đúng cách người phá kỷ lục làm — và nhớ chúng đủ lâu để dùng trong giải thực sự."),
    el("div", { class: "timeline" }, steps.map((s) =>
      el("div", { class: "step" },
        el("div", { class: "step__n" }, s.n),
        el("div", {},
          el("div", { class: "step__t" }, s.t),
          el("div", { class: "step__d" }, s.d))))));
}

/** So sánh cấp này với cấp kia, trả lời "cấp tiếp theo có đáng không?". */
function compare() {
  const rows = data.levelsList.map((lv) => {
    const keys = levelKeys(lv.key);
    const rowsForLevel = keys.map(caseByKey).filter(Boolean).filter((r) => r.tokens.length);
    const mean = rowsForLevel.length
      ? rowsForLevel.reduce((s, r) => s + r.count, 0) / rowsForLevel.length : 0;
    return { lv, count: rowsForLevel.length, mean, distinct: lv.distinct_algorithms };
  });
  return el("section", { class: "panel", style: { marginTop: "20px" } },
    el("div", { class: "panel__head" }, el("h3", {}, "Mỗi cấp tốn gì, và trả lại gì")),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Cấp độ"),
          el("th", { class: "num" }, "Thuật toán riêng"),
          el("th", { class: "num", title: METRIC_HINT }, "Độ dài trung bình"),
          el("th", { class: "num" }, "Độ dài giải (benchmark)"),
          el("th", { class: "num" }, "Thời gian giải"),
          el("th", {}, "Phương pháp"))),
        el("tbody", {}, rows.map(({ lv, distinct, mean }) => el("tr", {},
          el("td", { class: "name" },
            el("a", { href: `#/levels/${lv.key}` }, lv.title)),
          el("td", { class: "num" }, String(distinct)),
          el("td", { class: "num" }, num(mean, 2)),
          el("td", { class: "num" }, lv.benchmark ? num(lv.benchmark.htm, 2) : "—"),
          el("td", { class: "num" }, lv.benchmark ? `${num(lv.benchmark.seconds, 2)} s` : "—"),
          el("td", {}, el("code", { class: "tiny" }, lv.path))))))),
    el("p", { class: "tiny muted", style: { marginTop: "10px" } },
      "Độ dài và thời gian giải đến từ ", el("code", {}, "scripts/bench.py"),
      " trên cùng ", String((data.benchmark.meta || {}).scrambles || 0),
      " cú trộn theo luật WCA cho mọi phương pháp, với mọi câu trả lời được chạy lại và kiểm chứng."));
}

/* ----------------------------------------------------------------- chi tiết */

function detail(key) {
  const lv = data.levelsList.find((l) => l.key === key);
  const view = el("div");
  if (!lv) {
    mount(view, emptyState("Không có cấp độ này", "Chọn một cấp từ trang Cấp độ."));
    return { node: view };
  }
  const keys = levelKeys(key);
  const rows = keys.map(caseByKey).filter(Boolean);

  const sets = el("div", { class: "stack" });
  for (const item of lv.curriculum || []) {
    const itemRows = item.cases.map((c) => caseByKey(c.key)).filter(Boolean);
    const learned = itemRows.filter((r) => isLearned(r.key)).length;
    const body = el("div", { class: "grid grid--cases" },
      itemRows.map((r) => caseCard(r, { onOpen: openCase })));

    sets.append(el("section", { class: "panel" },
      el("div", { class: "panel__head" },
        el("h3", {}, item.title),
        el("span", { class: "spacer" }),
        chip(item.family, "fox"),
        chip(`${item.to_learn} bài cần học`),
        chip(`${num(item.mean_moves, 2)} động tác trung bình`, "mint"),
        el("a", { class: "btn btn--sm", href: `#/trainer?level=${key}&set=${item.id}` }, "Luyện bài học này")),
      el("p", { class: "small muted" }, item.why),
      el("p", { class: "tiny muted" },
        "Mục tiêu: ", el("code", {}, item.goal), " · ",
        String(item.selected), " bài trong bài học, ", String(learned), " bài đã đánh dấu thuộc"),
      progressBar(learned, itemRows.length, `${learned}/${itemRows.length} đã thuộc`),
      body));
  }

  const stages = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Engine giải nó như thế nào"),
      el("span", { class: "spacer" }),
      el("code", { class: "tiny" }, lv.path)),
    el("p", { class: "small muted" }, lv.method),
    el("div", { class: "timeline" }, (lv.stages || []).map((s, i) =>
      el("div", { class: "step" },
        el("div", { class: "step__n" }, String(i + 1)),
        el("div", {},
          el("div", { class: "step__t" }, el("code", {}, s.name),
            s.algs ? chip(`${s.algs} thuật toán`, "fox") : chip("tìm kiếm", "sky"),
            s.intuitive ? chip("cảm tính", "mint") : null),
          el("div", { class: "step__d" }, s.note || ""))))),
    lv.benchmark ? el("div", { class: "stats", style: { marginTop: "14px" } },
      stat(num(lv.benchmark.htm, 2), "htm trung bình", `trên ${lv.benchmark.scrambles} cú trộn`),
      stat(num(lv.benchmark.qtm, 2), "qtm trung bình", "chỉ số quarter-turn"),
      stat(`${num(lv.benchmark.seconds, 2)} s`, "thời gian giải trung bình", "engine, bảng đã warm"),
      stat(`${lv.benchmark.solved}/${lv.benchmark.scrambles}`, "giải xong", "được chạy lại và kiểm chứng")) : null);

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("a", { class: "tiny muted", href: "#/levels" }, "← tất cả cấp độ"),
        el("h1", {}, lv.title),
        el("p", { class: "panel__note" }, lv.promise)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(lv.who, "sky"),
        chip(`${rows.length} thẻ trong cấp này`, "gold"),
        el("a", { class: "btn btn--sm btn--primary", href: `#/trainer?level=${key}` }, "Bắt đầu luyện"))),
    stages,
    el("div", { class: "section-head" }, el("h2", {}, "Các thuật toán")),
    sets);

  return { node: view };
}

function stat(value, key, sub = "") {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, key),
    el("div", { class: "stat__v" }, value),
    sub ? el("div", { class: "stat__s" }, sub) : null);
}
