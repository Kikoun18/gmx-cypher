import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { fixture, newVault, rdfFixture, withAnalysis, withPmf } from '../../matrix/test/helpers';
import { listProjects, openVault, projectSummary, readProject, ReadOnlyBackend } from '../server/vault';
import { APP, tmp } from './helpers';

/** Every file and folder under a path with its size and mtime: equal before and after means nothing was written. */
function listing(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = join(d, e.name), s = statSync(p); out.push(p.slice(root.length) + ' ' + s.size + ' ' + s.mtimeMs); if (e.isDirectory()) walk(p); } };
  walk(root);
  return out;
}

/** A vault made by the Matrix itself (schema 4, batch 3): WRWYCR with a PMF run and an RDF on HA. */
async function madeVault() {
  const dir = tmp('vault');
  const { svc, vault } = await newVault(new NodeBackend(dir));
  const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'hmrfast6_ha_a_t200000.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg'), group: 'hmr+fast+6' });
  const r = withAnalysis(a.store, { name: 'WRWYCR', col: 'ha', type: 'rdf', file: 'rdf.xvg', bytes: rdfFixture, group: 'hmr+fast+6' });
  svc.commit(r.store, new Map([...a.uploads, ...r.uploads]));
  await svc.flush();
  // The Matrix verifies the project in the background and may write its index then: wait, so the listing below is final.
  await svc.verified;
  await vault.close();
  return dir;
}

describe('the vault, read-only with the Matrix\'s own code (T32)', () => {
  it('a schema-4 vault: projects, columns, rows with runs and analyses, the patterns; nothing written', async () => {
    const dir = await madeVault(), before = listing(dir);
    const v = await openVault(dir);
    expect(v).toMatchObject({ schema: 4, compat: 'ok' });
    const projects = await listProjects(v);
    expect(projects.map(p => p.name)).toEqual(['Sugar PMFs']);
    const s = projectSummary(await readProject(v, projects[0].id));
    expect(s.columns.map(c => c.k)).toContain('ha');
    expect(s.rows).toEqual([expect.objectContaining({ name: 'WRWYCR', group: 'hmr+fast+6', runs: { ha: ['a'] }, analyses: { ha: [{ type: 'rdf', slot: 'a' }] } })]);
    expect(s.settings).toMatchObject({ pattern: '{method}_{column}_{seq}_t{time}.xvg', pathPattern: '' });
    expect(s.settings.analyses.find(a => a.k === 'rdf')).toMatchObject({ yCols: '2' });
    expect(listing(dir)).toEqual(before);
  });

  it('the schema-1, 2 and 3 fixtures (copies), which the Matrix would upgrade; nothing written', async () => {
    for (const [name, rows] of [['schema-1-vault', ['WRWYCR', 'KRWYCR']], ['schema-2-vault', ['WRWYCR', 'KRWYCR']], ['schema-3-vault', ['WRWYCR', 'KRWYCR']]] as const) {
      const dir = tmp(name);
      cpSync(APP + 'test/fixtures/formats/' + name, dir, { recursive: true });
      const before = listing(dir), v = await openVault(dir);
      expect(v.compat).toBe('upgrade');
      const [p] = await listProjects(v);
      const s = projectSummary(await readProject(v, p.id));
      expect(s.rows.map(r => r.name)).toEqual(rows);
      expect(s.rows[0].runs.ha).toEqual(['a', 'b']);
      expect(listing(dir)).toEqual(before);
    }
  });

  it('refuses a newer, a foreign, and a missing vault, in words', async () => {
    const dir = await madeVault(), m = join(dir, '.matrix/manifest.json'), manifest = JSON.parse(readFileSync(m, 'utf8'));
    writeFileSync(m, JSON.stringify({ ...manifest, schemaVersion: 5 }));
    await expect(openVault(dir)).rejects.toThrow('made by a newer version of the Matrix (schema 5); gmx-cypher reads schemas 1–4');
    writeFileSync(m, JSON.stringify({ ...manifest, format: 'other' }));
    await expect(openVault(dir)).rejects.toThrow('not a Matrix vault');
    await expect(openVault(tmp('empty'))).rejects.toThrow('not a Matrix vault (no .matrix/manifest.json)');
  });

  it('every write throws: the reader cannot change the vault', async () => {
    const b = new ReadOnlyBackend(new NodeBackend(tmp('ro')));
    for (const w of [() => b.writeText('a.txt', 'x'), () => b.writeBytes('a', new Uint8Array(1)), () => b.mkdir('d'), () => b.move('a', 'b'), () => b.remove('a')])
      await expect(w()).rejects.toThrow('gmx-cypher never writes to the vault');
  });
});

describe('the vault over HTTP', () => {
  it('is set once in the config (checked), then lists projects and a project summary', async () => {
    const { apiServer } = await import('./helpers');
    const dir = await madeVault(), s = await apiServer();
    expect((await s.call('/api/vault')).json).toEqual({ path: null, project: null });
    expect((await s.call('/api/config', { vault: tmp('not-a-vault') })).json.error).toContain('is not a Matrix vault');
    expect((await s.call('/api/config', { vault: dir })).json.config.vault).toBe(dir);
    const v = await s.call('/api/vault');
    expect(v.json).toMatchObject({ path: dir, schema: 4, compat: 'ok', projects: [{ name: 'Sugar PMFs' }] });
    const p = await s.call('/api/vault/project?id=' + v.json.projects[0].id);
    expect(p.json.rows[0]).toMatchObject({ name: 'WRWYCR', runs: { ha: ['a'] } });
    expect((await s.call('/api/vault/project?id=nope')).status).toBe(404);
    expect((await s.call('/api/config', { vault: null })).json.config.vault).toBeNull();
    await s.close();
  });
});
