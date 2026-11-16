/**
 * Benchmark: engine thực sự đạt được gì, trên cùng các cú trộn cho mọi
 * phương pháp, với mọi câu trả lời được chạy lại trước khi được tính.
 */
import { data, bench } from "../data.js";
import { el, mount, chip, num, int, duration, emptyState } from "../util.js";

const COLUMNS = [
  { key: "method", label: "Phương pháp", get: (r) => r.method, name: true },
  { key: "solved", label: "Giải xong", get: (r) => r.solved, num: true },
  { key: "htm", label: "htm", get: (r) => r.htm.mean, num: true, best: "min" },
  { key: "qtm", label: "qtm", get: (r) => r.qtm.mean, num: true, best: "min" },
  { key: "stm", label: "stm", get: (r) => r.stm.mean, num: true, best: "min" },
  { key: "etm", label: "etm", get: (r) => r.etm.mean, num: true, best: "min" },
  { key: "seconds", label: "Giây", get: (r) => r.seconds.mean, num: true, best: "min" },
  { key: "worst", label: "Tệ nhất", get: (r) => r.seconds.max, num: true, best: "min" },
  { key: "stages", label: "Bước", get: (r) => Object.keys(r.stages || {}).length, num: true },
];

let sortKey = "htm";
let sortDir = 1;

export function render(params = {}, query = {}) {
  const view = el("div");
  const rows = (data.benchmark.results || []).slice();
  const meta = data.benchmark.meta || {};

  if (!rows.length) {
    mount(view, emptyState("Chưa có benchmark",
      "Chạy scripts/bench.py --all --scrambles 20 rồi scripts/gen_web_data.py."));
    return { node: view };
  }

  /* ------------------------------------------------------------------ thông tin */
  const solvedAll = rows.filter((r) => r.solved === r.scrambles).length;
  const totalSeconds = rows.reduce((s, r) => s + r.seconds.mean * r.scrambles, 0);
  const metaPanel = el("div", { class: "panel" },
    el("div", { class: "panel__head" },
      el("h3", {}, "Đo như thế nào"),
      el("span", { class: "spacer" }),
      chip(data.benchmark.engine || "engine", "fox"),
      chip(new Date(data.benchmark.generated || Date.now()).toUTCString().slice(0, 22), "muted")),
    el("div", { class: "stats" },
      stat(int(meta.scrambles || rows[0].scrambles), "cú trộn mỗi phương pháp", `hạt giống ${meta.seed}, độ dài ${meta.scramble_length}`),
      stat(String(rows.length), "phương pháp", "mọi phương pháp, cùng các cú trộn"),
      stat(`${solvedAll}/${rows.length}`, "giải xong mọi cú trộn", "được chạy lại kiểm chứng, kể cả trung tâm"),
      stat(duration(meta.table_seconds), "bảng tọa độ", "xây một lần, dùng chung cho mọi phương pháp"),
      stat(duration(totalSeconds), "tổng thời gian giải", "cộng trên mọi lần giải"),
      stat(`${meta.book_swept || 0}`, "độ quét sách", `${int(meta.book_found || 0)} phần tử lớp cuối đã biết chính xác`)),
    el("p", { class: "small muted", style: { marginTop: "12px" } },
      "Bốn cách đếm là các chỉ số của chính engine. ",
      "htm: một cú xoay mặt tính 1 dù quarter hay half, cú wide/slice/xoay toàn khối tính 2. ",
      "qtm: quarter-turn tính 1, half tính 2, wide/slice/xoay gấp đôi. ",
      "stm: mọi cú xoay tính 1, đúng cách ký hiệu speedcubing đếm. ",
      "etm: như stm, nhưng một cú slice tính 2. ",
      "Các lần giải trọn vẹn ở đây chỉ dùng cú xoay mặt, nên htm và stm trùng nhau. ",
      "Thời gian giải là thời gian engine trên máy này với bảng đã warm — không phải con số TPS của người."));

  /* ----------------------------------------------------------------- bảng */
  const tableWrap = el("div", { class: "table-wrap" });

  function draw() {
    const col = COLUMNS.find((c) => c.key === sortKey);
    const sorted = rows.slice().sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * ((va ?? 1e9) - (vb ?? 1e9));
    });
    const best = {};
    for (const c of COLUMNS) {
      if (!c.best) continue;
      const vals = rows.map(c.get).filter((v) => typeof v === "number");
      best[c.key] = c.best === "min" ? Math.min(...vals) : Math.max(...vals);
    }
    mount(tableWrap, el("table", { class: "table" },
      el("thead", {}, el("tr", {}, COLUMNS.map((c) => el("th", {
        class: `${c.num ? "num " : ""}is-sortable`,
        title: "Sắp xếp theo cột này",
        onClick: () => {
          if (sortKey === c.key) sortDir *= -1;
          else { sortKey = c.key; sortDir = 1; }
          draw();
          drawBars();
        },
      }, c.label, sortKey === c.key ? (sortDir === 1 ? " ▲" : " ▼") : "")))),
      el("tbody", {}, sorted.map((r) => el("tr", {
        class: best.htm !== undefined && Math.abs(r.htm.mean - best.htm) < 1e-9 ? "is-best" : "",
      }, COLUMNS.map((c) => {
        const v = c.get(r);
        const isBest = c.best && typeof v === "number" && Math.abs(v - best[c.key]) < 1e-9;
        if (c.name) {
          return el("td", { class: "name" },
            el("a", { href: `#/methods/${encodeURIComponent(r.method)}` }, r.method));
        }
        if (c.key === "solved") {
          return el("td", { class: "num" },
            r.solved === r.scrambles
              ? chip(`${r.solved}/${r.scrambles}`, "mint")
              : chip(`${r.solved}/${r.scrambles}`, "rose"));
        }
        return el("td", { class: "num" },
          isBest ? el("b", { style: { color: "var(--fox-soft)" } }, fmt(c.key, v)) : fmt(c.key, v));
      }))))));
  }

  function fmt(key, v) {
    if (v === null || v === undefined) return "—";
    if (key === "seconds" || key === "worst") return num(v, 3);
    if (typeof v === "number") return num(v, 2);
    return String(v);
  }

  /* ------------------------------------------------------------------ biểu đồ */
  const bars = el("div", { class: "panel" });
  function drawBars() {
    const metric = sortKey === "seconds" || sortKey === "worst" ? "seconds" : "htm";
    const get = metric === "seconds" ? (r) => r.seconds.mean : (r) => r.htm.mean;
    const sorted = rows.slice().sort((a, b) => get(a) - get(b));
    const max = Math.max(...sorted.map(get));
    mount(bars,
      el("div", { class: "panel__head" },
        el("h3", {}, metric === "seconds" ? "Giây engine trên mỗi lần giải" : "Đếm động tác trên mỗi lần giải (htm)"),
        el("span", { class: "spacer" }),
        el("div", { class: "pill-tabs" },
          el("button", { class: `pill-tab ${metric === "htm" ? "is-on" : ""}`, type: "button",
                         onClick: () => { sortKey = "htm"; draw(); drawBars(); } }, "Động tác"),
          el("button", { class: `pill-tab ${metric === "seconds" ? "is-on" : ""}`, type: "button",
                         onClick: () => { sortKey = "seconds"; draw(); drawBars(); } }, "Thời gian"))),
      ...sorted.map((r) => el("div", { class: "bar-row" },
        el("span", { class: "bar-row__label" }, r.method),
        el("div", { class: "bar-track" },
          el("div", { class: `bar-fill ${metric === "seconds" ? "bar-fill--sky" : ""}`,
                      style: { width: `${Math.max(2, (get(r) / max) * 100)}%` } })),
        el("span", { class: "bar-row__val" }, metric === "seconds" ? `${num(get(r), 2)} s` : num(get(r), 2)))));
  }

  /* ------------------------------------------------------------ theo bước */
  const stagePanel = el("div", { class: "panel" });
  function drawStages(name) {
    const r = bench(name);
    if (!r || !r.stages) {
      mount(stagePanel, emptyState("Chưa có chi tiết bước", "Chạy lại bench.py với --stages."));
      return;
    }
    const entries = Object.entries(r.stages);
    const maxHtm = Math.max(...entries.map(([, d]) => d.htm_mean), 1);
    mount(stagePanel,
      el("div", { class: "panel__head" }, el("h3", {}, `Động tác đi vào đâu — ${name}`),
        el("span", { class: "spacer" }),
        el("select", {
          attrs: { "aria-label": "Phương pháp" },
          onChange: (e) => drawStages(e.target.value),
        }, ...rows.map((x) => el("option", { value: x.method, selected: x.method === name }, x.method)))),
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Bước"), el("th", { class: "num" }, "htm trung bình"),
            el("th", {}, ""), el("th", { class: "num" }, "ms trung bình"),
            el("th", { class: "num" }, "nút trung bình"), el("th", {}, "Được trả lời bởi"))),
          el("tbody", {}, entries.map(([stage, d]) => el("tr", {},
            el("td", { class: "name" }, el("code", {}, stage)),
            el("td", { class: "num" }, num(d.htm_mean, 2)),
            el("td", {}, el("div", { class: "bar-track", style: { minWidth: "90px" } },
              el("div", { class: "bar-fill", style: { width: `${(d.htm_mean / maxHtm) * 100}%` } }))),
            el("td", { class: "num" }, num(d.seconds_mean * 1000, 1)),
            el("td", { class: "num" }, int(Math.round(d.nodes_mean))),
            el("td", {}, Object.entries(d.via || {}).map(([via, n]) => chip(`${via} ×${n}`, "sky")))))))),
      el("p", { class: "tiny muted", style: { marginTop: "10px" } },
        "“book:scan” nghĩa là câu trả lời ra thẳng từ sách lớp cuối — không tìm kiếm. ",
        "“ida” là IDA* của engine với các bảng hàm đánh giá của bước. ",
        "“centres” nghĩa là bước đã liệt kê các ứng cử viên đã xếp trung tâm, vì một cú slice có thể để hai trung tâm bị đổi chỗ."));
  }

  const first = rows.slice().sort((a, b) => a.htm.mean - b.htm.mean)[0].method;
  draw();
  drawBars();
  drawStages(query.method || first);

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Benchmark"),
        el("p", { class: "panel__note" },
          `${rows.length} phương pháp × ${int(meta.scrambles || rows[0].scrambles)} cú trộn, mọi câu trả lời được chạy lại trên khối trước khi được tính. Bấm một cột để sắp xếp.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${solvedAll}/${rows.length} hoàn hảo`, "mint"),
        chip(`bảng ${duration(meta.table_seconds)}`, "sky"))),
    metaPanel,
    el("div", { class: "section-head" }, el("h2", {}, "Kết quả")),
    tableWrap,
    el("div", { class: "section-head" }, el("h2", {}, "Xếp hạng")),
    bars,
    el("div", { class: "section-head" }, el("h2", {}, "Từng bước một")),
    stagePanel);

  return { node: view };
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
