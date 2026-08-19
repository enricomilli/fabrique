"""
fiche/gate.py — post-verification citation gate (no LLM; promoted 2026-08-19).

For every verbatim « quote » in the rendered fiche, find the `(p. …)` tag that
governs it (adjacent, or the next one within 400 chars) and look the quote up
in the parquet. If the quote is ABSENT from every cited page and PRESENT on
exactly one page, fix the binding: adjacent single tag → rewrite its page;
otherwise → insert ` (p. X)` right after the quote (the C12 form). Stitched
quotes ([...]) and quotes under 25 normalized chars are skipped; ambiguous
or unverifiable quotes are left alone.

Uses the same normalisation/page index as scripts/tools/verify_citations.py.
"""
import re
from pathlib import Path

from tools import verify_citations as vc   # scripts/tools/ (scripts/ is put on sys.path by fiche/__init__.py)


def postcheck_fiche_citations(fiche_md: str, parquet_path) -> tuple[str, list]:
    """Return (fixed_markdown, fixes); `fixes` is a list of
    {quote, tag, cited, to, how} dicts (how = "rewrite" | "insert")."""
    pages = vc.load_pages(Path(parquet_path))
    qpat = re.compile(r"«\s*\*?([^«»]{8,400}?)\*?\s*»", re.S)
    tagpat = re.compile(r"\(p+\.\s?(\d+)(?:\s?[-–]\s?(\d+))?((?:\s?,\s?p+\.\s?\d+(?:\s?[-–]\s?\d+)?)*)\)")
    edits = []   # (start, end, replacement)
    fixes = []
    for m in qpat.finditer(fiche_md):
        q = m.group(1).strip()
        if "[...]" in q or "[…]" in q:
            continue
        target = vc.norm(q)
        if len(target) < 25:
            continue
        hits = [pg for pg, txt in pages.items() if target in txt]
        if len(hits) != 1:
            continue
        after = fiche_md[m.end(): m.end() + 400]
        t = tagpat.search(after)
        if not t:
            continue
        cited = set()
        for a, b in re.findall(r"(\d+)(?:\s?[-–]\s?(\d+))?", t.group(0)):
            a = int(a); b = int(b) if b else a
            cited |= set(range(min(a, b), max(a, b) + 1))
        if hits[0] in cited:
            continue
        adjacent = after[:t.start()].strip() == ""
        if adjacent and not t.group(3):
            edits.append((m.end() + t.start(), m.end() + t.end(), f"(p. {hits[0]})"))
            how = "rewrite"
        else:
            edits.append((m.end(), m.end(), f" (p. {hits[0]})"))
            how = "insert"
        fixes.append({"quote": q[:120], "tag": t.group(0), "cited": sorted(cited), "to": hits[0], "how": how})
    if not edits:
        return fiche_md, []
    out = []; last = 0
    for a, b, rep in sorted(edits):
        out.append(fiche_md[last:a]); out.append(rep); last = b
    out.append(fiche_md[last:])
    return "".join(out), fixes
