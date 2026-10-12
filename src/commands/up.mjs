import { rmSync } from 'node:fs';
import { sshBase, tunnelArgs, closeArgs } from '../tunnel.mjs';

async function waitFor(fn, { tries, sleep, ms, what }) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await sleep(ms);
  }
  throw new Error(`${what}`);
}

export async function up({ cfg, aws, ssh, probe, myIp, sleep, log, sock, rm = (p) => rmSync(p, { force: true }) }) {
  if (!cfg.instanceId) throw new Error('No instance configured. Run: remote-browser init');

  // A stale control socket (laptop slept, previous run) would hold the -R ports.
  const staleHost = 'localhost';
  await ssh(closeArgs(cfg, staleHost, sock)).catch(() => {});
  // A master killed hard leaves the socket file behind; -M refuses to bind over it.
  rm(sock);

  log('Starting instance...');
  let { state } = await aws.describeInstance(cfg.instanceId);
  if (state === 'stopping') {
    await aws.waitStopped(cfg.instanceId);
    state = 'stopped';
  }
  if (state === 'stopped') await aws.startInstance(cfg.instanceId);
  await aws.waitRunning(cfg.instanceId);
  const { publicIp } = await aws.describeInstance(cfg.instanceId);
  if (!publicIp) throw new Error('Instance has no public IP');

  log(`Allowing SSH from ${await myIp()}...`);
  await aws.replaceSshRule(cfg.securityGroupId, `${await myIp()}/32`);

  log('Waiting for SSH...');
  await waitFor(
    () => ssh([...sshBase(cfg, publicIp), 'true']).then(() => true, () => false),
    { tries: 40, sleep, ms: 3000, what: 'SSH did not become reachable in time' },
  );

  log('Restarting browser container...');
  await ssh([...sshBase(cfg, publicIp), 'sudo', 'docker', 'restart', 'rb-chrome']);

  log('Opening tunnel...');
  await ssh(tunnelArgs(cfg, publicIp, sock));

  await waitFor(() => probe(cfg.cdpPort), { tries: 10, sleep, ms: 1000, what: `CDP not reachable on localhost:${cfg.cdpPort} after tunnel start` });
  log(`Ready. Ports forwarded: ${cfg.ports.join(', ')}. Reconnect /mcp in running sessions.`);
}
