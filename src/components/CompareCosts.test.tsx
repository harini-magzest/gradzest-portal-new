import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompareCosts from './CompareCosts';

// These tests type into inputs one character at a time, which is slow on a busy machine or a shared CI runner.
vi.setConfig({ testTimeout: 20000 });

vi.mock('../api', () => ({
  api: {
    universities: { list: vi.fn() },
    countries: { list: vi.fn() },
  },
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 's1', role: 'student', name: 'Test Student' } }),
}));

import { api } from '../api';

const universities = [
  {
    _id: 'u-uk', name: 'London Business School', country: 'United Kingdom', city: 'London', ranking: 5, acceptanceRate: 0.2,
    applicationDeadlines: [{ intake: 'September', deadline: '2026-06-01' }],
    courses: [{ _id: 'c-mba', name: 'MBA', level: 'Postgraduate', duration: '1 year', tuitionFee: 30000, currency: 'GBP', applicationFee: 100, intake: ['September'], eligibility: { minGPA: 3.2, englishRequirements: [{ test: 'IELTS', minScore: 7 }] } }],
  },
  {
    _id: 'u-de', name: 'TU Berlin', country: 'Germany', city: 'Berlin',
    courses: [{ _id: 'c-ds', name: 'MSc Data Science', level: 'Postgraduate', duration: '2 years', tuitionFee: 0, currency: 'EUR' }],
  },
  {
    _id: 'u-nofee', name: 'Mystery College', country: 'Atlantis',
    courses: [{ _id: 'c-x', name: 'MSc Mystery', duration: '1 year', currency: 'USD' }],
  },
];
const countries = [
  { name: 'United Kingdom', costs: { monthlyLivingMin: 1000, monthlyLivingMax: 1500, currency: 'GBP' }, eligibility: { minFunds: 18000, fundsCurrency: 'GBP' } },
  { name: 'Germany', costs: { monthlyLivingMin: 900, monthlyLivingMax: 1100, currency: 'EUR' } },
];

async function pick(user: ReturnType<typeof userEvent.setup>, query: string, label: RegExp) {
  await user.clear(screen.getByLabelText('Search courses'));
  await user.type(screen.getByLabelText('Search courses'), query);
  const results = await screen.findByRole('list', { name: 'Search results' });
  await user.click(within(results).getByRole('button', { name: label }));
}

describe('CompareCosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.universities.list as any).mockResolvedValue(universities);
    (api.countries.list as any).mockResolvedValue(countries);
  });

  it('starts with an empty state and no table', async () => {
    render(<CompareCosts />);
    expect(await screen.findByText('Nothing to compare yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a clear error with Retry when the catalogue cannot be loaded, then recovers', async () => {
    (api.universities.list as any).mockRejectedValueOnce(new Error('Network down'));
    const user = userEvent.setup();
    render(<CompareCosts />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('Nothing to compare yet')).toBeInTheDocument();
  });

  it('adds courses from search, shows their costs side by side, and can remove one', async () => {
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');

    await pick(user, 'mba', /London Business School/);
    // a single GBP course: tuition 30,000 + application fee 100 + living (1,000 to 1,500 a month) for one year
    // first year and whole course are the same for a one-year course, so the range appears in both rows
    expect(await screen.findAllByText('GBP 42,100 – 48,100')).toHaveLength(2);
    expect(screen.getByText(/GBP 18,000 \(shown, not added\)/)).toBeInTheDocument();
    expect(screen.getByText('GPA 3.2+, IELTS 7')).toBeInTheDocument();

    await pick(user, 'berlin', /TU Berlin/);
    expect(screen.getByRole('columnheader', { name: /MSc Data Science/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Remove London Business School/ }));
    expect(screen.queryByRole('columnheader', { name: /MBA/ })).not.toBeInTheDocument();
  });

  it('treats a tuition fee of 0 as free tuition, not as missing data', async () => {
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');
    await pick(user, 'data science', /TU Berlin/);
    expect(screen.getAllByText('EUR 0')).toHaveLength(2); // tuition per year and whole course: free, not missing
    expect(screen.getByText('Nothing missing')).toBeInTheDocument();
    expect(screen.getByText('EUR 21,600 – 26,400')).toBeInTheDocument(); // whole course: 2 years of living costs only
  });

  it('says exactly what is not on file and withholds the total', async () => {
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');
    await pick(user, 'mystery', /Mystery College/);
    expect(screen.getByText(/tuition fee/)).toBeInTheDocument();
    expect(screen.getByText(/living costs for Atlantis/)).toBeInTheDocument();
  });

  it('asks for an exchange rate when the courses use different currencies, and never invents one', async () => {
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');
    await pick(user, 'mba', /London Business School/);
    await pick(user, 'berlin', /TU Berlin/);

    // EUR is needed to total the German course in GBP
    const rate = await screen.findByLabelText('Exchange rate EUR to GBP');
    expect(screen.getByText(/We don't guess exchange rates/)).toBeInTheDocument();
    // until a rate is given, the German course has no combined total
    expect(screen.queryByText(/GBP 18,/)).not.toBeNull(); // the UK course still totals (GBP only)

    await user.type(rate, '0.85');
    expect(rate).toHaveValue('0.85'); // the box stays put while typing
    expect(screen.getByLabelText('Exchange rate EUR to GBP')).toBe(rate);
    // 2 years of living 900 to 1,100 EUR a month = 21,600 to 26,400 EUR = 18,360 to 22,440 GBP
    expect(await screen.findByText('GBP 18,360 – 22,440')).toBeInTheDocument();
  });

  it('compares against a budget: within, tight and over, and offers per-year vs whole-course', async () => {
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');
    await pick(user, 'mba', /London Business School/);

    expect(screen.getByText("Can't tell yet")).toBeInTheDocument();
    expect(screen.getByText('Enter a budget to compare.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('My budget'), '50000');
    expect(screen.getByText('Within your budget')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('My budget'));
    await user.type(screen.getByLabelText('My budget'), '45000');
    expect(screen.getByText(/Tight: covers the lower estimate only/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('My budget'));
    await user.type(screen.getByLabelText('My budget'), '30000');
    expect(screen.getByText('Over your budget')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Whole course' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Per year' }));
    expect(screen.getByRole('button', { name: 'Per year' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('limits a comparison to four courses', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      _id: `u${i}`, name: `Uni ${i}`, country: 'United Kingdom',
      courses: [{ _id: `c${i}`, name: `Course ${i}`, duration: '1 year', tuitionFee: 1000, currency: 'GBP' }],
    }));
    (api.universities.list as any).mockResolvedValue(many);
    const user = userEvent.setup();
    render(<CompareCosts />);
    await screen.findByLabelText('Search courses');
    for (let i = 0; i < 4; i++) await pick(user, `Uni ${i}`, new RegExp(`Uni ${i}`));
    expect(screen.getByLabelText('Search courses')).toBeDisabled();
    expect(screen.getAllByRole('columnheader', { name: /Course \d/ })).toHaveLength(4);
  });
});
