#!/usr/bin/env sh
set -eu
cd /opt/airoconcept
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then exit 0; fi
git pull --ff-only origin main
docker compose up -d --build
