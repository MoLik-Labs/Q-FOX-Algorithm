"""Case enumeration by group structure, not by scraping a website.

The last layer of a solved-first-two-layers cube is a group:

    LL = { (se, te, sc, tc) : sign(se) = sign(sc),
                              sum(te) = 0 mod 2,
                              sum(tc) = 0 mod 3 }

with se in S4 the placement of the four U-layer edges, te in Z2^4 their flips,
sc in S4 the placement of the four U-layer corners and tc in Z3^4 their twists.
|LL| = 288 * 8 * 27 = 62208, the number every reference agrees on.

A "case" for a stage is an orbit of that group under whatever the solver is
allowed to do for free -- a U turn before and/or after (AUF), a cube rotation,
a mirror. So the number of algorithms a method asks you to memorise is an orbit
count, computed here by Burnside rather than asserted. That is what makes the
"easy / medium / hard" tiers in this repo mean something: a tier is a symmetry
group plus an orbit budget, and the count is derived.

Reference numbers this module must reproduce (and does, see tests):
    OLL      57 non-trivial (+ solved = 58 orbits under AUF)
    PLL      21 non-trivial (+ solved = 22 orbits under AUF before and after)
    CLL      42 non-trivial
    COLL     42 orbits
    ELL      29
    L4E/2G   ...
"""
from __future__ import annotations

import itertools
import math
from dataclasses import dataclass

# --------------------------------------------------------------------------- #
# permutation helpers (S4 on the four last-layer slots, in U-slot order)
# --------------------------------------------------------------------------- #
S4 = list(itertools.permutations(range(4)))


def sign(p) -> int:
    s = 0
    for i in range(len(p)):
        for j in range(i + 1, len(p)):
            if p[j] < p[i]:
                s ^= 1
    return 1 - 2 * s


def compose(p, q):
    """(p . q)(i) = p(q(i))."""
    return tuple(p[q[i]] for i in range(len(q)))


def inverse(p):
    out = [0] * len(p)
    for i, v in enumerate(p):
        out[v] = i
    return tuple(out)


# The AUF cycles are DERIVED from the engine at import time rather than typed
# in, so this module cannot silently disagree with the C cube about which way U
# turns. Slot order is UR UF UL UB for edges, URF ULF ULB URB for corners.
def _derive_cycles():
    from .. import native as N
    from ..coords import U_CORNERS, U_EDGES

    c = N.Cube.solved().apply(N.parse_move("U"))
    pm = c.pmap()
    esucc = tuple(U_EDGES.index(pm.slotof[s]) for s in U_EDGES)
    csucc = tuple(U_CORNERS.index(pm.slotof[s]) for s in U_CORNERS)
    return esucc, csucc


U_EDGE_SUCC, U_CORNER_SUCC = _derive_cycles()
U_EDGE_PRED = inverse(U_EDGE_SUCC)
U_CORNER_PRED = inverse(U_CORNER_SUCC)


def _pow(p, k: int):
    r = tuple(range(len(p)))
    for _ in range(k % len(p)):
        r = compose(p, r)
    return r


# --------------------------------------------------------------------------- #
# the group
# --------------------------------------------------------------------------- #
def edge_orientations() -> list[tuple]:
    return [t for t in itertools.product((0, 1), repeat=4) if sum(t) % 2 == 0]


def corner_orientations() -> list[tuple]:
    return [t for t in itertools.product((0, 1, 2), repeat=4) if sum(t) % 3 == 0]


def ll_group():
    """All 62208 last-layer states as (se, te, sc, tc)."""
    eo = edge_orientations()
    co = corner_orientations()
    even = [p for p in S4 if sign(p) > 0]
    odd = [p for p in S4 if sign(p) < 0]
    perms = [(a, b) for a in even for b in even] + [(a, b) for a in odd for b in odd]
    assert len(perms) == 288
    for (se, sc) in perms:
        for te in eo:
            for tc in co:
                yield se, te, sc, tc


def ll_size() -> int:
    return 288 * 8 * 27


# --------------------------------------------------------------------------- #
# symmetry actions
# --------------------------------------------------------------------------- #
def auf_state(state, k: int = 1):
    """Apply U^k to a last-layer state.

    A U turn moves the cubie in slot i to slot succ(i), so the placement map
    composes with succ^-k on the right. Edge flip and corner twist are
    unchanged by U (the reference face of a U-layer cubie stays a U face), so
    the orientation tuples are only re-indexed.
    """
    se, te, sc, tc = state
    ep, cp = _pow(U_EDGE_PRED, k), _pow(U_CORNER_PRED, k)
    return (compose(se, ep), tuple(te[ep[i]] for i in range(4)),
            compose(sc, cp), tuple(tc[cp[i]] for i in range(4)))


def encode_state(state) -> int:
    se, te, sc, tc = state
    return ((S4.index(se) * 4 + S4.index(sc)) * 8 + _eo_index(te)) * 27 + _co_index(tc)


_EO = edge_orientations()
_CO = corner_orientations()
_eo_index = {t: i for i, t in enumerate(_EO)}
_co_index = {t: i for i, t in enumerate(_CO)}


# --------------------------------------------------------------------------- #
# orbit counting
# --------------------------------------------------------------------------- #
@dataclass
class CaseFamily:
    name: str
    states: list
    canonical: dict          # state -> canonical representative
    orbits: dict             # canonical -> [states]
    symmetry: str

    @property
    def count(self) -> int:
        return len(self.orbits)


def quotient(states, actions, key=None):
    """Orbits of `states` under a list of unary actions."""
    key = key or (lambda s: s)
    canonical: dict = {}
    orbits: dict = {}
    for s in states:
        img = [key(a(s)) for a in actions] + [key(s)]
        rep = min(img)
        canonical[s] = rep
        orbits.setdefault(rep, []).append(s)
    # merge transitively: two states can share a canonical image only if they
    # are in the same orbit, because `rep` is the orbit minimum
    return canonical, orbits


def oll_cases() -> CaseFamily:
    """OLL = orientation pattern, permutation irrelevant, AUF free.

    Expected: 58 orbits, 57 of them non-trivial.
    """
    states = [(te, tc) for te in _EO for tc in _CO]
    assert len(states) == 216

    def act(k):
        ep, cp = _pow(U_EDGE_PRED, k), _pow(U_CORNER_PRED, k)
        return lambda s: (tuple(s[0][ep[i]] for i in range(4)),
                          tuple(s[1][cp[i]] for i in range(4)))

    actions = [act(k) for k in range(4)]
    canonical, orbits = quotient(states, actions)
    return CaseFamily("OLL", states, canonical, orbits, "AUF (Z4)")


def pll_cases() -> CaseFamily:
    """PLL = permutation, orientation solved, AUF free before and after.

    Expected: 22 orbits, 21 of them non-trivial.
    """
    even = [p for p in S4 if sign(p) > 0]
    odd = [p for p in S4 if sign(p) < 0]
    states = [(a, b) for a in even for b in even] + [(a, b) for a in odd for b in odd]
    assert len(states) == 288

    def act(a_k, b_k):
        ea = _pow(U_EDGE_PRED, a_k)
        ca = _pow(U_CORNER_PRED, a_k)
        eb = _pow(U_EDGE_SUCC, b_k)
        cb = _pow(U_CORNER_SUCC, b_k)
        return lambda s: (compose(eb, compose(s[0], ea)), compose(cb, compose(s[1], ca)))

    actions = [act(a, b) for a in range(4) for b in range(4)]
    canonical, orbits = quotient(states, actions)
    return CaseFamily("PLL", states, canonical, orbits, "AUF x AUF (Z4 x Z4)")


def _double_coset_actions(succ, pred):
    """The 16 pairs (a, c) in Z4 x Z4 acting as  P -> s^a . P . s^-c.

    `a` is a cube rotation (relabels slots AND cubie homes, so it conjugates),
    `c` is the net slot relabelling, which a y^a followed by AUF^b makes a+b.
    Orientation digits follow the slot relabelling only: T -> T . s^-c.
    This is exactly the freedom a solver has when recognising a case.
    """
    return [(_pow(succ, a), _pow(pred, c)) for a in range(4) for c in range(4)]


def _y_actions(succ):
    """Cube rotations only: P -> s^a . P . s^-a, T -> T . s^-a."""
    return [(_pow(succ, a), inverse(_pow(succ, a))) for a in range(4)]


def _act(succ_pairs, orient_follows_second=True):
    out = []
    for sa, sc in succ_pairs:
        m = sc if orient_follows_second else inverse(sa)
        out.append(lambda s, sa=sa, sc=sc, m=m: (compose(sa, compose(s[0], sc)),
                                                 tuple(s[1][m[i]] for i in range(4))))
    return out


def cll_cases() -> CaseFamily:
    """CMLL / CLL: last-layer corners solved, edges left for LSE.

    State space 24 * 27 = 648 (no parity restriction: the still-free edges can
    absorb any parity). 43 orbits = the 42 CMLL algorithms plus solved.
    """
    states = [(sc, tc) for sc in S4 for tc in _CO]
    assert len(states) == 648
    actions = _act(_double_coset_actions(U_CORNER_SUCC, U_CORNER_PRED))
    canonical, orbits = quotient(states, actions)
    return CaseFamily("CLL", states, canonical, orbits, "AUF x y (Z4 x Z4)")


def coll_cases() -> CaseFamily:
    """COLL: corners solved while the LL edges stay oriented.

    Same state space and same symmetry as CLL, so the same orbit count; it is a
    different *stage* in a method, not a different case family.
    """
    fam = cll_cases()
    return CaseFamily("COLL", fam.states, fam.canonical, fam.orbits, "AUF x y (Z4 x Z4)")


def ell_cases() -> CaseFamily:
    """ELL: last-layer edges solved with the corners already done.

    Corners solved forces an even edge permutation and an even flip pattern, so
    the state space is 12 * 8 = 96. AUF does not change the edge state relative
    to the corners, so the only free symmetry is the cube rotation: 30 orbits,
    i.e. the 29 published ELL algorithms plus solved.
    """
    states = [(se, te) for se in S4 if sign(se) > 0 for te in _EO]
    assert len(states) == 96
    actions = _act(_y_actions(U_EDGE_SUCC))
    canonical, orbits = quotient(states, actions)
    return CaseFamily("ELL", states, canonical, orbits, "y (Z4)")


FAMILIES = {
    "OLL": oll_cases,
    "PLL": pll_cases,
    "CLL": cll_cases,
    "COLL": coll_cases,
    "ELL": ell_cases,
}


def burnside(states, actions) -> float:
    """Orbit count by Burnside, as an independent check on `quotient`."""
    total = 0
    for a in actions:
        total += sum(1 for s in states if a(s) == s)
    return total / len(actions)


# Orbit counts every published reference agrees on. These are the acceptance
# test for the whole case-enumeration layer: if the engine, the slot naming or
# the symmetry action drifts, one of these numbers moves.
EXPECTED = {"OLL": 58, "PLL": 22, "CLL": 43, "COLL": 43, "ELL": 30}
NON_TRIVIAL = {k: v - 1 for k, v in EXPECTED.items()}
