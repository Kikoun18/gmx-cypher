import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE, freeStem, outputNames, renderStem } from '../src/lib/names';

const values = { analysis: 'rdf', trajectory: 'nvt' };

describe('output names from a template (T30)', () => {
  it('the default: {analysis}_{trajectory}', () => {
    expect(DEFAULT_TEMPLATE).toBe('{analysis}_{trajectory}');
    expect(renderStem(DEFAULT_TEMPLATE, values)).toBe('rdf_nvt');
  });

  it("every token: the runner's own and PMF Sequences' fields", () => {
    const all = { ...values, method: 'umbrella', column: 'SO4', name: 'NA2SO4', seq: 'AAG', time: '100ns', run: '3', temp: '300K' };
    expect(renderStem('{method}-{column}-{name}-{seq}-{time}-{run}-{temp}-{analysis}-{trajectory}', all)).toBe('umbrella-SO4-NA2SO4-AAG-100ns-3-300K-rdf-nvt');
  });

  it('refuses unknown tokens, {*}, tokens without a value, and stray braces', () => {
    expect(() => renderStem('{foo}', values)).toThrow('unknown token {foo}');
    expect(() => renderStem('{*}_x', values)).toThrow('unknown token {*}');
    expect(() => renderStem('{run}_{trajectory}', values)).toThrow('{run} has no value here');
    expect(() => renderStem('rdf_{trajectory', values)).toThrow('a { or } without its pair');
  });

  it("makes names safe with PMF Sequences' safeFileName", () => {
    expect(renderStem('a/b:c*{trajectory}', values)).toBe('a_b_c_nvt');
    expect(renderStem('..{trajectory}.', values)).toBe('nvt');
    expect(renderStem('con', values)).toBe('_con');
    expect(renderStem('x'.repeat(100), values)).toHaveLength(56);
  });
});

describe('one free stem for all four files (T30)', () => {
  it('names the four files', () => {
    expect(outputNames('rdf_nvt')).toEqual({ xvg: 'rdf_nvt.xvg', cn: 'rdf_nvt_cn.xvg', ndx: 'rdf_nvt.ndx', record: 'rdf_nvt.run.json' });
  });

  it.each<[string[], string]>([
    [[], 'rdf_nvt'],
    [['rdf_nvt.xvg'], 'rdf_nvt (2)'],
    [['RDF_NVT.NDX'], 'rdf_nvt (2)'],
    [['rdf_nvt_cn.xvg'], 'rdf_nvt (2)'],
    [['rdf_nvt.run.json'], 'rdf_nvt (2)'],
    [['rdf_nvt.xvg', 'rdf_nvt (2).run.json'], 'rdf_nvt (3)'],
    [['#rdf_nvt.xvg.1#', 'rdf_nvt.log', 'rdf_nvt2.xvg'], 'rdf_nvt'],
  ])('%j taken → %s', (taken, want) => expect(freeStem('rdf_nvt', taken)).toBe(want));
});
