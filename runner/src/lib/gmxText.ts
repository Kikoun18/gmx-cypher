// Readers of the text GROMACS prints. Each is pure and tested on real output (test/fixtures/).

/** `GROMACS version:    2025.4-PLUMED_spack` from `gmx --version`, else the banner's version, else null. */
export function parseVersion(text: string): string | null {
  const line = /^GROMACS version:\s+(\S+)/m.exec(text);
  if (line) return line[1];
  const banner = /:-\) GROMACS - .+?, (\S+) \(-:/.exec(text);
  return banner ? banner[1] : null;
}
