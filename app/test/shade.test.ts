import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/lib/seq';
import { contrast, curveShade, graphShades, nextShade, SHADE_BG, SHADE_STEPS, toOklch } from '../src/lib/shade';

// Backgrounds: the light and dark themes (--bg) and the png/pdf exports.
const BGS = [['light', '#f3f2f2'], ['dark', '#141312'], ['export', '#ffffff']] as const;
const baseFor = (p: { light: string; dark: string }, bg: string) => (bg === '#141312' ? p.dark : p.light);
const hue = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return [r, g, b]; };
const isGrey = (h: string) => { const [r, g, b] = hue(h); return Math.max(r, g, b) - Math.min(r, g, b) <= 2; };

describe('curveShade (R4a)', () => {
  it.each(BGS)('1 to 10 curves give distinct hex shades with ≥ 3:1 contrast, every column colour (%s)', (_, bg) => {
    for (const p of PALETTE) for (let n = 1; n <= 10; n++) {
      const out = Array.from({ length: n }, (_, i) => curveShade(baseFor(p, bg), bg, i, n));
      for (const h of out) expect(h).toMatch(/^#[0-9a-f]{6}$/);
      expect(new Set(out).size).toBe(n);
      for (const h of out) expect(contrast(h, bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it('one curve keeps the column colour', () => {
    for (const p of PALETTE) for (const [, bg] of BGS) expect(curveShade(baseFor(p, bg), bg, 0, 1)).toBe(baseFor(p, bg));
  });
  it.each(BGS)('adjustments move the shade and are clamped to ≥ 3:1 (%s)', (_, bg) => {
    for (const p of PALETTE) for (let i = 0; i < 10; i++) {
      const at = (a: number) => curveShade(baseFor(p, bg), bg, i, 10, a);
      for (const a of [-99, -3, -1, 1, 3, 99]) expect(contrast(at(a), bg)).toBeGreaterThanOrEqual(3);
      expect(at(99)).toBe(at(SHADE_STEPS));
      expect(at(-99)).toBe(at(-SHADE_STEPS));
    }
    expect(curveShade('#1a5fb4', bg, 0, 1, 1)).not.toBe(curveShade('#1a5fb4', bg, 0, 1, 0));
  });
  it.each(BGS)('black and white gives distinct greys with ≥ 3:1 contrast (%s)', (_, bg) => {
    for (let n = 1; n <= 10; n++) {
      const out = Array.from({ length: n }, (_, i) => curveShade('#1a5fb4', bg, i, n, 0, true));
      expect(out.every(isGrey)).toBe(true);
      expect(new Set(out).size).toBe(n);
      for (const h of out) expect(contrast(h, bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it('is deterministic, and the first shade is the strongest for print', () => {
    expect(curveShade('#c62410', '#ffffff', 3, 6, -1)).toBe(curveShade('#c62410', '#ffffff', 3, 6, -1));
    const g = Array.from({ length: 4 }, (_, i) => contrast(curveShade('#000000', '#ffffff', i, 4, 0, true), '#ffffff'));
    expect(g[0]).toBe(Math.max(...g));
  });
  it('an unreadable column colour falls back to greys rather than failing', () => {
    expect(isGrey(curveShade('red', '#ffffff', 0, 1))).toBe(true);
  });
});

describe('graphShades (R4b)', () => {
  const [ha, pg, o26] = [PALETTE[1], PALETTE[2], PALETTE[0]];
  const groups = [{ base: ha, ids: ['a1', 'a2', 'a3'] }, { base: pg, ids: ['p1', 'p2'] }];
  const near = (h: string) => { const H = toOklch(h).H, d = (p: { light: string }) => Math.abs(Math.atan2(Math.sin(H - toOklch(p.light).H), Math.cos(H - toOklch(p.light).H))); return [ha, pg, o26].reduce((b, p) => (d(p) < d(b) ? p : b)); };
  it.each([false, true])('no curve takes another column\'s hue (dark %s), and shades work on the page and the panel', dark => {
    const m = graphShades(groups, dark, false);
    for (const id of ['a1', 'a2', 'a3']) expect(near(m.get(id)!.color)).toBe(ha);
    for (const id of ['p1', 'p2']) expect(near(m.get(id)!.color)).toBe(pg);
    for (const s of m.values()) {
      for (const bg of dark ? ['#141312', SHADE_BG.dark] : ['#f3f2f2', SHADE_BG.light]) expect(contrast(s.color, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(s.ex, SHADE_BG.export)).toBeGreaterThanOrEqual(3);
    }
  });
  it('the first curve of each column keeps the column colour; positions count within a column', () => {
    const m = graphShades(groups, false, false);
    expect([m.get('a1')!.color, m.get('p1')!.color, m.get('a1')!.ex]).toEqual([ha.light, pg.light, ha.light]);
    expect(['a1', 'a2', 'a3', 'p1', 'p2'].map(id => m.get(id)!.i)).toEqual([0, 1, 2, 0, 1]);
  });
  it('positions depend on what is present, not on what is shown, so hiding never recolours', () => {
    expect(graphShades(groups, false, false).get('a3')).toEqual(graphShades(groups, false, false).get('a3'));
    expect(graphShades(groups, false, false, id => (id === 'a2' ? 2 : 0)).get('a3')).toEqual(graphShades(groups, false, false).get('a3'));
  });
  it('black and white: greys, positions count across the whole graph so dashes tell columns apart', () => {
    const m = graphShades(groups, false, true);
    expect(['a1', 'a2', 'a3', 'p1', 'p2'].map(id => m.get(id)!.i)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set([...m.values()].map(s => s.color)).size).toBe(5);
    for (const s of m.values()) for (const h of [s.color, s.ex]) expect(toOklch(h).C).toBeLessThan(0.01);
  });
  it('the per-curve adjustment moves only that curve', () => {
    const a = graphShades(groups, false, false), b = graphShades(groups, false, false, id => (id === 'a2' ? -1 : 0));
    expect(b.get('a2')!.color).not.toBe(a.get('a2')!.color);
    expect(b.get('a2')!.ex).not.toBe(a.get('a2')!.ex);
    expect(b.get('a1')).toEqual(a.get('a1'));
  });
});

describe('black and white is a browser preference (F61)', () => {
  it('stays out of the project settings and is kept with the theme', async () => {
    const { splitSettings } = await import('../src/lib/seq');
    expect(splitSettings({ bw: true, rowAll: true })).toEqual({ project: { rowAll: true }, app: { bw: true } });
    const store = new Map<string, string>();
    Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
    const { loadPrefs, savePrefs } = await import('../src/lib/prefs');
    savePrefs({ bw: true, dark: true, rowAll: true });
    expect(loadPrefs()).toEqual({ bw: true, dark: true });
  });
});

describe('nextShade: the per-curve control (R4d)', () => {
  it.each([
    // stored, step (+1 lighter, −1 darker, 0 reset), stored after
    [undefined, 1, 1], [undefined, -1, -1], [2, 1, 3], [3, 1, 3], [-3, -1, -3], [-1, 1, undefined], [2, 0, undefined], [undefined, 0, undefined],
  ] as const)('%s %s → %s', (cur, step, want) => expect(nextShade(cur, step)).toBe(want));
  it('a stored shade outside the range draws like the nearest end', () => {
    expect(curveShade('#1a5fb4', SHADE_BG.light, 1, 3, 7)).toBe(curveShade('#1a5fb4', SHADE_BG.light, 1, 3, 3));
  });
});
