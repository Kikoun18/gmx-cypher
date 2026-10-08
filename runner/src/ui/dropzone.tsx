import * as React from "react"

import { cn } from "../lib/utils"

export interface DropzoneProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  /** The way in without dragging: usually a primary Button. */
  action?: React.ReactNode
  /** Called with the dropped files; while files hover, the zone outlines in `ring`. */
  onFiles?: (files: File[]) => void
}

/** The empty state that is also a drop target — one per screen. */
function Dropzone({ title, description, action, onFiles, className, ...props }: DropzoneProps) {
  const [over, setOver] = React.useState(false)
  const files = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")
  return (
    <div
      data-slot="dropzone"
      data-dragging={over || undefined}
      onDragOver={(e) => {
        if (!onFiles || !files(e)) return
        e.preventDefault()
        if (!over) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!onFiles || !files(e)) return
        e.preventDefault()
        setOver(false)
        onFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(
        "flex w-full max-w-[560px] flex-col items-start gap-3.5 rounded-2xl border-2 border-dashed border-input bg-card px-10 py-[46px] text-left transition-[border-color,background-color] duration-[120ms] data-[dragging]:border-ring data-[dragging]:bg-coral-soft",
        className
      )}
      {...props}
    >
      <span className="text-display font-bold">{title}</span>
      {description && <span className="text-prose text-muted-foreground">{description}</span>}
      {action && <span className="flex flex-wrap gap-2">{action}</span>}
    </div>
  )
}

export { Dropzone }
