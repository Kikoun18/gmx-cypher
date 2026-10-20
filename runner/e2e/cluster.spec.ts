// From the cluster tab to analysis (R15) in a browser: qq jobs -e (your sample, anonymised) read twice by fake tools,
// two jobs gone in between; the one whose input folder is allowed offers a batch, which opens set-up filled in, and
// nothing runs. The other's folder is not allowed here: no offer, the reason in words.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { tmp } from '../test/helpers'

const RUNNER = new URL('..', import.meta.url).pathname
let runner: ChildProcess, url: string, out: string, md: string, E: string

/** The sample without one job's row and the lines -e prints under it. */
const without = (text: string, key: string) => { const l = text.split('\n'), i = l.findIndex(x => x.includes(' ' + key + ' ')); return [...l.slice(0, i), ...l.slice(i + 5)].join('\n') }

test.beforeAll(async () => {
  const home = tmp('e2e-cluster-home'), sims = tmp('e2e-cluster-sims')
  md = join(sims, 'PEP2-POPC', '5_md'); mkdirSync(md, { recursive: true })
  out = join(tmp('e2e-qq'), 'out.txt')
  E = readFileSync(RUNNER + 'test/fixtures/cluster-tools/qq-jobs-e.txt', 'utf8').replace('/storage/store1-shard/home/user2/project-a/systems/PEP2-POPC/5_md', md)
  writeFileSync(out, E)
  writeFileSync(join(home, 'config.json'), JSON.stringify({ qq: RUNNER + 'test/fake-qq.mjs', gmxEta: RUNNER + 'test/fake-gmx-eta.mjs' }))
  runner = spawn(process.execPath, ['--import', './server/register.mjs', 'server/main.ts', '--port', '0', '--gmx', join(RUNNER, 'test/fake-gmx.mjs'), '--allow', sims],
    { cwd: RUNNER, env: { ...process.env, GMX_CYPHER_HOME: home, FAKE_QQ_OUT: out } })
  url = await new Promise<string>((resolve, reject) => {
    let log = ''
    runner.stdout!.on('data', d => { log += d; const m = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/.exec(log); if (m) resolve(m[1]) })
    runner.stderr!.on('data', d => (log += d))
    runner.on('exit', code => reject(new Error('runner exited ' + code + ': ' + log)))
  })
})
test.afterAll(() => { runner?.kill() })

test('a cluster job that ended offers a batch on its input folder; one click opens set-up, nothing runs (R15)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + '#cluster')
  const jobs = page.getByRole('table')
  // The input folder qq jobs -e printed, under each job's name (the fake gmx-eta adds its own sample's jobs, without one).
  await expect(jobs.getByText(md)).toBeVisible()
  writeFileSync(out, without(without(E, '1523728'), '1523727'))
  await page.getByRole('button', { name: 'refresh' }).click()
  const ended = page.getByRole('list', { name: 'ended jobs' })
  await expect(ended.getByRole('listitem')).toHaveCount(2)
  const offered = ended.getByRole('listitem').filter({ hasText: '1523728' }), refused = ended.getByRole('listitem').filter({ hasText: '1523727' })
  await expect(offered.getByText('no longer running')).toBeVisible()
  await expect(refused.getByText(/^not offered: /)).toBeVisible()
  await expect(refused.getByRole('button')).toHaveCount(0)
  await offered.getByRole('button', { name: 'run the form on PEP2-POPC/5_md' }).click()
  await expect(page).toHaveURL(/#setup\/inputs\?mode=batch$/)
  await expect(page.getByLabel('root')).toHaveValue(realpathSync(md))
  // Nothing ran: no batch, no job.
  const api = (p: string) => page.evaluate(async x => (await fetch(x)).json(), p)
  expect(await api('/api/batches')).toEqual([])
  expect(await api('/api/jobs')).toEqual([])
  expect(errors).toEqual([])
})
