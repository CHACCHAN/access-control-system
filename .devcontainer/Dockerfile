FROM mcr.microsoft.com/devcontainers/base:bookworm

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
    libasound2-dev \
    libxdo-dev \
    patchelf \
    genisoimage \
    libclang-dev \
    libv4l-dev \
    && rm -rf /var/lib/apt/lists/*

CMD ["sleep", "infinity"]
