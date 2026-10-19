// The design contract's machine-checkable parts (docs/design-contract.md, R1): the tests, the shortcut sheet and the
// page read them from here, and the contract quotes this module.

import { TONES } from '../lib/tones'
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
