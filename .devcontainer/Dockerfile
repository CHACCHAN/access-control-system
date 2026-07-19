FROM mcr.microsoft.com/devcontainers/rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    wget \
    build-essential \
    pkg-config \
    libssl-dev \
    ca-certificates \
    unzip \
    file \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev \
    patchelf \
    genisoimage \
    libclang-dev \
    libv4l-dev \
    && rm -rf /var/lib/apt/lists/*

USER vscode
ENV BUN_INSTALL="/home/vscode/.bun" \
    PATH="/home/vscode/.bun/bin:${PATH}"

# WASM Pack
RUN rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack --locked

# Bun
RUN curl -fsSL https://bun.sh/install | bash

# Rust Utils
RUN cargo install cargo-watch --locked || true

# Tauri CLI (v2)
RUN cargo install tauri-cli --version "^2" --locked

RUN echo 'export PATH=$PATH' >> /home/vscode/.bashrc

CMD ["sleep", "infinity"]
