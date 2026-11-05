# Batch 4 — report

SymBuilder inside gmx-cypher, as a planner: four tabs, home, the build plan with every command of every system shown
and golden-tested against your notebook, the files a build reads, systems taken from the connected project, and where
each system's PMFs would land in it, checked with the Matrix's own code. Nothing is built, nothing runs, and nothing is
written outside gmx-cypher's state folder (saved build plans). Building, the cluster scripts on disk, results and
reports are batch 5 (the cut you approved: T220).

Branch `cypher-batch-4` from `6de6a96` (gmx-cypher) in the-matrix at `7ae82be`; the Matrix is unchanged.

## 1. Summary

Lines are from `git show --numstat`: code is `src/`, `server/`, `scripts/` and `index.html`; tests are `test/` and
`e2e/` (fixtures included); screenshots and docs are left out. Tests are Vitest at that commit, run on its own in a
scratch worktree (lint and build skipped there; both ran on every commit before it was made).

| Item | Status | Commit | Code +/− | Tests +/− | Vitest at the commit | Decisions |
|---|---|---|---|---|---|---|
| Baseline | | `6de6a96` | | | 1079 passed, 1 skipped | |
| Phase 0 | done, approved 2026-11-05 | `a9bbfec` `1435fe0` `13fef1a` `52af24c` | 0 | 0 | 1079 | T201–T221 |
| R1a the contract's words | done | `765923b` | +5/−1 | +8/−0 | 1088 | T201, T202 |
| R1b four tabs, routes, the icon | done | `ebd9bf5` | +91/−23 | +75/−17 | 1100 | T204, T216, T220 |
| R1c the mock-up's look | done | `d46fc20` | +53/−58 | +29/−7 | 1102 | T218 |
| R2 home | done | `0bbcc27` | +113/−3 | +46/−0 | 1105 | T215 |
| R3a build model, saved plans | done | `f0a0b83` | +171/−0 | +269/−0 | 1131 | T203, T209 |
| R3b the planners (with the qq text) | done | `17bbfc9` `f1814c3` | +413/−73 | +284/−1 | 1196, then 1199 | T205, T211–T213, T222 |
| R3c build and systems views | done | `2de4ec8` `5b69076` | +468/−9 | +125/−0 | **1 failed**, 1212; then 1213 | T204 |
| R4 what a build reads | done | `053dfc0` | +226/−14 | +124/−3 | 1223 | T203, T212 |
| R8a systems from a project | done | `b19c6fb` | +126/−20 | +79/−0 | 1232 | T223 |
| R8b where PMFs land | done | `1265bcc` | +179/−11 | +183/−1 | 1258 | T214, T224 |
| Phase 7 README, review, report | done | the last commits | 0 | 0 | 1258 | |
| R5, R6, R7, R8c–e, R9, R10 | batch 5 | | | | | T220 |

In all, `src server scripts index.html`: 32 files, +1,724/−91; `test e2e`: 19 files, +1,217/−24 (Phase 0 planned
≈ 2,240 and ≈ 1,720 for this cut). Playwright: 14 at the baseline (12 failing on the favicon, §7), 17 now, all passing.

**One commit does not pass on its own: `2de4ec8`.** It added a second copy of the tone list in `Systems.tsx`, which
`test/core.test.ts` forbids (one `TONES`, in `src/core/`); my check piped `npm test` through `grep`, which hid the exit
code. `5b69076`, the next commit, fixes it; since then every commit has gone through a script that stops on lint,
build and test failures by their exit codes.

At `ebd9bf5` one test failed once in that scratch run, while screenshots were being taken beside it, and passed on a
run of its own (1100); I count it as load, not a defect, and it did not recur at any later commit.

## 2. Each request

### R1 Four tabs (R1a words, R1b tabs and routes, R1c the look)
- **Before:** two tabs (set-up, results) and a cluster view; the page had no icon, so the installed Chromium logged a
  404 and 12 of 14 browser tests failed; UI state was ink, status an icon and a word in ink.
- **After:** home · symbuilder · analysis · cluster, each remembering its place (`kept` per tab); analysis holds set-up
  and results as a second line of tabs (`SubTabs`); every old address opens what it did (`#setup/…`, `#results`,
  `#result/…`, `#compare/…`, `#analysis` → set-up's command step), and an unknown address opens home. The icon is an
  inline SVG. The contract gained SymBuilder's words (system, build, stage, step, build plan, build record, repeat, qq
  script) and three phrases it never shows (§5). The look is the mock-up's, app-wide (T218): Morpheus's current
  tokens (coral `#ff5429`), coral for UI state with a coral-strong focus ring and tab underline, and status as a dot
  and its word in the level's tone. The light theme's error red moved from `#8f1d1d` to `#7a1030`, because the new
  coral-strong was too close to it to tell apart (tested by `contrast.test.ts`). Headings (`.text-title`,
  `.text-heading`, `.text-display`) are Archivo.
- **Limitations:** the chart theme race in the backlog (a chart drawn in the first render takes the light palette in
  the dark theme) is still open; today's charts wait for data, so none shows it.

### R2 home
- **After:** one pure component (`HomeView`) from what the server already knows: gmx, jobs running and done (with how
  many did not finish), the cluster tab's last read handed up (home never reads qq), the connected project's rows,
  columns and cells with no runs; each card links to its tab. The project is read once, through one hook shared with
  SymBuilder (`src/project.ts`).
- **Limitations:** the symbuilder card says "no system built yet" until building exists.

### R3 The build stack and its plan (R3a model, R3b planners, R3c views)
- **R3a:** `src/lib/build/plan.ts`: the build plan (`format: "gmx-cypher build plan"`, version 1, frozen by
  `test/fixtures/build/build-plan-v1.json`): seven stages, their tiles in the notebook's order, the science values with
  the notebook's defaults (ion charge 0.75, salt 0.15 M, box 7 nm, the walkers' distances, `maxwarn` 6, the mdp file per
  stage and method). Saved by name in `<state>/builds/` (a `.part` file renamed into place; never replaced unless asked).
- **R3b:** `planSystem` gives every step of a system: program, argv, stdin, folder, reads, writes, and whether it runs
  here or on the cluster. Every gmx command is the notebook's, argument for argument (`test/build-steps.test.ts`'s
  golden table), except the recorded differences (T222). The planner follows the stack's order, so a tile moved before
  the file it needs exists is said in words (`orderProblems`). File texts are ported and golden: ion counts, net charge,
  waters, the water rename, the moleculetype, the merged `.gro` (the first 249 atoms of your built system reproduced),
  the carbohydrate group, the topology, the HMR topology, the pull's distances, each walker's frame and the nearest
  working walker. The qq scripts' text for the three profiles (`qq.ts`). pdb2gmx runs in `ff/` (your answer to
  question 22), its menu answers per sequence when they differ (Met's termini).
- **R3c:** build: the palette, the stack by stage (each checkable), drag and drop within a stage and from the palette,
  ↑ ↓, the inspector (the selected tile's exact command for the first system, its answers, its files), save, open,
  export and import. Systems: the three lists as chips (each name checked: it becomes a folder and an argument),
  repeats, what to do with a folder that exists, the preview (every system, its check), the stages checkable, the build
  button disabled with "building comes in the next version". The draft is kept in this browser.
- **Limitations:** nothing runs; `Alt+↑/↓` on a focused tile (planned) was not added, the ↑ ↓ buttons do it; the python
  scripts PyMOL and gromologist will run are batch 5 (R5b).

### R4 What a build reads
- **After:** settings → SymBuilder: the base folder (real, inside an allowed folder) and python (`python3`, `python`, or
  an absolute path to an executable). symbuilder · files: each saccharide's `.gro` and `-ADD.itp`, the force field and
  its includes, the mdp file of each stage per method, each *found* or *missing* (stat only), and a click reads an mdp
  file (`.mdp`/`.itp`/`.top` only, at most 256 kB, inside the base folder after resolving links). The systems preview
  says which files each system misses.
- **Limitations:** the settings' check that python imports PyMOL and gromologist needs a python run, so it comes with
  the first python step in batch 5.

### R8a Systems from a project
- **After:** with a connected project, *take all from the project* sets the methods (row groups), saccharides (column
  labels, lower case) and sequences (rows' sequences, lower case); *build what the project lacks* keeps only the cells
  with no runs (`Systems.only`, each cell with its repeats). A group, label or sequence that can't be a folder is left
  out and said; adding a name by hand goes back to every combination (T223).

### R8b Where each system's PMFs land
- **After:** under each system in the preview, with a project connected: the row, column and runs its PMFs would take
  (the AWH folder its cell's next free run, each walker its own number), runs it would replace (a check), or the
  first problem in words: another group, sequence or column, a new row because the project's row is named apart from
  its sequence (question 37), a folder pattern that reads `7.awh` as a `{run}`, a folder pattern that reads nothing when
  the name gives nothing either, a walker past the tenth, a full cell. It is the Matrix's own `planBatch` on the file a
  send would make, a `gmx awh` file whose `# Working dir:` is the folder, named by the project's pattern from the
  system's fields (T224); `parsePath` adds what a folder import would refuse. `POST /api/build/landing` reads the
  project and writes nothing; the first 200 systems are checked.
- **Limitations:** the `{time}` of the name is the send's (batch 5); the check assumes R8c names files this way, which
  T224 records as R8c's rule.

## 3. Sections 3 and 4 of the spec, completed

Every claim was checked in Phase 0 (`batch-4-phase0.md` §2.1–§2.3, confirmed or corrected there). Building on them
added these:

- **A header never conflicts.** With no folder (attaching from *Untracked files*), `planBatch` reads the folder pattern
  from the file's `# Working dir:` as source `header`, and `mergeFields` only fills from a header: an unreadable
  `{run}` there (`7.awh`, `11`) is dropped without a word and the next free run taken (`seq.ts:263–272`). A folder
  import (source `path`) makes the same value a conflict. R8b says it either way.
- **A PMF needs four points:** `pickXY` refuses fewer (`seq.ts:520`), so a probe file needs at least four.
- **`{name}` alone is not enough** for a row named apart from its sequence: a name pattern with `{name}` and no `{seq}`
  gives a row with no sequence, which `seqKey` treats as another row. The answer to question 37 is `{name}` beside
  `{seq}` in the name pattern (SymBuilder's folders carry the sequence, not the row's name), or the row renamed.
- **A column from a name is new in upper case** (`xyl` starts a column `XYL`); a known column matches without case.
- The Matrix's test helper `withPmf` sets the row's sequence to its name; the tests here set it after.

## 4. The notebook table, final

From Phase 0 §3.1, at the end of this batch (`L` = `src/lib/build/`).

| Notebook | Now |
|---|---|
| variables cell | **done**: the build plan's defaults (`plan.ts`); machine values in settings (base, python) |
| `extract_moleculetypes`, `sed_i` (water) | **done**: `moleculetype`, `renameWater` (golden) |
| `render_qq_script`, the three profiles | **done** as text: `qqScript` (golden; the pull resubmits and LUMI's cores match `-ntomp`: T213) |
| `write_topology`, gromologist's includes | **done**: `topologyText`, `hmrTopology` (golden; changed where files live: T205) |
| `merge_gro_files`, `build_index` | **done**: `mergeGro` (your system's first 249 atoms), `carbGroup` (golden) |
| `neutralizing_counts`, `parse_net_charge`, `count_water` | **done**: `ionCounts`, `netCharge`, `waters` (golden) |
| `parse_pullx`, walker frames, `retry_failed_walkers`' choice | **done** as functions: `pullx`, `walkerFrames`, `nearestWalker` (golden); running them is batch 5 |
| `sol_creation`, `minimization`, `eq_nvt`, `eq_npt`, `awh`, `pull`, `multiwalker` | **planned**: every step's argv, stdin and files (`planSystem`, golden; differences T222) |
| `check_gromacs_version` | **done**: the configured gmx |
| `sh`, `run_capture`, `run_live`, `check_fatal`, `STRICT`, `gro_file_check`, mdrun progress | batch 5 (R5) |
| `build_peptide`, `run_gromologist` (running) | batch 5 (R5b): the shipped python scripts |
| `write_script` and friends (writing) | batch 5 (R7a); the text is here |
| `build_*` notes, `build_summary`, `quarantine`, `run_system`, `retry_failed` | batch 5 (R5a, R6) |
| `top_charges`, `pull_report`, `walker_report`, `termini` | batch 5 (R9) |
| `read_awh_file` … `process_file` | batch 5 (R8c, R8d), numbers by the Matrix's code |
| `basic_analysis`, plots, `diff` | **left out**, as the spec says (plots); the energy file is still made |

## 5. The contract's changes

`docs/design-contract.md`, amended 2026-11-05 (T201, T202, T218); the machine-checked part is `src/core/contract.ts`.

- **Words** (§1): *job* is one gmx analysis (a qq job is qq's own); *record* is a job's `.run.json`, not a build record;
  *run* is the Matrix's slot, not a build or a repeat; *analysis* is also the tab; *command* includes the build's gmx
  tools; new: *recipe* (a saved analysis), *system*, *build/built*, *stage*, *step*, *build plan*, *build record*,
  *repeat*, *qq script* and its *submit line*.
- **Never shown** (new): "repeated runs" → *repeats*, "build recipes" → *build plan*, "job scripts" → *qq script*.
- **Colours** (§2): UI state coral (`#ff5429`), the ring coral-strong (`#b12b01` light, `#ff7453` dark); error
  `#7a1030` in the light theme; group coral moved to the new tokens; tones also mark a tile's category in SymBuilder.
- **Status** (§4, `STATUS`): a dot and its word in the level's tone (mint-strong ok, sky-strong note, butter-strong
  check, destructive error); no icons.

## 6. Screenshots

In `docs/img/batch-4/`, each at 1280 and 1024 px, light and dark, made from the real app (built, the fake gmx, a
scratch vault and base folder; 256 colours):

- the tabs and old addresses: `r1b-home-*`, `r1b-setup-*`, `r1b-results-*`, `r1b-symbuilder-*`; the look: `r1c-*`;
- home: `r2-home-*`, and with a connected project `final-home-*`;
- build: `r3c-build-*`; systems: `r3c-systems-*`, with a project `r8-systems-*`, the cells it lacks `r8-lacking-*`;
- files: `r4-files-*`; an mdp file opened: `final-mdp-*`;
- progress and summary (empty until batch 5): `final-progress-*`, `final-summary-*`; the cluster tab: `final-cluster-*`
  (no qq here; the cluster tab with a script is batch 5, R7b);
- the mock-up's boards as you made them: `board-*`, and Phase 0's redrawn screens: `mock-*`.

## 7. Tests

- **Vitest:** 1079 passed, 1 skipped at the baseline; 1258 passed, 1 skipped now (95 files). New files: `home`, `build-plan`, `builds`,
  `build-steps`, `build-text`, `build-inputs`, `build-project`, `build-landing`, `symbuilder-views`; updated `route`,
  `contract`, `contrast`, `tokens`.
- **Playwright:** 14 at the baseline (12 failing on the missing icon), 17 now, all passing: the four tabs and old
  addresses, SymBuilder's drag and drop with a base folder, axe on the new views. Once, under load, the compare view's
  axe test failed and passed when run again (twice); I could not make it fail again.
- **With real tools:** none in this batch runs gmx or python. The golden tests compare with your notebook's own text and
  argument lists, and the merge test with your built system's `.gro`; the fake gmx serves the page.
- **Manual checks:** every view at 1280 and 1024 px, light and dark, in the built app, with no console errors (passed);
  the systems preview with a scratch project like yours (rows named apart from their sequence, runs to replace)
  (passed; the narrow layout's empty half was fixed on the way); the Matrix's own tests: 658 passed, as at the baseline.

## 8. Writes and programs

As the README's *Where files go* and *Safety* now say:

- **Writes:** `~/.gmx-cypher/builds/<name>.json` (a saved build plan; written as `.part` and renamed; never replaced
  unless you say *replace*), and `config.json` with `base` and `python`. Nothing in the base folder, nothing in the
  vault.
- **Reads:** stat of the files a build reads in the base folder; an `.mdp`/`.itp`/`.top` there (≤ 256 kB, inside it
  after links); the connected project (home, the systems from it, where PMFs land).
- **Programs:** none new. The python setting is checked by name or by an executable file, not run.

## 9. For the Matrix

Requests, none made in `matrix/`:

1. **Temperature in a file** (question 14): a PMF's temperature comes only from the form or a `{temp}` token, and a
   `{temp}` that isn't a number becomes 310.15 without a word. A conflict, or a note, would keep a 300 K run from being
   corrected at 310.15 K.
2. **The correction's reference point** (question 15): `correctCurve` zeroes the mean of the last 10 % of points; your
   notebook zeroes the last point. On a noisy tail the two differ by 0.28 kJ/mol in the minimum and 7 % in the area
   (Phase 0 §2.2). A setting, or the method named beside each number, would let both agree.
3. **A header's unreadable `{run}`**: from a folder it is a conflict, from a header it is dropped and the next free
   run is taken (§3). The same word for both would make attaching a multiwalker PMF safe.
4. **Pattern help**: the README's example `{method}/{column}/{seq}/{*}/{run}` reads `…/7.awh` as group `solutions`;
   an example for AWH and walker folders, `{method}/{column}/{seq}/9.multiwalker/{run}`, would match how the notebook
   lays systems out.

## 10. For Morpheus

Proposed components, from what SymBuilder needed and built locally:

- **Status dot and word** (`src/ui/status.tsx`): a dot and its word in the level's tone, inline or as a line, with
  *why?*; the contrast pairs it is tested with.
- **Second-line tabs** (`SubTabs` in `src/ui/tabs.tsx`): a tab list with counts and its panel, under a first line.
- **Chip list with an input** (`Chips` in `Systems.tsx`): removable chips in tones, a checked text input that adds.
- **Tile and stack** (`Build.tsx`): a category-toned tile with icon, pills and an on/off state that isn't opacity
  (dashed border, muted text), draggable within a group, with ↑ ↓ for the keyboard.
- **Section head with a count** (`Head`): a label, a rule and a two-digit count.

## 11. Review

A fresh-context review of the whole diff (security, the planner, the landing check, the hooks, what the tests
claim) is running as this is written; its findings and what was done about them follow in the next commit.

## 12. History

```
1265bcc R8b: where each system's PMFs would land in the project, by the Matrix's planBatch
b19c6fb R8a: systems from the connected project, or only the cells it lacks
053dfc0 R4: what a build reads: the base folder, its files found or missing
5b69076 R3c: the saccharides' tones from the core's one list
2de4ec8 R3c: symbuilder's build and systems views, in the mock-up's design
f1814c3 R3b: the plan follows the stack's order, and says when an order can't work
17bbfc9 R3b: plan every step of a build, golden against the notebook
f0a0b83 R3a: the build model and saved build plans
0bbcc27 R2: home, from what the server already knows
d46fc20 R1c: the mock-up's look app-wide: coral UI state, status as a dot and word
ebd9bf5 R1b: four tabs, home · symbuilder · analysis · cluster, every old address kept
765923b R1a: the contract's words for the analysis tab and SymBuilder
52af24c Batch 4 Phase 0: your answers recorded (T201–T221)
13fef1a Batch 4 Phase 0: headings in Archivo, the lanes and the pull trace as the mock-up
1435fe0 Batch 4 Phase 0: the screens redrawn in the mock-up's design
a9bbfec Batch 4 Phase 0: spec, report, roadmap, the SymBuilder mock-up and screenshots
```

`git diff --stat 6de6a96..1265bcc` (R8b; the README and this report come after; screenshots and the mock-up's boards summarised):

```
docs/batch-4-phase0.md                             | 527 ++++++++++++++++++
docs/batch-4.md                                    | 606 +++++++++++++++++++++
docs/decisions.md                                  |  31 ++
docs/design-contract.md                            |  45 +-
docs/roadmap.md                                    |  58 ++
e2e/compare-kinds.spec.ts                          |   4 +-
e2e/decypher.spec.ts                               |  10 +-
e2e/smoke.spec.ts                                  |  42 +-
e2e/symbuilder.spec.ts                             |  83 +++
index.html                                         |   2 +
server/api.ts                                      |  27 +-
server/build-check.ts                              |  74 +++
server/builds.ts                                   |  38 ++
server/state.ts                                    |   5 +-
src/App.tsx                                        |  40 +-
src/api.ts                                         |   2 +-
src/buildCheck.ts                                  |  34 ++
src/buildDraft.ts                                  |  31 ++
src/core/contract.ts                               |  23 +-
src/lib/build/inputs.ts                            |  37 ++
src/lib/build/landing.ts                           |  93 ++++
src/lib/build/plan.ts                              | 135 +++++
src/lib/build/project.ts                           |  59 ++
src/lib/build/qq.ts                                |  55 ++
src/lib/build/steps.ts                             | 142 +++++
src/lib/build/text.ts                              | 143 +++++
src/lib/build/tiles.ts                             |  81 +++
src/lib/route.ts                                   |  36 +-
src/lib/tones.ts                                   |  12 +
src/project.ts                                     |  17 +
src/roles.json                                     |  18 +-
src/tokens.json                                    |  54 +-
src/ui/status.tsx                                  |  18 +-
src/ui/tabs.tsx                                    |  25 +-
src/views/Build.tsx                                | 216 ++++++++
src/views/BuildFiles.tsx                           |  76 +++
src/views/Cluster.tsx                              |   5 +-
src/views/Home.tsx                                 |  86 +++
src/views/Settings.tsx                             |  20 +
src/views/SymBuilder.tsx                           |  29 +
src/views/Systems.tsx                              | 182 +++++++
test/build-inputs.test.ts                          |  77 +++
test/build-landing.test.ts                         | 148 +++++
test/build-plan.test.ts                            |  45 ++
test/build-project.test.ts                         |  56 ++
test/build-steps.test.ts                           | 116 ++++
test/build-text.test.ts                            | 150 +++++
test/builds.test.ts                                |  40 ++
test/contract.test.ts                              |  28 +-
test/contrast.test.ts                              |  11 +-
test/fixtures/build/build-plan-v1.json             | 184 +++++++
.../build/notebook-topology-o111-hhhhhhhh.top      |  17 +
test/home.test.ts                                  |  46 ++
test/route.test.ts                                 |  36 +-
test/symbuilder-views.test.ts                      | 143 +++++
test/tokens.test.ts                                |   5 +
56 files changed, 4190 insertions(+), 133 deletions(-)
docs/img/batch-4/: 98 files changed, 0 insertions(+), 0 deletions(-) (screenshots)
docs/mockups/symbuilder/: 12 files changed, 5676 insertions(+) (your boards)
matrix/ (in the-matrix):  no changes
```

`matrix/` is unchanged: the-matrix's `git status -- matrix` is empty and its HEAD is `7ae82be`, as at the start; the
pin check before every `npm test` said so.
