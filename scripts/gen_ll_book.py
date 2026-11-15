#!/usr/bin/env python3
"""Grow the last-layer book.

    python3 scripts/gen_ll_book.py --max-len 13 [--budget 4e9] [--once]

Each pass enumerates every move word of one more length from the solved cube,
keeps only the nodes whose first two layers are home, and records the shortest
word per last-layer element.  Because the sweep is a complete depth-first
enumeration with an admissible prune, after a pass at bound B the recorded
length of every element of optimal length <= B is *exactly* optimal -- not a
good guess, a proof.

The book is saved after every completed depth, so the job can be stopped at any
time and resumed; it only ever improves.  That is the continuous
algorithm-generation loop: run it whenever there are spare cycles and the whole
method gets better without anyone touching the method code.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from qfox import coords as C                      # noqa: E402
from qfox import native as N                      # noqa: E402

BOOK_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "llbook.bin")
REPORT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "results", "ll_book.json")


def prune_tables():
    """Exact first-two-layer tables.  Their distances bound how far the block can
    be from home, which is what keeps the sweep inside a laptop's patience: the
    deepest bound is the one that decides, and `f2l_edge_perm` sees all eight
    edges at once instead of the cross and the middle layer separately."""
    out = []
    for cd in (C.CROSS, C.MIDDLE_EDGES, C.D_CORNERS_SOLVED, C.F2L_EDGE_PERM):
        info = cd.table()
        out.append((cd.coord, info.handle))
    return out


def histogram(book) -> dict[int, int]:
    h: dict[int, int] = {}
    for i in range(N.LL_N):
        n = book.len[i]
        if n != 255:
            h[n] = h.get(n, 0) + 1
    return dict(sorted(h.items()))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-len", type=int, default=13)
    ap.add_argument("--budget", type=float, default=0.0,
                    help="node budget per depth (0 = unlimited)")
    ap.add_argument("--seconds", type=float, default=0.0,
                    help="wall-clock budget for the whole run")
    ap.add_argument("--mask", default="outer", choices=("outer", "all"))
    ap.add_argument("--book", default=BOOK_PATH)
    ap.add_argument("--fresh", action="store_true")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.book), exist_ok=True)
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    book = N.QfLlBook()
    if not args.fresh and os.path.exists(args.book):
        if N.ll_book_load(book, args.book):
            print(f"resumed {args.book}: swept={book.swept} found={book.nfound}")
        else:
            print("book file unreadable, starting fresh")
            N.ll_book_init(book)
    else:
        N.ll_book_init(book)

    prune = prune_tables()
    mask = N.MASK_OUTER if args.mask == "outer" else N.MASK_ALL
    t_start = time.time()
    while book.swept < args.max_len:
        nxt = book.swept + 1
        t0 = time.time()
        swept = N.ll_sweep(book, nxt, mask, int(args.budget), prune)
        dt = time.time() - t0
        h = histogram(book)
        print(f"depth {nxt:>2}: swept={swept:>2} nodes={book.nodes:>13,} "
              f"found={book.nfound:>6}/{N.LL_N} ({100.0*book.nfound/N.LL_N:5.2f}%) "
              f"{dt:8.2f}s  new_at_depth={h.get(nxt, 0)}", flush=True)
        N.ll_book_save(book, args.book)
        with open(REPORT_PATH, "w") as f:
            json.dump({"swept": book.swept, "found": book.nfound,
                       "total": N.LL_N, "nodes": book.nodes,
                       "seconds": time.time() - t_start,
                       "mask": args.mask, "histogram": h}, f, indent=1)
        if swept < nxt:
            print("budget exhausted mid-depth; resume to continue", flush=True)
            break
        if args.seconds and time.time() - t_start > args.seconds:
            print("wall-clock budget reached", flush=True)
            break
    print(f"book: swept={book.swept} found={book.nfound}/{N.LL_N} "
          f"nodes={book.nodes:,} -> {args.book}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
