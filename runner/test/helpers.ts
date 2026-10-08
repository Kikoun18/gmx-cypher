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
