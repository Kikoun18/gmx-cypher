import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PY_FILES } from '../src/lib/pyFiles';

// R3a: the sandbox's two layers are pinned here so they can't loosen by accident; `npm run check:sandbox` runs them in Chromium.
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('the Python sandbox page (R3a, F93)', () => {
  it('carries exactly the approved CSP', () => {
    expect(read('public/py/sandbox.html')).toContain(`content="default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self' blob:; worker-src data:"`);
  });
  it('removes every name of section 1.4 and Phase 0 along the prototype chain', () => {
    const js = read('public/py/sandbox.js');
    for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport', 'FontFace', 'fonts', 'locks', 'storage', 'serviceWorker']) expect(js).toContain("'" + n + "'");
    expect(js).toMatch(/Object\.getPrototypeOf/);
  });
  it('serves Pyodide’s five files from the app’s own copy, pinned', () => {
    expect(PY_FILES).toEqual(['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']);
    for (const f of PY_FILES) expect(existsSync(new URL('../node_modules/pyodide/' + f, import.meta.url))).toBe(true);
    expect(JSON.parse(read('package.json')).dependencies.pyodide).toBe('314.0.7');
  });
});
