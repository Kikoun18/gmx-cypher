// Script results for the drawing code (batch 3, R3c). The matrix and the graphs are drawn synchronously, and scripts
// run in a worker, so this is a lookup keyed by content (the SHA-256 of the numbers passed, the script's SHA-256, the
// function, its role and parameters, and the pinned Pyodide) that queues a call when the answer isn't known yet and
// tells subscribers when it is. Answers persist in the vault's cache, so a reload doesn't start Python again.
// A script runs only when trusted in this browser (F96), and only if its bytes on disk still match its record.

import { PYODIDE_VERSION } from './pyFiles';
import { callScript, checkParams, missingText, type Discovery, type ParamValue, type ScriptOut } from './scripts';
import { sha256Bytes, sha256Text } from './sha256';
import { finitePoints } from './scripts';
import type { ScriptRef, Transform } from './types';

export interface ScriptHost {
  scripts(): ScriptRef[];
  info(fileId: string): Promise<{ source: string; sha256: string; fns: Discovery }>;
  trusted(id: string, sha256: string): Promise<boolean>;
  run(code: string, vars: Record<string, unknown>): Promise<unknown>;
  python(): Promise<string>;
  load(): Promise<Record<string, unknown>>;
  save(entries: Record<string, Done>): Promise<void>;
}
export interface ScriptRequest { script: string; fn: string; role: 'metric' | 'transform'; params?: Record<string, ParamValue>; x: (number | null)[]; y: (number | null)[] }
type Done = { state: 'done'; dropped: number; n: number; python: string } & ScriptOut;
export type ScriptResult = { state: 'pending' } | { state: 'untrusted'; script: string } | Done;

const PENDING: ScriptResult = { state: 'pending' }, KEEP = 2000, BIG = 10_000;
let host: ScriptHost | null = null, gen = 0, retries = 0, version = 0, busy: Promise<void> | null = null, saved: Promise<Record<string, Done>> | null = null;
let mem = new Map<string, ScriptResult>();
const queue = new Map<string, { r: ScriptRequest; ref: ScriptRef }>(), transient = new Set<string>(), listeners = new Set<() => void>();
const bump = () => { version++; for (const f of listeners) f(); };

/** The app sets this when a project opens (and null when it closes); tests set their own. */
export function setScriptHost(h: ScriptHost | null) { host = h; gen++; mem = new Map(); queue.clear(); transient.clear(); saved = null; busy = null; bump(); }
export const subscribeScripts = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const scriptsVersion = () => version;
/** Asks again for answers that depended on trust or on the file (after you trust or replace a script). */
export function retryScripts() { retries++; for (const k of transient) mem.delete(k); transient.clear(); bump(); }
export async function scriptsIdle() { while (busy) await busy; }

// The SHA-256 of the numbers a function gets, once per array pair.
const dataShas = new WeakMap<object, WeakMap<object, string>>();
function dataSha(x: (number | null)[], y: (number | null)[]) {
  let m = dataShas.get(y);
  if (!m) dataShas.set(y, (m = new WeakMap()));
  let s = m.get(x);
  if (!s) {
    const p = finitePoints(x, y), dv = new DataView(new ArrayBuffer((p.x.length + p.y.length) * 8));
    p.x.concat(p.y).forEach((v, i) => dv.setFloat64(i * 8, v, true));
    m.set(x, (s = sha256Bytes(new Uint8Array(dv.buffer)) + ':' + p.n));
  }
  return s;
}
const sorted = (p?: Record<string, ParamValue>) => Object.keys(p || {}).sort().map(k => [k, p![k]]);
const keyOf = (r: ScriptRequest, ref: ScriptRef) => sha256Text(JSON.stringify([dataSha(r.x, r.y), ref.sha256, r.fn, r.role, sorted(r.params), PYODIDE_VERSION]));

/** The answer for a call if known; otherwise "pending", and the call is queued. */
export function scriptResult(r: ScriptRequest): ScriptResult {
  const ref = host?.scripts().find(k => k.id === r.script);
  if (!host) return PENDING;
  if (!ref) return { state: 'done', ok: false, error: 'the script with ' + r.fn + '() is no longer in this project', dropped: 0, n: r.y.length, python: '' };
  const key = keyOf(r, ref), hit = mem.get(key);
  if (hit) return hit;
  mem.set(key, PENDING);
  queue.set(key, { r, ref });
  kick();
  return PENDING;
}

// One drain at a time; calls queued while it finishes (saving) start the next one.
function kick() {
  if (busy || !queue.size || !host) return;
  const p: Promise<void> = drain(gen).finally(() => { if (busy === p) busy = null; kick(); });
  busy = p;
}

async function drain(g: number) {
  const h = host!;
  const store: Record<string, Done> = await (saved ??= h.load().then(v => Object.fromEntries(Object.entries(v || {}).filter(([, d]) => (d as Done)?.state === 'done')) as Record<string, Done>, () => ({})));
  // One read and one trust check per script for the whole run of calls.
  const memo = new Map<string, Promise<unknown>>(), once = <T>(k: string, f: () => Promise<T>) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k) as Promise<T>; };
  const hh: ScriptHost = { ...h, info: id => once('i' + id, () => h.info(id)), trusted: (id, sha) => once('t' + id + sha, () => h.trusted(id, sha)) };
  let dirty = false, tries0 = retries;
  while (queue.size && g === gen) {
    const [key, { r, ref }] = queue.entries().next().value!;
    queue.delete(key);
    if (tries0 !== retries) { memo.clear(); tries0 = retries; }
    const tries = retries, res = await compute(hh, r, ref, key, store[key]);
    if (g !== gen) return;
    // Trust given (or a file replaced) while this was on its way: asked again rather than kept.
    if (transient.has(key) && tries !== retries) { transient.delete(key); mem.delete(key); bump(); continue; }
    mem.set(key, res);
    // Long transformed curves are recomputed each session rather than filling the cache.
    if (res.state === 'done' && !transient.has(key) && store[key] !== res && !('y' in res && res.y.length > BIG)) { store[key] = res; dirty = true; }
    bump();
  }
  if (dirty && g === gen) {
    const keys = Object.keys(store);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete store[k];
    await h.save(store).catch(() => {});
  }
}

// A kept answer as the app would accept it fresh: an error's message, or finite numbers of the role's shape.
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v), nums = (v: unknown) => Array.isArray(v) && v.every(isNum);
function wellFormed(d: Done | undefined, role: ScriptRequest['role']): d is Done {
  if (!d || d.state !== 'done' || typeof d.python !== 'string' || !isNum(d.dropped) || !isNum(d.n)) return false;
  if (!d.ok) return typeof d.error === 'string';
  if (role === 'metric') return 'value' in d && isNum(d.value);
  return 'y' in d && nums(d.y) && (!('x' in d) || d.x === undefined || (nums(d.x) && d.x.length === d.y.length));
}

/**
 * The answer to a call: the script must be readable, unchanged on disk and trusted here, the function there and the
 * values valid; then a kept answer from the cache counts (if well formed), else Python runs it (F138: the cache is
 * never a way around trust or the file check).
 */
async function compute(h: ScriptHost, r: ScriptRequest, ref: ScriptRef, key: string, kept?: Done): Promise<ScriptResult> {
  const fail = (error: string, keep = false): ScriptResult => { if (!keep) transient.add(key); return { state: 'done', ok: false, error, dropped: 0, n: r.y.length, python: '' }; };
  let info;
  try { info = await h.info(ref.fileId); } catch (e) { return fail('can’t read ' + ref.name + ': ' + String((e as Error)?.message || e)); }
  if (ref.sha256 && info.sha256 !== ref.sha256) return fail(ref.name + ' changed on disk since it was added (its SHA-256 differs); replace it to use the new version');
  if (!(await h.trusted(ref.id, info.sha256))) { transient.add(key); return { state: 'untrusted', script: ref.id }; }
  if (!Array.isArray(info.fns)) return fail('can’t read ' + ref.name + ': ' + info.fns.error, true);
  const f = info.fns.find(q => q.name === r.fn);
  if (!f) return fail('no function ' + r.fn + ' in ' + ref.name, true);
  const p = checkParams(f, r.params);
  if (!p.ok) return fail(p.error, true);
  if (wellFormed(kept, r.role)) return kept;
  let python = '';
  try { python = await h.python(); } catch (e) { return fail('Python didn’t start: ' + String((e as Error)?.message || e)); }
  const out = await callScript({ source: info.source, sha256: info.sha256, fn: r.fn, role: r.role, params: p.values, x: r.x, y: r.y }, h.run);
  // A time limit says something about this computer, not about the script: asked again next time.
  if (!out.ok && /time limit/.test(out.error)) transient.add(key);
  return { state: 'done', ...out, python };
}

/** A script transform's identity for caches: which script version, function and values (R2's built-ins: their kind). */
export function transformKey(t: Transform): string {
  if (t.kind !== 'script') return t.kind;
  return 'script:' + t.script + ':' + (host?.scripts().find(k => k.id === t.script)?.sha256 || '') + ':' + t.fn + ':' + JSON.stringify(sorted(t.params));
}

/** How a result was made (section 1.3): the function, the file and its SHA-256, the values, Python, and the points left out. */
export function scriptProvenance(r: ScriptRequest, res: ScriptResult): string {
  const ref = host?.scripts().find(k => k.id === r.script);
  const parts = [r.fn + '() from ' + (ref ? ref.name + ' (SHA-256 ' + (ref.sha256 || '').slice(0, 12) + '…)' : 'a removed script')];
  for (const [k, v] of sorted(r.params)) parts.push(k + ' = ' + (typeof v === 'string' ? JSON.stringify(v) : String(v)));
  if (res.state === 'done' && res.python) parts.push('Python ' + res.python);
  if (res.state === 'done' && res.dropped) parts.push(missingText(res.dropped, res.n));
  return parts.join(' · ');
}
