import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CliOptions } from './options.js';

export interface DetachedDaemon {
  pid: number;
  logFile: string;
}

export async function startDetachedDaemon(options: CliOptions, argv: string[]): Promise<DetachedDaemon> {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    throw new Error('Cannot start detached daemon without a CLI entrypoint');
  }

  const logFile = path.join(path.dirname(options.authTokenFile), 'oct-daemon.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const logHandle = await fs.open(logFile, 'a');

  try {
    const child = spawn(process.execPath, [entrypoint, ...withoutDetachedFlags(argv)], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        OCT_DAEMON_DETACHED: '1'
      },
      stdio: ['ignore', logHandle.fd, logHandle.fd]
    });

    child.unref();

    if (!child.pid) {
      throw new Error('Failed to start detached daemon process');
    }

    return {
      pid: child.pid,
      logFile
    };
  } finally {
    await logHandle.close();
  }
}

export function withoutDetachedFlags(argv: string[]): string[] {
  return argv.filter(arg => arg !== '-d' && arg !== '--detached' && arg !== '--detatched');
}
