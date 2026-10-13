import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import { importAsProject } from '../src/lib/storage/exchange';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// Golden snapshots (batch 3, F-0): made once with the code at 3de24e2, never regenerated.
// See test/fixtures/golden/README.md. An intended change names its exception here.
const FX = new URL('./fixtures/', import.meta.url);
const read = (n: string) => readFileSync(new URL(n, FX), 'utf8');
const golden = (n: string) => JSON.parse(read('golden/' + n));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Intended changes to the parser golden (F112): every number stays; labels the parser now reads.
const PARSE_CHANGES: Record<string, { head?: object; detect?: object }> = {
  'gmx/hist_500000.xvg': { head: { xLabel: 'ξ (nm)' } }, // Grace's \x is the Symbol font: x is ξ
  // Recognition (F114): no match is Data (F83), and the batch-3 built-ins (F84).
  'gmx/07.md_numcont_protein_sugar.xvg': { detect: { k: 'data', from: 'generic' } },
  'examples/phosphorus.xvg': { head: { yLabel: 'Density (kg m^{-3})' }, detect: { k: 'density', from: 'header' } },
  'examples/membrane_thickness.dat': { head: { xLabel: 'radial distance from the protein center [nm]', yLabel: 'average membrane thickness [nm]' }, detect: { k: 'data', from: 'generic' } },
  'examples/translocation_free_energy.dat': { head: { xLabel: 'distance from the transmembrane state [nm]', yLabel: 'free energy difference [kJ mol^{-1}]' }, detect: { k: 'free-energy', from: 'header' } },
  'examples/order_POPE.xvg': { head: { rowLabels: [...read('examples/order_POPE.xvg').matchAll(/^# (Atom C\d+):/gm)].map(m => m[1]) }, detect: { k: 'order', from: 'header' } },
  'examples/pressure.xvg': { detect: { k: 'pressure', from: 'header' } },
  'examples/temperature.xvg': { detect: { k: 'temperature', from: 'header' } },
};

describe('golden: parser', () => {
  const want = golden('parse.json') as Record<string, { n: number; ncols: number; head: unknown; finite: number[]; first: string[]; last: string[]; cols: string; gmx: unknown; detect: unknown }>;
  it('covers every data fixture', () => {
    const files = ['hmrfast6_ha_a_t200000.xvg', ...readdirSync(new URL('gmx/', FX)).map(f => 'gmx/' + f), ...readdirSync(new URL('examples/', FX)).filter(f => /\.(xvg|dat)$/.test(f)).map(f => 'examples/' + f)];
    expect(Object.keys(want).sort()).toEqual(files.sort());
  });
  it.each(Object.keys(want))('%s parses as before', f => {
    const text = read(f), t = lib.parseTable(text), gmx = parseGmxHeader(text), w = want[f];
    expect({ n: t.n, ncols: t.cols.length, finite: t.cols.map(c => c.filter(v => isFinite(v)).length), first: t.cols.map(c => String(c[0])), last: t.cols.map(c => String(c[c.length - 1])) })
      .toEqual({ n: w.n, ncols: w.ncols, finite: w.finite, first: w.first, last: w.last });
    expect(sha(t.cols.map(c => c.map(v => String(v)).join(',')).join('\n'))).toBe(w.cols);
    const ch = PARSE_CHANGES[f] || {};
    expect(plain(t.head)).toEqual({ ...(w.head as object), ...ch.head });
    expect(plain(gmx)).toEqual(w.gmx);
    expect(lib.detectAna(lib.getAnalyses({}), f.split('/').pop()!, t.head, gmx?.tool)).toEqual({ ...(w.detect as object), ...ch.detect });
  });
});

// R2 (F118): curveStats, cellValue and maxMag take the transform; the default (entropy) must give these numbers.
const T0 = lib.ENTROPY;
const pmfOf = (s: Store) => {
  const runs: Record<string, unknown> = {}, cells: Record<string, unknown> = {};
  const skipOff = (q: { id: string }, r: { sacch: string; run: string }) => s.vis[lib.slotKey(q.id, r.sacch, r.run)] === 'off';
  for (const q of s.seqs) {
    for (const r of q.runs) {
      if (r.state === 'missing') continue;
      const st = lib.curveStats(r, T0);
      runs[q.name + '|' + r.sacch + '|' + r.run] = { temp: r.temp, n: r.x.length, min: st.min, at: st.at, area: st.area, corrected: sha(st.curve.map(String).join(',')) };
    }
    for (const c of s.cols) for (const m of ['area', 'min'] as const) {
      const all = lib.cellValue(q, c.k, m, null, T0), shown = lib.cellValue(q, c.k, m, skipOff, T0);
      if (all != null || shown != null) cells[q.name + '|' + c.k + '|' + m] = { all, shown };
    }
  }
  return { runs, cells, maxArea: lib.maxMag(s.seqs, 'area', s.cols, null, T0), maxMin: lib.maxMag(s.seqs, 'min', s.cols, null, T0) };
};

describe('golden: PMF numbers (bit for bit)', () => {
  const want = golden('pmf.json');
  it.each(['schema-1-vault', 'schema-2-vault', 'schema-3-vault'])('formats/%s', async v => {
    expect(plain(pmfOf((await reopen(await vaultFixture('formats/' + v))).svc.store))).toEqual(want['formats/' + v]);
  });
  it.each(['export-v3.json', 'export-v4.json', 'export-v5.json', 'export-v6.json'])('formats/%s', async e => {
    expect(plain(pmfOf((await importAsProject(read('formats/' + e))).store))).toEqual(want['formats/' + e]);
  });
  it.each([310.15, 300])('the PMF fixture at %s K', temp => {
    const xy = lib.runFromTable(lib.parseTable(read('hmrfast6_ha_a_t200000.xvg')), 1, 2);
    const st = lib.curveStats({ id: 'r', sacch: 'ha', run: 'a', time: '', temp, tags: [], file: '', added: '', ...xy }, T0);
    expect({ n: xy.x.length, min: st.min, at: st.at, area: st.area, corrected: sha(st.curve.map(String).join(',')) }).toEqual(want['hmrfast6_ha_a_t200000.xvg@' + temp]);
  });
  it.each(['area', 'min'] as const)('the frozen matrix export (%s) shows the same cell values', async m => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const s = svc.store, skipOff = (q: { id: string }, r: { sacch: string; run: string }) => s.vis[lib.slotKey(q.id, r.sacch, r.run)] === 'off';
    const sets = read('golden/scenes/matrix-' + m + '.xvg').split('\n').filter(l => /^\s*\d+\s+-?\d/.test(l) || l === '&').join('\n').split('&').map(b => b.trim().split('\n').filter(Boolean).map(l => l.trim().split(/\s+/)));
    const rows = ['WRWYCR', 'KRWYCR'].map(n => s.seqs.find(q => q.name === n)!);
    // One set per column, x = row index; a cell without a value (hidden runs left out) has no point.
    const shown = s.cols.map(c => rows.map((q, i) => { const v = lib.cellValue(q, c.k, m, skipOff, T0); return v == null ? null : [String(i + 1), v.toFixed(4)]; }).filter(Boolean));
    expect(sets.slice(0, s.cols.length)).toEqual(shown);
  });
});

describe('golden: markers', () => {
  const want = golden('markers.json');
  it.each(readdirSync(new URL('gmx/', FX)))('gmx/%s', f => {
    const t = lib.parseTable(read('gmx/' + f));
    const cs = lib.pickCurves(t, t.head, { ...lib.DEFAULT_ANALYSES[1], yCols: 'all' }, f);
    expect(plain(cs.map(c => Object.fromEntries(lib.SMOOTH_LEVELS.map(l => {
      const y = l.v ? lib.smoothY(c.y, l.v) : c.y;
      return [l.label, { label: c.label, max: lib.curveMark(c.x, y, 'max', 'y'), min: lib.curveMark(c.x, y, 'min', 'x') }];
    }))))).toEqual(want['gmx/' + f]);
  });
});
