# Thesis Annotation Pipeline — promoted configuration (v3, 2026-08-19)

Turns a PhD thesis (layout-parsed **parquet**: one row per block with `page`,
`block_index`, `category`, `text`) into two French deliverables:

1. **fiche de synthèse** — 14-section analytical summary, every quote page-cited
   (`scripts/run_fiche.py` → package `scripts/fiche/`)
2. **note de lecture** — ~2,000-word academic review written by an RLM loop
   from the fiche + the full text (`scripts/run_note.py` → package `scripts/note/`, via rlm-cli)

Model: **Qwen3.6-27B Q6_K (MTP build)** on `llama-server` with speculative
decoding, on a remote GPU (Colab notebook), reached through a Cloudflare tunnel
and a local Ollama-compatible shim. Everything is discipline-agnostic
(validated on FR/SHS Bourse, EN/STEM Daley, FR/SIC LORR out-of-sample).

Per thesis ≈ **3.5–4.5 min** on the 3-slot MTP server (shipped runs: Bourse 268 s,
Daley 212 s): fiche ~120–125/140 with **0 wrong pages** after the citation gate,
note ≈50/60 with **0 wrong pages, 0 blind citations**. Judge criteria and the
14-section grid: `gold/EVALUATION.md`, `gold/grille_annotation.md`; A/B history:
`../experiment_repo/EXPERIMENT.md`.

---

## Requirements

| where | what | version used |
|---|---|---|
| local (Mac) | Python ≥ 3.10 + the deps in `pyproject.toml` (`pandas`, `pyarrow`, `openai`, `aiohttp`, `requests`; `pytest` in the dev group), pinned in `uv.lock` to the versions every reference run used — see *Install* below | Python 3.13 · pandas 2.3.1 · pyarrow 21.0.0 · openai 2.32.0 · aiohttp 3.13.2 · requests 2.33.1 |
| local | **rlm-cli** (`rlm` on PATH; Node ≥ 20): run `cli/install.sh`. The repo ships the exact patched build the pipeline was validated on; see `cli/README.md` for why it is vendored and what the patch does. rlm's REPL runs Python, so `python3` must be on PATH too. | 0.5.0 + patch |
| remote (GPU) | Colab with a ≥ 80 GB GPU (A100/H100 class — 64 GB used by the Q6_K model + q8_0 KV at 262k ctx), Google Drive for the GGUF, a Hugging Face account; `notebooks/current_thesis_server.ipynb` builds llama.cpp (CUDA) and downloads `unsloth/Qwen3.6-27B-MTP-GGUF` Q6_K (~22 GB) | llama.cpp master (2026-08), MTP build |
| inputs | `data/<thesis>.parquet` — one row per layout block with `page`, `block_index`, `category`, `text` (Page-header/Page-footer/Footnote/Section-header/List-item/Text/…). The three parquets here are theses as delivered by the layout parser; their source PDFs are in `data/pdf/` (same stem). Parquet `page` = PDF page, except `2024LORR0201` where the PDF has one extra cover page (parquet p.N = PDF p.N+1) | — |

### Install

```bash
uv sync                  # creates .venv with the exact versions from uv.lock (incl. pytest)
uv run pytest -q         # offline test suite, ~10 s
uv run python scripts/run_fiche.py …   # or `source .venv/bin/activate` and use python3 as in the Quick start
```

Without uv: `python3 -m venv .venv && . .venv/bin/activate && pip install -e . pytest`
(resolves the ranges in `pyproject.toml`, which stop at the next major version; only
uv reproduces the exact validated set). To upgrade a dependency: bump its pin in
`[tool.uv] constraint-dependencies`, `uv lock`, run the tests and one live run. The repo is not an installable
package: run the scripts from the repo root; they put `scripts/` on `sys.path` themselves.
rlm-cli (Node) is outside the Python environment: install it with `cli/install.sh`.
The GPU server is the Colab notebook.

---

## Layout

```
README.md                    this file — current state, quick start, layout, results, tests
scripts/
  run_fiche.py   run_note.py   run_shim.py     the three entry points (thin CLIs)
  fiche/                     the FICHE pipeline — read __init__.py first
    config.py                env vars + per-step sampling (StepConfig)
    prompts.py               every prompt, verbatim (frozen by tests/golden)
    llm.py                   llm_call(): streaming, retries, full call log (calls.jsonl)
    blobs.py                 parquet pages → text with <<< PAGE N >>> markers
    structure.py             step 1  metadata + TOC + printed→parquet page offset
    step2.py                 step 2  12 sections from intro/conclusion/abstract + scoring
    step3.py                 step 3  methodology + theory chapter dives (run in parallel)
    render.py                sections → markdown fiche
    gate.py                  post-verification citation gate (no LLM)
    pipeline.py              run_fiche() + CLI
  layout.py                  where a thesis' outputs live (the results/ convention — see below)
  note/                      the NOTE pipeline — read __init__.py first
    prompt.py                the rlm instruction, verbatim (frozen by tests/golden)
    pipeline.py              blob + TOC map → rlm-cli → archived run dir; run_note() + CLI
    shim.py                  Ollama facade → llama-server; injects sampling + v3 fixes (ShimConfig, transform_payload)
    style_reference_clean.md style exemplar embedded in the prompt
  tools/                     standalone auditors/utilities (each also a CLI)
    verify_citations.py      ground-truth citation auditor  ← RUN THIS ALWAYS
    trace_grounding.py       gold-free grounding auditor of a note run (exit 1 on BLIND)
    score_against_gold.py    objective comparison vs a gold reference
    c12_audit.py             compound page-binding heuristic (metric)
    build_explorer.py        explorer v1: every step / iteration with prompt, reasoning, output, stdout
    build_reasoning.py       Raisonnement view: reading map + iteration cards (reasoning.json = UI contract)
    spec_bench.py            decode A/B via server timings (speculative decoding)
tests/                       pytest — offline; replays the recorded v3 runs byte-for-byte (see below)
rlm/rlm_config.yaml          rlm-cli limits (cwd of the rlm subprocess)
cli/                         the patched rlm-cli (vendored source + install.sh), the patch, request_flow.html
notebooks/current_thesis_server.ipynb   the GPU server (build, download, launch, tunnel)
gold/                        hand-built reference fiches/notes, EVALUATION.md (gates, judge criteria,
                             catastrophic-miss lists), grille_annotation.md (the 14-section grid the fiche fills)
data/<thesis>.parquet        inputs
data/pdf/<thesis>.pdf        the original PDFs the parquets were parsed from (reference only; the pipeline reads the parquet)
results/                     reference runs of v3 (see results/README.md)
explorer/                    browsable views of those runs (see explorer/README.md)
```

---

## Quick start

All commands from `current_repo/` (or use absolute paths — the shell cwd is
not preserved between tool calls in some environments).

```bash
# 0. remote: run notebooks/current_thesis_server.ipynb, copy the tunnel URL
#    (check https://<tunnel>/health returns 200 first)

# 1. local: the shim (Ollama facade that rlm-cli requires; also fine for the fiche)
export QWEN_SERVER_URL=https://<tunnel>.trycloudflare.com/v1
export QWEN_API_KEY=colab
export SHIM_MODEL_NAME=Qwen3.6-27B-Q6_K.gguf
export SHIM_TEMPERATURE=0.6 SHIM_TOP_K=20 SHIM_TOP_P=0.95            # note sampling (rlm-cli sends none)
export SHIM_STABLE_PREFIX=1 SHIM_THINK_BUDGET=1500 SHIM_MAX_TOKENS=8192   # v3: KV-cache fix, root think cap, output cap
python3 scripts/run_shim.py &                                      # binds 127.0.0.1:11434

# 2. fiche — point it at the TUNNEL, not the shim: the shim overwrites temperature/top_k/top_p
#    and max_tokens on every chat request (that is its job for rlm-cli), which would change the
#    fiche's per-step sampling (0.3/0.5/0.6, top_k 40, max 6000-10000).
export QWEN_SERVER_URL=https://<tunnel>.trycloudflare.com/v1 QWEN_API_KEY=colab QWEN_MODEL=Qwen3.6-27B-Q6_K.gguf
python3 scripts/run_fiche.py data/<thesis>.parquet --step all --output-dir results/<thesis>
#    (--step 1 / 2 / 3 run the steps one at a time; the fiche is re-rendered after each)

# 3. ALWAYS audit the fiche (the gate already fixed verifiable wrong pages; see fiche_steps/citation_fixes.json)
python3 scripts/tools/verify_citations.py results/<thesis>/<thesis>_fiche.md data/<thesis>.parquet --show-offset

# 4. note  (TOC map read from results/<thesis>/fiche_steps/1_structure.json automatically)
python3 scripts/run_note.py --thesis <thesis> \
    --fiche   results/<thesis>/<thesis>_fiche.md \
    --parquet data/<thesis>.parquet \
    --model   Qwen3.6-27B-Q6_K.gguf            # must equal SHIM_MODEL_NAME (rlm validates it)

# 5. gates on the note
python3 scripts/tools/trace_grounding.py results/<thesis>/note_runs/latest          # exit 1 on any BLIND citation
python3 scripts/tools/verify_citations.py results/<thesis>/<thesis>_note.md data/<thesis>.parquet

# 6. look at everything (prompt · thinking · output · stdout per step/iteration)
python3 scripts/tools/build_explorer.py --thesis-dir results/<thesis> --out explorer/<thesis>
python3 scripts/tools/build_reasoning.py --thesis-dir results/<thesis>     # what the note read, why, when
```

Wait for the fiche before launching the note: a citation-corrected fiche is the
single largest quality lever of the note (it inherits the fiche's page bindings).

### Python API (for a UI)

```python
import sys; sys.path.insert(0, "current_repo/scripts")
from fiche import run_fiche                     # fiche_path = run_fiche(parquet, out_dir, step="all", base_url=..., api_key=...)
from note import run_note                       # meta = run_note(thesis, fiche, parquet, structure=None, model=..., results_root=None)
# tools.build_explorer.build_fiche(dir) / build_note(dir) return the JSON the HTML explorer renders —
# the natural data contract for a UI (steps/calls with system·prompt·reasoning·output; iterations with input·reasoning·output·stdout).
# Progress goes to the `fiche` / `note` loggers (logging.INFO); the CLIs print it, a UI attaches its own handler.
# Library functions raise (FileNotFoundError, ConnectionError, RuntimeError) — only the CLIs call sys.exit.
```

---

## Configuration (all of it)

| where | what | value (v3) |
|---|---|---|
| `fiche/config.py` | step 1 structure | temp 0.3 · top_p 0.95 · top_k 40 · max 8000 · no thinking |
| | steps 2a/2b/2c | temp 0.6 · 0.95 · 40 · max 10000 · thinking 500 |
| | step 2d scoring | temp 0.5 · 0.95 · 40 · max 6000 · no thinking |
| | steps 3a/3b | temp 0.6 · 0.95 · 40 · max 6000 · thinking 500 |
| `fiche/prompts.py` | all fiche prompts incl. the C12 one-page-per-proposition rule | frozen (tests) |
| `note/prompt.py` | the note prompt incl. the co-presence rule, ≤2-§ cadence, batched exploration | frozen (tests) |
| shim env | `SHIM_TEMPERATURE=0.6 SHIM_TOP_K=20 SHIM_TOP_P=0.95 SHIM_STABLE_PREFIX=1 SHIM_THINK_BUDGET=1500 SHIM_MAX_TOKENS=8192` (never set `SHIM_ENABLE_THINKING` for rlm) | |
| `rlm/rlm_config.yaml` | `max_iterations 20 · max_depth 1 · max_sub_queries 15 · truncate_len 20000` (rlm keeps only the LAST N chars of an execution's stdout) | needs the 3-slot server |
| notebook | `QUANT Q6_K · N_PARALLEL 3 · CTX_SIZE 262144 (87,381/slot) · KV q8_0 · --spec-type draft-mtp · --slot-prompt-similarity 0.85` | |

Why these values: 0.6 (not 0.8) because at 0.8 whole sections flipped to `[Non renseigné]`
between otherwise identical runs; top_k 40 (fiche) vs 20 (note) because each won at its own
value and was left unharmonised; no presence_penalty (Unsloth's thinking-mode profile);
`truncate_len 20000` because rlm keeps only the LAST N chars of an execution's stdout and
at 10000 extraction turns silently lost their head; 3 slots so that loop fits 87k tokens/slot.

---

## Tests — the behaviour is frozen

```bash
cd current_repo && python3 -m pytest tests -q        # ~10 s, no GPU, no network
```

* `test_replay_fiche.py` — starts a fake llama-server that **replays the recorded
  v3 runs** (`tests/fixtures/{bourse,daley}_v3/calls.jsonl`), runs `run_fiche.py`
  against it and requires **byte-identical** `<thesis>_fiche.md`, `1_structure.json`,
  `sections.json`, every step dump and the gate files. Any change to a prompt, a sampling parameter, the step order,
  a parser, the renderer or the gate fails it.
* `test_frozen_surface.py` — sha256 of every prompt / StepConfig / regex, the note
  prompt (reproduces the real v3 `prompt.txt`), the note blob, and the shim's
  forwarded payloads (black-box, shim run as a subprocess) vs `tests/golden/`.
* `test_units.py`, `test_note_runner.py` — parsers, TOC logic, citation gate,
  auditors, the note run-dir contract (fake `rlm`).

After an A/B-validated promotion, regenerate the golden files
(`python3 tests/make_golden.py`) and the replay fixtures, and record what changed
and why. Never regenerate to make a failing test pass.

---

## Results — what's what

One folder per thesis; the two deliverables sit at its top, everything else is
the trail that lets you audit how they were produced (`scripts/layout.py` is the
single definition of this convention).

```
results/<thesis>/
  <thesis>_fiche.md            ★ FICHE — the deliverable (after the citation gate)
  <thesis>_note.md             ★ NOTE  — the deliverable (copy of note_runs/latest/note.md)
  fiche_steps/                 fiche trail, in pipeline order
    1_structure.json             step 1 — metadata, TOC, printed→parquet page offset
    2a_intro.md  2b_conclusion.md  2c_abstract_delta.md  2d_scoring.md   raw model outputs of step 2
    2_merged.md                  step 2 result — merged sections + severe scores (human-readable)
    sections.json                structured sections with scores/refs (step 3 patches it)
    fiche_before_gate.md         the fiche BEFORE the citation gate (judge raw vs served)
    citation_fixes.json          what the gate changed: tag → page, rewrite | insert
    calls.jsonl                  every LLM exchange: system, prompt, think block, output, timings
  note_runs/<run_id>/          one dir per note run (run_id = timestamp)
    note.md  prompt.txt  fiche_used.md  style_used.md  config.json  metadata.json
    rlm_log.txt (rlm stdout+stderr)  trace/NNN_root.json (every request through the shim)
  note_runs/latest → <run_id>
```

Reference runs shipped in this repo — fresh runs of the v3 configuration on
2026-08-19: `results/2027Bourse/` (fiche 174 s + note 94 s, 0 real citation errors,
6/6 judge items) and `results/daley_thesis/` (fiche 130 s + note 82 s, 0 errors,
6/6). Numbers, gates and the honest variance note: `results/README.md`.

---

## Verification vocabulary

`tools/verify_citations.py` re-derives every `(p. N)` from the parquet: **OK** · **OFF-1**
(adjacent page, usually a paragraph straddling a break) · **WRONG** (≥2 pages away —
fix before publishing; non-zero exit) · **UNVERIFIED** (anchor not located — usually
a French paraphrase of an English quote; spot-check, do not assume wrong).
`tools/trace_grounding.py` classifies each note citation as GROUNDED (the `[p.N]` marker
was in a REPL output the model saw) / FICHE (pre-verified, in the prompt) /
BLIND (never in view — where every confirmed error came from; exit 1).

Two page-numbering systems: models cite **parquet** pages (the `[p.NNN]`
markers); the printed number differs by the front matter (Bourse 0, Daley +11).
`tools/verify_citations.py --show-offset` prints the delta.

---

## Open items (after v3)

Note coverage guard (a fiche whose *Thèse centrale* omits a founding example can
make the note omit it too — see `results/README.md`) · C13 result-status rule ·
LORR re-run on v3 · `experiment_repo/` still carries the pre-audit monolithic
scripts — re-baseline it from this repo before the next A/B.
