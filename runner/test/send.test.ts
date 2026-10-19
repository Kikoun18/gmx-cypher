import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { addColumn } from '../../matrix/src/lib/seq';
import { scanProject } from '../../matrix/src/lib/storage/index';
import { Vault } from '../../matrix/src/lib/storage/vault';
import { newVault } from '../../matrix/test/helpers';
import { startRun } from '../server/runs';
import { apiServer, RUNNER, tmp } from './helpers';

/** Files with size and mtime, and folders, under a root. */
function files(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { out.set(p.slice(root.length) + '/', 'dir'); walk(p); } else { const s = statSync(p); out.set(p.slice(root.length), s.size + ' ' + s.mtimeMs); } } };
  walk(root);
  return out;
}

async function setup() {
  const vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
  const c = addColumn(svc.store, 'SO4', 'sulfate');
  svc.commit({ ...c.store, settings: { ...c.store.settings, pathPattern: '{method}/{column}/{name}/{*}/{run}', pattern: '{method}_{column}_{seq}_t{time}.xvg' } });
  await svc.flush();
  await vault.close();
  const root = tmp('sim'), dir = join(root, 'hmr+fast+6/so4/NA2SO4/9.multiwalker/1');
  mkdirSync(dir, { recursive: true });
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
  const s = await apiServer();
  await s.call('/api/config', { allow: [root], vault: vdir });
  const steps = (k: 'name' | 'resname', value: string) => [{ op: 'add' as const, rule: { kind: k, value } }];
  const run = await startRun(s.ctx, { inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, options: { cn: true },
    groups: [{ role: 'reference', name: 'sulfur', tone: 'coral', steps: steps('name', 'S1') }, { role: 'selection', name: 'sodium', tone: 'sky', steps: steps('resname', 'Na') }] }, [root]);
  await run.record;
  const project = (await s.call('/api/vault')).json.projects[0];
  return { s, vdir, dir, job: run.job, project };
}

describe('send to the vault inbox (T35, T36)', () => {
  it('copies only the g(r) file into <project>/_inbox/, and nothing else in the vault changes', async () => {
    const { s, vdir, dir, job, project } = await setup(), before = files(vdir);
    const r = await s.call('/api/send', { job: job.id, project: project.id, name: 'hmr+fast+6_SO4_NA2SO4_t10.xvg' });
    expect(r.json).toMatchObject({ path: project.dir + '/_inbox/hmr+fast+6_SO4_NA2SO4_t10.xvg', name: 'hmr+fast+6_SO4_NA2SO4_t10.xvg', renamed: false });
    expect(r.json.next).toEqual([
      'open ' + project.name + ' in the Matrix',
      'Vault → Check folder now (or reload the page): the Matrix rescans the folder only then',
      'Vault → Untracked files → attach hmr+fast+6_SO4_NA2SO4_t10.xvg: the upload dialog shows where it lands',
    ]);
    const after = files(vdir), added = [...after.keys()].filter(k => !before.has(k)).sort();
    const sha = createHash('sha256').update(readFileSync(join(dir, 'rdf/rdf_nvt.xvg'))).digest('hex');
    // The inbox, and gmx-cypher's own space with the job's record (R14a): nothing else.
    expect(added).toEqual(['/' + project.dir + '/_inbox/', '/' + project.dir + '/_inbox/hmr+fast+6_SO4_NA2SO4_t10.xvg', '/gmx-cypher/', '/gmx-cypher/README.md', '/gmx-cypher/records/', '/gmx-cypher/records/' + sha + '.run.json', '/gmx-cypher/space.json'].sort());
    expect(r.json.record).toBe('gmx-cypher/records/' + sha + '.run.json');
    for (const [k, v] of before) if (!k.endsWith('/')) expect(after.get(k)).toBe(v);
    expect(readFileSync(join(vdir, r.json.path))).toEqual(readFileSync(join(dir, 'rdf/rdf_nvt.xvg')));
    await s.close();
  });

  it('a name already in the inbox gets " (2)"; the first file is untouched', async () => {
    const { s, vdir, job, project } = await setup();
    const one = await s.call('/api/send', { job: job.id, project: project.id, name: 'x.xvg' });
    const two = await s.call('/api/send', { job: job.id, project: project.id, name: 'X.xvg' });
    expect([one.json.name, two.json.name, two.json.renamed]).toEqual(['x.xvg', 'X (2).xvg', true]);
    expect(readdirSync(join(vdir, project.dir, '_inbox')).sort()).toEqual(['X (2).xvg', 'x.xvg']);
    await s.close();
  });

  it("The Matrix's own scanProject lists it, and a ProjectService (on a copy) reports it as untracked", async () => {
    const { s, vdir, job, project } = await setup();
    const r = await s.call('/api/send', { job: job.id, project: project.id, name: 'hmr+fast+6_SO4_NA2SO4_t10.xvg' });
    expect(Object.keys((await scanProject(new NodeBackend(vdir), project.dir)).files)).toContain(r.json.path);
    const copy = tmp('vault-copy');
    cpSync(vdir, copy, { recursive: true });
    const vault = await Vault.open(new NodeBackend(copy)), svc = await vault.openProject(project.id);
    await svc.verified;
    await svc.verify();
    expect(svc.report.untracked).toContain(r.json.path);
    await vault.close();
    await s.close();
  });

  it('refuses a name that is not a plain file name, and a run that is not done', async () => {
    const { s, job, project } = await setup();
    expect((await s.call('/api/send', { job: job.id, project: project.id, name: '../x.xvg' })).json).toEqual({ error: '../x.xvg is not a plain file name (as the Matrix would save it: _x.xvg)' });
    expect((await s.call('/api/send', { job: 'nope', project: project.id, name: 'x.xvg' })).status).toBe(404);
    await s.close();
  });
});

describe("the job's record beside the sent result (R14a, T158)", () => {
  it('is copied once into gmx-cypher/records/<sha256>.run.json, naming no folder of this machine', async () => {
    const { s, vdir, dir, job, project } = await setup();
    const r = await s.call('/api/send', { job: job.id, project: project.id, name: 'x.xvg' });
    const copy = JSON.parse(readFileSync(join(vdir, r.json.record), 'utf8')), own = JSON.parse(readFileSync(join(dir, 'rdf/rdf_nvt.run.json'), 'utf8'));
    expect(copy).toMatchObject({ job: job.id, status: 'done', complete: true, env: {}, copy: { paths: 'relative to their allowed folder' } });
    expect(copy.groups).toEqual(own.groups);
    expect(copy.inputs.trajectory.path).toBe('hmr+fast+6/so4/NA2SO4/9.multiwalker/1/nvt.xtc');
    expect(JSON.stringify(copy)).not.toContain(dir);
    // Sent again under another name: the same result, the same record, left as it was.
    const again = await s.call('/api/send', { job: job.id, project: project.id, name: 'y.xvg' });
    expect(again.json.record).toBe(r.json.record);
    expect(readdirSync(join(vdir, 'gmx-cypher/records'))).toHaveLength(1);
    await s.close();
  });
});

describe('the link to the project in the Matrix (T36)', () => {
  it('is offered when its address is set (http or https only)', async () => {
    const { s, job, project } = await setup();
    expect((await s.call('/api/config', { pmfUrl: 'javascript:alert(1)' })).json).toEqual({ error: 'the Matrix address must start with http:// or https://' });
    await s.call('/api/config', { pmfUrl: 'http://localhost:5173/' });
    expect((await s.call('/api/send', { job: job.id, project: project.id, name: 'x.xvg' })).json.link).toBe('http://localhost:5173/#/p/' + project.id + '/all');
    await s.close();
  });
});

describe('the connected project (R14b, T158)', () => {
  it('is one project of the vault, set in settings: shown with the vault, refused when it is not there, forgotten with the vault', async () => {
    const { s, vdir, project } = await setup();
    expect((await s.call('/api/vault')).json.project).toBeNull();
    expect((await s.call('/api/config', { project: project.id })).json.config.project).toBe(project.id);
    expect((await s.call('/api/vault')).json.project).toBe(project.id);
    expect((await s.call('/api/config', { project: 'nope123' })).json).toEqual({ error: 'no project nope123 in the vault' });
    expect((await s.call('/api/config', { project: '../x' })).json).toEqual({ error: 'no project ../x in the vault' });
    expect(JSON.parse(readFileSync(join(s.ctx.home, 'config.json'), 'utf8')).project).toBe(project.id);
    // Another vault (or none): the project was the old vault's, so it is no longer connected.
    expect((await s.call('/api/config', { vault: null })).json.config.project).toBeNull();
    expect((await s.call('/api/config', { project: project.id })).json).toEqual({ error: 'set a vault first: a project is one of its projects' });
    await s.call('/api/config', { vault: vdir, project: project.id });
    expect((await s.call('/api/config', { project: null })).json.config.project).toBeNull();
    await s.close();
  });
});

