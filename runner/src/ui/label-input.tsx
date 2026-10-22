import * as React from "react"

import { labelFor } from "../lib/labels"
import { Input, type InputProps } from "./input"

/**
 * A group's label field (R11d): what is typed keeps its spaces while the label kept is trimmed, and a label set
 * elsewhere (a saved view opened, R14b) shows here.
 */
function LabelInput({ name, label, onLabel, ...props }: Omit<InputProps, "value" | "defaultValue" | "onChange"> & { name: string; label: string; onLabel: (text: string) => void }) {
  const [text, setText] = React.useState(label)
  if (labelFor(name, text) !== label) setText(label)
  return <Input {...props} value={text} aria-label={props["aria-label"] ?? "label for " + name} onChange={e => { setText(e.target.value); onLabel(e.target.value) }} />
}

export { LabelInput }
