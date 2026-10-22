// How gmx-cypher starts with many jobs (R12): a temporary home with N synthetic jobs, each a finished job whose log is
// M megabytes of gmx's progress lines in 4 kB pieces (as gmx writes them); then, in a fresh process, the time to read
// the jobs and the memory they hold. Not part of npm test. The home is removed after.
//   node scripts/measure-jobs.mjs [jobs=2000] [megabytes=1]
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'

const RUNNER = new URL('..', import.meta.url).pathname
const n = Number(process.argv[2] ?? 2000), mb = Number(process.argv[3] ?? 1)
const home = mkdtempSync(join(tmpdir(), 'gmxc-measure-')), dir = join(home, 'jobs')
mkdirSync(dir)
try {
  const line = (i) => 'Reading frame ' + String(i).padStart(7) + ' time ' + (i * 10).toFixed(3).padStart(10) + '   \r'
  const piece = Array.from({ length: Math.ceil(4096 / line(0).length) }, (_, i) => line(i)).join('')
  const pieces = Math.ceil((mb * 1024 * 1024) / piece.length)
  const out = JSON.stringify({ t: 'out', s: piece }) + '\n'
  const body = out.repeat(pieces - 1) + JSON.stringify({ t: 'out', s: '\nLast frame ' + String(pieces * 50).padStart(7) + ' time  200000.000\n' }) + '\n'
  const at = '2026-10-20T10:00:00.000Z'
  for (let k = 0; k < n; k++) {
    const id = 'j' + String(k).padStart(12, '0'), spec = { kind: 'rdf', title: 'rdf_' + k, file: 'gmx', args: [], cwd: home, meta: {} }
    writeFileSync(join(dir, id + '.ndjson'), JSON.stringify({ t: 'created', at, spec }) + '\n' + JSON.stringify({ t: 'started', at, pid: 1 }) + '\n' + body
      + JSON.stringify({ t: 'ended', at, status: 'done', code: 0, signal: null }) + '\n')
  }
  // A fresh process reads them as the runner does at start: its time, then its memory once collected.
  const probe = `
    const t0 = performance.now(); const { Jobs } = await import(${JSON.stringify(RUNNER + 'server/jobs.ts')});
    const jobs = new Jobs(${JSON.stringify(dir)}); const ms = performance.now() - t0;
    globalThis.gc?.(); const m = process.memoryUsage();
    console.log(JSON.stringify({ jobs: jobs.list().length, ms: Math.round(ms), rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576) }))`
  const result = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--import', './server/register.mjs', '--input-type=module', '-e', probe], { cwd: RUNNER, encoding: 'utf8', maxBuffer: 1 << 20 }).trim().split('\n').pop())
  console.log(JSON.stringify({ ...result, logs: n + ' × ' + mb + ' MB', machine: platform() + ' ' + release() + ' · ' + cpus().length + ' × ' + cpus()[0].model.trim() + ' · ' + Math.round(totalmem() / 1073741824) + ' GB (' + Math.round(freemem() / 1073741824) + ' free) · node ' + process.version }))
} finally {
  rmSync(home, { recursive: true, force: true })
}
