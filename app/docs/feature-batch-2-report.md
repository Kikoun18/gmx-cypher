# Feature batch 2: final report

Spec: `docs/feature-batch-2.md`. Phase 0 analysis: `docs/feature-batch-2-phase0.md`.
Decisions: F49–F79 in `docs/feature-decisions.md`. Baseline: `1b77388` (end of batch 1).

## 1. Summary

| Item | Status | App files | App lines + / − | Tests | Decisions |
|---|---|---|---|---|---|
| Phase 0 | done | — | — | — | F49–F66 |
| R2 Tick labels | done | `seq.ts` | +17 / −10 | 20 | F56, F67 |
| R1a Real elements | done | `structFile.ts`, `StructurePanel.tsx` | +79 / −4 | 43 | F49, F50, F68 |
| R1b Styles never empty | done | `structFile.ts`, `StructurePanel.tsx` | +36 / −20 | 12 | F53–F55, F69 |
| R1c Defaults, hydrogens, water, lines | done | `structFile.ts`, `StructurePanel.tsx` | +46 / −16 | 8 | F51, F52, F70 |
| R3a Extreme finder | done | `seq.ts` | +11 / −0 | 10 | F71 |
| R3b Marker setting | done | `seq.ts`, `types.ts`, `DetailDialog.tsx`, `SettingsDialog.tsx` | +30 / −3 | 11 | F57, F58, F72 |
| R3c Markers drawn, tile | done | `seq.ts`, `export.ts`, `Plot.tsx`, `DetailDialog.tsx`, `CompareDialog.tsx` | +55 / −26 | 4 | F58, F59, F73 |
| R4-0 Frozen fixtures | done | — (fixtures only) | — | 2 | F74 |
| R4a Shade function | done | `shade.ts` | +63 / −0 | 12 | F62, F63, F75 |
| R4b Column shades, black and white | done | `shade.ts`, `DetailDialog.tsx`, `ctx.ts`, `seq.ts`, `prefs.ts`, `types.ts` | +52 / −38 | 7 | F60, F61, F76 |
| R4c Hide/dim per curve | done | `seq.ts`, `types.ts`, `DetailDialog.tsx` | +40 / −21 | 14 | F65, F77 |
| R4d Shade per curve | done | `shade.ts`, `types.ts`, `DetailDialog.tsx` | +23 / −7 | 9 | F63, F78 |
| R4e Persistence | done | `records.ts`, `manifest.ts`, `plan.ts`, `model.ts`, `exchange.ts` | +22 / −4 | 11 | F64, F79 |
| README | done | `README.md` | — | — | — |
| Review fixes | done | `structFile.ts`, `seq.ts`, `export.ts`, `Plot.tsx`, `DetailDialog.tsx`, `StructurePanel.tsx` | +44 / −24 | 15 | F80 |
| QA, report | done | — | — | — | — |

Total app code (`src/`), baseline → review fixes: 17 files changed, 466 insertions(+), 121 deletions(-). Tests: **212 → 390 (+178)**: 163 with the items, 15 with the review fixes (§6).

## 2. Per request

### R1: the 3D viewer draws real elements and never shows an empty canvas

**Before.**
- 3Dmol guessed elements from atom names. In the user's files, `2HB`/`3HB`/`1HE` became element "2"/"3"/"1", drawn pink with fans of bonds: 16 pink atoms in `cccccccc.gro` and 56 in `mmmmmmmm.gro`.
- A `.pdb` with a lowercase element column or a `0` behaved similarly.
- Cartoon showed nothing for peptides without a 3Dmol-recognised backbone, and nothing at all for sugars.
- Lines were 1 px wide.
- Hydrogens differed between `.pdb` and `.gro`.

**After.**
- `toPdb` writes one PDB text for both formats, with each atom's element decided by `elementOf` (F50). Atoms that can't be decided are not drawn and are named under the viewer. 0 pink atoms in every fixture and both user files, checked against 3Dmol's own parser in Node.
- Styles come from `structStyle`:
  - cartoon draws the ribbon, thin side chains and every non-protein residue as sticks;
  - with no backbone, cartoon shows sticks and says so;
  - lines are thin sticks;
  - atoms without bonds are drawn as small spheres.
- Defaults come from `defaultView`: sticks, or cartoon for 30 or more protein residues. Water and ions are hidden above 800 atoms.
- Hydrogens are hidden by default in both formats; there are toggles for hydrogens and for water & ions.

**Known limits.**
- A C-terminal residue without an `O` atom gets no ribbon segment (3Dmol).
- No real solvated system was available for the 800-atom rule.
- The real-GPU check is the user's (F66). Everything here ran in SwiftShader.

### R2: axis labels show each tick's true value

**Before:** ticks at 0.25 steps read "0.3, 0.8, 1.3", on screen, in Compare and in exports.

**After:** `tickLabel(v, step)` gives "0.25, 0.5, 0.75" everywhere. Tick positions are unchanged (pinned by a test to the old values).

### R3: choose what an analysis graph marks

**Before:** every analysis graph marked its maximum with a plain dot, and the tile always said "Peak".

**After:**
- Each analysis type marks its maximum, its minimum or nothing. The defaults are maximum for RDF and RMSF and none for the rest.
- The marker can carry an x or y label.
- It is set in the graph settings and in Settings → Analyses.
- The mark is found on the curve as drawn, so it follows smoothing. There is one marker per shown curve.
- The first tile says "Maximum"/"Minimum" (+ " · smoothed") with the value, its x and the curve's legend.
- Exports draw the same marks, from the same objects.
- The PMF minimum marker is unchanged (tested against `runStats`).

**Known limit:** a marker label can overlap a neighbouring curve (`qa-export.png`).

### R4: curves in their column's shades, with hide/dim and shade per curve

**Before:**
- In a cell, run 1 took the column colour and run 2 black.
- Run 3 onward took *other columns'* colours.
- The curves of one run cycled through the whole palette, all solid.
- The row view gave every curve of a column the same colour and dash.

**After:**
- `curveShade` / `graphShades` (`shade.ts`) give every curve a shade of its own column's colour and a dash, by its position among the curves present (hidden ones included, so hiding never recolours). The first curve keeps the column colour.
- Every shade keeps ≥ 3:1 contrast on the theme's panel and page and on the export's white. This is tested for every palette colour, 1–10 curves, both themes and exports.
- Black and white (a browser preference in the graph settings) draws greys with dashes. In black and white, positions count across the whole graph so dashes tell columns apart.
- Each curve cycles shown → dimmed → hidden from the Curves list, and can be moved up to three steps lighter or darker, or reset. Hidden curves leave the series, markers and tiles; dimmed curves count.
- Both are saved on the curve record (schema 3) and travel in exports (v6).
- The PMF runs of the cell view follow the same rule. Compare is unchanged.
- Also fixed: run visibility now follows a run moved in the editor, and is forgotten when a deleted run leaves its slot empty (two backlog items, F65).

**Known limits.**
- PMF curves have no per-curve shade or visibility of their own; their run chips do that.
- Dimmed curves in exports keep the old light grey (exempt from 3:1 by the spec).

## 3. Screenshots (`docs/img/batch-2/`)

| What | Before | After |
|---|---|---|
| User's file in sticks (pink bonds) | `r1-app-ccccccccgro-sticks-before.png`, `r1-app-mmmmmmmmgro-sticks-before.png` | `r1-app-ccccccccgro-sticks-after.png`, `r1-app-mmmmmmmmgro-sticks-after.png` |
| A `.gro` in cartoon | `r1-wta912-cartoon-today.png` | `r1-app-wta912-cartoon-after.png`, `r1-app-pepsugar-cartoon-after.png`, `r1c-mmmmmmmmgro-cartoon-dark.png` |
| Hydrogens, water & ions, lines | `r1-lines-1px.png` | `r1c-ccccccccgro-default.png`, `r1c-ccccccccgro-hydrogens.png`, `r1c-solvatedgro-default.png`, `r1c-solvatedgro-waterions.png`, `r1c-ccccccccgro-lines.png` |
| 0.25-step axis, screen and png | `r2-dialog-before.png`, `r2-export-before.png` | `r2-dialog-after.png`, `r2-export-after.png` |
| RDF with a maximum marker | — | `r3c-rdf-max.png`, `r3c-rdf-max-smoothed-label.png`, `r3c-export-max.png`, `r3c-rdf-none.png` |
| Three-run analysis, colour | `r4-three-runs.png` | `r4b-three-runs.png`, `r4b-export.png` |
| Three-run analysis, black and white | — | `r4b-bw.png`, `r4b-bw-export.png` |
| 21 curves, dark theme | — | `r4b-hist-dark.png`, `r4b-hist-export.png` |
| Hide/dim, shade per curve | — | `r4b-chip-dim.png`, `r4c-hide-dim.png`, `r4d-adjusted.png`, `r4d-export.png` |
| 1024 px, dark, marker labels, export | — | `qa-1024-dark.png`, `qa-export.png` |

## 4. On-disk changes

- **Schema 2 → 3.**
  - `CurveRec` may carry `vis` (`"dim"`/`"off"`) and `shade` (−3…3, non-zero).
  - The migration step writes nothing. The version moves so an older app, which would drop the fields when it saves, opens the vault read-only.
  - `curveDisplay` cleans both fields on write and on read.
  - Upgrade, interrupted upgrade, rerun, newer-is-read-only and round-trip tests run against the frozen schema-2 vault (`test/fixtures/formats/schema-2-vault/`, made with the code at `4e0dd0d`).
- **Export v5 → v6.** Curves already travelled whole, so only the number changed. v5, v4 and v3 still import (frozen files).
- **Settings (no version change, F72).** `analyses.json` entries may carry `marker` and `markerLabel`. Black and white is a browser preference (`bw`), not in the vault.

A curve record, before (schema 2) and after (schema 3, dimmed, one step darker):

```json
{"custom": true, "file": "fmux8q7c6tjxqb", "id": "cmux8q7c7hih88", "label": "second sugar", "parse": {"xCol": 1, "xScale": 1, "yCol": 2}}
{"custom": true, "file": "fmux8q7c6tjxqb", "id": "cmux8q7c7hih88", "label": "second sugar", "parse": {"xCol": 1, "xScale": 1, "yCol": 2}, "shade": -1, "vis": "dim"}
```

An analysis definition in `analyses.json`, before and after R3b:

```json
{"k": "rdf", "label": "RDF", "match": "rdf, radial", "name": "Radial distribution function", "style": "line", "xCol": 1, "xLabel": "r (nm)", "xScale": 1, "yCols": "2", "yLabel": "g(r)"}
{"k": "rdf", "label": "RDF", "marker": "max", "markerLabel": "y", "match": "rdf, radial", "name": "Radial distribution function", "style": "line", "xCol": 1, "xLabel": "r (nm)", "xScale": 1, "yCols": "2", "yLabel": "g(r)"}
```

## 5. Tests

**212 before (14 files), 390 after (20 files)**: 375 after R4e, +15 with the review fixes.

New test files:
- `plot.test.ts`: tick labels and positions.
- `structure.test.ts`:
  - elements for every fixture and both user files, through 3Dmol's own parsers;
  - no H with two bonds;
  - every look draws every atom;
  - the defaults.
- `markers.test.ts`:
  - the extreme finder (ties, gaps, smoothing);
  - marker settings round trip;
  - marks;
  - the PMF minimum unchanged.
- `shade.test.ts`:
  - shades distinct, hex and ≥ 3:1 for every palette colour, 1–10 curves, three backgrounds;
  - clamping;
  - greys;
  - `graphShades` (no other column's hue, hiding never recolours, black and white across the graph);
  - `nextShade`;
  - the preference.
- `curveVis.test.ts`: the visibility table, `shownCurves`, markers without hidden curves, and the two run-flag fixes.
- `schema3.test.ts`:
  - the 2 → 3 upgrade: clean, rerun-safe, interrupted before and after the commit point;
  - schema 4 opens read-only;
  - curve round trip and cleaning;
  - v6 round trip;
  - v5/v4/v3 import.
- `formats.test.ts`: the frozen schema-2 vault and v5 export.

Existing tests changed (F79): seven version assertions in `tags.test.ts` and `exchange.test.ts` now use `SCHEMA_VERSION`/`EXPORT_VERSION` instead of 2/5. What they check is unchanged.

Lint: 7 warnings, the baseline (`ui.tsx`, `Laser.tsx`). Build: only 3Dmol's `eval` warning, as before.

### Manual QA (Chrome, headless, SwiftShader WebGL)

| Check | Result |
|---|---|
| User's `cccccccc.gro` / `mmmmmmmm.gro` in sticks: no pink atoms | passed |
| `.gro` and `.pdb` in cartoon: ribbon plus everything else; peptide without backbone says "shown as sticks" | passed |
| Hydrogens toggle, water & ions toggle, lines readable, dark theme | passed |
| Viewer on a real GPU | **not run** (the user's, F66) |
| 0.25-step axis on screen, in Compare and in the png | passed |
| RDF maximum marker; minimum; none; x/y label; smoothing moves the marker; tile text | passed |
| Exported png and pdf match the screen (markers, labels, shades, dashes) | passed (pdf saved and checked for size only; png compared visually) |
| Cell with three RDF runs: one hue, three shades, three dashes | passed |
| A file with 21 curves (histogram), dark theme | passed |
| Black and white on screen and in the png | passed |
| Dim/hide one run: the others keep their colour | passed |
| Hide and dim curves, lighter/darker/reset, all with the keyboard only (Tab + Enter) | passed |
| 1024 px wide, dark theme | passed |
| Console errors | none in any run |
| Reload keeps curve visibility and shade | passed by test (`schema3.test.ts`); not run in the browser |
| Read-only vault: display choices work, no editing controls | not run in the browser (vault read-only is tested; see backlog) |

## 6. Review

A fresh-context reviewer (a separate agent that hadn't written the code) read `git diff 1b77388..HEAD -- src test` against §10 and §1. It ran lint, build and tests (all passing) and edited nothing. Six findings; all fixed in `Review fixes for feature batch 2` (F80), +15 tests (375 → 390):

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | Element column trusted only for 29 elements; Cd/Hg columns and Cu/Ni/Co/Cs/Hg ions got wrong elements (Hg → hidden H); `BB` beads → boron | medium | Full periodic table for the column, more ions, first-letter guess limited to H C N O S P F K I; 11 new table rows |
| 2 | Run chip crashes for an analysis with no curves (hand-edited file only) | medium | Plain swatch fallback (component code, no unit test) |
| 3 | Imported curve `vis`/`shade` not cleaned before the first save (empty button name, string shade) | low | `curveDisplay` applied in `normExtra`; test |
| 4 | Dimmed curve's marker label full ink in exports; edge rule 50 vs 60 px | low | Label takes the curve's pale colour; shared `labelLeft`; 2 tests; `rv-dim-label-export.png` |
| 5 | Curve visibility buttons all named "shown"; changes not announced | low | `aria-label` with the curve's legend; changes announced in the `aria-live` Curves status |
| 6 | Viewer live region re-reads the fixed hint; a `.pdb` protein on chain W hidden with water | low | Notes in their own live span; solvent on chain `~`; test with a chain-W protein plus water |

Also checked and found fine by the reviewer: PMF maths, xvg parsing and matrix colours unchanged; the PMF minimum marker at the same point; Compare colours unchanged; tick labels; the extreme finder; hidden curves kept out of series, markers, tiles and autoscale; shade contrast ≥ 3.34:1 over every palette colour, 1–25 curves, every adjustment, colour and black and white, light/dark/export, against both page and panel; `bw` never written to the vault; schema 3 and export v6; the run-flag fixes; aria on the new buttons.

## 7. Decisions

F49–F66 (Phase 0 answers) and F67–F79 (one per item) in `docs/feature-decisions.md`.

## 8. Roadmap and backlog

All batch-2 items are ticked in `docs/roadmap.md`. Backlog changes:
- Fixed: tick labels (R2) and the two run-visibility flags (R4c).
- Still open: deleting an analysis with data leaves its definition in the list (logged in batch 1).
- Added from this batch: marker labels can overlap curves; the read-only detail window still shows editing controls for legends, curves and runs (predates the batch). Coarse-grained (Martini) structures are not supported: bead names such as `SC1` still read as their first letter.

## 9. History

Commits from the baseline `1b77388` to the review fixes (the report itself is the next commit):

```
5ccdf04 Review fixes for feature batch 2
a79496e Batch 2 docs: README features and vault format
7b0268a R4e: curve visibility and shade saved; schema 3, export v6
2599fc1 R4d: lighter, darker and reset per curve
43aa1c7 R4c: hide or dim each curve; run visibility follows the run
a65b212 R4b: curves in their column's shades; black and white
bda432e R4a: one pure shade function for curve colours
ed07db9 R4-0: frozen schema-2 vault and v5 export fixtures
4e0dd0d R3c: markers on screen and in exports; the tile follows
c0ee9b9 R3b: marker setting per analysis type
37e3668 R3a: one extreme finder for markers
b35e065 R1c: viewer defaults, hydrogens, water and ions, lines
cb495c8 R1b: style choice as a tested function; no style leaves the canvas empty
2b79fe6 R1a: every atom gets its real element before 3Dmol sees it
aad9764 R2: before screenshots for the report
90d6d43 R2: tick labels show the tick's true value
5e002e0 Phase 0: answers, decisions F49-F66, real structure files
b0ec6c1 Phase 0: feature batch 2 spec, roadmap and plan
```

`git diff --stat 1b77388..HEAD`:  120 files changed, 26613 insertions(+), 143 deletions(-) (mostly the frozen fixtures, the user's structure files and screenshots).
`src/` only: 17 files changed, 466 insertions(+), 121 deletions(-).
