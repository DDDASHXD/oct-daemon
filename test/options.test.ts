import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DEFAULT_EXCLUDES, parseOptions } from '../src/options.js';

describe('parseOptions', () => {
  it('normalizes workspace and defaults', () => {
    const opts = parseOptions(['--workspace', '.']);
    expect(opts.workspace).toBe(path.resolve('.'));
    expect(opts.server).toBe('https://api.open-collab.tools/');
    expect(opts.readonly).toBe(false);
    expect(opts.exclude).toEqual(DEFAULT_EXCLUDES);
    expect(opts.authTokenFile).toBe(path.join(path.resolve('.'), '.opencollabtools-daemon', 'auth-token'));
  });

  it('collects repeated excludes', () => {
    const opts = parseOptions(['--workspace', '.', '--exclude', 'dist/**', '--exclude', '*.log']);
    expect(opts.exclude).toEqual([...DEFAULT_EXCLUDES, 'dist/**', '*.log']);
  });

  it('parses detached mode flags', () => {
    expect(parseOptions(['--workspace', '.', '-d']).detached).toBe(true);
    expect(parseOptions(['--workspace', '.', '--detached']).detached).toBe(true);
    expect(parseOptions(['--workspace', '.', '--detatched']).detached).toBe(true);
  });

  it('rejects caller supplied room codes', () => {
    expect(() => parseOptions(['--workspace', '.', '--code', 'abc'])).toThrow(/not supported/);
  });
});
