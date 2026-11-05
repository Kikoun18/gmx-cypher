# SymBuilder mock-up

The design reference for batch 4 (`docs/batch-4.md`, section 5.1). Ten boards of a Design artifact, made with Morpheus's web components (`<x-import component-from-global-scope="Morpheus.…">`) and a small script per board (`class Component extends DCLogic`, `renderVals()`). They don't run outside the artifact: read the markup for layout and the script for behaviour.

| File | Board | In gmx-cypher |
|---|---|---|
| `Main.dc.html` | Build: the stack in stages, the palette, a tile's inspector | symbuilder · build |
| `Run.dc.html` | Run: systems, names, repeats, stages, failures, preview | symbuilder · systems |
| `Dashboard.dc.html` | running now, pull report, walker report | symbuilder · progress, and a line on home |
| `Summary.dc.html` | build summary, termini, PMF numbers | symbuilder · summary |
| `Files.dc.html` | files per saccharide and sequence | symbuilder · files |
| `MDP.dc.html` | inputs/ files, templates, per-method assignment | symbuilder · mdp |
| `Cluster.dc.html` | qq profiles and the script preview | cluster tab |
| `Library.dc.html` | python scripts as tiles | backlog (question 7) |
| `Warnings.dc.html` | grompp warnings, open or ignored | status component and the build record |
| `Settings.dc.html` | project folders, force field, python, methods, charges, errors | settings dialog and build plans |

- Every number, system and file in it is sample data. Drops, uploads and *duplicate* are not wired.
- Its text is not gmx-cypher's: 21 phrases break `src/core/contract.ts`, and *recipe*, *batch* and *settings* mean other things in gmx-cypher. Reword everything through the contract.
- `canvas.json` is the board layout of the artifact.
