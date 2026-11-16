#!/usr/bin/env python3
"""Validate ``web/data/*.json`` against the C engine before the site ships.

Five layers, all of them checked *by the engine* -- nothing here re-implements
cube mechanics, it only asks the engine and compares:

1.  **Geometry.**  The web visualiser draws 26 cubies on a 3-D grid and animates
    layer turns, which needs a facelet -> (cell, direction) map and a
    family -> (axis, layers, sense) table.  Both are cross-checked against
    ``engine.json``'s ``moves[].perm`` for **all 54 moves**: the permutation the
    geometric model implies must equal the engine's, facelet for facelet.
2.  **Algorithms.**  Every published case is replayed: the engine takes the
    case's ``state``, applies ``algorithm``, and the family goal (the same
    ``Goal`` objects ``Method.solve`` uses) must hold afterwards -- and must not
    hold beforehand, so a card can never be a no-op.  Move costs are re-counted
    in all four metrics, and the AUF is re-derived.
3.  **Stickers.**  The same words replayed again, but judged by colour instead
    of by coordinate: after a card's algorithm and its AUF, the stickers must
    say the cube is *finished*, not merely that each goal condition is
    satisfied on its own.  This is what catches a word that leaves the corners
    home at one AUF and the edges at another.
4.  **Alignment.**  A case is drawn in the alignment a cuber recognises, the
    turn that got it there is recorded in ``canonical_auf``, and turning it
    back must land on the orbit representative the case was derived from.  The
    permutations that move only edges must be exactly the H, Z, Ua and Ub
    perms, because Level 1's last step selects on that, and no curriculum step
    anywhere may select nothing.
5.  **Schema.**  The keys and numbers the site renders must exist and agree with
    the engine's own last-layer book.

Usage::

    python3 scripts/validate_web_data.py [--data web/data] [-q]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for p in (ROOT, HERE):
    if p not in sys.path:
        sys.path.insert(0, p)

from qfox import native as N                                   # noqa: E402
from qfox.alggen import book as B                              # noqa: E402
from qfox.methods.base import StageCache                       # noqa: E402
import gen_web_data as G                                       # noqa: E402

# --------------------------------------------------------------------------
# 1. geometry -- the model the browser cube is drawn from
# --------------------------------------------------------------------------
# face -> (outward normal, direction row 0->2 runs in, direction col 0->2 runs in)
_FACE_AXES = {
    "U": ((0, 1, 0), (0, 0, 1), (1, 0, 0)),    # rows run towards F, cols towards R
    "F": ((0, 0, 1), (0, -1, 0), (1, 0, 0)),   # rows run towards D, cols towards R
    "R": ((1, 0, 0), (0, -1, 0), (0, 0, -1)),  # cols run towards B
    "B": ((0, 0, -1), (0, -1, 0), (-1, 0, 0)), # cols run towards L
    "L": ((-1, 0, 0), (0, -1, 0), (0, 0, 1)),  # cols run towards F
    "D": ((0, -1, 0), (0, 0, -1), (1, 0, 0)),  # rows run towards B, cols towards R
}

# family -> (axis, cells taken, sense).  sense = -1 is a clockwise quarter turn
# seen from the +axis end (a right-handed rotation of -90 degrees).
FAMILY_TURNS = {
    "U": ("y", (1,), -1),      "D": ("y", (-1,), +1),
    "R": ("x", (1,), -1),      "L": ("x", (-1,), +1),
    "F": ("z", (1,), -1),      "B": ("z", (-1,), +1),
    "M": ("x", (0,), +1),      "E": ("y", (0,), +1),   "S": ("z", (0,), -1),
    "u": ("y", (1, 0), -1),    "d": ("y", (-1, 0), +1),
    "r": ("x", (1, 0), -1),    "l": ("x", (-1, 0), +1),
    "f": ("z", (1, 0), -1),    "b": ("z", (-1, 0), +1),
    "x": ("x", (1, 0, -1), -1),
    "y": ("y", (1, 0, -1), -1),
    "z": ("z", (1, 0, -1), -1),
}
AXIS_INDEX = {"x": 0, "y": 1, "z": 2}
POWERS = {"": 1, "'": 3, "2": 2}


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def facelet_geometry(net):
    """``(cells, dirs)``: two 54-entry lists of triples, indexed by facelet id.

    ``cells[i]`` is the cubie the facelet belongs to (x = R-L, y = U-D,
    z = F-B, each in -1..1) and ``dirs[i]`` is the outward direction it shows.
    """
    cells = [None] * 54
    dirs = [None] * 54
    for face, rows in net.items():
        normal, raxis, caxis = _FACE_AXES[face]
        for r, row in enumerate(rows):
            for c, idx in enumerate(row):
                cells[idx] = _add(_add(_mul(raxis, r - 1), _mul(caxis, c - 1)),
                                  normal)
                dirs[idx] = normal
    if any(v is None for v in cells):
        raise ValueError("net does not cover all 54 facelets")
    return cells, dirs


def _rot90(axis, sense, v):
    """Quarter turn about ``axis``; ``sense`` is sin(theta), so -1 is the
    clockwise turn seen from the positive end of that axis."""
    x, y, z = v
    if axis == "x":
        return (x, -sense * z, sense * y)
    if axis == "y":
        return (sense * z, y, -sense * x)
    return (-sense * y, sense * x, z)


def model_perm(name, cells, dirs):
    """The facelet permutation ``name`` implies, from the cubie model alone.

    A sticker on cell ``p`` facing ``d`` travels to cell ``R(p)`` facing
    ``R(d)``.  The engine stores a SOURCE map (``new[j] = old[perm[j]]``), so
    ``perm`` is inverted here to match.
    """
    axis, layers, sense = FAMILY_TURNS[name[0]]
    power = POWERS[name[1:]]
    ai = AXIS_INDEX[axis]

    def turn(v):
        for _ in range(power):
            v = _rot90(axis, sense, v)
        return v

    by_cell = {}
    for i in range(54):
        by_cell.setdefault(cells[i], []).append(i)

    perm = list(range(54))
    for cell, idxs in by_cell.items():
        if cell[ai] not in layers:
            continue
        dest = by_cell[turn(cell)]
        for i in idxs:
            want = turn(dirs[i])
            perm[next(k for k in dest if dirs[k] == want)] = i
    return perm


def check_geometry(eng):
    cells, dirs = facelet_geometry(eng["net"])
    bad = []
    for mv in eng["moves"]:
        mine = model_perm(mv["name"], cells, dirs)
        if mine != mv["perm"]:
            diff = [k for k in range(54) if mine[k] != mv["perm"][k]]
            bad.append((mv["name"], len(diff), diff[:6]))
    return (cells, dirs), bad


# --------------------------------------------------------------------------
# 2. algorithms -- replayed by the engine
# --------------------------------------------------------------------------

def check_algorithms(algs, quiet=False):
    cache = StageCache()
    goals = {fam: G.FAMILY_GOALS[fam][1] for fam in algs["families"]}
    exact = {fam: G.FAMILY_GOALS[fam][2] for fam in algs["families"]}
    bad = []
    seen = 0
    for fam, block in algs["families"].items():
        g = goals[fam]
        for case in block["list"]:
            seen += 1
            cid = case.get("key", case.get("i"))
            state = case.get("state")
            alg = case.get("algorithm") or ""
            if not state or len(state) != 54:
                bad.append(f"{fam}/{cid}: bad state")
                continue
            cube = N.Cube.from_facelets(state)
            if not case.get("verified"):
                bad.append(f"{fam}/{cid}: verified=false")
            if G._holds(cube, g, cache):
                if alg:
                    bad.append(f"{fam}/{cid}: case already satisfies the goal "
                               f"yet publishes {alg!r}")
                continue
            after = N.Cube.from_facelets(state)
            if alg:
                after.apply_str(alg)
            if not G._holds(after, g, cache):
                bad.append(f"{fam}/{cid}: {alg!r} does not reach the goal")
                continue
            moves = N.parse_seq(alg) if alg else []
            if list(case.get("moves") or []) != moves:
                bad.append(f"{fam}/{cid}: moves[] does not match algorithm")
            for metric, key in ((N.HTM, "htm"), (N.QTM, "qtm"),
                                (N.STM, "stm"), (N.ETM, "etm")):
                if case.get(key) != N.seq_cost(metric, moves):
                    bad.append(f"{fam}/{cid}: {key} {case.get(key)} != engine "
                               f"{N.seq_cost(metric, moves)}")
            if exact[fam] and case.get("auf") is not None:
                auf = G.auf_of(cube, moves, G.EXACT_GOALS[fam], cache)
                if auf != case["auf"]:
                    bad.append(f"{fam}/{cid}: auf {case['auf']} != engine {auf}")
            if alg and N.format_seq(moves) != alg:
                bad.append(f"{fam}/{cid}: algorithm text is not canonical "
                           f"({N.format_seq(moves)!r})")
            if fam in ("OLL", "PLL", "CLL", "COLL", "ELL") and \
                    not N.centres_aligned(after):
                bad.append(f"{fam}/{cid}: centres left misaligned")

            # the familiar word, when one is published, is what a learner will
            # actually type, so it gets exactly the same treatment
            tb = case.get("teach")
            if tb:
                if not tb.get("name"):
                    bad.append(f"{fam}/{cid}: teach has no name")
                tmoves = N.parse_seq(tb.get("algorithm") or "")
                if list(tb.get("moves") or []) != tmoves:
                    bad.append(f"{fam}/{cid}: teach.moves[] does not match its text")
                t2 = N.Cube.from_facelets(state)
                t2.apply_moves(tmoves)
                if not G._holds(t2, g, cache):
                    bad.append(f"{fam}/{cid}: teach {tb.get('name')!r} "
                               f"{tb.get('algorithm')!r} does not reach the goal")
                else:
                    for metric, key in ((N.HTM, "htm"), (N.QTM, "qtm"),
                                        (N.STM, "stm"), (N.ETM, "etm")):
                        if tb.get(key) != N.seq_cost(metric, tmoves):
                            bad.append(f"{fam}/{cid}: teach {key} {tb.get(key)} != "
                                       f"engine {N.seq_cost(metric, tmoves)}")
                    if not N.centres_aligned(t2):
                        bad.append(f"{fam}/{cid}: teach {tb.get('name')!r} leaves "
                                   f"the centres misaligned")
                    if N.format_seq(tmoves) != tb.get("algorithm"):
                        bad.append(f"{fam}/{cid}: teach text is not canonical")
                if tb.get("name") not in (case.get("names") or []):
                    bad.append(f"{fam}/{cid}: teach name {tb.get('name')!r} is not "
                               f"in names {case.get('names')}")
    if not quiet:
        print(f"      replayed with the engine, goals = "
              f"{ {k: len(v) for k, v in goals.items()} }")
    return seen, bad, cache


# --------------------------------------------------------------------------
# 2b. the same words, read off the stickers
# --------------------------------------------------------------------------
# Every other layer asks the engine's coordinates whether a word reaches a
# goal.  This one looks at the cube instead: which colours are where.  A bug in
# a coordinate, in a goal, or in the generator has nowhere to hide behind it,
# and it can say *why* in the terms a cuber would -- "the corners are home but
# the edges are two turns away, so this is a permutation short of done".
#
# It also replays the familiar word on the five trivial cases, which the
# algorithms layer above skips: a case that already satisfies its goal is
# never asked what its published word does.
#
# Nothing here assumes a facelet layout either.  The face a sticker belongs to
# comes from ``engine.json``'s own centre list, and the three stickers of each
# side face that the top layer carries come from its own permutation for U.

def _u_rows(eng) -> dict:
    """face -> the three facelets of it that a U turn moves."""
    perm = next(m for m in eng["moves"] if m["name"] == "U")["perm"]
    rows: dict[int, list[int]] = {}
    for i, j in enumerate(perm):
        if i != j and i // 9:                       # moved, and not the U face
            rows.setdefault(i // 9, []).append(i)
    out = {f: sorted(p) for f, p in rows.items()}
    assert len(out) == 4 and all(len(v) == 3 for v in out.values()), \
        f"U does not move three facelets on each of four sides: {out}"
    return out


def _ll_positions(eng) -> tuple[list[int], list[int]]:
    """(the eight corner stickers, the four edge stickers) around the U face.

    The middle sticker of a side face's top row belongs to an edge, the two
    beside it to corners.
    """
    corners, edges = [], []
    for face, row in _u_rows(eng).items():
        for pos in row:
            (edges if pos % 3 == 1 else corners).append(pos)
    assert len(corners) == 8 and len(edges) == 4, (corners, edges)
    return sorted(corners), sorted(edges)


class StickerCheck:
    """Is a cube finished, judged by colour alone?"""

    def __init__(self, eng):
        self.centres = list(eng["centres"])
        self.solved = G.facelet_state(N.Cube())
        self.corners, self.edges = _ll_positions(eng)
        rows = _u_rows(eng)
        self.f2l = [i for face, row in rows.items()
                    for i in range(face * 9, face * 9 + 9) if i not in row]
        self.top = list(range(eng["faces"].index("U") * 9,
                              eng["faces"].index("U") * 9 + 9))
        d = eng["faces"].index("D")
        self.f2l += list(range(d * 9, d * 9 + 9))    # the bottom face, whole
        self.U = N.parse_move("U")

    def _solid(self, s: str, positions) -> bool:
        """Every one of these stickers the colour of the face it sits on."""
        return all(s[i] == s[self.centres[i // 9]] for i in positions)

    def home_at(self, cube: N.Cube, positions) -> int | None:
        """How many turns of U still put these stickers where they belong."""
        for b in range(4):
            c = cube.copy()
            if b:
                c.apply_moves([self.U] * b)
            if self._solid(G.facelet_state(c), positions):
                return b
        return None

    def finished(self, cube: N.Cube, family: str) -> tuple[bool, str]:
        s = G.facelet_state(cube)
        if not self._solid(s, self.f2l):
            return False, "with the first two layers disturbed"
        if family == "OLL":
            top = self._solid(s, self.top)
            return top, ("" if top else "with the top face not solid")
        if family in ("PLL", "ELL"):
            # orientation is part of these goals and the permutation is the
            # whole of them, so "finished" is simply "solved"
            if s != self.solved:
                c, e = self.home_at(cube, self.corners), self.home_at(cube, self.edges)
                why = ("with the corners home only after U%d and the edges only "
                       "after U%d -- two different turns, so not one AUF short "
                       "but a permutation short" % (c, e)) if c != e else \
                      f"with the last layer {c if c == e else (c, e)} turns from home"
                return False, why
            return True, ""
        if family in ("CLL", "COLL"):
            top = self._solid(s, self.top)
            if not top:
                return False, "with the top face not solid"
            c = self.home_at(cube, self.corners)
            if c != 0:
                return False, ("with the corners not home" if c is None
                               else f"with the corners home only after U{c}")
            return True, ""
        return False, f"(no sticker goal written for family {family!r})"


def check_stickers(algs, eng):
    """Replay every published word and judge the cube by its colours."""
    chk = StickerCheck(eng)
    bad, seen = [], 0
    for fam, block in algs["families"].items():
        for case in block["list"]:
            seen += 1
            cid = case.get("key", case.get("i"))
            cube = N.Cube.from_facelets(case["state"])
            if G.facelet_state(cube) != case["state"]:
                bad.append(f"{fam}/{cid}: state does not survive a facelet round trip")
                continue
            words = [("algorithm", list(case.get("moves") or []), case.get("auf") or 0)]
            tb = case.get("teach")
            if tb:
                # the familiar word already carries its own AUF before and after
                words.append((f"teach {tb.get('name')!r}", list(tb.get("moves") or []), 0))
            for label, moves, auf in words:
                if not moves and not auf:
                    continue
                after = cube.copy()
                after.apply_moves(list(moves) + [chk.U] * auf)
                ok, why = chk.finished(after, fam)
                if not ok:
                    bad.append(f"{fam}/{cid}: {label} leaves the cube {why}")
    return seen, bad


# --------------------------------------------------------------------------
# 2c. the alignment a case is drawn in
# --------------------------------------------------------------------------

def check_alignment(algs, levels, book):
    """A card must draw its case the way a cuber would hold it.

    The orbit representative the book lists is whichever alignment of the top
    layer sorts first, which is arbitrary: the H-perm arrives as H followed by
    U2 and so draws two swapped *corners*.  ``gen_web_data`` turns such a case
    to the alignment that is recognisable and records the turn in
    ``canonical_auf``; this checks that the turn is honest and that it worked.
    """
    U = N.parse_move("U")
    bad = []
    for fam, block in algs["families"].items():
        elements = book.case_elements(fam)
        for case in block["list"]:
            cid = case.get("key", case.get("i"))
            spin = case.get("canonical_auf")
            if not isinstance(spin, int) or not 0 <= spin <= 3:
                bad.append(f"{fam}/{cid}: canonical_auf {spin!r} is not a turn count 0-3")
                continue
            if fam not in G.SPIN_FAMILIES and spin:
                bad.append(f"{fam}/{cid}: turned by U{spin} but this family is drawn as it comes")
            rep = elements[case["i"]][0]
            back = N.Cube.from_facelets(case["state"])
            back.apply_moves([U] * ((4 - spin) % 4))
            if G.facelet_state(back) != G.facelet_state(B.cube_of(rep)):
                bad.append(f"{fam}/{cid}: turning it back by U{(4 - spin) % 4} does not "
                           f"reach the orbit representative it was derived from")
            drawn = N.Cube.from_facelets(case["state"])
            if case.get("element") != B.element_of(G._ll_state(drawn)):
                bad.append(f"{fam}/{cid}: element {case.get('element')} is not the "
                           f"book index of the state the card draws")
        # One name per case, or a card is claiming somebody else's algorithm.
        names = [n for c in block["list"] for n in c["names"]]
        twice = sorted({n for n in names if names.count(n) > 1})
        if twice:
            bad.append(f"{fam}: {twice} name more than one case")
        if fam == "PLL":
            # How a PLL is recognised is a fact about the cube, not a choice
            # this project makes: the four permutations that turn edges and
            # leave every corner home are the H, Z, Ua and Ub perms, and the
            # three that turn corners and leave every edge home are the Aa, Ab
            # and E perms.  Level 1's last two steps select on exactly those
            # two descriptions -- step 4's own text promises "two of these four
            # are the familiar U-perms" -- so if either set drifts, a step is
            # empty or a lie, and the cards are drawn in an alignment nobody
            # would hold the cube in.
            def drawn(home, turned):
                """Names of the cases drawn with `home` still and `turned` moving."""
                return {n for c in block["list"]
                        if c["desc"][home] == "đã hoàn thành"
                        and c["desc"][turned] != "đã hoàn thành"
                        for n in c["names"]}

            for home, turned, words, want in (
                    ("corner_cycles", "edge_cycles", "corners home, edges turned",
                     {"H-perm", "Z-perm", "Ua-perm", "Ub-perm"}),
                    ("edge_cycles", "corner_cycles", "edges home, corners turned",
                     {"Aa-perm", "Ab-perm", "E-perm"})):
                got = drawn(home, turned)
                if got != want:
                    bad.append(f"PLL: drawn with {words} are {sorted(got)}, "
                               f"expected {sorted(want)}")
    for lv in levels["levels"]:
        for item in lv.get("curriculum") or []:
            if not item.get("cases"):
                bad.append(f"{lv['key']}/{item['id']}: selects no cases at all")
    return bad


# --------------------------------------------------------------------------
# 3. schema
# --------------------------------------------------------------------------

def check_curriculum(algs, levels):
    """A level's curriculum must be exactly the cases its conditions select."""
    bad = []
    for lv in levels["levels"]:
        items = lv.get("curriculum")
        if not items:
            bad.append(f"levels: {lv['key']} has no curriculum")
            continue
        distinct = set()
        for item in items:
            block = algs["families"].get(item["family"])
            if block is None:
                bad.append(f"levels: {lv['key']}/{item['id']} names an unknown "
                           f"family {item['family']!r}")
                continue
            where = item.get("where") or {}
            want = [c for c in block["list"] if G._matches(c, where)]
            got = {c["key"]: c for c in item["cases"]}
            if len(got) != len(item["cases"]):
                bad.append(f"levels: {lv['key']}/{item['id']} lists a case twice")
            if set(got) != {c["key"] for c in want}:
                missing = sorted({c["key"] for c in want} - set(got))
                extra = sorted(set(got) - {c["key"] for c in want})
                bad.append(f"levels: {lv['key']}/{item['id']} selected the wrong "
                           f"cases (missing {missing[:4]}, extra {extra[:4]})")
            if item["selected"] != len(want):
                bad.append(f"levels: {lv['key']}/{item['id']} selected "
                           f"{item['selected']}, conditions pick {len(want)}")
            by_key = {c["key"]: c for c in block["list"]}
            for key, row in got.items():
                src = by_key.get(key)
                if src is None:
                    bad.append(f"levels: {lv['key']}/{item['id']} case {key} "
                               f"is not in {item['family']}")
                    continue
                for field in ("algorithm", "htm", "names", "element", "i"):
                    if row.get(field) != src.get(field):
                        bad.append(f"levels: {lv['key']}/{item['id']} case {key} "
                                   f"{field} does not match the export")
                if src["algorithm"]:
                    distinct.add(src["algorithm"])
            if item["to_learn"] != sum(1 for c in want if c["algorithm"]):
                bad.append(f"levels: {lv['key']}/{item['id']} to_learn is wrong")
            have = [c["stm"] for c in want if c["stm"]]
            want_mean = round(sum(have) / len(have), 2) if have else 0
            if abs((item.get("mean_moves") or 0) - want_mean) > 0.01:
                bad.append(f"levels: {lv['key']}/{item['id']} mean_moves "
                           f"{item.get('mean_moves')} != {want_mean}, the mean of "
                           f"the stm its own cards quote")
            if "mean_htm" in item:
                bad.append(f"levels: {lv['key']}/{item['id']} still publishes "
                           f"mean_htm, which on a family block means the engine's "
                           f"htm and here was always stm")
        if lv.get("distinct_algorithms") != len(distinct):
            bad.append(f"levels: {lv['key']} distinct_algorithms "
                       f"{lv.get('distinct_algorithms')} != {len(distinct)}")
    return bad


def check_schema(data, book):
    bad = []
    eng, algs = data["engine"], data["algorithms"]
    methods, levels = data["methods"], data["levels"]
    bk, bench = data["book"], data["benchmark"]

    if len(eng["moves"]) != 54:
        bad.append(f"engine: {len(eng['moves'])} moves, want 54")
    if sorted(m["id"] for m in eng["moves"]) != list(range(54)):
        bad.append("engine: move ids are not 0..53")
    for m in eng["moves"]:
        if len(m.get("perm", [])) != 54:
            bad.append(f"engine: move {m.get('name')} has no 54-entry perm")
        if len(m.get("cost", [])) != 4:
            bad.append(f"engine: move {m.get('name')} has no 4-metric cost")
    if eng.get("faces") != "URFDLB":
        bad.append(f"engine: faces {eng.get('faces')!r} != 'URFDLB'")

    st = book.stats()
    if bk.get("swept") != st["swept"]:
        bad.append(f"book: swept {bk.get('swept')} != engine {st['swept']}")
    if bk.get("found") != st["found"]:
        bad.append(f"book: found {bk.get('found')} != engine {st['found']}")
    if bk.get("elements") != st["total"]:
        bad.append(f"book: elements {bk.get('elements')} != engine {st['total']}")
    if abs(bk.get("coverage", -1) - 100.0 * st["coverage"]) > 0.01:
        bad.append(f"book: coverage {bk.get('coverage')} != "
                   f"{100.0 * st['coverage']:.2f}")
    if bk.get("reachable_by") != 2 * st["swept"]:
        bad.append("book: reachable_by must be twice the swept depth")
    hist = {int(k): v for k, v in (bk.get("histogram") or {}).items()}
    if hist != st["histogram"]:
        bad.append("book: histogram does not match the engine's")

    total = sum(len(b["list"]) for b in algs["families"].values())
    if total != algs.get("cases"):
        bad.append(f"algorithms: cases {algs.get('cases')} != {total} exported")
    if algs.get("to_learn") != sum(1 for b in algs["families"].values()
                                   for c in b["list"] if c["moves"]):
        bad.append("algorithms: to_learn does not count the non-trivial cases")
    if algs.get("named") != sum(1 for b in algs["families"].values()
                                for c in b["list"] if c["names"]):
        bad.append("algorithms: named does not count the textbook names")
    keys = [c["key"] for b in algs["families"].values() for c in b["list"]]
    if len(set(keys)) != len(keys):
        bad.append("algorithms: case keys are not unique")
    if algs.get("with_textbook") != sum(1 for b in algs["families"].values()
                                       for c in b["list"] if c.get("teach")):
        bad.append("algorithms: with_textbook does not count the teach words")
    for fam, block in algs["families"].items():
        # `mean` and `longest` are reported in stm: a slice turn is one move in
        # the notation people write, so that is the number a learner compares to
        lens = [c["stm"] for c in block["list"] if c["stm"] > 0]
        htm = [c["htm"] for c in block["list"] if c["htm"] > 0]
        if not lens:
            bad.append(f"algorithms: {fam} has no non-trivial case")
            continue
        if len(block["list"]) != block.get("cases"):
            bad.append(f"algorithms: {fam} cases {block.get('cases')} != "
                       f"{len(block['list'])} listed")
        if abs(block["mean"] - sum(lens) / len(lens)) > 0.01:
            bad.append(f"algorithms: {fam} mean {block['mean']} != "
                       f"{sum(lens) / len(lens):.4f}")
        if block["longest"] != max(lens):
            bad.append(f"algorithms: {fam} longest {block['longest']} != {max(lens)}")
        if abs(block.get("mean_htm", 0) - sum(htm) / len(htm)) > 0.01:
            bad.append(f"algorithms: {fam} mean_htm {block.get('mean_htm')} != "
                       f"{sum(htm) / len(htm):.4f}")
        if block.get("with_textbook") != sum(1 for c in block["list"] if c.get("teach")):
            bad.append(f"algorithms: {fam} with_textbook is wrong")
        names = [n for c in block["list"] for n in (c.get("names") or [])]
        if len(set(names)) != len(names):
            bad.append(f"algorithms: {fam} names a case twice: "
                       f"{sorted(n for n in names if names.count(n) > 1)}")
        ids = [c["key"] for c in block["list"]]
        if len(set(ids)) != len(ids):
            bad.append(f"algorithms: {fam} has duplicate case keys")

    roster = methods["methods"]
    if not isinstance(roster, dict) or len(roster) < 10:
        bad.append(f"methods: {len(roster) if hasattr(roster, '__len__') else 0} "
                   f"exported, want a dict of >= 10")
    else:
        for name, m in roster.items():
            if m.get("name") != name:
                bad.append(f"methods: key {name!r} holds {m.get('name')!r}")
            if not m.get("stages"):
                bad.append(f"methods: {name} has no stages")
            for key in ("description", "path", "algs_by_tier"):
                if key not in m:
                    bad.append(f"methods: {name} is missing {key!r}")
            for st_ in m.get("stages", []):
                if not st_.get("goal"):
                    bad.append(f"methods: {name}/{st_.get('name')} has no goal")
    tiers = [lv["key"] for lv in levels["levels"]]
    if tiers != ["easy", "medium", "hard", "full"]:
        bad.append(f"levels: tiers must be easy/medium/hard/full, got {tiers}")
    for lv in levels["levels"]:
        for key in ("title", "who", "promise", "path", "algs", "stages", "method"):
            if key not in lv:
                bad.append(f"levels: {lv.get('key')} is missing {key!r}")
        if lv.get("algs") != sum(s.get("algs") or 0 for s in lv.get("stages", [])):
            bad.append(f"levels: {lv.get('key')} algs {lv.get('algs')} != the sum "
                       f"of its stages")

    rows = bench.get("results") or bench.get("methods") or []
    if not rows:
        bad.append("benchmark: no result rows")
    else:
        for r in rows:
            if r.get("scrambles", 0) < 20:
                bad.append(f"benchmark: {r.get('method')} ran only "
                           f"{r.get('scrambles')} scrambles, want 20")
            if r.get("solved") != r.get("scrambles"):
                bad.append(f"benchmark: {r.get('method')} solved "
                           f"{r.get('solved')}/{r.get('scrambles')}")
    return bad


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Validate the exported web data.")
    ap.add_argument("--data", default=os.path.join(ROOT, "web", "data"))
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args(argv)

    data = {}
    for name in ("engine", "algorithms", "methods", "levels", "book", "benchmark"):
        path = os.path.join(args.data, name + ".json")
        if not os.path.exists(path):
            print(f"MISSING {path}")
            return 1
        with open(path) as fh:
            data[name] = json.load(fh)

    print(f"validating {args.data}")
    failures = 0

    (cells, dirs), bad = check_geometry(data["engine"])
    print(f"  geometry     54 move permutations ... "
          f"{'ok' if not bad else 'FAIL'}")
    for name, n, sample in bad[:8]:
        print(f"      {name}: {n} facelets differ, e.g. {sample}")
    failures += len(bad)

    seen, bad, cache = check_algorithms(data["algorithms"], quiet=args.quiet)
    print(f"  algorithms   {seen} cases replayed ... "
          f"{'ok' if not bad else 'FAIL'}")
    for line in bad[:12]:
        print(f"      {line}")
    failures += len(bad)

    book = B.Book()
    assert book.loaded, "data/llbook.bin did not load"

    seen, bad = check_stickers(data["algorithms"], data["engine"])
    print(f"  stickers     {seen} cases judged by colour alone ... "
          f"{'ok' if not bad else 'FAIL'}")
    for line in bad[:12]:
        print(f"      {line}")
    failures += len(bad)

    bad = check_alignment(data["algorithms"], data["levels"], book)
    spins = sum(1 for f in data["algorithms"]["families"].values()
                for c in f["list"] if c.get("canonical_auf"))
    print(f"  alignment    {spins} cases turned to a recognisable alignment ... "
          f"{'ok' if not bad else 'FAIL'}")
    for line in bad[:12]:
        print(f"      {line}")
    failures += len(bad)

    bad = check_curriculum(data["algorithms"], data["levels"])
    items = sum(len(lv.get("curriculum") or []) for lv in data["levels"]["levels"])
    print(f"  curriculum   {items} level sets re-derived ... "
          f"{'ok' if not bad else 'FAIL'}")
    for line in bad[:12]:
        print(f"      {line}")
    failures += len(bad)

    bad = check_schema(data, book)
    print(f"  schema       keys, counts and costs ... "
          f"{'ok' if not bad else 'FAIL'}")
    for line in bad[:14]:
        print(f"      {line}")
    failures += len(bad)

    print(f"\n{'PASS -- web data agrees with the engine' if not failures else f'FAIL ({failures} problems)'}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
