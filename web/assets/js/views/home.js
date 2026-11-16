/** Trang chủ: đây là gì, chứng minh được gì, và bắt đầu từ đâu. */
import { data, totals, levelKeys, METRIC_HINT } from "../data.js";
import { el, mount, chip, num, int, progressBar, seconds } from "../util.js";
import { cubePanel, caseCard, openCase } from "../parts.js";
import { learnedCount, recentSessions, records } from "../store.js";

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
  const hero = el("section", { class: "hero" },
    el("div", {},
      el("div", { class: "eyebrow" }, "Q-FOX algorithm engine"),
      el("h1", { class: "hero__title" },
        "Học giải rubik theo ", el("em", {}, "cấp độ"), ",",
        " không theo phỏng đoán."),
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
    stat(`${t.fastest ? seconds(t.fastest.seconds.mean, 2) : "—"}`, "giải nhanh nhất",
         t.fastest ? `${t.fastest.method}, trung bình trên ${t.scrambles} cú trộn` : "chưa có benchmark"));

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

  mount(view,
    hero,
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

function stat(value, key, sub = "", fox = false) {
  return el("div", { class: `stat ${fox ? "stat--fox" : ""}` },
    el("div", { class: "stat__k" }, key),
    el("div", { class: "stat__v" }, value),
    sub ? el("div", { class: "stat__s" }, sub) : null);
}
