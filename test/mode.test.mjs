import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCdp, chooseMode, playwrightArgs } from '../src/mode.mjs';

test('probeCdp true when /json/version is ok', async () => {
  const f = async (url) => { assert.equal(url, 'http://127.0.0.1:9222/json/version'); return { ok: true }; };
  assert.equal(await probeCdp(9222, f), true);
});

test('probeCdp false on non-ok, on throw', async () => {
  assert.equal(await probeCdp(9222, async () => ({ ok: false })), false);
  assert.equal(await probeCdp(9222, async () => { throw new Error('ECONNREFUSED'); }), false);
});

test('probeCdp gives up fast when the port accepts but never answers', async () => {
  const hang = (_url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  const t0 = Date.now();
  assert.equal(await probeCdp(9222, hang), false);
  assert.ok(Date.now() - t0 < 2500, 'probe must time out within ~1.5s');
});

test('chooseMode maps probe result', async () => {
  assert.equal(await chooseMode(9222, async () => true), 'remote');
  assert.equal(await chooseMode(9222, async () => false), 'local');
});

test('playwrightArgs: remote uses cdp endpoint + isolated', () => {
  assert.deepEqual(playwrightArgs('remote', 9222), ['--cdp-endpoint', 'http://127.0.0.1:9222', '--isolated']);
});

test('playwrightArgs: local is headless + isolated (no shared profile lock)', () => {
  assert.deepEqual(playwrightArgs('local', 9222), ['--headless', '--isolated']);
});
