# Backend Setup

## Prerequisites

- Node.js 22
- pnpm (via corepack)
- Docker

## Install

From repo root:

```bash
pnpm install
```

## Start Infrastructure

From repo root:

```bash
docker compose up -d
```

## Environment

From `backend/`:

```bash
cp .env.example .env
```

## Prisma (Important)

Always use the **workspace-local Prisma CLI** via `pnpm`.
Do **not** use `pnpx prisma ...` (it may pull Prisma 7 and break Prisma 6 schema compatibility).

Use these commands:

```bash
# from repo root
pnpm -C backend prisma:generate
pnpm -C backend prisma:migrate -- --name initial_migration_with_all_tables
```

Or inside `backend/`:

```bash
pnpm prisma:generate
pnpm prisma:migrate -- --name initial_migration_with_all_tables
```

## Run Backend

From repo root:

```bash
pnpm -C backend dev
```

## Verify

```bash
pnpm -C backend build
pnpm -C backend test
```
