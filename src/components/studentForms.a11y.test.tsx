import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as ts from 'typescript';

// A <label> that is not tied to its control gives a screen reader nothing to announce for the field, and clicking the
// label does not focus it. These forms are the ones students fill in, so every label in them must be tied. The check
// below reads each file's JSX, so it covers every step of the wizards and the fields that only exist in edit mode.

const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const GUARDED = [
  '/src/components/ApplicationModal.tsx',
  '/src/pages/student/StudentProfile.tsx',
  '/src/pages/Login.tsx',
  '/src/pages/ForgotPassword.tsx',
  '/src/pages/ResetPassword.tsx',
  '/src/components/AuthModal.tsx',
];

const NATIVE = new Set(['input', 'select', 'textarea']);

function problems(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isJsx = (n: ts.Node): n is ts.JsxElement | ts.JsxSelfClosingElement => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
  const tag = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText(sf);
  const attr = (n: ts.JsxElement | ts.JsxSelfClosingElement, name: string) => {
    const props = ts.isJsxElement(n) ? n.openingElement.attributes.properties : n.attributes.properties;
    const a = props.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === name) as ts.JsxAttribute | undefined;
    return a?.initializer ? a.initializer.getText(sf) : undefined;
  };
  const firstControl = (root: ts.Node): ts.JsxElement | ts.JsxSelfClosingElement | null => {
    let found: ts.JsxElement | ts.JsxSelfClosingElement | null = null;
    const visit = (n: ts.Node) => {
      if (found) return;
      if (isJsx(n) && NATIVE.has(tag(n))) { found = n; return; }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return found;
  };
  const where = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  // every id that a native control in this file carries, as written in the source
  const controlIds = new Set<string>();
  const labels: ts.JsxElement[] = [];
  const collect = (n: ts.Node) => {
    if (isJsx(n) && NATIVE.has(tag(n))) { const id = attr(n, 'id'); if (id) controlIds.add(id); }
    if (ts.isJsxElement(n) && tag(n) === 'label') labels.push(n);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const out: string[] = [];
  for (const label of labels) {
    if (firstControl(label)) continue; // the label wraps its control: associated by nesting
    const htmlFor = attr(label, 'htmlFor');
    if (htmlFor) {
      if (!controlIds.has(htmlFor)) out.push(`line ${where(label)}: htmlFor=${htmlFor} matches no control's id`);
      continue;
    }
    // no htmlFor: fine for a caption over display-only text, a problem if a control follows it
    const siblings = (ts.isJsxElement(label.parent) || ts.isJsxFragment(label.parent))
      ? label.parent.children.filter((c) => !(ts.isJsxText(c) && !c.getText(sf).trim())) : [];
    const next = siblings[siblings.indexOf(label) + 1];
    if (next && (isJsx(next) || ts.isJsxExpression(next)) && firstControl(next)) {
      out.push(`line ${where(label)}: a label is followed by a form control but not tied to it (add htmlFor and an id)`);
    }
  }
  return out;
}

describe('every label in the student forms is tied to its control', () => {
  for (const file of GUARDED) {
    it(file.replace('/src/', ''), () => {
      const text = sources[file];
      expect(text, `${file} not found`).toBeTruthy();
      expect(problems(file, text)).toEqual([]);
    });
  }

  it('notices a label that is not tied (the check itself works)', () => {
    const untied = `export const A = () => (<div><label className="x">Name</label><input type="text" /></div>);`;
    expect(problems('a.tsx', untied)).toHaveLength(1);
    const tied = `export const A = () => (<div><label htmlFor="n">Name</label><input id="n" /></div>);`;
    expect(problems('a.tsx', tied)).toEqual([]);
    const dangling = `export const A = () => (<div><label htmlFor="n">Name</label><input id="other" /></div>);`;
    expect(problems('a.tsx', dangling)).toHaveLength(1);
    const wrapped = `export const A = () => (<label>Name <input /></label>);`;
    expect(problems('a.tsx', wrapped)).toEqual([]);
  });
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 's1', role: 'student', name: 'Sam Student', email: 'sam@example.com', nationality: 'India' },
    refreshUser: vi.fn(),
  }),
}));
vi.mock('../api', () => ({ api: { applications: { create: vi.fn() } } }));

import ApplicationModal from './ApplicationModal';

describe('application form, first step', () => {
  it('has its personal-details fields named by their labels', () => {
    render(
      <MemoryRouter>
        <ApplicationModal
          course={{ id: 'c1', name: 'MSc Computer Science', level: 'Postgraduate' } as any}
          uni={{ id: 'u1', name: 'Test University' } as any}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/^Full Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Date of Birth/)).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText(/^Gender/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/^Passport Number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^City/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Country of Residence/)).toBeInTheDocument();
  });
});
