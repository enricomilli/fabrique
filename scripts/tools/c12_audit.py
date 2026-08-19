#!/usr/bin/env python3
"""
c12_audit.py — flag COMPOUND page bindings in a fiche: a bullet carrying two or
more « … » quotes but fewer (p. N) tags than quotes, or one (p. N) trailing two
quotes. That is the inheritance vector of important_notes C11: the note re-cites
the fiche's bindings as-is, so one tag covering two pages' content becomes a
wrong citation downstream. The C12 prompt rule forbids it; this is the metric.

Usage: python3 scripts/tools/c12_audit.py results/<thesis>/<thesis>_fiche.md
Prints the flagged lines and a summary; always exits 0 (advisory).
"""
import pathlib
import re
import sys

QUOTE_RE = re.compile(r"«[^»]{8,}»")
TAG_RE = re.compile(r"\(p\. ?\d+(?:\s?[-–]\s?\d+)?\)")
# two quotes, then one tag, with no tag between them
TWO_QUOTES_ONE_TAG_RE = re.compile(r"«[^»]{8,}»[^«»()]{0,80}«[^»]{8,}»[^«»()]{0,40}\(p\. ?\d+")
BULLET_PREFIXES = ("-", "*", "**", "1.", "2.", "3.")


def audit(path) -> tuple[list, int]:
    """Return (flagged, n_bullets); flagged = [(line_no, n_quotes, n_tags, line_head), …]."""
    flagged = []
    n_bullets = 0
    for ln, line in enumerate(pathlib.Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip().startswith(BULLET_PREFIXES):
            continue
        n_bullets += 1
        quotes = QUOTE_RE.findall(line)
        tags = TAG_RE.findall(line)
        if (len(quotes) >= 2 and len(tags) < len(quotes)) or TWO_QUOTES_ONE_TAG_RE.search(line):
            flagged.append((ln, len(quotes), len(tags), line.strip()[:160]))
    return flagged, n_bullets


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    flagged, n = audit(sys.argv[1])
    for ln, q, t, head in flagged:
        print(f"  L{ln}: {q} quotes / {t} tags | {head}")
    print(f"{len(flagged)} compound-binding candidates in {n} bullets — {sys.argv[1]}")


if __name__ == "__main__":
    main()
