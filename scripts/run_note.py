#!/usr/bin/env python3
"""
run_note.py — CLI of the note de lecture pipeline (package scripts/note/).

    python3 scripts/run_note.py --thesis <thesis> --fiche results/<thesis>/<thesis>_fiche.md \
        --structure results/<thesis>/<thesis>_structure.json --parquet data/<thesis>.parquet

Needs the shim running (scripts/run_shim.py) and `rlm` on PATH.
Until 2026-08-19 this script was named annotate_note.py.
"""
from note.pipeline import main

if __name__ == "__main__":
    main()
