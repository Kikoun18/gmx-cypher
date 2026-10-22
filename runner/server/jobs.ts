// Jobs (T6, T7): each runs without a shell in its own process group, so cancel stops everything it
// started. Its life is an append-only event log, <home>/jobs/<id>.ndjson, replayed at start: a reload
// or a restart loses nothing, and a job a crash left behind shows as interrupted. A job's log stays in that file (R12a):
// what is held is its size, and while it runs its last 64 kB, for its progress; the log is read when asked for.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
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
  /** Its log's length, in characters; the log itself is read from its file (R12a). */
  logSize: number;
  /** Found running at start, its end never seen: it runs on, and nothing here follows it (R2a). */
  unfollowed?: boolean;
}

type Event =
  | { t: 'created'; at: string; spec: JobSpec }
  | { t: 'started'; at: string; pid: number }
  | { t: 'out'; s: string }
  | { t: 'cancel'; at: string }
  | { t: 'ended'; at: string; status: JobStatus; code: number | null; signal: string | null; error?: string };

/** The end of a log kept while its job runs, and the part of it sent unless all is asked for (R12a). */
export const LOG_TAIL = 65536;

/** A job's state from its events, in order, without its log: its size, and its tail (the progress is read from it). */
export function foldJob(id: string, events: Event[]): { job: Job; tail: string } | null {
  let j: Job | null = null, tail = '';
  for (const e of events) {
    if (e.t === 'created') j = { ...e.spec, id, status: 'running', created: e.at, progress: {}, logSize: 0 };
    else if (!j) return null;
    else if (e.t === 'started') { j.started = e.at; j.pid = e.pid; }
    else if (e.t === 'out') { j.logSize += e.s.length; tail = (tail + e.s).slice(-LOG_TAIL); }
    else if (e.t === 'ended') {
      j.status = e.status; j.ended = e.at; j.exit = { code: e.code, signal: e.signal };
      if (e.error) j.error = e.error;
    }
  }
  if (!j) return null;
  j.progress = parseProgress(tail);
  return { job: j, tail };
}
const OUT = '{"t":"out","s":"';
/** A JSON string's length once decoded, without decoding it: each escape is one character (\\uXXXX one UTF-16 unit). */
function decodedLength(json: string, from: number, to: number): number {
  let n = to - from;
  for (let i = json.indexOf('\\', from); i >= 0 && i < to; ) { const u = json.charCodeAt(i + 1) === 117; n -= u ? 5 : 1; i = json.indexOf('\\', i + (u ? 6 : 2)); }
  return n;
}
/**
 * A job from its file's text, as foldJob gives it, at start (R12a): its output lines, as this file writes them, are only
 * measured, and only the last of them, enough for the tail, decoded.
 */
export function foldFile(id: string, text: string): { job: Job; tail: string } | null {
  const lines = text.split('\n'), events: Event[] = [], outs: number[] = [];
  let size = 0;
  lines.forEach((l, i) => {
    if (l.startsWith(OUT) && l.endsWith('"}')) { size += decodedLength(l, OUT.length, l.length - 2); outs.push(i); }
    else if (l) try { events.push(JSON.parse(l) as Event); } catch { /* a line cut short by a crash */ }
  });
  const f = foldJob(id, events);
  if (!f) return null;
  let tail = '';
  for (let k = outs.length - 1; k >= 0 && tail.length < LOG_TAIL; k--) tail = (JSON.parse(lines[outs[k]]) as { s: string }).s + tail;
  f.tail = tail.slice(-LOG_TAIL);
  Object.assign(f.job, { logSize: size, progress: parseProgress(f.tail) });
  return f;
}

/** A job's events from its file; none when the file is gone. */
function readEvents(file: string): Event[] {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return []; }
  return text.split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as Event]; } catch { return []; } });
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

/** A file to a new name that must not exist: linked there (EEXIST: refused), then its old name removed. */
function move(from: string, to: string, shown: string) {
  try { linkSync(from, to); } catch (e) { throw new Error((e as NodeJS.ErrnoException).code === 'EEXIST' ? shown + ' exists: nothing was moved' : (e as Error).message); }
  unlinkSync(from);
}

export class Jobs extends EventEmitter {
  private readonly dir: string;
  private readonly jobs = new Map<string, Job>();
  private readonly procs = new Map<string, ChildProcess>();
  private readonly cancelling = new Set<string>();
  /** The last 64 kB of each running job's log. */
  private readonly tails = new Map<string, string>();

  constructor(dir: string) {
    super();
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir).filter(n => n.endsWith('.ndjson')).sort()) {
      let text = '';
      try { text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
      const id = f.slice(0, -'.ndjson'.length), folded = foldFile(id, text);
      if (!folded) continue;
      const j = folded.job;
      this.jobs.set(id, j);
      // Started and never ended: the runner stopped without seeing the end. A process still running this job's
      // command runs on, not followed (R2a): gmx-cypher never invents its end. Otherwise the job was interrupted.
      if (j.ended) continue;
      this.tails.set(id, folded.tail);
      if (j.pid && sameProgram(commandLine(j.pid), j)) j.unfollowed = true;
      else this.end(id, 'interrupted', null, null, 'gmx-cypher stopped while this job ran' + (j.pid ? ' (pid ' + j.pid + ')' : ''));
    }
  }

  list(): Job[] { return [...this.jobs.values()].sort((a, b) => b.created.localeCompare(a.created)); }
  get(id: string): Job | undefined { return this.jobs.get(id); }
  running(): Job[] { return this.list().filter(j => j.status === 'running'); }

  /**
   * Archive (R12c): a finished job's file moves into archive/, as it is, and the job leaves the list; nothing is deleted.
   * The move is a link then the old name's removal, so a file already there is never overwritten: a collision is refused.
   */
  archive(id: string) {
    const j = this.jobs.get(id);
    if (!j) throw new Error('no job ' + id);
    if (!j.ended || j.unfollowed) throw new Error('a running job is not archived: ' + (j.unfollowed ? 'it runs on, not followed' : 'cancel it, or wait for its end'));
    mkdirSync(join(this.dir, 'archive'), { recursive: true });
    move(join(this.dir, id + '.ndjson'), join(this.dir, 'archive', id + '.ndjson'), 'archive/' + id + '.ndjson');
    this.jobs.delete(id);
    this.emit('gone', id);
  }
  /** Unarchive (R12c): its file back from archive/, never over one that is there, and the job in the list again. */
  unarchive(id: string) {
    const from = join(this.dir, 'archive', id + '.ndjson');
    if (!/^[\w-]+$/.test(id) || !existsSync(from)) throw new Error('no archived job ' + id);
    move(from, join(this.dir, id + '.ndjson'), id + '.ndjson');
    const f = foldFile(id, readFileSync(join(this.dir, id + '.ndjson'), 'utf8'));
    if (f) { this.jobs.set(id, f.job); this.changed(f.job); }
  }
  /** The archived jobs, read when asked for (never at start), newest first. */
  archived(): Job[] {
    const dir = join(this.dir, 'archive');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(n => n.endsWith('.ndjson')).flatMap(n => { const f = foldFile(n.slice(0, -7), readFileSync(join(dir, n), 'utf8')); return f ? [f.job] : []; })
      .sort((a, b) => b.created.localeCompare(a.created));
  }

  /** A job's whole log, read from its file. */
  logText(id: string): string { return readEvents(join(this.dir, id + '.ndjson')).map(e => (e.t === 'out' ? e.s : '')).join(''); }
  /** A part of a job's log (R12a): from `from` to `to` (characters, clamped), by default its last 64 kB. */
  logRange(id: string, from?: number, to?: number): { text: string; from: number; to: number; size: number } {
    const text = this.logText(id), size = text.length, b = Math.min(size, Math.max(0, to ?? size)), a = Math.min(b, Math.max(0, from ?? size - LOG_TAIL));
    return { text: text.slice(a, b), from: a, to: b, size };
  }

  private append(id: string, e: Event) { appendFileSync(join(this.dir, id + '.ndjson'), JSON.stringify(e) + '\n'); }
  private changed(j: Job) { this.emit('job', j); }

  private end(id: string, status: JobStatus, code: number | null, signal: string | null, error?: string) {
    const j = this.jobs.get(id)!;
    if (j.ended) return;
    const e: Event = { t: 'ended', at: new Date().toISOString(), status, code, signal, ...(error ? { error } : {}) };
    this.append(id, e);
    Object.assign(j, { status, ended: e.at, exit: { code, signal }, progress: parseProgress(this.tails.get(id) ?? '') }, error ? { error } : {});
    this.tails.delete(id);
    this.procs.delete(id);
    this.cancelling.delete(id);
    this.changed(j);
  }

  start(spec: JobSpec): Job {
    const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const created: Event = { t: 'created', at: new Date().toISOString(), spec };
    this.append(id, created);
    const j = foldJob(id, [created])!.job;
    this.jobs.set(id, j);
    this.tails.set(id, '');
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
      const tail = (this.tails.get(id) + s).slice(-LOG_TAIL);
      this.tails.set(id, tail);
      j.logSize += s.length;
      j.progress = parseProgress(tail);
      // Where the chunk ends in the log, so a page that read the log meanwhile adds only what it lacks (review).
      this.emit('out', id, s, j.logSize);
      this.changed(j);
    };
    p.stdout!.on('data', out);
    p.stderr!.on('data', out);
    p.on('error', e => this.end(id, 'failed', null, null, spec.file + ': ' + e.message));
    p.on('close', (code, signal) => {
      const status: JobStatus = this.cancelling.has(id) ? 'cancelled' : code === 0 ? 'done' : 'failed';
      this.end(id, status, code, signal, status === 'failed' ? gmxError(this.logText(id)) || (signal ? 'stopped by ' + signal : 'exit ' + code) : undefined);
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
