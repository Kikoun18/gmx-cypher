# Storage redesign — decisions log

Companion to [`storage-redesign.md`](storage-redesign.md). One line of rationale per decision.
Status values: **approved** (all Phase 0 decisions D1–D46, 2026-10-03), **changed** (with date and reason).

## Phase 0 — approved 2026-10-03

### Structure and mapping

| # | Decision | Rationale |
|---|---|---|
| D1 | **A vault is a workspace that holds one or more projects.** Each app project is a visible top-level directory `{project-slug}--{projectId}/`. `manifest.json` carries a stable `vaultId` (the spec's "stable project ID" at vault level); each project keeps its own ID in its record. | The app already has multiple projects. This keeps the project switcher, and lets migration put every legacy project into the single directory the user picks (§16 step 2). |
| D2 | **Pages get no directory level.** A page is a view: an ordered list of row IDs plus an optional column subset. Pages live only in `.matrix/records/<projectId>/pages/<pageId>.json`. The visible tree is `{project}/{column}/{row}/{analysis}`. | One row can sit on several pages. A `{page}/` directory level would duplicate or arbitrarily split row data, and "do not invent an entity" rules out a fake page container. |
| D3 | **Row-wide data lives in `{project}/_sequences/{row-slug}--{rowId}/`**: the row note (`note.md`) and the row's structure files. | Rows and structures span all columns, so they can't live under one column. The leading `_` sorts the folder first and can't clash with `slug--id` names, and "sequences" matches the UI's wording. |
| D4 | **`{column}/{row}/` is the cell directory** (sequence × column). It holds the cell note, the PMF run originals and the analysis directories. | It matches the app's cell model: runs, analyses, cell notes and cell literature are all per (row, column). |
| D5 | **Runs have no directory of their own.** A run's original XVG sits directly in its cell directory under its original name. The run slot and other parameters live in the record. | Renumbering runs then touches metadata only, and the cell folder reads like the user's own data folder. |
| D6 | **The `{analysis}` directory is one per analysis (extra):** `{type-label-slug}-run-{n}--{extraId}/`, holding every original file that analysis's curves were parsed from. | An analysis can combine several files ("add as more curves"), so it needs a folder. Its run number appears in the slug only; the folder is resolved by ID. |
| D7 | **Record granularity:** one JSON file per row (`rows/<rowId>.json`) containing that row's runs, analyses, curves, structures, file metadata, per-column literature, per-slot visibility and note IDs. Plus one file per column (`columns/<colKey>.json`), one per page (`pages/<pageId>.json`), `project.json` (name, desc, column/page/row order, dir) per project, and `workspace.json` (project order) at vault level. | Almost every edit is scoped to one row, so one row file means one file write. Splitting further (one file per run or curve) would produce thousands of tiny files for no benefit. Ordering lives in the parent so a reorder rewrites one file. |
| D8 | **Columns are records, not settings.** This deviates from the `columns.json` example in §7. | Columns are entities with stable IDs and visible directories, and runs refer to them. Their existence and order are record data under the §11 authority table. |
| D9 | **Descriptions stay as record fields:** project `desc`, page `desc`, sequence `desc`. Notes are the two existing note features: row notes and cell notes. Paths for project, column and analysis notes are **reserved**: a hand-written `note.md` there is recognised (it is not reported as "untracked") and is preserved, exported and trashed with its owner, but no new editor UI is added. | It maps the real model 1:1 without inventing features (§3, §18). *Alternative:* turn page/project descriptions into `note.md` files. |
| D10 | **IDs:** the existing IDs are stable, so they are preserved: projects `p…`, rows `s…`, runs `r…`, analyses `x…`, curves `c…`, structures `st…`, literature `l…`, pages `pg…`, column keys `k`. New IDs: uploaded files `f…`, notes `n…`, vault `v…`. IDs are unique **within a project**; project IDs are unique within the vault. | Preserving IDs keeps URLs, exports and migration verification simple. Per-project scope lets "duplicate project" keep entity IDs. |
| D11 | **New column keys are capped at 24 characters.** This is a small, storage-required change to `newColumn()` in `seq.ts`. Existing keys are kept. | Column keys become directory-name suffixes, and uncapped keys could push paths past Windows limits. |

### Files, notes, cache

| # | Decision | Rationale |
|---|---|---|
| D12 | **Every upload path writes the original `File` byte-for-byte** before anything else, through `project.saveUpload()`. That covers the XVG upload dialog, drag-and-drop, "+ curve from file", the structure panel, and JSON imports. The record stores the parse parameters used at upload (PMF `xCol`/`yCol`; curve `xCol`/`yCol`/`xScale`). | §4 is a hard requirement, and storing the parameters makes the derived data reproducible even if Settings change later, exactly like today's frozen parsed arrays. |
| D13 | **Imported dataset JSON files are kept as originals** in `{project}/_imports/` (`origin: "upload"`). Data rebuilt from them is written as reconstructed files that refer back to the import. | §4 covers "any format that any upload path accepts", and import is an upload path. |
| D14 | **The JSON export becomes v4: v3 plus the original files embedded as base64**, so export → import keeps originals byte-identical. v3 (and older) exports still import, with their series written as reconstructed files. | It keeps the compatibility path lossless now that originals exist. The trade-off is larger export files. |
| D15 | **Derived data are reproduced exactly as today:** run arrays = `pickXY` + `toFixed(4)`, and curves = `pickCurves` (`toPrecision(6)` after `xScale`), applied to the original file. | No change to PMF calculations or parsing (§18). |
| D16 | **Loading:** the matrix needs every PMF run's data. It reads one aggregated cache file, `cache/<projectId>/pmf.json` (keyed by SHA-256 + parser version + parse parameters), and falls back to the small PMF originals on a miss. Analysis files and structures load **on demand** only, when their tab or viewer opens. Notes load in the background after first paint; cell note dots only need note existence, which comes from the scan or index. | It meets "large files never at startup" while keeping the matrix instant, and the cache is never needed for correctness. |
| D17 | **A missing original** shows its run, analysis or structure in a "missing file" state. Its data is **not** taken from cache, and it is left out of cell values. | The cache is not an authority, so showing values that can't be re-derived would be misleading. |
| D18 | **Note frontmatter:** `id`, `type` (`row-note` / `cell-note` / `project-note` / `column-note` / `analysis-note`) and `owner` (the owning entity ID). Cell notes also carry `column` (the column key), because a cell is a (row, column) pair. The note ID is also stored in the owner's record, so repairing missing frontmatter keeps the same ID. | Minimal frontmatter (§6), an identity that survives a user deleting the frontmatter, and no timestamps. |
| D19 | **Emptying a note** moves its `note.md` to trash instead of leaving an empty file. | It honours "no empty note files" while keeping the deletion recoverable. |
| D20 | **Cache layout:** `cache/index.json` (lookup index, with a fingerprint of the record files it was built from), `cache/<projectId>/pmf.json`, and `cache/parsed/<sha256>.<parserVersion>.<paramsHash>.json`. Each entry records its source hash, parser name/version and parameters. | Staleness can be detected (§8), and deleting `cache/` costs only time. |
| D21 | **Reconstructed files** use a distinguishable name, `<original-stem>.reconstructed.xvg`, a leading `# RECONSTRUCTED …` comment header (which the parser ignores), and `origin: "reconstructed"`. Curves that share an x grid and a source file name are written as one multi-column file with `@ sN legend` lines; otherwise each curve gets its own file. | Reconstructed data must never pass as original (§16.5), and grouping mirrors the original files as closely as the data allows. |
| D22 | **Structures migrated from IndexedDB** are written as the UTF-8 bytes of the stored text, with `origin: "migrated-from-indexeddb"`. The report notes that a BOM or invalid bytes in the original upload can't be recovered, because the prototype stored decoded text. | It is the best recoverable fidelity, stated honestly. |

### Paths and naming (`path.ts`)

| # | Decision | Rationale |
|---|---|---|
| D23 | **Slugs:** NFC normalisation, then lower-case, keeping Unicode letters and digits, with every other run of characters becoming `-`. Leading and trailing `-`, `.` and spaces are trimmed. Windows reserved names get a `_` prefix. An empty result becomes `untitled`. The slug is cut to **20** characters, then `--{id}` is appended. | Readable names on every OS. With the depth project/column/row/analysis/file, relative paths stay ≤ about 205 characters, leaving room for the vault's own path under Windows' 260-character limit. |
| D24 | **Uploaded file names:** the original name is NFC-normalised, illegal characters are replaced, trailing dots and spaces are trimmed, reserved names get a prefix, and the stem is cut so the whole name is ≤ 64 characters (the extension is kept). Collisions are checked case-insensitively and in NFC, and resolved with a ` (2)`, ` (3)` … suffix. | §4 and §10. The suffix style matches what file managers do. |

### Writes, journal, trash, concurrency

| # | Decision | Rationale |
|---|---|---|
| D25 | **Persistence is "desired-state reconciliation":** the UI keeps its pure `Store → Store` transforms, and the project service diffs the previous and next state into a plan. The plan covers record writes, note writes, file moves (to follow renames and owner changes), creating directories, and trashing unreferenced originals and removed entities. The plan runs as journaled operations on one serialized write queue. | One code path makes every existing UI action (rename, merge rows, move cell, renumber runs, delete) persist correctly without rewriting the components. Uploads still go through explicit `saveUpload()` first, so the bytes exist before the commit point. |
| D26 | **Folder moves and renames** = create the destination, move each file (using `FileSystemFileHandle.move()` where available, otherwise copy + SHA-256 verify + delete), then remove the empty source. Every step is journaled. | Chrome supports `move()` for local *files* (Chrome 111+) but not for *directories* (§12 anticipates copy + delete). |
| D27 | **Journal entries** live in `.matrix/journal/<opId>.json` and list the content paths created, the record writes, and the removals, with a `phase` of `content` or `committed`. On open: `content` → roll back (delete created content), `committed` → roll forward (finish removals, refresh the cache). | It implements §12's four-step order and recovers cleanly. |
| D28 | **Trash items** = `.matrix/trash/<UTCstamp>--<type>--<id>/` containing `trash-manifest.json` (original paths, records or sub-records as they were, parent IDs such as row, column, pages and position, deletion time, schema version) and `content/<original relative path>` for the moved files. Record-only entities (pages, literature references) are trashed too. **Restore fallback:** `{project}/_restored/<trash-item-name>/`, with its files then listed as untracked and attachable, and the user is told. | Uniform, inspectable and recoverable (§9). |
| D29 | **Untracked files** (in the visible tree, not referenced, not notes, not `*.crswap`) are listed with **Attach** (to a cell as a run or analysis, or to a row as a structure) or **Ignore**. Ignored paths are stored in `.matrix/settings/<projectId>/ignored.json`. | §11. The ignore choice has to persist with the vault. |
| D30 | **Conflicts** (two folders with the same ID in the same parent scope): the entity is marked as in conflict, writes touching it are blocked, and the conflict is reported until the user resolves it. | §11: "don't guess". |
| D31 | **The write queue** is one promise chain. Note edits are debounced by 750 ms per note and flushed on blur, on `visibilitychange` and before closing. If writes are still pending, `beforeunload` warns. | §12. |
| D32 | **Read-before-write** applies to every text file we overwrite (notes, records, settings): it compares the last known `lastModified`, size and SHA-256. If the file changed externally and there are no local changes, it is reloaded. If both changed, a conflict copy is written next to the original (`note.conflict-20261003T024300Z.md`, `<id>.conflict-….json`) and the user is told. Files are re-checked on window focus, and there is a "Reload from disk" action. `FileSystemObserver` is used only if present. | §13. |
| D33 | **Single writer:** the Web Locks API holds `pmf-vault:<vaultId>` exclusively for the whole session. A second tab opens the vault **read-only**, with a banner. | §13. |
| D34 | **When permission is lost or a write fails:** the queue pauses and pending operations stay in memory. A persistent banner appears ("Can't write to ‹vault› — changes are kept in this tab · Reconnect"), and the queue resumes after `requestPermission`. | §2: changes are never silently dropped. |
| D35 | **`manifest.modified`** is updated on the first write of each session, then at most once every 10 minutes, and on close. | The spec requires the field, and throttling keeps Git diffs quiet. |

### Settings and browser storage

| # | Decision | Rationale |
|---|---|---|
| D36 | **Project settings** live in `.matrix/settings/<projectId>/settings.json` (`parse`, `pattern`, `xCol`, `yCol`, `xLabel`, `yLabel`, `temp`, `rowAll`, `hiddenOut`), `analyses.json` (analysis definitions) and `ignored.json`. | §7. Each of these changes how data is parsed, displayed or computed. |
| D37 | **Global UI preferences** (`dark`, `laserKey`, `laserMode`, `laserColor`, `laserSize`, `laserTrail`, `compareKey`) go in localStorage under a **new** key, `pmf-ui-prefs-v1`. The legacy key `pmf-seq-settings-v1` is never written again. | They are purely browser-global, and §16.9 forbids modifying legacy data. |
| D38 | **Session-only UI state stays unpersisted, as today:** the Area/Min metric, corrected/raw, shared y-axis, ranked order, and open dialogs and tabs. The current project and page stay in the URL hash. | No behaviour change, and nothing goes into browser storage. |
| D39 | **Vault handles** live in a separate IndexedDB database, `pmf-vault-handles` (store `vaults`: `{ vaultId, name, handle, lastOpened, lastProjectId }`). | §2 explicitly allows this, as session state only. |

### Environment, migration, process

| # | Decision | Rationale |
|---|---|---|
| D40 | **Unsupported browsers** get an explanation screen, plus "Open a JSON export (read-only, not saved)" running on the in-memory backend. | §2. |
| D41 | **Vault creation and migration** require an empty folder. OS clutter (`.DS_Store`, `Thumbs.db`, `desktop.ini`) and a bare `.git` don't count as content. A non-empty existing vault is accepted for migration only after confirmation, and project-ID collisions are re-keyed (and reported). | §16.2. Allowing `.git` lets users start from a fresh repository. |
| D42 | **Legacy sources** = `pmf-seq-store-v1`, `pmf-seq-settings-v1`, **plus `pmf-seq-projects-v1` and every `pmf-seq-project-<id>` key** (these come from the multi-project version, which §16 doesn't list), and IndexedDB `pmf-seq-structures`. | The current prototype writes all of these, and missing them would lose every project except the first. |
| D43 | **Migration also accepts a "legacy dump" JSON** made by a console snippet in the old app's tab. The same dump format is the test fixture and the input to the headless migration. | localStorage and IndexedDB are per origin: a prototype used at `http://localhost:8000` is invisible to the new app at `:5173`. The dump makes migration independent of origin, and testable. |
| D44 | **Schema upgrades:** schema starts at v1 with an empty upgrade registry, and the mechanism (back up to trash, run the steps, bump the version) is tested with test-injected steps. A vault with a higher schema opens read-only. | §5. There's no real older format to upgrade from yet. |
| D45 | **Tooling:** Vitest, with `npm test` = `vitest run`. Tests live in `test/` and are type-checked via `tsconfig.test.json`, which `tsc -b` references. The Node `StorageBackend` lives in `scripts/node-backend.ts`. The headless migration is `scripts/migrate-legacy.ts`, run with `vite-node`. | §15 and §17. Node can't run the extensionless TypeScript imports directly. |
| D46 | **Docs** live in `app/docs/` (the package root). **Git:** a branch `vault-storage`, a first commit of the current app as the baseline, then one commit per phase. The zip files are not committed. | `app/` is the codebase root, and a baseline commit makes each phase's diff reviewable. |

## Implementation notes

These refine the decisions above. None of them changes an approved behaviour.

### Phase 1

- **Uploads (D25):** there is no separate `saveUpload()` call. The UI passes the `File` objects to `commit(next, uploads)`, keyed by a new file ID that the Store already references in `run.src` / `curve.src` / `structure.fileId`. The planner writes them in the journal's *content* phase, so the bytes still exist before the commit point.
- **Commit point (D27):** the commit point is the journal entry flipping to `committed`. That entry carries the full contents of every record write, so a roll-forward can redo record writes byte for byte. The phases are content (originals, notes, folder moves) → commit → record writes → after (trash moves, removal of folders left empty).
- **Restore of record-only items:** when a page, literature reference or note can't go back to its original place, its records are written to `_restored/<trash-item>/restored-record.json` next to any files, and the user is told.
- **Type additions (storage only):**
  - `Run.src` / `Curve.src` hold the file ID and parse columns of the original.
  - `Run.state` / `Curve.state` / `StructMeta.state` are `missing` or `pending` (an analysis not yet loaded, D16).
  - `StructMeta.fileId` holds the file ID of a structure.
  - `seq.ts` gained `runFromTable()` / `curveFromTable()`, which factor out the existing parse-and-round steps so the loader and the upload dialog produce identical arrays. Their output is unchanged.
- **`cellValue()` skips runs with `state: 'missing'`.** This is D17: a missing original is excluded from values. It is the only change to a calculation path.
- **Notes guard:** when notes load lazily, notes the UI hasn't merged yet are never treated as deleted. With eager loading the notes are already in the first Store, so the guard is off.
- **`manifest.modified` (D35):** manifest writes are serialized. `close()` waits for them and writes only if a change was throttled since the last write.
- **Paths:** every path in records, journal entries, trash manifests and the index is relative to the vault root, uses `/`, and is NFC.

### Phase 2

- **Entry point:** `main.tsx` renders `Root` (the vault picker). It renders `App` once a vault is open.
  - On boot, `Root` reopens the most recent vault without a picker when `queryPermission` already says `granted`. Otherwise it lists recent vaults with **reconnect** and **forget**.
  - "Open a vault…" on an empty folder offers to create a vault there.
  - A non-empty folder that isn't a vault is refused with an explanation.
- **Project data flows only through the vault:**
  - `src/lib/projects.ts` (localStorage) and `src/lib/structures.ts` (IndexedDB) are removed.
  - `seq.ts` no longer touches `pmf-seq-settings-v1`.
  - UI preferences live in `src/lib/prefs.ts` (`pmf-ui-prefs-v1`) and vault handles in `src/lib/vaultHandles.ts` (`pmf-vault-handles`). These are the only browser stores left.
  - The structure-file helpers moved to `src/lib/structFile.ts` unchanged.
- **`seq.ts` changes that storage requires** (calculations untouched):
  - `UploadFile` carries `blob`, `fileId` and `existingPath`.
  - `planBatch` / `addBatch` record the source columns on runs and curves (`src`).
  - `pickCurves(..., fileId?)` tags curves with their original.
  - `addRun` accepts `src`.
  - `exportJSON` (v3) is gone. Export v4 is in `src/lib/storage/exchange.ts`. Import still reads v3 (structure text becomes the original; runs and curves are reconstructed, D21) and v4 (originals verified against their SHA-256, given fresh file IDs).
- **The UI Store and the service:**
  - `App` keeps the Store in state plus a ref. `commit(next, uploads)` updates both and hands `next` to `ProjectService.commit`.
  - Service patches (loaded notes, loaded analyses, outside edits, reloads) are applied to the ref and then rendered.
  - Notes load in the background. Note fields stay disabled until the notes are loaded and merged (`notesMerged()`).
- **Window events:**
  - Window `focus` runs `checkExternal()`.
  - `visibilitychange` → hidden flushes pending writes.
  - `beforeunload` warns while writes are pending.
- **Vault UI:**
  - The header gains a save badge ("saved to vault", "unsaved changes…", "saving…", "not saved", "read-only") and a **Vault** button. The button shows a count when files are missing, untracked or in conflict.
  - `VaultBanner` shows read-only reasons, write errors (**Reconnect** / **Retry** / **Reload from disk**), conflicts, journal recovery and notices.
  - `VaultDialog` shows:
    - the project folder;
    - missing files;
    - untracked files: **attach as data…** opens the upload dialog with the file, and saving *moves* it; **attach structure** asks for a row; **ignore**;
    - the trash, with restore, delete and empty;
    - **Reload from disk**, **Check folder now** and **Close vault…**.
- **Unsupported browsers** get an explanation and "Open a JSON export (read-only)". The export is loaded into a `MemoryBackend` vault, which is then marked read-only. The banner says nothing is saved.
- **Project rename** updates the name on screen at once and renames the folder 900 ms after typing stops (`ProjectService.rename` for the open project, `Vault.renameProject` for others).
- **Imported JSON files** are kept via `ProjectService.keepImport` in `{project}/_imports/` and listed in `project.json` → `imports`.

### Phase 3

- **Legacy reader** (`src/lib/storage/migration/legacy.ts`) is the only code that touches the prototype's storage.
  - `hasBrowserLegacy()` checks for the keys. `readBrowserLegacy()` reads them read-only into the dump format; opening the IndexedDB database aborts the upgrade, so a missing database is never created.
  - `parseDump()` validates a `pmf-legacy-dump` v1 file. `interpretDump()` turns either source into projects, browser preferences and structure texts.
  - With a project index, each project keeps the settings stored in its own store. Without an index (the single-dataset version), the data settings come from the global settings key.
  - Project stores the index doesn't list are migrated as "Recovered <id>", with a warning.
  - `removeBrowserLegacy()` runs only from the explicit button in a *verified* migration report (§16.9).
- **Migration** (`migration/migrate.ts`):
  - Each legacy project keeps its ID unless it is unsafe or already used in the vault; it is then re-keyed and reported.
  - The Store goes through `sanitizeIds` (unsafe entity IDs get fresh ones, with all references following) and then through the normal planner. Migrated data is therefore laid out exactly like data entered in the app.
  - Reconstructed files use the planner's D21 path. The manifest gets `migratedFrom` / `migratedAt` and a `migration` summary (source, time, per-project counts of reconstructed files, `verified`).
- **Verification** reopens the vault with a fresh `Vault.open` and a fresh `ProjectService` (cold caches; all notes and analyses loaded). It then compares:
  - columns, rows, runs (x/y arrays included), analyses and curves (x/y included), and structure metadata;
  - notes, literature, visibility and pages;
  - effective project settings (unset = default, on both sides);
  - the counts;
  - structure contents (UTF-8 text equal to the IndexedDB text);
  - file origins.
  Original file names must be kept, and reconstructed ones must carry `.reconstructed`. Any difference fails the migration and is listed in the report.
- **A structure the prototype had already lost** (metadata in the store, no text in IndexedDB) is kept. Its record points at where the file belongs, through a new `placeholder` upload kind that writes no bytes. It shows as a missing file, as it did in the old app.
- **A missing original is found again by name.** On load, if exactly one untracked file in the project has the same name (and the same size and SHA-256 when those are known), the record follows it, through a journaled record write. This covers a file moved within the project folder, and re-adding a lost file.
- **JSON import** keeps entity IDs and file IDs where they are safe and don't collide in the target project (§16). `sanitizeIds` replaces unsafe ones.
- **The migration UI** sits on the vault start screen:
  - It offers browser data when found, and "Migrate from a legacy dump file…" always.
  - The folder must be empty, or an existing vault after confirmation.
  - The report screen lists counts, reconstructed and missing files, warnings and verification differences. It has **Open the vault**, **Download report** and (verified, browser source only) **Remove the old browser copy…** behind a second click.
  - Browser preferences found in the old settings are written to `pmf-ui-prefs-v1`, but only when this browser has none yet.
- **Headless:**
  - `npm run migrate:fixture` runs `vite-node scripts/migrate-legacy.ts -- test/fixtures/legacy-dump.json .vault-out` on the Node backend. Its exit code is 1 when verification fails.
  - The fixture is generated by `scripts/make-legacy-fixture.ts` from the sample files.

### Phase 4

- **Record conflict copies:** when a record or settings file changed outside the app while this tab had changes to it, the tab's version is written next to it as `<name>.conflict-<stamp>.json` (D32), and saving stops until **Reload from disk**. The loader skips conflict copies.
- **Docs:** the README documents the vault format, authority rules, write ordering, outside edits, browser requirements and migration (with the dump snippet). `docs/final-report.md` holds the headless migration run, the vault listing and the example files.
