// RDF runs (R5, T21, T29–T31): free names chosen for all four files and checked again just before the
// spawn, each group's size confirmed by gmx select, the index written next to the outputs with O_EXCL, gmx
// started without a shell, and the run record written when it ends. Nothing existing is ever replaced.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { atomTable, type Atom } from '../src/lib/atoms';
import { groupAtoms, nameProblem, type Group } from '../src/lib/groups';
import type { Slot } from '../src/lib/inputs';
import { DEFAULT_TEMPLATE, freeStem, outputNames, renderStem } from '../src/lib/names';
import { writeNdx } from '../src/lib/ndx';
import { frameEstimate, parseDump } from '../src/lib/gmxText';
import { rdfArgs, rdfIo, recipeProblems, runEstimate, type Options, type RdfIo } from '../src/lib/rdf';
import { buildRecord, type FileInfo, type Output, type RunRecord } from '../src/lib/record';
import { structFormat } from '../../app/src/lib/structFile';
import type { Ctx } from './api';
import { checkSizes } from './check';
import { inside, sha256File } from './files';
import { capture, rdfHelp } from './gmx';
import { HttpError } from './http';
import type { Job } from './jobs';

export interface RunRequest { inputs: Partial<Record<Slot, string>>; groups: Group[]; options: Options; template?: string; outDir?: string | null }
export interface Plan { cwd: string; outDir: string; stem: string; names: ReturnType<typeof outputNames>; io: RdfIo; file: string; argv: string[]; problems: string[] }

const nameKey = (s: string) => s.normalize('NFC').toLowerCase();

/** Where and under which names a run would write now, and the exact argv (T25, T29, T30). */
export async function planRun(ctx: Ctx, req: RunRequest, roots: string[]): Promise<Plan> {
  if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
  if (!req.inputs?.trajectory || !req.inputs.runInput) throw new HttpError(400, 'a trajectory and a run input are needed');
  const trajectory = inside(req.inputs.trajectory, roots), runInput = inside(req.inputs.runInput, roots);
  // Uploaded inputs have no folder of their own: their outputs go to the state folder's workspace.
  const uploaded = trajectory.startsWith(join(ctx.home, 'uploads') + '/');
  const outDir = req.outDir ? inside(req.outDir, roots) : uploaded ? join(ctx.home, 'workspace') : join(dirname(trajectory), 'rdf');
  let stem: string;
  try { stem = renderStem(req.template || DEFAULT_TEMPLATE, { analysis: 'rdf', trajectory: basename(trajectory).replace(/\.[^.]+$/, '') }); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  stem = freeStem(stem, existsSync(outDir) ? readdirSync(outDir) : []);
  const help = await rdfHelp(ctx.gmx), { cwd, io } = rdfIo({ trajectory, runInput }, outDir, stem);
  let argv: string[];
  try { argv = rdfArgs({ options: req.options || {}, selections: (req.groups?.length || 1) - 1 }, io, help); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  return { cwd, outDir, stem, names: outputNames(stem), io, file: ctx.gmx.path!, argv, problems: recipeProblems(req.options || {}, help) };
}

/** The groups' atoms from the structure file, as the GUI computed them; names and emptiness refused here too. */
function groupsAtoms(req: RunRequest, roots: string[]): { atoms: Atom[]; sets: number[][] } {
  if (!req.inputs.structure) throw new HttpError(400, 'a structure is needed for the groups');
  const path = inside(req.inputs.structure, roots), text = readFileSync(path, 'utf8'), format = structFormat(path, text);
  if (!format) throw new HttpError(400, path + ' is not a .gro or .pdb');
  if (!Array.isArray(req.groups) || req.groups.length < 2) throw new HttpError(400, 'a reference and at least one selection are needed');
  const names = req.groups.map(g => g.name), atoms = atomTable(text, format);
  const sets = req.groups.map((g, i) => {
    const bad = nameProblem(g.name, names.filter((_, j) => j !== i));
    if (bad) throw new HttpError(400, g.name + ': ' + bad);
    const nrs = groupAtoms(atoms, g.steps);
    if (!nrs.length) throw new HttpError(400, g.name + ' has no atoms');
    return nrs;
  });
  return { atoms, sets };
}

async function fileInfo(path: string, hash: boolean): Promise<FileInfo> {
  const st = statSync(path);
  return { path, size: st.size, mtime: st.mtime.toISOString(), ...(hash ? { sha256: await sha256File(path) } : {}) };
}

/**
 * Starts a run, or refuses with the reason. `record` settles once the record is written (tests wait on it);
 * a job interrupted by a restart of gmx-cypher gets no record.
 */
export async function startRun(ctx: Ctx, req: RunRequest, roots: string[]): Promise<{ job: Job; record: Promise<RunRecord> }> {
  const plan = await planRun(ctx, req, roots);
  if (plan.problems.length) throw new HttpError(409, plan.problems.join('\n'));
  const { atoms, sets } = groupsAtoms(req, roots);
  const groups = req.groups.map((g, i) => ({ name: g.name, atoms: sets[i] }));
  const runInput = inside(req.inputs.runInput!, roots);
  const sizes = await checkSizes(ctx.gmx, runInput, groups, ctx.home);
  if (!sizes.ok) throw new HttpError(409, sizes.problems.join('\n'));

  // Checked again just before the spawn: a file that appeared meanwhile stops the run (T30).
  if (!existsSync(plan.outDir)) mkdirSync(plan.outDir, { recursive: plan.outDir.startsWith(ctx.home + '/') });
  const ours = new Set(Object.values(plan.names).map(nameKey));
  const appeared = readdirSync(plan.outDir).filter(n => ours.has(nameKey(n)));
  if (appeared.length) throw new HttpError(409, appeared.join(', ') + ' appeared in ' + plan.outDir + ' while checking; nothing was started. Start again for a new name.');
  const ndxPath = join(plan.outDir, plan.names.ndx), recordPath = join(plan.outDir, plan.names.record);
  writeFileSync(ndxPath, writeNdx(groups), { flag: 'wx' });

  const inputs: RunRecord['inputs'] = {};
  for (const [slot, p] of Object.entries(req.inputs) as [Slot, string][]) if (p) inputs[slot] = await fileInfo(inside(p, roots), slot !== 'trajectory' || ctx.config.hashTrajectories);
  // The frames it will read (≈), for its progress: the run input's schedule narrowed by -b, -e and -dt.
  const dump = await capture(ctx.gmx.path!, ['dump', '-s', runInput], { cwd: plan.cwd, until: /^\s*natoms\s*=\s*\d+/m });
  const estimate = runEstimate(frameEstimate(parseDump(dump.stdout), inputs.trajectory!.path), req.options || {});
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GMX'))) as Record<string, string>;
  const job = ctx.jobs.start({
    kind: 'rdf', title: plan.stem + ' · ' + req.groups[0].name + ' → ' + req.groups.slice(1).map(g => g.name).join(', '),
    file: plan.file, args: plan.argv, cwd: plan.cwd, meta: { stem: plan.stem, outDir: plan.outDir, record: recordPath, names: plan.names, estimate },
  });

  const record = new Promise<RunRecord>((done, fail) => {
    const finish = async (j: Job) => {
      const outputs: Output[] = [];
      for (const [kind, name] of [['xvg', plan.names.xvg], ['cn', plan.names.cn], ['ndx', plan.names.ndx]] as const) {
        const p = join(plan.outDir, name);
        if (existsSync(p)) outputs.push({ kind, path: p, size: statSync(p).size, sha256: await sha256File(p) });
      }
      // A GROMACS backup (#name.1#) of one of our names means something wrote it during the run.
      const problems = readdirSync(plan.outDir).filter(n => { const m = /^#(.+)\.\d+#$/.exec(n); return m && ours.has(nameKey(m[1])); })
        .map(n => 'gmx backed up a file that appeared during the run: ' + n);
      const r = buildRecord({
        runner: ctx.version, gmx: { path: ctx.gmx.path!, version: ctx.gmx.version! }, env, command: { cwd: plan.cwd, file: plan.file, args: plan.argv },
        inputs, groups: req.groups, atoms, sizes: sizes.sizes, options: req.options || {}, help: await rdfHelp(ctx.gmx), template: req.template || DEFAULT_TEMPLATE,
        outDir: req.outDir ?? null, job: j, outputs, problems,
      });
      writeFileSync(recordPath, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
      return r;
    };
    const onJob = (j: Job) => { if (j.id === job.id && j.ended) { ctx.jobs.off('job', onJob); finish(j).then(done, fail); } };
    ctx.jobs.on('job', onJob);
    onJob(job);
  });
  record.catch(() => { /* reported by the job view when the record is missing */ });
  return { job, record };
}
