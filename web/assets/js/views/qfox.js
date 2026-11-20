/**
 * Q-FOX: công thức tinh hoa trên một khối.
 *
 * Q-FOX đã được chắt lọc về một phương pháp duy nhất: khai màn bằng hai
 * khối (2x2x3 rồi 1x2x3 đối diện) để mở khóa sách tra, rồi lớp cuối hoàn
 * tất trong một bước tối ưu có chứng minh. Không cần nhớ thuật toán giải --
 * đây là cách nhanh nhất một lớp cuối 3x3 có thể hoàn thành.
 *
 * Trang này trình bày con số tốc độ thực nghiệm, bốn bước của công thức,
 * và tờ công thức chuẩn tinh hoa: mười bảy thuật toán nhận dạng để luyện
 * tập (bộ nhận dạng ít nhất vẫn giải hết lớp cuối), đi kèm mục tiêu và
 * tiến trình học. Nhận dạng là để người dùng luyện; còn giải thì sách tra
 * trả trong một bước, không cần nhớ.
 */
import { data, level, levelKeys, caseByKey, totals } from "../data.js";
import { el, mount, chip, num, int, toast } from "../util.js";
import { exportCasesPng, exportCasesPdf } from "../export.js";
import { exportCasesPdfFile } from "../pdffile.js";
import { learnedCount, isLearned } from "../store.js";

export function render(params = {}) {
  const view = el("div");
  const t = totals();
  const lv = data.levelsList[0];        // essence -- level duy nhất
  const keys = levelKeys(lv.key);
  const rows = keys.map(caseByKey).filter(Boolean);
  const learned = learnedCount(keys);
  const b = lv.benchmark;

  /* ------------------------------------------------------- báo cáo tốc độ */
  const speedCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Con số tốc độ của engine"),
      el("span", { class: "spacer" }),
      chip("cùng 20 cú trộn, bảng đã warm", "sky"),
      el("button", { class: "btn btn--sm", type: "button", title: "Tải file PDF tờ công thức tinh hoa",
        onClick: async () => {
          toast("Đang tạo file PDF…", "info");
          await exportCasesPdfFile(data.cases, { title: "Q-FOX · Tinh hoa", detail: true, chapters: true, filename: "qfox-essence" });
          toast("Đã tải file PDF -- in ra học", "ok");
        } }, "Tải PDF"),
      el("button", { class: "btn btn--sm", type: "button", title: "Mở cửa sổ in",
        onClick: () => exportCasesPdf(data.cases, { title: "Q-FOX · Tinh hoa", subtitle: `${data.cases.length} bài · ${new Date().toLocaleDateString("vi-VN")}` }) }, "In"),
      el("button", { class: "btn btn--sm", type: "button", title: "Xuất ảnh PNG",
        onClick: () => { toast("Đang vẽ ảnh PNG…", "info"); exportCasesPng(data.cases, { title: "Q-FOX · Tinh hoa", cols: 4, filename: "qfox-essence" }); } }, "PNG")),
    el("p", { class: "small muted" },
      "Engine giải lại Q-FOX trên 20 cú trộn. htm là tổng cú xoay mặt (quarter/half tính 1), ",
      "qtm tính quarter là 1, stm là cách đếm speedcubing. Thời gian giải là engine thực tế. ",
      "Lớp cuối hoàn tất trong một bước sách tra có chứng minh -- ngắn nhất một lớp cuối 3x3 ",
      "có thể đạt được, nhanh hơn CFOP, Roux, ZZ và mọi phương pháp khác."),
    b ? el("div", { class: "stats" },
      stat(num(b.htm, 2), "htm", "tổng xoay mặt"),
      stat(num(b.qtm, 2), "qtm", "quarter-turn"),
      stat(num(b.stm, 2), "stm", "cú xoay speedcubing"),
      stat(`${num(b.seconds, 2)} s`, "giải", "trên 20 cú trộn")) : null,
    el("p", { class: "tiny muted", style: { marginTop: "8px" } },
      `${int(data.book.found)} / ${int(t.elements)} trạng thái lớp cuối đã có trong sách -- `,
      "mỗi trạng thái có bước ngắn nhất có chứng minh, tra trong micro giây."));

  /* ------------------------------------------------------------ công thức */
  const stageNodes = (lv.stages || []).map((s, i) => {
    const head = el("div", { class: "step__t" }, el("code", {}, s.name),
      s.algs ? chip(`${s.algs} thuật toán`, "fox") : chip("tìm kiếm", "sky"),
      s.intuitive ? chip("cảm tính", "mint") : null);
    const desc = el("div", { class: "step__d" }, s.note || "");
    const num2 = el("div", { class: "step__n" }, String(i + 1));
    return el("div", { class: "step" }, num2, el("div", {}, head, desc));
  });
  const steps = el("div", { class: "timeline" }, stageNodes);

  const methodCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Công thức tinh hoa"),
      el("span", { class: "spacer" }), chip("4 bước", "fox"), chip("0 alg giải", "mint")),
    el("p", { class: "small" }, lv.method),
    steps);

  /* ------------------------------------------ tờ công thức chuẩn tinh hoa */
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

  const sheetCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Tờ công thức chuẩn tinh hoa"),
      el("span", { class: "spacer" }),
      chip(`${lv.distinct_algorithms} thuật toán`, "gold"),
      chip("nhận dạng để luyện", "sky"),
      chip("2 màu in được", "mint")),
    el("p", { class: "small muted" },
      "Mười bảy thuật toán nhận dạng -- bộ ít nhất vẫn giải hết lớp cuối. Đây là ",
      "phần bạn cần học để nhận ra từng dạng lớp cuối; còn bước giải thực tế thì ",
      "sách tra trả trong một bước tối ưu, không cần nhớ. Học theo thứ tự: cross ",
      "trên mặt trên, lấp mặt trên, góc vào khe, rồi cạnh vào khe."),
    el("div", { class: "row row--tight", style: { marginBottom: "12px" } },
      el("button", { class: "btn btn--sm btn--primary", type: "button",
        title: "Tải file PDF 2 màu đen/trắng -- in ra học được",
        onClick: async () => {
          toast("Đang tạo file PDF 2 màu…", "info");
          await exportCasesPdfFile(data.cases, { title: "Q-FOX · Tinh hoa · 2 màu", detail: true, chapters: true, bw: true, filename: "qfox-essence-bw" });
          toast("Đã tải file PDF 2 màu -- in ra học", "ok");
        } }, "Tải PDF 2 màu"),
      el("button", { class: "btn btn--sm", type: "button",
        title: "In tờ công thức 2 màu",
        onClick: () => exportCasesPdf(data.cases, { title: "Q-FOX · Tinh hoa · 2 màu", subtitle: `${data.cases.length} bài · ${new Date().toLocaleDateString("vi-VN")}`, detail: true, chapters: true, bw: true }) }, "In 2 màu"),
      el("button", { class: "btn btn--sm", type: "button",
        title: "Xuất ảnh PNG 2 màu",
        onClick: () => { toast("Đang vẽ ảnh PNG 2 màu…", "info"); exportCasesPng(data.cases, { title: "Q-FOX · Tinh hoa · 2 màu", cols: 3, detail: true, bw: true, filename: "qfox-essence-bw" }); } }, "PNG 2 màu")),
    el("div", { class: "stack" }, ...curriculum));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Q-FOX · Tinh hoa"),
        el("p", { class: "panel__note" },
          "Công thức Q-FOX chắt lọc về một phương pháp: hai khối mở khóa, lớp ",
          "cuối một bước sách tra tối ưu. Nhanh nhất, ít công thức cần nhớ nhất.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip("1 cấp độ", "fox"),
        chip(`${int(t.cases)} bài`, "sky"),
        chip(`${lv.distinct_algorithms} alg`, "gold"))),
    speedCard,
    el("div", { class: "section-head" }, el("h2", {}, "Công thức"),
      el("span", { class: "panel__note" }, "bốn bước, không cần nhớ thuật toán giải")),
    methodCard,
    el("div", { class: "section-head" }, el("h2", {}, "Tờ công thức tinh hoa"),
      el("span", { class: "panel__note" }, `${lv.distinct_algorithms} thuật toán nhận dạng, theo thứ tự dễ hiểu`)),
    sheetCard,
    el("div", { class: "section-head" }, el("h2", {}, "Bắt đầu luyện")),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Lộ trình luyện tập"),
        el("span", { class: "spacer" }),
        chip(`${learned}/${rows.length} đã học`, learned ? "mint" : null)),
      el("p", { class: "small muted" },
        "Xem từng bài, chơi thuật toán để nhìn nó làm gì, thuộc từng cụm, đánh ",
        "dấu xong và chuyển bài. Tiến trình được vạch ra ở trang Học."),
      el("div", { class: "row row--tight", style: { marginTop: "10px" } },
        el("a", { class: "btn btn--primary", href: `#/learn?level=${lv.key}` }, "Mở trang học"),
        el("a", { class: "btn", href: `#/trainer?level=${lv.key}` }, `Luyện ${rows.length - learned} thẻ`),
        el("a", { class: "btn btn--ghost", href: "#/builder" }, "Tạo công thức riêng"))));

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
