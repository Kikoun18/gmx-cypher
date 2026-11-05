#!/usr/bin/env node
// A fake python for SymBuilder's two shipped scripts (R5b), named by the script it is given. build_peptide.py writes
// its .pdb and its picture, each the smallest file of its kind marked "fake" (PyMOL prints nothing the notebook kept);
// hmr.py prints gromologist's real output from the notebook (test/fixtures/build/notebook/tools/gromologist.txt) and
// writes the hydrogen-mass topology and the two .itp files it splits off, each of the right shape only.
// FAKE_PYTHON_FAIL=<script> makes that script exit 1 with a Python traceback's last line.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [script, ...args] = process.argv.slice(2);
const name = basename(script || '');
const done = code => process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
if (process.env.FAKE_PYTHON_FAIL === name) { process.stderr.write("ModuleNotFoundError: No module named 'pymol'\n"); done(1); }
else if (name === 'build_peptide.py') {
  const [sequence, pdb, png] = args;
  writeFileSync(pdb, 'REMARK fake: ' + sequence + ' as PyMOL would build it, of the right shape only\nEND\n');
  // The smallest PNG there is: one transparent pixel.
  writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'));
  process.stdout.write('built ' + sequence + ': ' + pdb + ', ' + png + '\n');
  done(0);
} else if (name === 'hmr.py') {
  const [top, out] = args;
  process.stdout.write(readFileSync(new URL('./fixtures/build/notebook/tools/gromologist.txt', import.meta.url), 'utf8'));
  writeFileSync(out, '; fake: gromologist\'s hydrogen-mass topology, of the right shape only\n' + readFileSync(top, 'utf8'));
  writeFileSync('Protein.itp', '; fake: the peptide split off by gromologist\n[ moleculetype ]\nProtein 3\n');
  writeFileSync('CARB.itp', '; fake: the saccharide split off by gromologist\n[ moleculetype ]\nCARB 3\n');
  process.stdout.write(out + ' written, with Protein.itp and CARB.itp beside it\n');
  done(0);
} else { process.stderr.write('fake python: no script ' + name + '\n'); done(2); }
