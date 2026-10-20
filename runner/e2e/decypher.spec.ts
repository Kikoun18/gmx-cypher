// (de)Cypher in a browser: two finished RDF jobs (your Methionine runs) ticked in the jobs tab, side by side with
// their structure, on one graph, exported as one HTML file that works on its own; its key rebound in settings.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
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
  // The Matrix's vault with two RDFs of one cell, whose runs this runner doesn't know (as for a vault from another machine).
  const vault = mkdtempSync(join(tmpdir(), 'gmxc-e2e-vault-'))
  execFileSync(process.execPath, ['--import', './server/register.mjs', 'e2e/make-vault.ts', vault], { cwd: RUNNER })
  writeFileSync(join(home, 'config.json'), JSON.stringify({ vault }))
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
  for (const k of ['H', 'S']) await page.getByRole('checkbox', { name: new RegExp('compare rdf_o111_Methionine_' + k) }).click()
  await page.getByRole('button', { name: /^compare · 02/ }).click()

  // Each job: its structure (solvent hidden) beside its g(r), the first group plotted.
  const dialog = page.getByRole('dialog', { name: 'compare' })
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
  await expect(page.getByText(/^decypher_2-RDFs_/)).toBeVisible()
  const file = join(mkdtempSync(join(tmpdir(), 'gmxc-e2e-export-')), download.suggestedFilename())
  await download.saveAs(file)
  // The same RDFs as figures (R6b): by default one PDF, a page for each card and one for the one graph.
  const [figures] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '+ Export figures' }).click()])
  const pdfFile = join(mkdtempSync(join(tmpdir(), 'gmxc-e2e-export-')), figures.suggestedFilename())
  await figures.saveAs(pdfFile)
  const pdf = readFileSync(pdfFile, 'latin1')
  expect([pdf.slice(0, 8), /\/Type \/Pages [^>]*\/Count (\d+)/.exec(pdf)?.[1], pdfFile.endsWith('.pdf')]).toEqual(['%PDF-1.4', '3', true])
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
  // The key works once the page has drawn (its handler is attached then); a press before that is lost under load.
  await expect(page.getByRole('button', { name: 'settings' })).toBeVisible()
  await page.keyboard.press('d')
  const dialog = page.getByRole('dialog', { name: 'compare' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('d')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'settings' }).click()
  await page.getByRole('button', { name: 'open and close compare change' }).click()
  await page.keyboard.press('k')
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('K', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await page.keyboard.press('d')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('k')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('radio', { name: 'on disk' }).click()
  await dialog.getByRole('button', { name: 'find' }).click()
  await dialog.getByText('rdf_o111_Methionine_H', { exact: true }).click()
  await expect(dialog.getByRole('region', { name: /rdf_o111_Methionine_H · H_Met → 13 groups/ })).toBeVisible()
  await expect(dialog.getByText('run on disk · 51 frames', { exact: false }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('morph the two runs into one card, pick their references, sorted values, headings of my own in the export', async ({ page, context }) => {
  const errors = watch(page)
  await page.goto(url)
  await page.getByRole('tab', { name: /jobs/ }).click()
  for (const k of ['H', 'S']) await page.getByRole('checkbox', { name: new RegExp('compare rdf_o111_Methionine_' + k) }).click()
  await page.getByRole('button', { name: /^compare · 02/ }).click()
  const dialog = page.getByRole('dialog', { name: 'compare' })
  await expect(dialog.getByRole('region', { name: /rdf_o111_Methionine_S/ })).toBeVisible()

  // The two runs share their structure and groups and differ in their reference: they can be morphed.
  await dialog.getByRole('combobox', { name: /^morph .*Methionine_H.* with another RDF/ }).click()
  await page.getByRole('option', { name: /Methionine_S/ }).click()
  const card = dialog.getByRole('region', { name: 'Methionine_H + Methionine_S' })
  await expect(card).toBeVisible()
  await expect(dialog.getByRole('region', { name: /rdf_o111_Methionine_S/ })).toHaveCount(0)
  await expect(card.getByText('2 RDFs · the same groups, one chart')).toBeVisible()
  await expect(card.locator('canvas')).toHaveCount(1)

  // Both references plotted; a chip plots that one alone, a second click on it both again, ⌘/shift adds or takes one.
  const refs = card.getByRole('button', { name: /^ref H_Met/ })
  await expect(refs).toHaveCount(2)
  await expect(refs.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(refs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(card.locator('.grid .truncate.font-bold', { hasText: 'NH_N...S' })).toHaveCount(2)
  await refs.nth(1).click()
  await expect(refs.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(refs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: 'take NH_N...S off the plot' })).toHaveCount(1)
  await refs.nth(1).click()
  await expect(refs.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await refs.nth(0).click({ modifiers: ['Shift'] })
  await expect(refs.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await refs.nth(0).click({ modifiers: ['Shift'] })
  await expect(card.getByRole('button', { name: 'take NH_N...S off the plot' })).toHaveCount(2)

  // A group plotted too, then the values under the pointer come highest first.
  await card.getByRole('button', { name: /^CH\.\.\.S/ }).click({ modifiers: ['Shift'] })
  const chart = card.locator('svg[role=img]').first()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5)
  const rows = card.locator('div').filter({ hasText: /^g\(r\) at r = / }).first().locator('xpath=..').locator('div.grid')
  await expect(rows.first()).toBeVisible()
  const values = (await rows.locator('span:last-child').allInnerTexts()).map(Number)
  expect(values.length).toBeGreaterThanOrEqual(4)
  expect(values).toEqual(values.slice().sort((a, b) => b - a))

  // Export: a heading for the page and one for the card, of my own.
  await dialog.getByRole('button', { name: 'export' }).click()
  await page.getByLabel('page heading').fill('Methionine, two references')
  await page.getByLabel('heading of 2 morphed RDFs').fill('Hydrogens against sulfurs')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '+ Export html' }).click()])
  const file = join(mkdtempSync(join(tmpdir(), 'gmxc-e2e-export-')), download.suggestedFilename())
  await download.saveAs(file)
  const html = readFileSync(file, 'utf8')
  const exported = await context.newPage(), exportErrors = watch(exported)
  await exported.goto('file://' + file)
  await expect(exported.getByRole('heading', { name: 'Methionine, two references', level: 1 })).toBeVisible()
  await expect(exported).toHaveTitle('Methionine, two references')
  await expect(exported.getByRole('heading', { name: 'Hydrogens against sulfurs', level: 2 })).toBeVisible()
  await expect(exported.locator('section.dc-card')).toHaveCount(2)
  await expect(exported.locator('canvas')).toHaveCount(1)
  const one = exported.locator('section.dc-card').filter({ has: exported.getByRole('heading', { name: 'Hydrogens against sulfurs' }) })
  const chips = one.locator('button.dc-ref')
  await expect(chips).toHaveCount(2)
  await expect(one.locator('.dc-trow b')).toHaveCount(4)
  await chips.nth(0).click()
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'false')
  await expect(one.locator('.dc-trow b')).toHaveCount(2)
  await chips.nth(1).click({ modifiers: ['Shift'] })
  await expect(one.locator('.dc-trow b')).toHaveCount(4)

  // The maximum is the highest point of the curve (the table gives it as "r · g", beside the first shell), and the exported values come highest first as well.
  const data = JSON.parse(/<script type="application\/json" id="dc-data">(.*?)<\/script>/s.exec(html)![1])
  const top = (a: number, name: string) => Math.max(...data.analyses[a].sels.find((g: { name: string }) => g.name === name).y)
  const peakG = (await one.locator('.dc-trow').filter({ hasText: 'NH_N...S' }).first().locator('span.dc-r').nth(1).innerText()).split(' · ')[1].trim()
  expect([top(0, 'NH_N...S').toFixed(2), top(1, 'NH_N...S').toFixed(2)]).toContain(peakG)
  const ebox = (await one.locator('.dc-chart svg').first().boundingBox())!
  await exported.mouse.move(ebox.x + ebox.width * 0.35, ebox.y + ebox.height * 0.5)
  await expect(one.locator('.dc-hrow').first()).toBeVisible()
  const exportedValues = (await one.locator('.dc-hrow span:last-child').allInnerTexts()).map(Number)
  expect(exportedValues.length).toBeGreaterThanOrEqual(4)
  expect(exportedValues).toEqual(exportedValues.slice().sort((a, b) => b - a))
  expect(exportErrors).toEqual([])
  expect(errors).toEqual([])
})

test('two RDFs of the vault, whose runs are unknown: the morph menu is there, and they morph by their group names', async ({ page }) => {
  const errors = watch(page)
  await page.goto(url)
  await page.keyboard.press('d')
  const dialog = page.getByRole('dialog', { name: 'compare' })
  await dialog.getByRole('radio', { name: 'vault' }).click()
  await dialog.getByText('Methionine × PG · run a', { exact: true }).click()
  await dialog.getByText('Methionine × PG · run b', { exact: true }).click()
  const cards = dialog.getByRole('region', { name: 'Methionine × PG', exact: true })
  await expect(cards).toHaveCount(2)
  // No atoms for the groups, so none to match by; the names are the same, so they do match.
  await expect(dialog.getByText('Groups 13 · plotted 01').first()).toBeVisible()
  await cards.first().getByRole('combobox', { name: /^morph .* with another RDF/ }).click()
  await page.getByRole('option', { name: /Methionine × PG · b/ }).click()
  const card = dialog.getByRole('region', { name: /Methionine × PG · a \+ Methionine × PG · b/ })
  await expect(card).toBeVisible()
  await expect(cards).toHaveCount(0)
  await expect(card.getByText('2 RDFs · the same groups, one chart')).toBeVisible()

  // With no reference known, each RDF has its own chip, named for it: one, the other or both.
  const chips = card.getByRole('button', { name: /^Methionine × PG · [ab]$/ })
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: 'take NH_N...S off the plot' })).toHaveCount(2)
  await chips.nth(1).click()
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(card.getByRole('button', { name: 'take NH_N...S off the plot' })).toHaveCount(1)
  await chips.nth(1).click()
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: 'take NH_N...S off the plot' })).toHaveCount(2)
  await card.getByRole('button', { name: 'split' }).click()
  await expect(cards).toHaveCount(2)
  expect(errors).toEqual([])
})
