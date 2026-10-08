# Final report — vault storage

This report covers the persistence redesign in `docs/storage-redesign.md`, built in four
phases with the decisions in `docs/storage-decisions.md`.

## 1. Headless migration of the fixture

`test/fixtures/legacy-dump.json` is built from the sample files by
`scripts/make-legacy-fixture.ts`. It is in the same format as the Phase 0 console snippet,
and contains:
- the multi-project index, with two projects;
- a third project store that the index doesn't list;
- old-format and multi-curve analyses;
- two structures in IndexedDB, plus one structure whose file was already lost;
- unicode names, notes, literature, visibility, pages, a custom column, project settings and
  browser preferences.

The migration ran on the Node backend:

```text
$ npm run migrate:fixture        # vite-node scripts/migrate-legacy.ts -- test/fixtures/legacy-dump.json .vault-out
Migration VERIFIED · vault vmusfbir4ukuyy · 2026-10-03T13:24:25.068Z
Source: http://localhost:8000, dumped 2026-10-02T18:20:00.000Z

Project "Sugar PMFs" (pmf2k81000, from pmf-seq-store-v1)
  3 rows · 5 runs · 2 analyses · 3 curves · 3 structures · 1 row notes · 2 cell notes · 1 references · 2 pages · 4 columns
  structures written from IndexedDB: 2 · kept as missing (no file in IndexedDB): lost-model.pdb on KLVFFA
  reconstructed files (NOT originals):
    sugar-pmfs--pmf2k81000/cs--cs/kryštof-α-l-rha-test--smf2k81qbl/cs run (1).reconstructed.xvg
    sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/hmrfast6_ha_a_t200000.reconstructed.xvg
    sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/hmrfast6_ha_b_t200000.reconstructed.xvg
    sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/rdf-run-1--xmf2k81q4e/rdf_ha_a.reconstructed.xvg
    sugar-pmfs--pmf2k81000/o26--o26/wrwycr--smf2k81q0a/hmrfast6_o26_a_t200000.reconstructed.xvg
    sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h/histogram-run-1--xmf2k81q9j/hist_pg_a.reconstructed.xvg
    sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h/prosecco75_pg_a_t150000.reconstructed.xvg
  verified: identical after a fresh reopen

Project "Ion pairs 2027" (pmf3a00000, from pmf-seq-project-pmf3a00000)
  1 rows · 1 runs · 0 analyses · 0 curves · 0 structures · 0 row notes · 0 cell notes · 0 references · 0 pages · 3 columns
  structures written from IndexedDB: 0
  reconstructed files (NOT originals):
    ion-pairs-2027--pmf3a00000/o26--o26/na-cl--smf3a00a1a/nacl_o26.reconstructed.xvg
  verified: identical after a fresh reopen

Project "Recovered pmf4b00000" (pmf4b00000, from pmf-seq-project-pmf4b00000)
  1 rows · 1 runs · 0 analyses · 0 curves · 0 structures · 1 row notes · 0 cell notes · 0 references · 0 pages · 3 columns
  structures written from IndexedDB: 0
  reconstructed files (NOT originals):
    recovered-pmf4b00000--pmf4b00000/pg--pg/half-deleted--smf4b00a1a/ggg_pg.reconstructed.xvg
  verified: identical after a fresh reopen

Warnings:
  pmf-seq-project-pmf4b00000 is not in the project index; migrated as "Recovered pmf4b00000".
  Sugar PMFs: 1 structure(s) had no file in IndexedDB (already missing in the old app). Their entries are kept and shown as missing files: lost-model.pdb on KLVFFA

Browser preferences found: {"dark":true,"laserKey":"l","laserMode":"hold","laserColor":"#00c853","laserSize":"l","laserTrail":false}
```

Verification reopens the vault with a fresh load and compares every entity field by field
against the legacy data: runs and curves including their x/y arrays, notes, literature,
pages, columns, effective settings, structure content and file origins. The exit code is 0
only when nothing differs.

After the migration, one run (*Run 2 of WRWYCR × HA*) was deleted through `ProjectService`,
so the listing below includes a real trash entry.

## 2. The resulting vault

The listing below is equivalent to `tree -a` (49 files):

```text
.vault-out/
├── .matrix/
│   ├── cache/
│   │   ├── parsed/
│   │   │   ├── 9ecbe9ad6b41789bddc7fdbab840baf5a31fc599f8aa6d4e2dc8698889549469.xvg-table-1.json
│   │   │   └── eed96fa537df8636ceaf9aa65c1e020d4813f7925dc9a7fd44222f32056ce801.xvg-table-1.json
│   │   ├── pmf2k81000/
│   │   │   └── pmf.json
│   │   ├── pmf3a00000/
│   │   │   └── pmf.json
│   │   ├── pmf4b00000/
│   │   │   └── pmf.json
│   │   └── index.json
│   ├── journal/
│   ├── records/
│   │   ├── pmf2k81000/
│   │   │   ├── columns/
│   │   │   │   ├── cs.json
│   │   │   │   ├── ha.json
│   │   │   │   ├── o26.json
│   │   │   │   └── pg.json
│   │   │   ├── pages/
│   │   │   │   ├── pgmf2k81qeo.json
│   │   │   │   └── pgmf2k81qfp.json
│   │   │   ├── rows/
│   │   │   │   ├── smf2k81q0a.json
│   │   │   │   ├── smf2k81q7h.json
│   │   │   │   └── smf2k81qbl.json
│   │   │   └── project.json
│   │   ├── pmf3a00000/
│   │   │   ├── columns/
│   │   │   │   ├── ha.json
│   │   │   │   ├── o26.json
│   │   │   │   └── pg.json
│   │   │   ├── rows/
│   │   │   │   └── smf3a00a1a.json
│   │   │   └── project.json
│   │   ├── pmf4b00000/
│   │   │   ├── columns/
│   │   │   │   ├── ha.json
│   │   │   │   ├── o26.json
│   │   │   │   └── pg.json
│   │   │   ├── rows/
│   │   │   │   └── smf4b00a1a.json
│   │   │   └── project.json
│   │   └── workspace.json
│   ├── settings/
│   │   ├── pmf2k81000/
│   │   │   ├── analyses.json
│   │   │   └── settings.json
│   │   ├── pmf3a00000/
│   │   │   └── settings.json
│   │   └── pmf4b00000/
│   │       └── settings.json
│   ├── trash/
│   │   └── 20261003T132426Z--run--rmf2k81q2c/
│   │       ├── content/
│   │       │   └── sugar-pmfs--pmf2k81000/
│   │       │       └── ha--ha/
│   │       │           └── wrwycr--smf2k81q0a/
│   │       │               └── hmrfast6_ha_b_t200000.reconstructed.xvg
│   │       └── trash-manifest.json
│   ├── .gitignore
│   └── manifest.json
├── ion-pairs-2027--pmf3a00000/
│   └── o26--o26/
│       └── na-cl--smf3a00a1a/
│           └── nacl_o26.reconstructed.xvg
├── recovered-pmf4b00000--pmf4b00000/
│   ├── _sequences/
│   │   └── half-deleted--smf4b00a1a/
│   │       └── note.md
│   └── pg--pg/
│       └── half-deleted--smf4b00a1a/
│           └── ggg_pg.reconstructed.xvg
└── sugar-pmfs--pmf2k81000/
    ├── _sequences/
    │   └── wrwycr--smf2k81q0a/
    │       ├── note.md
    │       ├── test.pdb
    │       └── WTA.gro
    ├── cs--cs/
    │   └── kryštof-α-l-rha-test--smf2k81qbl/
    │       ├── cs run (1).reconstructed.xvg
    │       └── note.md
    ├── ha--ha/
    │   └── wrwycr--smf2k81q0a/
    │       ├── rdf-run-1--xmf2k81q4e/
    │       │   └── rdf_ha_a.reconstructed.xvg
    │       ├── hmrfast6_ha_a_t200000.reconstructed.xvg
    │       └── note.md
    ├── o26--o26/
    │   └── wrwycr--smf2k81q0a/
    │       └── hmrfast6_o26_a_t200000.reconstructed.xvg
    └── pg--pg/
        └── klvffa--smf2k81q7h/
            ├── histogram-run-1--xmf2k81q9j/
            │   └── hist_pg_a.reconstructed.xvg
            └── prosecco75_pg_a_t150000.reconstructed.xvg
```

What each part is responsible for:

| Path | Responsibility |
| --- | --- |
| `.matrix/manifest.json` | Vault identity: app, storage format, schema version, `vaultId`, created/modified (modified is throttled to 10 min), migration provenance and its verification result. |
| `.matrix/.gitignore` | `cache/` — the only `.gitignore` the app writes. Nothing is ever written to the vault root's `.gitignore`. |
| `.matrix/records/workspace.json` | Project order. |
| `.matrix/records/<project>/project.json` | Project name, description and visible folder; column, page and row order; imported JSON files kept. |
| `.matrix/records/<project>/columns/<key>.json` | One column: label, names, colours, and its folder once it has one. |
| `.matrix/records/<project>/pages/<id>.json` | One page (a view): name, description, rows, columns. Pages have no folder. |
| `.matrix/records/<project>/rows/<id>.json` | One sequence and everything in it: runs (with the columns each was read from), analyses and curves, structures, the metadata of every file it owns, literature, visibility, its folders and note IDs. One edit rewrites only the rows it touches. |
| `.matrix/settings/<project>/` | `settings.json` (file-name pattern, data columns, axis labels, temperature, display options that change values), `analyses.json` (the project's own analysis definitions), `ignored.json` (untracked files to ignore). |
| `.matrix/journal/` | Multi-step operations in progress. Empty when idle. A leftover entry is rolled back (before the commit point) or completed (after it) when the vault opens. |
| `.matrix/trash/<stamp>--<type>--<id>/` | A deleted entity: `trash-manifest.json` (original paths, records as they were, parents, time, schema) and `content/<original path>` for its files. Restorable from **Vault → Trash**. |
| `.matrix/cache/` | Derived data only: `index.json` (folder scan per project, tied to a fingerprint of the records), `<project>/pmf.json` (parsed PMF series), `parsed/<sha256>.xvg-table-1.json` (parsed analysis tables). Each entry names its source SHA-256 and parser version. Deleting the folder loses nothing. |
| `<project-slug>--<projectId>/` | A project's visible files. |
| `…/_sequences/<row-slug>--<rowId>/` | A sequence: its `note.md` and its structure files (`.pdb`, `.gro`). |
| `…/<column-slug>--<key>/<row-slug>--<rowId>/` | A cell (sequence × column): run files (`.xvg`) and the cell's `note.md`. |
| `…/<type>-run-<n>--<analysisId>/` | An analysis attached to run *n* of that cell: the files its curves come from. |
| `…/_imports/`, `…/_restored/` | Dataset JSON files that were imported (kept as uploaded); trash items that couldn't return to their place. |
| `*.reconstructed.xvg` | Rebuilt from numbers the prototype kept. They are marked in the name, in a header and in their metadata (`origin: "reconstructed"`), and are never presented as originals. Real uploads keep their own names. |

The *KLVFFA* row has no `_sequences/` folder. Its only structure, `lost-model.pdb`, was
already missing in the prototype, so its record points at where the file belongs and the app
shows it as missing. Dropping the file anywhere in the project folder relinks it by name.

## 3. Examples

### `manifest.json`

```json
{
  "app": "pmf-sequences",
  "created": "2026-10-03T13:24:24.880Z",
  "format": "matrix-vault",
  "migratedAt": "2026-10-03T13:24:24.880Z",
  "migratedFrom": "legacy browser storage (http://localhost:8000), dumped 2026-10-02T18:20:00.000Z",
  "migration": {
    "at": "2026-10-03T13:24:25.068Z",
    "projects": [
      {
        "from": "pmf-seq-store-v1",
        "id": "pmf2k81000",
        "name": "Sugar PMFs",
        "reconstructed": 7
      },
      {
        "from": "pmf-seq-project-pmf3a00000",
        "id": "pmf3a00000",
        "name": "Ion pairs 2027",
        "reconstructed": 1
      },
      {
        "from": "pmf-seq-project-pmf4b00000",
        "id": "pmf4b00000",
        "name": "Recovered pmf4b00000",
        "reconstructed": 1
      }
    ],
    "source": "legacy browser storage (http://localhost:8000), dumped 2026-10-02T18:20:00.000Z",
    "verified": true
  },
  "modified": "2026-10-03T13:24:26.077Z",
  "schemaVersion": 1,
  "vaultId": "vmusfbir4ukuyy"
}
```

### A record — `.matrix/records/pmf2k81000/rows/smf2k81q7h.json`

```json
{
  "analyses": [
    {
      "added": "2026-09-10",
      "column": "pg",
      "curves": [
        {
          "file": "fmusfbism4iflj",
          "id": "cmusfbir1sbzfz",
          "label": "coord 1",
          "parse": {
            "xCol": 1,
            "xScale": 1,
            "yCol": 2
          }
        }
      ],
      "dir": "sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h/histogram-run-1--xmf2k81q9j",
      "id": "xmf2k81q9j",
      "slot": "a",
      "time": "",
      "type": "histogram"
    }
  ],
  "desc": "",
  "dirs": {
    "cells": {
      "pg": "sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h"
    },
    "row": "sugar-pmfs--pmf2k81000/_sequences/klvffa--smf2k81q7h"
  },
  "files": [
    {
      "id": "fmusfbirh0mwzy",
      "kind": "structure",
      "mime": "",
      "name": "lost-model.pdb",
      "origin": "migrated-from-indexeddb",
      "owner": "stmf2k81qak",
      "path": "sugar-pmfs--pmf2k81000/_sequences/klvffa--smf2k81q7h/lost-model.pdb",
      "sha256": "",
      "size": 1234,
      "uploaded": "2026-10-03T13:24:24.943Z"
    },
    {
      "id": "fmusfbisljayb4",
      "kind": "pmf-xvg",
      "mime": "text/plain",
      "name": "prosecco75_pg_a_t150000.reconstructed.xvg",
      "origin": "reconstructed",
      "owner": "rmf2k81q8i",
      "path": "sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h/prosecco75_pg_a_t150000.reconstructed.xvg",
      "reconstructedFrom": "parsed values kept by the previous version of PMF Sequences",
      "sha256": "cff43db0a1a09c54fbd50913dcb457f4c77958ecf006753a94ba2690ce093718",
      "size": 6253,
      "uploaded": "2026-10-03T13:24:24.942Z"
    },
    {
      "id": "fmusfbism4iflj",
      "kind": "analysis-xvg",
      "mime": "text/plain",
      "name": "hist_pg_a.reconstructed.xvg",
      "origin": "reconstructed",
      "owner": "xmf2k81q9j",
      "path": "sugar-pmfs--pmf2k81000/pg--pg/klvffa--smf2k81q7h/histogram-run-1--xmf2k81q9j/hist_pg_a.reconstructed.xvg",
      "reconstructedFrom": "parsed values kept by the previous version of PMF Sequences",
      "sha256": "9ecbe9ad6b41789bddc7fdbab840baf5a31fc599f8aa6d4e2dc8698889549469",
      "size": 489,
      "uploaded": "2026-10-03T13:24:24.942Z"
    }
  ],
  "group": "prosecco75",
  "id": "smf2k81q7h",
  "literature": {},
  "name": "KLVFFA",
  "notes": {
    "cells": {}
  },
  "runs": [
    {
      "added": "2026-09-14",
      "column": "pg",
      "file": "fmusfbisljayb4",
      "id": "rmf2k81q8i",
      "methods": {
        "add": true,
        "prosecco75": true
      },
      "parse": {
        "xCol": 1,
        "yCol": 2
      },
      "slot": "a",
      "temp": 300,
      "time": "200000"
    }
  ],
  "seq": "KLVFFA",
  "structures": [
    {
      "added": "2026-09-11",
      "atoms": 80,
      "file": "fmusfbirh0mwzy",
      "format": "pdb",
      "id": "stmf2k81qak",
      "title": "file was deleted from IndexedDB"
    }
  ],
  "type": "row",
  "visibility": {}
}
```

### A note — `sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/note.md`

```markdown
---
id: nmusfbisxddd6l
type: cell-note
owner: smf2k81q0a
column: ha
---
Run b looks shifted — temperature?

- re-run at 310 K
- compare with PG
```

### A trash entry — `.matrix/trash/20261003T132426Z--run--rmf2k81q2c/trash-manifest.json`

The run's file sits next to it under `content/sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/`.

```json
{
  "deletedAt": "2026-10-03T13:24:26.070Z",
  "id": "rmf2k81q2c",
  "label": "Run 2 of WRWYCR × HA",
  "originalPaths": [
    "sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/hmrfast6_ha_b_t200000.reconstructed.xvg"
  ],
  "parents": {
    "column": "ha",
    "row": "smf2k81q0a"
  },
  "projectId": "pmf2k81000",
  "records": {
    "file": {
      "id": "fmusfbisko5cz4",
      "kind": "pmf-xvg",
      "mime": "text/plain",
      "name": "hmrfast6_ha_b_t200000.reconstructed.xvg",
      "origin": "reconstructed",
      "owner": "rmf2k81q2c",
      "path": "sugar-pmfs--pmf2k81000/ha--ha/wrwycr--smf2k81q0a/hmrfast6_ha_b_t200000.reconstructed.xvg",
      "reconstructedFrom": "parsed values kept by the previous version of PMF Sequences",
      "sha256": "bbdd73d5fb867d9b8dabb7c02c46d62aa062c60ed5dec5d0e51b26a1a8561947",
      "size": 6263,
      "uploaded": "2026-10-03T13:24:24.939Z"
    },
    "run": {
      "added": "2026-09-14",
      "column": "ha",
      "file": "fmusfbisko5cz4",
      "id": "rmf2k81q2c",
      "methods": {
        "add": true,
        "fast": true,
        "hmr": true,
        "prosecco75": false
      },
      "parse": {
        "xCol": 1,
        "yCol": 2
      },
      "slot": "b",
      "temp": 310.15,
      "time": "200000"
    }
  },
  "schemaVersion": 1,
  "type": "run"
}
```

### Cache entries

`.matrix/cache/pmf3a00000/pmf.json` (arrays shortened here):

```json
{
  "entries": {
    "edef5f2186839b262c88c594eae63f6d0e537e47f2d9e2cf5e964491dad7ca66:pmf-xy@1:1:2": {
      "source": {
        "parser": "pmf-xy@1",
        "sha256": "edef5f2186839b262c88c594eae63f6d0e537e47f2d9e2cf5e964491dad7ca66",
        "xCol": 1,
        "yCol": 2
      },
      "x": [
        0.25,
        0.2572,
        0.2644,
        "… 416 values"
      ],
      "y": [
        19.2858,
        19.0121,
        18.7914,
        "… 416 values"
      ]
    }
  },
  "kind": "pmf-series",
  "schema": 1
}
```

`.matrix/cache/parsed/9ecbe9ad6b41789bddc7fdbab840baf5a31fc599f8aa6d4e2dc8698889549469.xvg-table-1.json`:

```json
{
  "schema": 1,
  "source": {
    "parser": "xvg-table@1",
    "sha256": "9ecbe9ad6b41789bddc7fdbab840baf5a31fc599f8aa6d4e2dc8698889549469"
  },
  "table": {
    "cols": [
      [
        0.1,
        0.2,
        0.3,
        0.4
      ],
      [
        3,
        9,
        12,
        4
      ]
    ],
    "head": {
      "legends": [
        "coord 1"
      ],
      "title": "histogram analysis xmf2k81q9j (reconstructed)",
      "xLabel": "",
      "yLabel": ""
    },
    "n": 4
  }
}
```

### The head of a reconstructed file

```text
# RECONSTRUCTED by PMF Sequences — this is NOT the original upload.
# The original file was not kept by the earlier version of the app; these
# values were rebuilt from the parsed numbers it stored (x and y rounded to 4 decimals at upload).
# What: PMF run rmf2k81q1b (originally hmrfast6_ha_a_t200000.xvg)
# Source: parsed values kept by the previous version of PMF Sequences
@    title "PMF (reconstructed)"
@ s0 legend "PMF"
0.25 19.2858
0.2572 19.0121
```

## 4. Acceptance criteria

| | Criterion | How it is met | Checked by |
| --- | --- | --- | --- |
| A | No authoritative browser persistence | `projects.ts` and `structures.ts` are removed. The only browser storage left is `pmf-vault-handles` (IndexedDB) and `pmf-ui-prefs-v1` (localStorage). The legacy keys are read only by `migration/legacy.ts`. | grep over `src/`; browser run |
| B | Copyable | All paths are relative to the vault; IDs and records hold everything. | the Node and memory backends open the same layout; `vault.test.ts` |
| C | Reopenable | create → save → close → reopen gives an identical Store. | `vault.test.ts` ("gives an identical project") |
| D | Inspectable | Notes are `note.md`; originals are ordinary files; records are sorted JSON. | the listing above |
| E | Original files | Blobs are written directly, and SHA-256 is identical after reopening. | `vault.test.ts` (memory + Node); `exchange.test.ts` (v4 round trip); Chromium run |
| F | Recoverable deletion | Rows, runs, analyses, structures, curves, pages, columns, references, notes and projects go to the trash, with restore and a fallback. | `vault.test.ts` trash suite; Chromium run |
| G | Cache independence | `.matrix/cache` can be deleted, corrupted or stale, and the project is identical after rebuilding. | `vault.test.ts` cache suite |
| H | Stable IDs | Renames change slugs only; folders are resolved and relinked by ID. | `vault.test.ts` rename suite |
| I | Migration | Every entity type is converted, then verified by a fresh reopen and comparison. | `migration.test.ts`; `npm run migrate:fixture`; Chromium run |
| J | Robustness | Permission loss and write failures (banner, retry), outside edits (conflict copies), the second tab (read-only), a newer schema (read-only) and unsupported browsers (viewer) are all handled. | `vault.test.ts`; Chromium runs |
| K | Build quality | `npm run lint` (0 errors; the 7 Fast Refresh warnings were there before), `npm run build`, `npm test` (79 tests, 5 files). | all three pass |

## 5. Limitations and notes

- **Structures migrated from IndexedDB** are the UTF-8 bytes of the stored text (D22). A BOM
  or invalid bytes in the original upload can't be recovered.
- **Runs and analyses from the prototype** exist only as reconstructed files. They hold the
  rounded numbers the prototype stored, so the derived values are unchanged, but they are not
  the original uploads.
- **Writes from another machine or app** while the vault is open are caught by the
  read-before-write check and on focus. `FileSystemObserver` isn't used.
- **The File System Access adapter** was exercised in headless Chromium against an OPFS
  directory handle. The folder picker itself can't be automated, so it was stubbed to return
  that handle. The real picker, and the permission prompts on a local disk, still need a
  manual check in Chrome or Edge.
