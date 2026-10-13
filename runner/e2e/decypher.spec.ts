// (de)Cypher in a browser: two finished RDF jobs (your Methionine runs) ticked in the jobs tab, side by side with
// their structure, on one graph, exported as one HTML file that works on its own; its key rebound in settings.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const RUNNER = new URL('..', import.meta.url).pathname, F = RUNNER + 'test/fixtures/decypher/'
let runner: ChildProcess, url: string, sim: string

test.beforeAll(async () => {
  const home = mkdtempSync(join(tmpdir(), 'gmxc-e2e-home-'))
  sim = mkdtempSync(join(tmpdir(), 'gmxc-e2e-sim-'))
  const out = join(sim, 'rdf')
  mkdirSync(out)
  mkdirSync(join(home, 'jobs'))
  copyFileSync(F + '9.multiwalker.gro', join(sim, '9.multiwalker.gro'))
  for (const [k, id] of [['H', 'jaaaaaaaaaaa1'], ['S', 'jaaaaaaaaaaa2']]) {
    const stem = 'rdf_o111_Methionine_' + k, rec = JSON.parse(readFileSync(F + stem + '.run.json', 'utf8'))
    for (const ext of ['.xvg', '.ndx']) copyFileSync(F + stem + ext, join(out, stem + ext))
    rec.job = id
    rec.inputs.structure.path = join(sim, '9.multiwalker.gro')
    rec.outputs = [{ kind: 'xvg', path: join(out, stem + '.xvg'), size: 1, sha256: 'x' }]
    writeFileSync(join(out, stem + '.run.json'), JSON.stringify(rec))
    const at = k === 'H' ? '2026-10-12T17:16:09.289Z' : '2026-10-12T17:20:00.000Z'
    const spec = { kind: 'rdf', title: stem + ' · ' + rec.groups[0].name + ' → 13 groups', file: 'gmx', args: [], cwd: sim, meta: { stem, outDir: out, record: join(out, stem + '.run.json'), names: { xvg: stem + '.xvg', ndx: stem + '.ndx' } } }
    writeFileSync(join(home, 'jobs', id + '.ndjson'), [{ t: 'created', at, spec }, { t: 'started', at, pid: 1 }, { t: 'ended', at, status: 'done', code: 0, signal: null }].map(e => JSON.stringify(e)).join('\n') + '\n')
  }
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs'), '--allow', sim],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home } })
  url = await new Promise<string>((resolve, reject) => {
    let log = ''
    runner.stdout!.on('data', d => { log += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(log); if (m) resolve(m[1]) })
    runner.stderr!.on('data', d => (log += d))
    runner.on('exit', code => reject(new Error('the runner exited ' + code + ': ' + log)))
  })
})

test.afterAll(() => { runner?.kill('SIGTERM') })

function watch(page: Page) {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

test('tick two jobs, see them side by side and on one graph, export them as one HTML file', async ({ page, context }) => {
  const errors = watch(page)
  await page.goto(url)
  await page.getByRole('tab', { name: /jobs/ }).click()
  for (const k of ['H', 'S']) await page.getByRole('checkbox', { name: new RegExp('show rdf_o111_Methionine_' + k + '.* in \\(de\\)Cypher') }).click()
  await page.getByRole('button', { name: /^\(de\)Cypher · 02/ }).click()

  // Each job: its structure (solvent hidden) beside its g(r), the first group plotted.
  const dialog = page.getByRole('dialog', { name: '(de)Cypher' })
  const h = dialog.getByRole('region', { name: /rdf_o111_Methionine_H/ }), s = dialog.getByRole('region', { name: /rdf_o111_Methionine_S/ })
  await expect(h).toBeVisible()
  await expect(s).toBeVisible()
  await expect(h.getByText('249 atoms · solvent hidden', { exact: false })).toBeVisible()
  await expect(h.getByText('Groups 13 · plotted 01')).toBeVisible()
  await h.getByRole('button', { name: /^O5\.\.\.S/ }).click({ modifiers: ['Shift'] })
  await expect(h.getByText('Groups 13 · plotted 02')).toBeVisible()
  await expect(h.getByRole('button', { name: 'take O5...S off the plot' })).toBeVisible()

  // One graph: the H run's groups, found in the S run by their atoms, its curves dashed.
  await dialog.getByRole('radio', { name: 'one graph' }).click()
  const graph = dialog.getByRole('region', { name: 'one graph' })
  await expect(graph.getByText('Methionine_S', { exact: true }).first()).toBeVisible()
  await expect(graph.getByRole('button', { name: 'take O5...S off the plot' })).toHaveCount(2)

  // Export: one file that draws on its own, from file://, with nothing fetched.
  await dialog.getByRole('button', { name: 'export' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '+ Export html' }).click()])
  await expect(page.getByText(/✓ exported decypher_2-RDFs_/)).toBeVisible()
  const file = join(mkdtempSync(join(tmpdir(), 'gmxc-e2e-export-')), download.suggestedFilename())
  await download.saveAs(file)
  const html = readFileSync(file, 'utf8')
  expect(html).not.toContain(sim)
  const exported = await context.newPage(), exportErrors = watch(exported), requests: string[] = []
  exported.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()) })
  await exported.goto('file://' + file)
  await expect(exported.getByRole('heading', { name: '(de)Cypher' })).toBeVisible()
  await expect(exported.locator('canvas')).toHaveCount(2)
  await expect(exported.getByText('ONE GRAPH')).toBeVisible()
  const card = exported.locator('section').filter({ has: exported.getByRole('heading', { name: /rdf_o111_Methionine_S/ }) })
  await card.getByRole('button', { name: /^CH\.\.\.S/ }).click({ modifiers: ['Shift'] })
  await expect(card.locator('.dc-trow b', { hasText: 'CH...S' })).toBeVisible()
  await exported.getByRole('button', { name: 'dark' }).click()
  await expect(exported.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(requests).toEqual([])
  expect(exportErrors).toEqual([])
  expect(errors).toEqual([])
})

test('the key opens and closes (de)Cypher; settings rebind it; runs on disk are found by their records', async ({ page }) => {
  const errors = watch(page)
  await page.goto(url)
  await page.keyboard.press('d')
  const dialog = page.getByRole('dialog', { name: '(de)Cypher' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('d')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'settings' }).click()
  await page.getByRole('button', { name: 'open and close (de)Cypher change' }).click()
  await page.keyboard.press('k')
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('K', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await page.keyboard.press('d')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('k')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('radio', { name: 'runs' }).click()
  await dialog.getByRole('button', { name: 'find' }).click()
  await dialog.getByText('rdf_o111_Methionine_H', { exact: true }).click()
  await expect(dialog.getByRole('region', { name: /rdf_o111_Methionine_H · H_Met → 13 groups/ })).toBeVisible()
  await expect(dialog.getByText('run on disk · 51 frames', { exact: false }).first()).toBeVisible()
  expect(errors).toEqual([])
})
