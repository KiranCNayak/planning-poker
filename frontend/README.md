# Frontend Setup

## Stack

- React + Vite + TypeScript
- shadcn-style component primitives
- Tailwind CSS
- TanStack Query
- Socket.IO client
- FingerprintJS (open source)

## Run

From repo root:

```bash
pnpm -C frontend dev
```

## Environment

Optional overrides:

- `VITE_API_BASE_URL` (default `http://localhost:4000`)
- `VITE_SOCKET_BASE_URL` (default same as API base)
- `VITE_SHARE_BASE_URL` (default current browser origin; useful for LAN/QR testing)

## Mobile QR testing on local network

- Start frontend so it is reachable from your phone: `pnpm -C frontend dev -- --host`
- Ensure backend CORS allows both localhost and your LAN frontend origin in `backend/.env` via comma-separated `CORS_ORIGIN`.
- If needed, set `VITE_SHARE_BASE_URL` to your LAN URL (for example `http://192.168.1.10:5173`) so the QR code resolves on mobile.

## Implemented v1 UX

- Home page with room join for anonymous users.
- Login/register flows.
- Create room only when authenticated.
- Optional room name at creation.
- Theme color selection at creation UI.
- Room page with participant list and auth/anon badges.
- Voting deck and reveal/hide/reset controls.
- Reveal stats: average, median, consensus, `?` count, `☕` count.
- Connection status badge (`connected/reconnecting/disconnected`).
- Dedicated pages for room banned/capacity/expired states.
- Profile and settings pages.

## Fast follow items

- Owner moderation controls UI (ban/list/lift).
- FE test suite (Vitest + RTL) after UI/API contract stabilizes.
- Shared room theme propagation from backend room metadata.
- Better reconnect state hydration from backend room state payload.
