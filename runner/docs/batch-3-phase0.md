# Batch 3 — Phase 0 report

The plan for [`batch-3.md`](batch-3.md): baseline, the spec checked against the code, the design pass, a plan for each request, the samples I need, size and order, and **one numbered list of questions (§8)**. Nothing in `src/`, `server/` or `test/` changed in Phase 0. The design contract draft is [`design-contract.md`](design-contract.md); the roadmap has a Batch 3 section.

**Branch.** Phase 0 is committed on `cypher-batch-3`, made from `a2b422e`, which tracks `claude/clever-dijkstra-mf14ej` (the branch you named).

---

## 1. Baseline

**Baseline commit: `a2b422e`** ("Keep only the runner here: the website moves to the-matrix, as a pinned submodule"), the Matrix at `e9a64df`, Node v22, the fake `gmx`.

| Check | Spec §3 | Measured | |
|---|---|---|---|
| `npm run lint` | 0 warnings, 0 errors, 182 files | exit 0, no output (oxlint 1.x prints nothing when clean) | same result |
| `npm run build` | main 625 kB; (de)Cypher 123 kB; 3Dmol 574 kB | main 625.45 kB, Decypher 122.83 kB, 3Dmol 574.10 kB | same |
| `npx vitest run` | 664 passed, 1 skipped, in 64 files | 664 passed, 1 skipped (63 files + 1 skipped) | same |
| `npx playwright test` | 6 passed | 6 passed | same |
| `matrix/` | pinned, unchanged | pin check ok; the Matrix's own tests: 658 passed in 46 files; `tsc -b` clean | same |

Nothing failed. Real GROMACS was available for reading help texts and dumps: 2023.3 (`/usr/bin/gmx`) and 2025.4 (a scratch build from batch 2). 2023.3 can't read the fixtures' `.tpr` (tpx 137, written by 2025).

## 2. The spec checked against the code

Everything in spec §3 was re-checked. Confirmed unless the table says otherwise.

| Claim (§3 or a request's "Today") | Found |
|---|---|
| Nine UI strings carry ticket numbers | **Ten.** Also `src/lib/commands.ts:118` "… as another RDF (T35)" (the `-cn` output's reason). The others are as listed: `commands.ts` 185, 186, 231, 232, 284, 376; `Result.tsx` 225, 242; `Wham.tsx` 130. Found with a TypeScript-scanner script over string literals, template text and JSX text in `src/` and `server/`. |
| `primary` coral, `ring` coral-strong, light `destructive` = coral-strong | Confirmed (`#c62410` both). Dark `destructive` `#f47b74` is close to dark coral-strong `#ff6a4d` too (OKLab ΔE 0.047). |
| `TONES` three times | Confirmed: `lib/tones.ts:3`, `decypher/kit.ts:95`, `views/Result.tsx:123` (`TONES_FOR_TERMS`); `decypher/parse.ts` re-exports the kit's. |
| `DASH` three times (10, 10, 6) | Two in gmx-cypher (`ui/line-chart.tsx:7`, 10; `kit.ts:97`, 6) plus the Matrix's (`matrix/src/lib/graph.ts`, 10 with `DASH_NAMES`). |
| `niceTicks`, ranges, structure parsing | Confirmed. Note: the kit's `buildMol` builds the drawable from an already-parsed `Struct`; the parsers are `lib/atoms.ts` (`atomTable`, through the Matrix's `elementOf`), `lib/box.ts` (`atomCoords`) and `decypher/parse.ts` (`parseGro`, `parsePdb`). |
| 18 hex values in `kit.ts` (`NEUTRAL`) | Confirmed (`kit.ts:111–114`). |
| "first peak" stat under "the dot marks each curve's maximum" | Confirmed (`Result.tsx:104`, `:108`). `lib/rdf.ts:119` already names the rules: `Peak.rule` is `'first shell' \| 'maximum'`. |
| Gesture conflicts | Confirmed, with one detail: the kit pans on **any non-left button or Alt-drag** (`kit.ts:522`), so right-drag pans in compare already; its Shift-click **adds** like ⌘ (`kit.ts:540`), where the picker's Shift-click takes the residue. |
| Only D can be rebound | Confirmed (`lib/shortcuts.ts`). **`lib/keys.ts` (spec §7) is React list keys, not keyboard keys**; the keyboard is `lib/shortcuts.ts`, `Viewer.tsx:99` (C held) and `:199` (B), `Decypher.tsx:477–481` (F, R, [, ]). |
| SIGHUP: "gmx keeps running unwatched and no record is written" | **Half true.** `main.ts:53–55` handles SIGINT and SIGTERM only, so SIGHUP ends Node without `stopAll`. But jobs are spawned with **stdout and stderr piped to the runner** (`jobs.ts:98`), so once the runner is gone, the job's next write to those pipes raises SIGPIPE and it dies. Checked with a stand-in job (a shell loop writing to stderr, spawned exactly as `jobs.ts` does): with the parent killed by SIGHUP it never finished; the same job under a living parent did. gmx writes its frame progress to stderr, so it should die the same way (not run with a real gmx). Result: partial outputs, no record, "interrupted" at the next start. |
| The record is written only at the end; not atomic | Confirmed (`runs.ts:278`: flag `wx` with groups, `w` over a file claimed empty at the start without groups; comment at `runs.ts:197`). |
| Record format | **Already version 3** (`lib/record.ts:21`; `recordProblems` reads 1–3, refuses 4 in words). `status` already allows `'running'`, and unknown fields are ignored. So question 3 is "v3 with optional fields, or v4", not "v1 or v2". |
| Startup replays every ndjson and keeps every log | Confirmed (`jobs.ts:40`, `:62–69`, `:109`). Already on demand on the page: `GET /api/jobs` sends jobs without logs (`api.ts:34`, `:79`) and the page fetches one log with `GET /api/jobs/:id` (`src/jobs.ts:42`). The memory cost is server-side only. |
| AWH and WHAM palettes | Confirmed (`Result.tsx:179`, `:221`: `TONES_FOR_TERMS[i % 8]`, dash `floor(i / 8)`). At most 12 AWH frames drawn (`spread`). |
| AWH axis label from gmx | Confirmed: "(nm, deg or lambda state)" from gmx. **Dump checked** (2025.4, `test/fixtures/awh/topol.tpr`): `pull-coord 0:` … `potential-provider = awh`, `geometry = distance`; `awh1-dim1:` `coord-provider = pull`, `coord-index = 1`, `start = 0.3`, `end = 0.8`. The dump numbers pull coordinates **from 0**, AWH's `coord-index` **from 1**. |
| H-bond pairs | Confirmed: `test/fixtures/hbond/new/hbond_nvt_hbonds.ndx` has `[ hbonds_sulfate-water ]`, donor–hydrogen–acceptor triplets; the legacy tool writes none. |
| The Matrix's `density` and `order` types | Confirmed in `matrix/src/lib/seq.ts:293–294`. `gmx order -h` (identical in 2023.3 and 2025.4) says under KNOWN ISSUES: "This tool only works for saturated carbons and united atom force fields." Your recollection is right. |
| *One graph* draws past the plot's right edge | **Not reproduced from the code.** The kit's `chart()` sets its x domain over every curve (`kit.ts:714–715`); a probe with a curve cut short, either one leading, kept every path inside the plot. What *is* real: the y domain always starts at 0, so negative values (a PMF, an energy) fall below the axis. The kit's chart also always draws the dashed g = 1 line and defaults its y label to g(r): it is an RDF chart. All three go with R5. I'll re-check the screenshot's case in the browser with R5. |
| Axis labels | **Found:** both charts upper-case their axis labels (`kit.ts:724`, `:731`; `line-chart.tsx:113`, `:136`), so "r (nm)" reads "R (NM)" and "kJ/mol" would read "KJ/MOL". Units are case-sensitive. Stat labels upper-case group names too ("FIRST PEAK · WATER_O"). Question 33. |
| Status captions | 67 status glyphs (✓ 25, ✗ 42, no ⚠) in 16 files, plus muted captions that are really statuses ("no atom groups", "68 of 3242 atoms lie outside it", "the first N only"). Table in §4, R9c. |
| The Matrix's export pipeline fits R6 | **Proved.** A fixture RDF (`rdf_o111_Methionine_H.xvg`, 13 curves) through `graphScene` → `toSVG` and `toPDF`, by import, in Node: 13 paths, the tones as `-strong` lines, `DASH` by index, 0 external references in the SVG; the PDF is `%PDF-1.4`, one page, ends in `%%EOF`, and draws `pins` (the maximum and a g = 1 line). Rendered: [`img/batch-3/export-proof-pdf.png`](img/batch-3/export-proof-pdf.png). The Matrix's look upper-cases the title and puts a vermilion kicker above it. |
| A space outside the project folders is invisible to the Matrix | **Proved on a scratch vault** with the Matrix's own code: a vault made with `newVault`, one RDF, then `reopen` (the Matrix's `Vault.open` + `openProject`) before and after adding `<vault>/gmx-cypher/` (space.json, README.md, records/…, projects/…/views/…). The project list and the load report (untracked, missing, warnings, conflicts, relinked) are identical. The same files **inside** the project folder are all listed as untracked. |
| The kit's palette | `kit.palette()` reads the resolved Morpheus tokens; only `NEUTRAL` is hard-coded. |

## 3. Design pass

### 3.1 Plan

**Colour roles** (both themes; the role layer is `src/roles.json` over a verbatim `tokens.json`):

| Role | Token | Light | Dark | Measured |
|---|---|---|---|---|
| UI state | `state`, `state-foreground` | `#201e1d` on `#f3f2f2` | `#f0eeec` on `#141312` | 14.9:1 and 16.0:1 |
| Focus ring | `ring` → `state` | `#201e1d` | `#f0eeec` | ≥ 13.7:1 on `background`, `card` and `field` |
| Error | `destructive` | **`#8f1d1d`** | **`#fd2a6d`** | text 7.96:1 / 5.06:1 on `background`, 7.34:1 / 4.63:1 on `card`; label on it 8.89:1 (white) / 4.53:1 (ink) |
| Group | `<tone>`, `<tone>-strong` (unchanged) | e.g. sky-strong `#1a5fb4` | `#6aa9ff` | every `-strong` ≥ 4.57:1 on `background` and `card`; `<tone>-foreground` on `<tone>` ≥ 7.44:1 |
| Reference | `foreground`, as an outline | `#201e1d` | `#f0eeec` | — |
| Ordered series | `ramp-0…3` | `#a5700d #a83903 #891151 #3f1a69` | `#a57710 #e97c48 #fd9cba #e3d6fe` | worst step 3.52:1 (light, on `card`) / 4.24:1 (dark); 4.27:1 on the print export's white |
| Neutral | `atom-c`, `atom-h`, … `bond`, `edge` | the kit's 18 values, moved | | |

- **Why `#8f1d1d` / `#fd2a6d`:** the nearest colours in OKLab are rose-strong (ΔE 0.111) and coral-strong (0.119) in light, coral-strong (0.114) and today's dark destructive (0.125) in dark. Threshold: **ΔE_OK ≥ 0.10**. A just-noticeable difference is about 0.02, so 0.10 is about five steps apart, and every group tone, `ring` and `primary` clears it. Today's pair is 0.000 (light) and 0.047 (dark).
- **The ramps** run in OKLCH from ochre through rust and plum to indigo (light, getting darker) and from ochre to lilac-white (dark, getting lighter), so time reads as lightness and hue at once. Morpheus's `heat-0…3` (the same as the Matrix's `ramp`) is a fill ramp for tiles: as lines it gives 1.0–1.8:1 (light) and 1.0–2.3:1 (dark), below the 3:1 rule. Question 29.

**Type.** mononoki everywhere today (Morpheus: "Never add a second typeface"). The Matrix titles pages and cards in Archivo 800. Shown side by side: [`titles-light-1280.png`](img/batch-3/titles-light-1280.png), [`titles-dark-1280.png`](img/batch-3/titles-dark-1280.png). **Recommendation: mononoki.** gmx-cypher is a tool page full of names, paths and numbers, where a monospaced title lines up with everything under it; Archivo would be a second typeface for two sizes of text. Question 9.

**Layout.** Four places: set-up, results, compare, cluster.

*Set-up* is one sequence of three numbered steps, each showing its state, with batch as the many-trajectories mode of the same steps.
```
[1 inputs ✓ checked] → [2 groups · 3 groups] → [3 command · gmx rdf · 2 options changed]   (one trajectory | batch)
┌ display ▾ · ball & stick · element colours ┐ ┌ REFERENCE ─────────────── ┐
│                                             │ │ (ref) sulfur  6 atoms     │
│            3D view                          │ ├ SELECTIONS 02 ──── +group ┤
│                                             │ │ (sel) water_O 800 atoms   │
└─────────────────────────────────────────────┘ │ (sel) sodium   12 atoms   │
 (i) note  68 of 3242 atoms lie outside … why?   └───────────────────────────┘
```
*Results* is a filterable list of jobs with a detail pane: the result for one selected job, compare for several.
```
┌ search ─────────┐ ┌ Methionine · PG · run a · rdf (✓ done) [compare] send · open in set-up · export ▾ ┐
│ all · running · │ │ chart (● maximum · ○ first shell)                     scale ▾ · export ▾      │
│ failed · rdf ▾  │ │ [first shell · NH_N…S 0.450 nm] [maximum · NH_N…S 0.600 nm] …              │
│ ☐ job · status  │ │ settings line · groups (reference outlined)                                 │
│ ☑ job · status  │ │ provenance ▸ files · command · log                                          │
└─────────────────┘ └──────────────────────────────────────────────────────────────────────────────┘
```
*Compare* is (de)Cypher as a page, `#compare?jobs=…`: numbered sources on the left, and the one bold thing in the app, structures beside their curves.
```
compare  (each result | one graph)  link groups                                         export ▾
┌ SOURCES 02 ────┐ ┌ (1) Methionine · PG · run a ─────────────────────────────── open result ┐
│ (1) run a ──── │ │ display ▾ │ 3D: groups in their tones, ref in ink  │  chart  peaks ▾ scale ▾ │
│ (2) run b ---- │ ├ (2) Methionine · PG · run b ─────────────────────────────────────────────┤
│ + jobs + on disk│ │ …                                                                       │
└────────────────┘ └──────────────────────────────────────────────────────────────────────────┘
```
*A result page* always reads action bar → charts and their stats → settings and groups → provenance (contract §5).

**Principles** (specific to this app):
1. **The number comes with its rule.** A value on screen or in a file says which rule made it: *first shell* or *maximum*, *aligned by the mean*, *shared scale*, *geometric centre*.
2. **Ink means you; hue means data.** Your state (a selection, the primary action, focus, the reference) is ink; colour belongs to groups and ordered series. Red only for errors.
3. **Order shows as order.** Steps and sources are numbered, time and ξ run along a ramp, and categories never do.
4. **Every view leaves through an export.** Whatever a chart shows, it can export as SVG, PDF, PNG, CSV or HTML, with where the numbers came from.
5. **Quiet around the structure.** Compare's structure beside its curves is the only bold thing; everything else is a line, a word or a number.

### 3.2 Review against the brief (Morpheus and the Matrix)

What I changed after reading Morpheus's README and `matrix/src/index.css` again:
- **Status in hue → status in ink.** My first plan used Morpheus's status hues (mint ok, sky info, butter warning). Next to group cards in sky and mint they read as group colours; a "✓ ok" in mint beside a mint group says "this group". The proposal keeps ink for ok, note and check (icon + word carry the level) and `destructive` for errors only. That deviates from Morpheus. Question 30, with both shown in [`status-light-1280.png`](img/batch-3/status-light-1280.png).
- **The reference: a black chip → an ink outline.** With UI state in ink, a filled black reference chip would look like a selected toggle. The reference is the one thing drawn as an ink outline (chip border, card border, 3D ring); state is an ink fill. Question 6.
- **A new accent for state → ink.** I first considered the Matrix's vermilion `--acc` for UI state, which would make gmx-cypher look like its neighbour. Vermilion sits between coral-strong and rose-strong, so it would collide with two group tones and with errors. Ink doesn't. Question 6.
- **Ramps from tokens → new ramp tokens.** The spec asks for Morpheus's heat or the Matrix's ramp; both are fill ramps that fail 3:1 as lines (above). Question 29.
- **Stat labels upper-casing names → names keep their case.** A generic default of the label style; it changes group names and units. Question 33.
- **The AWH page's third stat.** My first mockup showed the AWH target error; it is replaced by the change against the final frame, which the convergence trace adds, and the target error stays where it is today.

Where Morpheus and the Matrix disagree, both are shown and asked: titles (mononoki vs Archivo 800, question 9); the accent (coral `primary` vs vermilion `--acc` vs ink, question 6); export look (question 13); keys C and D (question 14).

### 3.3 Show

Each image puts today's screen (left, the running app with the fake `gmx`) beside the proposal (right, a throwaway mockup drawn with gmx-cypher's own kit, tokens and fixtures: your Methionine H/S runs and the AWH fixture). Light and dark, 1280 and 1024 px, halved.

| Screen | Light 1280 | Dark 1280 | Light 1024 | Dark 1024 |
|---|---|---|---|---|
| Groups card | [img](img/batch-3/groups-light-1280.png) | [img](img/batch-3/groups-dark-1280.png) | [img](img/batch-3/groups-light-1024.png) | [img](img/batch-3/groups-dark-1024.png) |
| Result page | [img](img/batch-3/result-light-1280.png) | [img](img/batch-3/result-dark-1280.png) | [img](img/batch-3/result-light-1024.png) | [img](img/batch-3/result-dark-1024.png) |
| Jobs list with filters | [img](img/batch-3/jobs-light-1280.png) | [img](img/batch-3/jobs-dark-1280.png) | [img](img/batch-3/jobs-light-1024.png) | [img](img/batch-3/jobs-dark-1024.png) |
| Compare, each result | [img](img/batch-3/compare-each-light-1280.png) | [img](img/batch-3/compare-each-dark-1280.png) | [img](img/batch-3/compare-each-light-1024.png) | [img](img/batch-3/compare-each-dark-1024.png) |
| Compare, one graph | [img](img/batch-3/compare-one-light-1280.png) | [img](img/batch-3/compare-one-dark-1280.png) | [img](img/batch-3/compare-one-light-1024.png) | [img](img/batch-3/compare-one-dark-1024.png) |
| Status, four levels | [img](img/batch-3/status-light-1280.png) | [img](img/batch-3/status-dark-1280.png) | [img](img/batch-3/status-light-1024.png) | [img](img/batch-3/status-dark-1024.png) |
| Shortcut sheet | [img](img/batch-3/keys-light-1280.png) | [img](img/batch-3/keys-dark-1280.png) | [img](img/batch-3/keys-light-1024.png) | [img](img/batch-3/keys-dark-1024.png) |
| AWH ramp and convergence | [img](img/batch-3/awh-light-1280.png) | [img](img/batch-3/awh-dark-1280.png) | [img](img/batch-3/awh-light-1024.png) | [img](img/batch-3/awh-dark-1024.png) |
| Titles: mononoki vs Archivo 800 | [img](img/batch-3/titles-light-1280.png) | [img](img/batch-3/titles-dark-1280.png) | [img](img/batch-3/titles-light-1024.png) | [img](img/batch-3/titles-dark-1024.png) |

"Today" for the status levels is the inputs step (today's ✓ captions), and for the shortcut sheet the keyboard section of settings, since neither exists yet. In the groups mockup the 3D view is today's, cropped in; the proposal changes only the controls around it and the reference's ring. The convergence values in the AWH mockup are computed from the fixture's 11 frames (largest |ΔPMF| 18 → 20 ps: 0.13 kJ/mol, RMS 0.03); the fixture's PMF is fake-`gmx` data.

## 4. The requests

Budgets are lines of code added / removed, without tests; test lines are listed separately. "Writes" lists every new place on disk.

### R1 The design contract
- **Current behaviour:** no single description; rules are spread over Morpheus and decisions T42, T94, T139–T141, T145–T156, and disagree (§2).
- **Proposed change:** `docs/design-contract.md` (drafted, 7 parts); `src/core/contract.ts` with `NEVER_SHOWN` (phrases and the ticket pattern), `ROLES` (role → token), `KEYS` (default bindings, from R8's registry), `STATUS` (level → icon, word, token). The drift tests of R3a, R4, R5, R8 and R9c read it. Files: `src/core/contract.ts`, `test/contract.test.ts`, `docs/design-contract.md`.
- **Budget:** +90 / 0; tests +80.
- **Writes:** none.
- **Tests:** `contract.test.ts`: every role has a token, every key an action, every level an icon and a word.
- **Risks:** a contract that isn't read by tests drifts; each drift test lands with the item that makes it pass, so the module grows with Phase 2.
- **Open questions:** 6, 9, 10, 20, 30, 33.

### R2a SIGHUP
- **Current behaviour:** `server/main.ts:53–55`, SIGINT/SIGTERM only. On SIGHUP Node exits; the job dies at its next write to the piped stderr (§2); at the next start `jobs.ts:69` marks it interrupted ("gmx-cypher stopped while this job ran (pid N)").
- **Proposed change (question 2: keep running):** `process.on('SIGHUP', …)` logs "terminal closed: gmx-cypher keeps running; stop it with Ctrl+C or kill <pid>" and ignores it. A closed terminal makes writes to the runner's own stdout fail (EIO/EPIPE), so `process.stdout`/`stderr` get an error handler that stops console output instead of crashing. At start, an unended job whose pid is alive and whose command line matches (`/proc/<pid>/cmdline` on Linux, `ps -p <pid> -o command=` on macOS) shows as "still running, not followed (pid N)"; otherwise interrupted, as today. Files: `server/main.ts`, `server/jobs.ts`, a pure `liveJob(pid, cmdline, spec)` in `server/jobs.ts`.
- **Budget:** +50 / −5; tests +150.
- **Writes:** none new (the ndjson as today).
- **Tests:** `jobs.test.ts`: server with a slow fake gmx gets SIGHUP and still answers; the job ends done with its record. Restart with a live pid of another program → interrupted; with a matching command line → still running.
- **Risks:** with "keep running", a job started from a closed terminal keeps the runner alive; the README says how to stop it. "Still running, not followed" will be rare, because a job outlives a dead runner only if it never writes to stderr.
- **Open questions:** 2.

### R2b The record from the start
- **Current behaviour:** `server/runs.ts:278` writes the record at the end (`wx`, or `w` over a file claimed empty at the start); an interrupted job gets none; not atomic. Format v3 (`lib/record.ts`).
- **Proposed change:** at start, write the record (`wx`) with what is known: inputs (paths; hashes `null` until computed), command, options, groups, versions, `status: 'running'`, `ended: null`. At the end, write `<name>.run.json.tmp-<job id>` (`wx`) and `rename` it over the record. Readers (`decypher/sources.ts`, *open in set-up*, batch, send) treat `status: 'running'` with no `ended` as incomplete: flagged "incomplete: the job didn't finish" (warning) and not used for groups. Format: v3 with an optional `complete: boolean`, so v3 readers still read it (question 3). Files: `server/runs.ts`, `lib/record.ts`, `decypher/sources.ts`, `views/Result.tsx`, `views/Batch.tsx`, `server/send.ts`.
- **Budget:** +80 / −30; tests +180.
- **Writes:** `<record>.tmp-<job id>` beside the record, renamed into place.
- **Tests:** golden: a completed record equals today's apart from new fields (existing fixtures). SIGKILL mid-run leaves a record that says it didn't finish. The temp file never remains (rename path). `formats.test.ts` v1 fixtures still read.
- **Risks:** rename over an existing file is the one overwrite this batch allows, and only of the file this job created at its start; the rule "nothing existing is overwritten" needs that exception written down (decision). Interaction with R14a (record copies are taken only from complete records).
- **Open questions:** 1, 3.

### R3a Ticket references out of the UI
- **Current behaviour:** ten strings (§2).
- **Proposed change:** rewrite each with its reason in words, for example `commands.ts:186` "… not sent until you decide (question 28)" → "the profile is not sent to the vault: the Matrix would read it as a histogram"; `commands.ts:284` "(question 33)" → "so the two tools' criteria never mix" (the reason is already there). Scanner test over `src/**/*.ts(x)` and the server messages that reach the page (`server/*.ts` string literals in thrown errors and API bodies). Files: `lib/commands.ts`, `views/Result.tsx`, `views/Wham.tsx`, `test/contract.test.ts`.
- **Budget:** +30 / −15; tests +80.
- **Writes:** none. **Tests:** the scanner (fails on `(question N)`, `(T123)`, `(R9c)`; ignores comments); a fixture file proving it catches each form.
- **Risks:** the scanner must not flag `T` in data (e.g. "T = 300 K"): the pattern requires the parenthesised form.
- **Open questions:** none.

### R3b One set of words
- **Current behaviour:** "run" as a noun ("can't plan this run", ×9 in `Awh.tsx`, `Energy.tsx`, `Wham.tsx`, `GroupCommand.tsx`), *run again* (`Result.tsx:447–448`), *each job* and *link groups … every job* (`Decypher.tsx:500`, `:514`, `:212`, `:216`, `:360`; `kit.ts:952`), the *runs* source (`Decypher.tsx:276`), the *analysis* tab (`App.tsx:123`, `Analysis.tsx:34`, `Inputs.tsx:213`), "first peak" (`Result.tsx:108`), "peak r / peak g" (`panels.tsx:125`, `kit.ts:881`), "peaks" chip (`Decypher.tsx:513`).
- **Proposed change:** the before → after table below, applied on every screen, in the kit (so the export), and in the README. Files: the ones listed, plus `lib/shortcuts.ts:39`, `views/Settings.tsx:18`, `:34`, `views/Jobs.tsx:49`, `:79`, `views/SendDialog.tsx:49`, `views/GroupCommand.tsx:227`, `views/Result.tsx:419`.

| Where | Before | After |
|---|---|---|
| `Result.tsx:447–448` | run again · "run again opens this recipe in …" | open in set-up · "open in set-up fills the steps with this job's inputs, groups and options" |
| `Awh/Energy/Wham/GroupCommand` | gmx-cypher can't plan this run · gmx would refuse this run · didn't start this run | … this job (×9) |
| `GroupCommand.tsx:227` | the run continues if this page closes | the job continues if this page closes |
| `Result.tsx:419` | reading the run record… | reading the record… |
| `SendDialog.tsx:49` | the run's last time | the job's last time |
| `Decypher.tsx:500` | show: each job · one graph | each result · one graph |
| `Decypher.tsx:514` | a group picked in one job is picked in every job that has it | … in one result is picked in every result that has it |
| `Decypher.tsx:212`, `:216`, `:360`; `kit.ts:952` | every job · each job its dash · by job · each job stays interactive · matched in every job | every result · each result its dash · colour by result · each result stays interactive · matched in every result |
| `Decypher.tsx:276` | sources: jobs · runs · vault · files | jobs · on disk · vault · files |
| `App.tsx:123`, `Analysis.tsx:34`, `Inputs.tsx:213` | analysis (tab, label) · "find them in the analysis tab" | command (step 3) · "find them in the command step" |
| `App.tsx` tabs | inputs · groups · analysis · jobs · batch · cluster | set-up (1 inputs · 2 groups · 3 command; batch as a mode) · results · compare · cluster |
| `Jobs.tsx:49`, `:79` | open in (de)Cypher · (de)Cypher · D | compare · compare · D |
| `Decypher.tsx:496`, `:503` | (de)Cypher (dialog title) · close (de)Cypher | compare (page title) · back to results |
| `Settings.tsx:18`, `:34`; `shortcuts.ts:39` | open and close (de)Cypher · open (de)Cypher from the jobs tab · inside (de)Cypher, F fits … | open compare · open compare from results · in compare, F fits … |
| `Result.tsx:104`, `:108` | the dot marks each curve's maximum · first peak · X | ● maximum · ○ first shell · first shell · X and maximum · X |
| `panels.tsx:125`; `kit.ts:881` | peak r · peak g | maximum r · g · first shell r · g |
| `Decypher.tsx:513` | peaks (chip) | marks: maximum ▾ (maximum · first shell · both) |
| export default heading (`export.ts:49`) | (de)Cypher | (de)Cypher (kept: the export's name; question 10) |

- **Budget:** +120 / −120; tests +40.
- **Writes:** none. **Tests:** the contract's never-shown phrases ("each job", "every job", "run again", "first peak", "peak" alone, "this run") over UI strings by the R3a scanner.
- **Risks:** R9a changes the same strings (tabs → steps); doing R3b first means the steps are named once. Recipes saved in the browser don't store words.
- **Open questions:** 10, 31.

### R3c Display names
- **Current behaviour:** `server/runs.ts:247` fixes the title at creation (`<stem> · <ref> → <sels>`). `lib/landing.ts` already reads sequence, column and run from a folder path with the project's pattern (through the Matrix's `landing`).
- **Proposed change:** a pure `displayName(job, project | null, all)` in `src/lib/names.ts`: the job's trajectory folder through the connected project's pattern (the Matrix's `parsePath`) → "<sequence> · <column> · run <slot> · <command>"; no project or no match → today's title; collisions get the shortest distinguishing part (the differing folder segment, else the start time "18:02"). Used by the jobs list, compare's sources, export headings and file-name fields. Needs the connected project, so the project setting (R14b's first half) moves to Phase 2 (question 34). Files: `src/lib/names.ts`, `views/Jobs.tsx`, `decypher/sources.ts`, `decypher/export.ts`, `views/Settings.tsx`, `server/state.ts`.
- **Budget:** +90 / −10 (+40 for the setting); tests +120.
- **Writes:** `config.json` gains `project` (gmx-cypher's own config, as today).
- **Tests:** table-driven over folder paths shaped like yours (`…/o111/pg/met/a/rdf_07_md`), fallback, collisions (five identical "rdf_07_md · sulfur → water_O").
- **Risks:** the pattern may match only part of the path; the name then says only what matched. Display only: records keep `title`.
- **Open questions:** 5, 11, 34.

### R3d Both peak rules
- **Current behaviour:** `Result.tsx:108` "first peak" (T27, `lib/rdf.ts:126 firstPeak`, with its fallback named `rule: 'maximum'`); dot at the maximum (T152). (de)Cypher: maximum only (`parse.ts:79 peakOf`).
- **Proposed change:** one `peaks(x, y)` in the core returning `{ firstShell, maximum }` (T27's rule and T152's); stat cards "first shell · X" and "maximum · X"; when T27 falls back, the first-shell card says "never above 1: see maximum" instead of a second copy. Chart marks per question 12 (● maximum filled, ○ first shell hollow). Tables and CSV carry both. Files: `lib/rdf.ts`, `decypher/parse.ts`, `decypher/kit.ts`, `decypher/panels.tsx`, `views/Result.tsx`, `decypher/export.ts`.
- **Budget:** +60 / −25; tests +60.
- **Writes:** none. **Tests:** both values on the fixture RDFs (H: NH_N…S first shell 0.450 nm g 17.92, maximum 0.600 nm g 40.33); the fallback; names in stat cards and CSV.
- **Risks:** the export format gains a field (`firstShell`); old exported HTML files keep working (they carry their own kit).
- **Open questions:** 12.

### R4 One colour scheme (R4a, R4b)
- **Current behaviour:** §2 and §3.1. The reference is red in the groups card, the click hint, the analysis view's group list and the result's group table (screenshots); ink in (de)Cypher.
- **Proposed change:** `src/roles.json` (role layer: `state`, `state-foreground`, `ring`, `destructive`, `destructive-foreground`, `ramp-0…3`, `atom-*`, `bond`, `edge`), generated with the tokens by `scripts/tokens.ts`; `primary` and `ring` point to `state`. The reference: `ref` chip, card border and 3D ring drawn as an ink outline (`Groups.tsx`, `Viewer.tsx` halo, `Result.tsx` group table, `kit.ts`). `NEUTRAL` moves into the role layer and reaches the kit as data (R5). `text-destructive`/`bg-destructive` only in the status component and destructive buttons. Files: `src/roles.json`, `scripts/tokens.ts`, `src/tokens.css` (generated), `views/Groups.tsx`, `views/Viewer.tsx`, `views/Result.tsx`, `views/Analysis.tsx`, `decypher/kit.ts`, `test/tokens.test.ts`, `test/contrast.test.ts`.
- **Budget:** R4a +110 / −50; R4b +40 / −40; tests +160.
- **Writes:** none.
- **Tests:** as spec §11, with the threshold ΔE_OK ≥ 0.10; reference in ink by computed style in Playwright.
- **Risks:** 3Dmol draws the reference's halo from a colour string; the ink halo must stay visible on dark atoms (an outer ring in `background` around the ink one). Stored tones stay (question 8).
- **Open questions:** 6, 7, 8, 29, 30.

### R5 One visualization core (R5a, R5b, R5c)
- **Current behaviour:** §2. `ui/line-chart.tsx` (185 lines) draws every result chart in `Result.tsx` (13 call sites); the kit draws (de)Cypher and the export. The kit's chart is an RDF chart (y from 0, g = 1 line, g(r) default).
- **Proposed change:**
  - **R5a** `src/core/index.ts` creates the kit once and re-exports `TONES`, `DASH`, `DASH_NAMES`, `niceTicks`, `ranges`/`toRanges`. The kit receives the tones' order, the Matrix's `DASH` and `DASH_NAMES`, the role layer and the neutrals **as data** at creation (`decypherKit(data)`), and the HTML export writes that data as JSON next to the kit's source (T146 holds: the kit is still self-contained text). `lib/tones.ts` keeps only Tailwind class maps; `TONES_FOR_TERMS` goes.
  - **R5b, how one structure model works when the kit can't import:** the parser moves **into the kit** (`parseStructure(text, 'gro' | 'pdb')`: atoms, residue numbers and names, coordinates, box, element). The element rule is T14's: the Matrix's `elementOf` decides. The kit can't import it, so `elementOf`'s table is passed in as data with the rest (its name → element lookups and the virtual-site rule), and a drift test runs the kit's `elementOf` against the Matrix's over every atom name in the fixtures plus a generated list. `lib/atoms.ts` (`atomTable`), `lib/box.ts` (`atomCoords`) and `decypher/parse.ts` (`parseGro`, `parsePdb`) become calls into the core. The picker's 3Dmol keeps `toPdb` for its own drawing (question 18).
  - **R5c** the kit's `chart()` takes a y domain (data min to max, 0 included only for counts and g(r)), an optional reference line (g = 1 for RDF only), an optional error band (WHAM), and point marks (R3d). Every chart in `Result.tsx` becomes a core chart in a small React wrapper (the `ChartPanel` already in `panels.tsx`), so every chart gets the hover readout, the marks and the exports. `ui/line-chart.tsx` is deleted. Curves are clipped to the plot (`clipPath`).
  - Files: `src/core/index.ts`, `decypher/kit.ts` (moved to `src/core/kit.ts`), `decypher/parse.ts`, `decypher/panels.tsx`, `decypher/export.ts`, `lib/tones.ts`, `lib/atoms.ts`, `lib/box.ts`, `views/Result.tsx`, `ui/line-chart.tsx` (deleted), `test/core.test.ts`.
- **Budget:** R5a +40 / −170; R5b +160 / −260; R5c +260 / −420. Net about −390. Tests +330.
- **Writes:** none.
- **Tests:** spec §12; the golden "numbers don't move" test over every result kind (series in = series out, from the fixtures, through today's `resultSeries` and the core); kit-from-source equality (T146) kept; 1–14 RDFs on one graph: no two curves share colour and dash.
- **Risks:** the biggest item. Every result view changes at once; the golden test goes in first. Bundle: the kit is already in the lazy (de)Cypher chunk; making it the core moves at most that chunk's 38 kB gzip into the main bundle, which shrinks again by `line-chart.tsx` and duplicates. **Merging the two 3D engines is not small** (cartoon needs secondary structure, and the picker draws up to tens of thousands of atoms through WebGL), so question 18: keep two.
- **Open questions:** 13, 17, 18.

### R6 Every chart exports (R6a, R6b)
- **Current behaviour:** (de)Cypher exports one HTML file (`decypher/export.ts`); result views export nothing.
- **Proposed change:** an adapter `src/core/export.ts`: a core chart → the Matrix's `GraphData` (series with `-strong` tones and `DASH` by name, labels, domain, `pins` from marks and lines) → `graphScene` → `toSVG` / `toPDF` / `toPNG` by import (proved in §2). CSV writer: `#` provenance lines (command, gmx version, record path, source SHA-256, label → gmx name and atoms) then one header row and every point at gmx's own precision (the xvg's text fields, not re-formatted numbers). HTML: the existing (de)Cypher export from any result or selection. Settings → export: the Matrix's `ExportPrefs` fields, `cleanExport` for validation, stored under `gmx-cypher-export`; the file-name template adds `{project} {sequence} {column} {run} {command} {group} {date}` (the Matrix's `exportName`). E exports the focused chart. Compare: one chart, all cards, or a grid (`gridScene`) / multi-page PDF. Structure → PNG from the kit's canvas. Files: `src/core/export.ts`, `src/lib/csv.ts`, `views/Settings.tsx`, `views/Result.tsx`, `decypher/Decypher.tsx`, `decypher/export.ts`.
- **Budget:** R6a +320 / −10; R6b +160; tests +300.
- **Writes:** downloads only (the browser saves them). No server writes.
- **Tests:** spec §13; CSV round-trip equals the xvg digit for digit.
- **Risks:** `toPNG` needs the DOM (tested in Playwright, not Vitest). "Full precision" means keeping gmx's text: the CSV writer reads the xvg's fields, not floats.
- **Open questions:** 13, 24.

### R7 AWH and WHAM (R7a, R7b, R7c)
- **Current behaviour:** §2. `lib/awh.ts:13 awhFrames` sorts frames by time; `Result.tsx:168` draws at most 12; `lib/wham.ts:45 neighbourOverlaps` already sorts windows by their histogram's peak.
- **Proposed change:**
  - **R7a** `ramp(n, theme)` in the core: OKLCH interpolation over `ramp-0…3` (with the Matrix's `shade.ts` conversions), monotonic in lightness. AWH in time order; WHAM windows in `neighbourOverlaps().order`. Legend: a ramp bar with the first and last values; the hover readout names each curve; hovering one dims the rest (40 %).
  - **R7b** `convergence(frames)` in `lib/awh.ts`: frames on one grid (else refused in words), each pair of consecutive frames and each frame against the final one: after aligning, the largest |ΔPMF| and the RMS ΔPMF, in kJ/mol, against time. **Alignment: by the mean over the shared grid** (the least-squares constant; the minimum moves with noise at the barrier's bottom). Shown as "aligned by the mean over the shared grid" and recorded in exports. One endpoint, `GET /api/jobs/:id/awh-convergence`, reads every frame the run wrote. No threshold.
  - **R7c** `awhUnit(dump)` in `lib/awh.ts`: AWH dimension → `coord-provider`; for `pull`, `coord-index` (1-based) → `pull-coord <index − 1>` → `geometry`: distance, direction, direction-periodic, direction-relative, cylinder → nm; angle, angle-axis, dihedral → deg; `fep-lambda` → lambda state; else unknown, keep gmx's label and say why. Read with `gmx dump -s` when the job starts; stored in the record (question 22). Shown as "ξ (nm) · pull coordinate 1, distance".
  - Files: `src/core/ramp.ts`, `lib/awh.ts`, `server/awh.ts`, `server/runs.ts`, `server/api.ts`, `views/Result.tsx`.
- **Budget:** R7a +70 / −20; R7b +150; R7c +90 / −5; tests +300.
- **Writes:** none new (the unit goes into the record).
- **Tests:** spec §14. Only the 2025.4 distance dump is real; angle, dihedral, lambda and the 2021 format need your dumps (§5).
- **Risks:** frames written with a changing grid (rare) are refused, not interpolated.
- **Open questions:** 21, 22, 29.

### R8 One mouse and keyboard scheme (R8a, R8b)
- **Current behaviour:** §2. Kit: drag rotates, non-left button or Alt-drag pans, ⌘/Ctrl/Shift-click adds (`kit.ts:522`, `:540`); picker: Shift = residue, Alt = atom name (`Viewer.tsx:128`); result legends cycle shown → dimmed → hidden (`Result.tsx:57`).
- **Proposed change:** contract §3. Core handlers `core/gestures.ts` (pure: event → action) used by the kit's canvas and the picker's 3Dmol click callback; one `Legend` component (click: alone / all; ⌘: toggle; hover: dim others; "dim" in its menu). Charts get the Matrix's gestures by import (`interact.ts`) where they fit the core chart's geometry. Keys: `lib/shortcuts.ts` becomes the registry (`KEYS` in `contract.ts`): F, R, B, C held, H, L, [, ], D, E, ?; `keyProblem` generalised to conflicts between actions; `typing` kept; settings → keyboard lists all; `?` opens the sheet (Morpheus `Dialog` + `Kbd`), grouped by surface. One style menu (question 17). Files: `lib/shortcuts.ts`, `core/gestures.ts`, `ui/legend.tsx`, `views/Viewer.tsx`, `views/Settings.tsx`, `decypher/kit.ts`, `decypher/Decypher.tsx`, `decypher/panels.tsx`, `views/Result.tsx`, `ui/shortcut-sheet.tsx`.
- **Budget:** R8a +180 / −140; R8b +220 / −70; tests +260.
- **Writes:** browser storage only (bindings, as today).
- **Tests:** spec §15.
- **Risks:** changes the meaning of gestures you already use: in compare, Shift-click becomes "residue" (today: add) and Alt-drag stops panning (right-drag and Space-drag stay). Ctrl+click on macOS opens the context menu, so ⌘ is the add key there.
- **Open questions:** 14, 15, 16, 17.

### R9 Where things live (R9a, R9b, R9c)
- **Current behaviour:** `App.tsx:27–33` six tabs in the hash, `#rdf` → analysis; (de)Cypher a full-screen dialog; drop zones in Inputs (`ui/dropzone.tsx`) and the (de)Cypher dialog.
- **Proposed change:**
  - **R9a** `lib/route.ts` (pure `parseRoute`, `formatRoute`, old addresses → new; IDs checked against `^[a-z0-9]{6,32}$`); `App.tsx` renders set-up (steps), results (list + detail), compare (the (de)Cypher view without its dialog), cluster; `routeDrop(files)` in `lib/drop.ts` (structures, trajectories, run inputs, index, energy → inputs; `.xvg`, `.run.json` → compare; mixed: split and say where each went); D opens compare with the selection. Files: `App.tsx`, `lib/route.ts`, `lib/drop.ts`, `views/Jobs.tsx`, `decypher/Decypher.tsx`, `views/Inputs.tsx`, `ui/dropzone.tsx`.
  - **R9b** one `ResultPage` frame (action bar, charts + stats, settings + groups, provenance collapsed with relative paths and "copy full path"); compare cards use it; (de)Cypher's three control rows split into a display menu per 3D view, chart header controls, and *link groups* by the mode switch. Files: `views/Result.tsx`, `decypher/Decypher.tsx`, `decypher/panels.tsx`, `ui/display-menu.tsx`.
  - **R9c** `ui/status.tsx` (`<Status level why>`) with the levels in `contract.ts`; every message below moves into it.
- **Status levels for every existing message** (question 20):

| Level | Messages |
|---|---|
| **ok** | `App.tsx:67` ready; `Inputs.tsx:122` the inputs agree; `:169` uploaded; `:211` N terms read by gmx energy; `:217` N AWH frames; `Groups.tsx:276` gmx counts the same; `Result.tsx:435` gmx agrees; `Recipes.tsx:24` loaded, `:59` saved recipe; `Settings.tsx:83` gmx path · version, `:110` vault path; `Wham.tsx:116` pull file found; `SendDialog.tsx:117` matches what you chose; `Batch.tsx:67` sent to …; `Code.tsx:8` copied; `Decypher.tsx:294` groups from …, `:351` exported; `parse.ts:191–197` N atoms, N groups, N curves, record read; `jobs.ts:17` done |
| **info** (note) | `Viewer.tsx:189` "N of M atoms lie outside it, as recorded" (part of the box line); `Decypher.tsx:246` the first N only, `:247` couldn't look into …; `parse.ts:256` not linked; `sources.ts:132` it opens here when it ends; `jobs.ts:16` running (a state word, with progress) |
| **warning** (check) | `Decypher.tsx:294` no atom groups; `SendDialog.tsx:117` not what you chose; `SendDialog.tsx:106` the project's pattern needs …; `Groups.tsx:112` 0 atoms: … in this structure; `Wham.tsx:116` none beside it; the new "incomplete record" (R2b) and "interrupted" job state |
| **error** | `App.tsx:62` vault, `:68` no gmx; `Batch.tsx:47` refused, `:84`, `:147` no working gmx; `GroupCommand.tsx:194`; `Groups.tsx:111`, `:155`, `:169`, `:170` atoms beyond the structure, `:206`; `Inputs.tsx:57`, `:154`, `:155`, `:159`, `:164`, `:171`, `:211`, `:216` (×2); `Recipes.tsx:64`; `SendDialog.tsx:80`, `:111`, `:140`; `Settings.tsx:34`, `:83`, `:100`, `:110`, `:119`, `:136`; `Wham.tsx:51`; `Code.tsx:8` could not copy; `Decypher.tsx:242`, `:285`, `:575`; `parse.ts:256` (file errors); `jobs.ts:18` failed |
| **not a status** | `Groups.tsx:244` "✓ exclusions on (-excl)" is a toggle's label → a checkbox; `Batch.tsx:80` "✓ sent" is a button's result → the button reads "sent"; `server/main.ts:49` is the terminal's log line (stays) |

- **Budget:** R9a +330 / −160; R9b +220 / −240; R9c +70 / −40; tests +380.
- **Writes:** none.
- **Tests:** spec §16; the scan for ✓/✗/⚠ captions in views; axe on the main screens (question 26).
- **Risks:** R9a touches every view's entry; e2e smoke and compare flows are rewritten. Old bookmarks redirect. Compare as a page loses the dialog's focus trap; Esc goes back.
- **Open questions:** 10, 19, 20, 26, 30.

### R10 Compare every analysis (R10a–R10d)
- **Current behaviour:** sources are RDF only: jobs (`server/decypher.ts:32` `j.kind !== 'rdf'`), vault RDFs by type (`:42–44`), records on disk, dropped files (`decypher/parse.ts`).
- **Proposed change:**
  - **R10a** a card model per command (`core/cards.ts`: `{ structure?, charts[], groups, table }`) built from a record and its outputs, reusing `Result.tsx`'s readers; energy, AWH and WHAM give chart-only cards. *One graph* only for like quantities: `sameQuantity(a, b)` compares y unit and x quantity (from the xvg's labels); otherwise refused in words.
  - **R10b** RMSF: atom → value from the xvg (residue mode: every atom of the residue), coloured with the ramp; a min–max scale bar in nm; neutral outside the group; hover shows the value; a chart point and its atom highlight each other.
  - **R10c** H-bonds: `parseHbondPairs(ndx)` → donor–H…acceptor triplets drawn as dashed lines at the structure's positions; the note "pairs found over the trajectory, drawn at the structure's positions"; legacy: "gmx hbond-legacy writes no pairs". Count per question 23.
  - **R10d** distance and mindist: the groups' centres (`centre(atoms, masses?)`: geometric unless the run input's masses are read; labelled which), a dashed line with "0.84 nm here · ⟨d⟩ 0.91 nm (gmx)"; distance by pairs: one line per pair. RMSD/gyrate: the fit group and the measured groups outlined on the structure beside the time series.
  - The export carries every card (`ExportAnalysis` gains `kind`, the card model as data).
  - Files: `core/cards.ts`, `server/decypher.ts`, `decypher/sources.ts`, `decypher/parse.ts`, `decypher/kit.ts`, `decypher/Decypher.tsx`, `decypher/export.ts`, `lib/hbond.ts`, `lib/mindist.ts`.
- **Budget:** R10a +280 / −60; R10b–d +140, +140, +150; tests +390.
- **Writes:** none.
- **Tests:** spec §17, from the real fixtures (`hbond_nvt_hbonds.ndx`, `nvt.gro`).
- **Risks:** the export file grows with structures per card; the kit's canvas must handle thousands of H-bond lines (question 23). Masses need `gmx dump` of the run input; without it the centre is geometric and says so.
- **Open questions:** 23.

### R11 Graph settings (R11a–R11d)
- **Current behaviour:** none of these exist; (de)Cypher's view state lives in `decypher/state.ts` (in the browser).
- **Proposed change:** `sharedDomain(series[], axis)` (NaN and empty series ignored), per-chart reset; per-curve dash by name (the Matrix's 10), width 1.5 / 2 px plus a print width 2.5 px, shade (the Matrix's `curveShade`); a check that warns when two curves become identical; marks and lines with the Matrix's gestures, listed under the chart (× and an editable label), mapped to `pins` and into CSV comments; a label map `{ original → label }` applied to legends, CSV and exports, with originals on hover and in provenance. Stored per question 24. Files: `core/domain.ts`, `decypher/state.ts`, `decypher/panels.tsx`, `decypher/kit.ts`, `core/export.ts`, `lib/csv.ts`.
- **Budget:** R11a +90; R11b +110; R11c +160; R11d +130; tests +280.
- **Writes:** browser storage; with a connected project, views in the space (R14b).
- **Tests:** spec §18, including the byte comparison of records after renames.
- **Risks:** renames must never reach `send` or the record; the send path reads the record, not the view.
- **Open questions:** 24.

### R12 A jobs list that scales (R12a–R12c)
- **Current behaviour:** §2 (logs in server memory; the page already loads one log on demand).
- **Proposed change:** `foldJob(events)` without `out` text: keeps the log's byte size and the progress parsed from the last 64 kB (`parseProgress` on the tail); `GET /api/jobs/:id/log?from=&to=` (tail by default, "show all"); search and filters as pure functions over the list (`lib/jobFilter.ts`), in the address (`#results?status=failed&command=rdf`); multi-select (click, ⌘/Ctrl, Shift); archive moves `<home>/jobs/<id>.ndjson` to `<home>/jobs/archive/` (`rename`, refusing a name that exists; running jobs refused), archived jobs not loaded at start, listed with the archive filter, unarchive moves back. A measurement script with 2,000 synthetic jobs × 1 MB logs, before and after. Files: `server/jobs.ts`, `server/api.ts`, `src/jobs.ts`, `lib/jobFilter.ts`, `views/Jobs.tsx`, `scripts/measure-jobs.mjs`.
- **Budget:** R12a +110 / −40; R12b +200 / −30; R12c +110; tests +340.
- **Writes:** `<home>/jobs/archive/` (new folder inside gmx-cypher's own home).
- **Tests:** spec §19.
- **Risks:** progress from the tail must match today's for every command (table over fixture ndjsons).
- **Open questions:** 25.

### R13 Run diff
- **Current behaviour:** none.
- **Proposed change:** `diffRecords(a, b)` in `lib/diff.ts`: options (flag, both values, default from the command definition), inputs (path and SHA-256; same hash = same input), groups (by atoms then names, via the core's `matchGroup` and `sameButReference`; atoms added/removed as ranges), gmx path and version, runner version, environment, frames (`-b -e -dt`, frames analysed). A table with "N fields equal" behind a toggle; *compare with…* on a result; *diff* with two jobs selected. Files: `lib/diff.ts`, `views/Diff.tsx`, `views/Result.tsx`, `views/Jobs.tsx`.
- **Budget:** +200; tests +150.
- **Writes:** none. **Tests:** spec §20 on the real fixtures.
- **Risks:** v1 records have fewer fields: missing on one side shows as "not recorded", not as a difference.
- **Open questions:** none.

### R14 gmx-cypher's own space (R14a–R14c)
- **Current behaviour:** the only vault write is `server/send.ts:21` (`COPYFILE_EXCL` into `<project>/_inbox/`); reads through `ReadOnlyBackend` (`server/vault.ts:19`); groups of vault RDFs only from this runner's records by SHA-256 (`server/decypher.ts:28–37`).
- **Proposed change:**
  - **R14a** `<vault>/gmx-cypher/` (question 4): `space.json` (`{ format: 'gmx-cypher space', version: 1, by }`), `README.md`, `records/<sha256>.run.json` written at each send from the job's complete record (`wx`; an existing file with the same name is the same result, left alone), `projects/<project id>/views/<name>.json`. Paths in the copy made relative to their allowed folder, the environment reduced to `GMX*` names without values (question 4). Before any write, the proof of §2 becomes a test: the Matrix's `ProjectService` report and `Vault.open` identical before and after, with the read-only backend. A separate `SpaceWriter` (exclusive create or temp + rename; refuses any path outside `gmx-cypher/`) keeps the vault backend read-only.
  - **R14b** settings: the project (question 5); default for sends; owns saved views. After a send the page links to the project and says the next steps (today's).
  - **R14c** compare looks up `records/<sha256>.run.json` for a vault RDF whose job is unknown (T156's case).
  - Files: `server/space.ts`, `server/send.ts`, `server/decypher.ts`, `server/vault.ts`, `server/state.ts`, `views/Settings.tsx`, `views/SendDialog.tsx`, `e2e/decypher.spec.ts`.
- **Budget:** R14a +140; R14b +160 (+40 moved to Phase 2); R14c +50 / −10; tests +380.
- **Writes:** `<vault>/gmx-cypher/` and everything under it (new, outside every project folder).
- **Tests:** spec §21.
- **Risks:** a vault in Git or shared: the copies must hold no absolute paths or environment values (question 4). A vault folder named `gmx-cypher` that already exists and isn't ours (no `space.json`) is refused in words.
- **Open questions:** 1, 4, 5, 24.

### R15 From the cluster tab to analysis
- **Current behaviour:** `server/cluster.ts` runs `qq jobs`, `qq jobs -a` and `gmx-eta -a`; R10d of batch 2 waits for a `qq jobs -e` sample (T136).
- **Proposed change:** only with the sample: `finishedBetween(before, after)` over two parsed listings; the offer "run <recipe or batch> on <input folder>" with the folder from `qq jobs -e` only, checked against the allowed folders; one click fills set-up (batch); nothing runs until run. Files: `lib/cluster.ts`, `server/cluster.ts`, `views/Cluster.tsx`.
- **Budget:** +110; tests +100. **Writes:** none.
- **Tests:** spec §22.
- **Risks:** none beyond the sample. **Open questions:** none until the sample comes.

### R16 `gmx density` and `gmx order`
- **Current behaviour:** neither is defined (`lib/commands.ts:405`). Help texts read here (2023.3 and 2025.4, identical apart from the quote): density `-d`, `-sl`, `-dens mass|number|charge|electron`, `-ei`, `-ng`, `-center`, `-symm`, one curve per group; order `-d`, `-sl`, `-szonly`, `-permolecule`, `-radial`, `-calcdist`, outputs `-o order.xvg`, `-od deuter.xvg`, `-os sliced.xvg`, `-Sg`, `-Sk`, and "only works for saturated carbons and united atom force fields".
- **Proposed change:** two `CommandDef`s as batch 2's, options read from `-h`; density: groups (one curve each), electron density only with an electrons file; order: carbon groups in tail order from an index file (question 27), the axis, `-od` (S_CD per carbon) as the result the Matrix reads as Order parameters, a note in the result when the force field isn't united-atom ("gmx order's method suits united-atom tails; for all-atom lipids, use …" only if you name the alternative). Result views on the core. Files: `lib/commands.ts`, `lib/density.ts`, `lib/order.ts`, `views/Result.tsx`, `test/fake-gmx.mjs`.
- **Budget:** R16a +160; R16b +180; tests +240.
- **Writes:** gmx's outputs in the job's folder, as every command.
- **Tests:** spec §23, with your real outputs.
- **Risks:** the Matrix's `order` type matches "order parameter(s)" in the title; checked only against your outputs.
- **Open questions:** 27.

## 5. Samples I need from you

None of these goes into the repository until you say so (they may hold paths or names).

1. **`gmx dump -s <your AWH run input>.tpr`** (R7c): one distance-like and, if you have them, one angle or dihedral AWH input, and one with `coord-provider = fep-lambda`. From both GROMACS versions you use. I dumped `test/fixtures/awh/topol.tpr` with 2025.4 (distance); 2023.3 can't read it.
2. **An AWH run with many frames** (R7b): the `gmx awh` output folder (`awh_t*.xvg`), ideally 50+ frames.
3. **`gmx density -h` and `gmx order -h`** from both versions you use, **a small membrane system** (`.tpr`, a short `.xtc`, `.ndx` with one group per tail carbon), and the outputs of `gmx density` (mass and number, two groups) and `gmx order` (`-o`, `-od`) on it (R16). I read the help texts of 2023.3 and 2025.4 here; yours decide.
4. **`qq jobs -e`** output that includes a finished job (R15).

## 6. Size, cut points and order

**Estimate** (lines of code; tests separately):

| Phase | Added | Removed | Net | Test lines |
|---|---|---|---|---|
| 1 Protect data | 300 | 50 | +250 | 610 |
| 2 The contract in code | 620 | 285 | +335 | 580 |
| 3 One core, exports | 940 | 860 | +80 | 630 |
| 4 AWH and WHAM | 310 | 25 | +285 | 300 |
| 5 Layout and interaction | 950 | 610 | +340 | 560 |
| 6 Compare every analysis | 1,200 | 60 | +1,140 | 670 |
| 7 The runner at scale | 620 | 70 | +550 | 490 |
| 8 Vault, cluster, commands | 660 | 10 | +650 | 520 |
| **Total** | **≈ 5,600** | **≈ 2,000** | **≈ +3,600** | **≈ 4,400** |

About 1.5 times batch 2 in lines added. **The spec's target that Phases 2 and 3 remove more than they add is not met by my estimate:** the deduplication items (R4b, R5a–c, R3b) net about −560, but Phase 2 also adds the contract module, display names and the peak rule, and Phase 3 adds the exports (≈ +470). Question 35.

**Cut points:**
- **A — after Phase 3** (≈ 1,860 / 1,195): data protected, one vocabulary, one colour scheme, one core, every chart exports. A coherent app; the rest builds on it.
- **B — after Phase 5:** adds AWH convergence and the new layout and keys.
- **C — Phase 6 in two:** R10a and R11a–b (any result in compare, same scale, line styles) in this batch; R10b–d and R11c–d (RMSF, H-bonds, distances on structures; marks, renames) can wait.
- **D — Phases 7 and 8** are independent of each other and of 6; either can become a batch 4, and R15/R16 wait for samples anyway.

**Order:** the spec's, confirmed, with three changes (marked *proposed* in the roadmap):
1. **`contract.ts` (R1b) first in Phase 2**, so each drift test reads its rule from it as it lands.
2. **The connected project (the setting part of R14b) moves into Phase 2, before R3c,** because display names come from the project's pattern (question 34).
3. **The one style menu goes with R9b** (the display menu on each 3D view) rather than R8b, so the menu is built once with its final names.

## 7. For the Matrix and Morpheus (collected so far)

- **The Matrix:** a route to a cell; reading `<vault>/gmx-cypher/records/` to show a result's provenance with an "open in gmx-cypher" link; units keep their case in exported axis labels (it does today; keep it).
- **Morpheus:** the role layer (`state`, `destructive` apart from coral-strong), a status component, line ramp tokens that meet 3:1, Table and Combobox.

## 8. Questions

Each with options and my recommendation. 1–28 are the spec's §6; 29 onwards are mine.

1. **Run-record sidecar.** (a) R2b, the record written at start; (b) R14a, a copy beside each sent result; (c) both. **Recommendation: (c), both.** Each is small, and R14c needs (b).
2. **SIGHUP.** (a) stop cleanly, cancelling jobs and recording them cancelled; (b) keep running, logging it. **Recommendation: (b).** Note §2: today the job doesn't survive the runner anyway (SIGPIPE), so (b) is what saves the job. The runner's own console output is silenced after the terminal closes, so it can't crash on it.
3. **Record format.** (a) v3 with optional fields (`complete`, AWH `unit`, …); (b) v4. **Recommendation: (a).** v3 already allows `status: 'running'` and ignores unknown fields; v4 would make today's gmx-cypher refuse new records. v1–v3 stay readable either way.
4. **The vault space.** Name and place: (a) `<vault>/gmx-cypher/`; (b) `<vault>/_gmx-cypher/`. Contents: (a) records and views; (b) also recipes. Paths: (a) relative to the allowed folder, environment as names only; (b) as recorded. **Recommendation: `<vault>/gmx-cypher/`, records and views (recipes stay in gmx-cypher's home), paths relative and environment values dropped.** Proved invisible to the Matrix (§2).
5. **The connected project.** (a) one, in settings; (b) per job. **Recommendation: (a).**
6. **UI state colour.** (a) ink (fill), with the reference as an ink outline; (b) the Matrix's vermilion; (c) Morpheus's coral `primary` as today. Where: a local role layer, or Morpheus itself. **Recommendation: (a), in a local role layer** (§3.2). Shown in every proposal screenshot.
7. **Light `destructive`.** **Proposed: `#8f1d1d` light, `#fd2a6d` dark** (measured in §3.1; ΔE_OK ≥ 0.10 from every tone, `ring` and `primary`). Alternative: keep dark `#f47b74` (ΔE 0.047 from coral-strong, fails the threshold).
8. **Group tones' order.** (a) keep (selections start at sky); (b) start at coral. **Recommendation: (a)**, so old and new results keep their colours.
9. **Titles.** (a) mononoki (Morpheus); (b) Archivo 800 (the Matrix). **Recommendation: (a)** (§3.1, images `titles-*`).
10. **Words.** Approve the table in §4 R3b. Within it: *run again* → **open in set-up**; compare's sources **jobs · on disk · vault · files**; and **(de)Cypher stays only as the name of the HTML export** (its default heading), while the place is called *compare*. Alternatives: *run again* → "set up again"; keep "(de)Cypher" as the compare page's title too.
11. **Display names.** Fields and order: (a) sequence · column · run · command; (b) also the walker or replicate folder when the pattern has it. Fallback: today's title. Collisions: the shortest differing folder segment, else the start time. **Recommendation: (a) with (b) when the pattern names it**, e.g. "WRWYCR · HA · walker 1 · awh".
12. **Peaks.** **Recommendation: the dot marks the maximum (filled), the first shell gets a hollow mark and its own stat; tables and CSV show both;** compare's chart header picks maximum, first shell or both. Shown in `result-*` images.
13. **Export style.** Look: (a) the Matrix's (upper-case title, vermilion kicker, its legend); (b) the kit's on-screen look. Data: (a) CSV; (b) CSV and XVG (the Matrix's `graphXvg`). **Recommendation: the Matrix's look, CSV**, plus XVG only if you'd use it in Grace or the Matrix.
14. **Keys.** **Recommendation: keep C (held) for centre and D for compare, add E for export** as the Matrix; write the difference in the contract.
15. **Click in the picker.** (a) toggles the atom in or out of the group being picked; (b) selects that atom alone. **Recommendation: (a).**
16. **Legends.** (a) drop "dimmed"; (b) hover dims the others, a legend menu keeps "dim". **Recommendation: (b).**
17. **Style names, one set for both renderers.** Proposed: **ball & stick, sticks, spheres, lines, cartoon**, where the kit draws ball & stick, sticks (today's licorice) and spheres (today's spacefill), and shows lines and cartoon disabled "not drawn in compare"; 3Dmol draws sticks, spheres, lines, cartoon and gains ball & stick. Alternative: the kit's names everywhere (licorice, spacefill).
18. **3D engines.** Keep two? **Recommendation: yes.** Merging isn't small (§4 R5).
19. **Layout.** Batch: (a) a mode of set-up; (b) its own step. Compare: (a) in results' detail pane and at `#compare`; (b) only at `#compare`. **Recommendation: batch as a mode; compare in both places.**
20. **Status levels.** Approve the table in §4 R9c, including the words **ok · note · check · error** (alternative: the level names ok · info · warning · error).
21. **AWH convergence.** Alignment: (a) by the mean over the shared grid; (b) by the minimum. Against: previous, final, both. Threshold: none until you choose one. **Recommendation: mean; both; none.** The mean is the least-squares offset; the minimum moves with noise.
22. **The AWH unit.** (a) stored in the record at run time; (b) derived when displaying. **Recommendation: (a)** (one `gmx dump -s` per AWH job).
23. **H-bond pairs.** (a) all; (b) the nearest N to the reference (N = 200 by default, changeable); (c) all, drawn faintly, the selected group's in full. **Recommendation: (b)**, with the count of pairs not drawn stated.
24. **Saved views, labels and marks.** **Recommendation: in the vault space when a project is connected; the working state in the browser.**
25. **Jobs at scale.** How many jobs do you expect (hundreds, thousands)? Archive manual only? **Recommendation: manual only.**
26. **`@axe-core/playwright`** as a dev dependency? **Recommendation: yes, dev only.**
27. **`gmx order`.** Carbon groups: (a) from an index file with one group per carbon; (b) built from a selection (e.g. carbon names C21…C216 in tail order). Outputs: `-o` (order tensor), `-od` (S_CD), `-os` (sliced). **Recommendation: (a) for now (gmx order reads an index; building one per carbon is a later step), outputs `-od` by default, `-o` and `-os` when chosen.**
28. **Size and cut points.** §6: about 5,600 lines added, 2,000 removed, 4,400 of tests. **Recommendation: plan for the whole batch, with cut A (after Phase 3) as the first point where you decide whether to go on.**
29. **Ramp tokens.** Morpheus's `heat` and the Matrix's `ramp` fail 3:1 as lines. (a) New `ramp-0…3` in the role layer (ochre → rust → plum → indigo; dark: ochre → lilac-white; measured §3.1); (b) the coral heat hue, darkened until each step clears 3:1 (one hue, lightness only: fewer distinguishable curves). **Recommendation: (a).**
30. **Status colour.** (a) ink icon and word for ok, note and check, `destructive` for errors; (b) Morpheus's mint, sky and butter. **Recommendation: (a)**: next to group cards in mint and sky, (b) reads as group colour. Both in `status-*`.
31. **Compare's "jobs" source.** (a) jobs (it lists this runner's jobs); (b) results. **Recommendation: (a).**
32. **The reference drawn as an ink outline** (chip border, card border, ring; not a filled black chip). **Recommendation: yes**, so it never reads as a selected toggle.
33. **Case in labels.** Morpheus's label style upper-cases text. (a) Axis labels and data names (groups, units) keep their case, the rest of the label upper-cased; (b) as today ("R (NM)", "WATER_O"). **Recommendation: (a).** Units and gmx names are case-sensitive.
34. **The connected project, earlier.** Move the project setting into Phase 2 (before R3c), with sends and saved views staying in Phase 8? **Recommendation: yes.**
35. **Phases 2 and 3 net lines.** By my estimate they add more than they remove (§6). (a) Accept, with the deduplication items themselves net negative; (b) move R6 (exports) and R3c/R3d into their own phase so Phases 2–3 are pure deduplication. **Recommendation: (a).**
36. **The Phase 0 branch.** Phase 0 is committed on `cypher-batch-3` and pushed to `claude/clever-dijkstra-mf14ej`, as you named it. Keep pushing each phase's commits there? **Recommendation: yes**, since this machine's copy doesn't outlive the session.
