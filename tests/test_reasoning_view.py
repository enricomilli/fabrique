"""
tools/build_reasoning.py on the shipped Bourse run: the contract's sections and the numbers
they carry (checked by hand against the run's trace, metadata and note).
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "scripts"))

from tools import build_reasoning as br  # noqa: E402


def test_bourse_contract():
    c = br.contract(br.build(REPO / "results" / "2027Bourse", "x.pdf"))
    assert c["schema"] == br.SCHEMA
    S = {s["id"]: s for s in c["sections"]}
    assert list(S) == ["header", "reading_map", "most_read", "never_opened", "kpis", "iterations", "iteration_bars"]
    for s in c["sections"]:
        assert {"id", "ui_label", "shows", "fields", "data"} <= set(s), s["id"]
    k = {i["key"]: i["raw"] for i in S["kpis"]["data"]["items"]}
    assert k["pages"] == {"consulted": 112, "total": 695}
    assert k["sections"] == {"touched": 12, "total": 23}
    assert k["extracts"] == {"extracts": 24, "citations_in_note": 33}
    assert k["iterations"]["iterations"] == 9
    its = S["iterations"]["data"]["items"]
    assert [i["kind"] for i in its] == ["lecture"] * 3 + ["rédaction", "lecture", "rédaction", "lecture", "rédaction", "assemblage"]
    it3 = its[2]
    assert [r.get("page") or r.get("text") for r in it3["gesture"]["readings"]] == \
        [134, 612, 81, "word2vec", "conditions d'acceptabilité", "29 janvier 1838"]
    assert [(x["page_start"], x["page_end"]) for x in it3["feedback"]["extracts"]] == [(134, 137), (612, 615), (81, 83)]
    assert [x["title"] for x in S["never_opened"]["data"]["items"]][:2] == ["Préambule Méthodologique", "1 Reconnaissance textuelle"]


def test_daley_uses_subsections_and_flags_the_repl_error():
    c = br.contract(br.build(REPO / "results" / "daley_thesis", "x.pdf"))
    S = {s["id"]: s["data"] for s in c["sections"]}
    assert S["reading_map"]["granularity"] == "chapitres et sous-sections"     # only 6 top-level entries
    errors = [(i["n"], i["feedback"]["error"]) for i in S["iterations"]["items"] if i["feedback"]["error"]]
    assert errors == [(5, "NameError: name 'pos_p116' is not defined. Did you mean: 'pos_p110'?")]
    assert [i["intention"]["language"] for i in S["iterations"]["items"]][3] == "fr"
