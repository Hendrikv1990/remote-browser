import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.mjs';
import { up } from '../src/commands/up.mjs';
import { down } from '../src/commands/down.mjs';
import { status } from '../src/commands/status.mjs';

const cfg = { ...DEFAULTS, instanceId: 'i-1', securityGroupId: 'sg-1', keyPath: '/k.pem', ports: [3000, 4000] };

function harness({ probeResult = true, sshFailsOn = [] } = {}) {
  const log = []; const sshCalls = []; const awsCalls = [];
  const aws = {
    startInstance: async (id) => awsCalls.push(['start', id]),
    stopInstance: async (id) => awsCalls.push(['stop', id]),
    waitRunning: async () => awsCalls.push(['waitRunning']),
    waitStopped: async () => awsCalls.push(['waitStopped']),
    describeInstance: async () => ({ state: 'running', publicIp: '9.9.9.9' }),
    replaceSshRule: async (sg, cidr) => awsCalls.push(['rule', sg, cidr]),
  };
  const ssh = async (args) => {
    sshCalls.push(args);
    if (sshFailsOn.some((s) => args.join(' ').includes(s))) throw new Error('ssh failed');
    return '';
  };
  return { log, sshCalls, awsCalls, deps: { cfg, aws, ssh, probe: async () => probeResult, myIp: async () => '1.2.3.4', sleep: async () => {}, log: (m) => log.push(m), sock: '/s.sock' } };
}

test('up: closes stale tunnel first, opens SG for current ip, restarts chrome, opens tunnel', async () => {
  const h = harness();
  await up(h.deps);
  assert.ok(h.sshCalls[0].includes('-O') && h.sshCalls[0].includes('exit'), 'stale socket closed first');
  assert.deepEqual(h.awsCalls.find((c) => c[0] === 'rule'), ['rule', 'sg-1', '1.2.3.4/32']);
  assert.ok(h.sshCalls.some((a) => a.includes('docker') && a.includes('restart') && a.includes('rb-chrome')));
  const tunnel = h.sshCalls.find((a) => a.includes('-fN'));
  assert.ok(tunnel.join(' ').includes('-R 4000:127.0.0.1:4000'));
});

test('up: stale-socket close failure is ignored', async () => {
  const h = harness({ sshFailsOn: ['-O exit'] });
  await up(h.deps);
});

test('up: throws a clear error when CDP never answers', async () => {
  const h = harness({ probeResult: false });
  await assert.rejects(up(h.deps), /CDP not reachable/);
});

test('up: refuses without an instance', async () => {
  const h = harness();
  await assert.rejects(up({ ...h.deps, cfg: { ...cfg, instanceId: null } }), /remote-browser init/);
});

test('down: idempotent when tunnel already gone and instance already stopped', async () => {
  const h = harness({ sshFailsOn: ['-O exit'] });
  h.deps.aws.describeInstance = async () => ({ state: 'stopped', publicIp: null });
  await down(h.deps);
  await down(h.deps);
  assert.ok(!h.awsCalls.some((c) => c[0] === 'stop'), 'does not stop an already stopped instance');
});

test('down: stops a running instance', async () => {
  const h = harness();
  await down(h.deps);
  assert.deepEqual(h.awsCalls.find((c) => c[0] === 'stop'), ['stop', 'i-1']);
});

test('status reports instance, tunnel and last mode', async () => {
  const h = harness();
  const s = await status({ ...h.deps, readState: () => ({ mode: 'remote' }) });
  assert.deepEqual(s, { instance: 'running', tunnel: true, mode: 'remote' });
});
