// The Python sandbox (batch 3, R3a; Phase 0 §5, F93). This hidden same-origin page carries the strict CSP, fetches
// Pyodide's files from the app once, and runs Pyodide in an opaque-origin data: worker that removes the deny-list
// along the prototype chain before any user code runs. It relays calls from the app one at a time, and terminates
// the worker when a call runs over its time limit (F94); the next call starts a fresh one.
'use strict';
const FILES = { mjs: 'pyodide.mjs', asm: 'pyodide.asm.mjs', wasm: 'pyodide.asm.wasm', stdlib: 'python_stdlib.zip', lock: 'pyodide-lock.json' };

// Runs inside the worker. It never sees a URL of the app: Pyodide arrives as bytes.
const WORKER = `
const DENY = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport', 'FontFace', 'fonts'];
const NAV = ['locks', 'storage', 'serviceWorker'];
// Layer 1: remove each name from every object on the prototype chain, then pin it to undefined.
const strip = (root, name) => {
  for (let o = root; o; o = Object.getPrototypeOf(o)) if (Object.prototype.hasOwnProperty.call(o, name)) { try { delete o[name]; } catch {} }
  try { Object.defineProperty(root, name, { value: undefined, writable: false, configurable: false }); } catch {}
};
const lastLine = e => String(e && e.message || e).trim().split('\\n').filter(Boolean).pop() || 'error';
let py = null;
self.onmessage = async ({ data }) => {
  if (data.kind === 'boot') {
    try {
      const url = (buf, type) => URL.createObjectURL(new Blob([buf], { type }));
      const fetch0 = self.fetch, f = data.files;
      self.fetch = (u, o) => String(u).endsWith('pyodide.asm.wasm') ? Promise.resolve(new Response(f.wasm, { headers: { 'content-type': 'application/wasm' } })) : fetch0(u, o);
      const { loadPyodide } = await import(url(f.mjs, 'text/javascript'));
      const createPyodideModule = (await import(url(f.asm, 'text/javascript'))).default;
      py = await loadPyodide({ indexURL: 'https://pyodide.invalid/', createPyodideModule, stdLibURL: url(f.stdlib, 'application/zip'), lockFileContents: new TextDecoder().decode(f.lock) });
      self.fetch = fetch0;
      for (const n of DENY) strip(self, n);
      for (const n of NAV) strip(self.navigator, n);
      await py.runPythonAsync(data.helpers || '');
      self.postMessage({ kind: 'loaded', version: py.runPython('import sys; sys.version.split()[0]') });
    } catch (e) { self.postMessage({ kind: 'failed', error: lastLine(e) }); }
  } else if (data.kind === 'run') {
    const names = Object.keys(data.vars || {});
    try {
      for (const k of names) py.globals.set(k, py.toPy(data.vars[k]));
      const v = await py.runPythonAsync(data.code);
      self.postMessage({ id: data.id, ok: true, value: String(v) });
    } catch (e) { self.postMessage({ id: data.id, ok: false, error: lastLine(e) }); }
    finally { for (const k of names) try { py.globals.delete(k); } catch {} }
  }
};`;

let files = null, helpers = '', worker = null, booting = null;
const queue = [];
let busy = false;
const reply = msg => parent.postMessage(msg, location.origin);

function boot() {
  if (booting) return booting;
  booting = new Promise((ok, fail) => {
    const w = new Worker('data:text/javascript,' + encodeURIComponent(WORKER), { type: 'module' });
    w.onmessage = e => { if (e.data.kind === 'loaded') { worker = w; ok(e.data.version); } else if (e.data.kind === 'failed') fail(new Error(e.data.error)); };
    w.onerror = e => fail(new Error('the sandbox worker didn’t start: ' + (e.message || 'blocked')));
    // The bytes are copied, not transferred, so a restarted worker gets them again.
    w.postMessage({ kind: 'boot', files, helpers });
  });
  booting.catch(() => { booting = null; });
  return booting;
}

async function next() {
  if (busy || !queue.length) return;
  busy = true;
  const d = queue.shift();
  try {
    await boot();
    const w = worker;
    await new Promise(done => {
      const timer = setTimeout(() => {
        w.terminate(); worker = null; booting = null;
        reply({ id: d.id, ok: false, error: 'stopped after ' + d.timeoutMs / 1000 + ' s (time limit)' });
        done();
      }, d.timeoutMs);
      w.onmessage = e => { if (e.data.id !== d.id) return; clearTimeout(timer); reply(e.data); done(); };
      w.postMessage({ kind: 'run', id: d.id, code: d.code, vars: d.vars });
    });
  } catch (e) {
    reply({ id: d.id, ok: false, error: String(e.message || e) });
  }
  busy = false;
  next();
}

addEventListener('message', async e => {
  if (e.source !== parent || e.origin !== location.origin) return;
  const d = e.data || {};
  if (d.kind === 'init' && !files) {
    try {
      helpers = String(d.helpers || '');
      const get = async f => { const r = await fetch(new URL('pyodide/' + f, location.href)); if (!r.ok) throw new Error(f + ': ' + r.status); return r.arrayBuffer(); };
      files = {};
      for (const [k, f] of Object.entries(FILES)) files[k] = await get(f);
      reply({ kind: 'ready', version: await boot() });
    } catch (err) { files = null; reply({ kind: 'failed', error: String(err.message || err) }); }
  } else if (d.kind === 'run' && typeof d.code === 'string') {
    queue.push({ id: d.id, code: d.code, vars: d.vars || {}, timeoutMs: Math.max(100, Number(d.timeoutMs) || 10000) });
    next();
  }
});
