"""
fiche/structure.py — step 1: thesis structure (metadata + TOC) and page offset.

  1a  one LLM call on the first 25 pages → compact text (KEY: value lines, a
      `TOC` marker, then `<level>|<page_start>|<title>` lines) → parsed
  1b  deterministic `page_end` chaining (next same-or-shallower entry − 1)
      + role tagging of level-0 entries (part / chapter / frontmatter / backmatter)
      + consistency checks
  1c  deterministic printed→parquet page offset, anchored on the Introduction
      (its printed page in the TOC vs the parquet page where it actually starts)
  1d  `page_start_parquet` / `page_end_parquet` projected onto every entry

Output: the `structure` dict written to `<thesis>_structure.json` (shape in
`extract_structure`'s docstring). Everything after 1a is pure Python.
"""
import logging
import re
import unicodedata
from pathlib import Path
from typing import Optional

import pandas as pd
from openai import OpenAI

from .blobs import extract_first_pages_blob
from .config import STEP1_CONFIG, STRUCTURE_PAGE_WINDOW
from .llm import llm_call
from .prompts import STRUCTURE_PROMPT, STRUCTURE_SYSTEM

# A printed-folio vote this far from the introduction-anchor means the anchor
# is in the wrong chapter, not merely a page or two late. See compute_page_offset.
OFFSET_OVERRIDE_GAP = 10

log = logging.getLogger('fiche')

# ── 1a: parse the compact LLM output ─────────────────────────────────────────

METADATA_KEYS = {
    "TITRE":         "titre",
    "AUTEUR":        "auteur",
    "ANNEE":         "annee",
    "ETABLISSEMENT": "etablissement",
    "DISCIPLINE":    "discipline",
    "MOTS_CLES":     "mots_cles",
}


def coerce_null(value: str):
    """Return None for null/empty sentinels, else the stripped string."""
    v = value.strip()
    if not v or v.lower() in {"null", "none", "n/a", "na", "-"}:
        return None
    return v


def parse_compact_output(raw: str) -> dict:
    """Parse the compact KEY: value + TOC pipe-delimited format into the
    same `{metadata, toc}` dict shape the rest of the pipeline expects.

    Lenient: skips blank lines and unrecognized lines, logs malformed TOC
    rows to stderr but continues. Raises only if no TOC marker is found or
    essential metadata is completely missing.
    """
    text = raw.strip()
    # Strip accidental markdown fences if the model adds them despite the prompt.
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)

    metadata: dict = {v: None for v in METADATA_KEYS.values()}
    metadata["mots_cles"] = []
    toc: list = []
    malformed: list = []

    in_toc = False
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        if not in_toc:
            # Look for the TOC marker (case-insensitive, exact token)
            if stripped.upper() == "TOC":
                in_toc = True
                continue
            # Parse a `KEY: value` metadata line
            m = re.match(r"^([A-Z_]+)\s*:\s*(.*)$", stripped)
            if not m:
                malformed.append((lineno, stripped[:80]))
                continue
            key_raw, val_raw = m.group(1), m.group(2)
            if key_raw not in METADATA_KEYS:
                malformed.append((lineno, stripped[:80]))
                continue
            out_key = METADATA_KEYS[key_raw]
            if out_key == "mots_cles":
                v = coerce_null(val_raw)
                if v is None:
                    metadata["mots_cles"] = []
                else:
                    # Split on ; and strip; drop empties.
                    metadata["mots_cles"] = [
                        kw.strip() for kw in v.split(";") if kw.strip()
                    ]
            else:
                metadata[out_key] = coerce_null(val_raw)
        else:
            # TOC entry: <level>|<page_start>|<title>
            parts = stripped.split("|", 2)
            if len(parts) != 3:
                malformed.append((lineno, stripped[:80]))
                continue
            level_s, page_s, title = parts[0].strip(), parts[1].strip(), parts[2].strip()
            try:
                level = int(level_s)
            except ValueError:
                malformed.append((lineno, stripped[:80]))
                continue
            page_start: Optional[int]
            if coerce_null(page_s) is None:
                page_start = None
            else:
                try:
                    page_start = int(page_s)
                except ValueError:
                    page_start = None
            if not title:
                malformed.append((lineno, stripped[:80]))
                continue
            toc.append({"title": title, "page_start": page_start, "level": level})

    if not in_toc:
        raise RuntimeError(
            "Compact output missing `TOC` marker line. "
            f"First 500 chars:\n{text[:500]}"
        )

    if malformed:
        preview = "; ".join(f"L{ln}: {snippet!r}" for ln, snippet in malformed[:5])
        log.warning(
            f"  [parse] skipped {len(malformed)} malformed line(s): {preview}",
        )

    return {"metadata": metadata, "toc": toc}


def llm_extract_structure(client: OpenAI, blob: str) -> dict:
    """Call the LLM to extract {metadata, toc} from the front-matter blob
    using the compact KEY:value + pipe-delimited TOC format."""
    prompt = STRUCTURE_PROMPT.format(blob=blob, n_pages=STRUCTURE_PAGE_WINDOW)
    raw = llm_call(client, STRUCTURE_SYSTEM, prompt, config=STEP1_CONFIG, label="1")

    try:
        parsed = parse_compact_output(raw)
    except RuntimeError as e:
        head = raw[:500]
        tail = raw[-500:] if len(raw) > 1000 else ""
        raise RuntimeError(
            f"Could not parse compact structure output "
            f"({len(raw)} chars total): {e}\n"
            f"Beginning:\n{head}\n...\nEnd:\n{tail}"
        ) from None

    if not parsed["toc"] and all(v in (None, []) for v in parsed["metadata"].values()):
        raise RuntimeError(
            "Compact parser produced empty metadata AND empty TOC — "
            "likely a format drift in the LLM output."
        )
    return parsed



# ── 1b: deterministic page_end chaining, roles, validation ───────────────────

def compute_page_ends(toc: list) -> list:
    """
    Compute `page_end` for every entry in a FLAT toc list.

    Algorithm — for each entry i, find the next entry j whose `level <= i.level`
    (i.e. same scope or shallower). That entry is where the current section's
    scope ends. Three cases:
      - next.page_start > entry.page_start  →  page_end = next - 1
      - next.page_start == entry.page_start →  page_end = entry.page_start
        (same-page boundary: the current entry fits entirely on its own
        start page because the next sibling starts on the same page)
      - no next entry at same-or-shallower level  →  page_end = page_start

    This single-pass rule correctly handles parent ranges: a level-0 entry
    naturally extends to the next level-0 entry (or document end), which
    covers all of its level-1+ descendants. Same-page siblings are handled
    by the equality branch.

    Mutates in place. Returns the list for chaining convenience.
    """
    n = len(toc)
    for i in range(n):
        entry = toc[i]
        ps = entry.get("page_start")
        level = entry.get("level")
        if not isinstance(ps, int) or not isinstance(level, int):
            entry["page_end"] = None
            continue

        next_start = None
        for j in range(i + 1, n):
            other = toc[j]
            other_level = other.get("level")
            other_ps = other.get("page_start")
            if not isinstance(other_level, int) or not isinstance(other_ps, int):
                continue
            if other_level <= level:
                next_start = other_ps
                break

        if next_start is None:
            entry["page_end"] = ps
        elif next_start > ps:
            entry["page_end"] = next_start - 1
        elif next_start == ps:
            entry["page_end"] = ps
        else:
            # Document order violation — be conservative
            entry["page_end"] = ps

    return toc


# ── TOC role tagging ─────────────────────────────────────────────────────────
#
# Tags each L0 entry with a `role` field: part, chapter, frontmatter,
# backmatter, or other. L1+ entries get `section`. This is deterministic
# (no LLM) and enables the `plan` prompt to reference actual part titles.

PART_EXPLICIT_RE = re.compile(
    r"^(?:PART(?:E|IE)\s+[IVX\d]|PREMIÈRE\s+PARTIE|DEUXIÈME\s+PARTIE|"
    r"TROISIÈME\s+PARTIE|QUATRIÈME\s+PARTIE|PART\s+[IVX\d])",
    re.IGNORECASE,
)
FRONTMATTER_RE = re.compile(
    r"^(?:R[ÉE]SUM[ÉE]|ABSTRACT|REMERCIEMENTS|ACKNOWLEDGEMENTS|"
    r"INTRODUCTION|TABLE\s+DES\s+MATI[ÈE]RES|SOMMAIRE|"
    r"AVANT[- ]PROPOS|PREFACE|PR[ÉE]FACE|D[ÉE]DICACE)",
    re.IGNORECASE,
)
BACKMATTER_RE = re.compile(
    r"^(?:CONCLUSION|BIBLIOGRAPHIE|ANNEXE|INDEX|"
    r"TABLE\s+DES\s+(?:FIGURE|TABLEAU|GRAPHIQUE|ANNEXE|ILLUSTRATION)|"
    r"LISTE\s+DES|GLOSSAIRE|SIGLES|ACRONYMES|REFERENCES|R[ÉE]F[ÉE]RENCES|"
    r"LIVRES|ARTICLES|CHAPITRES\s+ET|OUVRAGES)",
    re.IGNORECASE,
)
NUMBERED_CHAPTER_RE = re.compile(
    r"^(?:\d+[\.\s]|[Cc]hap(?:itre)?[\.\s]|[Cc]hapter[\.\s])",
)


def tag_toc_roles(toc: list) -> None:
    """Tag each TOC entry with a `role` field. Mutates in place.

    L1+ entries → 'section'.
    L0 entries → 'part', 'chapter', 'frontmatter', 'backmatter', or 'other'.

    An unnumbered L0 entry that is NOT front/backmatter and is followed
    (within the next 3 L0 entries) by a numbered chapter is classified as
    'part'. This catches both explicit parts ('PARTIE I. ...') and
    implicit parts ('La genèse du journalisme boursier', 'Préambule
    Méthodologique') that serve as containers for numbered chapters.
    """
    # First pass: collect indices of L0 entries for lookahead.
    l0_indices: list[int] = []
    for i, entry in enumerate(toc):
        if entry.get("level") == 0:
            l0_indices.append(i)

    for i, entry in enumerate(toc):
        level = entry.get("level")
        title = (entry.get("title") or "").strip()

        if not isinstance(level, int):
            entry["role"] = "other"
            continue

        if level > 0:
            entry["role"] = "section"
            continue

        # L0 from here on.
        # 1. Explicit part pattern (PARTIE I, PART II, etc.)
        if PART_EXPLICIT_RE.match(title):
            entry["role"] = "part"
            continue

        # 2. Front matter
        if FRONTMATTER_RE.match(title):
            entry["role"] = "frontmatter"
            continue

        # 3. Back matter
        if BACKMATTER_RE.match(title):
            entry["role"] = "backmatter"
            continue

        # 4. Numbered chapter (starts with digit or "Chapitre")
        if NUMBERED_CHAPTER_RE.match(title):
            entry["role"] = "chapter"
            continue

        # 5. Unnumbered L0 — check if it contains/precedes numbered
        #    chapters. Two TOC patterns:
        #      (a) "Flat pattern": parts and chapters both at L0. The
        #          next L0 entry IS a numbered chapter.
        #      (b) "Nested pattern": parts at L0, chapters at L1. Numbered
        #          chapters appear between this L0 and the next L0.
        #    An unnumbered L0 that has a numbered chapter right after it
        #    (either as sibling or as descendant) is a part container.
        pos_in_l0 = l0_indices.index(i) if i in l0_indices else -1
        if pos_in_l0 >= 0:
            is_part = False
            next_l0_i = (
                l0_indices[pos_in_l0 + 1]
                if pos_in_l0 + 1 < len(l0_indices)
                else len(toc)
            )
            # Check every entry in (i, next_l0_i] inclusive — catches
            # both nested chapters (L1 between L0s) and the next L0
            # itself if it's a chapter (flat pattern).
            scan_end = min(next_l0_i + 1, len(toc))
            for j in range(i + 1, scan_end):
                sub_title = (toc[j].get("title") or "").strip()
                if NUMBERED_CHAPTER_RE.match(sub_title):
                    is_part = True
                    break
            if is_part:
                entry["role"] = "part"
                continue

        entry["role"] = "other"


def validate_toc_structure(toc: list) -> dict:
    """
    Internal consistency checks on the flat TOC list after page_end chaining.
    Returns a report dict; empty `issues` list means everything looks OK.
    """
    issues: list[str] = []
    prev_start = None

    for i, entry in enumerate(toc):
        title = str(entry.get("title", "<no title>"))[:60]
        ps = entry.get("page_start")
        pe = entry.get("page_end")

        # Check 1: page_end < page_start
        if isinstance(ps, int) and isinstance(pe, int) and pe < ps:
            issues.append(
                f"entry {i}: page_end ({pe}) < page_start ({ps}) for '{title}'"
            )

        # Check 2: document order regression
        if isinstance(ps, int):
            if prev_start is not None and ps < prev_start:
                issues.append(
                    f"entry {i}: document order violation — '{title}' (p.{ps}) "
                    f"follows an entry at p.{prev_start}"
                )
            prev_start = ps

        # Check 3: level consistency (no jumps like 0 → 2 without a 1 in between)
        if i > 0 and isinstance(entry.get("level"), int):
            prev_level = toc[i - 1].get("level")
            if isinstance(prev_level, int):
                if entry["level"] > prev_level + 1:
                    issues.append(
                        f"entry {i}: level jump {prev_level} → {entry['level']} "
                        f"at '{title}'"
                    )

    return {"issues": issues, "ok": len(issues) == 0}


def _norm_heading(s: str) -> str:
    """Fold a heading for comparison: strip markdown marks, accents, case,
    trailing punctuation and runs of whitespace."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"^[#*\s]+", "", s)
    s = re.sub(r"[\s*#:.\-\u2013\u2014]+$", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.lower().strip()


# Matches "Introduction" possibly preceded by a chapter/part marker, as a
# PREFIX: "Introduction", "1. Introduction", "Chapitre 1 Introduction", and
# crucially "Introduction générale". Used on both the TOC side and the body
# side so the two cannot disagree (see find_intro_parquet_page).
INTRO_PREFIX_RE = re.compile(
    r"^\s*#*\s*(?:(?:chapter|chapitre|part|partie|kapitel|cap[ií]tulo)\s+)?"
    r"[\dIVXivx]*\.?\s*introduction\b",
    re.IGNORECASE,
)


def find_intro_toc_entry(toc: list) -> Optional[dict]:
    """The flat-TOC entry for the Introduction: shallowest level wins, ties
    broken by document order. Returns the entry itself (so callers can use its
    title as well as its printed page)."""
    candidates: list[tuple[int, int, dict]] = []
    for i, entry in enumerate(toc):
        title = str(entry.get("title", ""))
        page_start = entry.get("page_start")
        if isinstance(page_start, int) and INTRO_PREFIX_RE.match(title):
            candidates.append((entry.get("level", 99), i, entry))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x[0], x[1]))
    return candidates[0][2]


def find_intro_toc_page(toc: list) -> Optional[int]:
    """Find the printed page_start of the 'Introduction' section in the flat TOC."""
    entry = find_intro_toc_entry(toc)
    return entry.get("page_start") if entry else None


def find_intro_parquet_page(df: pd.DataFrame, toc: list) -> Optional[int]:
    """
    Deterministically find the parquet page where the Introduction *actually*
    begins. Strategy:

      1. Determine the last TOC page in the parquet by looking at:
           · Page-header running title "TABLE DES MATIÈRES" blocks
           · List-item blocks that look like TOC entries (leader dots or
             trailing page numbers) in the first STRUCTURE_PAGE_WINDOW pages
      2. Scan heading blocks AFTER that TOC boundary, in three tiers of
         decreasing confidence, and stop at the first tier that matches:
           a. a Section-header whose folded text equals the TOC's own
              Introduction title (e.g. « INTRODUCTION GÉNÉRALE »)
           b. a Section-header that prefix-matches "Introduction"
           c. a Page-header in either of those forms (running headers are a
              last resort: they repeat on every page of the chapter and so
              land one or two pages late)
      3. Return the minimum parquet page within the winning tier.

    Why tiers: an exact-line match on "Introduction" alone is wrong twice over.
    It REJECTS the common French « Introduction générale », and the scan then
    runs on and locks onto the first heading that *is* exactly "Introduction" —
    in a thèse sur articles that is an embedded paper's introduction, 100 pages
    in. Observed offsets of 102 (true 5) and 36 (true 1) came from exactly this.
    """
    toc_entry = find_intro_toc_entry(toc)
    toc_title_norm = _norm_heading(toc_entry.get("title", "")) if toc_entry else ""

    # ── Step 1: locate the last TOC page in the parquet ──────────────────────
    toc_end_page = 0

    # Signal A: Page-header running title "TABLE DES MATIÈRES"
    toc_running_re = re.compile(
        r"^\s*table\s+des\s+mati[èe]res\s*$|^\s*table\s+of\s+contents\s*$|"
        r"^\s*sommaire\s*$|^\s*[íi]ndice\s*$",
        re.IGNORECASE,
    )
    # Bounded to the front matter: some theses print their Table des matières at
    # the END (2024ESMA0001, pp. 136-138 of 141). Taking the unbounded max then
    # set the "TOC boundary" past the whole body, the introduction scan found
    # nothing, and the offset silently fell back to printed-folio.
    front_matter_limit = max(STRUCTURE_PAGE_WINDOW, int(0.25 * int(df["page"].max())))
    running_hits = df[
        (df["category"] == "Page-header")
        & (df["page"] <= front_matter_limit)
        & df["text"].str.match(toc_running_re.pattern, case=False, na=False)
    ]
    if not running_hits.empty:
        toc_end_page = max(toc_end_page, int(running_hits["page"].max()))

    # Signal B: List-item blocks that look like TOC entries
    toc_list_hits = df[
        (df["category"] == "List-item")
        & (df["page"] <= STRUCTURE_PAGE_WINDOW)
        & df["text"].str.contains(
            r"\.{3,}\s*\d+\s*$|\s\d{1,3}\s*$", na=False, regex=True
        )
    ]
    if not toc_list_hits.empty:
        toc_end_page = max(toc_end_page, int(toc_list_hits["page"].max()))

    # ── Step 2: scan heading blocks AFTER the TOC end, in tiers ─────────────
    body = df[df["page"] > toc_end_page]
    tiers: list[list[int]] = [[], [], []]
    for _, row in body.iterrows():
        cat = row.get("category")
        if cat not in ("Section-header", "Page-header"):
            continue
        text = str(row.get("text", ""))
        folded = _norm_heading(text)
        title_match = bool(toc_title_norm) and folded == toc_title_norm
        prefix_match = bool(INTRO_PREFIX_RE.match(text))
        if not (title_match or prefix_match):
            continue
        if cat == "Section-header" and title_match:
            tiers[0].append(int(row["page"]))
        elif cat == "Section-header":
            tiers[1].append(int(row["page"]))
        else:
            tiers[2].append(int(row["page"]))

    for tier in tiers:
        if tier:
            return min(tier)
    return None



def folio_offset(df: pd.DataFrame, min_votes: int = 5) -> Optional[int]:
    """Offset (parquet page − printed page) read from the printed page numbers
    themselves: Page-header / Page-footer blocks whose text is a bare Arabic
    number. Returns the modal delta when at least `min_votes` blocks agree and
    they are a majority of the numeric folios; None otherwise (roman-numeral
    front matter is ignored, which is what we want — the TOC uses body pages)."""
    band = df[df["category"].isin(["Page-header", "Page-footer"])]
    deltas: list[int] = []
    for _, row in band.iterrows():
        t = re.sub(r"^[#*\s]+|[*\s]+$", "", str(row.get("text", "")))
        if t.isdigit() and len(t) <= 4:
            deltas.append(int(row["page"]) - int(t))
    if not deltas:
        return None
    best = max(set(deltas), key=deltas.count)
    votes = deltas.count(best)
    return best if votes >= min_votes and votes * 2 > len(deltas) else None


def compute_page_offset(df: pd.DataFrame, toc: list) -> dict:
    """
    Compute the deterministic offset between printed page numbers (as listed
    in the TOC) and raw parquet page indices.

    1. "introduction-anchor": the Introduction's printed page in the TOC vs the
       parquet page where an "Introduction" heading actually appears.
    2. "printed-folio" (fallback, only when 1 fails): the modal offset of the
       printed page numbers in the page headers/footers. Needed when the layout
       parser did not tag the Introduction title as a heading.
    """
    intro_toc = find_intro_toc_page(toc)
    intro_parquet = find_intro_parquet_page(df, toc)

    if intro_toc is not None and intro_parquet is not None:
        anchor = intro_parquet - intro_toc
        folio = folio_offset(df)
        info = {
            "intro_page_toc": intro_toc,
            "intro_page_parquet": intro_parquet,
            "offset": anchor,
            "method": "introduction-anchor",
        }
        # Cross-check against the independent folio vote. The two agreed on 6 of
        # 9 audited theses; every disagreement was the anchor's fault (it had
        # locked onto an embedded article's "Introduction"). A small gap is
        # usually a running Page-header landing a page or two late, so we only
        # record it; a large gap means the anchor is in the wrong chapter
        # entirely, and the folio vote is then the trustworthy one.
        if folio is not None and abs(folio - anchor) > 1:
            info["folio_offset"] = folio
            info["anchor_offset"] = anchor
            if abs(folio - anchor) > OFFSET_OVERRIDE_GAP:
                info["offset"] = folio
                info["intro_page_parquet"] = intro_toc + folio
                info["method"] = "printed-folio-override"
                info["warning"] = (
                    f"introduction-anchor returned {anchor} but the printed "
                    f"folios vote {folio} (gap {abs(folio - anchor)} > "
                    f"{OFFSET_OVERRIDE_GAP}); the anchor almost certainly "
                    f"matched an embedded article. Using the folio vote."
                )
            else:
                info["warning"] = (
                    f"introduction-anchor returned {anchor}, printed folios "
                    f"vote {folio}; keeping the anchor but the gap is suspect."
                )
        return info

    folio = folio_offset(df)
    if folio is not None:
        return {
            "intro_page_toc": intro_toc,
            "intro_page_parquet": intro_toc + folio if intro_toc is not None else None,
            "offset": folio,
            "method": "printed-folio",
        }

    return {
        "intro_page_toc": intro_toc,
        "intro_page_parquet": intro_parquet,
        "offset": None,
        "method": "failed",
    }


def apply_offset_to_toc(toc: list, offset: int, max_page: Optional[int] = None) -> list:
    """
    Add `page_start_parquet` and `page_end_parquet` to every entry in the
    flat toc list, computed by adding `offset` to the printed values.
    The original `page_start` / `page_end` fields are preserved.

    With `max_page` (the parquet's last page) the projected range is kept inside
    the document: an end past the last page is clamped, and a *start* past it
    becomes None because the entry cannot be located at all. Without this, a
    back-matter entry on a thesis with a large offset lands outside the parquet —
    2023LYO20128 (offset 30, 433 pages) put « Sitographie » at page 435 and
    « Bibliographie » end at 434, which makes `pages_to_blob` return nothing and
    the reading map point at pages that do not exist.
    """
    for entry in toc:
        ps = entry.get("page_start")
        pe = entry.get("page_end")
        start = ps + offset if isinstance(ps, int) else None
        end = pe + offset if isinstance(pe, int) else None
        if max_page is not None:
            if start is not None and start > max_page:
                start, end = None, None
            elif end is not None:
                end = min(end, max_page)
        entry["page_start_parquet"] = start
        entry["page_end_parquet"] = end
    return toc



# ── TOC as markdown (fed to step 2d) ────────────────────────────────────────

def render_toc_markdown(toc: list) -> str:
    """Render the flat TOC as nested markdown bullets with role tags for
    L0 entries. Indentation = level * 2 spaces. L0 entries with a role
    get `[role]` prefix so the model can distinguish parts from chapters."""
    lines: list[str] = []
    for entry in toc:
        level = entry.get("level")
        title = (entry.get("title") or "").strip()
        if not isinstance(level, int) or not title:
            continue
        indent = "  " * level
        role = entry.get("role")
        if level == 0 and role and role not in ("other",):
            lines.append(f"{indent}- [{role}] {title}")
        else:
            lines.append(f"{indent}- {title}")
    return "\n".join(lines)



# ── Step 1 orchestrator ──────────────────────────────────────────────────────

def extract_structure(parquet_path: Path, client: OpenAI) -> dict:
    """
    Step 1: produce the structure dict (→ `<thesis>_structure.json`).

    Output shape:
      {
        "thesis_id": <str>,
        "parquet_blocks": <int>,
        "parquet_pages": <int>,
        "metadata": {
          "titre", "auteur", "annee", "etablissement", "discipline",
          "mots_cles", "resume", "pages"     # pages filled deterministically
        },
        "toc": [                              # FLAT list, document order
          {
            "title":              str,
            "page_start":         int,        # printed
            "level":              int,        # 0 = top, 1 = "X.Y", ...
            "page_end":           int,        # chained deterministically
            "page_start_parquet": int,        # page_start + offset
            "page_end_parquet":   int,        # page_end   + offset
          },
          ...
        ],
        "page_offset": {
          "intro_page_toc":     int,
          "intro_page_parquet": int,
          "offset":             int,
          "method":             "introduction-anchor" | "printed-folio" | "failed"
        },
        "toc_validation": { "ok": bool, "issues": [str, ...] }
      }
    """
    thesis_id = parquet_path.stem
    df = pd.read_parquet(parquet_path)
    total_pages = int(df["page"].max())
    pages_with_content = int(df["page"].nunique())
    blank_pages = total_pages - pages_with_content
    blank_note = f" ({blank_pages} blank)" if blank_pages else ""
    log.info(
        f"[{thesis_id}] Loaded {len(df):,} blocks, "
        f"{total_pages} pages{blank_note}"
    )

    # Step 1a: LLM structure extraction from the front-matter blob
    log.info(f"[{thesis_id}] Building pp.1-{STRUCTURE_PAGE_WINDOW} markdown blob…")
    blob = extract_first_pages_blob(df, n_pages=STRUCTURE_PAGE_WINDOW)
    blob_tokens = len(blob) // 4
    log.info(f"[{thesis_id}]   blob: {len(blob):,} chars, ~{blob_tokens:,} tokens")

    log.info(f"[{thesis_id}] Calling LLM for structure extraction "
          f"(temp={STEP1_CONFIG.temperature}, "
          f"thinking_budget={STEP1_CONFIG.thinking_budget}, "
          f"max_tokens={STEP1_CONFIG.max_tokens})…")
    parsed = llm_extract_structure(client, blob)
    metadata = parsed["metadata"]
    toc: list = parsed["toc"] or []

    # Inject deterministic page count into metadata. The grille's `pages` field
    # is the total page count of the thesis, which the parquet always knows.
    metadata["pages"] = int(df["page"].max())

    # Count entries per level for visibility
    level_counts: dict[int, int] = {}
    for entry in toc:
        lvl = entry.get("level")
        if isinstance(lvl, int):
            level_counts[lvl] = level_counts.get(lvl, 0) + 1
    level_summary = ", ".join(f"L{l}={n}" for l, n in sorted(level_counts.items()))
    log.info(f"[{thesis_id}]   metadata keys: {list(metadata.keys())}")
    log.info(f"[{thesis_id}]   toc: {len(toc)} entries ({level_summary})")

    # Step 1b: deterministic page_end chaining
    log.info(f"[{thesis_id}] Chaining page_end via 'next same-or-shallower level' rule…")
    compute_page_ends(toc)

    # roles (part / chapter / frontmatter / backmatter) — deterministic
    tag_toc_roles(toc)
    role_counts: dict[str, int] = {}
    for entry in toc:
        r = entry.get("role", "other")
        role_counts[r] = role_counts.get(r, 0) + 1
    role_summary = ", ".join(f"{r}={n}" for r, n in sorted(role_counts.items()))
    log.info(f"[{thesis_id}]   roles: {role_summary}")

    # internal consistency check
    validation = validate_toc_structure(toc)
    if not validation["ok"]:
        log.warning(f"[{thesis_id}]   ⚠ TOC validation found {len(validation['issues'])} issue(s):")
        for issue in validation["issues"][:5]:
            log.info(f"       · {issue}")
        if len(validation["issues"]) > 5:
            log.info(f"       … and {len(validation['issues']) - 5} more")
    else:
        log.info(f"[{thesis_id}]   TOC validation: OK")

    # 1c: deterministic printed→parquet offset
    log.info(f"[{thesis_id}] Computing page offset (TOC ↔ parquet)…")
    offset_info = compute_page_offset(df, toc)
    if offset_info["method"] == "failed":
        log.warning(f"[{thesis_id}]   ⚠ offset computation failed: "
              f"toc_intro={offset_info['intro_page_toc']}, "
              f"parquet_intro={offset_info['intro_page_parquet']}")
    else:
        log.info(f"[{thesis_id}]   intro in TOC: p.{offset_info['intro_page_toc']}  |  "
              f"intro in parquet: p.{offset_info['intro_page_parquet']}  |  "
              f"offset = {offset_info['offset']:+d}  ({offset_info['method']})")
    if offset_info.get("warning"):
        # A wrong offset is silent: the fiche still renders, it just describes
        # the wrong pages. Say so loudly and keep it in 1_structure.json.
        log.warning(f"[{thesis_id}]   ⚠ OFFSET: {offset_info['warning']}")

    # 1d: project the offset onto every TOC entry
    if offset_info.get("offset") is not None:
        apply_offset_to_toc(toc, offset_info["offset"], max_page=int(df["page"].max()))
    else:
        # Offset unknown — emit parquet fields as null on every entry
        for entry in toc:
            entry["page_start_parquet"] = None
            entry["page_end_parquet"] = None

    return {
        "thesis_id": thesis_id,
        "parquet_blocks": int(len(df)),
        "parquet_pages": int(df["page"].nunique()),
        "metadata": metadata,
        "toc": toc,
        "page_offset": offset_info,
        "toc_validation": validation,
    }
