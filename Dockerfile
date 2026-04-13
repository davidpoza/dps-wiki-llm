# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-alpine
ARG N8N_VERSION=latest

FROM ${NODE_IMAGE} AS kb-build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY tools ./tools

RUN npm ci && npm run build

FROM ${NODE_IMAGE} AS runtime

ARG N8N_VERSION=latest

USER root

RUN set -eux; \
  apk add --no-cache ca-certificates git openssh-client python3 py3-pip tini su-exec; \
  apk add --no-cache --virtual .build-deps make g++; \
  npm install -g "n8n@${N8N_VERSION}"; \
  python3 -m pip install --no-cache-dir --break-system-packages yt-dlp; \
  apk del .build-deps; \
  npm cache clean --force

WORKDIR /app

COPY --from=kb-build --chown=node:node /app/package.json ./package.json
COPY --from=kb-build --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=kb-build --chown=node:node /app/dist ./dist

RUN set -eux; \
  node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 5)) { throw new Error('dps-wiki-llm requires Node.js >=22.5.0; base image has ' + process.versions.node); }"; \
  node -e "require('node:sqlite')"; \
  test -f /app/dist/tools/search.js; \
  git --version; \
  yt-dlp --version; \
  n8n --version

USER node
ENV N8N_USER_FOLDER=/home/node/.n8n
WORKDIR /home/node

ENTRYPOINT ["tini", "--"]
CMD ["n8n"]
