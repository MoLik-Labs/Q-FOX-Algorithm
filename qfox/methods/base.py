"""Method representation.

A method is nothing but an ordered list of stages, and a stage is nothing but:

    reach  `goal`   (a coordinate, possibly with a set-valued target)
    while  `keep`   (other coordinates stay at their targets)
    using  `mask`   (the moves the method allows at this point)

Everything measurable falls out of that: the move count is what IDA* returns,
the memorisation load is the orbit count of the stage's case space, and the
search can mutate any of the three fields to invent a new method. No method in
this repository has bespoke solving code -- CFOP, Roux, ZZ, Petrus and LBL are
all the same six lines of data.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Sequence

from .. import native as N
from ..coords import CoordDef

# A stage that fails gets one retry: no heuristics but its own goal tables, and
# eight times the node budget.  Failures are then either genuinely hard or a
# mistake in the stage spec, and never silent.
RETRY_FACTOR = 8

try:
    from ..alggen import llsolve as _LL
except Exception:                                   # pragma: no cover
    _LL = None


@dataclass(frozen=True)
class Goal:
    """One goal condition: a coordinate, plus how "done" is recognised.

    `seeds` turns the condition into a set ("these digits are zero, the rest are
    free") by BFS-ing a multi-source table; that is how "last layer oriented,
    permutation free" and "U-layer edges oriented" are expressed.

    `auf` is the same mechanism specialised to the four rotations of the U face:
    the goal becomes an orbit instead of a point, which is what makes a
    last-layer stage search in the number of moves a human actually needs.
    """
    coord: CoordDef
    seeds: Sequence[int] | None = None
    mask_for_table: int | None = None
    auf: bool = False        # goal may stop at any AUF rotation of the target

    def __post_init__(self):
        # frozen, but seeds must be a tuple for Goal to stay hashable -- the
        # solver keeps a set of the goals it has already realised
        if self.seeds is not None and not isinstance(self.seeds, tuple):
            object.__setattr__(self, "seeds", tuple(self.seeds))
        if self.auf and self.seeds is None:
            from ..coords import auf_seeds
            object.__setattr__(self, "seeds", tuple(auf_seeds(self.coord)))

    def target(self) -> int:
        return self.coord.target


@dataclass
class Stage:
    name: str
    goal: tuple[Goal, ...]
    alternatives: tuple[tuple[Goal, ...], ...] = ()   # try each, keep the cheapest
    keep_from: tuple[str, ...] = ()   # earlier stages whose chosen goals must hold
    keep: tuple[Goal, ...] = ()
    heur: tuple[Goal, ...] = ()          # extra admissible tables, if any
    mask: int = N.MASK_OUTER
    max_depth: int = 26
    node_budget: int = 30_000_000
    rotations: bool = False
    note: str = ""
    # A stage whose goal is a set of last-layer elements can be answered by the
    # book in microseconds instead of by IDA* in seconds: "oll", "pll", "cmll",
    # "ell".  The keep/heur spec below stays as the fallback for elements deeper
    # than the sweep has reached.
    ll_goal: str | None = None
    # Whether to answer the stage by scanning the book ball instead of searching
    # it.  None means "whenever it applies": the position's first two layers are
    # home, or the stage declares a last-layer goal (Roux CMLL, where two
    # M-slice edges are still free, is the interesting case).  True/False force
    # it on or off.
    scan: bool | None = None
    # Set on a stage that turns slice faces: its goal coordinate tracks pieces,
    # and pieces can all be home while the centres are rotated, which is not a
    # solved cube.  Such a stage enumerates its shortest solutions and keeps the
    # first that leaves the centres where they started.
    align_centres: bool = False
    align_limit: int = 4096        # candidates examined per length
    align_widen: int = 2           # how many extra moves to look past optimal
    # reporting / memorisation
    alg_family: str | None = None        # key into cases.FAMILIES, e.g. "OLL"
    intuitive: bool = False              # no algorithms to memorise
    algs: int | None = None              # explicit override

    def __post_init__(self):
        if isinstance(self.goal, Goal):
            self.goal = (self.goal,)
        elif not isinstance(self.goal, tuple):
            self.goal = tuple(self.goal)
        self.keep = tuple(self.keep)
        self.heur = tuple(self.heur)

    def candidate_goals(self) -> tuple[tuple[Goal, ...], ...]:
        """Every (goal) variant this stage may realise, cheapest-first search."""
        if not self.alternatives:
            return (self.goal,)
        return tuple(self.alternatives)


class StageCache:
    """Builds and holds the coordinate tables a method needs, once."""

    def __init__(self, max_table_size: int = 1 << 26):
        self.max_table_size = max_table_size
        self._tables: dict[tuple[int, int, tuple], int] = {}
        self._targets: dict[int, int] = {}
        self.build_seconds = 0.0
        self.built: list[str] = []

    def table_for(self, goal: Goal, mask: int) -> int:
        # Tables are BFS-ed with the WIDEST mask, not the stage's.  Two reasons.
        # A distance measured over more moves is smaller, and a smaller number is
        # still a lower bound, so it stays admissible.  And a table built with a
        # narrow mask has holes: a state the stage reaches through moves outside
        # that mask reads as "unknown", which the search treats as infinity and
        # prunes everything.  Keeps are unaffected -- a keep table is used as
        # "distance == 0", which is the seed set under any mask.
        tmask = goal.mask_for_table if goal.mask_for_table is not None \
            else (N.MASK_OUTER | mask)
        seeds = tuple(goal.seeds) if goal.seeds is not None else None
        key = (goal.coord.name, tmask, hash(seeds) if seeds is not None else None)
        hit = self._tables.get(key)
        if hit is not None:
            return hit
        t0 = time.time()
        h = goal.coord.handle(tmask, seeds=list(seeds) if seeds is not None else None,
                              max_size=self.max_table_size)
        self.build_seconds += time.time() - t0
        self._tables[key] = h
        self.built.append(f"{goal.coord.name}[mask={tmask:#x},seeds={len(seeds) if seeds else 1}]")
        return h

    def target_of(self, goal: Goal) -> int:
        """The keep_target the engine wants: for a seeded (set-valued) goal the
        table decides, so the number is irrelevant and 0 keeps it out of the way."""
        return goal.coord.target if goal.seeds is None else 0

    def release(self) -> None:
        for h in self._tables.values():
            N.free_table(h)
        self._tables.clear()


@dataclass
class StageTrace:
    name: str
    moves: list[int]
    status: int
    nodes: int
    htm: int
    stm: int
    qtm: int
    etm: int
    seconds: float
    variant: int = 0        # which alternative was chosen
    tried: int = 1
    via: str = "ida"        # "ida", "book", "book:auf", "book:product"

    @property
    def ok(self) -> bool:
        return self.status == 0


@dataclass
class SolveTrace:
    method: str
    scramble: str
    stages: list[StageTrace]
    total_moves: list[int]
    seconds: float
    ok: bool

    @property
    def htm(self) -> int:
        return self.total_moves[N.HTM]

    @property
    def stm(self) -> int:
        return self.total_moves[N.STM]

    @property
    def qtm(self) -> int:
        return self.total_moves[N.QTM]

    @property
    def etm(self) -> int:
        return self.total_moves[N.ETM]

    def solution(self) -> list[int]:
        out: list[int] = []
        for s in self.stages:
            out.extend(s.moves)
        return N.optimize(out)


@dataclass
class Method:
    name: str
    family: str
    stages: list[Stage]
    algs_by_tier: dict[str, int] = field(default_factory=dict)
    description: str = ""
    reference: str = ""

    # -- the last-layer book ---------------------------------------------
    _ll_solvers: dict = field(default_factory=dict, repr=False, compare=False)

    def ll_solver(self, goal: str, book):
        key = (id(book), goal)
        sol = self._ll_solvers.get(key)
        if sol is None:
            sol = _LL.LlSolver(book, goal)
            self._ll_solvers[key] = sol
        return sol

    def solve_ll(self, st: "Stage", cube: N.Cube, book):
        """Answer a last-layer stage from the book, or None if it cannot."""
        if _LL is None or book is None or not st.ll_goal:
            return None
        try:
            sol = self.ll_solver(st.ll_goal, book)
        except RuntimeError:
            return None                       # book not swept deep enough yet
        return sol.solve(cube)

    def _align_centres(self, cur, st, keep, heur):
        """Solve a slice-turning stage so that the centres end up aligned too.

        The goal coordinate counts pieces, and a slice move can put every piece
        home while leaving the centres rotated -- which is not a solved cube, and
        which no coordinate here can see.  So: find the shortest piece-level
        answer, then enumerate the solutions of that length and take the first
        that leaves the centres alone, widening by one move at a time until one
        turns up.  The result is the shortest centre-aligned solution among the
        first `align_limit` of each length, which for the last six edges is the
        optimum in practice and costs one or two moves over the piece-only one.
        """
        res = N.solve_stage(cur, keep, heur, st.mask, st.max_depth,
                            st.node_budget, st.rotations)
        if not res.ok:
            return res, None, 0
        base = N.seq_cost(N.HTM, res.moves)
        seen = 0
        for extra in range(st.align_widen + 1):
            cands = N.enumerate_stage(cur, keep, heur, st.mask, base + extra,
                                      st.align_limit, st.node_budget, st.rotations)
            seen += len(cands)
            for mv in cands:                  # collected shortest first
                c2 = cur.copy()
                c2.apply_moves(mv)
                if N.centres_aligned(c2):
                    return res, mv, seen
            if len(cands) < st.align_limit:
                # that length is exhausted, so widening cannot be skipped: the
                # next length is the next chance
                continue
        return res, None, seen

    def scan_ok(self, st: "Stage", cube: N.Cube, book) -> bool:
        """May this stage be answered by scanning the book ball?

        The scan tries every element the sweep has reached, shortest first, and
        keeps the first whose word satisfies the stage.  For a position whose
        first two layers are home that is provably the shortest possible answer,
        and it costs milliseconds where IDA* costs minutes -- the constraint that
        the first two layers stay home is exactly what no small heuristic can
        see.  It also works on a position with free M-slice edges, where it is
        merely the best answer among words that leave the first two layers home,
        so a stage that declares a last-layer goal gets it tried anyway.
        """
        b = getattr(book, "_b", None)
        if b is None or b.nfound <= 1:
            return False
        if st.align_centres:
            # the scan returns one word and cannot check the centres, and its
            # words are outer moves anyway, which is not the mask this stage uses
            return False
        if st.scan is not None:
            return st.scan
        return st.ll_goal is not None or N.ll_encode(cube) >= 0

    # -- predicates ------------------------------------------------------
    def satisfied(self, g: Goal, cube: N.Cube, cache: "StageCache", mask: int) -> bool:
        """Is this goal already true on `cube`?"""
        if g.seeds is None:
            return g.coord.encode(cube) == g.coord.target
        return N.table_lookup(cache.table_for(g, mask), g.coord.encode(cube)) == 0

    # -- solving ---------------------------------------------------------
    def solve(self, cube: N.Cube, cache: StageCache, book=None) -> SolveTrace:
        cur = cube.copy()
        traces: list[StageTrace] = []
        totals = [0, 0, 0, 0]
        t_all = time.time()
        ok = True
        done: dict[str, tuple[Goal, ...]] = {}
        chosen: set[Goal] = set()

        for st in self.stages:
            t0 = time.time()
            extra_keep = [g for name in st.keep_from for g in done.get(name, ())]
            best = None
            variants = st.candidate_goals()
            if len(variants) > 1:
                # never re-realise a goal an earlier stage reached, or one the
                # cube happens to satisfy already -- both would waste the stage
                fresh = [g for g in variants
                         if not all(x in chosen for x in g)
                         and not all(self.satisfied(x, cur, cache, st.mask) for x in g)]
                if fresh:
                    variants = tuple(fresh)
            via = "ida"
            scan = book is not None and self.scan_ok(st, cur, book)
            for vi, goal in enumerate(variants):
                keep, heur = [], []
                for g in tuple(goal) + tuple(st.keep) + tuple(extra_keep):
                    if g.seeds is not None:
                        tb = cache.table_for(g, st.mask)
                        keep.append((g.coord.coord, tb, 0))
                    else:
                        keep.append((g.coord.coord, -1, g.coord.target))
                for g in tuple(goal) + tuple(st.heur):
                    tb = cache.table_for(g, st.mask)
                    heur.append((g.coord.coord, tb,
                                 g.coord.target if g.seeds is None else 0))
                t0 = time.time()
                if st.align_centres:
                    r, pick, seen = self._align_centres(cur, st, keep, heur)
                    dt = time.time() - t0
                    if pick is not None:
                        r = N.StageResult(pick, 0, True, seen)
                    else:
                        r = N.StageResult(r.moves if r.ok else [], r.status,
                                          False, seen)
                    cand = (r, dt, vi, "centres" if pick is not None else "ida")
                    if best is None or (r.ok and (not best[0].ok or
                                                  N.seq_cost(N.HTM, r.moves) <
                                                  N.seq_cost(N.HTM, best[0].moves))):
                        best = cand
                    if r.ok and len(variants) == 1:
                        break
                    continue
                if scan:
                    r = N.ll_scan(book._b, cur, keep, st.mask)
                    if r.ok:
                        # optimal for this variant, so no search is worth running
                        res, dt, via = r, time.time() - t0, "book:scan"
                        cand = (res, dt, vi, via)
                        if best is None or N.seq_cost(N.HTM, res.moves) < \
                                N.seq_cost(N.HTM, best[0].moves):
                            best = cand
                        if len(variants) == 1:
                            break
                        continue
                res = N.solve_stage(cur, keep, heur, st.mask, st.max_depth,
                                    st.node_budget, st.rotations)
                dt = time.time() - t0
                cand = (res, dt, vi, "ida")
                if best is None or (res.ok and (not best[0].ok or
                                                N.seq_cost(N.HTM, res.moves) <
                                                N.seq_cost(N.HTM, best[0].moves))):
                    best = cand
                if res.ok and len(variants) == 1:
                    break
            res, dt, vi, via = best
            if not res.ok and st.ll_goal is not None:
                # Nothing in the ball satisfied the stage, so the element is
                # deeper than the sweep.  Split the answer in two halves that are
                # both in the ball: that reaches twice the swept depth and is
                # still exact, which is far more than the last layer needs.
                llr = self.solve_ll(st, cur, book)
                if llr is not None:
                    res = N.StageResult(llr.moves, 0, True, 0)
                    via = "book:" + llr.via
            if not res.ok:
                # An extra heuristic can only help if it is a true lower bound.
                # Rather than trust every stage spec to get that right, a failed
                # stage is retried with nothing but its own goal tables, which
                # are admissible by construction.
                for vj, goal in enumerate(variants):
                    keep = []
                    for g in tuple(goal) + tuple(st.keep) + tuple(extra_keep):
                        if g.seeds is not None:
                            keep.append((g.coord.coord, cache.table_for(g, st.mask), 0))
                        else:
                            keep.append((g.coord.coord, -1, g.coord.target))
                    heur = [(g.coord.coord, cache.table_for(g, st.mask),
                             g.coord.target if g.seeds is None else 0)
                            for g in goal]
                    t1 = time.time()
                    r2 = N.solve_stage(cur, keep, heur, st.mask, st.max_depth,
                                       st.node_budget * RETRY_FACTOR, st.rotations)
                    dt += time.time() - t1
                    if r2.ok:
                        res, vi, via = r2, vj, "ida:retry"
                        break
            costs = [N.seq_cost(m, res.moves) for m in (N.HTM, N.QTM, N.STM, N.ETM)]
            if not res.ok:
                ok = False
            else:
                for i, c in enumerate(costs):
                    totals[i] += c
                cur.apply_moves(res.moves)
                done[st.name] = variants[vi]
                chosen.update(variants[vi])
            traces.append(StageTrace(st.name, res.moves, res.status, res.nodes,
                                     costs[0], costs[2], costs[1], costs[3], dt,
                                     vi, len(variants), via))
            if not res.ok:
                break
        return SolveTrace(self.name, "", traces, totals, time.time() - t_all, ok)

    # -- memorisation ----------------------------------------------------
    def alg_count(self, tier: str = "full") -> int:
        return self.algs_by_tier.get(tier, self.algs_by_tier.get("full", 0))

    def stage_summary(self) -> str:
        return " -> ".join(s.name for s in self.stages)
