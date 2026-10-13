# Frozen old-format fixtures

Made once with the code at commit `29cd410` (before the first format change of feature
batch 1) and **never regenerated** (spec §1.3). Tests read copies; nothing writes here.

- `schema-1-vault/`: a vault tree at schema version 1. Project "Sugar PMFs": WRWYCR (group
  `hmr+fast+6`) with HA runs 1–2, PG run 1, an RDF analysis on HA run 1, the structure
  `test.pdb` and a row note; KRWYCR with HA run 1. The runs carry `methods`, including
  `false` values and an empty object. `.matrix/cache/` is git-ignored by the vault itself.
- `export-v4.json`: the same project exported by `exportDataset` (originals as base64).
- `export-v3.json`: the same rows in the prototype's v3 shape (`exportJSON`: the Store plus
  `structData`, no originals).

## Second set (feature batch 2, item R4-0)

Made once with the code at commit `4e0dd0d` (before the batch-2 format change) and
**never regenerated**.

- `schema-2-vault/`: a vault tree at schema version 2. Project "Sugar PMFs": WRWYCR with HA
  runs a (tags `add`, `hmr`) and b (`fast`) and PG run a (no tags); KRWYCR with HA run a
  (`prosecco75`). Also an RDF on HA run a with two curves, the second labelled "second sugar"
  by hand (`custom`). A histogram on HA run b with 21 curves (`hist_500000.xvg`). The
  structure `test.pdb` and a row note. Settings: RDF marker maximum with a y-value label;
  tags list with an extra `long`. PG run a is dimmed.
- `export-v5.json`: the same project exported by `exportDataset` (originals as base64).

## Third set (feature batch 3, item F-0)

Made once with the code at commit `3de24e2` (before the batch-3 format change) and
**never regenerated**.

- `schema-3-vault/`: a vault tree at schema version 3. Project "Sugar PMFs": WRWYCR with HA
  runs a (tags `add`, `hmr`, 310.15 K) and b (`fast`, `long`, 300 K) and PG run a (dimmed);
  KRWYCR with HA run a (`prosecco75`) and PG run a (hidden), whose file is the two-column
  `translocation_free_energy.dat` (negative x), stored as a PMF the way the upload took it
  then. Analyses: an RDF on WRWYCR HA run a with two curves (the first one shade +2, the
  second labelled "second sugar" by hand); a histogram on HA run b with 21 curves (curve 1
  shade −1, curve 4 hidden, curve 6 dimmed); a minimum distance stored as `dist` on KRWYCR
  HA run a. The structure `test.pdb`, a row note, a cell note and a reference on WRWYCR × HA,
  and a page "Favourites" (both rows, HA and PG). Settings: every run in the row graph,
  hidden runs left out; RDF marker maximum with a y-value label; histogram smoothing light
  with a maximum and an x-value label; the tags list with an extra `long`.
- `export-v6.json`: the same project exported by `exportDataset` (originals as base64).
