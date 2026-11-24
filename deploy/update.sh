#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${AIROCONCEPT_DIR:-/opt/airoconcept}"
BRANCH="${AIROCONCEPT_BRANCH:-main}"
DEPLOY_MARKER="$APP_DIR/.deploy-commit"

cd "$APP_DIR"
git fetch --prune origin "$BRANCH"

target_commit="$(git rev-parse "origin/$BRANCH")"
deployed_commit="$(cat "$DEPLOY_MARKER" 2>/dev/null || true)"

if [[ "$target_commit" == "$deployed_commit" ]]; then
  exit 0
fi

git merge --ff-only "origin/$BRANCH"
docker compose build
docker compose build migrate
docker compose run --rm migrate
docker compose up -d --remove-orphans

printf '%s\n' "$target_commit" > "$DEPLOY_MARKER"
