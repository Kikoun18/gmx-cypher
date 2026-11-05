#!/usr/bin/env python3
"""A peptide from its sequence, with PyMOL (gmx-cypher SymBuilder, R5b).

    python build_peptide.py SEQUENCE out.pdb picture.png

As the notebook's build_peptide(): PyMOL's fab, the C-terminal oxygen attached and named OXT, hydrogens added, atoms
sorted, saved as out.pdb; then an 800 x 600 picture of it as sticks. It writes those two files and nothing else, and
gmx-cypher runs it only where neither exists.
"""
import sys


def main(argv):
    if len(argv) != 3:
        sys.exit("usage: build_peptide.py SEQUENCE out.pdb picture.png")
    sequence, pdb, png = argv
    if not sequence.isalpha():
        sys.exit("a sequence is one-letter amino-acid codes: " + repr(sequence))
    sequence = sequence.upper()
    import pymol
    from pymol import cmd

    pymol.finish_launching(["pymol", "-qc"])
    obj = "pep_" + sequence  # never a reserved word
    cmd.delete("all")
    cmd.fab(sequence, obj)
    if cmd.count_atoms(obj) == 0:
        sys.exit("PyMOL's fab made no atoms for " + repr(sequence))
    cmd.edit(f"last ({obj} and name C)")
    cmd.attach("O", 2, 1)
    cmd.unpick()
    cmd.alter(f"{obj} and elem O and neighbor (last ({obj} and name C)) and not name O", 'name="OXT"')
    cmd.h_add(obj)
    cmd.sort()
    cmd.save(pdb, obj)
    cmd.hide("everything")
    cmd.show("sticks")
    cmd.orient()
    cmd.ray(800, 600)
    cmd.png(png)
    cmd.delete("all")
    print("built " + sequence + ": " + pdb + ", " + png)


if __name__ == "__main__":
    main(sys.argv[1:])
