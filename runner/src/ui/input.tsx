import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-input bg-field text-foreground transition-[border-color] duration-[120ms] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive read-only:bg-transparent file:mr-3 file:border-0 file:bg-transparent file:text-control file:font-bold file:text-foreground",
  {
    variants: {
      size: {
        sm: "h-8 px-2.5 text-control",
        default: "h-10 px-3 text-body",
      },
    },
    defaultVariants: { size: "default" },
  }
)

export interface InputProps extends Omit<React.ComponentProps<"input">, "size">, VariantProps<typeof inputVariants> {}

function Input({ className, type, size, ...props }: InputProps) {
  return <input type={type} data-slot="input" className={cn(inputVariants({ size }), className)} {...props} />
}

export { Input, inputVariants }
