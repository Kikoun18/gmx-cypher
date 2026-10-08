// Node `fs` implementation of StorageBackend, for tests and the headless
// migration. Never part of the browser bundle.

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { StorageError, type Entry, type Stat, type StorageBackend } from '../src/lib/storage/backend/types';

function code(e: unknown, p: string): StorageError {
  const c = (e as NodeJS.ErrnoException).code;
  if (c === 'ENOENT') return new StorageError('not-found', p);
  if (c === 'EEXIST' || c === 'ENOTEMPTY') return new StorageError('exists', p);
  if (c === 'EACCES' || c === 'EPERM') return new StorageError('permission', p);
  return new StorageError('io', p, String((e as Error).message || e));
}

export class NodeBackend implements StorageBackend {
  readonly label: string;
  readonly root: string;
  constructor(root: string) { this.root = root; this.label = nodePath.basename(root); }
  private abs(p: string) { return nodePath.join(this.root, ...p.split('/').filter(Boolean)); }

  async stat(path: string): Promise<Stat | null> {
    try {
      const s = await fs.stat(this.abs(path));
      return { kind: s.isDirectory() ? 'dir' : 'file', size: s.isDirectory() ? 0 : s.size, lastModified: Math.round(s.mtimeMs) };
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw code(e, path); }
  }
  async list(path: string): Promise<Entry[]> {
    try {
      const ents = await fs.readdir(this.abs(path), { withFileTypes: true });
      return ents.map(d => ({ name: d.name, kind: d.isDirectory() ? 'dir' as const : 'file' as const })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { throw code(e, path); }
  }
  async readBytes(path: string): Promise<Uint8Array> {
    try { return new Uint8Array(await fs.readFile(this.abs(path))); } catch (e) { throw code(e, path); }
  }
  async readText(path: string): Promise<string> { return new TextDecoder().decode(await this.readBytes(path)); }
  async readBlob(path: string): Promise<Blob> { return new Blob([(await this.readBytes(path)) as Uint8Array<ArrayBuffer>]); }
  async writeBytes(path: string, data: Blob | Uint8Array): Promise<void> {
    const abs = this.abs(path);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
    try {
      await fs.mkdir(nodePath.dirname(abs), { recursive: true });
      // Write-then-rename, like createWritable(): an interrupted write leaves the old file.
      const tmp = abs + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, abs);
    } catch (e) { throw code(e, path); }
  }
  async writeText(path: string, text: string): Promise<void> { await this.writeBytes(path, new TextEncoder().encode(text)); }
  async mkdir(path: string): Promise<void> { try { await fs.mkdir(this.abs(path), { recursive: true }); } catch (e) { throw code(e, path); } }
  async move(from: string, to: string): Promise<void> {
    if (await this.stat(to)) throw new StorageError('exists', to);
    try {
      await fs.mkdir(nodePath.dirname(this.abs(to)), { recursive: true });
      await fs.rename(this.abs(from), this.abs(to));
    } catch (e) { throw code(e, from); }
  }
  async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
    const s = await this.stat(path);
    if (!s || !path) return;
    try {
      if (s.kind === 'dir') await (opts?.recursive ? fs.rm(this.abs(path), { recursive: true }) : fs.rmdir(this.abs(path)));
      else await fs.unlink(this.abs(path));
    } catch (e) { throw code(e, path); }
  }
}
