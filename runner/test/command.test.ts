import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { commandText, shellQuote } from '../src/lib/command';

const NASTY = ['plain', 'a b', '; rm -rf ~', '$(id)', '`id`', "it's", '"q"', '*', '', 'new\nline', "group 'x'", '-sel', 'group 0'];

describe('the shown command', () => {
  it('leaves plain words alone and quotes the rest', () => {
    expect(shellQuote('rdf/rdf_nvt.xvg')).toBe('rdf/rdf_nvt.xvg');
    expect(shellQuote('group 0')).toBe("'group 0'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('')).toBe("''");
  });

  it('gives back exactly the same arguments when pasted into a POSIX shell (in this test only)', () => {
    const out = execFileSync('/bin/sh', ['-c', "printf '%s\\0' " + NASTY.map(shellQuote).join(' ')], { encoding: 'utf8' });
    expect(out.split('\0').slice(0, -1)).toEqual(NASTY);
  });

  it('is cd to the working directory, then the program and its arguments', () => {
    expect(commandText({ cwd: '/sim/na2so4/nvt', file: '/opt/gmx/bin/gmx_mpi', args: ['rdf', '-ref', 'group 0', '-o', 'rdf/x.xvg'] }))
      .toBe("cd /sim/na2so4/nvt\n/opt/gmx/bin/gmx_mpi rdf -ref 'group 0' -o rdf/x.xvg");
  });
});
