import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const report = vi.hoisted(() => ({ options: [] as any[], save: vi.fn() }));

// A stand-in for the real report builder (jsPDF is not needed to check what gets asked of it)
vi.mock('./pdfReport', () => ({
  createPdfReport: (options: unknown) => {
    report.options.push(options);
    return new Proxy({}, { get: (_target, key) => (key === 'save' ? report.save : vi.fn()) });
  },
}));

import { downloadStudentProfilePdf } from './studentProfilePdf';
import { downloadApplicationReportPdf } from './applicationReportPdf';

describe('PDF downloads', () => {
  beforeEach(() => { report.options.length = 0; report.save.mockReset(); });

  it('builds the student profile report and saves it under the student\'s name', async () => {
    await downloadStudentProfilePdf({ name: 'Ada Lovelace', email: 'ada@example.com', documents: [] });
    expect(report.options[0]).toMatchObject({ title: 'Student Profile Report' });
    expect(report.save).toHaveBeenCalledWith('Ada_Lovelace_profile_report.pdf');
  });

  it('builds the application report and saves it under the student\'s name', async () => {
    await downloadApplicationReportPdf({ studentName: 'Ada Lovelace', studentEmail: 'ada@example.com' });
    expect(report.options[0]).toMatchObject({ title: 'Student Application Report' });
    expect(report.save).toHaveBeenCalledWith('Ada_Lovelace_application_report.pdf');
  });
});

describe('PDF tools that fail to load', () => {
  const alert = vi.fn();
  beforeEach(() => { vi.resetModules(); alert.mockReset(); vi.stubGlobal('alert', alert); });
  afterEach(() => { vi.doUnmock('./pdfReport'); vi.unstubAllGlobals(); });

  it('tells the person instead of failing silently, and does not throw', async () => {
    vi.doMock('./pdfReport', () => { throw new Error('Failed to fetch dynamically imported module'); });
    const { downloadStudentProfilePdf: download } = await import('./studentProfilePdf');
    await expect(download({ name: 'Ada' })).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toMatch(/PDF tools/i);
  });
});

describe('the PDF library stays out of the page bundles', () => {
  // Vite inlines every source file as text here, so this reads the real import statements without touching the disk
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const importsPdfLibrary = /(?:from|import)\s*\(?\s*['"](?:jspdf|html2canvas)['"]|(?:from|import)\s+['"][^'"]*\/pdfReport['"]/;

  it('is imported statically only by the code that is itself loaded on demand', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .filter(([, text]) => importsPdfLibrary.test(text))
      .map(([path]) => path);
    // pdfReport.ts is the library wrapper (imports jspdf); nothing else may import it with a static `import … from`
    expect(offenders).toEqual(['/src/utils/pdfReport.ts']);
  });
});
