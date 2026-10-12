import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CONFIG_DIR = process.env.REMOTE_BROWSER_HOME ?? join(homedir(), '.remote-browser');

export const DEFAULTS = {
  awsProfile: 'default',
  region: 'eu-west-1',
  instanceType: 't4g.large',
  ports: [3000, 3001, 4000, 4001, 4002, 5000],
  cdpPort: 9222,
  idleMinutes: 30,
  instanceId: null,
  securityGroupId: null,
  keyName: 'remote-browser',
  keyPath: join(CONFIG_DIR, 'key.pem'),
  sshUser: 'ubuntu',
  image: 'mcr.microsoft.com/playwright:v1.55.0-noble',
  mcpPackage: '@playwright/mcp@latest',
};

const isPort = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;

export function validateConfig(cfg) {
  if (!Array.isArray(cfg.ports) || !cfg.ports.every(isPort)) {
    throw new Error('config: ports must be an array of integers 1-65535');
  }
  if (new Set(cfg.ports).size !== cfg.ports.length) {
    throw new Error('config: duplicate ports');
  }
  if (!isPort(cfg.cdpPort)) throw new Error('config: cdpPort must be 1-65535');
  if (!Number.isFinite(cfg.idleMinutes) || cfg.idleMinutes <= 0) {
    throw new Error('config: idleMinutes must be > 0');
  }
  return cfg;
}

export function loadConfig(path = join(CONFIG_DIR, 'config.json')) {
  let fromFile = {};
  try {
    fromFile = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`config: cannot read ${path}: ${e.message}`);
  }
  return validateConfig({ ...DEFAULTS, ...fromFile });
}

export function saveConfig(cfg, path = join(CONFIG_DIR, 'config.json')) {
  validateConfig(cfg);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
}
