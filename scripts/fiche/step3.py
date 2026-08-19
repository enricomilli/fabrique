"""
fiche/step3.py — step 3: targeted chapter dives that produce the DEFINITIVE
version of the sections step 2 could only sketch from intro/conclusion.

  3a  methodology chapter (found by title regex in the TOC, non-part, largest
      span) → `methodologie` (4-bullet grille structure) + `hypotheses`
  3b  theory chapter(s) (the TOC refs step 2d picked for `concepts_cles`, or
      for `cadre_theorique` as fallback) → `concepts_cles` (CONCEPT / SENS / ORIGINE)

3a and 3b read disjoint inputs and update disjoint sections, so the pipeline
runs them concurrently (two server slots). Each returns None when it has
nothing to read, and an `updated_sections` dict otherwise.
"""
import logging
import re
from pathlib import Path
from typing import Optional

import pandas as pd
from openai import OpenAI

from .blobs import pages_to_blob
from .config import STEP3_CONFIG
from .llm import llm_call
from .prompts import STEP3A_PROMPT, STEP3A_SYSTEM, STEP3B_PROMPT, STEP3B_SYSTEM
from .step2 import parse_section_markdown

log = logging.getLogger('fiche')

# ── 3a: methodology chapter ──────────────────────────────────────────────────

# Regex patterns to find methodology chapters in the TOC (case-insensitive).
METHODOLOGY_TITLE_RE = re.compile(
    r"m[ée]thodolog|m[ée]thodes?\b|methodology|methods?\b|corpus.*m[ée]thod|"
    r"cadre\s+m[ée]thodolog|d[ée]marche\s+m[ée]thodolog|"
    # STEM theses rarely title a chapter "Methods" — their methodology
    # section hides under names like "Analysis Overview", "Research
    # Design", "Experimental Setup". Match those too (still L0/L1-gated
    # and largest-span-preferred by find_methodology_chapter).
    r"analysis\s+(?:overview|strategy|pipeline)|research\s+design|"
    r"study\s+design|experimental\s+(?:setup|design)|"
    # bare "protocole" would hijack e.g. "Le protocole de Kyoto" —
    # require a methodological qualifier
    r"dispositif\s+exp[ée]rimental|"
    r"protocole\s+(?:exp[ée]rimental|d.enqu[êe]te|de\s+recherche|m[ée]thodologique)",
    re.IGNORECASE,
)

# How many parquet pages to give the model for structure extraction.


def find_methodology_chapter(toc: list) -> Optional[dict]:
    """Find the TOC entry whose title matches a methodology-like pattern
    and is the most specific methodology CHAPTER (not a part container).

    A `part` is a multi-chapter container; diving into it means reading
    100+ pages of mixed theory/methodology content. A `chapter` or
    `section` is a dedicated unit. Strategy:
      1. Collect all L0/L1 methodology-title matches.
      2. Prefer non-part entries (role != 'part').
      3. Among those, pick the largest page span (avoids short preambles).
      4. Fallback to the largest match including parts if no non-part
         candidate exists.
    """
    candidates: list[dict] = []
    for entry in toc:
        level = entry.get("level")
        title = (entry.get("title") or "").strip()
        if not isinstance(level, int) or level > 1 or not title:
            continue
        if METHODOLOGY_TITLE_RE.search(title):
            candidates.append(entry)
    if not candidates:
        return None

    def _span(e):
        ps = e.get("page_start") or 0
        pe = e.get("page_end") or ps
        return pe - ps

    # Prefer non-part candidates; fall back to parts only if nothing else matches.
    non_parts = [e for e in candidates if e.get("role") != "part"]
    pool = non_parts if non_parts else candidates
    return max(pool, key=_span)


def step3a_methodology(
    parquet_path: Path, structure: dict, intro_json: dict, client: OpenAI,
) -> Optional[dict]:
    """Step 3a: read the methodology chapter, produce fiche-grade
    `methodologie` and `hypotheses`. Returns updated sections dict
    or None if no methodology chapter is found."""
    thesis_id = parquet_path.stem
    df = pd.read_parquet(parquet_path)
    toc = structure.get("toc") or []

    # ── Find methodology chapter ──
    method_entry = find_methodology_chapter(toc)
    if method_entry is None:
        log.info(f"[{thesis_id}] [step3a] No methodology chapter found in TOC — skipping")
        return None

    title = method_entry["title"]
    ps = method_entry.get("page_start_parquet")
    pe = method_entry.get("page_end_parquet")
    if not isinstance(ps, int) or not isinstance(pe, int):
        log.info(f"[{thesis_id}] [step3a] Methodology chapter '{title}' has no page range — skipping")
        return None

    log.info(f"[{thesis_id}] [step3a] Found methodology chapter: '{title}' (parquet pp.{ps}-{pe})")

    # ── Extract blob ──
    chapter_blob = pages_to_blob(df, ps, pe)
    blob_chars = len(chapter_blob)
    blob_words = len(chapter_blob.split())
    log.info(f"[{thesis_id}] [step3a]   {blob_chars:,} chars, ~{blob_words:,} words")

    # ── Current content from Step 2 ──
    sections = intro_json.get("sections") or {}
    current_meth = (sections.get("methodologie") or {}).get("content") or "[NULL]"
    current_hyp = (sections.get("hypotheses") or {}).get("content") or "[NULL]"

    # ── LLM call ──
    log.info(f"[{thesis_id}] [step3a] Calling LLM "
          f"(temp={STEP3_CONFIG.temperature}, max_tokens={STEP3_CONFIG.max_tokens})…")
    prompt = STEP3A_PROMPT.format(
        current_methodologie=current_meth,
        current_hypotheses=current_hyp,
        chapter_blob=chapter_blob,
        p_start=ps,
        p_end=pe,
    )
    raw = llm_call(client, STEP3A_SYSTEM, prompt, config=STEP3_CONFIG, label="3a")

    # ── Parse ──
    parsed = parse_section_markdown(raw)
    updated = {}
    for slug in ("methodologie", "hypotheses"):
        new_content = parsed.get(slug)
        if new_content is not None:
            updated[slug] = new_content
            log.info(f"[{thesis_id}] [step3a]   {slug}: {len(new_content):,} chars (updated)")
        else:
            log.info(f"[{thesis_id}] [step3a]   {slug}: unchanged (no new content from chapter)")

    return {
        "chapter_title": title,
        "chapter_pages_parquet": {"start": ps, "end": pe},
        "chapter_blob_chars": blob_chars,
        "updated_sections": updated,
    }


# ── 3b: theory chapter(s) → concepts clés ────────────────────────────────────

STRUCTURAL_LABEL_RE = re.compile(
    r"^(auteur|auteurs|principal|secondaire|qui|quoi|comment|où|quand)", re.IGNORECASE)


def resolved_refs(section: dict) -> list[dict]:
    """The step-2d candidate refs of a section that resolved to a TOC entry with a parquet range."""
    return [r for r in (section.get("candidate_refs") or [])
            if r.get("resolved") and r.get("page_start_parquet") and r.get("page_end_parquet")]


def mandatory_concepts(fil_rouge: str) -> str:
    """« quoted » terms of `fil_rouge` that look like concept names (multi-word,
    ≤ 60 chars, not a structural label), as the bullet list the 3b prompt
    requires to be kept. Coherence is enforced with fil_rouge only — the
    thesis's own structuring concepts — not with cadre_theorique, which lists
    borrowed tools that belong there, not in concepts_cles."""
    kept: list[str] = []
    seen: set[str] = set()
    for q in re.findall(r"«\s*([^»]+?)\s*»", fil_rouge):
        q = q.strip()
        if q.lower() in seen or len(q.split()) < 2 or len(q) > 60 or STRUCTURAL_LABEL_RE.match(q):
            continue
        kept.append(q)
        seen.add(q.lower())
    return "\n".join(f"  - {c}" for c in kept) if kept else "  (aucun)"


def step3b_concepts(
    parquet_path: Path, intro_json: dict, client: OpenAI,
) -> Optional[dict]:
    """Step 3b: read the theory chapter(s) step 2d pointed at for `concepts_cles`
    (fallback: the refs of `cadre_theorique`, which often overlap) and produce
    the fiche-grade `concepts_cles`. Returns an updated-sections dict or None."""
    thesis_id = parquet_path.stem
    df = pd.read_parquet(parquet_path)
    sections = intro_json.get("sections") or {}
    concepts_sec = sections.get("concepts_cles") or {}

    refs = resolved_refs(concepts_sec) or resolved_refs(sections.get("cadre_theorique") or {})
    if not refs:
        log.info(f"[{thesis_id}] [step3b] No resolved candidate refs for concepts_cles — skipping")
        return None

    chapter_blobs: list[str] = []
    chapter_titles: list[str] = []
    total_chars = 0
    for ref in refs:
        ps, pe = ref["page_start_parquet"], ref["page_end_parquet"]
        title = ref.get("title") or "?"
        blob = pages_to_blob(df, ps, pe)
        if blob:
            chapter_blobs.append(f"--- {title} (pp.{ps}-{pe}) ---\n{blob}")
            chapter_titles.append(title)
            total_chars += len(blob)
    if not chapter_blobs:
        log.info(f"[{thesis_id}] [step3b] Candidate refs resolved but chapters are empty — skipping")
        return None
    log.info(f"[{thesis_id}] [step3b] Found {len(chapter_blobs)} theory chapter(s): "
             f"{', '.join(repr(t) for t in chapter_titles)} ({total_chars:,} chars total)")

    current_fil_rouge = (sections.get("fil_rouge") or {}).get("content") or "[NULL]"
    log.info(f"[{thesis_id}] [step3b] Calling LLM "
             f"(temp={STEP3_CONFIG.temperature}, max_tokens={STEP3_CONFIG.max_tokens})…")
    prompt = STEP3B_PROMPT.format(
        current_concepts=concepts_sec.get("content") or "[NULL]",
        current_cadre=(sections.get("cadre_theorique") or {}).get("content") or "[NULL]",
        current_fil_rouge=current_fil_rouge,
        mandatory_concepts=mandatory_concepts(current_fil_rouge),
        chapters_blob="\n\n".join(chapter_blobs),
        n_chapters=len(chapter_blobs),
        total_chars=total_chars,
    )
    raw = llm_call(client, STEP3B_SYSTEM, prompt, config=STEP3_CONFIG, label="3b")

    new_content = parse_section_markdown(raw).get("concepts_cles")
    if new_content is None:
        log.info(f"[{thesis_id}] [step3b]   concepts_cles: unchanged (no new content)")
        return None
    log.info(f"[{thesis_id}] [step3b]   concepts_cles: {len(new_content):,} chars (updated)")
    return {
        "chapter_titles": chapter_titles,
        "chapter_blob_chars": total_chars,
        "updated_sections": {"concepts_cles": new_content},
    }
