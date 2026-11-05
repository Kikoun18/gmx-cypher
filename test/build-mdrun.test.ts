// mdrun's own progress with -v (sample 6, T232): your minimisation's real output (test/fixtures/build/mdrun-v), read as
// your notebook's run_live reads it; nvt and npt's lines as GROMACS prints them (print_time: "\rstep N", then
// ", remaining wall clock time: S s" once past nstlist, or ", will finish <date>" with 300 s or more left), with the
// notebook's saved nvt output for its head and PME tuning.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mdrunHead, mdrunProgress, screenText } from '../src/lib/build/mdrun';
import { MdrunBar, ProgressView } from '../src/views/Progress';
import { RUNNER } from './helpers';

const MINIM = readFileSync(RUNNER + 'test/fixtures/build/mdrun-v/minim.txt', 'utf8');
const NVT = readFileSync(RUNNER + 'test/fixtures/build/notebook/tools/mdrun-eqnvt.txt', 'utf8');
/** The nvt's text up to its PME tuning, with the progress mdrun -v writes in between (constructed, as print_time writes it). */
const nvtAt = (progress: string) => NVT.slice(0, NVT.indexOf('step 19900: timed')) + progress + '\n' + NVT.slice(NVT.indexOf('step 19900: timed'), NVT.indexOf('Writing final'));

describe('a minimisation, your real output', () => {
  it('its head: 5000 steps at most, Fmax below 1000', () => {
    expect(mdrunHead(MINIM)).toEqual({ kind: 'em', total: 5000, tolerance: 1000 });
  });
  it('step by step, a rejected step\'s \\r rewrite read as the line after it; converged in 582 steps', () => {
    const cut = (s: string) => MINIM.slice(0, MINIM.indexOf(s));
    expect(mdrunProgress(cut('Step=    1,'))).toEqual({ kind: 'em', total: 5000, tolerance: 1000, step: 0, fmax: 125132 });
    // Step 14 raised the energy: mdrun rewrote its line with step 15's (\r).
    expect(mdrunProgress(cut('Step=   16,'))).toMatchObject({ step: 15, fmax: 15952 });
    expect(mdrunProgress(MINIM)).toEqual({ kind: 'em', total: 5000, tolerance: 1000, step: 581, fmax: 956.205, done: { steps: 582, how: 'converged to Fmax < 1000' } });
  });
  it('a tail without the head: the head kept from before', () => {
    const tail = MINIM.slice(MINIM.indexOf('Step=  300,'), MINIM.indexOf('Step=  301,'));
    expect(mdrunProgress(tail)).toBeNull();
    expect(mdrunProgress(tail, mdrunHead(MINIM))).toMatchObject({ step: 300, total: 5000 });
  });
  it('as a terminal shows it: each rewritten line as its last \\r left it', () => {
    const screen = screenText(MINIM).split('\n');
    expect(screen.filter(l => l.startsWith('Step=')).length).toBe(582 - 121);
    expect(screen.find(l => l.startsWith('Step=   15,'))).toBe('Step=   15, Dmax= 5.3e-02 nm, Epot= -4.60534e+05 Fmax= 1.59520e+04, atom= 12');
    expect(screen.some(l => l.startsWith('Step=   14,'))).toBe(false);
  });
});

describe('nvt and npt, as GROMACS prints their steps', () => {
  it('the head from "125000 steps,  125.0 ps."; nothing before a step', () => {
    expect(mdrunHead(NVT)).toEqual({ kind: 'md', total: 125000 });
    expect(mdrunProgress(nvtAt(''))).toBeNull();
  });
  it('the lone "step 0", then the time left; PME tuning is not a step', () => {
    expect(mdrunProgress(nvtAt('\rstep 0'))).toEqual({ kind: 'md', total: 125000, step: 0 });
    expect(mdrunProgress(nvtAt('\rstep 0\rstep 100, remaining wall clock time:    31 s          \rstep 45600, remaining wall clock time:    17 s          '))).toEqual({ kind: 'md', total: 125000, step: 45600, left: 17 });
    expect(mdrunProgress('125000 steps,    125.0 ps.\nstep 19900: timed with pme grid 60 60 60, coulomb cutoff 1.200: 95.3 M-cycles\n')).toBeNull();
    expect(mdrunProgress('125000 steps,    125.0 ps.\n\rstep 200, will finish Thu Nov  5 14:02:11 2026')).toMatchObject({ step: 200, finish: 'Thu Nov  5 14:02:11 2026' });
    // With more than one rank: a line each, the domain decomposition's load before it.
    expect(mdrunProgress('125000 steps,    125.0 ps.\nvol 0.80  imb F  2% step 1200, remaining wall clock time:    25 s\n')).toMatchObject({ step: 1200, left: 25 });
  });
  it('every step done: "Writing final coordinates."', () => {
    expect(mdrunProgress(NVT.replace('starting mdrun', '\rstep 124900, remaining wall clock time:     0 s\nstarting mdrun'))).toMatchObject({ step: 125000, done: { steps: 125000, how: 'every step done' } });
  });
});

describe('symbuilder · progress: mdrun\'s bar', () => {
  const html = (p: Parameters<typeof MdrunBar>[0]['p']) => renderToStaticMarkup(createElement(MdrunBar, { p, label: 'mdrun 5.eqnvt' }));
  it('its step of all, the time left, a minimisation\'s force against its tolerance', () => {
    expect(html({ kind: 'md', total: 125000, step: 45600, left: 17 })).toContain('step 45600 of 125000 · 17 s left');
    expect(html({ kind: 'md', total: 125000, step: 45600, left: 17 })).toContain('aria-valuenow="45600"');
    expect(html({ kind: 'md', total: 200000, step: 100, left: 125 })).toContain('2 min 5 s left');
    expect(html({ kind: 'em', total: 5000, tolerance: 1000, step: 300, fmax: 9727.15 })).toContain('step 300 of at most 5000 · Fmax 9.7e+03, converged below 1.0e+03');
    expect(html({ kind: 'em', total: 5000, tolerance: 1000, step: 581, fmax: 956.205, done: { steps: 582, how: 'converged to Fmax < 1000' } })).toContain('converged to Fmax &lt; 1000 in 582 steps');
    expect(html({ kind: 'em', total: 5000, tolerance: 1000, step: 581, done: { steps: 582, how: 'converged to Fmax < 1000' } })).toContain('width:100%');
  });
  it('shown for the running mdrun step, from its log and the head kept for it', () => {
    const run = { id: 'b1', created: '2026-11-06T10:00:00Z', status: 'running', plan: 'p', base: '/b', ifExists: 'continue', onFailure: 'next',
      systems: [{ dir: 'solutions/hmr+fast+6/o111/aaaaaaaa', method: 'hmr+fast+6', saccharide: 'o111', sequence: 'aaaaaaaa', status: 'building', step: 9, steps: 54, label: 'mdrun 4.minim', job: 'j1', notes: [], submit: [] }] } as never;
    const tail = MINIM.slice(MINIM.indexOf('Step=  300,'), MINIM.indexOf('Step=  301,'));
    const h = renderToStaticMarkup(createElement(ProgressView, { runs: [run], logs: { j1: { text: tail, end: 30_000, head: mdrunHead(MINIM) } }, loadLog: () => {}, onCancel: () => {} }));
    expect(h).toContain('step 300 of at most 5000 · Fmax 8.5e+03, converged below 1.0e+03');
    expect(h).toContain('aria-label="mdrun 4.minim: mdrun&#x27;s steps"');
  });
});
