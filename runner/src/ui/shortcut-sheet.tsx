// The list of keys (R8b), opened by ? anywhere: made from the registry, grouped by where each key works, with the keys
// as they are bound now. Settings → keyboard changes them.

import * as React from "react"
import { FIXED_KEYS, KEYS } from "../core/contract"
import { keyLabel, type Bindings } from "../lib/shortcuts"
import { browserPlatform } from "../lib/platform"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogHeading, DialogTitle } from "./dialog"
import { Kbd } from "./kbd"
import { Section } from "./separator"

const WHERE = ["anywhere", "structures", "compare", "charts", "fields"]

/** The sheet's lists: each place, its keys and what they do. */
function SheetBody({ bindings, platform = browserPlatform() }: { bindings: Bindings; platform?: string }) {
  const rows = [
    ...KEYS.map(k => ({ where: k.where, keys: [keyLabel(bindings[k.action], platform)], words: k.words, fixed: false })),
    ...FIXED_KEYS.map(k => ({ where: k.where, keys: k.keys, words: k.words, fixed: true })),
  ]
  return (
    <div className="flex flex-col gap-4">
      {WHERE.map(w => (
        <div key={w} className="flex flex-col gap-1.5">
          <Section label={w} />
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            {rows.filter(r => r.where === w).map(r => (
              <React.Fragment key={r.keys.join() + r.words}>
                <dt className="flex items-center gap-1">{r.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</dt>
                <dd className="m-0 text-control">{r.words}{r.fixed && <span className="text-caption text-muted-foreground"> · fixed</span>}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function ShortcutSheet({ open, onOpenChange, bindings }: { open: boolean; onOpenChange: (o: boolean) => void; bindings: Bindings }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>Keys</DialogTitle>
            <DialogDescription>ignored while you type in a field · change them in settings → keyboard</DialogDescription>
          </DialogHeading>
        </DialogHeader>
        <DialogBody><SheetBody bindings={bindings} /></DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export { ShortcutSheet, SheetBody }
