import { afterEach, describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { AREA, MIN, BUILTINS, blockError, cleanMetric, metricCell, metricPoints, resolveMetric, tileProvenance, type Tile } from '../src/lib/metrics';
import { setScriptHost, scriptsIdle } from '../src/lib/scriptRuns';
import type { Curve, Extra, MetricDef, Seq, Settings } from '../src/lib/types';
import { fixture, reopen, text, vaultFixture } from './helpers';

// R4a: a matrix metric is a definition (type, curve, transform, function and values, aggregation over runs, unit).
const curves = (file: string) => { const t = lib.parseTable(text(fixture('examples/' + file))); return t.cols.slice(1).map((_, j) => lib.curveFromTable(t, 1, j + 2, 1)); };
const ex = (type: string, slot: string, cs: Pick<Curve, 'x' | 'y'>[], labels: string[] = []): Extra =>
  ({ id: 'x' + type + slot, type, sacch: 'c', run: slot, time: '', file: '', added: '', curves: cs.map((c, j) => ({ id: 'c' + slot + j, label: labels[j] || 'col ' + (j + 2), file: '', ...c })) }) as Extra;
const row = (extras: Extra[]): Seq => ({ id: 's', name: 'S', seq: '', group: '', desc: '', runs: [], extras, structures: [] });
const def = (o: Partial<MetricDef>): MetricDef => ({ id: 'm', label: 'm', type: 'data', fn: { kind: 'builtin', name: 'mean' }, agg: 'mean', scale: { kind: 'minmax' }, ...o });
const st = lib.mergeSettings({}, {}) as Settings;
const cell = (s: Seq, d: MetricDef) => metricCell(s, 'c', d, { st, skip: null });
const value = (t: Tile) => (t.kind === 'value' ? t.v : NaN);

describe('Area and Min are built-in metrics with today’s numbers (golden)', () => {
  it('every cell of the frozen vault, with and without hidden runs', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store;
    const skip: lib.SkipFn = (s, r) => store.vis[lib.slotKey(s.id, r.sacch, r.run)] === 'off';
    let n = 0;
    for (const s of store.seqs) for (const c of store.cols) for (const [d, m] of [[AREA, 'area'], [MIN, 'min']] as const) for (const sk of [null, skip]) {
      const want = lib.cellValue(s, c.k, m, sk, lib.ENTROPY), got = metricCell(s, c.k, d, { st: lib.mergeSettings({}, store.settings), skip: sk });
      if (want == null) expect(got.kind).toBe('empty'); else { expect(got).toMatchObject({ kind: 'value', v: want, n: s.runs.filter(r => r.sacch === c.k && !(sk && sk(s, r))).length }); n++; }
    }
    expect(n).toBeGreaterThan(6);
  });
  it('resolve: the stored id, a saved definition, or Area; definitions are cleaned on read', () => {
    const mine = def({ id: 'mx', type: 'order', curve: 1 });
    expect([resolveMetric(undefined, {}), resolveMetric('min', {}), resolveMetric('mx', { metrics: [mine] }), resolveMetric('gone', { metrics: [mine] })]).toEqual([AREA, MIN, mine, AREA]);
    expect(cleanMetric({ ...mine, fn: { kind: 'script', script: 'k1' } })).toBeUndefined();
    expect(cleanMetric({ ...mine, curve: -1, extra: 1 })).toEqual({ ...mine, curve: undefined });
  });
});

describe('built-in functions (question 18), table-driven', () => {
  const xy = { x: [0, 1, 2, 3], y: [2, -1, 5, 4] };
  it.each([
    ['mean', {}, 2.5], ['max', {}, 5], ['minimum', {}, -1], ['barrier', {}, 6], ['at', { x: 1.5 }, 2], ['at', { x: 3 }, 4],
  ] as const)('%s %o', (name, params, want) => {
    expect(BUILTINS[name].run(xy.x, xy.y, params)).toEqual({ v: want });
  });
  it('value at x refuses x outside the data, and needs x', () => {
    expect(BUILTINS.at.run(xy.x, xy.y, { x: 4 })).toEqual({ error: 'x = 4 is outside the data (0 to 3)' });
    expect(cell(row([ex('data', 'a', [xy])]), def({ fn: { kind: 'builtin', name: 'at' } }))).toEqual({ kind: 'none', reason: 'set x before using value at x' });
  });
  it('mean ± block error (Flyvbjerg–Petersen) on temperature and pressure, as section 3', () => {
    const t = curves('temperature.xvg'), [p] = curves('pressure.xvg');
    const r = t.map(c => BUILTINS.blockmean.run(c.x as number[], c.y as number[], {}) as { v: number; err: number });
    // A Python reference implementation gives 0.0114608, 0.0122590, 0.0133626 K and 1.15768 bar (Phase 0 wrote ±0.012 for
    // the first, rounding 0.0115 twice).
    expect(r.map(q => [Number(q.v.toFixed(4)), Number(q.err.toPrecision(4))])).toEqual([[310.0434, 0.01146], [310.2416, 0.01226], [309.7747, 0.01336]]);
    expect(Number(blockError(p.y as number[]).toPrecision(4))).toBe(1.158);
    expect(BUILTINS.blockmean.run([1, 2, 3], [1, 2, 3], {})).toEqual({ error: 'too short for a block error (32 points or more)' });
  });
});

describe('any analysis type, curve and transform; aggregated over runs', () => {
  const order = curves('order_POPE.xvg');
  it('the curve by its place in the analysis (order parameters: full, upper, lower)', () => {
    const s = row([ex('order', 'a', order, ['Full membrane', 'Upper leaflet', 'Lower leaflet'])]);
    expect([0, 1, 2].map(i => Number(value(cell(s, def({ type: 'order', curve: i }))).toFixed(6)))).toEqual([0.292503, 0.306884, 0.281922]);
    expect(cell(s, def({ type: 'order', curve: 3 }))).toEqual({ kind: 'none', reason: 'no curve 4 in these Order parameters analyses' });
    expect(cell(s, def({ type: 'rdf' }))).toEqual({ kind: 'empty', hidden: false });
  });
  it('points without a value are left out and counted (membrane_thickness.dat)', () => {
    expect(cell(row([ex('data', 'a', curves('membrane_thickness.dat'))]), def({}))).toMatchObject({ kind: 'value', n: 1, dropped: 12, points: 86 });
    expect(value(cell(row([ex('data', 'a', curves('membrane_thickness.dat'))]), def({})))).toBeCloseTo(3.83832, 5);
  });
  it('the mean over runs with n and the sample SD; a single run’s block error', () => {
    const a = { x: [0, 1], y: [1, 1] }, b = { x: [0, 1], y: [3, 3] };
    expect(cell(row([ex('data', 'a', [a]), ex('data', 'b', [b])]), def({}))).toEqual({ kind: 'value', v: 2, n: 2, sd: Math.SQRT2, dropped: 0, points: 4 });
    const [t] = curves('temperature.xvg');
    expect(cell(row([ex('temperature', 'a', [t])]), def({ type: 'temperature', fn: { kind: 'builtin', name: 'blockmean' } }))).toMatchObject({ kind: 'value', n: 1, err: expect.closeTo(0.0114608, 6) });
  });
  it('hidden runs are left out; every run hidden says so', () => {
    const s = row([ex('data', 'a', [{ x: [0, 1], y: [1, 1] }]), ex('data', 'b', [{ x: [0, 1], y: [5, 5] }])]);
    const skipB: lib.SkipFn = (_q, r) => r.run === 'b', skipAll: lib.SkipFn = () => true;
    expect([value(metricCell(s, 'c', def({}), { st, skip: skipB })), metricCell(s, 'c', def({}), { st, skip: skipAll })]).toEqual([1, { kind: 'empty', hidden: true }]);
  });
  it('a metric’s own transform wins over the type’s; PMF functions other than Area and Min use the transformed curve', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store, s = store.seqs[0], c = s.runs[0].sacch;
    const sts = lib.mergeSettings({}, store.settings), runs = s.runs.filter(r => r.sacch === c);
    const want = runs.map(r => lib.curveStats(r, lib.NONE).min).reduce((p, q) => p + q, 0) / runs.length;
    expect(value(metricCell(s, c, { ...MIN, transform: lib.NONE }, { st: sts, skip: null }))).toBeCloseTo(want, 10);
    expect(value(metricCell(s, c, def({ type: 'pmf', fn: { kind: 'builtin', name: 'minimum' } }), { st: sts, skip: null }))).toBeCloseTo(lib.cellValue(s, c, 'min', null, lib.ENTROPY)!, 10);
  });
});

describe('script functions as metrics (R3c’s interface)', () => {
  afterEach(() => setScriptHost(null));
  it('pending, then the value; a function’s error is the tile’s reason', async () => {
    const src = 'def avg(x, y) -> float:\n    return sum(y) / len(y)\ndef bad(x, y) -> float:\n    raise ValueError("x must contain values on both sides of 0")\n';
    const fns = [{ name: 'avg', role: 'metric', params: [] }, { name: 'bad', role: 'metric', params: [] }];
    setScriptHost({
      scripts: () => [{ id: 'k1', name: 'f.py', fileId: 'f1', sha256: 'aa', fns: {} }],
      info: async () => ({ source: src, sha256: 'aa', fns: fns as never }), trusted: async () => true, python: async () => '3.14.2',
      run: async (_c, v) => { const vars = v as { name: string; y: number[] }; if (vars.name === 'bad') throw new Error('ValueError: x must contain values on both sides of 0'); return { kind: 'number', value: vars.y.reduce((p, q) => p + q, 0) / vars.y.length }; },
      load: async () => ({}), save: async () => {},
    });
    const s = row([ex('data', 'a', [{ x: [0, 1], y: [2, 4] }]), ex('data', 'b', [{ x: [0, 1], y: [6, 8] }])]);
    const avg = def({ fn: { kind: 'script', script: 'k1', fn: 'avg' } }), bad = def({ fn: { kind: 'script', script: 'k1', fn: 'bad' } });
    expect([cell(s, avg), cell(s, bad)]).toEqual([{ kind: 'pending' }, { kind: 'pending' }]);
    await scriptsIdle();
    expect(cell(s, avg)).toEqual({ kind: 'value', v: 5, n: 2, sd: Math.SQRT2 * 2, dropped: 0, points: 4 });
    expect(cell(s, bad)).toEqual({ kind: 'none', reason: 'ValueError: x must contain values on both sides of 0' });
  });
});

// Review fix (F137): the tooltip's provenance reads the answer the tile used (the transformed points), so it never
// asks Python again for the untransformed curve.
describe('a tile’s provenance', () => {
  afterEach(() => setScriptHost(null));
  it('reuses the tile’s own answer: no second call, and it names Python', async () => {
    const seen: number[][] = [];
    setScriptHost({
      scripts: () => [{ id: 'k1', name: 'f.py', fileId: 'f1', sha256: 'aa', fns: {} }],
      info: async () => ({ source: '', sha256: 'aa', fns: [{ name: 'avg', role: 'metric', params: [] }] as never }), trusted: async () => true, python: async () => '3.14.2',
      run: async (_c, v) => { const y = (v as { y: number[] }).y; seen.push(y); return { kind: 'number', value: y.reduce((p, q) => p + q, 0) / y.length }; },
      load: async () => ({}), save: async () => {},
    });
    const x = Array.from({ length: 40 }, (_, i) => 0.1 + i * 0.05), y = x.map(v => Math.sin(v));
    const s: Seq = { ...row([]), runs: [{ id: 'r1', sacch: 'c', run: 'a', time: '', temp: 310.15, tags: [], file: 'f', added: '', x, y } as never] };
    const d = def({ type: 'pmf', fn: { kind: 'script', script: 'k1', fn: 'avg' } });
    cell(s, d); await scriptsIdle();
    const t = cell(s, d), calls = seen.length;
    expect([t.kind, calls]).toEqual(['value', 1]);
    const prov = tileProvenance(s, 'c', d, t, { st, skip: null, scripts: [{ id: 'k1', name: 'f.py', fileId: 'f1', sha256: 'aa', fns: {} }] }); await scriptsIdle();
    expect(seen.length).toBe(calls);
    expect(prov).toContain('Python 3.14.2');
  });
});

describe('a tile’s provenance names a script transform fully (F138)', () => {
  it('its file, SHA-256 and values, not only the function', () => {
    const t = { kind: 'script' as const, script: 'k1', fn: 'shift', params: { by: 5 } };
    const s = row([ex('data', 'a', [{ x: [0, 1], y: [2, 4] }])]), d = def({ transform: t });
    const prov = tileProvenance(s, 'c', d, { kind: 'pending' }, { st, skip: null, scripts: [{ id: 'k1', name: 'shift.py', fileId: 'f1', sha256: '48962f66db26aaaa', fns: {} }] });
    expect(prov).toContain('transformed by shift() from shift.py (SHA-256 48962f66db26…) · by = 5');
  });
});

// Review fix (F138): the points a metric reads are the same arrays each time (cached per run or curve and transform),
// so the SHA-256 of a script's input is worked out once, not on every redraw.
describe('the points a metric reads are kept', () => {
  it('a PMF run with the correction, and an analysis curve with a transform, give the same arrays again', () => {
    const x = Array.from({ length: 40 }, (_, i) => 0.1 + i * 0.05), y = x.map(v => Math.sin(v));
    const run = { id: 'r1', sacch: 'c', run: 'a', time: '', temp: 310.15, tags: [], file: 'f', added: '', x, y } as never;
    const pmf = def({ type: 'pmf' }), a = metricPoints(run, pmf, st)!, b = metricPoints(run, pmf, st)!;
    expect([a.x === b.x, a.y === b.y, a.y === y]).toEqual([true, true, false]);
    const e = ex('data', 'a', [{ x, y }]), d = def({ transform: lib.ENTROPY }), c1 = metricPoints(e, d, st)!, c2 = metricPoints(e, d, st)!;
    expect([c1.y === c2.y, c1.y === y]).toEqual([true, false]);
  });
});
