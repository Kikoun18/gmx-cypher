// The Matrix (github.com/Kikoun18/the-matrix) is where gmx-cypher's server, page and tests take the vault format and the
// file parsers from. gmx-cypher is checked out as cypher/ inside the-matrix (a git submodule there), and the Matrix it
// uses is that checkout's own matrix/, beside it: the-matrix's commit pins gmx-cypher and holds the Matrix it is tested
// with. Nothing may be changed in matrix/: a test that passes against a modified Matrix says nothing about the commit
// (section 0.1, T44; until the move into the-matrix this checked a matrix/ submodule of gmx-cypher's own).
//
// To use a newer Matrix on purpose: commit it in the-matrix, run the tests here, then commit cypher in the-matrix: that
// commit is the decision. gmx-cypher never changes the Matrix; a change to it is made in matrix/ and committed there.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const umbrella = new URL('../..', import.meta.url).pathname;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (...lines) => { console.error(lines.join('\n')); process.exit(1); };

let pinned;
try { pinned = git(umbrella, 'rev-parse', ':cypher'); }
catch {
  fail('gmx-cypher is not checked out as cypher/ inside the-matrix, so there is no Matrix beside it (../matrix).',
    'Clone it with: git clone --recurse-submodules https://github.com/Kikoun18/the-matrix');
}
if (!existsSync(umbrella + 'matrix/package.json')) fail('the-matrix has no matrix/ beside cypher/: ' + umbrella);

const changed = git(umbrella, 'status', '--porcelain', '--', 'matrix').split('\n').filter(Boolean);
if (changed.length) {
  fail('matrix/ has changes (' + changed.length + '), first: ' + changed.slice(0, 3).join(' | '),
    'Commit them in the-matrix first: the tests run against a Matrix that is committed, unchanged.');
}

const have = git(umbrella + 'cypher', 'rev-parse', 'HEAD');
console.log('../matrix is the Matrix at ' + git(umbrella, 'log', '-1', '--format=%h (%s)', '--', 'matrix') + ', unchanged'
  + (have === pinned ? '' : '; the-matrix pins gmx-cypher at ' + pinned.slice(0, 7) + ', this is ' + have.slice(0, 7)));
