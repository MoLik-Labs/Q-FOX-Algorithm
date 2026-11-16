/**
 * Tạo công thức: nơi người học tự xây thuật toán và kiểm chứng nó.
 *
 * Một công thức ở đây là một chuỗi động tác bạn gõ hoặc bấm, được chạy
 * trên khối thử nghiệm, rồi đối chiếu với mục tiêu của một họ bài bằng
 * chính bảng dán của engine. Nếu đạt, bạn có thể lưu lại thành công
 * thức của riêng mình -- và dùng nó trong bài luyện.
 *
 * Đây là phần "tạo công thức chuẩn": bạn không chỉ đọc thuật toán có
 * sẵn, mà tự xây, tự kiểm tra, tự lưu -- hiểu tại sao nó hoạt động,
 * không chỉ nhớ ký hiệu.
 */
import { data, caseByKey } from "../data.js";
import { el, mount, chip, toast, copyText, seconds } from "../util.js";
import { cubePanel } from "../parts.js";
import { scramble as makeScramble, tokenize } from "../model.js";
import { topLayer } from "../diagram.js";
import { goalReached, goalUpToAuf, GOAL_TEXT } from "../goals.js";
import { getFormulas, saveFormula, deleteFormula } from "../store.js";
import { exportFormulaPng, exportFormulaPdf, drawFormulaCard } from "../export.js";

const MOVES = ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2", "D", "D'", "D2",
              "L", "L'", "L2", "B", "B'", "B2", "M", "M'", "E", "S", "r", "l", "u",
              "x", "y", "z"];

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;

  /* ------------------------------------------------------------ khối thử nghiệm */
  const panel = cubePanel({ size: 300, highlight: "none", reset: true });
  const cube = panel.cube;
  let history = [];   // chuỗi động tác đã chạy
  let startState = M.solved;  // trạng thái khởi đầu

  const seqOut = el("div", { class: "alg alg--lg", style: { minHeight: "52px" } }, "—");
  const resultOut = el("div");
  const costOut = el("div", { class: "metrics" });

  function refresh() {
    const text = history.join(" ");
    mount(seqOut, text ? document.createTextNode(text) : document.createTextNode("—"));
    drawFormulaPreview();
    const ids = history.map((n) => M.byName.get(n).id);
    const costs = ids.reduce((s, id) => {
      const c = M.byId.get(id).cost;
      return { htm: s.htm + c.htm, qtm: s.qtm + c.qtm, stm: s.stm + c.stm, etm: s.etm + c.etm };
    }, { htm: 0, qtm: 0, stm: 0, etm: 0 });
    mount(costOut, Object.entries({ htm: "htm", qtm: "qtm", stm: "stm", etm: "etm" })
      .map(([k, label]) => el("div", { class: "metric" },
        el("div", { class: "metric__k" }, label),
        el("div", { class: "metric__v" }, String(costs[k])))));
    verify();
  }

  /** Đối chiếu chuỗi hiện tại với mục tiêu đã chọn. */
  let selectedGoal = "PLL";
  function verify() {
    let after = startState;
    let legal = true;
    try {
      for (const tok of history) after = M.apply(after, tok);
    } catch { legal = false; }
    const current = legal ? after : startState;
    mount(resultOut, legal ? verdict(selectedGoal, current, history.length) : verdictFail());
  }

  function verdict(goal, state, len) {
    const reached = goalReached(goal, state, M);
    const auf = !reached ? goalUpToAuf(goal, state, M) : null;
    if (reached) {
      return el("div", { class: "hint hint--mint" },
        el("b", {}, "✓ Đạt mục tiêu: "), GOAL_TEXT[goal],
        " · ", String(len), " động tác",
        auf ? "" : ".");
    }
    if (auf) {
      return el("div", { class: "hint hint--sky" },
        el("b", {}, " gần rồi — "), "thiếu một cú ", el("code", {}, auf),
        " nữa là đạt ", GOAL_TEXT[goal], ".");
    }
    return el("div", { class: "hint" },
      "Chưa đạt ", GOAL_TEXT[goal], ". Thử thêm động tác, hoặc đổi mục tiêu / trạng thái khởi đầu.");
  }

  function verdictFail() {
    return el("div", { class: "hint hint--rose" }, "Chuỗi có động tác engine không đọc được.");
  }

  async function run(text) {
    let tokens;
    try { tokens = tokenize(text); }
    catch (err) { toast(err.message, "err"); return; }
    for (const tok of tokens) {
      if (!M.byName.has(tok)) { toast(`"${tok}" không phải động tác của engine`, "err"); return; }
    }
    for (const tok of tokens) {
      await cube.turn(tok, Math.min(cube.speed, 140));
      history.push(tok);
    }
    refresh();
  }

  async function applyOne(name) {
    await cube.turn(name, Math.min(cube.speed, 140));
    history.push(name);
    refresh();
  }

  /* --------------------------------------------------------------- bộ nhập */
  const input = el("input", {
    class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: "Nhập chuỗi rồi bấm Chạy — R U R' U', M2 U M2, y2…",
    attrs: { "aria-label": "Chuỗi động tác" },
    onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); run(input.value); input.value = ""; } },
  });

  const pad = el("div", { class: "row row--tight" },
    ...MOVES.map((name) => el("button", {
      class: "move", type: "button", title: `Áp dụng ${name}`,
      onClick: () => applyOne(name),
    }, name)));

  /* ------------------------------------------------------- mục tiêu / khởi đầu */
  const goalSelect = el("select", {
    attrs: { "aria-label": "Mục tiêu kiểm chứng" },
    onChange: (e) => { selectedGoal = e.target.value; verify(); },
  }, ...data.families.map((f) => el("option", { value: f.key, selected: f.key === selectedGoal },
    `${f.label} — ${GOAL_TEXT[f.key]}`)));

  // trạng thái khởi đầu: khối hoàn chỉnh, hoặc một bài cụ thể của họ đã chọn
  const startSelect = el("select", {
    attrs: { "aria-label": "Trạng thái khởi đầu" },
    onChange: (e) => startFrom(e.target.value),
  });

  function rebuildStartOptions() {
    const fam = selectedGoal;
    const opts = [{ v: "solved", label: "Khối hoàn chỉnh" }];
    for (const c of data.cases.filter((x) => x.family === fam && x.moves.length)) {
      opts.push({ v: c.key, label: (c.teach && c.teach.name) || (c.names && c.names[0]) || `Bài ${c.i + 1}` });
    }
    mount(startSelect, opts.map((o) => el("option", { value: o.v }, o.label)));
  }
  goalSelect.addEventListener("change", rebuildStartOptions);

  function startFrom(key) {
    if (key === "solved") { startState = M.solved; history = []; cube.reset(); }
    else {
      const c = caseByKey(key);
      if (c) { startState = c.state; history = []; cube.setState(c.state); }
    }
    refresh();
  }

  /* -------------------------------------------------------------- công cụ */
  const nameInput = el("input", {
    class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: "Tên công thức, ví dụ: Sune của tôi",
    attrs: { "aria-label": "Tên công thức" },
    onInput: drawFormulaPreview,
  });
  const noteInput = el("input", {
    class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: "Ghi chú (tuỳ) — tại sao xây thế này",
    attrs: { "aria-label": "Ghi chú công thức" },
    onInput: drawFormulaPreview,
  });

  // preview công thức chuẩn sách -- vẽ bằng chính công cụ xuất
  const formulaPreview = el("canvas", { width: "520", height: "180",
    style: { width: "100%", maxWidth: "520px", borderRadius: "var(--r-md)", border: "1px solid var(--s-3)", background: "var(--s-2)" },
    attrs: { "aria-label": "Trước khi lưu -- xem công thức" },
  });
  function drawFormulaPreview() {
    const ctx = formulaPreview.getContext?.("2d");
    if (!ctx) return;
    const text = history.join(" ");
    ctx.clearRect(0, 0, 520, 180);
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, 520, 180);
    drawFormulaCard(ctx, { name: nameInput.value || "Công thức", text, goal: selectedGoal, note: noteInput.value });
  }

  function doSave() {
    const text = history.join(" ");
    if (!text) { toast("Chuỗi còn trống — chạy ít nhất một động tác trước", "err"); return; }
    const rec = saveFormula({ name: nameInput.value, text, goal: selectedGoal, note: noteInput.value });
    nameInput.value = ""; noteInput.value = "";
    toast(`Đã lưu: ${rec.name}`, "ok");
    drawSaved();
  }

  function doCopy() {
    const text = history.join(" ");
    if (!text) { toast("Chuỗi còn trống", "err"); return; }
    copyText(text).then((ok) => toast(ok ? `Đã sao chép: ${text}` : "Sao chép thất bại", ok ? "ok" : "err"));
  }

  /* ------------------------------------------------------------ công thức đã lưu */
  const savedHost = el("div");
  function drawSaved() {
    const list = getFormulas();
    if (!list.length) {
      mount(savedHost, el("p", { class: "small muted" },
        "Chưa có công thức nào do bạn tạo. Xây một chuỗi đạt mục tiêu, rồi bấm Lưu công thức."));
      return;
    }
    const head = el("thead", {}, el("tr", {},
      el("th", {}, "Tên"), el("th", {}, "Mục tiêu"), el("th", {}, "Chuỗi"),
      el("th", { class: "num" }, "Động tác"), el("th", {}, "Hoạt động")));

    const rows = list.map((f) => {
      const tokens = String(f.text).split(/\s+/).filter(Boolean);
      const actBtn = el("button", { class: "btn btn--sm", type: "button",
        onClick: () => { if (confirm(`Xóa công thức "${f.name}"?`)) { deleteFormula(f.id); drawSaved(); } } }, "Xóa");
      const copyBtn = el("button", { class: "btn btn--sm", type: "button",
        onClick: () => copyText(f.text).then((ok) => toast(ok ? "Đã sao chép" : "Sao chép thất bại", ok ? "ok" : "err")) }, "Sao chép");
      const openBtn = el("button", { class: "btn btn--sm", type: "button",
        onClick: () => loadFormula(f) }, "Mở");
      const pngBtn = el("button", { class: "btn btn--sm", type: "button",
        onClick: () => exportFormulaPng(f).then(() => toast("Đã tải PNG", "ok")).catch(() => toast("Xuất PNG thất bại", "err")) }, "PNG");
      const pdfBtn = el("button", { class: "btn btn--sm", type: "button",
        onClick: () => exportFormulaPdf(f) }, "PDF");
      const actions = el("div", { class: "row row--tight" }, openBtn, pngBtn, pdfBtn, copyBtn, actBtn);
      const nameCell = el("td", { class: "name" }, f.name,
        f.note ? el("div", { class: "tiny muted" }, f.note) : null);
      const goalCell = el("td", {}, chip(f.goal, "fox"));
      const textCell = el("td", {}, el("code", { class: "tiny" }, f.text || "—"));
      const countCell = el("td", { class: "num" }, String(tokens.length));
      return el("tr", {}, nameCell, goalCell, textCell, countCell, el("td", {}, actions));
    });

    const body = el("tbody", {}, rows);
    const table = el("table", { class: "table" }, head, body);
    const wrap = el("div", { class: "table-wrap" }, table);
    mount(savedHost, wrap);
  }

  function loadFormula(f) {
    selectedGoal = f.goal;
    goalSelect.value = f.goal;
    rebuildStartOptions();
    startFrom("solved");
    history = String(f.text).split(/\s+/).filter(Boolean);
    mount(seqOut, document.createTextNode(history.join(" ") || "—"));
    // chạy nhanh trên khối (không anim từng bước quá lâu)
    cube.setState(startState);
    let after = startState;
    for (const tok of history) after = M.apply(after, tok);
    cube.setState(after);
    refresh();
    nameInput.value = f.name;
    noteInput.value = f.note || "";
    document.querySelector(".builder__studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`Mở công thức: ${f.name}`, "info");
  }

  /* ------------------------------------------------------------------ layout */
  const studio = el("div", { class: "split builder__studio" },
    el("div", { class: "panel stack" },
      el("div", { class: "panel__head" }, el("h3", {}, "Xây công thức"),
        el("span", { class: "spacer" }),
        chip(data.check.ok ? "mô hình == engine" : "mô hình bất đồng", data.check.ok ? "mint" : "rose")),
      el("div", { style: { display: "grid", placeItems: "center" } }, panel.node),
      input,
      el("div", { class: "row" },
        el("button", { class: "btn btn--primary", type: "button", onClick: () => { run(input.value); input.value = ""; } }, "Chạy"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          const one = history.pop();
          if (one) { await cube.turn(M.invert([one])[0], Math.min(cube.speed, 140)); refresh(); }
        } }, "Hoàn tác"),
        el("button", { class: "btn", type: "button", onClick: () => { history = []; cube.reset(); refresh(); } }, "Xóa"),
        el("button", { class: "btn", type: "button", onClick: async () => {
          history = []; cube.reset();
          const s = makeScramble(25, Math.random, null);
          startState = M.applyIds(M.solved, M.invert(s));
          cube.setState(startState);
          await run(s.join(" "));
        } }, "Trộn khởi đầu"),
        el("button", { class: "btn btn--ghost", type: "button", onClick: doCopy }, "Sao chép")),
      pad,
      el("div", {}, el("div", { class: "tiny muted", style: { marginBottom: "4px" } }, "Chuỗi hiện tại"), seqOut),
      costOut,
      resultOut),
    el("div", { class: "stack" },
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Kiểm chứng")),
        el("div", { class: "field" }, el("label", { for: "goal" }, "Mục tiêu"), goalSelect),
        el("div", { class: "field" }, el("label", { for: "start" }, "Trạng thái khởi đầu"), startSelect),
        el("p", { class: "tiny muted", style: { marginTop: "8px" } },
          "Chọn mục tiêu và trạng thái khởi đầu, rồi xây chuỗi đạt nó. Mỗi lần thay đổi, kết quả được đối chiếu lại bằng chính bảng dán của engine.")),
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Lưu công thức")),
        nameInput,
        noteInput,
        el("div", { class: "tiny muted", style: { marginTop: "8px" } }, "Trước khi lưu -- xem công thức như sách giáo khoa:"),
        formulaPreview,
        el("div", { class: "row", style: { marginTop: "8px" } },
          el("button", { class: "btn btn--primary", type: "button", onClick: doSave }, "Lưu công thức"),
          el("button", { class: "btn", type: "button", disabled: !history.length,
            onClick: () => exportFormulaPng({ name: nameInput.value || "Công thức", text: history.join(" "), goal: selectedGoal, note: noteInput.value }).then(() => toast("Đã tải PNG công thức", "ok")).catch(() => toast("Xuất PNG thất bại", "err")) }, "PNG công thức"),
          el("button", { class: "btn", type: "button", disabled: !history.length,
            onClick: () => exportFormulaPdf({ name: nameInput.value || "Công thức", text: history.join(" "), goal: selectedGoal, note: noteInput.value }) }, "PDF công thức")),
        el("p", { class: "tiny muted", style: { marginTop: "8px" } },
          "Lưu khi chuỗi đạt mục tiêu. Công thức được lưu trong trình duyệt này và có thể mở lại, sao chép, hoặc dùng trong bài luyện.")),
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Công thức của bạn"),
          el("span", { class: "spacer" }),
          chip(`${getFormulas().length} công thức`, "sky")),
        savedHost)));

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Tạo công thức"),
        el("p", { class: "panel__note" },
          "Tự xây thuật toán và kiểm chứng nó trên khối, bằng chính bảng dán của engine. Đạt mục tiêu rồi lưu thành công thức của riêng bạn -- hiểu tại sao nó hoạt động, không chỉ nhớ ký hiệu.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip(`${data.families.length} mục tiêu`, "fox"),
        chip("kiểm chứng bởi engine", "mint"))),
    studio);

  rebuildStartOptions();
  startFrom("solved");
  drawSaved();

  return { node: view, destroy: () => cube.stop() };
}
