# Feature batch 2: Phase 0 report

Spec: [`feature-batch-2.md`](feature-batch-2.md). Screenshots: [`img/batch-2/`](img/batch-2/). All
prototypes were scratch files outside the repository; nothing in `src/` or `test/` changed.

## 1. Baseline

- Branch `feature-batch-2` from `feature-batch-1` HEAD **`1b77388`** ("Final report for feature batch 1").
- `npm run lint`: 0 errors, 7 warnings (`react(only-export-components)`), as in the spec.
- `npm run build`: passes, 1 warning (direct `eval` inside 3Dmol), as in the spec.
- `npm test`: **212 tests in 14 files**, all pass.

## 2. The spec against the code

Every **verified** claim was checked against the code at `1b77388`. All hold, with these
additions and corrections:

| Claim | Finding |
|---|---|
| `test.pdb` as a `.gro`: 8 pink atoms, 9 hydrogens with more than one bond | Reproduced: **9 pink** and 9 multi-bonded H. The ninth pink atom is the `001` oxygen, which becomes element `0` in a `.gro` too. |
| x 0–0.1 gives `0.0, 0.0, 0.0, 0.1, 0.1, 0.1` | Confirmed. Also: **x and y 0–0.004 give `0` for every tick**, and y 0.2–0.32 gives `0.2, 0.23, 0.25, 0.28, 0.3`. |
| Cell view, one run, several curves: palette colours, all solid | Confirmed. **Also:** in the cell view with **several runs**, all curves of one run get that run's colour *and* dash (`pushData`, base `color`/`dash`), so the curves of one run can't be told apart either. |
| Row view: one multi-curve analysis shares colour and dash | Confirmed (`base.own` is unset in the row view, so `dash` stays `'none'` unless *all runs* is on). |
| Peak tile on smoothed curves | Confirmed. It also counts curves of **dimmed** runs (`q.vis !== 'off'`). |
| `PALETTE` ≥ 4.8:1 | Measured 4.78:1 at worst (light theme), 5.3:1 on export white, 6.6:1 in the dark theme. The export dimmed grey `#b8b3b0` is 2.1:1 on white. |
| 3Dmol opened/closed 21 times | Not re-run in Phase 0; the R1c manual check reopens ten times. |

## 3. R1: 3D viewer

### Current behaviour

- `Viewer` (`StructurePanel.tsx`) calls `v.addModel(text, meta.format)` with no options. The
  default style is `meta.atoms > 800 ? 'cartoon' : 'stick'`. Cartoon also sets
  `{ hetflag: true } → stick`.
- **Elements, from the 3Dmol 2.5.5 source:**
  - **GRO parser.** It always calls `atomNameToElem(name, true)`, and has no hydrogen filter. Bonds come from `assignPDBBonds`. It never computes secondary structure.
  - **PDB parser.** It reads the element from columns 77–78, but checks it **case-sensitively** against `bondTable`, whose keys are `Cl`, `Na`, `Fe`. A standard uppercase `CL` or `FE` is therefore ignored, and the element is guessed from name columns 13–14. Hydrogens are dropped unless `keepH` is set.
  - **`atomNameToElem`.** It upper-cases the first letter and lower-cases the rest, then:
    - drops to the first letter when the result isn't in `bondTable`, so `1HB` → `1`;
    - special-cases only `Ca` and `Cd` for non-hetero atoms, so in a `.gro`, `NE` → neon and `SG` → `Sg`, which falls back to `S`.
  - **Unknown elements.** They get colour `0xff1493` (`elementColors.defaultColor`) and bonding radius 1.6 Å (`bondLength`), which makes the fans.
- **Cartoon needs atoms that the PDB/GRO bond assignment marks as protein.** It uses `reschain`,
  which `assignPDBBonds` sets only for residues in `standardResidues` without `hetflag`, plus
  secondary structure, which only the PDB parser computes.

**Reproduced in a scratch page** (3Dmol 2.5.5, headless Chromium, SwiftShader). Counts read from
`getModel().selectedAtoms({})`:

| File, sticks | Today | Proposed |
|---|---|---|
| `test.pdb` as `.gro` (58 atoms) | 9 pink, 9 H with >1 bond, elements `N C O H 3 0` | 0 pink, 0; `001` not drawn and named |
| `test.pdb` | 1 pink (`001`, element `0`) | 0 |
| `WTA.gro` | 0, 0 | 0, 0 |
| Peptide + WTA in one `.gro` (synthetic), cartoon | 9 pink, 9; only the ribbon, the sugar is missing | 0, 0; ribbon plus sugar sticks |

Screenshots: today `r1-gro-sticks-today.png` (your pink fans), `r1-pdb-sticks-today.png`; fixed
`r1-gro-sticks-fixed-H.png`, `r1-gro-sticks-fixed-noH.png`, `r1-pdb-sticks-fixed-noH.png`.

### Proposed change

1. **`elementOf(name, resn, elementColumn?)`**, pure, in `structFile.ts`. Rules, in order:
   - **Element column.** A real element in the `.pdb` column wins, read case-insensitively.
   - **Water** (`SOL`, `WAT`, `HOH`, `TIP3/4/5`, `SPC`, `SPCE`, `T3P/T4P/T5P`):
     - `O…` → O;
     - `H…` → H;
     - anything else (`MW`, `LP1`, `EP`) is a virtual site, **not drawn**.
   - **Ions.** In an ion residue (`NA`, `SOD`, `NA+`, `CL`, `CLA`, `K`, `POT`, `CA`, `CAL`, `MG`, `ZN`), the two-letter element: `CA` → Ca, `CLA` → Cl.
   - **Leading digits are stripped:** `1HB` → `HB` → H.
   - **Other residues: the first letter.** In protein residues `NE` → N, `CA` → C, `CD` → C, `SG` → S, `OG` → O. In a non-protein residue, `CL`, `BR`, `FE`, `ZN` and `MG` are read as two letters, so a heme's iron is Fe while its nitrogen `NA` stays N.
   - **Anything else is undecided.** For example a name made only of digits, like `001` in a `.gro`. The atom is not drawn and is named under the viewer: "1 atom not drawn: element unknown (GLY 001)".
2. **How the elements reach 3Dmol.** A pure `toPdb(text, format)` writes one PDB text for *both*
   formats, with the decided element in columns 77–78, written as `Cl`, not `CL`, because 3Dmol
   checks case-sensitively. It also writes:
   - `ATOM` for protein residues and `HETATM` for everything else;
   - GROMACS residue names mapped for 3Dmol's residue list: `HISE/HISD/HISH/HIE/HID/HIP` → HIS, `LYN` → LYS, `ASH` → ASP, `GLH` → GLU, `CYX/CYM` → CYS, AMBER termini `NALA`/`CALA` → ALA;
   - coordinates converted from nm to Å.

   The viewer then calls `addModel(pdb, 'pdb', { keepH })`. Evidence from the source:
   - **The element column is used** when it is in `bondTable` (PDB parser, `elem = line.substring(76, 78)`).
   - **Protein residues get proper bonds and `reschain`:** `assignPDBBonds` treats residues that are standard and not `hetflag` as protein.
   - **Secondary structure is computed** only on this path (`computeSecondaryStructure` in `getSinglePDB`).
   - **`keepH` applies equally to both formats.**

   *Rejected:* fixing the parsed atoms and rebuilding bonds. The only public rebuild,
   `GLModel.assignBonds()`, uses distance-only bonding. It doesn't set `reschain`, which cartoon
   needs, and `.gro` would still get no secondary structure.

   *Limits of the conversion:*
   - residue names are truncated to 3 characters (3Dmol reads only 3 anyway);
   - residue numbers wrap above 9999 and atom serials above 99999 (bonding of water and ions is distance-based, so they are unaffected);
   - atom names are truncated to 4 characters.
3. **`structStyle(info, look)`**, pure: what the structure contains and the chosen look in, the
   default look and the 3Dmol selections out. `info` holds the counts of protein residues, other
   residues, water, ions and atoms.
   - **Cartoon:**
     - `{}` → cartoon (spectrum);
     - `{ hetflag: true }` → sticks (0.16 Å): sugars, ligands, everything outside the protein, which `toPdb` marks HETATM in both formats;
     - `{ hetflag: false, not: { atom: ['N', 'C', 'O'] } }` → thin sticks (0.1 Å): side chains under the ribbon.

     If there is no protein, cartoon shows everything as sticks and says "no protein backbone — shown as sticks".
   - **Lines** become thin sticks (0.06 Å). WebGL draws `line` 1 px wide on most platforms.
   - **Hydrogens:** a "hydrogens" toggle. It reloads the model with `keepH` and is the same for both formats.
4. **Viewer** (`StructurePanel.tsx`) uses all three. Theme, spin, reset and lazy loading are
   unchanged. Undrawn atoms and the cartoon fallback are explained in an `aria-live` line under
   the canvas.

**Files:** `src/lib/structFile.ts`, `src/components/StructurePanel.tsx`, `test/structure.test.ts` (new).

**Budget:** R1a about +70 / −2, R1b about +30 / −8, R1c about +30 / −10. Total about +130 / −20.

**On-disk impact:** none. Originals are untouched; the PDB text exists only in memory.

### Tests (`test/structure.test.ts`)

- `elementOf` table:
  - `1HB`, `3HA` → H;
  - `NE` in ARG → N;
  - `CA` in GLY → C, in ion residue CA → Ca;
  - `SG` in CYS → S;
  - NA, SOD → Na; CL, CLA → Cl;
  - `OW`/`HW1` in SOL → O/H;
  - `MW` in SOL → not drawn;
  - empty PDB element column → from the name;
  - uppercase `CL` and `FE` columns → Cl, Fe;
  - `test.pdb`'s `001` with element `0` → as decided (question 4);
  - `001` in a `.gro` → undecided.
- `toPdb`:
  - every element of `test.pdb`, `WTA.gro` and `test.pdb`-as-`.gro` is a 3Dmol-known element;
  - the `.gro` coordinates come out in Å;
  - residue mapping;
  - ATOM vs HETATM;
  - columns are where 3Dmol reads them (checked with the same `substring` offsets as its parser).
- `structStyle` table:
  - `test.pdb` → sticks;
  - a `.pdb` protein with a HETATM ligand → cartoon with ligand sticks;
  - `WTA.gro` → sticks, and cartoon falls back with a note;
  - a `.gro` protein → cartoon;
  - a `.gro` protein with a sugar → cartoon plus sugar sticks;
  - an empty file → "no atoms".

  The `.gro` protein cases are synthetic until you send a real system (question 3).

### Risks

- **GROMACS residue names I haven't seen** (lipids, glycans in your force field) would be drawn as HETATM sticks, which is safe, but the element rules may meet names they don't cover. Those atoms are reported, never drawn pink. Your real files settle this.
- **The PDB text doubles the memory** of a large system briefly. That's fine up to some 10⁵ atoms; larger systems are already slow in 3Dmol.

### Open questions

Questions 1–7 in section 8.

Screenshots for the visual choices:
- **Hydrogens:** `r1-gro-sticks-fixed-H.png` vs `r1-gro-sticks-fixed-noH.png`, and `r1-wta-sticks-fixed-H.png` vs `r1-wta-sticks-fixed-noH.png`.
- **Cartoon:** `r1-pdb-cartoon-today.png` vs `r1-pdb-cartoon-proposed.png`, `r1-wta-cartoon-today.png` (empty) vs `r1-wta-cartoon-proposed.png`, `r1-pepsugar-cartoon-today.png` vs `r1-pepsugar-cartoon-proposed.png`, and `r1-wta912-cartoon-today.png` (the 912-atom `.gro` opens empty).
- **Lines:** `r1-lines-1px.png` (today), `r1-lines-thin-sticks.png`, `r1-lines-dots.png`, plus the dark variants.

## 4. R2: tick labels

### Current behaviour

`buildPlotMulti` (`seq.ts`):
- **Tick positions:** `nice()` picks 1, 2, 2.5 or 5 × 10ⁿ, rounded with `+v.toFixed(6)`.
- **x labels:** `toFixed(x1 − x0 ≥ 20 ? 0 : 1)`.
- **y labels:** `String(+v.toFixed(2))`.

Today's labels:

| Range | x labels | y labels |
|---|---|---|
| 0–1.5 | `0.0, 0.3, 0.5, 0.8, 1.0, 1.3, 1.5` | — |
| 0.25–3.25 | `0.5, 1.0, …, 3.0` | — |
| 0–0.1 | `0.0, 0.0, 0.0, 0.1, 0.1, 0.1` | `0, 0.02, …, 0.1` |
| 0–0.004 | `0.0` × 5 | `0` × 5 |
| −15–20 | `-10, 0, 10, 20` | same |
| 0–200000 | `0, 50000, …, 200000` | same |
| `yStep` 5 | — | `-10, -5, 0, 5` |

### Proposed change

The step chosen by `nice()` (or `yStep`) decides the number of decimals. A 2.5 × 10ⁿ step needs
one more decimal than its power of ten. Each label is `v.toFixed(d)` with trailing zeros trimmed,
and `-0` becomes `0`. `nice()` returns its step next to the values, so both axes share one small
`tickLabel(v, step)`. Values of 1 and more with whole-number steps keep today's integer format;
200000 stays `200000`. Positions are untouched.

**Files:** `src/lib/seq.ts`, `test/plot.test.ts` (new).

**Budget:** about +12 / −4.

**On-disk impact:** none.

**Tests:**
- `tick labels show the tick's true value`, a table over:
  - the seven ranges above, x and y;
  - 0–0.004 (step 0.001);
  - the 5 kJ/mol `yStep`.
- `tick positions are unchanged`: positions compared with the values today's code produces, recorded in the test.

**Risks:** none known. The exports and Compare use the same function.

**Open question:** question 8.

## 5. R3: analysis markers

### Current behaviour

- **The PMF minimum is computed twice.**
  - On screen: `markers` in `DetailDialog.tsx` runs `runStats(series.y)`.
  - In exports: `graphScene` in `export.ts` runs `runStats` again, behind `GraphSeries.marker: boolean`.
  - Compare does the same with its own series (`marker: true`).
- **The Peak tile** loops over every curve of every run that isn't hidden, on `shownY` (the smoothed curve), and reports the overall maximum.
- **Smoothing** is set per analysis type: `AnalysisType.smooth`, `smoothOf`, with `setSmooth` in the dialog and `updA` in Settings.

### Proposed change

1. **`curveExtreme(x, y, kind)`**, pure, in `seq.ts`. It returns `{ i, x, y }` or `null`:
   - `null` and non-finite points are skipped;
   - on ties, the first point wins;
   - no finite point → `null`.

   **The PMF minimum moves to it too.** A test shows the marker position is unchanged against `runStats` for the PMF fixture.
2. **`AnalysisType.marker?: 'max' | 'min' | 'none'`** (additive) and `markerOf(t)` with defaults by
   type (question 9). It is set with a three-way `Seg` next to Smoothing, in the graph settings
   (`GsRow`) and in Settings → Analyses.
3. **Series carry what to mark.** `Series.mark` replaces `marker: boolean` and holds the marked
   point `{ x, y }`, or nothing. It is computed once, while the series are built (on the drawn,
   possibly smoothed `y`). `Plot` and `graphScene` only draw it.
   - Dimmed curves get dimmed markers.
   - Hidden curves have no series, so no marker.
   - **Step-style histograms** are marked at the bin's stored x (`rx`/`ry`), not at a staircase corner.
4. **The tile.**
   - With max or min it reads "Maximum" / "Minimum" (plus " · smoothed" when smoothing is on), the value, "at x = …", and the curve's legend.
   - With "none", today's Peak tile stays.
   - It reports the overall extreme among the shown curves (dimmed ones count, as today).
5. **Look:** see question 10 and `r3-marker-looks.png`.

**Files:** `src/lib/seq.ts`, `src/lib/types.ts`, `src/lib/export.ts`,
`src/components/DetailDialog.tsx`, `src/components/CompareDialog.tsx` (passes the PMF point
instead of a boolean), `src/components/Plot.tsx` (only if the halo look is chosen),
`src/components/SettingsDialog.tsx`, `test/markers.test.ts` (new).

**Budget:** R3a about +15, R3b about +20 / −2, R3c about +45 / −25. Total about +80 / −27.

**On-disk impact:** one additive key, `marker`, in `analyses.json`.
- An older app keeps it, so no schema bump (F30 precedent; `smooth` was added the same way).
- `readSettings` takes each analysis object whole, and both editing paths spread the existing object (`{ ...a, ...patch }`). `settingsFiles` writes the objects back unchanged. Exports carry `settings.analyses` unchanged.
- A test reads an `analyses.json` with `marker`, edits another field through that path, writes it back, and finds `marker` intact.

**Tests:**
- `curveExtreme` table: max and min, ties, `null` and `NaN`, all `null`, one point, smoothed vs raw.
- `PMF marker unchanged`.
- `one marker per shown curve; none hidden; dimmed dimmed`.
- `marker key survives analyses.json round trip and an older-app edit`.
- `export scene circles equal screen markers`: both come from `Series.mark`; the test checks the circles in `graphScene` against those points.

**Risks:**
- The maximum of a raw, noisy RDF is a noise spike (see `r3-marker-looks.png`: 1.02 at 1.34 on the plateau of the real sugar RDF). With smoothing the marker can sit at the end of the curve. That's honest but may surprise; the tile says "smoothed".
- R4 changes how series get colours and visibility, so R3 builds markers from the series, and R4 then only has to change the series.

**Open questions:** questions 9–11.

## 6. R4: curve colours, visibility and shade

### Current behaviour

As the spec describes, plus the several-runs case in section 2:
- `runHue` gives run 1 the column colour, run 2 black or white, and run 3 onwards other columns' colours.
- Several curves of one run in the cell view cycle through `PALETTE`, all solid.
- In the row view they share colour and dash.
- Visibility exists per slot only (`store.vis`, `visOf`, which **keeps only slot keys**, so an older app drops anything else).
- Exports use the light colour, and `#b8b3b0` for dimmed curves. `rgb()` reads only hex and `rgb()`.

### Proposed change

1. **`curveShade(column, theme, i, n, adjust)`**, pure, in a new `src/lib/shade.ts`. The colour
   maths has two users (the screen series and the export series), and `seq.ts` is already long.
   - It works in OKLCH, about 30 lines of colour conversion with no dependency.
   - Curve 0 keeps the column colour.
   - All *n* curves get evenly spaced lightness steps (at most 0.08 apart), darker first on a light background and lighter first on a dark one.
   - They stay inside the band with at least 3.2:1 against the background they are drawn on (theme `--bg` or export white), and away from pure black or white so the hue stays visible.
   - `adjust` moves a curve by whole steps of 0.04 lightness, clamped to that band.
   - **Black and white** gives greys from the same rule with chroma 0.
   - It returns hex.

   **Measured** (`r4-default-shades.png`): 3 and 10 curves for O26, PG and HA, in light, dark and export, all distinct, all at least 3.4:1.
2. **Positions are stable.** Within a cell, each curve's position *i* counts over all curves
   present (run order, then curve order), including hidden ones. Hiding a curve therefore never
   recolours the others. The dash pattern is `DASH[i]`, so colour is never the only difference.
   In the row view, positions count within each column.
3. **Black and white** is a graph setting next to Smoothing, kept as a browser preference like
   the theme (question 13). Exports follow it.
4. **Per-curve visibility.** Each row of the Curves list gets the run chips' button (`nextVis`,
   `VIS`: shown → dimmed → hidden). Hidden curves are left out of series, markers and tiles.
   Dimmed curves stay in the tiles, as dimmed runs do today, and are drawn at 30 % opacity with
   dimmed markers. A hidden run hides all its curves.
5. **Per-curve shade.** Next to the legend: "lighter" and "darker" buttons and a reset, steps
   −3 … +3 (question 15, `r4-adjust-range.png`). The swatch, legend, curve and marker follow.
6. **Persistence** (question 16):
   - **(a) On the curve record** (recommended, as the spec suggests). `CurveRec` gets `vis?: 'dim' | 'off'` and `shade?: number` (omitted when shown and 0), and `Curve` gets the same. This means:
     - schema 3, with a `MIGRATIONS` step whose only write is the manifest bump; the backup is empty, and an older app opens the vault read-only;
     - export v6, with v5, v4 and v3 still importing;
     - frozen schema-2 and v5 fixtures first (R4-0).
   - **(b) Browser preferences** keyed by curve id: no format change, but lost when the vault moves to another computer, and not in exports.

**Files:**
- `src/lib/shade.ts` (new), `src/lib/seq.ts`, `src/lib/types.ts`, `src/ctx.ts` (`runHue` goes);
- `src/components/DetailDialog.tsx`, `src/lib/export.ts`, `src/lib/prefs.ts` (black and white);
- with (a): `src/lib/storage/records.ts`, `plan.ts`, `model.ts`, `manifest.ts`, `exchange.ts`;
- tests `test/shade.test.ts` and `test/curves.test.ts` (new), and `test/formats.test.ts` extended.

**Budget:** R4a about +60, R4b about +40 / −25, R4c about +25, R4d about +30, R4e about +35 / −5.
Total about +190 / −30.

**On-disk impact:** with (a), schema 3, export v6, `CurveRec.vis` and `shade`. The migration step
changes no record. With (b), none.

**Tests:**
- **`curveShade`:**
  - 1–10 distinct;
  - every `PALETTE` colour in light, dark and export ≥ 3:1;
  - adjustments clamped;
  - black and white gives greys;
  - output is hex;
  - deterministic.
- **Series building:**
  - no other column's hue;
  - the hidden curve, and every curve of a hidden run, are left out of series, markers and tiles;
  - dimmed curves stay in the tiles;
  - positions are stable when a curve is hidden.
- **With (a):**
  - round trip;
  - upgrade of the frozen schema-2 vault, also interrupted;
  - schema-4 vault read-only;
  - export v6 round trip;
  - v5, v4 and v3 exports import.

**Risks:**
- **Shades of one hue are subtler than today's palette.** Ten curves differ by about 0.035 lightness each, so the dashes do most of the work (`r4-default-shades.png`, the 10-curve rows).
- **PMF cell graphs change colour** if question 12 is "yes".
- **Interaction with R3:** markers come from the series, so they follow shade and visibility without extra code.

**Open questions:** questions 12–17.

## 7. Order

The section 3 order is confirmed: R2, R1a–R1c, R3a–R3c, R4-0, R4a–R4e. One note: R1a and R1b
can be built and tested on the fixtures before your files arrive. Only R1c (defaults, water and
ions) waits for them. If the files are late, I would finish R1a/R1b, do Phase 2, and come back for
R1c.

**Playwright smoke test:** not proposed. A dev dependency on `@playwright/test`, plus its browser
download in CI, would be the cost. The scratch scripts used here (SwiftShader WebGL, atom checks
through `getModel().selectedAtoms`) cover the manual checks without it.

**Real GPU:** this environment has no GPU; every 3D check here runs through SwiftShader. One run on
a real GPU is yours to do (question 18).

## 8. Questions

1. **Your file with the pink bonds.** Please send it. I reproduced the cause with `test.pdb`
   written as a `.gro` (9 pink atoms, 9 hydrogens with several bonds). Your file confirms it,
   and shows which names your force field uses.
2. **Hydrogens by default.**
   - (a) Hidden in both formats, with a "hydrogens" toggle.
   - (b) Shown in both formats, with the toggle.
   - **Recommendation: (a).** It matches 3Dmol's `.pdb` default and the cleaner look (`r1-gro-sticks-fixed-noH.png`); the toggle shows them in one click.
3. **A real system file** (protein, sugar, water, ions) to decide the default style, the hiding of
   water and ions, and the residue names. For it:
   - (a) Large systems hide water and ions by default, with a toggle.
   - (b) Show everything.
   - **Recommendation: (a)** for structures with more than 800 atoms that contain water. This is to confirm with your file.
4. **`test.pdb`'s `001` atom with element column `0`.**
   - (a) A `0` in the element column is read as O: a zero typed for the letter O, the only reading that fits its geometry (the C-terminal oxygen).
   - (b) Not drawn, and named under the viewer.
   - **Recommendation: (a)**, narrowly: only the single character `0`. In a `.gro` there is no element column, so `001` is undecided either way and is reported.
5. **Default style.**
   - (a) No protein backbone → sticks. A backbone with fewer than 30 residues → sticks (your sequences are short peptides, and a ribbon hides them). 30 or more residues → cartoon with side chains and everything else as sticks.
   - (b) Cartoon whenever there is a backbone.
   - **Recommendation: (a).** Screenshots: `r1-pdb-cartoon-proposed.png` (a 10-residue ribbon) vs `r1-pdb-sticks-fixed-noH.png`.
6. **Side chains under the cartoon:** thin sticks (0.1 Å), as the old comment intended (`r1-pepsugar-cartoon-proposed.png`).
   - (a) Yes.
   - (b) Only the ribbon plus the non-protein residues.
   - **Recommendation: (a).**
7. **Lines.**
   - (a) Replace with thin sticks (0.06 Å), keeping the name "lines" (`r1-lines-thin-sticks.png`).
   - (b) Lines plus small atom dots (`r1-lines-dots.png`).
   - (c) Keep 1-px lines (`r1-lines-1px.png`).
   - **Recommendation: (a).**
8. **Tick decimals.**
   - (a) Trimmed per label: `0, 0.25, 0.5, 0.75, 1`.
   - (b) The same decimals on the whole axis: `0.00, 0.25, 0.50`.
   - **Recommendation: (a)**, as the spec proposes. Large values keep `200000`, with no separator: a thin space would be wrong in exported xvg-adjacent text, and other units are out of scope.
9. **Default marker per analysis type.**
   - Proposal:
     - RDF → maximum (first-shell peak);
     - RMSF → maximum (most flexible residue);
     - histograms → **none** (22 umbrella windows would give 22 dots);
     - RMSD, Rg, H-bonds, distance, energy and new analyses → none.
   - **Recommendation:** as proposed.
10. **Marker look** (`r3-marker-looks.png`).
    - (A) A filled 3.5-px dot like the PMF minimum.
    - (B) A ring with a value label.
    - (C) A dot with a drop line.
    - (D) A 4.5-px dot with a background halo.
    - **Recommendation: (D).** It stays visible on noisy lines; the value goes in the tile, not on the plot. The PMF marker stays as it is.
11. **Markers per curve or overall** (`r3-marker-per-curve.png`).
    - **Recommendation: one per shown curve**, as the spec proposes. The tile names the overall extreme.
12. **PMF curves in the cell view under the same colour rule** (shades of the column colour,
    instead of run 2 black and run 3 another column's colour).
    - **Recommendation: yes** (`r4-three-runs.png`). Compare stays as it is.
13. **Where black and white lives.**
    - (a) A graph setting next to Smoothing, kept as a browser preference like the theme, for every graph in the detail dialog.
    - (b) The same, but saved per project.
    - **Recommendation: (a).** Compare isn't affected.
14. **Black-and-white greys** (`r4-three-runs.png`, bottom rows).
    - (a) Greys spread by the shade rule, plus dashes.
    - (b) Every curve black, with dashes only.
    - **Recommendation: (a).**
15. **Shade adjustment range** (`r4-adjust-range.png`).
    - (a) −3 … +3 steps of 0.04 lightness.
    - (b) −2 … +2.
    - **Recommendation: (a).** Some steps clamp at the contrast limit in the dark theme, which is shown.
16. **Persistence of each curve's shade and visibility.**
    - (a) On the curve record: schema 3, export v6, a no-op migration, frozen fixtures first.
    - (b) Browser preferences only.
    - **Recommendation: (a)**, as the spec recommends.
17. **The two hidden-flag backlog items.**
    - Moving a hidden run in the run editor leaves the flag on the old slot (`updateRun`).
    - Deleting a hidden run leaves the flag on the empty slot (`deleteRun`).

    Both are in the same visibility code R4 touches. The fix is about 8 lines in `seq.ts`, plus 2 tests:
    - the flag moves with the run;
    - the flag goes when the slot is left with no run and no analysis.

    It is safe: no format change.
    - **Recommendation: fix them in R4c.**
18. **Real GPU.** Every 3D check here runs through SwiftShader. Can you run the R1 manual checks
    once in Chrome on your machine after R1c? I'll list them as "not run on a real GPU" until then.
