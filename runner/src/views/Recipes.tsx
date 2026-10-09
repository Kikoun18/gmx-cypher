import * as React from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { FieldHint } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { getJson, postJson } from '../api'
import type { Draft } from '../draft'
import { draftFromRecipe, recipeFileProblems, recipeFromDraft, recipeId, type Recipe } from '../lib/recipe'

/** Recipes (R7a): this run's options, groups and names saved under a name, loaded again, exported and imported as JSON. */
export function Recipes({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const [list, setList] = React.useState<{ id: string; name: string; saved: string }[]>([])
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState('')
  // A taken name arms the save button: the second click replaces the saved recipe (review finding 11).
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) }, [armed])
  const fileRef = React.useRef<HTMLInputElement>(null)
  const refresh = React.useCallback(() => { getJson<typeof list>('/api/recipes').then(setList, () => {}) }, [])
  React.useEffect(refresh, [refresh])
  const apply = (r: Recipe, how: string) => { setDraft(d => draftFromRecipe(r, d)); setName(r.name); setError(''); toast('✓ ' + how + ' ' + r.name + ': its groups and options are in the form') }
  const save = async (r: Recipe, replace = false) => {
    // A taken name is known from the list, so the usual case asks nothing of the server; its 409 stays for a race.
    const taken = !replace && list.find(x => x.id === recipeId(r.name))
    if (taken) { setError('a recipe named "' + taken.name + '" is saved already: click save again to replace it'); setArmed(true); return false }
    try { await postJson('/api/recipes' + (replace ? '?replace=1' : ''), r); refresh(); setError(''); setArmed(false); return true }
    catch (e) {
      const taken = (e as { status?: number }).status === 409
      setError((e as Error).message + (taken ? ': click save again to replace it' : '')); setArmed(taken); return false
    }
  }
  const load = async (id: string) => { try { apply(await getJson<Recipe>('/api/recipes/' + encodeURIComponent(id)), 'loaded') } catch (e) { setError((e as Error).message) } }
  const exportIt = () => {
    const r = recipeFromDraft(draft, name.trim() || 'recipe'), url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2) + '\n'], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = (name.trim() || 'recipe').replace(/[^\w.+-]+/g, '_') + '.recipe.json'; a.click()
    URL.revokeObjectURL(url)
  }
  const importIt = async (f: File) => {
    try {
      const r = JSON.parse(await f.text()), problems = recipeFileProblems(r)
      if (problems.length) { setError(f.name + ': ' + problems.join('; ')); return }
      apply(r, 'imported')
      await save(r)
    } catch { setError(f.name + ' is not JSON') }
  }
  return (
    <div className="flex flex-col gap-2">
      <Section label="Recipe" />
      <div className="flex flex-wrap items-center gap-2">
        <Select value="" onValueChange={load}>
          <SelectTrigger size="sm" className="w-44" aria-label="load a recipe" disabled={!list.length}><SelectValue placeholder={list.length ? 'load…' : 'none saved yet'} /></SelectTrigger>
          <SelectContent>{list.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input size="sm" className="w-40" value={name} placeholder="name" aria-label="recipe name" onChange={e => { setName(e.target.value); setArmed(false) }} />
        <Button variant={armed ? 'destructive' : 'outline'} size="sm" disabled={!name.trim()} onClick={async () => { if (await save(recipeFromDraft(draft, name.trim()), armed)) toast('✓ saved recipe ' + name.trim()) }}>{armed ? 'click again to replace' : 'save'}</Button>
        <Button variant="ghost" size="sm" onClick={exportIt} aria-label="export the recipe as JSON"><Download /> export</Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} aria-label="import a recipe from JSON"><Upload /> import</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importIt(f); e.target.value = '' }} />
      </div>
      {error ? <FieldHint error>✗ {error}</FieldHint> : <FieldHint>options, groups (as rules), file name and folder; not the inputs, so one recipe serves other trajectories of the same system</FieldHint>}
    </div>
  )
}
