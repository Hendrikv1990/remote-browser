export function bannerFor(mode) {
  return mode === 'remote'
    ? 'Playwright browser: REMOTE (AWS, isolated context)'
    : 'Playwright browser: LOCAL FALLBACK (tunnel down; run `remote-browser up`, then reconnect /mcp)';
}
