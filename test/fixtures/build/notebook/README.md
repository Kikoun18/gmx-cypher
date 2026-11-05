# Real output from the notebook

`solution_builder_seq_5_4.ipynb`'s saved cell output (GROMACS 2025.4-PLUMED_spack, `gmx_mpi`, 2026-09-25), copied as
it is with two changes: the terminal colour codes are removed, and the cluster storage path and user name are replaced
by `/storage/brno/you`. Fakes and tests answer with these texts; none is invented.

- `grompp-walker-fatal.txt`: walker 8's grompp (rrrrrrrr, 3.0 nm), from its seed line to its fatal error.
- `grompp-awh-fatal.txt`: hhhhhhhh's AWH grompp fatal error, as the notebook's summary quotes it.
- `tools/<tool>.txt`: each tool's output in the notebook's build of hmr+fast+6/o111/hhhhhhhh (2026-09-25), the lines
  the notebook added between them (its stage banners, path echoes, its progress bar, "Waiting for…") left out; the
  `/cvmfs/…` software path is `/opt/gromacs-2025.4`, the gromologist user and host `you` and `host`. The fake gmx
  (`test/fake-gmx-build.mjs`) and the fake python (`test/fake-python.mjs`) print them.
- `tools/trjconv-dump.txt`, `tools/grompp-walker.txt`: walker 1 of hhhhhhhh, its start frame and its grompp.
- Not in the notebook, so not here: `mdrun -v`'s own progress lines,
  `insert-molecules` (glucose), PyMOL's own output, `gmx awh`'s output names (Phase 0 §6, samples 5–8).
