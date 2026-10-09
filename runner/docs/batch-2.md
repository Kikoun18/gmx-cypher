# Task: Cypher batch 2 — more GROMACS commands, cluster jobs, faster atom picking and the PBC box

**Cypher** is my GUI for running and analysing GROMACS trajectories. It was built from the first runner spec, with RDF and hand-picked atom groups. It hands results to **PMF Sequences** (`app/`), my visualisation tool, without changing it. Both follow my design system **Morpheus**.

This batch makes ten requested changes:

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | Atom names as lists (`OH1, OH2 OH3 and OH4`); Shift+Enter starts the next one; a click that takes every atom of that name (Ctrl+click asked; Alt+click exists) | picking | 8 |
| R2 | The periodic (PBC) box in the 3D view | viewer | 9 |
| R3 | One definition per GROMACS command, with RDF moved into it unchanged | foundation | 10 |
| R4 | `gmx energy` | command | 11 |
| R5 | `gmx awh` | command | 12 |
| R6 | `gmx wham` | command | 13 |
| R7 | `gmx distance` | command | 14 |
| R8 | `gmx hbond` | command | 15 |
| R9 | Further commands, chosen with me in Phase 0 | command | 16 |
| R10 | My cluster jobs: `qq jobs` together with `gmx-eta -a` | cluster | 17 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

**About what this spec knows:**
- What it says about Cypher marked **verified** was checked against Cypher's code at the end of its first spec (`runner/`, after its final report). Phase 0 confirms it; if the code has changed since, say so.
- What it says about PMF Sequences was **verified** by running PMF Sequences' own code on real GROMACS files, at the state after its batch 2, and again through Cypher's own landing preview (`landing()`).
- What it says about qq and `gmx-eta` is **documented** in the qq manual v0.13. The `qq jobs` options, the Slurm note and `qq kill` were checked against the published manual; the `gmx-eta` details and the name of qq's table config section were not found there. All of it must be checked against real output from my cluster.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `app/` (PMF Sequences), `runner/` (Cypher: its package is `gmx-cypher`, its state folder `~/.gmx-cypher`; renaming the folder is not part of this batch), and `README.md`, `chats/` and `project/` from the original design handoff.
  - **`app/` is read-only:** import from it, never change it.
  - `README.md`, `chats/` and `project/` are history: don't follow the root `README.md`'s instructions, and don't change them. (Morpheus's own `project/README.md` is a different file, in the Morpheus artifact: section 1.2.)
- **Every path in this spec is relative to the git root.**
- Work on a new branch, `cypher-batch-2`, from the current HEAD. Record that commit's hash in the Phase 0 report as the baseline.
- Baseline at the end of Cypher's first spec (`runner/docs/report.md`):
  - Cypher: 273 Vitest tests pass and 1 is skipped without `GMX` (14 real-`gmx` tests run with it); the Playwright smoke test (`npm run e2e`) passes;
  - `app/`: 390 tests pass.
- **`app/` stays unchanged at every commit.** `runner/scripts/app-unchanged.mjs`, run first by `npm test`, compares `app/` with `e8a452c`, hard-coded there. If `app/` has changed since that commit (a later PMF Sequences batch), stop and ask before moving that baseline.

### 0.2 Living documents (in `runner/docs/`)

- Save this spec as `batch-2.md`.
- Add a **Batch 2** section to `roadmap.md` with the checklist in section 5. Keep the existing backlog; move items into or out of it as this batch changes them.
- Continue `decisions.md` from **T90**, each decision with a one-line rationale.
- Save the Phase 0 report as `batch-2-phase0.md`.
- Finish with `batch-2-report.md` (section 22).

### 0.3 Phase 0: Investigate and plan (no code changes)

Scratch scripts and throwaway tests are fine, but keep them outside the repository or delete them. Only the Phase 0 documents are committed.

1. **What exists.**
   - Read Cypher's docs (spec, roadmap, decisions, report) and its code.
   - Record the baseline: lint, build and test results for Cypher and for `app/`. If anything fails, stop and tell me.
   - Describe, with file references: how RDF is defined, built, run and recorded; how groups are picked and stored; which keys and clicks the 3D view already uses; how outputs are named and sent to the vault; Cypher's own file formats (recipe, run record, config) and what reads them; and where Cypher runs.
2. **Ask me, in one list, about the cluster:**
   - Where do `qq` and `gmx-eta` run, compared with Cypher? On the same machine, or through SSH, and is a Kerberos ticket (`kinit`) needed?
   - Which batch servers do I use (the default, `sokar`, others)?
   - Should Cypher only **watch** jobs, or also **kill** them, or also **submit** them? (Recommendation: watch and kill now; submit later.)
3. **Ask me for real samples, and don't build a parser without one:**
   - `qq jobs --yaml`, `qq jobs -a --yaml`, `qq jobs -e`;
   - `gmx-eta -a`, with jobs in several states (running, queued, finished, a job without `mdrun -v`);
   - `gmx energy`'s term menu for one of my `.edr` files;
   - `gmx <tool> -h` for each new command, from the GROMACS versions I use (2021.4, 2022.3 and 2025.4 appear in my files; Cypher's fixtures hold `-h` texts of 2023.3 and 2025.4);
   - a small AWH run (`.edr` and `.tpr`);
   - a small umbrella window set for `gmx wham` (the `.tpr` and `pullx`/`pullf` files with their lists);
   - a structure with a triclinic box (for example a rhombic dodecahedron), for R2.
4. **For each request R1–R10**, write:
   - **Current behaviour.** In Cypher (R1–R3, R10) or in GROMACS and qq (R4–R10). Verify it by reading the code, and where practical by running it. If this spec is wrong about it, say so.
   - **Proposed change.** The smallest change that meets the requirements, with every file you will touch.
   - **Code budget.** Estimated lines added and removed.
   - **Writes.** Every new place on disk Cypher would write to.
   - **Tests.** By name.
   - **Risks.** Including interactions with the other requests.
   - **Open questions.** Each with options and your recommendation.
5. **R9 shortlist.** Propose which further commands are worth adding (section 16), with one line each on what I'd get. I choose.
6. **Batches.** Say whether the new commands should also run in batches (one recipe over many folders by path template). AWH over every walker folder is the obvious case. Batches are RDF-only today. Ask me.
7. **Show me before building.** Send Morpheus screenshots, light and dark, of:
   - the atom-name field with a list;
   - the PBC box;
   - the command picker;
   - `gmx energy`'s term picker;
   - the `gmx wham` window list with its overlap check;
   - the cluster jobs table.
8. **Order.** Confirm the roadmap in section 5, or propose a better one with reasons.
9. Put all open questions into **one numbered list** at the end of the Phase 0 report.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–6: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them and see them fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.** Simplify it, delete anything that became dead, match the naming of the code around it, and remove debug output.
5. Run lint, build and tests in Cypher and in `app/`, plus the empty-`app/`-diff check.
6. Run the item's manual checks in Chrome and watch the console. Take a screenshot of every visual check.
   - Headless Chromium draws WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
   - Anything you can't run (a real `gmx` or `qq`, the cluster, a real GPU) is marked **not run** and listed for me. Never report a manual check as passed unless you ran it.
7. Update `roadmap.md` and `decisions.md`.
8. Commit (section 21).
9. Give me a short summary (3–5 lines): what changed, net lines added or removed, tests added, manual checks run or not run (with screenshots), and anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- Cypher would write anywhere new, or send anything to the cluster that isn't a listed read-only command;
- a recipe, run record or config format would change (section 1.5);
- Cypher would kill a job, or run a new command on my real data for the first time: show me the exact command first;
- the code contradicts this spec or the approved plan;
- an item would exceed its code budget by more than about 50 %;
- you want a dependency that isn't already in Cypher;
- a parser or test needs real output you don't have;
- GROMACS or qq behaves differently from what this spec says.

Batch your questions where you can, and give each one options and a recommendation. Don't ask about things the code, the docs or this spec already settle.

---

## 1. Principles

### 1.1 Minimal, concise code

- Make the smallest correct change. Extend what exists before adding something new.
- **Commands are data, not code** (R3). A new command is mostly a definition. Command-specific code exists only where a command really differs:
  - `gmx energy`'s term menu and statistics;
  - `gmx awh`'s time frames;
  - `gmx wham`'s window lists and overlap check;
  - `gmx hbond`'s two versions.
- **Reuse:**
  - PMF Sequences' functions by import, as the first spec says (`parseName`, `parsePath`, `planBatch`, `parseTable`, `parseGmxHeader`, `toPdb`, `safeFileName`, `uniqueName`);
  - Cypher's own builder, runner, run record, templates and landing preview for every command.
  - Curves are coloured the way Cypher already colours them: Morpheus tones and dashes, through its `LineChart`. PMF Sequences' `shade.ts` works on its own hex colours and isn't used here.
- **Every decision lives in a pure function with tests:**
  - list parsing;
  - box geometry;
  - command and stdin building;
  - term and statistics parsing;
  - window overlap;
  - job and ETA parsing and merging.
  Components and the server only call them.
- Delete code that becomes unused. No commented-out code, and no `TODO` without a roadmap entry.

### 1.2 Web development practice

- **Morpheus throughout:** <https://claude.ai/artifact/RFhVLdZ9iBn1TJ9n3ybC3w>. Read Morpheus's own `project/README.md` (in the artifact) again before any new screen.
  - Lowercase controls and one primary action per view.
  - States as words, with status hues: `mint` done, `butter` waiting, `sky` info, `destructive` for errors.
  - Destructive actions armed on the first click and done on the second.
- **Cypher's copies of Morpheus components** live in `runner/src/ui/`, copied unchanged (T47). A component used for the first time (such as `Stat`) is copied the same way, unchanged.
- **Verified: Cypher's `LineChart`** takes per curve a Morpheus tone (8 of them), a dash, a state (on, dim, off) and a max or min marker. It has **no error band** and no free colours. R4 and R6 need errors drawn, so Phase 0 proposes the smallest local addition, and it goes on the backlog as a Morpheus candidate.
- **Morpheus has no table and no multi-select (combobox) component** (verified from its file list). The cluster jobs table and the atom-name menu are built small and semantic (`<table>`, an ARIA combobox) from Morpheus tokens. Note both in the backlog as candidates for Morpheus; don't edit Morpheus.
- **Keyboard:**
  - every new mouse gesture has a keyboard or menu equivalent;
  - shortcuts are shown with Morpheus's `Kbd`;
  - new keys don't fire while typing, except where a field owns them (R1).
- **Platform keys.** On macOS, Ctrl+click opens the context menu, so use ⌘+click there. Detect the platform, and show the right key everywhere.
- **Announcements.** Status, counts ("+ 12 atoms") and refreshes are announced (`aria-live="polite"`).
- **Contrast:** text at least 4.5:1; the box, curves and group colours at least 3:1 against the 3D or plot ground, in both themes.
- No console errors or warnings. The layout works at 1024 px wide.

### 1.3 Running programs safely (unchanged from the first spec, and extended)

- **No shell, ever, for local processes:** an argument array, `shell: false`. Stdin answers (`gmx energy`, legacy tools) are written to the process's stdin, never through `echo … |`.
  - **Verified:** both places that start processes today, `capture()` in `server/gmx.ts` and the job runner in `server/jobs.ts`, start them with stdin ignored. Stdin answers need a small option there, and the job's event log records them.
- **R10 changes two of Cypher's stated guarantees.** `runner/README.md` (*Safety*) says Cypher cannot "run anything but `gmx`" or "reach the network beyond serving its own page".
  - Phase 0 proposes the new wording, and I approve it before any code.
  - One module is the only place that starts `ssh`, `qq` or `gmx-eta`.
- **SSH, if Phase 0 needs it.**
  - The remote command is built only from a **fixed list** (`qq jobs`, `gmx-eta`, `qq kill -y`).
  - Job IDs are checked against a strict pattern, and server names against the list in the config.
  - No free text from the GUI ever reaches the remote shell. Test it with an ID like `1; rm -rf ~`.
  - `BatchMode=yes`, so a missing key or ticket fails with a clear message instead of a prompt. Host keys are checked as usual: never `StrictHostKeyChecking=no`.
- **Cluster etiquette.**
  - Polling is slow (Phase 0 proposes; for example, 60 s while the cluster view is visible, never in the background).
  - Calls are one at a time, with a timeout.
  - The last result is shown with its age ("updated 2 min ago").
- **Killing.** Cypher never kills a job without a second click. It never uses `qq kill --force` unless I agree in Phase 0.
- **Files.** Cypher never deletes or overwrites a file, and writes only where the first spec allows.

### 1.4 Data practice

- **Every choice that changes a number is visible and recorded:**
  - the frames used (`-b`, `-e`, `-dt`), including discarded equilibration;
  - cut-offs and criteria;
  - centre-of-mass or atom positions;
  - units;
  - bootstrap settings;
  - which energy terms.
- **Errors are reported with values** where GROMACS gives them (`gmx energy`'s Err.Est., `gmx wham`'s bootstrap). A mean is never shown without its error when one exists.
- **GROMACS output stays as `gmx` wrote it.** PMF Sequences reads provenance and type from the header.
- **Units are kJ/mol for anything sent to PMF Sequences.** Its PMF correction assumes kJ/mol, so `gmx awh -kt` and `gmx wham -unit kT` are never used for vault outputs without a warning.
- **Atom numbers are GROMACS atom numbers,** as the first spec requires. Names are matched exactly, case-sensitively, as GROMACS does.
- **ETAs and job states are reported as the tools gave them.** Cypher adds derived facts (the finish clock time, against the walltime left) but never invents a state.

### 1.5 Cypher's own files

- **Verified:** recipes and run records are versioned files, `gmx-cypher recipe` v1 and `gmx-cypher run` v1, and both readers refuse any other version.
  - A v1 recipe is RDF only: `analysis: 'rdf'`, RDF's options, and at least a reference and one selection (`recipeFileProblems`).
  - A run record v1 knows only RDF: its outputs are of kind `xvg`, `cn` or `ndx`, its inputs are RDF's input slots, its `recipe` holds RDF's options, and it has no field for stdin answers.
- R1's name lists and R3's commands change both formats. So:
  - bump each to v2, read v1 as before, and refuse newer versions with a clear message, as today;
  - before the first change, generate with the unchanged code a v1 recipe and a v1 run record (from an RDF run on the test system), commit them under `runner/test/fixtures/formats/`, and never regenerate them;
  - test that each loads, and that "run again" and batches still work from them;
  - record every format change as a decision, with an example before and after.

---

## 2. Scope limits

- `app/` stays unchanged.
- No job **submission** (`qq submit`) unless Phase 0 agrees otherwise.
- No trajectory processing (`trjconv`) unless I pick it in R9.
- No undo/redo.
- The backlog from Cypher's first spec stays out unless an item touches the same lines. In that case, say so and ask.
- Bugs you find along the way go into the backlog, not into the code.

---

## 3. The PMF Sequences contract for the new outputs

**Verified** by running PMF Sequences' `detectAna` on real GROMACS files from `app/test/fixtures/`, and again through Cypher's own `landing()` (`runner/src/lib/landing.ts`), which runs PMF Sequences' `planBatch`. A sent output keeps its GROMACS header, and this is the type PMF Sequences gives it:

| Real file | Tool | Header title | PMF Sequences type |
|---|---|---|---|
| `hmrfast6_ha_a_t200000.xvg` | `gmx awh` 2025.4 | `AWH` | **PMF** |
| `gmx/hist_500000.xvg` | `gmx wham` 2022.3 | `Umbrella histograms` | **Histogram**, all 21 window columns |
| `gmx/07.md_rdf_protein_sugar.xvg` | `gmx rdf` 2021.4 | `Radial distribution` | **RDF** |
| `gmx/07.md_hbdist_protein_sugar.xvg` | `gmx hbond` 2021.4 | `Hydrogen Bond Distribution` | **H-bonds** |
| `gmx/07.md_mindist_protein_sugar.xvg` | `gmx mindist` 2021.4 | `Minimum Distance` | **Distance** |
| `gmx/07.md_numcont_protein_sugar.xvg` | `gmx mindist` 2021.4 | `Number of Contacts < 0.6 nm` | **none:** I pick a type when attaching |

What follows from that:
- **One column by default.** Every type except Histogram and Energy reads only y column 2 (`yCols: '2'`). A file with several columns (several energy terms, several H-bond outputs, several distances) shows only its first curve unless I change that analysis in PMF Sequences.
- **Axis labels come from PMF Sequences' type, not the file.** Its H-bonds type labels x as "Time (ps)", so a donor–acceptor *distance distribution* would be mislabelled there.
- **AWH names.** PMF Sequences' default file pattern is `{method}_{column}_{seq}_t{time}.xvg`, the shape of `gmx awh`'s per-time output names (R5).
- **WHAM profiles.** PMF Sequences recognises a PMF only from `gmx awh`. A `gmx wham` profile would be "unknown", or filed as PMF by hand, and then get PMF Sequences' AWH correction (+2kT·ln r, tail set to zero). Whether that is right for my umbrella profiles is a question for me (R6).
- **Not yet verified:** the titles of `gmx energy`, `gmx distance`, the new `gmx hbond` (2023+), `gmx rms`, `gmx rmsf`, `gmx gyrate` and `gmx wham`'s profile. Verify each with a real file in Phase 0, and add the results to this table.
- **No box from `.gro` files.** `toPdb` (`app/src/lib/structFile.ts`) writes no `CRYST1` line for a `.gro`, so the box line is dropped. For a `.pdb`, non-atom lines (`CRYST1` included) are kept. R2 reads the box itself.

---

## 4. qq and `gmx-eta`, as documented (manual v0.13)

- **`qq jobs [-u USER] [-e] [-a] [-s SERVER] [--yaml]`.**
  - By default it shows my unfinished jobs on the default server: queued, running or exiting.
  - `-a` adds completed jobs, until the batch system forgets them.
  - `-e` adds the input machine, input directory and job comment.
  - `--yaml` gives "all available metadata as provided by the batch system". **Parse this, never the table**, whose columns depend on a user config file.
  - `%CPU` and `%Mem` don't exist on Slurm clusters.
- **States.** `qq jobs` shows the batch system's states. qq's "real" states are `queued`, `held`, `booting`, `running`, `exiting`, `finished`, `failed`, `killed`, `in an inconsistent state` and `unknown`. Show states as words, the way the tool reports them.
- **`gmx-eta [JOB_ID] [-a]`.**
  - It estimates the remaining runtime of a GROMACS simulation, and needs `mdrun -v`.
  - `-a` covers all jobs. Its output looks like `[12345] gromacs_job: Simulation will finish in 06:41:07.`
  - It is a `uv` script that the manual calls "largely untested, completely unstable, and unversioned". Parse it defensively: an unknown line is shown as it is, never dropped.
  - Record the path and SHA-256 of the `gmx-eta` that was used.
- **`qq kill [-y] [--force] JOB_ID…`.** It asks for confirmation per job unless given `-y`. Without `--force` it only kills jobs that are queued, held, booting or running. `--force` ignores the job's state and skips confirmation.

---

## 5. Roadmap

Copy this into `runner/docs/roadmap.md` and keep it current.

**Why this order:**
- the picking and the box are small and land on the existing RDF screen;
- the command definitions come next, with RDF moved in unchanged, so every new command is a small addition;
- commands without atom groups (energy, AWH, WHAM) come before those with groups (distance, H-bonds), because they test the definitions without the 3D view;
- the cluster view is independent, needs cluster access and changes Cypher's safety guarantees, so it comes last, when my real samples are in.

### Phase 0: Plan
- [ ] Baseline commit; Cypher and `app/` results recorded
- [ ] Cypher's current state described; cluster questions answered; real samples received
- [ ] Phase 0 report for R1–R10, with screenshots; R9 shortlist and batches agreed
- [ ] Questions answered; decisions recorded; order confirmed

### Phase 1: Picking and the box (R1, R2)
- [ ] R1-0 Frozen v1 recipe and run-record files (section 1.5)
- [ ] R1a Atom-name lists: `,`, spaces and `and` → one set, said in words; recipe v2
- [ ] R1b Shift+Enter: keep this rule, start the next one with the same residue name and no atom names
- [ ] R1c The same-name click, as decided (section 8)
- [ ] R2 PBC box: read, draw, toggle and dimensions, for `.gro` and `.pdb`, rectangular and triclinic

### Phase 2: Command definitions (R3)
- [ ] R3a The definition format; RDF moved in, with the same command, record and outputs (golden tests); run record v2
- [ ] R3b Command picker; the inputs and groups steps only as each command needs them; options from `gmx <tool> -h`; stdin for jobs

### Phase 3: Commands without atom groups (R4–R6)
- [ ] R4 `gmx energy`: terms, statistics with errors, equilibration cut
- [ ] R5 `gmx awh`: time frames, PMF Sequences names, kJ/mol
- [ ] R6 `gmx wham`: window lists, histogram overlap check, bootstrap errors

### Phase 4: Commands with groups (R7–R9)
- [ ] R7 `gmx distance`: pairs or centres of mass; average, all and histogram outputs
- [ ] R8 `gmx hbond`: the 2023+ tool and the legacy tool, whichever is installed
- [ ] R9 The commands I chose in Phase 0, one item each

### Phase 5: Cluster jobs (R10)
- [ ] R10a Fixed-list runner (local or SSH), with timeouts
- [ ] R10b Parsers: `qq jobs --yaml` and `gmx-eta -a`; merged by job ID
- [ ] R10c Cluster view: states, ETA, finish time, walltime warning, refresh
- [ ] R10d Kill (if agreed), and "analyse this job" (if agreed)

### Phase 6: Finish
- [ ] `runner/README.md` updated
- [ ] Manual QA in Chrome with real `gmx`, `qq` and `gmx-eta`; results recorded (passed, failed or not run)
- [ ] Fresh-context review of the whole branch against section 20 (a reviewer that didn't write the code); findings fixed or recorded
- [ ] Final report `runner/docs/batch-2-report.md`

### Backlog (add to it, don't do it)
- Job submission (`qq submit`), and running Cypher's analyses as cluster jobs.
- Morpheus: a Table and a Combobox component, and an error band for `LineChart` (built locally in this batch).
- Anything PMF Sequences could change to take these outputs more easily (for example multi-column imports, or a WHAM PMF type), for a later PMF Sequences batch.

---

## 6. Files you will mostly work with

| Area | Where |
|---|---|
| Cypher docs | `runner/docs/` (`spec.md`, `phase0.md`, `decisions.md` T1–T89, `roadmap.md`, `report.md`), `runner/README.md` |
| Cypher server | `server/gmx.ts` (`capture`), `jobs.ts` (job runner, event log), `runs.ts` (plan and start a run), `batch.ts`, `files.ts` (allowed folders, uploads), `api.ts` |
| Cypher logic | `src/lib/groups.ts` (`Rule`, `ruleText`, `clickStep`), `rdf.ts` (options, argv, result), `command.ts` (the command as shown), `inputs.ts` (the four input slots), `checks.ts`, `recipe.ts`, `record.ts`, `landing.ts`, `gmxText.ts` (`parseHelp` and the other readers of gmx text), `ndx.ts` |
| Cypher views | `src/views/Groups.tsx` (`RuleForm`, key hints), `Viewer.tsx` (clicks, hydrogens and water toggles), `Rdf.tsx`, `Jobs.tsx`, `Batch.tsx`, `Result.tsx` |
| Cypher tests | `runner/test/` (Vitest, `fake-gmx.mjs`, real `-h` texts in `fixtures/gmx-2023.3/` and `fixtures/gmx-2025.4/`, the test system in `fixtures/nvt/`), `runner/e2e/smoke.spec.ts` |
| PMF Sequences, read-only | `app/src/lib/seq.ts` (`detectAna`, `DEFAULT_ANALYSES`, `parseName`, `parsePath`, `planBatch`, `parseTable`), `gmxHeader.ts`, `structFile.ts`, `storage/path.ts` |
| Real GROMACS files | `app/test/fixtures/gmx/` (RDF, mindist, numcont, hbdist, WHAM histograms), `app/test/fixtures/hmrfast6_ha_a_t200000.xvg` (AWH) |
| Structures | `runner/test/fixtures/nvt/nvt.gro` (a real 3.5 nm water box), `app/test/fixtures/test.pdb`, `WTA.gro`, `cccccccc.gro`, `mmmmmmmm.gro` |
| Design | Morpheus (the artifact): `project/README.md`, `tokens.json`, `components/src/ui/*.tsx`; Cypher's copies in `runner/src/ui/` and `runner/src/tokens.json` |

---

## 7. Shared rules for every new command (R4–R9)

Each command, defined as in R3, has:
- **Inputs** (trajectory, run input, energy file, index, file lists) checked before running, as in the first spec. **Verified:** the file browser shows only GROMACS input files (T10), and uploads accept only `.xtc .trr .tng .tpr .gro .pdb .ndx` (T88). `.edr` files and window lists need adding to both, and the server's upload check is part of Cypher's safety.
- **Options** read from the installed `gmx <tool> -h`. A curated few are shown first; the rest go under "more"; each has a one-line note on what it changes.
- **Groups** only if the command uses them, picked with the existing 3D picker and written to a new `.ndx`.
- **Stdin answers,** if the tool asks questions. They are built by a pure function, written to stdin, and kept in the run record.
- **Outputs.** Each output flag has a name template, the PMF Sequences type it should get (section 3), and whether it goes to the vault by default.
- **A result view:** a Morpheus `LineChart` for curves, and `Stat` tiles for the numbers GROMACS prints (with errors).
- **The run record** (v2, section 1.5), **the landing preview and "send to vault"** from the first spec, for every command.

---

## 8. R1: Atom names as lists, Shift+Enter, the same-name click

### Today

**Verified** in `src/lib/groups.ts`, `src/views/Groups.tsx` and `src/views/Viewer.tsx`:
- **The atom-name rule takes one name** (`{ kind: 'name', value, resn? }`), matched exactly, with an optional "in every …" residue name. Its value field suggests every atom name in the structure, not only those of one residue. `OH1, OH2` today is taken as one name, and matches nothing.
- **A rule is said in words** by `ruleText` ("atom name OH1 in every SUG"), and that text is what the group card and the run record show. Groups reach `gmx` as index groups by number (T17), never as selection text.
- **Enter** in the rule's value field adds the step, clears the name and the residue name, and closes the rule form.
- **Clicks toggle** (add, or remove if already in the group):
  - a plain click toggles the atom;
  - **Shift**+click toggles its residue;
  - **Alt**+click toggles "this atom name in every residue of this name" (T15). That is the scope this spec recommends for R1c, and it already works.
  - The hint line shows `alt` on every platform (`option` on macOS).
- 3Dmol itself uses **Ctrl+drag to move** the structure and **Shift+drag to zoom**. A Ctrl+click whose mouse moves slightly moves the structure instead.
- Rules are stored in recipes and run records (section 1.5).

### Requirements

1. **Lists in the atom-name field and its menu.**
   - `OH1, OH2, OH3`, `OH1 OH2 OH3` and `OH1 and OH2 and OH3` all mean the same set: atoms named OH1, OH2 **or** OH3.
   - The rule says it in words, as `ruleText` does today: "atom name OH1, OH2 or OH3 in every SUG". That makes it clear that "and" here means "also" (in GROMACS selections, `and` means both at once, which would select nothing). Ask whether a GROMACS-style preview (`name OH1 OH2 OH3`) is still wanted; Cypher never passes one to `gmx` (T17).
   - The menu lists the atom names present in the chosen residue name, with counts, and allows several to be ticked; ticking writes the list into the field.
   - Unknown names are flagged with "0 atoms". Duplicates are dropped. Matching is case-sensitive, as in GROMACS.
   - Ask whether wildcards (`OH*`) are wanted.
   - The rule's stored form changes (recipe v2, section 1.5). A v1 rule with one name selects exactly the same atoms as before.
2. **Shift+Enter** in the atom-name field adds the rule, then keeps the rule form open with **the same residue name** and an empty, focused name field. ("Residue" means the residue name of the "in every …" field, not one residue; confirm.)
   - Ask whether the next rule goes into a **new selection group** (recommended: each becomes its own curve; lists already cover "more atoms in the same group") or into the same group.
   - Plain Enter keeps today's behaviour.
3. **The same-name click.** Alt+click already toggles every atom of that name within the same residue name. Ask what R1c should change:
   - another key: some Linux desktops (Xfce, for example) take Alt+click and Alt+drag for moving windows. On macOS, Ctrl+click opens the context menu, so the key there would be ⌘+click. A Ctrl+click competes with 3Dmol's Ctrl+drag, so test it with a slightly moving mouse;
   - a wider scope: the same name in every residue. In CHARMM water (TIP3), the oxygen is also named **OH2**, so "every OH2" could add every water oxygen next to the sugar's OH2;
   - or both.
   - Whatever is chosen: the click toggles, as the others do; a polite announcement says how many atoms were added or removed and in which residues; the step stays removable in the group card, as today.
   - The key labels are right per platform, existing hints included.
4. **Keyboard equivalents.** Every gesture has one: the menu, or keys on the atom list. Each is shown with `Kbd` in a short hint line.

### Tests (table-driven, written first)

- **List parsing:**
  - commas, spaces, `and` and `AND`, mixed;
  - extra spaces and empty entries;
  - duplicates;
  - an atom actually named `AND`, if GROMACS allows one (decide and document);
  - quotes.
- **Set building:** names → atom numbers on `WTA.gro`, `test.pdb` and a structure with TIP3 water (generated), for each click scope decided.
- **The text shown** (`ruleText`) matches the atoms selected.
- **Old rules:** the frozen v1 recipe loads, and each group selects the same atoms as before.
- **Shift+Enter:** the next rule keeps the residue name and has no names.

### Manual checks

- Build three groups (OH1, OH2, OH3 of one sugar) with Shift+Enter alone.
- The same-name click on an OH2 in a system with water, with a slightly moving mouse.
- macOS and Linux key labels.
- Keyboard only.
- Screenshots.

---

## 9. R2: The periodic box in the 3D view

### Today

**Verified:**
- Cypher draws no box. Its viewer loads PMF Sequences' `toPdb` text (with `keepH`), which drops a `.gro` box line (section 3). It has two display toggles today, *hydrogens* and *water & ions*.
- The fixtures' box lines differ:
  - `runner/test/fixtures/nvt/nvt.gro` has a real 3.5 nm cubic box around its water, with TIP4P virtual sites, which `toPdb` leaves out;
  - `WTA.gro` has a 3 nm box;
  - `cccccccc.gro` and `mmmmmmmm.gro` have a 1 nm box, while their atoms reach 2–5 nm: most likely a placeholder for a structure in vacuum.

### Requirements

1. **Read the box from the structure file:**
   - `.gro`, the last line: 3 numbers (rectangular), or 9 for a triclinic box, in GROMACS's order (v1x v2y v3z v1y v1z v2x v2z v3x v3y), in nm;
   - `.pdb`: `CRYST1` (a, b, c in Å; α, β, γ).
2. **Draw the true cell** (its 12 edges, triclinic included, such as a rhombic dodecahedron's unit cell), from the origin, in the 3D view's units. Toggle it with a control and a key. It is on by default (ask).
3. **Show its dimensions:** a, b, c (nm), the angles, and the volume (nm³), in `caption` style.
4. **Say what it is:** "box of the structure file". In an NPT run, the box changes from frame to frame. Molecules crossing the box edge look broken; that is periodicity, not an error, and a one-line hint says so.
5. **No box line, or an invalid one,** means no box drawn, and the reason shown. Never a guessed box.
   - A box that most atoms lie outside (the 1 nm placeholders) is a decision for Phase 0. Recommendation: draw it as recorded, with a note that the atoms lie outside it.
6. Draw it with 3Dmol primitives or its unit-cell support, whichever is smaller and exact for triclinic cells. A `≥ 3:1` line colour from the tokens.

### Tests (pure, table-driven)

- `.gro` lines: rectangular, triclinic (9 values), a rhombic dodecahedron, extra spaces, a missing or garbled line, the fixtures' real lines.
- `CRYST1`: orthorhombic and triclinic, conversion to the same vectors as the matching `.gro`.
- Volume and angles from the vectors.
- The placeholder case: `cccccccc.gro`.

### Manual checks

- `nvt.gro` (a real box with water) and `cccccccc.gro` (a placeholder).
- A triclinic system from my test data.
- A `.pdb` with `CRYST1`.
- Light and dark.
- Screenshots.

---

## 10. R3: One definition per GROMACS command

### Today

Phase 0 describes how RDF is wired: its options, groups, command, outputs, record and result view.

**Verified:**
- Everything is RDF-shaped today:
  - the four input slots (trajectory, run input, structure, index);
  - the tabs `inputs · groups · rdf · jobs · batch` (T40), where *jobs* means Cypher's own local runs;
  - the recipe and the run record (section 1.5);
  - batches, which run one recipe over many trajectories.
- Processes start with stdin ignored (section 1.3).

### Requirements

1. **The definition format.**
   - **A command is one definition:** its tool name, the GROMACS versions it applies to, its inputs, its group roles (or none), the options to show first, any stdin answers, its outputs (flag, name template, PMF Sequences type, sent to the vault by default or not), and its result view.
   - **Code only where a command really differs** (section 1.1).
   - Propose the smallest format that covers RDF and R4–R8 in Phase 0, and keep it as plain data.
2. **RDF moves in unchanged.** For the same inputs and choices: the same argument list, `.ndx`, output names and run record content (golden tests from today's code, written before the move). The record differs only by its version and the fields v2 adds (section 1.5).
3. **The command picker.**
   - Commands are grouped by what they need: an energy file, a trajectory with groups, or file lists.
   - Each shows one line on what it gives, and is shown only if the installed GROMACS has it.
   - Steps that a command doesn't need (the groups step and the 3D view, for energy, AWH and WHAM) are skipped. The inputs step asks for what the command needs (section 7).
   - The `rdf` tab becomes the command's tab. Cluster jobs get a name of their own (R10), since *jobs* already means local runs.
4. **Options** are read from `gmx <tool> -h` for every command, as RDF already does, with the version's own defaults.
5. **Stdin.** The job runner can write a command's stdin answers, and records them.

### Tests

- Golden RDF tests (written first).
- Definition validation: no unknown option, no output without a type decision.
- Option lists parsed from the real `-h` texts of each GROMACS version I send.
- The frozen v1 recipe and run record still load; "run again" from the v1 record gives the same argv.
- Stdin answers reach the fake `gmx` and the record.

---

## 11. R4: `gmx energy`

- **Inputs:** an `.edr`; optionally a `.tpr`. No groups.
- **Terms.**
  - `gmx energy` asks for terms on stdin. Cypher reads the term menu of *this* `.edr` (from a real sample in Phase 0; decide the cheapest reliable way to get it) and shows it as a searchable multi-select.
  - The chosen terms are written to stdin by name or number (decide which is more robust across versions, from real output).
- **Options:** `-b`/`-e` (discard equilibration, shown as "first N ps left out"), `-dt`/`-skip`, and others from `-h` under "more" (`-fluct_props`, `-driftcorr`, …).
- **Result:**
  - a curve per term (several terms in one file is a multi-column output: section 3);
  - `Stat` tiles from the statistics table `gmx energy` prints (average, Err.Est., RMSD, total drift, with units), parsed from real stdout.
  - A drift larger than its error estimate is flagged in words.
- **Tests:**
  - menu parsing (both versions);
  - stdin building;
  - statistics parsing;
  - drift flag;
  - the output type in PMF Sequences (Energy, all columns) checked with `detectAna` on a real file.

---

## 12. R5: `gmx awh`

- **Inputs:** an `.edr` and its `.tpr` (for multiple walkers, the run's `.tpr`; ask if the walkers' files differ). No groups.
- **Time frames.** `gmx awh` writes one file per stored time. Offer:
  - the **last time only** (the usual choice for PMF Sequences);
  - every N-th, with `-skip`, for convergence;
  - all.

  Show how many files each choice will write.
- **Names.**
  - Choose the output name so that `gmx awh`'s per-time files come out in PMF Sequences' pattern, for example `-o hmrfast6_ha_WRWYCR.xvg` → `hmrfast6_ha_WRWYCR_t200000.xvg`. Check how the installed `gmx awh` really names its files before relying on this.
  - Check each name with PMF Sequences' `parseName` and the landing preview: it must land as **PMF**, in the intended row, column and run, at that time.
- **Units:** kJ/mol only for vault outputs (section 1.4).
- **`-more`** (bias, target distribution, friction) is offered, but not sent to the vault by default.
- **Result:** the PMF curves on one chart, in Morpheus tones and dashes as `LineChart` draws them. (A column, and so its colour, exists only once a vault target is chosen.) If many time frames need more than 8 tones and the dashes, propose a clearer form in Phase 0. The AWH target error from the header is shown.
- **Tests:**
  - stdin and options;
  - the frame choice → file count;
  - names → `parseName` round trip;
  - landing preview on a real AWH output;
  - the run against the fake `gmx` and, with `GMX` set, my small AWH run.

---

## 13. R6: `gmx wham`

- **Inputs:** the window lists `gmx wham` reads (`tpr-files.dat` with `pullx-files.dat` or `pullf-files.dat`). Cypher builds them:
  - from a folder template over the window folders (as in the first spec's batches);
  - or from a list I edit.

  The lists are written next to the outputs and kept in the run record. My own lists are never changed.
- **Options:**
  - `-b` (discard per window, shown as equilibration);
  - `-temp` (from the `.tpr` unless set);
  - `-unit` (kJ only for vault outputs);
  - bootstrap (`-nBootstrap`, `-bs-method`, with `-bsres`/`-bsprof`);
  - `-zprof0`, `-cycl`, and the rest from `-h`.
- **The overlap check.**
  - From the histogram output, compute the overlap of each window with its neighbours, as a pure function. Test it on the real `app/test/fixtures/gmx/hist_500000.xvg` (21 windows).
  - Gaps or weak overlap are named by window ("windows 14–15 barely overlap"), because WHAM across a gap isn't reliable.
- **Result:**
  - the profile with its bootstrap error band (`LineChart` has no band yet: section 1.2);
  - the histograms, one curve per window.
- **Ask me:** should a WHAM profile go to PMF Sequences as a PMF? PMF Sequences would apply its AWH correction (+2kT·ln r, tail set to zero) (section 3). Recommendation: send the histograms (they land as Histogram), and send profiles only after I decide.
- **Tests:**
  - list building from a template;
  - overlap on the real fixture and on synthetic gaps;
  - options;
  - bootstrap output parsing;
  - the run against the fake `gmx` and, with `GMX` set, my umbrella set.

---

## 14. R7: `gmx distance`

- **Inputs:** a trajectory, a run input, and groups from the 3D picker.
- **What is measured:**
  - **pairs** (a group of atom pairs), or the **distance between two groups' centres** (`com of group "A" plus com of group "B"`);
  - centre of mass or of geometry, chosen and shown.

  The selection text is built by a pure function and shown in full.
- **Outputs:** `-oav` (average over time), `-oall`, `-oxyz`, `-oh` (histogram, with `-len`/`-binw`). Each output's PMF Sequences type is checked with a real file in Phase 0.
- **Result:** the distance over time, and the histogram.
- **Tests:**
  - selection building: pairs, centres of mass and geometry. Groups are referenced as Cypher's index groups (T17); group names have no spaces (T18), but test names with `+ . : -`;
  - the output type with `detectAna` on real files.

---

## 15. R8: `gmx hbond`

- **Two tools.** GROMACS 2023 replaced `gmx hbond` with a selection-based tool, and kept the old one as `gmx hbond-legacy`. My files come from 2021.4 (the old tool, `-num`, `-dist`, …, groups asked on stdin).
  - Detect which tools the installed version has, and offer one form for both, mapped to each tool's own options.
  - Record which tool ran.
  - Never mix their criteria silently.
- **Groups:** donors and acceptors from the 3D picker (`-r`/`-t` in the new tool; the index groups on stdin in the old one).
- **Criteria:** the distance and angle cut-offs, with each version's defaults, shown and recorded.
- **Outputs:** the number of H-bonds over time (`-num`, the default to the vault) and the distributions.
  - The distance distribution would be mislabelled in PMF Sequences (section 3), so it isn't sent by default.
- **Tests:**
  - version detection from real `gmx help` and `-h` texts;
  - building both tools' commands and stdin from one form;
  - output types with `detectAna`.

---

## 16. R9: Further commands

In Phase 0, propose a shortlist with one line each on what I'd get, and I choose. Candidates:
- `gmx rms`: RMSD; PMF Sequences type RMSD.
- `gmx rmsf`: per-residue fluctuation; type RMSF.
- `gmx gyrate`: radius of gyration; type Rg.
- `gmx mindist`: minimum distance and contact numbers. Real outputs are in the fixtures; contacts land as unknown (section 3).
- `gmx sasa`: solvent-accessible surface.
- `gmx density`: density profiles.
- `gmx analyze`: block averaging and autocorrelation, for error estimates of any time series.
- `gmx trjconv`: making molecules whole and centring, as a preparation step rather than an analysis.

Each chosen command is one roadmap item, built under section 7, with real files for its tests.

---

## 17. R10: My cluster jobs, `qq jobs` with `gmx-eta -a`

### Today

**Verified:**
- Cypher mostly runs on my own machine (Unix or macOS), sometimes on the cluster through an SSH tunnel (phase0). `qq` and `gmx-eta` run on the cluster, so from my machine this needs SSH.
- Cypher's *jobs* tab and `server/jobs.ts` are its own local `gmx` runs, with their own states (`running`, `done`, `failed`, `cancelled`, `interrupted`). The cluster view gets another name (Phase 0 proposes one), and the two kinds of state are never mixed.
- `runner/README.md` (*Safety*) says Cypher runs nothing but `gmx` and reaches no network (section 1.3).

### Requirements

1. **Commands,** from a fixed list only (section 1.3):
   - `qq jobs --yaml` (with `-a` when "show finished" is on, `-s` per server);
   - `gmx-eta -a`;
   - `qq kill -y <id>`, if agreed.

   They run locally or through SSH, as Phase 0 decides.
2. **Parsing.**
   - `qq jobs --yaml` and `gmx-eta -a` are parsed by pure functions, from my real samples.
   - Job IDs are normalised so the two can be merged (for example `12345` against `12345.<server>`); check how my IDs look.
   - Unknown lines and fields are kept and shown, never dropped.
3. **The cluster view,** a semantic table in Morpheus tokens:
   - job ID, name, state (a word, with its status hue), nodes, CPUs and GPUs, runtime, walltime;
   - **ETA**: time left, and the **finish time** in my time zone ("finishes Fri 03:40"). It warns in words when the ETA is longer than the walltime left ("needs 2 h more than its walltime"), if the YAML gives both;
   - the input directory and comment (`-e`), when asked;
   - filters by state and name, "show finished", and sorting;
   - "updated N min ago", a refresh button, and slow polling only while the view is visible (section 1.3);
   - clear messages when the cluster is unreachable, a ticket has expired, or `gmx-eta` is missing.
4. **"—" when there is no ETA,** with the reason: not running, no `mdrun -v`, or not a GROMACS job.
5. **Kill (if agreed):** arm-and-confirm per job, the exact command shown, never `--force` from the GUI unless I agree.
6. **"Analyse this job" (if agreed):** opens Cypher on the job's input directory, from `-e`, when Cypher can reach it.

### Tests

- Parsers on my real samples (each state; a job with and without an ETA; Slurm without `%CPU`/`%Mem`, if I have a sample).
- The ID merge.
- Finish time and the walltime warning (fixed clock, my time zone).
- The SSH command builder: only listed commands; a hostile ID refused.
- Polling: no overlap, a timeout, a backoff when unreachable.

### Manual checks

- The cluster view against my real cluster, with running, queued and finished jobs.
- An expired ticket.
- Kill on a throwaway job (if agreed).
- Screenshots.

---

## 18. Testing (all requests)

- **Vitest, in Node.** Every decision is a pure function, tested table-driven.
- **Real text only.**
  - The fake `gmx` from the first spec gains the new tools; its answers are real outputs, with their real headers.
  - New fakes for `qq` and `gmx-eta` replay my samples.
  - Never invent a format. Ask for a sample.
- **Contract tests** run PMF Sequences' own code (`detectAna`, `parseName`, `planBatch`, `parseTable`) on every new output type.
- **Real-tool tests** run when `GMX`, `QQ` or `GMX_ETA` is set, and are listed as run or not run.
- **Safety tests** (section 1.3) for stdin, SSH and kill, and for the widened upload list.
- **Golden tests** prove RDF is unchanged by R3.
- **Format tests** (section 1.5): the frozen v1 recipe and run record load, and newer versions are refused.
- The Playwright smoke test (`npm run e2e`) keeps passing.
- The `app/` tests keep passing, and `app/` stays unchanged.

---

## 19. Documentation

`runner/README.md`:
- **Commands:** one short section per command; what it needs, the options that change the numbers, what goes to PMF Sequences and what type it lands as.
- **Atom picking:** lists, Shift+Enter, the same-name click as decided, and the keyboard equivalents.
- **The PBC box.**
- **The cluster view:** set-up (local or SSH, Kerberos), what it runs on the cluster, how often, and what it never does.
- **Safety** and **the run record:** the new wording approved in Phase 0, and the v2 formats.

---

## 20. Acceptance criteria

- **A. Picking.**
  - `OH1, OH2 OH3 and OH4` selects exactly those names, said in words.
  - Shift+Enter starts the next rule with the same residue name.
  - The same-name click works as decided, on each platform, with a count.
  - Everything works from the keyboard too.
  - Recipes and run records from the first spec still load and select the same atoms.
- **B. Box.** The structure's real box (rectangular or triclinic) is drawn, with its dimensions, or a reason why not. A placeholder box is handled as decided.
- **C. Commands.** RDF is unchanged (golden tests). Energy, AWH, WHAM, distance, H-bonds and the R9 choices run from definitions, with options from the installed GROMACS, numbers with their errors, and outputs that land in PMF Sequences as section 3 says.
- **D. Analysis checks.** Equilibration cuts, units, criteria and bootstrap settings are visible and recorded. WHAM gaps are flagged, and energy drift is flagged.
- **E. Cluster jobs.** `qq jobs` and `gmx-eta -a` merge into one view, kept apart from Cypher's own jobs, with states as words, ETAs, finish times and walltime warnings. It only runs listed commands, slowly, and survives an unreachable cluster.
- **F. Safety.** No shell for local processes; only listed SSH commands, with validated IDs and server names; no kill without two clicks; nothing deleted or overwritten. `runner/README.md`'s *Safety* section says exactly what Cypher can now run and reach.
- **G. Quality.**
  - Lint, build, tests and the Playwright smoke test pass in Cypher, and the tests pass in `app/`.
  - `app/` is unchanged.
  - No console errors.
  - Morpheus in light and dark.
  - Lines and tests reported per item.

---

## 21. Commits

- One commit per roadmap item (R1a, R1b, …), with its ID first (`R1a: atom-name lists`). Plus one commit each for the Phase 0 docs, the frozen fixtures and the final report.
- Every commit passes lint, build and tests on its own, and leaves `app/` unchanged. Check the commit itself, not the working tree: in the first spec, `aea4829` was committed without a file it needed and didn't build on its own. A temporary worktree of the new commit is one way to check.
- Stage files by name. Never commit my real data, cluster samples with personal details (ask before committing any), generated files or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 22. Final report: `runner/docs/batch-2-report.md`

1. **Summary table:** item → status → files → lines added / removed → tests added → decisions.
2. **Per request:** what changed and why, behaviour before and after, known limitations.
3. **The completed table from section 3:** every new output type, how PMF Sequences files it, and which were verified with real files.
4. **Screenshots** (small PNGs in `runner/docs/img/batch-2/`), light and dark:
   - an atom-name list;
   - Shift+Enter;
   - the same-name click with its count;
   - the PBC box (rectangular and triclinic);
   - the command picker;
   - energy terms with statistics;
   - AWH frames;
   - the WHAM overlap check;
   - distance and H-bond results;
   - the cluster view.
5. **Tests:** count before and after, the new tests, which ran with real `gmx`, `qq` and `gmx-eta`, and the manual QA checklist with passed, failed or not run for each item.
6. **Review:** what the fresh-context review found, and what was done about each finding.
7. **Decisions** (link to `decisions.md`).
8. **Roadmap status** and the updated backlog.
9. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline commit, showing that `app/` is unchanged.
