// The API: thin routes that call the pure functions in src/lib and the side effects in server/.

import type { IncomingMessage } from 'node:http';
import { TOKENS } from '../../app/src/lib/seq';
import { detectGmx, type GmxState } from './gmx';
import { HttpError, readJson, type Api } from './http';
import { saveConfig, type Config } from './state';

export interface Ctx { home: string; version: string; config: Config; gmx: GmxState }

/** What the GUI may change (T5); anything else is refused. */
const SETTABLE: (keyof Config)[] = ['gmx'];

const is = (req: IncomingMessage, method: string, url: URL, path: string) => req.method === method && url.pathname === path;

export function makeApi(ctx: Ctx): Api {
  const state = () => ({ name: 'gmx-cypher', version: ctx.version, tokens: TOKENS, gmx: ctx.gmx, config: ctx.config });
  return async (req, url) => {
    if (is(req, 'GET', url, '/api/state')) return { body: state() };
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
