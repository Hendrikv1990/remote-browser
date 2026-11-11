import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeAws } from './aws.mjs';
import { probeCdp } from './mode.mjs';
import { readState } from './state.mjs';
import { socketPath } from './tunnel.mjs';

const execFileP = promisify(execFile);

// Shared deps for the CLI and the MCP launcher. The launcher passes a stderr logger: its stdout is the MCP channel.
export function makeDeps(cfg, log = (m) => console.log(m)) {
  return {
    cfg,
    aws: makeAws(cfg),
    ssh: async (args) => (await execFileP('ssh', args)).stdout,
    probe: probeCdp,
    myIp: async () => (await (await fetch('https://checkip.amazonaws.com')).text()).trim(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log,
    sock: socketPath(),
    readState,
  };
}
