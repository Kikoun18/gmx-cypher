// Runs (R5, T21, T29–T31; R4 for the commands without groups): free names chosen for all of a run's files and
// checked again just before the spawn, each group's size confirmed by gmx select, the index written next to the
// outputs with O_EXCL, gmx started without a shell, and the run record written when it ends. Nothing existing is
// ever replaced. A command with groups claims its stem with its index; one without claims it with its record.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { atomTable, type Atom } from '../src/lib/atoms';
import { allNames, COMMANDS, commandOf, roleProblems, type CommandDef, type InputSlot, type OutputNames, type RunIo } from '../src/lib/commands';
import { awhFrames, awhNames, framesWritten, type AwhFrame } from '../src/lib/awh';
import { commonFolder, listFile, whamOutputNames } from '../src/lib/wham';
import { parseDistanceStats } from '../src/lib/distance';
import { summaryLines } from '../src/lib/hbond';
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
import { awhScan } from './awh';
import { checkSizes, dumpRunInput } from './check';
import { energyMenu } from './energy';
import { inside, sha256File, within } from './files';
import { findTool, toolHelp } from './gmx';
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
  /** gmx wham's windows (R6): each window's run input and pull file, in the order of the lists. */
  windows?: { tpr: string; pull: string }[];
  /** gmx wham: positions (pullx) or forces (pullf). */
  pull?: 'pullx' | 'pullf';
}
export interface Plan {
  /** The command, and the gmx tool it runs as (R8: gmx hbond is the legacy H-bond tool before GROMACS 2024). */
  tool: string; gmxTool: string; cwd: string; outDir: string; stem: string; names: OutputNames; io: RunIo; file: string; argv: string[]; env: Record<string, string>; problems: string[]; stdin?: string
  /** The options as gmx gets them, when gmx-cypher fills one in (gmx wham's temperature from the run inputs, R6). */
  options: Options
  /** What gmx-cypher filled in or found, in words, for the page to show. */
  notes: string[]
  /** Files written beside the outputs before gmx starts (gmx wham's window lists), never over an existing file. */
  writes: { name: string; text: string }[]
  /** gmx wham's windows, as real paths. */
  windows?: { tpr: string; pull: string }[]
}

/** What a job sets in gmx's environment: GROMACS backs up an existing output unless GMX_MAXBACKUP is 0 or -1 (then 2025.4 overwrites; checked), which cluster shells often set (review finding 6). */
const JOB_ENV = { GMX_MAXBACKUP: '99' };

const nameKey = (s: string) => s.normalize('NFC').toLowerCase();

const LABELS: Partial<Record<InputSlot, string>> = { trajectory: 'a trajectory', runInput: 'a run input', edr: 'an energy file' };

/** Where and under which names a run would write now, and the exact argv (T25, T29, T30). */
export async function planRun(ctx: Ctx, req: RunRequest, roots: string[]): Promise<Plan> {
  if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
  const cmd = commandOf(req.tool ?? 'rdf');
  if (!cmd) throw new HttpError(400, 'no command ' + req.tool + ': gmx-cypher runs ' + COMMANDS.map(c => c.tool).join(', '));
  const found = await findTool(ctx.gmx, cmd);
  if (!found.ok) throw new HttpError(409, found.why);
  const paths: Partial<Record<InputSlot, string>> = {};
  for (const slot of cmd.required) {
    if (!req.inputs?.[slot]) throw new HttpError(400, cmd.required.map(s => LABELS[s]).join(' and ') + (cmd.required.length > 1 ? ' are' : ' is') + ' needed');
    paths[slot] = inside(req.inputs[slot]!, roots);
  }
  // A command without groups may take an optional input (gmx energy's run input): checked like the rest when given.
  // (RDF's structure and index are read for the groups, in startRun; its plan doesn't need them.)
  if (!cmd.groups) for (const slot of cmd.inputs) if (!paths[slot] && req.inputs?.[slot]) paths[slot] = inside(req.inputs[slot]!, roots);
  // gmx wham's windows (R6) are its inputs: each checked like one, and the folder holding them all names the run.
  let windows: { tpr: string; pull: string }[] | undefined;
  if (cmd.tool === 'wham') {
    if (!Array.isArray(req.windows) || req.windows.length < 2) throw new HttpError(400, 'at least two umbrella windows are needed');
    windows = req.windows.map(w => {
      const tpr = inside(String(w?.tpr ?? ''), roots), pull = inside(String(w?.pull ?? ''), roots);
      if (!/\.tpr$/i.test(tpr)) throw new HttpError(400, tpr + ' is not a run input (.tpr)');
      if (!/\.xvg$/i.test(pull)) throw new HttpError(400, pull + ' is not a pull file (.xvg)');
      return { tpr, pull };
    });
  }
  // The first required input names the run: its folder holds the outputs, and its name stands in for {trajectory}.
  const first = cmd.required.length ? paths[cmd.required[0]]! : null;
  const folder = first ? dirname(first) : commonFolder(windows!.map(w => w.tpr));
  const named = first ? basename(first).replace(/\.[^.]+$/, '') : basename(folder);
  // Uploaded inputs have no folder of their own: their outputs go to the state folder's workspace.
  const uploaded = (folder + '/').startsWith(join(ctx.home, 'uploads') + '/');
  const outDir = req.outDir ? inside(req.outDir, roots) : uploaded ? join(ctx.home, 'workspace') : join(folder, cmd.tool);
  // The default folder is beside the inputs, so inside an allowed folder, except for gmx wham, whose windows may sit
  // in two allowed folders with their common folder in neither: then an output folder is asked for (review).
  if (!req.outDir && !uploaded && !roots.some(r => { try { return within(outDir, realpathSync(r)); } catch { return false; } }))
    throw new HttpError(400, folder + ', the folder that holds all the inputs, is outside the allowed folders: choose an output folder inside them');
  // The vault is written only by sending, into a project's _inbox (review finding 11).
  const vault = ctx.config.vault && existsSync(ctx.config.vault) ? realpathSync(ctx.config.vault) : null;
  if (vault && within(outDir, vault)) throw new HttpError(400, outDir + ' is inside the PMF Sequences vault; results go there only by send to vault');
  let stem: string;
  try { stem = renderStem(req.template || DEFAULT_TEMPLATE, { ...req.names, analysis: cmd.tool, trajectory: named }); }
  catch (e) {
    const m = (e as Error).message;
    throw new HttpError(400, !req.names && m.endsWith('has no value here') ? m + ": in a single run only {analysis} and {trajectory} do; a batch's path template gives the others" : m);
  }
  // gmx awh writes a file per frame (R5): the frames come from a scan of the file, and each one's name must be free too.
  const frames: AwhFrame[] | null = cmd.tool === 'awh' ? (await awhScan(ctx.gmx, first!, paths.runInput!)).frames : null;
  const extra = frames ? frames.map(f => f.suffix) : cmd.suffixes ?? [];
  stem = freeStem(stem, existsSync(outDir) ? readdirSync(outDir) : [], extra);
  const help = found.help, { cwd, io } = cmd.io(paths, outDir, stem);
  let options: Options = req.options || {};
  const notes: string[] = [], tempProblems: string[] = [];
  if (windows && (options.temp === undefined || options.temp === '')) {
    // gmx wham doesn't read the temperature from the run inputs (it assumes 298 K): gmx-cypher does, and passes it.
    const temps = [...new Set((await mapLimit(windows, 4, w => dumpRunInput(ctx.gmx, w.tpr, folder))).flatMap(d => d.refT ?? []))];
    if (temps.length === 1) { options = { ...options, temp: String(temps[0]) }; notes.push('temperature ' + temps[0] + ' K, from the run inputs (gmx wham would assume 298 K)'); }
    else tempProblems.push(temps.length ? 'the run inputs have different temperatures (' + temps.join(', ') + ' K): set the temperature' : 'no temperature in the run inputs: set the temperature');
  }
  let argv: string[];
  try { argv = cmd.argv({ options, selections: (req.groups?.length || 1) - 1, pull: req.pull ?? 'pullx' }, io, help); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  // The tool as this gmx names it: the definition writes its own name first.
  argv = [found.tool, ...argv.slice(1)];
  const problems = [...cmd.problems(options, help), ...tempProblems];
  let stdin: string | undefined;
  if (cmd.stdin) {
    // The terms are numbers from this file's own menu (T99): checked against it here, as gmx would refuse them.
    if (cmd.tool === 'energy') problems.push(...energyProblems(req.terms ?? [], await energyMenu(ctx.gmx, first!)));
    stdin = cmd.stdin({ terms: req.terms ?? [], selections: (req.groups?.length || 1) - 1, options });
  }
  let names = cmd.outputNames(stem, options);
  if (frames) {
    const written = framesWritten(frames, req.options || {}), files = awhNames(stem, written);
    if (!frames.length) problems.push('this energy file has no AWH data');
    // gmx awh writes nothing and still exits 0 when -b is past the last frame (2025.4, checked).
    else if (!written.length) problems.push('no AWH frame in this range: the file has frames from ' + frames[0].time + ' to ' + frames[frames.length - 1].time + ' ps');
    // The last frame is the run's file for the vault (the usual choice for PMF Sequences); the earlier ones come with it.
    if (files.length) names = { xvg: files[files.length - 1], record: names.record, more: files.slice(0, -1) };
  }
  // gmx wham reads its windows from two lists, written beside the outputs, with the windows' real paths.
  const writes = windows ? [{ name: stem + '_tpr-files.dat', text: listFile(windows.map(w => w.tpr)) }, { name: stem + '_pull-files.dat', text: listFile(windows.map(w => w.pull)) }] : [];
  if (windows) names = whamOutputNames(stem, Number(options.nBootstrap) > 0);
  return { tool: cmd.tool, gmxTool: found.tool, cwd, outDir, stem, names, io, file: ctx.gmx.path!, argv, env: JOB_ENV, problems, stdin, options, notes, writes, ...(windows ? { windows } : {}) };
}

/** `f` over `items`, at most `limit` at a time, the results in order. */
async function mapLimit<T, R>(items: T[], limit: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await f(items[i]); } }));
  return out;
}

/** The groups' atoms from the structure file, as the GUI computed them; their number, names and emptiness refused here too. */
function groupsAtoms(cmd: CommandDef, req: RunRequest, roots: string[]): { atoms: Atom[]; sets: number[][] } {
  if (!req.inputs.structure) throw new HttpError(400, 'a structure is needed for the groups');
  const path = inside(req.inputs.structure, roots), text = readFileSync(path, 'utf8'), format = structFormat(path, text);
  if (!format) throw new HttpError(400, path + ' is not a .gro or .pdb');
  const count = roleProblems(cmd, Array.isArray(req.groups) ? req.groups.length : 0);
  if (count.length) throw new HttpError(400, count.join('\n'));
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

/** The frames an AWH run wrote, as a record states them: their count, and the last one's time. */
function awhRecordFrames(stem: string, names: string[]) {
  const f = awhFrames(stem, names);
  return f.length ? { analysed: f.length, lastTime: f[f.length - 1].time } : null;
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
    const picked = groupsAtoms(cmd, req, roots);
    atoms = picked.atoms;
    groups = req.groups.map((g, i) => ({ name: g.name, atoms: picked.sets[i] }));
    // What the command would get wrong with these groups (gmx distance's pairs of unequal sizes, R7): refused here.
    const wrong = cmd.groupProblems?.(plan.options, picked.sets.map(s => s.length), req.groups.map(g => g.name), picked.sets) ?? [];
    if (wrong.length) throw new HttpError(409, wrong.join('\n'));
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
    const mine = new Set(allNames(plan.names).map(nameKey)), claim = cmd.groups ? plan.names.ndx! : plan.names.record;
    let appeared = readdirSync(plan.outDir).filter(n => mine.has(nameKey(n)));
    if (!appeared.length) {
      try { writeFileSync(join(plan.outDir, claim), cmd.groups ? writeNdx(groups) : '', { flag: 'wx' }); break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; appeared = [claim]; }
    }
    if (!req.retryNames || attempt >= 5) throw new HttpError(409, appeared.join(', ') + ' appeared in ' + plan.outDir + ' while checking; nothing was started. Start again for a new name.');
    plan = await planRun(ctx, req, roots);
  }
  // gmx wham's window lists, beside the outputs: names the planner found free and claimed with the stem (T30).
  for (const w of plan.writes) writeFileSync(join(plan.outDir, w.name), w.text, { flag: 'wx' });
  const ours = new Set(allNames(plan.names).map(nameKey));
  const recordPath = join(plan.outDir, plan.names.record);

  const inputs: RunRecord['inputs'] = {};
  for (const [slot, p] of Object.entries(req.inputs) as [Slot, string][]) if (p) inputs[slot] = await fileInfo(inside(p, roots), slot !== 'trajectory' || ctx.config.hashTrajectories);
  // The frames it will read (≈), for its progress: the run input's schedule narrowed by -b, -e and -dt.
  const estimate = d && cmd.groups ? runEstimate(frameEstimate(d, inputs.trajectory!.path), req.options || {}) : null;
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('GMX'))) as Record<string, string>, ...plan.env };
  const job = ctx.jobs.start({
    kind: plan.tool, title: !cmd.groups ? plan.stem + ' · gmx ' + plan.tool : plan.stem + ' · ' + req.groups[0].name + (req.groups.length > 1 ? ' → ' + req.groups.slice(1).map(g => g.name).join(', ') : ''),
    file: plan.file, args: plan.argv, cwd: plan.cwd, env: plan.env, meta: { stem: plan.stem, outDir: plan.outDir, record: recordPath, names: plan.names, estimate },
    ...(plan.stdin != null ? { stdin: plan.stdin } : {}),
  });

  const record = new Promise<RunRecord>((done, fail) => {
    const finish = async (j: Job) => {
      const outputs: Output[] = [];
      const kindOf = (n: string): Output['kind'] => (n.endsWith('.dat') ? 'list' : n.endsWith('.ndx') ? 'ndx' : 'xvg');
      const files: [Output['kind'], string | undefined][] = [...(plan.names.more ?? []).map(n => [kindOf(n), n] as [Output['kind'], string]), ['xvg', plan.names.xvg], ['cn', plan.names.cn], ['ndx', plan.names.ndx]];
      for (const [kind, name] of files) {
        if (!name) continue;
        const p = join(plan.outDir, name);
        if (existsSync(p)) outputs.push({ kind, path: p, size: statSync(p).size, sha256: await sha256File(p) });
      }
      // A GROMACS backup (#name.1#) of one of our names means something wrote it during the run.
      const problems = readdirSync(plan.outDir).filter(n => { const m = /^#(.+)\.\d+#$/.exec(n); return m && ours.has(nameKey(m[1])); })
        .map(n => 'gmx backed up a file that appeared during the run: ' + n);
      const r = buildRecord({
        analysis: plan.tool, record: plan.names.record, runner: ctx.version, gmx: { path: ctx.gmx.path!, version: ctx.gmx.version! }, env, command: { cwd: plan.cwd, file: plan.file, args: plan.argv },
        inputs, groups: req.groups ?? [], atoms, sizes, options: plan.options, help: await toolHelp(ctx.gmx, plan.gmxTool), form: cmd.options, template: req.template || DEFAULT_TEMPLATE,
        outDir: req.outDir ?? null, job: j, outputs, problems, stdin: plan.stdin, terms: req.terms,
        ...(plan.windows ? { windows: await Promise.all(plan.windows.map(async w => ({ tpr: await fileInfo(w.tpr, true), pull: await fileInfo(w.pull, true) }))), pull: req.pull ?? 'pullx' } : {}),
        ...(plan.tool === 'energy' ? { statistics: parseEnergyStats(j.log) } : {}),
        ...(plan.tool === 'distance' ? { distances: parseDistanceStats(j.log) } : {}),
        // What gmx hbond found (R8): the donors and acceptors of each group, and the legacy tool's average.
        ...(cmd.summary ? { summary: summaryLines(j.log, cmd.summary) } : {}),
        // gmx awh's frames are its files: how many it wrote, and the time of the last (the one for the vault).
        ...(plan.tool === 'awh' ? { frames: awhRecordFrames(plan.stem, outputs.map(o => o.path.split('/').pop()!)) } : {}),
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
