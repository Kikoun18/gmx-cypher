import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { batchSummary, matchTrajectory, sentSummary, vaultFields } from '../src/lib/batch';
import { recipeFromDraft } from '../src/lib/recipe';
import { findTrajectories } from '../server/batch';
import { apiServer, clusterCopy, tmp } from './helpers';

const TEMPLATE = 'hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc';

describe("path templates, matched with PMF Sequences' parsePath (T38)", () => {
  it.each<[string, string, unknown]>([
    ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.xtc', TEMPLATE, { fields: { col: 'ha', seq: 'WRWYCR', run: 'a' }, run: 1, problems: [] }],
    ['hmr+fast+6/pg/WRWYCR/9.multiwalker/3/07_md.xtc', '**/{column}/{seq}/9.multiwalker/{run}/07_md.xtc', { fields: { col: 'pg', seq: 'WRWYCR', run: 'c' }, run: 3, problems: [] }],
    ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.xtc', '{method}/{column}/{name}/{*}/{run}/07_md.xtc', { fields: { group: 'hmr+fast+6', col: 'ha', name: 'WRWYCR', run: 'a' }, run: 1, problems: [] }],
    ['hmr+fast+6/ha/WRWYCR/9.multiwalker/x/07_md.xtc', TEMPLATE, { fields: { col: 'ha', seq: 'WRWYCR' }, run: null, problems: ['run: x is not a run number 1–10'] }],
  ])('%s with %s', (rel, template, want) => expect(matchTrajectory(rel, template)).toEqual(want));

  it('no match: another file name, or a path of another shape', () => {
    expect(matchTrajectory('hmr+fast+6/ha/WRWYCR/notes.pdf', TEMPLATE)).toBeNull();
    expect(matchTrajectory('hmr+fast+6/ha/WRWYCR/1/07_md.xtc', TEMPLATE)).toBeNull();
  });

  it('the fields a match gives for names and the vault', () => {
    expect(vaultFields(matchTrajectory('hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.xtc', '{method}/{column}/{seq}/{*}/{run}/07_md.xtc')!)).toEqual({ name: 'WRWYCR', col: 'ha', group: 'hmr+fast+6', run: 2, time: '' });
  });
});

const recipe = recipeFromDraft({ options: {}, groups: [
  { role: 'reference', name: 'sulfur', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'name', value: 'S1' } }] },
  { role: 'selection', name: 'sodium', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'resname', value: 'Na' } }] }] }, 'ion pairs');

describe('the preview of a batch: every match, its inputs, its groups\' atoms, and problems', () => {
  it('finds the trajectories under a root, each with the run input and structure next to it', () => {
    const root = clusterCopy();
    const items = findTrajectories(root, TEMPLATE, recipe, [root]);
    expect(items.map(i => [i.rel, i.run, i.fields.col, i.counts, i.problems])).toEqual([
      ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.xtc', 1, 'ha', [6, 12], []],
      ['hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.xtc', 2, 'ha', [6, 12], []],
      ['hmr+fast+6/pg/WRWYCR/9.multiwalker/1/07_md.xtc', 1, 'pg', [6, 12], []],
    ]);
    expect(items[0]).toMatchObject({ trajectory: join(root, items[0].rel), runInput: join(root, 'hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.tpr'), structure: join(root, 'hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.gro') });
  });

  it('a match without a run input or structure is listed with its problem, not left out', async () => {
    const root = clusterCopy(), { rmSync } = await import('node:fs');
    rmSync(join(root, 'hmr+fast+6/pg/WRWYCR/9.multiwalker/1/07_md.tpr'));
    const items = findTrajectories(root, TEMPLATE, recipe, [root]);
    expect(items[2]).toMatchObject({ runInput: null, problems: ['no run input (.tpr) next to it'] });
  });

  it('only inside the allowed folders', () => {
    expect(() => findTrajectories(clusterCopy(), TEMPLATE, recipe, [tmp('elsewhere')])).toThrow('outside the allowed folders');
  });
});

describe('the walk under the root (review finding 11)', () => {
  it('follows linked folders inside the allowed ones, stops at loops, and names what it could not look into', async () => {
    const { mkdirSync, renameSync, symlinkSync } = await import('node:fs');
    const root = clusterCopy(), elsewhere = tmp('elsewhere'), pg = join(root, 'hmr+fast+6/pg');
    mkdirSync(join(root, 'store'));
    renameSync(pg, join(root, 'store/pg'));
    symlinkSync(join(root, 'store/pg'), pg);
    symlinkSync(join(root, 'hmr+fast+6'), join(root, 'hmr+fast+6/ha/loop'));
    symlinkSync(elsewhere, join(root, 'out'));
    symlinkSync(join(root, 'gone'), join(root, 'broken'));
    // The same runs again through a link whose path sorts first but doesn't match: they stay listed under the matching path, once.
    symlinkSync(join(root, 'hmr+fast+6'), join(root, 'a-copy'));
    const unread: string[] = [];
    const items = findTrajectories(root, TEMPLATE, recipe, [root], unread);
    expect(items.map(i => i.rel)).toEqual([
      'hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.xtc', 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.xtc', 'hmr+fast+6/pg/WRWYCR/9.multiwalker/1/07_md.xtc',
    ]);
    expect(unread.sort()).toEqual(['a-copy/ha/loop: a link back to a folder above it', 'broken: a link to nothing', 'hmr+fast+6/ha/loop: a link back to a folder above it', 'out: a link out of the allowed folders']);
  });
});

describe('batches over HTTP', () => {
  it('preview, run the chosen matches, then send all to the vault, file by file by the rule of R6', async () => {
    const { NodeBackend } = await import('../../app/scripts/node-backend');
    const { addColumn } = await import('../../app/src/lib/seq');
    const { newVault } = await import('../../app/test/helpers');
    const { apiServer } = await import('./helpers');
    const root = clusterCopy(), vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, pathPattern: '{method}/{column}/{seq}/{*}/{run}', pattern: '{method}_{column}_{seq}_{run}.xvg' } });
    await svc.flush();
    await vault.close();
    void addColumn;
    const s = await apiServer();
    await s.call('/api/config', { allow: [root], vault: vdir });
    const preview = await s.call('/api/batch/preview', { root, template: TEMPLATE, recipe });
    expect(preview.json.items.map((i: { rel: string }) => i.rel)).toHaveLength(3);
    const started = await s.call('/api/batches', { root, template: TEMPLATE, recipe, rels: preview.json.items.slice(0, 2).map((i: { rel: string }) => i.rel), concurrency: 2 });
    expect(started.json).toMatchObject({ recipe: 'ion pairs', concurrency: 2, items: [{ status: 'starting' }, { status: 'starting' }] });
    let b = started.json;
    for (let n = 0; n < 100 && !b.items.every((i: { job?: string; status: string }) => i.status === 'started' && i.job); n++) { await new Promise(r => setTimeout(r, 100)); b = (await s.call('/api/batches')).json[0]; }
    for (const i of b.items) for (let n = 0; n < 100 && s.ctx.jobs.get(i.job)!.status === 'running'; n++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 300));
    const project = (await s.call('/api/vault')).json.projects[0].id;
    const sent = await s.call('/api/batches/' + b.id + '/send', { project });
    expect(sent.json).toEqual([
      { rel: 'hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07_md.xtc', sent: expect.stringMatching(/\/_inbox\/hmr\+fast\+6_ha_WRWYCR_1\.xvg$/) },
      { rel: 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.xtc', sent: expect.stringMatching(/\/_inbox\/hmr\+fast\+6_ha_WRWYCR_2\.xvg$/) },
    ]);
    expect((await s.call('/api/batches/' + b.id + '/cancel', {})).json).toMatchObject({ cancelled: true });
    await s.close();
  });
});

describe('send all, item by item (review finding 10)', () => {
  it('an item that fails is listed with its reason, and the others are still sent', async () => {
    const { renameSync } = await import('node:fs');
    const { NodeBackend } = await import('../../app/scripts/node-backend');
    const { newVault } = await import('../../app/test/helpers');
    const { apiServer } = await import('./helpers');
    const { Batches, sendAll } = await import('../server/batch');
    const root = clusterCopy(), vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, pathPattern: '{method}/{column}/{seq}/{*}/{run}', pattern: '{method}_{column}_{seq}_{run}.xvg' } });
    await svc.flush();
    await vault.close();
    const s = await apiServer(), roots = [root];
    await s.call('/api/config', { allow: [root], vault: vdir });
    const batches = new Batches(s.ctx, () => roots);
    const b = await batches.done(batches.start(recipe, root, TEMPLATE, findTrajectories(root, TEMPLATE, recipe, roots).slice(0, 2), 2).id);
    await new Promise(r => setTimeout(r, 300));
    const first = s.ctx.jobs.get(b.items[0].job!)!.meta!.record as string;
    renameSync(first, first + '.away');
    const sent = await sendAll(s.ctx, b, (await s.call('/api/vault')).json.projects[0].id);
    expect(sent).toEqual([
      { rel: b.items[0].rel, skipped: expect.stringMatching(/^could not be sent: ENOENT/) },
      { rel: b.items[1].rel, sent: expect.stringMatching(/\/_inbox\/hmr\+fast\+6_ha_WRWYCR_2\.xvg$/) },
    ]);
    await s.close();
  });
});

describe('batch names and folders (review findings 4 and 5)', () => {
  const named = (template: string, outDir: string | null = null) => ({ ...recipe, template, outDir });

  it('the frozen v1 recipe still runs as a batch, as gmx rdf (section 1.5)', async () => {
    const v1 = JSON.parse(readFileSync(new URL('./fixtures/formats/recipe-v1.json', import.meta.url), 'utf8'));
    const root = clusterCopy(), s = await apiServer(), roots = [root];
    const { Batches } = await import('../server/batch');
    const batches = new Batches(s.ctx, () => roots);
    const b = await batches.done(batches.start(v1, root, TEMPLATE, findTrajectories(root, TEMPLATE, v1, roots).slice(0, 1), 1).id);
    const job = s.ctx.jobs.get(b.items[0].job!)!;
    expect(b.items[0].status).toBe('started');
    expect([job.kind, job.args[0], job.args.slice(-5)]).toEqual(['rdf', 'rdf', ['-ref', 'group 0', '-sel', 'group 1', 'group 2']]);
    await s.close();
  });

  it('a recipe of a command without groups is refused for a batch, in words (review finding 1)', async () => {
    const root = clusterCopy(), s = await apiServer();
    await s.call('/api/config', { allow: [root] });
    const energy = { ...recipe, name: 'energy terms', analysis: 'energy', groups: [], options: { b: '2' } };
    expect(await s.call('/api/batch/preview', { root, template: TEMPLATE, recipe: energy })).toEqual({ status: 400, json: { error: 'batches run recipes of commands with atom groups; energy terms is a gmx energy recipe' } });
    await s.close();
  });

  it("PMF Sequences' tokens in the output name take the path template's fields; a token the path doesn't give is a problem in the preview", () => {
    const root = clusterCopy();
    expect(findTrajectories(root, TEMPLATE, named('{analysis}_{column}_{seq}_{run}'), [root]).map(i => i.problems)).toEqual([[], [], []]);
    expect(findTrajectories(root, TEMPLATE, named('{analysis}_{time}'), [root])[0].problems).toEqual(['file name: {time} has no value here']);
  });

  it('a batch names its runs from its fields, and runs sharing one output folder each take a free name', async () => {
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { apiServer } = await import('./helpers');
    const { Batches } = await import('../server/batch');
    const root = clusterCopy(), out = join(root, 'out'), s = await apiServer(), roots = [root];
    mkdirSync(out);
    const batches = new Batches(s.ctx, () => roots);
    const byFields = await batches.done(batches.start(named('{analysis}_{column}_{seq}_{run}'), root, TEMPLATE, findTrajectories(root, TEMPLATE, named('{analysis}_{column}_{seq}_{run}'), roots), 2).id);
    expect(byFields.items.map(i => s.ctx.jobs.get(i.job!)!.meta!.stem)).toEqual(['rdf_ha_WRWYCR_1', 'rdf_ha_WRWYCR_2', 'rdf_pg_WRWYCR_1']);
    const shared = named('{analysis}_{trajectory}', out);
    const done = await batches.done(batches.start(shared, root, TEMPLATE, findTrajectories(root, TEMPLATE, shared, roots), 2).id);
    expect(done.items.map(i => i.status)).toEqual(['started', 'started', 'started']);
    expect(done.items.map(i => s.ctx.jobs.get(i.job!)!.meta!.stem).sort()).toEqual(['rdf_07_md', 'rdf_07_md (2)', 'rdf_07_md (3)']);
    await s.close();
  });

  it("a single run says where such a token's value comes from", async () => {
    const { join } = await import('node:path');
    const { apiServer } = await import('./helpers');
    const root = clusterCopy(), s = await apiServer(), d = join(root, 'hmr+fast+6/ha/WRWYCR/9.multiwalker/1');
    await s.call('/api/config', { allow: [root] });
    const r = await s.call('/api/plan', { inputs: { trajectory: join(d, '07_md.xtc'), runInput: join(d, '07_md.tpr') }, groups: recipe.groups, options: {}, template: '{analysis}_{column}' });
    expect(r.json).toEqual({ error: "{column} has no value here: in a single run only {analysis} and {trajectory} do; a batch's path template gives the others" });
    await s.close();
  });
});

describe('a batch checks each structure against its run input (review finding 1)', () => {
  it('the preview names a structure of another size, and its match is not chosen', async () => {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { apiServer } = await import('./helpers');
    const root = clusterCopy(), gro = join(root, 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/07_md.gro'), s = await apiServer();
    // nvt.gro without its last 10 waters: 3212 atoms against the run input's 3242, and the recipe's groups still found.
    const lines = readFileSync(gro, 'utf8').split('\n'), atoms = lines.slice(2, 2 + 3212);
    writeFileSync(gro, [lines[0], String(atoms.length).padStart(5), ...atoms, lines[2 + 3242], ''].join('\n'));
    await s.call('/api/config', { allow: [root] });
    const preview = await s.call('/api/batch/preview', { root, template: TEMPLATE, recipe });
    expect(preview.json.items.map((i: { problems: string[] }) => i.problems)).toEqual([[], ['the structure has 3212 atoms, the run input 3242: its groups would be other atoms'], []]);
    await s.close();
  });
});

describe("a batch's progress in words, for its live region (review finding 9)", () => {
  const jobs: Record<string, string> = { a: 'done', b: 'running', c: 'failed', d: 'interrupted' };
  it('done first, then each other state that has items', () => {
    expect(batchSummary([{ status: 'started', job: 'a' }, { status: 'started', job: 'b' }, { status: 'starting' }, { status: 'queued' }], id => jobs[id])).toBe('1 of 4 done · 2 running · 1 waiting');
    expect(batchSummary([{ status: 'started', job: 'a' }, { status: 'started', job: 'c' }, { status: 'started', job: 'd' }, { status: 'refused' }, { status: 'cancelled' }], id => jobs[id]))
      .toBe('1 of 5 done · 1 failed · 1 interrupted · 1 refused · 1 cancelled');
  });

  it('what send all did', () => {
    expect(sentSummary([{ sent: '/v/p/_inbox/a.xvg' }, { skipped: 'no run' }, { sent: '/v/p/_inbox/b.xvg' }])).toBe('2 sent to the vault · 1 not sent, listed above');
    expect(sentSummary([{ sent: '/v/p/_inbox/a.xvg' }])).toBe('1 sent to the vault');
  });
});
