// Reading structure files (.pdb / .gro) for display: format, atom count, title,
// and turning picked or dropped files into structures of a row.

import { addStructure } from './seq';
import { newFileId, readLocal } from './storage/files';
import type { Upload } from './storage/plan';
import type { StructMeta, Store } from './types';

/**
 * Adds .pdb / .gro files to a row as structures, keeping each original unchanged.
 * Identical content (in the project, its trash, or earlier in `files`) is only
 * added if `confirm` says so. Used by the structure panel and by drops on a cell.
 */
export async function addStructureFiles(store: Store, rowId: string, files: File[], o: { findSame: (sha: string) => Promise<string | null>; confirm: (msg: string) => boolean }) {
  let next = store;
  const uploads = new Map<string, Upload>(), added: StructMeta[] = [], bad: string[] = [], seen = new Map<string, string>();
  for (const file of files) {
    const { text, sha256 } = await readLocal(file);
    const format = structFormat(file.name, text);
    if (!format) { bad.push(file.name); continue; }
    const same = seen.has(sha256) ? 'Identical to ' + seen.get(sha256) + ' in this drop' : await o.findSame(sha256);
    if (same && !o.confirm(same + '. Add ' + file.name + ' anyway?')) continue;
    seen.set(sha256, file.name);
    const fileId = newFileId();
    const meta: StructMeta = {
      id: 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: file.name, format, added: new Date().toISOString().slice(0, 10), size: file.size, atoms: countAtoms(format, text), note: structTitle(format, text), fileId,
    };
    uploads.set(fileId, { blob: file, name: file.name, sha256 });
    next = addStructure(next, rowId, meta);
    added.push(meta);
  }
  return { store: next, uploads, added, bad };
}

export function structFormat(name: string, text: string): 'pdb' | 'gro' | null {
  const ext = /\.(pdb|ent|gro)$/i.exec(name);
  if (ext) return ext[1].toLowerCase() === 'gro' ? 'gro' : 'pdb';
  if (/^(ATOM  |HETATM|HEADER|CRYST1|MODEL )/m.test(text)) return 'pdb';
  const lines = text.split(/\r?\n/);
  return lines.length > 3 && /^\s*\d+\s*$/.test(lines[1]) ? 'gro' : null;
}

export function countAtoms(format: 'pdb' | 'gro', text: string): number {
  if (format === 'gro') { const n = parseInt(text.split(/\r?\n/)[1], 10); return isFinite(n) ? n : 0; }
  let n = 0, i = 0;
  // Only the first model counts; multi-model files repeat every atom.
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('ENDMDL') && i++ === 0) break;
    if (l.startsWith('ATOM  ') || l.startsWith('HETATM')) n++;
  }
  return n;
}

/** First title line: gro line 1, or the pdb TITLE/HEADER/COMPND records. */
export function structTitle(format: 'pdb' | 'gro', text: string): string {
  const lines = text.split(/\r?\n/);
  if (format === 'gro') return (lines[0] || '').trim();
  const t = lines.filter(l => /^(TITLE|COMPND|HEADER)/.test(l)).map(l => l.slice(10).trim()).filter(Boolean);
  return t[0] || '';
}

export function fmtBytes(n: number): string {
  return n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(0) + ' kB' : (n / 1048576).toFixed(1) + ' MB';
}

// --- elements and the text 3Dmol reads (R1a) ------------------------------------
// 3Dmol guesses an element from the atom name when a .pdb has no usable element column,
// and always for a .gro: "2HB" becomes the unknown element "2" (pink, bonded to everything
// nearby) and arginine's "NE" becomes neon. So every atom's element is decided here, and
// 3Dmol gets a PDB text with the element column filled, for both formats (F49, F50).

/** The chain water and ions are moved to, so one selection hides them; no real file uses it (a .pdb may use W for protein). */
export const SOLVENT_CHAIN = '~';
// Every element symbol, for the .pdb element column.
const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe '
  + 'Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' '));
// Elements a first letter of an atom name may stand for (no boron: a "B…" name is a coarse-grained bead, not boron).
const NAME_ELEMENTS = new Set(['H', 'C', 'N', 'O', 'S', 'P', 'F', 'K', 'I']);
const WATER = new Set(['SOL', 'WAT', 'HOH', 'TIP3', 'TIP4', 'TIP5', 'SPC', 'SPCE', 'T3P', 'T4P', 'T5P']);
const IONS: Record<string, string> = { NA: 'Na', SOD: 'Na', 'NA+': 'Na', CL: 'Cl', CLA: 'Cl', 'CL-': 'Cl', K: 'K', POT: 'K', 'K+': 'K', CA: 'Ca', CAL: 'Ca', MG: 'Mg', ZN: 'Zn',
  LI: 'Li', RB: 'Rb', CS: 'Cs', BA: 'Ba', SR: 'Sr', MN: 'Mn', FE: 'Fe', CO: 'Co', NI: 'Ni', CU: 'Cu', CD: 'Cd', HG: 'Hg' };
const PROTEIN = new Set(['ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE', 'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL']);
const GMX_RESIDUES: Record<string, string> = { HISE: 'HIS', HISD: 'HIS', HISH: 'HIS', HIE: 'HIS', HID: 'HIS', HIP: 'HIS', LYN: 'LYS', ASH: 'ASP', GLH: 'GLU', CYX: 'CYS', CYM: 'CYS' };

/** The residue name 3Dmol knows: GROMACS protonation states and AMBER termini (NALA, CALA) mapped. */
export function residueName(resn: string): string {
  const r = resn.toUpperCase();
  return GMX_RESIDUES[r] || (r.length === 4 && /^[NC]/.test(r) && PROTEIN.has(r.slice(1)) ? r.slice(1) : r);
}

/**
 * An atom's element: the .pdb element column if it holds one (a lone "0" is an O); else from the
 * name — water O…/H… (other water sites are 'virtual'), ions, leading digits stripped, then the
 * first letter (Cl, Br, Fe, Zn, Mg outside proteins). null = undecided: not drawn, reported.
 */
export function elementOf(name: string, resn: string, column = ''): string | 'virtual' | null {
  const c = column.trim();
  if (c) {
    const e = c[0].toUpperCase() + c.slice(1).toLowerCase();
    if (ELEMENTS.has(e)) return e;
    if (c === '0') return 'O';
  }
  const r = resn.toUpperCase(), n = name.toUpperCase();
  if (WATER.has(r)) return n[0] === 'O' ? 'O' : n[0] === 'H' ? 'H' : 'virtual';
  if (IONS[r] && (n === r || IONS[n])) return IONS[n] || IONS[r];
  const s = n.replace(/^\d+/, '');
  if (!s) return null;
  if (!PROTEIN.has(residueName(r)) && /^(CL|BR|FE|ZN|MG)/.test(s)) return s[0] + s[1].toLowerCase();
  return NAME_ELEMENTS.has(s[0]) ? s[0] : null;
}

/**
 * One PDB text (first model only) with every element decided, for both formats: ATOM for protein
 * residues, HETATM for the rest, residue names mapped, .gro coordinates in Å. Undecided atoms are
 * left out and named in `unknown`; virtual sites are left out silently.
 */
export function toPdb(text: string, format: 'pdb' | 'gro'): { pdb: string; unknown: string[]; info: StructInfo } {
  const out: string[] = [], unknown: string[] = [], seen = new Set<string>();
  const info: StructInfo = { atoms: 0, protein: 0, other: 0, water: 0, ions: 0 };
  const atom = (rec: string, resn: string, name: string, col: string, rest: (rn: string, e: string, chain: string) => string, resi = '') => {
    const e = elementOf(name, resn, col), rn = residueName(resn);
    if (e === 'virtual') return;
    if (!e) { unknown.push(resn + ' ' + name); return; }
    info.atoms++;
    if (!seen.has(resi + rn)) { seen.add(resi + rn); info[PROTEIN.has(rn) ? 'protein' : WATER.has(rn) ? 'water' : IONS[rn] ? 'ions' : 'other']++; }
    // Water and ions go to their own chain, so one selection can hide them.
    out.push((rec === 'HETATM' || !PROTEIN.has(rn) ? 'HETATM' : 'ATOM  ') + rest(rn.slice(0, 3).padStart(3), e.padStart(2), WATER.has(rn) || IONS[rn] ? SOLVENT_CHAIN : ''));
  };
  const lines = text.split(/\r?\n/);
  if (format === 'gro') {
    const n = parseInt(lines[1], 10) || 0;
    for (let i = 0; i < n && 2 + i < lines.length; i++) {
      const l = lines[2 + i], name = l.slice(10, 15).trim(), xyz = [20, 28, 36].map(k => (10 * parseFloat(l.slice(k, k + 8))).toFixed(3).padStart(8)).join('');
      const nm = (name.length < 4 ? ' ' + name : name).padEnd(4).slice(0, 4);
      atom('ATOM  ', l.slice(5, 10).trim(), name, '', (rn, e, ch) => String((i + 1) % 100000).padStart(5) + ' ' + nm + ' ' + rn + ' ' + (ch || 'A') + String(parseInt(l.slice(0, 5), 10) % 10000).padStart(4) + '    ' + xyz + '  1.00  0.00          ' + e, l.slice(0, 5));
    }
  } else {
    for (const l of lines) {
      if (l.startsWith('ENDMDL')) break;
      if (!/^(ATOM  |HETATM)/.test(l)) { if (!l.startsWith('MODEL')) out.push(l); continue; }
      const p = l.padEnd(80);
      atom(l.slice(0, 6), p.slice(17, 20).trim(), p.slice(12, 16).trim(), p.slice(76, 78), (rn, e, ch) => p.slice(6, 17) + rn + p[20] + (ch || p[21]) + p.slice(22, 76) + e + p.slice(78).trimEnd(), p.slice(21, 27));
    }
  }
  return { pdb: out.join('\n') + '\nEND\n', unknown, info };
}

/** What a structure contains: atoms drawn, and residues by kind. */
export interface StructInfo { atoms: number; protein: number; other: number; water: number; ions: number }
export type Look = 'cartoon' | 'stick' | 'sphere' | 'line';

/**
 * The 3Dmol styles for a look, applied in order (the last match wins), and a note when the look
 * can't be drawn as asked. Cartoon draws the protein as a ribbon with thin side-chain sticks and
 * every other residue (HETATM, as toPdb writes them) as sticks; without a backbone it shows sticks.
 */
export function structStyle(info: StructInfo, look: Look, solvent = true): { styles: [object, Record<string, unknown>][]; note: string } {
  if (!info.atoms) return { styles: [], note: 'no atoms in this file' };
  const stick = (radius: number) => ({ stick: { radius } });
  // Hidden water and ions: an empty style on their chain (toPdb puts them there).
  const hide: [object, Record<string, unknown>][] = !solvent && info.water + info.ions ? [[{ chain: SOLVENT_CHAIN }, {}]] : [];
  // Sticks draw nothing for an atom without bonds (an ion, a water O without its hydrogens): small spheres.
  const lone: [object, Record<string, unknown>][] = look === 'sphere' ? [] : [[{ bonds: 0 }, { sphere: { scale: 0.3 } }]];
  if (look === 'cartoon') {
    if (info.protein < 2) return { styles: [[{}, stick(0.16)], ...lone, ...hide], note: 'no protein backbone — shown as sticks' };
    const ribbon = { cartoon: { color: 'spectrum' } };
    return { styles: [[{}, ribbon], [{ hetflag: true }, stick(0.16)], [{ hetflag: false, not: { atom: ['N', 'C', 'O'] } }, { ...ribbon, ...stick(0.1) }], ...lone, ...hide], note: '' };
  }
  // WebGL draws lines 1 px wide, so "lines" are thin sticks (F55).
  return { styles: [[{}, look === 'stick' ? stick(0.16) : look === 'sphere' ? { sphere: { scale: 0.9 } } : stick(0.06)], ...lone, ...hide], note: '' };
}

/** The look a structure opens in (cartoon only for proteins of 30+ residues), and whether water and ions show (not in large solvated systems). */
export function defaultView(info: StructInfo): { look: Look; solvent: boolean } {
  return { look: info.protein >= 30 ? 'cartoon' : 'stick', solvent: !(info.atoms > 800 && info.water > 0) };
}
