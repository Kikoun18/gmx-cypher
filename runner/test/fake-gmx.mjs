#!/usr/bin/env node
// A fake gmx for tests (T9). Everything it prints or writes is real GROMACS 2025.4 text from
// test/fixtures/gmx-2025.4, with the header's command, working directory and group names taken from its
// own arguments. FAKE_GMX_FRAMES (11), FAKE_GMX_SLOW (ms per frame) and FAKE_GMX_FAIL change its run.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

/** Like GROMACS: an existing output is renamed to #name.N#, never overwritten silently. */
function backUp(file, log) {
  if (!existsSync(file)) return;
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

if (argv[0] === '--version') process.stdout.write(read('version.txt'));
else if (tool === 'rdf' && argv[1] === '-h') process.stdout.write(read('rdf-h.txt'));
else if (tool === 'rdf') await rdf();
else { process.stderr.write('fake gmx: unsupported: ' + argv.join(' ') + '\n'); process.exit(1); }
