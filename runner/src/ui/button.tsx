import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-md text-control transition-[background-color,border-color,color,filter] duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary font-bold tracking-[0.03em] text-primary-foreground hover:brightness-[1.08]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_7%)]",
        outline: "border border-input bg-transparent text-foreground hover:bg-accent aria-expanded:border-ring",
        ghost: "bg-transparent text-foreground hover:bg-accent",
        dashed:
          "border border-dashed border-input bg-transparent text-muted-foreground hover:border-ring hover:text-coral-strong",
        destructive:
          "border border-destructive/45 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground",
        link: "h-auto px-0 text-coral-strong underline-offset-[3px] hover:underline",
      },
      size: {
        sm: "h-[26px] rounded-sm px-2.5 text-caption",
        default: "h-8 px-[13px]",
        lg: "h-10 px-[18px]",
        icon: "size-[34px] rounded-full [&_svg:not([class*='size-'])]:size-[15px]",
        "icon-sm": "size-[26px] rounded-full [&_svg:not([class*='size-'])]:size-3",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default", shape: "default" },
  }
)

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({ className, variant, size, shape, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
