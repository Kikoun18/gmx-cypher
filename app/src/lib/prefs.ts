// Browser-wide UI preferences (theme, laser pointer). They belong to this browser,
// not to a vault, and live under their own key; the legacy settings key is only
// ever read by the migration (decision D37).

import { splitSettings } from './seq';
import type { Settings } from './types';

const KEY = 'pmf-ui-prefs-v1';
const PREF_KEYS = ['dark', 'bw', 'laserKey', 'laserMode', 'laserColor', 'laserSize', 'laserTrail', 'compareKey'] as const;

function pick(s: Partial<Settings>): Partial<Settings> {
  const app = splitSettings(s).app as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k of PREF_KEYS) if (app[k] !== undefined) out[k] = app[k];
  return out as Partial<Settings>;
}

export function loadPrefs(): Partial<Settings> {
  try { return pick(JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch { return {}; }
}

export function savePrefs(s: Partial<Settings>) {
  try { localStorage.setItem(KEY, JSON.stringify(pick(s))); } catch { /* storage blocked: prefs stay for this tab */ }
}
