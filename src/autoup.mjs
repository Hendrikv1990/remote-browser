import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.mjs';

const LOCK_STALE_MS = 3 * 60 * 1000;

// mkdir is atomic: exactly one launcher wins. A lock older than LOCK_STALE_MS is from a crashed run.
export function tryLock(dir = CONFIG_DIR, now = Date.now) {
  const lock = join(dir, 'up.lock');
  try {
    mkdirSync(lock);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let age = 0;
    try { age = now() - statSync(lock).mtimeMs; } catch { return null; }
    if (age < LOCK_STALE_MS) return null;
    rmSync(lock, { recursive: true, force: true });
    try { mkdirSync(lock); } catch { return null; }
  }
  return () => rmSync(lock, { recursive: true, force: true });
}

// Makes the remote browser reachable, starting it if needed. Never throws: returns true if CDP is reachable.
// Concurrent launchers: one runs `up`, the others wait and re-probe, so nobody restarts a browser another session uses.
export async function ensureRemote({ cfg, probe, sleep, log, upFn, lock = tryLock, deadlineMs = 150_000, now = Date.now }) {
  const end = now() + deadlineMs;
  while (now() < end) {
    if (await probe(cfg.cdpPort)) return true;
    const release = lock();
    if (release) {
      try {
        if (await probe(cfg.cdpPort)) return true;
        log('[remote-browser] remote browser not reachable; starting it (about 30s)...');
        await upFn();
        return await probe(cfg.cdpPort);
      } catch (e) {
        log(`[remote-browser] auto-start failed: ${e.message}`);
        return false;
      } finally {
        release();
      }
    }
    await sleep(2000);
  }
  log('[remote-browser] timed out waiting for another session to start the remote browser');
  return false;
}

export const autoUpEnabled = (env = process.env) => env.RB_AUTO_UP !== '0';
