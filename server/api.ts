// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import { COMMANDS, commandOf, type OutputNames } from '../src/lib/commands';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { TOKENS } from '../../matrix/src/lib/seq';
import { inputRole, suggestInputs } from '../src/lib/inputs';
import { fromRanges } from '../src/core/index';
import { nameProblem } from '../src/lib/groups';
import { checkInputs, checkSizes } from './check';
import { awhScan, runConvergence } from './awh';
import { energyMenu } from './energy';
import { findWindows } from './wham';
import { inside, listFolder, namesIn, real, saveUpload } from './files';
import { detectGmx, executable, findTool, type GmxState } from './gmx';
import { HttpError, readJson, sendFile, type Api } from './http';
import { Jobs, type Job } from './jobs';
import { Batches, checkRunInputs, findTrajectories, sendAll } from './batch';
import { Cluster } from './cluster';
import { listRecipes, readRecipe, saveRecipe } from './recipes';
import { listPlans, readPlan, savePlan } from './builds';
import { baseFolder, checkBuild, checkInputs as checkBuildInputs, checkLanding, readText } from './build-check';
import { Builder, jobsExec } from './build-run';
import { reportOf } from './build-report';
import { mdrunHead } from '../src/lib/build/mdrun';
import { DEFAULT_PROFILES, profileOf, profileProblem, SCRIPTED_STAGES } from '../src/lib/build/qq';
import type { Systems } from '../src/lib/build/plan';
import { recipeFileProblems, type Recipe } from '../src/lib/recipe';
import { cpus } from 'node:os';
import { planRun, recordWritten, startRun } from './runs';
import { keepRecord, sendToInbox } from './send';
import { listRecords, listViews, readRecordCopy, readView, saveView } from './space';
import { landingFor, listProjects, openVault, projectSummary, readProject } from './vault';
import { findRuns, listVault, readRun, vaultFile } from './decypher';
import type { Fields } from '../src/lib/landing';
import type { RunRecord } from '../src/lib/record';
import { saveConfig, type Config } from './state';

export interface Ctx { home: string; version: string; config: Config; gmx: GmxState; jobs: Jobs; /** SymBuilder's builds and their own job list (R5, T217). */ builder?: Builder; buildJobs?: Jobs }

/** A job as lists and events send it: its log stays on disk, read with GET /api/jobs/:id/log (R12a). */
const summary = (j: Job) => j;

/** Server-Sent Events: every job, batch and build change and every piece of output, to every open page. */
function events(jobs: Jobs, batches: Batches, builder: Builder, buildJobs: Jobs, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const send = (name: string, data: unknown) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n');
  const onJob = (j: Job) => send('job', summary(j)), onOut = (id: string, s: string, end: number) => send('out', { id, s, end });
  const onBatch = (b: unknown) => send('batch', b), onGone = (id: string) => send('gone', { id });
  jobs.on('job', onJob);
  jobs.on('gone', onGone);
  jobs.on('out', onOut);
  batches.on('batch', onBatch);
  // A build's changes, and what its steps print (build steps keep their own job list: T217).
  const onBuild = (b: unknown) => send('build', b), onBuildOut = (id: string, s: string, end: number) => send('build-out', { id, s, end });
  builder.on('build', onBuild);
  buildJobs.on('out', onBuildOut);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => { clearInterval(ping); jobs.off('job', onJob); jobs.off('gone', onGone); jobs.off('out', onOut); batches.off('batch', onBatch); builder.off('build', onBuild); buildJobs.off('out', onBuildOut); });
  send('hello', {});
}

/** What the GUI may change (T5); anything else is refused. */
const SETTABLE: (keyof Config)[] = ['gmx', 'allow', 'vault', 'project', 'pmfUrl', 'qq', 'gmxEta', 'base', 'python', 'buildWait', 'qqBuild'];

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
  // SymBuilder (R5): on this very context, so the builder reads the settings /api/config changes (the review's finding 1).
  const { builder, buildJobs } = withBuilds(ctx) as Required<Pick<Ctx, 'builder' | 'buildJobs'>>;
  const checked = (r: unknown) => { const p = recipeFileProblems(r); if (p.length) throw new HttpError(400, p.join('; ')); return r as Recipe; };
  // A batch runs a recipe over trajectories: only a command with groups has that shape (energy and AWH batches are not built yet).
  const batchable = (r: Recipe) => {
    if (commandOf(r.analysis ?? 'rdf')?.groups === false) throw new HttpError(400, 'batches run recipes of commands with atom groups; ' + r.name + ' is a gmx ' + r.analysis + ' recipe');
    return r;
  };
  return async (req, url, res) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
    if (is(req, 'GET', url, '/api/events')) { events(ctx.jobs, batches, builder, buildJobs, res); return 'handled'; }
    // The jobs, or with ?archived=1 the archived ones (R12c), read from archive/ when asked.
    if (is(req, 'GET', url, '/api/jobs')) return { body: (url.searchParams.get('archived') === '1' ? ctx.jobs.archived() : ctx.jobs.list()).map(summary) };
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
      const r = await cluster.read(b.finished === true, b.refresh === true ? 0 : 50_000);
      // A job that ended (R15): a batch is offered on its input folder only when that folder is inside the allowed ones.
      const offer = (dir: string | null) => {
        if (!dir) return { offer: null, refused: 'not offered: qq jobs -e printed no input folder for it' };
        try { return { offer: { root: inside(dir, roots()) }, refused: null }; } catch (e) { return { offer: null, refused: 'not offered: ' + (e as Error).message }; }
      };
      return { body: { ...r, ended: r.ended.map(e => ({ ...e, ...offer(e.inputDir) })) } };
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
    // The connected project's naming (R3c): its path pattern and columns, which name jobs on the page; null without one.
    if (is(req, 'GET', url, '/api/naming')) {
      if (!ctx.config.vault || !ctx.config.project) return { body: null };
      try {
        const s = projectSummary(await readProject(await openVault(ctx.config.vault), ctx.config.project));
        return { body: { project: s.id, name: s.name, pathPattern: s.settings.pathPattern, columns: s.columns } };
      } catch { return { body: null }; }
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
      return { body: await listVault(await openVault(ctx.config.vault), ctx.jobs, roots()) };
    }
    if (is(req, 'GET', url, '/api/decypher/vault/file')) {
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set: choose the Matrix vault in settings');
      const text = await vaultFile(await openVault(ctx.config.vault), ctx.jobs, url.searchParams.get('path') || '', roots());
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(text);
      return 'handled';
    }
    if (is(req, 'POST', url, '/api/decypher/runs')) {
      // (de)Cypher: RDF runs gmx-cypher wrote before, by their records, under a folder of the allowed ones.
      return { body: findRuns(String((await readJson<{ root: string }>(req)).root || ''), roots()) };
    }
    if (is(req, 'GET', url, '/api/decypher/run')) {
      const path = url.searchParams.get('path') || '';
      return { body: url.searchParams.get('only') === 'record' ? readRun(path, roots(), true) : readRun(path, roots()) };
    }
    if (is(req, 'POST', url, '/api/landing')) {
      const b = await readJson<{ job: string; project: string; fields?: Fields; name?: string }>(req);
      const j = ctx.jobs.get(b.job);
      if (!j || !COMMANDS.some(c => c.tool === j.kind)) throw new HttpError(404, 'no job ' + b.job);
      if (j.status !== 'done') throw new HttpError(409, 'only a finished job can be sent');
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const names = j.meta!.names as { xvg: string }, rec = JSON.parse(readFileSync(String(j.meta!.record), 'utf8')) as RunRecord;
      const v = await openVault(ctx.config.vault);
      if (!(await listProjects(v)).some(p => p.id === b.project)) throw new HttpError(404, 'no project ' + b.project + ' in the vault');
      return { body: await landingFor(v, b.project, { name: names.xvg, text: readFileSync(join(String(j.meta!.outDir), names.xvg), 'utf8'), lastTime: rec.frames?.lastTime ?? null }, b) };
    }
    if (is(req, 'POST', url, '/api/send')) {
      const b = await readJson<{ job: string; project: string; name: string }>(req);
      const j = ctx.jobs.get(b.job);
      if (!j || !COMMANDS.some(c => c.tool === j.kind)) throw new HttpError(404, 'no job ' + b.job);
      if (j.status !== 'done') throw new HttpError(409, 'only a finished job can be sent');
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set');
      const v = await openVault(ctx.config.vault), project = (await listProjects(v)).find(p => p.id === b.project);
      if (!project) throw new HttpError(404, 'no project ' + b.project + ' in the vault');
      // Only g(r): the cumulative-number file is titled "Cumulative Number RDF", which the Matrix would read as another RDF (T35).
      const file = join(String(j.meta!.outDir), (j.meta!.names as { xvg: string }).xvg), sent = sendToInbox(v, project, file, String(b.name ?? ''), ctx.config.pmfUrl);
      return { body: { ...sent, ...keepRecord(v, String(j.meta!.record), file, roots(), 'gmx-cypher ' + ctx.version) } };
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
    if (is(req, 'POST', url, '/api/build/check')) { const b = await readJson<{ plan: unknown; systems: Systems }>(req); return { body: checkBuildInputs(baseFolder(ctx.config.base, ctx.config.allow), b.plan, b.systems) }; }
    if (is(req, 'POST', url, '/api/build/landing')) {
      if (!ctx.config.vault || !ctx.config.project) throw new HttpError(409, 'connect a project in settings → vault to see where each system lands');
      const v = await openVault(ctx.config.vault), b = await readJson<{ plan: unknown; systems: Systems }>(req);
      if (!(await listProjects(v)).some(p => p.id === ctx.config.project)) throw new HttpError(404, 'no project ' + ctx.config.project + ' in the vault');
      return { body: checkLanding(await readProject(v, ctx.config.project), b.plan, b.systems, ctx.config.base ?? null) };
    }
    // Building (R5): one build at a time, of the systems the page sends, in the base folder; the page follows it by events.
    if (is(req, 'POST', url, '/api/build/start')) {
      const b = await readJson<{ plan: unknown; systems: Systems; ifExists?: string; onFailure?: string }>(req);
      const base = baseFolder(ctx.config.base, ctx.config.allow);
      const plan = checkBuild(b.plan, b.systems);
      if (!ctx.gmx.ok) throw new HttpError(409, 'no working gmx: set it in settings → gmx');
      const ifExists = (['continue', 'skip', 'repeat'] as const).find(x => x === b.ifExists) ?? 'continue', onFailure = b.onFailure === 'stop' ? 'stop' : 'next';
      try { const st = builder.start(plan, b.systems, { base, ifExists, onFailure }); st.done.catch(() => {}); return { body: st.run }; } catch (e) { throw new HttpError(409, (e as Error).message); }
    }
    // A failed or cancelled system again (R6): resumed in its folder, or rebuilt after its folder moves to failed/.
    if (is(req, 'POST', url, '/api/build/retry')) {
      const b = await readJson<{ run?: string; dir?: string; how?: string }>(req);
      if (b.how !== 'resume' && b.how !== 'rebuild') throw new HttpError(400, 'how is resume or rebuild');
      try { const st = builder.retry(String(b.run ?? ''), String(b.dir ?? ''), b.how); st.done.catch(() => {}); return { body: st.run }; } catch (e) { throw new HttpError(409, (e as Error).message); }
    }
    // A system that waits for the cluster, taken on once its pull has ended (R7b): only when asked.
    if (is(req, 'POST', url, '/api/build/go-on')) {
      const b = await readJson<{ run?: string; dir?: string }>(req);
      try { const st = builder.goOn(String(b.run ?? ''), String(b.dir ?? '')); st.done.catch(() => {}); return { body: st.run }; } catch (e) { throw new HttpError(409, (e as Error).message); }
    }
    if (is(req, 'GET', url, '/api/build/runs')) return { body: builder.list() };
    // A build's reports (R9): the summary, the pull and walker reports, the termini check, read from what it left.
    const buildReport = /^\/api\/build\/runs\/([\w-]+)\/report$/.exec(url.pathname);
    if (buildReport && req.method === 'GET') {
      const r = builder.get(buildReport[1]);
      if (!r) throw new HttpError(404, 'no build ' + buildReport[1]);
      return { body: reportOf(r, ctx.gmx.version ?? 'unknown', roots()) };
    }
    const buildRun = /^\/api\/build\/runs\/([\w-]+)\/cancel$/.exec(url.pathname);
    if (buildRun && req.method === 'POST') { try { builder.cancel(buildRun[1]); } catch (e) { throw new HttpError(409, (e as Error).message); } return { body: builder.get(buildRun[1]) }; }
    const buildLog = /^\/api\/build\/jobs\/([\w-]+)\/log$/.exec(url.pathname);
    if (buildLog && req.method === 'GET') {
      if (!buildJobs.get(buildLog[1])) throw new HttpError(404, 'no build step ' + buildLog[1]);
      const from = url.searchParams.get('from');
      // With mdrun's head (T232): its number of steps is printed first, which a tail of a long log no longer holds.
      return { body: { ...buildJobs.logRange(buildLog[1], from == null ? undefined : Number(from)), head: mdrunHead(buildJobs.logRange(buildLog[1], 0, 16_384).text) } };
    }
    if (is(req, 'GET', url, '/api/build/text')) return { body: { text: readText(baseFolder(ctx.config.base, ctx.config.allow), url.searchParams.get('path') ?? '') } };
    if (is(req, 'GET', url, '/api/builds')) return { body: listPlans(ctx.home) };
    if (is(req, 'POST', url, '/api/builds')) return { body: savePlan(ctx.home, await readJson(req), url.searchParams.get('replace') === '1') };
    const plan = /^\/api\/builds\/([^/]+)$/.exec(url.pathname);
    if (plan && req.method === 'GET') return { body: readPlan(ctx.home, decodeURIComponent(plan[1])) };
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
    // The record copies in the vault's space (R14c), for a run diff (R13): listed, and one by its file's SHA-256.
    if (is(req, 'GET', url, '/api/space/records') || is(req, 'GET', url, '/api/space/record')) {
      if (!ctx.config.vault) throw new HttpError(409, 'no vault set: choose the Matrix vault in settings');
      const v = await openVault(ctx.config.vault);
      return { body: url.pathname.endsWith('/records') ? listRecords(v.path) : readRecordCopy(v.path, url.searchParams.get('sha') || '') };
    }
    // Saved compare views (R14b): the connected project's, in the vault's gmx-cypher space; each written once.
    if (url.pathname === '/api/space/views' || url.pathname.startsWith('/api/space/views/')) {
      if (!ctx.config.vault || !ctx.config.project) throw new HttpError(409, 'connect a project in settings to save compare views in the vault');
      const v = await openVault(ctx.config.vault), project = ctx.config.project;
      if (!(await listProjects(v)).some(p => p.id === project)) throw new HttpError(404, 'the connected project is no longer in the vault: choose it again in settings');
      // Records on disk are named by their real paths (findRuns): both forms of each allowed folder.
      const rs = [...new Set(roots().flatMap(r => [r, real(r) ?? r]))];
      let name: string;
      try { name = decodeURIComponent(url.pathname.slice('/api/space/views/'.length)); } catch { throw new HttpError(400, 'not a view name: ' + url.pathname.slice('/api/space/views/'.length)); }
      if (is(req, 'GET', url, '/api/space/views')) return { body: { project, views: listViews(v.path, project) } };
      if (is(req, 'POST', url, '/api/space/views')) return { body: { view: saveView(v.path, project, await readJson(req), rs, 'gmx-cypher ' + ctx.version) } };
      if (req.method === 'GET' && name) return { body: readView(v.path, project, name, rs) };
    }
    // Archive and unarchive (R12c): the job's file moved, never over another; refusals in words.
    const shelf = /^\/api\/jobs\/([\w-]+)\/(archive|unarchive)$/.exec(url.pathname);
    if (shelf && req.method === 'POST') {
      // A job just ended may still be completing its record from its file (review): archived once that is done.
      if (shelf[2] === 'archive') await recordWritten(shelf[1]);
      try { if (shelf[2] === 'archive') ctx.jobs.archive(shelf[1]); else ctx.jobs.unarchive(shelf[1]); } catch (e) { throw new HttpError(409, (e as Error).message); }
      return { body: { ok: true } };
    }
    const job = /^\/api\/jobs\/([\w-]+)(\/cancel|\/record|\/output|\/awh-convergence|\/log)?$/.exec(url.pathname);
    if (job) {
      const j = ctx.jobs.get(job[1]);
      if (!j) throw new HttpError(404, 'no job ' + job[1]);
      if (req.method === 'GET' && !job[2]) return { body: j };
      // Its log from its file (R12a): the last 64 kB unless a range is asked for (from=0: all of it).
      if (req.method === 'GET' && job[2] === '/log') {
        const n = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? undefined : Number(v); }, from = n('from'), to = n('to');
        if ([from, to].some(v => v !== undefined && !Number.isFinite(v))) throw new HttpError(400, 'from and to are character offsets');
        return { body: ctx.jobs.logRange(j.id, from, to) };
      }
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
      // AWH convergence (R7b): every frame the run wrote, each against the one before and the final one.
      if (req.method === 'GET' && job[2] === '/awh-convergence') {
        const names = j.meta?.names as OutputNames | undefined, stem = j.meta?.stem as string | undefined;
        if (j.kind !== 'awh' || !names || !stem) throw new HttpError(404, 'not a gmx awh run');
        return { body: runConvergence(String(j.meta!.outDir), stem, names) };
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
      for (const k of ['qq', 'gmxEta', 'python'] as const) {
        const v = patch[k], names = k === 'qq' ? ['qq'] : k === 'gmxEta' ? ['gmx-eta'] : ['python3', 'python'];
        if (v != null && (typeof v !== 'string' || !(names.includes(v) || (isAbsolute(v) && /^[\w./+-]+$/.test(v) && executable(v)))))
          throw new HttpError(400, k + ': ' + names.join(' or ') + ' (found on PATH), or the absolute path of a program that exists');
      }
      // How a build waits for a local mdrun's .gro (R5c): every so many seconds, up to so many.
      if (patch.buildWait != null) {
        const w = patch.buildWait as { every?: unknown; max?: unknown };
        if (!Number.isInteger(w.every) || !Number.isInteger(w.max) || (w.every as number) < 1 || (w.every as number) > 600 || (w.max as number) < (w.every as number) || (w.max as number) > 86400)
          throw new HttpError(400, 'buildWait: every 1–600 s, up to (max) 86400 s, max no less than every');
        patch.buildWait = { every: w.every as number, max: w.max as number };
      }
      // A build's qq scripts (R7a): a known profile for each stage (the walkers' needs an MPI gmx), submitting on or off, a queue's name.
      if (patch.qqBuild != null) {
        const q = patch.qqBuild as { profiles?: Record<string, unknown>; submit?: unknown; queue?: unknown };
        if (typeof q !== 'object' || typeof q.submit !== 'boolean' || typeof q.queue !== 'string' || !/^[\w.-]{1,32}$/.test(q.queue) || (q.profiles != null && typeof q.profiles !== 'object'))
          throw new HttpError(400, 'qqBuild: { profiles: { stage: profile }, submit: true or false, queue: a queue\'s name }');
        const profiles: Record<string, string> = {};
        for (const stage of SCRIPTED_STAGES) {
          const id = q.profiles?.[stage] ?? DEFAULT_PROFILES[stage], why = typeof id === 'string' ? profileProblem(stage, id) : 'a profile is a name';
          if (why) throw new HttpError(400, stage + ': ' + why);
          profiles[stage] = id as string;
        }
        patch.qqBuild = { profiles, submit: q.submit, queue: q.queue };
      }
      // SymBuilder's base folder (R4): a real folder inside the allowed ones.
      if (patch.base) patch.base = baseFolder(patch.base, [...(patch.allow ?? ctx.config.allow)]);
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

/** The build job list and the builder, made once on this context object (main.ts stops the jobs on its way out). */
export function withBuilds(ctx: Ctx): Ctx {
  ctx.buildJobs ??= new Jobs(join(ctx.home, 'builds', 'jobs'));
  ctx.builder ??= newBuilder(ctx, ctx.buildJobs);
  return ctx;
}

/** The builder of a server: steps through the build job list, the tools and the waiting as the settings say now. */
export function newBuilder(ctx: Ctx, buildJobs: Jobs): Builder {
  return new Builder({
    home: ctx.home, version: ctx.version, ...jobsExec(buildJobs),
    tools: () => ({ gmx: ctx.gmx.ok ? ctx.gmx.path ?? null : null, python: ctx.config.python }),
    gmxVersion: () => ctx.gmx.version ?? 'unknown',
    profiles: () => Object.fromEntries(SCRIPTED_STAGES.map(st => [st, profileOf(ctx.config.qqBuild?.profiles?.[st] ?? DEFAULT_PROFILES[st])!])),
    submit: () => (ctx.config.qqBuild?.submit ? { qq: ctx.config.qq ?? 'qq', queue: ctx.config.qqBuild.queue } : null),
    wait: () => ({ every: (ctx.config.buildWait?.every ?? 10) * 1000, max: (ctx.config.buildWait?.max ?? 600) * 1000 }),
  });
}
