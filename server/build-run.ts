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
import { BASE, NAMES, systemsOf, type BuildPlan, type Systems, type System } from '../src/lib/build/plan';
import { freeRepeat, hint, quarantineName, resumeAt } from '../src/lib/build/retry';
import { PROFILES, qqScript, type Profile } from '../src/lib/build/qq';
import type { StageId } from '../src/lib/build/plan';
import { planSystem, type Step } from '../src/lib/build/steps';
import { carbGroup, hmrTopology, ionCounts, mergeGro, moleculetype, nearestWalker, netCharge, pullx, renameWater, topologyText, walkerFrames, waters } from '../src/lib/build/text';
import type { Job, JobStatus, Jobs } from './jobs';

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
  /** Its try: 1, or more when it is a retry (R6). */
  attempt?: number;
  /** The build that retried it, when one did. */
  retried?: string;
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
  /** What earlier steps found (the net charge, the ions, the walkers' frames), for a build that continues (R6). */
  values?: Record<string, string>;
  /** Folders moved aside, never deleted (R6): a walker's that failed, with the walker it was rebuilt from. */
  moved?: { from: string; to: string; walker?: number; donor?: number }[];
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
  /** The qq profile each stage's script is written for (R7a); a stage not named takes MetaCentrum 2025's. */
  profiles?: () => Partial<Record<StageId, Profile>>;
  /** qq, and the queue, when the settings say gmx-cypher submits the cluster stages' scripts (T206); null: it doesn't. */
  submit?: () => { qq: string; queue: string } | null;
}

/** The shipped python scripts (R5b), by the name the planner gives them. */
export const PYTHON_DIR = new URL('./python/', import.meta.url).pathname;

const now = () => new Date().toISOString();
const writeJson = (file: string, v: unknown) => { const part = file + '.' + process.pid + '.part'; writeFileSync(part, JSON.stringify(v, null, 2) + '\n'); renameSync(part, file); };
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

export function sha256File(path: string): Promise<string> {
  return new Promise((done, fail) => { const h = createHash('sha256'); createReadStream(path).on('data', d => h.update(d)).on('error', fail).on('end', () => done(h.digest('hex'))); });
}

const CLUSTER = ['awh', 'pull', 'walkers'];

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

  /**
   * Retries a failed or cancelled system (R6): `resume` continues its folder at the first step not done; `rebuild`
   * first moves its folder to failed/<sequence>_<stamp>/ with FAILED.txt (never deleted), then builds it anew.
   */
  retry(runId: string, dir: string, how: 'resume' | 'rebuild'): { run: BuildRun; done: Promise<BuildRun> } {
    const old = this.runs.get(runId), s = old?.systems.find(x => x.dir === dir);
    if (!old || !s) throw new Error('no system ' + dir + ' in build ' + runId);
    if (s.status !== 'failed' && s.status !== 'cancelled') throw new Error('only a failed or cancelled system is retried: ' + dir + ' is ' + s.status);
    if (this.current) throw new Error('a build is running: one at a time');
    const root = join(old.base, dir), rec = readRecord(root);
    if (!rec) throw new Error(dir + ' has no build.json of gmx-cypher\'s: nothing to retry from');
    if (how === 'rebuild') {
      if (!rec.folders.includes(dir)) throw new Error(dir + ' was not created by a gmx-cypher build: it is not moved');
      const to = join(dirname(root), 'failed', quarantineName(rec.system.sequence, new Date()));
      mkdirSync(dirname(to), { recursive: true });
      renameSync(root, to);
      writeFileSync(join(to, 'FAILED.txt'), (s.error ?? s.status) + '\n\nbuild ' + runId + ', ' + (s.ended ?? '') + '; moved here by gmx-cypher to build ' + dir + ' anew\n', { flag: 'wx' });
    }
    const systems: Systems = { methods: [rec.system.method], saccharides: [rec.system.saccharide], sequences: [rec.system.sequence], repeats: 0 };
    const started = this.start(rec.plan, systems, { base: old.base, ifExists: 'continue', onFailure: 'next' });
    started.run.systems[0].attempt = (s.attempt ?? 1) + 1;
    if (how === 'rebuild') started.run.systems[0].notes.push('the failed folder was moved to ' + relative(old.base, join(dirname(root), 'failed')) + '/');
    s.retried = started.run.id;
    this.save(old);
    return started;
  }

  private async system(run: BuildRun, plan: BuildPlan, asked: System, s: SystemRun) {
    const base = run.base, rel = (abs: string) => relative(base, abs);
    let sys = asked, root = join(base, sys.dir), prev: BuildRecord | null = null;
    s.status = 'building'; s.started = now(); this.save(run);
    const leave = (why: string) => { s.status = 'skipped'; s.ended = now(); s.notes.push(why); this.save(run); };
    // A folder that exists (R6): continued if a gmx-cypher build made it, else left as it is; skipped; or built beside it as a repeat.
    if (existsSync(root)) {
      if (run.ifExists === 'skip') return leave(sys.dir + ' exists: it is left as it is');
      if (run.ifExists === 'repeat') {
        const m = freeRepeat(sys.method, x => existsSync(join(base, BASE.solutions, x, sys.saccharide, sys.sequence)));
        sys = { ...sys, method: m, dir: [BASE.solutions, m, sys.saccharide, sys.sequence].join('/') };
        root = join(base, sys.dir);
        s.notes.push(asked.dir + ' exists: built as the repeat ' + m + ' beside it');
        s.dir = sys.dir; s.method = m;
      } else {
        prev = readRecord(root);
        if (!prev) return leave(sys.dir + ' exists, and no gmx-cypher build made it (no build.json of its own): it is left as it is · choose repeat to build beside it');
      }
    }
    const record: BuildRecord = prev
      ? { ...prev, runner: this.o.version, build: run.id, plan, started: s.started!, ended: undefined, status: 'building', notes: s.notes, submit: s.submit }
      : {
        format: BUILD_FORMAT, version: BUILD_VERSION, runner: this.o.version, build: run.id, system: { dir: sys.dir, method: sys.method, saccharide: sys.saccharide, sequence: sys.sequence },
        plan, started: s.started!, status: 'building', steps: [], files: {}, backups: [], folders: [], notes: s.notes, submit: s.submit,
      };
    const recordFile = join(root, 'build.json');
    if (!prev) {
      const made = (dir: string) => {
        const missing: string[] = [];
        for (let d = dir; !existsSync(d) && inside(d, base); d = dirname(d)) missing.unshift(d);
        for (const d of missing) { mkdirSync(d); record.folders.push(rel(d)); }
      };
      try { made(dirname(root)); mkdirSync(root); record.folders.push(sys.dir); }
      catch (e) { s.status = 'failed'; s.error = 'could not create ' + sys.dir + ': ' + (e as Error).message; s.ended = now(); this.save(run); return; }
      writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    }
    const steps = planSystem(plan, sys, { base, profiles: this.o.profiles?.() ?? {} });
    s.steps = steps.length;
    const values: Record<string, string> = { ...(prev?.values ?? {}) };
    record.values = values;
    // Continue: from the first step the record does not have as done, or whose output is gone.
    const from = prev ? resumeAt(steps, prev.steps, p => p in prev.files && !existsSync(resolve(base, p))) : 0;
    if (prev) { record.steps = [...prev.steps]; s.notes.push(from >= steps.length ? 'every step was done before' : 'continued at step ' + (from + 1) + ' of ' + steps.length + ': ' + steps[from].label); }
    let cluster = steps.slice(0, from).some(x => x.label === 'qq script' && CLUSTER.includes(x.stage));
    const failedWalkers = new Set<number>();
    try {
      for (let i = from; i < steps.length; i++) {
        const step = steps[i];
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
        // A walker that failed keeps the others going (the notebook's cell does); once they are all prepared, each failed
        // one is rebuilt from the nearest working walker, once (T219).
        const wk = /^walker (\d+): /.exec(step.label);
        if (wk && failedWalkers.has(Number(wk[1]))) { s.step = i + 1; continue; }
        if (step.stage === 'walkers' && step.label === 'qq script' && failedWalkers.size) await this.rebuildWalkers(run, plan, sys, steps, failedWalkers, values, record, s);
        // Ions for prosECCo75's charges, from grompp's net charge and the waters in the topology (neutralizing_counts).
        if (step.resolves?.includes('np')) {
          const ions = ionCounts(Number(values.net ?? 0), waters(readFileSync(join(root, sys.sequence + '.top'), 'utf8')), plan.science);
          values.np = String(ions.positive); values.nn = String(ions.negative);
          s.notes.push('net charge ' + Number(values.net ?? 0).toFixed(2) + ' e: ' + ions.positive + ' ' + plan.science.positive + ' and ' + ions.negative + ' ' + plan.science.negative);
        }
        if (step.resolves?.includes('tmp')) values.tmp = mkdtempSync(join(tmpdir(), 'gmx-cypher-charge-'));
        s.step = i; s.label = step.label; s.stage = step.stage; this.save(run);
        let r: { net?: number };
        try { r = await this.step(run, plan, sys, step, i, values, record); }
        catch (e) {
          if (!wk || !(e instanceof Stop) || e.status !== 'failed') throw e;
          failedWalkers.add(Number(wk[1]));
          s.notes.push('walker ' + wk[1] + ' failed: ' + e.message.split('\n').slice(0, 2).join(' '));
          s.step = i + 1;
          continue;
        }
        // awh, the pull and the walkers run on the cluster; min, nvt and npt get a script too, but run here.
        if (step.label === 'qq script' && CLUSTER.includes(step.stage)) cluster = true;
        if (r.net != null) values.net = String(r.net);
        s.step = i + 1;
        writeJson(recordFile, record);
      }
      record.status = s.status = cluster ? 'cluster' : 'built';
    } catch (e) {
      const stop = e instanceof Stop ? e : new Stop('failed', (e as Error).message);
      record.status = s.status = stop.status;
      if (stop.status === 'cluster') s.notes.push(stop.message);
      else {
        s.error = stop.message;
        const h = hint(stop.message);
        if (h) s.notes.push('hint: ' + h);
      }
    }
    s.job = undefined;
    record.ended = s.ended = now();
    writeJson(recordFile, record);
    this.save(run);
  }

  /** Each failed walker's folder moved to 9.multiwalker/failed/<n>_<stamp>/, and the walker prepared again from the start of the nearest working one. */
  private async rebuildWalkers(run: BuildRun, plan: BuildPlan, sys: System, steps: Step[], failed: Set<number>, values: Record<string, string>, record: BuildRecord, s: SystemRun) {
    const base = run.base, root = join(base, sys.dir), rel = (abs: string) => relative(base, abs), targets = plan.science.walkers;
    const folder = (n: number | string) => join(root, NAMES.walkers, String(n));
    const working = targets.map((_, k) => k + 1).filter(n => !failed.has(n) && existsSync(join(folder(n), NAMES.walkers + '.tpr')));
    for (const n of [...failed].sort((a, b) => a - b)) {
      const donor = nearestWalker(n, working, targets);
      if (donor == null) throw new Stop('failed', 'WALKERS · walker ' + n + ': no working walker to rebuild it from');
      const dir = folder(n), to = join(root, NAMES.walkers, 'failed', quarantineName(String(n), new Date()));
      if (existsSync(dir)) {
        if (!record.folders.includes(rel(dir))) throw new Stop('failed', 'WALKERS · walker ' + n + ': ' + rel(dir) + ' is not this build\'s folder: it is left as it is');
        if (!existsSync(dirname(to))) { mkdirSync(dirname(to)); record.folders.push(rel(dirname(to))); }
        renameSync(dir, to);
        // The record follows the files it moved; nothing is deleted.
        for (const k of Object.keys(record.files)) if (k.startsWith(rel(dir) + '/')) { record.files[rel(to) + k.slice(rel(dir).length)] = record.files[k]; delete record.files[k]; }
        (record.moved ??= []).push({ from: rel(dir), to: rel(to), walker: n, donor });
      } else record.folders.push(rel(dir));
      mkdirSync(dir);
      copyFileSync(join(folder(donor), 'start.gro'), join(dir, 'start.gro'), constants.COPYFILE_EXCL);
      record.files[rel(join(dir, 'start.gro'))] = await fileRecord(join(dir, 'start.gro'), -1);
      const grompp = steps.findIndex(x => x.label === 'walker ' + n + ': grompp');
      try { await this.step(run, plan, sys, steps[grompp], grompp, values, record); }
      catch (e) { throw new Stop('failed', 'walker ' + n + ', rebuilt from walker ' + donor + '\'s start: ' + (e as Error).message); }
      s.notes.push('walker ' + n + ' (' + targets[n - 1] + ' nm) rebuilt once from walker ' + donor + '\'s start (' + targets[donor - 1] + ' nm); its failed folder is ' + rel(to));
    }
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
    // Its folder and its outputs' folders (visualization/, 8.pull/), inside the system's folder, created by the build.
    for (const dir of [cwd, ...step.writes.filter(p => !p.startsWith('scripts/')).map(p => dirname(abs(p)))]) {
      if (existsSync(dir)) continue;
      if (!inside(dir, root)) throw stop('failed', 'no folder ' + relative(base, dir));
      const missing: string[] = [];
      for (let d = dir; !existsSync(d); d = dirname(d)) missing.unshift(d);
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
        if (r.status !== 'done' && (plan.science.strict || step.program === 'python' || r.code == null)) {
          // python's own last line says why (a traceback's), gmx's error is its fatal block or its exit.
          const last = step.program === 'python' ? r.log.trim().split('\n').pop() : undefined;
          throw stop('failed', (last ? last + ' (exit ' + r.code + ')' : r.error) ?? 'exit ' + r.code);
        }
        if (step.label === 'grompp before the salt') net = netCharge(r.log);
        if (step.tile === 'charge') record.notes.push('net charge after npt: ' + netCharge(r.log).toFixed(2) + ' e');
        break;
      }
      case 'copy': {
        const from = abs(argv[0]), to = join(cwd, argv[1]);
        if (step.label === 'qq script') {
          // R7a: the script in scripts/, created exclusively; one that exists is kept and used, as the notebook does.
          const s = qqScript(step.stage, sys, this.o.profiles?.()[step.stage] ?? PROFILES[0], plan.science.walkers.length)!;
          mkdirSync(dirname(from), { recursive: true });
          try { writeFileSync(from, s.text, { flag: 'wx', mode: 0o755 }); record.files[argv[0]] = await fileRecord(from, i); }
          catch { record.notes.push(argv[0] + ' exists: kept, and used'); }
          if (CLUSTER.includes(step.stage)) record.submit.push(s.submit);
        }
        if (!existsSync(from)) throw stop('failed', 'no ' + argv[0]);
        copyFileSync(from, to, constants.COPYFILE_EXCL);
        // T206: with the setting on, qq submit runs here, in the step's folder, with those fixed arguments; off, the line is printed.
        const sub = step.label === 'qq script' && CLUSTER.includes(step.stage) ? this.o.submit?.() : null;
        if (sub) {
          const job = this.o.exec({ title: sys.dir + ' · qq submit', file: sub.qq, args: ['submit', '-q', sub.queue, argv[1]], cwd, env: {}, meta: { build: run.id, system: sys.dir, step: i } });
          const r = await job.done, said = /Job '([^']+)' submitted successfully/.exec(r.log);
          record.notes.push(said ? step.stage + ': qq job ' + said[1] + ' submitted' : step.stage + ': qq submit did not submit it (' + (r.log.trim().split('\n').pop() ?? 'exit ' + r.code) + '): submit it yourself');
        }
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

/** Steps run as jobs of the build's own list (T217): each its own process group, its log kept, cancel as for jobs. */
export function jobsExec(jobs: Jobs): { exec: Exec; cancel: (id: string) => void } {
  return {
    exec: spec => {
      const j = jobs.start({ kind: 'build', title: spec.title, file: spec.file, args: spec.args, cwd: spec.cwd, env: spec.env, meta: spec.meta, ...(spec.stdin != null ? { stdin: spec.stdin } : {}) });
      const done = new Promise<{ status: JobStatus; code: number | null; log: string; error?: string }>(resolve => {
        const end = (x: Job) => {
          if (x.id !== j.id || !x.ended) return;
          jobs.off('job', end);
          resolve({ status: x.status, code: x.exit?.code ?? null, log: jobs.logText(x.id), ...(x.error ? { error: x.error } : {}) });
        };
        jobs.on('job', end);
        const now = jobs.get(j.id);
        if (now) end(now);
      });
      return { id: j.id, done };
    },
    cancel: id => jobs.cancel(id),
  };
}

/** A system's record, when a gmx-cypher build of this version or older wrote it; null otherwise. */
export function readRecord(root: string): BuildRecord | null {
  try {
    const r = JSON.parse(readFileSync(join(root, 'build.json'), 'utf8')) as BuildRecord;
    return r.format === BUILD_FORMAT && r.version >= 1 && r.version <= BUILD_VERSION ? r : null;
  } catch { return null; }
}
