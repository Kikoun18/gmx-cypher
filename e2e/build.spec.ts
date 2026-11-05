// Building from the page (R5c): a system planned in systems, built with the fake tools (the notebook's own output),
// followed on progress until it waits for the cluster with its submit lines. The base folder holds every file a build
// reads, so the build button is there to press.
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { baseFolder, tmp } from '../test/helpers'

const RUNNER = new URL('..', import.meta.url).pathname
let runner: ChildProcess, url: string

test.beforeAll(async () => {
  const base = baseFolder(), home = tmp('e2e-build-home')
  writeFileSync(join(home, 'config.json'), JSON.stringify({ allow: [dirname(base)], base, python: join(RUNNER, 'test/fake-python.mjs'), buildWait: { every: 1, max: 10 } }))
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs')],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home } })
  url = await new Promise<string>((resolve, reject) => {
    let log = ''
    runner.stdout!.on('data', d => { log += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(log); if (m) resolve(m[1]) })
    runner.on('exit', code => reject(new Error('runner exited ' + code + ': ' + log)))
  })
})
test.afterAll(() => { runner?.kill() })

test('build a system from systems, follow it on progress until it waits for the cluster (R5c), read its summary (R9), and take it to analysis (R10)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + '#symbuilder/systems')
  await page.getByLabel('add a saccharide').fill('o111'); await page.keyboard.press('Enter')
  await page.getByLabel('add a sequence').fill('hhhhhhhh'); await page.keyboard.press('Enter')
  const build = page.getByRole('button', { name: 'build 1 system' })
  await expect(build).toBeEnabled()
  await build.click()
  await expect(page).toHaveURL(/#symbuilder\/progress$/)
  const row = page.getByRole('button', { name: /hmr\+fast\+6 \/ o111 \/ hhhhhhhh/ })
  await expect(row.getByText('cluster', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('qq submit -q gpu solutions/hmr+fast+6/o111/hhhhhhhh/7.awh/hmr+fast+6_awh_hhhhhhhh.sh')).toBeVisible()
  await expect(page.getByText('net charge 0.00 e: 30 NA_s and 30 CL_2s')).toBeVisible()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['region']).analyze()
  expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + v.nodes[0].target.join(' '))).toEqual([])
  // Its summary (R9): the warnings by stage as the notebook counted them for this system.
  await page.getByRole('tab', { name: 'summary' }).click()
  await expect(page.getByRole('region', { name: 'build summary' }).getByText('SB 7 · MIN 4 · NVT 4 · NPT 4 · AWH 4 · PULL 3')).toBeVisible()
  const axe2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['region']).analyze()
  expect(axe2.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + v.nodes[0].target.join(' '))).toEqual([])
  // From the built system to analysis (R10): set-up's batch mode, filled in; nothing runs before its own run.
  await page.getByRole('button', { name: 'analyse the walkers in set-up' }).click()
  await expect(page).toHaveURL(/#setup\/inputs\?mode=batch$/)
  await expect(page.getByLabel('path template')).toHaveValue('{method}/{column}/{seq}/9.multiwalker/{run}/9.multiwalker.xtc')
  await expect(page.getByLabel('root', { exact: true })).toHaveValue(/\/solutions$/)
  expect(errors).toEqual([])
})
