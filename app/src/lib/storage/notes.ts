// Notes are Markdown files in the visible tree (spec §6), with minimal
// frontmatter: id, type, owner (+ column for cell notes). Broken or missing
// frontmatter is tolerated; the note is identified by its location.

export type NoteType = 'row-note' | 'cell-note' | 'project-note' | 'column-note' | 'analysis-note';

export interface NoteMeta { id?: string; type?: NoteType; owner?: string; column?: string }

export interface ParsedNote { meta: NoteMeta; text: string; hadFrontmatter: boolean }

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseNote(raw: string): ParsedNote {
  const m = FM.exec(raw);
  let body = raw, meta: NoteMeta = {}, had = false;
  if (m) {
    had = true;
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
      if (!kv) continue;
      const [, k, v] = kv;
      if (k === 'id' || k === 'type' || k === 'owner' || k === 'column') (meta as Record<string, string>)[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  // The file always ends with one newline the app adds; strip exactly that one.
  if (body.endsWith('\n')) body = body.slice(0, -1);
  return { meta, text: body, hadFrontmatter: had };
}

export function formatNote(meta: Required<Pick<NoteMeta, 'id' | 'type' | 'owner'>> & { column?: string }, text: string): string {
  const lines = ['---', 'id: ' + meta.id, 'type: ' + meta.type, 'owner: ' + meta.owner];
  if (meta.column) lines.push('column: ' + meta.column);
  lines.push('---');
  return lines.join('\n') + '\n' + text + '\n';
}

/** Does the frontmatter on disk already say exactly this? (decides whether a save repairs it) */
export function metaMatches(a: NoteMeta, b: NoteMeta): boolean {
  return a.id === b.id && a.type === b.type && a.owner === b.owner && (a.column || '') === (b.column || '');
}
