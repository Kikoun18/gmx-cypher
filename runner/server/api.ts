// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { TOKENS } from '../../app/src/lib/seq';
import { detectGmx, type GmxState } from './gmx';
import { HttpError, readJson, type Api } from './http';
import type { Job, Jobs } from './jobs';
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
const SETTABLE: (keyof Config)[] = ['gmx'];

const is = (req: IncomingMessage, method: string, url: URL, path: string) => req.method === method && url.pathname === path;

export function makeApi(ctx: Ctx): Api {
  const state = () => ({ name: 'gmx-cypher', version: ctx.version, tokens: TOKENS, gmx: ctx.gmx, config: ctx.config });
  return async (req, url, res) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
    if (is(req, 'GET', url, '/api/events')) { events(ctx.jobs, res); return 'handled'; }
    if (is(req, 'GET', url, '/api/jobs')) return { body: ctx.jobs.list().map(summary) };
    const job = /^\/api\/jobs\/([\w-]+)(\/cancel)?$/.exec(url.pathname);
    if (job) {
      const j = ctx.jobs.get(job[1]);
      if (!j) throw new HttpError(404, 'no job ' + job[1]);
      if (req.method === 'GET' && !job[2]) return { body: j };
      if (req.method === 'POST' && job[2]) { ctx.jobs.cancel(j.id); return { body: summary(j) }; }
    }
    if (is(req, 'POST', url, '/api/config')) {
      const patch = await readJson<Partial<Config>>(req);
      const unknown = Object.keys(patch || {}).filter(k => !SETTABLE.includes(k as keyof Config));
      if (unknown.length) throw new HttpError(400, 'unknown setting: ' + unknown.join(', '));
      ctx.config = { ...ctx.config, ...patch };
      saveConfig(ctx.home, ctx.config);
      if ('gmx' in patch) ctx.gmx = await detectGmx(ctx.config.gmx);
      return { body: state() };
    }
    return null;
  };
}
