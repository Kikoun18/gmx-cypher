// The periodic box of a structure file (R2, T95): what the file says, the cell's edges, its dimensions and how
// many atoms lie outside it. Everything here is in nm; the viewer converts to Å for the drawing.

export type Vec = [number, number, number];
export type Vectors = [Vec, Vec, Vec];
export interface Box { vectors: Vectors | null; problems: string[] }

const none = (problem: string): Box => ({ vectors: null, problems: [problem] });
const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);

/**
 * A .gro box: the last line, three numbers (rectangular) or nine (triclinic, in GROMACS's order: v1x v2y v3z v1y
 * v1z v2x v2z v3x v3y). A .pdb box: the CRYST1 line (a, b, c in Å; alpha, beta, gamma in degrees), with a along x
 * and b in the xy plane, as the PDB format defines it.
 */
export function parseBox(text: string, format: 'gro' | 'pdb'): Box {
  if (format === 'pdb') {
    const line = text.split(/\r?\n/).find(l => l.startsWith('CRYST1'));
    if (!line) return none('no CRYST1 line in this file: no box to draw');
    const num = (from: number, to: number) => Number(line.slice(from, to));
    const [a, b, c] = [num(6, 15), num(15, 24), num(24, 33)].map(x => x / 10);
    const [al, be, ga] = [num(33, 40), num(40, 47), num(47, 54)].map(x => (x * Math.PI) / 180);
    if (![a, b, c, al, be, ga].every(Number.isFinite) || a <= 0 || b <= 0 || c <= 0) return none('the CRYST1 line has no box size');
    const cosA = Math.cos(al), cosB = Math.cos(be), cosG = Math.cos(ga), sinG = Math.sin(ga);
    const cx = c * cosB, cy = (c * (cosA - cosB * cosG)) / sinG;
    const vectors: Vectors = [[a, 0, 0], [b * cosG, b * sinG, 0], [cx, cy, Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy))]];
    return { vectors: vectors.map(v => v.map(clean)) as Vectors, problems: [] };
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 3) return none('the .gro file has no box line');
  const values = lines[lines.length - 1].trim().split(/\s+/).map(Number);
  if (values.some(v => !Number.isFinite(v)) || (values.length !== 3 && values.length !== 9)) return none('the last line of the .gro is not a box (three or nine numbers, in nm)');
  if (values.every(v => v === 0)) return none('the box is all zeros: no box in this file');
  const v = values;
  const vectors: Vectors = v.length === 3
    ? [[v[0], 0, 0], [0, v[1], 0], [0, 0, v[2]]]
    : [[v[0], v[3], v[4]], [v[5], v[1], v[6]], [v[7], v[8], v[2]]];
  return { vectors: vectors.map(p => p.map(clean)) as Vectors, problems: [] };
}

const dot = (p: Vec, q: Vec) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const len = (p: Vec) => Math.hypot(...p);
const det = (a: Vec, b: Vec, c: Vec) => dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]);
const angle = (p: Vec, q: Vec) => Math.round((Math.acos(Math.max(-1, Math.min(1, dot(p, q) / (len(p) * len(q))))) * 180 / Math.PI) * 1e6) / 1e6;

/** Lengths (nm), angles (degrees) and volume (nm³) of the cell. */
export function boxDimensions(v: Vectors) {
  const [v1, v2, v3] = v;
  return { a: len(v1), b: len(v2), c: len(v3), alpha: angle(v2, v3), beta: angle(v1, v3), gamma: angle(v1, v2), volume: Math.abs(det(v1, v2, v3)) };
}

/** The twelve edges of the cell, each as its two corners. */
export function boxEdges(v: Vectors): [Vec, Vec][] {
  const corner = (i: number, j: number, k: number): Vec => [0, 1, 2].map(d => i * v[0][d] + j * v[1][d] + k * v[2][d]) as Vec;
  const edges: [Vec, Vec][] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    if (i === 0) edges.push([corner(0, j, k), corner(1, j, k)]);
    if (j === 0) edges.push([corner(i, 0, k), corner(i, 1, k)]);
    if (k === 0) edges.push([corner(i, j, 0), corner(i, j, 1)]);
  }
  return edges;
}

/** The atom positions of a .gro or .pdb text, in nm. */
export function atomCoords(text: string, format: 'gro' | 'pdb'): Vec[] {
  const lines = text.split(/\r?\n/);
  if (format === 'gro') {
    const n = parseInt(lines[1], 10) || 0;
    return lines.slice(2, 2 + n).map(l => [l.slice(20, 28), l.slice(28, 36), l.slice(36, 44)].map(Number) as Vec);
  }
  return lines.filter(l => /^(ATOM  |HETATM)/.test(l)).map(l => [l.slice(30, 38), l.slice(38, 46), l.slice(46, 54)].map(x => Number(x) / 10) as Vec);
}

/** How many atoms lie strictly outside the cell (a fractional coordinate below 0 or above 1; a point on a face is in), out of how many. */
export function outsideBox(text: string, format: 'gro' | 'pdb', v: Vectors): { count: number; total: number } {
  const coords = atomCoords(text, format), d = det(v[0], v[1], v[2]);
  const fraction = (r: Vec): Vec => [det(r, v[1], v[2]) / d, det(v[0], r, v[2]) / d, det(v[0], v[1], r) / d];
  const count = coords.filter(r => fraction(r).some(f => f < 0 || f > 1)).length;
  return { count, total: coords.length };
}
