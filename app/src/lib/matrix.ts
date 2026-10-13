// The matrix (batch 3, R4): one tile per cell for the page's metric, rows grouped by method (ranked, or in their own
// order), and what its export draws. Out of App.tsx so it can be checked against the golden exports.

import * as lib from './seq';
import { isPmfBuiltin, metricCell, metricTransform, metricUnit, scriptTransformName, tileText, type Tile } from './metrics';
import type { MatrixData } from './export';
import { scaleFor } from './scales';
import type { Column, MetricDef, Page, ScriptRef, Seq, Settings, Transform } from './types';

export type Group = [string, Seq[]];
export const tileKey = (rowId: string, col: string) => rowId + '|' + col;

export function matrixTiles(seqs: Seq[], cols: Column[], def: MetricDef, st: Settings, skip: lib.SkipFn): Map<string, Tile> {
  const m = new Map<string, Tile>();
  for (const s of seqs) for (const c of cols) m.set(tileKey(s.id, c.k), metricCell(s, c.k, def, { st, skip }));
  return m;
}

/** Rows grouped by method (unlabelled last), ranked by the mean of their values when `ranked`. */
export function groupRows(seqs: Seq[], cols: Column[], tiles: Map<string, Tile>, ranked: boolean): { glist: Group[]; anyGroup: boolean; order: string[] } {
  const meanOf = (s: Seq) => {
    const vs = cols.flatMap(c => { const t = tiles.get(tileKey(s.id, c.k)); return t?.kind === 'value' ? [t.v] : []; });
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
  };
  const ordered = ranked ? seqs.slice().sort((a, b) => meanOf(a) - meanOf(b)) : seqs;
  const gm = new Map<string, Seq[]>();
  for (const s of ordered) { const g = (s.group || '').trim(); if (!gm.has(g)) gm.set(g, []); gm.get(g)!.push(s); }
  const glist: Group[] = [...gm.entries()].sort((a, b) => (a[0] === '' ? 1 : 0) - (b[0] === '' ? 1 : 0));
  return { glist, anyGroup: glist.some(([g]) => g), order: glist.flatMap(([, rs]) => rs.map(s => s.id)) };
}

/** The runs a cell has for a metric: PMF runs, or the analyses of its type. */
export const uploaded = (s: Seq, col: string, def: MetricDef) => (def.type === 'pmf' ? s.runs.filter(r => r.sacch === col).length : s.extras.filter(e => e.sacch === col && e.type === def.type).length);
/** The metric's colour scale over the values on this page. */
export const scaleOf = (def: MetricDef, tiles: Map<string, Tile>) => scaleFor(def, [...tiles.values()].flatMap(t => (t.kind === 'value' ? [t.v] : [])));
export const tilesMax = (tiles: Map<string, Tile>) => [...tiles.values()].reduce((m, t) => (t.kind === 'value' ? Math.max(m, Math.abs(t.v)) : m), 0);

/** What the matrix export draws: the page's rows and columns, each value with its run count, the metric and its unit. */
export function matrixData(o: { project: string; page: Page | null; def: MetricDef; st: Settings; pmfT: Transform; cols: Column[]; glist: Group[]; anyGroup: boolean; tiles: Map<string, Tile>; scripts?: ScriptRef[] }): MatrixData {
  const { def, page } = o, unit = metricUnit(def, o.st), nSeqs = o.glist.reduce((n, [, rs]) => n + rs.length, 0);
  // The transform the tiles were made with (F138): the metric's own, else PMF's correction, else its type's.
  const t = !def.transform && def.type === 'pmf' ? o.pmfT : metricTransform(def, o.st);
  const tNote = t.kind === 'script' ? scriptTransformName(t, o.scripts) : t.kind === 'none' && def.type !== 'pmf' ? 'no transform' : lib.TRANSFORMS[t.kind].note;
  const desc = isPmfBuiltin(def) ? lib.METRIC_META[def.fn.kind === 'builtin' && def.fn.name === 'min' ? 'min' : 'area'].desc : def.label;
  return {
    file: 'pmf-matrix-' + (page ? page.name + '-' : '') + (isPmfBuiltin(def) ? def.id : def.label),
    kicker: 'PMF Sequences · ' + o.project,
    title: (page ? page.name : 'All sequences') + ' · ' + def.label,
    sub: o.project + ' · ' + desc + (unit ? ' · ' + unit : '') + ' · cell = mean of runs · ' + lib.plural(nSeqs, 'sequence') + ' · ' + tNote,
    metricLabel: def.label, unit, max: tilesMax(o.tiles), scale: scaleOf(def, o.tiles),
    cols: o.cols.map(c => ({ label: c.label, name: c.name, short: c.short, color: c.light, dk: c.dark })),
    groups: o.glist.map(([g, rs]) => ({
      label: g || 'no group', hasLabel: o.anyGroup,
      rows: rs.map(s => ({
        name: s.name || '(unnamed)', seq: s.seq || '', group: g,
        // n: the runs uploaded (the export's bars), hidden ones included, as on screen.
        // The value as the tile writes it (F137), and its spread: "± SD" over several runs or "± … block" for one run
        // (R8, F136; n is the bars).
        cells: o.cols.map(c => {
          const t = o.tiles.get(tileKey(s.id, c.k)), tx = t ? tileText(t, def, !!o.st.tileSpread) : null, sp = tx ? tx.spread.split(' · n ')[0] : '';
          return t?.kind === 'value' ? { v: t.v, n: uploaded(s, c.k, def), text: tx!.main, ...(sp ? { spread: sp } : {}) } : null;
        }),
      })),
    })),
  };
}
