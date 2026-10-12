#!/bin/sh
# Halts the machine after IDLE_MINUTES consecutive runs with no established CDP connections.
# Run once a minute by rb-idle-stop.timer. An open SSH tunnel alone does not count as activity.
CDP_PORT="${CDP_PORT:-9222}"
IDLE_MINUTES="${IDLE_MINUTES:-30}"
STATE_DIR="${RB_STATE_DIR:-/run/rb-idle}"
mkdir -p "$STATE_DIR"
f="$STATE_DIR/idle_ticks"

conns=$(ss -Htn state established "( sport = :$CDP_PORT )" | wc -l | tr -d ' ')
if [ "$conns" -gt 0 ]; then
  echo 0 > "$f"
  exit 0
fi

ticks=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))
echo "$ticks" > "$f"
if [ "$ticks" -ge "$IDLE_MINUTES" ]; then
  shutdown -h now "remote-browser idle for ${IDLE_MINUTES}m"
fi
