.PHONY: help \
	up up-gateway down down-gateway logs ps \
	dev dev-backend dev-frontend dev-gateway \
	build test lint lint-fix format format-check \
	db-migrate db-generate db-reset \
	install clean

help:
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- Infrastructure ----------------------------------------------------------

up: ## Start Postgres + Redis
	docker compose up -d

up-gateway: ## Start Postgres + Redis + nginx gateway (:8080)
	docker compose --profile gateway up -d

down: ## Stop Postgres + Redis
	docker compose down

down-gateway: ## Stop everything including the gateway
	docker compose --profile gateway down

logs: ## Tail compose logs
	docker compose logs -f

ps: ## Show compose service status
	docker compose ps

# ---- Development -------------------------------------------------------------

dev: ## Run backend + frontend concurrently
	pnpm dev

dev-backend: ## Run backend only (port 4000)
	pnpm --filter @planning-poker/backend dev

dev-frontend: ## Run frontend only (port 5173)
	pnpm --filter @planning-poker/frontend dev

# Run the backend with proxy-aware identity resolution for use behind the
# nginx gateway (see CLAUDE.md). Pair with `make up-gateway`.
dev-gateway: ## Run backend trusting one upstream proxy (for `make up-gateway`)
	TRUST_PROXY=1 CORS_ORIGIN=http://localhost:5173,http://localhost:8080 \
		pnpm --filter @planning-poker/backend dev

# ---- Build / test / lint -----------------------------------------------------

build: ## Build both workspaces
	pnpm build

test: ## Run all tests
	pnpm test

lint: ## ESLint backend
	pnpm lint

lint-fix: ## ESLint backend with --fix
	pnpm lint:backend:fix

format: ## Prettier write
	pnpm format

format-check: ## Prettier check
	pnpm format:check

# ---- Database ----------------------------------------------------------------

db-migrate: ## Apply pending Prisma migrations
	pnpm --filter @planning-poker/backend prisma:migrate

db-generate: ## Regenerate Prisma client
	pnpm --filter @planning-poker/backend prisma:generate

reset-db: ## Drop and recreate all tables
	pnpm --filter @planning-poker/backend prisma:reset

# ---- Misc --------------------------------------------------------------------

install: ## Install dependencies
	pnpm install

clean: ## Remove build output and node_modules
	rm -rf backend/dist frontend/dist
	pnpm -r exec rm -rf node_modules
	rm -rf node_modules
