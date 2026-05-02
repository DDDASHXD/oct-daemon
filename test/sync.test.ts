import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileType, type Peer, type ProtocolBroadcastConnection } from 'open-collaboration-protocol';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../src/logger.js';
import { DEFAULT_EXCLUDES, DEFAULT_SERVER_URL } from '../src/options.js';
import { OpenCollabSync } from '../src/sync.js';
import { SyncWorkspace } from '../src/sync-workspace.js';

const logger: Logger = {
  info() {},
  warn() {},
  error() {}
};

describe('OpenCollabSync', () => {
  it('skips excluded remote directories during recursive downloads', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-sync-'));
    const sync = new OpenCollabSync({
      command: 'sync',
      workspace: root,
      server: DEFAULT_SERVER_URL,
      room: 'room',
      authTokenFile: path.join(root, '.token'),
      exclude: DEFAULT_EXCLUDES
    }, logger);
    const internals = sync as unknown as SyncInternals;
    internals.workspace = new SyncWorkspace({
      root,
      remoteFolders: ['bachproj'],
      excludes: DEFAULT_EXCLUDES
    });

    await internals.syncRemotePath(
      new FakeRemoteConnection() as unknown as ProtocolBroadcastConnection,
      peer('host'),
      'bachproj',
      true
    );

    await expect(fs.readFile(path.join(root, 'README.md'), 'utf8')).resolves.toBe('# Project\n');
    await expect(fs.access(path.join(root, '.opencollabtools-daemon'))).rejects.toThrow();
  });
});

interface SyncInternals {
  workspace: SyncWorkspace;
  syncRemotePath(
    connection: ProtocolBroadcastConnection,
    host: Peer,
    protocolPath: string,
    reconcileDirectory: boolean
  ): Promise<void>;
}

class FakeRemoteConnection {
  fs = {
    stat: async (_target: string, protocolPath: string) => ({
      type: protocolPath.endsWith('README.md') || protocolPath.endsWith('auth-token') ? FileType.File : FileType.Directory,
      mtime: 0,
      ctime: 0,
      size: 0
    }),
    readdir: async (_target: string, protocolPath: string) => {
      if (protocolPath === 'bachproj') {
        return {
          'README.md': FileType.File,
          '.opencollabtools-daemon': FileType.Directory
        };
      }
      if (protocolPath === 'bachproj/.opencollabtools-daemon') {
        throw new Error('Excluded directory should not be read');
      }
      return {};
    },
    readFile: async (_target: string, protocolPath: string) => {
      if (protocolPath === 'bachproj/.opencollabtools-daemon/auth-token') {
        throw new Error('Excluded file should not be read');
      }
      return { content: new TextEncoder().encode('# Project\n') };
    }
  };
}

function peer(id: string): Peer {
  return {
    id,
    host: true,
    name: id,
    metadata: {
      encryption: { publicKey: 'public-key' },
      compression: { supported: [] }
    }
  };
}
