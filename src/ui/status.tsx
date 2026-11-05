// One status component (R9c, contract §4): a dot and a word in the level's tone, then the text, with an optional "why?"
// that opens the long explanation on hover and on focus. Colour is never the only signal: the word is always there.
// Tones (T218): ok mint, note sky, check butter; an error is `destructive`, which only this component and destructive
// buttons use (T159).

import * as React from "react"
import { STATUS, type Level } from "../core/contract"
import { cn } from "../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/** The text colour of a level, and its dot's: the level's tone, `destructive` for an error. */
export const levelText: Record<Level, string> = { ok: "text-mint-strong", info: "text-sky-strong", warning: "text-butter-strong", error: "text-destructive" }
const levelDot: Record<Level, string> = { ok: "bg-mint-strong", info: "bg-sky-strong", warning: "bg-butter-strong", error: "bg-destructive" }

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
  const body = (
    <>
      <span data-slot="status-dot" aria-hidden className={cn("size-2 shrink-0 self-center rounded-full", levelDot[level])} />
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
