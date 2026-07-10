# Playwright base image ships Chromium + all system libraries it needs.
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

EXPOSE 3000

# `dumb-init`-style reaping is provided by compose `init: true`.
CMD ["node", "src/server.js"]
