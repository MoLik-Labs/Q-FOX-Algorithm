#!/usr/bin/env bash
# Run everything that can be checked without a human looking at it.
#
#     bash scripts/test_all.sh            # all of it
#     bash scripts/test_all.sh --quick    # skip the engine self-test rebuild
#
# Each layer proves a different agreement, and they are ordered so the cheapest
# and most fundamental runs first:
#
#   1. the C engine's own self-test         (notation, geometry, coordinates,
#                                            BFS vs IDA*, the last-layer book)
#   2. the method specifications            (a stage that cannot use the book,
#                                            a keep_from naming nothing)
#   3. the exported data vs the engine      (every algorithm replayed, every
#                                            curriculum re-derived, the schema)
#   4. the front-end modules                (ES-module syntax, the browser cube
#                                            vs the engine, the data layer, and
#                                            every route rendered and clicked)
#
# Exit code is 0 only if all of them pass.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
QUICK="${1:-}"
fail=0
report() { printf '%-46s %s\n' "$1" "$2"; }

step() {
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    report "$name" "ok"
  else
    report "$name" "FAIL"
    printf '%s\n' "$out" | sed 's/^/      /'
    fail=1
  fi
}

echo "Q-FOX — test layers"
echo

if [ "$QUICK" != "--quick" ]; then
  step "engine self-test (C)" bash -c './build/qfox >/tmp/qfox-selftest 2>&1; grep -q "self-test=0" /tmp/qfox-selftest || { cat /tmp/qfox-selftest; exit 1; }'
fi
step "method specifications" python3 scripts/check_methods.py
step "exported data vs engine" python3 scripts/validate_web_data.py
step "front end: ES-module syntax" node web/test/syntax.test.mjs
step "front end: cube model" node web/test/model.test.mjs
step "front end: data layer" node web/test/data.test.mjs
step "front end: import graph" node web/test/imports.test.mjs
step "front end: every route renders" node web/test/views.test.mjs

echo
if [ "$fail" -eq 0 ]; then
  echo "ALL LAYERS PASS"
else
  echo "SOME LAYERS FAILED"
fi
exit "$fail"
