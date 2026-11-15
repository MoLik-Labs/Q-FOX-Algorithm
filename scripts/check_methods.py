#!/usr/bin/env python3
"""Audit the method specifications themselves.

A method is pure data -- a list of stages, each a goal, a mask, a set of
heuristics and the names of the earlier stages it must not disturb.  Data that
quietly disagrees with itself does not raise an error, it just makes a stage
search a much bigger space than it should, or answer a last layer with IDA*
when the book could have answered it in milliseconds.  Both happened here once:

* a last-layer stage that declares `alg_family` but not `ll_goal` cannot be
  answered by the book, so it fell back to IDA* and blew a 250M-node budget
  (one scramble in twenty went unsolved, and the worst case took 470 s);
* a `keep_from` naming a stage the method does not have silently keeps nothing,
  so the stage is free to destroy work the opening already did.

This script fails loudly on both, plus the other ways a stage spec can drift.

    python3 scripts/check_methods.py            # static audit, a second
    python3 scripts/check_methods.py --solve 2  # ... and solve 2 scrambles each
"""
from __future__ import annotations

import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from qfox import native as N                            # noqa: E402
from qfox.methods import METHODS                        # noqa: E402
from qfox.methods.base import StageCache                # noqa: E402

try:
    from qfox.alggen import llsolve as L
    LL_GOALS = set(L.GOALS)
except Exception:                                        # pragma: no cover
    LL_GOALS = set()


def audit() -> list[str]:
    """Static checks over every method.  Returns a list of problems."""
    bad: list[str] = []
    for name, m in METHODS.items():
        if m.name != name:
            bad.append(f"{name}: registered under the wrong key ({m.name})")
        seen: list[str] = []
        for i, st in enumerate(m.stages):
            where = f"{name}/{st.name or f'stage{i}'}"

            if not st.name:
                bad.append(f"{name}: stage {i} has no name")
            elif st.name in seen:
                bad.append(f"{where}: duplicate stage name")
            seen.append(st.name)

            if not st.goal:
                bad.append(f"{where}: no goal")

            # keep_from must name a stage this method actually ran earlier
            for ref in st.keep_from:
                if ref not in seen[:-1]:
                    bad.append(f"{where}: keep_from names {ref!r}, which is not "
                               f"an earlier stage of {name} -- nothing is kept")

            # a stage that publishes an algorithm family is a last-layer stage,
            # and a last-layer stage without ll_goal cannot use the book
            if st.alg_family and not st.ll_goal:
                bad.append(f"{where}: declares alg_family={st.alg_family!r} but no "
                           f"ll_goal, so the book can never answer it")
            if st.ll_goal and LL_GOALS and st.ll_goal not in LL_GOALS:
                bad.append(f"{where}: ll_goal={st.ll_goal!r} is not a known book goal "
                           f"({', '.join(sorted(LL_GOALS))})")

            if st.node_budget <= 0:
                bad.append(f"{where}: node_budget must be positive")
            if st.max_depth > N.SOL_MAX:
                bad.append(f"{where}: max_depth {st.max_depth} > QF_SOL_MAX {N.SOL_MAX}")
            if st.mask == 0:
                bad.append(f"{where}: mask allows no moves at all")
            if st.alternatives and len(st.goal) != len(st.alternatives[0]):
                bad.append(f"{where}: alternatives do not match the goal shape")
            if st.align_centres and st.mask & N.MASK_SLICE == 0:
                bad.append(f"{where}: align_centres is pointless without slice moves")

            for g in tuple(st.goal) + tuple(st.keep) + tuple(st.heur):
                if getattr(g, "coord", None) is None:
                    bad.append(f"{where}: a goal has no coordinate")
    return bad


def solve_check(n: int, seed: int = 20260101, length: int = 25) -> list[str]:
    """Solve `n` scrambles with every method and replay each solution."""
    from qfox.benchmark import scramble_set, warm

    bad: list[str] = []
    scrs = scramble_set(n, seed, length)
    book = None
    try:
        from qfox.alggen import book as B
        book = B.Book()
        if not book.loaded:
            print("  (data/llbook.bin missing -- solving without the book)")
            book = None
    except Exception as exc:                             # pragma: no cover
        print(f"  (book unavailable: {exc})")

    cache = StageCache()
    for name, m in METHODS.items():
        t0 = time.time()
        warm(m, cache)
        for i, scr in enumerate(scrs):
            cube = N.Cube.from_seq(scr)
            tr = m.solve(cube, cache, book=book)
            replay = cube.copy()
            replay.apply_moves(tr.solution())
            if not tr.ok:
                bad.append(f"{name}: scramble {i} not solved -- a stage failed")
            elif not replay.is_solved:
                bad.append(f"{name}: scramble {i} solution does not replay to solved")
            elif N.centres(replay) != list(range(6)):
                bad.append(f"{name}: scramble {i} leaves the centres permuted")
        print(f"  {name:<22} {n} scrambles  {time.time() - t0:7.2f}s")
    return bad


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--solve", type=int, default=0, metavar="N",
                    help="also solve N scrambles with every method and replay them")
    ap.add_argument("--seed", type=int, default=20260101)
    ap.add_argument("--length", type=int, default=25)
    args = ap.parse_args(argv)

    print(f"auditing {len(METHODS)} methods, "
          f"{sum(len(m.stages) for m in METHODS.values())} stages")
    bad = audit()
    print(f"  specs        {'ok' if not bad else 'FAIL'}")
    for line in bad[:20]:
        print(f"      {line}")

    if args.solve:
        print(f"  solving {args.solve} scramble(s) per method, seed {args.seed}")
        bad += solve_check(args.solve, args.seed, args.length)

    print(f"\n{'PASS -- every method spec is consistent' if not bad else f'FAIL ({len(bad)} problems)'}")
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
