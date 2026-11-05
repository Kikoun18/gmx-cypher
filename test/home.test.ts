// home (R2): what the server already knows, server-rendered (T179) for an empty state and a busy one; every card
// links to its place, and nothing reads qq or polls.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Job } from '../src/jobs';
import { HomeView, type ProjectSummary } from '../src/views/Home';

const GMX = { ok: true, path: '/usr/bin/gmx', name: 'gmx', version: '2025.4' } as never;
const job = (id: string, status: Job['status'], ended?: string): Job => ({ id, kind: 'run', title: 'gmx rdf · ' + id, file: 'gmx', args: [], cwd: '/x', status, created: '2026-11-05T10:00:00Z', ...(ended ? { ended } : {}), progress: {} });

describe('home', () => {
  it('empty: invites the next action in every card', () => {
    const html = renderToStaticMarkup(createElement(HomeView, { gmx: GMX, vault: null, project: null, jobs: [], cluster: null }));
    expect(html).toContain('no jobs yet');
    expect(html).toContain('href="#setup/inputs"');
    expect(html).toContain('no system built yet');
    expect(html).toContain('href="#symbuilder/build"');
    expect(html).toContain('no vault set');
    expect(html).toContain('not read since this page opened');
    expect(html).toContain('gmx 2025.4');
  });

  it('busy: jobs running and the last four finished, the project\'s empty cells, the cluster\'s last read', () => {
    const jobs = [job('jaaaaa1', 'running'), ...['2', '3', '4', '5', '6'].map((n, i) => job('jbbbbb' + n, n === '3' ? 'failed' : 'done', '2026-11-05T1' + i + ':00:00Z'))];
    const project: ProjectSummary = { name: 'prosECCo peptides', columns: [{ k: 'o111' }, { k: 'pg' }], rows: [{ runs: { o111: ['a', 'b'] } }, { runs: {} }] };
    const cluster = { at: '2026-11-05T12:00:00Z', states: [{ word: 'running', tone: 'sky' as const, n: 6 }, { word: 'queued', tone: 'lilac' as const, n: 3 }] };
    const html = renderToStaticMarkup(createElement(HomeView, { gmx: GMX, vault: '/data/evomd-vault', project, jobs, cluster }));
    expect(html).toContain('href="#results/jaaaaa1"');
    expect(html.match(/href="#results\/jbbbbb\d"/g)).toHaveLength(4);
    expect(html).not.toContain('href="#results/jbbbbb2"');
    expect(html).toContain('evomd-vault');
    expect(html).toContain('2 rows · 2 columns');
    expect(html).toContain('3 cells with no runs');
    expect(html).toContain('href="#symbuilder/systems"');
    expect(html).toContain('6 running');
    expect(html).toContain('3 queued');
    expect(html).toContain('href="#cluster"');
  });

  it('reads no qq and sets no timer: the project once, the cluster tab\'s read handed up', () => {
    const src = readFileSync(new URL('../src/views/Home.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\/api\/cluster|setInterval|setTimeout/);
  });
});
