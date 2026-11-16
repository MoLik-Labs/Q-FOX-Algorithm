/**
 * Phương pháp: mười ba cách engine này có thể giải một khối, từng bước.
 *
 * Không có điều gì ở đây là văn xuôi được viết tay về cách chơi rubik —
 * mỗi hàng là danh sách bước mà phương pháp thực sự chạy, với mục tiêu,
 * tập động tác được phép và các hàm đánh giá tìm kiếm được cấp, được
 * xuất từ `qfox/methods`.
 */
import { data, bench } from "../data.js";
import { el, mount, chip, num, int, duration } from "../util.js";

export function render(params = {}) {
  const view = el("div");
  const name = params.name || null;

  const rows = data.methodsList.slice().sort((a, b) => {
    const ba = bench(a.name), bb = bench(b.name);
    if (!ba || !bb) return 0;
    return ba.htm.mean - bb.htm.mean;
  });

  if (name) return detail(name);

  /* -------------------------------------------------------------- tổng quan */
  const cards = el("div", { class: "grid grid--2" });
  for (const m of rows) {
    const b = bench(m.name);
    cards.append(el("a", { class: "card card--plain", href: `#/methods/${encodeURIComponent(m.name)}` },
      el("div", { class: "card__body" },
        el("div", { class: "row row--tight" },
          el("span", { class: "card__name", style: { fontSize: "1.06rem" } }, m.name),
          el("span", { class: "spacer" }),
          b ? chip(`${num(b.htm.mean, 1)} htm`, "mint") : null,
          b ? chip(`${num(b.seconds.mean, 2)} s`, "sky") : null,
          chip(`${m.stages.length} bước`)),
        el("div", { class: "card__sub" }, m.family),
        el("p", { class: "small" }, m.description),
        el("code", { class: "tiny muted" }, m.path),
        el("div", { class: "card__foot" },
          ...Object.entries(m.algs_by_tier || {}).map(([tier, n]) =>
            chip(`${tier}: ${n} thuật toán`, tier === "easy" ? "mint" : tier === "full" ? "fox" : ""))),
        el("span", { class: "tiny muted" }, "Mở để xem phân tích từng bước →"))));
  }

  const compare = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "So sánh cạnh nhau"),
      el("span", { class: "spacer" }),
      el("span", { class: "tiny muted" },
        `${(data.benchmark.meta || {}).scrambles || 0} cú trộn mỗi phương pháp, mọi câu trả lời được chạy lại`)),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Phương pháp"), el("th", { class: "num" }, "Bước"),
          el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "qtm"),
          el("th", { class: "num" }, "Giây"), el("th", {}, "Giải xong"))),
        el("tbody", {}, rows.map((m) => {
          const b = bench(m.name);
          return el("tr", {},
            el("td", { class: "name" },
              el("a", { href: `#/methods/${encodeURIComponent(m.name)}` }, m.name)),
            el("td", { class: "num" }, String(m.stages.length)),
            el("td", { class: "num" }, b ? num(b.htm.mean, 2) : "—"),
            el("td", { class: "num" }, b ? num(b.qtm.mean, 2) : "—"),
            el("td", { class: "num" }, b ? num(b.seconds.mean, 3) : "—"),
            el("td", {}, b ? `${b.solved}/${b.scrambles}` : "—"));
        })))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Mười ba phương pháp, một khuôn dạng"),
        el("p", { class: "panel__note" },
          "Một phương pháp ở đây chỉ là một danh sách các bước có thứ tự, và một bước là một mục tiêu, tập động tác được phép, và những gì phải giữ nguyên. CFOP, Roux, ZZ, Petrus, LBL và các tầng Q-FOX đều là cùng một sáu dòng dữ liệu.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${data.methodsList.length} phương pháp`, "fox"),
        chip(`${int(data.methodsList.reduce((n, m) => n + m.stages.length, 0))} bước tổng`, "sky"))),
    compare,
    el("div", { class: "section-head" }, el("h2", {}, "Danh sách")),
    cards);

  return { node: view };
}

/* ----------------------------------------------------------------- chi tiết */

function detail(name) {
  const m = data.methods.methods[name];
  const view = el("div");
  if (!m) {
    mount(view, el("div", { class: "empty" }, el("h3", {}, "Không có phương pháp này")));
    return { node: view };
  }
  const b = bench(name);

  const stages = el("div", { class: "table-wrap" },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", { class: "num" }, "#"), el("th", {}, "Bước"), el("th", {}, "Mục tiêu"),
        el("th", {}, "Động tác được phép"), el("th", {}, "Hàm đánh giá"),
        el("th", { class: "num" }, "Phương án"),
        el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "ms"),
        el("th", {}, "Được trả lời bởi"))),
      el("tbody", {}, m.stages.map((s, i) => {
        const bs = (b && b.stages && b.stages[s.name]) || null;
        return el("tr", {},
          el("td", { class: "num" }, String(i + 1)),
          el("td", { class: "name" }, el("code", {}, s.name),
            el("div", { class: "tiny muted" }, s.note || "")),
          el("td", {}, (s.goal || []).map((g) => el("code", { class: "tiny" }, g)),
            s.align_centres ? chip("trung tâm đã xếp", "gold") : null),
          el("td", { class: "tiny" }, s.mask),
          el("td", {}, (s.heuristics || []).length
            ? (s.heuristics || []).map((h) => el("code", { class: "tiny" }, h))
            : el("span", { class: "tiny muted" }, "chỉ bảng mục tiêu")),
          el("td", { class: "num" }, String(s.alternatives || 1)),
          el("td", { class: "num" }, bs ? num(bs.htm_mean, 2) : "—"),
          el("td", { class: "num" }, bs ? num(bs.seconds_mean * 1000, 1) : "—"),
          el("td", {}, bs ? Object.entries(bs.via).map(([via, n]) => chip(`${via} ×${n}`, "sky")) : null));
      }))));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("a", { class: "tiny muted", href: "#/methods" }, "← tất cả phương pháp"),
        el("h1", {}, m.name),
        el("p", { class: "panel__note" }, m.family)),
      el("span", { class: "spacer" }),
      b ? el("div", { class: "row row--tight" },
        chip(`${num(b.htm.mean, 2)} htm trung bình`, "mint"),
        chip(`${num(b.seconds.mean, 3)} s trung bình`, "sky"),
        chip(`${b.solved}/${b.scrambles} giải xong`, "fox")) : null),
    el("div", { class: "split" },
      el("div", { class: "stack" },
        el("div", { class: "panel" },
          el("p", {}, m.description),
          m.reference ? el("p", { class: "tiny muted" }, "Tài liệu tham khảo: ", m.reference) : null,
          el("p", { class: "small" }, el("b", {}, "Lộ trình: "), el("code", {}, m.path))),
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Các bước")),
          stages)),
      el("div", { class: "stack" },
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Khối lượng phải thuộc")),
          el("p", { class: "tiny muted" }, "Mỗi tầng Q-FOX yêu cầu bao nhiêu thuật toán nếu bạn giải theo cách này."),
          el("div", { class: "stack", style: { gap: "8px" } },
            ...Object.entries(m.algs_by_tier || {}).map(([tier, n]) => el("div", { class: "bar-row" },
              el("span", { class: "bar-row__label" }, tier),
              el("div", { class: "bar-track" },
                el("div", { class: "bar-fill", style: { width: `${Math.min(100, (n / 160) * 100)}%` } })),
              el("span", { class: "bar-row__val" }, String(n)))))),
        b ? el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Benchmark")),
          el("div", { class: "stats" },
            statEl(num(b.htm.mean, 2), "htm trung bình", `tối thiểu ${b.htm.min} · tối đa ${b.htm.max}`),
            statEl(num(b.qtm.mean, 2), "qtm trung bình", `tối thiểu ${b.qtm.min} · tối đa ${b.qtm.max}`),
            statEl(num(b.stm.mean, 2), "stm trung bình", ""),
            statEl(num(b.etm.mean, 2), "etm trung bình", ""),
            statEl(duration(b.seconds.mean), "thời gian giải", `tệ nhất ${duration(b.seconds.max)}`),
            statEl(duration(b.table_seconds), "bảng tọa độ", "xây một lần, dùng chung")),
          el("p", { class: "tiny muted", style: { marginTop: "10px" } },
            `${b.solved}/${b.scrambles} cú trộn được giải và kiểm chứng bằng cách chạy lại.`)) : null,
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Thử nó")),
          el("p", { class: "small muted" }, "Engine chạy trên máy chủ, không trong trang này — nhưng mọi động tác nó dùng đều có ở đây."),
          el("div", { class: "row" },
            el("a", { class: "btn btn--sm", href: "#/engine" }, "Mở khu thử nghiệm động tác"),
            el("a", { class: "btn btn--sm", href: "#/benchmark" }, "Xem benchmark đầy đủ"))))));

  return { node: view };
}

function statEl(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
