# gmx-cypher batch 2: final report

Branch `cypher-batch-2`, from `eeb8292` (the end of the first spec), with PMF Sequences at its baseline
`e8a452c`, unchanged. Pushed as a fast-forward to `claude/quirky-cray-q845sa` (this session's branch) when
the session's stop hook asked for it; section 21 says not to push unasked, so say if that was not wanted.

Everything on the roadmap is built, tested and checked in Chromium, except **R10d** (kill and *analyse
this job*), which your answers put out of scope or which waits for a sample. Three things were checked
only against stand-ins, because the real thing isn't reachable here, and are open below: your cluster
(`qq`, `gmx-eta`, Kerberos), a GROMACS before 2024 running the legacy H-bond and gyrate tools on real
data, and your own energy, AWH and umbrella files.

## 1. Summary

Code is added/removed lines in `runner/src`, `runner/server` and `runner/e2e` (no fixtures, no copied
Morpheus components); tests are lines in `runner/test/*.ts` and the fakes. *Passing* is the Vitest count
at that commit, from a check of each commit on its own in a temporary worktree (lint, build, tests,
`app/` unchanged; see section 5).

| Item | Status | Commit | Code | Tests | Passing | Decisions |
|---|---|---|---:|---:|---:|---|
| Phase 0: plan, verified facts, mockups | done | `e53214e` | 0 | 0 | 273 | T90–T91 |
| R1-0 frozen v1 recipe and run record | done | `d2cf007` | 0 | +35 | 277 | T93 |
| R1a + R1b atom-name lists; Shift+Enter | done | `31cebe4` | +117 −33 | +102 −7 | 297 | T92, T93, T105 |
| R1c same-name click | decided, no code (Alt kept) | — | — | — | — | T94 |
| R2 the periodic box | done | `785e2b8` | +106 | +85 | 310 | T95, T96 |
| R3-0 golden RDF tests | done (does not build alone, see 5) | `fdda051` | 0 | +165 | 314 | — |
| R3a one definition per command | done | `05f9e31` | +68 −13 | +67 −11 | 321 | T97, T98 |
| R3b command picker, stdin answers | done | `9eb25e0` | +79 −24 | +35 −1 | 325 (see 5) | T99, T100 |
| R4 `gmx energy` | done | `90e50ca` | +511 −73 | +294 −14 | 359 | T101–T104 |
| Review fixes for R1–R4 | done | `69bd3b7` | +142 −52 | +156 −3 | 386 | T105–T110 |
| R5 `gmx awh` | done | `5770c18` | +433 −43 | +270 −6 | 425 | T111–T114 |
| R6 `gmx wham` | done | `0dce64b` | +536 −24 | +305 −6 | 475 | T115–T118 |
| R7 `gmx distance` | done | `f7ceaf3` | +262 −68 | +182 −5 | 502 | T119–T121 |
| R8 `gmx hbond` and `hbond-legacy` | done | `544f591` | +364 −29 | +298 −6 | 545 | T122–T126 |
| R9a `gmx rms`; group roles | done | `46bcb7a` | +235 −98 | +138 −9 | 558 | T127–T128 |
| R9b `gmx rmsf` | done | `4d3129a` | +75 −3 | +69 −4 | 565 | T129 |
| R9c `gmx gyrate` and `gyrate-legacy` | done | `8396885` | +119 −2 | +123 −4 | 581 | T130 |
| R9d `gmx mindist` | done | `ba266af` | +90 −2 | +81 −4 | 587 | T131 |
| R10b parsers: `qq jobs`, `gmx-eta -a` | done (the table; no YAML sample) | `24c4f39` | +152 | +96 | 601 | T132–T133 |
| R10a the cluster runner, on this machine | done | `5fdce2b` | +120 −9 | +81 | 606 | T134 |
| R10c the cluster tab | done | `43d990f` | +203 −5 | +16 −1 | 608 | T135 |
| R10d kill; *analyse this job* | not built | — | — | — | — | T136 |
| Phase 6: README; picker reasons in their items | done | `9ea4489` | +6 −2 | 0 | 608 | T137 |
| Review fixes for R5–R10 | done | `6d73569` | +113 −52 | +78 −9 | 620 | T138 |
| Phase 6: this report | done | the commit after | 0 | 0 | 620 | — |

In all (R1–R10 and the review fixes): about 3 700 lines of code added and 530 removed, and 2 700
lines of tests, in `runner/`; 620 tests passing (1 skipped) against 273 before; with the real GROMACS
2025.4, 613 pass and 8 are skipped (the cases that need the fake's 2023.3 mode). `app/` is unchanged.

## 2. Per request

**R1 Atom picking.** *Before:* an atom-name rule took one name, matched exactly; `OH1, OH2` matched
nothing. *After:* a rule takes a list (`OH1, OH2 OH3 and OH4`), says it in words ("atom name OH1, OH2,
OH3 or OH4 in every SUG") with its count, flags a missing name with "0 atoms", and a menu lists the names
in the chosen residue with counts. Shift+Enter adds the rule and keeps the form open for the next one in
the same group, with the same residue name (as built in R1b it started a new group; you asked for this
instead, T139). Alt-click (option-click on macOS) keeps its scope, this atom name in every residue of its
name (T94); Ctrl was not used, because 3Dmol moves the structure on Ctrl+drag and macOS opens a menu on
Ctrl+click. Recipes and run records are version 3; version 1 files load and select the same atoms (frozen
fixtures). *Limitation:* no wildcards (question 19).

**R2 The box.** *Before:* none. *After:* the structure file's own box (`.gro` last line, rectangular or
triclinic; `.pdb` CRYST1), with lengths, angles, volume and the atoms outside; on by default, *B* toggles
it; a file without a usable box says why. *Limitation:* triclinic checked on a synthetic file (no real
triclinic structure here; question 13).

**R3 One definition per command.** `src/lib/commands.ts`: each command's inputs, options, names, refusals,
outputs with their PMF Sequences types, argv, stdin, and (R8–R9) which gmx tool it is and what its groups
are. RDF moved in unchanged: golden tests pin its argv, index and record. The analysis tab has a picker
grouped by what each command needs.

**R4 `gmx energy`.** Terms from the file's own menu, sent by number; statistics (average, Err.Est., RMSD,
drift) as gmx prints them, a drift larger than its error flagged, `--` read as no estimate; `-b` as
equilibration; an optional run input. Typed Energy by its file name (its title doesn't match PMF
Sequences' keyword). *Limitation:* checked on a rerun of the test trajectory (6 terms), not your files.

**R5 `gmx awh`.** The frames to write (last, every N-th, all) from a scan of the file, each name checked
free; `<stem>_t<time>.xvg` as PMF Sequences parses it; the last frame to the vault, typed PMF; kJ/mol.
*Limitation:* checked on a small AWH run made here; multi-bias names parsed but not run (mdrun assertion
on a short two-bias run).

**R6 `gmx wham`.** Windows by folder template, lists written beside the outputs, the temperature from the
run inputs (gmx wham would assume 298 K), `-b` as equilibration, bootstrap band, and the overlap of
neighbouring windows, gaps named, no verdict. Histograms to the vault; the profile not (it would be typed
Histogram; T118). *Limitation:* a 9-window set made here, not yours.

**R7 `gmx distance`.** Centres of mass or geometry, or atom pairs (equal sizes enforced: gmx pairs
unequal ones silently); averages to the vault, typed Distance; every distance, x/y/z and the histogram on
request. One view now serves every command with groups.

**R8 `gmx hbond`.** The selection tool (GROMACS 2024+) and the legacy one, never mixed: the legacy command
is offered only where the selection tool is missing, and there runs `gmx hbond`. Refusals as 2025.4
refuses (`-cutoff` < 0.35, `-hbr` > `-cutoff`, partial overlap, the legacy angle distribution with
merging). The count over time to the vault; distributions (densities, labelled so) stay. *Limitation:*
the legacy tool under its old name is tested through a fake gmx answering as 2023.3 (real 2023.3 can't
read the test system's run input).

**R9 rms, rmsf, gyrate, mindist** (question 35). Group roles per command (the fit group and RMSD groups;
one group; a reference and groups). `rms`: the fit group always measured first; `rmsf`: per atom or
residue; `gyrate`: two tools as for H-bonds (they agree on one molecule, not on several); `mindist`:
distances to the vault, contacts beside them. Each real 2025.4 run reproduces its fixture exactly.

**R10 Cluster jobs.** *Before:* none. *After:* a *cluster* tab with your jobs from `qq jobs` (the table)
merged with `gmx-eta -a` by job number: state in your hues, runtime/walltime, ETA and finish time in your
time zone, "—" with the reason, a walltime warning; filters, sorting, *show finished*; read when opened
and every minute while open and visible, one at a time, longer after failures; failures in words. It runs
`qq jobs`, `qq jobs -a` and `gmx-eta -a` on this machine only, never a kill or a submit. *Limitations:*
not run against your cluster (no `qq`, `gmx-eta` or Kerberos here): the parsers are built and tested on
your two samples; qq is read as the table because no `--yaml` sample came, and that table's width is
assumed to follow `COLUMNS` (T134); the expired-ticket message is a guess (any failure shows qq's own
words, with a kinit hint when they mention a ticket).

## 3. Outputs in PMF Sequences (section 3, completed)

Each type below was checked with PMF Sequences' own `detectAna` on real GROMACS 2025.4 output, under
the name gmx-cypher gives it (tests in `commands.test.ts` and each command's test file).

| Output | Header title | PMF Sequences type | Sent by default |
|---|---|---|---|
| rdf `-o` | Radial distribution | RDF | yes |
| rdf `-cn` | Cumulative Number RDF | RDF ✘ | no |
| energy `-o` | GROMACS Energies | Energy (from the name only) | yes |
| awh, each frame | AWH | PMF | the last frame |
| wham `-hist` | Umbrella histograms | Histogram | yes |
| wham `-o` (profile) | Umbrella potential | Histogram ✘ | no (question 28) |
| distance `-oav` | Average distance | Distance (first curve) | yes |
| distance `-oall` | Distance | Distance | no |
| distance `-oh` | Distance histogram | Histogram ✘ | no |
| hbond `-num` | Number of hydrogen bonds | H-bonds | yes |
| hbond `-dist`, `-ang` | … Distribution Histogram | Histogram ✘ | no |
| hbond `-dan` | Number of Donors and Acceptors | H-bonds (from "hbond" in the name) ✘ | no |
| hbond-legacy `-num` | Hydrogen Bonds | H-bonds | yes |
| hbond-legacy `-dist`, `-ang` | Hydrogen Bond Distribution | H-bonds ✘ | no |
| rms `-o` | RMSD | RMSD (first curve: the fit group) | yes |
| rmsf `-o` | RMS fluctuation | RMSF (x labelled "Residue", also for atoms) | yes |
| gyrate, gyrate-legacy `-o` | Radius of gyration (total and around axes) | Rg (the total) | yes |
| mindist `-od` | Minimum Distance | Distance (first curve) | yes |
| mindist `-on` | Number of Contacts < d nm | none | no |

✘: the type is wrong for the data; the PMF Sequences backlog item covers them.

## 4. Screenshots

All in `runner/docs/img/batch-2/`:

- atom-name list: `r1-names-light`, `p6-names-dark`; Shift+Enter, as it is now (a new rule in the same
  group, T139): `t139-shift-enter-same-group-light`, `-dark` (`r1b-shift-enter-groups-light` and
  `p6-shift-enter-dark` show the earlier behaviour, a new group); element colours with halos, and the
  group hues option (T141): `t141-element-colours-halo-light`, `-dark`, `t141-group-hues-light`,
  `t141-halo-looks-sheet`; C + click and the centre button (T140): `t140-centre-on-atom-light`,
  `t140-c-click-group-light`, `t140-centre-button-group-light`; the same-name click with its count (OW1 in every SOL: 800 atoms):
  `p6-alt-click-light`, `p6-alt-click-dark`;
- the box: `r2-box-nvt-light`, `p6-box-nvt-dark`, `r2-box-triclinic-synthetic-dark`,
  `p6-box-triclinic-light`;
- the command picker: `r3b-analysis-picker-light`, `r8-hbond-picker-light`, `p6-picker-dark` (2025.4, the
  legacy tools greyed with their reason), `r8-legacy-2023-picker-dark`;
- energy terms with statistics: `r4-energy-terms-light`, `p6-energy-dark`, `r4-energy-result-light`, `-dark`;
- AWH frames: `r5-awh-frames-light`, `p6-awh-dark`, `r5-awh-result-light`, `-dark`;
- the WHAM overlap check: `r6-wham-result-light`, `-dark`, `r6-wham-windows-light`;
- distance and H-bond results: `r7-distance-result-light`, `-dark`, `r8-hbond-result-light`, `-dark`,
  `r8-legacy-2023-result-dark`;
- rms, rmsf, gyrate, mindist: `r9a-…` to `r9d-…`, light and dark;
- the cluster view: `r10c-cluster-light`, `-dark`, `r10c-cluster-filtered-light`,
  `r10c-cluster-qq-failed-dark`, `r10a-settings-cluster-light`.

## 5. Tests

- **Count:** 273 passing (1 skipped) before; 620 passing (1 skipped) after, in 59 files. New files:
  `names-list`, `box`, `formats`, `golden-rdf`, `commands`, `stdin`, `energy`, `energy-run`, `awh`,
  `awh-run`, `wham`, `wham-run`, `distance`, `distance-run`, `hbond`, `hbond-run`, `rms`, `rmsf`, `gyrate`,
  `mindist`, `cluster`, `cluster-run`, `landing-ana`, `platform` (`.test.ts`).
- **With real tools:** every run test also runs against the real GROMACS 2025.4 built here
  (`GMX=… npx vitest run`: 613 passed, 8 skipped); real 2023.3 gave the `-h` texts and the "not a
  command" errors of the old tool names. `qq` and `gmx-eta`: never real here; fakes print your samples.
- **Playwright smoke test:** passes (pick inputs, make groups, run, see the chart).
- **Each commit on its own** (a detached worktree per commit: lint, build, tests, `app/` unchanged):
  every commit from R3a on passes all four, the Phase 6 ones included. Two earlier ones don't, and
  history is not rewritten (section 21):
  - `fdda051` (R3-0) does not build alone: an unused parameter in its new test, which `tsc -b` refuses
    (`test/golden-rdf.test.ts:101`). `05f9e31`, the next commit, fixes it.
  - `9eb25e0` (R3b) had one failing test in that check, which ran beside a Chromium sweep. Two reruns of
    that commit passed 325 of 325, and three parallel runs of the final suite passed 608 each, so the
    test was not identified.
- **Manual QA** (Chromium, real gmx 2025.4 unless said; console watched):

| Check | Result |
|---|---|
| Atom-name list, its words and count; unknown name flagged | passed |
| Shift+Enter: a new rule in the same group, same residue name, focused (after your request) | passed (also an e2e test) |
| Alt-click: the name in every residue of its name, with count | passed |
| Box, rectangular (nvt) and triclinic (synthetic); B key; no-box reason | passed |
| Picker; a tool this gmx lacks greyed with the reason | passed (2025.4, and the 2023.3 fake) |
| Energy terms, statistics, drift flag | passed |
| AWH frames and result | passed (a run made here) |
| WHAM windows, temperature, overlap, bootstrap band | passed (a set made here) |
| Distance com/pairs, unequal pairs refused | passed |
| H-bonds: refusals, run, result | passed; legacy under 2023.3 names: passed with the fake only |
| rms, rmsf, gyrate, mindist: groups step roles, refusals, runs | passed; gyrate-legacy under 2023.3 names: fake only |
| Cluster tab with your samples: rows, merge, ETA, finish time, filters, sort, show finished | passed (fakes) |
| Cluster tab, qq failing | passed (fake, invented message) |
| Cluster tab on your cluster, with running, queued and finished jobs | **not run** (no cluster here) |
| An expired Kerberos ticket | **not run** (no Kerberos here) |
| Kill on a throwaway job | not built (watch only) |
| Review fixes: `-de N O S` typed, rms's stdin answers with and without a fit, AWH "every 10th" typed | passed |
| Every command's view, the groups step and the cluster tab, light and dark, final build | passed: no console errors or warnings |

## 6. Review

Two fresh-context reviews, each by an agent that had not written the code, read against section 20.

- **R1–R4** (after R4, question 40): eleven findings, all fixed in `69bd3b7` (T105–T110): options
  crossing commands, energy's `--` read as a number, inputs not per command, an empty record read as a
  server error, CRYST1 without a full cell, the B key, the platform's Alt name, batch and recipe checks.
- **R5–R10** (Phase 6): thirteen findings, all fixed in `6d73569` (T138), each with a test:

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | gmx rms with `-fit none` got a fit-group answer it never asked for: every group shifted by one, and the run read done | blocker | no fit answer without a fit (checked with 2025.4; a fixture and the fake model it) |
| 2 | gmx wham's default output folder (the windows' common folder) could be outside the allowed folders | should-fix | refused; an output folder inside them is asked for |
| 3 | `-de`/`-ae` lost their spaces while typed, and "NO" passed as one symbol | should-fix | spaces kept while typing, tidied on leaving; symbols must be apart |
| 4 | hbond-legacy did not refuse partial overlap (gmx stops on it) | minor | the same overlap check as gmx hbond |
| 5 | a running qq row without %CPU/%Mem showed its node as a plan | minor | a running row keeps its node |
| 6 | a timeout killed the cluster tool but not what it started | minor | its own process group, stopped whole (a test with a child holding the output) |
| 7 | settings took any program, or a relative path, as qq or gmx-eta | minor | the tool's own name, or an absolute path to a program that exists; README says so |
| 8 | enum and on/off options of the R8–R9 commands were not checked | minor | checked in words before anything runs |
| 9 | the shown command lacked the stdin answers | minor | shown under it |
| 10 | *run again* named a record that doesn't exist (the first extra file's stem) | minor | records name themselves |
| 11 | batch texts still said rdf | minor | they name the picked command |
| 12 | AWH "every 2th", and 10 could not be typed | minor | ordinals; clamped only when valid |
| 13 | the cluster tab ignored its backoff on return, and counted a reused read as a failure | minor | the next read keeps its time; only new reads count |

The review also checked, and found sound: no shell anywhere, fixed cluster arguments, every path inside
the allowed folders, free names for every extra file, the stdin answers of rmsf, gyrate-legacy, mindist,
hbond-legacy and rms (with real 2025.4), tool resolution on 2023 and 2025, group-count checks agreeing
everywhere, and the cluster parsers on your samples.

## 7. Decisions

T90–T138 in [decisions.md](decisions.md).

## 8. Roadmap and backlog

[roadmap.md](roadmap.md): Phases 0–6 ticked except R10d. Backlog, updated: job submission; a Morpheus
Table, Combobox and `LineChart` error band (built locally here); PMF Sequences types for energy (title),
distance and H-bond distributions, the WHAM profile; trajectory preparation (`trjconv`); energy and AWH
batches and recipes (question 36: not built in this batch).

## 9. History

`git log --oneline eeb8292..HEAD`:

```
(this report)
6d73569 Review fixes for R5–R10: rms without a fit, wham's output folder, typed lists, process groups
9ea4489 Phase 6: README for batch 2; each greyed command gives its reason in the picker
43d990f R10c: the cluster tab: your jobs with their ETA, finish time and walltime warning
5fdce2b R10a: the cluster runner: qq jobs and gmx-eta -a on this machine, one at a time
24c4f39 R10b: qq jobs and gmx-eta -a read by pure functions, merged by job number
ba266af R9d: gmx mindist: minimum distance to each group, contacts when asked
8396885 R9c: gmx gyrate: the selection tool, or the legacy one where it is missing
4d3129a R9b: gmx rmsf: fluctuation per atom or per residue of one group
46bcb7a R9a: gmx rms: the fit group and further groups after that fit; group roles per command
544f591 R8: gmx hbond: the selection tool, or the legacy one where it is missing
f7ceaf3 R7: gmx distance: centres or pairs to each selection; one view for commands with groups
0dce64b R6: gmx wham: windows from a folder template, the temperature, neighbour overlap, bootstrap band
5770c18 R5: gmx awh: the frames to write, PMF Sequences names, kJ/mol
69bd3b7 Review fixes for R1–R4: options per command, missing estimates, inputs per command, Shift+Enter groups
90e50ca R4: gmx energy: terms by number, statistics with errors, drift flag, equilibration cut
9eb25e0 R3b: command picker, stdin answers for jobs and reads, the analysis tab
05f9e31 R3a: one definition per GROMACS command; RDF moved in; records and recipes v3
fdda051 R3-0: golden tests for RDF before the move into a command definition
785e2b8 R2: the periodic box from the structure file (rectangular and triclinic)
31cebe4 R1a + R1b: atom-name lists; Shift+Enter keeps the residue name
d2cf007 R1-0: frozen v1 recipe and run record
e53214e Phase 0: batch 2 plan, verified facts and mockups
```

`git diff --shortstat eeb8292..6d73569`: 302 files changed, 23 257 insertions, 288 deletions (most of
it fixtures: real GROMACS outputs, help texts and your samples, and screenshots). `app/`: no change
(`git diff --stat eeb8292..HEAD -- app/` is empty, and every commit's own check says so).

## 10. Open, for you

1. **A `qq jobs --yaml` sample** (and `qq jobs -a`, `qq jobs -e`): the table parser depends on qq's
   layout; YAML would not. `-e` would allow *analyse this job*.
2. **The cluster view on your cluster:** run gmx-cypher where `qq jobs` works and open *cluster*; an
   expired ticket's real message would let the hint match it exactly.
3. **Your committed samples:** `test/fixtures/cluster-tools/` holds your `gmx-eta -a` and `qq jobs`
   output with your user name, scratch paths and host names replaced (section 21 asks before committing
   samples with personal details: these have none left, but say if you want them out).
4. **Your own files:** an energy file and its menu, a small AWH run, a WHAM set (questions 9–11), and a
   triclinic structure (question 13).
5. **`-h` texts from 2021.4 and 2022.3** (question 12), and a real pre-2024 run of the legacy H-bond and
   gyrate tools on your data.
6. **The WHAM profile** (question 28): send it, and as what?
7. **The push:** the branch is on `claude/quirky-cray-q845sa` (a fast-forward, nothing rewritten). Say
   if it should go elsewhere, or if you'd rather it hadn't been pushed.
