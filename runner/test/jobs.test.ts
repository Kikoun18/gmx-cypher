import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Jobs, sameProgram, type Job } from '../server/jobs';
import { FAKE_GMX, tmp } from './helpers';

const NDX = '[ sulfur ]\n   5\n[ water_O ]\n  43\n';
function setup() {
  const home = tmp('jobs'), cwd = tmp('sim');
  writeFileSync(join(cwd, 'g.ndx'), NDX);
  return { home, cwd, jobs: new Jobs(join(home, 'jobs')) };
}
const rdfArgs = ['rdf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 1', '-o', 'out.xvg'];
const ended = (jobs: Jobs, id: string) => new Promise<Job>(r => { const on = (j: Job) => { if (j.id === id && j.ended) { jobs.off('job', on); r(j); } }; jobs.on('job', on); });
/** Live (not zombie) processes in a group. A zombie is dead; some containers' PID 1 never reaps orphans. */
const alive = (pgid: number) => execFileSync('ps', ['-A', '-o', 'pgid=,stat='], { encoding: 'utf8' }).split('\n')
  .some(l => { const [g, stat] = l.trim().split(/\s+/); return g === String(pgid) && !stat.startsWith('Z'); });

describe('jobs', () => {
  it('runs a program without a shell: every argument arrives as it was given', async () => {
    const { jobs, cwd } = setup();
    const args = ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', 'a b', '; rm -rf ~', '$(id)', "it's"];
    const j = jobs.start({ kind: 'test', title: 'echo', file: process.execPath, args, cwd });
    const done = await ended(jobs, j.id);
    expect(done.status).toBe('done');
    expect(JSON.parse(jobs.get(j.id)!.log.trim())).toEqual(args.slice(2));
  });

  it('records progress, the frames analysed and a clean exit; the log is kept and replayed', async () => {
    const { jobs, cwd, home } = setup();
    const j = jobs.start({ kind: 'rdf', title: 'rdf_nvt', file: FAKE_GMX, args: rdfArgs, cwd });
    const done = await ended(jobs, j.id);
    expect(done).toMatchObject({ status: 'done', exit: { code: 0, signal: null }, progress: { frame: 10, time: 10, analysed: { frames: 11, lastTime: 10 } } });
    expect(existsSync(join(cwd, 'out.xvg'))).toBe(true);
    const again = new Jobs(join(home, 'jobs')).get(j.id)!;
    expect(again).toMatchObject({ status: 'done', title: 'rdf_nvt', progress: done.progress });
    expect(again.log).toBe(jobs.get(j.id)!.log);
    expect(again.log).toContain('Analyzed 11 frames');
  });

  it("records a failure with gmx's own error", async () => {
    const { jobs, cwd } = setup();
    const j = jobs.start({ kind: 'rdf', title: 'bad', file: FAKE_GMX, args: [...rdfArgs.slice(0, 10), 'group 7', '-o', 'x.xvg'], cwd });
    expect(await ended(jobs, j.id)).toMatchObject({ status: 'failed', exit: { code: 1 }, error: expect.stringContaining("Cannot match 'group 7'") });
  });

  it('cancels the whole process group and leaves no process behind', async () => {
    const { jobs, cwd } = setup();
    // A program that starts a child of its own, as mpirun does.
    const j = jobs.start({ kind: 'test', title: 'tree', file: process.execPath, args: ['-e', "require('child_process').spawn('sleep', ['30'], { stdio: 'inherit' }); setInterval(() => {}, 1000); console.log('up')"], cwd });
    await new Promise<void>(r => { const on = (id: string) => { if (id === j.id) { jobs.off('out', on); r(); } }; jobs.on('out', on); });
    const pid = jobs.get(j.id)!.pid!;
    expect(alive(pid)).toBe(true);
    jobs.cancel(j.id);
    expect((await ended(jobs, j.id)).status).toBe('cancelled');
    await new Promise(r => setTimeout(r, 200));
    expect(alive(pid)).toBe(false);
  });

  it('marks a job that never ended (the runner crashed) as interrupted, with its pid', () => {
    const { home } = setup();
    const dir = join(home, 'jobs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'j1.ndjson'), JSON.stringify({ t: 'created', at: '2026-10-08T22:00:00.000Z', spec: { kind: 'rdf', title: 'old', file: '/x/gmx', args: [], cwd: '/' } }) + '\n'
      + JSON.stringify({ t: 'started', at: '2026-10-08T22:00:01.000Z', pid: 999999 }) + '\n');
    const j = new Jobs(dir).get('j1')!;
    expect(j).toMatchObject({ status: 'interrupted', pid: 999999 });
    expect(readFileSync(join(dir, 'j1.ndjson'), 'utf8').trim().split('\n')).toHaveLength(3);
  });

  it('stops every running job when the runner stops, and records them as cancelled', async () => {
    const { jobs, cwd } = setup();
    const a = jobs.start({ kind: 'test', title: 'a', file: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], cwd });
    const b = jobs.start({ kind: 'test', title: 'b', file: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], cwd });
    await jobs.stopAll();
    expect([jobs.get(a.id)!.status, jobs.get(b.id)!.status]).toEqual(['cancelled', 'cancelled']);
  });

  it('records a program that cannot start', async () => {
    const { jobs, cwd } = setup();
    const j = jobs.start({ kind: 'test', title: 'none', file: '/no/such/gmx', args: [], cwd });
    expect(await ended(jobs, j.id)).toMatchObject({ status: 'failed', error: expect.stringContaining('ENOENT') });
  });
});

describe('a job the runner did not see end (R2a)', () => {
  const unended = (dir: string, spec: object, pid: number) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'j1.ndjson'), JSON.stringify({ t: 'created', at: '2026-10-19T10:00:00.000Z', spec }) + '\n' + JSON.stringify({ t: 'started', at: '2026-10-19T10:00:01.000Z', pid }) + '\n');
  };
  const live = (file: string, args: string[]) => { const p = spawn(file, args, { stdio: 'ignore' }); return p; };

  it('a live pid that is another program now: interrupted, as before', () => {
    const { home } = setup(), dir = join(home, 'jobs');
    const other = live('sleep', ['30']);
    try {
      unended(dir, { kind: 'rdf', title: 'old', file: FAKE_GMX, args: ['rdf', '-f', 'nvt.xtc'], cwd: '/' }, other.pid!);
      expect(new Jobs(dir).get('j1')).toMatchObject({ status: 'interrupted', error: 'gmx-cypher stopped while this job ran (pid ' + other.pid + ')' });
    } finally { other.kill(); }
  });

  it("a live pid with the job's own command line: still running, not followed; its end is not invented", () => {
    const { home } = setup(), dir = join(home, 'jobs');
    const args = ['-e', 'setTimeout(() => {}, 30000)'], same = live(process.execPath, args);
    try {
      unended(dir, { kind: 'test', title: 'long', file: process.execPath, args, cwd: '/' }, same.pid!);
      const j = new Jobs(dir).get('j1')!;
      expect(j).toMatchObject({ status: 'running', pid: same.pid, unfollowed: true });
      expect(j.ended).toBeUndefined();
      expect(readFileSync(join(dir, 'j1.ndjson'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally { same.kill(); }
  });

  it.each([
    ['the same program and arguments', ['/usr/bin/gmx', 'rdf', '-f', 'a b.xtc'], true],
    ['a script run by its interpreter (#!/usr/bin/env node)', ['/opt/node/bin/node', '/x/fake-gmx.mjs', 'rdf', '-f', 'a b.xtc'], true],
    ['another program', ['/usr/bin/sleep', '30'], false],
    ['the same program with other arguments', ['/usr/bin/gmx', 'rdf', '-f', 'other.xtc'], false],
    ['a zombie or a process gone (no command line)', [], false],
  ])('sameProgram: %s', (_, cmdline, expected) => {
    const spec = cmdline[1] === '/x/fake-gmx.mjs' ? { file: '/x/fake-gmx.mjs', args: ['rdf', '-f', 'a b.xtc'] } : { file: '/usr/bin/gmx', args: ['rdf', '-f', 'a b.xtc'] };
    expect(sameProgram(cmdline as string[], spec)).toBe(expected);
  });
});

