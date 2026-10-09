// Runs (R5, T21, T29–T31; R4 for the commands without groups): free names chosen for all of a run's files and
// checked again just before the spawn, each group's size confirmed by gmx select, the index written next to the
// outputs with O_EXCL, gmx started without a shell, and the run record written when it ends. Nothing existing is
// ever replaced. A command with groups claims its stem with its index; one without claims it with its record.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { atomTable, type Atom } from '../src/lib/atoms';
import { COMMANDS, commandOf, type InputSlot, type OutputNames, type RunIo } from '../src/lib/commands';
import { energyProblems, parseEnergyStats } from '../src/lib/energy';
import { groupAtoms, nameProblem, type Group } from '../src/lib/groups';
import type { Slot } from '../src/lib/inputs';
import { DEFAULT_TEMPLATE, freeStem, renderStem } from '../src/lib/names';
import { writeNdx } from '../src/lib/ndx';
import { structureMismatch } from '../src/lib/checks';
import { frameEstimate } from '../src/lib/gmxText';
import { runEstimate, type Options } from '../src/lib/rdf';
import { buildRecord, type FileInfo, type Output, type RunRecord } from '../src/lib/record';
import { structFormat } from '../../app/src/lib/structFile';
import type { Ctx } from './api';
import { checkSizes, dumpRunInput } from './check';
import { energyMenu } from './energy';
import { inside, sha256File, within } from './files';
import { toolHelp } from './gmx';
import { HttpError } from './http';
import type { Job } from './jobs';

export interface RunRequest {
  /** The command's tool name (T98); RDF when it is left out. */
  tool?: string;
  inputs: Partial<Record<Slot, string>>; groups: Group[]; options: Options; template?: string; outDir?: string | null;
  /** The energy terms picked, by number from the file's menu (R4); sent on stdin. */
  terms?: number[];
  /** Values for the name template's PMF Sequences tokens: a batch's path fields (review finding 4). */
  names?: Record<string, string>;
  /** A batch run whose names were taken meanwhile takes the next free stem instead of stopping (review finding 5). */
  retryNames?: boolean;
}
export interface Plan { tool: string; cwd: string; outDir: string; stem: string; names: OutputNames; io: RunIo; file: string; argv: string[]; env: Record<string, string>; problems: string[]; stdin?: string }

/** What a job sets in gmx's environment: GROMACS backs up an existing output unless GMX_MAXBACKUP is 0 or -1 (then 2025.4 overwrites; checked), which cluster shells often set (review finding 6). */
const JOB_ENV = { GMX_MAXBACKUP: '99' };

const nameKey = (s: string) => s.normalize('NFC').toLowerCase();

const LABELS: Partial<Record<InputSlot, string>> = { trajectory: 'a trajectory', runInput: 'a run input', edr: 'an energy file' };

/** Where and under which names a run would write now, and the exact argv (T25, T29, T30). */
export async function planRun(ctx: Ctx, req: RunRequest, roots: string[]): Promise<Plan> {
  if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
  const cmd = commandOf(req.tool ?? 'rdf');
  if (!cmd) throw new HttpError(400, 'no command ' + req.tool + ': gmx-cypher runs ' + COMMANDS.map(c => c.tool).join(', '));
  const paths: Partial<Record<InputSlot, string>> = {};
  for (const slot of cmd.required) {
    if (!req.inputs?.[slot]) throw new HttpError(400, cmd.required.map(s => LABELS[s]).join(' and ') + (cmd.required.length > 1 ? ' are' : ' is') + ' needed');
    paths[slot] = inside(req.inputs[slot]!, roots);
  }
  // A command without groups may take an optional input (gmx energy's run input): checked like the rest when given.
  // (RDF's structure and index are read for the groups, in startRun; its plan doesn't need them.)
  if (!cmd.groups) for (const slot of cmd.inputs) if (!paths[slot] && req.inputs?.[slot]) paths[slot] = inside(req.inputs[slot]!, roots);
  // The first required input names the run: its folder holds the outputs, and its name stands in for {trajectory}.
  const first = paths[cmd.required[0]]!;
  // Uploaded inputs have no folder of their own: their outputs go to the state folder's workspace.
  const uploaded = first.startsWith(join(ctx.home, 'uploads') + '/');
  const outDir = req.outDir ? inside(req.outDir, roots) : uploaded ? join(ctx.home, 'workspace') : join(dirname(first), cmd.tool);
  // The vault is written only by sending, into a project's _inbox (review finding 11).
  const vault = ctx.config.vault && existsSync(ctx.config.vault) ? realpathSync(ctx.config.vault) : null;
  if (vault && within(outDir, vault)) throw new HttpError(400, outDir + ' is inside the PMF Sequences vault; results go there only by send to vault');
  let stem: string;
  try { stem = renderStem(req.template || DEFAULT_TEMPLATE, { ...req.names, analysis: cmd.tool, trajectory: basename(first).replace(/\.[^.]+$/, '') }); }
  catch (e) {
    const m = (e as Error).message;
    throw new HttpError(400, !req.names && m.endsWith('has no value here') ? m + ": in a single run only {analysis} and {trajectory} do; a batch's path template gives the others" : m);
  }
  stem = freeStem(stem, existsSync(outDir) ? readdirSync(outDir) : []);
  const help = await toolHelp(ctx.gmx, cmd.tool), { cwd, io } = cmd.io(paths, outDir, stem);
  let argv: string[];
  try { argv = cmd.argv({ options: req.options || {}, selections: (req.groups?.length || 1) - 1 }, io, help); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  const problems = cmd.problems(req.options || {}, help);
  let stdin: string | undefined;
  if (cmd.stdin) {
    // The terms are numbers from this file's own menu (T99): checked against it here, as gmx would refuse them.
    if (cmd.tool === 'energy') problems.push(...energyProblems(req.terms ?? [], await energyMenu(ctx.gmx, first)));
    stdin = cmd.stdin(req.terms ?? []);
  }
  return { tool: cmd.tool, cwd, outDir, stem, names: cmd.outputNames(stem), io, file: ctx.gmx.path!, argv, env: JOB_ENV, problems, stdin };
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

/** Records being written: a job's end event comes just before its record (outputs hashed), and a request asked then waits for it. */
const writing = new Map<string, Promise<RunRecord>>();
export async function recordWritten(jobId: string) { await writing.get(jobId)?.catch(() => {}); }

/**
 * Starts a run, or refuses with the reason. `record` settles once the record is written (tests wait on it);
 * a job interrupted by a restart of gmx-cypher gets no record.
 */
export async function startRun(ctx: Ctx, req: RunRequest, roots: string[]): Promise<{ job: Job; record: Promise<RunRecord> }> {
  let plan = await planRun(ctx, req, roots);
  if (plan.problems.length) throw new HttpError(409, plan.problems.join('\n'));
  const cmd = commandOf(plan.tool)!;
  // Only a command with groups has an index to check against the structure and to write (R3a).
  let atoms: Atom[] = [], groups: { name: string; atoms: number[] }[] = [], d: Awaited<ReturnType<typeof dumpRunInput>> | null = null, sizes: number[] | null = null;
  if (cmd.groups) {
    const picked = groupsAtoms(req, roots);
    atoms = picked.atoms;
    groups = req.groups.map((g, i) => ({ name: g.name, atoms: picked.sets[i] }));
    const runInput = inside(req.inputs.runInput!, roots);
    // The groups' atom numbers come from the structure: it must be the run input's system, or every group
    // would be other atoms that gmx select still counts the same (review finding 1).
    d = await dumpRunInput(ctx.gmx, runInput, plan.cwd);
    const mismatch = structureMismatch(atoms.length, d.natoms);
    if (mismatch) throw new HttpError(409, mismatch);
    const checked = await checkSizes(ctx.gmx, runInput, groups, ctx.home);
    if (!checked.ok) throw new HttpError(409, checked.problems.join('\n'));
    sizes = checked.sizes;
  }

  // Checked again just before the spawn, and the stem claimed by creating its .ndx (or, without groups, its record)
  // exclusively (T30). A file that appeared meanwhile stops a single run, whose command was shown; a batch run plans a new free stem.
  for (let attempt = 0; ; attempt++) {
    if (!existsSync(plan.outDir)) mkdirSync(plan.outDir, { recursive: plan.outDir.startsWith(ctx.home + '/') });
    const mine = new Set(Object.values(plan.names).map(nameKey)), claim = cmd.groups ? plan.names.ndx! : plan.names.record;
    let appeared = readdirSync(plan.outDir).filter(n => mine.has(nameKey(n)));
    if (!appeared.length) {
      try { writeFileSync(join(plan.outDir, claim), cmd.groups ? writeNdx(groups) : '', { flag: 'wx' }); break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; appeared = [claim]; }
    }
    if (!req.retryNames || attempt >= 5) throw new HttpError(409, appeared.join(', ') + ' appeared in ' + plan.outDir + ' while checking; nothing was started. Start again for a new name.');
    plan = await planRun(ctx, req, roots);
  }
  const ours = new Set(Object.values(plan.names).map(nameKey));
  const recordPath = join(plan.outDir, plan.names.record);

  const inputs: RunRecord['inputs'] = {};
  for (const [slot, p] of Object.entries(req.inputs) as [Slot, string][]) if (p) inputs[slot] = await fileInfo(inside(p, roots), slot !== 'trajectory' || ctx.config.hashTrajectories);
  // The frames it will read (≈), for its progress: the run input's schedule narrowed by -b, -e and -dt.
  const estimate = d && cmd.groups ? runEstimate(frameEstimate(d, inputs.trajectory!.path), req.options || {}) : null;
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GMX'))) as Record<string, string>, ...plan.env };
  const job = ctx.jobs.start({
    kind: plan.tool, title: cmd.groups ? plan.stem + ' · ' + req.groups[0].name + ' → ' + req.groups.slice(1).map(g => g.name).join(', ') : plan.stem + ' · gmx ' + plan.tool,
    file: plan.file, args: plan.argv, cwd: plan.cwd, env: plan.env, meta: { stem: plan.stem, outDir: plan.outDir, record: recordPath, names: plan.names, estimate },
    ...(plan.stdin != null ? { stdin: plan.stdin } : {}),
  });

  const record = new Promise<RunRecord>((done, fail) => {
    const finish = async (j: Job) => {
      const outputs: Output[] = [];
      for (const [kind, name] of [['xvg', plan.names.xvg], ['cn', plan.names.cn], ['ndx', plan.names.ndx]] as const) {
        if (!name) continue;
        const p = join(plan.outDir, name);
        if (existsSync(p)) outputs.push({ kind, path: p, size: statSync(p).size, sha256: await sha256File(p) });
      }
      // A GROMACS backup (#name.1#) of one of our names means something wrote it during the run.
      const problems = readdirSync(plan.outDir).filter(n => { const m = /^#(.+)\.\d+#$/.exec(n); return m && ours.has(nameKey(m[1])); })
        .map(n => 'gmx backed up a file that appeared during the run: ' + n);
      const r = buildRecord({
        analysis: plan.tool, runner: ctx.version, gmx: { path: ctx.gmx.path!, version: ctx.gmx.version! }, env, command: { cwd: plan.cwd, file: plan.file, args: plan.argv },
        inputs, groups: req.groups ?? [], atoms, sizes, options: req.options || {}, help: await toolHelp(ctx.gmx, plan.tool), form: cmd.options, template: req.template || DEFAULT_TEMPLATE,
        outDir: req.outDir ?? null, job: j, outputs, problems, stdin: plan.stdin, terms: req.terms,
        ...(plan.tool === 'energy' ? { statistics: parseEnergyStats(j.log) } : {}),
      });
      // The record of a command with groups is new under its stem; one without was claimed as an empty file above.
      writeFileSync(recordPath, JSON.stringify(r, null, 2) + '\n', { flag: cmd.groups ? 'wx' : 'w' });
      return r;
    };
    const onJob = (j: Job) => { if (j.id === job.id && j.ended) { ctx.jobs.off('job', onJob); finish(j).then(done, fail); } };
    ctx.jobs.on('job', onJob);
    onJob(job);
  });
  writing.set(job.id, record);
  record.catch(() => { /* reported by the job view when the record is missing */ }).finally(() => writing.delete(job.id));
  return { job, record };
}
