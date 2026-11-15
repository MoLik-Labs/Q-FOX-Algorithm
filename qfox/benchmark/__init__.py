"""Benchmarking: the same scrambles, the same ruler, every method.

A method claim is only worth anything if it was measured against the others on
identical input, so this module never compares numbers from different runs.
It reports the four move metrics the engine knows (HTM, QTM, STM, ETM), the
wall-clock cost, the per-stage breakdown, and how many solves actually finished.
"""
from __future__ import annotations

import json
import os
import random
import time
from dataclasses import dataclass, field

from .. import native as N
from ..methods.base import Method, SolveTrace, StageCache

FACES = ("U", "R", "F", "D", "L", "B")
AXIS = {"U": 0, "D": 0, "R": 1, "L": 1, "F": 2, "B": 2}


def scramble(length: int = 25, rng: random.Random | None = None) -> str:
    """A WCA-style scramble: random outer turns, never two on the same face in a
    row and never three faces of one axis out of order."""
    rng = rng or random
    out: list[str] = []
    prev_axis = -1
    prev_face = ""
    while len(out) < length:
        f = rng.choice(FACES)
        if f == prev_face:
            continue
        if AXIS[f] == prev_axis and len(out) >= 2 and AXIS[out[-2][0]] == prev_axis:
            continue
        out.append(f + rng.choice(("", "2", "'")))
        prev_face, prev_axis = f, AXIS[f]
    return " ".join(out)


def scramble_set(n: int, seed: int = 20260101, length: int = 25) -> list[str]:
    rng = random.Random(seed)
    return [scramble(length, rng) for _ in range(n)]


@dataclass
class StageStat:
    name: str
    htm: float
    seconds: float
    nodes: float
    via: str = ""


@dataclass
class MethodResult:
    method: str
    scrambles: int
    solved: int
    failed: int
    htm: list[int] = field(default_factory=list)
    qtm: list[int] = field(default_factory=list)
    stm: list[int] = field(default_factory=list)
    etm: list[int] = field(default_factory=list)
    seconds: list[float] = field(default_factory=list)
    table_seconds: float = 0.0
    stages: dict = field(default_factory=dict)
    traces: list = field(default_factory=list)

    @property
    def htm_mean(self) -> float:
        return sum(self.htm) / len(self.htm) if self.htm else 0.0

    @property
    def seconds_mean(self) -> float:
        return sum(self.seconds) / len(self.seconds) if self.seconds else 0.0

    def summary(self) -> dict:
        def stats(xs):
            if not xs:
                return {}
            ys = sorted(xs)
            return {"mean": round(sum(ys) / len(ys), 2), "min": ys[0],
                    "max": ys[-1],
                    "median": ys[len(ys) // 2]}
        return {"method": self.method, "scrambles": self.scrambles,
                "solved": self.solved, "failed": self.failed,
                "htm": stats(self.htm), "qtm": stats(self.qtm),
                "stm": stats(self.stm), "etm": stats(self.etm),
                "seconds": {"mean": round(self.seconds_mean, 3),
                            "max": round(max(self.seconds), 3) if self.seconds else 0},
                "table_seconds": round(self.table_seconds, 2),
                "stages": self.stages}


def warm(method: Method, cache: StageCache) -> None:
    """Build every table `method` can ask for, before the clock starts.

    Tables are built lazily inside a solve, so without this the first method to
    need a big one is charged for it and the comparison is about table building
    rather than about solving.  A stage's tables depend only on its spec -- goal,
    keeps, heuristics, mask -- never on the cube, so they can all be built up
    front.  The cost is still reported, separately, as `table_seconds`.
    """
    for st in method.stages:
        for goal in st.candidate_goals():
            for g in tuple(goal) + tuple(st.keep) + tuple(st.heur):
                cache.table_for(g, st.mask)


def run(method: Method, scrs: list[str], cache: StageCache | None = None,
        book=None, verify: bool = True, keep_traces: bool = False) -> MethodResult:
    """Solve every scramble with `method` and collect the numbers."""
    cache = cache or StageCache()
    warm(method, cache)
    res = MethodResult(method.name, len(scrs), 0, 0)
    per_stage: dict[str, list] = {}
    for sc in scrs:
        cube = N.Cube.from_seq(sc)
        tr = method.solve(cube, cache, book=book)
        if tr.ok and (not verify or _verify(cube, tr)):
            res.solved += 1
            res.htm.append(tr.htm); res.qtm.append(tr.qtm)
            res.stm.append(tr.stm); res.etm.append(tr.etm)
            res.seconds.append(tr.seconds)
            for st in tr.stages:
                d = per_stage.setdefault(st.name, {"htm": [], "seconds": [],
                                                   "nodes": [], "via": {}})
                d["htm"].append(st.htm); d["seconds"].append(st.seconds)
                d["nodes"].append(st.nodes)
                d["via"][st.via] = d["via"].get(st.via, 0) + 1
            if keep_traces:
                res.traces.append({"scramble": sc,
                                   "stages": [(s.name, N.format_seq(s.moves), s.htm,
                                               round(s.seconds, 4), s.via)
                                              for s in tr.stages],
                                   "total": tr.htm})
        else:
            res.failed += 1
            res.seconds.append(tr.seconds)
            if keep_traces:
                res.traces.append({"scramble": sc, "failed": True,
                                   "stages": [(s.name, N.format_seq(s.moves), s.htm,
                                               round(s.seconds, 4), s.via, s.status)
                                              for s in tr.stages]})
    res.table_seconds = cache.build_seconds
    for name, d in per_stage.items():
        res.stages[name] = {
            "htm_mean": round(sum(d["htm"]) / len(d["htm"]), 2),
            "seconds_mean": round(sum(d["seconds"]) / len(d["seconds"]), 4),
            "nodes_mean": round(sum(d["nodes"]) / len(d["nodes"]), 1),
            "via": d["via"],
        }
    return res


def _verify(cube: N.Cube, tr: SolveTrace) -> bool:
    c = cube.copy()
    c.apply_moves(tr.solution())
    return c.is_solved


def compare(results: list[MethodResult], metric: str = "htm") -> str:
    """A fixed-width table, the thing that ends arguments."""
    head = f"{'method':<22}{'solved':>8}{'htm':>7}{'qtm':>7}{'stm':>7}{'etm':>7}{'sec':>9}"
    lines = [head, "-" * len(head)]
    for r in sorted(results, key=lambda r: getattr(r, f"{metric}_mean") or 1e9):
        s = r.summary()
        lines.append(
            f"{r.method:<22}{r.solved:>4}/{r.scrambles:<3}"
            f"{s['htm'].get('mean', 0):>7.2f}{s['qtm'].get('mean', 0):>7.2f}"
            f"{s['stm'].get('mean', 0):>7.2f}{s['etm'].get('mean', 0):>7.2f}"
            f"{s['seconds']['mean']:>9.3f}")
    return "\n".join(lines)


def save(results: list[MethodResult], path: str, meta: dict | None = None) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "engine": N.version(), "meta": meta or {},
               "results": [r.summary() for r in results]}
    with open(path, "w") as f:
        json.dump(payload, f, indent=1)
    return path
