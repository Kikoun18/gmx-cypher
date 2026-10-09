// Stdin answers (R3b, T99): a command that asks questions gets its answers on stdin, in a job and in a read, and the
// job's event log keeps them. A real process here: `cat`-like node, not gmx.
import { describe, expect, it } from 'vitest';
import { capture } from '../server/gmx';
import { Jobs } from '../server/jobs';
import { tmp } from './helpers';

const ECHO = ['-e', 'process.stdin.pipe(process.stdout)'];

describe('stdin answers (T99)', () => {
  it('a read gets its answers on stdin and returns what the process printed', async () => {
    const r = await capture(process.execPath, ECHO, { stdin: '6 1 0\n' });
    expect(r.stdout).toBe('6 1 0\n');
  });

  it('a read without answers still ignores stdin (the process sees end of input at once)', async () => {
    const r = await capture(process.execPath, ['-e', 'process.stdin.on("data", d => process.stdout.write("got " + d)); process.stdin.on("end", () => process.stdout.write("end"))']);
    expect(r.stdout).toBe('end');
  });

  it('a job gets its answers on stdin, and its event log records them with the spec', async () => {
    const jobs = new Jobs(tmp('stdin-jobs'));
    const job = jobs.start({ kind: 'test', title: 'echo', file: process.execPath, args: ECHO, cwd: tmp('stdin-cwd'), stdin: 'answer 42\n' });
    for (let n = 0; n < 100 && jobs.get(job.id)!.status === 'running'; n++) await new Promise(r => setTimeout(r, 50));
    expect(jobs.get(job.id)!.log).toBe('answer 42\n');
    expect(jobs.get(job.id)!.stdin).toBe('answer 42\n');
  });
});
