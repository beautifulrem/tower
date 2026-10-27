"""Tower's assertion-identity guard for Python (`docs/07` §7.6).

The invariant it checks: while the criteria run, the assertion entry points
the tests use must be the library's own objects, unmodified. Python runs
this file at interpreter start-up, before any project code, so what it
records is the library as it was shipped; at exit it compares.

The report goes to a transcript Tower owns, outside everything the run may
write: the sandbox lets the run add a line to it and nothing else, and the
file is append-only, so what Tower already has can be neither removed nor
rewritten. Each process commits to a secret before any project code loads
and reveals it with its verdict, so a verdict cannot be attributed to a
process that did not report one.

Any other `sitecustomize` on the path still runs (this one only goes first).
"""

import atexit
import builtins
import hashlib
import os
import secrets
import sys

_LOG = os.environ.get("TOWER_GUARD_LOG")
_NONCE = secrets.token_hex(16)
_COMMITMENT = hashlib.sha256(_NONCE.encode()).hexdigest()


def _write(line):
    if not _LOG:
        return
    try:
        with open(_LOG, "a") as out:
            out.write(line)
    except OSError:
        pass  # No transcript (run outside a verification): stay quiet.


def _entry_points():
    """What is watched: `unittest`'s assertion methods and AssertionError."""
    watched = [("builtins.AssertionError", builtins.AssertionError)]
    try:
        import unittest
    except Exception:
        return watched, None
    case = unittest.TestCase
    for name in dir(case):
        if not name.startswith("assert") or name.endswith("_"):
            continue
        try:
            value = getattr(case, name)
        except Exception:
            continue
        if callable(value):
            watched.append(("unittest.TestCase." + name, value))
    return watched, unittest


_WATCHED, _UNITTEST = _entry_points()
_UNITTEST_FILE = getattr(_UNITTEST, "__file__", None)


def _from_library(func, prefixes):
    """Whether a callable still belongs to the library that defines it."""
    module = getattr(func, "__module__", "") or ""
    return any(module == p or module.startswith(p + ".") for p in prefixes)


def _findings():
    bad = []
    if builtins.AssertionError is not _WATCHED[0][1]:
        bad.append("builtins.AssertionError")
    if _UNITTEST is not None and sys.modules.get("unittest") is not _UNITTEST:
        bad.append("unittest")
    elif _UNITTEST is not None and getattr(_UNITTEST, "__file__", None) != _UNITTEST_FILE:
        bad.append("unittest.__file__")
    for label, original in _WATCHED[1:]:
        name = label.rsplit(".", 1)[1]
        try:
            now = getattr(_UNITTEST.TestCase, name)
        except Exception:
            bad.append(label)
            continue
        if now is not original:
            bad.append(label)
    # pytest is imported by the run, not before it: the check there is that
    # its entry points still belong to the library.
    pytest = sys.modules.get("pytest")
    if pytest is not None:
        for name in ("fail", "raises", "approx", "skip"):
            func = getattr(pytest, name, None)
            if func is None:
                continue
            if not _from_library(func, ("pytest", "_pytest")):
                bad.append("pytest." + name)
    return bad


def _report():
    bad = _findings()
    verdict = "replaced" if bad else "intact"
    detail = ",".join(bad[:8]) if bad else "-"
    _write("tower-assert-guard 1 python end %s %s %s\n" % (_NONCE, verdict, detail))


def _chain():
    """Runs any other `sitecustomize` further along the path."""
    here = os.path.dirname(os.path.abspath(__file__))
    rest = [p for p in sys.path if p and os.path.abspath(p) != here]
    try:
        import importlib.util
        from importlib.machinery import PathFinder

        spec = PathFinder.find_spec("sitecustomize", rest)
        if spec is None or spec.loader is None:
            return
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception:
        pass


_write("tower-assert-guard 1 python start %s %d\n" % (_COMMITMENT, len(_WATCHED)))
atexit.register(_report)
_chain()
