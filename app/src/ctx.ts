import { createContext, useContext } from 'react';
import type { AnalysisType, Column, Metric, MetricDef, Page, Settings, Store, Transform, Vis } from './lib/types';
import type { SkipFn, UploadForm } from './lib/seq';
import type { Upload } from './lib/storage/plan';
import type { GmxHeader } from './lib/gmxHeader';
import type { Discovery } from './lib/scripts';
import type { ExportPrefs } from './lib/exportPrefs';

export interface Sel { mode: 'cell' | 'row'; id: string; s: string }

/** One thing picked while the compare key is held: a cell, or a whole sequence (col = null). */
export interface ComparePick { id: string; col: string | null }
export const pickKey = (p: ComparePick) => p.id + '|' + (p.col ?? '*');

export interface App {
  store: Store;
  settings: Settings;
  dark: boolean;
  /** Columns shown on the current page. */
  cols: Column[];
  /** Every column in the project (pickers that move data use these). */
  allCols: Column[];
  /** The current page, or null for "All sequences". */
  page: Page | null;
  projectName: string;
  types: AnalysisType[];
  /** PMF's built-in for places that only know Area and Min (the matrix uses metricDef). */
  metric: Metric;
  /** The matrix metric on this page (R4a). */
  metricDef: MetricDef;
  /** Shows another metric on this page (remembered with the page) and adds it to the recent ones. */
  setMetricId: (id: string) => void;
  /** The temporary "show raw" view of graphs (F88); the matrix always uses the setting. */
  raw: boolean;
  /** PMF's transform from the project settings (R2). */
  pmfT: Transform;
  /** The laser pointer is on: clicks on graphs don't mark or add lines (R5, question 22). */
  laser: boolean;
  /** Changes whenever script answers arrive (R3c), for memos that use transforms. */
  scriptsV: number;
  fitWell: boolean;
  skip: SkipFn;
  hue: (c: { light: string; dark: string }) => string;
  colOf: (k: string) => Column;
  /** The next Store. `uploads` are originals (keyed by the file IDs `store` references) the vault stores unchanged. */
  commit: (store: Store, uploads?: Map<string, Upload>) => void;
  /** Functional update: f receives the latest store, so quick successive edits never clobber each other. */
  mutate: (f: (store: Store) => Store) => void;
  setSetting: (patch: Partial<Settings>) => void;
  setVis: (pairs: [string, Vis][]) => void;
  setRaw: (v: boolean) => void;
  setFitWell: (v: boolean) => void;
  setSel: (sel: Sel | null) => void;
  openForm: (over?: Partial<UploadForm>) => void;
  openSettings: (focusAnalysis?: string) => void;
  /** Row ids in on-screen order, for ↑/↓ navigation. */
  order: string[];
  /** An original file's bytes, from the vault. */
  readFile: (fileId: string) => Promise<Blob>;
  /** What saving `next` would move and trash, without saving (R7). */
  previewSave: (next: Store) => Promise<{ moves: { from: string; to: string }[]; trashed: string[] }>;
  /** Where identical content already is in this project or its trash ("Identical to …"), or null. */
  findSame: (sha256: string) => Promise<string | null>;
  /** An original's GROMACS header (version, tool, command…), or null if it has none. */
  provenance: (fileId: string) => Promise<GmxHeader | null>;
  /** Loads one analysis's curves (they load on demand). */
  loadAnalysis: (extraId: string) => Promise<void>;
  /** A script's source, the SHA-256 of its bytes on disk now, and its functions (R3b; cached by SHA-256). */
  scriptInfo: (fileId: string) => Promise<{ source: string; size: number; sha256: string; fns: Discovery }>;
  /** Trust in scripts, kept in this browser for this vault folder (F96). */
  trust: { has: (scriptId: string, sha256: string) => Promise<boolean>; add: (scriptId: string, sha256: string) => Promise<void> };
  /** Notes are read from the vault after the matrix shows; editing waits for them. */
  notesReady: boolean;
  /** Nothing can be saved (another tab has the vault, a newer format, or the JSON viewer). */
  readOnly: boolean;
  /** Files dropped on a matrix cell: data files open the upload form for that cell, structures attach to the row. */
  dropOnCell: (rowId: string, col: string, dt: DataTransfer) => void;
  /** This browser's export settings, cleaned (R8a). */
  exportPrefs: ExportPrefs;
  /** Makes files with the export settings and sends them where the settings say (asking for the folder first), with a toast. */
  exportFiles: (make: (p: ExportPrefs) => Promise<{ name: string; blob: Blob }[]>) => Promise<void>;
  /** The cell's (or each column's, for a sequence) value for the page's matrix metric, for an export's legend (R8d). */
  valueLines: (id: string, col: string | null) => string[];
  /** The open graph or comparison gives its "export as shown" here; the export key calls it (R8b). */
  setExportShown: (run: (() => void) | null) => void;
  /** The vault's folder (none for the JSON viewer): an export folder can't be inside it. */
  vaultFolder: FileSystemDirectoryHandle | null;
  /** Compare mode: while the key is held, clicks pick cells / sequences instead of opening them. */
  compare: { held: boolean; picked: Set<string>; toggle: (p: ComparePick) => void; /** Held for an export (R8c): a cell with analyses only can be picked too (F138). */ forExport: boolean };
}

export const Ctx = createContext<App | null>(null);
export const useApp = () => useContext(Ctx)!;
