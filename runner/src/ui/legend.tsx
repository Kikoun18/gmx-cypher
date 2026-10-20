// One legend (R8a, contract §3), for a result chart's curves and compare's group chips alike: a click shows this one
// alone (again: all), ⌘/Ctrl-click shows or hides it, hovering one highlights it and dims the others. On a chart,
// "dim" stays in a menu: a curve dimmed for good.

import * as React from "react"
import { legendPick } from "../core/gestures"
import { cn } from "../lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger } from "./select"

function Legend<T extends { key: string; label: string }>({ items, shown, onShown, onHover, dimmed, onDimmed, item, itemClass, itemStyle, label, className }: {
  items: T[]; shown: string[]; onShown: (keys: string[]) => void; onHover?: (key: string | null) => void
  /** The items dimmed from the menu, and setting them (charts). */
  dimmed?: string[]; onDimmed?: (keys: string[]) => void
  item: (it: T, on: boolean) => React.ReactNode; itemClass?: (it: T, on: boolean) => string; itemStyle?: (it: T, on: boolean) => React.CSSProperties
  label: string; className?: string
}) {
  const all = items.map(i => i.key)
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map(it => {
        const on = shown.includes(it.key)
        return (
          <button key={it.key} type="button" aria-pressed={on} title="click: this one alone (again: all) · ⌘-click: show or hide" className={itemClass?.(it, on)} style={itemStyle?.(it, on)}
            onClick={e => onShown(legendPick(all, shown, it.key, e.metaKey || e.ctrlKey))} onMouseEnter={() => onHover?.(it.key)} onMouseLeave={() => onHover?.(null)}>
            {item(it, on)}
          </button>
        )
      })}
      {dimmed && onDimmed && items.length > 1 && (
        <Select value="" onValueChange={k => onDimmed(dimmed.includes(k) ? dimmed.filter(x => x !== k) : [...dimmed, k])}>
          <SelectTrigger size="sm" className="h-6 border-transparent bg-transparent px-1.5 text-caption text-muted-foreground" aria-label={"dim a curve of " + label}>dim{dimmed.length ? " · " + dimmed.length : ""}</SelectTrigger>
          <SelectContent>{items.map(it => <SelectItem key={it.key} value={it.key}>{(dimmed.includes(it.key) ? "undim " : "dim ") + it.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  )
}

export { Legend }
