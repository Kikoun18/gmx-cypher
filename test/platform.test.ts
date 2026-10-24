import { describe, expect, it } from 'vitest';
import { altName } from '../src/lib/platform';

describe('key names per platform (section 1.2, review)', () => {
  it.each([
    ['MacIntel', 'option'], ['macOS', 'option'], ['iPad', 'option'],
    ['Linux x86_64', 'alt'], ['Win32', 'alt'], ['Windows', 'alt'], ['', 'alt'],
  ])('%s → %s', (platform, name) => expect(altName(platform)).toBe(name));
});
