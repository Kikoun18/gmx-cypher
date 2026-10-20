// gmx-cypher's own space in the vault (R14, T158): where its files go, and the copy of a record that names nothing
// of this machine. Pure: server/space.ts writes.

import { isSafeId, safeFileName } from '../../../matrix/src/lib/storage/path';
import type { RunRecord } from './record';

/** At the vault root, outside every project folder (all the Matrix scans), not hidden, and never `<slug>--<id>`. */
export const SPACE = 'gmx-cypher';

/** The space's files, from a SHA-256, a Matrix ID and a plain name only. */
export const spacePaths = {
  manifest: SPACE + '/space.json',
  readme: SPACE + '/README.md',
  /** A sent result's record, named by the sent file's SHA-256: the Matrix keeps files byte for byte (T148). */
  record(sha256: string) {
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(sha256 + ' is not a SHA-256');
    return SPACE + '/records/' + sha256 + '.run.json';
  },
  /** A saved compare view of a project (R11). */
  view(project: string, name: string) {
    if (!isSafeId(project)) throw new Error(project + ' is not a Matrix ID');
    if (!name || safeFileName(name) !== name) throw new Error(name + ' is not a plain name');
    return SPACE + '/projects/' + project + '/views/' + name + '.json';
  },
};

export interface PortableRecord extends RunRecord { envNames: string[]; copy: { paths: string; env: string } }

/** What compare shows (R14b): jobs by id, records on disk by path, vault RDFs by their Matrix IDs. */
export type ViewSource = { kind: 'job'; id: string } | { kind: 'record'; path: string } | { kind: 'vault'; project: string; row: string; rdf: string }

/**
 * A compare view saved in the space (R14b, question 24): its sources, how compare showed them (its view state, by
 * each source's id) and their groups' labels. In the space a record's path is relative to its allowed folder.
 */
export interface SavedView {
  format: 'gmx-cypher view'; version: 1; name: string; saved: string; by: string
  sources: ViewSource[]; view: Record<string, unknown>; labels: Record<string, Record<string, string>>
}

/** Each record's path, as `to` gives it, wherever the view names it: its source, and its id (`record:<path>`) in the view and the labels. */
function mapRecords(v: SavedView, to: (path: string) => string): SavedView {
  const pairs = v.sources.flatMap(s => (s.kind === 'record' && to(s.path) !== s.path ? [[s.path, to(s.path)]] : [])).sort((a, b) => b[0].length - a[0].length);
  const id = (p: string) => JSON.stringify('record:' + p).slice(1, -1);
  let text = JSON.stringify({ view: v.view, labels: v.labels });
  for (const [from, into] of pairs) text = text.split(id(from)).join(id(into));
  const { view, labels } = JSON.parse(text) as Pick<SavedView, 'view' | 'labels'>;
  return { ...v, sources: v.sources.map(s => (s.kind === 'record' ? { ...s, path: to(s.path) } : s)), view, labels };
}

/**
 * A view as the space keeps it (T158): each record's path relative to the longest allowed folder holding it. Two records
 * that would read the same so are refused, and so is a record named in the view that is not among its sources (review):
 * either would carry a wrong or an absolute path into the vault.
 */
export function portableView(v: SavedView, roots: string[]): SavedView {
  const rs = [...roots].sort((a, b) => b.length - a.length), seen = new Map<string, string>();
  const out = mapRecords(v, p => {
    if (!p.startsWith('/')) return p;
    const root = rs.find(x => p.startsWith(x + '/'));
    if (!root) throw new Error(p + ' is outside the allowed folders: a saved view names records by their place in them');
    const rel = p.slice(root.length + 1);
    if (seen.has(rel) && seen.get(rel) !== p) throw new Error(seen.get(rel) + ' and ' + p + ' would both be saved as ' + rel + ': keep one of them in the view');
    seen.set(rel, p);
    return rel;
  });
  const left = /"record:(\/[^"]*)"/.exec(JSON.stringify({ view: out.view, labels: out.labels }));
  if (left) throw new Error('the view still names ' + left[1] + ', which is not among its sources');
  return out;
}

/** A view opened again: each record under the first allowed folder that has it; `missing`, those found under none. */
export function resolvedView(v: SavedView, roots: string[], exists: (path: string) => boolean): { view: SavedView; missing: string[] } {
  const missing: string[] = [];
  const view = mapRecords(v, p => {
    if (p.startsWith('/')) return p;
    const found = roots.map(r => r + '/' + p).find(exists);
    if (!found) missing.push(p);
    return found ?? p;
  });
  return { view, missing: [...new Set(missing)] };
}

/**
 * A record as the space keeps it (T158): a vault may be shared or put in Git, so every path inside an allowed folder
 * becomes relative to it, any other keeps only its name, the log's, the arguments' and the options' folders likewise
 * (home as ~; gmx's own folder by its name), and the environment keeps its names, not its values. A folder is replaced
 * only where it ends (review: /data never turns /database into .base). Groups, hashes and states are the record's own.
 */
export function portableRecord(r: RunRecord, roots: string[], home: string): PortableRecord {
  const rs = [...roots].sort((a, b) => b.length - a.length);
  const path = (p: string) => { const root = rs.find(x => p === x || p.startsWith(x + '/')); return root ? p.slice(root.length + 1) || '.' : p.split('/').pop() || p; };
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A folder, where it ends: followed by / (its contents, relative), or by a space, a quote or the end (itself).
  const swap = (s: string, x: string, inside: string, itself: string) => s.replace(new RegExp(esc(x) + '(/|(?=[\\s"\',;:)]|$))', 'gm'), (_, slash: string) => (slash ? inside : itself));
  const gmxDir = r.gmx.path.split('/').slice(0, -1).join('/'), prefix = gmxDir.split('/').slice(0, -1).join('/');
  const text = (s: string) => {
    for (const x of rs) s = swap(s, x, '', '.');
    // gmx's banner names its own install: kept by its last folder's name only.
    if (gmxDir) s = swap(s, gmxDir, '', gmxDir.split('/').pop() || '.');
    if (prefix) s = swap(s, prefix, prefix.split('/').pop() + '/', prefix.split('/').pop() || '.');
    return home ? swap(s, home, '~/', '~') : s;
  };
  const value = <V,>(v: V): V => (typeof v === 'string' ? (text(v) as V) : v);
  const file = <F extends { path: string }>(f: F): F => ({ ...f, path: path(f.path) });
  return {
    ...r,
    gmx: { ...r.gmx, path: path(r.gmx.path) },
    command: { ...r.command, cwd: path(r.command.cwd), file: path(r.command.file), args: r.command.args.map(text) },
    options: r.options.map(o => ({ ...o, value: value(o.value) })),
    env: {}, envNames: Object.keys(r.env).sort(),
    log: text(r.log),
    inputs: Object.fromEntries(Object.entries(r.inputs).map(([k, f]) => [k, f && file(f)])),
    outputs: r.outputs.map(file),
    ...(r.windows ? { windows: r.windows.map(w => ({ tpr: file(w.tpr), pull: file(w.pull) })) } : {}),
    recipe: { ...r.recipe, options: Object.fromEntries(Object.entries(r.recipe.options ?? {}).map(([k, v]) => [k, value(v)])), outDir: r.recipe.outDir && path(r.recipe.outDir), ...(r.recipe.windows ? { windows: r.recipe.windows.map(w => ({ tpr: path(w.tpr), pull: path(w.pull) })) } : {}) },
    copy: { paths: 'relative to their allowed folder', env: 'names only' },
  };
}
