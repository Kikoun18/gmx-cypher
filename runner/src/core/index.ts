// The visualization core (R5): the kit, made once from the data it can't import, and the one copy of the tones,
// the dashes, the ticks, the atom ranges and the structure parser. Everything else imports these from here;
// nothing else defines them (test/core.test.ts reads every file to check).

import { DASH as MATRIX_DASH, DASH_NAMES as MATRIX_DASH_NAMES } from '../../../matrix/src/lib/graph'
import { elementOf, structFormat } from '../../../matrix/src/lib/structFile'
import { decypherKit, type Curve, type KitData, type Palette, type Peak, type Struct, type Tone } from './kit'

export type { Struct, Tone }
/** The eight group and column hues, in palette order. */
export const TONES: readonly Tone[] = ['coral', 'sky', 'mint', 'butter', 'lilac', 'aqua', 'rose', 'stone']
/** The kit's data, as the HTML export writes it beside the kit's source. */
export const KIT_DATA: KitData = { tones: TONES, dash: MATRIX_DASH, dashNames: MATRIX_DASH_NAMES }
export const kit = decypherKit(KIT_DATA)
/** The Matrix's ten dashes, by index, with their names. */
export const { DASH, DASH_NAMES, niceTicks, toRanges, fromRanges } = kit

/** A .gro or .pdb text read by the one parser (R5b), each atom's element decided by the Matrix's elementOf (T14). */
export const parseStructure = (text: string, format: 'gro' | 'pdb'): Struct => kit.parseStructure(text, format, elementOf)
/** A structure file by its name or, failing that, its content. */
export function readStructure(name: string, text: string): Struct {
  const format = structFormat(name, text)
  if (!format) throw new Error(name.split(/[\\/]/).pop() + ' is not a .gro or .pdb')
  return parseStructure(text, format)
}

/** One curve of a result as its view states it: label, points as read, tone, dash, and what the chart marks on it. */
export interface Series { label: string; points: [number, number][]; tone: Tone; dash?: number; dim?: boolean; err?: number[]; peak?: Peak | null; shell?: Peak | null }
/** A result's series as the core's curves (R5c): x and y exactly as read, each in its tone's strong ink and its dash. */
export const curvesOf = (series: Series[], pal: Palette): Curve[] => series.map((s, i) => ({
  key: String(i), name: s.label, source: '', analysis: '', x: s.points.map(p => p[0]), y: s.points.map(p => p[1]), color: pal.hues[s.tone].strong,
  dash: DASH[(s.dash ?? 0) % DASH.length], peak: s.peak ?? null, shell: s.shell ?? null, atoms: 0, dim: s.dim, ...(s.err ? { err: s.err } : {}),
}))
