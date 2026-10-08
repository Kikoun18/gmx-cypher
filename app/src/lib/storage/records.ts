// Durable entity metadata (.matrix/records/), one JSON file per entity
// (decision D7): rows carry their runs, analyses, curves, structures, file
// metadata, literature and run visibility. All paths are vault-relative.

import type { LitRef, Slot } from '../types';

export const SCHEMA_VERSION = 3;

export type FileKind = 'pmf-xvg' | 'analysis-xvg' | 'structure' | 'import-json' | 'other';
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
}

export interface CurveRec {
  id: string;
  label: string;
  custom?: boolean;
  /** Schema 3 (batch 2, R4e): dimmed or hidden within its run, and steps lighter (+) or darker (−). */
  vis?: 'dim' | 'off';
  shade?: number;
  file: string;
  parse: { xCol: number; yCol: number; xScale: number };
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
