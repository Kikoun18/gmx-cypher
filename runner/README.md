# gmx-cypher

A local tool that runs GROMACS analyses on your trajectories, starting with the radial distribution
function (`gmx rdf`). You pick atom groups in 3D or by rule, see the exact command before it runs, get
every output with a run record, and hand results to **PMF Sequences** through its vault, where they land
in the right row, column and run.

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
   Sequences; one word) and a hue:
   - *click* an atom in 3D to add or remove it, *shift*-click for its residue, *alt*-click for that atom
     name in every residue of its name, into the group marked *picking*;
   - *+ rule*: residue name, residue numbers, atom name (in every residue of a name), element, or a group
     of your index file;
   - or type atom numbers (`43-3239:4, 5`).

   Shared atoms between the reference and a selection are flagged, with `-excl` or removing them offered.
   *check sizes with gmx* counts every group with `gmx select` against the run input.
4. **rdf.** Every option of your `gmx rdf -h`, its default, and what it changes. Changed options show
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

**Recipes** (in rdf): save the options, groups, file name and folder under a name, load them again for
another trajectory of the same system, export or import them as JSON. Saving under a name that is taken
asks first (*click again to replace*).

**Batches** (batch tab): one recipe over every trajectory a path template finds under a root, for
example `hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc`. *preview* lists every match, its
fields, the inputs beside it, each group's atom count there, and any problem (no run input, a structure
whose atom count isn't the run input's, a file-name token the path doesn't give); nothing runs until you
press *run*. Linked folders inside the allowed ones are followed; a place it could not look into (an
unreadable folder, a link out of the allowed folders or to nothing) is named above the list. The queue runs a few at a time (2 by default), each as an ordinary run with its own record;
runs that share an output folder each take the next free name. *cancel all* stops them; *send all to
vault* sends each by the same rule as a single send.

## Where files go

| What | Where |
|---|---|
| A run's outputs | `<trajectory folder>/rdf/<stem>.xvg`, `<stem>_cn.xvg`, `<stem>.ndx`, `<stem>.run.json`, or another allowed folder you choose (not inside the vault) |
| Outputs of uploaded inputs | `~/.gmx-cypher/workspace/` |
| Uploads | `~/.gmx-cypher/uploads/<time>-<id>/<name>` |
| Group size checks | `~/.gmx-cypher/checks/<time>-<id>/` (`groups.ndx`, `sizes.xvg`) |
| Jobs (an event log each) | `~/.gmx-cypher/jobs/<id>.ndjson` |
| Recipes | `~/.gmx-cypher/recipes/<name>.json` |
| Settings | `~/.gmx-cypher/config.json` |
| A sent result | `<vault>/<project folder>/_inbox/<name>` |

The stem comes from the file-name template (`{analysis}_{trajectory}` by default, so `rdf_nvt`). It is
made safe with PMF Sequences' `safeFileName` and free for all four files with its `uniqueName`: if
`rdf_nvt.xvg` (or any of the four, in any case) exists, the run is `rdf_nvt (2)`. The names are checked
again just before gmx starts, and the stem is claimed by creating its `.ndx`. gmx runs with
`GMX_MAXBACKUP=99` (shown in the command), so a file that appears under one of its names during the run
is backed up by GROMACS and named in the record, even where your shell sets `GMX_MAXBACKUP=-1`.

## The run record

`<stem>.run.json`, written when the run ends, is everything needed to know and repeat the run
(`format: "gmx-cypher run"`, `version: 1`):

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
- `recipe`: the options, groups, template and folder, for *run again* (jobs → *run again* opens it in rdf;
  the new run gets new names).

## Templates and tokens

- **Output names** (rdf → *file name*): `{analysis}` (`rdf`) and `{trajectory}` (its name without the
  extension). In a batch, also PMF Sequences' fields as its path template reads them: `{method}`
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
  commands and their options are fixed in the code, one runs at a time, and nothing you type reaches them;
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
npm test           # checks app/ is unchanged, then the tests (fake gmx)
npm run lint
npm run build
npm run e2e        # the browser smoke test (Playwright, Chromium)
GMX=/path/to/gmx npx vitest run   # also the tests that need a real gmx
```

`test/fake-gmx.mjs` answers like GROMACS 2025.4, with its real text. The design decisions are in
[`docs/decisions.md`](docs/decisions.md), the plan in [`docs/phase0.md`](docs/phase0.md), and the
report in [`docs/report.md`](docs/report.md).
