// The design contract's machine-checkable parts (docs/design-contract.md, R1): the tests, the shortcut sheet and the
// page read them from here, and the contract quotes this module.

import { TONES } from './index'
export { TONES }

/**
 * Words the page never shows (R3b, contract §1): a job is one gmx execution, a record its .run.json, a run the
 * Matrix's replicate slot, a result what a job produced. *Run* stays a verb.
 */
export const NEVER_SHOWN: { phrase: RegExp; instead: string }[] = [
  { phrase: /\b(each|every) job\b/i, instead: 'each result, every result' },
  { phrase: /\brun again\b/i, instead: 'open in set-up' },
  // "run input" is GROMACS's .tpr, and "run number" or "run slot" the Matrix's run: both keep the word.
  { phrase: /\b(this|that|the|a) run\b(?!['’]?s? input| number| slot)/i, instead: 'this job, the job' },
  { phrase: /\brun['’]s\b(?! input)|\bruns on disk\b|\bthe runs\b/i, instead: "the job's, records on disk, the jobs" },
  { phrase: /\bby job\b|\beach job its\b/i, instead: 'colour by result' },
  { phrase: /\bopen in \(de\)Cypher\b|\b(open|close) \(de\)Cypher\b|\binside \(de\)Cypher\b/i, instead: 'compare' },
]

/** An internal reference the page never shows (R3a): a ticket, a question or a request, such as "(T35)", "(question 28)" or "(R9c)". */
export const INTERNAL_REFERENCE = /\((?:questions? \d+|T\d+|R\d+[a-z]?)\b[^)]*\)|\bquestions? \d+\b/


/** Colour roles → the tokens that carry them (contract §2, T159). The role layer is src/roles.json, over Morpheus's tokens.json. */
export const ROLES: Record<string, readonly string[]> = {
  'ui state': ['state', 'state-foreground', 'primary', 'primary-foreground', 'ring'],
  error: ['destructive', 'destructive-foreground'],
  group: TONES.flatMap(t => [t, t + '-foreground', t + '-soft', t + '-strong']),
  reference: ['foreground'],
  'ordered series': ['ramp-0', 'ramp-1', 'ramp-2', 'ramp-3'],
  neutral: ['atom-c', 'atom-h', 'atom-o', 'atom-n', 'atom-s', 'atom-p', 'atom-x', 'bond', 'edge'],
}

/** The only files in src/ that may name a colour by its hex value (R4b): Morpheus's tokens and the role layer. */
export const COLOUR_FILES = ['src/tokens.json', 'src/roles.json']

/** The tokens of UI state: never a data tone (contract §2). */
export const UI_STATE = ROLES['ui state']

/** The four status levels (R9c, contract §4): an icon and a word before the text, so colour is never the only signal. */
export type Level = 'ok' | 'info' | 'warning' | 'error'
export const STATUS: Record<Level, { icon: string; word: string; token: string; when: string }> = {
  ok: { icon: 'circle-check', word: 'ok', token: 'foreground', when: 'a check passed' },
  info: { icon: 'info', word: 'note', token: 'foreground', when: 'worth knowing; nothing to do' },
  warning: { icon: 'triangle-alert', word: 'check', token: 'foreground', when: 'a result may mislead: look before trusting it' },
  error: { icon: 'circle-x', word: 'error', token: 'destructive', when: 'nothing ran or nothing can be read; it says how to fix it' },
}

/** The only files whose classes may colour text or a ground `destructive` (R4a, R9c): the status component and destructive buttons. */
export const DESTRUCTIVE_FILES = ['src/ui/status.tsx', 'src/ui/button.tsx']


/** The order of a result page (R9b, contract §5), for every result kind and every compare card. */
export const RESULT_ORDER = ['actions', 'charts', 'settings', 'provenance'] as const

/** The one set of structure styles (question 17): each 3D view offers these; one its renderer can't draw is shown disabled, with the reason. */
export const STYLES = ['ball & stick', 'sticks', 'spheres', 'lines', 'cartoon'] as const
export type Style = (typeof STYLES)[number]

/** The actions that have a key (R8b, contract §3): what each does, in words, where it works, and its key by default. Settings → keyboard rebinds them. */
export type KeyAction = 'compare' | 'export' | 'sheet' | 'fit' | 'reset' | 'box' | 'centre' | 'hydrogens' | 'labels' | 'prev' | 'next'
export type KeyWhere = 'anywhere' | 'structures' | 'compare'
export const KEYS: readonly { action: KeyAction; words: string; where: KeyWhere; key: string; held?: boolean }[] = [
  { action: 'compare', words: 'opens compare with the jobs selected, and goes back', where: 'anywhere', key: 'd' },
  { action: 'export', words: 'exports the focused chart, in the default format', where: 'anywhere', key: 'e' },
  { action: 'sheet', words: 'opens this list of keys', where: 'anywhere', key: '?' },
  { action: 'fit', words: 'fits the plotted groups', where: 'structures', key: 'f' },
  { action: 'reset', words: 'resets the view', where: 'structures', key: 'r' },
  { action: 'box', words: 'shows or hides the box', where: 'structures', key: 'b' },
  { action: 'centre', words: 'held, makes a click centre on the group', where: 'structures', key: 'c', held: true },
  { action: 'hydrogens', words: 'shows or hides hydrogens', where: 'structures', key: 'h' },
  { action: 'labels', words: 'shows or hides labels', where: 'compare', key: 'l' },
  { action: 'prev', words: 'leads the one graph with the previous result', where: 'compare', key: '[' },
  { action: 'next', words: 'leads the one graph with the next result', where: 'compare', key: ']' },
]

/** The keys that are not rebound (contract §3), for the sheet: what they do, and where. */
export const FIXED_KEYS: readonly { keys: string[]; words: string; where: string }[] = [
  { keys: ['Esc'], words: 'backs out or closes', where: 'anywhere' },
  { keys: ['Enter'], words: 'submits a field', where: 'fields' },
  { keys: ['Space'], words: 'held, makes a drag pan', where: 'structures' },
  { keys: ['←', '→'], words: 'step along a curve (with Shift: ten points)', where: 'charts' },
  { keys: ['↑', '↓'], words: 'the previous or next curve', where: 'charts' },
  { keys: ['Home', 'End'], words: 'the first or last point', where: 'charts' },
  { keys: ['Enter'], words: 'marks the point; with the add key, draws a vertical line (with Shift too: horizontal)', where: 'charts' },
]
