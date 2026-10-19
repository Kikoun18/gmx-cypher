// The eight column hues, in palette order. Class strings are written out in full
// so Tailwind sees every one of them.
export const TONES = ["coral", "sky", "mint", "butter", "lilac", "aqua", "rose", "stone"] as const
export type Tone = (typeof TONES)[number]

/** The pastel with its ink: solid chips, selected column chips, bars. */
export const toneSolid: Record<Tone, string> = {
  coral: "bg-coral text-coral-foreground",
  sky: "bg-sky text-sky-foreground",
  mint: "bg-mint text-mint-foreground",
  butter: "bg-butter text-butter-foreground",
  lilac: "bg-lilac text-lilac-foreground",
  aqua: "bg-aqua text-aqua-foreground",
  rose: "bg-rose text-rose-foreground",
  stone: "bg-stone text-stone-foreground",
}

/** The quiet tint with strong ink: badges, soft alerts, tinted rows. */
export const toneSoft: Record<Tone, string> = {
  coral: "bg-coral-soft text-coral-strong",
  sky: "bg-sky-soft text-sky-strong",
  mint: "bg-mint-soft text-mint-strong",
  butter: "bg-butter-soft text-butter-strong",
  lilac: "bg-lilac-soft text-lilac-strong",
  aqua: "bg-aqua-soft text-aqua-strong",
  rose: "bg-rose-soft text-rose-strong",
  stone: "bg-stone-soft text-stone-strong",
}

/** The hue as ink on a neutral surface: column labels, legends. */
export const toneText: Record<Tone, string> = {
  coral: "text-coral-strong",
  sky: "text-sky-strong",
  mint: "text-mint-strong",
  butter: "text-butter-strong",
  lilac: "text-lilac-strong",
  aqua: "text-aqua-strong",
  rose: "text-rose-strong",
  stone: "text-stone-strong",
}

/** Selected state of a toggle-group item in a column's colour. */
export const toneOn: Record<Tone, string> = {
  coral: "data-[state=on]:bg-coral data-[state=on]:text-coral-foreground",
  sky: "data-[state=on]:bg-sky data-[state=on]:text-sky-foreground",
  mint: "data-[state=on]:bg-mint data-[state=on]:text-mint-foreground",
  butter: "data-[state=on]:bg-butter data-[state=on]:text-butter-foreground",
  lilac: "data-[state=on]:bg-lilac data-[state=on]:text-lilac-foreground",
  aqua: "data-[state=on]:bg-aqua data-[state=on]:text-aqua-foreground",
  rose: "data-[state=on]:bg-rose data-[state=on]:text-rose-foreground",
  stone: "data-[state=on]:bg-stone data-[state=on]:text-stone-foreground",
}

/**
 * The reference (T159): ink as an outline, never a tone, so it reads neither as a group nor as a selected toggle
 * (state is an ink fill). Its stored tone stays in records and is simply not drawn.
 */
export const refChip = "border border-foreground bg-transparent text-foreground"
export const refText = "text-foreground"
/** A group's chip and its name's ink: the reference in ink, a selection in its tone. */
export const groupChip = (g: { role?: string; tone: Tone }) => (g.role === "reference" ? refChip : toneSolid[g.tone])
export const groupText = (g: { role?: string; tone: Tone }) => (g.role === "reference" ? refText : toneText[g.tone])

/** CSS colour of a hue's strong ink, for SVG strokes and fills. */
export const toneVar = (t: Tone) => `var(--${t}-strong)`
