import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
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
  hasKeyFile = existsSync,
  entrypoint = readFileSync(root('container/entrypoint.sh'), 'utf8'),
  idleStop = readFileSync(root('infra/idle-stop.sh'), 'utf8'),
}) {
  if (cfg.instanceId) {
    throw new Error(`Already provisioned (${cfg.instanceId}). Use \`remote-browser up\`; to start over, delete the instance in AWS and clear instanceId in the config.`);
  }
  const ok = await confirm(
    `Create in ${cfg.region} (profile ${cfg.awsProfile}): 1 key pair, 1 security group (SSH from your IP only), ` +
    `1 ${cfg.instanceType} instance with a 20 GB gp3 disk. Billable (~$0.067/hr while running, ~$2/mo disk). Proceed?`,
  );
  if (!ok) return log('Aborted. Nothing was created.');

  const ami = JSON.parse(await aws.run(['ssm', 'get-parameter', '--name', AMI_PARAM])).Parameter.Value;

  // Look before create: a failed earlier run (e.g. RunInstances denied) leaves these behind, and config is only saved after launch.
  const keys = JSON.parse(await aws.run(['ec2', 'describe-key-pairs', '--filters', `Name=key-name,Values=${cfg.keyName}`])).KeyPairs ?? [];
  if (keys.length === 0) {
    log('Creating key pair...');
    const key = JSON.parse(await aws.run(['ec2', 'create-key-pair', '--key-name', cfg.keyName, '--key-type', 'ed25519']));
    writeKey(cfg.keyPath, key.KeyMaterial);
  } else if (!hasKeyFile(cfg.keyPath)) {
    throw new Error(`Key pair "${cfg.keyName}" exists in AWS but its private key is not at ${cfg.keyPath} (AWS cannot show it again). Delete the key pair in the EC2 console and run init again.`);
  } else {
    log(`Reusing existing key pair "${cfg.keyName}".`);
  }

  const groups = JSON.parse(await aws.run(['ec2', 'describe-security-groups', '--filters', 'Name=group-name,Values=remote-browser'])).SecurityGroups ?? [];
  let sgId = groups[0]?.GroupId;
  if (sgId) {
    log(`Reusing existing security group ${sgId}.`);
  } else {
    log('Creating security group...');
    sgId = JSON.parse(await aws.run(['ec2', 'create-security-group', '--group-name', 'remote-browser', '--description', 'remote-browser SSH'])).GroupId;
  }
  await aws.replaceSshRule(sgId, `${await myIp()}/32`);

  log('Launching instance...');
  const userData = buildUserData({ cfg, entrypoint, idleStop });
  const run = JSON.parse(await aws.run([
    'ec2', 'run-instances',
    '--image-id', ami,
    '--instance-type', cfg.instanceType,
    '--key-name', cfg.keyName,
    '--security-group-ids', sgId,
    '--instance-initiated-shutdown-behavior', 'stop',
    '--block-device-mappings', 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3}',
    '--tag-specifications', 'ResourceType=instance,Tags=[{Key=Name,Value=remote-browser}]',
    '--user-data', userData,
  ]));
  const instanceId = run.Instances[0].InstanceId;
  save({ ...cfg, instanceId, securityGroupId: sgId });

  await aws.waitRunning(instanceId);
  const { publicIp } = await aws.describeInstance(instanceId);
  log('Waiting for first-boot setup (docker install, image pull)...');
  let booted = false;
  for (let i = 0; i < 60 && !booted; i++) {
    try { await ssh([...sshBase(cfg, publicIp), 'cloud-init', 'status', '--wait']); booted = true; }
    catch { await sleep(5000); }
  }
  if (!booted) {
    throw new Error(
      `First-boot setup on ${instanceId} did not finish cleanly. The instance is still running (billing). ` +
      `Inspect /var/log/cloud-init-output.log over ssh, then stop it with: remote-browser down`,
    );
  }

  await aws.stopInstance(instanceId);
  await aws.waitStopped(instanceId);
  log(`Provisioned ${instanceId}. Instance stopped to avoid idle cost. Run: remote-browser up`);
}
