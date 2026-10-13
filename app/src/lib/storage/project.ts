// The project service: the only thing the UI talks to for persistence.
//
// open()   manifest → records → index (rebuilt if stale) → matrix data;
//          notes load in the background; analysis files and structures on demand.
// commit() takes the next Store (plus any new original files) and queues it.
//          Note-only edits are debounced; everything else is written promptly.
//          One serialized queue; nothing is dropped when a write fails.

import type { Store, Curve, Run } from '../types';
import { parseTable, curveFromTable, runFromTable, getAnalyses } from '../seq';
import { StorageError } from './backend/types';
import { ExternalChangeError, CorruptFileError, type VaultIO } from './io';
import { newEntry, recover, transact } from './journal';
import { sha256Hex, stableStringify, uid } from './json';
import { cellNoteKey, curveKey, filesById, rowNoteKey, slotNumber, storeFrom, type DerivedData, type NoteState, type ProjectState } from './model';
import { parseNote } from './notes';
import { NOTE_FILE, nameKey, basename, conflictName, dirname, isConflictCopy, isInside, join, rebase, recordPaths, settingsPaths, stamp, visiblePaths } from './path';
import { makePlan, type Upload } from './plan';
import type { AnalysisRec, ColumnRecord, FileMeta, PageRecord, ProjectRecord, RowRecord, ScriptRec } from './records';
import { readSettings, settingsFiles } from './settings';
import { cachedScan, findConflicts, scanProject, writeIndex, type Conflict, type Scan } from './index';
import { readHeaderCache, readPmfCache, readScriptCache, readTableCache, readValuesCache, writeHeaderCache, writePmfCache, writeScriptCache, writeTableCache, writeValuesCache, pmfKey, type PmfEntry } from './cache';
import { parseGmxHeader, type GmxHeader } from '../gmxHeader';
import { contentPath, deleteTrashItem, listTrash, type TrashItem } from './trash';
import { describeUpload, namesIn, newFileId } from './files';

export interface ProjectContext {
  io: VaultIO;
  vaultId: string;
  /** Called after each successful write (updates manifest.modified, throttled). */
  touch: () => void;
}

export interface MissingFile { fileId: string; path: string; owner: string; kind: string; row: string }

export interface LoadReport {
  missing: MissingFile[];
  untracked: string[];
  conflicts: Conflict[];
  conflictCopies: string[];
  relinked: string[];
  warnings: string[];
}

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'read-only';
export interface ServiceStatus { save: SaveState; error: string | null; notices: string[] }

export type StorePatch = (s: Store) => Store;

const NOTE_DEBOUNCE_MS = 750;

async function listJson(io: VaultIO, dir: string): Promise<string[]> {
  if (!(await io.backend.stat(dir))) return [];
  return (await io.backend.list(dir)).filter(e => e.kind === 'file' && e.name.endsWith('.json') && !isConflictCopy(e.name)).map(e => join(dir, e.name));
}

export class ProjectService {
  readonly pid: string;
  private ctx: ProjectContext;
  state!: ProjectState;
  /** The persisted view (what disk holds), with derived data filled in. */
  store!: Store;
  data: DerivedData = { pmf: new Map(), curves: new Map(), missing: new Set() };
  report: LoadReport = { missing: [], untracked: [], conflicts: [], conflictCopies: [], relinked: [], warnings: [] };
  notesLoaded = false;
  notesReady: Promise<void> = Promise.resolve();
  verified: Promise<void> = Promise.resolve();
  private uiHasNotes = false;
  private scan: Scan = { dirs: [], files: {} };
  private pending: Store | null = null;
  private uploads = new Map<string, Upload>();
  private srcPatch = { runs: new Map<string, NonNullable<Run['src']>>(), curves: new Map<string, NonNullable<Curve['src']>>() };
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private needsRecovery = false;
  private status: ServiceStatus = { save: 'saved', error: null, notices: [] };
  private statusListeners = new Set<(s: ServiceStatus) => void>();
  private storeListeners = new Set<(p: StorePatch) => void>();
  private verifyTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(ctx: ProjectContext, pid: string) { this.ctx = ctx; this.pid = pid; }

  get io() { return this.ctx.io; }
  get readOnly() { return this.ctx.io.readOnly; }
  get projectDir() { return this.state.project.dir; }

  static async open(ctx: ProjectContext, pid: string, opts: { notes?: 'background' | 'eager' } = {}): Promise<ProjectService> {
    const s = new ProjectService(ctx, pid);
    await s.load(opts.notes || 'background');
    return s;
  }

  // --- events ------------------------------------------------------------------------------
  onStatus(cb: (s: ServiceStatus) => void) { this.statusListeners.add(cb); cb(this.status); return () => this.statusListeners.delete(cb); }
  /** Patches for the UI's Store: loaded notes and analysis data, adopted external edits, reloads. */
  onStore(cb: (p: StorePatch) => void) { this.storeListeners.add(cb); return () => this.storeListeners.delete(cb); }
  private setStatus(p: Partial<ServiceStatus>) {
    this.status = { ...this.status, ...p };
    for (const cb of this.statusListeners) cb(this.status);
  }
  private notice(msg: string) { this.setStatus({ notices: this.status.notices.concat(msg).slice(-6) }); }
  clearNotices() { this.setStatus({ notices: [] }); }
  private emit(p: StorePatch) { for (const cb of this.storeListeners) cb(p); }
  getStatus() { return this.status; }
  hasPendingWrites() { return !!this.pending || this.status.save === 'saving'; }

  // --- loading -------------------------------------------------------------------------------
  private async load(notesMode: 'background' | 'eager') {
    const io = this.io, b = io.backend, pid = this.pid;
    const warnings: string[] = [];
    const project = await io.readJson<ProjectRecord>(recordPaths.project(pid));
    if (!project) throw new Error('project ' + pid + ' has no record');
    if (!Array.isArray(project.imports)) project.imports = [];
    if (project.scripts !== undefined) project.scripts = (Array.isArray(project.scripts) ? project.scripts : []).filter(k => typeof k?.id === 'string' && typeof k.file?.path === 'string');
    const columns = new Map<string, ColumnRecord>(), pages = new Map<string, PageRecord>(), rows = new Map<string, RowRecord>();
    const unreadable = new Set<string>();
    const readAll = async <T extends { id: string }>(dir: string, into: Map<string, T>, onBad?: (id: string) => void) => {
      for (const p of await listJson(io, dir)) {
        try { const r = await io.readJson<T>(p); if (r && r.id) into.set(r.id, r); } catch (e) {
          if (!(e instanceof CorruptFileError)) throw e;
          warnings.push(e.message);
          onBad?.(basename(p).replace(/\.json$/, ''));
        }
      }
    };
    await readAll(recordPaths.columns(pid), columns);
    await readAll(recordPaths.pages(pid), pages);
    await readAll(recordPaths.rows(pid), rows, id => unreadable.add(id));
    for (const r of rows.values()) normRow(r);
    const st = await readSettings(io, pid);
    warnings.push(...st.warnings);
    this.state = { project, columns, pages, rows, settings: st.settings, ignored: st.ignored, notes: new Map(), unreadable };
    if (unreadable.size) this.setStatus({ save: 'error', error: 'Some record files are damaged; saving is paused so nothing is overwritten. Fix or restore them, then reload.' });

    // Index: use it when it was built from these records, else rebuild from a scan.
    const cached = await cachedScan(b, pid);
    this.scan = cached || (await scanProject(b, project.dir));
    if (!cached && !io.readOnly) await writeIndex(b, pid, this.scan);
    await this.reconcileWithScan(warnings);
    await this.loadPmf();
    this.store = storeFrom(this.state, this.data);
    this.notesLoaded = false; this.uiHasNotes = false;
    this.notesReady = this.loadNotes();
    // Eager: the notes are in this.store before anyone sees it, so a Store derived from it has them.
    if (notesMode === 'eager') { await this.notesReady; this.uiHasNotes = true; }
    // A cached index may be stale for the visible tree; a full scan follows.
    this.verified = cached ? this.notesReady.then(() => this.verify()) : Promise.resolve();
    this.report.warnings = warnings;
  }

  /** Relink folders found by ID, find missing and untracked files and conflicts. */
  private async reconcileWithScan(warnings: string[]) {
    const scan = this.scan, state = this.state;
    const conflicts = findConflicts(scan);
    const dirSet = new Set(scan.dirs.map(d => d.path));
    const byId = (scope: string, id: string, parent?: string) => scan.dirs.filter(d => d.scope === scope && d.id === id && (parent == null || d.parent === parent));
    const relinked: string[] = [];
    const changedRows = new Set<string>(), changedCols = new Set<string>();
    const relink = (from: string, to: string) => {
      relinked.push(from + ' → ' + to);
      for (const r of state.rows.values()) {
        let hit = false;
        const rb = (p: string) => { const q = rebase(p, from, to); if (q !== p) hit = true; return q; };
        if (r.dirs.row) r.dirs.row = rb(r.dirs.row);
        for (const k of Object.keys(r.dirs.cells)) r.dirs.cells[k] = rb(r.dirs.cells[k]);
        for (const a of r.analyses) if (a.dir) a.dir = rb(a.dir);
        for (const f of r.files) f.path = rb(f.path);
        if (hit) changedRows.add(r.id);
      }
      for (const c of state.columns.values()) if (c.dir && isInside(c.dir, from)) { c.dir = rebase(c.dir, from, to); changedCols.add(c.id); }
    };
    const resolve = (path: string | null, scope: string, id: string, parent?: string) => {
      if (!path || dirSet.has(path)) return;
      const hits = byId(scope, id, parent);
      if (hits.length === 1) relink(path, hits[0].path);
      else if (hits.length > 1) warnings.push('Two folders claim ' + scope + ' ' + id + ': ' + hits.map(h => h.path).join(', '));
    };
    for (const c of state.columns.values()) resolve(c.dir, 'column', c.id);
    for (const r of state.rows.values()) {
      resolve(r.dirs.row, 'row', r.id);
      for (const [k, p] of Object.entries(r.dirs.cells)) { const col = state.columns.get(k); resolve(p, 'cell', r.id, col?.dir || undefined); }
      for (const a of r.analyses) resolve(a.dir, 'analysis', a.id);
    }
    if ((changedRows.size || changedCols.size) && !this.io.readOnly && !conflicts.length) {
      const e = newEntry('relink');
      for (const id of changedRows) e.records.push({ path: recordPaths.row(this.pid, id), text: stableStringify(state.rows.get(id)) });
      for (const id of changedCols) e.records.push({ path: recordPaths.column(this.pid, id), text: stableStringify(state.columns.get(id)) });
      await transact(this.io, e, async () => {});
    }
    // A missing original found elsewhere in the project folder — same name, and the
    // same size and SHA-256 when they are known — is followed (the record is updated).
    {
      const known = new Set<string>();
      for (const r of state.rows.values()) for (const f of r.files) known.add(f.path);
      for (const f of [...state.project.imports, ...(state.project.scripts || []).map(k => k.file)]) known.add(f.path);
      const ign = new Set(state.ignored), byName = new Map<string, string[]>();
      for (const p of Object.keys(scan.files)) {
        if (known.has(p) || ign.has(p) || basename(p) === NOTE_FILE || isConflictCopy(basename(p))) continue;
        const k = nameKey(basename(p));
        byName.set(k, (byName.get(k) || []).concat(p));
      }
      const taken = new Set<string>(), rowsHit = new Set<string>();
      for (const r of state.rows.values()) for (const f of r.files) {
        if (scan.files[f.path]) continue;
        const cands = (byName.get(nameKey(basename(f.path))) || []).filter(p => !taken.has(p) && (!f.sha256 || scan.files[p][0] === f.size));
        if (cands.length !== 1) continue;
        const p = cands[0];
        if (f.sha256) { if ((await sha256Hex(await this.io.backend.readBytes(p).catch(() => new Uint8Array()))) !== f.sha256) continue; }
        else { const bytes = await this.io.backend.readBytes(p).catch(() => null); if (!bytes) continue; f.size = bytes.byteLength; f.sha256 = await sha256Hex(bytes); }
        relinked.push(f.path + ' → ' + p);
        f.path = p; taken.add(p); rowsHit.add(r.id);
      }
      if (rowsHit.size && !this.io.readOnly && !conflicts.length) {
        const e = newEntry('relink-files');
        for (const id of rowsHit) e.records.push({ path: recordPaths.row(this.pid, id), text: stableStringify(state.rows.get(id)) });
        await transact(this.io, e, async () => {});
      }
    }
    // Missing originals.
    const missing: MissingFile[] = [];
    this.data.missing = new Set();
    for (const r of state.rows.values()) for (const f of r.files) if (!scan.files[f.path]) { missing.push({ fileId: f.id, path: f.path, owner: f.owner, kind: f.kind, row: r.id }); this.data.missing.add(f.id); }
    for (const { file: f } of state.project.scripts || []) if (!scan.files[f.path]) { missing.push({ fileId: f.id, path: f.path, owner: f.owner, kind: f.kind, row: '' }); this.data.missing.add(f.id); }
    // Untracked files: in the visible tree, referenced by nothing, not notes, not ignored.
    const tracked = new Set<string>();
    for (const r of state.rows.values()) for (const f of r.files) tracked.add(f.path);
    for (const f of [...state.project.imports, ...(state.project.scripts || []).map(k => k.file)]) tracked.add(f.path);
    const ignored = new Set(state.ignored);
    const untracked: string[] = [], copies: string[] = [];
    for (const p of Object.keys(scan.files).sort()) {
      if (tracked.has(p) || ignored.has(p)) continue;
      if (isConflictCopy(basename(p))) { copies.push(p); continue; }
      if (basename(p) === NOTE_FILE) continue;
      untracked.push(p);
    }
    this.report = { ...this.report, missing, untracked, conflicts, conflictCopies: copies, relinked };
    if (conflicts.length) this.setStatus({ save: 'error', error: 'Two folders share one ID (' + conflicts.map(c => c.paths.join(' + ')).join('; ') + '). Saving is paused until one is removed; then reload.' });
  }

  private async loadPmf() {
    const b = this.io.backend, files = filesById(this.state);
    const cache = await readPmfCache(b, this.pid);
    const next: Record<string, PmfEntry> = {};
    let changed = false;
    for (const r of this.state.rows.values()) for (const run of r.runs) {
      const f = files.get(run.file);
      if (!f || this.data.missing.has(f.id)) continue;
      const key = pmfKey(f.sha256, run.parse.xCol, run.parse.yCol);
      let e = cache[key];
      if (!e) {
        try {
          const { x, y } = runFromTable(parseTable(await b.readText(f.path)), run.parse.xCol, run.parse.yCol);
          e = { source: { sha256: f.sha256, parser: 'pmf-xy@1', xCol: run.parse.xCol, yCol: run.parse.yCol }, x, y };
          changed = true;
        } catch (err) {
          this.report.warnings.push('Could not read ' + f.path + ': ' + String((err as Error).message || err));
          this.data.missing.add(f.id);
          continue;
        }
      }
      next[key] = e;
      this.data.pmf.set(f.id, { x: e.x, y: e.y });
    }
    if ((changed || Object.keys(cache).length !== Object.keys(next).length) && !this.io.readOnly) await writePmfCache(b, this.pid, next);
  }

  private async loadNotes() {
    const notes = new Map<string, NoteState>();
    const read = async (key: string, dir: string | null, recId?: string) => {
      if (!dir) return;
      const path = join(dir, NOTE_FILE);
      if (!this.scan.files[path] && !(await this.io.backend.stat(path))) return;
      const raw = await this.io.readText(path);
      if (raw == null) return;
      const n = parseNote(raw);
      notes.set(key, { id: n.meta.id || recId || uid('n'), path, text: n.text });
    };
    for (const r of this.state.rows.values()) {
      await read(rowNoteKey(r.id), r.dirs.row, r.notes.row);
      for (const [k, d] of Object.entries(r.dirs.cells)) await read(cellNoteKey(k, r.id), d, r.notes.cells[k]);
    }
    this.state.notes = notes;
    this.notesLoaded = true;
    this.store = { ...this.store, notes: storeFrom(this.state, this.data).notes };
    const loaded = this.store.notes;
    this.emit(s => ({ ...s, notes: { cell: { ...loaded.cell, ...s.notes.cell }, row: { ...loaded.row, ...s.notes.row } } }));
  }

  /** The UI has merged the loaded notes into its Store. */
  notesMerged() { this.uiHasNotes = true; }

  /** Full rescan of the visible tree; refreshes the report and the index. */
  async verify() {
    const fresh = await scanProject(this.io.backend, this.state.project.dir);
    const before = JSON.stringify(this.scan);
    this.scan = fresh;
    const w: string[] = [];
    const wasMissing = new Set(this.data.missing);
    await this.reconcileWithScan(w);
    this.report.warnings.push(...w);
    if (!this.io.readOnly && JSON.stringify(fresh) !== before) await writeIndex(this.io.backend, this.pid, fresh);
    const nowMissing = this.data.missing;
    if ([...nowMissing].some(id => !wasMissing.has(id)) || [...wasMissing].some(id => !nowMissing.has(id))) {
      await this.loadPmf();
      const view = storeFrom(this.state, this.data);
      this.store = { ...view, notes: this.store.notes };
      this.emit(s => ({ ...s, seqs: mergeSeqState(s.seqs, view.seqs) }));
    }
  }

  private scheduleVerify() {
    if (this.verifyTimer) clearTimeout(this.verifyTimer);
    this.verifyTimer = setTimeout(() => { this.verifyTimer = null; this.verify().catch(() => {}); }, 1500);
  }

  // --- on-demand data ----------------------------------------------------------------------------
  /** Loads the curves of one analysis (parsed from its originals, via the cache). */
  async loadAnalysis(extraId: string): Promise<void> {
    const b = this.io.backend, files = filesById(this.state);
    let a: AnalysisRec | undefined;
    for (const r of this.state.rows.values()) { a = r.analyses.find(x => x.id === extraId); if (a) break; }
    if (!a) return;
    const tables = new Map<string, ReturnType<typeof parseTable> | null>();
    for (const c of a.curves) {
      const src = { fileId: c.file, ...c.parse };
      if (this.data.curves.has(curveKey(src))) continue;
      const f = files.get(c.file);
      if (!f || this.data.missing.has(f.id)) continue;
      if (!tables.has(f.id)) {
        let t = await readTableCache(b, f.sha256);
        if (!t) {
          try { t = parseTable(await b.readText(f.path)); if (!this.io.readOnly) await writeTableCache(b, f.sha256, t); } catch { t = null; }
        }
        tables.set(f.id, t);
      }
      const t = tables.get(f.id);
      if (!t) continue;
      try { this.data.curves.set(curveKey(src), curveFromTable(t, c.parse.xCol, c.parse.yCol, c.parse.xScale)); } catch { /* bad column → stays empty */ }
    }
    const fill = (s: Store): Store => ({
      ...s, seqs: s.seqs.map(q => (!q.extras.some(e => e.id === extraId) ? q : {
        ...q, extras: q.extras.map(e => (e.id !== extraId ? e : {
          ...e, curves: e.curves.map(c => {
            if (!c.src || c.state === 'missing') return c;
            const d = this.data.curves.get(curveKey(c.src));
            return d ? { ...c, ...d, state: undefined } : c;
          }),
        })),
      })),
    });
    this.store = fill(this.store);
    this.emit(fill);
  }

  /** What saving `next` would do, without doing it: the moves and what goes to the trash (R7's preview). */
  async previewPlan(next: Store): Promise<{ moves: { from: string; to: string }[]; trashed: string[] }> {
    await this.flush();
    const plan = await makePlan({ backend: this.io.backend, pid: this.pid, prev: this.state, next: this.patchIncoming(next), uploads: this.uploads, missing: this.data.missing });
    return { moves: plan.content.flatMap(op => (op.kind === 'move' ? [{ from: op.from, to: op.to }] : [])), trashed: plan.trashed };
  }

  /** An original file's bytes (structures, downloads). */
  async readUpload(fileId: string): Promise<Blob> {
    const f = filesById(this.state).get(fileId) || this.state.project.imports.find(x => x.id === fileId);
    if (!f) throw new StorageError('not-found', fileId, 'no such file in this project');
    return this.io.backend.readBlob(f.path);
  }
  /** The GROMACS header of an original (R1e): from the cache, else from its first 8 KB. Reconstructed files have none; an unreadable original throws. */
  async provenance(fileId: string): Promise<GmxHeader | null> {
    const f = filesById(this.state).get(fileId), b = this.io.backend;
    if (!f || f.origin === 'reconstructed' || !f.sha256) return null;
    const hit = await readHeaderCache(b, f.sha256);
    if (hit !== undefined) return hit;
    // An original that can't be read throws: that says nothing about what the file contains.
    const h = parseGmxHeader(await (await b.readBlob(f.path)).slice(0, 8192).text());
    if (!this.io.readOnly) await writeHeaderCache(b, f.sha256, h);
    return h;
  }
  fileMeta(fileId: string): FileMeta | undefined { return filesById(this.state).get(fileId) || this.state.project.imports.find(x => x.id === fileId); }
  /**
   * A script's source, the SHA-256 of the bytes on disk now (trust and runs compare it with the record's), and its
   * functions (R3b): from the cache by that SHA-256, else read by `discover` and cached.
   */
  async scriptInfo<T>(fileId: string, discover: (source: string) => Promise<T>): Promise<{ source: string; size: number; sha256: string; fns: T }> {
    // A script just added is on disk once the pending save is.
    if (!this.fileMeta(fileId)) await this.flush();
    const f = this.fileMeta(fileId), b = this.io.backend;
    if (!f) throw new StorageError('not-found', fileId, 'no such file in this project');
    const bytes = await b.readBytes(f.path), sha256 = await sha256Hex(bytes), source = new TextDecoder().decode(bytes);
    let fns = (await readScriptCache(b, sha256)) as T | undefined;
    if (fns === undefined) {
      fns = await discover(source);
      if (!this.io.readOnly) await writeScriptCache(b, sha256, fns);
    }
    return { source, size: bytes.byteLength, sha256, fns };
  }
  /** Script results kept between sessions (R3c). */
  scriptValues() { return readValuesCache(this.io.backend, this.pid); }
  async saveScriptValues(entries: Record<string, unknown>) { if (!this.io.readOnly) await writeValuesCache(this.io.backend, this.pid, entries); }

  // --- writing ----------------------------------------------------------------------------------
  /** Queue the next Store. `uploads` maps new file IDs (already referenced in `next`) to their bytes. */
  commit(next: Store, uploads?: Map<string, Upload>) {
    if (uploads) for (const [k, v] of uploads) this.uploads.set(k, v);
    const prevTarget = this.pending || this.store;
    this.pending = this.patchIncoming(next);
    const notesOnly = !uploads?.size && prevTarget.seqs === next.seqs && prevTarget.cols === next.cols && prevTarget.pages === next.pages
      && prevTarget.vis === next.vis && prevTarget.lit === next.lit && prevTarget.settings === next.settings && prevTarget.scripts === next.scripts;
    if (this.readOnly) { this.setStatus({ save: 'read-only' }); return; }
    this.setStatus({ save: 'pending' });
    this.schedule(notesOnly ? NOTE_DEBOUNCE_MS : 0);
  }

  private patchIncoming(next: Store): Store {
    let out = next;
    if (this.srcPatch.runs.size || this.srcPatch.curves.size) {
      out = {
        ...out, seqs: out.seqs.map(s => ({
          ...s,
          runs: s.runs.map(r => (!r.src && this.srcPatch.runs.has(r.id) ? { ...r, src: this.srcPatch.runs.get(r.id) } : r)),
          extras: s.extras.map(e => ({ ...e, curves: e.curves.map(c => (!c.src && this.srcPatch.curves.has(c.id) ? { ...c, src: this.srcPatch.curves.get(c.id) } : c)) })),
        })),
      };
    }
    // Before the UI has the loaded notes, it can't have meant to delete them.
    if (!this.uiHasNotes) out = { ...out, notes: { cell: { ...this.store.notes.cell, ...out.notes.cell }, row: { ...this.store.notes.row, ...out.notes.row } } };
    return out;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.enqueue(); }, ms);
  }

  private enqueue(): Promise<void> {
    this.chain = this.chain.then(() => this.persist()).catch(() => {});
    return this.chain;
  }

  /** Write everything pending now (note debounce skipped). Resolves when the queue is idle. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pending && !this.readOnly) await this.enqueue();
    else await this.chain;
  }

  /** After reconnecting or fixing a write error: finish/undo any half-done operation and write again. */
  async retry(): Promise<void> { this.needsRecovery = true; await this.flush(); }

  private async persist(): Promise<void> {
    if (this.readOnly) { this.setStatus({ save: 'read-only' }); return; }
    if (this.report.conflicts.length || this.state.unreadable.size) return;
    await this.notesReady;
    const target = this.pending;
    if (!target) return;
    this.setStatus({ save: 'saving', error: null });
    try {
      if (this.needsRecovery) {
        const rec = await recover(this.io);
        this.needsRecovery = false;
        if (rec.length) { await this.reloadState(); }
      }
      const plan = await makePlan({ backend: this.io.backend, pid: this.pid, prev: this.state, next: target, uploads: this.uploads, missing: this.data.missing });
      // Read-before-write: a note or record changed outside the app is never overwritten.
      for (const p of plan.overwrites) {
        if (await this.io.changedOnDisk(p)) { await this.externalChange(p, plan.entry.records.find(r => r.path === p)?.text ?? null); return; }
      }
      if (!plan.empty) {
        await transact(this.io, plan.entry, async () => {
          for (const op of plan.content) {
            if (op.kind === 'move') await this.io.move(op.from, op.to);
            else if (op.kind === 'write') await this.io.writeBytes(op.path, op.data);
            else await this.io.writeText(op.path, op.text);
          }
        });
      }
      this.afterPersist(plan, target);
      if (plan.trashed.length) this.notice('Moved to trash: ' + plan.trashed.join(', '));
      if (!plan.empty) { this.ctx.touch(); this.scheduleVerify(); }
      if (this.pending === target) this.pending = null;
      this.setStatus({ save: this.pending ? 'pending' : 'saved', error: null });
      if (this.pending) this.schedule(0);
    } catch (e) {
      this.needsRecovery = true;
      if (e instanceof ExternalChangeError) { await this.externalChange(e.path); return; }
      const perm = e instanceof StorageError && (e.code === 'permission' || e.code === 'not-found');
      this.setStatus({ save: 'error', error: perm ? 'Can’t write to the vault folder (' + (e as Error).message + '). Your changes are kept in this tab — reconnect to save them.' : 'Saving failed: ' + String((e as Error).message || e) + '. Your changes are kept in this tab.' });
      throw e;
    }
  }

  private afterPersist(plan: Awaited<ReturnType<typeof makePlan>>, target: Store) {
    this.state = plan.state;
    for (const [k, v] of plan.newSrc.runs) this.srcPatch.runs.set(k, v);
    for (const [k, v] of plan.newSrc.curves) this.srcPatch.curves.set(k, v);
    const files = filesById(this.state);
    for (const [id, up] of [...this.uploads]) if (files.has(id)) { if (up.placeholder) this.data.missing.add(id); this.uploads.delete(id); }
    // Derived data for what was just written comes from the Store that wrote it.
    for (const s of target.seqs) {
      for (const r of s.runs) {
        const src = r.src || plan.newSrc.runs.get(r.id);
        if (src && r.x.length && !this.data.pmf.has(src.fileId)) this.data.pmf.set(src.fileId, { x: r.x, y: r.y });
        if (src) this.data.missing.delete(src.fileId);
      }
      for (const e of s.extras) for (const c of e.curves) {
        const src = c.src || plan.newSrc.curves.get(c.id);
        if (src && c.x.length) this.data.curves.set(curveKey(src), { x: c.x, y: c.y, axis: c.axis, names: c.names });
      }
    }
    this.store = this.patchIncoming(target);
    // Keep the PMF cache warm for new runs (step 4: cache after the commit).
    void this.refreshPmfCache();
  }

  private async refreshPmfCache() {
    if (this.io.readOnly) return;
    const files = filesById(this.state), entries: Record<string, PmfEntry> = {};
    for (const r of this.state.rows.values()) for (const run of r.runs) {
      const f = files.get(run.file), d = f && this.data.pmf.get(f.id);
      if (f && d) entries[pmfKey(f.sha256, run.parse.xCol, run.parse.yCol)] = { source: { sha256: f.sha256, parser: 'pmf-xy@1', xCol: run.parse.xCol, yCol: run.parse.yCol }, x: d.x, y: d.y };
    }
    await writePmfCache(this.io.backend, this.pid, entries);
  }

  /** A text file changed on disk while we wanted to write it (spec §13). */
  private async externalChange(path: string, localText: string | null = null) {
    const io = this.io;
    const isNote = basename(path) === NOTE_FILE;
    const disk = await io.backend.readText(path).catch(() => null);
    if (isNote) {
      const key = [...this.state.notes.entries()].find(([, n]) => n.path === path)?.[0];
      const local = key ? noteTextOf(this.pending || this.store, key) : null;
      const copy = join(dirname(path), conflictName(NOTE_FILE));
      if (local != null) await io.backend.writeText(copy, local + '\n');
      // Adopt the version on disk.
      if (disk != null) await io.readText(path);
      const text = disk != null ? parseNote(disk).text : '';
      if (key) {
        const n = this.state.notes.get(key)!;
        this.state.notes.set(key, { ...n, text });
        const setText = (s: Store): Store => withNoteText(s, key, text);
        this.store = setText(this.store);
        if (this.pending) this.pending = setText(this.pending);
        this.emit(setText);
      }
      this.notice('A note changed outside the app (' + path + '). The version on disk is shown' + (local != null ? '; yours was saved as ' + basename(copy) : '') + '.');
      this.setStatus({ save: this.pending ? 'pending' : 'saved', error: null });
      if (this.pending) this.schedule(0);
      return;
    }
    // Records or settings: keep both — ours as a conflict copy next to it — and stop until a reload.
    let copy: string | null = null;
    if (localText != null) {
      copy = join(dirname(path), conflictName(basename(path)));
      await io.backend.writeText(copy, localText).catch(() => { copy = null; });
    }
    this.setStatus({ save: 'error', error: path + ' was changed outside the app. Nothing was overwritten' + (copy ? '; this tab’s version was saved as ' + basename(copy) : '') + '. Reload from disk to continue (your unsaved state is kept in this tab).' });
  }

  /** Re-check tracked text files (window focus). Adopts outside edits when there's nothing local. */
  async checkExternal(): Promise<'none' | 'notes' | 'records'> {
    if (this.status.save === 'saving') return 'none';
    let kind: 'none' | 'notes' | 'records' = 'none';
    for (const [key, n] of this.state.notes) {
      if (!(await this.io.changedOnDisk(n.path))) continue;
      const local = this.pending ? noteTextOf(this.pending, key) : null;
      if (local != null && local !== n.text) continue; // our edit wins the next write → conflict copy then
      const raw = await this.io.readText(n.path);
      const text = raw == null ? '' : parseNote(raw).text;
      this.state.notes.set(key, { ...n, text });
      const setText = (s: Store) => withNoteText(s, key, text);
      this.store = setText(this.store);
      if (this.pending) this.pending = setText(this.pending);
      this.emit(setText);
      kind = 'notes';
    }
    const recs = [recordPaths.project(this.pid), ...[...this.state.rows.keys()].map(id => recordPaths.row(this.pid, id)), ...[...this.state.columns.keys()].map(id => recordPaths.column(this.pid, id)), ...[...this.state.pages.keys()].map(id => recordPaths.page(this.pid, id)), settingsPaths.settings(this.pid)];
    for (const p of recs) if (this.io.known.has(p) && (await this.io.changedOnDisk(p))) { kind = 'records'; break; }
    if (kind === 'records' && !this.pending) await this.reload();
    return kind;
  }

  private async reloadState() {
    this.io.known.clear();
    this.data = { pmf: new Map(), curves: new Map(), missing: new Set() };
    await this.load('eager');
  }

  /** Re-read everything from disk and replace the UI's Store. Pending edits are dropped only if `discard`. */
  async reload(opts: { discard?: boolean } = {}) {
    if (this.pending && !opts.discard) throw new Error('unsaved changes would be lost');
    this.pending = null;
    this.uploads.clear();
    await this.reloadState();
    const view = this.store;
    this.uiHasNotes = true;
    this.setStatus({ save: 'saved', error: this.report.conflicts.length ? this.status.error : null });
    this.emit(() => view);
  }

  // --- project-level settings that aren't part of the Store ---------------------------------------
  async setIgnored(paths: string[]) {
    await this.flush();
    this.state.ignored = [...new Set(paths)].sort();
    const f = settingsFiles(this.pid, this.state.settings, this.state.ignored).find(x => x.path === settingsPaths.ignored(this.pid))!;
    if (f.value == null) await this.io.remove(f.path); else await this.io.writeJson(f.path, f.value);
    await this.reconcileWithScan([]);
  }

  /** An untracked file to attach: returns an upload entry that moves it instead of copying. */
  async adoptUntracked(path: string): Promise<{ fileId: string; upload: Upload }> {
    const blob = await this.io.backend.readBlob(path);
    return { fileId: uid('f'), upload: { blob, name: basename(path), existingPath: path } };
  }

  async rename(name: string, desc?: string) {
    await this.flush();
    const p = this.state.project, to = visiblePaths.project(name, this.pid);
    const records: { path: string; text: string }[] = [];
    const nextProject: ProjectRecord = { ...p, name, desc: desc ?? p.desc, dir: to };
    const rows = new Map<string, RowRecord>(), cols = new Map<string, ColumnRecord>();
    if (to !== p.dir) {
      for (const r of this.state.rows.values()) {
        const rb = (x: string) => rebase(x, p.dir, to);
        const nr: RowRecord = { ...r, dirs: { row: r.dirs.row && rb(r.dirs.row), cells: Object.fromEntries(Object.entries(r.dirs.cells).map(([k, v]) => [k, rb(v)])) }, analyses: r.analyses.map(a => ({ ...a, dir: a.dir && rb(a.dir) })), files: r.files.map(f => ({ ...f, path: rb(f.path) })) };
        rows.set(r.id, nr);
        records.push({ path: recordPaths.row(this.pid, r.id), text: stableStringify(nr) });
      }
      for (const c of this.state.columns.values()) { const nc = { ...c, dir: c.dir && rebase(c.dir, p.dir, to) }; cols.set(c.id, nc); records.push({ path: recordPaths.column(this.pid, c.id), text: stableStringify(nc) }); }
      nextProject.imports = p.imports.map(f => ({ ...f, path: rebase(f.path, p.dir, to) }));
      if (p.scripts) nextProject.scripts = p.scripts.map(k => ({ ...k, file: { ...k.file, path: rebase(k.file.path, p.dir, to) } }));
    }
    records.push({ path: recordPaths.project(this.pid), text: stableStringify(nextProject) });
    const e = newEntry('rename-project');
    if (to !== p.dir) e.moves.push({ from: p.dir, to });
    e.records = records;
    await transact(this.io, e, async () => { if (to !== p.dir && (await this.io.backend.stat(p.dir))) await this.io.move(p.dir, to); });
    this.state.project = nextProject;
    if (rows.size) this.state.rows = rows;
    if (cols.size) this.state.columns = cols;
    for (const [k, n] of this.state.notes) this.state.notes.set(k, { ...n, path: rebase(n.path, p.dir, to) });
    this.scan = await scanProject(this.io.backend, to);
    this.ctx.touch();
  }

  /** Keeps an imported JSON file in `{project}/_imports/` and lists it in the project record (decision D13). */
  async keepImport(blob: Blob, name: string): Promise<FileMeta> {
    await this.flush();
    const dir = visiblePaths.imports(this.state.project.dir);
    const meta = await describeUpload(newFileId(), { blob, name }, 'import-json', this.pid, dir, await namesIn(this.io.backend, dir));
    const project: ProjectRecord = { ...this.state.project, imports: this.state.project.imports.concat(meta) };
    const e = newEntry('keep-import');
    e.wrote.push(meta.path);
    e.records.push({ path: recordPaths.project(this.pid), text: stableStringify(project) });
    await transact(this.io, e, async () => { await this.io.writeBytes(meta.path, blob); });
    this.state.project = project;
    this.ctx.touch();
    return meta;
  }

  /** Stops timers and listeners. Pending writes are flushed first. */
  async close() {
    await this.flush().catch(() => {});
    if (this.timer) clearTimeout(this.timer);
    if (this.verifyTimer) clearTimeout(this.verifyTimer);
    this.timer = this.verifyTimer = null;
    this.statusListeners.clear();
    this.storeListeners.clear();
  }

  // --- identical content (R6) -------------------------------------------------------------------------
  /**
   * A lookup from SHA-256 to where identical content already is in this project:
   * its records first ("Identical to run 2 of WRWYCR × HA (file.xvg)"), then its
   * trash ("A deleted copy is in the trash (…)"). Built once, used for a batch.
   */
  async sameContent(): Promise<(sha: string) => string | null> {
    const st = this.state, types = getAnalyses(st.settings);
    const col = (k: string) => st.columns.get(k)?.label || k;
    const seen = new Map<string, string>();
    for (const r of st.rows.values()) for (const f of r.files) {
      if (!f.sha256 || seen.has(f.sha256)) continue;
      const run = r.runs.find(x => x.file === f.id), a = r.analyses.find(x => x.curves.some(c => c.file === f.id));
      const where = run ? 'run ' + slotNumber(run.slot) + ' of ' + r.name + ' × ' + col(run.column)
        : a ? 'the ' + (types.find(t => t.k === a.type)?.label || a.type) + ' on run ' + slotNumber(a.slot) + ' of ' + r.name + ' × ' + col(a.column)
        : null;
      seen.set(f.sha256, where ? 'Identical to ' + where + ' (' + f.name + ')' : 'Identical to the structure ' + f.name + ' of ' + r.name);
    }
    const hashes = (v: unknown, out: Set<string>): Set<string> => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.sha256 === 'string' && o.sha256) out.add(o.sha256);
        for (const x of Object.values(o)) hashes(x, out);
      }
      return out;
    };
    const trashed = new Map<string, string>();
    for (const t of await this.listTrash()) if (t.manifest) for (const h of hashes(t.manifest.records, new Set())) if (!trashed.has(h)) trashed.set(h, 'A deleted copy is in the trash (' + t.manifest.label + ')');
    return sha => (sha ? seen.get(sha) || trashed.get(sha) || null : null);
  }
  async findSame(sha: string): Promise<string | null> { return (await this.sameContent())(sha); }

  // --- trash ----------------------------------------------------------------------------------------
  async listTrash(): Promise<TrashItem[]> { return (await listTrash(this.io.backend)).filter(t => !t.manifest || t.manifest.projectId === this.pid || t.manifest.projectId == null); }
  async deleteTrash(item: TrashItem) { await deleteTrashItem(this.io.backend, item.dir); }

  /** Puts a trashed item back; falls back to `_restored/<item>/` when its place is taken or its parent is gone. */
  async restore(item: TrashItem): Promise<{ where: 'original' | 'fallback'; message: string }> {
    await this.flush();
    if (this.pending) throw new Error('save pending changes first');
    const m = item.manifest;
    if (!m) throw new Error('this trash item has no manifest');
    const b = this.io.backend, st = this.state, pid = this.pid;
    const projDir = st.project.dir;
    const free = async (paths: string[]) => { for (const p of paths) if (await b.stat(p)) return false; return true; };
    const records = (m.records || {}) as Record<string, unknown>;
    const parents = (m.parents || {}) as Record<string, unknown>;
    const e = newEntry('restore');
    const back = () => { for (const p of m.originalPaths) e.moves.push({ from: contentPath(item.dir, p), to: p }); };
    const project: ProjectRecord = JSON.parse(JSON.stringify(st.project));
    const putRow = (r: RowRecord) => e.records.push({ path: recordPaths.row(pid, r.id), text: stableStringify(r) });
    const insertAt = (list: string[], id: string, i: unknown) => { const n = typeof i === 'number' && i >= 0 ? Math.min(i, list.length) : list.length; if (!list.includes(id)) list.splice(n, 0, id); };
    const row = (id: unknown) => (typeof id === 'string' ? st.rows.get(id) : undefined);
    const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
    let ok = false;

    if (m.type === 'page') {
      const p = clone(records.page as PageRecord);
      if (st.pages.has(p.id)) p.id = uid('pg');
      p.rows = p.rows.filter(id => st.rows.has(id));
      insertAt(project.pageOrder, p.id, parents.index);
      e.records.push({ path: recordPaths.page(pid, p.id), text: stableStringify(p) });
      ok = true;
    } else if (m.type === 'row') {
      const r = clone(records.row as RowRecord);
      if (!st.rows.has(r.id) && (await free(m.originalPaths))) {
        back(); putRow(r);
        insertAt(project.rowOrder, r.id, parents.index);
        for (const pg of (parents.pages as { id: string; index: number }[]) || []) {
          const page = st.pages.get(pg.id);
          if (page && !page.rows.includes(r.id)) { const np = clone(page); insertAt(np.rows, r.id, pg.index); e.records.push({ path: recordPaths.page(pid, np.id), text: stableStringify(np) }); }
        }
        ok = true;
      }
    } else if (m.type === 'column') {
      const c = clone(records.column as ColumnRecord);
      if (!st.columns.has(c.id) && (await free(m.originalPaths))) {
        back();
        insertAt(project.columnOrder, c.id, parents.index);
        e.records.push({ path: recordPaths.column(pid, c.id), text: stableStringify(c) });
        const parts = (records.parts || {}) as Record<string, { runs: RowRecord['runs']; analyses: RowRecord['analyses']; files: FileMeta[]; literature: RowRecord['literature'][string]; visibility: RowRecord['visibility'][string]; cellDir: string | null; note: { id: string } | null }>;
        for (const [rid, part] of Object.entries(parts)) {
          const r0 = st.rows.get(rid);
          if (!r0) continue;
          const r = clone(r0);
          r.runs.push(...part.runs.filter(x => !r.runs.some(y => y.id === x.id)));
          r.analyses.push(...part.analyses.filter(x => !r.analyses.some(y => y.id === x.id)));
          r.files.push(...part.files.filter(x => !r.files.some(y => y.id === x.id)));
          if (part.literature && part.literature.length) r.literature[c.id] = part.literature;
          if (part.visibility && Object.keys(part.visibility).length) r.visibility[c.id] = part.visibility;
          if (part.cellDir) r.dirs.cells[c.id] = part.cellDir;
          if (part.note) r.notes.cells[c.id] = part.note.id;
          putRow(r);
        }
        ok = true;
      }
    } else if (m.type === 'script') {
      // An older version restored beside the current one becomes its own record, at the end.
      const k = clone(records.script as ScriptRec), list = (project.scripts = project.scripts || []);
      if (await free(m.originalPaths)) {
        back();
        if (list.some(x => x.id === k.id)) list.push({ ...k, id: uid('k') }); else list.splice(Math.min(Number(parents.index) || 0, list.length), 0, k);
        ok = true;
      }
    } else if (['run', 'analysis', 'structure', 'curve', 'note', 'literature'].includes(m.type)) {
      const r0 = row(parents.row);
      const colOk = parents.column == null || st.columns.has(String(parents.column));
      if (r0 && colOk && (await free(m.originalPaths))) {
        const r = clone(r0);
        const file = records.file as FileMeta | null | undefined;
        const files = (records.files as FileMeta[] | undefined) || (file ? [file] : []);
        const addFiles = () => r.files.push(...files.filter(f => !r.files.some(x => x.id === f.id)));
        // A run or analysis kept as a record only (its file went on to something else, e.g. after a type change, R7) can't come back.
        const owned = (fid: string) => r.runs.some(x => x.file === fid) || r.analyses.some(a => a.curves.some(c => c.file === fid));
        if (m.type === 'run') {
          const run = records.run as RowRecord['runs'][number];
          if (!owned(run.file) && !r.runs.some(x => x.id === run.id || (x.column === run.column && x.slot === run.slot))) { r.runs.push(run); addFiles(); if (!r.dirs.cells[run.column] && file) r.dirs.cells[run.column] = dirname(file.path); ok = true; }
        } else if (m.type === 'analysis') {
          const a = records.analysis as AnalysisRec;
          if (!a.curves.some(c => owned(c.file)) && !r.analyses.some(x => x.id === a.id || (x.type === a.type && x.column === a.column && x.slot === a.slot))) { r.analyses.push(a); addFiles(); if (!r.dirs.cells[a.column] && a.dir) r.dirs.cells[a.column] = dirname(a.dir); ok = true; }
        } else if (m.type === 'structure') {
          const s = records.structure as RowRecord['structures'][number];
          if (!r.structures.some(x => x.id === s.id)) { r.structures.push(s); addFiles(); if (!r.dirs.row && file) r.dirs.row = dirname(file.path); ok = true; }
        } else if (m.type === 'curve') {
          const a = r.analyses.find(x => x.id === records.analysis);
          const c = records.curve as AnalysisRec['curves'][number];
          if (a && !a.curves.some(x => x.id === c.id)) { a.curves.push(c); addFiles(); ok = true; }
        } else if (m.type === 'note') {
          const key = String(records.key), id = String(records.id);
          const p = key.split(':');
          if (p[0] === 'row') { if (!r.notes.row) { r.notes.row = id; r.dirs.row = r.dirs.row || dirname(m.originalPaths[0]); ok = true; } }
          else if (!r.notes.cells[p[1]]) { r.notes.cells[p[1]] = id; r.dirs.cells[p[1]] = r.dirs.cells[p[1]] || dirname(m.originalPaths[0]); ok = true; }
        } else if (m.type === 'literature') {
          const ref = records.ref as RowRecord['literature'][string][number], k = String(records.column);
          if (!(r.literature[k] || []).some(x => x.id === ref.id)) { r.literature[k] = (r.literature[k] || []).concat(ref); ok = true; }
        }
        if (ok) { back(); putRow(r); }
      }
    }

    let where: 'original' | 'fallback' = 'original';
    if (!ok) {
      where = 'fallback';
      e.moves = [];
      e.records = [];
      const fb = join(visiblePaths.restored(projDir), item.name);
      for (const p of m.originalPaths) {
        const rel = p.startsWith(projDir + '/') ? p.slice(projDir.length + 1) : basename(p);
        e.moves.push({ from: contentPath(item.dir, p), to: join(fb, rel) });
      }
      if (!m.originalPaths.length) e.wrote.push(join(fb, 'restored-record.json'));
    } else if (stableStringify(project) !== stableStringify(st.project)) {
      e.records.push({ path: recordPaths.project(pid), text: stableStringify(project) });
    }
    e.after.push({ kind: 'remove', path: item.dir, recursive: true });
    await transact(this.io, e, async () => {
      for (const mv of e.moves) if (await b.stat(mv.from)) await this.io.move(mv.from, mv.to);
      if (where === 'fallback' && !m.originalPaths.length) await b.writeText(e.wrote[0], stableStringify(m));
    });
    await this.reload({ discard: true });
    return where === 'original'
      ? { where, message: m.label + ' is back in its place.' }
      : { where, message: m.label + ' couldn’t go back to its original place (it is taken, or what it belonged to is gone). Its files are in ' + join(visiblePaths.restored(projDir), item.name) + ' — attach them from Untracked files.' };
  }

  stampNow() { return stamp(); }
}

function normRow(r: RowRecord) {
  r.dirs = r.dirs || { row: null, cells: {} };
  r.dirs.cells = r.dirs.cells || {};
  r.notes = r.notes || { cells: {} };
  r.notes.cells = r.notes.cells || {};
  for (const k of ['runs', 'analyses', 'structures', 'files'] as const) if (!Array.isArray(r[k])) (r as unknown as Record<string, unknown[]>)[k] = [];
  r.literature = r.literature || {};
  r.visibility = r.visibility || {};
}

function noteTextOf(s: Store, key: string): string {
  const p = key.split(':');
  return (p[0] === 'row' ? s.notes.row[p[1]] : s.notes.cell[p[1] + '_' + p[2]]) || '';
}

function withNoteText(s: Store, key: string, text: string): Store {
  const p = key.split(':');
  const notes = { cell: { ...s.notes.cell }, row: { ...s.notes.row } };
  if (p[0] === 'row') { if (text) notes.row[p[1]] = text; else delete notes.row[p[1]]; }
  else { const k = p[1] + '_' + p[2]; if (text) notes.cell[k] = text; else delete notes.cell[k]; }
  return { ...s, notes };
}

/** Takes missing/loaded state and PMF data from `view` into the UI's rows, keeping everything else. */
function mergeSeqState(ui: Store['seqs'], view: Store['seqs']): Store['seqs'] {
  const by = new Map(view.map(s => [s.id, s]));
  return ui.map(s => {
    const v = by.get(s.id);
    if (!v) return s;
    const runs = new Map(v.runs.map(r => [r.id, r]));
    return { ...s, runs: s.runs.map(r => { const w = runs.get(r.id); return w ? { ...r, x: w.x, y: w.y, state: w.state } : r; }) };
  });
}
