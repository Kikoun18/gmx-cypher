// Light, dark or the system's choice (T43): a browser preference, never data.

export type ThemePref = 'light' | 'dark' | 'auto';
const KEY = 'gmx-cypher-theme';

export function readThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

export function saveThemePref(p: ThemePref) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* a preference only */ }
}

export const themeOf = (p: ThemePref, systemDark: boolean): 'light' | 'dark' => (p === 'auto' ? (systemDark ? 'dark' : 'light') : p);
