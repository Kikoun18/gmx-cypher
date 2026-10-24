// Batches (R7b, T38): which trajectories a path template takes, matched with the Matrix's own parsePath
// on each path relative to the batch root, so its tokens, `**` and `{*}` mean what they mean there.

import { parsePath, SLOTS } from '../../../matrix/src/lib/seq';
import type { Fields } from './landing';

export interface BatchMatch { fields: Partial<Record<'ana' | 'group' | 'col' | 'name' | 'seq' | 'time' | 'run' | 'temp', string>>; run: number | null; problems: string[] }

export function matchTrajectory(rel: string, template: string): BatchMatch | null {
  const p = parsePath(rel, template);
  if (!p.matched) return null;
  const run = p.fields.run ? SLOTS.indexOf(p.fields.run as (typeof SLOTS)[number]) + 1 : null;
  return { fields: p.fields, run, problems: p.bad?.run ? ['run: ' + p.bad.run + ' is not a run number 1–' + SLOTS.length] : [] };
}

/** A match's fields as the send dialog takes them (R6): the sequence stands in for the name, as in the Matrix. */
export function vaultFields(m: BatchMatch): Fields {
  const f = m.fields;
  return { name: f.name || f.seq || '', col: f.col || '', group: f.group || '', run: m.run ?? 0, time: f.time || '' };
}

/** A match's fields as values for the output-name template's tokens (`{method}` is the Matrix's group). */
export function nameValues(m: BatchMatch): Record<string, string> {
  const f = m.fields, v: Record<string, string | undefined> = { method: f.group, column: f.col, name: f.name, seq: f.seq, time: f.time, temp: f.temp, run: m.run ? String(m.run) : undefined };
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x)) as Record<string, string>;
}

const STATES = ['running', 'waiting', 'failed', 'interrupted', 'refused', 'cancelled'] as const;

/** A batch's progress in one sentence, for its live region (review finding 9): done first, then each other state that has items. */
export function batchSummary(items: { status: string; job?: string }[], jobStatus: (id: string) => string | undefined): string {
  const n: Record<string, number> = {};
  for (const i of items) {
    const s = i.status === 'started' ? jobStatus(i.job!) ?? 'running' : i.status === 'starting' ? 'running' : i.status === 'queued' ? 'waiting' : i.status;
    n[s] = (n[s] || 0) + 1;
  }
  return [(n.done || 0) + ' of ' + items.length + ' done', ...STATES.filter(s => n[s]).map(s => n[s] + ' ' + s)].join(' · ');
}

/** What send all did, in one sentence. */
export function sentSummary(results: { sent?: string; skipped?: string }[]): string {
  const sent = results.filter(r => r.sent).length, not = results.length - sent;
  return sent + ' sent to the vault' + (not ? ' · ' + not + ' not sent, listed above' : '');
}
