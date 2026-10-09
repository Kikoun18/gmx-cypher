import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';

const fixture = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

describe('gmx rdf -h as an option list (T22)', () => {
  const opts = parseHelp(fixture('gmx-2025.4/rdf-h.txt'));
  const by = Object.fromEntries(opts.map(o => [o.flag, o]));

  it('lists every option in the order gmx prints them', () => {
    expect(opts.map(o => o.flag)).toEqual(['f', 's', 'n', 'o', 'cn', 'b', 'e', 'dt', 'tu', 'fgroup', 'xvg', 'rmpbc', 'pbc', 'sf', 'selrpos', 'seltype', 'bin', 'norm', 'xy', 'excl', 'cut', 'rmax', 'surf', 'ref', 'sel']);
  });

  it('reads types, defaults, enum values and the help line', () => {
    expect(by.f).toEqual({ flag: 'f', section: 'input', type: 'file', default: 'traj.xtc', optional: true, help: 'Input trajectory or single configuration: xtc trr cpt gro g96 pdb tng' });
    expect(by.o).toMatchObject({ section: 'output', type: 'file', default: 'rdf.xvg', optional: false });
    expect(by.b).toMatchObject({ section: 'other', type: 'time', default: '0', help: 'First frame (ps) to read from trajectory' });
    expect(by.bin).toMatchObject({ type: 'real', default: '0.002', help: 'Bin width (nm)' });
    expect(by.rmpbc).toMatchObject({ type: 'bool', default: true });
    expect(by.xy).toMatchObject({ type: 'bool', default: false });
    expect(by.norm).toMatchObject({ type: 'enum', default: 'rdf', values: ['rdf', 'number_density', 'none'], help: 'Normalization: rdf, number_density, none' });
    expect(by.selrpos.values).toHaveLength(17);
    expect(by.selrpos.values!.at(-1)).toBe('dyn_mol_cog');
    expect(by.surf).toMatchObject({ type: 'enum', default: 'no', values: ['no', 'mol', 'res'] });
    expect(by.fgroup).toMatchObject({ type: 'selection', default: null });
    expect(by.sf).toMatchObject({ section: 'other', type: 'file', default: null });
  });

  it('2023.3 lists the same options with the same defaults', () => {
    expect(parseHelp(fixture('gmx-2023.3/rdf-h.txt'))).toEqual(opts);
  });
});

describe('GET /api/help/rdf', () => {
  it("serves the configured gmx's options, and refuses without a working gmx", async () => {
    const { apiServer } = await import('./helpers');
    const s = await apiServer();
    const r = await s.call('/api/help/rdf');
    expect(r.json.options.find((o: { flag: string }) => o.flag === 'bin')).toMatchObject({ type: 'real', default: '0.002' });
    await s.close();
    const off = await apiServer({ gmx: { ok: false, name: 'gmx', error: 'not found' } });
    expect(await off.call('/api/help/rdf')).toEqual({ status: 409, json: { error: 'no working gmx' } });
    await off.close();
  });
});
