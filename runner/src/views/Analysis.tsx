import * as React from 'react'
import { getJson, type AppState } from '../api'
import type { Draft } from '../draft'
import { COMMANDS, commandOf, sectionsOf, withCommand } from '../lib/commands'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select'
import { Awh } from './Awh'
import { Energy } from './Energy'
import { GroupCommand } from './GroupCommand'
import { Wham } from './Wham'

type Available = { tool: string; ok: boolean; gmxTool?: string; why?: string }

/** Which commands this gmx runs, and as which of its tools (R8), read again when gmx changes; empty until known. */
function useAvailable(gmx: AppState['gmx']) {
  const key = gmx.ok ? gmx.path + ' ' + gmx.version : ''
  const [a, setA] = React.useState<{ key: string; list: Available[] } | null>(null)
  React.useEffect(() => {
    if (!key) return
    let alive = true
    getJson<Available[]>('/api/commands').then(list => alive && setA({ key, list }), () => {})
    return () => { alive = false }
  }, [key])
  return new Map((a?.key === key ? a.list : []).map(c => [c.tool, c]))
}

/** The analysis tab (R3b, T99): the command picker, grouped by what each command needs, then that command's own view. */
export function Analysis({ gmx, draft, setDraft, onStarted }: { gmx: AppState['gmx']; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }) {
  const command = commandOf(draft.analysis ?? 'rdf') ?? COMMANDS[0]
  const available = useAvailable(gmx), off = [...available.values()].filter(c => !c.ok)
  return (
    <div className="flex flex-col gap-5">
      <Field>
        <Label htmlFor="analysis-command">analysis</Label>
        <Select value={command.tool} onValueChange={tool => setDraft(d => withCommand(d, tool))}>
          <SelectTrigger id="analysis-command" size="sm" className="w-[38rem] max-w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sectionsOf().map(({ section, commands }) => (
              <SelectGroup key={section}>
                <SelectLabel>{section}</SelectLabel>
                {commands.map(c => {
                  // A command this gmx lacks is shown, not offered; one it runs under another name says which (gmx hbond before 2024).
                  const a = available.get(c.tool), other = a?.gmxTool && a.gmxTool !== c.tool ? ' (runs gmx ' + a.gmxTool + ' here)' : ''
                  return <SelectItem key={c.tool} value={c.tool} disabled={a?.ok === false}>gmx {c.tool} · {c.title}{other}</SelectItem>
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <FieldHint>the commands gmx-cypher runs, grouped by what each needs{off.length ? ' · not offered here: ' + off.map(c => 'gmx ' + c.tool + ', ' + c.why).join('; ') : ''}</FieldHint>
      </Field>
      {command.groups && <GroupCommand key={command.tool} command={command} gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'energy' && <Energy gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'awh' && <Awh gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'wham' && <Wham gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
    </div>
  )
}
