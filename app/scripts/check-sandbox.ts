// npm run check:sandbox (batch 3, R3a; F95): the Python sandbox in a real browser. Serves the built app and a second
// origin, opens the sandbox page and checks, from Python through `import js`, what section 1.4 requires:
// the deny-list is gone (prototype chain and js.eval included), the vault handle database and lock can't be reached,
// a dynamic import() to another origin is refused, and an endless loop is stopped by the time limit.
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { PY_HELPERS } from '../src/lib/py';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json', '.css': 'text/css' };
const listen = (s: Server, host: string) => new Promise<number>(ok => s.listen(0, host, () => ok((s.address() as { port: number }).port)));

const app = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try { const body = await readFile(join(DIST, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
const hits: string[] = [];
const other = createServer((req, res) => { hits.push(req.url || ''); res.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); res.end('export default 1'); });

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); };

(async () => {
  const [ap, op] = [await listen(app, '127.0.0.1'), await listen(other, '127.0.0.1')];
  const OTHER = 'http://localhost:' + op;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const violations: string[] = [];
    page.on('console', m => { if (m.type() === 'error') violations.push(m.text()); });
    await page.goto('http://127.0.0.1:' + ap + '/py/sandbox.html');
    // The page answers its parent; opened on its own, its parent is itself.
    const version = await page.evaluate(helpers => new Promise<string>((ok, fail) => {
      addEventListener('message', e => { if (e.data?.kind === 'ready') ok(e.data.version); if (e.data?.kind === 'failed') fail(new Error(e.data.error)); });
      postMessage({ kind: 'init', helpers }, location.origin);
    }), PY_HELPERS);
    check('Pyodide loads in the sandbox', /^3\.\d+/.test(version), 'Python ' + version);
    const run = (code: string, timeoutMs = 10000) => page.evaluate(([code, timeoutMs]) => new Promise<{ ok: boolean; value?: string; error?: string; ms: number }>(ok => {
      const id = Math.random(), t0 = performance.now();
      const on = (e: MessageEvent) => { if (e.data?.id === id && 'ok' in e.data) { removeEventListener('message', on); ok({ ...e.data, ms: Math.round(performance.now() - t0) }); } };
      addEventListener('message', on);
      postMessage({ kind: 'run', id, code, vars: {}, timeoutMs }, location.origin);
    }), [code, timeoutMs] as const);

    const basic = await run('import statistics, json\njson.dumps(statistics.mean([1.0, 2.0, 4.0]))');
    check('a standard-library call works', basic.ok && Math.abs(JSON.parse(basic.value!) - 7 / 3) < 1e-12, basic.value || basic.error || '');

    const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport', 'FontFace', 'fonts'];
    const deny = await run(`
import js, json
from pyodide.ffi import jsnull
out = {}
def chain(o):
    while o is not None and o is not jsnull:
        yield o
        o = js.Object.getPrototypeOf(o)
for n in ${JSON.stringify(names)}:
    out[n] = any(js.Reflect.has(o, n) and not js.Object.is_(js.Reflect.get(o, n), js.undefined) for o in chain(js.self))
for n in ['locks', 'storage', 'serviceWorker']:
    out['navigator.' + n] = any(js.Reflect.has(o, n) and not js.Object.is_(js.Reflect.get(o, n), js.undefined) for o in chain(js.navigator))
json.dumps(out)`);
    const reach = deny.ok ? Object.entries(JSON.parse(deny.value!) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k) : ['probe failed: ' + deny.error];
    check('every deny-list name is gone, along the prototype chain', reach.length === 0, reach.join(', ') || 'none reachable');

    const store = await run(`
import js, json
out = {}
for label, f in [('indexedDB pmf-vault-handles', lambda: js.self.indexedDB.open('pmf-vault-handles')), ('vault lock', lambda: js.self.navigator.locks.request('pmf-vault:v', lambda l: None)), ('caches', lambda: js.self.caches.open('x'))]:
    try:
        f(); out[label] = 'REACHED'
    except Exception as e:
        out[label] = 'refused'
json.dumps(out)`);
    const leaked = store.ok ? Object.entries(JSON.parse(store.value!) as Record<string, string>).filter(([, v]) => v !== 'refused').map(([k]) => k) : ['probe failed: ' + store.error];
    check('the vault handle database, the vault lock and caches can’t be reached', leaked.length === 0, leaked.join(', ') || 'all refused');

    const esc = await run(`
import js, json
out = {}
for label, f in [('js.eval', lambda: js.eval('1')), ('js.Function', lambda: js.Function('return 1')()), ('import() via eval', lambda: js.eval("import('${OTHER}/evil.mjs?via=eval')"))]:
    try:
        f(); out[label] = 'RAN'
    except Exception as e:
        out[label] = 'refused'
try:
    import pyodide.code
    pyodide.code.run_js("import('${OTHER}/evil.mjs?via=run_js')"); out['run_js'] = 'RAN'
except Exception as e:
    out['run_js'] = 'refused'
json.dumps(out)`);
    await new Promise(r => setTimeout(r, 500));
    const ran = esc.ok ? Object.entries(JSON.parse(esc.value!) as Record<string, string>).filter(([, v]) => v !== 'refused').map(([k]) => k) : ['probe failed: ' + esc.error];
    check('eval, Function and a dynamic import() to another origin are refused', ran.length === 0 && hits.length === 0, (ran.join(', ') || 'all refused') + ' · requests reaching the other origin: ' + hits.length);

    const loop = await run('while True:\n    pass', 2000);
    check('an endless loop is stopped by the time limit', !loop.ok && /time limit/.test(loop.error || '') && loop.ms < 4000, (loop.error || '') + ' after ' + loop.ms + ' ms');
    const after = await run('import json\njson.dumps(6 * 7)');
    check('the next call runs in a fresh worker', after.ok && after.value === '42', after.value || after.error || '');

    const err = await run('raise ValueError("x must contain values on both sides of 0")');
    check('a Python error arrives with its message', !err.ok && err.error === 'ValueError: x must contain values on both sides of 0', err.error || '');
    // One call can't change another's result (F137): a script that patches statistics and json, then a plain mean.
    const evil = 'import statistics, json\nstatistics.mean = lambda v: 42.0\njson.dumps = lambda o, **k: "x"\ndef f(x, y) -> float:\n    return 0.0\n';
    await run('_call(' + JSON.stringify(evil) + ', "f", [1.0], [1.0], {})');
    const mean = await run('_call(' + JSON.stringify('import statistics\ndef m(x, y) -> float:\n    return statistics.mean(y)\n') + ', "m", [1.0, 2.0, 3.0], [1.0, 2.0, 3.0], {})');
    const two = (() => { try { return JSON.parse(mean.value!).value === 2; } catch { return false; } })();
    check('a module one call changes is back for the next call', mean.ok && two, mean.value || mean.error || '');
    check('no CSP violation or error on the page', violations.length === 0, violations.join(' | ') || 'none');
  } finally {
    await browser.close(); app.close(); other.close();
  }
  for (const [name, ok, detail] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  process.exit(results.every(r => r[1]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
