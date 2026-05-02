import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUDES } from '../src/options.js';
import { SyncWorkspace } from '../src/sync-workspace.js';

describe('SyncWorkspace', () => {
  it('flattens a single remote folder into the local workspace', () => {
    const root = path.resolve('/tmp/oct-sync');
    const workspace = new SyncWorkspace({
      root,
      remoteFolders: ['project'],
      excludes: DEFAULT_EXCLUDES
    });

    expect(workspace.localPathForProtocol('project/src/index.ts')).toBe(path.join(root, 'src', 'index.ts'));
    expect(workspace.protocolPathForFile(path.join(root, 'src', 'index.ts'))).toBe('project/src/index.ts');
  });

  it('mounts multiple remote folders below named local folders', () => {
    const root = path.resolve('/tmp/oct-sync');
    const workspace = new SyncWorkspace({
      root,
      remoteFolders: ['project-a', 'project-b'],
      excludes: DEFAULT_EXCLUDES
    });

    expect(workspace.localPathForProtocol('project-a/README.md')).toBe(path.join(root, 'project-a', 'README.md'));
    expect(workspace.protocolPathForFile(path.join(root, 'project-b', 'src', 'main.ts'))).toBe('project-b/src/main.ts');
    expect(workspace.protocolPathForFile(path.join(root, 'project-b', 'node_modules', 'pkg', 'index.js'))).toBeUndefined();
    expect(workspace.localPathForProtocol('project-a/node_modules/pkg/index.js')).toBeUndefined();
  });

  it('rejects paths outside the remote and local workspaces', () => {
    const root = path.resolve('/tmp/oct-sync');
    const workspace = new SyncWorkspace({
      root,
      remoteFolders: ['project'],
      excludes: DEFAULT_EXCLUDES
    });

    expect(workspace.localPathForProtocol('other/file.ts')).toBeUndefined();
    expect(workspace.localPathForProtocol('project/../secret')).toBeUndefined();
    expect(workspace.protocolPathForFile(path.resolve('/tmp/outside.ts'))).toBeUndefined();
  });

  it('keeps sync metadata out of the mirrored folder', () => {
    const root = path.resolve('/tmp/oct-sync');
    const workspace = new SyncWorkspace({
      root,
      remoteFolders: ['project'],
      excludes: DEFAULT_EXCLUDES
    });

    expect(workspace.protocolPathForFile(path.join(root, '.opencollabtools-sync', 'auth-token'))).toBeUndefined();
    expect(workspace.localPathForProtocol('project/.opencollabtools-daemon/auth-token')).toBeUndefined();
  });
});
