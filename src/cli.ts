#!/usr/bin/env node
import * as crypto from 'node:crypto';
import { initializeProtocol } from 'open-collaboration-protocol';
import { OpenCollabDaemon } from './daemon.js';
import { startDetachedDaemon } from './detached.js';
import { consoleLogger } from './logger.js';
import { parseOptions } from './options.js';
import { OpenCollabSync } from './sync.js';

initializeProtocol({
  cryptoModule: crypto.webcrypto
});

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const options = parseOptions(argv);
  if (options.command === 'sync') {
    const sync = new OpenCollabSync(options, consoleLogger);
    await sync.start();

    const shutdown = async (signal: string) => {
      consoleLogger.info(`Received ${signal}; stopping OCT sync.`);
      await sync.stop();
      process.exit(0);
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    return;
  }

  if (options.detached && process.env.OCT_DAEMON_DETACHED !== '1') {
    const detached = await startDetachedDaemon(options, argv);
    consoleLogger.info(`DETACHED_PID=${detached.pid}`);
    consoleLogger.info(`LOG_FILE=${detached.logFile}`);
    return;
  }

  const daemon = new OpenCollabDaemon(options, consoleLogger);
  await daemon.start();

  const shutdown = async (signal: string) => {
    consoleLogger.info(`Received ${signal}; stopping OCT daemon.`);
    await daemon.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(error => {
  consoleLogger.error('Failed to start oct-daemon', error);
  process.exit(1);
});
