"""Q-FOX: a measured, generated, self-improving 3x3 method laboratory.

Public surface lives in submodules; this package deliberately has no import
side effects beyond building the C engine on first use.
"""
from . import native  # noqa: F401  (builds/loads the engine)

__version__ = "0.1.0"
