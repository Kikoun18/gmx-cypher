# Feature batch 1: Phase 0 report

This report covers the spec `docs/feature-batch-1.md`. Every path is relative to `app/`. Every "verified" claim was checked by reading the code and, where noted, by running a scratch script outside the repository.

## 1. Baseline

| | Result |
|---|---|
| Branch | `feature-batch-1`, created from `vault-storage` |
| Baseline commit | `0343abccdaaed8d5ca625744bbf4f5535f90d09d` (*Drag-and-drop reordering, analysis smoothing*) |
| `npm run lint` | passes: 0 errors, 7 warnings (`react(only-export-components)` in `ui.tsx` ×4 and `Laser.tsx` ×3) |
| `npm run build` | passes: 1 warning (direct `eval` in `3dmol/build/3Dmol.js`) |
| `npm test` | 79 passed, 5 files |

These numbers match section 0.1 of the spec.

## 2. R3: Clean up leftovers

**Current behaviour (verified):**
- The search for `localStorage|indexedDB|IndexedDB` in `src/` outside the four legitimate files finds only comments:
  - `seq.ts:814`: structures section header, "the file text lives in IndexedDB";
  - `seq.ts:829`: the `structureIds` doc comment;
  - `seq.ts:962`: the `rekeyStructures` comment;
  - `types.ts:60`: the `StructMeta` comment.
- `structureIds` has no caller (`grep` across `src/`, `test/` and `scripts/`).
- `rekeyStructures` only re-keys IDs that are in `foreign`. `importAsStore` and `importJSON` default `foreign` to an empty set, and `exchange.ts` (`importAsProject`, `importInto`) never passes it, so the re-keying never changes an ID.
- More dead code than the spec lists: `exchange.ts` `rekey()` deletes `raw.structData` before it calls `importAsStore` / `importJSON`. So the `structData` these functions return is always `{}`, and no caller reads it.
- An empty `// --- literature` section header sits above `pagesOf` in `seq.ts`.

**Proposed change** (`seq.ts`, `types.ts`):
- Delete `structureIds` and `rekeyStructures`.
- `readExport` becomes "parse + `normStore`".
- Drop the `foreign` parameter and the `structData` return value from `importAsStore` and `importJSON`.
- Correct the comments: structure files are originals in the vault.
- Remove the stray section header.
- Record the search and its result in the decisions log.

**Code budget:** about +6 / −30.

**On-disk impact:** none. v3 exports still import, because `exchange.ts` reads `structData` itself.

**Tests:** the existing suite, in particular the exchange tests for v3 import and the v4 round trip.

**Risks:** none known. Exchange is the only caller.

**Open questions:** none.

## 3. R4: The header beats the file name

**Current behaviour (verified by running it):**
- `detectAna(types, filename, head)` (`seq.ts:247`) joins the file name, the title and the y label into one haystack.
- With the real fixture header (title `AWH`, y label `(kJ/mol)`):
  - `detectAna(…, 'pmf_distance_ha.xvg', head)` → `dist`;
  - `detectAna(…, 'awh_rg-scan.xvg', head)` → `rg`;
  - `hmrfast6_ha_a_t200000.xvg` → `pmf`.
- `planBatch.resolve` (`seq.ts:619`) sets `anaHow: 'file' | 'form' | 'auto'`. `UploadDialog.tsx:142` shows "· file" or "· auto".

**Proposed change** (`seq.ts`: `detectAna`, `planBatch.resolve`, `PlanItem.anaHow`; `UploadDialog.tsx`: the label):
- `detectAna` returns `{ k, from: 'header' | 'auto' }`.
- It checks evidence in this order:
  1. title `AWH` (case-insensitive) → `pmf` / `header`;
  2. keywords against the header only (title and y label) → `header`;
  3. keywords against the file name → `auto` (today's behaviour);
  4. otherwise → `pmf` / `auto`.
- The `{analysis}` token and the form choice already come first in `resolve`.
- After R1a, the parsed tool name (`gmx awh` → PMF) joins step 1 (R1b).

**Code budget:** about +14 / −6.

**On-disk impact:** none.

**Tests** (`test/upload.test.ts`, table-driven):
- `detectAna: AWH title beats file-name keywords`;
- `detectAna: no header keeps today's behaviour`;
- `detectAna: RDF header with a PMF-looking name is RDF`;
- `planBatch: {analysis} token beats the header`;
- `planBatch: anaHow reports header`.

**Risks:** small.
- A real analysis whose header title is literally `AWH` but which isn't a PMF (`gmx awh` can also write `-fric`, `-kt`…) would now be PMF. Today it would be PMF too, unless the file name has a keyword.
- Real non-PMF `gmx awh` outputs would settle this. They are part of question 10.

## 4. R5: Say what a merge will drop

**Current behaviour (verified by running it):**
- `EditPanel.save` (`DetailDialog.tsx`) calls `updateSeq`, then `remapRuns`, then `moveCell`.
- A scratch run confirmed both of the spec's points:
  - Renaming `WRWYCR-typo` into `WRWYCR` while renumbering its run 1 → run 3 drops the typo's run 1, and moves the twin's own run 1 to run 3.
  - The typo's hidden run 2 arrives on the twin visible. Its flag stays keyed by the deleted row's ID, and the planner drops it on save, because `visOf` only reads existing rows.
- **Not in the spec:** `updateSeq` also overwrites the twin's description with the edited row's (`if (desc && desc.trim()) twin.desc = desc.trim()`). The form always carries the edited row's description, so the twin's own description is silently replaced.
- How the rest merges (verified):
  - analyses with the same type, column and slot: the twin's wins, and the renamed row's is dropped whole, with all its curves;
  - structures: appended, never dropped;
  - notes: joined with a blank line;
  - literature: concatenated.

**Proposed change** (`seq.ts`: a new pure `editRow(store, rowId, edit)`; `DetailDialog.tsx` `EditPanel`):
- `editRow` performs the whole save and returns `{ store, rowId, col, dropped, error }`.
- `dropped` lists `{ kind: 'run' | 'analysis', label }` for every run or analysis ID that existed before the save and doesn't exist after it. Computing it by diffing IDs means the preview and the save can't drift: the panel previews by calling `editRow` itself.
- The message reads, for example: "Merging keeps WRWYCR's runs where both have one. From WRWYCR-typo, 2 runs and 1 analysis go to the trash: HA run 1, HA run 2, RDF on HA run 1." Or "Nothing is dropped." It is shown in an `aria-live="polite"` region.
- Notes, structures and references are never dropped, so one short clause is enough: "Notes, structures and references are combined."
- **If question 19 is approved:**
  - `editRow` renumbers and moves the edited row first, then merges, so the renumbering applies to the row being edited;
  - `updateSeq` moves the visibility flags of the runs it keeps onto the twin.
- **If question 20 is approved:** different non-empty descriptions are joined, the way notes already are.

**Code budget:** about +55 / −25 (`editRow` about 35, panel about 15, `updateSeq` vis and description about 6).

**On-disk impact:** none.

**Tests** (`test/merge.test.ts`):
- `editRow preview equals what the save drops`, table-driven: no clash, run clash, analysis clash, mixed, merge + renumber, merge + column move;
- `merge keeps hidden runs hidden` (if question 19 is approved);
- `merge joins different descriptions` (if question 20 is approved);
- `vault: merged-away originals are in the trash and restore`.

**Risks:**
- Merge + renumber semantics change if question 19 is approved; the old order was a bug.
- The backlog item about `updateRun` and hidden flags is a different function. R5 doesn't touch it.

## 5. R6: Duplicate warning

**Current behaviour (verified):**
- `describeUpload` (`files.ts`) hashes the blob at save time.
- `readFiles` (`App.tsx`) reads each file as text with `FileReader`, all at once.
- `addCurveFile` (`DetailDialog.tsx`) and `StructurePanel.add` read and commit immediately.
- `PlanItem.dup` means "slot taken twice in this batch".
- `FileMeta` lives in `RowRecord.files` (runs, analysis curves, structures) and `ProjectRecord.imports`.

**Proposed change:**
- **`files.ts`:**
  - `readLocal(file)`: one `arrayBuffer()` read returns `{ text, sha256 }`, using `crypto.subtle` through the existing `sha256Hex`;
  - `PendingUpload.sha256?`, which `describeUpload` reuses instead of re-hashing;
  - the plan's per-file data carries the hash, so each file is still read and hashed once.
- **`project.ts`:** `ProjectService.sameContent(sha)` looks up the in-memory records. It returns owner descriptions such as "run 2 of WRWYCR × HA (hmrfast6_ha_b_t200000.xvg)", built from `state.rows`, `state.columns` and the files' metadata. Files with an empty `sha256` are skipped. A second method, `trashedContent()`, reads this project's trash manifests once, on demand, and is used only for the "a deleted copy is in the trash" note.
- **`seq.ts`:**
  - `UploadFile.sha256?` and `PlanItem.sameAs?: string`;
  - `planBatch` takes an optional `known(sha) => string | null` and marks in-batch duplicates (a later file with the same hash as an earlier one);
  - `form.include?: Record<fileId, boolean>` lets the user include a duplicate after all;
  - duplicates are excluded by default (`ok: false`, status "identical to …").
- **`UploadDialog.tsx`:** a labelled "include anyway" checkbox on duplicate lines, and the warning text in the status cell, with a symbol so it doesn't rely on colour.
- **`DetailDialog.tsx` `addCurveFile`, `StructurePanel.tsx`:** call the same check. On a hit, show `window.confirm("Identical to … — add anyway?")` (question 22).
- **`App.tsx` `readFiles`:** uses `readLocal`.

**Code budget:** about +110 / −20.

**On-disk impact:** none. No new index (requirement 6). The hash that is reused is the same SHA-256 that `describeUpload` already stores.

**Tests** (`test/duplicates.test.ts`):
- `same bytes, different name → names the existing owner`;
- `same name, different bytes → no warning`;
- `duplicate within one batch`;
- `empty sha256 placeholders are never reported`;
- `trashed copy is reported separately`;
- `other projects are not searched` (if question 21 is approved);
- `describeUpload reuses a supplied hash`.

**Risks:**
- R7 and R1d feed the same `readFiles` path, so they inherit the check for free. That is why R6 comes before both.
- The upload dialog has to wait for hashing before it can plan. Hashing is fast compared with parsing.

## 6. R7: Drop a file onto a matrix cell

**Current behaviour (verified by running it):**
- The empty-cell click (`Matrix.tsx` `Row`) calls `openForm({ name, seq, desc, group, col, parse: false })`.
- `formFor` (`DetailDialog.tsx`) adds `run`, `ana`, `keepName: true` and `onClash`.
- With `keepName: false`, two files planned for row WRWYCR become `WRWYCR+1` and `WRWYCR+2` in slot a. With `keepName: true`, they become runs b and c of WRWYCR.
- `App.tsx` `onDrop` / `onDragOver` handle drops on the whole matrix pane. The cells have no drop handlers.

**Proposed change:**
- **`seq.ts`:** pure `cellForm(row, col, over?)` → `Partial<UploadForm>` (`name`, `seq`, `desc`, `group`, `col`, `parse: false`, `keepName: true`, plus overrides). It is used by `Row` (empty-cell click), `formFor` and the cell drop.
- **`Matrix.tsx` `Row`:** per-cell `onDragOver`, `onDragLeave` and `onDrop`, active only when `dataTransfer.types` includes `Files`, the vault isn't read-only, and compare isn't held.
  - The drop calls `stopPropagation` and hands the files to a new context callback `dropOnCell(rowId, col, files)`.
  - The cell shows an accent outline plus a "drop" label, so the state isn't shown by colour alone.
- **`App.tsx`:** `dropOnCell` opens the form with `cellForm`, then calls the existing `readFiles`.
  - A folder dropped on a cell is refused with a toast (`webkitGetAsEntry().isDirectory`).
  - `.pdb` / `.gro` go to structures (question 25).
- **`ctx.ts`:** add `dropOnCell`.
- **`StructurePanel.tsx`:** if question 25 is approved, its file-to-structure logic moves to a function that both it and `App` call. It is extracted, not duplicated.

**Code budget:** about +70 / −15. Structures on a cell add about +25.

**On-disk impact:** none.

**Tests** (`test/upload.test.ts`):
- `cellForm is shared and pure`: same output for the click and the drop, and `formFor` overrides are applied;
- `two files dropped on a cell land in the row's next free slots`.

**Risks:**
- The matrix-wide drop must not fire for cell drops (`stopPropagation`), and the app's reorder and analysis-chip drags must not light up cells (the `Files` check).
- R6's check applies automatically, because the drop goes through `readFiles`.

## 7. R1: Folder import, path patterns and provenance

**Current behaviour (verified by running it):**
- `parseName` (`seq.ts:163`) builds `^…$` with one lazy `(.+?)` group per token, case-insensitive, after stripping `.xvg`, `.dat` or `.txt`.
- `{run}` → `parseInt` 1–10, or a slot letter. Anything else silently becomes `a`.
  - `parseName('hmrfast6_ha_9.multiwalker_t200000.xvg', '{method}_{column}_{run}_t{time}.xvg')` gives `run: 'i'` (run 9).
  - `parseName('hmrfast6_ha_a_t200000.xvg', DEFAULT_PATTERN)` gives `seq: 'a'`.
- `parseTable` drops every `#` line.
- `readFiles` reads every file at once.
- `UploadDialog` calls `planBatch` in its render body, so every keystroke re-picks every curve.

### R1a: header parser

- **New `src/lib/gmxHeader.ts`:** `parseGmxHeader(text)` reads only the leading `#` / `@` block. It returns:
  - `{ version, tool, command, workdir, created, executable }`, each `string | null`;
  - or `null` when there is no GROMACS line.
- Rules, from the real fixture:
  - `created` is the text after `This file was created` (`Mon Sep 21 12:27:52 2026`), with no parsing and no time zone;
  - `:-) GROMACS - gmx awh, 2025.4-PLUMED_spack (-:` gives tool `gmx awh` and version `2025.4-PLUMED_spack`;
  - `Working dir:` and `Executable:` are taken verbatim, trimmed;
  - `Command line:` is followed by lines that start `#` plus at least two spaces, joined with a space; the block ends at the first other line (`# gmx awh is part of G R O M A C S:` has one space);
  - CRLF is accepted.
- A file wrapped over several lines can only be checked against a real file (question 10).
- `cache.ts`: `PARSER.gmxHeader = 'gmx-header@1'`, plus `read/writeHeaderCache(sha)` in `cache/parsed/<sha>.gmx-header-1.json`, following the table cache.

### R1b

`detectAna` uses `tool === 'gmx awh'` as header evidence for PMF (question 11).

### R1c: path pattern

- `seq.ts`:
  - `parseName` gets a small inner `compile(pattern, segmentSafe)`, reused by a new `parsePath(dir, pattern)`. One regex builder serves both, so nothing is duplicated.
  - The `{run}` normalisation is shared.
- Matching rules (proposed decision):
  - case-insensitive;
  - `\` is normalised to `/`;
  - tokens may be part of a segment (`{column}_x`) but never cross `/`, so the group is `([^/]+?)`;
  - `**` = zero or more whole folders;
  - the pattern matches the folder part only (question 1);
  - with an implicit leading `**/` (question 2).
- Combining fields: `mergeFields(name, path, header)` → `{ fields, from: Record<field, source>, conflicts }`. A conflict compares normalised values:
  - column: through `matchCol` key;
  - sequence: upper-cased;
  - run: slot;
  - group, name, time and temperature: trimmed and case-insensitive.
  - A conflict makes `PlanItem.ok = false` and the status says "column: ha (path) ≠ pg (name)".
- `PROJECT_KEYS` / `DEFAULT_SETTINGS`: `pathPattern`, default `''` (off).
- `SettingsDialog.tsx`: the tester gets a sample-path field showing the fields with their source.

### R1d: folders

- **`src/lib/folderFiles.ts`:**
  - `filesFromDrop(dataTransfer)` takes every `webkitGetAsEntry()` synchronously, then walks the entries, calling `readEntries()` until it returns an empty batch;
  - `filesFromInput(input)` uses `webkitRelativePath`;
  - both return `{ file, path }[]` plus a list of skipped files.
- Reading:
  - `App.readFiles` reads with a concurrency limit of 6;
  - it shows progress in the dialog ("Reading 120 / 900"), announced politely;
  - it reads, hashes, parses the table and parses the header once per file (shared with R6).
- Planning: `UploadDialog` memoises `planBatch`, and the expensive per-file data extraction is cached on the table (`WeakMap`), so re-plans stay cheap.
- `UploadDialog.tsx`:
  - a "Choose folder…" button;
  - the relative path in the file column;
  - a "fields from" tooltip and a short source tag per field;
  - a "skipped: 3 (not xvg/dat/txt)" line, which expands to the names.
- Only `.xvg`, `.dat` and `.txt` are considered. OS clutter is ignored (question 7).

### R1e: provenance on run cards

- `ProjectService.provenance(fileId)`:
  - reads the cache;
  - otherwise reads the original's first 8 KB, parses it and writes the cache;
  - reconstructed files, or files where the parser returns `null`, give `null`.
- `DetailDialog.tsx` run card:
  - one line: "GROMACS 2025.4-PLUMED_spack · gmx awh · created Mon Sep 21 12:27:52 2026", or "no provenance in file";
  - a "details" disclosure (`<details>`) shows the command, working directory and executable in full, with copy buttons (`navigator.clipboard`).
- Analysis files are parsed too (cache), but only runs show provenance for now (proposed decision).

### Code budget

| Item | Added / removed |
|---|---|
| R1a | +55 (parser) +20 (cache) / −0 |
| R1b | +3 |
| R1c | +70 / −10 |
| R1d | +190 / −25 |
| R1e | +60 |

**On-disk impact:**
- Provenance lives in the cache only (question 5). That is derived data, so the vault format doesn't change.
- `pathPattern` adds a key to `settings.json` (question 28).
- The export carries `settings`, so `pathPattern` is exported and re-imported automatically. Older exports simply lack it.

**Tests:**
- `test/gmxHeader.test.ts`, table-driven: real fixture; no header; CRLF; `gmx_mpi` vs `gmx`; suffixed version; the line after the command is excluded; reconstructed file → `null`.
- `test/pathPattern.test.ts`: plain segments; `**` matching zero, one and several folders; `{*}`; partial segments; case; no match; unreadable `{run}` → conflict; path vs name conflict; normalised agreement (`ha` vs `HA`); `parseName` unchanged, using the existing cases plus a regression table.
- `test/folderImport.test.ts`, Node backend: the fixture tree `test/fixtures/cluster/hmr+fast+6/ha/a/9.multiwalker/1/awh_t200000.xvg`, plus one analysis xvg (question 10) and one `README.txt` / `notes.pdf`. It is walked like a folder, planned, and checked for rows, columns, slots and the skip list.
- `test/provenance.test.ts`: survives close → reopen and deleting `.matrix/cache/`; reconstructed → none.

**Risks and interactions:**
- R1d builds on R6's read pipeline and R7's `readFiles` path.
- The real cluster group `hmr+fast+6` differs from the name-pattern group `hmrfast6`. Mixing both patterns will show conflicts, which is correct.
- The user's rows are single amino acids (`s`, `t`, `r`, `a`…). In the cluster path, `a` is the sequence, `9.multiwalker` a protocol step, and `1` probably the walker or replicate. A suitable path pattern is `{method}/{column}/{seq}/{*}/{run}`.
- The `{run}` change touches a backlog item (question 3).

## 8. R2: Methods become tags

**Current behaviour (verified):**
- `METHODS` / `methodLabel` are in `seq.ts`.
- `methods` appear in:
  - `types.ts` `Run` and `records.ts` `RunRec`;
  - `seq.ts` (`RunForm`, `UploadForm`, `addRun`, `addBatch`, `RunPatch` / `updateRun`);
  - `model.ts` (`rowToSeq`) and `plan.ts` (the run record);
  - `migration/migrate.ts` (`canon`);
  - `App.tsx` `blankForm` (ADD ticked);
  - `UploadDialog.tsx` (Flags chips);
  - `DetailDialog.tsx` (plot label, run card, run chips, `RunEditor`);
  - `test/helpers.ts`, `test/exchange.test.ts` and `scripts/make-legacy-fixture.ts`.
- `MIGRATIONS` is empty.
- `Vault.upgrade`:
  1. backs up `step.files` (a fixed list) into a `schema-backup` trash item;
  2. calls `step.run(io)`, which writes directly, outside the journal;
  3. commits the manifest bump.
- If the tab closes during `step.run`, `recover()` rolls back the content phase. That undoes nothing the step wrote, so the vault is left half-converted at v1, and the step runs again on next open.

**Proposed change:**
- **Settings:**
  - `Settings.tags: { k, label }[]`, stored like analyses in `.matrix/settings/<pid>/tags.json` (question 13);
  - edited in Settings → "Tags", with the same add / rename / reorder (drag, as columns) / delete UI as analyses.
- **Records:**
  - `Run.tags: string[]` / `RunRec.tags`, sorted unique keys, so reordering or renaming tags never rewrites runs;
  - unknown keys are kept and shown in italics with their key.
- **Migration, schema 1 → 2:**
  - `SchemaMigration` changes from `files` + `run(io)` to `run(io) → { path, text }[]`, the record writes (question 17).
  - `Vault.upgrade`:
    1. backs up exactly those paths before anything changes;
    2. puts the writes into the journal entry's `records`, so they are applied after the commit point together with the manifest bump.
  - A crash before the commit point leaves the vault untouched at v1; a crash after it is rolled forward by `recover()`. So "half-upgraded" can't happen, and the step stays idempotent anyway: `tags ∪ methods-true keys`; `methods` removed.
  - Per project, the step seeds `tags.json` with `hmr`, `fast` ("fast water"), `prosecco75` and `add` ("ADD"), so labels look exactly as before.
- **Export:**
  - v5: runs carry `tags`, `settings.tags` is present (question 15);
  - import of v3 / v4 converts `methods` → tags and seeds the default tag list when the export has none.
- **Legacy migration:** `normStore` converts `methods` → `tags`, so `migrate.ts` produces tags and `canon` compares tags.
- **UI:**
  - chips list the project's tags in the upload dialog and `RunEditor`, with an inline "+ tag" (question 16);
  - `methodLabel` → `tagLabel(tags, list)`;
  - `blankForm` starts with no tags.
- **Group vs tags:** the row group header is labelled "Method · group" and is free text per row, for example `hmrfast6`. Tags are per-run flags (`hmr`, `fast water`…). Both say "method", and the real data shows the overlap: the group `hmr+fast+6` *is* a combination of tags. That is confusing, so question 18 proposes relabelling the header "Group" (one string), and leaving the behaviour alone.

**Code budget:** about +260 / −90 (migration about 60, settings UI about 70, chips about 40, exchange about 30, types and plumbing about 60).

**On-disk impact:**
- `SCHEMA_VERSION` goes 1 → 2.
- `RunRec.methods` is replaced by `tags: string[]`.
- `tags.json` is new.
- Export goes to v5.
- The full section 1.3 plan applies:
  - frozen schema-1 vault, v4 and v3 fixtures;
  - old → new, interrupted, and newer → read-only tests;
  - export round trip.

**Tests** (`test/tags.test.ts`):
- `upgrades the frozen schema-1 vault: methods → tags, backup in trash, field by field`;
- `interrupted upgrade (crash before / after commit) ends identical to a clean one`;
- `schema-3 vault opens read-only`;
- `close → reopen keeps tags`;
- `export v5 round trip`;
- `imports frozen v4 and v3 exports with tags`;
- `legacy migration verifies with tags`;
- `renaming a tag label keeps runs' tags`;
- `deleting a tag in use` (as decided);
- `unknown tag preserved through save and export`.

**Risks:**
- This is the first real schema migration and the largest item.
- The `SchemaMigration` interface change touches the existing injected-migration test in `vault.test.ts`, which has to be adapted (with a recorded reason).

## 9. Order

I confirm the spec's order, with one change: create the frozen old-format fixtures (R2-0) at the start of Phase 3, before R1c, if question 28 decides that a new settings key counts as a format change.

**Testing tools:** no UI test framework is added. Question 29 explains how I would run browser checks.

## 10. Open questions

Each question has options and a recommendation (**R:**).

### R1: folders, path patterns, provenance

1. **What the path pattern matches.**
   - (a) Folders only; the file name stays with the file-name pattern.
   - (b) The whole relative path.
   - **R:** (a). One way to match a name, and the patterns stay short (`{method}/{column}/{seq}/{*}/{run}`).
2. **Anchoring.**
   - (a) Implicit leading `**/`: the pattern matches the *end* of the folder path, so dropping `walkers_for_denys/` or `hmr+fast+6/` both work, and the header's absolute working directory (question 4) matches too.
   - (b) Anchored at the dropped or chosen folder.
   - **R:** (a).
3. **An unreadable `{run}` (e.g. `multiwalker`).**
   - (a) A conflict in the plan ("run: 'multiwalker' is not 1–10"); the file isn't uploaded until it's fixed.
   - (b) Run 1, as today.
   - The rule lives in `parseName`'s shared normalisation, so (a) would also change the file-name pattern, which fixes half of a backlog item.
   - **R:** (a) for both patterns.
4. **Header fallback.** For files with no folder path, match the path pattern against the header's `Working dir:`, shown as "from header".
   - **R:** yes. It only fills fields that the name and form don't give.
5. **Where provenance lives.**
   - (a) Cache: `cache/parsed/<sha>.gmx-header-1.json`, re-derived on demand. No format change, and no cluster paths or user names in Git or exports.
   - (b) The run record: grep-able, but duplicated, and it leaks paths into Git and exports.
   - **R:** (a).
6. **Keep `Executable:`?**
   - **R:** yes, in the cache, shown only in the expanded details. It tells `gmx` from `gmx_mpi` and identifies the build. `Data prefix:` is dropped (redundant).
7. **OS clutter** (`.DS_Store`, `Thumbs.db`, `desktop.ini`).
   - **R:** ignore it silently, as D41 does for empty folders. Other non-data files are listed as skipped, with a count.
8. **Folder-drop API.**
   - **R:** `webkitGetAsEntry()` only. One code path; every Chromium has it; `getAsFileSystemHandle()` adds nothing for read-only walking and returns promises that complicate the synchronous capture.
9. **Size target.** How many files and MB is a real cluster tree?
   - Proposed target: 3,000 files / 100 MB, planned within 15 s, with no main-thread task over 200 ms, and progress shown throughout.
   - Please give me real numbers, or confirm.
10. **Real files needed** *(mostly answered: see section 11)* (`test/fixtures/` only has one `gmx awh` file):
    - an RDF (`gmx rdf`);
    - a histogram (`gmx awh -hist` or `gmx wham`);
    - one more analysis, e.g. `gmx rms`;
    - a file whose command line is long enough to wrap, if GROMACS wraps it;
    - a non-PMF `gmx awh` output, if you have one (for R4).
    - The folder fixture needs the analysis file. Until I have real files, I won't invent headers.
11. **R1b.** Use the parsed tool (`gmx awh` → PMF) as header evidence in R4?
    - **R:** yes.
12. **Backlog item "the default file-name pattern reads the run letter as the sequence."** Your matrix rows are single amino acids (`s`, `t`, `r`, `a`…), and in the cluster path `…/ha/a/…` the `a` is the sequence. Is this backlog item still a bug, or should it be removed?
    - **R:** remove that half; keep the unreadable-`{run}` half (question 3).

### R2: tags

13. **Storage.**
    - Tag list in `.matrix/settings/<pid>/tags.json` as `{ tags: [{ k, label }] }`, like `analyses.json`.
    - Runs store `tags: string[]`, sorted unique keys.
    - Keys come from labels the way analysis keys do (`newAnalysis`).
    - **R:** as stated.
14. **Deleting a tag that runs use.**
    - (a) Say "used by N runs", then remove it from them. The run records change; there is no trash, since tags hold no data.
    - (b) Keep it on the runs as an unknown tag.
    - **R:** (a). Otherwise "delete" doesn't delete, and unknown tags pile up.
15. **Export format.**
    - (a) Bump to v5 (`tags` on runs, `settings.tags`); v3 and v4 still import.
    - (b) Stay at v4 with both fields.
    - **R:** (a).
16. **Creating a tag inline** from the upload dialog and run editor ("+ tag" → label → added to the project list).
    - **R:** yes.
17. **Upgrade mechanics.** Change `SchemaMigration` so a step *returns* its record writes. `Vault.upgrade` then backs up exactly those paths and writes them through the journal's commit point, together with the manifest bump. This makes half-upgrades impossible, and needs one recorded change to the existing injected-migration test.
    - **R:** yes.
18. **Row header label.** Relabel "Method · group" to "Group", so it doesn't compete with tags, which replace "methods"? Behaviour and the `{method}` token stay the same.
    - **R:** yes. A `{tag}` token: not now, agreed.

### R5: merges

19. **Fix the two verified problems inside R5** (same lines)? That is: renumber and move apply to the edited row *before* merging, and hidden flags move with merged runs.
    - **R:** yes. Otherwise the preview would describe surprising behaviour exactly.
20. **The twin's description is silently overwritten** (new finding).
    - (a) Join different non-empty descriptions, like notes.
    - (b) Keep the twin's.
    - (c) Keep today's behaviour and name it in the preview.
    - **R:** (a).

### R6: duplicates

21. **Scope.**
    - The current project's records.
    - This project's trash, mentioned separately ("a deleted copy is in the trash").
    - Attaching an untracked file: checked (it goes through the same paths).
    - Dataset JSON import: not checked, because re-importing an export is deliberate, and IDs already de-collide.
    - Not other projects.
    - **R:** as stated.
22. **Paths without a plan** ("+ curve from file", the structure panel, structures dropped on a cell): a native `confirm()` naming the identical file, "add anyway?". It is keyboard-usable and announced by the browser.
    - **R:** yes. Alternative: an inline confirm row (about 20 more lines per place).

### R7: drop onto a cell

23. **Empty-cell click keeps the row name too** (`keepName: true`), so several files go into that row's next slots. This is a behaviour change.
    - **R:** yes.
24. **Should a cell drop still read `{time}`, `{run}` and `{analysis}` from file names,** with row and column locked to the cell?
    - **R:** not now. It needs a third parse mode in `planBatch`; time and run can be typed in the form.
25. **`.pdb` / `.gro` dropped on a cell** attach to that row as structures, through code extracted from `StructurePanel`, with the R6 check. This confirms instantly, with no dialog.
    - **R:** yes.
26. **The sequence name as a drop target.**
    - **R:** no, for now.
27. **A folder dropped on a cell.**
    - **R:** refuse it with a message ("drop folders outside the cells to import them").

### Format and process

28. **Is a new optional settings key a format change?** `settingsBody` writes every project key, so `pathPattern` (R1c) appears in `settings.json`. An older build ignores it on read, but drops it when it next writes `settings.json`.
    - (a) Treat it as an additive key without a schema bump, but create the frozen fixtures before R1c (start of Phase 3), and let R2's 1 → 2 bump cover it formally.
    - (b) Bump the schema in R1c (then R2 is 2 → 3).
    - (c) Move `pathPattern` into Phase 4.
    - **R:** (a).
29. **Browser checks.** No Playwright dependency in the repository.
    - I'll run scratch Playwright scripts (outside the repo) against `npm run dev`, with the folder picker stubbed as I did for the vault work, and label those results "automated, picker stubbed".
    - The real folder picker, OS folder drops and native drags stay **not run**, for you to check.
    - **R:** yes. Cost to the repo: none.

## 11. Addendum: real files received (2026-10-05)

The user supplied five more real GROMACS outputs, unrelated to the PMF project. Together with the existing fixture, they give six real headers:

| File | Tool | Version | Executable | Title / y label | Data |
|---|---|---|---|---|---|
| `hmrfast6_ha_a_t200000.xvg` (existing) | `gmx awh` | `2025.4-PLUMED_spack` | `…/bin/gmx_mpi` | AWH / (kJ/mol) | 419 × 2 |
| `hist_500000.xvg` | `gmx wham` | `2022.3-plumed_2.8.1` | `…/bin/gmx_mpi_sse4.1` | Umbrella histograms / count | 200 × 22, no legends; x label `\xx\f{} (nm)` |
| `07.md_rdf_protein_sugar.xvg` | `gmx rdf` | `2021.4` | `…/bin/gmx_mpi_sse4.1` | Radial distribution / g(r); has `@ subtitle` | 1485 × 2 |
| `07.md_mindist_protein_sugar.xvg` | `gmx mindist` | `2021.4` | `…/bin/gmx_mpi_sse4.1` | Minimum Distance / Distance (nm) | 5001 × 2 |
| `07.md_numcont_protein_sugar.xvg` | `gmx mindist` | `2021.4` | `…/bin/gmx_mpi_sse4.1` | Number of Contacts < 0.6 nm / Number | 5001 × 2 |
| `07.md_hbdist_protein_sugar.xvg` | `gmx hbond` | `2021.4-PLUMED-spack` | `…/bin/gmx_mpi` | Hydrogen Bond Distribution / (empty) | 70 × 2 |

**What this settles for the header parser (R1a):**
- Versions come in several forms: plain (`2021.4`), and suffixed with `-PLUMED_spack`, `-PLUMED-spack` or `-plumed_2.8.1`. The version is the text between the tool's comma and ` (-:`, kept verbatim.
- The leading whitespace before `:-) GROMACS - ` varies. Executable names include `gmx_mpi_sse4.1`.
- Command lines contain quoted arguments (`-ref 'group 28'`), and are kept verbatim.
- GROMACS did not wrap any command line. The longest is 286 characters (`gmx wham`), on one line. The parser still joins continuation lines, as planned, but no test pretends to have a wrapped one.
- After `# gmx <tool> is part of G R O M A C S:` comes a quip block (`# Grunge ROck MAChoS`). Ending the command at the "part of" line excludes it.
- Working directories show a second real layout: `…/tArg+O127/simulations/07_md`, with the peptide and the polysaccharide in one folder name. Partial-segment tokens handle it, e.g. `{seq}+{column}/simulations/{*}`. This is a good test case for R1c.

**What it shows about type detection (R4), with today's `detectAna`:**
- `hist_500000` → `hist`, `rdf` → `rdf`, `mindist` → `dist`, `hbdist` → `hbond`. All are header-only hits, so the R4 change keeps them (now labelled "header").
- **`numcont` (Number of Contacts) → PMF.** No analysis keyword matches, so it falls back to PMF and would land in the matrix as a free-energy profile. R4 as specified keeps that fallback. See question 30.

**Still missing for question 10:** a non-PMF `gmx awh` output (e.g. `-fric`), if one exists. It only matters for the "title `AWH` → PMF" rule.

### New questions

30. **Unknown analyses default to PMF.** A file whose header names a GROMACS tool other than `gmx awh` (here `gmx mindist`), and that matches no analysis, is filed as a PMF.
    - (a) After R1a: such a file is not PMF; the plan marks it "unknown analysis — choose one or define a new one" and doesn't upload it until resolved.
    - (b) Keep the PMF fallback.
    - **R:** (a), as part of R1b. Files without a GROMACS header keep today's fallback.
31. **Fixtures.** Commit the five files unchanged to `test/fixtures/gmx/` (about 345 KB in total; the two `mindist` files are about 125 KB each).
    - (a) As-is: real and byte-identical.
    - (b) Trim the data rows of the two large files, which would no longer be real files.
    - **R:** (a). They would be committed with the first item that uses them (R4), not in a Phase 0 commit.
