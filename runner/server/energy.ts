// gmx energy's term menu (R4): read from the file itself, once per binary and file version. gmx prints the menu
// when it is given no terms, and then stops with an error; nothing is written into the file's folder, since the
// run is made in a scratch folder that is removed after the read.
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnergyMenu, type EnergyTerm } from '../src/lib/energy';
import { capture, type GmxState } from './gmx';

const menus = new Map<string, Promise<EnergyTerm[]>>();

/** The terms of an .edr, as gmx energy lists them; a failed read is tried again next time. */
export function energyMenu(g: GmxState, edr: string): Promise<EnergyTerm[]> {
  const st = statSync(edr), key = [g.path, edr, st.size, st.mtimeMs].join('\0');
  if (!menus.has(key)) {
    const read = (async () => {
      const dir = mkdtempSync(join(tmpdir(), 'gmx-cypher-energy-'));
      try {
        // Both streams: gmx prints the menu on stderr when it gives up for want of terms.
        const r = await capture(g.path!, ['energy', '-f', edr, '-o', join(dir, 'menu.xvg')], { cwd: dir, stdin: '', timeoutMs: 120_000 });
        const terms = parseEnergyMenu(r.stdout + '\n' + r.stderr);
        if (!terms.length) throw new Error('gmx energy printed no term menu for ' + edr + (r.code ? ' (exit ' + r.code + ')' : ''));
        return terms;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    })();
    menus.set(key, read);
    read.catch(() => menus.delete(key));
  }
  return menus.get(key)!;
}
