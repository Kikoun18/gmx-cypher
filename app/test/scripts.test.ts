import { beforeAll, describe, expect, it } from 'vitest';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import * as lib from '../src/lib/seq';
import { PY_HELPERS } from '../src/lib/py';
import { memoryTrust } from '../src/lib/trust';
import { roleOf, signature } from '../src/lib/scripts';
import { sha256Hex } from '../src/lib/storage/json';
import { newFileId } from '../src/lib/storage/files';
import { exportDataset, importAsProject } from '../src/lib/storage/exchange';
import type { Upload } from '../src/lib/storage/plan';
import type { ScriptRef, Store } from '../src/lib/types';
import { fixture, newVault, reopen, text } from './helpers';

// R3b: scripts in the vault, discovered without running them, trusted per SHA-256 in this browser.
// Pyodide runs in Node, so discovery uses the same Python as the sandbox.
let py: PyodideInterface;
beforeAll(async () => { py = await loadPyodide(); await py.runPythonAsync(PY_HELPERS); }, 60000);
const discover = (src: string) => { py.globals.set('src', src); return JSON.parse(py.runPython('_discover(src)')); };

describe('discovery (F89, F90): read from the code, never run', () => {
  it('functions.py: three matrix functions, no parameters, no docs', () => {
    const fns = discover(text(fixture('examples/functions.py')));
    expect(fns.map((f: { name: string; role: string; params: unknown[]; problem?: string }) => [f.name, f.role, f.params.length, f.problem ?? null])).toEqual([
      ['calc_mean', 'metric', 0, null], ['calc_barrier', 'metric', 0, null], ['calc_peak_distance', 'metric', 0, null],
    ]);
  });
  it('parameters after x, y, with kinds, defaults and choices; the role and unit from the code', () => {
    const [f] = discover(`from typing import Literal
def shift(x, y, k: float = 1.5, mode: Literal['bulk', 'peak'] = 'bulk', n: int = 3, flag: bool = False, label: str = 'z', *, need: float) -> list[float]:
    """Moves the curve.

    unit: kJ/mol
    """
    return y
`);
    expect(f).toMatchObject({ name: 'shift', role: 'transform', unit: 'kJ/mol', doc: 'Moves the curve.\n\nunit: kJ/mol' });
    expect(f.params).toEqual([
      { name: 'k', kind: 'float', default: 1.5, required: false },
      { name: 'mode', kind: 'literal', choices: ['bulk', 'peak'], default: 'bulk', required: false },
      { name: 'n', kind: 'int', default: 3, required: false },
      { name: 'flag', kind: 'bool', default: false, required: false },
      { name: 'label', kind: 'str', default: 'z', required: false },
      { name: 'need', kind: 'float', required: true },
    ]);
    expect(f.problem).toBeUndefined();
  });
  it('says what it can’t use, and skips private helpers; nothing in the file runs', () => {
    const fns = discover(`import os
os.system('touch /tmp/never')
def _helper(x, y): return 1
def one(x): return 1
def odd(x, y, cfg: dict = {}) -> float: return 1
def free(x, y, scale=2.0): return 1
async def later(x, y): return 1
`);
    expect(fns.map((f: { name: string; role: string | null; problem?: string }) => [f.name, f.role, f.problem ?? null])).toEqual([
      ['one', null, 'needs x and y as its first two parameters'],
      ['odd', 'metric', 'parameter cfg: dict isn’t supported (float, int, bool, str or Literal[…])'],
      ['free', null, null],
      ['later', null, 'async functions aren’t supported'],
    ]);
    expect(discover('def f(x, y):\n  return (\n')).toEqual({ error: expect.stringMatching(/^SyntaxError/) });
  });
  it('the list shows each signature; the role is yours, else the code’s, else a matrix function', () => {
    const [shift, free] = discover('def shift(x, y, k: float = 1.5, *, mode: str) -> list[float]: return y\ndef free(x, y, s="a"): return 1\n');
    expect([signature(shift), signature(free)]).toEqual(['(x, y, k = 1.5, mode) → list[float]', '(x, y, s = "a")']);
    expect([roleOf(shift), roleOf(free), roleOf(shift, { role: 'metric' }), roleOf(free, { unit: 'nm' })]).toEqual(['transform', 'metric', 'metric', 'metric']);
  });
});

describe('scripts in the vault (R3b)', () => {
  const add = async (s: Store, name: string, bytes: Uint8Array) => {
    const fileId = newFileId(), ref: ScriptRef = { id: 'k' + fileId.slice(1), name, fileId, sha256: await sha256Hex(bytes), fns: {} };
    return { store: lib.addScript(s, ref), ref, uploads: new Map<string, Upload>([[fileId, { blob: new Blob([bytes as Uint8Array<ArrayBuffer>]), name }]]) };
  };
  it('is kept byte for byte in _scripts/, listed in the project record, and comes back on reopen', async () => {
    const { b, svc, pid } = await newVault(), bytes = fixture('examples/functions.py');
    const a = await add(svc.store, 'functions.py', bytes);
    svc.commit(a.store, a.uploads); await svc.flush();
    const rec = JSON.parse(await b.readText('.matrix/records/' + pid + '/project.json'));
    expect([rec.scripts[0].file.kind, rec.scripts[0].file.path.endsWith('/_scripts/functions.py'), rec.scripts[0].file.sha256]).toEqual(['script', true, a.ref.sha256]);
    expect(await sha256Hex(await b.readBytes(rec.scripts[0].file.path))).toBe(a.ref.sha256);
    const again = (await reopen(b)).svc;
    expect(again.store.scripts).toEqual([{ ...a.ref }]);
    expect(again.report.untracked).toEqual([]);
  });
  it('replacing keeps its record and settings and sends the old version to the trash; removing too; restore brings it back', async () => {
    const { svc } = await newVault();
    const a = await add(svc.store, 'functions.py', fixture('examples/functions.py'));
    svc.commit(lib.setScriptFn(a.store, a.ref.id, 'calc_mean', { unit: 'nm' }), a.uploads); await svc.flush();
    const changed = new TextEncoder().encode(text(fixture('examples/functions.py')) + '\n# changed\n');
    const b2 = await add(svc.store, 'functions.py', changed);
    svc.commit(lib.replaceScript(svc.store, a.ref.id, b2.ref), b2.uploads); await svc.flush();
    expect(svc.store.scripts!.map(k => [k.id, k.fileId, k.sha256, k.fns])).toEqual([[a.ref.id, b2.ref.fileId, b2.ref.sha256, { calc_mean: { unit: 'nm' } }]]);
    expect((await svc.listTrash()).map(t => t.manifest?.label)).toEqual(['Script functions.py']);
    svc.commit(lib.removeScript(svc.store, a.ref.id)); await svc.flush();
    expect([svc.store.scripts ?? [], (await svc.listTrash()).length]).toEqual([[], 2]);
    const shaOf = (t: { manifest: { records: unknown } | null }) => (t.manifest?.records as { script?: { file: { sha256: string } } })?.script?.file.sha256;
    const item = (await svc.listTrash()).find(t => shaOf(t) === b2.ref.sha256)!;
    expect((await svc.restore(item)).where).toBe('original');
    expect(svc.store.scripts!.map(k => [k.id, k.sha256, k.fns])).toEqual([[a.ref.id, b2.ref.sha256, { calc_mean: { unit: 'nm' } }]]);
    // The older version comes back beside it, as its own record (it can't take the same ID).
    expect((await svc.restore((await svc.listTrash())[0])).where).toBe('original');
    expect(svc.store.scripts!.map(k => [k.id === a.ref.id, k.sha256])).toEqual([[true, b2.ref.sha256], [false, a.ref.sha256]]);
    expect(svc.report.untracked).toEqual([]);
  });
  it('a hand-edited scripts list that isn’t a list, or entries without a file, don’t stop the project opening', async () => {
    const { b, pid } = await newVault(), p = '.matrix/records/' + pid + '/project.json', rec = JSON.parse(await b.readText(p));
    await b.writeText(p, JSON.stringify({ ...rec, scripts: { a: 1 } }));
    expect((await reopen(b)).svc.store.scripts).toBeUndefined();
    await b.writeText(p, JSON.stringify({ ...rec, scripts: [null, { id: 'k1' }] }));
    expect((await reopen(b)).svc.store.scripts).toBeUndefined();
  });
  it('discovery is cached by SHA-256; an edit on disk shows as a different SHA-256 (so it won’t run as trusted)', async () => {
    const { b, svc } = await newVault();
    const a = await add(svc.store, 'functions.py', fixture('examples/functions.py'));
    svc.commit(a.store, a.uploads); await svc.flush();
    let calls = 0;
    const d = async (src: string) => { calls++; return discover(src); };
    const first = await svc.scriptInfo(a.ref.fileId, d);
    expect([calls, first.sha256, first.size, first.fns[0].name]).toEqual([1, a.ref.sha256, 977, 'calc_mean']);
    expect((await svc.scriptInfo(a.ref.fileId, d)).fns).toEqual(first.fns);
    expect(calls).toBe(1);
    await b.writeText(svc.fileMeta(a.ref.fileId)!.path, 'def g(x, y): return 1\n');
    const edited = await svc.scriptInfo(a.ref.fileId, d);
    expect([calls, edited.sha256 === a.ref.sha256, edited.fns.map((f: { name: string }) => f.name)]).toEqual([2, false, ['g']]);
  });
  it('export v7 carries the script’s original; the import keeps it', async () => {
    const { svc } = await newVault(), bytes = fixture('examples/functions.py');
    const a = await add(svc.store, 'functions.py', bytes);
    svc.commit(a.store, a.uploads); await svc.flush();
    const { text: json } = await exportDataset(svc.store, { project: 'P', settings: {}, src: { read: f => svc.readUpload(f), meta: f => svc.fileMeta(f) } });
    const prep = await importAsProject(json);
    const k = prep.store.scripts![0];
    expect([k.name, k.sha256]).toEqual(['functions.py', a.ref.sha256]);
    expect(await sha256Hex(new Uint8Array(await prep.uploads.get(k.fileId)!.blob.arrayBuffer()))).toBe(a.ref.sha256);
    // A new record, so trust is asked again (F96); its settings come along.
    expect(k.id).not.toBe(a.ref.id);
  });
});

describe('trust (F96): per script record and SHA-256, for this vault folder', () => {
  it('a changed byte, a copied vault or an imported record asks again', async () => {
    const t = memoryTrust(), folder = {}, copy = {};
    const key = { sha256: 'aa', scriptId: 'k1', vaultId: 'v1', folder };
    expect(await t.has(key)).toBe(false);
    await t.add(key);
    expect(await t.has(key)).toBe(true);
    expect(await t.has({ ...key, sha256: 'ab' })).toBe(false);
    expect(await t.has({ ...key, folder: copy })).toBe(false);
    expect(await t.has({ ...key, scriptId: 'k2' })).toBe(false);
  });
});
