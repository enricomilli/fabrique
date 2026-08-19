"""
fiche/step2.py — step 2: fill the 12 grille sections from intro / conclusion /
abstract, then score them and pick TOC chapters for step 3.

  2a  read the full Introduction → 12 sections in markdown (`## <slug>`),
      verbatim where possible, `[NULL]` where absent — never invent
  2b  2a output + full Conclusion → augmented/refined sections
  2c  2b output + abstract, DELTA mode: only improved sections are rewritten,
      `[INCHANGÉ]` keeps 2b's text (merged here, deterministically)
  2d  severe 1-10 score per section + TOC entries to inspect (routes step 3)

`analyze_intro` returns (intro_json, intro_md): the structured sections with
scores/refs (→ `<thesis>_intro.json`) and the raw markdown (→ `<thesis>_intro.md`).
Intermediate passes are dumped as `<thesis>_step2{a,b,c_sparse,d}.md`.
"""
import logging
import re
import unicodedata
from pathlib import Path
from typing import Optional

import pandas as pd
from openai import OpenAI

from .blobs import (extract_abstract_blob, extract_conclusion_blob, extract_intro_blob,
                    extract_keywords_from_abstract)
from .config import STEP2_CONFIG, STEP2D_SCORING_CONFIG
from .llm import llm_call
from .prompts import (SECTION_DESCRIPTIONS, STEP2_SECTIONS, STEP2_SYSTEM, STEP2A_INTRO_PROMPT,
                      STEP2B_CONCLUSION_PROMPT, STEP2C_ABSTRACT_PROMPT, STEP2C_SCORE_PROMPT,
                      STEP2C_UNCHANGED_RE)
from .structure import render_toc_markdown

log = logging.getLogger('fiche')

# ── Markdown parsing helpers ─────────────────────────────────────────────────

def slugify_header(s: str) -> str:
    """Lenient header matching: lowercase, strip accents, normalize whitespace."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def parse_section_markdown(md: str) -> dict[str, Optional[str]]:
    """Parse a 2a/2b output into {slug: content_or_None}.

    Lenient on header level (## or ###) and accents/case (uses slugify_header).
    `[NULL]` (case-insensitive, possibly with surrounding whitespace) → None.
    Sections not present in the output → missing key (caller decides default).
    """
    sections: dict[str, Optional[str]] = {}
    expected = set(STEP2_SECTIONS)

    # Pre-clean: the model with thinking ON sometimes glues `## slug` headers
    # to a trailing thinking-channel artifact like `*Ready.*## these_centrale`
    # on the same line. Insert a newline before any `#{1,3}` that follows a
    # non-whitespace character, so the header parser sees them at line start.
    md = re.sub(r"(?<=\S)(#{1,3}\s+\w)", r"\n\1", md)

    # Match any heading line (## or ### or even #), capture the heading text
    header_re = re.compile(r"^\s{0,3}#{1,3}\s+(.+?)\s*$", re.MULTILINE)
    matches = list(header_re.finditer(md))
    if not matches:
        return sections

    for i, m in enumerate(matches):
        slug = slugify_header(m.group(1))
        if slug not in expected:
            continue
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        body = md[body_start:body_end].strip()
        if re.fullmatch(r"\[?\s*null\s*\]?", body, flags=re.IGNORECASE):
            sections[slug] = None
        else:
            sections[slug] = body or None
    return sections


def parse_scoring_table(md: str, toc: list) -> dict[str, dict]:
    """Parse 2c's markdown table into {slug: {score, gaps, candidate_refs}}.

    `candidate_refs` are split on ` ; `, normalized, and resolved against
    the real TOC (titles compared case-insensitively after a light strip).
    Unmatched refs are kept with `resolved: False` and logged.
    """
    toc_by_title: dict[str, dict] = {}
    for entry in toc:
        t = (entry.get("title") or "").strip()
        if t:
            toc_by_title[t.lower()] = entry

    out: dict[str, dict] = {}
    unmatched: list[str] = []

    # Find table rows: lines starting with `|` that have at least 4 cells.
    for raw_line in md.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 4:
            continue
        # Skip header and separator rows
        if cells[0].lower() == "section":
            continue
        if all(re.fullmatch(r"-+|:?-+:?", c) for c in cells if c):
            continue
        slug = slugify_header(cells[0])
        if slug not in STEP2_SECTIONS:
            continue
        # score
        score_raw = cells[1]
        try:
            score = int(re.search(r"\d+", score_raw).group(0))
        except (AttributeError, ValueError):
            score = 0
        score = max(0, min(10, score))
        # gaps
        gaps_raw = cells[2]
        gaps = None if gaps_raw in ("—", "-", "", "null", "NULL") else gaps_raw
        # refs
        refs_raw = cells[3]
        refs_out: list[dict] = []
        if refs_raw and refs_raw not in ("—", "-", "", "null", "NULL"):
            for ref in re.split(r"\s*;\s*", refs_raw):
                ref = ref.strip()
                if not ref:
                    continue
                resolved = toc_by_title.get(ref.lower())
                if resolved is None:
                    # Try a fuzzy match: any TOC title containing this ref
                    # or vice-versa (handles minor numbering omissions).
                    candidates = [
                        e for k, e in toc_by_title.items()
                        if ref.lower() in k or k in ref.lower()
                    ]
                    resolved = candidates[0] if len(candidates) == 1 else None
                if resolved is None:
                    unmatched.append(f"{slug}: {ref!r}")
                    refs_out.append({
                        "title": ref,
                        "page_start": None,
                        "page_end": None,
                        "page_start_parquet": None,
                        "page_end_parquet": None,
                        "resolved": False,
                    })
                else:
                    refs_out.append({
                        "title": resolved.get("title"),
                        "page_start": resolved.get("page_start"),
                        "page_end": resolved.get("page_end"),
                        "page_start_parquet": resolved.get("page_start_parquet"),
                        "page_end_parquet": resolved.get("page_end_parquet"),
                        "resolved": True,
                    })
        out[slug] = {"score": score, "gaps": gaps, "candidate_refs": refs_out}

    if unmatched:
        log.warning(
            f"  [step2c] {len(unmatched)} candidate ref(s) didn't match any "
            f"TOC entry:",
        )
        for u in unmatched[:5]:
            log.info(f"       · {u}")

    return out


# ── Step 2 helpers ──────────────────────────────────────────────────────────

SECTION_LIST_STR = "\n".join(f"  - {s}" for s in STEP2_SECTIONS)


def build_parts_list(toc: list) -> str:
    """The PARTIES/CHAPITRES block handed to 2a/2b for the `plan` section.

    Without it the model can only name parts the intro/conclusion mention.
    French SHS theses have `role=part` at the top level (Première partie…)
    with chapters nested under them; STEM theses have no parts and use
    `role=chapter`. Prefer parts, fall back to chapters; in both cases keep
    only entries with a real page_start (so mis-tagged front matter such as
    "List of Figures" cannot hijack the plan)."""
    parts = [e for e in toc if e.get("role") == "part" and isinstance(e.get("page_start"), int)]
    if parts:
        units, label = parts, "PARTIES"
    else:
        units = [e for e in toc if e.get("role") == "chapter" and isinstance(e.get("page_start"), int)]
        label = "CHAPITRES"
    if not units:
        return ""
    return (f"Les {label} de la thèse (issus de la table des matières) :\n"
            + "\n".join(f"  - {e['title']}" for e in units))


def merge_abstract_delta(md_2b: str, md_2c_sparse: str) -> tuple[dict, str, int]:
    """2c is DELTA mode: only sections the abstract improved are rewritten;
    `[INCHANGÉ]` (or an omitted section) keeps 2b's text. Returns
    (sections_content, merged markdown, number of sections updated)."""
    base = parse_section_markdown(md_2b)
    delta = parse_section_markdown(md_2c_sparse)
    sections_content: dict[str, Optional[str]] = {}
    n_changed = 0
    for slug in STEP2_SECTIONS:
        new = delta.get(slug)
        if new is not None and not STEP2C_UNCHANGED_RE.match(new.strip()):
            sections_content[slug] = new
            n_changed += 1
        else:
            sections_content[slug] = base.get(slug)
    md_2c = "\n\n".join(
        f"## {slug}\n\n{sections_content[slug] if sections_content[slug] is not None else '[NULL]'}"
        for slug in STEP2_SECTIONS
    )
    return sections_content, md_2c, n_changed


def merge_scores(sections_content: dict, scoring: dict) -> dict[str, dict]:
    """Every grille section → {content, score, gaps, candidate_refs}."""
    merged: dict[str, dict] = {}
    for slug in STEP2_SECTIONS:
        score_info = scoring.get(slug, {})
        merged[slug] = {
            "content": sections_content.get(slug),
            "score": score_info.get("score", 0),
            "gaps": score_info.get("gaps"),
            "candidate_refs": score_info.get("candidate_refs", []),
        }
    return merged


# ── Step 2 orchestrator ─────────────────────────────────────────────────────

def analyze_intro(
    parquet_path: Path, structure: dict, client: OpenAI,
    dump_to=None,
) -> tuple[dict, str]:
    """Step 2 orchestrator: 2a → 2b → 2c (delta merge) → 2d (scoring).

    Returns (json_dict, raw_markdown). The caller writes both to disk.
    `dump_to` (a layout.ThesisLayout) receives the raw 2a/2b/2c/2d outputs.
    Side effect: `structure["metadata"]["mots_cles"]` is overwritten with the
    keywords found on the abstract page (deterministic, beats step 1's guess).
    """
    thesis_id = parquet_path.stem
    df = pd.read_parquet(parquet_path)
    toc = structure.get("toc") or []

    # ── inputs: introduction, conclusion (optional), TOC ──
    log.info(f"[{thesis_id}] [step2] Extracting Introduction blob…")
    intro_blob, intro_start, intro_end = extract_intro_blob(df, structure)
    log.info(f"[{thesis_id}] [step2]   intro pp.{intro_start}-{intro_end} "
             f"({len(intro_blob):,} chars, ~{len(intro_blob.split()):,} words)")

    log.info(f"[{thesis_id}] [step2] Extracting Conclusion blob…")
    try:
        concl_blob, concl_start, concl_end = extract_conclusion_blob(df, structure)
        has_conclusion = True
        log.info(f"[{thesis_id}] [step2]   conclusion pp.{concl_start}-{concl_end} "
                 f"({len(concl_blob):,} chars, ~{len(concl_blob.split()):,} words)")
    except RuntimeError as e:
        has_conclusion = False
        concl_blob, concl_start, concl_end = "", None, None
        log.warning(f"[{thesis_id}] [step2]   ⚠ no Conclusion found ({e}) — skipping 2b")

    toc_md = render_toc_markdown(toc)
    log.info(f"[{thesis_id}] [step2]   TOC rendered ({len(toc_md):,} chars)")
    parts_list = build_parts_list(toc)

    # ── 2a: introduction ──
    log.info(f"[{thesis_id}] [step2a] Filling sections from Introduction "
             f"(temp={STEP2_CONFIG.temperature}, thinking_budget={STEP2_CONFIG.thinking_budget})…")
    prompt_2a = STEP2A_INTRO_PROMPT.format(
        intro_blob=intro_blob, p_start=intro_start, p_end=intro_end,
        section_descriptions=SECTION_DESCRIPTIONS, section_list=SECTION_LIST_STR, parts_list=parts_list,
    )
    md_2a = llm_call(client, STEP2_SYSTEM, prompt_2a, config=STEP2_CONFIG, label="2a")

    # ── 2b: conclusion (skipped if none) ──
    if has_conclusion:
        log.info(f"[{thesis_id}] [step2b] Refining sections with Conclusion…")
        prompt_2b = STEP2B_CONCLUSION_PROMPT.format(
            markdown_2a=md_2a, conclusion_blob=concl_blob, p_start=concl_start, p_end=concl_end,
            section_descriptions=SECTION_DESCRIPTIONS, section_list=SECTION_LIST_STR, parts_list=parts_list,
        )
        md_2b = llm_call(client, STEP2_SYSTEM, prompt_2b, config=STEP2_CONFIG, label="2b")
    else:
        md_2b = md_2a

    # ── 2c: abstract, delta mode (skipped if none) ──
    abstract_blob, abstract_page = extract_abstract_blob(df, structure)
    has_abstract = bool(abstract_blob)
    md_2c_sparse = None
    if has_abstract:
        # Keywords read off the abstract page always win over step 1's guess
        # (step 1 may have invented keywords from the title when the real list
        # was not in its 25-page window).
        extracted_kw = extract_keywords_from_abstract(abstract_blob)
        if extracted_kw:
            structure["metadata"]["mots_cles"] = extracted_kw
            log.info(f"[{thesis_id}] [step2c] Extracted {len(extracted_kw)} mots-clés "
                     f"from abstract: {', '.join(extracted_kw[:5])}…")
        log.info(f"[{thesis_id}] [step2c] Refining sections with Abstract "
                 f"(p.{abstract_page}, {len(abstract_blob):,} chars)…")
        prompt_2c = STEP2C_ABSTRACT_PROMPT.format(
            markdown_prev=md_2b, abstract_blob=abstract_blob, abstract_page=abstract_page,
            section_descriptions=SECTION_DESCRIPTIONS, section_list=SECTION_LIST_STR,
        )
        md_2c_sparse = llm_call(client, STEP2_SYSTEM, prompt_2c, config=STEP2_CONFIG, label="2c")
        sections_content, md_2c, n_changed = merge_abstract_delta(md_2b, md_2c_sparse)
        log.info(f"[{thesis_id}] [step2c]   delta merge: {n_changed}/12 sections "
                 f"updated from abstract, rest kept from 2b")
    else:
        md_2c = md_2b
        sections_content = parse_section_markdown(md_2b)
        log.info(f"[{thesis_id}] [step2c] No abstract found — skipping")

    # ── 2d: severe scoring + TOC refs for step 3 ──
    log.info(f"[{thesis_id}] [step2d] Scoring sections + picking TOC refs…")
    prompt_2d = STEP2C_SCORE_PROMPT.format(markdown_2b=md_2c, toc_markdown=toc_md, section_list=SECTION_LIST_STR)
    md_2d = llm_call(client, STEP2_SYSTEM, prompt_2d, config=STEP2D_SCORING_CONFIG, label="2d")

    # raw passes on disk, so a quality change can be attributed to a pass
    if dump_to is not None:
        dumps = {"2a": md_2a, "2b": md_2b, "2d": md_2d}
        if has_abstract:
            dumps["2c_sparse"] = md_2c_sparse
        for tag, content in dumps.items():
            dump_to.step_dump(tag).write_text(content, encoding="utf-8")

    # ── merge + report ──
    merged = merge_scores(sections_content, parse_scoring_table(md_2d, toc))
    log.info(f"[{thesis_id}] [step2]   section scores (severe):")
    for slug in STEP2_SECTIONS:
        sec = merged[slug]
        marker = "✓" if sec["score"] >= 9 else (" " if sec["score"] > 0 else "✗")
        log.info(f"       {marker} {slug:<22} score={sec['score']:>2}/10  refs={len(sec['candidate_refs'])}")

    abstract_note = f"<!-- abstract p.{abstract_page} -->\n" if has_abstract else ""
    raw_md = (
        f"<!-- thesis: {thesis_id} -->\n"
        f"<!-- intro pp.{intro_start}-{intro_end} -->\n"
        f"<!-- conclusion pp.{concl_start}-{concl_end} -->\n"
        f"{abstract_note}\n"
        f"# Step 2 — content (intro + conclusion + abstract merged)\n\n"
        f"{md_2c.strip()}\n\n"
        f"---\n\n"
        f"# Step 2 — scoring\n\n"
        f"{md_2d.strip()}\n"
    )
    json_out = {
        "intro_pages_parquet": {"start": intro_start, "end": intro_end},
        "conclusion_pages_parquet": {"start": concl_start, "end": concl_end} if has_conclusion else None,
        "intro_blob_chars": len(intro_blob),
        "conclusion_blob_chars": len(concl_blob) if has_conclusion else 0,
        "sections": merged,
    }
    return json_out, raw_md
