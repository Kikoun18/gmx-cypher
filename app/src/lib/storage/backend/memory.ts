// In-memory StorageBackend for tests and the unsaved JSON-viewer session.
// Supports fault injection so tests can simulate a crash mid-operation.

import { StorageError, type Entry, type Stat, type StorageBackend } from './types';

type Node = { kind: 'file'; data: Uint8Array; mtime: number } | { kind: 'dir'; mtime: number };

const norm = (p: string) => p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
const parent = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };

export class MemoryBackend implements StorageBackend {
  readonly label: string;
  private nodes = new Map<string, Node>([['', { kind: 'dir', mtime: 0 }]]);
  private clock = 1;
  /** Throw from any operation for which this returns true (simulated crash / permission loss). */
  fault: ((op: string, path: string) => boolean) | null = null;
  ops = 0;

  constructor(label = 'memory-vault') { this.label = label; }

  private tick() { this.clock = Math.max(this.clock + 1, Date.now()); return this.clock; }
  private check(op: string, path: string) {
    this.ops++;
    if (this.fault && this.fault(op, path)) throw new StorageError('io', path, 'injected fault: ' + op + ' ' + path);
  }
  private ensureDirs(p: string) {
    const parts = p ? p.split('/') : [];
    let cur = '';
    for (const part of parts) {
      cur = cur ? cur + '/' + part : part;
      const n = this.nodes.get(cur);
      if (!n) this.nodes.set(cur, { kind: 'dir', mtime: this.tick() });
      else if (n.kind !== 'dir') throw new StorageError('exists', cur, 'a file is in the way: ' + cur);
    }
  }

  async stat(path: string): Promise<Stat | null> {
    const n = this.nodes.get(norm(path));
    if (!n) return null;
    return n.kind === 'file' ? { kind: 'file', size: n.data.byteLength, lastModified: n.mtime } : { kind: 'dir', size: 0, lastModified: n.mtime };
  }

  async list(path: string): Promise<Entry[]> {
    const p = norm(path), n = this.nodes.get(p);
    if (!n || n.kind !== 'dir') throw new StorageError('not-found', p);
    const out: Entry[] = [];
    for (const [k, v] of this.nodes) if (k !== '' && k !== p && parent(k) === p) out.push({ name: k.slice(p ? p.length + 1 : 0), kind: v.kind });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const p = norm(path);
    this.check('read', p);
    const n = this.nodes.get(p);
    if (!n || n.kind !== 'file') throw new StorageError('not-found', p);
    return n.data.slice();
  }
  async readText(path: string): Promise<string> { return new TextDecoder().decode(await this.readBytes(path)); }
  async readBlob(path: string): Promise<Blob> { return new Blob([(await this.readBytes(path)) as Uint8Array<ArrayBuffer>]); }

  async writeBytes(path: string, data: Blob | Uint8Array): Promise<void> {
    const p = norm(path);
    this.check('write', p);
    const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(await data.arrayBuffer());
    const cur = this.nodes.get(p);
    if (cur && cur.kind === 'dir') throw new StorageError('exists', p, 'a directory is in the way');
    this.ensureDirs(parent(p));
    this.nodes.set(p, { kind: 'file', data: bytes, mtime: this.tick() });
  }
  async writeText(path: string, text: string): Promise<void> { await this.writeBytes(path, new TextEncoder().encode(text)); }

  async mkdir(path: string): Promise<void> { const p = norm(path); this.check('mkdir', p); this.ensureDirs(p); }

  async move(from: string, to: string): Promise<void> {
    const a = norm(from), b = norm(to);
    this.check('move', a);
    const n = this.nodes.get(a);
    if (!n) throw new StorageError('not-found', a);
    if (this.nodes.has(b)) throw new StorageError('exists', b);
    this.ensureDirs(parent(b));
    const moves: [string, Node][] = [];
    for (const [k, v] of this.nodes) if (k === a || k.startsWith(a + '/')) moves.push([k, v]);
    for (const [k] of moves) this.nodes.delete(k);
    for (const [k, v] of moves) this.nodes.set(b + k.slice(a.length), v);
  }

  async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
    const p = norm(path);
    this.check('remove', p);
    const n = this.nodes.get(p);
    if (!n || p === '') return;
    const kids = [...this.nodes.keys()].filter(k => k.startsWith(p + '/'));
    if (n.kind === 'dir' && kids.length && !opts?.recursive) throw new StorageError('io', p, 'directory not empty');
    for (const k of kids) this.nodes.delete(k);
    this.nodes.delete(p);
  }

  // --- test helpers ----------------------------------------------------------
  /** Every path (files and directories), sorted. */
  paths(): string[] { return [...this.nodes.keys()].filter(Boolean).sort(); }
  /** Simulates an external edit (bumps the modification time). */
  async touch(path: string, text: string) { const f = this.fault; this.fault = null; await this.writeText(path, text); this.fault = f; }
}
