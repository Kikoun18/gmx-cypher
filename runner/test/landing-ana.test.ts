import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { addColumn } from '../../matrix/src/lib/seq';
import { newVault } from '../../matrix/test/helpers';
import { landingFor, listProjects, openVault } from '../server/vault';
import { tmp } from './helpers';

// The name a sent file gets from the project's pattern names its analysis by what the file is, not as RDF
// (review finding 3): the real gmx energy output, sent with {analysis} in the pattern, must land as Energy.
describe('send to vault: {analysis} is the file\'s own type', () => {
  it.each([
    ['gmx-2025.4/energy-potential.xvg', 'energy_rerun.xvg', 'energy'],
    ['gmx-2025.4/rdf_nvt.xvg', 'rdf_nvt.xvg', 'rdf'],
  ])('%s → {analysis} = %s', async (fixture, name, k) => {
    const vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
    const c = addColumn(svc.store, 'SO4', 'sulfate');
    svc.commit({ ...c.store, settings: { ...c.store.settings, pattern: '{analysis}_{method}_{column}_{seq}_t{time}.xvg' } });
    await svc.flush();
    await vault.close();
    const v = await openVault(vdir), pid = (await listProjects(v))[0].id;
    const text = readFileSync(new URL('./fixtures/' + fixture, import.meta.url), 'utf8');
    const l = await landingFor(v, pid, { name, text, lastTime: 20 }, { fields: { name: 'NA2SO4', col: 'SO4', group: 'hmr', run: 1, time: '20' } });
    expect(l.name).toBe(k + '_hmr_SO4_NA2SO4_t20.xvg');
    expect(l.preview.type.k).toBe(k);
  });
});
