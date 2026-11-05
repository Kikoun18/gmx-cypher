// SymBuilder's build and systems views (R3c) in a browser: systems typed, the preview, the inspector's command for the
// first system, a tile moved by its buttons and one dragged from the palette, the draft kept over a reload. Nothing
// runs: building comes later.
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { tmp } from '../test/helpers'

const RUNNER = new URL('..', import.meta.url).pathname
let runner: ChildProcess, url: string

test.beforeAll(async () => {
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs'), '--allow', tmp('e2e-sym')],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: tmp('e2e-sym-home') } })
  url = await new Promise<string>((resolve, reject) => {
    let log = ''
    runner.stdout!.on('data', d => { log += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(log); if (m) resolve(m[1]) })
    runner.on('exit', code => reject(new Error('runner exited ' + code + ': ' + log)))
  })
})
test.afterAll(() => { runner?.kill() })

test('plan a build: systems, the preview, a tile\'s command, tiles moved and dragged, kept over a reload (R3c)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + '#symbuilder/systems')
  await page.getByLabel('add a saccharide').fill('o111'); await page.keyboard.press('Enter')
  await page.getByLabel('add a sequence').fill('aaaaaaaa'); await page.keyboard.press('Enter')
  await page.getByLabel('add a sequence').fill('a b'); await expect(page.getByText('a sequence is one-letter amino-acid codes')).toBeVisible()
  await page.getByLabel('add a sequence').fill('')
  await expect(page.getByRole('button', { name: 'build 1 system' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'preview' }).getByText('ready')).toBeVisible()
  // The walkers stage, checkable.
  await page.getByRole('button', { name: 'multiwalker' }).click()
  await expect(page.getByRole('button', { name: 'multiwalker' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('tab', { name: 'build', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: /the selected tile: pdb2gmx/ })
  await expect(inspector).toContainText('pdb2gmx -f ../solutions/hmr+fast+6/o111/aaaaaaaa/aaaaaaaa.gro -v -ignh')
  await expect(inspector).toContainText('# stdin  1 · 8 · 0 · 0')
  // pdb2gmx moved above what it reads: the order is a problem, said in words.
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'move pdb2gmx up' }).click()
  await expect(page.getByText('pdb2gmx, inside ff/ reads aaaaaaaa.gro before centre the peptide writes it')).toBeVisible()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'move pdb2gmx down' }).click()
  await expect(page.getByText('reads aaaaaaaa.gro before')).toHaveCount(0)
  // A tile dragged from the palette onto the stack.
  const salt = page.getByRole('button', { name: /^add salt/ })
  await expect(salt).toHaveCount(1)
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await page.getByRole('button', { name: /^add add salt/ }).dispatchEvent('dragstart', { dataTransfer: dt })
  const water = page.getByRole('button', { name: /^add water/ }).first()
  await water.dispatchEvent('dragover', { dataTransfer: dt })
  await water.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.getByRole('button', { name: /^add salt/ })).toHaveCount(2)

  await page.reload()
  await expect(page.getByText('= 1 systems')).toBeVisible()
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + v.nodes[0].target.join(' '))).toEqual([])
  expect(errors).toEqual([])
})
