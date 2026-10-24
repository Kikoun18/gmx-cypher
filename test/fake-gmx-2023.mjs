#!/usr/bin/env node
// The fake gmx as GROMACS 2023.3 answers for the H-bond tools (R8): gmx hbond is the legacy one, gmx hbond-legacy none.
process.env.FAKE_GMX_VERSION = '2023.3';
await import('./fake-gmx.mjs');
