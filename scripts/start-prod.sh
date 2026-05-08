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

export NODE_ENV=production
exec node_modules/.bin/tsx server.ts
