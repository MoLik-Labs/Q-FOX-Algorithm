/**
 * Ký hiệu và engine: 54 động tác dự án này đếm, một khối thử nghiệm bạn
 * có thể điều khiển bằng tay, và các con số đứng sau sách lớp cuối.
 */
import { data, totals } from "../data.js";
import { el, mount, chip, num, int, toast, copyText } from "../util.js";
import { cubePanel } from "../parts.js";
import { scramble as makeScramble, tokenize, FACE_COLOUR } from "../model.js";
import { netDiagram } from "../diagram.js";
import { download } from "../util.js";

const METRICS = ["htm", "qtm", "stm", "etm"];
// Lấy thẳng từ bảng chi phí của chính engine, không phải phỏng đoán:
//   xoay mặt quarter/half   1  1|2  1  1
//   wide, slice, xoay toàn   2  2|4  1  1|2
const METRIC_NOTE = {
  htm: "cú xoay mặt tính 1 dù quarter hay half; cú wide, slice hoặc xoay toàn khối tính 2",
  qtm: "quarter-turn tính 1, half tính 2; cú wide, slice và xoay toàn khối gấp đôi",
  stm: "mọi cú xoay tính 1 — một cú slice là một động tác, đúng cách ký hiệu speedcubing đếm, nên đây là con số các thẻ bài trích dẫn",
  etm: "giống stm với các cú xoay mặt và wide; một cú slice tính 2 vì hai lớp cùng chuyển",
};

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;
  const t = totals();

  /* ------------------------------------------------------------- khu thử nghiệm */
  const panel = cubePanel({ size: 300, highlight: "none", reset: true });
  const cube = panel.cube;
  const history = [];
  const seqOut = el("div", { class: "alg alg--lg", style: { minHeight: "48px" } }, "—");
  const costOut = el("div", { class: "metrics" });

  function refresh() {
    const text = history.join(" ");
    mount(seqOut, text ? document.createTextNode(text) : document.createTextNode("—"));
    const ids = history.map((n) => M.byName.get(n).id);
    mount(costOut, METRICS.map((m) => el("div", { class: "metric", title: METRIC_NOTE[m] },
      el("div", { class: "metric__k" }, m),
      el("div", { class: "metric__v" }, String(cost(m, ids))))));
  }

  /** Chi phí động tác của chính engine, cộng lại — không tái lập. */
  function cost(metric, ids) {
    return ids.reduce((s, id) => s + M.byId.get(id).cost[metric], 0);
  }

  async function run(text) {
    let tokens;
    try { tokens = tokenize(text); }
    catch (err) { toast(err.message, "err"); return; }
    for (const tok of tokens) {
      if (!M.byName.has(tok)) { toast(`"${tok}" không phải một trong 54 động tác của engine`, "err"); return; }
    }
    for (const tok of tokens) {
      await cube.turn(tok, Math.min(cube.speed, 160));
      history.push(tok);
    }
    refresh();
  }

  const input = el("input", {
    class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: "Nhập một chuỗi rồi bấm Áp dụng — R U R' U', M2, y2, r U r'…",
    attrs: { "aria-label": "Chuỗi động tác" },
    onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); run(input.value); input.value = ""; } },
  });

  const pad = el("div", { class: "row row--tight" },
    ...[...["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2",
        "L", "L'", "L2", "B", "B'", "B2", "M", "M'", "E", "S", "r", "l", "u", "d",
        "x", "y", "z"]].map((name) => el("button", {
      class: "move", type: "button", title: `Áp dụng ${name}`,
      onClick: async () => { await cube.turn(name, Math.min(cube.speed, 160)); history.push(name); refresh(); },
    }, name)));

  const playground = el("div", { class: "split" },
    el("div", { class: "panel stack" },
      el("div", { class: "panel__head" }, el("h3", {}, "Khu thử nghiệm"),
        el("span", { class: "spacer" }),
        chip(data.check.ok ? "mô hình == engine" : "mô hình bất đồng", data.check.ok ? "mint" : "rose")),
      el("div", { style: { display: "grid", placeItems: "center" } }, panel.node),
      input,
      el("div", { class: "row" },
        el("button", { class: "btn btn--primary", type: "button", onClick: () => { run(input.value); input.value = ""; } }, "Áp dụng"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          const one = history.pop();
          if (one) { await cube.turn(M.invert([one])[0], Math.min(cube.speed, 160)); refresh(); }
        } }, "Hoàn tác"),
        el("button", { class: "btn", type: "button", onClick: () => { history.length = 0; cube.reset(); refresh(); } }, "Xóa"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          const s = makeScramble(25, Math.random, null);
          history.length = 0; cube.reset();
          await run(s.join(" "));
        } }, "Trộn"),
        el("button", { class: "btn btn--ghost", type: "button", onClick: async () => {
          const ok = await copyText(history.join(" "));
          toast(ok ? "Đã sao chép chuỗi" : "Không có gì để sao chép", ok ? "ok" : "warn");
        } }, "Sao chép")),
      el("div", {}, el("div", { class: "tiny muted", style: { marginBottom: "4px" } }, "Session này"), seqOut),
      costOut,
      el("div", { class: "hint" },
        "Mọi cú xoay ở trên đều áp dụng bằng chính hoán vị dán của engine, và hàng chi phí là bảng chi phí của chính engine. Kéo khối để nhìn nó từ một phía khác; “Lưới phẳng” hiện trạng thái đó dưới dạng mở ra.")),
    el("div", { class: "stack" },
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Thứ tự mặt và màu sắc")),
        el("p", { class: "small muted" },
          "Engine đánh số mặt U R F D L B và các dán 0-53 theo thứ tự đó. ",
          "Mọi trạng thái trên trang này là 54 chữ cái đó."),
        netDiagram(M.solved, { cell: 20 }),
        el("div", { class: "row row--tight", style: { marginTop: "10px" } },
          ... "URFDLB".split("").map((f) => el("span", { class: "chip" },
            el("span", { style: { width: "10px", height: "10px", borderRadius: "3px",
                                  background: FACE_COLOUR[f], display: "inline-block" } }), f)))),
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Sách lớp cuối")),
        el("div", { class: "stats" },
          stat(int(t.elements), "phần tử", "hoán vị góc × xoay góc × hoán vị cạnh × lật cạnh, khớp parity"),
          stat(int(data.book.found), "đã tới", `${num(t.coverage, 2)}% không gian`),
          stat(String(t.swept), "độ quét", "liệt kê hoàn chỉnh từ trạng thái giải"),
          stat(String(t.exactTo), "chính xác tới", "hai nửa của quả cầu, gặp nhau ở giữa")),
        el("p", { class: "small", style: { marginTop: "10px" } }, data.book.note),
        el("div", { class: "stack", style: { gap: "4px", marginTop: "10px" } },
          ...Object.entries(data.book.histogram).map(([len, n]) => {
            const max = Math.max(...Object.values(data.book.histogram));
            return el("div", { class: "bar-row" },
              el("span", { class: "bar-row__label" }, `${len} động tác`),
              el("div", { class: "bar-track" },
                el("div", { class: "bar-fill bar-fill--mint", style: { width: `${(n / max) * 100}%` } })),
              el("span", { class: "bar-row__val" }, int(n)));
          })))));

  /* ------------------------------------------------------------ bảng động tác */
  const moveTable = el("div", { class: "table-wrap" },
    el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", { class: "num" }, "id"), el("th", {}, "Động tác"), el("th", {}, "Họ"),
        el("th", {}, "Trục"), el("th", { class: "num" }, "htm"), el("th", { class: "num" }, "qtm"),
        el("th", { class: "num" }, "stm"), el("th", { class: "num" }, "etm"), el("th", {}, "Thử"))),
      el("tbody", {}, data.engine.moves.map((m) => el("tr", {},
        el("td", { class: "num muted" }, String(m.id)),
        el("td", { class: "name" }, el("code", {}, m.name)),
        el("td", {}, m.family),
        el("td", {}, ["U/D", "R/L", "F/B"][m.axis] || String(m.axis)),
        ...m.cost.map((c) => el("td", { class: "num" }, String(c))),
        el("td", {}, el("button", {
          class: "btn btn--sm", type: "button",
          onClick: async () => {
            playground.scrollIntoView({ behavior: "smooth", block: "center" });
            await run(m.name);
          },
        }, "Áp dụng")))))));

  const masks = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Mặt phủ động tác")),
    el("p", { class: "small muted" },
      "Một bước nói động tác nào nó được dùng. Engine giữ một mặt phủ 54-bit cho mỗi bước; ",
      "6 cạnh cuối của Roux, chẳng hạn, chỉ cần slice M và mặt U."),
    el("div", { class: "table-wrap" },
      el("table", { class: "table" },
        el("thead", {}, el("tr", {}, el("th", {}, "Mặt phủ"), el("th", {}, "Bit"), el("th", {}, "Cho phép"))),
        el("tbody", {},
          maskRow("outer", data.engine.masks.outer, "18 cú xoay mặt ngoài — thứ gần như mọi bước dùng"),
          maskRow("mu", data.engine.masks.mu, "<M, U>: tập động tác LSE của Roux, 6 cạnh và trung tâm"),
          maskRow("ulr", data.engine.masks.ulr, "<U, R, L>: lớp cuối của ZZ và lớp giữa của LBL, không F/B/D")))));

  const abi = el("div", { class: "panel" },
    el("div", { class: "panel__head" }, el("h3", {}, "Trình duyệt đã kiểm tra gì")),
    el("p", { class: "small muted" },
      "Trang này tự vẽ khối của nó. Trước khi vẽ, nó suy lại toàn bộ 54 hoán vị dán ",
      "từ hình học ô và hướng, rồi đối chiếu với engine, nên một hình sai không thể ",
      "lặng lẽ được xuất bản."),
    el("div", { class: "hint " + (data.check.ok ? "hint--mint" : "") },
      data.check.ok
        ? `Mọi hoán vị engine (${data.check.checked} động tác) đều được mô hình trình duyệt tái tạo chính xác.`
        : `${data.check.mismatches.length} trong ${data.check.checked} động tác bất đồng — đừng tin khối trên trang này.`),
    el("p", { class: "tiny muted", style: { marginTop: "10px" } },
      "Kiểm tra tương tự chạy trong node: ", el("code", {}, "node web/test/model.test.mjs"),
      ", và ở phía engine ", el("code", {}, "python3 scripts/validate_web_data.py"), "."));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Ký hiệu & engine"),
        el("p", { class: "panel__note" },
          `${t.moves} động tác, bốn cách đếm chúng, và cuốn sách làm lớp cuối thành một lần tra.`)),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(data.engine.engine || "engine", "fox"),
        el("button", { class: "btn btn--sm", type: "button",
                       onClick: () => download("qfox-engine.json", JSON.stringify(data.engine, null, 1)) },
                     "Tải engine.json"))),
    playground,
    el("div", { class: "section-head" }, el("h2", {}, "Tất cả 54 động tác"),
      el("span", { class: "panel__note" }, "id = họ × 3 + bậc, cách đánh số bên trong của engine")),
    moveTable,
    el("div", { class: "section-head" }, el("h2", {}, "Đếm và mặt phủ")),
    el("div", { class: "grid grid--2" }, masks, abi));

  refresh();
  return { node: view, destroy: () => cube.stop() };
}

function maskRow(name, bits, note) {
  return el("tr", {},
    el("td", { class: "name" }, el("code", {}, name)),
    el("td", { class: "num mono tiny" }, `0x${Number(bits).toString(16)}`),
    el("td", { class: "small" }, note));
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
