import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />
}

const tabsListVariants = cva("group/tabs-list inline-flex w-fit items-center", {
  variants: {
    variant: {
      // Page bar: text tabs over a hairline, the current one underlined in coral-strong (UI state, T218).
      line: "w-full items-end gap-0.5 overflow-x-auto border-b border-border",
      // Pills with counts, e.g. "PMF 1 · RDF 3": the current one is primary.
      chips: "flex-wrap gap-2",
      // shadcn's own look: a muted track with a raised current tab.
      segmented: "gap-0.5 rounded-md border border-border bg-muted p-[3px]",
      // A tab's second level (T204, your choice after batch 4): a rounded track, the current view a filled pill.
      bar: "max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1",
    },
  },
  defaultVariants: { variant: "line" },
})

export type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>

function TabsList({ className, variant, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant ?? "line"}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex shrink-0 items-baseline justify-center gap-[7px] whitespace-nowrap text-control text-muted-foreground transition-[background-color,border-color,color,box-shadow] duration-[120ms] ease-out hover:text-foreground disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-bold data-[state=active]:text-foreground [&_svg]:size-3.5 [&_svg]:self-center",
        "group-data-[variant=line]/tabs-list:rounded-t-sm group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:pb-[9px] group-data-[variant=line]/tabs-list:pt-2.5 group-data-[variant=line]/tabs-list:hover:bg-accent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-[inset_0_-2px_0_var(--ring)]",
        "group-data-[variant=chips]/tabs-list:h-[30px] group-data-[variant=chips]/tabs-list:items-center group-data-[variant=chips]/tabs-list:rounded-full group-data-[variant=chips]/tabs-list:border group-data-[variant=chips]/tabs-list:border-border group-data-[variant=chips]/tabs-list:px-3.5 group-data-[variant=chips]/tabs-list:text-caption group-data-[variant=chips]/tabs-list:text-foreground group-data-[variant=chips]/tabs-list:hover:bg-accent group-data-[variant=chips]/tabs-list:data-[state=active]:border-transparent group-data-[variant=chips]/tabs-list:data-[state=active]:bg-primary group-data-[variant=chips]/tabs-list:data-[state=active]:text-primary-foreground",
        "group-data-[variant=bar]/tabs-list:h-8 group-data-[variant=bar]/tabs-list:items-center group-data-[variant=bar]/tabs-list:rounded-lg group-data-[variant=bar]/tabs-list:px-3.5 group-data-[variant=bar]/tabs-list:text-caption group-data-[variant=bar]/tabs-list:hover:bg-accent group-data-[variant=bar]/tabs-list:data-[state=active]:bg-background group-data-[variant=bar]/tabs-list:data-[state=active]:shadow-raised",
        "group-data-[variant=segmented]/tabs-list:h-[26px] group-data-[variant=segmented]/tabs-list:items-center group-data-[variant=segmented]/tabs-list:rounded-[7px] group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:text-caption group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-background group-data-[variant=segmented]/tabs-list:data-[state=active]:shadow-raised",
        className
      )}
      {...props}
    />
  )
}

/** A count after a tab's name: "All sequences 12". */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="tabs-count" className={cn("text-[10px] font-normal", className)} {...props} />
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />
}

/**
 * A tab's second level (T204): a rounded bar of its views under the page's tabs, the current one a filled pill, each
 * with an optional count, and the view it shows as the panel the selected tab controls. `extra` goes beside the bar.
 */
function SubTabs({ value, onValueChange, label, items, extra, children }: {
  value: string; onValueChange: (v: string) => void; label: string
  items: { value: string; label: string; count?: React.ReactNode }[]; extra?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList variant="bar" aria-label={label}>
          {items.map(i => <TabsTrigger key={i.value} value={i.value}>{i.label}{i.count != null && <TabsCount className="text-caption text-muted-foreground">{i.count}</TabsCount>}</TabsTrigger>)}
        </TabsList>
        {extra}
      </div>
      <TabsContent value={value}>{children}</TabsContent>
    </Tabs>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsCount, TabsContent, SubTabs, tabsListVariants }
