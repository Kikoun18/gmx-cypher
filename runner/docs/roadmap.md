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
- [ ] R1c `gmx` configuration and detection (`--version`); a fake `gmx` for tests
- [ ] R1d Job runner: spawn without a shell, stream progress, cancel the process group, keep state across reloads

### Phase 2: Inputs and groups (R2, R3)
- [ ] R2a Choosing files by path (server-side browser within allowed folders) and by upload
- [ ] R2b Checking inputs: formats, atom counts of structure, run input and trajectory
- [ ] R3a 3D view with a drawn-atom → GROMACS-number map
- [ ] R3b Groups: click, residue, rule; reference and selections; overlap warning
- [ ] R3c `.ndx` read and write; existing groups shown in 3D

### Phase 3: RDF (R4, R5)
- [ ] R4a Options read from the installed `gmx rdf -h`; recipe form; command preview
- [ ] R5 Output names, folders, run record, nothing overwritten
- [ ] R4b Run, progress, frames read, cancel, log
- [ ] R4c Result chart (Morpheus LineChart) and summary
- [ ] R4d Playwright smoke test: start, pick, run with the fake `gmx`, see the chart

### Phase 4: Handoff to PMF Sequences (R6)
- [ ] R6a Read-only vault reader (projects, columns, rows, runs, patterns)
- [ ] R6b Name templates and a landing preview made by `planBatch`
- [ ] R6c Send to the vault inbox; what to do next in PMF Sequences

### Phase 5: Batches (R7)
- [ ] R7a Recipes saved and reused
- [ ] R7b One recipe over many trajectories by path template; queue with a concurrency limit

### Phase 6: Finish
- [ ] `runner/README.md`
- [ ] Manual QA in Chrome, with my real test system and real `gmx`; results recorded (passed, failed or not run)
- [ ] Fresh-context review of the whole branch against section 15 (a reviewer that didn't write the code); findings fixed or recorded
- [ ] Final report `runner/docs/report.md`

### Backlog (not in this task)
- Next analyses, each as a small addition: `gmx mindist`, contact numbers, H-bonds (real outputs are in `app/test/fixtures/gmx/`), RMSD, Rg.
- Submitting jobs to the cluster queue (PBS on MetaCentrum).
- Trajectory preparation (`trjconv -pbc mol`, centring). Not needed for RDF: `gmx rdf -rmpbc` makes molecules whole (phase0 §6).
- Trajectories that store only some atoms (`compressed-x-grps`): `-fgroup` and a matching atom-count check.
- Selection expressions as an expert way to define a group (dynamic selections such as "water within 0.5 nm").
- Anything PMF Sequences would need to change to make the handoff even easier. Note it here for a later PMF Sequences batch; don't change `app/`:
  - export one function that plans an attached file (`parsed: parseName(…)` plus `planBatch`), which the runner now mirrors from `UploadDialog`;
  - rescan the visible tree on window focus, or watch the inbox, so a sent file shows without *Check folder now*;
  - in the folder-pattern tester, warn when a pattern also matches unrelated paths (it read the fixture's cluster path as row `tLys+O127`, column `solutions`);
  - recognise the `gmx rdf -cn` file (`Cumulative Number RDF`) as its own analysis instead of another RDF.
- Morpheus: code and log colours, if wanted (Q15).
