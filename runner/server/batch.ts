// Batches (R7b, T38, T39): the preview of a template under a root, and the queue that runs the chosen
// matches, at most `concurrency` at a time. Each match becomes an ordinary run (startRun): its own names,
// size check, job and record. A refusal or a failure stops only that match.

import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { structFormat } from '../../matrix/src/lib/structFile';
import { atomTable } from '../src/lib/atoms';
import { matchTrajectory, nameValues, vaultFields, type BatchMatch } from '../src/lib/batch';
import { renderStem } from '../src/lib/names';
import { inputRole, suggestInputs } from '../src/lib/inputs';
import { applyRecipe, type Recipe } from '../src/lib/recipe';
import { structureMismatch } from '../src/lib/checks';
import type { RunRecord } from '../src/lib/record';
import type { Ctx } from './api';
import { dumpRunInput } from './check';
import { inside, namesIn, real, within } from './files';
import { HttpError } from './http';
import type { Job } from './jobs';
import { startRun } from './runs';
import { keepRecord, sendToInbox } from './send';
import { landingFor, listProjects, openVault } from './vault';

export interface BatchItem extends BatchMatch {
  rel: string; trajectory: string; runInput: string | null; structure: string | null; atoms: number | null; counts: number[] | null;
}

const MAX_FILES = 20_000;

/**
 * Every trajectory under root that the template takes, with the inputs beside it and the recipe's groups
 * counted on its structure. Linked folders inside the allowed ones are followed; what can't be looked into
 * (an unreadable folder, a link out or to nothing, a loop) is added to `unread`, and the rest goes on
 * (review finding 11). A trajectory reached twice through links is listed once.
 */
export function findTrajectories(rootPath: string, template: string, recipe: Recipe, roots: string[], unread: string[] = []): BatchItem[] {
  const root = inside(rootPath, roots), found: string[] = [], allowed = roots.map(real).filter(r => r !== null);
  const at = (p: string) => relative(root, p).split('\\').join('/');
  const walk = (d: string, above: string[]) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch (e) { unread.push(at(d) + ': ' + ((e as NodeJS.ErrnoException).code === 'EACCES' ? 'not readable' : (e as Error).message)); return; }
    for (const e of entries) {
      if (found.length >= MAX_FILES || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      let dir = e.isDirectory(), file = e.isFile();
      const r = e.isSymbolicLink() || dir ? real(p) : p;
      if (e.isSymbolicLink()) {
        if (!r) { unread.push(at(p) + ': a link to nothing'); continue; }
        if (!allowed.some(a => within(r, a))) { unread.push(at(p) + ': a link out of the allowed folders'); continue; }
        const st = statSync(r);
        dir = st.isDirectory(); file = st.isFile();
      }
      if (dir) { if (above.includes(r!)) unread.push(at(p) + ': a link back to a folder above it'); else walk(p, [...above, r!]); }
      else if (file && inputRole(e.name) === 'trajectory') found.push(p);
    }
  };
  walk(root, [root]);
  const once = new Set<string>();
  return found.flatMap(abs => {
    const rel = relative(root, abs).split('\\').join('/'), m = matchTrajectory(rel, template);
    if (!m) return [];
    const dir = dirname(abs), s = suggestInputs(basename(abs), namesIn(dir, roots), namesIn(dirname(dir), roots));
    const runInput = s.runInput ? join(dir, s.runInput.name) : null, structure = s.structure ? join(dir, s.structure.name) : null;
    const problems = [...m.problems, ...(!runInput ? ['no run input (.tpr) next to it'] : []), ...(!structure ? ['no structure (.gro or .pdb) next to it'] : [])];
    try { renderStem(recipe.template, { ...nameValues(m), analysis: 'rdf', trajectory: basename(abs).replace(/\.[^.]+$/, '') }); } catch (e) { problems.push('file name: ' + (e as Error).message); }
    let counts: number[] | null = null, atoms: number | null = null;
    if (structure) {
      const text = readFileSync(structure, 'utf8'), format = structFormat(structure, text);
      if (format) {
        try { const table = atomTable(text, format), a = applyRecipe(recipe, table); atoms = table.length; counts = a.counts; problems.push(...a.problems); }
        catch (e) { problems.push(basename(structure) + ': ' + (e as Error).message); }
      }
      else problems.push(basename(structure) + ' is not a .gro or .pdb');
    }
    return [{ ...m, rel, trajectory: abs, runInput, structure, atoms, counts, problems }];
  }).sort((a, b) => a.rel.localeCompare(b.rel)).filter(i => { const r = real(i.trajectory)!; return !once.has(r) && !!once.add(r); });
}

/** Each match's structure against its run input as gmx reads it, a few at a time (review finding 1). Without a working gmx, the run itself checks. */
export async function checkRunInputs(ctx: Ctx, items: BatchItem[]): Promise<BatchItem[]> {
  if (!ctx.gmx.ok) return items;
  const todo = items.filter(i => i.runInput && i.atoms != null);
  for (let k = 0; k < todo.length; k += 4) {
    await Promise.all(todo.slice(k, k + 4).map(async i => {
      try { const p = structureMismatch(i.atoms!, (await dumpRunInput(ctx.gmx, i.runInput!, dirname(i.runInput!))).natoms); if (p) i.problems.push(p); }
      catch (e) { i.problems.push('the run input: ' + (e as Error).message); }
    }));
  }
  return items;
}

export type ItemStatus = 'queued' | 'starting' | 'started' | 'refused' | 'cancelled';
export interface Batch {
  id: string; recipe: string; root: string; template: string; concurrency: number; created: string; cancelled: boolean;
  items: (BatchItem & { status: ItemStatus; job?: string; error?: string })[];
}

/**
 * The queue: each batch starts its queued items as runs while fewer than `concurrency` of its own are
 * starting or running, and starts the next when one ends. Kept in memory: after a restart its jobs show
 * as interrupted (T7), and the batch can be started again for what is left.
 */
export class Batches extends EventEmitter {
  private readonly batches = new Map<string, Batch>();
  private readonly recipes = new Map<string, Recipe>();
  private readonly ctx: Ctx;
  private readonly roots: () => string[];

  constructor(ctx: Ctx, roots: () => string[]) {
    super();
    this.ctx = ctx;
    this.roots = roots;
    ctx.jobs.on('job', (j: Job) => {
      if (!j.ended) return;
      for (const b of this.batches.values()) if (b.items.some(i => i.job === j.id)) { this.emit('batch', b); this.pump(b); }
    });
  }

  list(): Batch[] { return [...this.batches.values()].sort((a, c) => c.created.localeCompare(a.created)); }
  get(id: string): Batch | undefined { return this.batches.get(id); }

  start(recipe: Recipe, root: string, template: string, items: BatchItem[], concurrency: number): Batch {
    const b: Batch = {
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), recipe: recipe.name, root, template, created: new Date().toISOString(), cancelled: false,
      concurrency: Math.max(1, Math.floor(concurrency) || 1), items: items.map(i => ({ ...i, status: 'queued' as const })),
    };
    this.batches.set(b.id, b);
    this.recipes.set(b.id, recipe);
    this.pump(b);
    return b;
  }

  private busy(b: Batch) { return b.items.filter(i => i.status === 'starting' || (i.status === 'started' && !this.ctx.jobs.get(i.job!)?.ended)).length; }

  private pump(b: Batch) {
    const r = this.recipes.get(b.id)!;
    while (!b.cancelled && this.busy(b) < b.concurrency) {
      const item = b.items.find(i => i.status === 'queued');
      if (!item) break;
      item.status = 'starting';
      const req = { tool: r.analysis ?? 'rdf', inputs: { trajectory: item.trajectory, runInput: item.runInput ?? '', structure: item.structure ?? undefined }, groups: r.groups, options: r.options, template: r.template, outDir: r.outDir, names: nameValues(item), retryNames: true, batch: { id: b.id, name: r.name } };
      startRun(this.ctx, req, this.roots()).then(({ job }) => {
        Object.assign(item, { status: 'started', job: job.id });
        if (b.cancelled) this.ctx.jobs.cancel(job.id);
      }, e => Object.assign(item, { status: 'refused', error: (e as Error).message })).finally(() => { this.emit('batch', b); this.pump(b); });
    }
    this.emit('batch', b);
  }

  /** Cancel all: the queued never start; the running are stopped like any job (the whole process group). */
  cancel(id: string) {
    const b = this.batches.get(id);
    if (!b || b.cancelled) return;
    b.cancelled = true;
    for (const i of b.items) {
      if (i.status === 'queued') i.status = 'cancelled';
      else if (i.status === 'started') this.ctx.jobs.cancel(i.job!);
    }
    this.emit('batch', b);
  }

  /** Settles when no item is queued, starting or running. */
  done(id: string): Promise<Batch> {
    const b = this.batches.get(id)!, finished = () => b.items.every(i => i.status === 'refused' || i.status === 'cancelled' || (i.status === 'started' && !!this.ctx.jobs.get(i.job!)?.ended));
    return new Promise(resolve => {
      const check = () => { if (finished()) { this.off('batch', check); this.ctx.jobs.off('job', check); resolve(b); } };
      this.on('batch', check);
      this.ctx.jobs.on('job', check);
      check();
    });
  }
}

/**
 * Send all (R7b): each done run of the batch, file by file by the rule of R6: the fields its path gave
 * (the folder pattern of the project fills the rest), the name from the project's pattern, the Matrix'
 * preview; sent only when it lands where the fields say, else skipped with the reason.
 */
export async function sendAll(ctx: Ctx, b: Batch, project: string): Promise<{ rel: string; sent?: string; skipped?: string }[]> {
  const v = await openVault(ctx.config.vault!), p = (await listProjects(v)).find(x => x.id === project);
  if (!p) throw new HttpError(404, 'no project ' + project + ' in the vault');
  const out: { rel: string; sent?: string; skipped?: string }[] = [];
  for (const i of b.items) {
    const j = i.job ? ctx.jobs.get(i.job) : undefined;
    if (!j || j.status !== 'done') { out.push({ rel: i.rel, skipped: i.error || 'not run to the end' }); continue; }
    // Each item on its own (review finding 10): one that fails is listed, and the rest are still sent.
    try {
      const names = j.meta!.names as { xvg: string }, xvg = join(String(j.meta!.outDir), names.xvg), rec = JSON.parse(readFileSync(String(j.meta!.record), 'utf8')) as RunRecord;
      const file = { name: names.xvg, text: readFileSync(xvg, 'utf8'), lastTime: rec.frames?.lastTime ?? null };
      const first = await landingFor(v, project, file, {}), own = vaultFields(i);
      const fields = { ...first.fields, ...Object.fromEntries(Object.entries(own).filter(([, x]) => x)) };
      const l = await landingFor(v, project, file, { fields });
      const why = [...l.missing.map(t => 'no value for ' + t), ...l.preview.problems, ...l.reasons];
      if (why.length) { out.push({ rel: i.rel, skipped: why.join('; ') }); continue; }
      out.push({ rel: i.rel, sent: sendToInbox(v, p, xvg, l.name, ctx.config.pmfUrl).path });
      keepRecord(v, String(j.meta!.record), xvg, [...ctx.config.allow, join(ctx.home, 'uploads')], 'gmx-cypher ' + ctx.version);
    } catch (e) { out.push({ rel: i.rel, skipped: 'could not be sent: ' + (e as Error).message }); }
  }
  return out;
}
