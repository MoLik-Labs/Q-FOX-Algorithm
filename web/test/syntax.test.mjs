/**
 * Parse every front-end module as an ES module.
 *
 *     node web/test/syntax.test.mjs
 *
 * `node --check assets/js/foo.js` is not enough and quietly is not what it
 * looks like: with no "type": "module" in scope Node parses a `.js` file as
 * CommonJS, and a file whose first `import` is a syntax error in that grammar
 * can still be reported as fine while the browser refuses to load it.  Copying
 * each module to a `.mjs` name forces the ES-module grammar, which is the one
 * the browser actually uses.
 *
 * This found three unbalanced-parenthesis errors that every other check had
 * waved through, in code paths no data test could reach.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const JS = join(HERE, "..", "assets", "js");

function modules(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? modules(join(dir, e.name))
      : e.name.endsWith(".js") ? [join(dir, e.name)] : []);
}

const files = modules(JS);
const tmp = mkdtempSync(join(tmpdir(), "qfox-syntax-"));
let bad = 0;

for (const f of files) {
  const copy = join(tmp, relative(JS, f).replace(/[\/\\]/g, "_") + ".mjs");
  writeFileSync(copy, readFileSync(f));
  try {
    execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" });
  } catch (err) {
    bad++;
    const msg = String(err.stderr || err.message).split("\n").slice(0, 6).join("\n");
    console.error(`FAIL ${relative(join(HERE, "..", ".."), f)}\n${msg}`);
  }
}

rmSync(tmp, { recursive: true, force: true });

if (bad) {
  console.error(`\n${bad} of ${files.length} modules do not parse as ES modules`);
  process.exit(1);
}
console.log(`PASS ${files.length} modules parse as ES modules`);
