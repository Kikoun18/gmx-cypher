// Every atom of a structure file with its GROMACS number (its 1-based position), and whether the Matrix'
// toPdb draws it (T14). The walk is toPdb's own: the same lines, the same elementOf. The k-th drawn atom is
// the k-th atom 3Dmol holds when it loads toPdb's text with keepH, so drawnNumbers(atoms)[k] is its number.

import { elementOf } from '../../../matrix/src/lib/structFile';

export interface Atom { nr: number; name: string; resn: string; resi: number; elem: string | null; drawn: boolean }

export function atomTable(text: string, format: 'gro' | 'pdb'): Atom[] {
  const atoms: Atom[] = [], lines = text.split(/\r?\n/);
  const add = (name: string, resn: string, resi: number, column = '') => {
    const elem = elementOf(name, resn, column);
    atoms.push({ nr: atoms.length + 1, name, resn, resi, elem, drawn: elem !== null && elem !== 'virtual' });
  };
  if (format === 'gro') {
    const n = parseInt(lines[1], 10) || 0;
    for (let i = 0; i < n && 2 + i < lines.length; i++) {
      const l = lines[2 + i];
      add(l.slice(10, 15).trim(), l.slice(5, 10).trim(), parseInt(l.slice(0, 5), 10));
    }
  } else {
    for (const l of lines) {
      if (l.startsWith('ENDMDL')) break;
      if (!/^(ATOM  |HETATM)/.test(l)) continue;
      const p = l.padEnd(80);
      add(p.slice(12, 16).trim(), p.slice(17, 20).trim(), parseInt(p.slice(22, 26), 10), p.slice(76, 78));
    }
  }
  return atoms;
}

export const drawnNumbers = (atoms: Atom[]) => atoms.filter(a => a.drawn).map(a => a.nr);
