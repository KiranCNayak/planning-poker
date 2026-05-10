# syntax=docker/dockerfile:1.7

# Build context: repo root. Build with:
#   docker build -f frontend/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://planning-poker.knayak.dev \
#     --build-arg VITE_SOCKET_BASE_URL=https://planning-poker.knayak.dev \
#     --build-arg VITE_SHARE_BASE_URL=https://planning-poker.knayak.dev \
#     -t planning-poker-frontend .
# VITE_* values are baked into the bundle at build time, so the deploy
# pipeline must pass the prod domain explicitly.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY frontend/package.json ./frontend/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @planning-poker/frontend...
COPY frontend ./frontend/
ARG VITE_API_BASE_URL
ARG VITE_SOCKET_BASE_URL
ARG VITE_SHARE_BASE_URL
ARG VITE_APP_VERSION
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SOCKET_BASE_URL=$VITE_SOCKET_BASE_URL \
    VITE_SHARE_BASE_URL=$VITE_SHARE_BASE_URL \
    VITE_APP_VERSION=$VITE_APP_VERSION
RUN pnpm --filter @planning-poker/frontend build

FROM nginx:1.27-alpine AS runtime
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
