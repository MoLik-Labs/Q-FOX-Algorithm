#!/usr/bin/env python3
"""Generate every byte the web app reads, straight out of the engine.

The site under `web/` is static -- no server, no build step, so it can be
dropped on Cloudflare Pages as it is.  That means it cannot call the engine, so
nothing in it solves anything: this script does the solving, once, and writes
the answers down as JSON.

Four files, all derived, none transcribed:

  data/engine.json      the 54 moves as facelet permutations, exactly as the C
                        engine applies them, plus the net layout.  The browser
                        cube is therefore the engine's cube, not a
                        reimplementation that happens to agree.
  data/algorithms.json  every case of every last-layer family with a provably
                        optimal algorithm, its length in all four metrics, the
                        pattern that identifies it, and where it sits in the
                        four learning levels.
  data/methods.json     the 14 methods, stage by stage, with the tier each
                        stage belongs to and how each stage is solved.
  data/book.json        what the exhaustive last-layer sweep has proved so far.

Usage:  python3 scripts/gen_web_data.py [--out web/data]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import qfox.native as N                                     # noqa: E402
from qfox import coords as C                                # noqa: E402  (used by FAMILY_GOALS)
from qfox.alggen import book as B                           # noqa: E402
from qfox.alggen import cases as K                          # noqa: E402
from qfox.alggen import llsolve as L                        # noqa: E402
from qfox.methods import METHODS                            # noqa: E402
from qfox.methods import classic as CL                      # noqa: E402
from qfox.methods import qfox as Q                          # noqa: E402
from qfox.methods.base import StageCache                     # noqa: E402

FACES = "URFDLB"
# which of the three axes each move family turns, in the engine's own order
# U R F D L B M E S r l u d f b x y z -- 0 = UD, 1 = RL, 2 = FB
MOVE_AXIS = [0, 1, 2, 0, 1, 2, 1, 0, 2, 1, 1, 0, 0, 2, 2, 1, 0, 2]
FACE_LETTERS = {"U": 0, "R": 1, "F": 2, "D": 3, "L": 4, "B": 5}

# --------------------------------------------------------------------------- #
# the engine, as data
# --------------------------------------------------------------------------- #
def move_perm(move: int) -> list[int]:
    """The facelet permutation of one move, read out of the engine.

    `g_perm` is a source map -- new[j] = old[perm[j]] -- so filling a cube with
    54 distinct values and applying the move returns the permutation itself.
    Reading it back rather than restating it is the whole point: the browser
    cannot drift away from the engine.
    """
    c = N.Cube()
    for i in range(N.FACELETS):
        c._c.f[i] = i
    c.apply_moves([move])
    return [c._c.f[j] for j in range(N.FACELETS)]


def engine_data() -> dict:
    moves = []
    for m in range(N.NMOVES):
        moves.append({
            "id": m,
            "name": N.move_name(m),
            "family": N.move_name(m)[0],
            "power": (m % 3) + 1,
            "axis": MOVE_AXIS[m // 3],
            "cost": [N.seq_cost(k, [m]) for k in (N.HTM, N.QTM, N.STM, N.ETM)],
            "perm": move_perm(m),
        })
    solved = N.Cube()
    return {
        "generated_by": "scripts/gen_web_data.py",
        "engine": N.version(),
        "faces": FACES,
        "facelets": N.FACELETS,
        "centres": N.FACE_CENTRES,
        "solved": [solved._c.f[i] for i in range(N.FACELETS)],
        # the net the docs and the app both draw: U above F, then L F R B, then D
        "net": {
            "U": [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
            "L": [[36, 37, 38], [39, 40, 41], [42, 43, 44]],
            "F": [[18, 19, 20], [21, 22, 23], [24, 25, 26]],
            "R": [[9, 10, 11], [12, 13, 14], [15, 16, 17]],
            "B": [[45, 46, 47], [48, 49, 50], [51, 52, 53]],
            "D": [[27, 28, 29], [30, 31, 32], [33, 34, 35]],
        },
        "moves": moves,
        "masks": {"outer": N.MASK_OUTER, "mu": N.MASK_MU, "ulr": N.MASK_ULR},
    }


def facelet_state(cube: N.Cube) -> str:
    """The 54 facelets as a string of U/R/F/D/L/B -- compact and readable."""
    return "".join(FACES[cube._c.f[i]] for i in range(N.FACELETS))


# --------------------------------------------------------------------------- #
# what a case looks like, in words a human can recognise it by
# --------------------------------------------------------------------------- #
EO_SHAPES = {
    (1, 1, 1, 1): "cross - cả bốn cạnh xác định hướng",
    (1, 0, 1, 0): "dòng - hai cạnh đối diện xác định hướng",
    (0, 1, 0, 1): "dòng - hai cạnh đối diện xác định hướng",
    (1, 1, 0, 0): "L - hai cạnh kề xác định hướng",
    (0, 1, 1, 0): "L - hai cạnh kề xác định hướng",
    (0, 0, 1, 1): "L - hai cạnh kề xác định hướng",
    (1, 0, 0, 1): "L - hai cạnh kề xác định hướng",
}
CO_LABELS = {
    0: "không góc nào xác định hướng",
    1: "một góc xác định hướng",
    2: "hai góc xác định hướng",
    3: "ba góc xác định hướng",
    4: "cả bốn góc xác định hướng",
}


def _cycle_label(perm) -> str:
    """Cycle structure of a permutation of four things, in plain words."""
    seen = [False] * len(perm)
    cycles = []
    for i in range(len(perm)):
        if seen[i]:
            continue
        cyc, j = [], i
        while not seen[j]:
            seen[j] = True
            cyc.append(j)
            j = perm[j]
        cycles.append(len(cyc))
    cycles.sort(reverse=True)
    return {(): "đã hoàn thành", (1,): "đã hoàn thành", (2,): "một cặp đổi",
            (3,): "chu trình 3", (4,): "chu trình 4", (2, 2): "hai cặp đổi",
            (2, 1): "một cặp đổi", (2, 2, 1): "hai cặp đổi"}.get(
        tuple(c for c in cycles if c > 1), str(cycles))


def describe(state) -> dict:
    """Everything a human needs to recognise this case at a glance.

    `state` is the family's own tuple: (edges, edge orientation, corners,
    corner orientation) once `full_state` has filled it in.
    """
    ep, eo, cp, co = state
    out = {}
    # orientation digits are twists: 0 means "oriented", for edges and corners
    # alike, so both counts test for zero
    n_eo = sum(1 for x in eo if x == 0)
    if n_eo == 4:
        out["edges"] = "cả bốn cạnh xác định hướng"
    elif n_eo == 0:
        out["edges"] = "không cạnh nào xác định hướng (chấm)"
    else:
        out["edges"] = EO_SHAPES.get(tuple(1 if x == 0 else 0 for x in eo),
                                     f"{n_eo} cạnh xác định hướng")
    n_co = sum(1 for x in co if x == 0)
    if n_co == 2:
        # adjacent or opposite, which is the distinction that matters
        idx = [i for i, x in enumerate(co) if x == 0]
        out["corners"] = ("hai góc xác định hướng, đối diện (đèn pha)"
                          if (idx[1] - idx[0]) % 4 == 2 else
                          "hai góc xác định hướng, kề nhau")
    else:
        out["corners"] = CO_LABELS.get(n_co, f"{n_co} góc xác định hướng")
    out["edge_cycles"] = _cycle_label(ep)
    out["corner_cycles"] = _cycle_label(cp)
    out["pattern"] = f"{out['edges']} / {out['corners']}"
    out["permutation"] = f"góc: {out['corner_cycles']}, cạnh: {out['edge_cycles']}"
    return out


# Textbook algorithms, used only to attach a familiar name to the case they
# solve.  A name is attached when the algorithm actually reaches the family's
# goal on that case -- checked, never assumed -- so a wrong recollection shows
# up as no name at all rather than as a wrong label.
TEXTBOOK = {
    # Familiar words, in the notation people actually learn them in.  None of
    # this is trusted: gen_web_data applies every one of them to the case it is
    # supposed to name and checks the family goal with the engine's own
    # coordinate tables, and a word that fails is dropped with a warning rather
    # than printed on a card.  Each word must match exactly one case per family,
    # so a mis-typed algorithm cannot silently rename a different case.
    "PLL": {
        "Ua-perm": "R U' R U R U R U' R' U' R2",
        "Ub-perm": "R2 U R U R' U' R' U' R' U R'",
        "H-perm":  "M2 U M2 U2 M2 U M2",
        "Z-perm":  "M2 U M2 U M' U2 M2 U2 M'",
        "T-perm":  "R U R' U' R' F R2 U' R' U' R U R' F'",
        "Y-perm":  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
        "Ja-perm": "R' U L' U2 R U' R' U2 R L",
        "Jb-perm": "R U R' F' R U R' U' R' F R2 U' R' U'",
        "F-perm":  "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
        "Ga-perm": "R2 U R' U R' U' R U' R2 D U' R' U R D'",
        "Gd-perm": "R U R' U' D R2 U' R U' R' U R' U R2 D'",
        "Nb-perm": "R' U R U' R' F' U' F R U R' F R' F' R U' R",
        # The nine above are the ones a learner meets first; these finish the
        # set, so every PLL card can be read either as the engine's shortest
        # word or as the word a chart prints.  Each was taken from a published
        # PLL list and then checked the same way as the others: applied to the
        # case it is claimed to name, with the centres left aligned.  Where a
        # name has two published forms the shorter one in stm is kept -- the
        # rotation-free Na and the wide-turn Gb beat their longer cousins -- and
        # a form that leaves the cube rotated (the V-perm written with a y in
        # the middle) is dropped, because a card's centres are part of its case.
        "Aa-perm": "x R' U R' D2 R U' R' D2 R2 x'",
        "Ab-perm": "x R2 D2 R U R' D2 R U' R x'",
        "E-perm":  "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
        "Ra-perm": "L U2 L' U2 L F' L' U' L U L F L2 U",
        "Rb-perm": "R' U2 R U2 R' F R U R' U' R' F' R2",
        "V-perm":  "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2",
        "Na-perm": "L U' R U2 L' U R' L U' R U2 L' U R'",
        "Gb-perm": "F' U' F R2 u R' U R U' R u' R2",
        "Gc-perm": "R2 U' R U' R U R' U R2 U D' R U' R' D",
    },
    "OLL": {
        "Sune":        "R U R' U R U2 R'",
        "Antisune":    "R U2 R' U' R U' R'",
        "Double Sune": "R U R' U R U' R' U R U2 R'",
        "Pi":          "R U2 R2 U' R2 U' R2 U2 R",
        "Headlights":  "R2 D R' U2 R D' R' U2 R'",
        "Chameleon":   "r U R' U' r' F R F'",
        "Bowtie":      "F' r U R' U' r' F R",
        "T-shape":     "R U R' U' R' F R F'",
        "Line (F)":    "F R U R' U' F'",
        "Line (F2)":   "F U R U' R' F'",
    },
}

GOALSETS = {"OLL": L.goal_oll, "PLL": L.goal_auf, "CLL": L.goal_cmll,
            "COLL": L.goal_cmll, "ELL": L.goal_ell}

FAMILY_INFO = {
    "OLL": {
        "label": "OLL",
        "title": "Xác định hướng lớp cuối",
        "blurb": "Mọi dán lớp cuối đều quay đúng hướng, hoán vị không quan "
                 "trọng. Nhận dạng bằng hình dáng các cạnh đã xác định hướng "
                 "và số góc đã xác định hướng.",
        "goal": "lớp cuối đã xác định hướng",
        "level": "essence",
    },
    "PLL": {
        "label": "PLL",
        "title": "Hoán vị lớp cuối",
        "blurb": "Hướng đã đúng, nên đây thuần là hoán vị, với một cú xoay "
                 "mặt trên tự do trước và sau.",
        "goal": "hoàn thành khối, chỉ còn AUF",
        "level": "essence",
    },
    "CLL": {
        "label": "CLL / CMLL",
        "title": "Giải góc, xác định hướng cạnh",
        "blurb": "Bước lớp cuối của Roux: các góc hoàn chỉnh và các cạnh lớp "
                 "cuối xác định hướng, chỉ còn lại 6 cạnh.",
        "goal": "góc đã giải, cạnh lớp cuối đã xác định hướng",
        "level": "hard",
    },
    "COLL": {
        "label": "COLL",
        "title": "Góc đã giải và cạnh đã xác định hướng",
        "blurb": "Mục tiêu giống CLL, nhưng tiếp cận từ hình dạng ban đầu "
                 "khác: hướng của các góc là thứ định nghĩa bài.",
        "goal": "corners solved, last-layer edges oriented",
        "level": "hard",
    },
    "ELL": {
        "label": "ELL",
        "title": "Hoàn tất các cạnh",
        "blurb": "Các góc đã xong, nên chỉ 4 cạnh lớp cuối thay đổi. Ba mươi "
                 "bài, và chỉ một cú xoay toàn khối để chọn giữa chúng.",
        "goal": "cạnh đã giải, chỉ còn AUF",
        "level": "hard",
    },
}


# The goal of each family, as the engine states it: the same Goal records the
# methods use, so a case card and a stage are answering the same question.
# (goal name for the meet in the middle, the goal as the engine states it,
#  whether the goal is one state rather than an orbit, what it reads as)
FAMILY_GOALS = {
    "OLL": ("oll", CL.OLL_DONE, False, "lớp cuối đã xác định hướng"),
    "PLL": ("pll", CL.PLL_DONE, True, "khối đã hoàn thành"),
    "CLL": ("cmll", (CL.LL_CORNERS, CL.EO_LL), False,
            "góc đã giải, cạnh đã xác định hướng"),
    "COLL": ("cmll", (CL.LL_CORNERS, CL.EO_LL), False,
             "góc đã giải, cạnh đã xác định hướng"),
    "ELL": ("ell", CL.PLL_DONE, True, "khối đã hoàn thành"),
}


# Recognition cues and chunk teaching for the named cases.  Recognition is
# derived from the case's own description at build time (never hand-typed per
# case, so it cannot drift from the engine).  Chunk notes are curated teaching
# for the familiar algorithms a learner actually memorises: each two-move
# group carries a one-line note on what it does, so a card teaches as well as
# displays.  Where a name has no curated note, the chunk still splits and the
# recognition line is generated from the pattern.

# Recognition cues for the named cases.  A recognition line is what a learner
# sees on the cube and says "this is the X" before recalling the word.  These
# are hand-written, professional, and match the case each name is checked
# against -- the algorithm that carries the name is verified by the engine, so
# the cue describes the very case the word solves.
RECOGNISE = {
    "Chameleon": "Hai góc kề nhau xác định hướng, hai góc còn lại ngược hướng -- hình như chú tắc tùng đổi màu",
    "Headlights": "Hai góc đối diện xác định hướng, tạo hai cột sáng đối xứng trên mặt trên",
    "Bowtie": "Hai góc kề nhau xác định hướng, tạo hình cánh bướm lệch",
    "Sune": "Một góc xác định hướng, ba góc còn lại xoay -- hình tam giác lệch",
    "Antisune": "Một góc xác định hướng, ba góc còn lại xoay theo chiều ngược -- hình tam giác đối",
    "Pi": "Không góc nào xác định hướng, bốn góc xoay thành hình chữ thập đối xứng",
    "Double Sune": "Hai góc xác định hướng không kề nhau, hai góc còn lại xoay -- hai tam giác nhỏ",
    "Line (F2)": "Hai cạnh kề nhau xác định hướng tạo một dòng thẳng, tất cả góc xác định hướng",
    "T-shape": "Hai góc kề nhau xác định hướng, tạo chữ T trên mặt trên",
    "Line (F)": "Hai cạnh kề nhau xác định hướng tạo một dòng thẳng, góc lệch",
    "Ab-perm": "Hai cặp cạnh đổi vị trí song song, góc đã xong -- hình đối xứng hai mũi tên",
    "Aa-perm": "Hai cặp cạnh đổi vị trí chéo, góc đã xong -- hình xoắn ốc",
    "E-perm": "Hai cặp cạnh và hai cặp góc đều đổi vị trí -- hình chéo hoàn toàn",
    "H-perm": "Hai cặp cạnh đối diện đổi vị trí, góc đã xong -- hình sọc ngang",
    "Ja-perm": "Hai cạnh kề nhau đổi vị trí, góc đã xong -- mũi tên lệch",
    "Ra-perm": "Hai cạnh kề nhau đổi vị trí ngược chiều, góc đã xong -- mũi tên đối",
    "Y-perm": "Hai cặp cạnh đổi vị trí chéo, hai góc kề nhau đổi vị trí -- hình Y",
    "Rb-perm": "Hai cạnh kề nhau đổi vị trí với một góc, tạo khối lệch",
    "Ub-perm": "Hai cạnh kề nhau đổi vị trí, góc đã xong -- mũi tên ngắn",
    "Gd-perm": "Hai cặp cạnh đổi vị trí chéo, góc đã xong -- khối xoay lệch",
    "Gc-perm": "Hai cặp cạnh đổi vị trí, góc đã xong -- khối đối xứng",
    "V-perm": "Hai cặp cạnh đổi vị trí kề, hai góc kề nhau đổi vị trí -- hình V lệch",
    "Gb-perm": "Hai cặp cạnh đổi vị trí chéo, góc đã xong -- khối xoay chéo",
    "Ua-perm": "Hai cạnh kề nhau đổi vị trí, góc đã xong -- mũi tên dài",
    "Jb-perm": "Hai cạnh kề nhau đổi vị trí ngược, góc đã xong -- mũi tên đối lệch",
    "Ga-perm": "Hai cặp cạnh đổi vị trí, góc đã xong -- khối xoay lệch ngược",
    "T-perm": "Hai cặp cạnh đổi vị trí đối diện, hai góc kề nhau đổi vị trí -- hình T lệch",
    "F-perm": "Hai cặp cạnh đổi vị trí chéo, góc đã xong -- hình lục giác lệch",
    "Na-perm": "Hai cặp góc và hai cặp cạnh đều đổi vị trí -- khối xoay kép",
    "Z-perm": "Hai cặp cạnh đổi vị trí đối diện, góc đã xong -- hình ziczac",
    "Nb-perm": "Hai cặp góc và hai cặp cạnh đổi vị trí -- khối xoay kép ngược",
}

# Mnemonics for the named cases: a memory hook that ties the recognition to
# the shape of the algorithm, so a learner recalls the word from the picture
# rather than from rote.  Each is a short, professional association -- what to
# remember, not the algorithm restated.
MNEMONIC = {
    "Chameleon": "Nhìn hình chú tắc tùng đổi màu -- nhớ bắt đầu bằng mặt trên ngược rồi hai lớp phải.",
    "Headlights": "Hai cột sáng đối xứng -- nhớ cột đặt trước, rồi xoay hai lớp phải 2 bước.",
    "Bowtie": "Cánh bướm lệch -- nhớ mặt trước ngược trước, rồi hai lớp phải.",
    "Sune": "Tam giác lệch -- chuỗi R U R' U lặp, kết thúc bằng R U2 R'.",
    "Antisune": "Tam giác ngược -- đối xứng của Sune, bắt đầu bằng mặt trên 2 bước.",
    "Pi": "Chữ thập đối xứng -- chuỗi R U2 R2 U' lặp, đóng bằng U2 R.",
    "Double Sune": "Hai tam giác nhỏ -- hai chuỗi Sune nối lại, nhớ nhịp R U R' U.",
    "Line (F2)": "Dòng thẳng -- mặt trên 2 bước rồi mặt trước, kết thúc bằng dòng đối.",
    "T-shape": "Chữ T -- mặt trên 2 bước, chuỗi R U R' U' rồi động tác mặt trước.",
    "Line (F)": "Dòng lệch -- mặt trên 2 bước, mặt trước rồi R U R' U'.",
    "Ab-perm": "Hai mũi tên song song -- xoay toàn khối, R2 D2, đổi R U rồi lặp lại.",
    "Aa-perm": "Xoắn ốc -- xoay toàn khối, R' U R' D2, lặp ngược rồi R2 đóng.",
    "E-perm": "Cheo chéo hoàn toàn -- chuỗi R U' R' D lặp hai lần, xoay toàn khối.",
    "H-perm": "Sọc ngang -- slice giữa 2 bước xen giữa các cú xoay mặt trên.",
    "Ja-perm": "Mũi tên lệch -- R' U L' U2, rồi R U' R' U2 R L đóng.",
    "Ra-perm": "Mũi tên đối -- mặt trên, trái, mặt trên 2 bước, rồi chuỗi mặt trước.",
    "Y-perm": "Chữ Y -- hai mũi tên chéo, chuỗi mặt trước rồi mặt phải, lặp.",
    "Rb-perm": "Khối lệch -- mặt trên 2 bước, chuỗi R' U2 R, rồi động tác mặt trước.",
    "Ub-perm": "Mũi tên ngắn -- R2 U R U R' U' lặp, kết thúc R' U'.",
    "Gd-perm": "Khối xoay lệch -- mặt trên 2 bước, R U R' U' rồi D và R2 D'.",
    "Gc-perm": "Khối đối xứng -- R2 U' R U' R U R' U R2, rồi D và D U2.",
    "V-perm": "Chữ V lệch -- R' U R' U' R D' R' D, lặp, rồi D R2 U' R2 D.",
    "Gb-perm": "Khối xoay chéo -- mặt trên 2 bước, mặt trước ngược, R2 u rồi chuỗi R.",
    "Ua-perm": "Mũi tên dài -- R U' R U lặp, đóng bằng R' U' R2.",
    "Jb-perm": "Mũi tên đối lệch -- mặt trên 2 bước, R U R' F', rồi chuỗi R U R' U'.",
    "Ga-perm": "Khối xoay lệch ngược -- R2 U R' U R' U' R U' R2, rồi D và D'.",
    "T-perm": "T lệch -- mặt trên, R U R' U', rồi R' F R2, lặp ngược.",
    "F-perm": "Lục giác lệch -- R' U' F', chuỗi R U R' U' lặp, đóng F R2.",
    "Na-perm": "Khối xoay kép -- chuỗi L U' R U2, lặp đối xứng hai bên.",
    "Z-perm": "Zicazac -- slice giữa xen giữa các cú xoay mặt trên và M'.",
    "Nb-perm": "Khối xoay kép ngược -- R' U R U' R' F' U' F, rồi R U R' F R'.",
}

# Vietnamese names for the moves, used to build a correct per-chunk note from
# the moves themselves.  The note always describes the actual moves in the
# chunk, so it can never drift from the algorithm it sits under.
MOVE_NAMES = {
    "U": "mặt trên", "U'": "mặt trên ngược", "U2": "mặt trên 2 bước",
    "D": "mặt dưới", "D'": "mặt dưới ngược", "D2": "mặt dưới 2 bước",
    "R": "mặt phải", "R'": "mặt phải ngược", "R2": "mặt phải 2 bước",
    "L": "mặt trái", "L'": "mặt trái ngược", "L2": "mặt trái 2 bước",
    "F": "mặt trước", "F'": "mặt trước ngược", "F2": "mặt trước 2 bước",
    "B": "mặt sau", "B'": "mặt sau ngược", "B2": "mặt sau 2 bước",
    "M": "slice giữa (R)", "M'": "slice giữa ngược", "M2": "slice giữa 2 bước",
    "r": "hai lớp phải (Rw)", "r'": "hai lớp phải ngược", "r2": "hai lớp phải 2 bước",
    "l": "hai lớp trái (Lw)", "l'": "hai lớp trái ngược", "l2": "hai lớp trái 2 bước",
    "u": "hai lớp trên (Uw)", "u'": "hai lớp trên ngược", "u2": "hai lớp trên 2 bước",
    "x": "xoay toàn khối (x)", "x'": "xoay toàn khối ngược",
    "y": "xoay toàn khối (y)", "y'": "xoay toàn khối ngược",
    "z": "xoay toàn khối (z)", "z'": "xoay toàn khối ngược",
}


def move_note(token):
    """A one-line, always-correct description of a single move token."""
    return MOVE_NAMES.get(token, f"động tác {token}")


def build_teaching(label, alg_text):
    """Recognition cue and chunk breakdown for a named case.

    The recognition line is hand-written and professional.  Each chunk's note
    is generated from the moves actually in that chunk, so the note can never
    disagree with the algorithm it sits under -- no curated per-chunk prose
    to drift out of sync with the engine."""
    tokens = [t for t in alg_text.split() if t]
    chunks = []
    step = 2
    for i in range(0, len(tokens), step):
        grp = tokens[i:i + step]
        note = " rồi ".join(move_note(t) for t in grp)
        chunks.append({"text": " ".join(grp), "note": note})
    return {"recognise": RECOGNISE.get(label, ""), "mnemonic": MNEMONIC.get(label, ""),
            "chunks": chunks, "has_notes": label in RECOGNISE or label in MNEMONIC}


def _triples(goals, cache: StageCache):
    """(coord, table, target) triples, the form both the scan and IDA* take."""
    out = []
    for g in goals:
        if g.seeds is not None:
            out.append((g.coord.coord, cache.table_for(g, N.MASK_OUTER), 0))
        else:
            out.append((g.coord.coord, -1, g.coord.target))
    return out


def _holds(cube: N.Cube, goals, cache: StageCache) -> bool:
    """Does this cube satisfy the family's goal?  The same test `Method.solve`
    uses, so a card cannot claim an algorithm the engine would not accept."""
    for g in goals:
        if g.seeds is not None:
            if N.table_lookup(cache.table_for(g, N.MASK_OUTER),
                              g.coord.encode(cube)) != 0:
                return False
        elif g.coord.encode(cube) != g.coord.target:
            return False
    return True


U = N.parse_move("U")

# The goals again under their own name, used to work out the AUF a card needs.
# They carry no orbit freedom -- the family goals above are already exact -- so
# every published word finishes the cube and `auf` comes out 0; the AUF a case
# needs is folded into the word instead (that is the `+aufN` in `via`, and the
# `pre_auf`/`post_auf` on a textbook word).
EXACT_GOALS = {
    "OLL": CL.OLL_DONE,
    "PLL": CL.PLL_DONE,
    "CLL": (CL.LL_CORNERS, CL.EO_LL),
    "COLL": (CL.LL_CORNERS, CL.EO_LL),
    "ELL": CL.PLL_DONE,
}


def _apply(cube: N.Cube, moves) -> N.Cube:
    c = cube.copy()
    c.apply_moves(list(moves))
    return c


def _ll_state(cube: N.Cube) -> tuple:
    """Read a cube's last layer back as the (se, te, sc, tc) tuple.

    The inverse of `B.cube_of`, so a case that has been turned can be published
    as a state again -- and the caller asserts that the round trip is exact.
    """
    pm = cube.pmap()
    return (tuple(C.U_EDGES.index(pm.piece[s]) for s in C.U_EDGES),
            tuple(pm.orient[s] for s in C.U_EDGES),
            tuple(C.U_CORNERS.index(pm.piece[s]) for s in C.U_CORNERS),
            tuple(pm.orient[s] for s in C.U_CORNERS))


def _displaced(perm) -> int:
    """How many of the four are not where they belong."""
    return sum(1 for i, x in enumerate(perm) if x != i)


# Families whose cases are only defined up to a turn of the top face.  For those
# `sorted(fam.orbits)` hands back whichever alignment sorts first, and that is
# arbitrary: the H-perm arrives as H followed by U2, so its card draws two
# swapped *corners*, and the Level 1 step "edges in their slots" -- which is
# supposed to be the H, Z and U perms -- finds nothing at all.  Turning the last
# layer to the alignment a cuber recognises fixes the picture, the words and the
# curriculum in one move.  The other families are left exactly as they come:
# their representatives are already drawn the way the charts draw them, and for
# OLL and ELL no turn could change anything a card reports.
SPIN_FAMILIES = ("PLL",)


def canonical_spin(state) -> tuple:
    """(the state turned to its recognisable alignment, how far it was turned).

    Of the four alignments, take the one with the corners home; failing that the
    one with the fewest pieces out of place; failing that the one with the edges
    home; and failing all of that no turn at all.  That is what puts the H, Z,
    Ua and Ub perms back onto their edges, and what leaves a J-perm's adjacent
    swap drawn as an adjacent swap instead of as a pair of 4-cycles.
    """
    def align(j):
        return _apply(B.cube_of(state), [U] * j) if j else B.cube_of(state)

    def rank(j):
        st = _ll_state(align(j))
        return (_displaced(st[2]) > 0,                     # corners home first
                _displaced(st[2]) + _displaced(st[0]),     # then fewest loose
                _displaced(st[0]) > 0,                     # then edges home
                j)                                         # then the least turn

    j = min(range(4), key=rank)
    if j == 0:
        return state, 0
    spun = _ll_state(align(j))
    assert facelet_state(B.cube_of(spun)) == facelet_state(align(j)), \
        "spin did not survive the state round trip"
    return spun, j


def _one(book: B.Book, cube: N.Cube, goals, triples, cache, solvers, exact):
    """The shortest word the book can give for one position.

    Three ways to ask, cheapest and strongest first:

    1. the ball scan -- every element the sweep reached, shortest first, tested
       against the goal.  Optimal, and it does not care how big the goal set is;
    2. the meet in the middle -- two halves that are each inside the ball, which
       reaches twice the swept depth and is still exact;
    3. nothing, which the caller reports rather than papers over.
    """
    r = N.ll_scan(book._b, cube, triples)
    if r.ok:
        return list(r.moves), "scan"
    if exact:
        mv = N.ll_product(book._b, cube, [0])
    else:
        res = solvers.solve(cube)
        mv = list(res.moves) if res is not None else None
    return (mv, "meet-in-the-middle") if mv else ([], "none")


def algorithm_for(book: B.Book, state, goals, triples, cache, solvers, exact):
    """The shortest algorithm for one case, and how it was found.

    A case is drawn in one particular alignment, but a real solve meets it after
    whatever turn of the top face the previous step happened to leave, and the
    family quotients that turn out.  So all four alignments are tried and the
    shortest wins: the algorithm on the card solves the case exactly as drawn,
    with the opening turn of the top face folded into it.  For a goal that a
    turn of the top face cannot break -- orientation -- the four come out equal
    and this costs nothing but time.
    """
    cube = B.cube_of(state)
    best = None
    for k in range(4):
        pre = [U] * k
        mv, via = _one(book, _apply(cube, pre), goals, triples, cache, solvers, exact)
        if not mv:
            continue
        full = N.optimize(pre + mv)
        c2 = _apply(cube, full)
        if not _holds(c2, goals, cache):
            continue
        # Ranked by stm, not htm: a slice turn is one move in the notation
        # people write and learn, and ranking by htm would prefer a 10-move
        # outer-turn word over the standard M2 U M2 U2 M2 U M2.
        cost = (N.seq_cost(N.STM, full), N.seq_cost(N.HTM, full), len(full))
        if best is None or cost < best[0]:
            best = (cost, full, via + (f"+auf{k}" if k else ""))
    if best is None:
        return [], "none", _holds(cube, goals, cache)
    return best[1], best[2], True


def auf_of(cube: N.Cube, mv, goals, cache) -> int:
    """How many turns of the U face finish the cube after `mv` (0-3)."""
    for k in range(4):
        if _holds(_apply(cube, list(mv) + [U] * k), goals, cache):
            return k
    return -1


def textbook_word(cube: N.Cube, word: list[int], goals, cache):
    """The familiar word, made exact for this case -- or None.

    Two alignments have to be found, and both matter:

    * a turn of the top face *before* the word, because a textbook algorithm is
      written for a case held one particular way while a derived case is drawn
      in whatever alignment its orbit representative landed in;
    * a turn of the top face *after* it, because "H-perm: M2 U M2 U2 M2 U M2"
      solves the permutation only up to that final AUF, and every other word
      this file publishes is exact.

    So all sixteen combinations are tried and the shortest one that satisfies
    the family goal exactly is kept, tested with the same `_holds` the engine
    word is tested with -- not with the looser "is it in the goal element set"
    question, which cannot see an outstanding AUF.  Returns None when no
    combination works, which is how a mis-typed TEXTBOOK entry is caught
    instead of printed on a card.

    Note what "satisfies the goal" means here: these goals carry no AUF freedom
    at all, so a word is accepted only when it leaves the cube *finished* -- for
    PLL and ELL literally solved, corners and edges home at the same time.  A
    word that got the corners home at one turn of the top face and the edges at
    another is rejected, which is the mistake a looser goal would wave through.
    """
    best = None
    for k in range(4):
        head = _apply(cube, [U] * k)
        for j in range(4):
            full = N.optimize([U] * k + list(word) + [U] * j)
            if not _holds(_apply(cube, full), goals, cache):
                continue
            cost = (N.seq_cost(N.STM, full), N.seq_cost(N.HTM, full), len(full))
            if best is None or cost < best[0]:
                best = (cost, full, k, j)
    return None if best is None else {"moves": best[1], "pre_auf": best[2],
                                      "post_auf": best[3]}


def algorithms_data(book: B.Book) -> dict:
    out = {"generated_by": "scripts/gen_web_data.py",
           "book_swept": book.swept, "families": {}}
    cache = StageCache()
    for family, info in FAMILY_INFO.items():
        goal_name, goals, exact, goal_text = FAMILY_GOALS[family]
        triples = _triples(goals, cache)
        solver = L.LlSolver(book, goal_name)
        fam = K.FAMILIES[family]()
        named = {label: N.parse_seq(text)
                 for label, text in TEXTBOOK.get(family, {}).items()}
        teach_hits: dict[str, list[int]] = {label: [] for label in named}
        cases = []
        for i, (state, element, orbit, rep) in enumerate(book.case_elements(family)):
            spin = 0
            if family in SPIN_FAMILIES:
                # Same case, same orbit, drawn the way it is recognised.  The
                # element has to follow the state or the book lookup would ask
                # for the old alignment.
                state, spin = canonical_spin(state)
                element = B.element_of(state)
            mv, via, ok = algorithm_for(book, state, goals, triples, cache,
                                        solver, exact)
            cube = B.cube_of(state)
            auf = auf_of(cube, mv, EXACT_GOALS[family], cache)
            names, teach = [], None
            for label, amv in named.items():
                hit = textbook_word(cube, amv, goals, cache)
                if hit is None:
                    continue
                names.append(label)
                teach_hits[label].append(i)
                full = hit["moves"]
                cost = (N.seq_cost(N.STM, full), N.seq_cost(N.HTM, full), len(full))
                if teach is None or cost < teach[0]:
                    teach = (cost, label, full, hit)
            cases.append({
                "i": i,
                # `element` is the book's dense last-layer index.  Two CLL/COLL
                # case states can share one, because those families spell
                # corners only and a corner permutation of the wrong parity
                # collides with a legal one in that index.  `key` is what the
                # site tracks progress against, and it is unique by
                # construction.
                "key": f"{family}:{i}",
                "family": family,
                "names": names,
                "element": element,
                "orbit": orbit,
                # turns of U applied to the orbit representative before drawing
                # it, so the alignment on the card can always be reproduced
                "canonical_auf": spin,
                "state": facelet_state(cube),
                "algorithm": N.format_seq(mv),
                "moves": list(mv),
                "htm": N.seq_cost(N.HTM, mv),
                "qtm": N.seq_cost(N.QTM, mv),
                "stm": N.seq_cost(N.STM, mv),
                "etm": N.seq_cost(N.ETM, mv),
                "via": via,
                "verified": ok,
                "auf": auf,
                "auf_text": N.format_seq([U] * auf) if auf > 0 else "",
                "optimal_within": book.swept if via == "scan" else book.swept * 2,
                "metric": "stm",
                "desc": describe(state),
            })
            if teach is not None:
                _, label, full, hit = teach
                teaching = build_teaching(label, N.format_seq(full))
                cases[-1]["teach"] = {
                    "name": label,
                    "algorithm": N.format_seq(full),
                    "moves": list(full),
                    "htm": N.seq_cost(N.HTM, full),
                    "qtm": N.seq_cost(N.QTM, full),
                    "stm": N.seq_cost(N.STM, full),
                    "etm": N.seq_cost(N.ETM, full),
                    "pre_auf": hit["pre_auf"],
                    "post_auf": hit["post_auf"],
                    # asked again of the finished cube, so the field in the
                    # JSON is a result and not a restatement of the code above
                    "verified": _holds(_apply(cube, full), goals, cache),
                    "recognise": teaching["recognise"],
                    "mnemonic": teaching["mnemonic"],
                    "chunks": teaching["chunks"],
                    "has_notes": teaching["has_notes"],
                }
            if not ok or auf < 0:
                print(f"   !! {family} case {i}: {N.format_seq(mv)} does not reach "
                      f"the goal ({via}, auf={auf})", file=sys.stderr)
        for label, hits in teach_hits.items():
            if not hits:
                print(f"   !! {family}: TEXTBOOK {label!r} solved no case -- dropped",
                      file=sys.stderr)
            elif len(hits) > 1:
                print(f"   !! {family}: TEXTBOOK {label!r} solved {len(hits)} cases "
                      f"{hits} -- ambiguous, dropped", file=sys.stderr)
                for c in cases:
                    if c["i"] in hits[1:]:
                        c["names"] = [n for n in c["names"] if n != label]
                        if c.get("teach", {}).get("name") == label:
                            c.pop("teach")
        have = [c for c in cases if c["moves"]]
        trivial = [c for c in cases if c["htm"] == 0]
        out["families"][family] = {
            **info,
            "key": family,
            "goal": goal_text,
            "symmetry": fam.symmetry,
            "cases": len(cases),
            "non_trivial": len(cases) - len(trivial),
            "with_algorithm": len(have),
            "all_verified": all(c["verified"] and c["auf"] >= 0 for c in cases),
            "longest": max((c["stm"] for c in have), default=0),
            "mean": round(sum(c["stm"] for c in have) / len(have), 2) if have else None,
            "mean_htm": round(sum(c["htm"] for c in have) / len(have), 2) if have else None,
            "with_textbook": sum(1 for c in have if c.get("teach")),
            "list": cases,
        }
    cases = [c for b in out["families"].values() for c in b["list"]]
    out["cases"] = len(cases)
    out["to_learn"] = sum(1 for c in cases if c["moves"])
    out["named"] = sum(1 for c in cases if c["names"])
    out["with_textbook"] = sum(1 for c in cases if c.get("teach"))
    out["metric"] = "stm"
    out["mean"] = round(sum(c["stm"] for c in cases if c["moves"]) / out["to_learn"], 2)
    out["longest"] = max((c["stm"] for c in cases if c["moves"]), default=0)
    keys = [c["key"] for c in cases]
    assert len(set(keys)) == len(keys), "case keys are not unique"
    return out


# --------------------------------------------------------------------------- #
# methods and levels
# --------------------------------------------------------------------------- #
MASK_NAMES = {N.MASK_OUTER: "18 động tác mặt ngoài", N.MASK_MU: "chỉ <M, U>",
              N.MASK_ULR: "chỉ <U, R, L>", N.MASK_SLICE: "chỉ các slice"}


def methods_data() -> dict:
    out = {"generated_by": "scripts/gen_web_data.py", "methods": {}}
    for name, m in METHODS.items():
        out["methods"][name] = {
            "name": m.name,
            "family": m.family,
            "description": m.description,
            "reference": m.reference,
            "path": m.stage_summary(),
            "algs_by_tier": m.algs_by_tier,
            "stages": [{
                "name": s.name,
                "note": s.note,
                "mask": MASK_NAMES.get(s.mask, hex(s.mask)),
                "intuitive": s.intuitive,
                "algs": s.algs,
                "alg_family": s.alg_family,
                "ll_goal": s.ll_goal,
                "align_centres": s.align_centres,
                "alternatives": len(s.candidate_goals()),
                "heuristics": [h.coord.name for h in s.heur],
                "goal": [g.coord.name + ("*" if g.seeds is not None else "")
                         for g in s.goal],
            } for s in m.stages],
        }
    return out


LEVEL_INFO = {
    "essence": {
        "order": 1, "title": "Q-FOX · Tinh hoa",
        "who": "Muốn công thức nhanh nhất, ít công thức cần nhớ nhất: "
               "hai khối mở khóa, rồi tra sách lớp cuối.",
        "promise": "Mười bảy thuật toán nhận dạng để luyện tập, còn giải thì "
                   "không cần nhớ gì -- sách tra trả lớp cuối trong một bước "
                   "tối ưu có chứng minh, nhanh hơn mọi phương pháp 3x3.",
        "how": "một bước sách tra lớp cuối: không cần thuật toán, ngắn nhất",
        "path": "Q-FOX",
    },
    "easy": {
        "order": 2, "title": "Q-FOX · Easy",
        "who": "Muốn nhận diện rõ ràng, dễ học: lớp cuối chia hai bước quen "
               "đặt OLL rồi PLL.",
        "promise": "Bảng nhận diện đầy đủ nhất: toàn bộ OLL (57) và toàn bộ "
                   "PLL (21), 78 công thức. Sách tra vẫn trả mỗi bước trong "
                   "bước tối ưu, nên tốc độ giải gần như tinh hoa.",
        "how": "OLL rồi PLL, mỗi bước sách tra tối ưu",
        "path": "Q-FOX easy",
    },
    "medium": {
        "order": 3, "title": "Q-FOX · Medium",
        "who": "Muốn gọn hơn easy: CMLL (xếp góc + hướng cạnh) rồi PLL.",
        "promise": "63 công thức (CMLL 42 + PLL 21). Nhận diện gọn, hai bước "
                   "sách tra vẫn tối ưu.",
        "how": "CMLL rồi PLL, mỗi bước sách tra tối ưu",
        "path": "Q-FOX medium",
    },
    "tiny": {
        "order": 4, "title": "Q-FOX · Tiny",
        "who": "Muốn bản gọn nhẹ, ít công thức: CMLL rồi phần còn lại sách tra.",
        "promise": "42 công thức (COLL), bảng nhận diện tinh gọn. Tốc độ giải "
                   "vẫn tối ưu nhờ sách tra cho bước còn lại.",
        "how": "COLL rồi bước còn lại sách tra một bước",
        "path": "Q-FOX tiny",
    },
    "low": {
        "order": 5, "title": "Q-FOX · Low",
        "who": "Muốn tối giản: chỉ nhận CMLL, phần còn lại sách tra một bước.",
        "promise": "42 công thức (CMLL), ít công thức nhớ nhất trong các bản "
                   "đa bước. Sách tra hoàn tất phần còn lại trong một bước.",
        "how": "CMLL rồi phần còn lại sách tra một bước",
        "path": "Q-FOX low",
    },
    "flow": {
        "order": 6, "title": "Q-FOX · Flow",
        "who": "Muốn nhanh nhất và nhớ ít nhất: cả lớp cuối một bước sách tra.",
        "promise": "21 công thức (PLL) để luyện nhận diện, còn giải thì cả "
                   "lớp cuối hoàn tất trong một bước sách tra tối ưu -- nhanh "
                   "bằng tinh hoa, ít công thức cần nhớ.",
        "how": "một bước sách tra toàn bộ lớp cuối",
        "path": "Q-FOX flow",
    },
}


# --------------------------------------------------------------------------- #
# what each level actually asks you to memorise
# --------------------------------------------------------------------------- #
# A curriculum item is a family plus conditions on the case description, so the
# set is derived and countable rather than hand-listed.  "field": "value" keeps
# the cases whose `desc[field]` reads exactly that; a leading "!" inverts it.
# scripts/validate_web_data.py re-evaluates every condition against the export,
# in both directions, so a card cannot drift into or out of a level unnoticed.
CURRICULUM = {
    "essence": [
        {"id": "top-cross", "title": "Bước 1 - làm cross trên mặt trên",
         "why": "Chỉ cần 4 cạnh trên, và có ba hình cần nhận: một chấm, một "
                "dòng, hoặc một chữ L. Các góc được bỏ qua có chủ đích, nên "
                "bước này không bao giờ có nhiều hơn một thứ để nhìn.",
         "family": "OLL", "where": {"corners": "cả bốn góc xác định hướng"}},
        {"id": "top-face", "title": "Bước 2 - lấp đầy mặt trên",
         "why": "Cross đã có sẵn, nên đây là tám bài chỉ xoay các góc. Sune "
                "và antisune chung nhau bao quát hết.",
         "family": "OLL", "where": {"edges": "cả bốn cạnh xác định hướng"}},
        {"id": "corners-home", "title": "Bước 3 - góc vào đúng khe",
         "why": "Cạnh để yên: đây là các hoán vị chỉ di chuyển góc, nên mặt "
                "trên vẫn vàng trong khi các mặt bên xếp vào.",
         "family": "PLL",
         "where": {"edge_cycles": "đã hoàn thành", "corner_cycles": "!đã hoàn thành"}},
        {"id": "edges-home", "title": "Bước 4 - cạnh vào đúng khe",
         "why": "Lần nhìn cuối: các góc đã về chỗ, nên chỉ 4 cạnh trên hoán "
                "vị. Hai trong bốn bài này là các U-perm quen thuộc.",
         "family": "PLL",
         "where": {"corner_cycles": "đã hoàn thành", "edge_cycles": "!đã hoàn thành"}},
    ],
    # The human tiers re-split the same last layer.  Each item lists a whole
    # recognition family (no `where` filter), so the level's formula count is
    # the family's full non-trivial case count -- countable and verifiable.
    "easy": [
        {"id": "oll-full", "title": "Bước 1 - xác định hướng toàn bộ lớp cuối (OLL)",
         "why": "Nhận hết 57 hình OLL: các cạnh và góc lớp cuối xác định hướng, "
                "hoán vị chưa quan trọng. Sách tra trả bước này trong bước tối ưu.",
         "family": "OLL", "where": {}},
        {"id": "pll-full", "title": "Bước 2 - hoán vị toàn bộ lớp cuối (PLL)",
         "why": "Hướng đã đúng, nhận hết 21 bài PLL để xếp 8 mảnh về đúng "
                "chỗ. Sách tra trả bước này trong bước tối ưu.",
         "family": "PLL", "where": {}},
    ],
    "medium": [
        {"id": "cmll-full", "title": "Bước 1 - xếp góc và hướng cạnh (CMLL)",
         "why": "Nhận hết 42 bài CMLL: 4 góc về khe, 4 cạnh lớp cuối xác định "
                "hướng. Gọn hơn toàn bộ OLL.",
         "family": "CLL", "where": {}},
        {"id": "pll-full", "title": "Bước 2 - hoán vị phần còn lại (PLL)",
         "why": "Hướng đã xong, nhận 21 bài PLL xếp các mảnh còn lại về "
                "đúng chỗ.",
         "family": "PLL", "where": {}},
    ],
    "tiny": [
        {"id": "coll-full", "title": "Bước 1 - góc đã giải, cạnh đã hướng (COLL)",
         "why": "Bảng nhận diện tinh gọn: 42 bài COLL, nhận theo hình dáng "
                "hướng của các góc. Bước còn lại sách tra một bước.",
         "family": "COLL", "where": {}},
    ],
    "low": [
        {"id": "cmll-full", "title": "Bước 1 - xếp góc và hướng cạnh (CMLL)",
         "why": "Chỉ cần nhận 42 bài CMLL. Phần còn lại của lớp cuối sách tra "
                "hoàn tất trong một bước, không cần nhớ thêm.",
         "family": "CLL", "where": {}},
    ],
    "flow": [
        {"id": "pll-full", "title": "Nhận diện PLL -- lớp cuối một bước sách tra",
         "why": "Cả lớp cuối hoàn tất trong một bước sách tra tối ưu. 21 bài "
                "PLL để luyện nhận diện là toàn bộ công thức cần nhớ.",
         "family": "PLL", "where": {}},
    ],
}


def _matches(case: dict, where: dict) -> bool:
    for field, want in where.items():
        got = (case.get("desc") or {}).get(field)
        if want.startswith("!"):
            if got == want[1:]:
                return False
        elif got != want:
            return False
    return True


def curriculum_for(key: str, algs: dict) -> tuple[list[dict], int]:
    """Resolve a level's curriculum into concrete case lists.

    Returns the items (each with the elements it selected and how many of them
    are worth memorising) and the number of distinct non-trivial algorithms the
    whole level asks for.
    """
    items = []
    seen = set()
    for item in CURRICULUM.get(key, []):
        block = algs["families"][item["family"]]
        picked = [c for c in block["list"] if _matches(c, item["where"])]
        rows = []
        for c in picked:
            if c["algorithm"]:
                seen.add(c["algorithm"])
            row = {"key": c["key"], "i": c["i"], "family": c["family"],
                   "element": c["element"], "names": c["names"],
                   "htm": c["htm"], "stm": c["stm"],
                   "algorithm": c["algorithm"],
                   "pattern": c["desc"]["pattern"],
                   "permutation": c["desc"]["permutation"]}
            if c.get("teach"):
                row["teach"] = {"name": c["teach"]["name"],
                                "algorithm": c["teach"]["algorithm"],
                                "stm": c["teach"]["stm"]}
            rows.append(row)
        items.append({
            **{k: v for k, v in item.items() if k != "where"},
            "family": item["family"], "where": item["where"],
            "family_title": block["title"], "goal": block["goal"],
            "cases": rows, "selected": len(picked),
            "to_learn": sum(1 for c in picked if c["algorithm"]),
            # the mean of the cards this step lists, in the metric the cards
            # quote -- `stm`, which the site calls "moves".  Not `mean_htm`:
            # that key means the engine's own htm on a family block, and a step
            # average labelled htm while the cards beside it say "moves" would
            # be two different numbers under one word.
            "mean_moves": round(sum(c["stm"] for c in picked if c["stm"])
                                / max(1, sum(1 for c in picked if c["stm"])), 2),
        })
    return items, len(seen)


def levels_data(algs: dict, bench: dict | None) -> dict:
    out = {"generated_by": "scripts/gen_web_data.py", "levels": []}
    for key, info in sorted(LEVEL_INFO.items(), key=lambda kv: kv[1]["order"]):
        method = METHODS[info["path"]]
        algs_by_tier = method.algs_by_tier
        how = info["how"]
        # A level's family summary is the families its curriculum actually
        # draws from, not a hand-set `level` tag -- so a level always shows the
        # recognition sets it teaches, whatever their primary home is.
        curr_fams = sorted({it["family"] for it in CURRICULUM.get(key, [])})
        families = {}
        for fam in curr_fams:
            data = algs["families"].get(fam)
            if data:
                families[fam] = {"cases": data["cases"],
                                 "non_trivial": data["non_trivial"],
                                 "mean": data["mean"], "longest": data["longest"]}
        row = {
            "key": key, **{k: v for k, v in info.items() if k != "order"},
            "algs": algs_by_tier[key],
            "families": families,
            "how": how,
            "method": method.description,
            "path": method.stage_summary(),
            "stages": [{"name": s.name, "note": s.note,
                        "algs": s.algs, "intuitive": s.intuitive,
                        "alg_family": s.alg_family} for s in method.stages],
        }
        items, distinct = curriculum_for(key, algs)
        row["curriculum"] = items
        row["distinct_algorithms"] = distinct
        if bench:
            for r in bench.get("results", []):
                if r.get("method") == info["path"]:
                    row["benchmark"] = {"htm": r["htm"]["mean"],
                                        "qtm": r["qtm"]["mean"],
                                        "seconds": r["seconds"]["mean"],
                                        "solved": r["solved"],
                                        "scrambles": r["scrambles"]}
        out["levels"].append(row)
    return out


def book_data(book: B.Book) -> dict:
    hist = book.histogram()
    return {
        "generated_by": "scripts/gen_web_data.py",
        "swept": book.swept,
        "elements": N.LL_N,
        "found": book._b.nfound,
        "coverage": round(100.0 * book._b.nfound / N.LL_N, 2),
        "nodes": int(book._b.nodes),
        "histogram": {str(k): v for k, v in sorted(hist.items())},
        "reachable_by": book.swept * 2,
        "note": "Các phần tử vượt quá độ quét vẫn được giải tối ưu bằng cách "
                "chia câu trả lời thành hai nửa đều nằm trong đó.",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "web" / "data"))
    ap.add_argument("--benchmark", default=str(ROOT / "results" / "benchmark.json"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    book = B.Book()
    print(f"book: swept {book.swept}, {book._b.nfound}/{N.LL_N} elements")

    eng = engine_data()
    with open(os.path.join(args.out, "engine.json"), "w") as f:
        json.dump(eng, f, separators=(",", ":"))
    print(f"engine.json   {len(eng['moves'])} moves")

    algs = algorithms_data(book)
    with open(os.path.join(args.out, "algorithms.json"), "w") as f:
        json.dump(algs, f, separators=(",", ":"))
    named = sum(len(c["names"]) for fam in algs["families"].values()
                for c in fam["list"])
    print(f"algorithms.json {sum(f['cases'] for f in algs['families'].values())} "
          f"cases, {named} with a textbook name")
    for fam, d in algs["families"].items():
        # lengths are stm: a slice turn is one move, the way notation counts it
        print(f"   {fam:6s} {d['cases']:3d} cases  {d['non_trivial']:3d} to learn  "
              f"mean {d['mean']:5.2f} moves  longest {d['longest']:2d}  "
              f"familiar {d['with_textbook']:2d}  "
              f"verified {'yes' if d['all_verified'] else 'NO'}")

    meth = methods_data()
    with open(os.path.join(args.out, "methods.json"), "w") as f:
        json.dump(meth, f, separators=(",", ":"), indent=None)
    print(f"methods.json  {len(meth['methods'])} methods")

    bench = None
    if os.path.exists(args.benchmark):
        with open(args.benchmark) as f:
            bench = json.load(f)
        with open(os.path.join(args.out, "benchmark.json"), "w") as f:
            json.dump(bench, f, separators=(",", ":"))
        print("benchmark.json copied")

    lev = levels_data(algs, bench)
    with open(os.path.join(args.out, "levels.json"), "w") as f:
        json.dump(lev, f, separators=(",", ":"))
    print(f"levels.json   {len(lev['levels'])} levels")

    bk = book_data(book)
    with open(os.path.join(args.out, "book.json"), "w") as f:
        json.dump(bk, f, separators=(",", ":"))
    print(f"book.json     {bk['coverage']}% swept, exact out to {bk['reachable_by']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
