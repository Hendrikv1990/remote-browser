import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../infra/idle-stop.sh', import.meta.url));

function setup(connLines) {
  const dir = mkdtempSync(join(tmpdir(), 'rb-idle-'));
  const bin = join(dir, 'bin'); execFileSync('mkdir', [bin]);
  writeFileSync(join(bin, 'ss'), `#!/bin/sh\n${connLines.map((l) => `echo "${l}"`).join('\n')}\n`);
  writeFileSync(join(bin, 'shutdown'), `#!/bin/sh\ntouch "${dir}/SHUTDOWN"\n`);
  chmodSync(join(bin, 'ss'), 0o755); chmodSync(join(bin, 'shutdown'), 0o755);
  const run = () => execFileSync('sh', [script], { env: { PATH: `${bin}:${process.env.PATH}`, IDLE_MINUTES: '3', RB_STATE_DIR: join(dir, 'state') } });
  return { run, halted: () => existsSync(join(dir, 'SHUTDOWN')) };
}

test('halts after IDLE_MINUTES consecutive idle runs', () => {
  const t = setup([]);
  t.run(); t.run();
  assert.equal(t.halted(), false);
  t.run();
  assert.equal(t.halted(), true);
});

test('an established CDP connection resets the counter', () => {
  const idle = setup([]);
  idle.run(); idle.run();
  const busy = setup(['ESTAB 0 0 127.0.0.1:9222 127.0.0.1:50000']);
  busy.run(); busy.run(); busy.run(); busy.run();
  assert.equal(busy.halted(), false);
});

test('default state dir is tmpfs (/run), not the persistent root volume', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(script, 'utf8'), /RB_STATE_DIR:-\/run\/rb-idle/);
});
