#!/usr/bin/env sh
set -eu

if git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then
  CHANGED_FILES="$(git diff --name-only '@{upstream}'...HEAD)"
else
  CHANGED_FILES="$(git diff --name-only HEAD~1...HEAD 2>/dev/null || git ls-files)"
fi

if [ -z "$CHANGED_FILES" ]; then
  echo "No changed files detected; skipping pre-push checks."
  exit 0
fi

RUN_BACKEND=0
RUN_FRONTEND=0

echo "$CHANGED_FILES" | grep -E '^backend/' >/dev/null 2>&1 && RUN_BACKEND=1 || true
echo "$CHANGED_FILES" | grep -E '^frontend/' >/dev/null 2>&1 && RUN_FRONTEND=1 || true

if [ "$RUN_BACKEND" -eq 1 ]; then
  echo "Running backend checks (changed files detected in backend/)"
  pnpm lint:backend
  pnpm -C backend build
  pnpm -C backend test
else
  echo "No backend changes detected; skipping backend checks."
fi

if [ "$RUN_FRONTEND" -eq 1 ]; then
  echo "Running frontend checks (changed files detected in frontend/)"
  pnpm -C frontend build
else
  echo "No frontend changes detected; skipping frontend checks."
fi
