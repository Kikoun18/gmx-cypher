// The run as the server plans it (POST /api/plan): the exact command, its stdin, its files and what gmx would refuse,
// asked again a moment after the form changes, so what is shown is what runs (T25).
import * as React from 'react'
import { postJson } from './api'

export interface PlanView {
  cwd: string; file: string; argv: string[]; env: Record<string, string>; stdin?: string; problems: string[]; outDir: string; stem: string
  names: { xvg: string; record: string; more?: string[] }
}

export function usePlan(body: object | null) {
  const key = JSON.stringify(body)
  const [p, setP] = React.useState<{ key: string; plan?: PlanView; error?: string } | null>(null)
  React.useEffect(() => {
    if (!body) return
    let alive = true
    const t = setTimeout(() => postJson<PlanView & { error?: string }>('/api/plan', body).then(plan => alive && setP(plan.error ? { key, error: plan.error } : { key, plan }), e => alive && setP({ key, error: (e as Error).message })), 250)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- body is what key says
  return p?.key === key ? p : null
}
