# gmx-cypher (runner) — roadmap

From [`spec.md`](spec.md) §5. Ticked when done; new items go under the right phase or the backlog.
Order as approved in [`phase0.md`](phase0.md) §10: R5 before R4b, and R4d after R4c.

**Why this order:**
- the foundation and safety come first;
- picking atoms correctly is the hardest part and decides whether the RDF means anything;
- running RDF needs both;
- the vault handoff needs real outputs to test with;
- batches reuse everything before them.

### Phase 0: Plan
- [x] Environment questions answered; test system received
- [x] Branch created; baseline commit and `app/` results recorded — `e8a452c`; 0 errors / 7 warnings, build with 1 warning, 390 tests in 20 files
- [x] Morpheus read; PMF Sequences contract confirmed
- [x] Phase 0 report for R1–R7, with wireframe screenshots
- [x] Questions answered; decisions T1… recorded; order confirmed

### Phase 1: Foundation (R1)
- [x] R1a `runner/` scaffold, Morpheus theme and fonts, the empty-`app/`-diff check
- [x] R1b Server: 127.0.0.1, token, `Host`/`Origin` check, static GUI
- [x] R1c `gmx` configuration and detection (`--version`); a fake `gmx` for tests
- [x] R1d Job runner: spawn without a shell, stream progress, cancel the process group, keep state across reloads

### Phase 2: Inputs and groups (R2, R3)
- [x] R2a Choosing files by path (server-side browser within allowed folders) and by upload
- [x] R2b Checking inputs: formats, atom counts of structure, run input and trajectory
- [x] R3a 3D view with a drawn-atom → GROMACS-number map
- [x] R3b Groups: click, residue, rule; reference and selections; overlap warning
- [x] R3c `.ndx` read and write; existing groups shown in 3D

### Phase 3: RDF (R4, R5)
- [x] R4a Options read from the installed `gmx rdf -h`; recipe form; command preview
- [x] R5 Output names, folders, run record, nothing overwritten
- [x] R4b Run, progress, frames read, cancel, log
- [x] R4c Result chart (Morpheus LineChart) and summary
- [x] R4d Playwright smoke test: start, pick, run with the fake `gmx`, see the chart

### Phase 4: Handoff to PMF Sequences (R6)
- [x] R6a Read-only vault reader (projects, columns, rows, runs, patterns)
- [x] R6b Name templates and a landing preview made by `planBatch`
- [x] R6c Send to the vault inbox; what to do next in PMF Sequences

### Phase 5: Batches (R7)
- [x] R7a Recipes saved and reused
- [x] R7b One recipe over many trajectories by path template; queue with a concurrency limit

### Phase 6: Finish
- [x] `runner/README.md`
- [x] Manual QA in Chrome, with my real test system and real `gmx`; results recorded (passed, failed or not run) — done here in headless Chromium with your test system and GROMACS 2025.4 built here; your Chrome, your vault and your `gmx_mpi` not run (report.md)
- [x] Fresh-context review of the whole branch against section 15 (a reviewer that didn't write the code); findings fixed or recorded — 11 findings, all fixed (`41ccb30`, `9b4351f`)
- [x] Final report `runner/docs/report.md`

### Backlog (not in this task)
- Moved to Batch 2 (R7–R9): the analyses `gmx mindist`, H-bonds, RMSD and Rg. Their real outputs are in `app/test/fixtures/gmx/`.
- Moved to Batch 2 (backlog): submitting jobs to the cluster queue (PBS on MetaCentrum).
- Moved to Batch 2 (R9 candidate): trajectory preparation (`trjconv -pbc mol`, centring). Not needed for RDF: `gmx rdf -rmpbc` makes molecules whole (phase0 §6).
- Trajectories that store only some atoms (`compressed-x-grps`): `-fgroup` and a matching atom-count check.
- Selection expressions as an expert way to define a group (dynamic selections such as "water within 0.5 nm").
- Anything PMF Sequences would need to change to make the handoff even easier. Note it here for a later PMF Sequences batch; don't change `app/`:
  - export one function that plans an attached file (`parsed: parseName(…)` plus `planBatch`), which the runner now mirrors from `UploadDialog`;
  - rescan the visible tree on window focus, or watch the inbox, so a sent file shows without *Check folder now*;
  - in the folder-pattern tester, warn when a pattern also matches unrelated paths (it read the fixture's cluster path as row `tLys+O127`, column `solutions`);
  - recognise the `gmx rdf -cn` file (`Cumulative Number RDF`) as its own analysis instead of another RDF.
- Morpheus: code and log colours, if wanted (Q15).

## Batch 2

Spec: [`batch-2.md`](batch-2.md). Phase 0 report: [`batch-2-phase0.md`](batch-2-phase0.md). Branch `cypher-batch-2` from `eeb8292` (local; not pushed).

**Why this order:**
- the picking and the box are small and land on the existing RDF screen;
- the command definitions come next, with RDF moved in unchanged, so every new command is a small addition;
- commands without atom groups (energy, AWH, WHAM) come before those with groups (distance, H-bonds), because they test the definitions without the 3D view;
- the cluster view is independent, needs cluster access and changes Cypher's safety guarantees, so it comes last, when my real samples are in.

### Phase 0: Plan
- [x] Baseline commit; Cypher and `app/` results recorded (`batch-2-phase0.md` §1)
- [x] Cypher's current state described; GROMACS 2025.4 checked for the new commands; real outputs typed with PMF Sequences' `detectAna`
- [x] Phase 0 report for R1–R10, with mockups (`img/batch-2/mock-*.png`); R9 shortlist and batches proposed
- [x] Questions answered: cluster (local `qq`/`gmx-eta`, watch only, 60 s), README wording, job colours; every other question by the report's recommendation (T90–T100)

### Phase 1: Picking and the box (R1, R2)
- [x] R1-0 Frozen v1 recipe and run-record files (section 1.5)
- [x] R1a Atom-name lists: `,`, spaces and `and` → one set, said in words; recipe v2 (T92, T93)
- [x] R1b Shift+Enter: keep this rule, start the next one with the same residue name and no atom names
- [x] R1c The same-name click, as decided (section 8): kept as it is (T94)
- [x] R2 PBC box: read, draw, toggle and dimensions, for `.gro` and `.pdb`, rectangular and triclinic (T95, T96)

### Phase 2: Command definitions (R3)
- [x] R3a The definition format; RDF moved in, with the same command, record and outputs (golden tests); run record v3 (T97, T98)
- [x] R3b Command picker; the inputs and groups steps only as each command needs them; options from `gmx <tool> -h`; stdin for jobs (T99, T100)

### Phase 3: Commands without atom groups (R4–R6)
- [x] R4 `gmx energy`: terms, statistics with errors, equilibration cut (T101–T104; saved recipes and batches for energy not yet)
- [x] R5 `gmx awh`: time frames, PMF Sequences names, kJ/mol (T111–T114; tested on a small real AWH run made here, until yours comes)
- [x] R6 `gmx wham`: window lists, histogram overlap check, bootstrap errors (T115–T118; tested on a small real umbrella set made here, until yours comes)

### Phase 4: Commands with groups (R7–R9)
- [x] R7 `gmx distance`: pairs or centres of mass; average, all and histogram outputs (T119–T121)
- [x] R8 `gmx hbond`: the selection tool (GROMACS 2024+) and the legacy tool, whichever this gmx has (T122–T126; the legacy tool under its pre-2024 name tested through a fake gmx that answers as 2023.3)
- [x] R9a `gmx rms`: the fit group and further groups measured after that fit; group roles per command (T127–T128)
- [ ] R9b `gmx rmsf`: fluctuation per atom or per residue
- [ ] R9c `gmx gyrate`: the selection tool (2024+) and the legacy one, whichever this gmx has
- [ ] R9d `gmx mindist`: minimum distance and contacts

### Phase 5: Cluster jobs (R10)
- [ ] R10a Fixed-list runner (local or SSH), with timeouts
- [ ] R10b Parsers: `qq jobs --yaml` and `gmx-eta -a`; merged by job ID
- [ ] R10c Cluster view: states, ETA, finish time, walltime warning, refresh
- [ ] R10d Kill (if agreed), and "analyse this job" (if agreed)

### Phase 6: Finish
- [ ] `runner/README.md` updated
- [ ] Manual QA in Chrome with real `gmx`, `qq` and `gmx-eta`; results recorded (passed, failed or not run)
- [ ] Fresh-context review of the whole branch against section 20 of the spec; findings fixed or recorded
- [ ] Final report `runner/docs/batch-2-report.md`

### Backlog (Batch 2: add to it, don't do it)
- Job submission (`qq submit`), and running Cypher's analyses as cluster jobs. (Moved here from the backlog above.)
- Morpheus: a Table and a Combobox component, and an error band for `LineChart` (built locally in this batch). Morpheus's `DropdownMenu` checkbox items are a non-searchable multi-select option.
- PMF Sequences (read-only in this batch): `GROMACS Energies` is not matched by its `energy` keyword, so an energy file is typed only from its file name; distance and H-bond distribution histograms (titles with "Histogram") are typed as Histogram, with an umbrella axis; a gmx wham profile ("Umbrella potential") is typed as Histogram too, by its keyword "umbrella" (T118). The backlog for a later PMF Sequences batch.
- Trajectory preparation (`trjconv`) is an R9 candidate; it stays out unless chosen.

