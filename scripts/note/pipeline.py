"""
note/pipeline.py — note de lecture (~2000-word French academic review) of a
thesis, written by an RLM loop (rlm-cli) from the fiche + the full thesis text.

    python3 scripts/run_note.py --thesis 2027Bourse \\
        --fiche results/2027Bourse/2027Bourse_fiche.md \\
        --parquet data/2027Bourse.parquet --model Qwen3.6-27B-Q6_K.gguf
    (the TOC map is read from <fiche dir>/fiche_steps/1_structure.json unless --structure is given)

Requires the Ollama shim on 127.0.0.1:11434 (scripts/run_shim.py — it
injects the sampling that rlm-cli does not send) and `rlm` on PATH. The rlm
subprocess runs with cwd = rlm/ so it picks up rlm/rlm_config.yaml.

What happens
    1. build the thesis blob (page markers `[p.NNN]`, footnotes as `[fn]`)
       → a temp file passed to `rlm run --file`, loaded as the REPL variable `context`
       (deleted after the run; it is a pure function of the parquet)
    2. build the prompt (note/prompt.py) = rules + TOC map + fiche + style
    3. tell the shim to trace into this run's dir (POST /shim/trace), run rlm
    4. archive everything under results/<thesis>/note_runs/<run_id>/ (layout.py):
         note.md  prompt.txt  fiche_used.md  style_used.md  config.json
         metadata.json  rlm_log.txt  trace/NNN_{root,subquery}.json
       point results/<thesis>/note_runs/latest → <run_id>, and copy the note to
       results/<thesis>/<thesis>_note.md (★ the deliverable)
    5. degenerate-loop guard: a run with < --min-words words or < --min-iters
       iterations is retried once (fresh run_id); the last run is kept.

Python API: run_note(thesis, fiche, parquet, structure=None, ...) -> metadata dict.
"""
import argparse
import datetime as dt
import json
import logging
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

import pandas as pd

from .prompt import build_prompt
from layout import ThesisLayout

log = logging.getLogger('note')

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent                         # current_repo/
STYLE_REF_PATH = HERE / "style_reference_clean.md"
RLM_CLI_CWD = REPO / "rlm"                       # holds rlm_config.yaml (rlm reads it from cwd)
RLM_CONFIG = RLM_CLI_CWD / "rlm_config.yaml"
SHIM_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "Qwen3.6-27B-Q6_K.gguf"


# ── Inputs ───────────────────────────────────────────────────────────────────

def build_blob(parquet_path: str) -> str:
    """Full thesis text for the REPL: `[p.NNN]` marker at every page change,
    footnotes kept as `[fn] …` lines (they carry the thesis's own references),
    page headers/footers dropped."""
    df = pd.read_parquet(parquet_path)
    df = df[~df["category"].isin(["Page-header", "Page-footer"])]
    df = df.sort_values(["page", "block_index"])
    out = []
    current_page = None
    for _, r in df.iterrows():
        text = str(r.get("text", "")).strip()
        if not text:
            continue
        p = int(r["page"])
        if p != current_page:
            out.append(f"[p.{p}]")
            current_page = p
        out.append(f"[fn] {text}" if r.get("category", "") == "Footnote" else text)
    return "\n".join(out)


def render_toc_map(structure_path: pathlib.Path) -> str:
    """Navigation index from step 1's structure.json: levels 0-1 with PARQUET
    page ranges, so entries compose with the blob's [p.NNN] markers. "" when
    the file is missing/unusable (the prompt then omits the map)."""
    try:
        structure = json.loads(pathlib.Path(structure_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    lines = []
    for e in structure.get("toc") or []:
        level, title = e.get("level"), (e.get("title") or "").strip()
        ps, pe = e.get("page_start_parquet"), e.get("page_end_parquet")
        if not isinstance(level, int) or level > 1 or not title or not isinstance(ps, int):
            continue
        span = f"[p.{ps}]–[p.{pe}]" if isinstance(pe, int) else f"[p.{ps}]"
        lines.append(f"{'  ' * level}- {title}  {span}")
    return "\n".join(lines)


# ── One run ──────────────────────────────────────────────────────────────────

def run_note_once(thesis: str, fiche: pathlib.Path, parquet: pathlib.Path,
                  structure: pathlib.Path | None = None, run_id: str | None = None,
                  model: str = DEFAULT_MODEL, results_root: pathlib.Path | None = None) -> dict:
    """Run rlm once, archive it under <results_root>/<thesis>/note_runs/<run_id>/,
    return its metadata dict. Raises FileNotFoundError (inputs) / ConnectionError (shim down)."""
    fiche = pathlib.Path(fiche)
    parquet = pathlib.Path(parquet)
    if not fiche.exists():
        raise FileNotFoundError(f"fiche not found: {fiche}")
    if not parquet.exists():
        raise FileNotFoundError(f"parquet not found: {parquet}")
    layout = ThesisLayout(REPO / (results_root or "results") / thesis, thesis)   # relative → against the repo
    run_id = run_id or dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = layout.note_run(run_id)
    trace_dir = run_dir / "trace"
    trace_dir.mkdir(parents=True, exist_ok=True)

    fiche_text = fiche.read_text(encoding="utf-8")
    style_example = STYLE_REF_PATH.read_text(encoding="utf-8")
    (run_dir / "fiche_used.md").write_text(fiche_text, encoding="utf-8")
    (run_dir / "style_used.md").write_text(style_example, encoding="utf-8")

    log.info(f"[note] building blob from {parquet}...")
    blob = build_blob(str(parquet))
    log.info(f"[note] blob: {len(blob):,} chars (~{len(blob)//4:,} tok)")

    structure_path = pathlib.Path(structure) if structure else ThesisLayout.structure_for_fiche(fiche)
    toc_map = render_toc_map(structure_path)
    if toc_map:
        log.info(f"[note] TOC map: {len(toc_map):,} chars from {structure_path}")
    else:
        log.info(f"[note] no usable structure at {structure_path} — prompt without map")

    prompt = build_prompt(fiche_text, style_example, toc_map=toc_map,
                          model_name=model, run_date=dt.date.today().isoformat())
    (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    log.info(f"[note] prompt: {len(prompt):,} chars")

    try:
        urllib.request.urlopen(f"{SHIM_URL}/api/tags", timeout=3)
    except Exception as e:
        raise ConnectionError(f"Ollama shim not responding on {SHIM_URL} — {e}") from e

    def shim_trace(directory):
        """Tell the shim where to dump request/response pairs (None = stop)."""
        req = urllib.request.Request(f"{SHIM_URL}/shim/trace", data=json.dumps({"dir": directory}).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=5)

    (run_dir / "config.json").write_text(json.dumps({
        "thesis": thesis, "run_id": run_id, "model": model,
        "fiche_path": str(fiche), "parquet_path": str(parquet),
        "blob_chars": len(blob), "blob_tok_est": len(blob) // 4, "prompt_chars": len(prompt),
        "shim_env": {k: v for k, v in os.environ.items() if k.startswith("SHIM_") or k == "QWEN_SERVER_URL"},
        "rlm_config": RLM_CONFIG.read_text(encoding="utf-8") if RLM_CONFIG.exists() else None,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    shim_trace(str(trace_dir.resolve()))
    log.info(f"[note] shim traces → {trace_dir}")
    fd, blob_path = tempfile.mkstemp(prefix=f"note_{thesis}_", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(blob)
    cmd = ["rlm", "run", "--file", blob_path, "--model", model, "--verbose", prompt]
    log.info(f"[note] rlm run (cwd={RLM_CLI_CWD})...")
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(RLM_CLI_CWD), capture_output=True, text=True)
    finally:
        shim_trace(None)
        os.unlink(blob_path)
    elapsed = time.time() - t0
    log.info(f"[note] done in {elapsed:.1f}s  exit={proc.returncode}")

    (run_dir / "rlm_log.txt").write_text(proc.stdout + "\n\n---STDERR---\n" + proc.stderr, encoding="utf-8")

    # rlm-cli prints the FINAL() markdown to stdout; progress goes to stderr.
    answer = proc.stdout.strip()
    for tok in ("<|im_end|>", "<|endoftext|>", "</s>", "<|im_start|>"):
        answer = answer.replace(tok, "")
    note_path = run_dir / "note.md"
    note_path.write_text(answer + "\n", encoding="utf-8")

    metadata = {"wall_time_s": round(elapsed, 1), "note_word_count": len(answer.split())}
    # rlm-cli prints this banner on STDERR (the note itself is on stdout)
    m = re.search(r"Completed in ([\d.]+)s \| (\d+) iterations \| (\d+) sub-queries \| (\w+)",
                  proc.stdout + "\n" + proc.stderr)
    if m:
        metadata.update({"rlm_time_s": float(m.group(1)), "iterations": int(m.group(2)),
                         "sub_queries": int(m.group(3)), "rlm_status": m.group(4)})
    trace_files = sorted(trace_dir.glob("*.json"))
    metadata["trace_files"] = len(trace_files)
    metadata["trace_root_calls"] = sum(1 for p in trace_files if "_root" in p.name)
    metadata["trace_subquery_calls"] = sum(1 for p in trace_files if "_subquery" in p.name)
    metadata["run_dir"] = str(run_dir)
    (run_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    latest = layout.latest_note_run
    try:
        if latest.is_symlink() or latest.exists():
            latest.unlink()
        latest.symlink_to(run_id)
    except OSError:
        pass
    metadata["deliverable"] = str(layout.note)

    log.info(f"[note] run dir → {run_dir}")
    log.info(f"[note] note   → {note_path}")
    log.info(f"[note] trace  → {trace_dir} ({metadata['trace_files']} files, "
          f"{metadata['trace_root_calls']} root + {metadata['trace_subquery_calls']} subq)")
    return metadata


# ── LaTeX escape repair ──────────────────────────────────────────────────────
# A handful of LaTeX commands reach the note with the backslash eaten: $lpha$ for
# $\alpha$, $rac{d}{dt}$ for $\frac{d}{dt}$ (2022LORR0183, 2026-10-07). The set
# is exactly the commands whose first letter is a Python string escape that
# silently collapses — \a \b \f \n \r \t \v — so the damage is predictable and
# reversible. Repair only inside $…$ math spans, where these stems are never
# ordinary prose, and only for an unambiguous table.
_MATH_SPAN_RE = re.compile(r"\$[^$\n]{1,200}?\$")
_LOST_ESCAPES = [
    ("lpha", "alpha"), ("rac{", "frac{"), ("eta", "beta"), ("abla", "nabla"),
    ("heta", "theta"), ("imes", "times"), ("au", "tau"), ("ho", "rho"),
    ("ec{", "vec{"), ("ar{", "bar{"),
]


def repair_lost_latex_escapes(md: str) -> tuple[str, int]:
    """Restore backslashes eaten from LaTeX commands inside $…$ spans.
    Returns (text, n_repairs)."""
    n = 0

    def fix_span(m):
        nonlocal n
        span = m.group(0)
        for stem, cmd in _LOST_ESCAPES:
            # only a stem that is NOT already preceded by a backslash or letter
            pat = re.compile(r"(?<![\\A-Za-z])" + re.escape(stem))
            # function replacement: a plain string would have its own
            # backslash re-interpreted by re (\\a -> BEL), reintroducing the bug
            span, k = pat.subn(lambda _m, c=cmd: "\\" + c, span)
            n += k
        return span

    return _MATH_SPAN_RE.sub(fix_span, md), n


# ── Run + degenerate-loop guard ──────────────────────────────────────────────

def run_note(thesis: str, fiche, parquet, structure=None, run_id: str | None = None,
             model: str = DEFAULT_MODEL, results_root=None,
             min_words: int = 1500, min_iters: int = 5, max_retries: int = 1) -> dict:
    """run_note_once + retry when the loop degenerates (the model occasionally
    drafts the whole note in one execution and stops after 3-8 iterations:
    short, thin note). Deterministic, discipline-agnostic; the kept run is the
    last one (note_runs/latest points to it) and its note.md is copied to
    <results_root>/<thesis>/<thesis>_note.md — the deliverable. Returns the
    kept run's metadata."""
    attempt = 0
    while True:
        meta = run_note_once(thesis, fiche, parquet, structure, run_id, model, results_root)
        words = meta.get("note_word_count", 0)
        iters = meta.get("iterations", meta.get("trace_root_calls", 99))
        ok = words >= min_words and iters >= min_iters
        if ok or attempt >= max_retries:
            meta["degenerate"] = not ok
            if not ok:
                # Do NOT promote a degenerate run. A dead tunnel yields a 38-byte
                # "[API Error] 530" note; promoting it overwrote four good
                # deliverables and still exited 0, so the driver reported success.
                # Leave the previous deliverable in place and fail loudly instead.
                log.error(f"[note] ✗ DEGENERATE run NOT promoted ({words} words, "
                          f"{iters} iterations) — retries exhausted; kept run is "
                          f"{meta['run_dir']}, deliverable left untouched")
                return meta
            deliverable = pathlib.Path(meta["deliverable"])
            run_dir = pathlib.Path(meta["run_dir"])
            note_md = (run_dir / "note.md").read_text(encoding="utf-8")
            # Same deterministic citation gate the fiche gets. It was never
            # applied to the note, so a verbatim quote tagged with the wrong
            # page shipped as-is (2 of 5 audited notes, 2026-10-07). Raw model
            # output stays in the run dir as note_before_gate.md.
            try:
                from fiche.gate import postcheck_fiche_citations
                gated, fixes = postcheck_fiche_citations(note_md, parquet)
            except Exception as e:                       # never fail a good note on the gate
                log.warning(f"[note] citation gate skipped: {e}")
                gated, fixes = note_md, []
            if fixes:
                (run_dir / "note_before_gate.md").write_text(note_md, encoding="utf-8")
                (run_dir / "citation_fixes.json").write_text(
                    json.dumps(fixes, indent=2, ensure_ascii=False), encoding="utf-8")
                log.info(f"[note] citation gate: {len(fixes)} page binding(s) corrected")
            meta["citation_fixes"] = len(fixes)
            gated, n_latex = repair_lost_latex_escapes(gated)
            if n_latex:
                log.info(f"[note] repaired {n_latex} lost LaTeX escape(s)")
            meta["latex_repairs"] = n_latex
            deliverable.write_text(gated, encoding="utf-8")
            log.info(f"[note] deliverable → {deliverable}")
            return meta
        attempt += 1
        log.warning(f"[note] ⚠ DEGENERATE run ({words} words, {iters} iterations) → retry {attempt}/{max_retries}")
        run_id = None            # the retry gets a fresh timestamp dir
        time.sleep(1.1)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--thesis", required=True)
    ap.add_argument("--fiche", required=True)
    ap.add_argument("--parquet", required=True)
    ap.add_argument("--structure", default=None,
                    help="step 1 structure.json (navigation index). Default: <fiche dir>/fiche_steps/1_structure.json")
    ap.add_argument("--run-id", default=None, help="run id (default: timestamp)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="must match SHIM_MODEL_NAME (rlm validates it)")
    ap.add_argument("--results-root", default=None,
                    help="results root; the run goes to <root>/<thesis>/note_runs/<run_id>/ (default: results/)")
    ap.add_argument("--min-words", type=int, default=1500, help="degenerate-loop guard")
    ap.add_argument("--min-iters", type=int, default=5, help="degenerate-loop guard")
    ap.add_argument("--max-retries", type=int, default=1, help="degenerate-loop guard")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    for noisy in ("httpx", "httpcore", "openai"):      # keep third-party request logs out of the console
        logging.getLogger(noisy).setLevel(logging.WARNING)
    try:
        meta = run_note(a.thesis, a.fiche, a.parquet, a.structure, a.run_id, a.model, a.results_root,
                        a.min_words, a.min_iters, a.max_retries)
    except (FileNotFoundError, ConnectionError) as e:
        sys.exit(f"ERROR: {e}")
    if meta.get("degenerate"):
        sys.exit("ERROR: note run was degenerate and was not promoted "
                 "(see the run dir above); the deliverable is unchanged.")


if __name__ == "__main__":
    main()
