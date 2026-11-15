"""Q-FOX: the method this repository exists to build.

The design argument, in three steps.

1. **Every human method pays for its recognition.** CFOP splits the last layer
   into OLL and PLL, Roux into CMLL and LSE, because a human cannot look at a
   cube and name one of 15552 cases. Every split costs moves: two optimal steps
   are always at least as long as one, and here the difference is large.

2. **The engine does not have that limit.** The last-layer book holds the
   provably shortest first-two-layer-preserving word for each of the 62208
   last-layer elements, so a last layer can be finished in a single optimal step
   with a table lookup -- no search, no recognition, microseconds.

3. **Memorisation is a dial, not a wall.** The same book answers a family of
   goal sets: the four AUF images of solved (one-shot last layer), the 288
   oriented elements (OLL), the 12 corner-solved elements (CMLL), and so on. A
   tier is only a choice of goal sets, so the method does not change as the
   solver learns more.

The opening matters too, and for a specific reason: the book's elements are
defined with the *whole* first two layers home. Roux's two 1x2x3 blocks leave
DF and DB for LSE, so they do not qualify -- which is exactly why Roux must
split its last layer. A 2x2x3 block plus the opposite 1x2x3 block covers all
twelve pieces (Petrus's block, then the L-side slab), costs about the same
number of moves, and unlocks the one-step last layer.

Every variant below shares that opening and differs only in the last layer, so
the benchmark measures the tier dial itself rather than two changes at once.
"""
from __future__ import annotations

from .. import coords as C
from .. import native as N
from .base import Goal, Method, Stage
from .classic import (CMLL_H, CO_LL, EO_LL, F2L_H, LL_CORNERS, LL_EDGES,
                      LL_PERM_AUF, OLL_ORIENT_H, PAIR_ALTS, auf_stage)

# --------------------------------------------------------------------------- #
# the Q-FOX opening: 2x2x3 on D-R-B, then the 1x2x3 slab on D-L-F
# --------------------------------------------------------------------------- #
B223 = (Goal(C.PETRUS_223_E), Goal(C.PETRUS_223_C))
B123 = Goal(C.ROUX_FB)
B222 = Goal(C.PETRUS_222)

OPENING = [
    Stage("b223", goal=B223, heur=B223,
          note="2x2x3 block: DR FR DF BR DB edges, DRF DRB corners"),
    Stage("b123", goal=(B123,), keep_from=("b223",), heur=(B123,),
          note="the opposite 1x2x3: FL DL BL edges, DLF DLB corners"),
]
F2L_KEEP = ("b223", "b123")

# The Roux-style opening, kept as a control: two 1x2x3 blocks.  It is the most
# move-efficient way to build ten pieces, but it leaves DF and DB, so its last
# layer has to be split.
ROUX_OPENING = [
    Stage("fb", goal=(Goal(C.ROUX_FB),), heur=(Goal(C.ROUX_FB),),
          note="left 1x2x3 block"),
    Stage("sb", goal=(Goal(C.ROUX_SB),), keep_from=("fb",),
          heur=(Goal(C.ROUX_SB),), note="right 1x2x3 block"),
]

# --------------------------------------------------------------------------- #
# last layers
# --------------------------------------------------------------------------- #
LL_ONE_GOAL = (Goal(C.LL_PERM, auf=True), EO_LL, CO_LL)
"""The whole last layer, up to a final AUF.  Positions come from LL_PERM (the
AUF orbit of "all eight pieces home"), orientation from the two seeded tables;
together they are exactly "the last layer is solved, possibly rotated"."""


def ll_one(keep: tuple[str, ...] = F2L_KEEP) -> list[Stage]:
    """The whole last layer in one optimal step, then the AUF it may leave."""
    return [
        Stage("ll", goal=LL_ONE_GOAL, keep_from=keep,
              heur=(LL_PERM_AUF,), ll_goal="solved", algs=0, alg_family="LL",
              note="the whole last layer in one provably optimal step"),
        auf_stage(keep + ("ll",)),
    ]


def ll_oll_pll() -> list[Stage]:
    return [
        Stage("oll", goal=(EO_LL, CO_LL), keep_from=F2L_KEEP,
              heur=(OLL_ORIENT_H,), ll_goal="oll", alg_family="OLL", algs=57,
              note="orient the last layer, permutation free"),
        Stage("pll", goal=(LL_PERM_AUF,), keep_from=F2L_KEEP + ("oll",),
              heur=(LL_PERM_AUF,), ll_goal="pll", alg_family="PLL", algs=21,
              note="permute the last layer, up to a final AUF"),
        auf_stage(F2L_KEEP + ("oll",)),
    ]


def ll_cmll_lse() -> list[Stage]:
    return [
        Stage("cmll", goal=(LL_CORNERS, EO_LL), keep_from=F2L_KEEP,
              heur=(CMLL_H, LL_CORNERS, EO_LL, OLL_ORIENT_H), ll_goal="cmll",
              alg_family="CLL", algs=42, node_budget=250_000_000,
              note="solve the last-layer corners, keep the edges oriented"),
        Stage("lse", goal=(Goal(C.LSE),), mask=N.MASK_MU, heur=(Goal(C.LSE),),
              keep_from=("cmll",), intuitive=True, algs=0, align_centres=True,
              note="the last six edges with <M,U> only"),
    ]


def ll_four_look() -> list[Stage]:
    return [
        Stage("leo", goal=(EO_LL,), keep_from=F2L_KEEP, heur=(EO_LL,), algs=2,
              note="make the U cross"),
        Stage("lco", goal=(CO_LL,), keep_from=F2L_KEEP + ("leo",), heur=(CO_LL,),
              algs=2, note="twist the U corners"),
        Stage("lcp", goal=(LL_CORNERS,), keep_from=F2L_KEEP + ("leo", "lco"),
              heur=(LL_CORNERS,), ll_goal="cmll", algs=2,
              note="place the U corners"),
        Stage("lep", goal=(LL_EDGES,), keep_from=F2L_KEEP + ("leo", "lco", "lcp"),
              heur=(LL_EDGES,), ll_goal="ell", algs=2, note="cycle the U edges"),
    ]


TIERS = {
    "easy": (ll_four_look, {"easy": 8, "medium": 8, "hard": 8, "full": 8},
             "four looks at the last layer: 8 algorithms, the tutorial shape"),
    "medium": (ll_oll_pll, {"easy": 8, "medium": 78, "hard": 78, "full": 78},
               "OLL then PLL: 78 algorithms, the CFOP-shaped last layer"),
    "hard": (ll_cmll_lse, {"easy": 8, "medium": 42, "hard": 42, "full": 42},
             "CMLL then LSE: 42 algorithms, the Roux-shaped last layer"),
    "full": (ll_one, {"easy": 8, "medium": 78, "hard": 42, "full": 0},
             "one step, no algorithms: the book names the case"),
}


def qfox(tier: str = "full") -> Method:
    """Q-FOX at a memorisation tier. Same opening, different last layer."""
    builder, algs, note = TIERS[tier]
    return Method(
        name=f"Q-FOX/{tier}",
        family="Q-FOX",
        description=("A 2x2x3 block, the opposite 1x2x3 block, and then "
                     + note + "."),
        reference="derived: blockbuilding + the last-layer book",
        algs_by_tier=algs,
        stages=[*OPENING, *builder()],
    )


# --------------------------------------------------------------------------- #
# variants that change the opening instead of the last layer
# --------------------------------------------------------------------------- #
def _pairs(keep0: tuple[str, ...], names: tuple[str, ...],
           mask: int = N.MASK_OUTER) -> list[Stage]:
    out, keep = [], tuple(keep0)
    for i, nm in enumerate(names):
        out.append(Stage(nm, goal=PAIR_ALTS[0], alternatives=PAIR_ALTS,
                         keep_from=keep, mask=mask, node_budget=120_000_000,
                         heur=F2L_H if i == len(names) - 1 else (),
                         note="cheapest of the remaining pairs"))
        keep = keep + (nm,)
    return out


CFOP_KEEP = ("cross", "f1", "f2", "f3", "f4")

QFOX_CROSS = Method(
    name="Q-FOX/cross",
    family="Q-FOX-variant",
    description=("CFOP's opening -- cross and four pairs -- with Q-FOX's one-step "
                 "last layer. Isolates what the opening is worth."),
    reference="derived",
    algs_by_tier={"full": 0},
    stages=[
        Stage("cross", goal=(Goal(C.CROSS),), heur=(Goal(C.CROSS),)),
        *_pairs(("cross",), ("f1", "f2", "f3", "f4")),
        *ll_one(CFOP_KEEP),
    ],
)

QFOX_ZZ = Method(
    name="Q-FOX/zz",
    family="Q-FOX-variant",
    description=("EOLine, four pairs with <U,R,L> only, then the one-step last "
                 "layer. The edges are oriented from the first stage."),
    reference="derived",
    algs_by_tier={"full": 0},
    stages=[
        Stage("eoline", goal=(Goal(C.EOLINE),), heur=(Goal(C.EOLINE),)),
        *_pairs(("eoline",), ("z1", "z2", "z3", "z4"), mask=N.MASK_ULR),
        *ll_one(("eoline", "z1", "z2", "z3", "z4")),
    ],
)

QFOX_222 = Method(
    name="Q-FOX/222",
    family="Q-FOX-variant",
    description=("The same block idea in three steps instead of two: 2x2x2, then "
                 "2x2x3, then the opposite slab. Tests whether splitting the "
                 "opening helps or hurts."),
    reference="derived",
    algs_by_tier={"full": 0},
    stages=[
        Stage("b222", goal=(B222,), heur=(B222,)),
        Stage("b223", goal=B223, keep_from=("b222",), heur=B223),
        Stage("b123", goal=(B123,), keep_from=("b223",), heur=(B123,)),
        *ll_one(),
    ],
)

QFOX_ROUX2 = Method(
    name="Q-FOX/roux-2step",
    family="Q-FOX-variant",
    description=("Roux's two 1x2x3 blocks, then CMLL and LSE, both optimal. The "
                 "control for the one-step last layer: same block skill, split "
                 "last layer, and DF/DB left to the end."),
    reference="derived",
    algs_by_tier={"full": 42},
    stages=[
        *ROUX_OPENING,
        Stage("cmll", goal=(LL_CORNERS, EO_LL), keep_from=("fb", "sb"),
              heur=(CMLL_H, LL_CORNERS, EO_LL, OLL_ORIENT_H), alg_family="CLL",
              algs=42, ll_goal="cmll", node_budget=250_000_000,
              note="U corners solved and U edges oriented; ll_goal lets the "
                   "book answer it even with DF/DB still in the M slice"),
        Stage("lse", goal=(Goal(C.LSE),), mask=N.MASK_MU, heur=(Goal(C.LSE),),
              keep_from=("cmll",), intuitive=True, algs=0, align_centres=True),
    ],
)

VARIANTS: dict[str, Method] = {m.name: m for m in (
    qfox("easy"), qfox("medium"), qfox("hard"), qfox("full"),
    QFOX_CROSS, QFOX_ZZ, QFOX_222, QFOX_ROUX2,
)}

# the current answer; the benchmark decides whether this line stays
QFOX = qfox("full")
