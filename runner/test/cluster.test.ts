import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ageText, clock, duration, endedBetween, etaOf, finishText, mergeJobs, nextPoll, parseGmxEta, parseQqJobs, span, stateOf } from '../src/lib/cluster';

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
      cpus: 8, gpus: 1, nodes: 1, runtime: 48 * 60 + 36, walltime: 23 * 3600, waiting: null, node: 'node22', planned: null, cpu: 95, mem: 0, inputMachine: null, inputDir: null, comment: null,
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

  it('a running job without %CPU and %Mem (as Slurm prints it): its node, not a plan', () => {
    const t = parseQqJobs('│  R  12345  me name  q  4  0  1  01:00:00 / 02:00:00  node22 │');
    expect(t.jobs[0]).toMatchObject({ node: 'node22', planned: null, cpu: null, mem: null });
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

describe('polling (R10c)', () => {
  it('every 60 s while the view is open; after failed reads, twice as long each time, at most 10 min', () => {
    expect([0, 1, 2, 3, 4, 9].map(nextPoll)).toEqual([60, 120, 240, 480, 600, 600]);
  });

  it('how old the read is', () => {
    const at = '2026-10-10T10:00:00Z', t = Date.parse(at);
    expect([0, 59_000, 180_000, 7_500_000].map(d => ageText(at, t + d))).toEqual(['updated just now', 'updated just now', 'updated 3 min ago', 'updated 2 h 5 min ago']);
  });
});

// Your `qq jobs -e` sample (R15, T169): user name, home and project folders, login host and nodes replaced by stand-ins
// of the same length; the format and times as qq printed them. Its walltime is a day: "1d 00:00:00".
const DAY = parseQqJobs(text('qq-jobs-1d.txt')), E = parseQqJobs(text('qq-jobs-e.txt'));

describe('qq jobs with a day of walltime, and -e (R15)', () => {
  it('"21:29:20 / 1d 00:00:00": runtime and walltime, the node and its use (before, a running job read as waiting)', () => {
    expect(DAY.jobs).toHaveLength(12);
    expect(DAY.jobs[0]).toMatchObject({ state: { letter: 'R' }, runtime: 21 * 3600 + 29 * 60 + 20, walltime: 86400, waiting: null, node: 'node11', planned: null, cpu: 99, mem: 27 });
    expect(DAY.jobs.every(j => j.walltime === 86400 && j.node && j.waiting === null)).toBe(true);
    expect(DAY.counts).toEqual({ R: 12, 'Σ': 12 });
  });

  it('days on either side, as qq may print them', () => {
    const row = (times: string) => parseQqJobs('│  R  1  u  name  gpu  8  1  1  ' + times + '  node1  99  10 │').jobs[0]
    expect(row('1d 02:00:00 / 2d 00:00:00')).toMatchObject({ runtime: 26 * 3600, walltime: 2 * 86400, node: 'node1' });
    expect(clock('1d 00:00:30')).toBe(86430);
    expect(clock('1d')).toBeNull();
  });

  it('-e: each job\'s input machine, input folder and comment, under its row; nothing else read as a job', () => {
    expect(E.jobs).toHaveLength(12);
    expect(E.jobs[0]).toMatchObject({ key: '1523408', inputMachine: 'login.cluster.test', inputDir: '/home/user2', comment: 'Job run at Mon Oct 19 at 00:33 on (node11:mem=8388608kb:ncpus=8:ngpus=1:scratch_local=8388608kb)' });
    expect(E.jobs[6]).toMatchObject({ key: '1523727', name: 'qq_loop_md+0001', inputDir: '/storage/store1-shard/home/user2/project-a/systems/PEP1-POPC/5_md' });
    expect(E.other.some(l => l.startsWith('>'))).toBe(false);
    expect(DAY.jobs[0].inputDir).toBeNull();
  });
});

describe('a job that ended between two reads (R15, T169)', () => {
  const without = (t: typeof E, key: string) => t.jobs.filter(j => j.key !== key);
  it('running, then gone from the list: "no longer running", with the input folder qq -e gave', () => {
    expect(endedBetween(E.jobs, without(E, '1523727'))).toEqual([{ key: '1523727', name: 'qq_loop_md+0001', word: 'no longer running', inputDir: '/storage/store1-shard/home/user2/project-a/systems/PEP1-POPC/5_md' }]);
  });
  it('"finished" only when the list says so (qq jobs -a)', () => {
    const after = E.jobs.map(j => (j.key === '1523728' ? { ...j, state: stateOf('F') } : j));
    expect(endedBetween(E.jobs, after)).toEqual([expect.objectContaining({ key: '1523728', word: 'finished' })]);
  });
  it('nothing ended: the same list, a queued job that starts, a job never seen running; the folder never guessed', () => {
    expect(endedBetween(E.jobs, E.jobs)).toEqual([]);
    expect(endedBetween(QQ.jobs.filter(j => j.state.letter === 'Q'), [])).toEqual([]);
    // Without -e there is no folder: the job is still said, with none.
    expect(endedBetween(DAY.jobs, without(DAY, '1523727'))).toEqual([expect.objectContaining({ key: '1523727', inputDir: null })]);
    // A folder known from an earlier read is used.
    expect(endedBetween(DAY.jobs, without(DAY, '1523727'), new Map([['1523727', '/x/5_md']]))[0].inputDir).toBe('/x/5_md');
  });
});
