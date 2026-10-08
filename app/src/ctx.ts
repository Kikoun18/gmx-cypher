import { createContext, useContext } from 'react';
import type { AnalysisType, Column, Metric, Page, Settings, Store, Vis } from './lib/types';
import type { SkipFn, UploadForm } from './lib/seq';
import type { Upload } from './lib/storage/plan';
import type { GmxHeader } from './lib/gmxHeader';

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
  metric: Metric;
  corrected: boolean;
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
  setCorrected: (v: boolean) => void;
  setFitWell: (v: boolean) => void;
  setSel: (sel: Sel | null) => void;
  openForm: (over?: Partial<UploadForm>) => void;
  openSettings: (focusAnalysis?: string) => void;
  /** Row ids in on-screen order, for ↑/↓ navigation. */
  order: string[];
  /** An original file's bytes, from the vault. */
  readFile: (fileId: string) => Promise<Blob>;
  /** Where identical content already is in this project or its trash ("Identical to …"), or null. */
  findSame: (sha256: string) => Promise<string | null>;
  /** An original's GROMACS header (version, tool, command…), or null if it has none. */
  provenance: (fileId: string) => Promise<GmxHeader | null>;
  /** Loads one analysis's curves (they load on demand). */
  loadAnalysis: (extraId: string) => Promise<void>;
  /** Notes are read from the vault after the matrix shows; editing waits for them. */
  notesReady: boolean;
  /** Nothing can be saved (another tab has the vault, a newer format, or the JSON viewer). */
  readOnly: boolean;
  /** Files dropped on a matrix cell: data files open the upload form for that cell, structures attach to the row. */
  dropOnCell: (rowId: string, col: string, dt: DataTransfer) => void;
  /** Compare mode: while the key is held, clicks pick cells / sequences instead of opening them. */
  compare: { held: boolean; picked: Set<string>; toggle: (p: ComparePick) => void };
}

export const Ctx = createContext<App | null>(null);
export const useApp = () => useContext(Ctx)!;

export const DASH = ['none', '5 4', '2 3', '8 3 2 3', '1 3', '10 4', '4 2 1 2', '6 6', '3 5', '12 3 3 3'];
