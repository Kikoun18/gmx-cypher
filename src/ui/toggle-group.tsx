import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"
import { toneOn, toneText, type Tone } from "../lib/tones"

const groupVariants = cva("group/toggle-group inline-flex w-fit items-center", {
  variants: {
    variant: {
      // The codebase's Seg: a muted track, 3px inset, 2px between segments.
      segmented: "flex-wrap gap-0.5 rounded-md border border-border bg-muted p-[3px]",
      outline: "gap-2",
    },
  },
  defaultVariants: { variant: "segmented" },
})

const itemVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap text-foreground transition-[background-color,border-color,color] duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        segmented:
          "rounded-[7px] hover:bg-background/70 data-[state=on]:bg-primary data-[state=on]:font-bold data-[state=on]:text-primary-foreground data-[state=on]:shadow-raised",
        outline:
          "rounded-md border border-input hover:bg-accent data-[state=on]:border-ring data-[state=on]:bg-secondary data-[state=on]:font-bold",
      },
      size: {
        sm: "h-[24px] px-3 text-caption tracking-[0.02em]",
        default: "h-[26px] px-3 text-caption",
        lg: "h-[30px] px-3.5 text-control font-bold tracking-[0.04em]",
      },
    },
    defaultVariants: { variant: "segmented", size: "default" },
  }
)

type Ctx = VariantProps<typeof itemVariants>
const ToggleGroupContext = React.createContext<Ctx>({ variant: "segmented", size: "default" })

export type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof itemVariants>

function ToggleGroup({ className, variant, size, children, ...props }: ToggleGroupProps) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant ?? "segmented"}
      className={cn(groupVariants({ variant }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

export interface ToggleGroupItemProps
  extends React.ComponentProps<typeof ToggleGroupPrimitive.Item>,
    VariantProps<typeof itemVariants> {
  /** Colour the item with a column hue: strong ink at rest, the pastel when selected. */
  tone?: Tone
}

function ToggleGroupItem({ className, variant, size, tone, ...props }: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        itemVariants({ variant: ctx.variant ?? variant, size: ctx.size ?? size }),
        tone && cn("font-bold", toneText[tone], toneOn[tone]),
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
