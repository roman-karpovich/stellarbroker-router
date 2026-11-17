#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
mkdir -p "$here/wasm"
cd "$root"
RUSTUP_TOOLCHAIN=1.95.0 stellar contract build --locked --out-dir "$here/wasm"
