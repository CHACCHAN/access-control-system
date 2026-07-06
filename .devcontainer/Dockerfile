FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    wget \
    git \
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
    && rm -rf /var/lib/apt/lists/*

# WASM Pack
RUN rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack --locked

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Rust Utils
RUN cargo install cargo-watch --locked || true

# Tauri CLI (v2)
RUN cargo install tauri-cli --version "^2" --locked

RUN echo 'export PATH="/root/.bun/bin:/usr/local/cargo/bin:$PATH"' >> /root/.bashrc

CMD ["sleep", "infinity"]