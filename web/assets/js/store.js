/**
 * Mọi thứ trang nhớ được, trong localStorage, dưới một khóa có phiên bản.
 *
 * Bốn loại trạng thái:
 *   settings  — cách khối được vẽ và tốc độ hoạt hình
 *   progress  — bài nào bạn đã đánh dấu "đã thuộc", theo khóa bài
 *   srs       — lịch học nhắc lại của bài luyện (hộp, giờ đến hạn, chuỗi)
 *   records   — bảng kỷ lục cá nhân: thời gian nhanh nhất, số lần thử,
 *              chuỗi ngày liên tục, thống kê theo ngày
 *
 * Không có gì ở đây nói chuyện qua mạng, nên một session trên Cloudflare
 * Pages hoạt động offline sau lần tải đầu và không cần tài khoản.
 */

const KEY = "qfox.web.v2";

const DEFAULTS = {
  settings: {
    view: "3d",            // "3d" | "net"
    speed: 220,            // ms mỗi quarter-turn
    autoPlay: true,
    highlight: "ll",       // "ll" | "none"
    yaw: -34,
    pitch: -24,
    notation: "standard",  // "standard" | "wide"
    reducedMotion: false,
    theme: "dark",         // "dark" | "light" | "system"
  },
  progress: {},            // khóa bài -> { learned, ts }
  srs: {},                 // khóa bài -> { box, due, seen, right, wrong, streak }
  records: {
    best: {},              // khóa bài -> { ms, at } thời gian nhập nhanh nhất
    attempts: {},          // khóa bài -> số lần thử
    days: {},              // "YYYY-MM-DD" -> { reviews, correct, cards }
    streak: 0,             // số ngày liên tục hiện tại (có luyện tập)
    bestStreak: 0,
    lastDay: null,
  },
  sessions: [],            // vài session luyện tập gần đây, mới nhất trước
  formulas: [],            // công thức do người học tạo: {id, name, text, goal, family, note, ts}
};

let state = null;
let listeners = [];

export function load() {
  if (state) return state;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = null; }
  const parsed = raw ? JSON.parse(raw) : {};
  state = {
    settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    progress: parsed.progress || {},
    srs: parsed.srs || {},
    records: { ...JSON.parse(JSON.stringify(DEFAULTS.records)), ...(parsed.records || {}) },
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
  return state;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* chế độ riêng tư */ }
  }, 120);
}

export function onChange(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}
function emit(what) {
  save();
  for (const fn of listeners) { try { fn(what, state); } catch { /* một view bị lỗi */ } }
}

/* ---------------------------------------------------------------- cài đặt */

export const settings = () => load().settings;

export function setSetting(name, value) {
  load().settings[name] = value;
  emit("settings");
}

/** Chế độ theme hiện tại: "dark" | "light" (system đã được resolve). */
export function getTheme() {
  const t = load().settings.theme || "dark";
  if (t === "system") {
    return (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches)
      ? "light" : "dark";
  }
  return t;
}

/** Áp dụng theme lên <html>: đặt data-theme, cập nhật theme-color meta. */
export function applyTheme(theme) {
  const resolved = (theme === "system")
    ? ((typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark")
    : theme;
  const html = document.documentElement;
  if (resolved === "light") html.setAttribute("data-theme", "light");
  else html.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f6f4f0" : "#0b0e14");
}

/** Đổi theme và lưu. Trả về theme mới đã resolve. */
export function toggleTheme() {
  const cur = getTheme();
  const next = cur === "light" ? "dark" : "light";
  setSetting("theme", next);
  applyTheme(next);
  return next;
}

/* ---------------------------------------------------- công thức người học tạo */

/** Danh sách công thức do người học tạo, mới nhất trước. */
export function getFormulas() {
  return (load().formulas || []).slice().sort((a, b) => b.ts - a.ts);
}

/** Lưu một công thức. Trả về bản ghi đã lưu. */
export function saveFormula(f) {
  const list = load().formulas || [];
  const rec = {
    id: f.id || `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: (f.name || "Công thức").trim(),
    text: (f.text || "").trim(),
    goal: f.goal || "PLL",
    family: f.family || "",
    note: f.note || "",
    ts: Date.now(),
  };
  // thay thế nếu có id trùng, vônế nếu không có id
  const idx = list.findIndex((x) => x.id === rec.id);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  load().formulas = list;
  emit("formulas");
  return rec;
}

/** Xóa một công thức theo id. */
export function deleteFormula(id) {
  const list = load().formulas || [];
  load().formulas = list.filter((x) => x.id !== id);
  emit("formulas");
}

/* --------------------------------------------------------------- tiến độ */

export function isLearned(key) {
  return Boolean(load().progress[key]);
}

export function setLearned(key, on = true) {
  const p = load().progress;
  if (on) p[key] = { ts: Date.now() };
  else delete p[key];
  emit("progress");
  return on;
}

export function toggleLearned(key) {
  return setLearned(key, !isLearned(key));
}

export function learnedKeys() {
  return Object.keys(load().progress);
}

export function learnedCount(keys) {
  const p = load().progress;
  return keys.filter((k) => p[k]).length;
}

/* ------------------------------------------------------- học nhắc lại (bài luyện) */

/** Khoảng cách hộp tính theo phút: 0 = mới, 5 = thuộc hôm nay, tới 30 ngày. */
const BOX_MINUTES = [0, 10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 30];
export const MAX_BOX = BOX_MINUTES.length - 1;

export function card(key) {
  const c = load().srs[key];
  return c || { box: 0, due: 0, seen: 0, right: 0, wrong: 0, streak: 0, last: null };
}

/**
 * Ghi một lần luyện.
 * @param {string} key   khóa bài
 * @param {number} grade 2 = thuộc, 1 = do dự, 0 = sai
 */
export function review(key, grade) {
  const s = load().srs;
  const c = s[key] || { box: 0, due: 0, seen: 0, right: 0, wrong: 0, streak: 0 };
  c.seen += 1;
  c.last = Date.now();
  if (grade >= 2) {
    c.right += 1;
    c.streak += 1;
    c.box = Math.min(MAX_BOX, c.box + 1);
  } else if (grade === 1) {
    c.right += 1;
    c.streak = 0;
    c.box = Math.max(0, c.box);
  } else {
    c.wrong += 1;
    c.streak = 0;
    c.box = 0;
  }
  const minutes = BOX_MINUTES[c.box] * (grade === 2 ? 1 : 0.25);
  c.due = Date.now() + Math.max(60_000, minutes * 60_000);
  s[key] = c;
  emit("srs");
  return c;
}

/** Thứ tự bài luyện nên hỏi: đến hạn trước, rồi mới, rồi tương lai. */
export function schedule(keys) {
  const now = Date.now();
  const s = load().srs;
  const rows = keys.map((k) => {
    const c = s[k] || { box: 0, due: 0, seen: 0 };
    return { key: k, box: c.box, due: c.due || 0, seen: c.seen || 0,
             overdue: (c.due || 0) <= now && c.seen > 0, fresh: !c.seen };
  });
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
    if (a.box !== b.box) return a.box - b.box;
    return a.due - b.due;
  });
  return rows;
}

export function stats(keys) {
  const s = load().srs;
  let seen = 0, right = 0, wrong = 0, mature = 0;
  for (const k of keys) {
    const c = s[k];
    if (!c) continue;
    seen += c.seen || 0;
    right += c.right || 0;
    wrong += c.wrong || 0;
    if ((c.box || 0) >= 3) mature += 1;
  }
  return { seen, right, wrong, mature,
           accuracy: right + wrong ? right / (right + wrong) : null };
}

/* ------------------------------------------------------------- kỷ lục cá nhân */

const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Ghi một lần trả lời trong bài luyện (kỷ lục thời gian nhập). */
export function recordAnswer(key, ms, correct) {
  const rec = load().records;
  rec.attempts[key] = (rec.attempts[key] || 0) + 1;
  if (correct) {
    const prev = rec.best[key];
    if (!prev || ms < prev.ms) rec.best[key] = { ms: Math.round(ms), at: Date.now() };
  }
  return rec.best[key] || null;
}

/** Ghi một lần luyện vào thống kê theo ngày và cập nhật chuỗi ngày. */
export function recordActivity(grade) {
  const rec = load().records;
  const key = todayKey();
  const day = rec.days[key] || { reviews: 0, correct: 0, cards: 0 };
  day.reviews += 1;
  if (grade >= 2) day.correct += 1;
  if (grade >= 1) day.cards += 1;
  rec.days[key] = day;

  const yesterday = todayKey(new Date(Date.now() - 86_400_000));
  const active = rec.days[key].reviews > 0;
  if (active && rec.lastDay !== key) {
    rec.streak = rec.lastDay === yesterday ? rec.streak + 1 : 1;
    rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
    rec.lastDay = key;
  }
  emit("records");
  return rec;
}

/** Thống kê kỷ lục tổng hợp. */
export function records(keys) {
  const rec = load().records;
  const keyList = keys || [];
  let bestCount = 0, attempts = 0, bestMs = null;
  for (const k of keyList) {
    const b = rec.best[k];
    if (b) { bestCount += 1; attempts += rec.attempts[k] || 0;
             if (bestMs === null || b.ms < bestMs) bestMs = b.ms; }
  }
  const days = Object.entries(rec.days)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 60);
  const totalReviews = days.reduce((s, [, d]) => s + d.reviews, 0);
  const totalCorrect = days.reduce((s, [, d]) => s + d.correct, 0);
  return {
    bestCount, attempts, bestMs,
    streak: rec.streak, bestStreak: rec.bestStreak,
    days, totalReviews, totalCorrect,
    accuracy: totalReviews ? totalCorrect / totalReviews : null,
    perDay: (key) => rec.days[todayKey()] || null,
    bestOf: (key) => rec.best[key] || null,
    attemptsOf: (key) => rec.attempts[key] || 0,
  };
}

export function logSession(row) {
  const sessions = load().sessions;
  sessions.unshift({ ...row, at: Date.now() });
  if (sessions.length > 40) sessions.length = 40;
  emit("sessions");
}

export const recentSessions = () => load().sessions;

/* ------------------------------------------------------------ toàn bộ kho */

export function exportAll() {
  return JSON.stringify({ exported: new Date().toISOString(), ...load() }, null, 2);
}

export function importAll(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("không phải bản xuất Q-FOX");
  state = {
    settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    progress: parsed.progress || {},
    srs: parsed.srs || {},
    records: { ...JSON.parse(JSON.stringify(DEFAULTS.records)), ...(parsed.records || {}) },
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
  emit("import");
  return counts();
}

export function reset() {
  state = JSON.parse(JSON.stringify(DEFAULTS));
  emit("reset");
}

export function counts() {
  const s = load();
  return { learned: Object.keys(s.progress).length,
           reviewed: Object.keys(s.srs).length,
           sessions: s.sessions.length };
}

export const storageKey = KEY;
load();
