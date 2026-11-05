import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUNNER = new URL('..', import.meta.url).pathname;
export const APP = new URL('../../matrix/', import.meta.url).pathname;
/** Your force field's .tdb block names (no parameters) and its watermodels.dat: pdb2gmx's menus (T230). */
const FF_MENUS = RUNNER + 'test/fixtures/build/ff-menus';
// A run leaves nothing in the system's temp folder (a session of runs had filled the disk with them, 65 MB a runner
// home): Vitest removes each test file's folders after it (test/setup.ts), Playwright when its worker ends.
const made: string[] = [];
export const cleanTmp = () => { for (const d of made.splice(0)) try { rmSync(d, { recursive: true, force: true }); } catch { /* already gone */ } };
process.on('exit', cleanTmp);
export const tmp = (prefix: string) => { const d = mkdtempSync(join(tmpdir(), 'gmxc-' + prefix + '-')); made.push(d); return d; };

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

/** A copy of app/test/fixtures/cluster/ with the test system's files as each run's trajectory, run input and structure. */
export function clusterCopy() {
  const root = tmp('cluster');
  cpSync(APP + 'test/fixtures/cluster', root, { recursive: true });
  for (const [col, run] of [['ha', '1'], ['ha', '2'], ['pg', '1']]) {
    const d = join(root, 'hmr+fast+6', col, 'WRWYCR/9.multiwalker', run);
    mkdirSync(d, { recursive: true });
    for (const [from, to] of [['nvt.xtc', '07_md.xtc'], ['nvt.tpr', '07_md.tpr'], ['nvt.gro', '07_md.gro']]) copyFileSync(RUNNER + 'test/fixtures/nvt/' + from, join(d, to));
  }
  return root;
}

/** A base folder as the notebook's: the saccharide (the first 110 atoms of a real system), the mdp files, ff/. */
export function baseFolder() {
  const base = tmp('base'), system = readFileSync(new URL('./fixtures/decypher/9.multiwalker.gro', import.meta.url), 'utf8').split('\n');
  for (const d of ['molecules/saccharides', 'inputs', 'ff/charmm36s-jul2022-prosECCo75.ff', 'ff/TIP3PF', 'ff/ions']) mkdirSync(join(base, d), { recursive: true });
  writeFileSync(join(base, 'molecules/saccharides/o111.gro'), ['o111', '  110', ...system.slice(2, 112), system[2 + Number(system[1])], ''].join('\n'));
  // Your mdp files are not in the fixtures (sample 4): a line each, which the fake grompp only copies to its mdout.
  for (const f of ['minim', 'eq_nvt', 'eq_npt', 'awh', 'awh_hmr', 'pull', 'hmr_multi']) writeFileSync(join(base, 'inputs', f + '.mdp'), '; ' + f + '.mdp\n');
  // The force field's files a build reads (R4's check), each a line: the fake tools read none of them.
  for (const f of ['ADDff.itp', 'o111-ADD.itp', 'ions/iontypes.itp', 'ions/ions.itp', 'TIP3PF/TIP3PF_orig.itp', 'TIP3PF/TIP3PF_HMR.itp', 'charmm36s-jul2022-prosECCo75.ff/forcefield.itp', 'charmm36s-jul2022-prosECCo75.ff/aminoacids.rtp'])
    writeFileSync(join(base, 'ff', f), '; yours\n');
  // pdb2gmx's menus: your force field's .tdb block names and its water models (test/fixtures/build/ff-menus).
  for (const f of readdirSync(FF_MENUS).filter(f => f !== 'README.md')) copyFileSync(join(FF_MENUS, f), join(base, 'ff/charmm36s-jul2022-prosECCo75.ff', f));
  return base;
}
