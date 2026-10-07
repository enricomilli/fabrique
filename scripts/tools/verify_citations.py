#!/usr/bin/env python3
"""
verify_citations.py — audit every `(p. N)` citation in a generated fiche or note
against the source parquet.

This is the ground-truth check used to score every artifact in this repo.
Run it on ANY generated markdown before trusting it.

Usage:
    python3 scripts/tools/verify_citations.py results/daley/daley_thesis_fiche.md \
                                        data/daley_thesis.parquet

    # also report the parquet <-> printed-page offset
    python3 scripts/tools/verify_citations.py <md> <parquet> --show-offset

Verdicts
--------
  OK          the quoted/paraphrased text is on the cited parquet page
  OFF-1       it is on the adjacent page (usually a paragraph straddling a break)
  WRONG       it is on a page >=2 away  -> real error, fix before publishing
  UNVERIFIED  the anchor phrase could not be located at all. Usually a FALSE
              NEGATIVE: the model paraphrased in French an English source quote,
              so no substring matches. ALWAYS spot-check these by hand rather
              than assuming they are wrong.

IMPORTANT — two page-numbering systems
--------------------------------------
`note/pipeline.py` annotates the blob with `[p.NNN]` markers built from the
parquet `page` field, so models cite PARQUET/PDF page numbers. Most theses also
carry a different PRINTED page number in their running headers (front matter in
roman numerals shifts the body). Use --show-offset to see the delta. A reader
holding the printed thesis needs `printed = parquet - offset`.
"""

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

CITE_RE = re.compile(r"\(p+\.\s?(\d+)(?:\s?[-–]\s?\d+)?\)")
_TAIL = r"\s*\(p+\.\s?\d+(?:\s?[-–]\s?\d+)?\)"
# Quote styles seen in practice, most specific first. Guillemets may wrap
# *italicised* text and may themselves contain straight quotes, so the
# guillemet pattern must only stop at the closing guillemet.
QUOTE_PATTERNS = [
    # The capture must exclude its own delimiters, otherwise the engine
    # backtracks to an earlier opening mark and the "quote" silently spans
    # several citations. Length-bounded for the same reason.
    re.compile(r"«\s*\*?([^«»]{8,400}?)\*?\s*»" + _TAIL, re.S),  # « … » / « *…* »
    re.compile(r"\"([^\"]{8,400}?)\"" + _TAIL, re.S),             # " … "
    re.compile(r"\*([^\*]{8,400}?)\*" + _TAIL, re.S),             # *…*
]

BOILERPLATE = {"Page-header", "Page-footer"}


def norm(s: str) -> str:
    """Accent-strip, lowercase, collapse whitespace+punctuation to single spaces.

    The punctuation class MUST include curly quotes and the slash. English theses
    typeset in LaTeX use curly doubles heavily; omitting them silently turns
    correct citations into UNVERIFIED/WRONG. Two real false flags came from this:
    Daley p.19 (curly quotes around "tensions") and Bourse p.614
    ("singularisation/generalisation", the slash).
    """
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    return re.sub(r"[\s ‘’“”'`\"«»\(\)\[\],\.\;:\!\?\-—–\*/]+", " ", s).strip()


def load_pages(parquet: Path) -> dict:
    df = pd.read_parquet(parquet)
    df = df[~df["category"].isin(BOILERPLATE)]
    return {
        int(p): norm(" ".join(str(t) for t in g["text"].fillna("")))
        for p, g in df.groupby("page")
    }


def page_offset(parquet: Path):
    """Delta between parquet page index and the printed page number.

    The printed number lives in a Page-header block in some theses (Bourse)
    and a Page-footer block in others (Daley), so check both.
    """
    df = pd.read_parquet(parquet)
    band = df[df["category"].isin(BOILERPLATE)]
    deltas = []
    for _, r in band.iterrows():
        t = str(r["text"]).strip()
        if t.isdigit() and len(t) <= 4:
            deltas.append(int(r["page"]) - int(t))
    if not deltas:
        return None
    return max(set(deltas), key=deltas.count)  # modal delta


def anchors(text: str):
    """Yield (cited_page, phrase, kind) for every citation in the markdown."""
    quotes = {}
    for pat in QUOTE_PATTERNS:
        for m in pat.finditer(text):
            quotes.setdefault(m.end(), m.group(1).strip())
    prev_cite_end = 0
    for m in CITE_RE.finditer(text):
        # A range must be honoured in full: « … » (p. 21-23) with the quote on
        # p.23 was reported WRONG because only the first number was read.
        lo = int(m.group(1))
        hi_txt = re.search(r"[-–]\s?(\d+)", m.group(0))
        hi = int(hi_txt.group(1)) if hi_txt else lo
        cited = list(range(min(lo, hi), max(lo, hi) + 1))
        if m.end() in quotes:
            yield cited, quotes[m.end()], "quote"
        else:
            # Clip the window at the previous citation. Without this, the tail of
            # a long quote that already carries its own `(p. Y)` gets re-matched
            # against the NEXT page tag and reported WRONG — 3 of 9 flags in the
            # 2026-10-07 demo audit were this bug, not a real citation error.
            win = max(0, m.start() - 220, prev_cite_end)
            before = text[win:m.start()].rstrip(" ,;:.—-")
            words = before.split()
            if words:
                yield cited, " ".join(words[-16:]), "tail"
        prev_cite_end = m.end()


def locate(phrase: str, pages: dict, max_hits: int = 6):
    """Progressive-truncation substring search. Returns sorted candidate pages."""
    target = norm(phrase)
    for trunc in (len(target), 90, 70, 50, 34):
        t = target[:trunc].strip()
        if len(t) < 22:
            break
        hits = [p for p, txt in pages.items() if t in txt]
        if hits and len(hits) <= max_hits:
            return sorted(hits)
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("markdown", type=Path)
    ap.add_argument("parquet", type=Path)
    ap.add_argument("--show-offset", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="only print the summary")
    args = ap.parse_args()

    for p in (args.markdown, args.parquet):
        if not p.exists():
            sys.exit(f"not found: {p}")

    pages = load_pages(args.parquet)
    text = args.markdown.read_text(encoding="utf-8")

    if args.show_offset:
        off = page_offset(args.parquet)
        if off is None:
            print("page offset: could not determine (no numeric Page-header blocks)")
        else:
            print(f"page offset: parquet = printed + {off}   "
                  f"(printed = parquet - {off})")
        print()

    tally = {"OK": 0, "OFF-1": 0, "WRONG": 0, "PARAPHRASE": 0, "UNVERIFIED": 0}
    problems = []

    for cited_pages, phrase, kind in anchors(text):
        cited = cited_pages[0]
        cited_label = (f"{cited_pages[0]}-{cited_pages[-1]}"
                       if len(cited_pages) > 1 else str(cited))
        real = locate(phrase, pages)
        if not real:
            verdict = "UNVERIFIED"
        elif any(p in real for p in cited_pages):
            verdict = "OK"
        elif any((p - 1) in real or (p + 1) in real for p in cited_pages):
            verdict = "OFF-1"
        elif kind == "tail":
            # G1 covers verbatim quotes. A `tail` is the prose before a bare
            # `(p. X)` — i.e. the model's own paraphrase — so a page mismatch
            # there is drift worth seeing, not a fabricated citation.
            verdict = "PARAPHRASE"
        else:
            verdict = "WRONG"
        tally[verdict] += 1
        if verdict in ("WRONG", "OFF-1"):
            problems.append((verdict, cited_label, real, phrase))
        if not args.quiet:
            print(f"[{verdict:<10}] cited p.{cited_label:<7} found {str(real):<20} "
                  f"({kind}) {phrase[:70]}")

    total = sum(tally.values())
    print("\n" + "=" * 66)
    print(f"{total} citations   "
          f"OK={tally['OK']}  OFF-1={tally['OFF-1']}  "
          f"WRONG={tally['WRONG']}  PARAPHRASE={tally['PARAPHRASE']}  "
          f"UNVERIFIED={tally['UNVERIFIED']}")
    if problems:
        print("-" * 66)
        print("NEEDS FIXING (verify each by hand — the matcher has false positives):")
        for v, cited, real, ph in problems:
            print(f"  {v:<6} cited p.{cited} -> likely p.{real}  « {ph[:60]} »")
    if tally["PARAPHRASE"]:
        print("-" * 66)
        print(f"{tally['PARAPHRASE']} PARAPHRASE — a bare (p. X) whose surrounding "
              f"prose sits elsewhere. Advisory: not a G1 failure.")
    if tally["UNVERIFIED"]:
        print("-" * 66)
        print(f"{tally['UNVERIFIED']} UNVERIFIED — usually French paraphrase of an "
              f"English quote. Spot-check, do not assume wrong.")
    print("=" * 66)

    # non-zero exit only on hard errors, so this can gate a pipeline
    sys.exit(1 if tally["WRONG"] else 0)


if __name__ == "__main__":
    main()
