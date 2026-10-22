// Renamed groups and reference (R11d): labels shown in place of the names, in compare and in results, in legends, the
// CSV and the exports, the original names beside them; the record, the .ndx, the .xvg never change.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kit } from '../src/core/index'
import { graphData } from '../src/core/export'
import { themeTokens } from '../src/core/tokens'
import { exportData } from '../src/decypher/export'
import { fromRecord, type RecordLike } from '../src/decypher/parse'
import { curvesCsv, groupNotes } from '../src/lib/csv'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanLabels, labelFor, labelsOf, setLabel, setLabels } from '../src/lib/labels'
import { LabelInput } from '../src/ui/label-input'
import { RUNNER } from './helpers'

const F = RUNNER + 'test/fixtures/decypher/'
const TOKENS = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const pal = kit.palette(false, TOKENS.light)
const recordText = readFileSync(F + 'rdf_o111_Methionine_H.run.json', 'utf8')
const analysis = () => fromRecord({ id: 'job:jh', kind: 'job', title: 't', label: 'H', source: 'job', record: JSON.parse(recordText) as RecordLike, xvg: readFileSync(F + 'rdf_o111_Methionine_H.xvg', 'utf8'), struct: null, structNote: '' })

describe('renamed groups and reference (R11d)', () => {
  it('keeps labels by source and original name; an empty label removes one; anything else is left out', () => {
    expect(cleanLabels({ 'job:a': { H_Met: 'His', x: '', y: 3 }, bad: 'x', 'job:b': {} })).toEqual({ 'job:a': { H_Met: 'His' } })
    setLabel('job:t', 'H_Met', '  His  ')
    setLabel('job:t', 'O5...S', 'O5 to S')
    expect(labelsOf('job:t')).toEqual({ H_Met: 'His', 'O5...S': 'O5 to S' })
    setLabel('job:t', 'O5...S', '')
    expect(labelsOf('job:t')).toEqual({ H_Met: 'His' })
  })
  it('a saved view sets a source\'s labels all at once: those it does not name go (review)', () => {
    setLabel('job:v', 'H_Met', 'His'); setLabel('job:v', 'water', 'W'); setLabel('job:w', 'water', 'kept')
    setLabels('job:v', { water: ' solvent ', x: '' })
    expect([labelsOf('job:v'), labelsOf('job:w')]).toEqual([{ water: 'solvent' }, { water: 'kept' }])
    setLabels('job:v', {})
    expect(labelsOf('job:v')).toEqual({})
  })
  it('a label field shows the label kept, and keeps what is typed while it means the same label', () => {
    expect([labelFor('water', ' W '), labelFor('water', 'water '), labelFor('water', '')]).toEqual(['W', '', ''])
    const html = renderToStaticMarkup(React.createElement(LabelInput, { name: 'water', label: 'solvent', onLabel: () => {} }))
    expect(html).toMatch(/value="solvent"/)
    expect(html).toMatch(/aria-label="label for water"/)
  })
  it('labels an analysis\'s groups and reference for display; their names stay what everything is keyed by', () => {
    const a = analysis(), l = kit.withLabels(a, { H_Met: 'His', 'O5...S': 'O5 to S' })
    const o5 = l.sels.find(g => g.name === 'O5...S')!
    expect([l.ref?.name, l.ref?.label, o5.label, l.sels.filter(g => g.label).length]).toEqual(['H_Met', 'His', 'O5 to S', 1])
    expect(kit.withLabels(a, undefined)).toBe(a)
    const [c] = kit.buildCurves({ focus: l, plotted: [l], selected: ['O5...S'], colorBy: 'group', pal, tones: {} })
    expect([c.name, c.label, c.key]).toEqual(['O5...S', 'O5 to S', 'job:jh|O5...S|O5...S'])
  })
  it('the CSV and the figures use the labels; the CSV lists the original names', () => {
    const l = kit.withLabels(analysis(), { H_Met: 'His', 'O5...S': 'O5 to S' })
    const curves = kit.buildCurves({ focus: l, plotted: [l], selected: ['O5...S', 'CH...S'], colorBy: 'group', pal, tones: {} })
    const csv = curvesCsv(curves.map(c => ({ ...c, name: c.label ?? c.name })), l.xlabel, l.ylabel, { notes: groupNotes(l) })
    expect(csv.split('\n').slice(0, 3)).toEqual(['# group His: gmx name H_Met (the reference)', '# group O5 to S: gmx name O5...S', 'r (nm),O5 to S,CH...S'])
    expect(graphData({ title: 't', file: 'f', xlabel: l.xlabel, ylabel: l.ylabel, curves }, 'light').series.map(s => s.label)).toEqual(['O5 to S · H', 'CH...S · H'])
  })
  it('the HTML export carries each label beside its name', () => {
    const l = kit.withLabels(analysis(), { H_Met: 'His', 'O5...S': 'O5 to S' })
    const d = exportData({ analyses: [l], structs: {}, selected: () => ['O5...S'], tones: {}, compare: null, view: { rep: 'ball & stick', rest: 'grey', labels: true, hydrogens: true, arrange: 'side by side' }, theme: 'light', tokens: TOKENS, structures: false, by: 'x' })
    expect([d.analyses[0].ref, d.analyses[0].sels.find(g => g.name === 'O5...S')?.label]).toEqual([expect.objectContaining({ name: 'H_Met', label: 'His' }), 'O5 to S'])
  })
  it('never touches the record: its bytes are the same after every use of the labels', () => {
    const rec = JSON.parse(recordText) as RecordLike, a = fromRecord({ id: 'job:jh', kind: 'job', title: 't', label: 'H', source: 'job', record: rec, xvg: readFileSync(F + 'rdf_o111_Methionine_H.xvg', 'utf8'), struct: null, structNote: '' })
    const l = kit.withLabels(a, { H_Met: 'His', 'O5...S': 'O5 to S' })
    curvesCsv(kit.buildCurves({ focus: l, plotted: [l], selected: ['O5...S'], colorBy: 'group', pal, tones: {} }), l.xlabel, l.ylabel, { notes: groupNotes(l) })
    exportData({ analyses: [l], structs: {}, selected: () => ['O5...S'], tones: {}, compare: null, view: { rep: 'ball & stick', rest: 'grey', labels: true, hydrogens: true, arrange: 'side by side' }, theme: 'light', tokens: TOKENS, structures: false, by: 'x' })
    expect(JSON.stringify(rec)).toBe(JSON.stringify(JSON.parse(recordText)))
    expect(readFileSync(F + 'rdf_o111_Methionine_H.run.json', 'utf8')).toBe(recordText)
    expect([a.ref?.label, a.sels.some(g => g.label)]).toEqual([undefined, false])
  })
})
