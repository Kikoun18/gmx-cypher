// One result page (R9b, contract §5): the actions, then the charts with their stats, then the settings and the groups,
// then where it came from, collapsed. Every result kind and every compare card has these parts, in this order.

import * as React from "react"
import { ChevronRight, Copy } from "lucide-react"
import { toast } from "sonner"
import { shortPath } from "../lib/paths"
import { cn } from "../lib/utils"
import { Button } from "./button"

function ResultPage({ actions, charts, settings, provenance, open, summary = "Provenance · files, command, log", className }: {
  actions: React.ReactNode; charts?: React.ReactNode; settings?: React.ReactNode; provenance: React.ReactNode
  /** Open from the start: while a job runs, its log is what there is to see. */
  open?: boolean; summary?: string; className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      {actions && <div role="toolbar" aria-label="actions" data-landmark="actions" className="flex flex-wrap items-center gap-2">{actions}</div>}
      {charts && <div data-landmark="charts" className="flex min-w-0 flex-col gap-3">{charts}</div>}
      {settings && <div data-landmark="settings" className="flex min-w-0 flex-col gap-2">{settings}</div>}
      <details data-landmark="provenance" open={open} className="group/prov">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-label uppercase text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform duration-[120ms] group-open/prov:rotate-90" aria-hidden />{summary}
        </summary>
        <div className="mt-3 flex min-w-0 flex-col gap-3">{provenance}</div>
      </details>
    </div>
  )
}

/** A path within its allowed folder, and a button that copies the full path. */
function PathText({ path, roots, name, className }: { path: string; roots: string[]; name: string; className?: string }) {
  const copy = () => navigator.clipboard.writeText(path).then(() => toast("the full path of " + name + " copied"), () => toast.error("could not copy: the browser refused; the full path is " + path))
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="truncate" title={path}>{shortPath(path, roots)}</span>
      <Button variant="ghost" size="icon-sm" className="size-6 shrink-0" aria-label={"copy the full path of " + name} onClick={copy}><Copy className="size-3.5" /></Button>
    </span>
  )
}

export { ResultPage, PathText }
