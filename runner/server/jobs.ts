// Jobs (T6, T7): each runs without a shell in its own process group, so cancel stops everything it
// started. Its life is an append-only event log, <home>/jobs/<id>.ndjson, replayed at start: a reload
// or a restart loses nothing, and a job a crash left behind shows as interrupted.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gmxError, parseProgress, type Progress } from '../src/lib/progress';

export interface JobSpec { kind: string; title: string; file: string; args: string[]; cwd: string; env?: Record<string, string>; meta?: Record<string, unknown>; /** Answers the program reads from stdin (T99). */ stdin?: string }
export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';
export interface Job extends JobSpec {
  id: string;
  status: JobStatus;
  created: string;
  started?: string;
  ended?: string;
  pid?: number;
  exit?: { code: number | null; signal: string | null };
  progress: Progress;
  error?: string;
  log: string;
  /** Found running at start, its end never seen: it runs on, and nothing here follows it (R2a). */
  unfollowed?: boolean;
}

type Event =
  | { t: 'created'; at: string; spec: JobSpec }
  | { t: 'started'; at: string; pid: number }
  | { t: 'out'; s: string }
  | { t: 'cancel'; at: string }
  | { t: 'ended'; at: string; status: JobStatus; code: number | null; signal: string | null; error?: string };

/** A job's state from its events, in order. */
function fold(id: string, events: Event[]): Job | null {
  let j: Job | null = null;
  for (const e of events) {
    if (e.t === 'created') j = { ...e.spec, id, status: 'running', created: e.at, progress: {}, log: '' };
    else if (!j) return null;
    else if (e.t === 'started') { j.started = e.at; j.pid = e.pid; }
    else if (e.t === 'out') j.log += e.s;
    else if (e.t === 'ended') {
      j.status = e.status; j.ended = e.at; j.exit = { code: e.code, signal: e.signal };
      if (e.error) j.error = e.error;
    }
  }
  if (j) j.progress = parseProgress(j.log);
  return j;
}

/**
 * Whether a process's command line is this job's: the job's program (or a script its interpreter runs, #!) followed
 * by exactly the job's arguments. An empty command line (a process gone, or a zombie) is never the job (R2a).
 */
export function sameProgram(cmdline: string[], spec: { file: string; args: string[] }): boolean {
  const at = cmdline.length - spec.args.length;
  if (at < 1 || cmdline.slice(at).some((a, i) => a !== spec.args[i])) return false;
  return cmdline.slice(0, at).some(a => a === spec.file || basename(a) === basename(spec.file));
}

/** A live process's command line: /proc on Linux; ps elsewhere (split at spaces, so a path with one never matches). */
function commandLine(pid: number): string[] {
  try {
    if (process.platform === 'linux') return readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').filter((a, i, all) => a || i < all.length - 1);
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  } catch { return []; }
}

const SIGKILL_AFTER_MS = 5000;

export class Jobs extends EventEmitter {
  private readonly dir: string;
  private readonly jobs = new Map<string, Job>();
  private readonly procs = new Map<string, ChildProcess>();
  private readonly cancelling = new Set<string>();

  constructor(dir: string) {
    super();
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter(n => n.endsWith('.ndjson')).sort()) {
      const id = f.slice(0, -'.ndjson'.length);
      const events = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as Event]; } catch { return []; } });
      const j = fold(id, events);
      if (!j) continue;
      this.jobs.set(id, j);
      // Started and never ended: the runner stopped without seeing the end. A process still running this job's
      // command runs on, not followed (R2a): gmx-cypher never invents its end. Otherwise the job was interrupted.
      if (j.ended) continue;
      if (j.pid && sameProgram(commandLine(j.pid), j)) j.unfollowed = true;
      else this.end(id, 'interrupted', null, null, 'gmx-cypher stopped while this job ran' + (j.pid ? ' (pid ' + j.pid + ')' : ''));
    }
  }

  list(): Job[] { return [...this.jobs.values()].sort((a, b) => b.created.localeCompare(a.created)); }
  get(id: string): Job | undefined { return this.jobs.get(id); }
  running(): Job[] { return this.list().filter(j => j.status === 'running'); }

  private append(id: string, e: Event) { appendFileSync(join(this.dir, id + '.ndjson'), JSON.stringify(e) + '\n'); }
  private changed(j: Job) { this.emit('job', j); }

  private end(id: string, status: JobStatus, code: number | null, signal: string | null, error?: string) {
    const j = this.jobs.get(id)!;
    if (j.ended) return;
    const e: Event = { t: 'ended', at: new Date().toISOString(), status, code, signal, ...(error ? { error } : {}) };
    this.append(id, e);
    Object.assign(j, { status, ended: e.at, exit: { code, signal }, progress: parseProgress(j.log) }, error ? { error } : {});
    this.procs.delete(id);
    this.cancelling.delete(id);
    this.changed(j);
  }

  start(spec: JobSpec): Job {
    const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const created: Event = { t: 'created', at: new Date().toISOString(), spec };
    this.append(id, created);
    const j = fold(id, [created])!;
    this.jobs.set(id, j);
    // An argument array and no shell: names, selections and paths are data. detached: its own process group.
    const p = spawn(spec.file, spec.args, { cwd: spec.cwd, env: { ...process.env, ...spec.env }, shell: false, detached: true, stdio: [spec.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    if (spec.stdin != null) { p.stdin!.on('error', () => { /* the program may end before it reads its answers */ }); p.stdin!.end(spec.stdin); }
    if (p.pid) {
      this.procs.set(id, p);
      const e: Event = { t: 'started', at: new Date().toISOString(), pid: p.pid };
      this.append(id, e);
      j.started = e.at; j.pid = p.pid;
    }
    const out = (d: Buffer) => {
      const s = d.toString('utf8');
      this.append(id, { t: 'out', s });
      j.log += s;
      j.progress = parseProgress(j.log);
      this.emit('out', id, s);
      this.changed(j);
    };
    p.stdout!.on('data', out);
    p.stderr!.on('data', out);
    p.on('error', e => this.end(id, 'failed', null, null, spec.file + ': ' + e.message));
    p.on('close', (code, signal) => {
      const status: JobStatus = this.cancelling.has(id) ? 'cancelled' : code === 0 ? 'done' : 'failed';
      this.end(id, status, code, signal, status === 'failed' ? gmxError(j.log) || (signal ? 'stopped by ' + signal : 'exit ' + code) : undefined);
    });
    this.changed(j);
    return j;
  }

  /** SIGTERM to the whole process group, SIGKILL if it is still there after 5 s. */
  cancel(id: string) {
    const p = this.procs.get(id);
    if (!p?.pid || this.cancelling.has(id)) return;
    this.cancelling.add(id);
    this.append(id, { t: 'cancel', at: new Date().toISOString() });
    const kill = (sig: NodeJS.Signals) => { try { process.kill(-p.pid!, sig); } catch { /* already gone */ } };
    kill('SIGTERM');
    setTimeout(() => this.procs.has(id) && kill('SIGKILL'), SIGKILL_AFTER_MS).unref();
  }

  /** On shutdown: cancel every running job and wait for each to end. */
  stopAll(): Promise<void> {
    const ids = [...this.procs.keys()];
    const left = new Set(ids);
    if (!ids.length) return Promise.resolve();
    return new Promise(done => {
      this.on('job', (j: Job) => { if (j.ended && left.delete(j.id) && !left.size) done(); });
      ids.forEach(id => this.cancel(id));
    });
  }
}
