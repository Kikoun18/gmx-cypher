# Example files (feature batch 3)

Sent by a colleague as examples of data the app should load, recognise and compute on
(`docs/feature-batch-3.md`, section 3). Committed unchanged (F81); the macOS metadata in the
original archive (`__MACOSX/`, `._*`) is not.

| File | What it is |
|---|---|
| `translocation_free_energy.dat` | free-energy profile across a membrane (x is a signed coordinate), `@ xlabel` / `@ ylabel` |
| `membrane_thickness.dat` | membrane thickness against radial distance; 12 of 86 y values are `nan` |
| `order_POPE.xvg` | lipid order parameters, 32 carbons × 3 columns, a `# Atom …:` comment before each row |
| `phosphorus.xvg` | `gmx density` profile of phosphorus along z |
| `temperature.xvg` | `gmx energy`, 25,001 rows, 3 temperature terms |
| `pressure.xvg` | `gmx energy`, 25,001 rows, pressure |
| `functions.py` | three matrix functions: `calc_mean`, `calc_barrier`, `calc_peak_distance` |

Reference values (CPython and Pyodide agree): section 3 of the spec.
