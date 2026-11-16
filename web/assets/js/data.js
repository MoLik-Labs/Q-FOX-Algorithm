/**
 * Tải sáu file JSON đã sinh và lập chỉ mục cho các view.
 *
 * Không có gì ở đây được suy ra ngoài những gì `scripts/gen_web_data.py` đã
 * tính sẵn: module này chỉ định dạng lại bản xuất để một view có thể hỏi
 * "mọi bài PLL có tên chứa 'perm'" mà không cần đi dò cây.
 */
import { createModel } from "./model.js";

const FILES = ["engine", "algorithms", "methods", "levels", "book", "benchmark"];

export const FAMILY_ORDER = ["OLL", "PLL", "CLL", "COLL", "ELL"];

export const data = {
  ready: false,
  engine: null, algorithms: null, methods: null, levels: null, book: null,
  benchmark: null, model: null,
  cases: [], casesByKey: new Map(), families: [], levelsList: [], methodsList: [],
  benchByMethod: new Map(), check: null,
};

export async function loadAll(base = "data") {
  const found = {};
  await Promise.all(FILES.map(async (name) => {
    const res = await fetch(`${base}/${name}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${name}.json -> HTTP ${res.status}`);
    found[name] = await res.json();
  }));
  return hydrate(found);
}

export function hydrate(found) {
  Object.assign(data, found);
  data.model = createModel(found.engine);
  data.check = data.model.selfCheck();

  data.families = FAMILY_ORDER
    .filter((f) => found.algorithms.families[f])
    .map((f) => found.algorithms.families[f]);

  data.cases = [];
  for (const fam of data.families) {
    for (const c of fam.list) {
      // `family` là TRUYỀN KHÓA -- "CLL", thứ mọi tra cứu lập chỉ mục theo
      // (algorithms.families, GOAL_TEXT, goalReached, casesOf, URL).
      // `familyLabel` là thứ người đọc thấy -- "CLL / CMLL". Trộn hai thứ này
      // sẽ đẩy goalReached() xuống nhánh dự phòng và đánh giá một câu trả
      // lời đúng là sai, nên chúng giữ là hai field riêng.
      const row = { ...c, family: fam.key, familyLabel: fam.label,
                    familyTitle: fam.title, level: fam.level };
      // Một bài có tối đa hai từ, và cả hai đều được generator đối chiếu với
      // mục tiêu: từ ngắn nhất của chính engine, và thuật toán quen thuộc
      // khi engine nhận ra bài. Thẻ bài hiển thị từ ngắn hơn và giữ từ kia
      // cách một phím, vì "ngắn nhất" và "cái mọi người học" không phải
      // lúc nào cũng là cùng một từ -- H-perm là 7 động tác với slice M và
      // 10 động tác nếu không dùng.
      // Độ dài tính theo stm, một cú slice là một động tác: đó là cách
      // ký hiệu speedcubing đếm, nên con số khớp với số người trích dẫn.
      const cand = [];
      if (row.moves && row.moves.length) {
        cand.push({ kind: "engine", text: row.algorithm, moves: row.moves,
                    count: row.stm, label: "Ngắn nhất của engine" });
      }
      if (row.teach) {
        cand.push({ kind: "textbook", text: row.teach.algorithm, moves: row.teach.moves,
                    count: row.teach.stm, label: `Quen thuộc — ${row.teach.name}`,
                    name: row.teach.name });
      }
      cand.sort((a, b) => a.count - b.count || a.moves.length - b.moves.length);
      row.words = cand;
      row.primary = cand[0] || null;
      row.alt = cand[1] || null;
      row.text = row.primary ? row.primary.text : "";
      row.tokens = row.primary ? row.primary.moves : [];
      row.count = row.primary ? row.primary.count : 0;
      row.source = row.primary ? row.primary.kind : "none";
      data.cases.push(row);
      data.casesByKey.set(row.key, row);
    }
  }

  data.levelsList = found.levels.levels;
  data.methodsList = Object.values(found.methods.methods);
  data.benchByMethod = new Map(
    (found.benchmark.results || []).map((r) => [r.method, r]));

  data.ready = true;
  return data;
}

/* ------------------------------------------------------------------- tra cứu */

export const caseByKey = (key) => data.casesByKey.get(key);

export const family = (label) => data.algorithms.families[label];

export function casesOf(label) {
  const f = data.algorithms.families[label];
  return f ? f.list.map((c) => data.casesByKey.get(c.key)) : [];
}

export const level = (key) => data.levelsList.find((l) => l.key === key);
export const method = (name) => data.methods.methods[name];
export const bench = (name) => data.benchByMethod.get(name);

/** Mọi khóa bài mà chương trình học của một cấp độ yêu cầu, theo thứ tự chương. */
export function levelKeys(key) {
  const lv = level(key);
  if (!lv) return [];
  return (lv.curriculum || []).flatMap((item) => item.cases.map((c) => c.key));
}

/** Mọi mục chương của mọi cấp độ có chứa một khóa bài. */
export function setsContaining(key) {
  const out = [];
  for (const lv of data.levelsList) {
    for (const item of lv.curriculum || []) {
      if (item.cases.some((c) => c.key === key)) out.push({ level: lv, item });
    }
  }
  return out;
}

/* --------------------------------------------------------------------- tìm */

function haystack(c) {
  const d = c.desc || {};
  return [
    c.family, c.familyLabel, c.familyTitle, ...(c.names || []), c.algorithm || "",
    (c.teach && c.teach.name) || "", (c.teach && c.teach.algorithm) || "",
    d.pattern || "", d.permutation || "", d.edges || "", d.corners || "",
    d.edge_cycles || "", d.corner_cycles || "", `phần tử ${c.element}`,
    `bài ${c.i}`, c.htm, c.stm, c.count, c.via,
  ].join(" ").toLowerCase();
}

let searchIndex = null;
export function search(q, cases = data.cases) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return cases;
  if (!searchIndex) {
    searchIndex = new Map(data.cases.map((c) => [c.key, haystack(c)]));
  }
  const words = query.split(/\s+/);
  return cases.filter((c) => {
    const hay = searchIndex.get(c.key) || haystack(c);
    return words.every((w) => hay.includes(w));
  });
}

/* ------------------------------------------------------------------- tổng quan */

export function totals() {
  const a = data.algorithms;
  const b = data.book;
  const benchRows = data.benchmark.results || [];
  const solvedAll = benchRows.filter((r) => r.solved === r.scrambles).length;
  const fastest = benchRows.slice().sort((x, y) => x.seconds.mean - y.seconds.mean)[0];
  const shortest = benchRows.slice().sort((x, y) => x.htm.mean - y.htm.mean)[0];
  return {
    cases: a.cases,
    toLearn: a.to_learn,
    named: a.named,
    families: data.families.length,
    methods: data.methodsList.length,
    levels: data.levelsList.length,
    moves: data.engine.moves.length,
    elements: b.elements,
    swept: b.swept,
    coverage: b.coverage,
    exactTo: b.reachable_by,
    scrambles: (data.benchmark.meta || {}).scrambles || 0,
    methodsSolvedAll: solvedAll,
    fastest, shortest,
  };
}

/* --------------------------------------------------------------- bản từ đó */

/** Thuật toán một thẻ bài hiển thị: từ quen thuộc khi engine đã kiểm chứng. */
export const word = (row) => (row && row.text) || "";

/** Các token của nó, dưới dạng id động tác engine. */
export const wordTokens = (row) => (row && row.tokens) || [];

/** Độ dài theo chỉ số mọi người trích dẫn: một cú slice là một động tác. */
export const wordCount = (row) => (row && row.count) || 0;

export const METRIC = "moves";
export const METRIC_HINT =
  "Đếm theo cách ký hiệu speedcubing đếm: mọi cú xoay lớp, kể cả slice, là " +
  "một động tác (engine gọi là stm). htm của engine tính một cú slice là " +
  "hai, đó là lý do hai con số khác nhau ở các thuật toán dùng slice M.";
