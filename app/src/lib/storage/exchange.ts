// Dataset JSON. The export carries the original files as base64 next to the Store
// (decision D14), so it reopens byte-identical anywhere. v5 (R2): runs carry `tags`
// and settings may carry the project's tag list. Import keeps IDs where they don't
// collide (spec §16) and also reads v4 and v3, whose runs carry `methods` (loaded as
// tags by normStore); v3 has structure text in `structData` and no originals — runs
// and curves without an original get a reconstructed file (decision D21).

import { importAsStore, importJSON } from '../seq';
import type { Settings, Store } from '../types';
import { newFileId } from './files';
import { sha256Hex, uid } from './json';
import type { Upload } from './plan';
import type { FileOrigin } from './records';
import { isSafeId } from './path';
import { sanitizeIds } from './ids';

export const EXPORT_FORMAT = 'pmf-sequences';
export const EXPORT_VERSION = 7;

export interface ExportedFile { name: string; sha256: string; size: number; mime: string; origin: string; base64: string }

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Every original a Store refers to. */
export function fileIdsOf(store: Store): string[] {
  const ids = new Set<string>();
  for (const s of store.seqs) {
    for (const r of s.runs) if (r.src) ids.add(r.src.fileId);
    for (const e of s.extras) for (const c of e.curves) if (c.src) ids.add(c.src.fileId);
    for (const m of s.structures) if (m.fileId) ids.add(m.fileId);
  }
  for (const k of store.scripts || []) ids.add(k.fileId);
  return [...ids];
}

/** The Store without load-state markers (they describe this tab, not the data). */
function clean(store: Store): Store {
  return {
    ...store,
    seqs: store.seqs.map(s => ({
      ...s,
      runs: s.runs.map(({ state: _s, ...r }) => r),
      extras: s.extras.map(e => ({ ...e, curves: e.curves.map(({ state: _c, axis: _a, names: _n, ...c }) => c) })),
      structures: s.structures.map(({ state: _m, ...m }) => m),
    })),
  };
}

export interface ExportSource {
  read: (fileId: string) => Promise<Blob>;
  meta: (fileId: string) => { name: string; sha256: string; mime: string; origin: string } | undefined;
}

/** A v5 export. Originals that can't be read are listed in `missing` (the Store still has their arrays). */
export async function exportDataset(store: Store, o: { project: string; settings: Partial<Settings>; src: ExportSource }): Promise<{ text: string; missing: string[] }> {
  const files: Record<string, ExportedFile> = {}, missing: string[] = [];
  for (const id of fileIdsOf(store)) {
    const m = o.src.meta(id);
    try {
      const bytes = new Uint8Array(await (await o.src.read(id)).arrayBuffer());
      files[id] = { name: m?.name || id, sha256: m?.sha256 || (await sha256Hex(bytes)), size: bytes.byteLength, mime: m?.mime || '', origin: m?.origin || 'upload', base64: toBase64(bytes) };
    } catch { missing.push(m?.name || id); }
  }
  const body = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported: new Date().toISOString(), project: o.project, ...clean({ ...store, settings: o.settings }), files };
  return { text: JSON.stringify(body, null, 2), missing };
}

export interface PreparedImport {
  store: Store;
  uploads: Map<string, Upload>;
  name: string;
  version: number;
  /** Things the file referred to but didn't contain (e.g. structures without their text). */
  dropped: string[];
}

const ORIGINS: FileOrigin[] = ['upload', 'migrated-from-indexeddb', 'reconstructed'];

type RawRun = { src?: { fileId: string } };
type RawCurve = { src?: { fileId: string } };
type RawStruct = { id: string; name?: string; fileId?: string };
type RawScript = { id: string; name?: string; fileId: string };
type RawSeq = { runs?: RawRun[]; extras?: { curves?: RawCurve[] }[]; structures?: RawStruct[] };

/**
 * Keeps each file's ID unless it is unsafe or already used in the target
 * project (then it gets a fresh one), turns embedded originals and v3 structure
 * text into uploads, and drops references to originals the file doesn't carry
 * (they are reconstructed).
 */
async function rekey(raw: Record<string, unknown>, taken: Set<string>): Promise<{ uploads: Map<string, Upload>; dropped: string[] }> {
  const files = (raw.files && typeof raw.files === 'object' ? raw.files : {}) as Record<string, ExportedFile>;
  const structData = (raw.structData && typeof raw.structData === 'object' ? raw.structData : {}) as Record<string, string>;
  const uploads = new Map<string, Upload>(), idMap = new Map<string, string>(), dropped: string[] = [];
  const take = async (old: string): Promise<string | null> => {
    if (idMap.has(old)) return idMap.get(old)!;
    const f = files[old];
    if (!f || typeof f.base64 !== 'string') return null;
    const bytes = fromBase64(f.base64);
    if (f.sha256 && (await sha256Hex(bytes)) !== f.sha256) { dropped.push((f.name || old) + ' (checksum mismatch)'); return null; }
    const id = isSafeId(old) && !taken.has(old) ? old : newFileId();
    taken.add(id);
    uploads.set(id, { blob: new Blob([bytes], { type: f.mime || '' }), name: f.name || old, origin: ORIGINS.includes(f.origin as FileOrigin) ? (f.origin as FileOrigin) : 'upload' });
    idMap.set(old, id);
    return id;
  };
  for (const s of (Array.isArray(raw.seqs) ? raw.seqs : []) as RawSeq[]) {
    for (const r of s.runs || []) if (r.src) { const id = await take(r.src.fileId); if (id) r.src = { ...r.src, fileId: id }; else delete r.src; }
    for (const e of s.extras || []) for (const c of e.curves || []) if (c.src) { const id = await take(c.src.fileId); if (id) c.src = { ...c.src, fileId: id }; else delete c.src; }
    const keep: RawStruct[] = [];
    for (const m of s.structures || []) {
      let id = m.fileId ? await take(m.fileId) : null;
      if (!id && typeof structData[m.id] === 'string') {
        id = newFileId();
        uploads.set(id, { blob: new Blob([structData[m.id]], { type: 'text/plain' }), name: m.name || m.id });
      }
      if (id) keep.push({ ...m, fileId: id }); else dropped.push('structure ' + (m.name || m.id) + ' (no file in the export)');
    }
    s.structures = keep;
  }
  // Scripts always arrive as new records, so each asks for trust again (F96); metrics follow them.
  const scriptIds = new Map<string, string>(), scripts: RawScript[] = [];
  for (const k of (Array.isArray(raw.scripts) ? raw.scripts : []) as RawScript[]) {
    const id = k && typeof k.fileId === 'string' ? await take(k.fileId) : null;
    if (!id) { dropped.push('script ' + (k?.name || '?') + ' (no file in the export)'); continue; }
    scriptIds.set(k.id, uid('k'));
    scripts.push({ ...k, id: scriptIds.get(k.id)!, fileId: id });
  }
  raw.scripts = scripts;
  type Ref = { kind?: string; script?: string } | undefined;
  const st = raw.settings as { metrics?: { fn?: Ref; transform?: Ref }[]; pmfTransform?: Ref; analyses?: { transform?: Ref }[] } | undefined;
  const follow = (r: Ref) => { if (r && r.kind === 'script' && r.script) r.script = scriptIds.get(r.script) ?? r.script; };
  // A metric's function and its own transform (F138) both follow.
  for (const m of Array.isArray(st?.metrics) ? st.metrics : []) { follow(m?.fn); follow(m?.transform); }
  follow(st?.pmfTransform);
  for (const a of Array.isArray(st?.analyses) ? st.analyses : []) follow(a?.transform);
  delete raw.files; delete raw.structData;
  return { uploads, dropped };
}

async function parse(text: string, taken: Set<string>) {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || !Array.isArray(raw.seqs)) throw new Error('Not a PMF sequences export.');
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > EXPORT_VERSION) throw new Error('This export is from a newer version of the app (v' + version + ').');
  const { uploads, dropped } = await rekey(raw, taken);
  return { raw, version, uploads, dropped, text: JSON.stringify(raw) };
}

/** An export as a new project's Store. */
export async function importAsProject(text: string): Promise<PreparedImport> {
  const p = await parse(text, new Set());
  const res = importAsStore(p.text);
  return { store: sanitizeIds(res.store).store, uploads: p.uploads, name: res.name, version: p.version, dropped: p.dropped };
}

/** An export merged into an existing Store (rows with the same method + name + sequence merge). */
export async function importInto(text: string, store: Store): Promise<PreparedImport> {
  const p = await parse(text, new Set(fileIdsOf(store)));
  const res = importJSON(p.text, store);
  return { store: sanitizeIds(res.store).store, uploads: p.uploads, name: typeof p.raw.project === 'string' ? p.raw.project : '', version: p.version, dropped: p.dropped };
}
