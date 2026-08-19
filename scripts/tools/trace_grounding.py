#!/usr/bin/env python3
"""
Grounding auditor for note runs — works WITHOUT a gold reference.

For every page citation in the note, checks whether the model actually had
that page in view when drafting:
  GROUNDED   the [p.NNN] marker appears in a REPL output the model received
  FICHE      the page is cited in the fiche that was embedded in the prompt
  BLIND      neither — the citation came from memory. High error risk:
             every confirmed citation error so far was a BLIND citation
             (or crossed a sub-query delegation boundary).

Caveat: BLIND may include pages derived from the thesis's own printed table
of contents (bare numbers, no [p.NNN] marker — the model reads pp.5-10 and
cites section start pages). Those are only accurate when printed page =
parquet page (offset 0, e.g. Bourse). On offset theses (Daley: +11) they
are systematically wrong — treat BLIND as an error either way.

Also reports navigation stats (marker-jumps vs phrase-searches, NOT FOUND
rate, distinct pages read) so runs can be compared behaviorally.

Usage:
    python3 scripts/tools/trace_grounding.py <run_dir> [--fiche path/to/fiche.md]
    # <run_dir> must contain note.md and trace/*.json
    # --fiche defaults to <run_dir>/fiche_used.md when present

Exit code 1 if any BLIND citation is found (so it can gate a pipeline).
"""

import argparse
import glob
import json
import pathlib
import re
import sys


def _msg_text(m) -> str:
    c = m.get("content", "")
    if isinstance(c, list):
        c = " ".join(str(x.get("text", "")) for x in c if isinstance(x, dict))
    return str(c)


def collect_seen_pages(trace_dir: pathlib.Path):
    """Pages whose [p.NNN] marker appeared in a REPL result, split by
    whether the ROOT loop saw them or only a sub-query did."""
    seen_root, seen_sub = set(), set()
    stats = {"marker_jumps": 0, "phrase_searches": 0, "not_found": 0}
    for f in sorted(glob.glob(str(trace_dir / "*.json"))):
        d = json.load(open(f))
        kind = d.get("kind", "root")
        target = seen_sub if kind == "subquery" else seen_root
        msgs = (d.get("request") or {}).get("messages") or []
        for i, m in enumerate(msgs):
            text = _msg_text(m)
            if m.get("role") == "user" and i > 0:
                target.update(int(p) for p in re.findall(r"\[p\.(\d+)\]", text))
                stats["not_found"] += len(re.findall(r"NOT FOUND", text))
            elif m.get("role") == "assistant":
                code = "\n".join(re.findall(r"```python\n(.*?)```", text, re.S))
                stats["marker_jumps"] += len(
                    re.findall(r'find\(\s*["\']\[p\.\d+\]', code))
                stats["phrase_searches"] += len(
                    re.findall(r'find\(\s*["\'](?!\[p\.)', code))
    return seen_root, seen_sub, stats


def cited_pages(md_text: str):
    """[(start, end), ...] for every (p. N) / (pp. N-M) citation.
    Ranges wider than 4 pages count as their start page only (span markers)."""
    out = []
    for a, b in re.findall(r"\(pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?", md_text):
        a = int(a)
        b = int(b) if b else a
        if b - a > 4:
            b = a
        out.append((a, b))
    return out


def fiche_page_set(fiche_path: pathlib.Path):
    if not fiche_path or not fiche_path.exists():
        return set()
    pages = set()
    for a, b in cited_pages(fiche_path.read_text(encoding="utf-8")):
        pages.update(range(a, b + 1))
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=pathlib.Path)
    ap.add_argument("--fiche", type=pathlib.Path, default=None)
    args = ap.parse_args()

    note_path = args.run_dir / "note.md"
    trace_dir = args.run_dir / "trace"
    if not note_path.exists() or not trace_dir.is_dir():
        sys.exit(f"need {note_path} and {trace_dir}/")

    fiche_path = args.fiche or (args.run_dir / "fiche_used.md")
    fiche_pages = fiche_page_set(fiche_path)

    seen_root, seen_sub, stats = collect_seen_pages(trace_dir)
    note = note_path.read_text(encoding="utf-8")

    grounded = fiche_only = 0
    sub_only, blind = [], []
    for a, b in cited_pages(note):
        span = set(range(a, b + 1))
        if span & seen_root:
            grounded += 1
        elif span & seen_sub:
            sub_only.append(f"p.{a}" + (f"-{b}" if b != a else ""))
        elif span & fiche_pages:
            fiche_only += 1
        else:
            blind.append(f"p.{a}" + (f"-{b}" if b != a else ""))

    total = grounded + fiche_only + len(sub_only) + len(blind)
    print(f"run: {args.run_dir}")
    print(f"navigation: {stats['marker_jumps']} marker-jumps, "
          f"{stats['phrase_searches']} phrase-searches, "
          f"{stats['not_found']} NOT FOUND")
    print(f"pages read: root={len(seen_root)}, subquery-only={len(seen_sub - seen_root)}")
    print(f"\ncitations: {total}")
    print(f"  GROUNDED (root saw the marker)  {grounded}")
    print(f"  FICHE    (pre-verified, prompt) {fiche_only}")
    print(f"  SUB-ONLY (delegation boundary)  {len(sub_only)}  {sub_only or ''}")
    print(f"  BLIND    (never in view)        {len(blind)}  {blind or ''}")
    if blind or sub_only:
        print("\n⚠ BLIND/SUB-ONLY citations are where every confirmed error "
              "has come from — verify these by hand first.")
    sys.exit(1 if blind else 0)


if __name__ == "__main__":
    main()
