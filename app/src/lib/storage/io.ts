// Tracked I/O over a StorageBackend: remembers the last-known size, mtime and
// content hash of every text file read or written, refuses to overwrite a text
// file that changed on disk behind our back (spec §13), and skips writes whose
// content didn't change (spec §5).

import { StorageError, type StorageBackend } from './backend/types';
import { sha256Hex, stableStringify } from './json';

export interface Known { size: number; lastModified: number; sha256: string; text?: string }

export class ExternalChangeError extends Error {
  readonly path: string;
  readonly diskText: string | null;
  constructor(path: string, diskText: string | null) {
    super('changed outside the app: ' + path);
    this.name = 'ExternalChangeError';
    this.path = path;
    this.diskText = diskText;
  }
}

export class CorruptFileError extends Error {
  readonly path: string;
  constructor(path: string, cause: string) { super('unreadable ' + path + ': ' + cause); this.name = 'CorruptFileError'; this.path = path; }
}

export class VaultIO {
  readonly known = new Map<string, Known>();
  readOnly = false;
  readonly backend: StorageBackend;
  constructor(backend: StorageBackend) { this.backend = backend; }

  private guard(path: string) { if (this.readOnly) throw new StorageError('read-only', path, 'the vault is open read-only'); }

  async readText(path: string): Promise<string | null> {
    const st = await this.backend.stat(path);
    if (!st || st.kind !== 'file') { this.known.delete(path); return null; }
    const text = await this.backend.readText(path);
    this.known.set(path, { size: st.size, lastModified: st.lastModified, sha256: await sha256Hex(text), text });
    return text;
  }

  /** Parsed JSON, null when missing; CorruptFileError when unparseable. */
  async readJson<T>(path: string): Promise<T | null> {
    const t = await this.readText(path);
    if (t == null) return null;
    try { return JSON.parse(t) as T; } catch (e) { throw new CorruptFileError(path, String((e as Error).message)); }
  }

  /** True if the file on disk is not what we last saw (or appeared/disappeared). */
  async changedOnDisk(path: string): Promise<boolean> {
    const st = await this.backend.stat(path), k = this.known.get(path);
    if (!st) return !!k;
    if (!k) return true;
    if (st.size === k.size && st.lastModified === k.lastModified) return false;
    return (await sha256Hex(await this.backend.readText(path))) !== k.sha256;
  }

  /**
   * Writes text unless unchanged. Throws ExternalChangeError if the file was
   * modified outside the app since we last read or wrote it (or appeared while
   * we believed it absent), unless `force` is set.
   */
  async writeText(path: string, text: string, opts: { force?: boolean } = {}): Promise<'written' | 'unchanged'> {
    this.guard(path);
    const k = this.known.get(path);
    if (!opts.force) {
      const st = await this.backend.stat(path);
      if (st && st.kind === 'file') {
        const fresh = k && st.size === k.size && st.lastModified === k.lastModified;
        if (!fresh) {
          const disk = await this.backend.readText(path);
          const sha = await sha256Hex(disk);
          if (disk === text) { this.known.set(path, { size: st.size, lastModified: st.lastModified, sha256: sha, text }); return 'unchanged'; }
          if (!k || sha !== k.sha256) throw new ExternalChangeError(path, disk);
        } else if (k && k.text === text) return 'unchanged';
      } else if (!st && k) {
        // Deleted outside the app since we last saw it: recreate (deletion isn't content to protect).
      }
    }
    await this.backend.writeText(path, text);
    const st = await this.backend.stat(path);
    this.known.set(path, { size: st ? st.size : text.length, lastModified: st ? st.lastModified : 0, sha256: await sha256Hex(text), text });
    return 'written';
  }

  writeJson(path: string, value: unknown, opts?: { force?: boolean }) { return this.writeText(path, stableStringify(value), opts); }

  async writeBytes(path: string, data: Blob | Uint8Array) { this.guard(path); await this.backend.writeBytes(path, data); }

  async move(from: string, to: string) {
    this.guard(from);
    await this.backend.move(from, to);
    for (const [p, k] of [...this.known]) {
      if (p === from || p.startsWith(from + '/')) { this.known.delete(p); this.known.set(to + p.slice(from.length), k); }
    }
  }

  async remove(path: string, recursive = false) {
    this.guard(path);
    await this.backend.remove(path, { recursive });
    for (const p of [...this.known.keys()]) if (p === path || p.startsWith(path + '/')) this.known.delete(p);
  }

  async mkdir(path: string) { this.guard(path); await this.backend.mkdir(path); }
  forget(path: string) { this.known.delete(path); }
}
