#!/usr/bin/env node
import * as crypto from 'node:crypto';
import { initializeProtocol } from 'open-collaboration-protocol';
import { OpenCollabDaemon } from './daemon.js';
import { consoleLogger } from './logger.js';
import { parseOptions } from './options.js';

initializeProtocol({
  cryptoModule: crypto.webcrypto
});

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
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
  consoleLogger.error('Failed to start opencollabtools-daemon', error);
  process.exit(1);
});
