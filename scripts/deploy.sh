#!/usr/bin/env bash
set -euo pipefail

# Atomic deploy: build into a staging directory and swap into place only
# after the build succeeds. An interrupted or failed build leaves the live
# .next/ directory untouched, so the service keeps serving the previous
# build (or stays cleanly stopped) instead of crash-looping on a partial
# build.

cd "$(dirname "$0")/.."

LIVE=".next"
STAGING=".next.staging"
PREVIOUS=".next.previous"

rm -rf "$STAGING"

# Next.js rewrites tsconfig.json on every build to inject
# "<distDir>/types/**/*.ts" into "include". Building into a staging dir
# would otherwise leave a stale ".next.staging/types/**/*.ts" reference
# committed to tsconfig.json — snapshot and restore it instead.
TSCONFIG_BACKUP="$(mktemp)"
cp tsconfig.json "$TSCONFIG_BACKUP"
trap 'cp "$TSCONFIG_BACKUP" tsconfig.json; rm -f "$TSCONFIG_BACKUP"' EXIT

echo "reach: building into $STAGING ..."
NEXT_DIST_DIR="$STAGING" npx next build

if [ ! -f "$STAGING/BUILD_ID" ]; then
  echo "reach: build finished but $STAGING/BUILD_ID is missing — aborting swap." >&2
  exit 1
fi

echo "reach: swapping $STAGING -> $LIVE ..."
rm -rf "$PREVIOUS"
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$PREVIOUS"
fi
mv "$STAGING" "$LIVE"
rm -rf "$PREVIOUS"

echo "reach: restarting systemd service ..."
sudo systemctl restart reach

echo "reach: deploy complete."
