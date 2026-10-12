# remote-browser

Runs the Playwright MCP's browser headless in Docker on a stoppable AWS EC2 instance, reached through an SSH tunnel, so parallel Claude Code sessions stop opening local Chrome windows. Falls back to local headless Chromium when the tunnel is down. Every session gets an isolated browser context (`--isolated`).

Design: see the spec in the person-ops repo, `docs/superpowers/specs/2026-10-12-remote-browser-design.md`.

## Install

```bash
npm install && npm link
```

## One-time setup (AWS parts are yours to run)

```bash
# 1. IAM: create a dedicated user, attach infra/iam-policy.json, then:
aws configure --profile remote-browser
# 2. Config
mkdir -p ~/.remote-browser
echo '{ "awsProfile": "remote-browser", "region": "eu-west-1" }' > ~/.remote-browser/config.json
# 3. Provision (asks for confirmation before anything billable)
remote-browser init
```

Wire into Claude Code:

```bash
ln -s ~/Projects/remote-browser/skill ~/.claude/skills/remote-browser
claude mcp add --scope user playwright -- remote-browser-mcp
```

Disable the plugin's own Playwright MCP so two servers do not both launch browsers. Tool names change from `mcp__plugin_playwright_playwright__*` to `mcp__playwright__*`; check project skills or agents that reference the old prefix.

SessionStart hook for `~/.claude/settings.json`:

```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "node ~/Projects/remote-browser/hooks/session-start.mjs" } ] } ] } }
```

## Commands

`remote-browser init | up | down | status`. Usage details live in `skill/SKILL.md`.

Config: `~/.remote-browser/config.json` (ports, region, profile, idle minutes). `REMOTE_BROWSER_HOME` overrides the directory.

## Tests

`npm test` for unit tests; `npm run test:e2e` needs Docker and internet (isolation check against a local container).

## Manual end-to-end checklist (record results here)

1. Tunnel closed: start a session. Banner says `LOCAL FALLBACK`. Navigate to `http://localhost:3000`; it works, headless.
2. `remote-browser up`. Reconnect `/mcp`. New session banner says `REMOTE`. Navigate to `http://localhost:3000`; it loads the laptop's app.
3. Open 3 sessions; set a cookie in one on `http://localhost:3000`; the others must not see it.
4. Activity Monitor shows no new Chrome processes during steps 2-3.
5. `ssh` into the instance and confirm `docker ps` lists `rb-chrome`.
6. Close all sessions, wait 30+ minutes: instance becomes `stopped` without `down`.
7. `remote-browser down` twice: second run reports already stopped, no error.
8. Change networks, run `up`: `aws ec2 describe-security-groups` shows exactly one port-22 rule.

Results: not yet run.
