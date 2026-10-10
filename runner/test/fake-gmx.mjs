#!/usr/bin/env node
// A fake gmx for tests (T9). Everything it prints or writes is real GROMACS 2025.4 text from
// test/fixtures/gmx-2025.4, with the header's command, working directory and group names taken from its
// own arguments. FAKE_GMX_FRAMES (11), FAKE_GMX_SLOW (ms per frame) and FAKE_GMX_FAIL change its run;
// FAKE_GMX_TOUCH=<tool>=<path> makes a file appear at that path while that tool runs (no-overwrite tests).
// FAKE_GMX_VERSION=2023.3 (fake-gmx-2023.mjs) answers --version and the H-bond tools as 2023.3 does: gmx hbond is the
// legacy tool and there is no gmx hbond-legacy (R8). Everything else it prints is still 2025.4's text.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const FIX = new URL('./fixtures/gmx-2025.4/', import.meta.url);
const read = name => readFileSync(new URL(name, FIX), 'utf8');
const argv = process.argv.slice(2);
const [tool] = argv;
const banner = t => '                       :-) GROMACS - gmx ' + t + ', 2025.4-PLUMED_spack (-:\n\nExecutable:   ' + process.argv[1]
  + '\nData prefix:  /opt/gromacs-2025.4\nWorking dir:  ' + process.cwd() + '\nCommand line:\n  ' + commandLine() + '\n\n';
const quote = '\nGROMACS reminds you: "Is This the Right Room for an Argument ?" (Monty Python)\n\n';
function commandLine() { return ['gmx_mpi', ...argv].map(a => (a.includes(' ') ? "'" + a + "'" : a)).join(' '); }

/** Values after a flag, up to the next flag. */
function values(flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !/^-[a-z]/.test(argv[j]); j++) out.push(argv[j]);
  return out;
}
const one = flag => values(flag)[0];

function groupNames(ndx) {
  return ndx && existsSync(ndx) ? [...readFileSync(ndx, 'utf8').matchAll(/^\s*\[\s*(\S+)[^\]]*\]/gm)].map(m => m[1]) : [];
}

function fail(message) {
  process.stderr.write(banner(tool) + '\n-------------------------------------------------------\nProgram:     gmx ' + tool + ', version 2025.4-PLUMED_spack\n'
    + 'Source file: src/gromacs/selection/selectioncollection.cpp (line 702)\nFunction:    void gmx::SelectionCollection::setIndexGroups(gmx_ana_indexgrps_t*)\n\n'
    + 'Inconsistency in user input:\nInvalid index group reference(s)\n  ' + message + '\n\nFor more information and tips for troubleshooting, please check the GROMACS\n'
    + 'website at https://manual.gromacs.org/current/user-guide/run-time-errors.html\n-------------------------------------------------------\n');
  process.exit(1);
}

/** Like GROMACS: an existing output is renamed to #name.N#; with GMX_MAXBACKUP 0 or -1, 2025.4 overwrites it instead (checked). */
function backUp(file, log) {
  if (!existsSync(file) || ['0', '-1'].includes(process.env.GMX_MAXBACKUP)) return;
  let n = 1, to;
  while (existsSync((to = join(dirname(file), '#' + basename(file) + '.' + n + '#')))) n++;
  renameSync(file, to);
  log.push('\nBack Off! I just backed up ' + file + ' to ' + (dirname(file) === '.' ? './' : dirname(file) + '/') + basename(to) + '\n');
}

/** The real 2025.4 output with this run's header, selections and legends. */
function rewrite(text, groups, ref) {
  const lines = text.split('\n'), out = [];
  for (const l of lines) {
    if (l.startsWith('#                       :-) GROMACS')) out.push('#                       :-) GROMACS - gmx rdf, 2025.4-PLUMED_spack (-:');
    else if (l.startsWith('# Executable:')) out.push('# Executable:   ' + process.argv[1]);
    else if (l.startsWith('# Working dir:')) out.push('# Working dir:  ' + process.cwd());
    else if (l.startsWith('#   gmx rdf')) out.push('#   ' + commandLine());
    else if (l.startsWith('@ subtitle')) out.push('@ subtitle "reference ' + ref + '"');
    else if (/^@ s\d+ legend/.test(l)) { if (l.startsWith('@ s0')) groups.forEach((g, i) => out.push('@ s' + i + ' legend "' + g + '"')); }
    else if (l && !'#@'.includes(l[0])) {
      // Each field keeps its own spacing: x, then one real y column per selection.
      const f = l.match(/\s*\S+/g);
      out.push(f[0] + groups.map((_, i) => f[1 + (i % (f.length - 1))]).join(''));
    } else out.push(l);
  }
  return out.join('\n');
}

/** Atoms of the file given: a .gro text (line 2), else FAKE_GMX_NATOMS, else your test system's 3242. */
function natomsOf(file) {
  try { const n = parseInt(readFileSync(file, 'utf8').split('\n')[1], 10); if (n > 0) return n; } catch { /* not readable as text */ }
  return Number(process.env.FAKE_GMX_NATOMS || 3242);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const [touchTool, touchPath] = (process.env.FAKE_GMX_TOUCH || '').split('=');
if (touchTool === tool && touchPath) writeFileSync(touchPath, 'appeared while gmx ' + tool + ' ran\n');

async function rdf() {
  const names = groupNames(one('-n')), pick = ref => { const m = /^group (\d+)$/.exec(ref); return m && names[+m[1]] ? names[+m[1]] : null; };
  const ref = one('-ref'), sels = values('-sel');
  for (const s of [ref, ...sels]) if (!pick(s)) fail("Cannot match '" + s + "', because no such index group can be found.");
  if (process.env.FAKE_GMX_FAIL) fail("Cannot match '" + sels[0] + "', because no such index group can be found.");
  const log = [];
  const n = Number(process.env.FAKE_GMX_FRAMES || 11), slow = Number(process.env.FAKE_GMX_SLOW || 0);
  process.stderr.write(banner('rdf') + ('Reading file ' + (one('-s') || 'topol.tpr') + ', VERSION 2025.1-Homebrew (single precision)\n').repeat(2));
  for (let i = 0; i < n; i++) {
    process.stderr.write('\rReading frame ' + String(i).padStart(7) + ' time ' + i.toFixed(3).padStart(8) + '   ');
    if (slow) await sleep(slow);
  }
  process.stderr.write('\rLast frame ' + String(n - 1).padStart(10) + ' time ' + (n - 1).toFixed(3).padStart(8) + '   \nAnalyzed ' + n + ' frames, last time ' + (n - 1).toFixed(3) + '\n');
  const o = one('-o') || 'rdf.xvg', cn = one('-cn'), groups = sels.map(pick);
  backUp(o, log);
  writeFileSync(o, rewrite(read('rdf_nvt.xvg'), groups, pick(ref)));
  if (cn) { backUp(cn, log); writeFileSync(cn, rewrite(read('rdf_nvt_cn.xvg'), groups, pick(ref))); }
  process.stderr.write(log.join('') + quote);
}

/** gmx select -os: each 'group N' counted from the index; an atom beyond the run input fails as 2025.4 does. */
function select() {
  const ndx = one('-n'), text = ndx && existsSync(ndx) ? readFileSync(ndx, 'utf8') : '';
  const groups = text.split(/^(?=\s*\[)/m).filter(b => b.trim()).map(b => { const [head, ...rest] = b.split('\n'); return { name: /\[\s*(\S+)/.exec(head)[1], atoms: rest.join(' ').trim().split(/\s+/).filter(Boolean).map(Number) }; });
  const natoms = natomsOf(one('-s')), picked = values('-select').map(s => { const m = /^group (\d+)$/.exec(s); return m ? groups[+m[1]] : null; });
  picked.forEach((g, i) => { if (!g) fail("Cannot match '" + values('-select')[i] + "', because no such index group can be found."); });
  const beyond = picked.find(g => g.atoms.some(a => a > natoms));
  if (beyond) {
    const real = read('select-beyond.stderr');
    process.stderr.write(banner('select') + real.slice(real.indexOf('Reading file')).replace("Group 'big'", "Group '" + beyond.name + "'").replace('is\n  3242)', 'is\n  ' + natoms + ')'));
    process.exit(1);
  }
  const head = read('sizes.xvg').split('\n').filter(l => '#@'.includes(l[0]) && !/^@ s\d+ legend/.test(l)).map(l => (l.startsWith('#   gmx select') ? '#   ' + commandLine() : l));
  writeFileSync(one('-os') || 'size.xvg', [...head, ...picked.map((g, i) => '@ s' + i + ' legend "' + g.name + '"'), '      0.000' + picked.map(g => g.atoms.length.toFixed(3).padStart(9)).join(''), ''].join('\n'));
  process.stderr.write(banner('select') + quote);
}

/**
 * gmx energy (R4): with no terms on stdin it prints the term menu to stderr and stops, as 2025.4 does. With terms
 * it writes the real energy-potential.xvg (the terms 1 and 6 of rerun.edr, the only ones in the fixtures) and prints
 * the statistics on stdout. Other terms are refused, so a test never sees invented numbers.
 */
function energy() {
  const picked = readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number).filter(n => n !== 0);
  if (!picked.length || process.env.FAKE_GMX_FAIL) { process.stderr.write(read('energy-menu.txt')); process.exit(1); }
  if (picked.length !== 2 || !picked.includes(1) || !picked.includes(6)) { process.stderr.write('fake gmx energy: only terms 1 and 6 are in the fixtures, not ' + picked.join(' ') + '\n'); process.exit(1); }
  const o = one('-o') || 'energy.xvg';
  backUp(o, []);
  writeFileSync(o, read('energy-potential.xvg'));
  const stats = read('energy-stats.txt');
  process.stdout.write(stats.slice(stats.indexOf('Statistics over')));
}

/**
 * gmx awh (R5): the real files of the AWH run in test/fixtures/awh/out (frames every 2 ps, 0–20 ps), chosen with
 * -b, -e and -skip as 2025.4 chooses them, under the -o stem. -more is not in the fixtures: the files are PMF only.
 */
function awh() {
  const dir = new URL('./fixtures/awh/out/', import.meta.url);
  const all = readdirSync(dir).flatMap(n => { const m = /^awh_t(\d+(?:\.\d+)?)\.xvg$/.exec(n); return m ? [Number(m[1])] : []; }).sort((a, b) => a - b);
  const b = Number(one('-b') || 0), e = Number(one('-e') || 0), skip = Math.max(1, Number(one('-skip') || 0));
  const times = all.filter(t => t >= b && (e <= 0 || t <= e)).filter((_, i) => i % skip === 0);
  const stem = (one('-o') || 'awh.xvg').replace(/\.xvg$/, ''), log = [];
  for (const t of times) {
    const f = stem + '_t' + t + '.xvg';
    backUp(f, log);
    writeFileSync(f, readFileSync(new URL('awh_t' + t + '.xvg', dir), 'utf8'));
  }
  process.stderr.write(read('awh-run.stderr') + log.join(''));
}

/**
 * gmx wham (R6): the real outputs of the 9-window umbrella set in test/fixtures/wham, after checking that every file in
 * the lists exists, as gmx does. Lists of other windows are refused, so a test never sees invented numbers.
 */
function wham() {
  const out = new URL('./fixtures/wham/out/', import.meta.url), w = name => readFileSync(new URL(name, out), 'utf8');
  const list = f => readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  const tprs = list(one('-it')), pulls = list(one('-ix') || one('-if'));
  for (const f of [...tprs, ...pulls]) if (!existsSync(f)) { process.stderr.write(banner('wham') + 'Fatal error:\nFile input/output error:\n' + f + '\n'); process.exit(1); }
  if (tprs.length !== 9 || pulls.length !== 9) { process.stderr.write('fake gmx wham: only the 9 windows of the fixtures, not ' + tprs.length + '\n'); process.exit(1); }
  const log = [], put = (flag, name) => { const o = one(flag); if (o) { backUp(o, log); writeFileSync(o, w(name)); } };
  put('-o', 'profile.xvg'); put('-hist', 'histo.xvg'); put('-bsres', 'bsres.xvg'); put('-bsprof', 'bsprof.xvg');
  process.stdout.write(w('wham-run.stdout'));
  process.stderr.write(w('wham-run.stderr') + log.join(''));
}

/**
 * gmx distance (R7): the real 2025.4 outputs of test/fixtures/distance for two selections, by centres of mass (com/)
 * or atom pairs (pairs/), after the index groups are found as gmx finds them. Anything else is refused.
 */
function distance() {
  const sels = values('-select'), pairs = sels.length > 0 && sels.every(x => /^group 0 merge group \d+$/.test(x));
  if (sels.length !== 2 || (!pairs && !sels.every(x => /^com of group 0 plus com of group \d+$/.test(x)))) { process.stderr.write('fake gmx distance: only two selections by com or pairs are in the fixtures, not ' + sels.join(' | ') + '\n'); process.exit(1); }
  if (one('-oxyz')) { process.stderr.write('fake gmx distance: -oxyz is not in the fixtures\n'); process.exit(1); }
  const names = groupNames(one('-n'));
  for (const x of sels) for (const m of x.matchAll(/group (\d+)/g)) if (!names[+m[1]]) fail("Cannot match 'group " + m[1] + "', because no such index group can be found.");
  const dir = new URL('./fixtures/distance/' + (pairs ? 'pairs' : 'com') + '/', import.meta.url), w = n => readFileSync(new URL(n, dir), 'utf8');
  const log = [], put = (flag, name) => { const o = one(flag); if (o) { backUp(o, log); writeFileSync(o, w(name)); } };
  put('-oav', 'distance_nvt.xvg'); put('-oall', 'distance_nvt_all.xvg'); put('-oh', 'distance_nvt_hist.xvg');
  process.stdout.write(w('run.stdout'));
  process.stderr.write(w('run.stderr') + log.join(''));
}

const OLD = process.env.FAKE_GMX_VERSION === '2023.3';

/** The real outputs of gmx hbond in test/fixtures/hbond, with this run's group names where gmx prints them. */
function hbondOutputs(dir, names, files) {
  const w = n => readFileSync(new URL('./fixtures/hbond/' + dir + '/' + n, import.meta.url), 'utf8').replaceAll('sulfate', names[0]).replaceAll('water', names[1]);
  const log = [];
  for (const [flag, name] of files) { const o = one(flag); if (o) { backUp(o, log); writeFileSync(o, w(name)); } }
  process.stdout.write(w('run.stdout'));
  process.stderr.write(w('run.stderr') + log.join(''));
}

/** gmx hbond, the selection tool (2024+): -r and -t as index groups by number, its real outputs for sulfate and water. */
function hbondNew() {
  const names = groupNames(one('-n')), picked = [one('-r'), one('-t')].map(s => { const m = /^group (\d+)$/.exec(s ?? ''); return m && names[+m[1]]; });
  picked.forEach((g, i) => { if (!g) fail("Cannot match '" + [one('-r'), one('-t')][i] + "', because no such index group can be found."); });
  hbondOutputs('new', picked, [['-o', 'hbond_nvt_hbonds.ndx'], ['-num', 'hbond_nvt.xvg'], ['-dist', 'hbond_nvt_dist.xvg'], ['-ang', 'hbond_nvt_ang.xvg'], ['-dan', 'hbond_nvt_dan.xvg']]);
}

/**
 * The legacy tool (gmx hbond-legacy, gmx hbond before 2024): the two groups answered on stdin by number. With merging
 * on (its default) it refuses the angle distribution, as 2025.4 does; -dan is not in the fixtures.
 */
function hbondLegacy() {
  const names = groupNames(one('-n')), answers = readFileSync(0, 'utf8').split(/\s+/).filter(Boolean);
  if (answers.length < 2 || answers.slice(0, 2).some(a => !names[+a])) { process.stderr.write('fake gmx hbond-legacy: two index groups on stdin, not ' + JSON.stringify(answers) + '\n'); process.exit(1); }
  if (one('-ang') && !argv.includes('-nomerge')) { process.stderr.write(read('../hbond/legacy/ang.stderr')); process.exit(1); }
  if (one('-dan')) { process.stderr.write('fake gmx hbond-legacy: -dan is not in the fixtures\n'); process.exit(1); }
  hbondOutputs('legacy', answers.slice(0, 2).map(a => names[+a]), [['-num', 'hbond_nvt.xvg'], ['-dist', 'hbond_nvt_dist.xvg'], ['-ang', 'hbond_nvt_ang.xvg']]);
}

if (argv[0] === '--version') process.stdout.write(OLD ? readFileSync(new URL('./fixtures/gmx-2023.3/version.txt', import.meta.url), 'utf8') : read('version.txt'));
else if (tool === 'rdf' && argv[1] === '-h') process.stdout.write(read('rdf-h.txt'));
else if (tool === 'energy' && argv[1] === '-h') process.stdout.write(read('energy-h.txt'));
else if (tool === 'awh' && argv[1] === '-h') process.stdout.write(read('awh-h.txt'));
else if (tool === 'awh') awh();
else if (tool === 'wham' && argv[1] === '-h') process.stdout.write(read('wham-h.txt'));
else if (tool === 'wham') wham();
else if (tool === 'distance' && argv[1] === '-h') process.stdout.write(read('distance-h.txt'));
else if (tool === 'distance') distance();
else if (tool === 'hbond' && argv[1] === '-h') process.stdout.write(OLD ? readFileSync(new URL('./fixtures/gmx-2023.3/hbond-h.txt', import.meta.url), 'utf8') : read('hbond-h.txt'));
else if (tool === 'hbond-legacy' && OLD) { process.stderr.write(readFileSync(new URL('./fixtures/gmx-2023.3/hbond-legacy.stderr', import.meta.url), 'utf8')); process.exit(1); }
else if (tool === 'hbond-legacy' && argv[1] === '-h') process.stdout.write(read('hbond-legacy-h.txt'));
else if (tool === 'hbond') (OLD ? hbondLegacy : hbondNew)();
else if (tool === 'hbond-legacy') hbondLegacy();
else if (tool === 'energy') energy();
else if (tool === 'rdf') await rdf();
// gmx dump: the real head of the test system's dump, or of an umbrella window's (300 K, 663 atoms) for those (R6).
else if (tool === 'dump' && /umbrella\.tpr$/.test(one('-s') || '')) { process.stderr.write(banner('dump')); process.stdout.write(readFileSync(new URL('./fixtures/wham/dump-head.txt', import.meta.url), 'utf8')); }
else if (tool === 'dump') { process.stderr.write(banner('dump')); process.stdout.write(read('dump-head.txt').replace(/natoms = 3242/g, 'natoms = ' + natomsOf(one('-s')))); }
else if (tool === 'select') select();
else if (tool === 'check') { process.stdout.write('Checking file ' + one('-f') + '\n'); process.stderr.write(read('check.stderr').replace('# Atoms  3242', '# Atoms  ' + natomsOf(one('-f')))); }
else { process.stderr.write('fake gmx: unsupported: ' + argv.join(' ') + '\n'); process.exit(1); }
