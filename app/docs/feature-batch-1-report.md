# Feature batch 1: final report

Branch `feature-batch-1`, from `vault-storage` at `0343abc`. Spec: `docs/feature-batch-1.md`.
Decisions F1–F47: [`feature-decisions.md`](feature-decisions.md). Roadmap and backlog:
[`roadmap.md`](roadmap.md). Phase 0 plan: [`feature-batch-1-phase0.md`](feature-batch-1-phase0.md).

## 1. Summary

Lines are app code (`src/`, `scripts/`); tests are counted separately. Fixtures are not counted.

| Item | Status | Files | App code + / − | Test code + / − | Tests added | Decisions |
| --- | --- | --- | --- | --- | --- | --- |
| R3 Leftovers | done | 4 | +12 / −35 | — | 0 (searched, F34) | F34 |
| R4 Header beats file name | done | 10 | +17 / −11 | +44 | 11 | F35 |
| R5 Merge preview | done | 5 | +62 / −23 | +114 | 12 | F21, F22, F36 |
| R6 Duplicate warning | done | 13 | +144 / −62 | +83 | 10 | F23, F24, F37 |
| R7 Drop onto a cell | done | 8 | +37 / −7 | +22 | 3 | F25–F29, F38 |
| R2-0 Frozen fixtures | done | 24 | — | +47 / −1 | 4 | F30, F39 |
| R1a Header parser | done | 5 | +56 / −3 | +72 | 12 | F6–F8, F40 |
| R1b Tool as evidence | done | 6 | +44 / −17 | +38 | 5 | F13, F32, F41 |
| R1c Path pattern | done | 7 | +113 / −31 | +138 | 40 | F2–F5, F14, F42 |
| R1d Folder import | done | 11 | +165 / −23 | +104 | 7 | F9–F11, F43 |
| R1e Provenance | done | 7 | +52 / −2 | +46 | 4 | F7, F44 |
| R2a Tag list | done | 10 | +86 / −18 | +45 | 6 | F15, F16, F45 |
| R2b Tags in runs, schema 2 | done | 26 | +97 / −42 | +151 / −26 | 8 (2 adapted) | F17, F19, F46 |
| R2c Tags in the UI, export v5 | done | 14 | +77 / −39 | +30 / −2 | 3 (1 adapted) | F18, F20, F47 |
| README | done | 1 | — | — | — | — |
| Review fixes | done | 11 | +18 / −15 | +53 | 5 | F48 |

Total app code: about +980 / −328 (net +652). The estimates in Phase 0 were exceeded by R1c
(tester and plan UI) and R1d (progress, slicing, list cap; see F43).

## 2. Per request

**R1 Folder import, path patterns, provenance** (R1a–R1e).
- *Before:* only file names were parsed (`parseName`); `{run}` read `9.multiwalker` as run 9 and
  anything unreadable as run 1; every `#` header line was discarded; files were picked one by one.
- *After:* "Choose folder…" and folder drops read every `.xvg`/`.dat`/`.txt` with its relative
  path; a folder pattern (`pathPattern`, off by default) is matched against the folders, or
  against the GROMACS working directory when there is no folder. Name, folder and header fields
  combine with their source shown on each plan line; disagreements and unreadable `{run}`s are
  conflicts and are not uploaded. The GROMACS header is parsed (version, tool, command line,
  working directory, creation date, executable), cached by SHA-256 + parser version, and shown on
  each run card with copy buttons. A GROMACS file from a tool other than `gmx awh` that matches no
  analysis is "unknown", with a per-file choice (F32, F41).
- *Size target (F11, measured, production build):* 3,000 files / 100 MB planned 7.5–8.9 s after
  picking; progress shown; our tasks stay under 200 ms and a keystroke in the form costs
  80–120 ms. Over 200 ms: Chrome building the 3,001-entry file list (about 0.6 s, before our
  handler runs) and saving 3,000 runs (about 2.5–3 s; backlog).
- *Limitations:* the real folder picker and OS folder drops were not run (automated picker
  only); analysis files are parsed for provenance but it is shown only for runs; the plan list
  shows the first 200 files plus every file needing attention.

**R2 Tags** (R2-0, R2a–R2c).
- *Before:* four hard-coded methods; runs stored `methods: { key: boolean }`; new uploads were
  tagged ADD.
- *After:* a per-project tag list (`tags.json`) edited in Settings → Tags (rename, reorder with
  ↑/↓, add, remove with "used by N runs"); runs store `tags: string[]`; vault format 2 with a
  journaled, backed-up upgrade; export v5; v3/v4 exports and the legacy dump load as tags; chips
  with inline "+ tag" in the upload dialog and run editor; unknown tags kept and shown in italics;
  new uploads untagged; the row group header is "Group".
- *Limitations:* no `{tag}` file-name token (F20).

**R3 Leftovers.** Dead prototype code (`structureIds`, `rekeyStructures`, the unused `foreign`
parameter and `structData` result) and four stale IndexedDB comments removed (F34).

**R4 Header beats file name.** `detectAna` checks the header (title AWH, then keywords in the
title and y label) before file-name keywords and reports the source; the plan shows "header",
"file name" or "auto" (F35).

**R5 Merge preview.** `editRow` does the whole row-editor save; the preview calls the same
function, so it lists exactly the runs and analyses that go to the trash. Renumbering and moves
apply before the merge; hidden flags follow merged runs; descriptions are joined (F21, F22, F36).

**R6 Duplicate warning.** Identical content (SHA-256) in the project, its trash, or earlier in the
same upload is named ("Identical to run 2 of WRWYCR × HA (…)") and left out unless included; paths
without a plan ask with `confirm()` (F23, F24, F37).

**R7 Drop onto a cell.** A cell takes file drops (not when read-only or comparing): data files open
the upload dialog for that row and column, structures attach to the row, folders are refused with a
pointer to the matrix-wide drop (F25–F29, F38).

## 3. On-disk changes

- `SCHEMA_VERSION` 1 → 2. Step `methodsToTags` (`src/lib/storage/manifest.ts`): each run's
  `methods` become `tags` (`true` → tagged); each project without `tags.json` gets the four former
  methods. The step returns its writes; `Vault.upgrade` backs up exactly those files to a
  `schema-backup` trash item and applies the writes with the manifest bump after the journal's
  commit point (F19, F46).
- New settings key `pathPattern` (in `settings.json`) and new file `tags.json` (F30, F45).
- New cache entry `cache/parsed/<sha256>.gmx-header-1.json`, parser `gmx-header@1` (F7, F40).
- Dataset JSON v5 (F47).

Run record, before (schema 1, frozen fixture) and after the upgrade:

```json
{ "added": "2026-10-05", "column": "ha", "file": "fmuvub52s1gbhm", "id": "rmuvub52sk2272",
  "methods": { "add": true, "fast": true, "hmr": true, "prosecco75": false },
  "parse": { "xCol": 1, "yCol": 2 }, "slot": "a", "temp": 310.15, "time": "200000" }
```

```json
{ "added": "2026-10-05", "column": "ha", "file": "fmuvub52s1gbhm", "id": "rmuvub52sk2272",
  "parse": { "xCol": 1, "yCol": 2 }, "slot": "a", "tags": ["add", "fast", "hmr"],
  "temp": 310.15, "time": "200000" }
```

Provenance cache entry (provenance is derived, so it is not in the run record):

```json
{
  "header": {
    "command": "gmx_mpi awh -f 9.multiwalker.edr -s 9.multiwalker.tpr -o 9.multiwalker.xvg -skip 5",
    "created": "Mon Sep 21 12:27:52 2026",
    "executable": "/cvmfs/software.metacentrum.cz/spack23/…/gromacs-2025.4-…/bin/gmx_mpi",
    "tool": "gmx awh",
    "version": "2025.4-PLUMED_spack",
    "workdir": "/mnt/storage-brno14-ceitec/shared/softmatter/SHARED/forKrystof/walkers_for_denys/hmr+fast+6/ha/a/9.multiwalker/1"
  },
  "schema": 1,
  "source": { "parser": "gmx-header@1", "sha256": "eac75cf4…65db59" }
}
```

`settings/<pid>/settings.json` with a path pattern, and `settings/<pid>/tags.json`:

```json
{ "hiddenOut": false, "parse": true, "pathPattern": "{method}/{column}/{seq}/{*}/{run}",
  "pattern": "{method}_{column}_{name}_t{time}.xvg", "rowAll": false, "temp": "310.15",
  "xCol": 1, "xLabel": "Distance (nm)", "yCol": 2, "yLabel": "PMF (kJ/mol)" }
```

```json
{ "tags": [ { "k": "hmr", "label": "hmr" }, { "k": "fast", "label": "fast water" },
            { "k": "prosecco75", "label": "prosecco75" }, { "k": "add", "label": "ADD" } ] }
```

## 4. Tests

**Count:** 79 before (5 files), 212 after (14 files): 128 added with the items, 5 with the review fixes. `npm run lint`: 7 warnings, as at baseline
(`only-export-components`). `npm run build`: no new warnings.

**New tests** (128):
- `upload.test.ts` (22): R4 evidence order table (9) and plan source (3); R1b tool evidence
  and unknown analyses (7); R7 `cellForm` (3).
- `merge.test.ts` (12): `editRow` drops = preview, place before save, renumber/move then merge,
  hidden flags, joined descriptions, full column, vault trash/restore.
- `duplicates.test.ts` (10): `readLocal`, `findSame` (owner, different bytes, placeholders,
  trash, other projects), plan exclusion and inclusion, in-batch duplicates.
- `formats.test.ts` (4): the frozen schema-1 vault, v4 and v3 exports load, with the same runs.
- `gmxHeader.test.ts` (12): six real headers, CRLF, `gmx` vs `gmx_mpi`, no header,
  reconstructed, leading block only, verbatim quoted/long commands, missing field, cache.
- `pathPattern.test.ts` (40): path matcher table, unreadable `{run}`, `parseName` regression
  table, `mergeFields`, planning with path/header/conflicts, the setting's persistence.
- `folderImport.test.ts` (7): recursive walk with batched `readEntries`, skips and clutter,
  loose files, picker paths, `mapLimit`, the cluster fixture planned end to end, size.
- `provenance.test.ts` (4): cached, survives reopen and cache deletion, none for headerless
  and reconstructed files.
- `tags.test.ts` (17): tag list defaults, keys, storage, use count and delete; frozen vault
  upgrade field by field with backup; idempotent step; crash before and after the commit point;
  newer vault read-only; reopen with unknown tags; label rename; old `methods` stores; export v5
  round trip; newer export refused; untagged new uploads.
- Adapted with reasons: the injected-migration test in `vault.test.ts` (new step interface, F19);
  `exchange.test.ts` expects v5; `formats.test.ts` expects tags after R2b.

**Manual QA in Chrome** (automated with scratch Playwright scripts, picker stubbed, F31; final
pass on the last commit; console errors checked on every page: none besides fonts and CDN
requests blocked by the sandbox):

| Check | Result |
| --- | --- |
| R4: plan shows "header" / "auto" as the analysis source | passed |
| R5: merge preview names the run that goes to the trash; save matches | passed |
| R6: identical file in the plan is named, left out, and can be included | passed |
| R6: "+ curve from file" and structure panel ask before adding an identical file | passed |
| R7: drop on a filled cell → dialog for that row, next free slots | passed (synthetic drag events) |
| R7: drop on an empty cell → that column, run 1; `.pdb` on a cell → structure added | passed (synthetic) |
| R7: drop outside cells → normal upload; while comparing → not a cell drop | passed (synthetic) |
| R7: read-only → cells are not drop targets | passed (the matrix-wide drop still opens the dialog: existing bug, backlog) |
| R1: choose the fixture folder with the button → rows, sources, identical file, skip list | passed (automated picker) |
| R1: drop the fixture folder from the OS | not run |
| R1: real folder picker | not run |
| R1: plan shows a name/header conflict and leaves the file out | passed |
| R1: Settings tester resolves a sample name and folder, with sources and conflicts | passed |
| R1: unknown GROMACS analysis gets a per-file choice | passed |
| R1: run card shows provenance; command copies; headerless file says so | passed |
| R1: 3,000 files / 100 MB size target | passed for planning and typing; save over 200 ms (backlog) |
| R2: edit tags in Settings (rename, add, reorder, delete in use) | passed |
| R2: upload with tags, inline "+ tag" | passed |
| R2: tag a run in the run editor | passed |
| R2: unknown tag from an import shown in italics | passed |
| R2: open an old (schema-1) vault: upgraded, looks the same | passed |
| 1024 px width for the changed dialogs | passed (screenshots) |

## 5. Review

A general-purpose agent with no part in writing the code reviewed `git diff 0343abc..HEAD`
against section 13. It was read-only and reproduced each finding with a scratch script. It
confirmed lint (7 baseline warnings), build (only 3Dmol's `eval` warning) and 207 passing tests.
All six findings were fixed in one commit (`Review fixes`, F48), each with a new test (+5 tests,
212 in total):

| # | Severity | Finding | Done |
| --- | --- | --- | --- |
| 1 | medium | `rowToSeq` read only `tags`, so a pre-upgrade trash item restored after the upgrade (or a schema-1 vault shown read-only) lost its methods, and the next save wrote `tags: []` | fixed: `tagsOf` when reading records |
| 2 | medium | The header fallback took part in conflicts, against F6: a single real file with the documented folder pattern was blocked (`group: hmrfast6 (name) ≠ hmr+fast+6 (header)`) | fixed: the header only fills |
| 3 | low | A hidden run merged into a slot where the twin had only an analysis became visible (F21) | fixed |
| 4 | low | Unused `Methods` type (criterion D) | removed |
| 5 | low | New plan statuses ("conflict", "unknown analysis") used accent red for body text | `var(--accInk)` |
| 6 | low | An unreadable original showed "no provenance in file", a claim about content never read | throws; the card says the original can't be read |

The reviewer listed as checked and fine:
- the upgrade and recovery path, `methodsToTags`, `tagsOf`, export v5 and import v3/v4;
- `matchPattern`, `planBatch`, `editRow`, `sameContent` and `folderFiles`;
- the header parser and cache, the cell drop, `TagPicker`, the live regions and the R3 cleanup.

## 6. Decisions

F1–F47 in [`feature-decisions.md`](feature-decisions.md).

## 7. Roadmap status and backlog

Every item in Phases 0–5 is done (see [`roadmap.md`](roadmap.md)). Backlog added during the
batch (not fixed):
- In a read-only vault, a matrix-wide file drop still opens the upload dialog (R7).
- Saving a 3,000-run upload blocks the page for about 2.5–3 s in `addRun`'s rounding (R1d).
- Removing an analysis that has data leaves its definition in the list (R2a; seen in Chrome).

The earlier backlog stays as it was, except: the `{run}` fallback to run 1 (fixed in R1c, F5) and
the re-plan on every render (fixed in R1d).

## 8. History

`git log --oneline 0343abc..HEAD` (plus the commit that adds this report):

```text
a65f60e Review fixes for feature batch 1
9f30b88 Docs: README for feature batch 1
87b36ed R2c: tags in the upload dialog, run editor, labels and export
9da6006 R2b: runs carry tags; vault format 1 → 2
bc05864 R2a: editable project tag list
ae25542 R1e: provenance on run cards
80dc834 R1d: choose or drop a whole folder
9d95181 R1c: folder pattern for paths, with a tester in Settings
0a2e405 R1b: the GROMACS tool counts as analysis evidence
8c4b955 R1a: GROMACS header parser with a cache entry
d060952 R2-0: frozen old-format fixtures
29cd410 R7: drop files onto a matrix cell
9efd5cd R6: warn about identical files on every upload path
fc7a81b R5: merge preview names what the save drops
cb4b771 R4: header evidence beats file-name keywords
496251a R3: remove prototype leftovers
46b13a3 Phase 0: decisions F2-F33 recorded, roadmap order confirmed
24f7f69 Phase 0: record F1 and the real GROMACS files received
d9bc9f8 Phase 0: feature batch 1 spec, roadmap, decisions log and plan
```

`git diff --stat 0343abc..HEAD` for `app/`, test fixtures left out (they are real GROMACS files and the frozen formats):

```text
 app/README.md                            |  73 ++++++-
 app/docs/feature-batch-1-phase0.md       | 528 +++++++++++++++++++++++++++++++++++++++++++++++++
 app/docs/feature-batch-1.md              | 545 +++++++++++++++++++++++++++++++++++++++++++++++++++
 app/docs/feature-decisions.md            |  56 ++++++
 app/docs/roadmap.md                      |  71 +++++++
 app/scripts/make-legacy-fixture.ts       |   3 +-
 app/src/App.tsx                          |  89 ++++++---
 app/src/components/DetailDialog.tsx      | 124 +++++++-----
 app/src/components/Matrix.tsx            |  18 +-
 app/src/components/Pages.tsx             |   4 +-
 app/src/components/SettingsDialog.tsx    |  85 ++++++--
 app/src/components/StructurePanel.tsx    |  27 +--
 app/src/components/TagPicker.tsx         |  33 ++++
 app/src/components/UploadDialog.tsx      | 110 ++++++++---
 app/src/components/VaultDialog.tsx       |   7 +-
 app/src/components/ui.tsx                |   4 +-
 app/src/ctx.ts                           |   7 +
 app/src/lib/folderFiles.ts               |  80 ++++++++
 app/src/lib/gmxHeader.ts                 |  38 ++++
 app/src/lib/seq.ts                       | 339 ++++++++++++++++++++++++--------
 app/src/lib/storage/cache.ts             |  21 +-
 app/src/lib/storage/exchange.ts          |  15 +-
 app/src/lib/storage/files.ts             |  10 +-
 app/src/lib/storage/manifest.ts          |  42 +++-
 app/src/lib/storage/migration/migrate.ts |   2 +-
 app/src/lib/storage/model.ts             |   3 +-
 app/src/lib/storage/path.ts              |   1 +
 app/src/lib/storage/plan.ts              |   2 +-
 app/src/lib/storage/project.ts           |  50 ++++-
 app/src/lib/storage/records.ts           |   7 +-
 app/src/lib/storage/settings.ts          |  14 +-
 app/src/lib/storage/vault.ts             |  17 +-
 app/src/lib/structFile.ts                |  35 +++-
 app/src/lib/types.ts                     |  13 +-
 app/test/duplicates.test.ts              |  83 ++++++++
 app/test/exchange.test.ts                |   6 +-
 app/test/folderImport.test.ts            | 104 ++++++++++
 app/test/formats.test.ts                 |  36 ++++
 app/test/gmxHeader.test.ts               |  72 +++++++
 app/test/helpers.ts                      |  18 +-
 app/test/merge.test.ts                   | 122 ++++++++++++
 app/test/pathPattern.test.ts             | 155 +++++++++++++++
 app/test/provenance.test.ts              |  56 ++++++
 app/test/tags.test.ts                    | 209 ++++++++++++++++++++
 app/test/upload.test.ts                  | 104 ++++++++++
 app/test/vault.test.ts                   |  11 +-
 46 files changed, 3156 insertions(+), 293 deletions(-)
```
