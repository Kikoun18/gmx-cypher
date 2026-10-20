// One result page layout (R9b, contract §5): for every result kind, the actions, then the charts with their stats,
// then the settings and the groups, then the provenance, collapsed. Rendered on the server: no browser needed.
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RESULT_ORDER } from '../src/core/contract';
import { COMMANDS } from '../src/lib/commands';
import { ResultView } from '../src/views/Result';
import type { Job } from '../src/jobs';
import type { RunRecord } from '../src/lib/record';

const dir = '/data/sims/WRWYCR/ha/07_md';
const job = (kind: string): Job => ({
  id: 'jaaaaaaaaaaa1', kind, title: kind + '_nvt · sulfur → water_O', file: '/usr/bin/gmx', args: [kind, '-f', 'nvt.xtc'], cwd: dir, status: 'done', created: '2026-10-20T04:00:00.000Z', started: '2026-10-20T04:00:00.000Z', ended: '2026-10-20T04:00:05.000Z',
  progress: {}, meta: { outDir: dir + '/' + kind, record: dir + '/' + kind + '/' + kind + '_nvt.run.json', names: { xvg: kind + '_nvt.xvg' } },
} as unknown as Job);
const record = (kind: string): RunRecord => ({
  format: 'gmx-cypher run', version: 3, analysis: kind, runner: { name: 'gmx-cypher', version: '0.1.0' }, gmx: { path: '/usr/bin/gmx', version: '2025.4' }, job: 'jaaaaaaaaaaa1',
  command: { cwd: dir, file: '/usr/bin/gmx', args: [kind, '-f', 'nvt.xtc'] }, env: {}, started: null, ended: null, status: 'done', complete: true, exit: { code: 0, signal: null }, frames: { analysed: 21, lastTime: 20 }, log: '',
  inputs: { trajectory: { path: dir + '/nvt.xtc', size: 1, mtime: '', sha256: 'ab' } },
  groups: [
    { role: 'reference', name: 'sulfur', tone: 'coral', steps: [], index: 0, atoms: '1-6', count: 6, gmxCount: 6 },
    { role: 'selection', name: 'water_O', tone: 'sky', steps: [], index: 1, atoms: '43-3239:4', count: 800, gmxCount: 800 },
  ],
  options: [{ flag: 'b', value: '0' }, { flag: 'bin', value: '0.002' }, { flag: 'norm', value: 'rdf' }, { flag: 'pbc', value: true }],
  outputs: [{ kind: 'xvg', path: dir + '/' + kind + '/' + kind + '_nvt.xvg', size: 2048, sha256: 'a'.repeat(64) }], problems: [], windows: [], statistics: null,
} as unknown as RunRecord);

const landmarks = (html: string) => [...html.matchAll(/data-landmark="(\w+)"/g)].map(m => m[1]);

describe('every result page has one order', () => {
  it('the contract names the four parts', () => expect(RESULT_ORDER).toEqual(['actions', 'charts', 'settings', 'provenance']));
  it.each(COMMANDS.map(c => c.tool))('%s', kind => {
    const html = renderToStaticMarkup(React.createElement(ResultView, { job: job(kind), record: record(kind), log: 'gmx log', allow: ['/data/sims'], vault: '/vault', onRunAgain: () => {}, onCompare: () => {} }));
    expect(landmarks(html)).toEqual(RESULT_ORDER);
    // The provenance is collapsed, and its paths are relative to the allowed folder, the full path one copy away.
    expect(html).toMatch(/<details[^>]*data-landmark="provenance"(?![^>]*\bopen\b)/);
    expect(html).toContain('sims/WRWYCR/ha/07_md/' + kind);
    expect(html).toContain('aria-label="copy the full path of ' + kind + '_nvt.xvg"');
  });
  it('a running job keeps its provenance open: the log is what there is to see', () => {
    const html = renderToStaticMarkup(React.createElement(ResultView, { job: { ...job('rdf'), status: 'running', ended: undefined } as Job, record: null, log: 'frame 3', allow: [], vault: null, onRunAgain: () => {}, onCompare: () => {} }));
    expect(landmarks(html)).toEqual(['actions', 'provenance']);
    expect(html).toMatch(/<details[^>]*data-landmark="provenance"[^>]*\bopen\b/);
  });
});

describe('a compare card follows the same order', () => {
  it('actions, its structure beside its chart, its settings and groups, its provenance', async () => {
    const { readFileSync } = await import('node:fs');
    const { fromFiles } = await import('../src/decypher/parse');
    const { AnalysisCard } = await import('../src/decypher/Decypher');
    const { DEFAULT_VIEW } = await import('../src/decypher/state');
    const { PALETTES } = await import('../src/core/theme');
    const F = (n: string) => ({ path: n, text: readFileSync(new URL('./fixtures/decypher/' + n, import.meta.url), 'utf8') });
    const [a, b] = fromFiles([F('rdf_o111_Methionine_H.xvg'), F('rdf_o111_Methionine_S.xvg')]).analyses;
    const html = renderToStaticMarkup(React.createElement(AnalysisCard, {
      members: [a], on: [a.id], tone: 'coral', mol: null, pal: PALETTES.light, view: DEFAULT_VIEW, selected: [a.sels[0].name], tones: {}, candidates: [{ a: b, why: null }],
      onMorph: () => {}, onSplit: () => {}, onRefs: () => {}, onSelect: () => {}, handle: () => {}, onActive: () => {}, display: null, marks: null,
    }));
    expect(landmarks(html)).toEqual(RESULT_ORDER);
  });
});

describe('one set of style names (question 17)', () => {
  it('compare draws some of them, and says why not the others', async () => {
    const { STYLES } = await import('../src/core/contract');
    const { kit } = await import('../src/core/index');
    const { CANNOT } = await import('../src/decypher/Decypher');
    for (const s of kit.REPS) expect(STYLES).toContain(s);
    expect(STYLES.filter(s => !(kit.REPS as string[]).includes(s))).toEqual(Object.keys(CANNOT));
  });
});
