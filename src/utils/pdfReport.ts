import jsPDF from 'jspdf';

type RGB = [number, number, number];

/**
 * Shared scaffolding for the branded PDF reports used across the staff dashboards
 * (header banner, section headers, label/value rows, list rows, page footer).
 * Extracted from the report generator in AppTeamApplications.tsx so new report
 * types don't re-implement the same jsPDF layout math.
 */
export function createPdfReport(opts: { title: string; accent: RGB; footerLabel: string }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  const addPage = () => { doc.addPage(); y = 18; };
  const checkY = (needed: number) => { if (y + needed > 275) addPage(); };

  doc.setFillColor(...opts.accent);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(opts.title, margin, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, margin, 24);
  y = 46;

  const sectionTitle = (title: string) => {
    checkY(14);
    doc.setFillColor(245, 243, 255);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...opts.accent);
    doc.text(title, margin + 3, y + 5.5);
    y += 12;
  };

  const row = (label: string, value: string) => {
    if (!value || value === '—') return;
    checkY(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 140);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, contentW - 4);
    doc.text(lines, margin, y + 5);
    y += 5 + lines.length * 5 + 3;
  };

  const twoCol = (l1: string, v1: string, l2: string, v2: string) => {
    checkY(14);
    const colW = contentW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 140);
    doc.text(l1.toUpperCase(), margin, y);
    doc.text(l2.toUpperCase(), margin + colW, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(v1 || '—', margin, y + 5);
    doc.text(v2 || '—', margin + colW, y + 5);
    y += 14;
  };

  const emptyNote = (text: string) => {
    checkY(10);
    doc.setFontSize(10);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'italic');
    doc.text(text, margin, y);
    y += 10;
  };

  /** A zebra-striped row: a bold title + grey subtitle on the left, a colored label on the right. */
  const listRow = (title: string, subtitle: string, rightLabel: string, rightColor: RGB, index: number) => {
    checkY(12);
    const bg: RGB = index % 2 === 0 ? [250, 248, 255] : [255, 255, 255];
    doc.setFillColor(...bg);
    doc.rect(margin, y - 3, contentW, 11, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(title, margin + 3, y + 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 120);
    doc.text(subtitle, margin + 3, y + 8.5);
    doc.setTextColor(...rightColor);
    doc.text(rightLabel, pageW - margin - 3, y + 3.5, { align: 'right' });
    y += 12;
  };

  const save = (filename: string) => {
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(245, 243, 255);
      doc.rect(0, 288, pageW, 9, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 100, 160);
      doc.text(`Gradzest — ${opts.footerLabel}`, margin, 294);
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, 294, { align: 'right' });
    }
    doc.save(filename);
  };

  return { sectionTitle, row, twoCol, emptyNote, listRow, save };
}
