# gmx-cypher

A local tool that runs GROMACS analyses on your trajectories and energy files: `gmx rdf`, `distance`,
`hbond`, `rms`, `rmsf`, `gyrate`, `mindist`, `energy`, `awh` and `wham`. You pick atom groups in 3D or by
rule, see the exact command before it runs, get every output with a run record, and hand results to
**PMF Sequences** through its vault, where they land in the right row, column and run. A *cluster* tab
shows your cluster jobs (`qq jobs` with `gmx-eta -a`).

It runs on your machine (or the machine that has the trajectories), serves its page on 127.0.0.1 only,
and never deletes or overwrites a file.

## Start

You need Node.js 22.18 or newer, and GROMACS (`gmx_mpi` or `gmx`).

```sh
cd runner
npm install
npm start                       # builds the page, then starts the server
```

It prints an address with a one-time token. Open it in Chrome:

```
gmx-cypher 0.1.0 is running. Open:

  http://127.0.0.1:8765/?token=…

gmx: /software/gromacs/2025.4/bin/gmx_mpi · 2025.4
```

The token goes into a cookie and leaves the address bar; a new start prints a new token.

**Finding `gmx`.** gmx-cypher uses the `gmx` set in *settings*, or else the first of `gmx_mpi` and `gmx`
on your `PATH` that answers `--version`. If GROMACS comes from a module, load it first, in the shell you
start gmx-cypher from, so it inherits the paths and libraries:

```sh
module add gromacs/2025.4-cuda
npm start
```

**Options.** `--port 8765` (another port), `--gmx <name or path>` (saved in settings), `--allow <folder>`
(a folder the file browser may show; repeat it for several), `--dev` (development mode with hot reload).
`GMX_CYPHER_HOME` moves the state folder (default `~/.gmx-cypher`).

**On another machine** (a workstation that has the trajectories): start it there and open it through an
SSH tunnel; it says so when it starts:

```sh
ssh -L 8765:127.0.0.1:8765 workstation      # then open the same address here
```

## A first RDF, step by step

1. **Settings.** Check that `gmx` reads *✓ ready*. Add the folders with your simulations under *allowed
   folders*; the file browser shows only those. To send results to PMF Sequences, set your *vault folder*
   (and, optionally, the address where you open PMF Sequences).
2. **inputs.** Browse to a run and click its trajectory (`.xtc`, `.trr`, `.tng`). The run input (`.tpr`),
   structure (`.gro` or `.pdb`) and an index (`.ndx`), if any, are suggested from the same folder, each
   with its reason; change any with *pick*. Small GROMACS inputs can also be uploaded. gmx-cypher then checks that
   the structure, the run input (`gmx dump`) and the trajectory (`gmx check`) have the same number of
   atoms, and that an index fits. *use these inputs* opens groups.
3. **groups.** One reference and one or more selections, each with a name (the curve's label in PMF
   Sequences; one word) and a hue (see *Atom picking* below; other commands name their groups otherwise,
   and some take one group only):
   - *click* an atom in 3D to add or remove it, *shift*-click for its residue, *alt*-click for that atom
     name in every residue of its name, into the group marked *picking*;
   - *+ rule*: residue name, residue numbers, atom names (a list, in every residue of a name), element, or
     a group of your index file;
   - or type atom numbers (`43-3239:4, 5`).

   For rdf, shared atoms between the reference and a selection are flagged, with `-excl` or removing them
   offered. *check sizes with gmx* counts every group with `gmx select` against the run input.
4. **analysis.** Pick the command (rdf here; the others are under *Commands* below). Every option the
   form offers, from your `gmx rdf -h`, its default, and what it changes. Changed options show
   *changed · default …* (click it to reset). Options gmx would refuse are named before you run. The
   command on the right is exactly what will run, in the trajectory's folder.
5. **run.** gmx-cypher checks that the structure has the run input's atom count (the groups are numbered
   from it), confirms each group's size with `gmx select`, writes the index, and starts gmx.
   *jobs* shows the frames read against the estimate, the live log, and *cancel* (click twice). A run
   keeps going if you close the page.
6. **result.** g(r) per selection in its group's hue (click a name: shown → dimmed → hidden), the first
   peak and frames, the options that change g(r), and the cumulative number if you asked for it.
7. **send to vault…** (needs a vault in settings). Choose the project; the dialog fills sequence, column,
   group and run as the project's folder pattern reads them from the run's folder, names the file by the
   project's file pattern, and shows where PMF Sequences itself will put it (its own `planBatch` on this
   file), including which curves it will import. *send to vault* copies the g(r) file into
   `<project folder>/_inbox/`.
8. **In PMF Sequences:** open the project, *Vault → Check folder now* (or reload the page), then
   *Vault → Untracked files → attach*. Its upload dialog shows the same landing.

**Recipes** (in the analysis tab, for commands with groups): save the options, groups, file name and folder under a name, load them again for
another trajectory of the same system, export or import them as JSON. Saving under a name that is taken
asks first (*click again to replace*).

**Batches** (batch tab): one recipe of a command with groups over every trajectory a path template finds under a root, for
example `hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc`. *preview* lists every match, its
fields, the inputs beside it, each group's atom count there, and any problem (no run input, a structure
whose atom count isn't the run input's, a file-name token the path doesn't give); nothing runs until you
press *run*. Linked folders inside the allowed ones are followed; a place it could not look into (an
unreadable folder, a link out of the allowed folders or to nothing) is named above the list. The queue runs a few at a time (2 by default), each as an ordinary run with its own record;
runs that share an output folder each take the next free name. *cancel all* stops them; *send all to
vault* sends each by the same rule as a single send.

## Commands

Each command runs from one definition: the inputs it needs, the options it offers (each with its default
from your `gmx <tool> -h` and a note on what it changes), its file names, what gmx would refuse (said
before anything runs), and which file goes to the vault, typed as PMF Sequences types it (checked with
PMF Sequences' own `detectAna` on real GROMACS output). Where GROMACS 2024 replaced a tool (`hbond`,
`gyrate`), the picker greys out the one your gmx doesn't have, with the reason. Times are in ps and files
keep xmgrace's `@` lines (gmx's defaults; no form offers others): PMF Sequences reads both.

**Trajectory and groups** (a trajectory, a run input, a structure for the groups):

- **`gmx rdf`**: g(r) of each selection around the reference. Options that change the numbers: `-bin`,
  `-rmax`, `-norm`, `-selrpos`/`-seltype`, `-excl`, `-cut`, `-xy`, `-surf`, `-b`/`-e`/`-dt`. Vault: g(r),
  typed RDF; the cumulative number (`-cn`) stays here (PMF Sequences would read its title as another RDF).
- **`gmx distance`**: from the reference to each selection over time, between centres of mass or of
  geometry, or atom by atom (*pairs*: as many atoms in each; unequal sizes are refused, gmx would pair
  them silently). Vault: the averages (`-oav`), typed Distance (PMF Sequences reads the first curve).
  Every distance, x/y/z and the histogram when asked; the histogram stays here.
- **`gmx hbond`** (GROMACS 2024 and later): H-bonds between the reference and one target, by its own
  criteria (`-hbr`, `-hba`, `-cutoff` ≥ 0.35 nm and ≥ `-hbr`, donor and acceptor elements). Reference and
  target must be the same atoms or share none. Vault: the count over time, typed H-bonds; the distance and
  angle distributions (densities) and the donor and acceptor counts stay here. The donors and acceptors
  gmx found are in the record and the result.
- **`gmx hbond-legacy`**: the old tool, offered only where `gmx hbond` is the old one (GROMACS before
  2024, where it runs as `gmx hbond`): its own criteria (`-r`, `-a`, `-da`, `-merge`), never mixed with
  the new ones; the groups are answered on stdin. The angle distribution needs merging off.
- **`gmx rms`**: the RMSD over time of the fit group (fitted onto the run input's structure) and of any
  further groups after the same fit (`-fit`, `-mw`, `-prev`). Vault: typed RMSD (the first curve, the fit
  group's).
- **`gmx rmsf`**: one group's fluctuation per atom, or per residue (`-res`), fitted unless `-nofit`. Vault:
  typed RMSF; its x is the atom's number in the system, which PMF Sequences labels "Residue".
- **`gmx gyrate`** (2024 and later; `gyrate-legacy` where it is missing): one group's radius of gyration
  over time, total and about x, y and z, weighted by mass (or charge, or geometry). The two tools agree on
  one molecule and not on a group of several, so they are never mixed. Vault: typed Rg (the total).
- **`gmx mindist`**: the minimum distance from the reference to each group over time; the contacts within
  `-d` when asked (a second file, which PMF Sequences gives no type: it stays here). Vault: typed Distance.

**An energy file:**

- **`gmx energy`**: pick terms from the file's own menu (sent by number); `-b` cuts the first ps as
  equilibration. The result shows each term's average, error estimate, RMSD and drift, as gmx prints
  them, and flags a drift larger than its error estimate. The run input is optional. Vault: typed Energy,
  from its file name (which must contain "energy"; the default does). Outputs go to `energy/` beside the
  energy file.
- **`gmx awh`**: the PMF of each stored frame, from the energy file and its run input. Choose the last
  frame (the default), every N-th, or all; the page says how many files each choice writes. Files are
  `<stem>_t<time>.xvg` (PMF Sequences' own name pattern); the last frame goes to the vault, typed PMF, in
  kJ/mol.

**Window lists:**

- **`gmx wham`**: umbrella windows found with a folder template (`*/umbrella.tpr`, each with its pull file
  beside it); leave any out. gmx-cypher writes the two lists gmx wham reads beside the outputs, reads the
  temperature from the run inputs (gmx wham would assume 298 K), and shows `-b` as each window's
  equilibration. The result shows the profile with its bootstrap band, the histograms, and the overlap of
  each pair of neighbouring windows, gaps named. Vault: the histograms, typed Histogram; the profile stays
  here (PMF Sequences would type it Histogram too, or as a PMF give it the AWH correction).

## Atom picking

- **Atom names as a list:** `OH1, OH2 OH3 and OH4` (commas, spaces or `and`) means atoms named OH1, OH2,
  OH3 or OH4; the rule says so in words, with its atom count, and a name the structure lacks shows
  "0 atoms". The menu beside the field lists the names in the chosen residue name, with counts.
- **Shift+Enter** in the name field adds the rule and keeps the form open for the next one, in the same
  group and the same residue name (OH1, then OH2 in every SUG), the field focused. **Enter** adds the rule
  and closes it. A new group is *+ group*.
- **alt-click** (option-click on macOS) toggles that atom name in every residue of its name; the hint
  under the 3D view says so, and the group shows its new atom count. Every rule can also be typed, so all of this
  works from the keyboard.
- **Colours:** by default atoms keep their element colours and a group is a translucent halo in its hue
  round its atoms, so clicking and selecting never repaints them. *group hues* draws the group's atoms in
  its hue and the rest in grey, as before; the choice is remembered.
- **Centre of rotation:** hold **C** and click an atom to rotate the view around its whole group (the group
  being picked if it holds the atom, else the first that does, the reference first); an atom in no group
  is the centre itself. The middle of the group's extent becomes the pivot, the caption says what the view
  rotates around, and *reset* goes back to the middle of the structure. Each group card has a *centre*
  button for the same, from the keyboard. C typed in a field is only a letter.

## The periodic box

The 3D view draws the structure file's own box: a `.gro`'s last line (rectangular or triclinic) or a
`.pdb`'s `CRYST1`, with its lengths, angles and volume, and how many atoms lie outside it. *box* (or **B**
while the view has focus) shows or hides it. A file without a usable box says why instead; a placeholder
box is drawn as recorded, with its atoms outside said in words.

## The cluster view

The *cluster* tab lists your cluster jobs: `qq jobs` (`qq jobs -a` with *show finished*) merged by job
number with `gmx-eta -a`'s time left. Each job: state in words and hue (queued purple, running blue,
finished green), CPUs, GPUs and nodes, runtime and walltime, the ETA and when it finishes in your time
zone, a warning in words when it needs more than its walltime left, and "—" with the reason when there is
no ETA.

- **Set-up:** both run on this machine, as you run them, so start gmx-cypher where `qq jobs` works, after
  `kinit`. If they are not on `PATH`, set their paths in *settings*.
- **How often:** once when the tab opens, then every minute while it is open and the page is visible,
  one read at a time, less often after a failure. *refresh* reads now.
- **What it never does:** kill or submit a job, or run anything but those three commands. An expired
  ticket, a missing tool or a slow cluster is said in words; the other tool's column still fills.

## Where files go

| What | Where |
|---|---|
| A run's outputs | `<trajectory folder>/<tool>/<stem>.xvg`, its other files (`<stem>_cn.xvg`, `<stem>_t<time>.xvg`, …), `<stem>.ndx`, `<stem>.run.json`, or another allowed folder you choose (not inside the vault) |
| Energy and AWH outputs | `<energy file's folder>/<tool>/` |
| gmx wham's window lists | beside its outputs: `<stem>_tpr-files.dat`, `<stem>_pull-files.dat` |
| Outputs of uploaded inputs | `~/.gmx-cypher/workspace/` |
| Uploads | `~/.gmx-cypher/uploads/<time>-<id>/<name>` |
| Group size checks | `~/.gmx-cypher/checks/<time>-<id>/` (`groups.ndx`, `sizes.xvg`) |
| Jobs (an event log each) | `~/.gmx-cypher/jobs/<id>.ndjson` |
| Recipes | `~/.gmx-cypher/recipes/<name>.json` |
| Settings | `~/.gmx-cypher/config.json` |
| A sent result | `<vault>/<project folder>/_inbox/<name>` |

The stem comes from the file-name template (`{analysis}_{trajectory}` by default, so `rdf_nvt`). It is
made safe with PMF Sequences' `safeFileName` and free for all of a run's files with its `uniqueName`: if
`rdf_nvt.xvg` (or any of its files, in any case) exists, the run is `rdf_nvt (2)`. The names are checked
again just before gmx starts, and the stem is claimed by creating its `.ndx` (or, for a command without
groups, its record). gmx runs with
`GMX_MAXBACKUP=99` (shown in the command), so a file that appears under one of its names during the run
is backed up by GROMACS and named in the record, even where your shell sets `GMX_MAXBACKUP=-1`.

## The run record

`<stem>.run.json`, written when the run ends, is everything needed to know and repeat the run
(`format: "gmx-cypher run"`, `version: 3`; versions 1 and 2, written before, are read as RDF):

- `analysis`: the command (`rdf`, `hbond-legacy`, …); `command.args` names the gmx tool it ran as;

- `runner`, `gmx` (path and version), `env` (the `GMX…` environment variables gmx ran with);
- `command`: working directory, program and arguments, exactly as run (no shell);
- `started`, `ended`, `status`, `exit`, `frames` (analysed, last time), `log` (stdout and stderr);
- `inputs`: each file's path, size and modification time, and SHA-256 (trajectories only when
  `"hashTrajectories": true` is set in `config.json`, because hashing many GB is slow);
- `groups`: name, role, hue, the steps that built it, its atoms as ranges (`43-3239:4`), the count, and
  `gmx select`'s count;
- `options`: every option of the form with its value, its default, and whether it is the default;
- `outputs`: each file with its size and SHA-256; `problems`: anything that went against the rules (a
  GROMACS backup of one of its names);
- `stdin`: the answers gmx read (energy terms; the groups of the tools that ask for them);
- what gmx printed that the result shows: `statistics` (energy), `distances` (distance), `summary`
  (H-bonds' donors and acceptors), `windows` (wham, each file hashed), `frames` (awh: the frames written);
- `recipe`: the options, groups, template and folder, for *run again* (jobs → *run again* opens it in its
  command; the new run gets new names).

Recipes are version 3 too, and name their command; an atom-name list is a rule of its own (`names`), and
a version 1 recipe selects exactly the atoms it did.

## Templates and tokens

- **Output names** (analysis → *file name*): `{analysis}` (the command, `rdf`) and `{trajectory}` (its
  name without the extension; for energy and awh, the energy file's). In a batch, also PMF Sequences' fields as its path template reads them: `{method}`
  `{column}` `{name}` `{seq}` `{time}` `{run}` `{temp}` (the preview names a token the path doesn't give).
- **Sending** fills the *project's own* file pattern with the fields (`{*}` becomes `rdf`), so PMF
  Sequences reads the name back. RDF files are kept apart from PMF files by folder, not by name.
- **Batch path templates** use PMF Sequences' folder-pattern rules, by its own `parsePath`: tokens never
  cross `/`, `**` is any number of folders, `{*}` is one folder that is ignored, and the template matches
  the end of the path below the root.

## Safety

gmx-cypher can:
- read files inside the allowed folders, and read your PMF Sequences vault;
- start `gmx` and the GROMACS tools it knows (never through a shell), in a trajectory's folder;
- in the cluster view: start `qq jobs` (`qq jobs -a` with *show finished*) and `gmx-eta -a`, on this machine. The
  programs are `qq` and `gmx-eta` from your `PATH`, or the absolute paths set in *settings*; their arguments are
  fixed in the code, one runs at a time, and nothing typed in the page reaches them;
- write new files: a run's outputs, under names that are free; files in its own state folder; and a result you
  send, into the project's `_inbox` folder.

It cannot, by design:
- overwrite or delete any of your files (new names are created exclusively; the vault reader's every write throws);
- be reached from another computer, or used by another page in your browser (it listens on 127.0.0.1 only; every
  request needs the token and a local Host; a request from a page must come from this very address, so not from
  another port of 127.0.0.1 either; and every POST must be JSON);
- run anything but the commands above, kill or submit a cluster job, or send free text from the page to a shell;
- reach the network beyond serving its own page (`qq` and `gmx-eta` reach the cluster themselves, as they do from
  your shell).

*cancel* stops the whole process group of a run (SIGTERM, then SIGKILL after 5 s); stopping gmx-cypher
cancels its running jobs first.

## Development

```sh
npm run dev        # server and page with hot reload
npm test           # checks app/ is as agreed (T144), then the tests (fake gmx)
npm run lint
npm run build
npm run e2e        # the browser smoke test (Playwright, Chromium)
GMX=/path/to/gmx npx vitest run   # also the tests that need a real gmx
```

`test/fake-gmx.mjs` answers like GROMACS 2025.4, with its real text. The design decisions are in
[`docs/decisions.md`](docs/decisions.md), the plan in [`docs/phase0.md`](docs/phase0.md), and the
report in [`docs/report.md`](docs/report.md).
