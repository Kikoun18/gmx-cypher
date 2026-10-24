// One status component (R9c, contract §4): an icon and a word, then the text, with an optional "why?" that opens the
// long explanation on hover and on focus. Colour is never the only signal: ok, note and check are ink; an error is
// `destructive`, which only this component and destructive buttons use (T159).

import * as React from "react"
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react"
import { STATUS, type Level } from "../core/contract"
import { cn } from "../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const ICON: Record<Level, typeof Info> = { ok: CircleCheck, info: Info, warning: TriangleAlert, error: CircleX }

/** The text colour of a level: ink, or `destructive` for an error. */
export const levelText: Record<Level, string> = { ok: "text-foreground", info: "text-foreground", warning: "text-foreground", error: "text-destructive" }

/** The long explanation, behind "why?": on hover and on focus (a HoverCard is never the only way in, so a button). */
function Why({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground underline underline-offset-[3px] hover:text-foreground">why?</button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[420px] whitespace-pre-line text-left">{children}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A status: icon, word (the level's, or one of its own such as "done"), text and an optional why. A line of its own,
 * announced politely when it changes; `inline` for rows and tables, where the list announces nothing.
 */
function Status({ level, word, why, inline, className, children }: { level: Level; word?: string; why?: React.ReactNode; inline?: boolean; className?: string; children?: React.ReactNode }) {
  const Icon = ICON[level]
  const body = (
    <>
      <Icon className="size-3.5 shrink-0 self-center" aria-hidden />
      <b className="font-bold">{word ?? STATUS[level].word}</b>
      {children != null && children !== "" && <span className="min-w-0">{children}</span>}
      {why && <Why>{why}</Why>}
    </>
  )
  return inline
    ? <span data-slot="status" data-level={level} className={cn("inline-flex min-w-0 items-baseline gap-1.5", levelText[level], className)}>{body}</span>
    : <p data-slot="status" data-level={level} role="status" aria-live="polite" className={cn("m-0 flex items-baseline gap-1.5 text-caption", levelText[level], className)}>{body}</p>
}

export { Status }
