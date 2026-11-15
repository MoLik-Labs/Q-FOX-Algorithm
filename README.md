# Q-FOX

A 3×3 method laboratory. One C engine, a Python binding over it, thirteen solving
methods measured against each other on the same scrambles, a generated book of
every reachable last-layer position, and a static site that teaches the last
layer from data the engine produced and the tests re-check.

Nothing here is hand-written twice. The algorithms on the site come out of the
engine, the numbers in the tables come out of the benchmark, and both are
replayed against the C code before they ship.

```
engine/qfox.c          one translation unit: facelets, 54 moves, coordinates,
                       BFS + IDA*, the last-layer book, a self-test
qfox/                  the Python binding, the case families, the 13 methods
scripts/               generate, benchmark, validate, and test all of it
web/                   the site: 8 views, no build step, no dependencies
data/llbook.bin        35,586 last-layer positions with an optimal word each
```

## Quick start

```bash
bash engine/build.sh          # writes build/libqfox.so and build/qfox
./build/qfox                  # always runs the self-test; prints self-test=0
bash scripts/test_all.sh      # every layer, about 90 seconds
```

The site is static files that fetch their own JSON, so it needs a server — 
opening `index.html` from disk will not work, because browsers block `fetch()`
of local files:

```bash
python3 -m http.server 8080 --bind 0.0.0.0 --directory web
# then open http://localhost:8080
```

Python needs nothing installed: the binding is `ctypes` over `build/libqfox.so`,
and the tests are plain `node` with no packages.

## Solving something

The C binary takes a scramble and solves it with its own two-phase searcher:

```
$ ./build/qfox "R U R' U' D F2 B' L U2 D' R2 F B2 U L2 D' R' U2 F"
qfox-engine 0.1.0  self-test=0
scramble: 19 tokens, already solved=0
tables 8.67s  search 0.538s
phase1=11 phase2=10 raw=21
reduced=21: F U' F2 R B U B' L' B' L B F2 D' F2 B2 D' R2 L2 U L2 B2
verified solved: 1  htm=21 qtm=29 stm=21 etm=21
```

From Python, a method is a list of stages and a stage is a goal:

```python
from qfox import native as N
from qfox.alggen.book import Book
from qfox.methods import METHODS
from qfox.methods.base import StageCache

cache, book = StageCache(), Book()
scramble = "R U R' U' D F2 B' L U2 D' R2 F B2 U L2 D' R' U2 F"

trace = METHODS["Q-FOX/full"].solve(N.Cube.from_seq(scramble), cache, book=book)
solution = trace.solution()
print(N.format_seq(solution))            # 28 turns
print(N.seq_cost(N.HTM, solution))       # 28
print([s.name for s in trace.stages])    # the stages it went through
```

The first solve spends about a minute building coordinate tables; they are
cached in `data/tables/` (untracked) and every later solve is fast. `warm()` in
`qfox/benchmark` builds them up front so a benchmark does not charge the first
scramble for them.

## Thirteen methods, measured

`python3 scripts/bench.py --all --scrambles 20 --stages` solves the same 20
scrambles (seed `20260101`, length 25) with every method and writes
`results/benchmark.json`. All thirteen solve all twenty. Sorted by move count:

| method | solved | htm | stm | mean s | worst s |
|---|---|---|---|---|---|
| `Q-FOX/full` | 20/20 | 31.85 | 31.85 | 0.60 | 8.81 |
| `Q-FOX/222` | 20/20 | 36.05 | 36.05 | 3.37 | 13.08 |
| `Q-FOX/medium` | 20/20 | 39.45 | 39.45 | 1.27 | 7.71 |
| `Q-FOX/hard` | 20/20 | 40.10 | 36.55 | 0.17 | 0.84 |
| `Q-FOX/cross` | 20/20 | 42.25 | 42.25 | 3.55 | 10.92 |
| `Roux` | 20/20 | 42.55 | 37.75 | 7.67 | 100.49 |
| `Q-FOX/roux-2step` | 20/20 | 42.55 | 37.75 | 8.67 | 107.91 |
| `Q-FOX/zz` | 20/20 | 46.35 | 46.35 | 1.62 | 9.70 |
| `CFOP` | 20/20 | 50.30 | 50.30 | 3.22 | 14.96 |
| `Petrus` | 20/20 | 50.40 | 50.40 | 1.41 | 7.57 |
| `Q-FOX/easy` | 20/20 | 50.45 | 50.45 | 0.20 | 1.06 |
| `ZZ` | 20/20 | 58.10 | 58.10 | 4.24 | 9.43 |
| `LBL (beginner)` | 20/20 | 75.55 | 75.55 | 3.72 | 13.64 |

A method is data, not code: `CFOP`, `Roux`, `ZZ`, `Petrus`, `LBL` and the five
`Q-FOX` tiers are all the same six lines of stage definitions in
`qfox/methods/`, 84 stages in total. `scripts/check_methods.py` reads those
specifications and proves each one can actually run — a stage that could never
reach its book, a `keep_from` naming a stage that does not exist, a heuristic
that is not a lower bound — and then solves real scrambles with all thirteen.

The gap between `Q-FOX/full` (31.85) and `LBL` (75.55) is the same engine
searching the same cube; what changes is how much the method is allowed to
ask for at each step.

## The last-layer book

`data/llbook.bin` holds an optimal word for every last-layer position the sweep
reached: 62,208 positions exist (288 parity-matched corner/edge permutations ×
27 corner twists × 8 edge flips), and 35,586 of them — 57.2% — are within 13
moves, which is as deep as `scripts/gen_ll_book.py` has been run. A stage whose
goal is a set of book elements asks the engine to scan the ball first
(`qf_ll_scan`) and to meet in the middle second (`qf_ll_product`, exact out to
twice the swept depth), and only falls back to IDA* when both miss.

The book is what makes `Q-FOX/full`'s last layer average 12.35 moves in 446 ms,
and it is why a card can say a word is optimal within the swept depth instead of
guessing.

## The site

Eight views over `web/data/*.json`, hand-written ES modules, one CSS file, no
framework and no build:

| route | what it is |
|---|---|
| `#/` | the shape of the whole thing, and where to start |
| `#/levels` | four levels — 8 algorithms, 78, 42, or none — each with a curriculum |
| `#/algorithms` | all 196 cases, filterable, each with a spinning cube and two words |
| `#/trainer` | recognition drills with a Leitner box schedule kept in `localStorage` |
| `#/methods` | the thirteen methods as stage tables, with their benchmark |
| `#/benchmark` | the measured numbers, per stage |
| `#/engine` | the 54 moves, their costs and their facelet permutations |
| `#/about` | what this is and how it was checked |

196 cases across five families — OLL 58, PLL 22, CLL 43, COLL 43, ELL 30 — of
which 191 have something to learn and 31 carry the name a cuber would use. Each
card shows two words when two exist: the engine's shortest, and the one a chart
prints, because they are often not the same word and both are worth knowing.
Move counts on cards are **stm**, the notation people actually learn.

Every case is drawn in the alignment a cuber would hold it in. The orbit
representative the book lists is whichever alignment of the top layer sorts
first, which is arbitrary: the H-perm arrives as H followed by U2, and drawn
like that it looks like two swapped *corners*. `canonical_auf` records the turn
that put the case the right way round, and the validator turns it back to check.

## Generation, and what checks it

```bash
python3 scripts/gen_web_data.py        # engine -> web/data/*.json, about 30s
python3 scripts/validate_web_data.py   # six layers, about 25s
bash scripts/test_all.sh               # everything, about 90s
```

`scripts/test_all.sh` runs each layer in order, cheapest and most fundamental
first, and exits non-zero if any of them fails:

1. **engine self-test** — notation, geometry, coordinates, BFS against IDA*, the
   book; `./build/qfox` prints `self-test=0`.
2. **method specifications** — the 84 stages, 13 methods.
3. **exported data vs engine** — six layers in `validate_web_data.py`: the
   browser's cube geometry against all 54 engine move permutations; every
   published algorithm replayed; the same words judged again **by sticker colour
   alone**, so a bug in a coordinate or a goal has nowhere to hide; the alignment
   each case is drawn in; every curriculum re-derived from its own conditions;
   and the schema.
4. **front end** — ES-module syntax, the browser cube model against the engine
   (2091 checks), the data layer (4502), the import graph, and every route
   rendered and every button clicked under a hand-rolled DOM stub (337).

The layers are written to fail, and were made to. The data layers have been
mutation-tested by hand: a word shortened by one AUF, a case wearing another
case's name, a curriculum mean changed, an alignment lied about, a book index
pointing at the wrong position — each turns a layer red and the exit code
non-zero, and one of them (a word that leaves the corners home and the edges two
turns away) is caught *only* by the sticker layer, which is why it exists.

The front-end tests earned their place by failing first. The data layer found 58
real disagreements — a prime dropped from a wide turn by a regex that reused one
capture group across two branches, and a case's family stored as its label while
every lookup used its key, which made the trainer mark correct answers wrong.
The route layer found 25 more, including two views reading a field that does not
exist and five files that `node --check` had passed only because, without
`"type": "module"`, it was parsing ES modules as CommonJS.

## Conventions

- Facelets are `URFDLB`, 54 of them, centres at 4/13/22/31/40/49.
- 54 move ids: 18 outer, 9 slice, 18 wide, 9 rotations, `id = family * 3 + power`.
- Four move counts, because a slice turn is one move to a cuber and two to the
  engine: **htm** (outer turns), **qtm** (quarter turns), **stm** (every turn is
  one), **etm** (stm, but a slice turn costs two). Whole-solve benchmarks use
  outer turns only, so there htm and stm agree.
- Masks select move sets: `MASK_OUTER` 262143, `MASK_MU` 1835015 (Roux LSE),
  `MASK_ULR` 28735, `MASK_SLICE` 133955584.

## Layout

```
engine/    qfox.h qfox.c build.sh   the whole engine, one file, no dependencies
qfox/      native.py                ctypes binding, and an ABI guard
           coords.py                every coordinate: size, closure, encode
           alggen/                  case families, the book, the LL solver
           methods/                 base.py (Stage/Method), classic.py, qfox.py
           benchmark/               the harness behind results/benchmark.json
scripts/   gen_web_data.py          engine -> web/data
           validate_web_data.py     six layers over the exported data
           check_methods.py         the method specifications, and real solves
           bench.py gen_ll_book.py  benchmark, and the book sweep
           test_all.sh              all of it in order
web/       index.html assets/ data/ test/
results/   benchmark.json, benchmark_traces.json
data/      llbook.bin (tracked), tables/ (a cache, ignored)
```

## Credits

Made by [@its.fox_](https://instagram.com/its.fox_) — 
[github.com/MoLik-Labs/Q-FOX-Algorithm](https://github.com/MoLik-Labs/Q-FOX-Algorithm).

The engine, the coordinate set, the case families, the book, the methods and the
site are all this repository's own work; no solver, table or algorithm list was
taken from another project. Familiar algorithm names (Sune, H-perm, Ja-perm)
were checked by applying each published word to the case it claims to name and
keeping it only when the engine says the cube is finished.
