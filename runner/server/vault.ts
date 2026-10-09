// The vault reader (R6a, T32): PMF Sequences' own code reads the vault through a backend whose every write
// throws, so gmx-cypher cannot change it. Vault.open and ProjectService.open write (a lock, the index, an
// upgrade), so only their read steps are repeated here, each with PMF Sequences' functions.

import { realpathSync } from 'node:fs';
import { NodeBackend } from '../../app/scripts/node-backend';
import { DEFAULT_ANALYSES, DEFAULT_SETTINGS } from '../../app/src/lib/seq';
import { StorageError, type StorageBackend } from '../../app/src/lib/storage/backend/types';
import { VaultIO } from '../../app/src/lib/storage/io';
import { APP_ID, compatibility, readManifest } from '../../app/src/lib/storage/manifest';
import { storeFrom, type ProjectState } from '../../app/src/lib/storage/model';
import { join, recordPaths, vaultPaths } from '../../app/src/lib/storage/path';
import type { ColumnRecord, PageRecord, ProjectRecord, RowRecord } from '../../app/src/lib/storage/records';
import { readSettings } from '../../app/src/lib/storage/settings';
import type { AnalysisType, Store } from '../../app/src/lib/types';

/** Reads go to PMF Sequences' NodeBackend; every write throws. */
export class ReadOnlyBackend implements StorageBackend {
  readonly label: string;
  private readonly inner: StorageBackend;
  constructor(inner: StorageBackend) { this.inner = inner; this.label = inner.label; }
  stat(p: string) { return this.inner.stat(p); }
  list(p: string) { return this.inner.list(p); }
  readBytes(p: string) { return this.inner.readBytes(p); }
  readText(p: string) { return this.inner.readText(p); }
  readBlob(p: string) { return this.inner.readBlob(p); }
  private refuse(p: string): Promise<never> { return Promise.reject(new StorageError('read-only', p, 'gmx-cypher never writes to the vault: ' + p)); }
  writeBytes(p: string, _data?: Blob | Uint8Array) { return this.refuse(p); }
  writeText(p: string, _text?: string) { return this.refuse(p); }
  mkdir(p: string) { return this.refuse(p); }
  move(p: string, _to?: string) { return this.refuse(p); }
  remove(p: string, _opts?: { recursive?: boolean }) { return this.refuse(p); }
}

export interface VaultView { path: string; io: VaultIO; schema: number; compat: 'ok' | 'upgrade' }

/** Schemas 1–3 (T32): PMF Sequences upgrades older ones itself when it opens them. */
export async function openVault(path: string): Promise<VaultView> {
  const root = realpathSync(path), io = new VaultIO(new ReadOnlyBackend(new NodeBackend(root)));
  io.readOnly = true;
  const m = await readManifest(io).catch(() => null);
  if (!m) throw new Error(path + ' is not a PMF Sequences vault (no .matrix/manifest.json)');
  const compat = m.app === APP_ID ? compatibility(m) : 'foreign';
  if (compat === 'foreign') throw new Error(path + ' is not a PMF Sequences vault (its manifest names ' + (m.app || '?') + ' / ' + (m.format || '?') + ')');
  if (compat === 'newer') throw new Error(path + ' was made by a newer PMF Sequences (schema ' + m.schemaVersion + '); gmx-cypher reads schemas 1–3');
  return { path: root, io, schema: m.schemaVersion, compat };
}

/** The projects in workspace order, as Vault.listProjects lists them. */
export async function listProjects(v: VaultView): Promise<ProjectRecord[]> {
  const b = v.io.backend;
  if (!(await b.stat(vaultPaths.records))) return [];
  const all = new Map<string, ProjectRecord>();
  for (const e of await b.list(vaultPaths.records)) {
    if (e.kind !== 'dir') continue;
    const p = await v.io.readJson<ProjectRecord>(join(vaultPaths.records, e.name, 'project.json')).catch(() => null);
    if (p?.id) all.set(p.id, p);
  }
  const order = ((await v.io.readJson<{ projectOrder: string[] }>(vaultPaths.workspace).catch(() => null))?.projectOrder) || [];
  return [...order.filter(id => all.has(id)).map(id => all.get(id)!), ...[...all.values()].filter(p => !order.includes(p.id)).sort((a, c) => a.created.localeCompare(c.created))];
}

/** As ProjectService's normRow: older rows may lack lists and maps. */
function normRow(r: RowRecord) {
  r.dirs = r.dirs || { row: null, cells: {} };
  r.dirs.cells = r.dirs.cells || {};
  r.notes = r.notes || { cells: {} };
  for (const k of ['runs', 'analyses', 'structures', 'files'] as const) if (!Array.isArray(r[k])) (r as unknown as Record<string, unknown[]>)[k] = [];
  r.literature = r.literature || {};
  r.visibility = r.visibility || {};
}

/** One project's records and settings, and its Store by storeFrom (curves are not read: the landing preview needs none). */
export async function readProject(v: VaultView, pid: string): Promise<{ state: ProjectState; store: Store }> {
  const project = await v.io.readJson<ProjectRecord>(recordPaths.project(pid));
  if (!project) throw new Error('no project ' + pid + ' in ' + v.path);
  const read = async <T extends { id: string }>(dir: string) => {
    const m = new Map<string, T>();
    if (!(await v.io.backend.stat(dir))) return m;
    for (const e of await v.io.backend.list(dir)) if (e.kind === 'file' && e.name.endsWith('.json')) {
      const r = await v.io.readJson<T>(join(dir, e.name)).catch(() => null);
      if (r?.id) m.set(r.id, r);
    }
    return m;
  };
  const rows = await read<RowRecord>(recordPaths.rows(pid));
  rows.forEach(normRow);
  const st = await readSettings(v.io, pid);
  const state: ProjectState = {
    project: { ...project, imports: project.imports || [] }, columns: await read<ColumnRecord>(recordPaths.columns(pid)), pages: await read<PageRecord>(recordPaths.pages(pid)),
    rows, settings: st.settings, ignored: st.ignored, notes: new Map(), unreadable: new Set(),
  };
  return { state, store: storeFrom(state, { pmf: new Map(), curves: new Map(), missing: new Set() }) };
}

export interface ProjectSummary {
  id: string; name: string; dir: string;
  columns: { k: string; label: string }[];
  rows: { id: string; name: string; seq: string; group: string; runs: Record<string, string[]>; analyses: Record<string, { type: string; slot: string }[]> }[];
  settings: { pattern: string; pathPattern: string; analyses: AnalysisType[] };
}

/** What the GUI shows of a project: columns, rows with their runs and analyses per column, the patterns and analysis types. */
export function projectSummary({ state, store }: { state: ProjectState; store: Store }): ProjectSummary {
  const s = state.settings;
  return {
    id: state.project.id, name: state.project.name, dir: state.project.dir,
    columns: store.cols.map(c => ({ k: c.k, label: c.label })),
    rows: store.seqs.map(q => {
      const runs: Record<string, string[]> = {}, analyses: Record<string, { type: string; slot: string }[]> = {};
      for (const r of q.runs) (runs[r.sacch] ||= []).push(r.run);
      for (const e of q.extras) (analyses[e.sacch] ||= []).push({ type: e.type, slot: e.run });
      for (const k of Object.keys(runs)) runs[k].sort();
      return { id: q.id, name: q.name, seq: q.seq, group: q.group, runs, analyses };
    }),
    settings: { pattern: s.pattern ?? DEFAULT_SETTINGS.pattern, pathPattern: s.pathPattern ?? DEFAULT_SETTINGS.pathPattern, analyses: s.analyses ?? DEFAULT_ANALYSES },
  };
}
