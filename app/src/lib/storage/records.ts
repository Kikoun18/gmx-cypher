// Durable entity metadata (.matrix/records/), one JSON file per entity
// (decision D7): rows carry their runs, analyses, curves, structures, file
// metadata, literature and run visibility. All paths are vault-relative.

import type { LitRef, ScriptFnSettings, Slot, TypeFrom } from '../types';

export const SCHEMA_VERSION = 4;

export type FileKind = 'pmf-xvg' | 'analysis-xvg' | 'structure' | 'import-json' | 'script' | 'other';
export type FileOrigin = 'upload' | 'migrated-from-indexeddb' | 'reconstructed';

/** An original file in the visible tree (spec §4). */
export interface FileMeta {
  id: string;
  kind: FileKind;
  /** Original file name as uploaded (unsanitized). */
  name: string;
  /** Where it is stored, relative to the vault root. */
  path: string;
  size: number;
  sha256: string;
  uploaded: string;
  mime: string;
  /** ID of the run / analysis / structure / project that owns it. */
  owner: string;
  origin: FileOrigin;
  /** For reconstructed files: what they were rebuilt from. */
  reconstructedFrom?: string;
}

export interface RunRec {
  id: string;
  column: string;
  slot: Slot;
  time: string;
  temp: number;
  /** Sorted unique tag keys (schema 2; schema 1 had `methods: { key: boolean }`). */
  tags: string[];
  added: string;
  file: string;
  /** Parse parameters used at upload, so the derived curve never changes. */
  parse: { xCol: number; yCol: number };
  /** Schema 4 (batch 3): a chosen dash pattern 0–9 (R6), and where its type came from (R1b, R7). */
  dash?: number;
  typeFrom?: TypeFrom;
}

export interface CurveRec {
  id: string;
  label: string;
  custom?: boolean;
  /** Schema 3 (batch 2, R4e): dimmed or hidden within its run, and steps lighter (+) or darker (−). */
  vis?: 'dim' | 'off';
  shade?: number;
  /** Schema 4 (batch 3, R6): a chosen dash pattern 0–9. */
  dash?: number;
  file: string;
  parse: { xCol: number; yCol: number; xScale: number };
}

const TYPE_FROM: TypeFrom[] = ['pattern', 'form', 'header', 'name', 'generic', 'changed'];
/** Schema-4 fields as stored: a whole dash 0–9 and a known type source; anything else is left out. */
export const dashOf = (v: unknown): { dash?: number } => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 9 ? { dash: v } : {});
export const typeFromOf = (v: unknown): { typeFrom?: TypeFrom } => (TYPE_FROM.includes(v as TypeFrom) ? { typeFrom: v as TypeFrom } : {});
/** A row's marks and lines as stored: finite x and values, x or y axes; empty lists left out. */
export function pinsOf(r: { marks?: unknown; lines?: unknown }): Pick<RowRecord, 'marks' | 'lines'> {
  const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
  const marks = (Array.isArray(r.marks) ? r.marks : []).filter(m => m && typeof m.curve === 'string' && fin(m.x)).map(m => ({ curve: m.curve as string, x: m.x as number }));
  const lines: NonNullable<RowRecord['lines']> = {};
  for (const [k, ls] of Object.entries(r.lines && typeof r.lines === 'object' ? r.lines : {})) {
    const ok = (Array.isArray(ls) ? ls : []).filter(l => l && (l.axis === 'x' || l.axis === 'y') && fin(l.v)).map(l => ({ axis: l.axis as 'x' | 'y', v: l.v as number }));
    if (ok.length) lines[k] = ok;
  }
  return { ...(marks.length ? { marks } : {}), ...(Object.keys(lines).length ? { lines } : {}) };
}

/** A script's per-function settings as stored (R3b): a known role and non-empty texts; functions with nothing set are left out. */
export function scriptFnsOf(v: unknown): Record<string, ScriptFnSettings> {
  const out: Record<string, ScriptFnSettings> = {};
  for (const [name, f] of Object.entries(v && typeof v === 'object' ? v : {})) {
    if (!f || typeof f !== 'object') continue;
    const o: ScriptFnSettings = {};
    if (f.role === 'metric' || f.role === 'transform') o.role = f.role;
    for (const k of ['label', 'unit', 'desc'] as const) if (typeof f[k] === 'string' && f[k].trim()) o[k] = f[k];
    if (Object.keys(o).length) out[name] = o;
  }
  return out;
}

/** A curve's display fields as stored: only known visibility values, and a whole shade step in −3…3 other than 0. */
export function curveDisplay(c: { vis?: unknown; shade?: unknown }): Pick<CurveRec, 'vis' | 'shade'> {
  const shade = typeof c.shade === 'number' && isFinite(c.shade) ? Math.max(-3, Math.min(3, Math.round(c.shade))) : 0;
  return { ...(c.vis === 'dim' || c.vis === 'off' ? { vis: c.vis } : {}), ...(shade ? { shade } : {}) };
}

export interface AnalysisRec {
  id: string;
  type: string;
  column: string;
  slot: Slot;
  time: string;
  added: string;
  dir: string | null;
  curves: CurveRec[];
  /** Schema 4 (batch 3, R1b/R7). */
  typeFrom?: TypeFrom;
}

export interface StructureRec {
  id: string;
  file: string;
  format: 'pdb' | 'gro';
  atoms: number;
  title: string;
  added: string;
}

export interface RowRecord {
  id: string;
  type: 'row';
  name: string;
  seq: string;
  group: string;
  desc: string;
  dirs: { row: string | null; cells: Record<string, string> };
  notes: { row?: string; cells: Record<string, string> };
  runs: RunRec[];
  analyses: AnalysisRec[];
  structures: StructureRec[];
  files: FileMeta[];
  literature: Record<string, LitRef[]>;
  visibility: Record<string, Partial<Record<Slot, 'dim' | 'off'>>>;
  /** Schema 4 (batch 3, R5): marked points and reference lines (see Seq). */
  marks?: { curve: string; x: number }[];
  lines?: Record<string, { axis: 'x' | 'y'; v: number }[]>;
}

export interface ColumnRecord {
  id: string;
  type: 'column';
  label: string;
  short: string;
  name: string;
  light: string;
  dark: string;
  dir: string | null;
}

export interface PageRecord {
  id: string;
  type: 'page';
  name: string;
  desc: string;
  rows: string[];
  cols: string[] | null;
  /** Schema 4 (batch 3, R4): the metric this page shows. */
  metric?: string;
}

export interface ProjectRecord {
  id: string;
  type: 'project';
  name: string;
  desc: string;
  created: string;
  dir: string;
  columnOrder: string[];
  pageOrder: string[];
  rowOrder: string[];
  /** Imported dataset JSON files kept as originals (decision D13). */
  imports: FileMeta[];
  /** Schema 4 (batch 3, R3): uploaded Python scripts, kept as originals in `{project}/_scripts/`, with per-function settings. */
  scripts?: ScriptRec[];
}

export interface ScriptRec {
  id: string;
  file: FileMeta;
  fns: Record<string, ScriptFnSettings>;
}

export interface WorkspaceRecord { type: 'workspace'; projectOrder: string[] }

export interface Manifest {
  app: string;
  format: string;
  schemaVersion: number;
  vaultId: string;
  created: string;
  modified: string;
  migratedFrom?: string;
  migratedAt?: string;
  /** Summary of a migration from the prototype's browser storage (spec §16.6). */
  migration?: {
    source: string;
    at: string;
    /** True only if the fresh-reopen comparison found no difference. */
    verified: boolean;
    projects: { id: string; name: string; from: string; reconstructed: number }[];
  };
}

export function emptyRow(id: string, name: string): RowRecord {
  return { id, type: 'row', name, seq: '', group: '', desc: '', dirs: { row: null, cells: {} }, notes: { cells: {} }, runs: [], analyses: [], structures: [], files: [], literature: {}, visibility: {} };
}

/** Every file a row references. */
export function rowFiles(r: RowRecord): Set<string> {
  const s = new Set<string>();
  for (const x of r.runs) s.add(x.file);
  for (const a of r.analyses) for (const c of a.curves) s.add(c.file);
  for (const x of r.structures) s.add(x.file);
  return s;
}
