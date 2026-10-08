// IDs become folder names (`<slug>--<id>`) and record file names, so data coming
// from outside the vault — a JSON export, legacy browser storage — must only
// carry IDs that are safe in a path. Unsafe ones get fresh IDs, with every
// reference (notes, visibility, literature, pages) following.

import type { Store } from '../types';
import { uid } from './json';
import { isSafeId } from './path';

const splitCell = (key: string): [string, string] => { const i = key.indexOf('_'); return [key.slice(0, i), key.slice(i + 1)]; };

export function sanitizeIds(store: Store): { store: Store; changed: string[] } {
  const changed: string[] = [];
  const colMap = new Map<string, string>(), rowMap = new Map<string, string>();
  const fresh = (old: string, p: string) => { const n = uid(p); changed.push(JSON.stringify(old) + ' → ' + n); return n; };
  for (const c of store.cols) if (!isSafeId(c.k)) colMap.set(c.k, fresh(c.k, 'c'));
  for (const s of store.seqs) if (!isSafeId(s.id)) rowMap.set(s.id, fresh(s.id, 's'));
  const anyOther = store.seqs.some(s => s.runs.some(r => !isSafeId(r.id)) || s.extras.some(e => !isSafeId(e.id) || e.curves.some(c => !isSafeId(c.id))) || s.structures.some(m => !isSafeId(m.id)))
    || store.pages.some(p => !isSafeId(p.id));
  if (!colMap.size && !rowMap.size && !anyOther) return { store, changed };

  const col = (k: string) => colMap.get(k) ?? k, row = (id: string) => rowMap.get(id) ?? id;
  const safe = (id: string, p: string) => (isSafeId(id) ? id : fresh(id, p));
  const cellKey = (key: string) => { const [k, r] = splitCell(key); return col(k) + '_' + row(r); };
  const remapKeys = <T>(o: Record<string, T>, f: (k: string) => string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

  return {
    changed,
    store: {
      ...store,
      cols: store.cols.map(c => ({ ...c, k: col(c.k) })),
      seqs: store.seqs.map(s => ({
        ...s, id: row(s.id),
        runs: s.runs.map(r => ({ ...r, id: safe(r.id, 'r'), sacch: col(r.sacch) })),
        extras: s.extras.map(e => ({ ...e, id: safe(e.id, 'x'), sacch: col(e.sacch), curves: e.curves.map(c => ({ ...c, id: safe(c.id, 'c') })) })),
        structures: s.structures.map(m => ({ ...m, id: safe(m.id, 'st') })),
      })),
      notes: { row: remapKeys(store.notes.row, row), cell: remapKeys(store.notes.cell, cellKey) },
      lit: remapKeys(store.lit, cellKey),
      vis: remapKeys(store.vis, k => { const [r, c, ...rest] = k.split('|'); return [row(r), col(c), ...rest].join('|'); }),
      pages: store.pages.map(p => ({ ...p, id: safe(p.id, 'pg'), rows: p.rows.map(row), cols: p.cols ? p.cols.map(col) : p.cols })),
    },
  };
}
