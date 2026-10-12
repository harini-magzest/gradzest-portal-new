const { gatherFacts, templateDraft } = require('../lib/followupDraft');

const now = new Date('2026-10-05T00:00:00Z').getTime();
const student = {
  name: 'Asha Kumar', leadStage: 'counselling', leadStageChangedAt: new Date('2026-09-20T00:00:00Z'), preferredCountries: ['UK', 'Canada'],
  applications: [{ universityName: 'Test University', courseName: 'MSc Data', status: 'under_review' }, { universityName: 'Old Uni', status: 'rejected' }],
};
const checklist = { items: [{ label: 'Passport', status: 'verified' }, { label: 'Statement of purpose', status: 'missing' }, { label: 'Proof of funds', status: 'requested' }, { label: 'CV', status: 'missing' }, { label: 'LOR', status: 'missing' }] };

describe('gatherFacts', () => {
  it('collects what the draft may mention, and nothing else', () => {
    const f = gatherFacts(student, checklist, now);
    expect(f).toMatchObject({ firstName: 'Asha', stageLabel: 'Counselling', daysIdle: 15, countries: ['UK', 'Canada'] });
    expect(f.applications).toEqual([{ university: 'Test University', course: 'MSc Data', status: 'Under Review' }]); // the rejected one is left out
    expect(f.missingDocuments).toEqual(['Statement of purpose', 'Proof of funds', 'CV']); // capped at three, verified ones skipped
    expect(JSON.stringify(f)).not.toMatch(/@|phone|passport number/i);
  });
  it('copes with a bare record', () => {
    expect(gatherFacts({ name: '' }, null, now)).toMatchObject({ firstName: 'there', stage: 'new_enquiry', applications: [], missingDocuments: [] });
  });
});

describe('templateDraft', () => {
  const f = gatherFacts(student, checklist, now);
  it('writes an email with a subject, the real next step and a signature', () => {
    const d = templateDraft(f, 'email', 'Ravi');
    expect(d.subject).toContain('Asha');
    expect(d.body).toContain('Hi Asha');
    expect(d.body).toContain('Test University (MSc Data) is under review');
    expect(d.body).toContain('Statement of purpose, Proof of funds and CV');
    expect(d.body).toContain('Ravi');
  });
  it('writes a short WhatsApp message with no subject', () => {
    const d = templateDraft(f, 'whatsapp', 'Ravi');
    expect(d.subject).toBe('');
    expect(d.body.length).toBeLessThan(500);
    expect(d.body).not.toContain('\n');
  });
  it('falls back to a general check-in with no applications or documents outstanding', () => {
    const d = templateDraft(gatherFacts({ name: 'Sam' }, { items: [] }, now), 'email');
    expect(d.body).toContain('anything holding you back');
  });
});
