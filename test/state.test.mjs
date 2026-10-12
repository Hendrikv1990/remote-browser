import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, readState } from '../src/state.mjs';

test('readState returns null when absent; round-trips when written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-'));
  assert.equal(readState(dir), null);
  writeState({ mode: 'remote', cdpPort: 9222, pid: 1, at: 'now' }, dir);
  assert.equal(readState(dir).mode, 'remote');
});
