// A jobs list that scales (R12a): a job is folded from its events without its log, which stays on disk and is read
// on demand, its tail by default.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldFile, foldJob, Jobs, LOG_TAIL } from '../server/jobs';
import { parseProgress, type Progress } from '../src/lib/progress';
import { tmp } from './helpers';

type Ev = Record<string, unknown> & { t: string };
/** The fold before R12a, kept as the reference: the whole log in memory, the progress read from it. */
function foldBefore(id: string, events: Ev[]) {
  let j: (Record<string, unknown> & { log: string; progress: Progress }) | null = null;
  for (const e of events) {
    if (e.t === 'created') j = { ...(e.spec as object), id, status: 'running', created: e.at, progress: {}, log: '' };
    else if (!j) return null;
    else if (e.t === 'started') { j.started = e.at; j.pid = e.pid; }
    else if (e.t === 'out') j.log += e.s as string;
    else if (e.t === 'ended') { j.status = e.status; j.ended = e.at; j.exit = { code: e.code, signal: e.signal }; if (e.error) j.error = e.error; }
  }
  if (j) j.progress = parseProgress(j.log);
  return j;
}

const at = '2026-10-20T10:00:00.000Z', spec = { kind: 'rdf', title: 'rdf_nvt', file: 'gmx', args: ['rdf'], cwd: '/sims', meta: { stem: 'rdf_nvt' } };
const frames = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => '\rReading frame ' + String(a + i).padStart(7) + ' time ' + (a + i).toFixed(3).padStart(10) + '   ').join('');
const created: Ev = { t: 'created', at, spec }, started: Ev = { t: 'started', at, pid: 4242 }, out = (s: string): Ev => ({ t: 'out', s });
const ended = (status: string, code: number | null, error?: string): Ev => ({ t: 'ended', at, status, code, signal: null, ...(error ? { error } : {}) });

describe('a job folded without its log (R12a)', () => {
  it.each([
    ['done: its frames and the summary', [created, started, out(frames(0, 400)), out('\rLast frame        399 time  399.000   \nAnalyzed 400 frames, last time 399.000\n'), ended('done', 0)]],
    ["failed, with gmx's error", [created, started, out(frames(0, 3)), out('\n-------------------------------------------------------\nProgram: gmx rdf\n\nInconsistency in user input:\nCannot match \'group 7\'\n-------------------------------------------------------\n'), ended('failed', 1, "Cannot match 'group 7'")]],
    ['cancelled', [created, started, out(frames(0, 10)), { t: 'cancel', at }, ended('cancelled', null)]],
    ['still running', [created, started, out(frames(0, 50))]],
    ['a log far longer than its tail', [created, started, ...Array.from({ length: 60 }, (_, k) => out(frames(k * 100, (k + 1) * 100))), ended('done', 0)]],
    ['created only', [created]],
    ['no created event: not a job', [started, out('x')]],
  ] as [string, Ev[]][])('%s', (_, events) => {
    const before = foldBefore('j1', events), now = foldJob('j1', events as Parameters<typeof foldJob>[1]);
    if (!before) return expect(now).toBeNull();
    const { log, ...fields } = before;
    expect(now!.job).toEqual({ ...fields, logSize: log.length });
    expect(now!.tail).toBe(log.slice(-LOG_TAIL));
    // At start, from the file's text: the output only measured, the tail decoded; the same job.
    expect(foldFile('j1', events.map(e => JSON.stringify(e)).join('\n') + '\n')).toEqual(now);
  });
  it('measures any text as JSON writes it: escapes, quotes, a character outside the basic plane', () => {
    const s = 'a\r\n\t"q"\\ \u0001 é 😀 \u2028', events = [created, out(s), out(s)];
    expect(foldFile('j', events.map(e => JSON.stringify(e)).join('\n'))!.job.logSize).toBe(2 * s.length);
  });
});

describe('the log, read from disk on demand (R12a)', () => {
  const write = (dir: string, id: string, events: Ev[]) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, id + '.ndjson'), events.map(e => JSON.stringify(e)).join('\n') + '\n'); };
  it('its tail by default, any range, all of it; out of range is clamped', () => {
    const dir = join(tmp('logs'), 'jobs');
    write(dir, 'j1', [created, started, out('abc'), out('defgh'), ended('done', 0)]);
    const jobs = new Jobs(dir);
    expect(jobs.get('j1')).toMatchObject({ logSize: 8 });
    expect(jobs.get('j1')).not.toHaveProperty('log');
    expect(jobs.logText('j1')).toBe('abcdefgh');
    expect(jobs.logRange('j1')).toEqual({ text: 'abcdefgh', from: 0, to: 8, size: 8 });
    expect(jobs.logRange('j1', 2, 5)).toEqual({ text: 'cde', from: 2, to: 5, size: 8 });
    expect(jobs.logRange('j1', 6, 99)).toEqual({ text: 'gh', from: 6, to: 8, size: 8 });
    expect(jobs.logRange('j1', 7, 3)).toEqual({ text: '', from: 3, to: 3, size: 8 });
  });
  it('a long one: its last 64 kB unless asked for all', () => {
    const dir = join(tmp('logs'), 'jobs'), big = frames(0, 3000);
    write(dir, 'j2', [created, started, out(big), ended('done', 0)]);
    const jobs = new Jobs(dir), tail = jobs.logRange('j2');
    expect([tail.from, tail.to, tail.size, tail.text]).toEqual([big.length - LOG_TAIL, big.length, big.length, big.slice(-LOG_TAIL)]);
    expect(jobs.logRange('j2', 0).text).toBe(big);
  });
});

describe('archive (R12c)', () => {
  const write = (dir: string, id: string, events: Ev[]) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, id + '.ndjson'), events.map(e => JSON.stringify(e)).join('\n') + '\n'); };
  const setup = () => {
    const dir = join(tmp('archive'), 'jobs');
    write(dir, 'jdone1', [created, started, out('done one'), ended('done', 0)]);
    write(dir, 'jfail1', [created, started, out('failed one'), ended('failed', 1, 'x')]);
    write(dir, 'jrun01', [created, started, out(frames(0, 3))]);
    return dir;
  };
  it('moves a finished job\'s file into archive/, as it was; the list and the next start leave it out', () => {
    const dir = setup(), bytes = readFileSync(join(dir, 'jdone1.ndjson'), 'utf8'), jobs = new Jobs(dir);
    jobs.archive('jdone1');
    expect([existsSync(join(dir, 'jdone1.ndjson')), readFileSync(join(dir, 'archive', 'jdone1.ndjson'), 'utf8')]).toEqual([false, bytes]);
    expect(jobs.list().map(j => j.id)).not.toContain('jdone1');
    expect(new Jobs(dir).list().map(j => j.id)).not.toContain('jdone1');
    expect(jobs.archived().map(j => [j.id, j.status])).toEqual([['jdone1', 'done']]);
  });
  it('moves it back on unarchiving, and it is a job again', () => {
    const dir = setup(), jobs = new Jobs(dir), bytes = readFileSync(join(dir, 'jfail1.ndjson'), 'utf8');
    jobs.archive('jfail1');
    jobs.unarchive('jfail1');
    expect([readFileSync(join(dir, 'jfail1.ndjson'), 'utf8'), existsSync(join(dir, 'archive', 'jfail1.ndjson'))]).toEqual([bytes, false]);
    expect(jobs.get('jfail1')).toMatchObject({ status: 'failed', error: 'x' });
    expect(jobs.archived()).toEqual([]);
  });
  it('refuses a running job, one it does not know, and a collision, either way: nothing is overwritten', async () => {
    const dir = setup(), jobs = new Jobs(dir), slow = jobs.start({ kind: 'test', title: 'slow', file: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], cwd: tmp('cwd') });
    expect(() => jobs.archive(slow.id)).toThrow('a running job is not archived');
    const gone = new Promise(r => jobs.on('job', (j: { id: string; ended?: string }) => { if (j.id === slow.id && j.ended) r(null); }));
    jobs.cancel(slow.id);
    await gone;
    expect(() => jobs.archive('jnone1')).toThrow('no job jnone1');
    mkdirSync(join(dir, 'archive'), { recursive: true });
    writeFileSync(join(dir, 'archive', 'jdone1.ndjson'), 'already here\n');
    expect(() => jobs.archive('jdone1')).toThrow('archive/jdone1.ndjson exists');
    expect([readFileSync(join(dir, 'archive', 'jdone1.ndjson'), 'utf8'), existsSync(join(dir, 'jdone1.ndjson')), !!jobs.get('jdone1')]).toEqual(['already here\n', true, true]);
    jobs.archive('jfail1');
    write(dir, 'jfail1', [created]);
    expect(() => jobs.unarchive('jfail1')).toThrow('jfail1.ndjson exists');
    expect(existsSync(join(dir, 'archive', 'jfail1.ndjson'))).toBe(true);
    expect(() => jobs.unarchive('jnone1')).toThrow('no archived job jnone1');
  });
});
