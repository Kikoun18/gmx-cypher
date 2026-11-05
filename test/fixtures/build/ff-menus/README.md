# pdb2gmx's menus from your force field (T230)

From your `ff/charmm36s-jul2022-prosECCo75.ff/` (sent 2026-11-05): each `.n.tdb` and `.c.tdb` file reduced to its
`[ headers ]` (block names and their keywords, no parameters), and `watermodels.dat` as it is. pdb2gmx builds its
termini menus from the block names, files in name order (GROMACS's `filter_ter`), and its water menu from
`watermodels.dat`. `test/build-pdb2gmx.test.ts` checks the menus against those your notebook's pdb2gmx printed for HIS.
The rest of the force field is not in the repository.
