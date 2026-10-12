#!/bin/sh
set -e
CDP_PORT="${CDP_PORT:-9222}"
BIN=$(ls -d /ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell | head -1)

if [ -n "$RB_FORWARD_PORT" ]; then
  node -e "
    const net = require('net');
    net.createServer((c) => {
      const u = net.connect(${CDP_PORT}, '127.0.0.1');
      c.pipe(u).pipe(c);
      c.on('error', () => u.destroy());
      u.on('error', () => c.destroy());
    }).listen(Number(process.env.RB_FORWARD_PORT), '0.0.0.0');
  " &
fi

exec "$BIN" --no-sandbox --disable-gpu --remote-debugging-port="$CDP_PORT" about:blank
