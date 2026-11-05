# Batch 5 — report

SymBuilder builds now. From the build plan and systems planned in batch 4, a build runs here, one system at a time,
in your base folder: the solution builder, minimisation, nvt and npt here, then awh, the pull and the walkers prepared
with their qq scripts and submit lines (submitted for you only with the setting on). Failures stop a system with
GROMACS's own text, can be resumed or rebuilt (nothing deleted, folders moved to `failed/`), and the walkers are
rebuilt once from the nearest working walker, as your notebook does. The reports are the notebook's, text for text.
A built system goes to analysis's batch set-up in one press. The two follow-ups you asked for after batch 4 (the
second line of tabs as a bar) and one found on the way (the theme race) are in too.

**R8c and R8d came after your answer to question 12** (§9): the PMF is the multiwalker one, so the landing check, the
summary's *PMF in set-up* and its numbers all follow walker 1's energy file. Your force field and mdp files brought
two more checks (§9): pdb2gmx's answers against the force field's own menus, and the time step of methods without hmr.

Same branch, `cypher-batch-4`, after `bc34ce5` (batch 4's end). `matrix/` is unchanged.

## 1. Summary

Lines from `git show --numstat` (code: `src/`, `server/`, `index.html`; tests: `test/`, `e2e/`, fixtures included).
Vitest is the check run before each commit (lint, build and every test; each commit passed it).

| Item | Commit | Code +/− | Tests +/− | Vitest | Decisions |
|---|---|---|---|---|---|
| batch 4's end | `bc34ce5` | | | 1284 passed, 1 skipped | |
| the second line of tabs as a bar | `73505d0` | +14/−8 | 0 | 1284 | T226 |
| the theme before the first render (the axe flake; the backlog's chart race) | `af1c154` | +6/−0 | 0 | 1284 | |
| R5a folders, the writing rule, the build record | `2957e6a` | +392/−6 | +244/−0 | 1293 | T205, T208 |
| R5b the steps, fakes from real output, shipped python | `d1014d7` | +122/−7 | +1644/−0 (≈ 1,300 of it the notebook's real output as fixtures) | 1296 | T205, T211 |
| R5c from the page, progress, waiting, cancel | `8825918` | +232/−25 | +156/−14 | 1302 | T203, T210, T217 |
| R6 failures, retries, repeats, resume | `fae2f10` | +198/−29 | +347/−5 | 1318 | T219 |
| R7a qq profiles, submit when set | `f0935ad` | +80/−9 | +51/−2 | 1324 | T206, T213 |
| R7b the cluster tab's scripts, systems among jobs | `b7c3209` | +163/−14 | +60/−1 | 1335 | T204 |
| R8c, R8d PMFs into the vault, their numbers | `46d8edb` (after `ced1c87`, R8b to the multiwalker PMF) | +151/−15 | +117/−6 | 1365 | T228, T229 |
| R9 reports | `2c6dfaa` | +326/−5 | +199/−5 | 1344 | |
| R10 from a built system to analysis | `51f7fe1` | +34/−7 | +28/−1 | 1349 | |
| review's fixes | `ef7b89c` | +130/−45 | +159/−7 | 1359 | T227 |
| R8b the landing check follows the multiwalker PMF | `ced1c87` | +61/−104 | +59/−73 | 1360 | T228 |
| R4 pdb2gmx's answers against the force field; the time step without hmr | `dcd8253` | +262/−18 | +319/−5 | 1379 | T230, T231 |

In all, `src server index.html`: 30 files, +1,518/−61; `test e2e`: 50 files, +2,705/−4. Playwright: 17 → 18 (one
new spec: build a system from the page, follow it, read its summary, take it to analysis), all passing.

## 2. Each request

### R5a Folders, the writing rule, the build record
`server/build-run.ts`. A system's folder is created by the build, exclusively; a step writes only a file that does not
exist and replaces only one this build wrote; nothing is written outside the system's folder, `scripts/` (qq scripts,
kept if there) and `logs/` (R9). Every file written or replaced is in `<system>/build.json` (format `gmx-cypher build`,
version 1) with its size and SHA-256, GROMACS's own backups (`#name.N#`) included. GROMACS's fatal text stops a system
whatever the exit code (`src/lib/build/fatal.ts`, the notebook's `check_fatal`, each ERROR block quoted whole where the
notebook cut at 400 characters); strict mode stops on any non-zero exit; a missing output stops it (`require`).

### R5b The steps
Each gmx and python step is a job of the build's own list (`<state>/builds/jobs/`, T217), without a shell. The ions come
from grompp's net charge and the waters (`ionCounts`); the write steps compute their text with batch 4's golden
functions. `server/python/build_peptide.py` (PyMOL) and `hmr.py` (gromologist) port the notebook's functions; nothing
in `ff/` is written (T205, T211). **Fakes:** the fake gmx's build tools and a fake python print the notebook's real
output of its build of hmr+fast+6/o111/hhhhhhhh (`test/fixtures/build/notebook/tools/`, paths, user and host replaced)
and write files copied from real fixtures where one fits, otherwise of the right shape and marked fake. One system
built end to end: the notebook's folder tree, 30 NA_s and 30 CL_2s, nothing else written, every file hashed.

### R5c From the page, progress, waiting, cancel
`POST /api/build/start` (one build at a time), the runs and their events, cancel (the running step's process group and
every later system), a step's log. symbuilder · systems' button builds or says why it can't; progress shows each
system's step of all, what the running step prints, the submit lines of systems that wait for the cluster. The wait for
mdrun's `.gro` is a setting (10 s, up to 10 min). mdrun's own progress bar came with sample 6 (§9).

### R6 Failures, retries, repeats, resume
`src/lib/build/retry.ts`. Resume continues a failed system in its folder at the first step its record does not have as
done (nothing before rewritten); rebuild moves the folder to `<method>/<saccharide>/failed/<sequence>_<stamp>/` with
`FAILED.txt` first. A folder that exists is continued if a gmx-cypher build made it, else left; skipped; or built
beside as the next free repeat. The hint for the pull's two real box errors (the notebook's own pattern misses the AWH
one). A walker that fails keeps the others going, then is moved to `9.multiwalker/failed/<n>_<stamp>/` and prepared
again once from the nearest working walker's start, its donor recorded (T219).

### R7a, R7b The cluster
Each stage's qq profile in settings (the notebook's: MetaCentrum 2025.4 for min to pull, LUMI for the walkers); a
profile whose gmx can't run `-multidir` is refused for the walkers. *Submit them for me*, off by default: on, a build
runs `qq submit -q <queue> <script>` in the step's folder (the fake qq answers with the older notebook's real output).
The cluster tab: jobs and scripts; a qq job whose input folder ends in a system's step folder is shown as that system's;
when its pull ended, *go on: prepare the walkers* continues it, only on the press.

### R9 Reports
`src/lib/build/report.ts`, golden against the notebook's saved text: its build summary of 42 systems (written again from
their values, character for character), a pull report, a walker report, its termini check of 16 systems with the two
prolines' PRO-NH2+. A build counts GROMACS's WARNING and NOTE lines per stage as the notebook does, so the fake build of
hhhhhhhh gives the notebook's own row: `SB 7 MIN 4 NVT 4 NPT 4 AWH 4 PULL 3`. Each build writes its summary once to
`<base>/logs/build_summary_<stamp>.log`; symbuilder · summary shows all four reports.

### R10 From a built system to analysis
The summary's *analyse the walkers in set-up* (or *awh*) opens set-up's batch mode through the cluster tab's offer, now
with a path template: the build's `solutions/` and `{method}/{column}/{seq}/9.multiwalker/{run}/9.multiwalker.xtc`, the
Matrix's folder-pattern tokens. The batch's `matchTrajectory` reads the built tree with it. Nothing runs before run.

### R8c, R8d, R8e
Built after question 12 (§9). R8e (the vault stays the Matrix's) holds: the PMF goes to the vault only by the AWH
result's own send, into the project's `_inbox/`.

## 3. Real text, and what is still missing

Used, from the notebook's saved output (paths, user and host replaced): every build tool's output for one system
(pdb2gmx, trjconv, editconf, solvate, grompp ×8, genion, mdrun ×3, make_ndx ×2, energy, gromologist), a walker's start
frame and grompp, both fatal errors, the summary, pull, walker and termini reports; `qq submit`'s answer and its error
from the older notebook. **Still needed** (Phase 0 §6): sample 3 (one system's files, for a real termini check and the
topology's moleculetype), 4 (your mdp files), 5 (`gmx awh`'s output names), 6 (`mdrun -v` lines), 7
(`insert-molecules`, for glucose, which stays off), 8 (PyMOL and gromologist on the building machine), 10 (question 12),
11 (pdb2gmx from `ff/`).

## 4. Tests

- **Vitest:** 1284 → 1349 passed (1 skipped). New: `build-run`, `build-fatal`, `build-system`, `build-api`,
  `build-retry`, `build-resume`, `build-jobs`, `build-report`, `build-analyse`; extended: `symbuilder-views`,
  `build-text`, `route`.
- **Playwright:** 18 passing, with `e2e/build.spec.ts` (a build from the page to analysis; axe on progress and summary).
- **With real tools:** none: no GROMACS build tools, PyMOL or gromologist here. **Manual check not run:** one system of
  yours end to end on a machine with them (and question 34: whether that machine is a GPU node).

## 5. Writes and programs (as the README now says)

- **Writes:** a system's folder (created by the build) and everything in it; `<base>/scripts/<stage>/…sh` (created only
  where none is); `<base>/logs/build_summary_<stamp>.log` (new each build); `~/.gmx-cypher/builds/runs/` and
  `builds/jobs/`. **Moves** (never deletes): a rebuilt system's folder to `failed/`, a failed walker's to
  `9.multiwalker/failed/`.
- **Programs:** the configured gmx (`pdb2gmx editconf trjconv solvate genion make_ndx grompp mdrun energy`), the
  configured python with the two shipped scripts, and `qq submit` only with *submit them for me* on.

## 6. Screenshots

`docs/img/batch-4/`: `subtabs-*` (the bar), `r5c-progress-*`, `r7b-scripts-*`, `r9-summary-*`, each 1280 and 1024,
light and dark, from the real app after a build with the fakes.

## 7. Review

A fresh-context agent reviewed `af1c154..51f7fe1` with only the code, and reproduced each finding with a probe. All
were fixed, each with a test written first (`test/build-review5.test.ts` and the updated ones; decision T227):

| # | Finding | Fixed |
|---|---|---|
| 1 | **The server's builder never saw a settings change**: main.ts gave it a copy of the context the API changes, so gmx set after the start, *submit them for me* turned off, python, profiles, the queue and the wait were the start's | the builder is made on the very context the API changes (`withBuilds`), and reads the wait each time |
| 2 | **A resume was refused after a real failure**: grompp writes its mdout before failing, a stopped mdrun leaves its log, and the rule refused to write over files it had not recorded | what a step changed before it failed or was stopped is recorded as this build's, so a resume writes over it (GROMACS backs it up); a refused step changed nothing. The fakes now write those files too |
| 3 | **awh's script was submitted before its run input existed** (the script step came before make_ndx and grompp) | awh's script now follows its grompp, as the pull's and the walkers' do |
| 4 | **A missing trajectory sent a resume back a stage, which then failed on its own qq script copy** | a missing trajectory or checkpoint is no reason to run again; a step run again writes over its own copies and texts |
| 5 | **A malformed build.json crashed the server** (an unhandled rejection) | the record is checked whole before it is used; a system's unexpected error fails that system, never the server |
| 6 | **A link in the base folder led writes out of it** (`solutions/`, `scripts/`, `logs/`) | nothing is written or moved through a link: each path from the base folder is checked, and the system says which link |
| 7 | **A tampered build.json could make a rebuild move a folder anywhere** (a sequence with `../`) | the record's plan, names and folder are checked; one that fails is not gmx-cypher's |
| 8 | **A retry of an old build moved a system a later build had built again** | retry and go-on only from the build that last made the system |
| 9 | **A continued system lost its earlier notes and submit lines** (the pull report's charge went blank) | they are kept, and the submit lines once each |
| 10 | **The walkers' frames were read once, even from an empty pullx.xvg** (`-dump undefined`), and never again | read each time the walkers' stage is reached; an empty pull waits |
| 11 | A cancel during a walker's rebuild was reported as a failure | it is a cancel |
| 12 | The shipped scripts' folder was a URL's path, percent-encoded with a space in it | a file path |
| — | React: the summary did not refresh while building; cluster scripts fixed a profile before the settings loaded; a step's log could lose a chunk read meanwhile; notes keyed by text | each fixed: the summary reads again as systems change, the profile follows settings until picked, the log keeps where it ends, notes keyed by place |
| — | Tests: the cancel test passed even if the kill did nothing; the fakes wrote nothing on failure | the cancel must end the build within 8 s (mdrun sleeps 20 s); the fakes leave what real tools leave |

Checked and sound: no program through a shell, names from the page checked, qq scripts and logs created exclusively,
one build at a time (409), interrupted runs marked on restart, the ordinary walker rebuild.

## 8. History

```
51f7fe1 R10: from a built system to analysis
2c6dfaa R9: SymBuilder's reports, as the notebook prints them
b7c3209 R7b: the cluster tab's scripts, and a build's systems among its jobs
f0935ad R7a: qq profiles by stage, and submitting when the setting says so
fae2f10 R6: failures, retries, repeats and resume
8825918 R5c: build from the page, follow it on progress, cancel it
d1014d7 R5b: the steps run, with fake tools answering with the notebook's own build
2957e6a R5a: a build's folders, the writing rule and the build record
af1c154 The page's theme before the first render: no light-to-dark transition, no light chart
73505d0 The second line of tabs as a bar: a rounded track, the current view a filled pill
```

## 9. After your answers (questions 12 and 34, your force field and mdp files)

- **Question 12: the multiwalker PMF.** The walkers share one bias (`awh-share-multisim = yes` in your
  `awh_multi.mdp`), so `gmx awh` on walker 1's energy file gives it; 7.awh is prepared, not run. **R8b** now checks
  where that one PMF per system would land, from `9.multiwalker/1`, instead of 7.awh and each walker as runs (T228).
  **R8c**: once the walkers ran, the summary's *PMF in set-up* fills set-up's AWH command with walker 1's
  `9.multiwalker.edr` and `.tpr` (offered only inside the allowed folders); its result is sent as every AWH result.
  **R8d**: the summary shows the newest PMF's minimum, where it is and its area. They come from the Matrix's own
  `transformXY`, `runStats` and `wellArea` (a test checks them against its `curveStats`), at walker 1's `ref_t`, and
  the file is checked against its job's SHA-256 (T229). The e2e build test goes from the built system to set-up, runs
  the job and reads the numbers back in the summary.
- **Question 34: the building machine has a GPU.** Recorded (T228); the local mdrun steps take no GPU flags unless
  the build plan's mdrun flags say so (T210).
- **Your force field: pdb2gmx's menus** (T230). GROMACS's `filter_ter` is ported; on your `.tdb` files it gives your
  notebook's HIS menus entry for entry. MET's menus start with the ethers' MET1 and MET2, so the plan's `1 8 0 0`
  would cap a methionine with a methyl group. Such a sequence now stops the build, and files offers `1 8 1 1` in one
  press. GLY and PRO keep `1 8 0 0` (GLY-NH3+, PRO-NH2+), as your termini check showed. Only the block names are in
  the repository.
- **Your mdp files** (T231). `pull.mdp` and `awh_multi.mdp` set `dt = 0.004`. A method without hmr would run them at
  4 fs, and the pull and the walkers have one mdp for every method, so that is now flagged (not stopped). The upload
  has `awh.mdp` and `awh_multi.mdp` but no `awh_hmr.mdp` or `hmr_multi.mdp`. Your notebook's run used those two (its
  grompp warnings name them), so the plan keeps them. If your `inputs/` is the upload, set the walkers' mdp to
  `awh_multi.mdp` and hmr's awh to `awh.mdp` in build (files will say what is missing). The mdp files are not in the
  repository.
- **Sample 6: `mdrun -v`** (T232). Your minimisation's terminal output is a fixture now (582 steps, the `\r` of each
  rejected step kept; paths replaced). Progress shows mdrun's own bar for the running mdrun step, read as your
  notebook's run_live reads it: the output split at `\r` as well as `\n`, the total from `Number of steps = 5000` or
  `125000 steps,`, each step from `Step= N,` or `step N, remaining wall clock time: S s`. A minimisation also shows its
  largest force against the tolerance, and says when it converged. The server sends mdrun's head with each step's log,
  so a page opened mid-run still knows the total. The log shows each line as a terminal would. nvt's and npt's lines
  are tested as GROMACS prints them; no sample of them was needed beyond your notebook's patterns.
- **Your `gggggggg.itp`** (T233). Its position-restraint include led nowhere: pdb2gmx writes it from `ff/`, where it
  runs, and gmx-cypher writes the `.itp` into the system's folder, not into `ff/` as your notebook does. With your
  `-DPOSRES`, grompp before the salt stopped there. It now reads `./{sequence}_restraints.itp`. A system built before
  is corrected in place when you resume it (*resume at the step that stopped*). The fake grompp now follows every
  include, so a test fails if one leads nowhere.
- **Still waiting**: samples 3, 5, 7 and 8, as before.
- **Tests**: Vitest 1359 → 1390 passed (1 skipped); Playwright 18, all passing.
