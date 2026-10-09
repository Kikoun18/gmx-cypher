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
- `nvt/rerun.edr` — the energy file of `gmx mdrun -rerun nvt.xtc` on your test system (GROMACS 2025.4): 6 terms, 21 frames, 0–20 ps (R4).
- `gmx-2023.3/` — GROMACS 2023.3 (Ubuntu): `version.txt`, `rdf-h.txt`; `energy-h.txt`, and `energy-menu.txt` and
  `energy-stats.txt` from the same two runs of `gmx energy` on `nvt/rerun.edr` (the menu is on stderr, the statistics on stdout).

The only edit: the scratch folder these ran in is written as `/home/user/sim/na2so4/nvt`, and the
GROMACS install as `/opt/gromacs-2025.4`, in the header and banner lines.
