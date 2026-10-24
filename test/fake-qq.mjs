#!/usr/bin/env node
// A fake qq for tests (R10a): `qq jobs -e` and `qq jobs -a` print your sample (test/fixtures/cluster-tools/qq-jobs.txt),
// or the file FAKE_QQ_OUT names (R15: a test changes it between reads). Anything else is refused, so a test sees any
// other command. FAKE_QQ_LOG=<file> appends one line per start (its arguments and COLUMNS); FAKE_QQ_SLOW=<ms> waits
// first; FAKE_QQ_FAIL=1 fails with an invented message (no real sample of an expired ticket exists).
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_QQ_LOG) appendFileSync(process.env.FAKE_QQ_LOG, JSON.stringify({ args, columns: process.env.COLUMNS ?? null }) + '\n');
if (process.env.FAKE_QQ_SLOW) await new Promise(r => setTimeout(r, Number(process.env.FAKE_QQ_SLOW)));
if (JSON.stringify(args) !== '["jobs","-e"]' && JSON.stringify(args) !== '["jobs","-a"]') { process.stderr.write('fake qq: not a command gmx-cypher runs: ' + args.join(' ') + '\n'); process.exit(2); }
if (process.env.FAKE_QQ_FAIL) { process.stderr.write('fake qq (invented text): could not authenticate: no valid Kerberos ticket\n'); process.exit(1); }
process.stdout.write(readFileSync(process.env.FAKE_QQ_OUT || new URL('./fixtures/cluster-tools/qq-jobs.txt', import.meta.url), 'utf8'));
