import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import * as lib from '../src/lib/seq';
import { PY_HELPERS } from '../src/lib/py';
import { callScript, checkParams, checkResult, finitePoints, type ScriptFn } from '../src/lib/scripts';
import { scriptResult, scriptsIdle, setScriptHost, retryScripts, scriptProvenance, subscribeScripts, type ScriptHost } from '../src/lib/scriptRuns';
import { sha256Text } from '../src/lib/sha256';
import { sha256Hex } from '../src/lib/storage/json';
import type { Run, ScriptRef, Transform } from '../src/lib/types';
import { fixture, text } from './helpers';

// R3c: one validated interface for matrix functions and transforms, run in real Pyodide (Node), with section 3's
// reference values, the missing-value rule, caching by content and provenance.
let py: PyodideInterface;
beforeAll(async () => { py = await loadPyodide(); await py.runPythonAsync(PY_HELPERS); }, 60000);
let runs = 0;
/** Like the sandbox: vars as Python globals, the JSON answer parsed, Python's last traceback line as the error. */
const run = async (code: string, vars: Record<string, unknown> = {}) => {
  runs++;
  for (const [k, v] of Object.entries(vars)) py.globals.set(k, py.toPy(v));
  try { return JSON.parse(py.runPython(code)); } catch (e) { throw new Error(String((e as Error).message).trim().split('\n').pop()); } finally { for (const k of Object.keys(vars)) py.globals.delete(k); }
};
const discover = (src: string): ScriptFn[] => { py.globals.set('src', src); return JSON.parse(py.runPython('_discover(src)')); };
const FNS = text(fixture('examples/functions.py'));
const curves = (file: string) => { const t = lib.parseTable(text(fixture('examples/' + file))); return t.cols.slice(1).map((_, j) => lib.curveFromTable(t, 1, j + 2, 1)); };
const call = async (fn: string, c: { x: (number | null)[]; y: (number | null)[] }, o: { src?: string; role?: 'metric' | 'transform'; params?: Record<string, string | number | boolean> } = {}) =>
  callScript({ source: o.src ?? FNS, sha256: sha256Text(o.src ?? FNS), fn, role: o.role ?? 'metric', params: o.params ?? {}, x: c.x, y: c.y }, run);
const value = (r: { ok: boolean; value?: number }) => (r.ok && r.value !== undefined ? r.value : NaN);

describe('functions.py on every example file, as CPython computes them (section 3)', () => {
  it('translocation profile, thickness, order parameters, phosphorus, temperature, pressure', async () => {
    const [tr] = curves('translocation_free_energy.dat'), [th] = curves('membrane_thickness.dat'), order = curves('order_POPE.xvg');
    const [ph] = curves('phosphorus.xvg'), temp = curves('temperature.xvg'), [pr] = curves('pressure.xvg');
    expect(value(await call('calc_barrier', tr))).toBeCloseTo(121.377, 3);
    expect(value(await call('calc_peak_distance', tr))).toBeCloseTo(1.84, 2);
    // The 12 nan rows are left out, and counted (section 1.3, question 6).
    expect(await call('calc_mean', th)).toMatchObject({ ok: true, dropped: 12, n: 86 });
    expect(value(await call('calc_mean', th))).toBeCloseTo(3.83832, 5);
    // Phase 0's 0.45883 is from the raw file; the app stores curves to 6 significant digits (D15), and scripts get the
    // curve as stored, so max − min is 3.95420 − 3.49538.
    expect(value(await call('calc_barrier', th))).toBeCloseTo(0.45882, 5);
    expect(await Promise.all(order.map(async c => Number(value(await call('calc_mean', c)).toFixed(6))))).toEqual([0.292503, 0.306884, 0.281922]);
    expect(await call('calc_peak_distance', order[0])).toEqual({ ok: false, error: 'ValueError: x must contain values on both sides of 0', dropped: 0, n: 32 });
    expect(value(await call('calc_peak_distance', ph))).toBeCloseTo(3.98748, 5);
    expect(await Promise.all(temp.map(async c => Number(value(await call('calc_mean', c)).toFixed(4))))).toEqual([310.0434, 310.2416, 309.7747]);
    expect(value(await call('calc_mean', pr))).toBeCloseTo(2.2994, 4);
  }, 30000);
});

describe('parameters (F90): defaults, your values, bad ones refused', () => {
  let f: ScriptFn;
  beforeAll(() => { [f] = discover(`from typing import Literal
def f(x, y, k: float = 1.5, n: int = 2, on: bool = False, mode: Literal['a', 'b'] = 'a', *, need: float) -> float:
    return k * n + need + (1 if on else 0) + (10 if mode == 'b' else 0)
`); });
  it('fills defaults and keeps yours; a required one, a wrong kind, a value outside the choices or an unknown name is refused', () => {
    expect(checkParams(f, { need: 2 })).toEqual({ ok: true, values: { k: 1.5, n: 2, on: false, mode: 'a', need: 2 } });
    expect(checkParams(f, {})).toEqual({ ok: false, error: 'set need before using f' });
    expect(checkParams(f, { need: 'x' })).toEqual({ ok: false, error: 'need must be a number' });
    expect(checkParams(f, { need: Infinity })).toEqual({ ok: false, error: 'need must be a number' });
    expect(checkParams(f, { need: 1, n: 1.5 })).toEqual({ ok: false, error: 'n must be a whole number' });
    expect(checkParams(f, { need: 1, on: 'yes' })).toEqual({ ok: false, error: 'on must be true or false' });
    expect(checkParams(f, { need: 1, mode: 'c' })).toEqual({ ok: false, error: 'mode must be one of "a", "b"' });
    expect(checkParams(f, { need: 1, zz: 1 })).toEqual({ ok: false, error: 'f has no parameter zz' });
    expect(checkParams({ ...f, problem: 'async functions aren’t supported' }, { need: 1 })).toEqual({ ok: false, error: 'f can’t be used: async functions aren’t supported' });
  });
  it('reach the function as keyword arguments', async () => {
    const src = 'def f(x, y, k: float = 1.5, n: int = 2, on: bool = False, *, need: float) -> float:\n    return k * n + need + (1 if on else 0)\n';
    expect(value(await call('f', { x: [1, 2], y: [1, 2] }, { src, params: { k: 1.5, n: 2, on: true, need: 0.25 } }))).toBe(4.25);
  });
});

describe('results are checked: type, length, finiteness (section 1.4)', () => {
  const src = `def s(x, y) -> float: return 'a'
def nan(x, y) -> float: return float('nan')
def flag(x, y) -> float: return True
def many(x, y) -> float: return [1.0]
def count(x, y) -> int: return len(y)
def double(x, y) -> list[float]: return [v * 2 for v in y]
def short(x, y) -> list[float]: return y[:-1]
def pair(x, y) -> tuple: return ([v + 1 for v in x], y)
def inf(x, y) -> list: return [float('inf')] + y[1:]
def one(x, y) -> list: return 1.0
def words(x, y) -> list: return ['a'] * len(y)
`;
  const xy = { x: [1, 2, 3], y: [10, 20, 30] };
  it('a matrix function returns one finite number', async () => {
    expect(await call('s', xy, { src })).toMatchObject({ ok: false, error: 'returned str; a matrix function returns one number' });
    expect(await call('nan', xy, { src })).toMatchObject({ ok: false, error: 'returned nan or infinity; a matrix function returns a finite number' });
    expect(await call('flag', xy, { src })).toMatchObject({ ok: false, error: 'returned bool; a matrix function returns one number' });
    expect(await call('many', xy, { src })).toMatchObject({ ok: false, error: 'returned a list; a matrix function returns one number' });
    expect(await call('count', xy, { src })).toMatchObject({ ok: true, value: 3 });
  });
  it('a transform returns y of the same length, or an (x, y) pair', async () => {
    expect(await call('double', xy, { src, role: 'transform' })).toMatchObject({ ok: true, y: [20, 40, 60] });
    expect(await call('pair', xy, { src, role: 'transform' })).toMatchObject({ ok: true, x: [2, 3, 4], y: [10, 20, 30] });
    expect(await call('short', xy, { src, role: 'transform' })).toMatchObject({ ok: false, error: 'returned 2 values for 3 points' });
    expect(await call('inf', xy, { src, role: 'transform' })).toMatchObject({ ok: false, error: 'value 1 is nan or infinity' });
    expect(await call('one', xy, { src, role: 'transform' })).toMatchObject({ ok: false, error: 'returned one number; a transform returns y, or (x, y)' });
    expect(await call('words', xy, { src, role: 'transform' })).toMatchObject({ ok: false, error: 'value 1 is str, not a number' });
  });
  it('points without a value never reach the function, and are counted', async () => {
    expect(finitePoints([1, 2, null, 4, 5], [1, null, 3, NaN, 5])).toEqual({ keep: [0, 4], x: [1, 5], y: [1, 5], dropped: 3, n: 5 });
    expect(await call('count', { x: [1, 2, null, 4, 5], y: [1, null, 3, NaN, 5] }, { src })).toEqual({ ok: true, value: 2, dropped: 3, n: 5 });
    expect(await call('count', { x: [1], y: [null] }, { src })).toEqual({ ok: false, error: 'no points with a value', dropped: 1, n: 1 });
  });
  it('a function the file doesn’t have, or a Python error, comes back as its message', async () => {
    expect(await call('nope', xy, { src })).toMatchObject({ ok: false, error: 'no function nope in the script' });
    expect(await call('f', xy, { src: 'def f(x, y) -> float:\n    return 1 / 0\n' })).toMatchObject({ ok: false, error: 'ZeroDivisionError: division by zero' });
  });
});

it('the pinned Pyodide in the cache key is the one installed', async () => {
  const { PYODIDE_VERSION } = await import('../src/lib/pyFiles');
  const { readFileSync } = await import('node:fs');
  expect(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies.pyodide).toBe(PYODIDE_VERSION);
});

describe('calls through the app: cached by content, trust first, provenance (R3c)', () => {
  const SRC = 'def mean(x, y) -> float:\n    return sum(y) / len(y)\n\ndef shift(x, y, by: float = 1.0) -> list[float]:\n    """unit: kJ/mol"""\n    return [v + by for v in y]\n';
  let refs: ScriptRef[], trusted: Set<string>, onDisk: Map<string, string>, saved: Record<string, unknown>;
  const host = (): ScriptHost => ({
    scripts: () => refs,
    info: async fileId => { const source = onDisk.get(fileId)!; return { source, sha256: await sha256Hex(new TextEncoder().encode(source)), fns: discover(source) }; },
    trusted: async (id, sha) => trusted.has(id + '|' + sha),
    run, python: async () => '3.14.2',
    load: async () => saved, save: async e => { saved = { ...e }; },
  });
  const setup = async () => {
    const sha = await sha256Hex(new TextEncoder().encode(SRC));
    refs = [{ id: 'k1', name: 'mine.py', fileId: 'f1', sha256: sha, fns: {} }];
    trusted = new Set(['k1|' + sha]); onDisk = new Map([['f1', SRC]]); saved = {};
    setScriptHost(host()); runs = 0;
    return sha;
  };
  afterEach(() => setScriptHost(null));
  const req = (y: (number | null)[], o: { fn?: string; params?: Record<string, number> } = {}) => ({ script: 'k1', fn: o.fn ?? 'mean', role: (o.fn === 'shift' ? 'transform' : 'metric') as 'metric' | 'transform', params: o.params, x: y.map((_, i) => i), y });

  it('pending, then the result; the same numbers again (even in a new array) don’t run again; a change recomputes', async () => {
    await setup();
    let told = 0;
    const off = subscribeScripts(() => told++);
    expect(scriptResult(req([1, 2, 3, null]))).toEqual({ state: 'pending' });
    await scriptsIdle();
    expect(scriptResult(req([1, 2, 3, null]))).toEqual({ state: 'done', ok: true, value: 2, dropped: 1, n: 4, python: '3.14.2' });
    expect([runs, told > 0]).toEqual([1, true]);
    scriptResult(req([1, 2, 3, null])); await scriptsIdle();
    expect(runs).toBe(1);
    scriptResult(req([1, 2, 4, null])); await scriptsIdle();
    expect([runs, scriptResult(req([1, 2, 4, null]))]).toEqual([2, expect.objectContaining({ value: 7 / 3 })]);
    scriptResult(req([1, 2, 4], { fn: 'shift', params: { by: 2 } })); await scriptsIdle();
    expect(scriptResult(req([1, 2, 4], { fn: 'shift', params: { by: 2 } }))).toMatchObject({ ok: true, y: [3, 4, 6] });
    scriptResult(req([1, 2, 4], { fn: 'shift', params: { by: 3 } })); await scriptsIdle();
    expect(runs).toBe(4);
    off();
  });
  it('an untrusted script doesn’t run until it is trusted; a file changed on disk doesn’t run at all', async () => {
    const sha = await setup();
    trusted.clear();
    scriptResult(req([1, 2])); await scriptsIdle();
    expect([scriptResult(req([1, 2])), runs]).toEqual([{ state: 'untrusted', script: 'k1' }, 0]);
    trusted.add('k1|' + sha); retryScripts(); await scriptsIdle(); scriptResult(req([1, 2])); await scriptsIdle();
    expect([scriptResult(req([1, 2])), runs]).toEqual([expect.objectContaining({ value: 1.5 }), 1]);
    onDisk.set('f1', SRC + '# edited\n'); retryScripts();
    scriptResult(req([5, 6])); await scriptsIdle();
    expect([scriptResult(req([5, 6])), runs]).toEqual([expect.objectContaining({ ok: false, error: 'mine.py changed on disk since it was added (its SHA-256 differs); replace it to use the new version' }), 1]);
  });
  it('a call asked for while answers are being saved still runs; trust given while an answer is on its way counts', async () => {
    const sha = await setup();
    let release!: () => void;
    const slow = new Promise<void>(ok => { release = ok; });
    setScriptHost({ ...host(), save: async e => { saved = { ...e }; await slow; } });
    scriptResult(req([1, 2])); await new Promise(ok => setTimeout(ok, 50));
    scriptResult(req([3, 4]));
    release(); await scriptsIdle();
    expect(scriptResult(req([3, 4]))).toMatchObject({ state: 'done', value: 3.5 });
    // The trust check answers "no" just before trust is given: the call is asked again, not left untrusted.
    trusted.clear();
    let answer!: (v: boolean) => void, first = true;
    setScriptHost({ ...host(), trusted: async (id, h) => (first ? ((first = false), new Promise<boolean>(ok => { answer = ok; })) : trusted.has(id + '|' + h)) });
    scriptResult(req([5, 6])); await new Promise(ok => setTimeout(ok, 50));
    trusted.add('k1|' + sha); retryScripts(); answer(false);
    await scriptsIdle();
    scriptResult(req([5, 6])); await scriptsIdle();
    expect(scriptResult(req([5, 6]))).toMatchObject({ state: 'done', value: 5.5 });
  });
  it('results persist (by data, script, function, parameters and Python), so a reload doesn’t run Python', async () => {
    await setup();
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    const keep = saved;
    setScriptHost(null); setScriptHost({ ...host(), load: async () => keep }); runs = 0;
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect([scriptResult(req([1, 2, 3])), runs]).toEqual([expect.objectContaining({ value: 2 }), 0]);
  });
  it('provenance names the function, the file and its SHA-256, the parameters, Python and the points left out', async () => {
    const sha = await setup();
    const r = req([1, 2, null], { fn: 'shift', params: { by: 2 } });
    scriptResult(r); await scriptsIdle();
    expect(scriptProvenance(r, scriptResult(r))).toBe('shift() from mine.py (SHA-256 ' + sha.slice(0, 12) + '…) · by = 2 · Python 3.14.2 · 1 of 3 points have no value');
  });

  it('the graph draws the transformed curves and says how they were made, or why they aren’t drawn yet', async () => {
    const sha = await setup();
    const { buildGraph, sharedDomain } = await import('../src/lib/graph');
    const { reopen, vaultFixture } = await import('./helpers');
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store, cols = lib.pageCols(store, null), row = store.seqs.find(q => q.name === 'WRWYCR')!;
    const t: Transform = { kind: 'script', script: 'k1', fn: 'shift', params: { by: 10 } };
    const st = lib.mergeSettings({}, { ...store.settings, pmfTransform: t });
    const graph = () => buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols, st, tab: 'pmf', raw: false, fitWell: false, dark: false, domain: sharedDomain(store.seqs, t) })!;
    trusted.clear();
    graph(); await scriptsIdle();
    expect(graph().note).toMatch(/^not transformed: the script isn’t trusted in this browser yet/);
    trusted.add('k1|' + sha); retryScripts();
    expect(graph().note).toMatch(/^transforming with shift\(\)…/);
    await scriptsIdle();
    const m = graph(), run = row.runs.find(r => r.sacch === 'ha')!;
    expect(m.note).toMatch(new RegExp('^transformed by shift\\(\\) from mine\\.py \\(SHA-256 ' + sha.slice(0, 12) + '…\\) · by = 10 · Python 3\\.14\\.2'));
    expect(m.series[0].y.slice(0, 3)).toEqual(run.y.slice(0, 3).map(v => (v == null ? null : v + 10)));
  });
  it('a script transform (R2) is a setting like the others; graphs and matrix values use it once computed, and nothing before', async () => {
    await setup();
    const t: Transform = { kind: 'script', script: 'k1', fn: 'shift', params: { by: 10 } };
    expect(lib.pmfTransform({ pmfTransform: t })).toEqual(t);
    expect(lib.pmfTransform({ pmfTransform: { kind: 'script', fn: 'shift' } as unknown as Transform })).toEqual(lib.ENTROPY);
    expect(lib.transformOf({ ...lib.DEFAULT_ANALYSES[1], transform: t }, {})).toEqual(t);
    const runA = { id: 'r1', sacch: 'c', run: 'a', x: [0.5, 1, 1.5, 2], y: [-3, -1, null, 0], temp: 300, tags: [], time: '', file: '', added: '' } as unknown as Run;
    const seq = { id: 's', name: 'S', seq: '', group: '', desc: '', runs: [runA], extras: [], structures: [] };
    expect([lib.applyTransform(t, runA.x, runA.y, 300), lib.cellValue(seq, 'c', 'min', null, t)]).toEqual([[null, null, null, null], null]);
    await scriptsIdle();
    expect(lib.transformXY(t, runA.x, runA.y, 300)).toEqual({ x: [0.5, 1, 1.5, 2], y: [7, 9, null, 10] });
    expect(lib.cellValue(seq, 'c', 'min', null, t)).toBe(7);
    // Replacing the script (a new SHA-256) is a new result, not the cached one.
    onDisk.set('f2', SRC.replace('v + by', 'v - by'));
    refs = [{ ...refs[0], fileId: 'f2', sha256: await sha256Hex(new TextEncoder().encode(onDisk.get('f2')!)) }];
    trusted.add('k1|' + refs[0].sha256); retryScripts();
    expect(lib.cellValue(seq, 'c', 'min', null, t)).toBeNull();
    await scriptsIdle();
    expect(lib.cellValue(seq, 'c', 'min', null, t)).toBe(-13);
  });
  // Review fix (F138): an answer kept in the vault's cache counts only where the script is trusted and unchanged on
  // disk, and only if it is well formed; a copied vault or another browser asks again.
  it('a cached answer is used only for a trusted, unchanged script, and only if it is a number', async () => {
    const sha = await setup();
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect([scriptResult(req([1, 2, 3])), runs]).toEqual([expect.objectContaining({ value: 2 }), 1]);
    const kept = { ...saved };
    // Another browser (or a copied vault): nothing trusted there, the cache came along.
    setScriptHost(host()); trusted.clear(); saved = { ...kept }; runs = 0;
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect([scriptResult(req([1, 2, 3])), runs]).toEqual([{ state: 'untrusted', script: 'k1' }, 0]);
    // Trusted again: the cached answer counts, and Python doesn't start.
    trusted.add('k1|' + sha); retryScripts(); scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect([scriptResult(req([1, 2, 3])), runs]).toEqual([expect.objectContaining({ value: 2 }), 0]);
    // Changed on disk: never served from the cache.
    setScriptHost(host()); saved = { ...kept }; onDisk.set('f1', SRC + '# edited\n');
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect(scriptResult(req([1, 2, 3]))).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining('changed on disk') }));
    // A planted value that isn't a number is computed again, not believed.
    onDisk.set('f1', SRC); setScriptHost(host()); runs = 0;
    saved = Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, { ...(v as object), value: '12' }]));
    scriptResult(req([1, 2, 3])); await scriptsIdle();
    expect([scriptResult(req([1, 2, 3])), runs]).toEqual([expect.objectContaining({ value: 2 }), 1]);
  });
});

describe('imports (F96): new script records, and the settings that use them follow', () => {
  it('the PMF transform, a type’s transform and a metric (its function and its own transform) point at the imported script', async () => {
    const { exportDataset, importAsProject } = await import('../src/lib/storage/exchange');
    const t: Transform = { kind: 'script', script: 'k1', fn: 'shift' };
    const store = { ...lib.emptyStore(), scripts: [{ id: 'k1', name: 'mine.py', fileId: 'f1', sha256: sha256Text('x'), fns: {} }] };
    const settings = { pmfTransform: t, analyses: [{ ...lib.DEFAULT_ANALYSES[1], transform: t }], metrics: [{ id: 'm', label: 'M', type: 'pmf', fn: { kind: 'script' as const, script: 'k1', fn: 'mean' }, transform: t, agg: 'mean' as const, scale: { kind: 'zero' as const } }] };
    const { text: json } = await exportDataset(store, { project: 'P', settings, src: { read: async () => new Blob(['x']), meta: () => ({ name: 'mine.py', sha256: sha256Text('x'), mime: '', origin: 'upload' }) } });
    const prep = await importAsProject(json), id = prep.store.scripts![0].id, st = prep.store.settings!;
    expect(id).not.toBe('k1');
    // The metric's own transform too (review fix, F138).
    expect([(st.pmfTransform as { script: string }).script, (st.analyses![0].transform as { script: string }).script, (st.metrics![0].fn as { script: string }).script, (st.metrics![0].transform as { script: string }).script]).toEqual([id, id, id, id]);
  });
});

describe('the shared PMF scale skips points without a value', () => {
  it('a transform with nothing to draw doesn’t make the scale 0 to 0', async () => {
    const { sharedDomain } = await import('../src/lib/graph');
    const r = { id: 'r', sacch: 'c', run: 'a', x: [1, 2, 3], y: [null, -4, null], temp: 300 } as unknown as Run, gone = { ...r, id: 'g', y: [null, null, null] } as unknown as Run;
    const seq = (runs: Run[]) => [{ id: 's', name: 'S', seq: '', group: '', desc: '', runs, extras: [], structures: [] }];
    expect([sharedDomain(seq([gone]), lib.NONE), sharedDomain(seq([r]), lib.NONE)]).toEqual([{ lo: -15, hi: 15 }, { lo: -4, hi: -4 }]);
  });
});

describe('a synchronous SHA-256 for keys the drawing code needs at once', () => {
  it('matches the browser’s', async () => {
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), FNS, 'ξ unit: kJ/mol']) expect(sha256Text(s)).toBe(await sha256Hex(new TextEncoder().encode(s)));
  });
});

// Review fixes (F137): one call can't change another's result, and a result is a number or numbers, nothing else.
describe('calls stay apart, results are checked by type', () => {
  it('a script that patches a shared module (statistics, json) doesn’t change the next call', async () => {
    const c = { x: [1, 2, 3], y: [1, 2, 3] };
    expect(value(await call('calc_mean', c))).toBe(2);
    const evil = 'import statistics, json, math\nstatistics.mean = lambda v: 42.0\njson.dumps = lambda o, **k: \'{"kind": "number", "value": "abc"}\'\nmath.isfinite = lambda v: True\ndef evil(x, y) -> float:\n    return 0.0\n';
    const own = await call('evil', c, { src: evil });
    expect(own.ok).toBe(false);
    expect([value(await call('calc_mean', c)), value(await call('calc_barrier', c))]).toEqual([2, 2]);
  });
  it('a result that isn’t a finite number (or numbers) is refused, whatever its shape claims', () => {
    expect([
      checkResult('metric', { kind: 'number', value: 'abc' } as never, 3).ok,
      checkResult('metric', { kind: 'number', value: Infinity } as never, 3).ok,
      checkResult('transform', { kind: 'list', y: [1, 'a'] } as never, 2).ok,
      checkResult('transform', { kind: 'pair', x: 'x', y: [1] } as never, 1).ok,
      checkResult('transform', { kind: 'list', y: [1, 2] } as never, 2).ok,
      checkResult('metric', { kind: 'number', value: 2.5 } as never, 3).ok,
    ]).toEqual([false, false, false, false, true, true]);
  });
});
