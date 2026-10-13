// Desired-state reconciliation (decision D25): compares the persisted
// ProjectState with the Store the UI wants, and produces one journaled
// operation that makes the disk match:
//
//   content phase  : folder renames/moves that follow names, file moves that
//                    follow owners, new originals written, notes written
//   commit point   : changed record and settings files
//   after commit   : removed entities moved to trash, emptied folders removed
//
// Nothing here writes; the service executes the plan through the journal.

import type { Curve, Extra, Run, Seq, Store } from '../types';
import { splitSettings } from '../seq';
import type { StorageBackend } from './backend/types';
import { describeUpload, namesIn, type PendingUpload } from './files';
import { newEntry, type JournalEntry, type Step } from './journal';
import { stableStringify, uid } from './json';
import { cellNoteKey, filesById, litOf, rowNoteKey, slotNumber, visOf, type NoteState, type ProjectState } from './model';
import { formatNote, type NoteType } from './notes';
import { basename, dirname, join, recordPaths, rebase, uniqueName, visiblePaths, NOTE_FILE } from './path';
import type { AnalysisRec, ColumnRecord, CurveRec, FileKind, FileMeta, PageRecord, ProjectRecord, RowRecord, RunRec, ScriptRec, StructureRec } from './records';
import { curveDisplay, dashOf, pinsOf, scriptFnsOf, typeFromOf } from './records';
import { curvesXvg, groupCurves, reconstructedName, runXvg } from './reconstruct';
import { settingsFiles } from './settings';
import { trashSteps, type TrashManifest } from './trash';

export type Upload = PendingUpload & {
  /** An untracked file already in the project folder: it is moved into place, not copied. */
  existingPath?: string;
  /** The bytes no longer exist (e.g. a structure the prototype lost): the record is kept and points at where the file belongs; it shows as missing until the file is put there. */
  placeholder?: { size: number };
};

export type ContentOp =
  | { kind: 'move'; from: string; to: string }
  | { kind: 'write'; path: string; data: Blob }
  | { kind: 'note'; path: string; text: string };

export interface Plan {
  state: ProjectState;
  entry: JournalEntry;
  content: ContentOp[];
  /** Files reconstructed during this plan, so the UI's next Store can carry their IDs. */
  newSrc: { runs: Map<string, NonNullable<Run['src']>>; curves: Map<string, NonNullable<Curve['src']>> };
  /** Human labels of what went to the trash. */
  trashed: string[];
  /** Note and record paths about to be overwritten (checked for external edits first). */
  overwrites: string[];
  empty: boolean;
}

export interface PlanInput {
  backend: StorageBackend;
  pid: string;
  prev: ProjectState;
  next: Store;
  uploads: Map<string, Upload>;
  /** File IDs whose original is not on disk (never moved). */
  missing: Set<string>;
  /** Text for reconstructed files' "Source:" line. */
  reconstructSource?: string;
}

const seqKeyLabel = (s: { name: string }) => s.name || '(unnamed)';

function cloneSeq(s: Seq): Seq {
  return { ...s, runs: s.runs.map(r => ({ ...r })), extras: s.extras.map(e => ({ ...e, curves: e.curves.map(c => ({ ...c })) })), structures: s.structures.map(x => ({ ...x })) };
}

export async function makePlan(inp: PlanInput): Promise<Plan> {
  const { backend: b, pid, prev, missing } = inp;
  const uploads = new Map(inp.uploads);
  const projDir = prev.project.dir;
  const prevFiles = filesById(prev);
  const seqs = inp.next.seqs.map(cloneSeq);
  const next: Store = { ...inp.next, seqs };
  const newSrc: Plan['newSrc'] = { runs: new Map(), curves: new Map() };
  const source = inp.reconstructSource || 'parsed values kept by the previous version of PMF Sequences';

  // --- 0. originals that only exist as parsed numbers are reconstructed --------------
  for (const s of seqs) {
    for (const r of s.runs) {
      if (r.src && r.src.fileId) continue;
      const id = uid('f');
      uploads.set(id, { blob: new Blob([runXvg(r, source)], { type: 'text/plain' }), name: reconstructedName(r.file, 'run-' + slotNumber(r.run)), origin: 'reconstructed', reconstructedFrom: source });
      r.src = { fileId: id, xCol: 1, yCol: 2 };
      newSrc.runs.set(r.id, r.src);
    }
    for (const e of s.extras) {
      const bare = e.curves.filter(c => !(c.src && c.src.fileId));
      for (const g of groupCurves(bare)) {
        const id = uid('f');
        uploads.set(id, { blob: new Blob([curvesXvg(g, e.type + ' analysis ' + e.id, source)], { type: 'text/plain' }), name: reconstructedName(g[0].file || '', e.type + '-run-' + slotNumber(e.run)), origin: 'reconstructed', reconstructedFrom: source });
        g.forEach((c, j) => { c.src = { fileId: id, xCol: 1, yCol: j + 2, xScale: 1 }; newSrc.curves.set(c.id, c.src); });
      }
    }
  }

  // --- 1. what exists next, and what it needs on disk --------------------------------
  const colsNext = new Map(next.cols.map(c => [c.k, c]));
  const rowsNext = new Map(seqs.map(s => [s.id, s]));
  const noteText = (key: string): string => {
    const p = key.split(':');
    const t = p[0] === 'row' ? (next.notes.row || {})[p[1]] : (next.notes.cell || {})[p[1] + '_' + p[2]];
    return t && t.length ? t : '';
  };
  const prevRowOf = new Map<string, RowRecord>(prev.rows);
  const prevAna = new Map<string, AnalysisRec>(), prevAnaRow = new Map<string, string>();
  for (const r of prev.rows.values()) for (const a of r.analyses) { prevAna.set(a.id, a); prevAnaRow.set(a.id, r.id); }

  const colDir = (k: string) => {
    const c = colsNext.get(k);
    if (!c) throw new Error('a run or analysis refers to column "' + k + '", which no longer exists');
    return visiblePaths.column(projDir, c.label, k);
  };
  const rowDir = (s: Seq) => visiblePaths.row(projDir, s.name, s.id);
  const cellDir = (s: Seq, k: string) => visiblePaths.cell(colDir(k), s.name, s.id);
  const anaDir = (s: Seq, e: Extra) => visiblePaths.analysis(cellDir(s, e.sacch), e.type, slotNumber(e.run), e.id);

  const cellNeeded = (s: Seq, k: string) => s.runs.some(r => r.sacch === k) || s.extras.some(e => e.sacch === k) || !!noteText(cellNoteKey(k, s.id));
  const rowNeeded = (s: Seq) => s.structures.length > 0 || !!noteText(rowNoteKey(s.id));

  // Files referenced next, with their owners.
  interface Ref { fileId: string; kind: FileKind; owner: string; row: Seq | null; dir: () => string }
  const refs = new Map<string, Ref>();
  for (const k of next.scripts || []) refs.set(k.fileId, { fileId: k.fileId, kind: 'script', owner: pid, row: null, dir: () => visiblePaths.scripts(projDir) });
  for (const s of seqs) {
    for (const r of s.runs) refs.set(r.src!.fileId, { fileId: r.src!.fileId, kind: 'pmf-xvg', owner: r.id, row: s, dir: () => cellDir(s, r.sacch) });
    for (const e of s.extras) for (const c of e.curves) if (c.src) refs.set(c.src.fileId, { fileId: c.src.fileId, kind: 'analysis-xvg', owner: e.id, row: s, dir: () => anaDir(s, e) });
    for (const x of s.structures) if (x.fileId) refs.set(x.fileId, { fileId: x.fileId, kind: 'structure', owner: x.id, row: s, dir: () => rowDir(s) });
  }

  // --- 2. folders that stop being needed: keep them if they hold anything we don't track
  const trackedIn = (dir: string): Set<string> => {
    const t = new Set<string>();
    for (const f of prevFiles.values()) if (dirname(f.path) === dir) t.add(basename(f.path));
    for (const n of prev.notes.values()) if (dirname(n.path) === dir) t.add(NOTE_FILE);
    for (const a of prevAna.values()) if (a.dir && dirname(a.dir) === dir) t.add(basename(a.dir));
    for (const r of prev.rows.values()) for (const p of Object.values(r.dirs.cells)) if (dirname(p) === dir) t.add(basename(p));
    return t;
  };
  const hasLeftovers = async (dir: string | null | undefined): Promise<boolean> => {
    if (!dir) return false;
    const tracked = trackedIn(dir);
    return (await namesIn(b, dir)).some(n => !tracked.has(n));
  };

  const keepRowDir = new Map<string, boolean>(), keepCell = new Map<string, boolean>(), keepCol = new Map<string, boolean>();
  const unneeded: string[] = [];
  for (const s of seqs) {
    const pr = prevRowOf.get(s.id);
    keepRowDir.set(s.id, rowNeeded(s) || (!!pr?.dirs.row && (await hasLeftovers(pr.dirs.row))));
    if (pr?.dirs.row && !keepRowDir.get(s.id)) unneeded.push(pr.dirs.row);
    const cols = new Set<string>([...s.runs.map(r => r.sacch), ...s.extras.map(e => e.sacch), ...Object.keys(pr?.dirs.cells || {})]);
    for (const k of colsNext.keys()) if (noteText(cellNoteKey(k, s.id))) cols.add(k);
    for (const k of cols) {
      if (!colsNext.has(k)) continue;
      const p = pr?.dirs.cells[k];
      const keep = cellNeeded(s, k) || (!!p && (await hasLeftovers(p)));
      keepCell.set(s.id + '|' + k, keep);
      if (p && !keep) unneeded.push(p);
    }
  }
  for (const c of next.cols) {
    const pc = prev.columns.get(c.k);
    const anyCell = seqs.some(s => keepCell.get(s.id + '|' + c.k));
    const keep = anyCell || (!!pc?.dir && (await hasLeftovers(pc.dir)));
    keepCol.set(c.k, keep);
    if (pc?.dir && !keep) unneeded.push(pc.dir);
  }

  // --- 3. folder renames/moves, top-down; later paths are rebased through them ----------
  const moves: { from: string; to: string }[] = [];
  const cur = (p: string) => moves.reduce((acc, m) => rebase(acc, m.from, m.to), p);
  const pre = (p: string) => moves.reduceRight((acc, m) => rebase(acc, m.to, m.from), p);
  const content: ContentOp[] = [];
  const move = (from: string, to: string) => { if (from === to) return; content.push({ kind: 'move', from, to }); moves.push({ from, to }); };

  for (const c of next.cols) { const pc = prev.columns.get(c.k); if (pc?.dir && keepCol.get(c.k)) move(cur(pc.dir), colDir(c.k)); }
  for (const s of seqs) {
    const pr = prevRowOf.get(s.id);
    if (!pr) continue;
    if (pr.dirs.row && keepRowDir.get(s.id)) move(cur(pr.dirs.row), rowDir(s));
    for (const [k, p] of Object.entries(pr.dirs.cells)) if (colsNext.has(k) && keepCell.get(s.id + '|' + k)) move(cur(p), cellDir(s, k));
  }
  for (const s of seqs) for (const e of s.extras) {
    const pa = prevAna.get(e.id);
    if (pa?.dir) move(cur(pa.dir), anaDir(s, e));
  }

  // --- 4. originals: move to their owner's folder, or write new ones --------------------
  const taken = new Map<string, Set<string>>();
  const takenIn = async (dir: string) => {
    if (!taken.has(dir)) taken.set(dir, new Set(await namesIn(b, pre(dir))));
    return taken.get(dir)!;
  };
  const metas = new Map<string, FileMeta>();
  const wrote: string[] = [];
  for (const ref of refs.values()) {
    const want = ref.dir();
    const up = uploads.get(ref.fileId), old = prevFiles.get(ref.fileId);
    if (old && !up) {
      const p = cur(old.path);
      let path = p;
      if (dirname(p) !== want && !missing.has(old.id)) {
        const names = await takenIn(want);
        const name = uniqueName(basename(p), names);
        names.add(name);
        path = join(want, name);
        move(p, path);
      }
      metas.set(ref.fileId, { ...old, path, owner: ref.owner, kind: ref.kind });
    } else if (up) {
      const names = await takenIn(want);
      if (up.existingPath) {
        const meta = await describeUpload(ref.fileId, up, ref.kind, ref.owner, want, names);
        const from = cur(up.existingPath);
        if (dirname(from) === want) meta.path = from; else { names.add(basename(meta.path)); move(from, meta.path); }
        metas.set(ref.fileId, meta);
      } else if (up.placeholder) {
        const meta = await describeUpload(ref.fileId, up, ref.kind, ref.owner, want, names);
        names.add(basename(meta.path));
        metas.set(ref.fileId, { ...meta, size: up.placeholder.size, sha256: '' });
      } else {
        const meta = await describeUpload(ref.fileId, up, ref.kind, ref.owner, want, names);
        names.add(basename(meta.path));
        content.push({ kind: 'write', path: meta.path, data: up.blob });
        wrote.push(meta.path);
        metas.set(ref.fileId, meta);
      }
    }
  }

  // --- 5. notes -------------------------------------------------------------------------
  const notes = new Map<string, NoteState>();
  const overwrites: string[] = [];
  const noteFor = (key: string, s: Seq, k: string | null) => {
    const text = noteText(key);
    if (!text) return;
    const dir = k ? cellDir(s, k) : rowDir(s);
    const path = join(dir, NOTE_FILE);
    const pn = prev.notes.get(key), pr = prevRowOf.get(s.id);
    const id = pn?.id || (k ? pr?.notes.cells[k] : pr?.notes.row) || uid('n');
    if (pn) {
      const pc = cur(pn.path);
      if (pc !== path) move(pc, path);
    }
    if (!pn || pn.text !== text) {
      const type: NoteType = k ? 'cell-note' : 'row-note';
      content.push({ kind: 'note', path, text: formatNote({ id, type, owner: s.id, ...(k ? { column: k } : {}) }, text) });
      if (pn) overwrites.push(path); else wrote.push(path);
    }
    notes.set(key, { id, path, text });
  };
  for (const s of seqs) {
    noteFor(rowNoteKey(s.id), s, null);
    for (const k of colsNext.keys()) noteFor(cellNoteKey(k, s.id), s, k);
  }

  // --- 6. records -------------------------------------------------------------------------
  const rows = new Map<string, RowRecord>();
  for (const s of seqs) {
    const cells: Record<string, string> = {}, noteCells: Record<string, string> = {};
    for (const [key, v] of keepCell) { const [rid, k] = key.split('|'); if (rid === s.id && v) cells[k] = cellDir(s, k); }
    for (const k of colsNext.keys()) { const n = notes.get(cellNoteKey(k, s.id)); if (n) noteCells[k] = n.id; }
    const rowNote = notes.get(rowNoteKey(s.id));
    const runs: RunRec[] = s.runs.map(r => ({ id: r.id, column: r.sacch, slot: r.run, time: r.time, temp: r.temp, tags: [...new Set(r.tags)].sort(), added: r.added, file: r.src!.fileId, parse: { xCol: r.src!.xCol, yCol: r.src!.yCol }, ...dashOf(r.dash), ...typeFromOf(r.typeFrom) }));
    const analyses: AnalysisRec[] = s.extras.map(e => ({
      id: e.id, type: e.type, column: e.sacch, slot: e.run, time: e.time, added: e.added, dir: anaDir(s, e), ...typeFromOf(e.typeFrom),
      curves: e.curves.filter(c => c.src).map<CurveRec>(c => ({ id: c.id, label: c.label, ...(c.custom ? { custom: true } : {}), ...curveDisplay(c), ...dashOf(c.dash), file: c.src!.fileId, parse: { xCol: c.src!.xCol, yCol: c.src!.yCol, xScale: c.src!.xScale } })),
    }));
    const structures: StructureRec[] = s.structures.filter(x => x.fileId).map(x => ({ id: x.id, file: x.fileId!, format: x.format, atoms: x.atoms, title: x.note || '', added: x.added }));
    const owned = [...refs.values()].filter(r => r.row?.id === s.id).map(r => metas.get(r.fileId)).filter((m): m is FileMeta => !!m).sort((a, c) => a.id.localeCompare(c.id));
    rows.set(s.id, {
      id: s.id, type: 'row', name: s.name, seq: s.seq, group: s.group || '', desc: s.desc || '',
      dirs: { row: keepRowDir.get(s.id) ? rowDir(s) : null, cells },
      notes: { ...(rowNote ? { row: rowNote.id } : {}), cells: noteCells },
      runs, analyses, structures, files: owned,
      literature: litOf(next, s.id), visibility: visOf(next, s.id), ...pinsOf(s),
    });
  }
  const columns = new Map<string, ColumnRecord>(next.cols.map(c => [c.k, { id: c.k, type: 'column', label: c.label, short: c.short, name: c.name, light: c.light, dark: c.dark, dir: keepCol.get(c.k) ? colDir(c.k) : null }]));
  const pages = new Map<string, PageRecord>(next.pages.map(p => [p.id, { id: p.id, type: 'page', name: p.name, desc: p.desc || '', rows: p.rows.slice(), cols: p.cols ? p.cols.slice() : null, ...(p.metric ? { metric: p.metric } : {}) }]));
  const rowOrder = seqs.map(s => s.id).concat([...prev.unreadable].filter(id => !rowsNext.has(id)));
  const { scripts: _k, ...prevProject } = prev.project;
  const scripts: ScriptRec[] = (next.scripts || []).flatMap(k => { const file = metas.get(k.fileId); return file ? [{ id: k.id, file, fns: scriptFnsOf(k.fns) }] : []; });
  const project: ProjectRecord = { ...prevProject, columnOrder: next.cols.map(c => c.k), pageOrder: next.pages.map(p => p.id), rowOrder, ...(scripts.length ? { scripts } : {}) };
  const settings = splitSettings(next.settings || {}).project;

  const recordWrites: { path: string; text: string | null }[] = [];
  const put = (path: string, now: unknown, before: unknown) => {
    const t = now == null ? null : stableStringify(now), o = before == null ? null : stableStringify(before);
    if (t !== o) recordWrites.push({ path, text: t });
  };
  put(recordPaths.project(pid), project, prev.project);
  for (const [k, c] of columns) put(recordPaths.column(pid, k), c, prev.columns.get(k));
  for (const k of prev.columns.keys()) if (!columns.has(k)) put(recordPaths.column(pid, k), null, prev.columns.get(k));
  for (const [id, p] of pages) put(recordPaths.page(pid, id), p, prev.pages.get(id));
  for (const id of prev.pages.keys()) if (!pages.has(id)) put(recordPaths.page(pid, id), null, prev.pages.get(id));
  for (const [id, r] of rows) put(recordPaths.row(pid, id), r, prev.rows.get(id));
  for (const id of prev.rows.keys()) if (!rows.has(id)) put(recordPaths.row(pid, id), null, prev.rows.get(id));
  const prevSettings = new Map(settingsFiles(pid, prev.settings, prev.ignored).map(f => [f.path, f.value]));
  for (const f of settingsFiles(pid, settings, prev.ignored)) put(f.path, f.value, prevSettings.get(f.path));
  for (const w of recordWrites) if (w.text != null && (await b.stat(w.path))) overwrites.push(w.path);

  // --- 7. removed things go to the trash (after the commit point) -------------------------
  const after: Step[] = [];
  const trashed: string[] = [];
  const toTrash = (m: Omit<TrashManifest, 'deletedAt' | 'schemaVersion' | 'projectId'>) => {
    const { steps } = trashSteps({ ...m, projectId: pid, originalPaths: m.originalPaths.filter(Boolean) });
    after.push(...steps);
    trashed.push(m.label);
  };
  const stillUsed = (fileId: string) => refs.has(fileId);
  const metaPath = (f: FileMeta | undefined) => (f && !missing.has(f.id) ? cur(f.path) : '');

  // A script whose original nothing uses any more (removed, or replaced by a new version).
  (prev.project.scripts || []).forEach((k, index) => {
    if (stillUsed(k.file.id)) return;
    toTrash({ type: 'script', id: k.id, label: 'Script ' + k.file.name, originalPaths: [metaPath(k.file)], records: { script: k }, parents: { index } });
  });
  for (const [id, p] of prev.pages) if (!pages.has(id)) {
    toTrash({ type: 'page', id, label: 'Page ' + p.name, originalPaths: [], records: { page: p }, parents: { index: prev.project.pageOrder.indexOf(id) } });
  }
  for (const [k, c] of prev.columns) if (!columns.has(k)) {
    const parts: Record<string, unknown> = {};
    for (const r of prev.rows.values()) {
      const runs = r.runs.filter(x => x.column === k && !stillUsed(x.file));
      const analyses = r.analyses.filter(a => a.column === k && !rowsNextHasAnalysis(a.id));
      const ids = new Set([...runs.map(x => x.file), ...analyses.flatMap(a => a.curves.map(cv => cv.file))]);
      const files = r.files.filter(f => ids.has(f.id));
      const lit = r.literature[k], vis = r.visibility[k], note = prev.notes.get(cellNoteKey(k, r.id));
      if (runs.length || analyses.length || (lit && lit.length) || vis || note || r.dirs.cells[k]) {
        parts[r.id] = { runs, analyses, files, literature: lit || [], visibility: vis || {}, cellDir: r.dirs.cells[k] || null, note: note ? { id: note.id, path: note.path } : null };
      }
    }
    toTrash({ type: 'column', id: k, label: 'Column ' + c.label, originalPaths: c.dir ? [cur(c.dir)] : [], records: { column: c, parts }, parents: { index: prev.project.columnOrder.indexOf(k) } });
  }
  function rowsNextHasAnalysis(id: string) { return seqs.some(s => s.extras.some(e => e.id === id)); }
  const runIdsNext = new Set(seqs.flatMap(s => s.runs.map(r => r.id)));
  const structIdsNext = new Set(seqs.flatMap(s => s.structures.map(x => x.id)));
  const curveIdsNext = new Set(seqs.flatMap(s => s.extras.flatMap(e => e.curves.map(c => c.id))));

  for (const [id, r] of prev.rows) {
    if (rows.has(id)) continue;
    if (prev.unreadable.has(id)) continue;
    // Whatever moved to another row (a merge) is no longer part of this row.
    const keepRuns = r.runs.filter(x => !runIdsNext.has(x.id));
    const keepAna = r.analyses.filter(a => !rowsNextHasAnalysis(a.id));
    const keepStr = r.structures.filter(x => !structIdsNext.has(x.id));
    const ids = new Set([...keepRuns.map(x => x.file), ...keepAna.flatMap(a => a.curves.map(c => c.file)), ...keepStr.map(x => x.file)]);
    const record: RowRecord = { ...r, runs: keepRuns, analyses: keepAna, structures: keepStr, files: r.files.filter(f => ids.has(f.id) && !stillUsed(f.id)) };
    const paths = [r.dirs.row ? cur(r.dirs.row) : '', ...Object.entries(r.dirs.cells).filter(([k]) => columns.has(k)).map(([, p]) => cur(p))];
    const pagesOf = [...prev.pages.values()].filter(p => p.rows.includes(id)).map(p => ({ id: p.id, index: p.rows.indexOf(id) }));
    toTrash({ type: 'row', id, label: 'Sequence ' + seqKeyLabel(r), originalPaths: paths, records: { row: record }, parents: { index: prev.project.rowOrder.indexOf(id), pages: pagesOf } });
  }
  for (const [id, r] of prev.rows) {
    const nr = rows.get(id);
    if (!nr) continue;
    const meta = (fid: string) => r.files.find(f => f.id === fid);
    for (const x of r.runs) if (!runIdsNext.has(x.id) && columns.has(x.column)) {
      const used = stillUsed(x.file);
      toTrash({ type: 'run', id: x.id, label: 'Run ' + slotNumber(x.slot) + ' of ' + seqKeyLabel(r) + ' × ' + (columns.get(x.column)?.label || x.column), originalPaths: used ? [] : [metaPath(meta(x.file))], records: { run: x, file: used ? null : meta(x.file) || null }, parents: { row: id, column: x.column } });
    }
    for (const a of r.analyses) if (!rowsNextHasAnalysis(a.id) && columns.has(a.column)) {
      const files = r.files.filter(f => a.curves.some(c => c.file === f.id) && !stillUsed(f.id));
      toTrash({ type: 'analysis', id: a.id, label: a.type + ' analysis of ' + seqKeyLabel(r), originalPaths: a.dir ? [cur(a.dir)] : [], records: { analysis: a, files }, parents: { row: id, column: a.column } });
    }
    for (const x of r.structures) if (!structIdsNext.has(x.id)) {
      const used = stillUsed(x.file);
      toTrash({ type: 'structure', id: x.id, label: 'Structure ' + (meta(x.file)?.name || x.id) + ' of ' + seqKeyLabel(r), originalPaths: used ? [] : [metaPath(meta(x.file))], records: { structure: x, file: used ? null : meta(x.file) || null }, parents: { row: id } });
    }
    for (const a of r.analyses) if (rowsNextHasAnalysis(a.id)) for (const c of a.curves) if (!curveIdsNext.has(c.id)) {
      const used = stillUsed(c.file);
      toTrash({ type: 'curve', id: c.id, label: 'Curve ' + (c.label || c.id) + ' of ' + seqKeyLabel(r), originalPaths: used ? [] : [metaPath(meta(c.file))], records: { curve: c, analysis: a.id, file: used ? null : meta(c.file) || null }, parents: { row: id, analysis: a.id } });
    }
    for (const [k, list] of Object.entries(r.literature)) {
      if (!columns.has(k)) continue;
      const nowIds = new Set((nr.literature[k] || []).map(x => x.id));
      for (const ref of list) if (!nowIds.has(ref.id) && !Object.values(nr.literature).some(l => l.some(x => x.id === ref.id))) {
        toTrash({ type: 'literature', id: ref.id, label: 'Reference ' + (ref.title || ref.doi || ref.id), originalPaths: [], records: { ref, column: k }, parents: { row: id, column: k } });
      }
    }
  }
  for (const [key, n] of prev.notes) {
    if (notes.has(key) || !n.text) continue;
    const p = key.split(':');
    const rowAlive = rows.has(p[p.length - 1]);
    const colAlive = p[0] === 'row' || columns.has(p[1]);
    if (!rowAlive || !colAlive) continue; // goes to the trash with its row or column folder
    toTrash({ type: 'note', id: n.id, label: (p[0] === 'row' ? 'Note on ' : 'Cell note on ') + seqKeyLabel(prev.rows.get(p[p.length - 1])!), originalPaths: [cur(n.path)], records: { key, id: n.id, text: n.text }, parents: { row: p[p.length - 1], ...(p[0] === 'cell' ? { column: p[1] } : {}) } });
  }
  // Folders left empty (no longer needed, or emptied by a move): deepest first, never the project folder.
  const empties = new Set<string>(unneeded.map(cur));
  for (const m of moves) empties.add(cur(dirname(m.from)));
  if (!scripts.length && prev.project.scripts?.length) empties.add(visiblePaths.scripts(projDir));
  for (const d of [...empties].filter(d => d && d !== projDir && d.startsWith(projDir + '/')).sort((x, y) => y.split('/').length - x.split('/').length)) after.push({ kind: 'rmdirIfEmpty', path: d });

  // --- 8. the journal entry ------------------------------------------------------------------
  const entry = newEntry('commit');
  entry.moves = moves.slice();
  entry.wrote = wrote;
  entry.records = recordWrites;
  entry.after = after;
  const state: ProjectState = { ...prev, project, columns, pages, rows, settings, notes, unreadable: prev.unreadable };
  const empty = !content.length && !recordWrites.length && !after.length;
  return { state, entry, content, newSrc, trashed, overwrites, empty };
}
