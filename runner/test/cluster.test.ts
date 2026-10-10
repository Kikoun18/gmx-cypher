import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clock, duration, etaOf, finishText, mergeJobs, parseGmxEta, parseQqJobs, span, stateOf } from '../src/lib/cluster';

// Your real samples (R10b), with your user name, scratch paths and host names replaced by stand-ins of the same length.
const text = (p: string) => readFileSync(new URL('./fixtures/cluster-tools/' + p, import.meta.url), 'utf8');
const QQ = parseQqJobs(text('qq-jobs.txt')), ETA = parseGmxEta(text('gmx-eta-a.txt'));

describe('qq jobs, the table you sent (R10b)', () => {
  it('eleven jobs: nine running, two queued; its totals line says the same', () => {
    expect(QQ.jobs.map(j => j.state.letter).join('')).toBe('RRRRRRRRRQQ');
    expect(QQ.counts).toEqual({ R: 9, Q: 2, 'Σ': 11 });
  });

  it('a running job: runtime and walltime, node, %CPU and %Mem; its name cut by qq', () => {
    expect(QQ.jobs[0]).toEqual({
      id: '1374603', key: '1374603', state: { letter: 'R', word: 'running', tone: 'sky' }, user: 'user01', name: 'hmr+fast+sol4_pull_r', truncated: true, queue: 'gpu',
      cpus: 8, gpus: 1, nodes: 1, runtime: 48 * 60 + 36, walltime: 23 * 3600, waiting: null, node: 'node22', planned: null, cpu: 95, mem: 0,
      raw: 'R  1374603  user01 hmr+fast+sol4_pull_r…   gpu      8       1       1     00:48:36 / 23:00:00     node22        95     0',
    });
  });

  it('a queued job: one time (in the queue, as it reads) and the plan as qq prints it, not interpreted', () => {
    expect(QQ.jobs[9]).toMatchObject({ id: '1374612', state: { word: 'queued', tone: 'lilac' }, runtime: null, walltime: null, waiting: 4 * 3600 + 17 * 60 + 19, node: null, planned: 'node9 in 03:55', cpu: null, mem: null });
  });

  it('nothing is dropped: the lines that are not jobs are kept', () => {
    expect(QQ.other).toEqual(['CPUs  GPUs  Nodes', 'Requested   16    2      2', 'Jobs    R 9    Q 2    Σ 11          Allocated   72    9      9']);
  });

  it('your hues: queued purple, running blue, finished green; an unknown letter stays itself', () => {
    expect(['Q', 'R', 'F'].map(l => stateOf(l).tone)).toEqual(['lilac', 'sky', 'mint']);
    expect(stateOf('X')).toEqual({ letter: 'X', word: 'X', tone: 'stone' });
  });

  it('colour codes and other borders are taken away; an ID with a server suffix merges by its number', () => {
    const t = parseQqJobs('\x1b[1m│  R  12345.server  me name…  q  4  0  1  01:00:00 / 02:00:00  n1  50  1 │\x1b[0m');
    expect(t.jobs[0]).toMatchObject({ id: '12345.server', key: '12345', runtime: 3600, walltime: 7200, node: 'n1' });
  });
});

describe('gmx-eta -a, as you sent it (R10b)', () => {
  it('a line per job: the time left, or gmx-eta\'s reason for none', () => {
    expect(ETA.lines).toHaveLength(17);
    expect(ETA.lines[1]).toEqual({ id: '1374597', key: '1374597', script: 'hmr+fast+sol4_pull_k.sh', eta: 105, reason: null, message: 'Simulation will finish in 00:01:45.' });
    expect(ETA.lines[8]).toMatchObject({ key: '1374605', eta: null, reason: 'Job does not have a working directory.' });
  });

  it("a remote cat's error on the next line belongs to the job before it", () => {
    expect(ETA.lines[0].reason).toBe("Could not read remote file '/scratch.ssd/user01/job_1374596.server.cluster/main/hmr+fast+sol4_pull_l.err' on 'node7.cluster': cat: /scratch.ssd/user01/job_1374596.server.cluster/main/hmr+fast+sol4_pull_l.err: No such file or directory.");
    expect(ETA.other).toEqual([]);
  });

  it('times with days are read too; anything else is kept as words', () => {
    expect(duration('00:39:48')).toBe(2388);
    expect(duration('1 day, 02:00:00')).toBe(93600);
    expect(duration('3 days 0:00:01')).toBe(259201);
    expect(duration('soon')).toBeNull();
    expect(clock('123:00:00')).toBe(442800);
    expect(parseGmxEta('[7] x.sh: Simulation will finish in a while.').lines[0]).toMatchObject({ eta: null, reason: null, message: 'Simulation will finish in a while.' });
  });
});

describe('the two merged, and what the view shows (R10b)', () => {
  const rows = mergeJobs(QQ.jobs, ETA.lines);
  // When both tools ran: a fixed clock, in your time zone (Brno).
  const read = new Date('2026-10-09T23:50:00Z'), TZ = 'Europe/Prague';

  it("qq's jobs in its order, each with its gmx-eta line, then the jobs only gmx-eta lists", () => {
    expect(rows.map(r => r.key)).toEqual(['1374603', '1374604', '1374605', '1374606', '1374607', '1374608', '1374609', '1374610', '1374611', '1374612', '1374613', '1374596', '1374597', '1374598', '1374599', '1374600', '1374601']);
    expect(rows[0].eta?.script).toBe('hmr+fast+sol4_pull_r.sh');
    expect(rows[11]).toMatchObject({ qq: null });
  });

  it('a running job with an ETA: the time left and when it finishes, in your time zone', () => {
    expect(etaOf(rows[0], read, TZ)).toEqual({ left: '40 min', finishes: 'Sat 02:29', why: null, warning: null });
  });

  it('"—" with the reason: not running yet, gmx-eta\'s own reason, or no line in gmx-eta', () => {
    expect(etaOf(rows[9], read, TZ)).toMatchObject({ left: null, why: 'not running yet' });
    expect(etaOf(rows[2], read, TZ)).toMatchObject({ left: null, why: 'Job does not have a working directory.' });
    expect(etaOf({ key: '1', qq: QQ.jobs[0], eta: null }, read, TZ)).toMatchObject({ left: null, why: 'gmx-eta lists no such job: not a GROMACS job, or no mdrun -v' });
  });

  it('the walltime warning, in words, when the ETA is longer than the walltime left', () => {
    const job = { ...QQ.jobs[0], runtime: 22 * 3600, walltime: 23 * 3600 };
    expect(etaOf({ key: '1', qq: job, eta: { ...ETA.lines[6], eta: 3 * 3600 + 600 } }, read, TZ).warning).toBe('needs 2 h 10 min more than its walltime');
    // A job only gmx-eta lists has no walltime to compare with.
    expect(etaOf(rows[12], read, TZ)).toEqual({ left: '2 min', finishes: 'Sat 01:51', why: null, warning: null });
  });

  it('spans and finish times', () => {
    expect([45, 2388, 7800, 97200].map(span)).toEqual(['45 s', '40 min', '2 h 10 min', '1 d 3 h']);
    expect(finishText(new Date('2026-10-16T01:40:00Z'), 'Europe/Prague')).toBe('Fri 03:40');
  });
});
