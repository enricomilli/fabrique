#!/usr/bin/env python3
"""
run_shim.py — start the Ollama-compatible shim in front of llama-server (scripts/note/shim.py).

    export QWEN_SERVER_URL=https://<tunnel>.trycloudflare.com/v1 QWEN_API_KEY=colab
    export SHIM_MODEL_NAME=Qwen3.6-27B-Q6_K.gguf SHIM_TEMPERATURE=0.6 SHIM_TOP_K=20 SHIM_TOP_P=0.95
    export SHIM_STABLE_PREFIX=1 SHIM_THINK_BUDGET=1500 SHIM_MAX_TOKENS=8192
    python3 scripts/run_shim.py &          # binds 127.0.0.1:11434

Until 2026-08-19 this script was named ollama_shim.py.
"""
from note.shim import main

if __name__ == "__main__":
    main()
