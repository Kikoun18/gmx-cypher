# Golden snapshots

Made once with the code at commit `3de24e2`, before any batch-3 change, and **never
regenerated**. Later code is checked against them (`test/golden.test.ts`); where a change is
intended, the test names the exception and the decision that allows it.

- `parse.json`: `parseTable`, `parseGmxHeader` and `detectAna` (default analysis types) for
  every data fixture: the pre-batch-3 ones (`hmrfast6_ha_a_t200000.xvg`, `gmx/`) and the
  batch-3 examples. Columns are pinned by count, first and last value and a SHA-256 of every
  value written with `String()` (so `NaN` counts).
- `pmf.json`: `curveStats` (min, position, area, SHA-256 of the corrected curve) of every run
  in the three frozen vaults and four frozen exports, each cell's mean of `area` and `min`
  with every run and with hidden runs left out, and `maxMag`. Also the PMF fixture alone at
  310.15 K and 300 K. Numbers are the doubles as JSON writes them.
- `markers.json`: `curveMark` (maximum with a y label, minimum with an x label) on every
  curve of every `gmx/` fixture, raw and at each smoothing level.
- `scenes/`: exports downloaded from the running app (Chromium, 1280 × 1000) with
  `formats/schema-3-vault` open. PDFs are deterministic; the xvg files start with an
  export time, which comparisons skip. Default state: corrected curves, shared y-axis,
  column shades, the vault's own settings.

  | File | What was open |
  |---|---|
  | `pmf-cell-WRWYCR-HA` | cell WRWYCR × HA, PMF |
  | `pmf-cell-WRWYCR-HA-raw-own` | the same, raw curves, y-axis fitted to this cell |
  | `rdf-cell-WRWYCR-HA` | the same cell, RDF tab |
  | `rdf-cell-WRWYCR-HA-bw` | the same, black and white |
  | `hist-cell-WRWYCR-HA` | the same cell, Histogram tab |
  | `dist-cell-KRWYCR-HA` | cell KRWYCR × HA, Distance tab |
  | `pmf-cell-KRWYCR-PG-hidden` | cell KRWYCR × PG, every run hidden (xvg only) |
  | `pmf-row-WRWYCR` | row WRWYCR, every run |
  | `matrix-area`, `matrix-min` | the matrix export, Area and Min |
