#!/usr/bin/env python3
"""Run the benchmark.

    python3 scripts/bench.py --all --scrambles 20
    python3 scripts/bench.py --methods "Q-FOX/blocks,CFOP,Roux" --scrambles 50
    python3 scripts/bench.py --all --scrambles 10 --stages      # per-stage table

Every method sees exactly the same scrambles and exactly the same coordinate
tables, and every solution is verified by applying it to the scrambled cube
before its move count is believed.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from qfox import native as N                       # noqa: E402
from qfox.alggen import book as B                  # noqa: E402
from qfox.benchmark import compare, run, save, scramble_set   # noqa: E402
from qfox.methods import classic, qfox             # noqa: E402
from qfox.methods.base import StageCache           # noqa: E402

ALL = list(classic.METHODS.values()) + list(qfox.VARIANTS.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--methods", default="", help="comma separated names")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--scrambles", type=int, default=10)
    ap.add_argument("--seed", type=int, default=20260101)
    ap.add_argument("--length", type=int, default=25)
    ap.add_argument("--stages", action="store_true", help="print the per-stage table")
    ap.add_argument("--no-book", action="store_true")
    ap.add_argument("--out", default=os.path.join("results", "benchmark.json"))
    ap.add_argument("--traces", action="store_true", help="keep per-solve traces")
    args = ap.parse_args()

    methods = ALL if args.all else [
        m for m in ALL if m.name in [x.strip() for x in args.methods.split(",") if x.strip()]]
    if not methods:
        print("no methods matched; known names:")
        for m in ALL:
            print("  ", m.name)
        return 1

    scrs = scramble_set(args.scrambles, args.seed, args.length)
    print(f"{len(scrs)} scrambles, seed {args.seed}, length {args.length}")
    for i, s in enumerate(scrs[:3]):
        print(f"  [{i}] {s}")

    book = None
    if not args.no_book:
        book = B.Book()
        st = book.stats()
        print(f"book: swept to {st['swept']}, {st['found']}/{st['total']} "
              f"last-layer elements ({100*st['coverage']:.1f}%)")

    results = []
    cache = StageCache()
    for m in methods:
        t0 = time.time()
        r = run(m, scrs, cache, book=book, keep_traces=args.traces)
        print(f"{m.name:<22} solved {r.solved}/{r.scrambles} "
              f"htm {r.htm_mean:6.2f}  {time.time()-t0:7.2f}s", flush=True)
        results.append(r)

    print()
    print(compare(results))
    print(f"\ncoordinate tables: {cache.build_seconds:.2f}s to build, "
          f"{len(cache.built)} tables")

    if args.stages:
        for r in results:
            print(f"\n--- {r.method} ---")
            for name, d in r.stages.items():
                print(f"  {name:<10} htm {d['htm_mean']:6.2f}  "
                      f"{d['seconds_mean']*1000:8.1f}ms  "
                      f"nodes {d['nodes_mean']:>12,.0f}  {d['via']}")

    meta = {"scrambles": args.scrambles, "seed": args.seed,
            "scramble_length": args.length,
            "book_swept": book.swept if book else None,
            "book_found": book.found if book else None,
            "table_seconds": round(cache.build_seconds, 2)}
    path = save(results, args.out, meta)
    print(f"\nwrote {path}")

    if args.traces:
        tpath = os.path.join("results", "benchmark_traces.json")
        import json
        os.makedirs(os.path.dirname(tpath), exist_ok=True)
        with open(tpath, "w") as f:
            json.dump({r.method: r.traces for r in results}, f, indent=1)
        print(f"wrote {tpath}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
