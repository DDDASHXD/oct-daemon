import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { FileType, type FileSystemDirectory } from 'open-collaboration-protocol';

export interface SyncWorkspaceOptions {
  root: string;
  remoteFolders: string[];
  excludes: string[];
}

export class SyncWorkspace {
  readonly root: string;
  readonly remoteFolders: string[];
  readonly excludes: string[];
  private readonly mounts: FolderMount[];

  constructor(options: SyncWorkspaceOptions) {
    this.root = path.resolve(options.root);
    this.remoteFolders = options.remoteFolders.map(normalizeProtocolPath);
    this.excludes = options.excludes;
    this.mounts = createMounts(this.remoteFolders);
  }

  protocolPathForFile(filePath: string): string | undefined {
    const absolute = path.resolve(filePath);
    const localRelative = toProtocolPath(path.relative(this.root, absolute));
    if (localRelative === '..' || localRelative.startsWith('../') || path.isAbsolute(localRelative)) {
      return undefined;
    }
    if (this.isExcluded(localRelative)) {
      return undefined;
    }
    if (this.mounts.length === 1) {
      const remote = this.mounts[0].remote;
      return localRelative ? `${remote}/${localRelative}` : remote;
    }
    const match = this.mounts.find(mount => localRelative === mount.local || localRelative.startsWith(`${mount.local}/`));
    if (!match) {
      return undefined;
    }
    const relative = localRelative === match.local ? '' : localRelative.slice(match.local.length + 1);
    if (relative && this.isExcluded(relative)) {
      return undefined;
    }
    return relative ? `${match.remote}/${relative}` : match.remote;
  }

  localPathForProtocol(protocolPath: string): string | undefined {
    const normalized = normalizeProtocolPath(protocolPath);
    const match = this.mounts.find(mount => normalized === mount.remote || normalized.startsWith(`${mount.remote}/`));
    if (!match) {
      return undefined;
    }
    const remoteRelative = normalized === match.remote ? '' : normalized.slice(match.remote.length + 1);
    if (remoteRelative === '..' || remoteRelative.startsWith('../') || remoteRelative.includes('/../')) {
      return undefined;
    }
    const localRelative = this.mounts.length === 1
      ? remoteRelative
      : remoteRelative ? `${match.local}/${remoteRelative}` : match.local;
    if ((localRelative && this.isExcluded(localRelative)) || (remoteRelative && this.isExcluded(remoteRelative))) {
      return undefined;
    }
    return path.resolve(this.root, localRelative);
  }

  relativeForProtocol(protocolPath: string): string | undefined {
    const local = this.localPathForProtocol(protocolPath);
    if (!local) {
      return undefined;
    }
    return toProtocolPath(path.relative(this.root, local));
  }

  isExcluded(relativePath: string): boolean {
    const normalized = normalizeProtocolPath(relativePath);
    return this.excludes.some(pattern => {
      if (minimatch(normalized, pattern, { dot: true })) {
        return true;
      }
      if (pattern.endsWith('/**')) {
        return normalized === pattern.slice(0, -3);
      }
      return false;
    });
  }

  async writeFile(protocolPath: string, content: Uint8Array): Promise<void> {
    const local = this.requireLocalPath(protocolPath);
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, content);
  }

  async mkdir(protocolPath: string): Promise<void> {
    await fs.mkdir(this.requireLocalPath(protocolPath), { recursive: true });
  }

  async delete(protocolPath: string): Promise<void> {
    await fs.rm(this.requireLocalPath(protocolPath), { recursive: true, force: true });
  }

  async readdirLocal(protocolPath: string): Promise<FileSystemDirectory> {
    const local = this.requireLocalPath(protocolPath);
    const entries = await fs.readdir(local, { withFileTypes: true });
    const result: FileSystemDirectory = {};
    for (const entry of entries) {
      result[entry.name] = direntToFileType(entry);
    }
    return result;
  }

  private requireLocalPath(protocolPath: string): string {
    const local = this.localPathForProtocol(protocolPath);
    if (!local) {
      throw new Error(`Path is outside synchronized folders: ${protocolPath}`);
    }
    const relative = path.relative(this.root, local);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path escapes workspace: ${protocolPath}`);
    }
    return local;
  }
}

interface FolderMount {
  remote: string;
  local: string;
}

function createMounts(remoteFolders: string[]): FolderMount[] {
  if (remoteFolders.length === 0) {
    throw new Error('Remote workspace does not contain any folders');
  }
  if (remoteFolders.length === 1) {
    return [{ remote: remoteFolders[0], local: '' }];
  }
  const used = new Set<string>();
  return remoteFolders.map(remote => {
    let local = sanitizeLocalName(remote.split('/').at(-1) || remote);
    if (used.has(local)) {
      local = sanitizeLocalName(remote);
    }
    let candidate = local;
    let index = 2;
    while (used.has(candidate)) {
      candidate = `${local}-${index++}`;
    }
    used.add(candidate);
    return { remote, local: candidate };
  });
}

function normalizeProtocolPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function toProtocolPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function sanitizeLocalName(value: string): string {
  const sanitized = value.replaceAll('/', '_').replaceAll('\\', '_').replace(/[<>:"|?*]/g, '_');
  return sanitized || 'workspace';
}

function direntToFileType(entry: Dirent): FileType {
  if (entry.isDirectory()) {
    return FileType.Directory;
  }
  if (entry.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  if (entry.isFile()) {
    return FileType.File;
  }
  return FileType.Unknown;
}
