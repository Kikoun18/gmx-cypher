import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "../lib/utils"

/** A field label in the `label` style: 10px, letter-spaced, uppercase, muted. */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 text-label uppercase text-muted-foreground peer-disabled:opacity-45 group-data-[disabled=true]:opacity-45",
        className
      )}
      {...props}
    />
  )
}

/** Label above control, 5px apart — the codebase's `.fld`. */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn("flex min-w-0 flex-col gap-[5px]", className)} {...props} />
}

/** One line of help under a field; an error under one is a Status (R9c). */
function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-hint"
      className={cn("m-0 text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Label, Field, FieldHint }
