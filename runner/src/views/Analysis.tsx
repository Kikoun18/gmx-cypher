import * as React from 'react'
import type { AppState } from '../api'
import type { Draft } from '../draft'
import { COMMANDS, commandOf, sectionsOf, withCommand } from '../lib/commands'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select'
import { Awh } from './Awh'
import { Energy } from './Energy'
import { Rdf } from './Rdf'
import { Wham } from './Wham'

/** The analysis tab (R3b, T99): the command picker, grouped by what each command needs, then that command's own view. */
export function Analysis({ gmx, draft, setDraft, onStarted }: { gmx: AppState['gmx']; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }) {
  const command = commandOf(draft.analysis ?? 'rdf') ?? COMMANDS[0]
  return (
    <div className="flex flex-col gap-5">
      <Field>
        <Label htmlFor="analysis-command">analysis</Label>
        <Select value={command.tool} onValueChange={tool => setDraft(d => withCommand(d, tool))}>
          <SelectTrigger id="analysis-command" size="sm" className="w-96"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sectionsOf().map(({ section, commands }) => (
              <SelectGroup key={section}>
                <SelectLabel>{section}</SelectLabel>
                {commands.map(c => <SelectItem key={c.tool} value={c.tool}>gmx {c.tool} · {c.title}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <FieldHint>the commands gmx-cypher runs, grouped by what each needs</FieldHint>
      </Field>
      {command.tool === 'rdf' && <Rdf gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'energy' && <Energy gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'awh' && <Awh gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
      {command.tool === 'wham' && <Wham gmx={gmx} draft={draft} setDraft={setDraft} onStarted={onStarted} />}
    </div>
  )
}
