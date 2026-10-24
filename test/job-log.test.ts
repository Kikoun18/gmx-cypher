// A job's log on the page (R12a, review): read from its file while its output streams in, it gets each character once.
import { describe, expect, it } from 'vitest'
import { joinLog, type Log } from '../src/jobs'

const log = (text: string, from = 0): Log => ({ text, from, size: from + text.length })

describe('a job\'s output joins the log read from its file', () => {
  it('table: a chunk it has, one partly in it, the next one, one past a gap', () => {
    const rows: [Log, { s: string; end: number }, Log][] = [
      [log('abcdef'), { s: 'cde', end: 5 }, log('abcdef')],
      [log('abcdef'), { s: 'efgh', end: 8 }, log('abcdefgh')],
      [log('abcdef'), { s: 'gh', end: 8 }, log('abcdefgh')],
      [log('abcdef'), { s: 'xy', end: 10 }, log('abcdef')],
      [log('wxyz', 100), { s: 'z!', end: 105 }, log('wxyz!', 100)],
    ]
    for (const [g, c, want] of rows) expect(joinLog(g, c)).toEqual(want)
  })

  it('the chunks that came while the log was read, applied to it in order, give the whole output once', () => {
    const all = 'Reading frame 0\rReading frame 1\rReading frame 2\nAnalyzed 3 frames\n', cuts = [0, 7, 16, 33, 50, all.length]
    const chunks = cuts.slice(1).map((e, i) => ({ s: all.slice(cuts[i], e), end: e }))
    // The file was read after the second chunk was written, the stream's chunks all came while it was read.
    for (const readAt of cuts) expect(chunks.reduce(joinLog, log(all.slice(0, readAt)))).toEqual(log(all))
  })
})
