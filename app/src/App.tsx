import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as lib from './lib/seq';
import { download, fileBase, graphName, legendSwatches, renderBatch, renderExport, type MatrixData } from './lib/export';
import { cleanExport, formatHints, type ExportPrefs } from './lib/exportPrefs';
import { deliver, openDest } from './lib/folders';
import { loadPrefs, savePrefs } from './lib/prefs';
import { setLastProject } from './lib/vaultHandles';
import type { Vault } from './lib/storage/vault';
import type { ProjectService, ServiceStatus } from './lib/storage/project';
import type { ProjectRecord } from './lib/storage/records';
import type { Upload } from './lib/storage/plan';
import { newFileId, readLocal } from './lib/storage/files';
import { exportDataset, importAsProject, importInto } from './lib/storage/exchange';
import { parseGmxHeader } from './lib/gmxHeader';
import { filesFromDrop, mapLimit, type PickedFile } from './lib/folderFiles';
import { addStructureFiles } from './lib/structFile';
import { discoverScript, type Discovery } from './lib/scripts';
import { trustFor } from './lib/trust';
import { retryScripts, scriptsIdle, scriptsVersion, setScriptHost, subscribeScripts } from './lib/scriptRuns';
import { batchGraphs, buildGraph, sharedDomain } from './lib/graph';
import { metricUnit, resolveMetric, tileProvenance } from './lib/metrics';
import { groupRows, matrixData as matrixDataOf, matrixTiles, scaleOf, tileKey } from './lib/matrix';
import { MetricPicker } from './components/MetricPicker';
import { pythonReady, runPython } from './lib/py';
import type { Column, Metric, Page, Settings, Store, Vis } from './lib/types';
import { Ctx, pickKey, type App as AppT, type ComparePick, type Sel } from './ctx';
import { DownloadIcon, ExportMenu, GearIcon, pad2, plural, type ExportFormat } from './components/ui';
import { Matrix } from './components/Matrix';
import { UploadDialog } from './components/UploadDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { DetailDialog } from './components/DetailDialog';
import { ColumnDialog, HoverCard, type SacchData } from './components/ColumnDialog';
import { PageBar, PageDialog } from './components/Pages';
import { ProjectMenu, ProjectsDialog, type ProjectOps, type ProjectStats } from './components/Projects';
import { Laser, keyLabel, sameKey } from './components/Laser';
import { exportKeyAction } from './lib/keys';
import { VaultBanner, SaveBadge } from './components/VaultBanner';
import { VaultDialog } from './components/VaultDialog';
import { CompareDialog } from './components/CompareDialog';


// Address bar: #/p/<project>/<page>, so pages behave like web pages — back,
// forward, bookmarks and reloads all land on the same view.
function readHash(): { pid: string | null; page: string | null } {
  const m = /^#\/p\/([^/]+)(?:\/([^/]+))?/.exec(window.location.hash);
  return m ? { pid: decodeURIComponent(m[1]), page: m[2] ? decodeURIComponent(m[2]) : null } : { pid: null, page: null };
}
const hashFor = (pid: string, page: string) => '#/p/' + encodeURIComponent(pid) + '/' + encodeURIComponent(page);
const errText = (e: unknown) => String((e as Error)?.message || e);

export interface AppProps {
  vault: Vault;
  /** Asks for write permission to the vault folder again; true if granted. */
  reconnect?: () => Promise<boolean>;
  /** Back to the vault picker. */
  onLeave: () => void;
  /** Project to open when the address bar doesn't name one. */
  startProject?: string | null;
  /** The JSON viewer on a browser without folder access: nothing is saved. */
  viewer?: boolean;
}

export default function App({ vault, reconnect, onLeave, startProject, viewer }: AppProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  const [stats, setStats] = useState<Record<string, ProjectStats | undefined>>({});
  const [svc, setSvc] = useState<ProjectService | null>(null);
  const svcRef = useRef<ProjectService | null>(null);
  const [store, setStoreState] = useState<Store>(lib.emptyStore);
  const storeRef = useRef(store);
  const setStore = useCallback((s: Store) => { storeRef.current = s; setStoreState(s); }, []);
  const [status, setStatus] = useState<ServiceStatus>({ save: 'saved', error: null, notices: [] });
  const [notesReady, setNotesReady] = useState(false);
  const [opening, setOpening] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [vaultDlg, setVaultDlg] = useState(false);
  const [, setReportTick] = useState(0);
  const bump = useCallback(() => setReportTick(t => t + 1), []);
  const activeId = svc ? svc.pid : '';
  const meta = projects.find(p => p.id === activeId);
  const projectName = meta ? meta.name : '';
  const readOnly = vault.readOnly || !!viewer;

  const [pageId, setPageId] = useState<string>(() => readHash().page || lib.ALL_PAGE);
  const [appSet, setAppSet] = useState<Partial<Settings>>(loadPrefs);
  const appSetRef = useRef(appSet);
  useEffect(() => { appSetRef.current = appSet; }, [appSet]);
  const [raw, setRaw] = useState(false);
  const [fitWell, setFitWell] = useState(true);
  const [sorted, setSorted] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [form, setForm] = useState<lib.UploadForm | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const [anaFocus, setAnaFocus] = useState<string | null>(null);
  const [sacchSel, setSacchSel] = useState<string | null>(null);
  const [sacchData, setSacchData] = useState<Record<string, SacchData>>({});
  const [hover, setHover] = useState<{ k: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [exported, setExported] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pageDlg, setPageDlg] = useState<{ page: Page | null } | null>(null);
  const [projDlg, setProjDlg] = useState<{ create: boolean } | null>(null);
  const [laser, setLaser] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Compare: hold the key, click cells / sequence names, release to see them on one graph.
  const [compareHeld, setCompareHeld] = useState(false);
  // The export key held on the matrix (R8c): clicks pick cells as with compare; `all` while Shift is down too.
  const [exportHold, setExportHold] = useState<{ all: boolean } | null>(null);
  const [picks, setPicks] = useState<ComparePick[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const picked = useMemo(() => new Set(picks.map(pickKey)), [picks]);
  const togglePick = useCallback((p: ComparePick) => {
    setPicks(cur => (cur.some(q => pickKey(q) === pickKey(p)) ? cur.filter(q => pickKey(q) !== pickKey(p)) : cur.concat(p)));
  }, []);
  const importRef = useRef<HTMLInputElement>(null);

  const settings = useMemo(() => lib.mergeSettings(appSet, store.settings), [appSet, store.settings]);
  const dark = settings.dark != null ? !!settings.dark : false;
  // A page id that isn't in this project (deleted, or a stale link) shows All sequences.
  const page = lib.findPage(store, pageId);
  const viewId = page ? page.id : lib.ALL_PAGE;
  // Kept as the same arrays between renders, so memos keyed on them hold (F110).
  const allCols = useMemo(() => lib.getCols({ cols: store.cols }), [store.cols]);
  const cols = useMemo(() => lib.pageCols({ cols: store.cols } as Store, page), [store.cols, page]);
  const types = useMemo(() => lib.getAnalyses(settings), [settings]);
  const pmfT = useMemo(() => lib.pmfTransform(settings), [settings]);
  // Script answers arriving (R3c) redraw whatever used them.
  const scriptsV = useSyncExternalStore(subscribeScripts, scriptsVersion);
  // The matrix metric (R4a, F97): Area, Min or one of the project's definitions, remembered per page; "all sequences"
  // keeps its own in the project settings. Places that only know PMF's built-ins get Area or Min.
  const metricDef = useMemo(() => resolveMetric(page ? page.metric ?? settings.metric : settings.metric, settings), [page, settings]);
  const metric: Metric = metricDef.id === 'min' ? 'min' : 'area';
  const hue = useCallback((c: { light: string; dark: string }) => (dark ? c.dark : c.light), [dark]);
  const colOf = useCallback((k: string): Column => allCols.find(c => c.k === k) || { k, label: k, name: k, short: k, light: '#5c5550', dark: '#b0a79f' }, [allCols]);
  const skip: lib.SkipFn = useMemo(() => (settings.hiddenOut ? (s, r) => store.vis[lib.slotKey(s.id, r.sacch, r.run)] === 'off' : null), [settings.hiddenOut, store.vis]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { fetch('./sacch.json').then(r => r.json()).then(setSacchData).catch(() => setSacchData({})); }, []);

  // --- persistence: every change goes to the project service, which writes the vault ---
  const commit = useCallback((next: Store, uploads?: Map<string, Upload>) => {
    setStore(next);
    svcRef.current?.commit(next, uploads);
  }, [setStore]);
  const mutate = useCallback((f: (s: Store) => Store) => commit(f(storeRef.current)), [commit]);
  const setSetting = useCallback((patch: Partial<Settings>) => {
    const { project, app } = lib.splitSettings(patch);
    if (Object.keys(app).length) { const n = { ...appSetRef.current, ...app }; appSetRef.current = n; savePrefs(n); setAppSet(n); }
    if (Object.keys(project).length) mutate(s => ({ ...s, settings: { ...(s.settings || {}), ...project } }));
  }, [mutate]);
  const setVis = useCallback((pairs: [string, Vis][]) => {
    mutate(cur => {
      const vis = { ...cur.vis };
      for (const [k, v] of pairs) { if (v === 'on') delete vis[k]; else vis[k] = v; }
      return { ...cur, vis };
    });
  }, [mutate]);
  const readFile = useCallback((fileId: string) => {
    const s = svcRef.current;
    return s ? s.readUpload(fileId) : Promise.reject(new Error('no project open'));
  }, []);
  const findSame = useCallback(async (sha: string) => (svcRef.current ? svcRef.current.findSame(sha) : null), []);
  const provenance = useCallback(async (fileId: string) => (svcRef.current ? svcRef.current.provenance(fileId) : null), []);
  const previewSave = useCallback(async (next: Store) => (svcRef.current ? svcRef.current.previewPlan(next) : { moves: [], trashed: [] }), []);
  const loadAnalysis = useCallback(async (id: string) => { const s = svcRef.current; if (s) await s.loadAnalysis(id); }, []);
  const scriptInfo = useCallback((fileId: string) => {
    const s = svcRef.current;
    return s ? s.scriptInfo<Discovery>(fileId, discoverScript) : Promise.reject(new Error('no project open'));
  }, []);
  // A new object whenever trust is given, so every place that shows trust asks again (F138).
  const [trustV, setTrustV] = useState(0);
  const trust = useMemo(() => {
    void trustV;
    const { trust: t, folder } = trustFor(vault.backend), key = (scriptId: string, sha256: string) => ({ scriptId, sha256, vaultId: vault.manifest.vaultId, folder });
    return { has: (id: string, sha: string) => t.has(key(id, sha)), add: async (id: string, sha: string) => { await t.add(key(id, sha)); retryScripts(); setTrustV(v => v + 1); } };
  }, [vault, trustV]);
  // Script calls for the open project (R3c): trusted scripts only, answers kept in the vault's cache.
  useEffect(() => {
    if (!svc) return;
    setScriptHost({
      scripts: () => storeRef.current.scripts || [],
      info: fileId => svc.scriptInfo<Discovery>(fileId, discoverScript),
      trusted: trust.has, run: runPython, python: pythonReady,
      load: () => svc.scriptValues(), save: e => svc.saveScriptValues(e),
    });
    return () => setScriptHost(null);
  }, [svc, trust]);

  // --- projects & pages navigation -------------------------------------------------
  const resetView = useCallback(() => { setSel(null); setForm(null); setSacchSel(null); setHover(null); setPageDlg(null); setMenu(false); }, []);
  const refreshProjects = useCallback(async () => {
    const list = await vault.listProjects();
    setProjects(list);
    projectsRef.current = list;
    const st: Record<string, ProjectStats> = {};
    for (const p of list) st[p.id] = await vault.projectStats(p.id).catch(() => ({ seqs: 0, runs: 0, pages: 0 }));
    setStats(st);
    return list;
  }, [vault]);
  const openProject = useCallback(async (pid: string, toPage: string = lib.ALL_PAGE) => {
    const old = svcRef.current;
    if (old && old.pid === pid) { setPageId(toPage); return; }
    setOpening(true);
    try {
      if (old) { svcRef.current = null; await old.close(); }
      const s = await vault.openProject(pid);
      svcRef.current = s;
      s.onStatus(st => { if (svcRef.current === s) setStatus(st); });
      s.onStore(patch => {
        if (svcRef.current !== s) return;
        setStore(patch(storeRef.current));
        if (s.notesLoaded) { s.notesMerged(); setNotesReady(true); }
        bump();
      });
      setStore(s.store);
      setNotesReady(s.notesLoaded);
      if (s.notesLoaded) s.notesMerged();
      setSvc(s);
      setPageId(toPage);
      resetView();
      if (!viewer) void setLastProject(vault.manifest.vaultId, pid);
      void s.verified.then(() => { if (svcRef.current === s) bump(); });
    } catch (e) { setFatal('Could not open the project: ' + errText(e)); }
    setOpening(false);
  }, [vault, viewer, setStore, resetView, bump]);

  // First project: the one in the address bar, else the last one used, else the first.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      let list = await refreshProjects();
      if (!list.length && !vault.readOnly) { await vault.createProject('My project'); list = await refreshProjects(); }
      if (!list.length) { setFatal('This vault has no projects.'); setOpening(false); return; }
      const h = readHash();
      const pid = (h.pid && list.some(p => p.id === h.pid) ? h.pid : null) || (startProject && list.some(p => p.id === startProject) ? startProject : null) || list[0].id;
      await openProject(pid, h.pid === pid ? h.page || lib.ALL_PAGE : lib.ALL_PAGE);
    })().catch(e => { setFatal(errText(e)); setOpening(false); });
  }, [refreshProjects, openProject, vault, startProject]);

  const leave = useCallback(async () => {
    const s = svcRef.current;
    svcRef.current = null;
    if (s) await s.close();
    onLeave();
  }, [onLeave]);

  const goPage = useCallback((id: string) => { setPageId(id); setSel(null); }, []);

  useEffect(() => {
    if (!activeId) return;
    const want = hashFor(activeId, viewId);
    if (window.location.hash === want) return;
    // The first visit (or a stale link) replaces the entry; later moves push one, like following a link.
    const h = readHash();
    if (!h.pid || (h.pid === activeId && (h.page || lib.ALL_PAGE) !== viewId && (h.page || lib.ALL_PAGE) === pageId)) window.history.replaceState(null, '', want);
    else window.location.hash = want;
  }, [activeId, viewId, pageId]);
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (!h.pid) return;
      if (h.pid !== svcRef.current?.pid) { if (projectsRef.current.some(p => p.id === h.pid)) void openProject(h.pid, h.page || lib.ALL_PAGE); }
      else { setPageId(h.page || lib.ALL_PAGE); setSel(null); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openProject]);

  // Outside edits are picked up on focus; pending writes go out when the tab hides; closing with unsaved work warns.
  useEffect(() => {
    const onFocus = () => { const s = svcRef.current; if (s) s.checkExternal().then(k => { if (k !== 'none') bump(); }, () => {}); };
    const onVis = () => { if (document.visibilityState === 'hidden') svcRef.current?.flush().catch(() => {}); };
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = svcRef.current;
      if (s && s.hasPendingWrites()) { void s.flush().catch(() => {}); e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('beforeunload', onUnload); };
  }, [bump]);

  const blankForm = useCallback((over?: Partial<lib.UploadForm>) => lib.blankUploadForm(settings, cols, over), [settings, cols]);
  const openForm = useCallback((over?: Partial<lib.UploadForm>) => setForm(blankForm(over)), [blankForm]);
  const openSettings = useCallback((focusAnalysis?: string) => { setSetOpen(true); setHover(null); setAnaFocus(focusAnalysis || null); }, []);

  const readFiles = useCallback((list: (File | PickedFile)[], extra?: { existingPath?: string; skipped?: string[] }) => {
    if (!list.length && !extra?.skipped?.length) return;
    (async () => {
      const same = svcRef.current ? await svcRef.current.sameContent() : () => null;
      // A few files at a time, with progress at most every 150 ms, so big folders don't freeze the page.
      let shown = 0;
      setReading({ done: 0, total: list.length });
      const items = await mapLimit(list, 6, async (it): Promise<lib.UploadFile> => {
        const file = it instanceof File ? it : it.file, path = it instanceof File ? undefined : it.path;
        // The picked file itself is kept: the vault stores its bytes unchanged. One read gives text and hash.
        const base = { id: 'f' + Math.random().toString(36).slice(2, 9), file: file.name, blob: file, fileId: newFileId(), ...(path ? { path } : {}), ...(extra?.existingPath ? { existingPath: extra.existingPath } : {}) };
        try {
          const { text, sha256 } = await readLocal(file);
          const t = lib.parseTable(text), sameAs = same(sha256) || undefined;
          return t.n >= 2 ? { ...base, sha256, sameAs, table: t, head: t.head, gmx: parseGmxHeader(text) } : { ...base, sha256, table: null, err: 'no numeric rows' };
        } catch { return { ...base, table: null, err: 'could not read file' }; }
      }, done => { const now = performance.now(); if (now - shown > 150) { shown = now; setReading({ done, total: list.length }); } });
      setReading(null);
      // Added in slices, each planned in its own task, so the first plan of a big folder doesn't block the page.
      for (let i = 0; i < Math.max(1, items.length); i += 500) {
        const part = items.slice(i, i + 500), skipped = i ? [] : extra?.skipped || [];
        setForm(f => { const cur = f || blankForm(); return { ...cur, files: cur.files.concat(part), skipped: (cur.skipped || []).concat(skipped), msg: '', err: false }; });
        if (i + 500 < items.length) await new Promise(r => setTimeout(r, 30));
      }
    })();
  }, [blankForm]);

  // Rows in display order: ranked by mean value, or the page's own order; grouped by method.
  const shownSeqs = useMemo(() => lib.pageSeqs(store, page), [store, page]);
  // One tile per shown cell for the page's metric (R4a); recomputed when script answers arrive (scriptsV, R3c).
  const tiles = useMemo(() => { void scriptsV; return matrixTiles(shownSeqs, cols, metricDef, settings, skip); }, [shownSeqs, cols, metricDef, settings, skip, scriptsV]);
  const { glist, anyGroup, order } = useMemo(() => groupRows(shownSeqs, cols, tiles, sorted), [shownSeqs, cols, tiles, sorted]);
  // Picking a metric remembers it for this page (or for all sequences) and among this browser's recent ones.
  const setMetricId = useCallback((id: string) => {
    if (page) mutate(s => ({ ...s, pages: s.pages.map(p => (p.id === page.id ? { ...p, metric: id } : p)) }));
    setSetting({ ...(page ? {} : { metric: id }), recentMetrics: [id, ...(appSetRef.current.recentMetrics || []).filter(x => x !== id)].slice(0, 6) });
  }, [page, mutate, setSetting]);
  // A metric over another analysis type needs its curves, which otherwise load when a cell opens.
  useEffect(() => {
    if (!svc || metricDef.type === 'pmf') return;
    let live = true;
    void (async () => { for (const r of svc.store.seqs) for (const e of r.extras) if (live && e.type === metricDef.type && e.curves.some(c => c.state === 'pending')) await svc.loadAnalysis(e.id); })();
    return () => { live = false; };
  }, [svc, metricDef.type]);

  // --- keyboard: Esc closes, arrows walk cells / rows / columns, the laser key toggles the pointer ---
  // Exports (R8a): the folder's permission is asked inside the key press or click, then the files are made and sent.
  const exportPrefs = cleanExport(settings.exportPrefs), vaultFolder = (vault.backend as { root?: FileSystemDirectoryHandle }).root ?? null;
  const matrixHints = formatHints(exportPrefs, 'one xmgrace set per column');
  const exportFiles = async (make: (p: ExportPrefs) => Promise<{ name: string; blob: Blob }[]>) => {
    try { const d = await openDest(exportPrefs.dest, vaultFolder); setToast(await deliver(await make(exportPrefs), d)); } catch (e) { setToast(errText(e)); }
  };
  // The matrix value for an export's legend (R8d): the cell's, or each column's for a sequence, with how it was made.
  const valueLines = (id: string, col: string | null): string[] => {
    const s = store.seqs.find(q => q.id === id);
    return !s ? [] : (col ? [col] : cols.map(c => c.k)).flatMap(k => {
      const t = tiles.get(tileKey(id, k));
      return t?.kind === 'value' ? [(col ? '' : colOf(k).label + ' · ') + tileProvenance(s, k, metricDef, t, { st: settings, skip, scripts: store.scripts, short: true })] : [];
    });
  };
  // Released after picking (R8c): each pick's graph with its stored view (visibility, dashes, marks, lines) and today's
  // graph settings (raw view, shared scale, smoothing, colours), its analyses' curves loaded and script answers awaited.
  const exportPicks = async (ps: ComparePick[], all: boolean) => {
    const s = svcRef.current, jobs = s ? batchGraphs(s.store, ps, all, types) : [];
    if (!s || !jobs.length) { setToast(ps.length ? 'nothing to export in the picked cells' : 'no cells picked · hold ' + keyLabel(settings.exportKey) + ', click cells, then release'); return; }
    await exportFiles(async p => {
      for (const q of ps) for (const e of s.store.seqs.find(r => r.id === q.id)?.extras || []) if ((q.col == null || e.sacch === q.col) && e.curves.some(c => c.state === 'pending')) await s.loadAnalysis(e.id);
      const domain = sharedDomain(s.store.seqs, raw ? lib.NONE : pmfT);
      const build = () => jobs.map(j => buildGraph({ store: s.store, sel: j.sel, cols, st: settings, tab: j.tab, raw, fitWell, dark, domain, theme: p.theme }));
      if (s.store.scripts?.length) { build(); await scriptsIdle(); }
      // One file each, one multi-page PDF or one grid figure (R8d), each graph with its legend's matrix value.
      const taken = new Set<string>(), gs = build().flatMap((m, i) => {
        if (!m) return [];
        const sel = jobs[i].sel, vs = p.legendValue ? valueLines(sel.id, sel.mode === 'cell' ? sel.s : null) : [], data = vs.length ? { ...m.data, values: vs } : m.data;
        return [{ data, name: graphName(data, p, p.format, taken, { project: projectName, page: page?.name || '' }) }];
      });
      return renderBatch(gs, p, fileBase((page?.name || projectName) + '-figures'));
    });
  };

  const other = !!(pageDlg || projDlg || vaultDlg);
  const kb = useRef({ sel, sacchSel, form, setOpen, menu, order, cols, settings, picks, compareHeld, compareOpen, exportHold, other });
  const exportPicksRef = useRef(exportPicks);
  useEffect(() => { kb.current = { sel, sacchSel, form, setOpen, menu, order, cols, settings, picks, compareHeld, compareOpen, exportHold, other }; exportPicksRef.current = exportPicks; });
  const exportShown = useRef<(() => void) | null>(null), setExportShown = useCallback((run: (() => void) | null) => { exportShown.current = run; }, []);
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!t && (/TEXTAREA|INPUT|SELECT/.test((t as HTMLElement).tagName) || (t as HTMLElement).isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      const k = kb.current;
      if (e.key === 'Escape') {
        if (k.menu) { setMenu(false); return; }
        setSel(null); setForm(null); setSacchSel(null); setSetOpen(false); setPageDlg(null); setProjDlg(null); setVaultDlg(false);
        setCompareOpen(false); setCompareHeld(false); setExportHold(null); setPicks([]);
        return;
      }
      // The export key in a graph or Compare (not under Settings or the upload form): export it as shown (R8b);
      // held on the bare matrix: pick cells, then release (R8c).
      const inGraph = (k.sel || k.compareOpen) && !k.form && !k.setOpen, onMatrix = !k.sel && !k.compareOpen && !k.form && !k.setOpen && !k.sacchSel && !k.menu && !k.other;
      const act = exportKeyAction(e, typing(e.target), k.settings, inGraph ? 'graph' : onMatrix ? 'matrix' : 'other');
      if (act === 'export') { e.preventDefault(); exportShown.current?.(); return; }
      if (act === 'pick' && !k.compareHeld) { e.preventDefault(); if (!k.exportHold) { setPicks([]); setHover(null); setExportHold({ all: e.shiftKey }); } return; }
      if (k.exportHold && (e.key === 'Shift' || sameKey(e.key, k.settings.exportKey))) { e.preventDefault(); if (e.key === 'Shift') setExportHold({ all: true }); return; }
      if (typing(e.target)) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && sameKey(e.key, k.settings.laserKey)) {
        e.preventDefault();
        if (e.repeat) return;
        if (k.settings.laserMode === 'hold') setLaser(true);
        else setLaser(v => { setToast(v ? 'laser off' : 'laser on · ' + keyLabel(k.settings.laserKey) + ' to turn off'); return !v; });
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && sameKey(e.key, k.settings.compareKey)) {
        e.preventDefault();
        if (e.repeat || k.compareHeld) return;
        // Picking happens on the matrix: dialogs over it step aside while the key is held.
        setSel(null); setSacchSel(null); setHover(null);
        setCompareHeld(true);
        return;
      }
      const ks = k.cols.map(x => x.k);
      const step = (arr: string[], cur: string, right: boolean) => {
        const i = arr.indexOf(cur);
        return i < 0 ? arr[right ? 0 : arr.length - 1] : arr[(i + (right ? 1 : arr.length - 1)) % arr.length];
      };
      if (k.sacchSel) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSacchSel(step(ks, k.sacchSel, e.key === 'ArrowRight')); }
        return;
      }
      const s = k.sel;
      if (!s || k.form || k.setOpen) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (k.order.length) setSel({ ...s, id: step(k.order, s.id, e.key === 'ArrowDown') }); }
      if (s.mode === 'cell' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setSel({ ...s, s: step(ks, s.s, e.key === 'ArrowRight') }); }
    };
    const releaseCompare = () => {
      if (!kb.current.compareHeld) return;
      setCompareHeld(false);
      if (kb.current.picks.length) setCompareOpen(true);
    };
    const releaseExport = () => {
      const h = kb.current.exportHold, ps = kb.current.picks;
      if (!h) return;
      setExportHold(null); setPicks([]);
      void exportPicksRef.current(ps, h.all);
    };
    const onUp = (e: KeyboardEvent) => {
      const st = kb.current.settings;
      if (kb.current.exportHold && e.key === 'Shift') setExportHold({ all: false });
      if (sameKey(e.key, st.exportKey)) releaseExport();
      if (st.laserMode === 'hold' && sameKey(e.key, st.laserKey)) setLaser(false);
      if (sameKey(e.key, st.compareKey)) releaseCompare();
    };
    const onBlur = () => { if (kb.current.settings.laserMode === 'hold') setLaser(false); releaseCompare(); if (kb.current.exportHold) { setExportHold(null); setPicks([]); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), Math.max(1600, toast.length * 50)); return () => clearTimeout(t); }, [toast]);

  const dropOnCell = (rowId: string, col: string, dt: DataTransfer) => {
    setDrag(false);
    const row = storeRef.current.seqs.find(q => q.id === rowId);
    if (!row) return;
    // Entries can only be read during the drop event, so folders are spotted now.
    if (Array.from(dt.items || []).some(it => it.webkitGetAsEntry?.()?.isDirectory)) { setToast('drop folders outside the cells to import them'); return; }
    const files = Array.from(dt.files), structs = files.filter(f => /\.(pdb|ent|gro)$/i.test(f.name)), data = files.filter(f => !structs.includes(f));
    if (structs.length) {
      addStructureFiles(storeRef.current, rowId, structs, { findSame, confirm: m => window.confirm(m) }).then(res => {
        if (res.added.length) commit(res.store, res.uploads);
        setToast([res.added.length ? plural(res.added.length, 'structure') + ' added to ' + row.name : '', res.bad.length ? 'not a .pdb or .gro: ' + res.bad.join(', ') : ''].filter(Boolean).join(' · ') || 'nothing added');
      }).catch(e => setToast(errText(e)));
    }
    if (data.length) { setForm(blankForm(lib.cellForm(row, col))); readFiles(data); }
  };

  const app: AppT = {
    store, settings, dark, cols, allCols, page, projectName, types, metric, metricDef, setMetricId, raw, pmfT, scriptsV, laser, fitWell, skip, hue, colOf,
    commit, mutate, setSetting, setVis, setRaw, setFitWell, setSel, openForm, openSettings, order,
    readFile, previewSave, findSame, provenance, loadAnalysis, scriptInfo, trust, notesReady, readOnly,
    compare: { held: compareHeld || !!exportHold, picked, toggle: togglePick, forExport: !!exportHold }, dropOnCell, exportPrefs, exportFiles, setExportShown, vaultFolder, valueLines,
  };

  // --- project operations ------------------------------------------------------------
  const showErr = (e: unknown) => setToast(errText(e));
  const loadAllAnalyses = async (s: ProjectService) => {
    for (const r of s.store.seqs) for (const e of r.extras) if (e.curves.some(c => c.state === 'pending')) await s.loadAnalysis(e.id);
  };
  const renameTimers = useRef(new Map<string, number>());
  const ops: ProjectOps = {
    ix: { active: activeId, list: projects.map(p => ({ id: p.id, name: p.name, desc: p.desc, created: p.created })) },
    stats,
    open: id => { if (id !== activeId) void openProject(id); },
    create: (name, desc, copyCurrent) => {
      (async () => {
        const cur = storeRef.current;
        const p = await vault.createProject(name, { desc: desc.trim(), ...(copyCurrent ? { cols: lib.getCols(cur), settings: cur.settings ?? {} } : {}) });
        await refreshProjects();
        await openProject(p.id);
      })().catch(showErr);
    },
    // Names update on screen at once; the folder is renamed when typing pauses.
    rename: (id, patch) => {
      setProjects(list => list.map(p => (p.id === id ? { ...p, ...patch } : p)));
      projectsRef.current = projectsRef.current.map(p => (p.id === id ? { ...p, ...patch } : p));
      const timers = renameTimers.current;
      clearTimeout(timers.get(id));
      timers.set(id, window.setTimeout(() => {
        timers.delete(id);
        const p = projectsRef.current.find(x => x.id === id);
        if (!p) return;
        const s = svcRef.current;
        (s && s.pid === id ? s.rename(p.name, p.desc) : vault.renameProject(id, p.name, p.desc)).then(() => refreshProjects()).catch(showErr);
      }, 900));
    },
    duplicate: async id => {
      if (svcRef.current?.pid === id) await svcRef.current.flush();
      const src = projectsRef.current.find(p => p.id === id)!;
      await vault.duplicateProject(id, src.name + ' copy');
      await refreshProjects();
    },
    remove: async id => {
      const s = svcRef.current;
      if (s && s.pid === id) { svcRef.current = null; setSvc(null); await s.close(); }
      await vault.deleteProject(id);
      let list = await refreshProjects();
      if (!list.length) { await vault.createProject('My project'); list = await refreshProjects(); }
      if (!svcRef.current) await openProject(list[0].id);
    },
    exportProject: async id => {
      const active = svcRef.current?.pid === id;
      const s = active ? svcRef.current! : await vault.openProject(id, { notes: 'eager' });
      try {
        await s.flush();
        await s.notesReady;
        await loadAllAnalyses(s);
        const st = active ? storeRef.current : s.store;
        const name = projectsRef.current.find(p => p.id === id)?.name || 'project';
        // The file carries the project's full data settings (defaults filled in) and every original file.
        const { text, missing } = await exportDataset(st, { project: name, settings: lib.splitSettings(lib.mergeSettings(appSetRef.current, st.settings)).project, src: { read: f => s.readUpload(f), meta: f => s.fileMeta(f) } });
        download(new Blob([text], { type: 'application/json' }), fileBase(name) + '.json');
        if (missing.length) setToast('exported without ' + plural(missing.length, 'missing file'));
      } finally { if (!active) await s.close(); }
    },
    importNew: async file => {
      const prep = await importAsProject(await file.text());
      const base = prep.name || file.name.replace(/\.json$/i, '');
      const name = projectsRef.current.some(x => x.name === base) ? base + ' (imported)' : base;
      const p = await vault.createProject(name, { cols: prep.store.cols, settings: prep.store.settings ?? {} });
      await refreshProjects();
      await openProject(p.id);
      const s = svcRef.current;
      if (!s) return;
      commit(prep.store, prep.uploads);
      await s.keepImport(file, file.name);
      if (prep.dropped.length) setToast('imported · skipped ' + prep.dropped.join(', '));
    },
  };

  // --- matrix export --------------------------------------------------------------------
  const scale = useMemo(() => scaleOf(metricDef, tiles), [metricDef, tiles]), mUnit = metricUnit(metricDef, settings), legend = scale.legend(mUnit);
  const matrixData = (): MatrixData | null => (shownSeqs.length ? matrixDataOf({ project: projectName, page, def: metricDef, st: settings, pmfT, cols, glist, anyGroup, tiles, scripts: store.scripts }) : null);
  const exportMatrix = (f: ExportFormat) => {
    const d = matrixData();
    if (d) void exportFiles(async p => [{ name: fileBase(d.file) + '.' + f, blob: await renderExport({ matrix: d }, f, p) }]);
  };

  // --- dataset JSON (this project) ------------------------------------------------------------
  const exportAll = async () => {
    try { await ops.exportProject(activeId); } catch (e) { showErr(e); return; }
    setExported(true);
    setTimeout(() => setExported(false), 1600);
  };
  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    (async () => {
      try {
        const prep = await importInto(await f.text(), storeRef.current);
        commit(prep.store, prep.uploads);
        // The imported file itself is kept in the project's _imports folder.
        if (!readOnly && svcRef.current) await svcRef.current.keepImport(f, f.name);
        setImportMsg('imported');
        if (prep.dropped.length) setToast('skipped ' + prep.dropped.join(', '));
      } catch { setImportMsg('bad file'); }
      setTimeout(() => setImportMsg(null), 1800);
    })();
  };

  // --- untracked files attached from the Vault dialog ---------------------------------------------
  const attachData = async (path: string) => {
    const s = svcRef.current;
    if (!s) return;
    const { upload } = await s.adoptUntracked(path);
    setVaultDlg(false);
    setForm(f => f || blankForm());
    readFiles([new File([upload.blob], upload.name)], { existingPath: path });
  };

  // --- notes on this page ------------------------------------------------------------------
  const onPage = new Set(shownSeqs.map(s => s.id));
  const noteList: { scope: string; title: string; preview: string; open: () => void; key: string }[] = [];
  for (const [id, text] of Object.entries(store.notes.row)) {
    const s = shownSeqs.find(q => q.id === id);
    if (s) noteList.push({ key: 'r' + id, scope: 'Sequence', title: s.name, preview: text.slice(0, 110), open: () => setSel({ mode: 'row', id, s: cols[0].k }) });
  }
  for (const [key, text] of Object.entries(store.notes.cell)) {
    const i = key.indexOf('_'), sk = key.slice(0, i), id = key.slice(i + 1);
    const s = onPage.has(id) ? shownSeqs.find(q => q.id === id) : null, sc = cols.find(q => q.k === sk);
    if (s && sc) noteList.push({ key: 'c' + key, scope: 'Cell', title: s.name + ' × ' + sc.label, preview: text.slice(0, 110), open: () => setSel({ mode: 'cell', id, s: sk }) });
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDrag(false);
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    // Entries are taken during the event; folders are walked afterwards.
    filesFromDrop(e.dataTransfer).then(p => { setForm(f => f || blankForm()); readFiles(p.files, { skipped: p.skipped }); }).catch(showErr);
  };
  const onDragOver = (e: React.DragEvent) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); if (!drag) setDrag(true); };

  const nRuns = shownSeqs.reduce((n, s) => n + s.runs.length, 0);
  const subtitle = shownSeqs.length
    ? 'Sequence × column · AWH · ' + plural(shownSeqs.length, 'sequence') + ' · ' + nRuns + ' runs'
    : 'Sequence × column · AWH · no data yet';

  const dropzone = (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '40px 24px' }}>
      <button className="h-accb" onClick={() => openForm()} style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: '46px 40px', background: 'var(--surf)', border: '2px dashed var(--line)', borderRadius: 20, textAlign: 'left' }}>
        <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em' }}>Drop xvg files here</span>
        <span style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--mut)' }}>Drop one file or a whole batch. File names are read with the pattern <span style={{ color: 'var(--ink)' }}>{settings.pattern}</span> — {'{method}'} becomes the group, {'{column}'} picks the column. Change the pattern, the data columns and the axis labels in Settings.{page ? ' New rows join this page as well as All sequences.' : ''}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' }}>+ Upload xvg</span>
      </button>
    </div>
  );

  if (fatal || !svc) {
    return (
      <div data-theme={dark ? 'dark' : 'light'} style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--ink)', padding: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', maxWidth: 520 }}>
          <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 20 }}>{fatal ? 'Something went wrong' : 'Opening ' + (vault.name || 'vault') + '…'}</div>
          {fatal && <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--mut)' }}>{fatal}</div>}
          {(fatal || !opening) && <button className="h-surf" onClick={() => void leave()} style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 12 }}>Back to vaults</button>}
        </div>
      </div>
    );
  }
  const report = svc.report;
  const issues = report.missing.length + report.untracked.length + report.conflicts.length;

  return (
    <Ctx.Provider value={app}>
      <div data-theme={dark ? 'dark' : 'light'} style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)', background: 'var(--bg)', color: 'var(--ink)' }}>
        <header style={{ display: 'flex', alignItems: 'flex-end', gap: 24, padding: '14px 20px 13px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1 }}>PMF Sequences</div>
              <ProjectMenu ops={ops} onManage={create => setProjDlg({ create })} />
            </div>
            <div className="lbl" style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{subtitle}</span>
              <SaveBadge status={status} readOnly={readOnly} viewer={!!viewer} />
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <MetricPicker />
            <button className="h-surf" onClick={() => setSorted(!sorted)} title="Keep your own order (Settings → Modify), or rank sequences by mean binding strength within each group"
              style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: sorted ? 'var(--surf)' : 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
              {sorted ? 'order: ranked' : 'order: manual'}
            </button>
            <ExportMenu open={menu} setOpen={v => setMenu(v && shownSeqs.length > 0)} width={260} head={'Export ' + (page ? 'this page' : 'matrix') + ' · ' + metricDef.label}
              hints={matrixHints} onPick={exportMatrix}
              trigger={(open, toggle) => (
                <button className="h-surf" onClick={toggle} title="Export the matrix on this page as xvg, png, svg or pdf (laid out by Settings → Export)"
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', border: '1px solid ' + (open ? 'var(--acc)' : 'var(--line)'), borderRadius: 9, background: 'transparent', fontSize: 12, whiteSpace: 'nowrap', opacity: shownSeqs.length ? 1 : 0.45 }}>
                  <DownloadIcon />Export
                </button>
              )} />
            <button className="h-surf" onClick={() => setVaultDlg(true)} title={'Vault folder · ' + vault.name + ' — trash, untracked and missing files, reload from disk'}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', border: '1px solid ' + (issues ? 'var(--acc)' : 'var(--line)'), borderRadius: 9, background: 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
              Vault{issues ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--acc)', color: '#fff' }}>{issues}</span> : null}
            </button>
            <button className="h-surf" onClick={() => openSettings()} title={'Settings · file names, axes, columns, rows, theme, laser pointer (' + keyLabel(settings.laserKey) + ')'}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 12, whiteSpace: 'nowrap' }}>
              <GearIcon />Settings
            </button>
            <button className="h-bright" onClick={() => openForm()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              + Upload xvg
            </button>
          </div>
        </header>

        <VaultBanner vault={vault} svc={svc} status={status} viewer={!!viewer} reconnect={reconnect} onReloaded={bump} onLeave={() => void leave()} />

        <PageBar pageId={viewId} onPick={goPage} onNew={() => setPageDlg({ page: null })} onEdit={p => setPageDlg({ page: p })} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', minHeight: 0 }}>
          <div onDragOver={onDragOver} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            style={{ minHeight: 0, overflow: 'auto', borderRight: '1px solid var(--line)', outline: drag ? '2px dashed var(--acc)' : 'none', outlineOffset: -3 }}>
            {shownSeqs.length === 0 ? (
              page && store.seqs.length ? (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '40px 24px' }}>
                  <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: '40px 40px 36px', background: 'var(--surf)', border: '2px dashed var(--line)', borderRadius: 20 }}>
                    <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em' }}>{page.name} is empty</span>
                    <span style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--mut)' }}>Pick sequences from this project to show here — they stay on All sequences too. Or drop xvg files: new rows join this page.</span>
                    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="h-bright" onClick={() => setPageDlg({ page })} style={{ padding: '10px 18px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' }}>Choose sequences</button>
                      <button className="h-surf" onClick={() => openForm()} style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)', fontSize: 12 }}>+ Upload xvg</button>
                    </span>
                  </div>
                </div>
              ) : dropzone
            ) : (
              <>
                {page && page.desc && <p style={{ margin: 0, padding: '14px 18px 2px', maxWidth: 760, fontSize: 12, lineHeight: 1.7, color: 'var(--mut)', textWrap: 'pretty' }}>{page.desc}</p>}
                <Matrix glist={glist} anyGroup={anyGroup} sel={sel} scale={scale} tiles={tiles}
                  onHover={setHover} onOpenCol={k => { setSacchSel(k); setHover(null); }} onOpenColumns={() => { setSacchSel(null); openSettings(); }}
                  footer={(
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 18px 28px', flexWrap: 'wrap' }}>
                      <span className="lbl">{legend.title}</span>
                      <span style={{ display: 'flex', height: 10, width: 200, borderRadius: 99, overflow: 'hidden' }}>
                        {legendSwatches(scale.kind, dark).map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--mut)' }}>{legend.range}</span>
                      <span style={{ flexBasis: '100%', height: 0 }} />
                      {cols.map(s => <span key={s.k} style={{ fontSize: 11, color: 'var(--mut)' }}><strong style={{ color: hue(s) }}>{s.label}</strong> {s.name}</span>)}
                      <span style={{ fontSize: 11, color: 'var(--mut)' }}>cell = mean of the runs present · bars = runs uploaded, up to 10</span>
                    </div>
                  )} />
              </>
            )}
          </div>

          <aside style={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', background: 'var(--surf)' }}>
            <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="lbl-wide">Notes</span>
              <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 14 }}>{pad2(noteList.length)}</span>
              {page && <span className="ellip" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mut)' }}>on {page.name}</span>}
            </div>
            <div style={{ minHeight: 0, overflow: 'auto' }}>
              {!noteList.length && <p style={{ padding: '14px 12px', fontSize: 11, color: 'var(--mut)', lineHeight: 1.7, margin: 0 }}>{page ? 'No notes on the sequences of this page yet. ' : 'No notes yet. '}Click any cell for its PMF curves, or a sequence name to compare every column — each opens a note field. Notes are saved as note.md files in the vault folder.</p>}
              {noteList.map(n => (
                <button key={n.key} className="h-accb" onClick={n.open} style={{ display: 'block', width: 'calc(100% - 20px)', margin: '8px 10px 0', textAlign: 'left', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10 }}>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc)' }}>{n.scope}</span>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 12, margin: '3px 0 4px' }}>{n.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 }}>{n.preview}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="h-accb" onClick={exportAll} title={'Download ' + projectName + ' — every page, note and file — as one JSON'} style={{ flex: '1 1 120px', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg)', textAlign: 'left', fontSize: 11 }}>{exported ? '✓ exported' : 'Export dataset JSON'}</button>
              <button className="h-accb" onClick={() => importRef.current && importRef.current.click()} title={'Merge an export into ' + projectName} style={{ flex: '1 1 120px', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg)', textAlign: 'left', fontSize: 11 }}>
                {importMsg ? (importMsg === 'imported' ? '✓ imported' : '✗ not a PMF export') : 'Import dataset JSON'}
              </button>
              <input type="file" accept=".json,application/json" ref={importRef} onChange={onImportFile} style={{ display: 'none' }} />
            </div>
          </aside>
        </div>

        {form && <UploadDialog form={form} setForm={setForm} readFiles={readFiles} reading={reading} onDragOver={onDragOver} onDrop={onDrop}
          onSaved={(last, count, fromCell) => {
            // Opened from a cell or row: stay there. From the header: open the one new cell, if only one.
            if (fromCell && last) setSel(s => (s ? { ...s, id: last.rowId } : { mode: 'cell', id: last.rowId, s: last.col }));
            else setSel(count === 1 && last ? { mode: 'cell', id: last.rowId, s: last.col } : null);
          }} />}
        {setOpen && <SettingsDialog onClose={() => setSetOpen(false)} focusAnalysis={anaFocus} sorted={sorted} useManual={() => setSorted(false)}
          onNewAnalysisForForm={k => setForm(f => (f ? { ...f, ana: k } : f))} onColumnRemoved={k => setSel(s => (s && s.s === k ? null : s))} onRowRemoved={id => setSel(s => (s && s.id === id ? null : s))}
          onLaserTry={() => setLaser(true)} />}
        {sel && <DetailDialog sel={sel} />}
        {hover && !sacchSel && <HoverCard h={hover} data={sacchData[hover.k]} />}
        {sacchSel && <ColumnDialog k={sacchSel} data={sacchData[sacchSel]} onClose={() => setSacchSel(null)} onEditColumns={() => { setSacchSel(null); openSettings(); }} />}
        {pageDlg && <PageDialog page={pageDlg.page} onClose={() => setPageDlg(null)} onSaved={id => { setPageDlg(null); goPage(id || lib.ALL_PAGE); }} />}
        {projDlg && <ProjectsDialog ops={ops} startCreate={projDlg.create} onClose={() => setProjDlg(null)} />}
        {vaultDlg && <VaultDialog vault={vault} svc={svc} readOnly={readOnly} onClose={() => setVaultDlg(false)} onAttachData={p => attachData(p).catch(showErr)}
          onChanged={() => { bump(); void refreshProjects(); }} onLeave={() => void leave()} />}
        {compareOpen && !compareHeld && picks.length > 0 && <CompareDialog picks={picks} setPicks={setPicks} onClose={() => { setCompareOpen(false); setPicks([]); }} />}
        {(compareHeld || exportHold) && (
          <div role="status" style={{ position: 'fixed', left: '50%', top: 18, transform: 'translateX(-50%)', zIndex: 1001, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 99, background: 'var(--ink)', color: 'var(--bg)', fontSize: 12, letterSpacing: '0.03em', boxShadow: '0 10px 28px rgba(0,0,0,0.28)', pointerEvents: 'none', animation: 'toastIn 140ms ease-out' }}>
            <span style={{ fontWeight: 700, color: 'var(--acc)' }}>{exportHold ? 'EXPORT' : 'COMPARE'}</span>
            {exportHold
              ? <span>{picks.length ? plural(picks.length, 'pick') : 'click cells or sequence names'}{exportHold.all ? ' · every analysis with the PMF' : ''} · release <kbd>{keyLabel(settings.exportKey)}</kbd> to export{exportHold.all ? '' : <> · <kbd>Shift</kbd> too: every analysis</>}</span>
              : <span>{picks.length ? plural(picks.length, 'pick') + ' · release ' + keyLabel(settings.compareKey) + ' to see them together' : 'click cells or sequence names'}</span>}
          </div>
        )}
        <Laser on={laser} color={settings.laserColor} size={settings.laserSize} trail={settings.laserTrail} />
        {/* Always present, so screen readers announce each toast (an export names its file, R8a). */}
        <div role="status" aria-live="polite">{toast && (
          <div style={{ position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)', zIndex: 1001, padding: '7px 14px', borderRadius: 99, background: 'var(--ink)', color: 'var(--bg)', fontSize: 11, letterSpacing: '0.04em', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', pointerEvents: 'none', animation: 'toastIn 140ms ease-out' }}>{toast}</div>
        )}</div>
      </div>
    </Ctx.Provider>
  );
}
