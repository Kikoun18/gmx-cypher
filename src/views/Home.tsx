import * as React from 'react'
import type { AppState } from '../api'
import { statusOf, type Job } from '../jobs'
import { formatRoute } from '../lib/route'
import { useProject } from '../project'
import { toneDot, toneText, type Tone } from '../lib/tones'
import { cn } from '../lib/utils'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Stat } from '../ui/card'
import { Status } from '../ui/status'

/** The cluster tab's last read, as it hands it up (T215): when, and how many jobs in each state. */
export interface ClusterSummary { at: string; states: { word: string; tone: Tone; n: number }[] }
/** The connected project, as `GET /api/vault/project` sends it (only what home reads). */
export interface ProjectSummary { name: string; columns: { k: string }[]; rows: { runs: Record<string, string[]> }[] }

const link = (r: Parameters<typeof formatRoute>[0]) => formatRoute(r)
const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} className="w-fit text-caption text-[var(--ring)] underline-offset-[3px] hover:underline">{children}</a>

/**
 * home (R2): what the server already knows, each card opening its place. One component, to be redesigned; no charts,
 * no polling: the project is read once, the cluster's last read is the cluster tab's own.
 */
export function HomeView({ gmx, vault, project, jobs, cluster }: {
  gmx: AppState['gmx']; vault: string | null; project: ProjectSummary | null; jobs: Job[]; cluster: ClusterSummary | null
}) {
  const running = jobs.filter(j => j.status === 'running'), ended = jobs.filter(j => j.ended).sort((a, b) => b.ended!.localeCompare(a.ended!))
  const done = ended.filter(j => j.status === 'done').length
  const empty = project ? project.rows.reduce((n, r) => n + project.columns.filter(c => !r.runs[c.k]?.length).length, 0) : 0
  const qq = cluster?.states.find(s => s.word === 'running')?.n
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1"><h2 className="m-0 text-title">home</h2><p className="m-0 text-caption text-muted-foreground">what gmx-cypher knows right now · each card opens its place</p></div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="jobs running" value={<span className={toneText.sky}>{running.length}</span>} hint="analyses, here" />
        <Stat label="jobs done" value={<span className={toneText.mint}>{done}</span>} hint={ended.length - done ? ended.length - done + ' did not finish' : 'all the jobs that ended'} />
        <Stat label="qq jobs running" value={<span className={toneText.butter}>{qq ?? '—'}</span>} hint={cluster ? 'at the cluster tab\'s last read' : 'the cluster tab has not been read'} />
      </div>
      <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>symbuilder</CardTitle><CardDescription>systems by state</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-caption text-muted-foreground">no system built yet<A href={link({ view: 'symbuilder', sub: 'build' })}>plan a build →</A></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>analysis</CardTitle><CardDescription>jobs running and the last finished</CardDescription>
            <CardAction><A href={link({ view: 'results', job: null })}>results →</A></CardAction></CardHeader>
          <CardContent className="flex flex-col gap-1">
            {!running.length && !ended.length && <span className="flex flex-col gap-1.5 text-caption text-muted-foreground">no jobs yet<A href={link({ view: 'setup', step: 'inputs', batch: false })}>set up an analysis →</A></span>}
            {[...running, ...ended.slice(0, 4)].map(j => { const s = statusOf(j); return (
              <a key={j.id} href={link({ view: 'results', job: j.id })} className="flex min-w-0 items-baseline gap-2 rounded-sm text-caption hover:bg-accent">
                <Status inline level={s.level} word={s.word} /><span className="min-w-0 truncate">{j.name ?? j.title}</span>
              </a>) })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>vault</CardTitle><CardDescription>the Matrix's vault and the connected project</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-1 text-control">
            {vault ? <span>{vault.split('/').pop()}{project ? <> · project <b>{project.name}</b></> : ' · no project connected'}</span> : <span className="text-caption text-muted-foreground">no vault set · settings → vault</span>}
            {project && <span className="text-caption text-muted-foreground">{project.rows.length} rows · {project.columns.length} columns · <span className={toneText.butter}>{empty} cells with no runs</span></span>}
            {project && empty > 0 && <A href={link({ view: 'symbuilder', sub: 'systems' })}>build what the project lacks →</A>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>gmx</CardTitle><CardDescription>what analyses and builds run with</CardDescription></CardHeader>
          <CardContent>{gmx.ok ? <Status inline level="ok" word="ready">{gmx.name} {gmx.version}</Status> : <Status inline level="error" word="no gmx">set its path in settings → gmx</Status>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>cluster</CardTitle><CardDescription>the cluster tab's last read · home never reads qq</CardDescription>
            <CardAction><A href={link({ view: 'cluster' })}>cluster →</A></CardAction></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
            {cluster ? <>
              <span className="text-muted-foreground">read at {new Date(cluster.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {cluster.states.map(s => <span key={s.word} className={cn('inline-flex items-center gap-1.5', toneText[s.tone])}><span aria-hidden className={cn('size-2 rounded-full', toneDot[s.tone])} />{s.n} {s.word}</span>)}
              {!cluster.states.length && <span className="text-muted-foreground">no jobs</span>}
            </> : <span className="text-muted-foreground">not read since this page opened</span>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** home with what it reads: the connected project, once when it opens. */
export function Home({ state, jobs, cluster }: { state: AppState; jobs: Job[]; cluster: ClusterSummary | null }) {
  const project = useProject<ProjectSummary>(state.config.vault, state.config.project)
  return <HomeView gmx={state.gmx} vault={state.config.vault} project={project} jobs={jobs} cluster={cluster} />
}
