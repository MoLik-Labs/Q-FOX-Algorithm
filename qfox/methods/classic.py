"""The reference methods, written as pure stage data.

Nothing here knows how to solve a cube.  Each method is a list of `Stage`
records; `Method.solve` runs them through the same IDA* with the same exact
coordinate tables.  That is the point: CFOP, Roux, ZZ, Petrus and beginner LBL
become comparable numbers instead of comparable opinions, and Q-FOX is measured
against them with the same ruler.

Every goal below is a *closed* coordinate, so every stage distance is provably
optimal for that stage (not for the whole solve -- see docs/METHOD.md).
"""
from __future__ import annotations

from .. import coords as C
from .. import native as N
from .base import Goal, Method, Stage

# --------------------------------------------------------------------------- #
# shared goals
# --------------------------------------------------------------------------- #
CROSS = Goal(C.CROSS)
EO_LL = Goal(C.EO, seeds=C.EO_LL_SEEDS)      # the four U edges oriented
CO_LL = Goal(C.CO, seeds=C.CO_LL_SEEDS)      # the four U corners oriented
OLL_DONE = (EO_LL, CO_LL)                    # == OLL, permutation free
LL_CORNERS = Goal(C.LL_CORNERS)
LL_EDGES = Goal(C.LL_EDGES)
PLL_DONE = (LL_CORNERS, LL_EDGES)            # corners + edges of the U layer home

# The permutation of all eight last-layer pieces at once, as an AUF orbit.  It is
# the single most important table in the project: alone, LL_CORNERS bounds a PLL
# case at 7 moves when the first-two-layer-preserving truth is 11-13, and IDA*
# burns its whole budget inside that gap.  Together the bound is 9-11 and the
# search finishes in a few million nodes.
LL_PERM_AUF = Goal(C.LL_PERM, auf=True)
LL_PERM_H = Goal(C.LL_PERM)

PAIRS = {k: Goal(v) for k, v in C.PAIR.items()}          # FR, FL, BR, BL
PAIR_ALTS = tuple((PAIRS[k],) for k in ("FR", "FL", "BR", "BL"))
F2L_STAGES = "cross f1 f2 f3 f4"

OLL_ORIENT_H = Goal(C.OLL_ORIENT)            # 4.5M-state exact OLL heuristic
LL_EXACT = PLL_DONE                          # both halves of the U layer home


def auf_stage(keep: tuple[str, ...], mask: int = N.MASK_OUTER) -> Stage:
    """The AUF a last-layer stage was allowed to leave behind.

    Solving the last layer "up to a U turn" is what every real method does and
    what makes the search short, but the cube is not solved until that turn is
    made.  Its heuristic is exact, so this costs one U turn and no search.
    """
    return Stage("auf", goal=LL_EXACT, keep_from=keep, heur=LL_EXACT, mask=mask,
                 intuitive=True, algs=0, note="the final AUF")
# Corner placement and edge orientation are coupled, so bounding them together
# (3.4M states) instead of separately is what makes CMLL searchable at all.
CMLL_H = Goal(C.CMLL_POS_EO, seeds=C.cmll_seeds())

# An F2L pair on its own is a 576-state coordinate and its distance is 5-8, but
# inserting the LAST pair without disturbing the other three costs more, and a
# heuristic that cannot see the other pairs leaves IDA* to find that out the hard
# way.  These two tables see all eight first-two-layer edges at once, and all
# four bottom corners, so the bound stays within a move or two of the truth.
F2L_H = (Goal(C.F2L_EDGE_PERM), Goal(C.D_CORNERS_SOLVED))
F2L_KEEP = ("cross", "f1", "f2", "f3", "f4")


def _pair_stage(n: int, keep: tuple[str, ...], last: bool = False) -> Stage:
    """One F2L slot.  All four pairs are offered as alternatives and the engine
    keeps whichever is cheapest, which is what a human does by looking ahead.

    Only the last slot may use the whole-F2L heuristic: a bound on "all eight
    edges home" is a lower bound for a stage that has to place the eighth edge,
    and an overestimate for one that does not, and an overestimate silently
    makes IDA* fail.
    """
    return Stage(f"f{n}", goal=PAIR_ALTS[0], alternatives=PAIR_ALTS,
                 keep_from=keep, heur=F2L_H if last else (), node_budget=120_000_000,
                 note="cheapest of the four remaining pairs")


def f2l_stages(first_keep: tuple[str, ...] = ("cross",)) -> list[Stage]:
    out = []
    keep = tuple(first_keep)
    for i in range(1, 5):
        out.append(_pair_stage(i, keep, last=(i == 4)))
        keep = keep + (f"f{i}",)
    return out


# --------------------------------------------------------------------------- #
# CFOP -- cross, F2L, OLL, PLL (Fridrich, ~1997)
# --------------------------------------------------------------------------- #
CFOP = Method(
    name="CFOP",
    family="layer-by-layer, cross first",
    description=("Cross on the bottom, four F2L pairs, orient the last layer, "
                 "permute the last layer. The speedcubing default and the "
                 "baseline every other method is measured against."),
    reference="Fridrich / Kociemba / Pochmann / Vandebergh (cross, F2L, OLL, PLL)",
    algs_by_tier={
        # easy:   2-look OLL (9) + 2-look PLL (6) + 4 intuitive F2L cases
        # medium: full OLL (57) + 4-look last layer extras
        # hard:   OLL 57 + PLL 21 + F2L algs
        # full:   + COLL/ZBLL-style extras
        "easy": 9 + 6,
        "medium": 57 + 21,
        "hard": 57 + 21 + 12,
        "full": 57 + 21 + 42 + 29,
    },
    stages=[
        Stage("cross", goal=(CROSS,), heur=(CROSS,),
              note="4 bottom edges, oriented"),
        *f2l_stages(),
        Stage("oll", goal=OLL_DONE, keep_from=F2L_KEEP,
              heur=(OLL_ORIENT_H,), alg_family="OLL", algs=57, ll_goal="oll",
              note="U layer oriented, permutation free (AUF is free here)"),
        Stage("pll", goal=(LL_PERM_AUF,), keep_from=F2L_KEEP + ("oll",),
              heur=(LL_PERM_AUF,), alg_family="PLL", algs=21, ll_goal="pll",
              note="U layer solved, up to a final AUF"),
        auf_stage(F2L_KEEP + ("oll",)),
    ],
)

# --------------------------------------------------------------------------- #
# Roux -- two 1x2x3 blocks, CMLL, LSE (Gilles Roux, 2003)
# --------------------------------------------------------------------------- #
ROUX_FB = Goal(C.ROUX_FB)
ROUX_SB = Goal(C.ROUX_SB)
ROUX_LSE = Goal(C.LSE)

ROUX = Method(
    name="Roux",
    family="blockbuilding",
    description=("Two opposite 1x2x3 blocks, then the last-layer corners with "
                 "the U edges oriented (CMLL), then the last six edges using "
                 "only <M,U>. Fewest moves of the mainstream methods."),
    reference="Gilles Roux, 2003",
    algs_by_tier={"easy": 2 + 4, "medium": 42 + 6, "hard": 42 + 10, "full": 42 + 29},
    stages=[
        Stage("fb", goal=(ROUX_FB,), heur=(ROUX_FB,),
              note="left 1x2x3 (FL, DL, BL edges + DLF, DLB corners)"),
        Stage("sb", goal=(ROUX_SB,), keep_from=("fb",), heur=(ROUX_SB,),
              note="right 1x2x3"),
        Stage("cmll", goal=(LL_CORNERS, EO_LL), keep_from=("fb", "sb"),
              heur=(CMLL_H, LL_CORNERS, EO_LL, OLL_ORIENT_H), alg_family="CLL",
              algs=42, ll_goal="cmll", node_budget=250_000_000,
              note="U corners solved and U edges oriented"),
        Stage("lse", goal=(ROUX_LSE,), mask=N.MASK_MU, heur=(ROUX_LSE,),
              keep_from=("cmll",), intuitive=True, algs=0, align_centres=True,
              note="last six edges with <M,U> only; the corners CMLL solved stay "
                   "solved, so the net AUF has to come out even"),
    ],
)

# --------------------------------------------------------------------------- #
# ZZ -- EOLine, F2L without F/B, last layer (Zbigniew Zborowski, 2011)
# --------------------------------------------------------------------------- #
EOLINE = Goal(C.EOLINE)
ZZ_F2L = ("eoline", "z1", "z2", "z3", "z4")

ZZ = Method(
    name="ZZ",
    family="edge-orientation first",
    description=("Orient every edge and place DF/DB first. After that the whole "
                 "solve runs in <U,R,L> -- no F or B turns -- and the last layer "
                 "needs no edge orientation step."),
    reference="Zbigniew Zborowski, 2011",
    algs_by_tier={"easy": 8 + 6, "medium": 42 + 21, "hard": 42 + 21 + 12,
                  "full": 42 + 21 + 29},
    stages=[
        Stage("eoline", goal=(EOLINE,), heur=(EOLINE,),
              note="all 12 edges oriented, DF and DB home"),
        *[Stage(f"z{i}", goal=PAIR_ALTS[0], alternatives=PAIR_ALTS,
                keep_from=("eoline",) + tuple(f"z{j}" for j in range(1, i)),
                mask=N.MASK_ULR, heur=F2L_H if i == 4 else (),
                node_budget=120_000_000,
                note="F2L with <U,R,L> only") for i in range(1, 5)],
        Stage("zco", goal=(CO_LL,), keep_from=ZZ_F2L,
              mask=N.MASK_ULR, heur=(CO_LL,), alg_family="OLL", algs=42,
              ll_goal="oll",
              note="edges are already oriented, so only the corners twist"),
        Stage("zpll", goal=(LL_PERM_AUF,), keep_from=ZZ_F2L + ("zco",),
              mask=N.MASK_ULR, heur=(LL_PERM_AUF,), alg_family="PLL", algs=21,
              ll_goal="pll"),
        auf_stage(ZZ_F2L + ("zco",), mask=N.MASK_ULR),
    ],
)

# --------------------------------------------------------------------------- #
# Petrus -- 2x2x2, 2x2x3, edge orientation, finish F2L, last layer (1981)
# --------------------------------------------------------------------------- #
P222 = Goal(C.PETRUS_222)
P223 = (Goal(C.PETRUS_223_E), Goal(C.PETRUS_223_C))
EO_ALL = Goal(C.EO)
DL_EDGE = Goal(C.CoordDef("dl_edge", C.edge_perm_orient([C.DL])))

PETRUS_KEEP = ("p223", "eo", "dl", "p4a", "p4b")

PETRUS = Method(
    name="Petrus",
    family="blockbuilding",
    description=("Build a 2x2x2, expand to 2x2x3, orient every remaining edge "
                 "while the block stays free to turn, finish the first two "
                 "layers, then the last layer. The classic move-efficiency "
                 "method and the ancestor of blockbuilding."),
    reference="Lars Petrus, 1981",
    algs_by_tier={"easy": 0, "medium": 6, "hard": 21 + 9, "full": 21 + 9 + 29},
    stages=[
        Stage("p222", goal=(P222,), heur=(P222,), note="2x2x2 on D-R-F"),
        Stage("p223", goal=P223, keep_from=("p222",), heur=P223,
              note="expand to 2x2x3"),
        Stage("eo", goal=(EO_ALL,), keep_from=("p223",), heur=(EO_ALL,),
              intuitive=True, algs=0,
              note="orient all edges; the block is never broken"),
        Stage("dl", goal=(DL_EDGE,), keep_from=("p223", "eo"), heur=(DL_EDGE,),
              note="the last cross edge"),
        Stage("p4a", goal=PAIR_ALTS[0], alternatives=PAIR_ALTS,
              keep_from=("p223", "eo", "dl"),
              note="one of the two open pairs"),
        Stage("p4b", goal=PAIR_ALTS[1], alternatives=PAIR_ALTS,
              keep_from=("p223", "eo", "dl", "p4a"), heur=F2L_H,
              note="the last pair"),
        Stage("pco", goal=(CO_LL,), keep_from=PETRUS_KEEP, heur=(CO_LL,),
              ll_goal="oll", alg_family="OLL", algs=0,
              note="twist the U corners (edges were oriented in step 3)"),
        Stage("pcp", goal=(LL_PERM_AUF,), keep_from=PETRUS_KEEP + ("pco", "eo"),
              heur=(LL_PERM_AUF,), alg_family="PLL", algs=21, ll_goal="pll",
              note="place the U corners and edges together"),
        auf_stage(PETRUS_KEEP + ("pco", "eo")),
    ],
)

# --------------------------------------------------------------------------- #
# beginner layer-by-layer -- the method every tutorial teaches
# --------------------------------------------------------------------------- #
D_CORNER = {k: Goal(C.CoordDef(f"dcorner_{k}", C.corner_perm_orient([v])))
            for k, v in (("DLF", C.DLF), ("DRF", C.DRF), ("DRB", C.DRB), ("DLB", C.DLB))}
M_EDGE = {k: Goal(C.CoordDef(f"medge_{k}", C.edge_perm_orient([v])))
          for k, v in (("FR", C.FR), ("FL", C.FL), ("BR", C.BR), ("BL", C.BL))}

LBL_KEEP = "cross d1 d2 d3 d4 m1 m2 m3 m4"

LBL = Method(
    name="LBL (beginner)",
    family="layer-by-layer, tutorial",
    description=("Daisy/cross, bottom corners, middle edges, then four last-layer "
                 "steps. The method every beginner learns, included so the "
                 "benchmark has a real floor to stand on."),
    reference="any 3x3 beginner tutorial",
    algs_by_tier={"easy": 8, "medium": 12, "hard": 16, "full": 16},
    stages=[
        Stage("cross", goal=(CROSS,), heur=(CROSS,)),
        *[Stage(f"d{i}", goal=(tuple(D_CORNER.values())[0],),
                alternatives=tuple((v,) for v in D_CORNER.values()),
                keep_from=("cross",) + tuple(f"d{j}" for j in range(1, i)),
                heur=(Goal(C.D_CORNERS_SOLVED),) if i == 4 else ()
                ) for i in range(1, 5)],
        *[Stage(f"m{i}", goal=(tuple(M_EDGE.values())[0],),
                alternatives=tuple((v,) for v in M_EDGE.values()),
                keep_from=("cross", "d1", "d2", "d3", "d4") +
                          tuple(f"m{j}" for j in range(1, i)),
                # the four bottom corners are pinned by d1..d4, so that bound is
                # admissible here; all eight edges only at the last slot
                heur=(Goal(C.D_CORNERS_SOLVED),) + (F2L_H if i == 4 else ())
                ) for i in range(1, 5)],
        Stage("leo", goal=(EO_LL,), keep_from=tuple(LBL_KEEP.split()),
              heur=(EO_LL,), note="make the U cross"),
        Stage("lco", goal=(CO_LL,), keep_from=tuple(LBL_KEEP.split()) + ("leo",),
              heur=(CO_LL,), note="twist the U corners"),
        Stage("lcp", goal=(LL_CORNERS,),
              keep_from=tuple(LBL_KEEP.split()) + ("leo", "lco"),
              heur=(LL_CORNERS,), note="place the U corners"),
        Stage("lep", goal=(LL_EDGES,),
              keep_from=tuple(LBL_KEEP.split()) + ("leo", "lco", "lcp"),
              heur=(LL_EDGES,), note="cycle the U edges"),
    ],
)

METHODS: dict[str, Method] = {m.name: m for m in (CFOP, ROUX, ZZ, PETRUS, LBL)}
