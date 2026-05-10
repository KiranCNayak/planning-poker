# planning-poker

A self-hosted planning poker app for agile estimation. Real-time rooms over Socket.IO, anonymous-friendly identity, owner moderation.

Stack: Node.js + Express + Socket.IO + Prisma (backend), React + Vite + TanStack Query + Tailwind (frontend), Postgres + Redis (infra).

## Quick start

```bash
docker compose up -d           # start Postgres + Redis
pnpm install
pnpm --filter @planning-poker/backend prisma:migrate
pnpm dev                       # backend on :4000, frontend on :5173
```

See [CLAUDE.md](./CLAUDE.md) for architecture details, module layout, and the full command reference. The product spec lives in [planning-poker-technical-spec.md](./planning-poker-technical-spec.md).

## Commit messages

Commits **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) spec. A `commit-msg` hook (commitlint) enforces this on every commit.

```
<type>(optional scope): <description>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`. Use `!` (or a `BREAKING CHANGE:` footer) for breaking changes.

Examples:

```
feat(rooms): add capacity check before join
fix(auth): reject anon bootstrap when fingerprint missing
chore(deps): bump prisma to 5.20
```

Release tooling (release-please) consumes these messages to generate the changelog and bump versions, so non-conforming commits are ignored by the release flow even if they slip past the hook.

## Scripts

| Command       | Purpose                             |
| ------------- | ----------------------------------- |
| `pnpm dev`    | Run backend + frontend concurrently |
| `pnpm build`  | Build both workspaces               |
| `pnpm test`   | Run all tests                       |
| `pnpm lint`   | ESLint (backend)                    |
| `pnpm format` | Prettier across the repo            |
