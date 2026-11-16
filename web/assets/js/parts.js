/**
 * Các thành phần UI chia sẻ: panel khối với bộ điều khiển, thẻ bài, và
 * cửa sổ chi tiết của một bài. Mọi màn hình có khối hoặc thuật toán đều
 * đi qua đây, nên hành vi giống nhau ở mọi nơi bạn gặp.
 */
import { data, METRIC_HINT } from "./data.js";
import { CubeView } from "./cube-view.js";
import { topLayer, netDiagram } from "./diagram.js";
import { el, mount, moveChips, chunkAlg, chunkChips, chip, toast, copyText, sheet, progressBar, num, seconds } from "./util.js";
import { settings, setSetting, isLearned, toggleLearned, card as srsCard, records } from "./store.js";

/* ------------------------------------------------------------------ UI khối */

/**
 * Một khối với các điều khiển người học thực sự dùng.
 *
 * @param {object} opts { state, size, view, highlight, transport, title, scramble }
 * @returns {{ node: HTMLElement, cube: CubeView }}
 */
export function cubePanel(opts = {}) {
  const st = settings();
  const size = opts.size || 250;
  const host = el("div", { class: "cube-host" });
  const cube = new CubeView(host, {
    model: data.model,
    state: opts.state || data.model.solved,
    size,
    view: opts.view || st.view,
    highlight: opts.highlight === undefined ? "ll" : opts.highlight,
    interactive: opts.interactive !== false,
    speed: opts.speed === undefined ? st.speed : opts.speed,
    yaw: st.yaw,
    pitch: st.pitch,
  });
  cube.onViewChange = (yaw, pitch) => {
    setSetting("yaw", Math.round(yaw));
    setSetting("pitch", Math.round(pitch));
  };

  const wrap = el("div", { class: "stack", style: { alignItems: "center" } }, host);
  const tools = el("div", { class: "cube-tools" });
  wrap.append(tools);

  /** Thêm một nút công cụ; trả nó lại để người gọi đổi nhãn hoặc vô hiệu hóa. */
  function add(label, fn, title = label, cls = "btn btn--sm") {
    const b = el("button", { class: cls, type: "button", title, onClick: fn }, label);
    tools.append(b);
    return b;
  }

  if (opts.viewToggle !== false) {
    const btn = add(cube.view === "net" ? "Xem 3D" : "Lưới phẳng", () => {
      const next = cube.view === "net" ? "3d" : "net";
      cube.setView(next);
      setSetting("view", next);
      btn.textContent = next === "net" ? "Xem 3D" : "Lưới phẳng";
    }, "Đổi giữa khối 3-D và lưới phẳng");
  }
  if (opts.reset !== false) {
    add("Đặt lại", () => { cube.reset(); if (opts.onReset) opts.onReset(); },
        "Quay lại khối hoàn chỉnh");
  }
  if (opts.restore) add("Bài", opts.restore, "Quay lại vị trí của bài");
  if (opts.scramble) add("Trộn", opts.scramble, "Áp dụng một cú trộn ngẫu nhiên");

  return { node: wrap, cube, tools, add };
}

/* --------------------------------------------------------------- thẻ bài */

/**
 * Một thẻ thuật toán: sơ đồ lớp trên bạn nhận dạng, tên nếu engine khớp
 * với một thuật toán quen thuộc, và chính thuật toán đó.
 */
export function caseCard(row, opts = {}) {
  const learned = isLearned(row.key);
  const name = (row.names && row.names[0]) || null;
  const card = el("div", {
    class: `card ${learned ? "is-learned" : ""}`,
    role: "button", tabindex: "0", dataset: { key: row.key },
    attrs: { "aria-label": `bài ${row.familyLabel || row.family} ${name || row.desc.pattern}` },
    onClick: () => opts.onOpen ? opts.onOpen(row) : openCase(row),
    onKeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
    },
  },
    el("div", { class: "card__top" },
      topLayer(row.state, { size: opts.diagram || 96 }),
      el("div", { class: "card__body" },
        el("div", { class: "card__name" }, name || row.desc.pattern.split(" / ")[0]),
        el("div", { class: "card__sub" }, name ? row.desc.pattern : row.desc.permutation),
        el("div", { class: "card__alg", title: row.alt
              ? `${row.primary.label} ở ${row.primary.count} động tác. Từ đã kiểm chứng còn lại là ${row.alt.label.toLowerCase()} ở ${row.alt.count} -- bấm W trong cửa sổ bài để chạy nó.`
              : "Từ ngắn nhất đã kiểm chứng của engine cho bài này." },
          row.text || "đã ở đích -- không cần thuật toán"),
        el("div", { class: "card__foot" },
          chip(row.familyLabel || row.family, "fox"),
          chip(`${row.count} động tác`, row.count <= 8 ? "mint" : row.count <= 11 ? "" : "gold"),
          row.source === "textbook" ? chip("quen thuộc", "gold") : null,
          row.auf ? chip(`AUF ${row.auf_text}`, "sky") : null,
          opts.extraChip ? opts.extraChip(row) : null)),
    ));
  return card;
}

/* --------------------------------------------------------------- cửa sổ bài */

/**
 * Cửa sổ chi tiết của một bài: khối, bộ điều khiển, chỉ số, và việc cần làm.
 */
export function openCase(row, ctx = {}) {
  const M = data.model;

  // Một bài có thể có hai từ: thuật toán quen thuộc mọi người học, và từ
  // ngắn nhất của chính engine. Cả hai đều được generator đối chiếu với
  // mục tiêu, nên lựa chọn là về việc bạn muốn thuộc cái nào, không phải
  // từ nào đúng.
  const words = (row.words && row.words.length ? row.words : [{
    key: "engine", text: row.algorithm || "", moves: row.moves || [],
    count: row.stm || 0, label: "Từ ngắn nhất đã kiểm chứng",
  }]).map((x, i) => ({ ...x, key: x.kind || `w${i}` }));
  let w = 0;
  let word = words[0];
  let moves = word.moves;
  // mọi vị trí từ bài đến đích, để kéo thanh trượt là tức thì
  let states = [row.state];
  for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));

  let k = 0;
  const panel = cubePanel({
    state: row.state, size: 288, highlight: "ll",
    viewToggle: true, reset: false,
  });
  const cube = panel.cube;

  const chipsHost = el("div", { class: "row" });
  let chips = el("div");

  function drawChips() {
    chips = moveChips(word.text, (i) => { goto(i + 1); },
                      { title: "Đi tới sau động tác" });
    mount(chipsHost, chips);
    paintChips();
  }

  /**
   * Học theo cụm: chia thuật toán thành các cụm (2 hoặc 3 động tác) để
   * thuộc từng nhóm. Chọn cụm sẽ nhảy khối tới đầu cụm đó; cụm đã qua
   * chuyển màu. Một công cụ học thật sự, không chỉ trình bày.
   */
  let chunkPer = 2;
  let chunkHost = el("div");
  function drawChunks() {
    const text = word.text || "";
    if (!text) { chunkHost.style.display = "none"; return; }
    chunkHost.style.display = "";
    const chunks = chunkAlg(text, chunkPer);
    const cur = Math.floor(k / chunkPer);
    const chipsEl = chunkChips(chunks, (i) => goto(i * chunkPer),
      { title: "Nhấn để nhảy tới đầu cụm" });
    [...chipsEl.children].forEach((node, i) => {
      node.classList.toggle("is-done", i < cur);
      node.classList.toggle("is-active", i === cur);
    });
    mount(chunkHost,
      el("div", { class: "row row--tight", style: { marginBottom: "8px" } },
        el("span", { class: "tiny muted" }, `Chia thành ${chunks.length} cụm, mỗi cụm ${chunkPer} động tác — học từng nhóm`),
        el("span", { class: "spacer" }),
        el("span", { class: "tiny muted" }, "cụm"),
        el("div", { class: "pill-tabs", style: { gap: "4px" } },
          el("button", { class: `pill-tab ${chunkPer === 2 ? "is-on" : ""}`, type: "button",
            onClick: () => { chunkPer = 2; drawChunks(); } }, "2"),
          el("button", { class: `pill-tab ${chunkPer === 3 ? "is-on" : ""}`, type: "button",
            onClick: () => { chunkPer = 3; drawChunks(); } }, "3"))),
      chipsEl);
  }

  function chunkSection() { return chunkHost; }

  /**
   * Block dạy: nhận dạng bài (nếu có tên quen thuộc) và các cụm động tác
   * kèm ghi chú. Đây là lớp học thật -- không chỉ trình bày thuật toán, mà
   * dạy bạn nhận ra nó và hiểu từng cụm làm gì.
   */
  function teachBlock() {
    const teach = row.teach;
    // Mọi bài đều có nhận dạng -- bài có tên quen thuộc dùng cue được viết
    // tay, bài còn lại suy nhận dạng từ chính mô tả của engine (pattern +
    // hoán vị). Như vậy mỗi thẻ bài dạy bạn nhận ra nó, không chỉ hiển thị
    // thuật toán.
    const recognise = (teach && teach.recognise) ||
      `${row.desc.pattern} · ${row.desc.permutation}`;
    if (!teach) {
      // bài không có tên quen thuộc: vẫn dạy nhận dạng + mục tiêu, không
      // có cụm ghi chú
      return el("div", { class: "stack", style: { marginTop: "14px", padding: "14px", borderRadius: "var(--r-md)", background: "var(--s-2)", border: "1px solid var(--s-3)" } },
        el("div", { class: "row row--tight" },
          el("span", { class: "tiny muted" }, "Nhận dạng"),
          chip(recognise, "gold")),
        el("div", { class: "tiny muted", style: { marginTop: "8px" } },
          "Mục tiêu: ", data.algorithms.families[row.family].goal,
          ". Thuật toán bên trên là từ ngắn nhất đã kiểm chứng của engine."));
    }
    const chunks = teach.chunks || [];
    const chipsEl = chunkChips(chunks.map((c) => c.text), null,
      { title: "Cụm động tác trong thuật toán quen thuộc" });
    [...chipsEl.children].forEach((node, i) => {
      const note = chunks[i] && chunks[i].note;
      if (note) node.title = `Cụm ${i + 1}: ${note}`;
    });
    return el("div", { class: "stack", style: { marginTop: "14px", padding: "14px", borderRadius: "var(--r-md)", background: "var(--s-2)", border: "1px solid var(--s-3)" } },
      el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted" }, "Nhận dạng"),
        chip(recognise, "gold"),
        chip(`${teach.algorithm.split(/\s+/).filter(Boolean).length} động tác`, "mint")),
      el("div", { class: "tiny muted", style: { marginBottom: "8px" } },
        "Thuật toán quen thuộc, chia thành cụm. Ghi chú mỗi cụm là gì:"),
      chipsEl,
      el("div", { class: "chunk-notes", style: { marginTop: "10px" } },
        chunks.map((c, i) =>
          el("div", { class: "chunk-note" },
            el("b", { class: "mono" }, `${i + 1}.`),
            el("span", { class: "mono" }, c.text),
            el("span", { class: "tiny muted" }, ` — ${c.note}`)))));
  }

  const playBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "▶ Chơi");
  const backBtn = el("button", { class: "btn btn--sm", type: "button", title: "Lùi một động tác (←)" }, "⟲ Lùi");
  const stepBtn = el("button", { class: "btn btn--sm", type: "button", title: "Tiến một động tác (→)" }, "Bước ⟳");
  const caseBtn = el("button", { class: "btn btn--sm", type: "button", title: "Quay lại vị trí của bài" }, "Bài");
  const solvedBtn = el("button", { class: "btn btn--sm", type: "button", title: "Hiện vị trí đích" }, "Đích");
  const setupBtn = el("button", { class: "btn btn--sm", type: "button", title: "Đặt bài này từ khối hoàn chỉnh (áp dụng nghịch)" }, "Đặt từ khối hoàn chỉnh");
  const speed = el("input", { type: "range", min: "40", max: "600", step: "20", value: String(cube.speed),
                              attrs: { "aria-label": "Tốc độ xoay" },
                              onInput: (e) => { cube.speed = Number(e.target.value); setSetting("speed", cube.speed); speedOut.textContent = `${cube.speed} ms`; } });
  const speedOut = el("span", {}, `${cube.speed} ms`);

  const transport = el("div", { class: "cube-tools" },
    playBtn, backBtn, stepBtn, caseBtn, solvedBtn,
    el("span", { class: "speed" }, "chậm", speed, "nhanh", speedOut));

  function paintChips() {
    [...chips.children].forEach((node, i) => {
      node.classList.toggle("is-done", i < k);
      node.classList.toggle("is-now", i === k - 1);
    });
  }

  function goto(i, animate = false) {
    i = Math.max(0, Math.min(moves.length, i));
    if (animate && i === k + 1) {
      cube.turn(M.byId.get(moves[k]).name).then(() => { k = i; afterMove(); });
      return;
    }
    k = i;
    cube.setState(states[k]);
    afterMove();
  }

  function afterMove() {
    paintChips();
    drawChunks();
    posOut.textContent = `${k} / ${moves.length}`;
    solvedChip.style.display = M.isSolved(cube.getState()) ? "" : "none";
    if (ctx.onStep) ctx.onStep(k, moves.length);
  }

  const posOut = el("span", { class: "badge" }, `0 / ${moves.length}`);
  const solvedChip = chip("hoàn thành", "mint");
  solvedChip.style.display = "none";

  async function play() {
    if (cube.isPlaying) { cube.stop(); playBtn.textContent = "▶ Chơi"; return; }
    if (k >= moves.length) goto(0);
    playBtn.textContent = "❚❚ Tạm dừng";
    for (let i = k; i < moves.length; i++) {
      if (!cube.isPlaying && playBtn.textContent !== "❚❚ Tạm dừng") break;
      k = i;
      await cube.turn(M.byId.get(moves[i]).name);
      k = i + 1;
      afterMove();
      if (playBtn.textContent !== "❚❚ Tạm dừng") break;
    }
    playBtn.textContent = "▶ Chơi";
    afterMove();
  }

  playBtn.onclick = play;
  backBtn.onclick = () => goto(k - 1);
  stepBtn.onclick = () => goto(k + 1, true);
  caseBtn.onclick = () => goto(0);
  solvedBtn.onclick = () => goto(moves.length);
  setupBtn.onclick = () => {
    const inv = M.invert(moves);
    cube.setState(M.solved);
    k = 0;
    afterMove();
    toast("Khối hoàn chỉnh → áp dụng nghịch, rồi tự chạy thuật toán", "info");
    setTimeout(async () => {
      for (const name of inv) await cube.turn(name, Math.min(cube.speed, 130));
      k = 0;
      afterMove();
    }, 260);
  };

  /**
   * Nút "Luyện từng cụm": mở một luồng học tập trung -- đi từng cụm của
   * thuật toán, đặt khối ở đầu cụm, chạy nó, và yêu cầu bạn nhận diện
   * kết quả trước khi tiến cụm tiếp. Đây là cách học sâu nhất: bạn không
   * chỉ xem thuật toán chạy, mà tự nhận ra từng bước nó tạo ra cái gì.
   */
  function chunkPracticeBtn(row, getGoto, cube) {
    const btn = el("button", { class: "btn", type: "button", title: "Học từng cụm: đặt khối, chạy cụm, nhận diện, rồi tiếp" },
      "Luyện từng cụm");
    btn.addEventListener("click", (e) => { e.preventDefault(); openChunkPractice(row); });
    return btn;
  }

  /**
   * Cửa sổ luyện từng cụm: một luồng có hướng dẫn đi qua từng cụm của
   * thuật toán. Mỗi cụm: đặt khối về đầu cụm, chạy nó trên khối, rồi yêu
   * bạn tự nhận diện kết quả trước khi bấm "Tới cụm tiếp". Học sâu --
   * bạn xây dựng nhận thức từng bước, không chỉ xem thuật toán chạy.
   */
  function openChunkPractice(row) {
    const alg = word.text || "";
    if (!alg) { toast("Bài này không có thuật toán để luyện", "err"); return; }
    const groups = chunkAlg(alg, 2);
    let ci = 0;
    let states = [row.state];
    for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));
    const stepOf = (g) => g * 2;

    const cubeHost = el("div", { class: "cube-host" });
    const miniCube = new CubeView(cubeHost, {
      model: data.model, state: row.state, size: 200,
      view: "3d", highlight: "ll", interactive: true, speed: settings().speed,
    });
    const status = el("p", { class: "tiny muted", style: { textAlign: "center" } }, "");
    const body = el("div", { class: "stack" },
      el("p", { class: "small" },
        "Đi từng cụm của thuật toán. Mỗi cụm: tôi chạy nó trên khối, bạn nhận diện điều nó tạo ra, rồi bấm tiếp. Thuộc từng cụm trước khi đi tiếp."),
      miniCube ? el("div", { class: "stack", style: { alignItems: "center" } }, cubeHost, status) : null);

    const stepBtn = el("button", { class: "btn btn--primary", type: "button" }, "Chạy cụm 1");
    const nextBtn = el("button", { class: "btn", type: "button" }, "Tới cụm tiếp");
    const doneBtn = el("button", { class: "btn btn--on", type: "button" }, "Đã thuộc — đóng");

    function render() {
      if (ci >= groups.length) {
        mount(status, el("div", { class: "hint hint--mint" },
          "Hoàn tất! Toàn bộ thuật toán đã đi qua từng cụm. Thuộc từng cụm, bạn đã nắm nó."));
        mount(body,
          el("p", { class: "small" }, "Đi từng cụm của thuật toán. Mỗi cụm: tôi chạy nó trên khối, bạn nhận diện điều nó tạo ra, rồi bấm tiếp."),
          el("div", { class: "stack", style: { alignItems: "center" } }, cubeHost, status),
          el("div", { class: "row", style: { justifyContent: "center" } }, doneBtn));
        return;
      }
      const at = stepOf(ci);
      miniCube.stop();
      miniCube.setState(states[at]);
      status.textContent = `Cụm ${ci + 1}/${groups.length}: ${groups[ci]} -- nhận diện điều cụm này tạo ra trên khối`;
      stepBtn.textContent = `Chạy cụm ${ci + 1}`;
      nextBtn.style.display = "";
      mount(body,
        el("p", { class: "small" },
          "Đi từng cụm của thuật toán. Mỗi cụm: tôi chạy nó trên khối, bạn nhận diện điều nó tạo ra, rồi bấm tiếp."),
        el("div", { class: "stack", style: { alignItems: "center" } }, cubeHost, status),
        el("div", { class: "row row--tight", style: { justifyContent: "center" } },
          stepBtn, nextBtn));
    }

    let running = false;
    async function runChunk() {
      if (running) return;
      running = true;
      miniCube.setState(states[stepOf(ci)]);
      for (let i = stepOf(ci); i < stepOf(ci) + 2 && i < moves.length; i++) {
        if (!running) break;
        await miniCube.turn(M.byId.get(moves[i]).name, Math.min(miniCube.speed, 160));
      }
      running = false;
      status.textContent = `Cụm ${ci + 1} đã chạy -- nhận diện kết quả, rồi bấm "Tới cụm tiếp"`;
    }
    stepBtn.addEventListener("click", runChunk);
    nextBtn.addEventListener("click", () => { ci++; render(); });
    doneBtn.addEventListener("click", () => { s.close(); });

    const cp = sheet(`Luyện từng cụm — ${(row.teach && row.teach.name) || row.names[0] || row.key}`, body, { wide: true });
    render();
    return cp;
  }

  const learnedBtn = el("button", {
    class: `btn ${isLearned(row.key) ? "btn--on" : ""}`, type: "button",
  }, isLearned(row.key) ? "✓ Đã thuộc" : "Đánh dấu đã thuộc");
  learnedBtn.onclick = () => {
    const on = toggleLearned(row.key);
    learnedBtn.classList.toggle("btn--on", on);
    learnedBtn.textContent = on ? "✓ Đã thuộc" : "Đánh dấu đã thuộc";
    document.dispatchEvent(new CustomEvent("qfox:progress", { detail: { key: row.key, on } }));
  };

  const copyBtn = el("button", { class: "btn", type: "button" }, "Sao chép");
  copyBtn.onclick = async () => {
    const ok = await copyText(word.text || "");
    toast(ok ? `Đã sao chép: ${word.text}` : "Sao chép thất bại — chọn văn bản đó", ok ? "ok" : "err");
  };

  const rec = records([row.key]).bestOf(row.key);
  const recChip = rec
    ? chip(`Kỷ lục ${seconds(rec.ms / 1000, 2)}`, "sky", "Thời gian nhập nhanh nhất của bạn cho bài này")
    : null;

  const algOut = el("div", { class: `alg alg--lg ${word.text ? "" : "alg--empty"}` },
    word.text || "Không có thuật toán: bài này đã ở đích.");

  const wordTabs = words.length > 1
    ? el("div", { class: "pill-tabs" }, ...words.map((wd, i) => el("button", {
        class: `pill-tab ${i === w ? "is-on" : ""}`, type: "button",
        title: `${wd.text} — ${wd.count} động tác`,
        onClick: () => {
          w = i; word = words[i]; moves = word.moves;
          states = [row.state];
          for (const id of moves) states.push(M.applyIds(states[states.length - 1], [id]));
          k = 0;
          cube.stop();
          playBtn.textContent = "▶ Chơi";
          cube.setState(states[0]);
          drawChips();
          mount(algOut, document.createTextNode(word.text));
          [...wordTabs.children].forEach((b, j) => b.classList.toggle("is-on", j === i));
          countOut.textContent = String(word.count);
          afterMove();
        },
      }, wd.label)))
    : null;

  const sets = data.levelsList.flatMap((lv) => (lv.curriculum || [])
    .filter((it) => it.cases.some((c) => c.key === row.key))
    .map((it) => chip(`${lv.title.split(" - ")[0]} · ${it.title.replace(/^Bước \d+ - /, "")}`, "sky")));

  const srs = srsCard(row.key);

  const countOut = el("div", { class: "metric__v" }, String(word.count));

  const body = el("div", { class: "detail" },
    el("div", { class: "detail__cube" },
      panel.node,
      transport,
      el("div", { class: "row row--tight", style: { justifyContent: "center" } }, posOut, solvedChip),
      el("p", { class: "tiny muted", style: { textAlign: "center" } },
        "Kéo khối để xoay góc nhìn. Lưới phẳng và khối 3-D là cùng một trạng thái.")),
    el("div", { class: "detail__steps" },
      el("div", { class: "row row--tight" },
        chip(row.familyLabel || row.family, "fox"),
        ...(row.names || []).map((n) => chip(n, "gold")),
        chip(`phần tử ${row.element}`, "muted"),
        chip(`quỹ đạo ${row.orbit}`, "muted"),
        recChip),
      wordTabs,
      algOut,
      teachBlock(),
      row.auf_text ? el("div", { class: "hint hint--fox" },
        `Xoay mặt trên trước: ${row.auf_text} — rồi thuật toán bên dưới hoàn tất bài.`) : null,
      chipsHost,
      chunkSection(),
      el("div", { class: "metrics" },
        el("div", { class: "metric", title: METRIC_HINT },
          el("div", { class: "metric__k" }, "động tác"), countOut),
        metric("htm", row.htm), metric("qtm", row.qtm),
        metric("stm", row.stm), metric("etm", row.etm),
        metric("tìm bởi", row.via === "scan" ? "quét sách" : row.via),
        metric("tối ưu ≤", row.optimal_within)),
      row.alt ? el("div", { class: "hint" },
        row.source === "textbook"
          ? [`Đây là ${word.name} quen thuộc ở ${word.count} động tác. Từ ngắn nhất của engine cho bài này là `,
             el("code", {}, row.alt.text), ` ở ${row.alt.count} động tác.`]
          : [`Đây là từ ngắn nhất của engine ở ${word.count} động tác. ${row.alt.name} quen thuộc là `,
             el("code", {}, row.alt.text), ` ở ${row.alt.count} động tác.`],
        " Cả hai đều được engine chạy lại đối chiếu với mục tiêu — bấm ",
        el("kbd", {}, "W"), " để đổi và xem từ kia chạy.") : null,
      el("dl", { class: "kv" },
        el("dt", {}, "Mục tiêu"), el("dd", {}, data.algorithms.families[row.family].goal),
        el("dt", {}, "Cạnh"), el("dd", {}, row.desc.edges),
        el("dt", {}, "Góc"), el("dd", {}, row.desc.corners),
        el("dt", {}, "Hoán vị"), el("dd", {}, row.desc.permutation),
        el("dt", {}, "Đã kiểm chứng"),
        el("dd", {}, row.verified
          ? "được engine chạy lại đối chiếu với mục tiêu"
          : "CHƯA kiểm chứng — đừng tin thẻ này"),
        el("dt", {}, "Hộp luyện"),
        el("dd", { class: "row row--tight" }, boxDots(srs.box),
            el("span", { class: "tiny muted" }, srs.seen
              ? `${srs.seen} lần luyện, ${Math.round((100 * (srs.right || 0)) / Math.max(1, srs.seen))}% đúng`
              : "chưa luyện"))),
      sets.length ? el("div", { class: "row row--tight" },
        el("span", { class: "tiny muted" }, "Xuất hiện trong:"), ...sets) : null,
      el("div", { class: "row" }, learnedBtn, copyBtn, setupBtn,
        chunkPracticeBtn(row, () => goto, cube),
        el("a", { class: "btn", href: `#/trainer?family=${encodeURIComponent(row.family)}&key=${encodeURIComponent(row.key)}` }, "Luyện bài này"))));

  const famName = row.familyLabel || row.family;
  const title = (row.teach && row.teach.name)
    ? `${row.teach.name} — ${famName}`
    : (row.names && row.names[0])
      ? `${row.names[0]} — ${famName}`
      : `Bài ${row.familyLabel || row.family} ${row.i + 1}`;
  const s = sheet(title, body, {
    wide: true,
    subtitle: `${row.desc.pattern} · ${word.count} động tác · ${row.desc.permutation}`,
  });

  drawChips();
  drawChunks();
  afterMove();

  const onKey = (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepBtn.click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); backBtn.click(); }
    else if (e.key === " ") { e.preventDefault(); playBtn.click(); }
    else if (e.key.toLowerCase() === "c") caseBtn.click();
    else if (e.key.toLowerCase() === "l") learnedBtn.click();
    else if (e.key.toLowerCase() === "w" && wordTabs) {
      wordTabs.children[(w + 1) % words.length].click();
    }
  };
  document.addEventListener("keydown", onKey);
  s.root.addEventListener("remove", () => document.removeEventListener("keydown", onKey));
  const obs = new MutationObserver(() => {
    if (!document.body.contains(s.root)) {
      document.removeEventListener("keydown", onKey);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  return s;
}

function metric(k, v) {
  return el("div", { class: "metric" },
    el("div", { class: "metric__k" }, k),
    el("div", { class: "metric__v" }, String(v)));
}

export function boxDots(box) {
  const wrap = el("span", { class: "box-dots", title: `Hộp luyện ${box} trên 5` });
  for (let i = 0; i <= 5; i++) {
    wrap.append(el("span", { class: `box-dot ${i <= box ? "is-on" : ""}` }));
  }
  return wrap;
}

/* --------------------------------------------------------------- lưới bài */

export function caseGrid(rows, opts = {}) {
  const grid = el("div", { class: "grid grid--cases" });
  for (const row of rows) grid.append(caseCard(row, opts));
  return grid;
}

export function learnedSummary(rows) {
  const done = rows.filter((r) => isLearned(r.key)).length;
  return el("div", { class: "row" },
    progressBar(done, rows.length, `${done}/${rows.length} đã thuộc`));
}

export { netDiagram, num };
