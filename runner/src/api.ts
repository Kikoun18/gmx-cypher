// The GUI's calls to its own server (same origin; the cookie carries the token).

export interface GmxState { ok: boolean; name: string; path?: string; version?: string; error?: string }
export interface Config { gmx: string | null; allow: string[]; vault: string | null; pmfUrl: string | null; concurrency: number; hashTrajectories: boolean }
export interface AppState { name: string; version: string; tokens: { t: string; d: string }[]; gmx: GmxState; config: Config }

async function reply<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { status: res.status });
  return body as T;
}

export const getJson = <T>(path: string) => fetch(path).then(r => reply<T>(r));
export const postJson = <T>(path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => reply<T>(r));
