import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileType } from 'open-collaboration-protocol';
import { WorkspaceHost } from '../src/workspace.js';

async function makeHost() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-workspace-'));
  const host = new WorkspaceHost({
    root,
    name: 'project',
    excludes: ['**/.env', '.git/**', 'node_modules/**'],
    readonly: false
  });
  return { root, host };
}

describe('WorkspaceHost', () => {
  it('maps protocol paths into the workspace', async () => {
    const { root, host } = await makeHost();
    await fs.writeFile(path.join(root, 'README.md'), 'hello');
    expect(host.resolveProtocolPath('project/README.md').absolute).toBe(path.join(root, 'README.md'));
    expect(host.protocolPathForFile(path.join(root, 'README.md'))).toBe('project/README.md');
  });

  it('rejects traversal outside the workspace', async () => {
    const { host } = await makeHost();
    expect(() => host.resolveProtocolPath('project/../secret')).toThrow(/escapes workspace/);
    expect(() => host.resolveProtocolPath('other/file')).toThrow(/must start/);
  });

  it('filters excluded files from readdir', async () => {
    const { root, host } = await makeHost();
    await fs.mkdir(path.join(root, '.git'));
    await fs.writeFile(path.join(root, '.env'), 'secret');
    await fs.writeFile(path.join(root, 'index.ts'), 'export {};');
    const entries = await host.readdir('project');
    expect(entries).toEqual({ 'index.ts': FileType.File });
  });

  it('supports read and write operations', async () => {
    const { root, host } = await makeHost();
    await host.writeFile('project/src/index.ts', new TextEncoder().encode('one'));
    await expect(fs.readFile(path.join(root, 'src', 'index.ts'), 'utf8')).resolves.toBe('one');
    const bytes = await host.readFile('project/src/index.ts');
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode('one')));
    await host.rename('project/src/index.ts', 'project/src/main.ts');
    await expect(host.stat('project/src/main.ts')).resolves.toMatchObject({ type: FileType.File });
    await host.delete('project/src/main.ts');
    await expect(fs.access(path.join(root, 'src', 'main.ts'))).rejects.toThrow();
  });

  it('rejects writes in readonly mode', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-workspace-'));
    const host = new WorkspaceHost({ root, name: 'project', excludes: [], readonly: true });
    await expect(host.writeFile('project/a.txt', new Uint8Array())).rejects.toThrow(/readonly/);
  });
});
