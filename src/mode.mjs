export async function probeCdp(cdpPort, fetchFn = fetch, timeoutMs = 1500) {
  try {
    const res = await fetchFn(`http://127.0.0.1:${cdpPort}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return Boolean(res.ok);
  } catch {
    return false;
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
