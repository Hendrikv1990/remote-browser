import test from 'node:test';
import assert from 'node:assert/strict';
import { bannerFor } from '../src/banner.mjs';

test('remote banner', () => {
  assert.equal(bannerFor('remote'), 'Playwright browser: REMOTE (AWS, isolated context)');
});
test('local banner tells how to recover', () => {
  const b = bannerFor('local');
  assert.match(b, /^Playwright browser: LOCAL FALLBACK/);
  assert.match(b, /remote-browser up/);
  assert.match(b, /reconnect \/mcp/);
});
