#!/usr/bin/env bash
set -e
cd "${WORKSPACE_DIR}"

sudo chown -R vscode:vscode \
    "${WORKSPACE_DIR}/node_modules" \
    "${WORKSPACE_DIR}/dist" \
    "${WORKSPACE_DIR}/src-tauri/target"

bun install
