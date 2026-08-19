"""
note/shim.py — Ollama-compatible facade in front of llama-server, for rlm-cli.

Why it exists
    rlm-cli only knows "Ollama": it probes GET /api/tags on 127.0.0.1:11434 and
    then sends OpenAI-style chat completions to `<base>/v1/chat/completions`
    with `Bearer ollama`. Its requests carry NO sampling parameters
    ({model, messages, stream, stream_options, max_completion_tokens: 4096}).
    This shim (1) answers /api/tags with one fake model, (2) proxies /v1/* to
    the real server with the real API key, and (3) injects the validated note
    sampling + the v3 fixes into every chat request (see ShimConfig).

Run (v3 note configuration, 2026-08-19):
    export QWEN_SERVER_URL=https://<tunnel>.trycloudflare.com/v1  QWEN_API_KEY=colab
    export SHIM_MODEL_NAME=Qwen3.6-27B-Q6_K.gguf
    export SHIM_TEMPERATURE=0.6 SHIM_TOP_K=20 SHIM_TOP_P=0.95
    export SHIM_STABLE_PREFIX=1 SHIM_THINK_BUDGET=1500 SHIM_MAX_TOKENS=8192
    python3 scripts/run_shim.py               # binds 127.0.0.1:11434

Env (all SHIM_* optional — unset = pass the request through untouched):
    QWEN_SERVER_URL      upstream base URL (with or without /v1)        required
    QWEN_API_KEY         upstream bearer token                           required
    SHIM_MODEL_NAME       model name advertised on /api/tags   (default Qwen3.6-27B-Q6_K.gguf)
    SHIM_PORT             listen port                          (default 11434)
    SHIM_TEMPERATURE / SHIM_TOP_K / SHIM_TOP_P    sampling written into every chat request
    SHIM_THINK_BUDGET     thinking_budget_tokens (set only if the request has none)
    SHIM_ENABLE_THINKING  1/0 → chat_template_kwargs.enable_thinking (do NOT set for rlm:
                          it needs thinking between tool calls)
    SHIM_MAX_TOKENS       overrides max_completion_tokens / max_tokens (rlm hard-codes 4096;
                          a 2,000-word assembly pass needs ~5k tokens → 8192)
    SHIM_STABLE_PREFIX    1 → strip rlm-cli's per-turn countdown ("You have N iteration(s)
                          remaining…") from the system prompt. That line changes every
                          turn at char ~150, so the KV-cache prefix diverged at token ~40
                          and llama-server re-prefilled 18-42k tokens per turn. rlm-cli
                          repeats the budget at the end of each user turn anyway.

Tracing: `POST /shim/trace {"dir": "/abs/path"}` makes the shim dump every chat
exchange into that directory as NNN_{root|subquery}.json until
`POST /shim/trace {"dir": null}` (note/pipeline.py does this around each run;
tools/build_explorer.py and tools/trace_grounding.py read the dumps).
`GET /shim/trace` returns the current setting.
"""
import asyncio
import itertools
import json
import os
import pathlib
import re
import sys
import time
from dataclasses import dataclass
from typing import Optional

from aiohttp import ClientSession, ClientTimeout, web

COUNTDOWN_RE = re.compile(r"You have \d+ iteration\(s\) remaining[^\n]*\n?")
SUBQUERY_SYSTEM_PREFIX = "You are a helpful assistant"      # rlm's sub-query system prompt


# ── Configuration (read once) ────────────────────────────────────────────────

def _env_flag(name: str) -> Optional[bool]:
    v = os.environ.get(name)
    if v is None:
        return None
    return v.lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class ShimConfig:
    upstream_url: str
    upstream_key: str
    model_name: str = "Qwen3.6-27B-Q6_K.gguf"
    port: int = 11434
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    think_budget: Optional[int] = None
    enable_thinking: Optional[bool] = None
    max_tokens: Optional[int] = None
    stable_prefix: bool = False

    @classmethod
    def from_env(cls) -> "ShimConfig":
        url = os.environ.get("QWEN_SERVER_URL", "").rstrip("/")
        if url.endswith("/v1"):
            url = url[:-3]
        key = os.environ.get("QWEN_API_KEY", "")
        if not url or not key:
            print("ERROR: set QWEN_SERVER_URL and QWEN_API_KEY", file=sys.stderr)
            sys.exit(1)
        g = os.environ.get
        return cls(
            upstream_url=url, upstream_key=key,
            model_name=g("SHIM_MODEL_NAME", cls.model_name),
            port=int(g("SHIM_PORT", cls.port)),
            temperature=float(g("SHIM_TEMPERATURE")) if g("SHIM_TEMPERATURE") else None,
            top_k=int(g("SHIM_TOP_K")) if g("SHIM_TOP_K") else None,
            top_p=float(g("SHIM_TOP_P")) if g("SHIM_TOP_P") else None,
            think_budget=int(g("SHIM_THINK_BUDGET")) if g("SHIM_THINK_BUDGET") is not None else None,
            enable_thinking=_env_flag("SHIM_ENABLE_THINKING"),
            max_tokens=int(g("SHIM_MAX_TOKENS")) if g("SHIM_MAX_TOKENS") else None,
            stable_prefix=bool(g("SHIM_STABLE_PREFIX")),
        )

    def describe(self) -> str:
        active = {k: v for k, v in self.__dict__.items()
                  if k not in ("upstream_url", "upstream_key", "model_name", "port") and v not in (None, False)}
        return ", ".join(f"{k}={v}" for k, v in active.items()) or "passthrough (no injections)"


# ── The request transform (pure: payload in → payload out) ──────────────────

def transform_payload(payload: dict, cfg: ShimConfig) -> dict:
    """Apply the configured injections to one chat-completions payload.
    Mutates and returns `payload`. Tested black-box in tests/test_frozen_surface.py."""
    if cfg.think_budget is not None:
        payload.setdefault("thinking_budget_tokens", cfg.think_budget)
    if cfg.enable_thinking is not None:
        payload.setdefault("chat_template_kwargs", {})["enable_thinking"] = cfg.enable_thinking
    if cfg.max_tokens is not None:
        for k in ("max_completion_tokens", "max_tokens"):
            if k in payload:
                payload[k] = cfg.max_tokens
        if "max_completion_tokens" not in payload and "max_tokens" not in payload:
            payload["max_tokens"] = cfg.max_tokens
    if cfg.temperature is not None:
        payload["temperature"] = cfg.temperature
    if cfg.top_k is not None:
        payload["top_k"] = cfg.top_k
    if cfg.top_p is not None:
        payload["top_p"] = cfg.top_p
    if cfg.stable_prefix:
        msgs = payload.get("messages") or []
        if msgs and msgs[0].get("role") == "system":
            system = str(msgs[0].get("content", ""))
            if COUNTDOWN_RE.search(system):
                msgs[0]["content"] = COUNTDOWN_RE.sub("", system, count=1)
    return payload


# ── Trace dumps ──────────────────────────────────────────────────────────────

_trace_state = {"dir": None, "counter": itertools.count(1)}
_trace_lock = asyncio.Lock()


def current_trace_dir() -> Optional[pathlib.Path]:
    d = _trace_state["dir"]
    return d if d and d.is_dir() else None


def set_trace_dir(path: Optional[str]) -> Optional[pathlib.Path]:
    """Start (path) / stop (None) dumping exchanges; file numbering restarts at 001."""
    d = pathlib.Path(path) if path else None
    if d is not None:
        d.mkdir(parents=True, exist_ok=True)
    _trace_state["dir"] = d
    _trace_state["counter"] = itertools.count(1)
    return d


async def dump_exchange(req_payload: dict, resp_text: str, resp_status: int, elapsed: float) -> None:
    async with _trace_lock:
        d = current_trace_dir()
        if d is None:
            return
        n = next(_trace_state["counter"])
        # root iterations carry the RLM agent system prompt; sub-queries the
        # "helpful assistant" one (message count alone misclassifies turn 1)
        messages = req_payload.get("messages", [])
        sys_content = str(messages[0].get("content", "")) if messages else ""
        kind = "subquery" if sys_content.startswith(SUBQUERY_SYSTEM_PREFIX) else "root"
        out = {"kind": kind, "status": resp_status, "elapsed_s": round(elapsed, 2),
               "request": req_payload, "response_raw": resp_text}
        try:
            out["response"] = json.loads(resp_text) if resp_text else None
        except Exception:
            out["response"] = None
        (d / f"{n:03d}_{kind}.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


# ── HTTP handlers ────────────────────────────────────────────────────────────

def make_app(cfg: ShimConfig) -> web.Application:
    async def health(request):
        return web.Response(text="Ollama is running")

    async def trace_control(request):
        """GET → current trace dir; POST {"dir": path|null} → set/clear it."""
        if request.method == "POST":
            try:
                body = await request.json()
            except Exception:
                return web.json_response({"error": "expected JSON {\"dir\": path|null}"}, status=400)
            d = set_trace_dir(body.get("dir"))
            print(f"trace → {d or 'off'}", file=sys.stderr)
        d = current_trace_dir()
        return web.json_response({"dir": str(d) if d else None})

    async def tags(request):
        return web.json_response({"models": [{
            "name": cfg.model_name, "model": cfg.model_name,
            "modified_at": "2026-04-23T00:00:00Z", "size": 23_000_000_000,
            "digest": "sha256:" + "fake" * 16,
            "details": {"format": "gguf", "family": "qwen", "parameter_size": "27B",
                        "quantization_level": "Q6_K"},
        }]})

    async def proxy_v1(request):
        upstream_path = f"/v1/{request.match_info['path']}"
        target = f"{cfg.upstream_url}{upstream_path}"
        headers = dict(request.headers)
        headers.pop("Host", None)
        headers.pop("Content-Length", None)
        headers["Authorization"] = f"Bearer {cfg.upstream_key}"
        body = await request.read()

        is_chat = request.method == "POST" and upstream_path == "/v1/chat/completions" and bool(body)
        req_payload = None
        if is_chat:
            try:
                req_payload = transform_payload(json.loads(body), cfg)
                body = json.dumps(req_payload).encode()
            except (ValueError, TypeError):
                req_payload = None
        print(f"→ {request.method} {upstream_path}  ({len(body)} B)", file=sys.stderr)

        t0 = time.time()
        timeout = ClientTimeout(total=600)
        passthrough_headers = lambda r: {k: v for k, v in r.headers.items()   # noqa: E731
                                         if k.lower() not in {"content-encoding", "transfer-encoding", "content-length"}}

        if req_payload is not None and current_trace_dir() is not None:
            # Traced: buffer the whole response so it can be dumped. rlm-cli
            # buffers the full body itself (stream_options), so not streaming
            # back is fine.
            async with ClientSession(timeout=timeout) as s:
                async with s.request(request.method, target, data=body, headers=headers) as r:
                    full_body = b"".join([c async for c in r.content.iter_any()])
                    elapsed = time.time() - t0
                    await dump_exchange(req_payload, full_body.decode("utf-8", errors="replace"), r.status, elapsed)
                    print(f"← {r.status} ({elapsed:.1f}s, {len(full_body)} B, traced)", file=sys.stderr)
                    return web.Response(status=r.status, body=full_body, headers=passthrough_headers(r))

        # Normal path: stream upstream chunks straight back.
        async with ClientSession(timeout=timeout) as s:
            async with s.request(request.method, target, data=body, headers=headers) as r:
                resp = web.StreamResponse(status=r.status, headers=passthrough_headers(r))
                await resp.prepare(request)
                async for chunk in r.content.iter_any():
                    await resp.write(chunk)
                await resp.write_eof()
                print(f"← {r.status}", file=sys.stderr)
                return resp

    app = web.Application()
    app.router.add_get("/", health)
    app.router.add_get("/api/tags", tags)
    app.router.add_route("*", "/shim/trace", trace_control)
    app.router.add_route("*", "/v1/{path:.*}", proxy_v1)
    return app


def main():
    cfg = ShimConfig.from_env()
    print(f"Shim listening on http://127.0.0.1:{cfg.port} → {cfg.upstream_url}", file=sys.stderr)
    print(f"Exposing model: {cfg.model_name}", file=sys.stderr)
    print(f"Injections: {cfg.describe()}", file=sys.stderr)
    web.run_app(make_app(cfg), host="127.0.0.1", port=cfg.port, access_log=None)


if __name__ == "__main__":
    main()
