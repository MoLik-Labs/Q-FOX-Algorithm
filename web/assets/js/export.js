/**
 * Xuất công thức và bài học thành PDF và PNG -- chuẩn sách giáo khoa.
 *
 * Đây là phần xuất tài liệu thực sự dùng được: bạn có thể in ra, lưu vào
 * điện thoại, hoặc gởi cho người học. Hai định dạng:
 *
 *   - PNG: vẽ từng thẻ bài ra canvas và tải xuống ảnh -- mỗi thẻ có sơ đồ
 *     lớp trên, tên bài, thuật toán (màu theo động tác), nhận dạng, và
 *     chỉ số. Rõ ràng trên mọi nền, không cần in.
 *   - PDF: mở một tài liệu in chuẩn sách -- nhiều thẻ trên mỗi trang, có
 *     tiêu đề,页脚, lề -- rồi dùng chức năng "In thành PDF" của trình
 *     duyệt. Chất lượng vector, văn bản chọn được, giống sách thật.
 *
 * Mọi thứ vẽ thẳng từ bảng dán 54 của engine, nên hình và thuật toán
 * trên ảnh trùng với khối 3-D trên trang -- không có phiên bản lạc hậu.
 */
import { data, METRIC_HINT } from "./data.js";
import { topLayer } from "./diagram.js";
import { FACE_COLOUR } from "./model.js";
import { num, toast } from "./util.js";

/* ------------------------------------------------------------------ màu */

/** Màu mỗi họ động tác, dùng cả trên PNG và PDF -- giống màu chip trên web. */
const MOVE_TONE = {
  U: "#5b8def", Up: "#5b8def",
  R: "#d94f0d",
  F: "#1f9d63",
  D: "#f0a020",
  L: "#c026d3",
  B: "#2563c9",
  M: "#e0487a",
  E: "#0d9488",
  S: "#b07a10",
};

/** Chuyển một ký hiệu động tác thành màu --宽 mặt hoặc slice. */
export function moveColour(token) {
  const base = token.replace(/['2]/g, "");
  return MOVE_TONE[base] || "#8d99b0";
}

/* -------------------------------------------------------------- PNG canvas */

/** Rasterize một SVG element vào canvas ở kích thước cho sẵn. */
function rasterizeSvg(svg, w, h) {
  return new Promise((resolve, reject) => {
    const ser = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ser);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/** Rasterize sơ đồ lớp trên của một bài thành canvas -- dùng cho preview. */
export async function rasterizeRowDiagram(row, size = 100) {
  if (!canCanvas()) return null;
  const svg = topLayer(row.state, { size, skirt: true });
  return rasterizeSvg(svg, size, size);
}

/** Vẽ một khung tròn cạnh cho canvas. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chọn màu nền theo theme hiện tại -- PNG giữ nền tương thích in. */
function isLight() {
  return document.documentElement.getAttribute("data-theme") === "light";
}

/** Kiểm tra canvas có được hỗ trợ (tránh crash trong môi trường test/stub). */
function canCanvas() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext && c.getContext("2d"));
  } catch {
    return false;
  }
}

const PNG_PALETTE = {
  dark: { bg: "#0b0e14", surface: "#141a24", line: "#262f3d", ink: "#e7ecf5", muted: "#8d99b0", plate: "#1c2433" },
  light: { bg: "#f6f4f0", surface: "#ffffff", line: "#e2e0d8", ink: "#1b2230", muted: "#5c6678", plate: "#ecebe5" },
};

/**
 * Vẽ một thẻ bài vào canvas tại vị trí (x, y).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} row  bản ghi bài từ data.cases
 * @param {number} x, y, w  vị trí và chiều rộng
 * @param {object} opts { theme }
 */
export function drawCaseCard(ctx, row, x, y, w, opts = {}) {
  const pal = PNG_PALETTE[opts.theme || (isLight() ? "light" : "dark")];
  const detail = !!opts.detail;
  const teach = row.teach || {};
  const pad = 14;

  // chiều cao thẻ: detail có thêm ghi nhớ + cụm
  let h = 210;
  if (detail) {
    h = 250 + (teach.chunks && teach.chunks.length ? teach.chunks.length * 14 : 0);
  }

  // nền thẻ
  ctx.fillStyle = pal.surface;
  roundRect(ctx, x, y, w, h, 10); ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line; ctx.stroke();

  // đầu trang: họ bài + tên
  ctx.fillStyle = pal.muted;
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText((row.familyLabel || row.family).toUpperCase(), x + pad, y + 12);

  const name = (row.teach && row.teach.name) || (row.names && row.names[0]) || row.desc.pattern.split(" / ")[0];
  ctx.fillStyle = pal.ink;
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(truncate(ctx, name, w - pad * 2), x + pad, y + 27);

  // sơ đồ lớp trên -- vị trí dành cho diagram đã rasterize ở trên
  const imgSize = detail ? 100 : 120;
  const imgX = x + pad;
  const imgY = y + 56;
  ctx.fillStyle = pal.plate;
  roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.fill();
  ctx.strokeStyle = pal.line;
  roundRect(ctx, imgX, imgY, imgSize, imgSize, 8); ctx.stroke();

  // bên phải: nhận dạng + thuật toán
  const tx = x + pad + imgSize + 12;
  const tw = w - pad * 2 - imgSize - 12;

  ctx.fillStyle = pal.muted;
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("NHẬN DẠNG", tx, y + 56);
  ctx.fillStyle = pal.ink;
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  const rec = (row.teach && row.teach.recognise) || row.desc.pattern;
  ctx.fillText(truncate(ctx, rec, tw), tx, y + 71);

  // ghi nhớ (detail)
  let cy = y + 96;
  if (detail && teach.mnemonic) {
    ctx.fillStyle = pal.muted;
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("GHI NHỚ", tx, cy);
    cy += 14;
    ctx.fillStyle = "#8a4b08";
    ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
    wrapText(ctx, teach.mnemonic, tx, cy, tw, 13);
    cy += 26;
  }

  // thuật toán -- vẽ từng động tác màu
  ctx.fillStyle = pal.muted;
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("THUẬT TOÁN", tx, cy);
  cy += 15;
  const alg = row.teach ? row.teach.algorithm : (row.algorithm || "—");
  drawAlgLine(ctx, alg, tx, cy, tw, pal);

  // cụm (detail)
  if (detail && teach.chunks && teach.chunks.length) {
    const chY = y + imgY + imgSize + 8;
    ctx.fillStyle = pal.muted;
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("CỤM", x + pad, chY);
    teach.chunks.forEach((c, i) => {
      const lineY = chY + 14 + i * 14;
      ctx.fillStyle = pal.ink;
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText((i + 1) + ". " + c.text, x + pad, lineY);
      if (c.note) {
        ctx.fillStyle = pal.muted;
        ctx.font = "500 9px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(c.note, x + pad + 90, lineY);
      }
    });
  }

  // chỉ số ở dưới
  const sy = y + h - 24;
  ctx.fillStyle = pal.muted;
  ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(row.stm || row.count + " động tác · htm " + (row.htm || 0) + " · qtm " + (row.qtm || 0), x + pad, sy);

  // footer: engine đã kiểm chứng
  ctx.textAlign = "right";
  ctx.fillStyle = row.verified ? "#1f9d63" : "#d63848";
  ctx.fillText(row.verified ? "✓ engine kiểm chứng" : "chưa kiểm chứng", x + w - pad, sy);
  ctx.textAlign = "left";
  return h;
}

/** Vẽ một dòng thuật toán, mỗi động tác màu riêng. */
function drawAlgLine(ctx, alg, x, y, w, pal) {
  const tokens = String(alg || "—").split(/\s+/).filter(Boolean);
  let cx = x;
  const lineH = 16;
  let line = 0;
  ctx.font = "700 13px ui-monospace, 'Geist Mono', monospace";
  ctx.textBaseline = "top";
  for (const t of tokens) {
    const tw = ctx.measureText(t + "  ").width;
    if (cx + tw > x + w && cx > x) { cx = x; line++; y += lineH; }
    ctx.fillStyle = moveColour(t);
    ctx.fillText(t, cx, y);
    cx += tw;
  }
  if (!tokens.length) { ctx.fillStyle = pal.muted; ctx.fillText("—", x, y); }
}

function truncate(ctx, text, maxW) {
  let t = String(text);
  while (ctx.measureText(t).width > maxW && t.length > 1) {
    t = t.slice(0, -1);
  }
  return t + (t.length < String(text).length ? "…" : "");
}

/**
 * Xuất một tập bài thành ảnh PNG -- nhiều thẻ trên một canvas, tải xuống.
 *
 * @param {object[]} rows  các bản ghi bài
 * @param {object} opts { title, cols }
 */
export async function exportCasesPng(rows, opts = {}) {
  if (!rows || !rows.length) return;
  if (typeof document.createElement !== "function" || !canCanvas()) {
    toast("Trình duyệt này không hỗ trợ vẽ canvas -- dùng Xuất PDF", "warn");
    return exportCasesPdf(rows, opts);
  }
  const detail = !!opts.detail;
  const cols = opts.cols || (detail ? 2 : 3);
  const pad = 24;
  const cardW = 280;
  const gapX = 20, gapY = 20;
  const titleH = 56;

  // tính chiều cao mỗi thẻ (detail có thể khác nhau theo số cụm)
  const cardH = rows.map((row) => {
    const teach = row.teach || {};
    let h = 210;
    if (detail) h = 250 + (teach.chunks && teach.chunks.length ? teach.chunks.length * 14 : 0);
    return h;
  });

  // bố cục lưới động: phân phối vào cột để chiều cao tổng cân bằng
  const colOf = new Array(rows.length);
  const colBottom = new Array(cols).fill(0);
  for (let i = 0; i < rows.length; i++) {
    let c = 0, min = Infinity;
    for (let j = 0; j < cols; j++) { if (colBottom[j] < min) { min = colBottom[j]; c = j; } }
    colOf[i] = c;
    colBottom[c] += cardH[i] + gapY;
  }
  const maxRow = Math.max(...colBottom) - gapY;

  const c = document.createElement("canvas");
  c.width = cols * cardW + (cols - 1) * gapX + pad * 2;
  c.height = titleH + maxRow + pad * 2;
  const ctx = c.getContext("2d");

  const pal = PNG_PALETTE[isLight() ? "light" : "dark"];
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = pal.ink;
  ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(opts.title || "Q-FOX · Thuật toán", pad, 18);
  ctx.fillStyle = pal.muted;
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(rows.length + " bài · xuất " + new Date().toLocaleDateString("vi-VN"), pad, 42);

  const drawn = await Promise.all(rows.map((row) => new Promise((res) => {
    const svg = topLayer(row.state, { size: detail ? 100 : 120, skirt: true });
    rasterizeSvg(svg, detail ? 100 : 120, detail ? 100 : 120).then(res).catch(() => res(null));
  })));

  // vị trí y mỗi cột
  const colY = new Array(cols).fill(titleH + pad);
  for (let i = 0; i < rows.length; i++) {
    const col = colOf[i];
    const x = pad + col * (cardW + gapX);
    const y = colY[col];
    drawCaseCard(ctx, rows[i], x, y, cardW, { theme: isLight() ? "light" : "dark", detail });
    const imgCanvas = drawn[i];
    if (imgCanvas) {
      const imgSize = detail ? 100 : 120;
      ctx.drawImage(imgCanvas, x + 14, y + 56, imgSize, imgSize);
    }
    colY[col] += cardH[i] + gapY;
  }

  const link = document.createElement("a");
  link.download = (opts.filename || "qfox-algorithms") + ".png";
  link.href = c.toDataURL("image/png");
  link.click();
}

/* ------------------------------------------------------------------- PDF */

/**
 * Mở một tài liệu in chuẩn sách giáo khoa và gọi in -- người học dùng
 * "In thành PDF" của trình duyệt để lưu.
 *
 * Mỗi trang có tiêu đề, nhiều thẻ bài, sơ đồ SVG vector (in rõ), thuật
 * toán màu, và页脚 -- đúng chuẩn sách giáo khoa.
 *
 * @param {object[]} rows
 * @param {object} opts { title, subtitle }
 */
export function exportCasesPdf(rows, opts = {}) {
  if (typeof XMLSerializer === "undefined" || typeof window === "undefined") {
    toast("Trình duyệt này không hỗ trợ xuất PDF -- dùng Xuất PNG", "warn");
    return;
  }
  const title = opts.title || "Q-FOX · Thuật toán";
  const subtitle = opts.subtitle || rows.length + " bài · " + new Date().toLocaleDateString("vi-VN");
  const detail = !!opts.detail;
  const chapters = !!opts.chapters;

  // nhóm theo họ nếu có chương -- mỗi họ là một chương sách
  const groups = chapters
    ? groupByFamily(rows)
    : [{ label: null, rows }];

  const sections = groups.map((g) => {
    const head = g.label
      ? `<div class="chapter"><h2>${escapeHtml(g.label)}</h2><p class="chapter__meta">${g.rows.length} bài</p></div>`
      : "";
    const cards = g.rows.map((row) => caseCardHtml(row, { detail })).join("\n");
    return head + `<div class="cards">${cards}</div>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1b2230; margin: 0; }
  .doc-head { display: flex; justify-content: space-between; align-items: end; border-bottom: 2px solid #1b2230; padding-bottom: 8px; margin-bottom: 14px; }
  .doc-head h1 { font-size: 20px; margin: 0; }
  .doc-head .meta { color: #5c6678; font-size: 12px; }
  .chapter { page-break-before: always; margin-top: 6px; }
  .chapter:first-of-type { page-break-before: avoid; }
  .chapter h2 { font-size: 18px; margin: 0 0 2px; border-bottom: 1px solid #d9d7d0; padding-bottom: 4px; }
  .chapter__meta { color: #5c6678; font-size: 11px; margin: 4px 0 10px; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; }
  .card { width: calc(33.333% - 7px); border: 1px solid #d9d7d0; border-radius: 10px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; background: #fff; }
  .card--detail { width: calc(50% - 5px); }
  .card__head { display: flex; gap: 10px; padding: 10px; }
  .card__diagram { flex: 0 0 auto; }
  .card__body { flex: 1; min-width: 0; }
  .card__fam { color: #5c6678; font-size: 9px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .card__name { font-size: 14px; font-weight: 700; margin: 2px 0 1px; }
  .card__rec { color: #1b2230; font-size: 10px; font-weight: 600; }
  .card__mn { color: #8a4b08; font-size: 9px; font-style: italic; margin-top: 4px; line-height: 1.3; }
  .card__alg-label { color: #5c6678; font-size: 9px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; margin-top: 8px; }
  .card__alg { font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; font-weight: 700; word-break: break-word; }
  .card__chunks { margin-top: 6px; font-size: 9px; color: #5c6678; }
  .card__chunks b { font-family: ui-monospace, monospace; color: #1b2230; }
  .card__chunks .note { color: #5c6678; }
  .card__foot { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #f4f2ee; border-top: 1px solid #e8e5de; font-size: 9px; color: #5c6678; }
  .card__foot .ok { color: #1f9d63; font-weight: 600; }
  .card__foot .bad { color: #d63848; font-weight: 600; }
  .doc-foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid #d9d7d0; color: #5c6678; font-size: 10px; display: flex; justify-content: space-between; }
</style></head>
<body>
<div class="doc-head"><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(subtitle)}</div></div>
${sections}
<div class="doc-foot"><span>Q-FOX Algorithm · sách giáo khoa</span><span>trang in</span></div>
</body></html>`;

  // mở cửa sổ in -- dùng iframe để không bị chặn
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.append(f);
    f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 1000); };
    f.srcdoc = html;
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/** Nhóm các bài theo họ, giữ thứ tự họ chuẩn. */
function groupByFamily(rows) {
  const order = ["OLL", "PLL", "CLL", "COLL", "ELL"];
  const map = new Map();
  for (const r of rows) {
    const k = r.family;
    if (!map.has(k)) map.set(k, { label: r.familyLabel || r.family, rows: [] });
    map.get(k).rows.push(r);
  }
  return [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.label); const ib = order.indexOf(b.label);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/** HTML của một thẻ bài cho PDF -- SVG in vector. */
function caseCardHtml(row, opts = {}) {
  const detail = !!(opts && opts.detail);
  const svg = topLayer(row.state, { size: detail ? 120 : 132, skirt: true });
  const svgStr = new XMLSerializer().serializeToString(svg);
  const name = (row.teach && row.teach.name) || (row.names && row.names[0]) || row.desc.pattern.split(" / ")[0];
  const rec = (row.teach && row.teach.recognise) || row.desc.pattern;
  const alg = row.teach ? row.teach.algorithm : (row.algorithm || "—");
  const algSpan = String(alg).split(/\s+/).filter(Boolean).map((t) =>
    `<span style="color:${moveColour(t)}">${escapeHtml(t)}</span>`).join(" ");
  const verified = row.verified
    ? `<span class="ok">✓ engine kiểm chứng</span>`
    : `<span class="bad">chưa kiểm chứng</span>`;
  const teach = row.teach || {};
  const cls = "card" + (detail ? " card--detail" : "");
  let extra = "";
  if (detail && teach.mnemonic) {
    extra += `<div class="card__mn">Ghi nhớ: ${escapeHtml(teach.mnemonic)}</div>`;
  }
  if (detail && teach.chunks && teach.chunks.length) {
    const chunkHtml = teach.chunks.map((c, i) =>
      `<div><b>${i + 1}. ${escapeHtml(c.text)}</b> <span class="note">— ${escapeHtml(c.note || "")}</span></div>`).join("");
    extra += `<div class="card__chunks"><b>Cụm:</b>${chunkHtml}</div>`;
  }
  return `<div class="${cls}">
  <div class="card__head">
    <div class="card__diagram">${svgStr}</div>
    <div class="card__body">
      <div class="card__fam">${escapeHtml(row.familyLabel || row.family)}</div>
      <div class="card__name">${escapeHtml(name)}</div>
      <div class="card__rec">${escapeHtml(rec)}</div>
      ${extra}
      <div class="card__alg-label">Thuật toán</div>
      <div class="card__alg">${algSpan}</div>
    </div>
  </div>
  <div class="card__foot"><span>${row.stm || row.count} động tác · htm ${row.htm || 0} · qtm ${row.qtm || 0}</span>${verified}</div>
</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Vẽ một công thức do người học tạo thành thẻ chuẩn sách lên canvas.
 * Dùng cho preview trong Tạo công thức -- giống hệt ảnh PNG sẽ xuất.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} formula { name, text, goal, note }
 */
export function drawFormulaCard(ctx, formula) {
  const pal = PNG_PALETTE[isLight() ? "light" : "dark"];
  const w = 520, h = 180;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = pal.surface;
  roundRect(ctx, 8, 8, w - 16, h - 16, 14); ctx.fill();
  ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = pal.muted;
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("MỤC TIÊU: " + ((formula.goal || "PLL").toUpperCase()) + " · CÔNG THỨC TỰ TẠO", 24, 20);

  ctx.fillStyle = pal.ink;
  ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(formula.name || "Công thức", 24, 40);

  ctx.font = "700 22px ui-monospace, 'Geist Mono', monospace";
  let cx = 24, cy = 78;
  for (const t of String(formula.text || "").split(/\s+/).filter(Boolean)) {
    const tw = ctx.measureText(t + " ").width;
    if (cx + tw > w - 24) { cx = 24; cy += 30; }
    ctx.fillStyle = moveColour(t);
    ctx.fillText(t, cx, cy);
    cx += tw;
  }

  if (formula.note) {
    ctx.fillStyle = pal.muted;
    ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
    wrapText(ctx, formula.note, 24, 130, w - 48, 15);
  }
  ctx.fillStyle = pal.muted;
  ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Q-FOX Algorithm · " + new Date().toLocaleDateString("vi-VN"), 24, h - 24);
}

/**
 * Xuất một công thức do người học tạo thành PDF/PNG -- một thẻ lớn.
 *
 * @param {object} formula { name, text, goal, note }
 */
export function exportFormulaPdf(formula) {
  if (typeof window === "undefined") { toast("Không thể mở cửa sổ in", "warn"); return; }
  const name = formula.name || "Công thức";
  const alg = formula.text || "—";
  const algSpan = String(alg).split(/\s+/).filter(Boolean).map((t) =>
    `<span style="color:${moveColour(t)}">${escapeHtml(t)}</span>`).join(" ");
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #1b2230; margin: 0; }
  .wrap { max-width: 600px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: #5c6678; font-size: 13px; margin-bottom: 24px; border-bottom: 2px solid #1b2230; padding-bottom: 10px; }
  .alg { font-family: ui-monospace, monospace; font-size: 28px; font-weight: 700; letter-spacing: 1px; padding: 20px; background: #f4f2ee; border-radius: 12px; word-break: break-word; text-align: center; }
  .note { margin-top: 16px; color: #333; font-size: 14px; }
  .foot { margin-top: 30px; color: #8d99b0; font-size: 11px; border-top: 1px solid #d9d7d0; padding-top: 8px; }
</style></head>
<body><div class="wrap">
<h1>${escapeHtml(name)}</h1>
<div class="sub">Mục tiêu: ${escapeHtml(formula.goal || "PLL")} · công thức tự tạo · ${new Date().toLocaleDateString("vi-VN")}</div>
<div class="alg">${algSpan}</div>
${formula.note ? `<div class="note">${escapeHtml(formula.note)}</div>` : ""}
<div class="foot">Q-FOX Algorithm · công thức do người học tạo</div>
</div></body></html>`;
  const w = window.open("", "_blank", "width=700,height=800");
  if (!w) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.append(f);
    f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 1000); };
    f.srcdoc = html;
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/** Xuất công thức tự tạo thành PNG -- một khung đẹp. */
export async function exportFormulaPng(formula) {
  if (!canCanvas()) {
    toast("Trình duyệt này không hỗ trợ canvas -- dùng PDF công thức", "warn");
    return exportFormulaPdf(formula);
  }
  const name = formula.name || "Công thức";
  const alg = formula.text || "—";
  const c = document.createElement("canvas");
  c.width = 900; c.height = 420;
  const ctx = c.getContext("2d");
  const pal = PNG_PALETTE[isLight() ? "light" : "dark"];
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, c.width, c.height);

  // khung
  ctx.fillStyle = pal.surface;
  roundRect(ctx, 40, 40, c.width - 80, c.height - 80, 18); ctx.fill();
  ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = pal.muted;
  ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`MỤC TIÊU: ${(formula.goal || "PLL").toUpperCase()} · CÔNG THỨC TỰ TẠO`, 64, 64);

  ctx.fillStyle = pal.ink;
  ctx.font = "700 34px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(name, 64, 92);

  // thuật toán lớn, màu
  ctx.font = "700 30px ui-monospace, 'Geist Mono', monospace";
  let cx = 64, cy = 168;
  for (const t of String(alg).split(/\s+/).filter(Boolean)) {
    const tw = ctx.measureText(t + " ").width;
    if (cx + tw > c.width - 64) { cx = 64; cy += 40; }
    ctx.fillStyle = moveColour(t);
    ctx.fillText(t, cx, cy);
    cx += tw;
  }

  if (formula.note) {
    ctx.fillStyle = pal.muted;
    ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
    wrapText(ctx, formula.note, 64, cy + 56, c.width - 128, 20);
  }
  ctx.fillStyle = pal.muted;
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`Q-FOX Algorithm · ${new Date().toLocaleDateString("vi-VN")}`, 64, c.height - 60);

  const link = document.createElement("a");
  link.download = "qfox-formula.png";
  link.href = c.toDataURL("image/png");
  link.click();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lineH; line = w; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
