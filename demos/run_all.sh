#!/usr/bin/env bash
# Run every mcpscaffold demo. Exits 0 only if all demos succeed.
# Original Cognis Digital implementation.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

echo "=== Building library ==="
( cd "$root" && npm run build )

echo "=== Demo 1: validate gate (valid + invalid spec) ==="
node "$here/validate_gate.mjs"

echo "=== Demo 2: scaffold from spec + run generated smoke test ==="
node "$here/scaffold_and_smoke.mjs"

echo
echo "All demos passed."
