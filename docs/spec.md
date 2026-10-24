# Task: A new tool that runs and analyses GROMACS trajectories, starting with RDF

**PMF Sequences** (in `app/`) is my visualisation tool. It keeps each project in a user-owned folder (the **vault**) and shows PMFs and analyses (RDF, histograms, …) per sequence × column. Its design and rules are documented in `app/README.md` and `app/docs/` (storage decisions D1–D46, feature decisions F1–F80, batch reports 1 and 2).

This task builds a **second, complementary tool** with a GUI (working name **runner**, in `runner/`; Phase 0 asks me for its real name). It runs GROMACS analyses on my MD trajectories and hands the results to PMF Sequences without changing PMF Sequences in any way. The first analysis is the radial distribution function (`gmx rdf`), with atom groups I pick by hand on the 3D structure.

| # | Request | Section |
|---|---|---|
| R1 | Foundation: a local app (server + GUI) in my design system Morpheus, finding and running `gmx` safely | 7 |
| R2 | Inputs: trajectory, run input, structure and index files, by path or by upload | 8 |
| R3 | The structure in 3D, with reference and selection groups picked by hand or by rule | 9 |
| R4 | RDF: parameters, the exact command, running with progress and cancel, the result as a chart | 10 |
| R5 | Outputs and provenance: next to the trajectory by default, a run record, nothing ever overwritten | 11 |
| R6 | Handoff to PMF Sequences: read the vault (read-only), name with its templates, show where a result will land, put it into the vault project folder | 12 |
| R7 | Flexible batches: one recipe over many trajectories, through path templates | 13 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

Where this spec says **verified**, the behaviour was checked against PMF Sequences' code at the baseline, by running it. Confirm it anyway; if the code has changed, say so.

---

## The language: TypeScript, on Node 22 and React 19

I asked you to choose. This is the choice, and the reasons:

- **A local server is required.** The tool has to start `gmx` processes and read trajectories of many GB by path, and a browser page can do neither. A small Node server does that, and serves the GUI, which I open in Chrome as I do PMF Sequences.
- **Compatibility is guaranteed by reuse, not re-implementation.** The runner imports PMF Sequences' own functions (the name and folder patterns, its upload planner, the xvg and GROMACS header parsers, the structure reader), unchanged. Tests run PMF Sequences' code on the runner's output. Writing them again in another language would let the two tools drift apart.
- **Morpheus is ready for it.** Morpheus's web components (shadcn/ui on Radix) include the controls, a Dropzone and a LineChart that already draws tones, dashes, dimmed curves and max/min markers. 3Dmol, which PMF Sequences already uses, can pick atoms.
- **There is no MD maths to write.** `gmx` computes the numbers. The runner prepares inputs, runs `gmx` and handles the files, so Python's MD libraries aren't needed for RDF.

Match PMF Sequences' tool versions (React 19, Vite 8, TypeScript 6, Vitest 5, 3Dmol 2.5) so both tools build and test the same way. If Phase 0 shows that Node 22 can't run where `gmx` and the trajectories are, stop and ask.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `app/` (PMF Sequences), `README.md`, `chats/` and `project/`.
  - `app/` is **read-only** in this task: import from it, never change it.
  - `README.md`, `chats/` and `project/` are history from the original design handoff: don't follow the root `README.md`'s instructions, and don't change them.
- The new tool lives in `runner/`, with its own `package.json`. **Every path in this spec is relative to the git root.**
- Work on a new branch, `runner-rdf`, from the current HEAD (PMF Sequences after batch 2). Record that commit's hash in the Phase 0 report as the baseline.
- Baseline of `app/` when this spec was written:
  - `npm run lint`: 0 errors, 7 warnings;
  - `npm run build`: passes, with 1 warning (direct `eval` inside 3Dmol);
  - `npm test`: 390 tests pass in 20 files.
- **`git diff --stat <baseline> -- app/` stays empty at every commit.** Add a check for it to the runner's test script.

### 0.2 Living documents (in `runner/docs/`)

- `spec.md`: this spec, saved as is.
- `roadmap.md`: the checklist in section 5. Tick items as they are done, and add any new item under the right phase or under **Backlog**.
- `decisions.md`: every decision as `T1`, `T2`, …, each with a one-line rationale, in the style of `app/docs/storage-decisions.md`.
- `phase0.md`: the Phase 0 report.
- `report.md`: the final report (section 18).

### 0.3 Phase 0: Investigate and plan (no code changes)

Scratch scripts and throwaway tests are fine, but keep them outside the repository or delete them. Only the Phase 0 documents are committed.

1. **Ask me first, in one list, about the environment.** Everything else depends on the answers:
   - Where will the runner run: my laptop, a workstation, or the cluster's login node through an SSH tunnel? Which OS?
   - How is GROMACS invoked there? The binary name and path (my files show `gmx`, `gmx_mpi` and `gmx_mpi_sse4.1`), versions (2021.4 and 2025.4 appear), and any `module add` step.
   - Is Node 22 available there?
   - How big are typical trajectories (GB, frames, atoms)?
   - Can I give you a **small real test system**: a `.tpr`, a `.gro`, an `.xtc` of about ten frames and an `.ndx`?
2. **Baseline.** Run lint, build and tests in `app/`, and record the results. If anything fails, or the numbers differ from section 0.1, stop and tell me.
3. **Read Morpheus** (section 4) and list the tokens, components and fonts you will use.
4. **Confirm the PMF Sequences contract** (section 3) against the code, item by item.
5. **For each request R1–R7**, write:
   - **Proposed change.** The smallest design that meets the requirements, with every file you will create.
   - **Code budget.** Estimated lines.
   - **Writes.** Every place it writes to disk, and why.
   - **Tests.** By name.
   - **Risks.**
   - **Open questions.** Each with options and your recommendation.
6. **Show me the GUI before building it.** Make static wireframes of the main screens in Morpheus (inputs, groups with the 3D view, RDF settings, a running job, the result with "send to vault") and send screenshots, light and dark.
7. **Order.** Confirm the roadmap in section 5, or propose a better order with reasons.
8. Put all open questions into **one numbered list** at the end of the Phase 0 report.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–5: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them and see them fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.** Simplify it, delete anything that became dead, match the naming of the code around it, and remove debug output.
5. Run lint, build and tests in `runner/`, plus the `app/` tests and the empty-`app/`-diff check.
6. Run the item's manual checks in Chrome against the dev server, and watch the console. Take a screenshot of every visual check.
   - Headless Chromium draws WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
   - Anything you can't run (a real `gmx` you don't have, a real GPU, a real folder picker) is marked **not run** and listed for me. Never report a manual check as passed unless you ran it.
7. Update `runner/docs/roadmap.md` and `runner/docs/decisions.md`.
8. Commit (section 17).
9. Give me a short summary (3–5 lines): what changed, lines added, tests added, manual checks run or not run (with screenshots), and anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- the runner would write anywhere other than its output folders and the vault inbox (section 12);
- the runner would run `gmx` on my real data for the first time: show me the exact command first;
- the code contradicts this spec or the approved plan;
- an item would exceed its code budget by more than about 50 %;
- you want a dependency not listed in section 4;
- a test needs GROMACS input or output that isn't in `app/test/fixtures/` or the test system I gave you;
- GROMACS behaves differently from what this spec says (option names, defaults, output format).

Batch your questions where you can, and give each one options and a recommendation. Don't ask about things the code, the docs or this spec already settle.

---

## 1. Principles

### 1.1 Minimal, concise code

- Write the smallest correct design. Add a module or abstraction only when at least two places use it. RDF is the only analysis for now, but keep it in one place, so that the second analysis is a small addition rather than a rewrite.
- **Reuse PMF Sequences by import, never by copy** (section 3). If something you need isn't exported, or can't run in Node, ask. Don't change `app/`.
- **The server is small.** Use Node's own `http`, `child_process` and `fs` unless a library removes more code than it adds. Say which in Phase 0.
- Morpheus components are copied from the design system as they are (section 4), not restyled.
- **Every decision lives in a pure function with tests:**
  - building the `gmx` command;
  - turning picked atoms into index groups;
  - reading and writing `.ndx` files;
  - rendering names from templates;
  - checking where a file will land;
  - parsing `gmx` progress.
  Components and the server only call them.
- Delete code that becomes unused. No commented-out code, and no `TODO` without a roadmap entry.
- Prefer clarity to cleverness: short functions, and names in the domain's words (trajectory, run input, structure, group, reference, selection, frame, recipe).

### 1.2 Web development practice

- **Morpheus throughout** (section 4):
  - colours, type, radii and spacing from its tokens, never typed in;
  - mononoki served from the runner's own files, never from Google or a CDN;
  - lowercase controls, one primary action per view, states as words;
  - destructive actions armed on the first click and done on the second;
  - the 2px `ring` focus outline.
- **Keyboard and accessibility:**
  - every control is reachable by keyboard;
  - everything picked in 3D can also be picked from a list or by rule, because a 3D view alone isn't accessible;
  - status and progress are announced (`aria-live="polite"`);
  - text contrast is at least 4.5:1, and curves, markers and group colours at least 3:1, in both themes.
- **Long jobs never block the page.** Progress streams from the server, and the GUI survives a reload while a job runs.
- No console errors or warnings. The layout works at 1024 px wide.

### 1.3 Running programs safely

The runner starts processes on my machine from a web page, so:
- **The server listens on 127.0.0.1 only.** It prints a URL with a random token, as Jupyter does. Every request needs the token, and requests with a foreign `Host` or `Origin` are refused, so another web page can't drive it.
- **No shell, ever.** `gmx` is started with an argument array (`spawn(file, args, { shell: false })`), so selections, names and paths are passed as data. Test it with an argument containing `; rm -rf`.
- **The `gmx` binary** is one I configured, checked with `gmx --version`, and recorded with each run.
- **The runner never deletes or overwrites a file.** It writes only:
  - into the output folders;
  - into the vault inbox (section 12);
  - into its own state folder.
- **Cancel stops the whole process group,** and the job is recorded as cancelled.
- **No network access** beyond serving the GUI to my browser.

### 1.4 Data practice

- **Inputs are never modified.** Uploaded files are stored byte for byte.
- **Every output is reproducible from its run record** (section 11):
  - the exact command, working directory and `gmx` version;
  - the inputs, the groups with their atom numbers, and every parameter;
  - the frames read, the exit status and the log.
- **The GROMACS header of an output stays exactly as `gmx` wrote it.** PMF Sequences reads provenance and the analysis type from it.
- **Atom numbers are GROMACS atom numbers:** 1-based positions in the run input. They are never the viewer's atom index and never the `.gro`/`.pdb` serial (section 3).
- **The structure must match the run input.** If its atom count differs from the `.tpr`'s, the run is blocked, with both numbers shown.
- **Units are written with every number:** r (nm), g(r) dimensionless, time (ps).
- **Defaults are GROMACS's own, read from the installed version,** and shown as such. The tool never hides a choice that changes the meaning of g(r) (normalisation, reference position, exclusions, cut-off).
- **Large files are streamed or read by path,** never loaded whole into the browser.
- **Determinism.** The same inputs and recipe give the same command, the same file names and the same `.ndx`.

---

## 2. Scope limits

- `app/` is not changed (section 0.1).
- The runner only reads the vault, except for one inbox folder (section 12). It never writes in `.matrix/`, never writes a record, and never moves or renames a vault file.
- RDF only. Other analyses go to the backlog.
- No cluster job submission (PBS) in this task.
- No trajectory processing (`trjconv`, making molecules whole), unless Phase 0 shows that RDF can't be right without it. In that case, ask.

---

## 3. The PMF Sequences contract

The runner relies on these facts about PMF Sequences. **Verified** by running its code at the baseline:

- **Untracked files.** Any file anywhere in a project's visible folder that no record references is listed under **Vault → Untracked files**. Attaching it moves it into place and opens the upload dialog (`scanProject` in `storage/index.ts`, untracked list in `storage/project.ts`, `attachData` in `App.tsx`).
- **Folder names with `--`.** A folder whose name ends in `--<id>` is read as a column, cell or analysis folder (`ID_DIR` in `storage/path.ts`). The runner's inbox folder must not contain `--`.
- **How an attached file is placed.** Attaching passes no folder path, so PMF Sequences places the file by:
  - its **file-name pattern** (project setting `pattern`, default `{method}_{column}_{seq}_t{time}.xvg`);
  - its **folder pattern** (`pathPattern`), matched against the GROMACS header's `Working dir:` line.

  Verified with the real `app/test/fixtures/gmx/07.md_rdf_protein_sugar.xvg`, whose working directory was set to `…/hmr+fast+6/ha/WRWYCR/9.multiwalker/2`:

  | Project settings | Result |
  |---|---|
  | folder pattern `{method}/{column}/{seq}/{*}/{run}` | WRWYCR × HA, group `hmr+fast+6`, run 2, type RDF (from the header), with nothing typed |
  | file named `hmrfast6_ha_WRWYCR_t200000.xvg`, default file pattern | WRWYCR × HA, run 1 |
  | neither | type RDF, but I have to type the row |

  So the runner **runs `gmx` with the trajectory's folder as its working directory**, and names outputs with the project's own patterns.
- **Type detection.** The header title `Radial distribution` (tool `gmx rdf`) makes the file an RDF (`detectAna`). Each selection's legend becomes the curve label (`Protein` in the fixture), so group names matter.
- **One curve per RDF file by default.** The default RDF definition reads only y column 2 (`yCols: '2'` in `DEFAULT_ANALYSES`). A `gmx rdf` output with several `-sel` columns imports only the first unless I change the definition (section 10, requirement 4).
- **Provenance.** `parseGmxHeader` (`gmxHeader.ts`) reads the leading `#`/`@` block: the `:-) GROMACS - gmx rdf, <version> (-:` banner, `Working dir:`, `Command line:`, `Executable:` and `This file was created`.
- **Duplicates.** Identical content (SHA-256) already in the project is flagged on upload.
- **Atom numbering.** `toPdb` (`structFile.ts`) leaves out virtual sites and atoms whose element it can't decide, numbers `.gro` atoms modulo 100 000 and residues modulo 10 000. So **neither 3Dmol's atom index nor the PDB serial is the GROMACS atom number.** Keep your own map from each drawn atom to its 1-based position in the file, and test it on a structure that has a left-out atom.
- **Opening a vault writes.** Don't use `Vault.open` or `ProjectService`: they recover journals, upgrade schemas and rebuild the cache. Read the few record and settings files you need directly, through a reader that cannot write (a test proves it).
  - The vault is now schema 3 (`SCHEMA_VERSION`), with exports at v6.
  - Refuse vault features, with a clear message, for any other `app`, `format` or a schema newer than you know.
- **Reuse these, unchanged, by import:**

| Need | From `app/src/lib/` |
|---|---|
| Name and folder patterns | `seq.ts`: `TOKENS`, `parseName`, `parsePath`, `mergeSettings`, `getAnalyses` |
| Where a file will land | `seq.ts`: `planBatch` (with `parseTable`) |
| xvg and GROMACS header | `seq.ts`: `parseTable`; `gmxHeader.ts`: `parseGmxHeader` |
| Structure reading and drawing | `structFile.ts`: `structFormat`, `elementOf`, `toPdb`, `structStyle`, `defaultView` |
| Safe file names | `storage/path.ts`: `safeFileName`, `uniqueName` |
| Curve shades | `shade.ts` |

---

## 4. Design: Morpheus

Morpheus is my design system: <https://claude.ai/artifact/RFhVLdZ9iBn1TJ9n3ybC3w>. It was made in <https://claude.ai/code/session_01RxajN5sxwG3ZGroqrgTRuH>.

- **Read first:** `project/README.md` (the brand book), then `project/tokens.json`, `project/components/src/theme.css`, `project/components/src/lib/utils.ts` and `lib/tones.ts`, and each `project/components/src/ui/*.tsx` you use with its `components/<Name>/README.md`.
- If you can't reach the artifact, stop and ask me for an export. Never guess its values.
- **Set-up,** following the README's "Building with shadcn/ui":
  - Tailwind v4;
  - `theme.css` at the top of the global stylesheet;
  - a `tokens.css` generated from `tokens.json` by a small script, never typed by hand;
  - the four mononoki `.woff2` files from `project/fonts/` with their licence;
  - `data-theme` on `<html>` for light and dark.
- **Pre-approved dependencies:** the `@radix-ui/react-*` primitives the copied components need, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `tw-animate-css`, `tailwindcss` v4 with its Vite plugin, and `3dmol`. Anything else needs my approval.
- **Components to prefer:** Button, ToggleGroup (`segmented`), Tabs, Dialog, Input, Select, Checkbox, Field, Card, Section, Dropzone, Stat, Badge, Alert, Toaster, Kbd, Tooltip, LineChart.
- **The rules that matter most here:**
  - lowercase controls (`run`, `cancel`, `+ group`, `send to vault`), and one primary action per view;
  - the `label` style for section heads;
  - facts joined with `·`;
  - states as words (`running…`, `✓ done`, `✗ failed`, `cancelled`);
  - each group gets a hue in palette order: its chip is `<hue>` with `<hue>-foreground`, and its atoms in 3D and its curve use `<hue>-strong`;
  - status hues: `mint` done, `butter` pending, `sky` info, `destructive` for errors.
- **Logs and commands** use the README's code and log colours, and are copyable.

---

## 5. Roadmap

Copy this into `runner/docs/roadmap.md` and keep it current.

**Why this order:**
- the foundation and safety come first;
- picking atoms correctly is the hardest part and decides whether the RDF means anything;
- running RDF needs both;
- the vault handoff needs real outputs to test with;
- batches reuse everything before them.

### Phase 0: Plan
- [ ] Environment questions answered; test system received
- [ ] Branch created; baseline commit and `app/` results recorded
- [ ] Morpheus read; PMF Sequences contract confirmed
- [ ] Phase 0 report for R1–R7, with wireframe screenshots
- [ ] Questions answered; decisions T1… recorded; order confirmed

### Phase 1: Foundation (R1)
- [ ] R1a `runner/` scaffold, Morpheus theme and fonts, the empty-`app/`-diff check
- [ ] R1b Server: 127.0.0.1, token, `Host`/`Origin` check, static GUI
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
- [ ] R4b Run, progress, frames read, cancel, log
- [ ] R4c Result chart (Morpheus LineChart) and summary
- [ ] R5 Output names, folders, run record, nothing overwritten

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
- Trajectory preparation (`trjconv -pbc mol`, centring).
- Anything PMF Sequences would need to change to make the handoff even easier. Note it here for a later PMF Sequences batch; don't change `app/`.

---

## 6. Files you will mostly work with

| Area | Where |
|---|---|
| Reused, read-only | `app/src/lib/seq.ts`, `gmxHeader.ts`, `structFile.ts`, `shade.ts`, `storage/path.ts` (section 3) |
| Vault format, read-only | `app/src/lib/storage/records.ts`, `manifest.ts`, `settings.ts`, `index.ts`, `path.ts`; `app/README.md` *The vault format* |
| Real GROMACS outputs | `app/test/fixtures/gmx/` (RDF, mindist, numcont, hbdist, histogram) |
| Structures | `app/test/fixtures/test.pdb`, `WTA.gro`, `cccccccc.gro`, `mmmmmmmm.gro` |
| Building test vaults | `app/scripts/node-backend.ts` and `Vault.create`, in a temp folder only |
| New code | `runner/` (server, GUI, tests, docs) |

---

## 7. R1: Foundation

1. **One command starts the runner** (`npm start` in `runner/`) and prints the URL with its token. The GUI opens in Chrome.
2. **Morpheus theme**, light and dark, following the system setting with a manual switch; fonts self-hosted.
3. **`gmx` configuration.**
   - The binary path, plus an optional environment (for example from `module add`), as Phase 0 agrees.
   - Checked with `gmx --version`; the version is shown and recorded.
   - No working `gmx` means a clear message and no run buttons.
4. **Jobs.**
   - Started without a shell, from a pure command builder.
   - stdout and stderr streamed to the GUI and kept in the run's log.
   - Progress parsed from `gmx`'s frame lines.
   - Cancel stops the process group.
   - The job list survives a page reload and a server restart; Phase 0 decides how (recommendation: a small state folder for the runner).
5. **A fake `gmx` for tests** (a Node script) that answers `--version` and `rdf -h`, writes a real RDF output (the fixture's text, with its header's command and working directory set from its own arguments), prints frame progress, and can be slow or fail on request. Tests against a real `gmx` run only when `GMX` is set.

**Tests:**
- Command builder: arguments stay one argument each, including one with spaces and `; rm -rf`.
- Server: refuses requests without the token, with a foreign `Host` or `Origin`, or outside the allowed folders (`..`, symbolic links).
- Jobs: progress parsing, cancel (no process left), non-zero exit recorded.
- The fake `gmx` round trip.

**Manual checks:** start, open, both themes, a missing `gmx`, keyboard only.

---

## 8. R2: Inputs

1. **By path, the default.** A server-side file browser, limited to folders I allow, picks:
   - the trajectory (`.xtc`, `.trr`, or a `.gro`/`.pdb` with frames);
   - the run input (`.tpr`);
   - the structure to show (`.gro`, `.pdb`);
   - an optional index (`.ndx`).
2. **Picking a trajectory suggests the rest** from the same folder (for example `07_md.xtc` → `07_md.tpr`, `07_md.gro`, `index.ndx`). It always shows what it chose.
3. **By upload, for small files** (structure, index, run input) into the runner's workspace. Trajectory uploads are refused above a size agreed in Phase 0, with a message that says to use a path.
4. **Checks before anything runs:**
   - the atom counts of structure, run input and trajectory agree (for example with `gmx check` or `gmx dump`; Phase 0 picks the cheapest reliable command);
   - every file exists and is readable;
   - the numbers are shown, with any disagreement as a blocking error.

**Tests:** pure suggestion of matching files; refusal of oversized uploads; atom-count check against the fake `gmx` and, when `GMX` is set, the real test system.

---

## 9. R3: The structure in 3D, and groups of atoms

1. **The structure is drawn with PMF Sequences' structure code** (`toPdb`, `structStyle`, `defaultView`), so elements, styles, hidden water and hydrogens behave as they do there.
2. **Every drawn atom maps to its GROMACS atom number** (section 3). Hover shows: atom number, name, residue name and number, and element.
3. **Groups.** A run has one **reference** group and one or more **selection** groups. Each group:
   - has a name I can edit, which becomes the curve's legend and label in PMF Sequences;
   - has a hue in palette order, used for its atoms in 3D and its curve;
   - is built by:
     - clicking atoms (click toggles; a modifier takes the whole residue; Phase 0 proposes the keys);
     - rules: residue name, residue number range, atom name, element, "same atom name in every residue of this name" (for example every `O3` of every sugar);
     - an existing `.ndx` group;
   - shows its atom count, and its atoms as a list I can edit with the keyboard.
4. **Overlap warning.** If the reference and a selection share atoms, the tool says how many, because self-pairs distort g(r). It offers `-excl`, or disjoint groups.
5. **Groups become an index file.** The runner writes a **new** `.ndx`, next to the outputs, with exact atom numbers, and runs `gmx rdf -n <it> -ref <name> -sel <name>`. My own `.ndx` is never modified. Group names are checked for what `gmx` accepts.
   - Rules are also kept as text in the run record, so I can see how a group was made.
   - Phase 0 says whether any group should be passed as a selection expression instead, with reasons.
6. **Before a run,** each group's size is confirmed by `gmx` itself against the run input (for example with `gmx select -n … -select …`), and a mismatch blocks the run.

**Tests:**
- Atom map: `.gro` and `.pdb` fixtures; a structure with a virtual site or an undecided atom (built for the test); a `.gro` over 100 000 atoms (generated) to prove the numbering past the wrap.
- Rules → atom sets, table-driven.
- `.ndx` read and write: round trip, line format, the order kept, names with spaces refused or quoted as decided.
- Overlap detection.

**Manual checks:**
- Pick a reference and two selections on `WTA.gro` and `test.pdb`, by click and by rule.
- Load an `.ndx` from my test system.
- Keyboard only.
- Light and dark.
- Screenshots of each.

---

## 10. R4: RDF

1. **Options come from the installed `gmx rdf -h`.** GROMACS 2021.4 and 2025.4 both appear in my files and their options can differ. The form offers only options the installed version has, with its defaults:
   - **Common:** `-b`, `-e`, `-dt`, `-bin`, `-rmax`, `-norm`, `-selrpos`, `-seltype`, `-excl`, `-cut`, `-xy`, `-surf`, `-cn` (cumulative number).
   - **Help text:** each option says what it changes in the result, in one line.
   - **Expert arguments:** an extra-arguments field is a Phase 0 decision. If it exists, it is checked against the option list and still passed without a shell.
2. **The exact command is shown before running,** copyable and identical to what will run, with the working directory.
3. **Running:**
   - progress (frames read and the time reached) and the log, live;
   - cancel;
   - on failure, `gmx`'s own error message, shown first.
4. **Several selections.** `gmx rdf` can take several `-sel` in one pass over the trajectory, but PMF Sequences imports only the first column by default (section 3). Phase 0 proposes one of these and asks me:
   - one run per selection (one file each, one pass each);
   - one run with every selection (one pass; the file has several columns);
   - one run, then a per-selection copy (this would change `gmx`'s output, so explain how provenance survives).
5. **The result as a chart.**
   - Morpheus LineChart: one curve per selection in its group's hue, x `r (nm)`, y `g(r)`, the maximum marked;
   - a summary: first peak position and height, and frames used;
   - the normalisation, reference position and cut-off shown under the chart.
   - The cumulative number, if asked for, gets its own chart.

**Tests:**
- Command builder for every option, table-driven, against the option list parsed from real `gmx rdf -h` texts (ask me for the 2021 and 2025 help texts if you can't run them).
- Progress parser on real stderr samples.
- The result read by PMF Sequences' `parseTable`.
- Peak summary.

**Manual checks:**
- A real RDF on my test system, compared against a hand-run `gmx rdf` with the same command: the outputs are identical except the header's creation time.
- Cancel halfway.
- A run that fails (a wrong group).

---

## 11. R5: Outputs and provenance

1. **Where.** By default, next to the trajectory: in its folder, or in a subfolder such as `rdf/`, as Phase 0 decides. I can choose another folder for each run.
   - Uploaded inputs have no trajectory folder, so their outputs go to the runner's workspace.
   - The vault copy is section 12.
2. **Names** come from a template (section 12) and are made safe with PMF Sequences' `safeFileName`. **An existing file is never overwritten:** a new name gets a suffix, as PMF Sequences does (`uniqueName`).
3. **The run record.** Each run writes one record next to its outputs, for example `<output>.run.json`, holding:
   - the runner and `gmx` versions;
   - the command, the working directory, start and end times, the exit status, the frames read and the log;
   - every input path with its size and modification time. Hashing a trajectory of many GB is slow, so the SHA-256 of trajectories is a Phase 0 decision; small files are always hashed;
   - each group: name, how it was built, and its atom numbers (or a hash plus a count, if large);
   - every parameter, defaults included;
   - every output with its SHA-256.

   The record never goes into the vault, because PMF Sequences would list it as an untracked file.
4. **Re-run.** A run record can be opened again and run again unchanged; the new outputs get new names.

**Tests:**
- Names: template rendering, unsafe characters, collisions.
- The run record: schema validation, and a round trip into the form.
- Re-running the same record gives the same command and `.ndx`.

---

## 12. R6: Handoff to PMF Sequences

1. **Reading the vault.** I point the runner at my vault folder once. It reads, read-only (section 3):
   - the projects;
   - each project's columns and rows (name, sequence, group, existing runs per column);
   - the file-name and folder patterns.
2. **Where the result belongs.** For each output I choose a project, row, column and run, or the runner fills them from the trajectory's path through the project's folder pattern (`parsePath`), showing what came from where.
3. **Name templates.** The default output name uses the project's own `pattern`, filled with those fields.
   - I can edit the template, with the same tokens (`TOKENS`).
   - Phase 0 proposes how to keep RDF names apart from PMF names in the same folder.
4. **The landing preview.** Before sending, the runner runs PMF Sequences' own `planBatch` on the real output file (its name and header), with the project's settings, and shows:
   - the row, column, run and type PMF Sequences will give it;
   - whether that matches what I chose.

   If it doesn't match, it says why and suggests a name, a folder pattern, or the fields to type.
5. **Sending.** "send to vault" copies the output into one inbox folder in the project's visible folder.
   - The folder name is decided in Phase 0. It must not contain `--` (section 3).
   - Never overwrite; use the same suffix rule.
   - Never write anything else into the vault.
   - Then the runner says exactly what to do in PMF Sequences: "Vault → Untracked files → attach", and whether a reload is needed.
   - Phase 0 confirms whether PMF Sequences notices new files on its own, and what triggers a rescan.
6. **Optional:** a link that opens the project in PMF Sequences (`#/p/<projectId>/all`) when I've configured its URL.

**Tests:**
- **Vault reader:**
  - against vaults built in a temp folder with PMF Sequences' own `Vault.create` and Node backend, and against `app/test/fixtures/formats/`;
  - unknown schema refused;
  - **no write of any kind** (a backend that throws on write, plus a before/after listing of the vault).
- **Landing preview,** with PMF Sequences' real `planBatch`:
  - folder pattern only;
  - file pattern only;
  - neither;
  - a mismatch.
- **Sending:** only the inbox changes; a name collision; and PMF Sequences' `scanProject` lists the sent file as untracked.

**Manual checks:**
- Send a real RDF to a copy of my vault.
- Open PMF Sequences, attach it from Untracked files, and confirm it lands where the preview said.
- Screenshots of each step.

---

## 13. R7: Flexible batches

1. **Recipes.** A recipe is the saved form of a run: options, group rules, output and name templates. Recipes are saved, named, reused and exported as JSON.
   - Groups are kept as rules where possible, so they apply to other trajectories of the same system.
   - Hand-picked atoms are kept as numbers, and checked against each system's atom count.
2. **Batches.** One recipe runs over many trajectories, found by a path template with the same tokens as PMF Sequences' folder pattern. For example, `hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc` under a root I choose. Each match fills the fields used for names and the vault.
3. **The batch view.**
   - A preview first: every match, its fields, its groups' atom counts, and any problem. Nothing runs until I confirm.
   - A queue with a concurrency limit I set (Phase 0 recommends a default for my machine).
   - Each job keeps its own record. Failures don't stop the rest.
   - "send all to vault" is the same rule as R6, file by file.

**Tests:**
- Path-template matching (with PMF Sequences' `parsePath`, table-driven).
- Recipes: round trip, and applied to another system.
- The queue: the limit is respected, a failure is isolated, and cancelling everything stops every job.

**Manual checks:**
- A batch over a copy of a cluster-shaped tree (shaped like `app/test/fixtures/cluster/`, with my test system's files).

---

## 14. Testing (all requests)

- **Vitest, in Node.** Every decision is a pure function, tested table-driven.
- **Real GROMACS text only.** Use the real outputs in `app/test/fixtures/gmx/` and my test system. Ask for more real files (help texts, stderr, `.ndx`) rather than inventing formats.
- **Contract tests run PMF Sequences' own code** on the runner's outputs: `planBatch`, `parseGmxHeader`, `parseTable`, `scanProject`. If PMF Sequences changes in a way that breaks the handoff, a test fails.
- **The fake `gmx`** covers the server and job tests. Tests with a real `gmx` run when `GMX` is set, and are listed as run or not run.
- **The GUI.** Propose a small Playwright smoke test in Phase 0 (start, pick, run with the fake `gmx`, see the chart), with its cost. Everything else is a manual check with screenshots.
- **Safety tests** are required (section 1.3): token, `Host`/`Origin`, path escape, no shell, no overwrite, no vault writes outside the inbox.
- The `app/` tests keep passing, and `app/` stays unchanged.

---

## 15. Acceptance criteria

- **A. Runs safely.** Local only, with a token. No shell. Nothing deleted or overwritten. Writes only where section 1.3 allows. Cancel leaves no process behind.
- **B. Groups are right.** Atoms picked in 3D, by rule or from an `.ndx` become exactly the intended GROMACS atom numbers, confirmed by `gmx` against the run input. Overlaps are flagged.
- **C. RDF is right.** For the same command, the runner's output is identical to a hand-run `gmx rdf`, apart from the header's creation time. Every option that changes g(r) is visible.
- **D. Reproducible.** Every output has a run record that can run it again.
- **E. PMF Sequences takes it as is.** A sent RDF lands where the preview said, through Untracked files, with PMF Sequences unchanged and nothing typed when the project's patterns allow.
- **F. Flexible.** Recipes and path-template batches work over a cluster-shaped tree.
- **G. Morpheus.** Every screen follows Morpheus in light and dark, keyboard-usable, with self-hosted fonts.
- **H. Quality.**
  - lint, build and tests pass in `runner/` and in `app/`;
  - `app/` is unchanged;
  - no console errors;
  - lines and tests are reported per item.

---

## 16. Documentation

`runner/README.md`:
- **Start:** installing, configuring `gmx`, starting, and opening the URL. Use through an SSH tunnel, if Phase 0 says it's needed.
- **A first RDF, step by step:** inputs, groups, options, run, result, send to vault, attach in PMF Sequences.
- **Where files go:** outputs, run records, the vault inbox, the runner's state folder.
- **The run record format.**
- **Templates and tokens,** and how they match PMF Sequences' patterns.
- **Safety:** what the runner can and cannot do on my machine.

---

## 17. Commits

- One commit per roadmap item (R1a, R1b, …), with its ID first (`R3b: groups by click, residue and rule`). Plus one commit each for the Phase 0 docs and the final report.
- Every commit passes lint, build and tests on its own, and leaves `app/` unchanged.
- Stage files by name. Never commit generated files, test outputs, my real trajectories, or scratch files. Commit my test system only if I say so.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 18. Final report: `runner/docs/report.md`

1. **Summary table:** item → status → files → lines added → tests added → decisions.
2. **Per request:** what was built and why, and its known limitations.
3. **Screenshots** (small PNGs in `runner/docs/img/`), light and dark:
   - the inputs screen;
   - groups picked in 3D;
   - the RDF form with the command preview;
   - a running job;
   - the result chart;
   - the landing preview;
   - the attached result inside PMF Sequences.
4. **The handoff, proven:** one real RDF from my test system, from the run to its place in PMF Sequences, with the run record and the identical-output check against a hand-run `gmx rdf`.
5. **Tests:** the list and counts, which ran with a real `gmx`, and the manual QA checklist with passed, failed or not run for each item.
6. **Review:** what the fresh-context review found, and what was done about each finding.
7. **Decisions** T1… (link to `decisions.md`).
8. **Roadmap status** and the backlog, including anything PMF Sequences could change later to make the handoff easier.
9. **History:** `git log --oneline` for the branch, and `git diff --stat` from the baseline commit, showing that `app/` is unchanged.
