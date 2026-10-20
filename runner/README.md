# gmx-cypher

A local tool that runs GROMACS analyses on your trajectories and energy files: `gmx rdf`, `distance`, `hbond`, `rms`,
`rmsf`, `gyrate`, `mindist`, `density`, `order`, `energy`, `awh` and `wham`. You pick atom groups in 3D or by rule, see
the exact command before it runs, get every output with its record, compare results of any command side by side or on
one graph, export any chart, and hand results to **the Matrix** through its vault, where they land in the right row,
column and run. A *cluster* tab shows your cluster jobs (`qq jobs` with `gmx-eta -a`).

It runs on your machine (or the machine that has the trajectories), serves its page on 127.0.0.1 only, and never
deletes or overwrites a file.

How it looks and behaves (words, colours, keys, the order of a result page) is fixed in the design contract:
[`docs/design-contract.md`](docs/design-contract.md), enforced by tests from `src/core/contract.ts`.

## Start

You need Node.js 22.18 or newer, and GROMACS (`gmx_mpi` or `gmx`).

```sh
git clone --recurse-submodules https://github.com/Kikoun18/gmx-cypher
cd gmx-cypher/runner
npm install
npm start                       # builds the page, then starts the server
```

In a clone you already have, `git submodule update --init` fetches `matrix/` (do it once, and again after a pull that
moves it). `matrix/` is the Matrix, whose own code gmx-cypher reads vaults with; see *The Matrix* below.

It prints an address with a one-time token. Open it in Chrome:

```
gmx-cypher 0.1.0 is running. Open:

  http://127.0.0.1:8765/?token=…

gmx: /software/gromacs/2025.4/bin/gmx_mpi · 2025.4
```

The token goes into a cookie and leaves the address bar; a new start prints a new token.

**Finding `gmx`.** gmx-cypher uses the `gmx` set in *settings*, or else the first of `gmx_mpi` and `gmx` on your `PATH`
that answers `--version`. If GROMACS comes from a module, load it first, in the shell you start gmx-cypher from, so it
inherits the paths and libraries (`module add gromacs/2025.4-cuda`, then `npm start`).

**Options.** `--port 8765` (another port), `--gmx <name or path>` (saved in settings), `--allow <folder>` (a folder the
file browser may show; repeat it for several), `--dev` (development mode with hot reload). `GMX_CYPHER_HOME` moves the
state folder (default `~/.gmx-cypher`).

**On another machine** (a workstation that has the trajectories): start it there and open it through an SSH tunnel; it
says so when it starts: `ssh -L 8765:127.0.0.1:8765 workstation`, then the same address here.

**Closing the terminal.** When the terminal or SSH session closes (SIGHUP), gmx-cypher keeps running, so its jobs
finish and get their records; it logs `SIGHUP: the terminal closed; gmx-cypher keeps running (pid N). Stop it with:
kill N`. Its page stays where it was. To stop it: Ctrl-C in its terminal, or `kill <pid>`; that cancels its running
jobs first. To start it detached from the outset, `nohup npm start > gmx-cypher.log 2>&1 &` (or inside `tmux`).

## Set-up

Three steps, **inputs · groups · command**, each at an address of its own (`#setup/inputs`, …), so a reload keeps the
step and back and forward work. *one trajectory* or *batch* switches the mode.

1. **Settings.** Check that `gmx` reads *ready*. Add the folders with your simulations under *allowed folders*; the
   file browser shows only those. To send results to the Matrix, set your *vault folder* and the *connected project*:
   its folder pattern names your jobs (`WRWYCR · HA · walker 1 · rdf`), it is the default for sends, and it owns the
   saved compare views. The address where you open the Matrix gives the link after a send.
2. **inputs.** Browse to a run and click its trajectory (`.xtc`, `.trr`, `.tng`). The run input (`.tpr`), structure
   (`.gro` or `.pdb`) and an index (`.ndx`), if any, are suggested from the same folder, each with its reason; change
   any with *pick*. Small GROMACS inputs can also be uploaded or dropped anywhere on the page (a drop is split by kind:
   inputs go here, results go to compare, and the page says where each went). gmx-cypher checks that the structure,
   the run input (`gmx dump`) and the trajectory (`gmx check`) have the same number of atoms, and that an index fits.
3. **groups.** What the command calls them: a reference and selections for most, one group for `rmsf` and `gyrate`,
   the fit group then measured groups for `rms`, the carbons in tail order for `order`. Each has a name (one word, the
   curve's name) and a hue; the reference is drawn in ink.
   - *click* an atom in 3D to add or remove it, *shift*-click for its residue, *alt*-click for that atom name in every
     residue of its name, into the group being picked;
   - *+ rule*: residue name, residue numbers, atom names (`OH1, OH2 OH3 and OH4`, in every residue of a name), element,
     or a group of your index file; or type atom numbers (`43-3239:4, 5`). Shift+Enter adds a rule and keeps the form
     open for the next one in the same group.
   - For rdf, atoms shared by the reference and a selection are flagged, with `-excl` or removing them offered. *check
     sizes with gmx* counts every group with `gmx select`.
4. **command.** Pick the command (see *Commands*). Every option the form offers comes from your `gmx <tool> -h`, with
   its default and what it changes; a changed one shows *changed · default …* (click to reset). Options gmx would
   refuse are named before you run. The command on the right is exactly what will run, with the answers it reads on
   stdin. *run* confirms each group with `gmx select`, writes the index, and starts gmx; the job keeps going if you
   close the page.

**Recipes** (command step): save the options, groups, file name and folder under a name, load them again for another
trajectory of the same system, export or import them as JSON.

**Batch** (set-up, *batch* mode): one recipe over every trajectory a path template finds under a root, for example
`hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc`. *preview* lists every match, its fields, the inputs beside
it, each group's atom count there, and any problem; nothing runs until you press *run*. The queue runs a few at a time
(2 by default); *cancel all* stops them; *send all to vault* sends each by the same rule as a single send.

## Results

*results* is the jobs list and, beside it, the selected job's result (`#results/<job>`).

- **The list**: a display name per job (from the connected project's pattern, else the job's title), its status in
  words, and its progress. Search names, groups and folders; filter by command, status, batch, folder and day made;
  the filter is in the address. Click one; ⌘/Ctrl-click or its box adds or removes one; Shift-click takes a range.
  Two or more open compare in the detail pane; **D** does too, from anywhere.
- **A result page**, the same order for every command: the actions (*compare*, *compare with…*, *send to vault…*,
  *open in set-up*, *export*), the charts with their numbers, the settings and the groups as gmx counted them, then,
  folded, the files, the command and the log. A finished RDF shows both peak rules, named: the **maximum** (a filled
  dot) and the **first shell** (hollow: the highest point of the first stretch where g(r) is above 1). The log shows its last 64 kB, with *show all*.
- **Labels**: a group can be given a label (its name in charts, compare, CSVs and exports); the record, the index, the
  `.xvg` and anything sent keep gmx's names.
- **Run diff**: with two jobs selected, *diff* shows only what differs between their records (options with their
  defaults, frames, inputs, groups with the atoms added and removed, gmx and its environment); the equal fields are
  counted and shown on asking. A result's *compare with…* does the same against another job, a record on disk, or a
  record copy in the vault. An input moved but the same (by SHA-256, else size and time) is equal.
- **Archive**: select jobs that have ended and press *archive*: their files move to the jobs folder's `archive/`
  (a move, never a copy or a delete, never over another file), and they are not read at start. *archived* lists them,
  each with *unarchive*.

## Commands

Each command runs from one definition: the inputs it needs, the options it offers, its file names, what gmx would
refuse (said before anything runs), and which file goes to the vault, typed as the Matrix types it (checked with the
Matrix's own `detectAna` on real GROMACS output). Where GROMACS 2024 replaced a tool (`hbond`, `gyrate`), the picker
greys out the one your gmx doesn't have, with the reason. Times are in ps and files keep xmgrace's `@` lines.

**Trajectory and groups:**

- **`gmx rdf`**: g(r) of each selection around the reference (`-bin`, `-rmax`, `-norm`, `-selrpos`/`-seltype`, `-excl`,
  `-cut`, `-xy`, `-surf`, frames). Vault: g(r), typed RDF; the cumulative number (`-cn`) stays here.
- **`gmx distance`**: from the reference to each selection over time, between centres of mass or of geometry, or atom
  by atom. Vault: the averages, typed Distance. The histogram and every distance stay here.
- **`gmx hbond`** (GROMACS 2024 and later) and **`gmx hbond-legacy`** (before): H-bonds between the reference and one
  target, each tool by its own criteria, never mixed. Vault: the count over time, typed H-bonds.
- **`gmx rms`**: the RMSD of the fit group and of further groups after the same fit. Vault: typed RMSD.
- **`gmx rmsf`**: one group's fluctuation per atom or per residue. Vault: typed RMSF. Compare paints it on the structure.
- **`gmx gyrate`** (2024 and later; `gyrate-legacy` where it is missing): one group's radius of gyration over time.
  Vault: typed Rg.
- **`gmx mindist`**: the minimum distance from the reference to each group; the contacts within `-d` when asked (kept
  here). Vault: typed Distance.
- **`gmx density`**: the density of each group along one box axis (`-d` X, Y or Z), in slices (`-sl`); by mass,
  number or charge, or electron density once an electrons file (`-ei`, inside the allowed folders; recorded with its
  SHA-256) is given. `-center` bins around
  the first group's centre each frame (a bilayer stays put while the box breathes); `-symm` symmetrises the profile.
  One curve per group, the units as gmx writes them. Vault: typed Density (every curve).
- **`gmx order`**: S_CD per carbon of a lipid tail. The groups are the carbons in tail order, one per carbon (at least
  three); with an index file in inputs, *take the N groups of <index>* makes them in one click. gmx gives S_CD for the
  carbons between the first and the last (each from its neighbours). Vault: S_CD (`-od`), typed Order parameters; the
  order tensor (`-o`) stays here. Its own known issues, quoted on the result: it suits saturated carbons and
  united-atom force fields.

**An energy file:**

- **`gmx energy`**: terms from the file's own menu; each term's average, error estimate, RMSD and drift, a drift larger
  than its error flagged. Vault: typed Energy.
- **`gmx awh`**: the PMF of each stored frame (the last, every N-th, or all), drawn along a ramp from the oldest to the
  newest, with its **convergence**: how far each frame moved from the one before and from the final one (frames aligned
  by their mean; no threshold). The axis unit is read from the run input with `gmx dump -s` when the job starts, or the
  page says why it keeps gmx's label. Vault: the last frame, typed PMF, in kJ/mol.

**Window lists:**

- **`gmx wham`**: umbrella windows found with a folder template; the temperature read from the run inputs. The profile
  with its bootstrap band, the histograms along a ramp in their order along ξ, and the overlap of each pair of
  neighbouring windows, gaps named. Vault: the histograms, typed Histogram; the profile stays here.

## Compare

`#compare?jobs=…`: the results of any command, side by side (*each result*) or on one graph (*one graph*, like
quantities only: the same x and the same y unit, else the reason in words). Sources: *jobs* (the list's selection),
*on disk* (records found under a folder of the allowed ones), *vault* (the Matrix vault's RDFs, each with its row's
structure) and *files* (dropped or picked, never kept).

- **Each result**: a card per result with its structure beside its chart. RDF cards plot groups (click a group's atom
  or chip; ⌘/Ctrl-click adds); RMSF is painted on the structure; H-bond pairs, distance and mindist lines are drawn on
  it; `gmx rms` names its fit group. RDFs whose groups match can be morphed into one card (*morph with…*).
- **Same scale** (x, y, or both) makes like charts share their axes; a card can keep its own.
- **Line styles**: each curve's dash, width and shade, from its legend; kept with the view.
- **Marks and lines**: click a chart to mark the nearest point, ⌘/Ctrl-click for a vertical line, ⌘/Ctrl-Shift-click
  for a horizontal one (as in the Matrix); each with a note; carried into every export and the CSV.
- **Saved views**: *views* saves what compare shows (its sources, how it shows them, the labels and marks) by name,
  with the connected project, in the vault's gmx-cypher folder; *open* brings one back. A name is used once: nothing is
  replaced. A view keeps only its sources' state, each record by its path relative to its allowed folder; two records
  that would be saved under one path are refused, in words. Without a connected project the working state stays in this
  browser only.
- **A vault RDF** gets its groups' atoms from the job that wrote it: one of this gmx-cypher's, found by the file's
  SHA-256, else the record copy the sending gmx-cypher kept in the vault (*groups from … (its record in the vault)*).

## Exports

Every chart has *export*: **SVG, PDF and PNG** drawn by the Matrix's own figure code (so they look like the Matrix's),
**CSV** (every curve at gmx's own precision, with `#` lines for the command, gmx version, record, source SHA-256, the
groups' labels and atoms, and the marks), and **HTML** (the interactive page, offline, carrying its data and the code
that draws it: *(de)Cypher*). **E** exports the chart you hover or focus. A result page's *export* takes all its charts;
compare's *export* takes every card's chart and the one graph.

*Settings → export* (the Matrix's own export preferences): the default format, the size and text size, the theme (light,
dark or print), where the legend goes, the PNG resolution, several charts as one PDF of pages, a file each or one grid,
and the file name template (`{file} {project} {sequence} {column} {run} {command} {group} {date}`).
A structure exports as a PNG of the view as drawn.

## Keys

Press **?** anywhere for every key, from the one registry; *settings → keyboard* rebinds any of them (a clash is said
in words; Escape keeps the old key). The usual ones: **D** compare, **E** export, **?** this list; on a structure **F**
fit, **R** reset, **B** box, **H** hydrogens, **C** held + click to rotate around a group; in compare **L** labels and
**[ ]** to step through the one graph's lead. Keys are ignored while typing.

## Atom picking

- **Atom names as a list:** `OH1, OH2 OH3 and OH4` (commas, spaces or `and`); the rule says so in words, with its atom
  count, and a name the structure lacks shows "0 atoms".
- **Colours:** atoms keep their element colours and a group is a halo in its hue; *group hues* draws the group's atoms
  in its hue and the rest in grey.
- **Styles:** ball & stick · sticks · spheres · lines · cartoon, the same names in every 3D view; one a view can't draw
  is shown disabled, with the reason.
- **Centre of rotation:** hold **C** and click an atom to rotate around its whole group; each group card's *centre*
  does the same from the keyboard.
- **The periodic box:** the structure file's own box, with how many atoms lie outside it; **B** shows or hides it.

## The cluster view

The *cluster* tab lists your cluster jobs: `qq jobs -e` (`qq jobs -a` with *show finished*) merged by job number with
`gmx-eta -a`'s time left. Each job: its state in words and hue, CPUs, GPUs and nodes, runtime and walltime (a day reads
`1d 00:00:00`), the input folder `qq jobs -e` printed, the ETA and when it finishes in your time zone, and a warning in
words when it needs more than its walltime left.

- **A job that ended**: running at one read and gone at the next, it is *no longer running* (*finished* only when
  `qq jobs -a` says so). It offers *run <recipe> on <its input folder>* when that folder is inside the allowed ones
  (else it says why): one click opens set-up in batch mode with that folder and recipe. Nothing runs until you press
  *run*.
- **Set-up:** both tools run on this machine, as you run them: start gmx-cypher where `qq jobs` works, after `kinit`.
  If they are not on `PATH`, set their paths in *settings*.
- **How often:** once when the tab opens, then every minute while it is open and the page is visible, one read at a
  time, less often after a failure. *refresh* reads now.
- **What it never does:** kill or submit a job, or run anything but those three commands.

## Where files go

| What | Where |
|---|---|
| A job's outputs | `<trajectory folder>/<tool>/<stem>.xvg`, its other files, `<stem>.ndx`, `<stem>.run.json`, or another allowed folder you choose (not inside the vault) |
| Energy and AWH outputs | `<energy file's folder>/<tool>/` |
| Outputs of uploaded inputs | `~/.gmx-cypher/workspace/` |
| Uploads, group size checks | `~/.gmx-cypher/uploads/…`, `~/.gmx-cypher/checks/…` |
| Jobs (an event log each) | `~/.gmx-cypher/jobs/<id>.ndjson`; archived: `~/.gmx-cypher/jobs/archive/<id>.ndjson` |
| Recipes, settings | `~/.gmx-cypher/recipes/<name>.json`, `~/.gmx-cypher/config.json` |
| A sent result | `<vault>/<project folder>/_inbox/<name>` |
| Its record's copy | `<vault>/gmx-cypher/records/<sha256 of the sent file>.run.json` |
| Saved compare views | `<vault>/gmx-cypher/projects/<project id>/views/<name>.json` |

The stem comes from the file-name template (`{analysis}_{trajectory}` by default, so `rdf_nvt`), made safe with the
Matrix's `safeFileName` and free for all of a job's files with its `uniqueName`: if `rdf_nvt.xvg` (or any of its files)
exists, the job is `rdf_nvt (2)`. gmx runs with `GMX_MAXBACKUP=99`, so a file that appears under one of its names during
the job is backed up by GROMACS and named in the record.

## The vault space

`<vault>/gmx-cypher/` is gmx-cypher's own folder in your vault, at its top, outside every project folder: the Matrix
reads only project folders and `.matrix/`, so it never sees it (proved with the Matrix's own code in the tests). It
holds `space.json` (what wrote it), a `README.md`, a **record copy** for each result sent (named by the sent file's
SHA-256; every path it names, the gmx, the command's arguments and option values included, relative to its allowed
folder or `~`, and its environment's names only, since a vault may be shared or put in Git), and the **saved compare
views** of each project. A send whose copy can't be kept still lands, and says why there is no copy. Every file there is created once and never changed or
deleted; a folder of that name that isn't gmx-cypher's (no `space.json`) is refused, in words.

With a project's `_inbox/`, that is all gmx-cypher ever writes in a vault. It never writes in `.matrix/` or anywhere
else in a project folder.

After a send, the dialog says what to do in the Matrix (open the project, *Vault → Check folder now*, then *Untracked
files → attach*) and links to the project.

## The record

`<stem>.run.json` is written when the job starts (`status: "running"`) and completed when it ends, by writing a new file
and renaming it over the first, so a reader never sees half a record. It holds everything needed to know and repeat the
job (`format: "gmx-cypher run"`, `version: 3`; versions 1 and 2 are read as RDF):

- `analysis`: the command; `runner`, `gmx` (path and version), `env` (the `GMX…` variables gmx ran with);
- `command`: working directory, program and arguments, exactly as run (no shell); `stdin`: the answers gmx read;
- `started`, `ended`, `status`, `exit`, `frames`, `log`;
- `inputs`: each file's path, size, modification time, and SHA-256 (trajectories only with `"hashTrajectories": true`
  in `config.json`, because hashing many GB is slow);
- `groups`: name, role, hue, the steps that built it, its atoms as ranges (`43-3239:4`), its count and `gmx select`'s;
- `options`: every option of the form with its value, its default, and whether it is the default;
- `outputs`: each file with its size and SHA-256; `problems`: anything that went against the rules;
- what gmx printed that the result shows (energy statistics, distances, H-bond donors and acceptors, wham windows, AWH
  frames and its axis unit);
- `recipe`: what *open in set-up* fills the steps with (a new job gets new names).

A job whose record says `running` when gmx-cypher starts again is marked *interrupted*; its record is not shown as
a result elsewhere.

## Safety

gmx-cypher can:
- read files inside the allowed folders, and read your Matrix vault through a reader whose every write throws;
- start `gmx` and the GROMACS tools it knows (never through a shell), in a trajectory's folder;
- in the cluster view: start `qq jobs -e`, `qq jobs -a` and `gmx-eta -a` on this machine, with fixed arguments, one
  at a time;
- write new files: a job's outputs, under names that are free; files in its own state folder; a result you send, into
  the project's `_inbox`; and its own vault space.

It cannot, by design:
- overwrite or delete any of your files (new names are created exclusively; archive moves a job's file without copying
  or replacing anything);
- be reached from another computer, or used by another page in your browser (127.0.0.1 only; every request needs the
  token and a local Host; a request from a page must come from this very address; every POST must be JSON);
- run anything but the commands above, kill or submit a cluster job, or send free text from the page to a shell;
- reach the network beyond serving its own page.

*cancel* stops the whole process group of a job (SIGTERM, then SIGKILL after 5 s); stopping gmx-cypher cancels its
running jobs first.

## Development

```sh
npm run dev        # server and page with hot reload
npm test           # checks that matrix/ is the pinned Matrix, unchanged, then the tests (fake gmx)
npm run lint
npm run build
npm run e2e        # the browser tests (Playwright, Chromium): smoke, compare, the cluster tab
GMX=/path/to/gmx npx vitest run   # also the tests that need a real gmx
```

`test/fake-gmx.mjs` answers like GROMACS 2025.4, with its real text and outputs (`test/fixtures/README.md` says where
each came from). The decisions are in [`docs/decisions.md`](docs/decisions.md), the roadmap in
[`docs/roadmap.md`](docs/roadmap.md), and each batch's plan and report in `docs/` (batch 3:
[`docs/batch-3.md`](docs/batch-3.md), [`docs/batch-3-phase0.md`](docs/batch-3-phase0.md),
[`docs/batch-3-report.md`](docs/batch-3-report.md)).

## The Matrix (`matrix/`)

`matrix/` is a git submodule: the Matrix, [github.com/Kikoun18/the-matrix](https://github.com/Kikoun18/the-matrix), at the
commit this repository pins. gmx-cypher takes the vault format, the file parsers, the batch planner, the figure exports
and the export preferences from its code, and never changes it. `npm test` fails when `matrix/` is not at the pinned
commit or has changes (`scripts/matrix-pinned.mjs`). `matrix/` needs no `npm install` of its own.

To use a newer Matrix, on purpose:

```sh
git -C matrix fetch && git -C matrix checkout <commit>
cd runner && npm test           # the tests say whether the runner still agrees with it
git add matrix && git commit    # the commit is the decision
```

The Matrix was called PMF Sequences, and lived in this repository's `app/` folder, until October 2026. The documents in
`docs/` are the record of the work done then: they keep the old name, the `app/` paths and the numbers (T…, R…) of their
time. What the Matrix *stores* keeps its old name too (a vault's manifest says `"app": "pmf-sequences"`).
