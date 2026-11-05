// SymBuilder's build and systems views (R3c), server-rendered (T179): the palette, the stack by stage, the selected
// tile's command for the first system, and the preview of every system before anything runs.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EMPTY_BUILD, type BuildDraft } from '../src/buildDraft';
import { BuildView } from '../src/views/Build';
import { KINDS, stepLine } from '../src/lib/build/tiles';
import { SystemsView } from '../src/views/Systems';
import type { Step } from '../src/lib/build/steps';

const draft: BuildDraft = { ...EMPTY_BUILD, systems: { methods: ['hmr+fast+6'], saccharides: ['o111', 'pg'], sequences: ['aaaaaaaa', 'pppppppp'], repeats: 1 } };
const noop = () => {};

describe('symbuilder · build', () => {
  const html = renderToStaticMarkup(createElement(BuildView, { draft, setDraft: noop, gmx: 'gmx_mpi' }));
  it('offers every kind of tile in the palette, by category', () => {
    const esc = (t: string) => t.replace(/'/g, '&#x27;');
    for (const k of Object.values(KINDS)) expect(html.includes('<span class="sr-only">add </span>' + esc(k.label) + '</span>')).toBe(true);
  });
  it('shows the stack stage by stage, the walkers left out by default', () => {
    for (const name of ['solution builder', 'minimisation', 'nvt', 'npt', 'awh', 'pull', 'multiwalker']) expect(html).toContain('aria-label="' + name + '"');
    expect(html.match(/>in this build</g)).toHaveLength(6);
    expect(html.match(/>left out</g)).toHaveLength(1);
  });
  it('the selected tile (pdb2gmx) with its command for the first system, its answers and its files', () => {
    expect(html).toContain('the selected tile: pdb2gmx');
    expect(html).toContain('gmx_mpi pdb2gmx -f ../solutions/hmr+fast+6/o111/aaaaaaaa/aaaaaaaa.gro -v -ignh');
    expect(html).toContain('# stdin  1 · 8 · 0 · 0');
    expect(html).toContain('aaaaaaaa_restraints.itp');
    expect(html).toContain('options · the whole build plan');
  });
  it('says the systems a plan is for: 1 × 2 × 2, with a repeat, is 8', () => {
    expect(html).toContain('= 8 systems');
  });
});

describe('symbuilder · systems', () => {
  const html = renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop }));
  it('every system in the preview, ready, and nothing builds from here yet', () => {
    expect(html.match(/>ready</g)).toHaveLength(8);
    expect(html).toContain('hmr+fast+6r / ');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>build 8 systems<\/button>/);
  });
  it('the stages, checkable, the walkers left out', () => {
    expect(html).toContain('aria-pressed="true" class="rounded-full border px-3 py-0.5 text-caption');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });
  it('invites a first system when none is set', () => {
    expect(renderToStaticMarkup(createElement(SystemsView, { draft: EMPTY_BUILD, setDraft: noop }))).toContain('every combination is a system');
  });
});

describe('a step as a line', () => {
  const s = (program: Step['program'], argv: string[]): Step => ({ stage: 'sb', tile: 'merge', label: '', program, argv, cwd: '', reads: [], writes: [], replaces: [], where: 'here' });
  it.each([
    ['gmx', ['solvate', '-cs'], 'gmx_mpi solvate -cs'], ['python', ['hmr.py', 'a.top'], 'python hmr.py a.top'], ['copy', ['a', 'b'], 'copies a to b'],
    ['rename', ['a', 'b'], 'renames a to b'], ['write', ['a.top'], 'writes a.top'], ['read', ['a.itp'], 'reads a.itp'], ['wait', ['4.minim.gro'], 'waits for 4.minim.gro: every 10 s, up to 10 min'],
  ] as const)('%s', (program, argv, line) => {
    expect(stepLine(s(program, [...argv]), 'gmx_mpi')).toBe(line);
  });
});
