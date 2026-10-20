// Every atom of a structure file with its GROMACS number (its 1-based position), and whether the Matrix'
// toPdb draws it (T14), from the core's one structure model (R5b): toPdb's lines, decided by the same elementOf. The k-th drawn atom is
// the k-th atom 3Dmol holds when it loads toPdb's text with keepH, so drawnNumbers(atoms)[k] is its number.

import { parseStructure, type Struct } from '../core/index';

export interface Atom { nr: number; name: string; resn: string; resi: number; elem: string | null; drawn: boolean }

/** The picker's table of a structure (the core's model, R5b): drawn where toPdb keeps the atom. */
export const atomsOf = (s: Struct): Atom[] => s.nr.map((nr, i) => ({ nr, name: s.name[i], resn: s.resn[i], resi: s.resnr[i], elem: s.el[i], drawn: s.el[i] !== null && s.el[i] !== 'virtual' }));
export const atomTable = (text: string, format: 'gro' | 'pdb'): Atom[] => atomsOf(parseStructure(text, format));

export const drawnNumbers = (atoms: Atom[]) => atoms.filter(a => a.drawn).map(a => a.nr);
