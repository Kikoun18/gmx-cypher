# Task: gmx-cypher batch 4 — SymBuilder inside gmx-cypher: home, symbuilder, analysis and cluster, working with the Matrix

**gmx-cypher** (`cypher/`) runs GROMACS analyses on my trajectories and sends the results to **the Matrix** (`matrix/`, read-only), my visualisation app. **SymBuilder** is my design for a system builder: it does what my notebook `solution_builder_seq_5_4.ipynb` does today (build a peptide with PyMOL, place it with a saccharide, make the topology, add water and prosECCo75 salt, minimise, equilibrate, then prepare AWH, the pull and the multiwalker windows), for every method × saccharide × sequence, here or on the cluster. This batch puts SymBuilder into gmx-cypher, so that gmx-cypher has four tabs: **home** (a simple dashboard; I'll design the real one later), **symbuilder**, **analysis** (today's set-up, results and compare) and **cluster**. It must feel like one app, it must work end to end, and SymBuilder and the Matrix must work together: the systems I build are the rows, columns and runs of a Matrix project, and their PMFs land there.

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | Four tabs: home · symbuilder · analysis · cluster; every old address still works | layout | 9 |
| R2 | home: a simple dashboard from what the server already knows | layout | 10 |
| R3 | SymBuilder's build stack and its plan: every command for every system, before anything runs | builder | 11 |
| R4 | What a build reads: files per saccharide and sequence, the mdp files, the force field, SymBuilder's settings | builder | 12 |
| R5 | Building on this machine: the steps, the folders they write, progress, a build record | builder | 13 |
| R6 | Failures, retries, repeats and resume | builder | 14 |
| R7 | The cluster: qq scripts, profiles, and the cluster tab | cluster | 15 |
| R8 | SymBuilder and the Matrix: systems from a project, folders the project reads, PMFs into the vault | vault | 16 |
| R9 | SymBuilder's reports: build summary, charge, pull, walkers, termini, PMF numbers | builder | 17 |
| R10 | From a built system to analysis | layout | 18 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

**What this spec knows:**
- It was written from the copies of `cypher/` and `matrix/` I uploaded (no git history: `cypher/.git` points to the-matrix's `.git/modules/cypher`, which wasn't included), from the SymBuilder mock-up (section 5) and from my notebook with its saved outputs. Anything marked **verified** was read in that code, or run: the baseline in section 3 was measured on those copies with Node 22.22, and the Matrix probes in section 4 ran the Matrix's own functions.
- No real `gmx`, `qq`, PyMOL or gromologist was available. The notebook's saved outputs carry real GROMACS 2025.4 text for `pdb2gmx`, `solvate`, `genion` and `grompp` (section 5.3); anything beyond that is **unverified** until checked in Phase 0.
- Wherever this spec and the code disagree, the code wins; tell me when that happens.

---

## 0. How to work on this task

### 0.1 Repository

- The git root is **the-matrix**. It holds `cypher/` (gmx-cypher, a submodule), `matrix/` (the Matrix) and `tank/`. Every path in this spec is relative to that root. The older documents in `cypher/docs/` say `runner/` and `app/`; read those as `cypher/` and `matrix/` (README, last section).
- **`matrix/` is read-only.** Import from it; never change it. `npm test` in `cypher/` runs `scripts/matrix-pinned.mjs` first, which fails when gmx-cypher is not inside the-matrix or `matrix/` has uncommitted changes. Keep it passing at every commit. Anything this batch wants from the Matrix goes into the report's "For the Matrix" list (section 23).
- **`tank/` is out of scope.** Don't read it for this batch, and don't change it.
- Work in `cypher/` on a new branch, `cypher-batch-4`, from its current HEAD. Record that hash, and the-matrix's, in the Phase 0 report as the baseline. Moving the-matrix's pin to the new gmx-cypher is my decision, not part of this batch.

### 0.2 Living documents (in `cypher/docs/`)

- Save this spec as `batch-4.md`.
- Add a **Batch 4** section to `roadmap.md` with the checklist in section 6. Keep the existing backlogs; move items in or out as this batch changes them.
- Continue `decisions.md` from **T201** (the last one is T200), one line of rationale each.
- Amend `design-contract.md` where this batch changes a rule (R1 needs it: question 1), and keep `src/core/contract.ts` in step with it.
- Put the SymBuilder mock-up I give you in `docs/mockups/symbuilder/` (section 5.1). It is a design reference, not code to copy.
- Save the Phase 0 report as `batch-4-phase0.md`, and finish with `batch-4-report.md` (section 23).
- **The notebook.** Read it from where I give it to you. Don't commit it unless I say so: its outputs hold my cluster paths and user name (question 19).

### 0.3 Phase 0: Investigate, design and plan (no code changes)

Scratch scripts and throwaway mock-ups are fine, but keep them outside the repository or delete them. Commit only the Phase 0 documents, the mock-up in `docs/mockups/symbuilder/` and small screenshots in `docs/img/batch-4/`.

1. **Baseline.** Run lint, build, Vitest and Playwright in `cypher/`, and the Matrix's tests and lint in `matrix/`. Compare with section 3. If anything fails, stop and tell me.
2. **Check this spec against the code.** For each request, confirm or correct its **Today**, with file references. Sections 3 and 4 are a start, not the whole check.
3. **Read the notebook and the mock-up side by side.** Make a table: every notebook function (sections 5.2–5.3) → the request and the code that will do it, or "left out" with the reason. The notebook's plotting is left out (section 2).
4. **Design pass, in three steps: plan, review against the brief, then show.**
   - **Plan.** Where each of the mock-up's ten boards goes in gmx-cypher (section 5.1 proposes a mapping; question 4), in one sentence each with an ASCII wireframe: the four tabs; SymBuilder's views; home; the cluster tab with scripts.
   - **Review against the brief.** The brief is Morpheus, the design contract and the mock-up. The mock-up is built with Morpheus's components and sample data; gmx-cypher has its own kit in `src/ui/` on Morpheus's tokens. Where the mock-up and the contract disagree (words, status levels, colour roles), the contract wins unless I decide otherwise; list each case.
   - **Show.** Screenshots in light and dark, at 1280 and 1024 px: the tab bar; home; SymBuilder's build stack with a tile selected; the systems preview; the cluster tab with a script. Throwaway mock-ups are fine; commit only the images.
5. **For each request R1–R10, write:** current behaviour (verified, with files); the smallest change that meets the requirements, with every file you will touch; a code budget (lines added and removed); **writes** (every new place on disk gmx-cypher would write to, and every file a step would change); **programs** (every new program gmx-cypher would start, with its fixed arguments); tests by name; risks; open questions with options and your recommendation.
6. **Ask me for real samples, and don't build a parser or a fake without one** (section 5.3 lists what I can send).
7. **Size and order.** Estimate the batch (batch 2 was about 3,700 lines of code; batch 3 added 415 tests). I think it is two batches (question 21): propose the cut.
8. **Questions.** One numbered list at the end of the report, starting from section 7.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–n: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section, the design contract and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first,** and check that they fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff:** simplify, delete what became dead, match the surrounding names, remove debug output.
5. Run lint, build and Vitest (which includes the `matrix/` check); for anything that changes a screen, Playwright too.
6. **Run the item's manual checks in Chromium** and watch the console. Screenshot every visual check in light and dark. Headless Chromium draws WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Mark anything you can't run (a real `gmx`, PyMOL, gromologist, `qq`, the cluster, my data) as **not run**, and list it for me. Never report a check as passed unless you ran it.
7. **Critique what you built against the design contract and the mock-up,** using the screenshots. Before calling the item done, remove one thing that doesn't need to be there.
8. Update `roadmap.md`, `decisions.md`, and `design-contract.md` if a rule changed.
9. Commit (section 22).
10. Give me a short summary (3–5 lines): what changed, net lines, tests added, manual checks run or not run (with screenshots), anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead.**

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- gmx-cypher would start a program it doesn't start today, or with arguments that aren't fixed in code;
- gmx-cypher would write anywhere new, change a file it didn't create in this build, or delete anything (section 1.3);
- anything would be written inside the vault, beyond `_inbox/` and `gmx-cypher/` as today;
- a change would alter a number (charges, ion counts, PMF values), a stored record, an existing file name or address, or how an old record is read;
- the mock-up, the notebook and the contract disagree;
- an item would exceed its code budget by more than about 50 %;
- you want a dependency that isn't already in `cypher/`;
- a parser, a fake tool or a test needs real output you don't have.

Batch your questions, each with options and a recommendation. Don't ask about anything the code, the docs, the contract or this spec already settles.

---

## 1. Principles

### 1.1 Minimal, concise code

- **Extend what exists before adding anything.** Reuse:
  - gmx-cypher's job runner (`server/jobs.ts`: process groups, cancel, the ndjson log, SIGHUP behaviour), `capture()` (`server/gmx.ts`), free names (`freeStem`, the Matrix's `uniqueName`), the batch preview and landing preview, the cluster parsers (`src/lib/cluster.ts`), the status component and the result charts;
  - **the Matrix, by import**: `parsePath`, `parseName`, `planBatch`, `parseTable` (`matrix/src/lib/seq.ts`), `correctCurve`, `wellArea`, `runStats` (`matrix/src/lib/pmf.ts`), `storage/path`.
- **Every decision is a pure function, with table-driven tests:** the plan of every step (argv, stdin answers, files read and written), system and folder names, repeat suffixes, ion counts, the merged `.gro`, the `[ CARB ]` index group, the topology text, qq scripts, the walker frame choice, retry plans, report rows. The server and components only call them.
- **The notebook is the golden reference.** For the first system, the plan's commands match the notebook's, argument for argument, except where I approve a difference (record it as a decision).
- **Delete code that becomes unused.** No commented-out code, no `TODO` without a roadmap entry.

### 1.2 Design and front-end practice

- **Morpheus is the brief, the Matrix is the neighbour, and the design contract decides** (`docs/design-contract.md`). Morpheus's rules stay: lowercase controls; one primary action per view; states as words; destructive actions armed on the first click and done on the second; visible focus everywhere.
- **The mock-up is a reference.** Rebuild it with `src/ui/` and the colour roles, not with the mock-up's markup. Its numbers are sample data; its file drops and *duplicate* buttons are not wired.
- **Words.** The contract's words keep their meanings (*job*, *record*, *run*, *result*, *analysis*, *command*, *send*). The scanner in `test/contract.test.ts` reads every string in `src/` and `server/`; the mock-up's text breaks it in 21 places (section 3), so every string is reworded, not copied.
- **Quality floor,** without announcing it: the keyboard reaches everything, and every drag has a keyboard or button equivalent (the stack's ↑ ↓ buttons); contrast of at least 4.5:1 for text and 3:1 for marks, in both themes; `prefers-reduced-motion`; every screen works at 1024 px; no console errors or warnings; status changes announced (`aria-live="polite"`).

### 1.3 Running programs and files safely

Unchanged, from the README's *Safety* section: no shell (argument arrays, `shell: false`, stdin answers written to the process); 127.0.0.1 only, the token, a local Host and Origin; paths from the page checked against the allowed folders; the vault read through the read-only backend; gmx-cypher writes in the vault only to `<project>/_inbox/` and `<vault>/gmx-cypher/`.

**What SymBuilder needs and today's rules forbid** (each is question 5, 6 or 7; nothing below is built before I answer):
- **New programs:** the gmx tools that build (`pdb2gmx`, `editconf`, `trjconv`, `solvate`, `genion`, `insert-molecules`, `make_ndx`, `grompp`, `mdrun`, `energy`, `awh`), and a configured python running PyMOL and gromologist through scripts shipped with gmx-cypher. Each from a fixed list, with arguments built only from the plan; nothing from the page reaches an argument except values that the plan validates (names, numbers, paths inside the allowed folders).
- **New writes:** a system's folder tree, created by the build (`solutions/{method}/{saccharide}/{sequence}/…`), scripts in the project's `scripts/` folder, build records, and logs.
- **Files changed after they are written.** GROMACS itself does this in my notebook: `solvate -p` and `genion -p` edit the topology, the saccharide's `.gro` is centred and shifted onto itself, `pre.gro` is replaced by its aligned copy, glucose is inserted into `3.salted.gro`, and the topology is rewritten for HMR and for TIP3F. My proposal for question 5: inside a system folder that this build created, a step may replace a file that an earlier step of the same build wrote, and the record says so; nothing that existed before the build is ever changed, moved or deleted.
- **No deletes.** The notebook deletes the charge check's `_charge_check.tpr` and its mdout, and overwrites `logs/build_summary_latest.log`. Keep scratch files in a temporary folder outside my folders (as `server/awh.ts` and `server/energy.ts` do with `mkdtemp`), and write the summary to new dated files only (question 11).

### 1.4 Data practice

- **Every choice that changes a number is visible and recorded:** the charge scale (0.75), the ion names and counts, the salt from the water count, the hydrogen mass (gromologist, with its defines), the water model (TIP3P or TIP3PF), the temperature, the walker distances, the frame chosen for each walker, the PMF correction.
- **GROMACS output stays exactly as gmx wrote it.** Anything sent to the Matrix is in kJ/mol and nm, with its `#` and `@` lines.
- **One formula, one place.** PMF numbers shown in SymBuilder come from the Matrix's code, so the same curve gives the same number in both apps (question 15).

---

## 2. Scope limits

- `matrix/` stays unchanged (question 17). `tank/` is not touched.
- No job submission (`qq submit`) and no killing jobs, unless I decide otherwise (question 6).
- No user python scripts as tiles (the mock-up's library board), unless I decide otherwise (question 7).
- The notebook's plots (`basic_analysis`, `plot_single`, `plot_combined`) are left out. Charts already in gmx-cypher may show SymBuilder data where they fit.
- home stays simple; I'll design it later.
- No undo/redo. No new dependency without asking.
- Bugs you find along the way go into the backlog, unless they sit on lines this batch already changes.

---

## 3. What was verified for this spec

**Baseline,** measured on the uploaded copies laid out as the-matrix (`cypher/` beside `matrix/`), Node 22.22, `npm ci`, fake gmx. `matrix-pinned.mjs` could not run (no git history), so Vitest ran directly.

| Check | Result |
|---|---|
| `cypher/`: `npx oxlint` | 0 warnings, 0 errors |
| `cypher/`: `tsc -b`, then `vite build` | pass. Main bundle 819.86 kB (258.61 gzip); compare 71.34 kB, 3Dmol 574.10 kB and the HTML export 12.37 kB load on demand; CSS 62.55 kB. The build prints the 3Dmol `eval` warning and the chunk-size warning |
| `cypher/`: `npx vitest run` | 1079 passed, 1 skipped, in 86 files (as `batch-3-report.md` §6) |
| `cypher/`: Playwright | **not run** here; the batch-3 report says 14 |
| `matrix/`: `npx vitest run` | 658 passed, in 46 files (the batch-3 report says 652 in 45; `test/defaults.test.ts` came after it) |
| `matrix/`: `npx oxlint` | 7 warnings (the baseline's: `only-export-components` in `Laser.tsx` and `ui.tsx`) |

**Claims checked in the code:**

| Claim | What the check found |
|---|---|
| gmx-cypher has set-up, results, compare and cluster | **True.** Three tab triggers in `src/App.tsx`: `set-up`, `results`, `cluster`; compare is a route shown under results (`const tab = route.view === 'compare' ? 'results' : route.view`); settings is a dialog from the header. Routes in `src/lib/route.ts`: `#setup/<step>[?mode=batch]`, `#results[/<job>]`, `#compare?jobs=…`, `#cluster`, plus the old `#inputs #groups #analysis #rdf #jobs #batch` (`OLD`); any other address becomes `#setup/inputs`; `formatRoute` ends in a catch-all `return '#cluster'`. |
| The cluster tab polls only while open | **True,** because Radix mounts only the active `TabsContent`; `ClusterView` reads on open, then every 60 s, backing off after failures (`src/lib/cluster.ts` `nextPoll`), and pauses while the page is hidden. |
| The cluster tab can't submit | **True, by design.** `server/cluster.ts`: "the only place gmx-cypher starts anything but gmx … nothing here kills or submits a job"; the commands are constants (`QQ_JOBS`, `QQ_ALL`, `GMX_ETA`); README *Safety*: it cannot "run anything but the commands above, kill or submit a cluster job"; `roadmap.md` keeps "Job submission and killing jobs" in batch 3's backlog. |
| The contract's word *analysis* | **Conflicts with R1.** `design-contract.md` §1: **analysis** means only "the Matrix's type of a curve set", never "a tab or step (*analysis* tab → *command* step)". |
| The mock-up's words pass the contract | **No: 21 phrases** that `NEVER_SHOWN` (`src/core/contract.ts`) refuses, found by running its patterns over the mock-up's text: "the run" (16, e.g. "the run tab", "stop the run"), "this run" (3), "a run" (1), "each job" (1). Also *recipe* (the mock-up's saved stack) collides with gmx-cypher's analysis recipes (`server/recipes.ts`, `~/.gmx-cypher/recipes/`), *batch* with batch mode, and *settings* with the settings dialog. |
| Jobs run only gmx analyses | **True in practice.** `Jobs` (`server/jobs.ts`) is generic, but its only production caller is `startRun` with `file: ctx.gmx.path!` (`server/runs.ts`); the record (`format: 'gmx-cypher run'`, version 3, `src/lib/record.ts`) needs a gmx command from `COMMANDS` (`src/lib/commands.ts`); `Result.tsx` and the send endpoints check `COMMANDS` too. |
| Folders and files the builder needs | **Refused or hidden today.** `inside()` (`server/files.ts`) answers 404 for a path that doesn't exist yet; outside the state folder an output folder is made without `recursive` (`server/runs.ts`); the file browser shows only `.xtc .trr .tng .tpr .gro .pdb .ndx .edr .xvg` (`src/lib/inputs.ts` `inputRole`), so `.top`, `.itp`, `.mdp`, `.py`, `.sh` are hidden; `/api/upload` refuses them; `/api/file` sends only `.gro`, `.pdb` and `.ndx`. |
| Long processes | `capture()` stops a program after 60 s by default, so `mdrun` must run as a job. Nothing limits jobs outside batches; batches use `config.concurrency` (default 2, file-only: not in `SETTABLE`). Jobs run with `GMX_MAXBACKUP: '99'`, and a backup of a job's own name is recorded as a problem (`server/runs.ts`). |
| AWH batches | **Refused today:** `batchable` in `server/api.ts`: "batches run recipes of commands with atom groups … (energy and AWH batches are not built yet)". |
| gmx-cypher reads a project's rows and columns | **True.** `GET /api/vault/project?id=` returns `projectSummary` (`server/vault.ts`): columns `{k, label}`, rows `{id, name, seq, group, runs, analyses}` with `runs` per column key, and the project's `pattern` and `pathPattern`. |
| From the cluster tab to set-up | **Exists** (batch 3, R15): `offerBatch(root, recipe)` in `src/App.tsx` opens set-up in batch mode with a folder and a recipe. R10 can reuse it. |
| Settings | `Config` in `server/state.ts`: `gmx`, `allow`, `vault`, `project`, `pmfUrl`, `concurrency`, `hashTrajectories`, `qq`, `gmxEta`; the page may change only `SETTABLE` (`server/api.ts`), and program paths are validated like `qq` (`isAbsolute`, a safe pattern, executable). |
| Tests of components | No jsdom or Testing Library: components are tested with `react-dom/server`'s `renderToStaticMarkup` in Node (decision T179). |

---

## 4. The Matrix, where SymBuilder meets it

All read or run in `matrix/` as uploaded.

- **The model** (`src/lib/types.ts`, `src/lib/seq.ts`). A row is method (the row **group**) + name + sequence; `seqKey` lower-cases group and name and upper-cases the sequence. A column is user-made; a new project starts with one, `COL1` (`DEFAULT_COLS`, `src/lib/pmf.ts`), and an unknown column in a path creates a new one on upload. A **run** is a slot `a`–`j` (1–10) of a cell: one PMF curve. There is no walker, method list or saccharide list in the code; `public/sacch.json` is display text for `ha`, `o26` and `pg`.
- **The folder pattern** (`Settings.pathPattern`, parsed by `parsePath`): `{method}` is the row group, `{column}`, `{seq}`, `{run}` (1–10); tokens never cross `/`; the pattern matches the end of the path. **Probed** with the Matrix's own `parsePath`:

  | Pattern | Path | Result |
  |---|---|---|
  | `{method}/{column}/{seq}/9.multiwalker/{run}` | `solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/3` | group `hmr+fast+6`, column `o111`, seq `aaaaaaaa`, run `c` |
  | same | `…/aaaaaaaa/7.awh` | no match |
  | same | `solutions/hmr+fast+6r1/HA/WRWYCR/9.multiwalker/8` | group **`hmr+fast+6r1`**, run `h`: a repeat is a new row group, not more runs |
  | `{method}/{column}/{seq}/{*}/{run}` (the README's example) | `…/aaaaaaaa/7.awh` | **wrong:** group `solutions`, column `hmr+fast+6`, seq `o111`, and a conflict "run: 7.awh" |
- **File names** (`parseName`, default pattern `{method}_{column}_{seq}_t{time}.xvg`). **Probed:** the notebook's PMF names, `hmr+fast+6_o111_aaaaaaaa_awh_t2e+06.xvg`, parse with seq **`aaaaaaaa_awh`**, a wrong row; gmx's own `awh_t200000.xvg` and `7_t2e+06.xvg` don't match at all.
- **Attaching from *Untracked files*** (`attachData` in `matrix/src/App.tsx`) passes no folder path, so `planBatch` reads the folder pattern from the file's GROMACS header (`# Working dir:`) instead (F6). A PMF reaches the right cell only if `gmx awh` ran with its working folder inside the system's folder, or its name matches the name pattern.
- **`_inbox`** has no code in the Matrix: anything inside a project folder that no record names is *untracked*; attaching **moves** it out of `_inbox`. A folder named `<slug>--<id>` directly inside a project folder is read as a column.
- **Temperature** is never read from a file: it comes from the upload form or a `{temp}` token. Each run is corrected at its own temperature (`run.temp || DEFAULT_TEMP`, 310.15).
- **The PMF correction** (`correctCurve`, `src/lib/pmf.ts`): + 2kT·ln r with kB = 0.008314463, then **the mean of the last 10 % of points** set to zero; `wellArea` sums segments whose midpoint is below zero. My notebook sets **the last point** to zero (before and after the correction) and integrates `min(PMF, 0)`. **Probed** on one synthetic profile (0.3–3.0 nm): notebook min −12.52, area −5.88 kJ·nm/mol; Matrix min −12.38, area −5.56. The Matrix's comment says it "matches the analysis script"; it no longer matches this notebook (question 15).
- **`.matrix/`** belongs to the Matrix: gmx-cypher never writes there. A vault with a newer schema opens read-only (`SCHEMA_VERSION = 4`).

---

## 5. The mock-up and the notebook

### 5.1 The mock-up

I'll give you the mock-up as `symbuilder-mockup.zip`: ten boards (`*.dc.html`) and `canvas.json`. Put them in `docs/mockups/symbuilder/`. They are HTML with Morpheus web components and a small script per board; read the markup for layout and the script for behaviour. My proposal for where each goes (question 4):

| Board | What it shows | Where it goes |
|---|---|---|
| Build | the stack of tiles in stages, the palette, a tile's inspector (options, command, mdp, files, runs on) | symbuilder · build (R3) |
| Run | systems (method × saccharide × sequence), names, repeats, stages to run, failures, the preview, where heavy steps run | symbuilder · systems (R3, R6) |
| Dashboard | running now (progress bars), pull report, walker report | symbuilder · progress (R5, R9); a line on home (R2) |
| Summary | build summary, termini, PMF numbers | symbuilder · summary (R9) |
| Files | files per saccharide and sequence, PyMOL or a file | symbuilder · files (R4) |
| MDP | inputs/ files, library templates, per-method assignment | symbuilder · mdp (R4) |
| Cluster scripts | qq profiles, script preview, submit or print | cluster tab (R7) |
| Library | python scripts as tiles | backlog (question 7) |
| Warnings | grompp warnings, ignored or open | the status component and the build record's problems (question 4) |
| Settings | project folders, force field, python, methods, charges, errors and waiting | the settings dialog and SymBuilder's defaults (question 3) |

### 5.2 The notebook, function by function

| Notebook | What it does | Request |
|---|---|---|
| `build_peptide` | `cmd.fab(SEQUENCE)`, attach an O to the last C and rename it OXT, `h_add`, `sort`, save `{seq}.pdb`, ray a 800×600 PNG to `visualization/` | R3, R5 |
| `sol_creation` | `trjconv -center -box 1 1 1` (stdin `0 0`) for both molecules; `editconf -translate 0 1.5 0 -princ` for the saccharide; `pdb2gmx` inside `ff/` with stdin `1 8 0 0`, `-ignh -ter -i`; copy `[ moleculetype ]` to `ff/{seq}.itp`; `-princ` on `pre.gro`; merge (saccharide first, 7.0 nm box) into `01.conf.gro`; write the topology; `solvate -cs` → `2.solvated.gro`; SOL → TIP3F for fast methods; pre-salt `grompp` → `3.pre_salted.tpr`; ions → `genion -np -nn` → `3.salted.gro`; HMR; glucose | R3, R5 |
| `neutralizing_counts`, `parse_net_charge`, `count_water` | salt pairs = round(0.15 × waters ÷ 55.5); ions of ±0.75 e; the residual | R3 |
| `write_topology`, `run_gromologist` | the include list; gromologist with `POSRES_FC_BB 400`, `POSRES_FC_SC 40`, `DIHRES_FC 4.0`, split into `Protein.itp` and `CARB.itp` copied to `ff/{method}/…`; TIP3PF_orig → TIP3PF_HMR | R3, R5 |
| `minimization`, `eq_nvt`, `eq_npt` | `grompp` + local `mdrun` with a progress bar; wait for the `.gro` (every 10 s, up to 10 min); potential energy to `visualization/` | R5 |
| `awh`, `pull` | `make_ndx` + a `[ CARB ]` group of atoms 1…n; `awh_hmr.mdp` for hmr methods; `grompp`; write the qq script; **print** the submit command | R5, R7 |
| `multiwalker`, `retry_failed_walkers` | nearest pull frame to each of 0.4 … 3.0 nm (warn beyond 0.10 nm), `trjconv -dump -pbc whole`, `grompp hmr_multi.mdp`; keep going past a failed walker; rebuild it from the nearest working walker | R5, R6 |
| `render_qq_script`, `write_script`, `write_pull_script`, `write_multidir_script` | qq headers, module lines, GPU mdrun flags, resubmit until the `.gro` exists; LUMI `-multidir` | R7 |
| `run_system`, `quarantine`, `retry_failed`, `check_fatal`, `require`, `STRICT`, `gro_file_check` | failure handling, moving a failed system to `failed/`, resume or rebuild | R6 |
| `build_summary`, `gmx_charge`, `pull_report`, `walker_report`, `check_termini` | the reports | R9 |
| `read_awh_file` … `process_file` | gmx awh, the entropy correction, area under zero, the `.dat` | R8, R9 (numbers only) |

Things in the notebook to **not** copy, each verified in it: `write_script()` puts the `7.awh` mdrun line into the min, NVT and NPT scripts; `is_hmr = True` inside `sol_creation` sets a local name; glucose writes `AGLC 254` instead of the count inserted; `read_awh_file` has a stray `5 B` after `for line in f:` (a syntax error); `retry_failed()` is marked "DOESNT WORK!!!" where it is called; the pull hint's pattern (`0\.5 times half the box|pbcatom`) misses the real AWH error in the notebook's own output ("larger than 0.49 times the box size").

### 5.3 Real output I have, and samples to ask me for

The notebook's saved outputs are real GROMACS 2025.4 (PLUMED build) text: `pdb2gmx`'s force-field menu ("1: CHARMM all-atom force field" from the current folder), its water menu ("8: None") and termini menus (0 NH3+, 0 COO-); `genion` ("Will try to add 30 NA_s ions and 30 CL_2s ions"); `grompp`'s notes and a real fatal error; the build summary, pull report, walker report and termini table. Use them for the fakes, **with my paths and user name replaced** (they contain my cluster storage path, with my user name, and `/cvmfs/…`). Ask me for:
- a listing (names only) of `ff/`, `inputs/` and `molecules/saccharides/`, and one finished system folder (`find solutions/hmr+fast+6/<sacch>/<seq> -maxdepth 2`);
- the files of one small system (the `.gro`s, `{seq}.top`, `{carb}-ADD.itp`), for golden tests;
- `gmx awh` output names for `-o 7.awh.xvg` (the notebook copies `7_t2e+06.xvg`, which suggests gmx cuts the name at the first dot: unverified);
- real `mdrun -v` progress lines, `make_ndx`'s prompt, `insert-molecules` output;
- PyMOL and gromologist versions, and `python -c "import pymol, gromologist"`;
- `qq submit` output, only if question 6 says submit.

---

## 6. Roadmap

Copy this into `cypher/docs/roadmap.md`, and keep it current.

**Why this order:**
- **The shell comes first:** small, and every later screen lives in it.
- **The plan comes before anything runs.** Every command is computed and tested against the notebook before a single file is written.
- **The Matrix's names come before the first build,** so the first folders a build writes already land in the right rows, columns and runs.
- **Running comes after the decisions about programs and writes** (questions 5–11), and the cluster after running here.
- **PMFs into the vault and the reports come last,** when real systems exist to test them on.

### Phase 0: Plan and design
- [ ] Baseline recorded; sections 3 and 4 confirmed or corrected
- [ ] The notebook-to-request table; the board-to-place map; design pass with screenshots
- [ ] Phase 0 report for R1–R10; samples asked for
- [ ] Questions answered; decisions recorded; order and cut confirmed

### Phase 1: The shell (R1, R2)
- [ ] R1a Contract amended for the new words (question 1, 2)
- [ ] R1b Four tabs, routes, every old address
- [ ] R2 home

### Phase 2: The plan, with nothing run (R3, R4)
- [ ] R3a The build model, saved build plans (frozen format fixture first)
- [ ] R3b The planners: every step's argv, stdin and files, golden against the notebook
- [ ] R3c Build and systems views; the preview
- [ ] R4 Files, mdp files, force field check, settings

### Phase 3: The Matrix's names (R8a, R8b)
- [ ] R8a Systems from a project
- [ ] R8b Folders and names the project reads, checked with the Matrix's code

### Phase 4: Building here (R5, R6)
- [ ] R5a Folders and the writing rule; the build record
- [ ] R5b The steps, with fake tools from real output
- [ ] R5c Progress, waiting for outputs, cancel
- [ ] R6 Failures, retries, repeats, resume

### Phase 5: The cluster (R7)
- [ ] R7a qq scripts and profiles
- [ ] R7b The cluster tab: scripts, and SymBuilder's systems among the jobs

### Phase 6: Results (R8c–R8e, R9, R10)
- [ ] R8c PMFs into the vault; R8d PMF numbers with the Matrix's code
- [ ] R9 Reports
- [ ] R10 From a built system to analysis

### Phase 7: Finish
- [ ] README, contract, fresh-context review, report

### Backlog (add to it, don't do it)
- Job submission and killing jobs (unless question 6 says otherwise).
- Python scripts as tiles (the mock-up's library board), unless question 7 says otherwise.
- The notebook's plots; the production tile (the notebook has none).
- Requests for the Matrix and for Morpheus (section 23).

---

## 7. Decisions to put to me in Phase 0

Each needs options and your recommendation in the report. The recommendations below are mine; change them if the code says otherwise.

1. **The word *analysis*.** The contract keeps it for the Matrix's type of a curve set and forbids it for a tab. I want a tab called *analysis*. *Recommendation: amend the contract: the tab is **analysis**; the step stays **command**; the Matrix's sense stays in charts and sends.*
2. **SymBuilder's words.** Proposed: **system** (one method × saccharide × sequence, and its folder), **build** (making systems; verb and noun), **stage** (the notebook's processes: solution builder, minimisation, nvt, npt, awh, pull, multiwalker), **step** (one tile's work), **build plan** (a saved stack; not *recipe*, which is an analysis recipe), **build record** (not *record*, which is a job's `.run.json`), **repeat** (a method with `r`; not *run*, which is the Matrix's slot). Approve a before → after table of every mock-up string that changes, including the 21 the contract refuses.
3. **Settings.** What goes in the settings dialog (python path, the project's base folder, the GROMACS version, maxwarn, strict mode, waiting) and what belongs to a build plan (force field, methods, charges, ion names, walker distances). *Recommendation: machine things in the dialog, science in the build plan, so a plan carries everything that changes a number.*
4. **Where the boards go,** section 5.1, and SymBuilder's second-level views. *Recommendation: as in 5.1; the warnings board becomes the status component plus the build record's problems; no separate warnings view.*
5. **Programs and writes** (section 1.3): the gmx tools that build, python with shipped PyMOL and gromologist scripts, new system trees inside the allowed folders, scripts, and files a build replaces in its own folders. Each changes a guarantee in the README's *Safety* section, which this batch then rewrites. *Recommendation: allow them, each from a fixed list, with the rule "a build may replace only what it wrote itself, in a system folder it created; nothing else is changed, moved or deleted", recorded per file.*
6. **`qq submit`.** *Recommendation: no. Write the script, keep it if it exists, and print the command, as the notebook does; submission stays in the backlog.*
7. **Python scripts as tiles** (the library board). They run my code with my rights. *Recommendation: backlog.*
8. **The build record:** its name, format and place (I suggest `<system>/build.json`, `format: "gmx-cypher build"`, version 1, written at the start and completed atomically like the run record), and how a reader treats a newer version. The frozen fixture is made from the first commit that writes one.
9. **Saved build plans:** where (I suggest `~/.gmx-cypher/builds/<name>.json`, beside `recipes/`), exported and imported as JSON like recipes.
10. **Running here:** how many systems build at once; whether `mdrun` gets `-ntomp`, `-nb gpu`; and `gmx_mpi` without `mpirun` (decision T4 says it may fail). *Recommendation: one system at a time by default, a setting for more; mdrun flags in the build plan.*
11. **Files the notebook overwrites or deletes:** `{carb}.gro` centred onto itself, `pre_princ.gro` renamed over `pre.gro`, glucose written into `3.salted.gro`, the topology rewritten, `_charge_check.*` deleted, `build_summary_latest.log` replaced. *Recommendation: question 5's rule for the first four; a temporary folder for the charge check; dated summaries only.*
12. **Which PMF goes to the Matrix for each system:** `7.awh`'s (one walker), or every walker of `9.multiwalker` as runs 1–8. With a shared bias the walkers' PMFs are most likely the same curve (unverified); ask me which file my existing vault holds.
13. **File names in the vault.** The notebook's `{method}_{carb}_{seq}_awh_t2e+06.xvg` lands in the wrong row with the default name pattern (section 4). *Recommendation: name sent files by the connected project's pattern, and check every name with `parseName` before sending.*
14. **Temperature.** The Matrix doesn't read it from a file. *Recommendation: show it at the send and put it in the Matrix requests (a `{temp}` in the name, or read from the record copy); don't change `matrix/`.*
15. **PMF numbers.** The Matrix's correction (tail = mean of the last 10 %) or the notebook's (last point = 0)? They differ (section 4). *Recommendation: the Matrix's, by import, so both apps agree; say so on the summary.*
16. **Repeats in the Matrix.** `hmr+fast+6r1` becomes its own row group (section 4). Is that what I want, or should repeats be more runs of the same row? *Recommendation: keep row groups, as my vault already has `hmr+fast+6r`; confirm with me.*
17. **`matrix/` stays read-only** in this batch. *Recommendation: yes; requests go to the report.*
18. **home:** what it shows (section 10), and whether it may read `qq` itself. *Recommendation: no `qq` reads from home; it shows the cluster tab's last read, if any.*
19. **The notebook in the repository:** committed under `docs/symbuilder/` with outputs cleared and my paths replaced, or kept outside. *Recommendation: outside; quote what you need in the Phase 0 report.*
20. **The mock-up's library templates for mdp files** (minim-steep, eq-nvt …): show them as read-only templates, or leave them out. *Recommendation: show; copying one into `inputs/` is a new file with a free name.*
21. **Size and split.** *Recommendation: two batches. Batch 4: Phases 1–3 (the shell, the plan with nothing run, the Matrix's names). Batch 5: Phases 4–6 (building, the cluster, results).*

---

## 8. Files you will mostly work with

| Area | Files |
|---|---|
| Shell | `cypher/src/App.tsx`, `cypher/src/lib/route.ts`, `cypher/src/ui/tabs.tsx`, `cypher/src/views/Settings.tsx` |
| Contract | `cypher/docs/design-contract.md`, `cypher/src/core/contract.ts`, `cypher/test/contract.test.ts`, `cypher/test/ui-strings.ts` |
| Server | `cypher/server/api.ts`, `jobs.ts`, `runs.ts`, `files.ts`, `gmx.ts`, `state.ts`, `cluster.ts`, `vault.ts`, `send.ts`, `batch.ts`, `awh.ts`, `main.ts` |
| Libraries | `cypher/src/lib/commands.ts`, `record.ts`, `inputs.ts`, `names.ts`, `batch.ts`, `cluster.ts`, `awh.ts` |
| Views | `cypher/src/views/*.tsx` (`Cluster.tsx`, `Setup.tsx`, `Jobs.tsx`, `Result.tsx`) |
| Tests | `cypher/test/route.test.ts`, `jobs.test.ts`, `runs.test.ts`, `record.test.ts`, `formats.test.ts`, `cluster*.test.ts`, `fake-gmx.mjs`, `fake-qq.mjs`, `cypher/e2e/*.spec.ts` |
| The Matrix (read-only) | `matrix/src/lib/seq.ts` (`parsePath`, `parseName`, `planBatch`, `seqKey`), `matrix/src/lib/pmf.ts`, `matrix/src/lib/storage/path.ts`, `matrix/src/lib/types.ts`, `matrix/src/App.tsx` (`attachData`) |
| Reference | `cypher/docs/mockups/symbuilder/*.dc.html`, the notebook |

---

## 9. R1: Four tabs

### Today (verified)
- See section 3: three tabs, compare under results, settings in a dialog, the routes and `OLD`.
- **Verified:** adding a view touches `Route`, `parseRoute`, `formatRoute` (whose last line is a catch-all `#cluster`), the `onValueChange` fallback in `App.tsx`, and `test/route.test.ts`.

### Requirements
- **Tabs, in this order:** home · symbuilder · analysis · cluster. *analysis* holds set-up, results and compare as they are today, as its own second level.
- **Addresses.** Every address that works today still opens the same view: `#setup/<step>[?mode=batch]`, `#results[/<job>][?filter]`, `#compare?jobs=…[&diff=1]`, `#cluster`, and the old ones in `OLD`. New: `#home` and `#symbuilder/<view>` (ids checked against a fixed list, never paths). An unknown address goes to `#home` (today it goes to `#setup/inputs`; say if you disagree).
- Each tab opens where it was left (`kept`, as today); the header keeps the running count, now counting builds too.
- Keys that work anywhere still do (**D**, **E**, **?**). New keys, if any, go through the key registry and the `?` sheet.
- The contract is amended first (questions 1 and 2), then the strings.

### Tests
- `test/route.test.ts`: every address above round-trips; every old one redirects as today; a bad `#symbuilder/<id>` is dropped.
- The contract scanner passes with the new words.
- Playwright: smoke goes through all four tabs.

### Manual checks
- Light and dark, 1280 and 1024 px; the keyboard reaches every tab; reload keeps the view.

---

## 10. R2: home

### Requirements
- A simple dashboard, built only from what the server already knows: gmx's status; the vault and the connected project; analysis jobs running and the last few finished; SymBuilder's systems by state (once R5 exists; until then an empty state that invites a first build); the cluster tab's last read, if one exists (question 18).
- Every item links to its place. No new charts, no new polling.
- Keep it to one component; I'll redesign it.

### Tests
- Server-rendered (`renderToStaticMarkup`) for an empty state and a busy one.

---

## 11. R3: The build stack and its plan

### Today (verified)
- Nothing builds. The closest pieces: batch mode's path templates and preview (`src/lib/batch.ts`, `server/batch.ts`), recipes (`server/recipes.ts`), and stdin answers for gmx (`JobSpec.stdin`).

### R3a The model
- A **build plan**: the stages (section 5.2) with their tiles in order, each tile on or off, each stage in the run or skipped (the notebook's `processes`); per tile its options; per system the method, saccharide and sequence.
- **Systems:** methods × saccharides × sequences, typed or taken from the project (R8a). Sequences keep my spelling in folder names (`aaaaaaaa`) and are upper-cased for PyMOL.
- **Methods switch things on by name,** as in the notebook: `hmr` → hydrogen mass repartitioning by gromologist; `fast` → TIP3PF water (SOL renamed TIP3F around solvate and genion); `awh_hmr.mdp` for hmr methods. Show what each method switches on.
- **Repeats:** an `r` after the method's trailing number, then `r1`, `r2` … (`hmr+fast+6` → `hmr+fast+6r` → `hmr+fast+6r1`); each repeat is a new folder tree. Pure function, table-tested.
- **Names:** the notebook's (`01.conf.gro`, `2.solvated.gro`, `3.pre_salted.tpr`, `3.salted.gro`, `4.minim/`, `5.eqnvt/`, `6.eqnpt/`, `7.awh/`, `8.pull/`, `9.multiwalker/1…N/`), so my existing folders are recognised.
- A saved build plan is a versioned JSON file (question 9). The frozen fixture comes before the first change to its format.

### R3b The planners
- One pure function per tile type gives its argv, stdin answers, files read, files written and files replaced (question 5). Tiles: build sequence (PyMOL), saccharide, trjconv, editconf, pdb2gmx, termini check, merge, write topology, add water, add salt, hmr, add glucose (off by default, like `add_glucose = False`), minimise, nvt, npt, charge check, awh, pull, multiwalker windows.
- Science, each with the notebook's values as defaults: ion charge 0.75, salt 0.15 mol/l, water 55.5 mol/l, ions `NA_s` and `CL_2s`, saccharide shift `0 1.5 0`, box 7.0 nm, walker distances `0.4 0.6 0.8 1.0 1.5 2.0 2.5 3.0`, maxwarn 6.
- The merge: saccharide atoms first, then the peptide, renumbered (the `[ CARB ]` group of atoms 1…n depends on it).
- The topology text: the notebook's include list, with the water include by method.

### R3c The views
- **build:** the palette, the stack grouped by stage (fold, skip), a tile's inspector with its exact command for the first system and the files it reads and writes. Drag and drop, with ↑ ↓ and keyboard equivalents.
- **systems:** the grid of systems, names, repeats, and a preview of every system's plan and problems, like batch mode's: **nothing runs until I press build.**

### Tests
- Golden plans: for the notebook's example system, each tile's argv and stdin equal the notebook's (a table: notebook line → expected argv), except approved differences.
- Ion counts: net −3.75 e with 10 412 waters → 28 salt pairs, `-np 33 -nn 28`, residual 0; and the notebook's saved output case "30 NA_s and 30 CL_2s".
- Repeat names, folder names, method switches, merge order and numbering on a small real `.gro` pair (sample), the `[ CARB ]` group, the topology text.
- Build plan format: frozen fixture read; a newer version refused in words.

### Manual checks
- The stack, the inspector and the preview against the mock-up's build and systems boards, light and dark, 1024 px.

---

## 12. R4: What a build reads

### Today (verified)
- The file browser hides `.top`, `.itp`, `.mdp`, `.py` and `.sh`; uploads refuse them (section 3).

### Requirements
- **Files per saccharide and sequence** (the files board): a saccharide's `.gro` (default `molecules/saccharides/{carb}.gro`) and `.itp` (`ff/{carb}-ADD.itp`), optional others; a sequence is built with PyMOL unless a structure is given. Tokens such as `{saccharide.gro}` in tile options. A system missing a file is named in the preview before anything runs.
- **mdp files** (the mdp board): my `inputs/` files (`minim`, `eq_nvt`, `eq_npt`, `awh`, `awh_hmr`, `pull`, `hmr_multi`) used as they are; one per step and method; `awh_hmr.mdp` for methods with hmr. Library templates as in question 20.
- **The force field:** check `ff/charmm36s-jul2022-prosECCo75.ff` (forcefield.itp and the files pdb2gmx needs) and the other includes (`ADDff.itp`, `ions/iontypes.itp`, `ions/ions.itp`, `TIP3PF/TIP3PF_orig.itp`, `TIP3PF/TIP3PF_HMR.itp`).
- **Settings** as decided in question 3. A new program path (python) is validated like `qq` in `POST /api/config`, and added to `SETTABLE`.
- SymBuilder's pickers may list these kinds; analysis's input browser stays as it is.

### Tests
- Listing and picking the new kinds only through SymBuilder's endpoints; settings validation; a missing file named in the preview.

---

## 13. R5: Building on this machine

### Today (verified)
- See section 3: jobs run only gmx analyses; `capture()` times out at 60 s; `inside()` refuses paths that don't exist; `GMX_MAXBACKUP=99`.

### R5a Folders, the writing rule, the build record
- A system's folder is created exclusively by the build that makes it; one that exists is handled by question 5's rule and R6 (continue, skip or repeat).
- Every file a step writes, and every file it replaces, is in the build record with its size and SHA-256 (question 8). Nothing outside the system folder, the project's `scripts/` and `logs/`, and gmx-cypher's state folder is written.

### R5b The steps
- Each step runs through `Jobs`, without a shell, with its stdin answers. PyMOL and gromologist run as python scripts shipped in `cypher/`, with arguments from the plan; their output is logged like gmx's.
- `pdb2gmx` runs inside `ff/` as in the notebook (or decide a safer equivalent in Phase 0 and record it); its `[ moleculetype ]` copy lands in `ff/{seq}.itp` under a free name rule (question 5).
- GROMACS's fatal blocks ("Fatal error:", "Error in user input:") stop the system, quoting the ERROR block above them, whatever the exit code; a missing output stops it too (`check_fatal`, `require`).

### R5c Progress, waiting, cancel
- A local `mdrun` shows one progress bar (step, total, time left) from its `-v` lines, not a line per 100 steps; WARNING and NOTE blocks stand out.
- After a local `mdrun`, wait for its `.gro`: every 10 s, up to 10 min (settings).
- *cancel* stops a system's process group, as for jobs. SIGHUP keeps builds running, as it keeps jobs.

### Tests
- Fake tools (`pdb2gmx`, `solvate`, `genion`, `grompp`, `mdrun`, `make_ndx`, `insert-molecules`, python for PyMOL and gromologist) answering with real text from section 5.3, never invented.
- One system built end to end with the fakes: the folder tree has exactly the notebook's names; nothing was written elsewhere; nothing that existed before was changed (a before/after listing with SHA-256).
- A fatal error from the real output stops the system with that text.

### Manual checks
- **not run** unless you have a real gmx, PyMOL and gromologist: one system of mine, end to end. List it for me.

---

## 14. R6: Failures, retries, repeats and resume

### Requirements
- **A failed system** is marked with its stage and the error ("NPT: … ERROR 1 [file eq_npt.mdp] …"); the others go on, or the whole build stops (a choice).
- **Retry:** resume at the failed stage in the same folder, or rebuild: the old folder is **moved** to `{method}/{carb}/failed/{seq}_<stamp>/` with a `FAILED.txt`, never deleted; a number of attempts; the old entry becomes *retried*.
- **Hints:** a pull or AWH grompp that fails on the box gets the hint (`pull-pbc-ref-prev-step-com = yes`, a `pbcatom`, or a bigger box). Match the real text in section 5.3 ("larger than 0.49 times the box size"), which the notebook's pattern misses.
- **Walkers:** a walker without a `.tpr` is moved to `9.multiwalker/failed/` and rebuilt from the `start.gro` of the nearest working walker by distance.
- **An existing folder:** continue at the first step whose output is missing, skip, or repeat into a new method folder (R3a).
- **Stages:** run only some stages (the notebook's `processes`); a skipped stage's outputs are read from disk.
- **Strict mode:** off (look at the output, like `!cmd`) or on (any non-zero exit stops the system).

### Tests
- Retry plans (resume and rebuild) as a table; quarantine names; the nearest-walker choice; the hint on real text; continue/skip/repeat on a fake existing tree.

---

## 15. R7: The cluster

### Today (verified)
- The cluster tab reads `qq jobs -e`, `qq jobs -a` and `gmx-eta -a`, never submits (section 3); it already offers analysis for a job that ended (R10's model).

### R7a qq scripts and profiles
- Scripts as the notebook writes them (`render_qq_script`): `#!/usr/bin/env -S qq run`, `# qq job-type`, `# qq props`, `ncpus`, `ngpus`, `mem`, `walltime`, `loop-end`; module lines; mdrun with `-deffnm`, `-cpi`, `-px`/`-pf` where they apply, `-maxh`; resubmit until the step's `.gro` exists (every walker's, for multiwalker).
- Profiles: MetaCentrum with GROMACS 2025.4 cuda (`gmx_mpi`, GPU flags), MetaCentrum with 2022.3 plumed (`gmx`), LUMI multidir (ncpus and ngpus per walker, 60gb). Each step uses a profile.
- Written to `scripts/{stage}/{method}_{stage}_{seq}.sh`, created exclusively; one that exists is kept and shown; copied into the step folder.
- **Submission:** as question 6 decides. By default the command is printed, in the log and on the system.

### R7b The cluster tab
- Profiles and a script preview (the mock-up's cluster scripts board), beside today's jobs list.
- A cluster job whose input folder is a system's step folder is shown as that system's; when it ends, the system can go on (the pull's `pullx.xvg` → multiwalker), only after I press a button.

### Tests
- Script text: golden against the notebook's for awh, pull and multiwalker; min, nvt and npt get their own `-deffnm` (not the notebook's 7.awh line).
- Profile table; the job-to-system match on real `qq jobs -e` text from the existing fixtures.

---

## 16. R8: SymBuilder and the Matrix

### Today (verified)
- Section 4, and `projectSummary` (section 3).

### R8a Systems from a project
- With a connected project, the methods, saccharides and sequences can be taken from it: row groups, column labels, rows' sequences. *build what the project lacks*: the cells without runs.

### R8b Folders and names the project reads
- Before a build, every system folder (and every walker folder) is checked against the project's folder pattern with the Matrix's `parsePath`, and every name a send would use against its name pattern with `parseName`. A folder or name that would land in another row, column or run is a problem in the preview, said in words (for example the README's `{*}` pattern and `7.awh`).

### R8c PMFs into the vault
- An AWH batch over built systems (today refused: section 3): `gmx awh` on the file question 12 chooses, the last frame typed PMF in kJ/mol, sent to `_inbox` by the existing send, named by the project's pattern (question 13), with `gmx awh` run where its `# Working dir:` header carries the system's path.
- The send says the temperature (question 14) and what to do in the Matrix (*Check folder now*, then *attach*), as today.

### R8d PMF numbers
- SymBuilder's summary computes min, its position and the area with the Matrix's `correctCurve`, `wellArea` and `runStats` (question 15), and says which.

### R8e The vault stays the Matrix's
- Nothing is written in `.matrix/` or in a project folder beyond `_inbox/`; `matrix/` is unchanged.

### Tests
- With the Matrix's own code: the probes of section 4 as a table (good and bad patterns, names), and a send's landing preview (`planBatch`) for a built system's PMF: the right row, column and run.
- The existing "vault untouched" test extended to SymBuilder's sends.

---

## 17. R9: SymBuilder's reports

### Requirements
- **Build summary** (the notebook's `build_summary`): per system the charge before salt, the ions, the shortest pull distance, time, status (OK, failed, skipped, retried), warnings per stage (`SB 7 MIN 4 NVT 4 …`), the note; the GROMACS version; written to `logs/build_summary_<date>.log` (question 11).
- **Charge** after NPT (`gmx_charge`: grompp on `6.eqnpt.gro`, scratch files in a temporary folder), **pull report** (min and max of `8.pull/pullx.xvg`), **walker report** (x has output, o tpr ready, - missing).
- **Termini** (`check_termini`): N- and C-terminus per system from the Protein moleculetype, q1, qN, qTOT; a peptide charge that isn't a whole number of 0.75 e is flagged. The notebook flags `PRO-NH2+` as a mismatch (its saved output); expect it for a proline start.
- **PMF numbers** (R8d), without plots.
- Live progress (R5c) and these reports make up SymBuilder's progress and summary views.

### Tests
- Parsers on real text (section 5.3): pullx.xvg, a `.top`, the termini table; report rows as tables; the summary text against the notebook's saved one.

---

## 18. R10: From a built system to analysis

### Requirements
- From one system or many: open analysis's set-up in batch mode with the root and a path template filled in (for example `{method}/{column}/{seq}/9.multiwalker/{run}/9.multiwalker.xtc`), through the same path as the cluster tab's offer (`offerBatch`). Nothing runs until I press *run*.

### Tests
- The offer's route and preset; the template matches the built tree (`matchTrajectory`).

---

## 19. Testing (all requests)

- **Vitest, in Node.** Pure functions with table-driven tests; components with `renderToStaticMarkup`.
- **Golden against the notebook** (R3b, R7a, R9): the notebook's commands and texts are the reference.
- **Contract tests with the Matrix's own code** (R8): patterns, names, landing, the vault untouched.
- **Real text only.** Fakes answer with real output (section 5.3); never invent a format. A test that needs output you don't have waits for my sample.
- **Frozen formats:** build plans and build records, each with a fixture made by unchanged code before its first change, read first in the tests.
- **Playwright:** the four tabs, SymBuilder's build and systems views with the fakes, the cluster tab with scripts.
- **Real-tool tests** run when `GMX` (and a python with PyMOL and gromologist) is set, and are listed as run or not run.
- **The `matrix/` check** runs in every `npm test`.

---

## 20. Documentation

`cypher/README.md`: the four tabs; SymBuilder (what it builds, where it writes, what it starts, what it never does); the rewritten *Safety* section; the cluster scripts; the Matrix hand-over for PMFs; where files go (the table gains SymBuilder's rows). The contract and `roadmap.md` as above.

---

## 21. Acceptance criteria

- **A. One app.** Four tabs; home as decided; every old address works; the contract is amended and its scanner passes; no mock-up string that breaks it.
- **B. The plan.** Every step's command for every system is shown before anything runs, and matches the notebook (golden tests), with the approved differences recorded; a system missing a file or an mdp is named in the preview.
- **C. Building.** One system builds end to end with the fakes into the notebook's folder names; nothing outside the system's folder and the agreed places is written; nothing that existed before is changed, moved or deleted; failures, retries and walkers behave as in R6.
- **D. The cluster.** Scripts match the notebook's, are never overwritten, and submission is as decided.
- **E. The Matrix and analysis.** Systems from a project; folders and names checked with the Matrix's code; a built system's PMF lands in the right row, column and run (landing preview); the same numbers in SymBuilder and the Matrix; `matrix/` unchanged; a built system opens in analysis's batch set-up.
- **F. Quality.** Lint, build, Vitest and Playwright pass; no console errors; light and dark at 1024 px; lines and tests reported for each item.

---

## 22. Commits

- One commit per roadmap item (R1a, R1b, …), its ID first, for example `R3b: plan every step of a build, golden against the notebook`. Plus one each for the Phase 0 documents and the final report.
- Every commit passes lint, build and tests on its own (check the commit, not the working tree), and leaves `matrix/` unchanged.
- Stage files by name. Never commit my data, the notebook or its outputs, cluster samples with personal details (ask first), generated files or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 23. Final report: `cypher/docs/batch-4-report.md`

1. **Summary table:** item → status → commit → code lines added/removed → test lines → tests passing → decisions.
2. **Per request:** what changed and why, before and after, known limitations.
3. **Sections 3 and 4, completed:** every claim confirmed or corrected.
4. **The notebook table** (Phase 0, step 3), final: every function done, changed (and why), or left out.
5. **The contract's changes** and the words table.
6. **Screenshots** (small PNGs in `cypher/docs/img/batch-4/`), light and dark: the tabs, home, build, systems, progress, summary, files, mdp, the cluster tab with a script.
7. **Tests:** counts before and after; which ran with real tools; the manual checks, each passed, failed or not run.
8. **Writes and programs:** every place gmx-cypher now writes and every program it now starts, matching the README.
9. **For the Matrix:** requests (temperature, the correction's reference point, any pattern help), each with its reason.
10. **For Morpheus:** proposed components.
11. **Review:** what a fresh-context review found and what was done.
12. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline, showing `matrix/` unchanged.
