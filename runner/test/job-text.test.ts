import { describe, expect, it } from 'vitest';
import { clock, fraction, jobLine, progressText, type Job } from '../src/jobs';

const job = (over: Partial<Job>): Job => ({ id: 'j', kind: 'rdf', title: 't', file: 'gmx', args: [], cwd: '/', status: 'running', created: '2026-10-09T00:00:00.000Z', started: '2026-10-09T00:00:00.000Z', progress: {}, meta: { estimate: { frames: 21, start: 0, end: 20 } }, ...over });

describe('a job in words (R4b)', () => {
  it('progress against the estimate, as gmx counts frames', () => {
    expect(progressText(job({ progress: { frame: 12, time: 12 } }))).toBe('frame 12 of ≈21 · t = 12 ps of ≈20 ps');
    expect(progressText(job({ progress: { frame: 12, time: 12 }, meta: {} }))).toBe('frame 12 · t = 12 ps');
    expect(progressText(job({}))).toBe('starting…');
    expect(progressText(job({ status: 'done', progress: { frame: 20, time: 20, analysed: { frames: 21, lastTime: 20 } } }))).toBe('21 frames analysed · last time 20 ps');
  });

  it('how far, by time read', () => {
    expect(fraction(job({ progress: { frame: 8, time: 8 } }))).toBe(0.4);
    expect(fraction(job({}))).toBe(0);
    expect(fraction(job({ meta: {} }))).toBeNull();
    expect(fraction(job({ progress: { time: 30 } }))).toBe(1);
  });

  it('a clock', () => {
    expect([clock(0), clock(2400), clock(760_000), clock(3_903_000)]).toEqual(['0:00', '0:02', '12:40', '1:05:03']);
  });

  it("the list's line for each state", () => {
    expect(jobLine(job({ progress: { frame: 12, time: 12 } }))).toBe('frame 12 · 12 ps');
    expect(jobLine(job({ status: 'done', ended: '2026-10-09T00:00:03.000Z', progress: { analysed: { frames: 21, lastTime: 20 } } }))).toBe('21 frames · 0:03');
    expect(jobLine(job({ status: 'failed', error: "Inconsistency in user input:\nCannot match 'group 7', because no such index group can be found." }))).toBe("Cannot match 'group 7', because no such index group can be found.");
    expect(jobLine(job({ status: 'cancelled', progress: { frame: 5000, time: 5000 } }))).toBe('at frame 5000');
  });
});
