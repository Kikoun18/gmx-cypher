// Start, pick inputs, make two groups, run with the fake gmx, see the chart: the whole path once, in a browser.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const RUNNER = new URL('..', import.meta.url).pathname
let runner: ChildProcess, url: string, sim: string

test.beforeAll(async () => {
  const home = mkdtempSync(join(tmpdir(), 'gmxc-e2e-home-'))
  sim = mkdtempSync(join(tmpdir(), 'gmxc-e2e-sim-'))
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc', 'index.ndx']) copyFileSync(join(RUNNER, 'test/fixtures/nvt', f), join(sim, f))
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs'), '--allow', sim],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home, FAKE_GMX_FRAMES: '11', FAKE_GMX_SLOW: '50' } })
  url = await new Promise<string>((resolve, reject) => {
    let out = ''
    runner.stdout!.on('data', d => { out += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(out); if (m) resolve(m[1]) })
    runner.stderr!.on('data', d => (out += d))
    runner.on('exit', code => reject(new Error('the runner exited ' + code + ': ' + out)))
  })
})

test.afterAll(() => { runner?.kill('SIGTERM') })

test('pick inputs, make groups, run, see the chart', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url)

  // Inputs: the trajectory brings the rest, and gmx (fake) agrees on the atom counts.
  await page.getByRole('button', { name: 'nvt.xtc' }).click()
  await expect(page.getByText('✓ the inputs agree')).toBeVisible()
  await page.getByRole('button', { name: 'use these inputs' }).click()

  // Groups: sulfur as the reference, water oxygens as the selection, both by rule.
  await expect(page.locator('canvas')).toBeVisible()
  const rule = async (role: 'reference' | 'selection', name: string, value: string, within?: string) => {
    const card = page.locator(`section[aria-label^="${role} "]`)
    await card.getByRole('textbox', { name: role + ' name' }).fill(name)
    await card.getByRole('button', { name: '+ rule' }).click()
    await card.getByRole('combobox', { name: 'rule' }).click()
    await page.getByRole('option', { name: 'atom name' }).click()
    await card.getByRole('combobox', { name: 'value' }).fill(value)
    if (within) await card.getByRole('combobox', { name: 'in every residue named' }).fill(within)
    await card.getByRole('button', { name: '+ add' }).click()
  }
  await rule('reference', 'sulfur', 'S1')
  await expect(page.getByText('6 atoms')).toBeVisible()
  await rule('selection', 'water_O', 'OW1', 'SOL')
  await expect(page.getByText('800 atoms')).toBeVisible()

  // RDF: the command is the planned one; run it.
  await page.getByRole('tab', { name: 'rdf' }).click()
  await expect(page.getByLabel('command', { exact: true })).toContainText("-o rdf/rdf_nvt.xvg -ref 'group 0' -sel 'group 1'")
  await page.getByRole('button', { name: 'run', exact: true }).click()

  // Jobs: it runs, ends, and shows its chart, first peak and record.
  await expect(page.getByRole('heading', { name: /rdf_nvt · sulfur → water_O/ })).toBeVisible()
  await expect(page.locator('figure[data-slot=line-chart]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('first peak · water_O')).toBeVisible()
  await expect(page.getByText('0.374 nm')).toBeVisible()
  await expect(page.getByText('rdf_nvt.run.json')).toBeVisible()
  expect(errors).toEqual([])
})
