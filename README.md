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

## Cost guards

`infra/iam-policy.json` limits what the credential can do: only `t4g.large`, only `eu-west-1`, tagged-instance start/stop, no terminate or delete. If you change `region`, change `aws:RequestedRegion` in the policy too. IAM cannot cap *how many* instances or *how long* they run, so add a budget (console, your admin login, not the remote-browser user):

1. Billing > Budgets > Create budget > Cost budget, monthly, about $15. Alerts by email at 50% and 100% of actual spend and 100% of forecast.
2. Create a customer-managed IAM policy `remote-browser-budget-deny` from `infra/budget-deny-policy.json`. **Do not attach it to the user yourself**: an explicit deny overrides every allow, so attaching it by hand blocks `init` and `up` immediately. Only the budget action (step 3) should attach it. It denies `RunInstances` and `StartInstances` but not `StopInstances`, so `remote-browser down` still works.
3. On the 100% actual alert, add a **budget action**: "Apply IAM policy" > `remote-browser-budget-deny` > the remote-browser IAM user. Optionally add a second action on the same threshold, "Stop EC2 instances", for the instance id from `~/.remote-browser/config.json` (`instanceId`). Both need an execution role that `budgets.amazonaws.com` can assume; the console offers to create it. Choose automatic execution, not manual approval, or it will not protect you while you sleep.
4. After a trigger, remove the deny policy from the user to use the tool again.

Budgets use billing data that lags by roughly 8-12 hours, so this is a backstop for runaway spend, not a real-time limit. Still check `remote-browser status` at the end of the day for the first week.

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
