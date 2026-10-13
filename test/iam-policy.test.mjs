import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const load = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../infra/${f}`, import.meta.url)), 'utf8'));
const policy = load('iam-policy.json');
const stmts = policy.Statement;
const actions = (s) => [].concat(s.Action);
const grants = (a) => stmts.filter((s) => s.Effect === 'Allow' && actions(s).includes(a));

test('RunInstances on an instance can only launch t4g.large', () => {
  const onInstance = grants('ec2:RunInstances').filter((s) => [].concat(s.Resource).some((r) => r.includes(':instance/')));
  assert.equal(onInstance.length, 1);
  assert.equal(onInstance[0].Condition.StringEquals['ec2:InstanceType'], 't4g.large');
});

test('every EC2 allow statement is pinned to one region', () => {
  const ec2 = stmts.filter((s) => actions(s).some((a) => a.startsWith('ec2:')));
  assert.ok(ec2.length > 0);
  for (const s of ec2) assert.equal(s.Condition?.StringEquals?.['aws:RequestedRegion'], 'eu-west-1', s.Sid);
});

test('Start/Stop only work on instances tagged Name=remote-browser', () => {
  for (const a of ['ec2:StartInstances', 'ec2:StopInstances']) {
    const g = grants(a);
    assert.equal(g.length, 1, a);
    assert.equal(g[0].Condition.StringEquals['aws:ResourceTag/Name'], 'remote-browser');
    assert.notEqual(g[0].Resource, '*');
  }
});

test('CreateTags is only allowed as part of launching an instance', () => {
  const g = grants('ec2:CreateTags');
  assert.equal(g.length, 1);
  assert.equal(g[0].Condition.StringEquals['ec2:CreateAction'], 'RunInstances');
});

test('no teardown or wildcard actions', () => {
  const all = stmts.flatMap(actions);
  assert.ok(!all.some((a) => a.includes('*') || /Terminate|Delete/.test(a)));
});

test('budget deny policy blocks launching and starting but never stopping', () => {
  const deny = load('budget-deny-policy.json').Statement;
  const denied = deny.filter((s) => s.Effect === 'Deny').flatMap(actions);
  assert.ok(denied.includes('ec2:RunInstances') && denied.includes('ec2:StartInstances'));
  assert.ok(!denied.some((a) => a === 'ec2:StopInstances' || a === 'ec2:*'));
  assert.ok(!deny.some((s) => s.Effect === 'Allow'));
});
