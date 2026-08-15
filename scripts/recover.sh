#!/usr/bin/env bash
# One-shot recovery for Reach after an unclean shutdown.
# Run with: sudo bash ~/apps/reach/scripts/recover.sh
#
# Idempotent: safe to re-run. Restores node_modules if missing, clears the
# systemd start-limit latch, installs tmux if absent, and starts the services.
set -uo pipefail

APP_DIR="/home/regan/apps/reach"
RUN_AS="regan"

echo "==> reach recovery starting"

# 1) Restore dependencies if node_modules is missing/empty (runs as the app user,
#    not root, so file ownership stays correct).
if [ ! -x "$APP_DIR/node_modules/.bin/tsx" ]; then
  echo "==> node_modules missing — running npm install as $RUN_AS"
  sudo -u "$RUN_AS" bash -lc "cd '$APP_DIR' && npm install"
else
  echo "==> node_modules present — skipping npm install"
fi

# 2) Install tmux if missing (backs the console terminals; non-fatal if it fails).
if ! command -v tmux >/dev/null 2>&1; then
  echo "==> tmux not found — installing"
  apt-get install -y tmux || echo "WARN: tmux install failed; portal will still run"
else
  echo "==> tmux present"
fi

# 3) Clear the failed/start-limit latch so the units can start again.
echo "==> clearing failed state"
systemctl reset-failed reach.service reach-tmux.service 2>/dev/null || true

# 4) Start the services (reach pulls in reach-tmux via Wants=).
echo "==> starting reach.service"
systemctl start reach.service

sleep 3
echo "==> status"
systemctl --no-pager --lines=0 status reach.service reach-tmux.service || true

echo "==> http check"
curl -fsS -o /dev/null -w "login -> HTTP %{http_code}\n" http://127.0.0.1:3000/login \
  || echo "WARN: could not reach http://127.0.0.1:3000/login yet"

echo "==> done"
