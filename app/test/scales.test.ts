import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { norm } from '../src/lib/pmf';
import { scaleFor, contrastOn } from '../src/lib/scales';
import { AREA, metricCell, tileProvenance, tileText, type Tile } from '../src/lib/metrics';
import type { Extra, MetricDef, Seq, Settings } from '../src/lib/types';

// R4b: colour scales per metric (question 19 / section 1.3), tiles with spread and errors, provenance tooltips.
const def = (o: Partial<MetricDef>): MetricDef => ({ id: 'm', label: 'mean · Order parameters · Full membrane', type: 'order', fn: { kind: 'builtin', name: 'mean' }, agg: 'mean', scale: { kind: 'minmax' }, ...o });
const val = (v: number, o: Partial<Extract<Tile, { kind: 'value' }>> = {}): Tile => ({ kind: 'value', v, n: 1, dropped: 0, points: 10, ...o });

describe('scales', () => {
  it('from zero is today’s magnitude scale', () => {
    const s = scaleFor(AREA, [-0.55, -0.45, -0.1]);
    for (const v of [-0.55, -0.45, -0.1]) expect(s.t(v)).toBe(norm(v, 0.55));
    expect(s.legend('kJ·nm/mol')).toEqual({ title: 'Area magnitude', range: '0 → 0.6 kJ·nm/mol' });
  });
  it('min–max: the lowest on the first tinted step, the highest at the top; all equal or a single value in the middle', () => {
    const s = scaleFor(def({}), [0.272, 0.285, 0.307]);
    expect([s.t(0.272), s.t(0.307), Number(s.t(0.2895).toFixed(3))]).toEqual([0.15, 1, 0.575]);
    expect([scaleFor(def({}), [3, 3, 3]).t(3), scaleFor(def({}), [7]).t(7)]).toEqual([0.5, 0.5]);
    expect(s.legend('')).toEqual({ title: 'mean · Order parameters · Full membrane · lowest to highest', range: '0.272 → 0.307' });
  });
  it('diverging around a value: coral above, sky below, the value itself neutral', () => {
    const s = scaleFor(def({ scale: { kind: 'diverging', center: 1 } }), [-1, 1, 2]);
    expect([s.t(2), s.t(-1), s.t(1), s.t(1.5)]).toEqual([0.5, 1, 0, 0.25]);
    expect([s.side(2), s.side(-1)]).toEqual(['above', 'below']);
    expect(s.color(-1, false)).not.toBe(s.color(3, false));
    expect(s.legend('K')).toEqual({ title: 'mean · Order parameters · Full membrane · around 1', range: '−1 ← 1 → 2 K' });
  });
  it('no values: nothing to scale, nothing breaks', () => {
    expect(scaleFor(def({}), []).t(1)).toBe(0.5);
    expect(scaleFor(AREA, []).t(0)).toBe(0);
  });
  it('the tile text has at least 4.5:1 contrast on every step of both ramps, light and dark', () => {
    for (const dark of [false, true]) for (let i = 0; i <= 20; i++) {
      const up = scaleFor(def({ scale: { kind: 'diverging', center: 0 } }), [-20, 20]);
      for (const v of [i, -i]) expect(contrastOn(up.color(v, dark), up.ink(v, dark))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('tiles: the value, its spread or error, or why there is none', () => {
  it('spread over runs, a block error, one run, none, computing', () => {
    expect(tileText(val(0.292503, { n: 3, sd: 0.00211 }), def({}))).toEqual({ main: '0.293', spread: '± 0.0021 · n 3' });
    expect(tileText(val(310.0434, { err: 0.011461 }), def({ type: 'temperature' }))).toEqual({ main: '310.04', spread: '± 0.011 block' });
    expect(tileText(val(-0.55, { n: 2, sd: 0.123 }), AREA)).toEqual({ main: '-0.55', spread: '± 0.12 · n 2' });
    expect(tileText({ kind: 'none', reason: 'ValueError: x must contain values on both sides of 0' }, def({}))).toEqual({ main: '—', spread: 'error' });
    expect(tileText({ kind: 'pending' }, def({}))).toEqual({ main: '…', spread: '' });
    // The tileSpread setting (off by default) leaves the spread out of the tile; its failure note stays, and the tooltip keeps the spread.
    expect(tileText(val(0.292503, { n: 3, sd: 0.00211 }), def({}), false)).toEqual({ main: '0.293', spread: '' });
    expect(tileText(val(310.0434, { err: 0.011461 }), def({ type: 'temperature' }), false)).toEqual({ main: '310.04', spread: '' });
    expect(tileText({ kind: 'none', reason: 'ValueError' }, def({}), false)).toEqual({ main: '—', spread: 'error' });
  });
  it('the tooltip says how the number was made (section 1.3)', () => {
    const cs = (ys: number[]) => [{ id: 'c', label: 'Full membrane', file: '', x: ys.map((_, i) => i + 1), y: ys }];
    const ex = (slot: string, ys: number[]) => ({ id: 'x' + slot, type: 'order', sacch: 'c', run: slot, time: '', file: '', added: '', curves: cs(ys) }) as Extra;
    const s: Seq = { id: 's', name: 'S', seq: '', group: '', desc: '', runs: [], extras: [ex('a', [0.2, 0.4]), ex('b', [0.3, 0.3]), ex('c', [0.25, NaN])], structures: [] };
    const st = lib.mergeSettings({}, {}) as Settings, d = def({});
    const t = metricCell(s, 'c', d, { st, skip: null });
    expect(tileProvenance(s, 'c', d, t, { st, skip: null })).toBe('0.283 ± 0.029 (SD, n = 3) · mean · no transform · Order parameters · Full membrane · runs 1–3 · 5 of 6 points');
    expect(tileProvenance(s, 'c', def({ unit: 'nm' }), t, { st, skip: null })).toMatch(/^0\.283 ± 0\.029 nm \(SD, n = 3\) · /);
    expect(tileProvenance(s, 'c', def({ fn: { kind: 'builtin', name: 'at' }, params: { x: 9 } }), metricCell(s, 'c', def({ fn: { kind: 'builtin', name: 'at' }, params: { x: 9 } }), { st, skip: null }), { st, skip: null }))
      .toBe('no value: x = 9 is outside the data (1 to 2) · value at x · x = 9 · no transform · Order parameters · Full membrane · runs 1–3');
  });
});

describe('matrix tiles show no spread unless switched on', () => {
  it('off in the defaults, a browser preference (not the project’s), and a project cannot turn it on', async () => {
    const lib = await import('../src/lib/seq');
    expect(lib.DEFAULT_SETTINGS.tileSpread).toBe(false);
    expect(lib.mergeSettings({}, undefined).tileSpread).toBe(false);
    expect(lib.splitSettings({ tileSpread: true, rowAll: true })).toEqual({ project: { rowAll: true }, app: { tileSpread: true } });
    expect(lib.mergeSettings({ tileSpread: true }, { rowAll: true }).tileSpread).toBe(true);
    const kept = new Map<string, string>();
    Object.assign(globalThis, { localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) } });
    const { loadPrefs, savePrefs } = await import('../src/lib/prefs');
    savePrefs({ tileSpread: true, rowAll: true });
    expect(loadPrefs()).toEqual({ tileSpread: true });
  });
});
