# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20.18.1

FROM node:${NODE_VERSION}-bookworm AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=1

# Install packages with retry logic and better error handling
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean && \
    for i in 1 2 3; do \
        apt-get update -o Acquire::Retries=3 && \
        apt-get install -y --no-install-recommends \
            -o Acquire::Retries=3 \
            -o Acquire::http::Timeout=10 \
            -o Acquire::ftp::Timeout=10 \
            chromium \
            ffmpeg \
            pulseaudio-utils \
            pulseaudio \
            alsa-utils \
            libnss3 \
            libxss1 \
            libxshmfence1 \
            libatk1.0-0 \
            libatk-bridge2.0-0 \
            libx11-xcb1 \
            libxcomposite1 \
            libxdamage1 \
            libxrandr2 \
            libgbm1 \
            libpango-1.0-0 \
            libcairo2 \
            libasound2 \
            fonts-liberation \
            ca-certificates \
            curl \
            git && \
        break || sleep 10; \
    done

# Install pnpm directly instead of using corepack to avoid signature issues
RUN npm install -g pnpm@latest

WORKDIR /workspace

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PATH=/workspace/node_modules/.bin:/workspace/salesfe/node_modules/.bin:${PATH}

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sleep", "infinity"]
