#!/usr/bin/env bash
set -e
cd "${WORKSPACE_DIR}"

export CARGO_HOME="/home/vscode/.cargo"
export RUSTUP_HOME="/home/vscode/.rustup"
export BUN_INSTALL="/home/vscode/.bun"
export PATH="$BUN_INSTALL/bin:$CARGO_HOME/bin:$PATH"

sudo mkdir -p /home/vscode/.rustup && sudo chown -R vscode:vscode /home/vscode/.rustup
sudo mkdir -p /home/vscode/.cargo && sudo chown -R vscode:vscode /home/vscode/.cargo
sudo mkdir -p /home/vscode/.bun && sudo chown -R vscode:vscode /home/vscode/.bun

# Rustup & wasm-pack
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
cargo install cargo-watch --locked || true
cargo install tauri-cli --version "^2" --locked

# Bun
curl -fsSL https://bun.sh/install | bash

sudo chown -R vscode:vscode \
    "${WORKSPACE_DIR}/node_modules" \
    "${WORKSPACE_DIR}/dist" \
    "${WORKSPACE_DIR}/src-tauri/target"

echo "export PATH=$PATH" >> /home/vscode/.bashrc

bun install
