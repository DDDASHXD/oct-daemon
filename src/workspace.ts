import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { FileType, type FileSystemDirectory, type FileSystemStat } from 'open-collaboration-protocol';

export interface WorkspaceHostOptions {
  root: string;
  name?: string;
  excludes: string[];
  readonly: boolean;
}

export class WorkspaceHost {
  readonly root: string;
  readonly name: string;
  readonly excludes: string[];
  readonly readonly: boolean;

  constructor(options: WorkspaceHostOptions) {
    this.root = path.resolve(options.root);
    this.name = options.name ?? (path.basename(this.root) || 'Collaboration');
    this.excludes = options.excludes;
    this.readonly = options.readonly;
  }

  get protocolRoot(): string {
    return this.name;
  }

  protocolPathForFile(filePath: string): string | undefined {
    const absolute = path.resolve(filePath);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return undefined;
    }
    const protocolRelative = toProtocolPath(relative);
    if (this.isExcluded(protocolRelative)) {
      return undefined;
    }
    return protocolRelative ? `${this.name}/${protocolRelative}` : this.name;
  }

  resolveProtocolPath(protocolPath: string): { absolute: string; relative: string } {
    const normalized = protocolPath.replaceAll('\\', '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts[0] !== this.name) {
      throw new Error(`Path must start with workspace root '${this.name}': ${protocolPath}`);
    }
    const relative = parts.slice(1).join('/');
    if (relative === '..' || relative.startsWith('../') || relative.includes('/../')) {
      throw new Error(`Path escapes workspace: ${protocolPath}`);
    }
    if (relative && this.isExcluded(relative)) {
      throw createNotFoundError(protocolPath);
    }
    const absolute = path.resolve(this.root, relative);
    const resolvedRelative = path.relative(this.root, absolute);
    if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
      throw new Error(`Path escapes workspace: ${protocolPath}`);
    }
    return { absolute, relative };
  }

  isExcluded(relativeProtocolPath: string): boolean {
    const normalized = relativeProtocolPath.replaceAll('\\', '/').replace(/^\/+/, '');
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

  async stat(protocolPath: string): Promise<FileSystemStat> {
    const { absolute } = this.resolveProtocolPath(protocolPath);
    const stat = await fs.lstat(absolute);
    return {
      type: toFileType(stat),
      mtime: stat.mtimeMs,
      ctime: stat.ctimeMs,
      size: stat.size,
      permissions: this.readonly ? 1 : undefined
    };
  }

  async readdir(protocolPath: string): Promise<FileSystemDirectory> {
    const { absolute, relative } = this.resolveProtocolPath(protocolPath);
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const result: FileSystemDirectory = {};
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (!this.isExcluded(childRelative)) {
        result[entry.name] = direntToFileType(entry);
      }
    }
    return result;
  }

  async readFile(protocolPath: string): Promise<Uint8Array> {
    const { absolute } = this.resolveProtocolPath(protocolPath);
    return fs.readFile(absolute);
  }

  async writeFile(protocolPath: string, content: Uint8Array): Promise<void> {
    this.assertWritable();
    const { absolute } = this.resolveProtocolPath(protocolPath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
  }

  async mkdir(protocolPath: string): Promise<void> {
    this.assertWritable();
    const { absolute } = this.resolveProtocolPath(protocolPath);
    await fs.mkdir(absolute, { recursive: true });
  }

  async delete(protocolPath: string): Promise<void> {
    this.assertWritable();
    const { absolute } = this.resolveProtocolPath(protocolPath);
    await fs.rm(absolute, { recursive: true, force: true });
  }

  async rename(fromProtocolPath: string, toProtocolPath: string): Promise<void> {
    this.assertWritable();
    const from = this.resolveProtocolPath(fromProtocolPath);
    const to = this.resolveProtocolPath(toProtocolPath);
    await fs.mkdir(path.dirname(to.absolute), { recursive: true });
    await fs.rename(from.absolute, to.absolute);
  }

  private assertWritable(): void {
    if (this.readonly) {
      throw new Error('Workspace is readonly');
    }
  }
}

function toProtocolPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
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

function toFileType(stat: { isDirectory(): boolean; isSymbolicLink(): boolean; isFile(): boolean }): FileType {
  if (stat.isDirectory()) {
    return FileType.Directory;
  }
  if (stat.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  if (stat.isFile()) {
    return FileType.File;
  }
  return FileType.Unknown;
}

function createNotFoundError(target: string): Error {
  const error = new Error(`File not found: ${target}`) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
}
