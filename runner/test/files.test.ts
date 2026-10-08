import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { inside, listFolder, saveUpload } from '../server/files';
import { tmp } from './helpers';

function tree() {
  const root = tmp('root'), outside = tmp('outside');
  mkdirSync(join(root, 'nvt'));
  for (const f of ['nvt.xtc', 'nvt.tpr', 'nvt.gro', 'index.ndx', 'nvt.edr', '.hidden.tpr']) writeFileSync(join(root, 'nvt', f), f);
  writeFileSync(join(outside, 'secret.tpr'), 'secret');
  symlinkSync(outside, join(root, 'escape'));
  symlinkSync(join(outside, 'secret.tpr'), join(root, 'nvt', 'link.tpr'));
  symlinkSync(join(root, 'nvt', 'nvt.tpr'), join(root, 'alias.tpr'));
  return { root, outside };
}

describe('allowed folders', () => {
  it('accepts a path inside an allowed folder, as its real path', () => {
    const { root } = tree();
    expect(inside(join(root, 'nvt', 'nvt.tpr'), [root])).toBe(join(root, 'nvt', 'nvt.tpr'));
    expect(inside(join(root, 'alias.tpr'), [root])).toBe(join(root, 'nvt', 'nvt.tpr'));
  });

  it('refuses .. and symbolic links that lead out, and paths that do not exist', () => {
    const { root, outside } = tree();
    expect(() => inside(join(root, 'nvt', '..', '..'), [root])).toThrow(/outside the allowed folders/);
    expect(() => inside(join(root, 'escape', 'secret.tpr'), [root])).toThrow(/outside the allowed folders/);
    expect(() => inside(join(root, 'nvt', 'link.tpr'), [root])).toThrow(/outside the allowed folders/);
    expect(() => inside(join(outside, 'secret.tpr'), [root])).toThrow(/outside the allowed folders/);
    expect(() => inside(join(root, 'nope.xtc'), [root])).toThrow(/no such file/);
    expect(() => inside(root + '-sibling', [root])).toThrow();
  });

  it('lists GROMACS files with their role, folders first, dot-files and others only counted', () => {
    const { root } = tree();
    const l = listFolder(join(root, 'nvt'), [root]);
    expect(l.entries.map(e => [e.name, e.role])).toEqual([['index.ndx', 'index'], ['nvt.gro', 'structure'], ['nvt.tpr', 'run input'], ['nvt.xtc', 'trajectory']]);
    expect(l.hidden).toBe(2); // nvt.edr, .hidden.tpr; link.tpr leads out and is left out
    expect(l.parent).toBe(root);
    expect(listFolder(root, [root]).parent).toBeNull();
    expect(listFolder(root, [root]).entries.map(e => e.name)).toEqual(['nvt', 'alias.tpr']);
  });
});

describe('uploads', () => {
  it('are stored byte for byte under a new folder, with a safe name, and never overwrite', async () => {
    const home = tmp('home'), bytes = Buffer.from([0, 1, 2, 255, 10, 13]);
    const a = await saveUpload(Readable.from([bytes]), home, 'my run/input?.tpr');
    const b = await saveUpload(Readable.from([bytes]), home, 'my run/input?.tpr');
    expect(a.path).not.toBe(b.path);
    expect(a.path.startsWith(join(home, 'uploads') + '/')).toBe(true);
    expect(a.path.endsWith('/my run_input_.tpr')).toBe(true);
    expect(readFileSync(a.path)).toEqual(bytes);
    expect(a).toMatchObject({ size: 6, sha256: createHash('sha256').update(bytes).digest('hex') });
  });

  it('have no size limit (streamed, never held whole in memory)', async () => {
    const home = tmp('home');
    const big = Readable.from((function* () { for (let i = 0; i < 64; i++) yield Buffer.alloc(1 << 20, i); })());
    expect((await saveUpload(big, home, 'big.xtc')).size).toBe(64 << 20);
  });
});
