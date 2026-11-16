/**
 * Tiện ích DOM và định dạng nhỏ. Không framework, không phụ thuộc.
 */

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "attrs") {
      for (const [ak, av] of Object.entries(v)) node.setAttribute(ak, av);
    } else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const frag = (...kids) => el("template", {}, kids).content.cloneNode(true);

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...kids) {
  clear(node);
  node.append(...kids.flat(9).filter((k) => k !== null && k !== undefined && k !== false));
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ số liệu */

export const num = (v, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(digits);

export const int = (v) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("vi-VN");

export function pct(part, whole, digits = 0) {
  if (!whole) return "—";
  return `${((100 * part) / whole).toFixed(digits)}%`;
}

export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Giây -> "1,4 s" / "1 phút 05 s" */
export function duration(sec) {
  if (sec === null || sec === undefined) return "—";
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 2 : 1)} s`;
  const m = Math.floor(sec / 60);
  return `${m} phút ${String(Math.round(sec - m * 60)).padStart(2, "0")} s`;
}

/** Giây -> "12,4 s" theo chuẩn Việt Nam (dấu phẩy thập phân). */
export function seconds(sec, digits = 2) {
  if (sec === null || sec === undefined) return "—";
  return `${Number(sec).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
}

/* --------------------------------------------------------------- clipboard */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el("textarea", { style: { position: "fixed", opacity: "0" } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ------------------------------------------------------------------- toast */

let toastHost = null;
export function toast(message, kind = "info", ms = 2600) {
  if (!toastHost) {
    toastHost = el("div", { class: "toasts", attrs: { "aria-live": "polite" } });
    document.body.append(toastHost);
  }
  const node = el("div", { class: `toast toast--${kind}`, role: "status" }, message);
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add("is-on"));
  setTimeout(() => {
    node.classList.remove("is-on");
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

/* ------------------------------------------------------------------ dialog */

/** Cửa sổ nổi. Trả về { root, close }. Esc và click nền đóng nó. */
export function sheet(titleText, bodyNode, opts = {}) {
  const close = () => {
    root.classList.remove("is-on");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => root.remove(), 200);
    if (opts.onClose) opts.onClose();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  };
  const panel = el(
    "div",
    { class: `sheet__panel ${opts.wide ? "sheet__panel--wide" : ""}`, role: "dialog",
      attrs: { "aria-modal": "true", "aria-label": titleText } },
    el("header", { class: "sheet__head" },
       el("h2", {}, titleText),
       opts.subtitle ? el("p", { class: "sheet__sub" }, opts.subtitle) : null,
       el("button", { class: "icon-btn", title: "Đóng (Esc)", "aria-label": "Đóng",
                      onClick: close }, "✕")),
    el("div", { class: "sheet__body" }, bodyNode),
  );
  const root = el("div", { class: "sheet", onClick: (e) => { if (e.target === root) close(); } }, panel);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add("is-on"));
  document.addEventListener("keydown", onKey, true);
  return { root, panel, close };
}

/* ------------------------------------------------------------- thành phần nhỏ */

export function chip(text, kind = "", title = "") {
  return el("span", { class: `chip ${kind ? `chip--${kind}` : ""}`, title }, text);
}

export function badge(text, kind = "") {
  return el("span", { class: `badge ${kind ? `badge--${kind}` : ""}` }, text);
}

/** Một chuỗi động tác thành các chip click được. */
export function moveChips(seq, onPick = null, opts = {}) {
  const tokens = String(seq || "").split(/\s+/).filter(Boolean);
  return el("div", { class: "moves" }, tokens.map((t, i) =>
    el("button", {
      class: `move ${t.endsWith("'") ? "move--ccw" : t.endsWith("2") ? "move--half" : ""}`,
      dataset: { i, t },
      title: opts.title ? `${opts.title} ${i + 1}` : `Động tác ${i + 1}`,
      onClick: onPick ? (e) => onPick(i, t, e) : null,
      type: "button",
    }, t)));
}

export function progressBar(part, whole, label = "") {
  const p = whole ? Math.min(100, Math.round((100 * part) / whole)) : 0;
  return el("div", { class: "progress", title: label || `${part}/${whole}` },
    el("div", { class: "progress__bar", style: { width: `${p}%` } }),
    el("span", { class: "progress__text" }, label || `${part}/${whole}`));
}

export function ring(part, whole, size = 56) {
  const p = whole ? part / whole : 0;
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const svg = `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring__bg"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring__fg"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}"/>
      <text x="50%" y="50%" class="ring__text" dominant-baseline="central"
        text-anchor="middle">${Math.round(p * 100)}%</text>
    </svg>`;
  return el("div", { class: "ring-wrap", html: svg, title: `${part} trong ${whole} bài đã thuộc` });
}

export function spinner(text = "Đang tải") {
  return el("div", { class: "spinner-wrap" },
    el("div", { class: "spinner", attrs: { "aria-hidden": "true" } }),
    el("p", {}, text));
}

export function emptyState(title, hint = "") {
  return el("div", { class: "empty" },
    el("div", { class: "empty__mark", attrs: { "aria-hidden": "true" } }, "∅"),
    el("h3", {}, title), hint ? el("p", {}, hint) : null);
}

/* ---------------------------------------------------------------- download */

export function download(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce(fn, ms = 180) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
