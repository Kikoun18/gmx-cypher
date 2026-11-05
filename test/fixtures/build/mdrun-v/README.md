# mdrun -v, as your terminal got it (sample 6, T232)

`minim.txt`: `gmx_mpi mdrun -deffnm 4.minim -v` on hmr+fast+6/o111/aaaaaaaa, GROMACS 2025.4-PLUMED_spack on one GPU
(sent 2026-11-05). Every byte as mdrun wrote it, the `\r` of each rejected step included (121 of them), except three
header lines: the executable and data prefix are `/opt/gromacs-2025.4`, and the working folder's start is
`/storage/brno/you`, as in `../notebook/`. Your notebook keeps none of these lines (its run_live draws its own bar
from them), so they come from here. nvt and npt's `step N, remaining wall clock time: S s` lines are read by your
notebook's own patterns; no sample of them is here.
