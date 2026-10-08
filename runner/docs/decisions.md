# gmx-cypher (runner) — decisions log

Companion to [`spec.md`](spec.md) and [`phase0.md`](phase0.md). One line of rationale per decision.
Status values: **proposed** (Phase 0, waiting for approval), **approved** (with date), **changed** (with date and reason).
`Q<n>` points at the open question in `phase0.md` §12 that decides it.

## Phase 0 — approved 2026-10-08

All approved as proposed, with your answers to Q2, Q11, Q18 and Q19 (`phase0.md` §13). T11 changed.

### Runtime and safety (R1)

| # | Decision | Rationale |
|---|---|---|
| T1 | **The server is plain Node ≥ 22.18 running TypeScript by type stripping, with a 10-line resolve hook** (`server/ts-hook.mjs`) that adds `.ts` to extensionless relative imports. No server build, no TS loader dependency. (Q3) | PMF Sequences' sources import `./pmf` without an extension, which Node refuses; with the hook, `seq.ts`, `structFile.ts`, `storage/settings.ts`, `node-backend.ts` and `shade.ts` load unchanged (tested on Node 22.22). The app's `erasableSyntaxOnly` keeps them strippable. |
| T2 | **One process, one port.** Node's `http` serves the API, the event stream and the GUI: the built `dist/` with `npm start`, Vite in middleware mode with `npm run dev`. No Express. | The token and `Host`/`Origin` checks are the same code in development and in use, and there is one URL to tunnel. Routing is a dozen paths; a framework adds more than it removes. |
| T3 | **Token:** 256 random bits per start, printed as `http://127.0.0.1:<port>/?token=…`. The first request sets an `HttpOnly`, `SameSite=Strict` cookie and redirects to the URL without the token. Every request (page, files, API, events) needs the cookie or the token. `Host` must name `127.0.0.1`, `localhost` or `[::1]` (any port), and `Origin`, when sent, the same. | Jupyter's model. The cookie lets `EventSource` and `<img>` authenticate without putting the token in every URL. Checking the host name but not the port defeats DNS rebinding and still allows an SSH tunnel to another local port. |
| T4 | **`gmx` is a name or path in the config (default: the first of `gmx_mpi` and `gmx` on `PATH` that answers `--version`)**, resolved once at start, and recorded as an absolute path with its version text. *Changed in R1c: a `gmx_mpi` that fails without `mpirun` (seen here: Open MPI's `ORTE_ERROR_LOG`) falls back to `gmx`.* The environment is inherited from the shell that starts the runner: run `module add gromacs/2025.4-cuda` first. (Q5) | `module` is a shell function, and the runner never starts a shell. Inheriting the environment is shell-free, needs no config, and matches how you run `gmx` by hand. |
| T5 | **State folder `~/.<name>/`** (or `$RUNNER_HOME`): `config.json`, `jobs/<id>.ndjson`, `uploads/<sha256>/<file>`, `checks/<job>/`, `recipes/`, `help/<gmx-version>.txt`. Outside it, nothing is ever overwritten or deleted. Inside it, `config.json` and recipes are replaced atomically (write new, rename), and job logs are only appended. (Q4) | Settings have to change, and an atomic replace never leaves a half-written file. Everything that is data (outputs, inbox, uploads) is write-once. |
| T6 | **Jobs** are spawned as `spawn(file, args, { shell: false, detached: true, cwd })`, so each is its own process group. Cancel sends `SIGTERM` to the group, then `SIGKILL` after 5 s, and records `cancelled`. Stopping the server (`SIGINT`/`SIGTERM`) cancels running jobs first. A job with no end event after a crash shows `interrupted`, with its pid. | Section 1.3: cancel stops the whole group. Without `detached`, killing the group would kill the server too. |
| T7 | **Job state is an append-only event log per job** (`queued`, `started`, `output`, `progress`, `ended`), replayed at start and streamed to the GUI with Server-Sent Events. A reloaded page fetches the jobs and subscribes again. | It survives reloads and restarts with no database, and the log is the run's log. |
| T8 | **Progress is parsed from stderr**: `Reading frame N time T`, `Last frame N time T`, `Analyzed N frames, last time T`, split on `\r` and `\n`. A percentage is shown only against a known end (`-e`, or `nsteps × dt` from the run input), marked `≈`. | That is what `gmx rdf` prints (stdout stays empty). GROMACS prints frames less often as the count grows, so the frame and time are exact, and the percentage is an estimate. |
| T9 | **The fake `gmx`** (`test/fake-gmx.mjs`) answers `--version`, `rdf -h` (your real 2025.4 text), `dump -s`, `check -f`, `select -os` and `rdf`. For `rdf` it writes the real fixture with the header's command and working directory taken from its own arguments, prints frame progress, and fails or slows down on `FAKE_GMX_FAIL` / `FAKE_GMX_SLOW`. Real-`gmx` tests run only when `GMX` is set. | Section 7.5. Every text it prints is copied from real GROMACS output. |

### Inputs (R2)

| # | Decision | Rationale |
|---|---|---|
| T10 | **Allowed folders are a list in the config.** Every path is `realpath`-ed and must lie inside one, so `..` and symbolic links can't escape. The browser lists folders and the files with a GROMACS input extension. Other files are counted but not listed. | Section 8.1. Resolving first, then checking, is the only check that symlinks can't fool. |
| T11 | **Uploads of any size and input kind** are streamed to `uploads/<new id>/<safe name>` and written once; other files are refused before they are sent. *Changed 2026-10-08 (Q11): no size limit. Changed in R2a: a folder per upload instead of per SHA-256, which is only known after the stream, so a duplicate would have left a file to delete; the SHA-256 is still returned and recorded.* | Streaming keeps memory flat whatever the size; picking by path stays the default for trajectories. |
| T12 | **Suggestions:** the same stem first (`nvt.xtc` → `nvt.tpr`, `nvt.gro`), else the only file of that kind in the folder. For the index: `<stem>.ndx`, then `index.ndx`, then `../index.ndx`, as in your RDF fixture's command. Each choice is shown with its reason. | Section 8.2. A pure function of the folder listing. |
| T13 | **Atom counts:** the structure with PMF Sequences' `countAtoms`; the run input with `gmx dump -s`, stopped at the first `natoms = N`; the trajectory with `gmx check -f`, stopped at `# Atoms N` after the first frame. Any disagreement blocks. An index whose largest atom number exceeds the run input's count is refused. | These are the cheapest reliable readings: neither reads more than the first frame or the header, and both report the number as `gmx` sees it. |

### Atoms and groups (R3)

| # | Decision | Rationale |
|---|---|---|
| T14 | **The atom table** lists every atom of the structure file in file order. Its 1-based position is the GROMACS number. `drawn` means `toPdb` keeps it, decided with PMF Sequences' own `elementOf`. The viewer loads `toPdb`'s text with `keepH: true` and hides hydrogens by style, so 3Dmol's atom index k is the k-th drawn atom. | Checked in Chromium on your `nvt.gro`: 3Dmol holds exactly the 2,442 drawn atoms of 3,242, in `toPdb`'s order. PMF Sequences' own viewer drops hydrogens with `keepH: false`, which would shift every index. |
| T15 | **Picking:** click toggles an atom in the current group; `shift`-click toggles its residue; `alt`/`option`-click toggles that atom name in every residue of this name. Hover shows `atom 47 · OW1 · SOL 20 · O`. Every group is also editable as a list and by rules. (Q24) | Section 9.3, with the keys most 3D viewers use. The list and rules make everything reachable without the 3D view. |
| T16 | **Rules:** residue name, residue number range, atom name, element, and same name in every residue of this name. They are combined as added or removed steps, each kept as text in the run record, and evaluated on the whole atom table, virtual sites included. | Section 9.3. Rules mean the same as GROMACS's `resname`/`name`, and stay valid on other trajectories of the same system (R7). |
| T17 | **Groups reach `gmx` as index groups referenced by number** (`-ref 'group 0' -sel 'group 1' 'group 2'`), from a new `.ndx` written next to the outputs. No group is passed as a selection expression. (Q6) | GROMACS matches group names case-insensitively and by prefix (verified: `group "water"` found `water_O`); numbers can't be ambiguous. The legend is still the group name (verified), atom numbers are exact, and nothing needs selection-language quoting. Your own commands use `'group 28'` the same way. |
| T18 | **Group names:** 1–32 characters from letters, digits and `_ - + . :`; no spaces; unique ignoring case. (Q6) | GROMACS reads only the first word of `[ name ]` (verified: `[ water O ]` became `water`). The name is the curve label in PMF Sequences. |
| T19 | **`.ndx` format as GROMACS writes it:** `[ name ]`, then numbers right-aligned in width 4, separated by single spaces, 15 per line, in the group's order. Reading keeps duplicate names (your `index.ndx` has six) and addresses groups by position. | It matches GROMACS's own files byte for byte, and keeps the order. |
| T20 | **Overlap:** the number of atoms the reference shares with each selection is shown as a warning offering `-excl` (only with atom positions) or removing them. Nothing changes silently. | Section 9.4. `gmx rdf -h`: exclusions don't change the normalisation. |
| T21 | **Before every run**, `gmx select -s <tpr> -n <ndx> -select 'group 0' … -os checks/<job>/sizes.xvg`. Each size must equal the runner's count, or the run is blocked. | Section 9.6. The check writes into the state folder only. |

### RDF (R4)

| # | Decision | Rationale |
|---|---|---|
| T22 | **Options come from `gmx rdf -h`** of the configured binary, cached per version. The form shows `-b -e -dt -bin -rmax -norm -selrpos -seltype -excl -cut -xy -surf -cn`, plus `-pbc` and `-rmpbc`, which also change g(r). The runner sets `-f -s -n -o -cn -ref -sel`. It fixes `-tu ps` and `-xvg xmgrace`, and doesn't offer `-fgroup` (your trajectories are all-atom) or `-sf`. | Section 10.1 and 1.4: nothing that changes g(r) is hidden. PMF Sequences needs the xmgrace `@` lines. Your 2025.4 help and the 2023.3 one here list the same options. |
| T23 | **Only options that differ from the installed defaults are passed.** The run record lists every option with its value and whether it was the default. | The command stays like a hand-written one, and the record is complete. |
| T24 | **No extra-arguments field.** (Q14) | Every `gmx rdf` option is already in the form; free text would only add a way to break the no-overwrite and naming rules. |
| T25 | **The command is shown as `cd <working dir>` plus the exact argv, POSIX-quoted**, so pasting it into a shell runs the same thing. | Section 10.2. The quoting is display only; the run itself has no shell. |
| T26 | **Several selections: one run, one file**, one pass over the trajectory. The landing preview says how many curves PMF Sequences will import, and how to import all of them. (Q7) | One pass matters on many-GB trajectories, and the file stays exactly as `gmx` wrote it. |
| T27 | **First peak:** the highest point of the first stretch where g(r) > 1; if g(r) never exceeds 1, the global maximum. The chart marks the maximum (Morpheus marker). (Q23) | A simple rule that ignores noise below the first shell and can be stated in one line under the summary. |
| T28 | **Identical output** means identical except two header lines: `This file was created …` and the random backronym under `is part of G R O M A C S:`. (Q8) | Verified: two otherwise identical runs differ in that line (`# Gravel Rubs Often…`; your fixture has `# Grunge ROck MAChoS`). |

### Outputs and provenance (R5)

| # | Decision | Rationale |
|---|---|---|
| T29 | **Outputs go to `<trajectory folder>/rdf/`**, created if missing. `gmx` runs in the trajectory folder with relative paths (`-f nvt.xtc -o rdf/rdf_nvt.xvg`), so the header's `Working dir:` is the trajectory folder. Runs on uploaded inputs write to `<state>/workspace/<job>/`. (Q9) | PMF Sequences' folder pattern reads that line. The subfolder keeps outputs apart from your PMF files. |
| T30 | **One stem per run** (`<stem>.xvg`, `<stem>_cn.xvg`, `<stem>.ndx`, `<stem>.run.json`). The stem comes from the template through `safeFileName`, and is made unique with `uniqueName` against the whole output folder, so all four names are free. It is re-checked just before the spawn. The runner's own files are created with `O_EXCL`. A GROMACS backup (`#…#`) appearing after a run is recorded as an error. | GROMACS renames an existing output to `#name.1#` instead of refusing (verified). Choosing free names first is the only way to keep its backups from ever firing. |
| T31 | **Run record v1** (`<stem>.run.json`): runner and `gmx` versions, argv, working directory, environment variables that start `GMX`, times, exit status, frames, log, inputs (path, size, mtime, SHA-256), groups (name, hue, build steps, atoms as ranges like `43-3239:4`), every option, outputs with SHA-256, and the recipe. Trajectories get size and mtime only, unless "hash trajectories" is on. (Q10) | Section 11.3. Ranges keep all 800 water oxygens in a dozen characters, so atom numbers are always complete. |

### Handoff to PMF Sequences (R6)

| # | Decision | Rationale |
|---|---|---|
| T32 | **Vault reader:** PMF Sequences' `NodeBackend` wrapped in a backend whose write methods throw, read through its `VaultIO`, `readManifest`, `compatibility` and `readSettings`, and turned into a Store by its own `storeFrom`. Schemas 1–3 are read; newer schemas and foreign `app` or `format` are refused with a message. (Q13) | Section 3: the reader cannot write, and every format rule is PMF Sequences' own code. Older vaults read the same fields; PMF Sequences upgrades them itself when it opens them. |
| T33 | **Landing preview = `planBatch`** on an upload entry built exactly as Vault → attach builds one: the file's text, `parseTable`, `parseGmxHeader`, `parsed: parseName(name, pattern)`, and no folder path. It runs against `storeFrom` of the project. | Verified: the three placement rows of section 3 reproduce only with `parsed`, which the upload dialog adds. |
| T34 | **The default file name is the project's `pattern`** filled with the fields (`{analysis}` → `rdf`). RDF and PMF files are kept apart by folder (`rdf/` next to the trajectory; PMF Sequences moves an attached RDF into the cell's analysis folder), not by name. | A changed name would stop `parseName` from reading the fields. |
| T35 | **Inbox `<project folder>/_inbox/`**: no `--`, and not one of PMF Sequences' own `_sequences`, `_imports` or `_restored`. Files are copied with `O_EXCL` under `uniqueName`. Only the g(r) file is sent: the cumulative-number file is titled `Cumulative Number RDF`, which PMF Sequences would read as another RDF. (Q12) | Section 12.5. `scanProject` lists files in a folder without `--` as untracked (verified). |
| T36 | **After sending**, the runner says: open the project in PMF Sequences, Vault → Check folder now (or reload the page), Untracked files → attach. It also offers a link to `#/p/<projectId>/all` when PMF Sequences' URL is configured. | Verified: PMF Sequences rescans the folder only when a project opens, after a save, or on "Check folder now". Window focus doesn't rescan. |

### Batches (R7)

| # | Decision | Rationale |
|---|---|---|
| T37 | **Recipe v1** (JSON): options, groups as rules (hand-picked atoms as ranges, checked against each system's atom count), output folder and name template, vault target. Saved in `<state>/recipes/`, exported and imported as files. | Section 13.1. |
| T38 | **Path templates are matched with PMF Sequences' `parsePath`** on each trajectory's path relative to the batch root (tokens don't cross `/`, `**` is any folders, `{*}` is ignored). | The same tokens and meaning as the project's folder pattern, by the same code. |
| T39 | **The queue runs 2 jobs at a time by default**, settable from 1 to the number of cores. (Q16) | `gmx rdf` uses about one core and is often limited by reading the trajectory. |

### GUI and tests

| # | Decision | Rationale |
|---|---|---|
| T40 | **Screens:** a header with the name, the `gmx` state, the vault and the theme switch; tabs `inputs · groups · rdf · jobs · batch`; one primary action per view; send to vault as a dialog named after its target (`NA2SO4 × SO4`). (Q25) | The wireframes in `phase0.md` §9. A dialog keeps the result readable at 1024 px. |
| T41 | **Commands and logs** sit on `field` with a `border` hairline, in `foreground`. The GROMACS banner and file lines are `muted-foreground`, the error block `destructive`. Each has a copy button. (Q15) | Morpheus has no code or log colours (checked: none in `tokens.json` or the README), so only existing tokens are used. |
| T42 | **Group hues in palette order**: the reference takes `coral`, the selections `sky`, `mint`, `butter`, and on. The chip is `<hue>` with `<hue>-foreground`; atoms in 3D and the curve are `<hue>-strong`. | Section 4. The reference's hue never appears as a curve, so the selections' curves start at `sky`, like the wireframes. |
| T43 | **Theme** follows `prefers-color-scheme` until switched; the switch (light · dark · auto) is a browser preference in `localStorage`, not data. | Section 7.2. Same split as PMF Sequences' preferences. |
| T44 | **`npm test` first checks that `app/` is unchanged** (`git diff --exit-code <baseline> -- app/` and no untracked files there), then runs Vitest. | Section 0.1. |
| T45 | **Contract tests import PMF Sequences' `planBatch`, `parseGmxHeader`, `parseTable`, `scanProject` and `Vault.create`** (temp folders only) and run them on the runner's outputs. | Section 14. If PMF Sequences changes in a way that breaks the handoff, a runner test fails. |
| T46 | **One Playwright smoke test** (`npm run e2e`, not part of `npm test`), using the installed Chromium: start with the fake `gmx`, pick inputs, run, see the chart. Needs `@playwright/test`. (Q17) | Section 14. It costs one devDependency and about 60 lines. |
| T47 | **Lint skips only `react/only-export-components` in `src/ui/`** (R1a). | The copied Morpheus files export their variant helpers (`buttonVariants`…), as shadcn does; the rule is about hot reload only, and the copies stay unchanged. |
