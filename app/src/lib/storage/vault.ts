// Opening, creating and locking a vault, schema upgrades, and the projects in it.

import type { Column, Settings } from '../types';
import { DEFAULT_COLS } from '../pmf';
import type { StorageBackend } from './backend/types';
import { VaultIO } from './io';
import { begin, commit as commitEntry, applyCommitted, end, newEntry, recover, transact, type Recovered } from './journal';
import { stableStringify, uid } from './json';
import { compatibility, MIGRATIONS, newManifest, readManifest, writeManifest, type SchemaMigration } from './manifest';
import { MATRIX, isOsClutter, join, recordPaths, settingsPaths, vaultPaths, visiblePaths, rebase } from './path';
import { ProjectService } from './project';
import type { ColumnRecord, Manifest, ProjectRecord, RowRecord, WorkspaceRecord } from './records';
import { SCHEMA_VERSION } from './records';
import { settingsFiles } from './settings';
import { contentPath, emptyTrash, listTrash, deleteTrashItem, trashSteps, type TrashItem } from './trash';
import { dropIndex } from './index';

export interface LockProvider {
  /** Exclusive lock for the session, or null if another tab holds it. */
  acquire(name: string): Promise<(() => void) | null>;
}
export const noLock: LockProvider = { acquire: async () => () => {} };

export class NotAVaultError extends Error { constructor(msg = 'This folder is not a PMF Sequences vault (no .matrix/manifest.json).') { super(msg); this.name = 'NotAVaultError'; } }
export class NotEmptyError extends Error { constructor(msg = 'Pick an empty folder for a new vault.') { super(msg); this.name = 'NotEmptyError'; } }

const MODIFIED_THROTTLE_MS = 10 * 60 * 1000;

export async function isEmptyFolder(b: StorageBackend): Promise<boolean> {
  return (await b.list('')).every(e => isOsClutter(e.name));
}
export async function isVault(b: StorageBackend): Promise<boolean> { return !!(await b.stat(vaultPaths.manifest)); }

/**
 * `settings` left out is a new project: one column (DEFAULT_COLS) and no tags, stored as an empty list. Pass `{}` for a
 * project that keeps no settings of its own (one that comes from older data, where an absent tag list means FORMER_TAGS).
 */
export interface NewProjectOptions { desc?: string; cols?: Column[]; settings?: Partial<Settings>; id?: string }

export class Vault {
  readonly io: VaultIO;
  manifest: Manifest;
  readOnlyReason: string | null = null;
  recovered: Recovered[] = [];
  upgradedFrom: number | null = null;
  private release: (() => void) | null = null;
  private lastTouch = 0;

  private constructor(io: VaultIO, manifest: Manifest) { this.io = io; this.manifest = manifest; }

  get backend() { return this.io.backend; }
  get readOnly() { return this.io.readOnly; }
  get name() { return this.io.backend.label; }

  /** Creates a vault in an empty folder, with a first project. */
  static async create(backend: StorageBackend, opts: { projectName?: string; lock?: LockProvider; provenance?: { migratedFrom: string }; allowNonEmpty?: boolean } = {}): Promise<{ vault: Vault; projectId: string | null }> {
    if (!opts.allowNonEmpty && !(await isEmptyFolder(backend))) throw new NotEmptyError();
    const io = new VaultIO(backend);
    const m = newManifest(new Date(), opts.provenance);
    for (const d of [vaultPaths.records, vaultPaths.settings, vaultPaths.trash, vaultPaths.journal, vaultPaths.cache]) await backend.mkdir(d);
    await backend.writeText(vaultPaths.gitignore, 'cache/\n');
    await io.writeJson(vaultPaths.workspace, { type: 'workspace', projectOrder: [] } satisfies WorkspaceRecord);
    await writeManifest(io, m);
    const v = new Vault(io, m);
    await v.lock(opts.lock || noLock);
    const pid = opts.projectName != null ? (await v.createProject(opts.projectName)).id : null;
    return { vault: v, projectId: pid };
  }

  static async open(backend: StorageBackend, opts: { lock?: LockProvider; migrations?: SchemaMigration[] } = {}): Promise<Vault> {
    const io = new VaultIO(backend);
    const m = await readManifest(io);
    if (!m) throw new NotAVaultError();
    const c = compatibility(m);
    if (c === 'foreign') throw new NotAVaultError('This folder has a .matrix/manifest.json from another app or format.');
    const v = new Vault(io, m);
    if (c === 'newer') {
      io.readOnly = true;
      v.readOnlyReason = 'This vault was written by a newer version of PMF Sequences (format ' + m.schemaVersion + ', this app understands ' + SCHEMA_VERSION + '). It is open read-only so nothing it relies on is lost — update the app to edit it.';
      return v;
    }
    await v.lock(opts.lock || noLock);
    if (v.readOnly) return v;
    v.recovered = await recover(io);
    // Recovery can complete an interrupted upgrade, so the format is checked again afterwards.
    if (c === 'upgrade') {
      v.manifest = (await readManifest(io)) || m;
      if (compatibility(v.manifest) === 'upgrade') await v.upgrade(opts.migrations || MIGRATIONS);
      else v.upgradedFrom = m.schemaVersion;
    }
    if (!(await backend.stat(vaultPaths.gitignore))) await backend.writeText(vaultPaths.gitignore, 'cache/\n');
    return v;
  }

  private async lock(p: LockProvider) {
    const rel = await p.acquire('pmf-vault:' + this.manifest.vaultId);
    if (rel) { this.release = rel; return; }
    this.io.readOnly = true;
    this.readOnlyReason = 'This vault is open in another tab or window. It is shown read-only here so the two don’t overwrite each other.';
  }

  /** Older format → explicit tested steps; the affected .matrix files are backed up to the trash first. */
  private async upgrade(migrations: SchemaMigration[]) {
    const from = this.manifest.schemaVersion;
    let at = from;
    while (at < SCHEMA_VERSION) {
      const step = migrations.find(x => x.from === at);
      if (!step) throw new Error('No upgrade from vault format ' + at + ' to ' + SCHEMA_VERSION + '.');
      // The step only reads; its writes are applied at the commit point, after a backup of every path it changes.
      const writes = await step.run(this.io);
      const files = (await Promise.all(writes.map(async w => ((await this.backend.stat(w.path)) ? w.path : null)))).filter((f): f is string => !!f);
      const e = newEntry('schema-upgrade');
      const { steps, dir } = trashSteps({ type: 'schema-backup', id: 'v' + step.from, projectId: null, label: 'Backup before upgrading the vault format ' + step.from + ' → ' + step.to, originalPaths: [], records: { manifest: this.manifest }, parents: {} });
      // A crash before the commit point rolls the backup back (files, then their folders), leaving the vault as it was.
      e.wrote = [...steps.flatMap(s => (s.kind === 'write' ? [s.path] : [])), ...files.map(f => contentPath(dir, f))];
      e.mkdirs = [...new Set(e.wrote.flatMap(p => { const parts = p.split('/'), out: string[] = []; for (let i = parts.length - 1; i > 2; i--) out.push(parts.slice(0, i).join('/')); return out; }))].sort((a, b) => a.length - b.length);
      await begin(this.io, e);
      for (const s of steps) if (s.kind === 'write') await this.backend.writeText(s.path, s.text);
      for (const f of files) await this.backend.writeBytes(contentPath(dir, f), await this.backend.readBytes(f));
      this.manifest = { ...this.manifest, schemaVersion: step.to };
      e.records.push(...writes, { path: vaultPaths.manifest, text: stableStringify(this.manifest) });
      await commitEntry(this.io, e);
      await applyCommitted(this.io, e);
      await end(this.io, e);
      at = step.to;
    }
    this.upgradedFrom = from;
  }

  /** manifest.modified: first write of a session, then at most every 10 minutes (decision D35). */
  private touching: Promise<void> = Promise.resolve();
  private touchSkipped = false;
  touch(force = false) {
    if (this.readOnly) return;
    const now = Date.now();
    if (!force && this.lastTouch && now - this.lastTouch < MODIFIED_THROTTLE_MS) { this.touchSkipped = true; return; }
    this.lastTouch = now; this.touchSkipped = false;
    this.manifest = { ...this.manifest, modified: new Date(now).toISOString() };
    const m = this.manifest;
    // Serialized, so two writes of the manifest never overlap; close() waits for them.
    this.touching = this.touching.then(() => writeManifest(this.io, m, true)).catch(() => {});
  }

  // --- projects ---------------------------------------------------------------------------------
  async workspace(): Promise<WorkspaceRecord> {
    return (await this.io.readJson<WorkspaceRecord>(vaultPaths.workspace).catch(() => null)) || { type: 'workspace', projectOrder: [] };
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const b = this.backend;
    if (!(await b.stat(vaultPaths.records))) return [];
    const out = new Map<string, ProjectRecord>();
    for (const e of await b.list(vaultPaths.records)) {
      if (e.kind !== 'dir') continue;
      const p = await this.io.readJson<ProjectRecord>(join(vaultPaths.records, e.name, 'project.json')).catch(() => null);
      if (p && p.id) out.set(p.id, p);
    }
    const order = (await this.workspace()).projectOrder;
    const sorted = order.filter(id => out.has(id)).map(id => out.get(id)!);
    for (const p of [...out.values()].sort((a, c) => a.created.localeCompare(c.created))) if (!order.includes(p.id)) sorted.push(p);
    return sorted;
  }

  async createProject(name: string, o: NewProjectOptions = {}): Promise<ProjectRecord> {
    const id = o.id || uid('p');
    const cols = (o.cols && o.cols.length ? o.cols : DEFAULT_COLS).map(c => ({ ...c }));
    const project: ProjectRecord = { id, type: 'project', name: name.trim() || 'Untitled project', desc: o.desc || '', created: new Date().toISOString(), dir: visiblePaths.project(name.trim() || 'Untitled project', id), columnOrder: cols.map(c => c.k), pageOrder: [], rowOrder: [], imports: [] };
    const ws = await this.workspace();
    const e = newEntry('create-project');
    e.mkdirs.push(project.dir);
    e.records.push({ path: recordPaths.project(id), text: stableStringify(project) });
    for (const c of cols) e.records.push({ path: recordPaths.column(id, c.k), text: stableStringify({ id: c.k, type: 'column', label: c.label, short: c.short, name: c.name, light: c.light, dark: c.dark, dir: null } satisfies ColumnRecord) });
    for (const f of settingsFiles(id, o.settings ?? { tags: [] }, [])) if (f.value != null) e.records.push({ path: f.path, text: stableStringify(f.value) });
    e.records.push({ path: vaultPaths.workspace, text: stableStringify({ ...ws, projectOrder: ws.projectOrder.filter(x => x !== id).concat(id) }) });
    await transact(this.io, e, async () => { await this.backend.mkdir(project.dir); });
    this.touch();
    return project;
  }

  /** Row, run and page counts of a project, from its records (no files parsed). */
  async projectStats(pid: string): Promise<{ seqs: number; runs: number; pages: number }> {
    const count = async (dir: string) => ((await this.backend.stat(dir)) ? (await this.backend.list(dir)).filter(e => e.name.endsWith('.json')) : []);
    const rows = await count(recordPaths.rows(pid));
    let runs = 0;
    for (const r of rows) {
      const rec = await this.io.readJson<RowRecord>(join(recordPaths.rows(pid), r.name)).catch(() => null);
      runs += rec && Array.isArray(rec.runs) ? rec.runs.length : 0;
    }
    return { seqs: rows.length, runs, pages: (await count(recordPaths.pages(pid))).length };
  }

  /** Renames a project that isn't open (its folder follows). */
  async renameProject(pid: string, name: string, desc?: string) {
    const svc = await this.openProject(pid);
    try { await svc.rename(name, desc); } finally { await svc.close(); }
  }

  async openProject(pid: string, opts?: { notes?: 'background' | 'eager' }): Promise<ProjectService> {
    return ProjectService.open({ io: this.io, vaultId: this.manifest.vaultId, touch: () => this.touch() }, pid, opts);
  }

  /** Moves the whole project (visible folder, records, settings) to the trash. */
  async deleteProject(pid: string) {
    const p = await this.io.readJson<ProjectRecord>(recordPaths.project(pid));
    if (!p) return;
    const ws = await this.workspace();
    const e = newEntry('delete-project');
    e.records.push({ path: vaultPaths.workspace, text: stableStringify({ ...ws, projectOrder: ws.projectOrder.filter(x => x !== pid) }) });
    const paths = [p.dir, recordPaths.projectDir(pid), settingsPaths.dir(pid)];
    const present: string[] = [];
    for (const x of paths) if (await this.backend.stat(x)) present.push(x);
    e.after.push(...trashSteps({ type: 'project', id: pid, projectId: pid, label: 'Project ' + p.name, originalPaths: present, records: { project: p }, parents: { index: ws.projectOrder.indexOf(pid) } }).steps);
    await transact(this.io, e, async () => {});
    await dropIndex(this.backend, pid);
    this.touch();
  }

  /** Byte-for-byte copy of a project's folder and records under a new project ID. */
  async duplicateProject(pid: string, name?: string): Promise<ProjectRecord> {
    const b = this.backend;
    const p = await this.io.readJson<ProjectRecord>(recordPaths.project(pid));
    if (!p) throw new Error('no such project');
    const id = uid('p'), nm = name || p.name + ' copy', dir = visiblePaths.project(nm, id);
    const rb = (x: string) => rebase(x, p.dir, dir);
    const e = newEntry('duplicate-project');
    const copies: [string, string][] = [];
    const walk = async (d: string) => {
      if (!(await b.stat(d))) return;
      for (const en of await b.list(d)) {
        const src = join(d, en.name);
        if (en.kind === 'dir') await walk(src); else { copies.push([src, rb(src)]); e.wrote.push(rb(src)); }
      }
    };
    await walk(p.dir);
    e.mkdirs.push(dir);
    const np: ProjectRecord = { ...p, id, name: nm, dir, created: new Date().toISOString(), imports: p.imports.map(f => ({ ...f, path: rb(f.path) })) };
    e.records.push({ path: recordPaths.project(id), text: stableStringify(np) });
    for (const sub of ['columns', 'pages', 'rows'] as const) {
      const from = join(recordPaths.projectDir(pid), sub);
      if (!(await b.stat(from))) continue;
      for (const en of await b.list(from)) {
        if (en.kind !== 'file' || !en.name.endsWith('.json')) continue;
        const rec = await this.io.readJson<Record<string, unknown>>(join(from, en.name)).catch(() => null);
        if (!rec) continue;
        if (sub === 'rows') {
          const r = rec as unknown as RowRecord;
          r.dirs = { row: r.dirs.row && rb(r.dirs.row), cells: Object.fromEntries(Object.entries(r.dirs.cells || {}).map(([k, v]) => [k, rb(v)])) };
          r.analyses = r.analyses.map(a => ({ ...a, dir: a.dir && rb(a.dir) }));
          r.files = r.files.map(f => ({ ...f, path: rb(f.path) }));
        } else if (sub === 'columns') {
          const c = rec as unknown as ColumnRecord;
          c.dir = c.dir && rb(c.dir);
        }
        e.records.push({ path: join(recordPaths.projectDir(id), sub, en.name), text: stableStringify(rec) });
      }
    }
    if (await b.stat(settingsPaths.dir(pid))) for (const en of await b.list(settingsPaths.dir(pid))) {
      if (en.kind === 'file') e.records.push({ path: join(settingsPaths.dir(id), en.name), text: await b.readText(join(settingsPaths.dir(pid), en.name)) });
    }
    const ws = await this.workspace(), i = ws.projectOrder.indexOf(pid);
    const order = ws.projectOrder.filter(x => x !== id);
    order.splice(i >= 0 ? i + 1 : order.length, 0, id);
    e.records.push({ path: vaultPaths.workspace, text: stableStringify({ ...ws, projectOrder: order }) });
    await transact(this.io, e, async () => {
      await b.mkdir(dir);
      for (const [from, to] of copies) await b.writeBytes(to, await b.readBlob(from));
    });
    this.touch();
    return np;
  }

  async reorderProjects(order: string[]) {
    const ws = await this.workspace();
    await this.io.writeJson(vaultPaths.workspace, { ...ws, projectOrder: order });
  }

  // --- trash (vault-wide items: projects, schema backups) ------------------------------------------
  listTrash(): Promise<TrashItem[]> { return listTrash(this.backend); }
  deleteTrash(item: TrashItem) { return deleteTrashItem(this.backend, item.dir); }
  emptyTrash() { return emptyTrash(this.backend); }

  /** Restores a trashed project (other types go through the open ProjectService). */
  async restoreProject(item: TrashItem): Promise<{ where: 'original' | 'fallback'; message: string; projectId?: string }> {
    const m = item.manifest;
    if (!m || m.type !== 'project') throw new Error('not a project trash item');
    const b = this.backend;
    let free = true;
    for (const p of m.originalPaths) if (await b.stat(p)) free = false;
    const e = newEntry('restore-project');
    if (free) {
      for (const p of m.originalPaths) e.moves.push({ from: contentPath(item.dir, p), to: p });
      const ws = await this.workspace();
      const order = ws.projectOrder.filter(x => x !== m.id);
      const i = typeof m.parents.index === 'number' ? Math.min(m.parents.index, order.length) : order.length;
      order.splice(i, 0, m.id);
      e.records.push({ path: vaultPaths.workspace, text: stableStringify({ ...ws, projectOrder: order }) });
    } else {
      for (const p of m.originalPaths) e.moves.push({ from: contentPath(item.dir, p), to: join('_restored', item.name, p.startsWith(MATRIX) ? p.replace(/^\.matrix\//, 'matrix-') : p) });
    }
    e.after.push({ kind: 'remove', path: item.dir, recursive: true });
    await transact(this.io, e, async () => { for (const mv of e.moves) if (await b.stat(mv.from)) await this.io.move(mv.from, mv.to); });
    return free
      ? { where: 'original', message: m.label + ' is back.', projectId: m.id }
      : { where: 'fallback', message: m.label + ' couldn’t go back (its folder or ID is taken). Its files are in _restored/' + item.name + '.' };
  }

  async close() {
    if (this.touchSkipped) this.touch(true);
    await this.touching;
    if (this.release) { this.release(); this.release = null; }
  }
}
