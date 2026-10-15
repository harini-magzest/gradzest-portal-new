// The Students list reads one page at a time from the server (GET /api/admin/students?page=…), which does the
// filtering, sorting and counting the page used to do over every student in the browser.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AdminStudents from './AdminStudents';
import { exportRowsToCsv } from '../../utils/exportCsv';

const admin = vi.hoisted(() => ({
  studentsPage: vi.fn(), studentIds: vi.fn(), studentsExport: vi.fn(), counselors: vi.fn(), students: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  // the student page opened from the list: only its first render matters here
  api: { admin, students: { get: vi.fn(() => new Promise(() => {})) }, universities: { list: vi.fn(() => new Promise(() => {})) } },
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', role: 'admin', name: 'Admin' } }) }));
vi.mock('../../hooks/usePortalName', () => ({ usePortalName: () => ({ portal: 'Admin Portal' }) }));
vi.mock('../../utils/exportCsv', () => ({ exportRowsToCsv: vi.fn() }));

const asha = { id: 's1', name: 'Asha Rao', email: 'asha@example.com', status: 'counseling', joinedDate: '2025-05-01', counselorId: 'c1' };
const page = (over = {}) => ({
  items: [asha], total: 60, page: 1, limit: 25,
  counts: { total: 60, active: 50, inactive: 4, enrolled: 6, unassigned: 3, newLeads: 2 },
  countries: ['Canada', 'UK'],
  ...over,
});

let where = { pathname: '', state: null as any };
function Location() {
  const l = useLocation();
  where = { pathname: l.pathname, state: l.state };
  return null;
}
const renderPage = () => render(<MemoryRouter initialEntries={['/admin/students']}><AdminStudents /><Location /></MemoryRouter>);
const lastQuery = () => admin.studentsPage.mock.calls[admin.studentsPage.mock.calls.length - 1][0];

beforeEach(() => {
  vi.clearAllMocks();
  admin.studentsPage.mockResolvedValue(page());
  admin.counselors.mockResolvedValue([{ id: 'c1', name: 'Meera' }]);
});

describe('AdminStudents', () => {
  it('shows the server\'s page, its totals and the countries to filter by, and never loads every student', async () => {
    renderPage();
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ page: 1, limit: 25 });
    expect(screen.getByText(/Showing 1–25 of 60/)).toBeInTheDocument();
    expect(screen.getAllByText('50').some((el) => el.tagName === 'P')).toBe(true); // the Active tile
    expect(screen.getByText('2 new leads')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Canada' })).toBeInTheDocument();
    expect(admin.students).not.toHaveBeenCalled();
  });

  it('asks the server for a search, from the first page', async () => {
    renderPage();
    await screen.findByText('Asha Rao');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    fireEvent.change(screen.getByPlaceholderText('Search by name, email, phone...'), { target: { value: 'ravi' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Search by name, email, phone...'), { key: 'Enter' });
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'ravi', page: 1 }));
  });

  it('only the newest answer fills the table', async () => {
    let answerSlow: (v: any) => void = () => {};
    renderPage();
    await screen.findByText('Asha Rao');
    admin.studentsPage
      .mockImplementationOnce(() => new Promise((resolve) => { answerSlow = resolve; }))
      .mockResolvedValueOnce(page({ items: [{ ...asha, id: 's3', name: 'Page Three' }], page: 3 }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(await screen.findByText('Page Three')).toBeInTheDocument();
    answerSlow(page({ items: [{ ...asha, id: 's2', name: 'Page Two' }], page: 2 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Page Two')).not.toBeInTheDocument();
  });

  it('exports every match, not just the page on screen', async () => {
    admin.studentsExport.mockResolvedValue({ items: [asha, { id: 's9', name: 'Zed', status: 'enrolled' }] });
    renderPage();
    await screen.findByText('Asha Rao');
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(exportRowsToCsv).toHaveBeenCalled());
    expect(admin.studentsExport.mock.calls[0][0]).not.toHaveProperty('page');
    const rows = (exportRowsToCsv as any).mock.calls[0][1];
    expect(rows.map((r: any) => r.Name)).toEqual(['Asha Rao', 'Zed']);
    expect(rows[0].Counselor).toBe('Meera');
  });

  it('opens a student with every match\'s id, so ‹ › can step past this page', async () => {
    admin.studentIds.mockResolvedValue({ ids: ['s1', 's2', 's3'] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Asha Rao' }));
    await waitFor(() => expect(where.pathname).toBe('/admin/students/s1'));
    expect(where.state).toEqual({ ids: ['s1', 's2', 's3'] });
    expect(admin.studentIds.mock.calls[0][0]).toMatchObject({ from: '2025-01-01' });
  });
});
