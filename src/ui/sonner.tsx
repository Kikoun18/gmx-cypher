import * as React from "react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

/**
 * Toasts are small inverted pills at the bottom centre, gone after 1.6 s:
 * `foreground` ground, `background` text, `shadow-toast`.
 */
function Toaster({ toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      duration={1600}
      gap={8}
      offset={22}
      {...props}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          toast:
            "group/toast flex w-fit max-w-[min(420px,calc(100vw-32px))] items-center gap-2.5 rounded-full bg-foreground px-3.5 py-[7px] font-mono text-caption tracking-[0.04em] text-background shadow-toast left-1/2 -translate-x-1/2",
          title: "font-normal",
          description: "text-background/75",
          icon: "flex size-3.5 items-center justify-center [&_svg]:size-3.5",
          actionButton:
            "ml-1 rounded-full bg-primary px-2.5 py-0.5 text-caption font-bold text-primary-foreground hover:brightness-[1.08]",
          cancelButton: "ml-1 rounded-full px-2 py-0.5 text-caption text-background/75 hover:text-background",
          // Pastels read on the dark pill (light theme); their inks on the light pill (dark theme).
          success: "[&_[data-icon]]:text-mint dark:[&_[data-icon]]:text-mint-foreground",
          error: "[&_[data-icon]]:text-rose dark:[&_[data-icon]]:text-rose-foreground",
          warning: "[&_[data-icon]]:text-butter dark:[&_[data-icon]]:text-butter-foreground",
          info: "[&_[data-icon]]:text-sky dark:[&_[data-icon]]:text-sky-foreground",
          ...toastOptions?.classNames,
        },
      }}
    />
  )
}

/** A static toast pill, for layouts and docs (Toaster renders the live ones). */
function ToastPill({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toast"
      className={[
        "inline-flex items-center gap-2.5 rounded-full bg-foreground px-3.5 py-[7px] text-caption tracking-[0.04em] text-background shadow-toast",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export { Toaster, ToastPill, toast }
