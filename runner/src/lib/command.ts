// The command as shown (T25): `cd <working dir>`, then the exact argv, quoted for a POSIX shell (sh, bash,
// zsh) so a paste runs the same thing. Display only: gmx itself is always started without a shell.

const PLAIN = /^[A-Za-z0-9_\-+.,/:@]+$/;

export const shellQuote = (arg: string) => (PLAIN.test(arg) ? arg : "'" + arg.replace(/'/g, "'\\''") + "'");

export interface Command { cwd: string; file: string; args: string[] }

export const commandText = (c: Command) => 'cd ' + shellQuote(c.cwd) + '\n' + [c.file, ...c.args].map(shellQuote).join(' ');
