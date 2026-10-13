import type { ExportPrefs } from './exportPrefs';

export type Metric = 'area' | 'min';
export type Vis = 'on' | 'dim' | 'off';
export type Slot = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j';
/** Where a type assignment came from (batch 3, R1b/R7): the name pattern, the form, the header, file-name words, no match, or a later change. */
export type TypeFrom = 'pattern' | 'form' | 'header' | 'name' | 'generic' | 'changed';

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
  /** Batch 3 (schema 4): a chosen dash pattern 0–9 (R6) and where its type came from (R1b, R7). */
  dash?: number;
  typeFrom?: TypeFrom;
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
  /** A chosen dash pattern 0–9 (batch 3, R6); absent = by its place. */
  dash?: number;
  /** From the curve's file, derived when it is read and never stored: its axis labels (F82) and row names (F113). */
  axis?: { x: string; y: string };
  names?: (string | null)[];
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
  typeFrom?: TypeFrom;
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
  /** Batch 3 (R5): marked points (a run or curve ID and its x), and reference lines per graph ("<column>|<type>", or "*|<type>" for the row view). */
  marks?: { curve: string; x: number }[];
  lines?: Record<string, { axis: 'x' | 'y'; v: number }[]>;
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
  /** The matrix metric shown on this page (batch 3, R4). */
  metric?: string;
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
  /** Uploaded Python scripts (batch 3, R3b). */
  scripts?: ScriptRef[];
}

/** An uploaded Python script: its original is kept byte for byte in `{project}/_scripts/`, with settings per function. */
export interface ScriptRef {
  id: string;
  name: string;
  fileId: string;
  sha256?: string;
  fns: Record<string, ScriptFnSettings>;
}
/** What you set for one function; anything unset comes from the code (F89). */
export interface ScriptFnSettings { role?: 'metric' | 'transform'; label?: string; unit?: string; desc?: string }

export interface AnalysisType {
  k: string;
  label: string;
  name: string;
  xLabel: string;
  yLabel: string;
  xCol?: number;
  yCols?: string;
  xScale?: number | string;
  /** How curves are drawn (R1c): auto = points when every x is a consecutive whole number, else line. */
  style: 'line' | 'step' | 'points' | 'bars' | 'auto';
  match: string;
  /** GROMACS tools whose output is this type (comma list, e.g. "gmx energy"); outranks keywords. Unset = the built-in's. */
  tools?: string;
  /** Applied to its curves before drawing (R2); unset = none. PMF's is Settings.pmfTransform. */
  transform?: Transform;
  /** Its default matrix metric (R4). */
  metric?: string;
  /** Display smoothing: Gaussian width in points (0 = off). Unset = the default (on for histograms). */
  smooth?: number;
  /** What the graph marks on each shown curve. Unset = the default by type (markerOf). */
  marker?: 'max' | 'min' | 'none';
  /** The value written next to each marker. Unset = none. */
  markerLabel?: 'none' | 'x' | 'y';
}

/** A matrix metric (batch 3, R4): a function of each run's curve of one type, aggregated over runs, on its own colour scale. */
export interface MetricDef {
  id: string;
  label: string;
  type: string;
  curve?: number;
  transform?: Transform;
  fn: { kind: 'builtin'; name: string } | { kind: 'script'; script: string; fn: string };
  params?: Record<string, unknown>;
  agg: 'mean';
  unit?: string;
  scale: { kind: 'zero' | 'minmax' | 'diverging'; center?: number };
  smoothed?: boolean;
}

/** A curve transform (batch 3, R2): the built-in entropy correction, none, or a script's function (R3c) with its parameter values. */
export type Transform = { kind: 'none' } | { kind: 'entropy' } | { kind: 'script'; script: string; fn: string; params?: Record<string, string | number | boolean> };

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
  /** The transform of PMF runs, for the graphs and the matrix (R2); absent = the entropy correction. */
  pmfTransform?: Transform;
  /** The project's matrix metrics (R4, metrics.json) and the one the all-rows page shows. */
  metrics?: MetricDef[];
  metric?: string;
  /** App-wide: laser pointer. */
  laserKey: string;
  laserMode: 'toggle' | 'hold';
  laserColor: string;
  laserSize: 's' | 'm' | 'l';
  laserTrail: boolean;
  /** App-wide: hold this key and click sequences to compare them on one graph. */
  compareKey: string;
  /** App-wide: in a graph, export it as shown (R8b). */
  exportKey: string;
  /** This browser: the matrix metrics used last, newest first (F97). */
  recentMetrics?: string[];
  /** This browser: export settings (R8a); cleaned by cleanExport. */
  exportPrefs?: Partial<ExportPrefs>;
}

export interface XvgHead {
  title: string;
  xLabel: string;
  yLabel: string;
  legends: string[];
  /** Row names from a comment directly above every data row (`# Atom C22:` → "Atom C22"); absent unless every row has one. */
  rowLabels?: string[];
}

export interface Table {
  cols: number[][];
  n: number;
  head: XvgHead;
}
