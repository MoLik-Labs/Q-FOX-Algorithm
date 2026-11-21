---
name: qfox-optimization-loop
description: >-
  Q-FOX-tuned benchmark-guided optimization loop. Drives repeated measured
  improvements to a 3x3 solver's solve speed (htm/qtm/stm), the number of
  formulas a human must memorise per tier, and last-layer book coverage. Use
  for every Q-FOX change: new method variants, deeper book sweeps, opening
  re-splits, recognition-curriculum edits, or engine tuning. Adapted from ECC's
  benchmark-optimization-loop for the Q-FOX repository's metrics and constraints.
license: MIT
metadata:
  origin: ECC (benchmark-optimization-loop), adapted for Q-FOX
  adapted-by: Q-FOX project
---

# Q-FOX Optimization Loop

A bounded, measured loop for improving the Q-FOX 3x3 method. The Q-FOX goal is
always the same three things at once: **fastest solve**, **fewest formulas a
human memorises**, **provably-correct last layer**. This skill turns a user's
"make it faster / remember less" request into a benchmark-guided loop with
reproducible commands.

## When to Activate

- Any Q-FOX change that should be measured, not guessed: a new tier, a deeper
  book sweep, an opening re-split, a recognition-curriculum trim, an engine
  tuning.
- Establishing the baseline and plan before a Q-FOX optimization push.
- Reuse the existing `scripts/test_all.sh` for a one-off fix; do not add a
  search loop without a reason.

## Q-FOX Metrics (freeze these before optimizing)

Q-FOX has three primary metrics. Never optimise one by silently breaking another.

1. **Solve speed — `htm` (half-turn metric), mean over 20 scrambles.**
   Direction: lower is better. This is the headline number the user sees.
   Secondary: `qtm`, `stm`, and engine wall-seconds (`seconds`).
2. **Formulas to memorise — `distinct_algorithms` per tier.**
   Direction: lower is better. The recognition curriculum a learner must
   remember. Hard bounds per tier:
   `easy < 140`, `medium < 100`, `tiny < 100`, `low < 80`, `flow < 50`.
3. **Book coverage — `book.found / 62208` last-layer elements.**
   Direction: higher is better. The book answers a last-layer stage in one
   optimal step; coverage limits how often a stage falls back to search.

## Hard Constraints (always stay green)

A variant is **inadmissible** — reject it, no matter how fast — if any of these
fail:

- **Every tier solves 20/20 scrambles** (`solved == scrambles` for each method
  in the benchmark).
- **`scripts/test_all.sh` → ALL LAYERS PASS** (engine, method specs, data,
  frontend).
- **`scripts/validate_web_data.py` → PASS** (geometry, algorithms, stickers,
  alignment, curriculum, schema all agree with the engine).
- **Formula counts under the per-tier bounds** above.
- **Every published algorithm is verified**: applying it reaches the goal
  (`cases[].verified == true`, `auf >= 0`).

## Required Baseline

Do not optimise until this exists, reusing prior evidence only when comparable:

- The user goal (which tier, which metric, which direction).
- The frozen metric set (htm + formulas + coverage) and their bounds.
- The current baseline: run `python3 scripts/bench.py --methods "<names>"
  --scrambles 20` and record htm means; run `python3 scripts/gen_web_data.py`
  and record `distinct_algorithms` per tier and `book.found`.
- The search budget: max variants, max wall-time per variant, max book-sweep
  budget (the book sweep is expensive — always pass `--budget`).

## Loop (Q-FOX command map)

1. **Measure the baseline.**
   ```
   python3 scripts/bench.py --methods "Q-FOX,Q-FOX easy,Q-FOX medium,Q-FOX tiny,Q-FOX low,Q-FOX flow" --scrambles 20
   python3 scripts/gen_web_data.py
   python3 scripts/validate_web_data.py
   bash scripts/test_all.sh
   ```
2. **Identify the gap** from the benchmark output vs the user goal.
3. **Generate variants** — one hypothesis each (a new stage split, a deeper
   sweep, a curriculum trim). Each variant changes one thing.
4. **Run variants** with the same 20 scrambles and the same seed under
   comparable conditions. Record failures, timeouts, retries, costs.
5. **Reject** any variant that fails a hard constraint above.
6. **Promote** the best measured admissible variant against the agreed
   objective (lowest htm at the lowest formula count that still solves).
7. **Codify** the winner: the stage spec in `qfox/methods/qfox.py`, the
   curriculum in `scripts/gen_web_data.py`, the data regenerated into
   `web/data/`, the tier view in `web/assets/js/views/qfox.js`.
8. **Re-run** the baseline and the winner, confirm the delta, run the
   independent acceptance check (`test_all.sh` + `validate_web_data.py`) before
   declaring the goal met.

## Variant Ledger

Keep a ledger for every run. Failures stay in the denominator.

```text
Variant | Hypothesis | Command | htm | algs | solved | hard-constraints | Decision
baseline | current | bench --scrambles 20 | 31.85 | 21 | 20/20 | PASS | baseline
v-oll-cmll | merge OLL+CMLL step | ... | ... | ... | ... | ... | keep/reject
```

## Book-Sweep Discipline

The last-layer book is the expensive resource. Rules:

- Always sweep with an explicit `--budget`; deep unlimited sweeps timeout.
- A resumable sweep (`--budget N`) that hits the budget without finishing is
  **not** a result — re-run with a larger budget, or record the partial
  coverage as a limitation.
- Coverage gains are sub-linear: doubling the budget rarely doubles coverage.
  Stop sweeping when the marginal coverage gain stops paying for the move
  improvement it enables.
- Never claim a coverage number from a run that did not save.

## Promotion Gate

A variant becomes the new default only when:

- All hard constraints pass (`test_all.sh` + `validate_web_data.py` green).
- The htm delta is repeated, not a single lucky run.
- Formula counts stay under bounds.
- The change is committed to the branch and pushed.
- The summary states exact commands, versions, measurements, and limits.

Report **benchmark speed**, **independent acceptance**, and **user outcome**
separately. This skill does not grant release authority.

## Related Skills

- [benchmark-optimization-loop](../benchmark-optimization-loop/SKILL.md) — the
  generic ECC source this was adapted from.
- [agentic-engineering](../agentic-engineering/SKILL.md) — eval-first execution
  and 15-minute verifiable units for the implementation work.
- [systematic-debugging](../systematic-debugging/SKILL.md) — root cause before
  any fix when a variant misbehaves.
- [verification-before-completion](../verification-before-completion/SKILL.md) —
  no completion claims without fresh `test_all.sh` + `validate_web_data.py`
  evidence in the same turn.
