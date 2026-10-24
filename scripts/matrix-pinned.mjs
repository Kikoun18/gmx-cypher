// matrix/ (the Matrix, a git submodule: github.com/Kikoun18/the-matrix) is where gmx-cypher's server, page and tests take the
// vault format and the file parsers from. It must be checked out at the commit this repository pins, with nothing changed in
// it: a test that passes against another or a modified checkout says nothing about the pin (section 0.1, T44, which this
// replaces: the check used to be a tree hash of the app/ folder that lived here).
//
// To use a newer Matrix on purpose: `git -C matrix fetch && git -C matrix checkout <commit>`, run the tests, and commit
// `matrix` here: that commit is the decision. gmx-cypher never changes the Matrix; a change to it is made in its own repository.
import { execFileSync } from 'node:child_process';

const root = new URL('../..', import.meta.url).pathname;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (...lines) => { console.error(lines.join('\n')); process.exit(1); };

let pinned;
try { pinned = git(root, 'rev-parse', ':matrix'); }
catch { fail('Cannot read the commit of matrix/ that this repository pins: run this from a git checkout of gmx-cypher.'); }

let have;
try { have = git(root + 'matrix', 'rev-parse', 'HEAD'); }
catch { fail('matrix/ is not checked out. Run: git submodule update --init', '(or clone with: git clone --recurse-submodules <gmx-cypher>)'); }

if (have !== pinned) {
  fail('matrix/ is at ' + have.slice(0, 7) + ', but this repository pins ' + pinned.slice(0, 7) + '.',
    'Run: git submodule update --init matrix',
    '(to use the newer one on purpose: git add matrix, and commit it)');
}

const changed = git(root + 'matrix', 'status', '--porcelain').split('\n').filter(Boolean);
if (changed.length) {
  fail('matrix/ has changes (' + changed.length + '), first: ' + changed.slice(0, 3).join(' | '),
    'gmx-cypher never changes the Matrix; make the change in github.com/Kikoun18/the-matrix and pin that commit here.');
}

console.log('matrix/ is the Matrix at ' + pinned.slice(0, 7) + ' (' + git(root + 'matrix', 'log', '-1', '--format=%s') + '), as pinned, unchanged');
