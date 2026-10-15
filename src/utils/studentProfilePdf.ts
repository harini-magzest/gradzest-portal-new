import { loadPdfReport } from './loadPdfReport';

/** Generates and downloads a one-page-plus "Student Profile Report" PDF for the given student record. */
export async function downloadStudentProfilePdf(student: any, opts?: { counselorName?: string; counselorEmail?: string }) {
  const createPdfReport = await loadPdfReport();
  if (!createPdfReport) return;
  const r = createPdfReport({
    title: 'Student Profile Report',
    accent: [59, 7, 100],
    footerLabel: 'Student Profile Report',
  });

  r.sectionTitle('Personal Details');
  r.twoCol('Full Name', student.name || '—', 'Email', student.email || '—');
  r.twoCol('Phone', student.phone || '—', 'Nationality', student.nationality || '—');
  r.twoCol('Status', student.status || '—', 'Joined Date', student.joinedDate || '—');

  r.sectionTitle('Academic Profile');
  r.twoCol('Education Level', student.educationLevel || '—', 'GPA', student.gpa ? `${student.gpa} / 4.0` : '—');
  r.twoCol(
    'English Test', student.englishScore ? `${student.englishScore.type} ${student.englishScore.score}` : '—',
    'Budget', student.budget ? `$${Number(student.budget).toLocaleString()} / yr` : '—',
  );
  r.row('Preferred Countries', (student.preferredCountries || []).join(', '));
  r.row('Interested Courses', (student.interestedCourses || []).join(', '));

  r.sectionTitle('Assigned Counselor');
  if (opts?.counselorName) {
    r.twoCol('Name', opts.counselorName, 'Email', opts.counselorEmail || '—');
  } else {
    r.emptyNote('No counselor assigned');
  }

  const apps = student.applications || [];
  r.sectionTitle(`Applications (${apps.length})`);
  if (!apps.length) {
    r.emptyNote('No applications yet');
  } else {
    apps.forEach((a: any, i: number) => {
      r.listRow(
        a.universityName || 'Application',
        [a.courseName, a.intake].filter(Boolean).join(' · '),
        a.status || '—',
        [88, 28, 135],
        i,
      );
    });
  }

  const docs = student.documents || [];
  r.sectionTitle(`Documents (${docs.length})`);
  if (!docs.length) {
    r.emptyNote('No documents uploaded');
  } else {
    docs.forEach((d: any, i: number) => {
      const statusLabel = d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : d.url ? 'Uploaded' : 'Missing';
      r.listRow(d.name || 'Document', d.type || '', statusLabel, d.url ? [22, 163, 74] : [160, 160, 160], i);
    });
  }

  const safeName = (student.name || 'student').replace(/\s+/g, '_');
  r.save(`${safeName}_profile_report.pdf`);
}
