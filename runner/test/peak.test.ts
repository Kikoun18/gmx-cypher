import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTable } from '../../matrix/src/lib/seq';
import { firstPeak, peaks, resultSeries } from '../src/lib/rdf';
import { FAKE_GMX, tmp } from './helpers';

const fixture = readFileSync(new URL('./fixtures/gmx-2025.4/rdf_nvt.xvg', import.meta.url), 'utf8');

describe('the first peak (T27): the highest point of the first shell where g(r) > 1', () => {
  const [water, sodium] = resultSeries(fixture);

  it('your test system: water oxygens and sodium around sulfur', () => {
    expect(firstPeak(water.points)).toEqual({ r: 0.374, g: 6.412606, rule: 'first shell' });
    // Sodium's shell has single-bin zeros (12 ions, 21 frames): dips narrower than 0.01 nm are bridged.
    expect(firstPeak(sodium.points)).toEqual({ r: 0.304, g: 36.625538, rule: 'first shell' });
  });

  it('a second, higher shell after a real minimum is not the first peak', () => {
    expect(firstPeak([[0.1, 0], [0.2, 3], [0.22, 2], [0.24, 0.5], [0.26, 0.4], [0.28, 0.3], [0.3, 0.6], [0.32, 5]])).toEqual({ r: 0.2, g: 3, rule: 'first shell' });
  });

  it('never above 1: the maximum; a flat zero curve: none', () => {
    expect(firstPeak([[0, 0], [0.1, 0.5], [0.2, 0.8], [0.3, 0.6]])).toEqual({ r: 0.2, g: 0.8, rule: 'maximum' });
    expect(firstPeak([[0, 0], [0.1, 0], [0.2, 0]])).toBeNull();
    expect(firstPeak([])).toBeNull();
  });
});

describe('the result as curves, read with the Matrix\'s parseTable', () => {
  it('the real 2025.4 file: one curve per selection, named after its group', () => {
    const s = resultSeries(fixture);
    expect(s.map(c => [c.label, c.points.length])).toEqual([['water_O', 866], ['sodium', 866]]);
    expect(s[0].points[0]).toEqual([0, 0]);
    expect(parseTable(fixture).head).toMatchObject({ xLabel: 'r (nm)', yLabel: 'g(r)' });
  });

  it("the fake gmx's output for other groups carries their names", () => {
    const dir = tmp('fake');
    writeFileSync(join(dir, 'g.ndx'), '[ S ]\n   5\n[ OW ]\n  43\n[ Na ]\n  31\n');
    const r = spawnSync(process.execPath, [FAKE_GMX, 'rdf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'g.ndx', '-o', 'out.xvg', '-ref', 'group 0', '-sel', 'group 1', 'group 2'], { cwd: dir });
    expect(r.status).toBe(0);
    expect(resultSeries(readFileSync(join(dir, 'out.xvg'), 'utf8')).map(c => c.label)).toEqual(['OW', 'Na']);
  });
});

describe('both peak rules, named (R3d, T163): the first shell and the maximum', () => {
  const [water, sodium] = resultSeries(fixture);
  const H = resultSeries(readFileSync(new URL('./fixtures/decypher/rdf_o111_Methionine_H.xvg', import.meta.url), 'utf8'));

  it('the test system: here each curve\'s first shell is also its maximum', () => {
    expect(peaks(water.points)).toEqual({ firstShell: { r: 0.374, g: 6.412606, rule: 'first shell' }, maximum: { r: 0.374, g: 6.412606, rule: 'maximum' } });
    expect(peaks(sodium.points).maximum).toEqual({ r: 0.304, g: 36.625538, rule: 'maximum' });
  });

  it('your Methionine run: the first shell comes before the maximum, for every group with a shell', () => {
    const p = peaks(H[0].points);
    expect(H[0].label).toBe('NH_N...S');
    expect([p.firstShell!.r, +p.firstShell!.g.toFixed(2), p.maximum!.r, +p.maximum!.g.toFixed(2)]).toEqual([0.45, 17.92, 0.6, 40.33]);
    for (const c of H) { const q = peaks(c.points); if (q.firstShell) expect(q.firstShell.r).toBeLessThanOrEqual(q.maximum!.r); }
  });

  it('never above 1: no first shell, only the maximum; a flat zero curve: neither', () => {
    expect(peaks([[0, 0], [0.1, 0.5], [0.2, 0.8], [0.3, 0.6]])).toEqual({ firstShell: null, maximum: { r: 0.2, g: 0.8, rule: 'maximum' } });
    expect(peaks([[0, 0], [0.1, 0]])).toEqual({ firstShell: null, maximum: null });
  });
});

