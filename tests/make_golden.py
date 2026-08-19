#!/usr/bin/env python3
"""
make_golden.py — (re)generate the golden files under tests/golden/ from a given
scripts directory.

    python3 tests/make_golden.py                      # from scripts/ (after an A/B-validated promotion)

Golden files are the frozen behaviour the tests compare against:
  golden/prompt_hashes.json   sha256 of every prompt string / step config / regex
                              of the fiche pipeline, the note prompt on fixed
                              inputs, the note blob per parquet, the TOC map
  golden/shim_golden.json     what the shim forwards upstream for a set of
                              fixture requests under the v3 env and under an
                              empty env (black-box, shim run as a subprocess)

Regenerate ONLY when a behaviour change has been validated by an A/B run and
promoted — never to make a failing test pass.
"""
import argparse
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
GOLDEN = HERE / "golden"

# ── what we freeze in the fiche pipeline ────────────────────────────────────
FICHE_STRINGS = [
    "STRUCTURE_SYSTEM", "STRUCTURE_PROMPT", "SECTION_DESCRIPTIONS", "C12_CITATION_RULE",
    "STEP2_SYSTEM", "STEP2A_INTRO_PROMPT", "STEP2B_CONCLUSION_PROMPT",
    "STEP2C_ABSTRACT_PROMPT", "STEP2C_SCORE_PROMPT",
    "STEP3A_SYSTEM", "STEP3A_PROMPT", "STEP3B_SYSTEM", "STEP3B_PROMPT",
]
FICHE_LISTS = ["STEP2_SECTIONS", "GRILLE_HEADINGS"]
FICHE_CONFIGS = ["STEP1_CONFIG", "STEP2_CONFIG", "STEP2D_SCORING_CONFIG", "STEP3_CONFIG"]
FICHE_REGEXES = [
    "METHODOLOGY_TITLE_RE", "PART_EXPLICIT_RE", "FRONTMATTER_RE", "BACKMATTER_RE",
    "NUMBERED_CHAPTER_RE", "INTRO_TITLE_RE", "CONCLUSION_TITLE_RE", "ABSTRACT_TITLE_RE",
    "KEYWORDS_RE", "STEP2C_UNCHANGED_RE",
]
FICHE_INTS = ["STRUCTURE_PAGE_WINDOW", "REQUEST_TIMEOUT_SECONDS"]


def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


FICHE_SUBMODULES = ("config", "prompts", "llm", "blobs", "structure", "step2", "step3", "render", "gate", "pipeline")


def getattr_any(mod, name):
    """Resolve NAME on a module; for the `fiche` package, look through its
    submodules (the package itself only exports the public API)."""
    candidates = [mod]
    if getattr(mod, "__name__", "") == "fiche":
        import importlib
        candidates += [importlib.import_module(f"fiche.{m}") for m in FICHE_SUBMODULES]
    for m in candidates:
        if hasattr(m, name):
            return getattr(m, name)
    raise AttributeError(f"{mod.__name__} has no {name}")


def import_fiche(scripts_dir: pathlib.Path):
    """Import the `fiche` package from `scripts_dir` (fresh, so two dirs can be compared)."""
    sys.path.insert(0, str(scripts_dir))
    import importlib
    for k in [k for k in sys.modules if k == "fiche" or k.startswith("fiche.")]:
        del sys.modules[k]
    return importlib.import_module("fiche")


def fiche_surface(mod) -> dict:
    out = {}
    for n in FICHE_STRINGS:
        out[n] = sha(getattr_any(mod, n))
    for n in FICHE_LISTS:
        out[n] = sha(json.dumps(getattr_any(mod, n), ensure_ascii=False))
    for n in FICHE_CONFIGS:
        c = getattr_any(mod, n)
        out[n] = json.dumps({k: getattr(c, k) for k in
                             ("name", "temperature", "top_p", "top_k", "max_tokens", "thinking_budget", "timeout")},
                            sort_keys=True)
    for n in FICHE_REGEXES:
        r = getattr_any(mod, n)
        out[n] = json.dumps({"pattern": r.pattern, "flags": r.flags})
    for n in FICHE_INTS:
        out[n] = getattr_any(mod, n)
    return out


# ── note pipeline surface ───────────────────────────────────────────────────
NOTE_FIXED = {
    "fiche_text": "# FICHE\n\n## Thèse centrale\n\nx « y » (p. 3)\n",
    "style_example": "# Style\n\nUn paragraphe.\n",
    "toc_map": "- Introduction  [p.1]–[p.2]\n  - 1.1 Sous  [p.2]\n",
    "model_name": "Qwen3.6-27B-Q6_K.gguf",
    "run_date": "2026-08-19",
}


def import_note(scripts_dir: pathlib.Path):
    """Import the `note` package from `scripts_dir`."""
    sys.path.insert(0, str(scripts_dir))
    import importlib
    for k in [k for k in sys.modules if k == "note" or k.startswith("note.")]:
        del sys.modules[k]
    return importlib.import_module("note")


def shim_script(scripts_dir: pathlib.Path) -> pathlib.Path:
    return scripts_dir / "run_shim.py"


def note_surface(scripts_dir: pathlib.Path) -> dict:
    mod = import_note(scripts_dir)
    out = {}
    out["build_prompt(fixed)"] = sha(mod.build_prompt(**NOTE_FIXED))
    out["build_prompt(fixed, no toc)"] = sha(mod.build_prompt(
        NOTE_FIXED["fiche_text"], NOTE_FIXED["style_example"], "", NOTE_FIXED["model_name"], NOTE_FIXED["run_date"]))
    out["build_prompt(fixed, no model)"] = sha(mod.build_prompt(
        NOTE_FIXED["fiche_text"], NOTE_FIXED["style_example"], NOTE_FIXED["toc_map"], "", NOTE_FIXED["run_date"]))
    for parquet in sorted((REPO / "data").glob("*.parquet")):
        out[f"build_blob({parquet.name})"] = sha(mod.build_blob(str(parquet)))
    out["render_toc_map(bourse_v3 structure)"] = sha(
        mod.render_toc_map(HERE / "fixtures" / "note_bourse_v3" / "1_structure.json"))
    # the real v3 prompt, reproduced from its inputs
    fx = HERE / "fixtures" / "note_bourse_v3"
    prompt = mod.build_prompt(
        (fx / "fiche_used.md").read_text(encoding="utf-8"),
        (fx / "style_used.md").read_text(encoding="utf-8"),
        toc_map=mod.render_toc_map(fx / "1_structure.json"),
        model_name="Qwen3.6-27B-Q6_K.gguf", run_date="2026-08-19")
    out["v3 prompt reproduced"] = prompt == (fx / "prompt.txt").read_text(encoding="utf-8")
    return out


# ── shim black-box ──────────────────────────────────────────────────────────
SHIM_ENV_V3 = {"SHIM_TEMPERATURE": "0.6", "SHIM_TOP_K": "20", "SHIM_TOP_P": "0.95",
               "SHIM_STABLE_PREFIX": "1", "SHIM_THINK_BUDGET": "1500", "SHIM_MAX_TOKENS": "8192"}
COUNTDOWN = ("You have 17 iteration(s) remaining and 15 sub-query call(s) remaining out of 15 total.\n")
RLM_SYSTEM = ("You are an RLM agent. " + COUNTDOWN + "Use the REPL to read `context`.\n")


def shim_fixture_requests():
    return {
        "root_turn": {
            "model": "Qwen3.6-27B-Q6_K.gguf",
            "messages": [{"role": "system", "content": RLM_SYSTEM},
                         {"role": "user", "content": "Iteration 1/20. Sub-queries used: 0/15.\n\nTask…"}],
            "stream": True, "stream_options": {"include_usage": True}, "max_completion_tokens": 4096,
        },
        "root_turn_multi": {
            "model": "Qwen3.6-27B-Q6_K.gguf",
            "messages": [{"role": "system", "content": RLM_SYSTEM},
                         {"role": "user", "content": "Iteration 1/20…"},
                         {"role": "assistant", "content": "```python\nprint(context[:10])\n```"},
                         {"role": "user", "content": "Iteration 2/20. Sub-queries used: 0/15.\n\n[p.1] Thèse"}],
            "stream": True, "stream_options": {"include_usage": True}, "max_completion_tokens": 4096,
        },
        "subquery": {
            "model": "Qwen3.6-27B-Q6_K.gguf",
            "messages": [{"role": "system", "content": "You are a helpful assistant."},
                         {"role": "user", "content": "Summarise: …"}],
            "stream": True, "stream_options": {"include_usage": True}, "max_completion_tokens": 4096,
        },
        "no_system_with_max_tokens": {
            "model": "Qwen3.6-27B-Q6_K.gguf",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": False, "max_tokens": 100, "temperature": 0.1,
        },
        "fiche_style_call": {   # the fiche script's own requests pass through the shim too
            "model": "Qwen3.6-27B-Q6_K.gguf",
            "messages": [{"role": "system", "content": "Tu es un expert."}, {"role": "user", "content": "Voici…"}],
            "temperature": 0.6, "top_p": 0.95, "max_tokens": 10000, "stream": True,
            "top_k": 40, "thinking_budget_tokens": 500, "chat_template_kwargs": {"enable_thinking": True},
        },
    }


class _Echo(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        out = {"path": self.path, "auth": self.headers.get("Authorization"),
               "body": json.loads(body) if body else None}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        out = {"path": self.path, "auth": self.headers.get("Authorization"), "body": None}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def run_shim_blackbox(scripts_dir: pathlib.Path, extra_env: dict) -> dict:
    """Start an echo upstream + the shim (subprocess), send the fixture requests,
    return {name: {status, upstream_path, auth, body}} + /api/tags."""
    up_port, shim_port = free_port(), free_port()
    up = ThreadingHTTPServer(("127.0.0.1", up_port), _Echo)
    threading.Thread(target=up.serve_forever, daemon=True).start()
    env = {k: v for k, v in os.environ.items() if not k.startswith("SHIM_")}
    env.update({"QWEN_SERVER_URL": f"http://127.0.0.1:{up_port}/v1", "QWEN_API_KEY": "real-key",
                "SHIM_PORT": str(shim_port), "SHIM_MODEL_NAME": "Qwen3.6-27B-Q6_K.gguf"})
    env.update(extra_env)
    proc = subprocess.Popen([sys.executable, str(shim_script(scripts_dir))], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{shim_port}/", timeout=0.5)
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("shim did not start")
        out = {}
        out["/api/tags"] = json.loads(urllib.request.urlopen(
            f"http://127.0.0.1:{shim_port}/api/tags", timeout=5).read())
        for name, payload in shim_fixture_requests().items():
            req = urllib.request.Request(
                f"http://127.0.0.1:{shim_port}/v1/chat/completions", data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json", "Authorization": "Bearer ollama"}, method="POST")
            with urllib.request.urlopen(req, timeout=10) as r:
                echoed = json.loads(r.read())
                out[name] = {"status": r.status, "upstream_path": echoed["path"],
                             "auth": echoed["auth"], "body": echoed["body"]}
        # trace control endpoint: set → reported, one traced exchange lands in the dir, clear → off
        import tempfile as _tf
        tdir = _tf.mkdtemp(prefix="shim_trace_")
        req = urllib.request.Request(f"http://127.0.0.1:{shim_port}/shim/trace", data=json.dumps({"dir": tdir}).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        out["trace_set"] = json.loads(urllib.request.urlopen(req, timeout=5).read()) == {"dir": tdir}
        req = urllib.request.Request(
            f"http://127.0.0.1:{shim_port}/v1/chat/completions", data=json.dumps(shim_fixture_requests()["subquery"]).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer ollama"}, method="POST")
        urllib.request.urlopen(req, timeout=10).read()
        out["trace_files"] = sorted(p.name for p in pathlib.Path(tdir).iterdir())
        req = urllib.request.Request(f"http://127.0.0.1:{shim_port}/shim/trace", data=json.dumps({"dir": None}).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        out["trace_cleared"] = json.loads(urllib.request.urlopen(req, timeout=5).read()) == {"dir": None}
        # a non-chat path is proxied untouched
        req = urllib.request.Request(f"http://127.0.0.1:{shim_port}/v1/models",
                                     headers={"Authorization": "Bearer ollama"})
        with urllib.request.urlopen(req, timeout=10) as r:
            echoed = json.loads(r.read())
            out["GET /v1/models"] = {"status": r.status, "upstream_path": echoed["path"], "auth": echoed["auth"]}
        return out
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        up.shutdown()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scripts-dir", default=str(REPO / "scripts"))
    ap.add_argument("--only", choices=["prompts", "shim"], default=None)
    a = ap.parse_args()
    scripts_dir = pathlib.Path(a.scripts_dir).resolve()
    GOLDEN.mkdir(exist_ok=True)

    if a.only in (None, "prompts"):
        fiche = fiche_surface(import_fiche(scripts_dir))
        note = note_surface(scripts_dir)
        (GOLDEN / "prompt_hashes.json").write_text(
            json.dumps({"_source": str(scripts_dir), "fiche": fiche, "note": note}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8")
        print(f"wrote {GOLDEN / 'prompt_hashes.json'}  ({len(fiche)} fiche entries, {len(note)} note entries)")
        if note.get("v3 prompt reproduced") is not True:
            print("WARNING: v3 note prompt NOT reproduced from its inputs", file=sys.stderr)

    if a.only in (None, "shim"):
        shim = {"_source": str(scripts_dir),
                "v3_env": run_shim_blackbox(scripts_dir, SHIM_ENV_V3),
                "empty_env": run_shim_blackbox(scripts_dir, {})}
        (GOLDEN / "shim_golden.json").write_text(json.dumps(shim, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN / 'shim_golden.json'}")


if __name__ == "__main__":
    main()
