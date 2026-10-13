// Conversion between the durable records and the app's runtime Store.
// The Store is only a view: building it never writes, and data arrays
// (parsed curves) come from the derived-data maps, never from records.

import type { Column, Curve, Extra, LitRef, Page, Run, Seq, Slot, Store, StructMeta, Vis } from '../types';
import { SLOTS } from '../seq';
import type { ColumnRecord, FileMeta, PageRecord, ProjectRecord, RowRecord } from './records';
import { curveDisplay, dashOf, pinsOf, scriptFnsOf, typeFromOf } from './records';
import type { ProjectSettings } from './settings';
import { tagsOf } from '../seq';

export interface NoteState { id: string; path: string; text: string }

/** Everything durable about one project, as last read from or written to disk. */
export interface ProjectState {
  project: ProjectRecord;
  columns: Map<string, ColumnRecord>;
  pages: Map<string, PageRecord>;
  rows: Map<string, RowRecord>;
  settings: ProjectSettings;
  ignored: string[];
  /** 'row:<rowId>' | 'cell:<colKey>:<rowId>' → note on disk. */
  notes: Map<string, NoteState>;
  /** Row IDs whose record file couldn't be read; never overwritten or dropped. */
  unreadable: Set<string>;
}

export const rowNoteKey = (rowId: string) => 'row:' + rowId;
export const cellNoteKey = (col: string, rowId: string) => 'cell:' + col + ':' + rowId;

export interface DerivedData {
  pmf: Map<string, { x: number[]; y: number[] }>;
  /** Curve data by source, with the file's labels and row names (derived, never written). */
  curves: Map<string, Pick<Curve, 'x' | 'y' | 'axis' | 'names'>>;
  missing: Set<string>;
}

export const curveKey = (src: { fileId: string; xCol: number; yCol: number; xScale: number }) => src.fileId + ':' + src.xCol + ':' + src.yCol + ':' + src.xScale;

export function filesById(state: ProjectState): Map<string, FileMeta> {
  const m = new Map<string, FileMeta>();
  for (const r of state.rows.values()) for (const f of r.files) m.set(f.id, f);
  for (const k of state.project.scripts || []) m.set(k.file.id, k.file);
  return m;
}

function rowToSeq(r: RowRecord, files: Map<string, FileMeta>, d: DerivedData): Seq {
  const name = (id: string) => (files.get(id) ? files.get(id)!.name : '');
  const runs: Run[] = r.runs.map(x => {
    const data = d.pmf.get(x.file), missing = d.missing.has(x.file) || !files.has(x.file);
    const run: Run = {
      id: x.id, sacch: x.column, run: x.slot, time: x.time, temp: x.temp, tags: tagsOf(x), file: name(x.file), added: x.added,
      x: data && !missing ? data.x : [], y: data && !missing ? data.y : [],
      src: { fileId: x.file, xCol: x.parse.xCol, yCol: x.parse.yCol }, ...dashOf(x.dash), ...typeFromOf(x.typeFrom),
    };
    if (missing || !data) run.state = 'missing';
    return run;
  });
  const extras: Extra[] = r.analyses.map(a => {
    const curves: Curve[] = a.curves.map(c => {
      const src = { fileId: c.file, xCol: c.parse.xCol, yCol: c.parse.yCol, xScale: c.parse.xScale };
      const data = d.curves.get(curveKey(src)), missing = d.missing.has(c.file) || !files.has(c.file);
      const curve: Curve = { id: c.id, x: [], y: [], ...data, label: c.label, file: name(c.file), src };
      if (c.custom) curve.custom = true;
      Object.assign(curve, curveDisplay(c), dashOf(c.dash));
      if (missing) curve.state = 'missing'; else if (!data) curve.state = 'pending';
      return curve;
    });
    return { id: a.id, type: a.type, sacch: a.column, run: a.slot, time: a.time, file: curves[0] ? curves[0].file || '' : '', added: a.added, curves, ...typeFromOf(a.typeFrom) };
  });
  const structures: StructMeta[] = r.structures.map(s => {
    const f = files.get(s.file);
    const st: StructMeta = { id: s.id, name: f ? f.name : '', format: s.format, added: s.added, size: f ? f.size : 0, atoms: s.atoms, note: s.title, fileId: s.file };
    if (!f || d.missing.has(s.file)) st.state = 'missing';
    return st;
  });
  return { id: r.id, group: r.group, name: r.name, seq: r.seq, desc: r.desc, runs, extras, structures, ...pinsOf(r) };
}

const colToColumn = (c: ColumnRecord): Column => ({ k: c.id, label: c.label, short: c.short, name: c.name, light: c.light, dark: c.dark });
const pageToPage = (p: PageRecord): Page => ({ id: p.id, name: p.name, desc: p.desc, rows: p.rows.slice(), cols: p.cols ? p.cols.slice() : null, ...(typeof p.metric === 'string' && p.metric ? { metric: p.metric } : {}) });

/** In declared order; records missing from the order are appended (sorted), order entries without a record are skipped. */
function ordered<T>(order: string[], all: Map<string, T>): T[] {
  const seen = new Set<string>(), out: T[] = [];
  for (const id of order) { const v = all.get(id); if (v && !seen.has(id)) { seen.add(id); out.push(v); } }
  for (const id of [...all.keys()].sort()) if (!seen.has(id)) out.push(all.get(id)!);
  return out;
}

export function storeFrom(state: ProjectState, d: DerivedData): Store {
  const files = filesById(state);
  const rows = ordered(state.project.rowOrder, state.rows);
  const notes: Store['notes'] = { cell: {}, row: {} };
  for (const [k, n] of state.notes) {
    if (!n.text) continue;
    const p = k.split(':');
    if (p[0] === 'row') notes.row[p[1]] = n.text;
    else if (p[0] === 'cell') notes.cell[p[1] + '_' + p[2]] = n.text;
  }
  const vis: Record<string, Vis> = {}, lit: Record<string, LitRef[]> = {};
  for (const r of rows) {
    for (const [col, slots] of Object.entries(r.visibility || {})) for (const [slot, v] of Object.entries(slots || {})) if (v) vis[r.id + '|' + col + '|' + slot] = v;
    for (const [col, list] of Object.entries(r.literature || {})) if (list && list.length) lit[col + '_' + r.id] = list.map(x => ({ ...x }));
  }
  const store: Store = {
    seqs: rows.map(r => rowToSeq(r, files, d)),
    cols: ordered(state.project.columnOrder, state.columns).map(colToColumn),
    notes, vis, lit,
    pages: ordered(state.project.pageOrder, state.pages).map(pageToPage),
  };
  if (Object.keys(state.settings).length) store.settings = { ...state.settings };
  const scripts = (state.project.scripts || []).map(k => ({ id: k.id, name: k.file.name, fileId: k.file.id, ...(k.file.sha256 ? { sha256: k.file.sha256 } : {}), fns: scriptFnsOf(k.fns) }));
  if (scripts.length) store.scripts = scripts;
  return store;
}

// --- Store → record fields (paths are filled in by the planner) -------------------

export function litOf(store: Store, rowId: string): Record<string, LitRef[]> {
  const out: Record<string, LitRef[]> = {};
  for (const [k, list] of Object.entries(store.lit || {})) {
    const i = k.lastIndexOf('_');
    if (k.slice(i + 1) === rowId && list && list.length) out[k.slice(0, i)] = list.map(x => ({ ...x }));
  }
  return out;
}

export function visOf(store: Store, rowId: string): RowRecord['visibility'] {
  const out: RowRecord['visibility'] = {};
  for (const [k, v] of Object.entries(store.vis || {})) {
    const [id, col, slot] = k.split('|');
    if (id !== rowId || !v || v === 'on') continue;
    if (!SLOTS.includes(slot as Slot)) continue;
    (out[col] = out[col] || {})[slot as Slot] = v as 'dim' | 'off';
  }
  return out;
}

export const slotNumber = (slot: Slot) => SLOTS.indexOf(slot) + 1 || 1;
