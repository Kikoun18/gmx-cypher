// What differs between two runs (R13), from their records: the command and the record's format, each option (with its
// default), the frames asked for and analysed, each input (the same file moved is the same input: by its SHA-256, else
// its size and time), the groups (matched as compare matches them: the same atoms of the same structure, else the name,
// with the atoms added and removed), gmx, the runner and the environment. What is equal is counted, not listed; what
// one record does not hold (an older runner's) is "not recorded", not a difference.

import { kit, toRanges } from '../core/index'

export interface DiffRecord {
  version?: number; analysis?: string
  runner?: { version?: string }; gmx?: { path?: string; version?: string }; env?: Record<string, string>
  frames?: { analysed: number; lastTime: number } | null
  inputs?: Record<string, { path: string; size?: number; mtime?: string; sha256?: string } | undefined>
  groups: { role: string; name: string; atoms: string }[]
  options?: { flag: string; value: unknown; default?: unknown }[]
}
export type DiffSection = 'command' | 'options' | 'frames' | 'inputs' | 'groups' | 'gmx' | 'environment'
export interface DiffRow { section: DiffSection; field: string; a: string; b: string; note?: string }

export const NOT_RECORDED = 'not recorded'
const FRAMES: Record<string, string> = { b: 'first frame (-b)', e: 'last frame (-e)', dt: 'every (-dt)' }
const shown = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v))
const base = (p: string) => p.split('/').pop() ?? p

/** Two records' differences, in sections; the fields equal, and those one record does not hold; `all` of them in order. */
export function diffRecords(a: DiffRecord, b: DiffRecord): { rows: DiffRow[]; equal: number; same: DiffRow[]; unrecorded: DiffRow[]; all: DiffRow[] } {
  const all: DiffRow[] = [], rows: DiffRow[] = [], same: DiffRow[] = [], unrecorded: DiffRow[] = []
  const push = (to: DiffRow[], r: DiffRow) => { to.push(r); all.push(r) }
  // `undefined`: the record does not hold this field.
  const field = (section: DiffSection, name: string, x: string | undefined, y: string | undefined, note?: string) =>
    push(x === undefined || y === undefined ? unrecorded : x === y ? same : rows, { section, field: name, a: x ?? NOT_RECORDED, b: y ?? NOT_RECORDED, ...(note ? { note } : {}) })
  const held = <T, U>(r: T | undefined, f: (r: T) => U) => (r === undefined ? undefined : f(r))

  field('command', 'command', 'gmx ' + (a.analysis ?? 'rdf'), 'gmx ' + (b.analysis ?? 'rdf'))
  field('command', 'record format', 'version ' + (a.version ?? 1), 'version ' + (b.version ?? 1))

  // Options, the frames' among them: the value given, or the default it ran with.
  const opts = (r: DiffRecord) => new Map((r.options ?? []).map(o => [o.flag, o]))
  const oa = opts(a), ob = opts(b)
  for (const flag of [...new Set([...oa.keys(), ...ob.keys()])]) {
    const x = oa.get(flag), y = ob.get(flag), d = x?.default ?? y?.default
    field(FRAMES[flag] ? 'frames' : 'options', FRAMES[flag] ?? '-' + flag, held(x, o => shown(o.value)), held(y, o => shown(o.value)), d !== undefined ? 'default ' + shown(d) : undefined)
  }
  const frames = (r: DiffRecord) => held(r.frames, f => (f ? f.analysed + ' frames, to ' + f.lastTime + ' ps' : '—'))
  field('frames', 'analysed', frames(a), frames(b))

  // Inputs: the same file wherever it is, by its SHA-256 when both have one, else its size and time.
  for (const slot of [...new Set([...Object.keys(a.inputs ?? {}), ...Object.keys(b.inputs ?? {})])]) {
    const x = a.inputs?.[slot], y = b.inputs?.[slot]
    const id = (f: typeof x, other: typeof x) => (!f ? '—' : f.sha256 && other?.sha256 ? 'sha256 ' + f.sha256.slice(0, 12) : 'size ' + f.size + ', ' + f.mtime)
    if (x && y && id(x, y) === id(y, x)) { push(same, { section: 'inputs', field: slot, a: x.path, b: y.path, note: id(x, y) }); continue }
    field('inputs', slot, x ? base(x.path) + ' · ' + id(x, y) : '—', y ? base(y.path) + ' · ' + id(y, x) : '—', x && y ? x.path + ' → ' + y.path : undefined)
  }

  // Groups: the reference with the reference; each selection as compare matches groups (kit.matchGroup).
  const structure = (r: DiffRecord) => r.inputs?.structure?.sha256 ?? r.inputs?.structure?.path ?? null
  const side = (r: DiffRecord) => ({ struct: structure(r), ref: r.groups.find(g => g.role === 'reference'), sels: r.groups.filter(g => g.role !== 'reference').map(g => ({ name: g.name, atoms: kit.fromRanges(g.atoms), tone: 'stone' as const, role: g.role })) })
  const A = side(a), B = side(b)
  const atoms = (name: string, x: number[], y: number[], role = 'group') => {
    const sx = new Set(x), sy = new Set(y), plus = y.filter(n => !sx.has(n)), minus = x.filter(n => !sy.has(n))
    field('groups', role + ' ' + name + ': atoms', x.length + ' atoms', y.length + ' atoms', plus.length || minus.length ? [plus.length ? '+' + plus.length + ': ' + toRanges(plus) : '', minus.length ? '−' + minus.length + ': ' + toRanges(minus) : ''].filter(Boolean).join(' · ') : undefined)
  }
  if (A.ref || B.ref) {
    field('groups', 'reference', A.ref?.name ?? '—', B.ref?.name ?? '—')
    if (A.ref && B.ref) atoms(A.ref.name, kit.fromRanges(A.ref.atoms), kit.fromRanges(B.ref.atoms), 'reference')
  }
  const taken = new Set<unknown>()
  for (const g of A.sels) {
    const h = kit.matchGroup(g, B, A)
    if (!h || taken.has(h)) { push(rows, { section: 'groups', field: 'group ' + g.name, a: g.atoms.length + ' atoms', b: '—', note: 'in this job only' }); continue }
    taken.add(h)
    field('groups', 'group ' + g.name + ': name', g.name, h.name)
    atoms(g.name, g.atoms, h.atoms)
  }
  for (const h of B.sels) if (!taken.has(h)) push(rows, { section: 'groups', field: 'group ' + h.name, a: '—', b: h.atoms.length + ' atoms', note: 'in the other only' })
  const refDiffers = A.ref?.name !== B.ref?.name || A.ref?.atoms !== B.ref?.atoms
  if (refDiffers && A.sels.length && kit.sameButReference(A, B)) push(rows, { section: 'groups', field: 'in short', a: '', b: '', note: 'the same groups: only the reference differs' })

  field('gmx', 'gmx', held(a.gmx, g => shown(g.path)), held(b.gmx, g => shown(g.path)))
  field('gmx', 'gmx version', held(a.gmx, g => shown(g.version)), held(b.gmx, g => shown(g.version)))
  field('gmx', 'gmx-cypher', held(a.runner, r => shown(r.version)), held(b.runner, r => shown(r.version)))
  // Both environments recorded: a variable set in one only differs. One not recorded: nothing to say.
  for (const k of [...new Set([...Object.keys(a.env ?? {}), ...Object.keys(b.env ?? {})])].sort()) field('environment', k, held(a.env, e => shown(e[k])), held(b.env, e => shown(e[k])))
  return { rows, equal: same.length, same, unrecorded, all }
}
