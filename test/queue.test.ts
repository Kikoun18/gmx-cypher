import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recipeFromDraft } from '../src/lib/recipe';
import { Batches, findTrajectories } from '../server/batch';
import type { Job } from '../server/jobs';
import { apiServer, clusterCopy } from './helpers';

const TEMPLATE = 'hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc';
const recipe = recipeFromDraft({ options: {}, groups: [
  { role: 'reference', name: 'sulfur', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'name', value: 'S1' } }] },
  { role: 'selection', name: 'sodium', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'resname', value: 'Na' } }] }] }, 'ion pairs');

afterEach(() => { delete process.env.FAKE_GMX_SLOW; });

async function setup(slow: number) {
  process.env.FAKE_GMX_SLOW = String(slow);
  const root = clusterCopy(), s = await apiServer(), roots = [root];
  const items = findTrajectories(root, TEMPLATE, recipe, roots);
  return { root, s, roots, items, batches: new Batches(s.ctx, () => roots) };
}

/** Live (not zombie) processes in these process groups: other test files run fake gmx at the same time. */
const alive = (pgids: number[]) => execFileSync('ps', ['-A', '-o', 'pgid=,stat='], { encoding: 'utf8' }).split('\n')
  .filter(l => { const [g, stat] = l.trim().split(/\s+/); return pgids.includes(Number(g)) && !!stat && !stat.startsWith('Z'); });

describe('the batch queue (T39)', () => {
  it('runs at most `concurrency` jobs at a time, and each match becomes its own run with its own record', async () => {
    const { s, items, batches } = await setup(40);
    let running = 0, most = 0;
    s.ctx.jobs.on('job', (j: Job) => { running = s.ctx.jobs.running().length; most = Math.max(most, running); void j; });
    const b = batches.start(recipe, '/', TEMPLATE, items, 2);
    const done = await batches.done(b.id);
    expect(most).toBe(2);
    expect(done.items.map(i => i.status)).toEqual(['started', 'started', 'started']);
    expect(done.items.map(i => s.ctx.jobs.get(i.job!)!.status)).toEqual(['done', 'done', 'done']);
    expect(new Set(done.items.map(i => (s.ctx.jobs.get(i.job!)!.meta as { record: string }).record)).size).toBe(3);
    await s.close();
  });

  it('a match that cannot start is refused with its reason; the others run', async () => {
    const { root, s, items, batches } = await setup(0);
    rmSync(join(root, 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.tpr'));
    const done = await batches.done(batches.start(recipe, root, TEMPLATE, items, 2).id);
    expect(done.items.map(i => i.status)).toEqual(['started', 'refused', 'started']);
    expect(done.items[1].error).toContain('07_md.tpr');
    expect(done.items.filter(i => i.job).map(i => s.ctx.jobs.get(i.job!)!.status)).toEqual(['done', 'done']);
    await s.close();
  });

  it('cancel all: the queued never start, the running are stopped, and no gmx process is left', async () => {
    const { s, items, batches } = await setup(300);
    const b = batches.start(recipe, '/', TEMPLATE, items, 2);
    await new Promise(r => setTimeout(r, 1200));
    batches.cancel(b.id);
    const done = await batches.done(b.id);
    expect(done.items.map(i => i.status)).toEqual(['started', 'started', 'cancelled']);
    expect(done.items.slice(0, 2).map(i => s.ctx.jobs.get(i.job!)!.status)).toEqual(['cancelled', 'cancelled']);
    expect(alive(done.items.slice(0, 2).map(i => s.ctx.jobs.get(i.job!)!.pid!))).toEqual([]);
    await s.close();
  });
});
