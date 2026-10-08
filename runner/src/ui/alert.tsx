import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] content-start items-start gap-y-0.5 rounded-lg border px-4 py-3 text-control has-[>svg]:grid-cols-[16px_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-px [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        info: "border-sky-strong/30 bg-sky-soft text-sky-strong",
        success: "border-mint-strong/30 bg-mint-soft text-mint-strong",
        warning: "border-butter-strong/30 bg-butter-soft text-butter-strong",
        destructive: "border-destructive/40 bg-coral-soft text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface AlertProps extends React.ComponentProps<"div">, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 min-h-4 font-bold", className)} {...props} />
}

/** Body text stays `foreground` on every tint, so it holds 4.5:1 in both themes. */
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 text-control text-foreground [&_p]:m-0", className)}
      {...props}
    />
  )
}

/** Buttons at the end of an alert or banner. */
function AlertActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-actions" className={cn("col-start-2 mt-2 flex flex-wrap gap-2", className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, AlertActions, alertVariants }
