import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NextStepCard from './NextStepCard';
import DataAccessLog from './DataAccessLog';
import StudentShortlist from '../../pages/student/StudentShortlist';

vi.mock('../../api', () => ({
  api: {
    students: {
      nextStep: vi.fn(), dataAccess: vi.fn(), shortlist: vi.fn(),
      addToShortlist: vi.fn(), removeFromShortlist: vi.fn(),
    },
  },
}));
import { api } from '../../api';

const course = (over: any = {}) => ({
  universityId: 'u1', courseId: 'c1', universityName: 'Maple University', country: 'Canada', city: 'Toronto', logo: '',
  ranking: 40, courseName: 'MSc Data Science', level: 'Master', duration: '2 years', tuitionFee: 20000, currency: 'CAD',
  applicationFee: 100, intake: ['September'], scholarshipAvailable: true, scholarshipAmount: '$2000', minGPA: 3,
  englishRequirements: [{ test: 'IELTS', minScore: 6.5 }], addedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('NextStepCard', () => {
  it('shows the step and links to where to act on it', async () => {
    (api.students.nextStep as any).mockResolvedValue({ kind: 'upload_document', title: 'Upload your passport', detail: '2 documents are still needed.', action: { label: 'Upload now', to: '/student/profile' } });
    render(<MemoryRouter><NextStepCard /></MemoryRouter>);
    expect(await screen.findByText('Upload your passport')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload now/i })).toHaveAttribute('href', '/student/profile');
  });

  it('renders nothing when the step cannot be loaded', async () => {
    (api.students.nextStep as any).mockRejectedValue(new Error('down'));
    const { container } = render(<MemoryRouter><NextStepCard /></MemoryRouter>);
    await waitFor(() => expect(api.students.nextStep).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DataAccessLog', () => {
  it('says so when nobody has looked', async () => {
    (api.students.dataAccess as any).mockResolvedValue({ accesses: [] });
    render(<DataAccessLog />);
    expect(await screen.findByText(/nobody has viewed your details yet/i)).toBeInTheDocument();
  });

  it('lists who looked, and folds a long list behind "Show all"', async () => {
    const accesses = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, at: new Date(2026, 0, i + 1).toISOString(), role: 'counselor', name: `Asha ${i}`, kind: 'view' }));
    (api.students.dataAccess as any).mockResolvedValue({ accesses });
    render(<DataAccessLog />);
    expect(await screen.findByText('Asha 0')).toBeInTheDocument();
    expect(screen.queryByText('Asha 6')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all 7/i }));
    expect(screen.getByText('Asha 6')).toBeInTheDocument();
  });

  it('shows an error instead of failing silently', async () => {
    (api.students.dataAccess as any).mockRejectedValue(new Error('boom'));
    render(<DataAccessLog />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});

describe('StudentShortlist', () => {
  it('invites the student to save courses when the list is empty', async () => {
    (api.students.shortlist as any).mockResolvedValue({ courses: [], cheapest: null, bestRanked: null, max: 12 });
    render(<MemoryRouter><StudentShortlist /></MemoryRouter>);
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse courses/i })).toHaveAttribute('href', '/student/courses');
  });

  it('compares saved courses side by side, flags the cheapest and best ranked, and removes one', async () => {
    const a = course();
    const b = course({ universityId: 'u2', courseId: 'c2', universityName: 'Oak College', courseName: 'MBA', tuitionFee: 30000, ranking: 10 });
    (api.students.shortlist as any).mockResolvedValue({ courses: [a, b], cheapest: 'u1:c1', bestRanked: 'u2:c2', max: 12 });
    (api.students.removeFromShortlist as any).mockResolvedValue({ courses: [b], cheapest: 'u2:c2', bestRanked: 'u2:c2', max: 12 });

    render(<MemoryRouter><StudentShortlist /></MemoryRouter>);
    expect(await screen.findByText('MSc Data Science')).toBeInTheDocument();
    expect(screen.getByText('MBA')).toBeInTheDocument();
    expect(screen.getByText('Lowest fee')).toBeInTheDocument();
    expect(screen.getByText('Best ranked')).toBeInTheDocument();
    expect(screen.getByText('CAD 20,000')).toBeInTheDocument();
    expect(screen.getAllByText('IELTS 6.5')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /remove msc data science from shortlist/i }));
    expect(api.students.removeFromShortlist).toHaveBeenCalledWith('u1', 'c1');
    await waitFor(() => expect(screen.queryByText('MSc Data Science')).not.toBeInTheDocument());
  });
});
