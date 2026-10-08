// Builds test/fixtures/legacy-dump.json: what the prototype kept in browser storage,
// in the "legacy dump" format of the Phase 0 console snippet (decision D43).
//
//   npx vite-node scripts/make-legacy-fixture.ts
//
// The values are shaped exactly as the prototype stored them: runs keep parsed x/y
// (4 decimals), analyses keep curves (6 significant digits) — no original files —
// and structure text lives in IndexedDB. It covers the multi-project index, a
// project store the index doesn't list, the old single-curve analysis format, a
// structure whose file is gone, unicode names, notes, literature, visibility,
// pages, custom columns, project settings and browser-wide preferences.

import { readFileSync, writeFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import type { Curve, Run, Slot, Store } from '../src/lib/types';
import { countAtoms, structTitle } from '../src/lib/structFile';

const fx = (n: string) => readFileSync(new URL('../test/fixtures/' + n, import.meta.url), 'utf8');
const xvg = fx('hmrfast6_ha_a_t200000.xvg');
const table = lib.parseTable(xvg);
const pmf = lib.runFromTable(table, 1, 2);
const shifted = { x: pmf.x, y: pmf.y.map(v => +(v * 1.08 - 0.12).toFixed(4)) };

const rdfText = ['@    title "Radial distribution"', '@ s0 legend "Na-O"', '@ s1 legend "Cl-N"',
  ...Array.from({ length: 60 }, (_, i) => { const r = i * 0.02; return r.toFixed(3) + ' ' + (1 + Math.exp(-(((r - 0.3) / 0.05) ** 2))).toFixed(5) + ' ' + (1 + 0.5 * Math.exp(-(((r - 0.35) / 0.06) ** 2))).toFixed(5); })].join('\n') + '\n';
const rdfTable = lib.parseTable(rdfText);
const rdfType = lib.DEFAULT_ANALYSES.find(t => t.k === 'rdf')!;
const rdfCurves: Curve[] = lib.pickCurves(rdfTable, rdfTable.head, { ...rdfType, yCols: 'all' }, 'rdf_ha_a.xvg').map((c, i) => ({ ...c, id: 'c0rdf' + i }));
rdfCurves[1] = { ...rdfCurves[1], label: 'Cl–N (renamed)', custom: true };

// The prototype stored per-run `methods` ({ key: boolean }), not tags, so runs are built in that shape.
const run = (id: string, sacch: string, slot: Slot, file: string, xy: { x: number[]; y: number[] }, extra: object = {}): Run => ({
  id, sacch, run: slot, time: '200000', temp: 310.15, methods: { hmr: true, fast: true, prosecco75: false, add: true }, file, added: '2026-09-14', x: xy.x, y: xy.y, ...extra,
}) as unknown as Run;

const sugar: Store = {
  cols: [
    ...lib.getCols(null),
    { k: 'cs', label: 'CS', short: 'Chondroitin sulfate', name: 'Chondroitin sulfate', light: '#7a4fb5', dark: '#b79be0' },
  ],
  seqs: [
    {
      id: 'smf2k81q0a', group: 'hmrfast6', name: 'WRWYCR', seq: 'WRWYCR', desc: 'Aromatic hexapeptide; strong HA binder in the screen.',
      runs: [
        run('rmf2k81q1b', 'ha', 'a', 'hmrfast6_ha_a_t200000.xvg', pmf),
        run('rmf2k81q2c', 'ha', 'b', 'hmrfast6_ha_b_t200000.xvg', shifted),
        run('rmf2k81q3d', 'o26', 'a', 'hmrfast6_o26_a_t200000.xvg', shifted),
      ],
      extras: [
        { id: 'xmf2k81q4e', type: 'rdf', sacch: 'ha', run: 'a', time: '200000', file: 'rdf_ha_a.xvg', added: '2026-09-15', curves: rdfCurves },
      ],
      structures: [
        { id: 'stmf2k81q5f', name: 'test.pdb', format: 'pdb', added: '2026-09-16', size: Buffer.byteLength(fx('test.pdb')), atoms: countAtoms('pdb', fx('test.pdb')), note: structTitle('pdb', fx('test.pdb')) },
        { id: 'stmf2k81q6g', name: 'WTA.gro', format: 'gro', added: '2026-09-16', size: Buffer.byteLength(fx('WTA.gro')), atoms: countAtoms('gro', fx('WTA.gro')), note: structTitle('gro', fx('WTA.gro')) },
      ],
    },
    {
      id: 'smf2k81q7h', group: 'prosecco75', name: 'KLVFFA', seq: 'KLVFFA', desc: '',
      runs: [run('rmf2k81q8i', 'pg', 'a', 'prosecco75_pg_a_t150000.xvg', pmf, { methods: { prosecco75: true, add: true }, temp: 300 })],
      // Older analysis format: one shared x and a `ys` list (normalised on load by the prototype too).
      extras: [{ id: 'xmf2k81q9j', type: 'histogram', sacch: 'pg', run: 'a', time: '', file: 'hist_pg_a.xvg', added: '2026-09-10', x: [0.1, 0.2, 0.3, 0.4], ys: [[3, 9, 12, 4]], legends: ['coord 1'] } as never],
      structures: [{ id: 'stmf2k81qak', name: 'lost-model.pdb', format: 'pdb', added: '2026-09-11', size: 1234, atoms: 80, note: 'file was deleted from IndexedDB' }],
    },
    {
      id: 'smf2k81qbl', group: '', name: 'Kryštof / α-L-Rha: test', seq: '', desc: 'Unicode, slashes and colons in the name.',
      runs: [run('rmf2k81qcm', 'cs', 'a', 'cs run (1).xvg', pmf)],
      extras: [], structures: [],
    },
  ],
  notes: {
    row: { smf2k81q0a: '# WRWYCR\n\nBinds **HA** best; check the *O26* well again.\n' },
    cell: { ha_smf2k81q0a: 'Run b looks shifted — temperature?\n\n- re-run at 310 K\n- compare with PG', 'cs_smf2k81qbl': 'Ünïcödé note — “quotes”, emoji 🙂' },
  },
  vis: { 'smf2k81q0a|ha|b': 'dim', 'smf2k81q0a|o26|a': 'off' },
  lit: {
    ha_smf2k81q0a: [{ id: 'lmf2k81qdn', title: 'Structure of the regulatory hyaluronan binding domain in the inflammatory leukocyte homing receptor CD44', authors: 'Teriete P, Banerji S, Noble M, et al.', year: '2004', venue: 'Mol Cell', doi: '10.1016/j.molcel.2004.03.010', url: '', note: 'HA–CD44 reference', added: '2026-09-17' }],
  },
  pages: [
    { id: 'pgmf2k81qeo', name: 'Aromatic set', desc: 'Rows with aromatic residues.', rows: ['smf2k81q0a', 'smf2k81qbl'], cols: null },
    { id: 'pgmf2k81qfp', name: 'HA only', desc: '', rows: ['smf2k81q0a'], cols: ['ha'] },
  ],
  settings: {
    pattern: '{method}_{column}_{run}_t{time}.xvg', temp: '310.15', hiddenOut: true, rowAll: true,
    analyses: [...lib.DEFAULT_ANALYSES, { k: 'sasa', label: 'SASA', name: 'Solvent accessible surface', xLabel: 'time (ns)', yLabel: 'SASA (nm²)', xCol: 1, yCols: '2', xScale: 0.001, style: 'line', match: 'sasa' }],
  },
};

const ions: Store = {
  cols: lib.getCols(null),
  seqs: [{ id: 'smf3a00a1a', group: 'charmm', name: 'Na+ / Cl-', seq: '', desc: '', runs: [run('rmf3a00a2b', 'o26', 'a', 'nacl_o26.xvg', pmf)], extras: [], structures: [] }],
  notes: { row: {}, cell: {} }, vis: {}, lit: {},
  pages: [],
};

const orphan: Store = {
  cols: lib.getCols(null),
  seqs: [{ id: 'smf4b00a1a', group: '', name: 'Half-deleted', seq: 'GGG', desc: '', runs: [run('rmf4b00a2b', 'pg', 'a', 'ggg_pg.xvg', pmf)], extras: [], structures: [] }],
  notes: { row: { smf4b00a1a: 'Left behind by an interrupted project delete.' }, cell: {} }, vis: {}, lit: {}, pages: [],
};

const dump = {
  format: 'pmf-legacy-dump', version: 1, origin: 'http://localhost:8000', dumped: '2026-10-02T18:20:00.000Z',
  localStorage: {
    'pmf-seq-settings-v1': JSON.stringify({ dark: true, laserKey: 'l', laserMode: 'hold', laserColor: '#00c853', laserSize: 'l', laserTrail: false, pattern: '{column}_{run}.xvg' }),
    'pmf-seq-projects-v1': JSON.stringify({
      active: 'pmf2k81000', list: [
        { id: 'pmf2k81000', name: 'Sugar PMFs', desc: 'Peptide × polysaccharide screen', key: 'pmf-seq-store-v1', created: '2026-09-01T09:00:00.000Z', updated: '2026-10-02T18:00:00.000Z' },
        { id: 'pmf3a00000', name: 'Ion pairs 2027', desc: '', key: 'pmf-seq-project-pmf3a00000', created: '2026-09-20T10:00:00.000Z', updated: '2026-09-21T10:00:00.000Z' },
      ],
    }),
    'pmf-seq-store-v1': JSON.stringify(sugar),
    'pmf-seq-project-pmf3a00000': JSON.stringify(ions),
    'pmf-seq-project-pmf4b00000': JSON.stringify(orphan),
  },
  indexedDB: {
    'pmf-seq-structures': {
      files: {
        stmf2k81q5f: fx('test.pdb'),
        stmf2k81q6g: fx('WTA.gro'),
        stunreferenced: 'HEADER    NOT REFERENCED BY ANY PROJECT\n',
      },
    },
  },
};

writeFileSync(new URL('../test/fixtures/legacy-dump.json', import.meta.url), JSON.stringify(dump, null, 2) + '\n');
console.log('wrote test/fixtures/legacy-dump.json');
