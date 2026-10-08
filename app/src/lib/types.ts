export type Metric = 'area' | 'min';
export type Vis = 'on' | 'dim' | 'off';
export type Slot = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j';

export interface Column {
  k: string;
  label: string;
  short: string;
  name: string;
  light: string;
  dark: string;
}


/** One AWH PMF curve in a run slot of a cell. `sacch` is the column key. */
export interface Run {
  id: string;
  sacch: string;
  run: Slot;
  time: string;
  temp: number;
  /** Tag keys (TagDef.k), sorted and unique; keys not in the project's list are kept. */
  tags: string[];
  file: string;
  added: string;
  x: number[];
  y: number[];
  /** The original file in the vault and how it was parsed (absent before the vault). */
  src?: { fileId: string; xCol: number; yCol: number };
  /** 'missing': the record points to a file that isn't in the vault folder. */
  state?: 'missing';
}

/** One curve inside an analysis. Curves may come from different files and x grids. */
export interface Curve {
  id: string;
  x: (number | null)[];
  y: (number | null)[];
  label: string;
  /** true once the user has typed their own legend. */
  custom?: boolean;
  file?: string;
  src?: { fileId: string; xCol: number; yCol: number; xScale: number };
  /** 'pending': data not loaded yet (loaded when its tab opens); 'missing': file not found. */
  state?: 'missing' | 'pending';
  /** Dimmed or hidden within its run (batch 2, R4c); absent = shown. */
  vis?: 'dim' | 'off';
  /** Steps lighter (+) or darker (−) than its default shade, −3…3 (batch 2, R4d); absent = 0. */
  shade?: number;
}

/** A non-PMF analysis (RDF, RMSD, histograms…) attached to a run slot. */
export interface Extra {
  id: string;
  type: string;
  sacch: string;
  run: Slot;
  time: string;
  file: string;
  added: string;
  curves: Curve[];
}

/** A structure file attached to a row. The original file is kept in the vault (`fileId`). */
export interface StructMeta {
  id: string;
  name: string;
  format: 'pdb' | 'gro';
  added: string;
  size: number;
  atoms: number;
  note?: string;
  fileId?: string;
  state?: 'missing';
}

export interface Seq {
  id: string;
  group: string;
  name: string;
  seq: string;
  desc: string;
  runs: Run[];
  extras: Extra[];
  structures: StructMeta[];
}

export interface LitRef {
  id: string;
  title: string;
  authors: string;
  year: string;
  venue: string;
  doi: string;
  url: string;
  note: string;
  added: string;
}

export interface Notes {
  cell: Record<string, string>;
  row: Record<string, string>;
}

/**
 * A page is a view over the project's sequences: which rows it shows (in its
 * own order) and, optionally, which columns. "All sequences" is implicit.
 */
export interface Page {
  id: string;
  name: string;
  desc: string;
  rows: string[];
  /** Column keys shown on this page, in project order; null = every column. */
  cols: string[] | null;
}

export interface Store {
  seqs: Seq[];
  cols: Column[];
  notes: Notes;
  vis: Record<string, Vis>;
  /** Literature per cell, keyed like cell notes: `${colKey}_${rowId}`. */
  lit: Record<string, LitRef[]>;
  pages: Page[];
  /** The project's own data settings (file names, axes, analyses…). */
  settings?: Partial<Settings>;
}

export interface AnalysisType {
  k: string;
  label: string;
  name: string;
  xLabel: string;
  yLabel: string;
  xCol?: number;
  yCols?: string;
  xScale?: number | string;
  style: 'line' | 'step';
  match: string;
  /** Display smoothing: Gaussian width in points (0 = off). Unset = the default (on for histograms). */
  smooth?: number;
  /** What the graph marks on each shown curve. Unset = the default by type (markerOf). */
  marker?: 'max' | 'min' | 'none';
  /** The value written next to each marker. Unset = none. */
  markerLabel?: 'none' | 'x' | 'y';
}

/** A run tag (R2): a stable key and an editable label. */
export interface TagDef { k: string; label: string }

export interface Settings {
  parse: boolean;
  pattern: string;
  /** Matched against a file's folder path (or header working directory); '' = off. */
  pathPattern: string;
  xCol: number;
  yCol: number;
  xLabel: string;
  yLabel: string;
  temp: string;
  dark: boolean | null;
  /** App-wide: draw graph curves in greys with dashes (batch 2, R4). */
  bw: boolean;
  rowAll: boolean;
  hiddenOut: boolean;
  analyses?: AnalysisType[];
  /** The project's run tags, in display order; absent = DEFAULT_TAGS. */
  tags?: TagDef[];
  /** App-wide: laser pointer. */
  laserKey: string;
  laserMode: 'toggle' | 'hold';
  laserColor: string;
  laserSize: 's' | 'm' | 'l';
  laserTrail: boolean;
  /** App-wide: hold this key and click sequences to compare them on one graph. */
  compareKey: string;
}

export interface XvgHead {
  title: string;
  xLabel: string;
  yLabel: string;
  legends: string[];
}

export interface Table {
  cols: number[][];
  n: number;
  head: XvgHead;
}
