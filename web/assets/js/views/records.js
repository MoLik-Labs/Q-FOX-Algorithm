/**
 * Kỷ lục: bảng thành tích cá nhân của bạn trên trang này.
 *
 * Mọi thứ ở đây được tính từ localStorage: thời gian nhập nhanh nhất từng
 * bài, số lần thử, chuỗi ngày luyện tập liên tục, thống kê theo ngày, và
 * các session gần đây. Không có gì gửi lên mạng, không có tài khoản.
 */
import { data, casesOf } from "../data.js";
import { el, mount, chip, int, progressBar, emptyState, seconds } from "../util.js";
import { records, recentSessions, learnedCount } from "../store.js";

export function render() {
  const view = el("div");
  const allKeys = data.cases.map((c) => c.key);
  const rec = records(allKeys);
  const sessions = recentSessions();

  /* ------------------------------------------------------------- tổng quan */
  const overview = el("section", { class: "stats" },
    stat(rec.streak ? `${rec.streak} ngày` : "0 ngày", "chuỗi luyện tập hiện tại",
         rec.bestStreak ? `kỷ lục cá nhân: ${rec.bestStreak} ngày` : "chưa có chuỗi nào"),
    stat(rec.bestCount ? String(rec.bestCount) : "0", "bài có kỷ lục thời gian",
         `trong ${int(data.cases.length)} bài`),
    stat(rec.bestMs ? seconds(rec.bestMs / 1000, 2) : "—", "nhanh nhất từng nhập",
         "bài có thời gian kỷ lục"),
    stat(rec.totalReviews ? String(rec.totalReviews) : "0", "lần luyện tính tổng",
         rec.accuracy !== null ? `${Math.round(rec.accuracy * 100)}% đúng` : "chưa luyện"),
    stat(String(learnedCount(allKeys)), "bài đã đánh dấu thuộc",
         `${int(allKeys.length - learnedCount(allKeys))} bài còn lại`),
    stat(String(sessions.length), "session đã lưu",
         sessions[0] ? `lần cuối: ${sessions[0].right}/${sessions[0].total} đúng` : "chưa có"));

  /* --------------------------------------------------- kỷ lục theo họ bài */
  const byFamily = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Kỷ lục theo họ bài"),
      el("span", { class: "spacer" }),
      el("span", { class: "tiny muted" }, "thời gian nhập nhanh nhất trong mỗi họ, từ các bài bạn từng nhập đúng")));

  const famRows = data.families.map((f) => {
    const keys = casesOf(f.key).map((c) => c.key);
    const famRec = records(keys);
    let best = null, attempts = 0;
    for (const k of keys) {
      const b = famRec.bestOf(k);
      if (b) { attempts += famRec.attemptsOf(k); if (!best || b.ms < best.ms) best = b; }
    }
    return { label: f.label, best, attempts, count: keys.length };
  }).filter((r) => r.best);

  const famTable = el("div", { class: "table-wrap" },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Họ"), el("th", { class: "num" }, "Bài"),
        el("th", { class: "num" }, "Nhập đúng"), el("th", { class: "num" }, "Kỷ lục nhanh nhất"))),
      el("tbody", {}, famRows.map((r) => el("tr", { class: "record-row--best" },
        el("td", { class: "name" }, r.label),
        el("td", { class: "num" }, String(r.count)),
        el("td", { class: "num" }, String(r.attempts)),
        el("td", { class: "num" }, seconds(r.best.ms / 1000, 2)))))));

  if (!famRows.length) {
    mount(byFamily, emptyState("Chưa có kỷ lục nào",
      "Đi vào Bài luyện tập, nhập thuật toán và kiểm tra — thời gian của bạn sẽ được ghi ở đây."));
  } else {
    mount(byFamily, famTable,
      el("p", { class: "tiny muted", style: { marginTop: "10px" } },
        "Kỷ lục được ghi ở chế độ “Nhập nó”, tính từ lúc bài hiện ra đến khi bạn bấm kiểm tra và đạt đích."));
  }

  /* ----------------------------------------------------- kỷ lục từng bài */
  const topCards = el("section", {});
  const top = data.cases
    .map((c) => ({ c, best: rec.bestOf(c.key) }))
    .filter((x) => x.best)
    .sort((a, b) => a.best.ms - b.best.ms)
    .slice(0, 24);

  topCards.append(
    el("div", { class: "section-head" },
      el("div", {},
        el("h2", {}, "Bài bạn nhập nhanh nhất"),
        el("p", { class: "panel__note" },
          `${top.length} bài bạn từng nhập đúng. Mở thẻ để xem bài và chạy lại thuật toán.`)),
      el("span", { class: "spacer" }),
      chip(`tối đa ${top.length} bài`), "sky"));

  if (top.length) {
    topCards.append(el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Bài"), el("th", {}, "Họ"), el("th", { class: "num" }, "Kỷ lục"))),
        el("tbody", {}, top.map(({ c, best }) =>
          el("tr", { class: "record-row--best" },
            el("td", { class: "name" },
              el("a", { href: `#/algorithms/${c.family}` },
                (c.teach && c.teach.name) || (c.names && c.names[0]) || `Bài ${c.i + 1}`)),
            el("td", {}, c.familyLabel || c.family),
            el("td", { class: "num" }, seconds(best.ms / 1000, 2))))))));
  } else {
    topCards.append(el("div", { class: "panel" },
      el("p", { class: "small muted" },
        "Chưa có bài nào có kỷ lục. Bắt đầu từ Bài luyện tập — mỗi lần nhập đúng, thời gian sẽ được so sánh và lưu lại.")));
  }

  /* --------------------------------------------------------------- theo ngày */
  const daily = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Lịch luyện tập"),
      el("span", { class: "spacer" }),
      chip(rec.streak ? `${rec.streak} ngày liên tục` : "chưa có chuỗi", rec.streak ? "mint" : "")));

  if (rec.days.length) {
    const max = Math.max(...rec.days.map(([, d]) => d.reviews), 1);
    daily.append(el("div", { class: "stack", style: { gap: "6px" } },
      ...rec.days.slice(0, 30).map(([day, d]) =>
        el("div", { class: "bar-row" },
          el("span", { class: "bar-row__label" }, day),
          el("div", { class: "bar-track" },
            el("div", { class: "bar-fill bar-fill--mint",
                        style: { width: `${(d.reviews / max) * 100}%` } })),
          el("span", { class: "bar-row__val" }, `${d.reviews} luyện · ${d.correct} đúng`)))));
  } else {
    mount(daily, el("p", { class: "small muted" }, "Chưa có hoạt động nào được ghi."));
  }

  /* ----------------------------------------------------------------- session */
  const sessionPanel = el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Session gần đây")));

  if (sessions.length) {
    mount(sessionPanel, el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Lúc"), el("th", {}, "Bài học"), el("th", {}, "Chế độ"),
          el("th", { class: "num" }, "Đúng"), el("th", { class: "num" }, "Gần"),
          el("th", { class: "num" }, "Sai"), el("th", { class: "num" }, "Thời gian"))),
        el("tbody", {}, sessions.map((s) =>
          el("tr", {},
            el("td", { class: "tiny muted" }, new Date(s.at).toLocaleString("vi-VN")),
            el("td", {}, String(s.set || "tất cả")),
            el("td", {}, String(s.mode || "")),
            el("td", { class: "num" }, String(s.right)),
            el("td", { class: "num" }, String(s.near)),
            el("td", { class: "num" }, String(s.wrong)),
            el("td", { class: "num" }, `${s.seconds} s`)))))));
  } else {
    mount(sessionPanel, el("p", { class: "small muted" }, "Chưa có session nào. Một lần luyện xong sẽ được lưu ở đây."));
  }

  const milestones = milestonePanel(rec, learnedCount(allKeys));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Bảng kỷ lục"),
        el("p", { class: "panel__note" },
          "Thành tích của bạn trên trang này: thời gian, chuỗi ngày, và tiến độ. Mọi thứ lưu trong trình duyệt, xuất được ở Bài luyện tập.")),
      el("span", { class: "spacer" }),
      chip("miễn phí", "mint"), chip("không tài khoản", "mint")),
    overview,
    milestones,
    el("div", { class: "section-head" }, el("h2", {}, "Kỷ lục")),
    byFamily,
    el("div", { class: "section-head" }, el("h2", {}, "Top nhập nhanh")),
    topCards,
    el("div", { class: "section-head" }, el("h2", {}, "Theo thời gian")),
    daily,
    sessionPanel);

  return { node: view };
}

/**
 * Cột mốc luyện tập: những mục tiêu cố định đánh dấu hành trình luyện
 * đều đặn. Mỗi mốc cho biết bạn đã đạt hay còn cách bao xa -- một cách
 * nhìn tiến bộ rõ ràng, khuyến khích luyện tiếp tục và tối đa hiệu quả
 * thời gian.
 */
function milestonePanel(rec, learned) {
  const items = [
    { id: "streak1", label: "Luyện 1 ngày liên tục", done: rec.streak >= 1,
      cur: rec.streak, target: 1, kind: "fox" },
    { id: "streak7", label: "Luyện 7 ngày liên tục", done: rec.bestStreak >= 7,
      cur: rec.bestStreak, target: 7, kind: "fox" },
    { id: "streak30", label: "Luyện 30 ngày liên tục", done: rec.bestStreak >= 30,
      cur: rec.bestStreak, target: 30, kind: "gold" },
    { id: "learned10", label: "Thuộc 10 thuật toán", done: learned >= 10,
      cur: learned, target: 10, kind: "mint" },
    { id: "learned50", label: "Thuộc 50 thuật toán", done: learned >= 50,
      cur: learned, target: 50, kind: "mint" },
    { id: "learned100", label: "Thuộc 100 thuật toán", done: learned >= 100,
      cur: learned, target: 100, kind: "gold" },
    { id: "reviews500", label: "500 lần luyện", done: rec.totalReviews >= 500,
      cur: rec.totalReviews, target: 500, kind: "sky" },
    { id: "reviews1000", label: "1000 lần luyện", done: rec.totalReviews >= 1000,
      cur: rec.totalReviews, target: 1000, kind: "sky" },
  ];
  const reached = items.filter((m) => m.done).length;
  return el("section", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Cột mốc luyện tập"),
      el("span", { class: "spacer" }),
      chip(`${reached}/${items.length} đã đạt`, reached === items.length ? "mint" : "gold")),
    el("p", { class: "small muted", style: { maxWidth: "80ch" } },
      "Những mục tiêu cố định đánh dấu hành trình luyện đều đaren. Đạt từng mốc là bạn đang tiến -- luyện tiếp để vượt mốc tiếp theo."),
    el("div", { class: "grid grid--4" },
      ...items.map((m) => {
        const pct = Math.min(100, Math.round((100 * m.cur) / m.target));
        return el("div", { class: "card card--plain", style: m.done ? { borderColor: "var(--mint)" } : null },
          el("div", { class: "card__body" },
            el("div", { class: "card__name", style: { fontSize: ".92rem" } },
              m.done ? "✓" : "", " ", m.label),
            el("div", { class: "card__sub" },
              m.done ? "đã đạt" : `còn ${Math.max(0, m.target - m.cur)} nữa`,
              ` · ${m.cur}/${m.target}`),
            progressBar(m.cur, m.target, `${pct}%`)));
      })));
}

function stat(value, key, sub = "") {
  return el("div", { class: "stat stat--fox" },
    el("div", { class: "stat__k" }, key),
    el("div", { class: "stat__v" }, value),
    sub ? el("div", { class: "stat__s" }, sub) : null);
}
