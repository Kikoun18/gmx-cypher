import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { copyFileSync, createReadStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PY_FILES } from './src/lib/pyFiles.ts'

// Pyodide's five files from node_modules, served at py/pyodide/ in dev and copied there in the build (batch 3, R3a).
// They are never committed and never fetched from a CDN.
function pyodideFiles(): Plugin {
  const from = (f: string) => new URL('./node_modules/pyodide/' + f, import.meta.url).pathname
  const TYPE: Record<string, string> = { mjs: 'text/javascript', wasm: 'application/wasm', zip: 'application/zip', json: 'application/json' }
  return {
    name: 'pyodide-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = (req.url || '').split('?')[0].match(/\/py\/pyodide\/([^/]+)$/)?.[1]
        if (!f || !PY_FILES.includes(f)) return next()
        res.setHeader('Content-Type', TYPE[f.split('.').pop()!] || 'application/octet-stream')
        createReadStream(from(f)).pipe(res)
      })
    },
    writeBundle(o) {
      const out = join(o.dir!, 'py', 'pyodide')
      mkdirSync(out, { recursive: true })
      for (const f of PY_FILES) copyFileSync(from(f), join(out, f))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pyodideFiles()],
  base: './',
  // 3Dmol is loaded lazily, only when a structure is opened.
  build: { chunkSizeWarningLimit: 700 },
})
