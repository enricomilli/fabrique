"""
fiche/llm.py — the one function that talks to the model, plus the call log.

`llm_call(client, system, prompt, config, label)` streams a chat completion
from llama-server (OpenAI-compatible) with the step's sampling profile, retries
on transport errors and on `finish_reason == "length"` (a truncated structured
output would corrupt every downstream pass), and appends the FULL exchange —
system, prompt, think block, raw output, timings — to the run's call log
(`<out_dir>/<thesis>_calls.jsonl`, see `set_call_log`). That log is what
`tools/build_explorer.py` renders and what tests/replay_server.py replays.
"""
import json
import logging
import time
from typing import Optional

from openai import OpenAI

from .config import MODEL, StepConfig

log = logging.getLogger('fiche')

# ── Call log (JSONL, log-only) ───────────────────────────────────────────────

_CALL_LOG_PATH: Optional[str] = None


def set_call_log(path: Optional[str]) -> None:
    """Enable (path) / disable (None) the per-run call log."""
    global _CALL_LOG_PATH
    _CALL_LOG_PATH = path


def _log_call(rec: dict) -> None:
    if not _CALL_LOG_PATH:
        return
    try:
        rec["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with open(_CALL_LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError:
        pass


# ── Output cleanup ───────────────────────────────────────────────────────────

def clean_llm_output(text: str) -> str:
    """Strip end-of-turn markers that leak into `message.content` when the
    server runs with `--special` (Qwen `<|im_end|>`, Gemma `<turn|>` / `<end_of_turn>`)."""
    for marker in ("<|im_end|>", "<turn|>", "<end_of_turn>"):
        text = text.replace(marker, "")
    return text.strip()


# ── The call ─────────────────────────────────────────────────────────────────

def _consume_stream(stream, verbose: bool) -> tuple[str, str, Optional[str], Optional[float], float]:
    """Drain one streamed completion. Returns
    (content, reasoning, finish_reason, seconds_to_first_content, total_seconds)."""
    chunks: list[str] = []        # message.content
    rchunks: list[str] = []       # message.reasoning_content (think block)
    finish_reason = None
    first_chunk_time = None
    start_time = time.time()
    last_progress_time = start_time
    progress_interval = 5.0

    for event in stream:
        if not event.choices:
            continue
        choice = event.choices[0]
        delta = getattr(choice, "delta", None)
        if delta is not None:
            rpiece = getattr(delta, "reasoning_content", None)
            if rpiece:
                rchunks.append(rpiece)
            piece = getattr(delta, "content", None)
            if piece:
                if first_chunk_time is None:
                    first_chunk_time = time.time() - start_time
                    if verbose:
                        log.info(f"  [llm] stream started after {first_chunk_time:.2f}s")
                chunks.append(piece)
                now = time.time()
                if verbose and (now - last_progress_time) >= progress_interval:
                    elapsed = now - start_time
                    total_chars = sum(len(c) for c in chunks)
                    rate = total_chars / elapsed if elapsed > 0 else 0
                    tail = "".join(chunks)[-120:].replace("\n", " ")
                    log.info(f"  [llm] +{elapsed:5.1f}s  {total_chars:>6,} chars  {rate:>5.0f} ch/s  …{tail}")
                    last_progress_time = now
        if getattr(choice, "finish_reason", None):
            finish_reason = choice.finish_reason

    return "".join(chunks), "".join(rchunks), finish_reason, first_chunk_time, time.time() - start_time


def _sleep_for(e: Exception, retries: int, max_retries: int) -> None:
    """Back-off policy for transport errors; re-raises anything unexpected."""
    err = str(e).lower()
    if "524" in str(e) or "origin web server timed out" in err:
        log.warning(f"  [cloudflare 524] waiting 30s… (retry {retries}/{max_retries})")
        time.sleep(30)
    elif "rate" in err or "429" in err:
        log.warning(f"  [rate limit] waiting {30 * retries}s… (retry {retries}/{max_retries})")
        time.sleep(30 * retries)
    elif any(code in str(e) for code in ("500", "502", "503")) or "connection" in err or "timeout" in err:
        log.warning(f"  [server/connection error] waiting 15s… (retry {retries}/{max_retries}): {str(e)[:120]}")
        time.sleep(15)
    else:
        log.warning(f"  [unexpected error] {type(e).__name__}: {str(e)[:200]}")
        raise e


def llm_call(
    client: OpenAI,
    system: str,
    prompt: str,
    config: StepConfig,
    verbose: bool = True,
    label: str = "",
) -> str:
    """One chat completion with the step's profile. Returns the cleaned content.

    Streaming keeps the Cloudflare tunnel alive (~100 s idle timeout) and lets
    us print progress. Thinking is controlled via `thinking_budget_tokens` +
    `chat_template_kwargs.enable_thinking`; the think block arrives in
    `delta.reasoning_content` and is logged, never returned.
    Retries: up to 3 attempts on transport errors, on an empty stream, and on
    `finish_reason == "length"` (a truncated structured output would corrupt
    every downstream pass).
    """
    think_budget = config.thinking_budget
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    extra_body = {
        "top_k": config.top_k,
        "thinking_budget_tokens": think_budget,
        "chat_template_kwargs": {"enable_thinking": think_budget > 0},
    }

    def _record(reasoning, output, output_clean, finish, elapsed_s, first_content_s,
                reasoning_est_tokens, looks_cut, retries, discarded):
        _log_call(dict(
            label=label, system=system, prompt=prompt, reasoning=reasoning,
            output=output, output_clean=output_clean, finish=finish,
            budget=think_budget, temperature=config.temperature, top_p=config.top_p,
            top_k=config.top_k, max_tokens=config.max_tokens,
            elapsed_s=elapsed_s, first_content_s=first_content_s,
            reasoning_est_tokens=reasoning_est_tokens, looks_cut=looks_cut,
            retries=retries, discarded=discarded,
        ))

    retries = 0
    max_retries = 3
    while retries < max_retries:
        try:
            stream = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                temperature=config.temperature,
                top_p=config.top_p,
                max_tokens=config.max_tokens,
                extra_body=extra_body,
                stream=True,
                timeout=config.timeout,
            )
            raw_content, reasoning, finish_reason, first_chunk_time, total_time = _consume_stream(stream, verbose)
            r_est = round(len(reasoning) / 3.6)

            if not raw_content:
                raise RuntimeError(f"Model returned empty stream (finish={finish_reason}, {total_time:.1f}s total)")

            if finish_reason == "length" and retries < max_retries - 1:
                retries += 1
                log.warning(f"  [llm] ⚠ truncated at max_tokens={config.max_tokens} "
                            f"({len(raw_content):,} chars) — retrying ({retries}/{max_retries})…")
                _record(reasoning=reasoning, output=raw_content, output_clean="", finish=finish_reason,
                        elapsed_s=round(total_time, 2), first_content_s=round(first_chunk_time or 0, 2),
                        reasoning_est_tokens=r_est, looks_cut=None, retries=retries, discarded=True)
                continue

            content = clean_llm_output(raw_content)
            if verbose:
                thinking_note = f", thinking_budget={think_budget}" if think_budget > 0 else ""
                log.info(f"  [llm] DONE  {total_time:.1f}s, finish={finish_reason}, "
                         f"{len(content):,} chars (~{len(raw_content) // 4:,} tok){thinking_note}")
            tail = reasoning.rstrip()[-1:] if reasoning else ""
            looks_cut = (bool(reasoning) and (tail not in ".!?»\"')" or r_est >= int(think_budget * 0.9))
                         if think_budget > 0 else False)
            if verbose and think_budget > 0:
                log.info(f"  [llm] reasoning {len(reasoning):,} chars (~{r_est:,} tok) "
                         f"budget={think_budget} first_content={first_chunk_time or 0:.2f}s "
                         f"{'CUT?' if looks_cut else 'ended naturally'}")
            _record(reasoning=reasoning, output=raw_content, output_clean=content, finish=finish_reason,
                    elapsed_s=round(total_time, 2), first_content_s=round(first_chunk_time or 0, 2),
                    reasoning_est_tokens=r_est, looks_cut=looks_cut, retries=retries, discarded=False)
            return content

        except Exception as e:
            retries += 1
            if retries >= max_retries:
                raise RuntimeError(f"Max retries ({max_retries}) exceeded for LLM call. "
                                   f"Last error: {str(e)[:200]}") from e
            _sleep_for(e, retries, max_retries)
    raise RuntimeError(f"Max retries ({max_retries}) exceeded for LLM call")
