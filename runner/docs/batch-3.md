# Task: gmx-cypher batch 3 — one coherent app, (de)Cypher for every analysis, exports, and a vault space of its own

**gmx-cypher** (`runner/`) runs GROMACS analyses on my trajectories and sends the results to **the Matrix** (`matrix/`, a pinned git submodule, formerly PMF Sequences), my visualisation app, without changing it. **(de)Cypher** is gmx-cypher's compare view. It shows structures beside their curves, several results at once, and exports them as one interactive HTML file. Both apps follow my design system, **Morpheus**.

(de)Cypher was ported from a separate design (the RDF Explorer v3), and the rest of gmx-cypher grew one ticket at a time. The result is an app inside the app, with its own words, colours, mouse and keyboard behaviour, chart and 3D engine. This batch makes gmx-cypher one app, then builds the requested features on that common ground.

| # | Request | Kind | Section |
|---|---|---|---|
| R1 | A one-page design contract covering words, colour roles, gestures and keys, and status levels | foundation | 8 |
| R2 | Protect data: handle SIGHUP, and keep a run record that outlives an interrupted job | safety | 9 |
| R3 | One set of words; jobs named from the project pattern; both peak rules named; no ticket numbers in the UI | words | 10 |
| R4 | One colour scheme, with a fixed role for each colour | colour | 11 |
| R5 | One visualization core, guarded by tests | foundation | 12 |
| R6 | Every chart exports to SVG, PDF, PNG, CSV and interactive HTML | export | 13 |
| R7 | AWH and WHAM: ramps for ordered curves, AWH convergence, the AWH axis unit | science | 14 |
| R8 | One mouse and keyboard scheme; every key rebindable; `?` lists the keys | interaction | 15 |
| R9 | Where things live: set-up and results, compare as a routed view, one result layout, one status component | layout | 16 |
| R10 | (de)Cypher for every analysis: RMSF, H-bonds, distance and mindist, RMSD and gyrate | compare | 17 |
| R11 | Graph settings: same scale, line styles, marks for export, renamed groups and reference | compare | 18 |
| R12 | A jobs list that scales: logs on demand, search, filters, archive | runner | 19 |
| R13 | Run diff: what differs between two records | runner | 20 |
| R14 | gmx-cypher's own space in the vault, and a better hand-over to the Matrix | vault | 21 |
| R15 | From the cluster tab to analysis | cluster | 22 |
| R16 | `gmx density` and `gmx order` | command | 23 |

Take your time with each request. A small, correct, tested change is worth more than a fast one. When you are unsure, ask (section 0.5).

**What this spec knows:**
- It was written **from gmx-cypher's code** at `a2b422e` (branch `claude/clever-dijkstra-mf14ej`) and the Matrix at its pinned commit, `e9a64df`. Anything marked **verified** was read in that code, run, or seen in a screenshot of the running app (with the fake `gmx`, in headless Chromium). The numbers in section 3 were measured at that commit.
- R3–R11 come from a review of the app. Section 3 lists where the review turned out wrong or incomplete when checked against the code. Wherever this spec and the code disagree, the code wins; tell me when that happens.
- No real `gmx`, `qq` or cluster was available. Anything about GROMACS output that isn't in the repository's fixtures is **unverified**, and must be checked against real output in Phase 0.

---

## 0. How to work on this task

### 0.1 Repository

- The git root holds `runner/` (gmx-cypher), `matrix/` (the Matrix, a submodule pinned to one commit) and `README.md`. Every path in this spec is relative to the git root.
- **`matrix/` is read-only.** Import from it, and never change it.
  - `npm test` in `runner/` already checks that `matrix/` is at the pinned commit and unchanged (`runner/scripts/matrix-pinned.mjs`). Keep that check passing at every commit.
  - Anything this batch would want changed in the Matrix goes into the report's "For the Matrix" list (section 28), not into `matrix/`.
- Work on a new branch, `cypher-batch-3`, from the current HEAD. Record that commit's hash in the Phase 0 report as the baseline.

### 0.2 Living documents (in `runner/docs/`)

- Save this spec as `batch-3.md`.
- Add a **Batch 3** section to `roadmap.md` with the checklist in section 5. Keep the existing backlog, and move items in or out of it as this batch changes them.
- Continue `decisions.md` from **T157** (the last one is T156). Give each decision a one-line rationale.
- Write the design contract as `design-contract.md` (R1). It is the one page that later decisions point to.
- Save the Phase 0 report as `batch-3-phase0.md`.
- Finish with `batch-3-report.md` (section 28).

### 0.3 Phase 0: Investigate, design and plan (no code changes)

Scratch scripts and throwaway mockups are fine, but keep them outside the repository or delete them. Commit only the Phase 0 documents and small screenshots in `runner/docs/img/batch-3/`.

1. **Baseline.**
   - Run lint, build, Vitest and Playwright in `runner/`, and the Matrix's own tests in `matrix/`.
   - Compare the results with section 3. If anything fails, stop and tell me.
2. **Check this spec against the code.** For each request, confirm or correct its "Today" paragraph, with file references. Section 3 is a starting point, not the whole check.
3. **Design pass (R1, R4, R8, R9), in three steps: plan, review against the brief, then show.**
   - **Plan.**
     - Colour roles: a table of token names and hex values for both themes.
     - Type: mononoki today; whether titles take the Matrix's Archivo 800 (question 9).
     - Layout: a concept for set-up, results, compare and a result page. Describe each in one sentence, with an ASCII wireframe.
     - Principles: three to five, specific to this app.
   - **Review against the brief.** The brief is Morpheus (<https://claude.ai/artifact/RFhVLdZ9iBn1TJ9n3ybC3w>) and the Matrix as it looks today (`matrix/src/index.css` and its screens).
     - Where part of your plan reads like a generic default rather than a choice made for this app, revise it. Say what you changed and why.
     - Where Morpheus and the Matrix disagree, show both and ask.
   - **Show.** Screenshots in light and dark, at 1280 and 1024 px, with today's screen beside the proposal, of:
     - the groups card;
     - the result page;
     - the jobs list with filters;
     - compare (each result, and one graph);
     - the status component at its four levels;
     - the shortcut sheet;
     - the AWH ramp with its convergence trace.

     Throwaway mockups are fine. Commit only the images.
4. **For each request R1–R16, write:**
   - **Current behaviour,** verified, with file references.
   - **Proposed change:** the smallest change that meets the requirements, listing every file you will touch.
   - **Code budget:** lines added and removed. Phases 2 and 3 should remove more lines than they add.
   - **Writes:** every new place on disk that gmx-cypher would write to.
   - **Tests,** by name.
   - **Risks,** including interactions with other requests.
   - **Open questions,** each with options and your recommendation.
5. **Ask me for real samples, and don't build a parser without one.** I need to send:
   - `gmx dump -s` of one of my AWH run inputs (R7). Also dump `runner/test/fixtures/awh/topol.tpr` with a real `gmx` if you have one;
   - an AWH run with many frames (R7);
   - `gmx density -h` and `gmx order -h` from both GROMACS versions I use, a small membrane system, and their outputs (R16);
   - `qq jobs -e` output that includes a finished job (R15).
6. **Size and order.**
   - Estimate the total size of the batch (batch 2 was about 3,700 lines of code), and propose cut points.
   - Confirm the roadmap order in section 5, or propose a better one with reasons.
7. **Questions.** Put every open question into **one numbered list** at the end of the report. Start from section 6, and add your own.

**Then STOP and wait for my answers.** Do not start Phase 1 until I reply.

### 0.4 Phases 1–9: one roadmap item at a time

For each item, in roadmap order:

1. Re-read its section, the design contract and the approved plan. If anything has changed since Phase 0, stop and ask.
2. **Write the tests first.** Run them, and check that they fail for the right reason.
3. Make the smallest change that makes them pass.
4. **Review your own diff.**
   - Simplify it.
   - Delete anything that became dead.
   - Match the naming of the surrounding code.
   - Remove debug output.
5. Run lint, build and Vitest (which includes the `matrix/` check). For any item that changes a screen, also run Playwright.
6. **Run the item's manual checks in Chromium**, and watch the console.
   - Take a screenshot of every visual check, in light and dark.
   - Headless Chromium draws WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
   - Mark anything you can't run (a real `gmx` or `qq`, the cluster, my data) as **not run**, and list it for me. Never report a check as passed unless you ran it.
7. **Critique what you built against the design contract,** using the screenshots: words, colour roles, gestures, status levels and layout order. Before calling the item done, remove one thing that doesn't need to be there.
8. Update `roadmap.md` and `decisions.md`. If a rule changed, update `design-contract.md` too.
9. Commit (section 27).
10. Give me a short summary (3–5 lines):
    - what changed;
    - net lines added or removed;
    - tests added;
    - manual checks run or not run, with screenshots;
    - anything you want me to look at.

**At the end of each phase, stop and wait for my go-ahead** before starting the next one.

### 0.5 When to stop and ask

Ask instead of guessing when:
- a request is ambiguous, or has more than one reasonable behaviour or look;
- gmx-cypher would write anywhere new, especially inside the vault (R14);
- a change would alter a number, a stored record, an existing file name, or how an old record is read;
- a gesture or key I already use would change meaning (R8);
- Morpheus and the Matrix disagree, or a token would deviate from Morpheus (R4);
- the code contradicts this spec or the approved plan;
- an item would exceed its code budget by more than about 50 %;
- you want a dependency that isn't already in `runner/`;
- a parser or test needs real output you don't have.

Batch your questions where you can, each with options and a recommendation. Don't ask about anything the code, the docs, the design contract or this spec already settles.

---

## 1. Principles

### 1.1 Minimal, concise code

- **This batch removes duplication before it adds features.** Phases 2 and 3 leave one copy of each shared piece (section 12). Later phases build only on that copy.
- **Extend what exists before adding anything.** Reuse:
  - **the Matrix, by import**, as gmx-cypher already does (`parseTable`, `parseName`, `parsePath`, `structFile`, `storage/path`). That includes:
    - its export pipeline (`graphScene`, `toSVG`, `toPNG`, `toPDF`, `ExportPrefs`);
    - its dash patterns and their names (`DASH`, `DASH_NAMES`);
    - its graph gestures and hover readout (`interact.ts`);
    - its shades (`shade.ts`);
  - **the (de)Cypher kit** (`runner/src/decypher/kit.ts`), as the visualization core (section 12);
  - gmx-cypher's own command definitions, records, recipes, batch and landing preview.
- **Every decision is a pure function, with table-driven tests.** That covers names, colour roles, ramps, key bindings and their conflicts, drop routing, convergence, record diffs, job filters and the vault space's paths. Components and the server only call these functions.
- **Delete code that becomes unused.** No commented-out code, and no `TODO` without a roadmap entry.

### 1.2 Design and front-end practice

- **Morpheus is the brief, and the Matrix is the neighbour.**
  - Morpheus decides components, tokens and voice.
  - Where gmx-cypher and the Matrix show the same thing (a chart, an export, a key, a word), gmx-cypher matches the Matrix unless I decide otherwise.
  - Read Morpheus's README again before any new screen.
- **Morpheus's rules stay:**
  - lowercase controls;
  - one primary action per view;
  - states as words;
  - destructive actions armed on the first click and done on the second;
  - visible focus on every control.

  Morpheus still has no Table and no Combobox (both are in the backlog). Build those small and semantic from tokens, as before.
- **Structure carries information.**
  - Borders, numbers, labels and dividers each say something about the content.
  - Use numbered markers only for real sequences. The set-up steps are one such sequence; the sources in compare are another.
  - Be bold in one place only: compare's structure beside its curves. Keep everything around it quiet.
- **Writing.**
  - Name things by what I understand, not by how the code is built.
  - An action keeps its name through the whole flow: *send* gives "sent", and *archive* gives "archived".
  - Errors say what happened and how to fix it. They are never vague and never apologise.
  - An empty screen invites the next action.
  - Nothing the page shows contains an internal reference (a ticket, question or decision number).
- **Quality floor.** Meet it without announcing it:
  - the keyboard reaches everything, and every gesture has a keyboard or menu equivalent;
  - contrast is at least 4.5:1 for text, and at least 3:1 for curves, atoms and focus rings, in both themes;
  - `prefers-reduced-motion` is respected;
  - every screen works at 1024 px wide;
  - there are no console errors or warnings;
  - status changes are announced (`aria-live="polite"`).
- **Platform keys.** Use ⌘ on macOS where other platforms use Ctrl. On macOS, Ctrl+click opens the context menu, and 3Dmol moves the structure on Ctrl+drag (T94). Show the right key everywhere, with `Kbd`.

### 1.3 Running programs and files safely

These rules are unchanged from batch 2, with additions:
- **No shell for local processes:** an argument array, `shell: false`. Stdin answers are written to the process.
- **Nothing existing is ever deleted or overwritten.**
  - New files are created exclusively (`wx`), or written to a temporary name and renamed into place.
  - Archiving moves files; it never deletes them.
- **The vault.**
  - gmx-cypher writes only to `<project>/_inbox/` (as today) and to its own space (R14).
  - It never writes to `.matrix/` or to any other part of a project folder.
  - It reads the vault only through the read-only backend (T66).
- **Paths and parameters.** Paths from the page are checked against the allowed folders, as today. A route's parameters (R9) are IDs, checked against a strict pattern; they are never paths.

### 1.4 Data practice

- **A label is not the data.** Renamed groups (R11), display names (R3) and colours change only what the page shows. They never change the record, the `.ndx`, the `.xvg` or what is sent to the vault.
- **Every export says where its numbers came from:** the record, the command, the gmx version and the SHA-256 of the source file.
- **Every choice that changes a number is visible and recorded.** This batch adds:
  - the peak rule (R3);
  - the offset alignment of AWH convergence (R7);
  - shared axes (R11);
  - the centre used for a distance line (R10).
- **Exports carry the full data.** CSV has every point at the precision gmx wrote. Only drawings may be decimated. Hover readouts read the full data, as the Matrix's do (F101).
- **Ordered data looks ordered.** Use a sequential ramp in the data's own order:
  - time, for AWH;
  - position along ξ, for WHAM. This is not the file's column order (batch-2 Phase 0 report, section 4.1).
- **Two curves never differ by hue alone** (T147). This holds on screen and in every export, for any number of curves.
- **GROMACS output stays exactly as gmx wrote it.** Anything sent to the Matrix is in kJ/mol.

---

## 2. Scope limits

- `matrix/` stays unchanged. Requests for the Matrix go into the report.
- No job submission (`qq submit`), and no killing jobs (batch 2, question 3).
- No undo/redo.
- The 3Dmol viewer in the group picker stays, for large systems and the cartoon style. Merging the two 3D engines is out of scope unless Phase 0 shows it is small (question 18).
- Bugs you find along the way go into the backlog, unless they sit on lines this batch already changes.
- No new dependency without asking.

---

## 3. What was verified for this spec

**Baseline** at `a2b422e`, with the Matrix at `e9a64df`, on Node 22, with the fake `gmx`:

| Check | Result |
|---|---|
| `npm run lint` | 0 warnings, 0 errors, 182 files |
| `npm run build` | passes. Main bundle 625 kB; (de)Cypher (123 kB) and 3Dmol (574 kB) load on demand |
| `npx vitest run` | 664 passed, 1 skipped, in 64 files |
| `npx playwright test` | 6 passed |
| `matrix/` | at the pinned commit, unchanged |

**The review's claims, checked in the code:**

| Claim | What the check found |
|---|---|
| Ticket numbers appear in nine UI strings: `commands.ts` lines 185, 186, 231, 232, 284 and 376; `Wham.tsx` line 130; `Result.tsx` lines 225 and 242 | **True,** all nine (in `runner/src/lib/` and `runner/src/views/`). "(question 33)" and "(T122)" show in the command picker's disabled items (screenshot). Code comments may keep their references. |
| `primary` is coral, `ring` is coral-strong, and light `destructive` equals coral-strong | **True.** Light `destructive` and light `coral-strong` are both `#c62410` (`tokens.json`). The reference "sulfur" shows in that red in four places (screenshots): the groups card (red border, red count), the click hint, the analysis view's group list, and the result's group table. |
| (de)Cypher draws the reference in ink | **True:** a black chip and black rings. |
| (de)Cypher's source dots use the group tones | **True:** the first source is coral, the second sky. |
| `TONES` is defined twice | **Three times:** in `lib/tones.ts`, in `decypher/kit.ts`, and as `TONES_FOR_TERMS` in `views/Result.tsx`. |
| `DASH` is defined three times: 10 patterns, 10, and 6 | **True.** `ui/line-chart.tsx` has 10, identical to the Matrix's `matrix/src/lib/graph.ts` (which also names them in `DASH_NAMES`). The kit has 6. With 9 RDFs on one graph coloured by group, the 3rd and the 9th get the same dash (index 8 mod 6 = 2) and the same colour (the lightening stops increasing after the 3rd), so their curves are identical. |
| `niceTicks` exists twice, atom ranges twice, and structure parsing three times | **True.** `niceTicks` is in `ui/line-chart.tsx` and the kit. Range parsing is in `lib/atoms.ts` (`toRanges`, `fromRanges`) and the kit (`ranges`). Structure parsing is in `lib/atoms.ts` (`atomTable`, with `lib/box.ts`'s `atomCoords`), in `decypher/parse.ts` (`parseGro`, `parsePdb`) and in the kit (`buildMol`). |
| There are three chart engines and three 3D viewers | **Two of each in gmx-cypher.** The charts are Morpheus's `LineChart` (`ui/line-chart.tsx`) and the kit's chart. The 3D viewers are 3Dmol (`views/Viewer.tsx`) and the kit's canvas. The third of each is the Matrix's own. |
| The kit's `NEUTRAL` colours are hard-coded hex | **True:** 18 hex values in `kit.ts`, the only hex colours in `src/` outside `tokens.json`. |
| Peaks: "first peak" (T27) against the maximum (T152) | **True, even on one page.** The result shows a "first peak · water_O" stat (T27's rule) directly under the caption "the dot marks each curve's maximum". (de)Cypher uses the maximum. |
| Gestures conflict between screens | **True.** In the picker, Shift-click takes the residue and Alt-click takes the atom name (`Viewer.tsx`). (de)Cypher's chips use ⌘/Ctrl/Shift-click to add or remove (`panels.tsx`), and Alt-drag pans. Result legends cycle shown → dimmed → hidden. For keys, C (held) centres and B shows the box in the picker, while (de)Cypher has F, R, [ and ]. Only D can be rebound (`lib/shortcuts.ts`), and nothing lists the shortcuts. |
| The two style menus use different names | **True.** The picker offers cartoon, sticks, spheres and lines (3Dmol); (de)Cypher offers ball & stick, licorice and spacefill (the kit). |
| (de)Cypher is a dialog without an address | **True.** The tabs live in the hash (`#jobs`, in `App.tsx`); (de)Cypher is a full-screen dialog. |
| Startup replays every job's ndjson and keeps every log in memory | **True.** `server/jobs.ts` reads every `<home>/jobs/*.ndjson` in full and appends each `out` event to `job.log`, in memory. The list is flat. |
| The SIGHUP problem | **SIGHUP is not handled.** `server/main.ts` stops cleanly only on SIGINT and SIGTERM. On SIGHUP (an SSH session closing), Node exits without calling `stopAll`. Jobs run in their own process group (`detached: true`), so gmx keeps running unwatched and no record is written. The next start then marks the job as interrupted. |
| A job's record | Written **only when the job ends** (`server/runs.ts`), and "a job interrupted by a restart of gmx-cypher gets no record". The final write isn't atomic. |
| AWH and WHAM palettes | **True.** Both use the eight tones in order, then the same tones dashed (`Result.tsx`: `AwhChart`, `WhamChart`). So WHAM's 9th window repeats the 1st window's hue, dashed. |
| AWH's x-axis should use the xvg's own label | **It already does** (`parseTable(...).head.xLabel`). The real problem is that **gmx awh itself writes "(nm, deg or lambda state)"** (fixture `test/fixtures/awh/out/awh_t0.xvg`). The unit has to come from the run input (R7). |
| The H-bond pairs are "already in the record" | **Nearly.** The selection tool's `-o <stem>_hbonds.ndx` is an output that the record lists, not data inside the record. The legacy tool writes no pairs file. |
| The Matrix types for R16 | The Matrix has a `density` type (matched by "density" and by the tool `gmx density`) and an `order` type (matched by "order parameter", drawn as points), in `matrix/src/lib/seq.ts`. Not yet checked against real output. |

**Seen in a screenshot, but not in the review:** on *one graph*, curves that extend past the leading RDF's range are drawn beyond the plot's right edge (they aren't clipped). Confirm this in Phase 0, and fix it with R5 if it's real.

---

## 4. The Matrix, where gmx-cypher meets it

All read in `matrix/` at `e9a64df`.

- **The vault scan.**
  - `scanProject` (`storage/index.ts`) walks only each project's folder.
  - Every file in that folder that no record references, and that isn't ignored, a note or a conflict copy, is listed under *Untracked files* (`storage/project.ts`).
  - A folder named `<slug>--<id>` directly inside a project folder is read as a column.
  - `.matrix/` holds the Matrix's records, journal, trash and cache. gmx-cypher never writes there.
  - So anything gmx-cypher puts **inside** a project folder shows up as untracked (this is how `_inbox` works today, in `server/send.ts`). A space **outside** every project folder is not scanned. Verify both with the Matrix's own code before R14 writes anything.
- **Routes.** The only route is `#/p/<project>/<page>` (`App.tsx`). There is no route to a cell, so a deep link to a cell is a request for the Matrix.
- **Export.**
  - The export code uses no storage, and no DOM except for PNG.
  - `graphScene(GraphData)` feeds `toSVG`, `toPNG` and `toPDF` (the Matrix's own vector PDF writer). There is also `graphXvg`.
  - `ExportPrefs` holds the settings: format; size in px or mm, with journal presets of 85, 114 and 174 mm; theme (light, dark or print); font size; title; grid; a file-name template; a legend with marks and values; grid layouts.
  - `GraphData` takes series (`x`, `y`, `color`, `dash`, `width`), axis labels, a domain, and `pins` (marks and reference lines).

  It looks like a direct fit for R6. Prove that in Phase 0 by exporting one gmx-cypher RDF through it.
- **Graph gestures** (`components/Plot.tsx`, `lib/interact.ts`):
  - hover reads the nearest point of the full data;
  - click marks a point;
  - Ctrl/⌘-click draws a vertical line, and with Shift a horizontal one;
  - the arrow keys step along a curve, and Enter marks.
- **Keys** (defaults in `lib/seq.ts`, all rebindable): K laser pointer, C compare, E export.
- **Lines.** `DASH` has 10 patterns, named in `DASH_NAMES`: solid, dashed, dotted, dash-dot, fine dots, long dash, short dash-dot, even dash, spaced dots, long dash-dot.
- **Colour and type.**
  - The same grounds and ink as Morpheus (`#f3f2f2`, `#eae9e9`, `#201e1d`).
  - mononoki for text, and Archivo 800 for titles.
  - One vermilion accent: `--acc`, `#ec3013` in light and `#ff563c` in dark.
  - Sequential ramps for tiles in `lib/pmf.ts` (`ramp`, `rampSky`), and OKLCH shades in `lib/shade.ts`.
- **Types** (`lib/seq.ts`): PMF, Histogram, RDF, RMSD, RMSF, Rg, H-bonds, Distance, Energy, Free energy (z), Density, Order parameters, Temperature, Pressure, and Data.

---

## 5. Roadmap

Copy this into `runner/docs/roadmap.md`, and keep it current.

**Why this order:**
- **Data protection comes first.** It is small, and it protects everything that comes after.
- **The contract comes before the code it governs,** so later items aren't done twice.
- **The core comes before the features drawn with it.** Exports, ramps and compare for every analysis all come from one place.
- **AWH convergence comes early,** because it is the biggest scientific gain, and it is built on the core.
- **Layout and interaction come after the core,** so the new layout uses the final components.
- **The runner's scale, the vault and the cluster items are independent.** They come last, when my samples are in.

### Phase 0: Plan and design
- [ ] Baseline recorded; section 3 confirmed or corrected
- [ ] Design pass: plan, review against the brief, screenshots
- [ ] R1a `design-contract.md` drafted
- [ ] Phase 0 report for R1–R16; samples asked for
- [ ] Questions answered; decisions recorded; order confirmed

### Phase 1: Protect data (R2, R3a, R14a)
- [ ] R2a SIGHUP
- [ ] R2b The record is written when the job starts, and completed atomically when it ends
- [ ] R3a Ticket references out of the UI, with the test that keeps them out
- [ ] R14a The vault space, and a copy of the record beside each sent result (if agreed)

### Phase 2: The contract in code (R1, R3, R4, R9c)
- [ ] R4a Colour roles; the reference in ink; `destructive` used only for errors
- [ ] R4b `NEUTRAL` moved into the tokens; no hex outside the tokens
- [ ] R3b One set of words on every screen
- [ ] R3c Display names from the project pattern
- [ ] R3d Both peak rules, named and shown
- [ ] R9c One status component, used for every status

### Phase 3: One visualization core (R5, R6)
- [ ] R5a One copy each of tones, dashes (the Matrix's 10, with names), ticks and atom ranges
- [ ] R5b One structure model
- [ ] R5c Every chart drawn by the core, with a hover readout; the Morpheus `LineChart` copy removed
- [ ] R6a Every chart exports to SVG, PDF, PNG and CSV, and any result to HTML
- [ ] R6b Export settings

### Phase 4: AWH and WHAM (R7)
- [ ] R7a Ramps for ordered curves
- [ ] R7b AWH convergence
- [ ] R7c The AWH axis unit, from the run input

### Phase 5: Layout and interaction (R8, R9)
- [ ] R9a Set-up and results; compare as `#compare`; old addresses still work; drops routed by type
- [ ] R9b One result page layout; (de)Cypher's controls regrouped
- [ ] R8a One gesture scheme for structures, charts and legends
- [ ] R8b Every key in one registry, rebindable, listed by `?`; one style menu

### Phase 6: Compare every analysis (R10, R11)
- [ ] R10a Results of any command in compare: cards, and one graph for like quantities
- [ ] R10b RMSF on the structure
- [ ] R10c H-bond pairs
- [ ] R10d Distance and mindist lines
- [ ] R11a Same scale
- [ ] R11b Line styles
- [ ] R11c Marks and lines, carried into exports
- [ ] R11d Renamed groups and reference

### Phase 7: The runner at scale (R12, R13)
- [ ] R12a Logs on demand; startup without logs in memory
- [ ] R12b Search, filters, multi-select
- [ ] R12c Archive
- [ ] R13 Run diff

### Phase 8: Vault, cluster and commands (R14, R15, R16)
- [ ] R14b Connect to a project: names, sends, and saved compare views in the space
- [ ] R14c Compare reads record copies from the space, giving groups for any sent RDF
- [ ] R15 A finished cluster job offers a recipe or batch (only with a `qq jobs -e` sample)
- [ ] R16a `gmx density`
- [ ] R16b `gmx order`

### Phase 9: Finish
- [ ] `runner/README.md` updated (section 25)
- [ ] Manual QA in Chromium, and with a real `gmx` where available; results recorded
- [ ] Fresh-context review of the whole branch against section 26 and the design contract; findings fixed or recorded
- [ ] Final report

### Backlog (add to it, don't do it)
- Job submission and killing jobs.
- One 3D engine for the picker and compare (unless it is done in this batch).
- Requests for the Matrix and for Morpheus (section 28).

---

## 6. Decisions to put to me in Phase 0

Each question needs options and your recommendation in the report. The recommendations below are mine; change them if the code says otherwise.

1. **What "run-record sidecar" means.** The review asked for it without saying what it is. It could be R2b (a record written when the job starts) or R14a (a copy of the record beside each result sent to the vault). *Recommendation: both, since both are small.*
2. **SIGHUP.** Should gmx-cypher stop cleanly (cancel the jobs and record them as cancelled), or keep running (ignore the signal and log it, so the jobs finish and get their records)? *Recommendation: keep running.*
3. **The record format.** Is this format v1 with optional new fields, or v2? v1 must stay readable either way. *Recommendation: v1 with optional fields, if the frozen-format test (T93) allows additive fields.*
4. **The vault space:**
   - its name and place;
   - its contents: records and views, and recipes too?
   - whether the records' absolute paths are kept or made relative.

   *Recommendation: `<vault>/gmx-cypher/`, holding records and views, with paths made relative to their allowed folder, as the HTML export already does (T150).*
5. **The connected project.** One project at a time, set in settings, or a project per job? *Recommendation: one, in settings.*
6. **The colour for UI state:**
   - ink, or a new accent outside the data palette;
   - where the deviation from Morpheus lives: a local role layer, or Morpheus itself.

   *Recommendation: ink, in a local role layer.*
7. **The light `destructive` value.** It needs a new value, distinct from `coral-strong`. Propose one, with its contrast measured.
8. **Group tones.** T42 gives the reference `coral`, so selections start at `sky`. Now that the reference is drawn in ink, should new selections start at `coral`? *Recommendation: no. Keep the order, so old and new results keep the same colours. The reference's stored tone is simply not drawn.*
9. **Titles.** mononoki (Morpheus) or Archivo 800 (the Matrix) for page and card titles? Show both.
10. **Words.** Approve the before → after table of every string that changes (R3b), including what *run again* becomes.
11. **Display names.** Which fields, in which order, the fallback, and how to tell apart names that collide.
12. **Peaks.** Which rule does the chart dot mark? *Recommendation: the dot marks the maximum (T152); the first shell gets a second mark and its own stat; tables show both.*
13. **Export style:**
    - the Matrix's look, or the kit's on-screen look;
    - CSV only, or CSV and XVG.

    *Recommendation: the Matrix's look, with CSV.*
14. **Keys.** The Matrix uses C for compare and E for export; gmx-cypher uses C (held) to centre and D for (de)Cypher, both of which I asked for. *Recommendation: keep C and D, add E for export as in the Matrix, and record the difference in the contract.*
15. **Clicks in the picker.** Should click keep toggling an atom in or out of the group being picked, or select that atom alone? *Recommendation: keep toggling, because building groups depends on it.*
16. **Legends.** Should the "dimmed" state go, or move into a menu? *Recommendation: hover dims the others; a legend menu keeps "dim".*
17. **Style names.** One set of names across the two renderers.
18. **3D engines.** Keep two? *Recommendation: yes, unless merging them is small.*
19. **Layout:**
    - batch as a mode of set-up, or as its own step;
    - compare in the results' detail pane and also at `#compare`.

    *Recommendation: batch as a mode; compare in both places.*
20. **Status levels.** Approve the level given to each existing message (R9c).
21. **AWH convergence:**
    - aligning frames by their minimum or by their mean;
    - comparing each frame against the previous frame, the final frame, or both;
    - a threshold, or none until I choose one.

    *Recommendation: compare against both; no threshold.*
22. **The AWH unit.** Store the derived unit in the record at run time, or derive it when displaying? *Recommendation: store it.*
23. **H-bond pairs.** Draw all of them, or only the nearest N?
24. **Where saved views, labels and marks live.** *Recommendation: in the vault space when a project is connected, and the working state in the browser.*
25. **Jobs at scale.** How many jobs do I expect? Is archiving manual only? *Recommendation: manual only.*
26. **Accessibility checks.** May I add `@axe-core/playwright` as a dev dependency? *Recommendation: yes, dev only.*
27. **`gmx order`.** Carbon groups from an index file, or built from a selection? And which outputs?
28. **Size.** The total size of the batch, and the cut points.

---

## 7. Files you will mostly work with

| Area | Files |
|---|---|
| Server | `server/main.ts` (signals), `server/jobs.ts` (the job log), `server/runs.ts` (records), `server/send.ts` (the vault inbox), `server/vault.ts` (reading the vault), `server/decypher.ts` (compare sources), `server/api.ts`, `server/recipes.ts`, `server/cluster.ts`, `server/awh.ts`, `server/wham.ts` |
| Core | `src/decypher/kit.ts`, `src/decypher/parse.ts`, `src/lib/tones.ts`, `src/lib/atoms.ts`, `src/lib/box.ts`, `src/ui/line-chart.tsx`, `src/tokens.json`, `scripts/tokens.ts` |
| Views | `src/App.tsx` (tabs and hash), `src/views/*.tsx` (`Result.tsx` holds every result kind), `src/decypher/Decypher.tsx`, `panels.tsx`, `sources.ts`, `state.ts`, `export.ts` |
| Words | `src/lib/commands.ts` (command definitions, and the reasons the picker shows) |
| Keys | `src/lib/shortcuts.ts`, `src/lib/keys.ts`, `src/views/Settings.tsx`, `src/views/Viewer.tsx` |
| Tests | `test/tokens.test.ts`, `test/contrast.test.ts`, `test/decypher-*.test.ts`, `test/golden-rdf.test.ts`, `test/formats.test.ts`, `test/jobs.test.ts`, `test/runs.test.ts`, `test/shortcuts.test.ts`, `test/fake-gmx.mjs`, `e2e/*.spec.ts`, `e2e/make-vault.ts` |
| The Matrix (read-only) | `matrix/src/lib/export.ts`, `exportPrefs.ts`, `graph.ts`, `interact.ts`, `shade.ts`, `pmf.ts`, `seq.ts`, `keys.ts`, `storage/index.ts`, `storage/project.ts`, `storage/path.ts`, `components/Plot.tsx`, `index.css` |

All paths except the Matrix's are under `runner/`.

---

## 8. R1: The design contract

### Today
No single description exists. The rules are scattered across Morpheus and decisions such as T42, T94, T139–T141 and T145–T156, and they disagree (section 3).

### Requirements
`runner/docs/design-contract.md`, one page, with seven parts:
1. **Words:** term → what it means → what it is never used for (R3).
2. **Colour roles:** role → token → used for → never used for (R4).
3. **Gestures** by surface (structures, charts, legends and chips, lists), and **keys** (default, action, where it works, whether it can be rebound) (R8).
4. **Status levels:** ok, info, warning and error, each with its icon, word and token, when it is used, and examples from the app (R9c).
5. **The order of a result page** (R9b).
6. **Writing rules,** in five lines.
7. **Enforcement:** the test that enforces each rule, or "reviewed by hand".

The machine-checkable parts live in one small module, `src/core/contract.ts`, which the tests, the shortcut sheet and the page all read:
- the phrases the UI never shows;
- the map from roles to tokens;
- the default keys.

The markdown quotes the module; it doesn't copy it.

### Tests
- The contract module's tables are complete: every role has a token, every key has an action, and every status level has an icon and a word.
- Each drift test (R3a, R4, R5, R8) reads its rule from the module.

---

## 9. R2: Protect data

### R2a SIGHUP

**Today (verified):** see section 3.

**Requirements:**
- SIGHUP gets the behaviour chosen in question 2, and the runner says so in its log.
- **At start,** a job without an end whose pid is still alive shows as "still running, not followed (pid N)" instead of "interrupted". Claim this only when that pid's command line matches the job's program (`/proc/<pid>/cmdline` on Linux, `ps -p` on macOS); otherwise the job is interrupted, as today.
- gmx-cypher never invents a job's end.

**Tests:**
- Start the server with a slow fake `gmx` and send it SIGHUP. Assert the chosen behaviour: either the job ends cancelled with a record, or the server still answers and the job ends done with its record.
- Restart with a live pid that belongs to another program: the job is interrupted.
- Restart with a live pid whose command line matches: the job is still running.

### R2b The record exists from the start

**Today (verified):**
- The record is written when the job ends; an interrupted job gets none.
- For a command without groups, the record path is claimed at the start as an empty file.
- The final write is not atomic.

**Requirements:**
- **When the job starts,** write the record with what is already known: inputs, command, options, groups, versions, and a state that says the job is running. Hashes that are still being computed may be filled in at the end.
- **When the job ends,** complete the record by writing a temporary file and renaming it into place.
- (de)Cypher, *run again*, batch and send ignore a record that isn't complete, or flag it in words.
- The format follows question 3. Old v1 records must always be read.

**Tests:**
- A completed job's record equals today's record, apart from the new fields (golden, against the existing fixtures).
- A job killed mid-run (the server stopped with SIGKILL) leaves a record that says it didn't finish.
- No partial record is left behind: test the write-then-rename path.
- The v1 fixtures still read (`test/formats.test.ts`).

---

## 10. R3: One set of words

### R3a No ticket numbers in the UI

**Today (verified):** nine strings (section 3).

**Requirements:**
- Rewrite each string so that it gives the reason in plain words. For example, "(question 28)" becomes "the profile is not sent to the vault: the Matrix would read it as a histogram".
- A test keeps the references out. It uses TypeScript's scanner over `src/**/*.ts(x)` and the server's messages that reach the page. It checks string literals, template text and JSX text, but not comments, and fails on `(question N)`, `(T123)` or `(R9c)`.

### R3b The vocabulary

**Requirements.** One meaning per word, applied on every screen, in (de)Cypher, in the exports and in the README:

| Term | Means only | Replaces |
|---|---|---|
| job | one gmx execution by gmx-cypher | "run" as a noun (for example, in *run again*) |
| record | a job's `.run.json` | the *runs* source in (de)Cypher, which becomes *on disk* |
| run | the Matrix's replicate slot (a, b, …) | — |
| result | what a job produced (an RDF, a profile, …) | "job" in *each job* and *link groups in every job* |
| analysis | the Matrix's type of a curve set, only | the *analysis* tab, and (de)Cypher's internal type name in the UI |
| first shell / maximum | the two peak rules, always named | "peak" on its own |

- Verbs can stay: *run* still starts a job.
- Phase 0 lists every string that changes as a before → after table, for my approval (question 10).

**Tests:** the contract's list of phrases the UI never shows (for example, "each job", or "peak" without a rule's name), checked over the UI strings by the R3a scanner.

### R3c Names from the project pattern

**Today (verified):**
- A job's title is `<stem> · <reference> → <selections>`, fixed when the job is created (`server/runs.ts`).
- My jobs list showed five identical "rdf_07_md · sulfur → water_O" entries.
- The send dialog already reads the sequence, column and run from the folder path, using the project's pattern (`lib/landing.ts`, and the Matrix's `parsePath`).

**Requirements:**
- A display name, **computed rather than stored,** from the job's trajectory folder and the connected project's pattern (R14b). For example: "WRWYCR · HA · walker 1 · rdf".
- Without a project or a match, fall back to today's title.
- When names still collide, add the shortest part that tells them apart (a folder, or the time).
- The same name appears in the jobs list, compare's sources, export headings and file-name templates.
- Old jobs get the new name too, since it is computed.

**Tests:**
- Table-driven, with the Matrix's `parsePath` on folder paths shaped like mine.
- Fallback.
- Collisions.

### R3d Both peak rules

**Today (verified):** the result page shows T27's "first peak" next to a dot at the maximum (T152). (de)Cypher shows only the maximum.

**Requirements:**
- Results, (de)Cypher, exports and CSV show both values, named *first shell* and *maximum*.
- The chart marks follow question 12, and the caption names what each mark means.
- T27's fallback (a g(r) that never rises above 1) is named as the maximum.
- Other curves keep their max and min marks.

**Tests:**
- Both values on the fixture RDFs.
- The fallback case.
- The names in the stat cards and the CSV.

---

## 11. R4: One colour scheme

### Today (verified)
See section 3: one red does five jobs, the reference is drawn two ways, hue means two things inside (de)Cypher, and there is hex in the kit.

### Requirements

| Role | Token | Used for | Never used for |
|---|---|---|---|
| UI state | ink, or one accent outside the data palette (question 6) | the selected toggle, the primary action, the focus ring, the active tab | data |
| Error | `destructive`, with a value distinct from every data tone in both themes (question 7) | errors, *failed*, and armed destructive actions | anything else |
| Group | the eight tones | a group, from the picker → record → result → compare → export | UI state |
| Reference | ink | the reference everywhere: card, chip, text and 3D ring | — |
| Source | a numbered badge and a dash; hue only with *colour by result* | the sources in compare | — |
| Ordered series | a sequential ramp (R7a) | AWH frames, WHAM windows, RMSF on atoms | categories |
| Neutral | tokens taken from the kit's `NEUTRAL` | atoms and bonds outside every group | — |

- **Where the deviation lives.** Where a role deviates from Morpheus, it lives in a small role layer on top of a verbatim copy of Morpheus's `tokens.json` (for example `runner/src/roles.json`, generated into CSS by `scripts/tokens.ts`), unless question 6 decides otherwise. That way, a future Morpheus update stays a plain copy.
- **Stored tones stay.** Records keep their stored tones (question 8).
- **More than eight groups.** A tone never repeats together with the same dash or number.

### Tests
Extend `tokens.test.ts` and `contrast.test.ts`:
- each tone's `-strong` is at least 3:1 on `background` and on `card`, in both themes;
- `<tone>-foreground` on `<tone>` is at least 4.5:1;
- `destructive` differs from every tone, from `ring` and from `primary`, by more than a colour-distance threshold that you choose and justify;
- no UI-state token resolves to a data tone;
- no hex colour appears in `src/**` outside `tokens.json` and the role layer (generated CSS excluded);
- `text-destructive` and `bg-destructive` appear only in the status component and in destructive buttons;
- the reference is drawn in ink in the picker, the result and compare (computed style, in Playwright).

### Manual checks
Screenshots of the groups card, the picker's hints, the result's group table and compare, in light and dark.

---

## 12. R5: One visualization core

### Today (verified)
See section 3: three `TONES`, three `DASH`, two `niceTicks`, two range parsers, three structure parsers, two chart engines, and two 3D viewers.

### Requirements
- **The kit is the core:** palette from the tokens, tones, dashes (the Matrix's 10, with their names), ticks, atom ranges, the structure model, the chart and the hover readout.
  - The kit may move to `src/core/`.
  - Everything else imports these from one module, `src/core/index.ts`. Nothing else defines them.
- **The kit stays self-contained for the HTML export (T146).**
  - Whatever it needs from outside is passed in as data when it is created: the tones' order, `DASH` and `DASH_NAMES` from the Matrix, the role layer and the neutrals.
  - That data is written into the export as JSON.
  - A test checks that the kit's dashes equal the Matrix's `DASH`.
- **One structure model.** One parser for `.gro` and `.pdb` (atoms, residues, coordinates and box), used by the picker's atom table, the box, (de)Cypher and the export.
  - T14's rule must hold: an atom is drawn when the Matrix's `toPdb` keeps it, as decided by `elementOf`.
  - Since the kit can't import, Phase 0 shows how this will work.
- **Every chart in gmx-cypher is the core's chart.**
  - Result views stop using `ui/line-chart.tsx`, and its local error band moves into the core (WHAM needs it).
  - So every chart gets the hover readout (highest values first, T153), the peak marks, the "never by hue alone" rule and the exports (R6).
- **Curves are clipped to the plot area** (section 3).

### Tests
Drift tests, in `tokens.test.ts`, `contrast.test.ts` or a new `core.test.ts`:
- `TONES`, `DASH`, `niceTicks`, the range parser and the structure parsers are defined only in the core. Check this with the TypeScript scanner, not with regexes that would also match comments.
- Every chart in `src/views` and `src/decypher` comes from the core.
- The core chart has a hover readout (component test: hover, then read the rows).

Golden and behaviour tests:
- **The numbers don't move.** Through the core, every result kind produces the same series (x, y, labels) as before: RDF, AWH, WHAM, energy, distance, H-bonds, rms, rmsf, gyrate and mindist.
- The kit rebuilt from its own source text still equals the page's kit (T146's test, kept).
- With 1 to 14 RDFs on one graph, no two curves share both colour and dash.

### Code budget
Net negative.

---

## 13. R6: Every chart exports

### Today (verified)
(de)Cypher exports one HTML file. Result views export nothing; the original `.xvg` stays in its folder.

### Requirements
- **Every chart exports:**
  - **to SVG, PDF and PNG,** through the Matrix's `graphScene` → `toSVG`, `toPDF` and `toPNG` (by import), so gmx-cypher's figures match the Matrix's (question 13);
  - **to CSV,** with x and every curve at full precision, under one header row of names (the display labels from R11d) and units. Before it come `#` comment lines with:
    - the command;
    - the gmx version;
    - the record's path;
    - the source xvg's SHA-256;
    - a map from each group's label to its gmx name and atoms;
  - **to HTML:** the interactive (de)Cypher export, from any result or any selection.
- **Export settings** live in settings → export.
  - They use the Matrix's `ExportPrefs` fields, kept in this browser under gmx-cypher's own key.
  - The file-name template gains gmx-cypher's fields: `{project}`, `{sequence}`, `{column}`, `{run}`, `{command}`, `{group}` and `{date}`.
- **The export key** (E, as in the Matrix; question 14) exports the focused chart in the default format.
- **Compare** exports the current view as one chart, as all cards, or as a grid (the Matrix's grid layout, or a multi-page PDF).
- **The structure** exports to PNG. Ask before adding SVG for structures, unless the kit's canvas can produce it cheaply.

### Tests
- SVG and PDF of a fixture RDF: the right number of series, labels and dash patterns, and no external references.
- The PDF parses: header, trailer and page count.
- The CSV round-trip equals the xvg's numbers exactly: every point, every digit.
- The file-name template, table-driven.
- The HTML export of a single result opens offline (extend the existing e2e test).

### Manual checks
Export every result kind, and open each file in a browser and a PDF viewer. Screenshots.

---

## 14. R7: AWH and WHAM

### R7a Ramps for ordered curves

**Today (verified):** categorical tones, then the same tones dashed (section 3).

**Requirements:**
- **AWH** curves follow a sequential ramp in time order. **WHAM** windows follow a ramp in their order along ξ, sorted by where each histogram peaks (as the overlap table already sorts them), not in column order.
- The legend becomes a ramp bar labelled with the first and last values. The hover readout names each curve.
- The ramp comes from tokens: Morpheus's `heat-0…3` or the Matrix's `ramp`, interpolated in OKLCH with the Matrix's `shade.ts`.
- Every step is at least 3:1 against the plot ground, in both themes and in the print theme.
- Hovering one curve dims the others (Morpheus's dim, 40 %).

**Tests:**
- `ramp(n)` is monotonic in lightness and meets the contrast rule for every n from 2 to 50, in both themes.
- WHAM's order is the peak order on the fixture (21 windows, which are not in column order).
- AWH's order is the time order.

### R7b AWH convergence

**Requirements:**
- Use every frame the run wrote, not only the 12 that are drawn.
- For each pair of consecutive frames, compute the largest |ΔPMF| and the RMS ΔPMF over the shared grid, and plot both against time. Do the same against the final frame (question 21).
- **Align before taking differences.** A PMF is defined only up to a constant, so frames must be aligned first. The alignment rule is shown and recorded.
- Frames on different grids are refused, with the reason in words.
- Units are kJ/mol.
- No threshold until I choose one, as with WHAM's overlap.
- The computation is a pure function in `lib/awh.ts`, served by one endpoint.

**Tests:**
- Two fixture frames give values computed by hand.
- Frames that differ only by a constant give zero change.
- A mismatched grid is refused.
- Frames are taken in time order (`awhFrames` already sorts numerically; keep it that way).

### R7c The axis unit

**Today (verified):** gmx awh writes "(nm, deg or lambda state)", and the page shows that label (section 3).

**Requirements:**
- Take the unit from the run input. `gmx dump -s` shows the AWH dimension's coordinate provider and, for a pull coordinate, its geometry:
  - distance-like geometries → nm;
  - angle-like geometries → deg;
  - free-energy lambda → lambda state.
- Verify the field names against real `gmx dump` output from GROMACS 2021 and 2025. The fixture `test/fixtures/awh/topol.tpr` is an AWH run input; the existing `dump-head.txt` fixtures have `awh = false`.
- The page and the exports show, for example, "ξ (nm) · pull coordinate 1, distance". The xvg stays unchanged.
- When the unit is unknown, keep gmx's label and say why.
- Store the unit following question 22.

**Tests:** parse dump fixtures for distance, angle, dihedral and lambda, plus an unknown case.

---

## 15. R8: One mouse and keyboard scheme

### Today (verified)
See section 3.

### Requirements
**One gesture scheme.** Write it in the contract, and implement it once: core handlers for structures and charts, and one legend component.

| Surface | Gesture | Action |
|---|---|---|
| structures | click | picks this atom; in the picker, puts it in or takes it out of the group being picked (question 15) |
| structures | Shift-click | the whole residue |
| structures | Alt-click | this atom name in every residue of that name |
| structures | right-drag or Space-drag | pans (replacing Alt-drag in compare) |
| structures | C held + click | centres on the atom's group (T140) |
| charts | hover | shows the readout, on every chart |
| charts | click | marks the nearest point (as in the Matrix) |
| charts | ⌘/Ctrl-click | draws a vertical line; with Shift, a horizontal one (as in the Matrix) |
| charts | arrows, Enter | steps along a curve; marks the point (as in the Matrix) |
| legends and chips | click | shows this one alone; clicking again shows all |
| legends and chips | ⌘/Ctrl-click | shows or hides this one |
| legends and chips | hover | highlights this one and dims the others (question 16) |
| lists | click, ⌘/Ctrl-click, Shift-click | selects one; adds or removes one; selects a range |

**Keys.**
- One registry, extending `lib/shortcuts.ts`:

  | Key | Action |
  |---|---|
  | F | fit |
  | R | reset |
  | B | box |
  | C | centre (held) |
  | H | hydrogens |
  | L | labels |
  | [ and ] | previous and next structure |
  | D | compare |
  | E | export |
  | ? | the shortcut sheet |

  Question 14 settles the overlap with the Matrix's keys.
- Every key can be rebound in settings → keyboard. Conflicts are explained in words; today's `keyProblem`, generalised.
- Keys are ignored while typing; today's `typing`.
- `?` opens a sheet generated from the registry (Morpheus `Dialog` and `Kbd`), grouped by surface, showing the current bindings.

**One style menu.** One set of names across both renderers (question 17). A style that a renderer can't draw (for example, cartoon in compare) is shown disabled, with the reason.

### Tests
- Every key handler reads its key from the registry. A source scan finds no `e.key === '…'` literals outside it.
- Conflicts, table-driven.
- Platform labels (⌘ or Ctrl).
- The sheet lists every registered action.
- e2e:
  - Shift-click selects the residue in both the picker and compare;
  - legend click and ⌘-click behave the same on a result chart and in compare;
  - `?` opens the sheet.

---

## 16. R9: Where things live

### R9a Set-up and results

**Today (verified):**
- Six tabs (inputs, groups, analysis, jobs, batch, cluster), with the open one in the hash.
- (de)Cypher is a dialog.
- There are two drop zones.

**Requirements:**
- **Set-up:** inputs → groups → command, as steps. Each step shows its state: "✓ checked", "3 groups", "2 options changed". Batch is the many-trajectories version of the same steps (question 19).
- **Results:** one jobs list (with R12's filters) and multi-select.
  - The detail pane shows the **result** for one selected job, and **compare** for several.
  - Compare is (de)Cypher as a routed view, `#compare?jobs=<id>,<id>`, sharing the list's selection.
  - Vault sources and file sources stay in the view's state, not in the address.
- **Cluster** stays a tab of its own.
- **Addresses:** `#setup/inputs`, `#setup/groups`, `#setup/command`, `#results[/<job id>]`, `#compare?…` and `#cluster`.
  - The old addresses (`#inputs`, `#groups`, `#analysis`, `#rdf`, `#jobs`, `#batch`) redirect.
  - Back and forward work.
  - IDs are validated.
- **Drops.** A file dropped anywhere is routed by its type:
  - structures, trajectories, run inputs, index files and energy files go to inputs;
  - `.xvg` and `.run.json` files go to compare;
  - a mixed drop is split, and the page says where each file went.

  The routing is one pure function, `routeDrop`.
- **D** opens compare with the current selection.

**Tests:**
- Route parsing and formatting, table-driven, including old addresses and bad IDs.
- `routeDrop`, table-driven.
- e2e:
  - the smoke flow through the new steps;
  - selecting two jobs opens compare;
  - a reload keeps the view;
  - back returns to the previous view.

### R9b One result page layout

**Requirements:**
- **Every result page, including a compare card, follows one order:**
  1. An action bar: compare, send, run again (renamed per question 10), export.
  2. Charts with their stat cards.
  3. The settings line and the groups.
  4. Provenance, collapsed: files, command and log. Paths are shown relative to the allowed folder, with a button that copies the full path.
- **(de)Cypher's three rows of controls are split up:**
  - structure options go into a display menu on each 3D view, the same menu as the picker's;
  - chart options go into the chart's header (colour by, peaks, labels, scale);
  - behaviour (*link groups*) goes next to the mode switch.

**Tests:** for each result kind, the landmarks appear in this order (component test). Screenshots are reviewed against the contract.

### R9c One status component

**Today (verified):** important states are muted captions in the same style as hints. Examples are "no atom groups" in (de)Cypher's sources (`Decypher.tsx`, `parse.ts`) and "68 of 3242 atoms lie outside it" under the groups' 3D view (screenshot).

**Requirements:**
- One `Status` component with four levels (ok, info, warning, error). Each level shows an icon and a word, then the text, with an optional "why?" that opens the long explanation (a HoverCard on hover and focus, or a Dialog).
- It is used in input checks, file rows, sources, jobs, the batch preview and the results' trust flags.
- Long rule paragraphs, such as group matching and the reasons from T156, move behind "why?".
- Phase 0 proposes a level for every existing message (question 20).
- Changes are announced politely. Colour is never the only signal.

**Tests:**
- The table of level → icon, word and token.
- Contrast.
- A scan confirms that status captions built from ✓, ✗ or ⚠ glyphs on muted text are gone from the views.
- axe reports no violations on the main screens (if question 26 allows it).

---

## 17. R10: (de)Cypher for every analysis

### Today (verified)
Compare takes only RDFs: jobs, vault RDFs (T148), records on disk (T149) and dropped files.

### Requirements
- **Any command's result can be a compare source.**
  - Every card has the same layout (R9b): a structure (when the command has groups and a structure), its charts, the groups and a table.
  - Results without a structure (energy, AWH, WHAM) get chart-only cards.
  - *One graph* draws only like quantities (the same y unit and x quantity). Anything else is refused, with the reason.
- **RMSF:**
  - colour the structure by each atom's (or residue's) RMSF with the sequential ramp, and show a scale from min to max in nm;
  - atoms outside the group stay neutral;
  - hovering shows the value;
  - a chart point and its atom highlight each other.
- **H-bonds (selection tool):**
  - draw the donor–hydrogen…acceptor pairs from `<stem>_hbonds.ndx` as dashed lines, at the structure file's positions;
  - a note says these are the pairs found over the trajectory, drawn at the structure's positions;
  - for the legacy tool, say that it gives no pairs;
  - draw all pairs or the nearest N (question 23).
- **Distance and mindist:**
  - draw a dashed line between the groups' centres, labelled with its length in this structure beside gmx's average;
  - the centre is geometric unless masses are known, and the label says which;
  - for distances by pairs, draw one line per pair.
- **RMSD and gyrate:** show the fit group and the measured groups on the structure, with the time series beside it.
- **The HTML export** carries every kind of card.

### Tests
- For each kind, from a fixture to the card model:
  - atoms coloured by RMSF;
  - pairs parsed from the real `test/fixtures/hbond/new/hbond_nvt_hbonds.ndx`;
  - centres computed on `nvt.gro`.
- The *one graph* unit check, table-driven.
- e2e: an RMSF result and an H-bond result in compare, exported, then opened offline.

---

## 18. R11: Graph settings

### Requirements
- **Same scale:** share x, y or both across every card or chart, on screen and in exports. Off by default, with a reset for each chart.
- **Line styles,** per curve:
  - the dash, chosen by name from the Matrix's 10;
  - the width, within Morpheus's 1.5–2 px, plus a heavier print option if you propose one;
  - the shade.

  The "never by hue alone" rule still holds after any manual choice. If two curves become identical, warn.
- **Marks and lines,** with the Matrix's gestures (R8):
  - each mark and line is listed under its chart, with a remove button (×) and a label I can edit;
  - they appear in the export (the Matrix's `pins` and legend) and in the CSV's comment lines.
- **Renaming groups and the reference:**
  - renames are display labels, in compare and in results;
  - the original names show on hover and in provenance;
  - CSV and exports use the labels and list the original names;
  - records, `.ndx`, `.xvg` and anything sent never change.
- **Where these settings live:** question 24.

### Tests
- The shared domain over several series, including empty series and NaN values.
- Dash and width validation, and detection of identical curves.
- Marks map to the Matrix's `pins` and survive the export.
- The label map applies to legends, CSV and exports.
- The original names in records stay untouched (compare the bytes).

---

## 19. R12: A jobs list that scales

### Today (verified)
See section 3.

### Requirements
- **Startup** folds each job's events without keeping its log. It reads the progress from the log's tail and keeps the log's size.
- **The log is read from disk on demand:** `GET /api/jobs/:id/log`, with a tail range and "show all".
- **Search and filters:**
  - filter by command, status, batch, folder and date;
  - free text matches the display name (R3c), the groups and the folder;
  - filters live in the address (`#results?status=failed&command=rdf`).
- **Multi-select,** for compare, archive and diff.
- **Archive:**
  - moves a finished job's ndjson to `<home>/jobs/archive/`, and never deletes it;
  - archived jobs are not loaded at start, and are listed only with the archive filter;
  - unarchiving moves the file back;
  - a running job can't be archived.
- **Measure before and after,** in a temporary home, with 2,000 synthetic jobs carrying 1 MB logs each: start time and memory. Report the machine with the numbers (question 25).

### Tests
- Folding without the log gives today's job fields, apart from `log` (table over fixture ndjsons).
- The log endpoint's ranges.
- Filters and search, as pure functions.
- Archive and unarchive move files exclusively and never overwrite; a collision is refused.
- The measurement is a script, not part of `npm test`.

---

## 20. R13: Run diff

### Requirements
- A result gets **compare with…**: pick another record, from the jobs list, from disk or from a vault record copy. A table then shows only what differs:
  - **options:** the flag, both values and the default;
  - **inputs:** path and SHA-256. The same file moved is the same input;
  - **groups,** matched by atoms, then by names (reuse the kit's `matchGroup` and `sameButReference`), with the atoms added and removed per group, as ranges;
  - the gmx path and version, the runner version and the environment;
  - the frames used (`-b`, `-e`, `-dt`) and the frames analysed.

  The fields that are equal are counted ("N fields equal") and hidden behind a toggle.
- With two jobs selected in the results list, **diff** opens the same table.

### Tests
`diffRecords(a, b)`, table-driven, on the real fixtures (`decypher/rdf_o111_Methionine_H.run.json`, `…_S.run.json` and `formats/run-v1.run.json`):
- equal records → no differences;
- an input moved, with the same SHA-256 → equal;
- one option changed;
- a group with one atom added;
- a v1 record against the new format.

---

## 21. R14: gmx-cypher's own space in the vault

### Today (verified)
- gmx-cypher's only write into the vault is a copy into `<project>/_inbox/` (`server/send.ts`).
- It reads the vault through a read-only backend (T66).
- (de)Cypher finds a vault RDF's groups only among this runner's own jobs, by SHA-256 (T148). So an RDF written by another runner shows no atoms (T156).

### R14a The space, and record copies

**Requirements:**
- A space outside every project folder (section 4), for example `<vault>/gmx-cypher/` (question 4). Its name doesn't start with `.`, so it is visible and gets backed up with the vault, and it never ends in `--<id>`. It holds:
  - `space.json`: the format, its version, and what wrote it;
  - `records/<sha256>.run.json`: when a result is sent, the record of the job that wrote it, named by the sent file's SHA-256 (the Matrix keeps files byte for byte, T148);
  - `projects/<project id>/views/<name>.json`: saved compare views (R11);
  - a short `README.md` that says what the folder is, and that the Matrix ignores it.
- **Writing:** files are created exclusively, or written by temp + rename. Nothing is deleted. Nothing goes inside `.matrix/` or a project folder (except `_inbox`, as today).
- **Before writing anything,** prove with the Matrix's own code, on a vault it made (`e2e/make-vault.ts`), that the space changes nothing: the `ProjectService` load report (untracked, missing, warnings) and `Vault.open` are identical before and after (using the read-only backend).
- **Privacy:** records hold this machine's absolute paths and environment, and a vault may be copied or put in Git. Handle them as decided in question 4.

### R14b Connect to a project

**Requirements:**
- In settings, choose the vault (as today) and one project (new; question 5).
- The connected project names jobs (R3c), is the default for sends, and owns the saved views.

### R14c Compare reads the record copies

**Requirements:** compare finds a vault RDF's groups through `records/<sha256>.run.json` even when this runner didn't write it. This fixes T156's case.

### The hand-over
- After a send, the page says what happens next in the Matrix (today's steps) and links to the project.
- Anything that would need the Matrix to change goes into the report's "For the Matrix" list. That includes a route to a cell, and the Matrix reading the record copies to show provenance with an "open in gmx-cypher" link.

### Tests
- Path builders.
- Writes are exclusive.
- **The Matrix is unchanged:** a listing of the vault before and after, and the `ProjectService` report through the Matrix's code.
- Compare resolves groups from a record copy for a vault RDF whose job is unknown. Extend the e2e test "two RDFs of the vault, whose runs are unknown" in `e2e/decypher.spec.ts`.
- The privacy rewrite, table-driven.

---

## 22. R15: From the cluster tab to analysis

### Today (verified)
R10d was never built. It waits for a `qq jobs -e` sample (T136).

### Requirements
Build this **only once the sample is in**:
- When a watched job goes from running to finished between two refreshes, the cluster tab offers "run <recipe or batch> on <input folder>".
- One click opens set-up (batch) with that filled in. Nothing runs until I press run.
- The input folder comes only from `qq jobs -e`. Never guess it.

Without the sample, don't build this; leave it in the backlog.

### Tests
- Detecting the transition between two parsed samples.
- The offered folder is inside the allowed folders, or the offer is refused.
- Nothing runs automatically.

---

## 23. R16: `gmx density` and `gmx order`

Each command is added the way batch 2's R9 commands were:
- a definition, with options read from the installed gmx's `-h`;
- groups where needed;
- a result view built on the core;
- the Matrix contract (the type taken from the header) verified on real output.

### `gmx density`
- Options: the axis, the slices, the density type, centring and symmetrising.
  - The density types are mass, number, charge and electron.
  - Electron density needs an electrons file, so offer it only when one is given.
- Several groups give one curve each.
- Units are shown as gmx writes them.

### `gmx order`
- Carbon groups in tail order: from an index file with one group per carbon, or built from a selection (question 27).
- The axis.
- Outputs S_CD per carbon (and others, if chosen), which the Matrix reads as its Order parameters type (drawn as points).
- In Phase 0, read `gmx order -h` to find which lipid models its method suits, and say so in the result if it matters. My recollection is that its help text describes united-atom tails; don't trust that, check it.

### Tests
- Argument lists, as golden tests.
- The fake gmx answers with the real outputs from my samples.
- A `detectAna` contract test on each output.
- Real-gmx tests when `GMX` is set.

---

## 24. Testing (all requests)

- **Vitest, in Node.** Pure functions with table-driven tests.
- **Drift tests** (R3a, R4, R5, R8). Each one lands with the item that makes it pass. The contract lists them.
- **Golden tests.** Every result's numbers stay unchanged through R5: the same series in, the same series out.
- **Contract tests with the Matrix's own code:**
  - the types of the new outputs (R16);
  - the vault left untouched by the space (R14);
  - the export pipeline (R6).
- **Real text only.** The fakes answer with real outputs. Never invent a format.
- **Playwright.** Update the smoke and compare flows for the new layout. Add:
  - offline exports;
  - compare for RMSF and H-bonds;
  - the shortcut sheet;
  - routes.

  WebGL runs through SwiftShader.
- **Real-tool tests** run when `GMX` is set, and are listed as run or not run.
- **The `matrix/` check** (pinned and unchanged) runs in every `npm test`.

---

## 25. Documentation

`runner/README.md`:
- a link to the design contract;
- set-up and results;
- compare;
- exports and their settings;
- keys (point to `?`, or generate the list from the registry);
- the vault space: what it holds, and what it never touches;
- the jobs archive;
- the SIGHUP behaviour, and how to keep the runner going;
- the new commands.

---

## 26. Acceptance criteria

- **A. Coherence.**
  - The contract exists and is approved, and the drift tests pass.
  - The UI shows no ticket references, and each word has one meaning.
  - The reference is drawn in ink everywhere, and only errors use `destructive`.
- **B. Core.**
  - There is one copy each of tones, dashes, ticks, ranges and structure parsing.
  - Every chart has a hover readout.
  - No two curves are identical, however many are drawn.
  - The numbers are unchanged (golden tests).
- **C. Exports.**
  - Every chart exports to SVG, PDF, PNG, CSV (at full precision, with provenance) and HTML.
  - Export settings exist.
  - Marks and labels are carried into exports.
- **D. Science.**
  - AWH and WHAM ramps follow the data's order.
  - AWH convergence states its alignment.
  - The AWH unit comes from the run input, or the page gives a reason.
- **E. Compare.**
  - Compare accepts any result, with RMSF, H-bond, distance and RMSD/gyrate cards.
  - Same scale and line styles work.
  - Groups can be renamed, and records stay untouched.
- **F. Layout and interaction.**
  - Set-up and results; `#compare`; the old addresses still work; drops are routed by type.
  - One result layout and one status component.
  - One gesture scheme; every key rebindable; the `?` sheet.
- **G. Runner.**
  - SIGHUP behaves as decided.
  - The record is written at the start and completed atomically.
  - The jobs list starts without logs in memory, and has search, filters and archive.
  - Run diff works.
- **H. Vault.**
  - The space sits outside the project folders, and the Matrix is unaffected (proved with the Matrix's code).
  - Record copies exist, and a project can be connected.
  - The Matrix requests are listed.
- **I. Quality.**
  - Lint, build, Vitest and Playwright pass, and `matrix/` is unchanged.
  - No console errors.
  - Light and dark, at 1024 px, with the contrast rules met.
  - Lines and tests are reported for each item.

---

## 27. Commits

- One commit per roadmap item (R2a, R2b, …), with its ID first, for example `R2a: keep jobs and their records when the terminal closes`. Plus one commit each for the Phase 0 documents and the final report.
- Every commit passes lint, build and tests on its own, and leaves `matrix/` unchanged.
- Stage files by name. Never commit my real data, cluster samples with personal details (ask before committing any), generated files or scratch files.
- Don't amend, rebase or force-push, and don't push unless I ask.

---

## 28. Final report: `runner/docs/batch-3-report.md`

1. **Summary table:** item → status → commit → code lines added/removed → test lines added/removed → tests passing → decisions.
2. **Per request:** what changed and why, behaviour before and after, and known limitations.
3. **Section 3, completed:** every claim confirmed or corrected.
4. **The design contract** as approved, and what changed in it during the batch.
5. **Screenshots** (small PNGs in `runner/docs/img/batch-3/`), light and dark:
   - the groups card;
   - a result page;
   - the jobs list with filters;
   - compare, with each result and with one graph;
   - RMSF and H-bond cards;
   - the status levels;
   - the shortcut sheet;
   - the AWH ramp and its convergence trace;
   - the WHAM ramp;
   - an exported SVG, PDF and CSV;
   - a run diff.
6. **Tests:** counts before and after, the new tests, which ran with a real `gmx`, and the manual QA checklist with passed, failed or not run for each item.
7. **Measurements:** jobs startup time and memory before and after (R12), and bundle sizes.
8. **For the Matrix:** requests for a Matrix batch (a route to a cell, reading the record copies, …), each with its reason.
9. **For Morpheus:** proposed changes (the role layer, a status component, ramp tokens, Table, Combobox).
10. **Review:** what the fresh-context review found, and what was done about each finding.
11. **Decisions** (a link to `decisions.md`), the roadmap's status, and the updated backlog.
12. **History:** `git log --oneline` for the batch, and `git diff --stat` from the baseline commit, showing that `matrix/` is unchanged.
