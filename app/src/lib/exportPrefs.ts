// Export settings (batch 3, R8a): this browser's, like the theme. Pure: the layout they give and file names.

/** A safe file name: letters, digits, dot, dash and underscore. */
export function fileBase(s: string): string {
  return String(s || 'export').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

export type ExportFormatAll = 'pdf' | 'png' | 'svg' | 'xvg';
export interface ExportPrefs {
  /** Used by the export key and batch exports; the menus still offer every format. */
  format: ExportFormatAll;
  /** Width and height in `unit`; 0 = automatic (today's size; the height the graph needs). */
  w: number; h: number; unit: 'px' | 'mm';
  /** PNG pixels per point. */
  scale: number;
  theme: 'light' | 'dark' | 'print';
  /** Tick labels in pt (px); the rest of the drawing keeps its proportion to them. */
  font: number;
  title: boolean;
  grid: boolean;
  /** A graph's file name: {column} {sequence} {tab} {project} {page} {date}. */
  name: string;
  dest: 'downloads' | 'folder';
  /** The legend (R8d): the curves, plus each mark's value and the cell's matrix value; where it goes. */
  legendMarks: boolean; legendValue: boolean; legendAt: 'below' | 'right' | 'inside';
  /** Several graphs (a held-E export): one file each, one multi-page PDF, or one figure of `gridCols` columns. */
  layout: 'each' | 'pdf' | 'grid'; gridCols: number;
}
export const EXPORT_DEFAULTS: ExportPrefs = {
  format: 'pdf', w: 0, h: 0, unit: 'px', scale: 2, theme: 'light', font: 11, title: true, grid: true, name: '{column}_{sequence}_{tab}', dest: 'downloads',
  legendMarks: true, legendValue: true, legendAt: 'below', layout: 'pdf', gridCols: 2,
};
/** Journal column widths. */
export const SIZE_PRESETS = [{ label: 'automatic', w: 0, unit: 'px' as const }, { label: 'single column · 85 mm', w: 85, unit: 'mm' as const }, { label: '1.5 column · 114 mm', w: 114, unit: 'mm' as const }, { label: 'double column · 174 mm', w: 174, unit: 'mm' as const }];
const PT_PER_MM = 72 / 25.4, BASE_FONT = 11;

export function cleanExport(raw: unknown): ExportPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, d = EXPORT_DEFAULTS;
  const one = <T>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : def);
  const size = (v: unknown) => (v === 0 ? 0 : num(v, 20, 5000, 0)), bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  return {
    format: one(r.format, ['pdf', 'png', 'svg', 'xvg'], d.format), w: size(r.w), h: size(r.h), unit: one(r.unit, ['px', 'mm'], d.unit),
    scale: num(r.scale, 0.5, 10, d.scale), theme: one(r.theme, ['light', 'dark', 'print'], d.theme), font: num(r.font, 4, 30, d.font),
    title: bool(r.title, d.title), grid: bool(r.grid, d.grid),
    name: typeof r.name === 'string' && r.name.trim() ? r.name : d.name, dest: one(r.dest, ['downloads', 'folder'], d.dest),
    legendMarks: bool(r.legendMarks, d.legendMarks), legendValue: bool(r.legendValue, d.legendValue), legendAt: one(r.legendAt, ['below', 'right', 'inside'], d.legendAt),
    layout: one(r.layout, ['each', 'pdf', 'grid'], d.layout), gridCols: Number.isInteger(r.gridCols) ? num(r.gridCols, 1, 6, d.gridCols) : d.gridCols,
  };
}

export interface SceneOpts {
  /** Output points per drawing unit: the font size over today's. */
  k?: number;
  /** A graph's size in drawing units; a matrix is scaled to `fit` points wide instead (it can't reflow). */
  w?: number; h?: number; fit?: number;
  theme?: ExportPrefs['theme']; title?: boolean; grid?: boolean;
  /** The legend's marks lines, and where it goes (R8d); absent = curves only, below, as before. */
  legend?: { marks: boolean; at: ExportPrefs['legendAt'] };
}

/** The scene options for these settings: sizes in points (mm × 72/25.4), drawn at font/11 so text gets the chosen size. */
export function exportLayout(p: ExportPrefs): SceneOpts {
  const k = p.font / BASE_FONT, pt = (v: number) => (p.unit === 'mm' ? v * PT_PER_MM : v);
  return { k, ...(p.w ? { w: pt(p.w) / k, fit: pt(p.w) } : {}), ...(p.h ? { h: pt(p.h) / k } : {}), theme: p.theme, title: p.title, grid: p.grid, legend: { marks: p.legendMarks, at: p.legendAt } };
}

/** A PNG's resolution when the size is physical (mm): 72 points per inch × the scale. */
export const pngDpi = (p: ExportPrefs) => (p.unit === 'mm' && p.w ? Math.round(72 * p.scale) : null);

/** What each format's menu line says under these settings (xvg's says what the data is). */
export function formatHints(p: ExportPrefs, xvg: string): Record<ExportFormatAll, string> {
  const size = p.w ? p.w + (p.h ? ' × ' + p.h : '') + ' ' + p.unit : 'automatic size', dpi = pngDpi(p);
  return { xvg, png: 'image, ' + (dpi ? dpi + ' dpi' : +p.scale.toFixed(2) + '×') + ' · ' + size, svg: 'vector, editable · ' + size, pdf: 'vector · ' + size };
}

/** A file name from the template; an empty field drops the separator before it; a name taken (any case) gets -2, -3… */
export function exportName(template: string, f: Record<string, string>, ext: string, taken: Set<string>): string {
  const base = fileBase(template.replace(/([_\-. /]?)\{(\w+)\}/g, (_, sep: string, k: string) => (f[k] == null ? sep + k : f[k] ? sep + f[k] : '')).replace(/^[_\-. /]+/, ''));
  let name = base + '.' + ext;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = base + '-' + i + '.' + ext;
  taken.add(name.toLowerCase());
  return name;
}
