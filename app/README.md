# PMF Sequences

The PMF Sequences page from the Claude Design handoff (`../project/PMF Sequences.dc.html`),
built as a Vite + React + TypeScript app. Your data lives in a **vault**: an ordinary folder
you choose. Uploaded files are kept there byte for byte, notes as Markdown, and everything
else as small JSON records. You can open the folder without the app, copy it to another
computer, back it up or put it in Git.

```sh
npm install
npm run dev              # http://localhost:5173
npm run build            # static site in dist/ (relative paths, host anywhere)
npm test                 # Vitest: storage, vault behaviour, exchange, migration
npm run lint
npm run migrate:fixture  # headless legacy migration of the test fixture into .vault-out/
```

## Browser requirements

- **Chromium on desktop: Chrome or Edge, version 122 or newer recommended.** The app reads
  and writes the vault through the File System Access API (`showDirectoryPicker`,
  `createWritable`). It only works on `https://` or `http://localhost`.
- From Chrome 122, the browser can remember the folder permission, and the last vault reopens
  without asking. Otherwise the start screen shows **reconnect**, and one click
  (`requestPermission`) grants access again.
- **Other browsers** (Firefox, Safari, mobile) get a screen explaining this. They can open a
  dataset JSON export in a clearly labelled viewer that saves nothing. Nothing ever falls back
  to `localStorage`, IndexedDB or OPFS for project data.
- **What the browser does keep** (session conveniences, never project data):
  - IndexedDB `pmf-vault-handles`: the folder handles of recent vaults, plus the last project
    opened in each.
  - localStorage `pmf-ui-prefs-v1`: theme and laser-pointer preferences (`dark`, `laserKey`,
    `laserMode`, `laserColor`, `laserSize`, `laserTrail`, `compareKey`).
- **One tab writes at a time.** A Web Lock (`pmf-vault:<vaultId>`) is held for the session. A
  second tab opens the same vault read-only, with a banner.

## The vault format

A vault holds one or more projects. Each project is a visible folder. Everything the app
needs for itself is in one hidden folder, `.matrix/`. This listing is the fixture after
`npm run migrate:fixture`, with one run deleted:

```text
vault/
├── .matrix/                              ← application data (read it, but let the app write it)
│   ├── manifest.json                     ← identity: app, format, schema version, vaultId, created/modified, migration provenance
│   ├── .gitignore                        ← "cache/" (the only .gitignore the app ever writes)
│   ├── records/
│   │   ├── workspace.json                ← project order
│   │   └── <projectId>/
│   │       ├── project.json              ← name, description, folder, column/page/row order, kept imports
│   │       ├── columns/<key>.json        ← one per column: label, names, colours, folder
│   │       ├── pages/<pageId>.json       ← one per page: name, description, rows, columns
│   │       └── rows/<rowId>.json         ← one per sequence: runs, analyses + curves, structures,
│   │                                       file metadata, literature, visibility, folders, note IDs
│   ├── settings/<projectId>/
│   │   ├── settings.json                 ← file-name and folder patterns, data columns, axis labels, temperature, …
│   │   ├── analyses.json                 ← analysis definitions (only once the project has its own list)
│   │   ├── tags.json                     ← run tags, key + label, in order (once the project has its own list)
│   │   └── ignored.json                  ← untracked files the user chose to ignore
│   ├── journal/                          ← multi-step operations in progress; empty when idle
│   ├── trash/<stamp>--<type>--<id>/      ← deleted things, restorable: trash-manifest.json + content/<original path>
│   └── cache/                            ← derived only; delete it any time
│       ├── index.json                    ← scan of each project's folders (rebuilt when stale)
│       ├── <projectId>/pmf.json          ← parsed PMF series, keyed by file SHA-256 + parser + columns
│       ├── parsed/<sha256>.xvg-table-1.json   ← parsed analysis tables
│       └── parsed/<sha256>.gmx-header-1.json  ← GROMACS header of an original (provenance)
│
├── sugar-pmfs--pmf2k81000/               ← a project: <name-slug>--<projectId>
│   ├── _sequences/
│   │   └── wrwycr--smf2k81q0a/           ← a sequence (row): its note and structures
│   │       ├── note.md
│   │       ├── test.pdb                  ← original upload, byte-identical
│   │       └── WTA.gro
│   ├── ha--ha/                           ← a column: <label-slug>--<key>
│   │   └── wrwycr--smf2k81q0a/           ← a cell (sequence × column): run files and the cell note
│   │       ├── hmrfast6_ha_a_t200000.xvg
│   │       ├── note.md
│   │       └── rdf-run-1--xmf2k81q4e/    ← an analysis: <type>-run-<n>--<analysisId>, its curve files
│   │           └── rdf_ha_a.xvg
│   ├── _imports/                         ← dataset JSON files that were imported (kept as uploaded)
│   └── _restored/                        ← trash items that couldn't go back to their place
└── ion-pairs-2027--pmf3a00000/ …
```

**Pages** are views (lists of rows and columns), so they exist only as records. Folders and
notes exist only when they have content.

### Names, IDs and paths

- Every entity has a stable ID: project `p…`, row `s…`, run `r…`, analysis `x…`, curve `c…`,
  structure `st…`, reference `l…`, page `pg…`, column key, file `f…`, note `n…`, vault `v…`.
  The prototype's IDs are kept.
- Visible folders are `<slug>--<id>`.
  - The slug is the NFC-normalised, lower-cased name. Illegal characters and runs of
    separators become `-`. Windows reserved names get a `_` prefix. An empty slug becomes
    `untitled`. Slugs are at most 20 characters.
  - The loader finds folders by the `--<id>` suffix, so a stale slug does no harm. A folder
    moved by hand is relinked by its ID.
- Uploaded files keep their original name, made safe in the same way and capped at 64
  characters (the extension is kept). A collision gets a ` (2)` suffix; nothing is overwritten.
- All of this is centralised in `src/lib/storage/path.ts`.

### Original files

Every upload (PMF and analysis `.xvg`, `.pdb`, `.gro`, imported JSON) is written from the
`File`/`Blob` itself, with no string round trip. Its record keeps:
- the original name and the stored path;
- size and SHA-256;
- the upload time and MIME type;
- the owner, and an origin: `upload`, `migrated-from-indexeddb` or `reconstructed`.

Replacing or deleting something moves its originals to the trash. Parsed numbers are cache:
they are recomputed from the originals whenever the cache is missing or stale.

### Records, notes, settings

- **Records** are JSON with sorted keys, 2-space indentation and a trailing newline. They are
  rewritten only when their content changes, and one edit touches only the files it concerns.
- **Notes** are `note.md` files with minimal frontmatter, and no timestamps:

  ```markdown
  ---
  id: nmusf8160by22o
  type: cell-note
  owner: smf2k81q0a
  column: ha
  ---
  Run b looks shifted — temperature?
  ```

  Notes with missing or broken frontmatter are read by their location, and repaired on the
  next save.
- **Project settings** are everything that changes how data is parsed, shown or computed.
  Theme and laser-pointer settings are browser preferences. `settings.json` holds `parse`,
  `pattern` (file names), `pathPattern` (folders; empty = off), `xCol`, `yCol`, `xLabel`,
  `yLabel`, `temp`, `rowAll` and `hiddenOut`. The analysis list and the tag list
  (`{ "tags": [{ "k": "hmr", "label": "hmr" }, …] }`) have their own files; without them the
  built-in defaults apply.
- **Runs** store their tags as a sorted list of keys (`"tags": ["add", "hmr"]`). Renaming a tag
  changes only `tags.json`; a key that isn't in the list (for example from an import) is kept
  and shown in italics.

### Format versions

The schema version is in `manifest.json`. Version 2 replaced each run's `methods`
(`{ "hmr": true, "add": false }`) with `tags` (`["hmr"]`) and added `tags.json`, seeded with the
four former methods so nothing looks different. A version-1 vault is upgraded when it is
opened: the step lists the files it changes, those are copied to a `schema-backup` trash item,
and the new files and the manifest are written together through the journal, so a tab closed
halfway leaves either the old vault or the upgraded one. A vault from a newer version opens
read-only.

Version 3 (feature batch 2) lets an analysis curve record carry `vis` (`"dim"` or `"off"`;
absent = shown) and `shade` (whole steps −3…3 lighter or darker than its default; absent = 0):

```json
{ "id": "cmux…", "label": "second sugar", "custom": true, "vis": "dim", "shade": -1, "file": "fmux…", "parse": { "xCol": 1, "yCol": 2, "xScale": 1 } }
```

The 2 → 3 step changes no file; only the version moves, so an older app (which would drop the
new fields when it saves) opens the vault read-only. An analysis definition in
`analyses.json` may also carry `marker` (`"max"`, `"min"` or `"none"`) and `markerLabel`
(`"none"`, `"x"` or `"y"`); without them the defaults apply. These are additive and needed no
version change. Black and white is a browser preference, not stored in the vault.

**Derived data:** the parsed PMF series, analysis tables and GROMACS headers (version, tool,
command line, working directory, creation date, executable) are cached in `.matrix/cache/`,
keyed by the original's SHA-256 and a parser version, and re-read from the original when the
cache is gone.

### Trash

Deleting moves files into `.matrix/trash/<UTC stamp>--<type>--<id>/content/<original path>`.
The item's `trash-manifest.json` holds:
- the original paths;
- the records as they were;
- the parent IDs and position;
- the deletion time and schema version.

Records-only things (pages, references, notes) are trashed too. **Restore** puts everything
back. If the place is taken or the parent is gone, it uses `<project>/_restored/<item>/` and
says so; the files then appear as untracked, ready to attach. Deleting one item for good, or
emptying the trash, needs a second click.

## Authority rules

| Data | Authority |
| --- | --- |
| Note text | the `note.md` file |
| Content of an uploaded file | the file in the visible tree |
| Existence, names, order, relationships, parameters, file metadata | `.matrix/records/` |
| Vault identity and format version | `.matrix/manifest.json` |
| Project settings | `.matrix/settings/` |
| Anything in `.matrix/cache/` | nothing — derived, rebuilt when missing, stale or corrupt |

On load (manifest → records → settings → index → matrix; notes in the background;
analyses and structures on demand):

- **A record points at a missing file.** The entity shows as *missing*, and missing PMF runs
  are left out of cell values. The record is never deleted.
  - A missing file reappearing anywhere in the project, with the same name (and the same size
    and SHA-256 when known), is relinked.
- **A file has no record.** It is listed under **Vault → Untracked files**, where you can
  *attach* it (it is moved, not copied) or *ignore* it.
- **Two folders carry the same ID.** This is reported as a conflict, and saving pauses until
  one is removed. The app doesn't guess.
- **An older vault** is upgraded by explicit schema steps, after a backup of the files each step
  changes to the trash (see *Format versions*). **A newer vault** opens read-only, with the
  reason shown.

## Write ordering

All writes go through one serialized queue per project. The UI keeps its pure
`Store → Store` edits. The project service diffs the last saved state against the next one
and turns the difference into one journaled operation:

1. **Journal entry**: `.matrix/journal/<opId>.json` lists the content to create, the folder
   moves and the record writes (phase `content`).
2. **Content**: new original files, folder renames and moves (each file moved, or copied and
   verified by SHA-256 before the source is deleted), and note files.
3. **Commit point**: the entry flips to `committed`, carrying the full text of every record
   to write. The records are then written.
4. **After**: removed things move to the trash, and emptied folders are removed. Then the
   journal entry is deleted, and the cache and index are refreshed.

If an entry is left behind when the vault opens: before the commit point, its content is
rolled back; after it, the operation is completed.

Single files are written with `createWritable()`. The browser commits them on `close()`, and
a failed write is aborted, so the previous version stays intact.

Note edits are debounced (750 ms). Pending writes are flushed when the tab is hidden, and
closing the tab with unsaved writes warns first.

### Outside edits and failures

- **Outside edits.** The app remembers size, modification time and SHA-256 for every text file
  it reads. Before overwriting one, it checks again.
  - A note changed outside, with no local edit, is simply reloaded. This also happens on window
    focus.
  - With a local edit, the local version is written as `note.conflict-<stamp>.md` next to it,
    and the version on disk is shown.
  - A record changed outside stops saving. This tab's version is kept as
    `<id>.conflict-<stamp>.json` next to it, and **Reload from disk** continues from what is
    on disk.
- **Permission loss or a failed write** leaves the change in memory. A banner offers
  **Reconnect**, **Retry** and **Reload from disk**; nothing is silently dropped.

## Migration from the prototype

The prototype kept data in this browser:
- localStorage `pmf-seq-store-v1`, `pmf-seq-settings-v1`, `pmf-seq-projects-v1` and
  `pmf-seq-project-*`;
- IndexedDB `pmf-seq-structures`.

When the start screen finds that data, it offers **Migrate into a vault…**. It needs an empty
folder, or an existing vault after you confirm.

- Each project keeps its IDs.
- Structure text from IndexedDB becomes files (`migrated-from-indexeddb`).
- Runs and analyses, which the prototype kept only as parsed numbers, get reconstructed files.
  Each is named `*.reconstructed.xvg`, carries a header saying it is not the original, and has
  `origin: "reconstructed"`.
- The vault is then reopened from disk and compared field by field with the old data. Only a
  clean comparison counts as verified.
- The report lists counts, reconstructed files and warnings. The old browser copy is never
  changed; **Remove the old browser copy…** appears only after a verified migration.

Data kept under another address (e.g. the prototype served from `localhost:8000`) can be
exported as a *legacy dump* by running this in that tab's console. Then use **Migrate from a
legacy dump file…** on the start screen:

```js
(async () => {
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('pmf-seq-')) ls[k] = localStorage.getItem(k); }
  const files = await new Promise(res => {
    const r = indexedDB.open('pmf-seq-structures');
    r.onupgradeneeded = () => r.transaction.abort();
    r.onerror = () => res({});
    r.onsuccess = () => {
      const db = r.result, out = {};
      if (!db.objectStoreNames.contains('files')) { db.close(); return res(out); }
      const t = db.transaction('files');
      t.objectStore('files').openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } };
      t.oncomplete = () => { db.close(); res(out); };
    };
  });
  const dump = { format: 'pmf-legacy-dump', version: 1, origin: location.origin, dumped: new Date().toISOString(), localStorage: ls, indexedDB: { 'pmf-seq-structures': { files } } };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
  a.download = 'pmf-legacy-dump.json'; a.click();
})();
```

The same migration runs headlessly on the Node backend:

```sh
npx vite-node scripts/migrate-legacy.ts -- pmf-legacy-dump.json path/to/empty-folder
```

The exit code is 1 if verification fails.

**Dataset JSON** export/import still works. Export (v6) embeds every original as base64 and
reflects the vault's current state, including run tags, the project's tag list and each
curve's visibility and shade. Import writes into the open vault, keeping IDs where they don't
collide, and keeps the imported file in `_imports/`. Older v5, v4 and v3 exports import too;
their run `methods` become tags.

## Code layout

| Path | What |
| --- | --- |
| `src/lib/storage/backend/` | `StorageBackend` interface; File System Access and in-memory implementations |
| `src/lib/storage/path.ts` | every name → path rule (slugs, safe file names, collisions, layout) |
| `src/lib/storage/records.ts`, `json.ts`, `notes.ts`, `settings.ts`, `manifest.ts` | the durable formats |
| `src/lib/storage/io.ts` | reads and writes with outside-change tracking (size, mtime, SHA-256) |
| `src/lib/storage/journal.ts`, `trash.ts`, `cache.ts`, `index.ts` | journaled operations, trash, derived data, folder scan |
| `src/lib/storage/plan.ts` | turns "previous state → next Store" into one journaled operation |
| `src/lib/storage/project.ts` | `ProjectService`: load, commit/flush/retry, outside edits, analyses on demand, untracked/missing, trash, restore |
| `src/lib/storage/vault.ts` | `Vault`: create/open, compatibility and upgrades, locking, projects |
| `src/lib/storage/exchange.ts`, `ids.ts` | dataset JSON v6 export / v3–v6 import, ID sanitising |
| `src/lib/storage/migration/` | `legacy.ts` (the only reader of the prototype's browser storage), `migrate.ts` (convert + verify) |
| `scripts/node-backend.ts` | Node `fs` backend (tests, headless migration) |
| `src/Root.tsx` | vault picker, reconnect, unsupported-browser viewer, migration flow |
| `src/App.tsx`, `src/components/` | the app; `VaultBanner` / `VaultDialog` show save state, errors, trash, untracked and missing files |
| `src/lib/pmf.ts`, `src/lib/seq.ts`, `src/lib/export.ts`, `src/lib/literature.ts` | calculations, Store transforms and parsing, xvg/png/pdf export, Crossref lookup |
| `src/lib/gmxHeader.ts`, `src/lib/folderFiles.ts` | GROMACS header parser (provenance); files from a chosen or dropped folder |
| `src/lib/structFile.ts`, `src/lib/shade.ts` | structure files → one PDB text with real elements, 3D styles and defaults; curve shades |
| `docs/storage-redesign.md`, `docs/storage-decisions.md` | the spec and every design decision |

## Features

- **Matrix** of sequences × columns (O26 / PG / HA by default): cell = mean area or minimum
  of the corrected PMF runs. Upload xvg files singly or in batches, with file-name patterns.
- **Folder import**: *Choose folder…* in the upload dialog, or drop a folder. Every `.xvg`,
  `.dat` and `.txt` is read with its path; other files are listed as skipped (OS clutter is
  ignored). A **folder pattern** in Settings (e.g. `{method}/{column}/{seq}/{*}/{run}`, where
  `**` is any number of folders and the pattern matches the end of the path) reads fields from
  the folders; without a folder, it is matched against the file's GROMACS working directory.
  The plan shows each file's folder and where each field came from; where the name, folder and
  header disagree, or a `{run}` isn't a run number 1–10, the file waits as a conflict. The
  Settings tester shows what a sample name and folder resolve to.
- **Analysis type from the header**: the GROMACS tool (`gmx awh` = PMF) and keywords in the xvg
  title and y label beat keywords in the file name; the plan says which was used. A file from
  another GROMACS tool that matches no analysis is marked *unknown* until you choose one.
- **Provenance**: each run card shows the GROMACS version, tool and creation date as written in
  the file, and opens to the full command line, working directory and executable, each with a
  copy button. Files without a GROMACS header say so.
- **Tags** per run (hmr, fast water, …), edited per project in Settings → Tags (rename,
  reorder, add, remove; removing one in use says how many runs carry it). Pick them in the
  upload dialog and the run editor, or create one there with **+ tag**. New uploads start
  untagged.
- **Duplicate warning**: a file identical to one already in the project (or its trash) or
  earlier in the same upload is named and left out unless you include it; the other upload
  paths ask first.
- **Drop onto a cell**: drop files on a matrix cell to upload them into that sequence and
  column (next free run slots); `.pdb` / `.gro` attach to the sequence; folders go to the
  matrix-wide drop.
- **Merge preview**: renaming a row onto an existing one lists exactly which runs and analyses
  the merge will move to the trash.
- **Analyses** (RDF, RMSD, histograms, … or your own definitions) per run slot, with several
  curves per analysis and editable legends (*Slot taken → add as more curves*, or
  **+ curve from file**).
- **Smoothing** per analysis (off / light / medium / strong Gaussian, on by default for
  histograms), set in the graph settings of an analysis tab or in Settings → Analyses. Only the
  drawing and graph exports are smoothed; the stored curves stay as uploaded.
- **Markers** per analysis type: each shown curve is marked at its maximum, its minimum or not
  at all (default: maximum for RDF and RMSF, none for the rest), on the curve as drawn
  (smoothed when smoothing is on), optionally labelled with the point's x or y value. Set in
  the graph settings or Settings → Analyses. The first stat tile then names the overall
  maximum or minimum of the shown curves, with its x and the curve's legend. The PMF minimum
  marker is unchanged.
- **Curve colours**: every analysis curve, and the PMF runs of a cell, is drawn in a shade of
  its column's colour with a dash pattern. Shades and dashes go by position among the curves
  present (run order, then curve order), so up to ten curves are told apart without any
  setting, and hiding one never recolours the others. The first curve keeps the column colour.
  Every shade keeps at least 3:1 contrast on its background, in both themes and in exports.
  **Black and white** (graph settings → Colours) draws greys with dashes for print; it is a
  browser preference and applies to every graph in the detail window and its exports.
- **Per-curve visibility and shade**: in the Curves list each curve cycles shown → dimmed →
  hidden (within a shown run; a hidden run hides all its curves), and **−** / **+** / **↺**
  move its shade up to three steps darker or lighter, or reset it. Hidden curves leave the
  graph, the markers and the stat tiles; dimmed ones still count. Both are saved in the vault.
- **Reordering** columns, groups and rows in Settings → Modify by dragging the ⠿ grip.
- **Structures per sequence**: `.pdb` / `.gro`, viewed in 3D (3Dmol.js: cartoon / sticks /
  spheres / lines, spin), downloadable as the original file. Both formats are turned into one
  PDB text with each atom's real element. The element comes from the `.pdb` element column
  when present; otherwise from the atom name, with leading digits stripped (`2HB` is
  hydrogen), and from residue knowledge for ions and water. An atom that can't be decided
  isn't drawn and is named under the viewer. Hydrogens are hidden by default in both formats
  (**hydrogens** toggle). Water and ions are hidden by default above 800 atoms
  (**water & ions** toggle). Sticks are the default, cartoon for proteins of 30 or more
  residues. Cartoon draws the ribbon, thin side chains and everything that isn't protein as
  sticks; without a protein backbone it shows sticks and says so. Lines are drawn as thin
  sticks; atoms without bonds (a lone ion or water oxygen) are drawn as small spheres.
- **Literature per simulation** (sequence × column): paste a DOI to fill it from Crossref.
- **Projects** are standalone datasets with their own pages, columns and settings: switch,
  create, rename, duplicate, export, import and delete (to the trash).
- **Pages** are views of a project's sequences, each with its own address
  (`#/p/<project>/<page>`).
- **Compare**: hold `C` and click cells (or sequence names, for every column of that
  sequence); on release they open on one graph — run 1 of each by default, or every run —
  with min, well and area per curve, exportable as xvg / png / pdf. The key is set in Settings.
- **Exports** carry a title block: a red kicker (what is plotted), the title in capitals with the
  column first (`PG × WRWYCR`), and a subtitle.
- **Laser pointer**: press `K` (outside text fields). Settings → Laser pointer changes the key,
  toggle vs hold, colour, size and trail (a smooth, fading ribbon about a second long).
