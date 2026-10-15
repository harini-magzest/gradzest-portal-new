import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';

// An element that only has an onClick (a <div>, <span>, <tr> …) cannot be reached or used from the keyboard, and a screen
// reader does not announce it as something to press. Anything clickable must either be a real <button>/<a>, or say what it
// is (role) and be operable without a mouse (a key handler). A backdrop that merely closes a dialog on click says
// role="presentation": the dialog has its own close button and Escape.
//
// This reads every component's JSX, so a new offender anywhere in src/ fails here with its file and line.

const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const STATIC_TAGS = new Set(['div', 'span', 'li', 'tr', 'td', 'th', 'p', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'ul', 'ol', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tbody', 'form', 'figure', 'svg']);

export function unreachableClickables(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const opening = ts.isJsxElement(n) ? n.openingElement : n;
      const tag = opening.tagName.getText(sf);
      const names = new Set(opening.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(sf)));
      const spread = opening.attributes.properties.some(ts.isJsxSpreadAttribute);
      if (STATIC_TAGS.has(tag) && names.has('onClick') && !names.has('role') && !spread
        && !names.has('onKeyDown') && !names.has('onKeyUp') && !names.has('onKeyPress')) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        out.push(`${file}:${line + 1} <${tag}> has onClick but no role and no key handler`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('nothing clickable is out of reach of the keyboard', () => {
  it('finds no <div onClick> without a role or a key handler anywhere in src/', () => {
    const problems = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx$/.test(path))
      .flatMap(([path, text]) => unreachableClickables(path, text));
    expect(problems).toEqual([]);
  });

  it('notices one (the check itself works)', () => {
    expect(unreachableClickables('a.tsx', 'export const A = () => <div onClick={() => {}}>x</div>;')).toHaveLength(1);
    expect(unreachableClickables('a.tsx', 'export const A = () => <div role="presentation" onClick={() => {}} />;')).toEqual([]);
    expect(unreachableClickables('a.tsx', 'export const A = () => <div tabIndex={0} onKeyDown={k} onClick={() => {}} />;')).toEqual([]);
    expect(unreachableClickables('a.tsx', 'export const A = () => <button onClick={() => {}}>x</button>;')).toEqual([]);
  });
});
