/**
 * Viết file PDF thật -- tải thẳng xuống, in ra học được.
 *
 * Đây là phần xuất file thực sự dùng được: bạn không mở cửa sổ in rồi
 * tìm "In thành PDF", mà tải thẳng một tệ `.pdf` xuống -- đúng chuẩn
 * sách giáo khoa, nhiều trang, in ra hoặc mở trên máy tính, điện thoại.
 *
 * Cơ chế: vẽ mỗi trang sách ra canvas (A4), rồi viết một PDF hợp lệ
 * client-side -- mỗi trang là một ảnh compressed (zlib) đặt trên trang
 * A4. Không cần thư viện bên ngoài, không cần mạng -- mọi thứ chạy
 * trong trình duyệt từ chính bảng dán của engine.
 */
import { topLayer } from "./diagram.js";
import { moveColour, drawCaseCard, drawFormulaCard, exportCasesPdf } from "./export.js";

const A4 = { w: 595.28, h: 841.89 }; // điểm PDF
const RENDER_SCALE = 2;               // độ phân giải render -- in rõ
const PAGE_W = Math.round(A4.w * RENDER_SCALE);
const PAGE_H = Math.round(A4.h * RENDER_SCALE);

/* ------------------------------------------------------------- vẽ trang */

/**
 * Vẽ một trang sách A4 ra canvas -- tiêu đề + grid các thẻ bài.
 * Mỗi trang chứa nhiều thẻ; thẻ dài hơn một trang thì tách trang.
 *
 * @param {object[]} rows  các bài trong trang này
 * @param {object} opts { title, subtitle, detail, pageLabel }
 * @returns {HTMLCanvasElement}
 */
export async function renderTextbookPage(rows, opts = {}) {
  const c = document.createElement("canvas");
  c.width = PAGE_W; c.height = PAGE_H;
  const ctx = c.getContext("2d");
  const bw = !!opts.bw;
  const pal = bw ? BW_PALETTE : PNG_PALETTE[isLight() ? "light" : "dark"];
  const S = RENDER_SCALE;

  // nền trang -- trắng cho in (mặc dù web dark, file in ra trắng)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // tiêu đề trang
  const margin = Math.round(40 * S);
  ctx.fillStyle = "#1b2230";
  ctx.font = `700 ${Math.round(24 * S)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(opts.title || "Q-FOX · Thuật toán", margin, margin);
  ctx.fillStyle = "#5c6678";
  ctx.font = `500 ${Math.round(13 * S)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(opts.subtitle || "", margin, margin + Math.round(34 * S));

  //罫 trang dưới tiêu đề
  ctx.strokeStyle = "#1b2230";
  ctx.lineWidth = Math.round(2 * S);
  const headBottom = margin + Math.round(70 * S);
  ctx.beginPath();
  ctx.moveTo(margin, headBottom);
  ctx.lineTo(PAGE_W - margin, headBottom);
  ctx.stroke();

  // vẽ các thẻ -- layout grid, tách trang nếu hết chỗ
  const detail = !!opts.detail;
  const cols = detail ? 2 : 3;
  const cardW = detail ? Math.round(230 * S) : Math.round(170 * S);
  const cardH = detail ? Math.round(230 * S) : Math.round(190 * S);
  const gapX = Math.round(16 * S), gapY = Math.round(16 * S);
  const gridW = cols * cardW + (cols - 1) * gapX;
  const gridX = margin + Math.max(0, (PAGE_W - margin * 2 - gridW) / 2);

  // rasterize sơ đồ cho từng bài
  const diagrams = await Promise.all(rows.map((row) => rasterizeForPdf(row, detail ? 110 : 120, bw)));

  let y = headBottom + Math.round(16 * S);
  let col = 0;
  for (let i = 0; i < rows.length; i++) {
    const x = gridX + col * (cardW + gapX);
    // nếu hàng này không đủ chỗ -- dừng, trang này hết
    if (y + cardH > PAGE_H - margin) break;
    // vẽ thẻ -- scale vì drawCaseCard dùng px nhỏ, phóng lên
    ctx.save();
    ctx.scale(S, S);
    drawCaseCardAt(ctx, rows[i], x / S, y / S, cardW / S, { theme: "light", detail, bw }, diagrams[i]);
    ctx.restore();
    col++;
    if (col >= cols) { col = 0; y += cardH + gapY; }
  }

  //页脚 trang
  ctx.fillStyle = "#8d99b0";
  ctx.font = `500 ${Math.round(11 * S)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(opts.pageLabel || "Q-FOX Algorithm · sách giáo khoa", PAGE_W / 2, PAGE_H - Math.round(30 * S));
  ctx.textAlign = "left";

  return c;
}

/** Vẽ một thẻ bài ở kích thước px (phóng scale đã xử lý ngoài). */
function drawCaseCardAt(ctx, row, x, y, w, opts, diagramCanvas) {
  const bw = !!opts.bw;
  const pal = bw ? BW_PALETTE : PNG_PALETTE[opts.theme || "light"];
  const detail = !!opts.detail;
  const teach = row.teach || {};
  const pad = 10;
  let h = detail ? 230 : 190;
  if (detail && teach.chunks) h += teach.chunks.length * 13;

  ctx.fillStyle = pal.surface;
  roundRectC(ctx, x, y, w, h, 8); ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line; ctx.stroke();

  ctx.fillStyle = pal.muted;
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText((row.familyLabel || row.family).toUpperCase(), x + pad, y + 8);

  const name = (row.teach && row.teach.name) || (row.names && row.names[0]) || row.desc.pattern.split(" / ")[0];
  ctx.fillStyle = pal.ink;
  ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(trunc(ctx, name, w - pad * 2), x + pad, y + 20);

  const imgSize = detail ? 90 : 110;
  const imgX = x + pad, imgY = y + 40;
  ctx.fillStyle = pal.plate;
  roundRectC(ctx, imgX, imgY, imgSize, imgSize, 6); ctx.fill();
  if (diagramCanvas) ctx.drawImage(diagramCanvas, imgX, imgY, imgSize, imgSize);

  const tx = x + pad + imgSize + 8;
  const tw = w - pad * 2 - imgSize - 8;
  ctx.fillStyle = pal.muted;
  ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("NHẬN DẠNG", tx, y + 40);
  ctx.fillStyle = pal.ink;
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  const rec = (row.teach && row.teach.recognise) || row.desc.pattern;
  ctx.fillText(trunc(ctx, rec, tw), tx, y + 52);

  let cy = y + 70;
  if (detail && teach.mnemonic) {
    ctx.fillStyle = pal.muted;
    ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("GHI NHỚ", tx, cy); cy += 11;
    ctx.fillStyle = bw ? pal.muted : "#8a4b08";
    ctx.font = "500 8px ui-sans-serif, system-ui, sans-serif";
    wrapTextC(ctx, teach.mnemonic, tx, cy, tw, 10);
    cy += 22;
  }
  ctx.fillStyle = pal.muted;
  ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("THUẬT TOÁN", tx, cy); cy += 12;
  drawAlgLineC(ctx, (row.teach ? row.teach.algorithm : (row.algorithm || "—")), tx, cy, tw, pal, bw);

  if (detail && teach.chunks) {
    const chY = imgY + imgSize + 6;
    ctx.fillStyle = pal.muted;
    ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("CỤM", x + pad, chY);
    teach.chunks.forEach((c, i) => {
      const ly = chY + 11 + i * 13;
      ctx.fillStyle = pal.ink;
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.fillText((i + 1) + ". " + c.text, x + pad, ly);
      if (c.note) {
        ctx.fillStyle = pal.muted;
        ctx.font = "500 7px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(c.note, x + pad + 70, ly);
      }
    });
  }
  const sy = y + h - 18;
  ctx.fillStyle = pal.muted;
  ctx.font = "500 8px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText((row.stm || row.count) + " động tác · htm " + (row.htm || 0), x + pad, sy);
  ctx.textAlign = "right";
  ctx.fillStyle = bw ? pal.ink : (row.verified ? "#1f9d63" : "#d63848");
  ctx.fillText(row.verified ? "✓ kiểm chứng" : "chưa kiểm chứng", x + w - pad, sy);
  ctx.textAlign = "left";
}

function drawAlgLineC(ctx, alg, x, y, w, pal, bw) {
  const tokens = String(alg || "—").split(/\s+/).filter(Boolean);
  let cx = x, lineH = 13;
  ctx.font = "700 10px ui-monospace, monospace";
  ctx.textBaseline = "top";
  for (const t of tokens) {
    const tw = ctx.measureText(t + " ").width;
    if (cx + tw > x + w && cx > x) { cx = x; y += lineH; }
    ctx.fillStyle = bw ? pal.ink : moveColour(t);
    ctx.fillText(t, cx, y);
    cx += tw;
  }
  if (!tokens.length) { ctx.fillStyle = pal.muted; ctx.fillText("—", x, y); }
}

function roundRectC(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trunc(ctx, text, maxW) {
  let t = String(text);
  while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -1);
  return t + (t.length < String(text).length ? "…" : "");
}

function wrapTextC(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const wd of words) {
    const test = line ? line + " " + wd : wd;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lineH; line = wd; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

/** Rasterize sơ đồ lớp trên cho PDF -- nền trắng, màu rubik thật hoặc B&W. */
async function rasterizeForPdf(row, size, bw) {
  if (!canCanvas()) return null;
  const svg = topLayer(row.state, { size, skirt: true, bw });
  try {
    const ser = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ser);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    // nền trắng cho in
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return c;
  } catch { return null; }
}

function canCanvas() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext && c.getContext("2d"));
  } catch { return false; }
}

const PNG_PALETTE = {
  light: { bg: "#f6f4f0", surface: "#ffffff", line: "#d9d7d0", ink: "#1b2230", muted: "#5c6678", plate: "#ecebe5" },
  dark: { bg: "#0b0e14", surface: "#141a24", line: "#262f3d", ink: "#e7ecf5", muted: "#8d99b0", plate: "#1c2433" },
};

/** Palette 2 màu đen/trắng cho sách in B&W -- không cần màu vẫn học được. */
const BW_PALETTE = {
  bg: "#ffffff", surface: "#ffffff", line: "#111111", ink: "#111111",
  muted: "#444444", plate: "#f0f0f0",
};

/** Trạng thái theme hiện tại (file in luôn dùng nền trắng -- chỉ dùng cho màu chip). */
function isLight() {
  try { return document.documentElement.getAttribute("data-theme") === "light"; }
  catch { return false; }
}

/* ------------------------------------------------------------ viết PDF */

/**
 * Ghép nhiều canvas thành một file PDF đa trang, tải xuống.
 *
 * @param {HTMLCanvasElement[]} canvases  mỗi canvas là một trang
 * @param {object} opts { title }
 */
export async function buildPdfFile(canvases, opts = {}) {
  if (!canCanvas()) throw new Error("trình duyệt không hỗ trợ canvas");
  const pages = [];
  for (const cv of canvases) {
    const rgb = canvasToRgb(cv);
    const compressed = await deflate(rgb);
    pages.push({ width: cv.width, height: cv.height, data: compressed, filter: compressed.length < rgb.length });
  }
  const pdf = await assemblePdf(pages, opts);
  return pdf;
}

/** Canvas → RGB Uint8Array (hạ alpha, phủ nền trắng). */
function canvasToRgb(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const out = new Uint8Array(width * height * 3);
  const d = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2];
  }
  return out;
}

/** Compress bytes bằng deflate -- fallback nếu không có CompressionStream. */
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return bytes;
  try {
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  } catch {
    return bytes;
  }
}

/** Lắp các ảnh page thành PDF hợp lệ, trả Blob -- assembly theo byte trực tiếp. */
async function assemblePdf(pages, opts) {
  const W = [];
  let offset = 0;
  const ws = (s) => { const a = latin1(s); W.push(a); offset += a.length; };
  const w = (u8) => { W.push(u8); offset += u8.length; };
  const objOffsets = [];   // offset của object N (index N-1)

  ws("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

  const objCount = 2 + pages.length * 3;
  const pageRefs = [];
  for (let i = 0; i < pages.length; i++) pageRefs.push(3 + i * 3);

  const writeObj = (n, body) => {
    objOffsets[n - 1] = offset;
    ws(n + " 0 obj\n" + body + "\nendobj\n");
  };

  writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  writeObj(2, "<< /Type /Pages /Kids [" + pageRefs.map((r) => r + " 0 R").join(" ") + "] /Count " + pages.length + " >>");

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageObj = 3 + i * 3;
    const contentObj = 4 + i * 3;
    const imageObj = 5 + i * 3;
    writeObj(pageObj, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + p.width + " " + p.height + "] " +
        "/Resources << /XObject << /Im0 " + imageObj + " 0 R >> >> /Contents " + contentObj + " 0 R >>");
    const content = "q " + p.width + " 0 0 " + p.height + " 0 0 cm /Im0 Do Q";
    writeObj(contentObj, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    const filter = p.filter ? "/Filter /FlateDecode " : "";
    objOffsets[imageObj - 1] = offset;
    ws(imageObj + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + p.width + " /Height " + p.height +
       " /ColorSpace /DeviceRGB /BitsPerComponent 8 " + filter + "/Length " + p.data.length + " >>\nstream\n");
    w(p.data);
    ws("\nendstream\nendobj\n");
  }

  const xrefPos = offset;
  let xref = "xref\n0 " + (objCount + 1) + "\n";
  xref += "0000000000 65535 f \n";
  for (const off of objOffsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  ws(xref);
  ws("trailer\n<< /Size " + (objCount + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");

  const total = byteLen(W);
  const outArr = new Uint8Array(total);
  let off = 0;
  for (const c of W) { outArr.set(c, off); off += c.length; }
  return new Blob([outArr], { type: "application/pdf" });
}

/** Chuyển string latin1 → Uint8Array. */
function latin1(s) {
  const len = s.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}

/* ------------------------------------------------------- export công thức */

/** Xuất công thức tự tạo thành file PDF thật -- một trang A4. */
export async function exportFormulaPdfFile(formula) {
  const c = document.createElement("canvas");
  c.width = PAGE_W; c.height = PAGE_H;
  const ctx = c.getContext("2d");
  const S = RENDER_SCALE;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = Math.round(60 * S);
  ctx.fillStyle = "#1b2230";
  ctx.font = `700 ${Math.round(30 * S)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(formula.name || "Công thức", margin, margin);
  ctx.fillStyle = "#5c6678";
  ctx.font = `500 ${Math.round(14 * S)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("Mục tiêu: " + (formula.goal || "PLL") + " · công thức tự tạo · " + new Date().toLocaleDateString("vi-VN"), margin, margin + Math.round(40 * S));

  ctx.strokeStyle = "#1b2230";
  ctx.lineWidth = Math.round(2 * S);
  const headBottom = margin + Math.round(90 * S);
  ctx.beginPath();
  ctx.moveTo(margin, headBottom);
  ctx.lineTo(PAGE_W - margin, headBottom);
  ctx.stroke();

  // thuật toán lớn, màu -- dùng drawFormulaCard scale
  ctx.save();
  ctx.scale(S, S);
  // drawFormulaCard vẽ toàn bộ khung; nhưng ta muốn chỉ phần thuật toán.
  // Tái dùng drawFormulaCard trên vùng, rồi crop -- đơn giản: vẽ lại ở đây.
  drawFormulaLarge(ctx, formula, margin / S, headBottom / S + 30, PAGE_W / S - margin * 2);
  ctx.restore();

  const blob = await buildPdfFile([c], { title: formula.name });
  downloadBlob(blob, "qfox-formula.pdf");
}

function drawFormulaLarge(ctx, formula, x, y, w) {
  const alg = formula.text || "—";
  ctx.font = `700 ${Math.round(34)}px ui-monospace, 'Geist Mono', monospace`;
  ctx.textBaseline = "top";
  let cx = x, cy = y;
  for (const t of String(alg).split(/\s+/).filter(Boolean)) {
    const tw = ctx.measureText(t + " ").width;
    if (cx + tw > x + w) { cx = x; cy += 44; }
    ctx.fillStyle = moveColour(t);
    ctx.fillText(t, cx, cy);
    cx += tw;
  }
  if (formula.note) {
    ctx.fillStyle = "#5c6678";
    ctx.font = "500 15px ui-sans-serif, system-ui, sans-serif";
    wrapTextC(ctx, formula.note, x, cy + 60, w, 22);
  }
  ctx.fillStyle = "#8d99b0";
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Q-FOX Algorithm · công thức do người học tạo", x, y + 200);
}

/* ------------------------------------------------------------ export đầy đủ */

/**
 * Xuất một tập bài thành file PDF sách giáo khoa -- đa trang, tải thẳng.
 *
 * @param {object[]} rows
 * @param {object} opts { title, subtitle, detail, chapters }
 */
export async function exportCasesPdfFile(rows, opts = {}) {
  if (!canCanvas()) {
    return exportCasesPdf(rows, opts);
  }
  const detail = !!opts.detail;
  const bw = !!opts.bw;
  const title = opts.title || "Q-FOX · Sách giáo khoa thuật toán";
  const subtitle = opts.subtitle || rows.length + " bài · " + new Date().toLocaleDateString("vi-VN");

  // phân trang: mỗi trang chứa số卡片 phù hợp, tách theo chương nếu có
  const pages = [];
  const perPage = detail ? 4 : 6;
  let pageRows = [];
  let chapterLabel = null;

  function flush() {
    if (!pageRows.length) return;
    const canvas = renderTextbookPage(pageRows, {
      title: title + (chapterLabel ? " · " + chapterLabel : ""),
      subtitle, detail, bw, pageLabel: `${pages.length + 1}`,
    });
    pages.push(canvas);
    pageRows = [];
  }

  if (opts.chapters) {
    const groups = groupByFamily(rows);
    for (const g of groups) {
      chapterLabel = g.label;
      for (const row of g.rows) {
        pageRows.push(row);
        if (pageRows.length >= perPage) flush();
      }
      flush();
    }
  } else {
    for (const row of rows) {
      pageRows.push(row);
      if (pageRows.length >= perPage) flush();
    }
    flush();
  }

  if (!pages.length) return;
  const blob = await buildPdfFile(pages, { title });
  downloadBlob(blob, (opts.filename || "qfox-textbook") + ".pdf");
}

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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
