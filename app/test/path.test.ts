import { describe, expect, it } from 'vitest';
import { conflictName, idDirName, idOfDirName, isConflictCopy, nameKey, safeFileName, slugify, stamp, uniqueName, SLUG_MAX, FILE_NAME_MAX } from '../src/lib/storage/path';

describe('slugify', () => {
  it.each([
    ['WRWYCR', 'wrwycr'],
    ['Hello World', 'hello-world'],
    ['  trailing dots...  ', 'trailing-dots'],
    ['a<b>c:d"e/f\\g|h?i*j', 'a-b-c-d-e-f-g-h-i-j'],
    ['tab\tand\u0001control', 'tab-and-control'],
    ['Kryštof', 'kryštof'],
    ['Kryštof', 'kryštof'], // NFD → NFC
    ['α-L-Rha', 'α-l-rha'],
    ['CON', '_con'],
    ['lpt9', '_lpt9'],
    ['com1', '_com1'],
    ['', 'untitled'],
    ['…!!!', 'untitled'],
    ['🙂', 'untitled'],
  ])('%j → %j', (input, out) => { expect(slugify(input)).toBe(out); });

  it('caps the length without leaving a dangling dash', () => {
    const s = slugify('chondroitin sulfate a and c and more words');
    expect(Array.from(s).length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('idDirName / idOfDirName', () => {
  it('appends and recovers the stable id', () => {
    const n = idDirName('WRWYCR', 'smn8f3ka8');
    expect(n).toBe('wrwycr--smn8f3ka8');
    expect(idOfDirName(n)).toBe('smn8f3ka8');
    expect(idOfDirName('stale-old-name--smn8f3ka8')).toBe('smn8f3ka8');
    expect(idOfDirName('_sequences')).toBeNull();
    expect(idOfDirName('a--b--c')).toBe('c');
  });
  it('refuses ids that are unsafe in a path', () => {
    expect(() => idDirName('x', '../etc')).toThrow();
    expect(() => idDirName('x', 'a/b')).toThrow();
  });
});

describe('safeFileName', () => {
  it.each([
    ['hmrfast6_ha_a_t200000.xvg', 'hmrfast6_ha_a_t200000.xvg'],
    ['model:v2?.pdb', 'model_v2_.pdb'],
    ['trailing. ', 'trailing'],
    ['.hidden', 'hidden'],
    ['CON.xvg', '_CON.xvg'],
    ['aux', '_aux'],
    ['note.md', 'note (upload).md'],
    ['x.crswap', 'x (upload).crswap'],
    ['', 'file'],
    ['   ', 'file'],
    ['Kryštof.gro', 'Kryštof.gro'],
  ])('%j → %j', (input, out) => { expect(safeFileName(input)).toBe(out); });

  it('keeps the extension when shortening', () => {
    const n = safeFileName('a'.repeat(200) + '.xvg');
    expect(n.endsWith('.xvg')).toBe(true);
    expect(Array.from(n).length).toBeLessThanOrEqual(FILE_NAME_MAX);
  });
});

describe('uniqueName', () => {
  it('adds (2), (3)… and compares case-insensitively in NFC', () => {
    expect(uniqueName('model.pdb', [])).toBe('model.pdb');
    expect(uniqueName('model.pdb', ['MODEL.PDB'])).toBe('model (2).pdb');
    expect(uniqueName('model.pdb', ['model.pdb', 'model (2).pdb'])).toBe('model (3).pdb');
    expect(uniqueName('Kryštof.gro', ['kryštof.gro'])).toBe('Kryštof (2).gro');
    expect(uniqueName('note.md', [])).toBe('note (2).md');
    expect(nameKey('ABC')).toBe(nameKey('abc'));
  });
});

describe('timestamps and conflict copies', () => {
  it('formats a filesystem-safe UTC stamp', () => {
    expect(stamp(new Date('2026-10-03T02:43:00.123Z'))).toBe('20261003T024300Z');
  });
  it('names conflict copies recognisably', () => {
    const n = conflictName('note.md', new Date('2026-10-03T02:43:00Z'));
    expect(n).toBe('note.conflict-20261003T024300Z.md');
    expect(isConflictCopy(n)).toBe(true);
    expect(isConflictCopy('note.md')).toBe(false);
  });
});
