"""Q-FOX -- the coordinate catalogue.

A *coordinate* is a lossy projection of the cube onto a small set of numbers
that is still **closed** under a move set: applying any legal move to a state
yields another state of the same coordinate, with no information about the
tracked part being lost.  Closure is what makes a breadth-first search over the
coordinate return *exact* move counts instead of estimates.

The one rule that decides everything here:

    A coordinate whose parts are slot-centric orientations (EDGE_ORIENT,
    CORNER_ORIENT) may only use masks that cannot move an untracked cubie
    into a tracked slot -- otherwise it is not closed.  Piece-centric parts
    (the *PERM and *PERM_ORIENT kinds) are closed under every move, because
    they record where a piece went rather than what a slot holds.

So blocks, pairs and layers are described by piece-centric parts with no
`allowed` restriction: the pieces may sit anywhere, the coordinate records
where, and the distance to "home" is exact.
"""
from __future__ import annotations

from typing import Any

from . import native as N
from .native import (corner_orient_all, corner_perm, corner_perm_orient,
                     edge_orient_all, edge_perm, edge_perm_orient, new_coord,
                     coord_size)

# --------------------------------------------------------------------------- #
# slot ids (frozen at import; the engine is already initialised by `native`)
# --------------------------------------------------------------------------- #
UR = N.slot_id("UR"); UF = N.slot_id("UF"); UL = N.slot_id("UL"); UB = N.slot_id("UB")
DR = N.slot_id("DR"); DF = N.slot_id("DF"); DL = N.slot_id("DL"); DB = N.slot_id("DB")
FR = N.slot_id("FR"); FL = N.slot_id("FL"); BR = N.slot_id("BR"); BL = N.slot_id("BL")

U_EDGES = (UR, UF, UL, UB)
D_EDGES = (DR, DF, DL, DB)
M_EDGES = (FR, FL, BR, BL)
E_EDGES = (FR, FL, BR, BL)          # Kociemba's UD-slice edges

# The engine's canonical corner names are ULF/URF/URB/ULB/DLF/DRF/DRB/DLB.
# `slot_id` also accepts the community spellings (UFL, UBR, DFR, DBL) through an
# alias table; these constants use the canonical form so the two never diverge.
ULF = N.slot_id("ULF"); URF = N.slot_id("URF"); URB = N.slot_id("URB")
ULB = N.slot_id("ULB")
DLF = N.slot_id("DLF"); DRF = N.slot_id("DRF"); DRB = N.slot_id("DRB")
DLB = N.slot_id("DLB")
# community-facing aliases, for code and docs that read like a cube tutorial
UFL, DFR, UBR, DBL = ULF, DRF, URB, DLB
U_CORNERS = (ULF, URF, URB, ULB)
D_CORNERS = (DLF, DRF, DRB, DLB)
ALL_CORNER_SLOTS = U_CORNERS + D_CORNERS
ALL_EDGE_SLOTS = U_EDGES + D_EDGES + M_EDGES

# user-facing names -> our geometric slot ids
PAIRS = {
    "FR": (FR, DRF), "FL": (FL, DLF), "BR": (BR, DRB), "BL": (BL, DLB),
}
# Q-FOX's first block lives on D+R+Back, so its pairs are named for slots
QFOX_PAIRS = {
    "DFR": (DF, DFR), "DRB": (DR, DRB), "BRU": (BR, UBR),
}
BLOCK_DR = {                     # the 2x2x3 block every Q-FOX solve builds first
    "edges": (DF, DR, BR, DB, FR),
    "corners": (DRF, DRB),
}


def slot_id(name: str) -> int:
    """Slot id for a user-facing piece name ("UFL", "FR", "D"...)."""
    return N.slot_id(name)


def slots(*names: str) -> list[int]:
    return [N.slot_id(n) for n in names]


_SEED_CACHE: dict[tuple, int] = {}
_SEED_BUDGET = 64          # RAM-cached seeded tables (they are all small)


def auf_seeds(cd: "CoordDef", turns: int = 4) -> list[int]:
    """The indices `cd`'s goal takes under the AUF rotations U, U2, U'.

    A stage may legally stop at any of them: recognising a last-layer case up to
    a pre-AUF and finishing with a U turn is what every real method does, and it
    shortens the search by one to two moves.  For coordinates that ignore the
    U layer the four images coincide and this collapses to a single seed.
    """
    out = []
    u = N.parse_move("U")
    for k in range(turns):
        c = N.Cube()
        if k:
            c.apply_moves([u] * k)
        out.append(cd.encode(c))
    return sorted(set(out))


class CoordDef:
    """A named coordinate: lazy construction, a table cache, and the two things
    a method actually needs from it -- an exact distance, and an optimal
    algorithm that realises that distance."""

    __slots__ = ("name", "parts", "_coord", "_size", "_target")

    def __init__(self, name: str, *parts: Any):
        self.name = name
        self.parts = tuple(parts)
        self._coord: int | None = None
        self._size: int | None = None
        self._target: int | None = None

    # -- engine handle ---------------------------------------------------
    @property
    def coord(self) -> int:
        if self._coord is None:
            self._coord = new_coord(*self.parts)
        return self._coord

    @property
    def size(self) -> int:
        if self._size is None:
            self._size = coord_size(self.coord)
        return self._size

    @property
    def target(self) -> int:
        """Index of the solved state."""
        if self._target is None:
            self._target = N.Cube().coord(self.coord)
        return self._target

    def fingerprint(self, mask: int, tag: str = "") -> str:
        return N.spec_fingerprint(*self.parts, mask=mask, tag=tag or self.name)

    # -- basic queries ---------------------------------------------------
    def encode(self, cube: N.Cube) -> int:
        return cube.coord(self.coord)

    def moves_to(self, cube: N.Cube, moves) -> int:
        """Index reached from `cube` by `moves`, staying inside the coordinate."""
        idx = self.encode(cube)
        for m in moves:
            idx = N.coord_apply_index(self.coord, idx, m)
            if idx < 0:
                raise ValueError(f"move {N.move_name(m)} leaves {self.name}")
        return idx

    def table(self, mask: int = N.MASK_OUTER, traced: bool = False,
              max_size: int = 1 << 26, seeds: list[int] | None = None,
              disk: bool = True) -> N.TableInfo | int:
        """Exact BFS distance table.

        With `seeds=None` the table is measured from solved and may be cached on
        disk.  With an explicit seed list it is measured from those seeds -- the
        trick that turns "the U layer is oriented" (a set of 128 states) into a
        single small exact table.  Seeded tables are cached in RAM only; they
        are never larger than a few kilobytes in this project.
        """
        if seeds is None and not traced:
            return N.build_table(self.coord, mask, self.fingerprint(mask),
                                 max_size, disk)
        if seeds is None:
            # a traced table is the algorithm generator: every state stores the
            # move that led to it, so the walk back to the seed IS an optimal
            # algorithm.  Traces are never written to disk, so they live in RAM.
            seeds = [self.target]
        key = (self.name, mask, traced, tuple(seeds))
        h = _SEED_CACHE.get(key)
        if h is None:
            h = N.build_table_seeded(self.coord, list(seeds), mask, max_size, traced)
            if len(_SEED_CACHE) >= _SEED_BUDGET:
                _SEED_CACHE.pop(next(iter(_SEED_CACHE)))
            _SEED_CACHE[key] = h
        return h

    def handle(self, mask: int = N.MASK_OUTER, traced: bool = False,
               max_size: int = 1 << 26, seeds: list[int] | None = None,
               disk: bool = True) -> int:
        """Like `table` but always returns the raw handle."""
        t = self.table(mask, traced, max_size, seeds, disk)
        return t.handle if isinstance(t, N.TableInfo) else t

    def distance(self, cube: N.Cube, mask: int = N.MASK_OUTER) -> int:
        """Exact optimal move count from `cube` to this coordinate's goal."""
        return N.table_lookup(self.handle(mask), self.encode(cube))

    def algorithm_to(self, cube: N.Cube, mask: int = N.MASK_OUTER) -> list[int]:
        """An optimal move sequence taking `cube` to this coordinate's goal.

        The traced table stores, for every state, the move that led *to* it from
        a seed -- so `table_path` yields seed -> state, and the algorithm we want
        is its inverse.  Optimal by construction, not by search: this single
        primitive generates every Q-FOX algorithm.
        """
        h = self.handle(mask, traced=True)
        return N.inverse_seq(N.table_path(h, self.encode(cube)))

    def reachable(self, mask: int = N.MASK_OUTER) -> int:
        t = self.table(mask)
        return t.reachable

    def __repr__(self) -> str:
        return f"<Coord {self.name} size={self.size:,}>"


# --------------------------------------------------------------------------- #
# whole-cube projections (closed under every mask, so always exact)
# --------------------------------------------------------------------------- #
EO = CoordDef("eo", edge_orient_all())
"""Edge orientation of all twelve edges: 2048 states (the last flip is implied)."""

CO = CoordDef("co", corner_orient_all())
"""Corner orientation of all eight corners: 2187 states (the last twist is implied)."""

CORNER_PERM_ALL = CoordDef("cp", corner_perm(ALL_CORNER_SLOTS))
EDGE_PERM_ALL = CoordDef("ep", edge_perm(ALL_EDGE_SLOTS))
EDGE_SLICE_UNORDERED = CoordDef("slice_ud", edge_perm(M_EDGES, unordered=True))
"""Kociemba's phase-1 coordinate: which four slots hold the middle-slice edges."""

FULL_SOLVE = CoordDef("full", edge_perm_orient(ALL_EDGE_SLOTS),
                      corner_perm_orient(ALL_CORNER_SLOTS))
"""43 quintillion states -- far too big to search; exists to be *encoded*."""

# --------------------------------------------------------------------------- #
# the last layer
# --------------------------------------------------------------------------- #
def _assert_u_layer_first() -> None:
    """EO/CO reduced encodings drop the LAST digit, so the U-layer slots must
    come first for the seeds below to mean "the U layer is oriented"."""
    assert sorted(ALL_EDGE_SLOTS[:4]) == sorted(U_EDGES), ALL_EDGE_SLOTS
    assert sorted(ALL_CORNER_SLOTS[:4]) == sorted(U_CORNERS), ALL_CORNER_SLOTS


_assert_u_layer_first()

EO_LL_SEEDS = [i for i in range(2048) if i % 16 == 0]     # 128 states
CO_LL_SEEDS = [i for i in range(2187) if i % 81 == 0]     #  81 states

OLL_ORIENT = CoordDef("oll_orient", edge_orient_all(), corner_orient_all())
"""The whole OLL pattern: 2048*2187 states, exact, and it ignores permutation --
so its distance is a legal, cheap lower bound on any orientation-first stage."""

LL_CORNERS = CoordDef("ll_corners", corner_perm_orient(U_CORNERS))
"""The four U corners home and correctly twisted: 8*7*6*5 * 3^4 = 136080."""

LL_EDGES = CoordDef("ll_edges", edge_perm_orient(U_EDGES))
"""The four U edges home and correctly flipped: 12*11*10*9 * 2^4 = 190080."""

LL_EDGES_CONF = CoordDef("ll_edges_conf", edge_perm_orient(U_EDGES, allowed=U_EDGES))
"""Confined to the U layer (384 states).  Exact ONLY for masks that keep the
last-layer edges in the last layer -- ZZ after EOLine, where the mask is
<U,L,R> and no U-layer edge can leave it."""

LL_EDGES_ONLY = CoordDef("ll_edges_only", edge_perm(U_EDGES))
LL_CORNERS_ONLY = CoordDef("ll_corners_only", corner_perm(U_CORNERS))

LL_PERM = CoordDef("ll_perm", corner_perm(U_CORNERS), edge_perm(U_EDGES))
"""Where the eight last-layer pieces are, orientation ignored:
8*7*6*5 * 12*11*10*9 = 1680 * 11880 = 19,958,400 states.

This is the heuristic that makes the last layer searchable.  LL_CORNERS alone
says "7 moves" for a PLL case whose real, first-two-layer-preserving answer is
11-13, and IDA* drowns in the gap.  Tracking both halves of the layer at once
lifts the bound to 9-11 and the search collapses to a few million nodes.
Closed under every move (piece-centric parts only), so the distance is exact."""

CMLL_POS_EO = CoordDef("cmll_pos_eo", corner_perm(U_CORNERS), edge_orient_all())
"""Last-layer corners *placed* (twist free) and the last-layer edges oriented:
1680 * 2048 = 3,440,640 states.

This is the heuristic that makes CMLL searchable.  Corner placement and edge
orientation are coupled -- one turn moves both -- so bounding them separately
(max of the two tables) leaves a gap of three or four moves and IDA* drowns in
it.  Bounding them together costs 3.4 MB and closes the gap to one or two.
Closed under every move: a piece-centric part times a slot-centric part over
all twelve edges.
"""


def cmll_seeds() -> list[int]:
    """Indices of `CMLL_POS_EO` where the corners are placed and the U-layer
    edges oriented -- the CMLL goal, twist apart, as a 128-state seed set."""
    return sorted(LL_CORNERS_ONLY.target + v * LL_CORNERS_ONLY.size
                  for v in EO_LL_SEEDS)


LL_FULL = CoordDef("ll_full", corner_perm_orient(U_CORNERS), edge_perm(U_EDGES))
"""Last-layer corners home and twisted, edges home: 136080 * 11880 = 1.6e9 --
used as an encoding, never as a table."""

# --------------------------------------------------------------------------- #
# first two layers, pairs and blocks (piece-centric => closed under all moves)
# --------------------------------------------------------------------------- #
CROSS = CoordDef("cross", edge_perm_orient(D_EDGES))
"""Bottom cross: 12*11*10*9 * 2^4 = 190080 states."""

EOLINE = CoordDef("eoline", edge_orient_all(), edge_perm([DF, DB]))
"""ZZ's EOLine: all edges oriented and DF/DB placed.  2048 * 132 states."""

PAIR = {k: CoordDef(f"pair_{k}", edge_perm_orient([v[0]]),
                    corner_perm_orient([v[1]])) for k, v in PAIRS.items()}
"""One F2L pair: 12*2 * 8*3 = 576 states.  The smallest useful coordinate, and
the reason a pair can be solved optimally in microseconds."""

QFOX_PAIR = {k: CoordDef(f"qpair_{k}", edge_perm_orient([v[0]]),
                         corner_perm_orient([v[1]])) for k, v in QFOX_PAIRS.items()}

PAIR_ALTS = tuple(PAIR[k] for k in ("FR", "FL", "BR", "BL"))
QFOX_PAIR_ALTS = tuple(QFOX_PAIR[k] for k in ("DFR", "DRB", "BRU"))

F2L_EDGE_PERM = CoordDef("f2l_edge_perm", edge_perm(D_EDGES + M_EDGES))
"""Where the eight first-two-layer edges are, orientation ignored:
12*11*10*9*8*7*6*5 = 19,958,400 states.  A much tighter prune for the
last-layer sweep than the cross and middle-edge tables separately, because it
sees both at once."""

MIDDLE_EDGES = CoordDef("middle_edges", edge_perm_orient(M_EDGES))
"""The four middle-layer edges home: 190080 states (beginner LBL step 3)."""

D_CORNERS_SOLVED = CoordDef("d_corners", corner_perm_orient(D_CORNERS))
"""The four bottom corners home: 8*7*6*5 * 3^4 = 136080 (beginner LBL step 2)."""

ROUX_FB = CoordDef("roux_fb",
                   edge_perm_orient([FL, DL, BL]),
                   corner_perm_orient([DLF, DLB]))
"""Roux's left 1x2x3 block: 1320*8 * 56*9 = 5,322,240 states."""

ROUX_SB = CoordDef("roux_sb",
                   edge_perm_orient([FR, BR, DR]),
                   corner_perm_orient([DRF, DRB]))
"""Roux's right 1x2x3 block: 5,322,240 states."""

ROUX_LSE_E = CoordDef("roux_lse_e", edge_perm_orient([UR, UF, UL, UB, DF, DB]))
"""The six edges Roux must place last, unconfined: 42,577,920 states (43 MB).
Exact under every mask, including M -- which the confined version is not."""

LSE = CoordDef("lse", edge_perm_orient([UR, UF, UL, UB, DF, DB],
                                       allowed=[UR, UF, UL, UB, DF, DB]))
"""Confined LSE (720*64 = 46080).  Exact for <M,U> only, but that is exactly
the mask Roux's last stage uses, and the table is 900x smaller."""

QFOX_BLOCK_E = CoordDef("qfox_block_e", edge_perm_orient(BLOCK_DR["edges"]))
"""Q-FOX's 2x2x3 edge part: 12*11*10*9*8 * 2^5 = 3,041,280 states."""

QFOX_BLOCK_C = CoordDef("qfox_block_c", corner_perm_orient(BLOCK_DR["corners"]))
"""Q-FOX's 2x2x3 corner part: 8*7 * 3^2 = 504 states."""

PETRUS_222 = CoordDef("petrus_222",
                      edge_perm_orient([DR, FR, DF]),
                      corner_perm_orient([DRF]))
"""Petrus 2x2x2 (the D-R-F octant): 1320*8 * 8*3 = 253,440 states."""

PETRUS_223_E = CoordDef("petrus_223_e",
                        edge_perm_orient([DR, FR, DF, BR, DB]))
PETRUS_223_C = CoordDef("petrus_223_c", corner_perm_orient([DRF, DRB]))
"""Petrus 2x2x3, split in two because the product would be 1.5e9 states."""

# --------------------------------------------------------------------------- #
# Kociemba's prune tables -- the classic reference implementation
# --------------------------------------------------------------------------- #
KOC_T1A = CoordDef("koc_t1a", edge_orient_all(), edge_perm(M_EDGES, unordered=True))
KOC_T1B = CoordDef("koc_t1b", corner_orient_all(), edge_perm(M_EDGES, unordered=True))
# Phase 2 tracks the eight UD edges *within the eight UD slots* and the four
# slice edges *within the slice*, not all twelve absolutely: 8!*4! = 967,680
# instead of 12!*4! = 1.1e10, which is over the 2^33 ceiling anyway.  The
# confinement is legal because the phase-2 mask <U,D,R2,L2,F2,B2> cannot move a
# UD edge into the slice or a slice edge out of it.
UD_EDGES = U_EDGES + D_EDGES
KOC_T2A = CoordDef("koc_t2a", edge_perm(UD_EDGES, allowed=UD_EDGES),
                   edge_perm(M_EDGES, allowed=M_EDGES))
KOC_T2B = CoordDef("koc_t2b", corner_perm(ALL_CORNER_SLOTS),
                   edge_perm(M_EDGES, allowed=M_EDGES))

# --------------------------------------------------------------------------- #
# a name -> coordinate index, so a table on disk says what it is
# --------------------------------------------------------------------------- #
BY_NAME: dict[str, CoordDef] = {}


def _collect() -> None:
    for nm, val in list(globals().items()):
        if isinstance(val, CoordDef):
            BY_NAME[val.name] = val
        elif isinstance(val, dict):
            for k, v in val.items():
                if isinstance(v, CoordDef):
                    BY_NAME[v.name] = v


_collect()
