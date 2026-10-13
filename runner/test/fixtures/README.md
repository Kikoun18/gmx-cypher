# Test fixtures: real GROMACS text only

Nothing here is invented. Each file is what GROMACS wrote or printed.

- `nvt/` — your test system, byte for byte: `nvt.tpr` (written by GROMACS 2025.1), `nvt.gro`, `nvt.xtc`
  (21 frames, 0–20 ps, 3,242 atoms). `index.ndx` is GROMACS 2025.4's default index for it
  (`echo q | gmx make_ndx -f nvt.tpr -o index.ndx`), made here because the `index.ndx` you sent belongs to
  another, 33,584-atom system.
- `gmx-2025.4/` — GROMACS 2025.4 (built here from Ubuntu's copy of the source, CPU only, no MPI) run on
  `nvt/`. `version.txt` is your own `gmx_mpi --version` on MetaCentrum.
  - `rdf-h.txt`: `gmx rdf -h` (stdout; identical to 2023.3's and to the text you pasted);
  - `rdf-run.stderr`, `rdf_nvt.xvg`, `rdf_nvt_cn.xvg`: `gmx rdf -f nvt.xtc -s nvt.tpr -n groups.ndx -ref 'group 0' -sel 'group 1' 'group 2' -o rdf/rdf_nvt.xvg -cn rdf/rdf_nvt_cn.xvg` with groups `sulfur` (S1), `water_O` (OW1), `sodium` (Na);
  - `rdf-badgroup.stderr`: the same with `-sel 'group 7'`;
  - `rdf-backup.stderr`: the run repeated onto an existing `-o` file ("Back Off!");
  - `check.stderr`: `gmx check -f nvt.xtc`;
  - `dump-head.txt`: the first 250 lines of `gmx dump -s nvt.tpr`;
  - `sizes.xvg`: `gmx select -s nvt.tpr -n groups.ndx -select 'group 0' 'group 1' 'group 2' -os sizes.xvg`;
  - `select-beyond.stderr`: `gmx select` on an index group with atom 9999.
  - `energy-h.txt`: `gmx energy -h`;
  - `energy-menu.txt`: `gmx energy -f rerun.edr -o e.xvg` with an empty stdin: the term menu, then "No energy terms selected" (R4);
  - `energy-stats.txt`, `energy-potential.xvg`: the same with the terms `1 6` and `0` on stdin: its output and the file it wrote.
  - `energy-stats-short.txt`: the statistics block of `gmx energy -b 18 -sum` with the same terms: 3 frames, where gmx prints `--` for what it can't estimate.
- `awh/` — a small real AWH run made here with GROMACS 2025.4 for R5 (your AWH run is still to come): 221 SPC waters
  (`gmx solvate -cs spc216.gro -box 2 2 2`, OPLS-AA), one distance coordinate between two water oxygens with AWH
  over 0.30–0.80 nm, 20 ps, AWH data every 2 ps. `awh.edr` and `topol.tpr` are its files; `out/` holds the 11 files
  `gmx awh -f awh.edr -s topol.tpr -o awh/awh.xvg` wrote (`awh_t0.xvg` … `awh_t20.xvg`). The scratch folder is
  written as `/home/user/sim/awh-water`. `gmx-2025.4/awh-h.txt`, `gmx-2023.3/awh-h.txt` and `gmx-2025.4/awh-run.stderr`
  go with it.
- `wham/` — a small real umbrella set made here with GROMACS 2025.4 for R6 (your umbrella set is still to come): the
  same water box, 9 windows along the same distance (0.30–0.70 nm, k 2000 kJ/mol/nm², 20 ps each, 300 K), each
  `winNN/` with `umbrella.tpr` and the `umbrella_pullx.xvg` and `umbrella_pullf.xvg` mdrun wrote. `tpr-files.dat` and
  `pullx-files.dat` list them; `out/` holds what `gmx wham -it tpr-files.dat -ix pullx-files.dat -b 2 -temp 300
  -nBootstrap 10 -bs-seed 1` wrote and printed (`profile.xvg`, `histo.xvg`, `bsres.xvg`, `bsprof.xvg`). `dump-head.txt`
  is the first 250 lines of `gmx dump -s win00/umbrella.tpr`. The scratch folder is written as `/home/user/sim/wham-water`.
  `gmx-2025.4/wham-h.txt` and `gmx-2023.3/wham-h.txt` go with it.
- `distance/` — `gmx distance` (2025.4) on `nvt/` with `groups.ndx` (sulfur 5–30:5, sodium 31–36, water_O 43–63:4):
  `com/` from `-select 'com of group 0 plus com of group 1' 'com of group 0 plus com of group 2'`, `pairs/` from
  `-select 'group 0 merge group 1' 'group 0 merge group 2'`, each with `-oav`, `-oall` and `-oh` (`-len 0.5 -binw 0.05`)
  and what gmx printed. `gmx-2025.4/distance-h.txt` and `gmx-2023.3/distance-h.txt` go with them (R7).
- `hbond/` — the H-bond tools (2025.4) on `nvt/` with `hb.ndx` (sulfate 1–30, water 43–3242) (R8). `new/`: `gmx hbond
  -r 'group 0' -t 'group 1' -o new/hbond_nvt_hbonds.ndx -num new/hbond_nvt.xvg -dist … -ang … -dan …`, its files and what
  it printed. `legacy/`: `gmx hbond-legacy -num legacy/hbond_nvt.xvg -dist legacy/hbond_nvt_dist.xvg` with `0 1` on
  stdin, and what it printed; `hbond_nvt_ang.xvg` from a run with `-ang -nomerge`; `ang.stderr` is its refusal of `-ang`
  with merging on. `gmx-2025.4/hbond-h.txt`, `hbond-legacy-h.txt` and `help-commands.txt` go with them;
  `gmx-2023.3/hbond-h.txt` (the legacy tool under the old name), `help-commands.txt` and `hbond-legacy.stderr` (no such
  command) show the tools of GROMACS before 2024.
- `r9/` — the R9 commands (2025.4) on `nvt/` with `groups.ndx` (sulfate 1–30, sodium 31–42, water 43–3242), each
  folder with its outputs and what gmx printed: `rms/` (`-ng 2`, `0 0 1` on stdin: fit on sulfate, sulfate and sodium
  measured), `rmsf/` and `rmsf-res/` (`0` on stdin; `-res`), `gyrate/` (`-sel 'group 0'`), `gyrate-legacy/` (`0` on
  stdin), `gyrate-one/` (both tools on one sulfate ion, `one.ndx`), `mindist/` (`-ng 2 -on …`, `0 1 2` on stdin).
  `gmx-2025.4/{rms,rmsf,gyrate,gyrate-legacy,mindist}-h.txt` and `gmx-2023.3/{rms,rmsf,gyrate,mindist}-h.txt` and
  `gyrate-legacy.stderr` go with them.
- `nvt/rerun.edr` — the energy file of `gmx mdrun -rerun nvt.xtc` on your test system (GROMACS 2025.4): 6 terms, 21 frames, 0–20 ps (R4).
- `gmx-2023.3/` — GROMACS 2023.3 (Ubuntu): `version.txt`, `rdf-h.txt`; `energy-h.txt`, and `energy-menu.txt` and
  `energy-stats.txt` from the same two runs of `gmx energy` on `nvt/rerun.edr` (the menu is on stderr, the statistics on stdout).

The only edit: the scratch folder these ran in is written as `/home/user/sim/na2so4/nvt`, and the
GROMACS install as `/opt/gromacs-2025.4`, in the header and banner lines.
- `decypher/` — your two RDF runs from MetaCentrum, as you sent them with the RDF Explorer design (gmx-cypher 0.1.0,
  GROMACS 2025.4-PLUMED_spack): `rdf_o111_Methionine_H` and `rdf_o111_Methionine_S` (`.xvg`, `.ndx`, `.run.json`), and
  `mmmmmmmm.gro` (the peptide alone, 139 atoms). `9.multiwalker.gro` is your 33,513-atom structure cut to its first 279
  atoms (the 249 atoms of sugars and peptide, then 10 waters), its atom count line set to 279 and its box line kept:
  the groups reach atom 246, so they read the same atoms as in the whole file.
