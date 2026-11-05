// GROMACS's own fatal blocks (R5b, check_fatal): with strict mode off a non-zero exit is not enough to stop a system,
// so the block itself is looked for. grompp's "Fatal error: There was 1 error in input file(s)" says nothing, so the
// ERROR block printed above it is quoted too, as the notebook does.

const TAGS = ['Fatal error:', 'Error in user input:']

/** The fatal text of a tool's output (its ERROR block, then the fatal block), or null when there is none. */
export function fatalText(log: string): string | null {
  const text = log.replace(/\r/g, '')
  const at = Math.min(...TAGS.map(t => text.indexOf(t)).filter(i => i >= 0))
  if (!Number.isFinite(at)) return null
  // Each ERROR block before it: its line and the indented lines under it (the notebook cuts at 400 characters).
  const errors = [...text.slice(0, at).matchAll(/^ERROR \d+ \[[^\n]*\n(?: {2}[^\n]*\n)*/gm)].map(m => m[0].trimEnd())
  const detail = errors.length ? errors.join('\n\n') + '\n' : ''
  // The block ends at GROMACS's rule; what follows it is the next program's output.
  const block = text.slice(at).split('\n---')[0].replace(/\nFor more information[\s\S]*$/, '').trim()
  return detail + block
}
