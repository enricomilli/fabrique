"""
End-to-end regression of the fiche pipeline, offline.

For each recorded v3 run in tests/fixtures/<thesis>_v3/ we start the replay
server on its `_calls.jsonl`, run `scripts/run_fiche.py` against it
exactly as documented (same CLI flags, same env), and require that every output
file is byte-identical to the recorded one. Any change to a prompt, a sampling
parameter, the step order, the parsers, the renderer or the citation gate makes
this fail — which is the point.

Run:  cd current_repo && python3 -m pytest tests -q
"""
import json
import os
import pathlib
import subprocess
import sys
import threading

import pytest

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
SCRIPT = REPO / "scripts" / "run_fiche.py"
MODEL = "Qwen3.6-27B-Q6_K.gguf"

sys.path.insert(0, str(HERE))
import replay_server  # noqa: E402

CASES = {
    "bourse_v3": ("2027Bourse", 18081),
    "daley_v3": ("daley_thesis", 18082),
}
# fixture file name → path relative to the thesis dir (results layout, scripts/layout.py)
COMPARED = {"{t}_fiche.md": "{t}_fiche.md",
            "1_structure.json": "fiche_steps/1_structure.json", "sections.json": "fiche_steps/sections.json",
            "2_merged.md": "fiche_steps/2_merged.md", "2a_intro.md": "fiche_steps/2a_intro.md",
            "2b_conclusion.md": "fiche_steps/2b_conclusion.md", "2c_abstract_delta.md": "fiche_steps/2c_abstract_delta.md",
            "2d_scoring.md": "fiche_steps/2d_scoring.md", "fiche_before_gate.md": "fiche_steps/fiche_before_gate.md",
            "citation_fixes.json": "fiche_steps/citation_fixes.json"}


def _run_pipeline(thesis, parquet, out_dir, base_url, steps):
    env = dict(os.environ, QWEN_MODEL=MODEL, PYTHONUNBUFFERED="1")
    logs = []
    for step in steps:
        cmd = [sys.executable, str(SCRIPT), str(parquet), "--step", step,
               "--output-dir", str(out_dir), "--base-url", base_url, "--api-key", "replay"]
        p = subprocess.run(cmd, cwd=str(REPO), env=env, capture_output=True, text=True, timeout=600)
        logs.append(p.stdout + p.stderr)
        assert p.returncode == 0, f"--step {step} failed:\n{p.stdout[-3000:]}\n{p.stderr[-3000:]}"
    return "\n".join(logs)


@pytest.fixture(scope="module", params=sorted(CASES))
def replayed(request, tmp_path_factory):
    case = request.param
    thesis, port = CASES[case]
    fx = HERE / "fixtures" / case
    parquet = REPO / "data" / f"{thesis}.parquet"
    if not parquet.exists():
        pytest.skip(f"{parquet} missing")
    log_path = tmp_path_factory.mktemp("replay") / "replay.log"
    srv, replay = replay_server.serve(str(fx / "calls.jsonl"), MODEL, port, str(log_path))
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    try:
        out_dir = tmp_path_factory.mktemp(f"out_{case}")
        log = _run_pipeline(thesis, parquet, out_dir, f"http://127.0.0.1:{port}/v1", ["all"])
        yield case, thesis, fx, out_dir, replay, log
    finally:
        srv.shutdown()


def test_every_recorded_call_was_replayed(replayed):
    case, thesis, fx, out_dir, replay, log = replayed
    n_recorded = sum(1 for _ in open(fx / "calls.jsonl", encoding="utf-8") if _.strip())
    assert replay.rejected == 0, f"replay rejected requests — see log:\n{log[-2000:]}"
    assert replay.served == n_recorded, f"served {replay.served} calls, recorded {n_recorded}"


@pytest.mark.parametrize("fixture_name", sorted(COMPARED))
def test_output_identical(replayed, fixture_name):
    case, thesis, fx, out_dir, replay, log = replayed
    exp = (fx / fixture_name.format(t=thesis)).read_bytes()
    got_p = out_dir / COMPARED[fixture_name].format(t=thesis)
    assert got_p.exists(), f"{got_p} not produced"
    got = got_p.read_bytes()
    if got != exp:
        # readable diff for the first divergence
        import difflib
        d = "\n".join(list(difflib.unified_diff(
            exp.decode("utf-8", "replace").splitlines(), got.decode("utf-8", "replace").splitlines(),
            "recorded", "replayed", lineterm="", n=2))[:80])
        pytest.fail(f"{got_p.name} differs from the recorded v3 output:\n{d}")


def test_call_log_written(replayed):
    case, thesis, fx, out_dir, replay, log = replayed
    p = out_dir / "fiche_steps" / "calls.jsonl"
    assert p.exists()
    recs = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    labels = [r["label"] for r in recs]
    assert sorted(labels) == sorted(["1", "2a", "2b", "2c", "2d", "3a", "3b"]), labels
    for r in recs:
        for k in ("system", "prompt", "reasoning", "output", "output_clean", "finish",
                  "budget", "temperature", "top_p", "top_k", "max_tokens", "elapsed_s"):
            assert k in r, f"call log record missing {k}"


def test_step_by_step_equals_all(tmp_path):
    """`--step 1`, `--step 2`, `--step 3` in sequence (the documented way) must
    produce the same files as `--step all` — the disk round-trips are lossless."""
    thesis, port = CASES["bourse_v3"]
    port += 10
    fx = HERE / "fixtures" / "bourse_v3"
    parquet = REPO / "data" / f"{thesis}.parquet"
    if not parquet.exists():
        pytest.skip(f"{parquet} missing")
    srv, replay = replay_server.serve(str(fx / "calls.jsonl"), MODEL, port)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        out_dir = tmp_path / "out"
        _run_pipeline(thesis, parquet, out_dir, f"http://127.0.0.1:{port}/v1", ["1", "2", "3"])
    finally:
        srv.shutdown()
    assert replay.rejected == 0
    for fixture_name, rel in COMPARED.items():
        assert (out_dir / rel.format(t=thesis)).read_bytes() == (fx / fixture_name.format(t=thesis)).read_bytes(), rel
