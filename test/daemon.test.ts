import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Peer, ProtocolBroadcastConnection, User } from 'open-collaboration-protocol';
import { OpenCollabDaemon } from '../src/daemon.js';
import type { Logger } from '../src/logger.js';
import { DEFAULT_EXCLUDES, DEFAULT_SERVER_URL } from '../src/options.js';

const logger: Logger = {
  info() {},
  warn() {},
  error() {}
};

describe('OpenCollabDaemon protocol handlers', () => {
  it('auto-accepts joins and initializes new peers with existing guests only', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-daemon-'));
    const connection = new FakeConnection();
    const daemon = new OpenCollabDaemon({
      workspace,
      server: DEFAULT_SERVER_URL,
      authTokenFile: path.join(workspace, '.token'),
      readonly: false,
      exclude: DEFAULT_EXCLUDES,
      name: 'project',
      detached: false
    }, logger);

    (daemon as unknown as {
      registerConnectionHandlers(connection: ProtocolBroadcastConnection): void;
    }).registerConnectionHandlers(connection as unknown as ProtocolBroadcastConnection);

    const host = peer('host', true);
    connection.peerInfoHandler('', host);

    const joinResponse = await connection.joinRequestHandler('', {
      name: 'Guest',
      email: 'guest@example.com'
    });
    expect(joinResponse).toEqual({ workspace: { name: 'project', folders: ['project'] } });

    const existingGuest = peer('guest-1', false);
    await connection.roomJoinHandler('', existingGuest);

    const newGuest = peer('guest-2', false);
    await connection.roomJoinHandler('', newGuest);

    expect(connection.inits).toHaveLength(2);
    expect(connection.inits[0].target).toBe('guest-1');
    expect(connection.inits[0].data.guests).toEqual([]);
    expect(connection.inits[1].target).toBe('guest-2');
    expect(connection.inits[1].data.guests.map(guest => guest.id)).toEqual(['guest-1']);
  });

  it('does not overwrite already populated shared text when opening a document', async () => {
    const { daemon, workspace } = await makeDaemon();
    await fs.writeFile(path.join(workspace, 'README.md'), '# stale\n');

    const internals = daemon as unknown as DaemonInternals;
    const yjsText = internals.ydoc.getText('project/README.md');
    yjsText.insert(0, '# live edit\n');

    await internals.openTextDocument('project/README.md');

    expect(yjsText.toString()).toBe('# live edit\n');
  });

  it('ignores watcher syncs for recent daemon persistence writes', async () => {
    const { daemon, workspace } = await makeDaemon();
    await fs.writeFile(path.join(workspace, 'README.md'), '# \n');

    const internals = daemon as unknown as DaemonInternals;
    await internals.openTextDocument('project/README.md');
    const yjsText = internals.ydoc.getText('project/README.md');

    internals.scheduleWrite('project/README.md', '# This\n');
    yjsText.delete(0, yjsText.length);
    yjsText.insert(0, '# This is newer\n');

    await new Promise(resolve => setTimeout(resolve, 150));
    await expect(fs.readFile(path.join(workspace, 'README.md'), 'utf8')).resolves.toBe('# This\n');

    await internals.syncOpenDocumentFromDisk('project/README.md');

    expect(yjsText.toString()).toBe('# This is newer\n');
  });
});

interface DaemonInternals {
  ydoc: {
    getText(name: string): {
      length: number;
      delete(index: number, length: number): void;
      insert(index: number, text: string): void;
      toString(): string;
    };
  };
  openTextDocument(protocolPath: string): Promise<void>;
  scheduleWrite(protocolPath: string, text: string): void;
  syncOpenDocumentFromDisk(protocolPath: string): Promise<void>;
}

async function makeDaemon(): Promise<{ daemon: OpenCollabDaemon; workspace: string }> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'oct-daemon-'));
  return {
    workspace,
    daemon: new OpenCollabDaemon({
      workspace,
      server: DEFAULT_SERVER_URL,
      authTokenFile: path.join(workspace, '.token'),
      readonly: false,
      exclude: DEFAULT_EXCLUDES,
      name: 'project',
      detached: false
    }, logger)
  };
}

function peer(id: string, host: boolean): Peer {
  return {
    id,
    host,
    name: id,
    metadata: {
      encryption: { publicKey: 'public-key' },
      compression: { supported: [] }
    }
  };
}

class FakeConnection {
  inits: Array<{ target: string; data: { guests: Peer[] } }> = [];

  peerInfoHandler: (origin: string, peer: Peer) => void = () => {};
  joinRequestHandler: (origin: string, user: User) => Promise<unknown> = async () => undefined;
  roomJoinHandler: (origin: string, peer: Peer) => Promise<void> = async () => {};

  onDisconnect() {
    return { dispose() {} };
  }

  onReconnect() {
    return { dispose() {} };
  }

  dispose() {}

  peer = {
    onInfo: (handler: (origin: string, peer: Peer) => void) => {
      this.peerInfoHandler = handler;
    },
    onJoinRequest: (handler: (origin: string, user: User) => Promise<unknown>) => {
      this.joinRequestHandler = handler;
    },
    init: async (target: string, data: { guests: Peer[] }) => {
      this.inits.push({ target, data });
    }
  };

  room = {
    onJoin: (handler: (origin: string, peer: Peer) => Promise<void>) => {
      this.roomJoinHandler = handler;
    },
    onLeave: () => {},
    onClose: () => {},
    leave: async () => {}
  };

  fs = {
    onStat: () => {},
    onReaddir: () => {},
    onReadFile: () => {},
    onWriteFile: () => {},
    onMkdir: () => {},
    onDelete: () => {},
    onRename: () => {},
    change: async () => {}
  };

  editor = {
    onOpen: () => {}
  };
}
