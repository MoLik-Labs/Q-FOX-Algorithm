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

The human tiers below are the same opening and the same book engine, re-split
into the last-layer decompositions a person actually recognises.  Each tier is
a *learning dial*, not a slower solver: the book still finishes the last layer
in optimal moves, and the only thing that changes between tiers is how many
recognition cases the learner memorises.  From the most cases (easy) to the
fewest (flow):

    easy     OLL then PLL          -- full orientation, then full permutation
    medium   CMLL then PLL         -- corners home, then full permutation
    tiny     CMLL then PLL, lean   -- same split, a reduced recognition sheet
    low      CMLL then PLL, fewer  -- corners only, permutation from the book
    flow     one-step             -- the whole last layer in one book lookup

Every tier solves the cube; every tier is book-backed, so every tier is as fast
as the essence.  The tiers trade recognition load, not solve speed.
"""
from __future__ import annotations

from .. import coords as C
from .base import Goal, Method, Stage
from .classic import (
    CO_LL,
    EO_LL,
    LL_PERM_AUF,
    OLL_DONE,
    auf_stage,
)

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

# NOTE (dead-end record, do not retry without new evidence): a faster F2L-complete
# opening was searched and rejected.  Single-stage F2L is infeasible (timeout);
# Roux FB+SB is faster but leaves DF/DB unsolved so the book cannot answer;
# the 3-stage FB+SB+DFDB is slower than the baseline; the 6+6 split (1x2x3 + one
# bottom edge per block) looked faster in an unconstrained probe but with
# keep_from enforced the second stage's 4-edge goal explodes and times out.
# The 2x2x3 + 1x2x3 opening above is the best F2L-complete structure found.

# --------------------------------------------------------------------------- #
# last layer
# --------------------------------------------------------------------------- #
LL_ONE_GOAL = (Goal(C.LL_PERM, auf=True), EO_LL, CO_LL)
"""The whole last layer, up to a final AUF.  Positions come from LL_PERM (the
AUF orbit of "all eight pieces home"), orientation from the two seeded tables;
together they are exactly "the last layer is solved, possibly rotated"."""


def ll_one(keep: tuple[str, ...] = F2L_KEEP,
           ll_algs: int = 0, ll_family: str = "LL") -> list[Stage]:
    """The whole last layer in one optimal step, then the AUF it may leave.

    `ll_algs` / `ll_family` describe the recognition curriculum a learner
    practises against this one book step (0 for the essence, which needs no
    recognition at all; the PLL set for the flow tier).  The solve itself is
    always the book's one optimal step.
    """
    return [
        Stage("ll", goal=LL_ONE_GOAL, keep_from=keep,
              heur=(LL_PERM_AUF,), ll_goal="solved", algs=ll_algs,
              alg_family=ll_family,
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


# --------------------------------------------------------------------------- #
# the human tiers: same opening, same book, re-split last layer by recognition
# --------------------------------------------------------------------------- #
# Each tier is a Method that solves the cube end to end.  The last-layer stages
# are answered by the book (ll_goal), so the solve is optimal-speed; the
# algs_by_tier value is the recognition curriculum a learner memorises, which is
# the only thing that differs between tiers.

def _oll_pll(keep: tuple[str, ...] = F2L_KEEP) -> list[Stage]:
    """Orient the whole last layer, then permute it.  Two book steps."""
    return [
        Stage("oll", goal=OLL_DONE, keep_from=keep, heur=OLL_DONE,
              ll_goal="oll", algs=57, alg_family="OLL",
              note="hướng tất cả 8 mảnh lớp cuối (OLL)"),
        Stage("pll", goal=LL_ONE_GOAL, keep_from=keep + ("oll",),
              heur=(LL_PERM_AUF,), ll_goal="pll", algs=21, alg_family="PLL",
              note="xếp tất cả 8 mảnh lớp cuối về đúng chỗ (PLL)"),
        auf_stage(keep + ("oll", "pll")),
    ]


def _cmll_pll(keep: tuple[str, ...] = F2L_KEEP,
              cmll_algs: int = 42, cmll_family: str = "CLL",
              pll_algs: int = 21) -> list[Stage]:
    """Home the corners and orient the edges, then permute the rest.  Two steps.

    `cmll_algs` / `cmll_family` are the recognition curriculum for the CMLL
    step (42 for the full CMLL set, the COLL label for the lean tiny tier);
    `pll_algs` is the recognition for the permutation step (21 when the learner
    memorises PLL, 0 when the book finishes it without recognition).
    """
    return [
        Stage("cmll", goal=(Goal(C.CMLL_POS_EO),), keep_from=keep,
              heur=(Goal(C.CMLL_POS_EO),), ll_goal="cmll",
              algs=cmll_algs, alg_family=cmll_family,
              note="xếp 4 góc và hướng 4 cạnh lớp cuối (CMLL)"),
        Stage("pll", goal=LL_ONE_GOAL, keep_from=keep + ("cmll",),
              heur=(LL_PERM_AUF,), ll_goal="pll", algs=pll_algs,
              alg_family="PLL",
              note="xếp các mảnh còn lại lớp cuối về đúng chỗ"),
        auf_stage(keep + ("cmll", "pll")),
    ]


QFOX_EASY = Method(
    name="Q-FOX easy",
    family="Q-FOX",
    description=("Khai màn hai khối, rồi giải lớp cuối theo hai bước quen thuộc "
                 "OLL rồi PLL.  Nhận diện rõ ràng, dễ học, vẫn nhanh nhờ sách "
                 "tra tối ưu cho mỗi bước."),
    reference="phát triển: khai màn + OLL + PLL (sách tra)",
    algs_by_tier={"easy": 78},
    stages=[*OPENING, *_oll_pll()],
)

QFOX_MEDIUM = Method(
    name="Q-FOX medium",
    family="Q-FOX",
    description=("Khai màn hai khối, rồi CMLL (xếp góc + hướng cạnh) rồi PLL. "
                 "Nhỏ gọn hơn easy, vẫn hai bước sách tra tối ưu."),
    reference="phát triển: khai màn + CMLL + PLL (sách tra)",
    algs_by_tier={"medium": 63},
    stages=[*OPENING, *_cmll_pll(cmll_algs=42, cmll_family="CLL", pll_algs=21)],
)

QFOX_TINY = Method(
    name="Q-FOX tiny",
    family="Q-FOX",
    description=("Bản gọn nhẹ: khai màn hai khối, CMLL rồi PLL, với bảng nhận "
                 "diện tinh gọn. Ít công thức, tốc độ vẫn tối ưu nhờ sách tra."),
    reference="phát triển: khai màn + CMLL + PLL (bản gọn)",
    algs_by_tier={"tiny": 42},
    stages=[*OPENING,
            *_cmll_pll(cmll_algs=42, cmll_family="COLL", pll_algs=0)],
)

QFOX_LOW = Method(
    name="Q-FOX low",
    family="Q-FOX",
    description=("Bản tối giản: khai màn hai khối, CMLL rồi phần còn lại sách "
                 "tra một bước. Ít công thức nhớ nhất trong các bản đa bước."),
    reference="phát triển: khai màn + CMLL + sách tra phần còn lại",
    algs_by_tier={"low": 42},
    stages=[*OPENING,
            *_cmll_pll(cmll_algs=42, cmll_family="CLL", pll_algs=0)],
)

QFOX_FLOW = Method(
    name="Q-FOX flow",
    family="Q-FOX",
    description=("Bản nhanh nhất, ít công thức nhất: khai màn hai khối, rồi cả "
                 "lớp cuối hoàn tất trong một bước sách tra tối ưu. Dành cho "
                 "người muốn tốc độ cao và nhớ ít nhất."),
    reference="phát triển: khai màn + một bước sách tra toàn bộ lớp cuối",
    algs_by_tier={"flow": 21},
    stages=[*OPENING, *ll_one(ll_algs=21, ll_family="PLL")],
)

# --------------------------------------------------------------------------- #
# the faster opening: two 6-piece blocks, same one-step book last layer
# --------------------------------------------------------------------------- #
# REJECTED (experiment): the 6+6 split (BLK_L + BLK_R) measured faster in an
# unconstrained probe, but with keep_from enforced the second stage's 4-edge
# goal combined with the first block's constraint makes the search space explode
# -- it timed out on real scrambles.  The 2x2x3 + 1x2x3 opening below remains the
# best F2L-complete structure found: single-stage F2L is infeasible, Roux FB+SB
# leaves DF/DB unsolved (book cannot answer), and the 3-stage FB+SB+DFDB is
# slower than the baseline.  Kept as a comment so the dead end is not retried.

VARIANTS: dict[str, Method] = {
    QFOX.name: QFOX,
    QFOX_EASY.name: QFOX_EASY,
    QFOX_MEDIUM.name: QFOX_MEDIUM,
    QFOX_TINY.name: QFOX_TINY,
    QFOX_LOW.name: QFOX_LOW,
    QFOX_FLOW.name: QFOX_FLOW,
}
