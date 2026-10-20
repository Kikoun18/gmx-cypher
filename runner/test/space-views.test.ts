// Saved compare views in the space (R14b): a view names its records on disk by their path relative to their allowed
// folder, wherever it names them (its sources, its view's keys, its labels), and finds them again under the allowed
// folders of whichever gmx-cypher opens it; a view is written once, never replaced.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { newVault } from '../../matrix/test/helpers';
import { portableView, resolvedView, spacePaths, type SavedView } from '../src/lib/space';
import { copyRecord, listRecords, listViews, readRecordCopy, readView, saveView } from '../server/space';
import { apiServer, RUNNER, tmp } from './helpers';

const view = (sources: SavedView['sources'], v: Record<string, unknown> = {}, labels: SavedView['labels'] = {}): SavedView =>
  ({ format: 'gmx-cypher view', version: 1, name: 'two runs', saved: '2026-10-20T12:00:00.000Z', by: 'gmx-cypher 0.1.0', sources, view: v, labels });

describe('a saved view names its records relative to their allowed folder (R14b, T158)', () => {
  const A = '/sims/WRWYCR/ha/rdf/rdf_H.run.json', B = '/data/x/rdf/rdf_S.run.json';
  const full = view(
    [{ kind: 'job', id: 'jmk2abcd1x9z' }, { kind: 'record', path: A }, { kind: 'record', path: B }, { kind: 'vault', project: 'p1', row: 'r1', rdf: 'a1' }],
    { hidden: ['record:' + B], focus: 'record:' + A, selected: { ['record:' + A]: ['water'] }, pins: { ['record:' + A]: { marks: [] } }, morphed: [{ ids: ['record:' + A, 'record:' + B], off: [] }] },
    { ['record:' + A]: { 'O5...S': 'ether O' }, 'job:jmk2abcd1x9z': { water: 'W' } },
  );

  it('table: every place a record\'s path is named, and nothing else', () => {
    const p = portableView(full, ['/sims', '/data']);
    expect(p.sources).toEqual([{ kind: 'job', id: 'jmk2abcd1x9z' }, { kind: 'record', path: 'WRWYCR/ha/rdf/rdf_H.run.json' }, { kind: 'record', path: 'x/rdf/rdf_S.run.json' }, { kind: 'vault', project: 'p1', row: 'r1', rdf: 'a1' }]);
    expect(p.view).toEqual({ hidden: ['record:x/rdf/rdf_S.run.json'], focus: 'record:WRWYCR/ha/rdf/rdf_H.run.json', selected: { 'record:WRWYCR/ha/rdf/rdf_H.run.json': ['water'] }, pins: { 'record:WRWYCR/ha/rdf/rdf_H.run.json': { marks: [] } }, morphed: [{ ids: ['record:WRWYCR/ha/rdf/rdf_H.run.json', 'record:x/rdf/rdf_S.run.json'], off: [] }] });
    expect(p.labels).toEqual({ 'record:WRWYCR/ha/rdf/rdf_H.run.json': { 'O5...S': 'ether O' }, 'job:jmk2abcd1x9z': { water: 'W' } });
    expect(JSON.stringify(p)).not.toMatch(/\/sims|\/data/);
  });

  it('the longest allowed folder wins; a record outside them is refused', () => {
    expect(portableView(view([{ kind: 'record', path: A }]), ['/sims', '/sims/WRWYCR']).sources).toEqual([{ kind: 'record', path: 'ha/rdf/rdf_H.run.json' }]);
    expect(() => portableView(view([{ kind: 'record', path: '/home/me/r.run.json' }]), ['/sims'])).toThrow('/home/me/r.run.json is outside the allowed folders');
  });

  it('opened again: each record under the first allowed folder that has it; one found nowhere is said', () => {
    const p = portableView(full, ['/sims', '/data']), has = new Set(['/mnt/other/WRWYCR/ha/rdf/rdf_H.run.json']);
    const r = resolvedView(p, ['/mnt/sims', '/mnt/other'], f => has.has(f));
    expect(r.view.sources[1]).toEqual({ kind: 'record', path: '/mnt/other/WRWYCR/ha/rdf/rdf_H.run.json' });
    expect(r.view.view.focus).toBe('record:/mnt/other/WRWYCR/ha/rdf/rdf_H.run.json');
    expect(r.view.labels).toHaveProperty(['record:/mnt/other/WRWYCR/ha/rdf/rdf_H.run.json']);
    expect(r.missing).toEqual(['x/rdf/rdf_S.run.json']);
  });
});

describe('views in the space: listed, read and saved once (R14b)', () => {
  it('saves exclusively, lists by name, reads with the records found again; never replaces one', () => {
    const vault = tmp('vault'), sims = tmp('sims'), rec = join(sims, 'a/rdf/rdf_H.run.json');
    mkdirSync(join(sims, 'a/rdf'), { recursive: true }); writeFileSync(rec, '{}');
    const body = { name: 'two runs', sources: [{ kind: 'record' as const, path: rec }], view: { focus: 'record:' + rec }, labels: {} };
    expect(saveView(vault, 'p1', body, [sims], 'gmx-cypher 0.1.0')).toMatchObject({ name: 'two runs' });
    const onDisk = JSON.parse(readFileSync(join(vault, spacePaths.view('p1', 'two runs')), 'utf8'));
    expect(onDisk).toMatchObject({ format: 'gmx-cypher view', version: 1, name: 'two runs', by: 'gmx-cypher 0.1.0', sources: [{ kind: 'record', path: 'a/rdf/rdf_H.run.json' }] });
    expect(() => saveView(vault, 'p1', { ...body, view: {} }, [sims], 'x')).toThrow('a view named "two runs" exists: nothing was replaced; choose another name');
    expect(readFileSync(join(vault, spacePaths.view('p1', 'two runs')), 'utf8')).toBe(JSON.stringify(onDisk, null, 2) + '\n');
    expect(listViews(vault, 'p1')).toEqual([{ name: 'two runs', saved: onDisk.saved, sources: 1 }]);
    expect(listViews(vault, 'p2')).toEqual([]);
    expect(readView(vault, 'p1', 'two runs', [sims])).toMatchObject({ view: { sources: [{ kind: 'record', path: rec }], view: { focus: 'record:' + rec } }, missing: [] });
    expect(() => readView(vault, 'p1', 'none', [sims])).toThrow('no view named "none"');
    expect(() => saveView(vault, 'p1', { ...body, name: '../x' }, [sims], 'x')).toThrow('not a plain name');
  });

  it('the record copies, listed newest first and read by the sent file\'s SHA-256 (R13, R14c)', () => {
    const vault = tmp('vault'), rec = JSON.parse(readFileSync(RUNNER + 'test/fixtures/decypher/rdf_o111_Methionine_H.run.json', 'utf8'))
    const sha = rec.outputs.find((o: { kind: string }) => o.kind === 'xvg').sha256
    copyRecord(vault, sha, rec, [], '/home/me', 'gmx-cypher 0.1.0')
    expect(listRecords(vault)).toEqual([{ sha256: sha, name: 'rdf_o111_Methionine_H', analysis: 'rdf', ended: rec.ended }])
    expect(readRecordCopy(vault, sha)).toMatchObject({ groups: rec.groups, env: {}, copy: { env: 'names only' } })
    expect(() => readRecordCopy(vault, 'b'.repeat(64))).toThrow('no record copy of bbbbbbbbbbbb… in the vault')
    expect(() => readRecordCopy(vault, '../x')).toThrow('not a SHA-256')
    expect(listRecords(tmp('empty'))).toEqual([])
  })

  it('the routes: no project is said in words; with one, save, list and open', async () => {
    const s = await apiServer();
    try {
      expect(await s.call('/api/space/views')).toEqual({ status: 409, json: { error: 'connect a project in settings to save compare views in the vault' } });
      const dir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(dir));
      const pid = (await vault.listProjects())[0].id;
      await svc.flush(); await vault.close();
      s.ctx.config.vault = dir; s.ctx.config.project = 'nowhere';
      expect((await s.call('/api/space/views')).status).toBe(404);
      s.ctx.config.project = pid;
      const saved = await s.call('/api/space/views', { name: 'mine', sources: [{ kind: 'job', id: 'jmk2abcd1x9z' }], view: { mode: 'one' }, labels: {} });
      expect(saved.status).toBe(200);
      expect((await s.call<{ views: { name: string }[] }>('/api/space/views')).json.views.map(v => v.name)).toEqual(['mine']);
      expect((await s.call('/api/space/views', { name: 'mine', sources: [], view: {}, labels: {} })).status).toBe(409);
      const one = await s.call<{ view: SavedView }>('/api/space/views/' + encodeURIComponent('mine'));
      expect(one.json.view).toMatchObject({ name: 'mine', sources: [{ kind: 'job', id: 'jmk2abcd1x9z' }], view: { mode: 'one' } });
    } finally { await s.close() }
  });
});
