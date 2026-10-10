// What the commands built from a form share (R8, R9): their numbers checked as gmx would check them, the options
// checked against the form and this gmx's -h, and the options that differ from the installed defaults as arguments.
import type { CommandOption } from './commands';
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

/** Set whatever the form says: PMF Sequences reads ps and the xmgrace @ lines (as T22 for rdf). */
export const FIXED: Record<string, string> = { tu: 'ps', xvg: 'xmgrace' };

/**
 * The numbers among `options`, in words: each a number; those in `positive` above 0, those in `whole` whole numbers of
 * 0 or more; -dt 0 or more; -e after -b.
 */
export function numberProblems(options: Options, help: HelpOption[], numbers: string[], positive: string[] = [], whole: string[] = []): string[] {
  const p: string[] = [], by = new Map(help.map(o => [o.flag, o]));
  for (const f of ['b', 'e', 'dt', ...numbers]) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    const n = Number(v);
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(n)) p.push('-' + f + ': not a number: ' + v);
    else if (positive.includes(f) && n <= 0) p.push('-' + f + ' must be above 0');
    else if (whole.includes(f) && (n < 0 || !Number.isInteger(n))) p.push('-' + f + ': a whole number, 0 or more');
    else if (f === 'dt' && n < 0) p.push('-dt must be 0 or more');
  }
  const b = Number(options.b ?? by.get('b')?.default ?? 0), e = Number(options.e || 0);
  if (!p.length && e > 0 && e <= b) p.push('-e must be after -b');
  return p;
}

/** The form by flag, once every option given is one of it and this gmx has it (else a thrown reason). */
export function checkOptions(tool: string, form: CommandOption[], options: Options, help: HelpOption[]) {
  const has = new Set(help.map(o => o.flag)), by = new Map(form.map(f => [f.flag, f]));
  for (const k of Object.keys(options)) {
    const f = by.get(k);
    if (!f) throw new Error('-' + k + ' is not an option gmx-cypher sets for ' + tool);
    if (!f.own && !has.has(f.switch ?? k)) throw new Error('this gmx ' + tool + ' has no -' + (f.switch ?? k));
  }
  return by;
}

/**
 * The options that differ from the installed defaults, in -h order, with `fixed` set whatever the form says. `lists`
 * are flags whose value is several words, each its own argument (`-de N O S`, as typed in a shell).
 */
export function optionArgs(form: Map<string, CommandOption>, options: Options, help: HelpOption[], fixed = FIXED, lists: string[] = []): string[] {
  const args: string[] = [];
  for (const o of help) {
    const f = form.get(o.flag);
    const v = fixed[o.flag] ?? (f && !f.switch && !f.own ? options[o.flag] : undefined);
    if (isDefault(o, v)) continue;
    if (lists.includes(o.flag)) args.push('-' + o.flag, ...String(v).trim().split(/\s+/));
    else args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return args;
}
