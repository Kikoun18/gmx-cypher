import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import { fixture, text } from './helpers';

const types = lib.getAnalyses({});
const head = (file: string) => lib.parseTable(text(fixture(file))).head;
const AWH = 'hmrfast6_ha_a_t200000.xvg', RDF = 'gmx/07.md_rdf_protein_sugar.xvg';

describe('detectAna: header evidence beats file-name keywords (R4)', () => {
  it.each([
    // file name, header from, expected type, expected source
    ['pmf_distance_ha.xvg', AWH, 'pmf', 'header'],
    ['awh_rg-scan.xvg', AWH, 'pmf', 'header'],
    ['pmf_distance_ha.xvg', null, 'dist', 'auto'],
    ['awh_rg-scan.xvg', null, 'rg', 'auto'],
    ['plain.xvg', null, 'pmf', 'auto'],
    ['pmf_awh_ha.xvg', RDF, 'rdf', 'header'],
    ['pmf_distance.xvg', RDF, 'rdf', 'header'],
    ['x.xvg', 'gmx/hist_500000.xvg', 'hist', 'header'],
    ['x.xvg', 'gmx/07.md_mindist_protein_sugar.xvg', 'dist', 'header'],
  ])('%s with header %s → %s (%s)', (name, from, k, how) => {
    expect(lib.detectAna(types, name, from ? head(from) : null)).toEqual({ k, from: how });
  });
});

describe('detectAna: the GROMACS tool as evidence (R1b, F32)', () => {
  const gmxOf = (f: string) => parseGmxHeader(text(fixture(f)));
  it.each([
    // file name, header and tool from, expected type, expected source
    ['rdf_scan.xvg', AWH, 'pmf', 'header'],
    ['x.xvg', 'gmx/07.md_numcont_protein_sugar.xvg', '', 'header'],
    ['numcont_rg.xvg', 'gmx/07.md_numcont_protein_sugar.xvg', 'rg', 'auto'],
    ['x.xvg', 'gmx/07.md_rdf_protein_sugar.xvg', 'rdf', 'header'],
  ])('%s with %s → %s (%s)', (name, from, k, how) => {
    expect(lib.detectAna(types, name, head(from), gmxOf(from)?.tool)).toEqual({ k, from: how });
  });
  it('a title AWH without the gmx awh banner is still PMF', () => {
    expect(lib.detectAna(types, 'x.xvg', { title: 'AWH', xLabel: '', yLabel: '', legends: [] }, null)).toEqual({ k: 'pmf', from: 'header' });
  });
  it('no GROMACS banner keeps the PMF fallback', () => {
    expect(lib.detectAna(types, 'x.xvg', { title: 'Number of Contacts', xLabel: '', yLabel: '', legends: [] }, null)).toEqual({ k: 'pmf', from: 'auto' });
  });
});

describe('planBatch: where the analysis came from', () => {
  const st = lib.mergeSettings({}, {});
  const form = (file: string, from: string, pattern = false): lib.UploadForm => {
    const table = lib.parseTable(text(fixture(from)));
    return {
      files: [{ id: 'f1', file, table, head: table.head, parsed: pattern ? lib.parseName(file, '{analysis}_{name}.xvg') : undefined }],
      name: 'WRWYCR', seq: '', group: '', desc: '', time: '', temp: '300', col: 'ha', run: 'auto', parse: pattern,
      tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace',
    };
  };
  it('reports a header hit as the source', () => {
    const [p] = lib.planBatch(lib.emptyStore(), form('pmf_distance_ha.xvg', AWH), types, st);
    expect([p.ana.k, p.anaHow]).toEqual(['pmf', 'header']);
  });
  it('an unknown GROMACS analysis is not uploaded until one is chosen (F32)', () => {
    const NC = 'gmx/07.md_numcont_protein_sugar.xvg';
    const f = form('x.xvg', NC);
    f.files[0].gmx = parseGmxHeader(text(fixture(NC)));
    const [p] = lib.planBatch(lib.emptyStore(), f, types, st);
    expect([p.ok, p.unknown]).toEqual([false, 'gmx mindist']);
    const [q] = lib.planBatch(lib.emptyStore(), { ...f, ana: 'dist' }, types, st);
    expect([q.ok, q.unknown, q.ana.k, q.anaHow]).toEqual([true, undefined, 'dist', 'form']);
    const [r] = lib.planBatch(lib.emptyStore(), { ...f, anaOf: { f1: 'dist' } }, types, st);
    expect([r.ok, r.ana.k]).toEqual([true, 'dist']);
  });
  it('an unknown file takes no slot and no +1 suffix from the PMF next to it', () => {
    const NC = 'gmx/07.md_numcont_protein_sugar.xvg';
    const f = form('x.xvg', NC), a = form('pmf.xvg', AWH);
    f.files[0].gmx = parseGmxHeader(text(fixture(NC)));
    const plan = lib.planBatch(lib.emptyStore(), { ...f, files: [f.files[0], { ...a.files[0], id: 'f2' }] }, types, st);
    expect(plan.map(p => [p.name, p.run, p.ok])).toEqual([['WRWYCR', 'a', false], ['WRWYCR', 'a', true]]);
  });
  it('an explicit {analysis} token beats the header', () => {
    const [p] = lib.planBatch(lib.emptyStore(), form('rdf_WRWYCR.xvg', AWH, true), types, st);
    expect([p.ana.k, p.anaHow]).toEqual(['rdf', 'file']);
  });
});

describe('cellForm: one pre-fill for a cell (R7)', () => {
  const row = { id: 's1', name: 'WRWYCR', seq: 'WRWYCR', desc: 'd', group: 'g', runs: [], extras: [], structures: [] };
  it('keeps the row and column, and the name', () => {
    expect(lib.cellForm(row, 'ha')).toEqual({ name: 'WRWYCR', seq: 'WRWYCR', desc: 'd', group: 'g', col: 'ha', parse: false, keepName: true });
  });
  it('takes overrides (+ add a run here)', () => {
    expect(lib.cellForm(row, 'ha', { run: 'c', ana: 'pmf', onClash: 'append' })).toMatchObject({ col: 'ha', keepName: true, run: 'c', ana: 'pmf', onClash: 'append' });
  });
  it('two files dropped on a cell land in the row’s next free slots, not in new rows', () => {
    const st = lib.mergeSettings({}, {});
    const table = lib.parseTable(text(fixture(AWH)));
    const xy = lib.runFromTable(table, 1, 2);
    const s = lib.addRun(lib.emptyStore(), { name: 'WRWYCR', seq: 'WRWYCR', group: 'g', desc: '', sacch: 'ha', run: 'a', time: '', temp: 300, tags: [], file: 'x', ...xy }).store;
    const form: lib.UploadForm = {
      files: [1, 2].map(i => ({ id: 'f' + i, file: 'drop' + i + '.xvg', table, head: table.head, sha256: 'h' + i })),
      desc: '', time: '', temp: '300', run: 'auto', tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace',
      ...(lib.cellForm(s.seqs[0], 'ha') as Required<Pick<lib.UploadForm, 'name' | 'seq' | 'group' | 'col' | 'parse'>>),
    };
    expect(lib.planBatch(s, form, types, st).map(p => [p.name, p.col.k, p.run])).toEqual([['WRWYCR', 'ha', 'b'], ['WRWYCR', 'ha', 'c']]);
  });
});
