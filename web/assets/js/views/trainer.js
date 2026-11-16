/**
 * Bài luyện tập: lý do mở trang này mỗi ngày.
 *
 * Ba cách được hỏi, một lịch học nằm dưới:
 *   recall     nhập thuật toán. Đánh giá hai cách — có đạt đích không
 *              (kiểm tra trên khối, không so chuỗi), và có ngắn như của
 *              engine không. Thời gian nhập được ghi vào kỷ lục cá nhân.
 *   recognise  chọn đúng thuật toán trong bốn.
 *   flash      nhìn bài, nói to, hiện đáp án, tự đánh giá.
 *
 * Thứ tự đến từ lịch học nhắc lại sáu hộp trong localStorage, nên bài bạn
 * sai mười phút trước sẽ quay lại trước bài bạn biết tuần trước.
 */
import { data, casesOf, caseByKey, levelKeys, search } from "../data.js";
import { el, mount, chip, num, toast, progressBar, emptyState, download, seconds } from "../util.js";
import { cubePanel, boxDots, openCase } from "../parts.js";
import { schedule, review, stats, logSession, card as srsCard, exportAll, recordAnswer, recordActivity, records } from "../store.js";
import { goalReached, goalUpToAuf, GOAL_TEXT } from "../goals.js";
import { tokenize } from "../model.js";
import { topLayer } from "../diagram.js";

const MODES = {
  recall: "Nhập nó",
  recognise: "Chọn nó",
  flash: "Nói nó",
};

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;

  /* ---------------------------------------------------------- chọn bài */
  const setOptions = [];
  setOptions.push({ id: "*", label: `Tất cả (${data.cases.length})`, keys: data.cases.map((c) => c.key) });
  for (const f of data.families) {
    setOptions.push({ id: f.key, label: `${f.label} (${f.cases})`, keys: casesOf(f.key).map((c) => c.key) });
  }
  for (const lv of data.levelsList) {
    setOptions.push({ id: `level:${lv.key}`, label: `${lv.title} (${levelKeys(lv.key).length})`, keys: levelKeys(lv.key) });
    for (const item of lv.curriculum || []) {
      setOptions.push({
        id: `set:${lv.key}:${item.id}`,
        label: `↳ ${item.title} (${item.cases.length})`,
        keys: item.cases.map((c) => c.key),
        indent: true,
      });
    }
  }

  let keys = [];
  if (query.keys) {
    keys = String(query.keys).split(",").filter((k) => caseByKey(k));
  } else if (query.level && query.set) {
    const opt = setOptions.find((o) => o.id === `set:${query.level}:${query.set}`);
    keys = opt ? opt.keys : [];
  } else if (query.level) {
    keys = levelKeys(query.level);
  } else if (query.family) {
    keys = casesOf(query.family).map((c) => c.key);
    if (query.key && keys.includes(query.key)) keys = [query.key, ...keys.filter((k) => k !== query.key)];
  } else {
    keys = setOptions[0].keys;
  }

  const chosen = query.keys ? "tùy chỉnh"
    : query.level && query.set ? `set:${query.level}:${query.set}`
    : query.level ? `level:${query.level}`
    : query.family || "*";

  let mode = query.mode || "recall";
  let queue = schedule(keys).map((r) => r.key);
  let index = 0;
  let session = { total: 0, right: 0, near: 0, wrong: 0, startedAt: Date.now(), ms: 0 };

  /* ---------------------------------------------------------------- giao diện */
  const setSelect = el("select", {
    attrs: { "aria-label": "Chọn bài" },
    onChange: (e) => {
      const opt = setOptions.find((o) => o.id === e.target.value);
      if (!opt) return;
      keys = opt.keys;
      queue = schedule(keys).map((r) => r.key);
      index = 0;
      next();
    },
  }, ...setOptions.map((o) => el("option", {
    value: o.id, selected: o.id === chosen, style: o.indent ? { paddingLeft: "16px" } : null,
  }, o.label)));

  const modeTabs = el("div", { class: "pill-tabs" },
    ...Object.entries(MODES).map(([k, label]) => el("button", {
      class: `pill-tab ${k === mode ? "is-on" : ""}`, type: "button", dataset: { mode: k },
      onClick: () => {
        mode = k;
        [...modeTabs.children].forEach((b) => b.classList.toggle("is-on", b.dataset.mode === k));
        next();
      },
    }, label)));

  const shuffleBtn = el("button", {
    class: "btn btn--sm", type: "button", title: "Thứ tự ngẫu nhiên, bỏ qua lịch học",
    onClick: () => {
      queue = keys.slice().sort(() => Math.random() - 0.5);
      index = 0;
      next();
    },
  }, "Xáo trộn");

  const dueOnly = el("button", {
    class: "btn btn--sm", type: "button", title: "Chỉ bài mà lịch học báo đến hạn",
    onClick: () => {
      const now = Date.now();
      queue = schedule(keys).filter((r) => r.overdue || r.fresh).map((r) => r.key);
      index = 0;
      toast(queue.length ? `${queue.length} bài đến hạn` : "Không có bài nào đến hạn — bạn đã học đủ", queue.length ? "info" : "ok");
      next();
    },
  }, "Đến hạn");

  /* ----------------------------------------------------------------- khuôn */
  const panel = cubePanel({ size: 268, highlight: "ll", reset: false, viewToggle: true });
  const diagram = el("div", {});
  const question = el("div", { class: "stack" });
  const verdict = el("div");
  const statsBar = el("div", { class: "stats" });
  const progress = el("div", {});
  const timerOut = el("span", { class: "badge" }, "0,0 s");

  const stage = el("div", { class: "trainer" },
    el("div", { class: "trainer__stage panel" },
      el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted", id: "trainer-pos" }, ""),
        el("span", { class: "spacer" }),
        timerOut,
        el("span", { class: "tiny muted" }, "kéo để xoay")),
      panel.node,
      diagram,
      el("div", { class: "cube-tools" },
        el("button", { class: "btn btn--sm", type: "button", id: "t-hint" }, "Hiện gợi ý"),
        el("button", { class: "btn btn--sm", type: "button", id: "t-replay" }, "Chạy đáp án"),
        el("button", { class: "btn btn--sm", type: "button", id: "t-again" }, "Hiện lại bài"))),
    el("div", { class: "panel stack" },
      progress,
      question,
      verdict,
      statsBar));

  /* --------------------------------------------------------------- bài hiện tại */
  let current = null;
  let answered = false;
  let askedAt = 0;
  let timerId = null;

  function startTimer() {
    clearInterval(timerId);
    askedAt = Date.now();
    timerId = setInterval(() => {
      const s = (Date.now() - askedAt) / 1000;
      timerOut.textContent = seconds(s, 1);
    }, 100);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function draw() {
    if (index >= queue.length) return finish();
    const row = caseByKey(queue[index]);
    if (!row) { index++; return draw(); }
    current = row;
    answered = false;

    panel.cube.stop();
    panel.cube.setState(row.state);
    mount(diagram, el("div", { style: { display: "grid", placeItems: "center", marginTop: "8px" } },
      topLayer(row.state, { size: 108 })));

    const c = srsCard(row.key);
    mount(progress,
      el("div", { class: "row row--tight" },
        chip(`${index + 1} / ${queue.length}`, "fox"),
        chip(row.familyLabel || row.family),
        ...(row.names || []).map((n) => chip(n, "gold")),
        el("span", { class: "spacer" }),
        boxDots(c.box),
        el("span", { class: "tiny muted" }, c.seen ? `${c.seen} lần luyện` : "mới")),
      progressBar(index, queue.length, `${Math.round((100 * index) / Math.max(1, queue.length))}% của luồng này`));

    mount(question, askFor(row));
    mount(verdict);
    drawStats();
    startTimer();
  }

  function askFor(row) {
    const goal = GOAL_TEXT[row.family] || data.algorithms.families[row.family].goal;
    const head = el("div", {},
      el("h3", {}, mode === "recognise" ? "Thuật toán nào là đây?" : "Bài này là bài nào?"),
      el("p", { class: "small muted" },
        `Mục tiêu: ${goal}. `,
        row.desc.pattern, " · ", row.desc.permutation,
        row.auf_text ? el("span", {}, ` · trước AUF ${row.auf_text}`) : null));

    if (mode === "recall") {
      const input = el("input", {
        class: "answer-input", type: "text", spellcheck: "false", autocomplete: "off",
        placeholder: "Nhập nó, ví dụ R U R' U' R' F R F'",
        attrs: { "aria-label": "Thuật toán của bạn" },
        onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); check(input.value); } },
      });
      return el("div", { class: "stack" }, head, input,
        el("div", { class: "row" },
          el("button", { class: "btn btn--primary", type: "button", onClick: () => check(input.value) }, "Kiểm tra"),
          el("button", { class: "btn", type: "button", onClick: () => reveal(row) }, "Bỏ cuộc — hiện đáp án"),
          el("span", { class: "tiny muted" }, "Enter để kiểm tra · đánh giá bằng việc đạt đích trên khối")));
    }

    if (mode === "recognise") {
      const options = distractors(row);
      return el("div", { class: "stack" }, head,
        el("div", { class: "grid", style: { gap: "8px" } }, options.map((opt, i) =>
          el("button", {
            class: "btn", type: "button", style: { justifyContent: "flex-start", fontFamily: "var(--mono)" },
            onClick: (e) => pick(e.currentTarget, opt, row),
          }, el("b", {}, `${i + 1}.`), ` ${opt || "(không cần thuật toán)"}`))),
        el("p", { class: "tiny muted" }, "Nhấn 1-4 để trả lời."));
    }

    // flash
    return el("div", { class: "stack" }, head,
      el("div", { class: "hint" }, "Nói to thuật toán, hoặc chạy trong đầu, rồi hiện đáp án và tự đánh giá thật với mình."),
      el("div", { class: "row" },
        el("button", { class: "btn btn--primary", type: "button", onClick: () => reveal(row) }, "Hiện đáp án"),
        el("span", { class: "tiny muted" }, "Space để hiện")));
  }

  function distractors(row) {
    const pool = casesOf(row.family).filter((c) => c.key !== row.key && c.text && c.text !== row.text);
    const picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].text);
    }
    const opts = [...picks, row.text];
    return opts.sort(() => Math.random() - 0.5);
  }

  function pick(node, text, row) {
    if (answered) return;
    const right = text === row.text;
    [...question.querySelectorAll("button.btn")].forEach((b) => {
      const isThis = b.textContent.includes(text || "(không cần thuật toán");
      b.classList.toggle("btn--on", isThis && right);
      if (isThis && !right) b.style.borderColor = "var(--rose)";
    });
    grade(row, right ? 2 : 0, right ? "Đúng." : "Không phải cái đó.", text);
  }

  function normalise(text) {
    try { return M.format(M.parse(text)); } catch { return String(text || "").trim(); }
  }

  function check(typed) {
    if (answered || !current) return;
    const row = current;
    const mine = normalise(typed);
    const want = normalise(row.text);

    if (!mine) { reveal(row); return; }

    // nó thực sự hoạt động không? cùng câu hỏi engine trả lời, nhưng hỏi trên
    // các dán chính engine xuất bản
    let after = row.state;
    let legal = true;
    try {
      for (const tok of tokenize(typed)) after = M.apply(after, tok);
    } catch {
      legal = false;
    }
    const reaches = legal && goalReached(row.family, after, M);
    const auf = legal && !reaches ? goalUpToAuf(row.family, after, M) : null;
    const sameWord = mine === want;
    const myLen = legal ? tokenize(typed).length : 0;

    if (sameWord || (reaches && myLen <= row.count)) {
      const elapsed = Date.now() - askedAt;
      const prevBest = records().bestOf(row.key);
      recordAnswer(row.key, elapsed, true);
      const recMsg = (!prevBest || elapsed < prevBest.ms) ? " Kỷ lục mới của bạn!" : "";
      stopTimer();
      grade(row, 2, sameWord ? "Đúng hệt thuật toán trên thẻ." :
        `Vận hành, và ở ${myLen} động tác thì ${myLen === row.count ? "ngắn như" : "ngắn hơn"} ${row.count} của thẻ.`,
        mine, recMsg);
      recordActivity(2);
    } else if (reaches) {
      stopTimer();
      grade(row, 1, `Giải được bài, nhưng thẻ làm trong ${row.count} động tác và của bạn mất ${myLen}.`, mine);
      recordActivity(1);
    } else if (auf) {
      stopTimer();
      grade(row, 1, `Gần rồi — thiếu một cú ${auf} nữa là tới đích.`, mine);
      recordActivity(1);
    } else {
      stopTimer();
      grade(row, 0, legal ? "Chưa tới đích." : "Không phải ký hiệu tôi đọc được.", mine);
      recordActivity(0);
    }
  }

  function reveal(row) {
    answered = true;
    stopTimer();
    panel.cube.setState(row.state);
    mount(question,
      el("div", { class: "stack" },
        el("h3", {}, (row.teach && row.teach.name) || (row.names && row.names[0]) || `Bài ${row.familyLabel || row.family} ${row.i + 1}`),
        el("div", { class: "alg alg--lg" }, row.text || "Không có thuật toán — bài này đã ở đích."),
        row.auf_text ? el("div", { class: "hint hint--fox" }, `Trước AUF: ${row.auf_text}`) : null,
        el("div", { class: "row row--tight" },
          chip(`${row.count} động tác`, "mint"),
          chip(row.source === "textbook" ? `quen thuộc ${row.teach.name}` : "của chính engine", "gold"),
          chip(row.via === "scan" ? "quét sách" : row.via, "sky"),
          chip(row.desc.pattern, "muted")),
        row.alt
          ? el("p", { class: "tiny muted" }, `${row.alt.label}: `, el("code", {}, row.alt.text),
              ` (${row.alt.count} động tác — mở thẻ đầy đủ và bấm W để chạy)`)
          : null));
    playAnswer(row);
    if (mode === "flash") {
      mount(verdict,
        el("div", { class: "grade" },
          gradeBtn("Biết luôn", 2, "verdict--right"),
          gradeBtn("Do dự", 1, "verdict--near"),
          gradeBtn("Sai", 0, "verdict--wrong")),
        el("p", { class: "tiny muted", style: { marginTop: "8px" } }, "Phím: 1 biết · 2 do dự · 3 sai · n bài tiếp"));
    }
  }

  function gradeBtn(label, g, cls) {
    return el("button", {
      class: `btn ${cls === "verdict--right" ? "btn--on" : ""}`, type: "button",
      onClick: () => grade(current, g, label),
    }, label);
  }

  async function playAnswer(row) {
    for (const id of row.tokens) {
      if (!document.body.contains(stage)) return;
      await panel.cube.turn(M.byId.get(id).name, Math.min(panel.cube.speed, 170));
    }
  }

  function grade(row, g, message, mine = null, extra = "") {
    answered = true;
    stopTimer();
    session.total++;
    if (g === 2) session.right++;
    else if (g === 1) session.near++;
    else session.wrong++;
    session.ms += Date.now() - askedAt;
    const c = review(row.key, g);

    mount(verdict,
      el("div", { class: `verdict ${g === 2 ? "verdict--right" : g === 1 ? "verdict--near" : "verdict--wrong"}` },
        el("b", {}, message, extra),
        mine ? el("div", { class: "mono small", style: { marginTop: "6px" } }, "của bạn: ", mine) : null,
        mine && mine !== normalise(row.text) ? el("div", { class: "mono small" }, "trên thẻ:  ", row.text) : null,
        el("div", { class: "tiny muted", style: { marginTop: "8px" } },
          `Hộp ${c.box}/5 · luyện tiếp vào ${c.due ? new Date(c.due).toLocaleString("vi-VN") : "ngay bây giờ"}`)),
      el("div", { class: "row", style: { marginTop: "12px" } },
        el("button", { class: "btn btn--primary", type: "button", onClick: next }, "Bài tiếp theo (n)"),
        el("button", { class: "btn btn--sm", type: "button", onClick: () => playAnswer(row) }, "Chạy lại"),
        el("button", { class: "btn btn--sm", type: "button", onClick: () => openCaseSheet(row) }, "Mở thẻ đầy đủ")));

    if (mode === "flash") {
      mount(question,
        el("div", { class: "stack" },
          el("h3", {}, (row.teach && row.teach.name) || (row.names && row.names[0]) || `Bài ${row.familyLabel || row.family} ${row.i + 1}`),
          el("div", { class: "alg alg--lg" }, row.text || "Không có thuật toán — đã ở đích."),
          el("div", { class: "row row--tight" }, chip(`${row.count} động tác`), chip(row.desc.pattern, "muted"))));
    }
    drawStats();
  }

  function next() {
    index++;
    if (index >= queue.length) return finish();
    draw();
    const input = question.querySelector("input");
    if (input) input.focus();
  }

  function drawStats() {
    const s = stats(keys);
    mount(statsBar,
      statEl(String(session.right), "đúng", `trong ${session.total} bài đã hỏi`),
      statEl(String(session.near), "gần", "vận hành, không phải của sách"),
      statEl(String(session.wrong), "sai", ""),
      statEl(s.accuracy === null ? "—" : `${Math.round(s.accuracy * 100)}%`, "đúng xuyên suốt", `${s.seen} lần luyện`),
      statEl(String(s.mature), "bài trưởng thành", "hộp 3 trở lên"),
      statEl(String(Math.max(0, queue.length - index - 1)), "còn lại", ""));
  }

  function finish() {
    stopTimer();
    const secs = (Date.now() - session.startedAt) / 1000;
    logSession({ total: session.total, right: session.right, near: session.near,
                 wrong: session.wrong, seconds: Math.round(secs), set: chosen, mode });
    mount(stage,
      el("div", { class: "panel", style: { gridColumn: "1 / -1" } },
        el("h2", {}, session.total ? "Hết luồng" : "Chưa có gì để làm"),
        el("p", {}, session.total
          ? `${session.right} đúng, ${session.near} gần, ${session.wrong} sai trong ${Math.round(secs)} s.`
          : "Chọn một bài học, hoặc bấm “Đến hạn” khi lịch học có bài cho bạn."),
        el("div", { class: "row" },
          el("button", { class: "btn btn--primary", type: "button", onClick: () => { queue = schedule(keys).map((r) => r.key); index = 0; session = { total: 0, right: 0, near: 0, wrong: 0, startedAt: Date.now(), ms: 0 }; draw(); } }, "Chạy lại bài học này"),
          el("a", { class: "btn", href: "#/levels" }, "Về cấp độ"),
          el("button", { class: "btn btn--ghost", type: "button", onClick: () => download("qfox-progress.json", exportAll()) }, "Xuất tiến trình"))));
  }

  function openCaseSheet(row) {
    openCase(row);
  }

  /* --------------------------------------------------------------- phím tắt */
  function onKey(e) {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "n") { e.preventDefault(); if (answered) next(); }
    else if (e.key === " ") {
      e.preventDefault();
      if (!answered && mode === "flash") reveal(current);
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      if (!answered && mode === "recognise") {
        const btns = [...question.querySelectorAll("button.btn")];
        const b = btns[Number(e.key) - 1];
        if (b) b.click();
      } else if (answered && mode === "flash") {
        const g = { 1: 2, 2: 1, 3: 0 }[e.key];
        if (g !== undefined) grade(current, g, ["", "Biết luôn", "Do dự", "Sai"][Number(e.key)]);
      }
    }
  }
  document.addEventListener("keydown", onKey);

  const hintBtn = stage.querySelector("#t-hint");
  const replayBtn = stage.querySelector("#t-replay");
  const againBtn = stage.querySelector("#t-again");
  hintBtn.onclick = () => {
    if (!current) return;
    const first = (current.text || "").split(" ")[0] || "—";
    toast(`Bắt đầu bằng ${first} · ${current.count} động tác · ${current.desc.pattern}`, "info", 4200);
  };
  replayBtn.onclick = () => { if (current) { panel.cube.setState(current.state); playAnswer(current); } };
  againBtn.onclick = () => { if (current) { panel.cube.setState(current.state); mount(diagram, topLayer(current.state, { size: 108 })); } };

  const head = el("div", { class: "section-head" },
    el("div", {},
      el("h1", {}, "Bài luyện tập"),
      el("p", { class: "panel__note" },
        "Hỏi theo thứ tự học nhắc lại, đánh giá bằng việc thuật toán của bạn thực sự đạt đích, và ghi nhớ trong trình duyệt này. Thời gian nhập được ghi vào kỷ lục cá nhân.")),
    el("span", { class: "spacer" }),
    el("div", { class: "row row--tight" }, setSelect, modeTabs, shuffleBtn, dueOnly));

  mount(view, head, stage);
  draw();

  const observer = new MutationObserver(() => {
    if (!document.body.contains(view)) {
      document.removeEventListener("keydown", onKey);
      stopTimer();
      panel.cube.stop();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return {
    node: view,
    destroy() { stopTimer(); panel.cube.stop(); },
  };
}

function statEl(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}
