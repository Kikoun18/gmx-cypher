# Roadmap

## Feature batch 2

The spec is `docs/feature-batch-2.md`; the Phase 0 report is `docs/feature-batch-2-phase0.md`. Decisions continue in `docs/feature-decisions.md` from F49.

The baseline is `feature-batch-1` at `1b77388`: lint 0 errors, 7 warnings; build passes with 1 warning (3Dmol `eval`); 212 tests in 14 files.

**Why this order:** R2 is one pure function shared by the screen and the exports, the smallest fix. R1 may wait on a file, so it starts early (R1a/R1b can be built on the fixtures; R1c waits for the files). R3 adds markers before R4 changes how curves are coloured and hidden, so R4 can make markers follow both in one place. R4 is the only request likely to change the on-disk format, so it comes last.

### Phase 0: Plan
- [x] Branch created; baseline commit, lint, build and test results recorded
- [x] Phase 0 report for R1–R4, with screenshots of the visual options
- [x] My R1 file reproduced (or the verified causes confirmed): `cccccccc.gro` 16 pink atoms, `mmmmmmmm.gro` 56; the prototype fix gives 0
- [x] Questions answered; decisions F49–F66 recorded
- [x] Roadmap order confirmed

### Phase 1: Fixes
- [x] R2 Tick labels show the tick's true value, on screen and in exports (+16 / −10 app code; 20 tests)
- [x] R1a Every atom gets its real element before 3Dmol sees it (pure, tested); no pink atoms or fan-shaped bonds (+72 / −3 app code; 43 tests)
- [x] R1b Style choice as a tested pure function; no style leaves the canvas empty (+25 / −13 app code; 12 tests)
- [x] R1c Viewer fixes from Phase 0 (default style, hydrogens, lines, anything my file shows) (+43 / −14 app code; 8 tests; real GPU run still yours, F66)

### Phase 2: Analysis markers
- [x] R3a Extreme finder (pure), with ties, gaps and smoothing defined (+11 app code; 10 tests)
- [x] R3b Marker setting per analysis type (graph settings and Settings → Analyses), with the label choice (+26 / −3 app code; 11 tests)
- [x] R3c Markers drawn on screen and in exports; stat tile follows the setting (+44 / −22 app code; 4 tests)

### Phase 3: Curve colours and visibility
- [x] R4-0 Frozen schema-2 vault and v5 export fixtures (section 1.3) (no app code; 2 tests)
- [x] R4a Shade function (pure): column colour, default spread, black and white, contrast (+60 app code; 12 tests)
- [x] R4b Every analysis curve drawn in its column's shades; black-and-white switch (+52 / −38 app code; 7 tests)
- [x] R4c Per-curve hide/dim, and the two hidden-flag backlog items (+40 / −21 app code; 14 tests)
- [x] R4d Per-curve shade adjustment (+23 / −7 app code; 9 tests)
- [x] R4e Persistence: curve visibility and shade on the curve record; schema 3, export v6 (+22 / −4 app code; 11 tests)

### Phase 4: Finish
- [x] README updated
- [x] Manual QA checklist run in Chrome; results recorded (passed, failed or not run), with screenshots (real GPU: not run, the user's)
- [x] Fresh-context review of the whole batch diff against section 10 (a reviewer that didn't write the code); six findings, all fixed (F80; +15 tests)
- [x] Final report `docs/feature-batch-2-report.md`

## Feature batch 1

The spec is `docs/feature-batch-1.md`. Decisions are in `docs/feature-decisions.md`, and the Phase 0 analysis is in `docs/feature-batch-1-phase0.md`.

The baseline is `vault-storage` at `0343abccdaaed8d5ca625744bbf4f5535f90d09d`:
- lint: 0 errors, 7 warnings (`react(only-export-components)`);
- build: passes, with 1 warning (direct `eval` in 3Dmol);
- tests: 79 passed (5 files).

**Why this order:**
- Small, contained fixes come first, to learn the code and the test harness.
- Upload safety comes next, because R1 builds on the same upload flow. R6's read-once/hash-once pipeline becomes R1d's reading pipeline.
- Tags change the on-disk format, so they come last, in their own phase.
- The frozen old-format fixtures move to the start of Phase 3 (F30). R1c adds a project settings key, and the fixtures must be made with unchanged code.

### Phase 0: Plan
- [x] Branch created; baseline commit, lint, build and test results recorded
- [x] Phase 0 report for R1–R7
- [x] Questions answered; decisions F1–F33 recorded
- [x] Roadmap order confirmed (R2-0 moves to the start of Phase 3, F30)

### Phase 1: Small fixes (no on-disk change)
- [x] R3 Remove prototype leftovers (+12 / −35)
- [x] R4 Header evidence beats file-name keywords (+17 / −11 app code; 11 tests)
- [x] R5 Merge preview: count and list what will be dropped (+63 / −24 app code; 12 tests)

### Phase 2: Upload safety
- [x] R6 Duplicate warning on every upload path (10 tests)
- [x] R7 Drop files onto a matrix cell (+37 / −7 app code; 3 tests)

### Phase 3: Folder import and provenance
- [x] R2-0 Frozen old-format fixtures committed (section 1.3), before R1c (F30) (4 tests)
- [x] R1a GROMACS header parser: version, tool, command line, working directory, creation date (+39 parser, +17 cache; 12 tests)
- [x] R1b R4 also uses the parsed tool name (`gmx awh` → PMF), approved (F13), with F32 (5 tests)
- [x] R1c Path pattern setting, with a live tester in Settings (+113 / −31 app code, over the +70 / −10 estimate because of the tester and plan UI; 40 tests)
- [x] R1d Folder choose-and-drop, with relative paths in the upload plan and R6's duplicate check (+165 / −23 app code; 7 tests; F11 measured, see F43)
- [x] R1e Provenance shown on run cards (+50 app code; 4 tests)

### Phase 4: Tags
- [x] R2a Project tag list in settings, editable like analyses (6 tests)
- [x] R2b Runs carry tags; schema migration from `methods` to tags (8 new tests, 2 adapted)
- [x] R2c Upload dialog, run editor and labels use tags; export, import and legacy migration updated (3 tests, 1 adapted)

### Phase 5: Finish
- [x] README updated
- [x] Manual QA checklist run in Chrome; results recorded (passed, failed or not run)
- [x] Fresh-context review of the whole batch diff against section 13 (a reviewer that didn't write the code); findings fixed or recorded (6 found, 6 fixed, F48)
- [x] Final report `docs/feature-batch-1-report.md`

### Backlog (not in this batch; from an earlier review)
- Undo/redo: deferred by decision. It needs undo-aware handling of the trash, uploads and background store patches.
- ~~Moving a hidden run in the run editor (`updateRun`) leaves the "hidden" flag on the old slot.~~ Fixed in batch 2, R4c (F65).
- ~~Deleting a hidden run leaves the flag on the empty slot, so the next run uploaded there starts hidden (`visOf` persists it).~~ Fixed in batch 2, R4c (F65).
- ~~Axis tick labels are rounded to fixed decimals: ticks at 0.25 steps read "0.3, 0.8, 1.3", including in exports (`buildPlotMulti`).~~ Fixed in batch 2, R2.
- Importing a dataset JSON permanently overwrites newer local notes (`importJSON`).
- Column keys are not capped at 24 characters, although D11 says they are (`newColumn`).
- The default file-name pattern reads the run letter as the sequence (F1: kept). (The second half, "an unreadable `{run}` falls back to run 1", was fixed in R1c, F5.)
- Accessibility: dialogs don't take or keep focus; the viewer start screen isn't keyboard-usable; accent-red contrast is 3.75:1.
- Fonts load from Google Fonts and jsDelivr at runtime; they should be self-hosted.

### Backlog: found during feature batch 2
- A marker label can overlap a neighbouring curve or another label (labels flip side only at the right edge). Seen in `qa-export.png`.
- In a read-only vault the detail window still shows the legend inputs, curve move/remove, run edit/delete and "+ analysis" (only notes are disabled). Changes stay in memory and are never saved. This predates batch 2; the new per-curve display controls (visibility, shade) are display choices and may stay.
- Coarse-grained (Martini) structures aren't supported by the viewer: bead names such as `SC1` read as their first letter (`BB` is now undecided).

### Backlog: found during Phase 0
- ~~`UploadDialog` re-runs `planBatch`, which re-picks every curve, on every render.~~ Fixed in R1d (memoised plan, picks cached per table).

### Backlog: found during R1d
- Saving a very large upload blocks the page: 3,000 runs take about 2.5–3 s in one task (production build), almost all in `addRun` rounding every point with `toFixed(4)` (11 million calls). Planning and typing stay under 200 ms; only the save is slow. Faster rounding would have to give identical values, so it is left for a separate change.

### Backlog: found during R2a
- Removing an analysis that has data (Settings → Analyses → remove analysis → "delete N curve sets?") deletes the curves but leaves the analysis in the list. `SettingsDialog` calls `setSetting` (a `mutate`) and then `commit(removeAnalysisData(store, …))` with the stale store, whose settings still hold the old list. Seen in Chrome. The tag delete in R2a avoids this by doing both in one `mutate`.

### Backlog: found during R7
- In a read-only vault, dropping files on the matrix still opens the upload dialog (`App.onDrop` has no read-only guard; true before R7). Cells themselves are not drop targets when read-only.
