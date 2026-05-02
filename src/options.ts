import path from 'node:path';
import { Command } from 'commander';

export const DEFAULT_SERVER_URL = 'https://api.open-collab.tools/';
export const DEFAULT_EXCLUDES = [
  '**/.env',
  '.git/**',
  'node_modules/**',
  '.opencollabtools-daemon/**',
  '.opencollabtools-sync/**'
];

export interface CliOptions {
  command: 'host';
  workspace: string;
  server: string;
  authToken?: string;
  authTokenFile: string;
  readonly: boolean;
  exclude: string[];
  name?: string;
  detached: boolean;
}

export interface SyncOptions {
  command: 'sync';
  workspace: string;
  server: string;
  room: string;
  authToken?: string;
  authTokenFile: string;
  exclude: string[];
}

export type ParsedOptions = CliOptions | SyncOptions;

export function createHostProgram(): Command {
  const program = new Command();
  program
    .name('oct-daemon')
    .description('Run a persistent headless Open Collaboration Tools host')
    .requiredOption('--workspace <path>', 'workspace folder to share')
    .option('--server <url>', 'Open Collaboration Server URL', DEFAULT_SERVER_URL)
    .option('--auth-token <token>', 'existing Open Collaboration auth token')
    .option('--auth-token-file <path>', 'file used to read/write auth token')
    .option('--readonly', 'reject guest write operations', false)
    .option('--exclude <glob>', 'exclude glob; can be repeated', collect, [] as string[])
    .option('--name <name>', 'workspace display name')
    .option('-d, --detached', 'run the daemon in the background', false)
    .option('--detatched', 'alias for --detached', false)
    .option('--code <code>', 'unsupported; OCT servers generate room IDs')
    .allowUnknownOption(false)
    .addHelpText('after', '\nCommands:\n  sync                    Synchronize an OCT room into a local folder');
  return program;
}

export function createSyncProgram(): Command {
  const program = new Command();
  program
    .name('oct-daemon sync')
    .description('Synchronize an OCT room into a local folder')
    .requiredOption('--room <code>', 'Open Collaboration Tools room code to join')
    .requiredOption('--workspace <path>', 'local folder to synchronize')
    .option('--server <url>', 'Open Collaboration Server URL', DEFAULT_SERVER_URL)
    .option('--auth-token <token>', 'existing Open Collaboration auth token')
    .option('--auth-token-file <path>', 'file used to read/write auth token')
    .option('--exclude <glob>', 'exclude glob; can be repeated', collect, [] as string[])
    .allowUnknownOption(false);
  return program;
}

export function parseOptions(argv: string[]): ParsedOptions {
  if (argv[0] === 'sync') {
    return parseSyncOptions(argv.slice(1));
  }
  return parseHostOptions(argv);
}

export function parseHostOptions(argv: string[]): CliOptions {
  const program = createHostProgram();
  program.parse(argv, { from: 'user' });
  const opts = program.opts();
  if (opts.code) {
    throw new Error('--code is not supported because OCT servers generate room IDs');
  }
  const workspace = path.resolve(String(opts.workspace));
  const authTokenFile = opts.authTokenFile
    ? path.resolve(String(opts.authTokenFile))
    : path.join(workspace, '.opencollabtools-daemon', 'auth-token');

  return {
    command: 'host',
    workspace,
    server: normalizeServerUrl(String(opts.server)),
    authToken: opts.authToken ? String(opts.authToken) : undefined,
    authTokenFile,
    readonly: Boolean(opts.readonly),
    exclude: [...DEFAULT_EXCLUDES, ...(opts.exclude as string[])],
    name: opts.name ? String(opts.name) : undefined,
    detached: Boolean(opts.detached || opts.detatched)
  };
}

export function parseSyncOptions(argv: string[]): SyncOptions {
  const program = createSyncProgram();
  program.parse(argv, { from: 'user' });
  const opts = program.opts();
  const workspace = path.resolve(String(opts.workspace));
  const authTokenFile = opts.authTokenFile
    ? path.resolve(String(opts.authTokenFile))
    : path.join(workspace, '.opencollabtools-sync', 'auth-token');

  return {
    command: 'sync',
    workspace,
    server: normalizeServerUrl(String(opts.server)),
    room: String(opts.room),
    authToken: opts.authToken ? String(opts.authToken) : undefined,
    authTokenFile,
    exclude: [...DEFAULT_EXCLUDES, ...(opts.exclude as string[])]
  };
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  return url.toString();
}
