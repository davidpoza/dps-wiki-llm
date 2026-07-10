FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json ./
RUN pnpm install --frozen-lockfile=false
COPY angular.json tsconfig*.json ./
COPY public ./public
COPY src ./src
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/dps-wiki-llm-frontend/browser /usr/share/nginx/html
EXPOSE 80
