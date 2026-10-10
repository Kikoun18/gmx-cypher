#!/usr/bin/env node
// A fake gmx-eta for tests (R10a): `gmx-eta -a` prints your sample (test/fixtures/cluster-tools/gmx-eta-a.txt).
import { readFileSync } from 'node:fs';

if (JSON.stringify(process.argv.slice(2)) !== '["-a"]') { process.stderr.write('fake gmx-eta: not a command gmx-cypher runs\n'); process.exit(2); }
process.stdout.write(readFileSync(new URL('./fixtures/cluster-tools/gmx-eta-a.txt', import.meta.url), 'utf8'));
