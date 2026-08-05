#!/usr/bin/env bash
# Vendors spessasynth_core as a self-contained ES module into app/src/libs/.
# Usage: ./tools/update-spessasynth.sh 4.3.16
set -euo pipefail

VERSION="${1:?usage: update-spessasynth.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "https://registry.npmjs.org/spessasynth_core/-/spessasynth_core-${VERSION}.tgz" \
    | tar xz -C "$WORK"

# The package must ship a single dependency-free ESM file — anything else disqualifies it
# under the no-build-step dependency policy.
if grep -qE 'from[[:space:]]*"[^./]' "$WORK/package/dist/index.js"; then
    echo "refusing to vendor: dist/index.js has bare imports and is not self-contained" >&2
    exit 1
fi

cp "$WORK/package/dist/index.js" "$ROOT/app/src/libs/spessasynth_core.js"
cp "$WORK/package/dist/index.d.ts" "$ROOT/app/src/libs/spessasynth_core.d.ts"
echo "vendored spessasynth_core ${VERSION}"
