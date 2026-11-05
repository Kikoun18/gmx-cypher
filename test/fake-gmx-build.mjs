// SymBuilder's tools in the fake gmx (R5b). Each prints the real output of its step in the notebook's build of
// hmr+fast+6/o111/hhhhhhhh (test/fixtures/build/notebook/tools/, paths and user name replaced), and writes the files
// the step makes. Those files are copies of real ones from the fixtures where one fits (the peptide's .gro is
// mmmmmmmm.gro as trjconv wrote it; a system's .gro is 9.multiwalker.gro); otherwise they are the smallest file of the
// right shape, marked "fake" in their first line (a .tpr, an .edr, pdb2gmx's topology), never presented as real.
// FAKE_GMX_FATAL=<output name> makes grompp for that output (e.g. 7.awh.tpr) print the notebook's real AWH fatal
// error; FAKE_GMX_SLOW (ms) makes mdrun take that long.

import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Exits once stdout and stderr are written: a pipe would otherwise lose their end. */
export const exitWhenWritten = code => process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));

const TOOLS = new URL('./fixtures/build/notebook/tools/', import.meta.url);
const FIX = new URL('./fixtures/', import.meta.url);
const real = name => readFileSync(new URL(name + '.txt', TOOLS), 'utf8');
const fixture = path => readFileSync(new URL(path, FIX), 'utf8');

export const BUILD_TOOLS = ['pdb2gmx', 'editconf', 'trjconv', 'solvate', 'genion', 'grompp', 'mdrun', 'make_ndx'];

/** True when this is a build's call: its tool is a build tool, or energy on a minimisation's .edr. */
export const isBuild = (tool, argv) => BUILD_TOOLS.includes(tool) || (tool === 'energy' && /4\.minim\.edr$/.test(argv[argv.indexOf('-f') + 1] || ''));

/** Runs the tool; resolves to its exit code. */
export async function build(tool, argv) {
  const one = flag => { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1]; };
  // The system's sequence names its files: the real text says hhhhhhhh, this run's system may be another.
  const top = one('-p'), seq = top ? basename(top, '.top') : basename(process.cwd()).match(/^[a-z]+$/) ? basename(process.cwd()) : 'hhhhhhhh';
  const say = name => process.stdout.write(real(name).replaceAll('hhhhhhhh', seq));
  // Like GROMACS: an existing output is backed up to #name.N# first; the backup's path is returned.
  const backUp = file => { if (!existsSync(file)) return null; let n = 1, to; while (existsSync((to = join(dirname(file), '#' + basename(file) + '.' + n + '#')))) n++; renameSync(file, to); return to; };
  const SYSTEM = 'decypher/9.multiwalker.gro';
  switch (tool) {
    case 'trjconv': {
      const f = one('-f'), o = one('-o');
      if (argv.includes('-dump')) { say('trjconv-dump'); writeFileSync(o, fixture(SYSTEM)); return; }
      say(f.endsWith('.pdb') ? 'trjconv-peptide' : 'trjconv-saccharide');
      if (f.endsWith('.pdb')) { writeFileSync(o, fixture('decypher/mmmmmmmm.gro')); return; }
      const text = readFileSync(f, 'utf8');
      backUp(o); writeFileSync(o, text);
      return;
    }
    case 'editconf': say(argv.includes('-translate') ? 'editconf-saccharide' : 'editconf-peptide'); copyFileSync(one('-f'), one('-o')); return;
    case 'pdb2gmx': {
      say('pdb2gmx');
      const gro = readFileSync(one('-f'), 'utf8'), n = Number(gro.split('\n')[1].trim());
      writeFileSync(one('-i'), '; fake: pdb2gmx\'s position restraints, of the right shape only\n[ position_restraints ]\n');
      writeFileSync(top, '; fake: pdb2gmx\'s topology, of the right shape only\n#include "./charmm36s-jul2022-prosECCo75.ff/forcefield.itp"\n\n[ moleculetype ]\n; Name            nrexcl\nProtein             3\n\n[ atoms ]\n'
        + Array.from({ length: n }, (_, i) => '  ' + (i + 1) + '  X  1  MET  A' + (i + 1) + '  ' + (i + 1) + '  0.0  1.008').join('\n')
        + '\n\n; Include water topology\n#include "./charmm36s-jul2022-prosECCo75.ff/tip3p.itp"\n\n[ system ]\nProtein\n\n[ molecules ]\n; Compound        #mols\nProtein             1\n');
      copyFileSync(one('-f'), one('-o'));
      return;
    }
    case 'solvate': {
      say('solvate');
      const was = backUp(top);
      writeFileSync(top, readFileSync(was, 'utf8').replace(/\n*$/, '\n') + 'SOL         11140\n');
      copyFileSync(one('-cp'), one('-o'));
      return;
    }
    case 'grompp': {
      const o = one('-o'), name = basename(o);
      // FAKE_GMX_FATAL=7.awh.tpr, or 8/9.multiwalker.tpr for one walker's folder; with FAKE_GMX_FATAL_ONCE=<file>, only
      // until that file exists (it is made at the first failure), so a retry gets through.
      const want = process.env.FAKE_GMX_FATAL, here = basename(process.cwd()) + '/' + name, once = process.env.FAKE_GMX_FATAL_ONCE;
      if ((want === name || want === here) && !(once && existsSync(once))) {
        if (once) writeFileSync(once, 'failed once\n');
        // Like grompp: its -po file is written before the pull's check fails (an older one backed up first).
        backUp(one('-po'));
        writeFileSync(one('-po'), existsSync(one('-f')) ? readFileSync(one('-f'), 'utf8') : '');
        process.stderr.write(fixture(name === '9.multiwalker.tpr' ? 'build/notebook/grompp-walker-fatal.txt' : 'build/notebook/grompp-awh-fatal.txt'));
        return 1;
      }
      const which = { '3.pre_salted.tpr': 'grompp-pre-salted', '4.minim.tpr': 'grompp-minim', '5.eqnvt.tpr': 'grompp-eqnvt', '6.eqnpt.tpr': 'grompp-eqnpt', '7.awh.tpr': 'grompp-awh', '8.pull.tpr': 'grompp-pull', '9.multiwalker.tpr': 'grompp-walker', '_charge_check.tpr': 'grompp-pre-salted' }[name];
      if (!which) { process.stderr.write('fake gmx: no real grompp output for ' + name + '\n'); return 1; }
      process.stderr.write(real(which).replaceAll('hhhhhhhh', seq));
      backUp(o); backUp(one('-po'));
      writeFileSync(o, 'fake: a run input, not a real .tpr\n');
      writeFileSync(one('-po'), existsSync(one('-f')) ? readFileSync(one('-f'), 'utf8') : '');
      return;
    }
    case 'genion': {
      say('genion');
      const np = Number(one('-np')), nn = Number(one('-nn'));
      const t = readFileSync(backUp(top), 'utf8');
      writeFileSync(top, t.replace(/^SOL(\s+)(\d+)$/m, (_m, sp, k) => 'SOL' + sp + (Number(k) - np - nn)) + one('-pname') + '               ' + np + '\n' + one('-nname') + '              ' + nn + '\n');
      copyFileSync(join(dirname(one('-s')), '2.solvated.gro'), one('-o'));
      return;
    }
    case 'mdrun': {
      const d = one('-deffnm'), slow = Number(process.env.FAKE_GMX_SLOW || 0), text = real('mdrun-' + d.split('.')[1]);
      // Like mdrun: its log is open from the start, so a run stopped midway leaves it.
      writeFileSync(d + '.log', text.split('\n').slice(0, 3).join('\n') + '\n');
      if (slow) await new Promise(r => setTimeout(r, slow));
      process.stderr.write(text);
      writeFileSync(d + '.log', text);
      writeFileSync(d + '.edr', 'fake: an energy file, not a real .edr\n');
      if (d !== '4.minim') { writeFileSync(d + '.trr', 'fake: a trajectory, not a real .trr\n'); writeFileSync(d + '.cpt', 'fake: a checkpoint, not a real .cpt\n'); }
      writeFileSync(d + '.gro', fixture(SYSTEM));
      return;
    }
    case 'make_ndx': {
      const o = one('-o'), gro = readFileSync(one('-f'), 'utf8'), n = Number(gro.split('\n')[1].trim());
      say(o.includes('8.pull') ? 'make_ndx-pull' : 'make_ndx-awh');
      const rows = []; for (let i = 1; i <= n; i += 15) rows.push(Array.from({ length: Math.min(15, n - i + 1) }, (_, k) => i + k).join(' '));
      writeFileSync(o, '[ System ]\n' + rows.join('\n') + '\n');
      return;
    }
    case 'energy': {
      say('energy-potential');
      writeFileSync(one('-o'), '# fake: the potential energy, of the right shape only\n@    title "GROMACS Energies"\n@ s0 legend "Potential"\n0 -524659\n');
      return;
    }
  }
}
