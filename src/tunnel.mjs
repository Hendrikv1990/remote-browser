import { join } from 'node:path';
import { CONFIG_DIR } from './config.mjs';

export const socketPath = (dir = CONFIG_DIR) => join(dir, 'tunnel.sock');

export function sshBase(cfg, host) {
  return [
    '-i', cfg.keyPath,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${join(CONFIG_DIR, 'known_hosts')}`,
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ConnectTimeout=10',
    `${cfg.sshUser}@${host}`,
  ];
}

export function tunnelArgs(cfg, host, sock) {
  const forwards = [
    '-L', `${cfg.cdpPort}:127.0.0.1:${cfg.cdpPort}`,
    ...cfg.ports.flatMap((p) => ['-R', `${p}:127.0.0.1:${p}`]),
  ];
  return ['-M', '-S', sock, '-fN', ...forwards, ...sshBase(cfg, host)];
}

export function closeArgs(cfg, host, sock) {
  return ['-S', sock, '-O', 'exit', `${cfg.sshUser}@${host}`];
}
