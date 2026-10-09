// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { TOKENS } from '../../app/src/lib/seq';
import { suggestInputs } from '../src/lib/inputs';
import { fromRanges } from '../src/lib/atoms';
import { nameProblem } from '../src/lib/groups';
import { checkInputs, checkSizes } from './check';
import { inside, listFolder, namesIn, saveUpload } from './files';
import { detectGmx, rdfHelp, type GmxState } from './gmx';
import { HttpError, readJson, type Api } from './http';
import type { Job, Jobs } from './jobs';
import { planRun, startRun } from './runs';
import { saveConfig, type Config } from './state';

export interface Ctx { home: string; version: string; config: Config; gmx: GmxState; jobs: Jobs }

/** A job without its log, for lists and events (the log comes with GET /api/jobs/:id). */
const summary = ({ log: _log, ...j }: Job) => j;

/** Server-Sent Events: every job change and every piece of output, to every open page. */
function events(jobs: Jobs, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const send = (name: string, data: unknown) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n');
  const onJob = (j: Job) => send('job', summary(j)), onOut = (id: string, s: string) => send('out', { id, s });
  jobs.on('job', onJob);
  jobs.on('out', onOut);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => { clearInterval(ping); jobs.off('job', onJob); jobs.off('out', onOut); });
  send('hello', {});
}

/** What the GUI may change (T5); anything else is refused. */
const SETTABLE: (keyof Config)[] = ['gmx', 'allow'];

/** Allowed folders as real paths; each must exist and be a folder. */
export function realFolders(paths: string[]): string[] {
  return paths.map(p => {
    try { const r = realpathSync(p); if (statSync(r).isDirectory()) return r; } catch { /* below */ }
    throw new HttpError(400, p + ' is not a folder');
  });
}

const is = (req: IncomingMessage, method: string, url: URL, path: string) => req.method === method && url.pathname === path;

export function makeApi(ctx: Ctx): Api {
  const state = () => ({ name: 'gmx-cypher', version: ctx.version, tokens: TOKENS, gmx: ctx.gmx, config: ctx.config });
  // Uploaded inputs are used like picked ones, so the uploads folder counts as allowed.
  const roots = () => [...ctx.config.allow, join(ctx.home, 'uploads')];
  return async (req, url, res) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
    if (is(req, 'GET', url, '/api/events')) { events(ctx.jobs, res); return 'handled'; }
    if (is(req, 'GET', url, '/api/jobs')) return { body: ctx.jobs.list().map(summary) };
    if (is(req, 'GET', url, '/api/help/rdf')) {
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
      return { body: { gmx: ctx.gmx.path, version: ctx.gmx.version, options: await rdfHelp(ctx.gmx) } };
    }
    if (is(req, 'GET', url, '/api/ls')) {
      const path = url.searchParams.get('path');
      return { body: path ? listFolder(path, roots()) : { roots: roots() } };
    }
    if (is(req, 'GET', url, '/api/suggest')) {
      const trajectory = inside(url.searchParams.get('trajectory') || '', roots()), dir = dirname(trajectory);
      const got = suggestInputs(basename(trajectory), namesIn(dir, roots()), namesIn(dirname(dir), roots()));
      return { body: { trajectory: { path: trajectory, why: 'picked' }, ...Object.fromEntries(Object.entries(got).map(([k, v]) => [k, { path: join(dir, v!.name), why: v!.why }])) } };
    }
    if (is(req, 'GET', url, '/api/file')) {
      // Structures and indexes only: the GUI draws and reads them. Trajectories stay on the server.
      const path = inside(url.searchParams.get('path') || '', roots());
      if (!/\.(gro|pdb|ndx)$/i.test(path)) throw new HttpError(400, 'only .gro, .pdb and .ndx files are sent to the browser');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      createReadStream(path).pipe(res);
      return 'handled';
    }
    if (is(req, 'POST', url, '/api/check')) return { body: await checkInputs((await readJson<{ inputs: Record<string, string> }>(req)).inputs || {}, ctx.gmx, roots()) };
    if (is(req, 'POST', url, '/api/sizes')) {
      const b = await readJson<{ runInput: string; groups: { name: string; atoms: string }[] }>(req);
      const runInput = inside(b.runInput || '', roots()), names = (b.groups || []).map(g => String(g.name));
      const groups = (b.groups || []).map((g, i) => {
        const bad = nameProblem(names[i], names.filter((_, j) => j !== i));
        if (bad) throw new HttpError(400, names[i] + ': ' + bad);
        try { return { name: names[i], atoms: fromRanges(String(g.atoms)) }; } catch (e) { throw new HttpError(400, names[i] + ': ' + (e as Error).message); }
      });
      if (!groups.length || groups.some(g => !g.atoms.length)) throw new HttpError(400, 'every group needs atoms');
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
      return { body: await checkSizes(ctx.gmx, runInput, groups, ctx.home) };
    }
    if (is(req, 'POST', url, '/api/plan')) return { body: await planRun(ctx, await readJson(req), roots()) };
    if (is(req, 'POST', url, '/api/runs')) return { body: summary((await startRun(ctx, await readJson(req), roots())).job) };
    if (is(req, 'POST', url, '/api/upload')) return { body: await saveUpload(req, ctx.home, url.searchParams.get('name') || 'upload') };
    const job = /^\/api\/jobs\/([\w-]+)(\/cancel|\/record|\/output)?$/.exec(url.pathname);
    if (job) {
      const j = ctx.jobs.get(job[1]);
      if (!j) throw new HttpError(404, 'no job ' + job[1]);
      if (req.method === 'GET' && !job[2]) return { body: j };
      if (req.method === 'POST' && job[2] === '/cancel') { ctx.jobs.cancel(j.id); return { body: summary(j) }; }
      if (req.method === 'GET' && job[2] === '/record') {
        const path = j.meta?.record as string | undefined;
        if (!path || !existsSync(path)) throw new HttpError(404, j.ended ? 'this run has no record' : 'the record is written when the run ends');
        return { body: JSON.parse(readFileSync(path, 'utf8')) };
      }
      if (req.method === 'GET' && job[2] === '/output') {
        // A run's own .xvg files only, by kind: the chart reads them.
        const kind = url.searchParams.get('kind') || '', names = j.meta?.names as Record<string, string> | undefined;
        if (kind !== 'xvg' && kind !== 'cn') throw new HttpError(400, 'no output ' + kind + ': xvg or cn');
        const path = names && join(String(j.meta!.outDir), names[kind]);
        if (!path || !existsSync(path)) throw new HttpError(404, 'this run wrote no ' + kind + ' file');
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        createReadStream(path).pipe(res);
        return 'handled';
      }
    }
    if (is(req, 'POST', url, '/api/config')) {
      const patch = await readJson<Partial<Config>>(req);
      const unknown = Object.keys(patch || {}).filter(k => !SETTABLE.includes(k as keyof Config));
      if (unknown.length) throw new HttpError(400, 'unknown setting: ' + unknown.join(', '));
      if (patch.allow) patch.allow = realFolders(patch.allow);
      ctx.config = { ...ctx.config, ...patch };
      saveConfig(ctx.home, ctx.config);
      if ('gmx' in patch) ctx.gmx = await detectGmx(ctx.config.gmx);
      return { body: state() };
    }
    return null;
  };
}
