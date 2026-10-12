import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.mjs';
import { makeAws } from '../src/aws.mjs';

const cfg = { ...DEFAULTS, awsProfile: 'p', region: 'eu-west-1' };

test('every call carries profile + region', async () => {
  const calls = [];
  const aws = makeAws(cfg, async (cmd, args) => { calls.push([cmd, args]); return '{}'; });
  await aws.startInstance('i-1');
  const [cmd, args] = calls[0];
  assert.equal(cmd, 'aws');
  assert.deepEqual(args.slice(0, 5), ['--profile', 'p', '--region', 'eu-west-1', 'ec2']);
  assert.ok(args.includes('start-instances') && args.includes('i-1'));
});

test('describeInstance parses state and public ip', async () => {
  const out = JSON.stringify({ Reservations: [{ Instances: [{ State: { Name: 'running' }, PublicIpAddress: '9.9.9.9' }] }] });
  const aws = makeAws(cfg, async () => out);
  assert.deepEqual(await aws.describeInstance('i-1'), { state: 'running', publicIp: '9.9.9.9' });
});

test('replaceSshRule revokes every existing port-22 cidr then authorizes the new one', async () => {
  const calls = [];
  const sg = JSON.stringify({ SecurityGroups: [{ IpPermissions: [
    { FromPort: 22, ToPort: 22, IpProtocol: 'tcp', IpRanges: [{ CidrIp: '1.1.1.1/32' }, { CidrIp: '2.2.2.2/32' }] },
    { FromPort: 80, ToPort: 80, IpProtocol: 'tcp', IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
  ] }] });
  const aws = makeAws(cfg, async (cmd, args) => { calls.push(args.join(' ')); return args.includes('describe-security-groups') ? sg : '{}'; });
  await aws.replaceSshRule('sg-1', '3.3.3.3/32');
  const revokes = calls.filter((c) => c.includes('revoke-security-group-ingress'));
  assert.equal(revokes.length, 2);
  assert.ok(revokes.every((c) => c.includes('--port 22')));
  assert.ok(!calls.some((c) => c.includes('0.0.0.0/0')));
  const last = calls.at(-1);
  assert.ok(last.includes('authorize-security-group-ingress') && last.includes('--cidr 3.3.3.3/32'));
});
