# gmx-cypher: final report

Branch `claude/quirky-cray-q845sa`, on the baseline `e8a452c` (PMF Sequences from the zip, unchanged).
Everything in the spec's roadmap (R1–R7) is built, tested and checked by hand, with the exceptions and
deviations listed below. A fresh-context review found eleven problems, one of them a blocker (a structure
from another system ran); all are fixed. `app/` is unchanged (checked by every `npm test`).

## What was built

A local server (Node 22, no framework) and a React page in Morpheus that:

- finds `gmx` (configured, else `gmx_mpi` then `gmx` on `PATH`), and reads its own `gmx rdf -h`;
- takes inputs by path inside allowed folders or by upload, suggests the rest from the trajectory, and
  checks atom counts as gmx reads them (`gmx dump`, `gmx check`) before anything runs;
- draws the structure with PMF Sequences' own code and maps each drawn atom to its GROMACS number
  (virtual sites and the `.gro` 100 000 wrap included);
- builds groups by click, residue, atom name across residues, rules, typed ranges or index groups,
  flags overlaps, and confirms every group's size with `gmx select` against the run input;
- shows every `gmx rdf` option with its installed default and what it changes, names what gmx would
  refuse, and shows the exact command, which is then run without a shell;
- writes four new files per run under one free stem (never overwriting), with a run record that can run
  it again;
- shows progress against an estimate, cancels the whole process group, and draws g(r), the first peak
  and the cumulative number;
- reads a PMF Sequences vault read-only, previews where a result will land with PMF Sequences' own
  `planBatch`, and sends it into the project's `_inbox`;
- saves recipes, and runs one recipe over every trajectory a path template finds, a few at a time.

## Items, lines and tests

Lines are added lines in `runner/` per commit (code: `src` without the copied Morpheus components,
`server`, `scripts`; tests: `test`, `e2e`, without fixtures). Tests is the number of passing Vitest
cases at that commit (counted by checking each commit out in a temporary worktree).

| Item | Commit | Code | Tests (lines) | Tests passing |
|---|---|---:|---:|---:|
| Phase 0: plan, decisions, wireframes | `6a0dd29` | 0 | 0 | — |
| R1a scaffold, Morpheus theme and fonts, app/-unchanged check | `28ebcc8` | 301 (+1092 copied UI) | 41 | 5 |
| R1b server on 127.0.0.1, token, Host/Origin | `a3d1a37` | 200 | 151 | 18 |
| R1c gmx configuration and detection, fake gmx | `a2f2114` | 237 | 259 | 32 (+1 skipped) |
| R1d jobs without a shell, progress, cancel | `fd64dac` | 376 | 220 | 48 |
| R2a inputs by path, upload, suggestions | `313f1c8` | 323 | 181 | 72 |
| R2b input checks with gmx | `1182051` | 172 | 125 | 89 |
| R3a 3D view, drawn atom → GROMACS number | `780fbba` | 217 | 98 | 105 |
| R3b groups by click, residue and rule; overlaps | `32fb189` | 278 | 81 | 131 |
| R3c `.ndx` read/write, index groups, `gmx select` sizes | `9293cd0` | 160 | 101 | 142 |
| R4a options from `gmx rdf -h`, form, command | `bb28fe8` | 356 | 120 | 175 |
| R5 names, folders, run record, no overwrite | `bb66fd7` | 402 | 242 | 199 |
| R4b run, progress, cancel, log | `d2531c4` | 99 | 46 | 210 |
| R4c result chart and summary | `18c661e` | 140 | 50 | 215 |
| R4d Playwright smoke test | `af70e6d` | 0 | 67 | 215 (+1 e2e) |
| R5 fix: plan refusals while typing | `aea4829` | 24 | 2 | 194, 19 failing ¹ |
| R6a read-only vault reader | `e682d8a` | 148 | 89 | 220 |
| R6b landing preview with `planBatch` | `9d9f036` | 230 | 116 | 229 |
| R6c send to `_inbox`, next steps | `17d4633` | 99 | 98 | 234 |
| R7a recipes | `cf7e42c` | 159 | 66 | 239 |
| R7b batches and queue | `209520b` | 381 | 161 | 252 |
| Phase 6 README | `2bad561` | 0 | 0 | 252 |
| Phase 6 QA fixes: focus after dialogs, no batch run without gmx | `b17ff39` | 13 | 0 | 252 |
| Phase 6 report draft and QA screenshots | `e876bd8` | 0 | 0 | 252 |
| Review fixes 1–6 | `41ccb30` | 128 | 120 | 262 |
| Review fixes 7–11 | `9b4351f` | 143 | 150 | 273 |
| Phase 6 final report | this commit | 0 | 0 | 273 |

¹ My staging mistake: that commit took `server/api.ts` with R6a's routes, which import `server/vault.ts`
from the next commit, so `aea4829` alone doesn't build and 19 tests fail there. `e682d8a` completes it.
History was not rewritten (your rule), and its message says so.

Totals now: 4,166 lines of code (plus 1,092 copied Morpheus UI lines), 2,554 lines of tests;
273 Vitest cases pass, 1 is skipped without `GMX` (with `GMX` set, 14 real-gmx cases pass), 390 PMF
Sequences tests pass, and the Playwright smoke test passes in about 6 s (8 runs in 8 with the unit tests
running beside it).

## Acceptance criteria

The reviewer's verdict at `2bad561` (before its findings were fixed), and where each stands now.

| Criterion | Reviewer | Now | Why |
|---|---|---|---|
| A Runs safely | partly met | met | No shell; token, Host and now an exact Origin (T77); files created exclusively; cancel leaves no process. Fixed: a read error no longer stops the server (T76), gmx runs with `GMX_MAXBACKUP=99` (T80), no outputs inside the vault (T87), uploads are GROMACS inputs only (T88). |
| B Groups are right | partly met | met | Positional atom map, sizes confirmed by `gmx select`, overlaps flagged. Fixed: a structure whose atom count isn't the run input's is refused, in a run and in the batch preview (T75); tested with real 2025.4 on your system minus its sulfate. |
| C RDF is right | met | met | The reviewer hand-ran a recorded argv with real 2025.4: only the two header lines differ (T28), as in my check below. |
| D Reproducible | met | met | Record v1 and *run again*; the record now also keeps `GMX_MAXBACKUP=99`. |
| E PMF Sequences takes it | met (tests) | met (tests and its own code) | Contract tests pass; the attach was checked with PMF Sequences' own code in Node, not in its page and not on your vault (see Manual QA). |
| F Flexible | partly met | met | Fixed: PMF Sequences' tokens in a batch's output names (T78), runs of a batch sharing an output folder (T79). |
| G Morpheus | mostly met | met | Fixed: text on marked rows at 4.5:1 or more in both themes (T83), batch progress announced (T84). Checked at 1024 px, light and dark, with no console messages. |
| H Quality | met so far | met | Lint, build, all tests, real-gmx tests, the smoke test and `app/` unchanged, at every commit since; the table above is committed. |

## Manual QA

Run here in headless Chromium (Playwright, WebGL through SwiftShader), not in your Chrome; with real
GROMACS 2025.4 built from Ubuntu's copy of its source (CPU only) on your test system (`nvt.tpr`,
`nvt.gro`, `nvt.xtc`, 3,242 atoms, 21 frames), staged under a path shaped like yours
(`hmr+fast+6/so4/NA2SO4/9.multiwalker/1`). Every screen was checked in light and dark with the console
watched; none logged an error, except the browser's own line for a request the server refused by
design while I typed a wrong vault path (a button press, 400).

| Check (spec) | Result | Evidence |
|---|---|---|
| R1: start, open, both themes | passed | [settings](img/qa/r1c-settings-dark.png), [no token](img/qa/r1b-refused.png) |
| R1: a missing `gmx` | passed, one gap fixed | [the message](img/qa/r1c-missing-light.png) (R1c); rdf shows no run button without gmx; the batch view still offered *run* (the server refused it), now replaced by the message |
| R1: keyboard only | passed, one gap fixed | header, tabs and settings by Tab, arrows, Enter and Escape at 1024 px (no horizontal scroll); closing settings or the send dialog left the focus on the page instead of the button that opened it, now fixed. Batch form and send dialog also by keyboard. |
| R3: reference + two selections on `WTA.gro` and `test.pdb`, by click and rule | passed | [WTA](img/qa/r3b-wta2-light.png), [test.pdb](img/qa/r3b-pdb-light.png): shift-click GLY 5 → 30–36, alt-click → CA in every GLY |
| R3: an `.ndx` of your test system | passed | [index groups](img/qa/r3c-light-ok.png); gmx select agrees: sodium 12 · OW 800 · sulfate 30; [atom 9999 refused](img/qa/r3c-dark-beyond.png) |
| R3: keyboard only, light and dark | passed | [keyboard](img/qa/r3b-keys-dark.png) |
| R4: a real RDF vs a hand-run of the same command | passed | identical apart from `This file was created …` and the backronym line (see below) |
| R4: cancel halfway | passed, with the fake gmx slowed | real gmx reads your 21 frames in under a second; [running](img/qa/r4b-fake-light-running.png), cancelled at frame 9, no process left |
| R4: a run that fails (a wrong group) | passed with another failure | the GUI cannot produce a wrong group (groups are numbered from its own index); real `-b 100` fails in gmx's words, shown first: [failed](img/qa/r4b-failed2-light.png). The wrong-group text is tested on real 2025.4 stderr. |
| R6: send a real RDF to a copy of your vault | partly | your vault isn't here; sent to a vault made by PMF Sequences' own code: [preview](img/qa/r6b-light.png), [sent](img/qa/r6c-sent-light.png) |
| R6: attach in PMF Sequences, lands where the preview said | partly | not in PMF Sequences' page (it opens a vault through the browser's folder picker); done with its own code in Node on a copy (adoptUntracked, the upload form as its App builds it, planBatch, addBatch, save, reopen): NA2SO4 × SO4 · run 1 · RDF with water_O. This found a real preview error (a second row), fixed: [warning](img/qa/r6c-twin-dark.png) |
| R7: a batch over a cluster-shaped copy with your files | passed | [preview](img/qa/r7b-light-preview.png), [done and sent](img/qa/r7b-light.png), [cancel all](img/qa/r7b-cancel-dark-armed.png) |

**Criterion C, exactly.** The run `rdf_nvt (2)` (sulfur → water_O, sodium; `-rmax 1.5 -cn`), its
recorded argv run by hand in the same folder, both `.xvg` files diffed:

```
== rdf_nvt (2).xvg
< # This file was created Fri Oct  9 00:33:05 2026
> # This file was created Fri Oct  9 00:38:48 2026
< # Gromacs Runs One Microsecond At Cannonball Speeds
> # Guyana Rwanda Oman Macau Angola Cameroon Senegal
== rdf_nvt (2)_cn.xvg   (the same two lines, nothing else)
```

**Tests with the real gmx** (`GMX=…/gmx2025/bin/gmx`): input checks on your system (3,242 × 3, the
index fits, 21 frames estimated), `gmx select` sizes (sulfur 6, water_O 800, sodium 12; atom 9999
refused), whole runs (four files, record, a taken name → `rdf_nvt (2)`, refusals, a structure of
another size, an output folder in the vault) and `--version`: 14 passed. The fake-gmx-only cases (files made to appear during a run) are skipped with a real gmx.

## Fresh-context review

A separate agent that had not seen this work reviewed the branch at `2bad561` against section 15, read
only. It tested a `git archive` copy in the scratchpad (the working tree was changing under it), ran
every check, hand-ran a recorded command with real 2025.4, and wrote its own probes (Origin and Host,
the batch race, the stream crash, the structure mismatch with real gmx, name tokens, the page at 1024 px).
Its eleven findings, most severe first, all fixed with a test written first:

| # | Finding | Fix | Commit |
|---|---|---|---|
| 1 | **Blocker:** a run went ahead with a structure that wasn't the run input's system: "sodium" became sulfate atoms, and `gmx select` agreed because it counts numbers | refused before anything is written, in runs and the batch preview (T75) | `41ccb30` |
| 2 | **Major:** a picked `.gro` that couldn't be read (a folder named `dir.gro`) stopped the server and with it the jobs | one `sendFile`; a read error ends that answer only (T76) | `41ccb30` |
| 3 | **Major, security:** a page on any other port of 127.0.0.1 passed the Origin check and got the cookie | Origin must equal the Host; POSTs must be JSON (T77) | `41ccb30` |
| 4 | **Major:** PMF Sequences' tokens in output names never had values; a batch previewed clean, then every item was refused | batch path fields fill them; the preview and a single run say which tokens exist (T78) | `41ccb30` |
| 5 | Runs of a batch sharing an output folder raced for one name; about one per slot was refused | the stem claimed by an exclusive `.ndx`; a batch run takes the next free name (T79) | `41ccb30` |
| 6 | gmx inherited `GMX_MAXBACKUP=-1` from cluster shells, so a file appearing mid-run was overwritten (verified with 2025.4) | jobs set `GMX_MAXBACKUP=99`, shown and recorded (T80) | `41ccb30` |
| 7 | Group cards keyed by position: removing one armed the next | stable keys (T82) | `9b4351f` |
| 8 | Light-theme contrast on `secondary` 4.18–4.32 | marked rows on `muted`/`background`, tested from the tokens (T83) | `9b4351f` |
| 9 | Batch progress not announced | one polite live region (T84) | `9b4351f` |
| 10 | Send all not isolated per item; a retry duplicated files | caught per item (T85) | `9b4351f` |
| 11 | Nits: a recipe replaced silently; an output folder inside the vault; any upload type; one unreadable folder failed the preview, linked folders skipped | asked first (T86); refused (T87, T88); the walk goes on and names what it skipped (T89) | `9b4351f` |

Found while checking the fixes: the smoke test failed 1 run in 8 under load, on a 404 the browser
logged while the page polled for a record still being written. The server now waits for it (T81), and
the test passed 12 runs in 12 under load after. The fixes were checked in the page too:
[preview with the mismatch and a skipped link](img/qa/review-batch-preview-dark.png),
[recipe name taken](img/qa/review-recipe-armed-light.png), [batch done and sent](img/qa/review-batch-sent-light.png),
[the command with `GMX_MAXBACKUP=99`](img/qa/review-jobs-light.png).

The fixes themselves have not had a second fresh review.

## Deviations and things to know

- **First peak (T27 → T62).** The approved rule took 0.292 nm (g = 13.2) for your sodium curve, because
  single empty bins split its first shell (12 ions, 21 frames). Dips below 1 narrower than 0.01 nm are
  now bridged: 0.304 nm, g = 36.6. A test keeps a real second shell out.
- **Row matching in the preview (T70).** PMF Sequences matches rows by group, name *and* sequence. With
  patterns that give no sequence, attaching starts a second row of the same name; the dialog now says
  so and how to avoid it (type the sequence in PMF Sequences' upload dialog, or add `{seq}` to the
  file pattern). So criterion E holds without typing only when the project's patterns give the
  sequence, or the row is new.
- **Uploads' outputs** go to one `<state>/workspace/` folder, not one per job (T57).
- **Output names in a single run** have only `{analysis}` and `{trajectory}`; PMF Sequences' tokens get
  values only in a batch, from its path template (T78). Sending fills the project's own pattern either way.
- **A second save of a recipe name** now asks before replacing (T86, changing T71).
- **Test-first** was followed for most items; for R5's run pipeline and R6b's landing preview I wrote the
  code first (to see what `planBatch` returns), then the tests, and checked R5's no-overwrite test by
  removing the re-check (it failed).
- **Hashing trajectories** is set in `config.json` (`"hashTrajectories": true`); there is no switch in
  the page.
- **Batches live in memory**: after a restart their jobs show as interrupted, and the batch can be
  started again.
- **Your test system is committed** under `runner/test/fixtures/nvt/` (Q21, as recommended); your
  33,584-atom `index.ndx` is not.

## Not done

- The R6 checks with your own vault and in PMF Sequences' page (above).
- A check in your Chrome on your machine, and with your `gmx_mpi` under `module add` (all checks used
  the 2025.4 built here).

## Backlog

As in [`roadmap.md`](roadmap.md), plus for PMF Sequences: when a file gives a row name but no sequence,
offer the existing row of that name instead of starting a second one.
