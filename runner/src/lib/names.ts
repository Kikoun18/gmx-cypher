// Output names (R5, T30): one stem per run from a template, made safe and unique with the Matrix's own
// safeFileName and uniqueName, so all four files of a run are new names and nothing is ever overwritten.

import { TOKENS } from '../../../matrix/src/lib/seq';
import { FILE_NAME_MAX, safeFileName, uniqueName } from '../../../matrix/src/lib/storage/path';

export const DEFAULT_TEMPLATE = '{analysis}_{trajectory}';

/** The runner's own tokens, then the Matrix's fields (filled from a vault target, R6). `{*}` means nothing in a name. */
export const NAME_TOKENS = ['{analysis}', '{trajectory}', ...TOKENS.map(t => t.t).filter(t => t !== '{*}' && t !== '{analysis}')];

/** The stem a template gives, safe as a file name, with room left for a ` (2)` suffix within the Matrix' 64. */
export function renderStem(template: string, values: Record<string, string>): string {
  const text = template.replace(/\{[^{}]*\}/g, token => {
    if (!NAME_TOKENS.includes(token)) throw new Error('unknown token ' + token);
    const v = values[token.slice(1, -1)];
    if (!v) throw new Error(token + ' has no value here');
    return v;
  });
  if (/[{}]/.test(text)) throw new Error('a { or } without its pair: ' + template);
  return safeFileName(text + '.xvg', FILE_NAME_MAX - 4).slice(0, -'.xvg'.length);
}

const SUFFIXES = ['.xvg', '_cn.xvg', '.ndx', '.run.json'];

export const outputNames = (stem: string) => ({ xvg: stem + '.xvg', cn: stem + '_cn.xvg', ndx: stem + '.ndx', record: stem + '.run.json' });

/**
 * The first of stem, `stem (2)`, `stem (3)`… whose files are all free in a folder holding `taken` (as uniqueName:
 * case-insensitive): the four of the first spec, and `extra` suffixes a command adds (gmx awh's `_t20.xvg`, R5).
 */
export function freeStem(stem: string, taken: string[], extra: string[] = []): string {
  // Every taken name that one of a stem's files could be, seen as that stem's .xvg; uniqueName skips those.
  const suffixes = [...SUFFIXES, ...extra.map(s => s.toLowerCase())];
  const asXvg = taken.flatMap(t => suffixes.filter(s => t.toLowerCase().endsWith(s)).map(s => t.slice(0, -s.length) + '.xvg'));
  return uniqueName(stem + '.xvg', asXvg).slice(0, -'.xvg'.length);
}
