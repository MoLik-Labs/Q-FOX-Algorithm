"""Solving methods, as data.

`classic` holds the methods Q-FOX has to beat; `qfox` holds the candidate
method and the variants the benchmark compares it against.  Both are just lists
of stages -- there is no per-method solving code anywhere in this package.
"""
from . import base, classic, qfox

METHODS: dict = {}
METHODS.update(classic.METHODS)
METHODS.update(qfox.VARIANTS)

__all__ = ["base", "classic", "qfox", "METHODS"]
