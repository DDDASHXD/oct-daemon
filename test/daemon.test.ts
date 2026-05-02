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
      name: 'project'
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
});

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
