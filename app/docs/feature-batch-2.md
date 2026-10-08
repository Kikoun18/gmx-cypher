# Task: Feature batch 2 — 3D viewer, axis labels, analysis markers and curve colours

PMF Sequences is a Vite + React + TypeScript app that keeps each project in a user-owned folder (the **vault**). The vault is documented in `app/README.md`, `app/docs/storage-redesign.md` and `app/docs/storage-decisions.md` (D1–D46). Feature batch 1 is finished and documented in `app/docs/feature-batch-1.md`, `app/docs/feature-decisions.md` (F1–F48) and `app/docs/feature-batch-1-report.md`. Read all of them before anything else.

This task makes four requested changes — two fixes and two features — without weakening any guarantee the vault gives:

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | The 3D structure viewer draws every atom with its real element and never shows an empty canvas; find and fix what's broken | fix | 5 |
| R2 | Axis labels show each tick's true value (0.25, 0.5, 0.75 …) | fix | 6 |
| R3 | Choose what an analysis graph marks: the maximum, the minimum or nothing | feature | 7 |
| R4 | Analysis curves in their column's colour (or black and white), with a per-curve shade and hide/dim | feature | 8 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

Where this spec says **verified**, the behaviour was checked against the code at the baseline. Confirm it anyway; if the code has changed, say so.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `app/` (the codebase) next to `README.md`, `chats/` and `project/` from the original design handoff. Those three are history: don't follow the root `README.md`'s instructions, and don't change them.
- **Every path and every `npm` command in this spec is relative to `app/`.**
- Work on a new branch, `feature-batch-2`, from the commit that holds the finished batch 1 (`feature-batch-1` HEAD, or wherever it was merged). Record that commit's hash in the Phase 0 report as the baseline.
- Baseline when this spec was written:
  - `npm run lint`: 0 errors, 7 warnings (`react(only-export-components)`);
  - `npm run build`: passes, with 1 warning (direct `eval` inside 3Dmol);
  - `npm test`: 212 tests pass in 14 files. Tests run in Node (no DOM, no WebGL).

### 0.2 Living documents

- Save this spec as `docs/feature-batch-2.md`.
- Add a **Feature batch 2** section to `docs/roadmap.md` with the checklist in section 3. Keep the existing backlog there; move items into or out of it as this batch changes them.
- Continue the decision log in `docs/feature-decisions.md` from **F49**, each decision with a one-line rationale.
- Save the Phase 0 report as `docs/feature-batch-2-phase0.md`.
- Finish with `docs/feature-batch-2-report.md` (section 13).

### 0.3 Phase 0: Investigate and plan (no code changes)

Scratch scripts and throwaway tests are fine, but keep them outside the repository or delete them. Only the Phase 0 documents are committed.

1. **Baseline.** Run `npm run lint`, `npm run build` and `npm test`. Record the results, the test count and the warning counts. If anything fails, or the numbers differ from section 0.1, stop and tell me.
2. **For each request R1–R4**, write:
   - **Current behaviour.** What the code does today, with file and function references. Verify it by reading the code, and where practical by running it. If this spec is wrong about the code, say so.
   - **Proposed change.** The smallest change that meets the requirements. Name every file you will touch.
   - **Code budget.** Estimated lines added and removed.
   - **On-disk impact.** Does it change records, settings, manifest, cache or the export format? If yes, give the schema and migration plan (section 1.3).
   - **Tests.** The tests you will write, by name.
   - **Risks.** Including interactions with the other requests.
   - **Open questions.** Each with options and your recommendation.
3. **Visual options.** R1, R3 and R4 change what I see. For each visual choice (default 3D style, hydrogens, marker look, shade range, black-and-white greys), show me screenshots of the options rather than describing them. Make them with throwaway prototypes (a scratch page outside the repository, or uncommitted changes you then discard). Only the screenshots are committed, in `docs/img/batch-2/`.
4. **Order.** Confirm the roadmap order in section 3, or propose a better one with reasons.
5. Put all open questions into **one numbered list** at the end of the Phase 0 report.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–3: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them and see them fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.** Simplify it, delete anything that became dead, match the surrounding naming and style, and remove debug output.
5. Run `npm run lint`, `npm run build` and `npm test`. All pass, with no new warnings.
6. Run the item's manual checks in Chrome (`npm run dev`) and watch the console. Take a screenshot of each visual check.
   - Headless Chromium can draw WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. A check passed in software rendering still needs one run on a real GPU; say which you did.
   - If you can't drive a browser, or a check needs a real user gesture, mark it **not run** and list it for me. Never report a manual check as passed unless you ran it.
7. Update `docs/roadmap.md` and `docs/feature-decisions.md`.
8. Commit (section 12).
9. Give me a short summary (3–5 lines): what changed, net lines added or removed, tests added, manual checks run or not run (with screenshots), and anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- a change would alter the vault's on-disk format or the export format;
- anything could delete, overwrite or hide user data;
- the code contradicts this spec or the approved plan;
- a request would exceed its code budget by more than about 50 %;
- you want to add a dependency;
- a test or check needs a structure or GROMACS file that isn't in `test/fixtures/`.

Batch your questions where you can, and give each one options and a recommendation. Don't ask about things the code, the docs or this spec already settle.

---

## 1. Principles

### 1.1 Minimal, concise code

- Make the smallest correct change. Extend an existing function before adding a new one. Add a new module or abstraction only when at least two places use it.
- Follow the existing architecture:
  - data edits are pure `Store → Store` transforms in `src/lib/seq.ts`;
  - persistence goes through `ProjectService` (`src/lib/storage/project.ts`), and components never know where files live;
  - plot geometry is computed once in `buildPlotMulti` (`seq.ts`) and drawn by `Plot.tsx` (screen) and `export.ts` (png/pdf); keep it that way.
- **Logic that decides something lives in a pure function with tests:** atom elements, the 3D style choice, tick labels, the extreme of a curve, curve shades. Components only call it.
- **No new runtime dependencies.** Add dev dependencies only with my approval.
- Delete code that becomes unused. No commented-out code, and no `TODO` without a roadmap entry.
- Match the surrounding style. Don't reformat unrelated code. Don't restyle the app; the inline-style approach stays as it is for now.
- Prefer clarity to cleverness: short functions, and names that use the app's own domain words (row, column, run, slot, analysis, curve).
- Report the net lines added or removed for every item.

### 1.2 Web development practice (for any new or changed UI)

- Use semantic elements: `<button>` for actions, and `<label>` tied to every input.
- Everything is reachable and operable by keyboard, with a visible focus.
- Status and warnings are announced (`aria-live="polite"`).
- **Colour is never the only difference.** Curves that differ in colour also differ in dash pattern or label.
- **Contrast:**
  - text at least 4.5:1 (the accent red on the light background is only 3.75:1, so don't use it for new text);
  - every curve, marker and swatch at least 3:1 against the plot background (WCAG 1.4.11), in the light theme, the dark theme and exports. Dimmed curves and their markers are faint on purpose and are exempt.
- Read-only vaults and the JSON viewer show no editing controls; display choices (style, visibility, shade) that aren't saved still work there.
- New keyboard handling never fires while focus is in an `input`, `textarea`, `select` or `contenteditable`, and doesn't clash with C (compare), K (laser), the arrow keys and Esc.
- The layout works at 1024 px wide and new UI causes no layout shift.
- No new console errors or warnings.

### 1.3 Data practice

- **Display never changes data.** Markers, shades, visibility, smoothing and axis labels change only what is drawn; originals and stored curves stay as they are.
- **Exports show what the screen shows:** the same curves, colours, dashes, markers and tick labels, in png and pdf. The xvg export stays data only.
- **Reported numbers say what they were computed on.** If a value comes from a smoothed curve, the tile says so.
- **Extremes are defined, not guessed:**
  - `null` and non-finite points are skipped;
  - on ties, the first point wins;
  - a curve with no finite points has no extreme and no marker.
- **On-disk format changes** (records, settings, manifest) need all of the following:
  - a bump of `SCHEMA_VERSION` (`records.ts`, now 2);
  - an explicit, tested step in `MIGRATIONS` (`manifest.ts`) that is safe to run again on a half-upgraded vault, with the existing backup to the trash;
  - tests for old vault → upgraded, and newer vault → read-only;
  - dataset JSON export and import (`exchange.ts`, now v5) that still round-trip, with v5, v4 and v3 exports still importing.
- **Additive settings keys** may skip the schema bump only if an older app keeps the key when it rewrites the file (the F30 precedent). Prove it with a test, and record it as a decision.
- **Old formats are tested against frozen fixtures.** Before the first change to records or the export format, generate with the unchanged code a schema-2 vault tree and a v5 export, each with analyses holding several curves. Commit them under `test/fixtures/formats/` in their own commit, and never regenerate them.
- **Determinism.** The same input gives the same output: default shades, tick labels and markers depend only on the data and settings, never on render order or timing.

---

## 2. Scope limits

Do not change:
- the PMF maths (`pmf.ts`), xvg parsing, the matrix colours, literature lookup or the upload flow;
- the PMF minimum marker in the dialog, Compare and exports (R3 is for analyses);
- the Compare dialog's colours, unless Phase 0 makes a case and I agree;
- any guarantee of the vault (`README.md`, sections *Authority rules* and *Write ordering*).

Undo/redo stays out.

The backlog in `docs/roadmap.md` stays out, except:
- the axis-label item, which becomes R2;
- the two hidden-flag items (`updateRun` and deleting a hidden run). R4 works in the same visibility code, so Phase 0 says whether fixing them there is cheap and safe, and asks me.

Bugs you find along the way go into the backlog, not into the code.

All existing functionality keeps working. All existing tests keep passing. Change an existing test only with a recorded reason.

---

## 3. Roadmap

Add this to `docs/roadmap.md` and keep it current.

**Why this order:**
- R2 is one pure function shared by the screen and the exports, the smallest fix;
- R1 may wait on a file from me, so it starts early;
- R3 adds markers before R4 changes how curves are coloured and hidden, so R4 can make markers follow both in one place;
- R4 is the only request likely to change the on-disk format, so it comes last.

### Phase 0: Plan
- [ ] Branch created; baseline commit, lint, build and test results recorded
- [ ] Phase 0 report for R1–R4, with screenshots of the visual options
- [ ] My R1 file reproduced (or the verified causes confirmed)
- [ ] Questions answered; decisions F49… recorded
- [ ] Roadmap order confirmed

### Phase 1: Fixes
- [ ] R2 Tick labels show the tick's true value, on screen and in exports
- [ ] R1a Every atom gets its real element before 3Dmol sees it (pure, tested); no pink atoms or fan-shaped bonds
- [ ] R1b Style choice as a tested pure function; no style leaves the canvas empty
- [ ] R1c Viewer fixes from Phase 0 (default style, hydrogens, lines, anything my file shows)

### Phase 2: Analysis markers
- [ ] R3a Extreme finder (pure), with ties, gaps and smoothing defined
- [ ] R3b Marker setting per analysis type (graph settings and Settings → Analyses)
- [ ] R3c Markers drawn on screen and in exports; stat tile follows the setting

### Phase 3: Curve colours and visibility
- [ ] R4-0 Frozen schema-2 vault and v5 export fixtures (section 1.3), if R4 changes the format
- [ ] R4a Shade function (pure): column colour, default spread, black and white, contrast
- [ ] R4b Every analysis curve drawn in its column's shades; black-and-white switch
- [ ] R4c Per-curve hide/dim
- [ ] R4d Per-curve shade adjustment
- [ ] R4e Persistence as decided (schema step, export version), if any

### Phase 4: Finish
- [ ] README updated
- [ ] Manual QA checklist run in Chrome; results recorded (passed, failed or not run), with screenshots
- [ ] Fresh-context review of the whole batch diff against section 10 (a reviewer that didn't write the code); findings fixed or recorded
- [ ] Final report `docs/feature-batch-2-report.md`

---

## 4. Files you will mostly work in

| Area | Where |
|---|---|
| 3D viewer | `src/components/StructurePanel.tsx` (`Viewer`), `src/lib/structFile.ts` (`structFormat`, `countAtoms`) |
| 3Dmol 2.5.5 source (read, don't change) | `node_modules/3dmol/build/3Dmol.js`, unminified: the PDB and GRO parsers (`keepH`), `atomNameToElem`, `assignPDBBonds`, `areConnected`, `bondLength`, `standardResidues`, `elementColors.defaultColor` |
| Plot geometry and ticks | `src/lib/seq.ts` (`buildPlotMulti`, `smoothY`, `smoothOf`, `SMOOTH_LEVELS`, `PALETTE`) |
| Drawing | `src/components/Plot.tsx`, `src/lib/export.ts` (`graphScene`, `rgb`), `src/components/CompareDialog.tsx` |
| Detail dialog | `src/components/DetailDialog.tsx` (`pushData`, series and markers, stat tiles, graph settings `GsRow`, run chips, `CurveRow`) |
| Colours | `src/ctx.ts` (`runHue`, `DASH`), `src/lib/pmf.ts` (`runStats`) |
| Settings | `src/components/SettingsDialog.tsx` (Analyses section), `src/lib/types.ts` (`AnalysisType`, `Curve`, `Settings`), `src/lib/storage/settings.ts` |
| Persistence | `src/lib/storage/records.ts` (`CurveRec`, `SCHEMA_VERSION`), `plan.ts` (curve records), `model.ts`, `manifest.ts` (`MIGRATIONS`), `exchange.ts` (`EXPORT_VERSION`) |
| Tests | `test/` (Vitest in Node, `MemoryBackend`, helpers in `test/helpers.ts`, real GROMACS files in `test/fixtures/gmx/`) |

---

## 5. R1: The 3D structure viewer draws real elements and never shows an empty canvas

### Today

`Viewer` in `StructurePanel.tsx` loads 3Dmol lazily and draws one of four styles. Structures with more than 800 atoms open in **cartoon**; smaller ones in **sticks**. In cartoon, the code also asks for sticks on `{ hetflag: true }`, with the comment "keep their heavy atoms visible under the cartoon".

**Verified** in headless Chromium (WebGL through SwiftShader), with `test/fixtures/test.pdb` and `test/fixtures/WTA.gro`, in the JSON viewer (dev server and production build) and in a vault (dev server):
- Sticks and spheres draw both files (but see the pink bonds below). Mouse rotation works.
- After opening and closing the viewer 21 times it still draws, with no WebGL warning in the console.
- There are no console errors.
- **Cartoon draws nothing for a `.gro`.** Cartoon needs a protein backbone, and WTA.gro (a teichoic-acid fragment) has none. The sticks fallback selects `hetflag`, which a `.gro` file never sets: it has no HETATM records.
- **So a large `.gro` opens blank.** A 912-atom `.gro` (WTA.gro tiled six times) opens to an empty canvas, because more than 800 atoms means cartoon. Switching to sticks shows it.
- **For a `.pdb` peptide, cartoon shows only the ribbon.** `test.pdb` has 58 ATOM records and no HETATM, so `hetflag` keeps nothing. The code doesn't do what its comment says.
- **Lines are barely visible.** They are one device pixel wide on a white background.

**Verified: wrong elements give the pink bonds** (my screenshot: a short peptide in sticks, with pink fans and triangles at every residue):
- 3Dmol takes an atom's element from columns 77–78 of a `.pdb`. When those are empty or not an element, and always for a `.gro` (which has no element column), it guesses the element from the atom name (`atomNameToElem`).
- Names that start with a digit, like the old-style hydrogen names `1HB`, `2HB` and `3HA`, become the "elements" `1`, `2` and `3`. 3Dmol doesn't know them. It draws them in its fallback colour (deep pink, `0xff1493`) and gives them a 1.6 Å bonding radius, so they bond to every atom within about 2.6 Å. That gives the pink fans and triangles.
- Reproduced with `test.pdb`'s own atoms written as a `.gro`: 8 pink atoms, and 9 hydrogens with more than one bond. The same check on WTA.gro finds none.
- `test.pdb` shows it too, in sticks and lines: its C-terminal oxygen is named `001` with element `0`, so there is one pink triangle at the C-terminus.
- Atom names that happen to be element symbols are read literally in a `.gro`: arginine's `NE` becomes neon and is drawn pink. The project's sequences contain arginine.
- **Hydrogens differ by format.** 3Dmol drops hydrogens from a `.pdb` by default (`keepH`), but draws every hydrogen of a `.gro`. So the same peptide looks different in the two formats.
- 3Dmol's list of standard residues (`standardResidues`) lacks some GROMACS residue names (`HISE`, `HISD`, `HISH`, `LYN`, `ASH`, `GLH`, AMBER termini such as `NALA` and `CALA`, the caps `ACE` and `NME`). Keep this in mind for the cartoon selection.

My screenshot shows hydrogens, so the file is most likely a `.gro`. In Phase 0, ask me for that file anyway. Reproduce what I see and confirm the cause before fixing anything.

### Requirements

1. **Every atom gets its real element before 3Dmol sees it.**
   - One pure function decides it. It uses the `.pdb` element column when that holds a real element. Otherwise it reads the atom name, with rules for:
     - leading digits (`1HB` is a hydrogen);
     - protein atom names that look like two-letter elements (`NE`, `CA`, `CD`, `SG`, `OG`);
     - ions, water, and virtual sites (TIP4P `MW` isn't an atom; don't draw it).
   - Phase 0 says how the corrected elements reach 3Dmol, with evidence from the 3Dmol 2.5.5 source. For example: hand it a PDB string with the element column filled in, or fix the parsed atoms and rebuild their bonds.
   - No atom is ever drawn in 3Dmol's fallback colour. An atom whose element can't be decided is reported in words (requirement 6).
   - Ask whether hydrogens show by default. Either way, both formats behave the same.
2. **No style ever leaves the canvas empty** for a structure that has atoms.
3. **Cartoon draws the protein backbone as cartoon and every other residue as sticks** (sugars, ligands, anything without a backbone), for both `.pdb` and `.gro`.
   - Use a 3Dmol selection that works for both formats. Check it against the 3Dmol 2.5.5 source or documentation; don't guess.
   - Whether peptide side chains show under the cartoon is a decision (recommendation: yes, thin sticks, as the comment intended).
4. **The default style comes from what the structure contains** (a backbone or not), not only from its atom count. Ask whether large systems with water or ions should hide them by default. I'll give you a real file to decide with.
5. **Lines.** Phase 0 proposes how to make them readable or what replaces them, with screenshots. WebGL line width is fixed at 1 px on most platforms, so "thicker lines" may not be possible.
6. If a style can't draw a structure, the viewer says why in words, never with a blank canvas.
7. 3Dmol stays lazily loaded. Dark theme, spin and reset view keep working.

### Tests

Node has no WebGL, so the decisions are pure functions.
- **Elements (table-driven):** `1HB` and `3HA` → H; `NE` in ARG → N; `CA` in a protein → C, but a calcium ion → Ca; `SG` → S; `NA` and `CL` ions; water `OW` and `HW1`; TIP4P `MW` → not drawn; a `.pdb` with an empty element column; `test.pdb`'s C-terminal oxygen (`001`, element `0`) → decided in Phase 0, never the fallback colour.
- **Style (table-driven):** format and structure content in, default style and selections out:
  - a `.pdb` peptide (`test.pdb`);
  - a `.pdb` protein with a HETATM ligand;
  - a `.gro` sugar (`WTA.gro`);
  - a `.gro` protein;
  - a `.gro` protein with a sugar chain;
  - an empty file.
- Small synthetic files are fine, but ask me for a real system file before relying on how GROMACS names its residues.

### Manual checks

- **In the browser, after loading, for every fixture and my file:** no atom has 3Dmol's fallback colour, and no hydrogen has more than one bond. A scratch script can read both from `viewer.getModel().selectedAtoms({})` (`elem`, `color`, `bonds`).
- Every fixture in every style, light and dark.
- The 912-atom `.gro`.
- My file from Phase 0, before and after.
- Reopen ten times.
- Screenshots of each, and at least one run on a real GPU.

---

## 6. R2: Axis labels show each tick's true value

### Today

`buildPlotMulti` in `seq.ts` places ticks at 1, 2, 2.5 or 5 × 10ⁿ, and **the positions are right**. But it formats x labels with one decimal (none when the range is 20 or more) and y labels with two decimals.

**Verified** at the baseline:

| Range | Labels |
|---|---|
| x 0–1.5 nm | `0.0, 0.3, 0.5, 0.8, 1.0, 1.3, 1.5` |
| x 0–0.1 | `0.0, 0.0, 0.0, 0.1, 0.1, 0.1` |
| y ticks at 0.025 steps | `0.03, 0.05, 0.07` |

The dialog plot, Compare and the png/pdf exports (`graphScene` in `export.ts`) all use these labels. This is a backlog item from batch 1.

### Requirements

1. Each label shows the tick's exact value, with as many decimals as the step needs and trailing zeros trimmed: `0, 0.25, 0.5, 0.75, 1`. Ask if you think every label on an axis should have the same number of decimals instead (`0.00, 0.25, 0.50`).
2. No floating-point artefacts (`0.30000000000000004`) and no `-0`.
3. One change, in `buildPlotMulti`, for both axes, so the screen, Compare and the exports all change together.
4. Large values (simulation time in ps, e.g. `0 … 200000`) keep today's format. Ask if you think they need a separator or another unit.
5. Tick positions don't change.

### Tests (table-driven, written first and failing)

- Ranges: 0–1.5, 0.25–3.25, 0–0.1, 0–2, 0–0.004, −15–20, 0–200000; the fixed `yStep` path (5 kJ/mol).
- Labels as required, and tick positions identical to today's.

---

## 7. R3: Choose what an analysis graph marks

### Today

- PMF curves get a dot at their minimum (`runStats`), in the dialog, Compare and exports.
- **Verified:** the minimum is computed twice, for the screen in `DetailDialog.tsx` (`markers`) and again for exports in `graphScene` (`export.ts`), which only gets a boolean `marker` on each series.
- Analysis graphs (RDF, histograms, RMSD, …) get no marker.
- The "Peak" tile reports the maximum over every shown curve, computed on the smoothed curve when smoothing is on.
- Smoothing is set per analysis type, in the dialog's graph settings and in Settings → Analyses, and stored in the analysis definition (`AnalysisType.smooth`, `analyses.json`). That is the model to follow.

### Requirements

1. **Per analysis type,** choose the marker: **maximum**, **minimum** or **none**.
   - Set it next to Smoothing, in both the graph settings and Settings → Analyses.
   - Store it in the analysis definition, as an additive key (section 1.3).
   - Phase 0 proposes the default per type (for example: maximum for RDF and histograms, none for the rest). Ask me.
2. **One marker per shown curve,** in that curve's colour. Dimmed curves get dimmed markers; hidden curves get none. Ask if you think one marker for the overall extreme is better.
3. **The stat tile follows the choice.** It reads "Maximum" or "Minimum", with the value, its x, and which curve it is on. With "none", today's Peak tile stays.
4. **Markers sit on what is drawn.** With smoothing on, they mark the smoothed curve and the tile says "smoothed". Step-style curves (histograms) mark the bin at its stored x; record that as a decision.
5. **Exports show the same markers.** One extreme finder serves the screen and the exports: each series carries what to mark (or the marked point itself) instead of a boolean, so the two can't drift.
6. **PMF graphs keep their minimum marker.** This setting doesn't apply to them. If the PMF marker moves to the shared finder, a test shows its position is unchanged.

### Tests

- **Extreme finder (pure, table-driven):** maximum and minimum; ties (the first wins); `null` and `NaN` points; all-null curve; one point; smoothing on and off.
- **Markers:** one per shown curve; none for hidden curves; dimmed for dimmed curves.
- **Settings:** the key round-trips through `analyses.json`, and survives an edit by the code path an older app would use (section 1.3).
- **Exports:** the export scene contains the same markers as the screen.

### Manual checks

- An RDF from `test/fixtures/gmx/` with maximum, minimum and none, smoothing on and off, light and dark.
- The png and pdf exports.

---

## 8. R4: Analysis curves in their column's colour, with shade and hide/dim per curve

### Today

From the code (`runHue` in `ctx.ts`, `pushData` and `CurveRow` in `DetailDialog.tsx`):
- **Cell view, several runs:**
  - run 1 is drawn in the column colour;
  - run 2 in black (white in the dark theme);
  - run 3 onwards in **other columns' colours**, so run 3 of HA appears in O26's red.
- **Cell view, one run whose analysis has several curves:** each curve takes the next `PALETTE` colour, starting with red, whatever the column. All of them are solid (`dash: 'none'`), so colour is the only difference.
- **Row view:** one colour per column. **Verified:** the curves of one multi-curve analysis share that colour and the same dash, so they can't be told apart.
- **Visibility** exists per run slot (shown → dimmed → hidden, `store.vis`, kept in the row record's `visibility` map, applying to every tab of the cell), but not per curve.
- **Exports** use each colour's light variant, and draw dimmed curves in `#b8b3b0` (2.1:1 on white). `export.ts` (`rgb`) reads only hex and `rgb()` colours, not `color-mix()` or `oklch()`.
- **Backgrounds:** `--bg` is `#f3f2f2` (light) and `#141312` (dark); exports use `#ffffff`. Every `PALETTE` colour is at least 4.8:1 against its background today.

### Requirements

1. **The colour rule.**
   - Every analysis curve is drawn in a shade of its column's colour.
   - Runs and curves within a cell differ by shade and by dash pattern, never by another column's hue. That includes the curves of one run, which today are all solid, and the curves of one analysis in the row view.
   - Default shades are spread automatically, so that up to ten curves are told apart without any setting.
   - Ask whether the same rule applies to PMF curves in the cell view. My inclination is yes: `runHue` draws both today.
2. **Black and white.**
   - A switch draws every curve in greys, with dash patterns, for print.
   - Ask where it lives (recommendation: a graph setting next to Smoothing, kept as a browser preference like the theme).
   - Exports follow what is shown.
3. **Hide or dim each curve.**
   - Every analysis curve cycles shown → dimmed → hidden, like the run chips, from its row in the Curves list.
   - A hidden run hides all its curves; curve visibility applies within a shown run.
   - Hidden curves are left out of markers (R3) and stat tiles. Decide whether dimmed curves count (recommendation: yes, as today for dimmed runs).
4. **Adjust each curve's shade, a little.**
   - A small, keyboard-operable control per curve, next to its legend: a few steps lighter or darker than its default, plus a reset.
   - Ask me how many steps, and show screenshots of the range.
   - The swatch, the legend and the curve all follow.
5. **One pure function computes every shade** from the column colour, the theme, the curve's position and its adjustment.
   - It returns hex, because exports can't read `color-mix()`.
   - Every shade it returns has at least 3:1 contrast against the background it will be drawn on (the theme's, or the export's). Clamp the adjustment rather than break that.
6. **Persistence** of each curve's shade and visibility is a Phase 0 decision. Present both options:
   - **On the curve record** next to `label` and `custom` (`CurveRec`), since the legend already lives there (recommended). This changes the on-disk format: `plan.ts` writes curve records with an explicit field list, so an older app would silently drop the new fields when it saves. That means schema 3 (an older app then opens the vault read-only), a migration step that changes nothing but the version, export v6, and the frozen fixtures first.
   - **Not saved,** or saved in browser preferences only: simpler, but lost on reload and not shared with the vault.
7. **Reuse what exists:** the run chips' visibility cycle (`nextVis`, `VIS`), `CurveRow`, `DASH`. Don't build a colour picker.

### Tests

- **Shade function (pure, table-driven):**
  - 1 to 10 curves give distinct defaults;
  - every column colour in `PALETTE`, in both themes and the export background, stays at or above 3:1 (dimmed curves excepted);
  - adjustments are clamped;
  - black and white gives greys;
  - the output is hex.
- **Series building:** no curve takes another column's hue; a hidden curve and every curve of a hidden run are left out of series, markers and tiles.
- **If saved:**
  - round trip;
  - an upgrade from the frozen schema-2 vault, and the same upgrade interrupted halfway;
  - a newer vault opens read-only;
  - an export round trip in the new version;
  - v5, v4 and v3 exports still import.

### Manual checks

- A cell with three runs of an RDF.
- A file with several curves.
- Black and white.
- The dark theme.
- The png and pdf exports compared with the screen.
- Everything done with the keyboard only.
- Screenshots of each.

---

## 9. Testing (all requests)

- Use Vitest. Tests run in Node with no DOM and no WebGL, so every decision lives in a pure function, tested table-driven.
- Use the real GROMACS files in `test/fixtures/gmx/` and the structure fixtures. Ask me for more real files rather than inventing formats.
- Every fix (R1, R2) starts with a failing test that reproduces the problem.
- Every on-disk change has an old → new migration test against frozen fixtures, a newer → read-only test and an export/import round trip.
- There is no UI test framework. Don't add one without asking.
  - Manual checks are run in Chrome and recorded as passed, failed or not run, with screenshots.
  - A Playwright smoke test for the viewer or the exports is fine to propose in Phase 0, with its cost.
- The existing tests keep passing. Report the count before and after.

---

## 10. Acceptance criteria

- **A. 3D viewer.** Every atom has its real element: none is drawn in 3Dmol's fallback colour, and no hydrogen has more than one bond, for any fixture or my file. Hydrogens behave the same in both formats. No style leaves the canvas empty. Cartoon shows the backbone and everything else. The default style suits the structure. Lines are readable or replaced as decided.
- **B. Axis labels.** Every tick label is the tick's true value (`0.25`, not `0.3`), on screen, in Compare and in exports. Tick positions are unchanged.
- **C. Markers.** Each analysis type marks its maximum, its minimum or nothing, as set. Markers follow visibility and smoothing. The stat tile says what it reports. Exports match the screen.
- **D. Colours.** Analysis curves use only their column's shades, or greys in black and white. Every curve can be hidden, dimmed and shaded a little. Contrast holds in both themes and exports.
- **E. Data intact.** No stored curve or original changes. If the format changed: old vaults upgrade, newer ones open read-only, exports round-trip, and older exports import.
- **F. Quality.**
  - `npm run lint`, `npm run build` and `npm test` pass, with no warnings beyond the baseline.
  - No new console errors.
  - New UI is keyboard-usable.
  - Net lines are reported per item.

---

## 11. Documentation

Update `README.md`:
- **Features:** 3D viewer styles and defaults (and how elements and hydrogens are handled), analysis markers, the colour rule, black and white, per-curve visibility and shade.
- **The vault format:** the schema and export versions, and what changed, if anything did.

---

## 12. Commits

- One commit per roadmap item (R2, R1a, …), with its ID first (`R2: tick labels show the tick's true value`). Plus one commit each for the Phase 0 docs, the frozen fixtures and the final report.
- Every commit passes lint, build and tests on its own.
- Stage files by name. Never commit generated files (`dist/`, `.vault-out/`), screenshots outside `docs/img/batch-2/`, or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 13. Final report: `docs/feature-batch-2-report.md`

1. **Summary table:** item → status → files changed → lines added / removed → tests added → decisions.
2. **Per request:** what changed and why, behaviour before and after, known limitations.
3. **Screenshots** (small PNGs in `docs/img/batch-2/`), before and after:
   - my file from Phase 0 in sticks (the pink bonds);
   - a `.gro` in cartoon;
   - an axis with 0.25 steps, on screen and in an exported png;
   - an RDF with a maximum marker;
   - a three-run analysis in colour and in black and white.
4. **On-disk changes,** if any: the schema and export versions, the migration step, and a curve record and settings file before and after.
5. **Tests:** count before and after, the list of new tests, and the manual QA checklist with passed, failed or not run for each item (and which ran on a real GPU).
6. **Review:** what the fresh-context review found, and what was done about each finding.
7. **Decisions** F49… (link to `docs/feature-decisions.md`).
8. **Roadmap status** and the updated backlog.
9. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline commit.
