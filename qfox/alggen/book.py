"""The algorithm book: canonical case -> provably shortest algorithm.

Two independent machines meet here.

`qfox.alggen.cases` enumerates the case families by symmetry and reproduces the
published counts (57 OLL, 21 PLL, 42 CMLL, 29 ELL).  It says *which* cases
exist but nothing about how to solve them.

The engine's last-layer book sweeps every move word from solved, keeps the nodes
whose first two layers are home, and records the shortest word for each of the
62208 last-layer elements.  Inverting a word is the algorithm for that element,
and because the sweep is a complete enumeration with an admissible prune, the
recorded length is exactly optimal for every element it has reached.

This module is the bridge: it turns an abstract case into a real cube
(`qf_cube_from_pmap`), asks the book for that cube's element, and hands back a
move sequence that is verified to solve the case.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from .. import coords as C
from .. import native as N
from . import cases as K

IDENT = (0, 1, 2, 3)
ZERO4 = (0, 0, 0, 0)

BOOK_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "data", "llbook.bin")

# how each family spells one of its states, and what the rest of the last layer
# is assumed to be doing
_STATE_SHAPE = {
    "OLL": ("te", "tc"),        # orientation only, permutation solved
    "PLL": ("se", "sc"),        # permutation only, orientation solved
    "CLL": ("sc", "tc"),        # corners only, edges free (they are solved here)
    "COLL": ("sc", "tc"),
    "ELL": ("se", "te"),        # edges only, corners solved
}


def full_state(family: str, state) -> tuple:
    """Expand a family-specific state into the full (se, te, sc, tc) form."""
    a, b = _STATE_SHAPE[family]
    se, te, sc, tc = list(IDENT), list(ZERO4), list(IDENT), list(ZERO4)
    if a == "se":
        se = list(state[0])
    elif a == "te":
        te = list(state[0])
    elif a == "sc":
        sc = list(state[0])
    if b == "se":
        se = list(state[1])
    elif b == "te":
        te = list(state[1])
    elif b == "sc":
        sc = list(state[1])
    elif b == "tc":
        tc = list(state[1])
    return tuple(se), tuple(te), tuple(sc), tuple(tc)


def cube_of(state: tuple) -> N.Cube:
    """The cube whose first two layers are solved and whose last layer is `state`.

    Slot order is the engine's; `state` is indexed in `U_EDGES` / `U_CORNERS`
    order, exactly as `cases.py` defines it, so the two can never drift apart.
    """
    se, te, sc, tc = state
    piece = list(range(N.SLOTS))
    orient = [0] * N.SLOTS
    for i, slot in enumerate(C.U_EDGES):
        piece[slot] = C.U_EDGES[se[i]]
        orient[slot] = te[i]
    for i, slot in enumerate(C.U_CORNERS):
        piece[slot] = C.U_CORNERS[sc[i]]
        orient[slot] = tc[i]
    return N.cube_from_pmap(piece, orient)


def element_of(state: tuple) -> int:
    """The book's element id for a last-layer state."""
    return N.ll_encode(cube_of(state))


@dataclass
class Algorithm:
    """One derived algorithm, with everything needed to trust and use it."""
    family: str
    case_index: int
    element: int
    moves: list[int]
    length: int
    orbit_size: int
    state: tuple
    verified: bool = False
    optimal_within: int = 0        # the depth the book has proved so far
    names: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return N.format_seq(self.moves)

    def as_dict(self) -> dict:
        return {"family": self.family, "case": self.case_index,
                "element": self.element, "algorithm": self.text,
                "moves": list(self.moves), "length": self.length,
                "orbit_size": self.orbit_size, "verified": self.verified,
                "optimal_within": self.optimal_within,
                "state": [list(x) for x in self.state],
                "names": self.names}


class Book:
    """The last-layer book on disk, plus the case tables derived from it."""

    def __init__(self, path: str = BOOK_PATH):
        self.path = path
        self._b = N.QfLlBook()
        N.ll_book_init(self._b)
        self.loaded = False
        if os.path.exists(path):
            self.loaded = N.ll_book_load(self._b, path)
        self.swept = self._b.swept
        self.found = self._b.nfound

    # -- raw access ------------------------------------------------------
    def length(self, element: int) -> int:
        """Optimal length of `element`, or -1 if the sweep has not reached it.

        A negative id means "not a last-layer element at all" (the first two
        layers are not home), which must never be allowed to index the array --
        Python would silently read the last entry instead.
        """
        if element is None or element < 0:
            return -1
        n = self._b.len[element]
        return -1 if n == 255 else n

    def algorithm(self, element: int) -> list[int] | None:
        if element is None or element < 0:
            return None
        return N.ll_algorithm(self._b, element)

    def histogram(self) -> dict[int, int]:
        h: dict[int, int] = {}
        for i in range(N.LL_N):
            n = self._b.len[i]
            if n != 255:
                h[n] = h.get(n, 0) + 1
        return dict(sorted(h.items()))

    def stats(self) -> dict:
        return {"swept": self.swept, "found": self.found, "total": N.LL_N,
                "coverage": round(self.found / N.LL_N, 4),
                "histogram": self.histogram()}

    # -- cases -----------------------------------------------------------
    def case_elements(self, family: str) -> list[tuple]:
        """(canonical state, element id, orbit size) for every case of a family."""
        fam = K.FAMILIES[family]()
        out = []
        for i, rep in enumerate(sorted(fam.orbits)):
            st = full_state(family, rep)
            out.append((st, element_of(st), len(fam.orbits[rep]), rep))
        return out

    def build(self, family: str, verify: bool = True) -> list[Algorithm]:
        """Every case of a family as an Algorithm, shortest known first."""
        algs: list[Algorithm] = []
        for i, (st, el, orb, rep) in enumerate(self.case_elements(family)):
            mv = self.algorithm(el)
            a = Algorithm(family=family, case_index=i, element=el,
                          moves=mv or [], length=len(mv) if mv else -1,
                          orbit_size=orb, state=st, optimal_within=self.swept)
            if mv and verify:
                c = cube_of(st)
                c.apply_moves(mv)
                a.verified = bool(c.is_solved)
                if not a.verified:
                    raise AssertionError(
                        f"{family} case {i}: {a.text} does not solve its state")
            algs.append(a)
        return algs

    def summary(self, family: str) -> dict:
        algs = self.build(family)
        have = [a for a in algs if a.length >= 0]
        trivial = [a for a in algs if a.length == 0]
        return {
            "family": family,
            "cases": len(algs),
            "non_trivial": len(algs) - len(trivial),
            "with_algorithm": len(have),
            "missing": len(algs) - len(have),
            "all_verified": all(a.verified for a in have),
            "longest": max((a.length for a in have), default=0),
            "mean_length": round(sum(a.length for a in have) / len(have), 2)
            if have else None,
            "optimal_within": self.swept,
        }


def export(book: Book, out_dir: str) -> dict:
    """Write one JSON file per family: the deliverable the web app reads."""
    os.makedirs(out_dir, exist_ok=True)
    report = {"swept": book.swept, "families": {}}
    for fam in ("OLL", "PLL", "CLL", "COLL", "ELL"):
        algs = book.build(fam)
        path = os.path.join(out_dir, f"{fam.lower()}.json")
        with open(path, "w") as f:
            json.dump({"family": fam, "generated_by": "qfox.alggen",
                       "book_swept": book.swept,
                       "algorithms": [a.as_dict() for a in algs]}, f, indent=1)
        report["families"][fam] = book.summary(fam)
        report["families"][fam]["path"] = os.path.relpath(path, out_dir)
    with open(os.path.join(out_dir, "index.json"), "w") as f:
        json.dump(report, f, indent=1)
    return report
