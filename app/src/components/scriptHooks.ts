import { useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { roleOf, type Discovery, type ScriptFn } from '../lib/scripts';
import type { ScriptRef } from '../lib/types';

export type ScriptInfo = { source: string; sha256: string; fns: Discovery };

/** The project's scripts with what discovery found (cached by SHA-256) and whether each is trusted in this browser. */
export function useScripts() {
  const { store, scriptInfo, trust } = useApp();
  const [infos, setInfos] = useState<Record<string, ScriptInfo>>({});
  const [trusted, setTrusted] = useState<Record<string, boolean>>({});
  const asked = useRef(new Set<string>()), trustSeen = useRef<object | null>(null);
  const scripts = store.scripts;
  useEffect(() => {
    // Trust given anywhere (a new trust object): ask again.
    if (trustSeen.current !== trust) { trustSeen.current = trust; for (const k of [...asked.current]) if (k.includes('|')) asked.current.delete(k); }
    for (const k of scripts || []) {
      if (!asked.current.has(k.fileId)) { asked.current.add(k.fileId); scriptInfo(k.fileId).then(i => setInfos(m => ({ ...m, [k.fileId]: i })), () => {}); }
      const tk = k.id + '|' + k.sha256;
      if (!asked.current.has(tk)) { asked.current.add(tk); trust.has(k.id, k.sha256 || '').then(v => setTrusted(m => ({ ...m, [tk]: v }))); }
    }
  }, [scripts, scriptInfo, trust]);
  /** The usable functions of one role, across scripts. */
  const fnsOf = (role: 'metric' | 'transform'): { k: ScriptRef; f: ScriptFn }[] =>
    (scripts || []).flatMap(k => { const fns = infos[k.fileId]?.fns; return Array.isArray(fns) ? fns.filter(f => !f.problem && roleOf(f, k.fns[f.name]) === role).map(f => ({ k, f })) : []; });
  const isTrusted = (k: ScriptRef) => !!trusted[k.id + '|' + k.sha256];
  const markTrusted = (k: ScriptRef) => setTrusted(m => ({ ...m, [k.id + '|' + k.sha256]: true }));
  return { scripts: scripts || [], infos, fnsOf, isTrusted, markTrusted };
}
