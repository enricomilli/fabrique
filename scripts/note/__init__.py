"""
note — the note de lecture pipeline (fiche + full thesis text → ~2,000-word review via rlm-cli).

    from note import run_note
    meta = run_note("2027Bourse", "results/2027Bourse/2027Bourse_fiche.md", "data/2027Bourse.parquet")

Modules:
    prompt.py                 build_prompt() — the rlm instruction, verbatim (frozen by tests/golden)
    pipeline.py               build_blob() / render_toc_map() / run_note_once() / run_note() + CLI (scripts/run_note.py)
    shim.py                   the Ollama-compatible proxy rlm-cli talks to; ShimConfig + transform_payload (scripts/run_shim.py)
    style_reference_clean.md  the style exemplar embedded in the prompt

Importing the package puts scripts/ on sys.path (same convention as fiche/).
"""
import sys as _sys
from pathlib import Path as _Path

_SCRIPTS = str(_Path(__file__).resolve().parent.parent)
if _SCRIPTS not in _sys.path:
    _sys.path.insert(0, _SCRIPTS)

from .prompt import build_prompt                                                   # noqa: E402,F401
from .pipeline import build_blob, render_toc_map, run_note, run_note_once, main    # noqa: E402,F401
from .shim import ShimConfig, transform_payload                                    # noqa: E402,F401
