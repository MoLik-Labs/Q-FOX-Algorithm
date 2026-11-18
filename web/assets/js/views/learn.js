/**
 * Học: lộ trình học có cấu trúc, đi từ bài này sang bài tiếp theo.
 *
 * Trainer là ôn -- nó hỏi bạn để kéo bài về lại. openCase là học một bài
 * riêng lẻ, sâu. Trang này là phần còn thiếu: một lộ trình học có trình tự,
 * nơi bạn không phải tự suy nghĩ "học bài nào tiếp".
 *
 * Mỗi bài học trong lộ trình là một panel: khối 3-D thể hiện chính bài đó,
 * sơ đồ lớp trên, thuật toán kèm các cụm để thuộc, mục tiêu cần đạt, rồi
 * một bộ điều khiển để chơi -- nhìn khối thực sự chuyển động. "Đã học xong"
 * đánh dấu bài và đưa bạn tới bài tiếp theo. Tiến trình của cả cấp độ được
 * vạch ra ở trên, nên bạn luôn biết còn lại bao nhiêu.
 *
 * Phương pháp học: xem bài -> chơi thuật toán để nhìn nó làm gì -> thuộc
 * từng cụm -> đánh dấu xong -> chuyển bài. Không có nhận dạng yêu cầu ở
 * đây -- nhận dạng là việc của trainer.
 */
import { data, levelKeys, caseByKey } from "../data.js";
import { el, mount, chip, num, int, progressBar, toast, chunkAlg } from "../util.js";
import { cubePanel } from "../parts.js";
import { topLayer } from "../diagram.js";
import { isLearned, setLearned, learnedCount } from "../store.js";
import { GOAL_TEXT } from "../goals.js";

/** Các bài trong cấp độ, theo thứ tự học: dễ trước, cùng độ dài xếp trước. */
function orderedCases(levelKey) {
  const keys = levelKeys(levelKey);
  return keys
    .map(caseByKey)
    .filter(Boolean)
    .filter((r) => r.tokens.length)          // bỏ bài đã ở đích, không cần thuật toán
    .sort((a, b) => a.count - b.count || a.key.localeCompare(b.key));
}

export function render(params = {}, query = {}) {
  const view = el("div");
  const M = data.model;

  const levels = data.levelsList;
  const startLevel = query.level
    || (params.key in { easy: 1, medium: 1, hard: 1, full: 1 } ? params.key : null)
    || (levels[0] && levels[0].key);
  let levelKey = levels.some((l) => l.key === startLevel) ? startLevel : levels[0].key;

  /* ----------------------------------------------------------- bộ chọn cấp */
  const levelTabs = el("div", { class: "pill-tabs pill-tabs--wrap" });
  const rebuildTabs = () => {
    mount(levelTabs, levels.map((l) =>
      el("button", {
        class: `pill-tab ${l.key === levelKey ? "is-on" : ""}`, type: "button",
        onClick: () => { levelKey = l.key; idx = 0; build(); },
      }, l.title.split(" - ")[0])));
  };

  /* ------------------------------------------------------------- lesson area */
  let idx = 0;
  let lessonHost = el("div");

  const level = levels.find((l) => l.key === levelKey);
  const cases = () => orderedCases(levelKey);

  function build() {
    rebuildTabs();
    const list = cases();
    idx = Math.min(idx, list.length - 1);
    mount(lessonHost, lesson(list, idx));
    syncPath(list);
  }

  /* --------------------------------------------------------------- lộ trình */
  const pathHost = el("div", { class: "learn__path" });
  function syncPath(list) {
    mount(pathHost, el("div", { class: "learn__path-inner" },
      el("div", { class: "row row--tight", style: { marginBottom: "8px" } },
        el("span", { class: "tiny muted" }, "Lộ trình"),
        el("span", { class: "spacer" }),
        el("span", { class: "tiny muted" }, `${learnedCount(list.map((r) => r.key))} / ${list.length} đã học`)),
      el("div", { class: "learn__path-strip" },
        list.map((r, i) => {
          const done = isLearned(r.key);
          return el("button", {
            class: `learn__dot ${done ? "is-done" : ""} ${i === idx ? "is-cur" : ""}`,
            type: "button", title: r.names && r.names[0] ? r.names[0] : r.desc.pattern,
            onClick: () => { idx = i; build(); },
          }, String(i + 1));
        }))));
  }

  function lesson(list, i) {
    const row = list[i];
    if (!row) return emptyLesson(level);
    const words = (row.words && row.words.length ? row.words : [{
      key: "engine", text: row.algorithm || "", moves: row.moves || [],
      count: row.stm || 0, label: "Từ ngắn nhất đã kiểm chứng",
    }]);
    let w = 0;
    let word = words[0];
    let moves = word.moves;
    const states = [row.state];
    for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));
    let k = 0;

    /* ---------------------------------------------------------- khối + sơ đồ */
    const panel = cubePanel({
      state: row.state, size: 264, highlight: "ll", viewToggle: true, reset: false,
    });
    const cube = panel.cube;

    const diagram = el("div", { class: "learn__diagram" }, topLayer(row.state, { size: 132 }));

    /* --------------------------------------------------------------- thuật toán */
    const chipsHost = el("div", { class: "row row--wrap learn__chips" });
    let chips = el("div", { class: "row row--wrap" });
    function paintChips() {
      [...chips.children].forEach((node, j) => {
        node.classList.toggle("is-done", j < k);
        node.classList.toggle("is-now", j === k - 1);
      });
    }
    function drawChips() {
      chips = el("div", { class: "row row--wrap" });
      chips.append(...word.text.split(/\s+/).filter(Boolean).map((tok, j) => {
        const isMove = M.byName.has(tok);
        return el("button", {
          class: `move move--tok ${isMove ? "" : "is-text"}`, type: "button",
          onClick: () => goto(j + 1), title: "Nhấn để nhảy tới sau động tác này",
        }, tok);
      }));
      mount(chipsHost, chips);
      paintChips();
    }
    function goto(n, animate = false) {
      n = Math.max(0, Math.min(moves.length, n));
      if (animate && n === k + 1) {
        cube.turn(M.byId.get(moves[k]).name).then(() => { k = n; afterMove(); });
        return;
      }
      k = n;
      cube.setState(states[k]);
      afterMove();
    }
    function afterMove() {
      paintChips();
      posOut.textContent = `${k} / ${moves.length}`;
      solvedChip.style.display = M.isSolved(cube.getState()) ? "" : "none";
    }

    /* ------------------------------------------------------------ học theo cụm */
    const chunkHost = el("div", { class: "learn__chunks" });
    let chunkPer = 2;
    function drawChunks() {
      const text = word.text || "";
      if (!text) { chunkHost.style.display = "none"; return; }
      chunkHost.style.display = "";
      const chunks = chunkAlg(text, chunkPer);
      const cur = Math.floor(k / chunkPer);
      const chipsEl = el("div", { class: "row row--wrap" });
      chipsEl.append(...chunks.map((c, j) =>
        el("button", {
          class: `pill-tab ${j === cur ? "is-on" : ""} ${j < cur ? "is-done" : ""}`,
          type: "button", title: `Cụm ${j + 1}: ${c}`,
          onClick: () => goto(j * chunkPer),
        }, c)));
      mount(chunkHost, el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted" }, `Chia ${chunks.length} cụm, mỗi cụm ${chunkPer} động tác -- thuộc từng nhóm`),
        el("span", { class: "spacer" }),
        el("div", { class: "pill-tabs", style: { gap: "4px" } },
          el("button", { class: `pill-tab ${chunkPer === 2 ? "is-on" : ""}`, type: "button",
            onClick: () => { chunkPer = 2; drawChunks(); } }, "2"),
          el("button", { class: `pill-tab ${chunkPer === 3 ? "is-on" : ""}`, type: "button",
            onClick: () => { chunkPer = 3; drawChunks(); } }, "3")),
        chipsEl));
    }

    /* ------------------------------------------------------------ điều khiển */
    const playBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "▶ Chơi");
    const backBtn = el("button", { class: "btn btn--sm", type: "button", title: "Lùi (←)" }, "⟲");
    const stepBtn = el("button", { class: "btn btn--sm", type: "button", title: "Tiến (→)" }, "⟳");
    const resetBtn = el("button", { class: "btn btn--sm", type: "button", title: "Quay lại vị trí bài" }, "Bài");
    const posOut = el("span", { class: "badge" }, `0 / ${moves.length}`);
    const solvedChip = chip("hoàn thành", "mint");
    solvedChip.style.display = "none";

    async function play() {
      if (cube.isPlaying) { cube.stop(); playBtn.textContent = "▶ Chơi"; return; }
      if (k >= moves.length) goto(0);
      playBtn.textContent = "■ Dừng";
      const speed = cube.speed;
      for (let m = k; m < moves.length; m++) {
        k = m + 1;
        await cube.turn(M.byId.get(moves[m]).name, speed);
        afterMove();
      }
      playBtn.textContent = "▶ Chơi";
    }

    const transport = el("div", { class: "cube-tools" },
      playBtn, backBtn, stepBtn, resetBtn, posOut, solvedChip);

    /* --------------------------------------------------------------- câu lệnh */
    const nextBtn = el("button", { class: "btn btn--primary", type: "button",
      onClick: () => { if (i < list.length - 1) { idx = i + 1; build(); } } },
      i < list.length - 1 ? "Bài tiếp theo →" : "Hết lộ trình");
    const doneBtn = el("button", { class: `btn ${isLearned(row.key) ? "btn--ghost" : "btn--primary"}`, type: "button",
      onClick: () => {
        setLearned(row.key, true);
        toast(`Đã học xong · ${row.names && row.names[0] ? row.names[0] : row.desc.pattern}`, "ok");
        if (i < list.length - 1) { idx = i + 1; build(); }
      } }, isLearned(row.key) ? "✓ Đã học" : "Đã học xong");
    const prevBtn = el("button", { class: "btn", type: "button",
      onClick: () => { if (i > 0) { idx = i - 1; build(); } } }, "← Bài trước");

    /* --------------------------------------------------------------- lắp bài */
    drawChips();
    drawChunks();
    afterMove();

    const name = row.names && row.names[0];
    const teach = row.teach;
    const recognise = (teach && teach.recognise) || `${row.desc.pattern} · ${row.desc.permutation}`;
    const goal = GOAL_TEXT[row.family] || data.algorithms.families[row.family].goal;

    return el("div", { class: "learn__lesson" },
      el("div", { class: "learn__main" },
        el("div", { class: "panel" },
          el("div", { class: "panel__head" },
            el("h3", {}, name || row.desc.pattern.split(" / ")[0]),
            el("span", { class: "spacer" }),
            chip(row.familyLabel || row.family, "fox"),
            chip(`${row.count} động tác`, row.count <= 8 ? "mint" : "gold"),
            isLearned(row.key) ? chip("đã học", "mint") : null),
          el("div", { class: "learn__cube-wrap" },
            el("div", { class: "cube-host" }, panel.node),
            diagram),
          transport,
          el("div", { class: "stack", style: { marginTop: "14px" } },
            el("div", { class: "row row--tight" },
              el("span", { class: "tiny muted" }, "Nhận dạng"),
              chip(recognise, "gold")),
            el("div", { class: "tiny muted", style: { marginTop: "8px" } },
              "Mục tiêu: ", goal, ". Thuật toán bên dưới là từ ngắn nhất đã kiểm chứng của engine."))),
        el("div", { class: "panel" },
          el("div", { class: "panel__head" },
            el("h3", {}, "Thuật toán"),
            el("span", { class: "spacer" }),
            chip(word.label, "sky")),
          el("div", { class: "alg alg--lg" }, word.text || "đã ở đích"),
          chipsHost,
          el("div", { class: "stack", style: { marginTop: "14px" } },
            el("div", { class: "row row--tight" },
              el("span", { class: "tiny muted" }, "Thuật toán trong cụm"),
              el("span", { class: "spacer" })),
            chunkHost)),
      el("div", { class: "learn__side" },
        el("div", { class: "panel" },
          el("div", { class: "panel__head" }, el("h3", {}, "Điều hướng")),
          progressBar(learnedCount(list.map((r) => r.key)), list.length,
            `${learnedCount(list.map((r) => r.key))} / ${list.length} bài đã học`),
          el("div", { class: "row", style: { marginTop: "12px" } },
            prevBtn, nextBtn),
          el("div", { class: "row", style: { marginTop: "8px" } }, doneBtn,
            el("a", { class: "btn btn--ghost btn--sm", href: `#/trainer?level=${levelKey}` }, "Luyện lại")),
          el("p", { class: "tiny muted", style: { marginTop: "10px" } },
            `Bài ${i + 1} / ${list.length}. Nhấn ← → để chuyển bài, Space để chơi.`)))),
    );
  }

  function emptyLesson(lv) {
    return el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Cấp này không có bài cần học")),
      el("p", { class: "muted" }, lv.promise));
  }

  /* --------------------------------------------------------------- lắp trang */
  const header = el("div", { class: "section-head" },
    el("div", {},
      el("h2", {}, "Học theo lộ trình"),
      el("p", { class: "muted" },
        "Chọn cấp độ, học từng bài theo thứ tự -- xem bài, chơi thuật toán, thuộc cụm, ",
        "đánh dấu xong và chuyển bài. Tiến trình được ghi nhớ trên thiết bị của bạn.")),
    el("span", { class: "spacer" }),
    levelTabs);

  mount(view,
    header,
    el("div", { class: "stack" },
      pathHost,
      lessonHost));

  build();

  /* ---------------------------------------------------------------- keyboard */
  function onKey(e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const list = cases();
    if (e.key === "ArrowRight" && idx < list.length - 1) { idx++; build(); e.preventDefault(); }
    else if (e.key === "ArrowLeft" && idx > 0) { idx--; build(); e.preventDefault(); }
    else if (e.key === " " && list[idx]) {
      const btn = lessonHost.querySelector(".btn--primary");
      if (btn && btn.textContent.includes("Chơi")) { btn.click(); e.preventDefault(); }
    }
  }
  view.addEventListener("keydown", onKey);
  return { node: view, destroy: () => view.removeEventListener("keydown", onKey) };
}
