// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { TOKENS } from '../../app/src/lib/seq';
import { inputRole, suggestInputs } from '../src/lib/inputs';
import { fromRanges } from '../src/lib/atoms';
import { nameProblem } from '../src/lib/groups';
import { checkInputs, checkSizes } from './check';
import { inside, listFolder, namesIn, saveUpload } from './files';
import { detectGmx, rdfHelp, type GmxState } from './gmx';
import { HttpError, readJson, sendFile, type Api } from './http';
import type { Job, Jobs } from './jobs';
import { Batches, checkRunInputs, findTrajectories, sendAll } from './batch';
import { listRecipes, readRecipe, saveRecipe } from './recipes';
import { recipeFileProblems, type Recipe } from '../src/lib/recipe';
import { cpus } from 'node:os';
import { planRun, recordWritten, startRun } from './runs';
import { sendToInbox } from './send';
import { landingFor, listProjects, openVault, projectSummary, readProject } from './vault';
import type { Fields } from '../src/lib/landing';
import type { RunRecord } from '../src/lib/record';
import { saveConfig, type Config } from './state';

export interface Ctx { home: string; version: string; config: Config; gmx: GmxState; jobs: Jobs }

/** A job without its log, for lists and events (the log comes with GET /api/jobs/:id). */
const summary = ({ log: _log, ...j }: Job) => j;

/** Server-Sent Events: every job and batch change and every piece of output, to every open page. */
function events(jobs: Jobs, batches: Batches, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const send = (name: string, data: unknown) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n');
  const onJob = (j: Job) => send('job', summary(j)), onOut = (id: string, s: string) => send('out', { id, s });
  const onBatch = (b: unknown) => send('batch', b);
  jobs.on('job', onJob);
  jobs.on('out', onOut);
  batches.on('batch', onBatch);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => { clearInterval(ping); jobs.off('job', onJob); jobs.off('out', onOut); batches.off('batch', onBatch); });
  send('hello', {});
}

/** What the GUI may change (T5); anything else is refused. */
const SETTABLE: (keyof Config)[] = ['gmx', 'allow', 'vault', 'pmfUrl'];

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
  const batches = new Batches(ctx, roots);
  const checked = (r: unknown) => { const p = recipeFileProblems(r); if (p.length) throw new HttpError(400, p.join('; ')); return r as Recipe; };
  return async (req, url, res) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
    if (is(req, 'GET', url, '/api/events')) { events(ctx.jobs, batches, res); return 'handled'; }
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
      sendFile(res, path, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
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
    if (is(req, 'GET', url, '/api/vault')) {
      if (!ctx.config.vault) return { body: { path: null } };
      try {
        const v = await openVault(ctx.config.vault);
        return { body: { path: v.path, schema: v.schema, compat: v.compat, projects: (await listProjects(v)).map(p => ({ id: p.id, name: p.name, dir: p.dir, desc: p.desc })) } };
      } catch (e) { return { body: { path: ctx.config.vault, error: (e as Error).message } }; }
    }
    if (is(req, 'GET', url, '/api/vault/project')) {
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const v = await openVault(ctx.config.vault);
      const id = url.searchParams.get('id') || '';
      if (!(await listProjects(v)).some(p => p.id === id)) throw new HttpError(404, 'no project ' + id + ' in the vault');
      return { body: projectSummary(await readProject(v, id)) };
    }
    if (is(req, 'POST', url, '/api/landing')) {
      const b = await readJson<{ job: string; project: string; fields?: Fields; name?: string }>(req);
      const j = ctx.jobs.get(b.job);
      if (!j || j.kind !== 'rdf') throw new HttpError(404, 'no rdf run ' + b.job);
      if (j.status !== 'done') throw new HttpError(409, 'only a finished run can be sent');
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const names = j.meta!.names as { xvg: string }, rec = JSON.parse(readFileSync(String(j.meta!.record), 'utf8')) as RunRecord;
      const v = await openVault(ctx.config.vault);
      if (!(await listProjects(v)).some(p => p.id === b.project)) throw new HttpError(404, 'no project ' + b.project + ' in the vault');
      return { body: await landingFor(v, b.project, { name: names.xvg, text: readFileSync(join(String(j.meta!.outDir), names.xvg), 'utf8'), lastTime: rec.frames?.lastTime ?? null }, b) };
    }
    if (is(req, 'POST', url, '/api/send')) {
      const b = await readJson<{ job: string; project: string; name: string }>(req);
      const j = ctx.jobs.get(b.job);
      if (!j || j.kind !== 'rdf') throw new HttpError(404, 'no rdf run ' + b.job);
      if (j.status !== 'done') throw new HttpError(409, 'only a finished run can be sent');
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const v = await openVault(ctx.config.vault), project = (await listProjects(v)).find(p => p.id === b.project);
      if (!project) throw new HttpError(404, 'no project ' + b.project + ' in the vault');
      // Only g(r): the cumulative-number file is titled "Cumulative Number RDF", which PMF Sequences would read as another RDF (T35).
      return { body: sendToInbox(v, project, join(String(j.meta!.outDir), (j.meta!.names as { xvg: string }).xvg), String(b.name ?? ''), ctx.config.pmfUrl) };
    }
    if (is(req, 'POST', url, '/api/batch/preview')) {
      const b = await readJson<{ root: string; template: string; recipe: unknown }>(req);
      const unread: string[] = [], items = await checkRunInputs(ctx, findTrajectories(b.root, String(b.template || ''), checked(b.recipe), roots(), unread));
      return { body: { items, unread } };
    }
    if (is(req, 'GET', url, '/api/batches')) return { body: batches.list() };
    if (is(req, 'POST', url, '/api/batches')) {
      // The matches are found again: only paths the preview showed, and that still match, run.
      const b = await readJson<{ root: string; template: string; recipe: unknown; rels: string[]; concurrency?: number }>(req), recipe = checked(b.recipe), rels = new Set(b.rels || []);
      const items = findTrajectories(b.root, String(b.template || ''), recipe, roots()).filter(i => rels.has(i.rel));
      if (!items.length) throw new HttpError(400, 'none of the chosen trajectories matches');
      return { body: batches.start(recipe, b.root, b.template, items, Math.min(cpus().length, b.concurrency || ctx.config.concurrency)) };
    }
    const batch = /^\/api\/batches\/([\w-]+)\/(cancel|send)$/.exec(url.pathname);
    if (batch && req.method === 'POST') {
      const b = batches.get(batch[1]);
      if (!b) throw new HttpError(404, 'no batch ' + batch[1]);
      if (batch[2] === 'cancel') { batches.cancel(b.id); return { body: b }; }
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      return { body: await sendAll(ctx, b, (await readJson<{ project: string }>(req)).project) };
    }
    if (is(req, 'GET', url, '/api/recipes')) return { body: listRecipes(ctx.home) };
    if (is(req, 'POST', url, '/api/recipes')) return { body: saveRecipe(ctx.home, await readJson(req), url.searchParams.get('replace') === '1') };
    const recipe = /^\/api\/recipes\/([^/]+)$/.exec(url.pathname);
    if (recipe && req.method === 'GET') return { body: readRecipe(ctx.home, decodeURIComponent(recipe[1])) };
    if (is(req, 'POST', url, '/api/plan')) {
      // Asked while typing (a template, a folder): a refusal is an answer, not a failed request.
      try { return { body: await planRun(ctx, await readJson(req), roots()) }; }
      catch (e) { if (e instanceof HttpError) return { body: { error: e.message } }; throw e; }
    }
    if (is(req, 'POST', url, '/api/runs')) return { body: summary((await startRun(ctx, await readJson(req), roots())).job) };
    if (is(req, 'POST', url, '/api/upload')) {
      // GROMACS inputs only, as the page offers them (review finding 11).
      const name = url.searchParams.get('name') || 'upload', role = inputRole(name);
      if (!role || role === 'output') throw new HttpError(400, name + ' is not a GROMACS input (.xtc .trr .tng .tpr .gro .pdb .ndx); not uploaded');
      return { body: await saveUpload(req, ctx.home, name) };
    }
    const job = /^\/api\/jobs\/([\w-]+)(\/cancel|\/record|\/output)?$/.exec(url.pathname);
    if (job) {
      const j = ctx.jobs.get(job[1]);
      if (!j) throw new HttpError(404, 'no job ' + job[1]);
      if (req.method === 'GET' && !job[2]) return { body: j };
      if (req.method === 'POST' && job[2] === '/cancel') { ctx.jobs.cancel(j.id); return { body: summary(j) }; }
      if (req.method === 'GET' && job[2] === '/record') {
        const path = j.meta?.record as string | undefined;
        if (j.ended) await recordWritten(j.id);
        if (!path || !existsSync(path)) throw new HttpError(404, j.ended ? 'this run has no record' : 'the record is written when the run ends');
        return { body: JSON.parse(readFileSync(path, 'utf8')) };
      }
      if (req.method === 'GET' && job[2] === '/output') {
        // A run's own .xvg files only, by kind: the chart reads them.
        const kind = url.searchParams.get('kind') || '', names = j.meta?.names as Record<string, string> | undefined;
        if (kind !== 'xvg' && kind !== 'cn') throw new HttpError(400, 'no output ' + kind + ': xvg or cn');
        const path = names && join(String(j.meta!.outDir), names[kind]);
        if (!path || !existsSync(path)) throw new HttpError(404, 'this run wrote no ' + kind + ' file');
        sendFile(res, path, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return 'handled';
      }
    }
    if (is(req, 'POST', url, '/api/config')) {
      const patch = await readJson<Partial<Config>>(req);
      const unknown = Object.keys(patch || {}).filter(k => !SETTABLE.includes(k as keyof Config));
      if (unknown.length) throw new HttpError(400, 'unknown setting: ' + unknown.join(', '));
      if (patch.allow) patch.allow = realFolders(patch.allow);
      if (patch.pmfUrl && !/^https?:\/\/[^\s]+$/.test(patch.pmfUrl)) throw new HttpError(400, 'the PMF Sequences address must start with http:// or https://');
      // A vault is checked before it is kept: PMF Sequences' manifest, schema 1–3 (T32).
      if (patch.vault) patch.vault = (await openVault(patch.vault).catch(e => { throw new HttpError(400, (e as Error).message); })).path;
      ctx.config = { ...ctx.config, ...patch };
      saveConfig(ctx.home, ctx.config);
      if ('gmx' in patch) ctx.gmx = await detectGmx(ctx.config.gmx);
      return { body: state() };
    }
    return null;
  };
}
