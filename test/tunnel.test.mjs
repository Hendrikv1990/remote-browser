import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.mjs';
import { sshBase, tunnelArgs, closeArgs } from '../src/tunnel.mjs';

const cfg = { ...DEFAULTS, keyPath: '/k.pem', ports: [3000, 4000], cdpPort: 9222 };

test('sshBase has key, strict-ish host key handling, keepalive, target last', () => {
  const a = sshBase(cfg, '1.2.3.4');
  assert.equal(a.at(-1), 'ubuntu@1.2.3.4');
  assert.ok(a.includes('-i') && a.includes('/k.pem'));
  assert.ok(a.includes('ServerAliveInterval=30'));
  assert.ok(a.includes('ExitOnForwardFailure=yes'));
});

test('tunnelArgs: control master, -L cdp, -R for each port', () => {
  const a = tunnelArgs(cfg, '1.2.3.4', '/s.sock');
  assert.deepEqual(a.slice(0, 4), ['-M', '-S', '/s.sock', '-fN']);
  assert.ok(a.join(' ').includes('-L 9222:127.0.0.1:9222'));
  assert.ok(a.join(' ').includes('-R 3000:127.0.0.1:3000'));
  assert.ok(a.join(' ').includes('-R 4000:127.0.0.1:4000'));
  assert.equal(a.at(-1), 'ubuntu@1.2.3.4');
});

test('closeArgs uses -O exit on the socket', () => {
  assert.deepEqual(closeArgs(cfg, '1.2.3.4', '/s.sock'), ['-S', '/s.sock', '-O', 'exit', 'ubuntu@1.2.3.4']);
});
