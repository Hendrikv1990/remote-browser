import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { probeCdp } from '../../src/mode.mjs';

const IMAGE = 'mcr.microsoft.com/playwright:v1.55.0-noble';
const NAME = 'rb-e2e';
const PORT = 9223;
const entry = fileURLToPath(new URL('../../container/entrypoint.sh', import.meta.url));
const mcpCli = fileURLToPath(new URL('../../node_modules/@playwright/mcp/cli.js', import.meta.url));
const sh = (...a) => execFileSync('docker', a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();

sh('rm', '-f', NAME);
sh('run', '-d', '--name', NAME, '--init', '--ipc=host', '-p', `127.0.0.1:${PORT}:${PORT}`,
  '-e', `RB_FORWARD_PORT=${PORT}`, '-v', `${entry}:/entrypoint.sh:ro`, IMAGE, '/entrypoint.sh');

let failed = false;
try {
  for (let i = 0; i < 20 && !(await probeCdp(PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await probeCdp(PORT))) throw new Error('CDP never came up');

  const mk = async (name) => {
    const t = new StdioClientTransport({ command: 'node', args: [mcpCli, '--cdp-endpoint', `http://127.0.0.1:${PORT}`, '--isolated'] });
    const c = new Client({ name, version: '1' });
    await c.connect(t);
    return c;
  };
  const call = async (c, name, args) => (await c.callTool({ name, arguments: args })).content.map((x) => x.text ?? '').join('\n');

  const A = await mk('A');
  const B = await mk('B');
  await call(A, 'browser_navigate', { url: 'https://example.com' });
  await call(A, 'browser_evaluate', { function: "() => { document.cookie='who=A'; localStorage.setItem('who','A'); return 'set'; }" });
  await call(B, 'browser_navigate', { url: 'https://example.com' });
  const seen = await call(B, 'browser_evaluate', { function: "() => JSON.stringify({cookie: document.cookie, ls: localStorage.getItem('who')})" });

  if (seen.includes('who=A') || seen.includes('\\"ls\\":\\"A\\"')) throw new Error(`NOT ISOLATED: B saw ${seen}`);
  console.log('PASS: client B cannot see client A storage');
  await A.close(); await B.close();
} catch (e) {
  failed = true;
  console.error('FAIL:', e.message);
} finally {
  sh('rm', '-f', NAME);
}
process.exit(failed ? 1 : 0);
