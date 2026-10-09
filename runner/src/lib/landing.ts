// The landing preview (R6b, T33, T34): where PMF Sequences will put a result, by PMF Sequences' own
// planBatch on the real file, set up as Vault → Untracked files → attach sets it up: a blank upload form,
// the file's table and header, and its name parsed with the project's pattern (UploadDialog's `parsed`).

import { parseGmxHeader } from '../../../app/src/lib/gmxHeader';
import { blankUploadForm, getAnalyses, getCols, mergeSettings, parseName, parseTable, patternFields, planBatch, seqKey, SLOTS, type UploadFile } from '../../../app/src/lib/seq';
import { safeFileName } from '../../../app/src/lib/storage/path';
import type { Store } from '../../../app/src/lib/types';

export interface Fields { name: string; col: string; group: string; run: number; time: string }
export type Source = 'name' | 'path' | 'header';

export interface Landing {
  ok: boolean;
  row: string; seq: string; rowNew: boolean; group: string;
  /** A row with this name that PMF Sequences won't use, because its group or sequence differ: a second row would start. */
  twin?: { seq: string; group: string };
  col: { k: string; label: string; isNew: boolean };
  run: number;
  type: { k: string; label: string; how: string };
  /** Curve labels PMF Sequences imports, and every y column's legend in the file. */
  curves: { imported: string[]; inFile: string[] };
  from: Partial<Record<string, Source>>;
  replaces: boolean;
  problems: string[];
}

const settingsOf = (store: Store) => mergeSettings({}, store.settings);

export function landing(store: Store, fileName: string, text: string): Landing {
  const st = settingsOf(store), table = parseTable(text);
  const file: UploadFile = { id: 'f1', file: fileName, table: table.n >= 2 ? table : null, head: table.head, gmx: parseGmxHeader(text), parsed: parseName(fileName, st.pattern) };
  const p = planBatch(store, { ...blankUploadForm(st, getCols(store)), files: [file] }, getAnalyses(st), st)[0];
  // A row is the same row only by group, name and sequence together, as PMF Sequences matches it (seqKey).
  const row = store.seqs.find(s => seqKey(s.name, s.seq, s.group) === seqKey(p.name, p.seq, p.group));
  const twin = !row && p.name ? store.seqs.find(s => s.name.trim().toLowerCase() === p.name.trim().toLowerCase()) : undefined;
  const problems = [
    ...(p.err ? [p.err] : []), ...p.conflicts, ...(p.unknown ? ['PMF Sequences has no analysis type for ' + p.unknown] : []),
    ...(!p.name ? ['no row: neither the file name nor the folder gave a sequence or name'] : []),
  ];
  return {
    ok: p.ok, row: p.name, seq: p.seq, rowNew: !row, ...(twin ? { twin: { seq: twin.seq, group: twin.group } } : {}), group: p.group, col: { k: p.col.k, label: p.col.label, isNew: p.colNew }, run: SLOTS.indexOf(p.run) + 1,
    type: { k: p.ana.k, label: p.ana.label, how: p.anaHow }, curves: { imported: (p.curves || []).map(c => c.label), inFile: table.head.legends.filter(Boolean) },
    from: p.from as Landing['from'], replaces: p.replaces, problems,
  };
}

/** The project's file-name pattern filled with the fields (T34); a token without a value is listed, `{*}` becomes the analysis. */
export function nameFromPattern(pattern: string, f: Fields & { ana: string }): { name: string; missing: string[] } {
  const value: Record<string, string> = { ana: f.ana, group: f.group, col: f.col, name: f.name, seq: f.name, time: f.time, run: f.run ? String(f.run) : '', temp: '' };
  const missing: string[] = [];
  const text = pattern.replace(/\{([^}]*)\}/g, (token, inner: string) => {
    if (inner.trim() === '*') return f.ana;
    const [field] = patternFields(token);
    const v = field ? value[field] : '';
    if (!v) missing.push(token);
    return v || token;
  });
  return { name: safeFileName(/\.(xvg|dat|txt)$/i.test(text) ? text : text + '.xvg'), missing };
}

/** Why the preview is not where the fields say, in words; [] when it lands there. */
export function mismatch(l: Landing, f: Fields): string[] {
  const out: string[] = [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (!same(l.row, f.name)) out.push('row ' + (l.row || '(none)') + ', not ' + f.name);
  if (!same(l.col.label, f.col) && !same(l.col.k, f.col)) out.push('column ' + l.col.label + ', not ' + f.col);
  if (f.group && !same(l.group, f.group)) out.push('group ' + (l.group || '(none)') + ', not ' + f.group);
  if (l.run !== f.run) out.push('run ' + l.run + ', not ' + f.run);
  return out;
}
