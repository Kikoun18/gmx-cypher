import { readdirSync, readFileSync } from 'node:fs';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import type { StorageBackend } from '../src/lib/storage/backend/types';
import { Vault, type LockProvider } from '../src/lib/storage/vault';
import { newFileId } from '../src/lib/storage/files';
import type { Upload } from '../src/lib/storage/plan';
import { stableStringify } from '../src/lib/storage/json';
import * as lib from '../src/lib/seq';
import { FORMER_COLS } from '../src/lib/pmf';
import type { Slot, Store } from '../src/lib/types';

export const fixture = (name: string) => new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
export const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/**
 * The example files name three columns (o26, pg, ha) and the four former tags, which a project once started with and a new
 * one no longer does: the tests' stores and projects have them, as a project from before that change does.
 */
export const sugarStore = (): Store => ({ ...lib.emptyStore(), cols: FORMER_COLS.map(c => ({ ...c })) });

export async function newVault(b: StorageBackend = new MemoryBackend(), lock?: LockProvider) {
  const { vault } = await Vault.create(b, { lock });
  const { id } = await vault.createProject('Sugar PMFs', { cols: FORMER_COLS, settings: {} });
  const svc = await vault.openProject(id, { notes: 'eager' });
  return { b, vault, svc, pid: id };
}

export async function reopen(b: StorageBackend, lock?: LockProvider) {
  const vault = await Vault.open(b, { lock });
  const [p] = await vault.listProjects();
  const svc = await vault.openProject(p.id, { notes: 'eager' });
  await svc.verified;
  return { vault, svc, pid: p.id };
}

/** Same steps as the upload dialog: parse for display, keep the original bytes for the vault. */
export function withPmf(store: Store, o: { name: string; col: string; slot?: Slot; file: string; bytes: Uint8Array; group?: string }) {
  const table = lib.parseTable(text(o.bytes));
  const { x, y } = lib.runFromTable(table, 1, 2);
  const fileId = newFileId(), slot = o.slot || 'a';
  const res = lib.addRun(store, { name: o.name, seq: o.name, group: o.group || '', desc: '', sacch: o.col, run: slot, time: '200000', temp: 310.15, tags: ['add'], file: o.file, x, y });
  const seqs = res.store.seqs.map(s => (s.id !== res.rowId ? s : { ...s, runs: s.runs.map(r => (r.sacch === o.col && r.run === slot ? { ...r, src: { fileId, xCol: 1, yCol: 2 } } : r)) }));
  const uploads = new Map<string, Upload>([[fileId, { blob: new Blob([o.bytes as Uint8Array<ArrayBuffer>]), name: o.file }]]);
  return { store: { ...res.store, seqs }, uploads, rowId: res.rowId, fileId };
}

export function withStructure(store: Store, rowId: string, file: string, bytes: Uint8Array, format: 'pdb' | 'gro') {
  const fileId = newFileId(), id = 'st' + fileId.slice(1);
  const meta = { id, name: file, format, added: '2026-10-03', size: bytes.byteLength, atoms: 0, note: '', fileId };
  const s = lib.addStructure(store, rowId, meta);
  return { store: s, uploads: new Map<string, Upload>([[fileId, { blob: new Blob([bytes as Uint8Array<ArrayBuffer>]), name: file }]]), id, fileId };
}

/** An analysis made of every y column of `bytes` (like "+ analysis" with y columns = all). */
export function withAnalysis(store: Store, o: { name: string; col: string; slot?: Slot; type: string; file: string; bytes: Uint8Array; group?: string }) {
  const table = lib.parseTable(text(o.bytes));
  const fileId = newFileId();
  const curves = lib.pickCurves(table, table.head, { k: o.type, label: o.type, name: '', xLabel: 'x', yLabel: 'y', xCol: 1, yCols: 'all', xScale: 1, style: 'line', match: '' }, o.file)
    .map((c, j) => ({ ...c, src: { fileId, xCol: 1, yCol: j + 2, xScale: 1 } }));
  const res = lib.addExtra(store, { name: o.name, seq: o.name, group: o.group || '', desc: '', type: o.type, sacch: o.col, run: o.slot || 'a', time: '', file: o.file, curves });
  return { store: res.store, uploads: new Map<string, Upload>([[fileId, { blob: new Blob([o.bytes as Uint8Array<ArrayBuffer>]), name: o.file }]]), rowId: res.rowId, fileId };
}

export const snapshot = (s: Store) => stableStringify(s);

/** A lock provider shared by "tabs" in one test. */
export function sharedLocks(): LockProvider {
  const held = new Set<string>();
  return { acquire: async name => { if (held.has(name)) return null; held.add(name); return () => held.delete(name); } };
}

export const rdfFixture = new TextEncoder().encode([
  '@    title "Radial distribution"', '@ s0 legend "Na-O"', '@ s1 legend "Cl-N"',
  ...Array.from({ length: 40 }, (_, i) => { const r = i * 0.025; return r.toFixed(3) + ' ' + (1 + Math.exp(-(((r - 0.3) / 0.05) ** 2))).toFixed(5) + ' ' + (1 + 0.5 * Math.exp(-(((r - 0.35) / 0.05) ** 2))).toFixed(5); }),
].join('\n') + '\n');

/** A copy of a committed vault tree (e.g. a frozen old-format fixture) in memory, so the fixture itself is never written. */
export async function vaultFixture(dir: string): Promise<MemoryBackend> {
  const b = new MemoryBackend(), root = new URL('./fixtures/' + dir + '/', import.meta.url);
  const walk = async (rel: string): Promise<void> => {
    for (const e of readdirSync(new URL(rel, root), { withFileTypes: true })) {
      if (rel === '.matrix/' && e.name === 'cache') continue;
      if (e.isDirectory()) await walk(rel + e.name + '/');
      else await b.writeBytes(rel + e.name, new Uint8Array(readFileSync(new URL(rel + e.name, root))));
    }
  };
  await walk('');
  return b;
}
