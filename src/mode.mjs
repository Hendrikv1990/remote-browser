export async function probeCdp(cdpPort, fetchFn = fetch, timeoutMs = 1500) {
  // A ref'd timer, not AbortSignal.timeout (unref'd): the probe must resolve even if nothing else keeps the loop alive.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`http://127.0.0.1:${cdpPort}/json/version`, { signal: ctl.signal });
    return Boolean(res.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function chooseMode(cdpPort, probe = probeCdp) {
  return (await probe(cdpPort)) ? 'remote' : 'local';
}

export function playwrightArgs(mode, cdpPort) {
  return mode === 'remote'
    ? ['--cdp-endpoint', `http://127.0.0.1:${cdpPort}`, '--isolated']
    : ['--headless', '--isolated'];
}
