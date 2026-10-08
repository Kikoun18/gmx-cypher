import { describe, expect, it } from 'vitest';
import { stableStringify } from '../src/lib/storage/json';
import { formatNote, parseNote } from '../src/lib/storage/notes';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { VaultIO } from '../src/lib/storage/io';
import { readSettings, settingsFiles } from '../src/lib/storage/settings';
import { emptyRow } from '../src/lib/storage/records';
import { DEFAULT_ANALYSES } from '../src/lib/seq';

describe('records JSON', () => {
  it('is stable: sorted keys, 2-space indent, trailing newline, undefined dropped', () => {
    const a = stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } });
    expect(a).toBe('{\n  "a": {\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
    expect(stableStringify({ a: { d: [3, { y: 2, z: 1 }] }, b: 1 })).toBe(a);
  });
  it('round-trips a row record', () => {
    const r = emptyRow('s1', 'WRWYCR');
    r.literature = { o26: [{ id: 'l1', title: 'T', authors: 'A', year: '2007', venue: 'V', doi: '10.1/x', url: '', note: 'n', added: '2026-10-03' }] };
    r.visibility = { o26: { b: 'dim' } };
    expect(JSON.parse(stableStringify(r))).toEqual(r);
  });
});

describe('notes', () => {
  it('round-trips text with frontmatter, including trailing newlines and markdown', () => {
    for (const t of ['plain', 'line1\nline2', 'ends with newline\n', '---\nnot frontmatter\n---', '', '# Heading\n\n- item']) {
      const raw = formatNote({ id: 'n1', type: 'cell-note', owner: 's1', column: 'o26' }, t);
      const p = parseNote(raw);
      expect(p.text).toBe(t);
      expect(p.meta).toEqual({ id: 'n1', type: 'cell-note', owner: 's1', column: 'o26' });
    }
  });
  it('tolerates missing or broken frontmatter', () => {
    expect(parseNote('just text\n')).toEqual({ meta: {}, text: 'just text', hadFrontmatter: false });
    expect(parseNote('---\nid n1 broken\n---\nbody\n').text).toBe('body');
    expect(parseNote('---\nunterminated\nbody').text).toBe('---\nunterminated\nbody');
  });
  it('has no timestamps in frontmatter', () => {
    expect(formatNote({ id: 'n1', type: 'row-note', owner: 's1' }, 'x')).toBe('---\nid: n1\ntype: row-note\nowner: s1\n---\nx\n');
  });
});

describe('settings', () => {
  it('round-trips project settings, analyses and ignored paths', async () => {
    const io = new VaultIO(new MemoryBackend());
    const s = { pattern: '{method}_{column}_{run}_t{time}.xvg', xCol: 1, yCol: 3, temp: '300', hiddenOut: true, analyses: DEFAULT_ANALYSES.slice(0, 2) };
    for (const f of settingsFiles('p1', s, ['a/b.xvg'])) if (f.value != null) await io.writeJson(f.path, f.value);
    const back = await readSettings(io, 'p1');
    expect(back.settings).toMatchObject(s);
    expect(back.ignored).toEqual(['a/b.xvg']);
  });
  it('survives a corrupt settings file with defaults and a warning', async () => {
    const b = new MemoryBackend(), io = new VaultIO(b);
    await b.writeText('.matrix/settings/p1/settings.json', '{ nope');
    const back = await readSettings(io, 'p1');
    expect(back.settings).toEqual({});
    expect(back.warnings.length).toBe(1);
  });
});
