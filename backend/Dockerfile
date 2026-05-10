# syntax=docker/dockerfile:1.7

# Build context: repo root. Build with:
#   docker build -f backend/Dockerfile -t planning-poker-backend .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY backend/package.json ./backend/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @planning-poker/backend...

FROM deps AS builder
COPY backend/prisma ./backend/prisma/
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src/
RUN pnpm --filter @planning-poker/backend exec prisma generate \
 && pnpm --filter @planning-poker/backend build \
 && pnpm --filter=@planning-poker/backend --prod deploy /opt/app

# pnpm 10's `pnpm deploy` strips the top-level `"type"` field from package.json
# when assembling the publish-style bundle. The backend compiles to ESM
# (`tsconfig.json` -> `"module": "NodeNext"`), so without `"type": "module"`
# Node treats every `dist/*.js` as CommonJS and refuses named imports out of
# CommonJS deps like `@prisma/client`. Put the field back.
RUN node -e "const f=require('fs'),p='/opt/app/package.json',o=JSON.parse(f.readFileSync(p));o.type='module';f.writeFileSync(p,JSON.stringify(o,null,2));"

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /opt/app
# Files in the builder stage are owned by root. Chown to `node` during COPY so
# the runtime user can write to the prisma engines dir (prisma's CLI does
# binary-resolution writes on startup, even just for `migrate deploy`).
COPY --chown=node:node --from=builder /opt/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /opt/app/dist ./dist
COPY --chown=node:node --from=builder /opt/app/prisma ./prisma
COPY --chown=node:node --from=builder /opt/app/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
