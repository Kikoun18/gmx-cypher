// Whether the inputs belong together (T13): every disagreement is a blocking problem, in words.

export interface Counts { structure: number | null; runInput: number | null; trajectory: number | null }

const NAMES: Record<keyof Counts, string> = { structure: 'the structure', runInput: 'the run input', trajectory: 'the trajectory' };

export function judgeInputs(c: Counts, index?: { groups: number; maxAtom: number }): string[] {
  const problems: string[] = [];
  for (const k of ['structure', 'runInput', 'trajectory'] as const) if (c[k] == null) problems.push(NAMES[k] + (k === 'structure' ? ': no atoms could be read from it (a .gro or .pdb?)' : ': gmx did not report an atom count'));
  if (c.runInput != null) {
    for (const k of ['structure', 'trajectory'] as const) if (c[k] != null && c[k] !== c.runInput) problems.push(NAMES[k] + ' has ' + c[k] + ' atoms, the run input ' + c.runInput);
    if (index && index.maxAtom > c.runInput) problems.push('the index refers to atom ' + index.maxAtom + '; the run input has ' + c.runInput + ' atoms');
  }
  return problems;
}

/** Before a run (T21): each group's size as gmx select counts it must be the one gmx-cypher wrote. */
export function judgeSizes(groups: { name: string; count: number }[], sizes: number[] | null): string[] {
  if (!sizes) return ['gmx select reported no sizes'];
  if (sizes.length !== groups.length) return ['gmx select reported ' + sizes.length + ' groups, gmx-cypher wrote ' + groups.length];
  return groups.flatMap((g, i) => (sizes[i] === g.count ? [] : [g.name + ': gmx counts ' + sizes[i] + ' atoms, gmx-cypher ' + g.count]));
}
