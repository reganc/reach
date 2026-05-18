#!/usr/bin/env bash
set -euo pipefail

# Load nvm so the systemd service uses whichever Node version is current,
# without pinning a version-specific path in the unit file.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

cd "$(dirname "$0")/.."

# Fail fast with a clear message if the production build is missing or
# incomplete, so the journal shows the cause instead of a Next.js stack
# trace looping forever. Combined with StartLimitBurst in the unit file,
# systemd will stop retrying after a handful of attempts.
if [ ! -f ".next/BUILD_ID" ] || [ ! -f ".next/prerender-manifest.json" ] || [ ! -f ".next/routes-manifest.json" ]; then
  echo "reach: refusing to start — .next/ is missing or incomplete." >&2
  echo "reach: run 'npm run deploy' to rebuild and restart." >&2
  exit 1
fi

export NODE_ENV=production
exec node_modules/.bin/tsx server.ts
