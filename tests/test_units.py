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
    assert [(c, k) for c, _, k in found] == [(2, "quote"), (1, "quote")]
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
