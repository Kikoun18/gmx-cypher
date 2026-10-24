import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "../lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

/** Section header: an uppercase label, a hairline to the edge, then optional trailing content. */
function Section({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { label: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div data-slot="section" className={cn("flex items-center gap-2", className)} {...props}>
      <span className="text-label uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
      {children}
    </div>
  )
}

export { Separator, Section }
