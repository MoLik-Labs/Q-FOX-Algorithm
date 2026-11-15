// Walk the ES-module graph from app.js and check every named import really is
// exported by the module it comes from.  A missing export is a hard load error
// in the browser -- the whole page goes blank -- and `node --check` cannot see
// it, because that only parses one file at a time.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const ROOT = fileURLToPath(new URL("../assets/js", import.meta.url));

/**
 * The ES-module graph.  A missing export is a hard load error in the browser --
 * the whole page goes blank and the console says why only after the fact -- and
 * `node --check` cannot see it, because that parses one file at a time.  So the
 * graph is walked here instead: every specifier must resolve to a file, and
 * every named import must exist as an export of that file.
 */
const files = new Map();
const problems = [];

function exportsOf(path) {
  if (files.has(path)) return files.get(path);
  const src = readFileSync(path, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm))
    for (const part of m[1].split(",")) {
      const t = part.trim(); if (!t) continue;
      names.add((t.split(/\s+as\s+/)[1] || t).trim());
    }
  if (/^export\s+default/m.test(src)) names.add("default");
  for (const m of src.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s*,\s*\{/gm)) names.add(m[1]);
  files.set(path, names);
  return names;
}

function importsOf(path) {
  const src = readFileSync(path, "utf8");
  const out = [];
  const re = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']/gs;
  for (const m of src.matchAll(re)) out.push({ clause: m[1], spec: m[2], line: src.slice(0, m.index).split("\n").length });
  for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g))
    out.push({ clause: "", spec: m[1], line: src.slice(0, m.index).split("\n").length });
  for (const m of src.matchAll(/^import\s+["']([^"']+)["']/gm))
    out.push({ clause: "", spec: m[1], line: src.slice(0, m.index).split("\n").length });
  return out;
}

const seen = new Set();
function walk(path) {
  if (seen.has(path)) return;
  seen.add(path);
  for (const { clause, spec, line } of importsOf(path)) {
    if (!spec.startsWith(".")) { problems.push(`${relative(ROOT, path)}:${line} bare specifier "${spec}" — nothing to resolve it on a static host`); continue; }
    const target = resolve(dirname(path), spec);
    if (!existsSync(target)) { problems.push(`${relative(ROOT, path)}:${line} missing file "${spec}"`); continue; }
    const have = exportsOf(target);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const t = part.trim(); if (!t) continue;
        const want = t.split(/\s+as\s+/)[0].trim();
        if (!have.has(want)) problems.push(`${relative(ROOT, path)}:${line} "${want}" is not exported by ${relative(ROOT, target)}`);
      }
    }
    if (/^\s*\*\s+as\s+/.test(clause)) { /* namespace import, anything goes */ }
    else if (/^\s*[A-Za-z_$][\w$]*\s*$/.test(clause) && !have.has("default"))
      problems.push(`${relative(ROOT, path)}:${line} default import from ${relative(ROOT, target)}, which has no default export`);
    walk(target);
  }
}

walk(resolve(ROOT, "app.js"));
console.log(`walked ${seen.size} modules`);
if (problems.length) { console.log("PROBLEMS:"); for (const p of problems) console.log("  " + p); process.exit(1); }
console.log("every import resolves and every named import exists");
