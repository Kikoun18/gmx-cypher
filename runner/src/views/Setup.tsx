import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type { AppState } from '../api'
import type { Draft } from '../draft'
import type { Job } from '../jobs'
import { STEPS, type Route, type Step } from '../lib/route'
import { cn } from '../lib/utils'
import { Status } from '../ui/status'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Analysis } from './Analysis'
import { BatchView } from './Batch'
import { Groups } from './Groups'
import { Inputs, useInputsCheck } from './Inputs'

const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's')

/**
 * Set-up (R9a): inputs → groups → command as steps, each saying where it stands. Batch is the same steps over many
 * trajectories: its first step finds them by a path template, and the groups and command are the recipe.
 */
export function Setup({ route, go, state, draft, setDraft, jobs, uploads, onUploaded, onSettings, onOpenJob }: {
  route: Extract<Route, { view: 'setup' }>; go: (r: Route) => void; state: AppState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; jobs: Job[]
  uploads: File[]; onUploaded: () => void; onSettings: () => void; onOpenJob: (id: string) => void
}) {
  const check = useInputsCheck(draft), command = check.command
  const [matches, setMatches] = React.useState<number | null>(null)
  // A command that takes no groups has no groups step (gmx energy, awh, wham).
  const steps = STEPS.filter(s => s !== 'groups' || command.groups), step = steps.includes(route.step) ? route.step : 'inputs'
  const to = (s: Step, batch = route.batch) => go({ view: 'setup', step: s, batch })
  const made = draft.groups.filter(g => g.steps.length).length, set = Object.values(draft.options).filter(v => v !== '').length
  const states: Record<Step, React.ReactNode> = {
    inputs: route.batch ? (matches == null ? 'none found yet' : plural(matches, 'match'))
      : check.busy ? 'checking…' : check.ready ? <Status inline level="ok" word="checked" /> : check.failed ? <Status inline level="error" word="not ready" /> : 'nothing picked',
    groups: made ? plural(made, 'group') : 'none made',
    command: 'gmx ' + command.tool + (set ? ' · ' + plural(set, 'option') + ' set' : ''),
  }
  const labels: Record<Step, string> = { inputs: route.batch ? 'trajectories' : 'inputs', groups: 'groups', command: 'command' }
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="set-up steps" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
              <button onClick={() => to(s)} aria-current={s === step ? 'step' : undefined}
                className={cn('flex items-baseline gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-muted', s === step && 'bg-muted ring-1 ring-inset ring-border')}>
                <span className="text-label text-muted-foreground">{i + 1}</span>
                <span className="text-control font-bold">{labels[s]}</span>
                <span className="text-caption text-muted-foreground">{states[s]}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="flex-1" />
        <ToggleGroup type="single" size="sm" value={route.batch ? 'batch' : 'one'} onValueChange={v => v && to(step, v === 'batch')} aria-label="set up for">
          <ToggleGroupItem value="one">one trajectory</ToggleGroupItem>
          <ToggleGroupItem value="batch">batch</ToggleGroupItem>
        </ToggleGroup>
      </nav>
      {route.batch && step !== 'inputs' && (
        <Status level="info">in batch, the groups and the command are the recipe: preview and run it over the trajectories of step 1 · run here runs the one trajectory of one-trajectory mode</Status>
      )}
      {step === 'inputs' && (route.batch
        ? <BatchView state={state} draft={draft} jobs={jobs} onOpenJob={onOpenJob} onMatches={setMatches} />
        : <Inputs state={state} draft={draft} setDraft={setDraft} check={check} uploads={uploads} onUploaded={onUploaded} onSettings={onSettings} onNext={() => to(steps[1])} />)}
      {step === 'groups' && <Groups draft={draft} setDraft={setDraft} />}
      {step === 'command' && <Analysis gmx={state.gmx} draft={draft} setDraft={setDraft} onStarted={onOpenJob} />}
    </div>
  )
}
