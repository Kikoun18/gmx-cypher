# Task: Feature batch 1 — folder import, tags and safer uploads

PMF Sequences is a Vite + React + TypeScript app that keeps each project in a user-owned folder (the **vault**). The vault redesign is finished and documented in `app/README.md`, `app/docs/storage-redesign.md` and `app/docs/storage-decisions.md` (decisions D1–D46). Read all three before anything else.

This task adds seven requested changes on top of the vault — four features and three fixes — without weakening any guarantee the vault gives:

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | Import whole folders with customisable path patterns; keep GROMACS provenance | feature | 5 |
| R2 | Methods become editable tags | feature | 6 |
| R3 | Clean up leftovers from the browser-storage prototype | fix | 7 |
| R4 | The file's header beats its file name when guessing the type | fix | 8 |
| R5 | Say what a row merge will drop before it happens | fix | 9 |
| R6 | Warn about duplicate files | feature | 10 |
| R7 | Drop a file onto a matrix cell | feature | 11 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

Where this spec says **verified**, the behaviour was checked against the code at the baseline commit. Confirm it anyway; if the code has changed, say so.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `app/` (the codebase) next to `README.md`, `chats/` and `project/` from the original design handoff. Those three are history: don't follow the root `README.md`'s instructions, and don't change them.
- **Every path and every `npm` command in this spec is relative to `app/`.**
- Work on a new branch, `feature-batch-1`, from the current `vault-storage` HEAD. Record that commit's hash in the Phase 0 report as the baseline.
- Baseline when this spec was written: `npm run lint` passes with 7 warnings (`react(only-export-components)`), `npm run build` passes with one warning (direct `eval` inside 3Dmol), and `npm test` passes 79 tests. Tests run in Node (no DOM).

### 0.2 Living documents

- Save this spec as `docs/feature-batch-1.md`.
- Keep `docs/roadmap.md`: the checklist in section 3. Tick items as they are done, and add any new item you discover under the right phase or under **Backlog**.
- Record every decision in `docs/feature-decisions.md` as `F1`, `F2`, …, each with a one-line rationale. Use the same style as `docs/storage-decisions.md`.
- Finish with `docs/feature-batch-1-report.md` (section 16).

### 0.3 Phase 0: Investigate and plan (no code changes)

Scratch scripts and throwaway tests are fine, but keep them outside the repository or delete them. Only the Phase 0 documents are committed.

1. **Baseline.** Run `npm run lint`, `npm run build` and `npm test`. Record the results, the test count and the warning counts. If anything fails, or the numbers differ from section 0.1, stop and tell me.
2. **For each request R1–R7**, write:
   - **Current behaviour.** What the code does today, with file and function references. Verify it by reading the code, and where practical by running it. If this spec is wrong about the code, say so.
   - **Proposed change.** The smallest change that meets the requirements. Name every file you will touch.
   - **Code budget.** Estimated lines added and removed.
   - **On-disk impact.** Does it change records, settings, manifest, cache or the export format? If yes, give the schema and migration plan (section 1.3).
   - **Tests.** The tests you will write, by name.
   - **Risks.** Including interactions with the other requests.
   - **Open questions.** Each with options and your recommendation.
3. **Order.** Confirm the roadmap order in section 3, or propose a better one with reasons.
4. Put all open questions into **one numbered list** at the end of the Phase 0 report.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–4: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them and see them fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.** Simplify it, delete anything that became dead, match the surrounding naming and style, and remove debug output.
5. Run `npm run lint`, `npm run build` and `npm test`. All pass, with no new warnings.
6. Run the item's manual checks in Chrome (`npm run dev`) and watch the console. If you can't drive a browser, or a check needs a real user gesture (the folder picker does), mark it **not run** and list it for me. Never report a manual check as passed unless you ran it.
7. Update `docs/roadmap.md` and `docs/feature-decisions.md`.
8. Commit (section 15).
9. Give me a short summary (3–5 lines): what changed, net lines added or removed, tests added, manual checks run or not run, and anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or UI;
- a change would alter the vault's on-disk format or the export format;
- anything could delete, overwrite, merge or hide user data;
- the code contradicts this spec or the approved plan;
- a request would exceed its code budget by more than about 50 %;
- you want to add a dependency;
- a test needs real GROMACS output that isn't in `test/fixtures/`.

Batch your questions where you can, and give each one options and a recommendation. Don't ask about things the code, the docs or this spec already settle.

---

## 1. Principles

### 1.1 Minimal, concise code

- Make the smallest correct change. Extend an existing function before adding a new one. Add a new module or abstraction only when at least two places use it.
- Follow the existing architecture:
  - data edits are pure `Store → Store` transforms in `src/lib/seq.ts`;
  - persistence goes through `ProjectService` (`src/lib/storage/project.ts`), and components never know where files live;
  - every name → path rule stays in `src/lib/storage/path.ts`;
  - derived data goes in `.matrix/cache/` via `src/lib/storage/cache.ts`.
- **No new runtime dependencies.** Add dev dependencies only with my approval.
- Delete code that becomes unused. No commented-out code, and no `TODO` without a roadmap entry.
- Match the surrounding style. Don't reformat unrelated code. Don't restyle the app; the inline-style approach stays as it is for now.
- Prefer clarity to cleverness: short functions, and names that use the app's own domain words (row, column, run, slot, analysis, curve).
- Report the net lines added or removed for every item.

### 1.2 Web development practice (for any new or changed UI)

- Use semantic elements: `<button>` for actions, and `<label>` tied to every input.
- Everything is reachable and operable by keyboard, with a visible focus. Anything done by drag-and-drop also has a click or keyboard path.
- Warnings and status messages are announced (`aria-live="polite"`) and never shown by colour alone.
- Text contrast is at least 4.5:1. The existing accent red on the light background is only 3.75:1, so don't use it for new body text.
- Read-only vaults and the JSON viewer show no editing controls.
- Any new keyboard handling never fires while focus is in an `input`, `textarea`, `select` or `contenteditable`, and doesn't clash with the existing keys: the compare key (C), the laser key (K), the arrow keys and Esc.
- The layout works at 1024 px wide and new UI causes no layout shift.
- No new console errors or warnings.

### 1.3 Data practice

- **Originals are authoritative and byte-identical.** Never modify an uploaded file.
- **Anything derivable from an original is derived data.** That includes parsed headers and provenance. It belongs in `.matrix/cache/`, keyed by SHA-256 plus a parser version, unless a recorded decision says otherwise. If a parser's output changes, bump its version in `PARSER` (`cache.ts`).
- **No silent data loss.** Anything that drops, replaces, merges or hides data says what, and how much, before it happens. Removed originals go to the trash.
- **On-disk format changes** (records, settings, manifest) need all of the following:
  - a bump of `SCHEMA_VERSION` (`records.ts`);
  - an explicit, tested step in `MIGRATIONS` (`manifest.ts`), with the existing backup to the trash;
  - tests for old vault → upgraded, and newer vault → read-only;
  - dataset JSON export and import (`exchange.ts`) that still round-trip, with older exports still importing.
- **Old formats are tested against frozen fixtures.** Before the first change to records, settings or the export format, generate with the unchanged code: a schema-1 vault tree, a v4 export and a v3 export, each with runs that carry `methods`. Commit them under `test/fixtures/` in their own commit, and never regenerate them. Once the types change, the test helpers can no longer produce the old formats.
- **Determinism.** The same input gives the same output: stable key order, stable sort order, and pure parsers.
- **Provenance is shown as recorded, never guessed.** A missing field shows as missing. Dates stay as the text in the file; no time zone is assumed.
- **Parsers are tested against real GROMACS output.** Don't invent header formats you haven't seen. If you need more real files (RDF, RMSD, histograms, a long command line), ask me; I can supply them from the cluster.

---

## 2. Scope limits

Do not change:
- the PMF maths (`pmf.ts`)
- plotting, matrix colours, the 3D viewer or literature lookup
- any guarantee of the vault (`README.md`, sections *Authority rules* and *Write ordering*)

Undo/redo is **not** part of this batch. Don't build it, and don't add infrastructure for it.

Do not fix other known bugs in this batch (they are listed under **Backlog** in the roadmap). If a request touches the same lines as one of them, tell me and ask. Bugs you find along the way go into the backlog, not into the code.

All existing functionality keeps working. All existing tests keep passing. Change an existing test only with a recorded reason.

---

## 3. Roadmap

Copy this into `docs/roadmap.md` and keep it current.

**Why this order:**
- small, contained fixes come first, to learn the code and the test harness;
- upload safety comes next, because R1 builds on the same upload flow;
- tags change the on-disk format, so they come last, in their own phase.

### Phase 0: Plan
- [ ] Branch created; baseline commit, lint, build and test results recorded
- [ ] Phase 0 report for R1–R7
- [ ] Questions answered; decisions F1… recorded
- [ ] Roadmap order confirmed

### Phase 1: Small fixes (no on-disk change)
- [ ] R3 Remove prototype leftovers
- [ ] R4 Header evidence beats file-name keywords
- [ ] R5 Merge preview: count and list what will be dropped

### Phase 2: Upload safety
- [ ] R6 Duplicate warning on every upload path
- [ ] R7 Drop files onto a matrix cell

### Phase 3: Folder import and provenance
- [ ] R1a GROMACS header parser: version, tool, command line, working directory, creation date
- [ ] R1b Optional: R4 also uses the parsed tool name (`gmx awh` → PMF), if approved
- [ ] R1c Path pattern setting, with a live tester in Settings
- [ ] R1d Folder choose-and-drop, with relative paths in the upload plan and R6's duplicate check
- [ ] R1e Provenance shown on run cards

### Phase 4: Tags
- [ ] R2-0 Frozen old-format fixtures committed (section 1.3), unless an earlier phase already changed the format
- [ ] R2a Project tag list in settings, editable like analyses
- [ ] R2b Runs carry tags; schema migration from `methods` to tags
- [ ] R2c Upload dialog, run editor and labels use tags; export, import and legacy migration updated

### Phase 5: Finish
- [ ] README updated
- [ ] Manual QA checklist run in Chrome; results recorded (passed, failed or not run)
- [ ] Fresh-context review of the whole batch diff against section 13 (a reviewer that didn't write the code); findings fixed or recorded
- [ ] Final report `docs/feature-batch-1-report.md`

### Backlog (not in this batch; from an earlier review)
- Undo/redo: deferred by decision. It needs undo-aware handling of the trash, uploads and background store patches.
- Moving a hidden run in the run editor (`updateRun`) leaves the "hidden" flag on the old slot.
- Deleting a hidden run leaves the flag on the empty slot, so the next run uploaded there starts hidden (`visOf` persists it).
- Axis tick labels are rounded to fixed decimals: ticks at 0.25 steps read "0.3, 0.8, 1.3", including in exports (`buildPlotMulti`).
- Importing a dataset JSON permanently overwrites newer local notes (`importJSON`).
- Column keys are not capped at 24 characters, although D11 says they are (`newColumn`).
- The default file-name pattern reads the run letter as the sequence; an unreadable `{run}` falls back to run 1.
- Accessibility: dialogs don't take or keep focus; the viewer start screen isn't keyboard-usable; accent-red contrast is 3.75:1.
- Fonts load from Google Fonts and jsDelivr at runtime; they should be self-hosted.

---

## 4. Files you will mostly work in

| Area | Where |
|---|---|
| Store transforms, name patterns, type detection, xvg parsing | `src/lib/seq.ts` (`parseName`, `TOKENS`, `detectAna`, `parseTable`, `planBatch`, `addBatch`, `updateSeq`, `remapRuns`, `moveCell`, `METHODS`, `methodLabel`) |
| Types | `src/lib/types.ts`, `src/lib/storage/records.ts` |
| Persistence | `src/lib/storage/project.ts` (`commit`, `fileMeta`, `restore`), `plan.ts`, `files.ts`, `cache.ts`, `manifest.ts` (`MIGRATIONS`), `vault.ts` (`upgrade`), `exchange.ts`, `migration/migrate.ts` |
| App shell, drops | `src/App.tsx` (`commit`, `readFiles`, `onDrop`, `onDragOver`, `blankForm`) |
| UI | `UploadDialog.tsx`, `DetailDialog.tsx` (`EditPanel`, `RunEditor`, `formFor`, `addCurveFile`), `Matrix.tsx` (`Row`), `SettingsDialog.tsx` (pattern tester, Analyses section), `StructurePanel.tsx` |
| Tests | `test/` (Vitest in Node, `MemoryBackend`, Node backend in `scripts/node-backend.ts`, helpers in `test/helpers.ts`) |

---

## 5. R1: Import whole folders with path patterns, and keep provenance

### Today

File names are matched by `parseName(filename, pattern)` against one project setting, `pattern` (default `{method}_{column}_{seq}_t{time}.xvg`). It builds a case-insensitive regular expression with one lazy group per token. Cluster output is organised by folders, so most of the meaning is in the path, not in the name:

```text
hmr+fast+6/ha/a/9.multiwalker/1/awh_t200000.xvg
```

Every GROMACS xvg header also records where the file came from (from `test/fixtures/hmrfast6_ha_a_t200000.xvg`):

```text
# This file was created Mon Sep 21 12:27:52 2026
# Created by:
#                 :-) GROMACS - gmx awh, 2025.4-PLUMED_spack (-:
#
# Executable:   /cvmfs/software.metacentrum.cz/…/gromacs-2025.4-…/bin/gmx_mpi
# Data prefix:  /cvmfs/software.metacentrum.cz/…/gromacs-2025.4-…
# Working dir:  /mnt/storage-brno14-ceitec/shared/softmatter/SHARED/forKrystof/walkers_for_denys/hmr+fast+6/ha/a/9.multiwalker/1
# Command line:
#   gmx_mpi awh -f 9.multiwalker.edr -s 9.multiwalker.tpr -o 9.multiwalker.xvg -skip 5
# gmx awh is part of G R O M A C S:
```

`parseTable` skips every `#` line, so all of this is lost.

**Verified:** `{run}` is read with `parseInt`, so a folder named `9.multiwalker` reads as run 9, and anything unreadable becomes run 1 (a backlog item). Folder import will hit this all the time. Phase 0 proposes what an unreadable `{run}` in a path does (recommendation: a conflict shown in the plan, not run 1), and asks, because it touches a backlog item.

### Requirements

1. **Path pattern.** Add a project setting next to `pattern` that matches a file's path relative to the chosen or dropped folder.
   - It uses the same tokens as `TOKENS` (`{method}`, `{column}`, `{seq}`, `{name}`, `{run}`, `{time}`, `{temp}`, `{analysis}`, `{*}`), plus `**` for zero or more folders, e.g. `{method}/{column}/{run}/**`. Don't add a bare `*`; `{*}` already exists.
   - Phase 0 decides whether the path pattern matches only the folders, leaving the file name to the existing file-name pattern (recommended: one way to match a name), or the whole path.
   - Matching rules (case, separators, partial segments) follow `parseName`. Write them down as a decision.
   - Fields from the path and from the file-name pattern combine. When they disagree, the upload plan shows the conflict and the file isn't uploaded until it's resolved. Don't pick a winner silently. "Disagree" means different after the normalisation each field gets anyway (column through `matchCol`, sequence upper-cased, run as a slot), so `ha` and `HA` agree.
   - The path-pattern logic lives next to `parseName`. Reuse it; don't duplicate it.
2. **Settings tester.** Extend the existing file-name tester in Settings so it also shows what a sample path resolves to, field by field.
3. **Choosing and dropping folders.**
   - Add a "Choose folder…" control (`<input type="file" webkitdirectory>`, using `webkitRelativePath`).
   - Accept dropped folders (`DataTransferItem.getAsFileSystemHandle()` where available, otherwise `webkitGetAsEntry()`), walked recursively. Take every item from the `DataTransfer` synchronously inside the drop handler (the list is emptied once the event returns), and call `readEntries()` until it returns nothing (it returns batches).
   - Consider only `.xvg`, `.dat` and `.txt`. Everything else is listed as skipped, with a count. Decide whether OS clutter (`.DS_Store`, `Thumbs.db`, `desktop.ini`; see D41) is listed or ignored.
   - Large trees must not freeze the page: show progress, and read and parse each file only once. Agree a size target in Phase 0 (number of files and total MB of a real cluster tree; ask me) and measure against it. Today `readFiles` reads every file at once, and `UploadDialog` re-runs `planBatch`, which re-picks every curve, on every render.
4. **Upload plan.** For every file the existing plan list shows:
   - its relative path;
   - which fields came from the path, the name, the header or the form;
   - why it is skipped, if it is.
5. **Header fallback.** For a single file with no folder context, matching the path pattern against the header's working directory is an option. Ask me whether I want it (my inclination is yes, shown in the plan as "from header").
6. **Provenance.**
   - Parse from the header: GROMACS version, tool (`gmx awh`), command line (all continuation lines), working directory and creation date. The date is kept as the text in the file; it has no time zone. Say in Phase 0 whether `Executable:` is worth keeping too.
   - Show it on each run card in the detail dialog. Show the command and working directory in full on demand (expand or title), and make them copyable.
   - Where to keep it is a Phase 0 decision. My recommendation is derived data in the cache, keyed by SHA-256 and a new parser version, since it can always be re-read from the original. Storing it in the run record makes it visible in Git and grep, but duplicates the original, and puts cluster paths and user names into Git and dataset exports. Present both options.
   - Reconstructed files and files without a header show "no provenance in file".
   - Decide whether analysis files get provenance too (recommendation: parse it for every xvg, show it for runs now).

### Tests

- **Header parser (table-driven):** the real header of `test/fixtures/hmrfast6_ha_a_t200000.xvg`; no header; CRLF line endings; `gmx_mpi` and `gmx`; a version with a suffix (`2025.4-PLUMED_spack`); the line after the command (`# gmx awh is part of G R O M A C S:`) is not part of it; a reconstructed file. A command wrapped over several lines only from a real file: ask me for one.
- **Path matcher (table-driven):** plain segments, `**` (zero, one and several folders), `{*}`, partial segments, case, no match, an unreadable `{run}`, and a path field conflicting with a name field.
- **Folder fixture:** `test/fixtures/cluster/hmr+fast+6/ha/a/9.multiwalker/1/awh_t200000.xvg`, plus one analysis file and one non-xvg file. It goes through the same planning as the dialog and produces the expected rows, columns, run slots and skip list.
- **Provenance survives:** it is still there after close → reopen, and after deleting `.matrix/cache/`.
- Existing `parseName` behaviour is unchanged.

### Manual checks

- Drop the fixture folder in Chrome.
- Choose it with the button.
- The plan shows sources, conflicts and skips.
- A run card shows provenance, and the command copies.
- The Settings tester resolves a sample path.

---

## 6. R2: Methods become editable tags

### Today

- `METHODS` is a hard-coded list in `seq.ts` (`hmr`, `fast water`, `prosecco75`, `ADD`).
- Each run stores `methods: Record<string, boolean>` (`types.ts` `Run`, `records.ts` `RunRec`).
- It is used in `UploadDialog.tsx` (the "Flags" chips), `DetailDialog.tsx` (`RunEditor` chips, run labels via `methodLabel`) and `App.tsx` `blankForm`, which ticks ADD on every new upload.
- The legacy prototype migration (`migration/migrate.ts`) and its verification carry `methods` too, and so do `test/helpers.ts`, `test/exchange.test.ts` and `scripts/make-legacy-fixture.ts`.
- Analyses are already editable per project (the `analyses` setting and the Analyses section in Settings). That is the model to follow.
- **Verified:** `MIGRATIONS` in `manifest.ts` is empty, so this is the vault's first real upgrade. `SchemaMigration.files` is a fixed list of paths, but this step changes every row record (and settings) in every project. `Vault.upgrade` runs the step inside a journal entry, but the step's own writes aren't recorded in it.

### Requirements

1. **Project tag list** in project settings, edited in Settings the same way as analyses: add, rename, reorder and delete.
   - Each tag has a stable key and an editable label. Renaming a label never touches runs.
   - Deleting a tag that runs use first says how many runs use it. Whether it is then removed from those runs or kept as an unknown tag is a decision for Phase 0.
2. **Runs carry tags** as a list of keys. Unknown keys (e.g. from an import) are kept and shown, never dropped.
3. **Migration.**
   - Existing `methods` become tags (`true` → tagged, `false` → nothing).
   - Every project's tag list is seeded with the four current methods, so nothing changes visually after the upgrade.
   - This changes the on-disk format, so follow section 1.3 in full.
   - Phase 0 says how the backup covers every file the step changes, and what happens if the tab closes halfway through the upgrade. The step must be safe to run again on a half-upgraded vault.
   - The legacy prototype migration produces tags too, and its verification still passes on `test/fixtures/legacy-dump.json`.
   - Older dataset exports with `methods` still import. Whether the export format version changes is a decision for Phase 0.
4. **UI.**
   - The upload dialog and run editor pick tags as chips. Whether a new tag can be created inline there is a decision.
   - Labels that used `methodLabel` show tags.
   - New uploads start with **no** tags. Ask me if you think "last used" is better.
5. **Out of scope unless I say otherwise:**
   - The row group header ("Method · group") stays as it is. In Phase 0, explain how it relates to tags and whether that is confusing.
   - The `{method}` file-name token still sets the group. Ask whether a `{tag}` token is wanted (recommendation: not now).

### Tests

- Upgrade the frozen schema-1 vault fixture (section 1.3) to the new version: `methods` → tags, backup in the trash, verified field by field.
- An upgrade interrupted halfway and reopened ends in the same state as an uninterrupted one.
- A newer vault opens read-only.
- Close → reopen round trip.
- Export → import of the new format, and import of the frozen v4 and v3 exports.
- The legacy migration test still verifies.
- Renaming a tag label keeps the runs' tags.
- Deleting a tag in use behaves as decided.
- An unknown tag is preserved.

### Manual checks

- Edit tags in Settings.
- Tag a run in the run editor.
- Upload with tags.
- Open an old vault and confirm it looks the same as before.

---

## 7. R3: Clean up leftovers

1. Fix stale comments that say structure files live in IndexedDB:
   - `types.ts` (`StructMeta`);
   - `seq.ts` (the structures section header, and the `structureIds` doc comment).
2. Delete `structureIds` (unused).
3. Check `rekeyStructures` and `readExport` in `seq.ts`. Their comment says structure IDs must be unique across one shared IndexedDB store, but `importJSON` and `importAsStore` still call them. **Verified:** `exchange.ts` never passes `foreign`, so the re-keying never changes an ID. Confirm this, remove only what is dead, and fix the comment either way.
4. Search `src/` for other prototype-storage leftovers (`localStorage`, `indexedDB`, `IndexedDB`) outside `migration/legacy.ts`, `migration/migrate.ts`, `prefs.ts` and `vaultHandles.ts`, which are legitimate. List what you find and remove only dead code. Ask about anything else.

**Tests:** the existing suite passes. Record the search and its result in the decisions log.

---

## 8. R4: The header beats the file name

### Today

`detectAna(types, filename, head)` in `seq.ts` checks each analysis type's keywords against the file name plus the xvg title and y label, and falls back to PMF. **Verified:** a PMF named `pmf_distance_ha.xvg` is filed as **Distance**, and `awh_rg-scan.xvg` as **Rg**, although `gmx awh` wrote `@ title "AWH"` in both.

### Requirements

1. The order of evidence is:
   1. an explicit `{analysis}` token;
   2. the analysis chosen in the form;
   3. the file's header;
   4. file-name keywords.
2. Header evidence: title `AWH` → PMF. After R1a, the parsed tool name can be used too (R1b, if approved). Header keywords only count if they match the header itself, not the name.
3. The upload plan says where the type came from. Extend `PlanItem.anaHow` with a `header` source, and show it in the plan.
4. Only `detectAna`, its caller in `planBatch`, `PlanItem.anaHow` and the plan's label in `UploadDialog.tsx` change. Keep the change small.

### Tests (table-driven, written first and failing)

- `pmf_distance_ha.xvg` and `awh_rg-scan.xvg` with the AWH title → PMF.
- The same names with no header → today's behaviour.
- An RDF header with a PMF-looking name → RDF.
- An explicit `{analysis}` token beats the header.

---

## 9. R5: Say what a merge will drop

### Today

Renaming a row so that its group, name and sequence match another row merges the two (`updateSeq` in `seq.ts`). Where both rows have the same run slot or analysis, the target's version wins and the renamed row's is dropped; those originals go to the trash with the old row. `EditPanel` in `DetailDialog.tsx` only says "saving merges both rows into one".

**Verified, and not in the backlog:**
- The cell editor's save (`EditPanel.save`) is `updateSeq` → `remapRuns` → `moveCell`. The merge happens first, on the old slot numbers, and the renumbering is then applied to the merged row. Renaming a row into its twin while renumbering its run 1 → run 3 drops the renamed row's run 1 and moves the twin's own run 1 to run 3.
- Visibility flags (`store.vis`) are keyed by row ID, and the merge doesn't move them. A hidden run that moves to the twin becomes visible, and when hidden runs are left out of the value (`hiddenOut`), it starts counting in the cell value.

### Requirements

1. Before the user confirms, the panel says exactly what will be dropped, for example: "Merging keeps WRWYCR's runs where both have one. From WRWYCR-typo, 2 runs and 1 analysis go to the trash: HA run 1, HA run 2, RDF on HA run 1."
   - When nothing is dropped, it says so.
   - The message is announced (`aria-live`).
2. The list comes from **one pure function that the save also uses**, so the message can never drift from the behaviour. It covers the whole save (merge, renumber and move), not only `updateSeq`.
3. Keep the message short. Mention merged notes and structures only if Phase 0 shows they can surprise someone.
4. In Phase 0, propose whether to fix the two verified problems above in R5 (they are in the lines R5 changes) or move them to the backlog.
5. Offering "keep the renamed row's runs instead" is out of scope. Ask if you think it's needed.

### Tests (written first)

- The preview lists exactly what the save drops (several fixtures: no clash, run clash, analysis clash, mixed, merge combined with renumbering, merge combined with a column move).
- **Vault level:** after the merge, the dropped originals are in the trash and can be restored.

---

## 10. R6: Duplicate warning

### Today

The vault records the SHA-256 of every original (`FileMeta.sha256`, computed in `describeUpload` in `files.ts` when it is saved), but nothing compares new uploads against it.

- `PlanItem.dup` already exists and means something else: two files in one batch want the same run slot ("duplicate slot · skipped"). Use a different name for identical content (e.g. `sameAs`) so the two can't be confused.
- The plan list has no per-file include toggle today, only × (remove).
- "+ curve from file" (`addCurveFile`) and the structure panel save at once, with no plan.

### Requirements

1. **Every upload path checks:** the upload dialog (including folder import), "+ curve from file", the structure panel, and drop onto a cell (R7). Put the check in one shared place.
2. **Read and hash once** in the browser with `crypto.subtle`: one read gives both the hash and the text to parse. Reuse that hash when the file is saved, if that's practical.
3. **The warning says where the identical file already is:** "Identical to run 2 of WRWYCR × HA (hmrfast6_ha_b_t200000.xvg)". Duplicates within the same batch are caught too.
4. **Warn, don't block.** In the plan, duplicates are excluded by default, and the user can include them again with a keyboard-usable toggle. Ask if you'd rather default differently. For the paths without a plan, Phase 0 proposes the behaviour (recommendation: say where the identical file is and ask before adding).
5. **Scope** is a Phase 0 decision:
   - the current project only (recommended) or the whole vault;
   - whether files in the trash count (recommendation: mention them separately as "a deleted copy is in the trash");
   - whether attaching an untracked file and dataset JSON import are checked too.
6. The lookup is built in memory from records. **No new on-disk index.** Files with an empty `sha256` (placeholders for structures the prototype had already lost) are ignored.

### Tests

- Same bytes, different name → warning naming the existing owner.
- Same name, different bytes → no warning.
- A duplicate within one batch.
- A file with an empty `sha256` is never reported.
- Trash and cross-project behaviour as decided.

### Manual checks

- Upload a file twice, by each upload path.

---

## 11. R7: Drop a file onto a matrix cell

### Today

Files can be dropped anywhere over the matrix (`onDrop` in `App.tsx`) or onto the upload dialog. Then row and column come from the file-name pattern or the form. There are two cell pre-fills already:
- `Matrix.tsx` `Row`: clicking an empty cell calls `openForm` with the row and column, `parse: false` and no `keepName`;
- `DetailDialog.tsx` `formFor` ("+ add a run here"): the same plus `keepName: true`, which also makes `onSaved` reopen the cell after saving.

**Verified:** without `keepName`, two files dropped on a cell become new rows `NAME+1` and `NAME+2` instead of runs 3 and 4 of that row (`planBatch`).

### Requirements

1. **Dropping xvg files on any cell**, filled or empty, opens the upload dialog pre-filled for that row and column, with the row's name kept (`keepName`), and with the files loaded.
   - One pure pre-fill function serves the empty-cell click, `formFor` and the cell drop. Phase 0 says whether the empty-cell click should keep the name too (a behaviour change).
   - With `parse: false`, file-name tokens (`{time}`, `{run}`, `{analysis}`) are ignored. Ask whether a cell drop should still read them, with row and column always taken from the cell.
   - The normal plan shows replace, append and duplicate status.
   - Nothing is saved until the user confirms.
2. **While files are dragged over a cell,** it shows a drop-target state. This applies only to file drags (`dataTransfer.types` includes `Files`, as `App.tsx` `onDragOver` already checks), not the app's other drag-and-drop (reordering, analysis chips).
   - The matrix-wide drop keeps working everywhere else.
   - A drop on a cell doesn't also trigger the matrix-wide drop.
3. **No drop target in read-only or viewer mode,** or while the compare key is held.
4. **Ask in Phase 0:**
   - Should `.pdb` or `.gro` dropped on a cell attach as a structure to that row, through the same path as `StructurePanel` (recommendation: yes)?
   - Should a sequence name be a drop target?
   - Should a folder dropped on a cell be refused with a message (recommendation), or imported into that cell?
5. The keyboard path already exists (open the cell → "+ add a run here"). Don't add another.

### Tests

- The pre-fill for a cell is a pure function shared by all three paths, with tests.
- Two files planned with the cell pre-fill land in the row's next free slots, not in new rows.

### Manual checks

- Drop on an empty cell and on a filled cell, outside a cell, in viewer mode and during compare.

---

## 12. Testing (all requests)

- Use Vitest. Tests run in Node with no DOM, so keep logic in pure functions and test it table-driven where possible.
- Test vault-level behaviour against `MemoryBackend`, and folder fixtures against the Node backend where file trees matter.
- Every fix (R4, R5) starts with a failing test that reproduces the problem.
- Every on-disk change has an old → new migration test against frozen fixtures, a newer → read-only test and an export/import round trip.
- Every new pure function has edge-case tests.
- There is no UI test framework. Don't add one without asking.
  - For UI parts, write a manual checklist per request, run it in Chrome and record the results (passed, failed or not run).
  - If you think a small Playwright smoke test would pay for itself, propose it in Phase 0 with its cost.
- The existing tests keep passing. Report the count before and after.

---

## 13. Acceptance criteria

- **A. Folder import.** A cluster folder tree imports through a path pattern. The plan shows each file's relative path, the source of every field, conflicts and skips. The agreed size target is met.
- **B. Provenance.** GROMACS version, tool, command line, working directory and date are shown for each run as recorded, survive reopening and cache deletion, and are never guessed.
- **C. Tags.** Tags are editable per project. Old vaults, old exports and legacy prototype data upgrade without visible change. New uploads start untagged.
- **D. Leftovers.** No stale IndexedDB comments and no dead code from the prototype.
- **E. Type detection.** Header evidence beats file-name keywords, and the plan shows the source.
- **F. Merge.** The merge preview lists exactly what the save drops, from the same function that drops it.
- **G. Duplicates.** Every upload path warns about identical files and names where they already are.
- **H. Drop onto a cell.** Dropping on a cell opens a pre-filled, confirmable upload into that row. Other drag-and-drop is unaffected.
- **I. Vault guarantees intact.** Originals are byte-identical. No project data in browser storage. The cache can be deleted. Old vaults upgrade and newer ones open read-only. Dataset JSON round-trips.
- **J. Quality.**
  - `npm run lint`, `npm run build` and `npm test` pass, with no warnings beyond the baseline.
  - No new console errors.
  - New UI is keyboard-usable and announced.
  - Net lines are reported per item.

---

## 14. Documentation

Update `README.md`:
- **Features:** folder import and path patterns, provenance, tags, duplicate warning, drop onto a cell.
- **The vault format:** the new schema version, what changed in records or settings, and what is derived in the cache.
- **Settings keys:** the path pattern and tags.

---

## 15. Commits

- One commit per roadmap item (R1a, R1b, …), with its ID first (`R4: header evidence beats file-name keywords`). Plus one commit each for the Phase 0 docs, the frozen fixtures and the final report.
- Every commit passes lint, build and tests on its own.
- Stage files by name. Never commit generated files (`dist/`, `.vault-out/`) or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 16. Final report: `docs/feature-batch-1-report.md`

1. **Summary table:** item → status → files changed → lines added / removed → tests added → decisions.
2. **Per request:** what changed and why, behaviour before and after, known limitations.
3. **On-disk changes:** the schema version, the migration step, and one example each of:
   - a run record before and after (tags; provenance, if it lives there);
   - a cache entry for provenance, if it lives there;
   - the settings file with the tag list and path pattern.
4. **Tests:** count before and after, the list of new tests, and the manual QA checklist with passed, failed or not run for each item.
5. **Review:** what the fresh-context review found, and what was done about each finding.
6. **Decisions** F1… (link to `docs/feature-decisions.md`).
7. **Roadmap status** and the updated backlog: anything you noticed but didn't fix.
8. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline commit.
