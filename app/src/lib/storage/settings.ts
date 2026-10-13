// Project settings in .matrix/settings/<projectId>/ (spec §7, decision D36).
// Browser-global UI preferences are not here (see src/lib/prefs.ts).

import type { AnalysisType, MetricDef, Settings, TagDef } from '../types';
import { DEFAULT_SETTINGS, PROJECT_KEYS } from '../seq';
import type { VaultIO } from './io';
import { CorruptFileError } from './io';
import { settingsPaths } from './path';

export type ProjectSettings = Partial<Settings>;

/** Keys kept in their own files, not in settings.json. */
const OWN_FILE = ['analyses', 'tags', 'metrics'];

/** The settings.json body: every project key except the analysis and tag lists, defaults filled. */
export function settingsBody(s: ProjectSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PROJECT_KEYS) if (!OWN_FILE.includes(k)) out[k] = (s as Record<string, unknown>)[k] ?? (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
  return out;
}

export async function readSettings(io: VaultIO, pid: string): Promise<{ settings: ProjectSettings; ignored: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const safe = async <T>(p: string): Promise<T | null> => {
    try { return await io.readJson<T>(p); } catch (e) { if (e instanceof CorruptFileError) { warnings.push(e.message + ' — defaults used'); return null; } throw e; }
  };
  const base = (await safe<Record<string, unknown>>(settingsPaths.settings(pid))) || {};
  const ana = await safe<{ analyses: AnalysisType[] }>(settingsPaths.analyses(pid));
  const tags = await safe<{ tags: TagDef[] }>(settingsPaths.tags(pid));
  const metrics = await safe<{ metrics: MetricDef[] }>(settingsPaths.metrics(pid));
  const ign = await safe<{ ignored: string[] }>(settingsPaths.ignored(pid));
  const settings: ProjectSettings = {};
  for (const k of PROJECT_KEYS) if (!OWN_FILE.includes(k) && base[k] !== undefined) (settings as Record<string, unknown>)[k] = base[k];
  if (ana && Array.isArray(ana.analyses)) settings.analyses = ana.analyses;
  if (tags && Array.isArray(tags.tags)) settings.tags = tags.tags;
  if (metrics && Array.isArray(metrics.metrics)) settings.metrics = metrics.metrics;
  return { settings, ignored: ign && Array.isArray(ign.ignored) ? ign.ignored : [], warnings };
}

/** Record writes for settings, in the journal's { path, text } form (text null = delete). */
export function settingsFiles(pid: string, s: ProjectSettings, ignored: string[]): { path: string; value: unknown | null }[] {
  return [
    { path: settingsPaths.settings(pid), value: settingsBody(s) },
    { path: settingsPaths.analyses(pid), value: Array.isArray(s.analyses) ? { analyses: s.analyses } : null },
    { path: settingsPaths.tags(pid), value: Array.isArray(s.tags) ? { tags: s.tags } : null },
    { path: settingsPaths.metrics(pid), value: Array.isArray(s.metrics) && s.metrics.length ? { metrics: s.metrics } : null },
    { path: settingsPaths.ignored(pid), value: ignored.length ? { ignored: [...ignored].sort() } : null },
  ];
}
