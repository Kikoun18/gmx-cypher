# gmx-cypher

A local tool that runs GROMACS analyses on your trajectories and hands the results to the Matrix. It lives in
[`runner/`](runner/README.md): start there.

`matrix/` is a git submodule: the Matrix ([Kikoun18/the-matrix](https://github.com/Kikoun18/the-matrix)), the website
whose vaults gmx-cypher reads and sends results into. This repository holds none of its code, only a pin to one commit
of it, which gmx-cypher's tests check. After cloning without `--recurse-submodules`, run `git submodule update --init`.
The Matrix, its hosting (`deploy/`) and its documentation are in its own repository.
