// The app's single keys (laser pointer, compare, export; R8b): which can be chosen, and what the export key does.

export type KeyName = 'laserKey' | 'compareKey' | 'exportKey';
const NAMES: Record<KeyName, string> = { laserKey: 'laser pointer', compareKey: 'compare', exportKey: 'export' };

export const keyLabel = (k: string) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
export const sameKey = (a: string, b: string) => (a.length === 1 ? a.toLowerCase() : a) === (b.length === 1 ? b.toLowerCase() : b);

/** Why `key` can't be the `which` key: it moves the focus or the cursor, closes dialogs, or another key has it. */
export function keyTaken(key: string, which: KeyName, st: Record<KeyName, string>): string | null {
  if (key === 'Escape') return 'Escape is taken — it closes dialogs';
  if (/^Arrow|^Tab$|^Enter$/.test(key)) return keyLabel(key) + ' is taken — it moves between cells or fields';
  const other = (Object.keys(NAMES) as KeyName[]).find(k => k !== which && sameKey(key, st[k]));
  return other ? keyLabel(key) + ' is already the ' + NAMES[other] + ' key' : null;
}

type Press = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean };
/** A press of the export key: in a graph (or Compare) it exports what is shown; held on the matrix it picks cells (R8c);
 * never while typing or with Ctrl, ⌘ or Alt (Shift is the "every analysis" of a batch). */
export function exportKeyAction(e: Press, typing: boolean, st: { exportKey: string }, where: 'graph' | 'matrix' | 'other'): 'export' | 'pick' | null {
  if (typing || e.ctrlKey || e.metaKey || e.altKey || e.repeat || !sameKey(e.key, st.exportKey)) return null;
  return where === 'graph' ? 'export' : where === 'matrix' ? 'pick' : null;
}
