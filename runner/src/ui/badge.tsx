import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"
import { toneSoft, toneSolid, type Tone } from "../lib/tones"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2 py-px text-[10px] leading-[16px] tracking-[0.08em] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary font-bold text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        destructive: "border-destructive text-destructive",
      },
    },
    defaultVariants: { variant: "outline" },
  }
)

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  /** Colour the badge with a column hue; overrides `variant`. */
  tone?: Tone
  /** `soft` (tint + strong ink, the default) or `solid` (pastel + its ink). */
  appearance?: "soft" | "solid"
  asChild?: boolean
}

function Badge({ className, variant, tone, appearance = "soft", asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span"
  return (
    <Comp
      data-slot="badge"
      className={cn(
        badgeVariants({ variant }),
        tone && (appearance === "solid" ? cn(toneSolid[tone], "font-bold") : toneSoft[tone]),
        className
      )}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
