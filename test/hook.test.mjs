import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('hook emits SessionStart additionalContext JSON (local when nothing is listening)', () => {
  const hook = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
  const out = execFileSync('node', [hook], { env: { ...process.env, REMOTE_BROWSER_HOME: '/nonexistent-rb', RB_CDP_PORT_OVERRIDE: '1' } }).toString();
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(json.hookSpecificOutput.additionalContext, /LOCAL FALLBACK/);
});
