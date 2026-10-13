// Matrix metrics (batch 3, R4a). A metric is a definition: the analysis type, which curve (by its place in the
// analysis), the transform (the type's own unless the metric sets one), the function (built-in or script) with its
// values, and the mean over runs with n and SD. Area and Min are built-ins over PMF runs that keep today's numbers.

import * as lib from './seq';
import { fmt, wellArea } from './pmf';
import { checkParams, finitePoints, type ParamValue, type ScriptFn } from './scripts';
import { scriptResult, transformKey } from './scriptRuns';
import type { Curve, Extra, MetricDef, Run, ScriptRef, Seq, Settings, Slot, Transform } from './types';

export const AREA: MetricDef = { id: 'area', label: 'Area', type: 'pmf', fn: { kind: 'builtin', name: 'area' }, agg: 'mean', unit: 'kJ·nm/mol', scale: { kind: 'zero' } };
export const MIN: MetricDef = { id: 'min', label: 'Min', type: 'pmf', fn: { kind: 'builtin', name: 'min' }, agg: 'mean', unit: 'kJ/mol', scale: { kind: 'zero' } };

type Out = { v: number; err?: number } | { error: string };
interface Builtin { label: string; desc: string; params?: ScriptFn['params']; pmf?: 'area' | 'min'; run(x: number[], y: number[], p: Record<string, ParamValue>): Out }

const extreme = (y: number[], sign: 1 | -1) => y.reduce((m, v) => (sign * v > sign * m ? v : m), y[0]);
/** The largest standard error of the mean over blocking levels with at least 32 blocks (Flyvbjerg–Petersen). */
export function blockError(y: number[]): number {
  let x = y.slice(), best = 0;
  while (x.length >= 32) {
    const n = x.length, m = x.reduce((a, b) => a + b, 0) / n, c0 = x.reduce((a, v) => a + (v - m) ** 2, 0) / n;
    best = Math.max(best, Math.sqrt(c0 / (n - 1)));
    x = Array.from({ length: n >> 1 }, (_, i) => (x[2 * i] + x[2 * i + 1]) / 2);
  }
  return best;
}

/** Built-in functions of one curve (question 18), on its points with a value. */
export const BUILTINS: Record<string, Builtin> = {
  area: { label: 'Area', desc: 'integrated well: the area below zero', pmf: 'area', run: (x, y) => ({ v: wellArea(x, y) }) },
  min: { label: 'Min', desc: 'the deepest point', pmf: 'min', run: (_x, y) => ({ v: extreme(y, -1) }) },
  mean: { label: 'mean', desc: 'the mean of y', run: (_x, y) => ({ v: y.reduce((a, b) => a + b, 0) / y.length }) },
  max: { label: 'max', desc: 'the largest y', run: (_x, y) => ({ v: extreme(y, 1) }) },
  minimum: { label: 'minimum', desc: 'the smallest y', run: (_x, y) => ({ v: extreme(y, -1) }) },
  barrier: { label: 'barrier (max − min)', desc: 'the largest y minus the smallest', run: (_x, y) => ({ v: extreme(y, 1) - extreme(y, -1) }) },
  at: {
    label: 'value at x', desc: 'y at a given x, joining neighbouring points by straight lines', params: [{ name: 'x', kind: 'float', required: true }],
    run: (x, y, p) => {
      const at = Number(p.x);
      for (let i = 0; i < x.length; i++) {
        if (x[i] === at) return { v: y[i] };
        if (i + 1 < x.length && (x[i] - at) * (x[i + 1] - at) < 0) return { v: y[i] + ((at - x[i]) / (x[i + 1] - x[i])) * (y[i + 1] - y[i]) };
      }
      return { error: 'x = ' + at + ' is outside the data (' + extreme(x, -1) + ' to ' + extreme(x, 1) + ')' };
    },
  },
  blockmean: {
    label: 'mean ± block error', desc: 'for time series: the mean, with an error that accounts for correlation (block averaging)',
    run: (_x, y) => (y.length < 32 ? { error: 'too short for a block error (32 points or more)' } : { v: y.reduce((a, b) => a + b, 0) / y.length, err: blockError(y) }),
  },
};

/** A definition as stored in metrics.json: known fields of the right kinds; anything unusable is left out. */
export function cleanMetric(v: unknown): MetricDef | undefined {
  const m = v as Partial<MetricDef> & { fn?: { kind?: string; name?: unknown; script?: unknown; fn?: unknown } } | null;
  if (!m || typeof m.id !== 'string' || !m.id || typeof m.type !== 'string' || !m.type) return undefined;
  const f = m.fn;
  const fn: MetricDef['fn'] | null = f?.kind === 'builtin' && typeof f.name === 'string' ? { kind: 'builtin', name: f.name }
    : f?.kind === 'script' && typeof f.script === 'string' && typeof f.fn === 'string' ? { kind: 'script', script: f.script, fn: f.fn } : null;
  if (!fn) return undefined;
  const t = m.transform ? lib.cleanTransform(m.transform) : undefined;
  const params = Object.fromEntries(Object.entries(m.params && typeof m.params === 'object' ? m.params : {}).filter(([, p]) => ['string', 'number', 'boolean'].includes(typeof p)));
  const kind = m.scale && ['zero', 'minmax', 'diverging'].includes(m.scale.kind) ? m.scale.kind : 'minmax';
  return {
    id: m.id, label: typeof m.label === 'string' && m.label ? m.label : m.id, type: m.type,
    ...(Number.isInteger(m.curve) && m.curve! >= 0 ? { curve: m.curve } : {}), ...(t ? { transform: t } : {}), fn,
    ...(Object.keys(params).length ? { params } : {}), agg: 'mean', ...(typeof m.unit === 'string' && m.unit ? { unit: m.unit } : {}),
    scale: { kind, ...(kind === 'diverging' && typeof m.scale?.center === 'number' && isFinite(m.scale.center) ? { center: m.scale.center } : {}) },
  };
}

/** The metric a page shows: Area or Min, or one of the project's definitions; anything else falls back to Area. */
export function resolveMetric(id: string | undefined, st: Partial<Settings>): MetricDef {
  if (id === MIN.id) return MIN;
  return (id && id !== AREA.id && (st.metrics || []).map(cleanMetric).find(m => m?.id === id)) || AREA;
}

/** A metric's unit: yours, else Area's and Min's, else the y unit of its type for built-ins that keep y's unit. */
export function metricUnit(def: MetricDef, st: Settings): string {
  if (def.unit) return def.unit;
  if (def.fn.kind !== 'builtin' || !['mean', 'max', 'minimum', 'barrier', 'at', 'blockmean'].includes(def.fn.name)) return '';
  const y = def.type === 'pmf' ? st.yLabel || '' : lib.getAnalyses(st).find(t => t.k === def.type)?.yLabel || '';
  const u = lib.splitUnit(y)[1];
  return u ? u.slice(1, -1) : def.type === 'pmf' ? 'kJ/mol' : '';
}

export type Tile =
  | { kind: 'value'; v: number; n: number; sd?: number; err?: number; dropped: number; points: number }
  | { kind: 'none'; reason: string }
  | { kind: 'pending' }
  | { kind: 'empty'; hidden: boolean };

const none = (reason: string): Tile => ({ kind: 'none', reason });

/** A script transform's state on one curve: nothing (built-ins are always ready), or why there is no value. */
function transformBlock(t: Transform, x: (number | null)[], y: (number | null)[]): Tile | null {
  if (t.kind !== 'script') return null;
  const r = scriptResult({ script: t.script, fn: t.fn, role: 'transform', params: t.params, x, y });
  if (r.state === 'pending') return { kind: 'pending' };
  if (r.state === 'untrusted') return none('the transform’s script isn’t trusted in this browser yet');
  return r.ok ? null : none(t.fn + '(): ' + r.error);
}

/** The runs a tile is made from (PMF runs, or the analyses of the metric's type, without hidden ones) and the transform they get. */
/** The transform a metric reads its curves through: its own, else PMF's correction setting, else its type's. */
export function metricTransform(def: MetricDef, st: Settings): Transform {
  const T = def.type === 'pmf' ? null : lib.getAnalyses(st).find(x => x.k === def.type);
  return (def.transform && lib.cleanTransform(def.transform)) || (def.type === 'pmf' ? lib.pmfTransform(st) : T ? lib.transformOf(T, st) : lib.NONE);
}

/** A script transform named for provenance (section 1.3, F138): the function, its file and SHA-256, and the values. */
export function scriptTransformName(t: Extract<Transform, { kind: 'script' }>, scripts: ScriptRef[] = []): string {
  const ref = scripts.find(k => k.id === t.script);
  return ['transformed by ' + t.fn + '() from ' + (ref ? ref.name + ' (SHA-256 ' + (ref.sha256 || '').slice(0, 12) + '…)' : 'a removed script'),
    ...Object.keys(t.params || {}).sort().map(k => k + ' = ' + String(t.params![k]))].join(' · ');
}

function cellItems(seq: Seq, col: string, def: MetricDef, o: { st: Settings; skip: lib.SkipFn }) {
  const pmf = def.type === 'pmf';
  const all: (Run | Extra)[] = pmf ? seq.runs.filter(r => r.sacch === col && r.state !== 'missing') : seq.extras.filter(e => e.type === def.type && e.sacch === col);
  const items = all.filter(q => !(o.skip && o.skip(seq, q as Run)));
  const T = pmf ? null : lib.getAnalyses(o.st).find(x => x.k === def.type);
  return { pmf, all, items, T, t: metricTransform(def, o.st) };
}

// An analysis curve's transformed points, kept while the curve, the transform and its answer stay the same.
const kept = new WeakMap<object, { key: string; xy: { x: (number | null)[]; y: (number | null)[] } }>();
/**
 * The points a metric reads from one run or analysis: its curve through the transform (the tile and its provenance).
 * The same arrays each time (F138): PMF runs through `curveStats`' cache, curves through `kept`, so the SHA-256 of a
 * script's input is worked out once rather than on every redraw.
 */
export function metricPoints(q: Run | Extra, def: MetricDef, st: Settings, t: Transform = metricTransform(def, st)) {
  if (def.type === 'pmf') return lib.runXY(q as Run, t);
  const c = (q as Extra).curves[def.curve ?? 0];
  if (!c) return null;
  if (t.kind === 'none') return { x: c.x, y: c.y };
  const temp = Number(st.temp) || lib.DEFAULT_TEMP, key = transformKey(t) + '|' + temp, hit = kept.get(c);
  if (hit && hit.key === key) return hit.xy;
  const xy = lib.transformXY(t, c.x, c.y, temp);
  // A script's transform is kept only once its answer is there.
  if (t.kind !== 'script' || scriptResult({ script: t.script, fn: t.fn, role: 'transform', params: t.params, x: c.x, y: c.y }).state === 'done') kept.set(c, { key, xy });
  return xy;
}

/**
 * One tile: the metric on each run of the cell (PMF runs, or the analyses of the metric's type) that isn't hidden,
 * then their mean, with n and the sample SD (or a single run's block error). "empty" when the cell has nothing of
 * that type; "pending" while a script's answer is on its way; "none" with the reason when there is no value.
 */
export function metricCell(seq: Seq, col: string, def: MetricDef, o: { st: Settings; skip: lib.SkipFn }): Tile {
  const { pmf, all, items, T, t } = cellItems(seq, col, def, o);
  if (!items.length) return { kind: 'empty', hidden: all.length > 0 };
  if (!pmf && !T) return none('no analysis type ' + def.type);
  const b = def.fn.kind === 'builtin' ? BUILTINS[def.fn.name] : null;
  if (def.fn.kind === 'builtin' && !b) return none('no built-in function ' + def.fn.name);
  let params: Record<string, ParamValue> = {};
  if (b?.params) { const p = checkParams({ name: b.label, role: 'metric', params: b.params }, def.params); if (!p.ok) return none(p.error); params = p.values; }
  const vals: { v: number; err?: number }[] = [];
  // Every run's call is asked for before answering "pending", so they are all queued at once.
  let dropped = 0, points = 0, noCurve = false, pending = false;
  // A script transform's state on this run: 'none' ends the tile, 'wait' skips the run until its answer comes.
  const block = (b: Tile | null) => (b?.kind === 'pending' ? ((pending = true), 'wait' as const) : b);
  for (const q of items) {
    let x: (number | null)[], y: (number | null)[];
    if (pmf) {
      const r = q as Run;
      // Area and Min on PMF runs: exactly today's numbers (curveStats, with its cache).
      if (b?.pmf) {
        const s = lib.curveStats(r, t), v = s[b.pmf];
        if (isFinite(v)) { vals.push({ v }); points += r.y.length; continue; }
        const bad = block(transformBlock(t, r.x, r.y));
        if (bad === 'wait') continue;
        return bad ?? none('no value');
      }
      const bad = block(transformBlock(t, r.x, r.y));
      if (bad === 'wait') continue;
      if (bad) return bad;
      ({ x, y } = metricPoints(r, def, o.st, t)!);
    } else {
      const c: Curve | undefined = (q as Extra).curves[def.curve ?? 0];
      if (!c) { noCurve = true; continue; }
      if (c.state === 'pending') { pending = true; continue; }
      if (c.state === 'missing') return none('the original of ' + (c.label || 'a curve') + ' is missing');
      const bad = block(transformBlock(t, c.x, c.y));
      if (bad === 'wait') continue;
      if (bad) return bad;
      ({ x, y } = metricPoints(q, def, o.st, t)!);
    }
    const p = finitePoints(x, y);
    dropped += p.dropped; points += p.n;
    if (!p.keep.length) return none('no points with a value');
    if (b) {
      const out = b.run(p.x, p.y, params);
      if ('error' in out) return none(out.error);
      vals.push(out);
    } else if (def.fn.kind === 'script') {
      const r = scriptResult({ script: def.fn.script, fn: def.fn.fn, role: 'metric', params: def.params as Record<string, ParamValue> | undefined, x, y });
      if (r.state === 'pending') { pending = true; continue; }
      if (r.state === 'untrusted') return none('the script isn’t trusted in this browser yet');
      if (!r.ok) return none(r.error);
      if ('value' in r) vals.push({ v: r.value });
    }
  }
  if (pending) return { kind: 'pending' };
  if (!vals.length) return noCurve ? none('no curve ' + ((def.curve ?? 0) + 1) + ' in these ' + T!.label + ' analyses') : none('no value');
  const n = vals.length, v = vals.reduce((a, q) => a + q.v, 0) / n;
  const tile: Tile = { kind: 'value', v, n, dropped, points };
  if (n > 1) tile.sd = Math.sqrt(vals.reduce((a, q) => a + (q.v - v) ** 2, 0) / (n - 1));
  else if (vals[0].err != null) tile.err = vals[0].err;
  return tile;
}

const sig2 = (v: number) => String(Number(v.toPrecision(2)));
/** PMF's Area or Min: today's numbers, written as before (`fmt`), on the from-zero scale. */
export const isPmfBuiltin = (d: MetricDef) => d.type === 'pmf' && d.fn.kind === 'builtin' && !!BUILTINS[d.fn.name]?.pmf;
const valueText = (v: number, d: MetricDef) => (isPmfBuiltin(d) ? fmt(v) : lib.fmtValue(v));

/**
 * What a tile shows (R4b): the value, and under it the spread over runs ("± SD · n 3") or a single run's block error.
 * The spread is left out when `withSpread` is false (the tileSpread setting, off unless switched on); the tooltip keeps it.
 */
export function tileText(t: Tile, d: MetricDef, withSpread = true): { main: string; spread: string } {
  if (t.kind === 'value') return { main: valueText(t.v, d), spread: !withSpread ? '' : t.n > 1 && t.sd != null ? '± ' + sig2(t.sd) + ' · n ' + t.n : t.err != null ? '± ' + sig2(t.err) + ' block' : '' };
  if (t.kind === 'none') return { main: '—', spread: 'error' };
  return { main: t.kind === 'pending' ? '…' : '', spread: '' };
}

/**
 * How a tile's number was made (section 1.3, question 19): the value with its spread, the function (a script with its
 * file, SHA-256 and Python), the values, the transform, the data (type and curve), the runs and the points used.
 */
export function tileProvenance(seq: Seq, col: string, d: MetricDef, tile: Tile, o: { st: Settings; skip: lib.SkipFn; scripts?: ScriptRef[]; short?: boolean }): string {
  const { items, T, t, pmf } = cellItems(seq, col, d, o), parts: string[] = [];
  if (tile.kind === 'value') {
    const unit = metricUnit(d, o.st), spread = tile.n > 1 && tile.sd != null ? ' ± ' + sig2(tile.sd) : tile.err != null ? ' ± ' + sig2(tile.err) : '';
    parts.push(valueText(tile.v, d) + spread + (unit ? ' ' + unit : '') + (tile.n > 1 && tile.sd != null ? ' (SD, n = ' + tile.n + ')' : tile.err != null ? ' (block error)' : ' (1 run)'));
  }
  else if (tile.kind === 'none') parts.push('no value: ' + tile.reason);
  else if (tile.kind === 'pending') parts.push('computing…');
  if (d.fn.kind === 'builtin') parts.push(BUILTINS[d.fn.name]?.label || d.fn.name);
  else {
    // The first run's answer, asked for exactly as the tile asked (so it is the one already there, never a new call).
    const fn = d.fn, ref = (o.scripts || []).find(k => k.id === fn.script), xy = items[0] ? metricPoints(items[0], d, o.st, t) : null;
    const r = xy ? scriptResult({ script: fn.script, fn: fn.fn, role: 'metric', params: d.params as Record<string, ParamValue> | undefined, x: xy.x, y: xy.y }) : null;
    parts.push(fn.fn + ' (' + (ref ? ref.name + ', SHA-256 ' + (ref.sha256 || '').slice(0, 12) + '…' : 'a removed script') + (r?.state === 'done' && r.python ? ', Python ' + r.python : '') + ')');
  }
  for (const k of Object.keys(d.params || {}).sort()) parts.push(k + ' = ' + String(d.params![k]));
  parts.push(t.kind === 'none' ? 'no transform' : t.kind === 'script' ? scriptTransformName(t, o.scripts) : lib.TRANSFORMS[t.kind].label);
  // An export's legend (R8d): the metric, then the value and how it was made, without the data details.
  if (o.short) return d.label + ': ' + parts.filter((x, i) => i === 0 || x !== d.label).join(' · ');
  const curve = pmf ? '' : (items as Extra[]).map(e => e.curves[d.curve ?? 0]?.label).find(Boolean);
  parts.push(pmf ? 'PMF' : (T?.label || d.type) + (curve ? ' · ' + curve : ''));
  const nums = items.map(q => lib.SLOTS.indexOf(q.run as Slot) + 1).sort((a, b) => a - b);
  if (nums.length) parts.push((nums.length > 1 ? 'runs ' : 'run ') + (nums.length > 2 && nums[nums.length - 1] - nums[0] === nums.length - 1 ? nums[0] + '–' + nums[nums.length - 1] : nums.join(', ')));
  if (tile.kind === 'value') parts.push(tile.points - tile.dropped + ' of ' + tile.points + ' points');
  return parts.join(' · ');
}
