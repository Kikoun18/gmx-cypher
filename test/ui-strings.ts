// The text the page can show, read with TypeScript's own parser (not regexes, which would also match comments):
// every string literal, template text and JSX text in src/ and server/ (R3a and the contract's other word checks).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { RUNNER } from './helpers';

export interface UiString { file: string; line: number; text: string }

/** The strings of one source text. */
export function stringsOf(file: string, text: string): UiString[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS), out: UiString[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n))
      out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: n.text });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });

/** Every string in the runner's page and server sources, with its file relative to the runner. */
export const uiStrings = (): UiString[] => ['src', 'server'].flatMap(d => walk(RUNNER + d)).flatMap(f => stringsOf(f.slice(RUNNER.length), readFileSync(f, 'utf8')));
