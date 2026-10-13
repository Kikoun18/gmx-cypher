# Feature batch 3: final report

Spec: `docs/feature-batch-3.md`. Phase 0 analysis: `docs/feature-batch-3-phase0.md`.
Decisions: F81–F136 in `docs/feature-decisions.md`. Baseline: `387ad7c` (end of batch 2), branch
`feature-batch-3`.

## 1. Summary

App code is `src/`, `public/py/`, `scripts/` and `vite.config.ts`; tests are the new `it` blocks
(table rows counted once).

| Item | Status | App files | App lines + / − | Tests | Decisions |
|---|---|---|---|---|---|
| Phase 0 | done | — | — | — | F81–F110 |
| F-0 Frozen fixtures, goldens | done | — (fixtures only) | — | 9 | F111 |
| R1a Parser | done | `seq.ts`, `storage/cache.ts`, `storage/path.ts`, `types.ts` | +54 / −15 | 9 | F112, F113 |
| R1b Recognition | done | `seq.ts`, `types.ts`, `UploadDialog.tsx`, `SettingsDialog.tsx`, `DetailDialog.tsx` | +72 / −60 | 12 | F83, F84, F114 |
| G-0 Graph model | done | new `graph.ts`, `DetailDialog.tsx`, `CompareDialog.tsx`, `seq.ts`, `ctx.ts`, `ui.tsx` | +198 / −152 | 1 (8 scenes) | F108, F115 |
| R1c-1 Labels from the file | done | `graph.ts`, `seq.ts`, `Plot.tsx`, `export.ts`, `DetailDialog.tsx`, storage | +124 / −37 | 11 | F82, F109, F116 |
| R1c-2 Styles, decimation | done | `graph.ts`, `seq.ts`, `Plot.tsx`, `export.ts`, `DetailDialog.tsx`, `SettingsDialog.tsx` | +101 / −25 | 6 | F85, F117 |
| R2 Correction setting | done | `seq.ts`, `graph.ts`, `App.tsx`, `Matrix.tsx`, `SettingsDialog.tsx`, `DetailDialog.tsx`, `CompareDialog.tsx` | +149 / −73 | 8 | F87, F88, F118 |
| F-1 Schema 4, export v7 | done | `types.ts`, `seq.ts`, storage (`records`, `plan`, `model`, `exchange`, `manifest`, `settings`, `path`) | +116 / −33 | 12 | F119 |
| R6 Line style | done | `DetailDialog.tsx`, `CompareDialog.tsx`, `graph.ts`, `seq.ts` | +52 / −13 | 5 | F103, F120 |
| R7 Change type | done | `seq.ts`, `DetailDialog.tsx`, `App.tsx`, `ctx.ts`, `storage/plan.ts`, `storage/project.ts` | +198 / −6 | 6 | F104, F121 |
| R3a Sandbox | done | `public/py/sandbox.html`, `sandbox.js`, `py.ts`, `pyFiles.ts`, `scripts/check-sandbox.ts`, `vite.config.ts` | +296 / −2 | 3 (+ browser check) | F92–F95, F122 |
| R3b Scripts in the vault, trust | done | new `scripts.ts`, `trust.ts`, `FunctionsPanel.tsx`; storage; `App.tsx` | +460 / −23 | 10 | F89–F91, F96, F123 |
| R3c Calls and transforms | done | new `scriptRuns.ts`, `sha256.ts`, `TransformPicker.tsx`; `scripts.ts`, `graph.ts`, `seq.ts`, storage | +495 / −58 | 18 | F86, F124 |
| R4a Metrics | done | new `metrics.ts`, `MetricPicker.tsx`, `scriptHooks.ts`; `App.tsx`, `Matrix.tsx`, `prefs.ts` | +467 / −72 | 11 | F97, F98, F125 |
| R4b Scales, tiles, provenance | done | new `scales.ts`, `matrix.ts`; `metrics.ts`, `Matrix.tsx`, `export.ts`, `pmf.ts` (+ follow-up) | +228 / −85 | 8 | F99, F126 |
| R4c Example tiles | done | `MetricPicker.tsx` | +2 / −1 | 6 | F127 |
| R5a Hover readout | done | new `interact.ts`; `Plot.tsx`, `graph.ts`, `DetailDialog.tsx`, `App.tsx` | +157 / −20 | 9 | F101, F102, F128 |
| R5b Marks | done | `Plot.tsx`, `graph.ts`, `interact.ts`, `seq.ts`, `DetailDialog.tsx` | +77 / −15 | 5 | F100, F129 |
| R5c Reference lines | done | `Plot.tsx`, `graph.ts`, `interact.ts`, `seq.ts`, `DetailDialog.tsx` | +65 / −8 | 5 | F130 |
| R5d List, Compare, exports | done | new `PinList.tsx`; `graph.ts`, `export.ts`, `CompareDialog.tsx` | +130 / −7 | 3 | F131 |
| R8a Export settings | done | new `exportPrefs.ts`, `folders.ts`, `ExportSettings.tsx`; `export.ts`, `graph.ts`, dialogs | +377 / −77 | 12 | F105, F132 |
| R8b The export key | done | new `keys.ts`; `App.tsx`, `DetailDialog.tsx`, `CompareDialog.tsx`, `SettingsDialog.tsx`, `Plot.tsx` | +78 / −27 | 3 | F133 |
| R8c Hold E, batch | done | `App.tsx`, `graph.ts`, `keys.ts` | +79 / −23 | 3 | F106, F134 |
| R8d Legend, several graphs | done | `export.ts`, `exportPrefs.ts`, `metrics.ts`, `App.tsx`, dialogs | +206 / −63 | 7 | F107, F110, F135 |
| R8 Spread in matrix exports | done | `matrix.ts`, `export.ts` | +5 / −3 | (golden) | F136 |
| README | done | `README.md` | — | — | — |
| Review fixes, first pass | done | `py.ts`, `scripts.ts`, `matrix.ts`, `export.ts`, `metrics.ts`, `seq.ts`, `scripts/check-sandbox.ts` | +70 / −20 | 6 (+ a browser check) | F137 |
| Review fixes, second pass | done | `scriptRuns.ts`, `metrics.ts`, `matrix.ts`, `graph.ts`, `export.ts`, `storage/exchange.ts`, `Matrix.tsx`, `CompareDialog.tsx`, `FunctionsPanel.tsx`, `scriptHooks.ts`, `App.tsx` | +107 / −50 | 6 | F138 |
| QA, report | done | — | — | — | — |

Totals, baseline → this report: app code 51 files, **+3,982 / −584** (Phase 0 estimate ≈ +2,700 / −400;
each item's overrun is explained in its decision). Tests (`test/`, without fixtures) +2,330 / −26.
Test count **390 → 652** (20 → 45 files): 250 with the items, 12 with the review fixes. Lint: 7 warnings (the baseline's); build: 1 warning (the baseline's 3Dmol `eval`).

## 2. Per request

### R1: any data in, shown properly

**Before:** a file was a PMF unless a keyword in its name matched a type; `nan` rows were dropped
silently; labels came from the type ("Time (ps)" on a temperature graph), Grace markup was stripped
("kg m-3"); every analysis was a line.

**After:**
- The parser reads `@ xlabel` / `@ ylabel` / `@ xaxis label`, commas, `nan` / `inf` / empty fields as
  missing values, row names from comment lines, and Grace and LaTeX markup into super- and subscripts
  and Unicode (F112, F113).
- Recognition by evidence in a stated order: GROMACS tool, then header keywords, then file-name words;
  no match is **Data**, never a PMF; the plan shows the source (F83, F114). Seven types for the
  example files (F84); old projects get the new types without a migration.
- Graphs take the file's labels when its curves agree (F82, F116), with units in their own case
  (F109); points, bars and auto styles; drawing-only decimation for large files (F117).
- G-0 moved the graph model into a pure `buildGraph()` with byte-identical golden scenes (F115); every
  later item (and every export) uses it.

**Known limitations:** content evidence only chooses points vs line for Data (F85). Where a type came
from (`typeFrom`) is stored and shown in the upload plan, but not on run cards afterwards. Drawing the
25,001-point Temperature tab still takes one task of about 0.4 s without a GPU (F110, F135).

### R2: the PMF correction is a setting

**Before:** the matrix always used the entropy-corrected curve; the dialog's corrected/raw switch
changed only the graph.

**After:** PMF's transform (entropy correction, none, or a script function) is a project setting, and
each analysis type has its own (default none); matrix, graphs, Compare, wells and exports follow it;
Settings shows how many tiles change before **apply**; the transform is named everywhere; "show raw"
is a temporary, labelled view (F87, F88, F118). Default numbers are bit for bit the golden ones; the
translocation profile is uncorrected as Free energy (z).

**Known limitations:** analysis curves corrected with the entropy correction use the project's
temperature (runs use their own).

### R3: custom Python scripts, sandboxed

**Before:** none.

**After:**
- **Sandbox (F122):** self-hosted Pyodide 314.0.7, loaded on first use into an opaque-origin `data:`
  worker inside a hidden same-origin page with a strict CSP; the deny-list is removed along the
  prototype chain; 10 s per call (the worker is replaced after a timeout). `npm run check:sandbox`
  verifies it in Chromium (playwright-core, approved dev dependency).
- **Scripts in the vault (F123):** `.py` uploads in Settings → Functions are kept byte for byte in
  `_scripts/`; functions are discovered with Python's `ast` without running anything (cached by
  SHA-256); trust is per vault folder, script record and SHA-256, in this browser only; a file changed
  on disk never runs.
- **Calls (F124):** one validated interface for matrix functions and transforms: finite points in
  (missing ones counted), a fresh namespace per call, results checked by role, parameters checked;
  answers cached by the SHA-256 of their inputs in `.matrix/cache/<project>/values.json`; provenance
  (file, SHA-256, function, values, Python version) on every tile and graph.

After the review: a call can't change another's answer (modules are put back after every call, F137), results
must be finite numbers, and answers kept in the vault's cache count only where the script is trusted and
unchanged (F138).

**Known limitations:** standard library only, no numpy (F91). Transformed curves over 10,000 points are
cached in memory only. The first use downloads about 13 MB. All trusted scripts share one interpreter, so a
script written to tamper with Python's internals on purpose could still affect another's later answers; trust is
per script for that reason.

### R4: the matrix from any analysis and function

**Before:** Area or Min of the corrected PMF only, with a magnitude scale.

**After:** metrics are definitions (type, curve, transform, function and values, unit, scale) saved in
`metrics.json`, chosen per page from a picker with built-ins (mean, max, minimum, barrier, value at x,
mean ± block error), saved metrics and the scripts' functions (F97, F98, F125). Tiles show the mean
with ± SD and n, or one run's block error; errors show as "—" with the reason; tooltips give the full
provenance; scales from zero, min–max or diverging, with legends and exports to match (F99, F126). Area
and Min are unchanged; the example files give section 3's values (F127).

**Known limitations:** the aggregate is always the mean over runs. The type-change preview, the
correction preview and the row view's tiles still use Area or Min.

### R5: interactive graphs

**Before:** static graphs.

**After:** hover and keyboard readout at the nearest data point of the full data, with units, and the
raw value when smoothed (F101, F102, F128); marks by click or Enter, stored as curve and x and read
from the data, flagged when gone (F100, F129); reference lines by Ctrl/⌘+click and Ctrl/⌘+Enter, per
graph (F130); a list under the graph to edit, remove and add them, drawn in Compare and in every
export (F131).

**Known limitations:** the hover box shows at most 8 curves (the readout line names the active one).

### R6: line style per curve

A swatch beside each curve and PMF run card picks automatic (by place) or one of ten patterns; used in
the graph, legend, Compare and exports; a shared style where colour can't tell curves apart warns
(F103, F120). Automatic gives today's dashes byte for byte.

### R7: change an analysis's type

"change type…" on a run or analysis card: another type, or PMF run ↔ analysis, re-read from the
original; curve IDs, legends, shades, visibility and line styles kept by position; the preview lists
curves, points, matrix values before → after and every file move and trash item, from the planner's
dry run (F104, F121).

**Known limitations:** an analysis with more than one curve can't become a PMF run (said in the panel).

### R8: exports

**Before:** xvg, png or pdf from a menu, fixed size, downloads only, no key.

**After:**
- **Settings → Export** (F105, F132): default format (svg added), size in px or mm with journal
  presets, PNG scale or dpi, light / dark / print themes, font size, title block, grid, legend, layout
  of several graphs, file-name template with collision suffixes, and a destination folder (refused
  inside the vault, downloads as fallback). The defaults give the earlier exports byte for byte.
- **E** in a graph or Compare exports it as shown (F133); **hold E** on the matrix picks cells and
  exports them on release, **Shift** adds every analysis (F106, F134); the legend lists marks and the
  cell's matrix value; several graphs become one multi-page PDF (default), a grid figure or one file
  each (F107, F135); matrix exports show each tile's spread (F136).
- **F110 for exports:** the png of `temperature.xvg` is drawn in pieces; the longest task is 71 ms
  (was 1.6 s). pdf 113 ms, xvg 99 ms.

**Known limitations:** the file-name template names graphs; the matrix keeps its own name. A matrix
can't reflow, so a width scales it (the font size then follows). A height too small for the title,
legend and note gives a taller figure rather than a squashed plot. The matrix xvg has no spread
column. "One file each" to downloads may make the browser ask about multiple downloads (a folder
avoids that).

## 3. The example files, end to end

Uploaded together through the upload dialog into a new vault, `functions.py` uploaded and trusted, on
the final build in Chrome (QA run `r4cui`, `r1b`); exact values to six digits are also checked in Node
with real Pyodide (`test/exampleTiles.test.ts`).

| File | Recognised as (source) | Drawn as | Tile (app) | Reference (section 3) |
|---|---|---|---|---|
| `translocation_free_energy.dat` | Free energy (z) · header | line, file's labels, no correction | barrier 121.38 kJ/mol (built-in and `calc_barrier`); `calc_peak_distance` 1.84 | `calc_barrier` 121.377 |
| `membrane_thickness.dat` | Data · no match | line with gaps | `calc_mean` 3.84 nm, "74 of 86 points"; `calc_barrier` 0.459 | mean of the 74 finite points 3.83832; `nan` as written |
| `order_POPE.xvg` | Order parameters · header | points, carbon names as x ticks, 3 curves | `calc_mean` 0.293 / 0.307 / 0.282; `calc_peak_distance` error "ValueError: x must contain values on both sides of 0" | 0.292503 / 0.306884 / 0.281922; the same error |
| `phosphorus.xvg` | Density · header | line, "Density (kg m⁻³)" | `calc_peak_distance` 3.99 | 3.98748 (peaks at ±1.99374) |
| `temperature.xvg` | Temperature · header | 3 curves, 25,001 points, decimated for drawing | mean ± block error 310.04 ± 0.011 K (curve 1 in Chrome; 310.2416 and 309.7747 for the others in Node) | 310.0434 / 310.2416 / 309.7747 K |
| `pressure.xvg` | Pressure · header | line | 2.30 ± 1.2 bar (block error) | mean 2.2994 bar, SD 168.953 |
| `functions.py` | a script (Settings → Functions) | — | 3 matrix functions, units settable | — |

The thickness barrier is 0.45882, not section 3's raw-file 0.45883, because scripts get curves as
stored (six significant digits, D15; F124). Tiles show three significant figures; the tooltip and
tests carry the full values.

## 4. Screenshots (`docs/img/batch-3/`)

Each view of Phase 0's mock-ups as built, light (the item's own check) and dark (the same check re-run in the
dark theme). All were taken in headless Chromium at 1024 px wide.

| Phase 0 view | Light | Dark |
|---|---|---|
| 1. Upload plan: types and sources | `r1b-upload-plan.png`, `r1a-folder-plan.png` | `dark-01-upload-plan.png` |
| 2. Display styles | `r1c2-order-parameters.png`, `r1c2-data.png`, `r1c2-temperature.png`, `r1c1-density.png`, `r1c1-free-energy-z.png` | `dark-02-display-styles.png` |
| 3. Correction setting | `r2-settings-strip.png`, `r2-dialog-none.png` | `dark-03-correction-setting.png` |
| 4. Scripts and trust | `r3b-functions.png`, `r3b-trust-prompt.png`, `r3c-pmf-script-transform.png`, `r3c-graph-provenance.png` | `dark-04-script-trust.png` |
| 5. Metric picker, editor, tiles | `r4a-picker.png`, `r4a-editor.png`, `r4b-area-spread.png`, `r4b-diverging.png`, `r4b-script-error.png`, `r4c-*.png` | `dark-05-metric-picker.png` |
| 6. Hover, marks, lines | `r5a-hover-temperature.png`, `r5a-hover-phosphorus.png`, `r5b-marks-phosphorus.png`, `r5c-lines-pmf.png`, `r5d-list.png`, `r5d-compare.png` | `dark-06-graph-hover-lines.png` |
| 7. Line style | `r6-run-picker.png`, `r6-curve-dash-warning.png` | `dark-07-line-style.png` |
| 8. Change type | `r7-preview-rdf-density.png`, `r7-preview-run-to-analysis.png`, `r7-preview-clash.png` | `dark-08-change-type.png` |
| 9. Export settings | `r8a-settings.png`, `r8a-menu.png`, `r8d-settings.png`, `r8b-key.png` | `dark-09-export-settings.png` |
| 10. Batch export | `r8c-hold.png`, `r8b-toast.png` | `dark-10-batch-export.png` |

Exports themselves (the files the app wrote): `r5d-export.png`, `r8a-matrix-print.png` (85 mm, 300 dpi, print),
`r8a-graph-dark.png` (dark theme), `r8d-legend-right.png`, `r8d-legend-inside.png`, `r8d-grid.png` (grid figure),
`r8-matrix-spread.png`, `r4b-export-diverging.png`. Also: `f1-upgrade-banner.png` (schema 3 → 4),
`r1b-old-vault-analyses.png`, `g0-dialog-hist.png`, and Phase 0's mock-ups `phase0-01…10`.

## 5. On-disk changes

- **Schema 3 → 4** (F119): one step that writes no file; the vault is backed up as usual and only the
  version moves, so an older app opens a version-4 vault read-only instead of dropping fields. Every
  new field is optional and cleaned on read, write and import.
- **Export v6 → v7**: carries the new fields and the scripts' originals (base64 + SHA-256); imported
  scripts get new IDs and arrive untrusted; v6–v3 still import.
- **New on disk:** `{project}/_scripts/` (script originals), `.matrix/settings/<project>/metrics.json`,
  `pmfTransform` and `metric` in `settings.json`, `.matrix/cache/<project>/values.json` and
  `parsed/<sha256>.py-discover-1.json` (derived); the table cache moved to `xvg-table-2`.
- **In the browser only:** trust (IndexedDB `pmf-script-trust`), the export folder
  (`pmf-export-folder`), export settings and keys (`pmf-ui-prefs-v1`).

Examples below are real: the frozen schema-3 vault, opened (upgraded to 4), then `functions.py` added,
a metric saved, a mark, a reference line and a line style set, and the RDF analysis changed to Density.

**Script record** (`project.json`, before: no `scripts` key):

```json
"scripts": [{ "id": "kmv4b7pp3nxzeh", "fns": { "calc_peak_distance": { "unit": "nm" } },
  "file": { "id": "fmv4b7pp3nxzeh", "kind": "script", "name": "functions.py", "origin": "upload", "owner": "pmv3ncwehsvzci",
            "path": "sugar-pmfs--pmv3ncwehsvzci/_scripts/functions.py", "sha256": "1fc1c7b4d1b6ec8a…", "size": 977 } }]
```

**Matrix metric** (`metrics.json`, before: no file; `settings.json` gains `"metric": "peak-density"`):

```json
{ "metrics": [{ "id": "peak-density", "label": "calc_peak_distance · Density", "type": "density", "curve": 0,
  "fn": { "kind": "script", "script": "kmv4b7pp3nxzeh", "fn": "calc_peak_distance" }, "agg": "mean", "unit": "nm", "scale": { "kind": "minmax" } }] }
```

**Mark and reference line** (the row record, before: neither key):

```json
"marks": [{ "curve": "rmv3ncwdc7h5hu", "x": 0.9677 }],
"lines": { "ha|pmf": [{ "axis": "x", "v": 1.5 }] }
```

**Line style** (a run, before → after: one key added):

```json
{ "id": "rmv3ncwdc7h5hu", "column": "ha", "slot": "a", "file": "fmv3ncwdcxf1lu", "tags": ["add", "hmr"], "temp": 310.15 }
{ "id": "rmv3ncwdc7h5hu", "column": "ha", "slot": "a", "file": "fmv3ncwdcxf1lu", "tags": ["add", "hmr"], "temp": 310.15, "dash": 3 }
```

**Type change** (an analysis, RDF → Density: same ID and curves, the folder renamed, `typeFrom` set):

```json
{ "id": "xmv3ncwe33avui", "type": "rdf",     "dir": "…/wrwycr--smv3ncwdcs8nwt/rdf-run-1--xmv3ncwe33avui",     "curves": [ … 2 curves … ] }
{ "id": "xmv3ncwe33avui", "type": "density", "dir": "…/wrwycr--smv3ncwdcs8nwt/density-run-1--xmv3ncwe33avui", "curves": [ … the same 2 … ], "typeFrom": "changed" }
```

## 6. Tests

**390 → 652** (20 → 45 files). New test files: `formats`, `recognition`, `labels`, `styles`,
`correction`, `schema3`, `schema4`, `golden`, `graph`, `linestyle`, `retype`, `sandbox`, `scripts`,
`scriptCalls`, `metrics`, `scales`, `matrix`, `exampleTiles`, `interact`, `marks`, `lines`, `pins`,
`exportPrefs`, `exportKey`, `exportBatch`, `exportLegend`. Golden tests (F-0) pin the parser, Area and
Min, wells, markers and the export scenes; each named change is listed where it is checked. Changed
existing tests say why in place (F114, F118, F119, R8a/R8d, F136).

The sandbox can only be checked in a browser: `npm run check:sandbox` (F95, F122).

### Manual QA (Chrome, headless; SwiftShader WebGL except the performance runs)

Every item's own check was re-run on the final code (the dev server, the same scripts as when each item was
built), plus the sandbox check and the performance run on the production build. Logs and screenshots of this
pass are in the session's scratch folder; the screenshots in `docs/img/batch-3/` are from the items.

| Check (spec section) | Result |
|---|---|
| Folder import of the unzipped archive, `__MACOSX/` included, offers exactly the six data files (§6) | passed: no `._` file, no `__MACOSX`, `functions.py` not offered as data |
| Every example file alone and together; the plan shows types and sources (§6) | passed: Data · no match; Order parameters, Density, Pressure, Temperature, Free energy (z) · header |
| Each drawn as section 3 says (§6) | passed: kJ mol⁻¹ and kg m⁻³ as superscripts, carbon names as x ticks, points for order parameters |
| `temperature.xvg` stays responsive (§6, F110) | partly: hover moves ≈ 45–50 ms; every export ≤ 113 ms per task; **drawing the Temperature tab is one task of about 0.4 s** (failed against F110, recorded) |
| An old vault upgrades, with the banner, data intact (F-1) | passed: schema 4 on disk, tiles as before |
| Correction none → tile count → apply → matrix and dialog follow (§7) | passed: "changes 3 tiles"; the graph says "no correction" |
| Upload `functions.py`, discovery, trust prompt by keyboard (Esc closes only it), unit, reload, replace (trust asked again, old in the trash), remove (§8) | passed |
| A script transform as the PMF correction: trust, values, preview, provenance note, reload from the cache, a failing transform's message (§8) | passed: "transformed by shift() from shift.py (SHA-256 48962f66db26…) · by = 5 · Python 3.14.2"; "returned 418 values for 419 points" |
| The sandbox in Chromium (§1.4, `npm run check:sandbox`) | passed, 10 of 10 (deny-list, vault data unreachable, eval / Function / cross-origin import refused with no request arriving, endless loop stopped, fresh worker, Python's message, a module one call changes is back for the next, no CSP violation) |
| Metric picker per page, a metric over RDF, a script metric, keyboard and Esc (§9) | passed (one assertion in the check updated: since R4b a new metric starts on the min–max scale, so its legend says "lowest to highest") |
| Spread, provenance tooltips, scales, an error tile, the matrix export with its scale (§9) | passed |
| Section 3's values as tiles in a new vault (§3, §9) | passed, before and after the review fixes (table in §3) |
| Hover on `temperature.xvg` and `phosphorus.xvg`; keyboard only; Esc (§10) | passed |
| Marks on phosphorus's two peaks by click and Enter; after a reload; none while the laser is on (§10) | passed |
| Reference lines on a PMF; ⌘ in the hints on macOS (§10) | passed (macOS by the browser's reported platform; no Mac hardware) |
| Marks & lines list, Compare, exports (§10) | passed |
| Line style picker by keyboard, Esc, the duplicate warning, the exported dash (§11) | passed |
| Change type with the preview; run → analysis → run; a clash; Esc (§12) | passed |
| Export settings; 85 mm print svg; 300 dpi png of the matrix; dark png; folder refused inside the vault; `-2` for a name already there (§13) | passed |
| E on an open graph and in Compare; not while typing or with Ctrl; another key; C, K and the arrows refused (§13) | passed |
| Hold E, three cells, release; Shift+E; no picks; a sequence; Esc; the batch file equals the dialog's (§13) | passed |
| Every format and layout; the legend with marks and the matrix value (§13) | passed: xvg, png, svg, pdf; one file each, multi-page pdf (3 pages), grid figure (3 graphs, 2 columns) |
| Review fixes in the browser (F137, F138): a module one call changes is back for the next (`check:sandbox`); hold E picks a cell with analyses only (one Free energy (z) PDF; Shift+E a 6-page PDF); trust given in the PMF correction picker shows at once in Settings → Functions; a reload is still served from the cache with no sandbox started; section 3's values unchanged | passed |
| Dark theme of the ten views | passed (screenshots above) |
| Works at 1024 px | passed: every check ran at 1024 px wide; Settings has no horizontal scroll |
| No console errors | passed: none in any run |

**Not run:** a real Mac (⌘ checked through the reported platform), a screen reader (names, roles and live regions
checked through the accessibility tree only), a browser with a GPU (all timings are software rendering), Firefox
and Safari (not supported by design).

## 7. Review

The spec asks for a reviewer that didn't write the code. Two fresh-context subagents reviewed the whole batch
diff (`git diff 387ad7c HEAD`) against sections 1 and 15, reading the code and confirming findings with temporary
tests they deleted afterwards.

**First pass.** The reviewer reached its session limit before it could report, but its probe test (five suspected
defects) was left in `test/`. I ran it, confirmed each (one by a proper test, since the probe's harness didn't
reach Python), wrote a failing test for each, fixed them and removed the probe (F137):

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | One script patching a shared module (`statistics.mean`, `json.dumps`) changed later calls of other scripts, and their cached answers | high | modules put back after every call; checked in Node and in Chromium (`check:sandbox`) |
| 2 | A script result's type wasn't checked: a string became a tile | high | only finite numbers accepted |
| 3 | The matrix export wrote two decimals for every metric ("0.29" for the tile's "0.293") | medium | the export writes the tile's own text |
| 4 | Importing into a project with the same row dropped the file's marks and lines | medium | merged, without doubles |
| 5 | Analysis → PMF run left marks on a curve that no longer existed, unmentioned | medium | marks move with their data, both ways |
| 6 | A tile's tooltip asked Python again for the untransformed curve | low | asks exactly as the tile did |

**Second pass, complete** (on the code after F137; the reviewer couldn't run `check:sandbox`, which needs
Chromium; I ran it). Ten findings (F138):

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | Answers kept in the vault's cache skipped trust, the on-disk check and the type check | medium-high | every answer passes the same gate; a kept one counts only if well formed; a reload still starts no Python |
| 2 | Hold E couldn't pick a cell with analyses only | medium | export picks take any cell with data |
| 3 | Import didn't follow a metric's own script transform | medium | followed |
| 4 | A mark's value was read from the smoothed drawing | medium | the value is the data's; the dot stays on the curve |
| 5 | The matrix export subtitle, tooltips and Compare named the wrong transform, or a script one without its file and SHA-256 | medium | the transform the tiles used, fully named |
| 6 | The points a metric reads were rebuilt on every redraw (≈ 120 ms for 300 runs with a script metric) | low-medium | cached: 16 ms |
| 7 | PDF text after a superscript was drawn 3.5 pt high | low | the rise is reset |
| 8 | Changing a type's transform in Settings → Analyses has no tile-change preview | low | recorded (backlog) |
| 9 | Trust shown in Settings → Functions and in the transform picker didn't follow each other | low | both ask again when trust is given |
| 10 | Code quality: a check written three times, a stale comment and title; helpers used only by tests; a duplicated IndexedDB helper; `sanitizeIds` and marks | low | the first two fixed; the rest recorded (the helpers are golden checks and inverses) |

Things the second reviewer checked and found sound: the sandbox (CSP, opaque worker, deny-list before user code,
origin checks, one call at a time, time limit and fresh worker, discovery never runs the file), trust keys, the
on-disk step and field cleaning, script originals through rename, trash and restore, export v7 and import IDs,
Area and Min through `curveStats`, decimation for drawing only, the keys' rules, recognition and labels.

## 8. Decisions

F81–F136 in `docs/feature-decisions.md`: F81–F110 are the Phase 0 answers (all recommendations
accepted), F111–F136 record each item as built, with its budget against the Phase 0 estimate.

## 9. Roadmap and backlog

Every item of `docs/roadmap.md` (Feature batch 3) is done. Backlog added by this batch:
- Drawing the Temperature tab of `temperature.xvg` (25,001 points × 3, dashed) is one task of about 0.4 s
  without a GPU; F110's 100 ms for interactions isn't met there. The dialog's SVG would need the same
  piecewise drawing as the png export (F135).
- Where a run's type came from (`typeFrom`) is stored and shown in the upload plan, but not on run cards.
- Reference lines stay stored under their old graph key when a type change removes that tab (they come back
  if the tab does).
- All trusted scripts share one Python interpreter; a script written to tamper with Python's internals on
  purpose could affect another's later answers (F137). A separate interpreter per script would close it, at
  about 13 MB and a few seconds per script.
- The matrix xvg has no spread column; the type-change and correction previews and the row view's tiles use
  Area or Min only.
- Changing a type's transform in Settings → Analyses applies at once, without the tile-change preview PMF's
  correction has (review, F138).
- `sanitizeIds` doesn't re-key marks and reference lines when it renames an unsafe ID (only hand-made exports
  have those); the IndexedDB helper is written twice (`trust.ts`, `folders.ts`).

## 10. History

```text
9ffe5a5 Phase 0: feature batch 3 spec, roadmap, plan and mock-ups
3de24e2 Phase 0: decisions F81-F110 and the example files
c6fa2bb F-0: frozen schema-3 vault, v6 export and golden snapshots
87c6146 R1a: parser reads @ xlabel, commas, row names and label markup
fb88844 R1b: recognition by evidence; unknown files become Data
3c753df G-0: graph model out of DetailDialog into a pure buildGraph()
905e079 R1c-1: graph labels from the file, with super- and subscripts
56ff825 R1c-2: points, bars and auto styles; decimation for drawing only
401b1a7 R2: the PMF correction is a setting, per type
737e26d F-1: schema 4 and export v7, fields only
672eb8d R6: line style per curve and run
01d150f R7: change an analysis's type, with a preview of every consequence
a657ef9 R3a: a self-hosted, sandboxed Pyodide worker with time limits
6d93424 R3b: scripts kept in the vault, functions read from the code, trust per SHA-256
bb1c48f R3c: one validated interface for script functions and transforms, cached by content
368c257 R4a: matrix metrics as definitions, with Area and Min as built-ins
26d33fb R4b: colour scales per metric, tiles with spread and errors, provenance tooltips
6a43906 R4c: the example files' tiles give section 3's reference values
055e39b R4b: a new barrier metric starts on the from-zero scale (F99)
cef7a5d R5a: hover and keyboard readout from the full data
219c487 R5b: marks by click or Enter, snapped to the data
ff02e6a R5c: reference lines by Ctrl/⌘+click, kept with their graph
5251c12 R5d: marks and lines listed, edited and removed; drawn in Compare and exports
5dda0c6 R8a: export settings (format, size, scale, theme, font, title, grid, names, folder)
f0ed325 R8b: E exports the open graph (or comparison) as shown, in the default format
0b96657 R8c: hold E on the matrix to pick cells, release to export them; Shift adds every analysis
aa31a6e R8d: legend of marks and the matrix value; several graphs as one PDF or a grid figure
4d0a825 R8: matrix exports show each tile's spread (± SD, or block error)
2193764 Docs: README for feature batch 3, with a guide for writing scripts
918e2fa Review fixes: calls kept apart, results checked by type, export numbers, import marks, retype marks
de37dce Review fixes (second pass): cache behind trust, analyses-only picks, marks from data, provenance
(and the commit adding this report)
```

`git diff --shortstat 387ad7c HEAD`, by area:

```text
app code (src, public, scripts, vite.config.ts, package.json): 51 files changed, 3982 insertions(+), 584 deletions(-)
tests (without fixtures): 31 files changed, 2330 insertions(+), 26 deletions(-)
test fixtures (example files, frozen vault, goldens): 58 files changed, 112860 insertions(+)
docs and README (before this report): 69 files changed, 1742 insertions(+), 21 deletions(-)
```
