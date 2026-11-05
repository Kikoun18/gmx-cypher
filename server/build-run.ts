// SymBuilder's builds (R5): the systems of a build plan, one at a time (T210), each step from the planner run as it
// says. gmx and python run through a job list of their own, <state>/builds/jobs (T217), without a shell; copies,
// renames and the texts gmx-cypher computes (text.ts) are done here. The writing rule (T205): a system's folder is
// created by the build that makes it, a step may write only a file that does not exist, and replace only one this
// build wrote; nothing is written outside the system's folder and the base folder's scripts/ (qq scripts, kept if
// they exist). Every file written or replaced is in the system's build record, <system>/build.json (T208), with its
// size and SHA-256, and so are GROMACS's own backups (#name.N#). A run's state is <state>/builds/runs/<id>.json.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { constants, copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fatalText } from '../src/lib/build/fatal';
import { NAMES, systemsOf, type BuildPlan, type Systems, type System } from '../src/lib/build/plan';
import { PROFILES, qqScript, type Profile } from '../src/lib/build/qq';
import { planSystem, type Step } from '../src/lib/build/steps';
import { carbGroup, hmrTopology, ionCounts, mergeGro, moleculetype, netCharge, pullx, renameWater, topologyText, walkerFrames, waters } from '../src/lib/build/text';
import type { JobStatus } from './jobs';

export const BUILD_FORMAT = 'gmx-cypher build', BUILD_VERSION = 1;

export type SystemStatus = 'waiting' | 'building' | 'built' | 'cluster' | 'failed' | 'skipped' | 'cancelled';
export type IfExists = 'continue' | 'skip' | 'repeat';

/** One system of a run, as the progress view shows it. */
export interface SystemRun {
  dir: string; method: string; saccharide: string; sequence: string;
  status: SystemStatus;
  /** Steps done, of how many. */
  step: number; steps: number;
  /** The step running or the last one, its job's id while it runs. */
  label?: string; stage?: string; job?: string;
  started?: string; ended?: string;
  /** The stage and GROMACS's fatal text, or why it stopped. */
  error?: string;
  /** Worth knowing, never stopping it: ions added, a walker's frame far from its target, a script kept. */
  notes: string[];
  /** The qq submit lines of its cluster stages (T206: printed, not run). */
  submit: string[];
}

export interface BuildRun {
  id: string; created: string; ended?: string;
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';
  plan: string; base: string; ifExists: IfExists; onFailure: 'next' | 'stop';
  systems: SystemRun[];
}

export interface FileRecord { size: number; sha256: string; step: number }
export interface StepRecord {
  i: number; stage: string; label: string; program: Step['program']; cwd: string; argv: string[]; stdin?: string;
  started: string; ended?: string; status: 'done' | 'failed' | 'cancelled' | 'refused';
  job?: string; exit?: number | null; error?: string;
}
/** A system's build record, <system>/build.json (T208). */
export interface BuildRecord {
  format: typeof BUILD_FORMAT; version: number; runner: string; build: string;
  system: { dir: string; method: string; saccharide: string; sequence: string };
  plan: BuildPlan; started: string; ended?: string; status: SystemStatus;
  steps: StepRecord[];
  /** Every file this build wrote or replaced, relative to the base folder, with the step that last wrote it. */
  files: Record<string, FileRecord>;
  /** GROMACS's backups of files this build replaced (#name.N#), relative to the base folder. */
  backups: string[];
  /** Folders this build created, relative to the base folder. */
  folders: string[];
  notes: string[]; submit: string[];
}

/** How a gmx or python step runs: the build's job list, or a test's stand-in. Its id is known at once, its end later. */
export type Exec = (spec: { title: string; file: string; args: string[]; cwd: string; stdin?: string; env?: Record<string, string>; meta: Record<string, unknown> }) => { id: string; done: Promise<{ status: JobStatus; code: number | null; log: string; error?: string }> };

export interface BuilderOptions {
  home: string; version: string; exec: Exec;
  /** Cancels the job a step runs. */
  cancel?: (job: string) => void;
  /** The tools as the settings say now: gmx's path, python by name or path. */
  tools: () => { gmx: string | null; python: string | null };
  /** Waiting for a local mdrun's .gro (R5c): every `every` ms, up to `max` ms. */
  wait?: { every: number; max: number };
  /** The qq profile a cluster stage's script is written for (R7a). */
  profile?: () => Profile;
}

/** The shipped python scripts (R5b), by the name the planner gives them. */
export const PYTHON_DIR = new URL('./python/', import.meta.url).pathname;

const now = () => new Date().toISOString();
const writeJson = (file: string, v: unknown) => { const part = file + '.' + process.pid + '.part'; writeFileSync(part, JSON.stringify(v, null, 2) + '\n'); renameSync(part, file); };
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

export function sha256File(path: string): Promise<string> {
  return new Promise((done, fail) => { const h = createHash('sha256'); createReadStream(path).on('data', d => h.update(d)).on('error', fail).on('end', () => done(h.digest('hex'))); });
}

class Stop extends Error {
  readonly status: 'failed' | 'cancelled' | 'cluster';
  constructor(status: 'failed' | 'cancelled' | 'cluster', message: string) { super(message); this.status = status; }
}

export class Builder extends EventEmitter {
  private readonly runs = new Map<string, BuildRun>();
  private readonly dir: string;
  private current: { id: string; cancelled: boolean; job?: string } | null = null;

  private readonly o: BuilderOptions;

  constructor(o: BuilderOptions) {
    super();
    this.o = o;
    this.dir = join(o.home, 'builds', 'runs');
    mkdirSync(this.dir, { recursive: true });
    for (const f of readdirSync(this.dir).filter(n => n.endsWith('.json'))) {
      let r: BuildRun;
      try { r = JSON.parse(readFileSync(join(this.dir, f), 'utf8')); } catch { continue; }
      // A run gmx-cypher stopped during: what was building is cancelled, nothing is invented about it.
      if (r.status === 'running') {
        r.status = 'interrupted'; r.ended = now();
        for (const s of r.systems) if (s.status === 'building' || s.status === 'waiting') { s.status = 'cancelled'; s.error = 'gmx-cypher stopped while this build ran'; }
        writeJson(join(this.dir, f), r);
      }
      this.runs.set(r.id, r);
    }
  }

  list(): BuildRun[] { return [...this.runs.values()].sort((a, b) => b.created.localeCompare(a.created)); }
  get(id: string) { return this.runs.get(id); }
  running() { return this.current ? this.runs.get(this.current.id) : undefined; }

  private save(r: BuildRun) { writeJson(join(this.dir, r.id + '.json'), r); this.emit('build', r); }

  /** Starts a build of every system (one at a time); `done` resolves when it ends. Refused while one runs. */
  start(plan: BuildPlan, systems: Systems, o: { base: string; ifExists: IfExists; onFailure: 'next' | 'stop' }): { run: BuildRun; done: Promise<BuildRun> } {
    if (this.current) throw new Error('a build is running: one at a time');
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const list = systemsOf(systems);
    const run: BuildRun = {
      id, created: now(), status: 'running', plan: plan.name, base: o.base, ifExists: o.ifExists, onFailure: o.onFailure,
      systems: list.map(s => ({ dir: s.dir, method: s.method, saccharide: s.saccharide, sequence: s.sequence, status: 'waiting', step: 0, steps: 0, notes: [], submit: [] })),
    };
    this.runs.set(id, run);
    this.current = { id, cancelled: false };
    this.save(run);
    const done = (async () => {
      for (let i = 0; i < list.length; i++) {
        const s = run.systems[i];
        if (this.current?.cancelled) { s.status = 'cancelled'; continue; }
        await this.system(run, plan, list[i], s);
        if (s.status === 'failed' && run.onFailure === 'stop') {
          for (const t of run.systems.slice(i + 1)) { t.status = 'skipped'; t.notes.push('the build stopped at ' + s.dir); }
          break;
        }
      }
      run.ended = now();
      run.status = this.current?.cancelled ? 'cancelled' : run.systems.some(s => s.status === 'failed') ? 'failed' : 'done';
      this.current = null;
      this.save(run);
      return run;
    })();
    return { run, done };
  }

  /** Stops the run: its current step's process group, then every system not built yet. */
  cancel(id: string) {
    if (this.current?.id !== id) throw new Error('build ' + id + ' is not running');
    this.current.cancelled = true;
    if (this.current.job) this.o.cancel?.(this.current.job);
  }

  private async system(run: BuildRun, plan: BuildPlan, sys: System, s: SystemRun) {
    const base = run.base, root = join(base, sys.dir), rel = (abs: string) => relative(base, abs);
    s.status = 'building'; s.started = now(); this.save(run);
    // The folder is this build's: created here, exclusively; one that exists is left as it is (continue, skip and
    // repeat for it: R6).
    if (existsSync(root)) { s.status = 'skipped'; s.ended = now(); s.notes.push(sys.dir + ' exists: it is left as it is'); this.save(run); return; }
    const record: BuildRecord = {
      format: BUILD_FORMAT, version: BUILD_VERSION, runner: this.o.version, build: run.id, system: { dir: sys.dir, method: sys.method, saccharide: sys.saccharide, sequence: sys.sequence },
      plan, started: s.started!, status: 'building', steps: [], files: {}, backups: [], folders: [], notes: s.notes, submit: s.submit,
    };
    const made = (dir: string) => {
      const missing: string[] = [];
      for (let d = dir; !existsSync(d) && inside(d, base); d = dirname(d)) missing.unshift(d);
      for (const d of missing) { mkdirSync(d); record.folders.push(rel(d)); }
    };
    try { made(dirname(root)); mkdirSync(root); record.folders.push(sys.dir); }
    catch (e) { s.status = 'failed'; s.error = 'could not create ' + sys.dir + ': ' + (e as Error).message; s.ended = now(); this.save(run); return; }
    const recordFile = join(root, 'build.json');
    writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    const steps = planSystem(plan, sys, { base, profile: this.o.profile?.() ?? PROFILES[0] });
    s.steps = steps.length;
    const values: Record<string, string> = {};
    let cluster = false;
    try {
      for (const [i, step] of steps.entries()) {
        if (this.current?.cancelled) throw new Stop('cancelled', 'cancelled');
        // The walkers start from the pull's frames, which the cluster makes: without them the system waits (R7b).
        if (step.stage === 'walkers' && !('t1' in values)) {
          const px = join(root, NAMES.pull, 'pullx.xvg'), xtc = join(root, NAMES.pull, NAMES.pull + '.xtc');
          if (!existsSync(px) || !existsSync(xtc)) { cluster = true; throw new Stop('cluster', 'waits for its pull: ' + NAMES.pull + '/' + (existsSync(px) ? NAMES.pull + '.xtc' : 'pullx.xvg')); }
          for (const w of walkerFrames(pullx(readFileSync(px, 'utf8')), plan.science.walkers)) {
            values['t' + w.walker] = String(w.time);
            if (w.far) s.notes.push('walker ' + w.walker + ' starts at ' + w.distance.toFixed(3) + ' nm, ' + w.off.toFixed(2) + ' nm from its target ' + w.target + ' nm');
          }
        }
        // Ions for prosECCo75's charges, from grompp's net charge and the waters in the topology (neutralizing_counts).
        if (step.resolves?.includes('np')) {
          const ions = ionCounts(Number(values.net ?? 0), waters(readFileSync(join(root, sys.sequence + '.top'), 'utf8')), plan.science);
          values.np = String(ions.positive); values.nn = String(ions.negative);
          s.notes.push('net charge ' + Number(values.net ?? 0).toFixed(2) + ' e: ' + ions.positive + ' ' + plan.science.positive + ' and ' + ions.negative + ' ' + plan.science.negative);
        }
        if (step.resolves?.includes('tmp')) values.tmp = mkdtempSync(join(tmpdir(), 'gmx-cypher-charge-'));
        s.step = i; s.label = step.label; s.stage = step.stage; this.save(run);
        const r = await this.step(run, plan, sys, step, i, values, record);
        if (step.where === 'cluster' && step.label === 'qq script') cluster = true;
        if (r.net != null) values.net = String(r.net);
        s.step = i + 1;
      }
      record.status = s.status = cluster ? 'cluster' : 'built';
    } catch (e) {
      const stop = e instanceof Stop ? e : new Stop('failed', (e as Error).message);
      record.status = s.status = stop.status;
      if (stop.status === 'cluster') s.notes.push(stop.message);
      else s.error = stop.message;
    }
    s.job = undefined;
    record.ended = s.ended = now();
    writeJson(recordFile, record);
    this.save(run);
  }

  /** One step: the writing rule, then the program, then its outputs required and recorded. */
  private async step(run: BuildRun, plan: BuildPlan, sys: System, step: Step, i: number, values: Record<string, string>, record: BuildRecord): Promise<{ net?: number }> {
    const argv = step.argv.map(a => a.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m));
    const rec: StepRecord = { i, stage: step.stage, label: step.label, program: step.program, cwd: step.cwd, argv, ...(step.stdin != null ? { stdin: step.stdin } : {}), started: now(), status: 'done' };
    record.steps.push(rec);
    const stop = (status: 'failed' | 'cancelled', why: string, refused = false) => { rec.status = refused ? 'refused' : status; rec.error = why; rec.ended = now(); return new Stop(status, step.stage.toUpperCase() + ' · ' + step.label + ': ' + why); };
    try { return await this.stepBody(run, plan, sys, step, i, record, rec, argv, stop); }
    catch (e) { if (e instanceof Stop) throw e; throw stop('failed', (e as Error).message); }
  }

  private async stepBody(run: BuildRun, plan: BuildPlan, sys: System, step: Step, i: number, record: BuildRecord, rec: StepRecord, argv: string[],
    stop: (status: 'failed' | 'cancelled', why: string, refused?: boolean) => Stop): Promise<{ net?: number }> {
    const base = run.base, root = join(base, sys.dir), abs = (p: string) => resolve(base, p), cwd = abs(step.cwd);
    const unresolved = argv.find(a => /\{\w+\}/.test(a));
    if (unresolved) throw stop('failed', 'no value for ' + unresolved);
    const scripts = join(base, 'scripts');
    // The writing rule (T205).
    for (const p of [...step.writes, ...step.replaces]) {
      const a = abs(p), ours = !!record.files[p];
      if (!inside(a, root) && !(inside(a, scripts) && step.label === 'qq script')) throw stop('failed', p + ' is outside the system\'s folder: nothing is written there', true);
      if (existsSync(a) && !ours && !(inside(a, scripts) && step.label === 'qq script'))
        throw stop('failed', p + ' exists, and this build did not write it: nothing is ' + (step.replaces.includes(p) ? 'replaced' : 'overwritten'), true);
    }
    if (!existsSync(cwd)) {
      if (!inside(cwd, root)) throw stop('failed', 'no folder ' + step.cwd);
      const missing: string[] = [];
      for (let d = cwd; !existsSync(d); d = dirname(d)) missing.unshift(d);
      for (const d of missing) { mkdirSync(d); record.folders.push(relative(base, d)); }
    }
    const before = new Set(backupsOf(step, base));
    let net: number | undefined;
    switch (step.program) {
      case 'gmx': case 'python': {
        const t = this.o.tools();
        const file = step.program === 'gmx' ? t.gmx : t.python ?? 'python3';
        if (!file) throw stop('failed', 'no working gmx: set it in settings');
        const args = step.program === 'gmx' ? argv : [join(PYTHON_DIR, argv[0]), ...argv.slice(1)];
        const job = this.o.exec({ title: sys.dir + ' · ' + step.label, file, args, cwd, ...(step.stdin != null ? { stdin: step.stdin } : {}), env: { GMX_MAXBACKUP: '99' }, meta: { build: run.id, system: sys.dir, step: i } });
        rec.job = job.id;
        if (this.current) this.current.job = job.id;
        const sr = run.systems.find(x => x.dir === sys.dir);
        if (sr) { sr.job = job.id; this.save(run); }
        const r = await job.done;
        if (this.current) this.current.job = undefined;
        rec.exit = r.code;
        if (r.status === 'cancelled' || this.current?.cancelled) throw stop('cancelled', 'cancelled');
        const fatal = fatalText(r.log);
        if (fatal) throw stop('failed', fatal);
        // Strict mode stops on any non-zero exit; off, only GROMACS's fatal text does (the notebook's STRICT=False).
        // python is not GROMACS: its failure stops the system either way.
        if (r.status !== 'done' && (plan.science.strict || step.program === 'python' || r.code == null)) throw stop('failed', r.error ?? 'exit ' + r.code);
        if (step.label === 'grompp before the salt') net = netCharge(r.log);
        if (step.tile === 'charge') record.notes.push('net charge after npt: ' + netCharge(r.log).toFixed(2) + ' e');
        break;
      }
      case 'copy': {
        const from = abs(argv[0]), to = join(cwd, argv[1]);
        if (step.label === 'qq script') {
          // R7a: the script in scripts/, created exclusively; one that exists is kept and used, as the notebook does.
          const s = qqScript(step.stage, sys, this.o.profile?.() ?? PROFILES[0], plan.science.walkers.length)!;
          mkdirSync(dirname(from), { recursive: true });
          try { writeFileSync(from, s.text, { flag: 'wx', mode: 0o755 }); record.files[argv[0]] = await fileRecord(from, i); }
          catch { record.notes.push(argv[0] + ' exists: kept, and used'); }
          record.submit.push(s.submit);
        }
        if (!existsSync(from)) throw stop('failed', 'no ' + argv[0]);
        copyFileSync(from, to, constants.COPYFILE_EXCL);
        break;
      }
      case 'rename': renameSync(join(cwd, argv[0]), join(cwd, argv[1])); delete record.files[relative(base, join(cwd, argv[0]))]; break;
      case 'write': {
        const file = join(cwd, argv[0]), text = this.make(step, sys, plan, cwd, base);
        if (step.replaces.length) { writeFileSync(file + '.part', text); renameSync(file + '.part', file); }
        else writeFileSync(file, text, { flag: 'wx' });
        break;
      }
      case 'read': readFileSync(join(cwd, argv[0]), 'utf8'); break;
      case 'wait': {
        const w = this.o.wait ?? { every: 10_000, max: 600_000 }, file = join(cwd, argv[0]);
        for (let t = 0; !existsSync(file); t += w.every) {
          if (t >= w.max) throw stop('failed', 'no ' + argv[0] + ' after ' + Math.round(w.max / 60_000) + ' min');
          if (this.current?.cancelled) throw stop('cancelled', 'cancelled');
          await new Promise(r => setTimeout(r, w.every));
        }
        // The file mdrun wrote, recorded once it is there.
        record.files[relative(base, file)] = await fileRecord(file, i - 1);
        break;
      }
    }
    // What it should have made (require): a step whose output is missing stops the system. mdrun's trajectory and
    // checkpoint depend on its mdp, and its .gro is the next step's wait.
    const optional = (p: string) => p.startsWith('scripts/') || /\.(trr|cpt|xtc)$/.test(p) || (step.argv[0] === 'mdrun' && p.endsWith('.gro'));
    const missing = step.writes.filter(p => !existsSync(abs(p)) && !optional(p));
    if (missing.length) throw stop('failed', 'expected output missing: ' + missing.join(', '));
    // A script that was there before is not this build's (kept, not recorded).
    for (const p of [...step.writes, ...step.replaces]) if (existsSync(abs(p)) && !(p.startsWith('scripts/') && !record.files[p])) record.files[p] = await fileRecord(abs(p), i);
    for (const b of backupsOf(step, base)) if (!before.has(b)) { record.backups.push(b); record.files[b] = await fileRecord(abs(b), i); }
    rec.ended = now();
    return { ...(net != null ? { net } : {}) };
  }

  /** The text a write step writes (text.ts), from the files it reads. */
  private make(step: Step, sys: System, plan: BuildPlan, cwd: string, base: string): string {
    const read = (f: string) => readFileSync(join(cwd, f), 'utf8'), q = sys.sequence;
    switch (step.make) {
      case 'moleculetype': return moleculetype(read(q + '.top'));
      case 'merge': return mergeGro(read(NAMES.pre), read(sys.saccharide + '.gro'), plan.science.box);
      case 'topology': return topologyText(sys, plan.science);
      case 'water-tip3f': return renameWater(read(q + '.top'), 'TIP3F');
      case 'water-sol': return renameWater(read(q + '.top'), 'SOL');
      case 'hmr': return hmrTopology(read(q + '.top'), sys);
      case 'carb': {
        const carb = readFileSync(resolve(base, step.reads[0]), 'utf8');
        return read(step.argv[0]) + carbGroup(Number(carb.split('\n')[1].trim()));
      }
      default: throw new Error('nothing to write for ' + step.label);
    }
  }
}

async function fileRecord(path: string, step: number): Promise<FileRecord> {
  return { size: statSync(path).size, sha256: await sha256File(path), step };
}

/** GROMACS's backups (#name.N#) of the files a step replaces, relative to the base folder. */
function backupsOf(step: Step, base: string): string[] {
  const out: string[] = [];
  for (const p of step.replaces) {
    const dir = dirname(join(base, p)), name = basename(p);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.startsWith('#' + name + '.') && f.endsWith('#')) out.push(relative(base, join(dir, f)));
  }
  return out;
}
