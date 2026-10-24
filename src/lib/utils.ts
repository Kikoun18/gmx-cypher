import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Morpheus adds named text sizes and shadows; tailwind-merge must know them so
// `text-control text-muted-foreground` keeps both (a size and a colour).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["label", "caption", "control", "prose", "body", "heading", "stat", "title", "display"],
      shadow: ["raised", "menu", "dialog", "toast"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
