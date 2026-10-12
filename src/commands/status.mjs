export async function status({ cfg, aws, probe, readState, log }) {
  const instance = cfg.instanceId ? (await aws.describeInstance(cfg.instanceId)).state : 'not-provisioned';
  const tunnel = await probe(cfg.cdpPort);
  const mode = readState()?.mode ?? null;
  log(`instance: ${instance}\ntunnel:   ${tunnel ? 'up' : 'down'}\nlast mode: ${mode ?? 'unknown'}`);
  return { instance, tunnel, mode };
}
