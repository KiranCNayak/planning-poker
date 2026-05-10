# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a pnpm monorepo. Run commands from the repo root unless otherwise noted.

**Infrastructure (required before running the app):**

```bash
docker compose up -d                              # start Postgres (5432) and Redis (6379)
docker compose --profile gateway up -d            # also start the nginx API gateway on :8080
docker compose --profile gateway down             # stop everything including the gateway
```

The gateway is opt-in via the `gateway` profile so the default `docker compose up -d` keeps the existing dev experience (backend on :4000, vite on :5173, no proxy). When the gateway is running, the app is reachable end-to-end at `http://localhost:8080`. See `infra/nginx/nginx.conf` and §14 of `planning-poker-technical-spec.md`.

When you run **with** the gateway profile, the backend must be told it's behind a proxy or its identity keys collapse to the gateway's docker-bridge IP:

```bash
TRUST_PROXY=1 CORS_ORIGIN=http://localhost:5173,http://localhost:8080 pnpm --filter @planning-poker/backend dev
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

## Commit messages

This repo follows the [Conventional Commits](https://www.conventionalcommits.org/) spec, enforced by a `commit-msg` hook (commitlint + `@commitlint/config-conventional`). Release tooling (release-please) parses these to produce the changelog and bump versions.

Format: `<type>(optional scope): <description>`

Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`. A `!` after the type or a `BREAKING CHANGE:` footer denotes a breaking change.

Examples:

```
feat(rooms): add capacity check before join
fix(auth): reject anonymous bootstrap when fingerprint missing
chore(deps): bump prisma to 5.20
refactor(realtime)!: rename room:join payload field
```

The hook runs on every commit. To bypass it locally use `git commit --no-verify`, but never push commits that would fail the convention — release-please ignores them.

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
- `lib/identity.ts` — `buildIdentityKey(primaryId, fp, ip)` builds the canonical `id:|fp:|ip:` key from primitives. `buildIdentityKeyFromRequest(req, primaryId)` is the HTTP-route convenience wrapper (relies on Express's `trust proxy` setting so `req.ip` resolves the real client IP from `X-Forwarded-For`). `resolveClientIp(socketAddress, xffHeader, trustProxy)` is the Socket.IO equivalent — it mirrors Express semantics by walking `[...XFF, socket.handshake.address]` and skipping `TRUST_PROXY` trusted hops from the right. The socket middleware in `realtime/socket.ts` uses this so identity keys remain stable behind an API gateway. The client never supplies its own identity key.
- `lib/prisma.ts` / `lib/redis.ts` — singleton clients.
- `lib/asyncHandler.ts` — wraps async Express route handlers so rejected promises propagate to `next(err)`. All route files use it. A global error middleware in app.ts catches anything that reaches it and returns `{ error: "INTERNAL_ERROR" }`.
- `modules/auth/` — local registration/login (bcrypt), JWT signing/verification (access 2d, refresh 30d), anonymous bootstrap endpoint.
- `modules/rooms/` — REST: POST (auth-only create), GET (metadata), DELETE (owner-only deactivate).
- `modules/bans/` — REST: owner applies/views/lifts room bans.
- `modules/users/` — REST: `GET /api/users/me`, username claim.
- `modules/audit/service.ts` — `writeAuditEvent(tx, ...)`. Always call this inside a Prisma transaction; never outside one.
- `modules/realtime/socket.ts` — all `Socket.IO` logic. Namespace `/room`. A `nsp.use()` middleware builds the identity key server-side from `socket.handshake.auth.token` (JWT), the `anon_token` HttpOnly cookie, and the client IP resolved by `resolveClientIp` (reads `X-Forwarded-For` when running behind a trusted gateway, otherwise falls back to `socket.handshake.address`). Votes stored in Redis hash `room:{id}:votes`; member presence in Redis set `room:{id}:members` (used for `SCARD` capacity check); session heartbeat key `session:{identityKey}:{roomId}` with 60s TTL enables reconnect detection and vote restoration. Handles `room:kick` and `room:ban` (owner-only; disconnects target socket, updates DB and Redis). The frontend passes `auth: { token, fingerprint }` in the `io()` call.

**Authentication flow:** frontend POSTs to `/api/auth/anon/bootstrap` on load (sets `anon_token` HttpOnly cookie), then attempts `/api/auth/refresh` to hydrate the access token from the `refresh_token` cookie. `apiFetch()` in `frontend/src/lib/http.ts` handles the 401 → refresh → retry cycle automatically.

### Frontend

**Entry:** `frontend/src/main.tsx` wraps the app in `AuthProvider` (from `features/auth/use-auth.tsx`) and `QueryClientProvider`, then renders `<AppRouter />`.

**Auth context** (`features/auth/use-auth.tsx`): initialises FingerprintJS and the anonymous identity on mount, exposes `user`, `anonId`, `fingerprint`, `login`, `register`, `logout`, `refreshUser`.

**Routing** (`app/router.tsx`): React Router v6. `/profile` and `/settings` are behind `<ProtectedRoute>`. All pages are wrapped in `<AppShell>`.

**Room page** (`pages/room-page.tsx`): manages a Socket.IO client directly (no abstraction layer). The identity key sent on `room:join` is assembled client-side from `user.id ?? anonId` + fingerprint.

**UI components** live in `components/ui/` — these are shadcn-style primitives built on Tailwind + `class-variance-authority`.

**Stats logic** (`features/room/stats.ts`): pure function; computes average, median, consensus, `?` count, `☕` count from a revealed vote map. `?` and `☕` are excluded from numeric calculations.

### Edge / API gateway

A dev nginx gateway lives at `infra/nginx/nginx.conf`. It's wired into `docker-compose.yml` under the `gateway` profile so it's opt-in.

- **`TRUST_PROXY` env var** (default `0`) is the number of upstream proxies between the public client and Express. Set to `1` when the gateway is in front (Express's `req.ip` and the WebSocket `resolveClientIp` helper both honour it).
- **Gateway responsibilities (today)**: HTTP rate-limit zones (`api`, `auth`, `conn`), request-id injection, X-Forwarded-For overwrite (does not append, so it's unspoofable), X-Forwarded-Proto forwarding, WebSocket upgrade for `/socket.io/`, vite-HMR pass-through for `/`.
- **Gateway responsibilities (deferred to Phase 11 follow-ups)**: TLS termination, CORS (currently still on the backend — backend `CORS_ORIGIN` must include `http://localhost:8080` while the gateway is in use), serving the frontend `dist/` directly instead of proxying to vite, sticky sessions once a second backend instance exists.
- **Backend responsibilities**: JWT verification, auth-aware rate limiting, Socket.IO event-level rate limiting (event throttling cannot live at the HTTP gateway because once the WebSocket is upgraded the gateway sees only an opaque TCP stream).
- **Critical contract**: the gateway must overwrite `X-Forwarded-For` on ingress (`proxy_set_header X-Forwarded-For $remote_addr;`, never `$proxy_add_x_forwarded_for`). It must also forward `X-Forwarded-Proto` so cookies marked `Secure` are emitted under HTTPS.

See §14 of `planning-poker-technical-spec.md` for the full design.

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

- Redis adapter for Socket.IO (horizontal scaling across multiple Node instances) — **next** after the gateway lands, since multi-instance routing is the trigger for needing it
- Full Redis-backed reconnect window: disconnect currently sets `leftAt` immediately; the 60 s grace period described in §3.5 requires a deferred cleanup job
- Rate limiting and hCaptcha — see §4 and §14 of the spec for the split between gateway-level (HTTP) and backend-level (auth-aware + WS-event) rate limiting
- nginx API gateway: dev profile shipped (`infra/nginx/nginx.conf`, `--profile gateway`); Phase 11 follow-ups remaining are TLS termination, moving CORS off the backend, serving the frontend `dist/` instead of proxying to vite, and sticky sessions once a second backend instance exists
- Vote state sync cron and daily cleanup job
- Owner moderation UI on the frontend (ban/list/lift)
- Frontend tests (Vitest + RTL)
