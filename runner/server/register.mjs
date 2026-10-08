// Loaded with `node --import`: checks Node can strip TypeScript types, then installs the resolve hook (T1).
import { register } from 'node:module';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error('gmx-cypher needs Node 22.18 or newer (this is ' + process.versions.node + ').');
  process.exit(1);
}
register('./ts-hook.mjs', import.meta.url);
