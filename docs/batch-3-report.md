# gmx-cypher batch 3: final report

**Where:**
- Branch `cypher-batch-3`, from `a2b422e`.
- Pushed phase by phase to `claude/clever-dijkstra-mf14ej`, as you asked (T168).
- `matrix/` is the Matrix at `e9a64df`, as pinned, unchanged (section 12).

**What is done:**
- Every item on the roadmap is built, tested and checked in Chromium, light and dark.
- Gaps, each said where it belongs below:
  - No membrane sample came for `gmx order` (R16b: real files on stand-in carbons).
  - No GROMACS 2021 was at hand for the AWH unit (R7c: 2023.3 and 2025.4 only).
  - No real `qq` cluster is reachable here (R15 is built on your anonymised `qq jobs -e` sample).

**Review and QA:**
- A fresh-context review found 19 defects; 18 are fixed with tests, and 1 is recorded (section 10).
- Manual QA ran on the real GROMACS 2025.4: all 62 checks pass, light and dark (section 6).

**Two things the rules asked for that the history doesn't fully meet** (section 12):
- One commit holds R3b under another message.
- One commit (R4b) did not pass its tests on its own; the next one fixed them.

## 1. Summary

**How the columns are counted:**
- *Code*: lines added and removed in `runner/src`, `runner/server` and `runner/scripts`.
- *Tests*: lines in `runner/test` and `runner/e2e`, without fixtures.
- *Passing*: the Vitest count at that commit, run on its own in a copy of its tree (section 6).

| Item | Status | Commit | Code | Tests | Passing | Decisions |
|---|---|---|---:|---:|---:|---|
| Phase 0: baseline, the spec checked, design pass, plan, questions | done | `38f6763` | 0 | 0 | 664 | — |
| Phase 0 answers recorded | done | `600ad79` | 0 | 0 | 664 | T157–T169 |
| R1a `design-contract.md` | done | `38f6763`, `600ad79` | 0 | 0 | — | T157–T169 |
| R1b `src/core/contract.ts` | done, in parts | `4e45c8b` (phrases), `2e8447e` (roles), `97c7b5c` (status), `4482391` (keys) | in those rows | in those rows | — | contract §7 |
| R2a SIGHUP | done | `8130b5d` | +46 −12 | +76 −4 | 672 | T157 |
| R2a an unfollowed job's page | done | `a57ca6b` | +3 −2 | 0 | 680 | T157 |
| R2b record at the start, completed atomically | done | `78f968d` | +61 −27 | +81 −3 | 678 | T157 |
| R3a ticket references out of the UI | done | `4e45c8b` | +15 −10 | +46 −1 | 680 | contract §1 |
| R14a the vault space, a record copy per send | done | `65e6cca` | +134 −8 | +141 −2 | 686 | T158 |
| R4a colour roles; the reference in ink | done | `2e8447e`, `2826065` | +120 −51 | +50 −1 | 693, 712 | T159 |
| R4b neutrals into the tokens; no hex outside them | done (see 12) | `789cb4e`, `ea6c5b4` | +160 −19 | +28 −5 | 693 (2 failing), 695 | T159 |
| R4c titles in Archivo 800 | done | `f16a9dc` | +24 −9 | +27 −1 | 698 | T160 |
| R3b one set of words | done (in `1f05899`, see 12) | `1f05899` | +63 −49 | +25 −16 | 699 | T161 |
| R14b-1 the connected project, as a setting | done | `f7d14a6` | +37 −9 | +20 −1 | 700 | T162 |
| R3c display names from the project pattern | done | `5c38c94` | +77 −12 | +42 | 712 | T162 |
| R3d both peak rules | done | `c40899d` | +66 −35 | +48 −8 | 716 | T163 |
| R9c one status component | done | `97c7b5c` | +181 −99 | +25 −7 | 719 | T166 |
| R5a one copy of tones, dashes, ticks, ranges | done | `1e01cb8` | +115 −108 | +99 −9 | 731 | T170 |
| R5b one structure model | done | `6214c21` | +119 −123 | +90 −39 | 741 | T171 |
| R5c every chart drawn by the core | done | `346cd47` | +229 −311 | +170 −7 | 760 | T172 |
| R6a exports: SVG, PDF, PNG, CSV, HTML | done | `896ff5d` | +290 −56 | +162 −1 | 771 | T173 |
| R6b export settings | done | `50c7d45` | +178 −23 | +68 −2 | 785 | T174 |
| R7a ramps for ordered curves | done | `759fc16` | +114 −28 | +74 | 792 | T175 |
| R7b AWH convergence | done | `515028e` | +100 −8 | +58 −1 | 797 | T176 |
| R7c the AWH axis unit | done (no 2021) | `0c4b735` | +62 −8 | +43 −1 | 809 | T177 |
| R9a set-up and results; addresses; drops | done | `cd5d8ec` | +344 −150 | +208 −17 | 866 | T178 |
| R9b one result page layout | done | `6725ee6` | +352 −136 | +83 −2 | 882 | T179 |
| R8a one gesture scheme | done | `cc0f3e5` | +267 −107 | +159 −13 | 902 | T180 |
| R8b one key registry, the `?` sheet | done | `4482391` | +283 −97 | +96 −17 | 925 | T181 |
| R10a any command's result in compare | done | `71f7b2f` | +141 −50 | +87 −2 | 957 | T182 |
| R10b RMSF on the structure | done | `f563308` | +79 −23 | +32 −2 | 961 | T183 |
| R10c H-bond pairs on the structure | done | `dda271f` | +147 −32 | +55 −1 | 966 | T184 |
| R10d distance and mindist lines; the fit group | done | `a3e9cc6` | +166 −34 | +170 −5 | 974 | T185 |
| R11a same scale | done | `6b7eed6` | +88 −22 | +61 | 980 | T186 |
| R11b line styles | done | `8a14732` | +150 −29 | +37 −2 | 984 | T187 |
| R11c marks and lines, into exports | done | `8f5590f` | +144 −61 | +38 −1 | 989 | T188 |
| R11d renamed groups and reference | done | `c01434c` | +154 −43 | +58 | 994 | T189 |
| R12a logs on demand | done | `6f199e2` | +140 −33 | +84 −5 | 1003 (1 flaky failure, see 6) | T190 |
| R12b search and filters | done | `b4984ea` | +139 −17 | +61 | 1020 | T191 |
| R12c archive | done | `e0b4185` | +88 −15 | +59 −1 | 1023 | T192 |
| R13 run diff | done | `9a203da` | +245 −15 | +86 | 1036 | T193 |
| R14b–c saved views; compare reads record copies | done (one commit) | `64d45cd` | +264 −33 | +182 −2 | 1044 | T194, T195 |
| R15 a cluster job that ended offers a batch | done | `3c5b95b` | +135 −27 | +157 −14 | 1052 | T196 |
| R16a–b `gmx density`, `gmx order` | done (one commit; stand-in carbons) | `722522f` | +221 −18 | +184 −8 | 1066 | T197, T198 |
| Phase 9: README | done | `48d0755` | 0 | 0 | 1066 | — |
| Phase 9: review fixes, lint to 0 warnings | done | `fac2b6f` | +301 −167 | +157 −14 | 1078 | T199 |
| Phase 9: QA; axe as an e2e test | done | `b960319` | +4 −4 | +57 | 1079 | T200 |
| Phase 9: this report | done | the commit after | 0 | 0 | 1079 | — |

**Commits outside the items:**
- Five commits each record a decision and tick the roadmap, one after each item.
- Three fix tests that failed only under a loaded parallel run: `1f05899` (but see section 12), `cffa09a` and `e6cafd0`.
- Four add screenshots: `7c304ab`, `3dcfbe6` and `30c8d1f`, plus `1f5037a` for the fixtures README.

**In all**, measured from the baseline (the net diff, not the sum of the rows):
- 5 394 lines of code added and 1 468 removed.
- 3 466 lines of tests added and 181 removed.
- 1079 Vitest tests pass (1 skipped), against 664 at the baseline; 14 Playwright tests, against 6.

## 2. Per request

Each request below gives the state before it, the state after it, and its known limits. The decision named after each one has the details.

**R1 The design contract.**
- *Before:* the rules were spread across the code.
- *After:* `docs/design-contract.md` holds the rules: words, colour roles, type, gestures and keys, status levels, the order of a result page, and writing.
- `src/core/contract.ts` holds the parts that tests read:
  - `NEVER_SHOWN`, the phrases the page never shows;
  - `ROLES`, the role → token map;
  - `LEVELS`, the status levels;
  - `KEYS` and `FIXED_KEYS`;
  - `STYLES`, `CANNOT` and `RESULT_ORDER`.
- `test/contract.test.ts` scans the UI strings against these. The class-usage and hex scans are in other tests.
- The contract was approved in Phase 0 (T157–T169); what changed since is in section 4.

**R2a SIGHUP** (T157).
- *Before:*
  - Closing the terminal ended the runner without stopping anything.
  - Since gmx wrote to the runner's pipes, gmx died of SIGPIPE.
  - Nothing recorded its end.
- *After:*
  - The runner logs SIGHUP and keeps running. It stops writing to a terminal that is gone.
  - A job found still running after a restart says so: "still running, not followed (pid …)". Its page says it can show neither the output nor the end.
  - A job whose process is gone is *interrupted*, with the reason.
- *Limit:* a job that is running but not followed is never given an end. gmx-cypher doesn't invent one.

**R2b The record from the start** (T157).
- *Before:* the record was written only at the end, and was not atomic.
- *After:*
  - The record is written when the job starts, with `status: running`, its groups and its inputs.
  - At the end it is completed by writing a temporary file and renaming it into place.
  - Records stay version 3; the new fields are optional.
  - An incomplete record is said to be incomplete wherever it is read.

**R3a Ticket references.**
- *Before:* ten UI strings named tickets: the spec said nine; Phase 0 found a tenth.
- *After:* none do.
- The contract test fails on any `T` followed by a number, or a question number, in a UI string.

**R3b One set of words** (T161).
- *Before:* the same thing had several names ("run", "job", "analysis", "(de)Cypher").
- *After:* the before → after table of Phase 0, section 4:
  - *run again* became **open in set-up**;
  - compare's sources are **jobs · on disk · vault · files**;
  - axis labels and data names keep their case.
- The review found four strings where "run" still meant a job. They are reworded, and the word scan now catches them (section 10, finding 12).

**R3c Display names** (T162).
- *Before:* a job was named by its title: the command, the stem and its groups.
- *After:* when a project is connected, a job's name comes from the project's path pattern: sequence · column · run · command, plus a walker or replicate folder.
- Two jobs with the same name are told apart by the shortest differing folder, else by the start time. Without a project, the title stays.
- The jobs list, compare's sources, export headings and file names all use it.

**R3d Both peak rules** (T163).
- *Before:* one "first peak" stat sat under a dot that marked "the maximum".
- *After:*
  - The filled dot is the maximum; the hollow one is the first shell.
  - Stat cards, tables and the CSV give both, by name.
  - A point that is both says "maximum = first shell".

**R4 One colour scheme** (T159, T160).
- *Before:*
  - The primary action and the focus ring were coral, which is a group's tone.
  - `destructive` was coral-strong.
  - The kit carried 18 hex values of its own.
- *After:*
  - A role layer, `src/roles.json`, sits over the verbatim `tokens.json`.
  - UI state is an ink fill.
  - The reference is an ink outline: chip, card border and 3D ring.
  - `destructive` (`#8f1d1d` / `#fd2a6d`) is used only for errors, *failed* and armed actions.
  - The neutrals are tokens. A test finds no hex literal in `src/`.
- Titles are in Archivo 800, vendored for offline use and embedded in the HTML export.

**R5 One visualization core** (T170–T172).
- *Before:*
  - Tones existed three times, and dashes twice in gmx-cypher besides the Matrix's.
  - Ticks, ranges and structure parsing existed twice each.
  - There were two chart implementations.
- *After:*
  - One kit (`src/core/kit.ts`), made once from data in `src/core/index.ts`, with the Matrix's 10 dashes and their names.
  - One strict range parser and one structure model: the Matrix's `elementOf` is passed in.
  - One chart, with a hover readout on every chart. `ui/line-chart.tsx` is gone.
  - y from 0 for g(r) and counts, from the data for the rest. Axis labels keep their case.
  - The golden RDF tests pass unchanged.
- *Limits:*
  - The deduplication netted −79 lines against an estimated −390 (Phase 0). The range helpers and the parser moved rather than vanished, and `rdfLooks`, the y range, the rule, the band and the clip were added.
  - A chart of a single point draws no curve, and a stray tick outside the plot. It shows up only with `gmx order` on one inner carbon, where the page shows a table instead (proposal in section 9).

**R6 Exports** (T164, T173, T174).
- *Before:* only compare exported, and only to HTML.
- *After:*
  - Every chart exports to SVG, PDF and PNG through the Matrix's own `renderExport`, so the figures match the Matrix's.
  - CSV keeps gmx's own fields, with `#` provenance lines:
    - the command, the folder and the gmx version;
    - the record and the source's SHA-256;
    - each group's label → gmx name and atoms.
  - Any result exports to the interactive HTML page.
  - Settings → export are the Matrix's `ExportPrefs`, with the file-name fields `{file} {project} {sequence} {column} {run} {command} {group} {date}`.
  - A result page's action bar exports every chart at once.
- *Limits:*
  - The Matrix's figures have no error band, so WHAM's σ is drawn as two dashed curves.
  - A chart whose curves sit on different x grids offers no HTML page, and says why.

**R7 AWH and WHAM** (T167, T175–T177).
- *Before:*
  - AWH frames and WHAM windows cycled through 8 tones and dashes.
  - The axis said gmx's "(nm, deg or lambda state)".
- *After:*
  - Ordered curves follow a ramp, `ramp-0…3` in OKLCH: AWH frames in time order, WHAM windows in overlap order along ξ.
  - AWH convergence uses every frame, each aligned by its mean, against the frame before and against the final one, in kJ/mol. It sets no threshold, and states the alignment.
  - ξ's unit is read with `gmx dump -s` when the job starts, and kept in the record.
- *Limits:*
  - With several biases, the first one's is shown.
  - Only the first dimension is read.
  - Checked on 2023.3 and 2025.4 dumps; a 2021 dump would close it.
  - Print figures draw a ramp in even greys, not greyed colours.

**R8 One mouse and keyboard scheme** (T165, T180, T181).
- *Before:*
  - Shift-click meant "add" in compare and "the residue" in the picker.
  - Panning differed between views.
  - Only D could be rebound.
- *After:*
  - The gesture rules are pure functions in the kit, so the exported page follows them too:
    - legends: a click shows one curve alone, ⌘/Ctrl toggles one;
    - structures: Shift takes the residue, Alt the atom name, ⌘/Ctrl adds;
    - a right drag, or Space with a left drag, pans;
    - C with a click centres.
  - Charts take marks, lines and keyboard stepping.
  - Every key is in one registry, rebindable in settings → keyboard, with clashes explained in words. `?` lists them.
- *Limits:*
  - Two 3D engines stay (question 18).
  - The picker pans through 3Dmol's `translateScene`, because 3Dmol's own right drag zooms.

**R9 Where things live** (T166, T178, T179).
- *Before:* six tabs: inputs, groups, analysis, jobs, batch, cluster; compare was a dialog.
- *After:*
  - **Set-up** has three steps, each with its state, and batch is a mode of set-up.
  - **Results** shows compare in its detail pane and at `#compare`.
  - **Cluster** is unchanged.
  - The old addresses are rewritten to the new ones.
  - A file dropped anywhere goes to its place by type, and the page says where it went.
  - Every result has the same order: actions, charts, settings and groups, then provenance, collapsed.
  - One status component draws ok · note · check · error, each with its icon and word.

**R10 Compare every analysis** (T182–T185).
- *Before:* compare took RDFs only.
- *After:*
  - Compare takes any command's result, as a card with its groups. One graph draws only like quantities.
  - RMSF paints its structure on a ramp, and hovering links the atom and the chart.
  - H-bond pairs are drawn as dashed lines: the 200 nearest, with the number not drawn stated.
  - gmx distance and mindist draw their lines, both in frame positions.
  - gmx rms outlines its fit group.
- *Deviation:* the spec said centres for both, but gmx mindist's line joins the closest two atoms, because that is what mindist measures (T185).
- *Limit:* the vault gives compare its RDFs only. Other types wait for a type map: a request in section 8.

**R11 Graph settings** (T186–T189).
- *After:*
  - Same scale (x, y or both) among like quantities, with "own scale" on each chart.
  - Line styles per curve: dash by the Matrix's name, width 1.5 or 2 px, shade ±3 steps, never by hue alone.
  - Marks and lines listed under the chart, labelled, and carried into every export.
  - Groups and the reference renamed as display labels. The record, the `.ndx` and the `.xvg` keep gmx's names.
- *Proposed and built without a setting* (T187): print figures draw every curve 0.5 px heavier. Say if you want it gone, or made a setting.

**R12 A jobs list that scales** (T190–T192).
- *Before:* the runner replayed and kept every log in memory.
- *After:*
  - A job keeps the size of its log, and while it runs, its last 64 kB.
  - The page reads a log on demand: the tail, or "show all".
  - The list has search and filters (command, status, batch, folder, day), kept in the address.
  - A job that has ended can be archived and brought back. Its file is moved by a hard link, never over another file.
- Section 7 has the startup measurements.
- The review fixed two races: live output arriving while a log loads, and archiving while the record completes.

**R13 Run diff** (T193).
- *After:* "compare with…" on a result lists only what differs between two records, by section:
  - command, options and frames;
  - inputs (the same file moved counts as the same input) and groups (atoms added and removed, as ranges);
  - gmx, gmx-cypher and the environment.
- The equal fields are counted, and shown on asking.
- It compares against another job, a record on disk, or a record copy in the vault.

**R14 gmx-cypher's own space** (T158, T194, T195, T199).
- *After:*
  - `<vault>/gmx-cypher/` holds `space.json`, `README.md`, `records/<sha256>.run.json` and `projects/<id>/views/<name>.json`.
  - It is written exclusively and never replaced, and it is invisible to the Matrix, proved with the Matrix's own code.
  - Each send keeps a copy of the record, named by the SHA-256 of the file sent.
  - Compare's **views** panel saves what compare shows.
  - Compare and the run diff read the copies, so a vault RDF sent from any gmx-cypher brings its groups.
- *Privacy:*
  - A copy names paths relative to their allowed folder, or `~`.
  - It keeps environment names only.
  - The review extended this to the gmx path, the arguments and the option values (findings 1, 2, 4, 5).
- *Limit:* a saved view names jobs by id, so on another machine those jobs are "not among this gmx-cypher's jobs". Records on disk are found again under the allowed folders.

**R15 From the cluster tab to analysis** (T169, T196).
- *After:*
  - The running list is read with `qq jobs -e`, each row with its input folder.
  - A job that disappears from the list is "no longer running". It is "finished" only when `qq jobs -a` says so.
  - Each ended job offers a batch on its input folder: one click opens set-up with it, and nothing runs.
- *Limit:* built on your anonymised sample (T169). That sample has no finished job, and `qq jobs -a -e` is untried.

**R16 `gmx density` and `gmx order`** (T197, T198).
- *After:*
  - density offers all its options; electron density needs `-ei`, which must be inside the allowed folders and is recorded with its hash (review).
  - order takes the carbons as the groups step's groups, or "take the N groups of <index>" in one click. It sends `-od` and keeps `-o` beside it as `<stem>_tensor.xvg`.
- *Limit:* no membrane sample came. density was checked on the test system; order on three stand-in "carbons" (O1, S1, O2 of each sulfate): real files, meaningless numbers.
- R16b follows question 27's answer (a) in substance; only its form differs: the carbons are the groups step's groups.

## 3. Section 3, completed

Phase 0 checked every claim of section 3 against the code ([`batch-3-phase0.md`](batch-3-phase0.md) §2). Each claim, and what the batch did with it:

| Claim | Phase 0 found | Now |
|---|---|---|
| Nine UI strings carry ticket numbers | **Ten** (also `commands.ts:118`) | none; a contract test keeps them out (R3a) |
| `primary` coral, `ring` coral-strong, `destructive` coral-strong | confirmed; dark `destructive` close to coral-strong too | ink for UI state; `destructive` its own red (R4a) |
| `TONES` three times, `DASH` three times | tones ×3 confirmed; dashes ×2 in gmx-cypher besides the Matrix's | one each, the dashes the Matrix's (R5a) |
| `niceTicks`, ranges, structure parsing twice | confirmed | one each (R5a, R5b) |
| 18 hex values in the kit | confirmed | tokens; no hex in `src/` (R4b) |
| "first peak" under "the dot marks each curve's maximum" | confirmed | both rules named (R3d) |
| Gesture conflicts | confirmed, with Alt-drag panning in compare | one scheme (R8a) |
| Only D can be rebound | confirmed (`lib/keys.ts` is React keys, not the keyboard) | every key (R8b) |
| SIGHUP: gmx runs on unwatched, no record | **half true**: Node ended on SIGHUP and gmx died of SIGPIPE | the runner keeps going (R2a) |
| The record is written only at the end, not atomically | confirmed | written at the start, completed atomically (R2b) |
| Record format | **already version 3** | stays 3, with optional fields (T157) |
| Startup replays every ndjson and keeps every log | confirmed (the page already fetched logs one by one) | logs on demand (R12a) |
| AWH and WHAM palettes | confirmed, 8 tones cycling | ramps (R7a) |
| AWH axis label from gmx | confirmed; the dump holds the geometry | the unit from the run input (R7c) |
| H-bond pairs | confirmed in the selection tool's `.ndx` | drawn (R10c) |
| The Matrix's `density` and `order` types | confirmed | both commands (R16) |
| One graph draws past the plot's right edge | **not reproduced**; axis labels upper-cased instead | every chart clips; labels keep their case (R5c) |
| Status captions | 67 glyphs in 16 files, plus captions that are statuses | one status component (R9c) |
| The Matrix's export pipeline fits R6 | **proved** in Node, by import | used (R6a) |
| A space outside the project folders is invisible to the Matrix | **proved** with the Matrix's own code | the space (R14) |

## 4. The design contract

**As approved:** [`design-contract.md`](design-contract.md), approved with the Phase 0 answers in `600ad79` (T157–T169).

**What changed during the batch** (`git diff 600ad79 HEAD -- runner/docs/design-contract.md`):
- **R9b** (section 5, the order of a result page):
  - The action bar's *export* takes every chart of the page; each chart keeps its own menu.
  - Chart options sit in the chart's header.
  - The structure styles are named the same in every 3D view, and a style a renderer can't draw is shown disabled with its reason.
- **R8b** (section 3, keys):
  - H and L are split: hydrogens in structures, labels in compare.
  - [ and ] step the one graph's lead.
  - A row lists the fixed keys (Enter, Space held, a chart's arrows, Home, End).
  - The text names the registry: `KEYS` and `FIXED_KEYS` in `contract.ts`, which `lib/shortcuts.ts`, the only file that writes a key, reads.
- **The review** (no change to the text):
  - The word scan in `contract.ts` was tightened: "the/this/its run" and "run's" meaning a job.
  - `CANNOT`, what compare's renderer can't draw, moved into `contract.ts` beside `STYLES`.

## 5. Screenshots

All are in `runner/docs/img/batch-3/`, as 64-colour PNGs, light and dark.

**The top-level files are not screenshots of the built app:**
- The `*-1024.png` and `*-1280.png` files are Phase 0's design-pass mockups.
- `r2a-unfollowed-*` is from Phase 1.

| Asked for (§28) | Files |
|---|---|
| the groups card | `phase-5/r9a-setup-groups-{light,dark}.png` |
| a result page | `phase-5/r9b-result-{light,dark}.png`, `phase-5/r9b-result-energy-*`, `phase-5/r9b-result-provenance-*` |
| the jobs list with filters | `phase-7/r12b-filters-*`, `phase-7/r12c-archived-*` |
| compare, each result and one graph | `phase-6/r10a-each-*`, `phase-6/r10a-one-*`, `phase-9/qa-compare-greyed-chip-*` (real gmx, after the QA fix) |
| RMSF and H-bond cards | `phase-6/r10b-rmsf-*`, `phase-6/r10c-hbond-*`, `phase-6/r10c-hbond-zoom-*`, `phase-6/r10d-lines-*` |
| the status levels | `phase-9/status-levels-*` (done, failed, cancelled, interrupted, still running not followed, running) |
| the shortcut sheet | `phase-5/r8b-sheet-*`, `phase-5/r8b-keyboard-*` |
| the AWH ramp and its convergence | `phase-4/awh-ramp-unit-*`, `phase-4/awh-convergence-*`, `phase-9/qa-awh-31-frames-*` (31 frames, 12 drawn) |
| the WHAM ramp | `phase-4/wham-windows-ramp-*` |
| an exported SVG, PDF and CSV | `phase-9/export-svg-{light,dark}-theme.png` (real gmx), `phase-3/figure-rdf-pdf.png`, `phase-3/figure-rmsf-pdf.png`, `phase-9/export-csv-*`, `phase-3/page-awh-html.png` |
| a run diff | `phase-7/r13-diff-*`, `phase-7/r13-equal-*`, `phase-8/r14c-diff-*` |

**Also shown:**
- Ramps: `phase-4/awh-hover-dims-others-light.png`.
- Marks: `phase-5/r8a-*`.
- Same scale, styles, marks and renames: `phase-6/r11*`.
- The vault's views and record copies: `phase-8/r14*`.
- The cluster: `phase-8/r15-*`.
- density and order: `phase-8/r16-*`.

## 6. Tests

**Counts:**
- Before (`a2b422e`): 664 Vitest tests pass (1 skipped), and 6 Playwright tests.
- After: 1079 Vitest tests pass (1 skipped), and 14 Playwright tests.
- Each item's count is in section 1. Each was run at its own commit, in a copy of that commit's tree, with this checkout's `node_modules` and `matrix/` linked.
- Lint gives 0 warnings at the end; batch 3 had added 16, removed in Phase 9.
- **One test is still flaky under load.** `vault-read` failed once in this count (at `6f199e2`, while other work ran on the machine), and passed 3 times out of 3 when rerun alone.
  - It lists the vault's files before and after gmx-cypher reads it.
  - The late change comes from the Matrix's own code that made the vault for the test. gmx-cypher's reads go through a backend that refuses every write.
  - `1f05899` and `cffa09a` made the test wait for the Matrix's background writes; one is still not awaited. It is in the backlog.

**New tests:**
- **Vitest, new files:**
  - `contract`, `core`, `core-chart`, `cards`;
  - `export`, `export-prefs`, `ramp`, `result-page`, `route`, `gestures`, `graph-settings`, `labels`, `lines`;
  - `display-name`, `job-filter`, `job-log`, `jobs-scale`, `run-diff`;
  - `space`, `space-views`, `density`, `order`;
  - with `ui-strings.ts` and `setup.ts`.
- **Files extended:** 33, Playwright, the fakes and the helpers included, among them `contrast`, `decypher-*`, `jobs`, `events`, `send`, `record`, `cluster*`, `awh*`, `shortcuts`, `tokens` and `security`.
- **Playwright, new files:**
  - `cluster.spec.ts` (R15);
  - `compare-kinds.spec.ts`: RMSF and H-bond in compare, exported and opened offline, plus axe AA in both themes.
- **Playwright, extended:**
  - `decypher.spec.ts`: morphs, keys, record copies, saved views;
  - `smoke.spec.ts`: old addresses, drops, Shift-click.

**With a real `gmx`.** Setting `GMX` makes the run tests use the real gmx instead of the fake one.
- **With GROMACS 2025.4:** 100 tests pass and 8 are skipped (the cases that need the fake's 2023.3 mode), across the fifteen files below. In one run, while other test runs loaded the machine, `wham-run` timed out at 20 s; it passed when run again alone (2.8 s).
  - The fifteen files are `awh-run`, `check-inputs`, `check-sizes`, `density`, `distance-run`, `energy-run`, `gyrate`, `hbond-run`, `mindist`, `order`, `real-gmx`, `rms`, `rmsf`, `runs` and `wham-run`.
- **With GROMACS 2023.3:** 12 tests of `awh-run` and `hbond-run` fail. Neither is an app defect:
  - 2023.3 can't read the fixture energy file that 2025.4 wrote ("gmx awh could not read …").
  - With `GMX` set, the H-bond tests take the gmx to be 2025.4, and the app rightly tells 2023.3 to use `gmx hbond-legacy`.
  - The fake gmx's 2023.3 mode covers that version in the normal run.

**Manual QA:**
- Run on the real GROMACS 2025.4 (`gmx2025/bin/gmx`), with this branch's build, in Chromium at 1024 × 900, light and dark.
- 14 real jobs were run on the test system, plus an AWH run of 31 frames made here with `mdrun`.
- On every page: no console error, and axe finds no serious or critical WCAG 2 A/AA violation, colour contrast included.
- The script is `qa.mjs` in this session's scratchpad. All 62 checks pass.
- Earlier runs found two things:
  - the greyed chip's contrast, now fixed;
  - a fault in the script itself: it opened the page's *export this result* menu, not the chart's, so SVG, PDF, PNG and HTML seemed not to download.
- The AWH CSV check was added for review finding 8. It runs on an AWH run of 31 frames, because the test run's 11 frames are all drawn.

| Page or check | light | dark |
|---|---|---|
| set-up inputs | passed | passed |
| result of each job: rdf, rdf (bin 0.005), distance, hbond, rms, rmsf, gyrate, mindist, density, order, energy, awh, awh (31 frames), wham | passed (14) | passed (14) |
| compare, two RDFs, each result | passed | passed |
| compare, one graph | passed | passed |
| run diff, and it shows the bin | passed | passed |
| cluster (no `qq` here) | passed | passed |
| the `?` sheet lists the keys | passed | passed |

| Check | Result | Note |
|---|---|---|
| real gmx 2025.4 found and ready | passed | 2025.4 |
| a real job of each command: rdf ×2, distance, hbond, rms, rmsf, gyrate, mindist, density, order, energy, awh ×2, wham | passed (14) | every job ends *done* |
| export: SVG, PDF, PNG, CSV and HTML of an RDF chart | passed | `rdf_nvt.svg`, `.pdf`, `.png`, `.csv`, `.html` |
| export this result: every chart as figures, and every chart's CSV | passed | `rdf_nvt.pdf`, `rdf_nvt.csv` |
| the AWH chart's CSV holds every frame the job wrote | passed | 31 columns for 31 frames; 12 drawn |
| archive one job, then unarchive it | passed | archived and back |
| a real `qq` cluster | not run | no cluster here; R15 is tested on your anonymised sample and the fake `qq` |
| a membrane for `gmx order` | not run | no sample (R16) |
| a 2021 dump for the AWH unit | not run | no 2021 here (R7c) |
| SIGHUP with a real terminal closing | not run by hand | `test/start.test.ts` sends SIGHUP to a real runner process and checks that its job and record survive |

## 7. Measurements

**Jobs at startup (R12)**, with 2000 jobs of 1 MB log each, on Linux 6.18, 4 × Xeon 2.1 GHz, 16 GB, Node 22.22.0:

| | start | RSS | heap |
|---|---:|---:|---:|
| before (`a2b422e`) | 12 127 ms | 2119 MB | 2003 MB |
| after (R12a) | 3 101 ms | 96 MB | 9 MB |

The first step of R12a, which only stopped keeping logs, gave 8 762 ms, 170 MB RSS and 5 MB heap. Archived jobs are not read at start (R12c).

**Bundle** (`npm run build`), both built here from their own sources:

| chunk | before | after |
|---|---:|---:|
| main | 625.45 kB (192.40 gzip) | 819.86 kB (258.61 gzip) |
| compare (lazy) | 122.83 kB (38.42 gzip) | 71.28 kB (22.83 gzip) |
| HTML export (lazy) | — | 12.29 kB (4.80 gzip) |
| CSS | 60.38 kB (11.35 gzip) | 62.55 kB (12.07 gzip) |
| 3Dmol (lazy) | 574.10 kB (164.00 gzip) | 574.10 kB (164.00 gzip) |

**Why it grew:** the JavaScript loaded at start grew by 66 kB gzip, and all chunks together by 55 kB.
- The kit moved from the lazy compare chunk into the main bundle (R5a, +13 kB gzip as Phase 0 expected).
- The Matrix's export pipeline (figures and PDF) is imported into the main bundle (R6a).
- The registries, the routes and the new views added the rest.

**Not done here:** loading the export pipeline on demand would take most of R6a's share out of the start. It is in the backlog.

The fonts (mononoki, Archivo 800) are files in `public/`, not in the bundle.

## 8. For the Matrix

Requests for a Matrix batch, each with its reason:

1. **A route to a cell** (row × column × run). Then "open in the Matrix" on a sent result can land on that cell. Today gmx-cypher can only say the project.
2. **Read `<vault>/gmx-cypher/records/<sha256>.run.json`.** A sent result could then show its provenance (command, groups, gmx, frames) with an "open in gmx-cypher" link. The copies already exist, named by the file's SHA-256, which the Matrix keeps for each file.
3. **A type map for compare.** gmx-cypher's compare takes only the vault's RDFs, because it can't tell which of the vault's analysis types are like quantities. It needs each type's x and y quantity and unit.
4. **Type distance and H-bond histograms, and gmx wham's profile** (T118, from batch 2). Today they are typed as Histogram or not at all.
5. **An error band in the export figures.** WHAM's σ is drawn as two dashed curves (T173).
6. **Keep units' case in axis labels.** The Matrix does today; this asks that it stays so.

## 9. For Morpheus

Proposals:

1. **A role layer.**
   - UI state as an ink fill.
   - The reference as an ink outline.
   - `destructive` apart from coral-strong, at least 0.10 OKLab from every tone.
   - gmx-cypher keeps them in `src/roles.json`, over Morpheus's tokens copied verbatim (T159).
2. **A status component.** ok · note · check · error, each with an icon and a word; only error in `destructive` (`ui/status.tsx`, R9c).
3. **Ramp tokens** `ramp-0…3` that hold 3:1 as lines, on background and card, in both themes. Morpheus's heat ramp fails 3:1 as lines (T159, T175).
4. **Table and Combobox** (from batch 2's backlog).
5. **A point style for a chart of one point.** Today the core draws no curve for one point, and a stray tick outside the plot (R5c limits).
6. **`muted-foreground` on `secondary` in light is 4.27:1.** It fails AA for text. gmx-cypher no longer puts that pair under text (T200, and review finding 8 of batch 2); Morpheus could lighten `secondary`, or darken `muted-foreground`.
7. **Titles in a second typeface.** gmx-cypher sets the app's name and titles in Archivo 800, as the Matrix does (T160). It is an exception to "one typeface", recorded in the contract.

## 10. Review

A fresh-context review of `a2b422e..48d0755` (the agent had not seen the work) read the branch against section 26 and the contract.
- It ran Vitest, `tsc`, oxlint and the `matrix/` check, and found **19 defects**.
- Findings 1–18 are fixed in `fac2b6f`, each with a test; finding 19 is recorded.
- The QA that followed found one more (contrast), fixed in `b960319`.

| # | Severity | Finding | Done |
|---|---|---|---|
| 1 | high | A record copy was named by the record's first `.xvg`, not the file sent: wrong for order, AWH, WHAM, and some distance, hbond and mindist outputs | named by the sent file's SHA-256 (`keepRecord`); test with an order record |
| 2 | medium-high | A copy kept `command.file`, `args` and option values verbatim (the gmx path, `-ei`) | all rewritten relative to the allowed folder or `~`; test: no machine folder anywhere in a copy |
| 3 | medium | `-ei` reached gmx unchecked and unrecorded | checked inside the allowed folders; recorded with its hash as input `electrons`; tests inside and outside |
| 4 | medium | Two records with the same relative path under different folders collided in a saved view | refused in words; test |
| 5 | medium | A removed source's state (with absolute paths) was saved in a view | `viewOf` keeps only the sources' state; a stray `record:/…` is refused; tests |
| 6 | medium | From the 21st RDF on one graph, coloured by group, curves repeated | a shade per round of ten, a wider line every third round; tested up to 50 RDFs, both themes, both colourings |
| 7 | medium | A result chart's HTML page lacked its marks, lines and labels | carried (`resultPins`, `kit.withLabels`); test |
| 8 | medium | The AWH chart's CSV held only the 12 frames drawn | every frame, read when the CSV is made; checked in QA on 31 frames |
| 9 | medium-low | A failing record copy turned a landed send into an error (a retry made `name (2).xvg`) | the send stands; the copy's error is returned beside it; test |
| 10 | medium-low | With every job archived, the archive toggle disappeared | the filters always show |
| 11 | low | Cancel was red before it was armed | outlined until armed (jobs and batch) |
| 12 | low | "run" meant a job in four strings; the scan missed them | reworded; regex tightened |
| 13 | low | A copy's structure was used without checking it was the same file | size and SHA-256 checked; test with another file at that path |
| 14 | low | The log rewrite replaced bare prefixes (`/data` in `/database`) | only where a path goes on or ends; test |
| 15 | low | Archiving between a job's end and its record's completion lost the log in the record | archive waits for the record |
| 16 | low | A bad view name or escape was a 500 | 400 in words |
| 17 | low | Output streamed while a log loaded was dropped | each chunk carries its end offset; chunks are buffered during a read; the log is re-read after the stream reconnects; tests |
| 18 | low | Opening a view merged labels; the label fields didn't follow | each source's labels replaced; fields follow the store; Vitest and e2e |
| 19 | low | The space's own reads use `node:fs`, not the read-only backend | **recorded, not changed** (T199): they read only `<vault>/gmx-cypher/`, which gmx-cypher itself writes, by checked names; the Matrix's files stay behind the backend |

**Section 26 criteria the review judged not met, and their state now:**
- **A:** words and `destructive` (12, 11): fixed.
- **B:** curves past 20 (6): fixed.
- **C:** marks and labels in HTML, the AWH CSV (7, 8): fixed.
- **H:** record copies and privacy (1, 2, 5): fixed. The Matrix requests are listed in section 8.
- **I:**
  - The report and the roadmap: this commit.
  - Lint warnings: 0.
  - Playwright, console errors and contrast: verified, sections 6 and QA.
- **G:** the archive's reachability (10): fixed.

**Lint.** The review counted 16 warnings, against 0 at the baseline. They are now 0:
- Non-component exports moved out of component files, into `core/chartState.ts` and `inputsCheck.ts`.
- `CANNOT` moved to the contract.
- Refs are set in layout effects.
- State is keyed by what it was read for.

## 11. Decisions, roadmap and backlog

**Decisions:** T157–T200 in [`decisions.md`](decisions.md).
- T157–T169: the Phase 0 answers.
- T170–T198: one per item.
- T199: the review.
- T200: the QA.
- T199 amends T170, on telling RDFs apart past twenty.

**Roadmap:** every item of batch 3 is ticked; Phase 9 is ticked with this report ([`roadmap.md`](roadmap.md)).

**Backlog**, updated:
- Job submission and killing jobs.
- One 3D engine for the picker and compare.
- The requests for the Matrix (section 8) and for Morpheus (section 9).
- Trajectory preparation (`trjconv`), still only a candidate.
- **New in this batch:**
  - Load the Matrix's export pipeline on demand (section 7).
  - Vault types other than RDF in compare (needs request 3 of section 8).
  - Several AWH biases at once; AWH's second dimension.
  - A GROMACS 2021 dump for R7c.
  - A membrane run for `gmx order`, and a real `gmx density` electron file.
  - A `qq jobs -a -e` sample, and a finished job in it.
  - Real-gmx tests that also run against 2023.3 (fixtures that version can read).
  - `vault-read`'s setup: wait for every background write of the Matrix (section 6).

## 12. History

**Two things the rules asked for that the history doesn't meet.** Neither was amended, because amending was not allowed:
- **`1f05899`** holds R3b, one set of words, together with a test fix. R3b's changes were already staged when the test fix was committed, and its message names only the test fix.
- **`789cb4e`** (R4b) had 2 failing tests on its own: the tests drew without the role layer. The next commit, `ea6c5b4`, fixed them.

**Combined commits:** R14b and R14c share one commit, as do R16a and R16b. In each case the two share the API, the modules and the tests.

`git log --oneline a2b422e..HEAD` (before this report's commit):

```
b960319 Phase 9 QA: axe AA in both themes as an e2e test (T168); greyed and unplotted chips readable
fac2b6f Phase 9 review: findings 1–18 fixed, 19 recorded; lint back to 0 warnings
48d0755 Phase 9: README updated for batch 3 (section 25)
1f5037a R15, R16: the fixtures README names the new samples and how they were made
c432821 R16a–b: roadmap ticked, T197 and T198 recorded
722522f R16a–b: gmx density and gmx order
7f6b303 R15: roadmap ticked, T196 recorded
3c5b95b R15: a cluster job that ended offers a batch on its input folder
4d65d77 R14b–c: roadmap ticked, T194 and T195 recorded
64d45cd R14b–c: saved compare views in the vault space; compare reads the record copies
85c2b2d R13: roadmap ticked, T193 recorded
9a203da R13: run diff, what differs between two records
6b25413 R12c: roadmap ticked, T192 recorded
e0b4185 R12c: archive jobs that have ended, and bring them back
60175ab R12b: roadmap ticked, T191 recorded
b4984ea R12b: search and filters for the jobs list, in the address
1549d00 R12a: roadmap ticked, T190 recorded
6f199e2 R12a: logs read on demand; startup without logs in memory
00de6b9 R11d: roadmap ticked, T189 recorded
c01434c R11d: renamed groups and reference, as display labels
2ef1184 R11c: roadmap ticked, T188 recorded
8f5590f R11c: marks and lines listed, labelled, carried into exports
0219e39 R11b: roadmap ticked, T187 recorded
8a14732 R11b: line styles per curve
e6cafd0 test: a run removes the temp folders it made
3e47432 R11a: roadmap ticked, T186 recorded
6b7eed6 R11a: same scale across compare's charts
2faa41d R10d: roadmap ticked, T185 recorded
a3e9cc6 R10d: distance and mindist lines, gmx rms's fit group
a2d66fd R10c: roadmap ticked, T184 recorded
dda271f R10c: H-bond pairs on the structure
cffa09a test: the read-only vault listing waits for the Matrix's PMF cache write
0d6439c R10b: roadmap ticked, T183 recorded
f563308 R10b: RMSF on the structure
56db22b R10a: roadmap ticked, T182 recorded
71f7b2f R10a: any command's result in compare; one graph only for like quantities
6e581e3 R8b: roadmap ticked, T181 recorded
4482391 R8b: every key in one registry, rebindable, listed by ?
bdb666f R8a: roadmap ticked, T180 recorded
cc0f3e5 R8a: one gesture scheme for structures, charts and legends
586f02d R9b: roadmap ticked, T179 recorded
6725ee6 R9b: one result page layout; compare's controls regrouped; one style menu
065ff1d R9a: roadmap ticked, T178 recorded
cd5d8ec R9a: set-up as steps, results with compare in the detail pane, addresses, drops routed by type
30c8d1f Phase 4: screenshots of the ramps, AWH convergence and the AWH unit, light and dark
b861d95 R7c: roadmap ticked, T177 recorded
0c4b735 R7c: the AWH axis unit
4ebfa5a R7b: roadmap ticked, T176 recorded
515028e R7b: AWH convergence
6e60bcd R7a: roadmap ticked, T175 recorded
759fc16 R7a: ramps for ordered curves
3dcfbe6 Phase 3: screenshots of the core charts and the exports, light and dark
d48ce71 R6b: roadmap ticked, T174 recorded
50c7d45 R6b: export settings
dd965e3 R6a: roadmap ticked, T173 recorded
896ff5d R6a: every chart exports to SVG, PDF, PNG and CSV, and any result to HTML
a212444 R5c: roadmap ticked, T172 recorded
346cd47 R5c: every chart drawn by the core, with a hover readout
0c3e00b R5b: roadmap ticked, T171 recorded
6214c21 R5b: one structure model
35122ee R5a: roadmap ticked, T170 recorded
1e01cb8 R5a: one copy each of tones, dashes, ticks and atom ranges
97c7b5c R9c: one status component, used for every status
c40899d R3d: both peak rules, named and shown
2826065 R4a: compare's reference chip and its 3D label are ink outlines too
5c38c94 R3c: display names from the project pattern
f7d14a6 R14b-1: the connected project, as a setting
1f05899 Test: wait for the Matrix's background verify before listing a vault
f16a9dc R4c: titles in Archivo 800, as the Matrix
ea6c5b4 R4b: the tests draw with the role layer, as the page does
789cb4e R4b: the kit's neutrals moved into the tokens; no hex outside them
2e8447e R4a: colour roles; the reference in ink; destructive only for errors
7c304ab Phase 1: screenshots of a job found running after a restart
65e6cca R14a: gmx-cypher's own space in the vault, with a copy of the record beside each sent result
a57ca6b R2a: an unfollowed job's page says what it can't show
4e45c8b R3a: ticket references out of the UI, with the test that keeps them out
78f968d R2b: the record is written when the job starts, and completed atomically when it ends
8130b5d R2a: keep jobs and their records when the terminal closes
600ad79 Batch 3: Phase 0 answers recorded (T157-T169)
38f6763 Batch 3 Phase 0: baseline, the spec checked against the code, design pass, plan and questions
```

**`matrix/` is unchanged:**
- `git diff --stat a2b422e HEAD -- matrix` prints nothing.
- `node scripts/matrix-pinned.mjs` says: "matrix/ is the Matrix at e9a64df (…), as pinned, unchanged".

`git diff --stat a2b422e HEAD` (before this report's commit), with the screenshots and fixtures summed:

```
 runner/README.md                                       |  550 ++++++++++-----------
 runner/docs/batch-3-phase0.md                          |  458 +++++++++++++++++
 runner/docs/batch-3.md                                 | 1215 ++++++++++++++++++++++++++++++++++++++++++++++
 runner/docs/decisions.md                               |   49 ++
 runner/docs/design-contract.md                         |  129 +++++
 runner/docs/roadmap.md                                 |   90 ++++
 runner/e2e/cluster.spec.ts                             |   57 +++
 runner/e2e/compare-kinds.spec.ts                       |  124 +++++
 runner/e2e/decypher.spec.ts                            |  213 ++++++--
 runner/e2e/smoke.spec.ts                               |  167 ++++++-
 runner/package-lock.json                               |   27 ++
 runner/package.json                                    |    3 +-
 runner/public/fonts/Archivo-LICENSE.txt                |   93 ++++
 runner/public/fonts/archivo-latin-800-normal.woff2     |  Bin 0 -> 14400 bytes
 runner/public/fonts/archivo-latin-ext-800-normal.woff2 |  Bin 0 -> 12888 bytes
 runner/scripts/measure-jobs.mjs                        |   36 ++
 runner/scripts/tokens.ts                               |   23 +-
 runner/server/api.ts                                   |  125 +++--
 runner/server/awh.ts                                   |   18 +-
 runner/server/batch.ts                                 |   13 +-
 runner/server/check.ts                                 |    7 +-
 runner/server/cluster.ts                               |   37 +-
 runner/server/decypher.ts                              |   82 +++-
 runner/server/files.ts                                 |   12 +-
 runner/server/jobs.ts                                  |  162 ++++++-
 runner/server/main.ts                                  |    6 +
 runner/server/runs.ts                                  |   77 ++-
 runner/server/send.ts                                  |   30 +-
 runner/server/space.ts                                 |  109 +++++
 runner/server/state.ts                                 |    4 +-
 runner/src/App.tsx                                     |  144 ++++--
 runner/src/api.ts                                      |    2 +-
 runner/src/core/Chart.tsx                              |  321 ++++++++++++
 runner/src/core/cards.ts                               |   44 ++
 runner/src/core/chartState.ts                          |   26 +
 runner/src/core/contract.ts                            |   90 ++++
 runner/src/core/export.ts                              |   77 +++
 runner/src/core/exportPrefs.ts                         |   41 ++
 runner/src/core/gestures.ts                            |   27 ++
 runner/src/core/index.ts                               |   33 ++
 runner/src/{decypher => core}/kit.ts                   |  808 +++++++++++++++++++++++-------
 runner/src/core/ramp.ts                                |   46 ++
 runner/src/{decypher => core}/theme.ts                 |   12 +-
 runner/src/{decypher => core}/tokens.ts                |    9 +-
 runner/src/decypher/Decypher.tsx                       |  442 ++++++++++-------
 runner/src/decypher/SavedViews.tsx                     |   60 +++
 runner/src/decypher/export.ts                          |   92 ++--
 runner/src/decypher/lines.ts                           |   53 ++
 runner/src/decypher/panels.tsx                         |  236 +++++----
 runner/src/decypher/parse.ts                           |  113 +++--
 runner/src/decypher/sources.ts                         |   55 ++-
 runner/src/decypher/state.ts                           |   70 ++-
 runner/src/decypher/vaultTypes.ts                      |    8 +-
 runner/src/index.css                                   |   17 +
 runner/src/inputsCheck.ts                              |   46 ++
 runner/src/jobs.ts                                     |   80 ++-
 runner/src/lib/atoms.ts                                |   53 +-
 runner/src/lib/awh.ts                                  |   75 +++
 runner/src/lib/box.ts                                  |   47 +-
 runner/src/lib/cluster.ts                              |   41 +-
 runner/src/lib/commands.ts                             |   68 ++-
 runner/src/lib/csv.ts                                  |   79 +++
 runner/src/lib/density.ts                              |   42 ++
 runner/src/lib/displayName.ts                          |   50 ++
 runner/src/lib/drop.ts                                 |   54 +++
 runner/src/lib/groups.ts                               |    3 +-
 runner/src/lib/hbond.ts                                |   25 +
 runner/src/lib/jobFilter.ts                            |   51 ++
 runner/src/lib/labels.ts                               |   47 ++
 runner/src/lib/order.ts                                |   39 ++
 runner/src/lib/paths.ts                                |    4 +
 runner/src/lib/platform.ts                             |    3 +
 runner/src/lib/rdf.ts                                  |    9 +
 runner/src/lib/recipe.ts                               |    3 +-
 runner/src/lib/record.ts                               |   24 +-
 runner/src/lib/route.ts                                |   43 ++
 runner/src/lib/runDiff.ts                              |   90 ++++
 runner/src/lib/shortcuts.ts                            |   82 +++-
 runner/src/lib/space.ts                                |  119 +++++
 runner/src/lib/tones.ts                                |   19 +-
 runner/src/lib/wham.ts                                 |    5 +
 runner/src/roles.json                                  |  159 ++++++
 runner/src/structure.ts                                |   10 +-
 runner/src/ui/alert.tsx                                |   10 +-
 runner/src/ui/badge.tsx                                |    1 -
 runner/src/ui/button.tsx                               |    4 +-
 runner/src/ui/display-menu.tsx                         |   51 ++
 runner/src/ui/dropzone.tsx                             |    2 +-
 runner/src/ui/label-input.tsx                          |   16 +
 runner/src/ui/label.tsx                                |    6 +-
 runner/src/ui/legend.tsx                               |   40 ++
 runner/src/ui/line-chart.tsx                           |  185 -------
 runner/src/ui/result-page.tsx                          |   45 ++
 runner/src/ui/select.tsx                               |    2 +-
 runner/src/ui/shortcut-sheet.tsx                       |   55 +++
 runner/src/ui/status.tsx                               |   47 ++
 runner/src/ui/tabs.tsx                                 |    6 +-
 runner/src/views/Analysis.tsx                          |    2 +-
 runner/src/views/Awh.tsx                               |   11 +-
 runner/src/views/Batch.tsx                             |   36 +-
 runner/src/views/Cluster.tsx                           |   53 +-
 runner/src/views/Code.tsx                              |    2 +-
 runner/src/views/Energy.tsx                            |   11 +-
 runner/src/views/ExportSettings.tsx                    |   83 ++++
 runner/src/views/GroupCommand.tsx                      |   30 +-
 runner/src/views/Groups.tsx                            |   58 ++-
 runner/src/views/Inputs.tsx                            |   92 ++--
 runner/src/views/JobFilters.tsx                        |   59 +++
 runner/src/views/Jobs.tsx                              |  133 +++--
 runner/src/views/Recipes.tsx                           |    7 +-
 runner/src/views/Result.tsx                            |  413 +++++++++++-----
 runner/src/views/RunDiff.tsx                           |  132 +++++
 runner/src/views/SendDialog.tsx                        |   23 +-
 runner/src/views/Settings.tsx                          |  102 ++--
 runner/src/views/Setup.tsx                             |   73 +++
 runner/src/views/Viewer.tsx                            |  115 +++--
 runner/src/views/Wham.tsx                              |   20 +-
 runner/test/atoms.test.ts                              |    3 +-
 runner/test/awh-run.test.ts                            |   15 +
 runner/test/awh.test.ts                                |   77 ++-
 runner/test/batch.test.ts                              |    2 +
 runner/test/box.test.ts                                |   60 ++-
 runner/test/cards.test.ts                              |  161 ++++++
 runner/test/cluster-run.test.ts                        |   51 +-
 runner/test/cluster.test.ts                            |   51 +-
 runner/test/commands.test.ts                           |    8 +-
 runner/test/contract.test.ts                           |   58 +++
 runner/test/contrast.test.ts                           |   65 ++-
 runner/test/core-chart.test.ts                         |  159 ++++++
 runner/test/core.test.ts                               |  126 +++++
 runner/test/decypher-export.test.ts                    |   37 +-
 runner/test/decypher-kit.test.ts                       |   66 ++-
 runner/test/decypher-morph.test.ts                     |   42 +-
 runner/test/decypher-server.test.ts                    |   54 ++-
 runner/test/density.test.ts                            |  104 ++++
 runner/test/display-name.test.ts                       |   40 ++
 runner/test/energy-run.test.ts                         |    2 +-
 runner/test/events.test.ts                             |   27 +-
 runner/test/export-prefs.test.ts                       |   54 +++
 runner/test/export.test.ts                             |  147 ++++++
 runner/test/fake-gmx.mjs                               |   25 +-
 runner/test/fake-qq.mjs                                |   12 +-
 runner/test/gestures.test.ts                           |   76 +++
 runner/test/graph-settings.test.ts                     |  127 +++++
 runner/test/groups.test.ts                             |    3 +-
 runner/test/hbond-run.test.ts                          |    2 +-
 runner/test/helpers.ts                                 |    9 +-
 runner/test/job-filter.test.ts                         |   61 +++
 runner/test/job-log.test.ts                            |   25 +
 runner/test/jobs-scale.test.ts                         |  119 +++++
 runner/test/jobs.test.ts                               |   51 +-
 runner/test/labels.test.ts                             |   74 +++
 runner/test/lines.test.ts                              |   76 +++
 runner/test/order.test.ts                              |   74 +++
 runner/test/peak.test.ts                               |   25 +-
 runner/test/ramp.test.ts                               |   61 +++
 runner/test/record.test.ts                             |    3 +-
 runner/test/result-page.test.ts                        |   73 +++
 runner/test/route.test.ts                              |  110 +++++
 runner/test/run-diff.test.ts                           |   90 ++++
 runner/test/runs.test.ts                               |   51 +-
 runner/test/security.test.ts                           |    6 +-
 runner/test/send.test.ts                               |   70 ++-
 runner/test/setup.ts                                   |    5 +
 runner/test/shortcuts.test.ts                          |   98 +++-
 runner/test/space-views.test.ts                        |  110 +++++
 runner/test/space.test.ts                              |  137 ++++++
 runner/test/start.test.ts                              |   56 ++-
 runner/test/stdin.test.ts                              |    2 +-
 runner/test/tokens.test.ts                             |   17 +-
 runner/test/ui-strings.ts                              |   25 +
 runner/test/vault-read.test.ts                         |    4 +-
 runner/tsconfig.test.json                              |    2 +-
 runner/vitest.config.ts                                |    1 +
 runner/docs/img/ (screenshots): 148 files changed, 0 insertions(+), 0 deletions(-)
 runner/test/fixtures/ (samples): 34 files changed, 3461 insertions(+)
all: 356 files changed, 14637 insertions(+), 1950 deletions(-)
 matrix/: unchanged (no line)
```
