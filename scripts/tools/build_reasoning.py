#!/usr/bin/env python3
"""
build_reasoning.py — the "Raisonnement" view of a note run: what the RLM read, why, and when.

    python3 scripts/tools/build_reasoning.py --thesis-dir results/2027Bourse
    → explorer/2027Bourse/reasoning.json   the UI contract (explorer/README.md): one entry per page
                                           section, each with ui_label, shows, fields, data
    → explorer/2027Bourse/reasoning.html   a standalone mockup that renders only that JSON

Reads the run's own files, nothing else (no LLM, fully deterministic):
  fiche_steps/1_structure.json     sections = TOC entries with parquet page ranges
  note_runs/latest/trace/*.json    per turn: seconds, reasoning (= intention), code (= gesture),
                                   next turn's REPL output (= feedback: "===== EXTRAIT [p.N] → [p.M]")
  note_runs/latest/metadata.json   iterations, seconds, words;   note.md: citations

Rules: pages consulted = union of the extract ranges; kind = assemblage if the code calls FINAL,
lecture if it searches the thesis, rédaction otherwise; the reading map uses top-level TOC entries,
or level-1 subsections when there are fewer than 10 top-level entries.
"""
import argparse
import html
import json
import os
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from layout import ThesisLayout   # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
PDF_PAGE_OFFSETS = {"2024LORR0201": 1}   # PDF page = parquet page + offset (extra cover page)

EXTRACT_RE = re.compile(r"=====\s*EXTRAIT\s*\[p\.(\d+)\]\s*→\s*\[p\.(\d+)\]")
JUMP_RE = re.compile(r'find\(\s*["\']\[p\.(\d+)\]')
PHRASE_RE = re.compile(r'find\(\s*(["\'])(?!\[p\.)(.+?)(?<!\\)\1')
PARA_RE = re.compile(r'^\s*(\w+)\s*=\s*f?(?:"""|\'\'\')(.*?)(?:"""|\'\'\')', re.S | re.M)
CITE_RE = re.compile(r"\(pp?\.\s*\d+")
NOT_SECTION = re.compile(r"^(table des|index|annexe|bibliograph|sommaire|r[ée]sum[ée]|abstract|remerciement|acknowledg|liste des|list of)", re.I)


def sse(raw: str, key: str) -> str:
    out = []
    for line in raw.splitlines():
        if not line.startswith("data:") or "[DONE]" in line:
            continue
        try:
            chunk = json.loads(line[5:])
        except ValueError:
            continue
        for c in chunk.get("choices") or []:
            out.append((c.get("delta") or {}).get(key) or "")
    return "".join(out)


def build(thesis_dir: pathlib.Path, pdf: str, granularity="auto") -> dict:
    lay = ThesisLayout(thesis_dir)
    structure = json.loads(lay.structure.read_text(encoding="utf-8"))
    run = lay.latest_note_run.resolve()
    meta = json.loads((run / "metadata.json").read_text(encoding="utf-8"))
    note = (run / "note.md").read_text(encoding="utf-8")
    toc = [e for e in structure["toc"] if isinstance(e.get("page_start_parquet"), int)]

    def section_at(p: int) -> str:
        hits = [e for e in toc if e["page_start_parquet"] <= p <= (e.get("page_end_parquet") or e["page_start_parquet"])]
        return max(hits, key=lambda e: e["level"])["title"] if hits else f"p.{p}"

    files = sorted((run / "trace").glob("*_root.json"))
    traces = [json.loads(f.read_text(encoding="utf-8")) for f in files]
    iterations, consulted = [], set()
    for i, t in enumerate(traces):
        content = sse(t.get("response_raw", ""), "content")
        reasoning = sse(t.get("response_raw", ""), "reasoning_content").strip()
        code = "\n\n".join(re.findall(r"```python\n(.*?)```", content, re.S)).strip()
        nxt = str(traces[i + 1]["request"]["messages"][-1]["content"]) if i + 1 < len(traces) else ""
        extracts = [(int(a), int(b)) for a, b in EXTRACT_RE.findall(nxt)]
        for a, b in extracts:
            consulted.update(range(a, b + 1))
        jumps = [int(p) for p in JUMP_RE.findall(code)]
        phrases = [m.group(2) for m in PHRASE_RE.finditer(code)]
        paras = [(name, len(body.split())) for name, body in PARA_RE.findall(code)]
        kind = "assemblage" if "FINAL" in code else ("lecture" if jumps or phrases else "rédaction")
        err = re.search(r"^\w*(?:Error|Exception)\b.*$", nxt, re.M) if "Traceback" in nxt else None
        lang = "fr" if len(re.findall(r"\b(je|les|des|une|pour|maintenant|paragraphes?|extraits?)\b", reasoning, re.I)) > \
                       len(re.findall(r"\b(I|the|and|now|need|let|paragraphs?|extracts?)\b", reasoning)) else "en"
        first = ""
        for sent in re.split(r"(?<=[.!?])\s+|\n+", reasoning):   # whole sentences, about 200 chars
            if first and len(first) + len(sent) > 200:
                break
            first = (first + " " + sent).strip()
            if sent.rstrip().endswith(":"):
                break
        iterations.append({
            "n": i + 1, "kind": kind, "elapsed": t.get("elapsed_s"),
            "intention_head": first, "intention": reasoning,
            "jumps": [{"page": p, "title": section_at(p)} for p in jumps],
            "phrases": phrases, "paras": paras, "code": code,
            "extracts": extracts, "error": err.group(0).strip() if err else None, "lang": lang,
        })

    total_pages = int(structure.get("parquet_pages") or structure["metadata"].get("pages"))
    level0 = [e for e in toc if e["level"] == 0]
    if granularity == 0 or (granularity == "auto" and len(level0) >= 10):
        units = level0
    else:   # depth<=1 leaves: a chapter is replaced by its level-1 sections when it has some
        units = []
        for k, e in enumerate(toc):
            if e["level"] > 1:
                continue
            nxt = toc[k + 1] if k + 1 < len(toc) else None
            if e["level"] == 0 and nxt is not None and nxt["level"] == 1:
                head = nxt["page_start_parquet"] - 1          # chapter's own opening pages before 1.1
                if head >= e["page_start_parquet"]:
                    units.append(dict(e, page_end_parquet=head))
                continue
            units.append(e)
    sections = []
    for e in units:
        a, b = e["page_start_parquet"], e.get("page_end_parquet") or e["page_start_parquet"]
        span = b - a + 1
        read = len([p for p in consulted if a <= p <= b])
        sections.append({"title": e["title"], "level": e["level"], "start": a, "end": b, "span": span, "read": read,
                         "share": round(read / span, 3), "role": e.get("role"),
                         "content": not NOT_SECTION.match(e["title"])})
    md = structure["metadata"]
    return {
        "thesis": thesis_dir.name, "pdf": pdf, "run_id": run.name,
        "author": md.get("auteur"), "year": md.get("annee"),
        "title": re.sub(r"\*", "", (md.get("titre") or "")).strip(),
        "total_pages": total_pages, "consulted": len(consulted),
        "sections": sections,
        "n_extracts": sum(len(it["extracts"]) for it in iterations),
        "n_citations": len(CITE_RE.findall(note)),
        "n_iterations": meta.get("iterations") or len(iterations),
        "seconds": meta.get("rlm_time_s") or meta.get("wall_time_s"),
        "words": meta.get("note_word_count"),
        "iterations": iterations,
    }


SCHEMA = "explorer_v2.reasoning/1"


def contract(r: dict, pdf_page_offset: int = 0) -> dict:
    """Reshape build()'s output into the UI contract: page sections in display order,
    each self-described. Every text a UI would show is precomputed here; the
    structured parts stay alongside so a UI can lay them out differently."""
    pdf_page = lambda p: p + pdf_page_offset           # parquet page → PDF page
    secs = r["sections"]
    content = [x for x in secs if x["content"]]
    sized = [x for x in content if x["read"] and x["span"] >= 5]
    pool = sized if len(sized) >= 3 else [x for x in content if x["read"]]
    most = sorted(pool, key=lambda x: (-x["share"], -x["read"]))[:5]
    never = [x for x in content if not x["read"]]
    touched = sum(1 for x in secs if x["read"])
    finer = any(x["level"] == 1 for x in secs)

    def tick(t):
        m = re.match(r"^(?:chap(?:ter|itre)\s*)?(\d+(?:\.\d+)?)\b", t, re.I)
        return m.group(1) if m else None

    def gesture_summary(it):
        if it["kind"] == "assemblage":
            return "Assemble la note et appelle FINAL()."
        if it["kind"] == "rédaction":
            return ("Rédige " + ", ".join(f"{n} ({w} mots)" for n, w in it["paras"]) + ".") if it["paras"] else "Rédige dans le REPL."
        parts = [f"{j['title']} (p.{j['page']})" for j in it["jumps"]] + [f"recherche « {x} »" for x in it["phrases"]]
        return f"Lit {len(parts)} passage{'s' if len(parts) > 1 else ''} : " + " · ".join(parts)

    surname = (r["author"] or "").split(" ")[-1]
    return {
        "schema": SCHEMA,
        "about": ("One entry per section of the 'Raisonnement' page, in display order. Each section has: "
                  "id (stable key), ui_label (heading as shown in the mockup), shows (what the section "
                  "displays and how), fields (meaning and unit of each data field), data. Pages are parquet "
                  "pages unless a field says pdf_page. Texts in data are display-ready (French UI); "
                  "structured fields next to them allow another layout."),
        "source": {"thesis_id": r["thesis"], "run_id": r["run_id"], "pdf_file": r["pdf"],
                   "pdf_page_offset": pdf_page_offset, "generator": "scripts/tools/build_reasoning.py"},
        "sections": [
            {
                "id": "header",
                "ui_label": "Barre du haut",
                "shows": "Product name, the document label, and the view tabs (this page is the 'Raisonnement' tab).",
                "fields": {"doc_label": "author surname + year + title, as displayed",
                           "tabs": "view tabs in order; active = this page"},
                "data": {
                    "brand": "Fabrique",
                    "doc_label": f"{surname} {r['year']} — {r['title']}",
                    "author": r["author"], "year": r["year"], "title": r["title"],
                    "tabs": [{"label": t, "active": t == "Raisonnement"}
                             for t in ("Vue note", "Vue fiche", "Raisonnement", "Sources", "Exporter")],
                },
            },
            {
                "id": "reading_map",
                "ui_label": "Carte de lecture",
                "shows": ("A horizontal band, one block per thesis section in document order. Block width "
                          "∝ pages (field pages); filled height = share_read. Hover: title + pages read. "
                          "Click: open the PDF at pdf_page. Axis labels = tick_label (may be null)."),
                "fields": {
                    "granularity": "'chapitres' = top-level TOC entries; 'chapitres et sous-sections' = level-1 "
                                   "subsections (used when the TOC has < 10 top-level entries)",
                    "sections[].pages": "page count of the section (block width)",
                    "sections[].pages_read": "pages of the section the model received as extracts",
                    "sections[].share_read": "pages_read / pages, 0–1 (block fill)",
                    "sections[].is_content": "false for front/back matter (bibliography, index, …); "
                                             "drawn on the band but excluded from the two lists",
                    "sections[].pdf_page": "page to open in the PDF on click",
                },
                "data": {
                    "subtitle": (f"par {'chapitres et sous-sections' if finer else 'sections'} de la table des "
                                 f"matières · {len(secs)} entrées · {r['consulted']} pages consultées sur {r['total_pages']}"),
                    "granularity": "chapitres et sous-sections" if finer else "chapitres",
                    "legend": {"read": "part consultée de la section", "unread": "non consultée",
                               "hint": "largeur ∝ pagination · cliquer une section ouvre le PDF à sa première page"},
                    "sections": [{"title": x["title"], "level": x["level"], "page_start": x["start"],
                                  "page_end": x["end"], "pages": x["span"], "pages_read": x["read"],
                                  "share_read": x["share"], "tick_label": tick(x["title"]),
                                  "is_content": x["content"], "pdf_page": pdf_page(x["start"])} for x in secs],
                },
            },
            {
                "id": "most_read",
                "ui_label": "Sections les plus lues",
                "shows": "Up to 5 sections, highest share_read first. Each row: title, then percentage and pages read.",
                "fields": {"rule": "content sections with ≥ 5 pages ranked by share_read (all read sections if "
                                   "fewer than 3 qualify), so a 1-page opening read in full does not top the list"},
                "data": {"items": [{"title": x["title"], "share_read": x["share"], "pages_read": x["read"],
                                    "display_value": f"{round(x['share'] * 100)} % · {x['read']} p."} for x in most]},
            },
            {
                "id": "never_opened",
                "ui_label": f"Jamais ouvertes — {len(never)} section{'s' if len(never) != 1 else ''}",
                "shows": "Content sections from which the model received no extract. Each row: title and first page.",
                "fields": {"items[].pdf_page": "page to open in the PDF on click"},
                "data": {"count": len(never),
                         "empty_message": "Toutes les sections ont été ouvertes.",
                         "items": [{"title": x["title"], "page_start": x["start"], "pdf_page": pdf_page(x["start"])} for x in never]},
            },
            {
                "id": "kpis",
                "ui_label": "Chiffres clés",
                "shows": "A row of 4 tiles: a large value and a caption under it.",
                "fields": {"items[].key": "stable id of the tile", "items[].value": "large text",
                           "items[].caption": "small text under the value", "items[].raw": "the numbers behind it"},
                "data": {"items": [
                    {"key": "pages", "value": f"{r['consulted']} / {r['total_pages']}", "caption": "pages consultées",
                     "raw": {"consulted": r["consulted"], "total": r["total_pages"]}},
                    {"key": "sections", "value": f"{touched} / {len(secs)}", "caption": "sections touchées",
                     "raw": {"touched": touched, "total": len(secs)}},
                    {"key": "extracts", "value": str(r["n_extracts"]), "caption": f"extraits · {r['n_citations']} citations",
                     "raw": {"extracts": r["n_extracts"], "citations_in_note": r["n_citations"]}},
                    {"key": "iterations", "value": str(r["n_iterations"]),
                     "caption": f"itérations · {round(r['seconds'])} s · {r['words']} mots",
                     "raw": {"iterations": r["n_iterations"], "seconds": r["seconds"], "note_words": r["words"]}},
                ]},
            },
            {
                "id": "iterations",
                "ui_label": "Itérations",
                "shows": ("One card per RLM turn, in order. Header: 'Itération n · seconds' + kind tag. Three blocks: "
                          "INTENTION (headline, full reasoning behind an expander, language note), GESTE "
                          "(summary sentence, code behind 'voir le code'), RETOUR (extract chips that open the PDF, "
                          "or an error line, or empty_message). selected_by_default marks the card to highlight on load."),
                "fields": {
                    "kind": "lecture (code reads the thesis) | rédaction (code writes paragraphs) | assemblage (code calls FINAL)",
                    "intention.headline": "first sentences of the model's reasoning, ≤ ~200 chars",
                    "intention.full": "complete reasoning (thinking) of that turn",
                    "intention.language": "'en' | 'fr' — the model's own language for that turn",
                    "gesture.readings": "what the code read: page_jump (to a [p.N] marker, resolved to the TOC title) "
                                        "or phrase_search (text searched)",
                    "gesture.drafts": "paragraph variables the code wrote, with word counts",
                    "feedback.extracts": "page ranges the REPL returned to the model (parquet pages + pdf_page)",
                    "feedback.error": "last error line if the code crashed, else null",
                },
                "data": {"items": [{
                    "n": it["n"], "kind": it["kind"], "seconds": it["elapsed"],
                    "header_label": f"Itération {it['n']} · {str(round(it['elapsed'], 1)).replace('.', ',')} s",
                    "selected_by_default": it["n"] == next((i["n"] for i in r["iterations"] if i["kind"] == "lecture" and i["n"] > 1), 1),
                    "intention": {"headline": it["intention_head"], "full": it["intention"], "language": it["lang"],
                                  "language_note": f"raisonnement du modèle, en {'français' if it['lang'] == 'fr' else 'anglais'}"},
                    "gesture": {"summary": gesture_summary(it),
                                "readings": [{"type": "page_jump", "page": j["page"], "section_title": j["title"],
                                              "pdf_page": pdf_page(j["page"])} for j in it["jumps"]]
                                            + [{"type": "phrase_search", "text": x} for x in it["phrases"]],
                                "drafts": [{"variable": n, "words": w} for n, w in it["paras"]],
                                "code": it["code"]},
                    "feedback": {"extracts": [{"page_start": a, "page_end": b, "label": f"p. {a}–{b}", "pdf_page": pdf_page(a)}
                                              for a, b in it["extracts"]],
                                 "error": it["error"],
                                 "empty_message": None if it["extracts"] else (
                                     "La note finale (rlm-cli la renvoie sur stdout)." if it["kind"] == "assemblage"
                                     else "Aucun extrait : le REPL confirme les paragraphes écrits.")},
                } for it in r["iterations"]]},
            },
            {
                "id": "iteration_bars",
                "ui_label": f"Les {len(r['iterations'])} itérations",
                "shows": ("A compact list: one row per iteration with its number, a bar ∝ seconds (scale to max_seconds), "
                          "the seconds and the kind. Clicking a row selects and scrolls to its card in 'iterations'."),
                "fields": {"max_seconds": "longest iteration, for the bar scale"},
                "data": {"max_seconds": max(i["elapsed"] for i in r["iterations"]),
                         "caption": ("Chaque itération est un événement : une intention (le raisonnement du modèle), "
                                     "un geste (ce que son code fait), un retour (les extraits que le REPL lui renvoie). "
                                     "Cliquer une barre ouvre sa carte."),
                         "items": [{"n": i["n"], "seconds": i["elapsed"], "kind": i["kind"]} for i in r["iterations"]]},
            },
        ],
    }


PAGE = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: app bar, then a reading map (section band + two lists), a KPI row, and a two-column
   iteration timeline (cards left, duration bars right). */
:root {
  --bg: #efeee9; --panel: #f8f7f3; --ink: #1d1f23; --mute: #6c6f76; --line: #d9d7cf;
  --read: #2f4a8a; --unread: #e3e1da; --ochre: #c9a45e; --ochre-deep: #7e5c1d; --ochre-soft: #f4ead6;
  --serif: "Spectral", Georgia, serif; --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17181b; --panel: #1f2125; --ink: #e8e6df; --mute: #9a9da4; --line: #33363c;
    --read: #7f9ce0; --unread: #2a2d33; --ochre: #c9a45e; --ochre-deep: #e2bf78; --ochre-soft: #2b2518; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #17181b; --panel: #1f2125; --ink: #e8e6df; --mute: #9a9da4; --line: #33363c;
  --read: #7f9ce0; --unread: #2a2d33; --ochre: #c9a45e; --ochre-deep: #e2bf78; --ochre-soft: #2b2518; color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 var(--sans); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 14px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { font-weight: 600; display: flex; gap: 8px; align-items: center; }
.brand::before { content: ""; width: 10px; height: 10px; background: var(--ink); transform: rotate(45deg); }
.doc { color: var(--mute); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tabs span { font-size: 13px; padding: 6px 14px; border: 1px solid var(--line); background: var(--panel); color: var(--mute); }
.tabs .on { border-color: var(--ochre); background: var(--ochre-soft); color: var(--ochre-deep); font-weight: 500; }
main { max-width: 1180px; margin: 0 auto; padding-inline: 24px; padding-block: 28px 64px; }
h1 { font: 500 30px/1.2 var(--serif); margin: 0; display: inline; }
.sub { font: 13px var(--mono); color: var(--mute); margin-left: 14px; }
.label { font: 500 11.5px var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
.panel { background: var(--panel); border: 1px solid var(--line); }

/* section band */
.band { display: flex; height: 112px; margin-top: 18px; border: 1px solid var(--line); background: var(--panel); }
.sec { position: relative; border-right: 1px solid var(--line); background: var(--unread); cursor: pointer; min-width: 3px; }
.sec:last-child { border-right: 0; }
.sec .fill { position: absolute; left: 6%; right: 6%; bottom: 0; background: var(--read); }
.sec:hover, .sec:focus-visible { outline: 2px solid var(--ochre); outline-offset: -2px; z-index: 1; }
.ticks { display: flex; height: 22px; font: 11px var(--mono); color: var(--mute); }
.ticks div { text-align: center; overflow: hidden; }
.legend { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--mute); margin-top: 4px; }
.legend i { display: inline-block; width: 11px; height: 11px; margin-right: 6px; vertical-align: -1px; }
.tip { font: 12px var(--mono); color: var(--ink); min-height: 18px; margin-top: 6px; }

.lists { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
.lists .panel { padding: 18px 22px; min-width: 0; }
.lists ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.lists li { display: flex; justify-content: space-between; gap: 12px; }
.lists li b { font: 500 13px var(--mono); color: var(--read); white-space: nowrap; }
.lists li a { color: inherit; text-decoration: none; }
.lists li a:hover { text-decoration: underline; }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 22px; }
.kpis > div { padding: 18px 22px; border-right: 1px solid var(--line); }
.kpis > div:last-child { border-right: 0; }
.kpis strong { display: block; font: 600 30px/1.1 var(--sans); font-variant-numeric: tabular-nums; }
.kpis span { color: var(--mute); font-size: 14px; }

.timeline { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; margin-top: 26px; align-items: start; }
.cards { display: grid; gap: 14px; }
.card { background: var(--panel); border: 1px solid var(--line); padding: 16px 22px 18px; scroll-margin-top: 16px; }
.card.sel { border-color: var(--ochre); box-shadow: 0 0 0 1px var(--ochre); }
.card header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.card header .label { color: var(--ochre-deep); }
.kind { font: 12px var(--mono); color: var(--mute); }
.part { border-left: 3px solid var(--ochre); background: color-mix(in srgb, var(--unread) 55%, var(--panel)); padding: 10px 16px; margin-top: 10px; }
.part.ret { border-left-color: var(--read); }
.part .label { color: var(--ochre-deep); font-size: 11px; }
.part.ret .label { color: var(--read); }
.intent { font: 400 17px/1.55 var(--serif); margin: 6px 0 0; }
.lang { font: 11px var(--mono); color: var(--mute); margin-left: 8px; }
details { margin-top: 8px; }
summary { cursor: pointer; font: 12px var(--mono); color: var(--mute); }
details pre { white-space: pre-wrap; word-break: break-word; font: 12.5px/1.5 var(--mono); background: var(--panel); border: 1px solid var(--line); padding: 10px 12px; max-height: 360px; overflow: auto; }
.geste { margin: 6px 0 0; }
.geste em { font-style: normal; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
.chip { font: 12px var(--mono); color: var(--read); border: 1px solid var(--read); border-radius: 999px; padding: 2px 10px; text-decoration: none; }
.chip:hover { background: var(--read); color: var(--panel); }
.empty { color: var(--mute); font-size: 14px; }
.err { margin: 6px 0 2px; font-size: 14px; color: #b3422b; }
.err code { font: 12.5px var(--mono); }

.durs { padding: 14px 18px; position: sticky; top: 16px; }
.dur { display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: center; padding: 6px 0; cursor: pointer; background: none; border: 0; width: 100%; color: inherit; font: inherit; text-align: left; }
.dur .num { font: 12px var(--mono); color: var(--mute); }
.dur .track { display: flex; align-items: center; gap: 8px; }
.dur .b { height: 7px; background: var(--ochre); }
.dur .v { font: 12px var(--mono); color: var(--mute); font-variant-numeric: tabular-nums; }
.dur .k { font: 10.5px var(--mono); color: var(--mute); margin-left: auto; }
.dur.sel .num { color: var(--ink); font-weight: 600; }
.dur.sel .b { background: var(--ochre-deep); }
.dur:focus-visible { outline: 2px solid var(--ochre); }
.note { color: var(--mute); font-size: 13px; margin-top: 10px; }
.mock { font: 11px var(--mono); color: var(--mute); text-align: right; margin-top: 30px; }
@media (max-width: 860px) {
  .lists, .timeline { grid-template-columns: 1fr; }
  .kpis { grid-template-columns: 1fr 1fr; }
  .kpis > div:nth-child(2) { border-right: 0; }
  .durs { position: static; }
}
@media (prefers-reduced-motion: no-preference) { .card { transition: box-shadow .15s, border-color .15s; } }
</style>
</head>
<body>
<div class="bar">
  <div class="brand">Fabrique</div>
  <div class="doc" id="doc"></div>
  <nav class="tabs" aria-label="Vues"></nav>
</div>
<main>
  <section>
    <h1>Carte de lecture</h1><span class="sub" id="mapsub"></span>
    <div class="band" id="band" role="list"></div>
    <div class="ticks" id="ticks"></div>
    <div class="legend">
      <span><i style="background:var(--read)"></i><span id="legend-read"></span> &nbsp; <i style="background:var(--unread);border:1px solid var(--line)"></i><span id="legend-unread"></span></span>
      <span style="font-family:var(--mono);font-size:12px" id="legend-hint"></span>
    </div>
    <div class="tip" id="tip" aria-live="polite"></div>
  </section>

  <div class="lists">
    <div class="panel"><div class="label" id="toptitle"></div><ul id="top"></ul></div>
    <div class="panel"><div class="label" id="nevertitle"></div><ul id="never"></ul></div>
  </div>

  <div class="kpis panel" id="kpis"></div>

  <div class="timeline">
    <div class="cards" id="cards"></div>
    <aside>
      <div class="label" id="durtitle" style="margin-bottom:8px"></div>
      <div class="panel durs" id="durs"></div>
      <p class="note" id="durcap"></p>
    </aside>
  </div>
  <div class="mock" id="mock"></div>
</main>
<script>
const C = __DATA__;                                   // the contract: C.sections[] keyed by id
const S = Object.fromEntries(C.sections.map(x => [x.id, x.data]));
const L = Object.fromEntries(C.sections.map(x => [x.id, x.ui_label]));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pdfAt = p => `${C.source.pdf_file}#page=${p}`;
const pct = x => Math.round(x * 100) + " %";

// header
$("doc").textContent = S.header.doc_label;
document.querySelector(".tabs").innerHTML = S.header.tabs.map(t => `<span class="${t.active ? "on" : ""}">${esc(t.label)}</span>`).join("");

// reading_map
const M = S.reading_map, secs = M.sections;
$("mapsub").textContent = M.subtitle;
$("band").innerHTML = secs.map((s, i) => `<div class="sec" role="listitem" tabindex="0" data-i="${i}" style="flex:${s.pages} 0 0"
  aria-label="${esc(s.title)} — pages ${s.page_start} à ${s.page_end}, ${s.pages_read} lues">
  <div class="fill" style="height:${(s.share_read * 100).toFixed(1)}%"></div></div>`).join("");
const total = secs.reduce((a, s) => a + s.pages, 0);
$("ticks").innerHTML = secs.map(s => `<div style="flex:${s.pages} 0 0" title="${esc(s.title)}">${s.pages / total > 0.015 && s.tick_label ? s.tick_label : ""}</div>`).join("");
document.querySelectorAll(".sec").forEach(el => {
  const s = secs[+el.dataset.i];
  const show = () => $("tip").textContent = `${s.title} · p. ${s.page_start}–${s.page_end} · ${s.pages_read}/${s.pages} pages lues (${pct(s.share_read)})`;
  el.addEventListener("mouseenter", show); el.addEventListener("focus", show);
  const open = () => window.open(pdfAt(s.pdf_page), "_blank");
  el.addEventListener("click", open);
  el.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
});
$("legend-read").textContent = M.legend.read; $("legend-unread").textContent = M.legend.unread; $("legend-hint").textContent = M.legend.hint;

// most_read / never_opened
$("toptitle").textContent = L.most_read;
$("top").innerHTML = S.most_read.items.map(s => `<li><span>${esc(s.title)}</span><b>${esc(s.display_value)}</b></li>`).join("");
$("nevertitle").textContent = L.never_opened;
$("never").innerHTML = S.never_opened.items.map(s => `<li><a href="${pdfAt(s.pdf_page)}" target="_blank" rel="noopener">${esc(s.title)}</a><b style="color:var(--mute)">p. ${s.page_start}</b></li>`).join("")
  || `<li class="empty">${esc(S.never_opened.empty_message)}</li>`;

// kpis
$("kpis").innerHTML = S.kpis.items.map(k => `<div data-key="${k.key}"><strong>${esc(k.value)}</strong><span>${esc(k.caption)}</span></div>`).join("");

// iterations
const IT = S.iterations.items;
$("cards").innerHTML = IT.map(it => {
  const g = it.gesture, f = it.feedback, i = it.intention;
  return `
  <article class="card" id="it${it.n}" aria-labelledby="h${it.n}">
    <header><span class="label" id="h${it.n}">${esc(it.header_label)}</span><span class="kind">${it.kind}</span></header>
    <div class="part"><div class="label">Intention<span class="lang">${esc(i.language_note)}</span></div>
      <p class="intent">${esc(i.headline)}</p>
      ${i.full.length > i.headline.length + 2 ? `<details><summary>raisonnement complet · ${i.full.length} caractères</summary><pre>${esc(i.full)}</pre></details>` : ""}</div>
    <div class="part"><div class="label">Geste</div><p class="geste">${esc(g.summary)}</p>
      ${g.code ? `<details><summary>voir le code</summary><pre>${esc(g.code)}</pre></details>` : ""}</div>
    <div class="part ret"><div class="label">Retour</div>
      ${f.error ? `<p class="err">Le code s'arrête sur une erreur : <code>${esc(f.error)}</code></p>` : ""}
      ${f.extracts.length
        ? `<div class="chips">${f.extracts.length} extrait${f.extracts.length > 1 ? "s" : ""} ${f.extracts.map(x => `<a class="chip" href="${pdfAt(x.pdf_page)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("")}</div>`
        : `<p class="empty" style="margin:6px 0 0">${esc(f.empty_message)}</p>`}
    </div>
  </article>`; }).join("");

// iteration_bars
const B = S.iteration_bars;
$("durtitle").textContent = L.iteration_bars;
$("durcap").textContent = B.caption;
$("durs").innerHTML = B.items.map(b => `<button class="dur" data-n="${b.n}" aria-label="Itération ${b.n}, ${b.kind}, ${b.seconds} secondes">
  <span class="num">${b.n}</span><span class="track"><span class="b" style="width:${(b.seconds / B.max_seconds * 70).toFixed(1)}%"></span><span class="v">${String(b.seconds.toFixed(1)).replace(".", ",")}</span><span class="k">${b.kind}</span></span></button>`).join("");
function select(n, scroll) {
  document.querySelectorAll(".card").forEach(c => c.classList.toggle("sel", c.id === "it" + n));
  document.querySelectorAll(".dur").forEach(b => b.classList.toggle("sel", +b.dataset.n === n));
  if (scroll) $("it" + n).scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
document.querySelectorAll(".dur").forEach(b => b.addEventListener("click", () => select(+b.dataset.n, true)));
select((IT.find(i => i.selected_by_default) || IT[0]).n, false);
$("mock").textContent = `maquette · run ${C.source.thesis_id}/${C.source.run_id} · ${C.schema} · généré par ${C.source.generator}`;
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description="Build the 'Raisonnement' view (JSON contract + HTML mockup) of a note run.")
    ap.add_argument("--thesis-dir", required=True, type=pathlib.Path, help="results/<thesis> (fiche_steps/ + note_runs/)")
    ap.add_argument("--out-dir", type=pathlib.Path, default=None, help="default: explorer/<thesis>/")
    ap.add_argument("--pdf", type=pathlib.Path, default=None, help="thesis PDF (default: data/pdf/<thesis>.pdf)")
    ap.add_argument("--pdf-page-offset", type=int, default=None,
                    help="PDF page = parquet page + offset (default: 1 for 2024LORR0201, else 0)")
    ap.add_argument("--granularity", default="auto", choices=["auto", "0", "1"],
                    help="reading-map sections: TOC level 0, level<=1, or auto (level 1 when < 10 top-level entries)")
    a = ap.parse_args()
    thesis = a.thesis_dir.resolve().name
    out_dir = a.out_dir or REPO / "explorer" / thesis
    pdf = a.pdf or REPO / "data" / "pdf" / f"{thesis}.pdf"
    offset = a.pdf_page_offset if a.pdf_page_offset is not None else PDF_PAGE_OFFSETS.get(thesis, 0)
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_link = os.path.relpath(pdf.resolve(), out_dir.resolve())     # links keep working if the repo moves
    raw = build(a.thesis_dir, pdf_link, a.granularity if a.granularity == "auto" else int(a.granularity))
    c = contract(raw, offset)
    (out_dir / "reasoning.json").write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js = json.dumps(c, ensure_ascii=False).replace("</", "<\\/")
    (out_dir / "reasoning.html").write_text(
        PAGE.replace("__TITLE__", html.escape(f"Raisonnement — {thesis}")).replace("__DATA__", js), encoding="utf-8")
    print(f"wrote {out_dir}/reasoning.json + reasoning.html  ({raw['n_iterations']} iterations, "
          f"{raw['consulted']}/{raw['total_pages']} pages, {sum(1 for x in raw['sections'] if x['read'])}/{len(raw['sections'])} sections)")


if __name__ == "__main__":
    main()
