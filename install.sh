#!/usr/bin/env bash
# Install mcpscaffold from source (macOS / Linux).
#   ./install.sh          # npm ci + build + test
#   ./install.sh --link   # also `npm link` the CLI globally
# Original Cognis Digital implementation.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Installing dependencies (npm ci)"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Building"
npm run build

echo "==> Testing"
npm test

if [ "${1:-}" = "--link" ]; then
  echo "==> Linking CLI globally (npm link)"
  npm link
  echo "mcpscaffold is now on your PATH. Try: mcpscaffold --help"
else
  echo "Done. Run the CLI with: node dist/cli.js --help"
  echo "(re-run with --link to put 'mcpscaffold' on your PATH)"
fi
