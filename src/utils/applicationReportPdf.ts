import { loadPdfReport } from './loadPdfReport';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
  offer_received: 'Offer Received', accepted: 'Accepted', rejected: 'Rejected', enrolled: 'Enrolled',
};

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/**
 * Generates and downloads a "Student Application Report" PDF. `student` and `counselor`
 * are optional, fuller records to pull extra detail (GPA, documents, counselor email) from
 * when the caller has them; the application's own denormalized fields are used otherwise.
 */
export async function downloadApplicationReportPdf(application: any, opts?: { student?: any; counselor?: any }) {
  const createPdfReport = await loadPdfReport();
  if (!createPdfReport) return;
  const student = opts?.student;
  const counselor = opts?.counselor || application._counselor;
  const studentSummary = application._student || student || {};

  const r = createPdfReport({
    title: 'Student Application Report',
    accent: [59, 7, 100],
    footerLabel: 'Student Application Report',
  });

  r.sectionTitle('Student Profile');
  r.twoCol('Full Name', studentSummary.name || application.studentName || '—', 'Email', studentSummary.email || application.studentEmail || '—');
  r.twoCol('Nationality', studentSummary.nationality || student?.nationality || '—', 'Education Level', student?.educationLevel || '—');
  r.twoCol(
    'GPA', student?.gpa ? `${student.gpa} / 4.0` : '—',
    'English Score', student?.englishScore ? `${student.englishScore.type} ${student.englishScore.score}` : '—',
  );
  r.twoCol(
    'Budget', student?.budget ? `$${Number(student.budget).toLocaleString()}` : '—',
    'Preferred Countries', (student?.preferredCountries || []).join(', ') || '—',
  );

  r.sectionTitle('Application Details');
  r.twoCol('University', application.universityName || '—', 'Course', application.courseName || '—');
  r.twoCol('Intake', application.intake || '—', 'Application Status', STATUS_LABELS[application.status] || application.status || '—');
  r.twoCol('Submitted', fmtDate(application.submittedDate || application.createdAt), 'Last Updated', fmtDate(application.updatedDate || application.updatedAt));
  if (application.notes || application.processingNotes) {
    r.row('Processing Notes', application.notes || application.processingNotes);
  }

  r.sectionTitle('Assigned Counselor');
  if (counselor) {
    r.twoCol('Name', counselor.name || '—', 'Email', counselor.email || '—');
    if (counselor.specialty) r.row('Specialty', counselor.specialty);
  } else {
    r.emptyNote('No counselor assigned');
  }

  const docs = student?.documents || [];
  r.sectionTitle(`Documents (${docs.length})`);
  if (!docs.length) {
    r.emptyNote('No documents uploaded');
  } else {
    docs.forEach((d: any, i: number) => {
      const statusLabel = d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : d.url ? 'Uploaded' : 'Missing';
      r.listRow(d.name || 'Document', d.type || '', statusLabel, d.url ? [22, 163, 74] : [160, 160, 160], i);
    });
  }

  const safeName = (studentSummary.name || application.studentName || 'student').replace(/\s+/g, '_');
  r.save(`${safeName}_application_report.pdf`);
}
