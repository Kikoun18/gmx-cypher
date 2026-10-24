// Ramps for ordered curves (R7a): the role layer's ramp-0…3 interpolated in OKLCH; AWH frames in time order, WHAM's
// windows in their order along ξ.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { grey } from '../../matrix/src/lib/export';
import { contrast, toOklch } from '../../matrix/src/lib/shade';
import { ramp, rampColors } from '../src/core/ramp';
import { themeTokens } from '../src/core/tokens';
import { awhFrames } from '../src/lib/awh';
import { parseHistograms, windowsInOrder } from '../src/lib/wham';
import { RUNNER } from './helpers';

const T = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'));
const stops = (t: Record<string, string>) => [0, 1, 2, 3].map(i => t['ramp-' + i]);

describe('ramp(n): monotonic in lightness, at least 3:1 on every ground, for n from 2 to 50', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(theme, () => {
      const t = T[theme], grounds = [t.background, t.card];
      for (let n = 2; n <= 50; n++) {
        const c = ramp(stops(t), n), L = c.map(x => toOklch(x).L);
        expect(c).toHaveLength(n);
        expect([c[0], c[n - 1]]).toEqual([stops(t)[0], stops(t)[3]]);
        // Light: darker along the ramp; dark: lighter. Each step moves the same way.
        L.slice(1).forEach((l, i) => (theme === 'light' ? expect(l).toBeLessThan(L[i]) : expect(l).toBeGreaterThan(L[i])));
        for (const x of c) for (const g of grounds) expect(contrast(x, g), n + ': ' + x + ' on ' + g).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('print: even greys from the first stop\'s grey to the last\'s, each darker, at least 3:1 on white', () => {
    // The light stops' own greys bunch up at the dark end (#2f2f2f, #282828): greyed one by one they would not stay ordered.
    expect(stops(T.light).map(grey)).toEqual(['#747474', '#4d4d4d', '#2f2f2f', '#282828']);
    for (let n = 2; n <= 50; n++) {
      const g = rampColors(n, T).map(c => c.print), Y = g.map(x => parseInt(x.slice(1, 3), 16));
      expect([g[0], g[n - 1]]).toEqual(['#747474', '#282828']);
      Y.slice(1).forEach((y, i) => expect(y).toBeLessThan(Y[i]));
      for (const x of g) expect(contrast(x, '#ffffff')).toBeGreaterThanOrEqual(3);
    }
  });

  it('one curve takes the first stop; every theme comes together', () => {
    expect(ramp(stops(T.light), 1)).toEqual([stops(T.light)[0]]);
    expect(rampColors(3, T).map(c => [c.light, c.dark])).toEqual(ramp(stops(T.light), 3).map((light, i) => [light, ramp(stops(T.dark), 3)[i]]));
  });
});

describe('the order of ordered curves', () => {
  it("WHAM: the windows in their order along ξ, by where each histogram peaks, not in column order (your 21-window fixture)", () => {
    const h = parseHistograms(readFileSync(RUNNER + '../matrix/test/fixtures/gmx/hist_500000.xvg', 'utf8'));
    const w = windowsInOrder(h);
    expect(w.map(x => x.window)).toEqual([1, 12, 14, 15, 16, 17, 18, 19, 20, 21, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]);
    expect(w[1].y).toEqual(h.windows[11]);
    expect(w.every(x => x.x === h.x)).toBe(true);
  });

  it('AWH: the frames in time order (t = 2 before t = 10), whatever order the files come in', () => {
    const names = ['awh_t10.xvg', 'awh_t2.xvg', 'awh_t0.xvg', 'awh_t20.xvg', 'awh_t4.5.xvg'];
    expect(awhFrames('awh', names).map(f => f.time)).toEqual([0, 2, 4.5, 10, 20]);
  });
});
