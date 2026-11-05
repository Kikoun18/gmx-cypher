// SymBuilder's build and systems views (R3c), server-rendered (T179): the palette, the stack by stage, the selected
// tile's command for the first system, and the preview of every system before anything runs.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EMPTY_BUILD, type BuildDraft } from '../src/buildDraft';
import { BuildView } from '../src/views/Build';
import { KINDS, stepLine } from '../src/lib/build/tiles';
import { InProject, SystemsView } from '../src/views/Systems';
import type { FolderLanding } from '../src/lib/build/landing';
import { BuildFilesView } from '../src/views/BuildFiles';
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

describe('symbuilder · systems from the project (R8a)', () => {
  const project = {
    name: 'innit', columns: [{ k: 'c1', label: 'O111' }, { k: 'c2', label: 'PG' }],
    rows: [{ name: 'AAAAAAAA', seq: 'AAAAAAAA', group: 'hmr+fast+6', runs: { c1: ['a'] } }], settings: { pattern: '', pathPattern: '' },
  };
  it('with no project, says where to connect one', () => {
    expect(renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop }))).toContain('connect a project in settings → vault');
  });
  it('names the project and what it lacks, and offers both', () => {
    const html = renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop, project }));
    expect(html).toContain('<b>innit</b> · 1 group × 2 columns × 1 sequence · 1 of 2 cells with no runs');
    expect(html).toContain('take all from the project');
    expect(html).toContain('build what the project lacks · 1');
  });
  it('a build of the cells the project lacks says so, and counts only those', () => {
    const only: BuildDraft = { ...draft, systems: { methods: ['hmr+fast+6'], saccharides: ['o111', 'pg'], sequences: ['aaaaaaaa'], repeats: 0, only: ['hmr+fast+6/pg/aaaaaaaa'] } };
    const html = renderToStaticMarkup(createElement(SystemsView, { draft: only, setDraft: noop, project }));
    expect(html).toContain('only 1 cell of these lists, the ones the project lacks');
    expect(html).toContain('1 cell the project lacks');
    expect(html).toMatch(/>build 1 system<\/button>/);
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

describe('symbuilder · files (R4)', () => {
  const check = { base: '/data/innit_tests', missing: { 'solutions/hmr+fast+6/pg/aaaaaaaa': ['ff/pg-ADD.itp'] }, files: [
    { path: 'molecules/saccharides/o111.gro', kind: 'saccharide' as const, what: '', found: true }, { path: 'ff/o111-ADD.itp', kind: 'saccharide' as const, what: '', found: true },
    { path: 'molecules/saccharides/pg.gro', kind: 'saccharide' as const, what: '', found: true }, { path: 'ff/pg-ADD.itp', kind: 'saccharide' as const, what: '', found: false },
    { path: 'ff/ADDff.itp', kind: 'force field' as const, what: '', found: true }, { path: 'inputs/minim.mdp', kind: 'mdp' as const, what: '', found: true }] };
  it('each saccharide ready or missing, the force field\'s files, the mdp per stage and method, and the systems missing a file', () => {
    const html = renderToStaticMarkup(createElement(BuildFilesView, { draft, check, error: '', base: '/data/innit_tests' }));
    expect(html).toContain('>o111</b>');
    expect(html.match(/>ready</g)).toHaveLength(1);
    expect(html).toContain('one system is missing a file: hmr+fast+6/pg/aaaaaaaa needs ff/pg-ADD.itp');
    expect(html).toContain('inputs/awh_hmr.mdp');
    expect(html).toContain('ff/ADDff.itp');
  });
  it('says where to set the base folder when there is none', () => {
    expect(renderToStaticMarkup(createElement(BuildFilesView, { draft, check: null, error: '', base: null }))).toContain('no base folder yet: set it in settings → SymBuilder');
  });
  it('the systems preview names a system\'s missing file', () => {
    const html = renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop, missing: check.missing }));
    expect(html).toContain('ff/pg-ADD.itp');
    expect(html.match(/>missing</g)).toHaveLength(1);
  });
});

describe('symbuilder · systems: where each lands in the project (R8b)', () => {
  const f = (o: Partial<FolderLanding>): FolderLanding => ({ folder: '', what: 'walker', name: '', row: 'AAAAAAAA', rowNew: false, group: 'hmr+fast+6', col: 'O111', colNew: false, run: 1, replaces: false, problems: [], ...o });
  const html = (folders: FolderLanding[] | undefined) => renderToStaticMarkup(createElement(InProject, { folders }));
  it('the row, column and runs, ranges joined', () => {
    expect(html([f({ what: 'awh', run: 3 }), ...[1, 2, 3, 4].map(n => f({ n, run: n }))])).toContain('AAAAAAAA · O111 · run 3, walkers 1–4');
    expect(html([f({ what: 'awh', run: 1, rowNew: true, colNew: true, row: 'GG', col: 'XYL' })])).toContain('GG (new row) · XYL (new column) · run 1');
  });
  it('runs the project has already: replaced, said as a check', () => {
    const h = html([f({ what: 'awh', run: 3 }), f({ n: 1, run: 1, replaces: true }), f({ n: 2, run: 2, replaces: true })]);
    expect(h).toContain('>replaces<');
    expect(h).toContain('replaces runs 1–2');
  });
  it('the first problem, where, and how many more, each said once', () => {
    const h = html([f({ what: 'awh', problems: ['group solutions, not hmr+fast+6', 'column hmr+fast+6, not O111'] }), f({ n: 1, problems: ['x'] })]);
    expect(h).toContain('>elsewhere<');
    expect(h).toContain('7.awh: group solutions, not hmr+fast+6 · and 2 more');
    const every = html([f({ what: 'awh', problems: ['a new row WRWYCR'] }), f({ n: 1, problems: ['a new row WRWYCR'] })]);
    expect(every).toContain('<span class="min-w-0">a new row WRWYCR</span>');
  });
  it('no awh or walkers: nothing lands', () => {
    expect(html([])).toContain('no awh or walkers in this build');
    expect(html(undefined)).toBe('<span></span>');
  });
  it('the preview has the column only with a project', () => {
    expect(renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop }))).not.toContain('system · in the project');
    const landing = { project: { name: 'innit', pattern: '{method}_{column}_{seq}_t{time}.xvg', pathPattern: '' }, systems: { 'solutions/hmr+fast+6/o111/aaaaaaaa': [f({ what: 'awh' })] }, more: 0 };
    const h = renderToStaticMarkup(createElement(SystemsView, { draft, setDraft: noop, landing }));
    expect(h).toContain('<span>system · in the project</span>');
    expect(h).toContain('where each PMF would land in innit, by the Matrix&#x27;s own planBatch · name pattern {method}_{column}_{seq}_t{time}.xvg · folder pattern none');
    expect(h.match(/>lands</g)).toHaveLength(1);
  });
});
