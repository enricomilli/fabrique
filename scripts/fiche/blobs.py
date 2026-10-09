"""
fiche/blobs.py — turn parquet pages into the text blobs the prompts read.

A thesis parquet has one row per layout block: `page`, `block_index`,
`category` (Text, Section-header, List-item, Table, Page-header, Page-footer,
Footnote, …) and `text`. Every blob below is built the same way: select a page
range, drop boilerplate categories, concatenate the block texts in document
order, and (for chapter-sized blobs) mark each page change with
`<<< PAGE N >>>` so the model can cite parquet page numbers.
"""
import re
from typing import Callable, Optional

import pandas as pd

from .config import STRUCTURE_PAGE_WINDOW

CHAPTER_SKIP = ("Page-header", "Page-footer", "Footnote")   # boilerplate for chapter blobs
ABSTRACT_SKIP = ("Page-header", "Page-footer")


def _blob_from_rows(sub: pd.DataFrame, page_markers: bool) -> str:
    """Concatenate the `text` of already-selected, already-sorted rows."""
    lines: list[str] = []
    current_page = None
    for _, row in sub.iterrows():
        text = str(row.get("text", "")).strip()
        if not text:
            continue
        if page_markers and row["page"] != current_page:
            current_page = row["page"]
            lines.append(f"\n<<< PAGE {int(current_page)} >>>\n")
        lines.append(text)
    return "\n".join(lines).strip()


def pages_to_blob(df: pd.DataFrame, p_start: int, p_end: int,
                  skip=CHAPTER_SKIP, page_markers: bool = True) -> str:
    """Blob of parquet pages p_start..p_end (inclusive), minus `skip` categories."""
    sub = df[(df["page"] >= p_start) & (df["page"] <= p_end)].sort_values(["page", "block_index"])
    if skip:
        sub = sub[~sub["category"].isin(list(skip))]
    return _blob_from_rows(sub, page_markers)


# ── Step 1: front matter ─────────────────────────────────────────────────────

def extract_first_pages_blob(df: pd.DataFrame, n_pages: int = STRUCTURE_PAGE_WINDOW) -> str:
    """First `n_pages` pages, EVERY block kept (the TOC may be Text, List-item,
    Table or Section-header depending on how the parquet was produced)."""
    sub = df[df["page"] <= n_pages].sort_values(["page", "block_index"])
    return _blob_from_rows(sub, page_markers=True)


# ── Step 2: introduction / conclusion (level-0 TOC entries) ──────────────────

def extract_chapter_blob(df: pd.DataFrame, structure: dict,
                         title_predicate: Callable[[str], bool], label: str) -> tuple[str, int, int]:
    """Locate the first level-0 TOC entry whose lower-cased title satisfies
    `title_predicate`, slice its parquet page range, return (blob, p_start, p_end)."""
    target = None
    for entry in structure.get("toc") or []:
        title = (entry.get("title") or "").strip().lower()
        if entry.get("level") == 0 and title_predicate(title):
            target = entry
            break
    if target is None:
        raise RuntimeError(f"No top-level {label} entry found in TOC")
    p_start = target.get("page_start_parquet")
    p_end = target.get("page_end_parquet")
    if not isinstance(p_start, int) or not isinstance(p_end, int):
        raise RuntimeError(f"{label} has no parquet page range "
                           f"(page_start_parquet={p_start}, page_end_parquet={p_end})")
    return pages_to_blob(df, p_start, p_end), p_start, p_end


# "Introduction", "1. Introduction", "Chapter 1 Introduction", "Partie I Introduction", …
INTRO_TITLE_RE = re.compile(
    r"^\s*(?:(?:chapter|chapitre|part|partie|kapitel|capítulo)\s+)?"
    r"[\divx]*\.?\s*introduction\b"
)
# Applied to level-0 titles only (already lower-cased by extract_chapter_blob),
# so matching anywhere is safe: "Conclusion", "Conclusion générale",
# "Summary and Conclusions", "Chapter N Conclusions and Future Work".
#
# French theses often close on a « DISCUSSION GÉNÉRALE » instead of a chapter
# called "Conclusion" (2024PA100054). The word "conclusion" alone then matches
# nothing, step 2b is skipped, and `these_centrale` / `reponses_questions` /
# `fil_rouge` — the sections the conclusion exists to fill — stay [NULL].
# Deliberately NOT matching a bare "synthèse" or "perspectives": "5. Synthèse
# des objectifs de recherche" is a mid-thesis level-0 chapter in that same
# thesis, and would be picked ahead of the real closing chapter.
CONCLUSION_TITLE_RE = re.compile(
    r"\bconclusions?\b"
    r"|\bdiscussion\s+(?:g[ée]n[ée]rale|finale|general)\b"
    r"|\bgeneral\s+discussion\b"
    r"|\bdiscussion\s+et\s+perspectives\b"
)


def extract_intro_blob(df: pd.DataFrame, structure: dict) -> tuple[str, int, int]:
    return extract_chapter_blob(df, structure, lambda t: bool(INTRO_TITLE_RE.match(t)), "Introduction")


def extract_conclusion_blob(df: pd.DataFrame, structure: dict) -> tuple[str, int, int]:
    """The CLOSING conclusion, not the first one.

    `extract_chapter_blob` takes the first level-0 match, which is right for an
    introduction and wrong for a conclusion: theses that end each chapter with a
    level-0 "Conclusion" then hand step 2b a one-page chapter wrap-up from the
    first quarter of the thesis. Measured on the demo set: 2024PA100032 read
    p.74 of 464 (real conclusion pp. 380-389) and 2023TOU20042 read pp. 78-80
    of 274 (real conclusion pp. 239-252).

    So: take the match with the latest page range, then absorb any immediately
    preceding contiguous match, which is how « Discussion générale et
    perspectives » + « Conclusion générale » (2022LYO10153, pp. 140-145 +
    146-147) get read as the single closing movement they are.
    """
    matches = [
        e for e in (structure.get("toc") or [])
        if e.get("level") == 0
        and CONCLUSION_TITLE_RE.search((e.get("title") or "").strip().lower())
        and isinstance(e.get("page_start_parquet"), int)
        and isinstance(e.get("page_end_parquet"), int)
    ]
    if not matches:
        raise RuntimeError("No top-level Conclusion entry found in TOC")
    matches.sort(key=lambda e: e["page_start_parquet"])
    p_start = matches[-1]["page_start_parquet"]
    p_end = matches[-1]["page_end_parquet"]
    for e in reversed(matches[:-1]):
        if e["page_end_parquet"] + 1 >= p_start:
            p_start = e["page_start_parquet"]
        else:
            break
    return pages_to_blob(df, p_start, p_end), p_start, p_end


# ── Step 2c: abstract / résumé ───────────────────────────────────────────────

ABSTRACT_TITLE_RE = re.compile(
    r"^\s*(?:#+\s*)?(?:r[ée]sum[ée]s?|abstracts?|summary|summaries)\s*$",
    re.IGNORECASE,
)


def extract_abstract_blob(df: pd.DataFrame, structure: dict) -> tuple[Optional[str], Optional[int]]:
    """Find the abstract/résumé: (1) a level-0 TOC entry titled Résumé/Abstract
    → its parquet range; (2) else the first Section-header matching the regex →
    that whole page. Returns (blob, page) or (None, None)."""
    for entry in structure.get("toc") or []:
        title = (entry.get("title") or "").strip()
        if entry.get("level") == 0 and ABSTRACT_TITLE_RE.match(title):
            ps, pe = entry.get("page_start_parquet"), entry.get("page_end_parquet")
            if isinstance(ps, int) and isinstance(pe, int):
                blob = pages_to_blob(df, ps, pe, skip=ABSTRACT_SKIP, page_markers=False)
                if blob:
                    return blob, ps
    headers = df[df["category"] == "Section-header"]
    for _, row in headers.sort_values("page").iterrows():
        clean = re.sub(r"^#+\s*", "", (row.get("text") or "").strip()).strip()
        if ABSTRACT_TITLE_RE.match(clean):
            page = int(row["page"])
            blob = pages_to_blob(df, page, page, skip=ABSTRACT_SKIP, page_markers=False)
            if blob:
                return blob, page
    return None, None


# `cl[ée]f?s?` because « Mots clefs » (with an f) is a common French variant and
# was silently unmatched (2023TOU20042 shipped an empty Mots-clés although the
# thesis prints « Mots clefs** : Erreur, concept, philosophie… »).
# The separator may be `.` as well as `:` — the layout parser turns a bolded
# label into `Keywords.**  Sign Language, …` — but a `.` only counts when the
# remainder really is a list (see extract_keywords_from_abstract), otherwise an
# ordinary sentence containing "keywords." would be harvested as prose.
_KW_LABEL = r"(?:mots[- ]?cl[ée]f?s?|key\s?words?)"
KEYWORDS_RE = re.compile(
    r"\*{0,2}" + _KW_LABEL + r"\*{0,2}\s*([.:：])\s*\**\s*(.+)",
    re.IGNORECASE,
)
# The label alone on its line, the values in the following block: the layout
# parser emits « Keywords » and « LSF, lexical database, familiarity… » as two
# separate blocks with no colon between them (2024PA100054).
KEYWORDS_LABEL_ONLY_RE = re.compile(
    r"^\*{0,2}" + _KW_LABEL + r"\*{0,2}\s*[.:：]?\s*$",
    re.IGNORECASE,
)


def _split_keywords(raw: str) -> list[str]:
    return [kw for kw in (k.strip().strip(".") for k in re.split(r"[,;]", raw.strip())) if kw]


def extract_keywords_from_abstract(blob: str) -> list[str]:
    """`**Mots clés** : a, b ; c` / `Keywords: …` lines → deduplicated list
    (French first, then English when both are present). Also handles the
    label-on-its-own-line layout, where the values are the next non-empty line."""
    keywords: list[str] = []
    seen: set[str] = set()

    def add(items):
        for kw in items:
            if kw.lower() not in seen:
                keywords.append(kw)
                seen.add(kw.lower())

    lines = [ln.strip() for ln in blob.splitlines()]
    for i, line in enumerate(lines):
        m = KEYWORDS_RE.search(line)
        if m:
            sep, raw = m.group(1), m.group(2)
            parsed = _split_keywords(raw)
            # a `.` separator is only a keyword line if it really introduces a
            # list; `:` keeps the original, permissive behaviour
            if sep in ":：" or len(parsed) >= 2:
                add(parsed)
                continue
        if KEYWORDS_LABEL_ONLY_RE.match(line):
            for nxt in lines[i + 1:]:
                if nxt:
                    add(_split_keywords(nxt))
                    break
    return keywords
