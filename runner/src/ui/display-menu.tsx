// A 3D view's display menu (R9b): one button, one panel of how the structure is drawn, the same in set-up's picker
// and on each of compare's structures. Esc or a click outside closes it.

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { STYLES, type Style } from "../core/contract"
import { Button } from "./button"
import { ToggleGroup, ToggleGroupItem } from "./toggle-group"

function DisplayMenu({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false), box = React.useRef<HTMLDivElement>(null), id = React.useId()
  React.useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("pointerdown", out)
    return () => document.removeEventListener("pointerdown", out)
  }, [open])
  return (
    <div ref={box} className="relative" onKeyDown={e => { if (open && e.key === "Escape") { e.stopPropagation(); setOpen(false); box.current?.querySelector("button")?.focus() } }}>
      <Button variant="outline" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        display <span className="font-normal text-muted-foreground">· {summary}</span><ChevronDown />
      </Button>
      {open && (
        <div id={id} role="group" aria-label="display" className="absolute left-0 top-full z-20 mt-1 flex w-max max-w-[min(92vw,520px)] flex-col gap-3 rounded-lg border border-border bg-popover p-3 shadow-menu">
          {children}
        </div>
      )}
    </div>
  )
}

/** One setting of the menu: its name above its control. */
function DisplayRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-1.5"><span className="text-label uppercase text-muted-foreground">{label}</span>{children}</div>
}

/** The one style menu (question 17): every name in both renderers; one this renderer can't draw is disabled, with the reason. */
function StyleRow({ value, onChange, cannot = {} }: { value: Style; onChange: (s: Style) => void; cannot?: Partial<Record<Style, string>> }) {
  const reasons = [...new Set(Object.values(cannot))]
  return (
    <DisplayRow label="style">
      <ToggleGroup type="single" size="sm" value={value} onValueChange={v => v && onChange(v as Style)} aria-label="style">
        {STYLES.map(s => <ToggleGroupItem key={s} value={s} disabled={!!cannot[s]}>{s}</ToggleGroupItem>)}
      </ToggleGroup>
      {reasons.map(w => <span key={w} className="max-w-[60ch] text-caption text-muted-foreground">{STYLES.filter(s => cannot[s] === w).join(" and ")}: {w}</span>)}
    </DisplayRow>
  )
}

export { DisplayMenu, DisplayRow, StyleRow }
