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
  await expect(page.getByText('the inputs agree')).toBeVisible()
  await page.getByRole('button', { name: 'use these inputs' }).click()

  // Groups: sulfur as the reference, water oxygens as the selection, both by rule.
  await expect(page.locator('canvas')).toBeVisible()
  const rule = async (role: 'reference' | 'selection', name: string, value: string, within?: string) => {
    const card = page.locator(`section[aria-label^="${role} "]`)
    await card.getByRole('textbox', { name: role + ' name' }).fill(name)
    await card.getByRole('button', { name: '+ rule' }).click()
    await card.getByRole('combobox', { name: 'rule' }).click()
    await page.getByRole('option', { name: 'atom name' }).click()
    await card.getByRole('textbox', { name: 'atom names' }).fill(value)
    if (within) await card.getByRole('combobox', { name: 'in every residue named' }).fill(within)
    await card.getByRole('button', { name: '+ add' }).click()
  }
  await rule('reference', 'sulfur', 'S1')
  await expect(page.getByText('6 atoms')).toBeVisible()
  await rule('selection', 'water_O', 'OW1', 'SOL')
  await expect(page.getByText('800 atoms')).toBeVisible()
  // The reference in ink (R4a, T159): its card's border, its chip and its count, never a group's hue.
  const ink = await page.evaluate(() => getComputedStyle(document.body).color)
  const refCard = page.locator('section[aria-label^="reference "]')
  expect(await refCard.evaluate(e => getComputedStyle(e).borderTopColor)).toBe(ink)
  expect(await refCard.getByText('ref', { exact: true }).evaluate(e => [getComputedStyle(e).color, getComputedStyle(e).borderTopColor])).toEqual([ink, ink])
  expect(await refCard.getByText('6 atoms').evaluate(e => getComputedStyle(e).color)).toBe(ink)

  // RDF: the command is the planned one; run it.
  await page.getByRole('tab', { name: 'command' }).click()
  await expect(page.getByLabel('command line', { exact: true })).toContainText("-o rdf/rdf_nvt.xvg -ref 'group 0' -sel 'group 1'")
  await page.getByRole('button', { name: 'run', exact: true }).click()

  // Jobs: it runs, ends, and shows its chart, first peak and record.
  await expect(page.getByRole('heading', { name: /rdf_nvt · sulfur → water_O/ })).toBeVisible()
  await expect(page.locator('figure[data-slot=line-chart]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('first shell · water_O')).toBeVisible()
  await expect(page.getByText('maximum · water_O')).toBeVisible()
  // Here the first shell is the maximum: both stats read 0.374 nm.
  await expect(page.getByText('0.374 nm')).toHaveCount(2)
  await expect(page.getByText('rdf_nvt.run.json')).toBeVisible()
  // The result's group table: the reference's name in ink too.
  expect(await page.getByRole('cell', { name: 'sulfur', exact: true }).evaluate(e => getComputedStyle(e).color)).toBe(ink)
  expect(errors).toEqual([])
})

test('Shift+Enter adds a rule and keeps the form open in the same group, with the same residue name', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url)
  await page.getByRole('button', { name: 'nvt.xtc' }).click()
  await expect(page.getByText('the inputs agree')).toBeVisible()
  await page.getByRole('button', { name: 'use these inputs' }).click()
  await expect(page.locator('canvas')).toBeVisible()

  const card = page.locator('section[aria-label^="reference "]')
  await card.getByRole('button', { name: '+ rule' }).click()
  await card.getByRole('combobox', { name: 'rule' }).click()
  await page.getByRole('option', { name: 'atom name' }).click()
  await card.getByRole('combobox', { name: 'in every residue named' }).fill('SOL')
  const names = card.getByRole('textbox', { name: 'atom names' })
  await names.fill('HW1')
  await names.press('Shift+Enter')

  // The rule is in, in this group; the form is still open, empty, in the same residue name, and focused.
  await expect(card.getByText('800 atoms')).toBeVisible()
  await expect(card.getByText('atom name HW1 in every SOL')).toBeVisible()
  await expect(names).toBeVisible()
  await expect(names).toHaveValue('')
  await expect(names).toBeFocused()
  await expect(card.getByRole('combobox', { name: 'in every residue named' })).toHaveValue('SOL')
  await names.fill('HW2')
  await names.press('Enter')
  await expect(card.getByText('1600 atoms')).toBeVisible()
  await expect(card.getByText('atom name HW2 in every SOL')).toBeVisible()
  // Enter closes the form; and no group was made on the way.
  await expect(names).toBeHidden()
  await expect(page.locator('section[aria-label^="selection "]')).toHaveCount(1)
  expect(errors).toEqual([])
})
