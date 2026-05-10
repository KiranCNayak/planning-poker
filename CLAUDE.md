# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a pnpm monorepo. Run commands from the repo root unless otherwise noted.

**Infrastructure (required before running the app):**

```bash
docker compose up -d        # start Postgres (5432) and Redis (6379)
```

**Development:**

```bash
pnpm dev                    # run backend + frontend concurrently
cd backend && pnpm dev      # backend only (tsx watch, port 4000)
cd frontend && pnpm dev     # frontend only (vite, port 5173)
```

**Database:**

```bash
cd backend && pnpm prisma:migrate   # apply pending migrations
cd backend && pnpm prisma:generate  # regenerate Prisma client after schema changes
cd backend && pnpm prisma:reset     # drop and recreate all tables
```

**Testing:**

```bash
pnpm test                           # run all tests
cd backend && pnpm test             # backend tests only (vitest run)
cd backend && pnpm test:watch       # watch mode
```

**Linting / formatting:**

```bash
pnpm lint                    # ESLint on backend (frontend has no ESLint config yet)
pnpm format                  # Prettier across the whole repo
pnpm format:check            # check formatting without writing
```

**Building:**

```bash
pnpm build                   # build both workspaces
cd backend && pnpm build     # tsc output → backend/dist/
cd frontend && pnpm build    # vite build → frontend/dist/
```

## Architecture

### Monorepo layout

```
backend/   Node.js + Express + Socket.IO + Prisma
frontend/  React 18 + Vite + TanStack Query + Tailwind
```

Backend runs on port 4000; frontend on 5173. The frontend proxies all `/api` calls and WebSocket connections to the backend via `VITE_API_BASE_URL` / `VITE_SOCKET_BASE_URL` (see `frontend/src/lib/config.ts`).

### Backend

**Entry point:** `backend/src/server.ts` — creates an HTTP server from the Express app (`app.ts`), then passes it to `initSocket()` for Socket.IO.

**Module structure under `backend/src/`:**

- `config/env.ts` — zod-validated env vars with sensible defaults. All server config flows from here.
- `middleware/auth.ts` — `optionalAuth` (populates `req.auth` or `req.anonId`) and `requireAuth` (401 guard). Both middlewares parse Bearer token + `anon_token` cookie.
- `lib/identity.ts` — `buildIdentityKey(primaryId, fp, ip)` builds the canonical `id:|fp:|ip:` key from primitives. `buildIdentityKeyFromRequest(req, primaryId)` is the HTTP-route convenience wrapper. For WebSocket connections, the socket middleware in `realtime/socket.ts` calls `buildIdentityKey` directly using values from the handshake — the client never supplies its own identity key.
- `lib/prisma.ts` / `lib/redis.ts` — singleton clients.
- `lib/asyncHandler.ts` — wraps async Express route handlers so rejected promises propagate to `next(err)`. All route files use it. A global error middleware in app.ts catches anything that reaches it and returns `{ error: "INTERNAL_ERROR" }`.
- `modules/auth/` — local registration/login (bcrypt), JWT signing/verification (access 2d, refresh 30d), anonymous bootstrap endpoint.
- `modules/rooms/` — REST: POST (auth-only create), GET (metadata), DELETE (owner-only deactivate).
- `modules/bans/` — REST: owner applies/views/lifts room bans.
- `modules/users/` — REST: `GET /api/users/me`, username claim.
- `modules/audit/service.ts` — `writeAuditEvent(tx, ...)`. Always call this inside a Prisma transaction; never outside one.
- `modules/realtime/socket.ts` — all `Socket.IO` logic. Namespace `/room`. A `nsp.use()` middleware builds the identity key server-side from `socket.handshake.auth.token` (JWT), the `anon_token` HttpOnly cookie, and `socket.handshake.address` (IP). Votes stored in Redis hash `room:{id}:votes`; member presence in Redis set `room:{id}:members` (used for `SCARD` capacity check); session heartbeat key `session:{identityKey}:{roomId}` with 60s TTL enables reconnect detection and vote restoration. Handles `room:kick` and `room:ban` (owner-only; disconnects target socket, updates DB and Redis). The frontend passes `auth: { token, fingerprint }` in the `io()` call.

**Authentication flow:** frontend POSTs to `/api/auth/anon/bootstrap` on load (sets `anon_token` HttpOnly cookie), then attempts `/api/auth/refresh` to hydrate the access token from the `refresh_token` cookie. `apiFetch()` in `frontend/src/lib/http.ts` handles the 401 → refresh → retry cycle automatically.

### Frontend

**Entry:** `frontend/src/main.tsx` wraps the app in `AuthProvider` (from `features/auth/use-auth.tsx`) and `QueryClientProvider`, then renders `<AppRouter />`.

**Auth context** (`features/auth/use-auth.tsx`): initialises FingerprintJS and the anonymous identity on mount, exposes `user`, `anonId`, `fingerprint`, `login`, `register`, `logout`, `refreshUser`.

**Routing** (`app/router.tsx`): React Router v6. `/profile` and `/settings` are behind `<ProtectedRoute>`. All pages are wrapped in `<AppShell>`.

**Room page** (`pages/room-page.tsx`): manages a Socket.IO client directly (no abstraction layer). The identity key sent on `room:join` is assembled client-side from `user.id ?? anonId` + fingerprint.

**UI components** live in `components/ui/` — these are shadcn-style primitives built on Tailwind + `class-variance-authority`.

**Stats logic** (`features/room/stats.ts`): pure function; computes average, median, consensus, `?` count, `☕` count from a revealed vote map. `?` and `☕` are excluded from numeric calculations.

### Data model highlights

- **Identity key** ties together sessions, bans, and audit rows for both anonymous and authenticated users.
- **`room_sessions`** tracks active participants (`leftAt IS NULL` = active). One row per `(roomId, identityKey)`.
- **`audit_logs`** is append-only. The app DB user must not have UPDATE/DELETE on this table. Always write via `writeAuditEvent(tx, ...)`.
- **`room_bans`** uses a tiered escalation (10 min → 1 hour → permanent) keyed on `(roomId, identityKey)`.

### WebSocket protocol

Socket.IO namespace `/room`. The server stores `{ roomId, identityKey }` on `socket.data` after a successful `room:join`.

Vote values are never broadcast before reveal — `user:voted` only confirms a participant voted; `room:votes_revealed` carries the actual value map.

The valid vote values (1 2 3 5 8 13 21 34 55 89 ? ☕) are defined in two places that must stay in sync: backend/src/modules/realtime/socket.ts → VOTE_VALUES and frontend/src/lib/deck.ts → DECK. Both files carry a cross-reference comment.

### What is not yet implemented

Per the implementation checklist in `planning-poker-technical-spec.md`:

- Redis adapter for Socket.IO (horizontal scaling across multiple Node instances)
- Full Redis-backed reconnect window: disconnect currently sets `leftAt` immediately; the 60 s grace period described in §3.5 requires a deferred cleanup job
- Rate limiting and hCaptcha
- Vote state sync cron and daily cleanup job
- Owner moderation UI on the frontend (ban/list/lift)
- Frontend tests (Vitest + RTL)
