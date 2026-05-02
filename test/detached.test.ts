import { describe, expect, it } from 'vitest';
import { withoutDetachedFlags } from '../src/detached.js';

describe('withoutDetachedFlags', () => {
  it('removes detached mode flags before spawning the child process', () => {
    expect(withoutDetachedFlags([
      '--workspace',
      '.',
      '-d',
      '--detached',
      '--detatched',
      '--name',
      'project'
    ])).toEqual(['--workspace', '.', '--name', 'project']);
  });
});
