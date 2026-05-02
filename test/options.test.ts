import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DEFAULT_EXCLUDES, parseOptions } from '../src/options.js';

describe('parseOptions', () => {
  it('normalizes workspace and defaults', () => {
    const opts = parseOptions(['--workspace', '.']);
    expect(opts.command).toBe('host');
    expect(opts.workspace).toBe(path.resolve('.'));
    expect(opts.server).toBe('https://api.open-collab.tools/');
    expect(opts.command === 'host' && opts.readonly).toBe(false);
    expect(opts.exclude).toEqual(DEFAULT_EXCLUDES);
    expect(opts.authTokenFile).toBe(path.join(path.resolve('.'), '.opencollabtools-daemon', 'auth-token'));
  });

  it('collects repeated excludes', () => {
    const opts = parseOptions(['--workspace', '.', '--exclude', 'dist/**', '--exclude', '*.log']);
    expect(opts.exclude).toEqual([...DEFAULT_EXCLUDES, 'dist/**', '*.log']);
  });

  it('parses detached mode flags', () => {
    const short = parseOptions(['--workspace', '.', '-d']);
    const long = parseOptions(['--workspace', '.', '--detached']);
    const typo = parseOptions(['--workspace', '.', '--detatched']);
    expect(short.command === 'host' && short.detached).toBe(true);
    expect(long.command === 'host' && long.detached).toBe(true);
    expect(typo.command === 'host' && typo.detached).toBe(true);
  });

  it('rejects caller supplied room codes', () => {
    expect(() => parseOptions(['--workspace', '.', '--code', 'abc'])).toThrow(/not supported/);
  });

  it('parses sync mode', () => {
    const opts = parseOptions(['sync', '--room', 'abc-def', '--workspace', '.']);
    expect(opts.command).toBe('sync');
    expect(opts.workspace).toBe(path.resolve('.'));
    expect(opts.authTokenFile).toBe(path.join(path.resolve('.'), '.opencollabtools-sync', 'auth-token'));
    expect(opts.command === 'sync' && opts.room).toBe('abc-def');
  });
});
