// Compare takes any command's result (R10): an RMSF result and an H-bond result, run through gmx-cypher (the fake gmx
// on the nvt fixtures), side by side in compare: the RMSF painted on its structure, the H-bond pairs drawn in frame
// positions; exported as one HTML file that draws both on its own, from file://, with nothing fetched.
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { tmp } from '../test/helpers'

const RUNNER = new URL('..', import.meta.url).pathname, F = RUNNER + 'test/fixtures/'
let runner: ChildProcess, url: string, sim: string
const jobs: Record<string, string> = {}

test.beforeAll(async () => {
  const home = tmp('e2e-home')
  sim = tmp('e2e-sim')
  const md = join(sim, 'md')
  mkdirSync(md)
  for (const f of ['nvt.gro', 'nvt.tpr', 'nvt.xtc', 'index.ndx']) cpSync(F + 'nvt/' + f, join(md, f))
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs'), '--allow', sim],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home } })
  const [base, token] = await new Promise<[string, string]>((resolve, reject) => {
    let log = ''
    runner.stdout!.on('data', d => { log += d; const m = /(http:\/\/127\.0\.0\.1:\d+)\/\?token=([\w-]+)/.exec(log); if (m) resolve([m[1], m[2]]) })
    runner.stderr!.on('data', d => (log += d))
    runner.on('exit', code => reject(new Error('the runner exited ' + code + ': ' + log)))
  })
  url = base + '/?token=' + token
  const call = async <T,>(path: string, body?: unknown): Promise<T> => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: base, cookie: 'gmx-cypher=' + token }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!r.ok) throw new Error(path + ': ' + r.status + ' ' + (await r.text()))
    return r.json() as Promise<T>
  }
  const inputs = { trajectory: join(md, 'nvt.xtc'), runInput: join(md, 'nvt.tpr'), structure: join(md, 'nvt.gro') }
  const res = (role: string, name: string, tone: string, value: string) => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'resname', value } }] })
  jobs.rmsf = (await call<{ id: string }>('/api/runs', { tool: 'rmsf', inputs, groups: [res('selection', 'sulfate', 'coral', 'SO4')], options: {} })).id
  jobs.hbond = (await call<{ id: string }>('/api/runs', { tool: 'hbond', inputs, groups: [res('reference', 'sulfate', 'coral', 'SO4'), res('selection', 'water', 'sky', 'SOL')], options: {} })).id
  jobs.rdf = (await call<{ id: string }>('/api/runs', { inputs, groups: [res('reference', 'sulfate', 'coral', 'SO4'), res('selection', 'water', 'sky', 'SOL'), res('selection', 'sodium', 'mint', 'Na')], options: {} })).id
  for (let i = 0; i < 100; i++) {
    const list = await call<{ id: string; status: string }[]>('/api/jobs')
    if (Object.values(jobs).every(id => list.find(j => j.id === id)?.status === 'done')) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('the jobs did not finish')
})

test.afterAll(() => { runner?.kill('SIGTERM') })

function watch(page: Page) {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

test('an RMSF and an H-bond result in compare, exported, then opened offline', async ({ page, context }) => {
  const errors = watch(page)
  await page.goto(url)
  await page.goto(url + '#compare?jobs=' + jobs.rmsf + ',' + jobs.hbond)
  const view = page.getByRole('region', { name: 'compare', exact: true })
  const rmsf = view.getByRole('region', { name: /^rmsf_nvt/ }), hbond = view.getByRole('region', { name: /^hbond_nvt/ })
  // The RMSF painted: its scale in place of the plotted key. The pairs: found, and drawn once in frame positions.
  await expect(rmsf.getByText(/^RMSF \(nm\) .* · the rest neutral$/)).toBeVisible()
  await expect(hbond.getByText('569 pairs found over the trajectory: arrange the molecules in frame positions to draw them')).toBeVisible()
  await hbond.getByRole('button', { name: /^display/ }).click()
  await hbond.getByRole('radio', { name: 'frame positions' }).click()
  await page.keyboard.press('Escape')
  await expect(hbond.getByText("569 pairs found over the trajectory, drawn dashed at the structure's positions: the 200 nearest · 369 not drawn")).toBeVisible()
  await expect(hbond.getByText(/solvent hidden but for the pairs' molecules/)).toBeVisible()

  await view.getByRole('button', { name: 'export' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '+ Export html' }).click()])
  const file = join(tmp('e2e-export'), download.suggestedFilename())
  await download.saveAs(file)
  const html = readFileSync(file, 'utf8')
  expect(html).not.toContain(sim)
  // The pairs' waters came along, though an export leaves solvent out.
  expect(html).toContain('"SOL"')
  const exported = await context.newPage(), exportErrors = watch(exported), requests: string[] = []
  exported.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()) })
  await exported.goto('file://' + file)
  await expect(exported.locator('canvas')).toHaveCount(2)
  await expect(exported.getByText(/^RMSF \(nm\) .* · the rest neutral$/)).toBeVisible()
  await expect(exported.getByText("569 pairs found over the trajectory, drawn dashed at the structure's positions: the 200 nearest · 369 not drawn")).toBeVisible()
  await exported.getByRole('button', { name: 'dark' }).click()
  await expect(exported.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(requests).toEqual([])
  expect(exportErrors).toEqual([])
  expect(errors).toEqual([])
})

// WCAG 2 AA (colour contrast included) on the result pages and in compare, in both themes: no serious or critical
// violation (Phase 9 QA, kept as a test; `region` is left out, the page's landmarks are named by their parts).
for (const theme of ['light', 'dark'] as const) {
  test('axe finds nothing serious on results and compare, ' + theme, async ({ page }) => {
    const errors = watch(page)
    await page.addInitScript(t => { try { localStorage.setItem('gmx-cypher-theme', t) } catch { /* the default theme */ } }, theme)
    const check = async (where: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['region']).analyze()
      expect([where, r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + v.nodes[0].target.join(' '))]).toEqual([where, []])
    }
    await page.goto(url)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const k of ['rmsf', 'hbond', 'rdf']) {
      await page.goto(url + '#results/' + jobs[k])
      await expect(page.locator('[data-landmark="charts"]')).toBeVisible()
      await check('result ' + k)
    }
    // An RDF of two groups, one of them not plotted: its chip greyed, as the rest is in the structure.
    await page.goto(url + '#compare?jobs=' + jobs.rmsf + ',' + jobs.hbond + ',' + jobs.rdf)
    const view = page.getByRole('region', { name: 'compare', exact: true })
    await expect(view.getByRole('region', { name: /^hbond_nvt/ })).toBeVisible()
    const rdf = view.getByRole('region', { name: /^rdf_nvt/ })
    await expect(rdf.getByRole('button', { name: /^sodium/ })).toBeVisible()
    if (await rdf.getByRole('button', { name: /^sodium/ }).getAttribute('aria-pressed') === 'true') await rdf.getByRole('button', { name: /^sodium/ }).click()
    await expect(rdf.getByRole('button', { name: /^sodium/ })).toHaveAttribute('aria-pressed', 'false')
    await check('compare, each result')
    await view.getByRole('radio', { name: 'one graph' }).click()
    await expect(view.getByRole('region', { name: 'one graph' })).toBeVisible()
    await check('compare, one graph')
    expect(errors).toEqual([])
  })
}
