// Uploaded Python (batch 3, R3): it runs only in the sandbox page, public/py/sandbox.html, a hidden same-origin frame
// with the strict CSP that starts Pyodide in an opaque-origin worker and removes the deny-list (section 1.4, F93).
// This module creates that frame on the first call and turns calls into messages; each call has a time limit (F94).

export const PY_TIMEOUT = 10_000;

/**
 * Python run once in each fresh worker before any call. `_discover(src)` lists a script's top-level functions from
 * its syntax tree (F89, F90): parameters after x, y with their kinds, defaults and choices, the role from the return
 * annotation, the docstring and its `unit:` line. Nothing in the script runs. `_call` runs one function (R3c) on the
 * points with a value and describes what it returned, for `checkResult` to judge.
 */
export const PY_HELPERS = String.raw`import ast, json, math, re, sys

_KINDS = {'float': (int, float), 'int': (int,), 'bool': (bool,), 'str': (str,)}

def _param(arg, d):
    p, ann = {'name': arg.arg}, arg.annotation
    has = d is not None
    if has:
        try: v = ast.literal_eval(d)
        except Exception: return p, 'the default of ' + arg.arg + ' isn’t a plain value'
    if ann is None:
        kind = 'bool' if has and isinstance(v, bool) else next((k for k in ('int', 'float', 'str') if has and type(v) in _KINDS[k]), None)
        if kind is None: return p, 'parameter ' + arg.arg + ' needs an annotation (float, int, bool, str or Literal[…]) or a default'
    elif isinstance(ann, ast.Name) and ann.id in _KINDS: kind = ann.id
    elif isinstance(ann, ast.Subscript) and ast.unparse(ann.value) in ('Literal', 'typing.Literal'):
        try: c = ast.literal_eval(ann.slice)
        except Exception: c = None
        c = list(c) if isinstance(c, tuple) else [c]
        if not all(type(x) in (str, int, float, bool) for x in c): return p, 'parameter ' + arg.arg + ': ' + ast.unparse(ann) + ' isn’t supported (choices must be plain values)'
        kind, p['choices'] = 'literal', c
    else: return p, 'parameter ' + arg.arg + ': ' + ast.unparse(ann) + ' isn’t supported (float, int, bool, str or Literal[…])'
    p['kind'] = kind
    if has:
        ok = v in p['choices'] if kind == 'literal' else type(v) in _KINDS[kind] and not (kind != 'bool' and isinstance(v, bool))
        if not ok: return p, 'the default of ' + arg.arg + ' doesn’t match its annotation'
        p['default'] = v
    p['required'] = not has
    return p, None

def _discover(src):
    try: tree = ast.parse(src)
    except SyntaxError as e: return json.dumps({'error': 'SyntaxError: ' + str(e.msg) + ' (line ' + str(e.lineno) + ')'})
    except Exception as e: return json.dumps({'error': type(e).__name__ + ': ' + str(e)})
    out = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.name.startswith('_'): continue
        f, problems = {'name': node.name, 'role': None, 'params': []}, []
        ret = ast.unparse(node.returns) if node.returns else ''
        if ret: f['returns'] = ret
        if ret in ('float', 'int'): f['role'] = 'metric'
        elif re.match(r'(typing\.|collections\.abc\.)?(list|tuple|List|Tuple|Sequence)\b', ret): f['role'] = 'transform'
        doc = ast.get_docstring(node)
        if doc:
            f['doc'] = doc
            m = re.search(r'^\s*unit:\s*(.+?)\s*$', doc, re.M)
            if m: f['unit'] = m.group(1)
        if isinstance(node, ast.AsyncFunctionDef): problems.append('async functions aren’t supported')
        a = node.args
        pos = a.posonlyargs + a.args
        if len(pos) < 2: problems.append('needs x and y as its first two parameters')
        defaults = [None] * (len(pos) - len(a.defaults)) + list(a.defaults)
        for arg, d in list(zip(pos, defaults))[2:] + list(zip(a.kwonlyargs, a.kw_defaults)):
            p, problem = _param(arg, d)
            f['params'].append(p)
            if problem: problems.append(problem)
        if problems: f['problem'] = problems[0]
        out.append(f)
    return json.dumps(out, ensure_ascii=False)

def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)): return None, type(v).__name__
    v = float(v)
    return (v if math.isfinite(v) else None), None

def _seq(r):
    out = []
    for i, v in enumerate(r):
        n, bad = _num(v)
        if bad: return None, 'value ' + str(i + 1) + ' is ' + bad + ', not a number'
        out.append(n)
    return out, None

def _answer(src, name, x, y, params):
    ns = {'__name__': '__script__'}
    exec(compile(src, '<script>', 'exec'), ns)
    f = ns.get(name)
    if not callable(f): return json.dumps({'kind': 'missing'})
    r = f(list(x), list(y), **dict(params))
    if isinstance(r, (int, float)) and not isinstance(r, bool): return json.dumps({'kind': 'number', 'value': _num(r)[0]})
    if isinstance(r, (list, tuple)):
        if len(r) == 2 and all(isinstance(p, (list, tuple)) for p in r):
            a, e1 = _seq(r[0])
            b, e2 = _seq(r[1])
            return json.dumps({'kind': 'pair', 'bad': e1 or e2} if e1 or e2 else {'kind': 'pair', 'x': a, 'y': b})
        a, e = _seq(r)
        return json.dumps({'kind': 'list', 'bad': e} if e else {'kind': 'list', 'y': a})
    return json.dumps({'kind': 'other', 'type': type(r).__name__})

def _isolation():
    # What every call starts from: the modules loaded now and what is in them. A call may change a module
    # (statistics.mean = …, json.dumps = …) or import new ones; afterwards both are put back, so no call can change
    # another's result (determinism, section 1.3). The app's own globals stay; nothing else in __main__ is removed.
    modules, main, missing = sys.modules, sys.modules['__main__'], object()
    snap = [(k, m, dict(m.__dict__)) for k, m in list(modules.items()) if getattr(m, '__dict__', None) is not None]
    keep = {k for k, _, _ in snap}
    def restore():
        for k in [k for k in modules if k not in keep]: del modules[k]
        for k, m, d in snap:
            modules[k] = m
            md = m.__dict__
            if m is not main:
                for key in [key for key in md if key not in d]: del md[key]
            for key, v in d.items():
                if md.get(key, missing) is not v: md[key] = v
    return restore

def _call(src, name, x, y, params):
    # A fresh namespace for every call, and every module put back afterwards (_isolation).
    try: return _answer(src, name, x, y, params)
    finally: _restore()

_restore = _isolation()
`;

type Reply = { id: number; ok: true; value: string } | { id: number; ok: false; error: string };
let frame: HTMLIFrameElement | null = null, ready: Promise<string> | null = null, seq = 0;
const waiting = new Map<number, (r: Reply) => void>();

/** Starts the sandbox once; resolves with the Python version (shown with every result, section 1.3). */
export function pythonReady(): Promise<string> {
  if (ready) return ready;
  ready = new Promise<string>((ok, fail) => {
    const f = (frame = document.createElement('iframe'));
    f.src = new URL('py/sandbox.html', document.baseURI).href;
    f.hidden = true;
    f.title = 'Python sandbox';
    addEventListener('message', e => {
      if (e.source !== f.contentWindow || e.origin !== location.origin) return;
      const d = e.data;
      if (d?.kind === 'ready') ok(d.version);
      else if (d?.kind === 'failed') fail(new Error(d.error));
      else if (typeof d?.id === 'number') { waiting.get(d.id)?.(d); waiting.delete(d.id); }
    });
    f.addEventListener('load', () => f.contentWindow!.postMessage({ kind: 'init', helpers: PY_HELPERS }, location.origin));
    document.body.appendChild(f);
  });
  ready.catch(() => { ready = null; frame?.remove(); frame = null; });
  return ready;
}

/**
 * Runs Python `code`, whose last expression is a JSON string, with `vars` as globals (converted to Python values).
 * Resolves with the parsed value; rejects with Python's own message, or with the time limit's.
 */
export async function runPython(code: string, vars: Record<string, unknown> = {}, timeoutMs = PY_TIMEOUT): Promise<unknown> {
  await pythonReady();
  const id = ++seq;
  const r = await new Promise<Reply>(ok => { waiting.set(id, ok); frame!.contentWindow!.postMessage({ kind: 'run', id, code, vars, timeoutMs }, location.origin); });
  if (!r.ok) throw new Error(r.error);
  return JSON.parse(r.value);
}
