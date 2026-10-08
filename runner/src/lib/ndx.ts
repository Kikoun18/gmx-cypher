// Index files (.ndx). GROMACS reads a group's name as the first word inside [ ] (checked: "[ water O ]"
// is the group "water"), so `name` is that word and `label` the whole text. Groups keep their order and
// duplicates: gmx addresses them by position.

export interface NdxGroup { name: string; label: string; atoms: number[] }

export function parseNdx(text: string): NdxGroup[] {
  const groups: NdxGroup[] = [];
  for (const line of text.split(/\r?\n/)) {
    const head = /^\s*\[\s*(.*?)\s*\]\s*$/.exec(line);
    if (head) { groups.push({ name: head[1].split(/\s+/)[0], label: head[1], atoms: [] }); continue; }
    const g = groups[groups.length - 1];
    if (g) for (const n of line.trim().split(/\s+/)) if (n) g.atoms.push(Number(n));
  }
  return groups;
}
