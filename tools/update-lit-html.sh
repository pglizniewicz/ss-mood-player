#!/usr/bin/env bash
# Vendors lit-html as a self-contained ES module into app/src/libs/.
# Usage: ./tools/update-lit-html.sh 3.3.3
set -euo pipefail

VERSION="${1:?usage: update-lit-html.sh <version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "https://registry.npmjs.org/lit-html/-/lit-html-${VERSION}.tgz" | tar xz -C "$WORK"

if grep -qE 'from[[:space:]]*"[^./]' "$WORK/package/lit-html.js"; then
    echo "refusing to vendor: lit-html.js has bare imports and is not self-contained" >&2
    exit 1
fi

cp "$WORK/package/lit-html.js" "$ROOT/app/src/libs/lit-html.js"
echo "vendored lit-html ${VERSION}"
