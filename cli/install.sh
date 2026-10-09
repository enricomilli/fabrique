#!/usr/bin/env bash
# Build and install the patched rlm-cli shipped in cli/rlm-cli/ (see cli/README.md).
#
#   cli/install.sh            # build + `npm link` → `rlm` on your PATH
#   cli/install.sh --no-link  # build only; run it as `node cli/rlm-cli/bin/rlm.mjs`
#
# Needs Node >= 20 and npm. Idempotent: re-running rebuilds and re-links.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/rlm-cli"

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 20 ]; then
  echo "error: Node >= 20 is required (found: $(node --version 2>/dev/null || echo none))" >&2
  exit 1
fi

cd "$SRC"
npm ci --no-audit --no-fund
npm run build

if [ "${1:-}" = "--no-link" ]; then
  echo "built: node $SRC/bin/rlm.mjs --version → $(node bin/rlm.mjs --version)"
  exit 0
fi

npm link --no-audit --no-fund
echo "installed: $(command -v rlm) → $(rlm --version)"
echo "the note pipeline expects rlm 0.5.0 with the Ollama patch (cli/README.md)."
