"""
fiche — the fiche de synthèse pipeline (thesis parquet → 14-section summary).

    from fiche import run_fiche
    run_fiche("data/2027Bourse.parquet", "results/2027Bourse")      # all steps

Modules (read them in this order):
    config.py      server env vars + per-step sampling profiles (StepConfig)
    prompts.py     every prompt string, verbatim (frozen by tests/golden)
    llm.py         llm_call() — streaming call, retries, full call log
    blobs.py       parquet pages → text blobs with <<< PAGE N >>> markers
    structure.py   step 1: metadata + TOC + page offset            → _structure.json
    step2.py       step 2: 12 sections from intro/conclusion/abstract + scoring → _intro.json
    step3.py       step 3: methodology + theory chapter dives      (patches _intro.json)
    render.py      sections → markdown fiche (grille order)        → _fiche.md
    gate.py        post-verification citation gate (no LLM)
    pipeline.py    run_fiche() orchestration + CLI (scripts/run_fiche.py)

Progress is logged on the `fiche` logger (INFO); the CLI prints it to stdout.
The package lives in scripts/ next to tools/ (verify_citations, c12_audit) that
it imports; importing it puts scripts/ on sys.path.
"""
import sys as _sys
from pathlib import Path as _Path

_SCRIPTS = str(_Path(__file__).resolve().parent.parent)
if _SCRIPTS not in _sys.path:
    _sys.path.insert(0, _SCRIPTS)

from .config import (DEFAULT_API_KEY, DEFAULT_BASE_URL, MODEL, StepConfig,       # noqa: E402,F401
                     STEP1_CONFIG, STEP2_CONFIG, STEP2D_SCORING_CONFIG, STEP3_CONFIG)
from .pipeline import main, make_client, run_fiche                               # noqa: E402,F401

__all__ = ["run_fiche", "main", "make_client", "StepConfig", "MODEL", "DEFAULT_BASE_URL",
           "DEFAULT_API_KEY", "STEP1_CONFIG", "STEP2_CONFIG", "STEP2D_SCORING_CONFIG", "STEP3_CONFIG"]
