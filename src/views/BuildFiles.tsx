import * as React from 'react'
import { getJson } from '../api'
import type { BuildCheck } from '../buildCheck'
import type { BuildDraft } from '../buildDraft'
import { STAGES, switches } from '../lib/build/plan'
import { toneSoft } from '../lib/tones'
import { cn } from '../lib/utils'
import { Status } from '../ui/status'

const Head = ({ label, n }: { label: string; n?: number }) => (
  <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">{label}</span><span className="h-px flex-1 bg-border" />{n != null && <span className="text-control">{String(n).padStart(2, '0')}</span>}</div>
)
const Found = ({ found, path }: { found: boolean | undefined; path: string }) => (found == null ? <span className="text-caption text-muted-foreground">{path}</span> : <Status inline level={found ? 'ok' : 'error'} word={found ? 'found' : 'missing'}>{path}</Status>)

/** symbuilder · files (R4): what a build reads from the base folder, each file found or missing; mdp files read in place. */
export function BuildFilesView({ draft, check, error, base }: { draft: BuildDraft; check: BuildCheck | null; error: string; base: string | null | undefined }) {
  const found = (path: string) => check?.files.find(f => f.path === path)?.found
  const [sel, setSel] = React.useState(draft.systems.saccharides[0] ?? ''), [text, setText] = React.useState<{ path: string; text: string } | null>(null)
  const open = (path: string) => getJson<{ text: string }>('/api/build/text?path=' + encodeURIComponent(path)).then(r => setText({ path, text: r.text }), e => setText({ path, text: (e as Error).message }))
  const ff = check?.files.filter(f => f.kind === 'force field') ?? []
  const mdpFor = (stage: string, method: string) => {
    const m = draft.plan.science.mdp, hmr = switches(method).hmr
    return ({ min: m.min, nvt: m.nvt, npt: m.npt, awh: hmr ? m.awhHmr : m.awh, pull: m.pull, walkers: m.walkers } as Record<string, string>)[stage]
  }
  const missing = Object.entries(check?.missing ?? {})
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1"><h2 className="m-0 text-title">files</h2><p className="m-0 text-caption text-muted-foreground">what a build reads from the base folder{base ? ' (' + base + ')' : ''}: each saccharide's .gro and .itp, the force field and its includes, the mdp file of each stage per method · read only</p></div>
      {!base && <Status level="info" word="note">no base folder yet: set it in settings → SymBuilder, and each file is looked for there</Status>}
      {error && <Status level="error">{error}</Status>}
      {missing.length > 0 && <Status level="warning" word="check">{missing.length === 1 ? 'one system is' : missing.length + ' systems are'} missing a file: {missing.slice(0, 3).map(([d, f]) => d.split('/').slice(1).join('/') + ' needs ' + f.join(', ')).join(' · ')}</Status>}
      <div className="grid grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-5 max-[1180px]:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <Head label="saccharides" n={draft.systems.saccharides.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {!draft.systems.saccharides.length && <p className="m-0 px-4 py-3 text-caption text-muted-foreground">none yet: add them in systems</p>}
            {draft.systems.saccharides.map(c => {
              const ok = [found('molecules/saccharides/' + c + '.gro'), found('ff/' + c + '-ADD.itp')]
              return (
                <button key={c} onClick={() => setSel(c)} aria-current={sel === c ? 'true' : undefined} className={cn('flex w-full items-center justify-between border-b border-border px-4 py-2 text-left last:border-0', sel === c && 'bg-muted shadow-[inset_3px_0_0_var(--state)]')}>
                  <span className="flex flex-col"><b className="text-control">{c}</b><span className="text-caption text-muted-foreground">gro · itp</span></span>
                  {ok.includes(undefined) ? null : ok.every(Boolean) ? <Status inline level="ok" word="ready" /> : <Status inline level="error" word="missing" />}
                </button>
              )
            })}
          </div>
          <Head label="sequences" n={draft.systems.sequences.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {draft.systems.sequences.map(q => <div key={q} className="flex items-center justify-between border-b border-border px-4 py-2 last:border-0"><span className="flex flex-col"><b className="text-control">{q}</b><span className="text-caption text-muted-foreground">PyMOL · cmd.fab("{q.toUpperCase()}")</span></span></div>)}
          </div>
        </div>
        <section aria-label="the selected saccharide and the force field" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          {sel ? <>
            <div className="flex items-center justify-between"><b className="text-heading">{sel}</b><span className={cn('rounded-full px-2.5 py-0.5 text-[11px]', toneSoft.sky)}>saccharide</span></div>
            <Head label="files" />
            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2"><b className="text-control">coordinates</b><Found found={found('molecules/saccharides/' + sel + '.gro')} path={'molecules/saccharides/' + sel + '.gro'} /><b className="text-control">topology</b><Found found={found('ff/' + sel + '-ADD.itp')} path={'ff/' + sel + '-ADD.itp'} /></div>
          </> : <span className="text-caption text-muted-foreground">add a saccharide in systems</span>}
          <Head label="force field" n={ff.length} />
          <div className="flex flex-col gap-1">{ff.map(f => <Found key={f.path} found={f.found} path={f.path} />)}{!ff.length && <span className="text-caption text-muted-foreground">{draft.plan.science.forcefield}.ff in ff/</span>}</div>
        </section>
        <section aria-label="mdp files by stage and method" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 max-[1180px]:col-span-2">
          <Head label="mdp files · stage × method" />
          <div className="grid gap-x-3 gap-y-1.5 text-caption" style={{ gridTemplateColumns: '100px repeat(' + Math.max(1, draft.systems.methods.length) + ', minmax(0,1fr))' }}>
            <span className="text-label uppercase text-muted-foreground">stage</span>{draft.systems.methods.map(m => <span key={m} className="truncate text-label uppercase text-muted-foreground">{m}</span>)}
            {STAGES.filter(s => s.id !== 'sb').map(s => (
              <React.Fragment key={s.id}><b>{s.name}</b>{draft.systems.methods.map(m => { const f = 'inputs/' + mdpFor(s.id, m), ok = found(f), on = draft.plan.stages.find(x => x.id === s.id)?.on
                return <button key={m} disabled={!base} onClick={() => open(f)} className={cn('truncate rounded-md px-2 py-0.5 text-left', !on ? 'border border-dashed border-border text-muted-foreground' : ok === false ? 'border border-border bg-muted' : toneSoft.lilac)}>{f}{ok === false ? ' · missing' : ''}</button> })}</React.Fragment>
            ))}
          </div>
          <span className="text-caption text-muted-foreground">your inputs/ files, used as they are · walkers use hmr_multi.mdp for every method, for now · click one to read it</span>
          {text && <><Head label={text.path} /><pre className="m-0 max-h-[360px] overflow-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{text.text}</pre></>}
        </section>
      </div>
    </div>
  )
}
