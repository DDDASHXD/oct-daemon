import { TextEncoder } from 'node:util';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'chokidar';
import {
  ConnectionProvider,
  DisposableCollection,
  FileChangeEventType,
  FileType,
  SocketIoTransportProvider,
  type FileSystemDirectory,
  type Peer,
  type ProtocolBroadcastConnection
} from 'open-collaboration-protocol';
import { OpenCollaborationYjsProvider } from 'open-collaboration-yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { readAuthToken, writeAuthToken } from './auth-token.js';
import type { Logger } from './logger.js';
import type { SyncOptions } from './options.js';
import { SyncWorkspace } from './sync-workspace.js';

export interface RunningSync {
  roomId: string;
  workspace: string;
  stop(): Promise<void>;
}

export class OpenCollabSync {
  private readonly encoder = new TextEncoder();
  private readonly disposables = new DisposableCollection();
  private readonly ydoc = new Y.Doc();
  private readonly awareness = new awarenessProtocol.Awareness(this.ydoc);
  private workspace?: SyncWorkspace;
  private connection?: ProtocolBroadcastConnection;
  private watcher?: FSWatcher;
  private yjsProvider?: OpenCollaborationYjsProvider;
  private host?: Peer;
  private hostInitReceived = false;
  private resolveHostInit?: (host: Peer) => void;
  private stopped = false;
  private readonly applyingRemote = new Map<string, NodeJS.Timeout>();
  private readonly yjsWriteFlushes = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly options: SyncOptions,
    private readonly logger: Logger
  ) {}

  async start(): Promise<RunningSync> {
    const storedToken = this.options.authToken ?? await readAuthToken(this.options.authTokenFile);
    const provider = new ConnectionProvider({
      url: this.options.server,
      userToken: storedToken,
      client: 'OCT_CODE_opencollabtools_sync@0.1.0',
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

    const join = await provider.joinRoom({
      roomId: this.options.room,
      reporter: info => this.logger.info(`OCT ${info.code}: ${info.message}`)
    });
    const authToken = join.loginToken ?? provider.authToken;
    if (authToken) {
      await writeAuthToken(this.options.authTokenFile, authToken);
    }

    this.host = join.host;
    this.workspace = new SyncWorkspace({
      root: this.options.workspace,
      remoteFolders: join.workspace.folders,
      excludes: this.options.exclude
    });

    await fs.mkdir(this.options.workspace, { recursive: true });
    const connection = await provider.connect(join.roomToken, join.host);
    this.connection = connection;
    this.registerConnectionHandlers(connection);

    this.logger.info(`ROOM_ID=${join.roomId}`);
    this.logger.info(`HOST_PEER=${join.host.id}`);
    this.logger.info(`REMOTE_WORKSPACE=${join.workspace.name}`);
    this.logger.info(`LOCAL_WORKSPACE=${this.options.workspace}`);

    const host = await this.waitForHostInit(connection, join.host);
    this.setupYjsSync(connection);
    await this.downloadRemoteWorkspace(connection, host);
    this.startFileWatcher(connection);
    this.logger.info('SYNC_READY=1');

    return {
      roomId: join.roomId,
      workspace: this.options.workspace,
      stop: () => this.stop()
    };
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const timer of this.applyingRemote.values()) {
      clearTimeout(timer);
    }
    this.applyingRemote.clear();
    for (const timer of this.yjsWriteFlushes.values()) {
      clearTimeout(timer);
    }
    this.yjsWriteFlushes.clear();
    await this.watcher?.close();
    try {
      await this.connection?.room.leave();
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      this.logger.warn(`Failed to leave OCT room cleanly: ${stringifyError(error)}`);
    }
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
      this.logger.info('Reconnected to OCT server; resyncing workspace.');
      this.yjsProvider?.connect();
      const host = this.host;
      if (host) {
        void this.downloadRemoteWorkspace(connection, host).catch(error => {
          this.logger.error('Failed to resync workspace after reconnect', error);
        });
      }
    }));
    connection.peer.onInfo((_, peer) => {
      this.logger.info(`SYNC_PEER=${peer.id}`);
    });
    connection.peer.onInit((_, init) => {
      this.onHostInit(init.host);
    });
    connection.room.onLeave((_, peer) => {
      if (peer.id === this.host?.id) {
        this.logger.warn('Host left the room.');
        void this.stop();
      }
    });
    connection.room.onClose(() => {
      this.logger.warn('OCT room closed.');
      void this.stop();
    });
    connection.fs.onChange((_, event) => {
      if (event.changes.length > 0) {
        this.logger.info(`REMOTE_FS_CHANGE count=${event.changes.length}`);
      }
      void this.applyRemoteChanges(connection, event.changes).catch(error => {
        this.logger.error('Failed to apply remote file changes', error);
      });
    });
  }

  private setupYjsSync(connection: ProtocolBroadcastConnection): void {
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
    this.ydoc.on('afterTransaction', transaction => {
      this.handleYjsTransaction(transaction);
    });
    this.logger.info('YJS_SYNC=1');
  }

  private handleYjsTransaction(transaction: Y.Transaction): void {
    for (const [protocolPath, shared] of this.ydoc.share.entries()) {
      if (shared instanceof Y.Text && this.transactionChangedType(transaction, shared)) {
        this.scheduleYjsWrite(protocolPath, shared.toString());
      }
    }
  }

  private transactionChangedType(transaction: Y.Transaction, type: Y.Text): boolean {
    return (transaction.changed as unknown as Map<Y.Text, unknown>).has(type);
  }

  private scheduleYjsWrite(protocolPath: string, text: string): void {
    const workspace = this.requireWorkspace();
    if (!workspace.localPathForProtocol(protocolPath)) {
      return;
    }
    const existing = this.yjsWriteFlushes.get(protocolPath);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.yjsWriteFlushes.delete(protocolPath);
      void this.writeYjsDocument(protocolPath, text);
    }, 100);
    this.yjsWriteFlushes.set(protocolPath, timer);
  }

  private async writeYjsDocument(protocolPath: string, text: string): Promise<void> {
    const workspace = this.requireWorkspace();
    if (!workspace.localPathForProtocol(protocolPath)) {
      return;
    }
    this.markApplyingRemote(protocolPath);
    try {
      await workspace.writeFile(protocolPath, this.encoder.encode(text));
      this.logger.info(`YJS_WROTE_FILE=${protocolPath}`);
    } catch (error) {
      this.logger.error(`Failed to write Yjs document ${protocolPath}`, error);
    }
  }

  private async downloadRemoteWorkspace(connection: ProtocolBroadcastConnection, host: Peer): Promise<void> {
    const workspace = this.requireWorkspace();
    for (const folder of workspace.remoteFolders) {
      await this.syncRemotePath(connection, host, folder, true);
    }
  }

  private async applyRemoteChanges(
    connection: ProtocolBroadcastConnection,
    changes: Array<{ path: string; type: FileChangeEventType }>
  ): Promise<void> {
    const host = this.host;
    if (!host) {
      return;
    }
    for (const change of changes) {
      if (!this.requireWorkspace().localPathForProtocol(change.path)) {
        continue;
      }
      this.markApplyingRemote(change.path);
      if (change.type === FileChangeEventType.Delete) {
        await this.requireWorkspace().delete(change.path);
        this.logger.info(`PULLED_DELETE=${change.path}`);
      } else {
        await this.syncRemotePath(connection, host, change.path, false);
        this.logger.info(`PULLED_FILE=${change.path}`);
      }
    }
  }

  private async syncRemotePath(
    connection: ProtocolBroadcastConnection,
    host: Peer,
    protocolPath: string,
    reconcileDirectory: boolean
  ): Promise<void> {
    if (!this.requireWorkspace().localPathForProtocol(protocolPath)) {
      return;
    }
    const stat = await connection.fs.stat(host.id, protocolPath);
    if (stat.type === FileType.Directory) {
      await this.syncRemoteDirectory(connection, host, protocolPath, reconcileDirectory);
    } else if (stat.type === FileType.File) {
      const file = await connection.fs.readFile(host.id, protocolPath);
      this.markApplyingRemote(protocolPath);
      await this.requireWorkspace().writeFile(protocolPath, file.content);
    } else {
      this.logger.warn(`Skipping unsupported remote file type at ${protocolPath}`);
    }
  }

  private async syncRemoteDirectory(
    connection: ProtocolBroadcastConnection,
    host: Peer,
    protocolPath: string,
    reconcileDirectory: boolean
  ): Promise<void> {
    const workspace = this.requireWorkspace();
    if (!workspace.localPathForProtocol(protocolPath)) {
      return;
    }
    this.markApplyingRemote(protocolPath);
    await workspace.mkdir(protocolPath);
    const remoteEntries = await connection.fs.readdir(host.id, protocolPath);
    if (reconcileDirectory) {
      await this.deleteStaleLocalEntries(protocolPath, remoteEntries);
    }
    for (const [name, type] of Object.entries(remoteEntries)) {
      const child = `${protocolPath}/${name}`;
      if (!workspace.localPathForProtocol(child)) {
        continue;
      }
      if (type === FileType.Directory) {
        await this.syncRemoteDirectory(connection, host, child, reconcileDirectory);
      } else if (type === FileType.File) {
        const file = await connection.fs.readFile(host.id, child);
        this.markApplyingRemote(child);
        await workspace.writeFile(child, file.content);
      } else {
        this.logger.warn(`Skipping unsupported remote file type at ${child}`);
      }
    }
  }

  private async deleteStaleLocalEntries(protocolPath: string, remoteEntries: FileSystemDirectory): Promise<void> {
    const workspace = this.requireWorkspace();
    let localEntries: FileSystemDirectory;
    try {
      localEntries = await workspace.readdirLocal(protocolPath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const name of Object.keys(localEntries)) {
      if (remoteEntries[name] !== undefined) {
        continue;
      }
      const child = `${protocolPath}/${name}`;
      const relative = workspace.relativeForProtocol(child);
      if (relative === undefined || workspace.isExcluded(relative)) {
        continue;
      }
      this.markApplyingRemote(child);
      await workspace.delete(child);
    }
  }

  private onHostInit(host: Peer): void {
    this.hostInitReceived = true;
    this.host = host;
    this.logger.info(`INIT_HOST=${host.id}`);
    this.resolveHostInit?.(host);
  }

  private async waitForHostInit(_connection: ProtocolBroadcastConnection, fallbackHost: Peer): Promise<Peer> {
    await undefined;
    if (this.hostInitReceived) {
      return this.host ?? fallbackHost;
    }
    return new Promise<Peer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.resolveHostInit = undefined;
        reject(new Error('Timed out waiting for host initialization. Ensure an oct-daemon host is running for this room.'));
      }, 30_000);
      this.resolveHostInit = host => {
        clearTimeout(timeout);
        this.resolveHostInit = undefined;
        resolve(host);
      };
    });
  }

  private startFileWatcher(connection: ProtocolBroadcastConnection): void {
    const workspace = this.requireWorkspace();
    const pushLocalFile = async (filePath: string) => {
      const host = this.host;
      if (!host) {
        return;
      }
      const protocolPath = workspace.protocolPathForFile(filePath);
      if (!protocolPath) {
        this.logger.info(`LOCAL_CHANGE_SKIPPED path=${filePath}`);
        return;
      }
      if (this.isApplyingRemote(protocolPath)) {
        this.logger.info(`LOCAL_CHANGE_SUPPRESSED path=${protocolPath}`);
        return;
      }
      this.logger.info(`LOCAL_CHANGE path=${filePath}`);
      const content = await fs.readFile(filePath);
      await connection.fs.writeFile(host.id, protocolPath, { content });
      this.logger.info(`PUSHED_FILE=${protocolPath}`);
    };
    const pushLocalMkdir = async (filePath: string) => {
      const host = this.host;
      if (!host) {
        return;
      }
      const protocolPath = workspace.protocolPathForFile(filePath);
      if (!protocolPath || this.isApplyingRemote(protocolPath)) {
        return;
      }
      await connection.fs.mkdir(host.id, protocolPath);
      this.logger.info(`PUSHED_DIR=${protocolPath}`);
    };
    const pushLocalDelete = async (filePath: string) => {
      const host = this.host;
      if (!host) {
        return;
      }
      const protocolPath = workspace.protocolPathForFile(filePath);
      if (!protocolPath || this.isApplyingRemote(protocolPath)) {
        return;
      }
      await connection.fs.delete(host.id, protocolPath);
      this.logger.info(`PUSHED_DELETE=${protocolPath}`);
    };

    this.watcher = watch(this.options.workspace, {
      ignored: filePath => !workspace.protocolPathForFile(filePath),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }
    });
    this.watcher
      .on('add', filePath => void pushLocalFile(filePath).catch(error => this.logger.error('Failed to push local file', error)))
      .on('change', filePath => void pushLocalFile(filePath).catch(error => this.logger.error('Failed to push local file', error)))
      .on('addDir', filePath => void pushLocalMkdir(filePath).catch(error => this.logger.error('Failed to push local directory', error)))
      .on('unlink', filePath => void pushLocalDelete(filePath).catch(error => this.logger.error('Failed to push local delete', error)))
      .on('unlinkDir', filePath => void pushLocalDelete(filePath).catch(error => this.logger.error('Failed to push local directory delete', error)))
      .on('error', error => this.logger.error('Sync watcher error', error));
  }

  private markApplyingRemote(protocolPath: string): void {
    const existing = this.applyingRemote.get(protocolPath);
    if (existing) {
      clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
      this.applyingRemote.delete(protocolPath);
    }, 2_000);
    this.applyingRemote.set(protocolPath, timeout);
  }

  private isApplyingRemote(protocolPath: string): boolean {
    for (const remotePath of this.applyingRemote.keys()) {
      if (protocolPath === remotePath || protocolPath.startsWith(`${remotePath}/`)) {
        return true;
      }
    }
    return false;
  }

  private requireWorkspace(): SyncWorkspace {
    if (!this.workspace) {
      throw new Error('Sync workspace is not initialized');
    }
    return this.workspace;
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
