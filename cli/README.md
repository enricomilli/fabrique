# cli/ — the rlm-cli build the note pipeline runs on

The note pipeline (`scripts/run_note.py`) drives **rlm-cli**, a Node command-line
tool that runs the RLM loop: the model writes Python, rlm-cli executes it in a
REPL, feeds the output back, and repeats until the model calls `FINAL(...)`.

This folder ships the exact rlm-cli the pipeline was validated on, already
patched, so installing it is one command.

```bash
cli/install.sh            # npm ci + build + npm link → `rlm` on your PATH
rlm --version             # rlm v0.5.0
```

`cli/install.sh --no-link` builds without touching your global npm; run the tool
as `node cli/rlm-cli/bin/rlm.mjs` then. Needs Node ≥ 20.

## How rlm-cli reaches our model

rlm-cli is a **client**: it sends OpenAI-style `POST /v1/chat/completions`
requests. It knows two kinds of backend, hosted providers selected by API key
(OpenAI, Anthropic, Gemini, OpenRouter) and a local **Ollama** at
`http://localhost:11434`. It has no setting for a custom OpenAI URL, and it sends
no sampling parameters.

So the repo runs a shim, `scripts/run_shim.py`, on port 11434. It answers
rlm-cli's Ollama probe (`GET /api/tags`) with our model name, adds the note's
sampling to every chat request, and forwards it to llama-server through the
Cloudflare tunnel. Responses travel back the same way. `request_flow.html` in
this folder draws both pipelines' paths.

## What is in `rlm-cli/`

| | |
|---|---|
| upstream | [github.com/viplismism/rlm-cli](https://github.com/viplismism/rlm-cli), MIT (`rlm-cli/LICENSE`) |
| version | 0.5.0, commit `cdcfd1e` ("test: add smoke tests for --help and --version", 2026-04-15) |
| local change | `rlm-cli-ollama-run.patch`, applied (one file, `src/cli.ts`) |
| left out | upstream `benchmarks/`, `test/`, `site/`, `trajectories/`, `demo.png`: not needed to build or run |

The same code was first installed from upstream commit `19f0eb5`. Upstream later
rewrote its history. The identical tree now lives at `cdcfd1e`, and `19f0eb5` no
longer exists on GitHub. That is why this repo vendors the source instead of
pointing at a commit.

## The patch

Upstream 0.5.0 looks up Ollama models only in its interactive mode. The pipeline
calls the non-interactive `rlm run`, which then fails with
`Error: unknown model "Qwen3.6-27B-Q6_K.gguf"`. The patch adds the same lookup to
`rlm run`: before the hosted providers, it asks `OLLAMA_BASE_URL` (default
`http://localhost:11434`) for its model list and uses a match. Nothing else
changes.

To rebuild from upstream yourself instead of using the vendored copy:

```bash
git clone https://github.com/viplismism/rlm-cli && cd rlm-cli
git checkout cdcfd1e
git apply /path/to/thesis_rlm/cli/rlm-cli-ollama-run.patch
npm ci && npm run build && npm link
```

## Checked on 2026-09-30

- `install.sh --no-link` from a clean copy of this folder builds `rlm v0.5.0`.
- The built `dist/cli.js` matches the build every reference run used, apart from
  one comment.
- Against a fake Ollama endpoint, the patched `rlm run --model Qwen3.6-27B-Q6_K.gguf`
  sends `POST /v1/chat/completions` and completes (`1 iterations | success`). The
  unpatched build of the same commit stops with `unknown model`.

Upgrading to a newer rlm-cli is a behaviour change. The note prompt, the shim's
countdown-strip regex, `rlm/rlm_config.yaml` (`truncate_len`) and the parsing of
the "Completed in … | N iterations" line all depend on 0.5.0's strings. Re-run
`tests/` and one live note before switching.
