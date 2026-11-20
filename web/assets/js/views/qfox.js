/**
 * Q-FOX: công thức tinh hoa trên một khối, và các bản dành cho người.
 *
 * Q-FOX đã được chắt lọc về một phương pháp duy nhất: khai màn bằng hai
 * khối (2x2x3 rồi 1x2x3 đối diện) để mở khóa sách tra, rồi lớp cuối hoàn
 * tất trong một bước tối ưu có chứng minh. Không cần nhớ thuật toán giải --
 * đây là cách nhanh nhất một lớp cuối 3x3 có thể hoàn thành.
 *
 * Cùng một công thức, cùng một engine, được chia thành các bản nhận diện
 * khác nhau dành cho người học. Cứt công thức cần nhớ từ nhiều (easy) đến
 * ít (flow), còn tốc độ giải thì sách tra vẫn trả mỗi bước trong bước tối
 * ưu -- bản nào cũng nhanh, chỉ khác mức độ nhận diện phải nhớ.
 *
 *    tinh hoa  một bước sách tra, không cần nhận diện
 *    easy      OLL rồi PLL -- nhận diện đầy đủ nhất
 *    medium    CMLL rồi PLL
 *    tiny      COLL, bản gọn
 *    low       CMLL, phần còn lại sách tra
 *    flow      cả lớp cuối một bước sách tra, ít công thức nhất
 *
 * Trang này trình bày con số tốc độ thực nghiệm, các bước của công thức,
 * và tờ công thức của bản đang chọn: các thuật toán nhận dạng để luyện
 * tập, đi kèm mục tiêu và tiến trình học. Nhận dạng là để người dùng
 * luyện; còn giải thì sách tra trả trong bước tối ưu, không cần nhớ.
 */
import { data, level, levelKeys, caseByKey, totals } from "../data.js";
import { el, mount, chip, num, int, toast } from "../util.js";
import { exportCasesPng, exportCasesPdf } from "../export.js";
import { exportCasesPdfFile } from "../pdffile.js";
import { learnedCount, isLearned } from "../store.js";

// Các bản Q-FOX, theo thứ tự từ công thức nhiều đến ít.
const TIERS = ["essence", "easy", "medium", "tiny", "low", "flow"];

export function render(params = {}, query = {}) {
  const view = el("div");
  const t = totals();
  const allLevels = data.levelsList;
  // Bản được chọn: từ deep-link (?level=...), nếu có, ngược lại bản đầu tiên.
  const want = (query && query.level) || TIERS[0];
  const lv = allLevels.find((l) => l.key === want) || allLevels[0];
  const keys = levelKeys(lv.key);
  const rows = keys.map(caseByKey).filter(Boolean);
  const learned = learnedCount(keys);
  const b = lv.benchmark;
  const tierIdx = TIERS.indexOf(lv.key);

  // Bộ chọn bản: mỗi bản là một nút, đánh dấu bản đang chọn.
  const selector = el("div", { class: "row row--tight", style: { flexWrap: "wrap" } },
    ...TIERS.map((key) => {
      const l2 = allLevels.find((l) => l.key === key);
      const on = key === lv.key;
      return el("button", {
        class: `btn btn--sm ${on ? "btn--primary" : ""}`,
        type: "button",
        title: l2 ? l2.who : "",
        onClick: () => { location.hash = `#/qfox?level=${key}`; },
      }, `${labelOf(key)} · ${l2 ? l2.distinct_algorithms : 0}`);
    }));

  /* ------------------------------------------------------- báo cáo tốc độ */
  const speedCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, `Con số tốc độ của engine · ${labelOf(lv.key)}`),
      el("span", { class: "spacer" }),
      chip("cùng 20 cú trộn, bảng đã warm", "sky"),
      el("button", { class: "btn btn--sm", type: "button", title: `Tải file PDF tờ công thức ${labelOf(lv.key)}`,
        onClick: async () => {
          toast("Đang tạo file PDF…", "info");
          await exportCasesPdfFile(rows, { title: `Q-FOX · ${labelOf(lv.key)}`, detail: true, chapters: true, filename: `qfox-${lv.key}` });
          toast("Đã tải file PDF -- in ra học", "ok");
        } }, "Tải PDF"),
      el("button", { class: "btn btn--sm", type: "button", title: "Mở cửa sổ in",
        onClick: () => exportCasesPdf(rows, { title: `Q-FOX · ${labelOf(lv.key)}`, subtitle: `${rows.length} bài · ${new Date().toLocaleDateString("vi-VN")}` }) }, "In"),
      el("button", { class: "btn btn--sm", type: "button", title: "Xuất ảnh PNG",
        onClick: () => { toast("Đang vẽ ảnh PNG…", "info"); exportCasesPng(rows, { title: `Q-FOX · ${labelOf(lv.key)}`, cols: 4, filename: `qfox-${lv.key}` }); } }, "PNG")),
    el("p", { class: "small muted" },
      "Engine giải lại Q-FOX trên 20 cú trộn. htm là tổng cú xoay mặt (quarter/half tính 1), ",
      "qtm tính quarter là 1, stm là cách đếm speedcubing. Thời gian giải là engine thực tế. ",
      "Lớp cuối hoàn tất bằng sách tra -- mỗi bước là bước tối ưu có chứng minh, ",
      "nhanh hơn CFOP, Roux, ZZ và mọi phương pháp khác."),
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
  const nStages = (lv.stages || []).length;
  const algsTot = (lv.stages || []).reduce((n, s) => n + (s.algs || 0), 0);

  const methodCard = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, `Công thức · ${labelOf(lv.key)}`),
      el("span", { class: "spacer" }),
      chip(`${nStages} bước`, "fox"),
      algsTot ? chip(`${algsTot} alg nhận diện`, "gold") : chip("0 alg giải", "mint")),
    el("p", { class: "small" }, lv.method),
    steps);

  /* ---------------- tờ công thức của bản đang chọn */
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
    el("div", { class: "panel__head" }, el("h3", {}, `Tờ công thức · ${labelOf(lv.key)}`),
      el("span", { class: "spacer" }),
      chip(`${lv.distinct_algorithms} thuật toán`, "gold"),
      chip("nhận dạng để luyện", "sky"),
      chip("2 màu in được", "mint")),
    el("p", { class: "small muted" },
      `${lv.distinct_algorithms} thuật toán nhận dạng của bản ${labelOf(lv.key)} -- `,
      "phần bạn cần học để nhận ra từng dạng lớp cuối; còn bước giải thực tế thì ",
      "sách tra trả trong bước tối ưu, không cần nhớ."),
    el("div", { class: "row row--tight", style: { marginBottom: "12px" } },
      el("button", { class: "btn btn--sm btn--primary", type: "button",
        title: "Tải file PDF 2 màu đen/trắng -- in ra học được",
        onClick: async () => {
          toast("Đang tạo file PDF 2 màu…", "info");
          await exportCasesPdfFile(rows, { title: `Q-FOX · ${labelOf(lv.key)} · 2 màu`, detail: true, chapters: true, bw: true, filename: `qfox-${lv.key}-bw` });
          toast("Đã tải file PDF 2 màu -- in ra học", "ok");
        } }, "Tải PDF 2 màu"),
      el("button", { class: "btn btn--sm", type: "button",
        title: "In tờ công thức 2 màu",
        onClick: () => exportCasesPdf(rows, { title: `Q-FOX · ${labelOf(lv.key)} · 2 màu`, subtitle: `${rows.length} bài · ${new Date().toLocaleDateString("vi-VN")}`, detail: true, chapters: true, bw: true }) }, "In 2 màu"),
      el("button", { class: "btn btn--sm", type: "button",
        title: "Xuất ảnh PNG 2 màu",
        onClick: () => { toast("Đang vẽ ảnh PNG 2 màu…", "info"); exportCasesPng(rows, { title: `Q-FOX · ${labelOf(lv.key)} · 2 màu`, cols: 3, detail: true, bw: true, filename: `qfox-${lv.key}-bw` }); } }, "PNG 2 màu")),
    el("div", { class: "stack" }, ...curriculum));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, `Q-FOX · ${labelOf(lv.key)}`),
        el("p", { class: "panel__note" },
          "Cùng một công thức Q-FOX, chia thành các bản nhận diện khác nhau. ",
          "Càng xuống dưới càng ít công thức cần nhớ; tốc độ giải vẫn tối ưu nhờ sách tra.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${TIERS.length} bản`, "fox"),
        chip(`${int(t.cases)} bài`, "sky"),
        chip(`${lv.distinct_algorithms} alg`, "gold"))),
    selector,
    speedCard,
    el("div", { class: "section-head" }, el("h2", {}, "Công thức"),
      el("span", { class: "panel__note" }, `${nStages} bước, sách tra trả mỗi bước trong bước tối ưu`)),
    methodCard,
    el("div", { class: "section-head" }, el("h2", {}, `Tờ công thức · ${labelOf(lv.key)}`),
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

//  tên bản hiển thị ngắn gọn.
function labelOf(key) {
  return ({
    "essence": "Tinh hoa",
    "easy": "Easy",
    "medium": "Medium",
    "tiny": "Tiny",
    "low": "Low",
    "flow": "Flow",
  })[key] || key;
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
