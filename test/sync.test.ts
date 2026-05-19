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
  it('writes collaborative Yjs document updates to the local mirror', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-sync-'));
    const messages: string[] = [];
    const loggingLogger: Logger = {
      info(message) {
        messages.push(message);
      },
      warn() {},
      error() {}
    };
    const sync = new OpenCollabSync({
      command: 'sync',
      workspace: root,
      server: DEFAULT_SERVER_URL,
      room: 'room',
      authTokenFile: path.join(root, '.token'),
      exclude: DEFAULT_EXCLUDES
    }, loggingLogger);
    const internals = sync as unknown as SyncInternals;
    internals.workspace = new SyncWorkspace({
      root,
      remoteFolders: ['bachproj'],
      excludes: DEFAULT_EXCLUDES
    });
    internals.setupYjsSync(new FakeHandlerConnection() as unknown as ProtocolBroadcastConnection);

    internals.ydoc.transact(() => {
      internals.ydoc.getText('bachproj/README.md').insert(0, '# Live\n');
    }, 'peer-1');

    await new Promise(resolve => setTimeout(resolve, 150));

    await expect(fs.readFile(path.join(root, 'README.md'), 'utf8')).resolves.toBe('# Live\n');
    expect(messages.some(message => message === 'YJS_WROTE_FILE=bachproj/README.md')).toBe(true);
  });

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
  ydoc: import('yjs').Doc;
  setupYjsSync(connection: ProtocolBroadcastConnection): void;
  registerConnectionHandlers(connection: ProtocolBroadcastConnection): void;
  syncRemotePath(
    connection: ProtocolBroadcastConnection,
    host: Peer,
    protocolPath: string,
    reconcileDirectory: boolean
  ): Promise<void>;
}

class FakeHandlerConnection {
  onDisconnect() {
    return { dispose() {} };
  }

  onReconnect() {
    return { dispose() {} };
  }

  dispose() {}

  peer = {
    onInfo: () => {},
    onInit: () => {}
  };

  room = {
    onLeave: () => {},
    onClose: () => {}
  };

  fs = {
    onChange: () => {}
  };

  sync = {
    onDataUpdate: () => {},
    onAwarenessUpdate: () => {},
    onAwarenessQuery: () => {},
    dataUpdate: async () => {},
    awarenessUpdate: async () => {},
    awarenessQuery: async () => {}
  };
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
