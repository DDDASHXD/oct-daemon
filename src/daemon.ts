import { TextDecoder, TextEncoder } from 'node:util';
import { watch, type FSWatcher } from 'chokidar';
import {
  ConnectionProvider,
  DisposableCollection,
  SocketIoTransportProvider,
  VERSION,
  type Peer,
  FileChangeEventType,
  type ProtocolBroadcastConnection,
  type User
} from 'open-collaboration-protocol';
import { OpenCollaborationYjsProvider, YjsNormalizedTextDocument, type YTextChange } from 'open-collaboration-yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { readAuthToken, writeAuthToken } from './auth-token.js';
import type { Logger } from './logger.js';
import type { CliOptions } from './options.js';
import { WorkspaceHost } from './workspace.js';

export interface RunningDaemon {
  roomId: string;
  joinUri: string;
  stop(): Promise<void>;
}

interface OpenDocument {
  normalized: YjsNormalizedTextDocument;
  flush?: NodeJS.Timeout;
}

export class OpenCollabDaemon {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder('utf8');
  private readonly disposables = new DisposableCollection();
  private readonly ydoc = new Y.Doc();
  private readonly awareness = new awarenessProtocol.Awareness(this.ydoc);
  private readonly peers = new Map<string, Peer>();
  private readonly openDocuments = new Map<string, OpenDocument>();
  private readonly workspace: WorkspaceHost;

  private connection?: ProtocolBroadcastConnection;
  private yjsProvider?: OpenCollaborationYjsProvider;
  private watcher?: FSWatcher;
  private ownPeer?: Peer;
  private stopped = false;

  constructor(
    private readonly options: CliOptions,
    private readonly logger: Logger
  ) {
    this.workspace = new WorkspaceHost({
      root: options.workspace,
      name: options.name,
      excludes: options.exclude,
      readonly: options.readonly
    });
  }

  async start(): Promise<RunningDaemon> {
    const storedToken = this.options.authToken ?? await readAuthToken(this.options.authTokenFile);
    const provider = new ConnectionProvider({
      url: this.options.server,
      userToken: storedToken,
      client: 'OCT_CODE_opencollabtools_daemon@0.1.0',
      fetch,
      transports: [SocketIoTransportProvider],
      authenticationHandler: async (token, metadata) => {
        this.logger.warn('OCT authentication is required.');
        this.logger.warn(`AUTH_TOKEN=${token}`);
        if (metadata.loginPageUrl) {
          this.logger.warn(`AUTH_URL=${metadata.loginPageUrl}`);
        }
        for (const provider of metadata.providers) {
          this.logger.warn(`AUTH_PROVIDER=${provider.type}:${provider.name}`);
        }
        return true;
      }
    });

    const roomClaim = await provider.createRoom({
      reporter: info => this.logger.info(`OCT ${info.code}: ${info.message}`)
    });
    const authToken = roomClaim.loginToken ?? provider.authToken;
    if (authToken) {
      await writeAuthToken(this.options.authTokenFile, authToken);
    }

    const connection = await provider.connect(roomClaim.roomToken);
    this.connection = connection;
    this.registerConnectionHandlers(connection);

    this.yjsProvider = new OpenCollaborationYjsProvider(connection, this.ydoc, this.awareness, {
      resyncTimer: 10_000
    });
    this.yjsProvider.connect();
    this.disposables.push(this.yjsProvider);
    this.disposables.push({
      dispose: () => {
        this.ydoc.destroy();
        this.awareness.destroy();
      }
    });

    this.startFileWatcher(connection);

    const joinUri = createJoinUri(this.options.server, roomClaim.roomId);
    this.logger.info(`ROOM_ID=${roomClaim.roomId}`);
    this.logger.info(`JOIN_URI=${joinUri}`);
    this.logger.info(`WORKSPACE=${this.options.workspace}`);

    return {
      roomId: roomClaim.roomId,
      joinUri,
      stop: () => this.stop()
    };
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    try {
      await this.connection?.room.leave();
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      this.logger.warn(`Failed to leave OCT room cleanly: ${stringifyError(error)}`);
    }
    await this.watcher?.close();
    for (const document of this.openDocuments.values()) {
      if (document.flush) {
        clearTimeout(document.flush);
      }
      document.normalized.dispose();
    }
    this.openDocuments.clear();
    this.disposables.dispose();
    this.connection?.dispose();
  }

  private registerConnectionHandlers(connection: ProtocolBroadcastConnection): void {
    this.disposables.push(connection);
    this.disposables.push(connection.onDisconnect(() => {
      this.logger.warn('Disconnected from OCT server.');
      void this.stop();
    }));
    this.disposables.push(connection.onReconnect(() => {
      this.logger.info('Reconnected to OCT server; resyncing Yjs state.');
      this.yjsProvider?.connect();
    }));

    connection.peer.onInfo((_, peer) => {
      this.ownPeer = peer;
      this.awareness.setLocalStateField('peer', peer.id);
      this.logger.info(`HOST_PEER=${peer.id}`);
    });

    connection.peer.onJoinRequest(async (_, user) => this.acceptJoin(user));

    connection.room.onJoin(async (_, peer) => {
      if (this.ownPeer) {
        await connection.peer.init(peer.id, {
          protocol: VERSION,
          host: this.ownPeer,
          guests: Array.from(this.peers.values()),
          capabilities: {},
          permissions: { readonly: this.options.readonly },
          workspace: this.workspaceInfo()
        });
      }
      this.peers.set(peer.id, peer);
      this.logger.info(`PEER_JOINED=${formatPeer(peer)}`);
    });

    connection.room.onLeave((_, peer) => {
      this.peers.delete(peer.id);
      this.logger.info(`PEER_LEFT=${formatPeer(peer)}`);
    });

    connection.room.onClose(() => {
      this.logger.warn('OCT room closed.');
      void this.stop();
    });

    this.registerFileHandlers(connection);
    this.registerEditorHandlers(connection);
  }

  private acceptJoin(user: User) {
    this.logger.info(`JOIN_REQUEST=${user.email ? `${user.name}<${user.email}>` : user.name}`);
    return {
      workspace: this.workspaceInfo()
    };
  }

  private workspaceInfo() {
    return {
      name: this.workspace.name,
      folders: [this.workspace.protocolRoot]
    };
  }

  private registerFileHandlers(connection: ProtocolBroadcastConnection): void {
    connection.fs.onStat(async (_, protocolPath) => this.workspace.stat(protocolPath));
    connection.fs.onReaddir(async (_, protocolPath) => this.workspace.readdir(protocolPath));
    connection.fs.onReadFile(async (_, protocolPath) => ({
      content: await this.workspace.readFile(protocolPath)
    }));
    connection.fs.onWriteFile(async (_, protocolPath, file) => {
      await this.workspace.writeFile(protocolPath, file.content);
      this.updateOpenDocument(protocolPath, this.decoder.decode(file.content));
    });
    connection.fs.onMkdir(async (_, protocolPath) => {
      await this.workspace.mkdir(protocolPath);
    });
    connection.fs.onDelete(async (_, protocolPath) => {
      await this.workspace.delete(protocolPath);
      this.disposeOpenDocument(protocolPath);
    });
    connection.fs.onRename(async (_, oldPath, newPath) => {
      await this.workspace.rename(oldPath, newPath);
      this.disposeOpenDocument(oldPath);
    });
  }

  private registerEditorHandlers(connection: ProtocolBroadcastConnection): void {
    connection.editor.onOpen(async (_, protocolPath) => {
      await this.openTextDocument(protocolPath);
    });
  }

  private async openTextDocument(protocolPath: string): Promise<void> {
    if (this.openDocuments.has(protocolPath)) {
      return;
    }
    const content = this.decoder.decode(await this.workspace.readFile(protocolPath));
    const normalized = new YjsNormalizedTextDocument(this.ydoc.getText(protocolPath), async changes => {
      await this.applyRemoteTextChanges(protocolPath, changes);
    });
    this.openDocuments.set(protocolPath, { normalized });
    normalized.update({ changes: content });
    this.logger.info(`DOCUMENT_OPENED=${protocolPath}`);
  }

  private async applyRemoteTextChanges(protocolPath: string, _changes: YTextChange[]): Promise<void> {
    const text = this.ydoc.getText(protocolPath).toString();
    this.scheduleWrite(protocolPath, text);
  }

  private scheduleWrite(protocolPath: string, text: string): void {
    const document = this.openDocuments.get(protocolPath);
    if (!document) {
      return;
    }
    if (document.flush) {
      clearTimeout(document.flush);
    }
    document.flush = setTimeout(() => {
      void this.workspace.writeFile(protocolPath, this.encoder.encode(text)).catch(error => {
        this.logger.error(`Failed to write synced document ${protocolPath}`, error);
      });
    }, 100);
  }

  private updateOpenDocument(protocolPath: string, content: string): void {
    const document = this.openDocuments.get(protocolPath);
    if (document && this.ydoc.getText(protocolPath).toString() !== content) {
      document.normalized.update({ changes: content });
    }
  }

  private disposeOpenDocument(protocolPath: string): void {
    const document = this.openDocuments.get(protocolPath);
    if (!document) {
      return;
    }
    if (document.flush) {
      clearTimeout(document.flush);
    }
    document.normalized.dispose();
    this.openDocuments.delete(protocolPath);
  }

  private startFileWatcher(connection: ProtocolBroadcastConnection): void {
    const queue: Array<{ path: string; type: FileChangeEventType }> = [];
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      const changes = queue.splice(0, queue.length);
      if (changes.length > 0) {
        void connection.fs.change({ changes }).catch(error => {
          this.logger.error('Failed to broadcast file changes', error);
        });
      }
    };
    const enqueue = (filePath: string, type: FileChangeEventType) => {
      const protocolPath = this.workspace.protocolPathForFile(filePath);
      if (!protocolPath) {
        return;
      }
      queue.push({ path: protocolPath, type });
      if (type === FileChangeEventType.Update) {
        void this.syncOpenDocumentFromDisk(protocolPath);
      }
      if (!timer) {
        timer = setTimeout(flush, 100);
      }
    };

    this.watcher = watch(this.options.workspace, {
      ignored: filePath => !this.workspace.protocolPathForFile(filePath),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }
    });
    this.watcher
      .on('add', filePath => enqueue(filePath, FileChangeEventType.Create))
      .on('change', filePath => enqueue(filePath, FileChangeEventType.Update))
      .on('unlink', filePath => enqueue(filePath, FileChangeEventType.Delete))
      .on('addDir', filePath => enqueue(filePath, FileChangeEventType.Create))
      .on('unlinkDir', filePath => enqueue(filePath, FileChangeEventType.Delete))
      .on('error', error => this.logger.error('Workspace watcher error', error));
  }

  private async syncOpenDocumentFromDisk(protocolPath: string): Promise<void> {
    const document = this.openDocuments.get(protocolPath);
    if (!document) {
      return;
    }
    try {
      const content = this.decoder.decode(await this.workspace.readFile(protocolPath));
      this.updateOpenDocument(protocolPath, content);
    } catch (error) {
      this.logger.warn(`Failed to sync changed document ${protocolPath}: ${stringifyError(error)}`);
    }
  }
}

function createJoinUri(serverUrl: string, roomId: string): string {
  const url = new URL(serverUrl);
  url.hash = roomId;
  return url.toString();
}

function formatPeer(peer: Peer): string {
  return peer.email ? `${peer.name}<${peer.email}>:${peer.id}` : `${peer.name}:${peer.id}`;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
