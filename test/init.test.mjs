import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.mjs';
import { init } from '../src/commands/init.mjs';

function harness({ answers, existing = {} }) {
  const calls = []; const saved = []; const asked = [];
  const aws = {
    run: async (args) => {
      calls.push(args.join(' '));
      const j = args.join(' ');
      if (j.includes('describe-key-pairs')) return JSON.stringify({ KeyPairs: existing.keyPair ? [{ KeyName: 'remote-browser' }] : [] });
      if (j.includes('describe-security-groups')) return JSON.stringify({ SecurityGroups: existing.sg ? [{ GroupId: 'sg-existing' }] : [] });
      if (j.includes('ssm get-parameter')) return JSON.stringify({ Parameter: { Value: 'ami-123' } });
      if (j.includes('create-key-pair')) return JSON.stringify({ KeyMaterial: 'PEM' });
      if (j.includes('create-security-group')) return JSON.stringify({ GroupId: 'sg-1' });
      if (j.includes('run-instances')) return JSON.stringify({ Instances: [{ InstanceId: 'i-1' }] });
      return '{}';
    },
    ec2: async (args) => { calls.push('ec2 ' + args.join(' ')); return '{}'; },
    waitRunning: async () => calls.push('waitRunning'),
    waitStopped: async () => calls.push('waitStopped'),
    stopInstance: async () => calls.push('stopInstance'),
    describeInstance: async () => ({ state: 'running', publicIp: '9.9.9.9' }),
    replaceSshRule: async (sg, cidr) => calls.push(`rule ${sg} ${cidr}`),
  };
  const files = [];
  return {
    calls, saved, asked, files,
    deps: {
      cfg: { ...DEFAULTS }, aws, ssh: async () => 'done', sleep: async () => {}, log: () => {},
      myIp: async () => '1.2.3.4',
      confirm: async (q) => { asked.push(q); return answers.shift(); },
      save: (c) => saved.push(c),
      writeKey: (path, pem) => files.push([path, pem]),
      hasKeyFile: () => existing.keyFile ?? false,
      entrypoint: '#!/bin/sh\n', idleStop: '#!/bin/sh\n',
    },
  };
}

test('declining the billable step creates nothing billable and saves nothing', async () => {
  const h = harness({ answers: [false] });
  await init(h.deps);
  assert.ok(!h.calls.some((c) => c.includes('run-instances')));
  assert.equal(h.saved.length, 0);
});

test('accepting provisions key, sg, instance, saves ids, then stops the instance', async () => {
  const h = harness({ answers: [true] });
  await init(h.deps);
  assert.deepEqual(h.files[0], [DEFAULTS.keyPath, 'PEM']);
  const run = h.calls.find((c) => c.includes('run-instances'));
  assert.ok(run.includes('--instance-type t4g.large'));
  assert.ok(run.includes('--instance-initiated-shutdown-behavior stop'));
  assert.ok(run.includes('--image-id ami-123'));
  assert.equal(h.saved.at(-1).instanceId, 'i-1');
  assert.equal(h.saved.at(-1).securityGroupId, 'sg-1');
  assert.ok(h.calls.includes('stopInstance'), 'leaves the instance stopped to avoid idle cost');
});

test('waits for the instance to be fully stopped before telling the user to run up', async () => {
  const h = harness({ answers: [true] });
  await init(h.deps);
  assert.ok(h.calls.indexOf('waitStopped') > h.calls.indexOf('stopInstance'));
});

test('fails loudly, leaving the instance alone, when first-boot setup never succeeds', async () => {
  const h = harness({ answers: [true] });
  h.deps.ssh = async () => { throw new Error('cloud-init exited 1'); };
  await assert.rejects(init(h.deps), /cloud-init-output\.log/);
  assert.ok(!h.calls.includes('stopInstance'));
});

test('reuses a key pair and security group left over from a failed run', async () => {
  const h = harness({ answers: [true], existing: { keyPair: true, sg: true, keyFile: true } });
  await init(h.deps);
  assert.ok(!h.calls.some((c) => c.includes('create-key-pair')), 'no second key pair');
  assert.ok(!h.calls.some((c) => c.includes('create-security-group')), 'no second security group');
  assert.equal(h.files.length, 0, 'does not overwrite the local private key');
  assert.ok(h.calls.find((c) => c.includes('run-instances')).includes('--security-group-ids sg-existing'));
  assert.ok(h.calls.includes('rule sg-existing 1.2.3.4/32'), 'ssh rule refreshed for the current ip');
  assert.equal(h.saved.at(-1).securityGroupId, 'sg-existing');
});

test('refuses when the key pair exists in AWS but the private key is gone locally', async () => {
  const h = harness({ answers: [true], existing: { keyPair: true, keyFile: false } });
  await assert.rejects(init(h.deps), /private key/i);
  assert.ok(!h.calls.some((c) => c.includes('run-instances')));
});

test('refuses to provision a second instance when one is already configured', async () => {
  const h = harness({ answers: [true] });
  h.deps.cfg = { ...DEFAULTS, instanceId: 'i-old' };
  await assert.rejects(init(h.deps), /i-old/);
  assert.equal(h.asked.length, 0, 'does not even ask');
  assert.ok(!h.calls.some((c) => c.includes('run-instances')));
});
