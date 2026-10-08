// Headless migration (spec §16, §20): a legacy dump → a vault directory, using
// the Node backend. Verification is part of the migration; the exit code is 1
// if it fails.
//
//   npx vite-node scripts/migrate-legacy.ts -- <legacy-dump.json> <vault-dir>
//   npm run migrate:fixture        (test/fixtures/legacy-dump.json → .vault-out)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeBackend } from './node-backend';
import { interpretDump, parseDump } from '../src/lib/storage/migration/legacy';
import { formatReport, migrateLegacy } from '../src/lib/storage/migration/migrate';

const args = process.argv.slice(2).filter(a => a !== '--');
if (args.length < 2) {
  console.error('usage: vite-node scripts/migrate-legacy.ts -- <legacy-dump.json> <vault-dir> [--report <file.json>]');
  process.exit(2);
}
const [dumpPath, outDir] = args;
const ri = args.indexOf('--report');
const reportPath = ri >= 0 ? args[ri + 1] : null;

const data = interpretDump(parseDump(readFileSync(resolve(dumpPath), 'utf8')));
mkdirSync(resolve(outDir), { recursive: true });
const { report, vault } = await migrateLegacy(new NodeBackend(resolve(outDir)), data, { progress: m => console.error(m) });
await vault.close();
console.log(formatReport(report));
if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
process.exit(report.ok ? 0 : 1);
