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
- [x] R1b Shift+Enter: keep this rule, start the next one with the same residue name and no atom names (T105; a new rule in the same group since T139)
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
- [x] R9b `gmx rmsf`: fluctuation per atom or per residue (T129)
- [x] R9c `gmx gyrate`: the selection tool (2024+) and the legacy one, whichever this gmx has (T130)
- [x] R9d `gmx mindist`: minimum distance and contacts (T131)

### Phase 5: Cluster jobs (R10)
- [x] R10a Fixed-list runner, on this machine (question 1), with timeouts (T134)
- [x] R10b Parsers: `qq jobs` (the table you sent; no `--yaml` sample yet) and `gmx-eta -a`; merged by job ID (T132–T133)
- [x] R10c Cluster view: states, ETA, finish time, walltime warning, refresh (T135; checked with fakes printing your samples, not on your cluster)
- [ ] R10d Not built: watch only (question 3) means no kill; "analyse this job" needs a `qq jobs -e` sample for the input folder (T136)

### Phase 6: Finish
- [x] `runner/README.md` updated (T137)
- [x] Manual QA in Chrome with real `gmx` (and fakes for `qq` and `gmx-eta`, which aren't here); results recorded (passed, failed or not run) in the report
- [x] Fresh-context review of the whole branch against section 20 of the spec; findings fixed or recorded (R1–R4: T105–T110; R5–R10: T138)
- [x] Final report `runner/docs/batch-2-report.md`

### After batch 2 (your requests, T139–T141)
- [x] Shift+Enter adds a new rule in the same group, not a new group
- [x] Atoms keep their element colours when grouped or clicked; a group shows as a halo (group hues kept as an option)
- [x] C + click sets the centre of rotation to the clicked atom's whole group

### After batch 3 of PMF Sequences (your requests, T142–T144 and T151)
- [x] `app/` replaced by PMF Sequences batch 3, as its source came; Cypher follows it (schema 4, general data, energy typed from its header; T142)
- [x] Matrix tiles show no "±" and no "n" by default; a setting brings them back (T143)
- [x] A new project starts with COL1 and no tags; the example text is neutral; older data keeps its former columns and tags (T151)
- [x] The `app/` check compares a hash of the whole tree, so a commit can carry its own baseline (T144)

### After (de)Cypher (your requests, T152–T156)
- [x] A curve's peak is its highest point (T152)
- [x] Values under the pointer come highest first (T153)
- [x] The export's page heading and card headings are your text (T154)
- [x] RDFs that differ only in their reference can be morphed into one card: pick a reference by its atom or chip (T155)
- [x] Morphing goes by shared groups (atoms, else names), shows its menu always with the reasons, and works for RDFs without a known reference (T156)

### Backlog (Batch 2: add to it, don't do it)
- Job submission (`qq submit`), and running Cypher's analyses as cluster jobs. (Moved here from the backlog above.)
- Morpheus: a Table and a Combobox component, and an error band for `LineChart` (built locally in this batch). Morpheus's `DropdownMenu` checkbox items are a non-searchable multi-select option.
- PMF Sequences: distance and H-bond distribution histograms (titles with "Histogram") are typed as Histogram, with an umbrella axis; a gmx wham profile ("Umbrella potential") is typed as Histogram too, by its keyword "umbrella" (T118). The backlog for a later PMF Sequences batch. (`GROMACS Energies` is now typed from its header: PMF Sequences batch 3, T142.)
- Trajectory preparation (`trjconv`) is an R9 candidate; it stays out unless chosen.


## Batch 3

From [`batch-3.md`](batch-3.md) §5: one coherent app, (de)Cypher for every analysis, exports, and a vault space of its own. Baseline `a2b422e`. The Phase 0 report is [`batch-3-phase0.md`](batch-3-phase0.md); the order below is the spec's, with the three changes Phase 0 proposed and you approved (report §6).

**Why this order:**
- **Data protection comes first.** It is small, and it protects everything that comes after.
- **The contract comes before the code it governs,** so later items aren't done twice.
- **The core comes before the features drawn with it.** Exports, ramps and compare for every analysis all come from one place.
- **AWH convergence comes early,** because it is the biggest scientific gain, and it is built on the core.
- **Layout and interaction come after the core,** so the new layout uses the final components.
- **The runner's scale, the vault and the cluster items are independent.** They come last, when your samples are in.

### Phase 0: Plan and design
- [x] Baseline recorded; section 3 confirmed or corrected
- [x] Design pass: plan, review against the brief, screenshots
- [x] R1a `design-contract.md` drafted
- [x] Phase 0 report for R1–R16; samples asked for
- [x] Questions answered; decisions recorded; order confirmed (T157–T169)

### Phase 1: Protect data (R2, R3a, R14a)
- [x] R2a SIGHUP
- [x] R2b The record is written when the job starts, and completed atomically when it ends
- [x] R3a Ticket references out of the UI, with the test that keeps them out
- [x] R14a The vault space, and a copy of the record beside each sent result

### Phase 2: The contract in code (R1, R3, R4, R9c)
- [x] R1b `src/core/contract.ts`: the phrases never shown, the role → token map, the status levels (the default keys land with R8b)
- [x] R4a Colour roles; the reference in ink; `destructive` used only for errors (the class-usage scan lands with R9c, when the status component exists)
- [x] R4b `NEUTRAL` moved into the tokens; no hex outside the tokens
- [x] R4c Titles in Archivo 800 (T160)
- [x] R3b One set of words on every screen (the tabs become set-up steps with R9a; the peak words with R3d)
- [x] R14b-1 The connected project, as a setting (moved here from Phase 8: R3c names jobs from it)
- [x] R3c Display names from the project pattern
- [x] R3d Both peak rules, named and shown (in the CSV with R6a)
- [x] R9c One status component, used for every status

### Phase 3: One visualization core (R5, R6)
- [x] R5a One copy each of tones, dashes (the Matrix's 10, with names), ticks and atom ranges (T170)
- [x] R5b One structure model (T171)
- [x] R5c Every chart drawn by the core, with a hover readout; the Morpheus `LineChart` copy removed (T172)
- [x] R6a Every chart exports to SVG, PDF, PNG and CSV, and any result to HTML (T173)
- [x] R6b Export settings (T174)

### Phase 4: AWH and WHAM (R7)
- [x] R7a Ramps for ordered curves (T175)
- [x] R7b AWH convergence (T176)
- [x] R7c The AWH axis unit, from the run input (needs your `gmx dump -s` samples) (T177)

### Phase 5: Layout and interaction (R8, R9)
- [x] R9a Set-up and results; compare as `#compare`; old addresses still work; drops routed by type (T178)
- [x] R9b One result page layout; (de)Cypher's controls regrouped (T179) (with the one style menu, so the display menu is built once)
- [x] R8a One gesture scheme for structures, charts and legends (T180)
- [x] R8b Every key in one registry, rebindable, listed by `?` (T181)

### Phase 6: Compare every analysis (R10, R11)
- [x] R10a Results of any command in compare: cards, and one graph for like quantities (T182)
- [x] R10b RMSF on the structure (T183)
- [x] R10c H-bond pairs on the structure (T184)
- [x] R10d Distance and mindist lines; gmx rms's fit group (T185)
- [x] R11a Same scale (T186)
- [x] R11b Line styles (T187)
- [x] R11c Marks and lines, carried into exports (T188)
- [x] R11d Renamed groups and reference (T189)

### Phase 7: The runner at scale (R12, R13)
- [ ] R12a Logs on demand; startup without logs in memory
- [ ] R12b Search, filters, multi-select
- [ ] R12c Archive
- [ ] R13 Run diff

### Phase 8: Vault, cluster and commands (R14, R15, R16)
- [ ] R14b Connect to a project: sends and saved compare views in the space (the setting itself: Phase 2, if agreed)
- [ ] R14c Compare reads record copies from the space, giving groups for any sent RDF
- [ ] R15 A finished cluster job offers a recipe or batch (only with a `qq jobs -e` sample)
- [ ] R16a `gmx density` (needs your samples)
- [ ] R16b `gmx order` (needs your samples)

### Phase 9: Finish
- [ ] `runner/README.md` updated (section 25)
- [ ] Manual QA in Chromium, and with a real `gmx` where available; results recorded
- [ ] Fresh-context review of the whole branch against section 26 and the design contract; findings fixed or recorded
- [ ] Final report

### Backlog (Batch 3: add to it, don't do it)
- Job submission and killing jobs.
- One 3D engine for the picker and compare (unless it is done in this batch; Phase 0 says it isn't small: §4, R5 of the report).
- Requests for the Matrix and for Morpheus (section 28). From batch 2's backlog: the Matrix's typing of distance and H-bond histograms and of gmx wham's profile (T118); Morpheus's Table, Combobox and the `LineChart` error band (the error band moves into the core with R5c).
- Trajectory preparation (`trjconv`), still only a candidate.
- Found in Phase 0, not on lines this batch changes: none yet.
