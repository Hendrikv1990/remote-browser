import { spawn } from 'node:child_process';
import { chooseMode, playwrightArgs } from './mode.mjs';
import { writeState } from './state.mjs';

export async function runLauncher({ cfg, argv = [], spawnFn = spawn, choose = chooseMode, write = writeState, ensure = null }) {
  let mode = await choose(cfg.cdpPort);
  if (mode === 'local' && ensure && (await ensure())) mode = 'remote';
  write({ mode, cdpPort: cfg.cdpPort, pid: process.pid, at: new Date().toISOString() });
  console.error(`[remote-browser] Playwright MCP mode: ${mode.toUpperCase()}`);
  const args = ['-y', cfg.mcpPackage, ...playwrightArgs(mode, cfg.cdpPort), ...argv];
  return spawnFn('npx', args, { stdio: 'inherit' });
}
