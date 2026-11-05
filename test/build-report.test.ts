// SymBuilder's reports (R9), golden against the notebook's saved text: the build summary of its 42 systems, a pull
// report, a walker report, and the termini check of 16 systems with its two proline mismatches.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { molSections, pullReport, summaryText, termini, TERMINI_HEAD, terminiFooter, terminiRow, timedelta, walkerReport, type Atom, type SummaryRow, type SummaryStatus } from '../src/lib/build/report';

const real = (n: string) => readFileSync(new URL('./fixtures/build/notebook/' + n, import.meta.url), 'utf8');

describe('the build summary (build_summary)', () => {
  it('the notebook\'s 42 systems, written again from their values, are its text to the character', () => {
    const text = real('build-summary.txt'), lines = text.split('\n'), rows: SummaryRow[] = [];
    const sec = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
    for (const l of lines.slice(6)) {
      if (/^hmr/.test(l)) {
        const cut = (a: number, b: number) => l.slice(a, b).trim(), ions = cut(40, 47), steps = l.slice(75).trim().split(' ');
        rows.push({ name: cut(0, 30), charge: cut(32, 38) ? Number(cut(32, 38)) : null, ions: ions ? ions.split('/').map(Number) as [number, number] : null, min: cut(49, 54) ? Number(cut(49, 54)) : null,
          elapsed: sec(cut(56, 64)), status: cut(66, 73) as SummaryStatus, warn: steps.length > 1 ? steps.flatMap((k, i) => (i % 2 ? [] : [[k, Number(steps[i + 1])] as [string, number]])) : [], note: '' });
      } else if (l.startsWith(' '.repeat(30) + '  ! ')) rows[rows.length - 1].note = l.slice(34);
      else if (rows.length && rows[rows.length - 1].note && !l.startsWith('═')) rows[rows.length - 1].note += '\n' + l;
    }
    expect(rows).toHaveLength(42);
    expect(rows.find(r => r.status === 'FAILED')!.note).toMatch(/^AWH: RuntimeError: GROMACS fatal error\nFatal error:\nDistance between pull groups/);
    expect(summaryText(rows, '2026-09-25 22:00', '2025.4-PLUMED_spack')).toBe(text);
  });
  it('time as Python prints a timedelta', () => {
    expect([timedelta(0), timedelta(123), timedelta(3600 * 25 + 61)]).toEqual(['0:00:00', '0:02:03', '1 day, 1:01:01']);
  });
});

describe('the pull and walker reports', () => {
  it('pull_report: the charge after npt, the shortest and longest distance', () => {
    expect(pullReport([{ name: 'hmr+fast+6/pg/mmmmmmmm', charge: 0, min: 0.67, max: 3.27 }, { name: 'hmr+fast+6r/pg/mmmmmmmm', charge: 0, min: 0.74, max: 3.27 }])).toBe(real('pull-report.txt'));
    expect(pullReport([{ name: 'x', charge: null, min: null, max: null }]).split('\n')[1]).toBe('x'.padEnd(34) + '        -       -       -');
  });
  it('walker_report: x output, o run input ready, - neither; the missing ones', () => {
    expect(walkerReport([{ name: 'hmr+fast+6/pg/mmmmmmmm', marks: Array(8).fill('-') }, { name: 'hmr+fast+6r/pg/mmmmmmmm', marks: Array(8).fill('-') }], 8)).toBe(real('walker-report.txt'));
    expect(walkerReport([{ name: 'a', marks: ['x', 'x', 'o', 'o', 'o', 'o', 'o', '-'] }, { name: 'b', marks: Array(8).fill('o') }], 8).split('\n').slice(1, 3).map(l => l.slice(34)))
      .toEqual(['  xxooooo-  8', '  oooooooo  -']);
  });
});

describe('the termini (check_termini)', () => {
  it('the notebook\'s 16 lines and its footer, the prolines\' PRO-NH2+ flagged', () => {
    const lines = real('termini.txt').trimEnd().split('\n');
    expect(TERMINI_HEAD).toBe(lines[0]);
    const odd: string[] = [];
    for (const l of lines.slice(1, -2)) {
      const f = l.split(/\s+/), name = f[0];
      const row = terminiRow(name, f[1], f[3], { n: f[2], c: f[4], q1: Number(f[5]), qN: Number(f[6]) }, f[7] === '-0.000' ? -1e-16 : Number(f[7]));
      expect(row.line).toBe(l);
      if (row.odd) odd.push(name);
    }
    expect(terminiFooter(odd)).toBe(lines.at(-1));
  });
  // A constructed molecule (no real topology of yours here, sample 3): N with three H, C with two O, and a proline.
  const atom = (nr: number, res: number, resname: string, a: string, q = 0): Atom => ({ nr, res, resname, atom: a, q });
  it('termini by the hydrogens on N and the oxygens on C', () => {
    const atoms = [atom(1, 1, 'MET', 'N', -0.3), atom(2, 1, 'MET', 'HT1', 0.33), atom(3, 1, 'MET', 'HT2', 0.33), atom(4, 1, 'MET', 'HT3', 0.33), atom(5, 2, 'MET', 'C', 0.34), atom(6, 2, 'MET', 'OT1', -0.67), atom(7, 2, 'MET', 'OT2', -0.67)];
    expect(termini(atoms, [[1, 2], [1, 3], [1, 4], [5, 6], [5, 7]])).toMatchObject({ n: 'NH3+', c: 'COO-' });
    const pro = [atom(1, 1, 'PRO', 'N'), atom(2, 1, 'PRO', 'HN1'), atom(3, 1, 'PRO', 'HN2'), atom(4, 2, 'PRO', 'C'), atom(5, 2, 'PRO', 'OT1'), atom(6, 2, 'PRO', 'OT2'), atom(7, 2, 'PRO', 'HT2')];
    expect(termini(pro, [[1, 2], [1, 3], [4, 5], [4, 6], [6, 7]])).toMatchObject({ n: 'PRO-NH2+', c: 'COOH' });
  });
  it('the Protein moleculetype, found through the topology\'s includes', () => {
    const top = '#include "../../../../ff/x.ff/forcefield.itp"\n#include "Protein.itp"\n[ molecules ]\nProtein 1\n';
    const itp = '[ moleculetype ]\nProtein 3\n[ atoms ]\n1 NH3 1 MET N 1 -0.30 14.007\n2 HC 1 MET HT1 2 0.33 1.008\n[ bonds ]\n1 2\n';
    expect(molSections(top, n => (n === 'Protein.itp' ? itp : null))).toEqual({ atoms: [{ nr: 1, res: 1, resname: 'MET', atom: 'N', q: -0.3 }, { nr: 2, res: 1, resname: 'MET', atom: 'HT1', q: 0.33 }], bonds: [[1, 2]] });
  });
});
