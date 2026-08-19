"""
note.run_note() archive contract, exercised with a FAKE `rlm` binary
(no model, no shim): the run directory layout, metadata.json, latest/ symlink,
the rlm invocation (cwd = rlm/, --file blob, --model, prompt) and the
degenerate-loop retry.
"""
import json
import os
import pathlib
import stat
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(REPO / "scripts"))

import note.pipeline as an  # noqa: E402
from layout import NOTE_RUN_FILES  # noqa: E402

FAKE_RLM = r'''#!/usr/bin/env python3
import json, os, sys, pathlib
# record how we were called (cwd + argv) next to this script
rec = pathlib.Path(__file__).with_name("rlm_calls.jsonl")
blob = sys.argv[sys.argv.index("--file") + 1]
with open(rec, "a") as fh:
    fh.write(json.dumps({"cwd": os.getcwd(), "argv": sys.argv[1:], "blob_head": blob,
                         "blob_first_line": open(blob, encoding="utf-8").readline().strip()}) + "\n")
n_words = int(os.environ.get("FAKE_RLM_WORDS", "1600"))
iters = int(os.environ.get("FAKE_RLM_ITERS", "9"))
print("# Note\n\n" + " ".join(["mot"] * n_words) + " (p. 12)<|im_end|>")
print(f"Completed in 88.5s | {iters} iterations | 0 sub-queries | success", file=sys.stderr)   # rlm prints the banner on stderr
'''


TRACE_CALLS = []


class _FakeShim(BaseHTTPRequestHandler):
    """Answers /api/tags and records POST /shim/trace bodies."""
    def log_message(self, *a):
        pass

    def _send(self, body: bytes):
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(b'{"models":[{"name":"Qwen3.6-27B-Q6_K.gguf"}]}')

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        TRACE_CALLS.append(json.loads(self.rfile.read(n) or b"{}"))
        self._send(b'{"dir": null}')


@pytest.fixture
def fake_env(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    rlm = bin_dir / "rlm"
    rlm.write_text(FAKE_RLM)
    rlm.chmod(rlm.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    srv = HTTPServer(("127.0.0.1", 0), _FakeShim)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    monkeypatch.setattr(an, "SHIM_URL", f"http://127.0.0.1:{srv.server_port}")
    TRACE_CALLS.clear()
    yield tmp_path, bin_dir / "rlm_calls.jsonl"
    srv.shutdown()


def test_run_note_archive_contract(fake_env, monkeypatch):
    tmp_path, calls_log = fake_env
    fx = HERE / "fixtures" / "note_bourse_v3"
    monkeypatch.setenv("FAKE_RLM_WORDS", "1600")
    meta = an.run_note("2027Bourse", fx / "fiche_used.md", REPO / "data" / "2027Bourse.parquet",
                       structure=fx / "1_structure.json", run_id="test_run",
                       results_root=str(tmp_path / "results"))
    thesis_dir = tmp_path / "results" / "2027Bourse"
    run_dir = thesis_dir / "note_runs" / "test_run"
    assert meta["run_dir"] == str(run_dir)
    for f in NOTE_RUN_FILES:
        assert (run_dir / f).exists(), f
    assert (run_dir / "trace").is_dir()
    assert (thesis_dir / "note_runs" / "latest").resolve() == run_dir.resolve()
    # note.md = rlm stdout, special tokens stripped; the deliverable is a copy at the top of the thesis dir
    note = (run_dir / "note.md").read_text(encoding="utf-8")
    assert note.startswith("# Note") and "<|im_end|>" not in note
    assert (thesis_dir / "2027Bourse_note.md").read_text(encoding="utf-8") == note
    assert meta["deliverable"] == str(thesis_dir / "2027Bourse_note.md")
    # metadata harvested from the banner
    assert meta["iterations"] == 9 and meta["rlm_status"] == "success" and meta["note_word_count"] >= 1600
    # rlm was invoked from rlm/ with the blob file and the model
    call = json.loads(calls_log.read_text().splitlines()[-1])
    assert pathlib.Path(call["cwd"]).resolve() == (REPO / "rlm").resolve()
    assert call["argv"][:2] == ["run", "--file"] and "--model" in call["argv"] and call["argv"][-1].startswith("Tu rédiges")
    # the prompt archived is the one built from the archived inputs (same date → same text)
    cfg = json.loads((run_dir / "config.json").read_text())
    assert cfg["rlm_config"].strip().splitlines()[0] == "max_iterations: 20"
    # the blob fed to rlm (--file <tempfile>) had page markers and was deleted afterwards
    blob_arg = call["argv"][call["argv"].index("--file") + 1]
    assert blob_arg.startswith(tempfile.gettempdir()) and not pathlib.Path(blob_arg).exists()
    assert pathlib.Path(call["blob_head"]).name == pathlib.Path(blob_arg).name and call["blob_first_line"] == "[p.1]"
    # the shim was told where to trace, then told to stop
    assert TRACE_CALLS == [{"dir": str((run_dir / "trace").resolve())}, {"dir": None}]


def test_run_note_retries_degenerate_runs(fake_env, monkeypatch):
    tmp_path, calls_log = fake_env
    fx = HERE / "fixtures" / "note_bourse_v3"
    monkeypatch.setenv("FAKE_RLM_WORDS", "400")        # too short → degenerate
    meta = an.run_note("2027Bourse", fx / "fiche_used.md", REPO / "data" / "2027Bourse.parquet",
                       structure=fx / "1_structure.json", run_id="first",
                       results_root=str(tmp_path / "results"), max_retries=1)
    calls = calls_log.read_text().splitlines()
    assert len(calls) == 2                                   # one retry
    runs = sorted(p.name for p in (tmp_path / "results" / "2027Bourse" / "note_runs").iterdir() if p.name != "latest")
    assert "first" in runs and len(runs) == 2                # retry got a fresh timestamp id
    assert 400 <= meta["note_word_count"] < 1500             # kept the last (still short) run, flagged in stderr
