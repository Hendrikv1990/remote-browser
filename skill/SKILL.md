---
name: remote-browser
description: Use when the user mentions the remote browser, AWS Playwright, a slow laptop from too many browsers, or when Playwright MCP calls fail with a connection error; explains how to start/stop the remote browser and which backend the session has.
---

# Remote browser

Playwright MCP runs in headless Chromium on an AWS instance, reached through an SSH tunnel.
Your session context begins with one line: `Playwright browser: REMOTE ...`, `REMOTE STARTING ...` or `LOCAL FALLBACK ...`.

**Start on demand:** when the MCP starts and the remote browser is down, the launcher runs `up` itself (about 30s, up to 60s if the instance is still stopping) and then uses REMOTE. It falls back to local only if that fails. A lock makes parallel sessions wait for one start instead of racing. Turn this off with `RB_AUTO_UP=0`. `MCP_TIMEOUT=180000` in `~/.claude/settings.json` keeps Claude Code from timing out the MCP while it waits.

## Commands (run in the user's shell)
- `remote-browser up`: start the instance and tunnel (about 1 min). Then reconnect `/mcp` in each session.
- `remote-browser down`: close the tunnel and stop the instance (stops billing).
- `remote-browser status`: instance, tunnel and last mode.

## Rules
- The mode is chosen once, when the MCP starts. If the tunnel drops mid-session (laptop sleep, network change, idle stop), browser calls fail; they do not switch to local.
  Fix: reconnect `/mcp` (this starts it on demand again), or ask the user to run `remote-browser up` first.
- Each session has its own isolated browser context (no shared cookies or tabs).
- Test apps on the laptop at `http://localhost:PORT`. Only forwarded ports work remotely
  (default 3000, 3001, 4000-4002, 5000; see `~/.remote-browser/config.json`). Any other port will fail to connect in REMOTE mode.
- The instance stops itself after about 30 minutes without browser activity.
