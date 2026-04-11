# syntax=docker/dockerfile:1.7

ARG N8N_IMAGE=n8nio/n8n:latest
ARG NODE_BUILD_IMAGE=node:24-alpine

FROM ${NODE_BUILD_IMAGE} AS kb-build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY tools ./tools

RUN npm ci && npm run build

FROM ${N8N_IMAGE} AS runtime

USER root

RUN set -eux; \
  if command -v apk >/dev/null 2>&1; then \
    apk add --no-cache git openssh-client; \
  elif command -v apt-get >/dev/null 2>&1; then \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates git openssh-client; \
    rm -rf /var/lib/apt/lists/*; \
  else \
    echo "Unsupported n8n base image: expected apk or apt-get" >&2; \
    exit 1; \
  fi

WORKDIR /app

COPY --from=kb-build --chown=node:node /app/package.json ./package.json
COPY --from=kb-build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=kb-build --chown=node:node /app/dist ./dist

RUN set -eux; \
  node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 5)) { throw new Error('dps-wiki-llm requires Node.js >=22.5.0; base image has ' + process.versions.node); }"; \
  node -e "require('node:sqlite')"; \
  test -f /app/dist/tools/search.js; \
  git --version

USER node
WORKDIR /home/node
