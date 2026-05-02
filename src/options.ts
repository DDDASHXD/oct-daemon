import path from 'node:path';
import { Command } from 'commander';

export const DEFAULT_SERVER_URL = 'https://api.open-collab.tools/';
export const DEFAULT_EXCLUDES = ['**/.env', '.git/**', 'node_modules/**'];

export interface CliOptions {
  workspace: string;
  server: string;
  authToken?: string;
  authTokenFile: string;
  readonly: boolean;
  exclude: string[];
  name?: string;
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name('opencollabtools-daemon')
    .description('Run a persistent headless Open Collaboration Tools host')
    .requiredOption('--workspace <path>', 'workspace folder to share')
    .option('--server <url>', 'Open Collaboration Server URL', DEFAULT_SERVER_URL)
    .option('--auth-token <token>', 'existing Open Collaboration auth token')
    .option('--auth-token-file <path>', 'file used to read/write auth token')
    .option('--readonly', 'reject guest write operations', false)
    .option('--exclude <glob>', 'exclude glob; can be repeated', collect, [] as string[])
    .option('--name <name>', 'workspace display name')
    .option('--code <code>', 'unsupported; OCT servers generate room IDs')
    .allowUnknownOption(false);
  return program;
}

export function parseOptions(argv: string[]): CliOptions {
  const program = createProgram();
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
    workspace,
    server: normalizeServerUrl(String(opts.server)),
    authToken: opts.authToken ? String(opts.authToken) : undefined,
    authTokenFile,
    readonly: Boolean(opts.readonly),
    exclude: [...DEFAULT_EXCLUDES, ...(opts.exclude as string[])],
    name: opts.name ? String(opts.name) : undefined
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
