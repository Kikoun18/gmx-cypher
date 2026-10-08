import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asTerminal, gmxError, parseProgress } from '../src/lib/progress';

const fixture = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');
const run = fixture('gmx-2025.4/rdf-run.stderr');

describe('progress from gmx stderr', () => {
  it('reads the last frame and time, and the frames analysed at the end (real 2025.4 run on nvt)', () => {
    expect(parseProgress(run)).toEqual({ frame: 20, time: 20, analysed: { frames: 21, lastTime: 20 } });
  });

  it('reads a run still going, cut anywhere', () => {
    expect(parseProgress(run.slice(0, run.indexOf('Reading frame      13')))).toEqual({ frame: 12, time: 12 });
    // Cut inside frame 12's time ("time   1"): only complete records count.
    expect(parseProgress(run.slice(0, run.indexOf('Reading frame      12') + 30))).toEqual({ frame: 11, time: 11 });
    expect(parseProgress(fixture('gmx-2025.4/check.stderr').split('\n').slice(0, 8).join('\n'))).toEqual({});
  });

  it("gives gmx's own error message, without the frame of the block", () => {
    expect(gmxError(fixture('gmx-2025.4/rdf-badgroup.stderr'))).toBe("Inconsistency in user input:\nInvalid index group reference(s)\n  Cannot match 'group 7', because no such index group can be found.");
    expect(gmxError(fixture('gmx-2025.4/select-beyond.stderr'))).toContain('(largest allowed atom index is\n  3242).');
    expect(gmxError(run)).toBeNull();
  });
});

describe('the log as a terminal shows it', () => {
  it('keeps the last state of each line overwritten with \\r', () => {
    const t = asTerminal(run);
    expect(t).not.toContain('\r');
    expect(t).toContain('Last frame         20 time   20.000');
    expect(t).not.toContain('Reading frame      12');
    expect(t.split('\n')[0]).toBe(run.split('\n')[0]);
  });
});
