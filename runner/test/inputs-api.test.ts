import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiServer, tmp } from './helpers';

function sim() {
  const root = tmp('sim'), nvt = join(root, '07_md');
  mkdirSync(nvt);
  for (const f of ['07_md.xtc', '07_md.tpr', '07_md.gro']) writeFileSync(join(nvt, f), f);
  writeFileSync(join(root, 'index.ndx'), '[ a ]\n1\n');
  return { root, nvt };
}

describe('inputs over HTTP', () => {
  it('lists only inside the allowed folders, and sets them only to existing folders', async () => {
    const { root, nvt } = sim(), s = await apiServer();
    expect((await s.call('/api/ls?path=' + encodeURIComponent(nvt))).status).toBe(403);
    expect((await s.call('/api/config', { allow: ['/no/such/folder'] })).status).toBe(400);
    const c = await s.call('/api/config', { allow: [root] });
    expect(c.json.config.allow).toEqual([root]);
    const roots = await s.call('/api/ls');
    expect(roots.json.roots).toEqual([root, join(s.ctx.home, 'uploads')]);
    const l = await s.call('/api/ls?path=' + encodeURIComponent(nvt));
    expect(l.json.entries.map((e: { name: string }) => e.name)).toEqual(['07_md.gro', '07_md.tpr', '07_md.xtc']);
    expect((await s.call('/api/ls?path=' + encodeURIComponent(join(nvt, '..', '..')))).status).toBe(403);
    await s.close();
  });

  it('suggests the rest from a picked trajectory, as absolute paths with reasons', async () => {
    const { root, nvt } = sim(), s = await apiServer();
    await s.call('/api/config', { allow: [root] });
    const r = await s.call('/api/suggest?trajectory=' + encodeURIComponent(join(nvt, '07_md.xtc')));
    expect(r.json).toEqual({
      trajectory: { path: join(nvt, '07_md.xtc'), why: 'picked' },
      runInput: { path: join(nvt, '07_md.tpr'), why: 'same name as the trajectory' },
      structure: { path: join(nvt, '07_md.gro'), why: 'same name as the trajectory' },
      index: { path: join(root, 'index.ndx'), why: 'index.ndx in the folder above' },
    });
    await s.close();
  });

  it('stores an upload byte for byte, and lets it be used like a picked file', async () => {
    const s = await apiServer();
    const bytes = new Uint8Array([1, 2, 3, 0, 255]);
    const r = await s.call('/api/upload?name=' + encodeURIComponent('nvt.tpr'), undefined, new Blob([bytes]));
    expect(r.status).toBe(200);
    expect(new Uint8Array(readFileSync(r.json.path))).toEqual(bytes);
    const l = await s.call('/api/ls?path=' + encodeURIComponent(join(r.json.path, '..')));
    expect(l.json.entries[0]).toMatchObject({ name: 'nvt.tpr', role: 'run input', size: 5 });
    await s.close();
  });
});

describe('the input check over HTTP', () => {
  it('answers with the counts and the problems', async () => {
    const { root, nvt } = sim(), s = await apiServer();
    await s.call('/api/config', { allow: [root] });
    const r = await s.call('/api/check', { inputs: { trajectory: join(nvt, '07_md.xtc'), runInput: join(nvt, '07_md.tpr'), structure: join(nvt, '07_md.gro') } });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(false);
    expect(r.json.problems).toEqual(['the structure: no atoms could be read from it (a .gro or .pdb?)']);
    expect(r.json.counts).toEqual({ structure: null, runInput: 3242, trajectory: 3242 });
    await s.close();
  });
});
