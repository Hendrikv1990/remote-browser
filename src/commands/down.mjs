import { closeArgs } from '../tunnel.mjs';

export async function down({ cfg, aws, ssh, log, sock }) {
  await ssh(closeArgs(cfg, 'localhost', sock)).catch(() => {});
  if (!cfg.instanceId) return log('No instance configured.');
  const { state } = await aws.describeInstance(cfg.instanceId);
  if (state === 'stopped' || state === 'stopping') return log(`Instance already ${state}.`);
  await aws.stopInstance(cfg.instanceId);
  log('Instance stopping. Sessions will fall back to local on next MCP start.');
}
