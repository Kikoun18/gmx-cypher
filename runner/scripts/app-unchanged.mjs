// Section 0.1 (T44): app/ stays exactly as the baseline commit, nothing changed, added or removed.
import { execFileSync } from 'node:child_process';

const BASELINE = 'e8a452ccdcaf9112eebce5004ebccaffa947236d';
const git = (...args) => execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
const changed = git('diff', '--stat', BASELINE, '--', '../app') + git('status', '--porcelain', '--untracked-files=all', '--', '../app');
if (changed) {
  console.error('app/ differs from the baseline ' + BASELINE.slice(0, 7) + ':\n' + changed);
  process.exit(1);
}
console.log('app/ unchanged since ' + BASELINE.slice(0, 7));
