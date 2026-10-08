// Rebuilds XVG files from data the prototype kept only as parsed numbers
// (spec §16.5, decision D21). They get a distinguishable name, a header that
// says so, and origin "reconstructed" — they are never presented as originals.

import type { Curve, Run } from '../types';

const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 'nan' : String(v));

function stemOf(name: string, fallback: string) {
  const n = (name || '').trim();
  if (!n) return fallback;
  const dot = n.lastIndexOf('.');
  return dot > 0 ? n.slice(0, dot) : n;
}

export function reconstructedName(original: string, fallback: string) { return stemOf(original, fallback) + '.reconstructed.xvg'; }

function header(what: string, source: string, note: string) {
  return [
    '# RECONSTRUCTED by PMF Sequences — this is NOT the original upload.',
    '# The original file was not kept by the earlier version of the app; these',
    '# values were rebuilt from the parsed numbers it stored (' + note + ').',
    '# What: ' + what,
    '# Source: ' + source,
  ];
}

/** Two columns (x, y) of a PMF run. Values were stored rounded to 4 decimals. */
export function runXvg(run: Run, source: string): string {
  const L = header('PMF run ' + run.id + (run.file ? ' (originally ' + run.file + ')' : ''), source, 'x and y rounded to 4 decimals at upload');
  L.push('@    title "PMF (reconstructed)"', '@ s0 legend "PMF"');
  for (let i = 0; i < run.x.length; i++) L.push(num(run.x[i]) + ' ' + num(run.y[i]));
  return L.join('\n') + '\n';
}

/** One multi-column file for curves sharing an x grid; columns 2.. are the curves in order. */
export function curvesXvg(curves: Curve[], what: string, source: string): string {
  const L = header(what, source, '6 significant digits, x already multiplied by the analysis x multiplier');
  L.push('@    title "' + what.replace(/"/g, "'") + ' (reconstructed)"');
  curves.forEach((c, j) => L.push('@ s' + j + ' legend "' + String(c.label || 'col ' + (j + 2)).replace(/"/g, "'") + '"'));
  const x = curves[0].x;
  for (let i = 0; i < x.length; i++) L.push([num(x[i]), ...curves.map(c => num(c.y[i]))].join(' '));
  return L.join('\n') + '\n';
}

const sameGrid = (a: (number | null)[], b: (number | null)[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Groups curves into files: same source file name and identical x grid share one file. */
export function groupCurves(curves: Curve[]): Curve[][] {
  const groups: Curve[][] = [];
  for (const c of curves) {
    const g = groups.find(gr => (gr[0].file || '') === (c.file || '') && sameGrid(gr[0].x, c.x));
    if (g) g.push(c); else groups.push([c]);
  }
  return groups;
}
