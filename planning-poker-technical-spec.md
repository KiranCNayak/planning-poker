# Planning Poker — Technical Specification

> Version 1.0 · Last updated: May 2026  
> Use this document as both a knowledge base and an implementation checklist.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Tech stack](#2-tech-stack)
3. [Identity and authentication](#3-identity-and-authentication)
4. [Rate limiting and abuse prevention](#4-rate-limiting-and-abuse-prevention)
5. [Room lifecycle](#5-room-lifecycle)
6. [Real-time layer (WebSocket)](#6-real-time-layer-websocket)
7. [Voting model](#7-voting-model)
8. [Data model](#8-data-model)
9. [Audit logging](#9-audit-logging)
10. [Disruptive participant handling](#10-disruptive-participant-handling)
11. [Scaling and infrastructure](#11-scaling-and-infrastructure)
12. [Cleanup and maintenance jobs](#12-cleanup-and-maintenance-jobs)
13. [Implementation checklist](#13-implementation-checklist)

---

## 1. Project overview

A real-time, collaborative story point estimation tool. Multiple users join a named room and independently select a card from a Fibonacci-based deck. Votes are hidden until any participant chooses to reveal them. No persistent moderator role exists — all participants have equal authority to reveal or hide votes. The room creator is recorded for ownership purposes only.

### Core requirements summary

- Only authenticated users can create rooms.
- Rooms are shareable via a short URL (`/room/:short_code`).
- Participants see who is in the room; vote values are hidden until revealed.
- Any participant can reveal or hide votes.
- Authenticated users can create rooms and get persistent rooms.
- Anonymous users can only join existing rooms and are identified by anon_id + fingerprint/IP risk signals.
- Rooms have a capacity limit of 100 participants.
- All participant actions are recorded in an audit log.
- Abuse is mitigated via rate limiting, hCaptcha verification, and ban escalation.

---

## 2. Tech stack

| Layer                  | Choice                       | Reason                                                                               |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Backend runtime        | Node.js + TypeScript         | I/O-bound workload; natural fit for WebSocket fan-outs                               |
| HTTP framework         | Express                      | Mature, minimal, well-understood                                                     |
| WebSocket              | Socket.IO                    | Built-in rooms, reconnection handling, Redis adapter support                         |
| ORM                    | Prisma                       | Type-safe, migration-based, works well with Postgres                                 |
| Primary database       | PostgreSQL                   | Strong consistency, JSONB for audit payloads, advisory locks for username uniqueness |
| Session / state store  | Redis                        | Sub-millisecond room state reads, rate limit counters, presence tracking             |
| Frontend               | React + Vite + TypeScript    | SPA with URL-based routing                                                           |
| Auth (social)          | Deferred (post-v1)           | Local auth first to reduce integration complexity                                    |
| Auth (local)           | JWT + bcrypt                 | Password hashing, signed tokens                                                      |
| CAPTCHA                | hCaptcha                     | Server-side token verification; one-time token with replay prevention                |
| Browser fingerprinting | FingerprintJS (open-source)  | Stable cross-incognito ID derived from browser signals; no stored state              |
| Background jobs        | Node `setInterval` + pg cron | Periodic vote sync and daily cleanup                                                 |
| Horizontal scaling     | Socket.IO Redis adapter      | Pub/sub events across multiple Node instances                                        |

---

## 3. Identity and authentication

### 3.1 Anonymous users

Every unauthenticated visitor is issued a signed JWT on first contact. The token is stored in an HttpOnly cookie; only `anon_id` is client-visible.

Anonymous identity and abuse controls use a hybrid model:

- Primary identity for product behavior: `anon_id`.
- Risk signals for abuse/rate limiting: FingerprintJS hash + IP tuple.

Canonical identity key format used across rate limiting, bans, and audit payloads:
`id:{anon_id_or_user_id}|fp:{fingerprint_hash}|ip:{ip_hash_or_normalized_ip}`.

**Display name**: anonymous users are shown their `anon_id` truncated to 8 characters (e.g. `user_7f3a`) in the room UI.

### 3.2 Authenticated users

Local email/password (bcrypt + JWT access token + rotating refresh token).

On login, the server checks for an existing `anon_id` in the request (passed from the client's localStorage). If found, it merges the anon identity into the new or existing user record using identity-linking records. Audit rows are not rewritten.

Rate limits for authenticated users are keyed on `user_id` as the primary dimension with optional fingerprint/IP risk signal enrichment.

### 3.3 Username

- Globally unique. Enforced via the `username_reservations` table (PK on `username`).
- Set on first login. The claim uses a Postgres advisory lock to prevent race conditions; a duplicate returns HTTP 409.
- Anonymous users get a UUID-derived default. Configurable on first login only (subsequent edits deferred to a later release).
- Once claimed, a username cannot be taken by another user even if the holder deletes their account (tombstone pattern in `username_reservations`).

### 3.4 Identity merge flow

```text
  Anonymous user (anon_id: abc123) signs up / logs in
    → Server receives { anon_id: "abc123", user_id: <new> }
    → INSERT identity_links (anon_id=abc123, user_id=<new>, linked_at=NOW())
    → UPDATE active session rows (room_sessions) to canonical user identity where applicable
    → Preserve audit_logs rows as-is (append-only, no UPDATE)
    → DELETE anon user record (or mark is_anonymous = false and copy UUID)
    → Issue fresh JWT for the real user
```

### 3.5 Session / reconnection model

Presence is tracked in Redis with a heartbeat pattern:

- On join: `SET session:{identity_key} {user_id} EX 60`
- On every WS interaction: `EXPIRE session:{identity_key} 60`
- On reconnect: check if `session:{identity_key}` exists in Redis.
    - **Hit (within 60s)**: restore previous session. Participant count unchanged. Vote from Redis vote hash is restored into the new socket.
    - **Miss (> 60s)**: check `room_sessions` for an active row in the same room. If found, treat as reconnect and do not increment participant count. Otherwise treat as a new join.

**Known edge case**: if a user disconnects during an active reveal window and misses within 60 seconds, their vote is restored correctly. If they miss the window, they rejoin with no vote and see the revealed results as a new participant. This is acceptable behaviour — the alternative (holding reveals until all disconnected users timeout) creates a worse UX.

**Vote restoration on reconnect**: on reconnect hit, or on TTL miss with an active `room_sessions` row, restore vote from Redis vote hash.

---

## 4. Rate limiting and abuse prevention

### 4.1 Rate limit policy

Implemented as a Redis sliding window counter (sorted set, score = timestamp).

| Action                        | Anonymous | Authenticated | Window     |
| ----------------------------- | --------- | ------------- | ---------- |
| Create room                   | 5         | 30            | 1 hour     |
| Join room                     | 20        | 100           | 1 hour     |
| API requests (general)        | 60        | 300           | 1 minute   |
| CAPTCHA verification attempts | 3         | 10            | 10 minutes |

### 4.2 hCaptcha integration

CAPTCHA is triggered when an anonymous user attempts to create a room.

**Server-side verification flow**:

1. Client solves CAPTCHA; receives a one-time `h-captcha-response` token.
2. Client sends token to `POST /api/rooms` in the request body.
3. Server POSTs to `https://api.hcaptcha.com/siteverify` with the token + secret key.
4. Server checks response: `success: true`, `hostname` matches your domain, `timestamp` is within 2 minutes.
5. Server stores the token in Redis with a 2-minute TTL. Any subsequent request with the same token is rejected as a replay.
6. If verification fails → HTTP 403 with `CAPTCHA_FAILED`. The client must re-solve.

**Defending against CAPTCHA farms**:

- One-time token storage in Redis (kills replay).
- `hostname` field validation (kills cross-domain token theft).
- Combine hCaptcha score with your own signals: even a passing CAPTCHA triggers a 30-second cooldown before the next room can be created.
- Track CAPTCHA failure rates per identity key. Three failures in 10 minutes → temporary block + log to `rate_limit_violations`.

### 4.3 Violation tracking

```text
rate_limit_violations table:
  identity_key     — canonical key including primary identity + risk signals
  endpoint         — which action triggered the violation
  violation_count  — incremented on each breach
  first_seen       — timestamp of first violation
  last_seen        — timestamp of most recent
  is_blocked       — whether this key is currently hard-blocked
```

Escalation: 3 violations within 1 hour → `is_blocked = true` + Redis block key set. Blocked keys are checked before any rate limit logic runs. Blocks are reviewed and cleared by the cleanup cron job or manually.

---

## 5. Room lifecycle

### 5.1 Creation

```text
POST /api/rooms (authenticated only)
  1. Resolve identity key (primary id + fingerprint/IP risk tuple)
  2. Check is_blocked in Redis
  3. Sliding window rate limit check
  4. Generate short_code (UUID-style, non-predictable)
  5. INSERT into rooms — retry up to 3 times on short_code collision
  6. Seed Redis: HSET room:{id} votes_revealed 0, owner_id {id}
  7. Write room_created event to audit_log (same transaction as INSERT)
  8. Return { room_id, short_code, url: "/room/:short_code" }
```

### 5.2 Joining

```text
WS connect → room:join { short_code, identity_token }
  1. Look up room by short_code (Redis first, Postgres on miss)
  2. Check room is_active and not expired
  3. Check room_bans table (Postgres source of truth), then Redis ban cache
  4. Check capacity: SCARD room:{id}:members < 100, else emit room:capacity_exceeded
  5. Check Redis session and active room_sessions row for reconnect (see §3.5)
  6. SADD room:{id}:members {identity_key}
  7. UPSERT room_sessions active row and append room_participant_history join record
  8. Restore vote from Redis vote hash if reconnecting
  9. Broadcast user:joined to room
  10. Emit room:state_sync (full state + is_reconnect) to joining socket only
  11. Write join event to audit_log (same DB transaction as session/history writes)
```

### 5.3 Expiry

| User type     | Room TTL                    | Mechanism                                                                    |
| ------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Anonymous     | 24 hours from last activity | Redis key TTL + Postgres `expires_at` column (extended on any room activity) |
| Authenticated | Persistent until deleted    | Only Postgres `is_active` flag; no TTL                                       |

The daily cleanup job checks `expires_at < NOW()` in Postgres and deactivates stale rooms, removes their Redis keys, and logs the cleanup.

### 5.4 Capacity

Hard limit: 100 participants. Configurable via a server environment variable (`ROOM_CAPACITY_LIMIT=100`) so it can be changed without a code deploy. The check is `SCARD room:{id}:members` (O(1) Redis operation) before admitting any socket.

### 5.5 Room ownership

`owner_id` on the `rooms` table records who created the room. This is used for:

- Kicking/banning disruptive participants (owner-only action).
- Associating rooms with authenticated accounts.
- Nothing else — there is no runtime "moderator" role.

---

## 6. Real-time layer (WebSocket)

### 6.1 Socket.IO setup

- Redis adapter (`@socket.io/redis-adapter`) enabled from day one. All `room.emit()` calls fan out correctly across multiple Node instances via Redis pub/sub.
- Namespace: `/room`
- Each room is a Socket.IO room keyed by `room_id`.

### 6.2 Events (client → server)

| Event         | Payload                          | Who can send    |
| ------------- | -------------------------------- | --------------- |
| `room:join`   | `{ short_code, identity_token }` | Anyone          |
| `room:vote`   | `{ value }`                      | Any participant |
| `room:reveal` | —                                | Any participant |
| `room:hide`   | —                                | Any participant |
| `room:reset`  | —                                | Any participant |
| `room:kick`   | `{ target_user_id }`             | Room owner only |
| `room:ban`    | `{ target_identity_key }`        | Room owner only |
| `room:leave`  | —                                | Anyone          |

### 6.3 Events (server → client)

| Event                    | Payload                          | Recipients           |
| ------------------------ | -------------------------------- | -------------------- |
| `room:state_sync`        | Full room state + `is_reconnect` | Joining socket only  |
| `user:joined`            | `{ user_id, display_name }`      | Whole room           |
| `user:left`              | `{ user_id }`                    | Whole room           |
| `user:voted`             | `{ user_id }` (no value)         | Whole room           |
| `room:votes_revealed`    | `{ votes: { user_id: value } }`  | Whole room           |
| `room:votes_hidden`      | —                                | Whole room           |
| `room:reset`             | —                                | Whole room           |
| `room:capacity_exceeded` | —                                | Joining socket only  |
| `room:banned`            | `{ reason, expires_at }`         | Affected socket only |
| `room:expired`           | —                                | Whole room           |

### 6.4 Vote hiding invariant

Vote values are **never** sent to clients before reveal. The Redis vote hash (`room:{id}:votes`) stores values server-side only. Before reveal, clients only receive `user:voted` (a boolean indicator). After reveal, `room:votes_revealed` carries the full map. After a reset, the hash is cleared.

### 6.5 Votes revealed sync strategy

- Live state: `votes_revealed` flag and individual vote values live in Redis.
- Sync to Postgres: a `setInterval` every 30 seconds flushes current vote state to Postgres.
- On room load: Redis is checked first; Postgres is the fallback on a cache miss.
- This means up to 30 seconds of vote state may be lost on Redis failure. This is an accepted trade-off for response speed.
- This non-durable vote window does not conflict with audit guarantees. Audit guarantees cover action logging consistency, not strict synchronous vote persistence.

---

## 7. Voting model

### 7.1 Fibonacci deck

```python
[1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕]
```

Stored as a constant on both client and server. Validated server-side on every `room:vote` event.

### 7.2 Special cards

**`?` — I don't know**

- Signals the ticket is underspecified, not that the estimate is large.
- Should trigger a discussion prompt in the UI: "User A needs more information before estimating."
- Not included in any average or statistical calculation.
- Displayed distinctly (e.g. outlined card, different colour).

**`☕` — Coffee break**

- Any participant can play this to signal fatigue or the need for a break.
- Displays a room-wide notification: "User A called a break."
- Not included in any calculation.
- Resets automatically when the room owner triggers a new round (`room:reset`).

### 7.3 Statistics shown after reveal

Once votes are revealed, the UI calculates and displays:

- All individual votes (with names).
- Average (numeric votes only, excluding `?` and `☕`).
- Consensus indicator: if all numeric voters picked the same value.
- Count of `?` cards played.
- Count of `☕` cards played.

---

## 8. Data model

### `users`

```sql
id                uuid        PK
username          varchar(50) nullable (unique via username_reservations)
email             varchar(255) unique nullable
password_hash     text        nullable
google_id         varchar(255) unique nullable
is_anonymous      boolean     default true
anon_id           uuid        nullable (the original fingerprint UUID)
room_create_limit integer     default 5 (anon) / 30 (auth)
created_at        timestamptz
```

### `rooms`

```sql
id                uuid        PK
short_code        varchar(36) unique not null
owner_id          uuid        FK → users
name              varchar(100)
is_active         boolean     default true
capacity          integer     default 100
votes_revealed    boolean     default false
created_at        timestamptz
expires_at        timestamptz nullable (null = persistent)
last_activity_at  timestamptz
```

### `room_sessions`

```sql
id                uuid        PK
room_id           uuid        FK → rooms
identity_key      varchar(255) not null
user_id           uuid        FK → users nullable
display_name      varchar(50)
current_vote      varchar(5)  nullable
joined_at         timestamptz
last_seen_at      timestamptz
left_at           timestamptz nullable
```

Unique active-session invariant: one active row per `(room_id, identity_key)` where `left_at IS NULL`.

### `room_participant_history`

```sql
id                uuid        PK
room_id           uuid        FK → rooms
identity_key      varchar(255) not null
user_id           uuid        FK → users nullable
display_name      varchar(50)
event_type        varchar(20) — join | leave
created_at        timestamptz
```

Append-only participation timeline used for diagnostics and analytics.

Display name uniqueness within a room: enforced in application logic. Duplicates are auto-suffixed (`Alice #2`).

### `audit_logs`

```sql
id                bigserial   PK
room_id           uuid        FK → rooms
user_id           uuid        FK → users
event_type        varchar(50) — vote_cast | reveal | hide | reset | join | leave | room_created | kick | ban
payload           jsonb       — full event detail
created_at        timestamptz
```

Table is append-only: the application DB user has no UPDATE or DELETE permission on this table.

### `username_reservations`

```sql
username          varchar(50) PK
user_id           uuid        FK → users unique
claimed_at        timestamptz
```

### `rate_limit_violations`

```sql
id                bigserial   PK
identity_key      varchar(255)
endpoint          varchar(100)
violation_count   integer
first_seen        timestamptz
last_seen         timestamptz
is_blocked        boolean     default false
```

### `room_bans`

```sql
id                uuid        PK
room_id           uuid        FK → rooms
identity_key      varchar(255) not null
banned_by_user_id uuid        FK → users
reason            text        nullable
tier              integer     not null
expires_at        timestamptz nullable (null = permanent)
created_at        timestamptz
lifted_at         timestamptz nullable
lifted_by_user_id uuid        FK → users nullable
```

Unique active-ban invariant: one active row per `(room_id, identity_key)` where `lifted_at IS NULL`.

---

## 9. Audit logging

All critical events are written **in the same Postgres transaction** as the state change that caused them. There is no async queue. This guarantees that a state change without a corresponding audit record is impossible.

Events captured:

| Event type     | Trigger                             | Payload                                           |
| -------------- | ----------------------------------- | ------------------------------------------------- |
| `room_created` | Room INSERT                         | `{ short_code, owner_id }`                        |
| `join`         | Participant added                   | `{ display_name, is_reconnect }`                  |
| `leave`        | Socket disconnect or explicit leave | `{ duration_seconds }`                            |
| `vote_cast`    | Participant votes                   | `{ value }`                                       |
| `reveal`       | Votes revealed                      | `{ triggered_by, vote_map }`                      |
| `hide`         | Votes hidden                        | `{ triggered_by }`                                |
| `reset`        | Round reset                         | `{ triggered_by }`                                |
| `kick`         | Participant removed                 | `{ kicked_user_id, kicked_by }`                   |
| `ban`          | Participant banned                  | `{ banned_identity_key, duration_minutes, tier }` |

The `audit_logs` table is never written to directly by application code other than via an internal `writeAuditEvent(tx, ...)` helper that always requires a transaction object. This prevents accidental out-of-transaction writes.
Audit rows are immutable and are never rewritten during anon→auth identity merge.

---

## 10. Disruptive participant handling

Room owner only (`owner_id` check on the server). Kicking and banning are distinct actions.

### 10.1 Kick

Immediately disconnects the target socket. The participant's active `room_sessions.left_at` is set and a `leave` event is appended to `room_participant_history`. They may rejoin unless banned.

### 10.2 Temporary ban with backoff

Ban state is stored in two places:

- **Postgres `room_bans`**: source of truth for active/permanent bans and escalation tier history.
- **Redis**: cache for active bans (`room:{id}:banned` set with identity_key members) and optional per-member TTL companion keys.

Escalation tiers:

| Offence (within this room) | Ban duration           |
| -------------------------- | ---------------------- |
| 1st ban                    | 10 minutes             |
| 2nd ban                    | 1 hour                 |
| 3rd ban                    | Permanent (room-level) |

Identity key for ban: canonical composite key (`id + fingerprint + IP tuple`).

On join attempt while banned:

1. Check active `room_bans` in Postgres for `(room_id, identity_key)` with `lifted_at IS NULL` and unexpired `expires_at`.
2. Check Redis cache (`SISMEMBER room:{id}:banned {identity_key}`) for fast path.
3. If banned: emit `room:banned { reason, expires_at }` and reject connection.
4. Log the attempt to `audit_logs`.

The room owner can manually lift a ban via an owner-only REST endpoint that updates `room_bans.lifted_at` and removes Redis cache entries.

---

## 11. Scaling and infrastructure

### 11.1 Socket.IO Redis adapter

`@socket.io/redis-adapter` is enabled from the first deployment. All `io.to(roomId).emit()` calls fan out via Redis pub/sub to all Node instances. Without this, participants connected to different instances would not receive each other's events.

### 11.2 Redis reliability

- AOF (append-only file) persistence enabled. Protects against data loss on Redis restart.
- Redis Sentinel (or Redis Cluster for higher scale) for failover.
- On a Redis miss for room state, the server falls back to reconstructing from Postgres before returning an error. This path must be explicitly implemented and tested.

### 11.3 Short_code collision handling

`short_code` is generated as UUID-style (36 chars). On INSERT collision (unique constraint violation):

- Retry up to 3 times with a newly generated code.
- After 3 failures, return HTTP 500 and alert (should be astronomically rare).

---

## 12. Cleanup and maintenance jobs

Two recurring jobs. Both log their actions to a `maintenance_logs` table (or stdout in structured JSON).

### 12.1 Vote state sync (every 30 seconds)

```text
For each active room in Redis:
  Read current vote hash and votes_revealed flag
  UPDATE rooms SET votes_revealed = ..., last_activity_at = NOW()
  UPSERT room_sessions.current_vote for each active participant
```

### 12.2 Daily cleanup cron (runs once or twice per day)

```text
1. Expire anonymous rooms:
   SELECT rooms WHERE expires_at < NOW() AND is_active = true
   SET is_active = false
   DELETE Redis keys: room:{id}:*, session:*
   Log: { rooms_expired: N }

2. Clear resolved rate limit violations:
   DELETE rate_limit_violations WHERE last_seen < NOW() - INTERVAL '7 days' AND is_blocked = false
   Log: { violations_cleared: N }

3. Clear expired room ban keys from Redis (Redis TTL handles this automatically,
   but confirm and log any Redis/Postgres divergence):
   Log: { bans_expired: N }

4. Archive old audit logs (optional, future):
   Move audit_logs older than 90 days to cold storage / S3
```

---

## 13. Implementation checklist

Use this as a build order. Each section should be completed and tested before moving to the next.

### Phase 1 — Foundation

- [ ] Initialise Node.js + TypeScript project (Express, Prisma, Socket.IO)
- [ ] Set up PostgreSQL locally (Docker)
- [ ] Set up Redis locally (Docker)
- [ ] Write and run Prisma migrations for all tables in §8
- [ ] Seed script with test users and a test room

### Phase 2 — Auth service

- [ ] Anonymous JWT issuance on first request (UUID generation, signed token in HttpOnly cookie + anon_id returned)
- [ ] Local registration and login (bcrypt, JWT)
- [ ] Refresh token rotation (1 month) via HttpOnly cookie
- [ ] Identity merge flow (anon → authenticated)
- [ ] Username claim endpoint with advisory lock + 409 on conflict
- [ ] FingerprintJS integration on the client

### Phase 3 — REST API

- [ ] `POST /api/rooms` — create room (authenticated only)
- [ ] `GET /api/rooms/:short_code` — room metadata
- [ ] `DELETE /api/rooms/:short_code` — deactivate room (owner only)
- [ ] `GET /api/users/me` — current user profile
- [ ] `PATCH /api/users/me/username` — claim username
- [ ] `POST /api/rooms/:short_code/bans` — owner applies a ban (owner-only)
- [ ] `GET /api/rooms/:short_code/bans` — owner views active bans
- [ ] `POST /api/rooms/:short_code/bans/lift` — owner lifts a ban (owner-only)

### Phase 4 — Rate limiting and hCaptcha

- [ ] Redis sliding window middleware (configurable per endpoint)
- [ ] `rate_limit_violations` write on breach
- [ ] Block check before rate limit logic
- [ ] hCaptcha verification hooks for anonymous join abuse (feature-flagged, default off in local)
- [ ] One-time token storage in Redis (replay prevention)
- [ ] `hostname` validation in hCaptcha response
- [ ] 30-second cooldown after successful CAPTCHA

### Phase 5 — WebSocket gateway

- [ ] Socket.IO server with Redis adapter
- [ ] `room:join` handler (all checks: block, ban, capacity, session restore)
- [ ] `room:vote` handler (validate value against Fibonacci deck; store in Redis)
- [ ] `room:reveal` handler (read Redis vote hash; broadcast; write audit in transaction)
- [ ] `room:hide` handler
- [ ] `room:reset` handler (clear vote hash; reset participant votes)
- [ ] `room:leave` / disconnect handler (SREM member; set left_at; broadcast user:left)
- [ ] `room:kick` handler (owner-only auth check)
- [ ] `room:ban` handler with backoff tiers

### Phase 6 — Audit logging

- [ ] `writeAuditEvent(tx, ...)` helper — always requires transaction
- [ ] Instrument all events listed in §9
- [ ] Verify `audit_logs` table has no UPDATE/DELETE permission for app DB user
- [ ] Test: state change without audit record should be impossible

### Phase 7 — Reconnection and presence

- [ ] Redis heartbeat session (`SET session:{key} EX 60` on every WS event)
- [ ] Reconnect detection in `room:join` (check session key + active `room_sessions` row)
- [ ] Vote restoration on reconnect
- [ ] Participant count correction on reconnect (no double-count)

### Phase 8 — Frontend

- [x] React + Vite + TypeScript scaffold
- [x] shadcn-style components + Tailwind setup
- [x] TanStack Query integration
- [x] Routing: `/`, `/room/:short_code`, `/login`, `/register`, `/profile`, `/settings`
- [x] Anonymous bootstrap + FingerprintJS initialisation on app load
- [x] Access-token auto-refresh and intended-URL redirect after auth
- [x] Home page: anonymous join flow + authenticated create-room flow
- [x] Room creation: optional name and creator theme-color picker
- [x] Room view: participant list, auth/anon badges, vote indicators, and `<count>/<capacity>` header
- [x] Vote reveal / hide / reset UI (any participant can trigger)
- [x] Post-reveal statistics panel (average, median, consensus, `?` count, `☕` count)
- [x] Dedicated room state pages (`banned`, `capacity exceeded`, `expired`)
- [x] Login / register forms (Google OAuth deferred to fast follow)
- [ ] Owner moderation UI (ban/list/lift) — fast follow
- [ ] FE tests (Vitest + RTL smoke coverage) — fast follow

### Phase 9 — Maintenance jobs

- [ ] Vote state sync (`setInterval`, 30 seconds)
- [ ] Daily cleanup cron (expired rooms, stale violations, ban reconciliation)
- [ ] Structured logging for all cron runs

### Phase 10 — Hardening and testing

- [ ] Unit tests: rate limiter, identity merge, CAPTCHA verification, ban escalation
- [ ] Integration tests: full room lifecycle (create → join → vote → reveal → reset)
- [ ] Integration test: anon→auth merge preserves reporting linkage without mutating `audit_logs`
- [ ] Integration test: same participant reconnect across TTL miss does not duplicate active presence
- [ ] Integration test: owner-only enforcement for kick/ban/lift APIs and socket actions
- [ ] Load test: 100 concurrent participants in a single room
- [ ] Redis failover drill: kill Redis, verify fallback to Postgres, verify recovery
- [ ] Confirm `audit_logs` is truly append-only (attempt UPDATE/DELETE as app user, expect failure)
- [ ] Confirm short_code collision retry works
- [ ] Add FE smoke tests (routing/auth guard/room render) after API contract stabilizes

---

_End of specification._
