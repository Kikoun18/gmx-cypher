// Provenance from a GROMACS xvg header (R1a). Reads only the leading `#`/`@` block;
// every field is the text as written (the date has no time zone), or null if absent.

export interface GmxHeader {
  version: string | null;
  tool: string | null;
  command: string | null;
  workdir: string | null;
  created: string | null;
  executable: string | null;
}

/** null when the file has no `:-) GROMACS - gmx <tool>, <version> (-:` line. */
export function parseGmxHeader(text: string): GmxHeader | null {
  const lines: string[] = [];
  for (const l of text.split('\n')) {
    const t = l.replace(/\r$/, '');
    if (!t.startsWith('#') && !t.startsWith('@')) break;
    lines.push(t);
  }
  const field = (label: string) => {
    const l = lines.find(x => x.startsWith('# ' + label));
    return l ? l.slice(label.length + 2).trim() || null : null;
  };
  let banner: RegExpMatchArray | null = null;
  for (const l of lines) if ((banner = l.match(/^#\s*:-\) GROMACS - (.+?), (\S+) \(-:\s*$/))) break;
  if (!banner) return null;
  // The command is the lines after "# Command line:" that start "#" plus two or more spaces.
  const at = lines.indexOf('# Command line:'), cmd: string[] = [];
  for (let i = at + 1; at >= 0 && i < lines.length && /^# {2,}\S/.test(lines[i]); i++) cmd.push(lines[i].slice(1).trim());
  return {
    version: banner[2], tool: banner[1],
    command: cmd.join(' ') || null,
    workdir: field('Working dir:'),
    created: field('This file was created'),
    executable: field('Executable:'),
  };
}
