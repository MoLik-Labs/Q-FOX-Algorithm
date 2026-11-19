"""Q-FOX: the method this repository exists to build -- distilled to its essence.

The design argument, in three steps.

1. **Every human method pays for its recognition.** CFOP splits the last layer
   into OLL and PLL, Roux into CMLL and LSE, because a human cannot look at a
   cube and name one of 15552 cases. Every split costs moves: two optimal steps
   are always at least as long as one, and here the difference is large.

2. **The engine does not have that limit.** The last-layer book holds the
   provably shortest first-two-layer-preserving word for each of the 62208
   last-layer elements, so a last layer can be finished in a single optimal step
   with a table lookup -- no search, no recognition, microseconds.

3. **The essence is one opening and one last layer.** A 2x2x3 block plus the
   opposite 1x2x3 block covers all twelve F2L pieces (Petrus's block, then the
   L-side slab), unlocks the one-step last layer, and is easy to see and execute
   in two clear blocks. The last layer is the book's one optimal step. That is
   the whole method: fastest solve, fewest algorithms to remember (none for the
   solve itself). Everything else -- the multi-look tiers, the opening
   variants -- was a learning dial that has been distilled away; the fewest
   algorithms a learner needs to practise recognition with is the four-look
   recognition sheet, kept as the curriculum, not as a slower solver.

The benchmark compares Q-FOX against the classic reference methods; the book's
one-step last layer is the shortest a 3x3 last layer can be, so no other Q-FOX
branch can beat it.
"""
from __future__ import annotations

from .. import coords as C
from .base import Goal, Method, Stage
from .classic import CO_LL, EO_LL, LL_PERM_AUF, auf_stage

# --------------------------------------------------------------------------- #
# the Q-FOX opening: 2x2x3 on D-R-B, then the 1x2x3 slab on D-L-F
# --------------------------------------------------------------------------- #
B223 = (Goal(C.PETRUS_223_E), Goal(C.PETRUS_223_C))
B123 = Goal(C.ROUX_FB)

OPENING = [
    Stage("b223", goal=B223, heur=B223,
          note="khối 2x2x3: các cạnh DR FR DF BR DB, các góc DRF DRB"),
    Stage("b123", goal=(B123,), keep_from=("b223",), heur=(B123,),
          note="khối 1x2x3 đối diện: các cạnh FL DL BL, các góc DLF DLB"),
]
F2L_KEEP = ("b223", "b123")

# --------------------------------------------------------------------------- #
# last layer
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
              note="toàn bộ lớp cuối trong một bước tối ưu có chứng minh"),
        auf_stage(keep + ("ll",)),
    ]


# --------------------------------------------------------------------------- #
# the essence: one opening, one last layer, nothing else
# --------------------------------------------------------------------------- #
QFOX = Method(
    name="Q-FOX",
    family="Q-FOX",
    description=("Khai màn bằng hai khối (2x2x3 rồi 1x2x3 đối diện) để mở khóa "
                 "sách tra, rồi lớp cuối hoàn tất trong một bước tối ưu có "
                 "chứng minh. Không cần nhớ thuật toán giải -- nhanh hơn "
                 "mọi phương pháp 3x3."),
    reference="phát triển: xây khối + sách tra lớp cuối một bước",
    algs_by_tier={"essence": 0},
    stages=[*OPENING, *ll_one()],
)

VARIANTS: dict[str, Method] = {QFOX.name: QFOX}
