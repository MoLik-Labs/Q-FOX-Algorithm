/**
 * Xuất tài liệu: trung tâm xuất PDF và PNG chuẩn sách giáo khoa.
 *
 * Đây là nơi bạn chọn muốn xuất gì, tùy chỉnh độ chi tiết, rồi tải xuống.
 * Mọi thứ xuất ra đều được vẽ thẳng từ bảng dán 54 của engine -- hình và
 * thuật toán trùng với khối 3-D trên trang, không có phiên bản lạc hậu.
 *
 *   - Phạm vi: toàn bộ, theo họ bài, theo cấp độ, hoặc công thức tự tạo.
 *   - Chi tiết: bình thường (sơ đồ + thuật toán) hoặc đầy đủ (có nhận
 *     dạng, ghi nhớ, cụm động tác -- như sách giáo khoa).
 *   - PDF: sách in vector, nhiều trang, có chương -- chất lượng in.
 *   - PNG: ảnh lại toàn bộ, rõ trên mọi nền -- lưu vào điện thoại.
 */
import { data, casesOf, levelKeys, caseByKey } from "../data.js";
import { el, mount, chip, num, int, toast } from "../util.js";
import { exportCasesPng, exportCasesPdf, exportFormulaPng, exportFormulaPdf, drawCaseCard, rasterizeRowDiagram } from "../export.js";
import { exportCasesPdfFile, exportFormulaPdfFile } from "../pdffile.js";
import { getFormulas } from "../store.js";

const SCOPES = [
  { id: "all", label: "Toàn bộ 196 bài" },
  { id: "family", label: "Theo họ bài" },
  { id: "level", label: "Theo cấp độ" },
  { id: "formula", label: "Công thức tự tạo" },
];

export function render(params = {}, query = {}) {
  const view = el("div");
  const state = {
    scope: "all",
    family: "OLL",
    level: "easy",
    detail: true,
    chapters: true,
  };

  /* -------------------------------------------------------------- scope */
  const scopeSel = el("select", {
    attrs: { "aria-label": "Phạm vi xuất" },
    onChange: (e) => { state.scope = e.target.value; draw(); },
  }, ...SCOPES.map((s) => el("option", { value: s.id, selected: s.id === state.scope }, s.label)));

  // tùy chọn họ
  const familySel = el("select", {
    attrs: { "aria-label": "Họ bài" },
    onChange: (e) => { state.family = e.target.value; },
  }, ...data.families.map((f) => el("option", { value: f.key, selected: f.key === state.family },
    `${f.label} — ${f.goal}`)));

  // tùy chọn cấp độ
  const levelSel = el("select", {
    attrs: { "aria-label": "Cấp độ" },
    onChange: (e) => { state.level = e.target.value; },
  }, ...data.levelsList.map((lv) => el("option", { value: lv.key, selected: lv.key === state.level },
    lv.title)));

  function resolveRows() {
    if (state.scope === "all") return data.cases;
    if (state.scope === "family") return casesOf(state.family);
    if (state.scope === "level") return levelKeys(state.level).map((k) => caseByKey(k)).filter(Boolean);
    return []; // formula handled separately
  }

  /* -------------------------------------------------------------- chi tiết */
  const detailToggle = el("button", { class: `pill-tab ${state.detail ? "is-on" : ""}`, type: "button",
    onClick: () => { state.detail = !state.detail; detailToggle.classList.toggle("is-on", state.detail); } },
    state.detail ? "Chi tiết đầy đủ" : "Bình thường");
  const chapterToggle = el("button", { class: `pill-tab ${state.chapters ? "is-on" : ""}`, type: "button",
    onClick: () => { state.chapters = !state.chapters; chapterToggle.classList.toggle("is-on", state.chapters); } },
    state.chapters ? "Có chương" : "Không chương");

  /* -------------------------------------------------------------- công cụ xuất */
  const pdfBtn = el("button", { class: "btn btn--primary", type: "button" }, "Tải PDF");
  pdfBtn.onclick = async () => {
    const rows = resolveRows();
    if (state.scope === "formula") {
      const fs = getFormulas();
      if (!fs.length) { toast("Chưa có công thức -- tạo trước ở mục Tạo công thức", "warn"); return; }
      toast("Đang tạo file PDF…", "info");
      exportFormulaPdfFile(fs[0]);
      return;
    }
    const title = state.scope === "all" ? "Q-FOX · Sách giáo khoa thuật toán"
      : state.scope === "family" ? `Q-FOX · ${data.algorithms.families[state.family].label}`
      : `Q-FOX · ${data.levelsList.find((l) => l.key === state.level).title}`;
    toast("Đang tạo file PDF sách…", "info");
    await exportCasesPdfFile(rows, { title, detail: state.detail, chapters: state.chapters,
      subtitle: rows.length + " bài · " + new Date().toLocaleDateString("vi-VN"),
      filename: "qfox-" + state.scope });
    toast("Đã tải file PDF -- mở và in ra học", "ok");
  };

  // nút in trực tiếp (cửa sổ in) -- giữ làm phương án phụ
  const printBtn = el("button", { class: "btn", type: "button", title: "Mở cửa sổ in của trình duyệt" }, "In trực tiếp");
  printBtn.onclick = () => {
    const rows = resolveRows();
    if (state.scope === "formula") {
      const fs = getFormulas();
      if (!fs.length) { toast("Chưa có công thức", "warn"); return; }
      exportFormulaPdf(fs[0]);
      return;
    }
    const title = state.scope === "all" ? "Q-FOX · Sách giáo khoa thuật toán"
      : state.scope === "family" ? `Q-FOX · ${data.algorithms.families[state.family].label}`
      : `Q-FOX · ${data.levelsList.find((l) => l.key === state.level).title}`;
    exportCasesPdf(rows, { title, detail: state.detail, chapters: state.chapters,
      subtitle: rows.length + " bài · " + new Date().toLocaleDateString("vi-VN") });
  };

  const pngBtn = el("button", { class: "btn", type: "button" }, "Xuất PNG");
  pngBtn.onclick = async () => {
    const rows = resolveRows();
    if (state.scope === "formula") {
      const fs = getFormulas();
      if (!fs.length) { toast("Chưa có công thức -- tạo trước ở mục Tạo công thức", "warn"); return; }
      exportFormulaPng(fs[0]);
      return;
    }
    const title = state.scope === "all" ? "Q-FOX · Sách thuật toán" : "Q-FOX · Thuật toán";
    await exportCasesPng(rows, { title, detail: state.detail, cols: state.detail ? 2 : 4,
      filename: "qfox-" + state.scope });
  };

  /* -------------------------------------------------------------- preview sống */
  const previewCanvas = el("canvas", { width: "560", height: "300",
    style: { width: "100%", maxWidth: "560px", borderRadius: "var(--r-md)", border: "1px solid var(--s-3)", background: "var(--s-2)" },
    attrs: { "aria-label": "Trước khi xuất -- xem mẫu thẻ" },
  });
  async function drawPreview() {
    const rows = resolveRows();
    let sample;
    if (state.scope === "formula") {
      const fs = getFormulas();
      sample = fs[0];
    } else {
      // lấy bài đầu có giáo án nếu chi tiết, ngược lại bài đầu
      sample = state.detail
        ? (rows.find((r) => r.teach) || rows[0])
        : rows[0];
    }
    if (!sample) { return; }
    try {
      const ctx = previewCanvas.getContext("2d");
      ctx.clearRect(0, 0, 560, 300);
      ctx.fillStyle = "#0b0e14";
      ctx.fillRect(0, 0, 560, 300);
      const cardW = 280;
      const cardX = Math.max(0, (560 - cardW) / 2);
      const cardY = 20;
      drawCaseCard(ctx, sample, cardX, cardY, cardW, { theme: "dark", detail: state.detail });
      const imgSize = state.detail ? 100 : 120;
      const imgCanvas = await rasterizeRowDiagram(sample, imgSize);
      if (imgCanvas) ctx.drawImage(imgCanvas, cardX + 14, cardY + 56, imgSize, imgSize);
    } catch { /* canvas không hỗ trợ -- bỏ qua */ }
  }

  /* -------------------------------------------------------------- tổng quan */
  const summaryHost = el("div");
  function drawSummary() {
    const rows = resolveRows();
    if (state.scope === "formula") {
      const fs = getFormulas();
      mount(summaryHost,
        el("div", { class: "stats" },
          stat(String(fs.length), "công thức", "công thức bạn đã tạo và lưu"),
          stat(fs.length ? "PDF + PNG" : "—", "xuất được", fs.length ? "mỗi công thức một tệ" : "đã tạo công thức trước")));
      return;
    }
    const named = rows.filter((r) => r.names.length).length;
    const withTeach = rows.filter((r) => r.teach).length;
    mount(summaryHost,
      el("div", { class: "stats" },
        stat(String(rows.length), "bài sẽ xuất", "trong phạm vi đã chọn"),
        stat(String(named), "bài có tên", "bài engine nhận ra quen thuộc"),
        stat(String(withTeach), "bài có giáo án", "có nhận dạng + ghi nhớ + cụm"),
        stat(state.detail ? "chi tiết" : "bình thường", "mức chi tiết", state.detail ? "có nhận dạng, ghi nhớ, cụm" : "sơ đồ + thuật toán"),
        stat(state.chapters ? "có chương" : "liền mạch", "cấu trúc PDF", state.chapters ? "mỗi họ một chương" : "liệt kê liền")));
  }

  function draw() {
    drawSummary();
    drawPreview();
    // toggle visibility của family/level selects
    const showFamily = state.scope === "family";
    const showLevel = state.scope === "level";
    familyRow.style.display = showFamily ? "" : "none";
    levelRow.style.display = showLevel ? "" : "none";
    pdfBtn.disabled = state.scope === "formula" && !getFormulas().length;
    pngBtn.disabled = state.scope === "formula" && !getFormulas().length;
  }

  const familyRow = el("div", { class: "field" }, el("label", { for: "fam" }, "Họ bài"), familySel);
  const levelRow = el("div", { class: "field" }, el("label", { for: "lvl" }, "Cấp độ"), levelSel);

  scopeSel.addEventListener("change", draw);

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Xuất tài liệu"),
        el("p", { class: "panel__note" },
          "Chọn phạm vi và mức chi tiết, rồi xuất PDF sách giáo khoa hoặc ảnh PNG. Mọi thứ vẽ thẳng từ engine, hình và thuật toán trùng với trang web.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        chip("PDF · in vector", "fox"),
        chip("PNG · ảnh rõ", "sky"))),
    el("div", { class: "grid grid--2" },
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Phạm vi xuất")),
        el("div", { class: "field" }, el("label", { for: "scope" }, "Đối tượng"), scopeSel),
        familyRow,
        levelRow,
        el("p", { class: "tiny muted", style: { marginTop: "8px" } },
          "Toàn bộ sách 196 bài, hoặc chỉ một họ, hoặc cả một cấp độ học. Công thức tự tạo xuất riêng một công thức lớn.")),
      el("div", { class: "panel" },
        el("div", { class: "panel__head" }, el("h3", {}, "Chi tiết và cấu trúc")),
        el("div", { class: "row row--tight", style: { marginBottom: "8px" } },
          detailToggle, chapterToggle),
        el("p", { class: "tiny muted", style: { marginTop: "8px" } },
          "Chi tiết đầy đủ thêm nhận dạng, ghi nhớ và cụm động tác -- như sách giáo khoa. Có chương nhóm bài theo họ trong PDF.")),
    ),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Tổng quan"),
        el("span", { class: "spacer" })),
      summaryHost),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Trước khi xuất"),
        el("span", { class: "spacer" }),
        chip("mẫu thẻ thực tế", "mint")),
      el("p", { class: "tiny muted", style: { marginBottom: "10px" } },
        "Card mẫu được vẽ bằng chính công cụ xuất -- hình và thuật toán như bạn sẽ nhận được. Thay phạm vi hoặc chi tiết, mẫu thay theo."),
      el("div", { style: { display: "grid", placeItems: "center", overflow: "auto" } }, previewCanvas)),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Tải xuống"),
        el("span", { class: "spacer" })),
      el("p", { class: "small muted", style: { marginBottom: "12px" } },
        "Tải PDF tải thẳng file sách giáo khoa xuống -- mở trên máy, in ra, hoặc gửi người học. In trực tiếp mở cửa sổ in của trình duyệt nếu muốn in ngay. PNG tải ảnh xuống ngay. Mọi thứ giữ màu động tác và sơ đồ lớp trên."),
      el("div", { class: "row row--tight" },
        pdfBtn, printBtn, pngBtn)),
    el("div", { class: "panel" },
      el("div", { class: "panel__head" }, el("h3", {}, "Công thức tự tạo của bạn"),
        el("span", { class: "spacer" }),
        chip(`${getFormulas().length} công thức`, "sky")),
      el("p", { class: "small muted" },
        "Khi chọn phạm vi \"Công thức tự tạo\", mỗi lần xuất mở một công thức. Tạo và lưu công thức trước ở mục Tạo công thức.")));

  draw();
  return { node: view };
}

function stat(v, k, s) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v),
    s ? el("div", { class: "stat__s" }, s) : null);
}

