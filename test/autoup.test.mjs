import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureRemote, tryLock, autoUpEnabled } from '../src/autoup.mjs';

const cfg = { cdpPort: 9222 };
const base = (o = {}) => {
  const log = [];
  return { log, args: { cfg, sleep: async () => {}, log: (m) => log.push(m), lock: () => () => {}, ...o } };
};

test('already reachable: does not start', async () => {
  let ups = 0;
  const { args } = base({ probe: async () => true, upFn: async () => { ups++; } });
  assert.equal(await ensureRemote(args), true);
  assert.equal(ups, 0);
});

test('unreachable: runs up once, then reports reachable', async () => {
  let ups = 0;
  const { args } = base({ probe: async () => ups > 0, upFn: async () => { ups++; } });
  assert.equal(await ensureRemote(args), true);
  assert.equal(ups, 1);
});

test('up throws: returns false (caller falls back to local) and logs', async () => {
  const { args, log } = base({ probe: async () => false, upFn: async () => { throw new Error('no aws creds'); } });
  assert.equal(await ensureRemote(args), false);
  assert.ok(log.some((m) => m.includes('no aws creds')));
});

test('lock held by another session: waits, never runs up, succeeds when it comes up', async () => {
  let probes = 0; let ups = 0;
  const { args } = base({ probe: async () => ++probes > 3, lock: () => null, upFn: async () => { ups++; } });
  assert.equal(await ensureRemote(args), true);
  assert.equal(ups, 0);
});

test('lock never freed: gives up at deadline', async () => {
  let t = 0;
  const { args } = base({ probe: async () => false, lock: () => null, upFn: async () => {}, deadlineMs: 10, now: () => (t += 5) });
  assert.equal(await ensureRemote(args), false);
});

test('re-probes after taking the lock (another session finished first)', async () => {
  let probes = 0; let ups = 0;
  const { args } = base({ probe: async () => ++probes > 1, upFn: async () => { ups++; } });
  assert.equal(await ensureRemote(args), true);
  assert.equal(ups, 0);
});

test('tryLock: exclusive, released, stale lock reclaimed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-lock-'));
  const rel = tryLock(dir);
  assert.ok(rel);
  assert.equal(tryLock(dir), null);
  rel();
  assert.equal(existsSync(join(dir, 'up.lock')), false);
  tryLock(dir);
  const old = (Date.now() - 10 * 60 * 1000) / 1000;
  utimesSync(join(dir, 'up.lock'), old, old);
  assert.ok(tryLock(dir), 'stale lock reclaimed');
});

test('RB_AUTO_UP=0 disables', () => {
  assert.equal(autoUpEnabled({}), true);
  assert.equal(autoUpEnabled({ RB_AUTO_UP: '0' }), false);
});
