import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const defaultExec = async (cmd, args) => (await execFileP(cmd, args, { maxBuffer: 10 * 1024 * 1024 })).stdout;

export function makeAws(cfg, exec = defaultExec) {
  const run = (args) => exec('aws', ['--profile', cfg.awsProfile, '--region', cfg.region, ...args, '--output', 'json']);
  const ec2 = (args) => run(['ec2', ...args]);

  return {
    run,
    ec2,
    startInstance: (id) => ec2(['start-instances', '--instance-ids', id]),
    stopInstance: (id) => ec2(['stop-instances', '--instance-ids', id]),
    waitRunning: (id) => ec2(['wait', 'instance-running', '--instance-ids', id]),
    waitStopped: (id) => ec2(['wait', 'instance-stopped', '--instance-ids', id]),
    async describeInstance(id) {
      const out = JSON.parse(await ec2(['describe-instances', '--instance-ids', id]));
      const inst = out.Reservations[0].Instances[0];
      return { state: inst.State.Name, publicIp: inst.PublicIpAddress ?? null };
    },
    async replaceSshRule(sgId, cidr) {
      const out = JSON.parse(await ec2(['describe-security-groups', '--group-ids', sgId]));
      const perms = out.SecurityGroups[0].IpPermissions.filter((p) => p.FromPort === 22 && p.ToPort === 22);
      for (const p of perms) {
        for (const r of p.IpRanges ?? []) {
          await ec2(['revoke-security-group-ingress', '--group-id', sgId, '--protocol', 'tcp', '--port', '22', '--cidr', r.CidrIp]);
        }
      }
      await ec2(['authorize-security-group-ingress', '--group-id', sgId, '--protocol', 'tcp', '--port', '22', '--cidr', cidr]);
    },
  };
}
