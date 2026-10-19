# gmx-cypher — design contract

**Approved 2026-10-19** (batch 3, decisions T157–T169). This is the one page later decisions point to. The machine-checkable parts live in `src/core/contract.ts`; where a table here and the module disagree, the module is right and this page is out of date.

Morpheus is the brief; the Matrix is the neighbour. Where gmx-cypher and the Matrix show the same thing (a chart, an export, a key, a word), gmx-cypher matches the Matrix unless this page says otherwise.

## 1. Words

| Term | Means only | Never used for |
|---|---|---|
| **job** | one gmx execution by gmx-cypher | a replicate; what a job produced |
| **record** | a job's `.run.json` | a job; a vault cell |
| **run** | the Matrix's replicate slot (a, b, …). As a verb, *run* still starts a job | a job (*run again* → *open in set-up*,) |
| **run input** | the `.tpr` (GROMACS's own term; always with *input*) | a run |
| **result** | what a job produced (an RDF, a profile, …), and its page | a job (*each job* → *each result*) |
| **analysis** | the Matrix's type of a curve set (RDF, PMF, …), only | a tab or step (*analysis* tab → *command* step) |
| **command** | a gmx tool gmx-cypher runs (`gmx rdf`), with its options | a result |
| **first shell** / **maximum** | the two peak rules, always named | — ("peak" never stands alone) |
| **compare** | the view of several results side by side, `#compare` | — ((de)Cypher stays the name of the HTML export,) |
| **send** → **sent** | copy a result into the vault's inbox | — |
| **archive** → **archived** | move a finished job's log aside; never delete | delete, hide |
| **on disk** | records found in a folder | the vault |

## 2. Colour roles

| Role | Token | Light | Dark | Used for | Never used for |
|---|---|---|---|---|---|
| UI state | `state` (role layer) = ink | `#201e1d` | `#f0eeec` | the selected toggle, the primary action, the focus ring, the active tab | data |
| Error | `destructive` (role layer) | `#8f1d1d` | `#fd2a6d` | errors, *failed*, armed destructive actions | anything else |
| Group | the eight tones, `<tone>-strong` for lines and text | coral `#c62410` … stone `#5c5550` | coral `#ff6a4d` … stone `#b0a79f` | a group, from the picker → record → result → compare → export | UI state |
| Reference | ink, as an **outline** (chip border, card border, 3D ring) | `#201e1d` | `#f0eeec` | the reference everywhere | — |
| Source | a numbered badge and a dash; hue only with *colour by result* | ink badge | ink badge | the sources in compare | — |
| Ordered series | `ramp-0…3` (role layer), interpolated in OKLCH | `#a5700d #a83903 #891151 #3f1a69` | `#a57710 #e97c48 #fd9cba #e3d6fe` | AWH frames (time), WHAM windows (ξ), RMSF on atoms | categories |
| Neutral | `atom-*`, `bond`, `edge` (from the kit's `NEUTRAL`) | kit values | kit values | atoms and bonds outside every group | — |
| Status | ink icon and word; error in `destructive` | — | — | the four status levels | group colours |

- **UI state vs reference.** Both are ink; they differ by form: state is an ink **fill** (selected toggle, primary button), the reference is an ink **outline** (chip, card border, ring). Nothing else is outlined in ink.
- **Where deviations live:** `src/roles.json`, a small layer over a verbatim copy of Morpheus's `tokens.json`, generated into CSS by `scripts/tokens.ts`.
- **Stored tones stay** in records; the reference's stored tone is simply not drawn.
- **Two curves never differ by hue alone.** With more than eight groups a tone never repeats with the same dash; the dashes are the Matrix's 10, by name.
- Contrast: text ≥ 4.5:1; curves, atoms and focus rings ≥ 3:1, in both themes and in the print export.

## 2a. Type

- **mononoki** for all text, numbers and controls (400 and 700).
- **Archivo 800** for the app's name, page titles and card titles, as the Matrix (T160). Nowhere else: not for labels, numbers, buttons or chart text.
- Labels may be upper-case letter-spaced; **data names and units keep their case** ("r (nm)", "water_O", "kJ/mol").

## 3. Gestures and keys

| Surface | Gesture | Action |
|---|---|---|
| structures | click | this atom; in the picker, in or out of the group being picked |
| structures | Shift-click | the whole residue |
| structures | Alt-click (⌥) | this atom name in every residue of that name |
| structures | drag · right-drag or Space-drag · scroll | rotate · pan · zoom |
| structures | C held + click | centre on the atom's group |
| charts | hover | the readout, highest values first, on every chart |
| charts | click · ⌘/Ctrl-click · ⌘/Ctrl-Shift-click | mark the nearest point · vertical line · horizontal line (as the Matrix) |
| charts | ← → · ↑ ↓ · Enter | step along a curve · next curve · mark (as the Matrix) |
| legends and chips | click · ⌘/Ctrl-click · hover | this one alone (again: all) · show or hide this one · highlight it, dim the rest |
| lists | click · ⌘/Ctrl-click · Shift-click | one · add or remove · a range |

| Key | Action | Where | Rebindable |
|---|---|---|---|
| D | compare the selected results | anywhere | yes |
| E | export the focused chart, in the default format | anywhere | yes |
| ? | the shortcut sheet | anywhere | yes |
| F · R | fit · reset | structures | yes |
| B | the box | structures | yes |
| C (held) | click centres on a group | structures | yes |
| H · L | hydrogens · labels | structures | yes |
| [ · ] | previous · next structure | compare | yes |
| Esc | back / close | everywhere | no |

- Keys are ignored while typing. ⌘ on macOS where other platforms use Ctrl, shown with `Kbd` everywhere.
- Differences from the Matrix, on purpose: C (held) centres here, where the Matrix's C is compare; D is compare here.

## 4. Status levels

| Level | Icon | Word | Token | Used when | Examples |
|---|---|---|---|---|---|
| ok | circle-check | ok / done | `foreground` | a check passed | "the inputs agree · ≈51 frames"; "gmx counts the same" |
| info | circle-info | note | `foreground` | worth knowing; nothing to do | "68 of 3242 atoms lie outside the box, as recorded"; "the first 400 records only" |
| warning | triangle-alert | check | `foreground` | a result may mislead; look before trusting it | "no atom groups: no record of the job that wrote this file"; "interrupted" |
| error | circle-x | error / failed | `destructive` | nothing ran or nothing can be read; says how to fix it | "no working gmx: set its path in settings → gmx" |

Icon, word, then the text; an optional *why?* opens the long explanation (HoverCard on hover and focus, or a Dialog). Announced with `aria-live="polite"`. Colour is never the only signal.

## 5. The order of a result page

1. **Action bar:** compare (primary) · send · open in set-up · export ▾.
2. **Charts** with their stat cards (first shell and maximum, both named).
3. **The settings line and the groups** (reference outlined in ink).
4. **Provenance, collapsed:** files, command, log. Paths relative to the allowed folder, with a button that copies the full path.

A compare card follows the same order.

## 6. Writing

1. Name things by what you understand, not by how the code is built.
2. An action keeps its name through the flow: *send* → "sent", *archive* → "archived".
3. Errors say what happened and how to fix it; never vague, never sorry.
4. An empty screen invites the next action.
5. Nothing on the page names a ticket, a question or a decision.

## 7. Enforcement

| Rule | Checked by |
|---|---|
| No ticket, question or decision numbers in the UI (§1, §6.5) | `contract.test.ts`: TypeScript scanner over UI strings (R3a) |
| Phrases never shown ("each job", "peak" alone, "run again") | the same scanner, reading the list from `contract.ts` (R3b) |
| Every role has a token; no UI-state token is a data tone; `destructive` apart from every tone, `ring` and `primary` | `tokens.test.ts`, `contrast.test.ts` (R4a) |
| No hex outside `tokens.json` and the role layer | source scan (R4b) |
| `destructive` classes only in the status component and destructive buttons | source scan (R4a) |
| The reference drawn in ink | Playwright, computed style (R4a) |
| One copy of tones, dashes, ticks, ranges, structure parsing | `core.test.ts`, TypeScript scanner (R5a, R5b) |
| No two curves identical, 1 to 14 curves | `core.test.ts` (R5) |
| Ramps monotonic and ≥ 3:1, n = 2…50, both themes | `core.test.ts` (R7a) |
| Every key handler reads the registry; no `e.key === '…'` literals elsewhere | source scan (R8b) |
| The sheet lists every registered action | component test (R8b) |
| Every status level has an icon and a word; no ✓/✗/⚠ captions in views | `contract.test.ts`, source scan (R9c) |
| The result page order | component test per result kind (R9b) |
| Writing rules 1–4 | reviewed by hand |
