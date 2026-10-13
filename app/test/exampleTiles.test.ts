import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import * as lib from '../src/lib/seq';
import { PY_HELPERS } from '../src/lib/py';
import { metricCell, tileProvenance, type Tile } from '../src/lib/metrics';
import { scriptsIdle, setScriptHost } from '../src/lib/scriptRuns';
import { sha256Text } from '../src/lib/sha256';
import type { MetricDef, Settings, Store } from '../src/lib/types';
import { fixture, text } from './helpers';

// R4c: the example files, uploaded as the dialog does, give section 3's reference values in their tiles, with the
// missing-value rule for membrane_thickness.dat (question 6), and functions.py's errors shown, not swallowed.
const NAMES = ['translocation_free_energy.dat', 'membrane_thickness.dat', 'order_POPE.xvg', 'phosphorus.xvg', 'temperature.xvg', 'pressure.xvg'];
const FNS = text(fixture('examples/functions.py')), SHA = sha256Text(FNS);
let py: PyodideInterface, store: Store, st: Settings;

beforeAll(async () => {
  st = lib.mergeSettings({}, {}) as Settings;
  const files: lib.UploadFile[] = NAMES.map((n, i) => { const t = lib.parseTable(text(fixture('examples/' + n))); return { id: 'f' + i, file: n, table: t, head: t.head, sha256: 's' + i, parsed: lib.parseName(n, st.pattern) }; });
  const form: lib.UploadForm = { files, name: 'Examples', seq: '', group: '', desc: '', time: '', temp: '310.15', col: 'o26', run: 'auto', parse: false, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace' };
  store = lib.addBatch(lib.emptyStore(), form, lib.planBatch(lib.emptyStore(), form, lib.getAnalyses(st), st)).store;
  py = await loadPyodide(); await py.runPythonAsync(PY_HELPERS);
  setScriptHost({
    scripts: () => [{ id: 'kfns', name: 'functions.py', fileId: 'ffns', sha256: SHA, fns: {} }],
    info: async () => { py.globals.set('src', FNS); return { source: FNS, sha256: SHA, fns: JSON.parse(py.runPython('_discover(src)')) }; },
    trusted: async () => true, python: async () => '3.14.2', load: async () => ({}), save: async () => {},
    run: async (code, vars) => {
      for (const [k, v] of Object.entries(vars)) py.globals.set(k, py.toPy(v));
      try { return JSON.parse(py.runPython(code)); } catch (e) { throw new Error(String((e as Error).message).trim().split('\n').pop()); }
    },
  });
}, 60000);
afterAll(() => setScriptHost(null));

const def = (type: string, fn: MetricDef['fn'], curve?: number): MetricDef => ({ id: 'm', label: 'm', type, ...(curve != null ? { curve } : {}), fn, agg: 'mean', scale: { kind: 'minmax' } });
const b = (name: string) => ({ kind: 'builtin' as const, name }), s = (fn: string) => ({ kind: 'script' as const, script: 'kfns', fn });
const tile = async (d: MetricDef): Promise<Tile> => { const row = store.seqs[0]; metricCell(row, 'o26', d, { st, skip: null }); await scriptsIdle(); return metricCell(row, 'o26', d, { st, skip: null }); };
const v = (t: Tile) => (t.kind === 'value' ? t.v : NaN);

describe('the example files’ tiles (section 3)', () => {
  it('every file landed in one cell, each as its recognised type', () => {
    expect(store.seqs[0].extras.map(e => [e.type, e.curves.length])).toEqual([['free-energy', 1], ['data', 1], ['order', 3], ['density', 1], ['temperature', 3], ['pressure', 1]]);
  });
  it('translocation profile: barrier 121.377 kJ/mol (built-in and functions.py), no correction; peak distance 1.84', async () => {
    expect(v(await tile(def('free-energy', b('barrier'))))).toBeCloseTo(121.377, 3);
    expect(v(await tile(def('free-energy', s('calc_barrier'))))).toBeCloseTo(121.377, 3);
    expect(v(await tile(def('free-energy', s('calc_peak_distance'))))).toBeCloseTo(1.84, 2);
  });
  it('membrane thickness: the mean of the 74 points with a value, 3.83832 nm, and the 12 without are counted', async () => {
    for (const fn of [b('mean'), s('calc_mean')]) expect(await tile(def('data', fn))).toMatchObject({ kind: 'value', dropped: 12, points: 86, v: expect.closeTo(3.83832, 5) });
    expect(v(await tile(def('data', s('calc_barrier'))))).toBeCloseTo(0.45882, 5);
  });
  it('order parameters: 0.292503, 0.306884, 0.281922 by curve; peak distance is an error shown in the tile', async () => {
    expect(await Promise.all([0, 1, 2].map(async c => Number(v(await tile(def('order', s('calc_mean'), c))).toFixed(6))))).toEqual([0.292503, 0.306884, 0.281922]);
    const bad = await tile(def('order', s('calc_peak_distance')));
    expect(bad).toEqual({ kind: 'none', reason: 'ValueError: x must contain values on both sides of 0' });
    expect(tileProvenance(store.seqs[0], 'o26', def('order', s('calc_peak_distance')), bad, { st, skip: null, scripts: [{ id: 'kfns', name: 'functions.py', fileId: 'ffns', sha256: SHA, fns: {} }] }))
      .toBe('no value: ValueError: x must contain values on both sides of 0 · calc_peak_distance (functions.py, SHA-256 ' + SHA.slice(0, 12) + '…, Python 3.14.2) · no transform · Order parameters · Full membrane · run 1');
  });
  it('phosphorus density: peak distance 3.98748 nm', async () => {
    expect(v(await tile(def('density', s('calc_peak_distance'))))).toBeCloseTo(3.98748, 5);
  });
  it('temperature and pressure: the mean with its block error', async () => {
    const t = await Promise.all([0, 1, 2].map(c => tile(def('temperature', b('blockmean'), c))));
    expect(t.map(q => (q.kind === 'value' ? [Number(q.v.toFixed(4)), Number(q.err!.toPrecision(3))] : q))).toEqual([[310.0434, 0.0115], [310.2416, 0.0123], [309.7747, 0.0134]]);
    expect(await tile(def('pressure', b('blockmean')))).toMatchObject({ v: expect.closeTo(2.2994, 4), err: expect.closeTo(1.158, 3) });
  });
});
