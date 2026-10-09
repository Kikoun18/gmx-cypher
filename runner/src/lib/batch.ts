// Batches (R7b, T38): which trajectories a path template takes, matched with PMF Sequences' own parsePath
// on each path relative to the batch root, so its tokens, `**` and `{*}` mean what they mean there.

import { parsePath, SLOTS } from '../../../app/src/lib/seq';
import type { Fields } from './landing';

export interface BatchMatch { fields: Partial<Record<'ana' | 'group' | 'col' | 'name' | 'seq' | 'time' | 'run' | 'temp', string>>; run: number | null; problems: string[] }

export function matchTrajectory(rel: string, template: string): BatchMatch | null {
  const p = parsePath(rel, template);
  if (!p.matched) return null;
  const run = p.fields.run ? SLOTS.indexOf(p.fields.run as (typeof SLOTS)[number]) + 1 : null;
  return { fields: p.fields, run, problems: p.bad?.run ? ['run: ' + p.bad.run + ' is not a run number 1–' + SLOTS.length] : [] };
}

/** A match's fields as the send dialog takes them (R6): the sequence stands in for the name, as in PMF Sequences. */
export function vaultFields(m: BatchMatch): Fields {
  const f = m.fields;
  return { name: f.name || f.seq || '', col: f.col || '', group: f.group || '', run: m.run ?? 0, time: f.time || '' };
}

/** A match's fields as values for the output-name template's tokens (`{method}` is PMF Sequences' group). */
export function nameValues(m: BatchMatch): Record<string, string> {
  const f = m.fields, v: Record<string, string | undefined> = { method: f.group, column: f.col, name: f.name, seq: f.seq, time: f.time, temp: f.temp, run: m.run ? String(m.run) : undefined };
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x)) as Record<string, string>;
}
