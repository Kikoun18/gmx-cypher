# Batch 4 — Phase 0 report

The plan for [`batch-4.md`](batch-4.md): the baseline, the spec checked against the code, the notebook and the mock-up side by side, the design pass, a plan for each request, the samples I need, size and order, and **one numbered list of questions (§9)**. Nothing in `src/`, `server/`, `test/` or `e2e/` changed. This commit adds this report, the spec, the roadmap's Batch 4 section, the mock-up in [`mockups/symbuilder/`](mockups/symbuilder/), and in [`img/batch-4/`](img/batch-4/) 36 screenshots of the planned screens and renders of the mock-up's ten boards.

**Branch.** `cypher-batch-4`, made from gmx-cypher's default branch `claude/quirky-cray-q845sa` at **`6de6a96`** ("Pin check and README for the-matrix layout"), which is the commit the-matrix pins. the-matrix is at **`7ae82be`** ("Pin Tank at main: batch 2 and the Mac fix"). Nothing is pushed.

**Sources read.** The code of both apps; the mock-up (`symbuilder-mockup.zip`, 10 boards); two notebooks: `solution_builder_seq_5_4.ipynb` (the one the spec names, saved outputs from a 42-system build on 2026-09-25) and `solution_builder_seq_5.ipynb` (an older version, with `qq submit` cells and their output). Both notebooks stay outside the repository (question 19). Quotes from them below have the storage path written `<base>` and the user name removed.

**Status:** waiting for your answers. Phase 1 does not start before them.

---

## 1. Baseline

Measured here on 2026-11-04: Node 22.23.4, npm 10.9.9, `npm ci` in both apps, the fake gmx.

| Check | Spec §3 | Measured | |
|---|---|---|---|
| `cypher/`: `npm run lint` | 0 warnings, 0 errors | 0 diagnostics in 242 files (oxlint 1.87.0 prints nothing when clean; `-f json` says so) | same |
| `cypher/`: `npm run build` | main 819.86 kB (258.61 gzip); 71.34; 574.10; 12.37; CSS 62.55 | identical to the byte, with the 3Dmol `eval` warning and the chunk-size warning | same |
| `cypher/`: `npm test` | 1079 passed, 1 skipped, 86 files | the pin check ran and passed ("../matrix is the Matrix at 7ae82be …, unchanged"); 1079 passed, 1 skipped; 85 files + 1 skipped | same; the pin check runs here (git history present) |
| `cypher/`: Playwright | not run; batch 3 says 14 | **12 of 14 failed** as checked out; **14 of 14 passed** with one console line ignored (below) | see below |
| `matrix/`: `npx vitest run` | 658 passed, 46 files | 658 passed, 46 files | same |
| `matrix/`: `npx oxlint` | 7 warnings | 0 errors, 7 warnings, all `only-export-components` (`Laser.tsx` 3, 30 ×2; `ui.tsx` 3, 4, 5, 35) | same |

**The Playwright failure, and why I went on.** The project pins `@playwright/test` 1.56.1; the only browser installed here is Chromium 1243, which that version would not find, so I ran the suite through a scratch config with `executablePath` set (nothing in the repository changed). All 12 failures are the same assertion: each test checks that the console has no errors, and this Chromium asks for `/favicon.ico`, which the server answers 404 because `index.html` has no icon. Every other step of every test passed. A scratch copy of the specs that ignores only console lines whose location ends in `/favicon.ico` passed 14 of 14 in 47 s. So this is the newer browser meeting a page with no icon, not a regression. I recorded it in the roadmap's backlog and propose fixing it in R1b (question 32), because every later Playwright check in this batch needs it.

---

## 2. The spec checked against the code

### 2.1 Spec §3

| Claim | Found |
|---|---|
| Three tabs, compare under results, settings a dialog | Confirmed: `App.tsx:158–161`, `:89`, `:149`. |
| "the header keeps the running count" (R1) | **Corrected.** The header has no count. The count is a `TabsCount` on the *results* tab trigger: "N running", or the number of jobs (`App.tsx:159`). It counts every job. |
| Keys D, E, ? | Confirmed (`App.tsx:100–115`). The registry is `KEYS`/`FIXED_KEYS` in `src/core/contract.ts:65–90`, read by `src/lib/shortcuts.ts`; the sheet is `src/ui/shortcut-sheet.tsx`. (`src/lib/keys.ts` holds React list keys.) |
| Routes, `OLD`, unknown → `#setup/inputs`, catch-all `#cluster` | Confirmed (`route.ts:8–43`). `OLD` (`:21`) is not exported. Results and compare also carry the jobs filter (`archive q command status batch folder from to`, `jobFilter.ts:9`). **Two traps:** `formatRoute` and the tab's `onValueChange` (`App.tsx:156`) both end in a cluster fallback without an exhaustive switch, so a new view that is forgotten in either becomes `#cluster` silently. Nothing sets `document.title`. |
| What a new view touches | Also: the `tab`/`selection` lines (`App.tsx:89–92`), a trigger and a content, `KeyWhere` (`contract.ts:66`) if it has keys, and the old-address loop in `e2e/smoke.spec.ts:185`. |
| The cluster tab polls only while open | Confirmed: Radix 1.1.22 renders content only when selected (no `forceMount`); `nextPoll` is `min(60·2^failures, 600)` s (`cluster.ts:187`); the server reuses a read for 50 s (`server/cluster.ts:60`). |
| The cluster tab can't submit | Confirmed: `QQ_JOBS = ['jobs','-e']`, `QQ_ALL = ['jobs','-a']`, `GMX_ETA = ['-a']` (`server/cluster.ts:16`), run through `capture(…, {group: true})` with 30 s and 90 s limits. README *Safety* is `README.md:294–313`. |
| The word *analysis* | Confirmed (`design-contract.md` §1). `NEVER_SHOWN` has no pattern for it, so the change is in the contract's table, not in `contract.ts`. |
| The mock-up breaks the contract in 21 places | **Corrected: 24 visible.** Run per string as `contract.test.ts` does, `NEVER_SHOWN` matches 21 strings with 22 hits: "the run" 17, "this run" 3, "a run" 1, "each job" 1 (one string on the Run board has both "the run" and "each job"). Two more strings are split by a link in the markup, so a per-node test misses them but a reader sees them: "…set on the [run board]" (Build, Settings). Full list in §4.2. |
| Jobs run only gmx analyses | Confirmed, with one correction: `recordProblems` does not refuse a command outside `COMMANDS`; it treats it as an RDF and then asks for a trajectory, a run input and RDF's groups (`record.ts:135–141`). The page (`Result.tsx:40`), `/api/landing` and `/api/send` (`api.ts:205`, `:216`) and recipes (`recipe.ts:48`) do check `COMMANDS`. The only production `jobs.start` is `runs.ts:273` with `file: ctx.gmx.path!` (`runs.ts:156`). A job's failure text comes from `gmxError` and its progress from `parseProgress`, both written for gmx analyses; the record embeds the whole log (`runs.ts:259`). |
| Folders and files the builder needs | Confirmed: `inside()` is 404 for a missing path (`files.ts:18`); `mkdirSync(outDir, {recursive: outDir.startsWith(home + '/')})` (`runs.ts:233`); the browser hides files with no role (`files.ts:35`, roles in `inputs.ts:6–9`); upload refuses them (`api.ts:258–259`); `/api/file` sends `.gro .pdb .ndx` (`api.ts:143`). Allowed folders are `config.allow` plus `<home>/uploads` (`api.ts:69`), compared after `realpath`; the vault is refused as an output folder (`runs.ts:109–110`). |
| `capture()` 60 s; concurrency file-only | 60 s confirmed (`gmx.ts:33`). **Concurrency is not file-only:** batch set-up has an "at a time" field that starts at the config value (`Batch.tsx:98`, `:145`), and the server uses `min(cpus, b.concurrency \|\| config.concurrency)` (`api.ts:236`), per batch. Single jobs are never queued, so nothing limits all jobs together. |
| `GMX_MAXBACKUP=99`; a backup of a job's own name is a problem | Confirmed (`runs.ts:65`, `:299–301`). |
| AWH batches refused | **Corrected:** `batchable` refuses every command without groups, which is energy, awh **and wham** (`commands.ts:136`, `:160`, `:183`). The words in the spec are a code comment (`api.ts:73`); the user sees "batches run recipes of commands with atom groups; … is a gmx … recipe" (`api.ts:75`). |
| `projectSummary` | Confirmed, but `pattern` and `pathPattern` sit under `settings: {pattern, pathPattern, analyses}` (`vault.ts:98–120`). 409 without a vault, 404 for an unknown project (`api.ts:175–181`). gmx-cypher imports the Matrix by relative paths (`../../matrix/…`), no alias; `server/ts-hook.mjs` adds `.ts` to the Matrix's bare imports. |
| `offerBatch(root, recipe)` | Confirmed (`App.tsx:140`); `recipe` is a recipe id. |
| Program paths validated like `qq` | **Corrected:** only `qq` and `gmxEta` get the strict check (`api.ts:337–341`: the bare name, or an absolute path matching `^[\w./+-]+$` that is an executable file). `gmx` goes to `detectGmx`, which takes a name on PATH or a path and runs `--version`; the config is saved before that check. `SETTABLE` is `gmx allow vault project pmfUrl qq gmxEta` (`api.ts:54`). |
| Components tested with `renderToStaticMarkup` | Confirmed (T179). Vitest's environment is `node` and it includes only `test/**/*.test.ts`, so component tests are `.ts` files that render `.tsx`. |
| The send | `_inbox` is `<vault>/<project.dir>/_inbox/`, created without `recursive`; names by the Matrix's `uniqueName`; copied with `COPYFILE_EXCL` (`send.ts:18–25`). The record copy is `<vault>/gmx-cypher/records/<sha256>.run.json`, written with `wx` (`space.ts`). `freeStem` (`names.ts:32`) is for job outputs only. "Vault untouched" tests: `vault-read.test.ts:31–56`, `send.test.ts:43`, `space.test.ts:117`. |
| `server/awh.ts` | `gmx awh -f <edr> -s <tpr> -o <tmp>/x.xvg`, run **in the temporary folder** (600 s). So the `# Working dir:` of anything it makes is the temporary folder, which matters for R8c. |

### 2.2 Spec §4 (probes run with the Matrix's own functions)

| Claim | Found |
|---|---|
| The model | Confirmed: `seqKey(name, seq, group)` gives `group\|name\|SEQ` (`seq.ts:775`); `DEFAULT_COLS` is `{k: 'col1', label: 'COL1'}`; slots `a`–`j` (`seq.ts:68`). **Corrections:** the code does keep two old lists, `FORMER_COLS` (o26, pg, ha: legacy stores, `pmf.ts:11–15`) and `FORMER_TAGS` (hmr, fast, prosecco75, add: the old methods, now tags, `seq.ts:22–27`); non-PMF analyses share the run slots (`types.ts:69`). |
| `parsePath` probes | All four confirmed exactly (output in the scratch probe): `…/9.multiwalker/3` → hmr+fast+6 / o111 / aaaaaaaa / c; `…/7.awh` no match; `…6r1/HA/WRWYCR/9.multiwalker/8` → group hmr+fast+6r1, run h; the README's `{*}` pattern on `…/7.awh` → group `solutions`, column `hmr+fast+6`, seq `o111`, conflict "run: 7.awh (path) is not a run number 1–10". The README example is `matrix/README.md:411` (decision F14). Run folder `10` → `j`; `11` → a conflict. `planBatch` passes the **folder** (`seq.ts:1003`); a file path does not match. |
| `parseName` probes | Confirmed: `…_aaaaaaaa_awh_t2e+06.xvg` → seq `aaaaaaaa_awh`; `awh_t200000.xvg` and `7_t2e+06.xvg` → no match. **Addition:** `{temp}` exists as a token (`TOKENS`, `seq.ts:192–196`: `{method} {column} {name} {seq} {time} {run} {temp} {analysis} {*}`), so a name can carry the temperature today (question 14). A `{temp}` that isn't a number falls back to 310.15 silently. |
| `planBatch` reads the header | **Corrected in part:** it does not pick one pattern; it applies the name pattern first, then the path pattern to the folder or, with no folder, to the header's `workdir`, and a disagreement is a conflict (`seq.ts:1002–1006`, `mergeFields` `:267–272`), and only when the form says *parse*. The header is read only if the file has GROMACS's banner line (`gmxHeader.ts:26–27`). A synthetic `awh_t2e+06.xvg` whose header says `Working dir: /x/solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/3` landed in group hmr+fast+6, column o111, run c. `attachData` is `App.tsx:581–588`. |
| `_inbox`, untracked, `<slug>--<id>` | No `_inbox` in `matrix/src`; attaching moves the file (`plan.ts:215–218`). **Corrected:** a `<slug>--<id>` folder is scanned only to relink an existing column whose folder is missing; it never creates a column (`index.ts:35–45`, `project.ts:172–178`). |
| Temperature | Confirmed for PMF runs (`seq.ts:624`, 310.15). Other analyses use the project's setting (`graph.ts:131`). |
| The correction | Confirmed (`pmf.ts:71–103`, the comment "Matches the analysis script…"). My probe (a 14 kJ/mol Gaussian well, 0.30–3.00 nm, 310.15 K) gives the same numbers both ways on a clean, flat tail; with noise the two differ by 0.28 kJ/mol in the minimum and 7 % in the area; with a drifting tail by 0.07 and 0.17. Almost all of the difference is the reference (mean of the last 10 % vs the last point); the area rule adds at most 0.003. The spec's numbers (−12.52/−5.88 vs −12.38/−5.56) come from a profile I don't have, so I couldn't repeat them; the direction and size agree. |
| A row is method + name + sequence | **Found, and it matters for R8:** a row is looked up by `seqKey(name, seq, group)` (`seq.ts:1047`), and when the pattern has no `{name}` the parsed sequence doubles as the name (`seq.ts:1035`). A folder path carries no name, so a row whose name differs from its sequence (for example "Ala8" with AAAAAAAA) would get **a new row** from a built system's PMF. Columns are matched without case (`matchCol`, `seq.ts:101`), so `o111` lands in `O111`. |

### 2.3 Each request's "Today"

| Request | Today, checked |
|---|---|
| R1 | As §2.1. `#analysis` is an old address today: it opens set-up's **command** step (`route.ts:21`). |
| R2 | Nothing. What the page already has: `/api/state` (gmx, config), `/api/vault`, `/api/vault/project?id=`, the jobs (`useJobs`). The cluster tab's read lives in `ClusterView`'s state and goes when the tab closes; the server keeps one read for 50 s only. |
| R3 | Nothing builds. Batch mode (`src/lib/batch.ts`, `server/batch.ts`) has the path template and preview pattern to copy; recipes (`server/recipes.ts`) the save/export pattern; `JobSpec.stdin` the stdin answers. |
| R4 | As §2.1 (hidden kinds). Nothing lists `.mdp`, `.top`, `.itp`. |
| R5 | `Jobs` (`server/jobs.ts:12`): `JobSpec {kind, title, file, args, cwd, env?, meta?, stdin?}`, spawned `shell: false, detached: true`; stdin piped and ended when given; cancel is SIGTERM to the group, SIGKILL after 5 s (`:240–248`); `<home>/jobs/<id>.ndjson` with created/started/out/cancel/ended. SIGHUP is logged and ignored (`main.ts:55–56`). |
| R6 | Nothing. Archive (T192) is the only place gmx-cypher moves a file (a hard link, then the old name removed). |
| R7 | As §2.1. `src/lib/cluster.ts` parses `qq jobs -e` with each job's input folder (T196), which R7b's job-to-system match can use. |
| R8 | As §2.2. |
| R9 | Nothing. |
| R10 | `offerBatch` and `BatchPreset {id, root, recipe}` (`App.tsx:140`); the preset has no template field yet. |

---

## 3. The notebook and the mock-up, side by side

### 3.1 Every notebook function → the request and the code that will do it

`L` = a pure function in `src/lib/build/` (new folder), `S` = server, `V` = view. "Golden" = a test compares it with the notebook's argument list or text.

| Notebook (seq_5_4) | Request | Where it goes | Note |
|---|---|---|---|
| variables cell (`saccharides`, `sequences`, `methods`, `processes`, `maxwarn`, `gromacs_version`, `add_glucose`, ion and walker values) | R3a, R4 | L `plan.ts` (the build plan's defaults); settings for the machine values | each default from the notebook |
| `sh`, `run_capture`, `run_live` | R5 | S: steps run through `Jobs` | no shell, as the notebook's `sh` |
| `check_fatal`, `require`, `STRICT` | R5, R6 | L `fatal.ts` (golden on the real fatal texts) | |
| `cd`, `mkdir`, `cp`, `mv`, `cat`, `ls`, `diff`, `sed_i` | R3b, R5 | the planners' cwd, reads, writes; `sed_i` becomes L `renameWater(top, from, to)` | `diff` (printing the HMR diff) left out: the build record lists both files |
| `extract_moleculetypes` | R3b | L `moleculetype(top)` | where it writes: question 23 |
| `console_message`, `colorize_gmx_notes`, `show`, `_fmt_eta` | R5c | V: the step log, WARNING/NOTE blocks marked | colours left out (terminal codes) |
| mdrun progress regexes (`_RE_TOTAL`, `_RE_PROGRESS`, …) | R5c | L `mdrunProgress(text)` | needs real `mdrun -v` lines (the notebook's saved output has only its own bar) |
| `gmx_version` | R9 | already known: `detectGmx` | |
| `build_start/note/warn/end/skip`, `build_summary` | R5a, R9 | the build record; L `summaryText(records)` (golden against the saved summary) | dated file only (question 11) |
| `check_gromacs_version` | R3b | the configured gmx (`config.gmx`) | the notebook picks `gmx_mpi` for 2025; gmx-cypher already has one gmx |
| `build_peptide` | R3b, R5b | shipped `python/build_peptide.py`, run with the configured python | the 800×600 picture into `visualization/` kept, as the notebook |
| `gro_file_check` | R5c | S: wait for the `.gro` (10 s, 10 min) | without its `cd ..` |
| `render_qq_script` | R7a → **R3b** | L `qqScript(profile, step)` (golden) | moved earlier: §8 |
| `write_script`, `write_pull_script`, `write_multidir_script` | R7a | L (text) + S (exclusive write, copy) | bugs N1, N9, N10 below |
| `write_topology` | R3b | L `topologyText(system, plan)` (golden) | |
| `run_gromologist` | R3b, R5b | shipped `python/hmr.py`; L rewrites the includes | where the split files go: question 23 |
| `basic_analysis`, `plot_single`, `plot_combined` | — | **left out** (plots, §2 of the spec) | the potential-energy `.xvg` is still made; gmx-cypher's energy chart can show it |
| `merge_gro_files` | R3b | L `mergeGro(peptide, carb, box)` (golden on your sample) | |
| `build_index` | R3b | `make_ndx` step + L `carbGroup(n)` (15 per line, golden) | |
| `parse_pullx` | R6, R9 | L `pullx(text)` | |
| `neutralizing_counts`, `parse_net_charge`, `count_water` | R3b | L `ionCounts`, `netCharge`, `waters` (golden: −3.75 e/10 412 → 33/28; the saved 30/30, 38/30, 30/38) | |
| `write_pull_script` | R7a | as above | |
| `quarantine`, `run_system`, `retry_failed` | R6 | L `retryPlan`, `quarantineName`; S moves | `retry_failed` is marked "DOESNT WORK" in the notebook: rebuilt from the spec, not copied |
| `retry_failed_walkers` | R6 | L `nearestWalker` (golden: the saved "8 (3.0 nm) ← walker 7 (2.5 nm)") | run once, automatically, right after the walkers are prepared, as your cell does (question 40) |
| `sol_creation` | R3b, R5b | 13 tiles (§4.1 build view) | differences: questions 22–24 |
| `minimization`, `eq_nvt`, `eq_npt` | R3b, R5 | one "md stage" tile type, three instances | |
| `awh`, `pull` | R3b, R7 | tiles; the submit line printed | |
| `multiwalker` | R3b, R5, R6 | tile; L `walkerFrames(pullx, distances)` | not in the notebook's `process_map`: you run it by hand after the pull |
| `top_charges`, `solute_charge`, `gmx_charge` | R9 | L (topology charges); S grompp in a temporary folder | |
| `pull_report`, `walker_report` | R9 | L rows (golden on the saved tables) | |
| `read_awh_file`, `apply_entropy_correction`, `shift_to_zero`, `save_data`, `process_file`, analysis loop | R8c, R8d | `gmx awh` by the existing AWH command; numbers by the Matrix's `correctCurve`/`wellArea`/`runStats` (question 15) | the `.dat` file left out |
| `_mol_sections`, `termini`, `check_termini` | R9 | L (golden on the saved termini table) | |

### 3.2 Bugs in the notebook

The six the spec lists are all there: `write_script()` writes the `7.awh` mdrun line into the min, NVT and NPT scripts; `is_hmr = True` (and `is_fast = True`) set locals; glucose writes `AGLC 254`; `read_awh_file` has `for line in f:5 B`; `retry_failed()` is commented out with "DOESNT WORK!!!"; the hint's pattern misses the real AWH error ("Distance between pull groups 1 and 2 (3.657996 nm) is larger than 0.49 times the box size (3.406945)"). It does catch the walker error ("larger than 0.5 times half the box size … should be chosen as pbcatom"). Thirteen more, none to copy:

| # | Bug | Consequence | What the plan does |
|---|---|---|---|
| N1 | min, NVT and NPT scripts are named `run_{stage}_{seq}.sh` (the `meth` argument defaults to `"run"`) | the second method finds the first method's script and keeps it ("SKIPPED: already exists"); `scripts/minim/` etc. are never created, so the first write fails if they are missing | `{method}_{stage}_{seq}.sh`, as the spec says |
| N2 | `pdb2gmx` runs inside `ff/` after `cp {seq}.gro ff/`, and the moleculetype goes to `ff/{seq}.itp` | one `ff/{seq}.itp` for every method and saccharide, **overwritten by each build**; its `#ifdef POSRES` include points at the last system's restraints file; `ff/{seq}.gro` overwritten too | question 23 |
| N3 | HMR files go to `ff/{method}/{seq}/Protein.itp` and `ff/{method}/{carb}/{seq}/CARB.itp` | `Protein.itp` is shared by every saccharide and overwritten | question 23 |
| N4 | `multiwalker` always uses `hmr_multi.mdp`; `pull` always `pull.mdp` | a method without hmr gets the HMR walker mdp | question 24 |
| N5 | the summary appends a rebuilt system again and keeps stale rows | the saved summary lists hhhhhhhh twice (FAILED and OK) and an "aaaaaaaa … 0:00:00 OK SB 1" row left from an earlier cell | one row per system in the build record; the old one *retried* |
| N6 | `AA_COLORS` is never defined | `process_file` raises `NameError` | left out (plots) |
| N7 | `save_data`'s header says "minimum shifted to zero" | the code shifts the **last** point to zero | question 15 decides the reference; the header says the one used |
| N8 | `process_file` has two identical branches for hmr | none | — |
| N9 | the pull script has no `# qq job-type continuous` and no resubmit check, but `loop-end 10` | qq never resubmits it | question 25 |
| N10 | the LUMI script asks `ncpus = 8·N` with `-ntomp 7`, no `props`; its docstring says "not sure about correctness" | — | golden as written, flagged; question 25 |
| N11 | glucose: `insert-molecules -f 3.salted.gro -o 3.salted.gro` with stdin `18` (a group number) | writes over its input; group 18 is SOL only for a system with these exact groups | off by default; needs a sample (§6) |
| N12 | `pdb2gmx`'s answers are menu numbers (`1 8 0 0`; a comment says `1 8 1 1` for M) | "1" is whatever force field lists first in the current folder | question 22 |
| N13 | `gro_file_check` ends with `cd("../")`; a walker target the pull never reached takes the nearest frame with a warning | two walkers can start from the same frame (dddddddd: targets 0.4 and 0.6 nm both from 0.81 nm) | warn as the notebook does, and show the frame chosen per walker (question 36) |

### 3.3 Real text the notebooks hold (used for the fakes, paths replaced)

From the saved outputs, all GROMACS 2025.4-PLUMED_spack, `gmx_mpi`: `pdb2gmx` (force-field menu "1: CHARMM all-atom force field" from the current folder, then the installed ones; water menu with "8: None"; termini menus; "Total charge 0.000 e"); `solvate` ("Adding line for 11140 solvent molecules with resname (SOL) to topology file", "Back Off! I just backed up hhhhhhhh.top to ./#hhhhhhhh.top.1#"); `grompp` (WARNING 1/2 on `ADDff.itp` atom types redefined, on every grompp; NOTE on COM removal with restraints; the AWH covering-diameter warning; "Pull group 1 'Protein' has 139 atoms"); `genion` ("Will try to add 30 NA_s ions and 30 CL_2s ions.", "Replacing 60 solute molecules in topology file … by 30 NA_s and 30 CL_2s ions."); `make_ndx`'s menu and prompt; `mdrun` minimisation header and end ("Steepest Descents converged to Fmax < 1000 in 635 steps"); two fatal errors (AWH box, walker pbcatom, the second with an `MPI_ABORT` block); the summary, pull, walker and termini tables. The older notebook adds real **`qq submit`** output: "INFO     Job '1500135.robox-pro.ceitec.muni.cz' submitted successfully." and its error for a missing script. Not in either: `mdrun -v`'s own progress lines (the notebook folds them into its bar), `gmx awh`'s output names, `insert-molecules` output, PyMOL and gromologist versions.

### 3.4 Where the mock-up and the notebook disagree

The mock-up was drawn from the notebook but drifts from it in places; the notebook wins unless you say otherwise (the golden tests follow it). The ones that change a command or a number:

| Mock-up | Notebook | Plan follows |
|---|---|---|
| mdp parameters on tiles (nvt 100 ps, npt 1000 ps, 300 K; AWH D 0.0001; pull 0.005 nm/ps), "added" to mdp files | your `inputs/*.mdp` used as they are | the notebook: mdp files as they are, shown read-only (question 20) |
| pull groups `Saccharide` / `Peptide` | `[ CARB ]` appended to make_ndx's groups, pull group 1 `Protein` (grompp output) | the notebook |
| HMR by gromologist **and** a mass-repartition factor and dt added to mdp files | gromologist only | the notebook |
| editconf `-d 1.2 cubic` | `-box 1 1 1` (trjconv) and a 7.0 nm box in the merge | the notebook |
| T 300 K on tiles, 310.15 K for the PMF | 310.15 K for the PMF; the mdp's own `ref-t` for the runs | the notebook |
| `solvate -cs` shown "spc216" | `-cs` with no value (gmx's default) | the notebook's argv |
| per-sequence pdb2gmx answers ("mmmmmmmm: 1 8 1 1") | one answer string for all | question 22 |

The mock-up's other contradictions are between its own boards (the same system FAILED on one and running on another, three rules for `-maxwarn`, the termini table said to be "on the dashboard", step names on the Warnings board that no tile makes). They are sample data; none changes the plan.

---

## 4. Design pass

**Your decision (2026-11-04): SymBuilder looks like the mock-up.** After the first set of screenshots you asked for the mock-up's own design: its colours, its icons and its clarity, with its drag and drop and the Run board's checkable stages. The screens below are redrawn that way: tiles tinted by their category's tone (structure stone, topology sky, place · box lilac, water and salt aqua, min · eq coral, pull · awh butter, checks mint), each with its icon in a tone square; coral for the selection, the primary action and the active tab; status as a coloured dot and its word; amber panels for what needs a look. To match it exactly I rendered your boards locally (the design tool's runtime isn't in the zip, so a 120-line stand-in reads their `<sc-for>`, `<sc-if>`, `{{ … }}` and Morpheus components, with React 18 and the Morpheus bundle from the design system), and rebuilt each screen beside its board with gmx-cypher's own kit and Morpheus's tones. This changes three rules of the design contract and one decision (T159); they are question 38. Doing it also showed that gmx-cypher's copy of Morpheus's tokens is out of date: Morpheus's coral is now `#ff5429` (was `#ffb09c`), with new soft and strong corals and heat scale; question 39.

### 4.1 Plan: where each board goes

**The four tabs.** One bar, in this order; each tab opens where it was left. analysis keeps today's set-up and results, compare stays inside results (selecting two or more results opens it, as today), so analysis's second level has two entries, not three.

```
gmx-cypher  gmx 2025.4 · ready                         settings  [☀ ☾ auto]
home   symbuilder 1 building   analysis 04   cluster
────────────────────────────────────────────────────────────────────────────
 set-up   results 04                        ← analysis's second level (coral underline)
1 inputs › 2 groups › 3 command          [ one trajectory | batch ]
```

Each tab with views has the same second level: a second line of tabs under the first, with the coral underline of the mock-up's own nav; on the right of symbuilder's, the status words of the mock-up's header (checks open, python and its libraries) and, on *build* only, the primary *build N systems*. symbuilder: `build · systems · files · progress · summary`; analysis: `set-up · results`; cluster: `jobs · scripts`. home has none.

| Board | Goes to | In one sentence |
|---|---|---|
| Build (`Main`) | symbuilder · **build** | The build plan as a stack of tiles grouped by stage, a palette to add tiles, and the selected tile's inspector with its options, its exact command for the first system and the files it reads, writes and changes. |
| Run | symbuilder · **systems** | Methods × saccharides × sequences (typed, or from the project), repeats and what to do with a folder that exists, then a preview of every system with its place in the project and its problems; one primary button, *build N of M*. |
| Dashboard | symbuilder · **progress** (+ a card on home) | What is building now (one bar per local mdrun), the pull report and the walker report, read from the build records and the folders. |
| Summary | symbuilder · **summary** | The build summary (one row per system), termini, and the PMF numbers by the Matrix's code. |
| Files | symbuilder · **files** | Per saccharide and sequence the files a build reads, the mdp file each stage uses per method, and the force-field check, all read-only: one view, because each is "what a build reads" (R4) and none is long. |
| MDP | symbuilder · **files** (its mdp section) | As above; a separate view only if you want the library templates (question 20). |
| Cluster scripts | cluster · **scripts** | The profiles and the script of the selected system and stage, with the submit line to copy; today's list is cluster · jobs. |
| Library | backlog | question 7. |
| Warnings | the status component and the build record's problems | A grompp WARNING or NOTE is a *check* or *note* line on its step and in the summary's "warnings per stage"; no separate view, and no "ignore" (question 4). |
| Settings | the settings dialog (machine) and the build plan (science) | question 3: python, the base folder and waiting go to settings; force field, methods' switches, charges, ions, salt, box, walkers and maxwarn go in the build plan. |

**symbuilder · build** (screenshot: `mock-build-*`)

```
[ build | systems 07 | files | progress | summary ]
TILES ───────────   AWH binding  build plan · 7 stages · 18 steps  [save build plan]   ┌ add water ──────────────────┐
+ build peptide     ▾ ☑ SOLUTION BUILDER  here · seconds ─────────────────            │ solution builder · step 7   │
+ peptide from file   ⋮ ☑ build peptide      pymol                                    │ water box     water model   │
+ add water           ⋮ ☑ place saccharide   trjconv · editconf                       │ COMMAND · FIRST SYSTEM ───  │
+ add salt            ⋮ ☑ peptide topology   pdb2gmx                                  │ gmx_mpi solvate -cp 01.conf │
+ …                   ▌ ☑ add water          solvate                       ↑ ↓        │  .gro -cs -o 2.solvated.gro │
                      ⋮ ☐ add glucose        insert-molecules   (dimmed)              │ FILES  reads · writes ·     │
                    ▾ ☑ MINIMISATION  here · mdrun ───────────────                     │        changes              │
                      ⋮ ☑ minimise           grompp · mdrun                           │ note runs here · seconds    │
                    ▾ ☐ MULTIWALKER  left out: needs the pull's pullx.xvg              └─────────────────────────────┘
```
At 1024 px the palette becomes a wrapping row above the stack.

**symbuilder · systems** (screenshot: `mock-systems-*`)

```
METHODS                     SACCHARIDES                 SEQUENCES
[hmr+fast+6, hmr+fast+6r]   [o111, pg, wta]             [aaaaaaaa cccccccc …]
hmr: gromologist · fast …   each needs …gro and …itp    as typed; upper-case for PyMOL
[from the project] [preview] [build 6 of 7]  7 systems, in solutions/{method}/{saccharide}/{sequence}/ · nothing runs until you press build
☑ SYSTEM                     IN THE PROJECT                                   CHECK
☑ hmr+fast+6 · o111 · aaaa…  row hmr+fast+6 · AAAAAAAA · column O111 · runs a–h  ok ready
☑ hmr+fast+6 · o111 · pppp…  …                                                note proline start: N-terminus NH2+
☑ hmr+fast+6 · pg · aaaa…    …                                                check exists: built to npt; continue, skip or repeat
☐ hmr+fast+6 · wta · aaaa…                                                    error not built: no molecules/saccharides/wta.gro
```

**symbuilder · files**, **progress**, **summary** (not drawn: they are tables of R4, R5 and R9 data, built from the same parts)

```
files:    SACCHARIDES  o111 · pg · wta        o111  molecules/saccharides/o111.gro  ok found
          SEQUENCES    built with PyMOL             ff/o111-ADD.itp                 ok found
          MDP FILES    stage × method → inputs/…mdp (awh_hmr.mdp for hmr), read-only text on click
          FORCE FIELD  ff/charmm36s-jul2022-prosECCo75.ff/ forcefield.itp … ok · ADDff.itp ok · TIP3PF/… ok
progress: BUILDING NOW  hmr+fast+6/o111/kkkkkkkk · npt  [██████░░░░] step 84 000 / 200 000 · 1 min left
          PULL          system · min · max · frames        WALKERS  system  1–8  oooooooo  missing
summary:  system · charge · ions · min · time · status · warnings per stage  (+ ! note)
          TERMINI  system 1st N-term last C-term q1 qN qTOT        PMF  min · at r · area · (the Matrix's correction)
```

**home** (screenshot: `mock-home-*`)

```
┌ gmx ───────────────┐ ┌ vault ──────────────────────┐ ┌ symbuilder ─────── [progress] ┐
│ ok ready gmx 2025.4│ │ evomd-vault · project …     │ │  1        38      2       4    │
│ python: not set    │ │ 20 rows · 3 columns ·       │ │ BUILDING BUILT FAILED WAITING │
└────────────────────┘ │ 41 cells without a run      │ │ building …/kkkkkkkk · npt …   │
┌ analysis ─ [results]┐ │ › build what the project … │ └────────────────────────────────┘
│ done gmx awh · …    │ └─────────────────────────────┘ ┌ cluster ─────────── [cluster] ┐
│ failed gmx hbond …  │                                 │ read 14 min ago: 6 running …  │
└─────────────────────┘                                 └────────────────────────────────┘
```

**cluster · scripts** (screenshot: `mock-cluster-*`)

```
[ jobs | scripts 03 ]
PROFILES ─────────────────────────       ┌ hmr+fast+6_awh_aaaaaaaa.sh ─── [copy the submit command] ┐
▌ metacentrum · 2025.4 cuda              │ scripts/awh/ · copied to solutions/…/7.awh/                │
  metacentrum · 2022.3 plumed            │ #!/usr/bin/env -S qq run                                   │
  lumi · multidir                        │ # qq job-type continuous … gmx_mpi mdrun -ntomp 8 …        │
SCRIPTS · 3 SYSTEMS ──────────────       │ if [ -f "7.awh.gro" ]; then exit "${QQ_NO_RESUBMIT}" fi    │
▌ hmr+fast+6/o111/aaaaaaaa  awh   written│ gmx-cypher never submits: qq submit -q gpu …               │
  hmr+fast+6/o111/aaaaaaaa  pull  kept   └────────────────────────────────────────────────────────────┘
```

### 4.2 Review against the brief: where the mock-up and the contract disagree

Rows 1–4 follow your decision for the mock-up's look (question 38); the words, rows 5–15, still follow the contract.

| # | Mock-up | Contract | Plan |
|---|---|---|---|
| 1 | status words *warning*, *runs*, *ready*, *done/short/missing* in tone colours (mint, butter, sky, lilac) | four levels, icon + word in ink, red only for error (§4); group tones are never UI state (§2) | **the mock-up's**: a dot and its word in the tone: mint ok / ready / done, butter check / short / skipped, sky note / building, red error / failed / missing. The word is always there (colour is never the only signal) and the dots use the `-strong` tones (3:1 in both themes) |
| 2 | ✓ badges on the force-field files (Build) | no ✓/✗/⚠ captions (§7) | mint dots before each file name (no glyph captions) |
| 3 | the selected tile ringed in coral, the selected row and profile with a coral bar | UI state is ink; ink outline is the reference (§2) | **the mock-up's**: coral is the UI-state colour (selection, primary, active tab, focus), so the reference keeps ink to itself |
| 4 | per-stage *runs / skipped this run* buttons; checkable stage chips on Run | one primary action per view | **the mock-up's**: an *in this build* pill on each stage of the stack (mint, struck out when left out) and the checkable stage chips in systems; one coral button per view |
| 5 | 24 phrases `NEVER_SHOWN` refuses (the table below) | §1 | reworded, question 2 |
| 6 | *recipe* for a saved stack | *recipe* is an analysis recipe (T-series) | *build plan* |
| 7 | *job* for a qq submission ("Cluster jobs", "all walkers run as one job") | *job* = one gmx execution by gmx-cypher | "qq job" where it is qq's (the cluster tab already calls them jobs: "your cluster jobs", its *job* column), *step* for gmx-cypher's own |
| 8 | *record* for the summary row ("the old record becomes RETRIED") | *record* = a job's `.run.json` | *build record* |
| 9 | *command* for the inspector's whole section, and for qq lines | *command* = a gmx tool with its options | "command · first system" only for gmx lines; "what it runs" for python; "submit line" for qq |
| 10 | *settings* for the project and science values ("general settings") | the settings dialog | machine values in settings; the rest in the build plan (question 3) |
| 11 | *step* for a stage (Cluster's "Steps" table, MDP's "step" column) | (new word) | *stage* for the seven stages, *step* for one tile's work |
| 12 | stage names drift (minimisation / min / minimise / MINIMIZATION) | §6.2: an action keeps its name | one list: solution builder · minimisation · nvt · npt · awh · pull · multiwalker |
| 13 | tab and heading names differ (dashboard / "checks", mdp / "mdp library") | §6.1 | the view's name is its heading |
| 14 | an open warning stops the build until it is "ignored" | not in the contract; the notebook passes `-maxwarn 6` to every grompp | warnings are counted and shown, never stop the build (as the notebook); question 4 |
| 15 | a real storage path with a user name as the default base folder (Settings board) | — | removed from the committed copy (`<cluster>/<you>`), question 33 |

**The 24 phrases, with the proposed rewording** (question 2):

| Board | Text (excerpt) | Phrase | Becomes |
|---|---|---|---|
| Build | "leave this stage out of the run, or put it back" | the run | "leave this stage out of the build, or put it back" |
| Build | "The run waits for 4.minim.gro, then writes…" | the run | "This step waits for 4.minim.gro, then writes…" |
| Build | "skipped this run" | this run | "left out of this build" |
| Build | "# the run goes on · a tile that needs this output waits for it" | the run | "# the build goes on · …" |
| Build | " from the run tab" | the run | " from the systems view" |
| Build | "its stage is skipped in this run · the files it made earlier are read from disk" | this run | "its stage is left out of this build · …" |
| Build | "…library files are copied there when the run starts" | the run | "…when the build starts" |
| Build | "…set on the [run board]" (split by a link) | the run | "…set in systems" |
| Run | "stop the run" | the run | "stop the build" |
| Run | "…of 7 stages in this run · … what an earlier run left on disk…" | this run | "…in this build · … what an earlier build left…" |
| Run | "…marked FAILED with its stage and the error … and the run goes on…" | the run | "…and the build goes on…" |
| Run | "the run stops at each cluster job until it ends…" | the run | "the build waits for each qq job to end…" |
| Run | "the run submits each job and starts the next system at once…" | the run, each job | gone with question 6 (nothing is submitted); otherwise "the build writes each script and starts the next system…" |
| Files | "the run board lists the same systems…" | the run | "systems lists the same systems…" |
| MDP | "library files are copied to inputs/ when the run starts…" | the run | "…when the build starts…" |
| Cluster | "…wait or move on from the run tab decides…" | the run | "…from systems decides…" |
| Library | "submitted with qq · follows wait or move on from the run tab" | the run | backlog board (question 7) |
| Warnings | "open · the run stops here until it is fixed or ignored" | the run | not used (row 14 above) |
| Warnings | "the run stops at the first tile that has an open warning…" | the run | not used |
| Settings | "…the run reads and writes only inside the base folder" | the run | "a build reads and writes only inside the base folder" |
| Settings | "a repeat is a completely different folder tree … and the repeat starts again…" | the run | "…" ("the run" there means the build: "a repeat builds the whole stack again in a new folder") |
| Settings | "…so a run can be repeated later…" | a run | "…so a build can be repeated later…" |
| Settings | "…set on the [run board]" (split by a link) | the run | "…set in systems" |

The mock-up's nav word *run* (the board) becomes **systems**; its button "Run 12 systems" becomes **build 12 systems**; "Repeated runs" becomes **repeats**.

### 4.3 Screenshots

Throwaway mock-ups in a scratch copy of gmx-cypher (deleted after; only the images are committed): its own `src/ui/` kit, Morpheus's current tokens with the accent set to coral, the server running with the fake gmx and four sample jobs, sample data from the notebook's saved outputs. Light and dark, 1280 and 1024 px, 1×, reduced to 256 colours (3.2 MB for all 46 images). No console errors or warnings, other than the favicon 404 of §1.

| What | Files in `docs/img/batch-4/` | Beside the board |
|---|---|---|
| the tab bar | `mock-tabs-{1280,1024}-{light,dark}.png` | — |
| analysis's second level above set-up's steps | `mock-analysis-…` | — |
| home | `mock-home-…` | — |
| symbuilder · build, *pdb2gmx* selected | `mock-build-…` | `board-main-dark.png` |
| symbuilder · systems with the preview | `mock-systems-…` | `board-run-dark.png` |
| symbuilder · files (files, mdp, force field) | `mock-files-…` | `board-files-dark.png`, `board-mdp-dark.png` |
| symbuilder · progress | `mock-progress-…` | `board-dashboard-dark.png` |
| symbuilder · summary | `mock-summary-…` | `board-summary-dark.png` |
| cluster · scripts with the awh script | `mock-cluster-…` | `board-cluster-dark.png` |
| the other boards, for reference | — | `board-warnings-dark.png`, `board-settings-dark.png`, `board-library-dark.png` |

What I changed after looking at them beside your boards: one coral button per view (systems had two); system names that were cut off in the systems preview; status dots that were the pastel tone and too faint on the light theme (now the strong tone). After your review (2026-11-04): page headings and card titles in Archivo (`text-title`, `text-heading`, as the rest of gmx-cypher; data names such as systems and file names stay in mononoki); the lanes drawn as the Run board draws them (separate rounded blocks, staggered, the legend in the same pastel tones); progress gains the pull **trace** beside the pull report, drawn with gmx-cypher's own `SeriesChart` (the target as its dashed rule, start, last, target and frames under it); the walker distances as one pill each, so they wrap instead of overflowing.

---

## 5. Each request

Budgets are lines of code (src + server), then lines of tests. "Writes" and "programs" list only what is new.

### R1 Four tabs

- **Today:** §2.1 and §2.3.
- **Change.** R1a: `design-contract.md` §1: *analysis* also names the tab; the new words *system, build, stage, step, build plan, build record, repeat* with what they never mean; §3 the second level of tabs. `contract.ts`: no change (no pattern needed for *analysis*). R1b: `route.ts`: `{view: 'home'}` and `{view: 'symbuilder', sub}` with `SYM_VIEWS` (a fixed list), `tabOf(route)`, unknown → `#home`, and an exhaustive switch in `formatRoute` (the catch-all goes, so the compiler finds a missing view); `App.tsx`: four triggers, `kept` per view and per tab, the analysis second level (segmented), counts on the analysis and symbuilder triggers (question 26); `views/SymBuilder.tsx` (the second level and empty views until R3); `index.html` an icon (question 32). `#analysis` stays an old address for set-up's command step (question 27). No new key.
- **Files:** `docs/design-contract.md`, `src/lib/route.ts`, `src/App.tsx`, `src/views/SymBuilder.tsx` (new), `index.html`, `test/route.test.ts`, `e2e/smoke.spec.ts`, `README.md`.
- **Budget:** R1a docs only; R1b +90 −20, tests +70.
- **Writes, programs:** none.
- **Tests:** `route.test.ts`: every address of today round-trips and every old one redirects as today (the existing 35 cases kept); `#home`, `#symbuilder/<each view>`; `#symbuilder/../x` and `#symbuilder/nope` → `#symbuilder/build`; unknown → `#home`; `tabOf` for every view. Contract scanner unchanged and passing. Playwright: smoke clicks through the four tabs and reloads each.
- **Risks:** `kept` per tab and per view must keep results' selection for the D key (it reads the last results route): keep `kept` by view, and add the tab's last view beside it, as in the prototype. The drop handler sends inputs to set-up and results to compare as today.

### R2 home

- **Change:** `views/Home.tsx`, one component of five cards (gmx and python; vault and project; analysis jobs running and the last four; symbuilder by state, an empty state inviting a first build until R5; the cluster tab's last read). The last read is **lifted to `App`** (`ClusterView` gets `onRead`), so home shows it while the page is open and nothing new polls or runs; after a reload home says "the cluster tab hasn't been opened". The project card reads `/api/vault/project` once when home opens.
- **Files:** `src/views/Home.tsx` (new), `src/App.tsx`, `src/views/Cluster.tsx` (one callback), `test/home.test.ts` (new).
- **Budget:** +120 −0, tests +70.
- **Writes, programs:** none.
- **Tests:** `renderToStaticMarkup` of an empty state (no vault, no jobs, no read) and a busy one; every item is a link to its route.
- **Question:** 18.

### R3 The build stack and its plan

- **R3a model.** `src/lib/build/plan.ts`: `BuildPlan {format: 'gmx-cypher build plan', version: 1, name, stages: {id, on, tiles: {type, on, options}[]}[], science}`; `Systems {methods, saccharides, sequences, repeats}`; `switches(method)` → `{hmr, fast}` by name; `repeatName(method, n)` (`hmr+fast+6` → `6r`, `6r1`, …); the folder and file names as constants; `readPlan` refusing a newer version in words. Saved plans in `server/builds.ts`, as `recipes.ts` does it: `<state>/builds/<id>.json` via `.part` and rename; export and import as JSON in the page. Frozen fixture `test/fixtures/build-plan-v1.json` first.
- **R3b planners.** `src/lib/build/steps.ts`: one function per tile type → `Step {program: 'gmx' | 'python', tool, argv, stdin?, cwd, reads, writes, replaces}`; text functions `mergeGro`, `carbGroup`, `topologyText`, `renameWater`, `moleculetype`, `ionCounts`, `netCharge`, `waters`, `walkerFrames`, `qqScript` (moved here from R7a: the inspector shows a cluster step's script). Golden table: the notebook's line → the expected argv, for every tile of `hmr+fast+6/o111/aaaaaaaa`.
- **R3c views.** `src/views/SymBuilder.tsx` with `Build.tsx` and `Systems.tsx`. The stack: native drag and drop (no dependency), ↑ ↓ buttons, and Alt+↑/↓ on a focused tile (through the key registry, so the sheet lists it); stage checkboxes; the inspector. Systems: the three lists, *from the project* (R8a), the preview table (R8b fills its "in the project" column), *build N of M* disabled until R5 exists ("building comes in a later batch" if the cut is approved).
- **Files:** `src/lib/build/{plan,steps,text}.ts`, `server/builds.ts`, `server/api.ts` (plans: list, read, save, delete, as recipes), `src/views/{SymBuilder,Build,Systems}.tsx`, `src/core/contract.ts` (two keys), tests below.
- **Budget:** R3a +260, R3b +620, R3c +560 (≈ +1,440); tests ≈ +1,000.
- **Writes:** `<state>/builds/<id>.json` (gmx-cypher's own state folder, like recipes). Nothing else: R3 only plans.
- **Programs:** none.
- **Tests:** `build-plan.test.ts` (the fixture read first; newer version refused; repeat names; switches), `build-steps.test.ts` (golden argv/stdin per tile; cwd; reads/writes/replaces), `build-text.test.ts` (ions: −3.75 e/10 412 → 33/28/residual 0; the saved 30/30, 38/30 for −6 e, 30/38 for +6 e; `mergeGro` and `carbGroup` on your sample; `topologyText` for TIP3P, TIP3PF, HMR; `renameWater` both ways), `builds.test.ts` (save, list, export), the views with `renderToStaticMarkup`; Playwright: build and systems views with the fakes.
- **Risks:** the golden table needs your answers to questions 22–24 (they change the argv); `mergeGro` and `topologyText` need real files (§6).

### R4 What a build reads

- **Change.** A base folder (the notebook's `BASE_DIR`) in settings, which must sit inside an allowed folder. `POST /api/build/check` (stat only, inside the allowed folders): for each system the files it needs (`molecules/saccharides/{c}.gro`, `ff/{c}-ADD.itp`, a sequence's structure if given, each stage's mdp by method, the force field's files) found or missing. `GET /api/build/text?path=` sends a `.mdp`, `.top` or `.itp` (size-capped, inside the allowed folders) for the read-only view. Settings: `python` validated like `qq` and added to `SETTABLE`; `base`; the wait (10 s, 10 min). The analysis input browser is untouched.
- **Files:** `server/build-check.ts` (new), `server/api.ts`, `server/state.ts`, `src/views/Settings.tsx`, `src/views/BuildFiles.tsx` (new), `src/lib/build/plan.ts` (file tokens).
- **Budget:** +320, tests +260.
- **Writes:** none (unless question 20 is yes: a template copied into `inputs/` under a free name).
- **Programs:** possibly `python -I -c "import pymol, gromologist; …"` with fixed arguments, to say in settings whether the python can build (question 5).
- **Tests:** `build-check.test.ts` (found, missing, outside the allowed folders refused, a symlink out refused); settings validation (python like qq; base inside allowed); a missing file named per system in the preview.
- **Risk:** the force field's file list needs your `ff/` listing (§6).

### R5 Building on this machine (batch 5 if the cut is approved)

- **Change.** A second `Jobs` instance for build steps, in `<state>/builds/jobs/`, so analysis's results list keeps only analyses (question 30); a queue running one system at a time by default (question 10), each step through `Jobs` with its stdin; a step refused before it starts if one of its `writes` exists and is not in the build's own list (the writing rule); the build record `<system>/build.json` (question 8) with every file written or replaced, its size and SHA-256; mdrun progress from `-v` (sample needed); wait for the `.gro`; cancel stops the system's current step's group; SIGHUP as for jobs. Shipped `server/python/build_peptide.py` and `hmr.py`.
- **Budget:** +700, tests +700.
- **Writes:** `{base}/solutions/{method}/{saccharide}/{sequence}/` and everything below it (the notebook's names, `visualization/`, GROMACS's own `#name.N#` backups, question 31); `{base}/logs/build_summary_<date>.log` (R9); `<state>/builds/`. Files replaced, each only after this build wrote it: `{c}.gro` (centred, then shifted), `pre.gro` (aligned), `{seq}.top` (solvate, genion, the TIP3F renames, the HMR includes), `3.salted.gro` (glucose, if on). Where `ff/` stands: question 23.
- **Programs:** the configured gmx with `pdb2gmx editconf trjconv solvate genion make_ndx grompp mdrun energy` (and `insert-molecules` if glucose is on), each argv from the plan; the configured python with the two shipped scripts and `{sequence}` / file arguments only.
- **Risks:** no real gmx, PyMOL or gromologist here: the end-to-end check on a real system is **not run** until you run it.

### R6 Failures, retries, repeats and resume (batch 5)

- **Walkers, as your notebook does them.** Your multiwalker cell prepares every walker, keeps going past one that fails, then calls `retry_failed_walkers()` once in the same cell: each walker without a `.tpr` is moved to `9.multiwalker/failed/{i}_<stamp>/` and prepared again from the `start.gro` of the nearest working walker by distance. The plan does the same automatically, once, as the last part of the walker step (question 40), records for each rebuilt walker its donor and the distance it now starts at (the saved case: walker 8, meant for 3.0 nm, starts from walker 7 at 2.5 nm), and shows it in progress's walker report. A system with no working walker (no `pullx.xvg`, or every walker failed) is not rebuilt; a button tries again.
- **Change.** L `retryPlan`, `quarantineName`, `nearestWalker`, `hint(text)` (matching "larger than 0.49 times the box size" and "0.5 times half the box size … pbcatom", both real); S moves a failed system folder (only one this gmx-cypher's build record says it created) to `{method}/{carb}/failed/{seq}_<stamp>/` with `FAILED.txt`, and a failed walker to `9.multiwalker/failed/{i}_<stamp>/`; continue / skip / repeat for an existing folder; stages chosen; strict mode.
- **Budget:** +350, tests +350.
- **Writes:** `failed/` folders and `FAILED.txt`; **moves** of folders the build created (never deletes).
- **Programs:** as R5.

### R7 The cluster (batch 5; the script text in R3b)

- **Change.** R7a: the profiles as data (the notebook's three); scripts written to `{base}/scripts/{stage}/{method}_{stage}_{seq}.sh` with `wx` (kept and shown if it exists), copied into the step folder with `COPYFILE_EXCL`; the submit line printed (question 6). R7b: cluster · scripts (§4.1); a qq job whose input folder (already parsed, T196) is a system's step folder is shown as that system's, and *go on* starts the next stage only on a press.
- **Budget:** +400 (R7a text already in R3b), tests +350.
- **Writes:** `{base}/scripts/{stage}/…sh`; the copy in the step folder.
- **Programs:** none new (qq is read as today; nothing submitted unless question 6 says so).

### R8 SymBuilder and the Matrix

- **R8a (batch 4):** from `projectSummary`: methods = the rows' groups, saccharides = column labels in lower case (the Matrix matches columns without case), sequences = rows' sequences in lower case (your folder spelling); *build what the project lacks* = cells with no run. L `systemsFromProject(summary)`. +120, tests +120.
- **R8b (batch 4):** L `landing(system, settings)` with the Matrix's `parsePath`, `mergeFields` and `parseName` (imported): for the AWH folder and each walker folder, the row, column and run it would land in; problems in words: no match, another row, another column, a run out of 1–10, **a new row because the row's name is not its sequence** (§2.2), and the README's `{*}` pattern with `7.awh`. +150, tests +200 (the §2.2 probes as a table, plus `planBatch` on a synthetic file with a `Working dir:` header).
- **R8c (batch 5):** an AWH batch (lifting `batchable`'s refusal for awh only): `gmx awh -s 7.awh.tpr -f 7.awh.edr -o <tmp>/awh.xvg -skip 125 -quiet` with **cwd = the system's step folder** (so the header's `Working dir:` is the system's path) and the output in a temporary folder (nothing written in the system folder); the last frame's PMF sent to `_inbox` by the existing send, named by the project's name pattern, checked with `parseName` (question 13), with the temperature said (question 14). +250, tests +250.
- **R8d (batch 5):** numbers by the Matrix's `correctCurve`, `wellArea`, `runStats`, imported into the page; the summary says "the Matrix's correction: tail = mean of the last 10 %". +40.
- **R8e:** the existing "vault untouched" tests extended to SymBuilder's sends.
- **Writes:** only `_inbox/` and `gmx-cypher/` (as today). **Programs:** `gmx awh` (exists), with a new cwd.

### R9 Reports (batch 5)

- L `summaryText` (golden against the saved summary, with N5 fixed), `pullRows`, `walkerRows`, `topCharges`, `termini` (golden against the saved termini table: PRO flagged as `PRO-NH2+`); S: the charge after NPT by `grompp -f inputs/minim.mdp -p {seq}.top -c 6.eqnpt/6.eqnpt.gro -r … -o <tmp>/charge.tpr -po <tmp>/charge.mdp -maxwarn 6 -quiet` with cwd = the system folder (its relative includes) and outputs in a temporary folder; `logs/build_summary_<date>.log` created with `wx`.
- **Budget:** +400, tests +400. **Writes:** the dated summary. **Programs:** `grompp` as above.

### R10 From a built system to analysis (batch 5)

- `BatchPreset` gains `template`; *analyse* on one or many systems calls `offerBatch(root, recipe, template)` with `root = {base}/solutions` and `{method}/{column}/{seq}/9.multiwalker/{run}/9.multiwalker.xtc`. +40, tests +60 (the route and preset; `matchTrajectory` on a fake built tree).

---

## 6. Samples I need

Nothing below will be faked; a test that needs one waits for it.

| # | Sample | For |
|---|---|---|
| 1 | Listing (names only) of `ff/`, `inputs/`, `molecules/saccharides/` | R4's force-field and file checks |
| 2 | `find solutions/hmr+fast+6/<sacch>/<seq> -maxdepth 2` of one finished system | R3a's names, R6's continue/skip |
| 3 | One small system's `{seq}.pdb`, `{seq}.gro`, `{carb}.gro`, `pre.gro`, `01.conf.gro`, `{seq}.top` (as built, and after HMR), `{carb}-ADD.itp`, `index.ndx` | golden `mergeGro`, `carbGroup`, `topologyText`, `moleculetype` |
| 4 | Your seven `inputs/*.mdp` | R4's view; whether `hmr_multi.mdp` suits methods without hmr (question 24) |
| 5 | `ls` of a `7.awh/` after `gmx awh -o 7.awh.xvg` | the output name (`7_t2e+06.xvg`?) |
| 6 | Real `mdrun -v` progress lines (a minute of an NVT run, as gmx prints them, not through the notebook's bar) | R5c |
| 7 | `insert-molecules` output | glucose (N11) |
| 8 | `python -c "import pymol, gromologist; print(pymol.__version__)"` and gromologist's version, on the machine that builds | R5b |
| 9 | One `8.pull/pullx.xvg` (or its first 200 lines) | R6 `walkerFrames`, R9 pull report |
| 10 | Which file your vault holds for a system's PMF (`7.awh`'s, or each walker's) | question 12 |
| 11 | `gmx pdb2gmx -ff charmm36s-jul2022-prosECCo75 -water none -ter -ignh …` run once from a system folder with `GMXLIB` set to `ff/` | question 22 (whether option A gives the same topology) |

No `qq submit` sample needed: the older notebook already holds one (question 6).

---

## 7. Writes and programs, all of them

| | Today | After batch 4 (as cut) | After batch 5 |
|---|---|---|---|
| **Writes** | job outputs (free names), the state folder, `_inbox/`, `<vault>/gmx-cypher/` | + `<state>/builds/<id>.json` (build plans) | + system trees under `{base}/solutions/`, `{base}/scripts/…`, `{base}/logs/build_summary_<date>.log`, `failed/` folders (moves), `<state>/builds/jobs/`; files replaced only inside a system folder this build created, after it wrote them |
| **Programs** | gmx (analysis tools), `qq jobs -e/-a`, `gmx-eta -a` | none new (unless question 5 adds the python import check) | gmx `pdb2gmx editconf trjconv solvate genion make_ndx grompp mdrun energy awh` (+ `insert-molecules`); python with two shipped scripts |
| **Deletes** | none | none | none (scratch outputs in `mkdtemp` folders, as `awh.ts` does) |

The README's *Safety* section is rewritten in the batch that adds the writes (batch 5), not before.

---

## 8. Size, order and the cut

**Estimate:** about **4,400 lines of code** and **3,800 lines of tests** (≈ 550 tests) for all ten requests, against batch 2's 3,700 lines. Two batches, as you thought:

| | Requests | Code | Tests |
|---|---|---|---|
| **Batch 4** | R1, R2, R3 (with the qq script text), R4, R8a, R8b | ≈ 2,240 | ≈ 1,720 (≈ 250 tests) |
| **Batch 5** | R5, R6, R7 (writing and the tab), R8c–e, R9, R10 | ≈ 2,180 | ≈ 2,110 |

Batch 4 ends with SymBuilder complete as a planner: every command of every system shown and golden-tested, the files checked, the Matrix's landing checked, nothing run, nothing written outside gmx-cypher's own state folder. Batch 5 runs it.

**Two changes to the spec's order:**
1. The qq script **text** (R7a's renderer, a pure function) moves into R3b, so the build view shows a cluster step's script and the golden tests against the notebook's three scripts come with the other planners. Writing the scripts stays in R7a.
2. The page icon (question 32) goes into R1b, so every later Playwright check runs here.

---

## 9. Questions

Numbers 1–21 are the spec's §7 with my recommendation (the spec's unless I say otherwise); 22 onwards are new. Each has options and a recommendation.

1. **The word *analysis*.** (a) Amend the contract: the tab is *analysis*, the step stays *command*, the Matrix's sense stays in charts and sends; (b) another tab name. *Recommendation: (a).* `contract.ts` needs no change for it.
2. **SymBuilder's words** (system, build, stage, step, build plan, build record, repeat). *Recommendation: approve them and the rewording in §4.2* (24 phrases, not 21; *job* for qq's own jobs only as "qq job").
3. **Settings.** *Recommendation: in the settings dialog: python, the base folder, the wait (10 s / 10 min), builds at a time. In the build plan: force field, the methods' switches, charges and ions, salt and water molarity, box, saccharide shift, walker distances, maxwarn and strict mode* (each changes what is built, so a plan carries it; question 35).
4. **Where the boards go.** *Recommendation: as in §4.1 and the screenshots, with one change: Files and MDP are one view, files* (both are "what a build reads"; 5 views instead of 6); Warnings as status lines and the summary's per-stage counts, never stopping a build.
5. **Programs and writes.** *Recommendation: yes, each from a fixed list (§7), with the rule "a build may replace only what it wrote itself, in a system folder it created; nothing else is changed, moved or deleted", recorded per file.* Also: may settings run `python -I -c "import pymol, gromologist"` (fixed arguments) to say whether the python can build? *Recommendation: yes.*
6. **`qq submit`.** *Recommendation: no; write the script, keep it if it exists, print the submit line.* (The older notebook shows you submitting from cells; a sample is there if you want it later.)
7. **Python scripts as tiles.** *Recommendation: backlog.*
8. **The build record.** *Recommendation: `<system>/build.json`, `format: "gmx-cypher build"`, version 1, written at the start and completed with `.part` + rename (a rename over a file the build wrote itself); a newer version is read as "made by a newer gmx-cypher" and never rewritten.*
9. **Saved build plans.** *Recommendation: `<state>/builds/<id>.json`, exported and imported as JSON like recipes.*
10. **Running here.** *Recommendation: one system at a time; a setting for more; mdrun flags (`-ntomp`, `-nb gpu` …) in the build plan, none by default (as the notebook's local runs).* The notebook's saved output shows `gmx_mpi mdrun` running locally without `mpirun` ("Using 1 MPI process"), so T4's caveat doesn't block you.
11. **Files the notebook overwrites or deletes.** *Recommendation: question 5's rule for the four replacements; the charge check in a temporary folder; dated summaries only, no `_latest`.*
12. **Which PMF goes to the Matrix.** I can't answer this from the code; sample 10. *No recommendation until I know what your vault holds.*
13. **File names in the vault.** *Recommendation: the project's name pattern, checked with `parseName`* (with the default pattern: `hmr+fast+6_o111_aaaaaaaa_t2e+06.xvg`).
14. **Temperature.** The Matrix already has `{temp}` in names. (a) Put `{temp}` in the sent name when the project's pattern has it, else say the temperature at the send; (b) only say it. *Recommendation: (a); no Matrix change needed.*
15. **PMF numbers.** *Recommendation: the Matrix's, by import, said on the summary.* The difference is in the reference only (§2.2).
16. **Repeats as row groups.** *Recommendation: keep row groups* (`hmr+fast+6r` is a group in your vault already); confirm.
17. **`matrix/` read-only.** *Recommendation: yes.*
18. **home and qq.** *Recommendation: no qq reads from home; the cluster tab's last read lifted into the page (lost on reload).*
19. **The notebook in the repository.** *Recommendation: outside*; quoted here with paths removed.
20. **Library mdp templates.** *Recommendation changed: leave them out unless you give me the templates.* The mock-up's 14 are sample text; shipping them would mean gmx-cypher inventing simulation parameters.
21. **The cut.** *Recommendation: as §8* (batch 4: R1–R4, R8a–b and the qq text; batch 5: the rest).
22. **pdb2gmx: where it runs and how it finds the force field.** (a) In the system folder with `-ff charmm36s-jul2022-prosECCo75 -water none` and `GMXLIB={base}/ff`, stdin only the termini (`0\n0\n`): nothing written in `ff/`, the force field chosen by name, not by menu number; (b) as the notebook: `{seq}.gro` copied into `ff/`, run inside `ff/` with `1 8 0 0`. *Recommendation: (a), after sample 11 shows the same topology; until then the golden test holds (b)'s argv and (a)'s difference is a recorded decision.* Also: termini per sequence (the mock-up's "mmmmmmmm: 1 8 1 1")? *Recommendation: one default, a per-sequence override in the plan.*
23. **The shared files in `ff/`.** The notebook writes `ff/{seq}.itp` (and `ff/{method}/{seq}/Protein.itp`, `ff/{method}/{carb}/{seq}/CARB.itp`), shared by systems and overwritten by each build (N2, N3). (a) Keep them in the system folder (`{seq}.itp`, `Protein.itp`, `CARB.itp`) and include them from there: each system self-contained, `ff/` never written; (b) as the notebook, under free names. *Recommendation: (a).* It changes the topology's include lines, not a number.
24. **mdp files per method.** The notebook uses `awh_hmr.mdp` for hmr methods but `hmr_multi.mdp` for every method's walkers and one `pull.mdp` for all (N4). (a) A per-method table, defaulting to the notebook's choices; (b) the notebook's choices fixed. *Recommendation: (a)*, and tell me what a method without hmr should use for walkers.
25. **The pull and LUMI scripts** (N9, N10). (a) Golden as the notebook writes them; (b) the pull script resubmits like awh (`job-type continuous`, until `8.pull.gro`), LUMI's `ncpus` matched to `-ntomp`. *Recommendation: (b), each a recorded difference.*
26. **The running count.** The spec says "the header keeps it"; today it is on the results trigger. (a) Each tab's trigger shows its own: analysis "N running" or its job count, symbuilder "N building"; (b) one count in the header for both. *Recommendation: (a)* (as the screenshots).
27. **`#analysis`.** Today it opens set-up's command step. (a) Keep that (every old address opens the same view); the analysis tab has no address of its own, its views keep theirs; (b) make it the tab, where it was left. *Recommendation: (a).*
28. **The second level's look.** (a) A second line of tabs under the first, coral underline, in every tab with views (screenshots); (b) analysis's in the same row as set-up's steps. *Recommendation: (a), one rule in all tabs.*
29. **Compare's place.** (a) Inside results, as today (picking two or more opens it); (b) a third entry, *compare*, in analysis's second level. *Recommendation: (a).*
30. **Build steps and the results list.** (a) A second `Jobs` folder for build steps, shown only in symbuilder · progress; (b) in analysis's results with a filter. *Recommendation: (a)*: about 20 steps per system would bury your analyses.
31. **GROMACS backups** (`#aaaaaaaa.top.1#` from solvate and genion). (a) Keep them (gmx's default, as the notebook), listed in the build record; (b) `GMX_MAXBACKUP=-1`, none made. *Recommendation: (a).*
32. **The page icon.** (a) Add a tiny inline icon in R1b so the installed Chromium stops logging a 404 and e2e passes here; (b) leave it and pin a browser. *Recommendation: (a)*; one line in `index.html`.
33. **The mock-up's personal path.** I replaced the one storage path with your user name in `Settings.dc.html` by `/storage/<cluster>/<you>/…` in the committed copy (gmx-cypher's repository is public). *Recommendation: keep it replaced.* The zip you gave me is untouched.
34. **Building from the cluster's login node.** The saved output shows your local mdrun on a GPU node ("1 GPU selected", 24 OpenMP threads). Will gmx-cypher run where the builds run (an interactive node, reached through the SSH tunnel), or on a machine without GROMACS that only plans? *No recommendation; it decides whether "here" in R5 means a GPU.*
35. **Strict mode and maxwarn.** *Recommendation: both in the build plan* (they decide what passes), maxwarn 6 by default, strict off (as the notebook).
36. **A walker whose target the pull never reached.** (a) Warn and use the nearest frame (the notebook; two walkers may share a frame); (b) refuse that walker. *Recommendation: (a)*, with the frame and its distance shown per walker.
37. **Rows named differently from their sequence** (§2.2). A built system's PMF would create a new row. (a) R8b flags it in the preview and says to add `{name}` to the folder pattern or rename the row; (b) gmx-cypher names sent files with the row's name. *Recommendation: (a)* now; (b) needs a name in the folder or a lookup the Matrix doesn't do.
38. **The mock-up's look, app-wide or in SymBuilder only.** Your decision for the mock-up's design changes three contract rules: UI state becomes coral, not ink (§2, T159); status shows as a dot and a word in the tones, not an icon and a word in ink (§4); tones are used for status and for tile categories, not only for groups (§2). (a) App-wide: R1a amends the contract and `roles.json` once, and analysis, results and compare take the coral accent too (their charts keep the group tones); (b) SymBuilder, home and the cluster tab only. *Recommendation: (a)*, because the spec asks for one app, and the screenshots already show the tab bar and set-up with coral. The contrast and "never colour alone" rules stay, and their tests are extended to the new pairs.
39. **Morpheus's tokens.** gmx-cypher's verbatim copy (`src/tokens.json`) is older than the design system the mock-up uses: coral `#ffb09c` → `#ff5429`, coral-soft and coral-strong changed, and the heat scale. (a) Update the copy in R1a, checking the group-tone and destructive-distance tests (coral is the first group tone, so every coral curve in analysis changes too); (b) keep the old copy. *Recommendation: (a)*, because the mock-up's look depends on it.
40. **Failed walkers: rebuilt automatically?** Your cell prepares all the walkers, then calls `retry_failed_walkers()` once, then reports. (a) The same, automatically, once, as the last part of the walker step, each rebuilt walker recorded with its donor and the distance it now starts at; a button for another try; (b) only on a button (the mock-up's *rebuild from the nearest walker*). *Recommendation: (a)*, as your notebook does it. It moves the failed walker's folder (question 5's rule: only folders this build made), and the rebuilt walker starts at its donor's distance, which progress and the summary say.

