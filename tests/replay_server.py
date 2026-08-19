#!/usr/bin/env python3
"""
replay_server.py — a fake llama-server that REPLAYS a recorded `<thesis>_calls.jsonl`.

Purpose: run the whole fiche pipeline end to end with no GPU, no tunnel, no
model, and prove that a code change is behaviour-preserving: the pipeline must
send exactly the recorded (system, prompt) pairs with exactly the recorded
sampling parameters, and — fed the recorded outputs — must write byte-identical
`_structure.json / _intro.json / _intro.md / _fiche.md` files.

It speaks just enough of the OpenAI chat API for `fiche/llm.py`:
  GET  /v1/models               → [{"id": MODEL}]
  POST /v1/chat/completions     → SSE stream (reasoning_content, then content)

Matching: a request is looked up by its exact (system, user) message pair.
Unknown prompt or any parameter mismatch → HTTP 400 with the reason (the
pipeline treats 400 as a hard error, so the test fails fast). Every served or
rejected request is appended to `<log>` as JSONL.

Usage (normally driven by tests/test_replay_fiche.py):
    python3 tests/replay_server.py --calls tests/fixtures/bourse_v3/2027Bourse_calls.jsonl \
        --model Qwen3.6-27B-Q6_K.gguf --port 18080 --log /tmp/replay.log
"""
import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CHECKED_PARAMS = ("temperature", "top_p", "top_k", "max_tokens")


class Replay:
    def __init__(self, calls_path, model, log_path=None):
        self.model = model
        self.log_path = log_path
        self.lock = threading.Lock()
        self.index = {}          # (system, prompt) -> [records in recorded order]
        self.served = 0
        self.rejected = 0
        with open(calls_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                self.index.setdefault((rec["system"], rec["prompt"]), []).append(rec)

    def log(self, entry):
        if not self.log_path:
            return
        with self.lock, open(self.log_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def lookup(self, payload):
        """Return (record, None) or (None, reason)."""
        msgs = payload.get("messages") or []
        if len(msgs) != 2 or msgs[0].get("role") != "system" or msgs[1].get("role") != "user":
            return None, f"unexpected message shape: {[m.get('role') for m in msgs]}"
        key = (msgs[0].get("content"), msgs[1].get("content"))
        with self.lock:
            recs = self.index.get(key)
            if not recs:
                # help the caller: which recorded prompt is closest by label/prefix?
                heads = sorted({(r["label"], r["prompt"][:60]) for v in self.index.values() for r in v})
                return None, ("no recorded call for this (system, prompt); "
                              f"user prompt head={key[1][:80]!r}; known heads={heads}")
            rec = recs.pop(0) if len(recs) > 1 else recs[0]   # discarded attempts first, final stays
        # parameter checks — the whole point of the replay
        problems = []
        if payload.get("model") != self.model:
            problems.append(f"model {payload.get('model')!r} != {self.model!r}")
        for k in CHECKED_PARAMS:
            if payload.get(k) != rec.get(k):
                problems.append(f"{k}: sent {payload.get(k)!r}, recorded {rec.get(k)!r}")
        if payload.get("thinking_budget_tokens") != rec.get("budget"):
            problems.append(f"thinking_budget_tokens: sent {payload.get('thinking_budget_tokens')!r}, "
                            f"recorded {rec.get('budget')!r}")
        want_think = (rec.get("budget") or 0) > 0
        ctk = payload.get("chat_template_kwargs") or {}
        if ctk.get("enable_thinking") != want_think:
            problems.append(f"enable_thinking: sent {ctk.get('enable_thinking')!r}, expected {want_think}")
        if not payload.get("stream"):
            problems.append("stream must be true")
        if problems:
            return None, f"label {rec.get('label')}: " + "; ".join(problems)
        return rec, None


def sse_chunks(rec, model):
    """Yield SSE lines reproducing the recorded exchange in several deltas."""
    created = int(time.time())

    def chunk(delta, finish=None):
        body = {"id": "replay", "object": "chat.completion.chunk", "created": created,
                "model": model, "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
        return "data: " + json.dumps(body, ensure_ascii=False) + "\n\n"

    yield chunk({"role": "assistant"})
    reasoning = rec.get("reasoning") or ""
    for i in range(0, len(reasoning), 700):
        yield chunk({"reasoning_content": reasoning[i:i + 700]})
    output = rec.get("output") or ""
    step = max(1, len(output) // 12)
    for i in range(0, len(output), step):
        yield chunk({"content": output[i:i + step]})
    yield chunk({}, finish=rec.get("finish") or "stop")
    yield "data: [DONE]\n\n"


def make_handler(replay):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):   # silence default access log
            pass

        def _json(self, code, obj):
            data = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.rstrip("/").endswith("/models"):
                return self._json(200, {"object": "list", "data": [{"id": replay.model, "object": "model"}]})
            if self.path.rstrip("/").endswith("/health"):
                return self._json(200, {"status": "ok"})
            self._json(404, {"error": f"no route {self.path}"})

        def do_POST(self):
            if not self.path.rstrip("/").endswith("/chat/completions"):
                return self._json(404, {"error": f"no route {self.path}"})
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n) or b"{}")
            rec, reason = replay.lookup(payload)
            if rec is None:
                replay.rejected += 1
                replay.log({"ok": False, "reason": reason})
                return self._json(400, {"error": {"message": "replay mismatch: " + reason}})
            replay.served += 1
            replay.log({"ok": True, "label": rec.get("label")})
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            for piece in sse_chunks(rec, replay.model):
                self.wfile.write(piece.encode("utf-8"))
                self.wfile.flush()
    return Handler


def serve(calls_path, model, port, log_path=None):
    replay = Replay(calls_path, model, log_path)
    srv = ThreadingHTTPServer(("127.0.0.1", port), make_handler(replay))
    srv.daemon_threads = True
    return srv, replay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calls", required=True)
    ap.add_argument("--model", default="Qwen3.6-27B-Q6_K.gguf")
    ap.add_argument("--port", type=int, default=18080)
    ap.add_argument("--log", default=None)
    a = ap.parse_args()
    srv, _ = serve(a.calls, a.model, a.port, a.log)
    print(f"replay server on http://127.0.0.1:{a.port}/v1  ({a.calls})", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
