export function bannerFor(mode, autoUp = false) {
  if (mode === 'remote') return 'Playwright browser: REMOTE (AWS, isolated context)';
  return autoUp
    ? 'Playwright browser: REMOTE STARTING (the MCP launcher starts the AWS browser on demand, ~30s; if browser calls fail, run `remote-browser status`)'
    : 'Playwright browser: LOCAL FALLBACK (tunnel down; run `remote-browser up`, then reconnect /mcp)';
}
