#!/usr/bin/env bash
set -euo pipefail

# One-time privileged setup to make Reach's console terminals survive server
# restarts and deploys, by backing them with a dedicated, independently-managed
# tmux server.
#
#   sudo bash scripts/setup-tmux.sh
#
# It is idempotent — safe to re-run. It:
#   1. installs tmux (apt/dnf/pacman)
#   2. installs reach-tmux.service (the persistent tmux server) and enables it
#   3. installs the updated reach.service (which now Wants= reach-tmux.service)
#   4. restarts reach so the running process picks up tmux

REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "setup-tmux: must run as root — use: sudo bash scripts/setup-tmux.sh" >&2
  exit 1
fi

echo "setup-tmux: ensuring tmux is installed ..."
if command -v tmux >/dev/null 2>&1; then
  echo "setup-tmux: tmux already present ($(tmux -V))"
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y tmux
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y tmux
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm tmux
else
  echo "setup-tmux: no supported package manager found — install tmux manually, then re-run." >&2
  exit 1
fi

echo "setup-tmux: installing systemd units ..."
chmod +x "$REPO/scripts/reach-tmux-start.sh"
install -m 0644 "$REPO/scripts/reach-tmux.service" /etc/systemd/system/reach-tmux.service
install -m 0644 "$REPO/scripts/reach.service" /etc/systemd/system/reach.service

systemctl daemon-reload
systemctl enable --now reach-tmux.service
systemctl restart reach.service

echo
echo "setup-tmux: done."
echo "  • Persistent tmux server:  systemctl status reach-tmux"
echo "  • Console terminals now survive deploys and 'systemctl restart reach'."
echo "  • Inspect live shells:     tmux -S /home/regan/.reach-tmux.sock ls"
