import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.mjs';
import { buildUserData } from '../src/userdata.mjs';

const ud = buildUserData({ cfg: DEFAULTS, entrypoint: '#!/bin/sh\necho hi\n', idleStop: '#!/bin/sh\necho idle\n' });

test('starts with a bash shebang and installs docker', () => {
  assert.ok(ud.startsWith('#!/bin/bash'));
  assert.match(ud, /apt-get install -y docker\.io/);
});
test('runs the browser container on the host network, restarting on boot', () => {
  assert.match(ud, /docker run -d --name rb-chrome --restart unless-stopped --network host --ipc=host --init/);
  assert.ok(ud.includes(DEFAULTS.image));
});
test('embeds files base64-encoded', () => {
  assert.ok(ud.includes(Buffer.from('#!/bin/sh\necho hi\n').toString('base64')));
  assert.ok(ud.includes(Buffer.from('#!/bin/sh\necho idle\n').toString('base64')));
});
test('idle timer runs every minute with configured idle minutes', () => {
  assert.match(ud, /OnUnitActiveSec=60/);
  assert.match(ud, /IDLE_MINUTES=30/);
});
test('stays under the 16KB user-data limit', () => {
  assert.ok(Buffer.byteLength(ud) < 16 * 1024);
});
