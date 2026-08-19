"""
Frozen-behaviour tests: prompts, sampling configs, regexes, the note prompt,
the note blob, and the shim's forwarded payloads must match tests/golden/*.

If one of these fails you changed validated behaviour. Either revert, or — if
the change was A/B-validated and promoted — regenerate the golden files with
`python3 tests/make_golden.py` and record what changed and why.
"""
import json
import pathlib
import sys

import pytest

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(SCRIPTS))

import make_golden as mg  # noqa: E402

PROMPT_GOLDEN = json.loads((HERE / "golden" / "prompt_hashes.json").read_text(encoding="utf-8"))
SHIM_GOLDEN = json.loads((HERE / "golden" / "shim_golden.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def fiche_now():
    return mg.fiche_surface(mg.import_fiche(SCRIPTS))


@pytest.mark.parametrize("name", sorted(PROMPT_GOLDEN["fiche"]))
def test_fiche_surface_frozen(fiche_now, name):
    assert name in fiche_now, f"{name} disappeared from the fiche surface"
    assert fiche_now[name] == PROMPT_GOLDEN["fiche"][name], f"{name} changed"


def test_no_unexpected_fiche_surface_names(fiche_now):
    assert set(fiche_now) == set(PROMPT_GOLDEN["fiche"])


@pytest.fixture(scope="module")
def note_now():
    return mg.note_surface(SCRIPTS)


@pytest.mark.parametrize("name", sorted(PROMPT_GOLDEN["note"]))
def test_note_surface_frozen(note_now, name):
    assert note_now[name] == PROMPT_GOLDEN["note"][name], f"{name} changed"


@pytest.fixture(scope="module")
def shim_now():
    return {"v3_env": mg.run_shim_blackbox(SCRIPTS, mg.SHIM_ENV_V3),
            "empty_env": mg.run_shim_blackbox(SCRIPTS, {})}


@pytest.mark.parametrize("env", ["v3_env", "empty_env"])
@pytest.mark.parametrize("name", sorted(k for k in SHIM_GOLDEN["v3_env"]))
def test_shim_forwarding_frozen(shim_now, env, name):
    assert shim_now[env][name] == SHIM_GOLDEN[env][name], \
        f"shim output for {name!r} under {env} differs:\n got {json.dumps(shim_now[env][name], ensure_ascii=False)[:600]}\n exp {json.dumps(SHIM_GOLDEN[env][name], ensure_ascii=False)[:600]}"
