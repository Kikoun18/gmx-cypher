#!/usr/bin/env python3
"""Hydrogen-mass repartitioning with gromologist (gmx-cypher SymBuilder, R5b).

    python hmr.py system.top system_hmr.top POSRES_FC_BB=400 POSRES_FC_SC=40 DIHRES_FC=4

As the notebook's run_gromologist(): the topology read with its defines, hydrogen masses repartitioned, unused
sections cleared, saved split, which writes system_hmr.top and, beside it, Protein.itp and CARB.itp. gmx-cypher keeps
those in the system's folder (the notebook copied them into ff/, shared between systems) and rewrites the system's
topology to include them.
"""
import sys


def number(text):
    value = float(text)
    return int(value) if value.is_integer() and "." not in text else value


def main(argv):
    if len(argv) < 2:
        sys.exit("usage: hmr.py system.top system_hmr.top NAME=VALUE ...")
    top, out, *defines = argv
    define = {}
    for d in defines:
        name, sep, value = d.partition("=")
        if not sep or not name.isidentifier():
            sys.exit("a define is NAME=VALUE: " + repr(d))
        define[name] = number(value)
    from gromologist import Top

    t = Top(top, define=define)
    t.hydrogen_mass_repartitioning()
    t.clear_sections()
    t.save_top(out, split=True)
    print(out + " written, with Protein.itp and CARB.itp beside it")


if __name__ == "__main__":
    main(sys.argv[1:])
