import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { correctCurve } from '../src/lib/pmf';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import type { Store } from '../src/lib/types';
import { fixture, newVault, reopen, text, vaultFixture, withAnalysis } from './helpers';

// R2: the PMF correction is a setting per type (F87): PMF entropy by default, others none; everything follows it.
const { ENTROPY, NONE } = lib;
const trans = () => {
  const xy = lib.runFromTable(lib.parseTable(text(fixture('examples/translocation_free_energy.dat'))), 1, 2);
  return { id: 'r', sacch: 'ha', run: 'a' as const, time: '', temp: 310.15, tags: [], file: '', added: '', ...xy };
};

describe('applyTransform', () => {
  it('entropy is correctCurve, bit for bit; none leaves the curve as it is', () => {
    const r = trans();
    expect(lib.applyTransform(ENTROPY, r.x, r.y, 310.15)).toEqual(correctCurve(r.x, r.y, { temperature: 310.15 }));
    expect(lib.applyTransform(NONE, r.x, r.y, 310.15)).toEqual(r.y);
  });
  it('drops missing values before the transform and keeps the gaps (F86)', () => {
    const x = [1, 2, 3, 4, 5], y = [1, null, 3, 4, 5], out = lib.applyTransform(ENTROPY, x, y, 300);
    expect(out[1]).toBeNull();
    expect(out.filter(v => v != null)).toEqual(correctCurve([1, 3, 4, 5], [1, 3, 4, 5], { temperature: 300 }));
  });
});

describe('every number follows the setting', () => {
  it('the translocation profile is unchanged with none; entropy distorts it (section 3)', () => {
    const r = trans(), none = lib.curveStats(r, NONE), ent = lib.curveStats(r, ENTROPY);
    expect(none.curve).toEqual(r.y);
    expect([+none.min.toFixed(2), +ent.min.toFixed(2)]).toEqual([-36.8, -46.07]);
  });
  it('cell values, the matrix scale and the default', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const s = svc.store, kr = s.seqs.find(q => q.name === 'KRWYCR')!;
    expect(lib.pmfTransform(lib.mergeSettings({}, s.settings))).toEqual(ENTROPY);
    expect(+lib.cellValue(kr, 'pg', 'min', null, NONE)!.toFixed(2)).toBe(-36.8);
    expect(+lib.cellValue(kr, 'pg', 'min', null, ENTROPY)!.toFixed(2)).toBe(-46.07);
    expect(lib.maxMag(s.seqs, 'area', s.cols, null, NONE)).not.toBe(lib.maxMag(s.seqs, 'area', s.cols, null, ENTROPY));
  });
  it('tileDiff counts the tiles a change would alter, add or remove', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const s = svc.store, cols = lib.pageCols(s, null);
    expect(lib.tileDiff(s.seqs, cols, 'area', null, ENTROPY, NONE)).toEqual({ changed: 4, added: 0, removed: 0 });
    expect(lib.tileDiff(s.seqs, cols, 'area', null, ENTROPY, ENTROPY)).toEqual({ changed: 0, added: 0, removed: 0 });
  });
  it('the setting is a project setting and survives a reopen', async () => {
    const { b, svc } = await newVault();
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, pmfTransform: NONE } });
    await svc.flush();
    expect(lib.PROJECT_KEYS).toContain('pmfTransform');
    expect((await reopen(b)).svc.store.settings?.pmfTransform).toEqual(NONE);
  });
});

describe('graphs name the transform', () => {
  const view = (s: Store, tab: string, o: { raw?: boolean; st?: object } = {}) => {
    const st = lib.mergeSettings({}, { ...s.settings, ...o.st }), t = o.raw ? NONE : lib.pmfTransform(st);
    return buildGraph({ store: s, sel: { mode: 'cell', id: s.seqs.find(q => q.name === 'KRWYCR')!.id, s: 'pg' }, cols: lib.pageCols(s, null), st, tab, raw: !!o.raw, fitWell: false, dark: false, domain: sharedDomain(s.seqs, t) })!;
  };
  it('PMF with none, and the raw view (F88)', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const s = { ...svc.store, vis: {} };
    const none = view(s, 'pmf', { st: { pmfTransform: NONE } }), raw = view(s, 'pmf', { raw: true }), ent = view(s, 'pmf');
    expect([none.data.kicker, none.data.file, none.note]).toEqual(['PMF · no correction', 'PG_KRWYCR_no-correction', 'no correction · autoscaled']);
    expect([raw.data.kicker, raw.note]).toEqual(['PMF · raw', 'raw gmx awh output — not what the matrix uses · autoscaled']);
    expect(ent.data.kicker).toBe('PMF · corrected');
    expect(none.series[0].ry).toEqual(raw.series[0].ry);
    expect(view(s, 'pmf', { raw: true, st: { pmfTransform: NONE } }).data.kicker).toBe('PMF · no correction');
  });
  it('an analysis type can take the entropy correction too, and says so', () => {
    const s = withAnalysis(lib.emptyStore(), { name: 'KRWYCR', col: 'pg', type: 'free-energy', file: 't.dat', bytes: fixture('examples/translocation_free_energy.dat') }).store;
    const types = lib.DEFAULT_ANALYSES.map(a => (a.k === 'free-energy' ? { ...a, transform: ENTROPY } : a));
    const plain = view(s, 'free-energy'), ent = view(s, 'free-energy', { st: { analyses: types } });
    expect([plain.note.includes('corrected'), ent.note.includes('corrected: + 2kT·ln r')]).toEqual([false, true]);
    expect(Math.min(...ent.series[0].ry.filter((v): v is number => v != null))).toBeCloseTo(-46.07, 2);
  });
});
