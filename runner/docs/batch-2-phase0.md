# Batch 2, Phase 0: plan

Status: **stopped for your answers** (spec 0.3). No code changed. Phase 1 has not started.

- **Baseline commit:** `eeb8292` (`Phase 6: final report…` on `claude/quirky-cray-q845sa`). The work is on a new local branch `cypher-batch-2` from it. **Not pushed**: section 21 says not to push unless you ask, and the branch to push to is question 41.
- **Mockups:** `runner/docs/img/batch-2/mock-*.png`, light and dark, one per requested screen (section 12 below). They are drawn with Morpheus tokens (`runner/src/tokens.css`) and fonts, not with the built components. Where the repo has real data, they use it (nvt box and atoms, a real energy file, the WHAM histogram fixture). The cluster table uses invented job IDs and times and is labelled as such.
- **Tools used:** GROMACS 2025.4 built in this environment (`gmx`), and PMF Sequences' own `detectAna`, `parseTable` and `parseGmxHeader` from `app/`, run from scratch scripts outside the repo.

---

## 1. Baseline

| Check | Result |
|---|---|
| `runner/scripts/app-unchanged.mjs` | `app/ unchanged since e8a452c` |
| Cypher `npm run lint` (oxlint) | exit 0 |
| Cypher `npm run build` | passes (`tsc -b`, `vite build`) |
| Cypher `npx vitest run` (no `GMX`) | 34 files passed, 1 skipped; **273 passed, 1 skipped** |
| Cypher `GMX=<gmx 2025.4> npx vitest run` | 35 files passed; **270 passed, 4 skipped**. The spec's "14 real-gmx tests" was not counted separately; the difference (3 more skipped) is the fake-gmx-only cases |
| Cypher `npm run e2e` (Playwright smoke) | 1 passed (8.8 s) |
| `app/` `npx vitest run` | 20 files, **390 passed** |
| `app/` `npx oxlint` | 0 errors; warnings not recounted (the last report said 7) |

All as stated in the spec's baseline, except the `GMX` run's count, which is recorded above.

---

## 2. Cypher as it is now (current state)

### 2.1 RDF: defined, built, run, recorded

| Step | Where |
|---|---|
| The option list (a curated `FORM`, 15 flags, each with a group, label, unit and one-line effect) | `src/lib/rdf.ts:18` |
| Defaults and what each option is, from the installed `gmx rdf -h` | `src/lib/rdf.ts:41` (`isDefault`), the help is parsed in `src/lib/gmxText.ts` |
| The argument list, in fixed order: `rdf -f -s -n -o [-cn] <changed options> -ref 'group 0' -sel 'group 1' …` | `src/lib/rdf.ts:44` (`rdfArgs`) |
| `xvg` and `tu` are always set (`xmgrace`, `ps`) | `src/lib/rdf.ts:37` (`FIXED`) |
| What gmx would refuse, in words, before a run | `src/lib/rdf.ts:61` (`recipeProblems`) |
| The working folder and output paths (relative, in the trajectory's folder) | `src/lib/rdf.ts:93` (`rdfIo`) |
| Stem and the four output names (`.xvg`, `_cn.xvg`, `.ndx`, `.run.json`) | `src/lib/names.ts:7–29` (`DEFAULT_TEMPLATE`, `renderStem`, `outputNames`, `freeStem`) |
| Plan for the UI and API (paths, names, argv, the environment, problems) | `server/runs.ts:39` (`planRun`) |
| Start: plan, atom count check (`gmx dump`), size check (`gmx select`), `.ndx` written exclusively, job started | `server/runs.ts:93` (`startRun`) |
| Job runner: a generic process in its own process group, stdio ignored, event log | `server/jobs.ts:11` (`JobSpec` with `kind`, `title`, `file`, `args`, `cwd`, `env`, `meta`), line 98 (`spawn`) |
| Run record written when the job ends (v1) | `server/runs.ts:132–149`, `src/lib/record.ts:15` (`RunRecord`), `:58` (`buildRecord`) |
| Result view: curves, first peak, cumulative number, groups and files | `src/views/Result.tsx` (`RunResult`, `RdfChart`), `src/lib/rdf.ts:111` (`resultSeries`), `:126` (`firstPeak`) |
| The page: the form, the command shown (`command.ts`), the run button | `src/views/Rdf.tsx`, `src/lib/command.ts` |

### 2.2 Groups: picked and stored

| Step | Where |
|---|---|
| Rule kinds: `resname`, `resnr`, `name` (with `resn?`), `element`, `atoms` | `src/lib/groups.ts:8–13` |
| A group is a role, a name, a hue and a list of steps (each `add` or `remove`) | `src/lib/groups.ts:15–16` |
| Rule text (what the group card and the record show) | `src/lib/groups.ts:18` (`ruleText`) |
| Matching is exact (`a.name === r.value`), so `OH1, OH2` matches nothing | `src/lib/groups.ts:29` (`matches`) |
| Clicks as steps (toggling; shift = residue; alt = name in every residue of the same residue name) | `src/lib/groups.ts:63` (`clickStep`) |
| Group names: one word, a short character set, unique ignoring case (T18) | `src/lib/groups.ts:79` (`nameProblem`) |
| The rule form: its options come from **all** atoms of the structure, not one residue | `src/views/Groups.tsx:31–70` (`RuleForm`, options at lines 35–37) |
| Enter in the value field adds the step; the form closes (`onStep` → `setRule(false)`) | `src/views/Groups.tsx:64` (Enter → `go('add')`), `:126` (GroupCard) |
| Typed atom numbers become steps against what the group holds | `src/views/Groups.tsx:88–100` (`commitTyped`) |
| The group is written to a `.ndx` per run, referenced as `group N` (T17) | `src/lib/ndx.ts` (`writeNdx`), `server/runs.ts` (`writeFileSync(… 'wx')`), `src/lib/rdf.ts:44` |
| Stored in the browser draft (`localStorage`), in recipes (v1) and in run records (v1) | `src/draft.ts`, `src/lib/recipe.ts:10–27`, `src/lib/record.ts:15` |

### 2.3 The 3D view: keys and clicks

- The viewer is 3Dmol (`src/views/Viewer.tsx`). It loads PMF Sequences' `toPdb` text with `keepH`, and picks through `setClickable`: `e.shiftKey` → residue, `e.altKey` → atom name, otherwise → atom (`src/views/Viewer.tsx:66`).
- **Hint line** (`src/views/Groups.tsx:166–167`): `shift` click: its residue; `alt` click: its atom name in every residue of that name. The hint shows `alt` everywhere; there is no platform check in the code (nothing reads `navigator` or the platform for this).
- **3Dmol's own mouse keys** (`node_modules/3dmol/build/3Dmol.es6.js:22348` sets `mouseButton = ev.which`; the modes are at 22569–22580): left drag rotates; **Shift**+drag zooms; **Ctrl**+drag translates (moves the structure); right-button drag zooms and Ctrl+right-button drag slabs; middle-button drag translates; the wheel zooms (Ctrl+wheel inverts it).
- The viewer has three controls: *look*, *hydrogens* and *water & ions* (`Viewer.tsx:93–97`). No box.

### 2.4 Outputs, names and the vault

- Name tokens: `{analysis}` (`rdf`) and `{trajectory}` in a single run (`server/runs.ts:50`). Batches also fill PMF Sequences' fields from the path template (`src/lib/batch.ts` `nameValues`, T78).
- Sending: `server/send.ts:14` (`sendToInbox`) copies the `.xvg` into `<project folder>/_inbox/` under PMF Sequences' `uniqueName`. The preview is `landing()` (`src/lib/landing.ts:30`) and `landingFor` (`server/vault.ts:125`), which call PMF Sequences' `planBatch`.
- Only the `.xvg` (g(r)) is sent; the cumulative-number file is not (T35).

### 2.5 Cypher's own files

| File | Format | Written by | Read by |
|---|---|---|---|
| Recipe | `format: 'gmx-cypher recipe'`, `version: 1`, `analysis: 'rdf'`, options, groups (steps), template, outDir | `src/lib/recipe.ts:26` (`recipeFromDraft`), `server/recipes.ts` | `src/lib/recipe.ts:38` (`recipeFileProblems`; the version check is at line 41) |
| Run record | `format: 'gmx-cypher run'`, `version: 1` (`RunRecord`): runner, gmx, env, command, times, inputs, groups, options, outputs (kinds `xvg`, `cn`, `ndx`), problems, recipe | `server/runs.ts` (`buildRecord`) | `src/lib/record.ts:81` (`recordProblems`, refuses version ≠ 1) |
| Config | `config.json` in `~/.gmx-cypher` (or `GMX_CYPHER_HOME`): `gmx`, `allow`, `vault`, `pmfUrl`, `concurrency`, `hashTrajectories` | `server/state.ts:33` (`saveConfig`) | `server/state.ts:27` (`loadConfig`) |
| Job event log | `<state>/jobs/<id>.ndjson` | `server/jobs.ts` | the jobs view |
| Uploads, checks, batches | `<state>/uploads/`, `<state>/checks/`, batches in memory | `server/files.ts`, `server/check.ts`, `server/batch.ts` | the pages |

### 2.6 Where Cypher runs

- On the machine you start it on (Node 22.18 or newer). It serves its page on `127.0.0.1` only, with a token and Host/Origin checks. For a workstation with the trajectories, you open it through an SSH tunnel (`runner/README.md`). Nothing in it talks to a cluster yet.
- The file browser shows only the allowed folders (`server/files.ts:27`, `listFolder`): folders and every file with a GROMACS role (inputs and `.xvg` outputs); other files are counted as hidden.
- Uploads accept `.xtc .trr .tng .tpr .gro .pdb .ndx` (`server/api.ts`, `inputRole`, T88).
- Tabs: `inputs · groups · rdf · jobs · batch` (`src/App.tsx:20`, T40).

---

## 3. This spec's claims, checked

Verified = matches the code or real output. Corrected = partly wrong, with what is right. Not checked = not possible here.

| # | Spec says | Result | Evidence |
|---|---|---|---|
| 1 | The atom-name rule takes one name (`{ kind: 'name', value, resn? }`) | **Verified** | `src/lib/groups.ts:11` |
| 2 | `OH1, OH2` today matches nothing | **Verified** | exact `===` in `matches` (`groups.ts:29`) |
| 3 | The value field suggests every atom name in the structure | **Verified** | `Groups.tsx:35–37` |
| 4 | Enter adds the step, clears the name and residue name, and closes the form | **Verified** | `Groups.tsx:64`, `:126` (`onStep` → `setRule(false)`) |
| 5 | Clicks toggle; shift = residue; alt = name in every residue of this name | **Verified, one detail**: alt's scope is the atom's own residue name (`clickStep` sets `resn: a.resn`), not every residue | `groups.ts:65`, `Viewer.tsx:66` |
| 6 | The hint shows `alt` on every platform (`option` on macOS) | **Corrected.** The hint shows `alt` only. On macOS the Option key sets `altKey` in browsers, so the gesture works, but this was not tested in a Mac browser and nothing in the UI says `option` | `Groups.tsx:167` |
| 7 | 3Dmol: Ctrl+drag moves, Shift+drag zooms | **Verified** | `3Dmol.es6.js:22569–22580` |
| 8 | Processes start with stdin ignored, in `capture()` and in the job runner | **Verified** | `server/gmx.ts:23`, `server/jobs.ts:98` |
| 9 | Recipe and run record readers refuse any other version | **Verified** | `recipe.ts:41`, `record.ts:81` |
| 10 | A v1 recipe is RDF only (`analysis: 'rdf'`) with at least a reference and a selection | **Partly.** `recipeFileProblems` checks the format, version, name, options and at least two groups with known rule kinds. It does **not** check `analysis`. | `recipe.ts:38–50` |
| 11 | The run record v1 has only RDF outputs (`xvg`, `cn`, `ndx`), RDF's inputs, RDF's options, and no stdin field | **Verified** | `record.ts:12`, `:30`, `:35–36` |
| 12 | `LineChart`: 8 tones, dashes, dim/off, max/min marker, no error band | **Verified**: `TONES` has 8 (`src/lib/tones.ts:3`); 10 dashes (`DASH`); no band (in Morpheus's copy too) | `src/ui/line-chart.tsx` |
| 13 | Cypher's copies are unchanged (T47) | **Verified** for `line-chart.tsx` (byte-identical to Morpheus's current file) | `diff` against the Morpheus artifact |
| 14 | `Stat` is a first-time component | **Corrected.** It is already copied (in `src/ui/card.tsx`) and used on the result screen | `Result.tsx:99–101` |
| 15 | Morpheus has no table and no combobox | **Verified** from its file list (`components/src/ui/`: no table, no combobox). **New:** Morpheus has `dropdown-menu.tsx` with checkbox items, which is a usable, non-searchable multi-select | Morpheus artifact file list |
| 16 | `toPdb` writes no box for `.gro`; keeps `CRYST1` for `.pdb` | **Verified by reading the code** (`app/src/lib/structFile.ts:118–150`). Not run on a `.pdb` with `CRYST1`: `test.pdb` has no box line | |
| 17 | `nvt.gro` has a 3.5 nm box and TIP4P virtual sites `toPdb` leaves out | **Verified**: box `3.5 3.5 3.5`; `MW1` sites; `toPdb` drops `virtual` atoms | `nvt.gro` last line; `structFile.ts` |
| 18 | `WTA.gro` has a 3 nm box; `cccccccc.gro` and `mmmmmmmm.gro` have 1 nm boxes | **Verified** for the boxes. **Corrected** for the atoms: `cccccccc` spans 2.1–5.1 nm in x (as said); `mmmmmmmm` spans −0.9 to 1.9 nm in x, not 2–5 nm. Also `WTA` has 4 atoms outside its 3 nm box (up to 0.15 nm) | atom extents, computed |
| 19 | Uploads accept only the seven GROMACS extensions (T88) | **Verified** | `server/api.ts` (`inputRole`) |
| 20 | The file browser shows only GROMACS input files (T10) | **Corrected.** It also shows `.xvg` outputs (role `output`); other files are counted, not shown | `server/files.ts:27–40`, `src/lib/inputs.ts` (`EXT`) |
| 21 | The tabs are `inputs · groups · rdf · jobs · batch` (T40) | **Verified** | `src/App.tsx:20` |
| 22 | Batches are RDF only | **Verified** | `server/batch.ts` runs RDF requests only |
| 23 | Groups reach gmx as index groups by number (T17); names are one word (T18) | **Verified** | `runs.ts`, `groups.ts:79` |
| 24 | The TIP3 water's oxygen is `OH2` in CHARMM | **Not checked.** The repo has no CHARMM structure; the TIP3 test in `app/test/structure.test.ts:25` uses `HW1`/`HW2` names | |
| 25 | `gmx awh` writes one file per stored time | **Verified** from GROMACS 2025.4's own description: "One or two files are written per AWH bias per time frame… the time of the frame is appended". The exact name pattern is checked against a real AWH run (not available) | `awh -h` |
| 26 | `gmx wham` histogram fixture: 21 windows | **Verified**: 22 columns = x + 21 windows | `hist_500000.xvg` |
| 27 | The AWH PMF correction (+2kT·ln r, tail zero) | **Not checked** in this pass | |
| 28 | The qq options, the `--yaml` output and `qq kill`'s rules | **Not checked**: `qq`, `gmx-eta`, `ssh` and `kinit` are not installed here | `command -v` |
| 29 | The README *Safety* section says what the spec quotes | **Verified** (`runner/README.md`: "run anything but `gmx`", "reach the network beyond serving its own page") | |
| 30 | The new `hbond` takes donors and acceptors as `-r` and `-t` (§15) | **Corrected.** `-r` is a *reference* selection and `-t` a *target* selection; hydrogen bonds are searched between them. The donor and acceptor elements are `-de` and `-ae` | `hbond -h` (2025.4) |

---

## 4. The PMF Sequences types of real outputs (section 3, completed)

Run with PMF Sequences' own `detectAna` on the outputs of GROMACS 2025.4 (run here on the test system and a rerun energy file) and on the app's fixtures. "header" = matched from the title or y-label; "auto" = matched from the file name; "none" = PMF Sequences would ask.

| Output | Tool | Title | PMF type | Note |
|---|---|---|---|---|
| `hmrfast6_ha_a_t200000.xvg` (fixture) | awh | `AWH` | **PMF** (header) | as in the spec |
| `hist_500000.xvg` (fixture) | wham 2022.3 | `Umbrella histograms` | **Histogram** (header), 22 columns | as in the spec |
| `07.md_rdf_protein_sugar.xvg` (fixture) | rdf 2021.4 | `Radial distribution` | **RDF** | as in the spec |
| `07.md_hbdist_protein_sugar.xvg` (fixture) | hbond 2021.4 | `Hydrogen Bond Distribution` | **H-bonds** (header) | its x is a distance; PMF Sequences labels x "Time (ps)" |
| `07.md_mindist_protein_sugar.xvg` (fixture) | mindist 2021.4 | `Minimum Distance` | **Distance** (header) | as in the spec |
| `07.md_numcont_protein_sugar.xvg` (fixture) | mindist 2021.4 | `Number of Contacts < 0.6 nm` | **none** | as in the spec |
| `energy-potential.xvg` (from `energy`, 2 terms) | energy 2025.4 | `GROMACS Energies` | **Energy** (**auto, from the file name**) | **the title does not match PMF Sequences' keyword `energy`** (`energies` contains no `energy`). Renamed `pot.xvg`: **none** |
| `distave.xvg` (distance `-oav`) | distance 2025.4 | `Average distance` | **Distance** (header) | |
| `dist.xvg` (distance `-oall`) | distance 2025.4 | `Distance` | **Distance** (header) | |
| `disthist.xvg` (distance `-oh`) | distance 2025.4 | `Distance histogram` | **Histogram** (header) ✘ | a distance distribution would get "Reaction coordinate" labels and umbrella behaviour |
| `diststat.xvg` (distance `-oallstat`) | distance 2025.4 | `Statistics for individual distances` | Distance, one row, 3 columns | not useful to send |
| `hbnum.xvg` (hbond 2025.4 `-num`) | hbond 2025.4 | `Number of hydrogen bonds` | **H-bonds** (header) | |
| `hbdist.xvg` (hbond 2025.4 `-dist`) | hbond 2025.4 | `Hydrogen Bond Distance Distribution Histogram` | **Histogram** (header) ✘ | |
| `hbang.xvg` (hbond 2025.4 `-ang`) | hbond 2025.4 | `Hydrogen Bond Angle Distribution Histogram` | **Histogram** (header) ✘ | |
| `hbdan.xvg` (hbond 2025.4 `-dan`) | hbond 2025.4 | `Number of Donors and Acceptors` | **none** | |
| `hbnum-legacy.xvg` (hbond-legacy `-num`) | hbond-legacy 2025.4 | `Hydrogen Bonds` | **H-bonds** (header) | |
| `hbdist-legacy.xvg` (hbond-legacy `-dist`) | hbond-legacy 2025.4 | `Hydrogen Bond Distribution` | **H-bonds** (header) | x "Donor - Acceptor Distance" labelled "Time (ps)" in PMF Sequences |
| `rmsd.xvg` (rms 2025.4) | rms 2025.4 | `RMSD` | **RMSD** (header) | |
| `rmsf.xvg` (rmsf 2025.4) | rmsf 2025.4 | `RMS fluctuation` | **RMSF** (header, via "fluctuation") | x is "Atom" in the file; PMF Sequences labels it "Residue" |
| `gyrate.xvg` (gyrate 2025.4) | gyrate 2025.4 | `Radius of gyration (total and around axes)` | **Rg** (header), 5 columns | one column by default: the total |
| `wham` profile, `awh` per-time files of the test system | — | — | **not run**: this system has no pull or AWH data | |

Consequences, for the requests below:
- **Distance histograms and the 2023+ H-bond distributions** (`-oh`, `-dist`, `-ang`) land as **Histogram** in PMF Sequences. That is wrong for them, and PMF Sequences' Histogram type labels its axis as an umbrella reaction coordinate. Cypher should not send them by default and should say why. The fix belongs in PMF Sequences, which is read-only in this batch: a backlog item (question 37).
- **Energy** is found only from the **file name** (`energy…`), because its title says "Energies". Once sent, the name comes from the project's pattern, so the type may be lost. Same backlog item.
- **`gmx hbond` (2025.4) always writes** `-o hbond.ndx` (its default name is not optional in `-h`). Cypher must name it. 49,763 bytes on the test system.
- **`gmx hbond-legacy`** prints "You are going to use a deprecated gmx tool. Please migrate to the new one, gmx hbond" in 2025.4.
- **`gmx energy`** takes its terms on stdin, one per line by number or name, ending with an empty line or `0`. An empty stdin is a fatal "No energy terms selected". Its statistics block: "Statistics over N steps [t0 through t1 ps], 2 data sets / All statistics are over N points (frames)", then a table with **Average, Err.Est., RMSD, Tot-Drift** and units.
- **`gmx distance`** accepts `group N` in `-select` as well as group names: `com of group 2 plus com of group 3` gives the same data as `com of group "SO4" plus com of group "Na"`. So R7 can use Cypher's `group N` convention (T17).
- **`gmx awh`** (2025.4): `-f` an `.edr`, `-s` a `.tpr`, `-o`, `-fric`, `-b`, `-e`, `-skip`, `-more`, `-kt`. Its own description: one or two files per bias per time frame, with the bias index and the frame time appended.
- **`gmx wham`** (2025.4): inputs `-it tpr-files.dat`, `-ix pullx-files.dat`, `-if pullf-files.dat`, `-is coordsel.dat`, `-iiact`; outputs `-o profile.xvg`, `-hist histo.xvg`, `-oiact`, `-bsres`, `-bsprof`. Defaults: `-b 50` (ps), `-unit kJ` (`kJ`, `kCal`, `kT`), `-temp 298`, `-nBootstrap 0`, `-bs-method b-hist`.

### 4.1 `gmx wham`'s window order (new)

The histogram file's columns are **not in pull-coordinate order**. Sorted by where each window's histogram peaks, the windows run 1.65, 1.83 (file window 12), 2.01 (14), … 5.39 (11), 5.49 (13). Window 13 has only 6,302 samples. So a neighbour check must sort windows by position first. Sorted, the overlap of each neighbouring pair (the sum of the smaller of the two normalised histograms) runs from **0.036 to 0.222**, mostly 0.04–0.07. **Most pairs fall below 0.10**, so the threshold is a real decision (question 29), not a detail.

---

## 5. Requests R1–R10

For each: current behaviour, the proposed change, the code budget (lines added / removed, ±30 %), the new writes, the tests, the risks, and the questions (by number in section 7).

### R1. Atom names as lists; Shift+Enter; the same-name click

**Current.** One name per rule; the field takes the whole string (`OH1, OH2` matches nothing). Its options come from all atoms (`Groups.tsx:36`). Enter adds and closes. Shift+click = residue, Alt+click = name within the atom's residue name (`groups.ts:65`). Ctrl is not used by Cypher; in 3Dmol it moves the structure.

**Proposed.**
- Rule `name` takes `values: string[]` (recipe and record v2). The field parses `,`, spaces and `and` into one set and writes it back as a list of names. Duplicates removed; matching exact. `ruleText` says it: "atom name O1, O2, O3 or O4 in every SO4".
- The menu lists the names present in the chosen residue name, with counts (`SO4`: O1–O4 and S1, 6 atoms each, from `nvt.gro`), ticking writes into the field. It is an ARIA multi-select: a `listbox` with `aria-multiselectable`, keyboard arrows and Space. The Morpheus `DropdownMenu` checkbox items are an alternative if a searchable field is not needed (question 15).
- **Shift+Enter**: adds the rule, keeps the form open, keeps the residue name, clears the names, focuses the name field. Plain Enter unchanged.
- **Same-name click**: see question 16. The recommendation keeps Alt (it already works, and Option on macOS sets `altKey`), adds a menu entry for "every residue of this name" with a count, and does not use Ctrl (Ctrl+drag moves the structure in 3Dmol; Ctrl+click opens the menu on macOS).

**Code budget.** +170 / −20 (parsing 40, rule shape and `ruleText` 25, menu 80, Shift+Enter 15, scope 10). Recipe and record v2 +40 (in the shared libraries). **Tests** (+150): `parseNames` table tests (commas, spaces, `and`/`AND`, duplicates, empty entries, quotes); set building on `WTA.gro`, `test.pdb` and a generated TIP3 box; `ruleText` matches the atoms; the frozen v1 recipe selects the same atoms; Shift+Enter keeps the residue name.

**Writes.** None new. Recipes v2 in `<state>/recipes/`.

**Risks.** (a) In mononoki, the letter O and the digit 0 look alike, so `O1` and `01` are hard to tell apart in the field. The menu shows the names as the file has them, which helps. (b) Shift+Enter inside a field with a datalist: the browser may take the key for the list; test it. (c) "and" means "or" here, which differs from GROMACS (question 19). (d) v2 recipes are not readable by a v1 reader: keep v1 readable (section 1.5).

**Questions.** 15, 16, 17, 18, 19, 38.

### R2. The periodic box

**Current.** No box. `toPdb` drops the `.gro` box; the viewer has *look*, *hydrogens* and *water & ions* (`Viewer.tsx:93–97`).

**Proposed.** Parse the box from the raw structure text (the viewer already has it): `.gro`'s last non-empty line, 3 numbers or 9 (GROMACS's order v1x v2y v3z v1y v1z v2x v2z v3x v3y), in nm; `.pdb`'s `CRYST1` (Å, angles). Draw the 12 edges of the cell, triclinic included, as a 3Dmol shape or a set of lines. A toggle (*box*), on by default (question 20). Dimensions below the view: a, b, c (nm), α β γ, and V (nm³).

**Facts for the test data.**
- `nvt.gro`: `3.5 3.5 3.5` → V = 42.875 nm³. **68 of its 3,242 atoms lie outside** the box, at most 0.075 nm outside, all water (HW1, HW2, OW1, MW1).
- `WTA.gro`: `3 3 3`; 4 atoms lie outside it (up to 0.15 nm).
- `cccccccc.gro`: `1 1 1`; atoms span 2.1–5.1 nm in x: the placeholder case.
- `mmmmmmmm.gro`: `1 1 1`; atoms span −0.9 to 1.9 nm in x.
- No triclinic structure and no `CRYST1` `.pdb` in the repo (`test.pdb` has no box line). **Needs a sample** for the triclinic and `.pdb` tests.

**Code budget.** +140 (parse 50, geometry 40, drawing and toggle 50). **Tests** (+90): `.gro` rectangular, triclinic (9 values), a rhombic dodecahedron (generated), extra spaces, a garbled line; `CRYST1` orthorhombic and triclinic, and agreement with the matching `.gro`; volume and angles; the placeholder case.

**Writes.** None.

**Risks.** Triclinic conventions (the 9-value order must be exact; tested against a generated rhombic dodecahedron, and against a real one when you send one). Molecules crossing an edge look broken in NPT runs; a one-line hint says so. Drawing cost in software WebGL (the QA runs use SwiftShader).

**Questions.** 13, 20.

### R3. One definition per GROMACS command, RDF moved in

**Current.** RDF is hard-wired: `rdfArgs` and `FORM` (`rdf.ts`), `planRun`/`startRun` (`runs.ts`, RDF-specific names, `outputNames` for `xvg`/`cn`/`ndx`), the record kinds (`record.ts`), the recipe (`analysis: 'rdf'`), the tabs, batches. The job runner (`jobs.ts`) is generic already: `kind`, `file`, `args`, `cwd`, `env`, `meta`.

**Proposed.** A command definition as plain data, one object per GROMACS tool:

```ts
interface CommandDef {
  tool: string;                    // 'rdf', 'energy', 'awh', 'wham', 'distance', 'hbond' | 'hbond-legacy', …
  title: string;                   // one line, shown in the picker
  versions: { min?: string; max?: string; replacedBy?: string }; // hbond: 2023+ tool vs legacy
  inputs: ('trajectory' | 'runInput' | 'structure' | 'index' | 'edr' | 'windowLists')[];
  groups: { roles: ('reference' | 'selection')[]; min: number; max: number } | null;
  options: { flag: string; group: string; label: string; unit?: string; what: string; first?: boolean }[];
  fixed: Record<string, string>;   // xvg xmgrace, tu ps …
  stdin?: (answers: Answers) => string[];     // only where the tool asks questions
  outputs: { flag: string; template: string; pmfType: string | null; toVault: boolean; kind: string }[];
  result: 'curves' | 'table' | 'none';
}
```

Code only where a command differs: the stdin builders (energy's terms, hbond-legacy's groups), the parsers (energy's statistics, awh's frames, wham's bootstrap), the overlap check (wham). The generic parts: argv, plan, names, job, record, landing, send.

**RDF moves in unchanged.** The golden tests come first: from today's code, for a fixed set of inputs and options, the argv, the `.ndx` bytes, the output names and the record content (minus the new version fields). Then the move. Record v2 adds `command` (tool and versions), `stdin` (the answers, when present) and the new fields; the v1 record and recipe stay readable (section 1.5).

**Code budget.** +420 / −260 (definitions 120, the generic argv, plan and record 150, the picker 80, stdin 40, record v2 30; removals are the RDF-specific code that moves). **Tests** (+300): golden RDF (80), definition validation (no unknown option, every output with a type decision, 40), option lists parsed from each real `-h` (60), the v1 fixtures load and "run again" gives the same argv (60), stdin reaches the fake gmx and the record (60).

**Writes.** None new (the definitions are code).

**Risks.** This is the biggest risk in the batch: the refactor touches every RDF run and batch. Mitigation: golden tests first, a commit that changes nothing visible, and the frozen fixtures. The tab named `rdf` will hold several commands (question 22). Batches keep working only for commands that declare their inputs.

**Questions.** 21, 22.

### R4. `gmx energy`

**Current (GROMACS 2025.4, checked).** Terms on stdin; a term menu printed on stdout for the file (the rerun energy file gives 6 terms: `Bond`, `Angle`, `LJ-(SR)`, `Coulomb-(SR)`, `Coul.-recip.`, `Potential`); statistics printed after the run, with Average, Err.Est., RMSD and Tot-Drift and their units. `-b`, `-e`, `-dt`, `-skip`, `-fluct_props`, `-driftcorr` and more. Nothing in Cypher reads it yet.

**Proposed.**
- Inputs: an `.edr` (new: `inputRole` gets `.edr`, the browser shows it, the upload accepts it, question 25 on the folder) and the run input (for the frame times).
- The term menu, read with `gmx energy` on an empty stdin (it prints the menu and stops with an error, the menu is parsed from the output). Searchable multi-select; terms are sent by **number** from that file's menu (question 23).
- Options from `gmx energy -h`, the curated few first, with "first N ps left out" for `-b`.
- Statistics parsed from stdout: the header line, each term's row, its units. `Stat` tiles per term (average ± Err.Est., RMSD, drift). A drift larger than its Err.Est. flagged in words (question 24).
- A curve per term in one file (`yCols: all`, the PMF Sequences Energy type, with the name containing `energy`, section 4).

**Code budget.** +240 (menu 40, stdin 20, statistics parser 50, drift 15, view 115). **Tests** (+160): the menu from the real rerun output and from another version's (a sample needed); stdin by number; statistics table with the real text; the drift flag on the real numbers (Bond 79.7 against 14; Potential −6402 against 1000); the output type with `detectAna` on a real file (`energy-potential.xvg`).

**Writes.** Outputs in a new `energy/` folder beside the trajectory (question 25), `<stem>.xvg` plus the run record. Names via the existing free-name rule.

**Risks.** The menu's text may differ across versions (one sample only). Term names contain spaces and parentheses, so numbers are safer than names in stdin. Long `.edr` files: read only the requested range. The PMF Sequences name keyword (section 4).

**Questions.** 9, 23, 24, 25, 37.

### R5. `gmx awh`

**Current (checked).** `gmx awh -f ener.edr -s topol.tpr -o awh.xvg`: one or two files per bias per time frame, the bias index and the frame time appended (from `awh -h`). Units: the AWH PMF in kJ/mol unless `-kt`. `-more` adds bias and target distributions; `-fric` adds friction files. PMF Sequences types a file with `tool=gmx awh` or title `AWH` as **PMF** (verified on the fixture).

**Proposed.** Inputs: `.edr` + `.tpr` (multiple walkers: question 26 on the walker files). Time frames: last only (default), every N-th via `-skip`, or all; show the count of files each gives. Output names from the template so that they come out as `…_t<time>.xvg` (the fixture's shape); each is checked with PMF Sequences' `parseName` and the landing preview. kJ/mol only for vault outputs (`-kt` refused for the vault). `-more` and `-fric` not sent by default. Result: the PMF curves on one `LineChart`, with the target error from the header.

**Code budget.** +200 (frames 35, names 40, options 40, result 85). **Tests** (+120): frames → file count; names → `parseName` round trip; the landing preview on the fixture `hmrfast6_ha_a_t200000.xvg`; the fake gmx and, with `GMX` set, your AWH run (not available here).

**Writes.** One folder per run, `awh/`, with one file per frame (count shown before the run).

**Risks.** Naming is unverified until a real AWH run (the `-o` name → `_t<time>` rule). Many frames mean many files in the vault inbox: cap or ask. The first walker's `.tpr` vs each walker's files (question 26).

**Questions.** 10, 26, 27.

### R6. `gmx wham`

**Current (checked).** Window lists (`tpr-files.dat` with `pullx-files.dat` or `pullf-files.dat`) on the command line; outputs `profile.xvg`, `histo.xvg` and optional bootstrap files. The histogram fixture has 21 windows **not in pull order** (section 4.1). Defaults `-b 50 ps`, `-unit kJ`, `-temp 298`, `-nBootstrap 0`.

**Proposed.**
- Window lists built from a folder template over the windows (as the batches do) and shown as a table, which the user can edit; written beside the outputs in a new folder, never overwritten; kept in the run record.
- The overlap check, a pure function over the histograms: windows sorted by peak; each neighbouring pair's overlap; a gap or a weak pair named by window. The metric and the threshold are question 29.
- Options: `-b` per window (shown as equilibration), `-temp` from the `.tpr` unless set, `-unit` (kJ for the vault), bootstrap (`-nBootstrap`, `-bs-method`, `-bsres`, `-bsprof`).
- Result: the profile with its bootstrap band (**the `LineChart` has no band**: see section 1.2 and the backlog), and the histograms.

**Code budget.** +330 (lists 60, overlap 60, bootstrap 40, the window table 120, options 50). **Tests** (+220): list building from a template; overlap on the real fixture (its sorted neighbour overlaps, section 4.1) and on synthetic gaps; the options; the bootstrap output's parsing; the fake gmx and, with `GMX` set, your umbrella set (not available here).

**Writes.** A folder with the window lists, the outputs and the bootstrap files.

**Risks.** The overlap metric is a choice (question 29). WHAM's default `-b 50` hides the first 50 ps per window. Sending profiles as PMF would make PMF Sequences apply its AWH correction (question 28). The `LineChart` needs an error band (a Morpheus candidate, built locally here).

**Questions.** 11, 28, 29, 30, 31.

### R7. `gmx distance`

**Current (checked).** `-select` takes a selection; `-oav`, `-oall`, `-oxyz`, `-oh` (histogram, `-len`, `-binw`), `-oallstat`. `group N` and group names both work in `-select` (checked). PMF Sequences' types from section 4: `-oav` and `-oall` are Distance; `-oh` is **Histogram** ✘.

**Proposed.** Pairs (one distance per pair of atoms in two groups) or the distance between two groups' centres (`com of group N plus com of group M`, or geometry), chosen and shown. The selection text built by a pure function and shown in full. Outputs: `-oav` to the vault by default; `-oall` on request; `-oh` not sent by default, with the reason shown (section 4). `-oallstat` not offered.

**Code budget.** +190 (selection builder 50, outputs 40, view 100). **Tests** (+120): selection text for pairs, centres and geometry (`group N` and names, names with `+ . : -`); the output types with `detectAna` on the real outputs (section 4); the file names.

**Writes.** A folder `distance/` beside the trajectory, outputs as usual.

**Risks.** `-oh` mislabelled in PMF Sequences. Pair selections can be large (`-oall` size): show the count first. Centre-of-mass versus geometry changes the number (shown and recorded).

**Questions.** 32, 37.

### R8. `gmx hbond`

**Current (checked, 2025.4).** Two tools: `hbond` (the selection-based one: `-r` reference and `-t` target selections (hydrogen bonds are searched between them; the donor and acceptor elements are `-de` and `-ae`), `-cutoff`, `-hbr`, `-hba`, `-de`, `-ae`; outputs `-num`, `-dist`, `-ang`, `-dan`, and `-o hbond.ndx` always written) and `hbond-legacy` (index groups on stdin, two prompts; `-r` distance 0.35, `-a` angle 30; prints a deprecation notice). The 2021.4 files in the fixtures are from the legacy tool. PMF Sequences: `-num` is **H-bonds** ✔; `-dist` and `-ang` are **Histogram** ✘; `-dan` is none.

**Proposed.** Detect the tools with `gmx help commands` (or the `-h` texts) and the version. One form for both: a reference and a target group from the 3D picker, mapped to each tool's own options (`-r`/`-t` for the new one; the index groups on stdin for the legacy, which asks for a donor and an acceptor group). The criteria (distance, angle, donor and acceptor elements) shown with each version's defaults, and the tool that ran recorded. Outputs: `-num` to the vault by default; distributions not by default (question 34).

**Code budget.** +260 (versions 50, two builders 110, the form 60, parsers 40). **Tests** (+170): the version detection from the real `gmx help commands` (2025.4, with and without the legacy tool, and a 2021.4 text: sample needed); both tools' argv and stdin from one form; output types with `detectAna` on the real outputs.

**Writes.** A folder `hbond/`, plus `hbond.ndx` (named by Cypher, since the new tool always writes it).

**Risks.** The two tools use different criteria: never mixed silently (question 33). The legacy tool is deprecated in 2025.4. The distributions are mislabelled in PMF Sequences (section 4).

**Questions.** 33, 34, 37.

### R9. Further commands

**Current (checked, 2025.4 `-h`).** All exist here: `rms`, `rmsf`, `gyrate` (and `gyrate-legacy`), `mindist`, `sasa`, `density`, `analyze`, `trjconv`. Outputs of rms, rmsf, gyrate and mindist are already typed by PMF Sequences (section 4); `numcont` is none.

**Proposed shortlist.** One line each on what you would get:

| Command | What you get | PMF Sequences | Status here |
|---|---|---|---|
| `rms` | RMSD over time against a reference, with a fit group | RMSD (header) ✔ | run, typed ✔ |
| `rmsf` | fluctuation per atom or per residue (`-res`) | RMSF (header) ✔ | run, typed ✔ (x label differs: "Atom" vs "Residue") |
| `gyrate` | radius of gyration, total and per axis | Rg (header) ✔ | run, typed ✔ |
| `mindist` | minimum distance and contact counts between two groups | Distance ✔; contacts none | fixtures (2021.4) |
| `sasa` | solvent-accessible surface over time | none (ask) | not run |
| `density` | density profile along an axis | none (ask) | not run |
| `analyze` | block averages and autocorrelation of any `.xvg` (error estimates) | none (ask) | not run |
| `trjconv` | a preparation step: make molecules whole, centre, write a new trajectory | no vault output | not run; writes a new trajectory (large) |

Recommendation: `rms`, `rmsf`, `gyrate` (all typed, all cheap, all useful with the energy and distance outputs), and `mindist` (its fixtures already exist). Question 35.

**Code budget.** +150 per command (+100 tests each). **Writes.** Per command, in its own folder. `trjconv` would write a large file: not without a size check and your OK.

**Risks.** `trjconv` writes files, which the batch 2 rules forbid without asking (section 1.3). `analyze` makes PMF Sequences types unknown.

### R10. Cluster jobs: `qq jobs` with `gmx-eta -a`

**Current.** Cypher has no cluster code. `qq` and `gmx-eta` are not installed here, and neither are `ssh` or `kinit`, so nothing in this environment can run the cluster commands for real: tests will use fakes, and the real checks need your cluster. The documented behaviour (section 4 of the spec) is not checked here.

**Proposed.**
- **R10a, the runner:** one module, the only place that starts `ssh`, `qq` or `gmx-eta`. The remote command is a constant string from a fixed list: `qq jobs --yaml`, `qq jobs -a --yaml`, `qq jobs -e --yaml`, `gmx-eta -a`, and (if agreed) `qq kill -y <id>`. Job IDs match a strict pattern; server names come from the config. `ssh -o BatchMode=yes -o ConnectTimeout=…` with the host key check on. Locally (if the cluster is on this machine) the same list runs with `shell: false`. Each call has a timeout and runs one at a time.
- **R10b, parsers:** `qq jobs --yaml` (never the table) and `gmx-eta -a`, as pure functions. Job IDs normalised for the merge (`12345` ↔ `12345.<server>`, to check on your IDs). Unknown lines and fields kept and shown.
- **R10c, the view:** a semantic `<table>` in Morpheus tokens: job, name, state (as the tool says, with a status hue), nodes, CPUs and GPUs, runtime, walltime, ETA and finish time in your time zone, the walltime warning in words, the input folder and comment (`-e`) on request, filters, "updated N min ago", a refresh, polling only while visible (60 s proposed; question 5).
- **R10d:** kill, arm-and-confirm, the exact command shown, `-y` only after the second click, never `--force` (question 3); "analyse this job" on request (question 6).
- The cluster view is named `cluster` (not *jobs*, which means Cypher's own runs).

**Proposed README wording** (section 1.3 asks for it to be approved before code). Replacing the *Safety* list in `runner/README.md`:

> gmx-cypher can:
> - read files inside the allowed folders, and read your PMF Sequences vault;
> - start `gmx` and the GROMACS tools it knows (never through a shell), in a trajectory's folder;
> - with the cluster view set up: start `qq jobs`, `gmx-eta` and, if you confirm it, `qq kill`, on the cluster directly or through `ssh` to the servers in your config. The commands and their options are fixed in the code; job IDs and server names are checked against a pattern and your config, and nothing you type reaches a shell;
> - write new files: a run's outputs, under names that are free; files in its own state folder; and a result you send, into the project's `_inbox` folder.
>
> It cannot, by design:
> - overwrite or delete any of your files;
> - be reached from another computer, or be used by another page in your browser;
> - run anything but the commands above, or send free text from the page to a shell;
> - reach the network, except through `ssh` to your cluster for the cluster view, and serving its own page.

**Code budget.** +640 (runner 90, parsers 200, merge 70, view 200, polling 60, kill 20). **Tests** (+360): parsers on real samples (each state, with and without ETA, Slurm without `%CPU`); the merge; finish time and walltime warning with a fixed clock and time zone; the SSH builder (only listed commands; a hostile ID such as `1; rm -rf ~` refused); polling (no overlap, a timeout, backoff); kill (two clicks, the exact command); a fake `ssh` on `PATH` for the failure messages.

**Writes.** None on disk. The last result lives in memory (as batches do). Question 8: a snapshot file for "updated N min ago" after a restart.

**Risks.** No real samples yet, so every format is a guess until you send them. SSH and Kerberos cannot be tested here. Polling a shared cluster must be slow and one at a time. A wrong kill is the worst outcome: two clicks, and the command shown. `gmx-eta` is "unversioned" per its manual: record its path and SHA-256 with each read.

**Questions.** 1–8.

---

## 6. Batches (question 36)

Batches are RDF-only today (`server/batch.ts`, section 3 #22). Candidates:
- **AWH over every walker folder**: obvious (one recipe, many folders). Recommended.
- **Energy over every run folder**: useful (the same terms for each run). Recommended.
- **Distance and H-bonds over runs**: possible with the path template; the same rules as the single run.
- **WHAM**: not as a batch. Its window lists belong to one system; a batch per system would be a loop over folders that each has its own lists. Recommended: no.

---

## 7. Open questions (one list)

Each has a recommendation; reply with numbers, or with changes.

**Cluster (R10)**
1. Where do `qq` and `gmx-eta` run, and how does Cypher reach them: SSH from the machine that runs Cypher, or a login node? Is `kinit` needed? *Recommendation:* SSH from the same machine, `BatchMode`, a clear message when the ticket has expired.
2. Which batch servers do you use (the default, `sokar`, others), and what do they answer to in `qq jobs -s`?
3. Watch only, or also kill now, and submit later? *Recommendation:* watch and kill now (two clicks, never `--force`); submit later.
4. Real samples, please: `qq jobs --yaml`, `qq jobs -a --yaml`, `qq jobs -e` (default and `-s`), `gmx-eta -a` in each state (running, queued, finished, a job without `mdrun -v`), and one Slurm sample without `%CPU`/`%Mem`. Remove personal details, or tell me which to keep.
5. Polling: 60 s while the cluster view is open, nothing in the background. OK?
6. "Analyse this job": wanted, and after R10c? *Recommendation:* yes, but not until R10c works.
7. The README *Safety* wording above: approve, or change.
8. Time zone: the browser's local time for finish times, and a snapshot file for "updated N min ago" across restarts? *Recommendation:* the browser's time; no snapshot (in memory, like batches).

**Samples for the commands (no parser without one)**
9. An `.edr` from one of your runs, and the term menu it prints (`gmx energy -f x.edr` with an empty stdin). The one I used is a rerun of the test trajectory (6 terms, 21 frames); yours will have more.
10. A small AWH run: the `.edr`, the `.tpr`, and the per-time outputs `gmx awh` wrote, with their names.
11. A WHAM set: `tpr-files.dat`, `pullx-files.dat` (or `pullf`), and the `gmx wham` profile and histogram outputs.
12. `gmx <tool> -h` texts from the GROMACS versions you use (2021.4, 2022.3): `energy`, `awh`, `wham`, `distance`, `hbond`, `hbond-legacy`, `rms`, `rmsf`, `gyrate`. I have 2025.4 of all of them.
13. A triclinic structure (a `.gro` with 9 box numbers, or a `.pdb` with `CRYST1`). `test.pdb` has no box line.
14. A CHARMM structure with TIP3 water, to check the `OH2` case (R1).

**Product decisions**
15. R1 field and menu: an ARIA multi-select built here (recommended, it is searchable), or Morpheus's `DropdownMenu` checkbox items (no typing, already in Morpheus)?
16. R1 same-name click: Ctrl+click as asked, or keep Alt (already works; Option on macOS sets `altKey`) plus a menu entry for "every residue of this name"? *Recommendation:* keep Alt, add the menu entry, do not use Ctrl (3Dmol's Ctrl+drag; macOS's Ctrl+click menu). I can test a Ctrl+click with a moving mouse first, if you insist.
17. R1 scope for the same-name click: "this residue name" (today) or "every residue of this name"? For water's OH2 they differ.
18. R1: a GROMACS-style preview (`name OH1 OH2 OH3`) shown, and wildcards (`OH*`)? *Recommendation:* no preview (Cypher never sends one to gmx), no wildcards in this batch.
19. R1: "and" means "or" (as proposed). An atom really named `AND`: take it only in quotes, or refuse it? *Recommendation:* quotes.
20. R2: the box on by default? For placeholder boxes (`cccccccc`, `mmmmmmmm`): draw as recorded with a note (recommended), or hide?
21. R3: approve the v2 formats for recipes and run records, with the frozen v1 files committed first (section 1.5).
22. R3: the `rdf` tab becomes one analysis tab with a picker at the top (recommended), or each command gets its own tab?
23. R4: energy terms sent by number (from the same file's menu, recommended) or by name?
24. R4: the drift rule: flag when the drift is larger than the error estimate (as the spec says), always showing both?
25. R4, R5, R6, R7, R8: one output folder per analysis beside the trajectory (`energy/`, `awh/`, `wham/`, `distance/`, `hbond/`), as `rdf/` is today? And may an `.edr` be picked and uploaded (the browser and the upload list would gain `.edr`, and `.dat` for window lists)?
26. R5: which walker files are used for each walker's frames: one `.tpr` for all, or one per walker? Please show me a sample.
27. R5: the default time frame: the last only (recommended), and only that one goes to the vault by default?
28. R6: send WHAM profiles to PMF Sequences as PMF? *Recommendation:* send the histograms (they land as Histogram); profiles only after you decide, because PMF Sequences would apply its AWH correction to them.
29. R6: the overlap metric and the threshold. On your fixture, sorted by peak, the neighbour overlaps are 0.04–0.22, and 19 of 20 pairs are below 0.10. *Recommendation:* show the numbers with no verdict until you choose a threshold, or give me your rule.
30. R6: window lists from a folder template (recommended), from a list you edit, or both?
31. R6: the WHAM `-b` default of 50 ps per window, shown as equilibration: OK?
32. R7: which distance outputs go to the vault by default? *Recommendation:* `-oav` only.
33. R8: when both H-bond tools exist (2025.4 has both, and the legacy one is deprecated there), which is used? *Recommendation:* the new tool; never mix criteria; the legacy one only when the new one is missing.
34. R8: are the H-bond distributions wanted in the vault? They would land as Histogram. *Recommendation:* no, not by default.
35. R9: which commands from the shortlist (section 5, R9)? *Recommendation:* `rms`, `rmsf`, `gyrate`, `mindist`.
36. Batches (section 6): AWH and energy over folders, yes; distance and H-bonds over folders, optional; WHAM, no?
37. PMF Sequences, read-only in this batch: (a) `GROMACS Energies` is not recognised by its keyword, so an energy file is typed only if its name contains `energy`; (b) distance and H-bond distribution histograms are typed as Histogram. *Recommendation:* put both on PMF Sequences' backlog; in Cypher, name energy files with `energy`, and don't send histograms by default. Agree?
38. Mononoki: O and 0 look alike, so `O1` and `01` are hard to tell apart in the atom-name field. Accept, or add a hint that shows the names as the file has them (the menu already does)?
39. Size: about 3,000 lines of code (about 70 % of Cypher today). The cut points are R9 (choose fewer commands), R10d and the bootstrap view of R6. Accept, or drop something now?
40. Order: section 5 of the spec as written, with one addition: stop after R4 for a review of the energy result with your real `.edr`, before R5–R10. Yes?
41. Branch and push: the work is on the local branch `cypher-batch-2`, not pushed. The harness's designated branch is `claude/quirky-cray-q845sa`. Push to which branch, and when?
42. Commit footer: the system prompt says no model names in commit messages, while the attribution reminder asks for a `Co-Authored-By` line naming the model. The Phase 0 commit uses the reminder's footer. Keep it, or drop the model name from the footer?
43. `app/` baseline: `e8a452c` is still right (the check passes), and no later PMF Sequences change is planned for this batch?

---

## 8. Mockups (section 0.3, step 7)

All in `runner/docs/img/batch-2/`, light and dark (`mock-<screen>-<theme>.png`), at 1024 px. They were generated by scratch scripts outside the repo (not committed), with no console messages and no horizontal overflow.

| Screen | File | Data |
|---|---|---|
| R1 · atom names as a list | `mock-atoms-*.png` | the real SO4 names and counts of `nvt.gro` (O1–O4 and S1, 6 each) |
| R2 · periodic box | `mock-box-*.png` | `nvt.gro`'s own atoms, projected; the box `3.50 × 3.50 × 3.50 nm`; the 68 atoms outside it, noted |
| R3 · command picker | `mock-picker-*.png` | names and one-liners from the 2025.4 `-h` texts |
| R4 · energy terms | `mock-energy-*.png` | the real term menu and the real statistics of the rerun energy file |
| R6 · WHAM windows | `mock-wham-*.png` | the real 21-window fixture, sorted by peak, with the neighbour overlaps |
| R10 · cluster jobs | `mock-cluster-*.png` | **invented** job IDs, times and states, labelled as such |

---

## 9. Order and roadmap

The order in section 5 of the spec holds (picking and box; definitions; commands without groups; commands with groups; cluster). Two additions, both in the questions: a review after R4 (question 40), and the batches for energy and AWH (question 36). The roadmap section and the batch 2 backlog are in `roadmap.md`. The batch 1 backlog items that this batch takes over (the analyses `mindist`, contacts, H-bonds, RMSD, Rg; and submission to a queue) are moved out of it into Batch 2.

---

## 10. Things the spec gets wrong or leaves open (summary)

- The hint shows `alt` only (item 6 of section 3).
- `Stat` is not a new component (item 14).
- `mmmmmmmm.gro` does not sit in a 2–5 nm region (item 18).
- `test.pdb` has no `CRYST1` line (section 5, R2).
- The file browser also shows `.xvg` outputs (item 20).
- `recipeFileProblems` does not check `analysis` (item 10).
- Two new PMF Sequences problems the spec did not know: energy is typed by file name only, and distance and H-bond distributions are typed as Histogram (section 4). Both are PMF Sequences backlog items.
- `gmx awh` writes per bias per frame, with the time in the name. That is right, but the exact pattern is not checked (no AWH run here).
- The `GMX` run counts: 270 passed and 4 skipped, not 273 and 1 with 14 real-gmx tests (section 1).

---

## 11. Code budget, total (estimate)

| Item | Code (+/−) | Tests (+) |
|---|---|---|
| R1 picking | +170 / −20 (+40 shared v2) | +150 |
| R2 box | +140 | +90 |
| R3 definitions | +420 / −260 | +300 |
| R4 energy | +240 | +160 |
| R5 AWH | +200 | +120 |
| R6 WHAM | +330 | +220 |
| R7 distance | +190 | +120 |
| R8 H-bonds | +260 | +170 |
| R9 (three commands) | +450 | +300 |
| R10 cluster | +640 | +360 |
| **Total** | **≈ +3,000 / −280** | **≈ +2,000** |

For comparison: Cypher has 4,166 lines of code and 2,554 lines of tests now (counted the same way as the first spec's report). This batch is about 70 % more code. Question 39.

---

## 12. Files this phase adds

- `runner/docs/batch-2.md` — the spec, saved verbatim.
- `runner/docs/batch-2-phase0.md` — this report.
- `runner/docs/roadmap.md` — the Batch 2 section and the moved backlog items.
- `runner/docs/decisions.md` — T90 and T91 (below).
- `runner/docs/img/batch-2/mock-*.png` — 12 mockup screenshots.

Decisions recorded: **T90** (the branch and baseline; nothing pushed) and **T91** (what the mockups use as data). Nothing else is decided until you answer.
