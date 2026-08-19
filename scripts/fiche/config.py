"""
fiche/config.py — server connection + per-step sampling profiles.

Connection (env):
    QWEN_SERVER_URL   OpenAI-compatible base URL of llama-server, e.g. https://<tunnel>.trycloudflare.com/v1
                      REQUIRED — point the fiche at the server/tunnel, NOT at the shim (the shim
                      overwrites temperature/top_k/top_p/max_tokens for rlm-cli and would flatten
                      the per-step sampling below)
    QWEN_API_KEY      bearer token                 (default "colab")
    QWEN_MODEL        model id the server exposes  (default Qwen3.6-27B-Q6_K.gguf)
(Until 2026-08-19 these were GEMMA_* — the pipeline was first built on Gemma.)

Sampling: one StepConfig per pipeline step (validated values — README
"Configuration"). Mechanical extraction = low temperature,
no thinking; analytical synthesis = 0.6 with a 500-token thinking cap.
llama-server handles thinking natively via `thinking_budget_tokens` and returns
it in `message.reasoning_content`, never mixed into `message.content`.
"""
import os
from dataclasses import dataclass

DEFAULT_BASE_URL = os.environ.get("QWEN_SERVER_URL")          # None → run_fiche/make_client refuse to start
DEFAULT_API_KEY = os.environ.get("QWEN_API_KEY", "colab")
MODEL = os.environ.get("QWEN_MODEL", "Qwen3.6-27B-Q6_K.gguf")

# Per-request HTTP timeout on the OpenAI client — generous enough that any
# step's longest call can finish naturally.
REQUEST_TIMEOUT_SECONDS = 900

# How many parquet pages the structure step reads (front matter + TOC).
# pp.1-25 reliably covers every thesis tested so far.
STRUCTURE_PAGE_WINDOW = 25


@dataclass(frozen=True)
class StepConfig:
    """LLM sampling + budget profile for a single pipeline step."""
    name: str
    temperature: float
    top_p: float
    top_k: int
    max_tokens: int
    thinking_budget: int = 0          # 0 = no thinking, >0 = thinking with token cap
    timeout: int = REQUEST_TIMEOUT_SECONDS


# Step 1 — structure extraction (TOC + metadata): copy TOC entries into a
# compact pipe-delimited format. Output budget sized for ~300-entry TOCs.
STEP1_CONFIG = StepConfig(name="step1-structure", temperature=0.3, top_p=0.95, top_k=40,
                          max_tokens=8000, thinking_budget=0)

# Step 2 — intro / conclusion / abstract passes (2a / 2b / 2c).
STEP2_CONFIG = StepConfig(name="step2-intro-conclusion", temperature=0.6, top_p=0.95, top_k=40,
                          max_tokens=10000, thinking_budget=500)

# Step 2d — scoring pass: thinking OFF to avoid self-check loops.
STEP2D_SCORING_CONFIG = StepConfig(name="step2d-scoring", temperature=0.5, top_p=0.95, top_k=40,
                                   max_tokens=6000, thinking_budget=0)

# Step 3 — targeted chapter dives (3a methodology, 3b concepts).
STEP3_CONFIG = StepConfig(name="step3-chapter-dive", temperature=0.6, top_p=0.95, top_k=40,
                          max_tokens=6000, thinking_budget=500)
