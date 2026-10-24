// Cluster jobs (R10a): the only place gmx-cypher starts anything but gmx. A fixed list of commands — `qq jobs -e`,
// `qq jobs -a` and `gmx-eta -a` — run on this machine (question 1: qq needs your Kerberos ticket, so it runs where
// you ran kinit), without a shell, one read at a time, each with a timeout. Nothing from the page reaches their
// arguments. Watch only (question 3): nothing here kills or submits a job. The last read lives in memory, and so do
// the jobs seen to end between two reads (R15), each with the input folder `qq jobs -e` printed for it.

import { isAbsolute, resolve } from 'node:path';
import { endedBetween, parseGmxEta, parseQqJobs, type Ended, type EtaLine, type QqJob, type QqTable } from '../src/lib/cluster';
import { sha256File } from './files';
import { capture, findOnPath } from './gmx';

/**
 * The commands, fixed here: what "show finished" switches is which of qq's two lists runs. The running list with -e,
 * for each job's input folder (R15); -a as before (its -e is untried: no sample).
 */
const QQ_JOBS = ['jobs', '-e'], QQ_ALL = ['jobs', '-a'], GMX_ETA = ['-a'];
/** qq draws its table to the terminal's width, and cuts names to fit: a wide one keeps more of each row (T134). */
const QQ_ENV = { COLUMNS: '250', NO_COLOR: '1' };
const QQ_TIMEOUT = 30_000, ETA_TIMEOUT = 90_000;

type Part<T> = ({ ok: true } & T) | { ok: false; error: string };
export interface ClusterRead {
  /** When the tools ran, and whether finished jobs were asked for. */
  at: string; finished: boolean;
  qq: Part<{ path: string; args: string[]; table: QqTable }>;
  /** gmx-eta is "unversioned" (its manual): its path and SHA-256 are kept with what it said. */
  eta: Part<{ path: string; sha256: string; lines: EtaLine[]; other: string[] }>;
  /** The jobs seen to end since gmx-cypher started (R15), newest first, each with when it was seen. */
  ended: (Ended & { at: string })[];
}

/** A tool by the name or path in the config, else its usual name on PATH; null when it can't be found. */
function locate(configured: string | null, name: string): string | null {
  const c = configured || name;
  return c.includes('/') ? (isAbsolute(c) ? c : resolve(c)) : findOnPath(c);
}

/** What went wrong, in words: never found, too slow, or its own message (with a hint when it reads like an expired ticket). */
function failure(label: string, r: { code: number | null; stdout: string; stderr: string; timedOut?: boolean }, timeoutMs: number): string {
  if (r.timedOut) return label + ' did not answer within ' + timeoutMs / 1000 + ' s; it was stopped';
  const said = (r.stderr.trim() || r.stdout.trim()).split('\n').slice(0, 6).join('\n');
  const ticket = /kerberos|krb5|ticket|kinit|gss|credential/i.test(said) ? '\nyour Kerberos ticket may have expired: run kinit in a terminal, then refresh' : '';
  return label + ' failed (exit ' + r.code + ')' + (said ? ': ' + said : '') + ticket;
}

export class Cluster {
  private reading: { finished: boolean; read: Promise<ClusterRead> } | null = null;
  last: ClusterRead | null = null;
  /** The last list read, each job's input folder as -e printed it, and the jobs seen to end (R15). */
  private before: QqJob[] | null = null;
  private dirs = new Map<string, string>();
  private ended: (Ended & { at: string })[] = [];
  private tools: () => { qq: string | null; gmxEta: string | null };
  constructor(tools: () => { qq: string | null; gmxEta: string | null }) { this.tools = tools; }

  /**
   * The jobs now: the last read if it is younger than `maxAge` and of the same list, else a new one. A read asked for
   * while one runs waits for that one (they never overlap).
   */
  read(finished: boolean, maxAge = 50_000): Promise<ClusterRead> {
    // A read of the other list (show finished) is waited for first: one command at a time.
    if (this.reading) return this.reading.finished === finished ? this.reading.read : this.reading.read.catch(() => null).then(() => this.read(finished, maxAge));
    if (this.last && this.last.finished === finished && Date.now() - Date.parse(this.last.at) < maxAge) return Promise.resolve(this.last);
    const read = this.run(finished).then(r => (this.last = this.track(r))).finally(() => { this.reading = null; });
    this.reading = { finished, read };
    return read;
  }

  /** A read against the one before (R15): the jobs that ended between them are kept; "finished" once a list says so. */
  private track(r: ClusterRead): ClusterRead {
    if (r.qq.ok) {
      const jobs = r.qq.table.jobs;
      for (const j of jobs) if (j.inputDir) this.dirs.set(j.key, j.inputDir);
      if (this.before) for (const e of endedBetween(this.before, jobs, this.dirs)) if (!this.ended.some(x => x.key === e.key)) this.ended.unshift({ ...e, at: r.at });
      const done = new Set(jobs.filter(j => j.state.letter === 'F').map(j => j.key));
      this.ended = this.ended.map(e => (done.has(e.key) ? { ...e, word: 'finished' } : e));
      this.before = jobs;
    }
    return { ...r, ended: this.ended };
  }

  private async run(finished: boolean): Promise<ClusterRead> {
    const at = new Date().toISOString(), { qq: qqName, gmxEta: etaName } = this.tools();
    const qqPath = locate(qqName, 'qq'), etaPath = locate(etaName, 'gmx-eta');
    let qq: ClusterRead['qq'], eta: ClusterRead['eta'];
    // One after the other: the cluster is shared, and these are slow.
    if (!qqPath) qq = { ok: false, error: (qqName || 'qq') + ' is not on PATH: start gmx-cypher from a shell where qq jobs works (after kinit), or set its path in settings' };
    else {
      const args = finished ? QQ_ALL : QQ_JOBS;
      try {
        const r = await capture(qqPath, args, { timeoutMs: QQ_TIMEOUT, env: QQ_ENV, group: true });
        qq = r.code === 0 && !r.timedOut ? { ok: true, path: qqPath, args, table: parseQqJobs(r.stdout) } : { ok: false, error: failure('qq ' + args.join(' '), r, QQ_TIMEOUT) };
      } catch (e) { qq = { ok: false, error: 'qq could not be started: ' + (e as Error).message }; }
    }
    if (!etaPath) eta = { ok: false, error: (etaName || 'gmx-eta') + ' is not on PATH: the ETA column shows — (set its path in settings)' };
    else {
      try {
        const r = await capture(etaPath, GMX_ETA, { timeoutMs: ETA_TIMEOUT, group: true });
        eta = r.code === 0 && !r.timedOut ? { ok: true, path: etaPath, sha256: await sha256File(etaPath), ...parseGmxEta(r.stdout) } : { ok: false, error: failure('gmx-eta -a', r, ETA_TIMEOUT) };
      } catch (e) { eta = { ok: false, error: 'gmx-eta could not be started: ' + (e as Error).message }; }
    }
    return { at, finished, qq, eta, ended: [] };
  }
}
