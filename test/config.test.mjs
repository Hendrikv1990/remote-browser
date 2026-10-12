import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, validateConfig, DEFAULTS } from '../src/config.mjs';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'rb-')), 'config.json');

test('loadConfig returns defaults when file is missing', () => {
  const cfg = loadConfig(tmp());
  assert.deepEqual(cfg.ports, [3000, 3001, 4000, 4001, 4002, 5000]);
  assert.equal(cfg.cdpPort, 9222);
  assert.equal(cfg.instanceType, 't4g.large');
  assert.equal(cfg.idleMinutes, 30);
});

test('loadConfig merges file values over defaults', () => {
  const p = tmp();
  writeFileSync(p, JSON.stringify({ region: 'eu-central-1', ports: [3000] }));
  const cfg = loadConfig(p);
  assert.equal(cfg.region, 'eu-central-1');
  assert.deepEqual(cfg.ports, [3000]);
  assert.equal(cfg.awsProfile, DEFAULTS.awsProfile);
});

test('saveConfig round-trips', () => {
  const p = tmp();
  saveConfig({ ...DEFAULTS, instanceId: 'i-123' }, p);
  assert.equal(loadConfig(p).instanceId, 'i-123');
});

test('validateConfig rejects bad ports', () => {
  assert.throws(() => validateConfig({ ...DEFAULTS, ports: [0] }), /ports/);
  assert.throws(() => validateConfig({ ...DEFAULTS, ports: [3000, 3000] }), /duplicate/i);
  assert.throws(() => validateConfig({ ...DEFAULTS, ports: ['3000'] }), /ports/);
});

test('validateConfig rejects non-positive idleMinutes', () => {
  assert.throws(() => validateConfig({ ...DEFAULTS, idleMinutes: 0 }), /idleMinutes/);
});
