/** Pyodide's files, served from the app's own copy at py/pyodide/ (vite.config.ts), never from a CDN (batch 3, R3a). */
export const PY_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
/** The pinned Pyodide (package.json); its Python version is part of every script result's cache key (R3c). */
export const PYODIDE_VERSION = '314.0.7';
