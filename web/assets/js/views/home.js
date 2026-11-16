/** Trang chủ: đây là gì, chứng minh được gì, và bắt đầu từ đâu. */
import { data, totals, levelKeys, METRIC_HINT, caseByKey } from "../data.js";
import { el, mount, chip, num, int, progressBar, seconds, toast } from "../util.js";
import { cubePanel, caseCard, openCase } from "../parts.js";
import { exportCasesPng, exportCasesPdf } from "../export.js";
import { exportCasesPdfFile } from "../pdffile.js";
import { learnedCount, recentSessions, records, schedule } from "../store.js";

export function render() {
  const t = totals();
  const view = el("div");
  let timer = null;

  /* ------------------------------------------------------------- khối hero */
  const showcase = el("div", { class: "hero__cube" });
  const panel = cubePanel({ size: 280, viewToggle: false, reset: false, highlight: "none" });
  showcase.append(panel.node);
  const nowShowing = el("p", { class: "tiny muted", style: { textAlign: "center", maxWidth: "34ch" } },
    "Mọi bài trong sách, phát luân phiên");

  const showcaseCases = data.cases
    .filter((c) => c.tokens.length && (c.names.length || (c.count >= 7 && c.count <= 11)))
    .sort(() => 0.5 - Math.random())
    .slice(0, 26);
  let si = 0;

  async function nextShowcase() {
    const row = showcaseCases[si % showcaseCases.length];
    si++;
    const M = data.model;
    // đặt bài từ khối hoàn chỉnh, rồi chạy thuật toán hoàn tất nó
    panel.cube.setState(M.applyIds(M.solved, M.invert(row.tokens)), { keepTransform: false });
    nowShowing.textContent = row.teach
      ? `${row.teach.name} · ${row.family} · ${row.count} động tác`
      : `${row.family} · ${row.desc.pattern} · ${row.count} động tác`;
    for (const id of row.tokens) {
      await panel.cube.turn(M.byId.get(id).name, 150);
      await wait(60);
    }
    await wait(1500);
    if (timer !== null) nextShowcase();
  }

  const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });

  /* ------------------------------------------------------------------ hero */
  const hero = el("section", { class: "hero", attrs: { "data-enter": "" } },
    el("div", {},
      el("div", { class: "eyebrow" }, "Q-FOX algorithm engine"),
      el("h1", { class: "hero__title" },
        "Học giải rubik, phá kỷ lục của chính mình."),
      el("p", { class: "hero__lede" },
        `Mọi thuật toán ở đây đều do một engine giải viết từ đầu bằng C tạo ra, được chạy lại đối chiếu với mục tiêu, rồi xuất bản thành dữ liệu. ` +
        `${int(t.cases)} bài lớp cuối trên ${t.families} họ, bốn cấp độ học từ "chưa giải được lần nào" đến "ít động tác nhất có thể", ` +
        `và ${t.methods} phương pháp hoàn chỉnh được benchmark trên ${t.scrambles} cú trộn mỗi phương pháp.`),
      el("div", { class: "hero__cta" },
        el("a", { class: "btn btn--primary", href: "#/levels/easy" }, "Bắt đầu ở Cấp 1"),
        el("a", { class: "btn", href: "#/trainer" }, "Vào bài luyện"),
        el("a", { class: "btn btn--ghost", href: "#/algorithms" }, `Xem ${t.cases} thuật toán`)),
      el("div", { class: "hero__facts" },
        chip(`${t.methodsSolvedAll}/${t.methods} phương pháp giải xong mọi cú trộn`, "mint"),
        t.shortest ? chip(`${t.shortest.method} -- ngắn nhất, ${num(t.shortest.htm.mean, 2)} htm`, "fox") : null,
        chip(`sách quét tới độ ${t.swept}, chính xác tới ${t.exactTo}`, "sky"),
        chip(data.check.ok ? "khối trong trình duyệt đã đối chiếu với engine" : "mô hình bất đồng",
             data.check.ok ? "mint" : "rose"))),
    el("div", {}, showcase, nowShowing));

  /* ----------------------------------------------------------------- số liệu */
  const stats = el("section", { class: "stats" },
    stat(`${int(t.cases)}`, "bài thuật toán", `${t.toLearn} bài cần học, ${t.named} bài có tên quen`, true),
    stat(`${t.levels}`, "cấp độ", "từ newbie đến bậc thầy, mỗi cấp có chương học riêng"),
    stat(`${t.methods}`, "phương pháp", "CFOP, Roux, ZZ, Petrus, LBL và các tầng Q-FOX"),
    stat(`${num(t.coverage, 2)}%`, "phủ sách", `${int(t.elements)} phần tử lớp cuối, quét tới độ ${t.swept}`),
    stat(`${t.moves}`, "động tác", "cú xoay mặt, slice, wide và xoay toàn khối"),
    stat(`${t.shortest ? num(t.shortest.htm.mean, 2) + " htm" : "—"}`, "giải ngắn nhất",
         t.shortest ? `${t.shortest.method}, trung bình trên ${t.scrambles} cú trộn, nhanh hơn mọi phương pháp 3x3` : "chưa có benchmark"));

  /* ---------------------------------------------------------------- cấp độ */
  const levelCards = el("div", { class: "grid grid--4" });
  for (const lv of data.levelsList) {
    const keys = levelKeys(lv.key);
    const done = learnedCount(keys);
    levelCards.append(el("a", { class: "card level-card", href: `#/levels/${lv.key}` },
      el("span", { class: "level-card__n" }, String(lv.title.split(" ")[1] || "")),
      el("div", { class: "card__body" },
        el("div", { class: "card__name" }, lv.title),
        el("div", { class: "card__sub" }, lv.who),
        el("div", { class: "card__sub" }, lv.promise),
        progressBar(done, keys.length, `${done}/${keys.length} đã thuộc`),
        el("div", { class: "card__foot" },
          chip(`${lv.algs} thuật toán của engine`, "fox"),
          chip(`${lv.curriculum.length} bài học`),
          lv.benchmark ? chip(`${num(lv.benchmark.htm, 1)} htm/lần giải`, "mint") : null))));
  }

  /* ------------------------------------------------------------- bên trong */
  const inside = el("section", { class: "grid grid--2" },
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Các họ bài"),
        el("span", { class: "spacer" }),
        el("a", { class: "btn btn--sm", href: "#/algorithms" }, "Mở")),
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Họ"), el("th", {}, "Giải điều gì"),
            el("th", { class: "num" }, "Bài"),
            el("th", { class: "num", title: METRIC_HINT }, "Trung bình"),
            el("th", { class: "num", title: METRIC_HINT }, "Dài nhất"))),
          el("tbody", {}, data.families.map((f) => el("tr", {},
            el("td", { class: "name" },
              el("a", { href: `#/algorithms/${f.key}` }, f.label)),
            el("td", {}, f.goal),
            el("td", { class: "num", title: `${f.non_trivial} bài đáng học, ${f.cases - f.non_trivial} bài đã ở đích` }, String(f.non_trivial)),
            el("td", { class: "num", title: METRIC_HINT }, `${num(f.mean, 2)}`),
            el("td", { class: "num", title: METRIC_HINT }, `${f.longest}`))))))),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Một con số đi vào trang như thế nào")),
      el("ol", { class: "small" },
        el("li", {}, el("b", {}, "engine/qfox.c"), " — các dán, tọa độ, bảng BFS, IDA*, và sách lớp cuối. Nơi duy nhất cơ học khối tồn tại."),
        el("li", {}, el("b", {}, "qfox/alggen"), " — các họ bài được suy ra từ đối xứng, không sao chép từ một danh sách: ",
            data.families.map((f) => `${f.non_trivial} ${f.label}`).join(" · "), ", mỗi họ là một quỹ đạo của nhóm đối xứng."),
        el("li", {}, el("b", {}, "sách lớp cuối"), " — ", int(t.elements), " vị trí được quét toàn phần tới độ ", String(t.swept), ", nên ", num(t.coverage, 2), "% trong số đó có câu trả lời ngắn nhất có chứng minh."),
        el("li", {}, el("b", {}, "scripts/gen_web_data.py"), " — hỏi engine về mọi bài, giữ từ ngắn nhất đã kiểm chứng, ghi ", el("code", {}, "web/data/*.json"), "."),
        el("li", {}, el("b", {}, "scripts/validate_web_data.py"), " — chạy lại tất cả ", String(t.cases), " thuật toán và suy lại hình học khối của trang này từ chính các hoán vị của engine."),
        el("li", {}, el("b", {}, "web/"), " — trang này. Chỉ file tĩnh; nó đọc JSON và tự vẽ mọi thứ.")),
      el("div", { class: "hint hint--mint" },
        "Không có gì trên trang này được gõ tay. Đổi engine, chạy lại generator, các trang sẽ theo đổi.")));

  /* --------------------------------------------------------------- bài nổi bật */
  const featured = el("section", {});
  const featuredRows = data.cases.filter((c) => c.names.length).slice(0, 4);
  if (featuredRows.length) {
    featured.append(
      el("div", { class: "section-head" },
        el("h2", {}, "Bài có tên"),
        el("span", { class: "panel__note" }, "Engine nhận ra những bài này, kiểm chứng thuật toán quen thuộc đối chiếu với mục tiêu, và xuất bản cả nó lẫn từ ngắn nhất của riêng mình."),
        el("span", { class: "spacer" }),
        el("a", { class: "btn btn--sm", href: "#/algorithms" }, "Tất cả bài")),
      el("div", { class: "grid grid--cases" }, featuredRows.map((r) => caseCard(r, { onOpen: openCase }))));
  }

  /* --------------------------------------------------------------- lộ trình của bạn */
  const sessions = recentSessions().slice(0, 3);
  const rec = records(data.cases.map((c) => c.key));
  const you = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Tiến trình và kỷ lục của bạn"),
      el("span", { class: "spacer" }),
      el("a", { class: "btn btn--sm", href: "#/records" }, "Bảng kỷ lục")),
    el("div", { class: "stats" },
      stat(String(learnedCount(data.cases.map((c) => c.key))), "bài đã đánh dấu thuộc", `trong ${int(t.cases)} bài`),
      stat(String(sessions.length), "session gần đây", sessions[0] ? `lần cuối: ${sessions[0].right}/${sessions[0].total} đúng` : "chưa có"),
      stat(rec.streak ? `${rec.streak} ngày` : "0 ngày", "chuỗi ngày luyện", rec.bestStreak ? `kỷ lục: ${rec.bestStreak} ngày` : "bắt đầu ngay hôm nay"),
      stat(rec.bestCount ? String(rec.bestCount) : "0", "kỷ lục thời gian", rec.bestMs ? `nhanh nhất ${seconds(rec.bestMs / 1000, 2)}` : "chưa có")),
    el("p", { class: "tiny muted" },
      "Tiến trình chỉ lưu trong trình duyệt này (localStorage). Nếu muốn giữ, hãy xuất từ Bài luyện."));

  /* ---------------------------------------------------- lộ trình học chuẩn */
  const learnSteps = [
    { n: "1", title: "Nhận dạng", what: "Nhìn khối, gọi tên bài. Đây là bước đầu và quyết định tốc độ.",
      how: "Luyện chế độ Nhận nhanh — chỉ có hình, không có câu hỏi. Gọi tên rồi kiểm tra.",
      href: "#/trainer", cta: "Luyện nhận dạng", cls: "sky" },
    { n: "2", title: "Thuộc thuật toán", what: "Biết bài rồi, cần thuộc cách giải nó. Học theo cụm, không thuộc từng chữ.",
      how: "Mở bài trên Sách thuật toán — có nhận dạng, cụm động tác, ghi nhớ. Luyện từng cụm.",
      href: "#/algorithms", cta: "Mở sách thuật toán", cls: "fox" },
    { n: "3", title: "Luyện thực chiến", what: "Nhận dạng + thuộc đã có, giờ luyện đều để giải nhanh và chắc.",
      how: "Bài luyện có nhận nhanh, nhận+nhớ, khung thời gian, tập trung bài yếu. Chạy đều mỗi ngày.",
      href: "#/trainer", cta: "Vào bài luyện", cls: "mint" },
  ];
  const stepCards = learnSteps.map((st) => {
    const tag = st.cls === "sky" ? "bước 1" : st.cls === "fox" ? "bước 2" : "bước 3";
    const headRow = el("div", { class: "row row--tight", style: { marginBottom: "8px" } },
      el("span", { class: "level-card__n", style: { background: "var(--s-3)" } }, st.n),
      el("span", { class: "card__name" }, st.title),
      el("span", { class: "spacer" }),
      chip(tag, st.cls));
    const body = el("div", { class: "card__body" },
      headRow,
      el("p", { class: "small" }, st.what),
      el("p", { class: "tiny muted" }, st.how),
      el("a", { class: "btn btn--sm", href: st.href }, st.cta));
    return el("div", { class: "card card--plain" }, body);
  });
  const pdfBtn = el("button", { class: "btn btn--sm", type: "button", title: "Tải file PDF sách giáo khoa toàn bộ",
    onClick: async () => {
      toast("Đang tạo file PDF sách…", "info");
      await exportCasesPdfFile(data.cases, { title: "Q-FOX · Sách giáo khoa thuật toán", detail: true, chapters: true, filename: "qfox-textbook" });
      toast("Đã tải file PDF -- in ra học", "ok");
    } }, "Tải PDF sách");
  const printBtn = el("button", { class: "btn btn--sm", type: "button", title: "Mở cửa sổ in sách",
    onClick: () => {
      const today = new Date().toLocaleDateString("vi-VN");
      exportCasesPdf(data.cases, { title: "Q-FOX · Sách giáo khoa thuật toán", subtitle: data.cases.length + " bài · " + today });
    } }, "In sách");
  const pngBtn = el("button", { class: "btn btn--sm", type: "button", title: "Tải toàn bộ sách thành ảnh PNG",
    onClick: () => exportCasesPng(data.cases, { title: "Q-FOX · Sách giáo khoa", cols: 4, filename: "qfox-textbook" }) }, "Xuất PNG sách");
  const exportRow = el("div", { class: "row row--tight", style: { marginTop: "14px" } },
    el("span", { class: "tiny muted" }, "Muốn in ra hoặc lưu ảnh để học offline:"),
    pdfBtn, printBtn, pngBtn);
  const learnPath = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Lộ trình học — dễ làm, chuẩn phương pháp"),
      el("span", { class: "spacer" }),
      chip("3 bước, mọi cấp độ đều đi qua", "fox")),
    el("p", { class: "small muted", style: { maxWidth: "80ch" } },
      "Học giải rubik không cần phức tạp. Ba bước này -- nhận dạng, thuộc, rồi luyện -- là chu trình chuẩn mà mọi phương pháp đều dùng. " +
      "Đi đúng thứ tự, không nhảy bước: nhận không ra thì không thuộc được, thuộc không thuộc thì không giải được. Mỗi bước có công cụ riêng trên trang này."),
    el("div", { class: "grid grid--3" }, ...stepCards),
    exportRow);

  mount(view,
    hero,
    learnPath,
    dailyPlan(),
    weeklyPlan(),
    el("div", { class: "section-head" }, el("h2", {}, "Toàn bộ hệ thống trong một dòng"),
      el("span", { class: "panel__note" }, `${int(t.elements)} phần tử lớp cuối · ${num(t.coverage, 2)}% đã quét · câu trả lời chính xác tới ${t.exactTo} động tác`)),
    stats,
    el("div", { class: "section-head" }, el("h2", {}, "Chọn cấp độ của bạn"),
      el("span", { class: "panel__note" }, "Mỗi cấp độ là một phương pháp cộng với tập thuật toán chính xác mà nó yêu cầu bạn biết.")),
    levelCards,
    inside,
    featured,
    you);

  // khởi động trình phát sau khi vẽ, dừng khi rời màn này
  requestAnimationFrame(() => { nextShowcase(); });

  return {
    node: view,
    destroy() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      panel.cube.stop();
    },
  };
}

/**
 * Lộ trình luyện theo tuần: một lịch luyện cụ thể cho 7 ngày, để người
 * học không mất thời gian suy nghĩ hôm nay luyện gì. Mỗi ngày có mục
 * tiêu rõ ràng, xoay quanh nhận dạng, thuộc, và luyện đều -- chu kỳ
 * tối ưu để nhớ lâu và tiến nhanh.
 */
function weeklyPlan() {
  const days = [
    { d: "Thứ 2", focus: "Nhận dạng", task: "Luyện chế độ Nhận nhanh 15 phút -- rèn tốc độ nhận bài.", cls: "sky" },
    { d: "Thứ 3", focus: "Thuộc mới", task: "Học 3-5 bài mới theo cụm -- dùng cửa sổ bài, luyện từng cụm.", cls: "fox" },
    { d: "Thứ 4", focus: "Nhắc lại", task: "Luyện bài đến hạn theo lịch học -- bài cũ trước, giữ chắc kiến thức.", cls: "mint" },
    { d: "Thứ 5", focus: "Thuộc mới", task: "Học thêm 3-5 bài mới, hoặc bài dài trong cấp bạn đang học.", cls: "fox" },
    { d: "Thứ 6", focus: "Nhận dạng", task: "Luyện nhận dạng chéo -- nhận bài không theo thứ tự, gọi tên nhanh.", cls: "sky" },
    { d: "Chủ nhật", focus: "Tổng luyện", task: "Luyện khung thời gian 20 phút -- pha trộn bài đến hạn và bài mới.", cls: "gold" },
    { d: "Thứ 7", focus: "Nhắc lại", task: "Luyện bài yếu -- bấm Tập trung bài yếu, bài bạn hay sai lên trước.", cls: "mint" },
  ];
  return el("section", { class: "panel", style: { marginTop: "20px" } },
    el("div", { class: "panel__head" }, el("h3", {}, "Lộ trình luyện theo tuần"),
      el("span", { class: "spacer" }),
      chip("7 ngày, chu kỳ tối ưu", "fox")),
    el("p", { class: "small muted", style: { maxWidth: "80ch" } },
      "Một lịch luyện cố định cho cả tuần. Mỗi ngày có mục tiêu rõ ràng, xoay quanh nhận dạng, thuộc mới, và nhắc lại -- chu kỳ tối ưu để nhớ lâu và tiến nhanh, không mất thời gian suy nghĩ hôm nay luyện gì."),
    el("div", { class: "grid grid--4" },
      ...days.map((d) => el("div", { class: "card card--plain" },
        el("div", { class: "card__body" },
          el("div", { class: "row row--tight", style: { marginBottom: "6px" } },
            el("span", { class: "card__name", style: { fontSize: ".92rem" } }, d.d),
            el("span", { class: "spacer" }),
            chip(d.focus, d.cls)),
          el("div", { class: "card__sub" }, d.task))))));
}

/**
 * Lộ trình luyện mỗi ngày: tính từ tiến trình thực tế của bạn trong
 * trình duyệt này. Đề xuất những bài nên luyện trước -- bài đến hạn,
 * bài chưa thuộc, và bài mới -- để thời gian luyện đi đúng chỗ. Đây là
 * cách tối đa hiệu quả thời gian: không phải tự nghĩ hôm nay luyện gì.
 */
function dailyPlan() {
  const all = data.cases.filter((c) => c.moves.length);
  const learned = all.filter((c) => learnedCount([c.key]));
  const todo = all.filter((c) => !learnedCount([c.key]));
  // bài đến hạn theo lịch học nhắc lại
  const due = schedule(all.map((c) => c.key)).filter((r) => r.overdue).map((r) => r.key);
  const dueRows = due.map((k) => caseByKey(k)).filter(Boolean);
  const freshRows = todo.filter((r) => !due.includes(r.key)).slice(0, 6);

  const items = [];
  if (dueRows.length) {
    items.push({ title: "Bài đến hạn -- luyện trước", rows: dueRows, cls: "fox",
      note: `${dueRows.length} bài mà lịch học báo đã tới hạn. Luyện trước -- chúng giữ kiến thức của bạn chắc.` });
  }
  if (freshRows.length) {
    items.push({ title: "Bài mới -- học thêm", rows: freshRows, cls: "sky",
      note: `${freshRows.length} bài chưa thuộc. Chọn vài bài để mở rộng số lượng bạn biết.` });
  }
  if (!items.length) {
    return el("section", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Lộ trình luyện hôm nay")),
      el("p", { class: "small" }, "Không có bài đến hạn và bạn đã thuộc toàn bộ bài có thuật toán. Tuyệt vời -- hôm nay là ngày nghỉ, hoặc học một phương pháp mới trong Mục phương pháp."));
  }

  const cards = el("div", { class: "grid grid--cases" },
    ...items.flatMap((it) => it.rows.slice(0, 8).map((r) => caseCard(r, { onOpen: openCase }))))

  const head = el("div", { class: "panel__head" },
    el("h3", {}, "Lộ trình luyện hôm nay"),
    el("span", { class: "spacer" }),
    chip(`${learned.length}/${all.length} bài đã thuộc`, "mint"),
    chip(`${dueRows.length} bài đến hạn`, "fox"));

  const group = (it) => el("div", {},
    el("div", { class: "row row--tight", style: { marginBottom: "6px" } },
      chip(it.title, it.cls),
      el("span", { class: "tiny muted" }, it.note)),
    cards);

  const groups = el("div", { class: "stack", style: { gap: "10px" } },
    ...items.map(group));

  const actions = el("div", { class: "row", style: { marginTop: "12px" } },
    el("a", { class: "btn btn--primary btn--sm", href: "#/trainer" }, "Bắt đầu luyện"),
    el("a", { class: "btn btn--sm", href: "#/levels" }, "Xem lộ trình cấp độ"));

  return el("section", { class: "panel" }, head, groups, actions);
}

function stat(value, key, sub = "", fox = false) {
  return el("div", { class: `stat ${fox ? "stat--fox" : ""}` },
    el("div", { class: "stat__k" }, key),
    el("div", { class: "stat__v" }, value),
    sub ? el("div", { class: "stat__s" }, sub) : null);
}
