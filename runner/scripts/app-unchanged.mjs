// app/ (PMF Sequences) stays exactly as its baseline: nothing changed, added or removed (section 0.1, T44).
// The baseline is the content (git tree) hash of app/, which a commit can carry itself; the working tree is hashed
// through a temporary index, so a change counts whether committed or not, and ignored files (node_modules, dist) don't.
// It moves only when you ask for a change to PMF Sequences (T142, T143): the line below says which one it is.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The tree hash of app/ and what it is. History: e8a452c (after batch 2); then the batch 3 source with the matrix tiles' spread off by default. */
const BASELINE = { tree: '909876e0138ebe09eec6de8a3b5b7fce64cef49d', what: 'PMF Sequences batch 3, as its source came' };

const root = new URL('../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'gmxc-app-index-'));
try {
  const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: join(dir, 'index') } });
  run('read-tree', '--empty');
  run('add', '-A', '--', 'app');
  const tree = run('write-tree', '--prefix=app/').trim();
  if (tree !== BASELINE.tree) {
    console.error('app/ differs from its baseline (' + BASELINE.what + '): tree ' + tree.slice(0, 7) + ', not ' + BASELINE.tree.slice(0, 7) + '.\n'
      + 'Compare with: git diff --stat <commit that set the baseline> -- app   (gmx-cypher never changes app/ unless you ask)');
    process.exit(1);
  }
  console.log('app/ unchanged: ' + BASELINE.what + ' (' + tree.slice(0, 7) + ')');
} finally { rmSync(dir, { recursive: true, force: true }); }
