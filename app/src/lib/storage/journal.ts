// Intent journal for multi-file operations (spec §12, decision D27).
//
//   1. begin()   — entry written with phase "content": what will be created/moved
//   2. content files written / moved
//   3. commit()  — entry rewritten with phase "commit" and the full record
//                  contents: this single atomic write is the commit point
//   4. records applied, then the "after" steps (trash moves, removals)
//   5. end()     — entry deleted
//
// On open, recover() rolls a "content" entry back and rolls a "commit" entry
// forward. Every step is idempotent.

import type { StorageBackend } from './backend/types';
import type { VaultIO } from './io';
import { join, vaultPaths } from './path';
import { stableStringify, uid } from './json';

export type Step =
  | { kind: 'move'; from: string; to: string }
  | { kind: 'remove'; path: string; recursive?: boolean }
  | { kind: 'rmdirIfEmpty'; path: string }
  | { kind: 'write'; path: string; text: string };

export interface JournalEntry {
  id: string;
  op: string;
  created: string;
  phase: 'content' | 'commit';
  /** New files written in the content phase (deleted on rollback). */
  wrote: string[];
  /** Directories created in the content phase (removed on rollback if empty). */
  mkdirs: string[];
  /** Moves done in the content phase (reversed on rollback). */
  moves: { from: string; to: string }[];
  /** Record files to write (text) or delete (null) at the commit point. */
  records: { path: string; text: string | null }[];
  /** Steps after the commit point: trash moves, removals, trash manifests. */
  after: Step[];
}

const entryPath = (id: string) => join(vaultPaths.journal, id + '.json');

export function newEntry(op: string): JournalEntry {
  return { id: new Date().toISOString().replace(/[-:.]/g, '') + '-' + uid('j'), op, created: new Date().toISOString(), phase: 'content', wrote: [], mkdirs: [], moves: [], records: [], after: [] };
}

export async function begin(io: VaultIO, e: JournalEntry) { await io.backend.writeText(entryPath(e.id), stableStringify(e)); }

export async function commit(io: VaultIO, e: JournalEntry) {
  e.phase = 'commit';
  await io.backend.writeText(entryPath(e.id), stableStringify(e));
}

async function exists(b: StorageBackend, p: string) { return !!(await b.stat(p)); }

async function runStep(io: VaultIO, s: Step) {
  const b = io.backend;
  if (s.kind === 'move') {
    if (await exists(b, s.from) && !(await exists(b, s.to))) await io.move(s.from, s.to);
  } else if (s.kind === 'remove') {
    await io.remove(s.path, !!s.recursive);
  } else if (s.kind === 'rmdirIfEmpty') {
    const st = await b.stat(s.path);
    if (st && st.kind === 'dir' && !(await b.list(s.path)).length) await io.remove(s.path);
  } else {
    await b.writeText(s.path, s.text);
  }
}

/** Steps 4: records then the after-steps. Safe to run again after a crash. */
export async function applyCommitted(io: VaultIO, e: JournalEntry) {
  for (const r of e.records) {
    if (r.text == null) await io.remove(r.path);
    else await io.writeText(r.path, r.text, { force: true });
  }
  for (const s of e.after) await runStep(io, s);
}

export async function end(io: VaultIO, e: JournalEntry) { await io.backend.remove(entryPath(e.id)); }

/** Undo a content-phase entry: move things back, delete what was created. */
export async function rollback(io: VaultIO, e: JournalEntry) {
  const b = io.backend;
  for (const m of [...e.moves].reverse()) if (await exists(b, m.to) && !(await exists(b, m.from))) await io.move(m.to, m.from);
  for (const p of e.wrote) await io.remove(p);
  for (const d of [...e.mkdirs].reverse()) await runStep(io, { kind: 'rmdirIfEmpty', path: d });
}

export interface Recovered { id: string; op: string; action: 'rolled-back' | 'completed' | 'unreadable' }

export async function recover(io: VaultIO): Promise<Recovered[]> {
  const b = io.backend, out: Recovered[] = [];
  if (!(await exists(b, vaultPaths.journal))) return out;
  for (const f of await b.list(vaultPaths.journal)) {
    if (f.kind !== 'file' || !f.name.endsWith('.json')) continue;
    const p = join(vaultPaths.journal, f.name);
    let e: JournalEntry;
    try { e = JSON.parse(await b.readText(p)); } catch { out.push({ id: f.name, op: '?', action: 'unreadable' }); continue; }
    if (e.phase === 'commit') { await applyCommitted(io, e); out.push({ id: e.id, op: e.op, action: 'completed' }); }
    else { await rollback(io, e); out.push({ id: e.id, op: e.op, action: 'rolled-back' }); }
    await b.remove(p);
  }
  return out;
}

/**
 * Runs a whole operation through the journal. `content` performs (and records
 * in the entry) the content-phase work; records and after-steps are applied
 * after the commit point.
 */
export async function transact(io: VaultIO, e: JournalEntry, content: (e: JournalEntry) => Promise<void>) {
  await begin(io, e);
  try { await content(e); } catch (err) {
    // Content phase failed: undo it now (recover() would do the same on next open).
    // If even that fails (e.g. permission lost), the entry stays for recover().
    try { await rollback(io, e); await end(io, e); } catch { /* left for recovery */ }
    throw err;
  }
  await commit(io, e);
  await applyCommitted(io, e);
  await end(io, e);
}
