#!/usr/bin/env bash
set -euo pipefail

# Starts the dedicated tmux server that backs Reach's console terminals.
#
# This is launched by reach-tmux.service (a separate systemd unit) so the tmux
# server lives in its own cgroup — independent of reach.service. That's what
# lets running shells survive a deploy / `systemctl restart reach`: restarting
# the Next.js process drops the tmux *clients* (PTYs), but the tmux *server* and
# its sessions keep running here.
#
# All options are applied in a single tmux command list, atomically with
# start-server, so `exit-empty off` takes effect before the server could decide
# to exit while sessionless.

SOCKET="${REACH_TMUX_SOCKET:-$HOME/.reach-tmux.sock}"

exec tmux -S "$SOCKET" start-server \; \
  set -s exit-empty off \; \
  set -g status off \; \
  set -g window-size latest \; \
  set -g aggressive-resize on \; \
  set -g history-limit 50000 \; \
  set -g escape-time 10 \; \
  set -g default-terminal screen-256color
