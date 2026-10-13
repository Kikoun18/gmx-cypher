// Uploaded scripts (batch 3, R3): what a script offers, read from its code without running it (F89, F90).

import { runPython } from './py';
import type { ScriptFnSettings } from './types';

export type ParamValue = string | number | boolean;
export interface ScriptParam { name: string; kind?: 'float' | 'int' | 'bool' | 'str' | 'literal'; choices?: ParamValue[]; default?: ParamValue; required?: boolean }
export interface ScriptFn { name: string; role: 'metric' | 'transform' | null; params: ScriptParam[]; returns?: string; doc?: string; unit?: string; problem?: string }
export type Discovery = ScriptFn[] | { error: string };

/** The script's top-level functions, from its syntax tree in the sandbox (`_discover` in PY_HELPERS); nothing in the file runs. */
export const discoverScript = (source: string) => runPython('_discover(src)', { src: source }) as Promise<Discovery>;

/** Your choice, else the return annotation's, else a matrix function (F89). */
export const roleOf = (f: ScriptFn, s?: ScriptFnSettings) => s?.role ?? f.role ?? 'metric';

/** "(x, y, k = 1.5, *, need) → float", as the function list shows it. */
export function signature(f: ScriptFn): string {
  const p = f.params.map(q => q.name + (q.required ? '' : ' = ' + (typeof q.default === 'string' ? JSON.stringify(q.default) : String(q.default))));
  return '(' + ['x', 'y', ...p].join(', ') + ')' + (f.returns ? ' → ' + f.returns : '');
}

// --- calls (R3c) -------------------------------------------------------------------------------------------------

const KIND_WORD = { float: 'a number', int: 'a whole number', bool: 'true or false', str: 'text' } as const;
/** The values a call uses: yours where given, else the defaults (F90). A required one without a value, a value of the wrong kind or outside the choices, or a name the function doesn't have, is refused. */
export function checkParams(f: ScriptFn, given: Record<string, unknown> = {}): { ok: true; values: Record<string, ParamValue> } | { ok: false; error: string } {
  if (f.problem) return { ok: false, error: f.name + ' can’t be used: ' + f.problem };
  const extra = Object.keys(given).find(k => !f.params.some(p => p.name === k));
  if (extra) return { ok: false, error: f.name + ' has no parameter ' + extra };
  const values: Record<string, ParamValue> = {};
  for (const p of f.params) {
    const v = given[p.name] ?? p.default;
    if (v === undefined) return { ok: false, error: 'set ' + p.name + ' before using ' + f.name };
    const ok = p.kind === 'float' ? typeof v === 'number' && isFinite(v) : p.kind === 'int' ? Number.isInteger(v) : p.kind === 'bool' ? typeof v === 'boolean'
      : p.kind === 'str' ? typeof v === 'string' : (p.choices || []).includes(v as ParamValue);
    if (!ok) return { ok: false, error: p.name + ' must be ' + (p.kind === 'literal' || !p.kind ? 'one of ' + (p.choices || []).map(c => JSON.stringify(c)).join(', ') : KIND_WORD[p.kind]) };
    values[p.name] = v as ParamValue;
  }
  return { ok: true, values };
}

/** The points a function gets: those with a finite x and y; the rest are left out and counted (section 1.3, question 6). */
export function finitePoints(x: (number | null)[], y: (number | null)[]) {
  const fin = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v);
  const keep = y.flatMap((v, i) => (fin(v) && fin(x[i]) ? [i] : []));
  return { keep, x: keep.map(i => x[i] as number), y: keep.map(i => y[i] as number), dropped: y.length - keep.length, n: y.length };
}
export const missingText = (dropped: number, n: number) => dropped + ' of ' + n + ' points have no value';

export type ScriptOut = { ok: true; value: number } | { ok: true; y: number[]; x?: number[] } | { ok: false; error: string };
type Raw = { kind: 'number'; value: number | null } | { kind: 'list' | 'pair'; x?: (number | null)[]; y?: (number | null)[]; bad?: string } | { kind: 'other'; type: string } | { kind: 'missing' };

/** What a function returned, judged by its role: one finite number, or y for every point (or an (x, y) pair), all finite. */
export function checkResult(role: 'metric' | 'transform', r: Raw, n: number): ScriptOut {
  // Only numbers are believed: whatever the answer's shape claims, every value must be a finite number (F137).
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const nonFinite = (v: unknown) => (Array.isArray(v) ? v.findIndex(q => !num(q)) : 0);
  if (role === 'metric') {
    if (r.kind === 'number') return !num(r.value) ? { ok: false, error: 'returned ' + (r.value == null || typeof r.value === 'number' ? 'nan or infinity' : typeof r.value) + '; a matrix function returns a finite number' } : { ok: true, value: r.value };
    return { ok: false, error: 'returned ' + (r.kind === 'other' ? r.type : 'a list') + '; a matrix function returns one number' };
  }
  if (r.kind === 'number') return { ok: false, error: 'returned one number; a transform returns y, or (x, y)' };
  if (r.kind === 'other') return { ok: false, error: 'returned ' + r.type + '; a transform returns y, or (x, y)' };
  if (r.kind === 'missing') return { ok: false, error: 'no such function' };
  if (r.bad) return { ok: false, error: String(r.bad) };
  const y = r.y!, x = r.x;
  if (!Array.isArray(y) || (r.kind === 'pair' && !Array.isArray(x))) return { ok: false, error: 'returned something that isn’t a list of numbers' };
  const i = nonFinite(x ? x.concat(y) : y);
  if (i >= 0) return { ok: false, error: 'value ' + ((x && i >= x.length ? i - x.length : i) + 1) + ' is nan or infinity' };
  if (x) return x.length === y.length && y.length ? { ok: true, x: x as number[], y: y as number[] } : { ok: false, error: 'returned x and y of different lengths (' + x.length + ' and ' + y.length + ')' };
  return y.length === n ? { ok: true, y: y as number[] } : { ok: false, error: 'returned ' + y.length + ' values for ' + n + ' points' };
}

export interface Call { source: string; sha256: string; fn: string; role: 'metric' | 'transform'; params: Record<string, ParamValue>; x: (number | null)[]; y: (number | null)[] }
/** One interface for both roles (R3c): the points with a value in, a checked result out, with how many points were left out. Python's errors come back as their message. */
export async function callScript(c: Call, run: (code: string, vars: Record<string, unknown>) => Promise<unknown> = runPython): Promise<ScriptOut & { dropped: number; n: number }> {
  const p = finitePoints(c.x, c.y), meta = { dropped: p.dropped, n: p.n };
  if (!p.keep.length) return { ok: false, error: 'no points with a value', ...meta };
  try {
    const raw = (await run('_call(src, name, x, y, params)', { src: c.source, name: c.fn, x: p.x, y: p.y, params: c.params })) as Raw;
    return { ...(raw.kind === 'missing' ? { ok: false as const, error: 'no function ' + c.fn + ' in the script' } : checkResult(c.role, raw, p.keep.length)), ...meta };
  } catch (e) { return { ok: false, error: String((e as Error)?.message || e), ...meta }; }
}
