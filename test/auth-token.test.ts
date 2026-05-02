import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuthToken, writeAuthToken } from '../src/auth-token.js';

describe('auth token helpers', () => {
  it('returns undefined for a missing token file', async () => {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'oct-auth-')), 'missing-token');
    await expect(readAuthToken(file)).resolves.toBeUndefined();
  });

  it('writes and reads a trimmed token', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-auth-'));
    const file = path.join(dir, 'nested', 'token');
    await writeAuthToken(file, 'abc123');
    await expect(readAuthToken(file)).resolves.toBe('abc123');
  });
});
