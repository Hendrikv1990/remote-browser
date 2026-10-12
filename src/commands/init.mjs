import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveConfig } from '../config.mjs';
import { buildUserData } from '../userdata.mjs';
import { sshBase } from '../tunnel.mjs';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const AMI_PARAM = '/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id';

const defaultWriteKey = (path, pem) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { mode: 0o600 });
  chmodSync(path, 0o600);
};

export async function init({
  cfg, aws, ssh, sleep, log, confirm, myIp,
  save = saveConfig,
  writeKey = defaultWriteKey,
  entrypoint = readFileSync(root('container/entrypoint.sh'), 'utf8'),
  idleStop = readFileSync(root('infra/idle-stop.sh'), 'utf8'),
}) {
  const ok = await confirm(
    `Create in ${cfg.region} (profile ${cfg.awsProfile}): 1 key pair, 1 security group (SSH from your IP only), ` +
    `1 ${cfg.instanceType} instance with a 20 GB gp3 disk. Billable (~$0.067/hr while running, ~$2/mo disk). Proceed?`,
  );
  if (!ok) return log('Aborted. Nothing was created.');

  const ami = JSON.parse(await aws.run(['ssm', 'get-parameter', '--name', AMI_PARAM])).Parameter.Value;

  log('Creating key pair...');
  const key = JSON.parse(await aws.run(['ec2', 'create-key-pair', '--key-name', cfg.keyName, '--key-type', 'ed25519']));
  writeKey(cfg.keyPath, key.KeyMaterial);

  log('Creating security group...');
  const sg = JSON.parse(await aws.run(['ec2', 'create-security-group', '--group-name', 'remote-browser', '--description', 'remote-browser SSH']));
  await aws.replaceSshRule(sg.GroupId, `${await myIp()}/32`);

  log('Launching instance...');
  const userData = buildUserData({ cfg, entrypoint, idleStop });
  const run = JSON.parse(await aws.run([
    'ec2', 'run-instances',
    '--image-id', ami,
    '--instance-type', cfg.instanceType,
    '--key-name', cfg.keyName,
    '--security-group-ids', sg.GroupId,
    '--instance-initiated-shutdown-behavior', 'stop',
    '--block-device-mappings', 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3}',
    '--tag-specifications', 'ResourceType=instance,Tags=[{Key=Name,Value=remote-browser}]',
    '--user-data', userData,
  ]));
  const instanceId = run.Instances[0].InstanceId;
  save({ ...cfg, instanceId, securityGroupId: sg.GroupId });

  await aws.waitRunning(instanceId);
  const { publicIp } = await aws.describeInstance(instanceId);
  log('Waiting for first-boot setup (docker install, image pull)...');
  for (let i = 0; i < 60; i++) {
    try { await ssh([...sshBase(cfg, publicIp), 'cloud-init', 'status', '--wait']); break; }
    catch { await sleep(5000); }
  }

  await aws.stopInstance(instanceId);
  log(`Provisioned ${instanceId}. Instance stopped to avoid idle cost. Run: remote-browser up`);
}
