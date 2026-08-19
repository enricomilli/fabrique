"""
fiche/pipeline.py — orchestration + CLI of the fiche pipeline.

    run_fiche(parquet, out_dir, step="all", base_url=..., api_key=...)

writes into `out_dir` (= results/<thesis>/, see scripts/layout.py):
    <thesis>_fiche.md            ★ the deliverable (after the citation gate)
    fiche_steps/1_structure.json       step 1 (re-written after step 2: mots_cles patched from the abstract)
    fiche_steps/2a_… 2d_*.md           step 2 raw outputs; 2_merged.md = merged sections + scores
    fiche_steps/sections.json          structured sections (step 2, patched by step 3)
    fiche_steps/fiche_before_gate.md, citation_fixes.json, calls.jsonl

Steps can be run one at a time (`--step 1`, then `2`, then `3`): each later
step reloads the previous step's JSON from `fiche_steps/`. The fiche is
rendered at the end of EVERY invocation from whatever is on disk.
"""
import argparse
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from openai import OpenAI

from . import llm
from .config import DEFAULT_API_KEY, DEFAULT_BASE_URL, MODEL
from .gate import postcheck_fiche_citations
from .render import render_fiche_markdown
from .step2 import analyze_intro
from .step3 import step3a_methodology, step3b_concepts
from .structure import extract_structure
from layout import ThesisLayout

log = logging.getLogger('fiche')

REPO = Path(__file__).resolve().parent.parent.parent     # current_repo/
STEPS = ("1", "2", "3", "all")


def _dump(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")


def make_client(base_url: str | None = DEFAULT_BASE_URL, api_key: str = DEFAULT_API_KEY,
                thesis_id: str = "") -> OpenAI:
    """OpenAI client + a light connectivity check (raises ConnectionError)."""
    if not base_url:
        raise ConnectionError("no server URL: set QWEN_SERVER_URL=https://<tunnel>.trycloudflare.com/v1 "
                              "(the llama-server, not the shim) or pass --base-url")
    client = OpenAI(base_url=base_url, api_key=api_key)
    try:
        available = [m.id for m in client.models.list().data]
    except Exception as e:
        raise ConnectionError(f"cannot reach server at {base_url}: {e}") from e
    # llama-server advertises the model under its file path; match on the basename
    if MODEL not in available and MODEL not in {m.rsplit("/", 1)[-1] for m in available}:
        log.warning(f"[{thesis_id}] WARNING: {MODEL!r} not in {available}")
    else:
        log.info(f"[{thesis_id}] Server reachable, model {MODEL} available.")
    return client


def run_fiche(parquet: Path, out_dir: Path, step: str = "all",
              base_url: str | None = DEFAULT_BASE_URL, api_key: str = DEFAULT_API_KEY) -> Path:
    """Run the pipeline for one thesis. Returns the path of the rendered fiche."""
    parquet = Path(parquet)
    out_dir = Path(out_dir)
    if step not in STEPS:
        raise ValueError(f"step must be one of {STEPS}")
    if not parquet.exists():
        raise FileNotFoundError(parquet)
    thesis_id = parquet.stem
    out = ThesisLayout(out_dir, thesis_id)
    out.steps.mkdir(parents=True, exist_ok=True)
    llm.set_call_log(str(out.calls))
    client = make_client(base_url, api_key, thesis_id)

    structure_path = out.structure
    intro_path = out.sections

    # ── Step 1: structure ──
    if step in ("1", "all"):
        structure = extract_structure(parquet, client)
        _dump(structure_path, structure)
        log.info(f"\n[{thesis_id}] Saved → {structure_path}")
    else:
        if not structure_path.exists():
            raise FileNotFoundError(f"--step={step} requires {structure_path} to exist. "
                                    f"Run --step=1 first or use --step=all.")
        structure = json.loads(structure_path.read_text(encoding="utf-8"))
        log.info(f"[{thesis_id}] Loaded existing structure ← {structure_path}")

    # ── Step 2: sections from intro / conclusion / abstract + scoring ──
    if step in ("2", "all"):
        intro_json, intro_md = analyze_intro(parquet, structure, client, dump_to=out)
        _dump(structure_path, structure)          # step 2c may have patched mots_cles
        _dump(intro_path, intro_json)
        md_path = out.merged
        md_path.write_text(intro_md, encoding="utf-8")
        log.info(f"\n[{thesis_id}] Saved → {intro_path}")
        log.info(f"[{thesis_id}] Saved → {md_path}")

    # ── Step 3: chapter dives (3a ∥ 3b) ──
    if step in ("3", "all"):
        if step == "3":
            if not intro_path.exists():
                raise FileNotFoundError(f"--step=3 requires {intro_path} to exist. "
                                        f"Run --step=2 first or use --step=all.")
            intro_json = json.loads(intro_path.read_text(encoding="utf-8"))
            log.info(f"[{thesis_id}] Loaded existing intro ← {intro_path}")

        # 3a and 3b read disjoint inputs and update disjoint sections → run them
        # concurrently on two server slots; wall time = max(3a, 3b).
        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_3a = pool.submit(step3a_methodology, parquet, structure, intro_json, client)
            fut_3b = pool.submit(step3b_concepts, parquet, intro_json, client)
            results = {"step3a": fut_3a.result(), "step3b": fut_3b.result()}

        for key in ("step3a", "step3b"):
            result = results[key]
            if result is None:
                continue
            for slug, content in result["updated_sections"].items():
                intro_json["sections"][slug]["content"] = content
                intro_json["sections"][slug]["score"] = None     # superseded by the dive
                intro_json["sections"][slug]["gaps"] = None
            intro_json[key] = {k: v for k, v in result.items() if k != "updated_sections"}
            _dump(intro_path, intro_json)
            log.info(f"\n[{thesis_id}] Updated → {intro_path}")

    # ── Final: render the fiche + citation gate (always, from what is on disk) ──
    fiche_path = out.fiche
    if intro_path.exists():
        final_intro = json.loads(intro_path.read_text(encoding="utf-8"))
        fiche_md = render_fiche_markdown(structure, final_intro)
        fiche_path.write_text(fiche_md, encoding="utf-8")
        log.info(f"[{thesis_id}] Rendered → {fiche_path}")
        try:
            fixed, fixes = postcheck_fiche_citations(fiche_md, parquet)
            out.fiche_before_gate.write_text(fiche_md, encoding="utf-8")
            _dump(out.citation_fixes, fixes)
            if fixes:
                fiche_path.write_text(fixed, encoding="utf-8")
            log.info(f"[{thesis_id}] citation gate: {len(fixes)} page(s) corrected on verbatim quotes"
                  + (" → " + "; ".join(f"{f['tag']}→{f['to']} ({f['how']})" for f in fixes) if fixes else ""))
            try:
                from tools import c12_audit
                flagged, n_bullets = c12_audit.audit(str(fiche_path))
                log.info(f"[{thesis_id}] c12 audit: {len(flagged)} compound-binding candidates "
                      f"in {n_bullets} bullets (metric only)")
            except Exception:
                pass
        except Exception as e:
            log.warning(f"[{thesis_id}] citation gate skipped: {e!r}")
    return fiche_path


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Fiche de synthèse pipeline: step 1 structure, step 2 sections + scoring, "
                    "step 3 chapter dives, then render + citation gate.")
    ap.add_argument("parquet", type=Path, help="thesis parquet file")
    ap.add_argument("--step", choices=STEPS, default="all",
                    help="which step(s) to run; 2 needs step 1's structure.json, 3 needs step 2's intro.json")
    ap.add_argument("--output-dir", type=Path, default=None,
                    help="the thesis' results dir (default: results/<thesis>/); the fiche lands at its top, "
                         "the trail in fiche_steps/")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL,
                    help="llama-server endpoint …/v1 (default: $QWEN_SERVER_URL; required — not the shim)")
    ap.add_argument("--api-key", default=DEFAULT_API_KEY)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    for noisy in ("httpx", "httpcore", "openai"):      # keep third-party request logs out of the console
        logging.getLogger(noisy).setLevel(logging.WARNING)
    out_dir = args.output_dir or REPO / "results" / args.parquet.stem
    try:
        run_fiche(args.parquet, out_dir, args.step, args.base_url, args.api_key)
    except (FileNotFoundError, ConnectionError, ValueError) as e:
        sys.exit(f"ERROR: {e}")
