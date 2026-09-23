#!/usr/bin/env bash
# Rebuilds hale's compiler front-end to WebAssembly for the site's playground,
# from a checkout of github.com/Tech-GabrielLima/tired (default: ../portfolio/tired).
# Requires: rustup target add wasm32-unknown-unknown && cargo install wasm-bindgen-cli --version 0.2.126
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tired="${TIRED:-$here/../portfolio/tired}"
(cd "$tired" && cargo build -p hale-wasm --target wasm32-unknown-unknown --release)
wasm-bindgen "$tired/target/wasm32-unknown-unknown/release/hale_wasm.wasm" --out-dir "$here/src/live/hale" --target web
echo "✓ src/live/hale/hale_wasm.js + hale_wasm_bg.wasm"
