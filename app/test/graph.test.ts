import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { graphScene, graphXvg, toPDF, type GraphData } from '../src/lib/export';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// G-0: the graph model is a pure function of the store and the view; it reproduces the golden
// export scenes downloaded from the app before the move (test/fixtures/golden/README.md).
const golden = (n: string) => readFileSync(new URL('./fixtures/golden/scenes/' + n, import.meta.url));
const noStamp = (s: string) => s.split('\n').slice(1).join('\n');

async function frozenStore(): Promise<Store> {
  const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
  for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id);
  return svc.store;
}

describe('buildGraph reproduces the golden scenes (G-0)', () => {
  // Named changes since the golden scenes (`was`: what the graph says now, then the golden value); with the old
  // value put back, the scene is the golden one byte for byte.
  // R1c (F82): the histogram's file says "\xx\f{} (nm)" and "count", so its graph reads ξ (nm) / count.
  // R2 (F88): the raw view says it isn't what the matrix uses.
  const scenes: [string, { row: string; mode: 'cell' | 'row'; col?: string; tab: string; corrected?: boolean; fitWell?: boolean; bw?: boolean; pdf?: boolean; was?: [Partial<GraphData>, Partial<GraphData>] }][] = [
    ['pmf-cell-WRWYCR-HA', { row: 'WRWYCR', mode: 'cell', col: 'ha', tab: 'pmf' }],
    ['pmf-cell-WRWYCR-HA-raw-own', { row: 'WRWYCR', mode: 'cell', col: 'ha', tab: 'pmf', corrected: false, fitWell: false, was: [{ note: 'raw gmx awh output — not what the matrix uses · autoscaled · shade and dash: run, then curve' }, { note: 'raw gmx awh output · autoscaled · shade and dash: run, then curve' }] }],
    ['rdf-cell-WRWYCR-HA', { row: 'WRWYCR', mode: 'cell', col: 'ha', tab: 'rdf' }],
    ['rdf-cell-WRWYCR-HA-bw', { row: 'WRWYCR', mode: 'cell', col: 'ha', tab: 'rdf', bw: true }],
    ['hist-cell-WRWYCR-HA', { row: 'WRWYCR', mode: 'cell', col: 'ha', tab: 'hist', was: [{ xLabel: 'ξ (nm)', yLabel: 'count' }, { xLabel: 'Reaction coordinate (nm)', yLabel: 'Count' }] }],
    ['dist-cell-KRWYCR-HA', { row: 'KRWYCR', mode: 'cell', col: 'ha', tab: 'dist' }],
    ['pmf-cell-KRWYCR-PG-hidden', { row: 'KRWYCR', mode: 'cell', col: 'pg', tab: 'pmf', pdf: false }],
    ['pmf-row-WRWYCR', { row: 'WRWYCR', mode: 'row', tab: 'pmf' }],
  ];
  it.each(scenes)('%s', async (name, o) => {
    const store = await frozenStore(), cols = lib.pageCols(store, null), raw = o.corrected === false;
    const st = lib.mergeSettings({ bw: !!o.bw }, store.settings), row = store.seqs.find(s => s.name === o.row)!;
    const m = buildGraph({ store, sel: { mode: o.mode, id: row.id, s: o.col || cols[0].k }, cols, st, tab: o.tab, raw, fitWell: o.fitWell ?? true, dark: false, domain: sharedDomain(store.seqs, raw ? lib.NONE : lib.ENTROPY) })!;
    if (o.was) {
      expect(m.data).toMatchObject(o.was[0]);
      Object.assign(m.data, o.was[1]);
    }
    expect(noStamp(graphXvg(m.data))).toBe(noStamp(golden(name + '.xvg').toString('utf8')));
    if (o.pdf !== false) expect(new Uint8Array(await toPDF(graphScene(m.data)).arrayBuffer())).toEqual(new Uint8Array(golden(name + '.pdf')));
  });
});
