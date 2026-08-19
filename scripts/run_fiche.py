#!/usr/bin/env python3
"""
run_fiche.py — CLI of the fiche de synthèse pipeline (package scripts/fiche/).

    python3 scripts/run_fiche.py data/<thesis>.parquet --step all --output-dir results/<thesis>

Point QWEN_SERVER_URL at the llama-server tunnel (not at the shim — the shim
overwrites sampling). Until 2026-08-19 this script was named annotate_qwen_v5_gguf.py.
"""
from fiche.pipeline import main

if __name__ == "__main__":
    main()
