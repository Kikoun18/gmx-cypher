// Settings → export (R6b): the Matrix's export settings, kept in this browser, for every chart's menu and for several
// charts at once: format, size (the journals' column widths), theme, text size, title, grid, legend, file name.

import * as React from 'react'
import { pressed } from '../lib/shortcuts'
import { SIZE_PRESETS } from '../../../matrix/src/lib/exportPrefs'
import { fileName, NAME_FIELDS, PREFS, useExportPrefs, type ExportPrefs } from '../core/exportPrefs'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

/** A choice among words, as a select. */
function Choice<T extends string>({ id, label, value, options, words, onChange }: { id: string; label: string; value: T; options: readonly T[]; words?: Partial<Record<T, string>>; onChange: (v: T) => void }) {
  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={v => onChange(v as T)}>
        <SelectTrigger id={id} size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{words?.[o] ?? o}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  )
}

/** A number typed freely and kept when it is left (Enter or elsewhere); one out of range goes back to its default. */
function NumberField({ id, label, value, onChange, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])
  const keep = () => { const v = Number(text); if (text.trim() !== '' && Number.isFinite(v) && v !== value) onChange(v); else setText(String(value)) }
  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} size="sm" inputMode="decimal" value={text} onChange={e => setText(e.target.value)} onBlur={keep} onKeyDown={e => pressed(e, 'enter') && keep()} />
      {hint && <FieldHint>{hint}</FieldHint>}
    </Field>
  )
}

export function ExportSettings() {
  const [p, set] = useExportPrefs()
  const preset = SIZE_PRESETS.find(s => s.w === p.w && (s.w === 0 || s.unit === p.unit) && !p.h)?.label ?? 'custom'
  const example = fileName(p.name, { file: 'rdf_nvt', project: 'Peptides', sequence: 'WRWYCR', column: 'HA', run: '1', command: 'rdf', group: 'sulfur' }, p.format)
  const toggle = (k: 'title' | 'grid' | 'legendMarks', label: string) => (
    <label className="inline-flex items-center gap-2 text-control"><Checkbox checked={p[k]} onCheckedChange={v => set({ [k]: v === true } as Partial<ExportPrefs>)} />{label}</label>
  )
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Choice id="export-format" label="default format" value={p.format === 'xvg' ? 'pdf' : p.format} options={['pdf', 'svg', 'png'] as const} onChange={format => set({ format })} />
        <Choice id="export-theme" label="theme" value={p.theme} options={['light', 'dark', 'print'] as const} words={{ print: 'print (black and white)' }} onChange={theme => set({ theme })} />
        <Field>
          <Label htmlFor="export-size">size</Label>
          <Select value={preset} onValueChange={v => { const s = SIZE_PRESETS.find(x => x.label === v); if (s) set({ w: s.w, h: 0, unit: s.unit }); else set({ w: p.w || 120, unit: 'mm' }) }}>
            <SelectTrigger id="export-size" size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{[...SIZE_PRESETS.map(s => s.label), 'custom'].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <NumberField id="export-font" label="text size (pt)" value={p.font} onChange={font => set({ font })} hint="tick labels; the rest keeps its proportion" />
        {preset === 'custom' && <>
          <NumberField id="export-w" label={'width (' + p.unit + ')'} value={p.w} onChange={w => set({ w })} />
          <NumberField id="export-h" label={'height (' + p.unit + ') · 0: as the chart needs'} value={p.h} onChange={h => set({ h })} />
          <Choice id="export-unit" label="unit" value={p.unit} options={['mm', 'px'] as const} onChange={unit => set({ unit })} />
        </>}
        <Choice id="export-scale" label="png resolution" value={String(p.scale)} options={['1', '2', '3', '4'] as const} words={p.unit === 'mm' && p.w ? { 1: '72 dpi', 2: '144 dpi', 3: '216 dpi', 4: '288 dpi' } : { 1: '1×', 2: '2×', 3: '3×', 4: '4×' }} onChange={v => set({ scale: Number(v) })} />
        <Choice id="export-legend" label="legend" value={p.legendAt} options={['below', 'right', 'inside'] as const} words={{ right: 'right of the plot', inside: 'inside the plot' }} onChange={legendAt => set({ legendAt })} />
        <Choice id="export-layout" label="several charts at once" value={p.layout} options={['pdf', 'each', 'grid'] as const} words={{ pdf: 'one PDF, a page each', each: 'a file each', grid: 'one figure, a grid' }} onChange={layout => set({ layout })} />
        {p.layout === 'grid' && <Choice id="export-cols" label="grid columns" value={String(p.gridCols)} options={['1', '2', '3', '4', '5', '6'] as const} onChange={v => set({ gridCols: Number(v) })} />}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{toggle('title', 'title')}{toggle('grid', 'grid lines')}{toggle('legendMarks', 'peaks in the legend')}</div>
      <Field>
        <Label htmlFor="export-name">file name</Label>
        <Input id="export-name" size="sm" value={p.name} onChange={e => set({ name: e.target.value })} />
        <FieldHint>{NAME_FIELDS.map(f => '{' + f + '}').join(' ')} · for example {example} · an empty field drops the separator before it</FieldHint>
      </Field>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => set(PREFS)} disabled={JSON.stringify(p) === JSON.stringify(PREFS)}>back to the defaults</Button>
        <FieldHint>Kept in this browser, as the Matrix keeps its own. The files go to your downloads.</FieldHint>
      </div>
    </>
  )
}
