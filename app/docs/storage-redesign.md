# Task: Redesign persistence around a user-owned project directory (vault)

Redesign the application's persistence layer so that a **user-selected local directory is the authoritative project store** (the "vault").

Today, application state lives in `localStorage` and structure-file contents live in IndexedDB. Replace both with a filesystem-first architecture inspired by Obsidian's vault model:

- the user-owned folder is the vault
- ordinary, visible files hold user data (notes, original uploaded files)
- one hidden application directory holds metadata, settings, trash and cache
- derived indexes and caches are disposable
- the filesystem is the source of truth

Use Obsidian as the philosophy, not as code to copy. Adapt it to this application's actual domain model.

---

## 0. How to work on this task

Work in phases. Save this spec as `docs/storage-redesign.md` if it isn't already there. Record every design decision, with a one-line rationale, in `docs/storage-decisions.md` so the plan survives across sessions.

### Phase 0: Investigate and plan (no code changes)

Read the codebase and produce the following.

1. **Entity mapping.** One row per existing entity or piece of state:

   ```text
   Existing entity/state → New location → File format → Stable ID → Authority (which file wins) → How it is loaded/saved
   ```

   Cover at least: sequences/rows, columns, pages (if they exist), runs, extra analyses, curves, structures (`.pdb` / `.gro`), uploaded XVG data, row notes, cell notes, literature references, visibility/UI state, and application settings.

2. **Placeholder mapping.** Explain how `{project}`, `{page}`, `{column}`, `{row}` and `{analysis}` (section 3) correspond to real entities.
   - If a level has no equivalent, say so and propose an alternative. Do not invent an entity.
   - Say where runs and structures go.
   - Row directories live under column directories, so data that spans a whole row across all columns (e.g. row notes) needs a home outside any single column directory. Propose one.

3. **Upload inventory.** List every upload path in the app: file inputs, drag-and-drop, paste, import. For each one, state:
   - which file types it accepts
   - whether the current code keeps the original bytes or only the parsed results

   This determines what migration can recover.

4. **Settings split.** Divide the current settings (`pmf-seq-settings-v1` and anything else) into project settings and browser-global UI preferences.

5. **Feasibility check.** Confirm that the File System Access API approach in section 2 works for this codebase: Vite config, secure context, target browsers. Also report whether a test framework exists.

6. **Open decisions.** List every open decision, each with your recommendation.

**Then STOP and wait for my approval.** Do not start Phase 1 until I reply.

### Phase 1: Storage layer

Build `src/lib/storage/` with:
- the backend interface
- the in-memory and Node adapters
- the File System Access adapter
- tests

No UI changes yet.

### Phase 2: Wire the application

Connect the UI to the storage service. Remove `localStorage`/IndexedDB project persistence. Add the UI to open, create and reconnect a vault.

### Phase 3: Migration

Build the legacy import, plus headless verification against a fixture.

### Phase 4: Finish

README, lint, build, tests, and the final report (section 20).

### At the end of each phase from 1 onward

1. Run `npm run lint`, `npm run build` and the tests.
2. Commit with a descriptive message.
3. Give a short summary.
4. Continue to the next phase.

If you discover something that contradicts the approved plan, stop and ask instead of continuing.

---

## 1. Core principles

The vault directory is the **single source of truth**.

- React state is a runtime view loaded from the vault.
- `localStorage`, IndexedDB and in-memory caches are never the source of truth for project data.
- Caches and indexes are allowed only if they can be rebuilt from durable files. They live only in `.matrix/cache/`.

A user must be able to do all of the following without any browser storage:
- close the app
- copy or move the folder to another computer
- put it in Git
- back it up
- inspect it with a file manager and a text editor
- reopen it

---

## 2. Target environment

**API.** Target Chromium-based browsers (Chrome, Edge) using the **File System Access API** (`showDirectoryPicker`, `FileSystemDirectoryHandle`, `createWritable`). Feature-detect it.

**Unsupported browsers.**
- Show a clear explanation screen.
- Do **not** fall back to `localStorage`, IndexedDB or OPFS for project data.
- Opening a JSON export in a clearly labelled, unsaved, in-memory session is acceptable.

**Allowed exception for vault handles.**
- The `FileSystemDirectoryHandle`s of recently opened vaults may be stored in IndexedDB, because handles cannot be persisted any other way.
- This is session state only (which vault to reopen), never project data.
- Keep it in one small, separate database and document it.

**Reconnecting after a reload.** After a reload, permission is usually not granted.
- Check with `queryPermission`.
- If it returns `prompt`, show a "Reconnect to ‹vault name›" button.
- The button calls `requestPermission({ mode: 'readwrite' })` on the user's click.

**Permission loss or write failure mid-session.**
- Stop writing.
- Keep unsaved changes in memory.
- Show a persistent banner.
- Retry after the user reconnects.
- Never silently drop changes.

**Platform.** Do not switch to Tauri or Electron. If Phase 0 shows that the File System Access API cannot meet this spec, report why and stop.

---

## 3. Vault layout

User data is visible. Application data is hidden in one directory, `.matrix/`.

```text
MyProject/                         ← vault root, chosen by the user
├── .matrix/                       ← all application-owned data
│   ├── manifest.json              ← identity + format version (section 5)
│   ├── records/                   ← durable entity metadata, JSON (section 5)
│   ├── settings/                  ← project settings (section 7)
│   ├── trash/                     ← recoverable deleted items (section 9)
│   ├── journal/                   ← in-progress multi-step operations; empty when idle
│   ├── cache/                     ← disposable derived data; safe to delete (section 8)
│   └── .gitignore                 ← contains "cache/"
│
└── {project}/
    ├── note.md
    └── {page}/
        ├── note.md
        └── {column}/
            ├── note.md
            └── {row}/
                ├── note.md
                ├── <original uploaded files, e.g. model.pdb, pmf.xvg>
                └── {analysis}/
                    ├── note.md
                    └── <original uploaded files for this analysis>
```

Rules for the layout:
- The placeholders are illustrative. Their real meaning comes from Phase 0. Do not create literal `{row}` directories.
- Visible directory names use the format `human-readable-slug--stable-id` (section 10).
- Don't create empty `note.md` files. A note file exists only when the note has content, but its path is still deterministic.
- The `.gitignore` goes inside `.matrix/`. Never create or modify a `.gitignore` at the vault root.

---

## 4. Original uploaded files (hard requirement)

**Every file the user uploads must be stored in the vault as an ordinary, visible file, byte-for-byte identical to what was uploaded.** This applies to PDB, GRO, XVG and any other format that any upload path accepts, now or in the future.

**How to write it.** Write the `File`/`Blob` directly. Never:
- round-trip it through a string
- normalize line endings or encoding
- trim it
- re-serialize it from parsed data

**Where it goes.** Store it in the visible tree next to the entity it belongs to, under its original filename, sanitized according to section 10. On a name collision, add a suffix rather than overwrite.

**Metadata to record:**
- original filename (unsanitized)
- stored relative path
- size
- SHA-256
- upload timestamp
- type
- owning entity ID

**Parsed results are derived.** Parsed XVG series, structure models and similar data go in `.matrix/cache/`. Key them by the source file's SHA-256 plus the parser version. They can always be recomputed from the original.

**Replacing and deleting.**
- Replacing or re-uploading a file moves the previous original to trash (section 9). Nothing is overwritten in place.
- Deleting an entity moves its originals to trash with it.

**Loading.** Large files are never loaded at startup, only on demand.

**Testing.** Tests must verify that the SHA-256 is identical after upload → save → close → reopen → read.

---

## 5. Durable metadata: `.matrix/`

### `manifest.json`

Contains at least:
- application identifier
- storage format identifier
- schema version
- stable project ID
- creation timestamp
- last-modified timestamp
- migration provenance, if applicable (`migratedFrom`, `migratedAt`)

### Schema versioning

- **Older vault, newer app:** upgrade it using explicit, tested schema migrations. Before upgrading, back up the affected `.matrix/` files into `.matrix/trash/`.
- **Newer vault, older app:** open it read-only and tell the user why.

### `records/`

Holds entity metadata: names, ordering, relationships, analysis parameters, visibility state, literature references, and file metadata (section 4).

- **Granularity:** not one giant JSON blob. Changing one entity must not rewrite unrelated files. Choose the granularity in Phase 0 (e.g. one file per entity, or one per row including its runs and analyses) and justify it.
- **Contents:** each record stores the entity's stable ID and, if it has a visible directory, that directory's relative path.
- **Git-friendly output:**
  - Write JSON with stable key order, 2-space indentation and a trailing newline.
  - Don't rewrite a file whose content hasn't changed.

---

## 6. Notes

**Format and location.**
- Notes are plain Markdown files in the visible tree.
- A note normally lives as `note.md` in its owning entity's directory.
- Entities without a directory of their own (such as row-wide notes) use the location decided in Phase 0.

**Paths.** Use deterministic paths for project, page, column, row, cell and analysis notes, as they apply to the real model.

**Frontmatter.**
- Keep it minimal: `id`, `type` and the owning entity's ID.
- No auto-updated `modified` timestamps in frontmatter, because they create noise in Git.

**Authority.** The `.md` file is the authority for the note's text. Edits made outside the app must show up in the app.

**Robustness.** Tolerate notes with missing or broken frontmatter. Identify them by their location, and repair the frontmatter only when the note is next saved.

---

## 7. Settings

**Project settings** live in `.matrix/settings/`, for example `settings.json`, `columns.json` and `analyses.json`, as appropriate.

**Global UI preferences** (e.g. theme) may stay in `localStorage`, but only if they are purely browser-global. List exactly which ones in Phase 0.

Anything that affects how project data is displayed or computed belongs to the project.

---

## 8. Cache and index

`.matrix/cache/` holds only derived data, for example:
- parsed XVG
- computed results
- thumbnails
- the lookup index (`index.json`)

The app must work correctly if `cache/` is missing, empty, stale or corrupt: detect it, rebuild, continue.

Every cache entry records what it was derived from (source hash, parser or schema version) so staleness can be detected.

---

## 9. Deletion and trash

**Deleting.** Move the entity's visible directory and its records into `.matrix/trash/<timestamp>--<type>--<id>/`. Use a filesystem-safe timestamp, e.g. `20261003T024300Z`.

Each trash item gets a `trash-manifest.json` containing:
- the original relative paths
- the records as they were
- parent IDs
- the deletion timestamp
- the schema version

**Restoring.**
- Restore puts everything back in its original location.
- If that location is occupied, or the parent no longer exists, restore to a defined fallback location and tell the user.
- Restore must work through the API and be covered by tests. A minimal UI is enough.

**Permanent deletion** is a separate, explicit action with confirmation: empty the whole trash, or delete a single trash item.

---

## 10. Stable IDs, naming and paths

**Stable IDs.** Every important entity has a stable ID: project, page, column, row, run, analysis, curve, structure, uploaded file, literature reference, note.
- If the prototype's existing IDs are stable, preserve them.
- Otherwise, assign IDs during migration.

**Paths are locations; IDs are identity.** Renaming or moving an entity never changes its ID.

**Rename policy.**
- Visible directory names follow renames: `old-slug--id` becomes `new-slug--id`.
- The loader always resolves directories by the `--id` suffix, never by the slug, so a stale slug is harmless.
- If an entity's directory is found somewhere other than where its record says (for example, because the user moved it), relink it by ID.

**Centralized path module.** One module, `path.ts`, handles every name → path conversion. It must handle:
- Unicode NFC normalization
- illegal characters (`<>:"/\|?*` and control characters)
- trailing dots and spaces
- Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`)
- case-insensitive collisions
- empty results
- a slug length limit, keeping total paths well within Windows limits

No other module builds paths from user strings.

---

## 11. Authority and consistency rules

| Data | Authority |
|---|---|
| Note text | the `.md` file |
| Original uploaded file content | the file in the visible tree |
| Entity existence, names, order, relationships, parameters, file metadata | `.matrix/records/` |
| Project identity and format version | `.matrix/manifest.json` |
| Project settings | `.matrix/settings/` |
| Anything in `.matrix/cache/` | nothing — it is derived |

Situations to handle on load:

- **Record points to a missing file.** Show the entity in a "missing file" state. Never delete the record automatically.
- **File with no record.** For example, the user dropped an XVG into a folder by hand. Show it as an "untracked file" with options to attach it or ignore it. Never delete it automatically.
- **Two directories with the same ID.** For example, after an interrupted rename. Treat it as a conflict and report it. Don't guess.

---

## 12. Writes: atomicity, ordering, queueing

### Single-file writes

Rely on `createWritable()` semantics: data is committed on `close()`, so an interrupted write leaves the previous version intact. Always call `close()` or `abort()`.

### Multi-file operations

This covers creating an entity, rename/move, delete, restore, replacing a file, and migration. Always use this order:

1. Write the new content files.
2. Write or update the records. This is the **commit point**.
3. Remove old files.
4. Update the cache and index.

**Journal.**
- Before step 1, write an intent entry in `.matrix/journal/`.
- After step 4, remove it.
- On open, any leftover journal entry is either completed or rolled back.

**Directory moves.** When a directory move ends up as copy + delete, verify the copy (size or hash) before deleting the source.

### Write queue

- All writes go through one serialized write queue.
- Note edits are debounced (about 500–1000 ms).
- Pending note edits are flushed on blur and on `visibilitychange`.

Document these rules in the README.

---

## 13. External modifications and concurrency

**Tracking.** For every file the app has read, keep its last-known `lastModified` and size. For text files, also keep a content hash.

**Read-before-write.** Before overwriting a text file, check it again.
- If it changed externally and there are no local changes, reload it instead of overwriting.
- If it changed externally and there are local changes, keep both versions: write the local version as a conflict copy next to the original, and tell the user.

**Re-checking.**
- Re-check files when the window regains focus.
- Offer a "Reload from disk" action.
- `FileSystemObserver` may be used as a progressive enhancement if it is available, but correctness must not depend on it.

**Concurrency.**
- Prevent two tabs of the app from writing to the same vault at once, e.g. with the Web Locks API keyed by project ID.
- Writes from another machine are covered by conflict detection only.

---

## 14. Loading strategy

Load in this order:

1. `manifest.json`
2. records
3. index (rebuild it if missing or stale)
4. the visible matrix

Notes load lazily or in the background. Original structure/XVG files and parsed data load on demand.

Caches only improve performance, never correctness.

---

## 15. Code architecture

Create a storage layer with no React dependency:

```text
src/lib/storage/
├── backend/
│   ├── types.ts        ← StorageBackend interface: read/write (text + binary), stat, list, mkdir, move, remove
│   ├── fsAccess.ts     ← File System Access API implementation (browser)
│   └── memory.ts       ← in-memory implementation (tests)
├── vault.ts            ← open/create/close, permissions, locking
├── manifest.ts
├── records.ts
├── notes.ts
├── files.ts            ← original uploaded files
├── trash.ts
├── settings.ts
├── cache.ts
├── index.ts
├── journal.ts
├── path.ts
└── migration/
    ├── legacy.ts       ← the ONLY code that reads localStorage/IndexedDB prototype data
    └── migrate.ts
```

A Node `fs` implementation of `StorageBackend` lives outside the browser bundle, e.g. in `scripts/` or `test/`. It is used for tests and headless migration.

The rest of the app talks to a project service, for example:

```ts
project.open()                    project.close()
project.getRow(id)                project.saveRow(row)
project.getNote(id)               project.saveNote(note)
project.saveUpload(entityId, file)  project.readUpload(id)
project.delete(ref)               project.restore(trashId)
```

Components such as `Matrix.tsx`, `DetailDialog.tsx` and `StructurePanel.tsx` must not know how or where files are stored.

---

## 16. Migration from the prototype

Legacy storage:

```text
localStorage: pmf-seq-store-v1, pmf-seq-settings-v1
IndexedDB:    pmf-seq-structures
```

Migration flow:

1. Detect legacy data on startup.
2. Offer migration. The user picks or creates an **empty** directory. Refuse a non-empty directory unless it is an existing vault and the user confirms.
3. Convert the data:
   - the store into records
   - notes into Markdown
   - settings into project settings and global preferences, per the Phase 0 split
4. Write the structure contents from IndexedDB as files, with metadata `origin: "migrated-from-indexeddb"`.
5. If the prototype kept only parsed XVG data and not the original files:
   - write a reconstructed file with a distinguishable name and metadata `origin: "reconstructed"`
   - list it in the migration report
   - never present reconstructed data as original
6. Write the manifest with migration provenance, and build the index.
7. **Verify.** Reopen the vault from disk with a fresh load and compare it against the legacy data. Check entity counts, IDs, note text, settings, literature, runs, analyses, curves and structure content.
8. Show a migration report: counts, warnings, reconstructed files.
9. Never delete or modify the legacy browser data. Removing it is a separate, explicit action, available only after a successful verification.

**JSON export/import** keeps working as a compatibility path:
- Export reflects the current vault state.
- Import writes into the open vault, preserving IDs where they don't collide.

---

## 17. Testing

Use Vitest. If it is missing, add it along with an `npm test` script. Run tests against the in-memory backend, and against the Node backend for migration.

The tests cover:

- **Serialization:** round-trips for records, notes and settings.
- **Reopening:** create → save → close → reopen gives an identical project.
- **Original files:** byte-identical (same SHA-256) after save and reopen.
- **Rename:**
  - the ID stays the same
  - the directory slug updates
  - the loader resolves the directory by ID
- **Interrupted operations:** an interrupted rename/move, simulated via the journal, recovers correctly.
- **Trash:** delete → trash → restore, including the fallback when the original location is occupied.
- **Cache independence:** deleting `cache/` entirely and reopening gives an identical project.
- **Cache rebuilding:** a stale or corrupt cache and a missing index are rebuilt.
- **External edits:** an external modification is detected and not overwritten.
- **Load states:** the missing-file and untracked-file states.
- **Paths:** `path.ts` edge cases, as table-driven tests.
- **Schema versions:** an older vault is upgraded; a newer vault opens read-only.
- **Migration:** a legacy fixture migrates end to end, including verification.

Build a realistic legacy fixture that mimics the `localStorage` keys and IndexedDB contents. If a real dump of my data would help, say so in Phase 0 and give me a snippet that produces it.

---

## 18. Scope limits

This is a persistence redesign. Do not change:
- PMF calculations
- XVG parsing logic
- plotting
- the 3D viewer
- literature lookup
- unrelated UI

Changes in those areas are allowed only where the storage model requires them, and each one must be recorded in `docs/storage-decisions.md`.

All existing user-facing functionality must keep working: matrix, analyses/curves, structures, literature, notes, exports and settings.

---

## 19. Acceptance criteria

- **A. No authoritative browser persistence.** Project data never lives in `localStorage` or IndexedDB. The only browser storage left is the vault handle and the global UI preferences listed in Phase 0.
- **B. Copyable.** A copied vault directory is self-contained and opens elsewhere.
- **C. Reopenable.** Closing and reopening gives the same project.
- **D. Inspectable.** Notes and original files are visible, ordinary files. A technical user can understand `.matrix/` by reading it.
- **E. Original files.** Every uploaded file is present, byte-for-byte, in the visible tree.
- **F. Recoverable deletion.** Deleted items go to trash and can be restored.
- **G. Cache independence.** Deleting `.matrix/cache/` loses nothing.
- **H. Stable IDs.** Renames and moves never change identity.
- **I. Migration.** Legacy data migrates without losing notes, structures, runs, analyses, curves, literature, columns or settings, and it is verified before it counts as successful.
- **J. Robustness.** Permission loss, write failures, external edits and unsupported browsers are all handled explicitly.
- **K. Build quality.** `npm run lint`, `npm run build` and `npm test` all pass.

---

## 20. Final report

1. Run the headless migration on the fixture using the Node backend.
2. Show the resulting vault with `tree -a` (or an equivalent listing), and explain what each directory and file type is responsible for.
3. Include one example of each of the following:
   - `manifest.json`
   - a record file
   - a `note.md` with frontmatter
   - a trash entry
   - a cache entry
4. Update the README to document:
   - the vault format
   - the authority rules
   - the write ordering
   - the browser requirements
