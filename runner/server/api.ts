// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import { COMMANDS, commandOf, type OutputNames } from '../src/lib/commands';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { TOKENS } from '../../matrix/src/lib/seq';
import { inputRole, suggestInputs } from '../src/lib/inputs';
import { fromRanges } from '../src/lib/atoms';
import { nameProblem } from '../src/lib/groups';
import { checkInputs, checkSizes } from './check';
import { awhScan } from './awh';
import { energyMenu } from './energy';
import { findWindows } from './wham';
import { inside, listFolder, namesIn, saveUpload } from './files';
import { detectGmx, executable, findTool, type GmxState } from './gmx';
import { HttpError, readJson, sendFile, type Api } from './http';
import type { Job, Jobs } from './jobs';
import { Batches, checkRunInputs, findTrajectories, sendAll } from './batch';
import { Cluster } from './cluster';
import { listRecipes, readRecipe, saveRecipe } from './recipes';
import { recipeFileProblems, type Recipe } from '../src/lib/recipe';
import { cpus } from 'node:os';
import { planRun, recordWritten, startRun } from './runs';
import { keepRecord, sendToInbox } from './send';
import { landingFor, listProjects, openVault, projectSummary, readProject } from './vault';
import { findRuns, listVault, readRun, vaultFile } from './decypher';
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
const SETTABLE: (keyof Config)[] = ['gmx', 'allow', 'vault', 'project', 'pmfUrl', 'qq', 'gmxEta'];

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
  const cluster = new Cluster(() => ({ qq: ctx.config.qq ?? null, gmxEta: ctx.config.gmxEta ?? null }));
  const checked = (r: unknown) => { const p = recipeFileProblems(r); if (p.length) throw new HttpError(400, p.join('; ')); return r as Recipe; };
  // A batch runs a recipe over trajectories: only a command with groups has that shape (energy and AWH batches are not built yet).
  const batchable = (r: Recipe) => {
    if (commandOf(r.analysis ?? 'rdf')?.groups === false) throw new HttpError(400, 'batches run recipes of commands with atom groups; ' + r.name + ' is a gmx ' + r.analysis + ' recipe');
    return r;
  };
  return async (req, url, res) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
    if (is(req, 'GET', url, '/api/events')) { events(ctx.jobs, batches, res); return 'handled'; }
    if (is(req, 'GET', url, '/api/jobs')) return { body: ctx.jobs.list().map(summary) };
    if (is(req, 'GET', url, '/api/commands')) {
      // Which commands this gmx runs, and as which of its tools (R8: gmx hbond is another tool before 2024); [] without a gmx.
      if (!ctx.gmx.ok) return { body: [] };
      return { body: await Promise.all(COMMANDS.map(async c => {
        if (!c.find) return { tool: c.tool, ok: true, gmxTool: c.tool };
        const f = await findTool(ctx.gmx, c);
        return f.ok ? { tool: c.tool, ok: true, gmxTool: f.tool } : { tool: c.tool, ok: false, why: f.why };
      })) };
    }
    const help = /^\/api\/help\/([a-z-]+)$/.exec(url.pathname), helpOf = help && commandOf(help[1]);
    if (helpOf && req.method === 'GET') {
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
      const f = await findTool(ctx.gmx, helpOf);
      if (!f.ok) throw new HttpError(409, f.why);
      return { body: { gmx: ctx.gmx.path, version: ctx.gmx.version, tool: f.tool, options: f.help } };
    }
    if (is(req, 'GET', url, '/api/energy/menu')) {
      // The terms of an energy file, as gmx energy lists them (R4); only inside the allowed folders.
      const path = inside(url.searchParams.get('path') || '', roots());
      if (!/\.edr$/i.test(path)) throw new HttpError(400, path + ' is not an .edr file');
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
      return { body: { terms: await energyMenu(ctx.gmx, path) } };
    }
    if (is(req, 'GET', url, '/api/awh/frames')) {
      // The AWH frames of an energy file with its run input (R5), so the page can say how many files each choice writes.
      const edr = inside(url.searchParams.get('edr') || '', roots()), tpr = inside(url.searchParams.get('tpr') || '', roots());
      if (!/\.edr$/i.test(edr)) throw new HttpError(400, edr + ' is not an .edr file');
      if (!/\.tpr$/i.test(tpr)) throw new HttpError(400, tpr + ' is not a .tpr file');
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx');
      return { body: await awhScan(ctx.gmx, edr, tpr) };
    }
    if (is(req, 'POST', url, '/api/wham/windows')) {
      // gmx wham's windows under a folder, by a template such as */umbrella.tpr (R6); only inside the allowed folders.
      const b = await readJson<{ root: string; glob: string; pull?: string }>(req), unread: string[] = [];
      const windows = findWindows(String(b.root || ''), String(b.glob || ''), b.pull === 'pullf' ? 'pullf' : 'pullx', roots(), unread);
      return { body: { windows, unread } };
    }
    if (is(req, 'POST', url, '/api/cluster')) {
      // Your cluster jobs (R10): the last read if recent, else qq jobs and gmx-eta -a now; `refresh` asks for a new one.
      const b = await readJson<{ finished?: boolean; refresh?: boolean }>(req);
      return { body: await cluster.read(b.finished === true, b.refresh === true ? 0 : 50_000) };
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
      if (!ctx.config.vault) return { body: { path: null, project: null } };
      try {
        const v = await openVault(ctx.config.vault);
        return { body: { path: v.path, schema: v.schema, compat: v.compat, project: ctx.config.project, projects: (await listProjects(v)).map(p => ({ id: p.id, name: p.name, dir: p.dir, desc: p.desc })) } };
      } catch (e) { return { body: { path: ctx.config.vault, error: (e as Error).message } }; }
    }
    if (is(req, 'GET', url, '/api/vault/project')) {
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const v = await openVault(ctx.config.vault);
      const id = url.searchParams.get('id') || '';
      if (!(await listProjects(v)).some(p => p.id === id)) throw new HttpError(404, 'no project ' + id + ' in the vault');
      return { body: projectSummary(await readProject(v, id)) };
    }
    if (is(req, 'GET', url, '/api/decypher/vault')) {
      // (de)Cypher: the vault's RDFs with their rows' structures, and the run that wrote each, read only.
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set: choose the Matrix vault in settings');
      return { body: await listVault(await openVault(ctx.config.vault), ctx.jobs) };
    }
    if (is(req, 'GET', url, '/api/decypher/vault/file')) {
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set: choose the Matrix vault in settings');
      const text = await vaultFile(await openVault(ctx.config.vault), ctx.jobs, url.searchParams.get('path') || '');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(text);
      return 'handled';
    }
    if (is(req, 'POST', url, '/api/decypher/runs')) {
      // (de)Cypher: RDF runs gmx-cypher wrote before, by their records, under a folder of the allowed ones.
      return { body: findRuns(String((await readJson<{ root: string }>(req)).root || ''), roots()) };
    }
    if (is(req, 'GET', url, '/api/decypher/run')) return { body: readRun(url.searchParams.get('path') || '', roots()) };
    if (is(req, 'POST', url, '/api/landing')) {
      const b = await readJson<{ job: string; project: string; fields?: Fields; name?: string }>(req);
      const j = ctx.jobs.get(b.job);
      if (!j || !COMMANDS.some(c => c.tool === j.kind)) throw new HttpError(404, 'no run ' + b.job);
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
      if (!j || !COMMANDS.some(c => c.tool === j.kind)) throw new HttpError(404, 'no run ' + b.job);
      if (j.status !== 'done') throw new HttpError(409, 'only a finished run can be sent');
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const v = await openVault(ctx.config.vault), project = (await listProjects(v)).find(p => p.id === b.project);
      if (!project) throw new HttpError(404, 'no project ' + b.project + ' in the vault');
      // Only g(r): the cumulative-number file is titled "Cumulative Number RDF", which the Matrix would read as another RDF (T35).
      const sent = sendToInbox(v, project, join(String(j.meta!.outDir), (j.meta!.names as { xvg: string }).xvg), String(b.name ?? ''), ctx.config.pmfUrl);
      return { body: { ...sent, record: keepRecord(v, String(j.meta!.record), roots(), 'gmx-cypher ' + ctx.version) } };
    }
    if (is(req, 'POST', url, '/api/batch/preview')) {
      const b = await readJson<{ root: string; template: string; recipe: unknown }>(req);
      const unread: string[] = [], items = await checkRunInputs(ctx, findTrajectories(b.root, String(b.template || ''), batchable(checked(b.recipe)), roots(), unread));
      return { body: { items, unread } };
    }
    if (is(req, 'GET', url, '/api/batches')) return { body: batches.list() };
    if (is(req, 'POST', url, '/api/batches')) {
      // The matches are found again: only paths the preview showed, and that still match, run.
      const b = await readJson<{ root: string; template: string; recipe: unknown; rels: string[]; concurrency?: number }>(req), recipe = batchable(checked(b.recipe)), rels = new Set(b.rels || []);
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
      if (!role || role === 'output') throw new HttpError(400, name + ' is not a GROMACS input (.xtc .trr .tng .tpr .gro .pdb .ndx .edr); not uploaded');
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
        // Written as the job starts, completed when it ends (R2b): the page asks for it once the job has ended.
        if (!j.ended) throw new HttpError(404, 'the record is completed when the job ends');
        if (!path || !existsSync(path)) throw new HttpError(404, 'this job has no record');
        // A job without groups claims its stem with an empty record (T103): one from before R2b may have stayed empty (review finding 8).
        const text = readFileSync(path, 'utf8');
        if (!text.trim()) throw new HttpError(404, 'this job has no record: it stopped before gmx-cypher wrote it');
        return { body: JSON.parse(text) };
      }
      if (req.method === 'GET' && job[2] === '/output') {
        // A run's own .xvg files only, by kind, or one of gmx awh's frames by its name (R5): the chart reads them.
        const kind = url.searchParams.get('kind') || '', file = url.searchParams.get('name'), names = j.meta?.names as OutputNames | undefined;
        if (file != null && !names?.more?.includes(file) && file !== names?.xvg) throw new HttpError(404, 'this job wrote no file ' + file);
        if (file == null && kind !== 'xvg' && kind !== 'cn') throw new HttpError(400, 'no output ' + kind + ': xvg or cn');
        const name = file ?? names?.[kind as 'xvg' | 'cn'], path = name && join(String(j.meta!.outDir), name);
        if (!path || !existsSync(path)) throw new HttpError(404, 'this job wrote no ' + kind + ' file');
        sendFile(res, path, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return 'handled';
      }
    }
    if (is(req, 'POST', url, '/api/config')) {
      const patch = await readJson<Partial<Config>>(req);
      const unknown = Object.keys(patch || {}).filter(k => !SETTABLE.includes(k as keyof Config));
      if (unknown.length) throw new HttpError(400, 'unknown setting: ' + unknown.join(', '));
      if (patch.allow) patch.allow = realFolders(patch.allow);
      if (patch.pmfUrl && !/^https?:\/\/[^\s]+$/.test(patch.pmfUrl)) throw new HttpError(400, 'the Matrix address must start with http:// or https://');
      // The tool's own name, found on PATH, or the absolute path of a program that exists: never a relative path
      // resolved against the server's folder, or another program's name (review).
      for (const k of ['qq', 'gmxEta'] as const) {
        const v = patch[k], name = k === 'qq' ? 'qq' : 'gmx-eta';
        if (v != null && (typeof v !== 'string' || !(v === name || (isAbsolute(v) && /^[\w./+-]+$/.test(v) && executable(v)))))
          throw new HttpError(400, k + ': ' + name + ' (found on PATH), or the absolute path of a program that exists');
      }
      // A vault is checked before it is kept: the Matrix's manifest, schemas 1–4 (T32, T142).
      if (patch.vault) patch.vault = (await openVault(patch.vault).catch(e => { throw new HttpError(400, (e as Error).message); })).path;
      // The connected project is one of the vault's (R14b): another vault, or none, leaves none connected unless one is given.
      if ('vault' in patch && !('project' in patch)) patch.project = null;
      if (patch.project != null) {
        const vault = 'vault' in patch ? patch.vault : ctx.config.vault;
        if (!vault) throw new HttpError(400, 'set a vault first: a project is one of its projects');
        if (typeof patch.project !== 'string' || !(await listProjects(await openVault(vault))).some(p => p.id === patch.project)) throw new HttpError(400, 'no project ' + patch.project + ' in the vault');
      }
      ctx.config = { ...ctx.config, ...patch };
      saveConfig(ctx.home, ctx.config);
      if ('gmx' in patch) ctx.gmx = await detectGmx(ctx.config.gmx);
      return { body: state() };
    }
    return null;
  };
}
