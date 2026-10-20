// (de)Cypher's link to the Matrix: the vault's RDF analyses with their rows' structures, read only, and for
// each RDF file the gmx-cypher run that wrote it, found by its SHA-256 among the runs' records: the record holds
// the atoms of each group, so the structure view can show them. Only those files are ever sent to the page.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RowRecord } from '../../matrix/src/lib/storage/records';
import { recordComplete, type RunRecord } from '../src/lib/record';
import { mainXvg } from '../src/core/cards';
import type { VaultRdfs, VaultRow, VaultRun } from '../src/decypher/vaultTypes';
import { inside, real, within } from './files';
import { HttpError } from './http';
import type { Jobs } from './jobs';
import { listProjects, projectSummary, readProject, type VaultView } from './vault';

const cache = new Map<string, { mtime: number; rec: RunRecord | null }>();
/** A run's record; a job's is kept and read again only when its file changed. null when it can't be read. */
function recordAt(path: string, keep = true): RunRecord | null {
  const mtime = statSync(path, { throwIfNoEntry: false })?.mtimeMs;
  if (mtime == null) return null;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.rec;
  let rec: RunRecord | null = null;
  try { const t = readFileSync(path, 'utf8'); rec = t.trim() ? JSON.parse(t) as RunRecord : null; } catch { rec = null; }
  if (keep) cache.set(path, { mtime, rec });
  return rec;
}

/** Every finished RDF run's .xvg outputs by SHA-256: the vault keeps each file byte for byte, so its hash names the run. */
export function runsBySha(jobs: Jobs): Map<string, VaultRun> {
  const out = new Map<string, VaultRun>();
  for (const j of jobs.list()) {
    if (j.kind !== 'rdf' || j.status !== 'done' || typeof j.meta?.record !== 'string') continue;
    const rec = recordAt(j.meta.record);
    if (!rec) continue;
    const bin = rec.options?.find(o => o.flag === 'bin')?.value;
    const run: VaultRun = { job: j.id, title: j.title, groups: rec.groups, frames: rec.frames, bin: bin == null || bin === '' ? null : Number(bin), structure: rec.inputs?.structure?.path ?? null };
    for (const o of rec.outputs || []) if (o.kind === 'xvg' && o.sha256 && !out.has(o.sha256)) out.set(o.sha256, run);
  }
  return out;
}

/** Whether a project's analysis type is an RDF: the Matrix's own `rdf`, or a type of the project's named so. */
const rdfTypes = (types: { k: string; label: string; name: string; match: string }[]) =>
  new Set(['rdf', ...types.filter(t => /\b(rdf|radial)\b/i.test(t.label + ' ' + t.name + ' ' + t.match)).map(t => t.k)]);

/** The vault's RDF analyses, by project and row (in the project's order), each with its curves, its row's structures and its run. */
export async function vaultRdfs(v: VaultView, jobs: Jobs): Promise<VaultRdfs> {
  const runs = runsBySha(jobs), projects: VaultRdfs['projects'] = [];
  for (const p of await listProjects(v)) {
    const read = await readProject(v, p.id), types = rdfTypes(projectSummary(read).settings.analyses), st = read.state;
    const label = (k: string) => st.columns.get(k)?.label || k;
    const order = st.project.rowOrder || [], rows = [...order.filter(id => st.rows.has(id)).map(id => st.rows.get(id)!), ...[...st.rows.values()].filter(r => !order.includes(r.id))];
    const out: VaultRow[] = [];
    for (const r of rows as RowRecord[]) {
      // Curves and structures name their file by its ID; the row's file list has its path, name and hash.
      const meta = (id: string) => r.files.find(f => f.id === id);
      const rdfs = r.analyses.filter(a => types.has(a.type) && a.curves.some(c => meta(c.file))).map(a => ({
        id: a.id, column: label(a.column), slot: a.slot, time: a.time,
        curves: a.curves.flatMap(c => { const f = meta(c.file); return f ? [{ label: c.label, file: f.path, name: f.name, xCol: c.parse.xCol, yCol: c.parse.yCol, xScale: c.parse.xScale || 1 }] : []; }),
        run: a.curves.map(c => runs.get(meta(c.file)?.sha256 || '')).find(Boolean) ?? null,
      }));
      const structures = r.structures.flatMap(x => { const f = meta(x.file); return f ? [{ file: f.path, name: f.name, format: x.format, atoms: x.atoms, title: x.title }] : []; });
      if (rdfs.length) out.push({ id: r.id, name: r.name, seq: r.seq, structures, rdfs });
    }
    if (out.length) projects.push({ id: p.id, name: p.name, rows: out });
  }
  return { path: v.path, projects };
}

// The last list, so that reading an RDF's files does not read the whole vault again for each.
let lastList: { path: string; at: number; list: VaultRdfs } | null = null;

/** The list as GET /api/decypher/vault gives it, kept for the files asked for just after. */
export async function listVault(v: VaultView, jobs: Jobs): Promise<VaultRdfs> {
  const list = await vaultRdfs(v, jobs);
  lastList = { path: v.path, at: Date.now(), list };
  return list;
}

/** One file of the vault, if an RDF analysis or the structure of a row with one refers to it; anything else is refused. */
export async function vaultFile(v: VaultView, jobs: Jobs, path: string): Promise<string> {
  const all = lastList && lastList.path === v.path && Date.now() - lastList.at < 60_000 ? lastList.list : await listVault(v, jobs);
  const known = all.projects.some(p => p.rows.some(r => r.structures.some(s => s.file === path) || r.rdfs.some(a => a.curves.some(c => c.file === path))));
  if (!known) throw new HttpError(404, path + ' is not an RDF or a structure of the vault');
  return v.io.backend.readText(path);
}

// ---------- runs already on disk ----------
// RDF runs gmx-cypher wrote before, wherever they are in the allowed folders: each has its record beside its
// outputs, so a run this runner's job list doesn't know (another home, another machine) still opens with its groups.

export interface FoundRun { path: string; stem: string; analysis: string; frames: number | null; groups: number; reference: string | null; structure: string | null; ended: string | null }

const isRecord = (r: Partial<RunRecord> | null): r is RunRecord => !!r && r.format === 'gmx-cypher run' && Array.isArray(r.groups) && Array.isArray(r.outputs);
const stemOf = (p: string) => (p.split('/').pop() ?? '').replace(/\.run\.json$/, '');

/**
 * Every record of a finished job under `root` (any command since R10a; in the allowed folders, links not followed out of them), newest first; at most
 * `limit` records, and the walk stops after `budget` entries: `more` says a folder further down would find the rest.
 */
export function findRuns(root: string, roots: string[], limit = 400, budget = 50_000): { runs: FoundRun[]; more: boolean; unread: string[] } {
  const start = inside(root, roots), runs: FoundRun[] = [], unread: string[] = [];
  let more = false, seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 10 || more) return;
    let names: string[];
    try { names = readdirSync(dir).sort((a, b) => a.localeCompare(b)); } catch { unread.push(dir); return; }
    for (const name of names) {
      if (++seen > budget) { more = true; return; }
      if (name.startsWith('.')) continue;
      const p = join(dir, name), r = real(p);
      if (!r || !roots.map(real).some(x => x && within(r, x))) continue;
      const st = statSync(r, { throwIfNoEntry: false });
      if (st?.isDirectory()) { walk(p, depth + 1); continue; }
      if (!st?.isFile() || !name.endsWith('.run.json') || st.size > 4 << 20) continue;
      const rec = recordAt(r, false);
      if (!isRecord(rec) || !recordComplete(rec) || !mainXvg(rec.outputs, stemOf(r))) continue;
      if (runs.length >= limit) { more = true; return; }
      const ref = rec.groups.find(g => g.role === 'reference');
      runs.push({ path: r, stem: name.slice(0, -'.run.json'.length), analysis: rec.analysis ?? 'rdf', frames: rec.frames?.analysed ?? null, groups: rec.groups.length, reference: ref?.name ?? null, structure: rec.inputs?.structure?.path ?? null, ended: rec.ended ?? null });
    }
  };
  walk(start, 0);
  runs.sort((a, b) => (b.ended ?? '').localeCompare(a.ended ?? '') || a.path.localeCompare(b.path));
  return { runs, more, unread };
}

/** A found record and its main file (R10a): the record in the allowed folders, its main .xvg too. */
export function readRun(path: string, roots: string[]): { record: RunRecord; xvg: string; pairs?: string };
/** `recordOnly`: the record alone (a run diff, R13), read even when its files have moved. */
export function readRun(path: string, roots: string[], recordOnly: true): { record: RunRecord };
export function readRun(path: string, roots: string[], recordOnly = false): { record: RunRecord; xvg?: string; pairs?: string } {
  const p = inside(path, roots);
  if (!p.endsWith('.run.json')) throw new HttpError(400, path + ' is not a gmx-cypher run record (.run.json)');
  const rec = recordAt(p, false);
  if (!isRecord(rec)) throw new HttpError(400, path + ' is not a gmx-cypher run record');
  if (!recordComplete(rec)) throw new HttpError(409, path + " is incomplete: its job didn't finish (the record was written when it started)");
  if (recordOnly) return { record: rec };
  const main = mainXvg(rec.outputs, stemOf(p));
  if (!main) throw new HttpError(404, path + ' names no .xvg of its own');
  // The selection tool's H-bond pairs (R10c), when the record lists them and they are still there.
  const ndx = rec.analysis === 'hbond' ? rec.outputs.find(o => /_hbonds\.ndx$/.test(o.path))?.path : undefined;
  let pairs: string | undefined;
  try { if (ndx) pairs = readFileSync(inside(ndx, roots), 'utf8'); } catch { /* gone: drawn without pairs, and said so */ }
  return { record: rec, xvg: readFileSync(inside(main, roots), 'utf8'), ...(pairs != null ? { pairs } : {}) };
}
