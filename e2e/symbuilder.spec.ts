// SymBuilder's build and systems views (R3c) in a browser: systems typed, the preview, the inspector's command for the
// first system, a tile moved by its buttons and one dragged from the palette, the draft kept over a reload. Nothing
// runs here (the base folder lacks files, so the build button says why); e2e/build.spec.ts builds.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { tmp } from '../test/helpers'

const RUNNER = new URL('..', import.meta.url).pathname
let runner: ChildProcess, url: string

test.beforeAll(async () => {
  // A base folder with o111's files and two mdp files: pg's, and the rest, are missing.
  const allowed = tmp('e2e-sym'), base = join(allowed, 'innit_tests'), home = tmp('e2e-sym-home')
  for (const d of ['molecules/saccharides', 'ff', 'inputs']) mkdirSync(join(base, d), { recursive: true })
  for (const f of ['molecules/saccharides/o111.gro', 'ff/o111-ADD.itp', 'inputs/eq_nvt.mdp']) writeFileSync(join(base, f), f.endsWith('.mdp') ? 'integrator = md\nnsteps = 125000\n' : '\n')
  // The force field's terminus block names and water models, for pdb2gmx's menus.
  const ff = join(base, 'ff/charmm36s-jul2022-prosECCo75.ff'), menus = join(RUNNER, 'test/fixtures/build/ff-menus')
  mkdirSync(ff)
  for (const f of readdirSync(menus).filter(f => f !== 'README.md')) copyFileSync(join(menus, f), join(ff, f))
  writeFileSync(join(home, 'config.json'), JSON.stringify({ allow: [allowed], base }))
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs')],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home } })
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
  // Its row in the preview: the base folder here holds only some of its files, so the check names the rest.
  await expect(page.getByRole('region', { name: 'preview' }).getByText('inputs/minim.mdp', { exact: false })).toBeVisible()
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

test('files: each found or missing in the base folder, an mdp read in place, the system that misses one named (R4); pdb2gmx\'s answers for MET (T230)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url + '#symbuilder/systems')
  for (const [what, v] of [['saccharide', 'o111'], ['saccharide', 'pg'], ['sequence', 'aaaaaaaa']]) { await page.getByLabel('add a ' + what).fill(v); await page.keyboard.press('Enter') }
  await expect(page.getByRole('region', { name: 'preview' }).getByText('molecules/saccharides/pg.gro, ff/pg-ADD.itp')).toBeVisible()
  await page.getByRole('tab', { name: 'files', exact: true }).click()
  await expect(page.getByText('2 systems are missing a file')).toBeVisible()
  await page.getByRole('button', { name: 'inputs/eq_nvt.mdp' }).click()
  await expect(page.getByText('nsteps = 125000')).toBeVisible()
  // MET's termini menus start with the ethers' MET1 and MET2: the plan's 1 8 0 0 picks them; one press gives it 1 8 1 1.
  await page.getByRole('tab', { name: /^systems/ }).click()
  await page.getByLabel('add a sequence').fill('mmmmmmmm'); await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'files', exact: true }).click()
  const answers = page.getByRole('region', { name: 'pdb2gmx\'s answers' })
  await expect(answers.getByText('the N-terminus answer, 0, picks MET1 for MET, not NH3+', { exact: false })).toBeVisible()
  await answers.getByRole('button', { name: 'use 1 8 1 1' }).click()
  await expect(answers.getByText('MET … MET · 1 8 1 1 (its own)')).toBeVisible()
  await expect(answers.getByText('NH3+ · COO-')).toHaveCount(2)
  expect(errors).toEqual([])
})
