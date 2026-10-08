// File System Access API backend (Chromium). The vault root is a
// FileSystemDirectoryHandle the user picked. Single-file writes go through
// createWritable(), which Chromium commits atomically on close(); a failed write
// is aborted so the previous file stays intact.

import { sha256Hex } from '../json';
import { StorageError, type Entry, type Stat, type StorageBackend } from './types';

type Movable = FileSystemFileHandle & { move?: (dir: FileSystemDirectoryHandle, name: string) => Promise<void> };

function mapErr(e: unknown, path: string): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as DOMException)?.name;
  if (name === 'NotFoundError') return new StorageError('not-found', path);
  if (name === 'NotAllowedError' || name === 'SecurityError') return new StorageError('permission', path, 'permission to the vault folder was lost');
  if (name === 'InvalidModificationError' || name === 'TypeMismatchError') return new StorageError('exists', path);
  if (name === 'NoModificationAllowedError') return new StorageError('io', path, 'the file is locked by another program');
  return new StorageError('io', path, String((e as Error)?.message || e));
}

const segs = (p: string) => p.split('/').filter(Boolean);

export function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof window.isSecureContext === 'boolean' && window.isSecureContext;
}

export class FsAccessBackend implements StorageBackend {
  readonly label: string;
  readonly root: FileSystemDirectoryHandle;
  constructor(root: FileSystemDirectoryHandle) { this.root = root; this.label = root.name; }

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let d = this.root;
    for (const s of segs(path)) d = await d.getDirectoryHandle(s, { create });
    return d;
  }
  private async parentOf(path: string, create = false): Promise<[FileSystemDirectoryHandle, string]> {
    const parts = segs(path), name = parts.pop();
    if (!name) throw new StorageError('io', path, 'not a file path');
    return [await this.dir(parts.join('/'), create), name];
  }
  private async file(path: string, create = false): Promise<FileSystemFileHandle> {
    const [d, name] = await this.parentOf(path, create);
    return d.getFileHandle(name, { create });
  }

  async stat(path: string): Promise<Stat | null> {
    if (!segs(path).length) return { kind: 'dir', size: 0, lastModified: 0 };
    try {
      const [d, name] = await this.parentOf(path);
      try {
        const f = await (await d.getFileHandle(name)).getFile();
        return { kind: 'file', size: f.size, lastModified: f.lastModified };
      } catch (e) {
        if ((e as DOMException).name !== 'TypeMismatchError' && (e as DOMException).name !== 'NotFoundError') throw e;
        await d.getDirectoryHandle(name);
        return { kind: 'dir', size: 0, lastModified: 0 };
      }
    } catch (e) {
      const err = mapErr(e, path);
      if (err.code === 'not-found' || err.code === 'exists') return null;
      throw err;
    }
  }

  async list(path: string): Promise<Entry[]> {
    try {
      const d = await this.dir(path), out: Entry[] = [];
      for await (const [name, h] of d.entries()) out.push({ name, kind: h.kind === 'directory' ? 'dir' : 'file' });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { throw mapErr(e, path); }
  }

  async readBlob(path: string): Promise<Blob> {
    try { return await (await this.file(path)).getFile(); } catch (e) { throw mapErr(e, path); }
  }
  async readBytes(path: string): Promise<Uint8Array> { return new Uint8Array(await (await this.readBlob(path)).arrayBuffer()); }
  async readText(path: string): Promise<string> { return new TextDecoder().decode(await this.readBytes(path)); }

  async writeBytes(path: string, data: Blob | Uint8Array): Promise<void> {
    let w: FileSystemWritableFileStream | null = null;
    try {
      const h = await this.file(path, true);
      w = await h.createWritable({ keepExistingData: false });
      // A File/Blob is handed to the stream as-is — no string round-trip.
      await w.write(data instanceof Uint8Array ? (data as Uint8Array<ArrayBuffer>) : data);
      await w.close();
      w = null;
    } catch (e) {
      if (w) await w.abort().catch(() => {});
      throw mapErr(e, path);
    }
  }
  async writeText(path: string, text: string): Promise<void> { await this.writeBytes(path, new TextEncoder().encode(text)); }

  async mkdir(path: string): Promise<void> { try { await this.dir(path, true); } catch (e) { throw mapErr(e, path); } }

  async move(from: string, to: string): Promise<void> {
    const st = await this.stat(from);
    if (!st) throw new StorageError('not-found', from);
    if (await this.stat(to)) throw new StorageError('exists', to);
    if (st.kind === 'file') return this.moveFile(from, to);
    // Directory moves aren't supported by the API: recreate the tree, moving each
    // file (each verified), then remove the emptied source.
    await this.mkdir(to);
    for (const e of await this.list(from)) await this.move(from + '/' + e.name, to + '/' + e.name);
    await this.remove(from, { recursive: false });
  }

  private async moveFile(from: string, to: string): Promise<void> {
    try {
      const h = await this.file(from) as Movable;
      const [toDir, toName] = await this.parentOf(to, true);
      if (typeof h.move === 'function') {
        try { await h.move(toDir, toName); return; } catch (e) {
          // Some platforms only move within one directory; fall back to copy + verify + delete.
          if ((e as DOMException).name === 'NotAllowedError' || (e as DOMException).name === 'SecurityError') throw e;
        }
      }
      const src = await h.getFile();
      await this.writeBytes(to, src);
      const copy = await (await this.file(to)).getFile();
      if (copy.size !== src.size || (await sha256Hex(copy)) !== (await sha256Hex(src))) {
        await this.remove(to);
        throw new StorageError('io', to, 'copy verification failed; the source was kept');
      }
      await this.remove(from);
    } catch (e) { throw mapErr(e, from); }
  }

  async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
    if (!segs(path).length) return;
    try {
      const [d, name] = await this.parentOf(path);
      await d.removeEntry(name, { recursive: !!opts?.recursive });
    } catch (e) {
      const err = mapErr(e, path);
      if (err.code !== 'not-found') throw err;
    }
  }
}

// --- permissions -----------------------------------------------------------------

type PermHandle = FileSystemHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

export async function queryWrite(h: FileSystemHandle): Promise<PermissionState> {
  const p = h as PermHandle;
  return p.queryPermission ? p.queryPermission({ mode: 'readwrite' }) : 'granted';
}

/** Must run inside a user gesture (a click). */
export async function requestWrite(h: FileSystemHandle): Promise<PermissionState> {
  const p = h as PermHandle;
  return p.requestPermission ? p.requestPermission({ mode: 'readwrite' }) : 'granted';
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const w = window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> };
  return w.showDirectoryPicker({ id: 'pmf-vault', mode: 'readwrite' });
}
