import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atomTable, fromRanges } from '../src/lib/atoms';
import { groupAtoms } from '../src/lib/groups';
import { parseHelp } from '../src/lib/gmxText';
import { writeNdx } from '../src/lib/ndx';
import { rdfArgs, rdfIo } from '../src/lib/rdf';
import { buildRecord, recipeFromRecord, recordProblems, type RecordParts } from '../src/lib/record';

const help = parseHelp(readFileSync(new URL('./fixtures/gmx-2025.4/rdf-h.txt', import.meta.url), 'utf8'));
const atoms = atomTable(readFileSync(new URL('./fixtures/nvt/nvt.gro', import.meta.url), 'utf8'), 'gro');
const groups = [
  { role: 'reference' as const, name: 'sulfur', tone: 'coral' as const, steps: [{ op: 'add' as const, rule: { kind: 'name' as const, value: 'S1' } }] },
  { role: 'selection' as const, name: 'water_O', tone: 'sky' as const, steps: [{ op: 'add' as const, rule: { kind: 'name' as const, value: 'OW1', resn: 'SOL' } }] },
];
const options = { rmax: '1.5', cn: true };
const inputs = { trajectory: '/sim/nvt/nvt.xtc', runInput: '/sim/nvt/nvt.tpr', structure: '/sim/nvt/nvt.gro' };
const plan = rdfIo(inputs, '/sim/nvt/rdf', 'rdf_nvt');
const parts: RecordParts = {
  runner: '0.1.0', gmx: { path: '/opt/gromacs/bin/gmx', version: '2025.4' }, env: { GMXLIB: '/opt/gromacs/share/top' },
  command: { cwd: plan.cwd, file: '/opt/gromacs/bin/gmx', args: rdfArgs({ options, selections: 1 }, plan.io, help) },
  inputs: { trajectory: { path: inputs.trajectory, size: 228704, mtime: '2026-10-08T21:27:00.000Z' }, runInput: { path: inputs.runInput, size: 86516, mtime: '2026-10-08T21:27:00.000Z', sha256: 'a'.repeat(64) }, structure: { path: inputs.structure, size: 223752, mtime: '2026-10-08T21:27:00.000Z', sha256: 'b'.repeat(64) } },
  groups, atoms, sizes: [6, 800], options, help, template: '{analysis}_{trajectory}', outDir: '/sim/nvt/rdf',
  job: { id: 'jabc', status: 'done', started: '2026-10-08T22:00:00.000Z', ended: '2026-10-08T22:00:03.000Z', exit: { code: 0, signal: null }, progress: { frame: 20, time: 20, analysed: { frames: 21, lastTime: 20 } }, log: 'Analyzed 21 frames, last time 20.000\n' },
  outputs: [{ kind: 'xvg', path: '/sim/nvt/rdf/rdf_nvt.xvg', size: 21688, sha256: 'c'.repeat(64) }],
  problems: [],
};

describe('the run record (T31)', () => {
  const r = buildRecord(parts);

  it('holds versions, the command, the inputs, the groups as steps and atom ranges, every option and the outputs', () => {
    expect(r).toMatchObject({ format: 'gmx-cypher run', version: 2, runner: { name: 'gmx-cypher', version: '0.1.0' }, gmx: { version: '2025.4' }, job: 'jabc', status: 'done', frames: { analysed: 21, lastTime: 20 } });
    expect(r.command.args.slice(0, 3)).toEqual(['rdf', '-f', 'nvt.xtc']);
    expect(r.groups).toEqual([
      { index: 0, role: 'reference', name: 'sulfur', tone: 'coral', steps: groups[0].steps, atoms: '5-30:5', count: 6, gmxCount: 6 },
      { index: 1, role: 'selection', name: 'water_O', tone: 'sky', steps: groups[1].steps, atoms: '43-3239:4', count: 800, gmxCount: 800 },
    ]);
    expect(r.options.find(o => o.flag === 'rmax')).toEqual({ flag: 'rmax', value: '1.5', default: '0', isDefault: false });
    expect(r.options.find(o => o.flag === 'bin')).toEqual({ flag: 'bin', value: '0.002', default: '0.002', isDefault: true });
    expect(r.options.find(o => o.flag === 'cn')).toEqual({ flag: 'cn', value: true, default: false, isDefault: false });
    expect(r.options).toHaveLength(15);
  });

  it('passes its own schema check, also after JSON', () => {
    expect(recordProblems(r)).toEqual([]);
    expect(recordProblems(JSON.parse(JSON.stringify(r)))).toEqual([]);
  });

  it('names what is wrong with a file that is not a v1 record', () => {
    expect(recordProblems({})).toEqual(['not a gmx-cypher run record']);
    expect(recordProblems({ ...r, version: 3 })).toEqual(['run record version 3: this gmx-cypher reads versions 1 and 2']);
    expect(recordProblems({ ...r, command: { cwd: '/x', file: 'gmx' }, groups: [{ name: 'a' }, r.groups[1]] })).toEqual(['command.args is missing', 'groups[0].steps is missing']);
    expect(recordProblems({ ...r, groups: [r.groups[0]] })).toEqual(['groups: a reference and at least one selection are needed']);
  });

  it('goes back into the form: the same inputs, groups, options, template and folder', () => {
    expect(recipeFromRecord(r)).toEqual({
      inputs: { trajectory: { path: inputs.trajectory, why: 'from rdf_nvt.run.json' }, runInput: { path: inputs.runInput, why: 'from rdf_nvt.run.json' }, structure: { path: inputs.structure, why: 'from rdf_nvt.run.json' } },
      groups, options, template: '{analysis}_{trajectory}', outDir: '/sim/nvt/rdf',
    });
  });

  it('run again: the same argv apart from the new names, and the same .ndx bytes', () => {
    const again = recipeFromRecord(r), plan2 = rdfIo(inputs, again.outDir!, 'rdf_nvt (2)');
    const argv = rdfArgs({ options: again.options, selections: again.groups.length - 1 }, plan2.io, help);
    expect(argv.map(a => a.replace('rdf_nvt (2)', 'rdf_nvt'))).toEqual(r.command.args);
    const first = writeNdx(r.groups.map(g => ({ name: g.name, atoms: fromRanges(g.atoms) })));
    expect(writeNdx(again.groups.map(g => ({ name: g.name, atoms: groupAtoms(atoms, g.steps) })))).toBe(first);
  });
});
