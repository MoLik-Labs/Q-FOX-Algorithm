"""ctypes binding for the Q-FOX C engine.

The C library is the only place cube mechanics are implemented; this module is
a thin, typed wrapper plus an on-disk cache for pattern databases. Nothing here
re-implements solving logic, so Python and C can never disagree.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import subprocess
from ctypes import (POINTER, Structure, byref, c_char_p, c_int, c_int32,
                    c_int64, c_size_t, c_uint8, c_uint64)
from dataclasses import dataclass
from pathlib import Path

FACELETS = 54
SLOTS = 20
EDGES = 12
CORNERS = 8
NMOVES = 54
SOL_MAX = 40
MAX_PARTS = 6
MAX_CONST = 16
MAX_COLLECT = 4096
LL_N_EXPECT = 62208
LL_MAXLEN_EXPECT = 16

HTM, QTM, STM, ETM = 0, 1, 2, 3
METRICS = ("HTM", "QTM", "STM", "ETM")

PART_EDGE_PERM = 0
PART_CORNER_PERM = 1
PART_EDGE_PERM_ORIENT = 2
PART_CORNER_PERM_ORIENT = 3
PART_EDGE_ORIENT = 4
PART_CORNER_ORIENT = 5

MASK_OUTER = 0x3FFFF
MASK_SLICE = 0x07FC0000
MASK_WIDE = 0x00001FFFF8000000
MASK_ROT = 0x003FE00000000000
MASK_ALL = 0x003FFFFFFFFFFFFF


def _fm(family: int) -> int:
    """Move-family bitmask: each family owns three consecutive bits (cw, 180, ccw)."""
    return 0x7 << (3 * family)


def mask_of(*faces: str) -> int:
    """Bitmask for a set of face/slice names, e.g. mask_of("M", "U") for <M,U>."""
    m = 0
    for f in faces:
        m |= MK[f]
    return m


MK = {
    "U": _fm(0), "R": _fm(1), "F": _fm(2), "D": _fm(3), "L": _fm(4), "B": _fm(5),
    "M": _fm(6), "E": _fm(7), "S": _fm(8),
    "r": _fm(9), "l": _fm(10), "u": _fm(11), "d": _fm(12), "f": _fm(13), "b": _fm(14),
    "x": _fm(15), "y": _fm(16), "z": _fm(17),
}
# 18-move outer generator, the metric every published method count uses.
MASK_HTM18 = MASK_OUTER
MASK_MU = _fm(6) | _fm(0)          # <M,U>: Roux's last six edges
MASK_ULR = _fm(0) | _fm(1) | _fm(4)  # <U,R,L>: ZZ's F2L and last layer


# --------------------------------------------------------------------------- #
# structs
# --------------------------------------------------------------------------- #
class QfCube(Structure):
    _fields_ = [("f", c_uint8 * FACELETS)]


class QfPart(Structure):
    _fields_ = [
        ("kind", c_int32),
        ("items", c_int32 * EDGES),
        ("n", c_int32),
        ("allowed", c_int32 * EDGES),
        ("na", c_int32),
        ("unordered", c_int32),
    ]


class QfCoordSpec(Structure):
    _fields_ = [("part", QfPart * MAX_PARTS), ("npart", c_int32)]


class QfStage(Structure):
    _fields_ = [
        ("keep", c_int32 * MAX_CONST),
        ("keep_target", c_uint64 * MAX_CONST),
        ("keep_table", c_int32 * MAX_CONST),
        ("use_keep_table", c_int32),
        ("nkeep", c_int32),
        ("heur", c_int32 * MAX_CONST),
        ("heur_table", c_int32 * MAX_CONST),   # distance to that table's seed set
        ("nheur", c_int32),
        ("mask", c_uint64),
        ("max_depth", c_int32),
        ("node_budget", c_int64),
        ("allow_rotations", c_int32),
    ]


class QfSolution(Structure):
    _fields_ = [
        ("moves", c_int32 * SOL_MAX),
        ("n", c_int32),
        ("optimal", c_int32),
        ("nodes", c_int64),
        ("status", c_int32),
    ]


class QfSolutionSet(Structure):
    _fields_ = [
        ("moves", (c_int32 * SOL_MAX) * MAX_COLLECT),
        ("len", c_int32 * MAX_COLLECT),
        ("n", c_int32),
        ("truncated", c_int32),
    ]


class QfPMap(Structure):
    _fields_ = [("piece", ctypes.c_int8 * SLOTS),
                ("orient", ctypes.c_int8 * SLOTS),
                ("slotof", ctypes.c_int8 * SLOTS)]


# --------------------------------------------------------------------------- #
# library
# --------------------------------------------------------------------------- #
ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
LIBPATH = BUILD / "libqfox.so"


def _ensure_built() -> None:
    if LIBPATH.exists() and LIBPATH.stat().st_mtime >= (ROOT / "engine" / "qfox.c").stat().st_mtime:
        return
    subprocess.run(["bash", str(ROOT / "engine" / "build.sh")], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)


_ensure_built()
_lib = ctypes.CDLL(str(LIBPATH))

# The Structure classes above mirror C structs field by field, and a mismatch
# does not raise: ctypes happily hands C a buffer that is too small and the
# library writes past the end of it, taking the interpreter down with no
# traceback.  So the widths are checked against the library before anything is
# called, which turns "mysterious segfault" into "rebuild the engine".
_lib.qf_abi.restype = c_int
_lib.qf_abi.argtypes = [c_int]
_ABI = ((0, "SOL_MAX", SOL_MAX), (1, "MAX_COLLECT", MAX_COLLECT),
        (2, "MAX_CONST", MAX_CONST), (3, "LL_N", LL_N_EXPECT),
        (4, "LL_MAXLEN", LL_MAXLEN_EXPECT), (5, "NMOVES", NMOVES),
        (6, "SLOTS", SLOTS), (7, "FACELETS", FACELETS),
        (8, "MAX_PARTS", MAX_PARTS))
for _w, _name, _want in _ABI:
    _got = _lib.qf_abi(_w)
    if _got != _want:
        raise RuntimeError(
            f"libqfox.so was built from a different qfox.h: {_name} is {_got} "
            f"in the library and {_want} here.  Run engine/build.sh.")
del _w, _name, _want, _got

_lib.qf_init.restype = c_int
_lib.qf_version.restype = c_char_p
_lib.qf_check_consistency.restype = c_int
_lib.qf_check_consistency.argtypes = [c_int]
_lib.qf_solved.argtypes = [POINTER(QfCube)]
_lib.qf_apply.argtypes = [POINTER(QfCube), c_int]
_lib.qf_apply_seq.argtypes = [POINTER(QfCube), POINTER(c_int32), c_int]
_lib.qf_is_solved.restype = c_int
_lib.qf_is_solved.argtypes = [POINTER(QfCube)]
_lib.qf_parse_move.restype = c_int
_lib.qf_parse_move.argtypes = [c_char_p]
_lib.qf_move_name.restype = c_int
_lib.qf_move_name.argtypes = [c_int, c_char_p, c_size_t]
_lib.qf_move_cost.restype = c_int
_lib.qf_move_cost.argtypes = [c_int, c_int]
_lib.qf_seq_cost.restype = c_int
_lib.qf_seq_cost.argtypes = [c_int, POINTER(c_int32), c_int]
_lib.qf_slot_id.restype = c_int
_lib.qf_slot_id.argtypes = [c_char_p]
_lib.qf_slot_name.restype = c_int
_lib.qf_slot_name.argtypes = [c_int, c_char_p, c_size_t]
_lib.qf_optimize.restype = c_int
_lib.qf_optimize.argtypes = [POINTER(c_int32), c_int]
_lib.qf_pmap.argtypes = [POINTER(QfCube), POINTER(QfPMap)]
_lib.qf_coord_new.restype = c_int32
_lib.qf_coord_new.argtypes = [POINTER(QfCoordSpec)]
_lib.qf_coord_size.restype = c_int
_lib.qf_coord_size.argtypes = [c_int32, POINTER(c_uint64)]
_lib.qf_coord_index.restype = c_uint64
_lib.qf_coord_index.argtypes = [c_int32, POINTER(QfCube)]
_lib.qf_coord_index_pm.restype = c_uint64
_lib.qf_coord_index_pm.argtypes = [c_int32, POINTER(QfPMap)]
_lib.qf_table_build.restype = c_int32
_lib.qf_table_build.argtypes = [c_int32, c_uint64, c_uint64, c_uint64]
_lib.qf_table_build_solved.restype = c_int32
_lib.qf_table_build_solved.argtypes = [c_int32, c_uint64, c_uint64]
_lib.qf_table_build_multi.restype = c_int32
_lib.qf_table_build_multi.argtypes = [c_int32, POINTER(c_uint64), c_int, c_uint64, c_uint64]
_lib.qf_table_build_traced.restype = c_int32
_lib.qf_table_build_traced.argtypes = [c_int32, POINTER(c_uint64), c_int, c_uint64, c_uint64]
_lib.qf_table_is_traced.restype = c_int
_lib.qf_table_is_traced.argtypes = [c_int32]
_lib.qf_table_path.restype = c_int
_lib.qf_table_path.argtypes = [c_int32, c_uint64, POINTER(c_int32), c_int]
_lib.qf_table_lookup.restype = c_int
_lib.qf_table_lookup.argtypes = [c_int32, c_uint64]
_lib.qf_table_size.restype = c_uint64
_lib.qf_table_size.argtypes = [c_int32]
_lib.qf_table_reachable.restype = c_uint64
_lib.qf_table_reachable.argtypes = [c_int32]
_lib.qf_table_hist.argtypes = [c_int32, POINTER(c_uint64), c_int]
_lib.qf_table_free.argtypes = [c_int32]
_lib.qf_coord_apply_index.restype = c_uint64
_lib.qf_coord_apply_index.argtypes = [c_int32, c_uint64, c_int]
_lib.qf_coord_apply_index_batch.argtypes = [c_int32, POINTER(c_uint64), POINTER(c_uint64), c_uint64, c_int]
_lib.qf_table_data.restype = POINTER(c_uint8)
_lib.qf_table_data.argtypes = [c_int32]
_lib.qf_table_save.restype = c_int
_lib.qf_table_save.argtypes = [c_int32, c_char_p]
_lib.qf_table_load.restype = c_int32
_lib.qf_table_load.argtypes = [c_int32, c_char_p]
_lib.qf_solve_stage.restype = c_int
_lib.qf_solve_stage.argtypes = [POINTER(QfCube), POINTER(QfStage), POINTER(QfSolution)]
_lib.qf_enumerate_stage.restype = c_int
_lib.qf_enumerate_stage.argtypes = [POINTER(QfCube), POINTER(QfStage), c_int, c_int,
                                    POINTER(QfSolutionSet)]
_lib.qf_fullsolver_prepare.restype = c_int
_lib.qf_fullsolver_prepare.argtypes = [c_uint64]
_lib.qf_solve_full.restype = c_int
_lib.qf_solve_full.argtypes = [POINTER(QfCube), POINTER(c_int32), c_int]

_rc = _lib.qf_init()
if _rc != 0:
    raise RuntimeError(f"qfox engine self-test failed with code {_rc}")

TABLE_DIR = ROOT / "data" / "tables"
TABLE_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
# python-side API
# --------------------------------------------------------------------------- #
def version() -> str:
    return _lib.qf_version().decode()


def slot_id(name: str) -> int:
    r = _lib.qf_slot_id(name.encode())
    if r < 0:
        raise KeyError(f"unknown slot {name!r}")
    return r


def slot_name(sid: int) -> str:
    buf = ctypes.create_string_buffer(8)
    _lib.qf_slot_name(sid, buf, 8)
    return buf.value.decode()


ALL_EDGE_SLOTS = [8 + i for i in range(EDGES)]
ALL_CORNER_SLOTS = list(range(CORNERS))

SLOT_NAMES = {s: slot_name(s) for s in range(SLOTS)}
NAME_TO_SLOT = {v: k for k, v in SLOT_NAMES.items()}
for _std, _geo in (("UFL", "ULF"), ("UBR", "URB"), ("DFR", "DRF")):
    NAME_TO_SLOT[_std] = NAME_TO_SLOT[_geo]

# Edge slot groups used all over method definitions.
U_EDGES = [slot_id(n) for n in ("UR", "UF", "UL", "UB")]
D_EDGES = [slot_id(n) for n in ("DR", "DF", "DL", "DB")]
E_EDGES = [slot_id(n) for n in ("FR", "FL", "BL", "BR")]
U_CORNERS = [slot_id(n) for n in ("URF", "ULF", "ULB", "URB")]
D_CORNERS = [slot_id(n) for n in ("DFR", "DLF", "DLB", "DRB")]
ALL_EDGES = sorted(U_EDGES + D_EDGES + E_EDGES)
ALL_CORNERS = sorted(ALL_CORNER_SLOTS)


def parse_move(tok: str) -> int:
    m = _lib.qf_parse_move(tok.encode())
    if m < 0:
        raise KeyError(f"unknown move {tok!r}")
    return m


def move_name(m: int) -> str:
    buf = ctypes.create_string_buffer(4)
    _lib.qf_move_name(m, buf, 4)
    return buf.value.decode()


def parse_seq(text: str) -> list[int]:
    return [parse_move(t) for t in text.split() if t.strip()]


def format_seq(moves) -> str:
    return " ".join(move_name(m) for m in moves)


def seq_cost(metric: int, moves) -> int:
    arr = (c_int32 * len(moves))(*moves)
    return _lib.qf_seq_cost(metric, arr, len(moves))


def inverse_move(m: int) -> int:
    """The move that undoes `m` (ids are family*3 + power, power 1 = half turn)."""
    return (m // 3) * 3 + (2 - m % 3)


def inverse_seq(moves) -> list[int]:
    """The sequence that undoes `moves`."""
    return [inverse_move(m) for m in reversed(list(moves))]


def optimize(moves) -> list[int]:
    """Merge same-family turns to a fixed point.

    Accepts a sequence of any length: a whole beginner solve is longer than
    `QF_SOL_MAX`, and the engine sizes its own scratch from what it is given.
    """
    moves = list(moves)
    if not moves:
        return []
    arr = (c_int32 * len(moves))(*moves)
    n = _lib.qf_optimize(arr, len(moves))
    if n < 0:
        raise ValueError(
            "qf_optimize failed (%d): %s" % (n, "bad move id" if n == -1
                                             else "out of memory"))
    return [arr[i] for i in range(n)]


class Cube:
    """A cube state. Thin handle over the C facelet array."""

    __slots__ = ("_c",)

    def __init__(self, c: QfCube | None = None):
        self._c = c if c is not None else QfCube()
        if c is None:
            _lib.qf_solved(byref(self._c))

    # -- construction -----------------------------------------------------
    @classmethod
    def solved(cls) -> "Cube":
        return cls()

    @classmethod
    def from_seq(cls, text: str) -> "Cube":
        c = cls()
        c.apply_str(text)
        return c

    @classmethod
    def from_facelets(cls, facelets: str) -> "Cube":
        """URF-order facelet string, 54 chars, colours as URFDBL letters."""
        if len(facelets) != 54:
            raise ValueError("need exactly 54 facelets")
        c = cls()
        for i, ch in enumerate(facelets):
            c._c.f[i] = "URFDLB".index(ch)
        return c

    def copy(self) -> "Cube":
        n = Cube()
        n._c = QfCube()
        ctypes.memmove(byref(n._c), byref(self._c), FACELETS)
        return n

    # -- mutation ---------------------------------------------------------
    def apply(self, move: int) -> "Cube":
        _lib.qf_apply(byref(self._c), move)
        return self

    def apply_moves(self, moves) -> "Cube":
        arr = (c_int32 * len(moves))(*moves)
        _lib.qf_apply_seq(byref(self._c), arr, len(moves))
        return self

    def apply_str(self, text: str) -> "Cube":
        return self.apply_moves(parse_seq(text))

    # -- queries ----------------------------------------------------------
    @property
    def is_solved(self) -> bool:
        return bool(_lib.qf_is_solved(byref(self._c)))

    def facelets(self) -> str:
        return "".join("URFDLB"[self._c.f[i]] for i in range(FACELETS))

    def pmap(self) -> QfPMap:
        m = QfPMap()
        _lib.qf_pmap(byref(self._c), byref(m))
        return m

    def coord(self, co: int) -> int:
        return _lib.qf_coord_index(co, byref(self._c))

    @property
    def net(self) -> str:
        """ASCII net, the layout used by the docs and the web app."""
        f = [self._c.f[i] for i in range(FACELETS)]
        letters = "URFDLB"
        g = lambda i: letters[f[i]]
        rows = []
        rows.append("        " + " ".join(g(i) for i in range(0, 3)))
        rows.append("        " + " ".join(g(i) for i in range(3, 6)))
        rows.append("        " + " ".join(g(i) for i in range(6, 9)))
        mid = []
        for r in range(3):
            L = [g(36 + r * 3 + c) for c in range(3)]
            F = [g(18 + r * 3 + c) for c in range(3)]
            R = [g(9 + r * 3 + c) for c in range(3)]
            B = [g(45 + r * 3 + c) for c in range(3)]
            mid.append(" ".join(L) + "  " + " ".join(F) + "  " + " ".join(R) + "  " + " ".join(B))
        rows.extend(mid)
        rows.append("        " + " ".join(g(27 + i) for i in range(0, 3)))
        rows.append("        " + " ".join(g(27 + i) for i in range(3, 6)))
        rows.append("        " + " ".join(g(27 + i) for i in range(6, 9)))
        return "\n".join(rows)

    def __repr__(self) -> str:
        return f"Cube({'solved' if self.is_solved else self.facelets()})"


# --------------------------------------------------------------------------- #
# coordinates + tables
# --------------------------------------------------------------------------- #
def make_part(kind: int, items, allowed=None, unordered: bool = False) -> QfPart:
    p = QfPart()
    p.kind = kind
    items = list(items)
    p.n = len(items)
    for i, v in enumerate(items):
        p.items[i] = v
    if allowed is not None:
        allowed = list(allowed)
        p.na = len(allowed)
        for i, v in enumerate(allowed):
            p.allowed[i] = v
    p.unordered = 1 if unordered else 0
    return p


def edge_perm_orient(pieces, allowed=None, unordered=False) -> QfPart:
    return make_part(PART_EDGE_PERM_ORIENT, pieces, allowed, unordered)


def corner_perm_orient(pieces, allowed=None, unordered=False) -> QfPart:
    return make_part(PART_CORNER_PERM_ORIENT, pieces, allowed, unordered)


def edge_perm(pieces, allowed=None, unordered=False) -> QfPart:
    return make_part(PART_EDGE_PERM, pieces, allowed, unordered)


def corner_perm(pieces, allowed=None, unordered=False) -> QfPart:
    return make_part(PART_CORNER_PERM, pieces, allowed, unordered)


def edge_orient_all() -> QfPart:
    return make_part(PART_EDGE_ORIENT, ALL_EDGE_SLOTS)


def corner_orient_all() -> QfPart:
    return make_part(PART_CORNER_ORIENT, ALL_CORNER_SLOTS)


def new_coord(*parts: QfPart) -> int:
    sp = QfCoordSpec()
    sp.npart = len(parts)
    for i, p in enumerate(parts):
        sp.part[i] = p
    co = _lib.qf_coord_new(byref(sp))
    if co < 0:
        raise ValueError(f"coord rejected (code {co})")
    return co


def coord_size(co: int) -> int:
    out = c_uint64()
    if _lib.qf_coord_size(co, byref(out)) != 0:
        raise ValueError("bad coord")
    return out.value


def spec_fingerprint(*parts: QfPart, mask: int, tag: str = "") -> str:
    payload = []
    for p in parts:
        payload.append([p.kind, p.n, [p.items[i] for i in range(p.n)],
                        p.na, [p.allowed[i] for i in range(p.na)], p.unordered])
    raw = json.dumps({"parts": payload, "mask": mask, "tag": tag}, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


@dataclass
class TableInfo:
    handle: int
    size: int
    reachable: int
    cached: bool
    build_seconds: float


def build_table(coord: int, mask: int, key: str, max_size: int = 1 << 26,
                cache: bool = True) -> TableInfo:
    """BFS the exact distance table for `coord`, using the on-disk cache.

    `key` must identify (coord spec, mask) uniquely -- the cache is shared
    across processes, so a wrong key silently serves the wrong table.
    """
    import time
    fp = key
    path = TABLE_DIR / f"{fp}.tab"
    t0 = time.time()
    if cache and path.exists():
        h = _lib.qf_table_load(coord, str(path).encode())
        if h >= 0:
            return TableInfo(h, _lib.qf_table_size(h), _lib.qf_table_reachable(h),
                             True, time.time() - t0)
    h = _lib.qf_table_build_solved(coord, mask, max_size)
    if h < 0:
        raise MemoryError(f"table build failed (code {h}); coord size {coord_size(coord)}")
    dt = time.time() - t0
    if cache:
        try:
            _lib.qf_table_save(h, str(path).encode())
        except OSError:
            pass
    return TableInfo(h, _lib.qf_table_size(h), _lib.qf_table_reachable(h), False, dt)


def build_table_seeded(coord: int, seeds, mask: int, max_size: int = 1 << 26,
                       traced: bool = False) -> int:
    arr = (c_uint64 * len(seeds))(*seeds)
    fn = _lib.qf_table_build_traced if traced else _lib.qf_table_build_multi
    h = fn(coord, arr, len(seeds), mask, max_size)
    if h < 0:
        raise MemoryError(f"seeded table build failed (code {h})")
    return h


def table_path(handle: int, idx: int) -> list[int]:
    """Moves that take a seed of this table to `idx` (optimal by construction)."""
    arr = (c_int32 * (SOL_MAX * 4))()
    n = _lib.qf_table_path(handle, idx, arr, SOL_MAX * 4)
    if n < 0:
        raise ValueError(f"index {idx} unreachable or table not traced")
    return [arr[i] for i in range(n)]


def table_lookup(handle: int, idx: int) -> int:
    return _lib.qf_table_lookup(handle, idx)


def table_array(handle: int):
    """The raw distance table as a numpy uint8 array (255 == unreachable).

    Zero-copy: it points straight at the C allocation, so case enumeration over
    a million-state table costs nothing.
    """
    import numpy as np
    size = _lib.qf_table_size(handle)
    ptr = _lib.qf_table_data(handle)
    if not ptr or size == 0:
        raise ValueError("table has no data")
    return np.frombuffer((c_uint8 * size).from_address(ctypes.addressof(ptr.contents)),
                         dtype=np.uint8)


def reachable_indices(handle: int):
    import numpy as np
    return np.flatnonzero(table_array(handle) != 255)


def coord_apply_index(coord: int, idx: int, move: int) -> int:
    r = _lib.qf_coord_apply_index(coord, idx, move)
    return -1 if r == 2**64 - 1 else r


def coord_apply_index_batch(coord: int, idxs, move: int):
    """Vectorised index transition (numpy in, numpy out)."""
    import numpy as np
    a = np.ascontiguousarray(idxs, dtype=np.uint64)
    out = np.empty_like(a)
    _lib.qf_coord_apply_index_batch(coord, a.ctypes.data_as(POINTER(c_uint64)),
                                    out.ctypes.data_as(POINTER(c_uint64)),
                                    a.size, move)
    return out


def table_hist(handle: int, n: int = 32) -> list[int]:
    arr = (c_uint64 * n)()
    _lib.qf_table_hist(handle, arr, n)
    return [arr[i] for i in range(n)]


def free_table(handle: int) -> None:
    _lib.qf_table_free(handle)


# --------------------------------------------------------------------------- #
# stage solving
# --------------------------------------------------------------------------- #
@dataclass
class StageResult:
    moves: list[int]
    status: int          # 0 solved, 1 budget exhausted, 2 no solution
    optimal: bool
    nodes: int

    @property
    def ok(self) -> bool:
        return self.status == 0

    def htm(self) -> int:
        return seq_cost(HTM, self.moves)

    def text(self) -> str:
        return format_seq(self.moves)


def _fill_stage(st, keep, heur, mask: int, max_depth: int,
                node_budget: int, rotations: bool) -> None:
    """keep/heur entries are (coord, table, target). A non-negative table in a
    keep entry switches that condition to "table[idx] == 0", which is how a
    goal that is a set of states (e.g. "OLL done, permutation free") is stated."""
    st.nkeep = len(keep)
    use_kt = 0
    for i, (co, tb, tgt) in enumerate(keep):
        st.keep[i] = co
        st.keep_target[i] = tgt
        st.keep_table[i] = tb if tb is not None else -1
        if tb is not None and tb >= 0:
            use_kt = 1
    st.use_keep_table = use_kt
    st.nheur = len(heur)
    for i, (co, tb, _tgt) in enumerate(heur):
        st.heur[i] = co
        st.heur_table[i] = tb
    st.mask = mask
    st.max_depth = max_depth
    st.node_budget = node_budget
    st.allow_rotations = 1 if rotations else 0


def solve_stage(cube: Cube, keep, heur, mask: int, max_depth: int = 24,
                node_budget: int = 20_000_000, rotations: bool = False) -> StageResult:
    st = QfStage()
    _fill_stage(st, keep, heur, mask, max_depth, node_budget, rotations)
    st.nheur = len(heur)
    for i, (co, tb, _tgt) in enumerate(heur):
        st.heur[i] = co
        st.heur_table[i] = tb
    st.mask = mask
    st.max_depth = max_depth
    st.node_budget = node_budget
    st.allow_rotations = 1 if rotations else 0
    out = QfSolution()
    _lib.qf_solve_stage(byref(cube._c), byref(st), byref(out))
    return StageResult([out.moves[i] for i in range(out.n)], out.status,
                       bool(out.optimal), out.nodes)


def enumerate_stage(cube: Cube, keep, heur, mask: int, max_len: int,
                    limit: int = 512, node_budget: int = 0,
                    rotations: bool = False) -> list[list[int]]:
    st = QfStage()
    _fill_stage(st, keep, heur, mask, max_len, node_budget, rotations)
    out = QfSolutionSet()
    n = _lib.qf_enumerate_stage(byref(cube._c), byref(st), max_len, limit, byref(out))
    return [[out.moves[i][j] for j in range(out.len[i])] for i in range(max(0, n))]


def solve_full(cube: Cube, max_table: int = 1 << 24) -> list[int]:
    if _lib.qf_fullsolver_prepare(max_table) != 0:
        raise RuntimeError("full solver prepare failed")
    arr = (c_int32 * SOL_MAX)()
    n = _lib.qf_solve_full(byref(cube._c), arr, SOL_MAX)
    if n < 0:
        raise RuntimeError("full solve failed")
    return optimize([arr[i] for i in range(n)])


# --------------------------------------------------------------------------- #
# the last-layer book
# --------------------------------------------------------------------------- #
LL_MAXLEN = 16
LL_N = 62208


class QfLlBook(Structure):
    _fields_ = [
        ("swept", c_int32),
        ("nfound", c_int32),
        ("nodes", c_int64),
        ("len", c_uint8 * LL_N),
        ("word", c_uint8 * (LL_N * LL_MAXLEN)),
    ]


def ll_count() -> int:
    return _lib.qf_ll_count()


def ll_encode(cube: Cube) -> int:
    """Last-layer element id of `cube`, or -1 when its first two layers are not
    home (in which case the eight last-layer pieces are not all in the layer)."""
    return _lib.qf_ll_encode(byref(cube.pmap()))


def ll_book_init(book: QfLlBook) -> None:
    _lib.qf_ll_book_init(byref(book))


def ll_sweep(book: QfLlBook, max_len: int, mask: int = MASK_OUTER,
             budget: int = 0, prune: Sequence[tuple[int, int]] = ()) -> int:
    """Enumerate every last-layer element reachable in <= max_len moves.

    `prune` is a list of (coord, table) pairs whose exact distances bound how
    far the first two layers can be from home; without them the sweep drowns.
    Returns the deepest length actually completed, so a stopped run resumes.
    """
    n = len(prune)
    pc = (c_int32 * n)(*[p[0] for p in prune]) if n else None
    pt = (c_int32 * n)(*[p[1] for p in prune]) if n else None
    return _lib.qf_ll_sweep(byref(book), max_len, c_uint64(mask),
                            c_int64(budget), pc, pt, n)


def ll_algorithm(book: QfLlBook, element: int) -> list[int] | None:
    """The recorded algorithm for one element: shortest known, inverted and
    canonicalised.  None if the sweep has not reached it yet."""
    arr = (c_int32 * LL_MAXLEN)()
    n = _lib.qf_ll_algorithm(byref(book), element, arr, LL_MAXLEN)
    if n < 0:
        return None
    return [arr[i] for i in range(n)]


FACE_CENTRES = [4, 13, 22, 31, 40, 49]      # facelet index of each face centre
IDENTITY_CENTRES = [0, 1, 2, 3, 4, 5]        # URFDLB, each centre on its own face


def centres(cube: Cube) -> list[int]:
    """Which centre sits in each face slot, as a colour id, in URFDLB order.

    No coordinate in this engine can see this, because centres are not cubies:
    they are read straight off the facelets.  It matters because a slice move
    can leave every one of the twenty pieces home and the centres rotated, and
    that is not a solved cube -- Roux finishes with <M,U>, so its last stage
    has to be checked against this rather than trusted.
    """
    return [cube._c.f[i] for i in FACE_CENTRES]


def centres_aligned(cube: Cube) -> bool:
    return centres(cube) == IDENTITY_CENTRES


def ll_scan(book: QfLlBook, cube: Cube, keep, mask: int = MASK_OUTER) -> StageResult:
    """Answer a stage straight out of the book, with no search at all.

    Every element the sweep has reached is tried in ascending book length: its
    word is applied to `cube` and the result is tested against `keep`, which
    holds (coord, table, target) triples exactly as `solve_stage` reads them --
    a non-negative table makes the condition "distance 0", so a goal may be a
    set of states of any size.  The first hit is the shortest word the book
    knows that satisfies the stage, and `optimal` says whether that is really
    the shortest possible (it is whenever the first two layers are home, and
    otherwise the scan is restricted to words that leave them home).

    Returns status 1 when no element of the ball works, which is the caller's
    cue to fall back on a search.
    """
    st = QfStage()
    _fill_stage(st, keep, (), mask, LL_MAXLEN, 0, False)
    out = QfSolution()
    _lib.qf_ll_scan(byref(book), byref(cube._c), byref(st), byref(out))
    return StageResult([out.moves[i] for i in range(out.n)], out.status,
                       bool(out.optimal), out.nodes)


def ll_product(book: QfLlBook, cube: Cube, goals, max_total: int = 32) -> list[int]:
    """Solve `cube` into one of the goal elements by splitting the answer in two.

    For an element deeper than the sweep the scan comes up empty, but the ball
    still solves it: the shortest word is two halves, each of them a ball
    element, so trying g^-1 followed by the word for X.g^-1 over the whole ball
    and keeping the cheapest total gives the exact distance.  `goals` are
    element ids (all of which must be in the ball) and the cheapest one wins.
    Returns the moves, or None when no split was found.
    """
    g = list(goals)
    if not g:
        return None
    arr = (c_int32 * len(g))(*g)
    out = (c_int32 * SOL_MAX)()
    n = _lib.qf_ll_product(byref(book), byref(cube._c), arr, len(g),
                           c_int32(max_total), out, SOL_MAX)
    if n < 0:
        return None
    return [out[i] for i in range(n)]


def ll_book_save(book: QfLlBook, path: str) -> None:
    if _lib.qf_ll_book_save(byref(book), path.encode()) != 0:
        raise OSError(f"cannot write {path}")


def ll_book_load(book: QfLlBook, path: str) -> bool:
    return _lib.qf_ll_book_load(byref(book), path.encode()) == 0


def ll_book_from_arrays(swept: int, lengths, words) -> QfLlBook:
    """Rebuild a book in memory from plain Python data (used by the tests)."""
    b = QfLlBook()
    ll_book_init(b)
    b.swept = swept
    for i, n in enumerate(lengths):
        if n is None:
            continue
        b.len[i] = n
        for j, m in enumerate(words[i][:n]):
            b.word[i * LL_MAXLEN + j] = m
    b.nfound = sum(1 for i in range(LL_N) if b.len[i] != 255)
    return b


def cube_from_pmap(piece, orient) -> "Cube":
    """Build the cube a piece map describes -- the inverse of `Cube.pmap`.

    This is how an abstractly enumerated case (a last-layer element, a pattern,
    a state found by algebra rather than by turning a cube) becomes something
    the engine can solve, draw and verify.
    """
    m = QfPMap()
    for i in range(SLOTS):
        m.piece[i] = int(piece[i])
        m.orient[i] = int(orient[i])
    c = QfCube()
    rc = _lib.qf_cube_from_pmap(byref(m), byref(c))
    if rc != 0:
        raise ValueError(f"illegal piece map (code {rc})")
    return Cube(c)


def cube_pmap(cube: "Cube") -> tuple[list[int], list[int]]:
    m = cube.pmap()
    return ([m.piece[i] for i in range(SLOTS)], [m.orient[i] for i in range(SLOTS)])
