import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUNNER = new URL('..', import.meta.url).pathname;
export const APP = new URL('../../app/', import.meta.url).pathname;
export const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), 'gmxc-' + prefix + '-'));

export interface Started { url: string; cookie: string; out: () => string; home: string; proc: ChildProcess }

/** Starts the runner as `npm start` does (node --import ./server/register.mjs server/main.ts) and waits for its URL. */
export async function startRunner(args: string[] = [], env: Record<string, string> = {}, home = tmp('home')): Promise<Started> {
  const proc = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', ...args], { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home, ...env } });
  let out = '';
  const url = await new Promise<string>((resolve, reject) => {
    proc.stdout!.on('data', d => { out += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(out); if (m) resolve(m[1]); });
    proc.stderr!.on('data', d => (out += d));
    proc.on('exit', code => reject(new Error('exited ' + code + ': ' + out)));
  });
  const res = await fetch(url, { redirect: 'manual' });
  return { url, cookie: res.headers.get('set-cookie')!.split(';')[0], out: () => out, home, proc };
}

/** fetch against a started runner, with its cookie. */
export async function api<T = unknown>(r: Started, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(new URL(path, r.url), body === undefined ? { headers: { cookie: r.cookie } } : { method: 'POST', headers: { cookie: r.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as T };
}

/** The fake gmx (T9): real GROMACS text, driven by its arguments. */
export const FAKE_GMX = RUNNER + 'test/fake-gmx.mjs';

/** The API in-process on an ephemeral port, for route tests. */
export async function apiServer(patch: Partial<import('../server/api').Ctx> = {}) {
  const { makeApi } = await import('../server/api');
  const { startServer } = await import('../server/http');
  const { Jobs } = await import('../server/jobs');
  const { DEFAULT_CONFIG } = await import('../server/state');
  const home = tmp('home'), token = 'k'.repeat(43);
  const ctx = { home, version: '0', config: { ...DEFAULT_CONFIG }, gmx: { ok: true, name: 'gmx', path: FAKE_GMX }, jobs: new Jobs(home + '/jobs'), ...patch };
  const server = await startServer({ token, port: 0, api: makeApi(ctx) });
  const base = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port, headers = { cookie: 'gmx-cypher=' + token };
  const call = async <T = any>(path: string, body?: unknown, raw?: BodyInit) => {
    const res = await fetch(base + path, body === undefined && raw === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'content-type': raw ? 'application/octet-stream' : 'application/json' }, body: raw ?? JSON.stringify(body), ...(raw ? { duplex: 'half' } : {}) } as RequestInit);
    return { status: res.status, json: (await res.json()) as T };
  };
  return { ctx, base, headers, call, close: () => new Promise<void>(r => server.close(() => r())) };
}
