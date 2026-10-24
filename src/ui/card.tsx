import * as React from "react"

import { cn } from "../lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground", className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-heading font-bold", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-caption text-muted-foreground", className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("text-body", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />
}

/** A stat tile: an uppercase label, one number, one line of context. */
function Stat({
  label,
  value,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div
      data-slot="stat"
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3", className)}
      {...props}
    >
      <span className="text-label uppercase text-muted-foreground">{label}</span>
      <span className="text-stat font-bold">{value}</span>
      {hint != null && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, Stat }
