import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Section } from '../ui/separator'
import { getJson } from '../api'
import type { Job } from '../jobs'
import type { RunRecord } from '../lib/record'
import { toneText } from '../lib/tones'
import { cn } from '../lib/utils'

const size = (n: number) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB')

/** The run record of an ended rdf job (T31): read from the server once the job has ended. */
function useRecord(job: Job) {
  const [r, setR] = React.useState<{ id: string; record?: RunRecord; error?: string } | null>(null)
  React.useEffect(() => {
    if (job.kind !== 'rdf' || !job.ended) return
    let alive = true
    // The record is written just after the job's end event: ask again shortly if it isn't there yet.
    const read = (left: number) => getJson<RunRecord>('/api/jobs/' + job.id + '/record').then(record => alive && setR({ id: job.id, record }),
      e => { if (!alive) return; if (left) setTimeout(() => read(left - 1), 300); else setR({ id: job.id, error: (e as Error).message }) })
    read(10)
    return () => { alive = false }
  }, [job.id, job.kind, job.ended])
  return r?.id === job.id ? r : null
}

/** What a run wrote, its groups as gmx counted them, and "run again" with the same recipe and new names (section 11.4). */
export function RunFiles({ job, onRunAgain }: { job: Job; onRunAgain: (r: RunRecord) => void }) {
  const r = useRecord(job)
  if (job.kind !== 'rdf' || !job.ended) return null
  if (!r) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the run record…</p>
  if (r.error) return <p className="m-0 text-caption text-muted-foreground">no run record: {r.error}</p>
  const rec = r.record!, dir = (job.meta?.outDir as string) || ''
  return (
    <div className="flex flex-col gap-3">
      {rec.problems.length > 0 && (
        <Alert variant="warning"><TriangleAlert /><AlertTitle>gmx-cypher's promise was broken</AlertTitle><AlertDescription>{rec.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
      )}
      <Section label="Files"><span className="text-caption text-muted-foreground">{dir}</span></Section>
      <table className="text-control"><tbody>
        {[...rec.outputs.map(o => ({ name: o.path.split('/').pop()!, size: size(o.size), hash: o.sha256.slice(0, 12) })), { name: String(job.meta?.record ?? '').split('/').pop()!, size: '', hash: 'this record' }].map(f => (
          <tr key={f.name}><td className="py-0.5 pr-4">{f.name}</td><td className="pr-4 text-right text-muted-foreground">{f.size}</td><td className="text-caption text-muted-foreground">{f.hash.length === 12 ? 'sha256 ' + f.hash + '…' : f.hash}</td></tr>
        ))}
      </tbody></table>
      <Section label="Groups" />
      <table className="text-control"><tbody>
        {rec.groups.map(g => (
          <tr key={g.index}>
            <td className="py-0.5 pr-4 text-muted-foreground">group {g.index}</td>
            <td className={cn('pr-4 font-bold', toneText[g.tone])}>{g.name}</td>
            <td className="pr-4 text-right">{g.count} atoms</td>
            <td className="text-caption text-muted-foreground">{g.gmxCount === g.count ? '✓ gmx agrees' : 'gmx: ' + g.gmxCount} · {g.atoms.length > 40 ? g.atoms.slice(0, 40) + '…' : g.atoms}</td>
          </tr>
        ))}
      </tbody></table>
      <div className="flex items-center gap-3">
        <Button onClick={() => onRunAgain(rec)}>run again</Button>
        <span className="text-caption text-muted-foreground">opens this recipe in rdf; the new run gets new names</span>
      </div>
    </div>
  )
}
