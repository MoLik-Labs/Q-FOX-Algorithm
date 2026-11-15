"""Solving a last layer with the book instead of a search.

The last layer is the one part of a solve where a table beats a search.  An
IDA* over "permute the last layer while keeping the first two layers home" has
a heuristic that is always several moves below the truth -- the constraint is
what costs the moves, and no small coordinate can see it -- so it burns tens of
millions of nodes and still fails on a third of the PLL cases.

The book already knows the answer.  For a state X whose first two layers are
home, X is one of the 62208 elements; the shortest word for X, inverted, is the
algorithm.  A goal that is a *set* (finish at any AUF, or at any oriented
pattern) is handled by the same trick: solving X into s is the word for the
element X^-1 s, and X^-1 is just the solved cube with the inverse of X's own
word applied.  Everything below is table lookups and cube applications -- no
searching at all.
"""
from __future__ import annotations

from dataclasses import dataclass

from .. import coords as C
from .. import native as N
from . import book as B
from . import cases as K

U = N.parse_move("U")
IDENT_STATE = (B.IDENT, B.ZERO4, B.IDENT, B.ZERO4)


def _even_perms():
    return [p for p in K.S4 if K.sign(p) > 0]


def _odd_perms():
    return [p for p in K.S4 if K.sign(p) < 0]


def _element(state) -> int:
    return B.element_of(state)


# --------------------------------------------------------------------------- #
# the goal sets, as element ids
# --------------------------------------------------------------------------- #
def goal_auf() -> list[int]:
    """Solved, up to a final U turn: the four AUF images of the identity."""
    return [_element(B.full_state("PLL", (B.IDENT, B.IDENT)))] + [
        N.ll_encode(N.Cube().apply_moves([U] * k)) for k in (1, 2, 3)]


def goal_oll() -> list[int]:
    """Oriented, permutation free: every element with both orientations zero.

    Corner and edge permutations must share a parity, so the 288 elements are
    the (even, even) and (odd, odd) pairs of the same permutation.
    """
    ev, od = _even_perms(), _odd_perms()
    out = [(se, B.ZERO4, sc, B.ZERO4) for se in ev for sc in ev]
    out += [(se, B.ZERO4, sc, B.ZERO4) for se in od for sc in od]
    ids = [_element(s) for s in out]
    assert len(set(ids)) == 288, len(set(ids))
    return ids


def goal_cmll() -> list[int]:
    """Corners solved and the last-layer edges oriented, permutation free."""
    return [_element((se, B.ZERO4, B.IDENT, B.ZERO4)) for se in _even_perms()]


def goal_ell() -> list[int]:
    """Edges solved up to AUF, corners already done."""
    return goal_auf()


GOALS = {
    "solved": goal_auf,
    "pll": goal_auf,
    "zbll": goal_auf,
    "oll": goal_oll,
    "cmll": goal_cmll,
    "cll": goal_cmll,
    "ell": goal_ell,
}


@dataclass
class LlResult:
    moves: list[int]
    element: int
    goal_element: int
    length: int
    via: str            # "book", "auf", "product"
    optimal_within: int


class LlSolver:
    """Turns a last-layer state into an algorithm, using the book."""

    #: how many goal elements the meet-in-the-middle fallback may use.  The
    #: cost is one pass over the ball per goal, so four (the AUF images of
    #: solved) is a fraction of a second while 288 (every oriented last layer)
    #: is not -- and a goal set that big never needs the fallback, because the
    #: ball scan answers it directly.
    MAX_PRODUCT_GOALS = 24

    def __init__(self, book: B.Book, goal: str = "pll"):
        self.book = book
        self.goal_name = goal
        self.goal = sorted(set(GOALS[goal]()))
        # Only goal elements the sweep has reached can take part: solving X into
        # s is solving X.s^-1 into the identity, which needs s's own word.  A
        # shallow sweep therefore narrows the goal set rather than failing, and
        # the answer stays legal -- it just may not be the cheapest AUF.
        reached = [g for g in self.goal if book._b.len[g] != 255]
        if not reached:
            raise RuntimeError(
                f"book swept to {book.swept} contains none of the "
                f"{len(self.goal)} '{goal}' goal elements; sweep deeper")
        self.reached = sorted(reached, key=lambda g: book._b.len[g])
        self.complete = len(reached) == len(self.goal)

    # -- helpers ---------------------------------------------------------
    def word_of(self, element: int) -> list[int] | None:
        """A word that takes the solved cube to `element` (not inverted)."""
        b = self.book._b
        n = b.len[element]
        if n == 255:
            return None
        return [b.word[element * N.LL_MAXLEN + i] for i in range(n)]

    def _inverse_cube(self, word) -> N.Cube:
        c = N.Cube()
        c.apply_moves(N.inverse_seq(word))
        return c

    # -- the solve -------------------------------------------------------
    def solve(self, cube: N.Cube) -> LlResult | None:
        """The shortest way into the goal set, by a meet in the middle.

        Called only when the ball scan came up empty, i.e. when the element is
        deeper than the sweep.  Writing the answer as g^-1 followed by the word
        for X.g^-1, with both halves in the ball, reaches twice the swept depth
        and is still exact, so this is the optimal algorithm and not a
        make-do one -- at the cost of one pass over the ball per goal element.
        """
        el = N.ll_encode(cube)
        if el < 0:
            return None                      # first two layers are not home
        goals = self.reached[:self.MAX_PRODUCT_GOALS]
        mv = N.ll_product(self.book._b, cube, goals)
        if mv is None:
            return None
        return LlResult(mv, el, 0, N.seq_cost(N.HTM, mv), "product",
                        self.book.swept)
