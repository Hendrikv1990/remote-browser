import test from 'node:test';
import assert from 'node:assert/strict';
import { runLauncher } from '../src/launcher.mjs';

const cfg = { cdpPort: 9222, mcpPackage: '@playwright/mcp@latest' };
const fakeSpawn = (calls) => (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { on() {} }; };

test('remote mode: cdp endpoint, isolated, passthrough args', async () => {
  const calls = [];
  const written = [];
  await runLauncher({ cfg, argv: ['--viewport-size', '1280x720'], choose: async () => 'remote',
    write: (s) => written.push(s), spawnFn: fakeSpawn(calls) });
  assert.equal(calls[0].cmd, 'npx');
  assert.deepEqual(calls[0].args, ['-y', '@playwright/mcp@latest', '--cdp-endpoint', 'http://127.0.0.1:9222', '--isolated', '--viewport-size', '1280x720']);
  assert.equal(calls[0].opts.stdio, 'inherit');
  assert.equal(written[0].mode, 'remote');
});

test('local mode: headless + isolated', async () => {
  const calls = [];
  await runLauncher({ cfg, argv: [], choose: async () => 'local', write: () => {}, spawnFn: fakeSpawn(calls) });
  assert.deepEqual(calls[0].args, ['-y', '@playwright/mcp@latest', '--headless', '--isolated']);
});
