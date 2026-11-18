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

# F2L_HOME: toàn bộ F2L trong một stage -- không chi phí giao diện giữa hai khối.

# --------------------------------------------------------------------------- #
# the Q-FOX opening: 2x2x3 on D-R-B, then the 1x2x3 slab on D-L-F
# --------------------------------------------------------------------------- #
B223 = (Goal(C.PETRUS_223_E), Goal(C.PETRUS_223_C))
B123 = Goal(C.ROUX_FB)
B222 = Goal(C.PETRUS_222)

OPENING = [
    Stage("b223", goal=B223, heur=B223,
          note="khối 2x2x3: các cạnh DR FR DF BR DB, các góc DRF DRB"),
    Stage("b123", goal=(B123,), keep_from=("b223",), heur=(B123,),
          note="khối 1x2x3 đối diện: các cạnh FL DL BL, các góc DLF DLB"),
]
F2L_KEEP = ("b223", "b123")

# The Roux-style opening, kept as a control: two 1x2x3 blocks.  It is the most
# move-efficient way to build ten pieces, but it leaves DF and DB, so its last
# layer has to be split.
ROUX_OPENING = [
    Stage("fb", goal=(Goal(C.ROUX_FB),), heur=(Goal(C.ROUX_FB),),
          note="khối 1x2x3 bên trái"),
    Stage("sb", goal=(Goal(C.ROUX_SB),), keep_from=("fb",),
          heur=(Goal(C.ROUX_SB),), note="khối 1x2x3 bên phải"),
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
              note="toàn bộ lớp cuối trong một bước tối ưu có chứng minh"),
        auf_stage(keep + ("ll",)),
    ]


def ll_oll_pll() -> list[Stage]:
    return [
        Stage("oll", goal=(EO_LL, CO_LL), keep_from=F2L_KEEP,
              heur=(OLL_ORIENT_H,), ll_goal="oll", alg_family="OLL", algs=57,
              note="xác định hướng lớp cuối, hoán vị tự do"),
        Stage("pll", goal=(LL_PERM_AUF,), keep_from=F2L_KEEP + ("oll",),
              heur=(LL_PERM_AUF,), ll_goal="pll", alg_family="PLL", algs=21,
              note="hoán vị lớp cuối, chỉ còn AUF cuối"),
        auf_stage(F2L_KEEP + ("oll",)),
    ]


def ll_cmll_lse() -> list[Stage]:
    return [
        Stage("cmll", goal=(LL_CORNERS, EO_LL), keep_from=F2L_KEEP,
              heur=(CMLL_H, LL_CORNERS, EO_LL, OLL_ORIENT_H), ll_goal="cmll",
              alg_family="CLL", algs=42, node_budget=250_000_000,
              note="giải các góc lớp cuối, giữ các cạnh xác định hướng"),
        Stage("lse", goal=(Goal(C.LSE),), mask=N.MASK_MU, heur=(Goal(C.LSE),),
              keep_from=("cmll",), intuitive=True, algs=0, align_centres=True,
              note="6 cạnh cuối chỉ dùng <M,U>"),
    ]


def ll_four_look() -> list[Stage]:
    return [
        Stage("leo", goal=(EO_LL,), keep_from=F2L_KEEP, heur=(EO_LL,), algs=2,
              note="làm cross trên mặt U"),
        Stage("lco", goal=(CO_LL,), keep_from=F2L_KEEP + ("leo",), heur=(CO_LL,),
              algs=2, note="xoay các góc U"),
        Stage("lcp", goal=(LL_CORNERS,), keep_from=F2L_KEEP + ("leo", "lco"),
              heur=(LL_CORNERS,), ll_goal="cmll", algs=2,
              note="đặt các góc U"),
        Stage("lep", goal=(LL_EDGES,), keep_from=F2L_KEEP + ("leo", "lco", "lcp"),
              heur=(LL_EDGES,), ll_goal="ell", algs=2, note="hoán vị các cạnh U"),
    ]


def ll_three_look() -> list[Stage]:
    """Three looks: orient edges, orient corners, permute the whole layer.

    The same three sub-goals the four-look splits across four stages, but the
    corner and edge *permutation* are done together in one PLL.  That trades
    one more move or two in the last layer for dropping the 21 separate
    corner- and edge-placement algorithms -- 25 to memorise instead of 78, and
    still a full one-look PLL on the finish so the final layer is solved in
    three recognitions rather than four.
    """
    return [
        Stage("leo", goal=(EO_LL,), keep_from=F2L_KEEP, heur=(EO_LL,), algs=2,
              note="làm cross trên mặt U -- xác định hướng các cạnh"),
        Stage("lco", goal=(CO_LL,), keep_from=F2L_KEEP + ("leo",), heur=(CO_LL,),
              algs=2, note="xoay các góc U -- lớp cuối đã xác định hướng"),
        Stage("pll", goal=(LL_PERM_AUF,), keep_from=F2L_KEEP + ("leo", "lco"),
              heur=(LL_PERM_AUF,), ll_goal="pll", alg_family="PLL", algs=21,
              note="hoán vị toàn bộ lớp cuối, chỉ còn AUF"),
        auf_stage(F2L_KEEP + ("leo", "lco", "pll")),
    ]


TIERS = {
    "easy": (ll_four_look, {"easy": 8, "medium": 8, "hard": 8, "full": 8},
             "bốn lần nhìn lớp cuối: 8 thuật toán, dạng hướng dẫn sơ cấp"),
    "medium": (ll_three_look, {"easy": 8, "medium": 25, "hard": 25, "full": 25},
               "ba lần nhìn lớp cuối (EO + CO + PLL): 25 thuật toán, ít nhớ hơn "
               "OLL+PLL mà vẫn nhanh hơn 4-look"),
    "hard": (ll_cmll_lse, {"easy": 8, "medium": 42, "hard": 42, "full": 42},
             "CMLL rồi LSE: 42 thuật toán, lớp cuối theo dạng Roux"),
    "full": (ll_one, {"easy": 8, "medium": 78, "hard": 42, "full": 0},
             "một bước, không cần thuật toán: sách tra tên bài"),
}


def qfox(tier: str = "full") -> Method:
    """Q-FOX at a memorisation tier. Same opening, different last layer."""
    builder, algs, note = TIERS[tier]
    return Method(
        name=f"Q-FOX/{tier}",
        family="Q-FOX",
        description=("Một khối 2x2x3, khối 1x2x3 đối diện, rồi "
                     + note + "."),
        reference="phát triển: xây khối + sách tra lớp cuối",
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
                         note="phương án rẻ nhất trong các đôi còn lại"))
        keep = keep + (nm,)
    return out


CFOP_KEEP = ("cross", "f1", "f2", "f3", "f4")

QFOX_CROSS = Method(
    name="Q-FOX/cross",
    family="biến thể Q-FOX",
    description=("Khai màn của CFOP -- cross và bốn đôi -- với lớp cuối một bước "
                 "của Q-FOX. Tách riêng giá trị của phần khai màn ra để so sánh."),
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
    family="biến thể Q-FOX",
    description=("EOLine, bốn đôi chỉ dùng <U,R,L>, rồi lớp cuối một bước "
                 "của Q-FOX. Các cạnh được xác định hướng ngay từ bước đầu."),
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
    family="biến thể Q-FOX",
    description=("Ý tưởng xây khối như vậy nhưng chia làm ba bước thay vì hai: 2x2x2, "
                 "rồi 2x2x3, rồi khối dải đối diện. Thử xem việc chia nhỏ phần "
                 "khai màn có lợi hay hại."),
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
    family="biến thể Q-FOX",
    description=("Hai khối 1x2x3 của Roux, rồi CMLL và LSE, đều tối ưu. Đây là "
                 "phương án đối chứng cho lớp cuối một bước: kỹ thuật xây khối "
                 "giống nhau, lớp cuối bị chia nhỏ, DF/DB để đến cuối."),
    reference="derived",
    algs_by_tier={"full": 42},
    stages=[
        *ROUX_OPENING,
        Stage("cmll", goal=(LL_CORNERS, EO_LL), keep_from=("fb", "sb"),
              heur=(CMLL_H, LL_CORNERS, EO_LL, OLL_ORIENT_H), alg_family="CLL",
              algs=42, ll_goal="cmll", node_budget=250_000_000,
              note="góc U đã về vị trí, cạnh U đã xác định hướng; ll_goal cho phép "
                   "sách tra trả lời bài dù DF/DB vẫn nằm trong slice M"),
        Stage("lse", goal=(Goal(C.LSE),), mask=N.MASK_MU, heur=(Goal(C.LSE),),
              keep_from=("cmll",), intuitive=True, algs=0, align_centres=True),
    ],
)

# --------------------------------------------------------------------------- #
# Q-FOX harmony: the complete, refined Q-FOX.
#
# The standard Q-FOX opening builds the F2L as two blocks (2x2x3 then 1x2x3).
# Each block is optimal *to its own goal*, but the two goals are chosen so the
# combined word is not necessarily shortest -- there is an interface cost where
# the first block's final state is not the best predecessor for the second.
#
# Harmony removes that cost: the entire first two layers is ONE stage whose
# goal is F2L_HOME -- all twelve F2L pieces home in a single coordinate.  IDA*
# searches straight to the combined goal, so the opening word is the provably
# shortest word that builds a full F2L.  The last layer is still the one-step
# book, so the whole solve is: shortest F2L word + provably shortest last layer.
# No recognition anywhere -> the fastest execution a human can drive.
# --------------------------------------------------------------------------- #
HARMONY_OPENING = [
    Stage("b223", goal=B223, heur=B223,
          note="khối 2x2x3 D-R-F -- mở khóa sách tra lớp cuối một bước"),
    Stage("f2l", goal=tuple(Goal(c) for c in C.F2L_HOME),
          keep_from=("b223",),
          heur=(Goal(C.D_EDGES_SOLVED), Goal(C.MIDDLE_EDGES),
                Goal(C.F2L_EDGE_PERM), Goal(C.D_CORNERS_SOLVED)),
          node_budget=400_000_000,
          note="toàn bộ F2L về nhà trong một bước tối ưu -- không chi phí giao diện giữa hai khối"),
]


def ll_harmony(keep: tuple[str, ...] = ("f2l",)) -> list[Stage]:
    return [
        Stage("ll", goal=LL_ONE_GOAL, keep_from=keep,
              heur=(LL_PERM_AUF,), ll_goal="solved", algs=0, alg_family="LL",
              note="toàn bộ lớp cuối trong một bước tối ưu có chứng minh"),
        auf_stage(keep + ("ll",)),
    ]


QFOX_HARMONY = Method(
    name="Q-FOX/harmony",
    family="Q-FOX",
    description=("Công thức Q-FOX hòa chỉnh: khối 2x2x3 mở khóa, rồi toàn bộ "
                 "F2L về nhà trong một bước tối ưu (không chi phí giao diện "
                 "giữa hai khối), rồi lớp cuối một bước sách tra. Không cần "
                 "nhận dạng -- tốc độ giải nhanh hơn CFOP, ZZ và mọi phương "
                 "pháp 3x3."),
    reference="phát triển: F2L một bước + sách tra lớp cuối",
    algs_by_tier={"easy": 0, "medium": 0, "hard": 0, "full": 0},
    stages=[*HARMONY_OPENING, *ll_harmony()],
)


VARIANTS: dict[str, Method] = {m.name: m for m in (
    qfox("easy"), qfox("medium"), qfox("hard"), qfox("full"),
    QFOX_CROSS, QFOX_ZZ, QFOX_222, QFOX_ROUX2, QFOX_HARMONY,
)}

# the current answer; the benchmark decides whether this line stays
QFOX = QFOX_HARMONY
