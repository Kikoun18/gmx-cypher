// Where the page is (R9a): set-up's steps, results, compare and cluster, each at an address of its own, so a reload
// keeps the view and back and forward work. The tabs' old addresses still open what they opened; a job id that is not
// one the server makes is dropped, never passed on.

import { filterQuery, parseFilter, type JobFilter } from './jobFilter'

export type Step = 'inputs' | 'groups' | 'command'
export type Route =
  | { view: 'setup'; step: Step; batch: boolean }
  /** The jobs list's filter (R12b) goes with results and compare. */
  | { view: 'results'; job: string | null; filter?: JobFilter }
  /** `diff`: two jobs' records side by side, what differs (R13), in place of compare. */
  | { view: 'compare'; jobs: string[]; filter?: JobFilter; diff?: boolean }
  | { view: 'cluster' }

export const STEPS: readonly Step[] = ['inputs', 'groups', 'command']
/** A job's id as the server makes them (`j` and base-36 digits). */
export const isJobId = (s: string) => /^[a-z0-9]{6,32}$/.test(s)

const setup = (step: Step, batch = false): Route => ({ view: 'setup', step, batch })
const OLD: Record<string, Route> = { inputs: setup('inputs'), groups: setup('groups'), analysis: setup('command'), rdf: setup('command'), jobs: { view: 'results', job: null }, batch: setup('inputs', true) }

/** The view an address names, and whether the address must be written again (an old one, or one with a bad part). */
export function parseRoute(hash: string): { route: Route; redirect: boolean } {
  const h = hash.replace(/^#/, ''), [path, query = ''] = h.split('?'), parts = path.split('/'), q = new URLSearchParams(query)
  let route: Route = OLD[h] ?? setup('inputs')
  // The jobs list's filter (R12b), left out when there is none.
  const f = parseFilter(q), filter = Object.keys(f).length ? { filter: f } : {}
  if (parts[0] === 'setup' && (STEPS as readonly string[]).includes(parts[1])) route = setup(parts[1] as Step, q.get('mode') === 'batch')
  else if (parts[0] === 'results') route = { view: 'results', job: parts.length === 2 && isJobId(parts[1]) ? parts[1] : null, ...filter }
  else if (parts[0] === 'compare') route = { view: 'compare', jobs: [...new Set((q.get('jobs') ?? '').split(',').filter(isJobId))], ...filter, ...(q.get('diff') === '1' ? { diff: true } : {}) }
  else if (parts[0] === 'cluster') route = { view: 'cluster' }
  return { route, redirect: formatRoute(route) !== '#' + h }
}

/** The address of a view; only ids the reader would take are written. */
export function formatRoute(r: Route): string {
  if (r.view === 'setup') return '#setup/' + r.step + (r.batch ? '?mode=batch' : '')
  const f = r.view === 'results' || r.view === 'compare' ? filterQuery(r.filter ?? {}) : ''
  if (r.view === 'results') return '#results' + (r.job && isJobId(r.job) ? '/' + r.job : '') + (f ? '?' + f : '')
  if (r.view === 'compare') { const ids = r.jobs.filter(isJobId), q = [...(ids.length ? ['jobs=' + ids.join(',')] : []), ...(r.diff ? ['diff=1'] : []), ...(f ? [f] : [])]; return '#compare' + (q.length ? '?' + q.join('&') : '') }
  return '#cluster'
}
