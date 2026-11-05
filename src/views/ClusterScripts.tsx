import * as React from 'react'
import type { Config } from '../api'
import { readBuildDraft } from '../buildDraft'
import { firstSystem } from '../lib/build/tiles'
import { DEFAULT_PROFILES, PROFILES, profileOf, qqScript, SCRIPTED, SCRIPTED_STAGES, STEP_FOLDER, type ScriptedStage } from '../lib/build/qq'
import { cn } from '../lib/utils'
import { Status } from '../ui/status'

const Head = ({ label, n }: { label: string; n?: number }) => (
  <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">{label}</span><span className="h-px flex-1 bg-border" />{n != null && <span className="text-control">{String(n).padStart(2, '0')}</span>}</div>
)
const NAME: Record<ScriptedStage, string> = { min: 'minimisation', nvt: 'nvt', npt: 'npt', awh: 'awh', pull: 'pull', walkers: 'multiwalker' }

/** cluster · scripts (R7b): the profiles, each stage's (settings), and the script a build writes for the first system planned. */
export function ClusterScriptsView({ config }: { config: Config | undefined }) {
  const [draft] = React.useState(readBuildDraft)
  const ids = { ...DEFAULT_PROFILES, ...(config?.qqBuild?.profiles ?? {}) } as Record<ScriptedStage, string>
  const [stage, setStage] = React.useState<ScriptedStage>('awh'), [picked, setPicked] = React.useState(ids[stage])
  const sys = firstSystem(draft), profile = profileOf(ids[stage]) ?? PROFILES[0], shown = profileOf(picked) ?? profile
  const script = qqScript(stage, sys, profile, draft.plan.science.walkers.length)!
  const until = (st: ScriptedStage) => st === 'walkers' ? 'every walker has 9.multiwalker.gro' : SCRIPTED[st]!.deffnm + '.gro exists' + (['min', 'nvt', 'npt'].includes(st) ? ' · built here by default' : '')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1"><h2 className="m-0 text-title">cluster scripts</h2>
        <p className="m-0 text-caption text-muted-foreground">the qq script of every heavy stage · written once to scripts/{'{stage}'}/{'{method}_{stage}_{sequence}'}.sh, kept when it already exists, and copied into the step's folder · each stage's profile is set in settings → SymBuilder · qq scripts</p></div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-5 max-[1100px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          <Head label="profiles" n={PROFILES.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {PROFILES.map(p => {
              const used = SCRIPTED_STAGES.filter(st => ids[st] === p.id).length
              return (
                <button key={p.id} onClick={() => setPicked(p.id)} aria-current={shown.id === p.id ? 'true' : undefined} className={cn('flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left last:border-0', shown.id === p.id && 'bg-muted shadow-[inset_3px_0_0_var(--state)]')}>
                  <span className="flex flex-col"><b className="text-control">{p.name}</b><span className="text-caption text-muted-foreground">{p.gmx} · {p.modules.split('\n').filter(l => /module/.test(l)).map(l => l.replace(/^(meta)?module (add|load) /, '')).join(', ')}</span></span>
                  <span className="text-caption text-muted-foreground">{used ? used + (used === 1 ? ' stage' : ' stages') : 'unused'}</span>
                </button>
              )
            })}
          </div>
          <section aria-label={'the profile ' + shown.name} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <Head label={shown.name} />
            <dl className="m-0 grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-caption">
              {([['gromacs', shown.gmx], ['# qq job-type', 'continuous'], ['# qq props', shown.props ?? '—'], ['# qq ncpus', shown.ncpus + (shown.multidir ? ' per walker' : '')], ['# qq ngpus', shown.ngpus + (shown.multidir ? ' per walker' : '')],
                ['# qq mem', shown.mem], ['# qq walltime', shown.walltime], ['# qq loop-end', String(shown.loopEnd)], ['mdrun flags', (shown.flags || '—') + (shown.dlb ? ' -dlb yes' : '') + ' -maxh ' + shown.maxh]] as const)
                .map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="m-0 font-mono">{v}</dd></React.Fragment>)}
            </dl>
            <span className="text-caption text-muted-foreground">the notebook's own profile, as its render_qq_script writes it (with the differences in T213)</span>
          </section>
        </div>
        <div className="flex flex-col gap-3">
          <Head label="stages" n={SCRIPTED_STAGES.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card text-caption">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,0.8fr)] gap-2 border-b border-border px-4 py-1.5 text-label uppercase text-muted-foreground"><span>stage</span><span>resubmit until</span><span>profile</span></div>
            {SCRIPTED_STAGES.map(st => (
              <button key={st} onClick={() => { setStage(st); setPicked(ids[st]) }} aria-current={stage === st ? 'true' : undefined} className={cn('grid w-full grid-cols-[110px_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-2 border-b border-border px-4 py-2 text-left last:border-0', stage === st && 'bg-muted shadow-[inset_3px_0_0_var(--state)]')}>
                <b>{NAME[st]}</b><span className="text-muted-foreground">{until(st)}</span><span className="truncate">{profileOf(ids[st])?.name ?? ids[st]}</span>
              </button>
            ))}
          </div>
          <section aria-label={'the script of ' + NAME[stage]} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <b className="text-heading">{script.file.split('/').pop()}</b>
            <span className="text-caption text-muted-foreground">{script.file.split('/').slice(0, -1).join('/')}/ → {sys.dir}/{STEP_FOLDER[stage]}/ · for the first system planned in symbuilder</span>
            <pre className="m-0 max-h-[420px] overflow-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{script.text}</pre>
            <span className="text-caption text-muted-foreground">its submit line, from the base folder:</span>
            <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{script.submit}</pre>
            {['awh', 'pull', 'walkers'].includes(stage)
              ? (config?.qqBuild?.submit ? <Status level="info" word="note">a build submits it for you (settings: submit them for me, queue {config.qqBuild.queue})</Status> : <Status level="info" word="note">a build prints this line; you submit it (settings: submit them for me is off)</Status>)
              : <span className="text-caption text-muted-foreground">minimisation, nvt and npt run here; their scripts are written too, for a cluster run of your own</span>}
          </section>
        </div>
      </div>
    </div>
  )
}
