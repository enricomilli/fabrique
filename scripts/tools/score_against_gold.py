#!/usr/bin/env python3
"""
score_against_gold.py — compare a generated fiche or note against a GOLD reference.

Produces the objective half of an evaluation. The subjective half (argument
quality, register, critical engagement) still needs a human or a judge model —
see gold/EVALUATION.md.

    python3 scripts/tools/score_against_gold.py \
        results/2027Bourse/2027Bourse_fiche.md \
        gold/2027Bourse_fiche_GOLD.md \
        data/2027Bourse.parquet

What it measures
----------------
1. CITATION ACCURACY   candidate citations re-verified against the parquet
                       (same engine as verify_citations.py)
2. ANCHOR RECALL       of the factual anchors the gold cites, how many does the
                       candidate also cite? Catches "fluent but empty" output.
3. ANCHOR PRECISION    of the candidate's cited pages, how many appear in the
                       gold or are at least verifiable? Catches invented pages.
4. STRUCTURE           section headings present vs the gold's
5. LENGTH              word count vs gold

A candidate can beat the gold on recall by citing pages the gold omitted — that
is not penalised, it is reported. The gold is a reference, not a ceiling.
"""

import argparse
import re
import sys
from pathlib import Path


import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.verify_citations import load_pages, norm   # same normalisation + page index as the auditor  # noqa: E402

CITE_RE = re.compile(r"\(p+\.\s?(\d+)(?:\s?[-–]\s?(\d+))?\)")
HEAD_RE = re.compile(r"^##+\s+(.+?)\s*$", re.M)


# A citation like "(pp. 143-258)" is a SPAN marker (a whole thesis part), not
# 116 distinct factual anchors. Expanding it inflates the gold's anchor set by
# an order of magnitude and makes recall meaningless -- it reported 605 gold
# "citations" for a fiche that has 59. Only narrow ranges are real multi-page
# anchors; wider ones count as their start page alone.
MAX_RANGE_EXPAND = 4


def cited_pages(text: str) -> set:
    out = set()
    for m in CITE_RE.finditer(text):
        a = int(m.group(1))
        out.add(a)
        if m.group(2):
            b = int(m.group(2))
            if 0 < b - a <= MAX_RANGE_EXPAND:
                out.update(range(a, b + 1))
    return out


def headings(text: str) -> list:
    return [norm(h) for h in HEAD_RE.findall(text)]


def page_exists_and_nonempty(pages: dict, p: int) -> bool:
    return len(pages.get(p, "")) > 40


def bar(x, width=28):
    n = int(round(x * width))
    return "█" * n + "·" * (width - n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate", type=Path)
    ap.add_argument("gold", type=Path)
    ap.add_argument("parquet", type=Path)
    args = ap.parse_args()
    for p in (args.candidate, args.gold, args.parquet):
        if not p.exists():
            sys.exit(f"not found: {p}")

    cand = args.candidate.read_text(encoding="utf-8")
    gold = args.gold.read_text(encoding="utf-8")
    pages = load_pages(args.parquet)

    c_pages, g_pages = cited_pages(cand), cited_pages(gold)
    c_heads, g_heads = set(headings(cand)), set(headings(gold))
    c_words, g_words = len(cand.split()), len(gold.split())

    recall = len(c_pages & g_pages) / len(g_pages) if g_pages else 0.0
    real = {p for p in c_pages if page_exists_and_nonempty(pages, p)}
    precision = len(real) / len(c_pages) if c_pages else 0.0
    struct = len(c_heads & g_heads) / len(g_heads) if g_heads else 1.0

    print("=" * 68)
    print(f"CANDIDATE  {args.candidate.name}")
    print(f"GOLD       {args.gold.name}")
    print("=" * 68)
    print(f"  length          {c_words:>6,} words   (gold {g_words:,}, "
          f"{c_words / g_words * 100:.0f}%)")
    print(f"  citations       {len(c_pages):>6}         (gold {len(g_pages)})")
    print()
    print(f"  anchor recall   {bar(recall)} {recall*100:5.1f}%   "
          f"{len(c_pages & g_pages)}/{len(g_pages)} gold pages also cited")
    print(f"  anchor precis.  {bar(precision)} {precision*100:5.1f}%   "
          f"{len(c_pages) - len(real)} cited page(s) empty/nonexistent")
    if g_heads:
        print(f"  structure       {bar(struct)} {struct*100:5.1f}%   "
              f"{len(c_heads & g_heads)}/{len(g_heads)} gold sections present")

    missing = sorted(g_pages - c_pages)
    extra = sorted(c_pages - g_pages)
    if missing:
        print(f"\n  gold anchors MISSED ({len(missing)}): "
              f"{', '.join('p.' + str(p) for p in missing[:24])}"
              f"{' …' if len(missing) > 24 else ''}")
    if extra:
        print(f"  candidate-only pages ({len(extra)}): "
              f"{', '.join('p.' + str(p) for p in extra[:24])}"
              f"{' …' if len(extra) > 24 else ''}")
        print("    (not penalised — verify them with verify_citations.py)")
    if g_heads - c_heads:
        print(f"\n  sections MISSING: {', '.join(sorted(g_heads - c_heads))}")

    print("\n" + "-" * 68)
    print("Run verify_citations.py on the candidate for per-citation verdicts,")
    print("then score the subjective dimensions with gold/EVALUATION.md.")
    print("-" * 68)


if __name__ == "__main__":
    main()
