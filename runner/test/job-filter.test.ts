// The jobs list's search and filters (R12b), as pure functions: by command, status, batch, folder and date; free text
// over the display name, the groups and the folder; all of it in the address.
import { describe, expect, it } from 'vitest'
import { filterJobs, filterOptions, filterQuery, parseFilter, type JobFilter } from '../src/lib/jobFilter'
import { formatRoute, parseRoute } from '../src/lib/route'

const job = (id: string, kind: string, status: string, cwd: string, created: string, title: string, o: { name?: string; batch?: string; batchName?: string } = {}) =>
  ({ id, kind, status, cwd, created, title, ...(o.name ? { name: o.name } : {}), meta: { outDir: cwd + '/out', ...(o.batch ? { batch: o.batch, batchName: o.batchName } : {}) } })
const JOBS = [
  job('jmk2abcd1x9z', 'rdf', 'done', '/sims/WRWYCR/ha/07_md', '2026-10-20T12:00:00.000Z', 'rdf_nvt · sulfur → water_O', { name: 'WRWYCR · HA · rdf' }),
  job('jmk2abcf00aa', 'rdf', 'failed', '/sims/WRWYCR/hb/07_md', '2026-10-19T12:00:00.000Z', 'rdf_nvt · sulfur → sodium', { batch: 'b1', batchName: 'rdf recipe' }),
  job('jmk2abcf00ab', 'rms', 'done', '/sims/KLVFFA/ha/07_md', '2026-10-12T12:00:00.000Z', 'rms_nvt · backbone → backbone', { batch: 'b1', batchName: 'rdf recipe' }),
  job('jmk2abcf00ac', 'energy', 'running', '/sims/KLVFFA/ha/07_md', '2026-09-30T12:00:00.000Z', 'energy_nvt · gmx energy'),
]
const ids = (f: JobFilter) => filterJobs(JOBS, f).map(j => j.id)

describe('search and filters (R12b)', () => {
  it.each([
    ['nothing: every job', {}, ['jmk2abcd1x9z', 'jmk2abcf00aa', 'jmk2abcf00ab', 'jmk2abcf00ac']],
    ['by command', { command: 'rdf' }, ['jmk2abcd1x9z', 'jmk2abcf00aa']],
    ['by status', { status: 'failed' }, ['jmk2abcf00aa']],
    ['by batch', { batch: 'b1' }, ['jmk2abcf00aa', 'jmk2abcf00ab']],
    ['by folder, and every folder in it', { folder: '/sims/KLVFFA' }, ['jmk2abcf00ab', 'jmk2abcf00ac']],
    ['by date, from and to, each day whole', { from: '2026-10-12', to: '2026-10-19' }, ['jmk2abcf00aa', 'jmk2abcf00ab']],
    ['from a day on', { from: '2026-10-19' }, ['jmk2abcd1x9z', 'jmk2abcf00aa']],
    ['text: the display name', { q: 'wrwycr · ha' }, ['jmk2abcd1x9z']],
    ['text: a group, any case', { q: 'SODIUM' }, ['jmk2abcf00aa']],
    ['text: the folder', { q: 'klvffa' }, ['jmk2abcf00ab', 'jmk2abcf00ac']],
    ['text: every word must match, anywhere', { q: 'klvffa backbone' }, ['jmk2abcf00ab']],
    ['filters together', { command: 'rdf', status: 'done', q: 'water' }, ['jmk2abcd1x9z']],
    ['nothing matches', { command: 'rmsf' }, []],
  ] as [string, JobFilter, string[]][])('%s', (_, f, want) => expect(ids(f)).toEqual(want))

  it('offers the values the jobs have, each with its count', () => {
    const o = filterOptions(JOBS)
    expect(o.commands).toEqual([['rdf', 2], ['energy', 1], ['rms', 1]])
    expect(o.statuses).toEqual([['done', 2], ['failed', 1], ['running', 1]])
    expect(o.batches).toEqual([['b1', 'rdf recipe', 2]])
    expect(o.folders).toEqual([['/sims/KLVFFA/ha/07_md', 2], ['/sims/WRWYCR/ha/07_md', 1], ['/sims/WRWYCR/hb/07_md', 1]])
  })

  it('lives in the address: read, written, and empty values left out', () => {
    const f = parseFilter(new URLSearchParams('status=failed&command=rdf&q=water%20o&from=2026-10-01&to=bad&batch=&x=1'))
    expect(f).toEqual({ status: 'failed', command: 'rdf', q: 'water o', from: '2026-10-01' })
    expect(filterQuery(f)).toBe('q=water+o&command=rdf&status=failed&from=2026-10-01')
    expect(filterQuery({})).toBe('')
  })

  it('in the results\' and compare\'s addresses alike', () => {
    expect(parseRoute('#results?status=failed&command=rdf').route).toEqual({ view: 'results', job: null, filter: { status: 'failed', command: 'rdf' } })
    expect(parseRoute('#results/jmk2abcd1x9z?q=water').route).toEqual({ view: 'results', job: 'jmk2abcd1x9z', filter: { q: 'water' } })
    expect(parseRoute('#compare?jobs=jmk2abcd1x9z,jmk2abcf00aa&status=done').route).toEqual({ view: 'compare', jobs: ['jmk2abcd1x9z', 'jmk2abcf00aa'], filter: { status: 'done' } })
    expect(formatRoute({ view: 'results', job: 'jmk2abcd1x9z', filter: { command: 'rdf', status: 'failed' } })).toBe('#results/jmk2abcd1x9z?command=rdf&status=failed')
    expect(formatRoute({ view: 'compare', jobs: ['jmk2abcd1x9z', 'jmk2abcf00aa'], filter: { q: 'x' } })).toBe('#compare?jobs=jmk2abcd1x9z,jmk2abcf00aa&q=x')
    // An old address, and one without filters, as before.
    expect(parseRoute('#results').route).toEqual({ view: 'results', job: null })
    expect(parseRoute('#results').redirect).toBe(false)
  })
})
