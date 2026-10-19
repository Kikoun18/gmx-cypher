// The design contract's checks (docs/design-contract.md §7), each reading its rule from src/core/contract.ts.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLOUR_FILES, INTERNAL_REFERENCE } from '../src/core/contract';
import { RUNNER } from './helpers';
import { stringsOf, uiStrings } from './ui-strings';

describe('no internal reference reaches the page (R3a)', () => {
  it('no string in src/ or server/ names a ticket, a question or a request', () => {
    expect(uiStrings().filter(s => INTERNAL_REFERENCE.test(s.text)).map(s => s.file + ':' + s.line + '  ' + s.text)).toEqual([]);
  });

  it('the scan finds each form in strings, templates and JSX text, and never in comments', () => {
    const src = [
      "const a = 'mislabelled (question 28)' // a comment may say (T35)",
      'const b = <p>legacy tool (T122)</p>',
      'const c = `the status (R9c) ${x} and questions 3 and 4`',
      '/* (question 33) */ const d = "T = 300 K, (T in K)"',
    ].join('\n');
    expect(stringsOf('x.tsx', src).filter(s => INTERNAL_REFERENCE.test(s.text)).map(s => s.line)).toEqual([1, 2, 3, 3]);
  });
});

describe('colours come from the tokens (R4b)', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p.slice(RUNNER.length)]; });
  it('no hex colour in src/ outside tokens.json and the role layer (the generated tokens.css aside)', () => {
    const hits = walk(RUNNER + 'src').filter(f => /\.(tsx?|css|json)$/.test(f) && !COLOUR_FILES.includes(f) && f !== 'src/tokens.css')
      .flatMap(f => readFileSync(RUNNER + f, 'utf8').split('\n').flatMap((l, i) => (/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(l) ? [f + ':' + (i + 1)] : [])));
    expect(hits).toEqual([]);
  });
});

