// The prototype's browser storage. This is the ONLY code that reads it (spec §15):
//
//   localStorage  pmf-seq-store-v1        the single-dataset store (before projects)
//                 pmf-seq-settings-v1     settings (global UI + older project keys)
//                 pmf-seq-projects-v1     project index (multi-project version)
//                 pmf-seq-project-<id>    one store per project
//   IndexedDB     pmf-seq-structures      store "files": structure id → file text
//
// It only reads. Nothing here writes or deletes, except removeBrowserLegacy(),
// which runs solely on an explicit user action after a verified migration.
//
// A "legacy dump" (decision D43) is the same data as one JSON file, made by a
// console snippet in the old app's tab — migration then works across origins and
// headlessly, and the test fixture uses the same format.

import { normStore, splitSettings } from '../../seq';
import type { Settings, Store } from '../../types';

export const DUMP_FORMAT = 'pmf-legacy-dump';
export const LS_PREFIX = 'pmf-seq-';
const STORE_KEY = 'pmf-seq-store-v1', SETTINGS_KEY = 'pmf-seq-settings-v1', INDEX_KEY = 'pmf-seq-projects-v1', PROJECT_PREFIX = 'pmf-seq-project-';
const IDB = 'pmf-seq-structures', IDB_STORE = 'files';

export interface LegacyDump {
  format: typeof DUMP_FORMAT;
  version: 1;
  origin?: string;
  dumped?: string;
  /** Raw localStorage values (strings, as stored) for every pmf-seq-* key. */
  localStorage: Record<string, string>;
  indexedDB: { [IDB]?: { files: Record<string, string> } };
}

export interface LegacyProject {
  id: string;
  name: string;
  desc: string;
  created: string | null;
  /** Where it came from (a localStorage key). */
  key: string;
  store: Store;
}

export interface LegacyData {
  projects: LegacyProject[];
  /** Browser-wide preferences (theme, laser) from the old settings key. */
  prefs: Partial<Settings>;
  /** Structure file text by structure id. */
  structures: Record<string, string>;
  warnings: string[];
  source: { origin: string | null; dumped: string | null };
}

// --- reading -----------------------------------------------------------------------------------

/** True if this browser has prototype data (cheap: localStorage keys only). */
export function hasBrowserLegacy(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_PREFIX)) return true; }
  } catch { /* storage blocked */ }
  return false;
}

/** Reads the prototype's data from this browser, without changing anything. */
export async function readBrowserLegacy(): Promise<LegacyDump> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) ls[k] = localStorage.getItem(k) ?? '';
  }
  const files = await new Promise<Record<string, string>>(res => {
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(IDB); } catch { res({}); return; }
    // No such database: abort the upgrade so nothing gets created.
    r.onupgradeneeded = () => { r.transaction?.abort(); };
    r.onerror = () => res({});
    r.onblocked = () => res({});
    r.onsuccess = () => {
      const db = r.result, out: Record<string, string> = {};
      if (!db.objectStoreNames.contains(IDB_STORE)) { db.close(); res(out); return; }
      const t = db.transaction(IDB_STORE, 'readonly');
      const cur = t.objectStore(IDB_STORE).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out[String(c.key)] = String(c.value); c.continue(); } };
      t.oncomplete = () => { db.close(); res(out); };
      t.onerror = t.onabort = () => { db.close(); res(out); };
    };
  });
  return { format: DUMP_FORMAT, version: 1, origin: typeof location !== 'undefined' ? location.origin : undefined, dumped: new Date().toISOString(), localStorage: ls, indexedDB: { [IDB]: { files } } };
}

export function parseDump(text: string): LegacyDump {
  const d = JSON.parse(text) as Partial<LegacyDump>;
  if (!d || d.format !== DUMP_FORMAT) throw new Error('Not a legacy dump (expected format "' + DUMP_FORMAT + '").');
  if (d.version !== 1) throw new Error('Unsupported legacy dump version ' + String(d.version) + '.');
  if (!d.localStorage || typeof d.localStorage !== 'object') throw new Error('The dump has no localStorage section.');
  return { format: DUMP_FORMAT, version: 1, origin: d.origin, dumped: d.dumped, localStorage: d.localStorage, indexedDB: d.indexedDB || {} };
}

// --- interpreting ----------------------------------------------------------------------------------

interface IndexMeta { id: string; name?: string; desc?: string; key: string; created?: string }

const json = (raw: string | undefined, what: string, warnings: string[]): unknown => {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { warnings.push(what + ' is not valid JSON and was skipped.'); return null; }
};

/** The projects, preferences and structure files in a dump, the way the prototype read them. */
export function interpretDump(d: LegacyDump): LegacyData {
  const warnings: string[] = [];
  const ls = d.localStorage;
  const settings = (json(ls[SETTINGS_KEY], SETTINGS_KEY, warnings) || {}) as Partial<Settings>;
  const { project: globalProject, app: prefs } = splitSettings(settings);
  const index = json(ls[INDEX_KEY], INDEX_KEY, warnings) as { list?: IndexMeta[] } | null;
  const projects: LegacyProject[] = [];
  const used = new Set<string>();

  const load = (key: string, what: string): Store | null => {
    const raw = json(ls[key], what, warnings);
    if (raw == null) return null;
    const s = raw as Partial<Store>;
    if (!Array.isArray(s.seqs)) { warnings.push(what + ' has no sequences list and was skipped.'); return null; }
    return normStore(s);
  };

  if (index && Array.isArray(index.list) && index.list.length) {
    // Multi-project version: each project's store under its own key (the first
    // one may still be the original pmf-seq-store-v1). Their settings travel with them.
    for (const m of index.list) {
      if (!m || !m.key || !m.id) continue;
      used.add(m.key);
      const store = load(m.key, 'Project "' + (m.name || m.id) + '" (' + m.key + ')');
      if (!store) { if (ls[m.key] == null) warnings.push('Project "' + (m.name || m.id) + '" is listed but its data (' + m.key + ') is missing.'); continue; }
      projects.push({ id: m.id, name: (m.name || '').trim() || 'Untitled project', desc: m.desc || '', created: m.created || null, key: m.key, store });
    }
  } else if (ls[STORE_KEY] != null) {
    // Single-dataset version: one store; its data settings lived in the settings key.
    used.add(STORE_KEY);
    const store = load(STORE_KEY, STORE_KEY);
    if (store) projects.push({ id: '', name: 'My project', desc: '', created: null, key: STORE_KEY, store: { ...store, settings: { ...globalProject, ...(store.settings || {}) } } });
  }
  // Project stores the index doesn't list (e.g. a half-finished delete) are kept, not dropped.
  for (const key of Object.keys(ls).sort()) {
    if (used.has(key) || !(key.startsWith(PROJECT_PREFIX) || key === STORE_KEY)) continue;
    const store = load(key, key);
    if (!store) continue;
    const id = key.startsWith(PROJECT_PREFIX) ? key.slice(PROJECT_PREFIX.length) : '';
    warnings.push(key + ' is not in the project index; migrated as "Recovered ' + (id || 'dataset') + '".');
    projects.push({ id, name: 'Recovered ' + (id || 'dataset'), desc: '', created: null, key, store });
  }
  const files = d.indexedDB?.[IDB]?.files || {};
  return { projects, prefs, structures: { ...files }, warnings, source: { origin: d.origin || null, dumped: d.dumped || null } };
}

// --- removal (explicit, after verification only) ------------------------------------------------------

/**
 * Deletes the prototype's browser data. Only ever called from an explicit user
 * action, after a migration whose verification passed (spec §16.9).
 */
export async function removeBrowserLegacy(): Promise<void> {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_PREFIX)) keys.push(k); }
  for (const k of keys) localStorage.removeItem(k);
  await new Promise<void>(res => {
    try {
      const r = indexedDB.deleteDatabase(IDB);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch { res(); }
  });
}
