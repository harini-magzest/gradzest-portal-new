import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StudentCountryDetail from './StudentCountryDetail';

vi.mock('../../api', () => ({
  api: {
    countries: { list: vi.fn() },
    universities: { list: vi.fn() },
    students: { me: vi.fn() },
    onboarding: { markStep: vi.fn() },
  },
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 's1', role: 'student', name: 'Test Student' } }),
}));
// The flag component loads images; a placeholder keeps the test about this page
vi.mock('../../components/CountryFlag', () => ({ CountryFlag: ({ name }: { name: string }) => <span>flag of {name}</span> }));

import { api } from '../../api';

const COUNTRIES = [
  { id: 'c1', code: 'NZ', name: 'New Zealand', capital: 'Wellington', region: 'Oceania',
    visa: { type: 'Student Visa', processingTime: '1–3 months', documents: ['Offer of place'] },
    costs: { tuitionRange: 'NZD 22,000–35,000 / year' } },
  { id: 'c2', code: 'DE', name: 'Germany' },
];
const UNIS = [
  { id: 'u1', name: 'University of Auckland', city: 'Auckland', country: 'New Zealand', ranking: 65, courses: [] },
  { id: 'u2', name: 'University of Otago', city: 'Dunedin', country: 'New Zealand', ranking: 206, courses: [] },
  { id: 'u3', name: 'TU Munich', city: 'Munich', country: 'Germany', ranking: 28, courses: [] },
];

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/student/countries/:countryId" element={<StudentCountryDetail />} /></Routes>
  </MemoryRouter>,
);

describe('StudentCountryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.countries.list as any).mockResolvedValue(COUNTRIES);
    (api.universities.list as any).mockResolvedValue(UNIS);
    (api.students.me as any).mockResolvedValue({ id: 's1', role: 'student' });
  });

  it("shows the country's details and only its universities, best ranked first", async () => {
    renderAt('/student/countries/NZ');

    expect(await screen.findByRole('heading', { name: 'New Zealand' })).toBeInTheDocument();
    expect(screen.getByText('Wellington')).toBeInTheDocument();
    expect(screen.getByText('Offer of place')).toBeInTheDocument();
    expect(screen.getByText('2 listed')).toBeInTheDocument();

    const names = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(names).toEqual(['University of Auckland', 'University of Otago']);
    expect(screen.queryByText('TU Munich')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Universities' })).toHaveAttribute('href', '/student/universities?country=New%20Zealand');
  });

  it('searches within the country', async () => {
    renderAt('/student/countries/NZ');
    await screen.findByText('University of Auckland');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search universities' }), 'dunedin');
    await waitFor(() => expect(screen.queryByText('University of Auckland')).not.toBeInTheDocument());
    expect(screen.getByText('University of Otago')).toBeInTheDocument();
  });

  it('says so when a country has no universities listed', async () => {
    (api.universities.list as any).mockResolvedValue([]);
    renderAt('/student/countries/DE');
    expect(await screen.findByText('No universities in Germany are listed yet.')).toBeInTheDocument();
  });

  it('handles an unknown country and a failed load', async () => {
    renderAt('/student/countries/XX');
    expect(await screen.findByText("We couldn't find that country.")).toBeInTheDocument();
  });

  it('offers Retry when loading fails', async () => {
    (api.countries.list as any).mockRejectedValueOnce(new Error('down'));
    renderAt('/student/countries/NZ');
    expect(await screen.findByText('Failed to load this country.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'New Zealand' })).toBeInTheDocument();
  });
});
