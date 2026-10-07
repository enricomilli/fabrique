"""
Offline unit tests for the deterministic parts of the pipeline: output parsers,
TOC chaining/roles/offset, the citation gate, verify_citations, c12_audit,
trace_grounding. No server needed.
"""
import json
import pathlib
import sys

import pandas as pd
import pytest

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(SCRIPTS))

import make_golden as mg  # noqa: E402

F = mg.import_fiche(SCRIPTS)
g = lambda n: mg.getattr_any(F, n)  # noqa: E731


# ── step 1 parsers / TOC logic ───────────────────────────────────────────────

def test_parse_compact_output_basic():
    raw = ("TITRE: Le titre\nAUTEUR: A. B.\nANNEE: 2024\nETABLISSEMENT: Univ\n"
           "DISCIPLINE: null\nMOTS_CLES: a; b ;; c\n\nTOC\n0|1|Résumé\n0|11|Introduction\n"
           "1|12|1.1. Sous\nbad line\n0|null|Conclusion\n")
    out = g("parse_compact_output")(raw)
    assert out["metadata"]["titre"] == "Le titre"
    assert out["metadata"]["discipline"] is None
    assert out["metadata"]["mots_cles"] == ["a", "b", "c"]
    assert [e["title"] for e in out["toc"]] == ["Résumé", "Introduction", "1.1. Sous", "Conclusion"]
    assert out["toc"][3]["page_start"] is None
    assert out["toc"][2]["level"] == 1


def test_parse_compact_output_requires_toc_marker():
    with pytest.raises(RuntimeError):
        g("parse_compact_output")("TITRE: x\nAUTEUR: y\n")


def test_compute_page_ends_rule():
    toc = [{"title": "Intro", "level": 0, "page_start": 1},
           {"title": "Ch1", "level": 0, "page_start": 10},
           {"title": "1.1", "level": 1, "page_start": 10},
           {"title": "1.2", "level": 1, "page_start": 15},
           {"title": "1.3", "level": 1, "page_start": 15},
           {"title": "Ch2", "level": 0, "page_start": 30},
           {"title": "Concl", "level": 0, "page_start": None}]
    g("compute_page_ends")(toc)
    ends = [e["page_end"] for e in toc]
    # next same-or-shallower entry − 1; same-page sibling → own page; last → own page; no page → None
    assert ends == [9, 29, 14, 15, 29, 30, None]


def test_tag_toc_roles_flat_and_nested():
    toc = [{"title": "Résumé", "level": 0}, {"title": "Introduction", "level": 0},
           {"title": "Première partie. La genèse", "level": 0}, {"title": "Chapitre 1. X", "level": 0},
           {"title": "1.1 Y", "level": 1}, {"title": "La métamorphose", "level": 0},
           {"title": "2. Z", "level": 1}, {"title": "Conclusion", "level": 0},
           {"title": "Bibliographie", "level": 0}, {"title": "Annexes", "level": 0}]
    g("tag_toc_roles")(toc)
    roles = [e["role"] for e in toc]
    assert roles == ["frontmatter", "frontmatter", "part", "chapter", "section",
                     "part", "section", "backmatter", "backmatter", "backmatter"]


def test_find_intro_toc_page_prefers_shallowest():
    toc = [{"title": "1.1 Introduction", "level": 1, "page_start": 40},
           {"title": "Chapter 1 Introduction", "level": 0, "page_start": 12}]
    assert g("find_intro_toc_page")(toc) == 12


def test_compute_page_offset_from_dataframe():
    df = pd.DataFrame([
        {"page": 3, "block_index": 0, "category": "Page-header", "text": "TABLE DES MATIÈRES"},
        {"page": 3, "block_index": 1, "category": "List-item", "text": "Introduction ........ 9"},
        {"page": 5, "block_index": 0, "category": "Section-header", "text": "Introduction"},
        {"page": 14, "block_index": 0, "category": "Section-header", "text": "Introduction"},
    ])
    toc = [{"title": "Introduction", "level": 0, "page_start": 9}]
    off = g("compute_page_offset")(df, toc)
    assert off["method"] == "introduction-anchor"
    assert off["intro_page_parquet"] == 5 and off["offset"] == -4


def test_validate_toc_structure_flags_regressions():
    toc = [{"title": "A", "level": 0, "page_start": 10, "page_end": 9},
           {"title": "B", "level": 2, "page_start": 5, "page_end": 5}]
    rep = g("validate_toc_structure")(toc)
    assert not rep["ok"] and len(rep["issues"]) == 3


# ── step 2 parsers ───────────────────────────────────────────────────────────

def test_parse_section_markdown_handles_null_glued_headers_and_accents():
    md = ("*Ready.*## these_centrale\nLa thèse.\n\n### Questions_recherche\n[NULL]\n\n"
          "## hypotheses\n\n**Principale** : x\n\n## inconnu\nignored\n")
    out = g("parse_section_markdown")(md)
    assert out["these_centrale"] == "La thèse."
    assert out["questions_recherche"] is None
    assert out["hypotheses"].startswith("**Principale**")
    assert "inconnu" not in out


def test_parse_scoring_table_resolves_refs():
    toc = [{"title": "3 Corpus et méthodologies", "page_start": 50, "page_end": 80,
            "page_start_parquet": 61, "page_end_parquet": 91}]
    md = ("| section | score | gaps | refs |\n|---|---|---|---|\n"
          "| these_centrale | 11 | — | — |\n"
          "| methodologie | 8 | corpus | 3 Corpus et méthodologies ; Inexistant |\n")
    out = g("parse_scoring_table")(md, toc)
    assert out["these_centrale"]["score"] == 10 and out["these_centrale"]["candidate_refs"] == []
    refs = out["methodologie"]["candidate_refs"]
    assert refs[0]["resolved"] and refs[0]["page_start_parquet"] == 61
    assert not refs[1]["resolved"]


def test_step2c_unchanged_regex():
    r = g("STEP2C_UNCHANGED_RE")
    assert r.match("[INCHANGÉ]") and r.match("inchangé.") and r.match("UNCHANGED")
    assert not r.match("[INCHANGÉ] mais voici un ajout")


def test_extract_keywords_from_abstract():
    blob = "Résumé…\n**Mots clés** : journalisme, bourse ; presse.\nKeywords: finance, Bourse\n"
    assert g("extract_keywords_from_abstract")(blob) == ["journalisme", "bourse", "presse", "finance"]


def test_find_methodology_chapter_prefers_non_part_largest_span():
    toc = [{"title": "Préambule méthodologique", "level": 0, "role": "part", "page_start": 1, "page_end": 200},
           {"title": "3. Corpus et méthodologies", "level": 1, "role": "section", "page_start": 40, "page_end": 60},
           {"title": "Le protocole de Kyoto", "level": 1, "role": "section", "page_start": 70, "page_end": 300}]
    assert g("find_methodology_chapter")(toc)["title"] == "3. Corpus et méthodologies"


# ── citation gate + auditors ────────────────────────────────────────────────

@pytest.fixture
def tiny_parquet(tmp_path):
    rows = [
        {"page": 1, "block_index": 0, "category": "Text",
         "text": "Le journalisme boursier naît d'une demande sociale pressante au dix-neuvième siècle."},
        {"page": 2, "block_index": 0, "category": "Text",
         "text": "La métamorphose textuelle procède par standardisation progressive des rubriques."},
        {"page": 2, "block_index": 1, "category": "Page-footer", "text": "2"},
        {"page": 3, "block_index": 0, "category": "Text",
         "text": "Une phrase sans rapport qui remplit la page trois de la thèse."},
    ]
    p = tmp_path / "tiny.parquet"
    pd.DataFrame(rows).to_parquet(p)
    return p


def test_postcheck_fiche_citations_rewrites_and_inserts(tiny_parquet):
    fiche = ("## Thèse centrale\n\n"
             "- « Le journalisme boursier naît d'une demande sociale pressante » (p. 3)\n"          # wrong adjacent → rewrite
             "- « La métamorphose textuelle procède par standardisation progressive » et plus loin "
             "une paraphrase longue sans guillemets (p. 1)\n"                                       # non-adjacent → insert
             "- « Une phrase sans rapport qui remplit la page trois » (p. 3)\n"                      # correct → untouched
             "- « court » (p. 9)\n")                                                                 # too short → skipped
    fixed, fixes = g("postcheck_fiche_citations")(fiche, tiny_parquet)
    hows = sorted((f["how"], f["to"]) for f in fixes)
    assert hows == [("insert", 2), ("rewrite", 1)]
    assert "pressante » (p. 1)" in fixed
    assert "standardisation progressive » (p. 2) et plus loin" in fixed
    assert "page trois » (p. 3)" in fixed and "« court » (p. 9)" in fixed


def test_render_fiche_markdown_layout():
    structure = {"metadata": {"titre": "T", "auteur": "A", "annee": 2024, "pages": 10, "mots_cles": ["x", "y"]}}
    intro = {"sections": {"these_centrale": {"content": "La thèse."}}}
    md = g("render_fiche_markdown")(structure, intro)
    assert md.startswith("# FICHE DE SYNTHÈSE DE THÈSE\n")
    assert "## Mots-clés\n\nx ; y" in md
    assert "## Thèse centrale\n\nLa thèse." in md
    assert md.count("*[Non renseigné]*") == len(g("GRILLE_HEADINGS")) - 1


def test_verify_citations_engine(tiny_parquet):
    from tools import verify_citations as vc
    pages = vc.load_pages(tiny_parquet)
    assert vc.locate("demande sociale pressante au dix-neuvième", pages) == [1]
    assert vc.locate("texte introuvable dans le parquet entier vraiment", pages) == []
    text = "« La métamorphose textuelle procède par standardisation » (p. 2) et *sans rapport qui remplit la page* (p. 1)."
    found = list(vc.anchors(text))
    # `anchors` yields the FULL cited page list (a range expands); 2026-10-07
    assert [(c, k) for c, _, k in found] == [([2], "quote"), ([1], "quote")]
    assert vc.norm("L’« éNergie » — test/ok") == "l energie test ok"


def test_c12_audit_flags_compound_bindings(tmp_path):
    from tools import c12_audit
    p = tmp_path / "f.md"
    p.write_text("- « première citation longue » et « seconde citation longue » (p. 4)\n"
                 "- « première citation longue » (p. 4) et « seconde citation longue » (p. 5)\n", encoding="utf-8")
    flagged, n = c12_audit.audit(str(p))
    assert n == 2 and len(flagged) == 1 and flagged[0][0] == 1


def test_trace_grounding_cited_pages():
    from tools import trace_grounding as tg
    assert tg.cited_pages("(p. 3), (pp. 10-12) et (pp. 100-200)") == [(3, 3), (10, 12), (100, 100)]


# ── note helpers ─────────────────────────────────────────────────────────────

def test_note_blob_and_toc_map(tiny_parquet, tmp_path):
    import note as an
    blob = an.build_blob(str(tiny_parquet))
    assert blob.startswith("[p.1]\nLe journalisme") and "[p.2]\n" in blob and "Page-footer" not in blob
    s = tmp_path / "s.json"
    s.write_text(json.dumps({"toc": [
        {"title": "Introduction", "level": 0, "page_start_parquet": 5, "page_end_parquet": 9},
        {"title": "1.1 Sous", "level": 1, "page_start_parquet": 6, "page_end_parquet": None},
        {"title": "2.1.1 Trop profond", "level": 2, "page_start_parquet": 7, "page_end_parquet": 7}]}))
    assert an.render_toc_map(s) == "- Introduction  [p.5]–[p.9]\n  - 1.1 Sous  [p.6]"
    assert an.render_toc_map(tmp_path / "missing.json") == ""


# ── step 2 / 3 helpers (extracted in the 2026-08-19 tidy pass) ──────────────

def test_build_parts_list_prefers_parts_then_chapters():
    toc = [{"title": "List of Figures", "role": "part", "page_start": None},
           {"title": "Première partie", "role": "part", "page_start": 20},
           {"title": "Chapitre 1", "role": "chapter", "page_start": 22}]
    assert g("build_parts_list")(toc) == "Les PARTIES de la thèse (issus de la table des matières) :\n  - Première partie"
    toc_stem = [{"title": "Chapter 2 Methods", "role": "chapter", "page_start": 30}]
    assert g("build_parts_list")(toc_stem).startswith("Les CHAPITRES de la thèse")
    assert g("build_parts_list")([]) == ""


def test_merge_abstract_delta_keeps_2b_for_unchanged_and_missing():
    md_2b = "## these_centrale\nA\n\n## questions_recherche\nB\n\n## hypotheses\n[NULL]\n"
    md_2c = "## these_centrale\n[INCHANGÉ]\n\n## questions_recherche\nB amélioré\n"
    content, md, n = g("merge_abstract_delta")(md_2b, md_2c)
    assert n == 1 and content["these_centrale"] == "A" and content["questions_recherche"] == "B amélioré"
    assert content["hypotheses"] is None and "## hypotheses\n\n[NULL]" in md
    assert md.startswith("## these_centrale\n\nA\n\n## questions_recherche\n\nB amélioré")


def test_mandatory_concepts_filter():
    fil = ("« culture textuelle » telle que définie (p. 3), reliant « auteur principal », « données », "
           "« une phrase beaucoup trop longue pour être un concept, vraiment trop longue pour passer » et « Culture textuelle »")
    assert g("mandatory_concepts")(fil) == "  - culture textuelle"
    assert g("mandatory_concepts")("[NULL]") == "  (aucun)"


def test_resolved_refs_filter():
    sec = {"candidate_refs": [{"resolved": True, "page_start_parquet": 3, "page_end_parquet": 9},
                              {"resolved": False, "page_start_parquet": None, "page_end_parquet": None},
                              {"resolved": True, "page_start_parquet": 0, "page_end_parquet": 4}]}
    assert len(g("resolved_refs")(sec)) == 1


def test_folio_offset_fallback():
    """printed-folio fallback: modal (parquet − printed) over bare numeric headers/footers."""
    folio_offset = g("folio_offset")
    rows = [{"page": p, "block_index": 0, "category": "Page-footer", "text": str(p - 20)} for p in range(21, 30)]
    rows += [{"page": 5, "block_index": 0, "category": "Page-footer", "text": "ii"},          # roman: ignored
             {"page": 40, "block_index": 0, "category": "Page-header", "text": "## 3.1 TITLE"}]  # not a folio
    assert folio_offset(pd.DataFrame(rows)) == 20
    too_few = pd.DataFrame(rows[:3])
    assert folio_offset(too_few) is None                   # < 5 agreeing folios → no guess


def test_compute_page_offset_uses_folio_only_when_anchor_fails():
    compute_page_offset = g("compute_page_offset")
    toc = [{"title": "1 Introduction", "level": 0, "page_start": 1}]
    folios = [{"page": p, "block_index": 0, "category": "Page-footer", "text": str(p - 20)} for p in range(21, 30)]
    no_heading = pd.DataFrame(folios + [{"page": 21, "block_index": 1, "category": "Text", "text": "Introduction"}])
    off = compute_page_offset(no_heading, toc)
    assert off["method"] == "printed-folio" and off["offset"] == 20 and off["intro_page_parquet"] == 21
    with_heading = pd.DataFrame(folios + [{"page": 23, "block_index": 1, "category": "Section-header", "text": "Introduction"}])
    off = compute_page_offset(with_heading, toc)
    assert off["method"] == "introduction-anchor" and off["offset"] == 22   # anchor wins even if folios disagree


# ── regressions from the demo-set audit, 2026-10-07 ──────────────────────────

def test_intro_anchor_is_not_stolen_by_an_embedded_article():
    """Failure mode 3: a French « Introduction générale » was rejected by an
    exact-line regex, so the scan ran on and anchored to the introduction of an
    embedded English paper 100 pages later (observed offsets 102 vs a true 5,
    and 36 vs a true 1)."""
    find_intro_parquet_page = g("find_intro_parquet_page")
    toc = [{"title": "INTRODUCTION GENERALE", "level": 0, "page_start": 7}]
    df = pd.DataFrame([
        {"page": 3, "block_index": 0, "category": "Page-header", "text": "TABLE DES MATIÈRES"},
        {"page": 12, "block_index": 0, "category": "Section-header", "text": "# Introduction générale"},
        {"page": 109, "block_index": 0, "category": "Section-header", "text": "## Introduction"},
    ])
    assert find_intro_parquet_page(df, toc) == 12          # not 109
    # a trailing colon must not disqualify it either (2022LYO10153)
    df2 = df.copy()
    df2.loc[df2["page"] == 12, "text"] = "## Introduction générale :"
    assert find_intro_parquet_page(df2, toc) == 12


def test_intro_anchor_prefers_section_header_over_running_page_header():
    """A running Page-header repeats on every page of the chapter, so it lands
    one or two pages late (2023TOU20042: offset 4 where the truth was 2)."""
    find_intro_parquet_page = g("find_intro_parquet_page")
    toc = [{"title": "INTRODUCTION GÉNÉRALE", "level": 0, "page_start": 13}]
    df = pd.DataFrame([
        {"page": 3, "block_index": 0, "category": "Page-header", "text": "TABLE DES MATIÈRES"},
        {"page": 15, "block_index": 0, "category": "Section-header", "text": "# INTRODUCTION GÉNÉRALE"},
        {"page": 17, "block_index": 0, "category": "Page-header", "text": "Introduction"},
    ])
    assert find_intro_parquet_page(df, toc) == 15          # not 17


def test_compute_page_offset_folio_overrides_a_catastrophic_anchor():
    """A small anchor/folio gap keeps the anchor (a late running header); a large
    one means the anchor is in the wrong chapter, so the folio vote wins."""
    compute_page_offset = g("compute_page_offset")
    toc = [{"title": "Introduction", "level": 0, "page_start": 7}]
    folios = [{"page": p, "block_index": 9, "category": "Page-footer", "text": str(p - 5)}
              for p in range(20, 30)]
    bad = pd.DataFrame(folios + [
        {"page": 109, "block_index": 0, "category": "Section-header", "text": "Introduction"}])
    off = compute_page_offset(bad, toc)
    assert off["method"] == "printed-folio-override"
    assert off["offset"] == 5 and off["anchor_offset"] == 102 and off["warning"]
    # within the tolerance band the anchor still wins, but the gap is recorded
    mild = pd.DataFrame(folios + [
        {"page": 14, "block_index": 0, "category": "Section-header", "text": "Introduction"}])
    off = compute_page_offset(mild, toc)
    assert off["method"] == "introduction-anchor" and off["offset"] == 7
    assert off["folio_offset"] == 5 and off["warning"]


def test_render_cleans_bullet_level_nulls():
    """parse_section_markdown only nulls a body that is entirely `[NULL]`, so
    `- **Cadre principal** : [NULL]` shipped verbatim in 2022LYO10153."""
    clean = g("_clean_inline_nulls")
    assert clean("- **Cadre principal** : [NULL]\n- **Cadres secondaires** : [NULL]") is None
    assert clean("- **A** : du contenu\n- **B** : [NULL]") == (
        "- **A** : du contenu\n- **B** : *[Non renseigné]*")
    assert clean("texte normal") == "texte normal"


def test_verify_citations_tail_does_not_cross_an_earlier_citation():
    """A long quote's tail was re-matched against the NEXT page tag: 3 of 9
    WRONG flags in the audit were this, not real citation errors."""
    from tools import verify_citations as vc
    text = ('Il écrit « une citation assez longue pour être retenue par le '
            'matcher ici » (p. 162). La section suivante (p. 182) développe.')
    kinds = {tuple(cited): kind for cited, _phrase, kind in vc.anchors(text)}
    assert kinds[(162,)] == "quote"
    # the p.182 tail must stop after "(p. 162)", not swallow the quote's tail
    tail = [ph for cited, ph, kind in vc.anchors(text) if cited == [182]][0]
    assert "citation assez longue" not in tail
    assert "section suivante" in tail


def test_verify_citations_honours_a_cited_page_range():
    """« … » (p. 21-23) with the quote on p.23 was reported WRONG because only
    the first number of the range was read (2023TOU20042)."""
    from tools import verify_citations as vc
    text = 'Il écrit « une citation bien assez longue pour le matcher » (p. 21-23).'
    cited, _phrase, kind = next(iter(vc.anchors(text)))
    assert cited == [21, 22, 23] and kind == "quote"


def test_repair_lost_latex_escapes():
    """$lpha$ / $rac{d}{dt}$ — LaTeX commands whose leading backslash was eaten
    as a Python string escape (\\a, \\f). Repair inside $…$ spans only."""
    from note.pipeline import repair_lost_latex_escapes as r
    assert r("le gain $lpha$ et $rac{d}{dt} X$")[0] == "le gain $\\alpha$ et $\\frac{d}{dt} X$"
    assert r("le gain $lpha$ et $rac{d}{dt} X$")[1] == 2
    assert r("prose: la rache, un rateau, l'etat, beta hors maths")[1] == 0   # no $…$ span
    assert r("$\\alpha$ deja correct")[1] == 0                                # idempotent
    assert r("$X_{\\omega}$ intact")[1] == 0


def test_conclusion_blob_takes_the_closing_conclusion_not_the_first():
    """Theses that end every chapter with a level-0 "Conclusion" handed step 2b
    a one-page chapter wrap-up from the first quarter (2024PA100032: p.74 of
    464; 2023TOU20042: pp.78-80 of 274)."""
    import pandas as pd
    from fiche.blobs import extract_conclusion_blob
    rows = [{"page": p, "block_index": 0, "category": "Text", "text": f"page {p}"}
            for p in range(1, 400)]
    df = pd.DataFrame(rows)
    structure = {"toc": [
        {"title": "Conclusion", "level": 0, "page_start_parquet": 74, "page_end_parquet": 74},
        {"title": "Conclusion", "level": 0, "page_start_parquet": 229, "page_end_parquet": 229},
        {"title": "Conclusion", "level": 0, "page_start_parquet": 380, "page_end_parquet": 389},
    ]}
    _blob, a, b = extract_conclusion_blob(df, structure)
    assert (a, b) == (380, 389)


def test_conclusion_blob_accepts_discussion_generale_and_merges_contiguous():
    """« DISCUSSION GENERALE » is the closing chapter in 2024PA100054 and the
    word "conclusion" appears nowhere, so 2b was skipped entirely. And in
    2022LYO10153 the closing movement is two contiguous entries."""
    import pandas as pd
    from fiche.blobs import extract_conclusion_blob, CONCLUSION_TITLE_RE
    df = pd.DataFrame([{"page": p, "block_index": 0, "category": "Text", "text": f"page {p}"}
                       for p in range(1, 220)])
    only_discussion = {"toc": [
        {"title": "PARTIE THÉORIQUE", "level": 0, "page_start_parquet": 14, "page_end_parquet": 14},
        {"title": "DISCUSSION GENERALE", "level": 0, "page_start_parquet": 189, "page_end_parquet": 205},
    ]}
    assert extract_conclusion_blob(df, only_discussion)[1:] == (189, 205)
    contiguous = {"toc": [
        {"title": "Discussion générale et perspectives", "level": 0,
         "page_start_parquet": 140, "page_end_parquet": 145},
        {"title": "Conclusion générale", "level": 0,
         "page_start_parquet": 146, "page_end_parquet": 147},
    ]}
    assert extract_conclusion_blob(df, contiguous)[1:] == (140, 147)
    # a mid-thesis chapter must NOT be mistaken for the conclusion
    assert not CONCLUSION_TITLE_RE.search("5. synthèse des objectifs de recherche")
    assert not CONCLUSION_TITLE_RE.search("perspectives de recherche")


def test_keyword_extraction_variants():
    """Mots-clés was empty on 4 of 10 demo fiches. Two of those were real
    extraction misses: the « Mots clefs » spelling (2023TOU20042) and the
    label-on-its-own-line layout (2024PA100054)."""
    k = g("extract_keywords_from_abstract")
    assert k("Mots clefs** : Erreur, concept, philosophie") == ["Erreur", "concept", "philosophie"]
    assert k("Keywords\nLSF, lexical database, familiarity") == ["LSF", "lexical database", "familiarity"]
    assert k("Keywords.**  Sign Language, late signers") == ["Sign Language", "late signers"]
    assert k("**Mots clés** : Générateurs distribués, contrôle distribué") == [
        "Générateurs distribués", "contrôle distribué"]
    assert k("Keywords: solidarity, blood donation; ethics") == [
        "solidarity", "blood donation", "ethics"]
    # a `.` separator must not harvest ordinary prose as keywords
    assert k("These keywords. The study then proceeds to examine the corpus") == []
    # French first, then English, deduplicated
    assert k("Mots clés : don, sang\nKeywords : don, gift") == ["don", "sang", "gift"]


def test_build_reasoning_parse_extracts_tolerates_marker_variants():
    """The note prompt asks for « ===== EXTRAIT [p.N] → [p.M] ===== » but the
    model does not always comply, and the Raisonnement view then reported
    "0 pages consulted" although the REPL had returned the text
    (2024LYO20081, 2024PA100032, 2024GRALY003)."""
    from tools.build_reasoning import parse_extracts as pe
    assert pe("===== EXTRAIT [p.10] → [p.12] =====") == [(10, 12)]
    assert pe("===== EXTRAIT [p.23] - Introduction =====") == [(23, 23)]
    assert pe("--- INTRODUCTION (p.13-24) ---") == [(13, 24)]
    assert pe("blob [p.5] text [p.6] more [p.5]") == [(5, 5), (6, 6)]
    # the canonical marker wins outright when present
    assert pe("===== EXTRAIT [p.1] → [p.2] ===== (p.90-99) [p.400]") == [(1, 2)]
    # a span that wide is a parse artefact, not a read
    assert pe("(p.1-900)") == []
    # a range inside PROSE is one of the model's own citations, not an extract.
    # Matching it inflated the hand-verified Bourse reference 112 -> 116 pages.
    assert pe("contextuels (tableaux de cotation) (p. 123-129). Au-delà de la collecte") == []
    # REPL output that is the drafted note echoed back means nothing was read
    assert pe("=== PARAGRAPHE 1 ===\nla thèse (p. 12-13) montre [p.44]") == []


def test_intro_anchor_ignores_a_back_matter_table_of_contents():
    """Some theses print their Table des matières at the END (2024ESMA0001,
    pp.136-138 of 141). The unbounded TOC-boundary scan then placed the
    boundary past the whole body, the introduction was never found, and the
    offset silently fell back to printed-folio."""
    find_intro_parquet_page = g("find_intro_parquet_page")
    toc = [{"title": "Introduction générale", "level": 0, "page_start": 1}]
    rows = [{"page": p, "block_index": 0, "category": "Text", "text": f"body {p}"}
            for p in range(1, 142)]
    rows += [
        {"page": 20, "block_index": 1, "category": "List-item", "text": "Chapitre 1 ........ 1"},
        {"page": 28, "block_index": 1, "category": "Section-header", "text": "# Introduction générale"},
        # the back-matter TOC: must not become the boundary
        {"page": 137, "block_index": 1, "category": "Page-header", "text": "Table des matières"},
    ]
    assert find_intro_parquet_page(pd.DataFrame(rows), toc) == 28


def test_apply_offset_to_toc_keeps_ranges_inside_the_document():
    """A back-matter entry on a thesis with a large offset landed outside the
    parquet: 2023LYO20128 (offset 30, 433 pages) put « Sitographie » at page 435
    and « Bibliographie » end at 434, so pages_to_blob returned nothing and the
    reading map linked to pages that do not exist."""
    apply_offset_to_toc = g("apply_offset_to_toc")
    toc = [{"page_start": 1, "page_end": 10},
           {"page_start": 394, "page_end": 404},
           {"page_start": 405, "page_end": 405}]
    out = apply_offset_to_toc([dict(e) for e in toc], 30, max_page=433)
    assert (out[0]["page_start_parquet"], out[0]["page_end_parquet"]) == (31, 40)
    assert (out[1]["page_start_parquet"], out[1]["page_end_parquet"]) == (424, 433)   # end clamped
    assert (out[2]["page_start_parquet"], out[2]["page_end_parquet"]) == (None, None)  # start outside
    # without max_page the legacy behaviour is unchanged
    legacy = apply_offset_to_toc([dict(e) for e in toc], 30)
    assert legacy[2]["page_start_parquet"] == 435
