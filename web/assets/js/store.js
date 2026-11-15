/**
 * Everything the site remembers, in localStorage, under one versioned key.
 *
 * Three kinds of state:
 *   settings  — how the cube is drawn and how fast turns animate
 *   progress  — which cases you have marked as learned, per case key
 *   srs       — the trainer's review schedule (boxes, due times, streaks)
 *
 * Nothing here talks to the network, so a session on Cloudflare Pages works
 * offline after the first load and no account is needed.
 */

const KEY = "qfox.web.v1";

const DEFAULTS = {
  settings: {
    view: "3d",            // "3d" | "net"
    speed: 220,            // ms per quarter turn
    autoPlay: true,
    highlight: "ll",       // "ll" | "none"
    yaw: -34,
    pitch: -24,
    notation: "standard",  // "standard" | "wide"
    reducedMotion: false,
  },
  progress: {},            // case key -> { learned, ts }
  srs: {},                 // case key -> { box, due, seen, right, wrong, streak }
  sessions: [],            // last few trainer sessions, newest first
};

let state = null;
let listeners = [];

function load() {
  if (state) return state;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = null; }
  const parsed = raw ? JSON.parse(raw) : {};
  state = {
    settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    progress: parsed.progress || {},
    srs: parsed.srs || {},
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
  return state;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  }, 120);
}

export function onChange(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}
function emit(what) {
  save();
  for (const fn of listeners) { try { fn(what, state); } catch { /* a view died */ } }
}

/* ---------------------------------------------------------------- settings */

export const settings = () => load().settings;

export function setSetting(name, value) {
  load().settings[name] = value;
  emit("settings");
}

/* ---------------------------------------------------------------- progress */

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

/* ------------------------------------------------- spaced review (the trainer) */

/** Box intervals in minutes: 0 = new, 5 = learned today, up to 30 days. */
const BOX_MINUTES = [0, 10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 30];
export const MAX_BOX = BOX_MINUTES.length - 1;

export function card(key) {
  const c = load().srs[key];
  return c || { box: 0, due: 0, seen: 0, right: 0, wrong: 0, streak: 0, last: null };
}

/**
 * Record a review.
 * @param {string} key   case key
 * @param {number} grade 2 = knew it, 1 = hesitated, 0 = missed
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

/** The order the trainer should ask in: overdue first, then new, then future. */
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

export function logSession(row) {
  const sessions = load().sessions;
  sessions.unshift({ ...row, at: Date.now() });
  if (sessions.length > 40) sessions.length = 40;
  emit("sessions");
}

export const recentSessions = () => load().sessions;

/* ------------------------------------------------------------- whole store */

export function exportAll() {
  return JSON.stringify({ exported: new Date().toISOString(), ...load() }, null, 2);
}

export function importAll(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("not a Q-FOX export");
  state = {
    settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    progress: parsed.progress || {},
    srs: parsed.srs || {},
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
