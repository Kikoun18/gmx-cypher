// Migration of the prototype's browser data into a vault (spec §16).
//
// 1. Each legacy project becomes a vault project with the same IDs. Its Store
//    goes through the same planner as every UI edit, so records, notes and
//    folders come out exactly as if the user had built the project in the vault.
// 2. Structure text from IndexedDB is written as files (origin
//    "migrated-from-indexeddb"). Runs and curves kept only as parsed numbers get
//    reconstructed XVG files (origin "reconstructed", `*.reconstructed.xvg`).
// 3. Verification reopens the vault from disk with a fresh load and compares
//    every entity, note, setting, reference, run, analysis, curve and structure
//    with the legacy data. Only a clean comparison counts as success.
//
// The legacy data itself is never changed here.

import type { Settings, Store } from '../../types';
import { mergeSettings, splitSettings } from '../../seq';
import type { StorageBackend } from '../backend/types';
import { uid } from '../json';
import { sanitizeIds } from '../ids';
import { isSafeId } from '../path';
import type { Upload } from '../plan';
import type { ProjectService } from '../project';
import { reconstructedName } from '../reconstruct';
import { writeManifest } from '../manifest';
import { NotEmptyError, Vault, isEmptyFolder, isVault, type LockProvider } from '../vault';
import { newFileId } from '../files';
import type { LegacyData } from './legacy';

export interface Counts {
  rows: number; runs: number; analyses: number; curves: number; structures: number;
  rowNotes: number; cellNotes: number; literature: number; pages: number; columns: number;
}

export interface ProjectReport {
  id: string;
  name: string;
  /** Where it came from in the browser (localStorage key). */
  source: string;
  counts: Counts;
  /** Vault paths of reconstructed files (not originals). */
  reconstructed: string[];
  structuresMigrated: number;
  /** Structures whose file text wasn't in IndexedDB: kept as records, shown as missing files. */
  structuresMissing: string[];
  idChanges: string[];
  /** Differences found by the verification (empty = verified). */
  problems: string[];
}

export interface MigrationReport {
  ok: boolean;
  vaultId: string;
  migratedAt: string;
  source: LegacyData['source'];
  projects: ProjectReport[];
  /** Browser-wide preferences found (theme, laser); the app applies them, they aren't vault data. */
  prefs: Partial<Settings>;
  warnings: string[];
}

export interface MigrateOptions {
  lock?: LockProvider;
  /** Allow migrating into an existing vault (only after the user confirmed). */
  intoExisting?: boolean;
  progress?: (msg: string) => void;
}

export function countStore(s: Store): Counts {
  const all = s.seqs;
  return {
    rows: all.length,
    runs: all.reduce((n, q) => n + q.runs.length, 0),
    analyses: all.reduce((n, q) => n + q.extras.length, 0),
    curves: all.reduce((n, q) => n + q.extras.reduce((m, e) => m + e.curves.length, 0), 0),
    structures: all.reduce((n, q) => n + q.structures.length, 0),
    rowNotes: Object.values(s.notes.row).filter(Boolean).length,
    cellNotes: Object.values(s.notes.cell).filter(Boolean).length,
    literature: Object.values(s.lit).reduce((n, l) => n + l.length, 0),
    pages: s.pages.length,
    columns: s.cols.length,
  };
}

// --- comparison ---------------------------------------------------------------------------------------

const stem = (n: string) => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; };

/** What must survive migration, without load-state and storage-only fields. */
function canon(s: Store) {
  const sortObj = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '').sort(([a], [b]) => a.localeCompare(b)));
  return {
    columns: s.cols.map(c => ({ k: c.k, label: c.label, short: c.short, name: c.name, light: c.light, dark: c.dark })),
    rows: s.seqs.map(q => ({
      id: q.id, group: q.group, name: q.name, seq: q.seq, desc: q.desc,
      runs: q.runs.map(r => ({ id: r.id, column: r.sacch, slot: r.run, time: r.time, temp: r.temp, tags: r.tags, added: r.added, x: r.x, y: r.y })),
      analyses: q.extras.map(e => ({
        id: e.id, type: e.type, column: e.sacch, slot: e.run, time: e.time, added: e.added,
        curves: e.curves.map(c => ({ id: c.id, label: c.label, custom: !!c.custom, x: c.x, y: c.y })),
      })),
      structures: q.structures.map(m => ({ id: m.id, name: m.name, format: m.format, added: m.added, atoms: m.atoms, note: m.note })),
    })),
    notes: { row: sortObj(s.notes.row), cell: sortObj(s.notes.cell) },
    literature: sortObj(s.lit),
    visibility: sortObj(s.vis),
    pages: s.pages.map(p => ({ id: p.id, name: p.name, desc: p.desc, rows: p.rows, cols: p.cols })),
    // Effective settings: an unset key means the default, in both places.
    settings: sortObj(splitSettings(mergeSettings({}, s.settings)).project as Record<string, unknown>),
  };
}

/** The first few places where two JSON-like values differ, as readable paths. */
function diffs(a: unknown, b: unknown, path: string, out: string[], max = 25) {
  if (out.length >= max) return;
  if (a === b) return;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push(path + ': ' + a.length + ' items in the legacy data, ' + b.length + ' in the vault'); return; }
    a.forEach((v, i) => diffs(v, b[i], path + '[' + ((v as { id?: string })?.id ?? i) + ']', out, max));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k, out, max);
    return;
  }
  out.push(path + ': legacy ' + JSON.stringify(a)?.slice(0, 80) + ' ≠ vault ' + JSON.stringify(b)?.slice(0, 80));
}

async function loadAll(svc: ProjectService) {
  await svc.notesReady;
  await svc.verified;
  for (const r of svc.store.seqs) for (const e of r.extras) await svc.loadAnalysis(e.id);
}

// --- migration -------------------------------------------------------------------------------------------

export async function migrateLegacy(backend: StorageBackend, data: LegacyData, opts: MigrateOptions = {}): Promise<{ report: MigrationReport; vault: Vault }> {
  const say = opts.progress || (() => {});
  const warnings = data.warnings.slice();
  const source = 'legacy browser storage' + (data.source.origin ? ' (' + data.source.origin + ')' : '') + (data.source.dumped ? ', dumped ' + data.source.dumped : '');

  let vault: Vault;
  if (await isEmptyFolder(backend)) {
    vault = (await Vault.create(backend, { lock: opts.lock, provenance: { migratedFrom: source } })).vault;
  } else if (opts.intoExisting && (await isVault(backend))) {
    vault = await Vault.open(backend, { lock: opts.lock });
    if (vault.readOnly) throw new Error('The vault opened read-only (' + (vault.readOnlyReason || 'unknown reason') + '); nothing was migrated.');
  } else {
    throw new NotEmptyError('Pick an empty folder to migrate into (an existing vault is accepted after you confirm).');
  }

  const taken = new Set((await vault.listProjects()).map(p => p.id));
  const expected = new Map<string, { store: Store; texts: Map<string, string> }>();
  const reports: ProjectReport[] = [];

  for (const lp of data.projects) {
    say('Migrating ' + lp.name + '…');
    let id = lp.id;
    if (!id || !isSafeId(id) || taken.has(id)) {
      id = uid('p');
      if (lp.id) warnings.push('Project "' + lp.name + '" had ID ' + JSON.stringify(lp.id) + ', which ' + (taken.has(lp.id) ? 'is already used in this vault' : 'is not usable as a folder name') + '; it is now ' + id + '.');
    }
    taken.add(id);

    // Structures: the IndexedDB text becomes the file. Without text, the record is kept
    // and points at where the file belongs — it shows as missing, as it did in the prototype.
    const uploads = new Map<string, Upload>(), texts = new Map<string, string>(), structuresMissing: string[] = [];
    let structuresMigrated = 0;
    const withFiles: Store = {
      ...lp.store,
      seqs: lp.store.seqs.map(s => ({
        ...s,
        structures: s.structures.flatMap(m => {
          const text = data.structures[m.id];
          const fileId = newFileId();
          if (typeof text !== 'string') {
            structuresMissing.push((m.name || m.id) + ' on ' + (s.name || s.id));
            uploads.set(fileId, { blob: new Blob([]), name: m.name || m.id + '.' + m.format, origin: 'migrated-from-indexeddb', placeholder: { size: m.size || 0 } });
            return [{ ...m, fileId, state: undefined }];
          }
          uploads.set(fileId, { blob: new Blob([text], { type: 'text/plain' }), name: m.name || m.id + '.' + m.format, origin: 'migrated-from-indexeddb' });
          texts.set(m.id, text);
          structuresMigrated++;
          return [{ ...m, fileId, state: undefined }];
        }),
      })),
    };
    if (structuresMissing.length) warnings.push(lp.name + ': ' + structuresMissing.length + ' structure(s) had no file in IndexedDB (already missing in the old app). Their entries are kept and shown as missing files: ' + structuresMissing.join(', '));
    const { store, changed } = sanitizeIds(withFiles);
    if (changed.length) warnings.push(lp.name + ': IDs not usable in paths were replaced: ' + changed.join(', '));
    // sanitizeIds may rename structures; keep their text under the new ID.
    const textById = new Map<string, string>();
    store.seqs.forEach((s, i) => s.structures.forEach((m, j) => { const t = texts.get(withFiles.seqs[i].structures[j].id); if (t != null) textById.set(m.id, t); }));

    await vault.createProject(lp.name, { id, desc: lp.desc, cols: store.cols, settings: store.settings });
    const svc = await vault.openProject(id, { notes: 'eager' });
    svc.commit(store, uploads);
    await svc.flush();
    const st = svc.getStatus();
    if (st.save === 'error') { await svc.close(); throw new Error('Writing project "' + lp.name + '" failed: ' + st.error); }
    const reconstructed: string[] = [];
    for (const r of svc.state.rows.values()) for (const f of r.files) if (f.origin === 'reconstructed') reconstructed.push(f.path);
    await svc.close();

    expected.set(id, { store, texts: textById });
    reports.push({ id, name: lp.name, source: lp.key, counts: countStore(store), reconstructed: reconstructed.sort(), structuresMigrated, structuresMissing, idChanges: changed, problems: [] });
  }
  await vault.close();

  // --- verification: a fresh load from disk, compared with the legacy data ---
  say('Verifying…');
  const fresh = await Vault.open(backend, { lock: opts.lock });
  const projectIds = new Set((await fresh.listProjects()).map(p => p.id));
  for (const rep of reports) {
    const exp = expected.get(rep.id)!;
    if (!projectIds.has(rep.id)) { rep.problems.push('the project is not in the vault after reopening'); continue; }
    const svc = await fresh.openProject(rep.id, { notes: 'eager' });
    try {
      await loadAll(svc);
      const got = svc.store;
      diffs(canon(exp.store), canon(got), 'project', rep.problems);
      // File names: originals keep theirs; reconstructed ones are marked as such.
      exp.store.seqs.forEach(s => {
        const gs = got.seqs.find(q => q.id === s.id);
        if (!gs) return;
        for (const r of s.runs) {
          const gr = gs.runs.find(x => x.id === r.id);
          if (!gr || !gr.src) continue;
          const meta = svc.fileMeta(gr.src.fileId);
          if (!meta) { rep.problems.push('run ' + r.id + ': its file is not recorded'); continue; }
          if (meta.origin === 'reconstructed') {
            if (gr.file !== reconstructedName(r.file, 'run-' + r.run) && stem(gr.file) !== stem(r.file || '') + '.reconstructed') rep.problems.push('run ' + r.id + ': reconstructed file is named ' + gr.file);
          } else if (gr.file !== r.file) rep.problems.push('run ' + r.id + ': file name ' + JSON.stringify(gr.file) + ' ≠ ' + JSON.stringify(r.file));
        }
      });
      const lost = new Set(rep.structuresMissing.length ? got.seqs.flatMap(q => q.structures.filter(m => !exp.texts.has(m.id)).map(m => m.fileId)) : []);
      for (const r of svc.report.missing) if (!lost.has(r.fileId)) rep.problems.push('file missing after reopening: ' + r.path);
      if (svc.report.conflicts.length) rep.problems.push('folder ID conflicts after reopening');
      // Structure content, byte for byte (as UTF-8 text).
      for (const s of got.seqs) for (const m of s.structures) {
        const want = exp.texts.get(m.id);
        if (want == null) continue;
        if (!m.fileId) { rep.problems.push('structure ' + m.id + ' has no file'); continue; }
        const meta = svc.fileMeta(m.fileId);
        if (meta?.origin !== 'migrated-from-indexeddb') rep.problems.push('structure ' + m.id + ': origin is ' + meta?.origin);
        const text = await (await svc.readUpload(m.fileId)).text().catch(() => null);
        if (text !== want) rep.problems.push('structure ' + m.id + ' (' + m.name + '): content differs');
      }
      const c = countStore(got);
      for (const k of Object.keys(rep.counts) as (keyof Counts)[]) if (c[k] !== rep.counts[k]) rep.problems.push(k + ': ' + rep.counts[k] + ' in the legacy data, ' + c[k] + ' in the vault');
    } finally { await svc.close(); }
  }

  const ok = reports.every(r => !r.problems.length);
  const migratedAt = new Date().toISOString();
  if (!fresh.readOnly) {
    fresh.manifest = {
      ...fresh.manifest,
      migration: {
        source, at: migratedAt, verified: ok,
        projects: reports.map(r => ({ id: r.id, name: r.name, from: r.source, reconstructed: r.reconstructed.length })),
      },
    };
    await writeManifest(fresh.io, fresh.manifest, true);
  }
  return { vault: fresh, report: { ok, vaultId: fresh.manifest.vaultId, migratedAt, source: data.source, projects: reports, prefs: data.prefs, warnings } };
}

/** A plain-text report (for the console and the headless script). */
export function formatReport(r: MigrationReport): string {
  const L: string[] = [];
  L.push('Migration ' + (r.ok ? 'VERIFIED' : 'FAILED VERIFICATION') + ' · vault ' + r.vaultId + ' · ' + r.migratedAt);
  if (r.source.origin || r.source.dumped) L.push('Source: ' + [r.source.origin, r.source.dumped && 'dumped ' + r.source.dumped].filter(Boolean).join(', '));
  for (const p of r.projects) {
    const c = p.counts;
    L.push('', 'Project "' + p.name + '" (' + p.id + ', from ' + p.source + ')');
    L.push('  ' + c.rows + ' rows · ' + c.runs + ' runs · ' + c.analyses + ' analyses · ' + c.curves + ' curves · ' + c.structures + ' structures · ' + c.rowNotes + ' row notes · ' + c.cellNotes + ' cell notes · ' + c.literature + ' references · ' + c.pages + ' pages · ' + c.columns + ' columns');
    L.push('  structures written from IndexedDB: ' + p.structuresMigrated + (p.structuresMissing.length ? ' · kept as missing (no file in IndexedDB): ' + p.structuresMissing.join(', ') : ''));
    if (p.reconstructed.length) { L.push('  reconstructed files (NOT originals):'); for (const f of p.reconstructed) L.push('    ' + f); }
    if (p.problems.length) { L.push('  verification problems:'); for (const x of p.problems) L.push('    ' + x); } else L.push('  verified: identical after a fresh reopen');
  }
  if (r.warnings.length) { L.push('', 'Warnings:'); for (const w of r.warnings) L.push('  ' + w); }
  if (Object.keys(r.prefs).length) L.push('', 'Browser preferences found: ' + JSON.stringify(r.prefs));
  return L.join('\n');
}
