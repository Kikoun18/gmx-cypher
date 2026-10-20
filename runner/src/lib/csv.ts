// A chart's data as CSV (R6a): `#` lines saying where it came from, one header row of names and units, then every
// point at gmx's own precision: the xvg's text fields as gmx wrote them, never numbers formatted again.

import type { RunRecord } from './record';

/** Where a result came from: its command, gmx, record, source file and groups (label → gmx name and atoms). */
export interface CsvMeta { command?: string; directory?: string; gmx?: string; record?: string; source?: { name: string; sha256: string }; groups?: { label: string; name: string; atoms: string }[]; notes?: string[] }

/** A command-line word as a shell reads it back: quoted when it holds anything but plain characters. */
const word = (a: string) => (/^[\w./:=+@%-]+$/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'");

/** The `#` lines of a run's record: what ran, where, with which gmx; the source xvg and its SHA-256; each group's label, gmx name and atoms. */
export function csvMeta(r: RunRecord, recordPath: string, source: string, label: (g: RunRecord['groups'][number]) => string): CsvMeta {
  const out = r.outputs.find(o => o.path.split('/').pop() === source);
  return {
    command: [r.command.file.split('/').pop()!, ...r.command.args].map(word).join(' '), directory: r.command.cwd, gmx: r.gmx.version, record: recordPath,
    ...(out ? { source: { name: source, sha256: out.sha256 } } : {}),
    groups: r.groups.map(g => ({ label: label(g), name: g.name, atoms: g.atoms })),
  };
}

/** A CSV field: quoted when it holds a comma, a quote or a line break. */
const field = (s: string) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
/** A label's unit: its last parentheses after a space (`kJ/mol` of `E (kJ/mol)`, none in `g(r)`); a bare unit (`kJ/mol`) is its own. */
const unitOf = (label: string) => /(?:^|\s)\(([^()]*)\)\s*$/.exec(label)?.[1] ?? (/^[^\s()]*\/[^\s()]*$/.test(label.trim()) ? label.trim() : '');

/** An xvg's data rows: each numeric line's fields as written (comments, @ lines and anything else left out). */
function fieldsOf(text: string): string[][] {
  return text.split(/\r?\n/).flatMap(l => {
    const t = l.trim();
    if (!t || t[0] === '#' || t[0] === '@') return [];
    const f = t.split(/\s+/);
    return f.every(v => Number.isFinite(Number(v)) || /^-?(nan|inf)/i.test(v)) ? [f] : [];
  });
}

/**
 * The CSV of a chart's curves, each column `col` (1-based, after x) of an xvg's text: one x column when every curve's
 * x is written the same, else an x column beside each curve. Each value is the field as gmx wrote it.
 */
export function xvgCsv(parts: { text: string; col: number; name: string }[], xlabel: string, ylabel: string, meta: CsvMeta): string {
  const cache = new Map<string, string[][]>(), rows = (t: string) => cache.get(t) ?? (cache.set(t, fieldsOf(t)), cache.get(t)!);
  return tableCsv(parts.map(p => { const r = rows(p.text); return { x: r.map(f => f[0]), y: r.map(f => f[p.col] ?? ''), name: p.name } }), xlabel, ylabel, meta);
}

/** The CSV of curves read elsewhere ((de)Cypher's, the vault's): each value as JavaScript writes it back, the same number exactly. */
export const curvesCsv = (curves: { name: string; x: number[]; y: number[] }[], xlabel: string, ylabel: string, meta: CsvMeta = {}) =>
  tableCsv(curves.map(c => ({ x: c.x.map(String), y: c.y.map(String), name: c.name })), xlabel, ylabel, meta);

function tableCsv(cols: { x: string[]; y: string[]; name: string }[], xlabel: string, ylabel: string, meta: CsvMeta): string {
  const unit = unitOf(ylabel), named = (n: string) => (unit && !n.endsWith('(' + unit + ')') ? n + ' (' + unit + ')' : n);
  const shared = cols.every(c => c.x.length === cols[0].x.length && c.x.every((v, i) => v === cols[0].x[i]));
  const head = shared ? [xlabel, ...cols.map(c => named(c.name))] : cols.flatMap(c => [xlabel + ' · ' + c.name, named(c.name)]);
  const n = Math.max(0, ...cols.map(c => c.x.length));
  const body = Array.from({ length: n }, (_, i) => (shared ? [cols[0].x[i], ...cols.map(c => c.y[i])] : cols.flatMap(c => [c.x[i] ?? '', c.y[i] ?? ''])));
  const notes = [
    ...(meta.command ? ['command: ' + meta.command] : []), ...(meta.directory ? ['directory: ' + meta.directory] : []), ...(meta.gmx ? ['gmx: ' + meta.gmx] : []),
    ...(meta.record ? ['record: ' + meta.record] : []), ...(meta.source ? ['source: ' + meta.source.name + ' sha256 ' + meta.source.sha256] : []),
    ...(meta.groups ?? []).map(g => 'group ' + g.label + ': gmx name ' + g.name + ', atoms ' + g.atoms), ...(meta.notes ?? []),
  ];
  return [...notes.map(l => '# ' + l.replace(/[\r\n]+/g, ' ')), head.map(field).join(','), ...body.map(r => r.map(field).join(','))].join('\n') + '\n';
}
